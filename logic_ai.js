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
                case "桃":
                    if(opt.source == pl) { /* 自己 */
                        return bout.response_card(new sgs.Operate(cardname, pl, pl, pl.findcard(cardname)));
                    }
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
    sgs.Ai.prototype.usecard = (function(attack_deviation, EQUIP_TYPE_MAPPING){ return function() {
        var pl = this.player,
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

        var be_use_card = filter(cards, function(i) { return i.name == "杀"; }),
            pls_rela = attack_deviation(bout, pl),
            pls_max = max(pls_rela),
            pltar = bout.player[pls_rela.indexOf(pls_max)];

        use = be_use_card.length > 0 && !pltar.equip[2] && !this.hassha ? true : false;
        if(use) {
            this.hassha = pl.equip[0] && pl.equip[0].name == "诸葛连弩" ? false : true; /* 诸葛连弩连杀 */
            be_use_card = be_use_card[0];
            bout.choice_card(new sgs.Operate(be_use_card.name, pl, pltar, be_use_card));
        } else {
            this.discard();
        }

    } })(sgs.Ai.interpreter.attack_deviation, sgs.EQUIP_TYPE_MAPPING);

    sgs.Ai.prototype.discard = function() {
        this.hassha = false;
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
