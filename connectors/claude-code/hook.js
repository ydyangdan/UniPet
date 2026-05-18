#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const { spawnSync } = require('child_process');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8768;
const DEFAULT_TIMEOUT_MS = 350;
const DEFAULT_SOURCE = 'claude-code';

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
  return Array.from(clean).slice(0, maxLen).join('') || fallback;
}

function clip(value, fallback, maxLen = 160) {
  const text = String(value || fallback).trim();
  const finalText = text || fallback;
  return Array.from(finalText).slice(0, maxLen).join('');
}

function source(input = {}, env = process.env) {
  const configured = env.UNIPET_CLAUDE_CODE_SOURCE;
  if (configured) return cleanToken(configured, DEFAULT_SOURCE);
  if (envBool(env.UNIPET_CLAUDE_CODE_PER_SESSION, false) && input.session_id) {
    return cleanToken(`claude-code-${input.session_id}`, DEFAULT_SOURCE);
  }
  return DEFAULT_SOURCE;
}

function baseEvent(input, env, state, message, options = {}) {
  return {
    source: source(input, env),
    state,
    message: clip(message, state, options.messageLimit || 180),
    action: options.action || 'update',
    ttlMs: options.ttlMs,
  };
}

function toolName(input = {}) {
  return clip(input.tool_name || input.toolName || 'tool', 'tool', 48);
}

function isFailureValue(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.is_error === true || value.isError === true || value.error) return true;
  if (value.success === false || value.ok === false) return true;

  const status = value.status ?? value.exit_code ?? value.exitCode ?? value.code;
  if (typeof status === 'number') return status !== 0;
  if (typeof status === 'string' && /^-?\d+$/.test(status.trim())) return Number.parseInt(status, 10) !== 0;

  return false;
}

function isFailure(input = {}) {
  return isFailureValue(input.tool_response)
    || isFailureValue(input.toolResponse)
    || isFailureValue(input.result)
    || input.is_error === true
    || input.isError === true;
}

function lastAssistantMessage(input = {}) {
  return input.last_assistant_message
    || input.lastAssistantMessage
    || input.message
    || 'Claude Code response ready';
}

function buildEvent(eventName, input = {}, env = process.env) {
  const event = String(eventName || '').trim().toLowerCase();

  if (event === 'session_start') {
    return baseEvent(input, env, 'idle', 'Claude Code ready', { ttlMs: 60000 });
  }
  if (event === 'user_prompt_submit') {
    return baseEvent(input, env, 'running', 'Claude Code is thinking', { ttlMs: 120000 });
  }
  if (event === 'pre_tool_use') {
    return baseEvent(input, env, 'running', `Running ${toolName(input)}`, { ttlMs: 120000 });
  }
  if (event === 'post_tool_use') {
    if (isFailure(input)) {
      return baseEvent(input, env, 'failed', `${toolName(input)} failed`, { ttlMs: 300000 });
    }
    return baseEvent(input, env, 'running', `Finished ${toolName(input)}`, { ttlMs: 30000 });
  }
  if (event === 'notification') {
    return baseEvent(input, env, 'waiting', input.message || 'Claude Code needs attention', { ttlMs: 300000 });
  }
  if (event === 'stop' || event === 'subagent_stop') {
    return baseEvent(input, env, 'review', lastAssistantMessage(input), {
      ttlMs: 300000,
      messageLimit: 20,
    });
  }
  if (event === 'session_end') {
    return baseEvent(input, env, 'idle', 'Claude Code session ended', { action: 'remove' });
  }
  return null;
}

function postJson(payload, env = process.env) {
  const host = env.UNIPET_HOST || DEFAULT_HOST;
  const port = envInt(env.UNIPET_PORT, DEFAULT_PORT, 1, 65535);
  const timeoutMs = envInt(env.UNIPET_CLAUDE_CODE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 50, 10000);
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
  const command = env.UNIPET_COMMAND || env.UNIPET_CLAUDE_CODE_UNIPET_COMMAND || 'unipet';
  const result = spawnSync(command, ['start'], {
    stdio: 'ignore',
    env,
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

function readHookInput() {
  if (process.stdin.isTTY) return {};
  const text = fs.readFileSync(0, 'utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return {};
  }
}

async function sendHookEvent(eventName, input = {}, env = process.env) {
  const payload = buildEvent(eventName, input, env);
  if (!payload) return 0;

  try {
    await postJson(payload, env);
    return 0;
  } catch (_) {
    if (payload.action === 'remove' || !envBool(env.UNIPET_CLAUDE_CODE_AUTO_START, true)) {
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
    console.log('Usage: unipet hook claude-code <session_start|user_prompt_submit|pre_tool_use|post_tool_use|notification|stop|subagent_stop|session_end>');
    return eventName ? 0 : 1;
  }
  return sendHookEvent(eventName, readHookInput(), env);
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
  isFailure,
  main,
  sendHookEvent,
  source,
};
