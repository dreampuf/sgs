var sgs = sgs || {};

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
    sgs.Ai.prototype.turn = function(bout) {
        var opt = new sgs.Operate("判定", this.player);
        while(opt = bout.decision(opt)) {
            /* 对付延迟锦囊 */
        }
        
        /* 摸牌 */
        opt = bout.getcard(new Operate("摸牌", this.player));

        while(opt = bout.decision(opt)) {

        }

        /* 用牌策略 */
        var use = false,
            use_id = -1;
        if(use) {
            this.usecard();
        } else {
            this.discard();
        }
    };
    sgs.Ai.prototype.usecard = function(opt) {

    };
    sgs.Ai.prototype.discard = function() {
        /* 简单AI 啥也不做 */
        while(opt = bout.discard(new sgs.Operate("弃牌", this.player))) {
            bout.discard(new sgs.Operate("弃牌", 
                                         this.player,
                                         undefined, 
                                         {"card": this.player.card.splice(0, 2) }));
        }
    }; 
    sgs.Ai.interpreter = function(bout, opt) {

    };
})(window.sgs);
