#!/usr/bin/env bun
import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/cli.ts
import { unlinkSync } from "node:fs";

// src/credentials.ts
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";

// src/paths.ts
import { homedir } from "node:os";
import { join } from "node:path";
var DEFAULT_CREDENTIALS_PATH = join(homedir(), ".config", "membase", "cursor-credentials.json");
var DEFAULT_API_URL = "https://api.membase.so";

// src/credentials.ts
function defaultCredentialsPath() {
  return DEFAULT_CREDENTIALS_PATH;
}
function saveCredentials(path, creds) {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 448 });
  try {
    chmodSync(dir, 448);
  } catch {}
  const tmp = `${path}.tmp`;
  const body = `${JSON.stringify(creds, null, 2)}
`;
  writeFileSync(tmp, body, { encoding: "utf-8", mode: 384 });
  renameSync(tmp, path);
  try {
    chmodSync(path, 384);
  } catch {}
}

// src/oauth.ts
import { createServer } from "node:http";
function b64url(input) {
  return btoa(Array.from(input, (b) => String.fromCharCode(b)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function createPkce() {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64url(verifierBytes);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = b64url(new Uint8Array(digest));
  return { verifier, challenge };
}
function randomState() {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}
async function registerOAuthClient(apiUrl, redirectUri, clientName) {
  const response = await fetch(`${apiUrl}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "memory:read memory:write offline_access"
    })
  });
  if (!response.ok) {
    throw new Error(`OAuth client registration failed (${response.status})`);
  }
  const data = await response.json();
  if (!data.client_id) {
    throw new Error("OAuth registration returned no client_id");
  }
  return data.client_id;
}
async function exchangeCode(apiUrl, code, clientId, redirectUri, codeVerifier) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier
  });
  const response = await fetch(`${apiUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OAuth token exchange failed (${response.status}): ${text}`);
  }
  return await response.json();
}
function startOAuthCallbackListener(preferredPort, expectedState, timeoutMs = 180000, maxPortAttempts = 20) {
  const server = createServer();
  let timedOut = false;
  let timeout;
  const close = () => {
    if (server.listening)
      server.close();
  };
  const waitForCode = new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn) => {
      if (settled)
        return;
      settled = true;
      fn();
    };
    timeout = setTimeout(() => {
      timedOut = true;
      settle(() => {
        close();
        reject(new Error("OAuth callback timed out"));
      });
    }, timeoutMs);
    server.on("request", (req, res) => {
      try {
        if (timedOut) {
          res.statusCode = 408;
          res.end("Timed out");
          return;
        }
        const addr = server.address();
        const port = addr && typeof addr !== "string" ? addr.port : preferredPort;
        const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
        if (url.pathname !== "/oauth/callback") {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        if (error) {
          settle(() => {
            if (timeout)
              clearTimeout(timeout);
            close();
            reject(new Error(`OAuth authorization failed: ${error}`));
          });
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end("<h3>Authorization failed.</h3><p>You can close this tab.</p>");
          return;
        }
        if (!code || !state) {
          settle(() => {
            if (timeout)
              clearTimeout(timeout);
            close();
            reject(new Error("Missing OAuth code or state parameter"));
          });
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end("<h3>Missing OAuth code/state.</h3><p>You can close this tab.</p>");
          return;
        }
        if (state !== expectedState) {
          settle(() => {
            if (timeout)
              clearTimeout(timeout);
            close();
            reject(new Error("OAuth state mismatch"));
          });
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end("<h3>Invalid OAuth state.</h3><p>You can close this tab.</p>");
          return;
        }
        settle(() => {
          if (timeout)
            clearTimeout(timeout);
          close();
          resolve({ code });
        });
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end("<h3>Membase connected.</h3><p>You can close this tab and return to the terminal.</p>");
      } catch (err) {
        settle(() => {
          if (timeout)
            clearTimeout(timeout);
          close();
          reject(err instanceof Error ? err : new Error(String(err)));
        });
        res.statusCode = 500;
        res.end("Server error");
      }
    });
  });
  const boundPort = new Promise((resolve, reject) => {
    const tryListen = (port, attemptsLeft) => {
      const onError = (error) => {
        server.off("listening", onListening);
        if (error.code === "EADDRINUSE" && attemptsLeft > 0) {
          tryListen(port + 1, attemptsLeft - 1);
          return;
        }
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Failed to get callback server address"));
          return;
        }
        resolve(address.port);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    };
    tryListen(preferredPort, maxPortAttempts);
  });
  return boundPort.then((port) => ({
    port,
    waitForCode,
    close
  }));
}
async function openBrowser(url) {
  const platform = process.platform;
  const opener = platform === "darwin" ? "open" : platform === "linux" ? "xdg-open" : null;
  if (!opener) {
    console.log(`Open this URL manually:
`, url);
    return;
  }
  let exitCode;
  if (typeof Bun !== "undefined") {
    exitCode = Bun.spawnSync({
      cmd: [opener, url],
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore"
    }).exitCode;
  } else {
    const { spawnSync } = await import("node:child_process");
    exitCode = spawnSync(opener, [url], { stdio: "ignore" }).status;
  }
  if (exitCode !== 0) {
    console.log(`Open this URL manually:
`, url);
  }
}

// src/cli.ts
function printHelp() {
  console.log(`Membase Cursor plugin CLI

Usage:
  membase-cursor login [--api-url <url>] [--port <n>] [--credentials <path>]
  membase-cursor logout [--credentials <path>]
  membase-cursor help

Session hooks use the saved OAuth token at ${DEFAULT_CREDENTIALS_PATH} by default.
Connect MCP in Cursor separately (OAuth) for add_memory / search_memory tools.
`);
}
async function cmdLogin(args) {
  let apiUrl = DEFAULT_API_URL;
  let port = 8765;
  let credPath = defaultCredentialsPath();
  for (let i = 0;i < args.length; i++) {
    const a = args[i];
    if (a === "--api-url") {
      const v = args[++i];
      if (v)
        apiUrl = v.replace(/\/$/, "");
    } else if (a === "--port") {
      const v = args[++i];
      if (v)
        port = Number.parseInt(v, 10) || 8765;
    } else if (a === "--credentials") {
      const v = args[++i];
      if (v)
        credPath = v;
    }
  }
  const { verifier, challenge } = await createPkce();
  const state = randomState();
  console.log("Starting local OAuth callback listener...");
  const listener = await startOAuthCallbackListener(port, state);
  const redirectUri = `http://127.0.0.1:${listener.port}/oauth/callback`;
  const clientId = await registerOAuthClient(apiUrl, redirectUri, "Membase Cursor Plugin");
  const authUrl = new URL(`${apiUrl}/oauth/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "memory:read memory:write offline_access");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  await openBrowser(authUrl.toString());
  console.log("Waiting for browser authorization...");
  if (listener.port !== port) {
    console.warn(`Port ${port} in use; using callback port ${listener.port} instead.`);
  }
  const { code } = await listener.waitForCode;
  const token = await exchangeCode(apiUrl, code, clientId, redirectUri, verifier);
  if (!token.refresh_token) {
    throw new Error("No refresh_token returned; ensure scope includes offline_access");
  }
  const stored = {
    apiUrl,
    clientId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token
  };
  saveCredentials(credPath, stored);
  console.log(`Saved credentials to ${credPath}`);
}
function cmdLogout(args) {
  let credPath = defaultCredentialsPath();
  for (let i = 0;i < args.length; i++) {
    if (args[i] === "--credentials") {
      const v = args[++i];
      if (v)
        credPath = v;
    }
  }
  try {
    unlinkSync(credPath);
    console.log(`Removed ${credPath}`);
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      console.log("No credentials file to remove.");
    } else {
      throw e;
    }
  }
}
async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0] ?? "help";
  const rest = argv.slice(1);
  try {
    if (cmd === "login") {
      await cmdLogin(rest);
    } else if (cmd === "logout") {
      cmdLogout(rest);
    } else {
      printHelp();
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
