# Changelog

## 0.5.0 (2026-10-11)

M4, the REDdeck side of the REDcode loop.

- "Add from REDcode project" (also in Add mod, and on a `.cpmodproj` in the Explorer) takes a REDcode or WolvenKit project's packed output as a mod that follows the project. Every refresh compares the packed folder with the library copy and re-syncs it when the project was packed again; the list then says "changed, deploy again".
- Deploy relinks a mod whose library file was replaced (a rebuilt archive, a re-synced project) without asking. The question about a changed file is only for files changed in the game folder.

## 0.4.0 (2026-10-11)

M3: Nexus Mods.

- "Nexus: set API key" stores your personal API key in VS Code's secret storage and checks it against Nexus.
- "Nexus: check for updates" asks Nexus for the newest file of every mod that has a Nexus id (added from a link, or imported from Vortex) and shows "update 1.2.3 available" in the list and the detail panel. It also runs once a day on start when a key is stored; `reddeck.nexusCheckUpdatesOnStart` turns that off.
- "Nexus: handle download links" registers REDdeck for nxm links for the current user, through a small PowerShell forwarder that opens a `vscode://cyberbuildsai.reddeck/nxm` link; the extension downloads the file into the library and adds it with the name and version from Nexus. "Nexus: stop handling download links" gives them back. It says who had them before (Vortex, usually).
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
