// Nexus Mods single sign-on: the way Vortex and Mod Organizer get a key without the user copying
// it. EDGEdeck opens a websocket to Nexus, gets a connection token, opens the Nexus authorise page
// in the browser, and when the user clicks Authorise the key arrives over the same socket.
// Protocol: https://github.com/Nexus-Mods/sso-integration-demo
//
// The authorise page needs an application slug that Nexus staff register by hand. Until EDGEdeck
// has one, the extension falls back to opening the API Access page and asking for the key.

import * as crypto from "node:crypto";

export const SsoUrl = "wss://sso.nexusmods.com";
/** The page with the user's personal API key, for the fallback. */
export const ApiKeysPage = "https://www.nexusmods.com/users/myaccount?tab=api+access";

export function ssoPageUrl(id: string, application: string): string {
  return `https://www.nexusmods.com/sso?id=${encodeURIComponent(id)}&application=${encodeURIComponent(application)}`;
}

/** The slice of a WebSocket that sign-in uses, so the test can fake one. */
export interface SsoSocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "message" | "close" | "error", listener: (event: any) => void): void;
}

export interface SignInOptions {
  /** The application slug Nexus registered for this app. */
  application: string;
  /** Opens the authorise page in the user's browser. */
  open: (url: string) => void | Thenable<unknown>;
  /** Makes a socket; defaults to the global WebSocket (Node 22 and later). */
  connect?: (url: string) => SsoSocket;
  /** How long to wait for the user, default five minutes. */
  timeoutMs?: number;
  signal?: AbortSignal;
  log?: (line: string) => void;
}

export function hasWebSocket(): boolean {
  return typeof (globalThis as { WebSocket?: unknown }).WebSocket === "function";
}

interface SsoMessage {
  success: boolean;
  data?: { connection_token?: string; api_key?: string } | null;
  error?: string | null;
}

/** Resolves with the API key once the user authorises EDGEdeck on Nexus. */
export function signIn(options: SignInOptions): Promise<string> {
  const connect = options.connect ?? ((url: string) => new (globalThis as unknown as { WebSocket: new (u: string) => SsoSocket }).WebSocket(url));
  const log = options.log ?? (() => undefined);
  const id = crypto.randomUUID();
  let token: string | null = null;
  let opened = false;
  let done = false;
  let attempts = 0;
  let socket: SsoSocket | undefined;

  return new Promise<string>((resolve, reject) => {
    const finish = (err?: Error, key?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      try {
        socket?.close();
      } catch {
        // Already closed.
      }
      if (key) resolve(key);
      else reject(err ?? new Error("Nexus sign-in failed"));
    };
    const onAbort = () => finish(new Error("Sign-in cancelled"));
    const timer = setTimeout(() => finish(new Error("Nexus did not answer in time. Try again, and approve EDGEdeck in the browser tab that opens.")), options.timeoutMs ?? 5 * 60_000);
    options.signal?.addEventListener("abort", onAbort);
    if (options.signal?.aborted) return onAbort();

    const attempt = () => {
      if (done) return;
      attempts++;
      log(`Nexus sign-in: connecting (${attempts})`);
      try {
        socket = connect(SsoUrl);
      } catch (err) {
        return finish(err instanceof Error ? err : new Error(String(err)));
      }
      const s = socket;
      s.addEventListener("open", () => s.send(JSON.stringify({ id, token, protocol: 2 })));
      s.addEventListener("message", (event: { data: unknown }) => {
        let msg: SsoMessage;
        try {
          msg = JSON.parse(String(event.data)) as SsoMessage;
        } catch {
          return;
        }
        if (!msg.success) return finish(new Error(`Nexus sign-in refused: ${msg.error ?? "unknown error"}`));
        if (msg.data?.connection_token) {
          token = msg.data.connection_token;
          if (!opened) {
            opened = true;
            log("Nexus sign-in: opening the authorise page");
            void options.open(ssoPageUrl(id, options.application));
          }
        }
        if (msg.data?.api_key) {
          log("Nexus sign-in: key received");
          finish(undefined, msg.data.api_key);
        }
      });
      s.addEventListener("error", (event: { message?: string }) => log(`Nexus sign-in: socket error${event?.message ? `: ${event.message}` : ""}`));
      s.addEventListener("close", () => {
        if (done) return;
        if (attempts >= 5) return finish(new Error("Lost the connection to Nexus. Check the network and try again."));
        log("Nexus sign-in: connection closed, reconnecting");
        setTimeout(attempt, 1000);
      });
    };
    attempt();
  });
}
