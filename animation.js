var sgs = sgs || {};

(function() {

    sgs.animation = sgs.animation || {};
    
    var cardInfo = sgs.interface.cardInfo;

    var card_image = function(card) {
        return sgs.interface.cardImage(card && card.name ? card.name : card);
    };

    var player_anchor = function(player) {
        var dom = player ? $(sgs.view.playerElement(player)) : $();
        if(!dom.length) {
            return { left: $(window).width() / 2, top: $(window).height() / 2 };
        }
        return {
            left: dom.offset().left + dom.outerWidth() / 2,
            top: dom.offset().top + dom.outerHeight() / 2
        };
    };

    var remove_card_dom = function(dom) {
        if(!dom) {
            return;
        }
        var card = sgs.view.cardFor(dom);
        sgs.view.unbindCard(card, dom);
        $(dom).remove();
    };

    var show_discard = function(card, sourceDom) {
        var discardBox = $('#discard_pile_box'),
            discard = $('<img class="discard_card" src="' + card_image(card) + '" />'),
            sourceOffset = sourceDom && $(sourceDom).length ? $(sourceDom).offset() : $('#played_card_box').offset(),
            oldCards = discardBox.children();
        discard.appendTo($(document.body)).css({
            left: sourceOffset.left,
            top: sourceOffset.top,
            opacity: 0.95
        });
        discard.animate({
            left: discardBox.offset().left,
            top: discardBox.offset().top,
            opacity: 0.82
        }, 280, function() {
            discard.appendTo(discardBox).css({ left: 0, top: 0 });
            oldCards.not(discard).fadeOut(160, function() { $(this).remove(); });
        });
    };

    var status_container = function(player, className) {
        var parent = $(sgs.view.playerElement(player)),
            container = parent.children('.' + className);
        if(!container.length) {
            container = $('<div class="' + className + '"></div>').appendTo(parent);
        }
        return container;
    };
    
    /* 将牌放置到牌堆位置 */
    var get_card = function(cards) {
        $(cards).each(function(i, d) {
            var pattern = d.color,
                color = sgs.CARD_COLOR_NUM_MAPPING.color[pattern],
                num = d.digit,
                numStr = sgs.CARD_COLOR_NUM_MAPPING.number[num],
                img = $(['<div class="player_card"><img src="',
                        sgs.CARDIMAG_MAPING[d.name], '" /><div class="pat_num" style="color:',
                        color, ';"><span class="pattern"><img src="',
                        sgs.PATTERN_IMG_MAPPING[pattern], '" /></span><span class="num">',
                        numStr, '</span></div><div class="select_unable"></div></div>'].join('')),
                left = $('#cards_last').offset().left,
                top = $('#cards_last').offset().top;
            
            img.appendTo($(document.body));
            img.css({ left: left, top: top });
            img.css('position', 'absolute');
            sgs.view.bindCard(d, img[0]);
            d.selected = false;
        });
    };
    
    /* 将选牌从DOM中抽出（方便牌整理） */
    var drag_out = function(cards) {
        cards = Array.isArray(cards) ? cards : [cards];
        $(cards).each(function (i, d) {
            var temp = $(sgs.view.cardElement(d)),
                leftcss = temp.offset().left,
                topcss = temp.offset().top;
            
            temp.appendTo($(document.body));
            temp.css({
                position: 'absolute',
                left: leftcss,
                top: topcss,
            });
        });
    };
    
    /* 播放声音 */
    var play_sound = function(src) {
        var audio = $('#sound')[0],
            playResult;
        if(!audio || !src || sgs.SOUND_ENABLED === false) {
            return;
        }
        audio.src = src;
        playResult = audio.play();
        if(playResult && playResult.catch) {
            playResult.catch(function() {});
        }
    };

    sgs.animation.Play_Sound = play_sound;
    
    /* 刷新自己血量 */
    var refresh_blood = function() {
        var player = sgs.view.playerFor($('#player')[0]);
            blood_imgs = '';
        for(var i = 0; i < player.blood; i++)
            blood_imgs += '<img src="img/system/blod_1.png" />';
        $('#player_blod_1').html(blood_imgs);
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
    sgs.animation.Mouse_Down = function(e) {
        var cardDom = e.currentTarget,
            vthis = this;
        if(cardDom.onDrag)
            return true;
        
        document.body.onDragDom = cardDom;
        cardDom.mousedown = true;
        cardDom.mouse_left = e.clientX; /* 鼠标按下时的位置 */
        cardDom.mouse_top = e.clientY;
        cardDom.first_left = $(this).offset().left - $('#cards').offset().left; /* 鼠标按下时卡牌的相对位置 */
        cardDom.first_top = $(this).offset().top - $('#cards').offset().top;
    };
    sgs.animation.Mouse_Move = function(e) {
        var cardDom = document.body.onDragDom;
        if(cardDom == undefined || !cardDom.mousedown)
            return true;
        
        cardDom.onDrag = true;
        $(cardDom).css({
            'z-index': '1000',
            cursor: 'pointer',
            left: e.clientX - cardDom.mouse_left + cardDom.first_left,
            top: e.clientY - cardDom.mouse_top + cardDom.first_top
        });
    };
    sgs.animation.Mouse_Up = function(e) {
        var cardDom = e.currentTarget;
        cardDom.mousedown = false;
        if(!cardDom.onDrag)
            return true;
        
        cardDom.onRevert = true; /* 避免重复执行下面的动画 */
        $(cardDom).animate({
            left: cardDom.first_left,
            top: cardDom.first_top
        }, 500, function() {
            cardDom.onDrag = false;
            $(cardDom).css('z-index', '10');
        });
    };
    
    /* 卡牌效果动画 sgs.animation.Card_Flash(sgs.interface.bout.player[1], '杀') */
    sgs.animation.Card_Flash = function(player, name) {
        if(sgs.EFFECT_IMG_MAPPING[name] == undefined)
            return;
        var img,
            img2,
            targetLeft,
            targetTop,
            player_dom = sgs.view.playerElement(player);
        
        img = $('<img class="card_flash_effect" src="' + sgs.EFFECT_IMG_MAPPING[name] + '" />');
        img2 = $('<img class="card_flash_effect" src="' + sgs.EFFECT_IMG_MAPPING[name] + '" />');
        img.appendTo(document.body);
        targetLeft = $(player_dom).offset().left + ($(player_dom).width() - img.width()) / 2;
        if(player_dom == $('#player')[0])
            targetTop = $(player_dom).offset().top - img.height() / 2;
        else
            targetTop = $(player_dom).offset().top + ($(player_dom).height() - img.height()) / 2;
        img.css({
            position: 'absolute',
            left: targetLeft,
            top: targetTop,
            opacity: 0,
        });
        img.animate({ opacity: 1 }, 50, function() {
            img2.appendTo(document.body).css({
                position: 'absolute',
                left: targetLeft,
                top: targetTop,
                opacity: 1,
            }).animate({
                opacity: 0,
                width: img.width() * 2,
                height: img.height() * 2,
                left: targetLeft - img.width() / 2,
                top: targetTop - img.height() / 2,
            }, 200, function() { img2.remove() });
        });
        setTimeout(function() {
            img.animate({ opacity: 0 }, 200, function() {
                img.remove();
            });
        }, 2000);
    };
    
    /* 从牌堆中删除部分牌 */
    sgs.animation.Del_Out = function(card_stack, del_cards) {
        $(del_cards).each(function (i, d) {
            $(card_stack).each(function (ii, dd) {
                if (d == dd) {
                    card_stack.splice(ii, 1);
                    return false;
                }
            });
        });
    };
    
    /* 给电脑发牌 */
    sgs.animation.Deal_Comp = function(card_count, player) {
        var playerDom = sgs.view.playerElement(player);
        for(var i = 0; i < card_count; i++) {
            var img = $('<img src="img/system/card_back.png" style="width:93px; height:131px" />');
            img.appendTo(document.body);
            img.css({
                position: 'absolute',
                left: $('#cards_last').offset().left + 8,
                top: $('#cards_last').offset().top
            });
            img.animate({
                left: $(playerDom).offset().left + (i + 1) * 10,
                top: $(playerDom).offset().top + 10,
                opacity: 0.8
            }, 500, (function(img){
                return function() {
                    $(playerDom).find('.card_count span').text(parseInt($(playerDom).find('.card_count span').text()) + 1);
                    img.animate({ opacity: 0 }, 'slow', function() {
                        img.remove();
                    });
                }
            })(img));
        };
    };
    
    /* 给玩家发牌 */
    sgs.animation.Deal_Player = function(cards) {
        get_card(cards);
        
        var cc = sgs.view.playerFor($('#player')[0]).card.length;
        $.each(cards, function (i, d) {
            var cardDom = sgs.view.cardElement(d);
            if (cardDom.parentNode != document.body)
                return true;

            var tempL,
                targetL,
                targetT = $('#cards').offset().top;
            if(cc * cardInfo.width < $('#cards').width())
                tempL = cardInfo.width * (i + cc - cards.length);
            else
                tempL = ($('#cards').width() - cardInfo.width) / (cc - 1) * (i + cc - cards.length);
            targetL = $('#cards').offset().left + tempL;
            
            $(cardDom).animate({
                left: targetL,
                top: targetT
            }, 500, function () {
                $(cardDom).appendTo($('#cards'));
                $(cardDom).css('left', tempL);
                $(cardDom).css('top', '0');
            });
        });
    };
    
    /* 出牌动画 sgs.animation.Play_Card(sgs.interface.bout.player[1], sgs.interface.bout.player[1].card[0]) */
    sgs.animation.Play_Card = function(player, targets, cards) {
        cards = Array.isArray(cards) ? cards : [cards];
        var flash = function(dom, name, index) {
            sgs.animation.Card_Flash(player, name); /* 效果动画 */
            var card_sounds = sgs.SOUND_FILE_MAPPING.card[name];
            if(card_sounds && card_sounds[player.hero.gender]) {
                play_sound(card_sounds[player.hero.gender]); /* 声音 */
            }
            /*
             * 1. 把现有卡牌往后移(动画)
             * 2. 加上要添加的卡牌
             * 3. 把要添加的卡牌移过去(动画)
             */
            var current_count = $('#played_card_box').children().length, /* 现有卡牌数量 */
                card_count = cards.length, /* 打出的卡牌数量 */
                finally_width = (current_count + card_count) * (cardInfo.width + 2) - 2, /* 最终宽度(2 为卡牌之间的间隔) */
                domLeft = $(dom).offset().left,
                domTop = $(dom).offset().top;
            
            $('#played_card_box').children().each(function(i, d) {
                $(d).animate({
                    left: -finally_width / 2 + (i + card_count) * (cardInfo.width + 2),
                    top: -cardInfo.width / 2,
                }, 300);
            });
            $(dom)
                .removeClass('player_card card_unusable')
                .addClass('table_card')
                .prependTo($('#played_card_box'));
            $(dom).css({
                left: domLeft - $('#played_card_box').offset().left,
                top: domTop - $('#played_card_box').offset().top,
            });
            $(dom).animate({
                left: -finally_width / 2 + index * (cardInfo.width + 2),
                top: -cardInfo.width / 2,
            }, 300, function() {
                setTimeout(function() {
                    var isDelayed = name == "乐不思蜀" || name == "兵粮寸断" || name == "闪电";
                    if(!isDelayed) {
                        show_discard({ name: name }, dom);
                    }
                    $(dom).animate({ opacity: 0 }, 220, function() {
                        remove_card_dom(dom);
                    });
                }, 900);
            });
        };
        var playerDom = sgs.view.playerElement(player);
        if(player == sgs.view.playerFor($('#player')[0])) {
            drag_out(cards);
            $.each(cards, function(i, d) {
                flash(sgs.view.cardElement(d), d.name, i);
            });
            sgs.animation.Arrange_Card(player.card);
        } else {
            $.each(cards, function(i, d) {
                var cardImg = $('<img src="' + sgs.CARDIMAG_MAPING[d.name] + '" style="width:93px; height:131px;" />');
                cardImg.appendTo($(document.body));
                cardImg.css({
                    position: 'absolute',
                    left: ($(playerDom).offset().left + 20) + 'px',
                    top: ($(playerDom).offset().top + 10) + 'px',
                });
                flash(cardImg[0], d.name, i);
            });
        }
        $(playerDom).find('.card_count span').text(player.card.length);
    };

    sgs.animation.Discard_Card = function(player, cards) {
        cards = Array.isArray(cards) ? cards : [cards];
        if(player == sgs.view.playerFor($('#player')[0])) {
            drag_out(cards);
        }
        $.each(cards, function(i, card) {
            var dom = sgs.view.cardElement(card);
            if(!dom) {
                dom = $('<img class="table_card" src="' + card_image(card) + '" />')
                    .appendTo(document.body)
                    .css({
                        left: player_anchor(player).left - cardInfo.width / 2,
                        top: player_anchor(player).top - cardInfo.height / 2
                    })[0];
            }
            $(dom).removeClass('player_card card_unusable').addClass('table_card');
            show_discard(card, dom);
            $(dom).animate({ opacity: 0 }, 260, function() {
                remove_card_dom(dom);
            });
        });
        if(player == sgs.view.playerFor($('#player')[0])) {
            sgs.animation.Arrange_Card(player.card);
        }
        $(sgs.view.playerElement(player)).find('.card_count span').text(player.card.length);
    };

    sgs.animation.Delayed_On = function(player, card, previousPlayer) {
        if(previousPlayer) {
            sgs.animation.Delayed_Off(previousPlayer, card, "move");
        }
        var zone = status_container(player, 'delayed_zone'),
            selector = '.delayed_status[data-card-name="' + card.name + '"]';
        if(zone.find(selector).length) {
            return;
        }
        var status = $('<div class="delayed_status" data-card-name="' + card.name +
            '" title="' + card.name + '（判定区）"><img src="' + card_image(card) +
            '" /><span>' + card.name + '</span></div>');
        status.appendTo(zone).css({ opacity: 0, transform: 'scale(1.35)' }).animate({
            opacity: 1
        }, 220, function() {
            status.css('transform', 'scale(1)');
        });
    };

    sgs.animation.Delayed_Off = function(player, card, reason) {
        if(!player || !card) {
            return;
        }
        var zone = status_container(player, 'delayed_zone'),
            status = zone.find('.delayed_status[data-card-name="' + card.name + '"]');
        status.attr('data-exit-reason', reason || 'resolve').addClass('delayed_resolving')
            .animate({ opacity: 0 }, 240, function() { status.remove(); });
    };

    sgs.animation.Nullified = function(player, targets, cancelledCard) {
        var names = [],
            targetList = Array.isArray(targets) ? targets : [targets];
        $.each(targetList, function(i, target) {
            if(target && target.nickname) {
                names.push(target.nickname.replace(/_/g, ''));
                var targetDom = sgs.view.playerElement(target);
                $(targetDom).addClass('nullified_target');
                setTimeout(function() { $(targetDom).removeClass('nullified_target'); }, 700);
            }
        });
        var effect = $('<div class="nullified_effect"><strong>无懈可击</strong><span>抵消 ' +
            (cancelledCard ? cancelledCard.name : '锦囊') + '</span><small>' +
            (names.length ? names.join('、') : '本次效果') + '</small></div>');
        effect.appendTo($('#main'));
        if($.fx.off) {
            effect.css({ opacity: 1, top: '39%' });
            setTimeout(function() { effect.remove(); }, 800);
        } else {
            effect.animate({ opacity: 1, top: '39%' }, 160)
                .delay(520).animate({ opacity: 0, top: '35%' }, 220, function() { effect.remove(); });
        }
    };

    sgs.animation.Status_Change = function(player, name, enabled) {
        var labels = {
                "chained": "横置",
                "jiu_damage": "酒",
                "lebusishu": "跳过出牌",
                "bingliang": "跳过摸牌"
            },
            container = status_container(player, 'status_strip'),
            token = container.find('.status_token[data-status="' + name + '"]');
        $(sgs.view.playerElement(player)).toggleClass('status_' + name, !!enabled);
        if(enabled && !token.length) {
            $('<span class="status_token" data-status="' + name + '">' +
                (labels[name] || name) + '</span>').appendTo(container).hide().fadeIn(160);
        } else if(!enabled) {
            token.fadeOut(160, function() { token.remove(); });
        }
    };

    sgs.animation.Judge_Card = function(player, card) {
        var anchor = player_anchor(player),
            judge = $('<div class="judge_effect"><span>判定</span><img src="' +
                card_image(card) + '" /></div>');
        judge.appendTo(document.body).css({
            left: anchor.left - 47,
            top: anchor.top - 66,
            opacity: 0
        }).animate({ opacity: 1, top: anchor.top - 86 }, 180)
          .delay(650).animate({ opacity: 0 }, 220, function() { judge.remove(); });
    };

    sgs.animation.Show_Card = function(player, card) {
        var anchor = player_anchor(player),
            shown = $('<div class="show_card_effect"><span>展示</span><img src="' +
                card_image(card) + '" /></div>');
        shown.appendTo(document.body).css({
            left: anchor.left - 47,
            top: anchor.top - 66,
            opacity: 0
        }).animate({ opacity: 1 }, 160)
          .delay(650).animate({ opacity: 0 }, 220, function() { shown.remove(); });
    };
    
    /* 装备装备动画 */
    sgs.animation.Equip_Equipment = function(player, card) {
        var type = sgs.EQUIP_TYPE_MAPPING[card.name],
            playerDom = sgs.view.playerElement(player),
            cardDom = sgs.view.cardElement(card);
        if(player == sgs.view.playerFor($('#player')[0])) {
            drag_out(card);
            $(cardDom).animate({
                left: $('#attack').offset().left + ($('#attack').width() - $(cardDom).width()) / 2,
                top: $('#player').offset().top + ($('#player').height() - $(cardDom).height()) / 2,
            }, 500).animate({
                opacity: 0
            }, 200, function() {
                remove_card_dom(cardDom);
            });
            
            var equip_id = type == 0 ? '#attack' : (type == 1 ? '#defend' : (type == 2 ? '#attack_horse' : '#defend_horse')),
                equip_img = $(['<div class="equip_box">',
                                    '<img class="equip_border" src="img/generals/equipment/border.png" />',
                                    '<img class="equip_img" src="', sgs.EQUIP_IMG_MAPPING[card.name], '" />',
                                    '<img class="equip_pattern" src="', sgs.PATTERN_IMG_MAPPING[card.color], '" />',
                                    '<span class="equip_num" style="color:', sgs.CARD_COLOR_NUM_MAPPING.color[card.color], ';">',
                                        sgs.CARD_COLOR_NUM_MAPPING.number[card.digit],'</span>',
                                '</div>',
                                '<div class="equip_back"></div>'
                            ].join(''));
            $(equip_id).html(equip_img);
            sgs.animation.Arrange_Card();
        } else {
            var cardJqObj = $('<img src="' + sgs.CARDIMAG_MAPING[card.name] + '" />');
            cardJqObj.appendTo($(document.body));
            cardJqObj.css({
                position: 'absolute',
                width: sgs.interface.cardInfo.width + 'px',
                height: sgs.interface.cardInfo.height + 'px',
                left: ($(playerDom).offset().left - 60) + 'px',
                top: ($(playerDom).offset().top - 30) + 'px'
            });
            cardJqObj.animate({
                left: ($(playerDom).offset().left + 20) + 'px',
                top: ($(playerDom).offset().top + 10) + 'px'
            }, 500).animate({
                opacity: 0
            }, 200, function() { cardJqObj.remove(); });
            
            var equip_id = type == 0 ? '.attack' : (type == 1 ? '.defend' : (type == 2 ? '.attack_horse' : '.defend_horse')),
                characher_mapping = sgs.NUMBER_CHARACHER_MAPPING,
                number_mapping = sgs.CARD_COLOR_NUM_MAPPING.number,
                pattern_img = sgs.PATTERN_IMG_MAPPING;
            $(playerDom).find(equip_id).html(['<img src="',
                    sgs.EQUIP_ICON_MAPPING[type], '" style="width:13px; height:13px; position:absolute; left:0;" /><font style="position:absolute; left:18px;">',
                    type == 2 ? '+1' : (type == 3 ? '-1' : characher_mapping[sgs.EQUIP_RANGE_MAPPING[card.name]]), '</font><font>',
                    card.name, '</font><font style="position:absolute; right:18px; line-height:15px;">',
                    number_mapping[card.digit], '</font><img src="',
                    pattern_img[type], '" style="width:11px; height:11px; position:absolute; top:1px; right:2px;"/>'
                ].join(''));
            $(playerDom).find('.card_count span').text(($(playerDom).find('.card_count span').text() | 0) - 1);
        }
        play_sound(sgs.SOUND_FILE_MAPPING.equipment[type]);
    };

    sgs.animation.Remove_Equipment = function(player, card, type) {
        var playerDom = sgs.view.playerElement(player);
        if(player == sgs.view.playerFor($('#player')[0])) {
            var equipId = type == 0 ? '#attack' : (type == 1 ? '#defend' : (type == 2 ? '#attack_horse' : '#defend_horse'));
            $(equipId).children().fadeOut(160, function() { $(this).remove(); });
        } else {
            var equipClass = type == 0 ? '.attack' : (type == 1 ? '.defend' : (type == 2 ? '.attack_horse' : '.defend_horse'));
            $(playerDom).find(equipClass).empty();
        }
        show_discard(card, playerDom);
    };
    
    /* 整理牌 */
    sgs.animation.Arrange_Card = function (cards) {
        cards = cards == undefined ? sgs.view.playerFor($('#player')[0]).card : cards;
        var cc = cards.length;
        $(cards).each(function (i, d) {
            var cardDom = sgs.view.cardElement(d);
            if(!cardDom)
                return true;
            if (cardDom.parentNode == document.body)
                return true;
            var left;
            if (cc * cardInfo.width < $('#cards').width())
                left = cardInfo.width * i;
            else
                left = ($('#cards').width() - cardInfo.width) / (cc - 1) * i;
            $(cardDom).animate({ left: left }, 'normal');
        });
    };
    
    /* 显示技能解释 */
    sgs.animation.Skill_Explanation = function(name, isHero, clientX, clientY) {
        /*
         * name      - 技能（或英雄）名称
         * isHero    - 是否为英雄
         */
        var hero_prop = sgs.interface.HERO_PROPERTY_MAPPING,
            skill_exp = sgs.SKILL_EXPLANATION_MAPPING,
            skill_status = sgs.SKILL_IMPLEMENTATION_STATUS || {},
            status_label = {
                "missing": '<font style="color:#ff8a80;">[规则未实现]</font> ',
                "partial": '<font style="color:#ffd180;">[部分实现]</font> '
            },
            explanation = '',
            targetLeft = (clientX + $('#explanation').width()) > $(window).width() ?
                        clientX - $('#explanation').width() : clientX,
            targetTop = (clientY + $('#explanation').height()) > $(window).height() ?
                        clientY - $('#explanation').height() : clientY;
            
        if(isHero) {
            var skills = hero_prop[name].skill;
            $(skills).each(function(i, d) {
                explanation += [
                    '<font style="font-weight:bold; color:#65ffcc;">', d, '</font>: ',
                    status_label[skill_status[d]] || '', skill_exp[d],
                    i + 1 == skills.length ? '' : '<br /><br />'
                ].join('');
            });
        } else {
            explanation = [
                '<font style="font-weight:bold; color:#65ffcc;">', name, '</font>: ',
                status_label[skill_status[name]] || '', skill_exp[name]
            ].join('');
        }
        explanation = explanation.replace('★', '<br />★');
        $('#explanation').html(explanation);
        $('#explanation').css({
            left: targetLeft,
            top: targetTop
        });
    };
    
    /* 出牌剩余时间动画 javascript:sgs.animation.Time_Last(true, 5, 2) */
    sgs.animation.Time_Last = function(isComp, seconds, comp_num) {
        if(!isComp) {
            $('#player_progress').width('296px');
            $('#player_progress_bar').css({ display: 'block', opacity: 1 });
            $('#player_progress').animate({
                width: 0
            }, (seconds || 15) * 1000, function() {
                $('#player_progress_bar').animate({
                    opacity: 0
                }, 200);
            });
        } else {
            var comp_id = "#role" + comp_num;
            $(comp_id).find('.role_progress').width('123px');
            $(comp_id).find('.role_progress_bar').css({ display: 'block', opacity: 1 });
            $(comp_id).find('.role_progress').animate({
                width: 0
            }, (seconds || 15) * 1000, function() {
                $(comp_id).find('.role_progress_bar').animate({
                    opacity: 0
                }, 200);
            });
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
        if(playerDom == $('#player')[0]) {
            $('#player_blod_1').html(bloodImgs);
        } else {
            $(playerDom).find('.blods_1').html(bloodImgs);
        }
    };

    sgs.animation.Get_Damage = function(player) {
        var left_num,
            top_num,
            targetLeft,
            targetTop,
            playerDom = sgs.view.playerElement(player),
            damage_img = $('<img src="img/system/damage.png" />');
        damage_img.appendTo($(document.body));
        var damage_img_width = damage_img.width(),
            damage_img_height = damage_img.height();
        if(playerDom != $('#player')[0]) {
            left_num = parseInt($(playerDom).css('left'));
            top_num = parseInt($(playerDom).css('top'));
            targetLeft = $(playerDom).offset().left + ($(playerDom).width() - damage_img_width) / 2;
            targetTop = $(playerDom).offset().top + ($(playerDom).height() - damage_img_height) / 2;
            $(playerDom).animate({/* 震动 */
                left: left_num - 10,
                top: top_num + 10,
            }, 50).animate({
                left: left_num,
                top: top_num,
            }, 50);
        } else {
            left_num = parseInt($('#player_head').css('right'));
            top_num = parseInt($('#player_head').css('top'));
            targetLeft = $('#player_head').offset().left + ($('#player_head').width() - damage_img_width) / 2;
            targetTop = $('#player_head').offset().top + ($('#player_head').height() - damage_img_height) / 2;
            $('#player_head').animate({/* 震动 */
                right: left_num + 10,
                top: top_num + 10,
            }, 100).animate({
                right: left_num,
                top: top_num,
            }, 100);
        }
        damage_img.css({
            position: 'absolute',
            left: targetLeft,
            top: targetTop,
            width: damage_img_width,
        });
        setTimeout(function() {
            damage_img.animate({ opacity: 0 }, 100, function() { damage_img.remove(); });
        }, 1000);
        sgs.animation.Refresh_Blood(player);
        play_sound(sgs.SOUND_FILE_MAPPING.damage.common);
    };

    sgs.animation.Player_Death = function(player) {
        var dead_image = sgs.DEAD_IDENTITY_MAPPING[player.identity],
            playerElement = sgs.view.playerElement(player),
            player_dom = $(playerElement);
        if(!dead_image) {
            return;
        }
        if(playerElement == $('#player')[0]) {
            $('#player_identity img').attr('src', dead_image);
            $('#player_head_img').css('filter', 'grayscale(1)');
            $('#player_cover').css('display', 'block');
        } else {
            player_dom.find('.role_identity img').attr('src', dead_image);
            player_dom.find('.head_img img').css('filter', 'grayscale(1)');
            player_dom.find('.role_cover').css('display', 'block');
        }
    };
    
})(sgs);
