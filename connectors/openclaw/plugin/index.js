import http from 'node:http';

const PROTOCOL = 'unipet.v1';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8768;
const DEFAULT_TIMEOUT_MS = 350;
const DEFAULT_BUBBLE_CHARS = 20;
const DEFAULT_IDLE_DELAY_MS = 30000;
const DEDUPE_WINDOW_MS = 700;

let lastEmitKey = '';
let lastEmitAt = 0;
const cleanupTimers = new Map();

function clampNumber(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function envBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return !/^(0|false|no|off)$/i.test(String(raw).trim());
}

function envText(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : String(raw);
}

export function resolveConfig(api) {
  const pluginConfig = api && api.pluginConfig && typeof api.pluginConfig === 'object'
    ? api.pluginConfig
    : {};
  return {
    enabled: envBoolean('UNIPET_OPENCLAW_ENABLED', pluginConfig.enabled !== false),
    host: envText('UNIPET_HOST', pluginConfig.host || DEFAULT_HOST),
    port: clampNumber(envText('UNIPET_PORT', pluginConfig.port), DEFAULT_PORT, 1, 65535),
    timeoutMs: clampNumber(
      envText('UNIPET_OPENCLAW_TIMEOUT_MS', pluginConfig.timeoutMs),
      DEFAULT_TIMEOUT_MS,
      50,
      5000,
    ),
    bubbleMode: envText('UNIPET_OPENCLAW_BUBBLE_MODE', pluginConfig.bubbleMode || 'first20'),
    bubbleChars: clampNumber(
      envText('UNIPET_OPENCLAW_BUBBLE_CHARS', pluginConfig.bubbleChars),
      DEFAULT_BUBBLE_CHARS,
      0,
      80,
    ),
    idleDelayMs: clampNumber(
      envText('UNIPET_OPENCLAW_IDLE_DELAY_MS', pluginConfig.idleDelayMs),
      DEFAULT_IDLE_DELAY_MS,
      1000,
      600000,
    ),
    perAgent: envBoolean('UNIPET_OPENCLAW_PER_AGENT', pluginConfig.perAgent === true),
  };
}

function cleanToken(value, fallback, maxLen = 64) {
  const raw = String(value || fallback).trim();
  const clean = raw.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^[._-]+|[._-]+$/g, '');
  return clean.slice(0, maxLen) || fallback;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return '';
}

export function extractText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join(' ').trim();
  }
  if (typeof value === 'object') {
    for (const key of ['text', 'content', 'message', 'body', 'reply', 'output', 'response', 'result']) {
      if (value[key] === value) continue;
      const text = extractText(value[key]);
      if (text) return text;
    }
  }
  return String(value);
}

export function clipText(text, maxChars) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized || maxChars <= 0) return '';
  const chars = Array.from(normalized);
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join('')}...` : normalized;
}

function toolName(event) {
  return firstString(
    event?.toolName,
    event?.tool_name,
    event?.name,
    event?.tool?.name,
    event?.request?.name,
    event?.metadata?.toolName,
    'tool',
  );
}

export function isFailure(event) {
  if (!event || typeof event !== 'object') return false;
  if (event.error || event.exception) return true;
  if (event.success === false || event.ok === false) return true;
  const status = firstString(event.status, event.state, event.result?.status).toLowerCase();
  return ['failed', 'failure', 'error', 'cancelled', 'canceled', 'timeout'].includes(status);
}

function agentId(event, ctx) {
  return firstString(
    ctx?.agentId,
    ctx?.agent_id,
    ctx?.agent?.id,
    event?.agentId,
    event?.agent_id,
    event?.agent?.id,
  );
}

function sourceInfo(event, ctx, cfg) {
  const id = cfg.perAgent && agentId(event, ctx)
    ? `openclaw-${agentId(event, ctx)}`
    : 'openclaw';
  const label = cfg.perAgent && agentId(event, ctx)
    ? `OpenClaw ${agentId(event, ctx)}`
    : 'OpenClaw';
  return {
    source_id: cleanToken(id, 'openclaw'),
    label: label.slice(0, 64),
  };
}

function shouldEmit(payload) {
  const now = Date.now();
  const key = `${payload.source_id}|${payload.action}|${payload.state}|${payload.message}|${payload.notification_kind || ''}`;
  if (key === lastEmitKey && now - lastEmitAt < DEDUPE_WINDOW_MS) return false;
  lastEmitKey = key;
  lastEmitAt = now;
  return true;
}

function clearCleanupTimer(sourceId) {
  const timer = cleanupTimers.get(sourceId);
  if (!timer) return;
  clearTimeout(timer);
  cleanupTimers.delete(sourceId);
}

function postJson(cfg, payload) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payload), 'utf8');
    const req = http.request({
      hostname: cfg.host,
      port: cfg.port,
      path: '/api/pet/events',
      method: 'POST',
      timeout: cfg.timeoutMs,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
      },
    }, (res) => {
      res.resume();
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`UniPet bridge returned HTTP ${res.statusCode || 0}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('UniPet bridge request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

async function emit(api, event, ctx, state, message, options = {}) {
  const cfg = resolveConfig(api);
  if (!cfg.enabled) return;

  const payload = {
    protocol: PROTOCOL,
    ...sourceInfo(event, ctx, cfg),
    state,
    message: message || state,
    action: options.action || 'update',
    ttl_ms: options.ttlMs || 120000,
  };

  if (payload.action !== 'remove') clearCleanupTimer(payload.source_id);

  if (options.notificationKind) {
    payload.notification_kind = options.notificationKind;
    payload.notification_count = options.notificationCount || 1;
  }

  if (!shouldEmit(payload)) return;
  await postJson(cfg, payload);
}

function logger(api) {
  return api?.logger || console;
}

function safeEmit(api, event, ctx, state, message, options) {
  void emit(api, event, ctx, state, message, options).catch((err) => {
    logger(api).debug?.(`unipet-openclaw: could not reach UniPet bridge: ${err.message}`);
  });
}

function removeSource(api, event, ctx, message = 'OpenClaw session ended') {
  const cfg = resolveConfig(api);
  clearCleanupTimer(sourceInfo(event, ctx, cfg).source_id);
  safeEmit(api, event, ctx, 'idle', message, {
    action: 'remove',
    ttlMs: 1000,
  });
}

function scheduleSourceRemoval(api, event, ctx) {
  const cfg = resolveConfig(api);
  if (!cfg.enabled) return;
  const source = sourceInfo(event, ctx, cfg);
  clearCleanupTimer(source.source_id);
  const timer = setTimeout(() => {
    cleanupTimers.delete(source.source_id);
    removeSource(api, event, ctx, 'OpenClaw turn ended');
  }, cfg.idleDelayMs);
  if (typeof timer.unref === 'function') timer.unref();
  cleanupTimers.set(source.source_id, timer);
}

function observe(api, hookName, handler) {
  if (!api || typeof api.on !== 'function') return;
  try {
    api.on(hookName, (event, ctx) => {
      try {
        handler(event || {}, ctx || {});
      } catch (err) {
        logger(api).warn?.(`unipet-openclaw: ${hookName} handler failed: ${err.message}`);
      }
    });
  } catch (err) {
    logger(api).debug?.(`unipet-openclaw: hook ${hookName} unavailable: ${err.message}`);
  }
}

function outgoingBubble(api, event) {
  const cfg = resolveConfig(api);
  if (cfg.bubbleMode === 'off') return 'OpenClaw reply ready';
  return clipText(extractText(event), cfg.bubbleChars) || 'OpenClaw reply ready';
}

const plugin = {
  id: 'unipet-openclaw',
  name: 'UniPet OpenClaw Connector',
  description: 'Mirrors OpenClaw conversation and agent lifecycle events to UniPet.',
  register(api) {
    observe(api, 'message_received', (event, ctx) => {
      safeEmit(api, event, ctx, 'running', 'OpenClaw received a message', {
        ttlMs: 120000,
        notificationKind: 'message',
      });
    });

    observe(api, 'before_prompt_build', (event, ctx) => {
      safeEmit(api, event, ctx, 'running', 'OpenClaw is thinking', { ttlMs: 120000 });
    });

    observe(api, 'before_tool_call', (event, ctx) => {
      safeEmit(api, event, ctx, 'running', `Running tool: ${toolName(event)}`, { ttlMs: 120000 });
    });

    observe(api, 'after_tool_call', (event, ctx) => {
      if (isFailure(event)) {
        safeEmit(api, event, ctx, 'failed', `Tool failed: ${toolName(event)}`, { ttlMs: 300000 });
        return;
      }
      safeEmit(api, event, ctx, 'running', `Tool finished: ${toolName(event)}`, { ttlMs: 60000 });
    });

    observe(api, 'message_sending', (event, ctx) => {
      safeEmit(api, event, ctx, 'review', outgoingBubble(api, event), { ttlMs: 300000 });
    });

    observe(api, 'message_processed', (event, ctx) => {
      safeEmit(api, event, ctx, 'review', outgoingBubble(api, event), { ttlMs: 300000 });
    });

    observe(api, 'message_sent', (event, ctx) => {
      if (isFailure(event)) {
        safeEmit(api, event, ctx, 'failed', 'OpenClaw reply failed to send', { ttlMs: 300000 });
      }
    });

    observe(api, 'approval_required', (event, ctx) => {
      safeEmit(api, event, ctx, 'waiting', 'OpenClaw is waiting for approval', { ttlMs: 300000 });
    });

    observe(api, 'agent_end', (event, ctx) => {
      if (isFailure(event)) {
        safeEmit(api, event, ctx, 'failed', 'OpenClaw turn failed', { ttlMs: 300000 });
        return;
      }
      scheduleSourceRemoval(api, event, ctx);
    });

    observe(api, 'session_end', (event, ctx) => {
      removeSource(api, event, ctx);
    });

    observe(api, 'before_reset', (event, ctx) => {
      removeSource(api, event, ctx, 'OpenClaw session reset');
    });

    observe(api, 'gateway_stop', (event, ctx) => {
      removeSource(api, event, ctx, 'OpenClaw gateway stopped');
    });
  },
};

export default plugin;
