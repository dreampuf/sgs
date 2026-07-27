import { observeForPlayer, type GameAgent } from "./observation";
import type { ContentRegistry } from "../core/registry";
import type {
  GameState,
  LegalAction,
  PlayerId
} from "../core/types";
import type { GameSession } from "../session/game-session";

export interface SelfPlayStep {
  index: number;
  playerId: PlayerId;
  revision: number;
  action: LegalAction;
}

export interface SelfPlayResult {
  state: GameState;
  steps: SelfPlayStep[];
  terminated: boolean;
  reason: "finished" | "step-limit";
}

function actionKey(action: LegalAction): string {
  return JSON.stringify(action);
}

export class SelfPlayRunner {
  readonly #session: GameSession;
  readonly #registry: ContentRegistry;
  readonly #agents: ReadonlyMap<PlayerId, GameAgent>;

  constructor(
    session: GameSession,
    registry: ContentRegistry,
    agents: ReadonlyMap<PlayerId, GameAgent>
  ) {
    this.#session = session;
    this.#registry = registry;
    this.#agents = agents;
  }

  step(index = 0): SelfPlayStep | null {
    const state = this.#session.state();
    if (state.phase === "finished") return null;
    const playerId =
      state.pendingDecision?.request.playerId ?? state.currentPlayerId;
    const agent = this.#agents.get(playerId);
    if (!agent) throw new Error(`missing self-play agent: ${playerId}`);
    const observation = observeForPlayer(state, playerId, this.#registry);
    const action = agent.chooseAction(structuredClone(observation));
    if (
      !observation.legalActions.some(
        (candidate) => actionKey(candidate) === actionKey(action)
      )
    ) {
      throw new Error(
        `agent ${playerId} returned an illegal action: ${actionKey(action)}`
      );
    }
    this.#session.dispatch(action);
    return {
      index,
      playerId,
      revision: state.revision,
      action: structuredClone(action)
    };
  }

  run(maxSteps = 10_000): SelfPlayResult {
    const steps: SelfPlayStep[] = [];
    while (steps.length < maxSteps) {
      const step = this.step(steps.length);
      if (!step) {
        return {
          state: this.#session.state(),
          steps,
          terminated: true,
          reason: "finished"
        };
      }
      steps.push(step);
    }
    return {
      state: this.#session.state(),
      steps,
      terminated: false,
      reason: "step-limit"
    };
  }
}
