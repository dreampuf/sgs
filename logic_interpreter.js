var sgs = sgs || {};

(function(sgs){
    var each = sgs.func.each,
        exclude = sgs.func.exclude,
        copy = function(ary) { return Array.prototye.slice.apply(ary); };

    /* 操作解释器 */
    sgs.interpreter = function(bout, opt) {
        commend = sgs.commend_mapping[opt.id];
        if(commend == undefined) {
            throw new Error("5555, i'm not strong enough operate " + opt.id);
        }
        return commend(bout, opt);
    };
    
    sgs.interpreter.select_mapping = {
        "杀": function(bout, opt) {
            var pl = opt.source,
                range = pl.range(),
                targets = bout.player,
                selected = [],
                curpl = targets.indexOf(pl);
            if(range[0] >= targets.length) {
                return copy(targets);
            }

            var start = curpl - range[0],
                end = curpl + range[0];
        },
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
