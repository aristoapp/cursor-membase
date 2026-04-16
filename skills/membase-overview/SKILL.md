---
name: membase-overview
description: When the user asks how Membase works in Cursor, explain MCP tools, wiki, resources, OAuth, and the optional hook login CLI.
---

Membase in Cursor has two linked parts:

1. **MCP** (`membase` server): streamable HTTP to `https://mcp.membase.so/mcp`. Use **Connect** in Cursor to finish OAuth, then these tools and resources become available:

   **Memory tools**: `search_memory` (semantic search with date/source/project filters), `add_memory` (store personal context), `get_current_date` (timezone-aware date for filters).

   **Wiki tools**: `search_wiki` (hybrid keyword + semantic search), `add_wiki` (create documents with markdown/wikilinks), `update_wiki`, `delete_wiki`.

   **Resources**: `membase://profile` (user settings — name, role, timezone), `membase://recent` (recent memories timeline).

2. **Session hooks** (optional): Run `bunx @membase/cursor login` once to save API tokens for automatic context injection at session start and transcript capture at session end.
