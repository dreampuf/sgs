var sgs = sgs || {};

(function() {

    sgs.animation = sgs.animation || {};
    
    var cardInfo = sgs.interface.cardInfo,
        ui = sgs.dom;

    var card_image = function(card) {
        return sgs.interface.cardImage(card && card.name ? card.name : card);
    };

    var player_anchor = function(player) {
        var playerDom = player && sgs.view.playerElement(player);
        if(!playerDom) {
            return { left: window.innerWidth / 2, top: window.innerHeight / 2 };
        }
        var playerOffset = ui.offset(playerDom);
        return {
            left: playerOffset.left + ui.width(playerDom) / 2,
            top: playerOffset.top + ui.height(playerDom) / 2
        };
    };

    var remove_card_dom = function(dom) {
        if(!dom) {
            return;
        }
        var card = sgs.view.cardFor(dom);
        sgs.view.unbindCard(card, dom);
        dom.remove();
    };

    var show_discard = function(card, sourceDom) {
        var discardBox = ui.one('#discard_pile_box'),
            discard = ui.create('<img class="discard_card" src="' + card_image(card) + '" />'),
            sourceOffset = sourceDom ? ui.offset(sourceDom) : ui.offset(ui.one('#played_card_box')),
            oldCards = Array.from(discardBox.children);
        ui.attrs(discard, {
            'data-card-name': card.name,
            'aria-label': card.name,
            role: 'img'
        });
        document.body.append(discard);
        ui.style(discard, {
            left: sourceOffset.left,
            top: sourceOffset.top,
            opacity: 0.95
        });
        return sgs.motion.to(discard, {
            left: ui.offset(discardBox).left,
            top: ui.offset(discardBox).top,
            opacity: 0.82
        }, 280).then(function() {
            discardBox.append(discard);
            ui.style(discard, { left: 0, top: 0 });
            return sgs.motion.fadeOut(oldCards.filter(function(item) {
                return item !== discard;
            }), 160, true);
        });
    };

    var status_container = function(player, className) {
        var parent = sgs.view.playerElement(player),
            container = ui.one(':scope > .' + className, parent);
        if(!container) {
            container = ui.create('<div class="' + className + '"></div>');
            parent.append(container);
        }
        return container;
    };
    
    /* 将牌放置到牌堆位置 */
    var get_card = function(cards) {
        cards.forEach(function(d) {
            var pattern = d.color,
                color = sgs.CARD_COLOR_NUM_MAPPING.color[pattern],
                num = d.digit,
                numStr = sgs.CARD_COLOR_NUM_MAPPING.number[num],
                img = ui.create(['<div class="player_card"><img src="',
                        sgs.CARDIMAG_MAPING[d.name], '" /><div class="pat_num" style="color:',
                        color, ';"><span class="pattern"><img src="',
                        sgs.PATTERN_IMG_MAPPING[pattern], '" /></span><span class="num">',
                        numStr, '</span></div><div class="select_unable"></div></div>'].join('')),
                cardStackOffset = ui.offset(ui.one('#cards_last'));
            
            ui.attrs(img, {
                role: 'button',
                'aria-label': d.name
            });
            document.body.append(img);
            ui.style(img, {
                left: cardStackOffset.left,
                top: cardStackOffset.top,
                position: 'absolute'
            });
            sgs.view.bindCard(d, img);
            d.selected = false;
        });
    };
    
    /* 将选牌从DOM中抽出（方便牌整理） */
    var drag_out = function(cards) {
        cards = Array.isArray(cards) ? cards : [cards];
        cards.forEach(function(d) {
            var cardElement = sgs.view.cardElement(d);
            if(!cardElement || !document.documentElement.contains(cardElement)) {
                return;
            }
            var offset = ui.offset(cardElement);
            if(!offset) {
                return;
            }
            
            document.body.append(cardElement);
            ui.style(cardElement, {
                position: 'absolute',
                left: offset.left,
                top: offset.top
            });
        });
    };
    
    /* 刷新自己血量 */
    var refresh_blood = function() {
        var player = sgs.view.playerFor(ui.one('#player')),
            blood_imgs = '';
        for(var i = 0; i < player.blood; i++)
            blood_imgs += '<img src="img/system/blod_1.png" />';
        ui.html(ui.one('#player_blod_1'), blood_imgs);
    };
    
    
    /* 拖动 */
    /*
     * 用判断mousemove时鼠标是否按下来判断是否为拖动
     * 1. mousedown           card element
     *   鼠判断是否处于拖动状态(包括返回动画):
     *   - 是则不作任何操作;
     *   - 不是处于拖动状态则设置dom的mousedown属性为true;
     * 2. mousemove           document.body
     *   判断鼠标是否按下:
     *   - 不是则不作任何操作;
     *   - 是按下的则执行拖动;
     * 3. mouseup             card element
     *   判断是否处于拖动状态, 设置dom的mousedown属性为false:
     *   - 不是则不作任何操作;
     *   - 是则结束拖动;
    */
    var CARD_DRAG_THRESHOLD = 10;

    var card_drop_zone = function() {
        return ui.one('#card_play_drop_zone');
    };

    var point_in_element = function(element, x, y) {
        if(!element) {
            return false;
        }
        var rect = element.getBoundingClientRect();
        return x >= rect.left && x <= rect.right &&
            y >= rect.top && y <= rect.bottom;
    };

    var card_can_drop_to_play = function(cardDom) {
        return typeof sgs.animation.canPlayCardDrop == 'function' &&
            sgs.animation.canPlayCardDrop(cardDom);
    };

    var clear_card_drop_zone = function() {
        var dropZone = card_drop_zone();
        if(dropZone) {
            dropZone.classList.remove('card_drop_active', 'card_drop_hover');
        }
    };

    sgs.animation.Mouse_Down = function(e) {
        var cardDom = this;
        if(!cardDom || !cardDom.classList ||
           !cardDom.classList.contains('player_card')) {
            return true;
        }
        if(e.button != 0)
            return true;
        if(cardDom.onDrag)
            return true;
        
        document.body.onDragDom = cardDom;
        cardDom.mousedown = true;
        cardDom.mouse_left = e.clientX; /* 鼠标按下时的位置 */
        cardDom.mouse_top = e.clientY;
        cardDom.first_left = ui.offset(this).left - ui.offset(ui.one('#cards')).left; /* 鼠标按下时卡牌的相对位置 */
        cardDom.first_top = ui.offset(this).top - ui.offset(ui.one('#cards')).top;
    };
    sgs.animation.Mouse_Move = function(e) {
        var cardDom = document.body.onDragDom;
        if(!cardDom || !cardDom.style ||
           !document.documentElement.contains(cardDom)) {
            document.body.onDragDom = undefined;
            return true;
        }
        if(!cardDom.mousedown)
            return true;

        var deltaX = e.clientX - cardDom.mouse_left,
            deltaY = e.clientY - cardDom.mouse_top;
        if(!cardDom.onDrag &&
           deltaX * deltaX + deltaY * deltaY <
                CARD_DRAG_THRESHOLD * CARD_DRAG_THRESHOLD) {
            return true;
        }

        cardDom.onDrag = true;
        var dropZone = card_drop_zone(),
            canDrop = card_can_drop_to_play(cardDom);
        if(dropZone) {
            dropZone.classList.toggle('card_drop_active', canDrop);
            dropZone.classList.toggle(
                'card_drop_hover',
                canDrop && point_in_element(dropZone, e.clientX, e.clientY)
            );
        }
        ui.style(cardDom, {
            'z-index': '1000',
            cursor: canDrop ? 'grabbing' : 'pointer',
            left: e.clientX - cardDom.mouse_left + cardDom.first_left,
            top: e.clientY - cardDom.mouse_top + cardDom.first_top
        });
    };
    sgs.animation.Mouse_Up = function(e) {
        var cardDom = document.body.onDragDom;
        document.body.onDragDom = undefined;
        if(!cardDom || !cardDom.style) {
            clear_card_drop_zone();
            return true;
        }
        cardDom.mousedown = false;
        if(!cardDom.onDrag)
            return true;

        var dropZone = card_drop_zone(),
            played = card_can_drop_to_play(cardDom) &&
                point_in_element(dropZone, e.clientX, e.clientY);
        clear_card_drop_zone();
        cardDom.onRevert = true; /* 避免重复执行下面的动画 */
        return sgs.motion.to(cardDom, {
            left: cardDom.first_left,
            top: cardDom.first_top
        }, played ? 140 : 240).then(function() {
            cardDom.onDrag = false;
            cardDom.onRevert = false;
            cardDom.style.zIndex = '10';
            cardDom.style.cursor = '';
            if(played && document.documentElement.contains(cardDom)) {
                cardDom.dispatchEvent(new CustomEvent('sgs-card-play-drop', {
                    bubbles: true
                }));
            }
        });
    };
    
    /* 卡牌效果动画 sgs.animation.Card_Flash(sgs.interface.bout.player[1], '杀') */
    sgs.animation.Card_Flash = function(player, name) {
        if(sgs.EFFECT_IMG_MAPPING[name] == undefined)
            return Promise.resolve();
        var img,
            img2,
            targetLeft,
            targetTop,
            player_dom = sgs.view.playerElement(player);
        
        img = ui.create('<img class="combat_effect card_flash_effect" src="' + sgs.EFFECT_IMG_MAPPING[name] + '" />');
        img2 = ui.create('<img class="combat_effect card_flash_effect" src="' + sgs.EFFECT_IMG_MAPPING[name] + '" />');
        document.body.append(img);
        targetLeft = ui.offset(player_dom).left + (ui.width(player_dom) - ui.width(img)) / 2;
        if(player_dom == ui.one('#player'))
            targetTop = ui.offset(player_dom).top - ui.height(img) / 2;
        else
            targetTop = ui.offset(player_dom).top + (ui.height(player_dom) - ui.height(img)) / 2;
        ui.style(img, {
            position: 'absolute',
            left: targetLeft,
            top: targetTop,
            opacity: 0
        });
        return sgs.motion.sequence([
            function() {
                return sgs.motion.to(img, { opacity: 1 }, 50);
            },
            function() {
                document.body.append(img2);
                ui.style(img2, {
                    position: 'absolute',
                    left: targetLeft,
                    top: targetTop,
                    opacity: 1
                });
                return sgs.motion.parallel([
                    sgs.motion.to(img2, {
                        opacity: 0,
                        width: ui.width(img) * 2,
                        height: ui.height(img) * 2,
                        left: targetLeft - ui.width(img) / 2,
                        top: targetTop - ui.height(img) / 2
                    }, 200).then(function() { img2.remove(); }),
                    sgs.motion.sequence([
                        function() { return sgs.motion.delay(500); },
                        function() { return sgs.motion.to(img, { opacity: 0 }, 200); }
                    ]).then(function() {
                        img.remove();
                    })
                ]);
            }
        ]).finally(function() {
            if(document.documentElement.contains(img))
                img.remove();
            if(document.documentElement.contains(img2))
                img2.remove();
        });
    };
    
    /* 从牌堆中删除部分牌 */
    sgs.animation.Del_Out = function(card_stack, del_cards) {
        del_cards.forEach(function(d) {
            card_stack.some(function(dd, ii) {
                if (d == dd) {
                    card_stack.splice(ii, 1);
                    return true;
                }
                return false;
            });
        });
    };
    
    /* 给电脑发牌 */
    sgs.animation.Deal_Comp = function(card_count, player) {
        var playerDom = sgs.view.playerElement(player),
            tasks = [];
        for(var i = 0; i < card_count; i++) {
            var img = ui.create('<img src="img/system/card_back.png" style="width:93px; height:131px" />'),
                stackOffset = ui.offset(ui.one('#cards_last'));
            document.body.append(img);
            ui.style(img, {
                position: 'absolute',
                left: stackOffset.left + 8,
                top: stackOffset.top
            });
            tasks.push((function(cardBack, index) {
                return sgs.motion.sequence([
                    function() {
                        return sgs.motion.to(cardBack, {
                            left: ui.offset(playerDom).left + (index + 1) * 10,
                            top: ui.offset(playerDom).top + 10,
                            opacity: 0.8
                        }, 500);
                    },
                    function() {
                        ui.text(ui.one('.card_count span', playerDom), player.card.length);
                        return sgs.motion.fadeOut(cardBack, 160, true);
                    }
                ]);
            })(img, i));
        };
        return sgs.motion.parallel(tasks);
    };
    
    /* 给玩家发牌 */
    sgs.animation.Deal_Player = function(cards) {
        get_card(cards);
        
        var cardsBox = ui.one('#cards'),
            cc = sgs.view.playerFor(ui.one('#player')).card.length,
            tasks = [];
        cards.forEach(function(d, i) {
            var cardDom = sgs.view.cardElement(d);
            if (cardDom.parentNode != document.body)
                return;

            var tempL,
                targetL,
                targetT = ui.offset(cardsBox).top;
            if(cc * cardInfo.width < ui.width(cardsBox))
                tempL = cardInfo.width * (i + cc - cards.length);
            else
                tempL = (ui.width(cardsBox) - cardInfo.width) / (cc - 1) * (i + cc - cards.length);
            targetL = ui.offset(cardsBox).left + tempL;
            
            tasks.push(sgs.motion.to(cardDom, {
                left: targetL,
                top: targetT
            }, 500).then(function () {
                cardsBox.append(cardDom);
                ui.style(cardDom, { left: tempL, top: 0 });
            }));
        });
        return sgs.motion.parallel(tasks);
    };

    sgs.animation.Sync_Player_Hand = function(player) {
        var playerDom = sgs.view.playerElement(player);
        if(playerDom != ui.one('#player')) {
            ui.text(ui.one('.card_count span', playerDom), player.card.length);
            return Promise.resolve();
        }

        ui.all('#cards > .player_card').forEach(function(cardDom) {
            var card = sgs.view.cardFor(cardDom);
            if(!card || player.card.indexOf(card) == -1) {
                remove_card_dom(cardDom);
            }
        });

        var missing = [];
        player.card.forEach(function(card) {
            var cardDom = sgs.view.cardElement(card);
            if(cardDom && document.documentElement.contains(cardDom)) {
                ui.attrs(cardDom, {
                    'aria-label': card.name
                });
                ui.attrs(ui.one(':scope > img', cardDom), { src: card_image(card) });
                ui.attrs(ui.one('.pattern img', cardDom), {
                    src: sgs.PATTERN_IMG_MAPPING[card.color]
                });
                ui.text(ui.one('.num', cardDom),
                    sgs.CARD_COLOR_NUM_MAPPING.number[card.digit]
                );
            }
            if(!cardDom || !document.documentElement.contains(cardDom) ||
               !cardDom.classList.contains('player_card')) {
                missing.push(card);
            }
        });
        return (missing.length ?
            sgs.animation.Deal_Player(missing) :
            Promise.resolve()
        ).then(function() {
            return sgs.animation.Arrange_Card(player.card);
        });
    };
    
    /* 出牌动画 sgs.animation.Play_Card(sgs.interface.bout.player[1], sgs.interface.bout.player[1].card[0]) */
    sgs.animation.Play_Card = function(player, targets, cards) {
        cards = Array.isArray(cards) ? cards : [cards];
        var playerDom = sgs.view.playerElement(player);
        var createTransientCard = function(card) {
            var cardImg = ui.create(
                    '<img src="' + card_image(card) +
                    '" style="width:93px; height:131px;" />'
                ),
                playerOffset = ui.offset(playerDom),
                localPlayer = playerDom == ui.one('#player');
            ui.attrs(cardImg, {
                'data-card-name': card.name,
                'aria-label': card.name
            });
            document.body.append(cardImg);
            ui.style(cardImg, {
                position: 'absolute',
                left: localPlayer
                    ? playerOffset.left +
                        (ui.width(playerDom) - cardInfo.width) / 2
                    : playerOffset.left + 20,
                top: playerOffset.top + 10
            });
            return cardImg;
        };
        var flash = function(dom, name, index) {
            if(!dom || !document.documentElement.contains(dom)) {
                return Promise.resolve();
            }
            void sgs.animation.Card_Flash(player, name); /* 效果动画 */
            /*
             * 1. 把现有卡牌往后移(动画)
             * 2. 加上要添加的卡牌
             * 3. 把要添加的卡牌移过去(动画)
             */
            var playedCardBox = ui.one('#played_card_box'),
                current_count = playedCardBox.children.length, /* 现有卡牌数量 */
                card_count = cards.length, /* 打出的卡牌数量 */
                finally_width = (current_count + card_count) * (cardInfo.width + 2) - 2, /* 最终宽度(2 为卡牌之间的间隔) */
                domLeft = ui.offset(dom).left,
                domTop = ui.offset(dom).top;
            
            var existingMoves = [];
            Array.from(playedCardBox.children).forEach(function(d, i) {
                existingMoves.push(sgs.motion.to(d, {
                    left: -finally_width / 2 + (i + card_count) * (cardInfo.width + 2),
                    top: -cardInfo.width / 2
                }, 240));
            });
            dom.classList.remove('player_card', 'card_unusable');
            dom.classList.add('table_card');
            playedCardBox.prepend(dom);
            ui.style(dom, {
                left: domLeft - ui.offset(playedCardBox).left,
                top: domTop - ui.offset(playedCardBox).top
            });
            return sgs.motion.sequence([
                function() {
                    return sgs.motion.parallel(existingMoves.concat([
                        sgs.motion.to(dom, {
                            left: -finally_width / 2 + index * (cardInfo.width + 2),
                            top: -cardInfo.width / 2
                        }, 240)
                    ]));
                },
                function() { return sgs.motion.delay(140); },
                function() {
                    var isDelayed = name == "乐不思蜀" || name == "兵粮寸断" || name == "闪电";
                    return sgs.motion.parallel([
                        isDelayed ? Promise.resolve() : show_discard({ name: name }, dom),
                        sgs.motion.to(dom, { opacity: 0 }, 120)
                    ]).then(function() {
                        remove_card_dom(dom);
                    });
                }
            ]);
        };
        var tasks = [];
        if(player == sgs.view.playerFor(ui.one('#player'))) {
            drag_out(cards);
            cards.forEach(function(d, i) {
                var cardDom = sgs.view.cardElement(d);
                if(!cardDom || !document.documentElement.contains(cardDom)) {
                    cardDom = createTransientCard(d);
                }
                tasks.push(flash(cardDom, d.name, i));
            });
            tasks.push(sgs.animation.Arrange_Card(player.card));
        } else {
            cards.forEach(function(d, i) {
                var cardImg = createTransientCard(d);
                tasks.push(flash(cardImg, d.name, i));
            });
        }
        ui.text(ui.one('.card_count span', playerDom), player.card.length);
        return sgs.motion.parallel(tasks);
    };

    sgs.animation.Discard_Card = function(player, cards) {
        cards = Array.isArray(cards) ? cards : [cards];
        if(player == sgs.view.playerFor(ui.one('#player'))) {
            drag_out(cards);
        }
        var tasks = [];
        cards.forEach(function(card) {
            var cardDom = sgs.view.cardElement(card);
            if(!cardDom) {
                cardDom = ui.create('<img class="table_card" src="' + card_image(card) + '" />');
                document.body.append(cardDom);
                ui.style(cardDom, {
                    left: player_anchor(player).left - cardInfo.width / 2,
                    top: player_anchor(player).top - cardInfo.height / 2
                });
            }
            cardDom.classList.remove('player_card', 'card_unusable');
            cardDom.classList.add('table_card');
            tasks.push(sgs.motion.parallel([
                show_discard(card, cardDom),
                sgs.motion.to(cardDom, { opacity: 0 }, 260)
            ]).then(function() {
                remove_card_dom(cardDom);
            }));
        });
        if(player == sgs.view.playerFor(ui.one('#player'))) {
            tasks.push(sgs.animation.Arrange_Card(player.card));
        }
        ui.text(ui.one('.card_count span', sgs.view.playerElement(player)), player.card.length);
        return sgs.motion.parallel(tasks);
    };

    sgs.animation.Delayed_On = function(player, card, previousPlayer) {
        var previousTask = Promise.resolve();
        if(previousPlayer) {
            previousTask = sgs.animation.Delayed_Off(previousPlayer, card, "move");
        }
        var zone = status_container(player, 'delayed_zone'),
            selector = '.delayed_status[data-card-name="' + card.name + '"]';
        if(ui.one(selector, zone)) {
            return previousTask;
        }
        var status = ui.create('<div class="delayed_status" data-card-name="' + card.name +
            '" aria-label="' + card.name + '（判定区）"><img src="' + card_image(card) +
            '" /><span>' + card.name + '</span></div>');
        zone.append(status);
        ui.style(status, { opacity: 0, transform: 'scale(1.35)' });
        return sgs.motion.parallel([
            previousTask,
            sgs.motion.to(status, { opacity: 1 }, 220).then(function() {
                status.style.transform = 'scale(1)';
            })
        ]);
    };

    sgs.animation.Delayed_Off = function(player, card, reason) {
        if(!player || !card) {
            return Promise.resolve();
        }
        var zone = status_container(player, 'delayed_zone'),
            status = ui.one('.delayed_status[data-card-name="' + card.name + '"]', zone);
        if(!status) {
            return Promise.resolve();
        }
        status.setAttribute('data-exit-reason', reason || 'resolve');
        status.classList.add('delayed_resolving');
        return sgs.motion.fadeOut(status, 240, true);
    };

    sgs.animation.Nullified = function(player, targets, cancelledCard) {
        var names = [],
            targetList = Array.isArray(targets) ? targets : [targets];
        var targetTasks = [];
        targetList.forEach(function(target) {
            if(target && target.nickname) {
                names.push(target.nickname.replace(/_/g, ''));
                var targetDom = sgs.view.playerElement(target);
                targetDom.classList.add('nullified_target');
                targetTasks.push((function(dom) {
                    return sgs.motion.delay(700).then(function() {
                        dom.classList.remove('nullified_target');
                    });
                })(targetDom));
            }
        });
        var effect = ui.create('<div class="nullified_effect"><strong>无懈可击</strong><span>抵消 ' +
            (cancelledCard ? cancelledCard.name : '锦囊') + '</span><small>' +
            (names.length ? names.join('、') : '本次效果') + '</small></div>');
        ui.one('#main').append(effect);
        return sgs.motion.parallel(targetTasks.concat([
            sgs.motion.sequence([
                function() { return sgs.motion.to(effect, { opacity: 1, top: '39%' }, 160); },
                function() { return sgs.motion.delay(520); },
                function() { return sgs.motion.to(effect, { opacity: 0, top: '35%' }, 220); }
            ]).then(function() { effect.remove(); })
        ]));
    };

    sgs.animation.Status_Change = function(player, name, enabled) {
        var labels = {
                "chained": "横置",
                "jiu_damage": "酒",
                "lebusishu": "跳过出牌",
                "bingliang": "跳过摸牌"
            },
            container = status_container(player, 'status_strip'),
            token = ui.one('.status_token[data-status="' + name + '"]', container);
        sgs.view.playerElement(player).classList.toggle('status_' + name, !!enabled);
        if(enabled && !token) {
            token = ui.create('<span class="status_token" data-status="' + name + '">' +
                (labels[name] || name) + '</span>');
            container.append(token);
            ui.hide(token);
            return sgs.motion.fadeIn(token, 160);
        } else if(!enabled) {
            return sgs.motion.fadeOut(token, 160, true);
        }
        return Promise.resolve();
    };

    sgs.animation.Judge_Card = function(player, card) {
        var anchor = player_anchor(player),
            suits = {
                0: '方块',
                1: '红桃',
                2: '梅花',
                3: '黑桃'
            },
            suit = suits[card.color] || '未知花色',
            color = sgs.CARD_COLOR_NUM_MAPPING.color[card.color] || 'black',
            rank = sgs.CARD_COLOR_NUM_MAPPING.number[card.digit] ||
                String(card.digit),
            judge = ui.create([
                '<div class="judge_effect"><img class="judge_card_art" src="',
                card_image(card), '" /><div class="pat_num" style="color:',
                color, ';"><span class="pattern"><img src="',
                sgs.PATTERN_IMG_MAPPING[card.color],
                '" /></span><span class="num">',
                rank, '</span></div></div>'
            ].join(''));
        ui.attrs(judge, {
            role: 'img',
            'aria-label': '判定牌：' + suit + ' ' + rank + '，' + card.name
        });
        document.body.append(judge);
        ui.style(judge, {
            left: anchor.left - 47,
            top: anchor.top - 66,
            opacity: 0
        });
        return sgs.motion.sequence([
            function() { return sgs.motion.to(judge, { opacity: 1, top: anchor.top - 86 }, 180); },
            function() { return sgs.motion.delay(650); },
            function() { return sgs.motion.to(judge, { opacity: 0 }, 220); }
        ]).then(function() { judge.remove(); });
    };

    sgs.animation.Show_Card = function(player, card) {
        var anchor = player_anchor(player),
            shown = ui.create('<div class="show_card_effect"><span>展示</span><img src="' +
                card_image(card) + '" /></div>');
        document.body.append(shown);
        ui.style(shown, {
            left: anchor.left - 47,
            top: anchor.top - 66,
            opacity: 0
        });
        return sgs.motion.sequence([
            function() { return sgs.motion.to(shown, { opacity: 1 }, 160); },
            function() { return sgs.motion.delay(650); },
            function() { return sgs.motion.to(shown, { opacity: 0 }, 220); }
        ]).then(function() { shown.remove(); });
    };
    
    /* 装备装备动画 */
    sgs.animation.Equip_Equipment = function(player, card) {
        var type = sgs.EQUIP_TYPE_MAPPING[card.name],
            playerDom = sgs.view.playerElement(player),
            cardDom = sgs.view.cardElement(card),
            animationTask;
        if(player == sgs.view.playerFor(ui.one('#player'))) {
            if(cardDom && document.documentElement.contains(cardDom)) {
                drag_out(card);
                animationTask = sgs.motion.sequence([
                    function() {
                        var attack = ui.one('#attack'),
                            self = ui.one('#player');
                        return sgs.motion.to(cardDom, {
                            left: ui.offset(attack).left + (ui.width(attack) - ui.width(cardDom)) / 2,
                            top: ui.offset(self).top + (ui.height(self) - ui.height(cardDom)) / 2
                        }, 500);
                    },
                    function() { return sgs.motion.to(cardDom, { opacity: 0 }, 200); }
                ]).then(function() {
                    remove_card_dom(cardDom);
                });
            } else {
                animationTask = Promise.resolve();
            }
            
            var equip_id = type == 0 ? '#attack' : (type == 1 ? '#defend' : (type == 2 ? '#attack_horse' : '#defend_horse')),
                equipTarget = ui.one(equip_id),
                equip_img = ['<div class="equip_box">',
                                    '<img class="equip_border" src="img/generals/equipment/border.png" />',
                                    '<img class="equip_img" src="', sgs.EQUIP_IMG_MAPPING[card.name], '" />',
                                    card.name == '古锭刀' || card.name == '骅骝' ?
                                        '<span class="equip_crop_name">' + card.name + '</span>' : '',
                                    '<img class="equip_pattern" src="', sgs.PATTERN_IMG_MAPPING[card.color], '" />',
                                    '<span class="equip_num" style="color:', sgs.CARD_COLOR_NUM_MAPPING.color[card.color], ';">',
                                        sgs.CARD_COLOR_NUM_MAPPING.number[card.digit],'</span>',
                                '</div>',
                                '<div class="equip_back"></div>'
                            ].join('');
            ui.html(equipTarget, equip_img);
            ui.attrs(equipTarget, {
                'data-card-name': card.name,
                'aria-label': card.name
            });
            sgs.view.bindCard(card, equipTarget);
            animationTask = sgs.motion.parallel([
                animationTask,
                sgs.animation.Arrange_Card()
            ]);
        } else {
            var cardAnimation = ui.create('<img src="' + sgs.CARDIMAG_MAPING[card.name] + '" />');
            document.body.append(cardAnimation);
            ui.style(cardAnimation, {
                position: 'absolute',
                width: sgs.interface.cardInfo.width,
                height: sgs.interface.cardInfo.height,
                left: ui.offset(playerDom).left - 60,
                top: ui.offset(playerDom).top - 30
            });
            animationTask = sgs.motion.sequence([
                function() {
                    return sgs.motion.to(cardAnimation, {
                        left: ui.offset(playerDom).left + 20,
                        top: ui.offset(playerDom).top + 10
                    }, 500);
                },
                function() { return sgs.motion.to(cardAnimation, { opacity: 0 }, 200); }
            ]).then(function() { cardAnimation.remove(); });
            
            var equip_id = type == 0 ? '.attack' : (type == 1 ? '.defend' : (type == 2 ? '.attack_horse' : '.defend_horse')),
                characher_mapping = sgs.NUMBER_CHARACHER_MAPPING,
                number_mapping = sgs.CARD_COLOR_NUM_MAPPING.number,
                pattern_img = sgs.PATTERN_IMG_MAPPING,
                otherEquipTarget = ui.one(equip_id, playerDom);
            ui.html(otherEquipTarget, ['<img src="',
                    sgs.EQUIP_ICON_MAPPING[type], '" style="width:13px; height:13px; position:absolute; left:0;" /><font style="position:absolute; left:18px;">',
                    type == 2 ? '+1' : (type == 3 ? '-1' : characher_mapping[sgs.EQUIP_RANGE_MAPPING[card.name]]), '</font><font>',
                    card.name, '</font><font style="position:absolute; right:18px; line-height:15px;">',
                    number_mapping[card.digit], '</font><img src="',
                    pattern_img[type], '" style="width:11px; height:11px; position:absolute; top:1px; right:2px;"/>'
                ].join(''));
            ui.attrs(otherEquipTarget, {
                    'data-card-name': card.name,
                    'aria-label': card.name
            });
            ui.text(ui.one('.card_count span', playerDom), player.card.length);
        }
        return animationTask || Promise.resolve();
    };

    sgs.animation.Remove_Equipment = function(player, card, type, destination) {
        var playerDom = sgs.view.playerElement(player),
            removeTask = Promise.resolve();
        if(player == sgs.view.playerFor(ui.one('#player'))) {
            var equipId = type == 0 ? '#attack' : (type == 1 ? '#defend' : (type == 2 ? '#attack_horse' : '#defend_horse'));
            var equipTarget = ui.one(equipId);
            removeTask = sgs.motion.fadeOut(Array.from(equipTarget.children), 160, true);
            sgs.view.unbindCard(card, equipTarget);
            ui.attrs(equipTarget, {
                'data-card-name': null,
                'aria-label': null,
                'aria-describedby': null
            });
        } else {
            var equipClass = type == 0 ? '.attack' : (type == 1 ? '.defend' : (type == 2 ? '.attack_horse' : '.defend_horse'));
            var otherEquipTarget = ui.one(equipClass, playerDom);
            ui.empty(otherEquipTarget);
            ui.attrs(otherEquipTarget, {
                'data-card-name': null,
                'aria-label': null,
                'aria-describedby': null
            });
        }
        return destination && destination.indexOf('zone:hand:') === 0
            ? removeTask
            : sgs.motion.parallel([removeTask, show_discard(card, playerDom)]);
    };
    
    /* 整理牌 */
    sgs.animation.Arrange_Card = function (cards) {
        cards = cards == undefined ? sgs.view.playerFor(ui.one('#player')).card : cards;
        var cc = cards.length;
        var tasks = [];
        cards.forEach(function(d, i) {
            var cardDom = sgs.view.cardElement(d);
            if(!cardDom)
                return;
            if (cardDom.parentNode == document.body)
                return;
            var left;
            if (cc * cardInfo.width < ui.width(ui.one('#cards')))
                left = cardInfo.width * i;
            else
                left = (ui.width(ui.one('#cards')) - cardInfo.width) / (cc - 1) * i;
            sgs.motion.cancel(cardDom);
            tasks.push(sgs.motion.to(cardDom, { left: left }, 180));
        });
        return sgs.motion.parallel(tasks);
    };
    
    var escape_explanation = function(value) {
        var holder = document.createElement('div');
        holder.textContent = value == null ? '' : String(value);
        return holder.innerHTML;
    };

    var position_explanation = function(clientX, clientY) {
        var explanation = ui.one('#explanation'),
            margin = 12;
        ui.style(explanation, {
            display: 'block',
            visibility: 'hidden'
        });
        var width = ui.width(explanation),
            height = ui.height(explanation),
            targetLeft = clientX + margin,
            targetTop = clientY + margin;
        if(targetLeft + width + margin > window.innerWidth) {
            targetLeft = clientX - width - margin;
        }
        if(targetTop + height + margin > window.innerHeight) {
            targetTop = clientY - height - margin;
        }
        targetLeft = Math.min(
            Math.max(margin, targetLeft),
            Math.max(margin, window.innerWidth - width - margin)
        );
        targetTop = Math.min(
            Math.max(margin, targetTop),
            Math.max(margin, window.innerHeight - height - margin)
        );
        ui.style(explanation, {
            left: targetLeft,
            top: targetTop,
            visibility: 'visible'
        });
    };

    var explanation_text = function(value) {
        return escape_explanation(value).replace(/★/g, '<br /><span class="explanation_note">★</span>');
    };

    /* 显示武将和技能解释 */
    sgs.animation.Skill_Explanation = function(name, isHero, clientX, clientY) {
        var hero_prop = sgs.interface.HERO_PROPERTY_MAPPING,
            skill_exp = sgs.SKILL_EXPLANATION_MAPPING,
            skill_status = sgs.SKILL_IMPLEMENTATION_STATUS || {},
            status_label = {
                "missing": '<span class="explanation_missing">规则未实现</span>',
                "partial": '<span class="explanation_partial">部分实现</span>'
            },
            explanation = '';

        if(isHero) {
            var hero = hero_prop[name],
                skills = hero ? hero.skill : [];
            explanation += [
                '<div class="explanation_title">', escape_explanation(name), '</div>',
                '<div class="explanation_meta">技能说明</div>'
            ].join('');
            skills.forEach(function(skillName) {
                explanation += [
                    '<div class="explanation_section">',
                    '<div class="explanation_label">', escape_explanation(skillName),
                    status_label[skill_status[skillName]] || '', '</div>',
                    '<div>', explanation_text(skill_exp[skillName] || '暂无技能说明'), '</div>',
                    '</div>'
                ].join('');
            });
        } else {
            explanation = [
                '<div class="explanation_title">', escape_explanation(name), '</div>',
                '<div class="explanation_section">',
                status_label[skill_status[name]] || '',
                explanation_text(skill_exp[name] || '暂无技能说明'),
                '</div>'
            ].join('');
        }
        var explanationDom = ui.one('#explanation');
        ui.html(explanationDom, explanation);
        ui.attrs(explanationDom, {
            role: 'tooltip',
            'data-explanation-kind': 'skill',
            'data-explanation-name': name
        });
        position_explanation(clientX, clientY);
    };

    /* 显示卡牌解释 */
    sgs.animation.Card_Explanation = function(card, clientX, clientY) {
        var name = card && card.name ? card.name : card,
            rule = (sgs.CARD_EXPLANATION_MAPPING || {})[name],
            suits = {
                0: '♦ 方块',
                1: '♥ 红桃',
                2: '♣ 梅花',
                3: '♠ 黑桃'
            },
            meta = [],
            number;
        if(!rule) {
            return false;
        }
        meta.push(rule.category);
        if(card && typeof card == 'object' && card.color != undefined) {
            number = sgs.CARD_COLOR_NUM_MAPPING.number[card.digit] || card.digit;
            meta.push((suits[card.color] || '未知花色') + ' ' + number);
        }
        var explanationDom = ui.one('#explanation');
        ui.html(explanationDom, [
            '<div class="explanation_title">', escape_explanation(name), '</div>',
            '<div class="explanation_meta">', escape_explanation(meta.join(' · ')), '</div>',
            '<div class="explanation_section">',
            '<div class="explanation_label">目标</div>',
            '<div>', explanation_text(rule.target), '</div>',
            '</div>',
            '<div class="explanation_section">',
            '<div class="explanation_label">效果</div>',
            '<div>', explanation_text(rule.description), '</div>',
            '</div>'
        ].join(''));
        ui.attrs(explanationDom, {
            role: 'tooltip',
            'data-explanation-kind': 'card',
            'data-explanation-name': name
        });
        position_explanation(clientX, clientY);
        return true;
    };
    
    /* 出牌剩余时间动画 javascript:sgs.animation.Time_Last(true, 5, 2) */
    sgs.animation.Time_Last = function(isComp, seconds, comp_num) {
        if(!isComp) {
            var playerProgress = ui.one('#player_progress'),
                playerProgressBar = ui.one('#player_progress_bar');
            playerProgress.style.width = '296px';
            ui.style(playerProgressBar, { display: 'block', opacity: 1 });
            return sgs.motion.sequence([
                function() { return sgs.motion.to(playerProgress, { width: 0 }, (seconds || 15) * 1000); },
                function() { return sgs.motion.to(playerProgressBar, { opacity: 0 }, 200); }
            ]);
        } else {
            var comp = ui.one("#role" + comp_num),
                roleProgress = ui.one('.role_progress', comp),
                roleProgressBar = ui.one('.role_progress_bar', comp);
            roleProgress.style.width = '123px';
            ui.style(roleProgressBar, { display: 'block', opacity: 1 });
            return sgs.motion.sequence([
                function() { return sgs.motion.to(roleProgress, { width: 0 }, (seconds || 15) * 1000); },
                function() { return sgs.motion.to(roleProgressBar, { opacity: 0 }, 200); }
            ]);
        }
    };
    
    /* 掉血动画 sgs.animation.Get_Damage(true, sgs.interface.bout.player[1]) */
    sgs.animation.Refresh_Blood = function(player) {
        var bloodImgs = '',
            i,
            playerDom = player && sgs.view.playerElement(player);
        if(!playerDom) {
            return;
        }
        for(i = 0; i < Math.max(0, player.blood); i++) {
            bloodImgs += '<img src="img/system/blod_1.png" />';
        }
        if(playerDom == ui.one('#player')) {
            ui.html(ui.one('#player_blod_1'), bloodImgs);
        } else {
            ui.html(ui.one('.blods_1', playerDom), bloodImgs);
        }
    };

    sgs.animation.Get_Damage = function(player) {
        var left_num,
            top_num,
            targetLeft,
            targetTop,
            playerDom = sgs.view.playerElement(player),
            damage_img = ui.create(
                '<img class="combat_effect damage_effect" src="img/system/damage.png" />'
            );
        document.body.append(damage_img);
        var damage_img_width = ui.width(damage_img),
            damage_img_height = ui.height(damage_img);
        if(playerDom != ui.one('#player')) {
            left_num = parseInt(getComputedStyle(playerDom).left, 10);
            top_num = parseInt(getComputedStyle(playerDom).top, 10);
            targetLeft = ui.offset(playerDom).left + (ui.width(playerDom) - damage_img_width) / 2;
            targetTop = ui.offset(playerDom).top + (ui.height(playerDom) - damage_img_height) / 2;
            var shakeTask = sgs.motion.sequence([
                function() { return sgs.motion.to(playerDom, {
                    left: left_num - 10,
                    top: top_num + 10
                }, 50); },
                function() { return sgs.motion.to(playerDom, {
                    left: left_num,
                    top: top_num
                }, 50); }
            ]);
        } else {
            var playerHead = ui.one('#player_head');
            left_num = parseInt(getComputedStyle(playerHead).right, 10);
            top_num = parseInt(getComputedStyle(playerHead).top, 10);
            targetLeft = ui.offset(playerHead).left + (ui.width(playerHead) - damage_img_width) / 2;
            targetTop = ui.offset(playerHead).top + (ui.height(playerHead) - damage_img_height) / 2;
            var shakeTask = sgs.motion.sequence([
                function() { return sgs.motion.to(playerHead, {
                    right: left_num + 10,
                    top: top_num + 10
                }, 100); },
                function() { return sgs.motion.to(playerHead, {
                    right: left_num,
                    top: top_num
                }, 100); }
            ]);
        }
        ui.style(damage_img, {
            position: 'absolute',
            left: targetLeft,
            top: targetTop,
            width: damage_img_width,
        });
        var damageTask = sgs.motion.sequence([
            function() { return sgs.motion.delay(1000); },
            function() { return sgs.motion.to(damage_img, { opacity: 0 }, 100); }
        ]).then(function() { damage_img.remove(); });
        sgs.animation.Refresh_Blood(player);
        return sgs.motion.parallel([shakeTask, damageTask]);
    };

    sgs.animation.Player_Death = function(player) {
        var dead_image = sgs.DEAD_IDENTITY_MAPPING[player.identity],
            playerElement = sgs.view.playerElement(player);
        if(!dead_image) {
            return;
        }
        playerElement.classList.add('player_dead');
        if(playerElement == ui.one('#player')) {
            ui.attrs(ui.one('#player_identity img'), { src: dead_image });
            ui.one('#player_head_img').style.filter = 'grayscale(1)';
            ui.show(ui.one('#player_cover'));
        } else {
            ui.attrs(ui.one('.role_identity img', playerElement), { src: dead_image });
            ui.one('.head_img img', playerElement).style.filter = 'grayscale(1)';
            ui.show(ui.one('.role_cover', playerElement));
        }
    };
    
})(sgs);
