// The changes panel: every file a deploy would add, replace, put back, relink or remove, with
// the reason. For inspecting a deployment before pressing the button, or chasing a file problem.
// Opened from a mod's status on the EDGEdeck page (filtered to that mod), from the change count
// next to Deploy, or from the Show pending changes command.

import * as vscode from "vscode";
import type { PendingChange } from "./deploy";

export interface ChangesData {
  rows: (PendingChange & { modName: string; prevName?: string })[];
  /** Mod id to start filtered on, or undefined for all. */
  filterMod?: string;
  method: "link" | "copy";
}

export interface ChangesMessage {
  action: "deploy" | "details";
  id?: string;
}

const KindLabels: Record<PendingChange["kind"], string> = { add: "Add", replace: "Replace", restore: "Put back", relink: "Relink", remove: "Remove" };

export class ChangesPanel {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly onMessage: (m: ChangesMessage) => void) {}

  get open(): boolean {
    return this.panel !== undefined;
  }

  show(data: ChangesData): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("edgedeck.changes", "Pending changes", { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, { enableScripts: true });
      this.panel.onDidDispose(() => (this.panel = undefined));
      this.panel.webview.onDidReceiveMessage((m: ChangesMessage) => this.onMessage(m));
    }
    this.panel.webview.html = render(data, this.panel.webview.cspSource);
    this.panel.reveal(undefined, false);
  }

  /** Re-renders if open, keeping whatever filter the page had. */
  update(data: ChangesData): void {
    if (this.panel) this.panel.webview.html = render({ ...data, filterMod: undefined }, this.panel.webview.cspSource);
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function render(d: ChangesData, csp: string): string {
  const nonce = Math.random().toString(36).slice(2);
  const msg = (m: ChangesMessage) => esc(JSON.stringify(m));
  const byMod = new Map<string, { name: string; n: number }>();
  const byKind = new Map<string, number>();
  for (const r of d.rows) {
    byMod.set(r.mod, { name: r.modName, n: (byMod.get(r.mod)?.n ?? 0) + 1 });
    byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
  }
  const modChips = [...byMod.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, v]) => `<button class="chip" data-mod="${esc(id)}">${esc(v.name)} <b>${v.n}</b></button>`).join("");
  const kindChips = (Object.keys(KindLabels) as PendingChange["kind"][]).filter((k) => byKind.get(k)).map((k) => `<button class="chip" data-kind="${k}">${KindLabels[k]} <b>${byKind.get(k)}</b></button>`).join("");
  const rows = d.rows
    .map(
      (r) =>
        `<tr data-mod="${esc(r.mod)}" data-kind="${r.kind}" data-text="${esc(`${r.path} ${r.modName} ${r.detail}`.toLowerCase())}"><td><span class="k ${r.kind}">${KindLabels[r.kind]}</span></td><td class="mono">${esc(r.path)}</td><td><a data-msg='${msg({ action: "details", id: r.mod })}'>${esc(r.modName)}</a></td><td class="dim">${esc(r.detail)}${r.prevName ? ` <span class="fg">${esc(r.prevName)}</span>` : ""}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${csp}; script-src 'nonce-${nonce}';">
<style>
:root { --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --dim: var(--vscode-descriptionForeground); --line: var(--vscode-widget-border, #262c3d); --yellow: #fcee0a; --cyan: #19f3ff; --green: #5dffa1; --red: #ff2a52; --ink: #0b0d12; }
/* Light themes: the HUD accents darkened so they read on white. */
body.vscode-light, body.vscode-high-contrast-light { --yellow: #7a6a00; --cyan: #00727a; --green: #17803d; --red: #c4002b; --ink: #ffffff; }
body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--fg); background: var(--bg); padding: 16px 20px 24px; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: .02em; text-transform: uppercase; } h1 span { color: var(--yellow); }
p.lead { margin: 6px 0 14px; color: var(--dim); max-width: 820px; }
.bar { display: flex; align-items: center; gap: 12px; margin: 0 0 14px; flex-wrap: wrap; }
button { font: inherit; font-size: 12px; background: transparent; color: var(--fg); border: 1px solid var(--line); padding: 5px 12px; cursor: pointer; white-space: nowrap; }
button:hover { border-color: var(--yellow); color: var(--yellow); }
button.deploy { background: var(--yellow); color: var(--ink); border-color: var(--yellow); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; } button.deploy:hover { background: transparent; color: var(--yellow); }
.filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }
input[type=search] { font: inherit; color: var(--fg); background: var(--vscode-input-background, transparent); border: 1px solid var(--vscode-input-border, var(--line)); padding: 5px 10px; min-width: 240px; } input[type=search]:focus { outline: none; border-color: var(--yellow); }
.chip { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; padding: 3px 9px; color: var(--dim); } .chip b { font-weight: 500; color: var(--fg); margin-left: 3px; }
.chip.active { color: var(--yellow); border-color: var(--yellow); } .chip.active b { color: var(--yellow); }
.sep { color: var(--line); margin: 0 4px; }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); font-weight: 500; }
.k { font-family: var(--vscode-editor-font-family); font-size: 10px; letter-spacing: .08em; text-transform: uppercase; padding: 1px 6px; border: 1px solid var(--line); white-space: nowrap; }
.k.add { color: var(--green); border-color: var(--green); } .k.replace, .k.relink { color: var(--cyan); border-color: var(--cyan); } .k.restore { color: var(--yellow); border-color: var(--yellow); } .k.remove { color: var(--red); border-color: var(--red); }
.mono { font-family: var(--vscode-editor-font-family); font-size: 12px; } .dim { color: var(--dim); } .fg { color: var(--fg); }
td a { cursor: pointer; color: var(--fg); } td a:hover { color: var(--yellow); text-decoration: underline; }
.empty { padding: 24px 8px; color: var(--dim); }
</style></head><body>
<h1>Pending changes <span>${d.rows.length}</span></h1>
<p class="lead">What the next deploy does to the game folder, file by file, and why. ${d.method === "link" ? "Files are hardlinked from the library, so a deployed file and its library copy are the same file." : "Files are copied from the library."} Nothing here has happened yet.</p>
<div class="bar">${d.rows.length ? `<button class="deploy" data-msg='${msg({ action: "deploy" })}'>Deploy now</button>` : `<span class="dim">The game folder matches the library. Nothing to deploy.</span>`}</div>
${d.rows.length ? `<div class="filters"><input type="search" id="q" placeholder="Search path, mod or reason" autocomplete="off"><button class="chip" data-mod="">All mods</button>${modChips}<span class="sep">|</span>${kindChips}</div>
<table><thead><tr><th>Change</th><th>File</th><th>Mod</th><th>Why</th></tr></thead><tbody>${rows}</tbody></table><div class="empty" id="none" hidden>No change matches.</div>` : ""}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const state = Object.assign({ q: "", mod: ${JSON.stringify(d.filterMod ?? "")}, kind: "" }, ${d.filterMod ? "{}" : "vscode.getState() || {}"});
  if (${JSON.stringify(!!d.filterMod)}) state.mod = ${JSON.stringify(d.filterMod ?? "")};
  const q = document.getElementById("q");
  const rows = [...document.querySelectorAll("tr[data-mod]")];
  function apply() {
    const needle = state.q.trim().toLowerCase();
    let shown = 0;
    for (const r of rows) {
      const ok = (!state.mod || r.dataset.mod === state.mod) && (!state.kind || r.dataset.kind === state.kind) && (!needle || r.dataset.text.includes(needle));
      r.hidden = !ok; if (ok) shown++;
    }
    for (const c of document.querySelectorAll(".chip[data-mod]")) c.classList.toggle("active", c.dataset.mod === state.mod);
    for (const c of document.querySelectorAll(".chip[data-kind]")) c.classList.toggle("active", c.dataset.kind === state.kind);
    const none = document.getElementById("none"); if (none) none.hidden = shown > 0 || rows.length === 0;
    vscode.setState(state);
  }
  if (q) { q.value = state.q; q.addEventListener("input", () => { state.q = q.value; apply(); }); }
  for (const c of document.querySelectorAll(".chip[data-mod]")) c.addEventListener("click", () => { state.mod = c.dataset.mod; apply(); });
  for (const c of document.querySelectorAll(".chip[data-kind]")) c.addEventListener("click", () => { state.kind = state.kind === c.dataset.kind ? "" : c.dataset.kind; apply(); });
  for (const b of document.querySelectorAll("[data-msg]")) b.addEventListener("click", () => vscode.postMessage(JSON.parse(b.dataset.msg)));
  apply();
</script>
</body></html>`;
}
