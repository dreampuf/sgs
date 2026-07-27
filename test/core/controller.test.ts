import { describe, expect, test, vi } from "vitest";
import {
  GameController,
  GameSession,
  STANDARD_CARD,
  createGameState,
  createStandardRegistry,
  handZone
} from "../../src/core";
import type { DomainEvent, GameViewModel, GameViewPort } from "../../src/core";

class FakeView implements GameViewPort {
  models: GameViewModel[] = [];
  played: DomainEvent[][] = [];

  apply(viewModel: GameViewModel): void {
    this.models.push(viewModel);
  }

  play(events: DomainEvent[]): void {
    this.played.push(events);
  }

  latest(): GameViewModel {
    return this.models.at(-1)!;
  }
}

function setup() {
  const registry = createStandardRegistry();
  const state = createGameState({
    seed: 11,
    players: [
      {
        id: "p1",
        heroDefinitionId: "hero:p1",
        maxHp: 4,
        hand: [
          STANDARD_CARD.slash,
          STANDARD_CARD.jink,
          STANDARD_CARD.peach
        ]
      },
      {
        id: "p2",
        heroDefinitionId: "hero:p2",
        maxHp: 4,
        hand: [STANDARD_CARD.jink]
      }
    ]
  });
  const session = new GameSession(state, registry);
  const view = new FakeView();
  const controller = new GameController(session, registry, "p1", view);
  return { registry, session, view, controller };
}

describe("UI controller boundary", () => {
  test("unusable cards are disabled before selection", () => {
    const { controller, session, view } = setup();
    controller.start();
    const state = session.state();
    const byDefinition = Object.fromEntries(
      view.latest().cards.map((interaction) => [
        state.cards[interaction.cardId]!.definitionId,
        interaction.enabled
      ])
    );
    expect(byDefinition).toEqual({
      [STANDARD_CARD.slash]: true,
      [STANDARD_CARD.jink]: false,
      [STANDARD_CARD.peach]: false
    });
  });

  test("selecting slash exposes only legal targets", () => {
    const { controller, session, view } = setup();
    controller.start();
    const slashId = session
      .state()
      .zones[handZone("p1")]!.find(
        (id) => session.state().cards[id]?.definitionId === STANDARD_CARD.slash
      )!;
    controller.selectCard(slashId);
    expect(view.latest().selectableTargetIds).toEqual(["p2"]);
  });

  test("confirmed card leaves hand before movement events are animated", async () => {
    const { controller, session, view } = setup();
    const applySpy = vi.spyOn(view, "apply");
    const playSpy = vi.spyOn(view, "play");
    controller.start();
    const slashId = session
      .state()
      .zones[handZone("p1")]!.find(
        (id) => session.state().cards[id]?.definitionId === STANDARD_CARD.slash
      )!;
    controller.selectCard(slashId);
    await controller.useSelectedCard(["p2"]);

    expect(view.latest().observation.ownHand.map((card) => card.id)).not.toContain(
      slashId
    );
    expect(view.played[0]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "CardMoved",
          cardId: slashId,
          reason: "use"
        }),
        expect.objectContaining({ type: "DecisionRequested" })
      ])
    );
    expect(applySpy.mock.invocationCallOrder.at(-1)).toBeLessThan(
      playSpy.mock.invocationCallOrder[0]!
    );
  });
});
