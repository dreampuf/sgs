import { expect, test } from "vitest";
import {
  DISCARD_PILE,
  STANDARD_CARD,
  createStandardRegistry,
  handZone,
  judgmentZone,
  verifyReplayJsonl
} from "../../src/core";
import { recordGuanxingDelayedReplay } from "./guanxing-delayed-replay";

test("JSONL replay locks Guanxing plus Lightning and Indulgence sequencing", async () => {
  const recorder = await recordGuanxingDelayedReplay();
  const jsonl = recorder.jsonl();
  await expect(jsonl).toMatchFileSnapshot(
    "../replays/guanxing-lightning-indulgence.jsonl"
  );
  const replayed = await verifyReplayJsonl(jsonl, createStandardRegistry());
  const state = replayed.state();

  expect(state.phase).toBe("discard");
  expect(state.currentPlayerId).toBe("p1");
  expect(state.players.p1?.marks.skipAction).toBe(false);
  expect(state.zones[judgmentZone("p2")]?.map(
    (cardId) => state.cards[cardId]?.definitionId
  )).toContain(STANDARD_CARD.lightning);
  expect(state.zones[DISCARD_PILE]?.map(
    (cardId) => state.cards[cardId]?.definitionId
  )).toContain(STANDARD_CARD.indulgence);
  expect(state.zones[handZone("p1")]).toHaveLength(4);
  expect(state.eventLog.filter(
    (event) => event.type === "JudgmentResolved"
  ).map((event) => event.matched)).toEqual([false, true]);
  expect(replayed.legalActions().every(
    (action) =>
      action.type === "discard-cards" || action.type === "end-turn"
  )).toBe(true);
});
