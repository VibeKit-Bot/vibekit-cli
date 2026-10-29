#!/usr/bin/env node

const API_BASE = 'https://vibekit.bot/api/v1';
const CONFIG_DIR = process.env.HOME ? `${process.env.HOME}/.vibekit` : '.vibekit';
const CONFIG_FILE = `${CONFIG_DIR}/config.json`;

import * as fs from 'fs';
import * as path from 'path';

// ---- Config ----

interface Config {
  apiKey?: string;
}

function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveConfig(config: Config): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

function getApiKey(): string {
  const envKey = process.env.VIBEKIT_API_KEY;
  if (envKey) return envKey;

  const config = loadConfig();
  if (config.apiKey) return config.apiKey;

  error('No API key configured. Run: vibekit auth <your-api-key>');
  process.exit(10);
}

// ---- HTTP ----

async function api(method: string, endpoint: string, body?: any): Promise<any> {
  const apiKey = getApiKey();
  const url = `${API_BASE}${endpoint}`;

  const opts: RequestInit = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const data = await res.json() as any;

  if (!res.ok) {
    error(data.error || `API error (${res.status})`);
    process.exit(40);
  }

  return data;
}

// ---- Output ----

const isJson = process.argv.includes('--json');

function output(data: any): void {
  if (isJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    if (typeof data === 'string') {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

function error(msg: string): void {
  if (isJson) {
    console.error(JSON.stringify({ error: msg }));
  } else {
    console.error(`✖ ${msg}`);
  }
}

function success(msg: string): void {
  if (!isJson) {
    console.log(`✓ ${msg}`);
  }
}

// ---- Commands ----

// Where a Claude or OpenAI key or subscription is connected: the app, not this CLI.
const PROVIDER_SETTINGS = 'Profile > Bring your own AI provider (BYOK) in the iOS app, or Settings > AI on app.vibekit.bot';
const KEY_SETTINGS = 'Profile > Developer > API key in the iOS app, or Profile > VibeKit API key on app.vibekit.bot';

async function saveKey(key: string): Promise<void> {
  if (!key.startsWith('vk_')) { error('VibeKit API keys start with vk_'); process.exit(1); }
  saveConfig({ ...loadConfig(), apiKey: key });
  success(`API key saved to ${CONFIG_FILE}`);
}

async function cmdAuth(args: string[]): Promise<void> {
  const subCmd = args[0];

  // vibekit auth <api-key>
  if (subCmd && subCmd.startsWith('vk_')) return saveKey(subCmd);

  // vibekit auth status
  if (subCmd === 'status') {
    const source = process.env.VIBEKIT_API_KEY ? 'VIBEKIT_API_KEY' : loadConfig().apiKey ? CONFIG_FILE : null;
    if (!source) { console.log('  Not authenticated. Run: vibekit auth'); return; }
    try {
      const data = await api('GET', '/account');
      console.log(`  Authenticated with the API key from ${source}`);
      console.log(`  Plan: ${data.plan}`);
      console.log(`  Claude: ${data.hasClaudeKey ? '✓ Connected' : '✗ Not connected'}`);
      console.log(`  OpenAI: ${data.hasOpenaiKey ? '✓ Connected' : '✗ Not connected'}`);
    } catch { console.log('  API key saved but could not reach server.'); }
    return;
  }

  // vibekit auth, or vibekit auth login [key]: paste the key from the app.
  if (!subCmd || (subCmd === 'login' && (!args[1] || args[1] === 'key'))) {
    console.log(`\n  Paste your VibeKit API key (${KEY_SETTINGS}):`);
    return saveKey(await readLine('  > '));
  }

  // Before 0.4.7 this tried a browser sign-in with Anthropic or OpenAI, which never worked.
  if (subCmd === 'login') {
    error(`Connect a Claude or OpenAI key or subscription in the VibeKit app: ${PROVIDER_SETTINGS}. Then run: vibekit auth status`);
    process.exit(1);
  }

  error('Usage: vibekit auth [<vk_key>|status]');
  process.exit(1);
}

function readLine(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer: string) => { rl.close(); resolve(answer.trim()); });
  });
}

async function cmdAccount(): Promise<void> {
  const data = await api('GET', '/account');
  if (isJson) {
    output(data);
  } else {
    console.log(`Plan:       ${data.plan}`);
    console.log(`Credits:    $${data.credits.toFixed(2)}`);
    const mins = data.containerMinutes;
    console.log(`Container:  ${mins.used}/${mins.limit === 'unlimited' ? '∞' : mins.limit} min`);
    const tasks = data.scheduledTasks;
    console.log(`Schedules:  ${tasks.limit === 'unlimited' ? '∞' : tasks.limit} allowed`);
  }
}

async function cmdTask(args: string[]): Promise<void> {
  const prompt = positional(args).join(' ');

  if (!prompt) {
    error('Usage: vibekit task "Build a landing page with email signup"');
    process.exit(1);
  }

  // Parse optional flags
  const repo = getFlag(args, '--repo');
  const branch = getFlag(args, '--branch');
  const callbackUrl = getFlag(args, '--callback');
  const noDeploy = args.includes('--no-deploy');

  const body: any = { prompt };
  if (repo) body.repo = repo;
  if (branch) body.branch = branch;
  if (callbackUrl) body.callbackUrl = callbackUrl;
  if (noDeploy) body.deploy = false;

  const data = await api('POST', '/task', body);

  if (isJson) {
    output(data);
  } else {
    success(`Task started: ${data.taskId}`);
    console.log(`Status: ${data.status}`);
    console.log(`\nPoll: vibekit status ${data.taskId}`);
    console.log(`Wait: vibekit wait ${data.taskId}`);
  }
}

async function cmdStatus(args: string[]): Promise<void> {
  const taskId = args[0];
  if (!taskId) {
    error('Usage: vibekit status <task-id>');
    process.exit(1);
  }

  const data = await api('GET', `/task/${taskId}`);

  if (isJson) {
    output(data);
  } else {
    console.log(`Task:    ${data.taskId}`);
    console.log(`Status:  ${data.status}`);
    console.log(`Started: ${data.startedAt}`);
    if (data.completedAt) console.log(`Done:    ${data.completedAt}`);
    if (data.result) {
      console.log(`\nResult:`);
      if (data.result.summary) console.log(data.result.summary);
      if (data.result.commitUrl) console.log(`\nCommit: ${data.result.commitUrl}`);
      if (data.result.deployUrl) console.log(`Deploy: ${data.result.deployUrl}`);
    }
    if (data.error) console.log(`\nError: ${data.error}`);
  }
}

async function cmdWait(args: string[]): Promise<void> {
  const taskId = args[0];
  if (!taskId) {
    error('Usage: vibekit wait <task-id>');
    process.exit(1);
  }

  if (!isJson) process.stdout.write('Waiting');

  for (let i = 0; i < 120; i++) { // 10 min max
    const data = await api('GET', `/task/${taskId}`);

    if (data.status === 'complete' || data.status === 'failed') {
      if (!isJson) console.log('');
      output(data);
      process.exit(data.status === 'failed' ? 1 : 0);
    }

    if (!isJson) process.stdout.write('.');
    await new Promise(r => setTimeout(r, 5000));
  }

  if (!isJson) console.log('');
  error('Timed out waiting for task');
  process.exit(1);
}

async function cmdTasks(): Promise<void> {
  const data = await api('GET', '/tasks');

  if (isJson) {
    output(data);
  } else {
    if (data.tasks.length === 0) {
      console.log('No tasks yet.');
      return;
    }
    for (const t of data.tasks) {
      const status = t.status === 'complete' ? '✓' : t.status === 'running' ? '⟳' : '✖';
      console.log(`${status} ${t.taskId}  ${t.status.padEnd(8)}  ${t.prompt}`);
    }
  }
}

async function cmdSchedule(args: string[]): Promise<void> {
  const prompt = positional(args).join(' ');

  if (!prompt) {
    error('Usage: vibekit schedule "Improve SEO" --repo vibekit-apps/my-app --every daily');
    process.exit(1);
  }

  const repo = getFlag(args, '--repo');
  const interval = getFlag(args, '--every') || 'daily';

  if (!repo) {
    error('--repo is required: the repo of a project you deployed with vibekit task');
    process.exit(1);
  }

  const body: any = { prompt, repo, interval };
  if (args.includes('--no-deploy')) body.deploy = false;
  const data = await api('POST', '/schedule', body);

  if (isJson) {
    output(data);
  } else {
    success(`Schedule created: ${data.scheduleId}`);
    console.log(`Interval: ${data.interval} (UTC)`);
    if (data.nextRun) console.log(`Next run: ${data.nextRun}`);
    console.log("Each run's report is posted in the project's chat in the VibeKit app.");
  }
}

async function cmdSchedules(): Promise<void> {
  const data = await api('GET', '/schedules');

  if (isJson) {
    output(data);
  } else {
    if (data.schedules.length === 0) {
      console.log('No scheduled tasks.');
      return;
    }
    for (const s of data.schedules) {
      // stateKnown is false when the server could not read the schedule's state.
      const status = s.stateKnown === false ? '?' : s.enabled ? '✓' : '○';
      console.log(`${status} ${s.scheduleId}  ${s.interval.padEnd(12)}  ${s.name}  (${s.runCount} runs)`);
    }
  }
}

async function cmdUnschedule(args: string[]): Promise<void> {
  const scheduleId = args[0];
  if (!scheduleId) {
    error('Usage: vibekit unschedule <schedule-id>');
    process.exit(1);
  }

  await api('DELETE', `/schedule/${scheduleId}`);
  success('Schedule cancelled');
}

// ---- Helpers ----

/** Flags followed by a value, which is not part of the prompt. */
const VALUE_FLAGS = new Set(['--repo', '--branch', '--callback', '--every']);

/** The prompt words: every argument except flags and the values they take. */
function positional(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (VALUE_FLAGS.has(args[i])) i++;
    else if (!args[i].startsWith('--')) out.push(args[i]);
  }
  return out;
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function printHelp(): void {
  console.log(`
vibekit: AI developer on demand

Usage:
  vibekit auth                      Paste your VibeKit API key (saved to ~/.vibekit/config.json)
  vibekit auth <vk_key>             Save a VibeKit API key
  vibekit auth status               Show the key in use, plan and connected providers
  vibekit account                   Show plan & usage
  vibekit task "<prompt>"           Build or change a project, then deploy it
  vibekit status <task-id>          Check task status
  vibekit wait <task-id>            Wait for task to complete
  vibekit tasks                     List recent tasks
  vibekit schedule "<prompt>"       Run a prompt on a deployed project's agent on a schedule
  vibekit schedules                 List scheduled tasks
  vibekit unschedule <id>           Cancel a schedule

Flags:
  --json                 Machine-readable JSON output
  --repo owner/name      A project of yours (vibekit-apps/<name>); task makes a new one without it
  --branch name          Target branch (default: main)
  --callback <url>       HTTPS webhook URL for task completion
  --no-deploy            Task: commit without deploying. Schedule: runs do not deploy
  --every interval       Schedule: hourly|daily|weekly, or a cron expression in UTC (default: daily)

Examples:
  vibekit task "Build a landing page with email signup"
  vibekit task "Fix the login bug" --repo vibekit-apps/my-app
  vibekit wait task_abc123 --json
  vibekit schedule "Check for broken links and fix them" --repo vibekit-apps/my-app --every "0 9 * * 1"

The API key is read from VIBEKIT_API_KEY, else ~/.vibekit/config.json. There is no
logout command: delete that file, or regenerate the key in the app, to sign out.
Your API key: ${KEY_SETTINGS}.
Claude or OpenAI key or subscription: ${PROVIDER_SETTINGS}.
Schedules need a paid plan. Each run is billed like a chat message, and its report
is posted in the project's chat.
API docs: https://vibekit.bot/SKILL.md
`);
}

// ---- Main ----

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter(a => a !== '--json');
  const command = args[0];
  const rest = args.slice(1);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  try {
    switch (command) {
      case 'auth': await cmdAuth(rest); break;
      case 'account': await cmdAccount(); break;
      case 'task': await cmdTask(rest); break;
      case 'status': await cmdStatus(rest); break;
      case 'wait': await cmdWait(rest); break;
      case 'tasks': await cmdTasks(); break;
      case 'schedule': await cmdSchedule(rest); break;
      case 'schedules': await cmdSchedules(); break;
      case 'unschedule': await cmdUnschedule(rest); break;
      default:
        // If it doesn't match a command, treat it as a task prompt
        await cmdTask(args);
    }
  } catch (err: any) {
    error(err.message || 'Unknown error');
    process.exit(1);
  }
}

main();
