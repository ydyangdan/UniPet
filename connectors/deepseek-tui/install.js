#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const START_MARKER = '# >>> unipet deepseek-tui hooks';
const END_MARKER = '# <<< unipet deepseek-tui hooks';
const LEGACY_START_MARKER = '# >>> unipet deepseek hooks';
const LEGACY_END_MARKER = '# <<< unipet deepseek hooks';
const HOOK_EVENTS = [
  ['unipet-deepseek-tui-session-start', 'session_start', false],
  ['unipet-deepseek-tui-message-submit', 'message_submit', true],
  ['unipet-deepseek-tui-tool-before', 'tool_call_before', true],
  ['unipet-deepseek-tui-tool-after', 'tool_call_after', true],
  ['unipet-deepseek-tui-error', 'on_error', true],
  ['unipet-deepseek-tui-session-end', 'session_end', false],
];

function usage() {
  return `Usage: node connectors/deepseek-tui/install.js [--config path] [--unipet-command unipet] [--no-start]`;
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
  if (env.DEEPSEEK_CONFIG_PATH) return path.resolve(env.DEEPSEEK_CONFIG_PATH);
  return path.join(os.homedir(), '.deepseek', 'config.toml');
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
  return `${commandPart(unipetCommand)} hook deepseek-tui ${eventName}`;
}

function stripManagedBlock(text) {
  let result = text;
  for (const [start, end] of [[START_MARKER, END_MARKER], [LEGACY_START_MARKER, LEGACY_END_MARKER]]) {
    const pattern = new RegExp(`\\n?${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'm');
    result = result.replace(pattern, '\n');
  }
  return result.replace(/\n{3,}/g, '\n\n').trimEnd();
}

function hasHooksNamespace(text) {
  return /^\s*(\[hooks\]|\[\[hooks\.hooks\]\])\s*(#.*)?$/m.test(text);
}

function enableExistingHooksTable(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*\[hooks\]\s*(#.*)?$/.test(line));
  if (start < 0) return text;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }

  for (let i = start + 1; i < end; i += 1) {
    if (/^\s*enabled\s*=/.test(lines[i])) {
      lines[i] = 'enabled = true';
      return lines.join('\n');
    }
  }
  lines.splice(start + 1, 0, 'enabled = true');
  return lines.join('\n');
}

function buildManagedBlock(options, includeHooksTable) {
  const lines = [START_MARKER];
  if (includeHooksTable) {
    lines.push('[hooks]');
    lines.push('enabled = true');
    lines.push('');
  }

  for (const [name, eventName, background] of HOOK_EVENTS) {
    lines.push('[[hooks.hooks]]');
    lines.push(`name = ${tomlString(name)}`);
    lines.push(`event = ${tomlString(eventName)}`);
    lines.push(`command = ${tomlString(hookCommand(options.unipetCommand, eventName))}`);
    lines.push(`background = ${background ? 'true' : 'false'}`);
    lines.push('timeout_secs = 2');
    lines.push('');
  }
  lines.push(END_MARKER);
  return lines.join('\n');
}

function updateConfig(original, options) {
  let text = stripManagedBlock(original || '');
  const hooksExist = hasHooksNamespace(text);
  if (hooksExist) text = enableExistingHooksTable(text);
  const block = buildManagedBlock(options, !hasHooksNamespace(text));
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

  console.log(`Installed UniPet DeepSeek-TUI hooks in ${configPath}`);
  console.log(`Hook command: ${hookCommand(options.unipetCommand, '<event>')}`);

  if (options.start) {
    console.log('Starting UniPet');
    if (!startUnipet(options.unipetCommand)) {
      console.warn("Warning: could not start UniPet. Run 'unipet start' manually.");
    }
  }

  console.log('Restart DeepSeek-TUI so the new hooks are loaded.');
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
