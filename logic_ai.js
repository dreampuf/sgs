var sgs = sgs || {};

(function(sgs){
    sgs.ai = function(player, bout, lv) {
        /* AI 解析对象
         * player: 扮演玩家对象
         * bout: 当前局
         * lv: AI难度 0, 1, 2; 简单,普通,困难
         * */
        this.player = player;
        this.bout = bout;
        this.lv = lv || 0;
    };
    sgs.ai.interpreter = function(bout, opt) {

    };
})(window.sgs);
