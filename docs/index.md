# RED<span class="y">pack</span> docs

REDpack is a mod manager for Cyberpunk 2077 that runs inside VS Code and REDcode. One list of mods, four verbs: add, turn on or off, deploy, remove. These pages track its setup and, as it grows, how to use it.

| Document | What it covers |
|---|---|
| [Dev setup](dev-setup.md) | Every tool and step needed to build REDpack on a new machine |

The design document is not published yet. It will appear here with the first working release.

## Roadmap status

| Phase | Status |
|---|---|
| M0 Decide | Done. Name, repository, the word list and the four verbs. The extension scaffold shows the Mods view over an empty library |
| M1 Library | Next: add from zip, 7z, rar or folder, the library layout, hardlink deploy with a manifest, undo, Vortex detection and import |
| M2 Kinds | Frameworks group with game version check, REDmod packages, conflicts (archive-level through REDbridge) |
| M3 Nexus | API key, metadata, updates, nxm links |
| M4 Loop | Install and test from a REDcode project, REDnode packages |
| M5 Share | Loadouts, CLI, MCP, publish |

Source code and issues: [github.com/CyberbuildsAI/REDpack](https://github.com/CyberbuildsAI/REDpack)
