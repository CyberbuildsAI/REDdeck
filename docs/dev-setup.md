# Development setup

Everything needed to work on REDpack, in order. A fresh machine should be able to follow this top to bottom. The shared tools (Git, Node, Python, winget) are the same as in [REDnode's setup guide](https://cyberbuildsai.github.io/REDnode/dev-setup.html).

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
git clone https://github.com/CyberbuildsAI/REDpack.git
cd REDpack
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
| `npm run package` | Builds a `.vsix` into `dist/` with vsce |

To run it, open the repo in VS Code and press F5. A second VS Code window opens with REDpack loaded; its Mods view is in the activity bar. Set `redpack.gamePath` in that window's settings if the game is not in the Steam default folder.

The mod library defaults to `%USERPROFILE%\REDpack`. Point `redpack.libraryPath` at a scratch folder while developing, so tests never touch a real library.

## 4. Docs site and brand images

The site at https://cyberbuildsai.github.io/REDpack/ is built by `.github/workflows/pages.yml` on every push to `main`. **Settings > Pages > Source** must be **GitHub Actions**.

```powershell
.\tools\brand\render.ps1   # banner, social preview, icon, badges
```

| Output | Used by |
|---|---|
| `docs/assets/brand/banner.png` | README header |
| `docs/assets/brand/social.png` | Upload by hand in Settings > General > Social preview |
| `docs/assets/brand/icon.png` | Extension and site icon (copied to `images/icon.png`) |
| `docs/assets/brand/badges/*.svg` | README badges. Edit the list in `tools/brand/badges.py` |
