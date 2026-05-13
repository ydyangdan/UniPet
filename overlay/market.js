const http = require('http');
const https = require('https');
const { URL } = require('url');
const { cleanPetId, installPetAsset } = require('./pets');

const MARKET_WEB_URL = 'https://codex-pets.net';
const MARKET_API_BASE = process.env.UNIPET_MARKET_API_BASE ||
  MARKET_WEB_URL;
const USER_AGENT = 'UniPet Market/0.1';
const MAX_DOWNLOAD_BYTES = 16 * 1024 * 1024;

function absoluteMarketUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/api/')) return apiPath(raw);
  return new URL(raw, MARKET_WEB_URL).href;
}

function apiPath(route) {
  return `${MARKET_API_BASE.replace(/\/+$/, '')}/${String(route || '').replace(/^\/+/, '')}`;
}

function marketApiUrl(route, params = {}) {
  const url = new URL(apiPath(route));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.href;
}

function extractMarketPetId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const candidates = [parsed.hash.replace(/^#/, ''), parsed.pathname];
    for (const candidate of candidates) {
      const id = petIdFromPath(candidate);
      if (id) return id;
    }
    return '';
  } catch (_) {
    const id = petIdFromPath(raw);
    if (id) return id;
    if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(raw)) return raw.toLowerCase();
    return '';
  }
}

function petIdFromPath(value) {
  let path = String(value || '').trim().replace(/^#/, '').replace(/^\/+/, '');
  try {
    path = decodeURIComponent(path);
  } catch (_) {
    return '';
  }
  const patterns = [
    /^pets\/([^/?#]+)/,
    /^share\/([^/?#]+)/,
    /(?:^|\/)api\/pets\/([^/?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (match) return match[1].toLowerCase();
  }
  return '';
}

function normalizeMarketPet(payload) {
  const pet = payload && payload.pet && typeof payload.pet === 'object' ? payload.pet : payload;
  const id = String(pet && pet.id || '').trim();
  return {
    id,
    displayName: String(pet && (pet.displayName || pet.name) || id),
    description: String(pet && pet.description || ''),
    ownerName: String(pet && pet.ownerName || ''),
    tags: Array.isArray(pet && pet.tags) ? pet.tags.map((tag) => String(tag)) : [],
    likeCount: Number(pet && pet.likeCount || 0),
    viewCount: Number(pet && pet.viewCount || 0),
    spritesheetUrl: absoluteMarketUrl(String(pet && pet.spritesheetUrl || '')),
    downloadUrl: absoluteMarketUrl(String(pet && pet.downloadUrl || '')),
  };
}

function requestBuffer(url, { maxBytes = MAX_DOWNLOAD_BYTES, redirects = 3 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.request(parsed, {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 30000,
    }, (res) => {
      const status = res.statusCode || 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location && redirects > 0) {
        res.resume();
        requestBuffer(new URL(location, parsed).href, { maxBytes, redirects: redirects - 1 })
          .then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error(`HTTP ${status} from ${parsed.hostname}`));
        return;
      }
      const length = Number.parseInt(res.headers['content-length'] || '0', 10);
      if (length > maxBytes) {
        res.resume();
        reject(new Error(`download too large: ${length} bytes`));
        return;
      }
      const chunks = [];
      let total = 0;
      res.on('data', (chunk) => {
        total += chunk.length;
        if (total > maxBytes) {
          req.destroy(new Error('download exceeded size limit'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    req.on('error', reject);
    req.end();
  });
}

async function requestJson(url) {
  const body = await requestBuffer(url, { maxBytes: 2 * 1024 * 1024 });
  return JSON.parse(body.toString('utf8'));
}

async function listMarketPets({ query = '', page = 1, limit = 12, sort = 'new', content = 'safe' } = {}) {
  const safeSort = ['new', 'popular', 'views'].includes(sort) ? sort : 'new';
  const safeLimit = Math.max(1, Math.min(Number.parseInt(limit, 10) || 12, 50));
  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const params = {
    page: safePage,
    pageSize: safeLimit,
  };
  if (String(query || '').trim()) params.q = String(query).trim();
  if (safeSort !== 'new') params.sort = safeSort;
  if (content === 'all') params.content = 'all';

  const payload = await requestJson(marketApiUrl('/api/pets', params));
  return {
    pets: Array.isArray(payload.pets) ? payload.pets.map(normalizeMarketPet) : [],
    page: Number(payload.page || safePage),
    pageSize: Number(payload.pageSize || safeLimit),
    total: Number(payload.total || 0),
    totalPages: Number(payload.totalPages || 1),
  };
}

async function fetchMarketPet(identifier) {
  const id = extractMarketPetId(identifier);
  if (!id) throw new Error(`Could not parse market pet id: ${identifier}`);
  const payload = await requestJson(marketApiUrl(`/api/pets/${encodeURIComponent(id)}`));
  const pet = normalizeMarketPet(payload);
  if (!pet.id) throw new Error(`Market pet not found: ${identifier}`);
  return pet;
}

async function installMarketPet(identifier, { localId = '' } = {}) {
  const pet = await fetchMarketPet(identifier);
  if (!pet.spritesheetUrl) throw new Error(`Market pet has no spritesheet: ${pet.id}`);
  const targetId = cleanPetId(localId || pet.id);
  const spritesheet = await requestBuffer(pet.spritesheetUrl);
  const installed = installPetAsset({
    id: targetId,
    displayName: pet.displayName,
    description: pet.description,
    source: 'codex-pet-share',
    spritesheetBuffer: spritesheet,
    sourceMeta: {
      source: MARKET_WEB_URL,
      apiBase: MARKET_API_BASE,
      installedFrom: identifier,
      pet,
    },
  });
  return { pet, installed };
}

function formatMarketPage(page) {
  if (!page.pets.length) return 'No market pets found.';
  const lines = [`Codex Pet Share page ${page.page}/${page.totalPages} (${page.total} total):`];
  for (const pet of page.pets) {
    const owner = pet.ownerName ? ` by ${pet.ownerName}` : '';
    const tags = pet.tags.length ? ` tags=${pet.tags.join(',')}` : '';
    lines.push(`- ${pet.id}: ${pet.displayName}${owner} likes=${pet.likeCount} views=${pet.viewCount}${tags}`);
  }
  return lines.join('\n');
}

function formatMarketPet(pet) {
  const lines = [
    `${pet.displayName} (${pet.id})`,
    `Owner: ${pet.ownerName || '?'}`,
    `Likes: ${pet.likeCount}  Views: ${pet.viewCount}`,
  ];
  if (pet.tags.length) lines.push(`Tags: ${pet.tags.join(', ')}`);
  if (pet.description) lines.push(pet.description);
  if (pet.spritesheetUrl) lines.push(`Spritesheet: ${pet.spritesheetUrl}`);
  if (pet.downloadUrl) lines.push(`Package: ${pet.downloadUrl}`);
  return lines.join('\n');
}

module.exports = {
  MARKET_API_BASE,
  MARKET_WEB_URL,
  extractMarketPetId,
  fetchMarketPet,
  formatMarketPage,
  formatMarketPet,
  installMarketPet,
  listMarketPets,
};
