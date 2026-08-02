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
const SPEC_PATH = resolve(ROOT, "audio/specs/catalog.json");
const GENERATED = resolve(ROOT, "audio/generated");
const PUBLIC_AUDIO = resolve(ROOT, "public/audio");
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
const safeId = (id) => id.replace(/[^a-z0-9]+/gi, "-");
const clamp = (value, minimum = -1, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, value));

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
  const attackValue = attack <= 0 ? 1 : Math.min(1, position / attack);
  const releaseValue = release <= 0
    ? 1
    : Math.min(1, (1 - position) / release);
  return Math.max(0, Math.min(attackValue, releaseValue));
}

function oscillator(phase, wave) {
  if (wave === "triangle") {
    return 2 * Math.asin(Math.sin(phase)) / Math.PI;
  }
  if (wave === "square") return Math.sin(phase) >= 0 ? 1 : -1;
  if (wave === "saw") {
    return 2 * ((phase / (2 * Math.PI)) % 1) - 1;
  }
  return Math.sin(phase);
}

function addTone(
  channel,
  sampleRate,
  {
    start = 0,
    duration,
    frequency,
    endFrequency = frequency,
    amplitude,
    wave = "sine",
    attack = 0.04,
    release = 0.18,
    vibrato = 0,
    vibratoRate = 5
  }
) {
  const from = Math.max(0, Math.floor(start * sampleRate));
  const length = Math.max(1, Math.floor(duration * sampleRate));
  const to = Math.min(channel.length, from + length);
  let phase = 0;
  for (let index = from; index < to; index += 1) {
    const position = (index - from) / length;
    const baseFrequency =
      frequency * Math.pow(endFrequency / frequency, position);
    const currentFrequency =
      baseFrequency * (1 + vibrato * Math.sin(
        2 * Math.PI * vibratoRate * position * duration
      ));
    phase += 2 * Math.PI * currentFrequency / sampleRate;
    channel[index] += oscillator(phase, wave) *
      amplitude * envelope(position, attack, release);
  }
}

function addNoise(
  channel,
  sampleRate,
  random,
  {
    start = 0,
    duration,
    amplitude,
    attack = 0.01,
    release = 0.35,
    brightness = 0.5
  }
) {
  const from = Math.max(0, Math.floor(start * sampleRate));
  const length = Math.max(1, Math.floor(duration * sampleRate));
  const to = Math.min(channel.length, from + length);
  let smooth = 0;
  for (let index = from; index < to; index += 1) {
    const position = (index - from) / length;
    const white = random() * 2 - 1;
    smooth += (white - smooth) * (0.03 + brightness * 0.42);
    const colored = smooth * (1 - brightness * 0.45) +
      (white - smooth) * brightness;
    channel[index] += colored * amplitude *
      envelope(position, attack, release);
  }
}

function normalize(channels, peak = 0.88) {
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
  const bytesPerSample = 2;
  const dataSize = frameCount * channelCount * bytesPerSample;
  const output = Buffer.alloc(44 + dataSize);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + dataSize, 4);
  output.write("WAVE", 8);
  output.write("fmt ", 12);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(channelCount, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  output.writeUInt16LE(channelCount * bytesPerSample, 32);
  output.writeUInt16LE(bytesPerSample * 8, 34);
  output.write("data", 36);
  output.writeUInt32LE(dataSize, 40);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      output.writeInt16LE(
        Math.round(clamp(channels[channel][frame]) * 32767),
        offset
      );
      offset += bytesPerSample;
    }
  }
  ensureParent(path);
  writeFileSync(path, output);
}

function sfxLayers(spec) {
  const { pitch, brightness, weight } = spec.params;
  const duration = spec.durationMs / 1000;
  return {
    schemaVersion: 1,
    assetId: spec.id,
    title: spec.title,
    seed: spec.seed,
    durationSeconds: duration,
    recipe: spec.recipe,
    normalizedParameters: {
      pitchHz: pitch,
      brightness: clamp(brightness, 0, 1),
      weight: clamp(weight, 0, 1)
    },
    layers: recipeLayerDescription(spec.recipe)
  };
}

function recipeLayerDescription(recipe) {
  const descriptions = {
    ui: ["short pitched transient"],
    signal: ["pitched motif", "soft shimmer"],
    card: ["paper noise", "table transient"],
    slash: ["swept air", "blade body"],
    fire: ["filtered flame noise", "low impact", "crackle grains"],
    thunder: ["low thunder body", "wide noise crack", "electric ticks"],
    metal: ["inharmonic metal partials", "short impact"],
    heal: ["ascending pentatonic motif", "soft shimmer"],
    liquid: ["low liquid body", "rising bubbles"],
    duel: ["alternating metal strikes", "low impact"],
    horde: ["war drum pattern", "crowd noise bed"],
    arrows: ["layered air sweeps", "wood impacts"],
    bells: ["pentatonic bells", "soft bed"],
    nullify: ["rising cancellation sweep", "glass partials"],
    chain: ["sequenced metal links", "low chain body"],
    impact: ["low body", "broad transient"],
    judgment: ["ceremonial drum", "suspended bell"],
    death: ["descending low body", "dark gong", "air tail"]
  };
  return descriptions[recipe] ?? ["procedural tone"];
}

function renderSfx(spec, sampleRate) {
  const length = Math.ceil((spec.durationMs / 1000) * sampleRate);
  const channel = new Float64Array(length);
  const random = mulberry32(spec.seed);
  const duration = spec.durationMs / 1000;
  const { pitch, brightness, weight } = spec.params;
  const tone = (options) => addTone(channel, sampleRate, options);
  const noise = (options) =>
    addNoise(channel, sampleRate, random, {
      brightness,
      ...options
    });
  const hit = (at, frequency, strength = 1) => {
    tone({
      start: at,
      duration: Math.min(0.34, duration - at),
      frequency,
      endFrequency: Math.max(34, frequency * 0.52),
      amplitude: (0.18 + weight * 0.25) * strength,
      wave: "triangle",
      attack: 0.005,
      release: 0.88
    });
    noise({
      start: at,
      duration: Math.min(0.22, duration - at),
      amplitude: (0.11 + weight * 0.18) * strength,
      attack: 0.002,
      release: 0.94
    });
  };
  const bell = (at, frequency, strength = 1) => {
    [1, 2.01, 3.92].forEach((ratio, index) => tone({
      start: at,
      duration: Math.max(0.05, duration - at),
      frequency: frequency * ratio,
      amplitude: strength * [0.2, 0.1, 0.045][index],
      attack: 0.003,
      release: 0.55 + index * 0.12
    }));
  };

  switch (spec.recipe) {
    case "ui":
      tone({
        duration,
        frequency: pitch,
        endFrequency: pitch * 0.76,
        amplitude: 0.3,
        wave: "triangle",
        attack: 0.01,
        release: 0.72
      });
      break;
    case "signal":
      [0, 0.23, 0.46].forEach((at, index) => bell(
        at * duration,
        pitch * [1, 1.25, 1.5][index],
        0.72
      ));
      break;
    case "card":
      noise({
        duration: duration * 0.82,
        amplitude: 0.32,
        attack: 0.025,
        release: 0.5
      });
      hit(duration * 0.62, pitch * 0.28, 0.45);
      break;
    case "slash":
      noise({
        duration: duration * 0.72,
        amplitude: 0.44,
        attack: 0.01,
        release: 0.76
      });
      tone({
        duration: duration * 0.8,
        frequency: pitch * 2.4,
        endFrequency: pitch * 0.7,
        amplitude: 0.24,
        wave: "saw",
        attack: 0.01,
        release: 0.82
      });
      hit(duration * 0.55, pitch, 0.55);
      break;
    case "fire":
      noise({
        duration,
        amplitude: 0.4,
        attack: 0.03,
        release: 0.35
      });
      hit(0, pitch, 0.58);
      for (let index = 0; index < 9; index += 1) {
        const at = random() * duration * 0.82;
        noise({
          start: at,
          duration: 0.025 + random() * 0.07,
          amplitude: 0.13 + random() * 0.09,
          brightness: 0.9,
          release: 0.8
        });
      }
      break;
    case "thunder":
      hit(0, pitch, 0.9);
      noise({
        duration: duration * 0.45,
        amplitude: 0.6,
        brightness: 0.96,
        attack: 0.002,
        release: 0.9
      });
      tone({
        start: duration * 0.08,
        duration: duration * 0.86,
        frequency: pitch,
        endFrequency: pitch * 0.55,
        amplitude: 0.28,
        wave: "triangle",
        attack: 0.02,
        release: 0.55
      });
      for (let index = 0; index < 5; index += 1) {
        const at = duration * (0.08 + index * 0.08);
        bell(at, pitch * (5 + index * 0.7), 0.14);
      }
      break;
    case "metal":
      hit(0, pitch * 0.55, 0.55);
      bell(0, pitch, 0.94);
      break;
    case "heal":
      [1, 1.25, 1.5, 2].forEach((ratio, index) =>
        bell(index * duration * 0.18, pitch * ratio, 0.52)
      );
      noise({
        duration,
        amplitude: 0.08,
        brightness: 0.78,
        attack: 0.2,
        release: 0.42
      });
      break;
    case "liquid":
      noise({
        duration,
        amplitude: 0.17,
        brightness: 0.18,
        attack: 0.03,
        release: 0.45
      });
      for (let index = 0; index < 8; index += 1) {
        const at = duration * (0.1 + index * 0.09);
        tone({
          start: at,
          duration: duration * 0.18,
          frequency: pitch * (1 + index * 0.06),
          endFrequency: pitch * (1.4 + index * 0.08),
          amplitude: 0.09,
          attack: 0.01,
          release: 0.72
        });
      }
      break;
    case "duel":
      [0.04, 0.27, 0.5].forEach((ratio, index) => {
        const at = duration * ratio;
        hit(at, pitch * (index % 2 ? 1.3 : 1), 0.65);
        bell(at, pitch * (2.2 + index * 0.25), 0.48);
      });
      break;
    case "horde":
      [0, 0.22, 0.45, 0.67].forEach((ratio, index) =>
        hit(duration * ratio, pitch * (index % 2 ? 1.18 : 1), 0.78)
      );
      noise({
        start: duration * 0.1,
        duration: duration * 0.9,
        amplitude: 0.19,
        brightness: 0.32,
        attack: 0.15,
        release: 0.38
      });
      break;
    case "arrows":
      for (let index = 0; index < 9; index += 1) {
        const at = duration * (index * 0.075 + random() * 0.035);
        tone({
          start: at,
          duration: duration * 0.35,
          frequency: pitch * (2.8 + random()),
          endFrequency: pitch * (0.7 + random() * 0.2),
          amplitude: 0.09 + random() * 0.08,
          wave: "saw",
          attack: 0.004,
          release: 0.86
        });
      }
      noise({
        duration: duration * 0.8,
        amplitude: 0.22,
        brightness: 0.88,
        release: 0.66
      });
      break;
    case "bells":
      [0, 2, 4, 6, 8].forEach((degree, index) =>
        bell(index * duration * 0.12, pitch * Math.pow(2, degree / 12), 0.48)
      );
      break;
    case "nullify":
      tone({
        duration: duration * 0.86,
        frequency: pitch * 0.62,
        endFrequency: pitch * 2.3,
        amplitude: 0.22,
        wave: "triangle",
        attack: 0.12,
        release: 0.5
      });
      [0.16, 0.38, 0.6].forEach((ratio, index) =>
        bell(duration * ratio, pitch * (1.5 + index * 0.5), 0.36)
      );
      break;
    case "chain":
      [0.04, 0.18, 0.34, 0.53, 0.72].forEach((ratio, index) => {
        const at = duration * ratio;
        hit(at, pitch * (0.5 + index * 0.04), 0.34);
        bell(at, pitch * (1 + index * 0.08), 0.42);
      });
      break;
    case "impact":
      hit(0, pitch, 1);
      tone({
        duration,
        frequency: pitch,
        endFrequency: pitch * 0.45,
        amplitude: 0.35,
        wave: "triangle",
        attack: 0.004,
        release: 0.82
      });
      break;
    case "judgment":
      hit(0, pitch, 0.9);
      bell(duration * 0.18, pitch * 3, 0.72);
      break;
    case "death":
      hit(0, pitch, 0.9);
      tone({
        duration,
        frequency: pitch * 1.5,
        endFrequency: pitch * 0.45,
        amplitude: 0.4,
        wave: "triangle",
        attack: 0.01,
        release: 0.52
      });
      bell(duration * 0.08, pitch * 2, 0.4);
      noise({
        duration,
        amplitude: 0.16,
        brightness: 0.2,
        attack: 0.02,
        release: 0.3
      });
      break;
    default:
      tone({
        duration,
        frequency: pitch,
        amplitude: 0.3,
        release: 0.5
      });
  }
  return normalize([channel], 0.86);
}

function midiFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function scaleMidi(root, scale, degree, octave = 0) {
  const length = scale.length;
  const normalized = ((degree % length) + length) % length;
  const octaveFromDegree = Math.floor(degree / length);
  return root + scale[normalized] + 12 * (octave + octaveFromDegree);
}

function createScore(spec, sampleRate) {
  const random = mulberry32(spec.seed);
  const beatSeconds = 60 / spec.bpm;
  const durationSeconds = spec.bars * 4 * beatSeconds;
  const events = [];
  const add = (event) => events.push({
    ...event,
    start: Number(event.start.toFixed(6)),
    duration: Number(event.duration.toFixed(6)),
    velocity: Number(event.velocity.toFixed(4)),
    pan: Number((event.pan ?? 0).toFixed(3))
  });

  for (let bar = 0; bar < spec.bars; bar += 1) {
    const barStart = bar * 4 * beatSeconds;
    const chordDegree = spec.progression[bar % spec.progression.length];
    [0, 2, 4].forEach((offset, index) => add({
      stem: "harmony",
      instrument: "pad",
      start: barStart,
      duration: 4 * beatSeconds,
      midi: scaleMidi(spec.rootMidi, spec.scale, chordDegree + offset, 0),
      velocity: (0.16 + spec.energy * 0.12) * (index === 0 ? 1 : 0.82),
      pan: [-0.38, 0.08, 0.4][index]
    }));
    [0, 2].forEach((beat) => add({
      stem: "bass",
      instrument: "bass",
      start: barStart + beat * beatSeconds,
      duration: beatSeconds * 1.72,
      midi: scaleMidi(spec.rootMidi, spec.scale, chordDegree, -1),
      velocity: 0.2 + spec.energy * 0.22,
      pan: 0
    }));
    for (let beat = 0; beat < 4; beat += 1) {
      add({
        stem: "percussion",
        instrument: beat % 2 === 0 ? "kick" : "drum",
        start: barStart + beat * beatSeconds,
        duration: beatSeconds * 0.42,
        midi: beat % 2 === 0 ? 35 : 48,
        velocity: 0.2 + spec.energy * (beat === 0 ? 0.34 : 0.24),
        pan: beat % 2 === 0 ? -0.08 : 0.12
      });
      if (spec.energy > 0.45) {
        add({
          stem: "percussion",
          instrument: "hat",
          start: barStart + (beat + 0.5) * beatSeconds,
          duration: beatSeconds * 0.16,
          midi: 78,
          velocity: 0.08 + spec.energy * 0.12,
          pan: beat % 2 ? -0.3 : 0.3
        });
      }
    }
    for (let step = 0; step < 8; step += 1) {
      if (random() > 0.48 + spec.energy * 0.24) continue;
      const degree = chordDegree + [0, 2, 4][Math.floor(random() * 3)];
      add({
        stem: "pluck",
        instrument: "pluck",
        start: barStart + step * beatSeconds * 0.5,
        duration: beatSeconds * (0.42 + random() * 0.28),
        midi: scaleMidi(spec.rootMidi, spec.scale, degree, 1),
        velocity: 0.11 + random() * 0.12 + spec.energy * 0.06,
        pan: random() * 1.1 - 0.55
      });
    }
    const leadCount = spec.palette === "disadvantage"
      ? 1
      : (
          spec.palette === "dominant" || spec.palette === "comeback" ||
            spec.energy > 0.72
            ? 4
            : 2
        );
    let priorDegree = chordDegree + 4;
    for (let phrase = 0; phrase < leadCount; phrase += 1) {
      priorDegree += Math.floor(random() * 5) - 2;
      add({
        stem: "lead",
        instrument: "lead",
        start: barStart + phrase * (4 / leadCount) * beatSeconds,
        duration: beatSeconds * (4 / leadCount) * 0.82,
        midi: scaleMidi(spec.rootMidi, spec.scale, priorDegree, 1),
        velocity: 0.13 + spec.energy * 0.15,
        pan: Math.sin((bar + phrase) * 1.7) * 0.24
      });
    }
  }
  return {
    schemaVersion: 1,
    assetId: spec.id,
    title: spec.title,
    seed: spec.seed,
    sampleRate,
    bpm: spec.bpm,
    bars: spec.bars,
    durationSeconds: Number(durationSeconds.toFixed(6)),
    palette: spec.palette,
    loop: spec.loop,
    events
  };
}

function renderScore(score, spec, sampleRate) {
  const length = Math.ceil(score.durationSeconds * sampleRate);
  const left = new Float64Array(length);
  const right = new Float64Array(length);
  const random = mulberry32(spec.seed ^ 0x9e3779b9);
  const addStereoTone = (event, settings) => {
    const temporary = new Float64Array(length);
    addTone(temporary, sampleRate, settings);
    const leftGain = Math.sqrt((1 - event.pan) * 0.5);
    const rightGain = Math.sqrt((1 + event.pan) * 0.5);
    for (let index = 0; index < length; index += 1) {
      if (temporary[index] === 0) continue;
      left[index] += temporary[index] * leftGain;
      right[index] += temporary[index] * rightGain;
    }
  };
  const addStereoNoise = (event, settings) => {
    const temporary = new Float64Array(length);
    addNoise(temporary, sampleRate, random, settings);
    const leftGain = Math.sqrt((1 - event.pan) * 0.5);
    const rightGain = Math.sqrt((1 + event.pan) * 0.5);
    for (let index = 0; index < length; index += 1) {
      if (temporary[index] === 0) continue;
      left[index] += temporary[index] * leftGain;
      right[index] += temporary[index] * rightGain;
    }
  };

  for (const event of score.events) {
    const frequency = midiFrequency(event.midi);
    if (event.instrument === "kick") {
      addStereoTone(event, {
        start: event.start,
        duration: event.duration,
        frequency,
        endFrequency: frequency * 0.38,
        amplitude: event.velocity,
        wave: "sine",
        attack: 0.004,
        release: 0.86
      });
    } else if (event.instrument === "drum") {
      addStereoNoise(event, {
        start: event.start,
        duration: event.duration,
        amplitude: event.velocity,
        brightness: 0.3,
        attack: 0.004,
        release: 0.9
      });
      addStereoTone(event, {
        start: event.start,
        duration: event.duration,
        frequency,
        endFrequency: frequency * 0.6,
        amplitude: event.velocity * 0.52,
        wave: "triangle",
        attack: 0.004,
        release: 0.88
      });
    } else if (event.instrument === "hat") {
      addStereoNoise(event, {
        start: event.start,
        duration: event.duration,
        amplitude: event.velocity,
        brightness: 0.96,
        attack: 0.002,
        release: 0.94
      });
    } else if (event.instrument === "pad") {
      addStereoTone(event, {
        start: event.start,
        duration: event.duration,
        frequency,
        amplitude: event.velocity,
        wave: (
          spec.palette === "wei" ||
          spec.palette === "dominant" ||
          spec.palette === "critical"
        ) ? "triangle" : "sine",
        attack: 0.2,
        release: 0.2,
        vibrato: spec.palette === "critical"
          ? 0.009
          : spec.palette === "wu"
            ? 0.004
            : 0.002,
        vibratoRate: 4.2
      });
      addStereoTone(event, {
        start: event.start,
        duration: event.duration,
        frequency: frequency * 2,
        amplitude: event.velocity * 0.18,
        wave: "sine",
        attack: 0.24,
        release: 0.24
      });
    } else if (event.instrument === "bass") {
      addStereoTone(event, {
        start: event.start,
        duration: event.duration,
        frequency,
        amplitude: event.velocity,
        wave: "triangle",
        attack: 0.025,
        release: 0.46
      });
    } else if (event.instrument === "pluck") {
      [1, 2, 3].forEach((ratio, index) => addStereoTone(event, {
        start: event.start,
        duration: event.duration,
        frequency: frequency * ratio,
        amplitude: event.velocity * [1, 0.34, 0.14][index],
        wave: index === 0 ? "triangle" : "sine",
        attack: 0.004,
        release: 0.72 + index * 0.06
      }));
    } else if (event.instrument === "lead") {
      addStereoTone(event, {
        start: event.start,
        duration: event.duration,
        frequency,
        amplitude: event.velocity,
        wave: "sine",
        attack: 0.08,
        release: 0.24,
        vibrato: (
          spec.palette === "shu" ||
          spec.palette === "comeback"
        ) ? 0.008 : 0.005,
        vibratoRate: 5.2
      });
      addStereoTone(event, {
        start: event.start,
        duration: event.duration,
        frequency: frequency * 2,
        amplitude: event.velocity * 0.16,
        wave: "sine",
        attack: 0.1,
        release: 0.3,
        vibrato: 0.004,
        vibratoRate: 5.2
      });
    }
  }
  return normalize([left, right], spec.loop ? 0.72 : 0.82);
}

function availableFfmpegEncoders() {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-encoders"], {
    encoding: "utf8"
  });
  if (result.error?.code === "ENOENT") {
    throw new Error("ffmpeg is required to publish OGG audio");
  }
  if (result.status !== 0) {
    throw new Error(`unable to inspect ffmpeg encoders: ${result.stderr}`);
  }
  return new Set(
    result.stdout.split("\n").flatMap((line) => {
      const match = line.match(/^\s*A\S*\s+(\S+)/);
      return match ? [match[1]] : [];
    })
  );
}

function selectOggEncoder() {
  const encoders = availableFfmpegEncoders();
  if (encoders.has("libvorbis")) {
    return { name: "libvorbis", args: ["-c:a", "libvorbis", "-q:a"] };
  }
  if (encoders.has("libopus")) {
    return { name: "libopus", args: ["-c:a", "libopus", "-b:a"] };
  }
  if (encoders.has("vorbis")) {
    return {
      name: "vorbis",
      args: ["-strict", "-2", "-c:a", "vorbis", "-q:a"]
    };
  }
  if (encoders.has("opus")) {
    return {
      name: "opus",
      args: ["-strict", "-2", "-c:a", "opus", "-b:a"]
    };
  }
  throw new Error("ffmpeg has no OGG-compatible Vorbis or Opus encoder");
}

const OGG_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index << 24;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 0x80000000
        ? ((value << 1) ^ 0x04c11db7) >>> 0
        : (value << 1) >>> 0;
    }
    table[index] = value;
  }
  return table;
})();

function normalizeOggContainer(path, assetId) {
  const output = Buffer.from(readFileSync(path));
  const serial = Number.parseInt(sha256(assetId).slice(0, 8), 16) >>> 0;
  let offset = 0;
  while (offset < output.length) {
    if (output.toString("ascii", offset, offset + 4) !== "OggS") {
      throw new Error(`invalid OGG page at byte ${offset}: ${rel(path)}`);
    }
    const segmentCount = output[offset + 26];
    let bodyLength = 0;
    for (let index = 0; index < segmentCount; index += 1) {
      bodyLength += output[offset + 27 + index];
    }
    const pageLength = 27 + segmentCount + bodyLength;
    if (offset + pageLength > output.length) {
      throw new Error(`truncated OGG page at byte ${offset}: ${rel(path)}`);
    }
    output.writeUInt32LE(serial, offset + 14);
    output.writeUInt32LE(0, offset + 22);
    let crc = 0;
    for (let index = offset; index < offset + pageLength; index += 1) {
      const lookup = ((crc >>> 24) ^ output[index]) & 0xff;
      crc = ((crc << 8) ^ OGG_CRC_TABLE[lookup]) >>> 0;
    }
    output.writeUInt32LE(crc, offset + 22);
    offset += pageLength;
  }
  writeFileSync(path, output);
}

function encodeOgg(wavPath, outputPath, kind, encoder, assetId) {
  ensureParent(outputPath);
  const qualityValue = encoder.args.at(-1) === "-q:a"
    ? (kind === "music" ? "5" : "6")
    : (kind === "music" ? "96k" : "64k");
  const result = spawnSync("ffmpeg", [
    "-y",
    "-v", "error",
    "-i", wavPath,
    ...encoder.args,
    qualityValue,
    outputPath
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed for ${rel(wavPath)}: ${result.stderr}`);
  }
  normalizeOggContainer(outputPath, assetId);
}

const catalog = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
const allAssets = [
  ...catalog.sfx.map((spec) => ({ kind: "sfx", spec })),
  ...catalog.music.map((spec) => ({ kind: "music", spec }))
];

if (listOnly) {
  for (const { kind, spec } of allAssets) {
    process.stdout.write(`${kind}\t${spec.id}\t${spec.title}\n`);
  }
  process.exit(0);
}

if (requestedId && !allAssets.some(({ spec }) => spec.id === requestedId)) {
  throw new Error(`unknown audio asset id: ${requestedId}`);
}

const generatorHash = fileHash(SCRIPT_PATH);
const publishEncoder = selectOggEncoder();
const selectedAssets = requestedId
  ? allAssets.filter(({ spec }) => spec.id === requestedId)
  : allAssets;
const publication = {
  schemaVersion: 1,
  generatorVersion: catalog.generatorVersion,
  sampleRate: catalog.sampleRate,
  encoding: `ogg/${publishEncoder.name}`,
  sfx: {},
  music: {}
};
let generatedCount = 0;
let skippedCount = 0;
const verificationErrors = [];

for (const { kind, spec } of allAssets) {
  const slug = safeId(spec.id);
  const intermediatePath = resolve(
    GENERATED,
    kind === "music" ? "scores" : "envelopes",
    `${slug}.json`
  );
  const wavPath = resolve(GENERATED, "wav", kind, `${slug}.wav`);
  const oggPath = resolve(PUBLIC_AUDIO, kind, `${slug}.ogg`);
  const receiptPath = resolve(GENERATED, "receipts", `${slug}.json`);
  const specHash = sha256(stableJson(spec));
  const inputHash = sha256(stableJson({
    generatorHash,
    generatorVersion: catalog.generatorVersion,
    publishEncoder: publishEncoder.name,
    sampleRate: catalog.sampleRate,
    spec
  }));
  const durationSeconds = kind === "sfx"
    ? spec.durationMs / 1000
    : spec.bars * 4 * 60 / spec.bpm;
  publication[kind][spec.id] = {
    title: spec.title,
    url: `/audio/${kind}/${slug}.ogg`,
    durationSeconds: Number(durationSeconds.toFixed(6)),
    ...(kind === "music"
      ? {
          loop: spec.loop,
          bpm: spec.bpm,
          bars: spec.bars,
          ...(spec.adaptiveGroup
            ? { adaptiveGroup: spec.adaptiveGroup }
            : {})
        }
      : {})
  };
  const selected = selectedAssets.some((candidate) => candidate.spec.id === spec.id);
  const expectedPaths = [intermediatePath, wavPath, oggPath];
  let receipt = null;
  if (existsSync(receiptPath)) {
    try {
      receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    } catch {
      receipt = null;
    }
  }
  const validReceipt = receipt?.inputHash === inputHash &&
    receipt.outputs?.every((output) => {
      const path = resolve(ROOT, output.path);
      return existsSync(path) && fileHash(path) === output.sha256;
    }) &&
    expectedPaths.every(existsSync);

  if (verifyOnly) {
    if (!validReceipt) verificationErrors.push(spec.id);
    continue;
  }
  if (!selected) continue;
  if (!force && validReceipt) {
    skippedCount += 1;
    continue;
  }

  let intermediate;
  let channels;
  if (kind === "sfx") {
    intermediate = sfxLayers(spec);
    channels = renderSfx(spec, catalog.sampleRate);
  } else {
    intermediate = createScore(spec, catalog.sampleRate);
    channels = renderScore(intermediate, spec, catalog.sampleRate);
  }
  intermediate.generatorVersion = catalog.generatorVersion;
  intermediate.generatorSha256 = generatorHash;
  intermediate.specSha256 = specHash;
  writeJson(intermediatePath, intermediate);
  writeWav(wavPath, channels, catalog.sampleRate);
  encodeOgg(wavPath, oggPath, kind, publishEncoder, spec.id);
  const outputs = [intermediatePath, wavPath, oggPath].map((path) => ({
    path: rel(path),
    sha256: fileHash(path),
    bytes: readFileSync(path).byteLength
  }));
  writeJson(receiptPath, {
    schemaVersion: 1,
    assetId: spec.id,
    title: spec.title,
    kind,
    seed: spec.seed,
    generatorVersion: catalog.generatorVersion,
    generatorSha256: generatorHash,
    publishEncoder: publishEncoder.name,
    specSha256: specHash,
    inputHash,
    command: `npm run audio:generate -- --id ${spec.id}`,
    source: rel(SPEC_PATH),
    outputs
  });
  generatedCount += 1;
  process.stdout.write(`generated ${spec.id}\n`);
}

if (verifyOnly) {
  const publishedCatalogPath = resolve(PUBLIC_AUDIO, "catalog.json");
  if (
    !existsSync(publishedCatalogPath) ||
    stableJson(JSON.parse(readFileSync(publishedCatalogPath, "utf8"))) !==
      stableJson(publication)
  ) {
    verificationErrors.push("public/audio/catalog.json");
  }
  if (verificationErrors.length > 0) {
    throw new Error(
      `stale or missing audio assets:\n${verificationErrors.join("\n")}`
    );
  }
  process.stdout.write(`verified ${allAssets.length} audio assets\n`);
  process.exit(0);
}

const publishedCatalogPath = resolve(PUBLIC_AUDIO, "catalog.json");
writeJson(publishedCatalogPath, publication);
writeJson(resolve(GENERATED, "catalog-receipt.json"), {
  schemaVersion: 1,
  source: rel(SPEC_PATH),
  generatorVersion: catalog.generatorVersion,
  generatorSha256: generatorHash,
  publishEncoder: publishEncoder.name,
  specSha256: fileHash(SPEC_PATH),
  output: {
    path: rel(publishedCatalogPath),
    sha256: fileHash(publishedCatalogPath),
    bytes: readFileSync(publishedCatalogPath).byteLength
  }
});
process.stdout.write(
  `audio generation complete: ${generatedCount} generated, ` +
  `${skippedCount} unchanged\n`
);
