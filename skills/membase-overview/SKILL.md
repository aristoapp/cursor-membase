---
name: membase-overview
description: When the user asks how Membase works in Cursor, explain MCP tools, OAuth, and the optional hook login CLI.
---

Membase in Cursor has two linked parts:

1. **MCP** (`membase` server): streamable HTTP to `https://mcp.membase.so/mcp`. Use **Connect** in Cursor to finish OAuth; then tools `search_memory`, `add_memory`, `get_current_date` are available to the agent.

2. **Session hooks** (optional): Run `bunx @membase/cursor login` once to save API tokens for automatic context injection at session start and transcript capture at session end.
