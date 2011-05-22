var sgs = sgs || {};

(function() {

    sgs.animation = sgs.animation || {};
    
    var playerState = sgs.interface.playerState,
        cardInfo = sgs.interface.cardInfo;
    
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
            playerState.cards.push(new sgs.interface.Card(img, pattern, num ));
        });
    };
    
    /* 将选牌从DOM中抽出（方便牌整理） */
    var drag_out = function(cards) {
        $(cards).each(function (i, d) {
            var temp = this.jqObj,
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
            cssVal = $(cardDom).css('bottom') == cardOut + 'px' ? '0px' : cardOut + 'px';
        $(cardDom).animate({ 'bottom': cssVal }, 100);
    };
    
    /* 从牌堆中删除部分牌 */
    sgs.animation.Del_Out = function(card_stack, del_cards) {
        $(del_cards).each(function (i, d) {
            $(card_stack).each(function (ii, dd) {
                if (d.jqObj[0] == dd.jqObj[0]) {
                    card_stack.splice(ii, 1);
                    return false;
                }
            });
        });
    };
    
    /* 给电脑发牌 */
    sgs.animation.Deal_Comp = function(card_count, role_id) {
        var role_id_str = '#role' + role_id;
        for(var i = 0; i < card_count; i++) {
            var img = $('<img src="img/card_back.png" style="width:93px; height:131px" />');
            img.appendTo(document.body);
            img.css({
                position: 'absolute',
                left: $('#cards_last').offset().left + 8,
                top: $('#cards_last').offset().top
            });
            img.animate({
                left: $(role_id_str).offset().left + (i + 1) * 10,
                top: $(role_id_str).offset().top + 10,
                opacity: 0.8
            }, 500, (function(img){
                return function() {
                    $(role_id_str).find('.card_count span').text(parseInt($(role_id_str).find('.card_count span').text()) + 1);
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
        $(playerState.cards).each(function (i, d) {
            if (d.jqObj[0].parentNode != document.body)
                return true;

            var cc = playerState.cards.length,
                tempL = cc * cardInfo.width < $('#cards').width() ? cardInfo.width * i : ($('#cards').width() - cardInfo.width) / (cc - 1) * i,
                targetL = $('#cards').offset().left + tempL,
                targetT = $('#cards').offset().top;

            d.jqObj.animate({
                left: targetL,
                top: targetT
            }, 500, function () {
                d.jqObj.appendTo($('#cards'));
                d.jqObj.css('left', tempL);
                d.jqObj.css('top', 'auto');
                d.jqObj.css('bottom', 0);
                /* 绑定事件 */
                d.jqObj.click(function(e) { sgs.animation.Select_Card(d.jqObj[0]); });
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
    
    /* 出牌剩余时间动画 test: javascript:sgs.animation.Time_Last(true, 5, 2) */
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
    
})(sgs);