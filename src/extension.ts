// REDdeck: a simple mod manager for Cyberpunk 2077. The extension is a thin shell over src/core.ts:
// the Mods view, the four verbs (add, on/off, deploy, remove), undo, import from Vortex, the detail
// panel, and the archive conflict scan through REDbridge when it is available.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { BridgeClient, compareVersions, findBridge, MinBridgeVersion } from "./bridgeClient";
import { classify, rednodeManifest } from "./classifier";
import { enabledArchives, findArchiveConflicts, type ArchiveConflictSummary, type ArchiveListing } from "./conflicts";
import { deploy, detectChanges, modStatus, modsRemoved, modsTouched, writeDeployReport, pendingChanges, plan, readManifest, undo, vortexManages, type Change, type Decision, type DeployResult, type PendingChange, type Plan } from "./deploy";
import { ChangesPanel, type ChangesMessage } from "./changesPanel";
import { dotnet10Root, installBridge, installDotnetRuntime, installedBridge, latestBridgeRelease, removeOlderBridges } from "./bridgeInstall";
import { ConflictsPanel, type ConflictsMessage } from "./conflictsPanel";
import { DetailPanel } from "./detailPanel";
import { activateVersion, families, familyOf, familyUpdate, findSameVersion, type Family, settleNewVersion, familiesWithTwoOn, familyKey } from "./families";
import { checkFrameworks, frameworkDetail, frameworkSummary, type FrameworkCheck } from "./frameworks";
import { ModsPage, type PageMessage, type PageRow } from "./modsPage";
import { addSection, deleteSection, moveInSection, moveSection, placeNextTo, putInSection, renameSection, sectionNameOf, sectionNameProblem, sectionsOf, setSectionOn } from "./sections";
import { forgetSizes, librarySize, modSize } from "./sizes";
import { findSevenZip, unpackOrCopy } from "./extract";
import { findGame, gameRunning, gameVersion, isGameFolder, steamLibraries } from "./game";
import { addMod, defaultLibraryPath, downloadsFolder, keepDownload, loadLibrary, modFolder, placeAbove, removeMod, saveMod, sourcePath, type Library, type ModInfo, type ModSource } from "./library";
import { activeLoadout, deleteLoadout, exportLoadout, findLoadout, importLoadout, listLoadouts, loadoutNameProblem, loadoutState, makeActive, newLoadout, readLoadout, renameLoadout, saveLoadout, setInLoadout, syncActiveLoadout } from "./loadouts";
import { ModsView, type ModNode, type SetupStep } from "./modsView";
import { download, md5Of, modPageUrl, newestFile, NexusClient, versionNewer } from "./nexus";
import { ApiKeysPage, hasWebSocket, signIn } from "./nexusSso";
import { fetchUser, needsRefresh, OAuthTokens, refreshTokens, signInWithOAuth, tokenUser } from "./nexusOAuth";
import { currentNxmHandler, describeHandler, parseNxm, registerNxmHandler, unregisterNxmHandler } from "./nxm";
import { deployRedmod, enabledRedmodPackages } from "./redmod";
import { addToProject, classifyProject, findProjectFile, installProject, projectName, syncProjects } from "./project";
import { importFromVortex, listVortexMods, vortexDisplayName, vortexStagingCandidates } from "./vortex";

let library: Library | undefined;
let view: ModsView;
let tree: vscode.TreeView<ModNode>;
let detail: DetailPanel;
let status: vscode.StatusBarItem;
let log: vscode.OutputChannel;
let sevenZa: string | undefined;
let extensionRoot = "";
let storageDir = "";
/** The game folder found through Steam, GOG or Epic, looked up once per reload. */
let detectedGame: string | undefined;
let extensionVersion = "0.0.0";
let secrets: vscode.SecretStorage;
let globalState: vscode.Memento;
let bridge: BridgeClient | undefined;
let bridgeExe = "";
let scanTimer: NodeJS.Timeout | undefined;
let state: { plan?: Plan; changes: Change[]; archive?: ArchiveConflictSummary; version?: string; bridgeInfo?: string; bridgeUpdate?: string; setup: SetupStep[]; nxmHandler?: string; vortexMods: number } = { changes: [], setup: [], vortexMods: 0 };
const archiveCache = new Map<string, { mtimeMs: number; resources: Map<string, string> }>();

export function activate(context: vscode.ExtensionContext): REDdeckApi {
  extensionRoot = context.extensionPath;
  storageDir = context.globalStorageUri.fsPath;
  extensionVersion = String((context.extension.packageJSON as { version?: string }).version ?? "0.0.0");
  secrets = context.secrets;
  globalState = context.globalState;
  log = vscode.window.createOutputChannel("REDdeck");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
  status.command = "reddeck.deploy";
  status.show();
  sevenZa = findSevenZip(extensionRoot);

  view = new ModsView(() => library, statusFor, frameworkCheck, () => state.setup);
  tree = vscode.window.createTreeView("reddeck.mods", { treeDataProvider: view, showCollapseAll: false });
  detail = new DetailPanel((action, id) => run(() => detailAction(action, id)));
  conflictsPanel = new ConflictsPanel((m) => run(() => conflictsAction(m)));
  modsPage = new ModsPage((m) => run(() => pageAction(m)));
  changesPanel = new ChangesPanel((m) => run(() => changesAction(m)));

  context.subscriptions.push(
    log,
    status,
    tree,
    { dispose: () => bridge?.stop() },
    tree.onDidChangeCheckboxState((e) => {
      for (const [node, checked] of e.items) {
        if (node.type !== "mod" || !library) continue;
        node.mod.enabled = checked === vscode.TreeItemCheckboxState.Checked;
        saveMod(library, node.mod);
        log.appendLine(`${node.mod.name}: ${node.mod.enabled ? "on" : "off"}`);
      }
      refresh();
    }),
    vscode.commands.registerCommand("reddeck.addMod", () => run(addModCommand)),
    vscode.commands.registerCommand("reddeck.importVortex", () => run(importVortexCommand)),
    vscode.commands.registerCommand("reddeck.addProject", (uri?: vscode.Uri) => run(() => addProjectCommand(uri?.fsPath))),
    vscode.commands.registerCommand("reddeck.saveLoadout", () => run(saveLoadoutCommand)),
    vscode.commands.registerCommand("reddeck.loadLoadout", () => run(loadLoadoutCommand)),
    vscode.commands.registerCommand("reddeck.exportLoadout", () => run(() => exportLoadoutCommand(library ? activeLoadout(library, state.version) : ""))),
    vscode.commands.registerCommand("reddeck.importLoadout", () => run(importLoadoutCommand)),
    vscode.commands.registerCommand("reddeck.deploy", () => run(deployCommand)),
    vscode.commands.registerCommand("reddeck.undo", () => run(undoCommand)),
    vscode.commands.registerCommand("reddeck.remove", (node: ModNode) => run(() => removeCommand(modOf(node)))),
    vscode.commands.registerCommand("reddeck.details", (node: ModNode) => run(() => showDetails(modOf(node)))),
    vscode.commands.registerCommand("reddeck.checkConflicts", () => run(showConflicts)),
    vscode.commands.registerCommand("reddeck.openPage", () => run(showPage)),
    vscode.commands.registerCommand("reddeck.suggestTheme", () => run(() => suggestTheme(true))),
    vscode.commands.registerCommand("reddeck.showChanges", () => run(() => showChanges())),
    vscode.commands.registerCommand("reddeck.getBridge", () => run(getBridgeCommand).then(() => refreshSetup())),
    vscode.commands.registerCommand("reddeck.updateBridge", () => run(getBridgeCommand).then(() => refreshSetup())),
    vscode.commands.registerCommand("reddeck.setup", () => run(setupCommand)),
    vscode.commands.registerCommand("reddeck.mcpSetup", () => run(mcpSetupCommand)),
    ...registerMcp(),
    { dispose: () => stopWatching() },
    vscode.commands.registerCommand("reddeck.hideSetupStep", (node: ModNode) => run(() => hideSetupStep(node))),
    secrets.onDidChange((e) => {
      if (e.key === NexusKeySecret || e.key === NexusTokensSecret) void refreshSetup();
    }),
    vscode.commands.registerCommand("reddeck.pickGame", () => run(pickGameCommand)),
    vscode.commands.registerCommand("reddeck.switchVersion", (node: ModNode) => run(() => switchVersionCommand(modOf(node)))),
    vscode.commands.registerCommand("reddeck.moveUp", (node: ModNode) => move(modOf(node), -1)),
    vscode.commands.registerCommand("reddeck.moveDown", (node: ModNode) => move(modOf(node), 1)),
    vscode.commands.registerCommand("reddeck.addToProject", (node: ModNode) => run(() => addToProjectCommand(node))),
    vscode.workspace.onDidChangeWorkspaceFolders(() => updateProjectContext()),
    vscode.commands.registerCommand("reddeck.revealInGame", (node: ModNode) => run(() => revealInGameCommand(node))),
    vscode.commands.registerCommand("reddeck.openInExplorer", (node: ModNode) => {
      if (node?.type === "mod" && library) vscode.env.openExternal(vscode.Uri.file(modFolder(library, node.mod)));
    }),
    vscode.commands.registerCommand("reddeck.openLibrary", () => {
      if (library) vscode.env.openExternal(vscode.Uri.file(library.root));
    }),
    vscode.commands.registerCommand("reddeck.nexusSignIn", () => run(() => nexusSignInCommand().then(() => undefined))),
    vscode.commands.registerCommand("reddeck.nexusSignOut", () => run(nexusSignOutCommand)),
    vscode.commands.registerCommand("reddeck.nexusSetKey", () => run(() => nexusSetKeyCommand().then(() => undefined))),
    vscode.commands.registerCommand("reddeck.nexusOpen", (node: ModNode) => run(() => nexusOpenCommand(modOf(node)))),
    vscode.commands.registerCommand("reddeck.checkUpdates", () => run(() => checkUpdatesCommand(false))),
    vscode.commands.registerCommand("reddeck.nexusAddLink", () => run(nexusAddLinkCommand)),
    vscode.commands.registerCommand("reddeck.nexusHandleLinks", () => run(nexusHandleLinksCommand).then(() => refreshSetup(true))),
    vscode.commands.registerCommand("reddeck.nexusReleaseLinks", () => run(nexusReleaseLinksCommand).then(() => refreshSetup(true))),
    vscode.window.registerUriHandler({ handleUri: (uri) => void run(() => handleUri(uri)) }),
    vscode.commands.registerCommand("reddeck.refresh", () => reload()),
    vscode.commands.registerCommand("reddeck.showLog", () => log.show(true)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("reddeck")) {
        bridge?.stop();
        bridge = undefined;
        reload();
      }
    }),
  );

  reload();
  return api;
}

/**
 * What other extensions get from extensions.getExtension("edgemodders.reddeck").exports. REDcode
 * uses it to install a packed project as a mod and deploy it, so one tool owns the game folder.
 * Keep it small and stable: bump apiVersion when a call changes meaning.
 */
export interface REDdeckApi {
  apiVersion: 1;
  /** The game folder REDdeck deploys to, or "" when it has none. */
  gamePath(): string;
  /** The id of the mod that follows this project, if REDdeck has one. */
  projectMod(projectFile: string): string | undefined;
  /** Adds the project's packed output, or refreshes the mod that follows it, and turns it on. Does not deploy. */
  installProject(projectFile: string): { id: string; name: string; files: number; added: boolean };
  /** Names of the mods, other than `except`, whose changes wait for a deploy. */
  pendingMods(except?: string): string[];
  /** Deploys as REDdeck: Deploy does, with its questions and its result message. Undefined when refused or cancelled. */
  deploy(): Promise<{ linked: number; removed: number; kept: number; skipped: string[]; conflicts: number } | undefined>;
  /** Turns a mod off; the next deploy removes its files from the game. */
  turnOff(id: string): void;
}

function needLibrary(): Library {
  if (!library) throw new Error("REDdeck has no library loaded; see the REDdeck log.");
  return library;
}

const api: REDdeckApi = {
  apiVersion: 1,
  gamePath: () => settings().gamePath,
  projectMod: (projectFile) => library?.mods.find((m) => m.source.type === "project" && m.source.path?.toLowerCase() === projectFile.toLowerCase())?.id,
  installProject: (projectFile) => {
    const { mod, added } = installProject(needLibrary(), projectFile);
    log.appendLine(`${added ? "Added" : "Refreshed"} ${mod.name} from project ${projectFile} for REDcode (${mod.files.length} files, ${mod.kinds.join(", ")})`);
    refresh();
    return { id: mod.id, name: mod.name, files: mod.files.length, added };
  },
  pendingMods: (except) => {
    const lib = needLibrary();
    const { gamePath } = settings();
    if (!isGameFolder(gamePath)) return [];
    const ids = new Set(pendingChanges(lib, gamePath, plan(lib, gamePath)).map((c) => c.mod));
    ids.delete(except ?? "");
    ids.delete("reddeck");
    return [...ids].map((id) => lib.mods.find((m) => m.id === id)?.name ?? id);
  },
  deploy: async () => {
    const result = await deployNow();
    return result && { linked: result.linked, removed: result.removed, kept: result.kept, skipped: result.skipped, conflicts: state.plan?.conflicts.length ?? 0 };
  },
  turnOff: (id) => {
    const lib = needLibrary();
    const mod = lib.mods.find((m) => m.id === id);
    if (!mod) throw new Error(`REDdeck has no mod with id ${id}`);
    mod.enabled = false;
    saveMod(lib, mod);
    refresh();
  },
};

export function deactivate(): void {
  bridge?.stop();
}

function modOf(node: ModNode | undefined): ModInfo | undefined {
  return node && node.type !== "group" && node.type !== "setup" ? node.mod : undefined;
}

// ---- setup: what is missing, as rows in the tree, buttons on the page and welcome content ---

const SetupHiddenKey = "reddeck.setupHidden";

/** Every step, done or not, in the order they matter. */
async function allSetupSteps(): Promise<(SetupStep & { done: boolean })[]> {
  const signedIn = await nexusSignedIn();
  const handler = describeHandler(state.nxmHandler);
  return [
    { id: "game", label: "Find the game folder", detail: "Not found through Steam, GOG or Epic", command: "reddeck.pickGame", done: isGameFolder(settings().gamePath) },
    { id: "bridge", label: "Get REDbridge", detail: "Sees conflicts inside archives; a 70 MB download", command: "reddeck.getBridge", done: !!bridgeExe },
    { id: "nexus", label: "Sign in to Nexus Mods", detail: "For updates and downloads from the site", command: "reddeck.nexusSignIn", done: signedIn },
    { id: "links", label: "Handle Nexus download links", detail: `Mod manager download buttons go to ${handler} now`, command: "reddeck.nexusHandleLinks", done: !signedIn || handler === "REDdeck" },
    { id: "vortex", label: "Import from Vortex", detail: `${state.vortexMods} mod${state.vortexMods === 1 ? "" : "s"} in Vortex, none in the library yet`, command: "reddeck.importVortex", done: !state.vortexMods || !!library?.mods.some((m) => m.source.type === "vortex") },
  ];
}

/** Recomputes the steps to show; `full` re-reads the nxm handler from the registry. */
async function refreshSetup(full = false): Promise<void> {
  if (full) state.nxmHandler = await currentNxmHandler();
  const hidden = new Set(globalState.get<string[]>(SetupHiddenKey, []));
  const all = await allSetupSteps();
  state.setup = all.filter((s) => !s.done && !hidden.has(s.id));
  for (const s of all) void vscode.commands.executeCommand("setContext", `reddeck.setup.${s.id}`, !s.done && !hidden.has(s.id));
  view.refresh();
  void updatePage();
}

async function hideSetupStep(node: ModNode | undefined): Promise<void> {
  if (node?.type !== "setup") return;
  const hidden = new Set(globalState.get<string[]>(SetupHiddenKey, []));
  hidden.add(node.step.id);
  await globalState.update(SetupHiddenKey, [...hidden]);
  log.appendLine(`Setup: "${node.step.label}" hidden. REDdeck: Set up... shows every step again.`);
  await refreshSetup();
}

/** The palette's "REDdeck: Set up...": every step with its state, and hidden ones come back. */
async function setupCommand(): Promise<void> {
  await globalState.update(SetupHiddenKey, []);
  await refreshSetup(true);
  const all = await allSetupSteps();
  const picked = await vscode.window.showQuickPick(
    all.map((s) => ({ label: `${s.done ? "$(check)" : "$(circle-large-outline)"} ${s.label}`, description: s.done ? "done" : s.detail, step: s })),
    { title: "REDdeck: Set up", placeHolder: "Pick a step to do it" },
  );
  if (picked && !picked.step.done) await vscode.commands.executeCommand(picked.step.command);
}

function settings(): { gamePath: string; libraryPath: string; bridgePath: string; dotnetRoot: string; checkUpdates: boolean; vortexStaging: string } {
  const cfg = vscode.workspace.getConfiguration("reddeck");
  return {
    gamePath: cfg.get<string>("gamePath", "") || detectedGame || "",
    libraryPath: cfg.get<string>("libraryPath", "") || defaultLibraryPath(),
    bridgePath: cfg.get<string>("bridgePath", ""),
    dotnetRoot: cfg.get<string>("dotnetRoot", ""),
    checkUpdates: cfg.get<boolean>("nexusCheckUpdatesOnStart", true),
    vortexStaging: cfg.get<string>("vortexStagingPath", ""),
  };
}

async function run(fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.appendLine(`Error: ${message}`);
    void vscode.window.showErrorMessage(`REDdeck: ${message}`, "Show log").then((a) => a && log.show(true));
  }
}

function reload(): void {
  forgetSizes();
  const configured = vscode.workspace.getConfiguration("reddeck").get<string>("gamePath", "");
  detectedGame = configured ? undefined : findGame();
  const { libraryPath, gamePath } = settings();
  try {
    library = loadLibrary(libraryPath, gamePath);
    const how = configured ? "from the reddeck.gamePath setting" : detectedGame ? "found through Steam, GOG or Epic" : "not found";
    log.appendLine(`Library: ${libraryPath} (${library.mods.length} mods), game: ${gamePath || "(none)"} (${how})`);
    if (!configured && !detectedGame) {
      const libs = steamLibraries();
      log.appendLine(`  Steam libraries checked: ${libs.length ? libs.join("; ") : "none (Steam is not in the registry)"}`);
      log.appendLine("  Use REDdeck: Pick the game folder... to set it, and please report the lines above if the game is in one of those libraries.");
    }
  } catch (err) {
    library = undefined;
    log.appendLine(`Could not open the library at ${libraryPath}: ${String(err)}`);
    void vscode.window.showErrorMessage(`REDdeck could not open the library at ${libraryPath}. See the log.`);
  }
  bridgeExe = findBridge(settings().bridgePath, extensionRoot) ?? installedBridge(storageDir) ?? "";
  try {
    state.vortexMods = listVortexMods(gamePath, settings().vortexStaging || undefined).length;
  } catch (err) {
    state.vortexMods = 0;
    log.appendLine(`Vortex staging folder not readable: ${String(err)}`);
  }
  void run(() => refreshSetup(true));
  void gameVersion(gamePath).then((v) => {
    state.version = v;
    tree.description = v ? `Cyberpunk 2077 ${v}` : undefined;
    updateStatus();
    view.refresh();
    void updatePage();
    void run(() => gameChanged(v));
  });
  refresh();
  watchLibrary(libraryPath, gamePath);
  void run(maybeCheckUpdates);
  void run(maybeCheckBridge);
}

// ---- Add to Project: a mod's loose files into the open REDcode project -------------------------

/** The open project: the first .cpmodproj directly inside a workspace folder, as REDcode sees it. */
function currentProject(): string | undefined {
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const file = findProjectFile(folder.uri.fsPath);
    if (file) return file;
  }
  return undefined;
}

function updateProjectContext(): void {
  void vscode.commands.executeCommand("setContext", "reddeck.projectOpen", !!currentProject());
}

/** What redcode.extractToProject returns (REDcode request #1): project-relative paths. */
interface ExtractResult {
  written: string[];
  kept: string[];
  failed: string[];
}

/**
 * Puts resources from one of a mod's .archive files into the open project's source\archive, through
 * REDcode's redcode.extractToProject. Asks which resources (all, or a pick), and whether to replace
 * the ones the project already has. Undefined when the user backed out.
 */
async function extractArchiveToProject(mod: ModInfo, rel: string, projectLabel: string): Promise<{ written: string[]; summary: string } | undefined> {
  if (!library) return undefined;
  const file = sourcePath(library, mod, rel);
  const archiveName = rel.split("/").pop() ?? rel;
  let resources: Map<string, string>;
  try {
    resources = await archiveResources(file);
  } catch (err) {
    return { written: [], summary: `${archiveName} not read: ${err instanceof Error ? err.message : String(err)}` };
  }
  const names = [...resources].map(([hash, n]) => n || hash).sort((a, b) => a.localeCompare(b));
  if (!names.length) return { written: [], summary: `${archiveName} holds no resources` };
  const how = await vscode.window.showQuickPick(
    [
      { label: `All ${names.length} resource${names.length === 1 ? "" : "s"}`, all: true },
      { label: "Choose resources...", all: false },
    ],
    { title: `${archiveName}: put which resources in ${projectLabel}?`, placeHolder: "They go to source\\archive at their game paths, through REDcode" },
  );
  if (!how) return undefined;
  let paths = names;
  if (!how.all) {
    const picked = await vscode.window.showQuickPick(
      names.map((n) => ({ label: n.split("\\").pop() ?? n, description: n })),
      { title: `${archiveName}: resources for ${projectLabel}`, canPickMany: true, matchOnDescription: true, placeHolder: "Type to filter by name or path" },
    );
    if (!picked?.length) return undefined;
    paths = picked.map((p) => p.description);
  }
  const call = (overwrite: boolean, list: string[]) => vscode.commands.executeCommand<ExtractResult>("redcode.extractToProject", { archive: file, paths: list, overwrite });
  let r = await call(false, paths);
  if (r.kept.length) {
    const a = await vscode.window.showWarningMessage(`${r.kept.length} of these ${r.kept.length === 1 ? "is" : "are"} already in ${projectLabel}. Replace ${r.kept.length === 1 ? "it" : "them"} with ${mod.name}'s?`, { modal: true, detail: r.kept.slice(0, 8).join("\n") + (r.kept.length > 8 ? `\n...and ${r.kept.length - 8} more` : "") }, "Replace", "Keep mine");
    if (a === "Replace") {
      // REDcode reports kept files as project paths: source\archive\<game path>.
      const again = await call(true, r.kept.map((k) => k.replace(/^source[\\/]archive[\\/]/i, "")));
      r = { written: [...r.written, ...again.written], kept: [], failed: [...r.failed, ...again.failed] };
    }
  }
  const bits = [`${r.written.length} resource${r.written.length === 1 ? "" : "s"} from ${archiveName} under source\\archive`];
  if (r.kept.length) bits.push(`${r.kept.length} kept as yours`);
  if (r.failed.length) bits.push(`${r.failed.length} failed (see REDcode's log)`);
  return { written: r.written, summary: bits.join(", ") };
}

async function addToProjectCommand(node: ModNode | undefined): Promise<void> {
  const mod = modOf(node);
  if (!library || !mod || !node) return;
  const project = currentProject();
  if (!project) {
    const commands = await vscode.commands.getCommands(true);
    const canCreate = commands.includes("redcode.newProject");
    const a = await vscode.window.showWarningMessage("No REDcode project is open. Open the folder that holds a .cpmodproj file, or create a project with REDcode.", ...(canCreate ? ["New Project"] : []));
    if (a === "New Project") await vscode.commands.executeCommand("redcode.newProject");
    return;
  }
  const files = node.type === "file" ? [node.file] : node.type === "folder" ? node.files : mod.files;
  const name = projectName(project);
  let result = addToProject(library, mod, files, project);
  if (result.kept.length) {
    // A file the project already has, with other content: ask, since replacing it loses edits.
    const replace = new Set<string>();
    for (const rel of result.kept) {
      const f = rel.split(path.sep).slice(2).join("/");
      const a = await vscode.window.showWarningMessage(`${rel} is already in ${name} with different content. Replace it with ${mod.name}'s file?`, { modal: true }, "Replace", "Keep mine");
      if (a === "Replace") replace.add(f);
    }
    if (replace.size) {
      const again = addToProject(library, mod, [...replace], project, replace);
      result = { ...result, copied: [...result.copied, ...again.copied], kept: result.kept.filter((r) => !again.copied.includes(r)) };
    }
  }
  const n = result.copied.length;
  const parts = [n ? `${n} file${n === 1 ? "" : "s"} added to ${name} under source\\resources` : `Nothing added to ${name}`];
  if (result.same.length) parts.push(`${result.same.length} already there`);
  if (result.kept.length) parts.push(`${result.kept.length} kept as yours`);
  const commands = await vscode.commands.getCommands(true);
  const extracted: string[] = [];
  if (result.archives.length) {
    if (commands.includes("redcode.extractToProject")) {
      for (const rel of result.archives) {
        const r = await extractArchiveToProject(mod, rel, name);
        if (r) {
          extracted.push(...r.written);
          parts.push(r.summary);
        }
      }
    } else {
      parts.push(`${result.archives.length} .archive file${result.archives.length === 1 ? "" : "s"} skipped: putting an archive's resources in a project needs REDcode`);
    }
  }
  log.appendLine(`Add to project (${name}): ${parts.join("; ")}${[...result.copied, ...extracted].length ? `\n  ${[...result.copied, ...extracted].join("\n  ")}` : ""}`);
  if (commands.includes("redcode.refreshProject")) void vscode.commands.executeCommand("redcode.refreshProject");
  const single = result.copied.length === 1 && !extracted.length ? path.join(path.dirname(project), result.copied[0]) : undefined;
  void vscode.window.showInformationMessage(`${parts.join(". ")}.`, ...(single ? ["Open"] : [])).then((a) => {
    if (a === "Open" && single) void vscode.window.showTextDocument(vscode.Uri.file(single));
  });
}

// ---- MCP: the verbs as tools for assistants ----------------------------------------------------

function mcpArgs(): string[] {
  const s = settings();
  const args = [path.join(extensionRoot, "dist", "mcp.js"), "--library", s.libraryPath];
  if (s.gamePath) args.push("--game", s.gamePath);
  return args;
}

/**
 * Registers the server with VS Code's own MCP support (1.101 and later), so agents VS Code hosts
 * see REDdeck's tools without any setup. VS Code's binary runs it as Node. Older VS Code: nothing.
 */
function registerMcp(): vscode.Disposable[] {
  const lm = (vscode as unknown as { lm?: { registerMcpServerDefinitionProvider?: (id: string, p: unknown) => vscode.Disposable } }).lm;
  const Def = (vscode as unknown as { McpStdioServerDefinition?: new (label: string, command: string, args: string[], env: Record<string, string>, version?: string) => unknown }).McpStdioServerDefinition;
  if (!lm?.registerMcpServerDefinitionProvider || !Def) return [];
  const changed = new vscode.EventEmitter<void>();
  return [
    changed,
    lm.registerMcpServerDefinitionProvider("reddeck.mcp", {
      onDidChangeMcpServerDefinitions: changed.event,
      provideMcpServerDefinitions: () => [new Def("REDdeck", process.execPath, mcpArgs(), { ELECTRON_RUN_AS_NODE: "1" }, extensionVersion)],
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("reddeck")) changed.fire();
    }),
  ];
}

/** "REDdeck: Connect an assistant (MCP)...": the one line Claude Code needs, or a JSON entry for other clients. */
async function mcpSetupCommand(): Promise<void> {
  const args = mcpArgs();
  const q = (s: string) => `"${s}"`;
  const claude = `claude mcp add reddeck -- node ${args.map(q).join(" ")}`;
  const jsonEntry = JSON.stringify({ reddeck: { command: "node", args } }, null, 2);
  const inVsCode = (vscode as unknown as { lm?: { registerMcpServerDefinitionProvider?: unknown } }).lm?.registerMcpServerDefinitionProvider ? "Agents inside this VS Code already see REDdeck's tools." : "This VS Code is older than 1.101, so agents inside it do not see MCP servers.";
  const picked = await vscode.window.showQuickPick(
    [
      { label: "$(terminal) Copy the Claude Code command", description: "claude mcp add reddeck ...", detail: "Paste it in a terminal once. Claude Code then has reddeck_list, reddeck_deploy and the rest.", action: "claude" },
      { label: "$(json) Copy a JSON entry", description: "for other MCP clients", detail: "The server entry for a client's MCP settings file.", action: "json" },
      { label: "$(file) Reveal the server file", description: "dist/mcp.js", detail: "Any MCP client can run it with Node: node mcp.js --library <folder> --game <folder>.", action: "reveal" },
    ],
    { title: "REDdeck: Connect an assistant (MCP)", placeHolder: inVsCode },
  );
  if (!picked) return;
  if (picked.action === "claude") {
    await vscode.env.clipboard.writeText(claude);
    void vscode.window.showInformationMessage("Copied. Paste it in a terminal, then ask Claude Code to list your mods.");
  } else if (picked.action === "json") {
    await vscode.env.clipboard.writeText(jsonEntry);
    void vscode.window.showInformationMessage("Copied the JSON entry for the server.");
  } else {
    await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(args[0]));
  }
  log.appendLine(`MCP: ${claude}`);
}

// ---- watching: pick up what an assistant or the command line changed ---------------------------

let watchers: fs.FSWatcher[] = [];
let watchTimer: NodeJS.Timeout | undefined;
let seenManifestTime: string | undefined;

function fingerprint(lib: Library | undefined): string {
  return lib ? `${lib.info.order.join(",")}|${lib.mods.map((m) => `${m.id}:${m.enabled ? 1 : 0}:${m.version}:${m.files.length}`).join(",")}` : "";
}

function stopWatching(): void {
  for (const w of watchers) w.close();
  watchers = [];
  if (watchTimer) clearTimeout(watchTimer);
}

/** Reloads when the library or the game's manifest changed and the change was not ours. */
function watchLibrary(libraryRoot: string, gamePath: string): void {
  stopWatching();
  if (library) {
    try {
      syncActiveLoadout(library, state.version);
      tree.description = `Loadout: ${activeLoadout(library, state.version)}`;
    } catch (err) {
      log.appendLine(`Loadout: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  seenManifestTime = readManifest(gamePath)?.time;
  const onChange = (): void => {
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      try {
        const fresh = loadLibrary(libraryRoot, gamePath);
        const manifestTime = readManifest(gamePath)?.time;
        if (fingerprint(fresh) === fingerprint(library) && manifestTime === seenManifestTime) return;
        log.appendLine("The library changed outside this window (an assistant or the command line); reloading.");
        reload();
      } catch (err) {
        log.appendLine(`Watch: ${String(err)}`);
      }
    }, 800);
  };
  for (const [dir, recursive] of [[libraryRoot, true], [gamePath, false]] as [string, boolean][]) {
    if (!dir || !fs.existsSync(dir)) continue;
    try {
      watchers.push(fs.watch(dir, { recursive }, onChange));
    } catch (err) {
      log.appendLine(`Cannot watch ${dir}: ${String(err)}`);
    }
  }
}

/** Once a day, when the bridge in use is the copy REDdeck fetched: is there a newer release? */
async function maybeCheckBridge(): Promise<void> {
  const ours = installedBridge(storageDir);
  if (!ours || bridgeExe !== ours) return;
  const last = globalState.get<number>("reddeck.lastBridgeCheck", 0);
  if (Date.now() - last < 24 * 3600 * 1000) return;
  await globalState.update("reddeck.lastBridgeCheck", Date.now());
  let release;
  try {
    release = await latestBridgeRelease();
  } catch (err) {
    log.appendLine(`REDbridge release check skipped: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const installedTag = path.basename(path.dirname(ours));
  if (compareVersions(release.version, installedTag.replace(/^v/, "")) <= 0) return;
  log.appendLine(`REDbridge ${release.version} is available (installed: ${installedTag})`);
  state.bridgeUpdate = release.version;
  void updatePage();
  void vscode.window.showInformationMessage(`REDbridge ${release.version} is available; you have ${installedTag.replace(/^v/, "")}.`, "Get it", "Not now").then((a) => {
    if (a === "Get it") void run(getBridgeCommand);
  });
}

/** Recomputes the plan and the status of every mod; cheap enough to run after every change. */
function refresh(): void {
  const { gamePath } = settings();
  if (library) {
    try {
      for (const m of syncProjects(library)) log.appendLine(`${m.name}: packed output changed, library copy refreshed (${m.files.length} files)`);
    } catch (err) {
      log.appendLine(`Project sync failed: ${String(err)}`);
    }
  }
  if (library && fs.existsSync(gamePath)) {
    try {
      state = { ...state, plan: plan(library, gamePath), changes: detectChanges(gamePath) };
    } catch (err) {
      log.appendLine(`Could not plan: ${String(err)}`);
      state = { ...state, plan: undefined, changes: [] };
    }
  } else {
    state = { ...state, plan: undefined, changes: [] };
  }
  seenManifestTime = readManifest(gamePath)?.time;
  void vscode.commands.executeCommand("setContext", "reddeck.empty", !library || library.mods.length === 0);
  void vscode.commands.executeCommand("setContext", "reddeck.deployed", !!readManifest(gamePath));
  updateProjectContext();
  updateStatus();
  view.refresh();
  updateDetail();
  updateConflicts();
  void updatePage();
  updateChanges();
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => void run(() => scanArchives(false)), 400);
}

/** REDdeck's own REDbridge process, started on first use. */
async function ensureBridge(): Promise<BridgeClient> {
  if (bridge?.running) return bridge;
  if (!bridgeExe) throw new Error("This needs REDbridge. Run REDdeck: Get REDbridge.");
  bridge = new BridgeClient(bridgeExe, settings().dotnetRoot);
  bridge.start();
  const info = await bridge.info();
  log.appendLine(`REDbridge ${info.version} (WolvenKit ${info.wolvenKit}) at ${bridgeExe}`);
  state.bridgeInfo = `REDbridge ${info.version} (WolvenKit ${info.wolvenKit})`;
  if (compareVersions(info.version, MinBridgeVersion) < 0) {
    bridge.stop();
    bridge = undefined;
    bridgeExe = "";
    throw new Error(`REDbridge ${info.version} is older than ${MinBridgeVersion}, which added archive.openMod. Run npm run update in the REDbridge folder.`);
  }
  return bridge;
}

/** The resources inside a mod archive, hash to game path, read through REDbridge and kept until the file changes. */
async function archiveResources(file: string): Promise<Map<string, string>> {
  const st = fs.statSync(file);
  const cached = archiveCache.get(file);
  if (cached && cached.mtimeMs === st.mtimeMs) return cached.resources;
  const r = await (await ensureBridge()).openMod(file);
  const resources = new Map(r.items.map((i) => [i.hash, i.name]));
  archiveCache.set(file, { mtimeMs: st.mtimeMs, resources });
  return resources;
}

/** Paths a deploy would add, replace or remove: a replaced path counts once. */
function pendingCount(): number {
  const p = state.plan;
  if (!p) return 0;
  return new Set([...p.add.map((d) => d.rel), ...p.stale.map((e) => e.path)].map((x) => x.toLowerCase())).size;
}

function statusFor(mod: ModInfo, withUpdate = true): string {
  if (!library || !state.plan) return "";
  const parts = [modStatus(library, settings().gamePath, mod, state.plan, readManifest(settings().gamePath), state.changes)];
  const up = withUpdate ? familyUpdate(library, mod) : undefined;
  if (up) parts.push(`update ${up} available`);
  const a = state.archive;
  if (a && mod.enabled) {
    const lost = a.lost.get(mod.id) ?? 0;
    const won = a.won.get(mod.id) ?? 0;
    if (lost) parts.push(`loses ${lost} archive file${lost === 1 ? "" : "s"}`);
    if (won) parts.push(`overrides ${won} archive file${won === 1 ? "" : "s"}`);
  }
  return parts.join(", ");
}

function updateStatus(): void {
  if (!library) {
    status.text = "$(package) REDdeck: no library";
    status.tooltip = "Set reddeck.libraryPath";
    return;
  }
  const p = state.plan;
  const pending = p ? p.add.length + p.stale.length : 0;
  const on = library.mods.filter((m) => m.enabled).length;
  const game = state.version ? `Cyberpunk 2077 ${state.version}` : "game not found";
  status.command = "reddeck.deploy";
  if (!isGameFolder(settings().gamePath)) {
    status.text = `$(package) REDdeck: game not found`;
    status.tooltip = "REDdeck looked in Steam's libraries, GOG and Epic. Click to pick the Cyberpunk 2077 folder.";
    status.command = "reddeck.pickGame";
  } else if (p?.vortex) {
    status.text = `$(package) ${on} of ${library.mods.length} mods on · Vortex manages the game`;
    status.tooltip = `${game}. Purge in Vortex, then deploy with REDdeck. Click to see.`;
  } else if (pending) {
    status.text = `$(package) ${on} of ${library.mods.length} mods on · Deploy (${pending} change${pending === 1 ? "" : "s"})`;
    status.tooltip = `${game}. Click to deploy.`;
  } else {
    status.text = `$(package) ${on} of ${library.mods.length} mods on · deployed`;
    status.tooltip = `${game}. Library: ${library.root}`;
  }
}

// ---- archive conflicts through REDbridge ------------------------------------------------------

async function scanArchives(explicit: boolean): Promise<void> {
  scanning = true;
  updateConflicts();
  if (!library) return;
  if (!bridgeExe) {
    state.archive = undefined;
    if (explicit) {
      void vscode.window.showInformationMessage("Conflicts inside archives need REDbridge, which REDdeck can fetch for you.", "Get REDbridge").then((a) => {
        if (a) void run(getBridgeCommand);
      });
    }
    return;
  }
  const wanted = enabledArchives(library);
  if (!wanted.length) {
    state.archive = findArchiveConflicts([]);
    view.refresh();
    updateDetail();
    return;
  }
  const listings: ArchiveListing[] = [];
  for (const { mod, archive } of wanted) {
    const file = sourcePath(library, mod, archive);
    if (!fs.existsSync(file)) continue;
    try {
      listings.push({ mod: mod.id, archive, resources: await archiveResources(file) });
    } catch (err) {
      log.appendLine(`Could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  state.archive = findArchiveConflicts(listings);
  scanning = false;
  const n = state.archive.conflicts.length;
  log.appendLine(`Archive scan: ${listings.length} archives, ${n} overlapping resource${n === 1 ? "" : "s"}`);
  view.refresh();
  updateDetail();
  updateConflicts();
  if (explicit && !conflictsPanel.open) void vscode.window.showInformationMessage(n ? `${n} resources overlap between enabled mods.` : "No resources overlap between the enabled mods' archives.", "Show conflicts").then((a) => {
    if (a) void showConflicts();
  });
}

// ---- details -----------------------------------------------------------------------------------

function detailData(mod: ModInfo) {
  return {
    mod,
    status: statusFor(mod),
    plan: state.plan,
    archive: state.archive,
    names: new Map((library?.mods ?? []).map((m) => [m.id, m.name])),
    bridge: bridgeExe,
    update: library ? familyUpdate(library, mod) : undefined,
    versions: library ? familyOf(library, mod).mods.map((m) => ({ id: m.id, version: m.version, enabled: m.enabled })) : [],
    size: library ? modSize(library, mod) : { total: 0, files: new Map<string, number>(), mtimes: new Map<string, number>() },
  };
}

function showDetails(mod: ModInfo | undefined): void {
  if (!mod) return;
  detail.show(detailData(mod));
}

// ---- the mods page -------------------------------------------------------------------------------

let modsPage: ModsPage;
/** The loadout the REDdeck page shows and edits; the active one unless the user picked another. */
let pageLoadout = "";

/** The loadout the page edits when it is not the active one, else undefined (edits go to the mods). */
function editedLoadout(): string | undefined {
  return library && pageLoadout && pageLoadout !== activeLoadout(library, state.version) ? pageLoadout : undefined;
}

function pageRow(fam: Family, manifestMods: Set<string>, viewed?: { mod: ModInfo; enabled: boolean }): PageRow {
  const p = state.plan;
  const mod = viewed?.mod ?? fam.active;
  return {
    id: mod.id,
    name: fam.name,
    version: mod.version,
    versions: fam.mods.map((m) => ({ id: m.id, version: m.version, active: m.id === mod.id })),
    kinds: mod.kinds,
    enabled: viewed ? viewed.enabled : mod.enabled,
    status: statusFor(mod, false),
    framework: mod.kinds.includes("framework"),
    deployed: manifestMods.has(mod.id),
    size: library ? modSize(library, mod).total : 0,
    needsDeploy: !!p && (p.add.some((d) => d.mod?.id === mod.id) || p.stale.some((e) => e.mod === mod.id)),
    changed: state.changes.some((c) => c.entry.mod === mod.id && c.kind === "changed"),
    conflicts: p ? p.conflicts.filter((c) => c.winner === mod.id || c.losers.includes(mod.id)).length : 0,
    update: fam.update?.version,
    nexusId: fam.nexusId,
  };
}

async function pageData() {
  const s = settings();
  const manifest = readManifest(s.gamePath);
  const manifestMods = new Set((manifest?.files ?? []).map((e) => e.mod));
  const when = manifest?.time ? new Date(manifest.time) : undefined;
  const active = library ? activeLoadout(library, state.version) : "";
  if (library && (!pageLoadout || !findLoadout(library.root, pageLoadout))) pageLoadout = active;
  const editing = library && pageLoadout !== active ? findLoadout(library.root, pageLoadout) : undefined;
  const viewed = library && editing ? loadoutState(library, readLoadout(editing.file)) : undefined;
  const sections = library ? sectionsOf(library).map((sec) => ({ name: sec.name, user: sec.user, rows: sec.families.map((f) => pageRow(f, manifestMods, viewed?.get(f.key))) })) : [];
  return {
    rows: sections.flatMap((sec) => sec.rows),
    sections,
    loadouts: library ? listLoadouts(library.root).map((l) => ({ name: l.name, on: l.on })) : [],
    activeLoadout: active,
    viewing: pageLoadout,
    collapsed: globalState.get<string[]>(FoldedKey, []),
    game: state.version ? `Cyberpunk 2077 ${state.version}` : "game not found",
    library: library?.root ?? s.libraryPath,
    method: state.plan?.method ?? ("link" as const),
    lastDeploy: when ? when.toLocaleString() : undefined,
    pending: pendingCount(),
    signedIn: await nexusSignedIn(),
    vortex: !!state.plan?.vortex,
    bridge: state.bridgeInfo ?? (bridgeExe ? "REDbridge found, starts on the next archive scan" : undefined),
    bridgeUpdate: state.bridgeUpdate,
    sizes: library ? librarySize(library) : { mods: 0, downloads: 0, backups: 0 },
    frameworks: frameworkNote(),
    setup: state.setup.map((s) => ({ id: s.id, label: s.label, detail: s.detail })),
  };
}

/** The Frameworks group's note on the page. */
function frameworkNote(): { summary: string; detail: string; warn: boolean } | undefined {
  const c = frameworkCheck();
  if (!c || !c.frameworks.length) return undefined;
  const summary = frameworkSummary(c);
  return summary ? { summary, detail: frameworkDetail(c).join("\n"), warn: c.changed || c.updates.length > 0 } : undefined;
}

async function showPage(): Promise<void> {
  modsPage.show(await pageData());
  void suggestTheme();
}

/** The house colour theme of the EDGE tools, from the REDcode repository. */
const HudThemeId = "edgemodders.rednode-hud-theme";
const HudThemeLabel = "REDnode HUD";
const ThemeSuggestedKey = "reddeck.themeSuggested";

/**
 * Once, the first time the REDdeck page opens under another theme: offers the REDnode HUD theme,
 * which REDdeck's pages are drawn for. Never asks again by itself, whatever the answer; the
 * reddeck.suggestTheme command asks on demand.
 */
async function suggestTheme(asked = false): Promise<void> {
  if (!asked && globalState.get<boolean>(ThemeSuggestedKey)) return;
  const workbench = vscode.workspace.getConfiguration("workbench");
  if (workbench.get<string>("colorTheme") === HudThemeLabel) {
    if (asked) void vscode.window.showInformationMessage("REDnode HUD is already your colour theme.");
    return;
  }
  await globalState.update(ThemeSuggestedKey, true);
  const installed = !!vscode.extensions.getExtension(HudThemeId);
  const use = installed ? "Use REDnode HUD" : "Install REDnode HUD";
  const a = await vscode.window.showInformationMessage("REDdeck is drawn for REDnode HUD, the colour theme of the EDGE modding tools. Try it? You can switch back any time with Preferences: Color Theme.", use, "No thanks");
  if (a !== use) return;
  if (!installed) {
    try {
      await vscode.commands.executeCommand("workbench.extensions.installExtension", HudThemeId);
    } catch (err) {
      log.appendLine(`Installing ${HudThemeId}: ${err instanceof Error ? err.message : String(err)}`);
      void vscode.window.showInformationMessage("REDnode HUD could not be installed: it may not be in the extension store yet. Run REDdeck: Suggest the HUD theme to try again later.");
      return;
    }
  }
  await workbench.update("colorTheme", HudThemeLabel, vscode.ConfigurationTarget.Global);
}

async function updatePage(): Promise<void> {
  if (modsPage?.open) modsPage.update(await pageData());
}

async function pageAction(m: PageMessage): Promise<void> {
  const mod = m.id ? library?.mods.find((x) => x.id === m.id) : undefined;
  switch (m.action) {
    case "add":
      return addModCommand();
    case "deploy":
      return deployCommand();
    case "undo":
      return undoCommand();
    case "updates":
      return checkUpdatesCommand(false);
    case "signIn":
      await nexusSignInCommand();
      return;
    case "conflicts":
      return showConflicts();
    case "library":
      if (library) void vscode.env.openExternal(vscode.Uri.file(library.root));
      return;
    case "changes":
      return showChanges(m.id);
    case "getBridge":
      return getBridgeCommand().then(() => refreshSetup());
    case "setup": {
      const step = state.setup.find((s) => s.id === m.id);
      if (step) await vscode.commands.executeCommand(step.command);
      return;
    }
    case "downloads":
      if (library) {
        fs.mkdirSync(downloadsFolder(library.root), { recursive: true });
        void vscode.env.openExternal(vscode.Uri.file(downloadsFolder(library.root)));
      }
      return;
    case "newSection":
      await newSectionCommand();
      return;
    case "renameSection":
      return renameSectionCommand(m.section);
    case "deleteSection":
      return deleteSectionCommand(m.section);
    case "moveSection":
      if (library && m.section && m.delta) {
        moveSection(library, m.section, m.delta);
        refresh();
      }
      return;
    case "sectionMoveMods":
      return sectionMoveModsCommand(m.section, m.ids ?? []);
    case "sectionRemoveMods":
      return sectionRemoveModsCommand(m.section, m.ids ?? []);
    case "fold": {
      // Kept for next time; the page has already folded it, so no re-render.
      const folded = new Set(globalState.get<string[]>(FoldedKey, []));
      if (m.section) {
        if (m.on) folded.add(m.section);
        else folded.delete(m.section);
        await globalState.update(FoldedKey, [...folded]);
      }
      return;
    }
    case "loadoutView":
      if (m.loadout) pageLoadout = m.loadout;
      return updatePage();
    case "loadoutNew":
      return newLoadoutCommand();
    case "loadoutRename":
      return renameLoadoutCommand(pageLoadout);
    case "loadoutDelete":
      return deleteLoadoutCommand(pageLoadout);
    case "loadoutActivate":
      return switchLoadout(pageLoadout);
    case "loadoutExport":
      return exportLoadoutCommand(pageLoadout);
    case "loadoutImport":
      return importLoadoutCommand();
    case "sectionOn":
      if (library && m.section && editedLoadout()) {
        const name = editedLoadout()!;
        for (const f of sectionsOf(library).find((sec) => sec.name === m.section)?.families ?? []) setInLoadout(library, name, f.active, { enabled: !!m.on });
        log.appendLine(`${name}: every mod in ${m.section} ${m.on ? "on" : "off"}`);
        return updatePage();
      }
      if (library && m.section) {
        const n = setSectionOn(library, m.section, !!m.on);
        log.appendLine(`${m.section}: every mod ${m.on ? "on" : "off"} (${n} changed)`);
        refresh();
      }
      return;
  }
  if (!mod || !library) return;
  const edited = editedLoadout();
  if (edited && (m.action === "toggle" || m.action === "activate")) {
    // Another loadout than the active one: only its file changes; the mods and the game do not.
    const now = loadoutState(library, readLoadout(findLoadout(library.root, edited)!.file)).get(familyKey(mod));
    if (m.action === "toggle") setInLoadout(library, edited, mod, { enabled: !now?.enabled });
    else setInLoadout(library, edited, mod, { version: mod });
    return updatePage();
  }
  switch (m.action) {
    case "toggle":
      mod.enabled = !mod.enabled;
      saveMod(library, mod);
      log.appendLine(`${mod.name}: ${mod.enabled ? "on" : "off"}`);
      refresh();
      break;
    case "details":
      showDetails(mod);
      break;
    case "activate":
      switchVersion(mod);
      break;
    case "moveUp":
      move(mod, -1);
      break;
    case "moveDown":
      move(mod, 1);
      break;
    case "open":
      void vscode.env.openExternal(vscode.Uri.file(modFolder(library, mod)));
      break;
    case "nexus":
      await nexusOpenCommand(mod);
      break;
    case "update":
      await updateModCommand(mod);
      break;
    case "remove":
      await removeCommand(mod);
      break;
    case "pickSection":
      await pickSectionCommand(mod);
      break;
    case "putIn":
      if (m.section) {
        putInSection(library, mod, m.section);
        refresh();
      }
      break;
    case "place": {
      const target = m.target ? library.mods.find((x) => x.id === m.target) : undefined;
      if (target) {
        placeNextTo(library, mod, target, !!m.below);
        log.appendLine(`${mod.name}: placed ${m.below ? "below" : "above"} ${target.name}`);
        refresh();
      }
      break;
    }
  }
}

// ---- sections ------------------------------------------------------------------------------------

/** Sections folded shut on the mods page, by name. */
const FoldedKey = "reddeck.foldedSections";

/** Asks for a new section's name; returns it once made. */
async function newSectionCommand(): Promise<string | undefined> {
  if (!library) return undefined;
  const lib = library;
  const name = await vscode.window.showInputBox({ title: "New section", prompt: "A group of your own for the mods list, shown between Frameworks and Mods", validateInput: (v) => sectionNameProblem(lib, v) });
  if (!name) return undefined;
  addSection(lib, name);
  refresh();
  return name.trim();
}

async function renameSectionCommand(from: string | undefined): Promise<void> {
  if (!library || !from) return;
  const lib = library;
  const to = await vscode.window.showInputBox({ title: `Rename ${from}`, value: from, validateInput: (v) => (v.trim() === from ? undefined : sectionNameProblem(lib, v, from)) });
  if (!to || to.trim() === from) return;
  renameSection(lib, from, to);
  const folded = globalState.get<string[]>(FoldedKey, []);
  if (folded.includes(from)) await globalState.update(FoldedKey, folded.map((n) => (n === from ? to.trim() : n)));
  refresh();
}

async function deleteSectionCommand(name: string | undefined): Promise<void> {
  if (!library || !name) return;
  const count = sectionsOf(library).find((sec) => sec.name === name)?.families.length ?? 0;
  if (count) {
    const a = await vscode.window.showWarningMessage(`Delete the section ${name}? Its ${count} mod${count === 1 ? "" : "s"} go back to Mods (or Frameworks). Nothing is removed from the library.`, { modal: true }, "Delete section");
    if (a !== "Delete section") return;
  }
  deleteSection(library, name);
  refresh();
}

/** The page's filter and search, in words, for a bulk question: "the 12 mods shown in Mods". */
function shownIn(section: string, shown: number): string {
  const total = library ? sectionsOf(library).find((sec) => sec.name === section)?.families.length ?? shown : shown;
  return shown === total ? `all ${shown} mod${shown === 1 ? "" : "s"} in ${section}` : `the ${shown} mod${shown === 1 ? "" : "s"} shown in ${section} (of ${total}; the search or filter hides the rest)`;
}

/** A section header's Put in section button: the mods it shows go to another section. */
async function sectionMoveModsCommand(from: string | undefined, ids: string[]): Promise<void> {
  if (!library || !from) return;
  const mods = ids.map((id) => library!.mods.find((x) => x.id === id)).filter((x): x is ModInfo => !!x);
  if (!mods.length) return;
  const New = "$(add) New section...";
  const names = sectionsOf(library).map((sec) => sec.name).filter((n) => n !== from);
  if (!names.includes("Frameworks") && from !== "Frameworks") names.unshift("Frameworks");
  const pick = await vscode.window.showQuickPick([...names.map((n) => ({ label: n })), { label: New }], { title: `Put ${shownIn(from, mods.length)} in which section?` });
  if (!pick) return;
  const to = pick.label === New ? await newSectionCommand() : pick.label;
  if (!to) return;
  for (const mod of mods) putInSection(library, mod, to);
  log.appendLine(`${mods.length} mod${mods.length === 1 ? "" : "s"} from ${from} put in ${to}`);
  refresh();
}

/** A section header's Remove button: the mods it shows leave the library, every version of each, after one question. */
async function sectionRemoveModsCommand(section: string | undefined, ids: string[]): Promise<void> {
  if (!library || !section) return;
  const rows = ids.map((id) => library!.mods.find((x) => x.id === id)).filter((x): x is ModInfo => !!x);
  if (!rows.length) return;
  const mods = [...new Map(rows.flatMap((r) => familyOf(library!, r).mods).map((m) => [m.id, m])).values()];
  const deployed = rows.filter((r) => familyOf(library!, r).mods.some((m) => m.enabled)).length;
  const detail = [
    rows.slice(0, 12).map((r) => r.name).join("\n") + (rows.length > 12 ? `\n...and ${rows.length - 12} more` : ""),
    mods.length > rows.length ? `\n\nEvery version of each is removed: ${mods.length} library entries.` : "",
    deployed ? `\n\n${deployed} of them ${deployed === 1 ? "is" : "are"} on; ${deployed === 1 ? "its" : "their"} files leave the game on the next deploy.` : "",
  ].join("");
  const a = await vscode.window.showWarningMessage(`Remove ${shownIn(section, rows.length)} from the library?`, { modal: true, detail }, `Remove ${rows.length}`);
  if (a !== `Remove ${rows.length}`) return;
  for (const m of mods) removeMod(library, m);
  log.appendLine(`Removed ${rows.length} mod${rows.length === 1 ? "" : "s"} (${mods.length} library entries) from ${section}: ${rows.map((r) => r.name).join(", ")}`);
  reload();
}

/** Quick pick of the sections, to put a mod in one; "New section..." makes one first. */
async function pickSectionCommand(mod: ModInfo | undefined): Promise<void> {
  if (!mod || !library) return;
  const fam = familyOf(library, mod);
  const current = sectionNameOf(library, fam);
  const New = "$(add) New section...";
  const names = sectionsOf(library).map((sec) => sec.name);
  if (!names.includes("Frameworks") && mod.kinds.includes("framework")) names.unshift("Frameworks");
  const pick = await vscode.window.showQuickPick(
    [...names.map((n) => ({ label: n, description: n === current ? "here now" : "" })), { label: New, description: "" }],
    { title: `${fam.name}: which section?`, placeHolder: "Sections only group the list; the order still decides who wins a conflict" },
  );
  if (!pick || pick.label === current) return;
  const name = pick.label === New ? await newSectionCommand() : pick.label;
  if (!name) return;
  putInSection(library, mod, name);
  log.appendLine(`${fam.name}: in section ${name}`);
  refresh();
}

/** Makes this version the one the mod's row stands for. */
function switchVersion(chosen: ModInfo): void {
  if (!library) return;
  const r = activateVersion(library, chosen);
  if (r.previous.id === chosen.id) return;
  log.appendLine(`${chosen.name}: version ${chosen.version} active (was ${r.previous.version})`);
  refresh();
  offerDeploy(`${chosen.name} ${chosen.version} is now the active version${r.on ? "" : " (still off)"}.`);
}

/** Quick pick of a mod's versions, from the Mods view. */
async function switchVersionCommand(mod: ModInfo | undefined): Promise<void> {
  if (!mod || !library) return;
  const fam = familyOf(library, mod);
  const items = [
    ...fam.mods.map((m) => ({ label: m.version || "(no version)", description: m.id === fam.active.id ? "active" : "", detail: `added ${m.added.slice(0, 10)}, ${m.files.length} files`, mod: m })),
    ...(fam.update ? [{ label: `$(cloud-download) Get ${fam.update.version} from Nexus`, description: "", detail: "Downloads it into the library and makes it active", mod: undefined }] : []),
  ];
  if (items.length === 1) {
    void vscode.window.showInformationMessage(`${fam.name} has one version in the library, ${fam.active.version || "unversioned"}.${fam.nexusId ? "" : " Versions are tracked for mods that come from Nexus."}`);
    return;
  }
  const pick = await vscode.window.showQuickPick(items, { title: `${fam.name}: which version?`, placeHolder: "The chosen version takes this mod's place; the others go off" });
  if (!pick) return;
  if (pick.mod) switchVersion(pick.mod);
  else await updateModCommand(fam.active);
}

// ---- the game folder -----------------------------------------------------------------------------

/** Asks for the game folder and keeps it in the user settings. */
async function pickGameCommand(): Promise<void> {
  const picked = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: "This is the Cyberpunk 2077 folder", title: "Pick the Cyberpunk 2077 install folder (it contains bin, archive and r6)" });
  if (!picked?.length) return;
  let folder = picked[0].fsPath;
  // Forgive picking bin or bin\x64.
  for (const up of [folder, path.dirname(folder), path.dirname(path.dirname(folder))]) {
    if (isGameFolder(up)) {
      folder = up;
      break;
    }
  }
  if (!isGameFolder(folder)) throw new Error(`${folder} does not contain bin\\x64\\Cyberpunk2077.exe.`);
  await vscode.workspace.getConfiguration("reddeck").update("gamePath", folder, vscode.ConfigurationTarget.Global);
  log.appendLine(`Game folder set to ${folder}`);
  reload();
}

// ---- REDbridge -----------------------------------------------------------------------------------

/**
 * Fetches the latest REDbridge release into REDdeck's storage folder, and the .NET 10 runtime
 * per user if the machine has none. One question, then it is done.
 */
async function getBridgeCommand(): Promise<void> {
  const release = await latestBridgeRelease();
  const already = installedBridge(storageDir);
  const have = already ? path.basename(path.dirname(already)).replace(/^v/, "") : undefined;
  if (already && already.includes(`${path.sep}${release.tag}${path.sep}`) && dotnet10Root()) {
    state.bridgeUpdate = undefined;
    void vscode.window.showInformationMessage(`REDbridge ${release.version} is installed and is the latest.`);
    return;
  }
  const needRuntime = !dotnet10Root();
  const mb = Math.round(release.size / 1048576);
  const detail = `REDbridge ${release.version} (${mb} MB) downloads from ${release.page} into REDdeck's own folder.${have ? ` The ${have} you have is removed afterwards.` : ""}${needRuntime ? " The .NET 10 runtime is not installed, so Microsoft's installer puts it in your user profile too (about 70 MB, no admin rights)." : ""} Nothing outside those folders changes.`;
  const a = await vscode.window.showInformationMessage(have ? `Update REDbridge ${have} to ${release.version}?` : `Get REDbridge ${release.version}?`, { modal: true, detail }, have ? "Update" : "Get it");
  if (!a) return;
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Getting REDbridge", cancellable: false }, async (progress) => {
    if (needRuntime) {
      progress.report({ message: "installing the .NET 10 runtime" });
      await installDotnetRuntime((l) => log.appendLine(l));
    }
    let last = 0;
    const exe = await installBridge(release, storageDir, sevenZa, (r, t) => {
      const pct = t ? Math.floor((r / t) * 100) : 0;
      progress.report({ increment: pct - last, message: `downloading ${Math.round(r / 1048576)} of ${mb} MB` });
      last = pct;
    }, (l) => log.appendLine(l));
    bridgeExe = exe;
    bridge?.stop();
    bridge = undefined;
    const gone = removeOlderBridges(storageDir, release.tag);
    if (gone.length) log.appendLine(`Removed the older REDbridge ${gone.join(", ")}`);
  });
  state.bridgeUpdate = undefined;
  state.bridgeInfo = undefined;
  state.archive = undefined;
  refresh();
  void vscode.window.showInformationMessage(`REDbridge ${release.version} is ready. Conflicts inside archives show up on the next scan.`, "Show conflicts").then((x) => {
    if (x) void run(showConflicts);
  });
  await scanArchives(false);
}

// ---- pending changes -----------------------------------------------------------------------------

let changesPanel: ChangesPanel;

function nameOf(id: string): string {
  if (id === "reddeck") return "REDdeck";
  return library?.mods.find((m) => m.id === id)?.name ?? id;
}

function changesData(filterMod?: string) {
  const rows: (PendingChange & { modName: string; prevName?: string })[] = library && state.plan ? pendingChanges(library, settings().gamePath, state.plan).map((c) => ({ ...c, modName: nameOf(c.mod), prevName: c.prevMod ? nameOf(c.prevMod) : undefined })) : [];
  return { rows, filterMod, method: state.plan?.method ?? ("link" as const) };
}

/** The full panel; with a mod id, a quick pick of that mod's changes first. */
async function showChanges(modId?: string): Promise<void> {
  if (!modId) {
    changesPanel.show(changesData());
    return;
  }
  const all = changesData().rows;
  const mine = all.filter((r) => r.mod === modId || r.prevMod === modId);
  const name = nameOf(modId);
  const label: Record<PendingChange["kind"], string> = { add: "$(add) add", replace: "$(arrow-swap) replace", restore: "$(history) put back", relink: "$(link) relink", remove: "$(trash) remove" };
  const items = [
    ...mine.map((r) => ({ label: `${label[r.kind]}  ${r.path}`, description: r.prevName ? `${r.detail} ${r.prevName}` : r.detail, action: "" })),
    { label: "", kind: vscode.QuickPickItemKind.Separator, action: "" },
    ...(all.length ? [{ label: "$(rocket) Deploy now", description: `${all.length} change${all.length === 1 ? "" : "s"} in all`, action: "deploy" }] : []),
    { label: "$(list-unordered) See all pending changes", description: "opens the Pending changes panel", action: "panel" },
  ];
  const pick = await vscode.window.showQuickPick(items, { title: mine.length ? `${name}: ${mine.length} change${mine.length === 1 ? "" : "s"} on the next deploy` : `${name}: nothing to change on the next deploy`, placeHolder: "What the next deploy does for this mod" });
  if (pick?.action === "deploy") await deployCommand();
  else if (pick?.action === "panel") changesPanel.show(changesData(modId));
}

function updateChanges(): void {
  if (changesPanel?.open) changesPanel.update(changesData());
}

async function changesAction(m: ChangesMessage): Promise<void> {
  if (m.action === "deploy") return deployCommand();
  if (m.action === "details") showDetails(library?.mods.find((x) => x.id === m.id));
}

// ---- conflicts panel ---------------------------------------------------------------------------

let conflictsPanel: ConflictsPanel;
let scanning = false;

/** What the last choice on the conflicts page did, shown on it until the next one. */
let conflictsNote: string | undefined;

function conflictsData() {
  return {
    fileConflicts: state.plan?.conflicts ?? [],
    archive: state.archive,
    names: new Map((library?.mods ?? []).map((m) => [m.id, m.name])),
    family: new Map((library?.mods ?? []).map((m) => [m.id, familyKey(m)])),
    versions: new Map((library?.mods ?? []).map((m) => [m.id, m.version])),
    note: conflictsNote,
    bridge: !!bridgeExe,
    bridgeInfo: state.bridgeInfo,
    scanning,
    pending: pendingCount(),
  };
}

/** Opens the conflicts panel and runs the archive scan so its second half fills in. */
async function showConflicts(): Promise<void> {
  conflictsPanel.show(conflictsData());
  if (!state.archive && bridgeExe) await scanArchives(true);
}

function updateConflicts(): void {
  if (conflictsPanel?.open) conflictsPanel.update(conflictsData());
}

/** A toast after a resolve, with the deploy one press away. */
function offerDeploy(text: string): void {
  void vscode.window.showInformationMessage(`${text} Deploy to make it real.`, "Deploy now").then((a) => {
    if (a) void run(deployCommand);
  });
}

async function conflictsAction(m: ConflictsMessage): Promise<void> {
  if (!library) return;
  if (m.action === "deploy") return deployCommand();
  if (m.action === "getBridge") return getBridgeCommand();
  const mod = library.mods.find((x) => x.id === m.id);
  if (!mod) return;
  switch (m.action) {
    case "letWin": {
      const over = library.mods.find((x) => x.id === m.over);
      if (!over) return;
      placeAbove(library, mod, over);
      log.appendLine(`${mod.name} placed above ${over.name}`);
      conflictsNote = `${mod.name} now wins over ${over.name}, for every file they share. Deploy to make it real.`;
      refresh();
      offerDeploy(`${mod.name} now wins over ${over.name}.`);
      break;
    }
    case "toggle":
      mod.enabled = !mod.enabled;
      saveMod(library, mod);
      log.appendLine(`${mod.name}: ${mod.enabled ? "on" : "off"}`);
      conflictsNote = `${mod.name} is ${mod.enabled ? "on" : "off"} now. Deploy to make it real.`;
      refresh();
      offerDeploy(`${mod.name} is ${mod.enabled ? "on" : "off"}.`);
      break;
    case "useOnly": {
      // Two versions of one mod were on: keep this one and turn the rest off.
      for (const m of familyOf(library, mod).mods) {
        if (m.id !== mod.id && m.enabled) {
          m.enabled = false;
          saveMod(library, m);
        }
      }
      if (!mod.enabled) {
        mod.enabled = true;
        saveMod(library, mod);
      }
      log.appendLine(`${mod.name} ${mod.version}: the only version on`);
      conflictsNote = `${mod.name} ${mod.version} is the only version on now. Deploy to make it real.`;
      refresh();
      offerDeploy(`${mod.name} ${mod.version} is the only version on.`);
      break;
    }
    case "details":
      showDetails(mod);
      break;
  }
}

function updateDetail(): void {
  const id = detail.modId;
  const mod = id ? library?.mods.find((m) => m.id === id) : undefined;
  if (mod) detail.update(detailData(mod));
}

async function detailAction(action: string, id: string): Promise<void> {
  const mod = library?.mods.find((m) => m.id === id);
  if (!mod || !library) return;
  switch (action) {
    case "toggle":
      mod.enabled = !mod.enabled;
      saveMod(library, mod);
      log.appendLine(`${mod.name}: ${mod.enabled ? "on" : "off"}`);
      refresh();
      break;
    case "moveUp":
      move(mod, -1);
      break;
    case "moveDown":
      move(mod, 1);
      break;
    case "open":
      void vscode.env.openExternal(vscode.Uri.file(modFolder(library, mod)));
      break;
    case "remove":
      await removeCommand(mod);
      break;
    case "nexus":
      await nexusOpenCommand(mod);
      break;
    case "update":
      await updateModCommand(mod);
      break;
  }
}

// ---- the verbs ---------------------------------------------------------------------------------

async function addModCommand(): Promise<void> {
  if (!library) return;
  const choice = await vscode.window.showQuickPick(
    [
      { label: "$(file-zip) A file", detail: "A zip, 7z or rar from Nexus Mods, or a single mod file such as an .archive or .reds", source: "file" as const },
      { label: "$(folder) A folder", detail: "A folder laid out like the game folder, or a loose set of mod files", source: "folder" as const },
      { label: "$(cloud-download) Import from Vortex", detail: "Copy the mods Vortex has for Cyberpunk 2077 into the library", source: "vortex" as const },
      { label: "$(tools) A REDcode or WolvenKit project", detail: "The packed output of a .cpmodproj; re-synced every time you pack again", source: "project" as const },
    ],
    { placeHolder: "Add a mod from" },
  );
  if (!choice) return;
  if (choice.source === "vortex") return importVortexCommand();
  if (choice.source === "project") return addProjectCommand(undefined);
  const picked = await vscode.window.showOpenDialog(
    choice.source === "file"
      ? { canSelectFiles: true, canSelectMany: true, openLabel: "Add", filters: { "Mods": ["zip", "7z", "rar", "archive", "xl", "reds", "lua", "yaml", "yml", "tweak", "dll", "asi"], "All files": ["*"] }, title: "Add mod" }
      : { canSelectFolders: true, canSelectMany: false, openLabel: "Add this folder", title: "Add mod from a folder" },
  );
  if (!picked?.length) return;
  for (const uri of picked) await addFrom(uri.fsPath);
}

/** Adds one file or folder: extract if needed, classify, ask about options, copy into the library. */
async function addFrom(source: string, preset?: { name: string; version: string; source: ModSource }): Promise<void> {
  if (!library) return;
  const isFile = fs.statSync(source).isFile();
  let name = preset?.name ?? cleanName(path.basename(source, isFile ? path.extname(source) : ""));

  let folder = source;
  let temp: string | undefined;
  try {
    if (isFile) {
      temp = fs.mkdtempSync(path.join(os.tmpdir(), "reddeck-"));
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Opening ${path.basename(source)}` }, () => unpackOrCopy(source, temp!, sevenZa));
      folder = temp;
    }
    let c = classify(folder, name.trim());
    if (c.options) {
      const pick = await vscode.window.showQuickPick(
        c.options.map((o) => ({ label: o.label, folder: o.folder })),
        { placeHolder: `${name} comes with a choice. Which one?`, title: "Choose an option" },
      );
      if (!pick) return;
      c = classify(pick.folder, name.trim());
    }
    if (!c.placements.length) {
      throw new Error(`Nothing in ${path.basename(source)} looks like a Cyberpunk mod file.${c.unplaced.length ? ` Unplaced: ${c.unplaced.slice(0, 5).join(", ")}` : ""}`);
    }
    // A REDnode package names itself and says its version in its manifest; that beats the file name.
    const manifest = rednodeManifest(c.placements);
    if (!preset) {
      const typed = await vscode.window.showInputBox({ prompt: "Name for this mod", value: manifest?.name ?? name, validateInput: (v) => (v.trim() ? undefined : "A name is needed") });
      if (!typed) return;
      name = typed;
    }
    const sourceInfo: ModSource = preset?.source ?? (isFile ? { type: "file", path: keepDownload(library, source) } : { type: "folder", path: source });
    const mod = addMod(library, c.placements, { name: name.trim(), version: preset?.version ?? manifest?.version ?? versionFrom(path.basename(source)), source: sourceInfo });
    log.appendLine(`Added ${mod.name} (${mod.files.length} files, ${mod.kinds.join(", ")}) from ${source}`);
    const settled = settleNewVersion(library, mod);
    if (settled.replaced) {
      log.appendLine(`  a new version of ${settled.replaced.name}: takes the place of ${settled.replaced.version || "the earlier one"}, which is off now`);
      void vscode.window.showInformationMessage(`${mod.name} ${mod.version} is a new version of ${settled.replaced.name} ${settled.replaced.version}. It takes its place${mod.enabled ? " and is on" : ""}; ${settled.replaced.version || "the earlier one"} stays in the library, off. Pick it from the version list to go back.`);
    } else if (settled.older) {
      void vscode.window.showInformationMessage(`${mod.name} ${mod.version} is older than ${settled.older.version}, so it was added switched off. Pick it from the version list to use it.`);
    }
    if (c.unplaced.length) {
      log.appendLine(`  not placed: ${c.unplaced.join(", ")}`);
      void vscode.window.showWarningMessage(`${mod.name} added. ${c.unplaced.length} file${c.unplaced.length === 1 ? "" : "s"} REDdeck did not know where to put ${c.unplaced.length === 1 ? "was" : "were"} left out. See the log.`);
    }
    refresh();
  } finally {
    if (temp) fs.rmSync(temp, { recursive: true, force: true });
  }
}

/** "Codeware-7780-1-20-3-1777845006" and "CET 1.37.1 - Scripting fixes-107-1-37-1-1759193708" are Nexus names. */
function cleanName(base: string): string {
  const m = /^(.*?)-(\d+)-([\d-]+)-(\d{10})$/.exec(base);
  return (m ? m[1] : base).replace(/[_]+/g, " ").trim();
}

function versionFrom(base: string): string {
  const m = /^(.*?)-(\d+)-([\d-]+)-(\d{10})/.exec(base);
  if (m) return m[3].replace(/-/g, ".");
  const v = /\b(v?\d+(?:\.\d+)+)\b/i.exec(base);
  return v ? v[1].replace(/^v/i, "") : "";
}

/**
 * Reveal in Game Folder: where a mod, folder or file sits in the game, in File Explorer. A file is
 * selected in its folder; a folder opens; a mod opens the deepest folder all its files share, or
 * selects its only file. Says so when nothing of it is in the game yet.
 */
async function revealInGameCommand(node: ModNode): Promise<void> {
  const mod = modOf(node);
  if (!mod) return;
  const { gamePath } = settings();
  if (!isGameFolder(gamePath)) throw new Error("REDdeck does not know the game folder yet. Use REDdeck: Pick the game folder... first.");
  const inGame = (rel: string) => path.join(gamePath, ...rel.split("/").filter(Boolean));
  const notThere = (what: string) => vscode.window.showInformationMessage(`${what} is not in the game folder${mod.enabled ? " yet; deploy to put it there" : ": the mod is off"}.`);
  if (node.type === "file") {
    const target = inGame(node.file);
    if (!fs.existsSync(target)) return void notThere(path.basename(node.file));
    await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(target));
    return;
  }
  if (node.type === "folder") {
    const target = inGame(node.label);
    if (!node.files.some((f) => fs.existsSync(inGame(f)))) return void notThere(node.label || "This folder");
    await vscode.env.openExternal(vscode.Uri.file(target));
    return;
  }
  const deployed = mod.files.filter((f) => fs.existsSync(inGame(f)));
  if (deployed.length === 0) return void notThere(mod.name);
  if (deployed.length === 1) {
    await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(inGame(deployed[0])));
    return;
  }
  // The deepest folder every deployed file shares; the game folder itself when they spread out.
  const split = deployed.map((f) => f.split("/").slice(0, -1));
  const common: string[] = [];
  for (let i = 0; split.every((parts) => i < parts.length && parts[i].toLowerCase() === split[0][i].toLowerCase()); i++) common.push(split[0][i]);
  await vscode.env.openExternal(vscode.Uri.file(inGame(common.join("/"))));
}

/** Adds a project's packed output as a mod that follows the project. */
async function addProjectCommand(target: string | undefined): Promise<void> {
  if (!library) return;
  let projectFile = target ? findProjectFile(target) : undefined;
  if (!projectFile) {
    const picked = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, openLabel: "Add project", filters: { "WolvenKit project": ["cpmodproj"] }, title: "Add a REDcode or WolvenKit project" });
    if (!picked?.length) return;
    projectFile = picked[0].fsPath;
  }
  const existing = library.mods.find((m) => m.source.type === "project" && m.source.path?.toLowerCase() === projectFile!.toLowerCase());
  if (existing) {
    void vscode.window.showInformationMessage(`${existing.name} already follows this project. Pack the project again and REDdeck picks up the new files.`);
    return;
  }
  const c = classifyProject(projectFile);
  if (!c.placements.length) throw new Error(`${projectName(projectFile)} has no packed output yet. Pack the project in REDcode or WolvenKit first (packed/ next to the project file).`);
  const mod = addMod(library, c.placements, { name: projectName(projectFile), version: "dev", source: { type: "project", path: projectFile } });
  log.appendLine(`Added ${mod.name} from project ${projectFile} (${mod.files.length} files, ${mod.kinds.join(", ")})`);
  refresh();
  void vscode.window.showInformationMessage(`${mod.name} added from its project. Deploy to test it; after every pack, deploy again.`);
}

/** Save as new loadout: a copy of the mods' on/off state now, under a new name. The active loadout stays active. */
async function saveLoadoutCommand(): Promise<void> {
  if (!library) return;
  const lib = library;
  const name = await vscode.window.showInputBox({ title: "Save as new loadout", prompt: "A new loadout with the mods on and off as they are now. The active loadout stays active.", validateInput: (v) => loadoutNameProblem(lib.root, v) });
  if (!name?.trim()) return;
  const file = saveLoadout(lib, name.trim(), state.version);
  log.appendLine(`Loadout saved: ${file}`);
  void updatePage();
  void vscode.window.showInformationMessage(`Loadout "${name.trim()}" saved. Switch to it from the Mods view's title bar or the REDdeck page.`);
}

/** + New loadout on the page: empty, or a copy of the one the page shows. The page then shows the new one. */
async function newLoadoutCommand(): Promise<void> {
  if (!library) return;
  const lib = library;
  const from = pageLoadout || activeLoadout(lib, state.version);
  const how = await vscode.window.showQuickPick(
    [
      { label: `A copy of ${from}`, copy: true },
      { label: "Every mod off", copy: false },
    ],
    { title: "New loadout", placeHolder: "Start from" },
  );
  if (!how) return;
  const name = await vscode.window.showInputBox({ title: "New loadout", prompt: "Its name", validateInput: (v) => loadoutNameProblem(lib.root, v) });
  if (!name?.trim()) return;
  if (how.copy && from === activeLoadout(lib, state.version)) syncActiveLoadout(lib, state.version);
  newLoadout(lib, name, how.copy ? from : undefined);
  pageLoadout = name.trim();
  log.appendLine(`Loadout ${name.trim()} made${how.copy ? ` from ${from}` : ", every mod off"}`);
  await updatePage();
}

async function renameLoadoutCommand(from: string): Promise<void> {
  if (!library || !from) return;
  const lib = library;
  const to = await vscode.window.showInputBox({ title: `Rename ${from}`, value: from, validateInput: (v) => (v.trim() === from ? undefined : loadoutNameProblem(lib.root, v, from)) });
  if (!to?.trim() || to.trim() === from) return;
  renameLoadout(lib, from, to);
  if (pageLoadout === from) pageLoadout = to.trim();
  refresh();
}

async function deleteLoadoutCommand(name: string): Promise<void> {
  if (!library || !name) return;
  if (name === activeLoadout(library, state.version)) {
    void vscode.window.showInformationMessage(`${name} is the active loadout. Make another one active first.`);
    return;
  }
  const a = await vscode.window.showWarningMessage(`Delete the loadout ${name}? The mods stay in the library; only this list of which are on goes.`, { modal: true }, "Delete loadout");
  if (a !== "Delete loadout") return;
  deleteLoadout(library, name);
  pageLoadout = activeLoadout(library, state.version);
  await updatePage();
}

async function exportLoadoutCommand(name: string): Promise<void> {
  if (!library || !name) return;
  const dest = await vscode.window.showSaveDialog({ title: `Export ${name}`, defaultUri: vscode.Uri.file(path.join(os.homedir(), `${name}.json`)), filters: { Loadout: ["json"] } });
  if (!dest) return;
  exportLoadout(library, name, dest.fsPath, state.version);
  void vscode.window.showInformationMessage(`${name} exported to ${dest.fsPath}.`);
}

async function importLoadoutCommand(): Promise<void> {
  if (!library) return;
  const picked = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectMany: false, filters: { Loadout: ["json"] }, openLabel: "Import", title: "Import a loadout" });
  if (!picked?.length) return;
  const name = importLoadout(library, picked[0].fsPath);
  pageLoadout = name;
  log.appendLine(`Loadout imported as ${name} from ${picked[0].fsPath}`);
  await updatePage();
  void vscode.window.showInformationMessage(`Imported as the loadout ${name}. It is not active; the REDdeck page shows it.`);
}

/** Makes a loadout the active one and offers to deploy it. */
async function switchLoadout(name: string): Promise<void> {
  if (!library || !name) return;
  if (name === activeLoadout(library, state.version)) return;
  const r = makeActive(library, name, state.version);
  pageLoadout = name;
  log.appendLine(`Loadout ${name} active: ${r.on} on, ${r.off} off${r.missing.length ? `, not in the library: ${r.missing.join(", ")}` : ""}`);
  refresh();
  offerDeploy(`Loadout ${name} is active: ${r.on} mod${r.on === 1 ? "" : "s"} on.${r.missing.length ? ` ${r.missing.length} of its mods are not in the library.` : ""}`);
}

/** Switch loadout... from the Mods view's title bar: pick one to make active, or import one. */
async function loadLoadoutCommand(): Promise<void> {
  if (!library) return;
  const active = activeLoadout(library, state.version);
  const items = [
    ...listLoadouts(library.root).map((l) => ({ label: l.name, description: `${l.on} on${l.name === active ? " · active" : ""}`, name: l.name })),
    { label: "$(add) Save as new loadout...", description: "", name: "\u0000new" },
    { label: "$(folder-opened) Import a loadout file...", description: "", name: "\u0000import" },
  ];
  const pick = await vscode.window.showQuickPick(items, { title: `Switch loadout (active: ${active})`, placeHolder: "The one you pick goes into the mods' on/off state; deploy afterwards. Each loadout keeps its own choices." });
  if (!pick) return;
  if (pick.name === "\u0000new") return saveLoadoutCommand();
  if (pick.name === "\u0000import") return importLoadoutCommand();
  await switchLoadout(pick.name);
}

/** More mods than this in one Vortex import asks first. */
const VortexConfirmOver = 20;

async function importVortexCommand(): Promise<void> {
  if (!library) return;
  let mods = listVortexMods(settings().gamePath, settings().vortexStaging || undefined);
  if (!mods.length) {
    // Vortex may keep its mods anywhere (Settings > Mods > Mod Staging Folder); ask once and remember.
    const checked = vortexStagingCandidates(settings().gamePath, settings().vortexStaging || undefined);
    log.appendLine(`Vortex mods: none found in\n  ${checked.join("\n  ")}`);
    const a = await vscode.window.showInformationMessage(
      "No Vortex mods for Cyberpunk 2077 were found in the usual places. Where does Vortex keep them? Vortex shows the folder under Settings > Mods > Mod Staging Folder.",
      "Pick the folder",
    );
    if (a !== "Pick the folder") return;
    const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, openLabel: "Use this folder", title: "Vortex's mod staging folder for Cyberpunk 2077" });
    if (!picked?.length) return;
    const folder = picked[0].fsPath;
    mods = listVortexMods(settings().gamePath, folder);
    if (!mods.length) {
      void vscode.window.showWarningMessage(`${folder} holds no Vortex mods. Pick the folder that has one folder per mod, often ending in cyberpunk2077.`);
      return;
    }
    await vscode.workspace.getConfiguration("reddeck").update("vortexStagingPath", folder, vscode.ConfigurationTarget.Global);
    log.appendLine(`Vortex staging folder set to ${folder}`);
  }
  // Mods already imported are left out; nothing starts ticked, so a search and a tick import just that one.
  const imported = new Set(library.mods.filter((m) => m.source.type === "vortex").map((m) => m.source.path));
  const fresh = mods.filter((m) => !imported.has(m.folder));
  if (!fresh.length) {
    void vscode.window.showInformationMessage(`Every one of Vortex's ${mods.length} mods is already in the library.`);
    return;
  }
  const already = mods.length - fresh.length;
  const picked = await vscode.window.showQuickPick(
    // The search reads the name, the version and the detail line, which holds the download's own name and the Nexus id.
    fresh.map((m) => {
      const shown = vortexDisplayName(m);
      const facts = [shown !== m.name ? m.name : "", m.modId ? `Nexus ${m.modId}` : "", `${m.files} files`, m.deployed ? "deployed by Vortex (will be on)" : "will be off"].filter(Boolean);
      return { label: shown, description: m.version, detail: facts.join(" · "), mod: m };
    }),
    {
      canPickMany: true,
      matchOnDescription: true,
      matchOnDetail: true,
      title: "Import from Vortex",
      placeHolder: `Tick the mods to import (the box at the top ticks all). Vortex is not changed.${already ? ` ${already} already imported, not listed.` : ""}`,
    },
  );
  if (!picked?.length) return;
  // A big import is usually a slip (ticks hidden by the search): ask before copying that many.
  if (picked.length > VortexConfirmOver) {
    const go = `Import ${picked.length}`;
    const a = await vscode.window.showWarningMessage(
      `Import ${picked.length} mods from Vortex?`,
      { modal: true, detail: `${picked.slice(0, 10).map((p) => p.mod.name).join("\n")}${picked.length > 10 ? `\n...and ${picked.length - 10} more` : ""}\n\nTicks stay on mods a search hides; if you meant fewer, choose Cancel and pick again.` },
      go,
    );
    if (a !== go) return;
  }
  const added: ModInfo[] = [];
  const skipped: { name: string; reason: string }[] = [];
  let stopped = false;
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Importing from Vortex", cancellable: true }, async (progress, token) => {
    for (const [i, p] of picked.entries()) {
      if (token.isCancellationRequested) {
        stopped = true;
        break;
      }
      progress.report({ message: `${i + 1} of ${picked.length}: ${p.mod.name}`, increment: 100 / picked.length });
      // Let the toast draw before the copy, which blocks while it runs.
      await new Promise((r) => setTimeout(r, 15));
      const r = importFromVortex(library!, [p.mod]);
      added.push(...r.added);
      skipped.push(...r.skipped);
    }
  });
  for (const s of skipped) log.appendLine(`Skipped ${s.name}: ${s.reason}`);
  for (const m of added) log.appendLine(`Imported ${m.name} ${m.version} (${m.files.length} files, ${m.kinds.join(", ")})`);
  refresh();
  const note = skipped.length ? ` ${skipped.length} skipped, see the log.` : "";
  void vscode.window.showInformationMessage(`Imported ${added.length} mod${added.length === 1 ? "" : "s"} from Vortex${stopped ? ` before you stopped it (${picked.length - added.length - skipped.length} not imported)` : ""}.${note}`);
}

async function deployCommand(): Promise<void> {
  await deployNow();
}

/** REDdeck: Deploy, for the command and the API: asks about changed files, deploys, reports. Undefined when refused or cancelled. */
/**
 * Before anything changes the game folder: the running game keeps mod files open, and Windows then
 * refuses to replace or delete them partway through. Returns false when the user leaves it for now.
 */
async function gameClosed(what: string): Promise<boolean> {
  while (gameRunning()) {
    const a = await vscode.window.showWarningMessage(`Cyberpunk 2077 is running. It keeps mod files open, so ${what} would fail partway. Quit the game first.`, { modal: true }, "The game is closed now");
    if (a !== "The game is closed now") return false;
  }
  return true;
}

/** A file Windows would not let go of (in use): said plainly, with what to do. Other errors pass through. */
function lockedFileError(err: unknown): Error {
  const e = err as NodeJS.ErrnoException;
  if (e?.code !== "EPERM" && e?.code !== "EBUSY" && e?.code !== "EACCES") return err as Error;
  const file = (e.path ?? "").replace(/^\\\\\?\\/, "");
  return new Error(`${file ? path.basename(file) : "A file"} in the game folder is in use, so Windows would not change it. Close the game (or the program that has it open) and deploy again. What this deploy finished is kept; the rest is still waiting.${file ? ` (${file})` : ""}`);
}

async function deployNow(): Promise<DeployResult | undefined> {
  if (!library) return;
  const { gamePath } = settings();
  if (!(await gameClosed("deploying"))) return;
  if (vortexManages(gamePath)) {
    const a = await vscode.window.showWarningMessage(
      "Vortex manages this game folder, and two managers cannot share one. In Vortex, choose Mods > Purge, then deploy here. Until then REDdeck only reads.",
      "Import from Vortex",
    );
    if (a) await importVortexCommand();
    return;
  }
  // Two versions of one mod on would fight over every file; libraries from before 0.21.1 can have that.
  for (const fam of familiesWithTwoOn(library)) {
    const on = fam.mods.filter((m) => m.enabled);
    const keep = on[0]; // families list newest first
    const others = on.slice(1).map((m) => m.version || m.name).join(", ");
    const a = await vscode.window.showWarningMessage(
      `${on.length} versions of ${fam.name} are on (${on.map((m) => m.version || m.name).join(", ")}). They would overwrite each other. Keep ${keep.version || "the newest"} and turn ${others} off?`,
      { modal: true },
      `Keep ${keep.version || "the newest"}`,
    );
    if (!a) return;
    for (const m of on.slice(1)) {
      m.enabled = false;
      saveMod(library, m);
    }
    log.appendLine(`${fam.name}: kept ${keep.version}, turned off ${others}`);
    refresh();
  }
  const decisions = new Map<string, Decision>();
  for (const c of detectChanges(gamePath).filter((c) => c.kind === "changed")) {
    const mod = library.mods.find((m) => m.id === c.entry.mod)?.name ?? c.entry.mod;
    const a = await vscode.window.showWarningMessage(
      `${c.entry.path} changed in the game folder since REDdeck deployed it from ${mod}. Keep the changed file, or put the mod's file back?`,
      { modal: true },
      "Keep the changed file",
      "Put the mod's file back",
    );
    if (a === "Keep the changed file") decisions.set(c.entry.path, "keep");
    else if (a === "Put the mod's file back") decisions.set(c.entry.path, "restore");
    else return;
  }
  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Deploying", cancellable: false }, async (progress) => {
    let last = 0;
    try {
      return deploy(
      library!,
      gamePath,
      decisions,
      (done, total) => {
        const pct = Math.floor((done / total) * 100);
        progress.report({ increment: pct - last, message: `${done} of ${total}` });
        last = pct;
      },
      state.version,
    );
    } catch (err) {
      refresh();
      throw lockedFileError(err);
    }
  });
  log.appendLine(`Deployed (${result.method}): ${result.linked} added, ${result.removed} removed, ${result.kept} unchanged, ${result.backedUp} backed up${result.skipped.length ? `, skipped ${result.skipped.join(", ")}` : ""}`);
  let redmodNote = "";
  if (enabledRedmodPackages(library).length) {
    const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Preparing REDmod mods" }, () => deployRedmod(library!, gamePath, (l) => log.appendLine(l)));
    redmodNote = r.ran ? ` ${r.packages.length} REDmod mod${r.packages.length === 1 ? "" : "s"} prepared; launch the game with -modded.` : ` REDmod mods not prepared: ${r.output}.`;
  }
  let report: string | undefined;
  try {
    report = writeDeployReport(library, gamePath, result);
    log.appendLine(`Deploy report: ${report}`);
  } catch (err) {
    log.appendLine(`Deploy report not written: ${err instanceof Error ? err.message : String(err)}`);
  }
  refresh();
  const n = state.plan?.conflicts.length ?? 0;
  const conflictNote = n ? ` ${n} conflict${n === 1 ? "" : "s"}, resolved by order.` : "";
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  const touched = modsTouched(result).length;
  const gone = modsRemoved(result).length;
  const what = result.changes.length
    ? [result.linked ? `${plural(result.linked, "file")} for ${plural(touched, "mod")}` : "", result.removed ? `${plural(result.removed, "file")} removed${gone ? ` for ${plural(gone, "mod")}` : ""}` : ""].filter(Boolean).join(", ")
    : "nothing changed";
  const buttons = [...(report ? ["View"] : []), ...(n ? ["Show conflicts"] : [])];
  void vscode.window.showInformationMessage(`Deployed: ${what}. ${plural(result.modsInGame, "mod")} in the game now.${conflictNote}${redmodNote}`, ...buttons).then((a) => {
    if (a === "View" && report) void vscode.commands.executeCommand("markdown.showPreview", vscode.Uri.file(report)).then(undefined, () => vscode.window.showTextDocument(vscode.Uri.file(report!)));
    else if (a === "Show conflicts") void showConflicts();
  });
  return result;
}

async function undoCommand(): Promise<void> {
  if (!library) return;
  const { gamePath } = settings();
  if (!(await gameClosed("undoing the deploy"))) return;
  const manifest = readManifest(gamePath);
  if (!manifest) {
    void vscode.window.showInformationMessage("Nothing is deployed.");
    return;
  }
  const a = await vscode.window.showWarningMessage(`Remove all ${manifest.files.length} deployed files from the game folder? Your library is not touched.`, { modal: true }, "Undo deploy");
  if (a !== "Undo deploy") return;
  const result = undo(library, gamePath);
  log.appendLine(`Undo: ${result.removed} removed${result.skipped.length ? `, left alone because they changed: ${result.skipped.join(", ")}` : ""}`);
  refresh();
  void vscode.window.showInformationMessage(`Undo: ${result.removed} files removed.${result.skipped.length ? ` ${result.skipped.length} changed files were left in place; see the log.` : ""}`);
}

async function removeCommand(mod: ModInfo | undefined): Promise<void> {
  if (!mod || !library) return;
  const a = await vscode.window.showWarningMessage(`Remove ${mod.name} from the library? Its files leave the game on the next deploy.`, { modal: true }, "Remove");
  if (a !== "Remove") return;
  removeMod(library, mod);
  log.appendLine(`Removed ${mod.name}`);
  reload();
}

/** Moves a mod past its neighbour in its section, the row above or below it on the page and in the tree. */
function move(mod: ModInfo | undefined, delta: -1 | 1): void {
  if (!mod || !library) return;
  if (moveInSection(library, mod, delta)) refresh();
}

// ---- Nexus Mods ----------------------------------------------------------------------------------

/** A pasted personal API key. */
const NexusKeySecret = "reddeck.nexusApiKey";
/** The tokens of an OAuth sign-in, as JSON. One or the other is kept, never both. */
const NexusTokensSecret = "reddeck.nexusTokens";

function nexusClientId(): string {
  return vscode.workspace.getConfiguration("reddeck").get<string>("nexusClientId", "").trim();
}

async function nexusTokens(): Promise<OAuthTokens | undefined> {
  const raw = await secrets.get(NexusTokensSecret);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as OAuthTokens;
  } catch {
    await secrets.delete(NexusTokensSecret);
    return undefined;
  }
}

async function nexusSignedIn(): Promise<boolean> {
  return !!(await secrets.get(NexusTokensSecret)) || !!(await secrets.get(NexusKeySecret));
}

/** A new token pair from the refresh token, kept in place of the old; nothing when Nexus refuses. */
async function renewNexusTokens(tokens: OAuthTokens): Promise<string | undefined> {
  try {
    const fresh = await refreshTokens({ clientId: nexusClientId(), refreshToken: tokens.refreshToken });
    await secrets.store(NexusTokensSecret, JSON.stringify(fresh));
    log.appendLine("Nexus: sign-in renewed");
    return fresh.accessToken;
  } catch (err) {
    log.appendLine(`Nexus: the sign-in could not be renewed (${err instanceof Error ? err.message : String(err)}); sign in again`);
    await secrets.delete(NexusTokensSecret);
    void vscode.window.showWarningMessage("The Nexus sign-in ran out and could not be renewed. Sign in again.", "Sign in").then((a) => {
      if (a === "Sign in") void run(() => nexusSignInCommand().then(() => undefined));
    });
    return undefined;
  }
}

/** The access token, renewed when it is about to run out. */
async function nexusAccessToken(): Promise<string | undefined> {
  const tokens = await nexusTokens();
  if (!tokens) return undefined;
  return needsRefresh(tokens) ? renewNexusTokens(tokens) : tokens.accessToken;
}

async function nexusClient(ask: boolean): Promise<NexusClient | undefined> {
  const token = await nexusAccessToken();
  if (token) {
    return new NexusClient({ bearer: token }, extensionVersion, {
      refresh: async () => {
        const tokens = await nexusTokens();
        return tokens ? renewNexusTokens(tokens) : undefined;
      },
    });
  }
  let key = await secrets.get(NexusKeySecret);
  if (!key && ask && (await nexusSignInCommand())) {
    // Signed in just now, by whichever path.
    return nexusClient(false);
  }
  key = key ?? (await secrets.get(NexusKeySecret));
  return key ? new NexusClient(key, extensionVersion) : undefined;
}

function signedInToast(name: string, premium: boolean): void {
  log.appendLine(`Nexus: signed in as ${name}${premium ? " (Premium)" : ""}`);
  void vscode.window.showInformationMessage(`Nexus: signed in as ${name}${premium ? " (Premium)" : ""}.`);
}

/** Checks a key with Nexus and keeps it, in place of any OAuth sign-in. */
async function storeNexusKey(key: string): Promise<string> {
  const client = new NexusClient(key, extensionVersion);
  const user = await client.validate();
  await secrets.store(NexusKeySecret, key);
  await secrets.delete(NexusTokensSecret);
  signedInToast(user.name, user.is_premium);
  return key;
}

/** Keeps the tokens of an OAuth sign-in, in place of any pasted key. */
async function storeNexusTokens(tokens: OAuthTokens): Promise<void> {
  const user = tokenUser(tokens.accessToken) ?? (await fetchUser(tokens.accessToken));
  await secrets.store(NexusTokensSecret, JSON.stringify(tokens));
  await secrets.delete(NexusKeySecret);
  signedInToast(user.name, user.premium);
}

/** Runs a browser sign-in with a cancellable progress toast; undefined when the user cancels. */
async function browserSignIn<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> {
  try {
    return await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Signing in to Nexus Mods", cancellable: true },
      async (progress, cancel) => {
        const controller = new AbortController();
        cancel.onCancellationRequested(() => controller.abort());
        progress.report({ message: "approve REDdeck in the browser tab that opened" });
        return fn(controller.signal);
      },
    );
  } catch (err) {
    if (err instanceof Error && /cancelled/.test(err.message)) return undefined;
    throw err;
  }
}

/**
 * Sign in, by the best path there is: OAuth in the browser when Nexus has given REDdeck a client
 * id, the older single sign-on when it has an application slug, else the API Access page and a
 * pasted key. A pasted key is always a choice (Nexus: set API key), including when the browser
 * path fails. True when signed in afterwards.
 */
async function nexusSignInCommand(): Promise<boolean> {
  const cfg = vscode.workspace.getConfiguration("reddeck");
  const clientId = nexusClientId();
  const application = cfg.get<string>("nexusApplication", "").trim();
  const openPage = (url: string) => vscode.env.openExternal(vscode.Uri.parse(url));
  const logLine = (line: string) => log.appendLine(line);
  if (clientId || (application && hasWebSocket())) {
    try {
      if (clientId) {
        const tokens = await browserSignIn((signal) => signInWithOAuth({ clientId, open: openPage, signal, log: logLine }));
        if (!tokens) return false;
        await storeNexusTokens(tokens);
      } else {
        const key = await browserSignIn((signal) => signIn({ application, open: openPage, signal, log: logLine }));
        if (!key) return false;
        await storeNexusKey(key);
      }
      return true;
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      log.appendLine(`Nexus sign-in failed: ${why}`);
      const a = await vscode.window.showErrorMessage(`Nexus sign-in failed: ${why}`, "Paste a key instead", "Try again");
      if (a === "Paste a key instead") return !!(await nexusPasteKey(true));
      if (a === "Try again") return nexusSignInCommand();
      return false;
    }
  }
  return !!(await nexusPasteKey(true));
}

/** The API Access page and an input box for the key on it. */
async function nexusPasteKey(openPage: boolean): Promise<string | undefined> {
  if (openPage) void vscode.env.openExternal(vscode.Uri.parse(ApiKeysPage));
  const key = await vscode.window.showInputBox({
    title: openPage ? "Sign in to Nexus Mods" : "Nexus Mods API key",
    prompt: openPage
      ? "The API Access page just opened in your browser. Copy the Personal API Key at the bottom of it and paste it here. It stays in VS Code's secret storage."
      : "Your personal API key from nexusmods.com > Settings > API Access. It stays in VS Code's secret storage.",
    password: true,
    ignoreFocusOut: true,
  });
  if (!key?.trim()) return undefined;
  return storeNexusKey(key.trim());
}

function nexusSetKeyCommand(): Promise<string | undefined> {
  return nexusPasteKey(false);
}

async function nexusSignOutCommand(): Promise<void> {
  const hadTokens = !!(await secrets.get(NexusTokensSecret));
  const hadKey = !!(await secrets.get(NexusKeySecret));
  if (!hadTokens && !hadKey) {
    void vscode.window.showInformationMessage("Not signed in to Nexus Mods.");
    return;
  }
  await secrets.delete(NexusTokensSecret);
  await secrets.delete(NexusKeySecret);
  log.appendLine("Nexus: signed out");
  void vscode.window.showInformationMessage(hadKey ? "Signed out of Nexus Mods. The key is gone from secret storage; revoke it on the API Access page if you want it dead." : "Signed out of Nexus Mods. The sign-in is gone from secret storage.");
}

async function nexusOpenCommand(mod: ModInfo | undefined): Promise<void> {
  if (!mod) return;
  if (!mod.source.modId) {
    void vscode.window.showInformationMessage(`${mod.name} has no Nexus id. Mods added from a Nexus link or imported from Vortex have one.`);
    return;
  }
  await vscode.env.openExternal(vscode.Uri.parse(modPageUrl(mod.source.modId)));
}

/** The Frameworks check for the current game version and manifest. */
function frameworkCheck(): FrameworkCheck | undefined {
  return library ? checkFrameworks(library, state.version, readManifest(settings().gamePath)) : undefined;
}

/**
 * When the game's version differs from the one at the last deploy: check the frameworks on Nexus
 * once for this version and say what was found, or ask to sign in when there is no key yet.
 */
async function gameChanged(version: string | undefined): Promise<void> {
  const check = frameworkCheck();
  if (!version || !check?.changed || !check.frameworks.length) return;
  if (globalState.get<string>("reddeck.checkedForGame") === version) return;
  await globalState.update("reddeck.checkedForGame", version);
  log.appendLine(`Game updated: ${check.deployed} at the last deploy, ${version} now. Checking ${check.frameworks.length} frameworks on Nexus.`);
  if (!(await nexusSignedIn())) {
    void vscode.window.showWarningMessage(`The game updated to ${version} since the last deploy. Sign in to Nexus to check the frameworks for newer files.`, "Sign in", "Not now").then((a) => {
      if (a === "Sign in") void run(() => nexusSignInCommand().then(() => undefined));
    });
    return;
  }
  await checkUpdatesCommand(true, check.frameworks);
  const after = frameworkCheck();
  if (!after?.updates.length) {
    void vscode.window.showInformationMessage(`The game updated to ${version} since the last deploy. No framework has a newer file on Nexus yet.`);
    return;
  }
  const names = after.updates.map((u) => `${u.mod.name} ${u.version}`).join(", ");
  void vscode.window.showWarningMessage(`The game updated to ${version}. Newer on Nexus: ${names}.`, "Show").then((a) => {
    if (a === "Show") void run(showPage);
  });
}

/** Once a day, when a key is stored and the setting allows. Never prompts. */
async function maybeCheckUpdates(): Promise<void> {
  if (!settings().checkUpdates || !library?.mods.some((m) => m.source.modId)) return;
  const last = globalState.get<number>("reddeck.lastUpdateCheck", 0);
  if (Date.now() - last < 24 * 3600 * 1000) return;
  if (!(await nexusSignedIn())) return;
  await checkUpdatesCommand(true);
}

async function checkUpdatesCommand(quiet: boolean, only?: ModInfo[]): Promise<void> {
  if (!library) return;
  const client = await nexusClient(!quiet);
  if (!client) return;
  const mods = (only ?? library.mods).filter((m) => m.source.modId);
  if (!mods.length) {
    if (!quiet) void vscode.window.showInformationMessage("No mod in the library has a Nexus id yet. Mods added from a Nexus link, or imported from Vortex, have one.");
    return;
  }
  let updates = 0;
  let failed = 0;
  await vscode.window.withProgress({ location: quiet ? vscode.ProgressLocation.Window : vscode.ProgressLocation.Notification, title: "Checking Nexus for updates" }, async (progress) => {
    for (const [i, mod] of mods.entries()) {
      progress.report({ message: `${i + 1} of ${mods.length}: ${mod.name}` });
      try {
        const files = await client.files(mod.source.modId!);
        const newest = newestFile(files);
        const info = mod.nexus?.name ? undefined : await client.mod(mod.source.modId!);
        mod.nexus = {
          name: info?.name ?? mod.nexus?.name ?? mod.name,
          version: info?.version ?? mod.nexus?.version ?? "",
          latestVersion: newest?.version ?? "",
          latestFileId: newest?.file_id ?? 0,
          latestFileName: newest?.file_name ?? "",
          checked: new Date().toISOString(),
          author: info?.author ?? mod.nexus?.author,
          summary: info?.summary ?? mod.nexus?.summary,
        };
        saveMod(library!, mod);
        if (newest && versionNewer(newest.version, mod.version)) updates++;
      } catch (err) {
        failed++;
        log.appendLine(`Nexus check failed for ${mod.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });
  await globalState.update("reddeck.lastUpdateCheck", Date.now());
  refresh();
  const rate = client.rate ? ` (${client.rate.dailyRemaining} Nexus requests left today)` : "";
  log.appendLine(`Nexus: ${mods.length} mods checked, ${updates} updates, ${failed} failed${rate}`);
  if (!quiet || updates) {
    void vscode.window.showInformationMessage(updates ? `${updates} mod${updates === 1 ? " has" : "s have"} a newer file on Nexus. Open a mod's details to see.` : `All ${mods.length} Nexus mods are up to date.${failed ? ` ${failed} could not be checked, see the log.` : ""}`);
  }
}

async function nexusAddLinkCommand(): Promise<void> {
  const link = await vscode.window.showInputBox({ title: "Add from a Nexus link", prompt: "Paste an nxm:// link (from the Mod manager download button) or a mod page link", ignoreFocusOut: true });
  if (!link?.trim()) return;
  await addFromLink(link.trim());
}

async function handleUri(uri: vscode.Uri): Promise<void> {
  if (uri.path !== "/nxm") return;
  const url = new URLSearchParams(uri.query).get("url");
  if (!url) throw new Error("The link REDdeck received had no nxm URL in it.");
  await addFromLink(url);
}

async function addFromLink(link: string): Promise<void> {
  if (!library) return;
  const page = /nexusmods\.com\/cyberpunk2077\/mods\/(\d+)/i.exec(link);
  if (page) {
    void vscode.window
      .showInformationMessage(`That is a mod page. On it, pick a file and press "Mod manager download"; the link comes here when REDdeck handles them (REDdeck: Nexus: handle download links).`, "Open the page")
      .then((a) => a && vscode.env.openExternal(vscode.Uri.parse(link)));
    return;
  }
  const nxm = parseNxm(link);
  if (nxm.game !== "cyberpunk2077") throw new Error(`That link is for ${nxm.game}, not Cyberpunk 2077.`);
  await fetchFromNexus(nxm.modId, nxm.fileId, nxm.key, nxm.expires);
}

/**
 * Downloads one Nexus file into the library and adds it. When an older entry for the same Nexus
 * mod exists, the new one takes its place in the order and the old one is turned off.
 */
async function fetchFromNexus(modId: number, fileId: number, key?: string, expires?: number): Promise<void> {
  if (!library) return;
  const client = await nexusClient(true);
  if (!client) return;
  const [info, files] = await Promise.all([client.mod(modId), client.files(modId)]);
  const file = files.files.find((f) => f.file_id === fileId);
  const same = findSameVersion(library, modId, fileId, file?.version);
  if (same) {
    const r = activateVersion(library, same);
    log.appendLine(`${same.name} ${same.version} is already in the library (${same.id}); made it the active version`);
    refresh();
    void vscode.window.showInformationMessage(`${info.name} ${same.version} is already in the library${r.previous.id === same.id ? "." : " and is now the active version."}`);
    return;
  }
  const links = await client.downloadLinks(modId, fileId, key, expires).catch((err: Error) => {
    if (/403|forbidden|premium/i.test(err.message)) throw new PremiumError();
    throw err;
  });
  if (!links.length) throw new Error("Nexus returned no download link.");
  const nxm = { modId, fileId };
  const fileName = file?.file_name ?? `${info.name}-${nxm.modId}-${nxm.fileId}.zip`;
  const dest = path.join(library.root, "downloads", fileName);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const have = fs.existsSync(dest) && !!file && Math.abs(fs.statSync(dest).size - file.size_kb * 1024) < 2048;
  if (have) log.appendLine(`${fileName} is already in downloads, not downloading again`);
  else {
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Downloading ${info.name}` }, async (progress) => {
      let last = 0;
      await download(links[0].URI, dest, (received, total) => {
        if (!total) return;
        const pct = Math.floor((received / total) * 100);
        progress.report({ increment: pct - last, message: `${Math.round(received / 1048576)} of ${Math.round(total / 1048576)} MB` });
        last = pct;
      });
    });
  }
  log.appendLine(`Downloaded ${fileName} (${info.name} ${file?.version ?? ""}) from Nexus mod ${nxm.modId}, md5 ${md5Of(dest)}`);
  const existing = library.mods.find((m) => m.source.modId === nxm.modId);
  await addFrom(dest, { name: existing?.name ?? info.name, version: file?.version ?? info.version, source: { type: "nexus", modId: nxm.modId, fileId: nxm.fileId, path: dest } });
  const added = library.mods[library.mods.length - 1];
  if (added && added.source.modId === nxm.modId && added.source.fileId === nxm.fileId) {
    added.nexus = { name: info.name, version: info.version, latestVersion: file?.version ?? info.version, latestFileId: nxm.fileId, latestFileName: fileName, checked: new Date().toISOString(), author: info.author, summary: info.summary };
    saveMod(library, added);
  }
  if (existing && added && added.id !== existing.id) {
    const r = activateVersion(library, added);
    log.appendLine(`${added.name} ${added.version} takes the place of ${r.previous.version}, which is now off`);
    refresh();
    offerDeploy(`${added.name} ${added.version} added in place of ${r.previous.version}${r.on ? "" : " (the mod is off)"}.`);
  }
}

class PremiumError extends Error {
  constructor() {
    super("Nexus gives direct downloads to Premium members only. Use the Mod manager download button on the site, which sends a link with a key.");
  }
}

/** Updates a mod to the newest file Nexus has, with one confirmation. */
async function updateModCommand(mod: ModInfo | undefined): Promise<void> {
  if (!mod || !library || !mod.source.modId) return;
  const client = await nexusClient(true);
  if (!client) return;
  const fam = familyOf(library, mod);
  const newestHere = fam.mods[0].version;
  let fileId = fam.update?.fileId;
  let latest = fam.update?.version;
  if (!fileId || !latest) {
    const newest = newestFile(await client.files(mod.source.modId));
    fileId = newest?.file_id;
    latest = newest?.version;
  }
  if (!fileId || !latest || !versionNewer(latest, newestHere)) {
    void vscode.window.showInformationMessage(`${fam.name} ${newestHere} is the newest file on Nexus${fam.active.version !== newestHere ? `, and it is in the library; pick it from the version list` : ""}.`);
    return;
  }
  const a = await vscode.window.showInformationMessage(`Update ${fam.name} from ${fam.active.version} to ${latest}?`, { modal: true, detail: "REDdeck downloads the newest file from Nexus into the library, puts it in this mod's place and turns this version off. The game folder changes when you deploy." }, "Update");
  if (a !== "Update") return;
  try {
    await fetchFromNexus(mod.source.modId, fileId);
  } catch (err) {
    if (!(err instanceof PremiumError)) throw err;
    const handler = describeHandler(await currentNxmHandler());
    const ours = /reddeck/i.test(handler);
    void vscode.env.openExternal(vscode.Uri.parse(`${modPageUrl(mod.source.modId)}?tab=files&file_id=${fileId}`));
    void vscode.window.showInformationMessage(
      ours
        ? `Nexus gives direct downloads to Premium members only. The file page is open: press "Mod manager download" and REDdeck takes it from there.`
        : `Nexus gives direct downloads to Premium members only. The file page is open: press "Mod manager download". ${handler} handles those links right now; run "REDdeck: Nexus: handle download links" so they land here.`,
    );
  }
}

async function nexusHandleLinksCommand(): Promise<void> {
  const before = await currentNxmHandler();
  const who = describeHandler(before);
  if (who !== "nobody" && who !== "REDdeck") {
    const a = await vscode.window.showWarningMessage(`${who} handles Nexus download links right now. Hand them to REDdeck? ${who} can take them back from its own settings.`, { modal: true }, "Hand them to REDdeck");
    if (!a) return;
  }
  await registerNxmHandler();
  log.appendLine(`nxm links: now handled by REDdeck (before: ${who})`);
  void vscode.window.showInformationMessage("REDdeck now handles Nexus download links. On a mod page, press Mod manager download and the file lands in the library.");
}

async function nexusReleaseLinksCommand(): Promise<void> {
  const who = describeHandler(await currentNxmHandler());
  if (who !== "REDdeck") {
    void vscode.window.showInformationMessage(`Nexus download links are handled by ${who}, not REDdeck.`);
    return;
  }
  await unregisterNxmHandler();
  log.appendLine("nxm links: REDdeck no longer handles them");
  void vscode.window.showInformationMessage("REDdeck no longer handles Nexus download links. Start Vortex once to give them back to it.");
}
