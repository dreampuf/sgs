import { ContentRegistry } from "../core/registry";
import type {
  ContentPack,
  HeroDefinition,
  SkillDefinition,
  WorkflowDefinition
} from "../core/registry";
import {
  createManeuveringPack,
  createStandardPack
} from "./standard/cards";
import { standardSkillId } from "./standard/heroes";
import { STANDARD_WORKFLOW } from "./standard/workflows";

export type EarlyExpansionId = "wind" | "military" | "fire" | "forest";

type HeroRow = [
  name: string,
  maxHp: number,
  skills: string[],
  kingdom: HeroDefinition["kingdom"],
  gender: HeroDefinition["gender"]
];

const SOURCE_REPOSITORY = "https://github.com/Mogara/QSanguosha";
const SOURCE_REVISION = "b3b5ad83e7ed758ea2524b325528d2d507eb7f98";

const WIND_HEROES: HeroRow[] = [
  ["夏侯渊", 4, ["神速"], "wei", "male"],
  ["曹仁", 4, ["据守"], "wei", "male"],
  ["黄忠", 4, ["烈弓"], "shu", "male"],
  ["魏延", 4, ["狂骨"], "shu", "male"],
  ["小乔", 3, ["天香", "红颜"], "wu", "female"],
  ["周泰", 4, ["不屈"], "wu", "male"],
  ["张角", 3, ["雷击", "鬼道", "黄天"], "qun", "male"],
  ["于吉", 3, ["蛊惑"], "qun", "male"]
];

const FIRE_HEROES: HeroRow[] = [
  ["典韦", 4, ["强袭"], "wei", "male"],
  ["荀彧", 3, ["驱虎", "节命"], "wei", "male"],
  ["庞统", 3, ["连环", "涅槃"], "shu", "male"],
  ["卧龙诸葛亮", 3, ["八阵", "火计", "看破"], "shu", "male"],
  ["太史慈", 4, ["天义"], "wu", "male"],
  ["袁绍", 4, ["乱击", "血裔"], "qun", "male"],
  ["颜良文丑", 4, ["双雄"], "qun", "male"],
  ["庞德", 4, ["马术", "猛进"], "qun", "male"]
];

const FOREST_HEROES: HeroRow[] = [
  ["徐晃", 4, ["断粮"], "wei", "male"],
  ["曹丕", 3, ["行殇", "放逐", "颂威"], "wei", "male"],
  ["孟获", 4, ["祸首", "再起"], "shu", "male"],
  ["祝融", 4, ["巨象", "烈刃"], "shu", "female"],
  ["孙坚", 4, ["英魂"], "wu", "male"],
  ["鲁肃", 3, ["好施", "缔盟"], "wu", "male"],
  ["董卓", 8, ["酒池", "肉林", "崩坏", "暴虐"], "qun", "male"],
  ["贾诩", 3, ["完杀", "乱武", "帷幕"], "qun", "male"]
];

const rowsByPack = {
  wind: WIND_HEROES,
  fire: FIRE_HEROES,
  forest: FOREST_HEROES
} satisfies Record<Exclude<EarlyExpansionId, "military">, HeroRow[]>;

const WIND_WORKFLOW = {
  leiji: "wind:workflow:leiji"
} as const;

const WIND_WORKFLOWS: WorkflowDefinition[] = [{
  id: WIND_WORKFLOW.leiji,
  run({ state, context, input }) {
    if (input?.type === "players-selected") {
      const targetId = input.playerIds[0];
      return targetId
        ? {
            effects: [{
              type: "request-judgment" as const,
              playerId: targetId,
              cardId: context.cardId,
              reason: "leiji",
              pattern: { includedSuits: ["spade" as const] },
              onMatch: [{
                type: "damage" as const,
                sourceId: context.sourceId,
                targetId,
                amount: 2,
                cardId: context.cardId,
                nature: "thunder" as const
              }],
              onMiss: []
            }]
          }
        : {};
    }
    if (input?.type === "option-selected") {
      if (input.option !== "activate") return {};
      return {
        decision: {
          type: "select-players" as const,
          playerId: context.sourceId,
          cardId: context.cardId,
          selectablePlayerIds: state.turnOrder.filter(
            (playerId) => state.players[playerId]?.alive
          ),
          minimum: 1,
          maximum: 1,
          reason: "leiji-target"
        }
      };
    }
    return {
      decision: {
        type: "choose-option" as const,
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "leiji"
      }
    };
  }
}];

function skillId(packId: string, name: string): string {
  return `${packId}:skill:${name}`;
}

function heroId(packId: string, name: string): string {
  return `${packId}:hero:${name}`;
}

const WIND_IMPLEMENTED_SKILLS: Record<string, SkillDefinition> = {
  "红颜": {
    id: skillId("wind", "红颜"),
    name: "红颜",
    implementation: "complete",
    abilities: [{
      type: "modify-card-property",
      property: "suit",
      from: "spade",
      to: "heart"
    }]
  },
  "雷击": {
    id: skillId("wind", "雷击"),
    name: "雷击",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "CardResponded",
      when: [
        { type: "event-player-is-owner", field: "playerId" },
        {
          type: "event-field-equals",
          field: "responseKind",
          value: "jink"
        }
      ],
      context: { card: "event-card" },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: WIND_WORKFLOW.leiji
        }]
      }
    }]
  },
  "鬼道": {
    id: skillId("wind", "鬼道"),
    name: "鬼道",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "JudgmentRevealed",
      context: {
        card: { literal: "system:skill:guidao" }
      },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: STANDARD_WORKFLOW.judgmentReplacement,
          data: {
            judgmentId: {
              type: "event-field",
              field: "judgmentId"
            },
            zones: ["hand", "equipment"],
            color: "black",
            obtainOldCard: true,
            reason: "guidao"
          }
        }]
      }
    }]
  },
  "烈弓": {
    id: skillId("wind", "烈弓"),
    name: "烈弓",
    implementation: "complete",
    abilities: [{
      type: "timing",
      timing: "before-effect",
      priority: 9000,
      match: {
        effectType: "request-response",
        sourceIsOwner: true,
        responseKind: "jink",
        sourceCardTag: "response:slash"
      },
      when: {
        type: "all",
        predicates: [
          {
            type: "compare",
            left: {
              type: "state-field",
              field: "currentPlayerId"
            },
            operator: "eq",
            right: {
              type: "player-id",
              player: { type: "owner" }
            }
          },
          {
            type: "any",
            predicates: [
              {
                type: "compare",
                left: {
                  type: "player-number",
                  player: { type: "effect-responder", index: 0 },
                  property: "hand-count"
                },
                operator: "gte",
                right: {
                  type: "player-number",
                  player: { type: "owner" },
                  property: "hp"
                }
              },
              {
                type: "compare",
                left: {
                  type: "player-number",
                  player: { type: "effect-responder", index: 0 },
                  property: "hand-count"
                },
                operator: "lte",
                right: {
                  type: "player-number",
                  player: { type: "owner" },
                  property: "attack-range"
                }
              }
            ]
          }
        ]
      },
      operation: {
        type: "offer-optional",
        reason: "liegong",
        onActivate: {
          type: "resolve-response",
          outcome: "passed"
        }
      }
    }]
  },
  "狂骨": {
    id: skillId("wind", "狂骨"),
    name: "狂骨",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "DamageApplied",
      when: [{
        type: "event-player-is-owner",
        field: "sourceId"
      }],
      predicate: {
        type: "compare",
        left: {
          type: "distance",
          from: { type: "owner" },
          to: { type: "event-player", field: "targetId" }
        },
        operator: "lte",
        right: { type: "literal", value: 1 }
      },
      context: { card: "event-card" },
      program: {
        steps: [{
          type: "recover",
          player: "source",
          amount: { type: "event-number", field: "amount" },
          source: "source"
        }]
      }
    }]
  }
};

function createHeroPack(
  id: Exclude<EarlyExpansionId, "military">,
  name: string,
  releaseDate: string,
  releaseDatePrecision: "month" | "day",
  evidenceUrls: string[],
  sourcePath: string,
  implementedSkills: Readonly<Record<string, SkillDefinition>> = {},
  workflows: WorkflowDefinition[] = []
): ContentPack {
  const rows = rowsByPack[id];
  const newSkillNames = [...new Set(
    rows.flatMap((row) => row[2]).filter((skill) => skill !== "马术")
  )];
  const skills: SkillDefinition[] = newSkillNames.map((skill) =>
    structuredClone(implementedSkills[skill] ?? {
      id: skillId(id, skill),
      name: skill,
      implementation: "partial"
    })
  );
  const skillStatus = new Map(
    skills.map((skill) => [skill.id, skill.implementation] as const)
  );
  const heroes: HeroDefinition[] = rows.map(
    ([hero, maxHp, heroSkills, kingdom, gender]) => ({
      id: heroId(id, hero),
      name: hero,
      maxHp,
      kingdom,
      gender,
      skillIds: heroSkills.map((skill) =>
        skill === "马术" ? standardSkillId(skill) : skillId(id, skill)
      ),
      implementation: heroSkills.every((skill) => {
        const idForSkill = skill === "马术"
          ? standardSkillId(skill)
          : skillId(id, skill);
        return skill === "马术" || skillStatus.get(idForSkill) === "complete";
      })
        ? "complete"
        : "partial"
    })
  );
  return {
    id,
    version: "1.0.0",
    name,
    requires: ["standard@0.3.0"],
    provenance: {
      releaseDate,
      releaseDatePrecision,
      evidenceUrls,
      rulesSource: {
        repository: SOURCE_REPOSITORY,
        revision: SOURCE_REVISION,
        paths: [sourcePath]
      }
    },
    cards: [],
    skills,
    heroes,
    workflows
  };
}

export function createWindPack(): ContentPack {
  return createHeroPack(
    "wind",
    "神话再临·风",
    "2009-03",
    "month",
    [
      "https://www.yokaverse.com/about-history/",
      "https://news.17173.com/content/2009-03-06/20090306103712008.shtml"
    ],
    "src/wind.cpp",
    WIND_IMPLEMENTED_SKILLS,
    WIND_WORKFLOWS
  );
}

export function createFirePack(): ContentPack {
  return createHeroPack(
    "fire",
    "神话再临·火",
    "2009-11-16",
    "day",
    [
      "https://www.yokaverse.com/about-history/",
      "https://games.sina.com.cn/o/n/2009-11-11/1224351968.shtml"
    ],
    "src/firepackage.cpp"
  );
}

export function createForestPack(): ContentPack {
  return createHeroPack(
    "forest",
    "神话再临·林",
    "2010-07-29",
    "day",
    [
      "https://www.yokaverse.com/about-history/",
      "https://game.zol.com.cn/188/1888124.html"
    ],
    "src/thicket.cpp"
  );
}

export function createEarlyExpansionRegistry(
  selected: readonly EarlyExpansionId[]
): ContentRegistry {
  const registry = new ContentRegistry();
  registry.registerPack(createStandardPack());
  const selectedIds = new Set(selected);
  if (selectedIds.has("military")) {
    registry.registerPack(createManeuveringPack());
  }
  if (selectedIds.has("wind")) registry.registerPack(createWindPack());
  if (selectedIds.has("fire")) registry.registerPack(createFirePack());
  if (selectedIds.has("forest")) registry.registerPack(createForestPack());
  return registry;
}
