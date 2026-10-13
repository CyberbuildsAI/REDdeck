#!/usr/bin/env node
// The REDdeck command line: the same library and deployer as the extension, for scripts, CI and
// assistants. State is the library's JSON files, so every command prints JSON with --json.
//
//   reddeck list [--size]              what is in the library, its size and status (--size: largest first)
//   reddeck add <file|folder> [--name N] [--option FOLDER]
//   reddeck on <id> | off <id>         turn a mod on or off
//   reddeck up <id> | down <id>        change the order (first wins conflicts)
//   reddeck remove <id>
//   reddeck deploy [--keep PATH...] [--restore PATH...]
//   reddeck undo
//   reddeck changes                    files changed in the game folder since the deploy
//   reddeck pending                    what the next deploy adds, replaces, puts back or removes, and why
//   reddeck conflicts                  conflicts by file path (archive conflicts need the extension)
//   reddeck loadout save <name> | load <file> | list
//   reddeck vortex list | import
//
// Options: --library <folder> (default %USERPROFILE%\REDdeck), --game <folder> (default: the
// library's remembered game, else the Steam folder), --json.

import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const require = createRequire(import.meta.url);
const core = require(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "dist", "core.js"));

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const multi = key === "keep" || key === "restore";
    const value = args[i + 1] !== undefined && !args[i + 1].startsWith("--") ? args[++i] : true;
    if (multi) (flags[key] ??= []).push(value);
    else flags[key] = value;
  } else positional.push(a);
}
const json = !!flags.json;
const out = (obj, text) => console.log(json ? JSON.stringify(obj, null, 2) : text);
const fail = (msg) => {
  console.error(json ? JSON.stringify({ error: msg }) : `error: ${msg}`);
  process.exit(1);
};

const libraryRoot = flags.library ?? path.join(os.homedir(), "REDdeck");
const defaultGame = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Cyberpunk 2077";
const lib = core.loadLibrary(libraryRoot, flags.game ?? "");
const remembered = lib.info.gamePath && core.isGameFolder(lib.info.gamePath) ? lib.info.gamePath : undefined;
const game = flags.game ?? remembered ?? core.findGame() ?? defaultGame;
if (flags.game && lib.info.gamePath !== flags.game) {
  lib.info.gamePath = flags.game;
  core.saveLibrary(lib);
}
const find = (id) => lib.mods.find((m) => m.id === id) ?? fail(`no mod with id ${id}; see reddeck list`);

const [cmd, ...rest] = positional;
switch (cmd) {
  case "list": {
    const plan = fs.existsSync(game) ? core.plan(lib, game) : undefined;
    const manifest = plan ? core.readManifest(game) : undefined;
    const changes = plan ? core.detectChanges(game) : [];
    const rows = lib.mods.map((m) => ({ id: m.id, name: m.name, version: m.version, enabled: m.enabled, kinds: m.kinds, files: m.files.length, bytes: core.modSize(lib, m).total, status: plan ? core.modStatus(lib, game, m, plan, manifest, changes) : "" }));
    const sizes = core.librarySize(lib);
    const sorted = flags.size ? [...rows].sort((a, b) => b.bytes - a.bytes) : rows;
    const frameworks = plan ? core.checkFrameworks(lib, await core.gameVersion(game), manifest) : undefined;
    const fwLine = frameworks && frameworks.frameworks.length && core.frameworkSummary(frameworks) ? `\nframeworks: ${core.frameworkSummary(frameworks)}` : "";
    out({ library: libraryRoot, game, gameVersion: frameworks?.game, deployedGameVersion: frameworks?.deployed, sizes, mods: rows }, (sorted.map((r) => `${r.enabled ? "[x]" : "[ ]"} ${r.id.padEnd(28)} ${(r.version || "").padEnd(8)} ${core.formatBytes(r.bytes).padStart(8)}  ${r.kinds.join(",").padEnd(22)} ${r.status}`).join("\n") || "no mods") + `\n${core.formatBytes(sizes.mods)} in mods, ${core.formatBytes(sizes.downloads)} in kept downloads${sizes.backups ? `, ${core.formatBytes(sizes.backups)} in deploy backups` : ""}${fwLine}`);
    break;
  }
  case "add": {
    const source = rest[0] ?? fail("add needs a file or folder");
    const isFile = fs.statSync(source).isFile();
    const name = flags.name ?? path.basename(source, isFile ? path.extname(source) : "");
    let folder = source;
    let temp;
    if (isFile) {
      temp = fs.mkdtempSync(path.join(os.tmpdir(), "reddeck-cli-"));
      await core.extractArchive(source, temp, core.findSevenZip(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..")));
      folder = temp;
    }
    let c = core.classify(folder, name);
    if (c.options) {
      const pick = flags.option ? c.options.find((o) => o.label === flags.option) : undefined;
      if (!pick) fail(`this mod has options: ${c.options.map((o) => o.label).join(", ")}. Add --option <name>`);
      c = core.classify(pick.folder, name);
    }
    if (!c.placements.length) fail("nothing in there looks like a Cyberpunk mod file");
    const mod = core.addMod(lib, c.placements, { name, source: isFile ? { type: "file", path: core.keepDownload(lib, source) } : { type: "folder", path: source } });
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
    out({ added: mod, unplaced: c.unplaced }, `added ${mod.id} (${mod.files.length} files, ${mod.kinds.join(", ")})${c.unplaced.length ? `; not placed: ${c.unplaced.join(", ")}` : ""}`);
    break;
  }
  case "on":
  case "off": {
    const mod = find(rest[0] ?? fail(`${cmd} needs a mod id`));
    mod.enabled = cmd === "on";
    core.saveMod(lib, mod);
    out({ id: mod.id, enabled: mod.enabled }, `${mod.id}: ${cmd}`);
    break;
  }
  case "up":
  case "down": {
    const mod = find(rest[0] ?? fail(`${cmd} needs a mod id`));
    core.moveMod(lib, mod, cmd === "up" ? -1 : 1);
    out({ order: lib.info.order }, lib.info.order.join("\n"));
    break;
  }
  case "remove": {
    const mod = find(rest[0] ?? fail("remove needs a mod id"));
    core.removeMod(lib, mod);
    out({ removed: mod.id }, `removed ${mod.id}`);
    break;
  }
  case "deploy": {
    const decisions = new Map();
    for (const p of flags.keep ?? []) decisions.set(p, "keep");
    for (const p of flags.restore ?? []) decisions.set(p, "restore");
    const result = core.deploy(lib, game, decisions, undefined, await core.gameVersion(game));
    let redmod;
    if (core.enabledRedmodPackages(lib).length) redmod = await core.deployRedmod(lib, game);
    out({ ...result, redmod }, `deployed (${result.method}): ${result.linked} added, ${result.removed} removed, ${result.kept} unchanged${result.skipped.length ? `; skipped (changed in game folder, answer with --keep or --restore): ${result.skipped.join(", ")}` : ""}${redmod ? `; REDmod: ${redmod.ran ? `${redmod.packages.length} prepared` : redmod.output}` : ""}`);
    break;
  }
  case "undo": {
    const result = core.undo(lib, game);
    out(result, `undo: ${result.removed} removed${result.skipped.length ? `; left alone: ${result.skipped.join(", ")}` : ""}`);
    break;
  }
  case "changes": {
    const changes = core.detectChanges(game);
    out({ changes }, changes.map((c) => `${c.kind.padEnd(14)} ${c.entry.path} (${c.entry.mod})`).join("\n") || "no changes");
    break;
  }
  case "pending": {
    const p = core.plan(lib, game);
    const rows = core.pendingChanges(lib, game, p);
    out({ pending: rows }, rows.map((r) => `${r.kind.padEnd(8)} ${r.path.padEnd(60)} ${r.mod.padEnd(26)} ${r.detail}${r.prevMod ? ` ${r.prevMod}` : ""}`).join("\n") || "nothing to deploy");
    break;
  }
  case "conflicts": {
    const plan = core.plan(lib, game);
    out({ conflicts: plan.conflicts }, plan.conflicts.map((c) => `${c.path}: ${c.winner} wins over ${c.losers.join(", ")}`).join("\n") || "no conflicts by file path");
    break;
  }
  case "loadout": {
    const sub = rest[0];
    if (sub === "save") {
      const file = core.saveLoadout(lib, rest[1] ?? "loadout");
      out({ file }, `saved ${file}`);
    } else if (sub === "load") {
      const file = rest[1] ?? fail("loadout load needs a file");
      const r = core.applyLoadout(lib, fs.existsSync(file) ? file : path.join(core.loadoutsFolder(libraryRoot), file.endsWith(".json") ? file : `${file}.json`));
      out(r, `loadout applied: ${r.on} on, ${r.off} off${r.missing.length ? `; missing: ${r.missing.join(", ")}` : ""}${r.extra.length ? `; turned off (not in loadout): ${r.extra.join(", ")}` : ""}`);
    } else {
      const l = core.listLoadouts(libraryRoot);
      out({ loadouts: l }, l.map((x) => `${x.name.padEnd(24)} ${x.mods} mods  ${x.saved}  ${x.file}`).join("\n") || "no loadouts");
    }
    break;
  }
  case "vortex": {
    const mods = core.listVortexMods(game);
    if (rest[0] === "import") {
      const r = core.importFromVortex(lib, mods);
      out(r, `imported ${r.added.length}, skipped ${r.skipped.length}${r.skipped.length ? `: ${r.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}` : ""}`);
    } else {
      out({ mods }, mods.map((m) => `${m.deployed ? "[x]" : "[ ]"} ${m.name} ${m.version} (${m.files} files)`).join("\n") || "no Vortex mods found");
    }
    break;
  }
  default:
    console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(1).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
    if (cmd) process.exit(1);
}
