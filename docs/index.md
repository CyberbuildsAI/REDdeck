# RED<span class="y">deck</span> docs

REDdeck is a mod manager for Cyberpunk 2077 that runs inside VS Code and REDcode. One list of mods, four verbs: add, turn on or off, deploy, remove. These pages track its setup and, as it grows, how to use it.

| Document | What it covers |
|---|---|
| [Design](design.html) | The goal and its rules, how Cyberpunk mods are installed, what Vortex solves, the UI, the library and deployment, conflicts, Nexus, risks and roadmap |
| [Dev setup](dev-setup.md) | Every tool and step needed to build REDdeck on a new machine |

## Roadmap status

| Phase | Status |
|---|---|
| M0 Decide | Done. Name, repository, the word list and the four verbs |
| M1 Library | Built, awaiting a real-game test. Add from zip, 7z, rar or folder with the classifier; hardlink or copy deploy with a manifest, undo and backups; changes made outside REDdeck; conflicts by order and `modlist.txt`; import from Vortex. `npm run smoke` covers it |
| M2 Kinds | In progress. Done: detail panel, archive conflicts through REDbridge `archive.openMod`, REDmod deploy after a deploy, game version shown. Left: framework version check against Nexus (needs M3) |
| M3 Nexus | Built, not yet run against a live account. API key in secret storage, update check once a day, nxm link handling through a forwarder and the `vscode://` URI handler, downloads for Premium and for links with a key, Open on Nexus |
| M4 Loop | Install and test from a REDcode project, REDnode packages |
| M5 Share | Loadouts, CLI, MCP, publish |

Source code and issues: [github.com/CyberbuildsAI/REDdeck](https://github.com/CyberbuildsAI/REDdeck)
