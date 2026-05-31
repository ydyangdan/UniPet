const http = require('node:http');

function postEvent(event) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(event), 'utf8');
    const req = http.request({
      host: '127.0.0.1',
      port: 8768,
      path: '/api/pet/events',
      method: 'POST',
      timeout: 3000,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      },
    }, (res) => {
      res.resume();
      res.on('error', reject);
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('request timeout'));
    });
    req.end(body);
  });
}

async function main() {
  await postEvent({
    source: 'node-demo',
    state: 'running',
    message: 'Running tests',
    action: 'update',
    ttl: '30s',
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
