# vibekit

Deploy apps from your terminal. Built for AI coding agents.

## Install + Auth

```bash
npm install -g vibekit-cli
vibekit auth $VIBEKIT_API_KEY

# Or connect a provider interactively
vibekit auth login anthropic
```

## Modes

- **Cloud mode**: use `vibekit-cli` to submit tasks, deploy apps, and manage VibeKit-hosted workloads.
- **Local bridge mode**: use `vibekit-agent` if you want Telegram to control Claude Code on your own computer.

`vibekit-cli` does **not** run Claude Code on your local machine by itself. For that, install `vibekit-agent`.

## Agent Workflow

The canonical "I just built something, now deploy it":

```bash
# After building your app locally
vibekit auth $VIBEKIT_API_KEY
vibekit task "Deploy this app" --repo owner/repo
vibekit wait $TASK_ID --json
# Returns: {"deployUrl": "https://app.vibekit.bot", ...}
```

## All Commands

| Command | Description |
|---------|-------------|
| `vibekit auth <key>` | Save API key |
| `vibekit auth login [anthropic|openai|key]` | Interactive auth flow |
| `vibekit auth status` | Show saved auth + provider status |
| `vibekit account` | Plan & usage info |
| `vibekit task "<prompt>"` | Submit deployment task |
| `vibekit status <id>` | Check task status |
| `vibekit wait <id>` | Wait for completion |
| `vibekit tasks` | List recent tasks |
| `vibekit schedule "<prompt>"` | Create recurring task |
| `vibekit schedules` | List scheduled tasks |
| `vibekit unschedule <id>` | Cancel schedule |

### Task Flags

| Flag | Description |
|------|-------------|
| `--repo owner/name` | Target GitHub repo |
| `--branch name` | Branch (default: main) |
| `--no-deploy` | Skip auto-deploy |
| `--callback <url>` | Webhook URL for completion |
| `--every interval` | For schedules: hourly, daily, weekly |

### Examples

```bash
# Deploy specific repo
vibekit task "Add dark mode" --repo myorg/website

# Deploy without auto-hosting  
vibekit task "Fix the auth bug" --repo myorg/api --no-deploy

# With webhook callback
vibekit task "Build landing page" --callback https://myserver.com/done

# Recurring deployment
vibekit schedule "Deploy latest changes" --repo myorg/app --every daily
```

## JSON Mode

Add `--json` to any command for machine-readable output:

```bash
vibekit task "Fix login bug" --repo myorg/app --json
# {"taskId":"task_abc123","status":"running","repo":"vibekit-apps/project-abc123"}

vibekit wait task_abc123 --json
# {"status":"complete","result":{"deployUrl":"https://app.vibekit.bot","summary":"Fixed login validation..."}}

vibekit account --json
# {"plan":"builder","credits":15.42,"usage":{"sessions":23,"appsCreated":3}}

vibekit status task_abc123 --json  
# {"taskId":"task_abc123","status":"running","progress":"Installing dependencies..."}
```

All commands support `--json` for automation and parsing.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VIBEKIT_API_KEY` | API key (overrides saved config) |

Set in your environment or CI/CD pipeline:

```bash
export VIBEKIT_API_KEY=vk_your_key_here
vibekit task "Deploy to production" --repo owner/repo --json
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Task failed or general error |
| 10 | Not authenticated (missing/invalid API key) |
| 40 | API error (rate limit, invalid request) |

Use exit codes for error handling in scripts:

```bash
if vibekit task "Deploy app" --repo owner/repo --json; then
  echo "Deployment started successfully"
else
  echo "Failed to start deployment"
  exit 1
fi
```

## Related Packages

- `vibekit-mcp`: MCP access to VibeKit cloud from Claude Desktop, Cursor, and other MCP clients
- `vibekit-agent`: Telegram bridge for controlling local Claude Code on your own machine

## Links

- Website: https://vibekit.bot
- Dashboard: https://app.vibekit.bot  
- API Docs: https://vibekit.bot/SKILL.md
- Telegram Bot: @the_vibe_kit_bot
- GitHub: https://github.com/609NFT/vibekit

## License

MIT