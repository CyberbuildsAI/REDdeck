// Exercises the core end to end against a fake game folder in a temp directory: classify sample
// mod layouts, add them to a library, deploy (hardlinks), detect a change made outside REDdeck,
// undo, and import from a Vortex staging folder if one exists on this machine (read-only).
//   node scripts/smoke.mjs            after npm run build
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../dist/core.js");
const root = path.resolve(import.meta.dirname, "..");
const sevenZa = core.findSevenZip(root);
assert.ok(sevenZa, "7za.exe not found; run npm run build");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reddeck-smoke-"));
const game = path.join(tmp, "game");
const libRoot = path.join(tmp, "lib");
const src = path.join(tmp, "src");
fs.mkdirSync(path.join(game, "bin", "x64"), { recursive: true });
fs.writeFileSync(path.join(game, "bin", "x64", "Cyberpunk2077.exe"), "not really");
fs.mkdirSync(path.join(game, "archive", "pc", "mod"), { recursive: true });
fs.mkdirSync(path.join(game, "r6", "scripts"), { recursive: true });
fs.writeFileSync(path.join(game, "r6", "scripts", "UserOwn.reds"), "// the user's own file");

const write = (p, content = p) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const zip = (name, folder) => {
  const file = path.join(tmp, name);
  execFileSync(sevenZa, ["a", "-tzip", file, path.join(folder, "*")], { stdio: "ignore" });
  return file;
};

// Sample mods in the layouts Nexus actually ships.
write(path.join(src, "bare", "CoolMod.archive"));
write(path.join(src, "bare", "readme.txt"));
write(path.join(src, "rooted", "archive", "pc", "mod", "Rooted.archive"));
write(path.join(src, "rooted", "archive", "pc", "mod", "Rooted.archive.xl"));
write(path.join(src, "rooted", "r6", "scripts", "Rooted", "Rooted.reds"));
write(path.join(src, "rooted", "r6", "tweaks", "Rooted", "rooted.yaml"));
write(path.join(src, "cet", "MyCetMod", "init.lua"));
write(path.join(src, "cet", "MyCetMod", "data", "x.json"));
write(path.join(src, "options", "Option A", "Thing.archive"));
write(path.join(src, "options", "Option B", "Thing.archive"));
write(path.join(src, "conflict", "archive", "pc", "mod", "CoolMod.archive"), "other content");
write(path.join(src, "loose", "Loose.reds"));
write(path.join(src, "red4ext", "red4ext", "plugins", "Plug", "Plug.dll"));
write(path.join(src, "redmod", "MyRedmod", "info.json"), '{"name":"MyRedmod"}');
write(path.join(src, "redmod", "MyRedmod", "archives", "x.archive"));
write(path.join(src, "framework", "bin", "x64", "winmm.dll"));
write(path.join(src, "framework", "red4ext", "RED4ext.dll"));

const cls = (folder, name) => core.classify(path.join(src, folder), name);
let c = cls("bare", "Bare");
assert.deepEqual(c.placements.map((p) => p.to), ["archive/pc/mod/CoolMod.archive"]);
assert.deepEqual(c.ignored, ["readme.txt"]);
c = cls("rooted", "Rooted");
assert.equal(c.placements.length, 4);
assert.deepEqual([...c.kinds].sort(), ["archive", "reds", "tweak", "xl"]);
c = cls("cet", "Cet");
assert.deepEqual(c.placements.map((p) => p.to).sort(), ["bin/x64/plugins/cyber_engine_tweaks/mods/MyCetMod/data/x.json", "bin/x64/plugins/cyber_engine_tweaks/mods/MyCetMod/init.lua"]);
c = cls("options", "Options");
assert.deepEqual(c.options.map((o) => o.label), ["Option A", "Option B"]);
c = core.classify(c.options[1].folder, "Options");
assert.deepEqual(c.placements.map((p) => p.to), ["archive/pc/mod/Thing.archive"]);
c = cls("loose", "Loose");
assert.deepEqual(c.placements.map((p) => p.to), ["r6/scripts/Loose/Loose.reds"]);
c = cls("red4ext", "Plug");
assert.deepEqual(c.placements.map((p) => p.to), ["red4ext/plugins/Plug/Plug.dll"]);
c = cls("redmod", "MyRedmod");
assert.deepEqual(c.placements.map((p) => p.to).sort(), ["mods/MyRedmod/archives/x.archive", "mods/MyRedmod/info.json"]);
c = cls("framework", "RED4ext");
assert.deepEqual(c.kinds, ["framework"]);
console.log("classifier: ok");

// Extract a zip and add from it.
const lib = core.loadLibrary(libRoot, game);
const zipped = zip("rooted.zip", path.join(src, "rooted"));
const extracted = path.join(tmp, "extracted");
await core.extractArchive(zipped, extracted, sevenZa);
c = core.classify(extracted, "Rooted");
const rooted = core.addMod(lib, c.placements, { name: "Rooted", version: "1.0", source: { type: "file", path: zipped } });
assert.equal(rooted.files.length, 4);
const bare = core.addMod(lib, cls("bare", "Bare").placements, { name: "Bare", source: { type: "folder" } });
const conflict = core.addMod(lib, cls("conflict", "Conflict").placements, { name: "Conflict", source: { type: "folder" } });
const loose = core.addMod(lib, cls("loose", "Loose").placements, { name: "Loose", source: { type: "folder" } });
assert.ok(fs.existsSync(path.join(libRoot, "library", "rooted", "archive", "pc", "mod", "Rooted.archive")));
console.log("library: ok");

// Plan: Bare and Conflict both ship CoolMod.archive; Bare is earlier in the order so it wins.
let p = core.plan(lib, game);
assert.equal(p.conflicts.length, 1);
assert.equal(p.conflicts[0].winner, "bare");
assert.deepEqual(p.conflicts[0].losers, ["conflict"]);
assert.equal(p.method, "link");
const r = core.deploy(lib, game, new Map());
assert.equal(r.linked, 7, `linked ${r.linked}: 4 rooted + 1 bare + 1 loose + modlist`);
assert.equal(r.skipped.length, 0);
const modlist = fs.readFileSync(path.join(game, "archive", "pc", "mod", "modlist.txt"), "utf8");
assert.equal(modlist, "Rooted.archive\r\nCoolMod.archive\r\n");
assert.equal(fs.readFileSync(path.join(game, "archive", "pc", "mod", "CoolMod.archive"), "utf8").endsWith("CoolMod.archive"), true, "Bare's copy, not Conflict's");
assert.ok(fs.existsSync(path.join(game, core.ManifestName)));
assert.equal(fs.statSync(path.join(game, "archive", "pc", "mod", "Rooted.archive")).nlink, 2, "hardlinked");
console.log("deploy: ok", r);

// Nothing to do on a second deploy.
p = core.plan(lib, game);
assert.equal(p.add.length, 0);
assert.equal(p.stale.length, 0);

// Reorder: Conflict wins now, so CoolMod.archive is replaced.
core.moveMod(lib, conflict, -1);
core.moveMod(lib, conflict, -1);
assert.equal(lib.info.order[0], "conflict");
p = core.plan(lib, game);
assert.equal(p.conflicts[0].winner, "conflict");
core.deploy(lib, game);
assert.equal(fs.readFileSync(path.join(game, "archive", "pc", "mod", "CoolMod.archive"), "utf8"), "other content");
console.log("reorder: ok");

// A change made outside REDdeck: replace a deployed file with a different one.
const changedFile = path.join(game, "r6", "scripts", "Loose", "Loose.reds");
fs.rmSync(changedFile);
fs.writeFileSync(changedFile, "edited by hand");
let changes = core.detectChanges(game);
assert.deepEqual(changes.map((x) => [x.entry.path, x.kind]), [["r6/scripts/Loose/Loose.reds", "changed"]]);
// Deploy without an answer leaves it alone.
let r2 = core.deploy(lib, game);
assert.deepEqual(r2.skipped, ["r6/scripts/Loose/Loose.reds"]);
assert.equal(fs.readFileSync(changedFile, "utf8"), "edited by hand");
// "keep" imports the edit into the library and relinks.
r2 = core.deploy(lib, game, new Map([["r6/scripts/Loose/Loose.reds", "keep"]]));
assert.equal(fs.readFileSync(path.join(libRoot, "library", "loose", "r6", "scripts", "Loose", "Loose.reds"), "utf8"), "edited by hand");
assert.equal(fs.statSync(changedFile).nlink, 2);
assert.equal(core.detectChanges(game).length, 0);
// A missing file comes back silently.
fs.rmSync(changedFile);
assert.equal(core.detectChanges(game)[0].kind, "missing");
core.deploy(lib, game);
assert.ok(fs.existsSync(changedFile));
console.log("changes: ok");

// A rebuilt mod: the library file is replaced (new inode), and deploy relinks it without asking.
{
  const libFile = path.join(libRoot, "library", "loose", "r6", "scripts", "Loose", "Loose.reds");
  fs.rmSync(libFile);
  fs.writeFileSync(libFile, "rebuilt");
  const p2 = core.plan(lib, game);
  assert.deepEqual(p2.add.map((d) => d.rel), ["r6/scripts/Loose/Loose.reds"]);
  assert.ok(core.detectChanges(game).every((c) => c.kind !== "changed"), "the game file itself did not change (its old source is just gone)");
  const r3 = core.deploy(lib, game);
  assert.equal(r3.linked, 1);
  assert.equal(fs.readFileSync(changedFile, "utf8"), "rebuilt");
  assert.equal(fs.statSync(changedFile).nlink, 2);
  console.log("rebuilt: ok");
}

// A project: its packed folder is the mod; packing again refreshes the library copy.
{
  const proj = path.join(tmp, "proj");
  write(path.join(proj, "TestMod.cpmodproj"), "<CP77Mod><Name>TestMod</Name><ModName>Test Mod</ModName></CP77Mod>");
  write(path.join(proj, "packed", "archive", "pc", "mod", "TestMod.archive"), "v1");
  assert.equal(core.findProjectFile(proj), path.join(proj, "TestMod.cpmodproj"));
  assert.equal(core.projectName(path.join(proj, "TestMod.cpmodproj")), "Test Mod");
  const c2 = core.classifyProject(path.join(proj, "TestMod.cpmodproj"));
  const pm = core.addMod(lib, c2.placements, { name: "Test Mod", version: "dev", source: { type: "project", path: path.join(proj, "TestMod.cpmodproj") } });
  assert.deepEqual(pm.files, ["archive/pc/mod/TestMod.archive"]);
  assert.deepEqual(core.syncProjects(lib), [], "nothing changed yet");
  await new Promise((r) => setTimeout(r, 1100));
  write(path.join(proj, "packed", "archive", "pc", "mod", "TestMod.archive"), "v2");
  write(path.join(proj, "packed", "r6", "tweaks", "TestMod", "x.yaml"), "y");
  const synced = core.syncProjects(lib);
  assert.deepEqual(synced.map((m) => m.id), ["test-mod"]);
  assert.deepEqual(pm.files, ["archive/pc/mod/TestMod.archive", "r6/tweaks/TestMod/x.yaml"]);
  assert.equal(fs.readFileSync(path.join(libRoot, "library", "test-mod", "archive", "pc", "mod", "TestMod.archive"), "utf8"), "v2");
  core.removeMod(lib, pm);
  console.log("project: ok");
}

// Pending changes with reasons: a replaced path is one row, an off mod's files are removes.
{
  const p0 = core.plan(lib, game);
  const before = core.pendingChanges(lib, game, p0);
  const deployedIds = new Set(core.readManifest(game).files.map((e) => e.mod));
  const off = lib.mods.find((m) => m.enabled && deployedIds.has(m.id) && m.files.every((f) => !p0.conflicts.some((c) => c.path.toLowerCase() === f.toLowerCase())));
  off.enabled = false;
  core.saveMod(lib, off);
  const rows = core.pendingChanges(lib, game, core.plan(lib, game));
  const removes = rows.filter((r) => r.kind === "remove" && r.mod === off.id);
  assert.ok(removes.length > 0, "off mod's deployed files are removes");
  assert.ok(removes.every((r) => r.detail === "the mod is off"));
  assert.ok(rows.every((r, i) => rows.filter((x) => x.path === r.path).length === 1), "one row per path");
  off.enabled = true;
  core.saveMod(lib, off);
  assert.equal(core.pendingChanges(lib, game, core.plan(lib, game)).length, before.length);
  console.log(`pending changes: ok (${removes.length} removes when ${off.id} is off)`);
}

// Families: versions of one mod grouped, one active, the rest off; ids carry the version.
{
  const a = core.addMod(lib, cls("bare", "Fam").placements, { name: "Codeware", version: "1.20.3", source: { type: "nexus", modId: 7780, fileId: 1 } });
  a.nexus = { name: "Codeware", version: "1.20.5", latestVersion: "1.20.5", latestFileId: 3, checked: "2026-10-12T00:00:00Z" };
  core.saveMod(lib, a);
  const b = core.addMod(lib, cls("bare", "Fam").placements, { name: "Codeware", version: "1.20.4", source: { type: "nexus", modId: 7780, fileId: 2 }, enabled: false });
  assert.equal(b.id, "codeware-1-20-4", "second version gets the version in its id");
  let fam = core.familyOf(lib, a);
  assert.equal(fam.mods.length, 2);
  assert.equal(fam.mods[0].id, b.id, "newest first");
  assert.equal(fam.active.id, a.id, "the enabled one is active");
  assert.equal(fam.update.version, "1.20.5");
  assert.equal(core.familyUpdate(lib, b), "1.20.5");
  assert.equal(core.findSameVersion(lib, 7780, 2).id, b.id);
  assert.equal(core.findSameVersion(lib, 7780, 99, "1.20.3").id, a.id);
  assert.equal(core.findSameVersion(lib, 7780, 99, "9.9.9"), undefined);
  const r = core.activateVersion(lib, b);
  assert.equal(r.previous.id, a.id);
  assert.ok(r.on);
  assert.ok(b.enabled && !a.enabled, "chosen on, previous off");
  assert.ok(lib.info.order.indexOf(b.id) < lib.info.order.indexOf(a.id), "chosen takes the previous one's place");
  fam = core.familyOf(lib, a);
  assert.equal(fam.active.id, b.id);
  assert.equal(core.families(lib).filter((f) => f.key === "nexus:7780").length, 1, "one row per mod");
  assert.equal(core.baseName("Codeware 1.20.5"), "codeware");
  assert.equal(core.baseName("input_loader_v0.2.3"), "input loader");
  core.removeMod(lib, a);
  core.removeMod(lib, b);
  console.log("families: ok");
}

// placeAbove: the loser moves to directly above the winner; already-above is a no-op.
{
  const before = [...lib.info.order];
  const [first, , third] = lib.mods;
  core.placeAbove(lib, third, first);
  assert.equal(lib.info.order.indexOf(third.id), lib.info.order.indexOf(first.id) - 1);
  assert.equal(lib.mods[0].id, third.id);
  core.placeAbove(lib, third, first);
  assert.equal(lib.mods[0].id, third.id, "no-op when already above");
  lib.info.order = before;
  const rank = new Map(before.map((id, k) => [id, k]));
  lib.mods.sort((a, b) => rank.get(a.id) - rank.get(b.id));
  core.saveLibrary(lib);
  console.log("placeAbove: ok");
}

// Loadouts: save the current set, change things, load it back.
{
  const file = core.saveLoadout(lib, "smoke", "2.31");
  assert.ok(fs.existsSync(file));
  const was = lib.mods.map((m) => [m.id, m.enabled]);
  lib.mods[0].enabled = !lib.mods[0].enabled;
  core.saveMod(lib, lib.mods[0]);
  const extra = core.addMod(lib, cls("bare", "Extra").placements, { name: "Extra", source: { type: "folder" } });
  const r = core.applyLoadout(lib, file);
  assert.deepEqual(lib.mods.filter((m) => m.id !== "extra").map((m) => [m.id, m.enabled]), was);
  assert.deepEqual(r.extra, ["Extra"]);
  assert.equal(lib.mods.find((m) => m.id === "extra").enabled, false);
  assert.equal(core.listLoadouts(libRoot).length, 1);
  core.removeMod(lib, extra);
  console.log("loadouts: ok");
}

// The command line over the same library.
{
  const cli = (...a) => execFileSync(process.execPath, [path.join(root, "bin", "reddeck.mjs"), "--library", libRoot, "--game", game, ...a], { encoding: "utf8" }).trim();
  const listed = JSON.parse(cli("list", "--json"));
  assert.equal(listed.mods.length, lib.mods.length);
  assert.ok(cli("off", "bare").includes("bare: off"));
  assert.ok(cli("on", "bare").includes("bare: on"));
  assert.ok(cli("conflicts").includes("wins over"));
  assert.ok(cli("loadout", "list").includes("smoke"));
  const dep = JSON.parse(cli("deploy", "--json"));
  assert.equal(typeof dep.linked, "number");
  assert.match(cli("changes"), /no changes|missing|changed/);
  console.log("cli: ok");
}

// Turn a mod off: its files leave on the next deploy.
rooted.enabled = false;
core.saveMod(lib, rooted);
r2 = core.deploy(lib, game);
assert.equal(r2.removed, 4);
assert.ok(!fs.existsSync(path.join(game, "archive", "pc", "mod", "Rooted.archive")));
assert.ok(!fs.existsSync(path.join(game, "r6", "tweaks", "Rooted")), "folder REDdeck created is gone");
console.log("off: ok");

// A foreign file in the way is backed up and restored on undo.
rooted.enabled = true;
core.saveMod(lib, rooted);
fs.writeFileSync(path.join(game, "archive", "pc", "mod", "Rooted.archive"), "user's own archive");
r2 = core.deploy(lib, game);
assert.equal(r2.backedUp, 1);
const u = core.undo(lib, game);
assert.equal(u.skipped.length, 0);
assert.equal(fs.readFileSync(path.join(game, "archive", "pc", "mod", "Rooted.archive"), "utf8"), "user's own archive", "backup restored");
assert.ok(!fs.existsSync(path.join(game, core.ManifestName)));
assert.ok(!fs.existsSync(path.join(game, "archive", "pc", "mod", "modlist.txt")));
assert.ok(fs.existsSync(path.join(game, "r6", "scripts", "UserOwn.reds")), "never touched the user's file");
assert.ok(fs.existsSync(path.join(game, "r6", "scripts")), "pre-existing folder kept");
console.log("undo: ok");

// Archive conflicts: pure intersection of listings, winners first.
{
  const L = (mod, archive, entries) => ({ mod, archive, resources: new Map(entries) });
  const summary = core.findArchiveConflicts([
    L("a", "archive/pc/mod/A.archive", [["1", "base/x.mesh"], ["2", "base/y.mesh"]]),
    L("b", "archive/pc/mod/B.archive", [["2", "base/y.mesh"], ["3", "base/z.mesh"]]),
    L("c", "archive/pc/mod/C.archive", [["2", "base/y.mesh"]]),
  ]);
  assert.equal(summary.conflicts.length, 1);
  assert.deepEqual(summary.conflicts[0].mods, ["a", "b", "c"]);
  assert.equal(summary.won.get("a"), 2);
  assert.equal(summary.lost.get("b"), 1);
  assert.equal(summary.lost.get("c"), 1);
  assert.equal(summary.pairs.get("a|b"), 1);
  console.log("conflicts: ok");
}

// REDmod packages: the mod list in order, no tool run here.
{
  const redmod = core.addMod(lib, cls("redmod", "MyRedmod").placements, { name: "MyRedmod", source: { type: "folder" } });
  assert.deepEqual(core.enabledRedmodPackages(lib), ["MyRedmod"]);
  core.removeMod(lib, redmod);
  console.log("redmod: ok");
}

// Finding the game: through Steam's library list, GOG or Epic.
{
  const libs = core.steamLibraries();
  const found = core.findGame();
  assert.ok(Array.isArray(libs));
  if (found) assert.ok(core.isGameFolder(found));
  console.log(`find game: ok (${libs.length} Steam librar${libs.length === 1 ? "y" : "ies"}, game ${found ?? "not found"})`);
}

// Game version from the real install, if it is here.
{
  const real = "C:/Program Files (x86)/Steam/steamapps/common/Cyberpunk 2077";
  const v = await core.gameVersion(real);
  console.log(`game version: ${v ?? "no game here"}`);
}

// REDbridge, if a build is next to this checkout: open a mod archive and list what is inside.
{
  const exe = core.findBridge("", root);
  if (exe) {
    const b = new core.BridgeClient(exe);
    console.log(`bridge dotnet root: ${b.dotnetRoot ?? "(machine-wide)"}`);
    b.start();
    const info = await b.info();
    console.log(`bridge ${info.version} (WolvenKit ${info.wolvenKit}), game loaded: ${info.gameLoaded}`);
    assert.ok(core.compareVersions(info.version, core.MinBridgeVersion) >= 0, `bridge ${info.version} < ${core.MinBridgeVersion}`);
    const staging = core.vortexStagingPath();
    let sample;
    const findArchive = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { const r = findArchive(p); if (r) return r; }
        else if (e.name.toLowerCase().endsWith(".archive")) return p;
      }
    };
    if (fs.existsSync(staging)) sample = findArchive(staging);
    if (sample) {
      const r = await b.openMod(sample);
      assert.ok(r.files > 0);
      console.log(`bridge openMod ${path.basename(sample)}: ${r.files} resources, first ${r.items[0].name}`);
    } else {
      console.log("bridge openMod: no sample archive found, skipped");
    }
    b.stop();
  } else {
    console.log("bridge: not found, skipped");
  }
}

// REDbridge releases: the latest on GitHub has a Windows zip; a .NET 10 runtime is found or not.
{
  assert.equal(typeof core.dotnet10Root(), core.dotnet10Root() ? "string" : "undefined");
  assert.equal(core.installedBridge(path.join(libRoot, "nowhere")), undefined);
  try {
    const rel = await core.latestBridgeRelease();
    assert.match(rel.assetName, /win-x64\.zip$/);
    assert.ok(rel.size > 1000000);
    console.log(`bridge release: ok (${rel.tag}, ${Math.round(rel.size / 1048576)} MB, .NET 10 at ${core.dotnet10Root() ?? "none"})`);
  } catch (err) {
    console.log(`bridge release: skipped (${err.message})`);
  }
}

// Nexus sign-in against a fake Nexus socket: token, authorise page, a dropped connection, the key.
{
  const sockets = [];
  const fakeSocket = () => {
    const listeners = {};
    const s = {
      sent: [],
      closed: false,
      addEventListener: (t, f) => (listeners[t] ??= []).push(f),
      emit: (t, ev) => (listeners[t] ?? []).forEach((f) => f(ev)),
      send: (d) => s.sent.push(JSON.parse(d)),
      close: () => (s.closed = true),
    };
    sockets.push(s);
    return s;
  };
  const opened = [];
  const pending = core.signIn({ application: "reddeck-test", open: (u) => opened.push(u), connect: fakeSocket, timeoutMs: 5000 });
  const tick = () => new Promise((r) => setTimeout(r, 5));
  sockets[0].emit("open");
  assert.deepEqual(sockets[0].sent[0], { id: sockets[0].sent[0].id, token: null, protocol: 2 });
  assert.match(sockets[0].sent[0].id, /^[0-9a-f-]{36}$/);
  sockets[0].emit("message", { data: JSON.stringify({ success: true, data: { connection_token: "tok" }, error: null }) });
  await tick();
  assert.equal(opened.length, 1);
  assert.ok(opened[0].includes(`sso?id=${sockets[0].sent[0].id}&application=reddeck-test`));
  sockets[0].emit("close");
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(sockets.length, 2, "reconnects after a drop");
  sockets[1].emit("open");
  assert.deepEqual(sockets[1].sent[0], { id: sockets[0].sent[0].id, token: "tok", protocol: 2 });
  sockets[1].emit("message", { data: JSON.stringify({ success: true, data: { api_key: "KEY123" }, error: null }) });
  assert.equal(await pending, "KEY123");
  assert.equal(opened.length, 1, "authorise page opened once");
  assert.ok(sockets[1].closed);
  // Refused.
  const s2 = [];
  const refused = core.signIn({ application: "x", open: () => undefined, connect: () => { const s = fakeSocket(); s2.push(s); return s; }, timeoutMs: 5000 });
  s2[0].emit("open");
  s2[0].emit("message", { data: JSON.stringify({ success: false, data: null, error: "Invalid application" }) });
  await assert.rejects(refused, /Invalid application/);
  // Cancelled.
  const ac = new AbortController();
  const cancelled = core.signIn({ application: "x", open: () => undefined, connect: fakeSocket, signal: ac.signal, timeoutMs: 5000 });
  ac.abort();
  await assert.rejects(cancelled, /cancelled/);
  assert.equal(typeof core.hasWebSocket(), "boolean");
  console.log("nexus sign-in: ok");
}

// Nexus: pure parts only; no network.
{
  const nxm = core.parseNxm("nxm://cyberpunk2077/mods/7780/files/144164?key=abc123&expires=1760000000&user_id=42");
  assert.deepEqual(nxm, { game: "cyberpunk2077", modId: 7780, fileId: 144164, key: "abc123", expires: 1760000000, userId: 42 });
  assert.throws(() => core.parseNxm("https://www.nexusmods.com/cyberpunk2077/mods/7780"), /Not an nxm link/);
  assert.throws(() => core.parseNxm("nxm://cyberpunk2077/collections/abc/revisions/1"), /collections/);
  assert.equal(core.versionNewer("1.20.4", "1.20.3"), true);
  assert.equal(core.versionNewer("1.20.3", "1.20.3"), false);
  assert.equal(core.versionNewer("1.9", "1.10"), false);
  assert.equal(core.versionNewer("2.0", ""), false);
  const newest = core.newestFile({ files: [
    { file_id: 1, name: "old", version: "1.0", category_name: "OLD_VERSION", is_primary: false, uploaded_timestamp: 1 },
    { file_id: 2, name: "main", version: "1.1", category_name: "MAIN", is_primary: true, uploaded_timestamp: 2 },
    { file_id: 3, name: "opt", version: "1.2", category_name: "OPTIONAL", is_primary: false, uploaded_timestamp: 3 },
  ], file_updates: [] });
  assert.equal(newest.file_id, 2);
  assert.equal(core.modPageUrl(7780), "https://www.nexusmods.com/cyberpunk2077/mods/7780");
  assert.match(core.forwarderCommand(), /vscode:\/\/edgemodders\.reddeck\/nxm\?url=/);
  assert.equal(core.describeHandler(core.forwarderCommand()), "REDdeck");
  assert.equal(core.describeHandler('"C:\\Vortex\\Vortex.exe" -d "%1"'), "Vortex");
  const handler = await core.currentNxmHandler();
  console.log(`nexus: ok (nxm links on this machine: ${core.describeHandler(handler)})`);
}

// Vortex, if present on this machine: list and classify, import into the temp library, never write.
const vortex = core.listVortexMods(game);
if (vortex.length) {
  const imported = core.importFromVortex(lib, vortex);
  console.log(`vortex: ${vortex.length} mods found, ${imported.added.length} imported, ${imported.skipped.length} skipped`);
  for (const s of imported.skipped) console.log(`  skipped ${s.name}: ${s.reason}`);
  for (const m of imported.added) console.log(`  ${m.name} ${m.version} [${m.kinds.join(" ")}] ${m.files.length} files, ${m.enabled ? "on" : "off"}`);
} else {
  console.log("vortex: not installed here, skipped");
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("smoke: all passed");
