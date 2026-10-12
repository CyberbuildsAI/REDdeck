# Changelog

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
