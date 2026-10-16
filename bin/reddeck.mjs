#!/usr/bin/env node
// The REDdeck command line: the same library and deployer as the extension, for scripts, CI and
// assistants. State is the library's JSON files, so every command prints JSON with --json.
//
//   reddeck list [--size]              what is in the library, its size and status (--size: largest first)
//   reddeck mod <id>                   one mod in full: files, sizes, source, Nexus data, conflicts
//   reddeck add <file|folder> [--name N] [--option FOLDER]
//   reddeck install-project <.cpmodproj>  add a REDcode or WolvenKit project's packed output, or refresh it, and turn it on
//   reddeck on <id> | off <id>         turn a mod on or off
//   reddeck up <id> | down <id>        change the order (first wins conflicts)
//   reddeck remove <id>
//   reddeck deploy [--keep PATH...] [--restore PATH...]
//   reddeck undo
//   reddeck changes                    files changed in the game folder since the deploy
//   reddeck pending                    what the next deploy adds, replaces, puts back or removes, and why
//   reddeck conflicts                  conflicts by file path (archive conflicts need the extension)
//   reddeck loadout save <name> | load <name or file> | list
//   reddeck vortex list | import
//   reddeck mcp                        serve the same verbs as MCP tools over stdio
//
// Options: --library <folder> (default %USERPROFILE%\REDdeck), --game <folder> (default: the
// library's remembered game, else the Steam folder), --json.

import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
// fileURLToPath decodes the URL: a folder with a space ("Cyberpunk 2077") arrives as %20 otherwise.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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
const [cmd, ...rest] = positional;

if (cmd === "mcp") {
  // The bundled server reads --library and --game from process.argv itself.
  require(path.join(root, "dist", "mcp.js"));
} else {
  const core = require(path.join(root, "dist", "core.js"));
  const json = !!flags.json;
  const out = (v) => console.log(json ? JSON.stringify(v.data, null, 2) : v.text);
  const fail = (msg) => {
    console.error(json ? JSON.stringify({ error: msg }) : `error: ${msg}`);
    process.exit(1);
  };
  const need = (value, what) => value ?? fail(`${cmd} needs ${what}`);
  const usage = () => console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).slice(1).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));

  try {
    const s = core.openSession({ library: flags.library, game: flags.game, extensionRoot: root });
    const v = core.verbs;
    switch (cmd) {
      case "list": out(await v.list(s, !!flags.size)); break;
      case "mod": out(v.mod(s, need(rest[0], "a mod id"))); break;
      case "add": out(await v.add(s, need(rest[0], "a file or folder"), flags.name, flags.option)); break;
      case "install-project": out(v.installProject(s, need(rest[0], "a .cpmodproj file"))); break;
      case "on":
      case "off": out(v.turn(s, need(rest[0], "a mod id"), cmd === "on")); break;
      case "up":
      case "down": out(v.move(s, need(rest[0], "a mod id"), cmd)); break;
      case "remove": out(v.remove(s, need(rest[0], "a mod id"))); break;
      case "deploy": out(await v.deploy(s, flags.keep ?? [], flags.restore ?? [])); break;
      case "undo": out(v.undo(s)); break;
      case "changes": out(v.changes(s)); break;
      case "pending": out(v.pending(s)); break;
      case "conflicts": out(v.conflicts(s)); break;
      case "loadout": out(v.loadout(s, rest[0] === "save" || rest[0] === "load" ? rest[0] : "list", rest[1])); break;
      case "vortex": out(v.vortex(s, rest[0] === "import" ? "import" : "list")); break;
      default:
        usage();
        if (cmd) process.exit(1);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
