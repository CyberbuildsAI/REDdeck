// Getting REDbridge without knowing where it goes: the latest release from GitHub, unzipped into
// EDGEdeck's own storage folder, and the .NET 10 runtime per user when the machine has none.
// REDbridge is GPL-3.0 and lives in its own repository; EDGEdeck only downloads it.

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { extractArchive } from "./extract";
import { download } from "./nexus";

export const BridgeRepo = "Edgemodders/REDbridge";
const DotnetInstallScript = "https://dot.net/v1/dotnet-install.ps1";

export interface BridgeRelease {
  tag: string;
  version: string;
  assetName: string;
  url: string;
  size: number;
  page: string;
}

/** The newest release with a Windows x64 zip. */
export async function latestBridgeRelease(): Promise<BridgeRelease> {
  const res = await fetch(`https://api.github.com/repos/${BridgeRepo}/releases/latest`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "EDGEdeck" } });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for the latest REDbridge release.`);
  const rel = (await res.json()) as { tag_name: string; html_url: string; assets: { name: string; browser_download_url: string; size: number }[] };
  const asset = rel.assets.find((a) => /win-x64\.zip$/i.test(a.name));
  if (!asset) throw new Error(`Release ${rel.tag_name} has no Windows x64 zip.`);
  return { tag: rel.tag_name, version: rel.tag_name.replace(/^v/, ""), assetName: asset.name, url: asset.browser_download_url, size: asset.size, page: rel.html_url };
}

export function perUserDotnetRoot(): string {
  return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"), "Microsoft", "dotnet");
}

function hasNet10(root: string): boolean {
  try {
    return fs.readdirSync(path.join(root, "shared", "Microsoft.NETCore.App")).some((v) => v.startsWith("10."));
  } catch {
    return false;
  }
}

/** Where a .NET 10 runtime is, machine-wide or per user, or undefined. */
export function dotnet10Root(): string | undefined {
  const machine = path.join(process.env.ProgramFiles ?? "C:\\Program Files", "dotnet");
  if (hasNet10(machine)) return machine;
  if (hasNet10(perUserDotnetRoot())) return perUserDotnetRoot();
  return undefined;
}

/** Installs the .NET 10 runtime for the current user with Microsoft's script; no admin needed. */
export async function installDotnetRuntime(log: (line: string) => void): Promise<string> {
  const root = perUserDotnetRoot();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "edgedeck-dotnet-"));
  const script = path.join(temp, "dotnet-install.ps1");
  try {
    await download(DotnetInstallScript, script);
    log(`Installing the .NET 10 runtime into ${root}`);
    await new Promise<void>((resolve, reject) => {
      execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Channel", "10.0", "-Runtime", "dotnet", "-InstallDir", root, "-NoPath"], { windowsHide: true, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
        for (const line of `${stdout}\n${stderr}`.split(/\r?\n/)) if (line.trim()) log(`  ${line.trim()}`);
        err ? reject(new Error(`dotnet-install failed: ${err.message}`)) : resolve();
      });
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  if (!hasNet10(root)) throw new Error("The .NET 10 runtime did not install. See the log.");
  return root;
}

/** The newest REDbridge.exe under EDGEdeck's storage folder, if any. */
export function installedBridge(storageDir: string): string | undefined {
  const dir = path.join(storageDir, "bridge");
  try {
    const tags = fs.readdirSync(dir).filter((t) => fs.existsSync(path.join(dir, t, "REDbridge.exe")));
    tags.sort((a, b) => compareTags(b, a));
    return tags.length ? path.join(dir, tags[0], "REDbridge.exe") : undefined;
  } catch {
    return undefined;
  }
}

/** Removes every fetched REDbridge except the one to keep; each is about 70 MB. Returns what went. */
export function removeOlderBridges(storageDir: string, keepTag: string): string[] {
  const dir = path.join(storageDir, "bridge");
  const gone: string[] = [];
  try {
    for (const tag of fs.readdirSync(dir)) {
      if (tag === keepTag) continue;
      fs.rmSync(path.join(dir, tag), { recursive: true, force: true });
      gone.push(tag);
    }
  } catch {
    // Nothing fetched yet.
  }
  return gone;
}

function compareTags(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Downloads a release and unzips it to <storage>/bridge/<tag>. Returns the exe path. */
export async function installBridge(release: BridgeRelease, storageDir: string, sevenZa: string | undefined, progress: (received: number, total: number) => void, log: (line: string) => void): Promise<string> {
  const target = path.join(storageDir, "bridge", release.tag);
  const exe = path.join(target, "REDbridge.exe");
  if (fs.existsSync(exe)) return exe;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "edgedeck-bridge-"));
  const zip = path.join(temp, release.assetName);
  try {
    log(`Downloading ${release.assetName} (${Math.round(release.size / 1048576)} MB) from ${release.page}`);
    await download(release.url, zip, (r, t) => progress(r, t || release.size));
    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    await extractArchive(zip, target, sevenZa);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  if (!fs.existsSync(exe)) throw new Error("The zip did not contain REDbridge.exe.");
  log(`REDbridge ${release.version} installed at ${exe}`);
  return exe;
}
