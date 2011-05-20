var sgs = sgs || {};

(function(sgs){
    var each = sgs.func.each,
        exclude = sgs.func.exclude,
        filter = sgs.func.filter,
        copy = function(ary) { return Array.prototye.slice.apply(ary); };

    /* 操作解释器 */
    sgs.interpreter = function(bout, opt) {
        commend = sgs.commend_mapping[opt.id];
        if(commend == undefined) {
            throw new Error("5555, i'm not strong enough operate " + opt.id);
        }
        return commend(bout, opt);
    };
    sgs.interpreter.select = function(bout, opt){
        var pl = opt.source,
            card = opt.data["card"];
        switch(card.name) {
            /* 没闪 */
            case "杀":
                return bout.hero_range(pl);
            case "桃":
            case "无中生有":
            case "闪电":
                return [pl];
            case "决斗":
                return copy(bout.player);
            case "顺手牵羊":
                if(pl.hero.name == "黄月英") return copy(bout.player);
                return bout.hero_range(pl, pl.equip[3] ? 2 : 1); 
            case "借刀杀人":
                return filter(bout.player, function(i) { return !!i.equip[1]; });
            case "五谷丰登":
            case "桃源结义":
            case "南蛮入侵":
            case "万箭齐发":
            case "过河拆桥":
            case "无懈可击":
            case "乐不思蜀":
                return [];
        }
    };
    sgs.interpreter.use = function(bout, opt) {

    };
    sgs.commend_mapping = {
        "杀": function(bout, opt) {

        },
        "选择杀": function(bout, opt) {

        },
        "闪": function(bout, opt) {

        },
        "逃": function(bout, opt) {

        },
    };
})(window.sgs);
