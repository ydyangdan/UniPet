#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HOOK_TIMEOUT_SECONDS = 20;
const HOOK_EVENTS = [
  { table: 'SessionStart', event: 'session_start', matcher: '*' },
  { table: 'UserPromptSubmit', event: 'user_prompt_submit' },
  { table: 'PreToolUse', event: 'pre_tool_use', matcher: '*' },
  { table: 'PostToolUse', event: 'post_tool_use', matcher: '*' },
  { table: 'Notification', event: 'notification' },
  { table: 'Stop', event: 'stop' },
  { table: 'SubagentStop', event: 'subagent_stop' },
  { table: 'SessionEnd', event: 'session_end' },
];

function usage() {
  return 'Usage: node connectors/claude-code/install.js [--settings path] [--unipet-command unipet] [--no-start]';
}

function parseArgs(argv) {
  const options = {
    settingsPath: '',
    unipetCommand: process.env.UNIPET_COMMAND || 'unipet',
    start: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-start') {
      options.start = false;
    } else if (arg === '--settings') {
      options.settingsPath = argv[i + 1] || '';
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

function defaultSettingsPath(env = process.env) {
  if (env.CLAUDE_CONFIG_DIR) return path.join(path.resolve(env.CLAUDE_CONFIG_DIR), 'settings.json');
  return path.join(os.homedir(), '.claude', 'settings.json');
}

function commandPart(value) {
  const text = String(value || 'unipet').trim();
  if (!/[\s"]/u.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function hookCommand(unipetCommand, eventName) {
  return `${commandPart(unipetCommand)} hook claude-code ${eventName}`;
}

function isManagedHook(hook) {
  return hook && typeof hook.command === 'string' && /\bhook\s+claude-code\b/.test(hook.command);
}

function stripManagedHooks(settings) {
  const next = { ...(settings || {}) };
  const hooks = { ...(next.hooks || {}) };
  for (const key of Object.keys(hooks)) {
    const groups = Array.isArray(hooks[key]) ? hooks[key] : [];
    const keptGroups = [];
    for (const group of groups) {
      const handlers = Array.isArray(group.hooks) ? group.hooks.filter((hook) => !isManagedHook(hook)) : [];
      if (handlers.length > 0) keptGroups.push({ ...group, hooks: handlers });
    }
    if (keptGroups.length > 0) hooks[key] = keptGroups;
    else delete hooks[key];
  }
  if (Object.keys(hooks).length > 0) next.hooks = hooks;
  else delete next.hooks;
  return next;
}

function hookHandler(options, eventName) {
  const handler = {
    type: 'command',
    command: hookCommand(options.unipetCommand, eventName),
    timeout: HOOK_TIMEOUT_SECONDS,
  };
  if (process.platform === 'win32') handler.shell = 'powershell';
  return handler;
}

function installHooks(settings, options) {
  const next = stripManagedHooks(settings);
  next.hooks = { ...(next.hooks || {}) };

  for (const entry of HOOK_EVENTS) {
    const group = {
      hooks: [hookHandler(options, entry.event)],
    };
    if (entry.matcher) group.matcher = entry.matcher;
    next.hooks[entry.table] = [...(next.hooks[entry.table] || []), group];
  }
  return next;
}

function parseSettings(text) {
  if (!String(text || '').trim()) return {};
  return JSON.parse(text);
}

function updateSettings(original, options) {
  const settings = parseSettings(original || '');
  return `${JSON.stringify(installHooks(settings, options), null, 2)}\n`;
}

function hasManagedHooksText(text) {
  return /\bhook\s+claude-code\b/.test(String(text || ''));
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
  const settingsPath = path.resolve(options.settingsPath || defaultSettingsPath());
  const before = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf8') : '';
  const after = updateSettings(before, options);

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, after);

  console.log(`Installed UniPet Claude Code hooks in ${settingsPath}`);
  console.log(`Hook command: ${hookCommand(options.unipetCommand, '<event>')}`);

  if (options.start) {
    console.log('Starting UniPet');
    if (!startUnipet(options.unipetCommand)) {
      console.warn("Warning: could not start UniPet. Run 'unipet start' manually.");
    }
  }

  console.log('Restart Claude Code, then review/trust the hooks from /hooks if prompted.');
  return settingsPath;
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
  defaultSettingsPath,
  hasManagedHooksText,
  install,
  stripManagedHooks,
  updateSettings,
};
