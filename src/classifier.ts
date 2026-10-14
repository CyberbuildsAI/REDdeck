// One classifier instead of thirty installers. It walks an extracted mod and maps every file to a
// path under the game folder. Files it cannot place are listed, never rejected, and a folder that
// looks like a set of options ("Option A", "Option B") is returned as a choice for the user.

import * as fs from "node:fs";
import * as path from "node:path";
import type { ModKind } from "./library";

export interface Placement {
  /** Absolute path of the file in the extracted folder. */
  from: string;
  /** Path under the game folder, forward slashes. */
  to: string;
  kind: ModKind;
}

export interface Classification {
  placements: Placement[];
  kinds: ModKind[];
  /** Top-level folders that each look like a complete alternative. Pick one and classify it alone. */
  options?: { label: string; folder: string }[];
  /** Files with no rule: nothing is done with them. */
  unplaced: string[];
  /** Readmes, screenshots and the like: skipped on purpose. */
  ignored: string[];
}

const IgnoredExtensions = new Set([".txt", ".md", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".url", ".html", ".htm", ".nfo", ".rtf", ".docx"]);
const KnownTop = new Set(["archive", "r6", "red4ext", "bin", "mods", "engine"]);
const FrameworkFiles = new Set(["red4ext.dll", "winmm.dll", "version.dll", "cyber_engine_tweaks.asi", "scc.exe", "redscript.toml"]);
/** RED4ext plugins that other mods depend on; they go in the Frameworks group. */
const FrameworkPlugins = new Set(["archivexl", "tweakxl", "codeware", "audioware", "input_loader", "mod_settings", "red4ext.sdk", "rednode"]);

function lower(s: string): string {
  return s.toLowerCase();
}

/** Maps a path whose segments contain a known game folder to its game path, or returns undefined. */
function knownPath(segments: string[]): { to: string; kind: ModKind } | undefined {
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = lower(segments[i]);
    if (!KnownTop.has(seg)) continue;
    const next = lower(segments[i + 1] ?? "");
    const rest = segments.slice(i).join("/");
    const file = lower(segments[segments.length - 1]);
    switch (seg) {
      case "archive":
        if (next === "pc" && lower(segments[i + 2] ?? "") === "mod") return { to: rest, kind: file.endsWith(".xl") ? "xl" : "archive" };
        break;
      case "r6":
        if (next === "scripts") return { to: rest, kind: "reds" };
        if (next === "tweaks") return { to: rest, kind: "tweak" };
        if (next === "audioware") return { to: rest, kind: "audioware" };
        if (next === "input") return { to: rest, kind: "input" };
        if (next === "config") return { to: rest, kind: "config" };
        break;
      case "red4ext":
        // A REDnode package lives in REDnode's apps folder; REDnode itself is a framework.
        if (next === "plugins" && lower(segments[i + 2] ?? "") === "rednode" && lower(segments[i + 3] ?? "") === "apps" && segments.length > i + 5) return { to: rest, kind: "rednode" };
        if (next === "plugins") return { to: rest, kind: FrameworkPlugins.has(lower(segments[i + 2] ?? "")) ? "framework" : "red4ext" };
        if (FrameworkFiles.has(file) || file === "config.ini") return { to: rest, kind: "framework" };
        break;
      case "bin":
        if (next === "x64") {
          if (lower(segments[i + 2] ?? "") === "plugins" && lower(segments[i + 3] ?? "") === "cyber_engine_tweaks" && lower(segments[i + 4] ?? "") === "mods") return { to: rest, kind: "cet" };
          if (file.endsWith(".asi")) return { to: rest, kind: "asi" };
          if (FrameworkFiles.has(file) || lower(segments[i + 2] ?? "") === "plugins") return { to: rest, kind: "framework" };
          return { to: rest, kind: "other" };
        }
        break;
      case "mods":
        if (segments.length > i + 2) return { to: rest, kind: "redmod" };
        break;
      case "engine":
        if (next === "config") return { to: rest, kind: "config" };
        if (next === "tools") return { to: rest, kind: "framework" };
        break;
    }
  }
  return undefined;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

/** True when a folder is a REDmod package: info.json next to archives/, scripts/, tweaks/ or customSounds/. */
function isRedmodPackage(dir: string): boolean {
  if (!fs.existsSync(path.join(dir, "info.json"))) return false;
  return ["archives", "scripts", "tweaks", "customSounds"].some((d) => fs.existsSync(path.join(dir, d)));
}

/** Safe folder name for a mod inside r6/scripts and friends. */
function folderName(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, "").trim() || "Mod";
}

/** The name and version a REDnode package gives itself, from the manifest among the placements. */
export function rednodeManifest(placements: Placement[]): { id: string; name?: string; version?: string } | undefined {
  const p = placements.find((x) => /^red4ext\/plugins\/REDnode\/apps\/[^/]+\/rednode-app\.json$/i.test(x.to));
  if (!p) return undefined;
  try {
    const m = JSON.parse(fs.readFileSync(p.from, "utf8")) as { id?: unknown; name?: unknown; version?: unknown };
    if (typeof m.id !== "string") return undefined;
    return { id: m.id, name: typeof m.name === "string" ? m.name : undefined, version: typeof m.version === "string" ? m.version : undefined };
  } catch {
    return undefined;
  }
}

/** The package id from a REDnode manifest, or undefined when the file is not one. */
function rednodeId(manifest: string): string | undefined {
  try {
    const m = JSON.parse(fs.readFileSync(manifest, "utf8")) as { id?: unknown };
    return typeof m.id === "string" && /^[a-z0-9_-]+$/i.test(m.id) ? m.id : undefined;
  } catch {
    return undefined;
  }
}

export function classify(root: string, modName: string): Classification {
  const safeName = folderName(modName);
  const files = walk(root);
  const placements: Placement[] = [];
  const unplaced: string[] = [];
  const ignored: string[] = [];
  const placed = new Set<string>();

  // Folder-level rules first: CET mods, REDmod packages and REDnode packages carry whole folders.
  const cetDirs = new Map<string, string>();
  const redmodDirs = new Map<string, string>();
  const rednodeDirs = new Map<string, string>();
  for (const f of files) {
    const dir = path.dirname(f);
    const base = lower(path.basename(f));
    const relDir = path.relative(root, dir);
    if (base === "init.lua" && !knownPath(path.relative(root, f).split(/[\\/]/))) {
      cetDirs.set(dir, relDir ? path.basename(dir) : safeName);
    }
    if (base === "info.json" && isRedmodPackage(dir) && !knownPath(path.relative(root, f).split(/[\\/]/))) {
      redmodDirs.set(dir, relDir ? path.basename(dir) : safeName);
    }
    if (base === "rednode-app.json" && !knownPath(path.relative(root, f).split(/[\\/]/))) {
      // The manifest names the package; the folder it sits in is the package, wherever it is in the zip.
      rednodeDirs.set(dir, rednodeId(f) ?? folderName(relDir ? path.basename(dir) : safeName));
    }
  }
  const under = (f: string, dirs: Map<string, string>): [string, string] | undefined => {
    for (const [dir, name] of dirs) {
      const rel = path.relative(dir, f);
      if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return [name, rel.split(path.sep).join("/")];
    }
    return undefined;
  };

  for (const f of files) {
    const rel = path.relative(root, f);
    const segments = rel.split(/[\\/]/);
    const base = lower(path.basename(f));
    const ext = path.extname(base);

    const known = knownPath(segments);
    if (known) {
      placements.push({ from: f, to: known.to, kind: known.kind });
      placed.add(f);
      continue;
    }
    const cet = under(f, cetDirs);
    if (cet) {
      placements.push({ from: f, to: `bin/x64/plugins/cyber_engine_tweaks/mods/${cet[0]}/${cet[1]}`, kind: "cet" });
      placed.add(f);
      continue;
    }
    const redmod = under(f, redmodDirs);
    if (redmod) {
      placements.push({ from: f, to: `mods/${redmod[0]}/${redmod[1]}`, kind: "redmod" });
      placed.add(f);
      continue;
    }
    const rednode = under(f, rednodeDirs);
    if (rednode) {
      placements.push({ from: f, to: `red4ext/plugins/REDnode/apps/${rednode[0]}/${rednode[1]}`, kind: "rednode" });
      placed.add(f);
      continue;
    }
    // Loose files: place by extension. The folder next to the file names the mod's subfolder.
    const parent = path.dirname(rel) === "." ? safeName : folderName(path.basename(path.dirname(rel)));
    if (base.endsWith(".archive.xl")) placements.push({ from: f, to: `archive/pc/mod/${path.basename(f)}`, kind: "xl" });
    else if (ext === ".archive") placements.push({ from: f, to: `archive/pc/mod/${path.basename(f)}`, kind: "archive" });
    else if (ext === ".reds") placements.push({ from: f, to: `r6/scripts/${parent}/${path.basename(f)}`, kind: "reds" });
    else if (ext === ".yaml" || ext === ".yml" || ext === ".tweak") placements.push({ from: f, to: `r6/tweaks/${parent}/${path.basename(f)}`, kind: "tweak" });
    else if (ext === ".asi") placements.push({ from: f, to: `bin/x64/plugins/${path.basename(f)}`, kind: "asi" });
    else if (FrameworkFiles.has(base)) placements.push({ from: f, to: `bin/x64/${path.basename(f)}`, kind: "framework" });
    else if (ext === ".dll") placements.push({ from: f, to: `red4ext/plugins/${parent}/${path.basename(f)}`, kind: "red4ext" });
    else if (IgnoredExtensions.has(ext)) ignored.push(rel);
    else {
      unplaced.push(rel);
      continue;
    }
    placed.add(f);
  }

  // Options: several top-level folders that each place files of the same kinds are alternatives.
  const byTop = new Map<string, Set<ModKind>>();
  for (const p of placements) {
    const rel = path.relative(root, p.from);
    const top = rel.split(/[\\/]/)[0];
    if (rel.indexOf(path.sep) < 0 && !rel.includes("/")) continue; // file at the root
    if (KnownTop.has(lower(top))) continue;
    if (!byTop.has(top)) byTop.set(top, new Set());
    byTop.get(top)!.add(p.kind);
  }
  const tops = [...byTop.entries()];
  const sameKinds = tops.length >= 2 && tops.every(([, kinds]) => [...kinds].some((k) => tops[0][1].has(k)));
  const rootHasPlacements = placements.some((p) => !path.relative(root, p.from).match(/[\\/]/));
  if (sameKinds && !rootHasPlacements) {
    return {
      placements: [],
      kinds: [],
      options: tops.map(([top]) => ({ label: top, folder: path.join(root, top) })),
      unplaced,
      ignored,
    };
  }

  const kinds = [...new Set(placements.map((p) => p.kind))];
  return { placements, kinds: kinds.length ? kinds : ["other"], unplaced, ignored };
}
