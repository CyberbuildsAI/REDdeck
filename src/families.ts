// Families: the versions of one mod, grouped. The library keeps one entry per downloaded version
// so a user can go back; the UI shows one row per mod with a version to pick. A family's key is
// the Nexus mod id when there is one, else a REDnode package's id, else the project path, else the
// name without version tokens. Only one version of a family is on at a time.

import { placeAbove, saveMod, type Library, type ModInfo } from "./library";
import { versionNewer } from "./nexus";

export interface Family {
  key: string;
  name: string;
  nexusId?: number;
  /** Every version in the library, newest first. */
  mods: ModInfo[];
  /** The version the family's row stands for: the enabled one, else the newest. */
  active: ModInfo;
  /** Whether any version is on. */
  on: boolean;
  /** A version on Nexus newer than every version in the library. */
  update?: { version: string; fileId?: number };
}

/** The name without version-like tokens, for grouping entries that have no Nexus id. */
export function baseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\bv?\d+(?:\.\d+)+[a-z0-9]*\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A REDnode package's id, from where its manifest deploys: red4ext/plugins/REDnode/apps/<id>/rednode-app.json. */
export function rednodePackageId(mod: Pick<ModInfo, "files">): string | undefined {
  for (const f of mod.files) {
    const m = /^red4ext\/plugins\/REDnode\/apps\/([^/]+)\/rednode-app\.json$/i.exec(f);
    if (m) return m[1].toLowerCase();
  }
  return undefined;
}

export function familyKey(mod: ModInfo): string {
  if (mod.source.modId) return `nexus:${mod.source.modId}`;
  const pkg = rednodePackageId(mod);
  if (pkg) return `rednode:${pkg}`;
  if (mod.source.type === "project" && mod.source.path) return `project:${mod.source.path.toLowerCase()}`;
  return `name:${baseName(mod.name) || mod.id}`;
}

function newestFirst(a: ModInfo, b: ModInfo): number {
  if (a.version === b.version) return b.added.localeCompare(a.added);
  return versionNewer(a.version, b.version) ? -1 : versionNewer(b.version, a.version) ? 1 : b.added.localeCompare(a.added);
}

/** Families in library order: a family sits where its active version sits. */
export function families(lib: Library): Family[] {
  const byKey = new Map<string, ModInfo[]>();
  for (const m of lib.mods) byKey.set(familyKey(m), [...(byKey.get(familyKey(m)) ?? []), m]);
  const out: Family[] = [];
  for (const [key, mods] of byKey) {
    const sorted = [...mods].sort(newestFirst);
    const active = sorted.find((m) => m.enabled) ?? sorted[0];
    const newest = sorted[0];
    let update: Family["update"];
    for (const m of mods) {
      const latest = m.nexus?.latestVersion;
      if (latest && versionNewer(latest, newest.version) && (!update || versionNewer(latest, update.version))) update = { version: latest, fileId: m.nexus?.latestFileId };
    }
    out.push({ key, name: active.name, nexusId: active.source.modId ?? mods.find((m) => m.source.modId)?.source.modId, mods: sorted, active, on: mods.some((m) => m.enabled), update });
  }
  const pos = new Map(lib.mods.map((m, i) => [m.id, i]));
  return out.sort((a, b) => (pos.get(a.active.id) ?? 0) - (pos.get(b.active.id) ?? 0));
}

export function familyOf(lib: Library, mod: ModInfo): Family {
  return families(lib).find((f) => f.key === familyKey(mod)) ?? { key: familyKey(mod), name: mod.name, nexusId: mod.source.modId, mods: [mod], active: mod, on: mod.enabled };
}

/** Whether Nexus has a version newer than every version of this mod in the library. */
export function familyUpdate(lib: Library, mod: ModInfo): string | undefined {
  return familyOf(lib, mod).update?.version;
}

/**
 * Makes one version the family's active one: it takes the previous active version's place in
 * the order and its on/off state, and the other versions go off.
 */
export function activateVersion(lib: Library, chosen: ModInfo): { previous: ModInfo; on: boolean } {
  const fam = familyOf(lib, chosen);
  const previous = fam.active;
  const on = fam.on;
  if (previous.id !== chosen.id) placeAbove(lib, chosen, previous);
  for (const m of fam.mods) {
    const want = m.id === chosen.id ? on : false;
    if (m.enabled !== want) {
      m.enabled = want;
      saveMod(lib, m);
    }
  }
  return { previous, on };
}

/**
 * Settles a mod just added into its family, so two versions never fight over the same files. When
 * the family already has a version and the new one is not older, the new one takes the place in the
 * order and the on/off state of the version that was active, and the others go off. An older
 * version arrives off, for going back to. Returns what changed, for the message.
 */
export function settleNewVersion(lib: Library, mod: ModInfo): { replaced?: ModInfo; older?: ModInfo } {
  const fam = familyOf(lib, mod);
  const others = fam.mods.filter((m) => m.id !== mod.id);
  if (!others.length) return {};
  const previous = others.find((m) => m.enabled) ?? [...others].sort(newestFirst)[0];
  if (mod.version && previous.version && versionNewer(previous.version, mod.version)) {
    if (mod.enabled) {
      mod.enabled = false;
      saveMod(lib, mod);
    }
    return { older: previous };
  }
  const on = others.some((m) => m.enabled);
  placeAbove(lib, mod, previous);
  for (const m of others) {
    if (m.enabled) {
      m.enabled = false;
      saveMod(lib, m);
    }
  }
  if (mod.enabled !== on) {
    mod.enabled = on;
    saveMod(lib, mod);
  }
  return { replaced: previous };
}

/** Families with more than one version on, from before versions were settled on adding. */
export function familiesWithTwoOn(lib: Library): Family[] {
  return families(lib).filter((f) => f.mods.filter((m) => m.enabled).length > 1);
}

/** An entry for the same Nexus file, or the same version of the same mod, already in the library. */
export function findSameVersion(lib: Library, modId: number, fileId: number, version?: string): ModInfo | undefined {
  return lib.mods.find((m) => m.source.modId === modId && (m.source.fileId === fileId || (!!version && m.version === version)));
}
