// Nexus Mods, through its public REST API (v1), with the user's personal API key or the access
// token from an OAuth sign-in (nexusOAuth.ts). REDdeck caches what it learns in mod.json and asks
// sparingly: the API allows 2,500 requests a day.
// https://help.nexusmods.com/article/114-api-acceptable-use-policy

import * as crypto from "node:crypto";
import * as fs from "node:fs";

export const NexusGame = "cyberpunk2077";
export const NexusApi = "https://api.nexusmods.com/v1";
export const NexusSite = "https://www.nexusmods.com/cyberpunk2077/mods";

export interface NexusModInfo {
  mod_id: number;
  name: string;
  version: string;
  author: string;
  summary: string;
  picture_url?: string;
  updated_timestamp: number;
  available: boolean;
}

export interface NexusFile {
  file_id: number;
  name: string;
  version: string;
  category_name: "MAIN" | "UPDATE" | "OPTIONAL" | "OLD_VERSION" | "MISCELLANEOUS" | "ARCHIVED" | null;
  is_primary: boolean;
  size_kb: number;
  file_name: string;
  uploaded_timestamp: number;
}

export interface NexusFiles {
  files: NexusFile[];
  file_updates: { old_file_id: number; new_file_id: number; new_file_name: string; uploaded_timestamp: number }[];
}

export interface NexusUser {
  user_id: number;
  name: string;
  is_premium: boolean;
  is_supporter: boolean;
}

export interface NexusMd5Match {
  mod: NexusModInfo;
  file_details: NexusFile & { md5: string };
}

export interface NexusLink {
  name: string;
  short_name: string;
  URI: string;
}

export interface RateLimit {
  dailyRemaining: number;
  hourlyRemaining: number;
}

export class NexusError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A personal API key, or the access token of an OAuth sign-in. */
export type NexusAuth = { apiKey: string } | { bearer: string };

export interface NexusClientOptions {
  /** The API base; the test points it at a fake. */
  api?: string;
  /** Called once when a Bearer token is refused, to renew it; returns the new token or nothing. */
  refresh?: () => Promise<string | undefined>;
}

export class NexusClient {
  rate: RateLimit | undefined;
  private auth: NexusAuth;

  constructor(
    auth: string | NexusAuth,
    private readonly version: string,
    private readonly options: NexusClientOptions = {},
  ) {
    this.auth = typeof auth === "string" ? { apiKey: auth } : auth;
  }

  get usesToken(): boolean {
    return "bearer" in this.auth;
  }

  private async get<T>(path: string, retried = false): Promise<T> {
    const res = await fetch(`${this.options.api ?? NexusApi}${path}`, {
      headers: {
        ...("bearer" in this.auth ? { authorization: `Bearer ${this.auth.bearer}` } : { apikey: this.auth.apiKey }),
        accept: "application/json",
        "user-agent": `REDdeck/${this.version} (Windows; +https://github.com/Edgemodders/REDdeck)`,
        "application-name": "REDdeck",
        "application-version": this.version,
      },
    });
    const daily = Number(res.headers.get("x-rl-daily-remaining"));
    const hourly = Number(res.headers.get("x-rl-hourly-remaining"));
    if (!Number.isNaN(daily)) this.rate = { dailyRemaining: daily, hourlyRemaining: hourly };
    if (res.status === 401 && "bearer" in this.auth && this.options.refresh && !retried) {
      // The access token ran out between the check and the call: renew once and try again.
      await res.text().catch(() => "");
      const bearer = await this.options.refresh();
      if (bearer) {
        this.auth = { bearer };
        return this.get<T>(path, true);
      }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const why =
        res.status === 401 ? ("bearer" in this.auth ? "the sign-in was not accepted; sign in again" : "the API key was not accepted")
        : res.status === 404 ? "not found on Nexus"
        : res.status === 429 ? "Nexus rate limit reached; try again later"
        : `${res.status} ${res.statusText}`;
      throw new NexusError(`Nexus: ${why}${text ? ` (${text.slice(0, 120)})` : ""}`, res.status);
    }
    return (await res.json()) as T;
  }

  validate(): Promise<NexusUser> {
    return this.get("/users/validate.json");
  }

  mod(modId: number): Promise<NexusModInfo> {
    return this.get(`/games/${NexusGame}/mods/${modId}.json`);
  }

  files(modId: number): Promise<NexusFiles> {
    return this.get(`/games/${NexusGame}/mods/${modId}/files.json`);
  }

  /** Download links. Premium members need no key; others pass the key and expiry from an nxm link. */
  downloadLinks(modId: number, fileId: number, key?: string, expires?: number): Promise<NexusLink[]> {
    const q = key ? `?key=${encodeURIComponent(key)}&expires=${expires ?? ""}` : "";
    return this.get(`/games/${NexusGame}/mods/${modId}/files/${fileId}/download_link.json${q}`);
  }

  /** Identifies a file the user already has by its MD5. */
  md5Search(md5: string): Promise<NexusMd5Match[]> {
    return this.get(`/games/${NexusGame}/mods/md5_search/${md5}.json`);
  }
}

export function md5Of(file: string): string {
  return crypto.createHash("md5").update(fs.readFileSync(file)).digest("hex");
}

/** The newest main file of a mod, or the newest file at all when none is marked main. */
export function newestFile(files: NexusFiles): NexusFile | undefined {
  const live = files.files.filter((f) => f.category_name !== "OLD_VERSION" && f.category_name !== "ARCHIVED");
  const main = live.filter((f) => f.category_name === "MAIN" || f.is_primary);
  const pick = (main.length ? main : live).sort((a, b) => b.uploaded_timestamp - a.uploaded_timestamp);
  return pick[0];
}

/** Compares dotted version strings numerically where possible; falls back to string compare. */
export function versionNewer(candidate: string, current: string): boolean {
  if (!current) return false;
  const pa = candidate.split(/[.\-]/).map((n) => parseInt(n, 10));
  const pb = current.split(/[.\-]/).map((n) => parseInt(n, 10));
  if (pa.some(Number.isNaN) || pb.some(Number.isNaN)) return candidate !== current && candidate > current;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

export function modPageUrl(modId: number): string {
  return `${NexusSite}/${modId}`;
}

/** Downloads a file to disk, reporting progress in bytes. */
export async function download(url: string, dest: string, progress?: (received: number, total: number) => void): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const out = fs.createWriteStream(dest);
  let received = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
      progress?.(received, total);
    }
  } finally {
    await new Promise<void>((r) => out.end(() => r()));
  }
}
