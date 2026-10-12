// Facts about the game install: its version, read from the executable's version resource.

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export function gameExe(gamePath: string): string {
  return path.join(gamePath, "bin", "x64", "Cyberpunk2077.exe");
}

/** The product version of Cyberpunk2077.exe, for example "2.31", or undefined when unreadable. */
export async function gameVersion(gamePath: string): Promise<string | undefined> {
  const exe = gameExe(gamePath);
  if (!fs.existsSync(exe)) return undefined;
  try {
    const { stdout } = await run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", `(Get-Item -LiteralPath '${exe.replace(/'/g, "''")}').VersionInfo.ProductVersion`],
      { windowsHide: true, timeout: 15000 },
    );
    const v = stdout.trim();
    return v || undefined;
  } catch {
    return undefined;
  }
}
