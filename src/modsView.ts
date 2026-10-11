// The Mods view: one list, grouped into Frameworks and Mods, with a checkbox per mod.

import * as vscode from "vscode";
import type { Library, ModInfo } from "./library";

export type ModNode = { type: "group"; label: string; mods: ModInfo[] } | { type: "mod"; mod: ModInfo };

export class ModsView implements vscode.TreeDataProvider<ModNode> {
  private readonly changed = new vscode.EventEmitter<ModNode | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  constructor(private readonly library: () => Library | undefined) {}

  refresh(): void {
    this.changed.fire(undefined);
  }

  getChildren(node?: ModNode): ModNode[] {
    const lib = this.library();
    if (!lib) return [];
    if (!node) {
      const frameworks = lib.mods.filter((m) => m.kinds.includes("framework"));
      const mods = lib.mods.filter((m) => !m.kinds.includes("framework"));
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
    const item = new vscode.TreeItem(mod.name, vscode.TreeItemCollapsibleState.None);
    item.id = mod.id;
    item.description = [mod.version, mod.kinds.join(" ")].filter(Boolean).join("  ");
    item.tooltip = `${mod.name}\n${mod.files} files\n${mod.enabled ? "On" : "Off"}, not deployed yet`;
    item.contextValue = "mod";
    item.checkboxState = mod.enabled ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
    item.iconPath = new vscode.ThemeIcon("package", new vscode.ThemeColor("redpack.accent"));
    return item;
  }
}
