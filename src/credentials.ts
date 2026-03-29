import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";

import { DEFAULT_API_URL, DEFAULT_CREDENTIALS_PATH } from "./paths";

export type StoredCredentials = {
  apiUrl: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
};

export function defaultCredentialsPath(): string {
  return DEFAULT_CREDENTIALS_PATH;
}

export function loadCredentials(
  path: string = DEFAULT_CREDENTIALS_PATH,
): StoredCredentials | null {
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<StoredCredentials>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.clientId !== "string"
    ) {
      return null;
    }
    return {
      apiUrl:
        typeof parsed.apiUrl === "string" ? parsed.apiUrl : DEFAULT_API_URL,
      clientId: parsed.clientId,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
    };
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    return null;
  }
}

export function saveCredentials(path: string, creds: StoredCredentials): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* ignore */
  }
  const tmp = `${path}.tmp`;
  const body = `${JSON.stringify(creds, null, 2)}\n`;
  writeFileSync(tmp, body, { encoding: "utf-8", mode: 0o600 });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    /* ignore */
  }
}
