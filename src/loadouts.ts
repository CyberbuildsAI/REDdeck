// Loadouts: a saved list of which mods are on and in what order, as one JSON file. Not a mode you
// are in, just a file you can save, load, share or keep in a project.

import * as fs from "node:fs";
import * as path from "node:path";
import { saveLibrary, saveMod, type Library } from "./library";

export interface Loadout {
  version: 1;
  name: string;
  saved: string;
  gameVersion?: string;
  /** In order, winners first. */
  mods: { id: string; name: string; version: string; enabled: boolean; nexusModId?: number }[];
}

export function loadoutsFolder(root: string): string {
  return path.join(root, "loadouts");
}

export function saveLoadout(lib: Library, name: string, gameVersion?: string): string {
  const loadout: Loadout = {
    version: 1,
    name,
    saved: new Date().toISOString(),
    gameVersion,
    mods: lib.mods.map((m) => ({ id: m.id, name: m.name, version: m.version, enabled: m.enabled, nexusModId: m.source.modId })),
  };
  fs.mkdirSync(loadoutsFolder(lib.root), { recursive: true });
  const file = path.join(loadoutsFolder(lib.root), `${name.replace(/[<>:"/\\|?*]+/g, "-").trim() || "loadout"}.json`);
  fs.writeFileSync(file, JSON.stringify(loadout, null, 2) + "\n");
  return file;
}

export function listLoadouts(root: string): { name: string; file: string; saved: string; mods: number }[] {
  const dir = loadoutsFolder(root);
  if (!fs.existsSync(dir)) return [];
  const out: { name: string; file: string; saved: string; mods: number }[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.toLowerCase().endsWith(".json")) continue;
    try {
      const l = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as Loadout;
      out.push({ name: l.name, file: path.join(dir, f), saved: l.saved, mods: l.mods.length });
    } catch {
      // Not a loadout.
    }
  }
  return out.sort((a, b) => b.saved.localeCompare(a.saved));
}

export interface ApplyResult {
  on: number;
  off: number;
  /** Mods in the loadout that are not in the library, by name. */
  missing: string[];
  /** Library mods the loadout does not mention; they are turned off. */
  extra: string[];
}

/** Applies a loadout: on/off and order for the mods it names; the rest are turned off. */
export function applyLoadout(lib: Library, file: string): ApplyResult {
  const loadout = JSON.parse(fs.readFileSync(file, "utf8")) as Loadout;
  const result: ApplyResult = { on: 0, off: 0, missing: [], extra: [] };
  const order: string[] = [];
  const seen = new Set<string>();
  for (const entry of loadout.mods) {
    const mod = lib.mods.find((m) => m.id === entry.id) ?? (entry.nexusModId ? lib.mods.find((m) => m.source.modId === entry.nexusModId) : undefined);
    if (!mod) {
      result.missing.push(`${entry.name} ${entry.version}`.trim());
      continue;
    }
    if (mod.enabled !== entry.enabled) {
      mod.enabled = entry.enabled;
      saveMod(lib, mod);
    }
    entry.enabled ? result.on++ : result.off++;
    order.push(mod.id);
    seen.add(mod.id);
  }
  for (const mod of lib.mods) {
    if (seen.has(mod.id)) continue;
    result.extra.push(mod.name);
    if (mod.enabled) {
      mod.enabled = false;
      saveMod(lib, mod);
    }
    order.push(mod.id);
  }
  lib.info.order = order;
  const rank = new Map(order.map((id, i) => [id, i]));
  lib.mods.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
  saveLibrary(lib);
  return result;
}
