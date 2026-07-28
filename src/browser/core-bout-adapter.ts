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

interface UiHeroViewModel {
  name: string;
  life: number;
}

interface UiCardViewModel {
  name: string;
  definitionId?: string;
  color: number;
  digit: string | number;
  selected?: boolean;
  coreCardId?: CardInstanceId;
}

interface UiPlayerViewModel {
  id: PlayerId;
  nickname: string;
  identity: number;
  hero: UiHeroViewModel;
  isAI: boolean;
  card: UiCardViewModel[];
  equip: Array<UiCardViewModel | undefined>;
  be_decision: unknown[];
  status: Record<string, unknown>;
  blood: number;
  maxBlood: number;
  stage?: number;
  choice_card(): void;
  ask_card(option: unknown): void;
}

interface UiDecisionPrompt {
  id: string;
  source: UiPlayerViewModel;
  target?: UiPlayerViewModel | UiPlayerViewModel[];
  data: string;
}

interface UiShellRuntime {
  Card: new (
    name: string,
    color: number,
    digit: string | number
  ) => UiCardViewModel;
  EXPANSION_PACKS?: Record<string, { enabled?: boolean }>;
  EQUIP_TYPE_MAPPING: Record<string, number>;
  view: {
    playerElement(player: UiPlayerViewModel): HTMLElement | undefined;
  };
  motion?: {
    cancelAll(): void;
  };
  interface: {
    Show_CardChooseBox(
      title: string,
      cards: UiCardViewModel[],
      identityInfo?: string,
      presentation?: {
        hiddenCards?: UiCardViewModel[];
        zoneLabels?: string[];
      }
    ): void;
    Show_OptionChooseBox(title: string, options: string[]): void;
    Show_PlayerChooseBox(
      title: string,
      options: Array<{ label: string; value: string }>
    ): void;
  };
}

type Listener = (...args: unknown[]) => unknown;

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

const DECISION_TITLE: Record<string, string> = {
  "amazing-grace": "五谷丰登：选择一张牌",
  "axe": "贯石斧：是否发动",
  "axe-discard": "贯石斧：弃置两张牌",
  "blade": "青龙偃月刀：是否追杀",
  "blade-slash": "青龙偃月刀：选择一张杀",
  "dismantle": "过河拆桥：选择一张牌",
  "dismantle-card": "过河拆桥：选择要弃置的牌",
  "discard": "选择要弃置的牌",
  "double-sword": "雌雄双股剑：选择响应方式",
  "double-sword-discard": "雌雄双股剑：选择弃置的手牌",
  "eight-diagram": "八卦阵：是否发动",
  "fanjian": "反间：选择展示的手牌",
  "fanjian-suit": "反间：猜测花色",
  "fankui": "反馈：选择获得的牌",
  "fire-attack": "火攻",
  "fire-attack-discard": "火攻：弃置一张同花色手牌",
  "fire-attack-reveal": "火攻：展示一张手牌",
  "ganglie": "刚烈：是否发动",
  "ganglie-discard": "刚烈：弃置两张手牌",
  "ganglie-penalty": "刚烈：选择受到伤害或弃牌",
  "give": "选择要交出的牌",
  "guicai": "鬼才：选择替换判定的牌",
  "guidao": "鬼道：选择替换判定的牌",
  "guanxing": "观星：选择牌",
  "guanxing-bottom-card": "观星：选择置于牌堆底的牌",
  "guanxing-top": "观星：选择牌堆顶的牌",
  "guanxing-top-card": "观星：选择置于牌堆顶的牌",
  "hujia": "护驾：是否发动",
  "ice-sword": "寒冰剑：是否防止伤害并弃牌",
  "jijiang": "激将：是否发动",
  "kylin-bow": "麒麟弓：选择弃置的坐骑",
  "leiji": "雷击：是否发动",
  "leiji-target": "雷击：选择目标",
  "liegong": "烈弓：是否发动",
  "liuli": "流离：选择转移目标",
  "luoshen": "洛神：是否继续",
  "luoyi": "裸衣：是否发动",
  "resolve": "请选择",
  "snatch": "顺手牵羊：选择一张牌",
  "snatch-card": "顺手牵羊：选择获得的牌",
  "tieqi": "铁骑：是否发动",
  "tuxi-card": "突袭：选择获得的手牌",
  "tuxi-targets": "突袭：选择目标",
  "yiji": "遗计：选择要分配的牌",
  "yiji-recipient": "遗计：选择获得牌的角色"
};

function decisionTitle(reason: string): string {
  return DECISION_TITLE[reason] ?? "请选择";
}

function uiShell(): UiShellRuntime {
  return (window as unknown as { sgs: UiShellRuntime }).sgs;
}

function selectedExpansionIds(sgs: UiShellRuntime): EarlyExpansionId[] {
  return (["wind", "military", "fire", "forest"] as const).filter(
    (id) => sgs.EXPANSION_PACKS?.[id]?.enabled === true
  );
}

function cardSpec(card: UiCardViewModel): CardSpec {
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
      `invalid UI card suit/rank: ${card.name} ${card.color}/${card.digit}`
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
  readonly player: UiPlayerViewModel[];
  readonly playerlen: number;
  readonly ailv: number;
  readonly #registry: ReturnType<typeof createEarlyExpansionRegistry>;
  readonly #listeners = new Map<string, Listener[]>();
  readonly #uiCardById = new Map<CardInstanceId, UiCardViewModel>();
  readonly #cardIdByUiCardViewModel = new WeakMap<UiCardViewModel, CardInstanceId>();
  readonly #playerById = new Map<PlayerId, UiPlayerViewModel>();
  readonly #aiAgent = new PolicySearchAgent();
  #advanceTimer: number | null = null;
  #advanceTicket = 0;
  #visualBarrier: Promise<void> = Promise.resolve();
  #paused = false;
  #shownDecisionId: string | null = null;

  curplayer = 0;
  step = 0;
  timer = 0;
  choice: UiDecisionPrompt[] = [];
  card: UiCardViewModel[] = [];
  discardPile: UiCardViewModel[] = [];

  contentManifest() {
    const cardDefinitionIds = unique(
      this.#registry.cardPrints().map((print) => print.definitionId)
    );
    return {
      packs: this.#registry.packs(),
      cardPrintCount: this.#registry.cardPrints().length,
      cards: cardDefinitionIds.map((definitionId) => {
        const card = this.#registry.card(definitionId);
        return {
          id: card.id,
          name: card.name,
          category: card.category,
          active: card.active,
          implementation: card.implementation
        };
      }),
      heroes: this.#registry.heroes().map((hero) => ({
        id: hero.id,
        name: hero.name,
        skillIds: [...hero.skillIds],
        implementation: hero.implementation
      }))
    };
  }

  constructor(players: UiPlayerViewModel[], aiLevel: number, seed: number) {
    const expansionIds = selectedExpansionIds(uiShell());
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
      const card = new (uiShell().Card)(
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
    const hands = new Map<PlayerId, UiCardViewModel[]>();
    for (const player of this.player) {
      hands.set(player.id, shuffled.items.splice(0, 4));
    }
    const initial = createGameState({
      gameId: `browser-game-${seed}`,
      rulesetId: [
        "standard-rules@0.1.0",
        ...expansionIds
      ].join("+"),
      contentPacks: this.#registry.installedContentPacks(),
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
          skillIds: hero.skillIds.filter(
            (skillId) =>
              player.identity === 0 ||
              this.#registry.skill(skillId).lordOnly !== true
          ),
          hand: (hands.get(player.id) ?? []).map(cardSpec)
        };
      }),
      drawPile: shuffled.items.map(cardSpec)
    });
    initial.rngState = shuffled.state;

    let nextCardSequence = 1;
    for (const player of this.player) {
      const uiHand = hands.get(player.id) ?? [];
      for (const uiCard of uiHand) {
        this.#bindCard(`card-${nextCardSequence++}`, uiCard);
      }
    }
    for (const uiCard of shuffled.items) {
      this.#bindCard(`card-${nextCardSequence++}`, uiCard);
    }

    this.session = new GameSession(initial, this.#registry);
    this.#syncProjection();
  }

  attach(eventType: string, listener: Listener): void {
    const listeners = this.#listeners.get(eventType) ?? [];
    listeners.push(listener);
    this.#listeners.set(eventType, listeners);
  }

  notify(eventType: string, ...args: unknown[]): Promise<void> {
    const task = Promise.all(
      (this.#listeners.get(eventType) ?? []).map((listener) =>
        Promise.resolve(listener(...args))
      )
    ).then(() => undefined);
    this.#visualBarrier = Promise.all([
      this.#visualBarrier,
      task
    ]).then(() => undefined);
    return task;
  }

  continue(): void {
    this.#scheduleAdvance(0);
  }

  pause(): void {
    this.#paused = true;
    this.#advanceTicket += 1;
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
    uiShell().motion?.cancelAll();
    this.#visualBarrier = Promise.resolve();
    this.session = GameSession.restore(serialized, this.#registry);
    this.#syncProjection();
  }

  isLegalResponseCard(card: UiCardViewModel): boolean {
    const cardId = this.#cardIdByUiCardViewModel.get(card);
    return cardId !== undefined && this.session.legalActions().some(
      (action) =>
        (action.type === "respond-card" && action.cardId === cardId) ||
        (action.type === "respond-virtual-card" &&
          action.materialCardIds.includes(cardId))
    );
  }

  select_card(
    card: UiCardViewModel,
    source: UiPlayerViewModel
  ): [UiPlayerViewModel[], number, number] {
    const cardId = this.#cardIdByUiCardViewModel.get(card);
    if (!cardId) return [[], -1, -1];
    const actions = this.session.legalActions().filter(
      (
        action
      ): action is Extract<
        LegalAction,
        { type: "use-card" | "use-virtual-card" }
      > =>
        action.playerId === source.id &&
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
        .filter((player): player is UiPlayerViewModel => player !== undefined),
      Math.max(...targetSets.map((targets) => targets.length)),
      Math.min(...targetSets.map((targets) => targets.length))
    ];
  }

  choice_card(
    card: UiCardViewModel,
    selectedTargets: UiPlayerViewModel[]
  ): void {
    const cardId = this.#cardIdByUiCardViewModel.get(card);
    if (!cardId) throw new Error("UI card is not bound to Core");
    const selectedTargetIds = selectedTargets.map((target) => target.id);
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

  response_card(card?: UiCardViewModel): void {
    const legal = this.session.legalActions();
    let command: GameCommand | undefined;
    if (card) {
      const cardId = this.#cardIdByUiCardViewModel.get(card);
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

  choose_card(card: UiCardViewModel): void {
    const cardId = this.#cardIdByUiCardViewModel.get(card);
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

  discard(selectedCards: UiCardViewModel[] = []): void {
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
    const selected = selectedCards
      .map((card) => this.#cardIdByUiCardViewModel.get(card))
      .filter((id): id is CardInstanceId => id !== undefined);
    const legal = this.session.legalActions();
    const command = legal.find((action) =>
      action.type === "discard-cards"
        ? JSON.stringify(action.cardIds) === JSON.stringify(selected)
        : action.type === "end-turn" && selected.length === 0
    );
    if (!command) throw new Error("discard selection is not legal");
    this.#submit(command);
  }

  #bindCard(cardId: CardInstanceId, uiCard: UiCardViewModel): void {
    uiCard.coreCardId = cardId;
    this.#uiCardById.set(cardId, uiCard);
    this.#cardIdByUiCardViewModel.set(uiCard, cardId);
  }

  #submit(command: GameCommand, schedule = true): DispatchResult {
    const result = this.session.dispatch(command);
    this.#syncProjection();
    this.#playEvents(result);
    if (schedule) this.#scheduleAdvance(0);
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
      const uiCard = this.#uiCardById.get(cardId);
      if (!uiCard || !this.#registry.hasCard(card.definitionId)) continue;
      uiCard.name = this.#registry.card(card.definitionId).name;
      if (card.suit !== undefined) uiCard.color = suitIndex[card.suit];
      if (card.rank !== undefined) uiCard.digit = card.rank;
    }
    this.curplayer = Math.max(
      0,
      this.player.findIndex((player) => player.id === state.currentPlayerId)
    );
    this.step = PHASE_STEP[state.phase];
    this.card = (state.zones["zone:draw"] ?? [])
      .map((id) => this.#uiCardById.get(id))
      .filter((card): card is UiCardViewModel => card !== undefined);
    this.discardPile = (state.zones["zone:discard"] ?? [])
      .map((id) => this.#uiCardById.get(id))
      .filter((card): card is UiCardViewModel => card !== undefined);
    for (const player of this.player) {
      const corePlayer = state.players[player.id]!;
      player.blood = corePlayer.hp;
      player.maxBlood = corePlayer.maxHp;
      player.card = (state.zones[handZone(player.id)] ?? [])
        .map((id) => this.#uiCardById.get(id))
        .filter((card): card is UiCardViewModel => card !== undefined);
      player.equip = [];
      for (const cardId of state.zones[equipmentZone(player.id)] ?? []) {
        const uiCard = this.#uiCardById.get(cardId);
        if (!uiCard) continue;
        const slot = uiShell().EQUIP_TYPE_MAPPING[uiCard.name];
        if (slot !== undefined) player.equip[slot] = uiCard;
      }
      player.status = {
        chained: corePlayer.marks.chained === true,
        lebusishu: corePlayer.marks.skipAction === true,
        bingliang: corePlayer.marks.skipDraw === true,
        dead: !corePlayer.alive
      };
      player.be_decision = (state.zones[judgmentZone(player.id)] ?? [])
        .map((id) => this.#uiCardById.get(id))
        .filter((card): card is UiCardViewModel => card !== undefined);
      const playerElement = uiShell().view.playerElement(player);
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
    this.choice = [{ id: pending.id, source, target: player, data }];
  }

  #playEvents(result: DispatchResult): void {
    const state = this.session.state();
    const drawn = new Map<PlayerId, UiCardViewModel[]>();
    const changedHands = new Set<PlayerId>();
    for (const event of result.events) {
      if (event.type === "CardMoved") {
        if (event.from.startsWith("zone:hand:")) {
          changedHands.add(event.from.slice("zone:hand:".length));
        }
        if (event.to.startsWith("zone:hand:")) {
          changedHands.add(event.to.slice("zone:hand:".length));
        }
      }
      if (
        event.type === "CardMoved" &&
        event.reason === "draw" &&
        event.to.startsWith("zone:hand:")
      ) {
        const playerId = event.to.slice("zone:hand:".length);
        const card = this.#uiCardById.get(event.cardId);
        if (card) drawn.set(playerId, [...(drawn.get(playerId) ?? []), card]);
      } else if (event.type === "CardUsed") {
        const source = this.#playerById.get(event.playerId)!;
        const targets = event.targetIds.map((id) => this.#playerById.get(id)!);
        const card = this.#uiCardById.get(event.cardId) ??
          (event.materialCardIds
            ? this.#uiCardById.get(event.materialCardIds[0]!)
            : undefined);
        const definitionId = state.cards[event.cardId]?.definitionId;
        const usesDedicatedEquipmentAnimation = definitionId !== undefined &&
          this.#registry.card(definitionId).category === "equipment";
        if (card && !usesDedicatedEquipmentAnimation) this.notify(
          "choice_card",
          source,
          targets.length === 1 ? targets[0] : targets,
          card
        );
      } else if (event.type === "CardResponded") {
        const player = this.#playerById.get(event.playerId)!;
        const card = this.#uiCardById.get(event.cardId) ??
          (event.materialCardIds
            ? this.#uiCardById.get(event.materialCardIds[0]!)
            : undefined);
        if (card) this.notify("response_card", player, player, card);
      } else if (event.type === "DamageApplied") {
        const source = this.#playerById.get(event.sourceId);
        const target = this.#playerById.get(event.targetId);
        const card = this.#uiCardById.get(event.cardId);
        if (source && target && card) this.notify("apply_card", source, target, card);
      } else if (event.type === "HpRecovered") {
        const player = this.#playerById.get(event.playerId);
        if (player) this.notify("apply_card", player, player, { name: "桃" });
      } else if (event.type === "EquipmentChanged") {
        const player = this.#playerById.get(event.playerId)!;
        if (event.replacedCardId) {
          const replaced = this.#uiCardById.get(event.replacedCardId);
          if (replaced) {
            this.notify(
              "equip_off",
              player,
              replaced,
              uiShell().EQUIP_TYPE_MAPPING[replaced.name]
            );
          }
        }
        const equipped = this.#uiCardById.get(event.equippedCardId);
        if (equipped) this.notify("equip_on", player, equipped);
      } else if (event.type === "DelayedCardPlaced") {
        const player = this.#playerById.get(event.playerId)!;
        const card = this.#uiCardById.get(event.cardId);
        if (card) this.notify("delayed_on", player, card);
      } else if (
        event.type === "CardMoved" &&
        event.from.startsWith("zone:judgment:")
      ) {
        const playerId = event.from.slice("zone:judgment:".length);
        const player = this.#playerById.get(playerId);
        const card = this.#uiCardById.get(event.cardId);
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
              .filter((player): player is UiPlayerViewModel =>
                player !== undefined
              )
          : [];
        const card = this.#uiCardById.get(event.cardId);
        if (source) this.notify("nullified", source, targets, card);
      } else if (event.type === "ChainChanged") {
        const player = this.#playerById.get(event.playerId)!;
        this.notify("status_change", player, "chained", event.chained);
      } else if (event.type === "JudgmentRevealed") {
        const player = this.#playerById.get(event.playerId)!;
        const card = this.#uiCardById.get(event.judgmentCardId);
        if (card) this.notify("judge_card", player, card);
      } else if (event.type === "CardRevealed") {
        const player = this.#playerById.get(event.playerId)!;
        const card = this.#uiCardById.get(event.cardId);
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
        const card = this.#uiCardById.get(event.cardId);
        if (player && card) this.notify("discard", player, [card]);
      }
    }
    for (const [playerId, cards] of drawn) {
      const player = this.#playerById.get(playerId);
      if (player) this.notify("get_card", player, cards);
    }
    for (const playerId of changedHands) {
      const player = this.#playerById.get(playerId);
      if (player) this.notify("sync_hand", player);
    }
  }

  #scheduleAdvance(delay: number): void {
    if (this.#paused) return;
    const ticket = ++this.#advanceTicket;
    const barrier = this.#visualBarrier;
    void barrier.then(() => {
      if (this.#paused || ticket !== this.#advanceTicket) return;
      if (this.#advanceTimer !== null) {
        window.clearTimeout(this.#advanceTimer);
      }
      this.#advanceTimer = window.setTimeout(() => {
        if (ticket !== this.#advanceTicket) return;
        this.#advanceTimer = null;
        this.#advance();
      }, delay);
    });
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
          if (legal.length === 1 && legal[0]?.type === "pass") {
            this.#submit(legal[0]);
            return;
          }
          player.ask_card(this.choice[0]);
          return;
        }
        if (pending.type === "choose-option") {
          if (this.#shownDecisionId !== pending.id) {
            this.#shownDecisionId = pending.id;
            uiShell().interface.Show_OptionChooseBox(
              decisionTitle(pending.reason),
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
            uiShell().interface.Show_PlayerChooseBox(
              decisionTitle(pending.reason),
              options
            );
          }
          return;
        }
        if (this.#shownDecisionId !== pending.id) {
          const entries = pending.selectableCardIds
            .map((cardId) => {
              const card = this.#uiCardById.get(cardId);
              const zoneId = Object.entries(state.zones).find(
                ([, cardIds]) => cardIds.includes(cardId)
              )?.[0];
              return card ? { card, zoneId } : undefined;
            })
            .filter((
              entry
            ): entry is { card: UiCardViewModel; zoneId: string | undefined } =>
              entry !== undefined
            );
          const cards = entries.map((entry) => entry.card);
          const isOpponentZoneChoice =
            pending.reason === "dismantle" || pending.reason === "snatch";
          const ownerId = entries[0]?.zoneId?.split(":").at(-1);
          const owner = ownerId ? this.#playerById.get(ownerId) : undefined;
          const title = isOpponentZoneChoice && owner
            ? `${decisionTitle(pending.reason)}（${owner.hero.name}的区域）`
            : decisionTitle(pending.reason);
          this.#shownDecisionId = pending.id;
          uiShell().interface.Show_CardChooseBox(
            title,
            cards,
            undefined,
            isOpponentZoneChoice
              ? {
                  hiddenCards: entries
                    .filter((entry) =>
                      entry.zoneId?.startsWith("zone:hand:")
                    )
                    .map((entry) => entry.card),
                  zoneLabels: entries.map((entry) =>
                    entry.zoneId?.startsWith("zone:hand:")
                      ? "手牌（未知）"
                      : entry.zoneId?.startsWith("zone:equipment:")
                        ? "装备区"
                        : "判定区"
                  )
                }
              : undefined
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
