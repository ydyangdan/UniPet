#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const connectorLifecycle = require('./connectors');
const market = require('./market');
const pets = require('./pets');
const { PET_STATES, normalizeState, normalizeTtl } = require('./protocol');

console.log = (...args) => {
  fs.writeSync(1, `${args.join(' ')}\n`);
};
console.error = (...args) => {
  fs.writeSync(2, `${args.join(' ')}\n`);
};

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8768;
const DEFAULT_WS_PORT = 8769;
const STARTUP_TIMEOUT_MS = 15000;
const STARTUP_POLL_MS = 250;
const STOP_TIMEOUT_MS = 3000;
const KILL_TIMEOUT_MS = 1500;
const STATE_DEFAULT_TTL = Object.freeze({
  idle: null,
  running: 120000,
  waiting: 120000,
  failed: 20000,
  review: 8000,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function isProcessProbeLiveError(err) {
  return Boolean(err && err.code === 'EPERM');
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
  } catch (err) {
    if (isProcessProbeLiveError(err)) return true;
    return false;
  }
}

function terminateProcess(pid, options = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(pid, options.force ? 'SIGKILL' : 'SIGTERM');
    }
    return true;
  } catch (_) {
    return false;
  }
}

async function waitForProcessExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processExists(pid)) return true;
    await sleep(100);
  }
  return !processExists(pid);
}

function electronOverlayProcessPids() {
  if (process.platform !== 'win32') return [];
  const overlayDir = __dirname.replace(/\//g, '\\').toLowerCase();
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
      const isUniPetElectron = command.includes('electron') && command.includes(overlayDir);
      if (Number.isInteger(pid) && isUniPetElectron) pids.push(pid);
      command = '';
    }
  }
  return [...new Set(pids)];
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
      res.on('error', reject);
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

function projectRoot() {
  return path.resolve(__dirname, '..');
}

function runInherited(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: false,
  });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    return 1;
  }
  return typeof result.status === 'number' ? result.status : 1;
}

function setupScriptPath(connector, extension) {
  return path.join(projectRoot(), 'connectors', connector, `install.${extension}`);
}

function ensureSetupScript(connector, extension) {
  const scriptPath = setupScriptPath(connector, extension);
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Setup script not found: ${scriptPath}`);
  }
  return scriptPath;
}

function runHermesSetup(options) {
  console.log('Setting up UniPet Hermes connector...');
  if (process.platform === 'win32') {
    const scriptPath = ensureSetupScript('hermes', 'ps1');
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    if (!options.start) args.push('-NoStart');
    if (options.hermesHome) args.push('-HermesHome', options.hermesHome);
    return runInherited('powershell.exe', args);
  }
  const scriptPath = ensureSetupScript('hermes', 'sh');
  const args = [scriptPath];
  if (!options.start) args.push('--no-start');
  if (options.hermesHome) args.push('--hermes-home', options.hermesHome);
  return runInherited('bash', args);
}

function runOpenClawSetup(options) {
  console.log('Setting up UniPet OpenClaw connector...');
  if (process.platform === 'win32') {
    const scriptPath = ensureSetupScript('openclaw', 'ps1');
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    if (!options.start) args.push('-NoStart');
    if (options.noEnable) args.push('-NoEnable');
    if (options.skipValidate) args.push('-SkipValidate');
    if (options.copy) args.push('-Copy');
    if (options.openclawCommand) args.push('-OpenClawCommand', options.openclawCommand);
    if (options.unipetCommand) args.push('-UnipetCommand', options.unipetCommand);
    return runInherited('powershell.exe', args);
  }
  const scriptPath = ensureSetupScript('openclaw', 'sh');
  const args = [scriptPath];
  if (!options.start) args.push('--no-start');
  if (options.noEnable) args.push('--no-enable');
  if (options.skipValidate) args.push('--skip-validate');
  if (options.copy) args.push('--copy');
  if (options.openclawCommand) args.push('--openclaw-command', options.openclawCommand);
  if (options.unipetCommand) args.push('--unipet-command', options.unipetCommand);
  return runInherited('bash', args);
}

function runDeepSeekTuiSetup(options) {
  console.log('Setting up UniPet DeepSeek-TUI connector...');
  if (process.platform === 'win32') {
    const scriptPath = ensureSetupScript('deepseek-tui', 'ps1');
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    if (!options.start) args.push('-NoStart');
    if (options.config) args.push('-ConfigPath', options.config);
    if (options.unipetCommand) args.push('-UnipetCommand', options.unipetCommand);
    return runInherited('powershell.exe', args);
  }
  const scriptPath = ensureSetupScript('deepseek-tui', 'sh');
  const args = [scriptPath];
  if (!options.start) args.push('--no-start');
  if (options.config) args.push('--config', options.config);
  if (options.unipetCommand) args.push('--unipet-command', options.unipetCommand);
  return runInherited('bash', args);
}

function runCodexSetup(options) {
  console.log('Setting up UniPet Codex connector...');
  if (process.platform === 'win32') {
    const scriptPath = ensureSetupScript('codex', 'ps1');
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    if (!options.start) args.push('-NoStart');
    if (options.codexConfig || options.config) args.push('-ConfigPath', options.codexConfig || options.config);
    if (options.unipetCommand) args.push('-UnipetCommand', options.unipetCommand);
    return runInherited('powershell.exe', args);
  }
  const scriptPath = ensureSetupScript('codex', 'sh');
  const args = [scriptPath];
  if (!options.start) args.push('--no-start');
  if (options.codexConfig || options.config) args.push('--config', options.codexConfig || options.config);
  if (options.unipetCommand) args.push('--unipet-command', options.unipetCommand);
  return runInherited('bash', args);
}

function runClaudeCodeSetup(options) {
  console.log('Setting up UniPet Claude Code connector...');
  if (process.platform === 'win32') {
    const scriptPath = ensureSetupScript('claude-code', 'ps1');
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    if (!options.start) args.push('-NoStart');
    if (options.claudeSettings || options.settings) args.push('-SettingsPath', options.claudeSettings || options.settings);
    if (options.unipetCommand) args.push('-UnipetCommand', options.unipetCommand);
    return runInherited('powershell.exe', args);
  }
  const scriptPath = ensureSetupScript('claude-code', 'sh');
  const args = [scriptPath];
  if (!options.start) args.push('--no-start');
  if (options.claudeSettings || options.settings) args.push('--settings', options.claudeSettings || options.settings);
  if (options.unipetCommand) args.push('--unipet-command', options.unipetCommand);
  return runInherited('bash', args);
}

function setupConnectorTarget(target, options) {
  if (target === 'hermes') return runHermesSetup(options);
  if (target === 'openclaw') return runOpenClawSetup(options);
  if (target === 'deepseek-tui') return runDeepSeekTuiSetup(options);
  if (target === 'codex') return runCodexSetup(options);
  if (target === 'claude-code') return runClaudeCodeSetup(options);
  if (target === 'all') {
    const hermesCode = runHermesSetup(options);
    if (hermesCode !== 0) return hermesCode;
    const openClawCode = runOpenClawSetup(options);
    if (openClawCode !== 0) return openClawCode;
    const deepSeekCode = runDeepSeekTuiSetup(options);
    if (deepSeekCode !== 0) return deepSeekCode;
    const codexCode = runCodexSetup(options);
    if (codexCode !== 0) return codexCode;
    return runClaudeCodeSetup(options);
  }
  throw new Error(`Unknown connector: ${target}`);
}

async function liveRuntime() {
  const runtime = readRuntime();
  if (!runtime || !processExists(runtime.pid)) {
    try {
      fs.rmSync(runtimePath(), { force: true });
    } catch (_) {}
    return null;
  }
  const currentHealth = await health(runtime.host || DEFAULT_HOST, runtime.port || DEFAULT_PORT);
  if (!currentHealth) return null;
  return { runtime, currentHealth };
}

async function cmdStart(args) {
  const { options } = parseOptions(args);
  const host = options.host || DEFAULT_HOST;
  const port = Number.parseInt(options.port || DEFAULT_PORT, 10);
  const wsPort = Number.parseInt(options.wsPort || DEFAULT_WS_PORT, 10);
  const runtime = readRuntime();
  const currentHealth = runtime ? await health(runtime.host || host, runtime.port || port) : null;

  if (runtime && currentHealth && currentHealth.pid === runtime.pid && currentHealth.runtime === 'node-electron') {
    console.log(`UniPet already running: http://${runtime.host || host}:${runtime.port || port}`);
    return 0;
  }

  stopOverlayProcesses();

  const electron = electronBinary();
  if (!electron) {
    console.error("Electron dependency not found. Reinstall with 'npm install -g uni-pet', or run 'npm install' in the project root.");
    return 1;
  }

  fs.mkdirSync(path.join(unipetHome(), 'runtime'), { recursive: true });
  const env = {
    ...process.env,
    UNIPET_HOST: host,
    UNIPET_PORT: String(port),
    UNIPET_WS_PORT: String(wsPort),
    UNIPET_WS_URL: `ws://${host}:${wsPort}/ws`,
  };
  if (process.platform === 'win32') {
    const quotePs = (value) => `'${String(value).replace(/'/g, "''")}'`;
    const command = `Start-Process -WindowStyle Hidden -FilePath ${quotePs(electron)} -ArgumentList ${quotePs(__dirname)}`;
    spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      stdio: 'ignore',
      windowsHide: true,
      env,
    });
  } else {
    const child = spawn(electron, [__dirname], {
      detached: true,
      stdio: 'ignore',
      env,
    });
    child.unref();
  }

  for (let waited = 0; waited < STARTUP_TIMEOUT_MS; waited += STARTUP_POLL_MS) {
    const started = await health(host, port);
    if (started && started.runtime === 'node-electron') {
      console.log(`UniPet started: http://${host}:${port}`);
      return 0;
    }
    await sleep(STARTUP_POLL_MS);
  }

  console.error("UniPet failed to start. Run 'unipet doctor' for details.");
  return 1;
}

async function cmdStatus() {
  const live = await liveRuntime();
  if (!live) {
    console.log('UniPet: not running');
    console.log('  run: unipet start');
    return 0;
  }
  const { runtime, currentHealth } = live;
  const view = await requestJson('GET', runtime.port || DEFAULT_PORT, '/api/pet/view', null, runtime.host || DEFAULT_HOST);
  console.log(`UniPet running: pid=${runtime.pid}  http://${runtime.host}:${runtime.port}`);
  console.log(`  websocket: ${runtime.ws_url || `ws://${runtime.host}:${runtime.ws_port}/ws`}`);
  console.log(`  runtime: ${currentHealth && currentHealth.runtime ? currentHealth.runtime : runtime.runtime || 'unknown'}`);
  if (currentHealth) console.log(`  uptime: ${Math.floor(currentHealth.uptime || 0)}s`);
  if (view.currentPet) {
    console.log(`  current pet: ${view.currentPet.id} (${view.currentPet.displayName || view.currentPet.id})`);
  }
  const active = view.activePet || null;
  console.log(`  active state: ${view.activeState || 'idle'}${active ? ` from ${active.source}` : ''}`);
  console.log(`  sources: ${(view.pets || []).length}`);
  for (const pet of view.pets || []) {
    console.log(`  [${pet.source}] ${pet.state}${formatExpiry(pet)}: ${String(pet.message || '').slice(0, 60)}`);
  }
  return 0;
}

function formatExpiry(pet) {
  if (!pet || pet.ttl === null || pet.ttl === undefined) return '';
  const expiresAt = Number(pet.updatedAt || 0) + Number(pet.ttl || 0) / 1000;
  const remaining = Math.ceil(expiresAt - Date.now() / 1000);
  if (!Number.isFinite(remaining)) return '';
  if (remaining <= 0) return ' expiring';
  return ` ${formatDuration(remaining)}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) return rest ? `${minutes}m${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const minuteRest = minutes % 60;
  return minuteRest ? `${hours}h${minuteRest}m` : `${hours}h`;
}

async function notifyPetChangeIfRunning(id) {
  const live = await liveRuntime();
  if (!live) return false;
  const { runtime } = live;
  await requestJson('POST', runtime.port || DEFAULT_PORT, '/api/pet/use', { id }, runtime.host || DEFAULT_HOST);
  return true;
}

async function ensureRunning() {
  const live = await liveRuntime();
  if (live) return live.runtime;
  const code = await cmdStart([]);
  if (code !== 0) return null;
  const started = await liveRuntime();
  return started ? started.runtime : null;
}

async function cmdStop() {
  const runtime = readRuntime();
  let canRemoveRuntime = true;
  if (runtime && runtime.pid) {
    if (processExists(runtime.pid)) {
      terminateProcess(runtime.pid);
      let stopped = await waitForProcessExit(runtime.pid, STOP_TIMEOUT_MS);
      if (!stopped && process.platform !== 'win32') {
        terminateProcess(runtime.pid, { force: true });
        stopped = await waitForProcessExit(runtime.pid, KILL_TIMEOUT_MS);
      }
      if (stopped) {
        console.log(`UniPet stopped (pid ${runtime.pid})`);
      } else {
        canRemoveRuntime = false;
        console.error(`UniPet did not stop within ${STOP_TIMEOUT_MS + KILL_TIMEOUT_MS}ms (pid ${runtime.pid})`);
      }
    } else {
      console.log(`UniPet runtime pid ${runtime.pid} is not running`);
    }
  } else {
    console.log('UniPet: not running');
  }
  stopOverlayProcesses();
  if (!canRemoveRuntime && runtime && runtime.pid && !processExists(runtime.pid)) {
    canRemoveRuntime = true;
  }
  if (canRemoveRuntime) {
    try {
      fs.rmSync(runtimePath(), { force: true });
    } catch (_) {}
  }
  return canRemoveRuntime ? 0 : 1;
}

async function cmdState(args) {
  const { options, rest } = parseOptions(args);
  const [state, ...messageParts] = rest;
  const message = messageParts.join(' ');
  if (!state || !message) {
    console.error('Usage: unipet state <idle|running|waiting|failed|review> <message> [--source id] [--ttl duration]');
    return 1;
  }
  const normalizedState = normalizeState(state);
  if (!PET_STATES.includes(normalizedState) || (normalizedState === 'idle' && String(state).toLowerCase() !== 'idle')) {
    console.error(`State must be one of: ${PET_STATES.join(', ')}`);
    return 1;
  }
  const ttl = options.ttl ? normalizeTtl(options.ttl) : STATE_DEFAULT_TTL[normalizedState];
  if (options.ttl && ttl === null) {
    console.error('TTL must look like 120000, 30s, 2m, 1h, or 1500ms.');
    return 1;
  }
  const runtime = await ensureRunning();
  if (!runtime) {
    console.error('UniPet bridge is not available.');
    return 1;
  }
  const payload = {
    source: options.source || 'local-unipet',
    state: normalizedState,
    message,
    action: 'update',
  };
  if (ttl !== null) payload.ttl = ttl;
  const result = await requestJson('POST', runtime.port || DEFAULT_PORT, '/api/pet/events', payload, runtime.host || DEFAULT_HOST);
  console.log(`State: ${normalizedState} - ${message}`);
  console.log(`  active state -> ${result.activeState || '?'}`);
  return 0;
}

async function cmdClear() {
  const live = await liveRuntime();
  if (!live) {
    console.log('UniPet: not running');
    return 0;
  }
  const { runtime } = live;
  if (!runtime) {
    console.error('UniPet bridge is not available.');
    return 1;
  }
  const result = await requestJson('POST', runtime.port || DEFAULT_PORT, '/api/pet/events', {
    source: 'local-unipet',
    state: 'idle',
    message: 'cleared',
    action: 'clear',
  }, runtime.host || DEFAULT_HOST);
  console.log(`Cleared. active state -> ${result.activeState || '?'}`);
  return 0;
}

const DEMO_STEPS = Object.freeze([
  { state: 'idle', message: 'UniPet ready', ttl: '2s' },
  { state: 'running', message: 'read_file package.json', ttl: '8s' },
  { state: 'running', message: 'apply_patch renderer.js', ttl: '8s' },
  { state: 'running', message: 'exec_shell npm test', ttl: '8s' },
  { state: 'running', message: 'fetch project context', ttl: '8s' },
  { state: 'waiting', message: 'Waiting for approval', ttl: '2m' },
  { state: 'failed', message: 'Command failed with timeout', ttl: '12s' },
  { state: 'review', message: 'All tests passed', ttl: '8s' },
]);

async function cmdDemo(args) {
  const { options } = parseOptions(args);
  const source = options.source || 'demo';
  const rawStep = options.step || options.interval || '1200ms';
  const stepMs = normalizeTtl(rawStep);
  if (stepMs === null) {
    console.error('Step duration must look like 1500ms, 2s, or 1m.');
    return 1;
  }
  const runtime = await ensureRunning();
  if (!runtime) {
    console.error('UniPet bridge is not available.');
    return 1;
  }

  console.log(`Demo source: ${source}`);
  for (const step of DEMO_STEPS) {
    const payload = {
      source,
      state: step.state,
      message: step.message,
      action: 'update',
      ttl: normalizeTtl(step.ttl),
    };
    await requestJson('POST', runtime.port || DEFAULT_PORT, '/api/pet/events', payload, runtime.host || DEFAULT_HOST);
    console.log(`  ${step.state.padEnd(7)} ${step.message}`);
    await sleep(stepMs);
  }
  console.log('Demo complete. Run `unipet clear` to return to idle now.');
  return 0;
}

async function cmdDoctor() {
  const electronOk = Boolean(electronBinary());
  const live = await liveRuntime();
  const summary = doctorSummary({ electronOk, live });

  console.log('UniPet doctor');
  console.log(`  node: ${process.version}`);
  console.log(`  cli: ${__filename}`);
  console.log(`  home: ${unipetHome()}`);
  console.log(`  pets: ${pets.petsRoot()}`);
  console.log(`  current pet: ${pets.currentPetId()}`);
  console.log(`  electron: ${electronOk ? 'ok' : 'missing'}`);
  console.log(`  runtime file: ${fs.existsSync(runtimePath()) ? runtimePath() : 'missing'}`);
  console.log(`  health: ${summary.health}`);
  console.log(`  connectors: ${connectorLifecycle.connectorList().length} available (run 'unipet agent status' for details)`);
  if (!live) {
    console.log('  runtime: not running');
    for (const next of summary.next) console.log(`  next: ${next}`);
    return 0;
  }
  const { runtime, currentHealth } = live;
  console.log(`  runtime: ${currentHealth.runtime || runtime.runtime || 'unknown'}`);
  console.log(`  pid: ${runtime.pid}`);
  console.log(`  http: http://${runtime.host}:${runtime.port}`);
  console.log(`  websocket: ${runtime.ws_url || `ws://${runtime.host}:${runtime.ws_port}/ws`}`);
  console.log(`  uptime: ${Math.floor(currentHealth.uptime || 0)}s`);
  for (const next of summary.next) console.log(`  next: ${next}`);
  return 0;
}

function doctorSummary({ electronOk, live }) {
  if (!electronOk) {
    return {
      health: 'needs install',
      next: ["reinstall with 'npm install -g uni-pet' or run 'npm install' from source"],
    };
  }
  if (!live) {
    return {
      health: 'stopped',
      next: ["run 'unipet start' to launch the desktop pet"],
    };
  }
  return {
    health: 'ready',
    next: [
      "run 'unipet demo' to preview the core agent states",
      "run 'unipet agent status' to inspect Agent integrations",
    ],
  };
}

function formatLocalPet(pet, currentId) {
  const marker = pet.id === currentId ? '*' : ' ';
  const source = pet.builtin ? 'builtin' : pet.source;
  return `${marker} ${pet.id.padEnd(18)} ${pet.displayName.padEnd(24)} ${source}`;
}

async function cmdPet(args) {
  const { options, rest } = parseOptions(args);
  const [subcommand, id] = rest;
  if (!subcommand || subcommand === 'list') {
    const currentId = pets.currentPetId();
    console.log('Local pets:');
    for (const pet of pets.listPets()) {
      console.log(formatLocalPet(pet, currentId));
    }
    return 0;
  }
  if (subcommand === 'current') {
    const pet = pets.currentPet();
    console.log(`Current pet: ${pet.id} (${pet.displayName})`);
    console.log(`  source: ${pet.builtin ? 'builtin' : pet.source}`);
    console.log(`  path: ${pet.dir}`);
    return 0;
  }
  if (subcommand === 'search') {
    const query = rest.slice(1).join(' ').trim();
    const page = await market.listMarketPets({
      query,
      page: options.page,
      limit: options.limit || options.pageSize,
      sort: options.sort || 'new',
      content: options.content || 'safe',
    });
    console.log(market.formatMarketPage(page));
    return 0;
  }
  if (subcommand === 'info') {
    const identifier = rest.slice(1).join(' ').trim();
    if (!identifier) {
      console.error('Usage: unipet pet info <pet-id-or-url>');
      return 1;
    }
    const pet = await market.fetchMarketPet(identifier);
    console.log(market.formatMarketPet(pet));
    return 0;
  }
  if (subcommand === 'install') {
    const identifier = rest.slice(1).join(' ').trim();
    if (!identifier) {
      console.error('Usage: unipet pet install <pet-id-or-url> [--use] [--as local-id]');
      return 1;
    }
    const result = await market.installMarketPet(identifier, { localId: options.as || '' });
    console.log(`Installed pet: ${result.installed.id} (${result.installed.displayName})`);
    console.log(`  source: ${result.pet.id} from Codex Pet Share`);
    console.log(`  path: ${result.installed.dir}`);
    if (options.use) {
      pets.setCurrentPet(result.installed.id);
      let hotReloaded = false;
      try {
        hotReloaded = await notifyPetChangeIfRunning(result.installed.id);
      } catch (err) {
        console.error(`Warning: installed and selected pet, but running overlay was not updated: ${err.message}`);
      }
      console.log(`  current pet -> ${result.installed.id}`);
      console.log(hotReloaded ? '  overlay updated' : '  start UniPet to see it');
    }
    return 0;
  }
  if (subcommand === 'validate') {
    const target = rest.slice(1).join(' ').trim();
    if (!target) {
      console.error('Usage: unipet pet validate <pet-dir>');
      return 1;
    }
    const result = pets.validatePetDirectory(target);
    console.log(`Pet: ${result.pet.id || '?'} (${result.pet.displayName || '?'})`);
    console.log(`  path: ${result.pet.dir}`);
    console.log(`  valid: ${result.valid ? 'yes' : 'no'}`);
    for (const warning of result.warnings) console.log(`  warning: ${warning}`);
    for (const error of result.errors) console.log(`  error: ${error}`);
    return result.valid ? 0 : 1;
  }
  if (subcommand === 'import') {
    const target = rest.slice(1).join(' ').trim();
    if (!target) {
      console.error('Usage: unipet pet import <pet-dir> [--as local-id] [--use]');
      return 1;
    }
    const imported = pets.importPetDirectory(target, { localId: options.as || '' });
    console.log(`Imported pet: ${imported.id} (${imported.displayName})`);
    console.log(`  path: ${imported.dir}`);
    if (options.use) {
      pets.setCurrentPet(imported.id);
      let hotReloaded = false;
      try {
        hotReloaded = await notifyPetChangeIfRunning(imported.id);
      } catch (err) {
        console.error(`Warning: imported and selected pet, but running overlay was not updated: ${err.message}`);
      }
      console.log(`  current pet -> ${imported.id}`);
      console.log(hotReloaded ? '  overlay updated' : '  start UniPet to see it');
    }
    return 0;
  }
  if (subcommand === 'use') {
    if (!id) {
      console.error('Usage: unipet pet use <pet-id>');
      return 1;
    }
    const pet = pets.setCurrentPet(id);
    let hotReloaded = false;
    try {
      hotReloaded = await notifyPetChangeIfRunning(pet.id);
    } catch (err) {
      console.error(`Warning: saved pet selection, but running overlay was not updated: ${err.message}`);
    }
    console.log(`Using pet: ${pet.id} (${pet.displayName})`);
    console.log(hotReloaded ? '  overlay updated' : '  start UniPet to see it');
    return 0;
  }
  if (subcommand === 'remove') {
    if (!id) {
      console.error('Usage: unipet pet remove <pet-id>');
      return 1;
    }
    const result = pets.removePet(id);
    if (result.wasCurrent) {
      try {
        await notifyPetChangeIfRunning(result.current.id);
      } catch (err) {
        console.error(`Warning: removed current pet, but running overlay was not updated: ${err.message}`);
      }
    }
    console.log(`Removed pet: ${result.removed.id} (${result.removed.displayName})`);
    if (result.wasCurrent) console.log(`  current pet -> ${result.current.id}`);
    return 0;
  }
  console.error(`Unknown pet command: ${subcommand}`);
  console.error('Usage: unipet pet <list|current|search|info|install|validate|import|use|remove>');
  return 1;
}

function agentUsage() {
  return `Usage:
  unipet agent list
  unipet agent status [hermes|openclaw|deepseek-tui|codex|claude-code|all]
  unipet agent add <hermes|openclaw|deepseek-tui|codex|claude-code|all> [--start]
  unipet agent disable <hermes|openclaw|deepseek-tui|codex|claude-code|all>
  unipet agent remove <hermes|openclaw|deepseek-tui|codex|claude-code|all>
`;
}

async function cmdAgent(args) {
  const [rawSubcommand, ...remaining] = args;
  const subcommand = rawSubcommand || 'help';
  if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    console.log(agentUsage());
    return 0;
  }

  const { options, rest } = parseOptions(remaining);

  try {
    if (subcommand === 'list') {
      console.log('Agents:');
      for (const connector of connectorLifecycle.connectorList()) {
        console.log(`  ${connector.id.padEnd(14)} ${connector.description}`);
      }
      return 0;
    }
    if (subcommand === 'status') {
      const [target = 'all'] = rest;
      return connectorLifecycle.printStatus(target, options);
    }
    if (subcommand === 'add') {
      const [target] = rest;
      if (!target) {
        console.error('Usage: unipet agent add <hermes|openclaw|deepseek-tui|codex|claude-code|all> [--start]');
        return 1;
      }
      return setupConnectorTarget(target, options);
    }
    if (subcommand === 'disable') {
      const [target] = rest;
      if (!target) {
        console.error('Usage: unipet agent disable <hermes|openclaw|deepseek-tui|codex|claude-code|all>');
        return 1;
      }
      return connectorLifecycle.disableConnector(target, options);
    }
    if (subcommand === 'remove') {
      const [target] = rest;
      if (!target) {
        console.error('Usage: unipet agent remove <hermes|openclaw|deepseek-tui|codex|claude-code|all>');
        return 1;
      }
      return connectorLifecycle.removeConnector(target, options);
    }
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  console.error(`Unknown agent command: ${subcommand}`);
  console.error('Usage: unipet agent <list|status|add|disable|remove>');
  return 1;
}

async function cmdHook(args) {
  const [target, ...rest] = args;
  if (target === 'help' || target === '--help' || target === '-h') {
    console.log('Usage: unipet hook <deepseek-tui|codex|claude-code> <event>');
    return 0;
  }
  if (target === 'deepseek-tui') {
    const deepseekTui = require('../connectors/deepseek-tui/hook');
    return deepseekTui.main(rest);
  }
  if (target === 'codex') {
    const codex = require('../connectors/codex/hook');
    return codex.main(rest);
  }
  if (target === 'claude-code') {
    const claudeCode = require('../connectors/claude-code/hook');
    return claudeCode.main(rest);
  }
  console.error(`Unknown hook target: ${target || ''}`);
  console.error('Usage: unipet hook <deepseek-tui|codex|claude-code> <event>');
  return 1;
}

function help() {
  console.log(`UniPet Node runtime

Commands:
  unipet start [--host 127.0.0.1] [--port 8768] [--ws-port 8769]
  unipet status
  unipet doctor
  unipet stop
  unipet demo [--source demo] [--step 1200ms]
  unipet clear
  unipet state <idle|running|waiting|failed|review> <message> [--source id] [--ttl duration]
  unipet agent <list|status|add|disable|remove>
  unipet pet <list|current|search|info|install|validate|import|use|remove>
`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (!command || command === 'status') {
      process.exitCode = await cmdStatus();
      return;
    }
    if (command === 'start') {
      process.exitCode = await cmdStart(args);
      return;
    }
    if (command === 'stop') {
      process.exitCode = await cmdStop();
      return;
    }
    if (command === 'doctor') {
      process.exitCode = await cmdDoctor();
      return;
    }
    if (command === 'demo') {
      process.exitCode = await cmdDemo(args);
      return;
    }
    if (command === 'state') {
      process.exitCode = await cmdState(args);
      return;
    }
    if (command === 'clear') {
      process.exitCode = await cmdClear(args);
      return;
    }
    if (command === 'pet') {
      process.exitCode = await cmdPet(args);
      return;
    }
    if (command === 'agent') {
      process.exitCode = await cmdAgent(args);
      return;
    }
    if (command === 'hook') {
      process.exitCode = await cmdHook(args);
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

if (require.main === module) {
  main();
} else {
  module.exports = {
    doctorSummary,
    isProcessProbeLiveError,
  };
}
