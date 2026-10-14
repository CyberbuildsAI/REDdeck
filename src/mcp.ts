// The MCP server: REDdeck's verbs as tools for an assistant, over stdio. Started by the extension
// (VS Code registers it for the agents it hosts), by `claude mcp add`, or by `reddeck mcp`.
//   node dist/mcp.js [--library <folder>] [--game <folder>]
// Every call opens the library afresh, so changes made in VS Code in between are seen, and
// changes made here show up in VS Code through its library watcher.

import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openSession, verbs, type Verb } from "./verbs";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
};
const options = { library: flag("library"), game: flag("game"), extensionRoot: path.resolve(__dirname, "..") };
const version = (() => {
  try {
    return (require(path.join(options.extensionRoot, "package.json")) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
})();

const Instructions = `REDdeck manages Cyberpunk 2077 mods: a library of mods outside the game folder, deployed into the game with hardlinks.
Mods are named by id (see reddeck_list). The list's order matters: the mod higher up wins a conflict.
Turning a mod on or off, adding, removing, moving and loading a loadout change only the library; nothing touches the game until reddeck_deploy. Say so when you change something, and offer to deploy.
reddeck_deploy and reddeck_undo write to the game folder; ask the player before running them unless they asked for exactly that.
Frameworks (RED4ext, CET, redscript, ArchiveXL, TweakXL, Codeware, ...) are mods with the "framework" kind and most other mods need them. After a game patch, reddeck_list's frameworks line says "game updated to ..." and which have updates.
Conflicts inside .archive files are seen only by the REDdeck extension with REDbridge; reddeck_conflicts covers file paths.`;

function run(fn: () => Verb | Promise<Verb>) {
  return async () => {
    try {
      const v = await fn();
      return { content: [{ type: "text" as const, text: `${v.text}\n\n${JSON.stringify(v.data, null, 2)}` }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }] };
    }
  };
}

const session = () => openSession(options);

const server = new McpServer({ name: "reddeck", version }, { instructions: Instructions });

server.registerTool(
  "reddeck_list",
  {
    title: "List mods",
    description: "Every mod in the library with its id, version, kinds, size, on/off and status (deployed, not deployed yet, changed in game folder, update available, ...), the library's disk totals, and the frameworks line with the game version.",
    inputSchema: { largest_first: z.boolean().optional().describe("Sort by size, biggest first") },
    annotations: { readOnlyHint: true },
  },
  ({ largest_first }) => run(() => verbs.list(session(), !!largest_first))(),
);

server.registerTool(
  "reddeck_mod",
  {
    title: "Mod details",
    description: "One mod in full: every file it deploys with sizes, its folder in the library, where it came from (file, Nexus, Vortex, REDcode project), Nexus data, status and its conflicts.",
    inputSchema: { id: z.string().describe("The mod id from reddeck_list") },
    annotations: { readOnlyHint: true },
  },
  ({ id }) => run(() => verbs.mod(session(), id))(),
);

server.registerTool(
  "reddeck_add",
  {
    title: "Add a mod",
    description: "Adds a zip, 7z, rar or folder to the library, working out what kind of mod it is and where its files go. The mod starts on; deploy to put it in the game. An archive with several options fails with their labels; call again with option.",
    inputSchema: { path: z.string().describe("Full path of the archive or folder"), name: z.string().optional().describe("A name; default is the file name"), option: z.string().optional().describe("Which option of a multi-option archive to take") },
  },
  ({ path: p, name, option }) => run(() => verbs.add(session(), p, name, option))(),
);

server.registerTool(
  "reddeck_install_project",
  {
    title: "Install a project",
    description: "Takes a REDcode or WolvenKit project's packed/ folder into the library: adds it as version dev the first time, and on later calls replaces the files of the mod that follows the project. The mod is turned on; deploy to put it in the game. Pack the project first.",
    inputSchema: { project: z.string().describe("Full path of the .cpmodproj file") },
  },
  ({ project }) => run(() => verbs.installProject(session(), project))(),
);

server.registerTool(
  "reddeck_turn",
  {
    title: "Turn a mod on or off",
    description: "Turns a mod on or off in the library. The game changes only on the next deploy.",
    inputSchema: { id: z.string(), on: z.boolean() },
    annotations: { idempotentHint: true },
  },
  ({ id, on }) => run(() => verbs.turn(session(), id, on))(),
);

server.registerTool(
  "reddeck_move",
  {
    title: "Move a mod in the order",
    description: "Moves a mod one place up or down. The mod higher in the list wins a conflict over the ones below it. Returns the whole order.",
    inputSchema: { id: z.string(), direction: z.enum(["up", "down"]) },
  },
  ({ id, direction }) => run(() => verbs.move(session(), id, direction))(),
);

server.registerTool(
  "reddeck_remove",
  {
    title: "Remove a mod",
    description: "Deletes a mod from the library. Its deployed files leave the game on the next deploy. The kept download, if any, stays.",
    inputSchema: { id: z.string() },
    annotations: { destructiveHint: true },
  },
  ({ id }) => run(() => verbs.remove(session(), id))(),
);

server.registerTool(
  "reddeck_pending",
  {
    title: "What the next deploy does",
    description: "Every file the next deploy adds, replaces, puts back, relinks or removes, with the mod and the reason. Use it before reddeck_deploy to say what will happen.",
    annotations: { readOnlyHint: true },
  },
  run(() => verbs.pending(session())),
);

server.registerTool(
  "reddeck_deploy",
  {
    title: "Deploy",
    description: "Hardlinks (or copies, on another drive) the files of every mod that is on into the game folder, writes the archive load order, prepares REDmod packages and records a manifest. A file changed in the game folder since the last deploy is skipped and named; call again with keep (import the changed file into the library) or restore (put the mod's file back). Refuses while Vortex manages the game folder.",
    inputSchema: { keep: z.array(z.string()).optional().describe("Game-folder paths whose changed file to keep"), restore: z.array(z.string()).optional().describe("Game-folder paths to overwrite with the mod's file") },
    annotations: { destructiveHint: true },
  },
  ({ keep, restore }) => run(() => verbs.deploy(session(), keep, restore))(),
);

server.registerTool(
  "reddeck_undo",
  {
    title: "Undo deploy",
    description: "Removes every file REDdeck deployed, and nothing else, and puts backed-up files back.",
    annotations: { destructiveHint: true },
  },
  run(() => verbs.undo(session())),
);

server.registerTool(
  "reddeck_changes",
  {
    title: "Changes in the game folder",
    description: "Deployed files that were changed or deleted by something else (Steam verify, the game, another tool) since the last deploy, and library files that went missing.",
    annotations: { readOnlyHint: true },
  },
  run(() => verbs.changes(session())),
);

server.registerTool(
  "reddeck_conflicts",
  {
    title: "Conflicts by file path",
    description: "Mods that deploy the same path: the winner (higher in the order) and the losers. Conflicts inside .archive files are not included; the REDdeck extension shows those with REDbridge.",
    annotations: { readOnlyHint: true },
  },
  run(() => verbs.conflicts(session())),
);

server.registerTool(
  "reddeck_loadout",
  {
    title: "Loadouts",
    description: "Loadouts are named sets of which mods are on; one is active (the mods' on/off state, what a deploy uses), the order is shared. save: a new loadout from the state now. load: make a loadout active by name, or import a .json file and make it active (deploy afterwards). list: every loadout, the active one marked with *.",
    inputSchema: { action: z.enum(["save", "load", "list"]), name: z.string().optional().describe("The loadout's name, for save and load") },
  },
  ({ action, name }) => run(() => verbs.loadout(session(), action, name))(),
);

server.registerTool(
  "reddeck_vortex",
  {
    title: "Vortex",
    description: "list: the mods Vortex has for Cyberpunk 2077 on this PC. import: copies them into the library; Vortex is left alone.",
    inputSchema: { action: z.enum(["list", "import"]) },
  },
  ({ action }) => run(() => verbs.vortex(session(), action))(),
);

void server.connect(new StdioServerTransport()).catch((err) => {
  process.stderr.write(`reddeck mcp: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
