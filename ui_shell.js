var sgs = sgs || {};

(function(sgs) {
    var nextPlayerId = 1,
        nextCardId = 1;

    var playerElementByModel = new WeakMap(),
        playerByElement = new WeakMap(),
        cardElementByModel = new WeakMap(),
        cardByElement = new WeakMap();

    var element = function(value) {
        return value && value.jquery ? value[0] : value;
    };

    sgs.view = {
        bindPlayer: function(player, dom) {
            dom = element(dom);
            if(!player || !dom) return;
            playerElementByModel.set(player, dom);
            playerByElement.set(dom, player);
        },
        playerElement: function(player) {
            return player ? playerElementByModel.get(player) : undefined;
        },
        playerFor: function(dom) {
            return playerByElement.get(element(dom));
        },
        bindCard: function(card, dom) {
            dom = element(dom);
            if(!card || !dom) return;
            cardElementByModel.set(card, dom);
            cardByElement.set(dom, card);
        },
        cardElement: function(card) {
            return card ? cardElementByModel.get(card) : undefined;
        },
        cardFor: function(dom) {
            return cardByElement.get(element(dom));
        },
        unbindCard: function(card, dom) {
            dom = element(dom) || cardElementByModel.get(card);
            if(card) cardElementByModel.delete(card);
            if(dom) cardByElement.delete(dom);
        }
    };

    sgs.Player = function(nickname, identity, hero, isAI, id) {
        this.id = id || 'player-' + nextPlayerId++;
        this.nickname = nickname;
        this.identity = identity;
        this.hero = hero;
        this.isAI = !!isAI;
        this.card = [];
        this.equip = [];
        this.be_decision = [];
        this.status = {};
        this.maxBlood = hero.life;
        this.blood = hero.life;
    };

    sgs.Hero = function(name, life, skills, country, gender) {
        this.name = name;
        this.definitionId = 'standard:hero:' + name;
        this.life = life;
        this.skills = skills;
        this.country = country;
        this.gender = gender;
    };

    sgs.Card = function(name, color, digit) {
        this.name = name;
        this.definitionId = 'standard:card:' + name;
        this.instanceId = 'ui-card-' + nextCardId++;
        this.color = color;
        this.digit = digit;
        this.enable = true;
    };

    sgs.Operate = function(id, source, target, data) {
        this.id = id;
        this.source = source;
        this.target = target;
        this.data = data;
    };

    sgs.HERO = sgs.func.map(sgs.HERO, function(i) {
        return new sgs.Hero(i[0], i[1], i[2], i[3], i[4]);
    });
    sgs.CARD = sgs.func.map(sgs.CARD, function(i) {
        return new sgs.Card(i.name, i.color, i.digit);
    });

    sgs.Bout = {};
    sgs.Bout.get_identity = function(playerNum) {
        return sgs.func.shuffle(sgs.IDENTITY_MAPPING[playerNum]);
    };
    sgs.Bout.get_hero = function(playerNum, heroes) {
        return sgs.func.choice(heroes || sgs.HERO, playerNum);
    };
    sgs.Bout.get_king_hero = function(otherNum, heroes) {
        var pool = heroes || sgs.HERO,
            always = sgs.func.filter(pool, function(hero) {
                return hero.name == '曹操' ||
                    hero.name == '刘备' ||
                    hero.name == '孙权';
            }),
            others = sgs.func.exclude(
                sgs.func.choice(pool, (otherNum || 2) + 3),
                function(hero) {
                    return hero.name == '曹操' ||
                        hero.name == '刘备' ||
                        hero.name == '孙权';
                }
            );
        return always.concat(others.slice(0, 2));
    };
})(sgs);
