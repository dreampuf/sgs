import type { EarlyExpansionId } from "../content/early-expansions";
import type { Identity } from "../core/types";

export type CampaignFaction = "wei" | "shu" | "wu" | "qun";

export interface StorySeatDefinition {
  identity: Identity;
  heroDefinitionId: string;
}

export interface StoryBeat {
  id: string;
  turn: number;
  title: string;
  text: string;
}

export interface StoryScenario {
  id: string;
  year: number;
  era: string;
  title: string;
  difficulty: "初阵" | "鏖战" | "大会战";
  location: string;
  prologue: string[];
  objective: string;
  victoryText: string;
  defeatText: string;
  localIdentity: Identity;
  seats: StorySeatDefinition[];
  localHeroDefinitionIds: string[];
  requiredExpansionIds: EarlyExpansionId[];
  cardNames: string[];
  beats: StoryBeat[];
  unlockHeroDefinitionIds: string[];
}

export interface StoryCampaign {
  id: CampaignFaction;
  name: string;
  banner: string;
  description: string;
  initialHeroDefinitionIds: string[];
  timeline: StoryScenario[];
}

export interface CampaignProgress {
  schemaVersion: 1;
  campaignId: CampaignFaction;
  completedScenarioIds: string[];
  unlockedHeroDefinitionIds: string[];
  currentScenarioId: string;
  updatedAt: number;
}

const STANDARD_BATTLE_CARDS = [
  "杀", "闪", "桃", "酒", "决斗", "南蛮入侵", "万箭齐发",
  "无懈可击", "无中生有", "过河拆桥", "顺手牵羊", "借刀杀人",
  "乐不思蜀", "闪电", "五谷丰登", "铁索连环", "火攻",
  "八卦阵", "青釭剑", "贯石斧", "丈八蛇矛", "方天画戟",
  "赤兔", "的卢"
];

const FIRE_BATTLE_CARDS = [
  ...STANDARD_BATTLE_CARDS,
  "火杀", "雷杀", "兵粮寸断", "朱雀羽扇", "藤甲", "白银狮子"
];

const scenario = (
  value: Omit<StoryScenario, "cardNames"> & {
    cardNames?: string[];
  }
): StoryScenario => ({
  ...value,
  cardNames: value.cardNames ?? STANDARD_BATTLE_CARDS
});

export const STORY_CAMPAIGNS: Record<CampaignFaction, StoryCampaign> = {
  shu: {
    id: "shu",
    name: "蜀汉传",
    banner: "兴复汉室",
    description: "从涿郡结义到长坂突围，在流离与抉择中聚拢同道。",
    initialHeroDefinitionIds: ["standard:hero:刘备"],
    timeline: [
      scenario({
        id: "shu-184-taoyuan",
        year: 184,
        era: "中平元年",
        title: "桃园举义",
        difficulty: "初阵",
        location: "幽州 · 涿郡",
        prologue: [
          "黄巾四起，州郡告急。刘备在涿郡遇见关羽与张飞，三人约定同心救民。",
          "这不是一场随机身份局：义军必须击退黄巾首领，并让桃园誓言成为真正的军心。"
        ],
        objective: "保护刘备，击破张角所率黄巾军。",
        victoryText: "黄巾暂退，关羽、张飞正式加入队伍。",
        defeatText: "义军未能站稳脚跟，桃园誓言仍需用下一次胜利来证明。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "standard:hero:刘备" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:关羽" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:张飞" },
          { identity: "rebel", heroDefinitionId: "wind:hero:张角" }
        ],
        localHeroDefinitionIds: ["standard:hero:刘备"],
        requiredExpansionIds: ["wind", "military"],
        beats: [
          {
            id: "oath",
            turn: 1,
            title: "桃园誓言",
            text: "关羽与张飞并肩入阵，本场必须优先守住刘备。"
          },
          {
            id: "yellow-turban-counter",
            turn: 2,
            title: "黄巾反扑",
            text: "张角引雷助阵，保留【闪】与【无懈可击】应对反击。"
          }
        ],
        unlockHeroDefinitionIds: [
          "standard:hero:关羽",
          "standard:hero:张飞"
        ]
      }),
      scenario({
        id: "shu-190-hulao",
        year: 190,
        era: "初平元年",
        title: "虎牢扬名",
        difficulty: "鏖战",
        location: "司隶 · 虎牢关",
        prologue: [
          "诸侯会盟讨董，虎牢关前吕布无人能挡。",
          "刘关张必须协力撕开关隘，董卓军的装备与骑兵将改变交战距离。"
        ],
        objective: "击败董卓与吕布，保持至少一名桃园武将在场。",
        victoryText: "三英战吕布之名传遍联军，赵云开始关注这支义军。",
        defeatText: "虎牢关仍在董卓手中，义军只能暂避锋芒。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "standard:hero:刘备" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:关羽" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:张飞" },
          { identity: "rebel", heroDefinitionId: "forest:hero:董卓" },
          { identity: "rebel", heroDefinitionId: "standard:hero:吕布" },
          { identity: "rebel", heroDefinitionId: "forest:hero:贾诩" }
        ],
        localHeroDefinitionIds: ["standard:hero:刘备"],
        requiredExpansionIds: ["wind", "military", "forest"],
        beats: [
          {
            id: "gate-open",
            turn: 1,
            title: "关门大开",
            text: "吕布主动出关，武器与坐骑是本场的关键资源。"
          },
          {
            id: "three-brothers",
            turn: 3,
            title: "三英合击",
            text: "桃园众人稳住阵线，开始向董卓本阵推进。"
          }
        ],
        unlockHeroDefinitionIds: ["standard:hero:赵云"]
      }),
      scenario({
        id: "shu-208-changban",
        year: 208,
        era: "建安十三年",
        title: "长坂突围",
        difficulty: "大会战",
        location: "荆州 · 长坂坡",
        prologue: [
          "曹军南下，百姓与军队被冲散。长坂之战的目标不是争夺身份，而是护送残部突围。",
          "赵云、张飞与诸葛亮必须在有限补给下撑过曹军追击。"
        ],
        objective: "击退曹操追兵，并让蜀军主将存活至战斗结束。",
        victoryText: "长坂桥后的追兵止步，诸葛亮正式成为战役可选武将。",
        defeatText: "撤退队伍被曹军截断，必须重新规划突围路线。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "standard:hero:赵云" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:刘备" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:张飞" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:诸葛亮" },
          { identity: "rebel", heroDefinitionId: "standard:hero:曹操" },
          { identity: "rebel", heroDefinitionId: "standard:hero:夏侯惇" },
          { identity: "rebel", heroDefinitionId: "standard:hero:张辽" },
          { identity: "rebel", heroDefinitionId: "standard:hero:许褚" }
        ],
        localHeroDefinitionIds: ["standard:hero:赵云"],
        requiredExpansionIds: ["wind", "military", "forest"],
        cardNames: FIRE_BATTLE_CARDS,
        beats: [
          {
            id: "cavalry-arrives",
            turn: 1,
            title: "曹军追骑",
            text: "追兵已经抵达，治疗牌与防具必须留给承担伤害的武将。"
          },
          {
            id: "bridge-stand",
            turn: 3,
            title: "据桥断后",
            text: "张飞守住桥头，蜀军获得最后的反击窗口。"
          }
        ],
        unlockHeroDefinitionIds: ["standard:hero:诸葛亮"]
      })
    ]
  },
  wei: {
    id: "wei",
    name: "曹魏传",
    banner: "奉天子以令不臣",
    description: "从陈留起兵到官渡决战，以谋略和军纪统一北方。",
    initialHeroDefinitionIds: ["standard:hero:曹操"],
    timeline: [
      scenario({
        id: "wei-184-qibing",
        year: 184,
        era: "中平元年",
        title: "陈留起兵",
        difficulty: "初阵",
        location: "兖州 · 陈留",
        prologue: [
          "乱世初起，曹操召集宗族与乡勇，准备建立一支真正服从军令的队伍。",
          "夏侯惇率先响应，而黄巾军与游骑正试图切断补给。"
        ],
        objective: "保护曹操，清除黄巾首领并建立陈留据点。",
        victoryText: "第一支曹军成形，夏侯惇与许褚加入可用名册。",
        defeatText: "军令未能贯彻，陈留兵马被迫分散。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "standard:hero:曹操" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:夏侯惇" },
          { identity: "rebel", heroDefinitionId: "wind:hero:张角" }
        ],
        localHeroDefinitionIds: ["standard:hero:曹操"],
        requiredExpansionIds: ["wind", "military"],
        beats: [
          {
            id: "military-order",
            turn: 1,
            title: "整肃军令",
            text: "曹操需要利用【奸雄】积累资源，而不是急于消耗全部手牌。"
          }
        ],
        unlockHeroDefinitionIds: [
          "standard:hero:夏侯惇",
          "standard:hero:许褚"
        ]
      }),
      scenario({
        id: "wei-200-guandu",
        year: 200,
        era: "建安五年",
        title: "官渡决战",
        difficulty: "鏖战",
        location: "官渡",
        prologue: [
          "袁绍兵多粮足，曹军却已接近极限。",
          "郭嘉判断胜负不在兵力，而在能否迫使袁军连续犯错。"
        ],
        objective: "击败袁绍军，并控制手牌消耗以撑过持久战。",
        victoryText: "乌巢火起，北方格局逆转，郭嘉加入可用名册。",
        defeatText: "粮道被压制，曹军只能退回许都。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "standard:hero:曹操" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:郭嘉" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:许褚" },
          { identity: "rebel", heroDefinitionId: "fire:hero:袁绍" },
          { identity: "rebel", heroDefinitionId: "fire:hero:颜良文丑" }
        ],
        localHeroDefinitionIds: ["standard:hero:曹操"],
        requiredExpansionIds: ["wind", "military", "fire"],
        cardNames: FIRE_BATTLE_CARDS,
        beats: [
          {
            id: "supply-pressure",
            turn: 2,
            title: "粮道告急",
            text: "袁军开始施压，延时锦囊将决定双方的行动节奏。"
          }
        ],
        unlockHeroDefinitionIds: ["standard:hero:郭嘉"]
      }),
      scenario({
        id: "wei-208-chibi",
        year: 208,
        era: "建安十三年",
        title: "赤壁逆流",
        difficulty: "大会战",
        location: "长江 · 赤壁",
        prologue: [
          "北方大军抵达长江，陌生的水战和火攻让优势迅速消失。",
          "曹操必须在周瑜完成火攻前重新组织舰队。"
        ],
        objective: "击破孙刘联军，避免曹军主将在火焰伤害中阵亡。",
        victoryText: "曹军稳住江面，司马懿进入核心谋士名册。",
        defeatText: "烈火连船，北军沿华容道撤退。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "standard:hero:曹操" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:夏侯惇" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:张辽" },
          { identity: "rebel", heroDefinitionId: "standard:hero:周瑜" },
          { identity: "rebel", heroDefinitionId: "standard:hero:黄盖" },
          { identity: "rebel", heroDefinitionId: "standard:hero:刘备" },
          { identity: "rebel", heroDefinitionId: "standard:hero:诸葛亮" }
        ],
        localHeroDefinitionIds: ["standard:hero:曹操"],
        requiredExpansionIds: ["wind", "military", "fire"],
        cardNames: FIRE_BATTLE_CARDS,
        beats: [
          {
            id: "east-wind",
            turn: 2,
            title: "东风骤起",
            text: "火焰伤害与连环状态成为本场最危险的组合。"
          }
        ],
        unlockHeroDefinitionIds: ["standard:hero:司马懿"]
      })
    ]
  },
  wu: {
    id: "wu",
    name: "东吴传",
    banner: "据江东而观天下",
    description: "从孙坚讨董到赤壁决战，建立能够独立面对天下的江东基业。",
    initialHeroDefinitionIds: ["forest:hero:孙坚"],
    timeline: [
      scenario({
        id: "wu-190-sishuiguan",
        year: 190,
        era: "初平元年",
        title: "先锋破关",
        difficulty: "初阵",
        location: "司隶 · 汜水关",
        prologue: [
          "孙坚担任联军先锋，最先撞上董卓军的坚固关防。",
          "黄盖负责稳住阵线，必须在补给断绝前打开关门。"
        ],
        objective: "保护孙坚并击破董卓军关防。",
        victoryText: "江东军声名初立，黄盖与孙权进入可用名册。",
        defeatText: "先锋受挫，江东军退回营地等待补给。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "forest:hero:孙坚" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:黄盖" },
          { identity: "rebel", heroDefinitionId: "forest:hero:董卓" }
        ],
        localHeroDefinitionIds: ["forest:hero:孙坚"],
        requiredExpansionIds: ["military", "forest"],
        beats: [
          {
            id: "vanguard",
            turn: 1,
            title: "先锋先登",
            text: "孙坚军必须主动压缩董卓的装备优势。"
          }
        ],
        unlockHeroDefinitionIds: [
          "standard:hero:黄盖",
          "standard:hero:孙权"
        ]
      }),
      scenario({
        id: "wu-200-jiangdong",
        year: 200,
        era: "建安五年",
        title: "江东定策",
        difficulty: "鏖战",
        location: "吴郡",
        prologue: [
          "孙策之后，年轻的孙权需要证明江东不是依靠一人维系。",
          "周瑜与太史慈整合新军，北方势力则趁权力交接试探江东防线。"
        ],
        objective: "以孙权统合江东诸将，并击退北方势力的试探。",
        victoryText: "江东文武归心，周瑜与太史慈进入可用名册。",
        defeatText: "各部未能形成合力，江东再次陷入动荡。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "standard:hero:孙权" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:周瑜" },
          { identity: "loyalist", heroDefinitionId: "fire:hero:太史慈" },
          { identity: "rebel", heroDefinitionId: "standard:hero:曹操" },
          { identity: "rebel", heroDefinitionId: "standard:hero:夏侯惇" }
        ],
        localHeroDefinitionIds: ["standard:hero:孙权"],
        requiredExpansionIds: ["military", "fire", "forest"],
        beats: [
          {
            id: "young-lord",
            turn: 1,
            title: "新主临阵",
            text: "通过【制衡】调整手牌，展示江东新政的执行力。"
          }
        ],
        unlockHeroDefinitionIds: [
          "standard:hero:周瑜",
          "fire:hero:太史慈"
        ]
      }),
      scenario({
        id: "wu-208-chibi",
        year: 208,
        era: "建安十三年",
        title: "赤壁烈焰",
        difficulty: "大会战",
        location: "长江 · 赤壁",
        prologue: [
          "曹军压境，长江成为江东最后的屏障。",
          "周瑜与黄盖准备以火攻扭转兵力差距。"
        ],
        objective: "利用火焰与连环击破曹军主力。",
        victoryText: "赤壁火光照亮江东，陆逊进入后续战役名册。",
        defeatText: "曹军突破江防，江东进入最危险的时刻。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "standard:hero:周瑜" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:黄盖" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:刘备" },
          { identity: "loyalist", heroDefinitionId: "fire:hero:卧龙诸葛亮" },
          { identity: "rebel", heroDefinitionId: "standard:hero:曹操" },
          { identity: "rebel", heroDefinitionId: "standard:hero:夏侯惇" },
          { identity: "rebel", heroDefinitionId: "standard:hero:张辽" },
          { identity: "rebel", heroDefinitionId: "standard:hero:许褚" }
        ],
        localHeroDefinitionIds: ["standard:hero:周瑜"],
        requiredExpansionIds: ["military", "fire", "forest"],
        cardNames: FIRE_BATTLE_CARDS,
        beats: [
          {
            id: "false-surrender",
            turn: 2,
            title: "苦肉诈降",
            text: "黄盖已经接近曹军舰队，火攻窗口即将出现。"
          }
        ],
        unlockHeroDefinitionIds: ["standard:hero:陆逊"]
      })
    ]
  },
  qun: {
    id: "qun",
    name: "群雄传",
    banner: "乱世逐鹿",
    description: "在黄巾、董卓与诸侯混战中选择自己的生存方式。",
    initialHeroDefinitionIds: ["wind:hero:张角"],
    timeline: [
      scenario({
        id: "qun-184-huangjin",
        year: 184,
        era: "中平元年",
        title: "苍天已死",
        difficulty: "初阵",
        location: "冀州 · 广宗",
        prologue: [
          "张角举起黄天旗号，各地信众同时响应。",
          "官军正在合围，雷击与改判是黄巾军突破包围的核心。"
        ],
        objective: "保护张角并击退官军主将。",
        victoryText: "黄天声势大振，于吉进入可用名册。",
        defeatText: "广宗防线崩溃，黄巾余部转入各地。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "wind:hero:张角" },
          { identity: "loyalist", heroDefinitionId: "wind:hero:于吉" },
          { identity: "rebel", heroDefinitionId: "standard:hero:曹操" }
        ],
        localHeroDefinitionIds: ["wind:hero:张角"],
        requiredExpansionIds: ["wind", "military", "forest"],
        beats: [
          {
            id: "yellow-heaven",
            turn: 1,
            title: "黄天当立",
            text: "保留黑色牌，为张角的【鬼道】与【雷击】创造空间。"
          }
        ],
        unlockHeroDefinitionIds: [
          "wind:hero:于吉",
          "forest:hero:董卓"
        ]
      }),
      scenario({
        id: "qun-189-luoyang",
        year: 189,
        era: "中平六年",
        title: "董卓入京",
        difficulty: "鏖战",
        location: "司隶 · 洛阳",
        prologue: [
          "朝局崩坏，董卓控制洛阳，吕布成为其最锋利的兵器。",
          "各方势力在宫城内外试探，任何盟约都可能在下一回合破裂。"
        ],
        objective: "控制洛阳，并击退试图刺杀董卓的诸侯。",
        victoryText: "董卓暂时掌控朝廷，吕布与貂蝉进入可用名册。",
        defeatText: "洛阳局势失控，西凉军被迫收缩防线。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "forest:hero:董卓" },
          { identity: "loyalist", heroDefinitionId: "standard:hero:吕布" },
          { identity: "rebel", heroDefinitionId: "standard:hero:曹操" },
          { identity: "rebel", heroDefinitionId: "forest:hero:孙坚" },
          { identity: "rebel", heroDefinitionId: "standard:hero:貂蝉" }
        ],
        localHeroDefinitionIds: ["forest:hero:董卓"],
        requiredExpansionIds: ["wind", "military", "forest"],
        beats: [
          {
            id: "capital-chaos",
            turn: 2,
            title: "宫门生变",
            text: "多方势力同时行动，群体锦囊的收益与风险都会放大。"
          }
        ],
        unlockHeroDefinitionIds: [
          "standard:hero:吕布",
          "standard:hero:貂蝉"
        ]
      }),
      scenario({
        id: "qun-190-hulao",
        year: 190,
        era: "初平元年",
        title: "虎牢独战",
        difficulty: "大会战",
        location: "司隶 · 虎牢关",
        prologue: [
          "诸侯大军压向虎牢关，吕布必须独自承担正面压力。",
          "这一战将决定他是董卓的武器，还是拥有自己道路的群雄。"
        ],
        objective: "以吕布或董卓击溃联军核心。",
        victoryText: "虎牢关前无人敢进，贾诩进入后续战役名册。",
        defeatText: "关隘失守，董卓军向长安撤退。",
        localIdentity: "lord",
        seats: [
          { identity: "lord", heroDefinitionId: "standard:hero:吕布" },
          { identity: "loyalist", heroDefinitionId: "forest:hero:董卓" },
          { identity: "loyalist", heroDefinitionId: "forest:hero:贾诩" },
          { identity: "rebel", heroDefinitionId: "standard:hero:刘备" },
          { identity: "rebel", heroDefinitionId: "standard:hero:关羽" },
          { identity: "rebel", heroDefinitionId: "standard:hero:张飞" },
          { identity: "rebel", heroDefinitionId: "forest:hero:孙坚" }
        ],
        localHeroDefinitionIds: ["standard:hero:吕布"],
        requiredExpansionIds: ["wind", "military", "forest"],
        cardNames: FIRE_BATTLE_CARDS,
        beats: [
          {
            id: "peerless",
            turn: 1,
            title: "无双出阵",
            text: "吕布可以迫使对手交出更多响应牌，但必须防止被集中消耗。"
          }
        ],
        unlockHeroDefinitionIds: ["forest:hero:贾诩"]
      })
    ]
  }
};

export function campaignScenario(
  campaignId: CampaignFaction,
  scenarioId: string
): StoryScenario {
  const value = STORY_CAMPAIGNS[campaignId].timeline.find(
    (item) => item.id === scenarioId
  );
  if (!value) throw new Error(`unknown story scenario: ${scenarioId}`);
  return value;
}

export function createCampaignProgress(
  campaignId: CampaignFaction,
  now = Date.now()
): CampaignProgress {
  const campaign = STORY_CAMPAIGNS[campaignId];
  return {
    schemaVersion: 1,
    campaignId,
    completedScenarioIds: [],
    unlockedHeroDefinitionIds: [...campaign.initialHeroDefinitionIds],
    currentScenarioId: campaign.timeline[0]!.id,
    updatedAt: now
  };
}

export function availableScenarioIds(
  progress: CampaignProgress
): string[] {
  const campaign = STORY_CAMPAIGNS[progress.campaignId];
  const completed = new Set(progress.completedScenarioIds);
  return campaign.timeline.filter((item, index) =>
    index === 0 || completed.has(campaign.timeline[index - 1]!.id)
  ).map((item) => item.id);
}

export function completeCampaignScenario(
  progress: CampaignProgress,
  scenarioId: string,
  now = Date.now()
): CampaignProgress {
  const campaign = STORY_CAMPAIGNS[progress.campaignId];
  const currentIndex = campaign.timeline.findIndex(
    (item) => item.id === scenarioId
  );
  if (currentIndex < 0) {
    throw new Error(`scenario does not belong to campaign: ${scenarioId}`);
  }
  if (!availableScenarioIds(progress).includes(scenarioId)) {
    throw new Error(`story scenario is locked: ${scenarioId}`);
  }
  const completedScenarioIds = [
    ...new Set([...progress.completedScenarioIds, scenarioId])
  ];
  const unlockedHeroDefinitionIds = [
    ...new Set([
      ...progress.unlockedHeroDefinitionIds,
      ...campaign.timeline[currentIndex]!.unlockHeroDefinitionIds
    ])
  ];
  const completed = new Set(completedScenarioIds);
  const next = campaign.timeline.find((item) => !completed.has(item.id));
  return {
    ...progress,
    completedScenarioIds,
    unlockedHeroDefinitionIds,
    currentScenarioId: next?.id ?? campaign.timeline.at(-1)!.id,
    updatedAt: now
  };
}

export function parseCampaignProgress(
  serialized: string,
  campaignId: CampaignFaction
): CampaignProgress {
  const value = JSON.parse(serialized) as Partial<CampaignProgress>;
  if (
    value.schemaVersion !== 1 ||
    value.campaignId !== campaignId ||
    !Array.isArray(value.completedScenarioIds) ||
    !Array.isArray(value.unlockedHeroDefinitionIds) ||
    !value.completedScenarioIds.every((id) => typeof id === "string") ||
    !value.unlockedHeroDefinitionIds.every((id) => typeof id === "string") ||
    typeof value.currentScenarioId !== "string" ||
    typeof value.updatedAt !== "number"
  ) {
    throw new Error("剧情战役进度无效");
  }
  const campaign = STORY_CAMPAIGNS[campaignId];
  const scenarioIds = new Set(campaign.timeline.map((item) => item.id));
  const expectedCompletedScenarioIds = campaign.timeline.slice(
    0,
    value.completedScenarioIds.length
  ).map((item) => item.id);
  const expectedUnlockedHeroIds = new Set([
    ...campaign.initialHeroDefinitionIds,
    ...campaign.timeline
      .filter((item) => value.completedScenarioIds!.includes(item.id))
      .flatMap((item) => item.unlockHeroDefinitionIds)
  ]);
  const expectedCurrentScenarioId =
    campaign.timeline.find(
      (item) => !value.completedScenarioIds!.includes(item.id)
    )?.id ?? campaign.timeline.at(-1)!.id;
  if (
    !value.completedScenarioIds.every((id) => scenarioIds.has(id)) ||
    value.completedScenarioIds.join("\n") !==
      expectedCompletedScenarioIds.join("\n") ||
    value.unlockedHeroDefinitionIds.length !== expectedUnlockedHeroIds.size ||
    !value.unlockedHeroDefinitionIds.every(
      (heroId) => expectedUnlockedHeroIds.has(heroId)
    ) ||
    value.currentScenarioId !== expectedCurrentScenarioId
  ) {
    throw new Error("剧情战役进度引用了未知场景");
  }
  return value as CampaignProgress;
}
