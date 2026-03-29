import { readFileSync } from "node:fs";

import { createClientFromCredentials } from "../api";
import { buildSessionStartContext } from "../context";
import {
  defaultCredentialsPath,
  loadCredentials,
  saveCredentials,
} from "../credentials";

const MAX_CONTEXT_CHARS = 12_000;

function okEmpty() {
  process.stdout.write(JSON.stringify({ continue: true }));
}

async function main() {
  const raw = readFileSync(0, "utf-8");
  try {
    JSON.parse(raw) as { session_id?: string };
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

  const client = createClientFromCredentials(creds, (c) =>
    saveCredentials(credPath, c),
  );

  try {
    const context = await buildSessionStartContext(client, MAX_CONTEXT_CHARS);
    if (!context) {
      process.stdout.write(JSON.stringify({ continue: true }));
      return;
    }

    process.stdout.write(
      JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: "sessionStart",
          additionalContext: context,
        },
      }),
    );
  } catch (e) {
    console.error("[membase-cursor] session-start:", e);
    okEmpty();
  }
}

main().catch((e) => {
  console.error("[membase-cursor] session-start:", e);
  process.stdout.write(JSON.stringify({ continue: true }));
});
