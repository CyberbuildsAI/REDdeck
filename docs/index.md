# RED<span class="y">deck</span> docs

REDdeck is a mod manager for Cyberpunk 2077 that runs inside VS Code and REDcode. One list of mods, four verbs: add, turn on or off, deploy, remove. These pages cover how to use it, how it is designed, and how to build it.

| Document | What it covers |
|---|---|
| [Guide](guide.html) | Install, set up, the Mods view and the REDdeck page, adding mods, deploying, conflicts, frameworks and game patches, updates, disk space, loadouts, settings, the command line, troubleshooting |
| [Design](design.html) | The goal and its rules, how Cyberpunk mods are installed, what Vortex solves, the UI, the library and deployment, conflicts, Nexus, risks and roadmap |
| [Dev setup](dev-setup.md) | Every tool and step needed to build REDdeck on a new machine |

## Roadmap status

As of 0.19.0 (2026-10-13). REDdeck manages the owner's two PCs; it is not on the Marketplace, and installs from the [releases page](https://github.com/Edgemodders/REDdeck/releases).

| Phase | Status |
|---|---|
| M0 Decide | Done. Name, repository, the word list and the four verbs |
| M1 Library | Done. Add from zip, 7z, rar or folder with the classifier; hardlink or copy deploy with a manifest, undo and backups; changes made outside REDdeck; conflicts by order and `modlist.txt`; import from Vortex; a pending-changes list that explains every file the next deploy touches; sizes everywhere for disk-space questions |
| M2 Kinds | Done. Frameworks group with the game version, a warning when the game changed since the last deploy and a Nexus check for the frameworks; detail panel; file conflicts with Let X win; archive conflicts through REDbridge, which Get REDbridge fetches and keeps current; REDmod deploy |
| M3 Nexus | Done, in daily use with a pasted key. Sign in in the browser with OAuth and PKCE, built and tested against a fake Nexus, live once Nexus assigns REDdeck a client id (asked 2026-10-13); a pasted key stays a choice. Update check once a day, one row per mod with a version dropdown, update from the row, nxm link handling, downloads for Premium and for links with a key |
| M4 Loop | REDdeck side done: a `.cpmodproj`'s packed output as a mod that is re-synced after every pack and relinked on deploy. Left: the REDcode side (a one-click hand-off and Test in game), REDnode packages as a kind |
| M5 Share | Done. Loadouts, the `reddeck` command line, and an MCP server with the same verbs as tools, registered with VS Code for the agents it hosts and one line away for Claude Code. A Set up group walks a new install through the game folder, REDbridge, Nexus and Vortex. No Marketplace publishing for now |

Source code, releases and issues: [github.com/Edgemodders/REDdeck](https://github.com/Edgemodders/REDdeck)
