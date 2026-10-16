# @edgemodders/reddeck-mcp

REDdeck's MCP server and command line, for managing Cyberpunk 2077 mods from an AI assistant or a script. It is the same library and deployer as the [REDdeck](https://marketplace.visualstudio.com/items?itemName=edgemodders.reddeck) extension for VS Code, and the two can run side by side: they share the library folder, and the extension reloads when the tools change it.

Windows only, like the game's mod tools. Needs Node.js 20 or newer.

## The MCP server

```
npx -y @edgemodders/reddeck-mcp [--library <folder>] [--game <folder>]
```

It talks MCP over stdio. The library defaults to `%USERPROFILE%\REDdeck`; the game is found through Steam, GOG or Epic. For Claude Code:

```
claude mcp add reddeck -- npx -y @edgemodders/reddeck-mcp
```

Tools:

| Tool | Does |
|---|---|
| `reddeck_list` | Every mod: on or off, version, kinds, status, size; the frameworks line after a game patch |
| `reddeck_mod` | One mod in detail: files, versions, Nexus info |
| `reddeck_add` | Add a zip, 7z, rar, single mod file or folder to the library |
| `reddeck_install_project` | Add or refresh a REDcode or WolvenKit project's packed output |
| `reddeck_turn` | Turn a mod on or off |
| `reddeck_move` | Move a mod up or down; higher wins a conflict |
| `reddeck_remove` | Remove a mod from the library |
| `reddeck_pending` | What the next deploy would add, replace, put back or remove, and why |
| `reddeck_deploy` | Put the active loadout in the game (refuses while the game runs) |
| `reddeck_undo` | Take everything REDdeck deployed out again, putting backups back |
| `reddeck_changes` | Deployed files changed or missing in the game folder since |
| `reddeck_conflicts` | Files two enabled mods both have, and who wins |
| `reddeck_loadout` | Save, switch to (load) or list loadouts |
| `reddeck_vortex` | List and import the mods Vortex has for the game (Vortex is not changed) |

Nothing touches the game folder until `reddeck_deploy` or `reddeck_undo`; the server tells the assistant to ask the player first.

## The command line

```
npx -p @edgemodders/reddeck-mcp reddeck list
```

or, installed with `npm i -g @edgemodders/reddeck-mcp`, just `reddeck list`. Commands: `list`, `mod`, `add`, `install-project`, `on`, `off`, `up`, `down`, `remove`, `pending`, `deploy`, `undo`, `changes`, `conflicts`, `loadout save|load|list`, `vortex list|import`, `mcp`. Options `--library`, `--game`, and `--json` for machine output.

## More

Guide and design: https://edgemodders.github.io/REDdeck/. Source and issues: https://github.com/Edgemodders/REDdeck. MIT licensed; it ships 7-Zip's `7za.exe` (GNU LGPL), see ThirdPartyNotices.txt. Not affiliated with CD PROJEKT.
