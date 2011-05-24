﻿var sgs = sgs || {};

(function (sgs) {
        
    sgs.interface = sgs.interface || {};

    sgs.interface.FILE_LIST = {
        
    };
    
    sgs.interface.CARD_COLOR_NUM_MAPPING = {
        "color": { 0: "red", 1: "red", 2: "black", 3: "black" },
        "number": [ "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K" ]
    };
    
    sgs.interface.IDENTITY_INDEX_MAPPING = {
        "name": {  0: "主公", 1: "忠臣", 2: "内奸", 3: "反贼" }
    };
    
    sgs.interface.IDENTITY_IMG_MAPPING = {
        0: "img/identity/king.png",
        1: "img/identity/liegeman.png",
        2: "img/identity/traitor.png",
        3: "img/identity/enemy.png"
    };
    
    sgs.interface.COUNTRY_IMG_MAPPING = {
        "魏": "img/country/wei.png",
        "蜀": "img/country/shu.png",
        "吴": "img/country/wu.png",
        "群": "img/country/qun.png"
    };
    
    sgs.interface.EQUIPMENT_TYPE_MAPPING = {
        "name": { 0: "武器", 1: "防具", 2: "+1马", 3: "-1马" }
    };

    sgs.interface.cardInfo = {
        /*
         *      牌信息
         *
         * width       - 牌宽度
         * height      - 牌高度
         * out         - 选中时突出的高度
         */
        width: 95,
        height: 133,
        out: 20
    };

    sgs.interface.playerState = {
        /*
         *      玩家状态
         *
         * width       - 牌宽度
         * height      - 牌高度
         * out         - 选中时突出的高度
         */
        stage: 1,
        weapons: [],
        cards: [],
        selectedCards: [],
        blod: 0
    };

    sgs.interface.Card = function (jqObj, name, type, pattern, num, selected) {
        /*
         *      构造牌对象
         *
         * jqObj        - jQuery对象
         * name         - 名称
         * type         - 类型
         * pattern        - 花色
         * num          - 数值
         * selected     - 是否选中
         */
        this.jqObj = jqObj;
        this.name = name;
        this.type = type;
        this.pattern = pattern;
        this.num = num;
        this.selected = selected;
    };
    
    /* 设置信息 */
    sgs.interface.Set_RoleInfo = function(isComp, player, id) {
        /*
         * id              - id
         * player          - 玩家
         * isComp          - 是否为电脑
         */
        if(!isComp) {
            $('#player_country').attr('src', sgs.interface.COUNTRY_IMG_MAPPING[player.hero.country]);
                $('#player_name').text(player.nickname);
                $('#player_head_img').attr('src', 'img/generals/big/' + sgs.HEROIMAG_MAPPING[player.hero.name]);
                $('#player_head .choose_hero_name').text(player.hero.name);
                for (var i = 0; i < player.hero.life; i++) {
                    $('<img src="img/blod_0.png" />').appendTo($('#player_blod_0'));
                    $('<img src="img/blod_1.png" />').appendTo($('#player_blod_1'));
                }
                $("#player_identity img").attr('src', sgs.interface.IDENTITY_IMG_MAPPING[player.identity]);
        } else {
            $(id).find('.role_country img').attr('src', sgs.interface.COUNTRY_IMG_MAPPING[player.hero.country]);
            $(id).find('.role_name').text('_' + player.hero.name + '_');
            if(player.identity == 0)
                $(id).find('.role_identity img').attr('src', sgs.interface.IDENTITY_IMG_MAPPING[0]);
            $(id).find('.head_img img').attr('src', 'img/generals/small/' + sgs.HEROIMAG_MAPPING[player.hero.name]);
            $(id).find('.choose_hero_name').text(player.hero.name);
            for(var k = 0; k < player.hero.life; k++) {
                $(id).find('.blods_0').append('<img src="img/blod_0.png" />');
                $(id).find('.blods_1').append('<img src="img/blod_1.png" />');
            }
        }
    };

    /* 数据加载 */
    sgs.interface.Load_Data = function() {
        $.each(sgs.IMG_LIST, function(i, d) {
            $('#load_imgs').append($('<img src=' + d + ' />'));
        });
        var count = sgs.IMG_LIST.length;
        $('#load_imgs img').load(function() {
            count--;
            if(count == 0) {
                alert('done');
            }
        });
    }
    
    sgs.interface.HERO_PROPERTY_MAPPING = {};
    $.each(sgs.HERO, (function(hero_mapping) {
        return function(i, d) {
            hero_mapping[d.name] = {
                "skill": d.skills
            };
        }
    })(sgs.interface.HERO_PROPERTY_MAPPING));
    
    sgs.interface.SKILL_EXPLANATION_MAPPING = {
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

})(window.sgs);
