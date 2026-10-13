// The Mods view: one list, grouped into Frameworks and Mods, with a checkbox and a status per mod.
// A mod expands into the folders and files it deploys; a file opens from the library copy.

import * as path from "node:path";
import * as vscode from "vscode";
import { families } from "./families";
import { modFolder, type Library, type ModInfo } from "./library";

export type ModNode =
  | { type: "group"; label: string; mods: ModInfo[] }
  | { type: "mod"; mod: ModInfo }
  | { type: "folder"; mod: ModInfo; label: string; files: string[] }
  | { type: "file"; mod: ModInfo; file: string };

/** The game-folder prefix a file belongs under, for grouping: archive/pc/mod, r6/scripts/Foo, a CET mod folder. */
function topFolder(f: string): string {
  const depth = f.startsWith("bin/x64/plugins/cyber_engine_tweaks/mods/") ? 5 : f.startsWith("archive/") ? 3 : f.startsWith("red4ext/plugins/") ? 3 : 2;
  const parts = f.split("/");
  return parts.length > depth ? parts.slice(0, depth).join("/") : parts.slice(0, -1).join("/");
}

export class ModsView implements vscode.TreeDataProvider<ModNode> {
  private readonly changed = new vscode.EventEmitter<ModNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(
    private readonly library: () => Library | undefined,
    private readonly status: (mod: ModInfo) => string,
  ) {}

  refresh(): void {
    this.changed.fire(undefined);
  }

  getChildren(node?: ModNode): ModNode[] {
    const lib = this.library();
    if (!lib) return [];
    if (!node) {
      // One node per mod; a mod with several versions in the library shows its active one.
      const active = families(lib).map((f) => f.active);
      const frameworks = active.filter((m) => m.kinds.includes("framework"));
      const mods = active.filter((m) => !m.kinds.includes("framework"));
      const groups: ModNode[] = [];
      if (frameworks.length) groups.push({ type: "group", label: "Frameworks", mods: frameworks });
      groups.push({ type: "group", label: "Mods", mods });
      return groups;
    }
    if (node.type === "group") return node.mods.map((mod) => ({ type: "mod", mod }));
    if (node.type === "mod") {
      const groups = new Map<string, string[]>();
      for (const f of node.mod.files) groups.set(topFolder(f), [...(groups.get(topFolder(f)) ?? []), f]);
      return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, files]) => ({ type: "folder", mod: node.mod, label, files }));
    }
    if (node.type === "folder") return node.files.map((file) => ({ type: "file", mod: node.mod, file }));
    return [];
  }

  getTreeItem(node: ModNode): vscode.TreeItem {
    if (node.type === "group") {
      const on = node.mods.filter((m) => m.enabled).length;
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${node.mods.length}, ${on} on`;
      item.contextValue = "group";
      return item;
    }
    if (node.type === "folder") {
      const item = new vscode.TreeItem(node.label || "(game folder)", vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `${node.mod.id}/${node.label}`;
      item.description = `${node.files.length} file${node.files.length === 1 ? "" : "s"}`;
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = "folder";
      item.tooltip = `${node.label} in the game folder, from ${node.mod.name}`;
      return item;
    }
    if (node.type === "file") {
      const lib = this.library();
      const name = node.file.split("/").pop() ?? node.file;
      const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None);
      item.id = `${node.mod.id}/${node.file}`;
      item.description = node.file.slice(0, -name.length - 1).replace(/^.*\//, "");
      item.tooltip = `${node.file}\nLibrary copy: opens in the editor. Deployed files are hardlinks to it.`;
      item.contextValue = "file";
      if (lib) {
        const uri = vscode.Uri.file(path.join(modFolder(lib, node.mod), ...node.file.split("/")));
        item.resourceUri = uri;
        item.command = { command: "vscode.open", title: "Open", arguments: [uri] };
      }
      return item;
    }
    const { mod } = node;
    const status = this.status(mod);
    const item = new vscode.TreeItem(mod.name, mod.files.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.id = mod.id;
    const others = families(this.library()!).find((f) => f.active.id === mod.id)?.mods.length ?? 1;
    item.description = [mod.version + (others > 1 ? ` (+${others - 1})` : ""), status].filter(Boolean).join("  ·  ");
    item.tooltip = new vscode.MarkdownString(
      [`**${mod.name}** ${mod.version}`, `${mod.kinds.join(", ")} · ${mod.files.length} files`, status, mod.source.path ? `from ${mod.source.path}` : ""].filter(Boolean).join("  \n"),
    );
    item.contextValue = "mod";
    item.command = { command: "reddeck.details", title: "Details", arguments: [node] };
    item.checkboxState = mod.enabled ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
    const icon = status.includes("conflict") ? "warning" : status.includes("changed") ? "edit" : "package";
    const color = status.includes("conflict") || status.includes("changed") ? "editorWarning.foreground" : mod.enabled ? "reddeck.accent" : "disabledForeground";
    item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
    return item;
  }
}
