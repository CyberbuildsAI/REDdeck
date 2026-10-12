// The conflicts panel: one page with every conflict between the enabled mods, by file path and
// inside archives, who wins, and a button to change it. Opened from the deploy toast's
// "Show conflicts" button and from the Show conflicts command.

import * as vscode from "vscode";
import type { ArchiveConflictSummary } from "./conflicts";
import type { Conflict } from "./deploy";

export interface ConflictsData {
  fileConflicts: Conflict[];
  archive: ArchiveConflictSummary | undefined;
  /** Mod id to display name. */
  names: Map<string, string>;
  /** Whether REDbridge is available, for the archive section's note. */
  bridge: boolean;
  /** True while the archive scan is running. */
  scanning: boolean;
}

export interface ConflictsMessage {
  action: "letWin" | "toggle" | "details";
  id: string;
  /** For letWin: the mod the id should be placed above. */
  over?: string;
}

export class ConflictsPanel {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly onMessage: (m: ConflictsMessage) => void) {}

  get open(): boolean {
    return this.panel !== undefined;
  }

  show(data: ConflictsData): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("reddeck.conflicts", "Conflicts", { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, { enableScripts: true });
      this.panel.onDidDispose(() => (this.panel = undefined));
      this.panel.webview.onDidReceiveMessage((m: ConflictsMessage) => this.onMessage(m));
    }
    this.panel.webview.html = render(data, this.panel.webview.cspSource);
    this.panel.reveal(undefined, false);
  }

  /** Re-renders if open. */
  update(data: ConflictsData): void {
    if (this.panel) this.panel.webview.html = render(data, this.panel.webview.cspSource);
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function render(d: ConflictsData, csp: string): string {
  const nonce = Math.random().toString(36).slice(2);
  const name = (id: string) => esc(d.names.get(id) ?? id);
  const btn = (m: ConflictsMessage, label: string, cls = "") => `<button class="${cls}" data-msg='${esc(JSON.stringify(m))}'>${label}</button>`;

  // By file path: one row per file.
  const fileRows = d.fileConflicts
    .map(
      (c) =>
        `<tr><td class="mono">${esc(c.path)}</td><td><span class="ok">${name(c.winner)}</span></td><td>${c.losers.map(name).join(", ")}</td><td class="acts">${c.losers
          .map((l) => btn({ action: "letWin", id: l, over: c.winner }, `Let ${name(l)} win`))
          .join("")}${[c.winner, ...c.losers].map((m) => btn({ action: "toggle", id: m }, `Turn off ${name(m)}`, "quiet")).join("")}</td></tr>`,
    )
    .join("");

  // Inside archives: grouped by winner and loser, since two texture mods can share hundreds of resources.
  const groups = new Map<string, { winner: string; loser: string; resources: string[] }>();
  for (const c of d.archive?.conflicts ?? []) {
    const winner = c.mods[0];
    for (const loser of c.mods.slice(1)) {
      const k = `${winner}|${loser}`;
      const g = groups.get(k) ?? { winner, loser, resources: [] };
      g.resources.push(c.resource);
      groups.set(k, g);
    }
  }
  const archiveRows = [...groups.values()]
    .sort((a, b) => b.resources.length - a.resources.length)
    .map(
      (g) =>
        `<tr><td><details><summary>${g.resources.length} resource${g.resources.length === 1 ? "" : "s"}</summary><ul>${g.resources
          .slice(0, 200)
          .map((r) => `<li class="mono">${esc(r)}</li>`)
          .join("")}${g.resources.length > 200 ? `<li class="dim">and ${g.resources.length - 200} more</li>` : ""}</ul></details></td><td><span class="ok">${name(g.winner)}</span></td><td>${name(g.loser)}</td><td class="acts">${btn({ action: "letWin", id: g.loser, over: g.winner }, `Let ${name(g.loser)} win`)}${btn({ action: "toggle", id: g.winner }, `Turn off ${name(g.winner)}`, "quiet")}${btn({ action: "toggle", id: g.loser }, `Turn off ${name(g.loser)}`, "quiet")}</td></tr>`,
    )
    .join("");
  const archiveNote = d.scanning
    ? `<p class="dim">Checking the archives...</p>`
    : !d.bridge
      ? `<p class="dim">Conflicts inside .archive files need REDbridge. Set <span class="mono">reddeck.bridgePath</span> to REDbridge.exe to see which resources overlap between mods.</p>`
      : !d.archive
        ? `<p class="dim">Not checked yet.</p>`
        : archiveRows
          ? `<table><thead><tr><th>What overlaps</th><th>Wins</th><th>Loses</th><th></th></tr></thead><tbody>${archiveRows}</tbody></table>`
          : `<p class="dim">No resource inside any enabled mod's archives overlaps with another mod.</p>`;

  const total = d.fileConflicts.length + groups.size;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${csp}; script-src 'nonce-${nonce}';">
<style>
:root { --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --dim: var(--vscode-descriptionForeground); --line: var(--vscode-widget-border, #262c3d); --yellow: #fcee0a; --cyan: #19f3ff; --green: #5dffa1; --red: #ff2a52; }
body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--fg); background: var(--bg); padding: 16px 20px; max-width: 1100px; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: .02em; text-transform: uppercase; } h1 span { color: var(--yellow); }
h2 { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--cyan); margin: 22px 0 8px; }
p.lead { margin: 6px 0 14px; color: var(--dim); max-width: 760px; }
button { font: inherit; font-size: 12px; background: transparent; color: var(--fg); border: 1px solid var(--line); padding: 3px 10px; cursor: pointer; margin: 2px 4px 2px 0; white-space: nowrap; }
button:hover { border-color: var(--yellow); color: var(--yellow); }
button.quiet { color: var(--dim); } button.quiet:hover { border-color: var(--red); color: var(--red); }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); font-weight: 500; }
td.acts { width: 1%; }
.mono { font-family: var(--vscode-editor-font-family); font-size: 12px; } .dim { color: var(--dim); } .ok { color: var(--green); }
details summary { cursor: pointer; } ul { margin: 4px 0 8px 18px; padding: 0; } li { list-style: none; }
</style></head><body>
<h1>Conflicts <span>${total}</span></h1>
<p class="lead">Two mods want the same thing. The one higher in the Mods list wins, and that is usually fine: the later mod is often a patch for the earlier one. To change a winner, press "Let ... win", which moves that mod just above the other, or turn one of them off. Deploy again to make it real.</p>
<h2>By file path</h2>
${fileRows ? `<table><thead><tr><th>File</th><th>Wins</th><th>Loses</th><th></th></tr></thead><tbody>${fileRows}</tbody></table>` : `<p class="dim">No two enabled mods deploy the same file path.</p>`}
<h2>Inside archives</h2>
${archiveNote}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  for (const b of document.querySelectorAll("button[data-msg]")) b.addEventListener("click", () => vscode.postMessage(JSON.parse(b.dataset.msg)));
</script>
</body></html>`;
}
