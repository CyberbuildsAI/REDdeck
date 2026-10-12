// REDcode and WolvenKit projects: a .cpmodproj next to source/ and packed/. The packed folder is
// laid out like the game folder, so a project's output is a mod like any other. A mod added from a
// project remembers it and is re-synced when the project is packed again.

import * as fs from "node:fs";
import * as path from "node:path";
import { classify, type Classification } from "./classifier";
import { saveMod, sourcePath, type Library, type ModInfo } from "./library";

/** The project file for a folder or file, or undefined. */
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
