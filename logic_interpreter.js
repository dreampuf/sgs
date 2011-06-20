var sgs = sgs || {};

(function(sgs){
    var _ = sgs.func.format,
        each = sgs.func.each,
        exclude = sgs.func.exclude,
        filter = sgs.func.filter,
        any = sgs.func.any,
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
        if(sgs.EQUIP_TYPE_MAPPING[card.name] != undefined) {
            choiceable_pl = [pl];
            choiceable_num = 1;
        } else {
            switch(card.name) {
                case "杀":
                    choiceable_pl = bout.hero_range(pl);
                    choiceable_num = 1;
                    break;
                case "闪":
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
                case "乐不思蜀":
                    choiceable_pl = filter(bout.player, 
                                           function(i){ return !any(i.be_decision, 
                                                                    function(ii){ return ii.id == "乐不思蜀" ; }); });
                    choiceable_num = 1;
                    break;
                case "五谷丰登":
                case "桃源结义":
                case "南蛮入侵":
                case "万箭齐发":
                case "无懈可击":
                    choiceable_pl = copy(bout.player);
                    choiceable_num = 0;
                    break;
            }
        }
        return [choiceable_pl, choiceable_num];
    };

    sgs.interpreter.ask_wuxie = function(bout, pltar) {
        /*
         * 为锦囊询问无懈可击
         * bout: sgs.Bout
         * pltar_pos: 目标对象所在Bout.player位置
         * */
        var pls = bout.player,
            plslen = bout.playerlen,
            pltar_pos = bout.playernum[pltar.nickname],
            pl_has_the_card,
            has_wuxie,
            may_wuxie = false;
        range(plslen, function(n) {
            pl_has_the_card = pls[(pltar_pos + n) % plslen];
            has_wuxie = pl_has_the_card.findcard("无懈可击");
            if(has_wuxie) {
                may_wuxie = true;
                console.log(_("{0} 向 {1} 求无懈", pltar.nickname, pl_has_the_card.nickname));
                bout.choice.push(new sgs.Operate("无懈可击", pltar, pl_has_the_card, "无懈可击")); 
            }
        });
        return may_wuxie;
    };

    sgs.interpreter.ask_peach = function(bout, plsrc, pltar) {
        /*
         * 向其他对象求桃
         * bout: sgs.Bout
         * plsrc: 临死对象
         * pltar: 造成伤害对象
         * */
        var pltar_pos = bout.playernum[pltar.nickname], 
            save_opt = [];
        range(bout.playerlen, function(n) {  /* 临死求救 */
            console.log(":向", bout.player[(pltar_pos+n)%bout.playerlen].nickname, "求救中.");
            save_opt.push(new sgs.Operate("桃", 
                                             plsrc,
                                             bout.player[(pltar_pos+n)%bout.playerlen]));
        });
        bout.choice = save_opt;
    };

    sgs.interpreter.ask_judge = function(bout, plsrc, card) {
        var plsrc_pos = bout.playernum[plsrc.nickname],
            that_pl,
            result = false;
        range(bout.playerlen, function(n) { /* 判定时改判 */    
            that_pl = bout.player[(plsrc_pos+n)%bout.playerlen];
            if(that_pl.skill("鬼才")) {
                console.log(":向", that_pl.nickname, "求改判.");
                result = true;
                bout.choice.push(new sgs.Operate("技能", that_pl, plsrc, "鬼才"));
                return false;
            }
        });
        return result;
    };

    sgs.interpreter.action_execute = (function(ask_peach){ return function(bout, opt, judge_card) {
        var plsrc = opt.source,
            pltar = opt.target,
            card = opt.data;

        if(opt.id == "技能") {
        switch(card) {
            case "洛神":
                bout.notify("skill", "洛神", pltar, judge_card, judge_card.color < 2);
                if(judge_card.color < 2) {
                    pltar.status["zhenji.luoshen"] = -1;
                } else {
                    pltar.card.push(judge_card);
                    console.log(_("{0} 发动了技能洛神,获得 {1}", pltar.nickname, judge_card.name));
                }
                break;
        }
        } else {
        switch(card.name) {
            case "乐不思蜀":
                //var judge_card = bout.card.shift(); 
                bout.notify("judge_card", pltar, judge_card);
                console.log("乐不思蜀判定--", judge_card.color);
                if(judge_card.color != 1) { 
                    bout.notify("apply_card", plsrc, pltar, card);
                    pltar.status["lebusishu"] = true;
                }
                break;
            case "无中生有": 
                bout.notify("apply_card", plsrc, pltar, card);
                var cards = bout.card.splice(0, 2);
                bout.notify("get_card", pltar, cards);
                console.log(pltar.nickname, "获得", cards);
                pltar.card = pltar.card.concat(cards);
                break;
            case "闪电":
                //var judge_card = bout.card.shift();
                bout.notify("judge_card", pltar, judge_card);
                console.log("闪电判定--", judge_card.color);
                if(judge_card.color == 3 && judge_card.digit >= 2 && judge_card.digit <= 9) { 
                    bout.notify("apply_card", plsrc, pltar, card);
                    
                    pltar.blood -= 3;
                    console.log(_("天要下雨,娘要嫁人.你这福分,有幸三生.坑爹阿,遭雷劈啦!"));
                    
                    if(pltar.blood < 1) {
                        ask_peach(bout, pltar, plsrc);  
                    }
                }
                break;
        }
        }
    } })(sgs.interpreter.ask_peach);

    sgs.interpreter.response_card = (function(action_execute, ask_peach, ask_judge){ return function(bout, opt) {
        /* 用户相应南蛮,万箭,临死求桃等动作时出的卡牌 */
        var plsrc = opt.source,
            pltar = opt.target,
            card = opt.data,
            opt_top = bout.opt[0], /* 本次操作源 */
            choice_bot = bout.choice[bout.choice.length-1], /* 对应操作 */
            last_choice = bout.choice.length <= 1;
        
        if(opt.id == "技能") {
        
        switch(choice_bot.data) {
            case "洛神":
                if(card) { 
                    var judge_card = bout.card.shift();
                    bout.notify("skill", "洛神", pltar, judge_card, judge_card.color < 2);
                    if(!ask_judge(bout, pltar, judge_card)) {
                        action_execute(bout, opt, judge_card);
                    }
                } else { /* 不发动洛神 */
                    pltar.status["zhenji.luoshen"] = -1;
                }
                break;
            case "鬼才":
                //TODO
                if(card) {
                } else {
                    //action_execute(
                }
                break;
        }
        bout.choice.pop();

        } else { /* if(opt.id == "技能") else */

        if(card) { /* 有卡应对 */
            switch(card.name) {
                case "桃":
                    pltar.blood++;
                    
                    if(pltar.blood > 0) { /* 健康了 */
                        bout.choice = exclude(bout.choice, 
                                              function(i) { return i.id == "桃" && i.target == pltar; });
                    }
                    //可能还需要桃
                    //bout.choice.pop();
                    break;
                case "闪":
                    bout.opt = [];
                    console.log(_("{0} 打出了闪", plsrc.nickname)); 
                    bout.choice.pop();
                    break;
                case "无懈可击":
                    console.log(_("{0} 使用了无懈可击!", plsrc.nickname));
                    bout.choice = exclude(bout.choice, function(i) { return i.id == "无懈可击" && 
                                                                             i.source == plsrc; });
                    bout.opt.pop();
                    break;
            }
        } else { /* 无所作为 */
            if(choice_bot) {
                switch(choice_bot.id) {
                    case "桃":
                        console.log(choice_bot.target.nickname, "表示无桃");
                        break;
                    case "无懈可击":
                        console.log(choice_bot.target.nickname, "表示没有无懈");
                        if(last_choice) { /* 如果是最后一次请求无懈可击.则进行原来卡牌的判定 */
                            action_execute(bout, opt_top, bout.last_judge_card);
                        }
                        break;
                    case "闪":
                        if(opt_top.data.name == "杀") {
                            bout.opt = [];
                            pltar = opt_top.target;
                            plsrc = opt_top.source;

                            pltar.blood--;
                            bout.notify("apply_card", plsrc, pltar, opt_top.data);
                            
                            if(pltar.blood < 1) {
                                ask_peach(bout, pltar, plsrc);
                            };
                            console.log(_("{0} 扣一滴血,还剩下{1}滴血", pltar.nickname, pltar.blood));
                        }
                }
                bout.choice.pop();
            }
        }
        }/* if(opt.id == "技能") else end */
        
        bout.continue();
    } })(sgs.interpreter.action_execute,
         sgs.interpreter.ask_peach,
         sgs.interpreter.ask_judge);

    sgs.interpreter.choice_card = (function(action_execute, ask_wuxie){ return function(bout, opt) {
        var plsrc = opt.source,
            pltar = opt.target,
            card = opt.data;
        
        var equip_pos = sgs.EQUIP_TYPE_MAPPING[card.name];
        if(equip_pos != undefined) {
            console.log(_("{0} 装备了 {1}", pltar.nickname, card.name));
            pltar.equip[equip_pos] = card;
            bout.notify("equip_on", pltar, card, equip_pos); 
        } else {
            console.log(_("choice {0} 对 {1} 使用 {2}", plsrc.nickname, pltar.nickname, card.name));
            bout.notify("choice_card", plsrc, pltar, card);
            var has_wuxie,
                may_wuxie = false;
            switch(card.name) {
                case "杀":
                    bout.opt.push(opt);
                    bout.choice.push(new sgs.Operate("闪", plsrc, pltar, "闪"));
                    break;
                case "桃":
                    if(pltar.blood < pltar.hero.life) {
                        pltar.blood++;
                        bout.notify("apply_card", plsrc, pltar, card);
                        console.log(_("{0} 恢复一滴血,还剩下{1}滴血", pltar.nickname, pltar.blood));
                    }
                    break;
                case "乐不思蜀":
                    pltar.be_decision.push(opt);
                    break;
                case "闪电":
                    opt.has_init = false;
                    pltar.be_decision.push(opt);
                    break;
                case "无中生有":
                    may_wuxie = ask_wuxie(bout, pltar);
                    if(!may_wuxie) {
                        action_execute(bout, opt);
                    } else {
                        bout.opt.push(opt);   
                    }
                    break;
            }
        }
        bout.continue();
    } })(sgs.interpreter.action_execute,
         sgs.interpreter.ask_wuxie);

    sgs.interpreter.decision = (function(action_execute, ask_wuxie, ask_judge){ return function(bout, pltar, opt) {
        var plsrc = opt.source,
            card = opt.data,
            may_wuxie = false,
            judge_card;
        
        switch(card.name) {
            case "乐不思蜀":
                bout.opt.push(new sgs.Operate("乐不思蜀", plsrc, pltar, card));
                may_wuxie = ask_wuxie(bout, pltar); 
                
                if(!may_wuxie){
                    judge_card = bout.card.shift();
                    bout.notify("judge_card", pltar, judge_card);
                    console.log(card.name, "判定,花色:", judge_card.color, "数字:", judge_card.digit);
                    
                    if(!ask_judge(bout, pltar, judge_card)) { /* 是否改判 */
                        action_execute(bout, opt, judge_card); 
                    }
                    bout.last_choice = judge_card;
                }
                break;
            case "闪电":
                if(!opt.has_init) { /* 闪电尚未初始化 */
                    opt.has_init = true;
                    pltar.be_decision.push(opt);
                } else { /* 闪电已经初始化 */
                    bout.opt.push(new sgs.Operate("闪电", plsrc, pltar, card));
                    may_wuxie = ask_wuxie(bout, pltar);
                    
                    if(!may_wuxie) {
                        judge_card = bout.card.shift();
                        bout.last_judge_card = judge_card;
                        bout.notify("judge_card", pltar, judge_card);
                        console.log(card.name, "判定", judge_card.digit);
                        //TODO
                    } 
                }
                break;
        }
        return bout.continue();
    } })(sgs.interpreter.action_execute,
         sgs.interpreter.ask_wuxie,
         sgs.interpreter.ask_judge);

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

    sgs.interpreter.commend_map = {
        "杀": function(target){},
    };
         
})(window.sgs);
