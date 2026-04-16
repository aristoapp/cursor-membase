---
name: membase-logout
description: Remove Membase OAuth credentials and disconnect session hooks
---

Run in a terminal:

```bash
bunx @membase/cursor@latest logout
```

Or after global install: `membase-cursor logout`

This removes the stored credentials at `~/.config/membase/cursor-credentials.json`. Session hooks will stop working until you run `membase-login` again. MCP tools via **Connect** in Cursor settings are unaffected (they use separate OAuth).
