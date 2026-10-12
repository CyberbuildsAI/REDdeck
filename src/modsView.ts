// The Mods view: one list, grouped into Frameworks and Mods, with a checkbox and a status per mod.

import * as vscode from "vscode";
import { families } from "./families";
import type { Library, ModInfo } from "./library";

export type ModNode = { type: "group"; label: string; mods: ModInfo[] } | { type: "mod"; mod: ModInfo };

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
    const { mod } = node;
    const status = this.status(mod);
    const item = new vscode.TreeItem(mod.name, vscode.TreeItemCollapsibleState.None);
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
