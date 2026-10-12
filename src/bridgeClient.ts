// A small client for REDbridge, used only to look inside .archive files for conflicts. Spawns the
// bridge without a game (fast, light) and speaks JSON-RPC 2.0 over its stdio. REDbridge is GPL-3.0
// and lives in its own repository; the only contract with it is this protocol.

import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { createMessageConnection, StreamMessageReader, StreamMessageWriter, type MessageConnection } from "vscode-jsonrpc/node";

export interface BridgeInfo {
  version: string;
  wolvenKit: string;
  gameDir: string | null;
  gameLoaded: boolean;
}

export interface ArchiveFile {
  /** Resource hash as a decimal string. */
  hash: string;
  name: string;
  size: number;
  archive: string;
}

export interface ModArchiveInfo {
  path: string;
  name: string;
  files: number;
  items: ArchiveFile[];
}

/** The oldest bridge with archive.openMod. */
export const MinBridgeVersion = "0.4.0";

export class BridgeClient {
  private process: ChildProcess | undefined;
  private connection: MessageConnection | undefined;
  readonly log: string[] = [];

  constructor(
    readonly exe: string,
    readonly dotnetRoot?: string,
  ) {}

  get running(): boolean {
    return this.process !== undefined && this.process.exitCode === null;
  }

  start(): void {
    if (this.running) return;
    const env = { ...process.env };
    if (this.dotnetRoot) env.DOTNET_ROOT = this.dotnetRoot;
    const child = spawn(this.exe, [], { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.process = child;
    readline.createInterface({ input: child.stderr! }).on("line", (line) => this.log.push(line));
    child.on("error", () => this.dispose());
    child.on("exit", () => this.dispose());
    const connection = createMessageConnection(new StreamMessageReader(child.stdout!), new StreamMessageWriter(child.stdin!));
    connection.listen();
    this.connection = connection;
  }

  stop(): void {
    this.dispose();
    this.process?.kill();
    this.process = undefined;
  }

  private dispose(): void {
    this.connection?.dispose();
    this.connection = undefined;
  }

  private call<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.connection) return Promise.reject(new Error("The bridge is not running."));
    return this.connection.sendRequest<T>(method, params);
  }

  info(): Promise<BridgeInfo> {
    return this.call("bridge.info");
  }

  openMod(file: string): Promise<ModArchiveInfo> {
    return this.call("archive.openMod", { path: file });
  }
}

/** Finds REDbridge.exe: a configured file or folder, a sibling REDbridge checkout, or PATH. */
export function findBridge(configured: string, extensionRoot: string): string | undefined {
  const isFile = (p: string) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  };
  if (configured) {
    if (isFile(configured)) return configured;
    const inFolder = path.join(configured, "REDbridge.exe");
    return isFile(inFolder) ? inFolder : undefined;
  }
  const candidates = [
    path.join(extensionRoot, "bridge", "REDbridge.exe"),
    path.join(extensionRoot, "..", "REDbridge", "src", "REDbridge", "bin", "Release", "net10.0", "REDbridge.exe"),
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean).map((d) => path.join(d, "REDbridge.exe")),
  ];
  return candidates.find(isFile);
}

/** Compares dotted version strings numerically: negative when a is older than b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
