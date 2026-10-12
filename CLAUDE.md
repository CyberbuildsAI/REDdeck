# REDdeck: notes for Claude sessions

REDdeck is a mod manager for Cyberpunk 2077 built as a VS Code extension. It is one of four repos by the same owner: REDnode (runtime scripting), REDcode (the IDE), REDbridge (the engine host, GPL-3.0) and REDdeck (this one). REDnode's `CLAUDE.md` and `docs/dev-setup.md` set the shared conventions. The name: a deck of mods, a nod to the cyberdeck, and the mods waiting "on deck" before you deploy them.

## Current status and next step

- **Design:** `docs/design.html`, published at https://cyberbuildsai.github.io/REDdeck/design.html. Read it before any feature work; it has the UI mockup, the word list, the library layout, the deployment rules and the roadmap. It is a standalone HTML page in the HUD style; edit it in place and keep the draft number in its status bar current.
- **M0 done (2026-10-11):** repo in the house style, extension scaffold, settings for the game and library paths.
- **M1 built (2026-10-11), not yet tested against a real game:** `src/classifier.ts` (one classifier, option folders become a choice), `src/library.ts` (library.json, mod.json, files laid out as they deploy), `src/deploy.ts` (plan, hardlink or copy, manifest `reddeck.deployment.json`, backups, undo, external changes, modlist.txt), `src/extract.ts` (bundled 7za for zip and 7z, system 7-Zip or WinRAR for rar), `src/vortex.ts` (list and import, read-only). `npm run smoke` passes against a fake game folder and this machine's Vortex library. The laptop's game is still managed by Vortex, so the first real deploy happens after a Vortex purge or on the owner's other PC.
- **M2 in progress (2026-10-11):** done: `src/detailPanel.ts` (webview, click a mod), `src/conflicts.ts` + `src/bridgeClient.ts` (archive conflicts through REDbridge 0.4.0 `archive.openMod`, bridge started without a game, listings cached by mtime), `src/redmod.ts` (`redMod.exe deploy -modlist` after a deploy), `src/game.ts` (exe version via PowerShell). Left for M2: a framework version check, which needs Nexus data (M3).
- **M3 built (2026-10-11), not yet run against a live Nexus account:** `src/nexus.ts` (REST v1 client with fetch, personal API key from `context.secrets`, files/mod/md5/download links, user agent as Nexus asks), `src/nxm.ts` (nxm link parsing, HKCU registration of a PowerShell forwarder to `vscode://cyberbuildsai.reddeck/nxm?url=`, release, who-has-it detection), extension commands under "Nexus:" plus the URI handler, update check once a day. `src/uiTest.ts` + `npm run test:ui` run the extension in a real VS Code.
- **M4, REDdeck side, built (2026-10-11):** `src/project.ts` (find `.cpmodproj`, classify `packed/`, `syncProjects` re-copies when the packed folder is newer); `reddeck.addProject`; `deploy.ts` relinks a replaced library file silently (`sourceReplaced`). The REDcode side (an "Install into REDdeck" command, Test in game) belongs in the REDcode repo and is not started.
- **Tests:** `npm run smoke` (core, including a live REDbridge call and a read-only Vortex import) and `npm run test:ui` (real VS Code) both pass as of 0.5.0.
- **M5, first part, built (2026-10-11):** `src/loadouts.ts` (save, list, apply) with commands, and `bin/reddeck.mjs`, a command line over `dist/core.js` with `--json`; both in the smoke test.
- **Next:** the owner tests Nexus with a real key and a real nxm link, and deploys to a real game after purging Vortex. Then: MCP tools beside REDbridge's (the CLI's commands are the tool list), publish to Open VSX and the Marketplace (needs the owner's publisher accounts), REDnode packages as a kind once REDnode defines its mod layout, the REDcode-side hand-off (REDcode repo), a framework version check in the Frameworks group header.

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

- `docs/` is published by GitHub Pages at https://cyberbuildsai.github.io/REDdeck/ through `.github/workflows/pages.yml`. Settings > Pages > Source must be GitHub Actions.
- Write docs as markdown in `docs/`. Jekyll renders them with the HUD layout. Add every new page to `nav` in `docs/_config.yml`.
