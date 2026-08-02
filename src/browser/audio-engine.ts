import type { AudioCue } from "./audio-semantics";
import type {
  HeroAudioCue,
  HeroAudioCueKind
} from "./hero-audio-semantics";

const SETTINGS_KEY = "sgs.audio-settings.v1";
const MAX_CUE_HISTORY = 512;
const MAX_DEDUPE_KEYS = 2048;

interface AudioCatalogEntry {
  title: string;
  url: string;
  durationSeconds: number;
  loop?: boolean;
  bpm?: number;
  bars?: number;
  adaptiveGroup?: string;
}

interface AudioCatalog {
  schemaVersion: number;
  generatorVersion: string;
  sampleRate: number;
  encoding: string;
  sfx: Record<string, AudioCatalogEntry>;
  music: Record<string, AudioCatalogEntry>;
}

interface HeroAudioAsset {
  url: string;
  gain: number;
  delayMs: number;
}

interface HeroAudioCatalogEntry {
  name: string;
  kingdom: string;
  gender: string;
  themeId: string;
  skillIds: string[];
  signatureCardIds: string[];
  inspiration: string;
  cues: Record<"signature" | "victory" | "death", {
    line: string;
    assets: HeroAudioAsset[];
  }>;
}

interface HeroAudioCatalog {
  schemaVersion: number;
  generatorVersion: string;
  sampleRate: number;
  encoding: string;
  music: Record<string, AudioCatalogEntry>;
  heroes: Record<string, HeroAudioCatalogEntry>;
}

export interface AudioSettings {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
}

export interface PlayedAudioCue {
  index: number;
  id: string;
  eventSequence?: number;
  eventType?: string;
  dedupeKey?: string;
}

export interface PlayedHeroAudioCue {
  index: number;
  kind: HeroAudioCueKind;
  heroDefinitionId: string;
  playerId: string;
  line: string;
  eventSequence?: number | undefined;
  eventType?: string | undefined;
  skillId?: string | undefined;
  cardDefinitionId?: string | undefined;
  dedupeKey: string;
}

export interface AudioEngineSnapshot {
  settings: AudioSettings;
  unlocked: boolean;
  pageActive: boolean;
  pageVisible: boolean;
  windowFocused: boolean;
  audioContextState: AudioContextState | null;
  musicPaused: boolean | null;
  activeSfxCount: number;
  desiredMusicId: string | null;
  currentMusicId: string | null;
  catalogReady: boolean;
  transitioning: boolean;
  cueHistory: PlayedAudioCue[];
  heroCueHistory: PlayedHeroAudioCue[];
  musicHistory: PlayedMusicTransition[];
}

export interface PlayedMusicTransition {
  index: number;
  fromId: string | null;
  toId: string;
  crossfadeMs: number;
  phaseAligned: boolean;
}

export interface SgsAudioEngine {
  unlock(): Promise<void>;
  playCue(cue: AudioCue): void;
  playHeroCue(cue: HeroAudioCue): void;
  playSfx(id: string): void;
  playMusic(id: string): void;
  stopMusic(): void;
  setMusicEnabled(enabled: boolean): void;
  setSfxEnabled(enabled: boolean): void;
  setMusicVolume(volume: number): void;
  setSfxVolume(volume: number): void;
  bindControls(root?: ParentNode): void;
  snapshot(): AudioEngineSnapshot;
  clearCueHistory(): void;
}

const DEFAULT_SETTINGS: AudioSettings = {
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 0.32,
  sfxVolume: 0.62
};

function normalizedVolume(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function loadSettings(): AudioSettings {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SETTINGS_KEY) ?? "null"
    ) as Partial<AudioSettings> | null;
    if (!parsed) return { ...DEFAULT_SETTINGS };
    return {
      musicEnabled: parsed.musicEnabled !== false,
      sfxEnabled: parsed.sfxEnabled !== false,
      musicVolume: normalizedVolume(
        parsed.musicVolume ?? DEFAULT_SETTINGS.musicVolume
      ),
      sfxVolume: normalizedVolume(
        parsed.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume
      )
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

class BrowserAudioEngine implements SgsAudioEngine {
  readonly #catalogPromise: Promise<AudioCatalog>;
  readonly #bufferPromises = new Map<string, Promise<AudioBuffer>>();
  readonly #dedupeKeys = new Set<string>();
  readonly #cueHistory: PlayedAudioCue[] = [];
  readonly #heroCueHistory: PlayedHeroAudioCue[] = [];
  readonly #musicHistory: PlayedMusicTransition[] = [];
  readonly #heroCooldowns = new Map<string, number>();
  readonly #activeSfxSources = new Set<AudioBufferSourceNode>();
  readonly #pendingSfxTimers = new Set<number>();
  #catalog: AudioCatalog | null = null;
  #heroCatalog: HeroAudioCatalog | null = null;
  #settings = loadSettings();
  #context: AudioContext | null = null;
  #sfxGain: GainNode | null = null;
  #music: HTMLAudioElement | null = null;
  #outgoingMusic: HTMLAudioElement | null = null;
  #musicFadeFrame: number | null = null;
  #desiredMusicId: string | null = null;
  #currentMusicId: string | null = null;
  #catalogReady = false;
  #unlocked = false;
  #cueIndex = 0;
  #musicTicket = 0;
  #musicTransitionIndex = 0;
  #pageVisible = document.visibilityState === "visible";
  #windowFocused = document.hasFocus();
  #pageActive = this.#pageVisible && this.#windowFocused;
  #contextTransition: Promise<void> = Promise.resolve();

  constructor() {
    this.#catalogPromise = Promise.all([
      fetch("/audio/catalog.json"),
      fetch("/audio/heroes/catalog.json")
    ])
      .then(async ([audioResponse, heroResponse]) => {
        if (!audioResponse.ok) {
          throw new Error(
            `audio catalog request failed: ${audioResponse.status}`
          );
        }
        if (!heroResponse.ok) {
          throw new Error(
            `hero audio catalog request failed: ${heroResponse.status}`
          );
        }
        return {
          audio: await audioResponse.json() as AudioCatalog,
          heroes: await heroResponse.json() as HeroAudioCatalog
        };
      })
      .then(({ audio, heroes }) => {
        this.#heroCatalog = heroes;
        const catalog = {
          ...audio,
          music: { ...audio.music, ...heroes.music }
        };
        this.#catalog = catalog;
        this.#catalogReady = true;
        return catalog;
      });
    void this.#catalogPromise.catch((error: unknown) => {
      console.warn("Unable to load generated audio catalog", error);
    });
    document.addEventListener("visibilitychange", () => {
      this.#pageVisible = document.visibilityState === "visible";
      if (this.#pageVisible) this.#windowFocused = document.hasFocus();
      this.#syncPagePlayback();
    });
    window.addEventListener("blur", () => {
      this.#windowFocused = false;
      this.#syncPagePlayback();
    });
    window.addEventListener("focus", () => {
      this.#windowFocused = true;
      this.#syncPagePlayback();
    });
  }

  async unlock(): Promise<void> {
    this.#unlocked = true;
    if (!this.#context) {
      this.#context = new AudioContext();
      this.#sfxGain = this.#context.createGain();
      this.#sfxGain.gain.value = this.#settings.sfxVolume;
      this.#sfxGain.connect(this.#context.destination);
    }
    if (this.#pageActive && this.#context.state === "suspended") {
      await this.#context.resume();
    }
    if (
      this.#pageActive &&
      this.#desiredMusicId &&
      this.#settings.musicEnabled
    ) {
      await this.#startDesiredMusic();
    }
  }

  playCue(cue: AudioCue): void {
    if (this.#dedupeKeys.has(cue.dedupeKey)) return;
    this.#dedupeKeys.add(cue.dedupeKey);
    if (this.#dedupeKeys.size > MAX_DEDUPE_KEYS) {
      const oldest = this.#dedupeKeys.values().next().value as
        | string
        | undefined;
      if (oldest) this.#dedupeKeys.delete(oldest);
    }
    this.#recordCue({
      id: cue.id,
      eventSequence: cue.eventSequence,
      eventType: cue.eventType,
      dedupeKey: cue.dedupeKey
    });
    void this.#playSfxBuffer(cue.id);
  }

  playSfx(id: string): void {
    this.#recordCue({ id });
    void this.#playSfxBuffer(id);
  }

  playHeroCue(cue: HeroAudioCue): void {
    if (this.#dedupeKeys.has(cue.dedupeKey)) return;
    this.#dedupeKeys.add(cue.dedupeKey);
    void this.#catalogPromise.then(() => {
      const hero = this.#heroCatalog?.heroes[cue.heroDefinitionId];
      if (!hero) return;
      const matchesSkill = cue.skillId
        ? hero.skillIds.includes(cue.skillId)
        : false;
      const matchesCard = cue.cardDefinitionId
        ? hero.signatureCardIds.includes(cue.cardDefinitionId)
        : false;
      if (
        cue.kind === "skill" && !matchesSkill ||
        cue.kind === "card" && !matchesSkill && !matchesCard
      ) {
        return;
      }
      if (cue.kind === "skill" || cue.kind === "card") {
        const cooldownKey = `${cue.playerId}:signature`;
        const now = Date.now();
        if ((this.#heroCooldowns.get(cooldownKey) ?? 0) > now) return;
        this.#heroCooldowns.set(cooldownKey, now + 5000);
      }
      const cueName = cue.kind === "death"
        ? "death"
        : cue.kind === "victory"
          ? "victory"
          : "signature";
      const definition = hero.cues[cueName];
      this.#heroCueHistory.push({
        index: this.#heroCueHistory.length === 0
          ? 0
          : this.#heroCueHistory.at(-1)!.index + 1,
        kind: cue.kind,
        heroDefinitionId: cue.heroDefinitionId,
        playerId: cue.playerId,
        line: definition.line,
        eventSequence: cue.eventSequence,
        eventType: cue.eventType,
        skillId: cue.skillId,
        cardDefinitionId: cue.cardDefinitionId,
        dedupeKey: cue.dedupeKey
      });
      if (this.#heroCueHistory.length > MAX_CUE_HISTORY) {
        this.#heroCueHistory.shift();
      }
      for (const asset of definition.assets) {
        const timer = window.setTimeout(() => {
          this.#pendingSfxTimers.delete(timer);
          void this.#playAudioUrl(asset.url, asset.gain);
        }, asset.delayMs);
        this.#pendingSfxTimers.add(timer);
      }
    }).catch(() => undefined);
  }

  playMusic(id: string): void {
    this.#desiredMusicId = id;
    if (
      this.#pageActive &&
      this.#unlocked &&
      this.#settings.musicEnabled
    ) {
      void this.#startDesiredMusic();
    }
  }

  stopMusic(): void {
    this.#desiredMusicId = null;
    this.#currentMusicId = null;
    this.#musicTicket += 1;
    this.#cancelMusicFade();
    if (this.#music) {
      this.#music.pause();
      this.#music.removeAttribute("src");
      this.#music.load();
      this.#music = null;
    }
  }

  setMusicEnabled(enabled: boolean): void {
    this.#settings.musicEnabled = enabled;
    this.#saveSettings();
    if (
      enabled &&
      this.#pageActive &&
      this.#desiredMusicId
    ) {
      void this.#startDesiredMusic();
    } else {
      this.#cancelMusicFade();
      this.#music?.pause();
    }
    this.#refreshControls();
  }

  setSfxEnabled(enabled: boolean): void {
    this.#settings.sfxEnabled = enabled;
    this.#saveSettings();
    this.#refreshControls();
  }

  setMusicVolume(volume: number): void {
    this.#settings.musicVolume = normalizedVolume(volume);
    if (this.#music && !this.#outgoingMusic) {
      this.#music.volume = this.#settings.musicVolume;
    }
    this.#saveSettings();
    this.#refreshControls();
  }

  setSfxVolume(volume: number): void {
    this.#settings.sfxVolume = normalizedVolume(volume);
    if (this.#sfxGain) {
      this.#sfxGain.gain.value = this.#settings.sfxVolume;
    }
    this.#saveSettings();
    this.#refreshControls();
  }

  bindControls(root: ParentNode = document): void {
    const musicToggle = root.querySelector<HTMLButtonElement>("#music_toggle");
    const sfxToggle = root.querySelector<HTMLButtonElement>("#sfx_toggle");
    const musicVolume =
      root.querySelector<HTMLInputElement>("#music_volume");
    const sfxVolume = root.querySelector<HTMLInputElement>("#sfx_volume");
    musicToggle?.addEventListener("click", () => {
      void this.unlock();
      this.setMusicEnabled(!this.#settings.musicEnabled);
    });
    sfxToggle?.addEventListener("click", () => {
      void this.unlock();
      this.setSfxEnabled(!this.#settings.sfxEnabled);
    });
    musicVolume?.addEventListener("input", () => {
      void this.unlock();
      this.setMusicVolume(Number(musicVolume.value) / 100);
    });
    sfxVolume?.addEventListener("input", () => {
      void this.unlock();
      this.setSfxVolume(Number(sfxVolume.value) / 100);
    });
    this.#refreshControls(root);
  }

  snapshot(): AudioEngineSnapshot {
    return {
      settings: { ...this.#settings },
      unlocked: this.#unlocked,
      pageActive: this.#pageActive,
      pageVisible: this.#pageVisible,
      windowFocused: this.#windowFocused,
      audioContextState: this.#context?.state ?? null,
      musicPaused: this.#music?.paused ?? null,
      activeSfxCount: this.#activeSfxSources.size,
      desiredMusicId: this.#desiredMusicId,
      currentMusicId: this.#currentMusicId,
      catalogReady: this.#catalogReady,
      transitioning: this.#outgoingMusic !== null,
      cueHistory: structuredClone(this.#cueHistory),
      heroCueHistory: structuredClone(this.#heroCueHistory),
      musicHistory: structuredClone(this.#musicHistory)
    };
  }

  clearCueHistory(): void {
    this.#cueHistory.length = 0;
    this.#heroCueHistory.length = 0;
    this.#heroCooldowns.clear();
    this.#dedupeKeys.clear();
  }

  #recordCue(value: Omit<PlayedAudioCue, "index">): void {
    this.#cueHistory.push({
      index: this.#cueIndex++,
      ...value
    });
    if (this.#cueHistory.length > MAX_CUE_HISTORY) {
      this.#cueHistory.splice(
        0,
        this.#cueHistory.length - MAX_CUE_HISTORY
      );
    }
  }

  async #playSfxBuffer(id: string): Promise<void> {
    if (
      !this.#pageActive ||
      !this.#unlocked ||
      !this.#settings.sfxEnabled ||
      !this.#context
    ) return;
    const catalog = await this.#catalogPromise;
    const entry = catalog.sfx[id];
    if (!entry) return;
    await this.#playAudioUrl(entry.url);
  }

  async #playAudioUrl(url: string, gain = 1): Promise<void> {
    if (
      !this.#pageActive ||
      !this.#unlocked ||
      !this.#settings.sfxEnabled ||
      !this.#context
    ) return;
    const buffer = await this.#loadBuffer(url);
    if (
      !this.#pageActive ||
      !this.#settings.sfxEnabled ||
      !this.#context ||
      !this.#sfxGain
    ) return;
    const source = this.#context.createBufferSource();
    const sourceGain = this.#context.createGain();
    sourceGain.gain.value = normalizedVolume(gain);
    source.buffer = buffer;
    source.connect(sourceGain);
    sourceGain.connect(this.#sfxGain);
    this.#activeSfxSources.add(source);
    source.addEventListener("ended", () => {
      this.#activeSfxSources.delete(source);
      source.disconnect();
      sourceGain.disconnect();
    }, { once: true });
    source.start();
  }

  #loadBuffer(url: string): Promise<AudioBuffer> {
    const existing = this.#bufferPromises.get(url);
    if (existing) return existing;
    const promise = (async () => {
      if (!this.#context) throw new Error("audio context is not initialized");
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`audio request failed: ${response.status} ${url}`);
      }
      return await this.#context.decodeAudioData(await response.arrayBuffer());
    })();
    this.#bufferPromises.set(url, promise);
    void promise.catch((error: unknown) => {
      this.#bufferPromises.delete(url);
      console.warn(`Unable to play generated sound ${url}`, error);
    });
    return promise;
  }

  async #startDesiredMusic(): Promise<void> {
    const id = this.#desiredMusicId;
    if (
      !id ||
      !this.#pageActive ||
      !this.#settings.musicEnabled ||
      !this.#unlocked
    ) return;
    const ticket = ++this.#musicTicket;
    const catalog = await this.#catalogPromise;
    if (
      ticket !== this.#musicTicket ||
      id !== this.#desiredMusicId ||
      !this.#pageActive ||
      !this.#settings.musicEnabled
    ) {
      return;
    }
    const entry = catalog.music[id];
    if (!entry) {
      console.warn(`Unknown generated music track: ${id}`);
      return;
    }
    if (this.#music && this.#currentMusicId === id) {
      this.#music.volume = this.#settings.musicVolume;
      if (this.#music.paused) {
        await this.#music.play().catch(() => undefined);
      }
      return;
    }
    this.#cancelMusicFade();
    const outgoing = this.#music;
    const outgoingId = this.#currentMusicId;
    const outgoingEntry = outgoingId ? catalog.music[outgoingId] : undefined;
    const music = new Audio(entry.url);
    music.loop = entry.loop === true;
    music.preload = "auto";
    music.volume = 0;
    const phaseAligned = Boolean(
      outgoing &&
      outgoingEntry?.adaptiveGroup &&
      outgoingEntry.adaptiveGroup === entry.adaptiveGroup &&
      entry.durationSeconds > 0
    );
    if (phaseAligned && outgoing) {
      music.currentTime = outgoing.currentTime % entry.durationSeconds;
    }
    await music.play().catch(() => undefined);
    if (
      ticket !== this.#musicTicket ||
      id !== this.#desiredMusicId ||
      !this.#pageActive ||
      !this.#settings.musicEnabled
    ) {
      music.pause();
      return;
    }
    this.#music = music;
    this.#currentMusicId = id;
    const crossfadeMs = outgoing ? 1800 : 320;
    this.#musicHistory.push({
      index: this.#musicTransitionIndex++,
      fromId: outgoingId,
      toId: id,
      crossfadeMs,
      phaseAligned
    });
    if (this.#musicHistory.length > 64) this.#musicHistory.shift();
    this.#fadeMusic(outgoing, music, crossfadeMs);
  }

  #fadeMusic(
    outgoing: HTMLAudioElement | null,
    incoming: HTMLAudioElement,
    durationMs: number
  ): void {
    this.#outgoingMusic = outgoing;
    const startedAt = performance.now();
    const outgoingStartVolume = outgoing?.volume ?? 0;
    const step = (now: number) => {
      if (this.#music !== incoming) return;
      const progress = Math.max(
        0,
        Math.min(1, (now - startedAt) / durationMs)
      );
      incoming.volume = this.#settings.musicVolume *
        Math.sin(progress * Math.PI / 2);
      if (outgoing) {
        outgoing.volume = outgoingStartVolume *
          Math.cos(progress * Math.PI / 2);
      }
      if (progress < 1) {
        this.#musicFadeFrame = requestAnimationFrame(step);
        return;
      }
      outgoing?.pause();
      this.#outgoingMusic = null;
      this.#musicFadeFrame = null;
      incoming.volume = this.#settings.musicVolume;
    };
    this.#musicFadeFrame = requestAnimationFrame(step);
  }

  #cancelMusicFade(): void {
    if (this.#musicFadeFrame !== null) {
      cancelAnimationFrame(this.#musicFadeFrame);
      this.#musicFadeFrame = null;
    }
    this.#outgoingMusic?.pause();
    this.#outgoingMusic = null;
  }

  #syncPagePlayback(): void {
    const active = this.#pageVisible && this.#windowFocused;
    if (active === this.#pageActive) return;
    this.#pageActive = active;
    if (!active) {
      this.#musicTicket += 1;
      this.#cancelMusicFade();
      this.#music?.pause();
      for (const timer of this.#pendingSfxTimers) {
        window.clearTimeout(timer);
      }
      this.#pendingSfxTimers.clear();
      for (const source of this.#activeSfxSources) {
        try {
          source.stop();
        } catch {
          source.disconnect();
        }
      }
      this.#activeSfxSources.clear();
    }
    this.#contextTransition = this.#contextTransition
      .then(async () => {
        if (this.#context) {
          if (this.#pageActive && this.#unlocked) {
            if (this.#context.state === "suspended") {
              await this.#context.resume();
            }
          } else if (this.#context.state === "running") {
            await this.#context.suspend();
          }
        }
        if (
          this.#pageActive &&
          this.#unlocked &&
          this.#settings.musicEnabled &&
          this.#desiredMusicId
        ) {
          await this.#startDesiredMusic();
        }
      })
      .catch((error: unknown) => {
        console.warn("Unable to synchronize page audio activity", error);
      });
  }

  #saveSettings(): void {
    try {
      window.localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify(this.#settings)
      );
    } catch (error) {
      console.warn("Unable to save audio settings", error);
    }
  }

  #refreshControls(root: ParentNode = document): void {
    const musicToggle = root.querySelector<HTMLButtonElement>("#music_toggle");
    const sfxToggle = root.querySelector<HTMLButtonElement>("#sfx_toggle");
    const musicVolume =
      root.querySelector<HTMLInputElement>("#music_volume");
    const sfxVolume = root.querySelector<HTMLInputElement>("#sfx_volume");
    if (musicToggle) {
      musicToggle.textContent = this.#settings.musicEnabled
        ? "音乐：开"
        : "音乐：关";
      musicToggle.setAttribute(
        "aria-pressed",
        this.#settings.musicEnabled ? "true" : "false"
      );
    }
    if (sfxToggle) {
      sfxToggle.textContent = this.#settings.sfxEnabled
        ? "音效：开"
        : "音效：关";
      sfxToggle.setAttribute(
        "aria-pressed",
        this.#settings.sfxEnabled ? "true" : "false"
      );
    }
    if (musicVolume) {
      musicVolume.value = String(Math.round(this.#settings.musicVolume * 100));
      musicVolume.disabled = !this.#settings.musicEnabled;
    }
    if (sfxVolume) {
      sfxVolume.value = String(Math.round(this.#settings.sfxVolume * 100));
      sfxVolume.disabled = !this.#settings.sfxEnabled;
    }
  }
}

export function createAudioEngine(): SgsAudioEngine {
  return new BrowserAudioEngine();
}
