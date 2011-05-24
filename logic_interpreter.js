var sgs = sgs || {};

(function(sgs){
    var _ = sgs.func.format,
        each = sgs.func.each,
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
            card = opt.data;
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

    sgs.interpreter.response_card = function(bout, opt) {
        /* 用户相应南蛮,万箭,临死求桃等动作时出的卡牌 */
        var plsrc = opt.source,
            pltar = opt.target,
            card = opt.data,
            opt_top = bout.opt[0], /* 本次操作源 */
            choice_top = bout.choice[bout.choice.length-1]; /* 对应操作 */
        
        if(card) {
            switch(card.name) {
                case "桃":
                    pltar.blood++;
                    
                    if(pltar.blood > 0) { /* 健康了 */
                        bout.choice = excloude(bout.choice, function(i) { return i.id == "桃" && i.target == pltar; });
                    }
            }
        } else { /* 无所作为 */
            bout.choice.pop();
        }
        
        bout.continue();
    };

    sgs.interpreter.choice_card = function(bout, opt) {
        var plsrc = opt.source,
            pltar = opt.target,
            card = opt.data,
            opt_top = bout.opt[0];
        
        console.log("操作堆栈:", bout.opt);//map(bout.opt, function(i) { return i.data.name; }));
        if(opt_top) { /* 被动用牌 */
            switch(opt_top.data.name) {
                case "杀":
                    bout.opt = [];
                    if(card && card.name == "闪") {
                        
                    } else {
                        plsrc.blood--;
                        
                        if(plsrc.blood < 1) {
                            var pltar_pos = bout.playernum[pltar.nickname], save_opt = [];
                            range(bout.playerlen, function(n) {  /* 临死求救 */
                                console.log("::::向", bout.player[(pltar_pos+n)%bout.playerlen].nickname, "求救中....");
                                save_opt.push(new sgs.Operate("桃", 
                                                                 plsrc,
                                                                 bout.player[(pltar_pos+n)%bout.playerlen]));
                            });
                            bout.choice = save_opt;
                        };
                        console.log(_("{0} 扣一滴血,还剩下{1}滴血", plsrc.nickname, plsrc.blood));
                    }
            }

            return bout.continue();
            
        } else { /* 主动用牌 */

            console.log(_("choice {0} 对 {1} 使用 {2}", plsrc.nickname, pltar.nickname, card.name));
            
            switch(card.name) {
                case "杀":
                    pltar.choice_card(new sgs.Operate("闪", plsrc, pltar));
            }

        }
    };

    sgs.interpreter.usecard = function(bout, opt) {
        var plsrc = opt.source,
            pltar = opt.target,
            card = opt.data;
        if(card) {
            console.log(_("{0} 对 {1} 使用 {2}", plsrc.nickname, pltar.nickname, card.name));
        } else {
            console.log(_("{0} 对 {1} 表示没有卡牌", plsrc.nickname, pltar.nickname));
            return bout.continue();
        }

        switch(card.name) {
            case "杀":
                /*if(bout.opt[0].data.name == " */
                pltar.choice_card(new sgs.Operate("闪", plsrc, pltar));
                break;
            case "闪":
                if(bout.opt[0].data.name == "杀") {
                    pltar.choice_card();
                } 
        }
    };
    sgs.interpreter.judge = function(bout) {
        var idens = bout.live_body_identity(),
            live_idens = filter(idens, function(i) { return i != -1; }),
            tmp;

        tmp = filter(live_idens, function(i) { return i == 2 || i == 3; });
        if(tmp.length == 0 && live_idens.indexOf(0) != -1) { /* 主公忠臣判定 */ 
            tmp = {"winner": filter(bout.player, function(i){ return i.identity == 0 || i.identity == 1; }),
                   "msg": "主公胜利" };
            return tmp;
        } 
        if(live_idens.length == 1 && live_idens[0] == 2) { /* 内奸判定 */
            tmp = {"winner": filter(bout.player, function(i){ return i.identity == 2 && i.blood > 0; }),
                   "msg": "内奸胜利" };
            return tmp; 
        }
        
        if(live_idens.indexOf(0) == -1) { /* 反贼胜利 */
            tmp = {"winner": filter(bout.player, function(i){ return i.identity == 3; }),
                   "msg": "反贼胜利" };
            return tmp;
        }
        return;
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
