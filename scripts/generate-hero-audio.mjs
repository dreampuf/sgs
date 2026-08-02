import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), "..");
const SPEC_PATH = resolve(ROOT, "audio/specs/heroes.json");
const GENERATED = resolve(ROOT, "audio/generated/heroes");
const PUBLIC = resolve(ROOT, "public/audio/heroes");
const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const requestedId = argValue("--id");
const force = args.includes("--force");
const verifyOnly = args.includes("--verify");
const listOnly = args.includes("--list");

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stable(value[key])])
    );
  }
  return value;
};
const stableJson = (value, spacing = 0) =>
  JSON.stringify(stable(value), null, spacing);
const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
const fileHash = (path) => sha256(readFileSync(path));
const ensureParent = (path) => mkdirSync(dirname(path), { recursive: true });
const writeJson = (path, value) => {
  ensureParent(path);
  writeFileSync(path, `${stableJson(value, 2)}\n`);
};
const rel = (path) => relative(ROOT, path);
const slug = (id) => id
  .normalize("NFKD")
  .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-")
  .replace(/^-|-$/g, "");
const clamp = (value, minimum = -1, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed (${result.status}): ${result.stderr || result.stdout}`
    );
  }
  return result.stdout.trim();
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function envelope(position, attack, release) {
  return Math.max(0, Math.min(
    attack <= 0 ? 1 : position / attack,
    release <= 0 ? 1 : (1 - position) / release,
    1
  ));
}

function oscillator(phase, wave) {
  if (wave === "triangle") return 2 * Math.asin(Math.sin(phase)) / Math.PI;
  if (wave === "square") return Math.sin(phase) >= 0 ? 1 : -1;
  return Math.sin(phase);
}

function addTone(channel, sampleRate, options) {
  const {
    start = 0,
    duration,
    frequency,
    endFrequency = frequency,
    amplitude,
    wave = "sine",
    attack = 0.03,
    release = 0.2
  } = options;
  const from = Math.max(0, Math.floor(start * sampleRate));
  const length = Math.max(1, Math.floor(duration * sampleRate));
  const to = Math.min(channel.length, from + length);
  let phase = 0;
  for (let index = from; index < to; index += 1) {
    const position = (index - from) / length;
    const frequencyNow =
      frequency * Math.pow(endFrequency / frequency, position);
    phase += 2 * Math.PI * frequencyNow / sampleRate;
    channel[index] += oscillator(phase, wave) * amplitude *
      envelope(position, attack, release);
  }
}

function addNoise(channel, sampleRate, random, options) {
  const {
    start = 0,
    duration,
    amplitude,
    brightness = 0.5,
    attack = 0.005,
    release = 0.3
  } = options;
  const from = Math.max(0, Math.floor(start * sampleRate));
  const length = Math.max(1, Math.floor(duration * sampleRate));
  const to = Math.min(channel.length, from + length);
  let smooth = 0;
  for (let index = from; index < to; index += 1) {
    const position = (index - from) / length;
    const white = random() * 2 - 1;
    smooth += (white - smooth) * (0.03 + brightness * 0.42);
    channel[index] += (
      smooth * (1 - brightness * 0.45) +
      (white - smooth) * brightness
    ) * amplitude * envelope(position, attack, release);
  }
}

function normalize(channels, peak = 0.86) {
  let maximum = 0;
  for (const channel of channels) {
    for (const sample of channel) maximum = Math.max(maximum, Math.abs(sample));
  }
  if (maximum === 0) return channels;
  const gain = peak / maximum;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = clamp(channel[index] * gain);
    }
  }
  return channels;
}

function writeWav(path, channels, sampleRate) {
  const channelCount = channels.length;
  const frameCount = channels[0].length;
  const dataSize = frameCount * channelCount * 2;
  const output = Buffer.alloc(44 + dataSize);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + dataSize, 4);
  output.write("WAVE", 8);
  output.write("fmt ", 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(channelCount, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * channelCount * 2, 28);
  output.writeUInt16LE(channelCount * 2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36);
  output.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (const channel of channels) {
      output.writeInt16LE(
        Math.round(clamp(channel[frame]) * 32767),
        offset
      );
      offset += 2;
    }
  }
  ensureParent(path);
  writeFileSync(path, output);
}

function midiFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function scaleMidi(root, scale, degree, octave = 0) {
  const normalized = ((degree % scale.length) + scale.length) % scale.length;
  return root + scale[normalized] +
    12 * (octave + Math.floor(degree / scale.length));
}

const KINGDOM_ROOT = {
  wei: 45,
  shu: 47,
  wu: 43,
  qun: 42
};
const STYLE_INSTRUMENT = {
  noble: "horn",
  fierce: "suona",
  graceful: "flute",
  mystical: "qin",
  tactical: "qin",
  aged: "xiao"
};

function createThemeScore(hero, rendering) {
  const bpm = rendering.themeBpm;
  const bars = rendering.themeBars;
  const beatSeconds = 60 / bpm;
  const durationSeconds = bars * 4 * beatSeconds;
  const scale = [0, 2, 3, 7, 10];
  const progression = [0, 3, 4, 2];
  const rootMidi = KINGDOM_ROOT[hero.kingdom] ?? 45;
  const events = [];
  const add = (event) => events.push({
    ...event,
    start: Number(event.start.toFixed(6)),
    duration: Number(event.duration.toFixed(6)),
    velocity: Number(event.velocity.toFixed(4)),
    pan: Number((event.pan ?? 0).toFixed(3))
  });
  for (let bar = 0; bar < bars; bar += 1) {
    const barStart = bar * 4 * beatSeconds;
    const chord = progression[bar % progression.length];
    [0, 2, 4].forEach((degree, index) => add({
      stem: "harmony",
      instrument: "strings",
      start: barStart,
      duration: beatSeconds * 4,
      midi: scaleMidi(rootMidi, scale, chord + degree),
      velocity: (0.13 + hero.theme.energy * 0.09) *
        (index === 0 ? 1 : 0.8),
      pan: [-0.42, 0, 0.42][index]
    }));
    [0, 2].forEach((beat) => add({
      stem: "bass",
      instrument: "drone",
      start: barStart + beat * beatSeconds,
      duration: beatSeconds * 1.7,
      midi: scaleMidi(rootMidi, scale, chord, -1),
      velocity: 0.18 + hero.theme.energy * 0.17,
      pan: 0
    }));
    for (let beat = 0; beat < 4; beat += 1) {
      add({
        stem: "percussion",
        instrument: beat % 2 ? "wood" : "drum",
        start: barStart + beat * beatSeconds,
        duration: beatSeconds * 0.35,
        midi: beat % 2 ? 58 : 36,
        velocity: 0.14 + hero.theme.energy * (beat === 0 ? 0.3 : 0.2),
        pan: beat % 2 ? 0.16 : -0.08
      });
    }
    for (let step = 0; step < hero.theme.motif.length; step += 1) {
      add({
        stem: "lead",
        instrument: STYLE_INSTRUMENT[hero.voiceStyle] ?? "flute",
        start: barStart +
          step * beatSeconds * 4 / hero.theme.motif.length,
        duration: beatSeconds * 3.3 / hero.theme.motif.length,
        midi: scaleMidi(
          rootMidi,
          scale,
          chord + hero.theme.motif[step],
          1
        ),
        velocity: 0.15 + hero.theme.energy * 0.18,
        pan: Math.sin((bar * hero.theme.motif.length + step) * 0.9) * 0.22
      });
    }
  }
  return {
    schemaVersion: 1,
    assetId: `music.hero.${hero.definitionId}`,
    heroDefinitionId: hero.definitionId,
    title: `${hero.name}·英雄主题`,
    seed: hero.seed,
    bpm,
    bars,
    durationSeconds,
    adaptiveGroup: rendering.adaptiveGroup,
    rootMidi,
    scale,
    progression,
    motif: hero.theme.motif,
    energy: hero.theme.energy,
    events
  };
}

function renderTheme(score, sampleRate) {
  const length = Math.ceil(score.durationSeconds * sampleRate);
  const left = new Float64Array(length);
  const right = new Float64Array(length);
  const random = mulberry32(score.seed);
  for (const event of score.events) {
    const frequency = midiFrequency(event.midi);
    const target = event.pan < -0.12
      ? left
      : event.pan > 0.12
        ? right
        : null;
    const channels = target ? [target] : [left, right];
    for (const channel of channels) {
      if (event.instrument === "drum" || event.instrument === "wood") {
        addNoise(channel, sampleRate, random, {
          start: event.start,
          duration: event.duration,
          amplitude: event.velocity,
          brightness: event.instrument === "wood" ? 0.65 : 0.22,
          release: 0.88
        });
        addTone(channel, sampleRate, {
          start: event.start,
          duration: event.duration,
          frequency,
          endFrequency: frequency * 0.55,
          amplitude: event.velocity * 0.9,
          wave: "triangle",
          release: 0.9
        });
      } else {
        const wave =
          event.instrument === "strings" ? "triangle" :
          event.instrument === "suona" ? "square" : "sine";
        addTone(channel, sampleRate, {
          start: event.start,
          duration: event.duration,
          frequency,
          amplitude: event.velocity,
          wave,
          attack: event.instrument === "strings" ? 0.2 : 0.06,
          release: event.instrument === "strings" ? 0.22 : 0.35
        });
      }
    }
  }
  return normalize([left, right], 0.82);
}

function createSignatureEnvelope(hero) {
  return {
    schemaVersion: 1,
    assetId: `hero.${hero.definitionId}.signature`,
    heroDefinitionId: hero.definitionId,
    seed: hero.seed + 10000,
    durationSeconds: 1.1,
    style: hero.voiceStyle,
    kingdom: hero.kingdom,
    layers: [
      "kingdom root impact",
      "hero motif flourish",
      `${hero.voiceStyle} timbre`
    ]
  };
}

function renderSignature(hero, envelopeValue, sampleRate) {
  const length = Math.ceil(envelopeValue.durationSeconds * sampleRate);
  const channel = new Float64Array(length);
  const random = mulberry32(envelopeValue.seed);
  const root = midiFrequency((KINGDOM_ROOT[hero.kingdom] ?? 45) + 12);
  addNoise(channel, sampleRate, random, {
    duration: 0.28,
    amplitude: 0.22 + hero.theme.energy * 0.13,
    brightness: hero.voiceStyle === "fierce" ? 0.82 : 0.5,
    release: 0.9
  });
  hero.theme.motif.slice(0, 4).forEach((degree, index) => {
    addTone(channel, sampleRate, {
      start: 0.08 + index * 0.16,
      duration: 0.5,
      frequency: root * Math.pow(2, degree / 12),
      amplitude: 0.16 + hero.theme.energy * 0.1,
      wave: hero.voiceStyle === "fierce" ? "triangle" : "sine",
      attack: 0.01,
      release: 0.64
    });
  });
  addTone(channel, sampleRate, {
    start: 0,
    duration: 0.6,
    frequency: root * 0.5,
    endFrequency: root * 0.34,
    amplitude: 0.25,
    wave: "triangle",
    release: 0.88
  });
  return normalize([channel], 0.84);
}

const VOICE_RATE = {
  noble: 166,
  fierce: 180,
  graceful: 164,
  mystical: 155,
  tactical: 170,
  aged: 145
};

function voiceFor(hero, rendering) {
  if (hero.gender === "female") return rendering.femaleVoice;
  if (hero.voiceStyle === "fierce") return rendering.fierceVoice;
  if (hero.voiceStyle === "aged") return rendering.agedVoice;
  return rendering.maleVoice;
}

function voiceFilter(style) {
  const common =
    "highpass=f=75,lowpass=f=9000," +
    "acompressor=threshold=-18dB:ratio=2:attack=20:release=180";
  if (style === "fierce") {
    return "highpass=f=90,lowpass=f=8500," +
      "acompressor=threshold=-20dB:ratio=3:attack=8:release=150";
  }
  if (style === "mystical") return `${common},aecho=0.8:0.18:55:0.1`;
  if (style === "tactical") {
    return "highpass=f=85,lowpass=f=8000," +
      "acompressor=threshold=-17dB:ratio=2:attack=16:release=160";
  }
  if (style === "aged") return "highpass=f=65,lowpass=f=6500," +
    "acompressor=threshold=-18dB:ratio=2:attack=25:release=220";
  if (style === "graceful") return `highpass=f=100,${common.split(",").slice(1).join(",")}`;
  return common;
}

function detectEncoder() {
  const encoders = run("ffmpeg", ["-hide_banner", "-encoders"]);
  if (encoders.includes("libvorbis")) {
    return { codec: "libvorbis", args: ["-q:a", "5"] };
  }
  if (encoders.includes("libopus")) {
    return {
      codec: "libopus",
      args: ["-b:a", "80k", "-vbr", "off", "-application", "audio"]
    };
  }
  throw new Error("ffmpeg must provide libvorbis or libopus");
}

const OGG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let remainder = index << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      remainder = (remainder & 0x80000000)
        ? ((remainder << 1) ^ 0x04c11db7)
        : (remainder << 1);
    }
    table[index] = remainder >>> 0;
  }
  return table;
})();

function normalizeOgg(path, serial) {
  const data = readFileSync(path);
  let offset = 0;
  while (offset < data.length) {
    if (data.toString("ascii", offset, offset + 4) !== "OggS") {
      throw new Error(`invalid OGG page at ${offset}: ${path}`);
    }
    const segmentCount = data[offset + 26];
    let bodyLength = 0;
    for (let index = 0; index < segmentCount; index += 1) {
      bodyLength += data[offset + 27 + index];
    }
    const pageLength = 27 + segmentCount + bodyLength;
    data.writeUInt32LE(serial >>> 0, offset + 14);
    data.writeUInt32LE(0, offset + 22);
    let crc = 0;
    for (let index = offset; index < offset + pageLength; index += 1) {
      crc = ((crc << 8) ^
        OGG_CRC_TABLE[((crc >>> 24) ^ data[index]) & 0xff]) >>> 0;
    }
    data.writeUInt32LE(crc >>> 0, offset + 22);
    offset += pageLength;
  }
  writeFileSync(path, data);
}

function encodeOgg(wavPath, oggPath, encoder, serial) {
  ensureParent(oggPath);
  run("ffmpeg", [
    "-y", "-v", "error",
    "-i", wavPath,
    "-map_metadata", "-1",
    "-c:a", encoder.codec,
    ...encoder.args,
    oggPath
  ]);
  normalizeOgg(oggPath, serial);
}

function environmentInfo() {
  return {
    platform: process.platform,
    architecture: process.arch,
    osVersion: run("sw_vers", ["-productVersion"]),
    osBuild: run("sw_vers", ["-buildVersion"]),
    sayPath: "/usr/bin/say",
    ffmpegVersion: run("ffmpeg", ["-version"]).split("\n")[0]
  };
}

function outputRecord(path) {
  return {
    path: rel(path),
    bytes: readFileSync(path).length,
    sha256: fileHash(path)
  };
}

function pathsFor(hero) {
  const directory = resolve(GENERATED, slug(hero.definitionId));
  const publicDirectory = resolve(PUBLIC, slug(hero.definitionId));
  return {
    directory,
    score: resolve(directory, "theme-score.json"),
    envelope: resolve(directory, "signature-envelope.json"),
    script: resolve(directory, "voice-script.json"),
    themeWav: resolve(directory, "wav/theme.wav"),
    signatureWav: resolve(directory, "wav/signature.wav"),
    source: (kind) => resolve(directory, `voice-source/${kind}.aiff`),
    voiceWav: (kind) => resolve(directory, `wav/voice-${kind}.wav`),
    themeOgg: resolve(publicDirectory, "theme.ogg"),
    signatureOgg: resolve(publicDirectory, "signature.ogg"),
    voiceOgg: (kind) => resolve(publicDirectory, `voice-${kind}.ogg`),
    receipt: resolve(directory, "receipt.json")
  };
}

function expectedPaths(paths) {
  return [
    paths.score,
    paths.envelope,
    paths.script,
    paths.themeWav,
    paths.signatureWav,
    paths.themeOgg,
    paths.signatureOgg,
    ...["signature", "victory", "death"].flatMap((kind) => [
      paths.source(kind),
      paths.voiceWav(kind),
      paths.voiceOgg(kind)
    ]),
    paths.receipt
  ];
}

function generateHero(hero, spec, generatorSha256, encoder, environment) {
  const paths = pathsFor(hero);
  const inputHash = sha256(stableJson({
    generatorVersion: spec.generatorVersion,
    rendering: spec.rendering,
    hero,
    generatorSha256,
    environment
  }));
  if (!force && existsSync(paths.receipt)) {
    const receipt = JSON.parse(readFileSync(paths.receipt, "utf8"));
    if (
      receipt.inputSha256 === inputHash &&
      expectedPaths(paths).every(existsSync)
    ) {
      return { status: "unchanged", receipt, paths };
    }
  }
  const score = createThemeScore(hero, spec.rendering);
  const signatureEnvelope = createSignatureEnvelope(hero);
  const voice = voiceFor(hero, spec.rendering);
  const rate = VOICE_RATE[hero.voiceStyle] ?? 165;
  const filter = voiceFilter(hero.voiceStyle);
  const voiceScript = {
    schemaVersion: 1,
    heroDefinitionId: hero.definitionId,
    heroName: hero.name,
    voice,
    rate,
    style: hero.voiceStyle,
    postprocess: filter,
    inspiration: hero.inspiration,
    originality:
      "Original adaptation inspired by the public-domain literary character; " +
      "not copied from commercial game voice lines.",
    lines: hero.lines
  };
  writeJson(paths.score, score);
  writeJson(paths.envelope, signatureEnvelope);
  writeJson(paths.script, voiceScript);
  writeWav(
    paths.themeWav,
    renderTheme(score, spec.rendering.sampleRate),
    spec.rendering.sampleRate
  );
  writeWav(
    paths.signatureWav,
    renderSignature(hero, signatureEnvelope, spec.rendering.sampleRate),
    spec.rendering.sampleRate
  );
  for (const kind of ["signature", "victory", "death"]) {
    ensureParent(paths.source(kind));
    run("/usr/bin/say", [
      "-v", voice,
      "-r", String(rate),
      "-o", paths.source(kind),
      hero.lines[kind]
    ]);
    ensureParent(paths.voiceWav(kind));
    run("ffmpeg", [
      "-y", "-v", "error",
      "-i", paths.source(kind),
      "-af", filter,
      "-ar", String(spec.rendering.sampleRate),
      "-ac", "1",
      "-c:a", "pcm_s16le",
      paths.voiceWav(kind)
    ]);
  }
  encodeOgg(paths.themeWav, paths.themeOgg, encoder, hero.seed);
  encodeOgg(
    paths.signatureWav,
    paths.signatureOgg,
    encoder,
    hero.seed + 1
  );
  ["signature", "victory", "death"].forEach((kind, index) => {
    encodeOgg(
      paths.voiceWav(kind),
      paths.voiceOgg(kind),
      encoder,
      hero.seed + 2 + index
    );
  });
  const outputs = expectedPaths(paths)
    .filter((path) => path !== paths.receipt)
    .map(outputRecord);
  const receipt = {
    schemaVersion: 1,
    generatorVersion: spec.generatorVersion,
    generatorSha256,
    inputSha256: inputHash,
    source: "audio/specs/heroes.json",
    heroDefinitionId: hero.definitionId,
    seed: hero.seed,
    renderingEnvironment: environment,
    voice: { name: voice, rate, style: hero.voiceStyle, postprocess: filter },
    encoder,
    outputs
  };
  writeJson(paths.receipt, receipt);
  return { status: "generated", receipt, paths };
}

function catalogFor(spec) {
  const music = {};
  const heroes = {};
  for (const hero of spec.heroes) {
    const base = `/audio/heroes/${slug(hero.definitionId)}`;
    const themeId = `music.hero.${hero.definitionId}`;
    music[themeId] = {
      title: `${hero.name}·英雄主题`,
      url: `${base}/theme.ogg`,
      durationSeconds:
        spec.rendering.themeBars * 4 * 60 / spec.rendering.themeBpm,
      loop: true,
      bpm: spec.rendering.themeBpm,
      bars: spec.rendering.themeBars,
      adaptiveGroup: spec.rendering.adaptiveGroup,
      heroDefinitionId: hero.definitionId
    };
    heroes[hero.definitionId] = {
      name: hero.name,
      kingdom: hero.kingdom,
      gender: hero.gender,
      themeId,
      skillIds: hero.skills,
      signatureCardIds: hero.signatureCardIds,
      inspiration: hero.inspiration,
      cues: {
        signature: {
          line: hero.lines.signature,
          assets: [
            { url: `${base}/signature.ogg`, gain: 0.46, delayMs: 0 },
            { url: `${base}/voice-signature.ogg`, gain: 0.92, delayMs: 90 }
          ]
        },
        victory: {
          line: hero.lines.victory,
          assets: [
            { url: `${base}/signature.ogg`, gain: 0.38, delayMs: 0 },
            { url: `${base}/voice-victory.ogg`, gain: 1, delayMs: 120 }
          ]
        },
        death: {
          line: hero.lines.death,
          assets: [
            { url: `${base}/voice-death.ogg`, gain: 1, delayMs: 60 }
          ]
        }
      }
    };
  }
  return {
    schemaVersion: 1,
    generatorVersion: spec.generatorVersion,
    sampleRate: spec.rendering.sampleRate,
    encoding: "ogg",
    music,
    heroes
  };
}

function verify(spec, generatorSha256, environment) {
  const errors = [];
  for (const hero of spec.heroes) {
    const paths = pathsFor(hero);
    if (!existsSync(paths.receipt)) {
      errors.push(`${hero.definitionId}: missing receipt`);
      continue;
    }
    const receipt = JSON.parse(readFileSync(paths.receipt, "utf8"));
    const expectedInputHash = sha256(stableJson({
      generatorVersion: spec.generatorVersion,
      rendering: spec.rendering,
      hero,
      generatorSha256,
      environment
    }));
    if (receipt.inputSha256 !== expectedInputHash) {
      errors.push(`${hero.definitionId}: stale inputs`);
    }
    for (const output of receipt.outputs) {
      const path = resolve(ROOT, output.path);
      if (!existsSync(path)) {
        errors.push(`${hero.definitionId}: missing ${output.path}`);
      } else if (fileHash(path) !== output.sha256) {
        errors.push(`${hero.definitionId}: hash mismatch ${output.path}`);
      }
    }
  }
  const catalogPath = resolve(PUBLIC, "catalog.json");
  if (!existsSync(catalogPath)) {
    errors.push("missing public/audio/heroes/catalog.json");
  } else if (
    stableJson(JSON.parse(readFileSync(catalogPath, "utf8"))) !==
      stableJson(catalogFor(spec))
  ) {
    errors.push("hero audio catalog is stale");
  }
  if (errors.length > 0) {
    throw new Error(`hero audio verification failed:\n${errors.join("\n")}`);
  }
}

const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
if (new Set(spec.heroes.map((hero) => hero.definitionId)).size !==
  spec.heroes.length) {
  throw new Error("hero audio specs contain duplicate definition IDs");
}
if (requestedId && !spec.heroes.some((hero) => hero.definitionId === requestedId)) {
  throw new Error(`unknown hero audio ID: ${requestedId}`);
}
if (listOnly) {
  for (const hero of spec.heroes) {
    console.log(`${hero.definitionId}\t${hero.name}\t${hero.voiceStyle}`);
  }
  process.exit(0);
}

const generatorSha256 = fileHash(SCRIPT_PATH);
const environment = environmentInfo();
if (verifyOnly) {
  verify(spec, generatorSha256, environment);
  console.log(`hero audio verified: ${spec.heroes.length} heroes`);
  process.exit(0);
}

const encoder = detectEncoder();
const selected = requestedId
  ? spec.heroes.filter((hero) => hero.definitionId === requestedId)
  : spec.heroes;
let generated = 0;
let unchanged = 0;
for (const hero of selected) {
  const result = generateHero(
    hero,
    spec,
    generatorSha256,
    encoder,
    environment
  );
  if (result.status === "generated") generated += 1;
  else unchanged += 1;
  console.log(`${result.status}: ${hero.definitionId}`);
}
writeJson(resolve(PUBLIC, "catalog.json"), catalogFor(spec));
writeJson(resolve(GENERATED, "catalog-receipt.json"), {
  schemaVersion: 1,
  generatorVersion: spec.generatorVersion,
  generatorSha256,
  source: "audio/specs/heroes.json",
  sourceSha256: fileHash(SPEC_PATH),
  catalog: outputRecord(resolve(PUBLIC, "catalog.json")),
  heroCount: spec.heroes.length,
  renderingEnvironment: environment
});
console.log(
  `hero audio ready: ${generated} generated, ${unchanged} unchanged, ` +
  `${spec.heroes.length} catalogued`
);
