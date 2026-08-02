const assert = require('assert');
const { createHash } = require('crypto');
const {
  existsSync,
  readFileSync,
} = require('fs');
const { resolve } = require('path');

const root = resolve(__dirname, '..');
const readJson = (path) =>
  JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const hash = (path) =>
  createHash('sha256')
    .update(readFileSync(resolve(root, path)))
    .digest('hex');
const slug = (id) => id.replace(/[^a-z0-9]+/gi, '-');
const specs = readJson('audio/specs/catalog.json');
const published = readJson('public/audio/catalog.json');
const heroSpecs = readJson('audio/specs/heroes.json');
const heroPublished = readJson('public/audio/heroes/catalog.json');

assert.equal(specs.sfx.length, 27);
assert.equal(specs.music.length, 15);
assert.equal(Object.keys(published.sfx).length, specs.sfx.length);
assert.equal(Object.keys(published.music).length, specs.music.length);
const adaptiveTracks = specs.music.filter(
  (track) => track.adaptiveGroup === 'battle-96-a',
);
assert.equal(adaptiveTracks.length, 11);
[
  'bpm',
  'bars',
  'rootMidi',
  'scale',
  'progression',
].forEach((field) => {
  assert.equal(
    new Set(adaptiveTracks.map((track) => JSON.stringify(track[field]))).size,
    1,
    `adaptive music field ${field} must stay phase-compatible`,
  );
});

[...specs.sfx, ...specs.music].forEach((spec) => {
  const id = spec.id;
  const kind = specs.sfx.includes(spec) ? 'sfx' : 'music';
  const safeId = slug(id);
  const intermediate = kind === 'sfx'
    ? `audio/generated/envelopes/${safeId}.json`
    : `audio/generated/scores/${safeId}.json`;
  const wav = `audio/generated/wav/${kind}/${safeId}.wav`;
  const ogg = `public/audio/${kind}/${safeId}.ogg`;
  const receipt = readJson(
    `audio/generated/receipts/${safeId}.json`,
  );
  assert(existsSync(resolve(root, intermediate)), `${id} has no intermediate`);
  const wavData = readFileSync(resolve(root, wav));
  assert.equal(wavData.toString('ascii', 0, 4), 'RIFF',
    `${id} has no PCM WAV master`);
  let peak = 0;
  let energy = 0;
  const sampleCount = (wavData.length - 44) / 2;
  for (let offset = 44; offset < wavData.length; offset += 2) {
    const sample = wavData.readInt16LE(offset);
    peak = Math.max(peak, Math.abs(sample));
    energy += sample * sample;
  }
  assert(peak > 5000, `${id} WAV is effectively silent`);
  assert(Math.sqrt(energy / sampleCount) > 200, `${id} WAV energy is too low`);
  assert(peak <= 32767, `${id} WAV clips outside PCM range`);
  assert(existsSync(resolve(root, ogg)), `${id} has no published OGG`);
  assert.equal(
    readFileSync(resolve(root, ogg), 'ascii').slice(0, 4),
    'OggS',
    `${id} has an invalid OGG container`,
  );
  assert.equal(receipt.seed, spec.seed, `${id} seed differs`);
  assert.equal(receipt.source, 'audio/specs/catalog.json');
  assert.match(receipt.generatorSha256, /^[a-f0-9]{64}$/);
  receipt.outputs.forEach((output) => {
    assert.equal(hash(output.path), output.sha256, `${output.path} hash differs`);
  });
  const representation = readJson(intermediate);
  assert(
    kind === 'music'
      ? representation.events.length > 0
      : representation.layers.length > 0,
    `${id} has an empty intermediate representation`,
  );
});

assert.equal(heroSpecs.heroes.length, 49);
assert.equal(Object.keys(heroPublished.heroes).length, 49);
assert.equal(Object.keys(heroPublished.music).length, 49);
heroSpecs.heroes.forEach((hero) => {
  const directory = `audio/generated/heroes/${hero.definitionId
    .normalize('NFKD')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
    .replace(/^-|-$/g, '')}`;
  const publishedDirectory = `public/audio/heroes/${directory.split('/').at(-1)}`;
  const receipt = readJson(`${directory}/receipt.json`);
  [
    'theme-score.json',
    'signature-envelope.json',
    'voice-script.json',
    'voice-source/signature.aiff',
    'voice-source/victory.aiff',
    'voice-source/death.aiff',
    'wav/theme.wav',
    'wav/signature.wav',
    'wav/voice-signature.wav',
    'wav/voice-victory.wav',
    'wav/voice-death.wav',
  ].forEach((name) => {
    assert(
      existsSync(resolve(root, directory, name)),
      `${hero.definitionId} has no ${name}`,
    );
  });
  ['theme', 'signature', 'voice-signature', 'voice-victory', 'voice-death']
    .forEach((name) => {
      const path = resolve(root, publishedDirectory, `${name}.ogg`);
      assert.equal(
        readFileSync(path, 'ascii').slice(0, 4),
        'OggS',
        `${hero.definitionId} has invalid ${name}.ogg`,
      );
    });
  assert.equal(receipt.heroDefinitionId, hero.definitionId);
  assert.equal(receipt.source, 'audio/specs/heroes.json');
  assert.match(receipt.renderingEnvironment.osBuild, /^\w+/);
  assert.equal(receipt.outputs.length, 16);
  receipt.outputs.forEach((output) => {
    assert.equal(hash(output.path), output.sha256, `${output.path} hash differs`);
  });
  const score = readJson(`${directory}/theme-score.json`);
  assert.equal(score.bpm, heroSpecs.rendering.themeBpm);
  assert.equal(score.bars, heroSpecs.rendering.themeBars);
  assert.equal(score.adaptiveGroup, heroSpecs.rendering.adaptiveGroup);
  assert(score.events.length > 0);
});

console.log(
  `audio assets passed: ${specs.sfx.length} SFX, ` +
  `${specs.music.length} adaptive tracks and ` +
  `${heroSpecs.heroes.length} traceable hero sound packs`,
);
