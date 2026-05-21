#!/usr/bin/env node

const http = require('http');
const { spawnSync } = require('child_process');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8768;
const DEFAULT_TIMEOUT_MS = 350;
const DEFAULT_SOURCE = 'deepseek-tui';
const READY_TTL = 60000;
const ACTIVE_TTL = 120000;
const FAILURE_TTL = 20000;

function envBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function envInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

function cleanToken(value, fallback, maxLen = 64) {
  const raw = String(value || fallback).trim();
  const clean = raw.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[._-]+|[._-]+$/g, '');
  return clean.slice(0, maxLen) || fallback;
}

function clip(value, fallback, maxLen = 160) {
  const text = String(value || fallback).trim();
  return (text || fallback).slice(0, maxLen);
}

function source(env = process.env) {
  const configured = env.UNIPET_DEEPSEEK_TUI_SOURCE;
  if (configured) return cleanToken(configured, DEFAULT_SOURCE);
  if (envBool(env.UNIPET_DEEPSEEK_TUI_PER_SESSION, false) && env.DEEPSEEK_SESSION_ID) {
    return cleanToken(`deepseek-tui-${env.DEEPSEEK_SESSION_ID}`, DEFAULT_SOURCE);
  }
  return DEFAULT_SOURCE;
}

function baseEvent(env, state, message, options = {}) {
  return {
    source: source(env),
    state,
    message: clip(message, state, 180),
    action: options.action || 'update',
    ttl: options.ttl,
  };
}

function isToolFailure(env = process.env) {
  const success = String(env.DEEPSEEK_TOOL_SUCCESS || '').trim().toLowerCase();
  if (success === 'false') return true;
  if (success === 'true') return false;
  const exitCode = Number.parseInt(env.DEEPSEEK_TOOL_EXIT_CODE || '', 10);
  return Number.isInteger(exitCode) && exitCode !== 0;
}

function buildEvent(eventName, env = process.env) {
  const event = String(eventName || '').trim().toLowerCase();
  const toolName = clip(env.DEEPSEEK_TOOL_NAME, 'tool', 48);

  if (event === 'session_start') {
    return baseEvent(env, 'idle', 'DeepSeek-TUI ready', { ttl: READY_TTL });
  }
  if (event === 'message_submit') {
    return baseEvent(env, 'running', 'DeepSeek-TUI is thinking', { ttl: ACTIVE_TTL });
  }
  if (event === 'tool_call_before') {
    return baseEvent(env, 'running', `Running ${toolName}`, { ttl: ACTIVE_TTL });
  }
  if (event === 'tool_call_after') {
    if (!isToolFailure(env)) return null;
    return baseEvent(env, 'failed', `${toolName} failed`, { ttl: FAILURE_TTL });
  }
  if (event === 'on_error') {
    const message = clip(env.DEEPSEEK_ERROR, 'DeepSeek-TUI error', 120);
    return baseEvent(env, 'failed', message, { ttl: FAILURE_TTL });
  }
  if (event === 'session_end') {
    return baseEvent(env, 'idle', 'DeepSeek-TUI session ended', { action: 'remove' });
  }
  return null;
}

function postJson(payload, env = process.env) {
  const host = env.UNIPET_HOST || DEFAULT_HOST;
  const port = envInt(env.UNIPET_PORT, DEFAULT_PORT, 1, 65535);
  const timeoutMs = envInt(env.UNIPET_DEEPSEEK_TUI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 50, 10000);
  const body = Buffer.from(JSON.stringify(payload), 'utf8');

  return new Promise((resolve, reject) => {
    const req = http.request({
      host,
      port,
      path: '/api/pet/events',
      method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      },
    }, (res) => {
      res.resume();
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`UniPet returned HTTP ${res.statusCode}`));
      });
    });
    req.on('timeout', () => req.destroy(new Error('UniPet request timed out')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function startUnipet(env = process.env) {
  const command = env.UNIPET_COMMAND || env.UNIPET_DEEPSEEK_TUI_UNIPET_COMMAND || 'unipet';
  const result = spawnSync(command, ['start'], {
    stdio: 'ignore',
    env,
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

async function sendHookEvent(eventName, env = process.env) {
  const payload = buildEvent(eventName, env);
  if (!payload) return 0;

  try {
    await postJson(payload, env);
    return 0;
  } catch (_) {
    if (payload.action === 'remove' || !envBool(env.UNIPET_DEEPSEEK_TUI_AUTO_START, true)) {
      return 0;
    }
  }

  if (!startUnipet(env)) return 0;
  try {
    await postJson(payload, env);
  } catch (_) {
    return 0;
  }
  return 0;
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const [eventName] = argv;
  if (!eventName || eventName === 'help' || eventName === '--help' || eventName === '-h') {
    console.log('Usage: unipet hook deepseek-tui <session_start|message_submit|tool_call_before|tool_call_after|on_error|session_end>');
    return eventName ? 0 : 1;
  }
  return sendHookEvent(eventName, env);
}

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch(() => {
    process.exitCode = 0;
  });
}

module.exports = {
  buildEvent,
  isToolFailure,
  main,
  sendHookEvent,
  source,
};
