# REDdeck

A simple mod manager for Cyberpunk 2077 that lives inside VS Code and REDcode. One list of mods, four verbs, no jargon.

- **Get REDbridge** once, and conflicts inside archives show up too. REDdeck fetches it; nothing to configure.
- **Open REDdeck** for the wide table with search and status filters; the sidebar is the compact view.
- **Sign in** to Nexus Mods once; updates and download links follow.
- **Add** a zip, 7z or rar from Nexus Mods, or a folder. REDdeck works out what kind of mod it is and where its files go.
- Turn a mod **on** or **off**. Nothing touches the game until you deploy.
- **Deploy** links the enabled mods into the game with hardlinks, writes the archive load order, and records a manifest. Undo deploy removes exactly that and nothing else.
- **Remove** a mod from the library.

It keeps your mods in a library outside the game folder, resolves conflicts by list order, notices when a deployed file was changed by something else and asks one question, and imports the mods Vortex has for the game. With REDbridge present it shows conflicts between files inside mod archives.

Docs and design: https://edgemodders.github.io/REDdeck/

Settings: `reddeck.gamePath` (the Cyberpunk 2077 folder) and `reddeck.libraryPath` (where mods are kept; put it on the game's drive so deploy can use hardlinks).

REDdeck is part of an AI-first modding ecosystem with REDcode, REDbridge and REDnode. MIT licensed. Not affiliated with CD PROJEKT.
