var sgs = sgs || {};

(function(sgs){
    var slice = Array.prototype.slice,
        splice = Array.prototype.splice,
        copy = function(ary){ return slice.apply(ary); },
        _ = sgs.func.format,
        filter = sgs.func.filter,
        excloude = sgs.func.excloude, 
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
    };
    sgs.Player.prototype.range = function() {
        var attack = 0, defend = 0, equip = this.equip;
        attack = equip[0] ? sgs.EQUIP_RANGE_MAPPING[equip[0].name] : 1;
        attack += equip[3] ? 1 : 0;
        defend += equip[2] ? 1 : 0;
        return [attack, defend];
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
    sgs.Player.prototype.rmcard = function(card) {
        var cards = this.card,
            target_pos = cards.indexOf(card);
        if(target_pos != -1) {
            cards.splice(target_pos, 1);
            return true;
        }
        return false;
    };
    sgs.Player.prototype.turn = function(bout) {
        if(!this.isAI) throw new Error("sorry ! I'm computer.");
        
        this.AI.turn(bout);
    };
    sgs.Player.prototype.choice_card = function(opt) {
        if(!this.isAI) throw new Error("sorry ! I'm computer.");
        
        this.AI.usecard(opt);
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

    var slist = [];
    each(sgs.HERO, function(n, i) {
        slist.push(new sgs.Hero(i[0], i[1], i[2], i[3], i[4]));
    });
    sgs.HERO = slist;

    slist = [];
    each(sgs.CARD, function(n, i) {
        slist.push(new sgs.Card(i["name"], i["color"], i["digit"]));
    });
    sgs.CARD = slist;

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
        glass = [sgs.Player, sgs.Hero, sgs.Operate, sgs.Card], glen = glass.length;
    while(glen-- > 0) {
        glass[glen].prototype.toString = toString;
    }

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
        
        each(player, function(n, i) { 
            playernum[i] = n;
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
            obj.player[obj.curplayer].turn(obj);
        } })(this), 100);
    };
    sgs.Bout.get_identity = function(player_num) {
        return shuffle(sgs.IDENTITY_MAPPING[player_num]);
    };
    sgs.Bout.get_hero = function(player_num, heros) {
        heros = heros || sgs.HERO;
        return choice(heros, player_num); 
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
            plpos = pls.indexOf(pl), 
            plrange = plrange || pl.range()[0],
            selist = slice.call(pls, plpos+1).slice.call(pls, 0, plpos),
            arlist = copy(selist).reverse();

        each([selist, arlist], function(bn, bi) {
        each(bi, function(n, i) {
            pos = Math.abs(n - plpos) + (i.equip[2] ? 1 : 0); /* 有+1马还需要加1 */
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
    
    sgs.Bout.prototype.decision = function(opt) {
        /* 判定 */
        var pl = opt.source;
        if(pl.be_decision.length > 0) {

        }
        return;
    };
    sgs.Bout.prototype.getcard = function(opt) {
        /* 摸牌 */
        var pl = opt.source,
            num = 2;

        /** 张辽-奇袭 **/
        /** end-奇袭 **/
        
        if(this.card.length < 5) { this.card = this.card.concat(shuffle(sgs.CARD)); }
        
        var cards = this.card.splice(0, 2); 
        pl.card = pl.card.concat(cards);
        return cards;
    };
    sgs.Bout.prototype.selectcard = (function(select){ return function(opt) {
        /* 选牌 */
        var pl = opt.source,
            card = opt.data["card"];

        return select(this, opt);
    } })(sgs.interpreter.select);

    sgs.Bout.prototype.usecard = (function(usecard){ return function(opt) {
        /* 用牌 */
        if(opt.id == "扣血") {
            opt = this.opt.shift();
            if(this.opt.length > 0) {
                this.opt = [];
            }
            opt.source.choice_card();
        } else {
            var pl = opt.source,
                card = opt.data;

            pl.rmcard(card);
            this.opt.push(opt);
            usecard(this, opt);
        }

    } })(sgs.interpreter.usecard);

    sgs.Bout.prototype.discard = function(opt) {
        /* 弃牌 */
        var pl = opt.source,
            cards,
            isdis = false;
        
        if(pl.blood < pl.card.length){
            cards = opt.data && opt.data["card"];
            if(!cards) {
                return new sgs.Operate("弃牌", undefined, pl, {"num": pl.card.length - pl.blood});
            } else {
                console.log(_("{0} 弃了牌", pl.nickname));
                pl.card = sub(pl.card, cards); 
            }

            console.log(cards[0].name, cards[1].name);
        }
        
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
            
            bout.player[bout.curplayer].turn(bout);
        } })(this), 50);
        return ;
    };

})(window.sgs);
