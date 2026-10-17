// The Mods view: one list, grouped into Frameworks, the user's sections and Mods, with a checkbox and a status per mod.
// A mod expands into the folders and files it deploys; a file opens from the library copy.

import * as path from "node:path";
import * as vscode from "vscode";
import { families } from "./families";
import { frameworkDetail, frameworkSummary, type FrameworkCheck } from "./frameworks";
import { modFolder, type Library, type ModInfo } from "./library";
import { sectionsOf } from "./sections";
import { formatBytes, modSize } from "./sizes";

/** One thing EDGEdeck needs or can use that is not in place yet; the row is a button for it. */
export interface SetupStep {
  id: "game" | "bridge" | "nexus" | "links" | "vortex";
  label: string;
  detail: string;
  command: string;
}

const SetupIcons: Record<SetupStep["id"], string> = { game: "folder-opened", bridge: "cloud-download", nexus: "account", links: "link", vortex: "archive" };

export type ModNode =
  | { type: "group"; label: string; mods: ModInfo[]; steps?: SetupStep[]; user?: boolean }
  | { type: "setup"; step: SetupStep }
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
    private readonly frameworks: () => FrameworkCheck | undefined = () => undefined,
    private readonly setup: () => SetupStep[] = () => [],
  ) {}

  refresh(): void {
    this.changed.fire(undefined);
  }

  getChildren(node?: ModNode): ModNode[] {
    const lib = this.library();
    if (!lib) return [];
    if (!node) {
      // No mods: the view's welcome content takes over, with the setup buttons in it.
      if (!lib.mods.length) return [];
      // One node per mod; a mod with several versions in the library shows its active one.
      const groups: ModNode[] = [];
      const steps = this.setup();
      if (steps.length) groups.push({ type: "group", label: "Set up", mods: [], steps });
      for (const sec of sectionsOf(lib)) groups.push({ type: "group", label: sec.name, mods: sec.families.map((f) => f.active), user: sec.user });
      return groups;
    }
    if (node.type === "group") return node.steps ? node.steps.map((step) => ({ type: "setup", step })) : node.mods.map((mod) => ({ type: "mod", mod }));
    if (node.type === "mod") {
      const groups = new Map<string, string[]>();
      for (const f of node.mod.files) groups.set(topFolder(f), [...(groups.get(topFolder(f)) ?? []), f]);
      return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, files]) => ({ type: "folder", mod: node.mod, label, files }));
    }
    if (node.type === "folder") return node.files.map((file) => ({ type: "file", mod: node.mod, file }));
    return [];
  }

  getTreeItem(node: ModNode): vscode.TreeItem {
    if (node.type === "group" && node.steps) {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${node.steps.length} to do`;
      item.contextValue = "setupGroup";
      item.tooltip = "Things EDGEdeck needs or can use. Click a row to do it; the x hides a row you do not want.";
      return item;
    }
    if (node.type === "setup") {
      const item = new vscode.TreeItem(node.step.label, vscode.TreeItemCollapsibleState.None);
      item.id = `setup/${node.step.id}`;
      item.description = node.step.detail;
      item.tooltip = node.step.detail;
      item.iconPath = new vscode.ThemeIcon(SetupIcons[node.step.id], new vscode.ThemeColor("edgedeck.accent"));
      item.contextValue = "setup";
      item.command = { command: node.step.command, title: node.step.label };
      return item;
    }
    if (node.type === "group") {
      const on = node.mods.filter((m) => m.enabled).length;
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.description = `${node.mods.length}, ${on} on`;
      item.contextValue = "group";
      const check = node.label === "Frameworks" && !node.user ? this.frameworks() : undefined;
      if (check) {
        const summary = frameworkSummary(check);
        if (summary) item.description += ` · ${summary}`;
        item.tooltip = new vscode.MarkdownString(frameworkDetail(check).join("  \n"));
        if (check.changed || check.updates.length) item.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("editorWarning.foreground"));
      }
      return item;
    }
    if (node.type === "folder") {
      const item = new vscode.TreeItem(node.label || "(game folder)", vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `${node.mod.id}/${node.label}`;
      const lib = this.library();
      const sizes = lib ? modSize(lib, node.mod).files : undefined;
      const bytes = sizes ? node.files.reduce((n, f) => n + (sizes.get(f) ?? 0), 0) : 0;
      item.description = `${node.files.length} file${node.files.length === 1 ? "" : "s"} · ${formatBytes(bytes)}`;
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = "folder";
      item.tooltip = new vscode.MarkdownString([`**${node.label || "(game folder)"}**`, `${node.files.length} file${node.files.length === 1 ? "" : "s"} · ${formatBytes(bytes)}`, `From ${node.mod.name} ${node.mod.version}`.trim()].join("  \n"));
      return item;
    }
    if (node.type === "file") {
      const lib = this.library();
      const name = node.file.split("/").pop() ?? node.file;
      const item = new vscode.TreeItem(name, vscode.TreeItemCollapsibleState.None);
      item.id = `${node.mod.id}/${node.file}`;
      const sz = lib ? modSize(lib, node.mod) : undefined;
      const bytes = sz?.files.get(node.file) ?? 0;
      const when = sz?.mtimes.get(node.file);
      item.description = `${formatBytes(bytes)} · ${node.file.slice(0, -name.length - 1).replace(/^.*\//, "")}`;
      const ext = path.extname(name).toLowerCase();
      const kind = ({ ".archive": "REDengine archive", ".xl": "ArchiveXL config", ".reds": "redscript source", ".lua": "CET script", ".yaml": "TweakXL tweak", ".yml": "TweakXL tweak", ".tweak": "TweakXL tweak", ".dll": "RED4ext plugin or library", ".asi": "ASI plugin", ".json": "JSON", ".ini": "settings", ".txt": "text" } as Record<string, string>)[ext] ?? (ext ? `${ext.slice(1)} file` : "file");
      item.tooltip = new vscode.MarkdownString(
        [`**${name}**`, `${kind} · ${formatBytes(bytes)} (${bytes.toLocaleString()} bytes)`, when ? `Modified ${new Date(when).toLocaleString()}` : "", `Deploys to \`${node.file}\``, `From ${node.mod.name} ${node.mod.version}`.trim(), "Click to open the library copy. With hardlink deploy it is the same file as the one in the game folder."].filter(Boolean).join("  \n"),
      );
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
    const lib = this.library();
    const size = lib ? formatBytes(modSize(lib, mod).total) : "";
    item.description = [mod.version + (others > 1 ? ` (+${others - 1})` : ""), size, status].filter(Boolean).join("  ·  ");
    item.tooltip = new vscode.MarkdownString(
      [
        `**${mod.name}** ${mod.version}${others > 1 ? ` (${others} versions in the library)` : ""}`,
        `${mod.kinds.join(", ")} · ${mod.files.length} files · ${size} in the library`,
        `Added ${new Date(mod.added).toLocaleString()}`,
        mod.source.type === "nexus" || mod.source.modId ? `Nexus mod ${mod.source.modId}${mod.nexus?.author ? ` by ${mod.nexus.author}` : ""}${mod.nexus?.checked ? ` · checked ${mod.nexus.checked.slice(0, 10)}` : ""}` : mod.source.type === "vortex" ? "Imported from Vortex" : mod.source.type === "project" ? `REDcode project ${mod.source.path ?? ""}` : mod.source.path ? `From ${mod.source.path}` : "",
        status ? `Status: ${status}` : "",
        "Click for details. Expand for folders and files.",
      ].filter(Boolean).join("  \n"),
    );
    item.contextValue = "mod";
    item.command = { command: "edgedeck.details", title: "Details", arguments: [node] };
    item.checkboxState = mod.enabled ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
    const icon = status.includes("conflict") ? "warning" : status.includes("changed") ? "edit" : "package";
    const color = status.includes("conflict") || status.includes("changed") ? "editorWarning.foreground" : mod.enabled ? "edgedeck.accent" : "disabledForeground";
    item.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
    return item;
  }
}
