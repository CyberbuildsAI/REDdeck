// Archive conflicts: two enabled mods whose .archive files both contain the same resource. The game
// resolves them by archive load order, which EDGEdeck sets through modlist.txt (list order, first
// wins). The file lists come from REDbridge; this module only intersects them.

import type { Library, ModInfo } from "./library";

export interface ArchiveListing {
  mod: string;
  /** Game path of the archive, for example archive/pc/mod/Foo.archive. */
  archive: string;
  /** Resource hash to resource name (or the hash again when the name is unknown). */
  resources: Map<string, string>;
}

export interface ArchiveConflict {
  /** Resource name, or its hash when unknown. */
  resource: string;
  /** Mod ids in winning order: the first one is what the game uses. */
  mods: string[];
  archives: string[];
}

export interface ArchiveConflictSummary {
  conflicts: ArchiveConflict[];
  /** Per mod: how many resources it loses to a mod above it. */
  lost: Map<string, number>;
  /** Per mod: how many resources it overrides in a mod below it. */
  won: Map<string, number>;
  /** Per pair "winner|loser": number of shared resources. */
  pairs: Map<string, number>;
}

/** Every .archive an enabled mod deploys, winners first. */
export function enabledArchives(lib: Library): { mod: ModInfo; archive: string }[] {
  const out: { mod: ModInfo; archive: string }[] = [];
  for (const mod of lib.mods) {
    if (!mod.enabled) continue;
    for (const f of mod.files) {
      if (f.toLowerCase().startsWith("archive/pc/mod/") && f.toLowerCase().endsWith(".archive")) out.push({ mod, archive: f });
    }
  }
  return out;
}

/** Intersects the listings. `listings` must be in library order (winners first). */
export function findArchiveConflicts(listings: ArchiveListing[]): ArchiveConflictSummary {
  const byHash = new Map<string, { name: string; owners: { mod: string; archive: string }[] }>();
  for (const l of listings) {
    for (const [hash, name] of l.resources) {
      const e = byHash.get(hash) ?? { name, owners: [] };
      if (!e.owners.some((o) => o.mod === l.mod)) e.owners.push({ mod: l.mod, archive: l.archive });
      byHash.set(hash, e);
    }
  }
  const conflicts: ArchiveConflict[] = [];
  const lost = new Map<string, number>();
  const won = new Map<string, number>();
  const pairs = new Map<string, number>();
  for (const [, e] of byHash) {
    if (e.owners.length < 2) continue;
    conflicts.push({ resource: e.name, mods: e.owners.map((o) => o.mod), archives: e.owners.map((o) => o.archive) });
    const winner = e.owners[0].mod;
    won.set(winner, (won.get(winner) ?? 0) + e.owners.length - 1);
    for (const o of e.owners.slice(1)) {
      lost.set(o.mod, (lost.get(o.mod) ?? 0) + 1);
      const k = `${winner}|${o.mod}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
  }
  conflicts.sort((a, b) => a.resource.localeCompare(b.resource));
  return { conflicts, lost, won, pairs };
}
