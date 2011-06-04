﻿var sgs = sgs || {};
sgs.PLAYER_NUM = 4;
sgs.DEFAULT_AI_LV = 0;
sgs.DELAY = 1000;

sgs.CARD_MAGIC_RANGE_MAPPING = {
    "五谷丰登": -1,
    "桃园结义": -1,
    "南蛮入侵": -1,
    "万箭齐发": -1,
    "决斗": 1,
    "无中生有": 1,
    "顺手牵羊": 1,
    "过河拆桥": 1,
    "借刀杀人": 2,
    "无懈可击": 1,
    "乐不思蜀": 1,
    "闪电": 1,
};

sgs.CARD_CONTERACT_MAPPING = {
    "杀": "闪",
    "五谷丰登": "无懈可击",
    "桃园结义": "无懈可击",
    "南蛮入侵": "无懈可击",
    "万箭齐发": "无懈可击",
};


sgs.EQUIP_RANGE_MAPPING = {
    "诸葛连弩": 1,
    "寒冰剑" : 2,
    "雌雄双股剑" : 2,
    "清鉷剑" : 2,
    "青龙偃月刀" : 3,
    "丈八蛇矛" : 3,
    "贯石斧" : 4,
    "方天画戟" : 5,
    "麒麟弓" : 5,
};

sgs.EQUIP_TYPE_MAPPING = {
    /* 0:武器, 1:防具, 2:+1马, 3:-1马 */
    "诸葛连弩" : 0,
    "雌雄双股剑" : 0,
    "青釭剑" : 0,
    "青龙偃月刀" : 0,
    "丈八蛇矛" : 0,
    "贯石斧" : 0,
    "方天画戟" : 0,
    "麒麟弓" : 0,
    "寒冰剑" : 0,
    "八卦阵" : 1,
    "仁王盾" : 1,
    "绝影" : 2,
    "的卢" : 2,
    "爪黄飞电" : 2,
    "赤兔" : 3,
    "大宛" : 3,
    "紫骍" : 3,
};

sgs.IDENTITY_MAPPING = { /* 人数对应角色数量 */
    /* 0: "主公", 1: "忠臣", 2: "内奸", 3: "反贼" */
    2: [0, 2],
    4: [0, 1, 2, 3],
};

sgs.HERO = [
    ["曹操", 4, ["护驾", "奸雄"], "魏", 1],
    ["张辽", 4, ["突袭"], "魏", 1],
    ["郭嘉", 3, ["天妒", "遗计"], "魏", 1],
    ["夏侯淳", 4, ["刚烈"], "魏", 1],
    ["司马懿", 3, ["反馈", "鬼才"], "魏", 1],
    ["许褚", 4, ["裸衣"], "魏", 1],
    ["甄姬", 3, ["洛神", "倾国"], "魏", 0],
    ["刘备", 4, ["激将", "仁德"], "蜀", 1],
    ["关羽", 4, ["武圣"], "蜀", 1],
    ["张飞", 4, ["咆哮"], "蜀", 1],
    ["赵云", 4, ["龙胆"], "蜀", 1],
    ["马超", 4, ["马术", "铁骑"], "蜀", 1],
    ["诸葛亮", 3, ["观星", "空城"], "蜀", 1],
    ["黄月英", 3, ["集智", "奇才"], "蜀", 0],
    ["孙权", 4, ["救援", "制衡"], "吴", 1],
    ["周瑜", 3, ["反间", "英姿"], "吴", 1],
    ["吕蒙", 4, ["克己"], "吴", 1],
    ["陆逊", 3, ["连营", "谦逊"], "吴", 1],
    ["甘宁", 4, ["奇袭"], "吴", 1],
    ["黄盖", 4, ["苦肉"], "吴", 1],
    ["大乔", 3, ["国色", "流离"], "吴", 0],
    ["孙尚香", 3, ["结姻", "枭姬"], "吴", 0],
    ["吕布", 4, ["无双"], "群", 1],
    ["华佗", 3, ["急救", "青囊"], "群", 1],
    ["貂蝉", 3, ["闭月", "离间"], "群", 0],
];

/*
* 卡牌数据
* 'color' : 方块: 0, 红桃: 1, 梅花: 2, 黑桃: 3;
*/
sgs.CARD = [
    { 'name': '杀', 'color': 3, 'digit': '7', },
    { 'name': '杀', 'color': 3, 'digit': '8', },
    { 'name': '杀', 'color': 3, 'digit': '8', },
    { 'name': '杀', 'color': 3, 'digit': '9', },
    { 'name': '杀', 'color': 3, 'digit': '9', },
    { 'name': '杀', 'color': 3, 'digit': '10', },
    { 'name': '杀', 'color': 3, 'digit': '10', },
    { 'name': '杀', 'color': 2, 'digit': '2', },
    { 'name': '杀', 'color': 2, 'digit': '3', },
    { 'name': '杀', 'color': 2, 'digit': '4', },
    { 'name': '杀', 'color': 2, 'digit': '5', },
    { 'name': '杀', 'color': 2, 'digit': '6', },
    { 'name': '杀', 'color': 2, 'digit': '7', },
    { 'name': '杀', 'color': 2, 'digit': '8', },
    { 'name': '杀', 'color': 2, 'digit': '8', },
    { 'name': '杀', 'color': 2, 'digit': '9', },
    { 'name': '杀', 'color': 2, 'digit': '9', },
    { 'name': '杀', 'color': 2, 'digit': '10', },
    { 'name': '杀', 'color': 2, 'digit': '10', },
    { 'name': '杀', 'color': 2, 'digit': '11', },
    { 'name': '杀', 'color': 2, 'digit': '11', },
    { 'name': '杀', 'color': 1, 'digit': '2', },
    { 'name': '杀', 'color': 1, 'digit': '2', },
    { 'name': '杀', 'color': 1, 'digit': '13', },
    { 'name': '杀', 'color': 0, 'digit': '6', },
    { 'name': '杀', 'color': 0, 'digit': '7', },
    { 'name': '杀', 'color': 0, 'digit': '8', },
    { 'name': '杀', 'color': 0, 'digit': '9', },
    { 'name': '杀', 'color': 0, 'digit': '10', },
    { 'name': '杀', 'color': 0, 'digit': '13', },
    { 'name': '闪', 'color': 1, 'digit': '2', },
    { 'name': '闪', 'color': 1, 'digit': '2', },
    { 'name': '闪', 'color': 1, 'digit': '13', },
    { 'name': '闪', 'color': 0, 'digit': '2', },
    { 'name': '闪', 'color': 0, 'digit': '2', },
    { 'name': '闪', 'color': 0, 'digit': '3', },
    { 'name': '闪', 'color': 0, 'digit': '4', },
    { 'name': '闪', 'color': 0, 'digit': '5', },
    { 'name': '闪', 'color': 0, 'digit': '6', },
    { 'name': '闪', 'color': 0, 'digit': '7', },
    { 'name': '闪', 'color': 0, 'digit': '8', },
    { 'name': '闪', 'color': 0, 'digit': '9', },
    { 'name': '闪', 'color': 0, 'digit': '10', },
    { 'name': '闪', 'color': 0, 'digit': '11', },
    { 'name': '闪', 'color': 0, 'digit': '11', },
    { 'name': '桃', 'color': 1, 'digit': '3', },
    { 'name': '桃', 'color': 1, 'digit': '4', },
    { 'name': '桃', 'color': 1, 'digit': '6', },
    { 'name': '桃', 'color': 1, 'digit': '7', },
    { 'name': '桃', 'color': 1, 'digit': '8', },
    { 'name': '桃', 'color': 1, 'digit': '9', },
    { 'name': '桃', 'color': 1, 'digit': '12', },
    { 'name': '桃', 'color': 0, 'digit': '12', },
    { 'name': '诸葛连弩', 'color': 2, 'digit': '1', },
    { 'name': '诸葛连弩', 'color': 0, 'digit': '1', },
    { 'name': '雌雄双股剑', 'color': 3, 'digit': '2', },
    { 'name': '青釭剑', 'color': 3, 'digit': '6', },
    { 'name': '青龙偃月刀', 'color': 3, 'digit': '5', },
    { 'name': '丈八蛇矛', 'color': 3, 'digit': '12', },
    { 'name': '贯石斧', 'color': 0, 'digit': '5', },
    { 'name': '方天画戟', 'color': 0, 'digit': '12', },
    { 'name': '麒麟弓', 'color': 1, 'digit': '5', },
    { 'name': '八卦阵', 'color': 3, 'digit': '2', },
    { 'name': '八卦阵', 'color': 2, 'digit': '2', },
    { 'name': '绝影', 'color': 3, 'digit': '5', },
    { 'name': '的卢', 'color': 2, 'digit': '5', },
    { 'name': '爪黄飞电', 'color': 1, 'digit': '13', },
    { 'name': '赤兔', 'color': 1, 'digit': '5', },
    { 'name': '大宛', 'color': 3, 'digit': '13', },
    { 'name': '紫骍', 'color': 0, 'digit': '13', },
    { 'name': '五谷丰登', 'color': 1, 'digit': '3', },
    { 'name': '五谷丰登', 'color': 1, 'digit': '4', },
    { 'name': '桃园结义', 'color': 1, 'digit': '1', },
    { 'name': '南蛮入侵', 'color': 3, 'digit': '7', },
    { 'name': '南蛮入侵', 'color': 3, 'digit': '13', },
    { 'name': '南蛮入侵', 'color': 2, 'digit': '7', },
    { 'name': '万箭齐发', 'color': 1, 'digit': '1', },
    { 'name': '决斗', 'color': 3, 'digit': '1', },
    { 'name': '决斗', 'color': 2, 'digit': '1', },
    { 'name': '决斗', 'color': 0, 'digit': '1', },
    { 'name': '无中生有', 'color': 1, 'digit': '7', },
    { 'name': '无中生有', 'color': 1, 'digit': '8', },
    { 'name': '无中生有', 'color': 1, 'digit': '9', },
    { 'name': '无中生有', 'color': 1, 'digit': '11', },
    { 'name': '顺手牵羊', 'color': 3, 'digit': '3', },
    { 'name': '顺手牵羊', 'color': 3, 'digit': '4', },
    { 'name': '顺手牵羊', 'color': 3, 'digit': '11', },
    { 'name': '顺手牵羊', 'color': 0, 'digit': '4', },
    { 'name': '顺手牵羊', 'color': 0, 'digit': '1', },
    { 'name': '过河拆桥', 'color': 3, 'digit': '3', },
    { 'name': '过河拆桥', 'color': 3, 'digit': '4', },
    { 'name': '过河拆桥', 'color': 3, 'digit': '12', },
    { 'name': '过河拆桥', 'color': 2, 'digit': '3', },
    { 'name': '过河拆桥', 'color': 2, 'digit': '4', },
    { 'name': '过河拆桥', 'color': 1, 'digit': '12', },
    { 'name': '借刀杀人', 'color': 2, 'digit': '12', },
    { 'name': '借刀杀人', 'color': 2, 'digit': '13', },
    { 'name': '无懈可击', 'color': 3, 'digit': '11', },
    { 'name': '无懈可击', 'color': 2, 'digit': '12', },
    { 'name': '无懈可击', 'color': 2, 'digit': '13', },
    { 'name': '乐不思蜀', 'color': 3, 'digit': '6', },
    { 'name': '乐不思蜀', 'color': 2, 'digit': '6', },
    { 'name': '乐不思蜀', 'color': 1, 'digit': '6', },
    { 'name': '闪电', 'color': 3, 'digit': '1', },
    { 'name': '寒冰剑', 'color': 3, 'digit': '2', },
    { 'name': '仁王盾', 'color': 2, 'digit': '2', },
    { 'name': '闪电', 'color': 1, 'digit': '12', },
    { 'name': '无懈可击', 'color': 0, 'digit': '12', }
];




sgs.HEROIMAG_MAPPING = {
    "曹操": "caocao.png",
    "张辽": "zhangliao.png",
    "郭嘉": "guojia.png",
    "夏侯淳": "xiahoudun.png",
    "司马懿": "simayi.png",
    "许褚": "xuchu.png",
    "甄姬": "zhenji.png",
    "刘备": "liubei.png",
    "关羽": "guanyu.png",
    "张飞": "zhangfei.png",
    "赵云": "zhaoyun.png",
    "马超": "machao.png",
    "诸葛亮": "zhugeliang.png",
    "黄月英": "huangyueying.png",
    "孙权": "sunquan.png",
    "周瑜": "zhouyu.png",
    "吕蒙": "lvmeng.png",
    "陆逊": "luxun.png",
    "甘宁": "ganning.png",
    "黄盖": "huanggai.png",
    "大乔": "daqiao.png",
    "孙尚香": "sunshangxiang.png",
    "吕布": "lvbu.png",
    "华佗": "huatuo.png",
    "貂蝉": "diaochan.png"
};

sgs.CARDIMAG_MAPING = {
    "万箭齐发": "img/generals/card/archery_attack.png",
    "丈八蛇矛": "img/generals/card/spear.png",
    "乐不思蜀": "img/generals/card/indulgence.png",
    "五谷丰登": "img/generals/card/amazing_grace.png",
    "仁王盾": "img/generals/card/renwang_shield.png",
    "借刀杀人": "img/generals/card/collateral.png",
    "八卦阵": "img/generals/card/eight_diagram.png",
    "决斗": "img/generals/card/duel.png",
    "南蛮入侵": "img/generals/card/savage_assault.png",
    "大宛": "img/generals/card/dayuan.png",
    "寒冰剑": "img/generals/card/ice_sword.png",
    "方天画戟": "img/generals/card/halberd.png",
    "无中生有": "img/generals/card/ex_nihilo.png",
    "无懈可击": "img/generals/card/nullification.png",
    "杀": "img/generals/card/slash.png",
    "桃": "img/generals/card/peach.png",
    "桃园结义": "img/generals/card/god_salvation.png",
    "爪黄飞电": "img/generals/card/zhuahuangfeidian.png",
    "的卢": "img/generals/card/dilu.png",
    "紫骍": "img/generals/card/zixing.png",
    "绝影": "img/generals/card/jueying.png",
    "诸葛连弩": "img/generals/card/crossbow.png",
    "贯石斧": "img/generals/card/axe.png",
    "赤兔": "img/generals/card/chitu.png",
    "过河拆桥": "img/generals/card/dismantlement.png",
    "闪": "img/generals/card/jink.png",
    "闪电": "img/generals/card/lightning.png",
    "雌雄双股剑": "img/generals/card/double_sword.png",
    "青釭剑": "img/generals/card/qinggang_sword.png",
    "青龙偃月刀": "img/generals/card/blade.png",
    "顺手牵羊": "img/generals/card/snatch.png",
    "麒麟弓": "img/generals/card/kylin_bow.png",
};
    
sgs.CARD_COLOR_NUM_MAPPING = {
    "color": { 0: "red", 1: "red", 2: "black", 3: "black" },
    "number": { 1: "A", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "J", 12: "Q", 13: "K" },
};

sgs.IDENTITY_INDEX_MAPPING = {
    "name": {  0: "主公", 1: "忠臣", 2: "内奸", 3: "反贼" }
};
    
sgs.NUMBER_CHARACHER_MAPPING = {
    1: "一",
    2: "二",
    3: "三",
    4: "四",
    5: "五",
    6: "六",
    7: "七",
    8: "八",
    9: "九",
    10: "十",
};
    
sgs.EFFECT_IMG_MAPPING = {
    "杀": "img/system/killer.png",
    "闪": "img/system/jink.png",
    "桃": "img/system/peach.png",
    "决斗": "img/system/duel-b.png",
    "无懈可击": "img/system/nullification.png",
    "闪电": "img/system/lightning.png",
};

sgs.COUNTRY_IMG_MAPPING = {
    "魏": "img/system/country/wei.png",
    "蜀": "img/system/country/shu.png",
    "吴": "img/system/country/wu.png",
    "群": "img/system/country/qun.png"
};

sgs.EQUIP_ICON_MAPPING = {
    0: "img/generals/equipment/icon/attack.png",
    1: "img/generals/equipment/icon/defend.png",
    2: "img/generals/equipment/icon/horse.png",
    3: "img/generals/equipment/icon/horse.png",
};

sgs.EQUIP_IMG_MAPPING = {
    "贯石斧": "img/generals/equipment/axe.png",
    "青龙偃月刀": "img/generals/equipment/blade.png",
    "赤兔": "img/generals/equipment/chitu.png",
    "诸葛连弩": "img/generals/equipment/crossbow.png",
    "大宛": "img/generals/equipment/dayuan.png",
    "的卢": "img/generals/equipment/dilu.png",
    "雌雄双股剑": "img/generals/equipment/double_sword.png",
    "八卦阵": "img/generals/equipment/eight_diagram.png",
    "方天画戟": "img/generals/equipment/halberd.png",
    "绝影": "img/generals/equipment/jueying.png",
    "麒麟弓": "img/generals/equipment/kylin_bow.png",
    "青釭剑": "img/generals/equipment/qinggang_sword.png",
    "丈八蛇矛": "img/generals/equipment/spear.png",
    "爪黄飞电": "img/generals/equipment/zhuahuangfeidian.png",
    "紫骍": "img/generals/equipment/zixing.png",
};

sgs.DEAD_IDENTITY_MAPPING = {
    1: "img/system/dead/liegeman_dead.png",
    2: "img/system/dead/traitor_dead.png",
    3: "img/system/dead/enemy_dead.png",
};

sgs.IDENTITY_IMG_MAPPING = {
    0: "img/system/identity/king.png",
    1: "img/system/identity/liegeman.png",
    2: "img/system/identity/traitor.png",
    3: "img/system/identity/enemy.png"
};

sgs.PATTERN_IMG_MAPPING = {
    0: "img/system/pattern/diamond.png",
    1: "img/system/pattern/heart.png",
    2: "img/system/pattern/club.png",
    3: "img/system/pattern/spade.png",
};

sgs.SOUND_FILE_MAPPING = {
    "card": {
        "杀": { 0: "sound/card/female/slash.ogg", 1: "sound/card/male/slash.ogg" },
        "闪": { 0: "sound/card/female/jink.ogg", 1: "sound/card/male/jink.ogg" },
        "桃": { 0: "sound/card/common/peach.ogg", 1: "sound/card/common/peach.ogg" },
        "决斗": { 0: "sound/card/female/duel.ogg", 1: "sound/card/male/duel.ogg" },
        "闪电": { 0: "sound/card/female/lightning.ogg", 1: "sound/card/male/lightning.ogg" },
        "五谷丰登": { 0: "sound/card/female/amazing_grace.ogg", 1: "sound/card/male/amazing_grace.ogg" },
        "无懈可击": { 0: "sound/card/female/nullification.ogg", 1: "sound/card/male/nullification.ogg" },
        "南蛮入侵": { 0: "sound/card/female/savage_assault.ogg", 1: "sound/card/male/savage_assault.ogg" },
        "万箭齐发": { 0: "sound/card/female/archery_attack.ogg", 1: "sound/card/male/archery_attack.ogg" },
        "借刀杀人": { 0: "sound/card/female/collateral.ogg", 1: "sound/card/male/collateral.ogg" },
        "过河拆桥": { 0: "sound/card/female/dismantlement.ogg", 1: "sound/card/male/dismantlement.ogg" },
        "无中生有": { 0: "sound/card/female/ex_nihilo.ogg", 1: "sound/card/male/ex_nihilo.ogg" },
        "桃园结义": { 0: "sound/card/female/god_salvation.ogg", 1: "sound/card/male/god_salvation.ogg" },
        "乐不思蜀": { 0: "sound/card/female/indulgence.ogg", 1: "sound/card/male/indulgence.ogg" },
        "顺手牵羊": { 0: "sound/card/female/snatch.ogg", 1: "sound/card/male/snatch.ogg" },
    },
    "equipment": {
        0: "sound/card/common/equip.ogg",
        1: "sound/card/common/equip.ogg",
        2: "sound/card/common/horse.ogg",
        3: "sound/card/common/horse.ogg"
    },
    "death": {
        
    },
    "damage": {
        "common": "sound/system/injure2.ogg",
    },
};
    
sgs.SKILL_EXPLANATION_MAPPING = {
    "护驾": "主公技，当你需要使用（或打出）一张【闪】时，你可以发动护驾。所有魏势力角色按行动顺序依次选择是否打出一张【闪】“提供”给你（视为由你使用或打出），直到有一名角色或没有任何角色决定如此做时为止",
    "奸雄": "你可以立即获得对你造成伤害的牌",
    "突袭": "摸牌阶段，你可以放弃摸牌，然后从至多两名（至少一名）角色的手牌里各抽取一张牌★摸牌阶段，你一旦发动突袭，就不能从牌堆获得牌★只剩一名其他角色时，你就只能选择这一名角色★若此时其他任何人都没有手牌，你就不能发动突袭",
    "天妒": "在你的判定牌生效时，你可以立即获得它",
    "遗计": "你每受到1点伤害，可摸两张牌，将其中的一张交给任意一名角色，然后将另一张交给任意一名角色",
    "刚烈": "你每受到一次伤害，可进行一次判定：若结果不为红桃，则目标来源必须进行二选一：弃两张手牌或受到你对其造成的1点伤害",
    "反馈": "你可以立即从对你造成伤害的来源处获得一张牌★一次无论受到多少点伤害，只能获得一张牌，若选择手牌则从对方手里随机抽取，选择面前的装备则由你任选",
    "鬼才": "在任意角色的判定牌生效前，你可以打出一张手牌代替之",
    "裸衣": "摸牌阶段，你可以少摸一张牌；若如此做，该回合的出牌阶段，你使用【杀】或【决斗】（你为伤害来源时）造成的伤害+1",
    "洛神": "回合开始阶段，你可以进行判定：若为黑色，立即获得此生效后的判定牌，并可以再次使用洛神――如此反复，直到出现红色或你不愿意判定了为止",
    "倾国": "你可以将你的黑色手牌当【闪】使用（或打出）★使用倾国时，仅改变牌的类别（名称）和作用，而牌的花色和点数不变",
    "激将": "主公技，当你需要使用（或打出）一张【杀】时，你可以发动激将。所有蜀势力角色按行动顺序依次选择是否打出一张【杀】“提供”给你（视为由你使用或打出），直到有一名角色或没有任何角色决定如此作时为止 ",
    "仁德": "出牌阶段，你可以将任意数量的手牌以任意分配方式交给其他角色，若你给出的牌张数不少于两张时，你回复1点体力★使用仁德技能分出的牌，对方无法拒绝",
    "武圣": "你可以将你的任意一张红色牌当【杀】使用或打出★若同时用到当前装备的红色装备效果时，不可把这张装备牌当【杀】来使用或打出★使用武圣时，仅改变牌的类别(名称)和作用，而牌的花色和点数不变",
    "咆哮": "出牌阶段，你可以使用任意数量的【杀】",
    "龙胆": "你可以将你手牌的【杀】当【闪】、【闪】当【杀】使用或打出。★使用龙胆时，仅改变牌的类别(名称)和作用，而牌的花色和点数不变",
    "马术": "锁定技，当你计算与其他角色的距离时，始终-1★马术的效果与装备-1马时效果一样，但你仍然可以装备一匹-1马",
    "铁骑": "当你使用【杀】指定一名角色为目标后，你可以进行判定，若结果为红色，此【杀】不可被闪避",
    "观星": "回合开始阶段，你可以观看牌堆顶的X张牌（X为存活角色的数量且最多为5），将其中任意数量的牌以任意顺序置于牌堆顶，其余以任意顺序置于牌堆底",
    "空城": "锁定技，当你没有手牌时，你不能成为【杀】或【决斗】的目标",
    "集智": "每当你使用一张非延时类锦囊时，（在它结算之前）你可以立即摸一张牌",
    "奇才": "你使用任何锦囊无距离限制",
    "救援": "主公技，锁定技，其他吴势力角色在你濒死状态下对你使用【桃】时，你额外回复1点体力",
    "制衡": "出牌阶段,你可以弃掉任意数量的牌,然后摸取等量的牌.每回合限用一次",
    "反间": "出牌阶段，你可以令另一名角色选择一种花色，抽取你的一张手牌并亮出，若此牌与所选花色不吻合，则你对该角色造成1点伤害。然后不论结果，该角色都获得此牌。每回合限用一次",
    "英姿": "摸牌阶段，你可以额外摸一张牌",
    "克己": "若你于出牌阶段未使用或打出过任何一张【杀】，你可以跳过此回合的弃牌阶段",
    "连营": "每当你失去最后一张手牌时，可立即摸一张牌",
    "谦逊": "锁定技，你不能成为【顺手牵羊】和【乐不思蜀】的目标",
    "奇袭": "出牌阶段，你可以将你的任意黑色牌当【过河拆桥】使用★这包括自己已装备的牌★使用奇袭时，仅改变牌的类别(名称)和作用，而牌的花色和点数不变",
    "苦肉": "出牌阶段，你可以失去一点体力，然后摸两张牌。每回合中，你可以多次使用苦肉★当你失去最后一点体力时，优先结算濒死事件，当你被救活后，你才可以摸两张牌。换言之，你可以用此技能自杀",
    "国色": "出牌阶段，你可以将你的任意方块花色的牌当【乐不思蜀】使用",
    "流离": "当你成为【杀】的目标时，你可以弃一张牌，并将此【杀】转移给你攻击范围内的另一名角色（该角色不得是【杀】的使用者）",
    "结姻": "出牌阶段，你可以弃两张手牌并选择一名受伤的男性角色：你和目标角色各回复1点体力。每回合限用一次★使用结姻的条件是“有受伤的男性角色”，与你是否受伤无关",
    "枭姬": "当你失去一张装备区里的牌时，你可以立即摸两张牌",
    "无双": "锁定技，你使用【杀】时，目标角色需连续使用两张【闪】才能抵消；与你进行【决斗】的角色每次需连续打出两张【杀】★若对方只有一张【闪】或【杀】则即便使用（打出）了也无效",
    "急救": "你的回合外，你可以将你的任意红色牌当【桃】使用",
    "青囊": "出牌阶段，你可以主动弃掉一张手牌，令任一目标角色回复1点体力。每回合限用一次",
    "闭月": "回合结束阶段，可摸一张牌",
    "离间": "出牌阶段，你可以弃一张牌并选择两名男性角色。若如此作，视为其中一名男性角色对另一名男性角色使用一张【决斗】。（此【决斗】不能被【无懈可击】响应）。每回合限用一次",
};

sgs.IMG_LIST = [
    "img/generals/big/caocao.png",
    "img/generals/big/daqiao.png",
    "img/generals/big/diaochan.png",
    "img/generals/big/ganning.png",
    "img/generals/big/guanyu.png",
    "img/generals/big/guojia.png",
    "img/generals/big/huanggai.png",
    "img/generals/big/huangyueying.png",
    "img/generals/big/huatuo.png",
    "img/generals/big/liubei.png",
    "img/generals/big/luxun.png",
    "img/generals/big/lvbu.png",
    "img/generals/big/lvmeng.png",
    "img/generals/big/machao.png",
    "img/generals/big/simayi.png",
    "img/generals/big/sunquan.png",
    "img/generals/big/sunshangxiang.png",
    "img/generals/big/xiahoudun.png",
    "img/generals/big/xuchu.png",
    "img/generals/big/zhangfei.png",
    "img/generals/big/zhangliao.png",
    "img/generals/big/zhaoyun.png",
    "img/generals/big/zhenji.png",
    "img/generals/big/zhouyu.png",
    "img/generals/big/zhugeliang.png",
    "img/generals/card/amazing_grace.png",
    "img/generals/card/archery_attack.png",
    "img/generals/card/axe.png",
    "img/generals/card/blade.png",
    "img/generals/card/chitu.png",
    "img/generals/card/collateral.png",
    "img/generals/card/crossbow.png",
    "img/generals/card/dayuan.png",
    "img/generals/card/dilu.png",
    "img/generals/card/dismantlement.png",
    "img/generals/card/double_sword.png",
    "img/generals/card/duel.png",
    "img/generals/card/eight_diagram.png",
    "img/generals/card/ex_nihilo.png",
    "img/generals/card/god_salvation.png",
    "img/generals/card/halberd.png",
    "img/generals/card/ice_sword.png",
    "img/generals/card/indulgence.png",
    "img/generals/card/jink.png",
    "img/generals/card/jueying.png",
    "img/generals/card/kylin_bow.png",
    "img/generals/card/lightning.png",
    "img/generals/card/nullification.png",
    "img/generals/card/peach.png",
    "img/generals/card/qinggang_sword.png",
    "img/generals/card/renwang_shield.png",
    "img/generals/card/savage_assault.png",
    "img/generals/card/slash.png",
    "img/generals/card/snatch.png",
    "img/generals/card/spear.png",
    "img/generals/card/zhuahuangfeidian.png",
    "img/generals/card/zixing.png",
    "img/generals/equipment/axe.png",
    "img/generals/equipment/blade.png",
    "img/generals/equipment/border.png",
    "img/generals/equipment/chitu.png",
    "img/generals/equipment/crossbow.png",
    "img/generals/equipment/dayuan.png",
    "img/generals/equipment/dilu.png",
    "img/generals/equipment/double_sword.png",
    "img/generals/equipment/eight_diagram.png",
    "img/generals/equipment/halberd.png",
    "img/generals/equipment/jueying.png",
    "img/generals/equipment/kylin_bow.png",
    "img/generals/equipment/qinggang_sword.png",
    "img/generals/equipment/spear.png",
    "img/generals/equipment/zhuahuangfeidian.png",
    "img/generals/equipment/zixing.png",
    "img/generals/equipment/icon/arrow.png",
    "img/generals/equipment/icon/attack.png",
    "img/generals/equipment/icon/defend.png",
    "img/generals/equipment/icon/horse.png",
    "img/generals/equipment/icon/spear.png",
    "img/generals/hero/caocao.png",
    "img/generals/hero/daqiao.png",
    "img/generals/hero/diaochan.png",
    "img/generals/hero/ganning.png",
    "img/generals/hero/guanyu.png",
    "img/generals/hero/guojia.png",
    "img/generals/hero/huanggai.png",
    "img/generals/hero/huangyueying.png",
    "img/generals/hero/huatuo.png",
    "img/generals/hero/liubei.png",
    "img/generals/hero/luxun.png",
    "img/generals/hero/lvbu.png",
    "img/generals/hero/lvmeng.png",
    "img/generals/hero/machao.png",
    "img/generals/hero/simayi.png",
    "img/generals/hero/sunquan.png",
    "img/generals/hero/sunshangxiang.png",
    "img/generals/hero/xiahoudun.png",
    "img/generals/hero/xuchu.png",
    "img/generals/hero/zhangfei.png",
    "img/generals/hero/zhangliao.png",
    "img/generals/hero/zhaoyun.png",
    "img/generals/hero/zhenji.png",
    "img/generals/hero/zhouyu.png",
    "img/generals/hero/zhugeliang.png",
    "img/generals/icon/indulgence.png",
    "img/generals/icon/lightning.png",
    "img/generals/small/caocao.png",
    "img/generals/small/daqiao.png",
    "img/generals/small/diaochan.png",
    "img/generals/small/ganning.png",
    "img/generals/small/guanyu.png",
    "img/generals/small/guojia.png",
    "img/generals/small/huanggai.png",
    "img/generals/small/huangyueying.png",
    "img/generals/small/huatuo.png",
    "img/generals/small/liubei.png",
    "img/generals/small/luxun.png",
    "img/generals/small/lvbu.png",
    "img/generals/small/lvmeng.png",
    "img/generals/small/machao.png",
    "img/generals/small/simayi.png",
    "img/generals/small/sunquan.png",
    "img/generals/small/sunshangxiang.png",
    "img/generals/small/xiahoudun.png",
    "img/generals/small/xuchu.png",
    "img/generals/small/zhangfei.png",
    "img/generals/small/zhangliao.png",
    "img/generals/small/zhaoyun.png",
    "img/generals/small/zhenji.png",
    "img/generals/small/zhouyu.png",
    "img/generals/small/zhugeliang.png",
    "img/system/blod_0.png",
    "img/system/blod_1.png",
    "img/system/card_back.png",
    "img/system/card_choose_bg.png",
    "img/system/card_choose_title.png",
    "img/system/card_count_bg.png",
    "img/system/damage.png",
    "img/system/data_load_bg.jpg",
    "img/system/draw-card.png",
    "img/system/duel-a.png",
    "img/system/duel-b.png",
    "img/system/jink.png",
    "img/system/killer.png",
    "img/system/lightning.png",
    "img/system/main_top.png",
    "img/system/none.png",
    "img/system/nullification.png",
    "img/system/option.png",
    "img/system/option_check.png",
    "img/system/page_bg.png",
    "img/system/peach.png",
    "img/system/player_info.png",
    "img/system/recover.png",
    "img/system/role_bg.png",
    "img/system/slash.png",
    "img/system/blod/0.png",
    "img/system/blod/1.png",
    "img/system/blod/2.png",
    "img/system/blod/3.png",
    "img/system/blod/4.png",
    "img/system/blod/5.png",
    "img/system/blod/small-0.png",
    "img/system/blod/small-1.png",
    "img/system/blod/small-2.png",
    "img/system/blod/small-3.png",
    "img/system/blod/small-4.png",
    "img/system/blod/small-5.png",
    "img/system/buttons/abandon.png",
    "img/system/buttons/abandon_hover.png",
    "img/system/buttons/abandon_press.png",
    "img/system/buttons/cancel.png",
    "img/system/buttons/cancel_hover.png",
    "img/system/buttons/cancel_press.png",
    "img/system/buttons/ok.png",
    "img/system/buttons/ok_hover.png",
    "img/system/buttons/ok_press.png",
    "img/system/country/god.png",
    "img/system/country/qun.png",
    "img/system/country/shu.png",
    "img/system/country/wei.png",
    "img/system/country/wu.png",
    "img/system/dead/guard.png",
    "img/system/dead/lord.png",
    "img/system/dead/loyalist.png",
    "img/system/dead/marshal.png",
    "img/system/dead/rebel.png",
    "img/system/dead/renegade.png",
    "img/system/dead/unknown.png",
    "img/system/identity/enemy.png",
    "img/system/identity/king.png",
    "img/system/identity/liegeman.png",
    "img/system/identity/traitor.png",
    "img/system/pattern/club.png",
    "img/system/pattern/diamond.png",
    "img/system/pattern/heart.png",
    "img/system/pattern/spade.png",
    "img/system/progress/big/progress.png",
    "img/system/progress/big/progress_bg.png",
    "img/system/progress/big/progress_border.png",
    "img/system/progress/small/progress.png",
    "img/system/progress/small/progress_bg.png",
    "img/system/progress/small/progress_border.png",
];
