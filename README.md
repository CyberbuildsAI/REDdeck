<p align="center">
  <img src="docs/assets/brand/banner.png" alt="REDdeck: a simple mod manager for Cyberpunk 2077, inside VS Code and REDcode. Verbs add, on/off, deploy, remove. Deploy with hardlinks, undoable. Sees conflicts inside archives." width="100%">
</p>

<p align="center">
  <a href="https://cyberbuildsai.github.io/REDdeck/"><img src="docs/assets/brand/badges/docs.svg" alt="docs: read the docs"></a>
  <img src="docs/assets/brand/badges/status.svg" alt="status: design phase">
  <img src="docs/assets/brand/badges/game.svg" alt="game: Cyberpunk 2077">
  <img src="docs/assets/brand/badges/vscode.svg" alt="VS Code: 1.80+">
  <a href="LICENSE"><img src="docs/assets/brand/badges/license.svg" alt="license: MIT"></a>
</p>

A mod manager for Cyberpunk 2077 that lives inside VS Code and [REDcode](https://github.com/CyberbuildsAI/REDcode). One list of mods, four verbs, no jargon.

REDdeck keeps your mods in a library outside the game folder, deploys the ones you turn on with hardlinks, and undoes it just as cleanly. It recognises the frameworks (RED4ext, CET, redscript, ArchiveXL, TweakXL and friends), prepares REDmod packages, writes the archive load order, and, with [REDbridge](https://github.com/CyberbuildsAI/REDbridge) present, shows conflicts between files *inside* mod archives, which file-level managers cannot see. The name: a deck of mods, a nod to the cyberdeck, and the mods waiting "on deck" before you deploy them.

**[Read the docs](https://cyberbuildsai.github.io/REDdeck/)** &middot; [REDcode](https://github.com/CyberbuildsAI/REDcode) &middot; [REDbridge](https://github.com/CyberbuildsAI/REDbridge) &middot; [REDnode](https://github.com/CyberbuildsAI/REDnode)

> [!NOTE]
> **Status: design phase.** The design is settled and the repo holds the extension scaffold: a Mods view over an empty library, Add mod from a folder, on/off checkboxes. Deployment is next. Nothing here manages a real game yet.

## How it works

```
 Library (outside the game)            REDdeck (VS Code extension)           Game folder
 ┌───────────────────────────┐         ┌───────────────────────────┐         ┌──────────────────────────┐
 │ one folder per mod, laid  │  deploy │ Mods view: on/off, status │ hardlink│ archive/pc/mod/          │
 │ out exactly as it deploys │────────►│ classifier: kind + target │────────►│ r6/scripts, r6/tweaks    │
 │ mod.json, library.json    │◄────────│ deployer: manifest, undo  │◄────────│ red4ext/plugins, mods/   │
 │ downloads/ (originals)    │  undo   │ Nexus client, nxm links   │ verify  │ bin/x64/plugins/cet/mods │
 └───────────────────────────┘         └───────────────────────────┘         └──────────────────────────┘
                                       optional: REDcode (install a packed project), REDbridge (archive conflicts)
```

| You do | REDdeck does |
|---|---|
| **Add** a zip, 7z, rar, folder or Nexus link | Works out what kind of mod it is and where its files go. Asks only when it cannot tell. |
| Turn a mod **on** or **off** | Nothing on disk yet. The Deploy button counts the changes waiting. |
| **Deploy** | Hardlinks the enabled mods into the game, writes the load order, prepares REDmod packages, records a manifest. |
| **Remove** | Deletes the mod from the library. Deployed files come out on the next deploy. |
| Undo deploy | Removes every file in the manifest and nothing else. |

## Repository layout

| Path | Contents |
|---|---|
| `src/` | The extension: library, Mods view, commands |
| `images/` | Activity bar icon and extension icon |
| `docs/` | Documentation site |
| `tools/brand/` | Generates the banner, badges and icon |

## Build

```powershell
git clone https://github.com/CyberbuildsAI/REDdeck.git
cd REDdeck
npm install
npm run build       # or: npm run watch
```

Open the folder in VS Code and press F5 to run the extension in a second window. Details in the [setup guide](https://cyberbuildsai.github.io/REDdeck/dev-setup.html).

## Roadmap

- **M0 Decide.** Name, repository, the word list, the extension scaffold.
- **M1 Library.** Add from archives and folders, the library layout, hardlink deploy with manifest and undo, changes made outside REDdeck, Vortex detection and import.
- **M2 Kinds.** Frameworks group with game version check, REDmod packages, file and archive conflicts with reorder.
- **M3 Nexus.** API key, mod metadata, updates, nxm links.
- **M4 Loop.** Install and test a REDcode project with one click. REDnode packages as a mod kind.
- **M5 Share.** Loadouts, a `reddeck` CLI, MCP tools, publish to Open VSX and the Marketplace.

## Relation to Vortex

Vortex works and supports two hundred games. REDdeck supports one, so it can leave out profiles, activators, phases and the thirty-odd installer rules that make Vortex feel heavy for Cyberpunk. It keeps the parts that are unavoidable: a library outside the game, a deployment manifest, detection of changes made outside the manager, load order, conflicts and Nexus links. REDdeck refuses to deploy while Vortex manages the same game folder, and can import Vortex's library.

## Legal

MIT. This repository contains no game files, no mod files and no data extracted from the game. Single-player modding only. Nexus Mods is used through its public API under its acceptable use policy. REDmod, REDengine and Cyberpunk 2077 are CD PROJEKT's. A cyberdeck is theirs too; a deck of mods is ours.

## License

[MIT](LICENSE)
