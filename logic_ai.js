var sgs = sgs || {};

var _ = sgs.func.format,
    filter = sgs.func.filter,
    exclude = sgs.func.exclude, 
    shuffle = sgs.func.shuffle,
    range = sgs.func.range,
    choice = sgs.func.choice,
    each = sgs.func.each,
    zip = sgs.func.zip,
    max = sgs.func.max,
    map = sgs.func.map;

(function(sgs){
    sgs.Ai = function(bout, player, lv) {
        /* AI 解析对象
         * player: 扮演玩家对象
         * bout: 当前局
         * lv: AI难度 0, 1, 2; 简单,普通,困难
         * */
        this.player = player;
        this.bout = bout;
        this.lv = lv != undefined ? lv : bout.ailv;

        this.hassha = false; /* 当前玩家是否已出杀 */
    };
    sgs.Ai.interpreter = function(bout, opt) {

    };
    sgs.Ai.level_config = {
        0: { name: "简单", targetBloodWeight: 0, handWeight: 0, savePeach: false },
        1: { name: "普通", targetBloodWeight: 1, handWeight: 0.25, savePeach: true },
        2: { name: "困难", targetBloodWeight: 1.5, handWeight: 0.5, savePeach: true }
    };
    sgs.Ai.role_strategy = {
        0: { name: "主公", protectLord: true, focusRebel: true },
        1: { name: "忠臣", protectLord: true, focusRebel: true },
        2: { name: "内奸", preserveSelf: true, weakenStrongSide: true },
        3: { name: "反贼", focusLord: true }
    };
    sgs.Ai.prototype.strategy = function() {
        return sgs.Ai.role_strategy[this.player.identity] || {};
    };
    sgs.Ai.prototype.card_value = function(card) {
        var value = sgs.Ai.card_value[card.name] || 1,
            strategy = this.strategy(),
            pl = this.player;
        if(strategy.protectLord && (card.name == "桃" || card.name == "无懈可击")) { value += 2; }
        if(strategy.focusLord && (card.name == "杀" || card.name == "火杀" || card.name == "雷杀" || card.name == "决斗")) { value += 1; }
        if(pl.blood <= 2 && (card.name == "桃" || card.name == "闪" || card.name == "酒")) { value += 2; }
        if(pl.hero && (pl.hero.name == "华佗" || pl.hero.name == "刘备") && card.name == "桃") { value += 2; }
        return value;
    };
    sgs.Ai.magic_weigh = { /* 锦囊牌权重 */
        "顺手牵羊": 5,
        "无中生有": 5,
        "南蛮入侵": 5,
        "万箭齐发": 5,
        "过河拆桥": 4,
        "决斗": 4,
        "借刀杀人": 3,
        "五谷丰登": 2,
        "桃园结义": 2,
        "乐不思蜀": 2,
        "无懈可击": 1,
        "闪电": 1,
        "兵粮寸断": 3,
        "铁索连环": 2,
        "火攻": 4,
    };
    sgs.Ai.card_value = {
        "桃": 9, "闪": 7, "无懈可击": 6, "杀": 5, "火杀": 5, "雷杀": 5,
        "酒": 4, "无中生有": 8, "顺手牵羊": 7, "过河拆桥": 6,
        "决斗": 5, "南蛮入侵": 5, "万箭齐发": 5, "乐不思蜀": 6,
        "兵粮寸断": 6, "铁索连环": 3, "火攻": 5
    };
    sgs.Ai.identity_rela = { /* 身份之间敌对关系 (1 ~ 3) */
        /*主公*/
        0 : { 0 : 0,
              1 : 1,
              2 : 2,
              3 : 3 },
        /*忠臣*/
        1 : { 0 : 1,
              1 : 0,
              2 : 3,
              3 : 3 },
        /*内奸*/
        2 : { 0 : 2,
              1 : 3,
              2 : 0,
              3 : 3 },
        /*反贼*/
        3 : { 0 : 3,
              1 : 3,
              2 : 3,
              3 : 0 },
    };
    sgs.Ai.interpreter.attack_deviation = (function(rela_map, level_config, role_strategy){ return function(bout, plsrc, lv) {
        /* 依据身份、AI等级、血量、手牌与角色策略评判进攻对象 */
        var plsrc_iden = plsrc.identity,
            config = level_config[lv] || level_config[1],
            strategy = role_strategy[plsrc_iden] || {},
            pls_rel = map(bout.player, function(i){ return rela_map[plsrc_iden][i.identity]; });

        each(bout.player, function(n, i) {
            if(i == plsrc || i.blood <= 0) {
                pls_rel[n] = -1;
            } else {
                pls_rel[n] += Math.max(0, i.maxBlood - i.blood) * config.targetBloodWeight;
                pls_rel[n] += Math.max(0, i.card.length - 2) * config.handWeight;
                if(strategy.focusLord && i.identity == 0) { pls_rel[n] += 2; }
                if(strategy.focusRebel && i.identity == 3) { pls_rel[n] += 1.25; }
                if(strategy.protectLord && i.identity == 0) { pls_rel[n] -= 2; }
                if(strategy.weakenStrongSide && i.identity == 0 && i.blood > 2) { pls_rel[n] += 0.75; }
                if(strategy.preserveSelf && i.card.length < 2) { pls_rel[n] -= 0.5; }
            }
        });
        return pls_rel; 
    } })(sgs.Ai.identity_rela, sgs.Ai.level_config, sgs.Ai.role_strategy);
    sgs.Ai.interpreter.magic_deviation = (function(magic_weigh, 
                                                   CARD_MAGIC_RANGE_MAPPING){ return function(bout, plsrc, pltar) {
        /* 使用锦囊决策 */
        var magic_cards = filter(plsrc.card, function(i) { return CARD_MAGIC_RANGE_MAPPING[i.name] &&
                                                                  i.name != "无懈可击"; }),
            be_use_card, be_use_card_weigh = -1, card_weigh, card_select_info;
        each(magic_cards, function(n, i){
            card_weigh = magic_weigh[i.name];
            if(be_use_card_weigh < card_weigh){
                card_select_info = bout.select_card(new sgs.Operate(i.name, plsrc, pltar, i));
                if(card_select_info[0].indexOf(pltar) != -1) {
                    be_use_card = i;
                    be_use_card_weigh = card_weigh;
                }
            }
        });
        return be_use_card; 
    } })(sgs.Ai.magic_weigh,
         sgs.CARD_MAGIC_RANGE_MAPPING);

    sgs.Ai.prototype.ask_card = (function(){ return function(opt) {
        var pl = this.player,
            bout = this.bout,
            cardname = opt.data,
            opt_top = this.bout.opt[0];
        
        if(opt.id == "技能") {
            switch(cardname) {
                case "洛神":
                    return bout.response_card(new sgs.Operate("技能", pl, pl, "洛神"));
                case "鬼才":
                    return bout.response_card(new sgs.Operate("技能", pl, pl, true));
            }
        } else {
            switch(cardname) {
                case "无懈可击":
                    if(opt.source == pl && opt_top && opt_top.target != pl) { /* 不无懈自己出的牌 */
                        return bout.response_card(new sgs.Operate(cardname, pl, pl, pl.findcard(cardname)));
                    }
                    break;
                case "桃":
                    if(opt.source == pl) { /* 自己 */
                        return bout.response_card(new sgs.Operate(cardname, pl, pl, pl.findcard(cardname)));
                    }
                    break;
                case "闪":
                    return bout.response_card(new sgs.Operate(cardname, pl, opt.source, pl.findcard(cardname)));
            }
        }
        return bout.response_card(new sgs.Operate(cardname, pl, opt.source));
    } })();
    sgs.Ai.prototype.choice_card = (function(){ return function(opt) {
        var pl = this.player,
            bout = this.bout,
            use = false,
            cards = pl.card;

        if(!opt) { /* 主动出牌 */
            return this.usecard();
        } else { /* 被动出牌 */
            bout.choice_card(new sgs.Operate(opt.id, pl, opt.source, pl.findcard(opt.id))); 
        }
    } })();
    sgs.Ai.prototype.usecard = (function(attack_deviation, 
                                         magic_deviation,
                                         EQUIP_TYPE_MAPPING, 
                                         CARD_MAGIC_RANGE_MAPPING){ return function() {
        var pl = this.player,
            plstatus = pl.status,
            bout = this.bout,
            use = false,
            cards = pl.card,
            be_use_card,
            card_select_info;

        /* 有装备就装备 */
        var equips = filter(cards, function(i) { return EQUIP_TYPE_MAPPING[i.name] != undefined; });
        if(equips.length) {
            equips.sort(function(a, b) {
                var at = EQUIP_TYPE_MAPPING[a.name], bt = EQUIP_TYPE_MAPPING[b.name],
                    av = at === 0 ? (sgs.EQUIP_RANGE_MAPPING[a.name] || 1) : 2,
                    bv = bt === 0 ? (sgs.EQUIP_RANGE_MAPPING[b.name] || 1) : 2;
                return bv - av;
            });
            var the_equip = equips[0], 
                equip_pos = EQUIP_TYPE_MAPPING[the_equip.name];
            if(!pl.equip[equip_pos] || equip_pos === 0 && (sgs.EQUIP_RANGE_MAPPING[the_equip.name] || 1) > (sgs.EQUIP_RANGE_MAPPING[pl.equip[equip_pos].name] || 1)) {
                bout.choice_card(new sgs.Operate("装备", pl, pl, the_equip));
                return ;
            }
        }
        /* 缺血有桃就桃 */
        var peachs = filter(cards, function(i) { return i.name == "桃"; });
        if(peachs.length && pl.blood < pl.maxBlood) {
            return bout.choice_card(new sgs.Operate("桃", pl, pl, peachs[0]));    
        }

        /* 非伤害性锦囊 */
        each(cards, function(n, i) {
            if(["无中生有", "桃园结义", "五谷丰登", "闪电", "酒"].indexOf(i.name) != -1) {
                be_use_card = i;
                return false;
            }
        });
        if(be_use_card) {
            return bout.choice_card(new sgs.Operate(be_use_card.name, pl, pl, be_use_card));
        }

        /* 使用锦囊 */
        var pls_rela = attack_deviation(bout, pl, this.lv),
            pls_max = max(pls_rela),
            pltar = bout.player[pls_rela.indexOf(pls_max)];
        
        be_use_card = magic_deviation(bout, pl, pltar); 
        if(be_use_card) {
            return bout.choice_card(new sgs.Operate(be_use_card.name, pl, pltar, be_use_card));
        }
        
        /* 使用杀 */
        be_use_card = filter(cards, function(i) { return i.name == "杀" || i.name == "火杀" || i.name == "雷杀"; });
        use = be_use_card.length > 0 && !plstatus["hassha"];
        if(use) {
            card_select_info = bout.select_card(new sgs.Operate("杀", pl, pltar, be_use_card[0]));
            if(card_select_info[0].indexOf(pltar) == -1) { /* 如果最佳对象不在可选区域,则改变次级对象 */
                pltar = undefined;
                each(card_select_info[0], function(n, i) {
                    if(pls_rela[bout.playernum[i.nickname]] >= 2) {
                        pltar = i;
                        return false;
                    }            
                });
            }
            if(pltar) {
                plstatus["hassha"] = pl.equip[0] && pl.equip[0].name == "诸葛连弩" || pl.skill("咆哮")
                                     ? false 
                                     : true; /* 诸葛连弩连杀 */
                be_use_card = be_use_card[0];
                return bout.choice_card(new sgs.Operate(be_use_card.name, pl, pltar, be_use_card));
            }
        }

        this.discard();
    } })(sgs.Ai.interpreter.attack_deviation, 
         sgs.Ai.interpreter.magic_deviation,
         sgs.EQUIP_TYPE_MAPPING, 
         sgs.CARD_MAGIC_RANGE_MAPPING);

    sgs.Ai.prototype.discard = function() {
        this.player.status["hassha"] = false;
        var bout = this.bout;
        /* 简单AI 啥也不做 */
        var ai = this;
        this.player.card.sort(function(a, b) { return ai.card_value(a) - ai.card_value(b); });
        opt = bout.discard(new sgs.Operate("弃牌", this.player));
        while(opt) { 
            console.log("需要弃牌", opt.data, "张");
            opt = bout.discard(new sgs.Operate("弃牌", 
                                         this.player,
                                         undefined, 
                                         choice(this.player.card, opt.data)));
        }
    }; 
})(window.sgs);
