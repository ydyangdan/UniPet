const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const BUILTIN_PET_ID = 'pounce';
const DEFAULT_SPRITESHEET = 'spritesheet.webp';

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

function builtinPet() {
  const dir = builtinPetDir();
  const manifest = readManifest(dir) || {
    id: BUILTIN_PET_ID,
    displayName: 'Pounce',
    description: 'Built-in UniPet pet.',
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
  fs.rmSync(pet.dir, { recursive: true, force: true });
  if (wasCurrent) setCurrentPet(BUILTIN_PET_ID);
  return { removed: pet, current: currentPet(), wasCurrent };
}

function installPetAsset({ id, displayName, description, source, spritesheetBuffer, sourceMeta }) {
  const clean = cleanPetId(id);
  if (!clean) throw new Error('pet id required');
  if (clean === BUILTIN_PET_ID) throw new Error(`pet id is reserved: ${BUILTIN_PET_ID}`);
  if (!Buffer.isBuffer(spritesheetBuffer) || spritesheetBuffer.length === 0) {
    throw new Error('spritesheet is empty');
  }

  const root = petsRoot();
  const target = path.join(root, clean);
  const staging = path.join(root, `.staging-${clean}-${process.pid}-${Date.now()}`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });

  const manifest = {
    id: clean,
    displayName: String(displayName || clean),
    description: String(description || ''),
    source: String(source || 'local'),
    spritesheetPath: DEFAULT_SPRITESHEET,
    frameWidth: 192,
    frameHeight: 208,
    columns: 8,
    rows: 9,
    installedAt: Date.now(),
  };

  fs.writeFileSync(path.join(staging, DEFAULT_SPRITESHEET), spritesheetBuffer);
  writeJsonAtomic(path.join(staging, 'pet.json'), manifest);
  if (sourceMeta) writeJsonAtomic(path.join(staging, 'source.json'), sourceMeta);

  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(staging, target);
  return getPet(clean);
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
  };
}

module.exports = {
  BUILTIN_PET_ID,
  cleanPetId,
  configPath,
  currentPet,
  currentPetId,
  getPet,
  installPetAsset,
  listPets,
  petsRoot,
  removePet,
  rendererPetConfig,
  setCurrentPet,
  unipetHome,
};
