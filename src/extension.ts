// REDdeck: a simple mod manager for Cyberpunk 2077. This is the M0 scaffold: the Mods view over
// a library folder, Add mod from a folder, on/off, remove. Deploy is a placeholder until M1.

import * as path from "node:path";
import * as vscode from "vscode";
import { addFolder, defaultLibraryPath, loadLibrary, modFolder, removeMod, saveMod, type Library } from "./library";
import { ModsView, type ModNode } from "./modsView";

let library: Library | undefined;
let view: ModsView;
let status: vscode.StatusBarItem;
let log: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  log = vscode.window.createOutputChannel("REDdeck");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 40);
  status.command = "reddeck.showLog";
  status.show();

  view = new ModsView(() => library);
  const tree = vscode.window.createTreeView("reddeck.mods", { treeDataProvider: view, showCollapseAll: false });

  context.subscriptions.push(
    log,
    status,
    tree,
    tree.onDidChangeCheckboxState((e) => {
      for (const [node, state] of e.items) {
        if (node.type !== "mod" || !library) continue;
        node.mod.enabled = state === vscode.TreeItemCheckboxState.Checked;
        saveMod(library, node.mod);
        log.appendLine(`${node.mod.name}: ${node.mod.enabled ? "on" : "off"}`);
      }
      updateStatus();
      view.refresh();
    }),
    vscode.commands.registerCommand("reddeck.addMod", () => addMod()),
    vscode.commands.registerCommand("reddeck.deploy", () => deploy()),
    vscode.commands.registerCommand("reddeck.remove", (node: ModNode) => remove(node)),
    vscode.commands.registerCommand("reddeck.openInExplorer", (node: ModNode) => {
      if (node?.type === "mod" && library) vscode.env.openExternal(vscode.Uri.file(modFolder(library, node.mod)));
    }),
    vscode.commands.registerCommand("reddeck.refresh", () => reload()),
    vscode.commands.registerCommand("reddeck.showLog", () => log.show(true)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("reddeck")) reload();
    }),
  );

  reload();
}

export function deactivate(): void {
  // Nothing to stop: the library is plain files.
}

function settings(): { gamePath: string; libraryPath: string } {
  const cfg = vscode.workspace.getConfiguration("reddeck");
  return {
    gamePath: cfg.get<string>("gamePath", ""),
    libraryPath: cfg.get<string>("libraryPath", "") || defaultLibraryPath(),
  };
}

function reload(): void {
  const { gamePath, libraryPath } = settings();
  try {
    library = loadLibrary(libraryPath, gamePath);
    log.appendLine(`Library: ${libraryPath} (${library.mods.length} mods)`);
  } catch (err) {
    library = undefined;
    log.appendLine(`Could not open the library at ${libraryPath}: ${String(err)}`);
    vscode.window.showErrorMessage(`REDdeck could not open the library at ${libraryPath}. See the log.`);
  }
  void vscode.commands.executeCommand("setContext", "reddeck.empty", !library || library.mods.length === 0);
  updateStatus();
  view.refresh();
}

function updateStatus(): void {
  if (!library) {
    status.text = "$(package) REDdeck: no library";
    return;
  }
  const on = library.mods.filter((m) => m.enabled).length;
  status.text = `$(package) ${on} of ${library.mods.length} mods on`;
  status.tooltip = `REDdeck library: ${library.root}`;
}

async function addMod(): Promise<void> {
  if (!library) return;
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: "Add this folder as a mod",
    title: "Add mod: a folder laid out like the game folder (archive, r6, red4ext, bin, mods)",
  });
  if (!picked?.length) return;
  const source = picked[0].fsPath;
  const name = await vscode.window.showInputBox({
    prompt: "Name for this mod",
    value: path.basename(source),
    validateInput: (v) => (v.trim() ? undefined : "A name is needed"),
  });
  if (!name) return;
  try {
    const mod = addFolder(library, source, name.trim());
    log.appendLine(`Added ${mod.name} (${mod.files} files, ${mod.kinds.join(", ")}) from ${source}`);
    void vscode.commands.executeCommand("setContext", "reddeck.empty", false);
    updateStatus();
    view.refresh();
  } catch (err) {
    vscode.window.showErrorMessage(`Could not add ${name}: ${String(err)}`);
  }
}

async function remove(node: ModNode): Promise<void> {
  if (node?.type !== "mod" || !library) return;
  const answer = await vscode.window.showWarningMessage(
    `Remove ${node.mod.name} from the library? Its files leave the game on the next deploy.`,
    { modal: true },
    "Remove",
  );
  if (answer !== "Remove") return;
  removeMod(library, node.mod);
  log.appendLine(`Removed ${node.mod.name}`);
  reload();
}

function deploy(): void {
  if (!library) return;
  const on = library.mods.filter((m) => m.enabled);
  const files = on.reduce((n, m) => n + m.files, 0);
  log.appendLine(`Deploy would link ${files} files from ${on.length} mods into ${library.info.gamePath}. Deployment arrives in M1.`);
  vscode.window.showInformationMessage(`Deploy is not built yet. It would link ${files} files from ${on.length} mods. See the log.`);
}
