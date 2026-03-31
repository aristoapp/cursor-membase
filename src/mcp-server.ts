import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { createClientFromCredentials } from "./api";
import { loadCredentials, saveCredentials } from "./credentials";
import { DEFAULT_CREDENTIALS_PATH } from "./paths";

function getClient() {
  const creds = loadCredentials();
  if (!creds) {
    throw new Error(
      "Not logged in. Run `bunx @membase/cursor login` first.",
    );
  }
  return createClientFromCredentials(creds, (c) =>
    saveCredentials(DEFAULT_CREDENTIALS_PATH, c),
  );
}

const server = new McpServer({
  name: "membase",
  version: "0.1.0",
});

server.tool(
  "search_memory",
  "Search stored memories (persistent across sessions) by semantic similarity. Use when the user asks to recall something not present in the current conversation, or proactively when past context would improve your response. When the user mentions a time window (today, yesterday, this week), set date_from/date_to as ISO 8601. Call get_current_date first if you need the anchor for relative dates.",
  {
    query: z
      .string()
      .max(1000)
      .describe(
        "Natural-language semantic search query. Use empty string '' to fetch recent memories.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .default(10)
      .describe("Max results (default 10)."),
    offset: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(0)
      .describe("Pagination offset (default 0)."),
    date_from: z
      .string()
      .optional()
      .describe("ISO 8601 start (inclusive)."),
    date_to: z
      .string()
      .optional()
      .describe("ISO 8601 end (inclusive)."),
    sources: z
      .array(z.string())
      .optional()
      .describe(
        "Filter by source: 'slack','gmail','google-calendar','notion','cursor','claude-desktop', etc.",
      ),
  },
  async (args) => {
    const client = getClient();
    const params = new URLSearchParams({
      query: args.query,
      limit: String(args.limit ?? 10),
      offset: String(args.offset ?? 0),
    });
    if (args.date_from) params.set("date_from", args.date_from);
    if (args.date_to) params.set("date_to", args.date_to);
    if (args.sources?.length) params.set("sources", args.sources.join(","));

    const result = await client.searchMemory(args.query, args.limit ?? 10);
    const nodes = result.nodes ?? [];

    if (nodes.length === 0) {
      return { content: [{ type: "text", text: "No memories found." }] };
    }

    const lines = nodes.map((n) => {
      const title = n.display_title || n.name || "(memory)";
      return n.summary ? `- **${title}**: ${n.summary}` : `- ${title}`;
    });
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

server.tool(
  "add_memory",
  "Store long-term memory (persistent across sessions). Call immediately — without asking permission — when the user shares personal background, preferences, habits, goals, plans, projects, or key decisions. Content must reflect what the user actually said. Avoid transient chatter, general knowledge, and secrets.",
  {
    content: z
      .string()
      .max(50000)
      .describe("Memory content to store."),
    metadata: z
      .record(z.unknown())
      .optional()
      .describe("Optional metadata (tags, source)."),
  },
  async (args) => {
    const client = getClient();
    await client.addMemory(args.content, "cursor");
    return { content: [{ type: "text", text: "Memory saved." }] };
  },
);

server.tool(
  "get_current_date",
  "Get the current date and time. Use before search_memory to convert relative phrases (today, yesterday, this week) into ISO 8601 date_from/date_to.",
  {},
  async () => {
    const now = new Date();
    const iso = now.toISOString();
    const local = now.toLocaleString("en-US", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      dateStyle: "full",
      timeStyle: "long",
    });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      content: [
        {
          type: "text",
          text: `Current time: ${local}\nISO 8601: ${iso}\nTimezone: ${tz}`,
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error("[membase-mcp]", e);
  process.exit(1);
});
