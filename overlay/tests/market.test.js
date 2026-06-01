const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { extractMarketPetId } = require('../market');

function spritesheetBuffer(width = 1536, height = 1872) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  buffer[24] = 8;
  buffer[25] = 6;
  return buffer;
}

function withTempHome(fn) {
  const previous = process.env.UNIPET_HOME;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'unipet-market-test-'));
  process.env.UNIPET_HOME = temp;
  return Promise.resolve()
    .then(() => fn(temp))
    .finally(() => {
      if (previous === undefined) delete process.env.UNIPET_HOME;
      else process.env.UNIPET_HOME = previous;
      fs.rmSync(temp, { recursive: true, force: true });
    });
}

function withMarketServer(handler, fn) {
  const server = http.createServer(handler);
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve(`http://127.0.0.1:${port}`);
    });
  })
    .then((baseUrl) => Promise.resolve(fn(baseUrl)))
    .finally(() => new Promise((resolve) => server.close(resolve)));
}

function sendJson(res, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
}

function sendSpritesheet(res) {
  const body = spritesheetBuffer();
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': body.length,
  });
  res.end(body);
}

function loadMarket(baseUrl) {
  const previous = process.env.UNIPET_MARKET_API_BASE;
  process.env.UNIPET_MARKET_API_BASE = baseUrl;
  delete require.cache[require.resolve('../market')];
  const market = require('../market');
  return {
    market,
    restore() {
      if (previous === undefined) delete process.env.UNIPET_MARKET_API_BASE;
      else process.env.UNIPET_MARKET_API_BASE = previous;
      delete require.cache[require.resolve('../market')];
    },
  };
}

test('extracts Codex Pet Share ids from ids and URLs', () => {
  assert.equal(extractMarketPetId('taiei-cat'), 'taiei-cat');
  assert.equal(extractMarketPetId('https://codex-pet-share.pages.dev/pets/taiei-cat'), 'taiei-cat');
  assert.equal(extractMarketPetId('https://codex-pet-share.pages.dev/#/pets/taiei-cat'), 'taiei-cat');
  assert.equal(extractMarketPetId('https://example.com/no-pet-here'), '');
  assert.equal(extractMarketPetId('not a valid id'), '');
});

test('install preserves an embedded market manifest', async () => withTempHome(() => withMarketServer((req, res) => {
  const baseUrl = `http://${req.headers.host}`;
  if (req.url === '/api/pets/embedded-cat') {
    sendJson(res, {
      pet: {
        id: 'embedded-cat',
        displayName: 'Embedded Cat',
        description: 'Market pet with embedded manifest',
        spritesheetUrl: `${baseUrl}/assets/embedded-cat/spritesheet.webp`,
        manifest: {
          id: 'embedded-cat',
          displayName: 'Embedded Cat',
          kind: 'cat',
          spritesheetPath: 'spritesheet.webp',
          animations: {
            wave: {
              frames: [{ spriteIndex: 24, durationMs: 321 }, 25],
              loop: false,
              fallback: 'idle',
            },
          },
        },
      },
    });
    return;
  }
  if (req.url === '/assets/embedded-cat/spritesheet.webp') {
    sendSpritesheet(res);
    return;
  }
  res.writeHead(404).end();
}, async (baseUrl) => {
  const loaded = loadMarket(baseUrl);
  try {
    const result = await loaded.market.installMarketPet('embedded-cat');
    assert.equal(result.installed.id, 'embedded-cat');
    assert.equal(result.installed.manifest.kind, 'cat');
    assert.equal(result.installed.manifest.animations.wave.frames[0].durationMs, 321);
  } finally {
    loaded.restore();
  }
})));

test('install fetches the pet.json beside a market spritesheet when present', async () => withTempHome(() => withMarketServer((req, res) => {
  const baseUrl = `http://${req.headers.host}`;
  if (req.url === '/api/pets/adjacent-cat') {
    sendJson(res, {
      pet: {
        id: 'adjacent-cat',
        displayName: 'Adjacent Cat',
        description: 'Market pet with adjacent pet.json',
        spritesheetUrl: `${baseUrl}/assets/adjacent-cat/spritesheet.webp`,
      },
    });
    return;
  }
  if (req.url === '/assets/adjacent-cat/spritesheet.webp') {
    sendSpritesheet(res);
    return;
  }
  if (req.url === '/assets/adjacent-cat/pet.json') {
    sendJson(res, {
      id: 'adjacent-cat',
      displayName: 'Adjacent Cat',
      kind: 'cat',
      spritesheetPath: 'spritesheet.webp',
      animations: {
        jumping: {
          frames: [{ spriteIndex: 32, durationMs: 444 }, 33, 34],
          loop: false,
          fallback: 'idle',
        },
      },
    });
    return;
  }
  res.writeHead(404).end();
}, async (baseUrl) => {
  const loaded = loadMarket(baseUrl);
  try {
    const result = await loaded.market.installMarketPet('adjacent-cat');
    assert.equal(result.installed.id, 'adjacent-cat');
    assert.equal(result.installed.manifest.kind, 'cat');
    assert.equal(result.installed.manifest.animations.jumping.frames[0].durationMs, 444);
  } finally {
    loaded.restore();
  }
})));

test('install falls back when the market has no manifest', async () => withTempHome(() => withMarketServer((req, res) => {
  const baseUrl = `http://${req.headers.host}`;
  if (req.url === '/api/pets/minimal-cat') {
    sendJson(res, {
      pet: {
        id: 'minimal-cat',
        displayName: 'Minimal Cat',
        spritesheetUrl: `${baseUrl}/assets/minimal-cat/spritesheet.webp`,
      },
    });
    return;
  }
  if (req.url === '/assets/minimal-cat/spritesheet.webp') {
    sendSpritesheet(res);
    return;
  }
  res.writeHead(404).end();
}, async (baseUrl) => {
  const loaded = loadMarket(baseUrl);
  try {
    const result = await loaded.market.installMarketPet('minimal-cat');
    assert.equal(result.installed.id, 'minimal-cat');
    assert.equal(result.installed.displayName, 'Minimal Cat');
    assert.equal(result.installed.manifest.frame.width, 192);
  } finally {
    loaded.restore();
  }
})));
