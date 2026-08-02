import type {
  CardInstanceId,
  DispatchResult,
  DomainEvent,
  GameState
} from "../core/types";

export interface AudioCue {
  id: string;
  eventSequence: number;
  eventType: DomainEvent["type"];
  dedupeKey: string;
}

export interface AudioSemanticResolver {
  cardDefinitionId(
    cardId: CardInstanceId,
    materialCardIds?: CardInstanceId[]
  ): string | undefined;
  cardCategory(
    cardId: CardInstanceId,
    materialCardIds?: CardInstanceId[]
  ): "basic" | "trick" | "equipment" | undefined;
}

const CARD_CUE: Readonly<Record<string, string>> = {
  "standard:slash": "card.slash",
  "standard:fire-slash": "card.fire-slash",
  "standard:thunder-slash": "card.thunder-slash",
  "standard:jink": "card.jink",
  "standard:peach": "card.peach",
  "standard:wine": "card.wine",
  "standard:duel": "card.duel",
  "standard:savage-assault": "card.savage-assault",
  "standard:archery-attack": "card.archery-attack",
  "standard:amazing-grace": "card.amazing-grace",
  "standard:nullification": "card.nullification",
  "standard:lightning": "card.lightning",
  "standard:fire-attack": "card.fire-attack",
  "standard:iron-chain": "card.iron-chain"
};

const RESPONSE_CUE: Readonly<Record<string, string>> = {
  slash: "card.slash",
  jink: "card.jink",
  nullification: "card.nullification",
  peach: "card.peach"
};

function cue(id: string, event: DomainEvent, suffix = ""): AudioCue {
  return {
    id,
    eventSequence: event.sequence,
    eventType: event.type,
    dedupeKey: `${event.sequence}:${id}${suffix}`
  };
}

/**
 * Pure DomainEvent -> audio cue contract.
 *
 * The returned sequence can be snapshot-tested or reconstructed from JSONL
 * without loading or playing a real audio file.
 */
export function deriveAudioCues(
  result: Pick<DispatchResult, "events">,
  _state: Readonly<GameState>,
  resolver: AudioSemanticResolver
): AudioCue[] {
  const cues: AudioCue[] = [];
  const movementCues = new Set<string>();
  for (const event of result.events) {
    if (event.type === "CardUsed") {
      if (
        resolver.cardCategory(event.cardId, event.materialCardIds) ===
          "equipment"
      ) {
        continue;
      }
      const definitionId = resolver.cardDefinitionId(
        event.cardId,
        event.materialCardIds
      );
      cues.push(cue(
        definitionId ? (CARD_CUE[definitionId] ?? "card.play") : "card.play",
        event
      ));
    } else if (event.type === "CardResponded") {
      cues.push(cue(RESPONSE_CUE[event.responseKind] ?? "card.play", event));
    } else if (event.type === "SkillActivated") {
      cues.push(cue("skill.activate", event));
    } else if (event.type === "DamageApplied") {
      cues.push(cue(
        event.nature === "fire"
          ? "combat.fire-damage"
          : event.nature === "thunder"
            ? "combat.thunder-damage"
            : "combat.damage",
        event,
        `:${event.targetId}`
      ));
    } else if (event.type === "HpLost") {
      cues.push(cue("combat.damage", event, `:${event.playerId}`));
    } else if (event.type === "HpRecovered") {
      cues.push(cue("combat.recover", event, `:${event.playerId}`));
    } else if (event.type === "EquipmentChanged") {
      cues.push(cue("card.equip", event, `:${event.playerId}`));
    } else if (event.type === "JudgmentRevealed") {
      cues.push(cue("system.judgment", event, `:${event.playerId}`));
    } else if (event.type === "PlayerDied") {
      cues.push(cue("combat.death", event, `:${event.playerId}`));
    } else if (
      event.type === "CardMoved" &&
      (
        event.reason === "draw" ||
        (
          event.reason === "discard" &&
          event.from.startsWith("zone:hand:")
        )
      )
    ) {
      const id = event.reason === "draw" ? "card.draw" : "card.discard";
      const playerZone = event.reason === "draw" ? event.to : event.from;
      const groupKey = `${event.revision}:${id}:${playerZone}`;
      if (!movementCues.has(groupKey)) {
        movementCues.add(groupKey);
        cues.push({
          ...cue(id, event),
          dedupeKey: groupKey
        });
      }
    }
  }
  return cues;
}
