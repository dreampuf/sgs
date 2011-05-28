var sgs = sgs || {};

(function(sgs){
    var _ = sgs.func.format,
        each = sgs.func.each,
        exclude = sgs.func.exclude,
        filter = sgs.func.filter,
        copy = function(ary) { return Array.prototype.slice.apply(ary); };

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
            card = opt.data,
            choiceable_pl = [],
            choiceable_num = 0;
        if(sgs.EQUIP_TYPE_MAPPING[card.name]) {
            choiceable_pl = [pl];
            choiceable_num = 1;
        } else {
            switch(card.name) {
                case "杀":
                    choiceable_pl = bout.hero_range(pl);
                    choiceable_num = 1;
                    break;
                case "桃":
                    choiceable_pl = [pl];
                    choiceable_num = 1;
                    break;
                case "无中生有":
                case "闪电":
                    choiceable_pl = [pl];
                    choiceable_num = 0;
                    break;
                case "顺手牵羊":
                    if(pl.hero.name == "黄月英") { 
                        choiceable_pl = copy(bout.player);
                        choiceable_num = 1;
                    } else {
                        choiceable_pl = bout.hero_range(pl, pl.equip[3] ? 2 : 1);
                        choiceable_num = 1;
                    } 
                    break;
                case "借刀杀人":
                    choiceable_pl = filter(bout.player, function(i) { return !!i.equip[1]; });
                    choiceable_num = 2;
                    break;
                case "决斗":
                case "过河拆桥":
                    choiceable_pl = copy(bout.player);
                    choiceable_num = 1;
                    break;
                case "五谷丰登":
                case "桃源结义":
                case "南蛮入侵":
                case "万箭齐发":
                /** case "无懈可击": **/
                case "乐不思蜀":
                    choiceable_pl = copy(bout.player);
                    choiceable_num = 0;
                    break;
            }
        }
        return [choiceable_pl, choiceable_num];
    };

    sgs.interpreter.response_card = function(bout, opt) {
        /* 用户相应南蛮,万箭,临死求桃等动作时出的卡牌 */
        var plsrc = opt.source,
            pltar = opt.target,
            card = opt.data,
            opt_top = bout.opt[0], /* 本次操作源 */
            choice_top = bout.choice[bout.choice.length-1]; /* 对应操作 */
        
        if(opt.id == "技能") {
            switch(choice_top.data) {
                case "洛神":
                    the_card = bout.card.shift();
                    pltar.card.push(the_card);
                    if(the_card.color < 2) {
                        pltar.status["zhenji.luoshen"] = -1;
                    }
                    bout.notify("skill", "洛神", pltar, the_card);
                    console.log(_("{0} 发动了技能洛神,获得{1}卡牌", pltar.nickname, the_card.name));
            }
            bout.choice.pop();
        } else {
            if(card) {
                switch(card.name) {
                    case "桃":
                        pltar.blood++;
                        
                        if(pltar.blood > 0) { /* 健康了 */
                            bout.choice = exclude(bout.choice, 
                                                  function(i) { return i.id == "桃" && i.target == pltar; });
                        }
                }
            } else { /* 无所作为 */
                bout.choice.pop();
            }
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
                        console.log(_("{0} 打出了闪", plsrc.nickname)); 
                    } else {
                        pltar = opt_top.target;
                        plsrc = opt_top.source;

                        pltar.blood--;
                        
                        if(pltar.blood < 1) {
                            var pltar_pos = bout.playernum[pltar.nickname], save_opt = [];
                            range(bout.playerlen, function(n) {  /* 临死求救 */
                                console.log("::::向", bout.player[(pltar_pos+n)%bout.playerlen].nickname, "求救中....");
                                save_opt.push(new sgs.Operate("桃", 
                                                                 plsrc,
                                                                 bout.player[(pltar_pos+n)%bout.playerlen]));
                            });
                            bout.choice = save_opt;
                        };
                        console.log(_("{0} 扣一滴血,还剩下{1}滴血", pltar.nickname, pltar.blood));
                    }
            }

            return bout.continue();
            
        } else { /* 主动用牌 */

            var equip_pos = sgs.EQUIP_TYPE_MAPPING[card.name];
            if(equip_pos != undefined) {
                console.log(_("{0} 装备了 {1}", pltar.nickname, card.name));
                pltar.equip[equip_pos] = card;
                bout.notify("equip_on", pltar, card, equip_pos); 

                bout.opt = [];
            } else {
                console.log(_("choice {0} 对 {1} 使用 {2}", plsrc.nickname, pltar.nickname, card.name));
                bout.notify("choice_card", plsrc, pltar, card);
                switch(card.name) {
                    case "杀":
                        bout.opt.push(opt);
                        pltar.choice_card(new sgs.Operate("闪", plsrc, pltar));
                        break;
                    case "桃":
                        pltar.blood++;
                        console.log(_("{0} 恢复一滴血,还剩下{1}滴血", pltar.nickname, pltar.blood));
                        break;
                        
                }
            }
        }
        bout.continue();
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
