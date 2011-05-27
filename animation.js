var sgs = sgs || {};

(function() {

    sgs.animation = sgs.animation || {};
    
    var cardInfo = sgs.interface.cardInfo;
    
    /* 将牌放置到牌堆位置 */
    var get_card = function(cards) {
        $(cards).each(function(i, d) {
            var pattern = d.color,
                color = sgs.interface.CARD_COLOR_NUM_MAPPING.color[pattern],
                num = d.digit,
                numStr = sgs.interface.CARD_COLOR_NUM_MAPPING.number[num],
                img = $(['<div class="player_card"><img src="img/generals/card/',
                        sgs.CARDIMAG_MAPING[d.name], '" /><div class="pat_num" style="color:',
                        color, ';"><span class="pattern"><img src="img/pattern_',
                        pattern, '.png" /></span><span class="num">',
                        numStr, '</span></div><div class="select_unable"></div></div>'].join('')),
                left = $('#cards_last').offset().left,
                top = $('#cards_last').offset().top;
            
            img.appendTo($(document.body));
            img.css({ left: left, top: top });
            img.css('position', 'absolute');
            img[0].card = d;
            d.dom = img[0];
        });
    };
    
    /* 将选牌从DOM中抽出（方便牌整理） */
    var drag_out = function(cards) {
        $(cards).each(function (i, d) {
            var temp = $(this.dom),
                left = temp.offset().left,
                top = temp.offset().top;

            temp.remove();
            temp.appendTo($(document.body));
            temp.css({ left: left, top: top });
            temp.css('position', 'absolute');
        });
    };
    
    /* 选牌 */
    sgs.animation.Select_Card = function (cardDom) {
        var cardOut = cardInfo.out,
            selected = $(cardDom).css('bottom') == cardOut + 'px' ? true : false;
        $('#cards').find('.player_card').each(function() {
            if(this == cardDom) {
                if(selected) {
                    $(cardDom).animate({ 'bottom': '0px' }, 100);
                    cardDom.card.selected = false;
                    /* 设置玩家为可选状态 */
                    $('.role .role_cover').each(function(i, d) {
                        $(this).css('display', 'none');
                    });
                } else {
                    cardDom.card.selected = true;
                    $(cardDom).animate({ 'bottom': cardOut + 'px' }, 100);
                }
            } else {
                this.card.selected = false;
                $(this).animate({ 'bottom': '0px' }, 100);
            }
        });
        
        if(selected)
            return;
        
        var selectCard,
            player = $('#player')[0].player;
        $.each(player.card, function(i, d) {
            if(d == cardDom.card) {
                selectCard = d;
                return false;
            }
        });
        
        player.targets = sgs.interface.bout.select_card(new sgs.Operate(selectCard.name, player, undefined, selectCard));
        player.targets.selected = [];
        $('.role .role_cover').each(function(i, d) {
            $(d).css('display', 'block');
        });
        $.each(player.targets[0], function(i, d) {
            $('.role').each(function(ii, dd) {
                if(d.nickname == dd.player.nickname) {
                    $(dd).find('.role_cover').css('display', 'none');
                }
            });
        });
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
            var img = $('<img src="img/card_back.png" style="width:93px; height:131px" />');
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
    sgs.animation.Deal_Player = function() {
        get_card($('#player')[0].player.card);
        
        var cc = $('#player')[0].player.card.length;
        $.each($('#player')[0].player.card, function (i, d) {
            if (d.dom.parentNode != document.body)
                return true;

            var tempL = cc * cardInfo.width < $('#cards').width() ? cardInfo.width * i : ($('#cards').width() - cardInfo.width) / (cc - 1) * i,
                targetL = $('#cards').offset().left + tempL,
                targetT = $('#cards').offset().top;

            $(d.dom).animate({
                left: targetL,
                top: targetT
            }, 500, function () {
                $(d.dom).appendTo($('#cards'));
                $(d.dom).css('left', tempL);
                $(d.dom).css('top', 'auto');
                $(d.dom).css('bottom', 0);
                
                /*var isDrag = false,
                    mouse_left,
                    mouse_top,
                    first_left,
                    first_top;
                $(d.dom).mousedown(function(e) {
                    isDrag = true;
                    mouse_left = e.clientX;
                    mouse_top = e.clientY;
                    first_left = $(this).offset().left - $('#cards').offset().left - 1;
                    first_top = $(this).offset().top - $('#cards').offset().top - 1;
                    
                }).mousemove(function(e) {
                    if(isDrag) {
                        $(this).css({
                            cursor: 'pointer',
                            left: e.clientX - mouse_left + first_left,
                            top: e.clientY - mouse_top + first_top
                        });
                    }
                }).mouseup(function(e) {
                    isDrag = false;
                    $(this).animate({
                        left: first_left,
                        top: first_top
                    }, 500);
                });*/
            });
        });
    };
    
    /* 装备装备动画 */
    sgs.animation.Equip_Equipment = function(card) {
        var left = $('#cards').offset().left - 128,
            top = $('#cards').offset().top - 20;
        card.jqObj.animate({
            left: targetL,
            top: targetT,
            bottom: 0,
            opacity: 0.5
        }, 'normal', function () {
            card.jqObj[0].remove();
        });
    };
    
    /* 整理牌 */
    sgs.animation.Arrange_Card = function (cards) {
        var cc = cards.length;
        $(cards).each(function (i, d) {
            if (d.jqObj[0].parentNode == document.body)
                return true;
            var left;
            if (cc * cardInfo.width < $('#cards').width())
                left = cardInfo.width * i;
            else
                left = ($('#cards').width() - cardInfo.width) / (cc - 1) * i;
            d.jqObj.animate({ left: left }, 'normal');
        });
    };
    
    /* 显示技能解释 */
    sgs.animation.Skill_Explanation = function(name, isHero, clientX, clientY) {
        /*
         * name      - 技能（或英雄）名称
         * isHero    - 是否为英雄
         */
        var hero_prop = sgs.interface.HERO_PROPERTY_MAPPING;
            skill_exp = sgs.interface.SKILL_EXPLANATION_MAPPING;
            explanation = '',
            targetLeft = (clientX + $('#explanation').width()) > $(window).width() ?
                        clientX - $('#explanation').width() : clientX,
            targetTop = (clientY + $('#explanation').height()) > $(window).height() ?
                        clientY - $('#explanation').height() : clientY;
            
        if(isHero) {
            var skills = hero_prop[name].skill;
            $(skills).each(function(i, d) {
                explanation += [
                    '<font style="font-weight:bold;">', d, '</font>: ', skill_exp[d],
                    i + 1 == skills.length ? '' : '<br /><br />'
                ].join('');
            });
        } else {
            explanation = ['<font style="font-weight:bold;">', name, '</font>: ', skill_exp[name]].join('');
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
    
    /* 掉血动画 javascript:sgs.animation.Get_Damage(true, '_aaa_') */
    sgs.animation.Get_Damage = function(isComp, nickname) {
        if(isComp) {
            $('.role').each(function(i, d) {
                if($(this).find('.role_name').text() == nickname) {
                    var leftNum = parseInt($(this).css('left'));
                    $(this).animate({ left: leftNum - 3 }, 50).animate({ left: leftNum }, 50);
                    $(this).find('.blods_1 img').last().remove();
                }
            });
        } else {
            
        }
    }
    
})(sgs);