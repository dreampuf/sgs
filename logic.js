var sgs = sgs || {};
sgs.PLAYER_NUM = 4;


(function(sgs){
    var srd = Math.random,
        slice = Array.prototype.slice,
        splice = Array.prototype.splice,
        copy = function(ary){ return slice.apply(ary); };
        
    sgs.func = sgs.func || {};
    sgs.func.rint = function(max) {
        max = max || 100;
        return srd() * max | 0;
    };
    sgs.func.shuffle = function(list) {
        var llen = list.length, 
            newlist = [],
            cur = 0,
            rint = sgs.func.rint;
        for(; cur < llen; cur++) {
            newlist.splice(rint(cur), 0, list[cur]);
        }
        return newlist;
    };
    sgs.func.choice = function(list, num) {
        var llen = list.length,
            choiced = []
            num = num || 1,
            tmp = -1,
            rint = sgs.func.rint;
        if(llen < num) {
            throw new Error("choice num can't more then list length");
        }
        if(num * 2 <= llen) {
            while(choiced.length < num) {
                tmp = rint(llen);
                if(choiced.indexOf(list[tmp]) == -1) {
                    choiced.push(list[tmp]);
                }
            }
        } else {
            choiced = choiced.concat(sgs.func.shuffle(list));
            choiced = choiced.splice(llen - num);
        }
        return choiced;
    };
    sgs.func.range = function(num, func) {
        if(func) {
            var i = 0;
            while(i < num) {
                if(func(i++) == false) {
                    return ;
                }
            }
        } else {
            var i = 0, slist = [];
            for(; i < num; i++) {
                slist.push(i);
            }
            return slist;
        };
    };
    sgs.func.each = function(list, func) {
        var llen = list.length,
            cur = 0;
        for(;cur < llen; cur++) {
            if(func(cur, list[cur], llen) == false)
                return;
        }
    };
    sgs.func.format = function(source) {
        var args = copy(arguments).splice(1);
        return source.replace(/\{(\d+)\}/gm, function(m, i) {
            return args[i]; 
        });
    };
    sgs.func.filter = function(list, func) {
        var result = []; 
        sgs.func.each(list, function(n, i) {
            if(func(i)) {
                result.push(i);
            }
        });
        return result;
    };
    sgs.func.exclude = function(list, func) {
        var result = [];
        sgs.func.each(list, function(n, i) {
            if(!func(i)) {
                result.push(i);
            }
        });
        return result;
    };
    var _ = sgs.func.format,
        each = sgs.func.each;

    /*
     * 玩家对象
     * */
    sgs.player = function(nickname, identity, hero, isAI) {
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
        this.card = [];

        this.blood = hero.life; /* 玩家当前生命值 */
        this.be_decision = []; /* 被施展的延迟技能 */
        this.equip = []; /* 装备, 0:武器, 1:防具, 2:+1马, 3:-1马 */
    };
    sgs.player.prototype.range = function() {
        var attack = 0, defend = 0, equip = this.equip;
        attack = equip[0] ? sgs.EQUIP_RANGE_MAPPING[equip[0].name] : 1;
        attack += equip[3] ? 1 : 0;
        defend += equip[2] ? 1 : 0;
        return [attack, defend];
    };
    
    /*
     * 英雄对象
     * */
    sgs.hero = function(name, life, skills, country) {
        /* 英雄 */
        /*
         * name : 英雄名称
         * life : 生命值,对应可用派数.
         * skill : 技能
         * country : 所属国.
         */
        this.name = name;
        this.life = life;
        this.skills = skills;
        this.country = country;        
    };

    /*
     * 卡牌对象
     * */
    sgs.card = function(name, color, digit) {
        /* 卡牌 */
        /*
         * name : 名称
         * color : 花色 (0 : 方块, 1 : 红桃, 2 : 梅花, 3 : 黑桃)
         * digit : 牌字 (A, 2, 3 ... 10, J, Q, K)
         * 操作 : 操作对象
         */
        this.name = name;
        this.color = color;
        this.digit = digit;
    };

    sgs.operate = function(id, source, target, data) {
        /*
         * 操作对象
         * id : 操作标示
         * source : 操作来源 (player)
         * target : 操作目标 (player)
         * data :  操作中的额外数据
         * */

        this.id = id;
        this.source = source;
        this.target = target;
        this.data = data || undefined;
    };

    var slist = [];
    sgs.func.each(sgs.HERO, function(n, i) {
        slist.push(new sgs.hero(i[0], i[1], i[2], i[3]));
    });
    sgs.HERO = slist;

    slist = [];
    sgs.func.each(sgs.CARD, function(n, i) {
        slist.push(new sgs.card(i["name"], i["color"], i["digit"]));
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
        glass = [sgs.player, sgs.hero, sgs.operate, sgs.card], glen = glass.length;
    while(glen-- > 0) {
        glass[glen].prototype.toString = toString;
    }

    /*
     * 回合操作对象
     * 主要负责和界面交互,以及提供AI计算环境
     * */
    sgs.bout = function(player) {
        /* 回合 */
        if(player.length > sgs.PLAYER_NUM) {
            throw new Error("can't more than " + sgs.PLAYER_NUM + " players.");
        }

        var _bufflog = [], 
            king = sgs.func.filter(player, function(i) { return i.identity == 0; })[0],
            ccard = sgs.func.shuffle(sgs.CARD);
        
        _bufflog.push("游戏开始:");
        _bufflog.push("所有玩家身份已分配.");
        _bufflog.push(_("主公{0}({1})出牌.", king.hero.name, king.nickname));

        this._bufflog = _bufflog; /* 当前操作日志 */
        this._log = []; /* 操作日志 */
        this.start_time = new Date(); /* 局开始时间 */
        this.player = player;/* 玩家 */
        this.curplayer = 0;/* 当前执行玩家 */
        this.card = ccard; /* 已经洗过的卡 */
        this.opt = []; /* 操作堆栈 */

        /* 开局初始化 */
        sgs.func.range(player.length, function(i) {
            /* 初始化发牌 */
            sgs.func.range(4, function(ii) {
                player[i].card.push(ccard.shift());
            });
        });
    };
    sgs.bout.get_identity = function(player_num) {
        return sgs.func.shuffle(sgs.IDENTITY_MAPPING[player_num]);
    };
    sgs.bout.get_hero = function(player_num, heros) {
        heros = heros || sgs.HERO;
        return sgs.func.choice(heros, player_num); 
    };

    sgs.bout.prototype.get_buff_log = function() {
        var result = this._bufflog.slice(0);
        this._log = this._log.concat(this._bufflog);
        this._bufflog = []; 
        return result;
    };
    sgs.bout.prototype.ishero = function(hero) {
        var pls = this.player, i = pls.length;
        while(i-- > 0) {
            if(pls[i].hero.name == hero.name) {
                return pls[i];
            }
        }
        return undefined;
    };
    sgs.bout.prototype.hero_range = function(pl, plrange) {
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
            pos = Math.abs(n - plpos) + (i.equip[2] ? 1 : 0);
            if(plrange >= pos && result.indexOf(i) == -1) {
                result.push(i);
            }
        });
        });
        return result;
    };
    
    sgs.bout.prototype.decision = function(opt) {
        /* 判定 */
        var pl = opt.target;
        if(pl.be_decision.length > 0) {

        }
        
        return;
    };
    sgs.bout.prototype.getcard = function(opt) {
        /* 摸牌 */
        var pl = opt.target,
            num = 2;

        /** 张辽-奇袭 **/
        /** end-奇袭 **/
        
        var cards = this.card.splice(0, 2); 
        pl.card = pl.card.concat(cards);
        return new sgs.operate("获得牌", undefined, pl, {"card": cards});
    };
    sgs.bout.prototype.selectcard = function(opt) {
        /* 选牌 */
        var pl = opt.source,
            card = opt.data["card"];

        return sgs.interpreter.select(this, opt);
    };
    sgs.bout.prototype.usecard = function(opt) {
        /* 用牌 */
    };
    sgs.bout.prototype.discard = function(opt) {
        /* 弃牌 */
    };
    

    

})(window.sgs);
