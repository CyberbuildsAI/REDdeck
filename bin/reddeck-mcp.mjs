#!/usr/bin/env node
// REDdeck's MCP server on its own, for assistants and plugins: the same server as `reddeck mcp` and
// the one the extension registers in VS Code, over stdio.
//
//   reddeck-mcp [--library <folder>] [--game <folder>]
//
// The library defaults to %USERPROFILE%\REDdeck and the game is found through Steam, GOG or Epic.
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
createRequire(import.meta.url)(path.join(root, "dist", "mcp.js"));
