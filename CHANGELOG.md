# Changelog

## 0.20.1 (2026-10-13)

- Import from Vortex finds Vortex's mods when Vortex keeps them outside its default folder in AppData, as it must when the game is on another drive. REDdeck looks in Vortex's deployment manifest, the default folder, and "Vortex Mods\cyberpunk2077" (and similar) on every drive, the game's first. When none has mods, it asks for the folder (Vortex shows it under Settings > Mods > Mod Staging Folder) and remembers it in `reddeck.vortexStagingPath`.

## 0.20.0 (2026-10-13)

- REDnode packages are a kind of their own. A zip or folder with a `rednode-app.json` deploys into REDnode's apps folder, `red4ext/plugins/REDnode/apps/<id>/`, under the id the manifest gives, wherever the manifest sits in the zip; a zip laid out with that path already works too. REDnode itself stays in the Frameworks group. Overlay apps and Node mods such as EDGEbuilder and REDagent install like any other mod, and the REDnode host picks them up while it runs.

## 0.19.0 (2026-10-13)

- Nexus sign-in through the browser, with OAuth and PKCE, the way Vortex signs in: Nexus: sign in opens the Nexus sign-in page, you approve REDdeck, the tab says "Signed in" and REDdeck has an access token and a refresh token in VS Code's secret storage. The sign-in renews itself; when it cannot, REDdeck asks you to sign in again. The REST API takes the token as a Bearer header, so update checks, file lists and downloads are as before. Needs the client id Nexus assigns to REDdeck in `reddeck.nexusClientId`; until then sign-in opens the API Access page and asks for the key as before.
- A pasted personal key is always a choice: Nexus: set API key (paste, instead of signing in) in the command palette, and a "Paste a key instead" button when the browser sign-in fails. Sign out removes whichever you used.

## 0.18.0 (2026-10-13)

- Add to Project, on a mod, a folder or a file in the Mods view when a REDcode project (a `.cpmodproj`) is open in the workspace. Loose files (scripts, CET Lua, TweakXL YAML, ArchiveXL files, configs) are copied into the project's `source/resources` under their deploy paths, so the packed mod carries them at the same place. A file the project already has with other content is left alone unless you say Replace. `.archive` files are skipped with a note: their resources need extracting into `source/archive`, which REDcode's Game Assets view does. Without a project, a toast says so and offers REDcode's New Project.

## 0.17.1 (2026-10-13)

- Update REDbridge: a command of its own, the same as running Get REDbridge again. It asks "Update REDbridge 0.4.0 to 0.5.1?", installs the new one and removes the old folder, which is about 70 MB. The page footer shows "0.5.1 available" next to the running bridge once the daily check has found it.

## 0.17.0 (2026-10-13)

- An MCP server with REDdeck's verbs as tools: list, mod details, add, turn on or off, move, remove, pending, deploy, undo, changes, conflicts, loadouts, Vortex. It ships in the extension as `dist/mcp.js` with the SDK bundled, needs only Node, and reads the library afresh on every call. VS Code 1.101 and later registers it for the agents it hosts; "REDdeck: Connect an assistant (MCP)..." copies the one line Claude Code needs, or a JSON entry for other clients; `reddeck mcp` starts it from the command line.
- The Mods view reloads when an assistant or the command line changes the library or deploys, so what you see is what is on disk.
- `reddeck mod <id>` prints one mod in full: files with sizes, source, Nexus data, status, conflicts. The command line and the MCP server share one verbs module, so their answers are the same.

## 0.16.0 (2026-10-13)

- A "Set up" group at the top of the Mods view, and a row of buttons on the REDdeck page, while something is missing: the game folder, REDbridge, a Nexus sign-in, the Nexus download links, or an import from Vortex when Vortex has mods and the library has none from it. Each row is a button; the x hides a row you do not want. The same steps appear as buttons in the empty view before the first mod.
- REDdeck: Set up... in the command palette lists every step, done or not, and brings hidden ones back.

## 0.15.0 (2026-10-13)

- The Frameworks group says what the game version is and whether it changed since the last deploy ("game updated to 2.31 · 2 updates"), in the Mods view and on the REDdeck page, with the explanation in a tooltip. A deploy records the game version in the manifest.
- When the game changed, REDdeck checks the frameworks on Nexus once for that version and says which have newer files, or asks to sign in when there is no key. A warning icon marks the group while a framework is behind.
- `reddeck list` prints the frameworks line, and `reddeck deploy` records the game version too.

## 0.14.0 (2026-10-12)

- Sizes everywhere, for finding what eats the disk. The Mods view shows each mod's size next to its version, each folder's size, and each file's size. The REDdeck page has a Size column, a "Largest first" chip that sorts every mod by size, and group totals. The footer says how much the library holds in mods, how much in kept downloads (the original zips, safe to delete; the link opens the folder) and how much in deploy backups. The detail panel shows the size per folder and file. `reddeck list` prints sizes and `--size` sorts by them.

## 0.13.3 (2026-10-12)

- Once a day, when the bridge in use is the copy REDdeck fetched, REDdeck asks GitHub whether there is a newer REDbridge release and offers it with a "Get it" button. A bridge you built or configured yourself is left alone.

## 0.13.2 (2026-10-12)

- The log says where the game path came from (the setting, detection, or not found) and, when detection fails, which Steam libraries it checked. Detection runs once per reload rather than on every status refresh.
- The command line ignores a remembered game path that no longer exists.

## 0.13.1 (2026-10-12)

- The REDdeck page's footer says which REDbridge is running, with a green dot, once it has answered ("REDbridge 0.4.0 (WolvenKit 9.1.0)"), or offers Get REDbridge when there is none. The Conflicts panel's "Inside archives" heading names it too.

## 0.13.0 (2026-10-12)

- A mod in the Mods view expands into the folders it deploys to (archive/pc/mod, r6/scripts/Foo, a CET mod folder, a RED4ext plugin) and the files in each. A file opens in the editor from the library copy, which is the same file as the deployed one when deploy uses hardlinks. Clicking the mod's name still opens its details.

## 0.12.1 (2026-10-12)

- REDdeck finds the game on its own: every Steam library in Steam's own list, then GOG and Epic, instead of only the default Steam folder on C:. When it still cannot, the status bar says so and a click opens a folder picker ("REDdeck: Pick the game folder..."); picking bin or bin\x64 by mistake is forgiven. The `reddeck` command line uses the same lookup.

## 0.12.0 (2026-10-12)

- "Get REDbridge" fetches the latest REDbridge release from GitHub into REDdeck's own storage folder, and the .NET 10 runtime into your user profile if the machine has none, after one question that says what it will download. Nothing to configure afterwards: REDdeck finds that copy on its own. The "needs REDbridge" notes now offer the button instead of a setting to edit.

## 0.11.0 (2026-10-12)

- Pending changes, file by file. On the REDdeck page a mod's "not deployed yet" or "changed, deploy again" status is a link: it opens a quick pick of what the next deploy does for that mod (add, replace, put back, relink, remove) with the reason, plus Deploy now and a way into the full panel. The change count next to Deploy, and "Show pending changes" in the Mods view menu, open the Pending changes panel: every file the next deploy touches, with a search box and chips per mod and per kind. `reddeck pending` prints the same from the command line. For inspecting a deployment before pressing the button, or chasing a file problem.

## 0.10.1 (2026-10-12)

- The Deploy button's change count is the number of paths a deploy touches. A file replaced by another version counted twice before, so switching a 9-file mod's version said 18.

## 0.10.0 (2026-10-12)

- One row per mod. The versions of a mod in the library (same Nexus mod, or same name) are one row on the REDdeck page and one node in the Mods view. The version column is a dropdown: pick a version and it takes the mod's place in the order and its on/off state, and the other versions go off. "Get X from Nexus" sits at the bottom of the dropdown when there is a newer version. "Switch version..." does the same from the Mods view's menu.
- No duplicates. An update or an nxm link for a file already in the library makes that version active instead of downloading it again, and a file already in downloads is not fetched twice. A second version of a mod gets its version in its id (`codeware-1-20-5`), and the same name as the first.
- "update X available" shows only when X is newer than every version in the library, so it goes away once the update is in.

## 0.9.2 (2026-10-12)

- Update from inside REDdeck. The yellow "update X available" text on the mods page, "Update to X" in a row's menu and the same button in the detail panel ask once, then download the newest file from Nexus into the library, put it in the old version's place in the order and turn the old version off. Deploy makes it real. Nexus gives direct downloads to Premium members only; for everyone else REDdeck opens the file page, and "Mod manager download" there finishes the same way when REDdeck handles nxm links.
- A file added from an nxm link for a mod already in the library now takes the old entry's place and turns it off, instead of leaving both on.
- The mods page no longer shows the update twice in the status column.

## 0.9.1 (2026-10-12)

- The yellow framework chip always comes first in a mod's kinds, on the page and in the detail panel.

## 0.9.0 (2026-10-12)

- The mods page: the wide table from the design doc, in the editor area. "Open REDdeck" (the table icon on the Mods view, or the command) shows every mod with its version, kind chips and status in columns, grouped into Frameworks and Mods, with a checkbox per row and a row menu (details, move up and down, open folder, open on Nexus, remove). Across the top: Add mod, Check updates or Nexus sign in, Conflicts with a count, Undo deploy and Deploy with the number of pending changes. At the bottom: the library path, whether deploy hardlinks or copies, and the last deploy time.
- A search box filters by name, version, kind or status as you type, and facet chips narrow the list to On, Off, Deployed, Not deployed, Needs deploy, Changed in game folder, Conflicts or Update available, each with its count. The search and facet survive refreshes.

## 0.8.2 (2026-10-12)

- "Deploy now" in the Conflicts panel, shown with the number of files a deploy would change, and on the toast after every Resolve choice. A resolve still changes only the library; the game folder changes when you press Deploy.

## 0.8.1 (2026-10-12)

- The Conflicts panel's row actions are one Resolve dropdown per row instead of a run of buttons, so rows stay one line tall.

## 0.8.0 (2026-10-12)

- A Conflicts panel. The deploy toast says "1 conflict, resolved by order" with a "Show conflicts" button; "Show conflicts" in the view menu opens the same page. It lists every conflict by file path and, with REDbridge, inside archives grouped by the pair of mods, with who wins and who loses, and a "Let ... win" button beside each that moves the loser to directly above the winner. "Turn off ..." is there too. Deploy again to make it real.
- The archive scan's own toast now has the same "Show conflicts" button and no longer sends you to a mod's details.

## 0.7.1 (2026-10-12)

- REDdeck finds a per-user .NET 10 runtime for REDbridge on its own, so `reddeck.dotnetRoot` is only for unusual layouts. Do not set DOTNET_ROOT as a user environment variable for REDbridge: every .NET program on the machine then looks only there, and Vortex's .NET 9 check fails.

## 0.7.0 (2026-10-12)

- "Nexus: sign in" replaces copying a key. With the application slug Nexus registers for REDdeck (setting `reddeck.nexusApplication`), it opens the Nexus authorise page and the key arrives on its own when you click Authorise, the same single sign-on Vortex uses. Without a slug it opens the API Access page and asks you to paste the key, which is the old flow with one step fewer. "Nexus: sign out" forgets the key. "Nexus: set API key (paste)" stays for people who prefer it.

## 0.6.1 (2026-10-12)

- The extension id is now `edgemodders.reddeck`: the repos moved to the Edgemodders organization and the publisher follows. If you had registered nxm links with 0.6.0, run "Nexus: handle download links" again so the forwarder points at the new id.

## 0.6.0 (2026-10-11)

M5, first part: loadouts and the command line.

- "Save loadout" writes which mods are on and in what order to `loadouts/<name>.json` in the library; "Load loadout" applies one: the mods it names go on or off and into its order, mods it does not name are turned off, mods it names that are not in the library are listed. A loadout is a plain file to keep in a project or share.
- `reddeck` command line over the same library and deployer: list, add, on, off, up, down, remove, deploy, undo, changes, conflicts, loadout save/load/list, vortex list/import. `--json` on every command, for scripts and assistants. Run it with `node bin/reddeck.mjs` from a checkout, or `npx reddeck` once published.

## 0.5.0 (2026-10-11)

M4, the REDdeck side of the REDcode loop.

- "Add from REDcode project" (also in Add mod, and on a `.cpmodproj` in the Explorer) takes a REDcode or WolvenKit project's packed output as a mod that follows the project. Every refresh compares the packed folder with the library copy and re-syncs it when the project was packed again; the list then says "changed, deploy again".
- Deploy relinks a mod whose library file was replaced (a rebuilt archive, a re-synced project) without asking. The question about a changed file is only for files changed in the game folder.

## 0.4.0 (2026-10-11)

M3: Nexus Mods.

- "Nexus: set API key" stores your personal API key in VS Code's secret storage and checks it against Nexus.
- "Nexus: check for updates" asks Nexus for the newest file of every mod that has a Nexus id (added from a link, or imported from Vortex) and shows "update 1.2.3 available" in the list and the detail panel. It also runs once a day on start when a key is stored; `reddeck.nexusCheckUpdatesOnStart` turns that off.
- "Nexus: handle download links" registers REDdeck for nxm links for the current user, through a small PowerShell forwarder that opens a `vscode://edgemodders.reddeck/nxm` link; the extension downloads the file into the library and adds it with the name and version from Nexus. "Nexus: stop handling download links" gives them back. It says who had them before (Vortex, usually).
- "Nexus: add from a link" takes a pasted nxm link. Free members need the link from the site's Mod manager download button, which carries a key; Premium members get direct links.
- "Open on Nexus Mods" on any mod with a Nexus id, in the list and the detail panel, which also shows the author and summary once checked.
- `npm run test:ui` runs REDdeck inside a real VS Code: activation, commands, a deploy, the archive scan and the detail panel.

## 0.3.0 (2026-10-11)

M2, first part.

- Detail panel: click a mod to see its status, kinds, source, files by folder, conflicts by file path with the winner, and conflicts inside archives. The four verbs plus move up and down are buttons there too.
- Archive conflicts: with REDbridge 0.4.0 or later (`reddeck.bridgePath`, or a REDbridge checkout next to this one), REDdeck opens every enabled mod's `.archive` and reports resources that two mods both contain, in plain words: "loses 3 archive files", "overrides 2 archive files". The bridge starts without a game, so this is quick. "Check archive conflicts" runs it on demand; it also runs after every change.
- REDmod packages: after a deploy, `redMod.exe deploy` runs with the enabled packages in list order. The game must then be launched with `-modded`.
- The game version from `Cyberpunk2077.exe` shows next to the view title and in the status bar.
- Settings `reddeck.bridgePath` and `reddeck.dotnetRoot`.

## 0.2.0 (2026-10-11)

M1: the library and deployment.

- Add mod from a zip or 7z (bundled 7-Zip), from a rar when 7-Zip or WinRAR is installed, or from a folder. One classifier maps the files to their game paths and asks when an archive comes with option folders.
- Deploy with hardlinks when the library is on the game's drive, copies otherwise. Every deployed file is recorded in `reddeck.deployment.json`; a file that was already in the way is moved to the library's backup folder and restored on undo.
- Undo deploy removes exactly what the manifest lists and the folders REDdeck created.
- Changes made outside REDdeck: a deployed file that changed in the game folder is left alone until you answer "keep the changed file" or "put the mod's file back"; a missing file comes back on the next deploy.
- Conflicts between mods are resolved by list order, highest wins; move up and move down change the winner. `archive/pc/mod/modlist.txt` is written in that order.
- Import from Vortex copies its staged mods into the library and marks the ones Vortex has deployed as on. Vortex is never written to, and REDdeck refuses to deploy while Vortex's manifest is in the game folder.
- Status per mod in plain words: deployed, off, not deployed yet, changed in game folder, n conflicts.
- `npm run smoke` runs the core against a fake game folder.

## 0.1.0 (2026-10-11)

- Extension scaffold: the Mods view over a library folder, Add mod from a folder, on/off checkboxes, Remove, Reveal in File Explorer.
- Settings `reddeck.gamePath` and `reddeck.libraryPath`.
