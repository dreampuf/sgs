import {
  JsonlReplayRecorder,
  STANDARD_CARD,
  GameSession,
  createGameState,
  createStandardRegistry,
  handZone,
  judgmentZone,
  standardHeroId,
  standardSkillId
} from "../../src/core";
import type {
  GameCommand,
  GameState,
  LegalAction
} from "../../src/core";

export async function recordGuanxingDelayedReplay(): Promise<
  JsonlReplayRecorder
> {
  const registry = createStandardRegistry();
  const state = createScenarioState();
  const recorder = new JsonlReplayRecorder(
    new GameSession(state, registry),
    registry,
    "诸葛亮观星后闪电不中且乐不思蜀生效"
  );

  const dispatch = async (
    select: (actions: LegalAction[]) => GameCommand | undefined
  ): Promise<void> => {
    const action = select(recorder.session().legalActions());
    if (!action) {
      throw new Error(
        `scenario command is unavailable in ${recorder.session().state().phase}`
      );
    }
    await recorder.dispatch(action);
  };
  const chooseOption = async (option: string): Promise<void> =>
    dispatch((actions) => actions.find(
      (action) => action.type === "choose-option" && action.option === option
    ));
  const chooseCard = async (cardId: string): Promise<void> =>
    dispatch((actions) => actions.find(
      (action) =>
        action.type === "choose-cards" &&
        action.cardIds.length === 1 &&
        action.cardIds[0] === cardId
    ));

  const draw = state.zones["zone:draw"]!;
  const lightningMissId = draw[0]!;
  const indulgenceMatchId = draw[1]!;

  await dispatch((actions) =>
    actions.find((action) => action.type === "end-turn")
  );
  await chooseOption("activate");
  await chooseOption("select");
  await chooseCard(lightningMissId);
  await chooseOption("select");
  await chooseCard(indulgenceMatchId);
  await chooseOption("finish");
  await dispatch((actions) =>
    actions.find((action) => action.type === "advance-phase")
  );
  while (recorder.session().state().pendingDecision) {
    await dispatch((actions) =>
      actions.find((action) => action.type === "pass")
    );
  }
  await dispatch((actions) =>
    actions.find((action) => action.type === "advance-phase")
  );

  return recorder;
}

function createScenarioState(): GameState {
  const state = createGameState({
    seed: 20260728,
    currentPlayerId: "p3",
    phase: "discard",
    players: [
      {
        id: "p1",
        heroDefinitionId: standardHeroId("诸葛亮"),
        maxHp: 3,
        skillIds: [standardSkillId("观星")],
        hand: [
          STANDARD_CARD.lightning,
          STANDARD_CARD.indulgence,
          STANDARD_CARD.slash,
          STANDARD_CARD.jink
        ]
      },
      {
        id: "p2",
        heroDefinitionId: standardHeroId("曹操"),
        maxHp: 4
      },
      {
        id: "p3",
        heroDefinitionId: standardHeroId("刘备"),
        maxHp: 4
      }
    ],
    drawPile: [
      { definitionId: STANDARD_CARD.peach, suit: "heart", rank: 1 },
      { definitionId: STANDARD_CARD.slash, suit: "spade", rank: 13 },
      { definitionId: STANDARD_CARD.jink, suit: "club", rank: 2 },
      { definitionId: STANDARD_CARD.wine, suit: "diamond", rank: 9 },
      { definitionId: STANDARD_CARD.peach, suit: "heart", rank: 8 }
    ]
  });
  const hand = state.zones[handZone("p1")]!;
  const lightningId = hand.find(
    (cardId) => state.cards[cardId]?.definitionId === STANDARD_CARD.lightning
  )!;
  const indulgenceId = hand.find(
    (cardId) => state.cards[cardId]?.definitionId === STANDARD_CARD.indulgence
  )!;
  state.zones[handZone("p1")] = hand.filter(
    (cardId) => cardId !== lightningId && cardId !== indulgenceId
  );
  state.zones[judgmentZone("p1")] = [lightningId, indulgenceId];
  state.cards[lightningId]!.sourcePlayerId = "p3";
  state.cards[indulgenceId]!.sourcePlayerId = "p3";
  return state;
}
