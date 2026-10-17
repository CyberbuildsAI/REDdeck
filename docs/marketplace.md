# EDGEdeck

A simple mod manager for Cyberpunk 2077 that lives inside VS Code and REDcode. One list of mods, four verbs, no jargon.

EDGEdeck was called REDdeck up to 0.26.6. It is a new extension (`edgemodders.edgedeck`); nothing carries over from REDdeck, so turn every mod off and deploy in REDdeck, uninstall it, then set up EDGEdeck as new.

- A **Set up** group walks a new install through the game folder, REDbridge, Nexus and Vortex, one button each.
- **Get REDbridge** once, and conflicts inside archives show up too. EDGEdeck fetches it; nothing to configure.
- **Open EDGEdeck** for the wide table with search and status filters; the sidebar is the compact view.
- **Sign in** to Nexus Mods once; updates and download links follow.
- **Add** a zip, 7z or rar from Nexus Mods, or a folder. EDGEdeck works out what kind of mod it is and where its files go.
- Turn a mod **on** or **off**. Nothing touches the game until you deploy.
- **Deploy** links the enabled mods into the game with hardlinks, writes the archive load order, and records a manifest. Undo deploy removes exactly that and nothing else.
- **Remove** a mod from the library.

It keeps your mods in a library outside the game folder, resolves conflicts by list order, notices when a deployed file was changed by something else and asks one question, and imports the mods Vortex has for the game. With REDbridge present it shows conflicts between files inside mod archives.

Guide, docs and design: https://edgemodders.github.io/EDGEdeck/

Settings: `edgedeck.gamePath` (the Cyberpunk 2077 folder) and `edgedeck.libraryPath` (where mods are kept; put it on the game's drive so deploy can use hardlinks).

**Preview.** EDGEdeck is young and Windows only. Deploy, undo and the library are in daily use; Nexus downloads and REDmod deploy have had little real-world use yet. Report problems at https://github.com/Edgemodders/EDGEdeck/issues and attach the EDGEdeck log (Show log in the Mods view's menu).

EDGEdeck is part of an AI-first modding ecosystem with REDcode, REDbridge and REDnode. MIT licensed; it ships 7-Zip's 7za.exe (GNU LGPL), see ThirdPartyNotices.txt. Not affiliated with CD PROJEKT.
