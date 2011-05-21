var sgs = sgs || {};

var _ = sgs.func.format,
    filter = sgs.func.filter,
    excloude = sgs.func.excloude, 
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

    sgs.Ai.prototype.turn = function() {
        var bout = this.bout,
            pl = this.player,
            opt = new sgs.Operate("判定", this.player);

        while(opt = bout.decision(opt)) {
            /* 对付延迟锦囊 */
        }
        
        /* 摸牌 */
        cards = bout.getcard(new sgs.Operate("摸牌", this.player));
        pl.card = pl.card.concat(cards);

        this.usecard();
    };
    sgs.Ai.prototype.usecard = (function(attack_deviation){ return function() {
        /* 用牌策略 */
        var pl = this.player,
            bout = this.bout,
            use = false,
            cards = pl.card,
            use_id = -1;
        
        var sha = filter(cards, function(i) { return i.name == "杀"; }),
            pls_rela = attack_deviation(bout, pl),
            pls_max = max(pls_rela),
            pltar = bout.player[pls_rela.indexOf(pls_max)];

        use = sha.length > 0 && !pltar.equip[2] ? true : false;

        if(use) {
            bout.usecard(new sgs.Operate("用牌", pl, pltar, sha[0]));
        } else {
            this.discard();
        }

    } })(sgs.Ai.interpreter.attack_deviation);

    sgs.Ai.prototype.discard = function() {
        var bout = this.bout;
        /* 简单AI 啥也不做 */
        console.log(this.player.nickname, "弃牌了");
        while(opt = bout.discard(new sgs.Operate("弃牌", this.player))) {
            bout.discard(new sgs.Operate("弃牌", 
                                         this.player,
                                         undefined, 
                                         {"card": this.player.card.slice(0, 2) }));
        }
    }; 
})(window.sgs);
