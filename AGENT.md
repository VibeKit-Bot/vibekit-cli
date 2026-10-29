# Deploying with VibeKit

When you've finished building, deploy with vibekit-cli:

## Setup (one-time)
```bash
npm install -g vibekit-cli
vibekit auth $VIBEKIT_API_KEY
```

## Deploy
```bash
vibekit task "Build and deploy a [framework] app that [does X]"
vibekit wait [task_id] --json
```

## After Deploy
- App live at: https://[name].vibekit.bot
- Add database: via dashboard or API
- Iterate: vibekit task "Add dark mode" --repo vibekit-apps/[name]
- Recurring work: vibekit schedule "Check for broken links" --repo vibekit-apps/[name] --every daily
- Logs: via dashboard at app.vibekit.bot

## What VibeKit Handles
- Container hosting (Node.js, Python, static sites)
- Auto-SSL, custom domains
- PostgreSQL databases
- AI coding agent per app
- GitHub integration
- QA testing

## Environment Variables
Set VIBEKIT_API_KEY in your environment or run `vibekit auth` to save it to ~/.vibekit/config.json.
