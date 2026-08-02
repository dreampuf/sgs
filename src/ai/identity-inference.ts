import type {
  Identity,
  PlayerId
} from "../core/types";
import { identityCounts } from "../core/match-setup";
import type {
  PlayerBehaviorEvent,
  PlayerObservation
} from "./observation";

export type IdentityProbability = Record<Identity, number>;

export interface IdentityBelief {
  playerId: PlayerId;
  probabilities: IdentityProbability;
  evidence: string[];
}

export interface IdentityInference {
  beliefs: IdentityBelief[];
  hostility: Record<PlayerId, Record<PlayerId, number>>;
}

function hiddenPrior(observation: PlayerObservation): IdentityProbability {
  const counts = { ...identityCounts(observation.players.length) };
  for (const player of observation.players) {
    if (player.identity) counts[player.identity] -= 1;
  }
  const total = counts.loyalist + counts.rebel + counts.renegade;
  return {
    lord: 0,
    loyalist: total > 0 ? counts.loyalist / total : 0,
    rebel: total > 0 ? counts.rebel / total : 0,
    renegade: total > 0 ? counts.renegade / total : 0
  };
}

function known(identity: Identity): IdentityProbability {
  return {
    lord: identity === "lord" ? 1 : 0,
    loyalist: identity === "loyalist" ? 1 : 0,
    rebel: identity === "rebel" ? 1 : 0,
    renegade: identity === "renegade" ? 1 : 0
  };
}

function softmax(scores: IdentityProbability): IdentityProbability {
  const identities: Identity[] = [
    "lord",
    "loyalist",
    "rebel",
    "renegade"
  ];
  const maximum = Math.max(...identities.map((id) => scores[id]));
  const weights = identities.map((id) => Math.exp(scores[id] - maximum));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(identities.map((identity, index) => [
    identity,
    weights[index]! / total
  ])) as unknown as IdentityProbability;
}

function updateEvidence(
  scores: Map<PlayerId, IdentityProbability>,
  evidence: Map<PlayerId, string[]>,
  playerId: PlayerId,
  changes: Partial<IdentityProbability>,
  reason: string
): void {
  const current = scores.get(playerId);
  if (!current) return;
  for (const [identity, change] of Object.entries(changes)) {
    current[identity as Identity] += change ?? 0;
  }
  evidence.get(playerId)?.push(reason);
}

function relation(
  hostility: Record<PlayerId, Record<PlayerId, number>>,
  sourceId: PlayerId,
  targetId: PlayerId,
  delta: number
): void {
  hostility[sourceId] ??= {};
  hostility[sourceId]![targetId] =
    (hostility[sourceId]![targetId] ?? 0) + delta;
}

function applyBehavior(
  event: PlayerBehaviorEvent,
  observation: PlayerObservation,
  scores: Map<PlayerId, IdentityProbability>,
  evidence: Map<PlayerId, string[]>,
  hostility: Record<PlayerId, Record<PlayerId, number>>
): void {
  if (event.type === "damage") {
    relation(hostility, event.sourceId, event.targetId, event.amount * 25);
    if (event.targetId === observation.selfId) {
      if (
        observation.selfIdentity === "lord" ||
        observation.selfIdentity === "loyalist"
      ) {
        updateEvidence(
          scores,
          evidence,
          event.sourceId,
          { rebel: event.amount * 1.5, loyalist: -event.amount },
          `damaged-${observation.selfIdentity}`
        );
      } else if (observation.selfIdentity === "rebel") {
        updateEvidence(
          scores,
          evidence,
          event.sourceId,
          { loyalist: event.amount * 1.2, rebel: -event.amount },
          "damaged-rebel"
        );
      }
    }
    const target = observation.players.find(
      (player) => player.id === event.targetId
    );
    if (target?.identity === "lord") {
      updateEvidence(
        scores,
        evidence,
        event.sourceId,
        {
          rebel: event.amount * 3,
          loyalist: -event.amount * 2,
          renegade: event.amount * 0.25
        },
        "damaged-lord"
      );
    }
    return;
  }

  if (event.sourceId) {
    relation(hostility, event.sourceId, event.targetId, -event.amount * 20);
  }
  const target = observation.players.find(
    (player) => player.id === event.targetId
  );
  if (event.sourceId && target?.identity === "lord") {
    updateEvidence(
      scores,
      evidence,
      event.sourceId,
      {
        loyalist: event.amount * 3,
        rebel: -event.amount * 2,
        renegade: event.amount * 0.2
      },
      "recovered-lord"
    );
  }
}

/**
 * Rebuilds identity beliefs from public history on every observation.
 * No hidden identity or private hand information is accepted by this reducer.
 */
export function inferIdentities(
  observation: PlayerObservation
): IdentityInference {
  const prior = hiddenPrior(observation);
  const scores = new Map<PlayerId, IdentityProbability>();
  const evidence = new Map<PlayerId, string[]>();
  const hostility: Record<PlayerId, Record<PlayerId, number>> = {};
  for (const player of observation.players) {
    evidence.set(player.id, []);
    if (player.identity) continue;
    scores.set(player.id, {
      lord: -100,
      // Keep a small uncertainty floor: scripted scenarios and incomplete
      // public evidence are not guaranteed to match the standard seat table.
      loyalist: Math.log(Math.max(prior.loyalist, 0.03)),
      rebel: Math.log(Math.max(prior.rebel, 0.03)),
      renegade: Math.log(Math.max(prior.renegade, 0.03))
    });
  }
  for (const event of observation.behaviorHistory) {
    applyBehavior(event, observation, scores, evidence, hostility);
  }
  return {
    beliefs: observation.players.map((player) => ({
      playerId: player.id,
      probabilities: player.identity
        ? known(player.identity)
        : softmax(scores.get(player.id)!),
      evidence: [...(evidence.get(player.id) ?? [])]
    })),
    hostility
  };
}

export function strategicIdentityTargetScore(
  observation: PlayerObservation,
  targetId: PlayerId
): number {
  if (targetId === observation.selfId) return 0;
  const inference = inferIdentities(observation);
  const belief = inference.beliefs.find(
    (candidate) => candidate.playerId === targetId
  )?.probabilities;
  const target = observation.players.find((player) => player.id === targetId);
  if (!belief || !target) return 0;
  const retaliation = Math.min(
    100,
    inference.hostility[targetId]?.[observation.selfId] ?? 0
  );
  if (
    observation.selfIdentity === "lord" ||
    observation.selfIdentity === "loyalist"
  ) {
    return belief.rebel * 220 + belief.renegade * 35 -
      belief.loyalist * 180 - belief.lord * 1_000 + retaliation;
  }
  if (observation.selfIdentity === "rebel") {
    return belief.lord * 260 + belief.loyalist * 150 -
      belief.rebel * 160 + retaliation;
  }
  if (observation.selfIdentity === "renegade") {
    const lord = observation.players.find(
      (player) => player.identity === "lord"
    );
    const alive = observation.players.filter((player) => player.alive);
    const rebelStrength = inference.beliefs
      .filter((candidate) =>
        alive.some((player) => player.id === candidate.playerId)
      )
      .reduce(
        (total, candidate) => total + candidate.probabilities.rebel,
        0
      );
    const loyalStrength = inference.beliefs
      .filter((candidate) =>
        alive.some((player) => player.id === candidate.playerId)
      )
      .reduce(
        (total, candidate) =>
          total +
          candidate.probabilities.loyalist +
          candidate.probabilities.lord,
        0
      );
    const largeTableRenegadeRule =
      identityCounts(observation.players.length).renegade > 1;
    if (
      belief.lord > 0.99 &&
      (lord?.hp ?? 0) <= 2 &&
      !(largeTableRenegadeRule && rebelStrength < 0.5)
    ) {
      return -400;
    }
    if (largeTableRenegadeRule && rebelStrength < 0.5) {
      return belief.lord * 300 + belief.loyalist * 120 -
        belief.renegade * 80;
    }
    return rebelStrength > loyalStrength
      ? belief.rebel * 120 - belief.lord * 250
      : (belief.loyalist + belief.lord) * 100 - belief.rebel * 30;
  }
  return retaliation;
}
