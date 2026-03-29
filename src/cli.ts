import { unlinkSync } from "node:fs";

import {
  defaultCredentialsPath,
  type StoredCredentials,
  saveCredentials,
} from "./credentials";
import {
  createPkce,
  exchangeCode,
  openBrowser,
  randomState,
  registerOAuthClient,
  startOAuthCallbackListener,
} from "./oauth";
import { DEFAULT_API_URL, DEFAULT_CREDENTIALS_PATH } from "./paths";

function printHelp(): void {
  console.log(`Membase Cursor plugin CLI

Usage:
  membase-cursor login [--api-url <url>] [--port <n>] [--credentials <path>]
  membase-cursor logout [--credentials <path>]
  membase-cursor help

Session hooks use the saved OAuth token at ${DEFAULT_CREDENTIALS_PATH} by default.
Connect MCP in Cursor separately (OAuth) for add_memory / search_memory tools.
`);
}

async function cmdLogin(args: string[]): Promise<void> {
  let apiUrl = DEFAULT_API_URL;
  let port = 8765;
  let credPath = defaultCredentialsPath();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--api-url") {
      const v = args[++i];
      if (v) apiUrl = v.replace(/\/$/, "");
    } else if (a === "--port") {
      const v = args[++i];
      if (v) port = Number.parseInt(v, 10) || 8765;
    } else if (a === "--credentials") {
      const v = args[++i];
      if (v) credPath = v;
    }
  }

  const { verifier, challenge } = await createPkce();
  const state = randomState();

  console.log("Starting local OAuth callback listener...");
  const listener = await startOAuthCallbackListener(port, state);
  const redirectUri = `http://127.0.0.1:${listener.port}/oauth/callback`;

  const clientId = await registerOAuthClient(
    apiUrl,
    redirectUri,
    "Membase Cursor Plugin",
  );

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
    console.warn(
      `Port ${port} in use; using callback port ${listener.port} instead.`,
    );
  }

  const { code } = await listener.waitForCode;
  const token = await exchangeCode(
    apiUrl,
    code,
    clientId,
    redirectUri,
    verifier,
  );

  if (!token.refresh_token) {
    throw new Error(
      "No refresh_token returned; ensure scope includes offline_access",
    );
  }

  const stored: StoredCredentials = {
    apiUrl,
    clientId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
  };
  saveCredentials(credPath, stored);
  console.log(`Saved credentials to ${credPath}`);
}

function cmdLogout(args: string[]): void {
  let credPath = defaultCredentialsPath();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--credentials") {
      const v = args[++i];
      if (v) credPath = v;
    }
  }
  try {
    unlinkSync(credPath);
    console.log(`Removed ${credPath}`);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      console.log("No credentials file to remove.");
    } else {
      throw e;
    }
  }
}

async function main(): Promise<void> {
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
