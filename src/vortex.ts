// Reads a Vortex installation, never writes to it. Vortex keeps one folder per mod in its staging
// folder, already laid out like the game folder, and names folders from Nexus
// "<name>-<modId>-<version>-<timestamp>". Its deployment manifest says which ones are deployed.

import * as fs from "node:fs";
import * as path from "node:path";
import { classify } from "./classifier";
import { addMod, type Library, type ModInfo } from "./library";

export interface VortexMod {
  folder: string;
  name: string;
  version: string;
  modId?: number;
  deployed: boolean;
  files: number;
}

export function vortexStagingPath(): string {
  return path.join(process.env.APPDATA ?? path.join(process.env.USERPROFILE ?? "", "AppData", "Roaming"), "Vortex", "cyberpunk2077", "mods");
}

function countFiles(dir: string): number {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += countFiles(path.join(dir, e.name));
    else n++;
  }
  return n;
}

/** A readable name for a mod Vortex stored under a GUID: the folder its scripts or CET mod use, or its archive. */
export function guessName(folder: string): string | undefined {
  const sub = (...parts: string[]) => {
    const d = path.join(folder, ...parts);
    if (!fs.existsSync(d)) return undefined;
    const names = fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    return names.length === 1 ? names[0] : undefined;
  };
  const named = sub("r6", "scripts") ?? sub("bin", "x64", "plugins", "cyber_engine_tweaks", "mods") ?? sub("red4ext", "plugins") ?? sub("r6", "tweaks") ?? sub("mods");
  if (named) return named;
  const archives = path.join(folder, "archive", "pc", "mod");
  if (fs.existsSync(archives)) {
    const a = fs.readdirSync(archives).find((f) => f.toLowerCase().endsWith(".archive"));
    if (a) return a.replace(/\.archive$/i, "").replace(/^[#!_0-9]+/, "") || a;
  }
  return undefined;
}

/** Lists Vortex's mods for this game. `gamePath` is used to read which ones are deployed. */
export function listVortexMods(gamePath: string, staging = vortexStagingPath()): VortexMod[] {
  if (!fs.existsSync(staging)) return [];
  const deployed = new Set<string>();
  const manifest = path.join(gamePath, "vortex.deployment.json");
  if (fs.existsSync(manifest)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifest, "utf8")) as { files?: { source: string }[] };
      for (const f of m.files ?? []) deployed.add(f.source);
    } catch {
      // Unreadable manifest: treat every mod as not deployed.
    }
  }
  const mods: VortexMod[] = [];
  for (const entry of fs.readdirSync(staging, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("__")) continue;
    const folder = path.join(staging, entry.name);
    const files = countFiles(folder);
    if (files === 0) continue;
    if (fs.existsSync(path.join(folder, "collection.json")) && files === 1) continue;
    const m = /^(.*?)-(\d+)-([\d-]+)-(\d{10})$/.exec(entry.name);
    const guid = /^[0-9a-f]{2}_[0-9a-f]{2}_[0-9a-f]{2}_[0-9a-f-]{36}$/i.test(entry.name);
    mods.push({
      folder,
      name: (m ? m[1] : guid ? guessName(folder) ?? entry.name : entry.name).replace(/\.(zip|7z|rar)$/i, ""),
      version: m ? m[3].replace(/-/g, ".") : "",
      modId: m ? Number(m[2]) : undefined,
      deployed: deployed.has(entry.name),
      files,
    });
  }
  return mods;
}

export interface ImportResult {
  added: ModInfo[];
  skipped: { name: string; reason: string }[];
}

/** Copies Vortex's mods into the library. Vortex is not touched. */
export function importFromVortex(lib: Library, mods: VortexMod[]): ImportResult {
  const result: ImportResult = { added: [], skipped: [] };
  for (const v of mods) {
    if (lib.mods.some((m) => m.source.type === "vortex" && m.source.path === v.folder)) {
      result.skipped.push({ name: v.name, reason: "already imported" });
      continue;
    }
    const c = classify(v.folder, v.name);
    if (c.options) {
      result.skipped.push({ name: v.name, reason: `has option folders (${c.options.map((o) => o.label).join(", ")}); add it by hand` });
      continue;
    }
    if (!c.placements.length) {
      result.skipped.push({ name: v.name, reason: "no files REDdeck knows where to put" });
      continue;
    }
    const mod = addMod(lib, c.placements, {
      name: v.name,
      version: v.version,
      enabled: v.deployed,
      source: { type: "vortex", path: v.folder, modId: v.modId },
    });
    result.added.push(mod);
  }
  return result;
}
