# Changelog

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
