// Nexus Mods sign-in with OAuth 2 and PKCE, the way Vortex signs in since 2023. EDGEdeck listens
// on a loopback port, opens the Nexus authorise page in the browser with a code challenge, gets the
// code back on that port when the user approves, and trades it for an access token and a refresh
// token. The access token goes to the REST API as a Bearer token in place of the personal key.
// RFC 7636 (PKCE), RFC 8252 (loopback redirects for native apps).
//
// Nexus assigns the client id by hand. Until EDGEdeck has one, sign-in falls back to the personal
// key, which stays as a choice afterwards too.

import * as crypto from "node:crypto";
import * as http from "node:http";

export const OAuthBase = "https://users.nexusmods.com/oauth";
export const OAuthScope = "openid profile email";

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds after which the access token is dead. */
  expiresAt: number;
}

/** What Nexus puts in the access token about the user; enough for "signed in as". */
export interface TokenUser {
  id: number;
  name: string;
  premium: boolean;
  supporter: boolean;
}

interface TokenReply {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope?: string;
}

export interface OAuthOptions {
  /** The client id Nexus assigned to EDGEdeck. */
  clientId: string;
  /** Opens the authorise page in the user's browser. */
  open: (url: string) => void | Thenable<unknown>;
  /** The authorise and token endpoints' base; the test points it at a fake. */
  base?: string;
  /** How long to wait for the user, default five minutes. */
  timeoutMs?: number;
  signal?: AbortSignal;
  log?: (line: string) => void;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** A fresh verifier and its S256 challenge. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(32));
  return { verifier, challenge: b64url(crypto.createHash("sha256").update(verifier).digest()) };
}

export function authorizeUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string; base?: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    scope: OAuthScope,
    code_challenge_method: "S256",
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    state: p.state,
    code_challenge: p.challenge,
  });
  return `${p.base ?? OAuthBase}/authorize?${q}`;
}

async function tokenRequest(base: string, form: Record<string, string>): Promise<OAuthTokens> {
  const res = await fetch(`${base}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  const text = await res.text();
  let reply: Partial<TokenReply> & { error?: string; error_description?: string } = {};
  try {
    reply = JSON.parse(text);
  } catch {
    // Not JSON: an HTML error page, most likely.
  }
  if (!res.ok || !reply.access_token || !reply.refresh_token) {
    const why = reply.error ? `${reply.error}${reply.error_description ? `: ${reply.error_description}` : ""}` : `${res.status} ${res.statusText}`;
    throw new Error(`Nexus did not issue a token (${why})`);
  }
  return { accessToken: reply.access_token, refreshToken: reply.refresh_token, expiresAt: Date.now() + (reply.expires_in ?? 3600) * 1000 };
}

/** Trades the code from the redirect for tokens. */
export function exchangeCode(p: { clientId: string; redirectUri: string; code: string; verifier: string; base?: string }): Promise<OAuthTokens> {
  return tokenRequest(p.base ?? OAuthBase, { grant_type: "authorization_code", client_id: p.clientId, redirect_uri: p.redirectUri, code: p.code, code_verifier: p.verifier });
}

/** A new token pair from the refresh token; the old refresh token is spent. */
export function refreshTokens(p: { clientId: string; refreshToken: string; base?: string }): Promise<OAuthTokens> {
  return tokenRequest(p.base ?? OAuthBase, { grant_type: "refresh_token", client_id: p.clientId, refresh_token: p.refreshToken });
}

/** True when the access token is dead or dies within the next minute. */
export function needsRefresh(tokens: OAuthTokens, now = Date.now()): boolean {
  return tokens.expiresAt - 60_000 <= now;
}

/** Reads the user out of the access token, which is a JWT; Nexus puts the name and roles in it. */
export function tokenUser(accessToken: string): TokenUser | undefined {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8")) as { user?: { id?: number; username?: string; membership_roles?: string[] } };
    const u = payload.user;
    if (!u || typeof u.username !== "string") return undefined;
    const roles = u.membership_roles ?? [];
    return { id: u.id ?? 0, name: u.username, premium: roles.includes("premium"), supporter: roles.includes("supporter") };
  } catch {
    return undefined;
  }
}

/** The user from the userinfo endpoint, for a token that does not carry it. */
export async function fetchUser(accessToken: string, base = OAuthBase): Promise<TokenUser> {
  const res = await fetch(`${base}/userinfo`, { headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" } });
  if (!res.ok) throw new Error(`Nexus did not accept the token (${res.status} ${res.statusText})`);
  const info = (await res.json()) as { sub?: string; name?: string; membership_roles?: string[] };
  const roles = info.membership_roles ?? [];
  return { id: Number(info.sub) || 0, name: info.name ?? "", premium: roles.includes("premium"), supporter: roles.includes("supporter") };
}

function resultPage(ok: boolean, detail?: string): string {
  const body = ok
    ? "<h1>Signed in</h1><p>EDGEdeck has what it needs. You can close this tab and go back to VS Code.</p>"
    : `<h1>Not signed in</h1><p>${detail ?? "Nexus did not approve the sign-in."} Go back to VS Code and try again.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>EDGEdeck</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0c10;color:#e6e6e6;font:16px/1.5 system-ui,sans-serif}
main{max-width:28rem;padding:2rem;text-align:center}h1{color:${ok ? "#c8f55a" : "#ff5e5e"};font-weight:600;margin:0 0 .5rem}p{margin:0;opacity:.85}</style></head>
<body><main>${body}</main></body></html>`;
}

/** Signs in: a loopback listener, the browser, the code, the tokens. */
export function signInWithOAuth(options: OAuthOptions): Promise<OAuthTokens> {
  const base = options.base ?? OAuthBase;
  const log = options.log ?? (() => undefined);
  const { verifier, challenge } = pkce();
  const state = crypto.randomUUID();
  let done = false;

  return new Promise<OAuthTokens>((resolve, reject) => {
    const server = http.createServer();
    const finish = (err?: Error, tokens?: OAuthTokens) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      server.close();
      if (tokens) resolve(tokens);
      else reject(err ?? new Error("Nexus sign-in failed"));
    };
    const onAbort = () => finish(new Error("Sign-in cancelled"));
    const timer = setTimeout(() => finish(new Error("Nexus did not answer in time. Try again, and approve EDGEdeck in the browser tab that opens.")), options.timeoutMs ?? 5 * 60_000);
    options.signal?.addEventListener("abort", onAbort);
    if (options.signal?.aborted) return onAbort();

    let redirectUri = "";
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const gotState = url.searchParams.get("state");
      if (url.pathname === "/favicon.ico" || (!code && !error)) {
        res.writeHead(404).end();
        return;
      }
      if (gotState !== state) {
        // Not our sign-in: a stale tab, or someone else on the machine. Ignore it and keep waiting.
        log("Nexus sign-in: ignored a redirect with the wrong state");
        res.writeHead(400, { "content-type": "text/html; charset=utf-8" }).end(resultPage(false, "This tab belongs to an older sign-in."));
        return;
      }
      if (error) {
        const detail = url.searchParams.get("error_description") ?? error;
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(resultPage(false, detail));
        finish(new Error(`Nexus refused the sign-in: ${detail}`));
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(resultPage(true));
      log("Nexus sign-in: code received, asking for the token");
      exchangeCode({ clientId: options.clientId, redirectUri, code: code!, verifier, base }).then(
        (tokens) => {
          log("Nexus sign-in: token received");
          finish(undefined, tokens);
        },
        (err: unknown) => finish(err instanceof Error ? err : new Error(String(err))),
      );
    });
    server.on("error", (err) => finish(err));
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") return finish(new Error("Could not open a local port for the sign-in."));
      redirectUri = `http://127.0.0.1:${addr.port}`;
      log(`Nexus sign-in: listening on ${redirectUri}, opening the authorise page`);
      void options.open(authorizeUrl({ clientId: options.clientId, redirectUri, challenge, state, base }));
    });
  });
}
