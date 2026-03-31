// src/hooks/session-start.ts
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

// src/context.ts
function truncate(s, max) {
  const t = s.trim();
  if (t.length <= max)
    return t;
  return `${t.slice(0, max - 1)}…`;
}
async function buildSessionStartContext(client, maxChars) {
  const [settings, search] = await Promise.allSettled([
    client.getUserSettings(),
    client.searchMemory("", 12)
  ]);
  const parts = [`## Membase context (session start)
`];
  if (settings.status === "fulfilled") {
    const s = settings.value;
    if (s.display_name) {
      parts.push(`**User:** ${s.display_name}`);
    }
    if (s.instructions) {
      parts.push(`**Instructions:** ${truncate(s.instructions, 1200)}`);
    }
    if (s.interests) {
      parts.push(`**Interests:** ${truncate(s.interests, 600)}`);
    }
  }
  if (search.status === "fulfilled") {
    const nodes = search.value.nodes ?? [];
    const episodes = nodes.filter((n) => (n.labels ?? []).includes("Episodic"));
    const picked = episodes.length > 0 ? episodes : nodes;
    if (picked.length > 0) {
      parts.push(`
**Recent memories:**`);
      for (const n of picked.slice(0, 10)) {
        const title = n.display_title || n.name || n.summary || "(memory)";
        const body = n.summary && n.summary !== title ? n.summary : "";
        const line = body ? `- ${truncate(title, 200)}: ${truncate(body, 400)}` : `- ${truncate(title, 400)}`;
        parts.push(line);
      }
    }
  }
  const text = parts.join(`
`).trim();
  if (text.length < 40)
    return null;
  if (text.length > maxChars) {
    return `${text.slice(0, maxChars - 1)}…`;
  }
  return text;
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

// src/hooks/session-start.ts
var MAX_CONTEXT_CHARS = 12000;
function okEmpty() {
  process.stdout.write(JSON.stringify({ continue: true }));
}
async function main() {
  const raw = readFileSync2(0, "utf-8");
  try {
    JSON.parse(raw);
  } catch {
    okEmpty();
    return;
  }
  const credPath = defaultCredentialsPath();
  const creds = loadCredentials(credPath);
  if (!creds) {
    okEmpty();
    return;
  }
  const client = createClientFromCredentials(creds, (c) => saveCredentials(credPath, c));
  try {
    const context = await buildSessionStartContext(client, MAX_CONTEXT_CHARS);
    if (!context) {
      process.stdout.write(JSON.stringify({ continue: true }));
      return;
    }
    process.stdout.write(JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: "sessionStart",
        additionalContext: context
      }
    }));
  } catch (e) {
    console.error("[membase-cursor] session-start:", e);
    okEmpty();
  }
}
main().catch((e) => {
  console.error("[membase-cursor] session-start:", e);
  process.stdout.write(JSON.stringify({ continue: true }));
});
