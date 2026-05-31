#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function collectTests(target, files = []) {
  const resolved = path.resolve(process.cwd(), target);
  if (!fs.existsSync(resolved)) {
    throw new Error(`test path not found: ${target}`);
  }

  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    if (resolved.endsWith('.test.js')) files.push(resolved);
    return files;
  }

  if (!stat.isDirectory()) return files;

  for (const entry of fs.readdirSync(resolved, { withFileTypes: true })) {
    collectTests(path.join(resolved, entry.name), files);
  }
  return files;
}

function main() {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error('Usage: node scripts/run-tests.js <test-dir-or-file> [...]');
    return 1;
  }

  let files = [];
  try {
    for (const target of targets) files = collectTests(target, files);
  } catch (err) {
    console.error(err.message);
    return 1;
  }

  files = [...new Set(files)].sort((a, b) => a.localeCompare(b));
  if (!files.length) {
    console.error(`No *.test.js files found in: ${targets.join(', ')}`);
    return 1;
  }

  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return typeof result.status === 'number' ? result.status : 1;
}

process.exitCode = main();
