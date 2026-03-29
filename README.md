# Membase — Cursor Plugin

[Cursor Marketplace](https://cursor.com/marketplace) plugin for [Membase](https://membase.so): persistent memory with MCP tools, session hooks, and always-on rules.

## What it does

- **MCP server** — registers `https://mcp.membase.so/mcp` so `search_memory`, `add_memory`, and `get_current_date` tools are available to the agent after OAuth Connect.
- **Session hooks** — injects user profile + recent memories at session start; captures the transcript to Membase at session end.
- **Always-on rule** — instructs the agent to proactively use Membase MCP tools.

## One-time setup

1. **MCP**: After installing the plugin, click **Connect** next to the Membase MCP server in Cursor settings and complete OAuth.
2. **Hooks** (optional): Run OAuth for the HTTP API (used by hooks only):

   ```bash
   bunx @membase/cursor@latest login
   ```

   Tokens are stored in `~/.config/membase/cursor-credentials.json`.

## CLI

| Command | Description |
|---------|-------------|
| `membase-cursor login` | OAuth (PKCE) — save credentials for hooks |
| `membase-cursor logout` | Remove credentials file |
| `membase-cursor help` | Usage |

Options: `--api-url`, `--port`, `--credentials <path>`.

## Development

```bash
bun install
bun run build
```

## License

MIT
