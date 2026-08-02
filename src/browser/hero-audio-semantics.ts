import type {
  CardInstanceId,
  DispatchResult,
  DomainEvent,
  GameState,
  PlayerId
} from "../core/types";

export type HeroAudioCueKind = "skill" | "card" | "death" | "victory";

export interface HeroAudioCue {
  kind: HeroAudioCueKind;
  heroDefinitionId: string;
  playerId: PlayerId;
  eventSequence?: number | undefined;
  eventType?: DomainEvent["type"] | "GameResult" | undefined;
  skillId?: string | undefined;
  cardDefinitionId?: string | undefined;
  dedupeKey: string;
}

export interface HeroAudioSemanticResolver {
  cardDefinitionId(
    cardId: CardInstanceId,
    materialCardIds?: CardInstanceId[]
  ): string | undefined;
}

/**
 * Produces the replayable hero sound sequence without touching WebAudio.
 * Runtime catalog matching decides whether a skill/card is signature-worthy.
 */
export function deriveHeroAudioCues(
  result: Pick<DispatchResult, "events">,
  state: Readonly<GameState>,
  resolver: HeroAudioSemanticResolver
): HeroAudioCue[] {
  const cues: HeroAudioCue[] = [];
  const heroCue = (
    event: DomainEvent,
    playerId: PlayerId,
    kind: Exclude<HeroAudioCueKind, "victory">,
    details: Pick<HeroAudioCue, "skillId" | "cardDefinitionId"> = {}
  ) => {
    const heroDefinitionId = state.players[playerId]?.heroDefinitionId;
    if (!heroDefinitionId) return;
    cues.push({
      kind,
      heroDefinitionId,
      playerId,
      eventSequence: event.sequence,
      eventType: event.type,
      ...details,
      dedupeKey:
        `${event.sequence}:${kind}:${heroDefinitionId}:` +
        `${details.skillId ?? details.cardDefinitionId ?? playerId}`
    });
  };

  for (const event of result.events) {
    if (event.type === "SkillActivated") {
      heroCue(event, event.playerId, "skill", { skillId: event.skillId });
    } else if (
      event.type === "CardUsed" ||
      event.type === "CardResponded"
    ) {
      heroCue(event, event.playerId, "card", {
        skillId: event.skillId,
        cardDefinitionId: resolver.cardDefinitionId(
          event.cardId,
          event.materialCardIds
        )
      });
    } else if (event.type === "PlayerDied") {
      heroCue(event, event.playerId, "death");
    }
  }
  return cues;
}
