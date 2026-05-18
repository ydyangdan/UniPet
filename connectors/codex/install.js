#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const START_MARKER = '# >>> unipet codex hooks';
const END_MARKER = '# <<< unipet codex hooks';
const HOOK_TIMEOUT_SECONDS = 20;
const HOOK_EVENTS = [
  { table: 'SessionStart', event: 'session_start', matcher: 'startup|resume|clear' },
  { table: 'UserPromptSubmit', event: 'user_prompt_submit' },
  { table: 'PreToolUse', event: 'pre_tool_use', matcher: '*' },
  { table: 'PermissionRequest', event: 'permission_request', matcher: '*' },
  { table: 'PostToolUse', event: 'post_tool_use', matcher: '*' },
  { table: 'Stop', event: 'stop' },
];

function usage() {
  return 'Usage: node connectors/codex/install.js [--config path] [--unipet-command unipet] [--no-start]';
}

function parseArgs(argv) {
  const options = {
    configPath: '',
    unipetCommand: process.env.UNIPET_COMMAND || 'unipet',
    start: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-start') {
      options.start = false;
    } else if (arg === '--config') {
      options.configPath = argv[i + 1] || '';
      i += 1;
    } else if (arg === '--unipet-command') {
      options.unipetCommand = argv[i + 1] || '';
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}\n${usage()}`);
    }
  }
  if (!options.unipetCommand) options.unipetCommand = 'unipet';
  return options;
}

function defaultConfigPath(env = process.env) {
  if (env.CODEX_HOME) return path.join(path.resolve(env.CODEX_HOME), 'config.toml');
  return path.join(os.homedir(), '.codex', 'config.toml');
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function commandPart(value) {
  const text = String(value || 'unipet').trim();
  if (!/[\s"]/u.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function hookCommand(unipetCommand, eventName) {
  return `${commandPart(unipetCommand)} hook codex ${eventName}`;
}

function stripManagedBlock(text) {
  const pattern = new RegExp(`\\n?${START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'm');
  return String(text || '').replace(pattern, '\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function buildManagedBlock(options) {
  const lines = [START_MARKER];
  for (const entry of HOOK_EVENTS) {
    lines.push(`[[hooks.${entry.table}]]`);
    if (entry.matcher) lines.push(`matcher = ${tomlString(entry.matcher)}`);
    lines.push(`[[hooks.${entry.table}.hooks]]`);
    lines.push('type = "command"');
    lines.push(`command = ${tomlString(hookCommand(options.unipetCommand, entry.event))}`);
    lines.push(`timeout = ${HOOK_TIMEOUT_SECONDS}`);
    lines.push(`statusMessage = ${tomlString('UniPet')}`);
    lines.push('');
  }
  lines.push(END_MARKER);
  return lines.join('\n');
}

function updateConfig(original, options) {
  const text = stripManagedBlock(original || '');
  const block = buildManagedBlock(options);
  return `${text.trimEnd()}${text.trim() ? '\n\n' : ''}${block}\n`;
}

function startUnipet(command) {
  const result = spawnSync(command || 'unipet', ['start'], {
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

function install(options) {
  const configPath = path.resolve(options.configPath || defaultConfigPath());
  const before = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const after = updateConfig(before, options);

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, after);

  console.log(`Installed UniPet Codex hooks in ${configPath}`);
  console.log(`Hook command: ${hookCommand(options.unipetCommand, '<event>')}`);

  if (options.start) {
    console.log('Starting UniPet');
    if (!startUnipet(options.unipetCommand)) {
      console.warn("Warning: could not start UniPet. Run 'unipet start' manually.");
    }
  }

  console.log('Restart Codex, then review/trust the hooks from /hooks if prompted.');
  return configPath;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  install(options);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildManagedBlock,
  defaultConfigPath,
  install,
  stripManagedBlock,
  updateConfig,
};
