---
title: Guide
---

# RED<span class="y">deck</span> guide

How to use REDdeck, from install to a modded game. REDdeck is a mod manager for Cyberpunk 2077 that runs inside VS Code. It keeps your mods in a library outside the game folder, deploys the ones you turn on, and undoes that just as cleanly. One list of mods, four verbs: add, turn on or off, deploy, remove.

## 1. Install

REDdeck is not on the VS Code Marketplace yet. It installs from a VSIX file.

1. Install [VS Code](https://code.visualstudio.com/) 1.80 or later.
2. Download `reddeck-<version>.vsix` from the [releases page](https://github.com/Edgemodders/REDdeck/releases).
3. Install it, either from a terminal or from VS Code:

```powershell
code --install-extension reddeck-0.16.0.vsix
```

In VS Code: open the Extensions view, press the `...` menu at its top right, pick **Install from VSIX...** and choose the file. Then run **Developer: Reload Window** from the command palette (`Ctrl+Shift+P`).

A REDdeck icon appears in the activity bar on the left. Click it for the Mods view. To update later, install the newer VSIX the same way; your library and settings stay.

## 2. Set up

The first time, the Mods view shows a **Set up** group with a row for each thing REDdeck needs or can use. Each row is a button. Rows disappear as you do them, and the `x` on a row hides one you do not want. **REDdeck: Set up...** in the command palette lists every step, done or not, and brings hidden rows back.

| Step | What it does | Needed? |
|---|---|---|
| **Find the game folder** | REDdeck looks for Cyberpunk 2077 in every Steam library, then GOG and Epic, on every start. This row appears only when that fails: pick the folder that contains `bin`, `archive` and `r6`. | Yes |
| **Get REDbridge** | Downloads [REDbridge](https://github.com/Edgemodders/REDbridge), about 70 MB, into REDdeck's own folder, plus the .NET 10 runtime for your user account if there is none. With it, REDdeck sees conflicts between files *inside* mod archives. REDdeck checks once a day for a newer REDbridge and offers it; **Update REDbridge** in the command palette checks now. The old version is removed after an update. | No, but recommended |
| **Sign in to Nexus Mods** | For update checks and downloads from the site. Sign in opens the Nexus sign-in page in your browser; approve REDdeck there and the tab says "Signed in". REDdeck keeps the sign-in in VS Code's secret storage and renews it by itself. Until Nexus has registered REDdeck, sign in opens your [API Access page](https://www.nexusmods.com/users/myaccount?tab=api+access) instead, where you create a personal key and paste it in. The key works the same way, and **Nexus: set API key (paste, instead of signing in)** is always there if you prefer it. **Nexus: sign out** removes either. | No |
| **Handle Nexus download links** | Makes the **Mod manager download** button on Nexus pages send the file to REDdeck. Vortex takes the links back whenever it starts, so this row returns if you use both. | No |
| **Import from Vortex** | Copies the mods Vortex has for Cyberpunk into the library. Vortex is left alone. Shown when Vortex has mods and the library has none from it. | No |

The status bar at the bottom of VS Code shows REDdeck's state in one line: how many mods are on, whether a deploy is waiting, or that the game was not found. Click it to deploy, or to pick the game folder.

## 3. The Mods view

The sidebar view is one list in three groups: **Set up** while anything is missing, **Frameworks**, and **Mods**.

- **The checkbox** turns a mod on or off. Nothing touches the game until you deploy.
- **The line after the name** shows the version, how many other versions are in the library, the size, and the status: `deployed`, `not deployed yet`, `off`, `off, still deployed`, `changed in game folder`, `update 1.2 available`, `loses 3 archive files`.
- **Click a mod** for its detail panel: the files it deploys, its conflicts by file path and inside archives, and buttons for turn on, move, open folder, Open on Nexus, Update and Remove.
- **Expand a mod** for the folders it deploys into and the files in them. Click a file to open the library copy. Hover anything for a card with size, dates, where it deploys and where it came from.
- **Hover a row** for the move buttons. The mod higher in the list wins a conflict. Right-click for the rest: Details, Open on Nexus Mods, Switch version, Reveal in File Explorer, Remove, and, when a REDcode project is open, Add to Project.

### Add to Project

With a REDcode project open in the workspace (a folder with a `.cpmodproj` file), right-click a mod, a folder or a file and pick **Add to Project**. Loose files, such as scripts, CET Lua, TweakXL YAML, ArchiveXL files and configs, are copied into the project's `source/resources` under their deploy paths, so the packed mod carries them at the same place in the game. A file the project already has with other content is left alone unless you say Replace. For an `.archive` file, REDdeck lists what is inside and asks for all of it or a pick; REDcode then extracts those meshes, textures and entities into `source/archive` at their game paths (this needs REDcode 0.6.1 and REDbridge 0.7.1 or newer). Resources the project already has are kept unless you say Replace. Another author's assets are theirs; check the mod's permissions on Nexus before you ship them.

The view's title bar has **Open REDdeck**, **Add mod**, **Deploy**, **Nexus: check for updates** and **Refresh**. Its `...` menu holds the rest: Show conflicts, Show pending changes, Import from Vortex, Undo deploy, Nexus sign in, add from a link, Add from REDcode project, Get REDbridge, Pick the game folder, Open library folder, Show log, Save and Load loadout.

### The Frameworks group

RED4ext, Cyber Engine Tweaks, redscript, ArchiveXL, TweakXL, Codeware, Audioware, input_loader and mod_settings are mods like any other, pinned at the top because most other mods depend on them. The group's header carries the game version: `3, 3 on · game 2.31`.

A game patch is the usual reason a modded game stops starting. REDdeck records the game version at every deploy, and when the executable's version differs from it, the header says `game updated to 2.31` with a warning icon. If you are signed in to Nexus, REDdeck checks the frameworks once for that version and names the ones with newer files; otherwise it asks you to sign in. Update each framework from its `update ... available` link, then deploy.

## 4. The REDdeck page

**Open REDdeck** (the first title-bar button, or the command) opens the wide table in the editor area. Use it for bigger jobs; the sidebar is its compact companion.

- **Columns:** on/off, name, version, kinds, size, status, and Actions: icon buttons for Details, Move up, Move down, Section, Open folder, Open on Nexus (for a mod from Nexus) and Remove. Drag the edge of a column heading to resize it; double-click the edge for automatic widths.
- **Sections.** Mods are grouped into Frameworks, sections of your own, and Mods. **+ Section** makes one. Put a mod in it with the mod's Section button, or drag the row onto the section's header. A section's header can rename, move or delete it; deleting sends its mods back to Mods and removes nothing. Click a section's name to fold it down to its header. The box on a header turns every mod in that section on or off. Two buttons on every header act on the mods the section shows, after the search and filter: put them all in another section, or remove them all from the library. Filter to **Off** and remove, to clear out mods you no longer use. A section of your own also has rename, move up, move down and X to delete the section. Sections only group the list: the order still decides who wins a conflict.
- **Order.** Move up and Move down move a mod past its neighbour in its section. Or drag a row onto another to put it directly above or below that one.
- **Search** matches name, version, kind and status. **Facet chips** narrow to On, Off, Deployed, Not deployed, Needs deploy, Changed in game folder, Conflicts and Update available, each with its count. A search or a filter opens folded sections while it lasts. **Largest first** sorts by size across every section. The page remembers your filters.
- **The version cell** is a dropdown when the library holds more than one version of a mod, or when Nexus has a newer one: pick a version to make it the active one, or **Get x.y from Nexus**.
- **Status** is a link when a deploy is waiting for that mod: it opens the list of files the next deploy adds, replaces, puts back or removes for it, and why.
- **The toolbar** has Add mod, Check updates or Nexus sign in, Conflicts with a count, Undo deploy, the number of changes waiting, and Deploy.
- **The footer** shows the library folder and whether deploy uses hardlinks or copies, the last deploy, disk use, and which REDbridge is running.

## 5. Adding mods

**From a file or folder.** Add mod takes a zip, 7z, rar or a folder. REDdeck works out what kind of mod it is (archive, redscript, CET, RED4ext plugin, TweakXL, REDmod package, REDnode package, a framework) and where its files go, and asks only when it cannot tell, for example when a zip holds several options.

**From Nexus Mods.** With REDdeck handling download links, press **Mod manager download** on any file on the site and it lands in the library. Without that, copy the `nxm://` link and use **Nexus: add from a link**. Premium members can also download straight from an `update` link; free members go through the site, which hands REDdeck a link with a key.

**From Vortex.** Import from Vortex copies Vortex's mods for Cyberpunk into the library with their names, versions and Nexus ids. Vortex keeps its own copies.

**From a REDcode project.** Add from REDcode project takes a `.cpmodproj`'s packed output as a mod that follows the project: pack again and the library copy refreshes; deploy picks it up.

**Versions.** A mod has one row however many versions are in the library. The newest, or the one that is on, stands for it; the others wait in the version dropdown and in **Switch version...**. Downloading a version already in the library does nothing twice.

## 6. Deploying

After each deploy, the message says how many files went in for how many mods and how many mods are in the game. **View** opens a report of exactly what changed and where; the last 30 reports stay in the library's `deploys` folder.


Turning mods on and off changes nothing on disk. The **Deploy** button counts the files waiting, and **Show pending changes** lists every one with the reason: added, replaced by a mod higher in the list, put back from a backup, relinked after a rebuild, removed.

Deploy hardlinks the files of every mod that is on into the game folder, so they take no extra space, and writes `modlist.txt` for the archive load order. If the library sits on another drive, deploy copies instead. It prepares REDmod packages with `redMod.exe` when any are on. Everything it did goes into a manifest in the game folder.

**Files that changed outside REDdeck.** When Steam verify, the game or another tool changed a file REDdeck deployed, the mod shows `changed in game folder` and the next deploy asks one question per file: keep the changed file, which imports it into the library, or put the mod's file back. A foreign file in the way of a deploy is moved to the library's backup folder first and comes back on undo.

**Undo deploy** removes every file in the manifest and nothing else, and puts the backups back.

**Vortex.** While Vortex manages the game folder, REDdeck refuses to deploy. Purge in Vortex (Mods, Purge) first; after that, both can coexist as long as only one of them has deployed.

## 7. Conflicts

Two mods that deploy the same path, or that carry the same resource inside their `.archive` files, conflict. The mod higher in the list wins, and the game sees its version. The deploy toast says how many conflicts there are, and **Show conflicts** opens a page with every one: the path or the resource, the winner, and the losers.

- **Let X win** on a row moves that mod above the current winner. **Turn off** silences the loser.
- The upper table lists conflicts by file path, which REDdeck sees on its own. The lower one lists conflicts inside archives, which needs REDbridge; its heading names the REDbridge in use.
- **Deploy now** on the page applies what you decided.

The detail panel of a mod shows the same for that mod only, and a row's status says `loses 3 archive files` or `overrides 2 archive files`.

## 8. Updates from Nexus

Signed in, REDdeck asks Nexus once a day whether any mod with a Nexus id has a newer file, and the row shows `update 1.2 available`. Click it, confirm, and the new version downloads, takes the old one's place and goes on if the old one was on. The old version stays in the library until you remove it. **Nexus: check for updates** runs the check now. The setting `reddeck.nexusCheckUpdatesOnStart` turns the daily check off.

## 9. Disk space

Sizes show next to every mod, folder and file in the Mods view, in the page's Size column, and in the page footer: `Disk: 160 MB in mods, 1.9 MB in kept downloads`.

- **Mods** is what the library holds. Deployed hardlinks cost nothing extra on the same drive.
- **Kept downloads** are the original zips, kept so a mod can be added again. Safe to delete; the footer link opens the folder.
- **Deploy backups** are foreign files moved aside by a deploy. Undo deploy puts them back.

`Largest first` on the page finds the big ones.

## 10. Loadouts

**Save loadout** writes which mods are on and in what order, with the game version, to a file in the library's `loadouts` folder. **Load loadout** applies one: mods in it go on, mods not in it go off, and missing mods are named. Loadouts are plain JSON, fine to share.

## 11. Settings

Open Settings (`Ctrl+,`) and search for `reddeck`.

| Setting | Default | What it does |
|---|---|---|
| `reddeck.gamePath` | empty | The Cyberpunk 2077 folder. Empty means find it through Steam, GOG or Epic on every start. Set it only for a game those cannot see. |
| `reddeck.libraryPath` | empty | Where mods are kept. Empty means `%USERPROFILE%\REDdeck`. Put it on the game's drive so deploy can use hardlinks. |
| `reddeck.bridgePath` | empty | A REDbridge you built yourself. Empty means the copy Get REDbridge fetched, which the page footer names. |
| `reddeck.dotnetRoot` | empty | A .NET root for the REDbridge process only. Empty means the per-user .NET 10 runtime. Never set `DOTNET_ROOT` for your whole account; it breaks Vortex. |
| `reddeck.nexusCheckUpdatesOnStart` | on | The daily Nexus update check. |
| `reddeck.nexusClientId` | empty | The OAuth client id Nexus assigns to REDdeck. With it, sign in happens in the browser and renews itself. |
| `reddeck.vortexStagingPath` | empty | Where Vortex keeps its mods, for Import from Vortex. Empty means REDdeck searches the usual places and asks when it finds none. |
| `reddeck.nexusApplication` | empty | The application slug for Nexus's older single sign-on, used when there is no client id. |

## 12. The library folder

Everything REDdeck knows is in plain files under the library folder, `%USERPROFILE%\REDdeck` by default. **Open library folder** in the view's menu opens it.

| Folder or file | Contents |
|---|---|
| `library/<mod>/` | One folder per mod version, laid out exactly as it deploys, with a `mod.json` beside the files: name, version, kinds, source, Nexus data |
| `library.json` | The order of the mods (first wins) and the game folder |
| `downloads/` | The kept original archives. Safe to delete |
| `backup/` | Foreign files a deploy moved aside |
| `loadouts/` | Saved loadouts |

The game folder gets a manifest of what REDdeck deployed, which Undo deploy reads.

## 13. Command line and assistants

The same core runs from a terminal, for scripts and assistants. Every command prints JSON with `--json`.

```
node bin/reddeck.mjs list [--size]           what is in the library, its size and status
node bin/reddeck.mjs mod <id>                one mod in full: files, sizes, source, Nexus data, conflicts
node bin/reddeck.mjs add <file|folder> [--name N] [--option FOLDER]
node bin/reddeck.mjs on <id> | off <id>      turn a mod on or off
node bin/reddeck.mjs up <id> | down <id>     change the order (first wins conflicts)
node bin/reddeck.mjs remove <id>
node bin/reddeck.mjs deploy [--keep PATH...] [--restore PATH...]
node bin/reddeck.mjs undo
node bin/reddeck.mjs changes                 files changed in the game folder since the deploy
node bin/reddeck.mjs pending                 what the next deploy does, and why
node bin/reddeck.mjs conflicts               conflicts by file path
node bin/reddeck.mjs loadout save <name> | load <file> | list
node bin/reddeck.mjs vortex list | import
```

`--library <folder>` and `--game <folder>` override the folders. The command line finds the game the same way the extension does.

**An assistant can do all of this for you.** REDdeck is an MCP server too, with the same verbs as tools: list and inspect mods, add, turn on or off, reorder, remove, show what a deploy would do, deploy, undo, conflicts, loadouts and Vortex import. Ask "which of my mods are off?" or "deploy my mods and tell me what changed".

- **Agents inside VS Code** (1.101 and later) see REDdeck's tools as soon as the extension is installed. Nothing to set up.
- **Claude Code**: run **REDdeck: Connect an assistant (MCP)...** from the command palette, pick "Copy the Claude Code command" and paste it in a terminal once. It is a `claude mcp add` line pointing at REDdeck's server with your library and game folders.
- **Other MCP clients**: the same command copies a JSON entry, or point the client at `node <extension folder>/dist/mcp.js --library <folder> --game <folder>`.

The tools that write to the game folder, deploy and undo, are marked so an assistant asks before using them. Changes an assistant makes show up in the Mods view by themselves.

## 14. When something is wrong

**"Game not found" in the status bar.** The Set up group has a Find the game folder row; click it and pick the folder with `bin`, `archive` and `r6`. **Show log** prints which Steam libraries REDdeck checked; if the game is in one of them, please [report it](https://github.com/Edgemodders/REDdeck/issues) with those lines.

**"Vortex manages the game".** Purge in Vortex, then deploy with REDdeck.

**No conflicts inside archives.** The page footer says which REDbridge is running, with a green dot, or offers Get REDbridge. REDbridge needs the .NET 10 runtime, which Get REDbridge installs for your user account.

**A mod's file is missing or changed after a Steam verify.** The row says `changed in game folder` or `changed, deploy again`. Deploy puts the mod's files back, asking first about any file that changed.

**"Premium only" when updating.** Nexus serves direct downloads to Premium members only. REDdeck opens the file's page instead; press Mod manager download there and the file arrives through the link.

**The log.** Show log in the view's menu, or View, Output, then REDdeck in the dropdown. The first lines say where the library and game are and how the game was found.

Source, issues and releases: [github.com/Edgemodders/REDdeck](https://github.com/Edgemodders/REDdeck). The [design](design.html) explains why REDdeck works the way it does.
