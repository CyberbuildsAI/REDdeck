// Assembles the npm package @edgemodders/reddeck-mcp in dist/npm from the built extension files:
// the MCP server and the command line, with the bundled 7za.exe. Run after npm run build.
//   node scripts/npm-package.mjs          then: npm publish dist/npm
// The version is REDdeck's, so the extension and the tools never drift apart.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "dist", "npm");
const ext = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const files = [
  ["dist/mcp.js", "dist/mcp.js"],
  ["dist/core.js", "dist/core.js"],
  ["bin/reddeck.mjs", "bin/reddeck.mjs"],
  ["bin/reddeck-mcp.mjs", "bin/reddeck-mcp.mjs"],
  ["bin/7za.exe", "bin/7za.exe"],
  ["ThirdPartyNotices.txt", "ThirdPartyNotices.txt"],
  ["LICENSE", "LICENSE"],
  ["docs/npm.md", "README.md"],
];
fs.rmSync(out, { recursive: true, force: true });
for (const [from, to] of files) {
  const src = path.join(root, from);
  if (!fs.existsSync(src)) throw new Error(`${from} is missing; run npm run build first`);
  fs.mkdirSync(path.dirname(path.join(out, to)), { recursive: true });
  fs.copyFileSync(src, path.join(out, to));
}

const pkg = {
  name: "@edgemodders/reddeck-mcp",
  version: ext.version,
  description: "REDdeck's MCP server and command line: manage Cyberpunk 2077 mods (add, turn on or off, order, deploy, undo, conflicts, loadouts) from an AI assistant or a script.",
  license: ext.license,
  author: "Edgemodders",
  homepage: "https://edgemodders.github.io/REDdeck/",
  repository: { type: "git", url: "git+https://github.com/Edgemodders/REDdeck.git" },
  bugs: { url: "https://github.com/Edgemodders/REDdeck/issues" },
  keywords: ["cyberpunk", "cyberpunk2077", "modding", "mod manager", "mcp", "model context protocol", "claude"],
  bin: { "reddeck-mcp": "bin/reddeck-mcp.mjs", reddeck: "bin/reddeck.mjs" },
  files: files.map(([, to]) => to),
  os: ["win32"],
  engines: { node: ">=20" },
  publishConfig: { access: "public", provenance: true },
};
fs.writeFileSync(path.join(out, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
console.log(`dist/npm: ${pkg.name} ${pkg.version}, ${files.length} files`);
