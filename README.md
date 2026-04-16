<h1 align="center">Membase Plugin for Cursor</h1>

<p align="center">
  <a href="https://membase.so/?utm_source=github&utm_medium=cursor-membase"><img src="assets/logo.svg" width="80" height="80" alt="Membase logo"></a>
</p>

<p align="center">
  Persistent long-term memory for Cursor — hybrid vector search + knowledge graph.
</p>

<p align="center">
  <a href="https://x.com/intent/follow?screen_name=mem_base"><img src="https://img.shields.io/badge/Follow%20on%20X-000000?style=for-the-badge&logo=x&logoColor=white" alt="Follow on X"></a>
  <a href="https://www.linkedin.com/company/aristotechnologies"><img src="https://img.shields.io/badge/Follow%20on%20LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="Follow on LinkedIn"></a>
  <a href="https://discord.gg/qfzXNdtmkv"><img src="https://img.shields.io/badge/Join%20Our%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join Our Discord"></a>
</p>

<p align="center">
  <a href="https://membase.so/?utm_source=github&utm_medium=cursor-membase">Website</a> · <a href="https://docs.membase.so">Docs</a> · <a href="https://app.membase.so">Dashboard</a> · <a href="https://github.com/aristoapp/cursor-membase/issues">Issues</a>
</p>

---

Give your [Cursor](https://cursor.com) agent persistent memory that survives across sessions. Membase uses hybrid vector search + knowledge graph to remember not just text, but entities, relationships, and facts.

> **Free to start** — Sign up at [app.membase.so](https://app.membase.so) and connect in under a minute.

## Install

Install from the [Cursor Marketplace](https://cursor.com/marketplace), then run once in a terminal:

```bash
bunx @membase/cursor@latest login
```

This opens your browser to authenticate with Membase. Credentials are saved to `~/.config/membase/cursor-credentials.json`. Both MCP tools and session hooks use the same token — **one login and you're done.**

## What It Does

```txt
Session Start
    │
    ▼
┌─────────────────────────┐
│  Profile + Recent       │  Injects user profile and recent
│  (sessionStart hook)    │  memories as context
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  AI Session             │  Agent uses search_memory, add_memory,
│                         │  search_wiki, add_wiki, etc.
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  Transcript Capture     │  Saves conversation to Membase for
│  (sessionEnd hook)      │  entity/relationship extraction
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│  Membase Backend        │  Hybrid vector search + knowledge graph
│  (mcp.membase.so)       │
└─────────────────────────┘
```

- **Session hooks** — Injects user profile + recent memories at session start; captures the transcript to Membase at session end.
- **Always-on rule** — Instructs the agent to proactively use Membase MCP tools.
- **Knowledge graph** — Unlike simple vector-only memory, Membase stores entities, relationships, and facts. Search results include related nodes and edges for richer context.

## MCP Tools

### Memory (personal context)

| Tool | Description |
| --- | --- |
| `search_memory` | Semantic search across memories. Supports date filtering (`date_from`, `date_to`), source filtering (`sources` — e.g. `['slack', 'gmail']`), and project scoping. |
| `add_memory` | Store durable personal context — preferences, decisions, goals, architecture choices. |
| `get_current_date` | Get current date/time in user's timezone for anchoring date-range searches. |

### Wiki (factual knowledge)

| Tool | Description |
| --- | --- |
| `search_wiki` | Hybrid keyword + semantic search for documents, references, and stable knowledge. |
| `add_wiki` | Create a wiki document (markdown with `[[wikilinks]]`). Optional auto-summarize. |
| `update_wiki` | Update an existing wiki document by ID. |
| `delete_wiki` | Permanently delete a wiki document by ID. |

### Resources

| Resource | Description |
| --- | --- |
| `membase://profile` | User settings — display name, role, interests, timezone. |
| `membase://recent` | Recent memories timeline (top 10). |

## CLI

```bash
membase-cursor login          # OAuth (PKCE) — opens browser
membase-cursor logout         # Remove credentials file
membase-cursor mcp            # Start local MCP server (stdio)
membase-cursor help           # Usage
```

Options: `--api-url`, `--port`, `--credentials <path>`.

Or via npx/bunx:

```bash
bunx @membase/cursor@latest login
bunx @membase/cursor@latest logout
```

## How Membase Differs

| | Simple vector memory | **Membase** |
| --- | --- | --- |
| **Storage** | Flat embeddings | Hybrid: vector embeddings + knowledge graph |
| **Search** | Vector similarity only | Vector + graph traversal (entities, relationships, facts) |
| **Extraction** | Store raw text | AI-powered entity/relationship extraction |
| **Knowledge** | Single store | Separate memory (personal) + wiki (factual knowledge) |
| **Auth** | API key | OAuth 2.0 with PKCE (no secrets to manage) |
| **Integrations** | None | Google Calendar, Gmail, Slack, Notion sync |

## Development

```bash
bun install
bun run build
```

## Links

- [Membase](https://membase.so/?utm_source=github&utm_medium=cursor-membase) — Website
- [Dashboard](https://app.membase.so) — Manage your memories
- [Docs](https://docs.membase.so) — Full documentation
- [Cursor](https://cursor.com) — AI code editor
