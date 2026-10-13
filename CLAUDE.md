# REDdeck: notes for Claude sessions

REDdeck is a mod manager for Cyberpunk 2077 built as a VS Code extension. It is one of four repos by the same owner: REDnode (runtime scripting), REDcode (the IDE), REDbridge (the engine host, GPL-3.0) and REDdeck (this one). REDnode's `CLAUDE.md` and `docs/dev-setup.md` set the shared conventions. The name: a deck of mods, a nod to the cyberdeck, and the mods waiting "on deck" before you deploy them.

## Current status and next step

- **Design:** `docs/design.html`, published at https://edgemodders.github.io/REDdeck/design.html. Read it before any feature work; it has the UI mockup, the word list, the library layout, the deployment rules and the roadmap. It is a standalone HTML page in the HUD style; edit it in place and keep the draft number in its status bar current.
- **M0 done (2026-10-11):** repo in the house style, extension scaffold, settings for the game and library paths.
- **M1 built (2026-10-11), not yet tested against a real game:** `src/classifier.ts` (one classifier, option folders become a choice), `src/library.ts` (library.json, mod.json, files laid out as they deploy), `src/deploy.ts` (plan, hardlink or copy, manifest `reddeck.deployment.json`, backups, undo, external changes, modlist.txt), `src/extract.ts` (bundled 7za for zip and 7z, system 7-Zip or WinRAR for rar), `src/vortex.ts` (list and import, read-only). `npm run smoke` passes against a fake game folder and this machine's Vortex library. The laptop's game is still managed by Vortex, so the first real deploy happens after a Vortex purge or on the owner's other PC.
- **M2 in progress (2026-10-11):** done: `src/detailPanel.ts` (webview, click a mod), `src/conflicts.ts` + `src/bridgeClient.ts` (archive conflicts through REDbridge 0.4.0 `archive.openMod`, bridge started without a game, listings cached by mtime), `src/redmod.ts` (`redMod.exe deploy -modlist` after a deploy), `src/game.ts` (exe version via PowerShell). The framework version check landed in 0.15.0.
- **M3 built (2026-10-11), not yet run against a live Nexus account:** `src/nexus.ts` (REST v1 client with fetch, personal API key from `context.secrets`, files/mod/md5/download links, user agent as Nexus asks), `src/nxm.ts` (nxm link parsing, HKCU registration of a PowerShell forwarder to `vscode://edgemodders.reddeck/nxm?url=`, release, who-has-it detection), extension commands under "Nexus:" plus the URI handler, update check once a day. `src/uiTest.ts` + `npm run test:ui` run the extension in a real VS Code.
- **M4, REDdeck side, built (2026-10-11):** `src/project.ts` (find `.cpmodproj`, classify `packed/`, `syncProjects` re-copies when the packed folder is newer); `reddeck.addProject`; `deploy.ts` relinks a replaced library file silently (`sourceReplaced`). The REDcode side (an "Install into REDdeck" command, Test in game) belongs in the REDcode repo and is not started.
- **Tests:** `npm run smoke` (core, including a live REDbridge call and a read-only Vortex import) and `npm run test:ui` (real VS Code) both pass as of 0.5.0.
- **Tree drill-down (0.13.0):** `ModNode` has folder and file nodes; a file's `resourceUri` is the library copy and opens with `vscode.open`. `modOf` returns the mod for any non-group node, so the row commands work from folders and files too.
- **Find the game (0.12.1):** `findGame()` in game.ts reads Steam's `libraryfolders.vdf` (Steam root from the registry), GOG's registry key and the Epic default; `reddeck.gamePath` defaults to empty and `reddeck.pickGame` sets it from a folder picker. `isGameFolder` lives in game.ts now.
- **MCP (0.17.0):** `src/verbs.ts` (`openSession`, `verbs.*`, each returning `{ data, text }`) is the one implementation behind `bin/reddeck.mjs` and `src/mcp.ts` (the server over `@modelcontextprotocol/sdk`, bundled to `dist/mcp.js`, tools `reddeck_*`). The extension registers it with `vscode.lm.registerMcpServerDefinitionProvider` when that API exists (VS Code's own binary with `ELECTRON_RUN_AS_NODE`), and `reddeck.mcpSetup` copies the Claude Code line. `watchLibrary` reloads on outside changes by comparing a fingerprint of the library and the manifest time. The smoke test drives the server through the SDK's client.
- **Set up (0.16.0):** `allSetupSteps()`/`refreshSetup()` in extension.ts; `state.setup` feeds the tree's "Set up" group (`SetupStep` nodes in modsView.ts), the page's strip and the `reddeck.setup.<id>` context keys the welcome content uses. Hidden steps live in `reddeck.setupHidden`; `reddeck.setup` clears them. The nxm handler is read once per reload (`state.nxmHandler`), Vortex's staging folder too (`state.vortexMods`).
- **Frameworks check (0.15.0):** `src/frameworks.ts` (`checkFrameworks`, `frameworkSummary`, `frameworkDetail`) compares `state.version` with `manifest.gameVersion`, which `deploy()` now records; `gameChanged()` in extension.ts runs the Nexus check for the frameworks once per game version (`reddeck.checkedForGame`). Shown in the tree's Frameworks header and the page's group row.
- **Sizes (0.14.0):** `src/sizes.ts` (`modSize` cached per mod until its file list changes, `librarySize` for mods, downloads and backups, `formatBytes`); shown in the tree, the page (Size column, Largest first, footer), the detail panel and `reddeck list`.
- **Bridge update check (0.13.3):** `maybeCheckBridge` on reload, daily (`reddeck.lastBridgeCheck`), only when `bridgeExe` is the fetched copy; compares the latest release tag with the installed folder name.
- **Get REDbridge (0.12.0):** `src/bridgeInstall.ts` fetches the latest GitHub release of Edgemodders/REDbridge (asset `*-win-x64.zip`) into `<globalStorage>/bridge/<tag>/` and installs the .NET 10 runtime per user with dotnet-install.ps1 when `dotnet10Root()` finds none; `findBridge` falls back to `installedBridge(storageDir)`. Releases are made with `gh release create vX.Y.Z <zip>` in the REDbridge repo (first one: v0.4.0).
- **Pending changes (0.11.0):** `pendingChanges(lib, gamePath, plan)` in deploy.ts explains every add/replace/restore/relink/remove; `src/changesPanel.ts` shows them (`reddeck.showChanges`), a status link on the page opens a per-mod quick pick first; `reddeck pending` on the CLI.
- **Families (0.10.0):** `src/families.ts` groups the versions of one mod (key: Nexus mod id, else project path, else `baseName`); `activateVersion` moves the family's on-state and order slot to a chosen version; `findSameVersion` stops duplicate downloads. The page, the tree and the detail panel work on families; `ModInfo` entries and ids stay the truth for deploy, loadouts and the CLI.
- **Mods page (0.9.0):** `src/modsPage.ts`, the design doc's table as a webview (`reddeck.openPage`), with client-side search and facet chips kept in webview state across re-renders; `pageRow`/`pageData` in extension.ts build the rows from plan, manifest and changes.
- **Conflicts panel (0.8.0):** `src/conflictsPanel.ts`, opened by the deploy toast's "Show conflicts" button and `reddeck.checkConflicts`; rows have "Let X win" (`placeAbove` in library.ts) and "Turn off". The archive half fills in after `scanArchives`.
- **Never set a user-level DOTNET_ROOT** (0.7.1): it broke Vortex's .NET 9 check on the owner's laptop. `BridgeClient` sets DOTNET_ROOT for the bridge process only, defaulting to the per-user .NET 10 in `%LOCALAPPDATA%\Microsoft\dotnet` (`defaultDotnetRoot`).
- **Nexus sign-in (0.7.0, 2026-10-12):** `src/nexusSso.ts` implements Nexus single sign-on (websocket to sso.nexusmods.com, authorise page, key over the socket, reconnect with the token) behind `reddeck.nexusSignIn`; needs an application slug from the Nexus community team in `reddeck.nexusApplication`, else the command opens the API Access page and asks for the key. The smoke test drives it with a fake socket.
- **M5, first part, built (2026-10-11):** `src/loadouts.ts` (save, list, apply) with commands, and `bin/reddeck.mjs`, a command line over `dist/core.js` with `--json`; both in the smoke test.
- **Next:** the owner tests Nexus with a real key and a real nxm link, and deploys to a real game after purging Vortex. Then: REDnode packages as a kind once REDnode defines its mod layout, the REDcode-side hand-off (REDcode repo), the Nexus application slug once Nexus answers (requested 2026-10-13). No Marketplace publishing for now (owner's decision).

## The design goal

Simplicity with a friendly and obvious UI. Rules that follow from it:

- One list of mods. Four verbs: add, turn on or off, deploy, remove. Everything else goes in the detail panel.
- Plain words: On/Off, Deploy and Undo deploy, Library, Kind, Conflicts and Wins. Never "activate", "purge", "staging", "mod type", "profile".
- Decide, don't ask. A dialog appears only when a wrong guess would lose data.
- Safe by default: never delete a file REDdeck did not put there; everything deployed is in the manifest and can be undone.
- Works offline and alone. REDcode and REDbridge add features when present and are found at runtime with `extensions.getExtension(...)`. Never import their code.

## Conventions

- Commit straight to `main` and push, in small logical commits. Agree the plan in chat first. PRs only for large or risky changes.
- Git identity is set per repo to `CyberbuildsAI` with the GitHub no-reply email. Never change the global identity.
- Two machines push to this repo: `git fetch` and `git rebase origin/main` before every push, after committing.
- Record every tool install in `docs/dev-setup.md`, with versions and exact commands.
- Writing style: plain, short sentences, tables for comparisons. Mark anything unverified as unverified.
- House style is the HUD look. `tools/brand/render.ps1` regenerates the banner, badges and icon; re-run it when versions in the badges change.
- Never commit game files, mod archives or anything extracted from the game.

## Docs site

- `docs/` is published by GitHub Pages at https://edgemodders.github.io/REDdeck/ through `.github/workflows/pages.yml`. Settings > Pages > Source must be GitHub Actions.
- Write docs as markdown in `docs/`. Jekyll renders them with the HUD layout. Add every new page to `nav` in `docs/_config.yml`.
