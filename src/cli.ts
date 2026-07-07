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

async function cmdAuth(args: string[]): Promise<void> {
  const subCmd = args[0];

  // vibekit auth <api-key> — legacy: save API key directly
  if (subCmd && subCmd.startsWith('vk_')) {
    saveConfig({ ...loadConfig(), apiKey: subCmd });
    success(`API key saved to ${CONFIG_FILE}`);
    return;
  }

  // vibekit auth login — interactive provider OAuth
  if (subCmd === 'login' || !subCmd) {
    const provider = args[1] || await promptProvider();
    
    if (provider === 'anthropic' || provider === 'claude') {
      await authWithProvider('anthropic');
    } else if (provider === 'openai' || provider === 'codex') {
      await authWithProvider('openai');
    } else if (provider === 'key') {
      console.log('\n  Paste your VibeKit API key:');
      const key = await readLine('  > ');
      if (!key.startsWith('vk_')) { error('Keys start with vk_'); process.exit(1); }
      saveConfig({ ...loadConfig(), apiKey: key });
      success(`API key saved to ${CONFIG_FILE}`);
    } else {
      error(`Unknown provider: ${provider}. Use: anthropic, openai, or key`);
      process.exit(1);
    }
    return;
  }

  // vibekit auth status
  if (subCmd === 'status') {
    const config = loadConfig();
    if (!config.apiKey) { console.log('  Not authenticated. Run: vibekit auth'); return; }
    try {
      const data = await api('GET', '/account');
      console.log(`  Authenticated as: ${data.githubUsername || data.telegramId || 'unknown'}`);
      console.log(`  Plan: ${data.plan}`);
      console.log(`  Claude: ${data.claudeKeySet || data.hasClaudeKey ? '✓ Connected' : '✗ Not connected'}`);
      console.log(`  OpenAI: ${data.hasOpenaiKey ? '✓ Connected' : '✗ Not connected'}`);
    } catch { console.log('  API key saved but could not reach server.'); }
    return;
  }

  error('Usage: vibekit auth [login|status] [anthropic|openai|key]');
}

async function authWithProvider(provider: 'anthropic' | 'openai'): Promise<void> {
  const config = loadConfig();
  if (!config.apiKey) {
    error('Set your VibeKit API key first: vibekit auth <vk_key>');
    error('Get one at https://app.vibekit.bot or create one with POST https://vibekit.bot/api/v1/auth/register');
    process.exit(1);
  }

  const { loginAnthropic, loginOpenAI } = await import('./auth-oauth');

  console.log(`\n  Connecting ${provider === 'anthropic' ? 'Anthropic / Claude' : 'OpenAI / Codex'}...`);

  const result = provider === 'anthropic' ? await loginAnthropic() : await loginOpenAI();

  // Send token to VibeKit API
  const endpoint = provider === 'anthropic' ? '/account/claude-key' : '/account/openai-key';
  const bodyKey = provider === 'anthropic' ? 'claudeKey' : 'openaiKey';

  try {
    await api('PUT', endpoint, { [bodyKey]: result.accessToken });
    success(`${provider === 'anthropic' ? 'Anthropic / Claude' : 'OpenAI / Codex'} connected via subscription!`);
    if (result.expiresIn) {
      const days = Math.round(result.expiresIn / 86400);
      console.log(`  Token expires in ~${days} days. Re-run this command to refresh.`);
    }
  } catch (err: any) {
    error(`Failed to save token: ${err.message}`);
    process.exit(1);
  }
}

async function promptProvider(): Promise<string> {
  console.log('\n  Connect a provider to use your subscription:\n');
  console.log('  1) Anthropic / Claude  — use your Pro/Max subscription');
  console.log('  2) OpenAI / Codex      — use your Plus/Pro/Team subscription');
  console.log('  3) API key             — paste a VibeKit API key\n');

  const choice = await readLine('  Choose (1/2/3): ');
  if (choice === '1' || choice.toLowerCase().includes('anthropic') || choice.toLowerCase().includes('claude')) return 'anthropic';
  if (choice === '2' || choice.toLowerCase().includes('openai') || choice.toLowerCase().includes('codex')) return 'openai';
  if (choice === '3' || choice.toLowerCase().includes('key')) return 'key';
  return choice;
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
  // Filter out --flags from args
  const cleanArgs = args.filter(a => !a.startsWith('--'));
  const prompt = cleanArgs.join(' ');

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
  const cleanArgs = args.filter(a => !a.startsWith('--'));
  const prompt = cleanArgs.join(' ');

  if (!prompt) {
    error('Usage: vibekit schedule "Improve SEO" --repo owner/repo --every daily');
    process.exit(1);
  }

  const repo = getFlag(args, '--repo');
  const interval = getFlag(args, '--every') || 'daily';

  if (!repo) {
    error('--repo is required for scheduled tasks');
    process.exit(1);
  }

  const data = await api('POST', '/schedule', { prompt, repo, interval });

  if (isJson) {
    output(data);
  } else {
    success(`Schedule created: ${data.scheduleId}`);
    console.log(`Interval: ${data.interval}`);
    console.log(`Next run: ${data.nextRun}`);
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
      const status = s.enabled ? '✓' : '○';
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

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

function printHelp(): void {
  console.log(`
vibekit — AI developer on demand

Usage:
  vibekit auth                      Connect provider (interactive)
  vibekit auth login anthropic      Connect Claude subscription
  vibekit auth login openai         Connect OpenAI subscription
  vibekit auth <api-key>            Save VibeKit API key
  vibekit auth status               Show connection status
  vibekit account                   Show plan & usage
  vibekit task "<prompt>"           Submit a coding task
  vibekit status <task-id>          Check task status
  vibekit wait <task-id>            Wait for task to complete
  vibekit tasks                     List recent tasks
  vibekit schedule "<prompt>"       Create recurring task
  vibekit schedules                 List scheduled tasks
  vibekit unschedule <id>           Cancel a schedule

Flags:
  --json                 Machine-readable JSON output
  --repo owner/name      Target GitHub repo
  --branch name          Target branch (default: main)
  --every interval       Schedule interval: hourly|daily|weekly
  --callback <url>       Webhook URL for task completion
  --no-deploy            Skip auto-deploy

Examples:
  vibekit task "Build a landing page with email signup"
  vibekit task "Fix the login bug" --repo myorg/myapp
  vibekit wait task_abc123 --json
  vibekit schedule "Improve performance" --repo myorg/app --every daily

Get your API key: https://app.vibekit.bot or POST https://vibekit.bot/api/v1/auth/register
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
