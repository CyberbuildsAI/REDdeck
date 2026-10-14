// The mods page: the wide table from the design doc, in the editor area. Every mod with its
// version, kinds and status in columns, a search box, status facets, the verbs across the top and
// the library line at the bottom. The sidebar tree is the compact companion of this page.

import * as vscode from "vscode";

export interface PageRow {
  id: string;
  name: string;
  version: string;
  /** Every version of this mod in the library, newest first. */
  versions: { id: string; version: string; active: boolean }[];
  kinds: string[];
  enabled: boolean;
  /** The plain-words status phrase. */
  status: string;
  framework: boolean;
  deployed: boolean;
  /** Bytes in the library for the active version. */
  size: number;
  needsDeploy: boolean;
  changed: boolean;
  conflicts: number;
  update?: string;
  nexusId?: number;
}

export interface PageSection {
  name: string;
  /** A section of the user's own: it can be renamed, moved and deleted. */
  user: boolean;
  rows: PageRow[];
}

export interface PageData {
  rows: PageRow[];
  /** The rows grouped for display, in order: Frameworks, the user's sections, Mods. */
  sections: PageSection[];
  game: string;
  library: string;
  method: "link" | "copy";
  lastDeploy?: string;
  /** Files a deploy would add or remove. */
  pending: number;
  signedIn: boolean;
  /** "REDbridge 0.4.0 (WolvenKit 9.1.0)" once it has answered, or undefined when there is none. */
  bridge?: string;
  /** A newer REDbridge release the daily check found. */
  bridgeUpdate?: string;
  /** Library totals in bytes. */
  sizes: { mods: number; downloads: number; backups: number };
  vortex: boolean;
  /** The Frameworks group's note: the game version, whether it changed since the last deploy, updates. */
  frameworks?: { summary: string; detail: string; warn: boolean };
  /** Things not in place yet, each a button. */
  setup: { id: string; label: string; detail: string }[];
}

export interface PageMessage {
  action:
    | "setup" | "downloads" | "getBridge" | "changes" | "toggle" | "details" | "activate" | "moveUp" | "moveDown" | "open" | "nexus" | "update" | "remove" | "add" | "deploy" | "undo" | "updates" | "conflicts" | "signIn" | "library"
    | "sectionOn" | "newSection" | "renameSection" | "deleteSection" | "moveSection" | "pickSection" | "putIn" | "place";
  id?: string;
  /** The section a section action is about, or the one to put a mod in. */
  section?: string;
  /** sectionOn: on or off. */
  on?: boolean;
  /** moveSection: up or down. */
  delta?: -1 | 1;
  /** place: the mod to sit next to, and on which side. */
  target?: string;
  below?: boolean;
}

/** Small line icons for the row and section buttons, drawn in the current colour. */
const Icons: Record<string, string> = {
  details: '<circle cx="8" cy="8" r="6.2"/><path d="M8 7.2v4.3"/><path d="M8 4.6v.1"/>',
  up: '<path d="M8 13V3.5"/><path d="M4 7.5 8 3.5l4 4"/>',
  down: '<path d="M8 3v9.5"/><path d="M4 8.5l4 4 4-4"/>',
  section: '<path d="M8 2.2 14.3 5.5 8 8.8 1.7 5.5z"/><path d="M1.7 8.6 8 11.9l6.3-3.3"/>',
  folder: '<path d="M1.7 4.2v8.6h12.6V5.6H7.6L6.2 3.6H1.7z"/>',
  nexus: '<path d="M9.2 2.5h4.3v4.3"/><path d="M13.5 2.5 7.6 8.4"/><path d="M12 9.6v3.9H2.5V4h3.9"/>',
  remove: '<path d="M2.5 4.4h11"/><path d="M6 4.4V2.6h4v1.8"/><path d="M4 4.4l.7 9h6.6l.7-9"/><path d="M6.8 6.8v4.4M9.2 6.8v4.4"/>',
  rename: '<path d="M10.6 2.6l2.8 2.8-7.9 7.9H2.7v-2.8z"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${Icons[name]}</svg>`;

export class ModsPage {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly onMessage: (m: PageMessage) => void) {}

  get open(): boolean {
    return this.panel !== undefined;
  }

  show(data: PageData): void {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel("reddeck.page", "REDdeck", { viewColumn: vscode.ViewColumn.Active, preserveFocus: false }, { enableScripts: true, retainContextWhenHidden: true });
      this.panel.onDidDispose(() => (this.panel = undefined));
      this.panel.webview.onDidReceiveMessage((m: PageMessage) => this.onMessage(m));
    }
    this.panel.webview.html = render(data, this.panel.webview.cspSource);
    this.panel.reveal(undefined, false);
  }

  update(data: PageData): void {
    if (this.panel) this.panel.webview.html = render(data, this.panel.webview.cspSource);
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The facets a row belongs to, for the filter chips. */
function facetsOf(r: PageRow): string[] {
  const f = [r.enabled ? "on" : "off", r.deployed ? "deployed" : "notdeployed"];
  if (r.needsDeploy) f.push("needsdeploy");
  if (r.changed) f.push("changed");
  if (r.conflicts) f.push("conflicts");
  if (r.update) f.push("update");
  return f;
}

const FacetLabels: [string, string][] = [
  ["all", "All"],
  ["on", "On"],
  ["off", "Off"],
  ["deployed", "Deployed"],
  ["notdeployed", "Not deployed"],
  ["needsdeploy", "Needs deploy"],
  ["changed", "Changed in game folder"],
  ["conflicts", "Conflicts"],
  ["update", "Update available"],
];

const fmt = (n: number): string => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(n >= 10 * (1 << 30) ? 0 : 1)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(n >= 10 * (1 << 20) ? 0 : 1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);

function render(d: PageData, csp: string): string {
  const nonce = Math.random().toString(36).slice(2);
  const msg = (m: PageMessage) => esc(JSON.stringify(m));
  const counts = new Map<string, number>([["all", d.rows.length]]);
  for (const r of d.rows) for (const f of facetsOf(r)) counts.set(f, (counts.get(f) ?? 0) + 1);
  const chips = FacetLabels.filter(([k]) => k === "all" || k === "on" || k === "off" || (counts.get(k) ?? 0) > 0)
    .map(([k, label]) => `<button class="chip" data-facet="${k}">${label} <b>${counts.get(k) ?? 0}</b></button>`)
    .join("");

  const row = (r: PageRow, section: string, first: boolean, last: boolean) => {
    const statusClass = r.changed || r.conflicts ? "warn" : r.needsDeploy ? "pend" : r.deployed && r.enabled ? "ok" : "dim";
    const buttons = [
      { m: { action: "details", id: r.id }, icon: "details", title: "Details" },
      { m: { action: "moveUp", id: r.id }, icon: "up", title: "Move up: wins conflicts against the mod above", off: first },
      { m: { action: "moveDown", id: r.id }, icon: "down", title: "Move down", off: last },
      { m: { action: "pickSection", id: r.id }, icon: "section", title: "Put in a section" },
      { m: { action: "open", id: r.id }, icon: "folder", title: "Open its library folder" },
      // A mod not from Nexus keeps a blank slot, so the icons line up down the column.
      { m: { action: "nexus", id: r.id }, icon: "nexus", title: "Open on Nexus", cls: r.nexusId ? "" : "blank" },
      { m: { action: "remove", id: r.id }, icon: "remove", title: r.versions.length > 1 ? `Remove version ${r.version} from the library` : "Remove from the library", cls: "danger" },
    ] as { m: PageMessage; icon: string; title: string; off?: boolean; cls?: string }[];
    const text = `${r.name} ${r.versions.map((v) => v.version).join(" ")} ${r.kinds.join(" ")} ${r.status}`.toLowerCase();
    // The version cell: a dropdown when there is anything to choose, the version alone otherwise.
    const versionCell =
      r.versions.length > 1 || r.update
        ? `<select class="ver" title="Versions in the library; the chosen one takes this mod's place">${r.versions
            .map((v) => `<option value='${msg({ action: "activate", id: v.id })}' ${v.active ? "selected" : ""}>${esc(v.version || "(no version)")}</option>`)
            .join("")}${r.update ? `<option value='${msg({ action: "update", id: r.id })}' class="get">Get ${esc(r.update)} from Nexus</option>` : ""}</select>`
        : `<span class="mono">${esc(r.version)}</span>`;
    return `<tr draggable="true" data-id="${esc(r.id)}" data-group="${esc(section)}" data-facets="${facetsOf(r).join(" ")}" data-text="${esc(text)}" data-size="${r.size}" class="${r.enabled ? "" : "offrow"}">
<td class="chk"><input type="checkbox" ${r.enabled ? "checked" : ""} data-msg='${msg({ action: "toggle", id: r.id })}' title="${r.enabled ? "Turn off" : "Turn on"}"></td>
<td class="name"><a data-msg='${msg({ action: "details", id: r.id })}'>${esc(r.name)}</a></td>
<td class="vercell">${versionCell}</td>
<td>${[...r.kinds].sort((a, b) => (a === "framework" ? -1 : b === "framework" ? 1 : 0)).map((k) => `<span class="kind ${k === "framework" ? "fw" : ""}">${esc(k)}</span>`).join("")}</td>
<td class="mono size" data-size="${r.size}" title="${r.size.toLocaleString()} bytes in the library">${fmt(r.size)}</td>
<td class="${statusClass}">${r.needsDeploy || r.changed ? `<a class="st" data-msg='${msg({ action: "changes", id: r.id })}' title="What the next deploy does for this mod">${esc(r.status)}</a>` : esc(r.status)}${r.update ? `<a class="upd" data-msg='${msg({ action: "update", id: r.id })}' title="Download ${esc(r.update)} from Nexus and put it in this mod's place">update ${esc(r.update)} available</a>` : ""}</td>
<td class="acts">${buttons.map((b) => `<button class="ico ${b.cls ?? ""}" data-msg='${msg(b.m)}' title="${esc(b.title)}" aria-label="${esc(b.title)}" ${b.off ? "disabled" : ""}>${icon(b.icon)}</button>`).join("")}</td>
</tr>`;
  };
  const on = (rs: PageRow[]) => rs.filter((r) => r.enabled).length;
  const note = (s: PageSection) => (s.name === "Frameworks" && !s.user && d.frameworks ? ` <span class="fwnote ${d.frameworks.warn ? "warn" : ""}" title="${esc(d.frameworks.detail)}">${esc(d.frameworks.summary)}</span>` : "");
  const users = d.sections.filter((s) => s.user);
  const groupRow = (s: PageSection) => {
    const n = on(s.rows);
    const all = s.rows.length > 0 && n === s.rows.length;
    const some = n > 0 && !all;
    const tools = s.user
      ? ([
          { m: { action: "renameSection", section: s.name }, icon: "rename", title: "Rename this section" },
          { m: { action: "moveSection", section: s.name, delta: -1 }, icon: "up", title: "Move this section up", off: users[0] === s },
          { m: { action: "moveSection", section: s.name, delta: 1 }, icon: "down", title: "Move this section down", off: users[users.length - 1] === s },
          { m: { action: "deleteSection", section: s.name }, icon: "remove", title: "Delete this section; its mods go back to Mods", cls: "danger" },
        ] as { m: PageMessage; icon: string; title: string; off?: boolean; cls?: string }[])
          .map((b) => `<button class="ico ${b.cls ?? ""}" data-msg='${msg(b.m)}' title="${b.title}" aria-label="${b.title}" ${b.off ? "disabled" : ""}>${icon(b.icon)}</button>`)
          .join("")
      : "";
    const box = s.rows.length
      ? `<input type="checkbox" class="all" data-section="${esc(s.name)}" ${all ? "checked" : ""} data-some="${some ? 1 : 0}" title="${all ? "Turn off" : "Turn on"} every mod in ${esc(s.name)}">`
      : "";
    return `<tr class="group" data-groupfor="${esc(s.name)}"><td class="chk">${box}</td><td colspan="6"><div class="gline"><span class="glabel">${esc(s.name)}</span> <span class="dim">${s.rows.length}, ${n} on, ${fmt(s.rows.reduce((t, r) => t + r.size, 0))}</span>${note(s)}<span class="spacer"></span>${tools}</div></td></tr>`;
  };
  const body = d.sections
    .map((s) => groupRow(s) + (s.rows.length ? s.rows.map((r, i) => row(r, s.name, i === 0, i === s.rows.length - 1)).join("") : `<tr class="hint" data-hintfor="${esc(s.name)}"><td></td><td colspan="6">Empty. Drag mods here, or use a mod's section button.</td></tr>`))
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${csp}; script-src 'nonce-${nonce}';">
<style>
:root { --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --dim: var(--vscode-descriptionForeground); --line: var(--vscode-widget-border, #262c3d); --yellow: #fcee0a; --cyan: #19f3ff; --green: #5dffa1; --red: #ff2a52; --ink: #0b0d12; }
body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--fg); background: var(--bg); padding: 14px 20px 24px; }
.top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
h1 { font-size: 20px; margin: 0; letter-spacing: .02em; text-transform: uppercase; } h1 span { color: var(--yellow); } h1 small { font-size: 12px; color: var(--dim); text-transform: none; letter-spacing: 0; margin-left: 10px; }
.spacer { flex: 1; }
button { font: inherit; font-size: 12px; background: transparent; color: var(--fg); border: 1px solid var(--line); padding: 5px 12px; cursor: pointer; white-space: nowrap; }
button:hover { border-color: var(--yellow); color: var(--yellow); }
button.deploy { background: var(--yellow); color: var(--ink); border-color: var(--yellow); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
button.deploy:hover { background: transparent; color: var(--yellow); }
button.deploy.idle { background: transparent; color: var(--dim); border-color: var(--line); font-weight: 500; }
.filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0 0 10px; }
input[type=search] { font: inherit; color: var(--fg); background: var(--vscode-input-background, transparent); border: 1px solid var(--vscode-input-border, var(--line)); padding: 5px 10px; min-width: 260px; }
input[type=search]:focus { outline: none; border-color: var(--yellow); }
.chip { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; padding: 3px 9px; color: var(--dim); }
.chip b { font-weight: 500; color: var(--fg); margin-left: 3px; } .chip.active { color: var(--yellow); border-color: var(--yellow); } .chip.active b { color: var(--yellow); }
table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: middle; }
th { font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); font-weight: 500; }
tr.group td { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--cyan); padding-top: 14px; padding-bottom: 4px; border-bottom: 1px solid var(--line); }
td.chk, th.chk { width: 1%; } td.acts, th.acts { width: 1%; white-space: nowrap; } td.name a { cursor: pointer; color: var(--fg); } td.name a:hover { color: var(--yellow); text-decoration: underline; }
tr.offrow td.name a, tr.offrow td.mono { color: var(--dim); }
.kind { font-family: var(--vscode-editor-font-family); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; padding: 1px 6px; border: 1px solid var(--line); color: var(--dim); margin-right: 4px; } .kind.fw { color: var(--yellow); border-color: var(--yellow); }
.mono { font-family: var(--vscode-editor-font-family); font-size: 12px; } .dim { color: var(--dim); } .ok { color: var(--green); } .warn { color: var(--yellow); } .pend { color: var(--cyan); }
a.st { color: inherit; cursor: pointer; } a.st:hover { text-decoration: underline; }
a.changes { color: var(--yellow); cursor: pointer; font-size: 12px; } a.changes:hover { text-decoration: underline; }
td.size { text-align: right; white-space: nowrap; } th.size { text-align: right; }
.sep { color: var(--line); margin: 0 4px; }
.upd { display: block; color: var(--yellow); font-size: 12px; cursor: pointer; } .upd:hover { text-decoration: underline; }
select.ver { font-family: var(--vscode-editor-font-family); font-size: 12px; color: var(--fg); background: var(--vscode-dropdown-background, var(--bg)); border: 1px solid var(--vscode-dropdown-border, var(--line)); padding: 2px 6px; cursor: pointer; }
select.ver:hover, select.ver:focus { border-color: var(--yellow); outline: none; } select.ver option.get { color: var(--yellow); }
td.vercell { white-space: nowrap; }
button.ico { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 22px; padding: 0; border-color: transparent; color: var(--yellow); }
button.ico svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
button.ico:hover { border-color: var(--yellow); } button.ico.danger:hover { color: var(--red); border-color: var(--red); }
button.ico.blank { visibility: hidden; }
button.ico:disabled { color: var(--dim); opacity: .35; cursor: default; border-color: transparent; }
.gline { display: flex; align-items: center; gap: 6px; } .gline .glabel { color: var(--cyan); } .gline .dim, .gline .fwnote { letter-spacing: 0; text-transform: none; }
.gline button.ico { width: 22px; height: 20px; }
tr.hint td { color: var(--dim); font-style: italic; font-size: 12px; }
tr[draggable] { cursor: grab; } tr.dragging { opacity: .4; }
tr.dropabove td { box-shadow: inset 0 2px 0 var(--yellow); } tr.dropbelow td { box-shadow: inset 0 -2px 0 var(--yellow); }
tr.group.dropin td, tr.hint.dropin td { background: color-mix(in srgb, var(--yellow) 12%, transparent); }
th { position: relative; } .grip { position: absolute; top: 0; right: -3px; width: 7px; height: 100%; cursor: col-resize; z-index: 1; }
.grip:hover, .grip.on { background: linear-gradient(to right, transparent 3px, var(--yellow) 3px, var(--yellow) 4px, transparent 4px); }
table.fixed { table-layout: fixed; } table.fixed th { box-sizing: border-box; } table.fixed td { overflow: hidden; text-overflow: ellipsis; } table.fixed select.ver { max-width: 100%; }
input[type=checkbox] { accent-color: var(--yellow); width: 15px; height: 15px; cursor: pointer; }
.foot { margin-top: 14px; color: var(--dim); font-size: 12px; display: flex; gap: 18px; flex-wrap: wrap; } .foot a { cursor: pointer; color: var(--dim); text-decoration: underline; } .foot a:hover { color: var(--yellow); }
.fwnote { letter-spacing: 0; text-transform: none; color: var(--dim); margin-left: 10px; cursor: default; } .fwnote.warn { color: var(--yellow); }
.okdot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--green); margin-right: 6px; vertical-align: middle; }
.empty { padding: 24px 8px; color: var(--dim); }
.setup { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; color: var(--dim); }
.note { border: 1px solid var(--yellow); color: var(--yellow); padding: 8px 12px; margin-bottom: 12px; }
</style></head><body>
<div class="top">
  <h1>RED<span>deck</span><small>${esc(d.game)}</small></h1>
  <span class="spacer"></span>
  <button data-msg='${msg({ action: "add" })}'>+ Add mod</button>
  <button data-msg='${msg({ action: d.signedIn ? "updates" : "signIn" })}' title="${d.signedIn ? "Ask Nexus for newer files" : "Sign in to Nexus Mods"}">${d.signedIn ? "Check updates" : "Nexus sign in"}</button>
  <button data-msg='${msg({ action: "conflicts" })}'>Conflicts${d.rows.some((r) => r.conflicts) ? ` <b>${d.rows.filter((r) => r.conflicts).length}</b>` : ""}</button>
  ${d.lastDeploy ? `<button data-msg='${msg({ action: "undo" })}' title="Remove every deployed file and put backups back">Undo deploy</button>` : ""}
  ${d.pending ? `<a class="changes" data-msg='${msg({ action: "changes" })}' title="Every file the next deploy touches, and why">${d.pending} change${d.pending === 1 ? "" : "s"}</a>` : ""}
  <button class="deploy ${d.pending ? "" : "idle"}" data-msg='${msg({ action: "deploy" })}'>${d.pending ? "Deploy" : "Deployed"}</button>
</div>
${d.vortex ? `<div class="note">Vortex manages this game folder. Purge in Vortex before deploying with REDdeck.</div>` : ""}
${d.setup.length ? `<div class="setup"><span>Set up:</span>${d.setup.map((s) => `<button data-msg='${msg({ action: "setup", id: s.id })}' title="${esc(s.detail)}">${esc(s.label)}</button>`).join("")}</div>` : ""}
<div class="filters">
  <input type="search" id="q" placeholder="Search name, version, kind or status" autocomplete="off">
  ${chips}
  <span class="sep">|</span>
  <button class="chip" id="bysize" title="Biggest mods first, across every section">Largest first</button>
  <span class="spacer"></span>
  <button data-msg='${msg({ action: "newSection" })}' title="A section of your own to group mods in">+ Section</button>
</div>
${d.rows.length ? `<table class="mods"><thead><tr><th class="chk"></th><th>Mod</th><th>Ver</th><th>Kind</th><th class="size">Size</th><th>Status</th><th class="acts">Actions</th></tr></thead><tbody id="rows">${body}</tbody></table><div class="empty" id="none" hidden>No mod matches.</div>` : `<div class="empty">No mods yet. Press + Add mod, or import from Vortex from the Mods view menu.</div>`}
<div class="foot">
  <span>Library: <a data-msg='${msg({ action: "library" })}'>${esc(d.library)}</a> (${d.method === "link" ? "same drive as the game: hardlinks" : "other drive: copies"})</span>
  <span>Last deploy: ${d.lastDeploy ? esc(d.lastDeploy) : "never"}</span>
  <span title="Deployed files are hardlinks and take no extra space on the same drive">Disk: ${fmt(d.sizes.mods)} in mods, <a data-msg='${msg({ action: "downloads" })}' title="The original zips, kept so a mod can be added again. Safe to delete.">${fmt(d.sizes.downloads)} in kept downloads</a>${d.sizes.backups ? `, ${fmt(d.sizes.backups)} in deploy backups` : ""}</span>
  <span>${d.bridge ? `<span class="okdot"></span>${esc(d.bridge)}${d.bridgeUpdate ? ` · <a data-msg='${msg({ action: "getBridge" })}' title="Download it into REDdeck's folder; the old one is removed">${esc(d.bridgeUpdate)} available</a>` : ""}` : `No REDbridge: <a data-msg='${msg({ action: "getBridge" })}'>Get REDbridge</a> for conflicts inside archives`}</span>
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const state = Object.assign({ q: "", facet: "all", bySize: false, widths: null }, vscode.getState() || {});
  const post = (m) => vscode.postMessage(m);
  const tbody = document.getElementById("rows");
  const original = tbody ? [...tbody.children] : [];
  function order() {
    if (!tbody) return;
    if (state.bySize) {
      const rs = [...tbody.querySelectorAll("tr[data-size]")].sort((a, b) => Number(b.dataset.size) - Number(a.dataset.size));
      for (const g of tbody.querySelectorAll("tr.group")) g.remove();
      for (const r of rs) tbody.appendChild(r);
    } else {
      tbody.replaceChildren(...original);
    }
    document.getElementById("bysize").classList.toggle("active", state.bySize);
  }
  const q = document.getElementById("q");
  const rows = [...document.querySelectorAll("tr[data-facets]")];
  const groups = [...document.querySelectorAll("tr.group")];
  function apply() {
    const needle = state.q.trim().toLowerCase();
    let shown = 0;
    for (const r of rows) {
      const ok = (state.facet === "all" || r.dataset.facets.split(" ").includes(state.facet)) && (!needle || r.dataset.text.includes(needle));
      r.hidden = !ok; if (ok) shown++;
    }
    const filtering = !!needle || state.facet !== "all";
    for (const g of groups) g.hidden = state.bySize || (filtering && !rows.some((r) => !r.hidden && r.dataset.group === g.dataset.groupfor));
    for (const h of document.querySelectorAll("tr.hint")) h.hidden = state.bySize || filtering;
    for (const c of document.querySelectorAll(".chip")) c.classList.toggle("active", c.dataset.facet === state.facet);
    const none = document.getElementById("none"); if (none) none.hidden = shown > 0;
    vscode.setState(state);
  }
  if (q) { q.value = state.q; q.addEventListener("input", () => { state.q = q.value; apply(); }); }
  for (const c of document.querySelectorAll(".chip[data-facet]")) c.addEventListener("click", () => { state.facet = c.dataset.facet; apply(); });
  document.getElementById("bysize").addEventListener("click", () => { state.bySize = !state.bySize; order(); apply(); });
  order();
  for (const b of document.querySelectorAll("button[data-msg], a[data-msg]")) b.addEventListener("click", () => post(JSON.parse(b.dataset.msg)));
  for (const c of document.querySelectorAll("input[type=checkbox][data-msg]")) c.addEventListener("change", () => vscode.postMessage(JSON.parse(c.dataset.msg)));
  // A section's box: on when every mod in it is on, a dash when some are; a click turns them all on or off.
  for (const c of document.querySelectorAll("input.all")) {
    c.indeterminate = c.dataset.some === "1";
    c.addEventListener("change", () => post({ action: "sectionOn", section: c.dataset.section, on: c.checked }));
  }

  // Drag a row onto another to put it above or below that one (and in its section), or onto a section's header to move it there.
  let dragId = null;
  const unmark = () => { for (const e of document.querySelectorAll(".dropabove, .dropbelow, .dropin")) e.classList.remove("dropabove", "dropbelow", "dropin"); };
  for (const r of rows) {
    r.addEventListener("dragstart", (e) => {
      if (state.bySize) { e.preventDefault(); return; }
      dragId = r.dataset.id; r.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.dataset.id);
    });
    r.addEventListener("dragend", () => { r.classList.remove("dragging"); unmark(); dragId = null; });
    const below = (e) => { const b = r.getBoundingClientRect(); return e.clientY > b.top + b.height / 2; };
    r.addEventListener("dragover", (e) => {
      if (!dragId || dragId === r.dataset.id) return;
      e.preventDefault(); unmark(); r.classList.add(below(e) ? "dropbelow" : "dropabove");
    });
    r.addEventListener("drop", (e) => {
      e.preventDefault(); unmark();
      if (dragId && dragId !== r.dataset.id) post({ action: "place", id: dragId, target: r.dataset.id, below: below(e) });
    });
  }
  for (const g of document.querySelectorAll("tr.group, tr.hint")) {
    const section = g.dataset.groupfor ?? g.dataset.hintfor;
    g.addEventListener("dragover", (e) => { if (!dragId) return; e.preventDefault(); unmark(); g.classList.add("dropin"); });
    g.addEventListener("drop", (e) => { e.preventDefault(); unmark(); if (dragId) post({ action: "putIn", id: dragId, section }); });
  }

  // Column widths: drag the edge of a heading; double-click it to go back to automatic widths.
  // Status takes whatever room is left, so the table always fills the page.
  const table = document.querySelector("table.mods");
  if (table) {
    const ths = [...table.querySelectorAll("thead th")];
    const flex = ths.findIndex((t) => t.textContent === "Status");
    const widths = () => {
      const w = state.widths;
      const ok = Array.isArray(w) && w.length === ths.length;
      table.classList.toggle("fixed", ok);
      ths.forEach((t, i) => (t.style.width = ok && i !== flex ? w[i] + "px" : ""));
      table.style.minWidth = ok ? w.reduce((n, x, i) => n + (i === flex ? 120 : x), 0) + "px" : "";
    };
    ths.forEach((th, i) => {
      if (i === 0 || i >= flex) return;
      const g = document.createElement("span");
      g.className = "grip"; g.title = "Drag to resize; double-click for automatic widths";
      th.appendChild(g);
      g.addEventListener("mousedown", (e) => {
        e.preventDefault();
        if (!(Array.isArray(state.widths) && state.widths.length === ths.length)) state.widths = ths.map((t) => Math.round(t.getBoundingClientRect().width));
        widths();
        const x0 = e.clientX, w0 = state.widths[i];
        g.classList.add("on");
        const move = (ev) => { state.widths[i] = Math.max(36, Math.round(w0 + ev.clientX - x0)); widths(); };
        const up = () => { g.classList.remove("on"); document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); vscode.setState(state); };
        document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
      });
      g.addEventListener("dblclick", () => { state.widths = null; widths(); vscode.setState(state); });
    });
    widths();
  }
  for (const s of document.querySelectorAll("select.ver")) s.addEventListener("change", () => { if (s.value) vscode.postMessage(JSON.parse(s.value)); });
  apply();
</script>
</body></html>`;
}
