// Starts a real VS Code (downloaded once by @vscode/test-electron) with REDdeck loaded from this
// folder, a scratch library and a fake game folder, and runs src/uiTest.ts inside it.
//   npm run test:ui            after npm run build
import { runTests } from "@vscode/test-electron";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reddeck-ui-"));
const game = path.join(tmp, "game");
const lib = path.join(tmp, "lib");
fs.mkdirSync(path.join(game, "bin", "x64"), { recursive: true });
fs.writeFileSync(path.join(game, "bin", "x64", "Cyberpunk2077.exe"), "not really");
fs.mkdirSync(path.join(tmp, "workspace"), { recursive: true });

try {
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, "dist", "uiTest.js"),
    launchArgs: [path.join(tmp, "workspace"), "--disable-extensions", "--disable-workspace-trust", "--disable-gpu"],
    extensionTestsEnv: { REDDECK_TEST_LIB: lib, REDDECK_TEST_GAME: game },
  });
  console.log("ui test: passed");
} catch (err) {
  console.error("ui test: failed", err);
  process.exitCode = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
