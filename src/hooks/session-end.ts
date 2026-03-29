import { readFileSync } from "node:fs";

import { createClientFromCredentials } from "../api";
import {
  defaultCredentialsPath,
  loadCredentials,
  saveCredentials,
} from "../credentials";

interface SessionEndInput {
  session_id: string;
  transcript_path?: string;
  reason?: string;
}

interface Turn {
  role: string;
  content: unknown;
}

function parseTranscript(text: string): Turn[] {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* JSONL */
  }
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Turn;
      } catch {
        return null;
      }
    })
    .filter((t): t is Turn => t !== null);
}

async function main() {
  const raw = readFileSync(0, "utf-8");
  let input: SessionEndInput;
  try {
    input = JSON.parse(raw) as SessionEndInput;
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

  let fileContent: string;
  try {
    fileContent = readFileSync(input.transcript_path, "utf-8");
  } catch (e) {
    console.error("[membase-cursor] session-end: read transcript:", e);
    return;
  }

  const turns = parseTranscript(fileContent);
  const relevant = turns.filter(
    (t) =>
      (t.role === "user" || t.role === "assistant") &&
      typeof t.content === "string",
  );
  const userTurns = relevant.filter((t) => t.role === "user");
  if (userTurns.length < 2) {
    return;
  }

  let transcript = relevant
    .map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`)
    .join("\n");
  if (transcript.length > 100_000) {
    transcript = transcript.slice(0, 100_000);
  }

  const content = `Cursor IDE session transcript:\n${transcript}`;
  const client = createClientFromCredentials(creds, (c) =>
    saveCredentials(credPath, c),
  );

  try {
    await client.addMemory(content, "cursor");
  } catch (e) {
    console.error("[membase-cursor] session-end:", e);
  }
}

main().catch((e) => {
  console.error("[membase-cursor] session-end:", e);
});
