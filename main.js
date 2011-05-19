var sgs = sgs || {};

(function (sgs) {
    sgs.interface = sgs.interface || {};

    sgs.interface.CARD_COLOR = sgs.interface.CARD_COLOR || {
        pattern: ["♦", "♥", "♣", "♠"],
        color: ["red", "red", "black", "black"],
        number: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
    };
    var CARD_COLOR = sgs.interface.CARD_COLOR;

    sgs.interface.cardInfo = sgs.interface.cardInfo || {
        /*
        *      牌信息
        *
        * width       - 牌宽度
        * height      - 牌高度
        * out         - 选中时突出的高度
        */
        width: 95,
        height: 133,
        out: 20
    };
    var cardInfo = sgs.interface.cardInfo;

    sgs.interface.playerState = sgs.interface.playerState || {
        /*
        *      玩家状态
        *
        * width       - 牌宽度
        * height      - 牌高度
        * out         - 选中时突出的高度
        */
        stage: 1,
        weapons: [],
        cards: [],
        selectedCards: [],
        blod: 0
    };
    var playerState = sgs.interface.playerState;

    sgs.interface.NewCard = function (o) {
        /*
        *      构造牌对象
        *
        * jqObj        - jQuery对象
        * name         - 名称
        * type         - 类型
        * pattern        - 花色
        * num          - 数值
        * selected     - 是否选中
        */
        return {
            jqObj: o.jqObj != undefined ? o.jqObj : null,
            name: o.name != undefined ? o.name : '',
            type: o.type != undefined ? o.type : '',
            pattern: o.pattern != undefined ? o.pattern : '',
            num: o.num != undefined ? o.num : '',
            selected: false
        };
    };
    var NewCard = sgs.interface.NewCard;

    /* 浏览器改变大小 */
    sgs.interface.BrowserResize = function (e) {
        var des = $(window).height() - $('#main').height();

        $('#main').css('margin-top', des > 0 ? (des < 80 ? des / 4 : cardInfo.out) : 0);
        if ($('#chose_role').css('display') == 'block') {

        }
    };

    /* 操作 */
    sgs.interface = sgs.interface || {};

    /* 发牌 */
    sgs.interface.Deal = function (isPlayer, cards) {
        if(!isPlayer) {
            
            return;
        }
        $(cards).each(function(i, d) {
            var pattern = d.color,
                patternStr = CARD_COLOR.pattern[pattern],
                color = CARD_COLOR.color[pattern],
                num = d.digit,
                numStr = CARD_COLOR.number[num];
            img = $(['<div class="player_card"><img src="img/generals/card/',
                        sgs.CARDIMAG_MAPING[d.name], '" /><div class="pat_num" style="color:',
                        color, ';"><span class="pattern">',
                        patternStr, '</span><span class="num">',
                        numStr, '</span></div><div class="select_unable"></div></div>'].join('')),
                left = $('#cards_last').offset().left,
                top = $('#cards_last').offset().top;

            img.appendTo($(document.body));
            img.css({ left: left, top: top });
            img.css('position', 'absolute');
            img.find('.select_unable').css('display', i % 2 ? 'block' : 'none');
            playerState.cards.push(NewCard({
                jqObj: img,
                pattern: pattern,
                num: num
            }));
        });

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
            }, 'fast', function () {
                d.jqObj.appendTo($('#cards'));
                d.jqObj.css('left', tempL);
                d.jqObj.css('top', 'auto');
                d.jqObj.css('bottom', 0);
                /* 绑定事件 */
                d.jqObj.click(CardClickFn);
            });
        });
    };

    /* 整理牌 */
    sgs.interface.ArrangeCard = function () {
        var cc = playerState.cards.length;

        $(playerState.cards).each(function (i, d) {
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

    /* 选牌 */
    CardClickFn = function (e) {
        if ($(this).find('.select_unable').css('display') == 'block')
            return false;
        if (playerState.stage == 1) {
            playerState.selectedCards.splice(0, playerState.selectedCards.length);
            if ($(this).css('bottom') == cardInfo.out + 'px') {
                $(this).css('bottom', 0);
            } else {
                $('#cards .player_card').each(function (i, d) {
                    if ($(d).css('bottom') == cardInfo.out + 'px') {
                        $(d).css('bottom', 0);
                        return false;
                    }
                });
                $(this).css('bottom', cardInfo.out);
                playerState.selectedCards.push(NewCard({ jqObj: $(this) }));
            }
        } else if (playerState.stage == 2) {
            if (playerState.selectedCards.length == playerState.cards.length - playerState.blod && $(this).css('bottom') != (cardInfo.out + 'px')) /* 所选牌数够了并且所点击的牌没有被选中 */
                return false;
            else if ($(this).css('bottom') == (cardInfo.out + 'px')) {
                $(this).css('bottom', 0);
            } else if ($(this).css('bottom') != (cardInfo.out + 'px')) {
                $(this).css('bottom', (cardInfo.out + 'px'));
            }

            playerState.selectedCards.splice(0, playerState.selectedCards.length);
            $('#cards .player_card').each(function (i, d) {
                if ($(d).css('bottom') == (cardInfo.out + 'px'))
                    playerState.selectedCards.push(NewCard({ jqObj: $(d) }));
            });
        }
    };

    /* 出牌(点击确定) */
    sgs.interface.OkClick = function (e) {
        console.log('click');
        if (playerState.selectedCards.length == 0)
            return false;
        /* 从用户牌堆中删除打出去的牌 */
        $(playerState.selectedCards).each(function (i, d) {
            $(playerState.cards).each(function (ii, dd) {
                if (d.jqObj[0] == dd.jqObj[0]) {
                    playerState.cards.splice(ii, 1);
                    return false;
                }
            });
        });

        var thisFn = arguments.callee;
        $('#ok').unbind('click', thisFn);
        /* 将选牌从DOM中抽出（方便牌整理） */
        $(playerState.selectedCards).each(function (i, d) {
            var temp = playerState.selectedCards[i].jqObj;
            left = temp.offset().left;
            top = temp.offset().top;

            playerState.selectedCards[i].jqObj.remove();
            temp.appendTo($(document.body));
            temp.css({ left: left, top: top });
            temp.css('position', 'absolute');
        });

        /* 记录选牌数（判断所有动画结束） */
        var cardLength = playerState.selectedCards.length;
        /* 动画 */
        $(playerState.selectedCards).each(function (i, d) {
            var temp = playerState.selectedCards[i].jqObj,
                targetL,
                targetT;

            if (playerState.stage == 1) {
                targetL = $('#cards').offset().left - 128;
                targetT = $('#cards').offset().top - 20;
            } else if (playerState.stage == 2) {
                targetL = $('#gameinfo').offset().left + ($('#gameinfo').width() - cardInfo.width) / 2;
                targetT = $('#gameinfo').offset().top;
            }

            /* 出牌动画 */
            temp.animate({
                left: targetL,
                top: targetT,
                bottom: 0,
                opacity: 0.5
            }, 'normal', function () {
                temp.animate({ opacity: 0 }, 100, function () {
                    if (cardLength == i + 1) {
                        temp.remove();
                        var ran = Math.random,
                            pattern = parseInt(ran() * 4),
                            patternStr = CARD_COLOR.pattern[pattern],
                            num = parseInt(ran() * 13),
                            numStr = CARD_COLOR.number[num],
                            color = CARD_COLOR.color[num],
                            img = $('<div class="img_box"><img src="img/generals/card/crossbow.png" style="width:100%; height:100%;" /></div>');

                        img.appendTo($('#attack .equip_name'));
                        img.css('position', 'relative').css('top', '-13px').css('left', '-35px');
                        $('#ok').click(thisFn);
                    }
                    /* 装备武器等 */
                });
            });

            /* 整理牌 */
            sgs.interface.ArrangeCard();
        });

        /* 清除选牌列表 */
        playerState.selectedCards.splice(0, playerState.selectedCards.length);
    };

})(window.sgs);