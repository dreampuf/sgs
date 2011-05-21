var sgs = sgs || {};

(function() {

    sgs.animation = sgs.animation || {};
    
    var playerState = sgs.interface.playerState,
        cardInfo = sgs.interface.cardInfo;
    
    /* 将牌放置到牌堆位置 */
    var get_card = function(cards) {
        $(cards).each(function(i, d) {
            var pattern = d.color,
                color = sgs.interface.CARD_COLOR_NUM.color[pattern],
                num = d.digit,
                numStr = sgs.interface.CARD_COLOR_NUM.number[num],
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
            img.find('.select_unable').css('display', i % 2 ? 'block' : 'none');
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
            }, 500, (function(img){ return function() {
                img.animate({ opacity: 0 }, 'slow', function() {
                    img.remove();
                });
            } })(img));
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
    sgs.animation.ArrangeCard = function (cards) {
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
    
})(sgs);