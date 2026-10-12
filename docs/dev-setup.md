# Development setup

Everything needed to work on REDdeck, in order. A fresh machine should be able to follow this top to bottom. The shared tools (Git, Node, Python, winget) are the same as in [REDnode's setup guide](https://cyberbuildsai.github.io/REDnode/dev-setup.html).

Reference machine: Windows 11 Home (build 26200), 16 GB RAM, no administrator session available.

## 1. Base tools

| Tool | Version used | Why | Install |
|---|---|---|---|
| Git for Windows | 2.55.0 | Source control | `winget install --id Git.Git -e` |
| Node.js | 24 | Builds the extension | `winget install --id CoreyButler.NVMforWindows -e`, then `nvm install 24` |
| VS Code | 1.80 or later | Runs the extension; 1.80 is the first release with checkboxes in tree views | `winget install --id Microsoft.VisualStudioCode -e` |
| Python | 3.14.6 | Brand tooling | Any Python 3.10 or later |
| Chrome or Edge | any | Renders the brand images | Already present on Windows |

## 2. Repository and GitHub

```powershell
git clone https://github.com/CyberbuildsAI/REDdeck.git
cd REDdeck
git config user.name  "CyberbuildsAI"
git config user.email "340969962+CyberbuildsAI@users.noreply.github.com"
npm install
```

## 3. Build and run

| Script | Runs |
|---|---|
| `npm run build` | Bundles `src/extension.ts` to `dist/extension.js` with esbuild |
| `npm run watch` | The same, rebuilding on every change |
| `npm run typecheck` | `tsc --noEmit` over `src/` |
| `npm run smoke` | Runs `scripts/smoke.mjs`: classifies sample layouts, adds them to a temp library, deploys into a fake game folder with hardlinks, changes a file by hand, undoes, and imports from Vortex if it is installed (read-only) |
| `npm run package` | Builds a `.vsix` into `dist/` with vsce |

To run it, open the repo in VS Code and press F5. A second VS Code window opens with REDdeck loaded; its Mods view is in the activity bar. Set `reddeck.gamePath` in that window's settings if the game is not in the Steam default folder.

The mod library defaults to `%USERPROFILE%\REDdeck`. Point `reddeck.libraryPath` at a scratch folder while developing, so tests never touch a real library.

Archives: zip and 7z are opened by the `7za.exe` from the `7zip-bin` package, which the build copies to `bin/` so the `.vsix` carries it (the folder is git-ignored). rar needs 7-Zip or WinRAR installed; REDdeck looks in both Program Files folders.

Archive conflicts need a REDbridge build (0.4.0 or later). With the REDbridge repo cloned and built next to this one, REDdeck finds `..\REDbridge\src\REDbridgein\Release
et10.0\REDbridge.exe` on its own; otherwise set `reddeck.bridgePath`. With a per-user .NET runtime also set `reddeck.dotnetRoot` (the smoke test reads `DOTNET_ROOT` or falls back to `%LOCALAPPDATA%\Microsoft\dotnet`).

A real-game test needs a game folder that Vortex does not manage. REDdeck refuses to deploy while `vortex.deployment.json` is present; purge in Vortex first, or point `reddeck.gamePath` at a copy of the game folder.

## 4. Docs site and brand images

The site at https://cyberbuildsai.github.io/REDdeck/ is built by `.github/workflows/pages.yml` on every push to `main`. **Settings > Pages > Source** must be **GitHub Actions**.

```powershell
.\tools\brand\render.ps1   # banner, social preview, icon, badges
```

| Output | Used by |
|---|---|
| `docs/assets/brand/banner.png` | README header |
| `docs/assets/brand/social.png` | Upload by hand in Settings > General > Social preview |
| `docs/assets/brand/icon.png` | Extension and site icon (copied to `images/icon.png`) |
| `docs/assets/brand/badges/*.svg` | README badges. Edit the list in `tools/brand/badges.py` |
