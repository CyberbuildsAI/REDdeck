// REDdeck: a simple mod manager for Cyberpunk 2077. The extension is a thin shell over src/core.ts:
// the Mods view, the four verbs (add, on/off, deploy, remove), undo, import from Vortex, the detail
// panel, and the archive conflict scan through REDbridge when it is available.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { BridgeClient, compareVersions, findBridge, MinBridgeVersion } from "./bridgeClient";
import { classify } from "./classifier";
import { enabledArchives, findArchiveConflicts, type ArchiveConflictSummary, type ArchiveListing } from "./conflicts";
import { deploy, detectChanges, modStatus, plan, readManifest, undo, vortexManages, type Change, type Decision, type Plan } from "./deploy";
import { DetailPanel } from "./detailPanel";
import { extractArchive, findSevenZip, isArchiveFile } from "./extract";
import { gameVersion } from "./game";
import { addMod, defaultLibraryPath, keepDownload, loadLibrary, modFolder, moveMod, removeMod, saveMod, sourcePath, type Library, type ModInfo, type ModSource } from "./library";
import { ModsView, type ModNode } from "./modsView";
import { deployRedmod, enabledRedmodPackages } from "./redmod";
import { importFromVortex, listVortexMods } from "./vortex";

let library: Library | undefined;
let view: ModsView;
let tree: vscode.TreeView<ModNode>;
let detail: DetailPanel;
let status: vscode.StatusBarItem;
let log: vscode.OutputChannel;
let sevenZa: string | undefined;
let extensionRoot = "";
let bridge: BridgeClient | undefined;
let bridgeExe = "";
let scanTimer: NodeJS.Timeout | undefined;
let state: { plan?: Plan; changes: Change[]; archive?: ArchiveConflictSummary; version?: string } = { changes: [] };
const archiveCache = new Map<string, { mtimeMs: number; resources: Map<string, string> }>();

export function activate(context: vscode.ExtensionContext): void {
  extensionRoot = context.extensionPath;
  log = vscode.window.createOutputChannel("REDdeck");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
  status.command = "reddeck.deploy";
  status.show();
  sevenZa = findSevenZip(extensionRoot);

  view = new ModsView(() => library, statusFor);
  tree = vscode.window.createTreeView("reddeck.mods", { treeDataProvider: view, showCollapseAll: false });
  detail = new DetailPanel((action, id) => run(() => detailAction(action, id)));

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
    vscode.commands.registerCommand("reddeck.deploy", () => run(deployCommand)),
    vscode.commands.registerCommand("reddeck.undo", () => run(undoCommand)),
    vscode.commands.registerCommand("reddeck.remove", (node: ModNode) => run(() => removeCommand(modOf(node)))),
    vscode.commands.registerCommand("reddeck.details", (node: ModNode) => run(() => showDetails(modOf(node)))),
    vscode.commands.registerCommand("reddeck.checkConflicts", () => run(() => scanArchives(true))),
    vscode.commands.registerCommand("reddeck.moveUp", (node: ModNode) => move(modOf(node), -1)),
    vscode.commands.registerCommand("reddeck.moveDown", (node: ModNode) => move(modOf(node), 1)),
    vscode.commands.registerCommand("reddeck.openInExplorer", (node: ModNode) => {
      if (node?.type === "mod" && library) vscode.env.openExternal(vscode.Uri.file(modFolder(library, node.mod)));
    }),
    vscode.commands.registerCommand("reddeck.openLibrary", () => {
      if (library) vscode.env.openExternal(vscode.Uri.file(library.root));
    }),
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
}

export function deactivate(): void {
  bridge?.stop();
}

function modOf(node: ModNode | undefined): ModInfo | undefined {
  return node?.type === "mod" ? node.mod : undefined;
}

function settings(): { gamePath: string; libraryPath: string; bridgePath: string; dotnetRoot: string } {
  const cfg = vscode.workspace.getConfiguration("reddeck");
  return {
    gamePath: cfg.get<string>("gamePath", ""),
    libraryPath: cfg.get<string>("libraryPath", "") || defaultLibraryPath(),
    bridgePath: cfg.get<string>("bridgePath", ""),
    dotnetRoot: cfg.get<string>("dotnetRoot", ""),
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
  const { libraryPath, gamePath } = settings();
  try {
    library = loadLibrary(libraryPath, gamePath);
    log.appendLine(`Library: ${libraryPath} (${library.mods.length} mods), game: ${gamePath}`);
  } catch (err) {
    library = undefined;
    log.appendLine(`Could not open the library at ${libraryPath}: ${String(err)}`);
    void vscode.window.showErrorMessage(`REDdeck could not open the library at ${libraryPath}. See the log.`);
  }
  bridgeExe = findBridge(settings().bridgePath, extensionRoot) ?? "";
  void gameVersion(gamePath).then((v) => {
    state.version = v;
    tree.description = v ? `Cyberpunk 2077 ${v}` : undefined;
    updateStatus();
  });
  refresh();
}

/** Recomputes the plan and the status of every mod; cheap enough to run after every change. */
function refresh(): void {
  const { gamePath } = settings();
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
  void vscode.commands.executeCommand("setContext", "reddeck.empty", !library || library.mods.length === 0);
  void vscode.commands.executeCommand("setContext", "reddeck.deployed", !!readManifest(gamePath));
  updateStatus();
  view.refresh();
  updateDetail();
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => void run(() => scanArchives(false)), 400);
}

function statusFor(mod: ModInfo): string {
  if (!library || !state.plan) return "";
  const parts = [modStatus(library, settings().gamePath, mod, state.plan, readManifest(settings().gamePath), state.changes)];
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
  if (p?.vortex) {
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
  if (!library) return;
  if (!bridgeExe) {
    state.archive = undefined;
    if (explicit) {
      void vscode.window.showInformationMessage("Archive conflicts need REDbridge. Set reddeck.bridgePath to REDbridge.exe (or its folder) and try again.");
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
  if (!bridge || !bridge.running) {
    bridge = new BridgeClient(bridgeExe, settings().dotnetRoot);
    bridge.start();
    const info = await bridge.info();
    log.appendLine(`REDbridge ${info.version} (WolvenKit ${info.wolvenKit}) at ${bridgeExe}`);
    if (compareVersions(info.version, MinBridgeVersion) < 0) {
      bridge.stop();
      bridge = undefined;
      bridgeExe = "";
      throw new Error(`REDbridge ${info.version} is older than ${MinBridgeVersion}, which added archive.openMod. Run npm run update in the REDbridge folder.`);
    }
  }
  const listings: ArchiveListing[] = [];
  for (const { mod, archive } of wanted) {
    const file = sourcePath(library, mod, archive);
    let st: fs.Stats;
    try {
      st = fs.statSync(file);
    } catch {
      continue;
    }
    const cached = archiveCache.get(file);
    if (cached && cached.mtimeMs === st.mtimeMs) {
      listings.push({ mod: mod.id, archive, resources: cached.resources });
      continue;
    }
    try {
      const r = await bridge.openMod(file);
      const resources = new Map(r.items.map((i) => [i.hash, i.name]));
      archiveCache.set(file, { mtimeMs: st.mtimeMs, resources });
      listings.push({ mod: mod.id, archive, resources });
    } catch (err) {
      log.appendLine(`Could not read ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  state.archive = findArchiveConflicts(listings);
  const n = state.archive.conflicts.length;
  log.appendLine(`Archive scan: ${listings.length} archives, ${n} overlapping resource${n === 1 ? "" : "s"}`);
  view.refresh();
  updateDetail();
  if (explicit) void vscode.window.showInformationMessage(n ? `${n} resources overlap between enabled mods. Open a mod's details to see who wins.` : "No resources overlap between the enabled mods' archives.");
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
  };
}

function showDetails(mod: ModInfo | undefined): void {
  if (!mod) return;
  detail.show(detailData(mod));
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
  }
}

// ---- the verbs ---------------------------------------------------------------------------------

async function addModCommand(): Promise<void> {
  if (!library) return;
  const choice = await vscode.window.showQuickPick(
    [
      { label: "$(file-zip) A zip, 7z or rar file", detail: "The file you downloaded from Nexus Mods", source: "file" as const },
      { label: "$(folder) A folder", detail: "A folder laid out like the game folder, or a loose set of mod files", source: "folder" as const },
      { label: "$(cloud-download) Import from Vortex", detail: "Copy the mods Vortex has for Cyberpunk 2077 into the library", source: "vortex" as const },
    ],
    { placeHolder: "Add a mod from" },
  );
  if (!choice) return;
  if (choice.source === "vortex") return importVortexCommand();
  const picked = await vscode.window.showOpenDialog(
    choice.source === "file"
      ? { canSelectFiles: true, canSelectMany: true, openLabel: "Add", filters: { "Mod archives": ["zip", "7z", "rar"] }, title: "Add mod" }
      : { canSelectFolders: true, canSelectMany: false, openLabel: "Add this folder", title: "Add mod from a folder" },
  );
  if (!picked?.length) return;
  for (const uri of picked) await addFrom(uri.fsPath);
}

/** Adds one file or folder: extract if needed, classify, ask about options, copy into the library. */
async function addFrom(source: string): Promise<void> {
  if (!library) return;
  const isFile = fs.statSync(source).isFile();
  if (isFile && !isArchiveFile(source)) throw new Error(`${path.basename(source)} is not a zip, 7z or rar file.`);
  const defaultName = cleanName(path.basename(source, isFile ? path.extname(source) : ""));
  const name = await vscode.window.showInputBox({ prompt: "Name for this mod", value: defaultName, validateInput: (v) => (v.trim() ? undefined : "A name is needed") });
  if (!name) return;

  let folder = source;
  let temp: string | undefined;
  try {
    if (isFile) {
      temp = fs.mkdtempSync(path.join(os.tmpdir(), "reddeck-"));
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Opening ${path.basename(source)}` }, () => extractArchive(source, temp!, sevenZa));
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
    const sourceInfo: ModSource = isFile ? { type: "file", path: keepDownload(library, source) } : { type: "folder", path: source };
    const mod = addMod(library, c.placements, { name: name.trim(), version: versionFrom(path.basename(source)), source: sourceInfo });
    log.appendLine(`Added ${mod.name} (${mod.files.length} files, ${mod.kinds.join(", ")}) from ${source}`);
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

async function importVortexCommand(): Promise<void> {
  if (!library) return;
  const mods = listVortexMods(settings().gamePath);
  if (!mods.length) {
    void vscode.window.showInformationMessage("No Vortex mods for Cyberpunk 2077 were found on this machine.");
    return;
  }
  const picked = await vscode.window.showQuickPick(
    mods.map((m) => ({ label: m.name, description: m.version, detail: `${m.files} files${m.deployed ? ", deployed by Vortex (will be on)" : " (will be off)"}`, picked: true, mod: m })),
    { canPickMany: true, placeHolder: "Vortex is not changed. Mods it has deployed start as on.", title: "Import from Vortex" },
  );
  if (!picked?.length) return;
  const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Importing from Vortex" }, async () => importFromVortex(library!, picked.map((p) => p.mod)));
  for (const s of result.skipped) log.appendLine(`Skipped ${s.name}: ${s.reason}`);
  for (const m of result.added) log.appendLine(`Imported ${m.name} ${m.version} (${m.files.length} files, ${m.kinds.join(", ")})`);
  refresh();
  const note = result.skipped.length ? ` ${result.skipped.length} skipped, see the log.` : "";
  void vscode.window.showInformationMessage(`Imported ${result.added.length} mods from Vortex.${note}`);
}

async function deployCommand(): Promise<void> {
  if (!library) return;
  const { gamePath } = settings();
  if (vortexManages(gamePath)) {
    const a = await vscode.window.showWarningMessage(
      "Vortex manages this game folder, and two managers cannot share one. In Vortex, choose Mods > Purge, then deploy here. Until then REDdeck only reads.",
      "Import from Vortex",
    );
    if (a) await importVortexCommand();
    return;
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
    return deploy(library!, gamePath, decisions, (done, total) => {
      const pct = Math.floor((done / total) * 100);
      progress.report({ increment: pct - last, message: `${done} of ${total}` });
      last = pct;
    });
  });
  log.appendLine(`Deployed (${result.method}): ${result.linked} added, ${result.removed} removed, ${result.kept} unchanged, ${result.backedUp} backed up${result.skipped.length ? `, skipped ${result.skipped.join(", ")}` : ""}`);
  let redmodNote = "";
  if (enabledRedmodPackages(library).length) {
    const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Preparing REDmod mods" }, () => deployRedmod(library!, gamePath, (l) => log.appendLine(l)));
    redmodNote = r.ran ? ` ${r.packages.length} REDmod mod${r.packages.length === 1 ? "" : "s"} prepared; launch the game with -modded.` : ` REDmod mods not prepared: ${r.output}.`;
  }
  refresh();
  const words = result.method === "link" ? "linked" : "copied";
  void vscode.window.showInformationMessage(`Deployed: ${result.linked} files ${words}, ${result.removed} removed.${state.plan?.conflicts.length ? ` ${state.plan.conflicts.length} conflicts resolved by order.` : ""}${redmodNote}`);
}

async function undoCommand(): Promise<void> {
  if (!library) return;
  const { gamePath } = settings();
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

function move(mod: ModInfo | undefined, delta: -1 | 1): void {
  if (!mod || !library) return;
  moveMod(library, mod, delta);
  refresh();
}
