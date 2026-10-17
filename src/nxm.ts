// nxm:// links: what the "Mod manager download" button on Nexus opens. VS Code cannot register a
// protocol for an extension, so EDGEdeck registers a small PowerShell forwarder under the current
// user's classes that opens vscode://edgemodders.edgedeck/nxm?url=<link>, which the extension's
// URI handler receives. Registration is explicit, and so is giving the links back.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const UriScheme = "vscode";
export const UriAuthority = "edgemodders.edgedeck";

export interface NxmLink {
  game: string;
  modId: number;
  fileId: number;
  key?: string;
  expires?: number;
  userId?: number;
}

/** Parses nxm://cyberpunk2077/mods/123/files/456?key=...&expires=...&user_id=... */
export function parseNxm(link: string): NxmLink {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error(`Not a link: ${link}`);
  }
  if (url.protocol !== "nxm:") throw new Error(`Not an nxm link: ${link}`);
  const m = /^\/mods\/(\d+)\/files\/(\d+)/.exec(url.pathname);
  if (!m) throw new Error(`Not a mod file link (collections are not supported): ${link}`);
  const expires = url.searchParams.get("expires");
  const userId = url.searchParams.get("user_id");
  return {
    game: url.hostname.toLowerCase(),
    modId: Number(m[1]),
    fileId: Number(m[2]),
    key: url.searchParams.get("key") ?? undefined,
    expires: expires ? Number(expires) : undefined,
    userId: userId ? Number(userId) : undefined,
  };
}

/** The command the registry runs for an nxm link: forward it to VS Code, percent-encoded. */
export function forwarderCommand(): string {
  const ps = `Start-Process ('${UriScheme}://${UriAuthority}/nxm?url=' + [uri]::EscapeDataString($args[0]))`;
  return `powershell.exe -NoProfile -WindowStyle Hidden -Command "& { ${ps} }" "%1"`;
}

const Key = "HKCU\\Software\\Classes\\nxm";

/** Registers EDGEdeck as the handler for nxm links for this user. Returns what handled them before, if known. */
export async function registerNxmHandler(): Promise<string | undefined> {
  const before = await currentNxmHandler();
  await run("reg", ["add", Key, "/ve", "/d", "URL:Nexus Mods link", "/f"], { windowsHide: true });
  await run("reg", ["add", Key, "/v", "URL Protocol", "/d", "", "/f"], { windowsHide: true });
  await run("reg", ["add", `${Key}\\shell\\open\\command`, "/ve", "/d", forwarderCommand(), "/f"], { windowsHide: true });
  return before;
}

/** Removes EDGEdeck's registration. Vortex re-registers itself when it starts, if the user wants it back. */
export async function unregisterNxmHandler(): Promise<void> {
  if ((await currentNxmHandler())?.includes(UriAuthority)) {
    await run("reg", ["delete", Key, "/f"], { windowsHide: true });
  }
}

/** The command currently registered for nxm links, or undefined. */
export async function currentNxmHandler(): Promise<string | undefined> {
  try {
    const { stdout } = await run("reg", ["query", `${Key}\\shell\\open\\command`, "/ve"], { windowsHide: true });
    const m = /REG_SZ\s+(.+)$/m.exec(stdout);
    return m?.[1].trim();
  } catch {
    return undefined;
  }
}

export function describeHandler(command: string | undefined): string {
  if (!command) return "nobody";
  if (command.includes(UriAuthority)) return "EDGEdeck";
  if (/vortex/i.test(command)) return "Vortex";
  if (/modorganizer|nxmhandler/i.test(command)) return "Mod Organizer";
  return command.slice(0, 60);
}
