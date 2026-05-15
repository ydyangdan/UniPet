const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HERMES_ID = 'hermes';
const OPENCLAW_ID = 'openclaw';
const DEEPSEEK_TUI_ID = 'deepseek-tui';
const OPENCLAW_PLUGIN_ID = 'unipet-openclaw';

const CONNECTORS = [
  {
    id: HERMES_ID,
    label: 'Hermes',
    description: 'Hermes plugin and skill',
  },
  {
    id: OPENCLAW_ID,
    label: 'OpenClaw',
    description: 'OpenClaw native hook plugin',
  },
  {
    id: DEEPSEEK_TUI_ID,
    label: 'DeepSeek-TUI',
    description: 'DeepSeek-TUI managed hooks block',
  },
];

const COMMAND_TIMEOUT_MS = 5000;

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function firstCommandPath(command) {
  if (!command) return '';
  if (path.isAbsolute(command) || command.includes(path.sep) || command.includes('/')) {
    return fs.existsSync(command) ? command : '';
  }
  const result = process.platform === 'win32'
    ? spawnSync('where.exe', [command], { encoding: 'utf8', timeout: 2000, windowsHide: true })
    : spawnSync('sh', ['-lc', `command -v ${shQuote(command)}`], { encoding: 'utf8', timeout: 2000 });
  if (result.error || result.status !== 0) return '';
  return String(result.stdout || '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
}

function commandAvailable(command) {
  return Boolean(firstCommandPath(command));
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.inherit ? 'inherit' : 'pipe',
    encoding: options.inherit ? undefined : 'utf8',
    shell: process.platform === 'win32',
    windowsHide: true,
    timeout: options.timeoutMs || COMMAND_TIMEOUT_MS,
  });
  const status = typeof result.status === 'number' ? result.status : 1;
  return {
    status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error || null,
    timedOut: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
  };
}

function parseHermesHomeScript(scriptPath, seen = new Set()) {
  if (!scriptPath || seen.has(scriptPath) || !fs.existsSync(scriptPath)) return '';
  seen.add(scriptPath);
  let text = '';
  try {
    text = fs.readFileSync(scriptPath, 'utf8');
  } catch (_) {
    return '';
  }

  const directPatterns = [
    /\$env:HERMES_HOME\s*=\s*["']([^"']+)["']/i,
    /^\s*set\s+HERMES_HOME=([^\r\n]+)$/im,
    /\bHERMES_HOME\s*=\s*["']?([^"'\s]+)["']?/,
  ];
  for (const pattern of directPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1].trim().replace(/^"|"$/g, '');
  }

  const psFileMatch = text.match(/-File\s+["']([^"']+\.ps1)["']/i);
  if (psFileMatch) {
    return parseHermesHomeScript(psFileMatch[1], seen);
  }
  return '';
}

function resolveHermesHome(options = {}, env = process.env) {
  if (options.hermesHome) return path.resolve(String(options.hermesHome));
  if (env.HERMES_HOME) return path.resolve(env.HERMES_HOME);
  const commandPath = firstCommandPath(options.hermesCommand || 'hermes');
  const fromCommand = parseHermesHomeScript(commandPath);
  return path.resolve(fromCommand || path.join(os.homedir(), '.hermes'));
}

function hermesPaths(options = {}) {
  const home = resolveHermesHome(options);
  return {
    home,
    skill: path.join(home, 'skills', 'unipet'),
    plugin: path.join(home, 'plugins', 'unipet'),
  };
}

function safeRemoveManagedChild(childPath, parentName, childName) {
  const resolved = path.resolve(childPath);
  if (path.basename(resolved) !== childName || path.basename(path.dirname(resolved)) !== parentName) {
    throw new Error(`Refusing to remove unmanaged path: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

function connectorIds(target = 'all') {
  if (!target || target === 'all') return CONNECTORS.map((connector) => connector.id);
  if (CONNECTORS.some((connector) => connector.id === target)) return [target];
  throw new Error(`Unknown connector: ${target}`);
}

function connectorList() {
  return CONNECTORS.slice();
}

function lineWith(value, okText = 'yes', noText = 'no') {
  return value ? okText : noText;
}

function statusFromOutput(output, id) {
  if (!output) return 'unknown';
  const line = output.split(/\r?\n/).find((item) => item.toLowerCase().includes(id.toLowerCase()));
  if (!line) return 'no';
  if (/\b(disabled|false|off|inactive)\b/i.test(line)) return 'disabled';
  if (/\b(enabled|true|on|active)\b/i.test(line)) return 'enabled';
  return 'listed';
}

function hermesStatus(options = {}) {
  const paths = hermesPaths(options);
  const command = options.hermesCommand || 'hermes';
  const commandFound = commandAvailable(command);
  let pluginState = 'unknown';
  if (commandFound) {
    const result = runCommand(command, ['plugins', 'list'], {
      env: { HERMES_HOME: paths.home },
      timeoutMs: 3000,
    });
    pluginState = result.timedOut ? 'timeout' : statusFromOutput(`${result.stdout}\n${result.stderr}`, 'unipet');
  }
  return {
    id: HERMES_ID,
    label: 'Hermes',
    installed: fs.existsSync(paths.skill) && fs.existsSync(paths.plugin),
    enabled: pluginState,
    details: [
      `home: ${paths.home}`,
      `skill: ${lineWith(fs.existsSync(paths.skill))} (${paths.skill})`,
      `plugin: ${lineWith(fs.existsSync(paths.plugin))} (${paths.plugin})`,
      `hermes command: ${commandFound ? 'found' : 'missing'}`,
      `plugin state: ${pluginState}`,
    ],
  };
}

function openClawStatus(options = {}) {
  const command = options.openclawCommand || process.env.OPENCLAW_COMMAND || 'openclaw';
  const commandFound = commandAvailable(command);
  return {
    id: OPENCLAW_ID,
    label: 'OpenClaw',
    installed: null,
    enabled: 'unknown',
    details: [
      `openclaw command: ${commandFound ? 'found' : 'missing'}`,
      `plugin id: ${OPENCLAW_PLUGIN_ID}`,
      'plugin state: unknown (use setup/disable/remove to manage it through OpenClaw)',
    ],
  };
}

function deepSeekInstallModule() {
  return require('../connectors/deepseek-tui/install');
}

function deepSeekConfigPath(options = {}) {
  const installer = deepSeekInstallModule();
  return path.resolve(options.config || installer.defaultConfigPath());
}

function hasDeepSeekManagedBlock(text) {
  return /# >>> unipet deepseek-tui hooks[\s\S]*?# <<< unipet deepseek-tui hooks/m.test(text)
    || /# >>> unipet deepseek hooks[\s\S]*?# <<< unipet deepseek hooks/m.test(text);
}

function deepSeekTuiStatus(options = {}) {
  const configPath = deepSeekConfigPath(options);
  const exists = fs.existsSync(configPath);
  const text = exists ? fs.readFileSync(configPath, 'utf8') : '';
  const installed = exists && hasDeepSeekManagedBlock(text);
  return {
    id: DEEPSEEK_TUI_ID,
    label: 'DeepSeek-TUI',
    installed,
    enabled: installed ? 'enabled' : 'no',
    details: [
      `config: ${configPath}`,
      `config file: ${exists ? 'found' : 'missing'}`,
      `managed hooks: ${installed ? 'found' : 'missing'}`,
    ],
  };
}

function connectorStatus(id, options = {}) {
  if (id === HERMES_ID) return hermesStatus(options);
  if (id === OPENCLAW_ID) return openClawStatus(options);
  if (id === DEEPSEEK_TUI_ID) return deepSeekTuiStatus(options);
  throw new Error(`Unknown connector: ${id}`);
}

function formatStatus(status) {
  const installed = status.installed === null ? 'unknown' : (status.installed ? 'installed' : 'not installed');
  return [
    `${status.label}: ${installed}`,
    ...status.details.map((detail) => `  ${detail}`),
  ];
}

function printStatus(target, options = {}, write = console.log) {
  for (const id of connectorIds(target)) {
    for (const line of formatStatus(connectorStatus(id, options))) write(line);
  }
  return 0;
}

function disableHermes(options = {}, io = console) {
  const paths = hermesPaths(options);
  const command = options.hermesCommand || 'hermes';
  if (!commandAvailable(command)) {
    io.error("Hermes command not found. Install Hermes or run 'hermes plugins disable unipet' manually later.");
    return 1;
  }
  const result = runCommand(command, ['plugins', 'disable', 'unipet'], {
    env: { HERMES_HOME: paths.home },
    inherit: true,
  });
  if (result.status === 0) io.log('Disabled Hermes connector: unipet');
  return result.status;
}

function removeHermes(options = {}, io = console) {
  const paths = hermesPaths(options);
  const command = options.hermesCommand || 'hermes';
  if (commandAvailable(command)) {
    runCommand(command, ['plugins', 'disable', 'unipet'], {
      env: { HERMES_HOME: paths.home },
      inherit: true,
    });
  } else {
    io.error("Hermes command not found. Removing files only; run 'hermes plugins disable unipet' if needed later.");
  }
  safeRemoveManagedChild(paths.skill, 'skills', 'unipet');
  safeRemoveManagedChild(paths.plugin, 'plugins', 'unipet');
  io.log('Removed Hermes connector files:');
  io.log(`  ${paths.skill}`);
  io.log(`  ${paths.plugin}`);
  return 0;
}

function disableOpenClaw(options = {}, io = console) {
  const command = options.openclawCommand || process.env.OPENCLAW_COMMAND || 'openclaw';
  if (!commandAvailable(command)) {
    io.error("OpenClaw command not found. Install OpenClaw or pass '--openclaw-command <command>'.");
    return 1;
  }
  const result = runCommand(command, ['plugins', 'disable', OPENCLAW_PLUGIN_ID], { inherit: true });
  if (result.status === 0) io.log(`Disabled OpenClaw connector: ${OPENCLAW_PLUGIN_ID}`);
  return result.status;
}

function removeOpenClaw(options = {}, io = console) {
  const command = options.openclawCommand || process.env.OPENCLAW_COMMAND || 'openclaw';
  if (!commandAvailable(command)) {
    io.error("OpenClaw command not found. Install OpenClaw or pass '--openclaw-command <command>'.");
    return 1;
  }
  runCommand(command, ['plugins', 'disable', OPENCLAW_PLUGIN_ID], { inherit: true });
  const attempts = [
    ['plugins', 'uninstall', OPENCLAW_PLUGIN_ID],
    ['plugins', 'remove', OPENCLAW_PLUGIN_ID],
  ];
  for (const args of attempts) {
    const result = runCommand(command, args, { timeoutMs: COMMAND_TIMEOUT_MS });
    if (result.status === 0) {
      io.log(`Removed OpenClaw connector: ${OPENCLAW_PLUGIN_ID}`);
      return 0;
    }
  }
  io.error(`Could not remove OpenClaw plugin automatically. It may already be removed, or this OpenClaw version may not expose a remove command.`);
  io.error(`Try manually: ${command} plugins uninstall ${OPENCLAW_PLUGIN_ID}`);
  return 1;
}

function stripDeepSeekManagedHooks(options = {}, io = console, verb = 'Removed') {
  const installer = deepSeekInstallModule();
  const configPath = deepSeekConfigPath(options);
  if (!fs.existsSync(configPath)) {
    io.log(`DeepSeek-TUI config not found: ${configPath}`);
    return 0;
  }
  const before = fs.readFileSync(configPath, 'utf8');
  const after = installer.stripManagedBlock(before);
  if (after === before) {
    io.log(`No UniPet DeepSeek-TUI hooks found in ${configPath}`);
    return 0;
  }
  fs.writeFileSync(configPath, `${after.trimEnd()}${after.trim() ? '\n' : ''}`);
  io.log(`${verb} UniPet DeepSeek-TUI hooks from ${configPath}`);
  return 0;
}

function disableConnector(target, options = {}, io = console) {
  let exitCode = 0;
  for (const id of connectorIds(target)) {
    let code = 0;
    if (id === HERMES_ID) code = disableHermes(options, io);
    if (id === OPENCLAW_ID) code = disableOpenClaw(options, io);
    if (id === DEEPSEEK_TUI_ID) code = stripDeepSeekManagedHooks(options, io, 'Disabled');
    if (code !== 0) exitCode = code;
  }
  return exitCode;
}

function removeConnector(target, options = {}, io = console) {
  let exitCode = 0;
  for (const id of connectorIds(target)) {
    let code = 0;
    if (id === HERMES_ID) code = removeHermes(options, io);
    if (id === OPENCLAW_ID) code = removeOpenClaw(options, io);
    if (id === DEEPSEEK_TUI_ID) code = stripDeepSeekManagedHooks(options, io, 'Removed');
    if (code !== 0) exitCode = code;
  }
  return exitCode;
}

module.exports = {
  CONNECTORS,
  connectorIds,
  connectorList,
  connectorStatus,
  disableConnector,
  formatStatus,
  hasDeepSeekManagedBlock,
  hermesPaths,
  printStatus,
  removeConnector,
  resolveHermesHome,
  safeRemoveManagedChild,
};
