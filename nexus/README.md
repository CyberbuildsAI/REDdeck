# EDGEdeck on Nexus Mods

The source of EDGEdeck's Nexus Mods page lives here, so updates are edits in the repo, not in Nexus's text box.

| File | What it is |
|---|---|
| `description.bbcode` | The page's description, in Nexus's BBCode. Paste the whole file into the description field (the editor's source mode, or switch to BBCode) |
| `README.md` | This page: the other fields of the Nexus form, the download file, and how to update |

## The Nexus form

| Field | Value |
|---|---|
| Mod name | EDGEdeck |
| Version | EDGEdeck's version, from `package.json` (for example 0.26.5) |
| Category | Utilities (check the list for Cyberpunk 2077 when creating the page) |
| Brief overview | A simple mod manager for Cyberpunk 2077 inside VS Code: add, on or off, deploy, remove. Hardlink deploys you can undo, conflicts inside archives, Nexus sign-in and updates, loadouts, Vortex import. A VS Code extension, not a game mod. (255 characters at most; this is 234) |
| Author | Edgemodders |
| Language | English |
| Primary image | `docs/assets/brand/social.png` (1280 x 640). The banner (`docs/assets/brand/banner.png`) is already at the top of the description |
| Requirements | None on Nexus. Off-site: VS Code 1.80 or later (or VSCodium, or EDGEkit) |
| Permissions | MIT: open source, free to modify and redistribute with the license notice. 7-Zip's 7za.exe keeps its GNU LGPL license (`ThirdPartyNotices.txt`) |
| Tags | Utility, mod manager, modders resource |

The description has screenshot placeholders in cyan italics (`[Screenshot N: ...]`). Upload each picture to the page's Images tab, then replace its placeholder line with `[img]<the image's Nexus URL>[/img]` and a one-line caption.

## The download

One main file: `EDGEdeck-<version>-nexus.zip`, with:

| File | What it is |
|---|---|
| `edgedeck-<version>.vsix` | The extension, the same file the Marketplace and Open VSX have |
| `README.txt` | How to install it: Install from VSIX in VS Code, or `code --install-extension` |
| `LICENSE.txt`, `ThirdPartyNotices.txt` | EDGEdeck's license and 7-Zip's |

**When uploading, turn off the Mod Manager Download button** for this file (Nexus's file form has the option). It is a VS Code extension: Vortex would deploy it into the game folder, where it does nothing.

File description on Nexus:

> EDGEdeck &lt;version&gt;, the VS Code extension. Extract, then in VS Code: Extensions view, ..., Install from VSIX. Or install it from the Marketplace or Open VSX, where it updates itself.

### Building it

The publish workflow (`.github/workflows/publish.yml`) builds it with every release and attaches it to the GitHub release, beside the `.vsix`. A release is one step, as before: bump the version, push, then push the tag `vX.Y.Z`. Download the zip from the release and upload it to Nexus.

By hand, after `npm run package`: `node scripts/nexus-zip.mjs` writes `dist/EDGEdeck-<version>-nexus.zip`.

## Updating the page

1. Edit `description.bbcode` here, commit, push.
2. Check it: `node scripts/check-bbcode.mjs nexus/description.bbcode`.
3. Paste the whole file into the description field on Nexus and save.
4. For a new version: upload the release's Nexus zip as the main file with the version from `package.json`, Mod Manager Download off. Archive the old file.

Keep these in step with the extension (docs/marketplace.md, CHANGELOG.md):

| Where in the description | Update when |
|---|---|
| The STATUS box near the top | The preview flag goes, or what is in daily use changes |
| "Highlights" | A release adds something a player would notice |
| "Requirements" | The VS Code minimum (`engines.vscode`) changes |

## BBCode used

Nexus's BBCode has no tables or Markdown, so the page uses only: `[b]`, `[i]`, `[size=2..5]`, `[color=#hex]`, `[center]`, `[quote]`, `[line]`, `[list]` with `[*]`, `[url=...]` and `[img]`. The banner is linked from this repo's `main` branch on GitHub, so it must stay at its path. The colours are the house palette: yellow `#fcee0a` for headings, cyan `#19f3ff` for highlights.
