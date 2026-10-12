# REDdeck: notes for Claude sessions

REDdeck is a mod manager for Cyberpunk 2077 built as a VS Code extension. It is one of four repos by the same owner: REDnode (runtime scripting), REDcode (the IDE), REDbridge (the engine host, GPL-3.0) and REDdeck (this one). REDnode's `CLAUDE.md` and `docs/dev-setup.md` set the shared conventions. The name: a deck of mods, a nod to the cyberdeck, and the mods waiting "on deck" before you deploy them.

## Current status and next step

- **Design:** done, as a private design document held by the owner. It is not in this repo. Ask the owner for it before any feature work; it has the UI mockup, the word list, the library layout, the deployment rules and the roadmap.
- **M0 done (2026-10-11):** repo in the house style, extension scaffold with the Mods view over an empty library, `Add mod` from a folder, on/off checkboxes, settings for the game and library paths.
- **Next step (M1):** add from zip, 7z and rar; the library layout with `mod.json`; hardlink deploy with a manifest and undo; changes made outside REDdeck; `modlist.txt`; Vortex detection and import.

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
