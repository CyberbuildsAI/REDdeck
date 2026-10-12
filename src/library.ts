// The mod library: one folder per mod, laid out exactly as it deploys, plus mod.json in each
// and library.json at the root. Everything REDdeck knows is in these files, so a person or an
// assistant can read the state without the UI.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Placement } from "./classifier";

/** What is inside a mod, by where its files land. A mod can be several kinds at once. */
export type ModKind = "archive" | "xl" | "redmod" | "reds" | "tweak" | "cet" | "red4ext" | "audioware" | "input" | "config" | "asi" | "framework" | "rednode" | "other";

export interface ModSource {
  type: "folder" | "file" | "nexus" | "project" | "vortex";
  path?: string;
  modId?: number;
  fileId?: number;
}

/** `mod.json`, one per mod folder. */
export interface ModInfo {
  id: string;
  name: string;
  version: string;
  kinds: ModKind[];
  enabled: boolean;
  added: string;
  source: ModSource;
  /** Paths under the game folder, forward slashes, in no particular order. */
  files: string[];
}

/** `library.json` at the library root. */
export interface LibraryInfo {
  version: 1;
  gamePath: string;
  /** Mod ids, first wins a conflict. */
  order: string[];
}

export interface Library {
  root: string;
  info: LibraryInfo;
  mods: ModInfo[];
}

export function defaultLibraryPath(): string {
  return path.join(os.homedir(), "REDdeck");
}

export function libraryFolder(root: string): string {
  return path.join(root, "library");
}

export function downloadsFolder(root: string): string {
  return path.join(root, "downloads");
}

export function backupFolder(root: string): string {
  return path.join(root, "backup");
}

/** Reads the library, creating an empty one if the folder is new. */
export function loadLibrary(root: string, gamePath: string): Library {
  fs.mkdirSync(libraryFolder(root), { recursive: true });
  const infoFile = path.join(root, "library.json");
  let info: LibraryInfo = { version: 1, gamePath, order: [] };
  if (fs.existsSync(infoFile)) {
    info = { ...info, ...(JSON.parse(fs.readFileSync(infoFile, "utf8")) as Partial<LibraryInfo>) };
  }
  info.gamePath = gamePath || info.gamePath;
  const mods: ModInfo[] = [];
  for (const entry of fs.readdirSync(libraryFolder(root), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(libraryFolder(root), entry.name, "mod.json");
    if (!fs.existsSync(file)) continue;
    try {
      const mod = JSON.parse(fs.readFileSync(file, "utf8")) as ModInfo;
      mod.files ??= [];
      mods.push(mod);
    } catch {
      // A broken mod.json is shown as missing rather than crashing the view.
    }
  }
  // The order list decides who wins a conflict; mods not in it go last, by name.
  const rank = new Map(info.order.map((id, i) => [id, i]));
  mods.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || a.name.localeCompare(b.name));
  info.order = mods.map((m) => m.id);
  return { root, info, mods };
}

export function saveLibrary(lib: Library): void {
  fs.writeFileSync(path.join(lib.root, "library.json"), JSON.stringify(lib.info, null, 2) + "\n");
}

export function saveMod(lib: Library, mod: ModInfo): void {
  fs.writeFileSync(path.join(modFolder(lib, mod), "mod.json"), JSON.stringify(mod, null, 2) + "\n");
}

export function modFolder(lib: Library, mod: ModInfo): string {
  return path.join(libraryFolder(lib.root), mod.id);
}

/** A folder-safe id from a mod name: lower case, dashes, unique within the library. */
export function idFor(lib: Library, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "mod";
  let id = base;
  for (let n = 2; lib.mods.some((m) => m.id === id); n++) id = `${base}-${n}`;
  return id;
}

export interface AddOptions {
  name: string;
  version?: string;
  source: ModSource;
  enabled?: boolean;
}

/** Copies classified files into a new mod folder, laid out exactly as they deploy. */
export function addMod(lib: Library, placements: Placement[], opts: AddOptions): ModInfo {
  if (!placements.length) throw new Error("Nothing to add: no files could be placed.");
  const id = idFor(lib, opts.name);
  const target = path.join(libraryFolder(lib.root), id);
  fs.mkdirSync(target, { recursive: true });
  const files = new Set<string>();
  for (const p of placements) {
    const dest = path.join(target, ...p.to.split("/"));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(p.from, dest);
    files.add(p.to);
  }
  const mod: ModInfo = {
    id,
    name: opts.name,
    version: opts.version ?? "",
    kinds: [...new Set(placements.map((p) => p.kind))],
    enabled: opts.enabled ?? true,
    added: new Date().toISOString(),
    source: opts.source,
    files: [...files].sort(),
  };
  lib.mods.push(mod);
  lib.info.order.push(id);
  saveMod(lib, mod);
  saveLibrary(lib);
  return mod;
}

export function removeMod(lib: Library, mod: ModInfo): void {
  fs.rmSync(modFolder(lib, mod), { recursive: true, force: true });
  lib.mods = lib.mods.filter((m) => m.id !== mod.id);
  lib.info.order = lib.info.order.filter((id) => id !== mod.id);
  saveLibrary(lib);
}

/** Moves a mod up (wins more conflicts) or down in the order. */
export function moveMod(lib: Library, mod: ModInfo, delta: -1 | 1): void {
  const i = lib.info.order.indexOf(mod.id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lib.info.order.length) return;
  [lib.info.order[i], lib.info.order[j]] = [lib.info.order[j], lib.info.order[i]];
  const rank = new Map(lib.info.order.map((id, k) => [id, k]));
  lib.mods.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  saveLibrary(lib);
}

/** Keeps the original archive so the mod can be re-added or inspected later. */
export function keepDownload(lib: Library, file: string): string {
  fs.mkdirSync(downloadsFolder(lib.root), { recursive: true });
  const dest = path.join(downloadsFolder(lib.root), path.basename(file));
  if (path.resolve(dest) !== path.resolve(file)) fs.copyFileSync(file, dest);
  return dest;
}

/** The library path a mod file deploys from. */
export function sourcePath(lib: Library, mod: ModInfo, rel: string): string {
  return path.join(modFolder(lib, mod), ...rel.split("/"));
}
