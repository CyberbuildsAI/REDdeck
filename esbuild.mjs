// Bundles the extension (CommonJS, VS Code's module loader) and the VS Code-free core on its own
// (for the smoke test). Copies the bundled 7za.exe next to the build so the .vsix carries it, and
// writes ThirdPartyNotices.txt for what the .vsix ships.
// `node esbuild.mjs --watch` rebuilds on change.
import * as esbuild from "esbuild";
import * as fs from "node:fs";
import * as path from "node:path";

const watch = process.argv.includes("--watch");

const common = { bundle: true, platform: "node", format: "cjs", target: "node18", sourcemap: true, logLevel: "info" };
const extension = { ...common, entryPoints: ["src/extension.ts"], outfile: "dist/extension.js", external: ["vscode"] };
const core = { ...common, entryPoints: ["src/core.ts"], outfile: "dist/core.js" };
const uiTest = { ...common, entryPoints: ["src/uiTest.ts"], outfile: "dist/uiTest.js", external: ["vscode"] };
// The MCP server ships in the .vsix with the SDK bundled in, so it runs from any Node without node_modules.
const mcp = { ...common, entryPoints: ["src/mcp.ts"], outfile: "dist/mcp.js" };

const sevenZa = path.join("node_modules", "7zip-bin", "win", "x64", "7za.exe");
if (fs.existsSync(sevenZa)) {
  fs.mkdirSync("bin", { recursive: true });
  fs.copyFileSync(sevenZa, path.join("bin", "7za.exe"));
}

if (watch) {
  const contexts = await Promise.all([esbuild.context(extension), esbuild.context(core), esbuild.context(uiTest), esbuild.context(mcp)]);
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  const [ext, , , server] = await Promise.all([esbuild.build({ ...extension, metafile: true }), esbuild.build(core), esbuild.build(uiTest), esbuild.build({ ...mcp, metafile: true })]);
  writeNotices([ext.metafile, server.metafile]);
}

/**
 * ThirdPartyNotices.txt: the license of every npm package bundled into what the .vsix ships
 * (extension.js and mcp.js), and 7-Zip's for bin/7za.exe. Rewritten on every build.
 */
function writeNotices(metafiles) {
  const pkgs = new Map();
  for (const m of metafiles) {
    for (const input of Object.keys(m.inputs)) {
      const hit = /^(.*node_modules\/((?:@[^/]+\/)?[^/]+))\//.exec(input.replaceAll("\\", "/"));
      if (hit) pkgs.set(hit[2], hit[1]);
    }
  }
  const parts = [
    "REDdeck includes third-party software. Their notices follow.",
    [
      "7-Zip 21.07 (bin/7za.exe, from the 7zip-bin npm package)",
      "Copyright (C) 1999-2021 Igor Pavlov.",
      "7za.exe is free software. Most of its code is under the GNU Lesser General Public License,",
      "version 2.1 or later; some parts are under the BSD 3-clause license.",
      "License text: https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html",
      "Source code and full license terms: https://www.7-zip.org/",
    ].join("\n"),
  ];
  for (const [name, dir] of [...pkgs].sort(([a], [b]) => a.localeCompare(b))) {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const file = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
    const text = file ? fs.readFileSync(path.join(dir, file), "utf8").trim() : `License: ${meta.license ?? "see the package"}`;
    parts.push(`${name} ${meta.version}\n\n${text}`);
  }
  fs.writeFileSync("ThirdPartyNotices.txt", parts.join(`\n\n${"-".repeat(78)}\n\n`) + "\n");
}
