#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'overlay', 'cli.js');
const host = '127.0.0.1';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = address && address.port;
      server.close(() => resolve(port));
    });
  });
}

function requestJson(method, port, pathname, payload = null) {
  return new Promise((resolve, reject) => {
    const body = payload ? Buffer.from(JSON.stringify(payload), 'utf8') : null;
    const req = http.request({
      host,
      port,
      path: pathname,
      method,
      timeout: 5000,
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
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function runCli(args, env) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    windowsHide: true,
  });
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'unipet-overlay-smoke-'));
  const port = await freePort();
  const wsPort = await freePort();
  const env = {
    ...process.env,
    UNIPET_HOME: home,
  };

  try {
    console.log(`Starting UniPet overlay smoke on ${host}:${port}`);
    const started = runCli(['start', '--host', host, '--port', String(port), '--ws-port', String(wsPort)], env);
    if (started.status !== 0) {
      throw new Error(`unipet start failed\n${started.stdout || ''}${started.stderr || ''}`);
    }

    const health = await requestJson('GET', port, '/health');
    assertOk(health && health.runtime === 'node-electron', 'overlay health check did not report node-electron');

    const states = [
      ['idle', 'UniPet smoke ready'],
      ['running', 'Running smoke command'],
      ['waiting', 'Waiting for smoke approval'],
      ['failed', 'Smoke failure preview'],
      ['review', 'Smoke ready for review'],
    ];
    for (const [state, message] of states) {
      await requestJson('POST', port, '/api/pet/events', {
        source: 'overlay-smoke',
        state,
        message,
        action: 'update',
        ttl: 30000,
      });
      const view = await requestJson('GET', port, '/api/pet/view');
      assertOk(view.activeState === state, `expected activeState ${state}, got ${view.activeState}`);
      assertOk(view.currentPet && view.currentPet.spritesheetUrl, 'current pet config did not include a spritesheet');
      console.log(`  ${state.padEnd(7)} ok`);
    }

    console.log('Overlay smoke passed.');
    return 0;
  } finally {
    const stopped = runCli(['stop'], env);
    if (stopped.status !== 0) {
      process.stderr.write(stopped.stderr || stopped.stdout || 'unipet stop failed\n');
    }
    fs.rmSync(home, { recursive: true, force: true });
  }
}

main().then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error(error.message);
    process.exitCode = 1;
  },
);
