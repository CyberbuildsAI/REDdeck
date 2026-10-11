// Bundles the extension (CommonJS, VS Code's module loader). `node esbuild.mjs --watch` rebuilds on change.
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

const extension = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const context = await esbuild.context(extension);
  await context.watch();
} else {
  await esbuild.build(extension);
}
