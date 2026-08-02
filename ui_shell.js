var sgs = sgs || {};

(function(sgs) {
    var nextPlayerId = 1,
        nextCardId = 1;

    var playerElementByModel = new WeakMap(),
        playerByElement = new WeakMap(),
        cardElementByModel = new WeakMap(),
        cardByElement = new WeakMap();

    var element = function(value) {
        return value && !value.nodeType && typeof value.length == 'number'
            ? value[0]
            : value;
    };

    var query = function(selector, root) {
        return (root || document).querySelector(selector);
    };
    var queryAll = function(selector, root) {
        return Array.from((root || document).querySelectorAll(selector));
    };
    var create = function(markup) {
        var template = document.createElement('template');
        template.innerHTML = markup.trim();
        return template.content.firstElementChild;
    };
    var style = function(target, property, value) {
        if(!target || !target.style) return target;
        if(typeof property == 'string') {
            target.style[property] = value;
        } else {
            Object.keys(property).forEach(function(key) {
                var next = property[key];
                target.style[key] = typeof next == 'number' &&
                    key != 'opacity' && key != 'zIndex' &&
                    key != 'fontWeight' && key != 'lineHeight'
                    ? next + 'px'
                    : String(next);
            });
        }
        return target;
    };
    var attrs = function(target, values) {
        if(!target) return target;
        Object.keys(values).forEach(function(name) {
            var value = values[name];
            if(value === null || value === undefined) {
                target.removeAttribute(name);
            } else {
                target.setAttribute(name, String(value));
            }
        });
        return target;
    };
    var append = function(parent, child) {
        if(typeof child == 'string') {
            parent.insertAdjacentHTML('beforeend', child);
        } else if(child) {
            parent.append(child);
        }
        return child;
    };
    var offset = function(target) {
        if(!target) return null;
        var rect = target.getBoundingClientRect();
        return {
            left: rect.left + window.scrollX,
            top: rect.top + window.scrollY
        };
    };

    sgs.dom = {
        one: query,
        all: queryAll,
        create: create,
        style: style,
        attrs: attrs,
        append: append,
        empty: function(target) {
            if(target) target.replaceChildren();
            return target;
        },
        remove: function(target) {
            if(target) target.remove();
        },
        text: function(target, value) {
            if(target) target.textContent = value == null ? '' : String(value);
            return target;
        },
        html: function(target, value) {
            if(target) target.innerHTML = value;
            return target;
        },
        show: function(target, display) {
            if(target) target.style.display = display || 'block';
            return target;
        },
        hide: function(target) {
            if(target) target.style.display = 'none';
            return target;
        },
        offset: offset,
        width: function(target) {
            return target ? target.getBoundingClientRect().width : 0;
        },
        height: function(target) {
            return target ? target.getBoundingClientRect().height : 0;
        },
        delegate: function(root, eventType, selector, listener) {
            root.addEventListener(eventType, function(event) {
                var target = event.target && event.target.closest(selector);
                if(target && root.contains(target)) {
                    listener.call(target, event);
                }
            });
        }
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
        bindCardPreview: function(card, dom) {
            dom = element(dom);
            if(!card || !dom) return;
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
            if(card && cardElementByModel.get(card) === dom)
                cardElementByModel.delete(card);
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

    sgs.HERO = sgs.func.map(sgs.HERO, function(i) {
        return new sgs.Hero(i[0], i[1], i[2], i[3], i[4]);
    });
    sgs.CARD = sgs.func.map(sgs.CARD, function(i) {
        return new sgs.Card(i.name, i.color, i.digit);
    });

})(sgs);
