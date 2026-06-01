const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const spritesheet = require('./renderers/spritesheet/adapter');

const BUILTIN_PET_ID = 'uni';
const DEFAULT_SPRITESHEET = 'spritesheet.webp';
const MAX_SPRITESHEET_BYTES = 16 * 1024 * 1024;
const EXPECTED_SPRITESHEET_WIDTH = spritesheet.SHEET_WIDTH;
const EXPECTED_SPRITESHEET_HEIGHT = spritesheet.SHEET_HEIGHT;

function unipetHome() {
  return process.env.UNIPET_HOME || path.join(os.homedir(), '.unipet');
}

function petsRoot() {
  return path.join(unipetHome(), 'pets');
}

function configPath() {
  return path.join(unipetHome(), 'config.json');
}

function builtinPetDir() {
  return path.join(__dirname, 'assets', 'default');
}

function cleanPetId(value) {
  const raw = String(value || '').trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9._-]/g, '-').replace(/^[._-]+|[._-]+$/g, '');
  return clean.slice(0, 96);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeJsonAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
}

function readConfig() {
  const data = readJson(configPath());
  return data && typeof data === 'object' ? data : {};
}

function writeConfig(config) {
  writeJsonAtomic(configPath(), config);
}

function readManifest(dir) {
  const manifest = readJson(path.join(dir, 'pet.json'));
  if (!manifest || typeof manifest !== 'object') return null;
  const spritesheetPath = String(manifest.spritesheetPath || DEFAULT_SPRITESHEET);
  const spritesheetAbs = path.resolve(dir, spritesheetPath);
  if (!fs.existsSync(spritesheetAbs)) return null;
  const id = cleanPetId(manifest.id || path.basename(dir));
  if (!id) return null;
  return {
    id,
    displayName: String(manifest.displayName || manifest.name || id),
    description: String(manifest.description || ''),
    source: String(manifest.source || 'local'),
    builtin: false,
    dir,
    manifestPath: path.join(dir, 'pet.json'),
    spritesheetPath,
    spritesheetAbs,
    installedAt: Number(manifest.installedAt || 0),
    manifest,
  };
}

function manifestFrame(manifest = {}) {
  const frame = manifest && typeof manifest.frame === 'object' && manifest.frame
    ? manifest.frame
    : {};
  return {
    width: Number(frame.width ?? manifest.frameWidth ?? 192),
    height: Number(frame.height ?? manifest.frameHeight ?? 208),
    columns: Number(frame.columns ?? manifest.columns ?? 8),
    rows: Number(frame.rows ?? manifest.rows ?? 9),
  };
}

function imageDimensionsFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;

  if (
    buffer[0] === 0x89 &&
    buffer.toString('ascii', 1, 4) === 'PNG' &&
    buffer.toString('ascii', 12, 16) === 'IHDR'
  ) {
    return {
      type: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (
    buffer.length >= 30 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    for (let offset = 12; offset + 8 <= buffer.length;) {
      const chunkType = buffer.toString('ascii', offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      const dataOffset = offset + 8;
      if (dataOffset + chunkSize > buffer.length) return null;

      if (chunkType === 'VP8X' && chunkSize >= 10) {
        return {
          type: 'webp',
          width: buffer.readUIntLE(dataOffset + 4, 3) + 1,
          height: buffer.readUIntLE(dataOffset + 7, 3) + 1,
        };
      }
      if (
        chunkType === 'VP8 ' &&
        chunkSize >= 10 &&
        buffer[dataOffset + 3] === 0x9d &&
        buffer[dataOffset + 4] === 0x01 &&
        buffer[dataOffset + 5] === 0x2a
      ) {
        return {
          type: 'webp',
          width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
          height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
        };
      }
      if (chunkType === 'VP8L' && chunkSize >= 5 && buffer[dataOffset] === 0x2f) {
        const b1 = buffer[dataOffset + 1];
        const b2 = buffer[dataOffset + 2];
        const b3 = buffer[dataOffset + 3];
        const b4 = buffer[dataOffset + 4];
        return {
          type: 'webp',
          width: 1 + b1 + ((b2 & 0x3f) << 8),
          height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
        };
      }

      offset = dataOffset + chunkSize + (chunkSize % 2);
    }
  }

  return null;
}

function readImageDimensions(filePath) {
  return imageDimensionsFromBuffer(fs.readFileSync(filePath));
}

function validateSpritesheetDimensions(dimensions) {
  if (!dimensions) {
    throw new Error('spritesheet dimensions could not be read');
  }
  if (dimensions.width !== EXPECTED_SPRITESHEET_WIDTH || dimensions.height !== EXPECTED_SPRITESHEET_HEIGHT) {
    throw new Error(
      `spritesheet must be ${EXPECTED_SPRITESHEET_WIDTH}x${EXPECTED_SPRITESHEET_HEIGHT} pixels`,
    );
  }
}

function isInside(parentDir, childPath) {
  const parent = path.resolve(parentDir);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

function validatePetDirectory(dir) {
  const petDir = path.resolve(String(dir || ''));
  const errors = [];
  const warnings = [];
  let manifest = null;
  let spritesheetAbs = '';
  let spritesheetPath = DEFAULT_SPRITESHEET;
  let id = cleanPetId(path.basename(petDir));

  if (!fs.existsSync(petDir) || !fs.statSync(petDir).isDirectory()) {
    errors.push(`pet directory not found: ${petDir}`);
  } else {
    const manifestPath = path.join(petDir, 'pet.json');
    manifest = readJson(manifestPath);
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      errors.push(`pet.json must be a JSON object: ${manifestPath}`);
    } else {
      id = cleanPetId(manifest.id || id);
      if (!id) errors.push('pet id is required');
      if (id === BUILTIN_PET_ID) errors.push(`pet id is reserved: ${BUILTIN_PET_ID}`);
      if (!manifest.displayName && !manifest.name) warnings.push('displayName is missing; id will be shown');

      spritesheetPath = String(manifest.spritesheetPath || DEFAULT_SPRITESHEET);
      spritesheetAbs = path.resolve(petDir, spritesheetPath);
      if (!isInside(petDir, spritesheetAbs)) {
        errors.push('spritesheetPath must stay inside the pet directory');
      } else if (!fs.existsSync(spritesheetAbs)) {
        errors.push(`spritesheet not found: ${spritesheetPath}`);
      } else {
        const stat = fs.statSync(spritesheetAbs);
        const ext = path.extname(spritesheetAbs).toLowerCase();
        if (!stat.isFile()) errors.push(`spritesheet is not a file: ${spritesheetPath}`);
        if (stat.size <= 0) errors.push('spritesheet is empty');
        if (stat.size > MAX_SPRITESHEET_BYTES) errors.push(`spritesheet is too large: ${stat.size} bytes`);
        if (!['.webp', '.png'].includes(ext)) warnings.push('spritesheet should be a .webp or .png image');
        try {
          validateSpritesheetDimensions(readImageDimensions(spritesheetAbs));
        } catch (error) {
          errors.push(error.message);
        }
      }

      try {
        spritesheet.normalizeManifest(manifest);
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    pet: {
      id,
      dir: petDir,
      displayName: String(manifest && (manifest.displayName || manifest.name) || id || ''),
      description: String(manifest && manifest.description || ''),
      source: String(manifest && manifest.source || 'local-import'),
      spritesheetPath,
      spritesheetAbs,
      manifest,
    },
  };
}

function builtinPet() {
  const dir = builtinPetDir();
  const manifest = readManifest(dir) || {
    id: BUILTIN_PET_ID,
    displayName: 'Uni',
    description: 'Built-in UniPet AI agent desktop companion.',
    source: 'builtin',
    dir,
    manifestPath: path.join(dir, 'pet.json'),
    spritesheetPath: DEFAULT_SPRITESHEET,
    spritesheetAbs: path.join(dir, DEFAULT_SPRITESHEET),
    installedAt: 0,
    manifest: {},
  };
  return {
    ...manifest,
    id: BUILTIN_PET_ID,
    source: 'builtin',
    builtin: true,
  };
}

function listInstalledPets() {
  const root = petsRoot();
  if (!fs.existsSync(root)) return [];
  const pets = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pet = readManifest(path.join(root, entry.name));
    if (pet && pet.id !== BUILTIN_PET_ID) pets.push(pet);
  }
  pets.sort((a, b) => a.id.localeCompare(b.id));
  return pets;
}

function listPets() {
  return [builtinPet(), ...listInstalledPets()];
}

function getPet(id) {
  const clean = cleanPetId(id);
  if (!clean || clean === BUILTIN_PET_ID) return builtinPet();
  return readManifest(path.join(petsRoot(), clean));
}

function currentPetId() {
  const config = readConfig();
  const clean = cleanPetId(config.currentPetId || BUILTIN_PET_ID);
  return getPet(clean) ? clean : BUILTIN_PET_ID;
}

function currentPet() {
  return getPet(currentPetId()) || builtinPet();
}

function setCurrentPet(id) {
  const clean = cleanPetId(id);
  const pet = getPet(clean);
  if (!pet) throw new Error(`Local pet not found: ${id}`);
  const config = readConfig();
  config.currentPetId = pet.id;
  config.updatedAt = Date.now();
  writeConfig(config);
  return pet;
}

function removePet(id) {
  const clean = cleanPetId(id);
  if (!clean) throw new Error('pet id required');
  if (clean === BUILTIN_PET_ID) throw new Error('built-in pet cannot be removed');
  const pet = getPet(clean);
  if (!pet) throw new Error(`Local pet not found: ${id}`);
  const wasCurrent = currentPetId() === clean;
  if (wasCurrent) setCurrentPet(BUILTIN_PET_ID);
  fs.rmSync(pet.dir, { recursive: true, force: true });
  return { removed: pet, current: currentPet(), wasCurrent };
}

function installPetAsset({ id, displayName, description, source, spritesheetBuffer, sourceMeta, manifest: sourceManifest }) {
  const clean = cleanPetId(id);
  if (!clean) throw new Error('pet id required');
  if (clean === BUILTIN_PET_ID) throw new Error(`pet id is reserved: ${BUILTIN_PET_ID}`);
  if (!Buffer.isBuffer(spritesheetBuffer) || spritesheetBuffer.length === 0) {
    throw new Error('spritesheet is empty');
  }
  validateSpritesheetDimensions(imageDimensionsFromBuffer(spritesheetBuffer));

  const root = petsRoot();
  const target = path.join(root, clean);
  const staging = path.join(root, `.staging-${clean}-${process.pid}-${Date.now()}`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  const originalManifest = sourceManifest && typeof sourceManifest === 'object' && !Array.isArray(sourceManifest)
    ? sourceManifest
    : {};
  spritesheet.normalizeManifest(originalManifest);
  const frame = manifestFrame(originalManifest);
  const manifest = {
    ...originalManifest,
    id: clean,
    displayName: String(displayName || clean),
    description: String(description || ''),
    source: String(source || 'local'),
    spritesheetPath: DEFAULT_SPRITESHEET,
    frame: {
      width: frame.width,
      height: frame.height,
      columns: frame.columns,
      rows: frame.rows,
    },
    frameWidth: frame.width,
    frameHeight: frame.height,
    columns: frame.columns,
    rows: frame.rows,
    installedAt: Date.now(),
  };

  fs.writeFileSync(path.join(staging, DEFAULT_SPRITESHEET), spritesheetBuffer);
  writeJsonAtomic(path.join(staging, 'pet.json'), manifest);
  if (sourceMeta) writeJsonAtomic(path.join(staging, 'source.json'), sourceMeta);

  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(staging, target);
  return getPet(clean);
}

function importPetDirectory(dir, { localId = '' } = {}) {
  const validation = validatePetDirectory(dir);
  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }
  const pet = validation.pet;
  const spritesheetBuffer = fs.readFileSync(pet.spritesheetAbs);
  return installPetAsset({
    id: localId || pet.id,
    displayName: pet.displayName,
    description: pet.description,
    source: pet.source || 'local-import',
    spritesheetBuffer,
    manifest: pet.manifest,
    sourceMeta: {
      source: 'local-import',
      importedFrom: pet.dir,
      manifest: pet.manifest,
      warnings: validation.warnings,
    },
  });
}

function rendererPetConfig(pet = currentPet()) {
  const resolved = pet || builtinPet();
  return {
    id: resolved.id,
    displayName: resolved.displayName,
    description: resolved.description,
    source: resolved.source,
    builtin: Boolean(resolved.builtin),
    spritesheetUrl: pathToFileURL(resolved.spritesheetAbs).href,
    manifestUrl: pathToFileURL(resolved.manifestPath).href,
    manifest: resolved.manifest || {},
  };
}

module.exports = {
  BUILTIN_PET_ID,
  cleanPetId,
  configPath,
  currentPet,
  currentPetId,
  getPet,
  importPetDirectory,
  installPetAsset,
  listPets,
  MAX_SPRITESHEET_BYTES,
  petsRoot,
  removePet,
  rendererPetConfig,
  setCurrentPet,
  unipetHome,
  validatePetDirectory,
};
