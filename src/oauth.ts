import { createServer } from "node:http";

function b64url(input: Uint8Array): string {
  return btoa(Array.from(input, (b) => String.fromCharCode(b)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function createPkce(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
  const verifier = b64url(verifierBytes);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = b64url(new Uint8Array(digest));
  return { verifier, challenge };
}

export function randomState(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function registerOAuthClient(
  apiUrl: string,
  redirectUri: string,
  clientName: string,
): Promise<string> {
  const response = await fetch(`${apiUrl}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "memory:read memory:write offline_access",
    }),
  });
  if (!response.ok) {
    throw new Error(`OAuth client registration failed (${response.status})`);
  }
  const data = (await response.json()) as { client_id?: string };
  if (!data.client_id) {
    throw new Error("OAuth registration returned no client_id");
  }
  return data.client_id;
}

export async function exchangeCode(
  apiUrl: string,
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });
  const response = await fetch(`${apiUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `OAuth token exchange failed (${response.status}): ${text}`,
    );
  }
  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
  };
}

export async function refreshAccessToken(
  apiUrl: string,
  clientId: string,
  refreshToken: string,
): Promise<{ access_token: string; refresh_token?: string }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const response = await fetch(`${apiUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }
  return (await response.json()) as {
    access_token: string;
    refresh_token?: string;
  };
}

export type CallbackListener = {
  port: number;
  waitForCode: Promise<{ code: string }>;
  close: () => void;
};

export function startOAuthCallbackListener(
  preferredPort: number,
  expectedState: string,
  timeoutMs = 180_000,
  maxPortAttempts = 20,
): Promise<CallbackListener> {
  const server = createServer();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const close = () => {
    if (server.listening) server.close();
  };

  const waitForCode = new Promise<{ code: string }>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
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
        const port =
          addr && typeof addr !== "string" ? addr.port : preferredPort;
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
            if (timeout) clearTimeout(timeout);
            close();
            reject(new Error(`OAuth authorization failed: ${error}`));
          });
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            "<h3>Authorization failed.</h3><p>You can close this tab.</p>",
          );
          return;
        }

        if (!code || !state) {
          settle(() => {
            if (timeout) clearTimeout(timeout);
            close();
            reject(new Error("Missing OAuth code or state parameter"));
          });
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            "<h3>Missing OAuth code/state.</h3><p>You can close this tab.</p>",
          );
          return;
        }

        if (state !== expectedState) {
          settle(() => {
            if (timeout) clearTimeout(timeout);
            close();
            reject(new Error("OAuth state mismatch"));
          });
          res.statusCode = 400;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            "<h3>Invalid OAuth state.</h3><p>You can close this tab.</p>",
          );
          return;
        }

        settle(() => {
          if (timeout) clearTimeout(timeout);
          close();
          resolve({ code });
        });

        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(
          "<h3>Membase connected.</h3><p>You can close this tab and return to the terminal.</p>",
        );
      } catch (err) {
        settle(() => {
          if (timeout) clearTimeout(timeout);
          close();
          reject(err instanceof Error ? err : new Error(String(err)));
        });
        res.statusCode = 500;
        res.end("Server error");
      }
    });
  });

  const boundPort = new Promise<number>((resolve, reject) => {
    const tryListen = (port: number, attemptsLeft: number) => {
      const onError = (error: NodeJS.ErrnoException) => {
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
    close,
  }));
}

export async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const opener =
    platform === "darwin" ? "open" : platform === "linux" ? "xdg-open" : null;

  if (!opener) {
    console.log("Open this URL manually:\n", url);
    return;
  }

  let exitCode: number | null;
  if (typeof Bun !== "undefined") {
    exitCode = Bun.spawnSync({
      cmd: [opener, url],
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    }).exitCode;
  } else {
    const { spawnSync } = await import("node:child_process");
    exitCode = spawnSync(opener, [url], { stdio: "ignore" }).status;
  }
  if (exitCode !== 0) {
    console.log("Open this URL manually:\n", url);
  }
}
