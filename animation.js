var sgs = sgs || {};

(function() {

    sgs.animation = sgs.animation || {};
    
    var cardInfo = sgs.interface.cardInfo;
    
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
            img[0].card = d;
            d.dom = img[0];
            d.selected = false;
        });
    };
    
    /* 将选牌从DOM中抽出（方便牌整理） */
    var drag_out = function(cards) {
        cards = cards instanceof Array ? cards : [cards];
        $(cards).each(function (i, d) {
            var temp = $(d.dom),
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
        $('#sound')[0].src = src;
        $('#sound')[0].play();
    };
    
    /* 刷新自己血量 */
    var refresh_blood = function() {
        var player = $('#player')[0].player;
            blood_imgs = '';
        for(var i = 0; i < player.blood; i++)
            blood_imgs += '<img src="img/system/blod_1.png" />';
        $('#player_blod_1').html(blood_imgs);
    };
    
    /* 选牌 */
    sgs.animation.Select_Card = function (e) {
        if(this.onDrag)
            return;
        
        var cardDom = this,
            cardOut = cardInfo.out,
            player = $('#player')[0].player;
        
        switch(player.stage) {
            case -1:
                $('.player_card').each(function(i, d) {
                    if(d == cardDom) {
                        $(d).animate({ 'top': (d.card.selected ? 0 : -cardOut) }, 100);
                        $('#ok').css('display', d.card.selected ? 'none' : 'block');
                        d.card.selected = !d.card.selected;
                    } else {
                        $(d).animate({ 'top': 0 }, 100);
                        d.card.selected = false;
                    }
                });
                break;
            
            case 2:/* 出牌阶段 */
                $('.player_card').each(function(i, d) { /* 设置卡牌选中状态与玩家选中状态 */
                    if(d == cardDom) {
                        if(cardDom.card.selected) { /* 卡牌已被选中时则取消选中 */
                            $(cardDom).animate({ 'top': '0px' }, 100);
                            cardDom.card.selected = false;
                            player.targets = [];
                            /* 设置玩家为可选状态 */
                            $('.role').each(function(i, d) {
                                $(d).find('.role_cover').css('display', 'none');
                                if(d.player.selected) {
                                    $(d).css({
                                        'box-shadow': '2px 2px 2px #000',
                                        left: parseInt($(d).css('left')),
                                        top: parseInt($(d).css('top')),
                                    });
                                    d.player.selected = false;
                                }
                            });
                            $('#ok').css('display', 'none');/* 隐藏确定按钮 */
                        } else { /* 卡牌没有被选中时 */
                            cardDom.card.selected = true;
                            $(cardDom).animate({ 'top': -cardOut + 'px' }, 100);
                        }
                    } else {
                        d.card.selected = false;
                        $(d).animate({ 'top': 0 }, 100);
                    }
                });
                var selectCard = cardDom.card;
                player.targets = sgs.interface.bout.select_card(new sgs.Operate(selectCard.name, player, undefined, selectCard));
                $('.role .role_cover').each(function(i, d) {/* 设置目标可选状态 */
                    $(d).css('display', 'block');
                });
                $.each(player.targets[0], function(i, d) {
                    $('.role').each(function(ii, dd) {
                        if(d.nickname == dd.player.nickname) {
                            $(dd).find('.role_cover').css('display', 'none');
                        }
                    });
                });
                if(player.targets[0][0] == $('#player')[0].player)/* 如果是对自己使用的卡牌则激活“确定”按钮 */
                    $('#ok').css('display', 'block');
                break;
            
            case 3:/* 弃牌阶段 */
                if(cardDom.card.selected) {
                    $(cardDom).animate({ 'top': 0 }, 100);
                    cardDom.card.selected = false;
                    player.last_select_count++;
                } else {
                    if(player.last_select_count == 0)
                        return;
                    $(cardDom).animate({ 'top': -cardOut + 'px' }, 100);
                    cardDom.card.selected = true;
                    player.last_select_count--;
                }
                if(player.last_select_count == 0)
                    $('#ok').css('display', 'block');
                break;
        }
    };
    
    /* 拖动 */
    /*
     * 用判断mousemove时鼠标是否按下来判断是否为拖动
     * 1. mousedown           card.dom
     *   鼠判断是否处于拖动状态(包括返回动画):
     *   - 是则不作任何操作;
     *   - 不是处于拖动状态则设置dom的mousedown属性为true;
     * 2. mousemove           document.body
     *   判断鼠标是否按下:
     *   - 不是则不作任何操作;
     *   - 是按下的则执行拖动;
     * 3. mouseup             card.dom
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
            player_dom = player.dom;
        
        img = $('<img src="' + sgs.EFFECT_IMG_MAPPING[name] + '" />');
        img2 = $('<img src="' + sgs.EFFECT_IMG_MAPPING[name] + '" />');
        img.appendTo(document.body);
        targetLeft = $(player_dom).offset().left + ($(player_dom).width() - img.width()) / 2;
        if(player.dom == $('#player')[0]) 
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
                if (d.dom == dd.dom) {
                    card_stack.splice(ii, 1);
                    return false;
                }
            });
        });
    };
    
    /* 给电脑发牌 */
    sgs.animation.Deal_Comp = function(card_count, player) {
        for(var i = 0; i < card_count; i++) {
            var img = $('<img src="img/system/card_back.png" style="width:93px; height:131px" />');
            img.appendTo(document.body);
            img.css({
                position: 'absolute',
                left: $('#cards_last').offset().left + 8,
                top: $('#cards_last').offset().top
            });
            img.animate({
                left: $(player.dom).offset().left + (i + 1) * 10,
                top: $(player.dom).offset().top + 10,
                opacity: 0.8
            }, 500, (function(img){
                return function() {
                    $(player.dom).find('.card_count span').text(parseInt($(player.dom).find('.card_count span').text()) + 1);
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
        
        var cc = $('#player')[0].player.card.length;
        $.each(cards, function (i, d) {
            if (d.dom.parentNode != document.body)
                return true;

            var tempL,
                targetL,
                targetT = $('#cards').offset().top;
            if(cc * cardInfo.width < $('#cards').width())
                tempL = cardInfo.width * (i + cc - cards.length);
            else
                tempL = ($('#cards').width() - cardInfo.width) / (cc - 1) * (i + cc - cards.length);
            targetL = $('#cards').offset().left + tempL;
            
            $(d.dom).animate({
                left: targetL,
                top: targetT
            }, 500, function () {
                $(d.dom).appendTo($('#cards'));
                $(d.dom).css('left', tempL);
                $(d.dom).css('top', '0');
            });
        });
    };
    
    /* 出牌动画 sgs.animation.Play_Card(sgs.interface.bout.player[1], sgs.interface.bout.player[1].card[0]) */
    sgs.animation.Play_Card = function(player, targets, cards) {
        cards = cards instanceof Array ? cards : [cards];
        var flash = function(dom, name, index) {
            sgs.animation.Card_Flash(player, name); /* 效果动画 */
            play_sound(sgs.SOUND_FILE_MAPPING.card[name][player.hero.gender]); /* 声音 */
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
            $(dom).prependTo($('#played_card_box'));
            $(dom).css({
                left: domLeft - $('#played_card_box').offset().left,
                top: domTop - $('#played_card_box').offset().top,
            });
            $(dom).animate({
                left: -finally_width / 2 + index * (cardInfo.width + 2),
                top: -cardInfo.width / 2,
            }, 300, function() {
                setTimeout(function() {
                    $(dom).animate({
                        opacity: 0,
                    }, 500, function() {
                        if(dom.card != undefined) {
                            delete dom.card.dom;
                            delete dom.card;
                        }
                        $(dom).remove();
                    });
                }, 3000);
            });
        };
        if(player == $('#player')[0].player) {
            drag_out(cards);
            $.each(cards, function(i, d) {
                flash(d.dom, d.name, i);
            });
            sgs.animation.Arrange_Card(player.card);
        } else {
            $.each(cards, function(i, d) {
                var cardImg = $('<img src="' + sgs.CARDIMAG_MAPING[d.name] + '" style="width:93px; height:131px;" />');
                cardImg.appendTo($(document.body));
                cardImg.css({
                    position: 'absolute',
                    left: ($(player.dom).offset().left + 20) + 'px',
                    top: ($(player.dom).offset().top + 10) + 'px',
                });
                flash(cardImg[0], d.name, i);
            });
        }
        $(player.dom).find('.card_count span').text(player.card.length);
    };
    
    /* 装备装备动画 */
    sgs.animation.Equip_Equipment = function(player, card) {
        var type = sgs.EQUIP_TYPE_MAPPING[card.name];
        if(player == $('#player')[0].player) {
            drag_out(card);
            $(card.dom).animate({
                left: $('#attack').offset().left + ($('#attack').width() - $(card.dom).width()) / 2,
                top: $('#player').offset().top + ($('#player').height() - $(card.dom).height()) / 2,
            }, 500).animate({
                opacity: 0
            }, 200, function() { $(card.dom).remove(); });
            
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
                left: ($(player.dom).offset().left - 60) + 'px',
                top: ($(player.dom).offset().top - 30) + 'px'
            });
            cardJqObj.animate({
                left: ($(player.dom).offset().left + 20) + 'px',
                top: ($(player.dom).offset().top + 10) + 'px'
            }, 500).animate({
                opacity: 0
            }, 200, function() { cardJqObj.remove(); });
            
            var equip_id = type == 0 ? '.attack' : (type == 1 ? '.defend' : (type == 2 ? '.attack_horse' : '.defend_horse')),
                characher_mapping = sgs.NUMBER_CHARACHER_MAPPING,
                number_mapping = sgs.CARD_COLOR_NUM_MAPPING.number,
                pattern_img = sgs.PATTERN_IMG_MAPPING;
            console.log(card);
            $(player.dom).find(equip_id).html(['<img src="',
                    sgs.EQUIP_ICON_MAPPING[type], '" style="width:13px; height:13px; position:absolute; left:0;" /><font style="position:absolute; left:18px;">',
                    type == 2 ? '+1' : (type == 3 ? '-1' : characher_mapping[sgs.EQUIP_RANGE_MAPPING[card.name]]), '</font><font>',
                    card.name, '</font><font style="position:absolute; right:18px; line-height:15px;">',
                    number_mapping[card.digit], '</font><img src="',
                    pattern_img[type], '" style="width:11px; height:11px; position:absolute; top:1px; right:2px;"/>'
                ].join(''));
            $(player.dom).find('.card_count span').text(($(player.dom).find('.card_count span').text() | 0) - 1);
        }
        play_sound(sgs.SOUND_FILE_MAPPING.equipment[type]);
    };
    
    /* 整理牌 */
    sgs.animation.Arrange_Card = function (cards) {
        cards = cards == undefined ? $('#player')[0].player.card : cards;
        var cc = cards.length;
        $(cards).each(function (i, d) {
            if (d.dom.parentNode == document.body)
                return true;
            var left;
            if (cc * cardInfo.width < $('#cards').width())
                left = cardInfo.width * i;
            else
                left = ($('#cards').width() - cardInfo.width) / (cc - 1) * i;
            $(d.dom).animate({ left: left }, 'normal');
        });
    };
    
    /* 显示技能解释 */
    sgs.animation.Skill_Explanation = function(name, isHero, clientX, clientY) {
        /*
         * name      - 技能（或英雄）名称
         * isHero    - 是否为英雄
         */
        var hero_prop = sgs.interface.HERO_PROPERTY_MAPPING;
            skill_exp = sgs.SKILL_EXPLANATION_MAPPING;
            explanation = '',
            targetLeft = (clientX + $('#explanation').width()) > $(window).width() ?
                        clientX - $('#explanation').width() : clientX,
            targetTop = (clientY + $('#explanation').height()) > $(window).height() ?
                        clientY - $('#explanation').height() : clientY;
            
        if(isHero) {
            var skills = hero_prop[name].skill;
            $(skills).each(function(i, d) {
                explanation += [
                    '<font style="font-weight:bold; color:#65ffcc;">', d, '</font>: ', skill_exp[d],
                    i + 1 == skills.length ? '' : '<br /><br />'
                ].join('');
            });
        } else {
            explanation = ['<font style="font-weight:bold; color:#65ffcc;">', name, '</font>: ', skill_exp[name]].join('');
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
    sgs.animation.Get_Damage = function(player) {
        var left_num,
            top_num,
            targetLeft,
            targetTop,
            damage_img = $('<img src="img/system/damage.png" />');
        damage_img.appendTo($(document.body));
        var damage_img_width = damage_img.width(),
            damage_img_height = damage_img.height();
        if(player.dom != $('#player')[0]) {
            left_num = parseInt($(player.dom).css('left'));
            top_num = parseInt($(player.dom).css('top'));
            targetLeft = $(player.dom).offset().left + ($(player.dom).width() - damage_img_width) / 2;
            targetTop = $(player.dom).offset().top + ($(player.dom).height() - damage_img_height) / 2;
            $(player.dom).animate({/* 震动 */
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
        $(player.dom).find('.blods_1 img').last().remove();
        play_sound(sgs.SOUND_FILE_MAPPING.damage.common);
        refresh_blood();
    }
    
})(sgs);
