import { observeForPlayer } from "../ai/observation";
import type { ContentRegistry } from "../core/registry";
import type {
  CardInstanceId,
  DomainEvent,
  GameCommand,
  LegalAction,
  PlayerId
} from "../core/types";
import type { PlayerObservation } from "../ai/observation";
import type { GameSession } from "../session/game-session";

export interface CardInteraction {
  cardId: CardInstanceId;
  enabled: boolean;
  targetSets: PlayerId[][];
  responseDecisionId: string | null;
}

export interface GameViewModel {
  observation: PlayerObservation;
  cards: CardInteraction[];
  selectableTargetIds: PlayerId[];
}

export interface GameViewPort {
  apply(viewModel: GameViewModel): void;
  play(events: DomainEvent[]): void | Promise<void>;
}

export class GameController {
  readonly #session: GameSession;
  readonly #registry: ContentRegistry;
  readonly #playerId: PlayerId;
  readonly #view: GameViewPort;
  #selectedCardId: CardInstanceId | null = null;

  constructor(
    session: GameSession,
    registry: ContentRegistry,
    playerId: PlayerId,
    view: GameViewPort
  ) {
    this.#session = session;
    this.#registry = registry;
    this.#playerId = playerId;
    this.#view = view;
  }

  start(): void {
    this.#render();
  }

  selectCard(cardId: CardInstanceId | null): void {
    this.#selectedCardId = cardId;
    this.#render();
  }

  async useSelectedCard(targetIds: PlayerId[]): Promise<void> {
    if (!this.#selectedCardId) throw new Error("no card selected");
    const action = this.#legalActions().find(
      (
        candidate
      ): candidate is Extract<
        LegalAction,
        { type: "use-card" | "use-virtual-card" }
      > =>
        (candidate.type === "use-card" ||
          candidate.type === "use-virtual-card") &&
        (candidate.type === "use-card"
          ? candidate.cardId === this.#selectedCardId
          : candidate.materialCardIds.length === 1 &&
            candidate.materialCardIds[0] === this.#selectedCardId) &&
        JSON.stringify(candidate.targetIds) === JSON.stringify(targetIds)
    );
    if (!action) throw new Error("selected card and targets are not legal");
    await this.#submit(action);
  }

  async respond(cardId: CardInstanceId): Promise<void> {
    const action = this.#legalActions().find(
      (
        candidate
      ): candidate is Extract<
        LegalAction,
        { type: "respond-card" | "respond-virtual-card" }
      > =>
        (candidate.type === "respond-card" &&
          candidate.cardId === cardId) ||
        (candidate.type === "respond-virtual-card" &&
          candidate.materialCardIds.includes(cardId))
    );
    if (!action) throw new Error("card is not a legal response");
    await this.#submit(action);
  }

  async pass(): Promise<void> {
    const action = this.#legalActions().find(
      (candidate): candidate is Extract<LegalAction, { type: "pass" }> =>
        candidate.type === "pass"
    );
    if (!action) throw new Error("pass is not legal");
    await this.#submit(action);
  }

  async chooseCards(cardIds: CardInstanceId[]): Promise<void> {
    const action = this.#legalActions().find(
      (
        candidate
      ): candidate is Extract<LegalAction, { type: "choose-cards" }> =>
        candidate.type === "choose-cards" &&
        JSON.stringify(candidate.cardIds) === JSON.stringify(cardIds)
    );
    if (!action) throw new Error("selected cards are not legal");
    await this.#submit(action);
  }

  async endActionPhase(): Promise<void> {
    const action = this.#legalActions().find(
      (
        candidate
      ): candidate is Extract<LegalAction, { type: "end-action-phase" }> =>
        candidate.type === "end-action-phase"
    );
    if (!action) throw new Error("ending the action phase is not legal");
    await this.#submit(action);
  }

  #legalActions(): LegalAction[] {
    return observeForPlayer(
      this.#session.state(),
      this.#playerId,
      this.#registry
    ).legalActions;
  }

  #viewModel(): GameViewModel {
    const observation = observeForPlayer(
      this.#session.state(),
      this.#playerId,
      this.#registry
    );
    const useActions = observation.legalActions.filter(
      (
        action
      ): action is Extract<
        GameCommand,
        { type: "use-card" | "use-virtual-card" }
      > => action.type === "use-card" || action.type === "use-virtual-card"
    );
    const responseActions = observation.legalActions.filter(
      (
        action
      ): action is Extract<
        GameCommand,
        { type: "respond-card" | "respond-virtual-card" }
      > =>
        action.type === "respond-card" ||
        action.type === "respond-virtual-card"
    );
    const cards = observation.ownHand.map((card) => {
      const uses = useActions.filter((action) =>
        action.type === "use-card"
          ? action.cardId === card.id
          : action.materialCardIds.length === 1 &&
            action.materialCardIds[0] === card.id
      );
      const response = responseActions.find((action) =>
        action.type === "respond-card"
          ? action.cardId === card.id
          : action.materialCardIds.includes(card.id)
      );
      return {
        cardId: card.id,
        enabled: uses.length > 0 || response !== undefined,
        targetSets: uses.map((action) => [...action.targetIds]),
        responseDecisionId: response?.decisionId ?? null
      };
    });
    const selectableTargetIds = [
      ...new Set(
        cards
          .filter((card) => card.cardId === this.#selectedCardId)
          .flatMap((card) => card.targetSets.flat())
      )
    ];
    return { observation, cards, selectableTargetIds };
  }

  #render(): void {
    this.#view.apply(this.#viewModel());
  }

  async #submit(command: GameCommand): Promise<void> {
    const result = this.#session.dispatch(command);
    this.#selectedCardId = null;
    this.#render();
    await this.#view.play(result.events);
  }
}
