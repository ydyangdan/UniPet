const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const pets = require('../pets');

function withTempHome(fn) {
  const previous = process.env.UNIPET_HOME;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'unipet-test-'));
  process.env.UNIPET_HOME = temp;
  return Promise.resolve()
    .then(() => fn(temp))
    .finally(() => {
      if (previous === undefined) delete process.env.UNIPET_HOME;
      else process.env.UNIPET_HOME = previous;
      fs.rmSync(temp, { recursive: true, force: true });
    });
}

test('lists built-in pet by default', async () => withTempHome(() => {
  const all = pets.listPets();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, 'uni');
  assert.equal(all[0].builtin, true);
  assert.equal(pets.currentPetId(), 'uni');
}));

test('installs, selects, and removes a local pet', async () => withTempHome(() => {
  const installed = pets.installPetAsset({
    id: 'Market Cat!',
    displayName: 'Market Cat',
    source: 'test',
    spritesheetBuffer: Buffer.from('fake-webp'),
  });

  assert.equal(installed.id, 'market-cat');
  assert.equal(fs.existsSync(path.join(installed.dir, 'spritesheet.webp')), true);
  assert.equal(pets.listPets().length, 2);

  const selected = pets.setCurrentPet('market-cat');
  assert.equal(selected.id, 'market-cat');
  assert.equal(pets.currentPetId(), 'market-cat');

  const removed = pets.removePet('market-cat');
  assert.equal(removed.wasCurrent, true);
  assert.equal(removed.current.id, 'uni');
  assert.equal(pets.currentPetId(), 'uni');
}));

test('validates and imports a local pet directory', async () => withTempHome((temp) => {
  const source = path.join(temp, 'source-pet');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'spritesheet.webp'), Buffer.from('fake-webp'));
  fs.writeFileSync(path.join(source, 'pet.json'), JSON.stringify({
    id: 'Local Robot',
    displayName: 'Local Robot',
    description: 'Local test pet',
    spritesheetPath: 'spritesheet.webp',
    frameWidth: 192,
    frameHeight: 208,
    columns: 8,
    rows: 9,
  }));

  const validation = pets.validatePetDirectory(source);
  assert.equal(validation.valid, true);
  assert.equal(validation.pet.id, 'local-robot');

  const imported = pets.importPetDirectory(source, { localId: 'robot-one' });
  assert.equal(imported.id, 'robot-one');
  assert.equal(fs.existsSync(path.join(imported.dir, 'spritesheet.webp')), true);
}));

test('rejects pet directories with unsafe spritesheet paths', async () => withTempHome((temp) => {
  const source = path.join(temp, 'unsafe-pet');
  fs.mkdirSync(source, { recursive: true });
  fs.writeFileSync(path.join(source, 'pet.json'), JSON.stringify({
    id: 'unsafe',
    displayName: 'Unsafe',
    spritesheetPath: '../outside.webp',
  }));

  const validation = pets.validatePetDirectory(source);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /inside the pet directory/);
}));

test('does not remove the built-in pet', async () => withTempHome(() => {
  assert.throws(() => pets.removePet('uni'), /built-in pet cannot be removed/);
}));
