#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { PROTOCOL_VERSION } = require('./core');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8768;
const DEFAULT_WS_PORT = 8769;

function unipetHome() {
  return process.env.UNIPET_HOME || path.join(os.homedir(), '.unipet');
}

function runtimePath() {
  return path.join(unipetHome(), 'runtime', 'pet_runtime.json');
}

function readRuntime() {
  try {
    return JSON.parse(fs.readFileSync(runtimePath(), 'utf8'));
  } catch (_) {
    return null;
  }
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (process.platform === 'win32') {
    const result = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
    return result.stdout.includes(String(pid));
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function terminateProcess(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    return true;
  } catch (_) {
    return false;
  }
}

function matchingProcessPids(tokens) {
  if (process.platform !== 'win32') return [];
  const result = spawnSync('wmic', ['process', 'get', 'ProcessId,CommandLine', '/format:list'], {
    encoding: 'utf8',
  });
  if (result.error) return [];
  const pids = [];
  let command = '';
  for (const rawLine of result.stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('CommandLine=')) {
      command = line.slice('CommandLine='.length).replace(/\//g, '\\').toLowerCase();
    } else if (line.startsWith('ProcessId=')) {
      const pid = Number.parseInt(line.slice('ProcessId='.length), 10);
      if (Number.isInteger(pid) && tokens.some((token) => command.includes(token.toLowerCase()))) {
        pids.push(pid);
      }
      command = '';
    }
  }
  return [...new Set(pids)];
}

function electronOverlayProcessPids() {
  if (process.platform !== 'win32') return [];
  const result = spawnSync('wmic', ['process', 'get', 'ProcessId,CommandLine', '/format:list'], {
    encoding: 'utf8',
  });
  if (result.error) return [];
  const pids = [];
  let command = '';
  for (const rawLine of result.stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('CommandLine=')) {
      command = line.slice('CommandLine='.length).replace(/\//g, '\\').toLowerCase();
    } else if (line.startsWith('ProcessId=')) {
      const pid = Number.parseInt(line.slice('ProcessId='.length), 10);
      const isUniPetElectron = command.includes('electron') &&
        (command.includes('\\unipet\\overlay') || command.includes('unipet-overlay'));
      if (Number.isInteger(pid) && isUniPetElectron) pids.push(pid);
      command = '';
    }
  }
  return [...new Set(pids)];
}

function stopBridgeProcesses(exceptPid = null) {
  for (const pid of matchingProcessPids(['unipet.bridge', 'unipet-bridge'])) {
    if (pid !== exceptPid) terminateProcess(pid);
  }
}

function stopOverlayProcesses(exceptPid = null) {
  for (const pid of electronOverlayProcessPids()) {
    if (pid !== exceptPid) terminateProcess(pid);
  }
}

function requestJson(method, port, pathname, payload = null, host = DEFAULT_HOST, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const body = payload ? Buffer.from(JSON.stringify(payload), 'utf8') : null;
    const req = http.request({
      host,
      port,
      path: pathname,
      method,
      timeout: timeoutMs,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      } : undefined,
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const data = raw ? JSON.parse(raw) : {};
          if (res.statusCode >= 400) reject(new Error(data.error || `HTTP ${res.statusCode}`));
          else resolve(data);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function health(host, port) {
  try {
    return await requestJson('GET', port, '/health', null, host);
  } catch (_) {
    return null;
  }
}

function parseOptions(args) {
  const options = {};
  const rest = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      rest.push(arg);
      continue;
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
    const next = args[i + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
    } else {
      options[key] = next;
      i += 1;
    }
  }
  return { options, rest };
}

function electronBinary() {
  try {
    return require('electron');
  } catch (_) {
    return null;
  }
}

async function cmdLaunch(args) {
  const { options } = parseOptions(args);
  const host = options.host || DEFAULT_HOST;
  const port = Number.parseInt(options.port || DEFAULT_PORT, 10);
  const wsPort = Number.parseInt(options.wsPort || DEFAULT_WS_PORT, 10);
  const runtime = readRuntime();
  const currentHealth = runtime ? await health(runtime.host || host, runtime.port || port) : null;

  if (runtime && currentHealth && currentHealth.pid === runtime.pid && currentHealth.runtime === 'node-electron') {
    stopBridgeProcesses(runtime.pid);
    stopOverlayProcesses(runtime.pid);
    console.log(`UniPet already running: http://${runtime.host || host}:${runtime.port || port}`);
    return 0;
  }

  stopBridgeProcesses();
  stopOverlayProcesses();

  const electron = electronBinary();
  if (!electron) {
    console.error("Electron dependency not found. Run 'npm install' inside the overlay directory.");
    return 1;
  }

  fs.mkdirSync(path.join(unipetHome(), 'runtime'), { recursive: true });
  const logPath = path.join(unipetHome(), 'runtime', 'overlay.log');
  const logFd = fs.openSync(logPath, 'a');
  const child = spawn(electron, [__dirname], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      UNIPET_HOST: host,
      UNIPET_PORT: String(port),
      UNIPET_WS_PORT: String(wsPort),
      UNIPET_WS_URL: `ws://${host}:${wsPort}/ws`,
    },
  });
  child.unref();
  fs.closeSync(logFd);

  for (let i = 0; i < 30; i += 1) {
    const started = await health(host, port);
    if (started && started.runtime === 'node-electron') {
      console.log(`UniPet launched: http://${host}:${port}`);
      return 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.error(`UniPet failed to start. See log: ${logPath}`);
  return 1;
}

async function cmdStatus() {
  const runtime = readRuntime();
  if (!runtime || !processExists(runtime.pid)) {
    console.log('UniPet: not running');
    return 0;
  }
  const view = await requestJson('GET', runtime.port || DEFAULT_PORT, '/api/pet/view', null, runtime.host || DEFAULT_HOST);
  const currentHealth = await health(runtime.host || DEFAULT_HOST, runtime.port || DEFAULT_PORT);
  console.log(`UniPet running: pid=${runtime.pid}  http://${runtime.host}:${runtime.port}`);
  console.log(`  websocket: ${runtime.ws_url || `ws://${runtime.host}:${runtime.ws_port}/ws`}`);
  console.log(`  runtime: ${currentHealth && currentHealth.runtime ? currentHealth.runtime : runtime.runtime || 'unknown'}`);
  if (currentHealth) console.log(`  uptime: ${Math.floor(currentHealth.uptime || 0)}s`);
  console.log(`  active state: ${view.active_state || 'idle'}`);
  for (const pet of view.pets || []) {
    console.log(`  [${pet.source_id}] ${pet.state}: ${String(pet.message || '').slice(0, 60)}`);
  }
  return 0;
}

async function cmdStop() {
  const runtime = readRuntime();
  if (runtime && runtime.pid) {
    terminateProcess(runtime.pid);
    console.log(`UniPet stopped (pid ${runtime.pid})`);
  } else {
    console.log('UniPet: not running');
  }
  stopBridgeProcesses();
  stopOverlayProcesses();
  try {
    fs.rmSync(runtimePath(), { force: true });
  } catch (_) {}
  return 0;
}

async function cmdEmit(args) {
  const { options, rest } = parseOptions(args);
  const [state, ...messageParts] = rest;
  const message = messageParts.join(' ');
  if (!state || !message) {
    console.error('Usage: unipet emit <idle|running|waiting|failed|review> <message> [--source id] [--label text] [--ttl-ms n]');
    return 1;
  }
  const runtime = readRuntime();
  if (!runtime) {
    console.error('UniPet bridge not running. Start with: unipet launch');
    return 1;
  }
  const payload = {
    protocol: PROTOCOL_VERSION,
    source_id: options.source || 'local-unipet',
    label: options.label || options.source || 'UniPet',
    state,
    message,
    action: 'update',
  };
  if (options.ttlMs) payload.ttl_ms = Number.parseInt(options.ttlMs, 10);
  const result = await requestJson('POST', runtime.port || DEFAULT_PORT, '/api/pet/events', payload, runtime.host || DEFAULT_HOST);
  console.log(`Emitted: ${state} - ${message}`);
  console.log(`  active state -> ${result.active_state || '?'}`);
  return 0;
}

async function cmdClear() {
  const runtime = readRuntime();
  if (!runtime) {
    console.error('UniPet bridge not running. Start with: unipet launch');
    return 1;
  }
  const result = await requestJson('POST', runtime.port || DEFAULT_PORT, '/api/pet/events', {
    protocol: PROTOCOL_VERSION,
    source_id: 'local-unipet',
    label: 'UniPet',
    state: 'idle',
    message: 'cleared',
    action: 'clear',
  }, runtime.host || DEFAULT_HOST);
  console.log(`Cleared. active state -> ${result.active_state || '?'}`);
  return 0;
}

function help() {
  console.log(`UniPet Node runtime

Commands:
  unipet launch [--host 127.0.0.1] [--port 8768] [--ws-port 8769]
  unipet status
  unipet stop
  unipet clear
  unipet emit <idle|running|waiting|failed|review> <message> [--source id] [--label text] [--ttl-ms n]
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (!command || command === 'status') {
      process.exitCode = await cmdStatus();
      return;
    }
    if (command === 'launch') {
      process.exitCode = await cmdLaunch(args);
      return;
    }
    if (command === 'stop') {
      process.exitCode = await cmdStop();
      return;
    }
    if (command === 'emit') {
      process.exitCode = await cmdEmit(args);
      return;
    }
    if (command === 'clear') {
      process.exitCode = await cmdClear(args);
      return;
    }
    if (command === 'help' || command === '--help' || command === '-h') {
      help();
      process.exitCode = 0;
      return;
    }
    console.error(`Unknown command: ${command}`);
    help();
    process.exitCode = 1;
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
