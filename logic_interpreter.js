var sgs = sgs || {};

(function(sgs){
    var _ = sgs.func.format,
        each = sgs.func.each,
        exclude = sgs.func.exclude,
        filter = sgs.func.filter,
        range = sgs.func.range,
        any = sgs.func.any,
        copy = function(ary) { return Array.prototype.slice.apply(ary); },
        remove_one_card = function(pl) {
            var card = pl.card.shift();
            return card;
        },
        living_players = function(bout) {
            return filter(bout.player, function(player) { return player.blood > 0; });
        },
        other_living_players = function(bout, source) {
            return filter(living_players(bout), function(player) { return player != source; });
        },
        has_any_card = function(player) {
            return player.card.length > 0 ||
                   any(player.equip, function(card) { return !!card; }) ||
                   player.be_decision.length > 0;
        },
        discard_card = function(bout, card) {
            if(!card) {
                return;
            }
            bout.discardPile = bout.discardPile || [];
            if(bout.discardPile.indexOf(card) == -1) {
                bout.discardPile.push(card);
            }
        },
        remove_player_card = function(player) {
            var card = player.card.shift(),
                i;
            if(card) {
                return card;
            }
            for(i = 0; i < player.equip.length; i++) {
                if(player.equip[i]) {
                    card = player.equip[i];
                    player.equip[i] = undefined;
                    return card;
                }
            }
            if(player.be_decision.length) {
                return player.be_decision.shift().data;
            }
        },
        ordered_living_players = function(bout, source) {
            var players = living_players(bout),
                position = players.indexOf(source);
            if(position < 0) {
                return players;
            }
            return players.slice(position).concat(players.slice(0, position));
        },
        finish_response_effect = function(bout, opt_top) {
            var has_pending = any(bout.choice, function(choice) {
                return choice.source == opt_top.source &&
                       (choice.id == "杀" || choice.id == "闪");
            });
            if(!has_pending) {
                var position = bout.opt.indexOf(opt_top);
                if(position != -1) {
                    bout.opt.splice(position, 1);
                }
            }
        },
        remove_from_stack = function(bout, opt) {
            var position = bout.opt.indexOf(opt);
            if(position == -1 && opt) {
                position = -1;
                each(bout.opt, function(n, pending) {
                    if(pending.data == opt.data) {
                        position = n;
                        return false;
                    }
                });
            }
            if(position != -1) {
                bout.opt.splice(position, 1);
            }
        },
        draw_cards = function(bout, player, count) {
            if(bout.card.length < count && bout.discardPile && bout.discardPile.length) {
                bout.card = bout.card.concat(bout.discardPile);
                bout.discardPile = [];
            }
            var cards = bout.card.splice(0, count);
            player.card = player.card.concat(cards);
            if(cards.length) {
                bout.notify("get_card", player, cards);
            }
            return cards;
        },
        kill_player = function(bout, player, killer) {
            if(player.status["dead"]) {
                return;
            }
            player.status["dead"] = true;
            each(player.card.splice(0), function(n, card) { discard_card(bout, card); });
            each(player.equip, function(n, card) {
                if(card) {
                    discard_card(bout, card);
                    player.equip[n] = undefined;
                }
            });
            each(player.be_decision.splice(0), function(n, pending) {
                discard_card(bout, pending.data);
            });
            bout.notify("death", player, killer);
            if(killer && killer != player && killer.blood > 0) {
                if(player.identity == 3) {
                    draw_cards(bout, killer, 3);
                } else if(killer.identity == 0 && player.identity == 1) {
                    each(killer.card.splice(0), function(n, card) { discard_card(bout, card); });
                    each(killer.equip, function(n, card) {
                        if(card) {
                            discard_card(bout, card);
                            killer.equip[n] = undefined;
                        }
                    });
                }
            }
        },
        apply_damage = function(bout, plsrc, pltar, card, point) {
            point = point || 1;
            if(plsrc && plsrc.status && plsrc.status["jiu_damage"] && (card.name == "杀" || card.name == "火杀" || card.name == "雷杀")) {
                point++;
                plsrc.status["jiu_damage"] = false;
                bout.notify("status_change", plsrc, "jiu_damage", false, card);
            }
            pltar.blood -= point;
            bout.notify("apply_card", plsrc, pltar, card);
            if(pltar.blood < 1) {
                sgs.interpreter.ask_peach(bout, pltar, plsrc);
            }
            console.log(_("{0} 受到 {1} 点伤害,还剩下{2}滴血", pltar.nickname, point, pltar.blood));
        },
        apply_to_targets = function(target, func) {
            var targets = Array.isArray(target) ? target : [target];
            each(targets, function(n, i) { if(i) { func(i); } });
        };

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
            choiceable_num = -1,
            minimum_num;
        if(!card || !pl || pl.blood <= 0) {
            return [choiceable_pl, choiceable_num];
        }
        if(sgs.EQUIP_TYPE_MAPPING[card.name] != undefined) {
            choiceable_pl = [pl];
            choiceable_num = 1;
        } else {
            switch(card.name) {
                case "杀":
                case "火杀":
                case "雷杀":
                    if(pl.status["used_slash"] &&
                       !(pl.equip[0] && pl.equip[0].name == "诸葛连弩") &&
                       !pl.skill("咆哮")) {
                        break;
                    }
                    choiceable_pl = bout.hero_range(pl);
                    choiceable_num = choiceable_pl.length ? 1 : -1;
                    break;
                case "闪":
                case "无懈可击":
                    break;
                case "桃":
                    if(pl.blood >= pl.maxBlood) {
                        break;
                    }
                    choiceable_pl = [pl];
                    choiceable_num = 1;
                    break;
                case "酒":
                    if(pl.status["used_jiu"]) {
                        break;
                    }
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
                        choiceable_pl = other_living_players(bout, pl);
                    } else {
                        choiceable_pl = bout.hero_range(pl, pl.equip[3] ? 2 : 1);
                    }
                    choiceable_pl = filter(choiceable_pl, has_any_card);
                    choiceable_num = choiceable_pl.length ? 1 : -1;
                    break;
                case "借刀杀人":
                    var weapon_holders = filter(other_living_players(bout, pl), function(i) {
                        return !!i.equip[0];
                    });
                    if(weapon_holders.length) {
                        choiceable_pl = other_living_players(bout, pl);
                        choiceable_num = 2;
                    }
                    break;
                case "决斗":
                    choiceable_pl = other_living_players(bout, pl);
                    choiceable_num = choiceable_pl.length ? 1 : -1;
                    break;
                case "火攻":
                    choiceable_pl = filter(other_living_players(bout, pl), function(i) {
                        return i.card.length > 0;
                    });
                    choiceable_num = choiceable_pl.length ? 1 : -1;
                    break;
                case "过河拆桥":
                    choiceable_pl = filter(other_living_players(bout, pl), has_any_card);
                    choiceable_num = choiceable_pl.length ? 1 : -1;
                    break;
                case "兵粮寸断":
                case "乐不思蜀":
                    choiceable_pl = filter(other_living_players(bout, pl), function(i) {
                        return !any(i.be_decision, function(ii){ return ii.id == card.name; });
                    });
                    if(card.name == "兵粮寸断" && pl.hero.name != "徐晃") {
                        choiceable_pl = filter(choiceable_pl, function(i) {
                            return bout.hero_range(pl, pl.equip[3] ? 2 : 1).indexOf(i) != -1;
                        });
                    }
                    choiceable_num = choiceable_pl.length ? 1 : -1;
                    break;
                case "五谷丰登":
                case "桃园结义":
                case "南蛮入侵":
                case "万箭齐发":
                    choiceable_pl = living_players(bout);
                    choiceable_num = 0;
                    break;
                case "铁索连环":
                    choiceable_pl = other_living_players(bout, pl);
                    choiceable_num = Math.min(2, choiceable_pl.length);
                    minimum_num = choiceable_pl.length ? 1 : -1;
                    if(!choiceable_pl.length) {
                        choiceable_num = -1;
                    }
                    break;
            }
        }
        return [choiceable_pl, choiceable_num, minimum_num == undefined ? choiceable_num : minimum_num];
    };

    sgs.interpreter.ask_wuxie = function(bout, pltar) {
        /*
         * 为锦囊询问无懈可击
         * bout: sgs.Bout
         * pltar_pos: 目标对象所在Bout.player位置
         * */
        var request_target = Array.isArray(pltar) ? pltar[0] : pltar,
            pls = bout.player,
            plslen = bout.playerlen,
            pltar_pos = request_target ? bout.playernum[request_target.nickname] : 0,
            pl_has_the_card,
            has_wuxie,
            may_wuxie = false;
        range(plslen, function(n) {
            pl_has_the_card = pls[(pltar_pos + n) % plslen];
            has_wuxie = pl_has_the_card.findcard("无懈可击");
            if(has_wuxie) {
                may_wuxie = true;
                console.log(_("{0} 向 {1} 求无懈", request_target.nickname, pl_has_the_card.nickname));
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
            var responder = bout.player[(pltar_pos+n)%bout.playerlen];
            if(responder.blood <= 0 && responder != plsrc) {
                return;
            }
            console.log(":向", responder.nickname, "求救中.");
            var save_request = new sgs.Operate("桃", plsrc, responder, "桃");
            save_request.damage_source = pltar;
            save_opt.push(save_request);
        });
        bout.choice = save_opt;
        if(!save_opt.length) {
            kill_player(bout, plsrc, pltar);
        }
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
                console.log("乐不思蜀判定--", judge_card.color);
                if(judge_card.color != 1) { 
                    bout.notify("apply_card", plsrc, pltar, card);
                    pltar.status["lebusishu"] = true;
                    bout.notify("status_change", pltar, "lebusishu", true, card);
                }
                discard_card(bout, judge_card);
                discard_card(bout, card);
                remove_from_stack(bout, opt);
                break;
            case "无中生有": 
                bout.notify("apply_card", plsrc, pltar, card);
                var cards = bout.card.splice(0, 2);
                bout.notify("get_card", pltar, cards);
                console.log(pltar.nickname, "获得", cards);
                pltar.card = pltar.card.concat(cards);
                break;
            case "兵粮寸断":
                if(judge_card.color != 2) {
                    bout.notify("apply_card", plsrc, pltar, card);
                    pltar.status["bingliang"] = true;
                    bout.notify("status_change", pltar, "bingliang", true, card);
                }
                discard_card(bout, judge_card);
                discard_card(bout, card);
                remove_from_stack(bout, opt);
                break;
            case "顺手牵羊":
                var snatched = remove_player_card(pltar);
                if(snatched) { plsrc.card.push(snatched); }
                bout.notify("apply_card", plsrc, pltar, card);
                break;
            case "过河拆桥":
                discard_card(bout, remove_player_card(pltar));
                bout.notify("apply_card", plsrc, pltar, card);
                break;
            case "五谷丰登":
                var grace_players = ordered_living_players(bout, plsrc),
                    grace_cards = bout.card.splice(0, grace_players.length);
                each(grace_players, function(n, player) {
                    var grace_card = grace_cards.shift();
                    if(grace_card) {
                        player.card.push(grace_card);
                        bout.notify("get_card", player, [grace_card]);
                    }
                });
                each(grace_cards, function(n, grace_card) {
                    discard_card(bout, grace_card);
                });
                bout.notify("apply_card", plsrc, grace_players, card);
                break;
            case "决斗":
                if(bout.opt.indexOf(opt) == -1) {
                    bout.opt.push(opt);
                }
                bout.choice.push(new sgs.Operate("杀", plsrc, pltar, "杀"));
                break;
            case "借刀杀人":
                var collateral_targets = Array.isArray(pltar) ? pltar : [],
                    weapon_holder = collateral_targets[0],
                    collateral_target = collateral_targets[1];
                if(!weapon_holder || !collateral_target || weapon_holder == collateral_target ||
                   !weapon_holder.equip[0]) {
                    throw new Error("借刀杀人需要依次选择一名有武器的角色和其可攻击的目标");
                }
                if(bout.opt.indexOf(opt) == -1) {
                    bout.opt.push(opt);
                }
                bout.choice.push(new sgs.Operate("杀", plsrc, weapon_holder, "杀"));
                break;
            case "火攻":
                if(pltar.card.length > 0) {
                    var revealed = pltar.card[0],
                        matching = filter(plsrc.card, function(source_card) {
                            return source_card.color == revealed.color;
                        })[0];
                    bout.notify("show_card", pltar, revealed);
                    if(matching) {
                        plsrc.rmcard(matching);
                        discard_card(bout, matching);
                        apply_damage(bout, plsrc, pltar, card, 1);
                    }
                }
                break;
            case "铁索连环":
                apply_to_targets(pltar || plsrc, function(target) {
                    target.status["chained"] = !target.status["chained"];
                    bout.notify("status_change", target, "chained", target.status["chained"], card);
                });
                bout.notify("apply_card", plsrc, pltar || plsrc, card);
                break;
            case "桃园结义":
                apply_to_targets(bout.player, function(target) {
                    if(target.blood > 0 && target.blood < target.maxBlood) { target.blood++; }
                });
                bout.notify("apply_card", plsrc, bout.player, card);
                break;
            case "南蛮入侵":
            case "万箭齐发":
                if(bout.opt.indexOf(opt) == -1) {
                    bout.opt.push(opt);
                }
                var response_name = card.name == "南蛮入侵" ? "杀" : "闪";
                each(other_living_players(bout, plsrc).reverse(), function(n, target) {
                    bout.choice.push(new sgs.Operate(response_name, plsrc, target, response_name));
                });
                if(!bout.choice.length) {
                    finish_response_effect(bout, opt);
                }
                break;
            case "闪电":
                //var judge_card = bout.card.shift();
                console.log("闪电判定--", judge_card.color);
                if(judge_card.color == 3 && judge_card.digit >= 2 && judge_card.digit <= 9) { 
                    pltar.blood -= 3;
                    bout.notify("apply_card", plsrc, pltar, card);
                    console.log(_("天要下雨,娘要嫁人.你这福分,有幸三生.坑爹阿,遭雷劈啦!"));
                    
                    if(pltar.blood < 1) {
                        ask_peach(bout, pltar, plsrc);  
                    }
                    discard_card(bout, card);
                } else {
                    var next_target = bout.next_player ? bout.next_player(pltar) : undefined,
                        inspected = 0;
                    while(next_target && next_target.blood <= 0 && inspected < bout.playerlen) {
                        next_target = bout.next_player(next_target);
                        inspected++;
                    }
                    if(next_target && next_target != pltar) {
                        opt.target = next_target;
                        opt.has_init = true;
                        next_target.be_decision.push(opt);
                        bout.notify("delayed_on", next_target, card, pltar);
                    } else {
                        discard_card(bout, card);
                    }
                }
                discard_card(bout, judge_card);
                remove_from_stack(bout, opt);
                break;
        }
        }
    } })(sgs.interpreter.ask_peach);

    sgs.interpreter.response_card = (function(action_execute, ask_peach, ask_judge, apply_damage){ return function(bout, opt) {
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
                                              function(i) { return i.id == "桃" && i.source == pltar; });
                        pltar.status["dead"] = false;
                    }
                    //可能还需要桃
                    //bout.choice.pop();
                    break;
                case "杀":
                    if(choice_bot && choice_bot.id == "杀") {
                        bout.choice.pop();
                        if(opt_top && opt_top.data && opt_top.data.name == "决斗") {
                            var duel_opponent = choice_bot.source,
                                duel_responder = choice_bot.target;
                            bout.choice.push(new sgs.Operate("杀", duel_responder, duel_opponent, "杀"));
                        } else if(opt_top && opt_top.data && opt_top.data.name == "借刀杀人") {
                            var collateral_targets = Array.isArray(opt_top.target) ? opt_top.target : [],
                                forced_attacker = collateral_targets[0],
                                forced_target = collateral_targets[1];
                            if(bout.opt.indexOf(opt_top) != -1) {
                                bout.opt.splice(bout.opt.indexOf(opt_top), 1);
                            }
                            bout.opt.push(new sgs.Operate(card.name, forced_attacker, forced_target, card));
                            bout.choice.push(new sgs.Operate("闪", forced_attacker, forced_target, "闪"));
                            bout.notify("choice_card", forced_attacker, forced_target, card);
                        } else {
                            finish_response_effect(bout, opt_top);
                        }
                    }
                    break;
                case "闪":
                    console.log(_("{0} 打出了闪", plsrc.nickname)); 
                    bout.choice.pop();
                    if(opt_top && opt_top.data &&
                       (opt_top.data.name == "杀" || opt_top.data.name == "火杀" || opt_top.data.name == "雷杀")) {
                        if(bout.opt.indexOf(opt_top) != -1) {
                            bout.opt.splice(bout.opt.indexOf(opt_top), 1);
                        }
                    } else {
                        finish_response_effect(bout, opt_top);
                    }
                    break;
                case "无懈可击":
                    console.log(_("{0} 使用了无懈可击!", plsrc.nickname));
                    /* 当前规则没有实现“无懈响应无懈”的嵌套栈。一张无懈结算后，
                     * 原锦囊已经取消，其他玩家收到的同批询问也必须全部失效。 */
                    bout.choice = exclude(bout.choice, function(i) {
                        return i.id == "无懈可击";
                    });
                    if(bout.opt.length) {
                        var cancelled = bout.opt.pop();
                        bout.notify("nullified", plsrc,
                            cancelled ? cancelled.target : undefined,
                            cancelled ? cancelled.data : undefined,
                            card);
                        if(cancelled && cancelled.data &&
                           (cancelled.data.name == "乐不思蜀" ||
                            cancelled.data.name == "兵粮寸断" ||
                            cancelled.data.name == "闪电")) {
                            bout.notify("delayed_off", cancelled.target, cancelled.data, "nullified");
                            discard_card(bout, cancelled.data);
                        }
                    }
                    break;
            }
        } else { /* 无所作为 */
            if(choice_bot) {
                switch(choice_bot.id) {
                    case "桃":
                        console.log(choice_bot.target.nickname, "表示无桃");
                        if(last_choice) {
                            bout.choice.pop();
                            if(choice_bot.source.blood <= 0) {
                                kill_player(bout, choice_bot.source, choice_bot.damage_source);
                            }
                            return bout.continue();
                        }
                        break;
                    case "无懈可击":
                        console.log(choice_bot.target.nickname, "表示没有无懈");
                        bout.choice.pop();
                        if(last_choice) { /* 如果是最后一次请求无懈可击.则进行原来卡牌的判定 */
                            action_execute(bout, opt_top, bout.last_judge_card);
                        }
                        return bout.continue();
                    case "杀":
                        bout.choice.pop();
                        if(opt_top && opt_top.data && opt_top.data.name == "决斗") {
                            apply_damage(bout, choice_bot.source, choice_bot.target, opt_top.data, 1);
                            finish_response_effect(bout, opt_top);
                        } else if(opt_top && opt_top.data && opt_top.data.name == "借刀杀人") {
                            var collateral_targets = Array.isArray(opt_top.target) ? opt_top.target : [],
                                weapon_holder = collateral_targets[0],
                                collateral_source = opt_top.source,
                                weapon = weapon_holder && weapon_holder.equip[0];
                            if(weapon) {
                                weapon_holder.equip[0] = undefined;
                                collateral_source.card.push(weapon);
                                bout.notify("get_card", collateral_source, [weapon]);
                            }
                            finish_response_effect(bout, opt_top);
                        } else if(opt_top && opt_top.data && opt_top.data.name == "南蛮入侵") {
                            apply_damage(bout, opt_top.source, choice_bot.target, opt_top.data, 1);
                            finish_response_effect(bout, opt_top);
                        }
                        return bout.continue();
                    case "闪":
                        bout.choice.pop();
                        if(opt_top.data.name == "杀" || opt_top.data.name == "火杀" || opt_top.data.name == "雷杀") {
                            if(bout.opt.indexOf(opt_top) != -1) {
                                bout.opt.splice(bout.opt.indexOf(opt_top), 1);
                            }
                            pltar = opt_top.target;
                            plsrc = opt_top.source;
                            apply_damage(bout, plsrc, pltar, opt_top.data, 1);
                        } else if(opt_top.data.name == "万箭齐发") {
                            apply_damage(bout, opt_top.source, choice_bot.target, opt_top.data, 1);
                            finish_response_effect(bout, opt_top);
                        }
                        return bout.continue();
                }
                bout.choice.pop();
            }
        }
        }/* if(opt.id == "技能") else end */
        
        bout.continue();
    } })(sgs.interpreter.action_execute,
         sgs.interpreter.ask_peach,
         sgs.interpreter.ask_judge,
         apply_damage);

    sgs.interpreter.choice_card = (function(action_execute, ask_wuxie){ return function(bout, opt) {
        var plsrc = opt.source,
            pltar = opt.target,
            card = opt.data;
        
        var equip_pos = sgs.EQUIP_TYPE_MAPPING[card.name];
        if(equip_pos != undefined) {
            console.log(_("{0} 装备了 {1}", pltar.nickname, card.name));
            var replaced = pltar.equip[equip_pos];
            if(replaced) {
                if(replaced.name == "白银狮子" && pltar.blood > 0 && pltar.blood < pltar.maxBlood) {
                    pltar.blood++;
                }
                discard_card(bout, replaced);
                bout.notify("equip_off", pltar, replaced, equip_pos);
            }
            pltar.equip[equip_pos] = card;
            bout.notify("equip_on", pltar, card, equip_pos); 
        } else {
            console.log(_("choice {0} 对 {1} 使用 {2}", plsrc.nickname, pltar.nickname, card.name));
            bout.notify("choice_card", plsrc, pltar, card);
            var has_wuxie,
                may_wuxie = false;
            switch(card.name) {
                case "杀":
                case "火杀":
                case "雷杀":
                    plsrc.status["used_slash"] = true;
                    bout.opt.push(opt);
                    bout.choice.push(new sgs.Operate("闪", plsrc, pltar, "闪"));
                    break;
                case "桃":
                    if(pltar.blood < pltar.maxBlood) {
                        pltar.blood++;
                        bout.notify("apply_card", plsrc, pltar, card);
                        console.log(_("{0} 恢复一滴血,还剩下{1}滴血", pltar.nickname, pltar.blood));
                    }
                    break;
                case "酒":
                    plsrc.status["jiu_damage"] = true;
                    plsrc.status["used_jiu"] = true;
                    bout.notify("status_change", plsrc, "jiu_damage", true, card);
                    bout.notify("apply_card", plsrc, plsrc, card);
                    break;
                case "顺手牵羊":
                case "过河拆桥":
                case "五谷丰登":
                case "决斗":
                case "借刀杀人":
                case "火攻":
                case "铁索连环":
                case "桃园结义":
                case "南蛮入侵":
                case "万箭齐发":
                    may_wuxie = ask_wuxie(bout, pltar || plsrc);
                    if(!may_wuxie) {
                        action_execute(bout, opt);
                    } else {
                        bout.opt.push(opt);
                    }
                    break;
                case "兵粮寸断":
                case "乐不思蜀":
                    pltar.be_decision.push(opt);
                    bout.notify("delayed_on", pltar, card);
                    break;
                case "闪电":
                    opt.has_init = true;
                    pltar.be_decision.push(opt);
                    bout.notify("delayed_on", pltar, card);
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

        bout.notify("delayed_off", pltar, card, "resolve");
        
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
            case "兵粮寸断":
                bout.opt.push(new sgs.Operate("兵粮寸断", plsrc, pltar, card));
                may_wuxie = ask_wuxie(bout, pltar);
                if(!may_wuxie){
                    judge_card = bout.card.shift();
                    bout.last_judge_card = judge_card;
                    console.log(card.name, "判定,花色:", judge_card.color, "数字:", judge_card.digit);
                    if(!ask_judge(bout, pltar, judge_card)) {
                        action_execute(bout, opt, judge_card);
                    }
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
                        if(!ask_judge(bout, pltar, judge_card)) {
                            action_execute(bout, opt, judge_card);
                        }
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

         
})(window.sgs);
