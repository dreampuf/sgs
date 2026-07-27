import {
  createEarlyExpansionRegistry,
  createGameState,
  dispatch,
  equipmentZone,
  handZone,
  judgmentZone,
  shuffle
} from "../core";
import type {
  CardInstanceId,
  CardSpec,
  DispatchResult,
  EarlyExpansionId,
  GameCommand,
  GameState,
  LegalAction,
  PlayerId
} from "../core";
import { GameSession } from "../session/game-session";
import {
  observeForPlayer,
  PolicySearchAgent
} from "../core";

interface LegacyHero {
  name: string;
  life: number;
}

interface LegacyCard {
  name: string;
  definitionId?: string;
  color: number;
  digit: string | number;
  selected?: boolean;
  coreCardId?: CardInstanceId;
}

interface LegacyPlayer {
  id: PlayerId;
  nickname: string;
  identity: number;
  hero: LegacyHero;
  isAI: boolean;
  card: LegacyCard[];
  equip: Array<LegacyCard | undefined>;
  be_decision: unknown[];
  status: Record<string, unknown>;
  blood: number;
  maxBlood: number;
  stage?: number;
  choice_card(): void;
  ask_card(option: unknown): void;
}

interface LegacyOperate {
  id: string;
  source: LegacyPlayer;
  target?: LegacyPlayer | LegacyPlayer[];
  data?: LegacyCard | LegacyCard[] | string;
}

interface LegacySgs {
  Card: new (
    name: string,
    color: number,
    digit: string | number
  ) => LegacyCard;
  EXPANSION_PACKS?: Record<string, { enabled?: boolean }>;
  EQUIP_TYPE_MAPPING: Record<string, number>;
  Operate: new (
    id: string,
    source: LegacyPlayer,
    target?: LegacyPlayer | LegacyPlayer[],
    data?: unknown
  ) => LegacyOperate;
  view: {
    playerElement(player: LegacyPlayer): HTMLElement | undefined;
  };
  interface: {
    Show_CardChooseBox(
      title: string,
      cards: LegacyCard[],
      identityInfo?: string
    ): void;
    Show_OptionChooseBox(title: string, options: string[]): void;
    Show_PlayerChooseBox(
      title: string,
      options: Array<{ label: string; value: string }>
    ): void;
  };
}

type Listener = (...args: unknown[]) => void;

const PHASE_STEP: Record<GameState["phase"], number> = {
  judgment: 0,
  draw: 1,
  action: 2,
  discard: 3,
  finished: 4
};

const RESPONSE_NAME = {
  slash: "杀",
  jink: "闪",
  nullification: "无懈可击",
  peach: "桃"
} as const;

function legacySgs(): LegacySgs {
  return (window as unknown as { sgs: LegacySgs }).sgs;
}

function selectedExpansionIds(sgs: LegacySgs): EarlyExpansionId[] {
  return (["wind", "military", "fire", "forest"] as const).filter(
    (id) => sgs.EXPANSION_PACKS?.[id]?.enabled === true
  );
}

function cardSpec(card: LegacyCard): CardSpec {
  const definitionId = card.definitionId;
  if (!definitionId) {
    throw new Error(`Core content pack does not define card: ${card.name}`);
  }
  const rankNames: Record<string, number> = {
    A: 1,
    J: 11,
    Q: 12,
    K: 13
  };
  const rankText = String(card.digit).toUpperCase();
  const rank = rankNames[rankText] ?? Number(rankText);
  const suits = ["diamond", "heart", "club", "spade"] as const;
  const suit = suits[card.color];
  if (!suit || !Number.isInteger(rank) || rank < 1 || rank > 13) {
    throw new Error(
      `invalid legacy card suit/rank: ${card.name} ${card.color}/${card.digit}`
    );
  }
  return { definitionId, suit, rank };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export class CoreBoutAdapter {
  readonly engine = "core";
  session: GameSession;
  readonly player: LegacyPlayer[];
  readonly playerlen: number;
  readonly ailv: number;
  readonly #registry: ReturnType<typeof createEarlyExpansionRegistry>;
  readonly #listeners = new Map<string, Listener[]>();
  readonly #legacyCardById = new Map<CardInstanceId, LegacyCard>();
  readonly #cardIdByLegacyCard = new WeakMap<LegacyCard, CardInstanceId>();
  readonly #playerById = new Map<PlayerId, LegacyPlayer>();
  readonly #aiAgent = new PolicySearchAgent();
  #advanceTimer: number | null = null;
  #paused = false;
  #shownDecisionId: string | null = null;

  curplayer = 0;
  step = 0;
  timer = 0;
  choice: LegacyOperate[] = [];
  card: LegacyCard[] = [];
  discardPile: LegacyCard[] = [];

  contentManifest() {
    return {
      packs: this.#registry.packs(),
      cardPrintCount: this.#registry.cardPrints().length,
      heroes: this.#registry.heroes().map((hero) => ({
        id: hero.id,
        name: hero.name,
        skillIds: [...hero.skillIds],
        implementation: hero.implementation
      }))
    };
  }

  constructor(players: LegacyPlayer[], aiLevel: number, seed: number) {
    const expansionIds = selectedExpansionIds(legacySgs());
    this.#registry = createEarlyExpansionRegistry(expansionIds);
    const kingIndex = players.findIndex((player) => player.identity === 0);
    const rotation = kingIndex < 0 ? 0 : kingIndex;
    this.player = [
      ...players.slice(rotation),
      ...players.slice(0, rotation)
    ];
    this.playerlen = this.player.length;
    this.ailv = aiLevel;
    for (const player of this.player) this.#playerById.set(player.id, player);

    const suits = ["diamond", "heart", "club", "spade"] as const;
    const deck = this.#registry.cardPrints().map((print) => {
      const definition = this.#registry.card(print.definitionId);
      const card = new (legacySgs().Card)(
        definition.name,
        suits.indexOf(print.suit ?? "diamond"),
        print.rank ?? 1
      );
      card.definitionId = print.definitionId;
      return card;
    });
    if (deck.length === 0) {
      throw new Error("selected content packs do not provide a card deck");
    }
    const shuffled = shuffle(deck, seed);
    const hands = new Map<PlayerId, LegacyCard[]>();
    for (const player of this.player) {
      hands.set(player.id, shuffled.items.splice(0, 4));
    }
    const initial = createGameState({
      gameId: `browser-game-${seed}`,
      rulesetId: [
        "standard-rules@0.1.0",
        ...expansionIds
      ].join("+"),
      seed,
      currentPlayerId: this.player[0]!.id,
      phase: "judgment",
      players: this.player.map((player, index) => {
        const hero = this.#registry.heroes().find(
          (definition) => definition.name === player.hero.name
        );
        if (!hero) {
          throw new Error(
            `selected content packs do not define hero: ${player.hero.name}`
          );
        }
        const lordBonus = index === 0 && this.player.length >= 4 ? 1 : 0;
        player.maxBlood = player.hero.life + lordBonus;
        player.blood = player.maxBlood;
        return {
          id: player.id,
          heroDefinitionId: hero.id,
          maxHp: player.maxBlood,
          skillIds: [...hero.skillIds],
          hand: (hands.get(player.id) ?? []).map(cardSpec)
        };
      }),
      drawPile: shuffled.items.map(cardSpec)
    });
    initial.rngState = shuffled.state;

    let nextCardSequence = 1;
    for (const player of this.player) {
      const legacyHand = hands.get(player.id) ?? [];
      for (const legacyCard of legacyHand) {
        this.#bindCard(`card-${nextCardSequence++}`, legacyCard);
      }
    }
    for (const legacyCard of shuffled.items) {
      this.#bindCard(`card-${nextCardSequence++}`, legacyCard);
    }

    this.session = new GameSession(initial, this.#registry);
    this.#syncProjection();
    this.#scheduleAdvance(250);
  }

  attach(eventType: string, listener: Listener): void {
    const listeners = this.#listeners.get(eventType) ?? [];
    listeners.push(listener);
    this.#listeners.set(eventType, listeners);
  }

  notify(eventType: string, ...args: unknown[]): void {
    for (const listener of this.#listeners.get(eventType) ?? []) {
      listener(...args);
    }
  }

  continue(): void {
    this.#scheduleAdvance(0);
  }

  pause(): void {
    this.#paused = true;
    if (this.#advanceTimer !== null) window.clearTimeout(this.#advanceTimer);
    this.#advanceTimer = null;
  }

  resume(): void {
    this.#paused = false;
    this.#scheduleAdvance(0);
  }

  state(): GameState {
    return this.session.state();
  }

  legalActions(): LegalAction[] {
    return this.session.legalActions();
  }

  dispatchCommand(command: GameCommand, schedule = false): DispatchResult {
    return this.#submit(command, schedule);
  }

  restoreSnapshot(serialized: string): void {
    this.pause();
    this.session = GameSession.restore(serialized, this.#registry);
    this.#syncProjection();
  }

  isLegalResponseCard(card: LegacyCard): boolean {
    const cardId = this.#cardIdByLegacyCard.get(card);
    return cardId !== undefined && this.session.legalActions().some(
      (action) =>
        (action.type === "respond-card" && action.cardId === cardId) ||
        (action.type === "respond-virtual-card" &&
          action.materialCardIds.includes(cardId))
    );
  }

  select_card(option: LegacyOperate): [LegacyPlayer[], number, number] {
    const card = option.data;
    if (!card || typeof card === "string" || Array.isArray(card)) {
      return [[], -1, -1];
    }
    const cardId = this.#cardIdByLegacyCard.get(card);
    if (!cardId) return [[], -1, -1];
    const actions = this.session.legalActions().filter(
      (
        action
      ): action is Extract<
        LegalAction,
        { type: "use-card" | "use-virtual-card" }
      > =>
        action.playerId === option.source.id &&
        (
          (action.type === "use-card" && action.cardId === cardId) ||
          (action.type === "use-virtual-card" &&
            action.materialCardIds.includes(cardId))
        )
    );
    if (actions.length === 0) return [[], -1, -1];
    const targetSets = actions.map((action) => action.targetIds);
    const targetIds = unique(targetSets.flat());
    return [
      targetIds
        .map((id) => this.#playerById.get(id))
        .filter((player): player is LegacyPlayer => player !== undefined),
      Math.max(...targetSets.map((targets) => targets.length)),
      Math.min(...targetSets.map((targets) => targets.length))
    ];
  }

  choice_card(option: LegacyOperate): void {
    const card = option.data;
    if (!card || typeof card === "string" || Array.isArray(card)) {
      throw new Error("Core card use requires one physical card");
    }
    const cardId = this.#cardIdByLegacyCard.get(card);
    if (!cardId) throw new Error("legacy card is not bound to Core");
    const targets = option.target === undefined
      ? []
      : Array.isArray(option.target)
        ? option.target
        : [option.target];
    const selectedTargetIds = targets.map((target) => target.id);
    const candidates = this.session.legalActions().filter(
      (
        action
      ): action is Extract<
        LegalAction,
        { type: "use-card" | "use-virtual-card" }
      > =>
        (action.type === "use-card" && action.cardId === cardId) ||
        (action.type === "use-virtual-card" &&
          action.materialCardIds.includes(cardId))
    );
    const definitionId = this.session.state().cards[cardId]?.definitionId;
    const orderMatters = definitionId !== undefined &&
      this.#registry.card(definitionId).target.type === "ordered";
    const sameTargets = (
      actionTargetIds: PlayerId[],
      selectedIds: PlayerId[]
    ): boolean =>
      actionTargetIds.length === selectedIds.length &&
      (
        orderMatters
          ? actionTargetIds.every(
              (targetId, index) => targetId === selectedIds[index]
            )
          : actionTargetIds.every((targetId) =>
              selectedIds.includes(targetId)
            )
      );
    const command = candidates.find(
      (action) => sameTargets(action.targetIds, selectedTargetIds)
    );
    if (!command) throw new Error("selected card targets are not legal");
    this.#submit(command);
  }

  response_card(option: LegacyOperate): void {
    const card = option.data;
    const legal = this.session.legalActions();
    let command: GameCommand | undefined;
    if (card && typeof card !== "string" && !Array.isArray(card)) {
      const cardId = this.#cardIdByLegacyCard.get(card);
      command = legal.find(
        (
          action
        ): action is Extract<
          LegalAction,
          { type: "respond-card" | "respond-virtual-card" }
        > =>
          (action.type === "respond-card" && action.cardId === cardId) ||
          (action.type === "respond-virtual-card" &&
            action.materialCardIds.includes(cardId!))
      );
    } else {
      command = legal.find(
        (action): action is Extract<LegalAction, { type: "pass" }> =>
          action.type === "pass"
      );
    }
    if (!command) throw new Error("response is not legal");
    this.#submit(command);
  }

  choose_card(card: LegacyCard): void {
    const cardId = this.#cardIdByLegacyCard.get(card);
    const command = this.session.legalActions().find(
      (
        action
      ): action is Extract<LegalAction, { type: "choose-cards" }> =>
        action.type === "choose-cards" &&
        cardId !== undefined &&
        action.cardIds.includes(cardId)
    );
    if (!command) throw new Error("selected choice card is not legal");
    this.#shownDecisionId = null;
    this.#submit(command);
  }

  choose_option(option: string): void {
    const command = this.session.legalActions().find(
      (
        action
      ): action is Extract<LegalAction, { type: "choose-option" }> =>
        action.type === "choose-option" && action.option === option
    );
    if (!command) throw new Error("selected option is not legal");
    this.#shownDecisionId = null;
    this.#submit(command);
  }

  choose_players(value: string): void {
    const playerIds = JSON.parse(value) as PlayerId[];
    const command = this.session.legalActions().find(
      (
        action
      ): action is Extract<LegalAction, { type: "choose-players" }> =>
        action.type === "choose-players" &&
        JSON.stringify(action.playerIds) === JSON.stringify(playerIds)
    );
    if (!command) throw new Error("selected players are not legal");
    this.#shownDecisionId = null;
    this.#submit(command);
  }

  discard(option?: LegacyOperate): void {
    let state = this.session.state();
    if (state.phase === "action") {
      const endAction = this.session.legalActions().find(
        (
          action
        ): action is Extract<LegalAction, { type: "end-action-phase" }> =>
          action.type === "end-action-phase"
      );
      if (!endAction) throw new Error("cannot end action phase");
      this.#submit(endAction, false);
      state = this.session.state();
    }
    const selected = Array.isArray(option?.data)
      ? option.data
          .map((card) => this.#cardIdByLegacyCard.get(card))
          .filter((id): id is CardInstanceId => id !== undefined)
      : [];
    const legal = this.session.legalActions();
    const command = legal.find((action) =>
      action.type === "discard-cards"
        ? JSON.stringify(action.cardIds) === JSON.stringify(selected)
        : action.type === "end-turn" && selected.length === 0
    );
    if (!command) throw new Error("discard selection is not legal");
    this.#submit(command);
  }

  #bindCard(cardId: CardInstanceId, legacyCard: LegacyCard): void {
    legacyCard.coreCardId = cardId;
    this.#legacyCardById.set(cardId, legacyCard);
    this.#cardIdByLegacyCard.set(legacyCard, cardId);
  }

  #submit(command: GameCommand, schedule = true): DispatchResult {
    const result = this.session.dispatch(command);
    this.#syncProjection();
    this.#playEvents(result);
    if (schedule) this.#scheduleAdvance(20);
    return result;
  }

  #syncProjection(): void {
    const state = this.session.state();
    const suitIndex = {
      diamond: 0,
      heart: 1,
      club: 2,
      spade: 3
    } as const;
    for (const [cardId, card] of Object.entries(state.cards)) {
      const legacyCard = this.#legacyCardById.get(cardId);
      if (!legacyCard || !this.#registry.hasCard(card.definitionId)) continue;
      legacyCard.name = this.#registry.card(card.definitionId).name;
      if (card.suit !== undefined) legacyCard.color = suitIndex[card.suit];
      if (card.rank !== undefined) legacyCard.digit = card.rank;
    }
    this.curplayer = Math.max(
      0,
      this.player.findIndex((player) => player.id === state.currentPlayerId)
    );
    this.step = PHASE_STEP[state.phase];
    this.card = (state.zones["zone:draw"] ?? [])
      .map((id) => this.#legacyCardById.get(id))
      .filter((card): card is LegacyCard => card !== undefined);
    this.discardPile = (state.zones["zone:discard"] ?? [])
      .map((id) => this.#legacyCardById.get(id))
      .filter((card): card is LegacyCard => card !== undefined);
    for (const player of this.player) {
      const corePlayer = state.players[player.id]!;
      player.blood = corePlayer.hp;
      player.maxBlood = corePlayer.maxHp;
      player.card = (state.zones[handZone(player.id)] ?? [])
        .map((id) => this.#legacyCardById.get(id))
        .filter((card): card is LegacyCard => card !== undefined);
      player.equip = [];
      for (const cardId of state.zones[equipmentZone(player.id)] ?? []) {
        const legacyCard = this.#legacyCardById.get(cardId);
        if (!legacyCard) continue;
        const slot = legacySgs().EQUIP_TYPE_MAPPING[legacyCard.name];
        if (slot !== undefined) player.equip[slot] = legacyCard;
      }
      player.status = {
        chained: corePlayer.marks.chained === true,
        lebusishu: corePlayer.marks.skipAction === true,
        bingliang: corePlayer.marks.skipDraw === true,
        dead: !corePlayer.alive
      };
      player.be_decision = (state.zones[judgmentZone(player.id)] ?? [])
        .map((id) => this.#legacyCardById.get(id))
        .filter((card): card is LegacyCard => card !== undefined);
      const playerElement = legacySgs().view.playerElement(player);
      if (playerElement) {
        const count = playerElement.querySelector(".card_count span");
        if (count) count.textContent = String(player.card.length);
      }
    }
    this.#syncChoice(state);
  }

  #syncChoice(state: GameState): void {
    const pending = state.pendingDecision?.request;
    if (!pending) {
      this.choice = [];
      this.#shownDecisionId = null;
      return;
    }
    const player = this.#playerById.get(pending.playerId)!;
    const source = this.#playerById.get(state.currentPlayerId) ?? player;
    const data = pending.type === "respond-card"
      ? RESPONSE_NAME[pending.responseKind]
      : "选择牌";
    this.choice = [
      new (legacySgs().Operate)(pending.id, source, player, data)
    ];
  }

  #playEvents(result: DispatchResult): void {
    const drawn = new Map<PlayerId, LegacyCard[]>();
    for (const event of result.events) {
      if (
        event.type === "CardMoved" &&
        event.reason === "draw" &&
        event.to.startsWith("zone:hand:")
      ) {
        const playerId = event.to.slice("zone:hand:".length);
        const card = this.#legacyCardById.get(event.cardId);
        if (card) drawn.set(playerId, [...(drawn.get(playerId) ?? []), card]);
      } else if (event.type === "CardUsed") {
        const source = this.#playerById.get(event.playerId)!;
        const targets = event.targetIds.map((id) => this.#playerById.get(id)!);
        const card = this.#legacyCardById.get(event.cardId) ??
          (event.materialCardIds
            ? this.#legacyCardById.get(event.materialCardIds[0]!)
            : undefined);
        if (card) this.notify(
          "choice_card",
          source,
          targets.length === 1 ? targets[0] : targets,
          card
        );
      } else if (event.type === "CardResponded") {
        const player = this.#playerById.get(event.playerId)!;
        const card = this.#legacyCardById.get(event.cardId) ??
          (event.materialCardIds
            ? this.#legacyCardById.get(event.materialCardIds[0]!)
            : undefined);
        if (card) this.notify("response_card", player, player, card);
      } else if (event.type === "DamageApplied") {
        const source = this.#playerById.get(event.sourceId);
        const target = this.#playerById.get(event.targetId);
        const card = this.#legacyCardById.get(event.cardId);
        if (source && target && card) this.notify("apply_card", source, target, card);
      } else if (event.type === "HpRecovered") {
        const player = this.#playerById.get(event.playerId);
        if (player) this.notify("apply_card", player, player, { name: "桃" });
      } else if (event.type === "EquipmentChanged") {
        const player = this.#playerById.get(event.playerId)!;
        if (event.replacedCardId) {
          const replaced = this.#legacyCardById.get(event.replacedCardId);
          if (replaced) {
            this.notify(
              "equip_off",
              player,
              replaced,
              legacySgs().EQUIP_TYPE_MAPPING[replaced.name]
            );
          }
        }
        const equipped = this.#legacyCardById.get(event.equippedCardId);
        if (equipped) this.notify("equip_on", player, equipped);
      } else if (event.type === "DelayedCardPlaced") {
        const player = this.#playerById.get(event.playerId)!;
        const card = this.#legacyCardById.get(event.cardId);
        if (card) this.notify("delayed_on", player, card);
      } else if (
        event.type === "CardMoved" &&
        event.from.startsWith("zone:judgment:")
      ) {
        const playerId = event.from.slice("zone:judgment:".length);
        const player = this.#playerById.get(playerId);
        const card = this.#legacyCardById.get(event.cardId);
        if (player && card) {
          this.notify("delayed_off", player, card, event.reason);
        }
      } else if (
        event.type === "CardCancelled" &&
        event.reason === "nullification"
      ) {
        const used = [...this.session.state().eventLog].reverse().find(
          (candidate) =>
            candidate.type === "CardUsed" &&
            candidate.cardId === event.cardId
        );
        const source = used?.type === "CardUsed"
          ? this.#playerById.get(used.playerId)
          : undefined;
        const targets = used?.type === "CardUsed"
          ? used.targetIds
              .map((id) => this.#playerById.get(id))
              .filter((player): player is LegacyPlayer =>
                player !== undefined
              )
          : [];
        const card = this.#legacyCardById.get(event.cardId);
        if (source) this.notify("nullified", source, targets, card);
      } else if (event.type === "ChainChanged") {
        const player = this.#playerById.get(event.playerId)!;
        this.notify("status_change", player, "chained", event.chained);
      } else if (event.type === "JudgmentRevealed") {
        const player = this.#playerById.get(event.playerId)!;
        const card = this.#legacyCardById.get(event.judgmentCardId);
        if (card) this.notify("judge_card", player, card);
      } else if (event.type === "CardRevealed") {
        const player = this.#playerById.get(event.playerId)!;
        const card = this.#legacyCardById.get(event.cardId);
        if (card) this.notify("show_card", player, card);
      } else if (event.type === "PlayerDied") {
        const player = this.#playerById.get(event.playerId)!;
        const killer = event.sourceId
          ? this.#playerById.get(event.sourceId)
          : undefined;
        this.notify("death", player, killer);
      } else if (
        event.type === "CardMoved" &&
        event.reason === "discard" &&
        event.from.startsWith("zone:hand:")
      ) {
        const playerId = event.from.slice("zone:hand:".length);
        const player = this.#playerById.get(playerId);
        const card = this.#legacyCardById.get(event.cardId);
        if (player && card) this.notify("discard", player, [card]);
      }
    }
    for (const [playerId, cards] of drawn) {
      const player = this.#playerById.get(playerId);
      if (player) this.notify("get_card", player, cards);
    }
  }

  #scheduleAdvance(delay: number): void {
    if (this.#paused || this.#advanceTimer !== null) return;
    this.#advanceTimer = window.setTimeout(() => {
      this.#advanceTimer = null;
      this.#advance();
    }, delay);
  }

  #advance(): void {
    if (this.#paused) return;
    const state = this.session.state();
    if (state.phase === "finished") return;
    const pending = state.pendingDecision?.request;
    if (pending) {
      const player = this.#playerById.get(pending.playerId)!;
      const legal = this.session.legalActions();
      if (!player.isAI) {
        if (pending.type === "respond-card") {
          player.ask_card(this.choice[0]);
          return;
        }
        if (pending.type === "choose-option") {
          if (this.#shownDecisionId !== pending.id) {
            this.#shownDecisionId = pending.id;
            legacySgs().interface.Show_OptionChooseBox(
              pending.reason,
              pending.options
            );
          }
          return;
        }
        if (pending.type === "select-players") {
          if (this.#shownDecisionId !== pending.id) {
            this.#shownDecisionId = pending.id;
            const options = legal
              .filter((
                action
              ): action is Extract<LegalAction, { type: "choose-players" }> =>
                action.type === "choose-players"
              )
              .map((action) => ({
                label: action.playerIds.length === 0
                  ? "不发动"
                  : action.playerIds.map((id) =>
                      this.#playerById.get(id)?.hero.name ?? id
                    ).join("、"),
                value: JSON.stringify(action.playerIds)
              }));
            legacySgs().interface.Show_PlayerChooseBox(
              pending.reason,
              options
            );
          }
          return;
        }
        if (this.#shownDecisionId !== pending.id) {
          const cards = pending.selectableCardIds
            .map((cardId) => this.#legacyCardById.get(cardId))
            .filter((card): card is LegacyCard => card !== undefined);
          this.#shownDecisionId = pending.id;
          legacySgs().interface.Show_CardChooseBox(
            pending.reason,
            cards
          );
        }
        return;
      }
      const command = this.#aiAgent.chooseAction(observeForPlayer(
        state,
        pending.playerId,
        this.#registry
      ));
      this.#submit(command);
      return;
    }
    const current = this.#playerById.get(state.currentPlayerId)!;
    if (state.phase === "judgment" || state.phase === "draw") {
      this.#submit({ type: "advance-phase", playerId: current.id });
      return;
    }
    if (state.phase === "action") {
      if (!current.isAI) {
        current.choice_card();
        return;
      }
      this.#submit(this.#aiAgent.chooseAction(observeForPlayer(
        state,
        current.id,
        this.#registry
      )));
      return;
    }
    if (!current.isAI) {
      current.stage = 2;
      current.choice_card();
      return;
    }
    this.#submit(this.#aiAgent.chooseAction(observeForPlayer(
      state,
      current.id,
      this.#registry
    )));
  }
}
