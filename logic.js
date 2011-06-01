var sgs = sgs || {};

(function(sgs){
    var slice = Array.prototype.slice,
        splice = Array.prototype.splice,
        copy = function(ary){ return slice.apply(ary); },
        _ = sgs.func.format,
        filter = sgs.func.filter,
        exclude = sgs.func.exclude, 
        shuffle = sgs.func.shuffle,
        range = sgs.func.range,
        choice = sgs.func.choice,
        each = sgs.func.each,
        map = sgs.func.map,
        and = sgs.func.and,
        or = sgs.func.or,
        sub = sgs.func.sub;

    /*
     * 玩家对象
     * */
    sgs.Player = function(nickname, identity, hero, isAI) {
        /* 玩家 */ 
        /*
         * nickname : 昵称
         * identity : 身份
         * hero : 英雄
         * isAI : 是否为AI控制
         */
        this.nickname = nickname;
        this.identity = identity;
        this.hero = hero;
        this.isAI = isAI || false;
        this.AI = undefined; 
        this.card = [];

        this.blood = hero.life; /* 玩家当前生命值 */
        this.be_decision = []; /* 被施展的延迟技能 */
        this.equip = []; /* 装备, 0:武器, 1:防具, 2:+1马, 3:-1马 */
        this.status = {}; /* 临时状态 */
    };
    sgs.Player.prototype.range = function() {
        var attack = 0, defend = 0, equip = this.equip;
        attack = equip[0] ? sgs.EQUIP_RANGE_MAPPING[equip[0].name] : 1;
        attack += equip[3] ? 1 : 0;
        defend += equip[2] ? 1 : 0;
        return [attack, defend];
    };
    sgs.Player.prototype.skill = function(skill_name) {
        return this.hero.skills.indexOf(skill_name) != -1;
    };
    sgs.Player.prototype.hascard = function(name) {
        var has = false;
        each(this.card, function(n, i){
            if(i.name == name) {
                has = true;
                return false;
            }
        });
        return has;
    };
    sgs.Player.prototype.findcard = function(name) {
        var result = undefined;
        each(this.card, function(n, i){
            if(i.name == name) {
                result = i;
                return false;
            }
        });
        return result;
    };
    sgs.Player.prototype.rmcard = function(card) {
        var cards = this.card,
            target_pos = cards.indexOf(card);
        if(target_pos != -1) {
            cards.splice(target_pos, 1);
            return true;
        }
        return false;
    };
    sgs.Player.prototype.choice_card = function(opt) {
        if(!this.isAI) throw new Error("sorry ! I'm computer.");
        
        this.AI.choice_card(opt);
    };
    sgs.Player.prototype.ask_card = function(opt) {
        if(!this.isAI) throw new Error("sorry ! I'm computer.");
        
        this.AI.ask_card(opt);
    };
    sgs.Player.prototype.usecard = function(opt) {
        if(!this.isAI) throw new Error("sorry ! I'm computer.");

        this.AI.usecard(opt);
    };
    sgs.Player.prototype.discard = function(opt) {
        if(!this.isAI) throw new Error("sorry ! I'm computer.");

        this.AI.discard(opt);
    };
    
    /*
     * 英雄对象
     * */
    sgs.Hero = function(name, life, skills, country, gender) {
        /* 英雄 */
        /*
         * name : 英雄名称
         * life : 生命值,对应可用派数.
         * skill : 技能
         * country : 所属国.
         * gender : 性别.
         */
        this.name = name;
        this.life = life;
        this.skills = skills;
        this.country = country;        
        this.gender = gender;
    };

    /*
     * 卡牌对象
     * */
    sgs.Card = function(name, color, digit) {
        /* 卡牌 */
        /*
         * name : 名称
         * color : 花色 (0 : 方块, 1 : 红桃, 2 : 梅花, 3 : 黑桃)
         * digit : 牌字 (A, 2, 3 ... 10, J, Q, K)
         * enable : 是否可用
         */
        this.name = name;
        this.color = color;
        this.digit = digit;
        this.enable = true;
    };

    sgs.Operate = function(id, source, target, data) {
        /*
         * 操作对象
         * id : 操作标示
         * source : 操作来源 (player)
         * target : 操作目标 (player)
         * data :  操作中的额外数据
         * */

        this.id = id;
        this.source = source;
        this.target = target || undefined;
        this.data = data || undefined;
    };

    sgs.HERO = map(sgs.HERO, function(i){ return new sgs.Hero(i[0], i[1], i[2], i[3], i[4]); });
    sgs.CARD = map(sgs.CARD, function(i){ return new sgs.Card(i["name"], i["color"], i["digit"]); });

    var toString = function() {
        var tmp = "{",
            i;
        for(i in this) {
            if(this.hasOwnProperty(i)) {
                tmp += _("{0}: {1}, ", i, this[i]);
            }
        }
        return tmp + "}";
    },
        glass = [sgs.Player, sgs.Hero, sgs.Operate, sgs.Card];
    each(glass, function(n, i) {
        i.prototype.toString = toString;
    });

    /*
     * 回合操作对象
     * 主要负责和界面交互,以及提供AI计算环境
     * */
    sgs.Bout = function(player, ailv) {
        /* 回合 */
        if(player.length > sgs.PLAYER_NUM) {
            throw new Error("can't more than " + sgs.PLAYER_NUM + " players.");
        }

        var _bufflog = [], 
            king = filter(player, function(i) { return i.identity == 0; })[0],
            king_num = -1,
            ccard = shuffle(sgs.CARD),
            playernum = {};

        each(player, function(n, i) { if(i == king) { king_num = n; return false; } });
        player = slice.call(player, king_num).concat(slice.call(player, 0, king_num));
        if(player.length >= 4) { /* 超过四位玩家,主公血量+1 */
            player[0].blood++;
            player[0].hero.life++;
        }
        
        each(player, function(n, i) { 
            playernum[i.nickname] = n;
         });
        
        _bufflog.push("游戏开始:");
        _bufflog.push("所有玩家身份已分配.");
        _bufflog.push(_("主公{0}({1})出牌.", king.hero.name, king.nickname));

        this._bufflog = _bufflog; /* 当前操作日志 */
        this._log = []; /* 操作日志 */
        this.start_time = new Date(); /* 局开始时间 */
        this.ailv = ailv || sgs.DEFAULT_AI_LV;
        this.player = player;/* 玩家 */
        this.playerlen = player.length;
        this.playernum = playernum; /* 玩家对应 */
        this.curplayer = 0;/* 当前执行玩家 */
        this.card = ccard; /* 已经洗过的卡 */
        this.opt = []; /* 操作堆栈 */
        this.choice = []; /* 要牌队列 */
        this.step = 0; /* 当前执行状态 0: 判定阶段, 1: 摸牌阶段, 2: 出牌阶段, 3: 弃牌阶段 */
        this.attached = []; /* 绑定的事件 */
        
        this.timer = 0;

        /* 开局初始化 */
        range(player.length, function(i) {
            /* 初始化发牌 */
            range(4, function(ii) {
                player[i].card.push(ccard.shift());
            });
        });
        /* 转入主公控制 */
        setTimeout((function(obj){ return function(){
            each(obj.player, function(n, i) {
                if(i.isAI) {
                    i.AI = new sgs.Ai(obj, i);  
                }
            });
            obj.continue();
        } })(this), 16);
    };
    sgs.Bout.get_identity = function(player_num) {
        return shuffle(sgs.IDENTITY_MAPPING[player_num]);
    };
    sgs.Bout.get_hero = function(player_num, heros) {
        heros = heros || sgs.HERO;
        return choice(heros, player_num); 
    };
    sgs.Bout.get_king_hero = function(other_num, heros) {
        other_num = other_num || 2;
        heros = heros || sgs.HERO;
        alway_king = filter(sgs.HERO, function(i) { return i.name == "曹操" || 
                                                           i.name == "刘备" ||
                                                           i.name == "孙权"; });
        heros = exclude(choice(heros, other_num + 3),  function(i) { return i.name == "曹操" || 
                                                                            i.name == "刘备" ||
                                                                            i.name == "孙权"; });
        return alway_king.concat(heros.slice(0, 2));
    };

    sgs.Bout.prototype.get_buff_log = function() {
        var result = this._bufflog.slice(0);
        this._log = this._log.concat(this._bufflog);
        this._bufflog = []; 
        return result;
    };
    sgs.Bout.prototype.attach = function(even_type, func) {
        this.attached.push({"name":even_type, "func":func});
    };
    sgs.Bout.prototype.notify = function(event_type) {
        var args = slice.call(arguments, 1);
        each(this.attached, function(n, i) {
            if(i["name"] == event_type)
                i["func"].apply({}, args);
        });
    };
    sgs.Bout.prototype.ishero = function(hero) {
        var pls = this.player, i = pls.length;
        while(i-- > 0) {
            if(pls[i].hero.name == hero.name) {
                return pls[i];
            }
        }
        return undefined;
    };
    sgs.Bout.prototype.hero_range = function(pl, plrange) {
        /* 获得英雄所能攻击得到的范围 */
        var result = [], 
            pos = 0,
            pls = this.player,
            plpos = this.playernum[pl.nickname], 
            plrange = plrange || pl.range()[0],
            selist = slice.call(pls, plpos+1).concat(slice.call(pls, 0, plpos)),
            arlist = copy(selist).reverse();

        each([selist, arlist], function(bn, bi) {
        each(bi, function(n, i) {
            pos = (n + 1) + (i.equip[2] ? 1 : 0); /* 有+1马还需要加1 */
            if(plrange >= pos && result.indexOf(i) == -1) {
                result.push(i);
            }
        });
        });
        return result;
    };
    sgs.Bout.prototype.next_player = function(pl) {
        var pls = this.player;
        return pls[(pls.indexOf(pl) + 1) % this.playerlen];
    };
    sgs.Bout.prototype.prev_player = function(pl) {
        var pls = this.player,
            plpos = pls.indexOf(pl) - 1;
        plpos = plpos < 0 ? (this.playerlen-1) : plpos;
        return pls[plpos];
    };
    sgs.Bout.prototype.live_body_identity = function(){
        return map(this.player, function(i){ return i.blood > 0 ? i.identity : -1 ; });
    };
    sgs.Bout.prototype.judge = (function(judge){ return function() {
        var result = judge(this); 
        if(result) { /* GAME OVER */
            console.log(result["winner"][0].nickname, result["msg"]);
            return false;
        }
        return true;
    } })(sgs.interpreter.judge);
    sgs.Bout.prototype.continue = (function(DELAY, response_card){ return function() { 
        setTimeout((function(bout){ return function() {
            if(bout.choice.length > 0) {
                var opt = bout.choice[bout.choice.length-1],
                    pltar = opt.target;

                pltar.ask_card(opt); 
            } else {
                if(bout.judge()) {
                    switch(bout.step) {
                        case 0:
                            return bout.decision();
                        case 1:
                            return bout.getcard();
                        case 2:
                            return bout.usecard();
                        case 3:
                            return bout.player[bout.curplayer].discard();
                    }
                }
            }
        } })(this), DELAY); } })(sgs.DELAY, sgs.interpreter.response_card);
    
    sgs.Bout.prototype.decision = (function(decision){ return function(opt) {
        /* 判定 */
        var pl = this.player[this.curplayer];

        /** 甄姬-洛神 **/
        if(pl.hero.name == "甄姬" && (pl.status["zhenji.luoshen"] | 0) != -1) {
            pl.status["zhenji.luoshen"] = (pl.status["zhenji.luoshen"] | 0) + 1;
            this.choice.push(new sgs.Operate("技能", pl, pl, "洛神"));
            return this.continue();
        }
        /** end-洛神 **/

        if(pl.be_decision.length > 0) {
            return decision(this, pl, pl.be_decision.pop()); 
        }

        this.step = 1;
        this.continue();
    } })(sgs.interpreter.decision);
    sgs.Bout.prototype.getcard = function(opt) {
        /* 摸牌 */
        var pl = this.player[this.curplayer],
            num = 2;

        /** 张辽-奇袭 **/
        /** end-奇袭 **/
        
        if(this.card.length < 5) { this.card = this.card.concat(shuffle(sgs.CARD)); }
        
        var cards = this.card.splice(0, num); 
        //cards[0].name = "无懈可击";
        //cards[1].name = "乐不思蜀";

        console.log(pl.nickname, "摸牌", map(cards, function(i) {return i.name; }));
        pl.card = pl.card.concat(cards);
        console.log(pl.nickname, "手牌:", map(pl.card, function(i) {return i.name; }));
        this.notify("get_card", pl, cards);
        
        if(pl.status["lebusishu"]) {
            console.log("中乐了.休息一下");
            this.step = 3;
        } else {
            this.step = 2;
        }
        this.continue();
    };
    sgs.Bout.prototype.select_card = (function(select){ return function(opt) {
        /* 选牌 */
        var pl = opt.source,
            card = opt.data;

        return select(this, opt);
    } })(sgs.interpreter.select);

    sgs.Bout.prototype.choice_card = (function(choice_card, response_card, EQUIP_TYPE_MAPPING){ return function(opt) {
        var pl = opt.source,
            card = opt.data;

        if(card) { /* 移除所用卡牌 */
            if(!pl.rmcard(card)) {
                throw new Error("有没有搞错!明明都用过这牌了!你以为电脑是好欺负的?");
                return ;
            }
        }
        choice_card(this, opt);

    } })(sgs.interpreter.choice_card, 
         sgs.interpreter.response_card,
         sgs.EQUIP_TYPE_MAPPING ); 

    sgs.Bout.prototype.response_card = (function(response_card, Card){ return function(opt) {
        var pl = opt.source,
            card = opt.data;
        
        if(card && (card instanceof Card)) { /* 移除所用卡牌 */
            if(!pl.rmcard(card)) {
                throw new Error("有没有搞错!明明都用过这牌了!你以为电脑是好欺负的?");
                return ;
            }
        }

        response_card(this, opt);

    } })(sgs.interpreter.response_card, sgs.Card);

    sgs.Bout.prototype.usecard = (function(){ return function() {

        var pl = this.player[this.curplayer];
        pl.choice_card();

    } })();

    sgs.Bout.prototype.discard = function(opt) {
        /* 弃牌 */
        var pl = this.player[this.curplayer],
            cards,
            isdis = false;
        
        console.log(pl.nickname, "弃牌了");
        if(pl.blood < pl.card.length){
            cards = opt && opt.data && opt.data["card"];
            if(!cards) {
                return new sgs.Operate("弃牌", undefined, pl, {"num": pl.card.length - pl.blood});
            } else {
                pl.card = sub(pl.card, cards); 
            }
            console.log(pl.nickname, "弃牌", map(cards, function(i) { return i.name; }));
        }

        pl.status = {};
        
        setTimeout((function(bout){ return function(){
            bout.curplayer++;

            if(bout.curplayer >= bout.playerlen) { 
                bout.timer++; 
                if (bout.timer > 30) {
                    console.log("GAME OVER"); 
                    return ;
                }
            }

            bout.curplayer %= bout.playerlen;
            bout.step = 0;
            bout.continue();
        } })(this), 50);
    };

})(window.sgs);
