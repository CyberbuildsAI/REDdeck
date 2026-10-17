# @edgemodders/edgedeck-mcp

EDGEdeck's MCP server and command line, for managing Cyberpunk 2077 mods from an AI assistant or a script. It is the same library and deployer as the [EDGEdeck](https://marketplace.visualstudio.com/items?itemName=edgemodders.edgedeck) extension for VS Code, and the two can run side by side: they share the library folder, and the extension reloads when the tools change it.

Windows only, like the game's mod tools. Needs Node.js 20 or newer.

## The MCP server

```
npx -y @edgemodders/edgedeck-mcp [--library <folder>] [--game <folder>]
```

It talks MCP over stdio. The library defaults to `%USERPROFILE%\EDGEdeck`; the game is found through Steam, GOG or Epic. For Claude Code:

```
claude mcp add edgedeck -- npx -y @edgemodders/edgedeck-mcp
```

Tools:

| Tool | Does |
|---|---|
| `edgedeck_list` | Every mod: on or off, version, kinds, status, size; the frameworks line after a game patch |
| `edgedeck_mod` | One mod in detail: files, versions, Nexus info |
| `edgedeck_add` | Add a zip, 7z, rar, single mod file or folder to the library |
| `edgedeck_install_project` | Add or refresh a REDcode or WolvenKit project's packed output |
| `edgedeck_turn` | Turn a mod on or off |
| `edgedeck_move` | Move a mod up or down; higher wins a conflict |
| `edgedeck_remove` | Remove a mod from the library |
| `edgedeck_pending` | What the next deploy would add, replace, put back or remove, and why |
| `edgedeck_deploy` | Put the active loadout in the game (refuses while the game runs) |
| `edgedeck_undo` | Take everything EDGEdeck deployed out again, putting backups back |
| `edgedeck_changes` | Deployed files changed or missing in the game folder since |
| `edgedeck_conflicts` | Files two enabled mods both have, and who wins |
| `edgedeck_loadout` | Save, switch to (load) or list loadouts |
| `edgedeck_vortex` | List and import the mods Vortex has for the game (Vortex is not changed) |

Nothing touches the game folder until `edgedeck_deploy` or `edgedeck_undo`; the server tells the assistant to ask the player first.

## The command line

```
npx -p @edgemodders/edgedeck-mcp edgedeck list
```

or, installed with `npm i -g @edgemodders/edgedeck-mcp`, just `edgedeck list`. Commands: `list`, `mod`, `add`, `install-project`, `on`, `off`, `up`, `down`, `remove`, `pending`, `deploy`, `undo`, `changes`, `conflicts`, `loadout save|load|list`, `vortex list|import`, `mcp`. Options `--library`, `--game`, and `--json` for machine output.

## More

Guide and design: https://edgemodders.github.io/EDGEdeck/. Source and issues: https://github.com/Edgemodders/EDGEdeck. MIT licensed; it ships 7-Zip's `7za.exe` (GNU LGPL), see ThirdPartyNotices.txt. Not affiliated with CD PROJEKT.
