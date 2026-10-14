// Loadouts: named sets of which mods are on, and which version of each. One is always active: it is
// what the mods' on/off state says, what the sidebar shows and what a deploy puts in the game, and
// every change saves into it. The others wait as files, and the REDdeck page can edit them without
// touching the game. The library, sections and load order are shared by every loadout. A loadout is
// one JSON file in the library's loadouts folder, so it can be exported, shared and imported.

import * as fs from "node:fs";
import * as path from "node:path";
import { families, familyKey, type Family } from "./families";
import { saveLibrary, saveMod, type Library, type ModInfo } from "./library";

export interface LoadoutEntry {
  /** The mod's family key (see families.ts), so a new version keeps the mod's place. */
  family?: string;
  /** The version this loadout uses. A version no longer in the library falls back to the family's newest. */
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  nexusModId?: number;
}

export interface Loadout {
  /** 1: a snapshot from REDdeck before 0.26 (it also carried an order, now ignored). 2: a loadout. */
  version: 1 | 2;
  name: string;
  saved: string;
  gameVersion?: string;
  mods: LoadoutEntry[];
}

export interface LoadoutInfo {
  name: string;
  file: string;
  saved: string;
  mods: number;
  on: number;
}

/** The loadout a library starts with: its state when loadouts arrived. */
export const DefaultLoadout = "Default";

export function loadoutsFolder(root: string): string {
  return path.join(root, "loadouts");
}

function slug(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, "-").trim() || "loadout";
}

export function readLoadout(file: string): Loadout {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Loadout;
}

export function listLoadouts(root: string): LoadoutInfo[] {
  const dir = loadoutsFolder(root);
  if (!fs.existsSync(dir)) return [];
  const out: LoadoutInfo[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.toLowerCase().endsWith(".json")) continue;
    try {
      const l = readLoadout(path.join(dir, f));
      out.push({ name: l.name, file: path.join(dir, f), saved: l.saved, mods: l.mods.length, on: l.mods.filter((m) => m.enabled).length });
    } catch {
      // Not a loadout.
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** A loadout's file by name, case-insensitive. */
export function findLoadout(root: string, name: string): LoadoutInfo | undefined {
  return listLoadouts(root).find((l) => l.name.toLowerCase() === name.trim().toLowerCase());
}

/** Why a name cannot be a new loadout's, or undefined when it can. */
export function loadoutNameProblem(root: string, name: string, renaming?: string): string | undefined {
  const n = name.trim();
  if (!n) return "Give the loadout a name.";
  const taken = findLoadout(root, n);
  if (taken && taken.name !== renaming) return `There is already a loadout called ${taken.name}.`;
  return undefined;
}

/** The library's state now, as a loadout: one entry per mod, the version its row stands for. */
export function snapshot(lib: Library, name: string, gameVersion?: string): Loadout {
  return {
    version: 2,
    name,
    saved: new Date().toISOString(),
    gameVersion,
    mods: families(lib).map((f) => entryFor(f, f.active, f.on)),
  };
}

function entryFor(f: Family, mod: ModInfo, enabled: boolean): LoadoutEntry {
  return { family: f.key, id: mod.id, name: f.name, version: mod.version, enabled, nexusModId: f.nexusId };
}

function writeLoadout(root: string, loadout: Loadout, file?: string): string {
  fs.mkdirSync(loadoutsFolder(root), { recursive: true });
  let target = file;
  if (!target) {
    target = path.join(loadoutsFolder(root), `${slug(loadout.name)}.json`);
    for (let n = 2; fs.existsSync(target); n++) target = path.join(loadoutsFolder(root), `${slug(loadout.name)}-${n}.json`);
  }
  fs.writeFileSync(target, JSON.stringify(loadout, null, 2) + "\n");
  return target;
}

/** Saves the library's state now as a new loadout (or over the one with that name). Does not make it active. */
export function saveLoadout(lib: Library, name: string, gameVersion?: string): string {
  const existing = findLoadout(lib.root, name);
  return writeLoadout(lib.root, snapshot(lib, name.trim(), gameVersion), existing?.file);
}

/** The family an entry names: by family key, else (version 1 files) by mod id or Nexus id. */
function familyOfEntry(fams: Family[], e: LoadoutEntry): Family | undefined {
  return (
    (e.family ? fams.find((f) => f.key === e.family) : undefined) ??
    fams.find((f) => f.mods.some((m) => m.id === e.id)) ??
    (e.nexusModId ? fams.find((f) => f.nexusId === e.nexusModId) : undefined)
  );
}

/** What a loadout says for each mod in the library: the version and whether it is on. Mods it does not name are off. */
export function loadoutState(lib: Library, loadout: Loadout, fams: Family[] = families(lib)): Map<string, { mod: ModInfo; enabled: boolean }> {
  const out = new Map<string, { mod: ModInfo; enabled: boolean }>();
  for (const f of fams) out.set(f.key, { mod: f.active, enabled: false });
  for (const e of loadout.mods) {
    const f = familyOfEntry(fams, e);
    if (!f) continue;
    out.set(f.key, { mod: f.mods.find((m) => m.id === e.id) ?? f.mods[0], enabled: e.enabled });
  }
  return out;
}

export interface ApplyResult {
  on: number;
  off: number;
  /** Mods in the loadout that are not in the library, by name. */
  missing: string[];
  /** Library mods the loadout does not name; they are turned off. */
  extra: string[];
}

/** Puts a loadout's choices into the mods' on/off state. The order is shared and stays as it is. */
export function applyLoadout(lib: Library, file: string): ApplyResult {
  const loadout = readLoadout(file);
  const fams = families(lib);
  const result: ApplyResult = { on: 0, off: 0, missing: [], extra: [] };
  const named = new Set<string>();
  for (const e of loadout.mods) {
    const f = familyOfEntry(fams, e);
    if (f) named.add(f.key);
    else result.missing.push(`${e.name} ${e.version}`.trim());
  }
  const want = loadoutState(lib, loadout, fams);
  for (const f of fams) {
    if (!named.has(f.key)) result.extra.push(f.name);
    const w = want.get(f.key)!;
    for (const m of f.mods) {
      const enabled = w.enabled && m.id === w.mod.id;
      if (m.enabled !== enabled) {
        m.enabled = enabled;
        saveMod(lib, m);
      }
    }
    if (w.enabled) result.on++;
    else result.off++;
  }
  return result;
}

/** The active loadout's name. A library from before loadouts were kept active gets "Default", made from its state now. */
export function activeLoadout(lib: Library, gameVersion?: string): string {
  const name = lib.info.activeLoadout;
  if (name && findLoadout(lib.root, name)) return name;
  const fallback = findLoadout(lib.root, DefaultLoadout)?.name ?? DefaultLoadout;
  if (!findLoadout(lib.root, fallback)) saveLoadout(lib, fallback, gameVersion);
  lib.info.activeLoadout = fallback;
  saveLibrary(lib);
  return fallback;
}

/** Writes the library's state into the active loadout when it differs. Returns whether it wrote. */
export function syncActiveLoadout(lib: Library, gameVersion?: string): boolean {
  const name = activeLoadout(lib, gameVersion);
  const info = findLoadout(lib.root, name)!;
  const now = snapshot(lib, name, gameVersion ?? readLoadout(info.file).gameVersion);
  const was = readLoadout(info.file);
  const same = (l: Loadout) => JSON.stringify(l.mods.map((m) => [m.family, m.id, m.enabled]).sort());
  if (was.version === 2 && same(was) === same(now)) return false;
  writeLoadout(lib.root, now, info.file);
  return true;
}

/** Makes a loadout the active one: its choices go into the mods' on/off state. Deploy afterwards. */
export function makeActive(lib: Library, name: string, gameVersion?: string): ApplyResult {
  syncActiveLoadout(lib, gameVersion);
  const info = findLoadout(lib.root, name);
  if (!info) throw new Error(`There is no loadout called ${name}.`);
  const r = applyLoadout(lib, info.file);
  lib.info.activeLoadout = info.name;
  saveLibrary(lib);
  // The file may be a version 1 snapshot or name mods no longer here: rewrite it from what is on now.
  syncActiveLoadout(lib, gameVersion);
  return r;
}

/** Changes one mod in a loadout that is not active: on or off, or which version. */
export function setInLoadout(lib: Library, name: string, mod: ModInfo, change: { enabled?: boolean; version?: ModInfo }): void {
  const info = findLoadout(lib.root, name);
  if (!info) throw new Error(`There is no loadout called ${name}.`);
  const loadout = readLoadout(info.file);
  const fams = families(lib);
  const key = familyKey(mod);
  const f = fams.find((x) => x.key === key);
  if (!f) return;
  const now = loadoutState(lib, loadout, fams).get(key)!;
  const entry = entryFor(f, change.version ?? now.mod, change.enabled ?? now.enabled);
  loadout.mods = [...loadout.mods.filter((e) => familyOfEntry(fams, e)?.key !== key), entry];
  loadout.version = 2;
  loadout.saved = new Date().toISOString();
  writeLoadout(lib.root, loadout, info.file);
}

/** A new loadout: a copy of another (by name), or with every mod off. */
export function newLoadout(lib: Library, name: string, copyOf?: string): string {
  const problem = loadoutNameProblem(lib.root, name);
  if (problem) throw new Error(problem);
  const from = copyOf ? findLoadout(lib.root, copyOf) : undefined;
  const base: Loadout = from ? readLoadout(from.file) : { ...snapshot(lib, name), mods: snapshot(lib, name).mods.map((m) => ({ ...m, enabled: false })) };
  return writeLoadout(lib.root, { ...base, version: 2, name: name.trim(), saved: new Date().toISOString() });
}

export function renameLoadout(lib: Library, from: string, to: string): void {
  const problem = loadoutNameProblem(lib.root, to, from);
  if (problem) throw new Error(problem);
  const info = findLoadout(lib.root, from);
  if (!info) throw new Error(`There is no loadout called ${from}.`);
  const loadout = readLoadout(info.file);
  loadout.name = to.trim();
  fs.rmSync(info.file);
  writeLoadout(lib.root, loadout);
  if (lib.info.activeLoadout === from) {
    lib.info.activeLoadout = to.trim();
    saveLibrary(lib);
  }
}

/** Deletes a loadout that is not active. */
export function deleteLoadout(lib: Library, name: string): void {
  if (lib.info.activeLoadout === name) throw new Error(`${name} is the active loadout; make another one active first.`);
  const info = findLoadout(lib.root, name);
  if (info) fs.rmSync(info.file);
}

/** Writes a copy of a loadout to a file of the user's choosing, to share or keep. */
export function exportLoadout(lib: Library, name: string, dest: string, gameVersion?: string): void {
  if (lib.info.activeLoadout === name) syncActiveLoadout(lib, gameVersion);
  const info = findLoadout(lib.root, name);
  if (!info) throw new Error(`There is no loadout called ${name}.`);
  fs.copyFileSync(info.file, dest);
}

/** Adds a loadout file from elsewhere as a new loadout, renamed when its name is taken. Returns the name. */
export function importLoadout(lib: Library, file: string): string {
  const loadout = readLoadout(file);
  if (!Array.isArray(loadout.mods)) throw new Error(`${path.basename(file)} is not a REDdeck loadout.`);
  let name = (loadout.name || path.basename(file, ".json")).trim();
  for (let n = 2; findLoadout(lib.root, name); n++) name = `${(loadout.name || "Loadout").trim()} (${n})`;
  writeLoadout(lib.root, { ...loadout, name, saved: new Date().toISOString() });
  return name;
}
