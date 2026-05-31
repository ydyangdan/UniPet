#!/usr/bin/env node

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const npmCommand = process.env.npm_execpath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const npmPrefixArgs = process.env.npm_execpath ? [process.env.npm_execpath] : [];

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd || root,
    encoding: options.encoding || 'utf8',
    stdio: options.stdio || 'pipe',
  });
}

function runNpm(args, options = {}) {
  return run(npmCommand, [...npmPrefixArgs, ...args], options);
}

function installedCliPath(prefix) {
  const candidates = [
    path.join(prefix, 'node_modules', 'uni-pet', 'overlay', 'cli.js'),
    path.join(prefix, 'lib', 'node_modules', 'uni-pet', 'overlay', 'cli.js'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'unipet-smoke-'));
let tarball = '';

try {
  const packed = runNpm(['pack', '--silent']).trim().split(/\r?\n/).filter(Boolean).pop();
  if (!packed) throw new Error('npm pack did not return a tarball name');
  tarball = path.join(root, packed);

  const prefix = path.join(temp, 'prefix');
  runNpm([
    'install',
    '--global',
    tarball,
    '--prefix',
    prefix,
    '--ignore-scripts',
    '--no-audit',
    '--fund=false',
  ], { stdio: 'inherit' });

  const cliPath = installedCliPath(prefix);
  const help = run(process.execPath, [cliPath, '--help']);
  if (!help.includes('unipet start') || !help.includes('unipet agent')) {
    throw new Error('installed UniPet CLI did not print the expected help output');
  }

  console.log('Smoke install passed.');
} finally {
  if (tarball) fs.rmSync(tarball, { force: true });
  fs.rmSync(temp, { recursive: true, force: true });
}
