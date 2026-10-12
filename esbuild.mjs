// Bundles the extension (CommonJS, VS Code's module loader) and the VS Code-free core on its own
// (for the smoke test). Copies the bundled 7za.exe next to the build so the .vsix carries it.
// `node esbuild.mjs --watch` rebuilds on change.
import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";

const watch = process.argv.includes("--watch");

const common = { bundle: true, platform: "node", format: "cjs", target: "node18", sourcemap: true, logLevel: "info" };
const extension = { ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.js", external: ["vscode"] };
const core = { ...common, entryPoints: ["src/core.ts"], outfile: "dist/core.js" };
const uiTest = { ...common, entryPoints: ["src/uiTest.ts"], outfile: "dist/uiTest.js", external: ["vscode"] };

const sevenZa = path.join("node_modules", "7zip-bin", "win", "x64", "7za.exe");
if (fs.existsSync(sevenZa)) {
  fs.mkdirSync("bin", { recursive: true });
  fs.copyFileSync(sevenZa, path.join("bin", "7za.exe"));
}

if (watch) {
  const contexts = await Promise.all([esbuild.context(extension), esbuild.context(core), esbuild.context(uiTest)]);
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all([esbuild.build(extension), esbuild.build(core), esbuild.build(uiTest)]);
}
