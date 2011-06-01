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
        this.lv = lv || bout.ailv;

        this.hassha = false; /* 当前玩家是否已出杀 */
    };
    sgs.Ai.interpreter = function(bout, opt) {

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
    };
    sgs.Ai.identity_rela = { /* 身份之间敌对关系 (1 ~ 3) */
        0 : { 0 : 0,
              1 : 1,
              2 : 2,
              3 : 3 },
        1 : { 0 : 1,
              1 : 0,
              2 : 3,
              3 : 3 },
        2 : { 0 : 2,
              1 : 3,
              2 : 0,
              3 : 3 },
        3 : { 0 : 3,
              1 : 3,
              2 : 3,
              3 : 0 },
    };
    sgs.Ai.interpreter.attack_deviation = (function(rela_map){ return function(bout, plsrc) {
        /* 目前仅仅依据身份评判进攻对象 */
        var plsrc_iden = plsrc.identity,
            pls_rel = map(bout.player, function(i){ return rela_map[plsrc_iden][i.identity]; });

        return pls_rel; 
    } })(sgs.Ai.identity_rela);
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
            cardname = opt.data;
        
        if(opt.id == "技能") {
            switch(cardname) {
                case "洛神":
                    return bout.response_card(new sgs.Operate("技能", pl, pl, true));
            }
        } else {
            switch(cardname) {
                case "无懈可击":
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
            cards = pl.card;

        /* 有装备就装备 */
        var equips = filter(cards, function(i) { return EQUIP_TYPE_MAPPING[i.name] != undefined; });
        if(equips.length) {
            var the_equip = equips[0], 
                equip_pos = EQUIP_TYPE_MAPPING[the_equip.name];
            
            bout.choice_card(new sgs.Operate("装备", pl, pl, the_equip));
            return ;
        }
        /* 缺血有桃就桃 */
        var peachs = filter(cards, function(i) { return i.name == "桃"; });
        if(peachs.length && pl.blood < pl.hero.life) {
            bout.choice_card(new sgs.Operate("桃", pl, pl, peachs[0]));    
            return ;
        }

        /* 使用锦囊 */
        var be_use_card;
            pls_rela = attack_deviation(bout, pl),
            pls_max = max(pls_rela),
            pltar = bout.player[pls_rela.indexOf(pls_max)];
        
        be_use_card = magic_deviation(bout, pl, pltar); 
        if(be_use_card) {
            return bout.choice_card(new sgs.Operate(be_use_card.name, pl, pltar, be_use_card));
        }
        
        /* 使用杀 */
        var be_use_card = filter(cards, function(i) { return i.name == "杀"; });

        use = be_use_card.length > 0 && !pltar.equip[2] && !plstatus["hassha"] ? true : false;
        if(use) {
            plstatus["hassha"] = pl.equip[0] && pl.equip[0].name == "诸葛连弩" || pl.skill("咆哮")
                                 ? false 
                                 : true; /* 诸葛连弩连杀 */
            be_use_card = be_use_card[0];
            return bout.choice_card(new sgs.Operate(be_use_card.name, pl, pltar, be_use_card));
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
        opt = bout.discard(new sgs.Operate("弃牌", this.player));
        while(opt) { 
            console.log("需要弃牌", opt.data["num"], "张");
            opt = bout.discard(new sgs.Operate("弃牌", 
                                         this.player,
                                         undefined, 
                                         {"card": choice(this.player.card, opt.data["num"]) }));
        }
    }; 
})(window.sgs);
