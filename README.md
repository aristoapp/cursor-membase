# Membase — Cursor Plugin

[Cursor Marketplace](https://cursor.com/marketplace) plugin for [Membase](https://membase.so): persistent memory with MCP tools, session hooks, and always-on rules.

## What it does

- **Local MCP server** — runs `search_memory`, `add_memory`, and `get_current_date` tools via stdio, sharing credentials with session hooks.
- **Session hooks** — injects user profile + recent memories at session start; captures the transcript to Membase at session end.
- **Always-on rule** — instructs the agent to proactively use Membase MCP tools.

## Setup

Install the plugin from Cursor Marketplace, then run once in a terminal:

```bash
bunx @membase/cursor@latest login
```

This opens your browser to authenticate with Membase. Credentials are saved to `~/.config/membase/cursor-credentials.json`. Both MCP tools and session hooks use the same token — **one login and you're done.**

## CLI

| Command | Description |
|---------|-------------|
| `membase-cursor login` | OAuth (PKCE) — save credentials |
| `membase-cursor logout` | Remove credentials file |
| `membase-cursor mcp` | Start local MCP server (stdio) |
| `membase-cursor help` | Usage |

Options: `--api-url`, `--port`, `--credentials <path>`.

## Development

```bash
bun install
bun run build
```

## License

MIT
