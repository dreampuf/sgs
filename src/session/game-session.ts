import {
  cloneGameState,
  deserializeGameState,
  serializeGameState
} from "../core/state";
import { dispatch, getLegalActions } from "../core/engine";
import type { ContentRegistry } from "../core/registry";
import type {
  DispatchResult,
  GameCommand,
  GameState,
  LegalAction
} from "../core/types";

export type SessionSubscriber = (result: DispatchResult) => void;

export class GameSession {
  #state: GameState;
  readonly #registry: ContentRegistry;
  readonly #subscribers = new Set<SessionSubscriber>();

  constructor(initialState: GameState, registry: ContentRegistry) {
    this.#state = cloneGameState(initialState);
    this.#registry = registry;
  }

  state(): GameState {
    return cloneGameState(this.#state);
  }

  legalActions(): LegalAction[] {
    return getLegalActions(this.#state, this.#registry);
  }

  dispatch(command: GameCommand): DispatchResult {
    const result = dispatch(this.#state, command, this.#registry);
    this.#state = result.state;
    const safeResult: DispatchResult = {
      state: cloneGameState(result.state),
      events: structuredClone(result.events),
      pendingDecision: result.pendingDecision
        ? structuredClone(result.pendingDecision)
        : null
    };
    for (const subscriber of this.#subscribers) subscriber(safeResult);
    return safeResult;
  }

  subscribe(subscriber: SessionSubscriber): () => void {
    this.#subscribers.add(subscriber);
    return () => this.#subscribers.delete(subscriber);
  }

  snapshot(): string {
    return serializeGameState(this.#state);
  }

  static restore(serialized: string, registry: ContentRegistry): GameSession {
    return new GameSession(deserializeGameState(serialized), registry);
  }
}
