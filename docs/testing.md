---
title: Tests
---

# <span class="y">Tests</span>

Every test run on EDGEdeck so far: how to run it again, what to expect, and what it showed. The automated tests run on every release; the hand tests are the owner's, on the laptop and on the owner's PC (game on `E:`). New tests are added here when they are first run.

Releases up to 0.26.6 were published as REDdeck; this page uses the new name throughout.

Last updated 2026-10-17. Dates before then come from the session records; anything not confirmed there is marked unverified.

## At a glance

| Test | Kind | Last run | Result |
|---|---|---|---|
| [Type check and build](#type-check-and-build) | Automated, every release | 2026-10-16 (0.26.6) | Pass |
| [Smoke test](#smoke-test) | Automated, every release | 2026-10-16 (0.26.6) | Pass |
| [UI test](#ui-test-in-a-real-vs-code) | Automated, by hand only (not in CI) | 2026-10-14 (0.26.0) | Pass |
| [Publish workflow](#publish-workflow) | Automated, on a tag | 2026-10-16 (v0.26.6) | Pass |
| [npm package install](#npm-package-install) | By hand | 2026-10-16 (0.26.5) | Pass |
| [Hand tests by the owner](#hand-tests-by-the-owner) | By hand, real game | 2026-10-16 | 23 runs, see the table |
| [Waiting](#waiting-for-a-hand-test) | By hand | | 9 open |

## Automated

### Type check and build

```powershell
npm install
npm run typecheck
npm run build
```

`typecheck` is `tsc --noEmit`. `build` bundles `dist/extension.js`, `core.js`, `mcp.js` and `uiTest.js` with esbuild and writes ThirdPartyNotices.txt. Expected: no errors.

### Smoke test

```powershell
npm run build
npm run smoke
```

`scripts/smoke.mjs` runs the core end to end against a fake game folder in a temp directory. It never touches a real library or game. Expected: ends with `smoke: all passed`.

| Area | Checks |
|---|---|
| Classifier | Bare archive (readme ignored), mixed archive, reds, tweak and xl, a CET folder, option folders as a choice, REDnode packages in three layouts (and REDnode itself as a framework), loose `.reds`, RED4ext plugin, REDmod, frameworks |
| Library and deploy | Extract a zip with 7za and add it; a conflict won by order; hardlinks (7 linked, none skipped); the deploy report (mods counted, paths, the load order files section); a single `.archive` goes to `archive/pc/mod` and in and out of `modlist.txt`; a second deploy does nothing; a reorder replaces the file |
| Outside changes | A changed file is skipped until answered, Keep imports it and relinks, a missing file comes back; a rebuilt mod relinks silently |
| Projects | Find the `.cpmodproj`, its packed files, re-sync; `installProject` adds as version dev, then refreshes in place and keeps its slot |
| Families and order | Versions newest first, update, switch version, a new version takes the old one's place, two on in a family found; place above; sections (add, order, move, rename, delete, the section box) |
| Loadouts | Version 1 save and load; Default from the current state, sync writes once, new, edit without touching mods, Make active both ways, the active one cannot be deleted, rename, export, import, delete |
| CLI and MCP | `edgedeck list --json`, off and on, conflicts, loadouts, deploy, changes, mod; the MCP server over stdio through the SDK's client (list, turn off reaches the files, pending, a bad id is an error, the tool count) |
| Off and Undo | Files and created folders leave; Undo puts a backed-up foreign file back and keeps the user's own files |
| Game | Archive conflict maths; REDmod's enabled list; finding the game through Steam libraries, GOG and Epic; the game version from a real install if present |
| REDbridge | A build next to the checkout is new enough and `archive.openMod` lists a sample (skipped if absent); the latest GitHub release has a `win-x64.zip` (skipped offline); `dotnet10Root` |
| Nexus | Single sign-on against a fake socket; OAuth with PKCE against a fake HTTP Nexus (state, code exchange, refusal, cancel, refresh, the user from the token, a 401 renewed once); nxm parsing, versions, newest file, the link handler; the registered forwarder run as Windows runs it, with a link that has `&` between its parameters |
| Add to Project | Loose files under `source/resources`, archives reported, a repeat counted as same, a changed file kept unless Replace |
| Frameworks | Game version against the manifest, the summary line |
| Vortex | Staging folders (user's choice first, the manifest's stagingPath, other drives), display names (CET by Nexus id 107); the live Vortex library if installed, imported read-only into the temp library |

Not covered: the running-game check (`gameRunning()`, 0.26.3), checked only as "not running" on the laptop.

### UI test in a real VS Code

```powershell
npm run build
npm run test:ui
```

Downloads a VS Code build into `.vscode-test/` once (about 350 MB), then runs `src/uiTest.ts` inside it with a scratch library and a fake game. Expected: `ui test: passed`. Not part of the publish workflow.

| Check | Expected |
|---|---|
| Activation | `edgemodders.edgedeck` activates |
| Commands | All 32 registered |
| Library | Created on refresh |
| Deploy | A hand-made mod deploys without a dialog: the archive in the game, a manifest, `modlist.txt` reading `UiTest.archive` |
| Views | Check conflicts opens Conflicts, Show changes opens Pending changes, Open page opens EDGEdeck, Details opens |

### Publish workflow

Push a tag `vX.Y.Z` matching `package.json`. `.github/workflows/publish.yml` checks the match, runs typecheck, build and smoke, packages for win32-x64, builds the Nexus zip, publishes to the VS Code Marketplace and Open VSX, publishes `@edgemodders/edgedeck-mcp` to npm (skipped if that version exists), and makes the GitHub release. `verify-tokens.yml`, run by hand, checks the store tokens.

| Run | Result |
|---|---|
| v0.26.0 (10-14), v0.26.1 (10-15), v0.26.2, v0.26.3 (10-16) | Pass |
| v0.26.4 (10-16) | **Failed at npm**: `npm publish dist/npm` was read as a GitHub repo; it needs `./dist/npm`. The extension reached both stores; the GitHub release was made by hand |
| v0.26.5 (10-16) | Pass, npm included |
| v0.26.6 (10-16) | Pass, the first with the Nexus zip (`EDGEdeck-0.26.6-nexus.zip` on the release) |
| verify-tokens (10-14) | Pass on the last of four runs (one failure, cause not recorded) |

### npm package install

By hand, not scripted. Install the published `@edgemodders/edgedeck-mcp` into an empty folder, start `edgedeck-mcp --library <scratch>` through an MCP client, and run `edgedeck list --json --library <scratch>`.

Run 2026-10-16 on 0.26.5: **pass**. The server answered with 14 `edgedeck_*` tools and a `edgedeck_list` call; the CLI ran.

## Hand tests by the owner

| Date | Version | Where | Tested | Result, and what came of it |
|---|---|---|---|---|
| 10-12 | 0.7.0 | Laptop | Purging Vortex before the first deploy | Vortex reported a missing .NET runtime: a user-level `DOTNET_ROOT` from the REDbridge setup. Removed; **0.7.1** sets it for REDbridge only |
| 10-12 | 0.7.1 | Laptop | **First real deploy** | 358 files (357 hardlinks and `modlist.txt`), 17 mods with RED4ext, redscript, ArchiveXL, Codeware, CET; no outside changes; one conflict (`BackstoryManager.reds`). Led to the Conflicts panel in **0.8.0**. The game's own launch afterwards: unverified |
| 10-12 | 0.8.0 to 0.8.2 | Laptop | Show conflicts | "Works well." Dropdowns (**0.8.1**, "Looks good") and Deploy now (**0.8.2**) on request |
| 10-12 | 0.7 to 0.9 | Laptop | Nexus with a pasted API key | Key validated; the update check ran on 13 mods with Nexus ids (Codeware 1.20.3 to 1.20.5 offered) |
| 10-12 | 0.9.0, 0.9.1 | Laptop | The mods table page | "Looks good"; the framework chip first (**0.9.1**); a doubled "update available" fixed and update from the row added (**0.9.2**) |
| 10-12 | 0.9.2 | Laptop | Update from a live Nexus download | Downloaded several times, a row each. **0.10.0**: one row per mod with a version dropdown |
| 10-12 | 0.10.0 | Laptop | Switch back to an older Codeware | "Looks good", but Deploy said 18 changes. **0.10.1** counts paths: 9 |
| 10-13 | 0.11.0, 0.12.0 | PC | VSIX install, Get REDbridge | "Seemed to complete successfully" (REDbridge 0.4.0). Telling whether it ran led to the footer status (**0.13.1**) |
| 10-13 | 0.12.0 to 0.13.2 | PC | Finding a Steam game on `E:` | Not found. **0.13.0** reads Steam's library list, GOG and Epic; **0.13.2** logs what was checked. After clearing `edgedeck.gamePath` and reloading, found through Steam |
| 10-13 | 0.14.0 (unverified which) | PC | The build sent just before | "All looks good" |
| 10-13 | 0.17.x | PC | F5 from source | The build task failed after a pull: dependencies missing. `npm install` fixed it |
| 10-14 | 0.20.0 | PC | **REDnode package kind**: EDGEbuilder added and deployed, after all Vortex mods were purged | Worked: `red4ext\plugins\REDnode\apps\edgebuilder\rednode-app.json` in place |
| 10-14 | 0.20.0 | PC | Import from Vortex | "No Vortex mods were found": staging was on `E:`. **0.20.1** reads Vortex's stagingPath and other drives, and asks. RED4ext, redscript and Codeware were then re-added through EDGEdeck, and EDGEbuilder B1 passed in game that night |
| 10-14 | 0.21.0 | PC | Conflicts with EDGEbuilder 0.2.0 beside 0.1.1 | Every picker said "Resolve...": two versions both on, not one family. **0.21.1**: a new version takes the old one's place, one row per mod pair, Use only |
| 10-14 | 0.23.0 | PC | Sections, the section box, icon actions, resizable columns | "Looks good"; the yellow icons "too loud": grey with hover in **0.23.1** |
| 10-14 | 0.24.0 | PC | Folding sections | "Works great." |
| 10-14 | 0.25.0 test build | PC | Import from Vortex (TweakXL) | Everything pre-ticked, and a search hid over 900 ticked mods, so all imported and it looked hung. **0.25.0**: nothing ticked, progress with Cancel, a question above 20; section-wide Put in section and Remove on request |
| 10-14 | 0.25.0, 0.25.1 | PC | The section buttons | Not shown: VS Code kept the earlier build of the same version. Rebuilt as **0.25.1**, "It works now." Since then every build sent gets its own version |
| 10-14 | 0.25.1, 0.25.2 | PC | Deploying 6 mods | The toast gave files but no mods. **0.25.2** counts mods and adds View report: "It works very well." |
| 10-15 | 0.26.0 | PC | Adding a single `.archive`, then deploy | A single file could not be added, and `modlist.txt` was not updated. **0.26.1** fixes both; the fix not yet reported (below) |
| 10-16 | 0.26.1 | PC | Import from Vortex, search "Cyber Engine Tweaks" | Not found: named after its download. **0.26.2**: known names by Nexus id, a wider search. Not yet reported back (below) |
| 10-16 | 0.26.2 | PC | Turn a mod off, add an `.archive`, deploy | `EPERM` on the archive: the game was running. **0.26.3** waits for the game to close, the CLI refuses, a locked file gets a plain message |
| 10-16 | 0.26.3 or later | PC | Deploying EDGEbuilder 0.3.2 and 0.3.3 for its tests | Deployed; EDGEbuilder's retest passed. Nothing EDGEdeck-specific reported |
| 10-17 | 0.27.0 test build | PC | The switch to EDGEdeck: every mod off and deployed in REDdeck, REDdeck uninstalled, EDGEdeck installed from the .vsix and set up from nothing, mods added again and deployed | Worked. The empty Mods view had no Handle download links button (the step showed only in the Set up group of a non-empty list): **0.27.0** adds it to the welcome view |
| 10-17 | 0.27.0 test build | PC | A "Mod manager download" button on Nexus, after Handle download links | A console window flashed, then nothing. The registered PowerShell forwarder took the link as code, and the `&` between its parameters is a parse error there; this was so since nxm links came in (0.7). **0.27.0** quotes the link, rewrites an older EDGEdeck registration by itself, and logs each link it receives; the smoke test now runs the forwarder |

## Waiting for a hand test

| # | Test | Since | Steps |
|---|---|---|---|
| 1 | **Loadouts** | 0.26.0 | Copy Default and turn a few mods off in the copy on the page: the sidebar does not change. Make active, Deploy: the report lists those mods' files as removed. Switch back from the title bar and deploy again |
| 2 | **Add to Project with an archive** | 0.25.0; needs REDcode 0.6.1+ with REDbridge 0.7.1 and an open `.cpmodproj` | Right-click an `.archive` in a mod, Add to Project, "All N resources": a message counts what went under `source\archive`, the files show in the Project view. Again with "Choose resources...", two or three ticked: only those. A third time: already there; Keep mine leaves them, Replace rewrites. On a whole mod with loose files and an archive: loose to `source\resources`, archive resources to `source\archive`, one message. Send EDGEdeck's and REDcode's logs if anything fails |
| 3 | Add to Project with loose files | 0.18.0 | No report found (unverified) |
| 4 | **`modlist.txt` and single files** | 0.26.1 | After updating, one change waits; Deploy. `modlist.txt` lists both archives, and View shows it replaced. Add mod, a bare `.archive`, deploy: it is in `modlist.txt` |
| 5 | **The running game** | 0.26.3 | Deploy with the game open: EDGEdeck waits for "The game is closed now". `edgedeck deploy` refuses |
| 6 | CET's known name | 0.26.2 | In Import from Vortex, search "Cyber Engine Tweaks", "CET" or "107": found |
| 7 | **Nexus nxm links** | 0.27.0 (failed on the 10-17 test build) | Start EDGEdeck once (it rewrites its old registration; the log says so), then a real "Mod manager download" link: the log says `Nexus link received`, and the file downloads into the library. OAuth sign-in waits for Nexus's client id; only the fake-server smoke test covers it |
| 8 | REDmod deploy | M1 | Never seen working: no REDmod package in the test sets |
| 9 | Not hand-tested | | Light-theme accents and the HUD theme suggestion; the MCP server used from an assistant; Undo on the real game (unverified) |
