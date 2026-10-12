// REDmod packages (the game's own mod format under mods/) need the game's redMod.exe to compile
// them into r6/cache/modded before a launch with -modded. REDdeck runs it after a deploy when any
// enabled mod is a REDmod package, in list order.

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import type { Library } from "./library";

const run = promisify(execFile);

export function redModExe(gamePath: string): string {
  return path.join(gamePath, "tools", "redmod", "bin", "redMod.exe");
}

/** REDmod package folder names the enabled mods deploy, in list order. */
export function enabledRedmodPackages(lib: Library): string[] {
  const names: string[] = [];
  for (const mod of lib.mods) {
    if (!mod.enabled) continue;
    for (const f of mod.files) {
      const m = /^mods\/([^/]+)\//i.exec(f);
      if (m && !names.includes(m[1])) names.push(m[1]);
    }
  }
  return names;
}

export interface RedmodResult {
  ran: boolean;
  packages: string[];
  output: string;
}

/** Writes the mod list and runs `redMod.exe deploy`. Skips when there is nothing to deploy or no tool. */
export async function deployRedmod(lib: Library, gamePath: string, log?: (line: string) => void): Promise<RedmodResult> {
  const packages = enabledRedmodPackages(lib);
  const exe = redModExe(gamePath);
  if (!packages.length) return { ran: false, packages, output: "no REDmod packages enabled" };
  if (!fs.existsSync(exe)) return { ran: false, packages, output: `redMod.exe not found at ${exe}; the REDmod tools are a free DLC on the game's store page` };
  const listFile = path.join(lib.root, "redmod-modlist.txt");
  fs.writeFileSync(listFile, packages.join("\r\n") + "\r\n");
  const args = ["deploy", `-root=${gamePath}`, `-modlist=${listFile}`, `-rttiSchemaPath=${path.join(gamePath, "tools", "redmod", "metadata.json")}`];
  log?.(`redMod.exe ${args.join(" ")}`);
  try {
    const { stdout, stderr } = await run(exe, args, { cwd: path.dirname(exe), windowsHide: true, maxBuffer: 1 << 26 });
    const output = (stdout + stderr).trim();
    for (const line of output.split(/\r?\n/)) if (line.trim()) log?.(`  ${line}`);
    return { ran: true, packages, output };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    const output = ((e.stdout ?? "") + (e.stderr ?? "")).trim() || e.message;
    throw new Error(`REDmod deploy failed: ${output.split(/\r?\n/).slice(-3).join(" ")}`);
  }
}
