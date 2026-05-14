#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { PROTOCOL_VERSION } = require('./core');
const market = require('./market');
const pets = require('./pets');

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
    return 0;
  }
  const { runtime, currentHealth } = live;
  const view = await requestJson('GET', runtime.port || DEFAULT_PORT, '/api/pet/view', null, runtime.host || DEFAULT_HOST);
  console.log(`UniPet running: pid=${runtime.pid}  http://${runtime.host}:${runtime.port}`);
  console.log(`  websocket: ${runtime.ws_url || `ws://${runtime.host}:${runtime.ws_port}/ws`}`);
  console.log(`  runtime: ${currentHealth && currentHealth.runtime ? currentHealth.runtime : runtime.runtime || 'unknown'}`);
  if (currentHealth) console.log(`  uptime: ${Math.floor(currentHealth.uptime || 0)}s`);
  if (view.current_pet) {
    console.log(`  current pet: ${view.current_pet.id} (${view.current_pet.displayName || view.current_pet.id})`);
  }
  console.log(`  active state: ${view.active_state || 'idle'}`);
  for (const pet of view.pets || []) {
    console.log(`  [${pet.source_id}] ${pet.state}: ${String(pet.message || '').slice(0, 60)}`);
  }
  return 0;
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

async function cmdEmit(args) {
  const { options, rest } = parseOptions(args);
  const [state, ...messageParts] = rest;
  const message = messageParts.join(' ');
  if (!state || !message) {
    console.error('Usage: unipet emit <idle|running|waiting|failed|review> <message> [--source id] [--label text] [--ttl-ms n]');
    return 1;
  }
  const runtime = await ensureRunning();
  if (!runtime) {
    console.error('UniPet bridge is not available.');
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

async function cmdDoctor() {
  console.log('UniPet doctor');
  console.log(`  node: ${process.version}`);
  console.log(`  cli: ${__filename}`);
  console.log(`  home: ${unipetHome()}`);
  console.log(`  pets: ${pets.petsRoot()}`);
  console.log(`  current pet: ${pets.currentPetId()}`);
  console.log(`  electron: ${electronBinary() ? 'ok' : 'missing'}`);
  console.log(`  runtime file: ${fs.existsSync(runtimePath()) ? runtimePath() : 'missing'}`);
  const live = await liveRuntime();
  if (!live) {
    console.log('  runtime: not running');
    return 0;
  }
  const { runtime, currentHealth } = live;
  console.log(`  runtime: ${currentHealth.runtime || runtime.runtime || 'unknown'}`);
  console.log(`  pid: ${runtime.pid}`);
  console.log(`  http: http://${runtime.host}:${runtime.port}`);
  console.log(`  websocket: ${runtime.ws_url || `ws://${runtime.host}:${runtime.ws_port}/ws`}`);
  console.log(`  uptime: ${Math.floor(currentHealth.uptime || 0)}s`);
  return 0;
}

function formatLocalPet(pet, currentId) {
  const marker = pet.id === currentId ? '*' : ' ';
  const source = pet.builtin ? 'builtin' : pet.source;
  return `${marker} ${pet.id.padEnd(18)} ${pet.displayName.padEnd(24)} ${source}`;
}

async function cmdPet(args) {
  const { rest } = parseOptions(args);
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
  console.error('Usage: unipet pet <list|current|use|remove>');
  return 1;
}

async function cmdMarket(args) {
  const { options, rest } = parseOptions(args);
  const [subcommand, ...terms] = rest;
  if (!subcommand || subcommand === 'list') {
    const page = await market.listMarketPets({
      page: options.page,
      limit: options.limit || options.pageSize,
      sort: options.sort || 'new',
      content: options.content || 'safe',
    });
    console.log(market.formatMarketPage(page));
    return 0;
  }
  if (subcommand === 'search') {
    const query = terms.join(' ').trim();
    if (!query) {
      console.error('Usage: unipet market search <query>');
      return 1;
    }
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
    const identifier = terms.join(' ').trim();
    if (!identifier) {
      console.error('Usage: unipet market info <pet-id-or-url>');
      return 1;
    }
    const pet = await market.fetchMarketPet(identifier);
    console.log(market.formatMarketPet(pet));
    return 0;
  }
  if (subcommand === 'install') {
    const identifier = terms.join(' ').trim();
    if (!identifier) {
      console.error('Usage: unipet market install <pet-id-or-url> [--use] [--as local-id]');
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
  console.error(`Unknown market command: ${subcommand}`);
  console.error('Usage: unipet market <list|search|info|install>');
  return 1;
}

async function cmdSetup(args) {
  const { options, rest } = parseOptions(args);
  const [target] = rest;
  if (!target || target === 'help' || target === '--help' || target === '-h') {
    console.log(`Usage:
  unipet setup hermes [--start] [--hermes-home path]
  unipet setup openclaw [--start] [--copy] [--no-enable] [--skip-validate]
  unipet setup deepseek-tui [--start] [--config path]
  unipet setup all [--start]
`);
    return target ? 0 : 1;
  }
  if (target === 'hermes') {
    return runHermesSetup(options);
  }
  if (target === 'openclaw') {
    return runOpenClawSetup(options);
  }
  if (target === 'deepseek-tui') {
    return runDeepSeekTuiSetup(options);
  }
  if (target === 'all') {
    const hermesCode = runHermesSetup(options);
    if (hermesCode !== 0) return hermesCode;
    const openClawCode = runOpenClawSetup(options);
    if (openClawCode !== 0) return openClawCode;
    return runDeepSeekTuiSetup(options);
  }
  console.error(`Unknown setup target: ${target}`);
  console.error('Usage: unipet setup <hermes|openclaw|deepseek-tui|all>');
  return 1;
}

async function cmdHook(args) {
  const [target, ...rest] = args;
  if (target === 'deepseek-tui') {
    const deepseekTui = require('../connectors/deepseek-tui/hook');
    return deepseekTui.main(rest);
  }
  console.error(`Unknown hook target: ${target || ''}`);
  console.error('Usage: unipet hook deepseek-tui <event>');
  return 1;
}

function help() {
  console.log(`UniPet Node runtime

Commands:
  unipet start [--host 127.0.0.1] [--port 8768] [--ws-port 8769]
  unipet status
  unipet doctor
  unipet stop
  unipet clear
  unipet emit <idle|running|waiting|failed|review> <message> [--source id] [--label text] [--ttl-ms n]
  unipet market <list|search|info|install>
  unipet pet <list|current|use|remove>
  unipet setup <hermes|openclaw|deepseek-tui|all>
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
    if (command === 'emit') {
      process.exitCode = await cmdEmit(args);
      return;
    }
    if (command === 'clear') {
      process.exitCode = await cmdClear(args);
      return;
    }
    if (command === 'market') {
      process.exitCode = await cmdMarket(args);
      return;
    }
    if (command === 'pet') {
      process.exitCode = await cmdPet(args);
      return;
    }
    if (command === 'setup') {
      process.exitCode = await cmdSetup(args);
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

main();
