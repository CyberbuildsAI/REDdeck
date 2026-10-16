// Facts about the game install: its version, read from the executable's version resource.

import { execFile, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export function gameExe(gamePath: string): string {
  return path.join(gamePath, "bin", "x64", "Cyberpunk2077.exe");
}

/**
 * Whether Cyberpunk 2077 is running. The game keeps mod files open, so Windows refuses to replace
 * or delete them until it quits (a deploy then fails with EPERM). Any copy of the game counts.
 */
export function gameRunning(): boolean {
  if (process.platform !== "win32") return false;
  try {
    const out = execFileSync("tasklist", ["/FI", "IMAGENAME eq Cyberpunk2077.exe", "/NH", "/FO", "CSV"], { encoding: "utf8", windowsHide: true, timeout: 5000 });
    return /cyberpunk2077\.exe/i.test(out);
  } catch {
    return false;
  }
}

export function isGameFolder(gamePath: string): boolean {
  return !!gamePath && fs.existsSync(gameExe(gamePath));
}

/** A registry string value, or undefined. */
function regValue(key: string, name: string): string | undefined {
  try {
    const out = execFileSync("reg.exe", ["query", key, "/v", name], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const m = new RegExp(`${name}\\s+REG_\\w+\\s+(.+)`).exec(out);
    return m?.[1].trim();
  } catch {
    return undefined;
  }
}

/** Every Steam library folder, from steamapps/libraryfolders.vdf. */
export function steamLibraries(): string[] {
  const roots = [regValue("HKCU\\Software\\Valve\\Steam", "SteamPath"), regValue("HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "InstallPath"), "C:\\Program Files (x86)\\Steam"]
    .filter((r): r is string => !!r)
    .map((r) => r.replace(/\//g, "\\"));
  const libs = new Set<string>();
  for (const r of roots) {
    libs.add(r);
    const vdf = path.join(r, "steamapps", "libraryfolders.vdf");
    if (!fs.existsSync(vdf)) continue;
    for (const m of fs.readFileSync(vdf, "utf8").matchAll(/"path"\s+"([^"]+)"/g)) libs.add(m[1].replace(/\\\\/g, "\\"));
  }
  return [...libs];
}

/** Where Cyberpunk 2077 is installed: Steam libraries, GOG, Epic, the Steam default. */
export function findGame(): string | undefined {
  const candidates = [
    ...steamLibraries().map((l) => path.join(l, "steamapps", "common", "Cyberpunk 2077")),
    regValue("HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games\\1423049311", "path"),
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Epic Games", "Cyberpunk 2077"),
    path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "GOG Galaxy", "Games", "Cyberpunk 2077"),
  ].filter((c): c is string => !!c);
  return candidates.find(isGameFolder);
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
