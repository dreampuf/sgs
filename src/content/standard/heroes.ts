import {
  DISCARD_PILE,
  PROCESSING_ZONE
} from "../../core/state";
import type {
  HeroDefinition,
  SkillDefinition
} from "../../core/registry";
import { STANDARD_WORKFLOW } from "./workflows";

export const standardSkillId = (name: string): string =>
  `standard:skill:${name}`;
export const standardHeroId = (name: string): string =>
  `standard:hero:${name}`;

const HERO_DATA: Array<[
  name: string,
  maxHp: number,
  skills: string[],
  kingdom: HeroDefinition["kingdom"],
  gender: HeroDefinition["gender"]
]> = [
  ["曹操", 4, ["护驾", "奸雄"], "wei", "male"],
  ["张辽", 4, ["突袭"], "wei", "male"],
  ["郭嘉", 3, ["天妒", "遗计"], "wei", "male"],
  ["夏侯惇", 4, ["刚烈"], "wei", "male"],
  ["司马懿", 3, ["反馈", "鬼才"], "wei", "male"],
  ["许褚", 4, ["裸衣"], "wei", "male"],
  ["甄姬", 3, ["洛神", "倾国"], "wei", "female"],
  ["刘备", 4, ["激将", "仁德"], "shu", "male"],
  ["关羽", 4, ["武圣"], "shu", "male"],
  ["张飞", 4, ["咆哮"], "shu", "male"],
  ["赵云", 4, ["龙胆"], "shu", "male"],
  ["马超", 4, ["马术", "铁骑"], "shu", "male"],
  ["诸葛亮", 3, ["观星", "空城"], "shu", "male"],
  ["黄月英", 3, ["集智", "奇才"], "shu", "female"],
  ["孙权", 4, ["救援", "制衡"], "wu", "male"],
  ["周瑜", 3, ["反间", "英姿"], "wu", "male"],
  ["吕蒙", 4, ["克己"], "wu", "male"],
  ["陆逊", 3, ["连营", "谦逊"], "wu", "male"],
  ["甘宁", 4, ["奇袭"], "wu", "male"],
  ["黄盖", 4, ["苦肉"], "wu", "male"],
  ["大乔", 3, ["国色", "流离"], "wu", "female"],
  ["孙尚香", 3, ["结姻", "枭姬"], "wu", "female"],
  ["吕布", 4, ["无双"], "qun", "male"],
  ["华佗", 3, ["急救", "青囊"], "qun", "male"],
  ["貂蝉", 3, ["闭月", "离间"], "qun", "female"]
];

const COMPLETE_SKILLS: Record<string, SkillDefinition> = {
  "护驾": {
    id: standardSkillId("护驾"),
    name: "护驾",
    implementation: "complete",
    lordOnly: true,
    abilities: [{
      type: "timing",
      timing: "before-effect",
      priority: 9000,
      match: {
        effectType: "request-response",
        responderIncludesOwner: true,
        responseKind: "jink"
      },
      operation: {
        type: "offer-delegated-response",
        kingdom: "wei",
        reason: "hujia"
      }
    }]
  },
  "激将": {
    id: standardSkillId("激将"),
    name: "激将",
    implementation: "complete",
    lordOnly: true,
    abilities: [
      {
        type: "active",
        id: standardSkillId("激将"),
        materials: { zones: [], minimum: 0, maximum: 0 },
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
        maximumUsesPerTurn: 1,
        cardUse: {
          definitionId: "standard:slash",
          source: "actor",
          targetIndexes: [0]
        },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: STANDARD_WORKFLOW.jijiangUse
          }]
        }
      },
      {
        type: "timing",
        timing: "before-effect",
        priority: 9000,
        match: {
          effectType: "request-response",
          responderIncludesOwner: true,
          responseKind: "slash"
        },
        operation: {
          type: "offer-delegated-response",
          kingdom: "shu",
          reason: "jijiang"
        }
      }
    ]
  },
  "遗计": {
    id: standardSkillId("遗计"),
    name: "遗计",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "DamageApplied",
      when: [{ type: "event-player-is-owner", field: "targetId" }],
      context: {
        card: "event-card"
      },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: STANDARD_WORKFLOW.yiji,
          data: {
            remaining: { type: "event-field", field: "amount" }
          }
        }]
      }
    }]
  },
  "洛神": {
    id: standardSkillId("洛神"),
    name: "洛神",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "TurnStarted",
      when: [{ type: "event-player-is-owner", field: "playerId" }],
      context: { card: { literal: "system:skill:luoshen" } },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: STANDARD_WORKFLOW.luoshen
        }]
      }
    }]
  },
  "观星": {
    id: standardSkillId("观星"),
    name: "观星",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "TurnStarted",
      when: [{ type: "event-player-is-owner", field: "playerId" }],
      context: { card: { literal: "system:skill:guanxing" } },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: STANDARD_WORKFLOW.guanxing
        }]
      }
    }]
  },
  "流离": {
    id: standardSkillId("流离"),
    name: "流离",
    implementation: "complete",
    abilities: [{
      type: "timing",
      timing: "before-effect",
      priority: -10000,
      match: {
        effectType: "request-response",
        responderIncludesOwner: true,
        responseKind: "jink",
        sourceCardTag: "response:slash"
      },
      operation: {
        type: "offer-target-redirection",
        reason: "liuli",
        costZones: ["hand", "equipment"]
      }
    }]
  },
  "突袭": {
    id: standardSkillId("突袭"),
    name: "突袭",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "PhaseChanged",
      when: [
        { type: "event-player-is-owner", field: "playerId" },
        { type: "event-field-equals", field: "to", value: "draw" }
      ],
      context: { card: { literal: "system:skill:tuxi" } },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: STANDARD_WORKFLOW.tuxi
        }]
      }
    }]
  },
  "裸衣": {
    id: standardSkillId("裸衣"),
    name: "裸衣",
    implementation: "complete",
    abilities: [
      {
        type: "trigger",
        eventType: "PhaseChanged",
        when: [
          { type: "event-player-is-owner", field: "playerId" },
          { type: "event-field-equals", field: "to", value: "draw" }
        ],
        context: { card: { literal: "system:skill:luoyi" } },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: STANDARD_WORKFLOW.luoyi
          }]
        }
      },
      {
        type: "timing",
        timing: "before-effect",
        match: {
          effectType: "draw",
          playerIsOwner: true,
          requiredEffectTags: ["phase:draw"],
          ownerMark: { mark: "luoyi", equals: true }
        },
        operation: { type: "add-count", count: -1 }
      },
      {
        type: "timing",
        timing: "before-effect",
        match: {
          effectType: "damage",
          sourceIsOwner: true,
          sourceCardTag: "response:slash",
          ownerMark: { mark: "luoyi", equals: true }
        },
        operation: { type: "add-amount", amount: 1 }
      },
      {
        type: "timing",
        timing: "before-effect",
        match: {
          effectType: "damage",
          sourceIsOwner: true,
          sourceCardTag: "targeting:duel",
          ownerMark: { mark: "luoyi", equals: true }
        },
        operation: { type: "add-amount", amount: 1 }
      },
      {
        type: "trigger",
        eventType: "TurnEnded",
        when: [{ type: "event-player-is-owner", field: "playerId" }],
        context: { card: { literal: "system:skill:luoyi" } },
        program: {
          steps: [{
            type: "set-mark",
            player: "source",
            mark: "luoyi",
            value: false
          }]
        }
      }
    ]
  },
  "反间": {
    id: standardSkillId("反间"),
    name: "反间",
    implementation: "complete",
    abilities: [{
      type: "active",
      id: standardSkillId("反间"),
      materials: { zones: ["hand"], minimum: 1, maximum: 1 },
      target: {
        type: "players",
        candidates: "others",
        minimum: 1,
        maximum: 1,
        filters: [{ type: "alive" }]
      },
      maximumUsesPerTurn: 1,
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: STANDARD_WORKFLOW.fanjian
        }]
      }
    }]
  },
  "离间": {
    id: standardSkillId("离间"),
    name: "离间",
    implementation: "complete",
    abilities: [{
      type: "active",
      id: standardSkillId("离间"),
      materials: {
        zones: ["hand", "equipment"],
        minimum: 1,
        maximum: 1
      },
      target: {
        type: "ordered",
        slots: [
          {
            candidates: "others",
            filters: [
              { type: "alive" },
              { type: "hero-gender", gender: "male" }
            ]
          },
          {
            candidates: "others",
            excludeSelected: true,
            filters: [
              { type: "alive" },
              { type: "hero-gender", gender: "male" }
            ]
          }
        ]
      },
      maximumUsesPerTurn: 1,
      cardUse: {
        definitionId: "standard:duel",
        source: { targetIndex: 0 },
        targetIndexes: [1]
      },
      program: {
        steps: [{
          type: "use-card-definition",
          definitionId: "standard:duel",
          source: { type: "target-at", index: 0 },
          targets: [{ type: "target-at", index: 1 }],
          skillId: standardSkillId("离间")
        }]
      }
    }]
  },
  "鬼才": {
    id: standardSkillId("鬼才"),
    name: "鬼才",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "JudgmentRevealed",
      context: {
        card: { literal: "system:skill:guicai" }
      },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: STANDARD_WORKFLOW.judgmentReplacement,
          data: {
            reason: "guicai",
            judgmentId: {
              type: "event-field",
              field: "judgmentId"
            }
          }
        }]
      }
    }]
  },
  "铁骑": {
    id: standardSkillId("铁骑"),
    name: "铁骑",
    implementation: "complete",
    abilities: [
      {
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
              type: "request-judgment",
              player: "target",
              reason: "tieqi",
              pattern: { includedSuits: ["diamond", "heart"] },
              onMatch: [{
                type: "set-mark",
                player: "target",
                mark: {
                  type: "card-id-prefixed",
                  prefix: "tieqi"
                },
                value: true
              }]
            }]
          }]
        }
      },
      {
        type: "timing",
        timing: "before-effect",
        priority: 1000,
        match: {
          effectType: "request-response",
          sourceIsOwner: true,
          sourceCardTag: "response:slash",
          responderMarkByCard: { prefix: "tieqi", equals: true }
        },
        operation: { type: "resolve-response", outcome: "passed" }
      }
    ]
  },
  "刚烈": {
    id: standardSkillId("刚烈"),
    name: "刚烈",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "DamageApplied",
      when: [
        { type: "event-player-is-owner", field: "targetId" },
        { type: "event-player-state", field: "sourceId", state: "alive" }
      ],
      context: {
        targets: [{ eventField: "sourceId" }],
        card: "event-card"
      },
      program: {
        steps: [{
          type: "for-each-player",
          players: "targets",
          steps: [{
            type: "run-workflow",
            workflowId: STANDARD_WORKFLOW.ganglie
          }]
        }]
      }
    }]
  },
  "奸雄": {
    id: standardSkillId("奸雄"),
    name: "奸雄",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "DamageApplied",
      when: [{ type: "event-player-is-owner", field: "targetId" }],
      context: { card: "event-card" },
      program: {
        steps: [{
          type: "obtain-cause-card",
          player: "source",
          reason: "snatch"
        }]
      }
    }]
  },
  "救援": {
    id: standardSkillId("救援"),
    name: "救援",
    implementation: "complete",
    lordOnly: true,
    abilities: [{
      type: "trigger",
      eventType: "HpRecovered",
      when: [
        { type: "event-player-is-owner", field: "playerId" },
        { type: "event-player-is-not-owner", field: "sourceId" },
        { type: "owner-state", state: "dying" },
        {
          type: "event-player-hero-kingdom",
          field: "sourceId",
          kingdom: "wu"
        }
      ],
      context: {
        card: "event-card"
      },
      program: {
        steps: [{ type: "recover", player: "source", amount: 1 }]
      }
    }]
  },
  "仁德": {
    id: standardSkillId("仁德"),
    name: "仁德",
    implementation: "complete",
    abilities: [{
      type: "active",
      id: standardSkillId("仁德"),
      materials: { zones: ["hand"], minimum: 1, maximum: "all" },
      target: {
        type: "players",
        candidates: "others",
        minimum: 1,
        maximum: 1,
        filters: [{ type: "alive" }]
      },
      program: {
        steps: [
          {
            type: "for-each-player",
            players: "targets",
            steps: [{
              type: "move-materials",
              to: { type: "zone", zone: "hand", player: "target" },
              reason: "give"
            }]
          },
          {
            type: "if-turn-usage-crosses",
            player: "source",
            key: `${standardSkillId("仁德")}:cards`,
            threshold: 2,
            added: { type: "material-count" },
            then: [{ type: "recover", player: "source", amount: 1 }]
          },
          {
            type: "increment-turn-usage",
            player: "source",
            key: `${standardSkillId("仁德")}:cards`,
            amount: { type: "material-count" }
          }
        ]
      }
    }]
  },
  "制衡": {
    id: standardSkillId("制衡"),
    name: "制衡",
    implementation: "complete",
    abilities: [{
      type: "active",
      id: standardSkillId("制衡"),
      materials: {
        zones: ["hand", "equipment"],
        minimum: 1,
        maximum: "all"
      },
      target: { type: "none" },
      maximumUsesPerTurn: 1,
      program: {
        steps: [{
          type: "draw",
          player: "source",
          count: { type: "material-count" }
        }]
      }
    }]
  },
  "苦肉": {
    id: standardSkillId("苦肉"),
    name: "苦肉",
    implementation: "complete",
    abilities: [{
      type: "active",
      id: standardSkillId("苦肉"),
      materials: { zones: [], minimum: 0, maximum: 0 },
      target: { type: "none" },
      ownerHpAbove: 0,
      program: {
        steps: [
          { type: "lose-hp", player: "source", amount: 1 },
          { type: "draw", player: "source", count: 2 }
        ]
      }
    }]
  },
  "青囊": {
    id: standardSkillId("青囊"),
    name: "青囊",
    implementation: "complete",
    abilities: [{
      type: "active",
      id: standardSkillId("青囊"),
      materials: { zones: ["hand"], minimum: 1, maximum: 1 },
      target: {
        type: "players",
        candidates: "all",
        minimum: 1,
        maximum: 1,
        filters: [{ type: "alive" }, { type: "wounded" }]
      },
      maximumUsesPerTurn: 1,
      program: {
        steps: [{
          type: "for-each-player",
          players: "targets",
          steps: [{ type: "recover", player: "target", amount: 1 }]
        }]
      }
    }]
  },
  "结姻": {
    id: standardSkillId("结姻"),
    name: "结姻",
    implementation: "complete",
    abilities: [{
      type: "active",
      id: standardSkillId("结姻"),
      materials: { zones: ["hand"], minimum: 2, maximum: 2 },
      target: {
        type: "players",
        candidates: "others",
        minimum: 1,
        maximum: 1,
        filters: [
          { type: "alive" },
          { type: "wounded" },
          { type: "hero-gender", gender: "male" }
        ]
      },
      maximumUsesPerTurn: 1,
      program: {
        steps: [
          {
            type: "for-each-player",
            players: "targets",
            steps: [{ type: "recover", player: "target", amount: 1 }]
          },
          { type: "recover", player: "source", amount: 1 }
        ]
      }
    }]
  },
  "反馈": {
    id: standardSkillId("反馈"),
    name: "反馈",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "DamageApplied",
      when: [
        { type: "event-player-is-owner", field: "targetId" },
        {
          type: "event-player-state",
          field: "sourceId",
          state: "alive"
        },
        {
          type: "event-player-has-cards",
          field: "sourceId",
          zones: ["hand", "equipment"]
        }
      ],
      context: {
        targets: [{ eventField: "sourceId" }],
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
          zones: ["hand", "equipment"],
          minimum: 1,
          maximum: 1,
          destination: { type: "hand", player: "source" },
          reason: "fankui",
          moveReason: "snatch"
          }]
        }]
      }
    }]
  },
  "天妒": {
    id: standardSkillId("天妒"),
    name: "天妒",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "CardMoved",
      when: [
        {
          type: "event-field-equals",
          field: "from",
          value: PROCESSING_ZONE
        },
        {
          type: "event-field-equals",
          field: "to",
          value: DISCARD_PILE
        },
        {
          type: "event-field-equals",
          field: "reason",
          value: "resolve"
        },
        {
          type: "event-move-cause-player-is-owner",
          cause: "judgment"
        }
      ],
      program: {
        steps: [{
          type: "move-card",
          to: { type: "zone", zone: "hand", player: "source" },
          reason: "snatch"
        }]
      },
    }]
  },
  "枭姬": {
    id: standardSkillId("枭姬"),
    name: "枭姬",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "CardMoved",
      when: [{
        type: "event-zone-is-owner",
        field: "from",
        zone: "equipment"
      }],
      program: {
        steps: [{ type: "draw", player: "source", count: 2 }]
      }
    }]
  },
  "武圣": {
    id: standardSkillId("武圣"),
    name: "武圣",
    implementation: "complete",
    abilities: [{
      type: "view-as",
      id: standardSkillId("武圣"),
      definitionId: "standard:slash",
      materials: {
        zones: ["hand", "equipment"],
        count: 1,
        color: "red"
      },
      action: true,
      response: true
    }]
  },
  "龙胆": {
    id: standardSkillId("龙胆"),
    name: "龙胆",
    implementation: "complete",
    abilities: [
      {
        type: "view-as",
        id: standardSkillId("龙胆"),
        definitionId: "standard:slash",
        materials: {
          zones: ["hand"],
          count: 1,
          definitionId: "standard:jink"
        },
        action: true,
        response: true
      },
      {
        type: "view-as",
        id: standardSkillId("龙胆"),
        definitionId: "standard:jink",
        materials: {
          zones: ["hand"],
          count: 1,
          definitionTag: "response:slash"
        },
        response: true
      }
    ]
  },
  "倾国": {
    id: standardSkillId("倾国"),
    name: "倾国",
    implementation: "complete",
    abilities: [{
      type: "view-as",
      id: standardSkillId("倾国"),
      definitionId: "standard:jink",
      materials: { zones: ["hand"], count: 1, color: "black" },
      response: true
    }]
  },
  "急救": {
    id: standardSkillId("急救"),
    name: "急救",
    implementation: "complete",
    abilities: [{
      type: "view-as",
      id: standardSkillId("急救"),
      definitionId: "standard:peach",
      materials: {
        zones: ["hand", "equipment"],
        count: 1,
        color: "red"
      },
      response: true,
      outsideOwnTurnOnly: true
    }]
  },
  "国色": {
    id: standardSkillId("国色"),
    name: "国色",
    implementation: "complete",
    abilities: [{
      type: "view-as",
      id: standardSkillId("国色"),
      definitionId: "standard:indulgence",
      materials: {
        zones: ["hand", "equipment"],
        count: 1,
        suit: "diamond"
      },
      action: true
    }]
  },
  "奇袭": {
    id: standardSkillId("奇袭"),
    name: "奇袭",
    implementation: "complete",
    abilities: [{
      type: "view-as",
      id: standardSkillId("奇袭"),
      definitionId: "standard:dismantlement",
      materials: {
        zones: ["hand", "equipment"],
        count: 1,
        color: "black"
      },
      action: true
    }]
  },
  "马术": {
    id: standardSkillId("马术"),
    name: "马术",
    implementation: "complete",
    abilities: [{
      type: "modify-targeting",
      distanceBonus: 1
    }]
  },
  "奇才": {
    id: standardSkillId("奇才"),
    name: "奇才",
    implementation: "complete",
    abilities: [{
      type: "modify-targeting",
      cardCategory: "trick",
      ignoreDistance: true
    }]
  },
  "无双": {
    id: standardSkillId("无双"),
    name: "无双",
    implementation: "complete",
    abilities: [
      {
        type: "modify-response-count",
        responseKind: "jink",
        sourceCardTag: "response:slash",
        sourceIsOwner: true,
        count: 2
      },
      {
        type: "modify-response-count",
        responseKind: "slash",
        sourceCardTag: "targeting:duel",
        opponentIsOwner: true,
        count: 2
      }
    ]
  },
  "咆哮": {
    id: standardSkillId("咆哮"),
    name: "咆哮",
    implementation: "complete",
    abilities: [{
      type: "modify-usage",
      cardTag: "response:slash",
      unlimited: true
    }]
  },
  "集智": {
    id: standardSkillId("集智"),
    name: "集智",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "CardUsed",
      when: [
        { type: "event-player-is-owner", field: "playerId" },
        { type: "event-card", category: "trick" }
      ],
      program: {
        steps: [{ type: "draw", player: "source", count: 1 }]
      }
    }]
  },
  "连营": {
    id: standardSkillId("连营"),
    name: "连营",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "CardMoved",
      when: [
        {
          type: "event-zone-is-owner",
          field: "from",
          zone: "hand"
        },
        {
          type: "owner-zone-count",
          zone: "hand",
          equals: 0
        }
      ],
      program: {
        steps: [{ type: "draw", player: "source", count: 1 }]
      }
    }]
  },
  "英姿": {
    id: standardSkillId("英姿"),
    name: "英姿",
    implementation: "complete",
    abilities: [{
      type: "timing",
      timing: "before-effect",
      match: {
        effectType: "draw",
        playerIsOwner: true,
        requiredEffectTags: ["phase:draw"]
      },
      operation: { type: "add-count", count: 1 }
    }]
  },
  "闭月": {
    id: standardSkillId("闭月"),
    name: "闭月",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "TurnEnded",
      when: [{ type: "event-player-is-owner", field: "playerId" }],
      context: { card: { literal: "system:skill:biyue" } },
      program: {
        steps: [{ type: "draw", player: "source", count: 1 }]
      }
    }]
  },
  "克己": {
    id: standardSkillId("克己"),
    name: "克己",
    implementation: "complete",
    abilities: [{
      type: "allow-end-turn",
      phase: "discard",
      usageKey: "standard:slash-use",
      usageEquals: 0
    }]
  },
  "空城": {
    id: standardSkillId("空城"),
    name: "空城",
    implementation: "complete",
    abilities: [{
      type: "forbid-targeting-owner",
      cardTags: ["response:slash", "targeting:duel"],
      ownerHandEmpty: true
    }]
  },
  "谦逊": {
    id: standardSkillId("谦逊"),
    name: "谦逊",
    implementation: "complete",
    abilities: [{
      type: "forbid-targeting-owner",
      cardTags: ["targeting:qianxun-blocked"]
    }]
  }
};

export function createStandardHeroDefinitions(): HeroDefinition[] {
  return HERO_DATA.map(([name, maxHp, skills, kingdom, gender]) => ({
    id: standardHeroId(name),
    name,
    maxHp,
    kingdom,
    gender,
    skillIds: skills.map(standardSkillId),
    implementation: skills.every((skill) => COMPLETE_SKILLS[skill])
      ? "complete"
      : "partial"
  }));
}

export function createStandardSkillDefinitions(): SkillDefinition[] {
  const names = [...new Set(HERO_DATA.flatMap((hero) => hero[2]))];
  return names.map((name) =>
    COMPLETE_SKILLS[name] ?? {
      id: standardSkillId(name),
      name,
      implementation: "partial"
    }
  );
}
