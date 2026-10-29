# vibekit

Build, deploy and schedule work on VibeKit-hosted apps from your terminal. Built for AI coding agents.

## Install + Auth

```bash
npm install -g vibekit-cli
vibekit auth $VIBEKIT_API_KEY   # or just `vibekit auth` to paste it
```

The CLI authenticates with your VibeKit API key, read from `VIBEKIT_API_KEY` first, then from
`~/.vibekit/config.json` (where `vibekit auth` saves it). Find the key in the VibeKit app under
Profile > Developer > API key (iOS) or Profile > VibeKit API key (app.vibekit.bot).

There is no browser sign-in and no logout command. To sign out, delete `~/.vibekit/config.json`
or regenerate the key in the app. A Claude or OpenAI key or subscription is connected in the app
(Profile > Bring your own AI provider (BYOK) on iOS, Settings > AI on the web);
`vibekit auth status` shows whether one is connected.

## Agent Workflow

The canonical "build it and put it online":

```bash
vibekit auth $VIBEKIT_API_KEY
vibekit task "Build a landing page with email signup" --json
# {"taskId":"task_abc123","status":"running",...}
vibekit wait task_abc123 --json
# {"taskId":"task_abc123","status":"complete","result":{"summary":"...","commitUrl":"https://github.com/vibekit-apps/...","deployUrl":"https://<name>.vibekit.bot"}}
```

A task without `--repo` creates a new project (a repo under `vibekit-apps`) and deploys it.
Pass `--repo vibekit-apps/<name>` to change one of your existing projects.

## All Commands

| Command | Description |
|---------|-------------|
| `vibekit auth` | Paste and save your API key |
| `vibekit auth <vk_key>` | Save an API key |
| `vibekit auth status` | Show the key in use, plan and connected providers |
| `vibekit account` | Plan & usage info |
| `vibekit task "<prompt>"` | Build or change a project, then deploy it |
| `vibekit status <id>` | Check task status |
| `vibekit wait <id>` | Wait for completion |
| `vibekit tasks` | List recent tasks |
| `vibekit schedule "<prompt>"` | Run a prompt on a deployed project's agent on a schedule |
| `vibekit schedules` | List scheduled tasks |
| `vibekit unschedule <id>` | Cancel schedule |

### Flags

| Flag | Description |
|------|-------------|
| `--repo owner/name` | One of your projects (`vibekit-apps/<name>`) |
| `--branch name` | Branch (default: main) |
| `--no-deploy` | Task: commit without deploying. Schedule: runs do not deploy |
| `--callback <url>` | HTTPS webhook URL for task completion |
| `--every interval` | Schedule: hourly, daily, weekly, or a cron expression in UTC (default: daily) |

### Schedules

`vibekit schedule` needs a paid plan and the repo of a project you deployed. Each run is the
project's own agent working in its workspace, billed like a chat message; its report is posted
in the project's chat in the VibeKit app and sent as a notification. `daily` is 9:00 UTC,
`weekly` is Monday 9:00 UTC, and runs are at most every 15 minutes.

### Examples

```bash
# Change an existing project
vibekit task "Add dark mode" --repo vibekit-apps/my-site

# Commit without deploying
vibekit task "Fix the auth bug" --repo vibekit-apps/my-api --no-deploy

# With webhook callback
vibekit task "Build landing page" --callback https://myserver.com/done

# Every Monday at 9:00 UTC
vibekit schedule "Check for broken links and fix them" --repo vibekit-apps/my-site --every "0 9 * * 1"
```

## JSON Mode

Add `--json` to any command for machine-readable output:

```bash
vibekit status task_abc123 --json
# {"taskId":"task_abc123","status":"running","startedAt":"...","stage":"generate","stageMessage":"Generating code with AI..."}

vibekit account --json
# {"plan":"builder","credits":15.42,...}

vibekit schedules --json
# {"schedules":[{"scheduleId":"...","name":"...","repo":"vibekit-apps/my-site","interval":"0 9 * * 1","enabled":true,"nextRun":"...","runCount":3}]}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VIBEKIT_API_KEY` | API key (overrides saved config) |

Set in your environment or CI/CD pipeline:

```bash
export VIBEKIT_API_KEY=vk_your_key_here
vibekit task "Update the pricing section" --repo vibekit-apps/my-site --json
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Task failed or general error |
| 10 | Not authenticated (no API key) |
| 40 | API error (invalid key, rate limit, invalid request) |

Use exit codes for error handling in scripts:

```bash
if vibekit task "Add a contact form" --repo vibekit-apps/my-site --json; then
  echo "Task started"
else
  echo "Failed to start the task"
  exit 1
fi
```

## Related Packages

- `vibekit-mcp`: MCP access to VibeKit cloud from Claude Desktop, Cursor, and other MCP clients

## Links

- Website: https://vibekit.bot
- Dashboard: https://app.vibekit.bot
- API Docs: https://vibekit.bot/SKILL.md
- GitHub: https://github.com/VibeKit-Bot/vibekit-cli

## License

MIT
