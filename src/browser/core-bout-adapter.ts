import {
  canonicalJson,
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
import {
  JsonlReplayRecorder,
  parseReplayJsonl,
  ReplayIdNormalizer,
  verifyReplayJsonl
} from "../replay/jsonl";
import {
  deriveAnimationSemantics
} from "./animation-semantics";
import {
  deriveAudioCues
} from "./audio-semantics";
import {
  deriveHeroAudioCues
} from "./hero-audio-semantics";
import type {
  ReplayCheckpointLine,
  ReplayCommandLine,
  ReplayEventLine,
  ReplayMetaLine
} from "../replay/jsonl";
import { GameSession } from "../session/game-session";
import {
  observeForPlayer,
  PolicySearchAgent
} from "../core";

interface UiHeroViewModel {
  name: string;
  life: number;
  country?: string;
  skills?: string[];
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
  begin_discard(discardCount: number): void;
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
        contextText?: string;
      }
    ): void;
    Show_OptionChooseBox(
      title: string,
      options: Array<string | { label: string; value: string }>,
      contextText?: string
    ): void;
    Begin_ActionSkillMaterialSelection(
      title: string,
      cards: UiCardViewModel[],
      contextText: string,
      canConfirm: boolean,
      canCancel: boolean
    ): void;
    Set_Action_Skill_Tags?(
      player: UiPlayerViewModel,
      skills: Array<{ id: string; name: string; active?: boolean }>
    ): void;
    Set_Equipment_Skill_States?(
      player: UiPlayerViewModel,
      skills: Array<{ id: string; cardName: string; active: boolean }>
    ): void;
    Show_PlayerChooseBox(
      title: string,
      options: Array<{ label: string; value: string }>,
      contextText?: string
    ): void;
    Show_GuanxingArrangeBox(
      title: string,
      cards: UiCardViewModel[],
      contextText: string
    ): void;
    Render_Skill_Tags?(player: UiPlayerViewModel): void;
    Render_Country_Badge?(player: UiPlayerViewModel): void;
  };
}

type Listener = (...args: unknown[]) => unknown;
type ActiveSkillAction = Extract<
  LegalAction,
  { type: "activate-skill" }
>;

interface ActionSkillMaterialFlow {
  allActions: ActiveSkillAction[];
  skillId: string;
  actions: ActiveSkillAction[];
  revision: number;
  selectableCardIds: Set<CardInstanceId>;
  selectedCardIds: Set<CardInstanceId>;
}

type ViewAsAction = Extract<
  LegalAction,
  { type: "use-virtual-card" | "respond-virtual-card" }
>;

interface ViewAsSkillMaterialFlow {
  source: "equipment" | "skill";
  skillId: string;
  displayName: string;
  actions: ViewAsAction[];
  revision: number;
  selectableCardIds: Set<CardInstanceId>;
  selectedCardIds: Set<CardInstanceId>;
}

interface DecisionMaterialFlow {
  decisionId: string;
  revision: number;
  actions: Array<Extract<LegalAction, { type: "choose-cards" }>>;
  selectableCardIds: Set<CardInstanceId>;
  selectedCardIds: Set<CardInstanceId>;
}

export interface BrowserVisualEvent {
  index: number;
  type: string;
  playerIds: PlayerId[];
  cardIds: CardInstanceId[];
  domainEventTypes: string[];
}

interface BrowserReplayStep {
  command: ReplayCommandLine;
  events: ReplayEventLine[];
  checkpoint: ReplayCheckpointLine;
}

export interface BrowserReplayStatus {
  loaded: boolean;
  cursor: number;
  total: number;
  finished: boolean;
  scenario: string | null;
}

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

const IDENTITY_BY_UI_INDEX = [
  "lord",
  "loyalist",
  "renegade",
  "rebel"
] as const;

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
  "yiji-recipient": "遗计：选择获得牌的角色",
  "baonue": "暴虐：是否发动",
  "bazhen": "八阵：是否发动",
  "benghuai": "崩坏：选择失去体力或减上限",
  "buqu": "不屈：选择不屈牌",
  "buqu-remove": "不屈：移除多余的不屈牌",
  "fangzhu-target": "放逐：选择目标",
  "guhuo": "蛊惑：展示声明牌",
  "guhuo-question": "蛊惑：是否质疑",
  "haoshi": "好施：是否少摸一张牌",
  "haoshi-cards": "好施：选择要交出的手牌",
  "haoshi-recipient": "好施：选择获得手牌的角色",
  "jieming": "节命：是否发动",
  "jieming-target": "节命：选择摸牌角色",
  "lieren-obtain": "烈刃：选择获得的牌",
  "luanwu-target": "乱武：选择攻击目标",
  "mengjin": "猛进：是否发动",
  "mengjin-card": "猛进：选择弃置的牌",
  "niepan": "涅槃：是否发动",
  "quhu-damage": "驱虎：选择受到伤害的角色",
  "shensu-cost": "神速：选择弃置的装备牌",
  "shensu-target": "神速：选择目标",
  "shuangxiong": "双雄：选择判定牌颜色",
  "songwei": "颂威：是否发动",
  "tianxiang": "天香：是否发动",
  "tianxiang-cost": "天香：选择弃置的红桃手牌",
  "tianxiang-target": "天香：选择转移伤害的目标",
  "xingshang": "行殇：是否获得阵亡角色的牌",
  "yinghun-discard": "英魂：选择弃牌方式",
  "yinghun-mode": "英魂：选择摸牌与弃牌方式",
  "yinghun-target": "英魂：选择目标",
  "zaiqi": "再起：是否发动"
};

function decisionTitle(reason: string): string {
  return DECISION_TITLE[reason] ?? "请选择";
}

function decisionRequestTitle(
  request: NonNullable<GameState["pendingDecision"]>["request"]
): string {
  return "reason" in request
    ? decisionTitle(request.reason)
    : `请响应【${RESPONSE_NAME[request.responseKind]}】`;
}

const OPTION_LABEL: Record<string, string> = {
  activate: "发动",
  skip: "不发动",
  trust: "不质疑",
  question: "质疑",
  damage: "受到伤害",
  discard: "弃置牌",
  draw: "摸牌",
  loseHp: "失去体力",
  loseMaxHp: "减体力上限",
  red: "红色",
  black: "黑色",
  diamond: "方片",
  heart: "红桃",
  club: "梅花",
  spade: "黑桃",
  top: "牌堆顶",
  bottom: "牌堆底",
  finish: "完成",
  select: "继续选择",
  "draw-one-discard-x": "摸一张，弃多张",
  "draw-x-discard-one": "摸多张，弃一张",
  "lose-hp": "失去体力",
  "lose-max-hp": "减体力上限",
  yes: "是",
  no: "否"
};

function optionLabel(option: string): string {
  return OPTION_LABEL[option] ?? option;
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

export interface CoreBoutAdapterOptions {
  cardNames?: string[];
  shouldPromptForNullification?: () => boolean;
  shouldPromptForPeach?: () => boolean;
}

export class CoreBoutAdapter {
  readonly engine = "core";
  readonly seed: number;
  session: GameSession;
  readonly player: UiPlayerViewModel[];
  readonly playerlen: number;
  readonly ailv: number;
  #registry: ReturnType<typeof createEarlyExpansionRegistry>;
  readonly #listeners = new Map<string, Listener[]>();
  readonly #uiCardById = new Map<CardInstanceId, UiCardViewModel>();
  readonly #cardIdByUiCardViewModel = new WeakMap<UiCardViewModel, CardInstanceId>();
  readonly #playerById = new Map<PlayerId, UiPlayerViewModel>();
  readonly #aiAgent = new PolicySearchAgent();
  readonly #shouldPromptForNullification: () => boolean;
  readonly #shouldPromptForPeach: () => boolean;
  #advanceTimer: number | null = null;
  #advanceTicket = 0;
  #visualBarrier: Promise<void> = Promise.resolve();
  #paused = false;
  #shownDecisionId: string | null = null;
  #actionSkillFlowRevision: number | null = null;
  readonly #actionSkillOptionHandlers = new Map<string, () => void>();
  #actionSkillMaterialFlow: ActionSkillMaterialFlow | null = null;
  #viewAsSkillMaterialFlow: ViewAsSkillMaterialFlow | null = null;
  #decisionMaterialFlow: DecisionMaterialFlow | null = null;
  #replayMeta: ReplayMetaLine | null = null;
  #replaySteps: BrowserReplayStep[] = [];
  #replayCursor = 0;
  #replayNormalizer: ReplayIdNormalizer | null = null;
  #visualEventSequence = 0;
  readonly #visualEvents: BrowserVisualEvent[] = [];
  #diagnosticRecorder!: JsonlReplayRecorder;
  #diagnosticQueue: Promise<void> = Promise.resolve();
  #diagnosticCommandIndex = 0;
  #lastFailureContext: Record<string, unknown> | null = null;

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

  constructor(
    players: UiPlayerViewModel[],
    aiLevel: number,
    seed: number,
    options: CoreBoutAdapterOptions = {}
  ) {
    this.seed = seed;
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
    this.#shouldPromptForNullification =
      options.shouldPromptForNullification ?? (() => true);
    this.#shouldPromptForPeach =
      options.shouldPromptForPeach ?? (() => true);
    for (const player of this.player) this.#playerById.set(player.id, player);

    const suits = ["diamond", "heart", "club", "spade"] as const;
    const allowedCardNames = options.cardNames
      ? new Set(options.cardNames)
      : null;
    const deck = this.#registry.cardPrints().filter((print) => {
      if (!allowedCardNames) return true;
      return allowedCardNames.has(
        this.#registry.card(print.definitionId).name
      );
    }).map((print) => {
      const definition = this.#registry.card(print.definitionId);
      const card = new (uiShell().Card)(
        definition.name,
        suits.indexOf(print.suit ?? "diamond"),
        print.rank ?? 1
      );
      card.definitionId = print.definitionId;
      return card;
    });
    if (deck.length < players.length * 4 + 1) {
      throw new Error(
        `selected story card pool is too small: ${deck.length} cards`
      );
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
        const identity = IDENTITY_BY_UI_INDEX[player.identity];
        if (!identity) {
          throw new Error(`invalid UI identity index: ${player.identity}`);
        }
        player.maxBlood = player.hero.life + lordBonus;
        player.blood = player.maxBlood;
        return {
          id: player.id,
          identity,
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
    this.#resetDiagnosticRecorder("browser-live-match");
  }

  attach(eventType: string, listener: Listener): void {
    const listeners = this.#listeners.get(eventType) ?? [];
    listeners.push(listener);
    this.#listeners.set(eventType, listeners);
  }

  notify(eventType: string, ...args: unknown[]): Promise<void> {
    this.#recordVisualEvent(eventType, args);
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

  #signal(eventType: string, ...args: unknown[]): Promise<void> {
    return Promise.all(
      (this.#listeners.get(eventType) ?? []).map((listener) =>
        Promise.resolve(listener(...args))
      )
    ).then(() => undefined);
  }

  visualEvents(clear = false): BrowserVisualEvent[] {
    const result = structuredClone(this.#visualEvents);
    if (clear) this.#visualEvents.length = 0;
    return result;
  }

  clearVisualEvents(): void {
    this.#visualEvents.length = 0;
  }

  boundCoreCardIds(): CardInstanceId[] {
    return [...this.#uiCardById.keys()].sort();
  }

  #recordVisualEvent(eventType: string, args: unknown[]): void {
    const playerIds = new Set<PlayerId>();
    const cardIds = new Set<CardInstanceId>();
    const domainEventTypes = new Set<string>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== "object") return;
      const object = value as Record<string, unknown>;
      const coreCardId = object.coreCardId;
      if (typeof coreCardId === "string") cardIds.add(coreCardId);
      const id = object.id;
      if (
        typeof id === "string" &&
        this.#playerById.get(id) === value
      ) {
        playerIds.add(id);
      }
      if (
        typeof object.type === "string" &&
        typeof object.sequence === "number" &&
        typeof object.revision === "number"
      ) {
        domainEventTypes.add(object.type);
      }
    };
    args.forEach(visit);
    this.#visualEvents.push({
      index: this.#visualEventSequence++,
      type: eventType,
      playerIds: [...playerIds],
      cardIds: [...cardIds],
      domainEventTypes: [...domainEventTypes]
    });
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

  snapshot(): string {
    return this.session.snapshot();
  }

  async replayJsonl(): Promise<string> {
    await this.#diagnosticQueue;
    return this.#diagnosticRecorder.jsonl();
  }

  async captureFailure(
    error: unknown,
    browserContext: Record<string, unknown> = {}
  ): Promise<string> {
    this.pause();
    await this.#diagnosticQueue;
    const failure = error instanceof Error
      ? error
      : new Error(String(error));
    if (!this.#diagnosticRecorder.hasFailure()) {
      this.#diagnosticRecorder.recordFailure({
        index: this.#diagnosticCommandIndex,
        stage: "invariant",
        message: failure.message,
        diagnostics: {
          ...(failure.stack ? { stack: failure.stack } : {}),
          url: window.location.href,
          userAgent: window.navigator.userAgent,
          context: {
            ...browserContext,
            ...(this.#lastFailureContext ?? {})
          },
          state: this.session.state(),
          legalActions: this.session.legalActions(),
          visualEvents: this.visualEvents()
        }
      });
    }
    return this.#diagnosticRecorder.jsonl();
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
    this.#resetActionSkillFlow();
    this.#resetViewAsSkillFlow();
    this.#resetDecisionMaterialFlow();
    this.session = GameSession.restore(serialized, this.#registry);
    this.#syncProjection();
    this.#resetDiagnosticRecorder("browser-restored-snapshot");
  }

  async loadReplayJsonl(jsonl: string): Promise<BrowserReplayStatus> {
    this.pause();
    uiShell().motion?.cancelAll();
    this.#visualBarrier = Promise.resolve();
    this.#resetActionSkillFlow();
    this.#resetViewAsSkillFlow();
    this.#resetDecisionMaterialFlow();
    const lines = parseReplayJsonl(jsonl);
    const meta = lines[0];
    if (meta?.kind !== "meta") {
      throw new Error("browser replay must start with metadata");
    }
    const replayContainsExpansion = (id: "wind" | "military" | "fire" | "forest") => {
      const contentPackIds =
        id === "military" ? new Set(["military", "maneuvering"]) : new Set([id]);
      return (
        meta.initialState.contentPacks.some((pack) => contentPackIds.has(pack.id)) ||
        Object.values(meta.initialState.cards).some((card) =>
          card.definitionId.startsWith(`${id}:`)
        ) ||
        Object.values(meta.initialState.players).some((player) =>
          player.heroDefinitionId.startsWith(`${id}:`) ||
          player.skillIds.some((skillId) => skillId.startsWith(`${id}:`))
        )
      );
    };
    const expansionIds = ([
      "wind",
      "military",
      "fire",
      "forest"
    ] as const).filter(replayContainsExpansion);
    this.#registry = createEarlyExpansionRegistry(expansionIds);
    await verifyReplayJsonl(jsonl, this.#registry);
    const steps: BrowserReplayStep[] = [];
    let cursor = 1;
    while (cursor < lines.length) {
      if (lines[cursor]?.kind === "failure") break;
      const command = lines[cursor++];
      if (command?.kind !== "command") {
        throw new Error(`expected replay command at line ${cursor}`);
      }
      const events: ReplayEventLine[] = [];
      while (lines[cursor]?.kind === "event") {
        events.push(lines[cursor++] as ReplayEventLine);
      }
      const checkpoint = lines[cursor++];
      if (checkpoint?.kind !== "checkpoint") {
        throw new Error(`expected replay checkpoint after ${command.index}`);
      }
      steps.push({ command, events, checkpoint });
    }
    this.#rebindReplayState(meta.initialState);
    this.#replayMeta = meta;
    this.#replaySteps = steps;
    this.#replayCursor = 0;
    this.#replayNormalizer = new ReplayIdNormalizer();
    this.#replayNormalizer.seedStableIds(meta.initialState);
    await this.#projectReplayInitialState();
    this.clearVisualEvents();
    return this.replayStatus();
  }

  replayStatus(): BrowserReplayStatus {
    return {
      loaded: this.#replayMeta !== null,
      cursor: this.#replayCursor,
      total: this.#replaySteps.length,
      finished:
        this.#replayMeta !== null &&
        this.#replayCursor >= this.#replaySteps.length,
      scenario: this.#replayMeta?.scenario ?? null
    };
  }

  async stepReplay(): Promise<BrowserReplayStatus> {
    const step = this.#replaySteps[this.#replayCursor];
    const normalizer = this.#replayNormalizer;
    if (!step || !normalizer) return this.replayStatus();
    const command = normalizer.denormalize(step.command.command);
    const actual = this.session.legalActions().find((candidate) =>
      canonicalJson(candidate) === canonicalJson(command)
    );
    if (!actual) {
      throw new Error(
        `browser replay command ${step.command.index} is not legal`
      );
    }
    const result = this.#submit(actual, false);
    const normalizedEvents = result.events.map((event) =>
      normalizer.normalize(event)
    );
    if (
      canonicalJson(normalizedEvents) !==
        canonicalJson(step.events.map((line) => line.event))
    ) {
      throw new Error(
        `browser replay events differ at command ${step.command.index}`
      );
    }
    await this.#visualBarrier;
    this.#replayCursor += 1;
    return this.replayStatus();
  }

  async playReplay(): Promise<BrowserReplayStatus> {
    while (this.#replayCursor < this.#replaySteps.length) {
      await this.stepReplay();
    }
    return this.replayStatus();
  }

  async projectState(): Promise<void> {
    await this.#projectReplayInitialState();
  }

  #rebindReplayState(initialState: GameState): void {
    if (initialState.turnOrder.length !== this.player.length) {
      throw new Error(
        `browser replay has ${initialState.turnOrder.length} players; ` +
        `current table has ${this.player.length}`
      );
    }
    this.#playerById.clear();
    const uiIdentity = {
      lord: 0,
      loyalist: 1,
      renegade: 2,
      rebel: 3
    } as const;
    initialState.turnOrder.forEach((playerId, index) => {
      const uiPlayer = this.player[index]!;
      const corePlayer = initialState.players[playerId]!;
      const hero = this.#registry.hero(corePlayer.heroDefinitionId);
      uiPlayer.id = playerId;
      uiPlayer.identity = corePlayer.identity
        ? uiIdentity[corePlayer.identity]
        : uiPlayer.identity;
      uiPlayer.hero = {
        name: hero.name,
        life: hero.maxHp,
        country: hero.kingdom,
        skills: hero.skillIds.map((skillId) => this.#registry.skill(skillId).name)
      };
      uiShell().interface.Render_Country_Badge?.(uiPlayer);
      uiShell().interface.Render_Skill_Tags?.(uiPlayer);
      this.#playerById.set(playerId, uiPlayer);
    });
    this.#uiCardById.clear();
    const suitIndex = {
      diamond: 0,
      heart: 1,
      club: 2,
      spade: 3
    } as const;
    for (const card of Object.values(initialState.cards)) {
      if (!this.#registry.hasCard(card.definitionId)) {
        throw new Error(
          `browser replay card is unavailable: ${card.definitionId}`
        );
      }
      const definition = this.#registry.card(card.definitionId);
      const uiCard = new (uiShell().Card)(
        definition.name,
        card.suit ? suitIndex[card.suit] : 0,
        card.rank ?? 1
      );
      uiCard.definitionId = card.definitionId;
      this.#bindCard(card.id, uiCard);
    }
    this.session = new GameSession(initialState, this.#registry);
    this.#syncProjection();
    this.#resetDiagnosticRecorder(
      this.#replayMeta?.scenario ?? "browser-replay"
    );
  }

  async #projectReplayInitialState(): Promise<void> {
    const state = this.session.state();
    for (const player of this.player) {
      await this.notify("sync_hand", player);
      const corePlayer = state.players[player.id]!;
      await this.notify(
        "status_change",
        player,
        "chained",
        corePlayer.marks.chained === true
      );
      if (!corePlayer.alive) {
        await this.notify("death", player);
      }
      for (const cardId of state.zones[equipmentZone(player.id)] ?? []) {
        const card = this.#uiCardById.get(cardId);
        if (card) await this.notify("equip_on", player, card);
      }
      for (const cardId of state.zones[judgmentZone(player.id)] ?? []) {
        const card = this.#uiCardById.get(cardId);
        if (card) await this.notify("delayed_on", player, card);
      }
    }
    await this.#visualBarrier;
  }

  isLegalResponseCard(card: UiCardViewModel): boolean {
    const cardId = this.#cardIdByUiCardViewModel.get(card);
    return cardId !== undefined && this.session.legalActions().some(
      (action) =>
        action.type === "respond-card" && action.cardId === cardId
    );
  }

  select_card(
    card: UiCardViewModel,
    source: UiPlayerViewModel
  ): [UiPlayerViewModel[], number, number] {
    const cardId = this.#cardIdByUiCardViewModel.get(card);
    if (!cardId) return [[], -1, -1];
    const matchingActions = this.session.legalActions().filter(
      (
        action
      ): action is Extract<LegalAction, { type: "use-card" }> =>
        action.playerId === source.id &&
        action.type === "use-card" &&
        action.cardId === cardId
    );
    const actions = matchingActions;
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

  target_selection(
    card: UiCardViewModel,
    source: UiPlayerViewModel,
    selectedTargets: UiPlayerViewModel[]
  ): {
    targets: UiPlayerViewModel[];
    canConfirm: boolean;
    minimum: number;
    maximum: number;
  } {
    const cardId = this.#cardIdByUiCardViewModel.get(card);
    if (!cardId) {
      return { targets: [], canConfirm: false, minimum: -1, maximum: -1 };
    }
    const matchingActions = this.session.legalActions().filter(
      (
        action
      ): action is Extract<LegalAction, { type: "use-card" }> =>
        action.playerId === source.id &&
        action.type === "use-card" &&
        action.cardId === cardId
    );
    const actions = matchingActions;
    if (actions.length === 0) {
      return { targets: [], canConfirm: false, minimum: -1, maximum: -1 };
    }
    const definitionId = this.session.state().cards[cardId]?.definitionId;
    const ordered = definitionId !== undefined &&
      this.#registry.card(definitionId).target.type === "ordered";
    const selectedIds = selectedTargets.map((target) => target.id);
    const compatible = actions.filter((action) =>
      ordered
        ? selectedIds.every(
            (targetId, index) => action.targetIds[index] === targetId
          )
        : selectedIds.every((targetId) =>
            action.targetIds.includes(targetId)
          )
    );
    const nextIds = unique(compatible.flatMap((action) =>
      ordered
        ? [action.targetIds[selectedIds.length]].filter(
            (id): id is PlayerId => id !== undefined
          )
        : action.targetIds.filter((id) => !selectedIds.includes(id))
    ));
    return {
      targets: nextIds
        .map((id) => this.#playerById.get(id))
        .filter((player): player is UiPlayerViewModel => player !== undefined),
      canConfirm: compatible.some(
        (action) => action.targetIds.length === selectedIds.length
      ),
      minimum: Math.min(...actions.map((action) => action.targetIds.length)),
      maximum: Math.max(...actions.map((action) => action.targetIds.length))
    };
  }

  choice_card(
    card: UiCardViewModel,
    selectedTargets: UiPlayerViewModel[]
  ): void {
    const cardId = this.#cardIdByUiCardViewModel.get(card);
    if (!cardId) throw new Error("UI card is not bound to Core");
    const selectedTargetIds = selectedTargets.map((target) => target.id);
    const matchingCandidates = this.session.legalActions().filter(
      (
        action
      ): action is Extract<LegalAction, { type: "use-card" }> =>
        action.type === "use-card" && action.cardId === cardId
    );
    const candidates = matchingCandidates;
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
    if (!command) {
      this.#lastFailureContext = {
        operation: "choice_card",
        cardId,
        definitionId,
        selectedTargetIds,
        legalTargetSets: candidates.map((candidate) => candidate.targetIds)
      };
      throw new Error("selected card targets are not legal");
    }
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
        ): action is Extract<LegalAction, { type: "respond-card" }> =>
          action.type === "respond-card" && action.cardId === cardId
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

  autoPassDisabledLocalResponse(responseKind?: string): boolean {
    const state = this.session.state();
    const pending = state.pendingDecision;
    if (!pending || pending.request.type !== "respond-card") return false;
    if (responseKind && pending.request.responseKind !== responseKind) {
      return false;
    }
    const player = this.#playerById.get(pending.request.playerId);
    if (!player || player.isAI) return false;
    const pass = this.#disabledResponsePass(
      state,
      pending,
      player,
      this.session.legalActions()
    );
    if (!pass) return false;
    this.#submit(pass);
    return true;
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
    const state = this.session.state();
    if (
      !state.pendingDecision &&
      this.#actionSkillOptionHandlers.has(option)
    ) {
      this.#actionSkillOptionHandlers.get(option)!();
      return;
    }
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

  #resetActionSkillFlow(): void {
    this.#actionSkillFlowRevision = null;
    this.#actionSkillOptionHandlers.clear();
    this.#actionSkillMaterialFlow = null;
  }

  #resetViewAsSkillFlow(): void {
    this.#viewAsSkillMaterialFlow = null;
    this.#actionSkillOptionHandlers.clear();
  }

  #resetDecisionMaterialFlow(): void {
    this.#decisionMaterialFlow = null;
  }

  #equipmentCardName(
    playerId: PlayerId,
    skillId: string
  ): string | undefined {
    const state = this.session.state();
    for (const cardId of state.zones[equipmentZone(playerId)] ?? []) {
      const card = state.cards[cardId];
      if (!card || !this.#registry.hasCard(card.definitionId)) continue;
      const definition = this.#registry.card(card.definitionId);
      if (definition.abilities?.some(
        (ability) => ability.type === "view-as" && ability.id === skillId
      )) {
        return definition.name;
      }
    }
    return undefined;
  }

  #isEquipmentVirtualAction(
    action: ViewAsAction
  ): boolean {
    return this.#equipmentCardName(action.playerId, action.skillId) !==
      undefined;
  }

  #isSkillVirtualAction(action: ViewAsAction): boolean {
    return this.session.state().players[action.playerId]?.skillIds.includes(
      action.skillId
    ) === true;
  }

  #setEquipmentSkillStates(
    player: UiPlayerViewModel | undefined,
    actions: ViewAsAction[]
  ): void {
    const localPlayer = this.player.find((candidate) => !candidate.isAI);
    if (!localPlayer) return;
    const available = player?.id === localPlayer.id ? actions : [];
    const activeSkillId = this.#viewAsSkillMaterialFlow?.source === "equipment"
      ? this.#viewAsSkillMaterialFlow.skillId
      : undefined;
    const skills = [...new Set(available.map((action) => action.skillId))]
      .map((id) => ({
        id,
        cardName: this.#equipmentCardName(localPlayer.id, id) ?? id,
        active: id === activeSkillId
      }));
    uiShell().interface.Set_Equipment_Skill_States?.(localPlayer, skills);
  }

  #refreshSkillActivatorStates(): void {
    const state = this.session.state();
    const actorId = state.pendingDecision?.request.playerId ??
      state.currentPlayerId;
    const actor = this.#playerById.get(actorId);
    if (!actor || actor.isAI) {
      this.#setEquipmentSkillStates(actor, []);
      this.#setActionSkillTags(actor, []);
      return;
    }
    const legal = this.session.legalActions();
    const equipmentActions = legal.filter((
      action
    ): action is ViewAsAction =>
      (action.type === "use-virtual-card" ||
        action.type === "respond-virtual-card") &&
      this.#isEquipmentVirtualAction(action)
    );
    const skillActions = legal.filter((
      action
    ): action is ActiveSkillAction | ViewAsAction =>
      action.type === "activate-skill" ||
      (
        (action.type === "use-virtual-card" ||
          action.type === "respond-virtual-card") &&
        this.#isSkillVirtualAction(action)
      )
    );
    this.#setEquipmentSkillStates(actor, equipmentActions);
    this.#setActionSkillTags(actor, skillActions);
  }

  #showViewAsSkillMaterials(
    source: "equipment" | "skill",
    skillId: string,
    displayName: string,
    actions: ViewAsAction[],
    revision: number
  ): void {
    const state = this.session.state();
    if (state.revision !== revision) {
      throw new Error("view-as skill state changed before material selection");
    }
    const selectableCardIds = new Set(
      actions.flatMap((action) => action.materialCardIds)
    );
    const ownerId = actions[0]!.playerId;
    const handCardIds = state.zones[handZone(ownerId)] ?? [];
    const equipmentCardIds = state.zones[equipmentZone(ownerId)] ?? [];
    const cards = [
      ...handCardIds,
      ...equipmentCardIds
    ]
      .filter((cardId) => selectableCardIds.has(cardId))
      .map((cardId) => this.#uiCardById.get(cardId))
      .filter((card): card is UiCardViewModel => card !== undefined);
    const materialCount = actions[0]!.materialCardIds.length;
    const flow: ViewAsSkillMaterialFlow = {
      source,
      skillId,
      displayName,
      actions,
      revision,
      selectableCardIds,
      selectedCardIds: new Set()
    };
    this.#viewAsSkillMaterialFlow = flow;
    this.#actionSkillOptionHandlers.clear();
    this.#refreshSkillActivatorStates();
    const hasHandCards = handCardIds.some((cardId) =>
      selectableCardIds.has(cardId)
    );
    const hasEquipmentCards = equipmentCardIds.some((cardId) =>
      selectableCardIds.has(cardId)
    );
    const location = hasHandCards && hasEquipmentCards
      ? "当前手牌或装备区"
      : hasEquipmentCards
        ? "当前装备区"
        : "当前手牌";
    uiShell().interface.Begin_ActionSkillMaterialSelection(
      `【${displayName}】选择 ${materialCount} 张牌`,
      cards,
      `直接点击${location}，选择 ${materialCount} 张材料牌当【${
        this.#registry.card(actions[0]!.definitionId).name
      }】使用或打出`,
      this.#selectedViewAsSkillMaterials(flow) !== undefined,
      true
    );
  }

  #selectedViewAsSkillMaterials(
    flow: ViewAsSkillMaterialFlow
  ): ViewAsAction[] | undefined {
    const matching = flow.actions.filter((action) =>
      action.materialCardIds.length === flow.selectedCardIds.size &&
      action.materialCardIds.every((cardId) =>
        flow.selectedCardIds.has(cardId)
      )
    );
    return matching.length > 0 ? matching : undefined;
  }

  #showViewAsSkillDefinitions(
    flow: ViewAsSkillMaterialFlow,
    actions: ViewAsAction[]
  ): void {
    const groups = new Map<string, ViewAsAction[]>();
    for (const action of actions) {
      groups.set(
        action.definitionId,
        [...(groups.get(action.definitionId) ?? []), action]
      );
    }
    if (groups.size === 1) {
      this.#showViewAsSkillTargets(flow, [...groups.values()][0]!);
      return;
    }
    this.#showActionSkillOptions(
      `【${flow.displayName}】选择要转化的牌`,
      [
        ...[...groups.entries()].map(([definitionId, group]) => ({
          label: this.#registry.card(definitionId).name,
          run: () => this.#showViewAsSkillTargets(flow, group)
        })),
        {
          label: "返回选择材料",
          run: () => this.#showViewAsSkillMaterials(
            flow.source,
            flow.skillId,
            flow.displayName,
            flow.actions,
            flow.revision
          )
        }
      ]
    );
  }

  #showViewAsSkillTargets(
    flow: ViewAsSkillMaterialFlow,
    actions: ViewAsAction[]
  ): void {
    const response = actions.find((
      action
    ): action is Extract<ViewAsAction, {
      type: "respond-virtual-card";
    }> => action.type === "respond-virtual-card");
    if (response) {
      this.#submitViewAsSkill(response, flow.revision);
      return;
    }
    const uses = actions.filter((
      action
    ): action is Extract<ViewAsAction, {
      type: "use-virtual-card";
    }> => action.type === "use-virtual-card");
    const groups = new Map<string, typeof uses>();
    for (const action of uses) {
      const key = JSON.stringify(action.targetIds);
      groups.set(key, [...(groups.get(key) ?? []), action]);
    }
    this.#showActionSkillOptions(
      `【${flow.displayName}】选择目标`,
      [
        ...[...groups.values()].map((group) => ({
          label: group[0]!.targetIds.length === 0
            ? "无需目标"
            : group[0]!.targetIds.map((playerId) =>
                this.#playerById.get(playerId)?.hero.name ?? playerId
              ).join("、"),
          run: () => this.#submitViewAsSkill(
            group[0]!,
            flow.revision
          )
        })),
        {
          label: "返回选择材料",
          run: () => this.#showViewAsSkillMaterials(
            flow.source,
            flow.skillId,
            flow.displayName,
            flow.actions,
            flow.revision
          )
        }
      ]
    );
  }

  #submitViewAsSkill(
    action: ViewAsAction,
    revision: number
  ): void {
    if (this.session.state().revision !== revision) {
      throw new Error("view-as skill state changed before submission");
    }
    const legal = this.session.legalActions().find((candidate) =>
      (candidate.type === "use-virtual-card" ||
        candidate.type === "respond-virtual-card") &&
      canonicalJson(candidate) === canonicalJson(action)
    );
    if (!legal) throw new Error("view-as skill action is no longer legal");
    this.#submit(legal);
  }

  #cancelViewAsSkillFlow(revision: number): void {
    if (this.session.state().revision !== revision) {
      throw new Error("view-as skill state changed before cancellation");
    }
    this.#resetViewAsSkillFlow();
    this.#refreshSkillActivatorStates();
    const state = this.session.state();
    const actorId = state.pendingDecision?.request.playerId ??
      state.currentPlayerId;
    const actor = this.#playerById.get(actorId);
    if (!actor) throw new Error("view-as skill actor is missing");
    if (state.pendingDecision?.request.type === "respond-card") {
      actor.ask_card(this.choice[0]);
    } else {
      actor.choice_card();
    }
  }

  #showActionSkillOptions(
    title: string,
    options: Array<{ label: string; run: () => void }>
  ): void {
    this.#actionSkillOptionHandlers.clear();
    const labels: string[] = [];
    const occurrences = new Map<string, number>();
    for (const option of options) {
      const occurrence = (occurrences.get(option.label) ?? 0) + 1;
      occurrences.set(option.label, occurrence);
      const label = occurrence === 1
        ? option.label
        : `${option.label} #${occurrence}`;
      labels.push(label);
      this.#actionSkillOptionHandlers.set(label, option.run);
    }
    uiShell().interface.Show_OptionChooseBox(title, labels);
  }

  #showActionSkillMaterials(
    allActions: Array<Extract<LegalAction, { type: "activate-skill" }>>,
    skillId: string,
    actions: Array<Extract<LegalAction, { type: "activate-skill" }>>,
    revision: number
  ): void {
    const selectableCardIds = new Set(
      actions.flatMap((action) => action.materialCardIds)
    );
    if (selectableCardIds.size > 0) {
      this.#showDirectActionSkillMaterials(
        allActions,
        skillId,
        actions,
        revision
      );
      return;
    }
    const groups = new Map<string, typeof actions>();
    for (const action of actions) {
      const key = JSON.stringify(action.materialCardIds);
      groups.set(key, [...(groups.get(key) ?? []), action]);
    }
    const skillName = this.#registry.skill(skillId).name;
    this.#showActionSkillOptions(
      `【${skillName}】选择材料牌`,
      [
        ...[...groups.values()].map((group) => {
          const materialIds = group[0]!.materialCardIds;
          return {
            label: materialIds.length === 0
              ? "无需材料"
              : materialIds.map((cardId) =>
                  this.#uiCardById.get(cardId)?.name ?? cardId
                ).join("、"),
            run: () => this.#showActionSkillTargets(
              allActions,
              skillId,
              actions,
              group,
              revision
            )
          };
        }),
        {
          label: "取消发动",
          run: () => this.#cancelActionSkillFlow(revision)
        }
      ]
    );
  }

  #showDirectActionSkillMaterials(
    allActions: Array<Extract<LegalAction, { type: "activate-skill" }>>,
    skillId: string,
    actions: Array<Extract<LegalAction, { type: "activate-skill" }>>,
    revision: number
  ): void {
    const state = this.session.state();
    if (state.revision !== revision) {
      throw new Error("active skill state changed before material selection");
    }
    const selectableCardIds = new Set(
      actions.flatMap((action) => action.materialCardIds)
    );
    const ownerId = actions[0]!.playerId;
    const handCardIds = state.zones[handZone(ownerId)] ?? [];
    const equipmentCardIds = state.zones[equipmentZone(ownerId)] ?? [];
    const cards = [
      ...handCardIds,
      ...equipmentCardIds
    ]
      .filter((cardId) => selectableCardIds.has(cardId))
      .map((cardId) => this.#uiCardById.get(cardId))
      .filter((card): card is UiCardViewModel => card !== undefined);
    const flow: ActionSkillMaterialFlow = {
      allActions,
      skillId,
      actions,
      revision,
      selectableCardIds,
      selectedCardIds: new Set()
    };
    this.#actionSkillMaterialFlow = flow;
    this.#actionSkillOptionHandlers.clear();
    this.#refreshSkillActivatorStates();
    const hasHandCards = handCardIds.some((cardId) =>
      selectableCardIds.has(cardId)
    );
    const hasEquipmentCards = equipmentCardIds.some((cardId) =>
      selectableCardIds.has(cardId)
    );
    const location = hasHandCards && hasEquipmentCards
      ? "当前手牌或装备区"
      : hasEquipmentCards
        ? "当前装备区"
        : "当前手牌";
    uiShell().interface.Begin_ActionSkillMaterialSelection(
      `【${this.#registry.skill(skillId).name}】选择材料牌`,
      cards,
      `直接点击${location}选择；可多选，不再枚举牌的组合`,
      this.#selectedActionSkillMaterials(flow) !== undefined,
      true
    );
  }

  toggle_action_skill_material(card: UiCardViewModel): {
    selected: boolean;
    selectedCount: number;
    canConfirm: boolean;
  } {
    const viewAsFlow = this.#viewAsSkillMaterialFlow;
    if (viewAsFlow) {
      const cardId = this.#cardIdByUiCardViewModel.get(card);
      if (
        this.session.state().revision !== viewAsFlow.revision ||
        !cardId ||
        !viewAsFlow.selectableCardIds.has(cardId)
      ) {
        throw new Error("view-as skill material card is not selectable");
      }
      if (viewAsFlow.selectedCardIds.has(cardId)) {
        viewAsFlow.selectedCardIds.delete(cardId);
      } else {
        viewAsFlow.selectedCardIds.add(cardId);
      }
      return {
        selected: viewAsFlow.selectedCardIds.has(cardId),
        selectedCount: viewAsFlow.selectedCardIds.size,
        canConfirm:
          this.#selectedViewAsSkillMaterials(viewAsFlow) !== undefined
      };
    }
    const flow = this.#actionSkillMaterialFlow;
    const cardId = this.#cardIdByUiCardViewModel.get(card);
    if (flow) {
      if (
        this.session.state().revision !== flow.revision ||
        !cardId ||
        !flow.selectableCardIds.has(cardId)
      ) {
        throw new Error("active skill material card is not selectable");
      }
      if (flow.selectedCardIds.has(cardId)) {
        flow.selectedCardIds.delete(cardId);
      } else {
        flow.selectedCardIds.add(cardId);
      }
      return {
        selected: flow.selectedCardIds.has(cardId),
        selectedCount: flow.selectedCardIds.size,
        canConfirm: this.#selectedActionSkillMaterials(flow) !== undefined
      };
    }
    const decisionFlow = this.#decisionMaterialFlow;
    const pending = this.session.state().pendingDecision?.request;
    if (
      !decisionFlow ||
      this.session.state().revision !== decisionFlow.revision ||
      pending?.id !== decisionFlow.decisionId ||
      !cardId ||
      !decisionFlow.selectableCardIds.has(cardId)
    ) {
      throw new Error("decision material card is not selectable");
    }
    if (decisionFlow.selectedCardIds.has(cardId)) {
      decisionFlow.selectedCardIds.delete(cardId);
    } else {
      decisionFlow.selectedCardIds.add(cardId);
    }
    return {
      selected: decisionFlow.selectedCardIds.has(cardId),
      selectedCount: decisionFlow.selectedCardIds.size,
      canConfirm:
        this.#selectedDecisionMaterials(decisionFlow) !== undefined
    };
  }

  confirm_action_skill_material(): void {
    const viewAsFlow = this.#viewAsSkillMaterialFlow;
    if (viewAsFlow) {
      const matching = this.#selectedViewAsSkillMaterials(viewAsFlow);
      if (!matching) {
        throw new Error("selected view-as skill materials are not legal");
      }
      this.#showViewAsSkillDefinitions(viewAsFlow, matching);
      return;
    }
    const flow = this.#actionSkillMaterialFlow;
    if (flow) {
      const matching = this.#selectedActionSkillMaterials(flow);
      if (!matching) {
        throw new Error("selected active skill materials are not legal");
      }
      this.#actionSkillMaterialFlow = null;
      this.#showActionSkillTargets(
        flow.allActions,
        flow.skillId,
        flow.actions,
        matching,
        flow.revision
      );
      return;
    }
    const decisionFlow = this.#decisionMaterialFlow;
    if (!decisionFlow) throw new Error("material selection flow is not open");
    const matching = this.#selectedDecisionMaterials(decisionFlow);
    if (!matching) {
      throw new Error("selected decision materials are not legal");
    }
    this.#shownDecisionId = null;
    this.#submit(matching);
  }

  back_action_skill_material(): void {
    const viewAsFlow = this.#viewAsSkillMaterialFlow;
    if (viewAsFlow) {
      this.#cancelViewAsSkillFlow(viewAsFlow.revision);
      return;
    }
    const flow = this.#actionSkillMaterialFlow;
    if (flow) {
      this.#cancelActionSkillFlow(flow.revision);
      return;
    }
    if (this.#decisionMaterialFlow) {
      throw new Error("pending card selection cannot be cancelled");
    }
    throw new Error("material selection flow is not open");
  }

  #selectedActionSkillMaterials(
    flow: ActionSkillMaterialFlow
  ): ActiveSkillAction[] | undefined {
    const matching = flow.actions.filter((action) =>
      action.materialCardIds.length === flow.selectedCardIds.size &&
      action.materialCardIds.every((cardId) =>
        flow.selectedCardIds.has(cardId)
      )
    );
    return matching.length > 0 ? matching : undefined;
  }

  #selectedDecisionMaterials(
    flow: DecisionMaterialFlow
  ): Extract<LegalAction, { type: "choose-cards" }> | undefined {
    return flow.actions.find((action) =>
      action.cardIds.length === flow.selectedCardIds.size &&
      action.cardIds.every((cardId) => flow.selectedCardIds.has(cardId))
    );
  }

  #cancelActionSkillFlow(revision: number): void {
    const state = this.session.state();
    if (state.revision !== revision) {
      throw new Error("active skill state changed before cancellation");
    }
    this.#resetActionSkillFlow();
    const current = this.#playerById.get(state.currentPlayerId);
    if (!current) throw new Error("current player is missing");
    current.choice_card();
  }

  activate_action_skill(skillId: string): void {
    const state = this.session.state();
    const legal = this.session.legalActions();
    const viewAsActions = legal.filter((
      action
    ): action is ViewAsAction =>
      (action.type === "use-virtual-card" ||
        action.type === "respond-virtual-card") &&
      action.skillId === skillId &&
      this.#isSkillVirtualAction(action)
    );
    if (viewAsActions.length > 0) {
      this.#resetActionSkillFlow();
      this.#showViewAsSkillMaterials(
        "skill",
        skillId,
        this.#registry.skill(skillId).name,
        viewAsActions,
        state.revision
      );
      return;
    }
    const activeSkills = legal.filter((
      action
    ): action is ActiveSkillAction =>
      action.type === "activate-skill"
    );
    const actions = activeSkills.filter((action) =>
      action.skillId === skillId
    );
    if (
      state.phase !== "action" ||
      state.pendingDecision ||
      actions.length === 0
    ) {
      throw new Error("selected active skill is not currently legal");
    }
    this.#actionSkillFlowRevision = state.revision;
    this.#showActionSkillMaterials(
      activeSkills,
      skillId,
      actions,
      state.revision
    );
  }

  activate_equipment_skill(skillId: string): void {
    const state = this.session.state();
    const actions = this.session.legalActions().filter((
      action
    ): action is ViewAsAction =>
      (action.type === "use-virtual-card" ||
        action.type === "respond-virtual-card") &&
      action.skillId === skillId &&
      this.#isEquipmentVirtualAction(action)
    );
    const playerId = actions[0]?.playerId;
    const cardName = playerId
      ? this.#equipmentCardName(playerId, skillId)
      : undefined;
    if (actions.length === 0 || !cardName) {
      throw new Error("selected equipment skill is not currently legal");
    }
    this.#resetActionSkillFlow();
    this.#showViewAsSkillMaterials(
      "equipment",
      skillId,
      cardName,
      actions,
      state.revision
    );
  }

  #setActionSkillTags(
    player: UiPlayerViewModel | undefined,
    actions: Array<ActiveSkillAction | ViewAsAction>
  ): void {
    const localPlayer = this.player.find((candidate) => !candidate.isAI);
    if (!localPlayer) return;
    const available = player?.id === localPlayer.id ? actions : [];
    const activeSkillId = this.#viewAsSkillMaterialFlow?.source === "skill"
      ? this.#viewAsSkillMaterialFlow.skillId
      : this.#actionSkillMaterialFlow?.skillId;
    const skills = [...new Set(available.map((action) => action.skillId))]
      .map((id) => ({
        id,
        name: this.#registry.skill(id).name,
        active: id === activeSkillId
      }));
    uiShell().interface.Set_Action_Skill_Tags?.(localPlayer, skills);
  }

  #showActionSkillTargets(
    allActions: Array<Extract<LegalAction, { type: "activate-skill" }>>,
    skillId: string,
    materialActions: Array<Extract<
      LegalAction,
      { type: "activate-skill" }
    >>,
    actions: Array<Extract<LegalAction, { type: "activate-skill" }>>,
    revision: number
  ): void {
    this.#actionSkillMaterialFlow = null;
    const groups = new Map<string, typeof actions>();
    for (const action of actions) {
      const key = JSON.stringify(action.targetIds);
      groups.set(key, [...(groups.get(key) ?? []), action]);
    }
    if (groups.size === 1) {
      const onlyGroup = [...groups.values()][0]!;
      if (onlyGroup[0]!.targetIds.length === 0) {
        this.#submitActionSkill(onlyGroup[0]!, revision);
        return;
      }
    }
    const skillName = this.#registry.skill(skillId).name;
    this.#showActionSkillOptions(
      `【${skillName}】选择目标`,
      [
        ...[...groups.values()].map((group) => {
          const targetIds = group[0]!.targetIds;
          return {
            label: targetIds.length === 0
              ? "无需目标"
              : targetIds.map((playerId) =>
                  this.#playerById.get(playerId)?.hero.name ?? playerId
                ).join("、"),
            run: () => this.#submitActionSkill(group[0]!, revision)
          };
        }),
        {
          label: "返回材料选择",
          run: () => this.#showActionSkillMaterials(
            allActions,
            skillId,
            materialActions,
            revision
          )
        }
      ]
    );
  }

  #submitActionSkill(
    action: Extract<LegalAction, { type: "activate-skill" }>,
    revision: number
  ): void {
    const current = this.session.state();
    if (current.revision !== revision) {
      throw new Error("active skill state changed before submission");
    }
    const legal = this.session.legalActions().find((candidate) =>
      candidate.type === "activate-skill" &&
      canonicalJson(candidate) === canonicalJson(action)
    );
    if (!legal) throw new Error("active skill action is no longer legal");
    this.#resetActionSkillFlow();
    this.#submit(legal);
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

  arrange_guanxing(
    topCards: UiCardViewModel[],
    bottomCards: UiCardViewModel[]
  ): void {
    const pending = this.session.state().pendingDecision;
    if (
      pending?.request.type !== "choose-option" ||
      pending.request.reason !== "guanxing-top" ||
      pending.continuation.type !== "workflow"
    ) {
      throw new Error("guanxing arrangement is not currently pending");
    }
    const available = pending.continuation.resume.data.availableCardIds;
    if (
      !Array.isArray(available) ||
      !available.every((cardId): cardId is CardInstanceId =>
        typeof cardId === "string"
      )
    ) {
      throw new Error("guanxing arrangement has no available cards");
    }
    const cardIds = (
      cards: UiCardViewModel[]
    ): CardInstanceId[] => cards.map((card) => {
      const cardId = this.#cardIdByUiCardViewModel.get(card);
      if (!cardId) throw new Error("guanxing card is not bound to Core");
      return cardId;
    });
    const topCardIds = cardIds(topCards);
    const bottomCardIds = cardIds(bottomCards);
    const arranged = [...topCardIds, ...bottomCardIds];
    if (
      arranged.length !== available.length ||
      new Set(arranged).size !== arranged.length ||
      [...arranged].sort().join("\u0000") !==
        [...available].sort().join("\u0000")
    ) {
      throw new Error("guanxing arrangement must contain every revealed card");
    }

    const chooseOption = (option: string): void => {
      const command = this.session.legalActions().find((
        action
      ): action is Extract<LegalAction, { type: "choose-option" }> =>
        action.type === "choose-option" && action.option === option
      );
      if (!command) {
        throw new Error(`guanxing option is no longer legal: ${option}`);
      }
      this.#submit(command, false);
    };
    const chooseCard = (cardId: CardInstanceId): void => {
      const command = this.session.legalActions().find((
        action
      ): action is Extract<LegalAction, { type: "choose-cards" }> =>
        action.type === "choose-cards" &&
        action.cardIds.length === 1 &&
        action.cardIds[0] === cardId
      );
      if (!command) {
        throw new Error(`guanxing card is no longer legal: ${cardId}`);
      }
      this.#submit(command, false);
    };

    for (const cardId of topCardIds) {
      chooseOption("select");
      chooseCard(cardId);
    }
    if (bottomCardIds.length > 0) {
      chooseOption("finish");
      for (const cardId of bottomCardIds.slice(0, -1)) {
        chooseCard(cardId);
      }
    }
    if (this.session.state().pendingDecision) {
      throw new Error("guanxing arrangement did not finish");
    }
    this.#shownDecisionId = null;
    this.#scheduleAdvance(0);
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

  #guhuoDecisionSummary(command: GameCommand): {
    source: UiPlayerViewModel;
    questioned: UiPlayerViewModel[];
    trusted: UiPlayerViewModel[];
  } | null {
    const pending = this.session.state().pendingDecision;
    if (
      command.type !== "choose-option" ||
      pending?.request.type !== "choose-option" ||
      pending.request.reason !== "guhuo-question" ||
      pending.request.id !== command.decisionId ||
      pending.continuation.type !== "workflow"
    ) return null;
    const data = pending.continuation.resume.data;
    const challengers = Array.isArray(data.challengers)
      ? data.challengers.filter((id): id is PlayerId => typeof id === "string")
      : [];
    const index = typeof data.index === "number" ? data.index : 0;
    if (challengers.length === 0 || index !== challengers.length - 1) {
      return null;
    }
    const questionedIds = new Set(
      Array.isArray(data.questioned)
        ? data.questioned.filter((id): id is PlayerId => typeof id === "string")
        : []
    );
    if (command.option === "question") questionedIds.add(command.playerId);
    const source = this.#playerById.get(
      pending.continuation.resume.context.sourceId
    );
    if (!source) return null;
    const players = challengers
      .map((id) => this.#playerById.get(id))
      .filter((player): player is UiPlayerViewModel => player !== undefined);
    return {
      source,
      questioned: players.filter((player) => questionedIds.has(player.id)),
      trusted: players.filter((player) => !questionedIds.has(player.id))
    };
  }

  #submit(command: GameCommand, schedule = true): DispatchResult {
    const guhuoSummary = this.#guhuoDecisionSummary(command);
    this.#resetActionSkillFlow();
    this.#resetViewAsSkillFlow();
    this.#resetDecisionMaterialFlow();
    let result: DispatchResult;
    try {
      result = this.session.dispatch(command);
    } catch (error) {
      this.#lastFailureContext = {
        operation: "dispatch",
        attemptedCommand: structuredClone(command)
      };
      throw error;
    }
    this.#diagnosticCommandIndex += 1;
    this.#diagnosticQueue = this.#diagnosticQueue
      .then(() => this.#diagnosticRecorder.dispatch(command))
      .catch((error: unknown) => {
        if (!this.#diagnosticRecorder.hasFailure()) {
          this.#diagnosticRecorder.recordFailure({
            index: this.#diagnosticCommandIndex,
            stage: "dispatch",
            message: error instanceof Error ? error.message : String(error),
            command
          });
        }
    });
    this.#syncProjection();
    this.#refreshSkillActivatorStates();
    if (guhuoSummary) {
      this.notify(
        "guhuo_decisions",
        guhuoSummary.source,
        guhuoSummary.questioned,
        guhuoSummary.trusted
      );
    }
    this.#playEvents(result);
    void this.#signal("state_changed", this.session.state(), result.events);
    const ended = result.events.find((
      event
    ): event is Extract<typeof event, { type: "GameEnded" }> =>
      event.type === "GameEnded"
    );
    if (ended) {
      this.pause();
      void this.#visualBarrier.then(() =>
        this.#signal("game_ended", this.session.state(), ended.winnerIds)
      );
    } else if (schedule) {
      this.#scheduleAdvance(0);
    }
    return result;
  }

  #resetDiagnosticRecorder(scenario: string): void {
    this.#diagnosticRecorder = new JsonlReplayRecorder(
      new GameSession(this.session.state(), this.#registry),
      this.#registry,
      scenario
    );
    this.#diagnosticQueue = Promise.resolve();
    this.#diagnosticCommandIndex = 0;
    this.#lastFailureContext = null;
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
      this.#resetDecisionMaterialFlow();
      return;
    }
    if (
      this.#decisionMaterialFlow &&
      this.#decisionMaterialFlow.decisionId !== pending.id
    ) {
      this.#resetDecisionMaterialFlow();
    }
    const player = this.#playerById.get(pending.playerId)!;
    const source = this.#playerById.get(state.currentPlayerId) ?? player;
    const data = pending.type === "respond-card"
      ? RESPONSE_NAME[pending.responseKind]
      : "选择牌";
    this.choice = [{ id: pending.id, source, target: player, data }];
  }

  #playEvents(result: DispatchResult): void {
    const visualStart = this.#visualEvents.length;
    const state = this.session.state();
    const audioCues = deriveAudioCues(result, state, {
      cardDefinitionId: (cardId, materialCardIds) => {
        const direct = state.cards[cardId]?.definitionId;
        if (direct) return direct;
        return materialCardIds?.map((id) => state.cards[id]?.definitionId)
          .find((id) => id !== undefined);
      },
      cardCategory: (cardId, materialCardIds) => {
        const definitionId = state.cards[cardId]?.definitionId ??
          materialCardIds?.map((id) => state.cards[id]?.definitionId)
            .find((id) => id !== undefined);
        return definitionId && this.#registry.hasCard(definitionId)
          ? this.#registry.card(definitionId).category
          : undefined;
      }
    });
    const heroAudioCues = deriveHeroAudioCues(result, state, {
      cardDefinitionId: (cardId, materialCardIds) => {
        const direct = state.cards[cardId]?.definitionId;
        if (direct) return direct;
        return materialCardIds?.map((id) => state.cards[id]?.definitionId)
          .find((id) => id !== undefined);
      }
    });
    const audioCuesBySequence = new Map<number, typeof audioCues>();
    for (const cue of audioCues) {
      audioCuesBySequence.set(cue.eventSequence, [
        ...(audioCuesBySequence.get(cue.eventSequence) ?? []),
        cue
      ]);
    }
    const heroAudioCuesBySequence =
      new Map<number, typeof heroAudioCues>();
    for (const cue of heroAudioCues) {
      if (cue.eventSequence === undefined) continue;
      heroAudioCuesBySequence.set(cue.eventSequence, [
        ...(heroAudioCuesBySequence.get(cue.eventSequence) ?? []),
        cue
      ]);
    }
    const drawn = new Map<PlayerId, UiCardViewModel[]>();
    const changedHands = new Set<PlayerId>();
    const replacedEquipmentIds = new Set(
      result.events.flatMap((event) =>
        event.type === "EquipmentChanged" && event.replacedCardId
          ? [event.replacedCardId]
          : []
      )
    );
    for (const event of result.events) {
      for (const cue of audioCuesBySequence.get(event.sequence) ?? []) {
        void this.#signal("audio_cue", cue);
      }
      for (const cue of heroAudioCuesBySequence.get(event.sequence) ?? []) {
        void this.#signal("hero_audio_cue", cue);
      }
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
        if (target) this.notify("damage", source, target, event);
      } else if (event.type === "HpRecovered") {
        const player = this.#playerById.get(event.playerId);
        if (player) this.notify("recover", player, event);
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
      } else if (
        event.type === "CardMoved" &&
        event.from.startsWith("zone:equipment:") &&
        !replacedEquipmentIds.has(event.cardId)
      ) {
        const playerId = event.from.slice("zone:equipment:".length);
        const player = this.#playerById.get(playerId);
        const card = this.#uiCardById.get(event.cardId);
        if (player && card) {
          this.notify(
            "equip_off",
            player,
            card,
            uiShell().EQUIP_TYPE_MAPPING[card.name],
            event.to
          );
        }
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
    const actual = this.#visualEvents.slice(visualStart).map((event) => ({
      type: event.type,
      playerIds: event.playerIds,
      cardIds: event.cardIds
    }));
    const expected = deriveAnimationSemantics(result, state, {
      displayCardId: (cardId, materialCardIds) => {
        if (this.#uiCardById.has(cardId)) return cardId;
        return materialCardIds?.find((id) => this.#uiCardById.has(id));
      },
      cardCategory: (cardId) => {
        const definitionId = state.cards[cardId]?.definitionId;
        return definitionId && this.#registry.hasCard(definitionId)
          ? this.#registry.card(definitionId).category
          : undefined;
      }
    });
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw new Error(
        `animation semantic contract mismatch\n` +
        `expected: ${canonicalJson(expected)}\n` +
        `actual: ${canonicalJson(actual)}`
      );
    }
  }

  #decisionPrompt(
    state: GameState,
    pending: NonNullable<GameState["pendingDecision"]>
  ): { title: string; contextText: string } {
    const request = pending.request;
    const continuation = pending.continuation;
    let sourceId: PlayerId | undefined;
    let targetIds: PlayerId[] = [];
    if (continuation.type === "workflow") {
      sourceId = continuation.resume.context.sourceId;
      targetIds = [...continuation.resume.context.targetIds];
    } else if (continuation.type === "nullification") {
      sourceId = continuation.sourceId;
      targetIds = continuation.targetId ? [continuation.targetId] : [];
    } else if (continuation.type === "rescue") {
      sourceId = continuation.sourceId ?? undefined;
      targetIds = [continuation.playerId];
    } else if (continuation.type === "judgment-response") {
      sourceId = continuation.playerId;
      targetIds = [continuation.playerId];
    } else if (
      continuation.type === "discard-effect-replacement" ||
      continuation.type === "delegated-response" ||
      continuation.type === "optional-effect"
    ) {
      sourceId = continuation.playerId;
    } else if (continuation.type === "target-redirection") {
      sourceId = continuation.sourceId;
      targetIds = [continuation.playerId];
    }
    sourceId ??= state.cards[request.cardId]?.sourcePlayerId;

    const playerName = (playerId: PlayerId): string =>
      this.#playerById.get(playerId)?.hero.name ?? playerId;
    const parts: string[] = [];
    if (sourceId) parts.push(`发起者：${playerName(sourceId)}`);
    parts.push(`决策者：${playerName(request.playerId)}`);
    if (request.type === "select-players") {
      parts.push(
        `候选目标：${request.selectablePlayerIds.map(playerName).join("、")}`
      );
    } else if (targetIds.length > 0) {
      parts.push(`目标：${unique(targetIds).map(playerName).join("、")}`);
    }

    const card = state.cards[request.cardId];
    if (card?.definitionId && this.#registry.hasCard(card.definitionId)) {
      parts.push(`关联牌：【${this.#registry.card(card.definitionId).name}】`);
    } else if (card?.definitionId.startsWith("skill:")) {
      const skillId = card.definitionId.slice("skill:".length);
      parts.push(`技能：【${this.#registry.skill(skillId).name}】`);
    }
    return {
      title: decisionRequestTitle(request),
      contextText: parts.join(" ｜ ")
    };
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

  #responseAffectsPlayer(
    state: GameState,
    pending: NonNullable<GameState["pendingDecision"]>,
    playerId: PlayerId
  ): boolean {
    const request = pending.request;
    const continuation = pending.continuation;
    if (request.type !== "respond-card") return false;
    if (request.responseKind === "peach") {
      return continuation.type === "rescue" &&
        continuation.playerId === playerId;
    }
    if (
      request.responseKind !== "nullification" ||
      continuation.type !== "nullification"
    ) {
      return false;
    }
    if (continuation.targetId !== undefined) {
      return continuation.targetId === playerId;
    }
    const judgmentOwner = state.turnOrder.find((candidateId) =>
      (state.zones[judgmentZone(candidateId)] ?? [])
        .includes(continuation.cardId)
    );
    if (judgmentOwner) return judgmentOwner === playerId;
    const delayedPlacement = [...state.eventLog].reverse().find((event) =>
      event.type === "DelayedCardPlaced" &&
      event.cardId === continuation.cardId
    );
    if (delayedPlacement?.type === "DelayedCardPlaced") {
      return delayedPlacement.playerId === playerId;
    }
    const used = [...state.eventLog].reverse().find((event) =>
      event.type === "CardUsed" && event.cardId === continuation.cardId
    );
    if (used?.type === "CardUsed" && used.targetIds.length > 0) {
      return used.targetIds.includes(playerId);
    }
    const definitionId = state.cards[continuation.cardId]?.definitionId;
    if (
      definitionId === "standard:god-salvation" ||
      definitionId === "standard:amazing-grace"
    ) {
      return true;
    }
    if (
      definitionId === "standard:savage-assault" ||
      definitionId === "standard:archery-attack"
    ) {
      return continuation.sourceId !== playerId;
    }
    return continuation.sourceId === playerId;
  }

  #disabledResponsePass(
    state: GameState,
    pending: NonNullable<GameState["pendingDecision"]>,
    player: UiPlayerViewModel,
    legal: LegalAction[]
  ): Extract<LegalAction, { type: "pass" }> | undefined {
    const request = pending.request;
    if (
      request.type !== "respond-card" ||
      this.#responseAffectsPlayer(state, pending, player.id)
    ) {
      return undefined;
    }
    const disabled =
      request.responseKind === "nullification"
        ? !this.#shouldPromptForNullification()
        : request.responseKind === "peach"
          ? !this.#shouldPromptForPeach()
          : false;
    if (!disabled) return undefined;
    const pass = legal.find((action): action is Extract<
      LegalAction,
      { type: "pass" }
    > => action.type === "pass");
    if (!pass) {
      throw new Error(`disabled ${request.responseKind} prompt cannot pass`);
    }
    return pass;
  }

  #advance(): void {
    if (this.#paused) return;
    const state = this.session.state();
    const current = this.#playerById.get(state.currentPlayerId);
    this.#setActionSkillTags(current, []);
    this.#setEquipmentSkillStates(current, []);
    if (state.phase === "finished") return;
    const pendingDecision = state.pendingDecision;
    const pending = pendingDecision?.request;
    if (pending) {
      const player = this.#playerById.get(pending.playerId)!;
      const legal = this.session.legalActions();
      if (!player.isAI) {
        const disabledResponsePass = this.#disabledResponsePass(
          state,
          pendingDecision,
          player,
          legal
        );
        if (disabledResponsePass) {
          this.#submit(disabledResponsePass);
          return;
        }
        this.#setActionSkillTags(
          player,
          legal.filter((
            action
          ): action is ViewAsAction =>
            (action.type === "use-virtual-card" ||
              action.type === "respond-virtual-card") &&
            this.#isSkillVirtualAction(action)
          )
        );
        this.#setEquipmentSkillStates(
          player,
          legal.filter((
            action
          ): action is ViewAsAction =>
            (action.type === "use-virtual-card" ||
              action.type === "respond-virtual-card") &&
            this.#isEquipmentVirtualAction(action)
          )
        );
        const prompt = this.#decisionPrompt(state, pendingDecision);
        if (pending.type === "respond-card") {
          if (legal.length === 1 && legal[0]?.type === "pass") {
            this.#submit(legal[0]);
            return;
          }
          player.ask_card(this.choice[0]);
          return;
        }
        if (pending.type === "choose-option") {
          if (pending.reason === "guanxing-top") {
            if (this.#shownDecisionId !== pending.id) {
              const available =
                pendingDecision.continuation.type === "workflow"
                  ? pendingDecision.continuation.resume.data.availableCardIds
                  : undefined;
              const cards = Array.isArray(available)
                ? available
                    .filter((cardId): cardId is CardInstanceId =>
                      typeof cardId === "string"
                    )
                    .map((cardId) => this.#uiCardById.get(cardId))
                    .filter((
                      card
                    ): card is UiCardViewModel => card !== undefined)
                : [];
              if (cards.length === 0) {
                throw new Error("guanxing has no cards to arrange");
              }
              this.#shownDecisionId = pending.id;
              uiShell().interface.Show_GuanxingArrangeBox(
                "观星：调整牌堆顺序",
                cards,
                [
                  prompt.contextText,
                  "牌堆顶从左到右依次生效；拖过分隔线可置于牌堆底，最右最后"
                ].filter(Boolean).join("；")
              );
            }
            return;
          }
          if (this.#shownDecisionId !== pending.id) {
            this.#shownDecisionId = pending.id;
            uiShell().interface.Show_OptionChooseBox(
              prompt.title,
              pending.options.map((option) => ({
                label: optionLabel(option),
                value: option
              })),
              prompt.contextText
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
              prompt.title,
              options,
              prompt.contextText
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
            : prompt.title;
          this.#shownDecisionId = pending.id;
          const ownHandZone = handZone(pending.playerId);
          const ownEquipmentZone = equipmentZone(pending.playerId);
          const isOwnVisibleMaterialChoice =
            entries.length > 0 &&
            entries.every((entry) =>
              entry.zoneId === ownHandZone ||
              entry.zoneId === ownEquipmentZone
            );
          if (isOwnVisibleMaterialChoice) {
            const actions = legal.filter((
              action
            ): action is Extract<LegalAction, { type: "choose-cards" }> =>
              action.type === "choose-cards" &&
              action.decisionId === pending.id
            );
            const flow: DecisionMaterialFlow = {
              decisionId: pending.id,
              revision: state.revision,
              actions,
              selectableCardIds: new Set(pending.selectableCardIds),
              selectedCardIds: new Set()
            };
            this.#decisionMaterialFlow = flow;
            const hasHandCards = entries.some(
              (entry) => entry.zoneId === ownHandZone
            );
            const hasEquipmentCards = entries.some(
              (entry) => entry.zoneId === ownEquipmentZone
            );
            const location = hasHandCards && hasEquipmentCards
              ? "当前手牌或装备区"
              : hasEquipmentCards
                ? "当前装备区"
                : "当前手牌";
            uiShell().interface.Begin_ActionSkillMaterialSelection(
              title,
              cards,
              [
                prompt.contextText,
                `直接点击${location}选择`
              ].filter(Boolean).join("；"),
              this.#selectedDecisionMaterials(flow) !== undefined,
              false
            );
          } else {
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
                    ),
                    contextText: prompt.contextText
                  }
                : { contextText: prompt.contextText }
            );
          }
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
    if (!current) throw new Error("current player is missing");
    if (state.phase === "judgment" || state.phase === "draw") {
      this.#submit({ type: "advance-phase", playerId: current.id });
      return;
    }
    if (state.phase === "action") {
      if (!current.isAI) {
        const legal = this.session.legalActions();
        const activeSkills = legal.filter((
          action
        ): action is ActiveSkillAction | ViewAsAction =>
          action.type === "activate-skill" ||
          (
            (action.type === "use-virtual-card" ||
              action.type === "respond-virtual-card") &&
            this.#isSkillVirtualAction(action)
          )
        );
        const equipmentSkills = legal.filter((
          action
        ): action is ViewAsAction =>
          (action.type === "use-virtual-card" ||
            action.type === "respond-virtual-card") &&
          this.#isEquipmentVirtualAction(action)
        );
        if (
          this.#actionSkillFlowRevision !== null &&
          this.#actionSkillFlowRevision !== state.revision
        ) {
          this.#resetActionSkillFlow();
        }
        this.#setActionSkillTags(current, activeSkills);
        this.#setEquipmentSkillStates(current, equipmentSkills);
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
      const legal = this.session.legalActions();
      const discard = legal.find((
        action
      ): action is Extract<LegalAction, { type: "discard-cards" }> =>
        action.type === "discard-cards"
      );
      if (discard) {
        current.begin_discard(discard.cardIds.length);
        return;
      }
      const endTurn = legal.find((
        action
      ): action is Extract<LegalAction, { type: "end-turn" }> =>
        action.type === "end-turn"
      );
      if (!endTurn) throw new Error("discard phase has no legal action");
      this.#submit(endTurn);
      return;
    }
    this.#submit(this.#aiAgent.chooseAction(observeForPlayer(
      state,
      current.id,
      this.#registry
    )));
  }
}
