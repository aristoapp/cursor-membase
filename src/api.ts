import type { StoredCredentials } from "./credentials";
import { refreshAccessToken } from "./oauth";

type UserSettings = {
  display_name: string | null;
  interests: string | null;
  instructions: string | null;
};

type SearchNode = {
  uuid: string;
  name: string;
  summary?: string | null;
  display_title?: string | null;
  labels?: string[];
};

type SearchResult = {
  nodes: SearchNode[];
  edges: unknown[];
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  return JSON.parse(text) as T;
}

export class MembaseHttpClient {
  private accessToken: string;
  private refreshToken: string;

  constructor(
    private readonly apiUrl: string,
    private clientId: string,
    tokens: { accessToken: string; refreshToken: string },
    private readonly onPersist: (c: StoredCredentials) => void,
  ) {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken;
  }

  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.accessToken}`,
      ...(init.headers as Record<string, string>),
    };
    return fetch(`${this.apiUrl}${path}`, {
      ...init,
      headers,
    });
  }

  private async withRefresh<T>(fn: () => Promise<Response>): Promise<T> {
    let response = await fn();
    if (response.status === 401 && this.refreshToken) {
      await response.body?.cancel().catch(() => {});
      const next = await refreshAccessToken(
        this.apiUrl,
        this.clientId,
        this.refreshToken,
      );
      this.accessToken = next.access_token;
      if (next.refresh_token) {
        this.refreshToken = next.refresh_token;
      }
      this.onPersist({
        apiUrl: this.apiUrl,
        clientId: this.clientId,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
      });
      response = await fn();
    }
    if (!response.ok) {
      const t = await response.text().catch(() => "");
      throw new Error(`Membase API ${response.status}: ${t.slice(0, 500)}`);
    }
    return parseJsonResponse<T>(response);
  }

  getUserSettings(): Promise<UserSettings> {
    return this.withRefresh(() => this.fetch("/user/settings"));
  }

  searchMemory(query: string, limit: number): Promise<SearchResult> {
    const params = new URLSearchParams({ query, limit: String(limit) });
    return this.withRefresh(() => this.fetch(`/memory/search?${params}`));
  }

  addMemory(content: string, source: string): Promise<unknown> {
    return this.withRefresh(() =>
      this.fetch("/memory", {
        method: "POST",
        body: JSON.stringify({
          content,
          source,
          source_description: "Cursor IDE plugin session capture",
        }),
      }),
    );
  }
}

export function createClientFromCredentials(
  creds: StoredCredentials,
  onPersist: (c: StoredCredentials) => void,
): MembaseHttpClient {
  const apiUrl = creds.apiUrl.replace(/\/$/, "");
  return new MembaseHttpClient(
    apiUrl,
    creds.clientId,
    { accessToken: creds.accessToken, refreshToken: creds.refreshToken },
    onPersist,
  );
}
