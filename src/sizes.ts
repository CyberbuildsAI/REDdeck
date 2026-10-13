// Sizes: how much disk each mod, folder and file takes in the library, and the library's totals.
// Deployed hardlinks cost nothing extra; the kept downloads do, so they are reported apart.

import * as fs from "node:fs";
import * as path from "node:path";
import { backupFolder, downloadsFolder, modFolder, type Library, type ModInfo } from "./library";

export interface ModSize {
  total: number;
  /** Bytes per deployed path. */
  files: Map<string, number>;
  /** Last modified, as epoch milliseconds, per deployed path. */
  mtimes: Map<string, number>;
}

const cache = new Map<string, { stamp: string; size: ModSize }>();

/** Sizes of a mod's files in the library, cached until its file list changes. */
export function modSize(lib: Library, mod: ModInfo): ModSize {
  const stamp = `${mod.files.length}:${mod.added}:${lib.root}`;
  const hit = cache.get(mod.id);
  if (hit && hit.stamp === stamp) return hit.size;
  const folder = modFolder(lib, mod);
  const files = new Map<string, number>();
  const mtimes = new Map<string, number>();
  let total = 0;
  for (const f of mod.files) {
    let n = 0;
    try {
      const st = fs.statSync(path.join(folder, ...f.split("/")));
      n = st.size;
      mtimes.set(f, st.mtimeMs);
    } catch {
      // Missing from the library: counts as zero.
    }
    files.set(f, n);
    total += n;
  }
  const size = { total, files, mtimes };
  cache.set(mod.id, { stamp, size });
  return size;
}

/** Drops cached sizes, for after a sync or a rebuild. */
export function forgetSizes(modId?: string): void {
  if (modId) cache.delete(modId);
  else cache.clear();
}

function folderSize(dir: string): number {
  let total = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) total += folderSize(p);
      else if (e.isFile()) total += fs.statSync(p).size;
    }
  } catch {
    // Not there.
  }
  return total;
}

export interface LibrarySize {
  mods: number;
  downloads: number;
  backups: number;
}

/** The library's totals: mod files, kept downloads, deploy backups. */
export function librarySize(lib: Library): LibrarySize {
  return {
    mods: lib.mods.reduce((n, m) => n + modSize(lib, m).total, 0),
    downloads: folderSize(downloadsFolder(lib.root)),
    backups: folderSize(backupFolder(lib.root)),
  };
}

/** "1.5 GB", "320 MB", "12 KB". */
export function formatBytes(n: number): string {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(n >= 10 * (1 << 30) ? 0 : 1)} GB`;
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(n >= 10 * (1 << 20) ? 0 : 1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}
