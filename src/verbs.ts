// The verbs: what the command line and the MCP server do, over the same core as the extension.
// Each verb returns a JSON-able result and a one-line text for humans, so the two front ends
// stay identical and an assistant sees exactly what a script would.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { classify, rednodeManifest } from "./classifier";
import { settleNewVersion } from "./families";
import { deploy, detectChanges, modStatus, modsTouched, writeDeployReport, pendingChanges, plan, readManifest, undo, type Decision } from "./deploy";
import { extractArchive, findSevenZip } from "./extract";
import { checkFrameworks, frameworkSummary } from "./frameworks";
import { findGame, gameVersion, isGameFolder } from "./game";
import { addMod, defaultLibraryPath, keepDownload, loadLibrary, modFolder, moveMod, removeMod, saveLibrary, saveMod, type Library, type ModInfo } from "./library";
import { applyLoadout, listLoadouts, loadoutsFolder, saveLoadout } from "./loadouts";
import { installProject } from "./project";
import { deployRedmod, enabledRedmodPackages } from "./redmod";
import { formatBytes, librarySize, modSize } from "./sizes";
import { importFromVortex, listVortexMods } from "./vortex";

export interface Session {
  lib: Library;
  libraryRoot: string;
  game: string;
  sevenZa?: string;
}

export interface Verb<T = unknown> {
  data: T;
  text: string;
}

const DefaultGame = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Cyberpunk 2077";

/** Opens the library and settles the game folder the way the extension does: given, remembered, found, default. */
export function openSession(opts: { library?: string; game?: string; extensionRoot: string }): Session {
  const libraryRoot = opts.library ?? defaultLibraryPath();
  const lib = loadLibrary(libraryRoot, opts.game ?? "");
  const remembered = lib.info.gamePath && isGameFolder(lib.info.gamePath) ? lib.info.gamePath : undefined;
  const game = opts.game ?? remembered ?? findGame() ?? DefaultGame;
  if (opts.game && lib.info.gamePath !== opts.game) {
    lib.info.gamePath = opts.game;
    saveLibrary(lib);
  }
  return { lib, libraryRoot, game, sevenZa: findSevenZip(opts.extensionRoot) };
}

function find(s: Session, id: string): ModInfo {
  const mod = s.lib.mods.find((m) => m.id === id);
  if (!mod) throw new Error(`no mod with id ${id}; see list`);
  return mod;
}

function gameReady(s: Session): void {
  if (!isGameFolder(s.game)) throw new Error(`${s.game} does not look like the Cyberpunk 2077 folder (no bin\\x64\\Cyberpunk2077.exe). Pass --game or set it in REDdeck.`);
}

export const verbs = {
  /** Every mod with its status and size, the library totals and the frameworks line. */
  async list(s: Session, largestFirst = false): Promise<Verb> {
    const { lib, game } = s;
    const p = fs.existsSync(game) && isGameFolder(game) ? plan(lib, game) : undefined;
    const manifest = p ? readManifest(game) : undefined;
    const changes = p ? detectChanges(game) : [];
    const rows = lib.mods.map((m) => ({ id: m.id, name: m.name, version: m.version, enabled: m.enabled, kinds: m.kinds, files: m.files.length, bytes: modSize(lib, m).total, status: p ? modStatus(lib, game, m, p, manifest, changes) : "" }));
    const sizes = librarySize(lib);
    const sorted = largestFirst ? [...rows].sort((a, b) => b.bytes - a.bytes) : rows;
    const frameworks = p ? checkFrameworks(lib, await gameVersion(game), manifest) : undefined;
    const fwLine = frameworks && frameworks.frameworks.length && frameworkSummary(frameworks) ? `\nframeworks: ${frameworkSummary(frameworks)}` : "";
    const text =
      (sorted.map((r) => `${r.enabled ? "[x]" : "[ ]"} ${r.id.padEnd(28)} ${(r.version || "").padEnd(8)} ${formatBytes(r.bytes).padStart(8)}  ${r.kinds.join(",").padEnd(22)} ${r.status}`).join("\n") || "no mods") +
      `\n${formatBytes(sizes.mods)} in mods, ${formatBytes(sizes.downloads)} in kept downloads${sizes.backups ? `, ${formatBytes(sizes.backups)} in deploy backups` : ""}${fwLine}`;
    return { data: { library: s.libraryRoot, game, gameVersion: frameworks?.game, deployedGameVersion: frameworks?.deployed, sizes, mods: sorted }, text };
  },

  /** One mod in full: files with sizes, where it came from, Nexus data, status and conflicts. */
  mod(s: Session, id: string): Verb {
    const { lib, game } = s;
    const mod = find(s, id);
    const p = isGameFolder(game) ? plan(lib, game) : undefined;
    const status = p ? modStatus(lib, game, mod, p, readManifest(game), detectChanges(game)) : "";
    const sizes = modSize(lib, mod);
    const conflicts = p ? p.conflicts.filter((c) => c.winner === mod.id || c.losers.includes(mod.id)).map((c) => ({ path: c.path, winner: c.winner, losers: c.losers })) : [];
    const data = {
      id: mod.id,
      name: mod.name,
      version: mod.version,
      enabled: mod.enabled,
      kinds: mod.kinds,
      added: mod.added,
      folder: modFolder(lib, mod),
      source: mod.source,
      nexus: mod.nexus,
      status,
      bytes: sizes.total,
      files: mod.files.map((f) => ({ path: f, bytes: sizes.files.get(f) ?? 0 })),
      conflicts,
    };
    const text = `${mod.name} ${mod.version} [${mod.kinds.join(" ")}] ${mod.enabled ? "on" : "off"}${status ? `, ${status}` : ""}; ${mod.files.length} files, ${formatBytes(sizes.total)}${conflicts.length ? `; ${conflicts.length} conflicts` : ""}\n${mod.files.join("\n")}`;
    return { data, text };
  },

  /** Adds a zip, 7z, rar or folder. An archive with options needs the option's label. */
  async add(s: Session, source: string, name?: string, option?: string): Promise<Verb> {
    if (!fs.existsSync(source)) throw new Error(`${source} does not exist`);
    const isFile = fs.statSync(source).isFile();
    const modName = name ?? path.basename(source, isFile ? path.extname(source) : "");
    let folder = source;
    let temp: string | undefined;
    try {
      if (isFile) {
        temp = fs.mkdtempSync(path.join(os.tmpdir(), "reddeck-verb-"));
        await extractArchive(source, temp, s.sevenZa);
        folder = temp;
      }
      let c = classify(folder, modName);
      if (c.options) {
        const pick = option ? c.options.find((o) => o.label === option) : undefined;
        if (!pick) throw new Error(`this mod has options: ${c.options.map((o) => o.label).join(", ")}. Say which one`);
        c = classify(pick.folder, modName);
      }
      if (!c.placements.length) throw new Error("nothing in there looks like a Cyberpunk mod file");
      const manifest = rednodeManifest(c.placements);
      const mod = addMod(s.lib, c.placements, { name: name ?? manifest?.name ?? modName, version: manifest?.version, source: isFile ? { type: "file", path: keepDownload(s.lib, source) } : { type: "folder", path: source } });
      const settled = settleNewVersion(s.lib, mod);
      const note = settled.replaced ? `; a new version of ${settled.replaced.name} ${settled.replaced.version}, which is off now` : settled.older ? `; older than ${settled.older.version}, so it is off` : "";
      return { data: { added: { id: mod.id, name: mod.name, version: mod.version, kinds: mod.kinds, files: mod.files.length, enabled: mod.enabled }, replaced: settled.replaced?.id, unplaced: c.unplaced }, text: `added ${mod.id} (${mod.files.length} files, ${mod.kinds.join(", ")})${note}; ${mod.enabled ? "it is on, " : ""}deploy to put it in the game${c.unplaced.length ? `; not placed: ${c.unplaced.join(", ")}` : ""}` };
    } finally {
      if (temp) fs.rmSync(temp, { recursive: true, force: true });
    }
  },

  /** Adds a REDcode or WolvenKit project's packed output, or refreshes the mod that follows it, and turns it on. */
  installProject(s: Session, projectFile: string): Verb {
    if (!fs.existsSync(projectFile)) throw new Error(`${projectFile} does not exist`);
    const { mod, added } = installProject(s.lib, projectFile);
    return {
      data: { id: mod.id, name: mod.name, version: mod.version, kinds: mod.kinds, files: mod.files.length, added },
      text: `${added ? "added" : "refreshed"} ${mod.id} from its project (${mod.files.length} files, ${mod.kinds.join(", ")}); it is on, deploy to put it in the game`,
    };
  },

  turn(s: Session, id: string, on: boolean): Verb {
    const mod = find(s, id);
    mod.enabled = on;
    saveMod(s.lib, mod);
    return { data: { id: mod.id, enabled: mod.enabled }, text: `${mod.id}: ${on ? "on" : "off"}; deploy to apply` };
  },

  move(s: Session, id: string, direction: "up" | "down"): Verb {
    const mod = find(s, id);
    moveMod(s.lib, mod, direction === "up" ? -1 : 1);
    return { data: { order: s.lib.info.order }, text: s.lib.info.order.join("\n") };
  },

  remove(s: Session, id: string): Verb {
    const mod = find(s, id);
    removeMod(s.lib, mod);
    return { data: { removed: mod.id }, text: `removed ${mod.id} from the library; its deployed files leave on the next deploy` };
  },

  /** Deploys. A file changed outside REDdeck is skipped unless named in keep (import it) or restore (overwrite it). */
  async deploy(s: Session, keep: string[] = [], restore: string[] = []): Promise<Verb> {
    gameReady(s);
    const decisions = new Map<string, Decision>();
    for (const p of keep) decisions.set(p, "keep");
    for (const p of restore) decisions.set(p, "restore");
    const result = deploy(s.lib, s.game, decisions, undefined, await gameVersion(s.game));
    const redmod = enabledRedmodPackages(s.lib).length ? await deployRedmod(s.lib, s.game) : undefined;
    const report = writeDeployReport(s.lib, s.game, result);
    const text = `deployed (${result.method}): ${result.linked} added for ${modsTouched(result).length} mod(s), ${result.removed} removed, ${result.kept} unchanged; ${result.modsInGame} mod(s) in the game; report ${report}${result.skipped.length ? `; skipped (changed in game folder, answer with keep or restore): ${result.skipped.join(", ")}` : ""}${redmod ? `; REDmod: ${redmod.ran ? `${redmod.packages.length} prepared` : redmod.output}` : ""}`;
    return { data: { ...result, redmod, report }, text };
  },

  undo(s: Session): Verb {
    gameReady(s);
    const result = undo(s.lib, s.game);
    return { data: result, text: `undo: ${result.removed} removed${result.skipped.length ? `; left alone: ${result.skipped.join(", ")}` : ""}` };
  },

  /** Files changed, missing or whose library copy is gone since the last deploy. */
  changes(s: Session): Verb {
    gameReady(s);
    const changes = detectChanges(s.game);
    return { data: { changes }, text: changes.map((c) => `${c.kind.padEnd(14)} ${c.entry.path} (${c.entry.mod})`).join("\n") || "no changes" };
  },

  /** What the next deploy adds, replaces, puts back, relinks or removes, and why. */
  pending(s: Session): Verb {
    gameReady(s);
    const rows = pendingChanges(s.lib, s.game, plan(s.lib, s.game));
    return { data: { pending: rows }, text: rows.map((r) => `${r.kind.padEnd(8)} ${r.path.padEnd(60)} ${r.mod.padEnd(26)} ${r.detail}${r.prevMod ? ` ${r.prevMod}` : ""}`).join("\n") || "nothing to deploy" };
  },

  /** Conflicts by file path. Conflicts inside archives need REDbridge, which the extension runs. */
  conflicts(s: Session): Verb {
    gameReady(s);
    const p = plan(s.lib, s.game);
    return { data: { conflicts: p.conflicts }, text: p.conflicts.map((c) => `${c.path}: ${c.winner} wins over ${c.losers.join(", ")}`).join("\n") || "no conflicts by file path" };
  },

  loadout(s: Session, action: "save" | "load" | "list", name?: string): Verb {
    if (action === "save") {
      const file = saveLoadout(s.lib, name ?? "loadout");
      return { data: { file }, text: `saved ${file}` };
    }
    if (action === "load") {
      if (!name) throw new Error("loadout load needs a name or file");
      const file = fs.existsSync(name) ? name : path.join(loadoutsFolder(s.libraryRoot), name.endsWith(".json") ? name : `${name}.json`);
      const r = applyLoadout(s.lib, file);
      return { data: r, text: `loadout applied: ${r.on} on, ${r.off} off${r.missing.length ? `; missing: ${r.missing.join(", ")}` : ""}${r.extra.length ? `; turned off (not in loadout): ${r.extra.join(", ")}` : ""}; deploy to apply` };
    }
    const l = listLoadouts(s.libraryRoot);
    return { data: { loadouts: l }, text: l.map((x) => `${x.name.padEnd(24)} ${x.mods} mods  ${x.saved}  ${x.file}`).join("\n") || "no loadouts" };
  },

  vortex(s: Session, action: "list" | "import", staging?: string): Verb {
    const mods = listVortexMods(s.game, staging);
    if (action === "import") {
      const r = importFromVortex(s.lib, mods);
      return { data: r, text: `imported ${r.added.length}, skipped ${r.skipped.length}${r.skipped.length ? `: ${r.skipped.map((x) => `${x.name} (${x.reason})`).join(", ")}` : ""}` };
    }
    return { data: { mods }, text: mods.map((m) => `${m.deployed ? "[x]" : "[ ]"} ${m.name} ${m.version} (${m.files} files)`).join("\n") || "no Vortex mods found" };
  },
};
