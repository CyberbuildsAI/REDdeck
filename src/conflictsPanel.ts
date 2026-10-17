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
  /** The bridge's version line once it has answered. */
  bridgeInfo?: string;
  /** True while the archive scan is running. */
  scanning: boolean;
  /** How many files a deploy would add or remove right now; zero means the game folder is current. */
  pending: number;
  /** Mod id to its family key and version, to tell two versions of one mod from two mods. */
  family: Map<string, string>;
  versions: Map<string, string>;
  /** What the last choice on this page did, shown until the next one. */
  note?: string;
}

export interface ConflictsMessage {
  /** useOnly: make this version its family's only one on (the others go off). */
  action: "letWin" | "toggle" | "useOnly" | "details" | "deploy" | "getBridge";
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
      this.panel = vscode.window.createWebviewPanel("edgedeck.conflicts", "Conflicts", { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, { enableScripts: true });
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
  const label = (id: string) => {
    const v = d.versions.get(id);
    return v ? `${name(id)} <span class="dim">${esc(v)}</span>` : name(id);
  };
  // One dropdown per pair of mods: a choice settles every file the pair shares, so it is offered once.
  // Choosing an entry acts at once; the note above the table then says what it did.
  const menu = (entries: { m: ConflictsMessage; label: string }[]) =>
    `<select class="resolve"><option value="">Choose...</option>${entries.map((e) => `<option value='${esc(JSON.stringify(e.m))}'>${e.label}</option>`).join("")}</select>`;
  const sameMod = (ids: string[]) => ids.every((id) => d.family.get(id) && d.family.get(id) === d.family.get(ids[0]));
  const fileList = (paths: string[], what: string) =>
    `<details><summary>${paths.length} ${what}${paths.length === 1 ? "" : "s"}</summary><ul>${paths
      .slice(0, 200)
      .map((p) => `<li class="mono">${esc(p)}</li>`)
      .join("")}${paths.length > 200 ? `<li class="dim">and ${paths.length - 200} more</li>` : ""}</ul></details>`;

  // By file path: one row per winner and losers, with the files inside.
  const pairs = new Map<string, { winner: string; losers: string[]; paths: string[] }>();
  for (const c of d.fileConflicts) {
    const k = `${c.winner}|${[...c.losers].sort().join(",")}`;
    const g = pairs.get(k) ?? { winner: c.winner, losers: c.losers, paths: [] };
    g.paths.push(c.path);
    pairs.set(k, g);
  }
  const fileRows = [...pairs.values()]
    .sort((a, b) => b.paths.length - a.paths.length)
    .map((g) => {
      const ids = [g.winner, ...g.losers];
      const twoVersions = sameMod(ids);
      const entries = twoVersions
        ? ids.map((id) => ({ m: { action: "useOnly" as const, id }, label: `Use only ${name(id)} ${esc(d.versions.get(id) ?? "")}` }))
        : [
            ...g.losers.map((l) => ({ m: { action: "letWin" as const, id: l, over: g.winner }, label: `Let ${name(l)} win` })),
            ...ids.map((m) => ({ m: { action: "toggle" as const, id: m }, label: `Turn off ${name(m)}` })),
          ];
      const what = twoVersions ? `<div class="warn">Two versions of the same mod are on</div>` : "";
      return `<tr><td>${what}${fileList(g.paths, "file")}</td><td><span class="ok">${label(g.winner)}</span></td><td>${g.losers.map(label).join(", ")}</td><td class="acts">${menu(entries)}</td></tr>`;
    })
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
          .join("")}${g.resources.length > 200 ? `<li class="dim">and ${g.resources.length - 200} more</li>` : ""}</ul></details></td><td><span class="ok">${name(g.winner)}</span></td><td>${name(g.loser)}</td><td class="acts">${menu([
          ...(sameMod([g.winner, g.loser])
            ? [
                { m: { action: "useOnly" as const, id: g.winner }, label: `Use only ${name(g.winner)} ${esc(d.versions.get(g.winner) ?? "")}` },
                { m: { action: "useOnly" as const, id: g.loser }, label: `Use only ${name(g.loser)} ${esc(d.versions.get(g.loser) ?? "")}` },
              ]
            : [
                { m: { action: "letWin" as const, id: g.loser, over: g.winner }, label: `Let ${name(g.loser)} win` },
                { m: { action: "toggle" as const, id: g.winner }, label: `Turn off ${name(g.winner)}` },
                { m: { action: "toggle" as const, id: g.loser }, label: `Turn off ${name(g.loser)}` },
              ]),
        ])}</td></tr>`,
    )
    .join("");
  const archiveNote = d.scanning
    ? `<p class="dim">Checking the archives...</p>`
    : !d.bridge
      ? `<p class="dim">Conflicts inside .archive files need REDbridge. <button class="get" data-msg='${esc(JSON.stringify({ action: "getBridge", id: "" }))}'>Get REDbridge</button> fetches it into EDGEdeck's own folder; nothing to configure.</p>`
      : !d.archive
        ? `<p class="dim">Not checked yet.</p>`
        : archiveRows
          ? `<table><thead><tr><th>What overlaps</th><th>Wins</th><th>Loses</th><th></th></tr></thead><tbody>${archiveRows}</tbody></table>`
          : `<p class="dim">No resource inside any enabled mod's archives overlaps with another mod.</p>`;

  const total = pairs.size + groups.size;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${csp}; script-src 'nonce-${nonce}';">
<style>
:root { --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --dim: var(--vscode-descriptionForeground); --line: var(--vscode-widget-border, #262c3d); --yellow: #fcee0a; --cyan: #19f3ff; --green: #5dffa1; --red: #ff2a52; --ink: #0b0d12; }
/* Light themes: the HUD accents darkened so they read on white. */
body.vscode-light, body.vscode-high-contrast-light { --yellow: #7a6a00; --cyan: #00727a; --green: #17803d; --red: #c4002b; --ink: #ffffff; }
body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--fg); background: var(--bg); padding: 16px 20px; max-width: 1100px; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: .02em; text-transform: uppercase; } h1 span { color: var(--yellow); }
h2 { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--cyan); margin: 22px 0 8px; }
p.lead { margin: 6px 0 14px; color: var(--dim); max-width: 760px; }
button.get { font: inherit; font-size: 12px; background: transparent; color: var(--yellow); border: 1px solid var(--yellow); padding: 3px 10px; cursor: pointer; margin-left: 6px; } button.get:hover { background: var(--yellow); color: #0b0d12; }
.via { color: var(--dim); letter-spacing: 0; text-transform: none; font-size: 11px; margin-left: 8px; }
.bar { display: flex; align-items: center; gap: 12px; margin: 0 0 16px; }
button.deploy { font: inherit; font-size: 13px; background: var(--yellow); color: var(--ink); border: 1px solid var(--yellow); padding: 5px 16px; cursor: pointer; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
button.deploy:hover { background: transparent; color: var(--yellow); }
select.resolve { font: inherit; font-size: 12px; color: var(--fg); background: var(--vscode-dropdown-background, var(--bg)); border: 1px solid var(--vscode-dropdown-border, var(--line)); padding: 3px 8px; cursor: pointer; min-width: 150px; }
select.resolve:hover, select.resolve:focus { border-color: var(--yellow); outline: none; }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); font-weight: 500; }
td.acts { width: 1%; }
.mono { font-family: var(--vscode-editor-font-family); font-size: 12px; } .dim { color: var(--dim); } .ok { color: var(--green); }
.warn { color: var(--yellow); font-size: 12px; margin-bottom: 2px; }
p.note { margin: 0 0 14px; padding: 6px 10px; border-left: 3px solid var(--green); color: var(--fg); }
details summary { cursor: pointer; } ul { margin: 4px 0 8px 18px; padding: 0; } li { list-style: none; }
</style></head><body>
<h1>Conflicts <span>${total}</span></h1>
<p class="lead">Two mods want the same thing. The one higher in the Mods list wins, and that is usually fine: the later mod is often a patch for the earlier one. Each row is one pair of mods and every file they share; its Choose menu settles all of them at once: "Let ... win" moves that mod just above the other, or turn one of them off. When the pair is two versions of the same mod, keep one. Then deploy to make it real.</p>
${d.note ? `<p class="note">${esc(d.note)}</p>` : ""}
<div class="bar">${d.pending ? `<button class="deploy" data-msg='${esc(JSON.stringify({ action: "deploy", id: "" }))}'>Deploy now</button><span class="dim">${d.pending} file${d.pending === 1 ? "" : "s"} to change in the game folder</span>` : `<span class="dim">The game folder is up to date with these choices.</span>`}</div>
<h2>By file path</h2>
${fileRows ? `<table><thead><tr><th>Files</th><th>Wins</th><th>Loses</th><th></th></tr></thead><tbody>${fileRows}</tbody></table>` : `<p class="dim">No two enabled mods deploy the same file path.</p>`}
<h2>Inside archives${d.bridgeInfo ? ` <span class="via">via ${esc(d.bridgeInfo)}</span>` : ""}</h2>
${archiveNote}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  for (const b of document.querySelectorAll("button[data-msg]")) b.addEventListener("click", () => vscode.postMessage(JSON.parse(b.dataset.msg)));
  for (const s of document.querySelectorAll("select.resolve")) s.addEventListener("change", () => { if (s.value) { vscode.postMessage(JSON.parse(s.value)); s.value = ""; } });
</script>
</body></html>`;
}
