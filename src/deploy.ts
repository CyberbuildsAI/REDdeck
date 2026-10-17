// Deployment: links or copies the enabled mods into the game folder, records every file in a
// manifest, and undoes exactly that. Never touches a file it did not put there; a file that was
// already in the way is moved to the library's backup folder and comes back on undo.

import * as fs from "node:fs";
import * as path from "node:path";
import { isGameFolder } from "./game";
import { backupFolder, sourcePath, type Library, type ModInfo } from "./library";

export const ManifestName = "edgedeck.deployment.json";
export const VortexManifestName = "vortex.deployment.json";
export const ModListPath = "archive/pc/mod/modlist.txt";
const Generated = "edgedeck";

export interface ManifestEntry {
  /** Path under the game folder, forward slashes. */
  path: string;
  /** Mod id, or "edgedeck" for files EDGEdeck generates (modlist.txt). */
  mod: string;
  /** File identity of the deployed file: inode as a string for links, size and mtime for copies. */
  ino?: string;
  size: number;
  mtimeMs: number;
  /** True when a foreign file was moved to the backup folder to make room. */
  backup?: boolean;
}

export interface Manifest {
  version: 1;
  library: string;
  gamePath: string;
  method: "link" | "copy";
  time: string;
  /** The game's version at this deploy, when it was known. */
  gameVersion?: string;
  files: ManifestEntry[];
  /** Folders EDGEdeck created, deepest first, removed on undo when empty. */
  dirs: string[];
}

export interface Conflict {
  path: string;
  winner: string;
  losers: string[];
}

export interface Desired {
  rel: string;
  mod: ModInfo | undefined;
  src: string;
  /** Content for generated files. */
  content?: string;
}

export interface Plan {
  method: "link" | "copy";
  desired: Desired[];
  conflicts: Conflict[];
  /** Entries in the current manifest that will be removed. */
  stale: ManifestEntry[];
  /** Files to add or replace. */
  add: Desired[];
  vortex: boolean;
}

export type ChangeKind = "changed" | "missing" | "sourceMissing";

export interface Change {
  entry: ManifestEntry;
  kind: ChangeKind;
}

export type Decision = "keep" | "restore";

function key(rel: string): string {
  return rel.toLowerCase();
}

function gameFile(gamePath: string, rel: string): string {
  return path.join(gamePath, ...rel.split("/"));
}

function identity(file: string): { ino: string; size: number; mtimeMs: number; nlink: number } | undefined {
  try {
    const st = fs.statSync(file, { bigint: true });
    return { ino: st.ino.toString(), size: Number(st.size), mtimeMs: Number(st.mtimeMs), nlink: Number(st.nlink) };
  } catch {
    return undefined;
  }
}

export function readManifest(gamePath: string): Manifest | undefined {
  const file = path.join(gamePath, ManifestName);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
}

function writeManifest(gamePath: string, manifest: Manifest): void {
  fs.writeFileSync(path.join(gamePath, ManifestName), JSON.stringify(manifest, null, 2) + "\n");
}

export function vortexManages(gamePath: string): boolean {
  return fs.existsSync(path.join(gamePath, VortexManifestName));
}


/** Hardlinks need the same volume and a filesystem that allows them; test with a canary file. */
export function canHardlink(libraryRoot: string, gamePath: string): boolean {
  try {
    if (fs.statSync(libraryRoot).dev !== fs.statSync(gamePath).dev) return false;
    const canary = path.join(gamePath, "__edgedeck_canary.tmp");
    const link = canary + ".link";
    fs.writeFileSync(canary, "x");
    try {
      fs.linkSync(canary, link);
      return true;
    } finally {
      fs.rmSync(link, { force: true });
      fs.rmSync(canary, { force: true });
    }
  } catch {
    return false;
  }
}

/** Whether the library file behind a deployed entry was replaced since the deploy (a rebuilt mod). */
function sourceReplaced(entry: ManifestEntry, method: Manifest["method"], d: Desired): boolean {
  if (d.content !== undefined) return false;
  const src = identity(d.src);
  if (!src) return false;
  if (method === "link" && entry.ino) return src.ino !== entry.ino;
  return src.size !== entry.size || Math.abs(src.mtimeMs - entry.mtimeMs) >= 2000;
}

/** Whether a deployed file is still the one EDGEdeck put there. */
function stillOurs(entry: ManifestEntry, method: Manifest["method"], gamePath: string): ChangeKind | "ok" {
  const id = identity(gameFile(gamePath, entry.path));
  if (!id) return "missing";
  if (method === "link" && entry.ino) {
    if (id.ino !== entry.ino) return "changed";
    if (id.nlink < 2 && entry.mod !== Generated) return "sourceMissing";
    return "ok";
  }
  return id.size === entry.size && Math.abs(id.mtimeMs - entry.mtimeMs) < 2000 ? "ok" : "changed";
}

/** Whether a file EDGEdeck generates says something other than it should (or is missing). */
function generatedDiffers(file: string, content: string): boolean {
  try {
    return fs.readFileSync(file, "utf8") !== content;
  } catch {
    return true;
  }
}

/** What the enabled mods want in the game folder, with conflicts resolved by order. */
export function plan(lib: Library, gamePath: string): Plan {
  const manifest = readManifest(gamePath);
  const method = manifest?.method ?? (canHardlink(lib.root, gamePath) ? "link" : "copy");
  const desired = new Map<string, Desired>();
  const conflicts = new Map<string, Conflict>();
  for (const mod of lib.mods) {
    if (!mod.enabled) continue;
    for (const rel of mod.files) {
      const k = key(rel);
      const existing = desired.get(k);
      if (existing) {
        const c = conflicts.get(k) ?? { path: rel, winner: existing.mod!.id, losers: [] };
        c.losers.push(mod.id);
        conflicts.set(k, c);
        continue;
      }
      desired.set(k, { rel, mod, src: sourcePath(lib, mod, rel) });
    }
  }
  // modlist.txt: every deployed archive, winners first, in library order.
  const archives = [...desired.values()].filter((d) => d.rel.toLowerCase().startsWith("archive/pc/mod/") && d.rel.toLowerCase().endsWith(".archive"));
  if (archives.length) {
    desired.set(key(ModListPath), { rel: ModListPath, mod: undefined, src: "", content: archives.map((d) => path.basename(d.rel)).join("\r\n") + "\r\n" });
  }
  const current = new Map((manifest?.files ?? []).map((e) => [key(e.path), e]));
  const stale = [...current.values()].filter((e) => {
    const d = desired.get(key(e.path));
    return !d || (d.mod?.id ?? Generated) !== e.mod;
  });
  const add = [...desired.values()].filter((d) => {
    const e = current.get(key(d.rel));
    if (!e || (d.mod?.id ?? Generated) !== e.mod) return true;
    // A file EDGEdeck writes itself (modlist.txt) is due when what it should say has changed.
    if (d.content !== undefined && generatedDiffers(gameFile(gamePath, d.rel), d.content)) return true;
    if (stillOurs(e, method, gamePath) !== "ok") return true;
    return sourceReplaced(e, method, d);
  });
  return { method, desired: [...desired.values()], conflicts: [...conflicts.values()], stale, add, vortex: vortexManages(gamePath) };
}

/** Files in the manifest that no longer match what EDGEdeck deployed. */
export function detectChanges(gamePath: string): Change[] {
  const manifest = readManifest(gamePath);
  if (!manifest) return [];
  const changes: Change[] = [];
  for (const entry of manifest.files) {
    const state = stillOurs(entry, manifest.method, gamePath);
    if (state !== "ok") changes.push({ entry, kind: state });
  }
  return changes;
}

export interface DeployResult {
  linked: number;
  removed: number;
  kept: number;
  backedUp: number;
  method: "link" | "copy";
  skipped: string[];
  /** Every file this deploy put in, replaced or took out, for the report. */
  changes: DeployChange[];
  /** Mods with files in the game after this deploy. */
  modsInGame: number;
}

export interface DeployChange {
  /** Path under the game folder, forward slashes. */
  path: string;
  /** Mod id, or "edgedeck" for files EDGEdeck generates. */
  mod: string;
  kind: "added" | "replaced" | "removed";
  /** added: a file of the game's was moved to the backup folder first. removed: that backup went back. */
  backup?: boolean;
}

/** Mods (not EDGEdeck's own files) a deploy put in or replaced files for. */
export function modsTouched(result: DeployResult): string[] {
  return [...new Set(result.changes.filter((c) => c.kind !== "removed" && c.mod !== Generated).map((c) => c.mod))];
}

/** Mods a deploy took files out for. */
export function modsRemoved(result: DeployResult): string[] {
  return [...new Set(result.changes.filter((c) => c.kind === "removed" && c.mod !== Generated).map((c) => c.mod))];
}

export function deployReportsFolder(root: string): string {
  return path.join(root, "deploys");
}

/** Reports kept in the library's deploys folder; older ones are deleted. */
const KeptReports = 30;

/**
 * A deploy's report as Markdown: what changed, mod by mod, with every path under the game folder.
 * Written to <library>/deploys/<time>.md; returns its path.
 */
export function writeDeployReport(lib: Library, gamePath: string, result: DeployResult, when = new Date()): string {
  const name = (id: string) => (id === Generated ? "EDGEdeck (load order files)" : (() => {
    const m = lib.mods.find((x) => x.id === id);
    return m ? `${m.name}${m.version ? ` ${m.version}` : ""}` : `${id} (no longer in the library)`;
  })());
  const touched = modsTouched(result);
  const lines = [
    `# Deploy ${when.toLocaleString()}`,
    "",
    `Game: \`${gamePath}\``,
    `Method: ${result.method === "link" ? "hardlinks" : "copies"}`,
    `${result.linked} file${result.linked === 1 ? "" : "s"} put in or replaced for ${touched.length} mod${touched.length === 1 ? "" : "s"}, ${result.removed} removed, ${result.kept} already in place. ${result.modsInGame} mod${result.modsInGame === 1 ? "" : "s"} in the game now.`,
  ];
  if (result.backedUp) lines.push(`${result.backedUp} file${result.backedUp === 1 ? "" : "s"} of the game's own moved to the backup folder to make room; Undo deploy puts ${result.backedUp === 1 ? "it" : "them"} back.`);
  if (!result.changes.length) lines.push("", "Nothing changed: everything was already in place.");
  const byMod = new Map<string, DeployChange[]>();
  for (const c of result.changes) byMod.set(c.mod, [...(byMod.get(c.mod) ?? []), c]);
  const label: Record<DeployChange["kind"], string> = { added: "added", replaced: "replaced", removed: "removed" };
  // Mods by name, EDGEdeck's own files last.
  for (const [id, cs] of [...byMod].sort(([a], [b]) => Number(a === Generated) - Number(b === Generated) || name(a).localeCompare(name(b)))) {
    lines.push("", `## ${name(id)}`, "");
    for (const c of [...cs].sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path))) {
      const note = c.backup ? (c.kind === "removed" ? " (the game's own file put back)" : " (the game's own file backed up first)") : "";
      lines.push(`- ${label[c.kind]}: \`${c.path}\`${note}`);
    }
  }
  if (result.skipped.length) {
    lines.push("", "## Skipped", "", "Changed in the game folder since the last deploy, so left alone:", "");
    for (const p of result.skipped) lines.push(`- \`${p}\``);
  }
  const folder = deployReportsFolder(lib.root);
  fs.mkdirSync(folder, { recursive: true });
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}_${pad(when.getHours())}-${pad(when.getMinutes())}-${pad(when.getSeconds())}`;
  const file = path.join(folder, `${stamp}.md`);
  fs.writeFileSync(file, lines.join("\n") + "\n");
  const old = fs.readdirSync(folder).filter((f) => f.endsWith(".md")).sort().reverse().slice(KeptReports);
  for (const f of old) fs.rmSync(path.join(folder, f), { force: true });
  return file;
}

function backupPath(lib: Library, rel: string): string {
  return path.join(backupFolder(lib.root), ...rel.split("/"));
}

function removeDeployed(lib: Library, gamePath: string, manifest: Manifest, entry: ManifestEntry, force: boolean, skipped: string[]): boolean {
  const target = gameFile(gamePath, entry.path);
  const state = stillOurs(entry, manifest.method, gamePath);
  if (state === "changed" && !force) {
    skipped.push(entry.path);
    return false;
  }
  fs.rmSync(target, { force: true });
  if (entry.backup) {
    const b = backupPath(lib, entry.path);
    if (fs.existsSync(b)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(b, target);
    }
  }
  return true;
}

function ensureDir(gamePath: string, dir: string, manifest: Manifest): void {
  const rel = path.relative(gamePath, dir).split(path.sep).join("/");
  if (!rel || rel.startsWith("..")) return;
  const parts = rel.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const sub = parts.slice(0, i).join("/");
    const abs = path.join(gamePath, ...parts.slice(0, i));
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(abs);
      if (!manifest.dirs.includes(sub)) manifest.dirs.push(sub);
    }
  }
}

/** Removes the folders EDGEdeck created that are empty now, deepest first, and forgets them. */
function cleanDirs(gamePath: string, manifest: Manifest): void {
  for (const dir of [...manifest.dirs].sort((a, b) => b.length - a.length)) {
    const abs = path.join(gamePath, ...dir.split("/"));
    try {
      if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
    } catch {
      // A folder that will not go is not worth failing over.
    }
  }
  manifest.dirs = manifest.dirs.filter((d) => fs.existsSync(path.join(gamePath, ...d.split("/"))));
}

/**
 * Deploys the enabled mods. `decisions` answers the "changed in the game folder" question per path:
 * keep (the changed file is copied into the library and becomes the mod's file) or restore.
 */
export function deploy(lib: Library, gamePath: string, decisions: Map<string, Decision> = new Map(), progress?: (done: number, total: number) => void, gameVersion?: string): DeployResult {
  if (vortexManages(gamePath)) throw new Error("Vortex manages this game folder. Purge in Vortex first (Mods > Purge), then deploy with EDGEdeck.");
  if (!isGameFolder(gamePath)) throw new Error(`${gamePath} does not look like the Cyberpunk 2077 folder (no bin\\x64\\Cyberpunk2077.exe).`);
  const p = plan(lib, gamePath);
  const manifest: Manifest = readManifest(gamePath) ?? { version: 1, library: lib.root, gamePath, method: p.method, time: "", files: [], dirs: [] };
  manifest.library = lib.root;
  const result: DeployResult = { linked: 0, removed: 0, kept: 0, backedUp: 0, method: manifest.method, skipped: [], changes: [], modsInGame: 0 };
  const entries = new Map(manifest.files.map((e) => [key(e.path), e]));

  // Honour the user's answers: "keep" imports the changed game file into the library first.
  for (const [rel, decision] of decisions) {
    const d = p.desired.find((x) => key(x.rel) === key(rel));
    if (decision === "keep" && d?.mod) {
      fs.copyFileSync(gameFile(gamePath, rel), d.src);
    }
  }

  const total = p.stale.length + p.add.length;
  let done = 0;
  const save = () => {
    manifest.time = new Date().toISOString();
    if (gameVersion) manifest.gameVersion = gameVersion;
    writeManifest(gamePath, manifest);
  };

  for (const entry of p.stale) {
    const decided = decisions.get(entry.path);
    if (removeDeployed(lib, gamePath, manifest, entry, decided !== undefined, result.skipped)) {
      entries.delete(key(entry.path));
      result.removed++;
      result.changes.push({ path: entry.path, mod: entry.mod, kind: "removed", ...(entry.backup ? { backup: true } : {}) });
    }
    manifest.files = [...entries.values()];
    progress?.(++done, total);
  }
  if (p.stale.length) cleanDirs(gamePath, manifest);

  for (const d of p.add) {
    const target = gameFile(gamePath, d.rel);
    const existing = entries.get(key(d.rel));
    let backup = existing?.backup ?? false;
    if (existing) {
      // Our own stale copy, or one the user changed and answered about.
      const state = stillOurs(existing, manifest.method, gamePath);
      if (state === "changed" && !decisions.has(d.rel)) {
        result.skipped.push(d.rel);
        continue;
      }
      // "ok" here means the library file was replaced (a rebuilt mod): relink without asking.
      fs.rmSync(target, { force: true });
    } else if (fs.existsSync(target)) {
      // A file we never deployed is in the way: keep it safe, bring it back on undo.
      const b = backupPath(lib, d.rel);
      fs.mkdirSync(path.dirname(b), { recursive: true });
      fs.renameSync(target, b);
      backup = true;
      result.backedUp++;
    }
    ensureDir(gamePath, path.dirname(target), manifest);
    if (d.content !== undefined) {
      fs.writeFileSync(target, d.content);
    } else if (manifest.method === "link") {
      fs.linkSync(d.src, target);
    } else {
      fs.copyFileSync(d.src, target);
    }
    const id = identity(target)!;
    const entry: ManifestEntry = { path: d.rel, mod: d.mod?.id ?? Generated, size: id.size, mtimeMs: id.mtimeMs };
    if (manifest.method === "link") entry.ino = id.ino;
    if (backup) entry.backup = true;
    entries.set(key(d.rel), entry);
    manifest.files = [...entries.values()];
    result.linked++;
    result.changes.push({ path: d.rel, mod: entry.mod, kind: existing ? "replaced" : "added", ...(backup && !existing ? { backup: true } : {}) });
    progress?.(++done, total);
    if (done % 200 === 0) save();
  }
  result.kept = p.desired.length - result.linked - result.skipped.length;
  result.modsInGame = new Set(manifest.files.map((e) => e.mod).filter((m) => m !== Generated)).size;
  save();
  return result;
}

/** Removes everything in the manifest, restores backups, deletes the folders EDGEdeck created. */
export function undo(lib: Library, gamePath: string, force = false): { removed: number; skipped: string[] } {
  const manifest = readManifest(gamePath);
  if (!manifest) return { removed: 0, skipped: [] };
  const skipped: string[] = [];
  let removed = 0;
  const remaining: ManifestEntry[] = [];
  for (const entry of manifest.files) {
    if (removeDeployed(lib, gamePath, manifest, entry, force, skipped)) removed++;
    else remaining.push(entry);
  }
  cleanDirs(gamePath, manifest);
  if (remaining.length) {
    manifest.files = remaining;
    writeManifest(gamePath, manifest);
  } else {
    fs.rmSync(path.join(gamePath, ManifestName), { force: true });
  }
  return { removed, skipped };
}

/** Per-mod status text for the list, in plain words. */
export interface PendingChange {
  path: string;
  /** Mod id, or "edgedeck" for generated files. */
  mod: string;
  kind: "add" | "replace" | "restore" | "relink" | "remove";
  /** Plain words. */
  detail: string;
  /** For replace: the mod id whose file goes away. */
  prevMod?: string;
}

/** Every file the next deploy would touch, with the reason. A replaced path is one row. */
export function pendingChanges(lib: Library, gamePath: string, p: Plan): PendingChange[] {
  const manifest = readManifest(gamePath);
  const current = new Map((manifest?.files ?? []).map((e) => [key(e.path), e]));
  const desired = new Map(p.desired.map((d) => [key(d.rel), d]));
  const out: PendingChange[] = [];
  for (const d of p.add) {
    const id = d.mod?.id ?? Generated;
    const e = current.get(key(d.rel));
    if (!e) out.push({ path: d.rel, mod: id, kind: "add", detail: d.content !== undefined ? "generated by EDGEdeck" : "new in the game folder" });
    else if (e.mod !== id) out.push({ path: d.rel, mod: id, kind: "replace", detail: "takes over the path from", prevMod: e.mod });
    else {
      const st = stillOurs(e, p.method, gamePath);
      if (st === "missing") out.push({ path: d.rel, mod: id, kind: "restore", detail: "missing from the game folder" });
      else if (st === "changed") out.push({ path: d.rel, mod: id, kind: "restore", detail: "changed in the game folder; deploy asks whether to keep it" });
      else out.push({ path: d.rel, mod: id, kind: "relink", detail: d.content !== undefined ? "the generated content changed (load order)" : "the library file was replaced (new version or rebuild)" });
    }
  }
  for (const e of p.stale) {
    if (desired.has(key(e.path))) continue; // Shown as the replace row above.
    const mod = lib.mods.find((m) => m.id === e.mod);
    out.push({ path: e.path, mod: e.mod, kind: "remove", detail: e.mod === Generated ? "no archives left to list" : !mod ? "the mod was removed from the library" : !mod.enabled ? "the mod is off" : "the mod no longer has this file" });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function modStatus(lib: Library, gamePath: string, mod: ModInfo, p: Plan, manifest: Manifest | undefined, changes: Change[]): string {
  const deployedFiles = new Set((manifest?.files ?? []).filter((e) => e.mod === mod.id).map((e) => key(e.path)));
  const changed = changes.some((c) => c.entry.mod === mod.id && c.kind === "changed");
  const conflicts = p.conflicts.filter((c) => c.winner === mod.id || c.losers.includes(mod.id)).length;
  const parts: string[] = [];
  if (!mod.enabled) parts.push(deployedFiles.size ? "off, still deployed" : "off");
  else if (changed) parts.push("changed in game folder");
  else if (deployedFiles.size === 0) parts.push("not deployed yet");
  else if (p.add.some((d) => d.mod?.id === mod.id)) parts.push("changed, deploy again");
  else parts.push("deployed");
  if (conflicts) parts.push(`${conflicts} conflict${conflicts === 1 ? "" : "s"}`);
  return parts.join(", ");
}
