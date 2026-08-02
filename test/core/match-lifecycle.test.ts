import { describe, expect, test } from "vitest";
import { createGameState } from "../../src/core";
import {
  MatchPlayClock,
  createSavedMatch,
  parseSavedMatch,
  summarizeMatch
} from "../../src/session/match-lifecycle";

function finishedState() {
  const state = createGameState({
    seed: 88,
    currentPlayerId: "p1",
    phase: "action",
    players: [
      {
        id: "p1",
        identity: "lord",
        heroDefinitionId: "fixture:p1",
        maxHp: 4
      },
      {
        id: "p2",
        identity: "rebel",
        heroDefinitionId: "fixture:p2",
        maxHp: 4,
        hp: 0
      }
    ]
  });
  state.phase = "finished";
  state.turnNumber = 3;
  state.eventLog = [
    {
      type: "TurnStarted",
      sequence: 1,
      revision: 1,
      playerId: "p1",
      turnNumber: 3
    },
    {
      type: "CardUsed",
      sequence: 2,
      revision: 2,
      playerId: "p1",
      cardId: "card-1",
      targetIds: ["p2"]
    },
    {
      type: "DamageApplied",
      sequence: 3,
      revision: 2,
      sourceId: "p1",
      targetId: "p2",
      amount: 1,
      cardId: "card-1",
      nature: "normal"
    },
    {
      type: "PlayerDied",
      sequence: 4,
      revision: 2,
      playerId: "p2",
      sourceId: "p1"
    },
    {
      type: "GameEnded",
      sequence: 5,
      revision: 2,
      winnerIds: ["p1"]
    }
  ];
  return state;
}

describe("match lifecycle", () => {
  test("derives victory and per-player statistics from the event log", () => {
    const summary = summarizeMatch(finishedState(), "p1", 61_000);
    expect(summary).toMatchObject({
      outcome: "victory",
      winnerIds: ["p1"],
      turns: 3,
      durationMs: 61_000
    });
    expect(summary.players[0]).toMatchObject({
      playerId: "p1",
      cardsUsed: 1,
      damageDealt: 1,
      kills: 1
    });
    expect(summary.players[1]).toMatchObject({
      playerId: "p2",
      damageReceived: 1
    });
  });

  test("marks a local non-winner as defeated", () => {
    expect(summarizeMatch(finishedState(), "p2", 1).outcome)
      .toBe("defeat");
  });

  test("accumulates only active segments across save and restore", () => {
    const firstSession = new MatchPlayClock();
    firstSession.start(1_000);
    expect(firstSession.elapsed(6_000)).toBe(5_000);
    expect(firstSession.stop(8_000)).toBe(7_000);
    expect(firstSession.elapsed(3_608_000)).toBe(7_000);

    const restored = new MatchPlayClock(firstSession.elapsed(3_608_000));
    restored.start(10_000);
    expect(restored.stop(13_500)).toBe(10_500);
    expect(restored.running()).toBe(false);
  });

  test("round-trips a versioned Core snapshot save and rejects bad data", () => {
    const state = finishedState();
    const saved = createSavedMatch({
      startedAt: 10,
      activeDurationMs: 7,
      modeId: "story",
      expansionIds: ["wind"],
      aiLevel: 1,
      seed: 88,
      localPlayerId: "p1",
      players: [
        {
          id: "p1",
          nickname: "刘备",
          identity: 0,
          isAI: false,
          hero: {
            id: "standard:hero:liubei",
            name: "刘备",
            life: 4,
            country: "shu",
            skills: ["仁德", "激将"]
          }
        },
        {
          id: "p2",
          nickname: "张角",
          identity: 3,
          isAI: true,
          hero: {
            id: "standard:hero:zhangjiao",
            name: "张角",
            life: 3,
            country: "qun",
            skills: ["雷击"]
          }
        }
      ],
      snapshot: JSON.stringify(state)
    }, 20);
    expect(parseSavedMatch(JSON.stringify(saved))).toEqual(saved);
    const legacy = { ...saved } as Partial<typeof saved>;
    delete legacy.activeDurationMs;
    expect(parseSavedMatch(JSON.stringify(legacy)).activeDurationMs).toBe(10);
    expect(() => parseSavedMatch('{"schemaVersion":0}')).toThrow(
      "存档格式无效"
    );
  });

  test("refuses to build a result before the Core emits GameEnded", () => {
    const state = finishedState();
    state.eventLog = state.eventLog.filter(
      (event) => event.type !== "GameEnded"
    );
    expect(() => summarizeMatch(state, "p1", 1)).toThrow(
      "before GameEnded"
    );
  });
});
