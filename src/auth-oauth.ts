/**
 * OAuth flows for provider authentication
 * 
 * Supports:
 * - Anthropic (Claude) via setup-token style flow
 * - OpenAI (Codex) via PKCE OAuth flow
 */

import * as http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';

const CALLBACK_PORT = 19876;
const CALLBACK_URL = `http://127.0.0.1:${CALLBACK_PORT}/callback`;

// OpenAI OAuth endpoints
const OPENAI_AUTH_URL = 'https://auth.openai.com/oauth/authorize';
const OPENAI_TOKEN_URL = 'https://auth.openai.com/oauth/token';
// OpenAI Codex client ID (public, used by Codex CLI)
const OPENAI_CLIENT_ID = 'V7xzr29qGNRRyB3JfC_3MaN1';

// Anthropic OAuth endpoints  
const ANTHROPIC_AUTH_URL = 'https://console.anthropic.com/oauth/authorize';
const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/oauth/token';
const ANTHROPIC_CLIENT_ID = 'claude-cli';

interface OAuthResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  provider: 'anthropic' | 'openai';
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function openBrowser(url: string): void {
  const { exec } = require('child_process');
  const cmd = process.platform === 'darwin' ? 'open' :
              process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

async function waitForCallback(timeoutMs = 120_000): Promise<{ code: string; state: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timed out. Try again.'));
    }, timeoutMs);

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${CALLBACK_PORT}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px"><h2>Authentication failed</h2><p>You can close this tab.</p></body></html>');
        clearTimeout(timeout);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      if (code && state) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body style="font-family:system-ui;text-align:center;padding:60px;background:#0a0a0f;color:#fff"><h2 style="color:#a78bfa">✓ Connected to VibeKit</h2><p style="color:rgba(255,255,255,.5)">You can close this tab and return to your terminal.</p></body></html>');
        clearTimeout(timeout);
        server.close();
        resolve({ code, state });
      } else {
        res.writeHead(400);
        res.end('Missing code or state');
      }
    });

    server.listen(CALLBACK_PORT, '127.0.0.1', () => {});
    server.on('error', (err: any) => {
      clearTimeout(timeout);
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${CALLBACK_PORT} is in use. Close other auth flows and try again.`));
      } else {
        reject(err);
      }
    });
  });
}

async function exchangeToken(tokenUrl: string, params: Record<string, string>): Promise<any> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function loginOpenAI(): Promise<OAuthResult> {
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL(OPENAI_AUTH_URL);
  authUrl.searchParams.set('client_id', OPENAI_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
  authUrl.searchParams.set('scope', 'openid profile email offline_access');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('\n  Opening browser to sign in with ChatGPT...\n');
  openBrowser(authUrl.toString());

  const { code, state: returnedState } = await waitForCallback();

  if (returnedState !== state) {
    throw new Error('OAuth state mismatch — possible CSRF attack. Try again.');
  }

  const tokenData = await exchangeToken(OPENAI_TOKEN_URL, {
    grant_type: 'authorization_code',
    client_id: OPENAI_CLIENT_ID,
    code,
    redirect_uri: CALLBACK_URL,
    code_verifier: verifier,
  });

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
    provider: 'openai',
  };
}

export async function loginAnthropic(): Promise<OAuthResult> {
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = new URL(ANTHROPIC_AUTH_URL);
  authUrl.searchParams.set('client_id', ANTHROPIC_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', CALLBACK_URL);
  authUrl.searchParams.set('scope', 'user:inference');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('\n  Opening browser to sign in with Anthropic...\n');
  openBrowser(authUrl.toString());

  const { code, state: returnedState } = await waitForCallback();

  if (returnedState !== state) {
    throw new Error('OAuth state mismatch — possible CSRF attack. Try again.');
  }

  const tokenData = await exchangeToken(ANTHROPIC_TOKEN_URL, {
    grant_type: 'authorization_code',
    client_id: ANTHROPIC_CLIENT_ID,
    code,
    redirect_uri: CALLBACK_URL,
    code_verifier: verifier,
  });

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
    provider: 'anthropic',
  };
}
