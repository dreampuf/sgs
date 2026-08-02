import { ContentRegistry } from "../../core/registry";
import type {
  CardDefinition,
  ContentPack
} from "../../core/registry";
import {
  createStandardHeroDefinitions,
  createStandardSkillDefinitions,
  standardSkillId
} from "./heroes";
import {
  STANDARD_WORKFLOW,
  createStandardWorkflows
} from "./workflows";
import {
  createManeuveringPrints,
  createStandardPrints
} from "./decks";

export const STANDARD_CARD = {
  slash: "standard:slash",
  fireSlash: "standard:fire-slash",
  thunderSlash: "standard:thunder-slash",
  jink: "standard:jink",
  peach: "standard:peach",
  wine: "standard:wine",
  crossbow: "standard:crossbow",
  doubleSword: "standard:double-sword",
  qinggangSword: "standard:qinggang-sword",
  blade: "standard:blade",
  spear: "standard:spear",
  axe: "standard:axe",
  halberd: "standard:halberd",
  kylinBow: "standard:kylin-bow",
  iceSword: "standard:ice-sword",
  gudingBlade: "standard:guding-blade",
  fan: "standard:fan",
  eightDiagram: "standard:eight-diagram",
  renwangShield: "standard:renwang-shield",
  vine: "standard:vine",
  silverLion: "standard:silver-lion",
  jueying: "standard:jueying",
  dilu: "standard:dilu",
  zhuahuangfeidian: "standard:zhuahuangfeidian",
  hualiu: "standard:hualiu",
  chitu: "standard:chitu",
  dayuan: "standard:dayuan",
  zixing: "standard:zixing",
  amazingGrace: "standard:amazing-grace",
  godSalvation: "standard:god-salvation",
  savageAssault: "standard:savage-assault",
  archeryAttack: "standard:archery-attack",
  duel: "standard:duel",
  exNihilo: "standard:ex-nihilo",
  snatch: "standard:snatch",
  dismantlement: "standard:dismantlement",
  collateral: "standard:collateral",
  nullification: "standard:nullification",
  indulgence: "standard:indulgence",
  lightning: "standard:lightning",
  supplyShortage: "standard:supply-shortage",
  ironChain: "standard:iron-chain",
  fireAttack: "standard:fire-attack"
} as const;

export const STANDARD_CARD_IDS_BY_NAME: Readonly<Record<string, string>> = {
  "杀": STANDARD_CARD.slash,
  "火杀": STANDARD_CARD.fireSlash,
  "雷杀": STANDARD_CARD.thunderSlash,
  "闪": STANDARD_CARD.jink,
  "桃": STANDARD_CARD.peach,
  "酒": STANDARD_CARD.wine,
  "诸葛连弩": STANDARD_CARD.crossbow,
  "雌雄双股剑": STANDARD_CARD.doubleSword,
  "青釭剑": STANDARD_CARD.qinggangSword,
  "青龙偃月刀": STANDARD_CARD.blade,
  "丈八蛇矛": STANDARD_CARD.spear,
  "贯石斧": STANDARD_CARD.axe,
  "方天画戟": STANDARD_CARD.halberd,
  "麒麟弓": STANDARD_CARD.kylinBow,
  "寒冰剑": STANDARD_CARD.iceSword,
  "古锭刀": STANDARD_CARD.gudingBlade,
  "朱雀羽扇": STANDARD_CARD.fan,
  "八卦阵": STANDARD_CARD.eightDiagram,
  "仁王盾": STANDARD_CARD.renwangShield,
  "藤甲": STANDARD_CARD.vine,
  "白银狮子": STANDARD_CARD.silverLion,
  "绝影": STANDARD_CARD.jueying,
  "的卢": STANDARD_CARD.dilu,
  "爪黄飞电": STANDARD_CARD.zhuahuangfeidian,
  "骅骝": STANDARD_CARD.hualiu,
  "赤兔": STANDARD_CARD.chitu,
  "大宛": STANDARD_CARD.dayuan,
  "紫骍": STANDARD_CARD.zixing,
  "五谷丰登": STANDARD_CARD.amazingGrace,
  "桃园结义": STANDARD_CARD.godSalvation,
  "南蛮入侵": STANDARD_CARD.savageAssault,
  "万箭齐发": STANDARD_CARD.archeryAttack,
  "决斗": STANDARD_CARD.duel,
  "无中生有": STANDARD_CARD.exNihilo,
  "顺手牵羊": STANDARD_CARD.snatch,
  "过河拆桥": STANDARD_CARD.dismantlement,
  "借刀杀人": STANDARD_CARD.collateral,
  "无懈可击": STANDARD_CARD.nullification,
  "乐不思蜀": STANDARD_CARD.indulgence,
  "闪电": STANDARD_CARD.lightning,
  "兵粮寸断": STANDARD_CARD.supplyShortage,
  "铁索连环": STANDARD_CARD.ironChain,
  "火攻": STANDARD_CARD.fireAttack
};

const MANEUVERING_CARD_IDS = new Set<string>([
  STANDARD_CARD.fireSlash,
  STANDARD_CARD.thunderSlash,
  STANDARD_CARD.wine,
  STANDARD_CARD.gudingBlade,
  STANDARD_CARD.fan,
  STANDARD_CARD.vine,
  STANDARD_CARD.silverLion,
  STANDARD_CARD.hualiu,
  STANDARD_CARD.supplyShortage,
  STANDARD_CARD.ironChain,
  STANDARD_CARD.fireAttack
]);

function slashDefinition(
  id: string,
  name: string,
  nature: "normal" | "fire" | "thunder"
): CardDefinition {
  return {
    id,
    name,
    category: "basic",
    tags: [
      "response:slash",
      `damage:${nature}`
    ],
    active: true,
    implementation: "complete",
    usageKey: "standard:slash-use",
    maxUsesPerTurn: 1,
    target: {
      type: "players",
      candidates: "others",
      minimum: 1,
      maximum: 1,
      filters: [
        { type: "alive" },
        { type: "distance-at-most", value: "attack-range" }
      ]
    },
    program: {
      steps: [
        {
          type: "for-each-player",
          players: "targets",
          steps: [{
            type: "damage",
            source: "source",
            target: "target",
            amount: {
              type: "boolean-mark",
              player: "source",
              mark: "wineDamage",
              whenTrue: 2,
              whenFalse: 1
            },
            nature,
            tags: ["armor:vine-blockable"]
          }]
        },
        {
          type: "set-mark",
          player: "source",
          mark: "wineDamage",
          value: false
        }
      ]
    }
  };
}

const peach: CardDefinition = {
  id: STANDARD_CARD.peach,
  name: "桃",
  category: "basic",
  tags: ["response:peach"],
  active: true,
  implementation: "complete",
  target: {
    type: "players",
    candidates: "self",
    minimum: 1,
    maximum: 1,
    filters: [{ type: "alive" }, { type: "wounded" }]
  },
  program: {
    steps: [{
      type: "recover",
      player: "source",
      amount: 1,
      source: "source"
    }]
  }
};

const wine: CardDefinition = {
  id: STANDARD_CARD.wine,
  name: "酒",
  category: "basic",
  tags: ["response:self-rescue"],
  active: true,
  implementation: "complete",
  usageKey: STANDARD_CARD.wine,
  maxUsesPerTurn: 1,
  target: {
    type: "players",
    candidates: "self",
    minimum: 1,
    maximum: 1,
    filters: [{ type: "alive" }]
  },
  program: {
    steps: [{
      type: "set-mark",
      player: "source",
      mark: "wineDamage",
      value: true
    }]
  }
};

const exNihilo: CardDefinition = {
  id: STANDARD_CARD.exNihilo,
  name: "无中生有",
  category: "trick",
  active: true,
  implementation: "complete",
  target: { type: "none" },
  program: {
    steps: [{
      type: "draw",
      player: "source",
      count: 2
    }]
  }
};

const godSalvation: CardDefinition = {
  id: STANDARD_CARD.godSalvation,
  name: "桃园结义",
  category: "trick",
  active: true,
  implementation: "complete",
  target: { type: "none" },
  program: {
    steps: [{
      type: "for-each-player",
      players: "all-alive",
      steps: [{
        type: "recover",
        player: "target",
        amount: 1,
        source: "source"
      }]
    }]
  }
};

const amazingGrace: CardDefinition = {
  id: STANDARD_CARD.amazingGrace,
  name: "五谷丰登",
  category: "trick",
  active: true,
  implementation: "complete",
  target: { type: "none" },
  tags: ["resolution:per-target-nullification"],
  program: {
    steps: [{
      type: "run-workflow",
      workflowId: STANDARD_WORKFLOW.amazingGrace,
      data: { phase: "prepare" }
    }]
  }
};

function globalResponseDefinition(
  id: string,
  name: string
): CardDefinition {
  return {
    id,
    name,
    category: "trick",
    tags: id === STANDARD_CARD.savageAssault
      ? ["targeting:trick", "targeting:savage-assault"]
      : ["targeting:trick", "targeting:archery-attack"],
    active: true,
    implementation: "complete",
    target: { type: "none" },
    program: {
      steps: [{
        type: "for-each-player",
        players: "all-other-alive",
        steps: [{
            type: "damage",
            source: "source",
            target: "target",
            amount: 1,
            nature: "normal",
            tags: ["armor:vine-blockable"]
        }]
      }]
    }
  };
}

const duel: CardDefinition = {
  id: STANDARD_CARD.duel,
  name: "决斗",
  category: "trick",
  tags: ["targeting:duel"],
  active: true,
  implementation: "complete",
  target: {
    type: "players",
    candidates: "others",
    minimum: 1,
    maximum: 1,
    filters: [{ type: "alive" }]
  },
  program: {
    steps: [{
      type: "run-workflow",
      workflowId: STANDARD_WORKFLOW.duel,
      data: {}
    }]
  }
};

function cardTransferTrick(
  id: string,
  name: string,
  reason: "dismantle" | "snatch"
): CardDefinition {
  return {
    id,
    name,
    category: "trick",
    ...(reason === "snatch"
      ? { tags: ["targeting:qianxun-blocked"] }
      : {}),
    active: true,
    implementation: "complete",
    target: {
      type: "players",
      candidates: "others",
      minimum: 1,
      maximum: 1,
      filters: [
        { type: "alive" },
        {
          type: "has-cards",
          zones: ["hand", "equipment", "judgment"]
        },
        ...(reason === "snatch"
          ? [{
              type: "distance-at-most" as const,
              value: 1 as const
            }]
          : [])
      ]
    },
    program: {
      steps: [{
        type: "for-each-player",
        players: "targets",
        steps: [{
          type: "request-card-selection",
          chooser: "source",
          owner: "target",
          zones: ["hand", "equipment", "judgment"],
          minimum: 1,
          maximum: 1,
          destination: reason === "dismantle"
            ? { type: "discard" }
            : { type: "hand", player: "source" },
          reason,
          moveReason: reason === "snatch" ? "snatch" : "discard"
        }]
      }]
    }
  };
}

const ironChain: CardDefinition = {
  id: STANDARD_CARD.ironChain,
  name: "铁索连环",
  category: "trick",
  active: true,
  implementation: "complete",
  target: {
    type: "players",
    candidates: "others",
    minimum: 0,
    maximum: 2,
    filters: [{ type: "alive" }]
  },
  program: {
    steps: [
      {
        type: "if-target-count",
        equals: 0,
        then: [{ type: "draw", player: "source", count: 1 }]
      },
      {
        type: "for-each-player",
        players: "targets",
        steps: [{ type: "toggle-chain", player: "target" }]
      }
    ]
  }
};

const fireAttack: CardDefinition = {
  id: STANDARD_CARD.fireAttack,
  name: "火攻",
  category: "trick",
  active: true,
  implementation: "complete",
  target: {
    type: "players",
    candidates: "all",
    minimum: 1,
    maximum: 1,
    filters: [
      { type: "alive" },
      { type: "has-cards", zones: ["hand"] }
    ]
  },
  program: {
    steps: [{
      type: "run-workflow",
      workflowId: STANDARD_WORKFLOW.fireAttack,
      data: {}
    }]
  }
};

const collateral: CardDefinition = {
  id: STANDARD_CARD.collateral,
  name: "借刀杀人",
  category: "trick",
  active: true,
  implementation: "complete",
  target: {
    type: "ordered",
    slots: [
      {
        candidates: "others",
        filters: [
          { type: "alive" },
          { type: "equipped", slot: "weapon" }
        ]
      },
      {
        candidates: "all",
        excludeSelected: true,
        filters: [
          { type: "alive" },
          {
            type: "distance-at-most",
            from: "previous",
            value: "attack-range"
          }
        ]
      }
    ]
  },
  program: {
    steps: [{
      type: "run-workflow",
      workflowId: STANDARD_WORKFLOW.collateral,
      data: {}
    }]
  }
};

function delayedTrick(options: {
  id: string;
  name: string;
  includeSelf: boolean;
  implementation: "complete" | "partial";
  judgment: NonNullable<CardDefinition["delayed"]>["judgment"];
  mark?: "skipDraw" | "skipAction";
  damage?: number;
  onMiss: "discard" | "pass-to-next";
  distanceLimited?: boolean;
  tags?: string[];
}): CardDefinition {
  return {
    id: options.id,
    name: options.name,
    category: "trick",
    ...(options.tags ? { tags: options.tags } : {}),
    active: true,
    implementation: options.implementation,
    delayed: {
      judgment: options.judgment,
      onMatch: {
        steps: [{
          type: "for-each-player",
          players: "targets",
          steps: options.mark
            ? [{
                type: "set-mark",
                player: "target",
                mark: options.mark,
                value: true
              }]
            : [{
                type: "damage",
                source: "source",
                target: "target",
                amount: options.damage ?? 0,
                nature: "thunder"
              }]
        }]
      },
      onMiss: options.onMiss
    },
    target: {
      type: "players",
      candidates: options.includeSelf ? "all" : "others",
      minimum: 1,
      maximum: 1,
      filters: [
        { type: "alive" },
        {
          type: "lacks-card-definition",
          zone: "judgment",
          definitionId: options.id
        },
        ...(options.distanceLimited
          ? [{
              type: "distance-at-most" as const,
              value: 1 as const
            }]
          : [])
      ]
    },
    program: {
      steps: [{
        type: "for-each-player",
        players: "targets",
        steps: [{ type: "place-delayed", player: "target" }]
      }]
    }
  };
}

const responseOnly = (
  id: string,
  name: string,
  category: "basic" | "trick",
  tags: string[]
): CardDefinition => ({
  id,
  name,
  category,
  tags,
  active: false,
  implementation: "complete",
  target: { type: "none" },
  program: { steps: [] }
});

const EQUIPMENT: Array<{
  id: string;
  name: string;
  slot: "weapon" | "armor" | "defensive-horse" | "offensive-horse";
  range?: number;
}> = [
  { id: STANDARD_CARD.crossbow, name: "诸葛连弩", slot: "weapon", range: 1 },
  { id: STANDARD_CARD.doubleSword, name: "雌雄双股剑", slot: "weapon", range: 2 },
  { id: STANDARD_CARD.qinggangSword, name: "青釭剑", slot: "weapon", range: 2 },
  { id: STANDARD_CARD.blade, name: "青龙偃月刀", slot: "weapon", range: 3 },
  { id: STANDARD_CARD.spear, name: "丈八蛇矛", slot: "weapon", range: 3 },
  { id: STANDARD_CARD.axe, name: "贯石斧", slot: "weapon", range: 4 },
  { id: STANDARD_CARD.halberd, name: "方天画戟", slot: "weapon", range: 5 },
  { id: STANDARD_CARD.kylinBow, name: "麒麟弓", slot: "weapon", range: 5 },
  { id: STANDARD_CARD.iceSword, name: "寒冰剑", slot: "weapon", range: 2 },
  { id: STANDARD_CARD.gudingBlade, name: "古锭刀", slot: "weapon", range: 2 },
  { id: STANDARD_CARD.fan, name: "朱雀羽扇", slot: "weapon", range: 4 },
  { id: STANDARD_CARD.eightDiagram, name: "八卦阵", slot: "armor" },
  { id: STANDARD_CARD.renwangShield, name: "仁王盾", slot: "armor" },
  { id: STANDARD_CARD.vine, name: "藤甲", slot: "armor" },
  { id: STANDARD_CARD.silverLion, name: "白银狮子", slot: "armor" },
  { id: STANDARD_CARD.jueying, name: "绝影", slot: "defensive-horse" },
  { id: STANDARD_CARD.dilu, name: "的卢", slot: "defensive-horse" },
  { id: STANDARD_CARD.zhuahuangfeidian, name: "爪黄飞电", slot: "defensive-horse" },
  { id: STANDARD_CARD.hualiu, name: "骅骝", slot: "defensive-horse" },
  { id: STANDARD_CARD.chitu, name: "赤兔", slot: "offensive-horse" },
  { id: STANDARD_CARD.dayuan, name: "大宛", slot: "offensive-horse" },
  { id: STANDARD_CARD.zixing, name: "紫骍", slot: "offensive-horse" }
];

function equipmentDefinition(item: (typeof EQUIPMENT)[number]): CardDefinition {
  const equipment = item.range === undefined
    ? { slot: item.slot }
    : { slot: item.slot, attackRange: item.range };
  const abilities: NonNullable<CardDefinition["abilities"]> = [];
  if (item.id === STANDARD_CARD.crossbow) {
    abilities.push({
      type: "modify-usage",
      cardTag: "response:slash",
      unlimited: true
    });
  }
  if (item.id === STANDARD_CARD.doubleSword) {
    abilities.push({
      type: "trigger",
      eventType: "TargetsConfirmed",
      when: [
        { type: "event-player-is-owner", field: "playerId" },
        { type: "event-card", tag: "response:slash" }
      ],
      context: {
        targetsFromEvent: "targetIds",
        card: "event-card"
      },
      program: {
        steps: [{
          type: "for-each-player",
          players: "targets",
          steps: [{
            type: "run-workflow",
            workflowId: STANDARD_WORKFLOW.doubleSword
          }]
        }]
      }
    });
  }
  if (item.id === STANDARD_CARD.blade) {
    abilities.push({
      type: "trigger",
      eventType: "CardCancelled",
      when: [
        { type: "event-player-is-owner", field: "sourceId" },
        { type: "event-field-equals", field: "reason", value: "jink" },
        { type: "event-card", tag: "response:slash" }
      ],
      context: {
        targets: [{ eventField: "targetId" }],
        card: "event-card"
      },
      program: {
        steps: [{
          type: "for-each-player",
          players: "targets",
          steps: [{
            type: "run-workflow",
            workflowId: STANDARD_WORKFLOW.blade
          }]
        }]
      }
    });
  }
  if (item.id === STANDARD_CARD.axe) {
    abilities.push({
      type: "trigger",
      eventType: "CardCancelled",
      when: [
        { type: "event-player-is-owner", field: "sourceId" },
        { type: "event-field-equals", field: "reason", value: "jink" },
        { type: "event-card", tag: "response:slash" }
      ],
      context: {
        targets: [{ eventField: "targetId" }],
        card: "event-card"
      },
      program: {
        steps: [{
          type: "for-each-player",
          players: "targets",
          steps: [{
            type: "run-workflow",
            workflowId: STANDARD_WORKFLOW.axe
          }]
        }]
      }
    });
  }
  if (item.id === STANDARD_CARD.spear) {
    abilities.push({
      type: "view-as",
      id: "standard:equipment:spear",
      definitionId: STANDARD_CARD.slash,
      materials: { zones: ["hand"], count: 2 },
      action: true,
      response: true
    });
  }
  if (item.id === STANDARD_CARD.fan) {
    abilities.push({
      type: "view-as",
      id: "standard:equipment:fan",
      definitionId: STANDARD_CARD.fireSlash,
      materials: {
        zones: ["hand"],
        count: 1,
        definitionId: STANDARD_CARD.slash
      },
      action: true
    });
  }
  if (item.id === STANDARD_CARD.halberd) {
    abilities.push({
      type: "modify-targeting",
      cardTag: "response:slash",
      ownerHandCountEquals: 1,
      maximumTargetsBonus: 2
    });
  }
  if (item.id === STANDARD_CARD.qinggangSword) {
    abilities.push({
      type: "timing",
      timing: "before-effect",
      priority: -100,
      match: {
        effectType: "request-response",
        sourceIsOwner: true,
        sourceCardTag: "response:slash"
      },
      operation: {
        type: "add-tags",
        tags: ["ignore-armor"]
      }
    });
  }
  if (item.id === STANDARD_CARD.gudingBlade) {
    abilities.push({
      type: "timing",
      timing: "before-effect",
      match: {
        effectType: "damage",
        sourceIsOwner: true,
        sourceCardTag: "response:slash",
        targetHand: "empty",
        propagated: false
      },
      operation: { type: "add-amount", amount: 1 }
    });
  }
  if (item.id === STANDARD_CARD.iceSword) {
    abilities.push({
      type: "timing",
      timing: "before-effect",
      priority: 10000,
      match: {
        effectType: "damage",
        sourceIsOwner: true,
        sourceCardTag: "response:slash",
        propagated: false
      },
      operation: {
        type: "offer-discard-effect-replacement",
        reason: "ice-sword",
        targetZones: ["hand", "equipment"],
        maximum: 2
      }
    });
  }
  if (item.id === STANDARD_CARD.renwangShield) {
    abilities.push({
      type: "timing",
      timing: "before-effect",
      match: {
        effectType: "request-response",
        responderIncludesOwner: true,
        sourceCardTag: "response:slash",
        sourceCardColor: "black",
        excludedEffectTags: ["ignore-armor"]
      },
      operation: { type: "remove" }
    });
  }
  if (item.id === STANDARD_CARD.eightDiagram) {
    abilities.push({
      type: "timing",
      timing: "before-effect",
      priority: 10000,
      match: {
        effectType: "request-response",
        responderIncludesOwner: true,
        sourceCardTag: "response:slash",
        excludedEffectTags: ["ignore-armor"]
      },
      operation: {
        type: "offer-judgment-response",
        reason: "eight-diagram",
        pattern: { includedSuits: ["diamond", "heart"] }
      }
    });
  }
  if (item.id === STANDARD_CARD.vine) {
    abilities.push(
      {
        type: "timing",
        timing: "before-effect",
        match: {
          effectType: "damage",
          targetIsOwner: true,
          nature: "normal",
          requiredEffectTags: ["armor:vine-blockable"],
          excludedEffectTags: ["ignore-armor"]
        },
        operation: { type: "remove" }
      },
      {
        type: "timing",
        timing: "before-effect",
        match: {
          effectType: "damage",
          targetIsOwner: true,
          nature: "fire",
          excludedEffectTags: ["ignore-armor"]
        },
        operation: { type: "add-amount", amount: 1 }
      }
    );
  }
  if (item.id === STANDARD_CARD.silverLion) {
    abilities.push({
      type: "timing",
      timing: "before-effect",
      match: {
        effectType: "damage",
        targetIsOwner: true,
        excludedEffectTags: ["ignore-armor"],
        amountGreaterThan: 1
      },
      operation: { type: "cap-amount", maximum: 1 }
    });
  }
  if (item.id === STANDARD_CARD.kylinBow) {
    abilities.push({
      type: "trigger",
      eventType: "DamageApplied",
      when: [
        { type: "event-player-is-owner", field: "sourceId" },
        { type: "event-card", tag: "response:slash" },
        {
          type: "event-player-has-equipment-slot",
          field: "targetId",
          slots: ["defensive-horse", "offensive-horse"]
        }
      ],
      context: {
        targets: [{ eventField: "targetId" }],
        card: "event-card"
      },
      program: {
        steps: [{
          type: "for-each-player",
          players: "targets",
          steps: [{
            type: "request-card-selection",
            chooser: "source",
            owner: "target",
            zones: ["equipment"],
            cardFilter: {
              equipmentSlots: ["defensive-horse", "offensive-horse"]
            },
            minimum: 0,
            maximum: 1,
            destination: { type: "discard" },
            reason: "kylin-bow",
            moveReason: "discard"
          }]
        }]
      }
    });
  }
  return {
    id: item.id,
    name: item.name,
    category: "equipment",
    active: true,
    implementation:
      item.slot === "defensive-horse" ||
      item.slot === "offensive-horse" ||
      item.id === STANDARD_CARD.crossbow ||
      item.id === STANDARD_CARD.doubleSword ||
      item.id === STANDARD_CARD.blade ||
      item.id === STANDARD_CARD.axe ||
      item.id === STANDARD_CARD.qinggangSword ||
      item.id === STANDARD_CARD.renwangShield ||
      item.id === STANDARD_CARD.eightDiagram ||
      item.id === STANDARD_CARD.vine ||
      item.id === STANDARD_CARD.spear ||
      item.id === STANDARD_CARD.halberd ||
      item.id === STANDARD_CARD.kylinBow ||
      item.id === STANDARD_CARD.iceSword ||
      item.id === STANDARD_CARD.gudingBlade ||
      item.id === STANDARD_CARD.fan ||
      item.id === STANDARD_CARD.silverLion
        ? "complete"
        : "partial",
    equipment,
    ...(abilities.length > 0 ? { abilities } : {}),
    ...(item.id === STANDARD_CARD.silverLion
      ? {
          selfAbilities: [{
            type: "trigger" as const,
            eventType: "CardMoved" as const,
            when: [
              {
                type: "event-zone-is-owner" as const,
                field: "from" as const,
                zone: "equipment" as const
              },
              { type: "owner-state" as const, state: "alive" as const },
              { type: "owner-state" as const, state: "wounded" as const }
            ],
            program: {
              steps: [{
                type: "recover" as const,
                player: "source" as const,
                amount: 1
              }]
            }
          }]
        }
      : {}),
    target: {
      type: "players",
      candidates: "self",
      minimum: 1,
      maximum: 1,
      filters: [{ type: "alive" }]
    },
    program: {
      steps: [{
        type: "equip",
        player: "source",
        slot: item.slot
      }]
    }
  };
}

export function createStandardRegistry(): ContentRegistry {
  const registry = new ContentRegistry();
  registry.registerPack(createStandardPack());
  registry.registerPack(createManeuveringPack());
  return registry;
}

function createCardDefinitions(): CardDefinition[] {
  return [
    slashDefinition(STANDARD_CARD.slash, "杀", "normal"),
    slashDefinition(STANDARD_CARD.fireSlash, "火杀", "fire"),
    slashDefinition(STANDARD_CARD.thunderSlash, "雷杀", "thunder"),
    responseOnly(STANDARD_CARD.jink, "闪", "basic", ["response:jink"]),
    peach,
    wine,
    ...EQUIPMENT.map(equipmentDefinition),
    amazingGrace,
    godSalvation,
    globalResponseDefinition(
      STANDARD_CARD.savageAssault,
      "南蛮入侵"
    ),
    globalResponseDefinition(
      STANDARD_CARD.archeryAttack,
      "万箭齐发"
    ),
    duel,
    exNihilo,
    cardTransferTrick(STANDARD_CARD.snatch, "顺手牵羊", "snatch"),
    cardTransferTrick(
      STANDARD_CARD.dismantlement,
      "过河拆桥",
      "dismantle"
    ),
    collateral,
    responseOnly(
      STANDARD_CARD.nullification,
      "无懈可击",
      "trick",
      ["response:nullification"]
    ),
    delayedTrick({
      id: STANDARD_CARD.indulgence,
      name: "乐不思蜀",
      includeSelf: false,
      implementation: "complete",
      judgment: { excludedSuits: ["heart"] },
      mark: "skipAction",
      tags: ["targeting:qianxun-blocked"],
      onMiss: "discard"
    }),
    delayedTrick({
      id: STANDARD_CARD.lightning,
      name: "闪电",
      includeSelf: true,
      implementation: "complete",
      judgment: {
        includedSuits: ["spade"],
        minimumRank: 2,
        maximumRank: 9
      },
      damage: 3,
      onMiss: "pass-to-next"
    }),
    delayedTrick({
      id: STANDARD_CARD.supplyShortage,
      name: "兵粮寸断",
      includeSelf: false,
      implementation: "complete",
      judgment: { excludedSuits: ["club"] },
      mark: "skipDraw",
      distanceLimited: true,
      onMiss: "discard"
    }),
    ironChain,
    fireAttack
  ];
}

function createStandardResolutionRules(): NonNullable<
  ContentPack["resolutionRules"]
> {
  return [
    {
      id: "standard:resolution:kongcheng",
      priority: -200,
      match: { tags: ["response:slash"] },
      scope: "each-target",
      operation: {
        type: "exclude-target-with-skills",
        skillIds: [standardSkillId("空城")],
        ownerHandEmpty: true
      }
    },
    {
      id: "standard:resolution:kongcheng-duel",
      priority: -200,
      match: { tags: ["targeting:duel"] },
      scope: "each-target",
      operation: {
        type: "exclude-target-with-skills",
        skillIds: [standardSkillId("空城")],
        ownerHandEmpty: true
      }
    },
    {
      id: "standard:resolution:qianxun",
      priority: -200,
      match: {
        definitionIds: [STANDARD_CARD.snatch, STANDARD_CARD.indulgence]
      },
      scope: "each-target",
      operation: {
        type: "exclude-target-with-skills",
        skillIds: [standardSkillId("谦逊")]
      }
    },
    {
      id: "standard:resolution:slash-defense",
      priority: 100,
      match: { tags: ["response:slash"] },
      scope: "each-target",
      operation: {
        type: "require-response",
        acceptedTags: ["response:jink"],
        responseKind: "jink",
        acceptedOutcome: { type: "cancel", reason: "jink" }
      }
    },
    {
      id: "standard:resolution:savage-response",
      priority: 100,
      match: { definitionIds: [STANDARD_CARD.savageAssault] },
      scope: "each-target",
      operation: {
        type: "require-response",
        acceptedTags: ["response:slash"],
        responseKind: "slash",
        acceptedOutcome: { type: "prevent" }
      }
    },
    {
      id: "standard:resolution:archery-response",
      priority: 100,
      match: { definitionIds: [STANDARD_CARD.archeryAttack] },
      scope: "each-target",
      operation: {
        type: "require-response",
        acceptedTags: ["response:jink"],
        responseKind: "jink",
        acceptedOutcome: { type: "prevent" }
      }
    },
    {
      id: "standard:resolution:trick-nullification",
      priority: 200,
      match: { category: "trick" },
      scope: "target-or-card",
      operation: { type: "allow-nullification" }
    }
  ];
}

export function createStandardPack(): ContentPack {
  const cards = createCardDefinitions().filter(
    (definition) => !MANEUVERING_CARD_IDS.has(definition.id)
  );
  const heroes = createStandardHeroDefinitions();
  return {
    id: "standard",
    version: "0.3.0",
    name: "三国杀标准版",
    requires: [],
    provenance: {
      releaseDate: "2008-01-01",
      releaseDatePrecision: "day",
      evidenceUrls: ["https://www.yokaverse.com/about-history/"],
      rulesSource: {
        repository: "https://github.com/Mogara/QSanguosha",
        revision: "b3b5ad83e7ed758ea2524b325528d2d507eb7f98",
        paths: [
          "src/standard.cpp",
          "src/standard-cards.cpp",
          "src/standard-generals.cpp",
          "src/standard-skillcards.cpp"
        ]
      }
    },
    prints: createStandardPrints(STANDARD_CARD_IDS_BY_NAME),
    resolutionRules: createStandardResolutionRules(),
    workflows: createStandardWorkflows().filter(
      (workflow) => workflow.id !== STANDARD_WORKFLOW.fireAttack
    ),
    skills: createStandardSkillDefinitions(),
    heroes,
    cards,
    assetManifest: [
      ...cards.map((definition) => `card:${definition.id}`),
      ...heroes.map((definition) => `hero:${definition.id}`)
    ]
  };
}

export function createManeuveringPack(): ContentPack {
  const cards = createCardDefinitions().filter(
    (definition) => MANEUVERING_CARD_IDS.has(definition.id)
  );
  return {
    id: "maneuvering",
    version: "1.0.0",
    name: "神话再临·军争篇",
    requires: ["standard@0.3.0"],
    prints: createManeuveringPrints(STANDARD_CARD_IDS_BY_NAME),
    provenance: {
      releaseDate: "2009-09-21",
      releaseDatePrecision: "day",
      evidenceUrls: [
        "https://www.yokaverse.com/about-history/",
        "https://games.sina.com.cn/o/z/sanguosha/2011-09-23/1706425569.shtml"
      ],
      rulesSource: {
        repository: "https://github.com/Mogara/QSanguosha",
        revision: "b3b5ad83e7ed758ea2524b325528d2d507eb7f98",
        paths: ["src/maneuvering.cpp"]
      }
    },
    workflows: createStandardWorkflows().filter(
      (workflow) => workflow.id === STANDARD_WORKFLOW.fireAttack
    ),
    skills: [],
    heroes: [],
    cards,
    assetManifest: cards.map((definition) => `card:${definition.id}`)
  };
}
