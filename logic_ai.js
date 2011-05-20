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
