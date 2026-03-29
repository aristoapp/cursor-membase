---
name: membase-login
description: Save OAuth credentials for Membase session hooks (separate from MCP Connect)
---

Run in a terminal:

```bash
bunx @membase/cursor@latest login
```

Or after global install: `membase-cursor login`

This stores tokens at `~/.config/membase/cursor-credentials.json` so **session start/end hooks** can load profile and recent memories. You still need **Connect** next to the Membase MCP server in Cursor settings for `search_memory` / `add_memory` tools.
