import { homedir } from "node:os";
import { join } from "node:path";

/** OAuth tokens + client id for Cursor session hooks (not the MCP UI token store). */
export const DEFAULT_CREDENTIALS_PATH = join(
  homedir(),
  ".config",
  "membase",
  "cursor-credentials.json",
);

export const DEFAULT_API_URL = "https://api.membase.so";
