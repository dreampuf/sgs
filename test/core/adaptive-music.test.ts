import { describe, expect, test } from "vitest";
import {
  AdaptiveMusicDirector,
  assessMatchMusic
} from "../../src/browser/adaptive-music";
import {
  createGameState,
  handZone
} from "../../src/core";
import type {
  GameState,
  PlayerId
} from "../../src/core";

function fixture(): GameState {
  const state = createGameState({
    seed: 20260730,
    currentPlayerId: "p1",
    players: [
      {
        id: "p1",
        identity: "lord",
        heroDefinitionId: "standard:hero:刘备",
        maxHp: 4
      },
      {
        id: "p2",
        identity: "loyalist",
        heroDefinitionId: "standard:hero:关羽",
        maxHp: 4
      },
      {
        id: "p3",
        identity: "rebel",
        heroDefinitionId: "standard:hero:曹操",
        maxHp: 4
      },
      {
        id: "p4",
        identity: "rebel",
        heroDefinitionId: "standard:hero:吕布",
        maxHp: 4
      }
    ]
  });
  for (const id of state.turnOrder) setHand(state, id, 3);
  return state;
}

function setHand(state: GameState, playerId: PlayerId, count: number): void {
  state.zones[handZone(playerId)] = Array.from(
    { length: count },
    (_, index) => `${playerId}:music-card:${index}`
  );
}

describe("adaptive match music", () => {
  test("distinguishes hand advantage, dominant lead, disadvantage and one HP", () => {
    const state = fixture();
    expect(assessMatchMusic(state, "p1").mood).toBe("battle");

    setHand(state, "p1", 6);
    expect(assessMatchMusic(state, "p1").mood).toBe("advantage");

    setHand(state, "p1", 9);
    setHand(state, "p2", 0);
    setHand(state, "p3", 0);
    setHand(state, "p4", 0);
    state.players.p3!.hp = 2;
    state.players.p4!.hp = 2;
    expect(assessMatchMusic(state, "p1").mood).toBe("dominant");

    const losing = fixture();
    setHand(losing, "p1", 0);
    losing.players.p1!.hp = 2;
    expect(assessMatchMusic(losing, "p1").mood).toBe("disadvantage");

    losing.players.p1!.hp = 1;
    expect(assessMatchMusic(losing, "p1").mood).toBe("critical");
  });

  test("uses hysteresis, enters critical immediately and recognizes comeback", () => {
    const played: string[] = [];
    const director = new AdaptiveMusicDirector({
      playMusic: (id) => played.push(id)
    });
    const state = fixture();
    director.start(state, "p1", "music.story.shu");
    expect(played).toEqual(["music.story.shu"]);

    state.turnNumber = 2;
    director.update(state);
    expect(played).toEqual(["music.story.shu"]);
    director.update(state);
    expect(played.at(-1)).toBe("music.battle");

    state.players.p1!.hp = 1;
    director.update(state);
    expect(played.at(-1)).toBe("music.critical");

    state.players.p1!.hp = 3;
    setHand(state, "p1", 6);
    director.update(state);
    expect(played.at(-1)).toBe("music.comeback");
    expect(director.snapshot()).toMatchObject({
      currentMood: "comeback",
      dangerMemory: null,
      comebackUntilTurn: 3
    });

    director.finish("victory");
    expect(played.at(-1)).toBe("music.victory");
  });

  test("restored games beyond the opening choose their current state immediately", () => {
    const played: string[] = [];
    const director = new AdaptiveMusicDirector({
      playMusic: (id) => played.push(id)
    });
    const state = fixture();
    state.turnNumber = 5;
    state.players.p1!.hp = 1;
    director.start(state, "p1");
    expect(played).toEqual(["music.opening", "music.critical"]);
  });
});
