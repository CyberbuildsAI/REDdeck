// The detail panel: one webview in the editor area showing a mod's files, status and conflicts,
// with the same four verbs as the list. HUD style, same tokens as the docs site.

import * as vscode from "vscode";
import type { ArchiveConflictSummary } from "./conflicts";
import type { Plan } from "./deploy";
import type { ModInfo } from "./library";

export interface DetailData {
  mod: ModInfo;
  status: string;
  plan: Plan | undefined;
  archive: ArchiveConflictSummary | undefined;
  names: Map<string, string>;
  bridge: string;
  /** A version on Nexus newer than every version of this mod in the library. */
  update?: string;
  /** This mod's versions in the library, newest first. */
  versions: { id: string; version: string; enabled: boolean }[];
  /** Bytes per file and in all. */
  size: { total: number; files: Map<string, number> };
}

function fmt(n: number): string {
  return n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`;
}

export class DetailPanel {
  private panel: vscode.WebviewPanel | undefined;
  private current: string | undefined;

  constructor(private readonly onAction: (action: string, id: string) => void) {}

  get modId(): string | undefined {
    return this.panel ? this.current : undefined;
  }

  show(data: DetailData): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("reddeck.detail", data.mod.name, { viewColumn: vscode.ViewColumn.Active, preserveFocus: true }, { enableScripts: true });
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.current = undefined;
      });
      this.panel.webview.onDidReceiveMessage((m: { action: string; id: string }) => this.onAction(m.action, m.id));
    }
    this.current = data.mod.id;
    this.panel.title = data.mod.name;
    this.panel.webview.html = render(data, this.panel.webview.cspSource);
    this.panel.reveal(undefined, true);
  }

  /** Re-renders if the panel shows this mod. */
  update(data: DetailData): void {
    if (this.panel && this.current === data.mod.id) {
      this.panel.title = data.mod.name;
      this.panel.webview.html = render(data, this.panel.webview.cspSource);
    }
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function render(d: DetailData, csp: string): string {
  const { mod } = d;
  const nonce = Math.random().toString(36).slice(2);
  const name = (id: string) => esc(d.names.get(id) ?? id);
  const fileConflicts = (d.plan?.conflicts ?? []).filter((c) => c.winner === mod.id || c.losers.includes(mod.id));
  const archive = d.archive;
  const archiveRows = archive
    ? archive.conflicts.filter((c) => c.mods.includes(mod.id)).map((c) => {
        const winner = c.mods[0];
        const others = c.mods.filter((m) => m !== mod.id).map(name).join(", ");
        const verdict = winner === mod.id ? `<span class="ok">this mod wins</span> over ${others}` : `<span class="warn">${name(winner)} wins</span>`;
        return `<tr><td class="mono">${esc(c.resource)}</td><td>${verdict}</td></tr>`;
      })
    : [];
  const groups = new Map<string, string[]>();
  for (const f of mod.files) {
    const top = f.split("/").slice(0, f.startsWith("bin/x64/plugins/cyber_engine_tweaks/mods/") ? 5 : f.startsWith("archive/") ? 3 : 2).join("/");
    groups.set(top, [...(groups.get(top) ?? []), f]);
  }
  const fileRows = [...groups.entries()]
    .map(([top, files]) => `<details ${files.length <= 12 ? "open" : ""}><summary><span class="mono">${esc(top)}/</span> <span class="dim">${files.length} file${files.length === 1 ? "" : "s"}, ${fmt(files.reduce((n, f) => n + (d.size.files.get(f) ?? 0), 0))}</span></summary><ul>${files.map((f) => `<li class="mono">${esc(f.slice(top.length + 1))} <span class="dim">${fmt(d.size.files.get(f) ?? 0)}</span></li>`).join("")}</ul></details>`)
    .join("");
  const fileConflictRows = fileConflicts
    .map((c) => {
      const win = c.winner === mod.id;
      return `<tr><td class="mono">${esc(c.path)}</td><td>${win ? `<span class="ok">this mod wins</span> over ${c.losers.map(name).join(", ")}` : `<span class="warn">${name(c.winner)} wins</span>`}</td></tr>`;
    })
    .join("");
  const source = mod.source.type === "nexus" ? `Nexus mod ${mod.source.modId}` : mod.source.type === "vortex" ? `imported from Vortex${mod.source.modId ? ` (Nexus mod ${mod.source.modId})` : ""}` : mod.source.path ? `${mod.source.type}: ${esc(mod.source.path)}` : mod.source.type;
  const update = d.update;
  const versionsLine = d.versions.length > 1 ? `<div class="dim">Versions in the library: ${d.versions.map((v) => (v.id === mod.id ? `<b>${esc(v.version)}</b> (this one)` : `${esc(v.version)}${v.enabled ? " (on)" : ""}`)).join(", ")}. Pick one from the version list on the REDdeck page.</div>` : "";
  const nexusLine = mod.source.modId
    ? `<div class="dim">Nexus mod ${mod.source.modId}${mod.nexus?.author ? ` by ${esc(mod.nexus.author)}` : ""}${mod.nexus?.checked ? `, checked ${esc(mod.nexus.checked.slice(0, 10))}` : ""}. ${update ? `<span class="warn">Version ${esc(update)} is on Nexus.</span>` : mod.nexus ? "Up to date." : "Not checked yet."}</div>${mod.nexus?.summary ? `<p class="dim">${esc(mod.nexus.summary)}</p>` : ""}`
    : "";
  const archiveNote = !archive
    ? `<p class="dim">${d.bridge ? "Checking archives..." : "Conflicts inside .archive files need REDbridge. Run <span class='mono'>REDdeck: Get REDbridge</span> once and REDdeck fetches it."}</p>`
    : archiveRows.length
      ? `<table><thead><tr><th>Resource inside the archives</th><th>Who wins</th></tr></thead><tbody>${archiveRows.join("")}</tbody></table>`
      : `<p class="dim">No resource inside this mod's archives overlaps with another enabled mod.</p>`;

  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${csp}; script-src 'nonce-${nonce}';">
<style>
:root { --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --dim: var(--vscode-descriptionForeground); --line: var(--vscode-widget-border, #262c3d); --yellow: #fcee0a; --cyan: #19f3ff; --green: #5dffa1; --red: #ff2a52; }
body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--fg); background: var(--bg); padding: 16px 20px; max-width: 980px; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: .02em; text-transform: uppercase; } h1 span { color: var(--yellow); }
h2 { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--cyan); margin: 22px 0 8px; }
.meta { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 14px; }
.chip { font-family: var(--vscode-editor-font-family); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; padding: 2px 8px; border: 1px solid var(--line); color: var(--dim); }
.chip.on { color: var(--yellow); border-color: var(--yellow); }
.bar { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0; }
button { font: inherit; background: transparent; color: var(--fg); border: 1px solid var(--line); padding: 5px 12px; cursor: pointer; }
button:hover { border-color: var(--yellow); color: var(--yellow); }
button.danger:hover { border-color: var(--red); color: var(--red); }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); font-weight: 500; }
.mono { font-family: var(--vscode-editor-font-family); font-size: 12px; } .dim { color: var(--dim); } .ok { color: var(--green); } .warn { color: var(--yellow); }
details { margin: 4px 0; } summary { cursor: pointer; } ul { margin: 4px 0 8px 18px; padding: 0; } li { list-style: none; }
.status { font-size: 14px; }
</style></head><body>
<h1>${esc(mod.name)} <span>${esc(mod.version)}</span></h1>
<div class="status">${esc(d.status)}${d.names.size ? "" : ""}</div>
<div class="meta">${[...mod.kinds].sort((a, b) => (a === "framework" ? -1 : b === "framework" ? 1 : 0)).map((k) => `<span class="chip ${k === "framework" ? "on" : ""}">${k}</span>`).join("")}<span class="chip">${mod.files.length} files</span><span class="chip">${fmt(d.size.total)}</span><span class="chip ${mod.enabled ? "on" : ""}">${mod.enabled ? "on" : "off"}</span></div>
<div class="dim">${source}. Added ${esc(mod.added.slice(0, 10))}.</div>
${versionsLine}
${nexusLine}
<div class="bar">
  <button data-action="toggle">${mod.enabled ? "Turn off" : "Turn on"}</button>
  <button data-action="moveUp" title="Wins conflicts against the mods below it">Move up</button>
  <button data-action="moveDown">Move down</button>
  <button data-action="open">Open folder</button>
  ${mod.source.modId ? `<button data-action="nexus">Open on Nexus</button>` : ""}
  ${update ? `<button data-action="update" title="Download it from Nexus and put it in this mod's place">Update to ${esc(update)}</button>` : ""}
  <button data-action="remove" class="danger">Remove</button>
</div>
<h2>Conflicts by file path</h2>
${fileConflictRows ? `<table><thead><tr><th>File</th><th>Who wins</th></tr></thead><tbody>${fileConflictRows}</tbody></table>` : `<p class="dim">No other enabled mod deploys the same file paths.</p>`}
<h2>Conflicts inside archives</h2>
${archiveNote}
<h2>Files</h2>
${fileRows || `<p class="dim">No files.</p>`}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  for (const b of document.querySelectorAll("button[data-action]")) b.addEventListener("click", () => vscode.postMessage({ action: b.dataset.action, id: ${JSON.stringify(mod.id)} }));
</script>
</body></html>`;
}
