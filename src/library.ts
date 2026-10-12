// The mod library: one folder per mod, laid out exactly as it deploys, plus mod.json in each
// and library.json at the root. Everything REDdeck knows is in these files, so a person or an
// assistant can read the state without the UI.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** What is inside a mod, by where its files land. A mod can be several kinds at once. */
export type ModKind = "archive" | "xl" | "redmod" | "reds" | "tweak" | "cet" | "red4ext" | "audioware" | "input" | "config" | "asi" | "framework" | "rednode" | "other";

/** `mod.json`, one per mod folder. */
export interface ModInfo {
  id: string;
  name: string;
  version: string;
  kinds: ModKind[];
  enabled: boolean;
  added: string;
  source: { type: "folder" | "file" | "nexus" | "project"; path?: string; modId?: number; fileId?: number };
  files: number;
}

/** `library.json` at the library root. */
export interface LibraryInfo {
  version: 1;
  gamePath: string;
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

export function libraryFolder(mods: string): string {
  return path.join(mods, "library");
}

/** Reads the library, creating an empty one if the folder is new. */
export function loadLibrary(root: string, gamePath: string): Library {
  fs.mkdirSync(libraryFolder(root), { recursive: true });
  const infoFile = path.join(root, "library.json");
  let info: LibraryInfo = { version: 1, gamePath, order: [] };
  if (fs.existsSync(infoFile)) {
    info = { ...info, ...(JSON.parse(fs.readFileSync(infoFile, "utf8")) as Partial<LibraryInfo>) };
  }
  const mods: ModInfo[] = [];
  for (const entry of fs.readdirSync(libraryFolder(root), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(libraryFolder(root), entry.name, "mod.json");
    if (!fs.existsSync(file)) continue;
    try {
      mods.push(JSON.parse(fs.readFileSync(file, "utf8")) as ModInfo);
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

/**
 * Adds a folder as a mod by copying it into the library as-is. The M1 classifier will replace
 * the "as-is" with a proper layout; for now the folder is expected to be rooted at the game folder
 * (archive/, r6/, red4ext/, bin/, mods/).
 */
export function addFolder(lib: Library, source: string, name: string): ModInfo {
  const id = idFor(lib, name);
  const target = path.join(libraryFolder(lib.root), id);
  fs.cpSync(source, target, { recursive: true });
  const mod: ModInfo = {
    id,
    name,
    version: "",
    kinds: detectKinds(target),
    enabled: true,
    added: new Date().toISOString(),
    source: { type: "folder", path: source },
    files: countFiles(target),
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

/** First-pass kind detection from the top-level folders. The M1 classifier goes deeper. */
export function detectKinds(folder: string): ModKind[] {
  const kinds = new Set<ModKind>();
  const has = (...parts: string[]) => fs.existsSync(path.join(folder, ...parts));
  if (has("archive", "pc", "mod")) {
    kinds.add("archive");
    if (fs.readdirSync(path.join(folder, "archive", "pc", "mod")).some((f) => f.endsWith(".xl"))) kinds.add("xl");
  }
  if (has("mods")) kinds.add("redmod");
  if (has("r6", "scripts")) kinds.add("reds");
  if (has("r6", "tweaks")) kinds.add("tweak");
  if (has("r6", "audioware")) kinds.add("audioware");
  if (has("r6", "input")) kinds.add("input");
  if (has("r6", "config") || has("engine", "config")) kinds.add("config");
  if (has("bin", "x64", "plugins", "cyber_engine_tweaks", "mods")) kinds.add("cet");
  if (has("red4ext", "plugins")) kinds.add("red4ext");
  if (has("red4ext", "RED4ext.dll") || has("bin", "x64", "winmm.dll") || has("bin", "x64", "plugins", "cyber_engine_tweaks.asi") || has("engine", "tools", "scc.exe")) kinds.add("framework");
  if (kinds.size === 0) kinds.add("other");
  return [...kinds];
}

export function countFiles(folder: string): number {
  let n = 0;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(path.join(folder, entry.name));
    else if (entry.name !== "mod.json") n++;
  }
  return n;
}
