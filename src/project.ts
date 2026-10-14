// REDcode and WolvenKit projects: a .cpmodproj next to source/ and packed/. The packed folder is
// laid out like the game folder, so a project's output is a mod like any other. A mod added from a
// project remembers it and is re-synced when the project is packed again.

import * as fs from "node:fs";
import * as path from "node:path";
import { classify, type Classification } from "./classifier";
import { addMod, saveMod, sourcePath, type Library, type ModInfo } from "./library";

export interface AddToProjectResult {
  /** Project-relative paths written. */
  copied: string[];
  /** Already in the project with the same content. */
  same: string[];
  /** In the project with different content; left alone unless `replace` named them. */
  kept: string[];
  /** Deploy paths that cannot go in as files: .archive files need extracting. */
  archives: string[];
}

/**
 * Copies a mod's loose files into a project's source/resources, under their deploy paths, so the
 * packed mod carries them at the same place. Archives are reported, not copied: their resources
 * need extracting into source/archive, which REDcode does.
 */
export function addToProject(lib: Library, mod: ModInfo, files: string[], projectFile: string, replace: Set<string> = new Set()): AddToProjectResult {
  const resources = path.join(path.dirname(projectFile), "source", "resources");
  const out: AddToProjectResult = { copied: [], same: [], kept: [], archives: [] };
  for (const f of files) {
    if (f.toLowerCase().endsWith(".archive")) {
      out.archives.push(f);
      continue;
    }
    const src = sourcePath(lib, mod, f);
    const rel = path.join("source", "resources", ...f.split("/"));
    const dest = path.join(resources, ...f.split("/"));
    if (fs.existsSync(dest)) {
      if (fs.readFileSync(dest).equals(fs.readFileSync(src))) {
        out.same.push(rel);
        continue;
      }
      if (!replace.has(f)) {
        out.kept.push(rel);
        continue;
      }
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    out.copied.push(rel);
  }
  return out;
}

/** The project a target file or folder would belong to: the first .cpmodproj in the folder, or undefined. */
export function findProjectFile(target: string): string | undefined {
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target.toLowerCase().endsWith(".cpmodproj") ? target : undefined;
  const files = fs.existsSync(target) ? fs.readdirSync(target).filter((f) => f.toLowerCase().endsWith(".cpmodproj")) : [];
  return files.length ? path.join(target, files[0]) : undefined;
}

export function projectName(projectFile: string): string {
  try {
    const xml = fs.readFileSync(projectFile, "utf8");
    const m = /<ModName>\s*([^<]+?)\s*<\//.exec(xml) ?? /<Name>\s*([^<]+?)\s*<\//.exec(xml);
    if (m) return m[1];
  } catch {
    // Fall through to the file name.
  }
  return path.basename(projectFile, path.extname(projectFile));
}

export function packedFolder(projectFile: string): string {
  return path.join(path.dirname(projectFile), "packed");
}

/** Classifies a project's packed output. Empty when the project was never packed. */
export function classifyProject(projectFile: string): Classification {
  const packed = packedFolder(projectFile);
  if (!fs.existsSync(packed)) return { placements: [], kinds: [], unplaced: [], ignored: [] };
  return classify(packed, projectName(projectFile));
}

function newest(dir: string): number {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }
  return t;
}

/**
 * Re-copies the packed output of every project-backed mod whose packed folder changed since the
 * library copy was made. Returns the mods that were refreshed. Deploy then relinks them.
 */
export function syncProjects(lib: Library): ModInfo[] {
  const refreshed: ModInfo[] = [];
  for (const mod of lib.mods) {
    if (mod.source.type !== "project" || !mod.source.path) continue;
    const packed = packedFolder(mod.source.path);
    if (!fs.existsSync(packed)) continue;
    const libNewest = mod.files.reduce((t, f) => {
      try {
        return Math.max(t, fs.statSync(sourcePath(lib, mod, f)).mtimeMs);
      } catch {
        return t;
      }
    }, 0);
    if (newest(packed) <= libNewest + 1000) continue;
    const c = classifyProject(mod.source.path);
    if (!c.placements.length) continue;
    // Replace the library copy file by file; files the project no longer produces are removed.
    const keep = new Set<string>();
    for (const p of c.placements) {
      const dest = sourcePath(lib, mod, p.to);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(p.from, dest);
      keep.add(p.to);
    }
    for (const f of mod.files) if (!keep.has(f)) fs.rmSync(sourcePath(lib, mod, f), { force: true });
    mod.files = [...keep].sort();
    mod.kinds = c.kinds;
    saveMod(lib, mod);
    refreshed.push(mod);
  }
  return refreshed;
}

export interface InstallProjectResult {
  mod: ModInfo;
  /** True when the project was new to the library; false when the mod that follows it was refreshed. */
  added: boolean;
}

/**
 * What REDcode's Install does through REDdeck: the mod that follows this project gets the packed
 * output now, whatever the file times say, and is turned on; a project REDdeck does not know yet is
 * added as version "dev". Deploying is a separate step, so the caller can ask about other pending
 * changes first.
 */
export function installProject(lib: Library, projectFile: string): InstallProjectResult {
  const c = classifyProject(projectFile);
  if (!c.placements.length) throw new Error(`${projectName(projectFile)} has no packed output yet. Pack the project first (packed/ next to the project file).`);
  const existing = lib.mods.find((m) => m.source.type === "project" && m.source.path?.toLowerCase() === projectFile.toLowerCase());
  if (!existing) {
    const mod = addMod(lib, c.placements, { name: projectName(projectFile), version: "dev", source: { type: "project", path: projectFile } });
    return { mod, added: true };
  }
  const keep = new Set<string>();
  for (const p of c.placements) {
    const dest = sourcePath(lib, existing, p.to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(p.from, dest);
    keep.add(p.to);
  }
  for (const f of existing.files) if (!keep.has(f)) fs.rmSync(sourcePath(lib, existing, f), { force: true });
  existing.files = [...keep].sort();
  existing.kinds = c.kinds;
  existing.enabled = true;
  saveMod(lib, existing);
  return { mod: existing, added: false };
}
