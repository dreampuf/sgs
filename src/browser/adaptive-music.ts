import {
  equipmentZone,
  handZone
} from "../core/state";
import type {
  GameState,
  PlayerId
} from "../core/types";

export type MatchMusicMood =
  | "opening"
  | "battle"
  | "advantage"
  | "dominant"
  | "disadvantage"
  | "critical"
  | "comeback"
  | "victory"
  | "defeat";

export interface MatchMusicAssessment {
  mood: Exclude<
    MatchMusicMood,
    "opening" | "comeback" | "victory" | "defeat"
  >;
  localHp: number;
  localMaxHp: number;
  localHandCount: number;
  opponentAverageHandCount: number;
  localPower: number;
  opponentAveragePower: number;
  relativePower: number;
}

export interface AdaptiveMusicSnapshot {
  currentMood: MatchMusicMood | null;
  currentTrackId: string | null;
  pendingMood: MatchMusicMood | null;
  pendingCount: number;
  dangerMemory: "disadvantage" | "critical" | null;
  comebackUntilTurn: number;
  lastAssessment: MatchMusicAssessment | null;
}

interface MusicTransport {
  playMusic(id: string): void;
}

const TRACK_BY_MOOD: Readonly<Record<MatchMusicMood, string>> = {
  opening: "music.opening",
  battle: "music.battle",
  advantage: "music.advantage",
  dominant: "music.dominant",
  disadvantage: "music.disadvantage",
  critical: "music.critical",
  comeback: "music.comeback",
  victory: "music.victory",
  defeat: "music.defeat"
};

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function playerPower(state: Readonly<GameState>, playerId: PlayerId): number {
  const player = state.players[playerId];
  if (!player?.alive) return 0;
  const healthRatio = player.maxHp > 0 ? player.hp / player.maxHp : 0;
  const handCount = state.zones[handZone(playerId)]?.length ?? 0;
  const equipmentCount = state.zones[equipmentZone(playerId)]?.length ?? 0;
  return healthRatio * 2.4 +
    player.hp * 0.28 +
    handCount * 0.34 +
    equipmentCount * 0.42;
}

/**
 * Evaluates the local side using only public, replayable GameState data.
 * It deliberately uses broad thresholds; the director adds hysteresis so a
 * single draw or discard does not immediately replace the music.
 */
export function assessMatchMusic(
  state: Readonly<GameState>,
  localPlayerId: PlayerId
): MatchMusicAssessment {
  const local = state.players[localPlayerId];
  if (!local) throw new Error(`local music player is missing: ${localPlayerId}`);
  const aliveIds = state.turnOrder.filter((id) => state.players[id]?.alive);
  // Other identities are deliberately ignored: using hidden teams here would
  // let the soundtrack leak information that the player has not discovered.
  const opponentIds = aliveIds.filter((id) => id !== localPlayerId);
  const localHandCount = state.zones[handZone(localPlayerId)]?.length ?? 0;
  const opponentAverageHandCount = average(
    opponentIds.map((id) => state.zones[handZone(id)]?.length ?? 0)
  );
  const localPower = playerPower(state, localPlayerId);
  const opponentAveragePower = average(
    opponentIds.map((id) => playerPower(state, id))
  );
  const relativePower = opponentAveragePower === 0
    ? (localPower > 0 ? 1 : 0)
    : (localPower - opponentAveragePower) /
      Math.max(1, opponentAveragePower);
  const manyCards = localHandCount >= 5 ||
    localHandCount >= opponentAverageHandCount + 3;
  const heavilyLeading = relativePower >= 0.48 ||
    (
      localHandCount >= opponentAverageHandCount + 4 &&
      local.hp >= Math.min(3, local.maxHp)
    );
  let mood: MatchMusicAssessment["mood"] = "battle";
  if (local.hp <= 1 || local.dying || !local.alive) {
    mood = "critical";
  } else if (
    (localHandCount === 0 && local.hp <= 3) ||
    (localHandCount <= 1 && local.hp <= 2) ||
    relativePower <= -0.3
  ) {
    mood = "disadvantage";
  } else if (heavilyLeading) {
    mood = "dominant";
  } else if (manyCards || relativePower >= 0.2) {
    mood = "advantage";
  }
  return {
    mood,
    localHp: local.hp,
    localMaxHp: local.maxHp,
    localHandCount,
    opponentAverageHandCount,
    localPower,
    opponentAveragePower,
    relativePower
  };
}

export class AdaptiveMusicDirector {
  readonly #transport: MusicTransport;
  #localPlayerId: PlayerId | null = null;
  #currentMood: MatchMusicMood | null = null;
  #currentTrackId: string | null = null;
  #pendingMood: MatchMusicMood | null = null;
  #pendingCount = 0;
  #dangerMemory: "disadvantage" | "critical" | null = null;
  #comebackUntilTurn = 0;
  #lastAssessment: MatchMusicAssessment | null = null;

  constructor(transport: MusicTransport) {
    this.#transport = transport;
  }

  start(
    state: Readonly<GameState>,
    localPlayerId: PlayerId,
    openingTrackId = TRACK_BY_MOOD.opening
  ): void {
    this.#localPlayerId = localPlayerId;
    this.#pendingMood = null;
    this.#pendingCount = 0;
    this.#dangerMemory = null;
    this.#comebackUntilTurn = 0;
    this.#lastAssessment = assessMatchMusic(state, localPlayerId);
    this.#transition("opening", openingTrackId);
    if (state.turnNumber > 1) {
      this.#transition(
        this.#lastAssessment.mood,
        TRACK_BY_MOOD[this.#lastAssessment.mood]
      );
    }
  }

  update(state: Readonly<GameState>): void {
    if (!this.#localPlayerId || state.phase === "finished") return;
    const assessment = assessMatchMusic(state, this.#localPlayerId);
    this.#lastAssessment = assessment;
    if (state.turnNumber <= 1 && this.#currentMood === "opening") return;
    if (
      assessment.mood === "critical" ||
      assessment.mood === "disadvantage"
    ) {
      this.#dangerMemory = assessment.mood;
    }
    const recoveredFromDanger =
      this.#dangerMemory !== null &&
      (
        assessment.mood === "advantage" ||
        assessment.mood === "dominant"
      ) &&
      assessment.localHp >= 2 &&
      assessment.localHandCount >= 2;
    if (recoveredFromDanger) {
      this.#dangerMemory = null;
      this.#comebackUntilTurn = state.turnNumber + 1;
      this.#pendingMood = null;
      this.#pendingCount = 0;
      this.#transition("comeback", TRACK_BY_MOOD.comeback);
      return;
    }
    if (
      this.#currentMood === "comeback" &&
      state.turnNumber <= this.#comebackUntilTurn &&
      assessment.mood !== "critical"
    ) {
      return;
    }
    if (assessment.mood === "critical") {
      this.#pendingMood = null;
      this.#pendingCount = 0;
      this.#transition("critical", TRACK_BY_MOOD.critical);
      return;
    }
    if (assessment.mood === this.#currentMood) {
      this.#pendingMood = null;
      this.#pendingCount = 0;
      return;
    }
    if (assessment.mood !== this.#pendingMood) {
      this.#pendingMood = assessment.mood;
      this.#pendingCount = 1;
      return;
    }
    this.#pendingCount += 1;
    if (this.#pendingCount >= 2) {
      this.#transition(assessment.mood, TRACK_BY_MOOD[assessment.mood]);
      this.#pendingMood = null;
      this.#pendingCount = 0;
    }
  }

  finish(outcome: "victory" | "defeat"): void {
    this.#pendingMood = null;
    this.#pendingCount = 0;
    this.#transition(outcome, TRACK_BY_MOOD[outcome]);
  }

  snapshot(): AdaptiveMusicSnapshot {
    return {
      currentMood: this.#currentMood,
      currentTrackId: this.#currentTrackId,
      pendingMood: this.#pendingMood,
      pendingCount: this.#pendingCount,
      dangerMemory: this.#dangerMemory,
      comebackUntilTurn: this.#comebackUntilTurn,
      lastAssessment: this.#lastAssessment
        ? { ...this.#lastAssessment }
        : null
    };
  }

  #transition(mood: MatchMusicMood, trackId: string): void {
    if (this.#currentMood === mood && this.#currentTrackId === trackId) return;
    this.#currentMood = mood;
    this.#currentTrackId = trackId;
    this.#transport.playMusic(trackId);
  }
}
