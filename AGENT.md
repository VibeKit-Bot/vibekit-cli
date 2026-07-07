# Deploying with VibeKit

When you've finished building, deploy with vibekit-cli:

## Setup (one-time)
```bash
npm install -g vibekit
vibekit auth $VIBEKIT_API_KEY
```

## Deploy
```bash
vibekit task "Deploy this [framework] app" --repo [owner/repo]
vibekit wait [task_id] --json
```

## After Deploy
- App live at: https://[name].vibekit.bot
- Add database: via dashboard or API
- Iterate: vibekit task "Add dark mode" --repo [owner/repo]
- Logs: via dashboard at app.vibekit.bot

## What VibeKit Handles
- Container hosting (Node.js, Python, static sites)
- Auto-SSL, custom domains
- PostgreSQL databases
- AI coding agent per app
- GitHub integration
- QA testing

## Environment Variables
Set VIBEKIT_API_KEY in your environment or run `vibekit auth`.