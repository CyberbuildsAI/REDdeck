// Runs inside a real VS Code extension host (see scripts/ui-test.mjs): activates EDGEdeck against a
// scratch library and a fake game folder, checks the contributions registered, and drives the
// commands that need no dialog. Throws on the first failure; the runner reports it.

import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

export async function run(): Promise<void> {
  const lib = process.env.EDGEDECK_TEST_LIB!;
  const game = process.env.EDGEDECK_TEST_GAME!;
  assert.ok(lib && game, "EDGEDECK_TEST_LIB and EDGEDECK_TEST_GAME must be set");

  const cfg = vscode.workspace.getConfiguration("edgedeck");
  await cfg.update("libraryPath", lib, vscode.ConfigurationTarget.Global);
  await cfg.update("gamePath", game, vscode.ConfigurationTarget.Global);

  const ext = vscode.extensions.getExtension("edgemodders.edgedeck");
  assert.ok(ext, "extension edgemodders.edgedeck not found");
  await ext.activate();
  assert.ok(ext.isActive, "extension did not activate");

  const commands = await vscode.commands.getCommands(true);
  for (const c of ["edgedeck.addMod", "edgedeck.importVortex", "edgedeck.addProject", "edgedeck.saveLoadout", "edgedeck.loadLoadout", "edgedeck.exportLoadout", "edgedeck.importLoadout", "edgedeck.nexusSignIn", "edgedeck.nexusSignOut", "edgedeck.nexusSetKey", "edgedeck.deploy", "edgedeck.undo", "edgedeck.remove", "edgedeck.details", "edgedeck.checkConflicts", "edgedeck.openPage", "edgedeck.suggestTheme", "edgedeck.showChanges", "edgedeck.getBridge", "edgedeck.pickGame", "edgedeck.setup", "edgedeck.hideSetupStep", "edgedeck.mcpSetup", "edgedeck.updateBridge", "edgedeck.addToProject", "edgedeck.switchVersion", "edgedeck.moveUp", "edgedeck.moveDown", "edgedeck.openInExplorer", "edgedeck.openLibrary", "edgedeck.refresh", "edgedeck.showLog"]) {
    assert.ok(commands.includes(c), `command ${c} not registered`);
  }

  // The library is created on activation.
  await vscode.commands.executeCommand("edgedeck.refresh");
  assert.ok(fs.existsSync(path.join(lib, "library")), "library folder not created");

  // A mod placed in the library by hand shows up after a refresh and deploys without a dialog.
  const modDir = path.join(lib, "library", "ui-test-mod");
  fs.mkdirSync(path.join(modDir, "archive", "pc", "mod"), { recursive: true });
  fs.writeFileSync(path.join(modDir, "archive", "pc", "mod", "UiTest.archive"), "x");
  fs.writeFileSync(
    path.join(modDir, "mod.json"),
    JSON.stringify({ id: "ui-test-mod", name: "UI Test Mod", version: "1.0", kinds: ["archive"], enabled: true, added: new Date().toISOString(), source: { type: "folder" }, files: ["archive/pc/mod/UiTest.archive"] }),
  );
  await vscode.commands.executeCommand("edgedeck.refresh");
  await vscode.commands.executeCommand("edgedeck.deploy");
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(fs.existsSync(path.join(game, "archive", "pc", "mod", "UiTest.archive")), "deploy did not link the archive");
  assert.ok(fs.existsSync(path.join(game, "edgedeck.deployment.json")), "no manifest after deploy");
  assert.equal(fs.readFileSync(path.join(game, "archive", "pc", "mod", "modlist.txt"), "utf8").trim(), "UiTest.archive");

  // Show conflicts opens the conflicts panel; the archive scan runs through a bridge or reports that it needs one.
  await vscode.commands.executeCommand("edgedeck.checkConflicts");
  await new Promise((r) => setTimeout(r, 1500));
  const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label));
  assert.ok(tabs.includes("Conflicts"), `no Conflicts tab among ${tabs.join(", ")}`);

  // The pending changes panel opens as a tab.
  await vscode.commands.executeCommand("edgedeck.showChanges");
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label)).includes("Pending changes"), "no Pending changes tab");

  // The mods page opens as a EDGEdeck tab.
  await vscode.commands.executeCommand("edgedeck.openPage");
  await new Promise((r) => setTimeout(r, 500));
  assert.ok(vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((t) => t.label)).includes("EDGEdeck"), "no EDGEdeck tab");

  // Details for the mod opens a webview panel without throwing.
  await vscode.commands.executeCommand("edgedeck.details", { type: "mod", mod: JSON.parse(fs.readFileSync(path.join(modDir, "mod.json"), "utf8")) });
  await new Promise((r) => setTimeout(r, 500));

  await cfg.update("libraryPath", undefined, vscode.ConfigurationTarget.Global);
  await cfg.update("gamePath", undefined, vscode.ConfigurationTarget.Global);
  console.log("ui test: all passed");
}
