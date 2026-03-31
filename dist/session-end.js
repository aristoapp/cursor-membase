// src/hooks/session-end.ts
import { readFileSync as readFileSync2 } from "node:fs";

// src/oauth.ts
async function refreshAccessToken(apiUrl, clientId, refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId
  });
  const response = await fetch(`${apiUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Token refresh failed (${response.status}): ${text}`);
  }
  return await response.json();
}

// src/api.ts
async function parseJsonResponse(response) {
  const text = await response.text();
  return JSON.parse(text);
}

class MembaseHttpClient {
  apiUrl;
  clientId;
  onPersist;
  accessToken;
  refreshToken;
  constructor(apiUrl, clientId, tokens, onPersist) {
    this.apiUrl = apiUrl;
    this.clientId = clientId;
    this.onPersist = onPersist;
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
  }
  async fetch(path, init = {}) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.accessToken}`,
      ...init.headers
    };
    return fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers
    });
  }
  async withRefresh(fn) {
    let response = await fn();
    if (response.status === 401 && this.refreshToken) {
      await response.body?.cancel().catch(() => {});
      const next = await refreshAccessToken(this.apiUrl, this.clientId, this.refreshToken);
      this.accessToken = next.access_token;
      if (next.refresh_token) {
        this.refreshToken = next.refresh_token;
      }
      this.onPersist({
        apiUrl: this.apiUrl,
        clientId: this.clientId,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken
      });
      response = await fn();
    }
    if (!response.ok) {
      const t = await response.text().catch(() => "");
      throw new Error(`Membase API ${response.status}: ${t.slice(0, 500)}`);
    }
    return parseJsonResponse(response);
  }
  getUserSettings() {
    return this.withRefresh(() => this.fetch("/user/settings"));
  }
  searchMemory(query, limit) {
    const params = new URLSearchParams({ query, limit: String(limit) });
    return this.withRefresh(() => this.fetch(`/memory/search?${params}`));
  }
  addMemory(content, source) {
    return this.withRefresh(() => this.fetch("/memory", {
      method: "POST",
      body: JSON.stringify({
        content,
        source,
        source_description: "Cursor IDE plugin session capture"
      })
    }));
  }
}
function createClientFromCredentials(creds, onPersist) {
  const apiUrl = creds.apiUrl.replace(/\/$/, "");
  return new MembaseHttpClient(apiUrl, creds.clientId, { accessToken: creds.accessToken, refreshToken: creds.refreshToken }, onPersist);
}

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
function loadCredentials(path = DEFAULT_CREDENTIALS_PATH) {
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string" || typeof parsed.clientId !== "string") {
      return null;
    }
    return {
      apiUrl: typeof parsed.apiUrl === "string" ? parsed.apiUrl : DEFAULT_API_URL,
      clientId: parsed.clientId,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken
    };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      return null;
    }
    return null;
  }
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

// src/hooks/session-end.ts
function parseTranscript(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed))
      return parsed;
  } catch {}
  return text.split(`
`).filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter((t) => t !== null);
}
async function main() {
  const raw = readFileSync2(0, "utf-8");
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }
  if (!input.transcript_path || input.reason !== "completed") {
    return;
  }
  const credPath = defaultCredentialsPath();
  const creds = loadCredentials(credPath);
  if (!creds) {
    return;
  }
  let fileContent;
  try {
    fileContent = readFileSync2(input.transcript_path, "utf-8");
  } catch (e) {
    console.error("[membase-cursor] session-end: read transcript:", e);
    return;
  }
  const turns = parseTranscript(fileContent);
  const relevant = turns.filter((t) => (t.role === "user" || t.role === "assistant") && typeof t.content === "string");
  const userTurns = relevant.filter((t) => t.role === "user");
  if (userTurns.length < 2) {
    return;
  }
  let transcript = relevant.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join(`
`);
  if (transcript.length > 1e5) {
    transcript = transcript.slice(0, 1e5);
  }
  const content = `Cursor IDE session transcript:
${transcript}`;
  const client = createClientFromCredentials(creds, (c) => saveCredentials(credPath, c));
  try {
    await client.addMemory(content, "cursor");
  } catch (e) {
    console.error("[membase-cursor] session-end:", e);
  }
}
main().catch((e) => {
  console.error("[membase-cursor] session-end:", e);
});
