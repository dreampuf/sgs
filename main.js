var sgs = sgs || {};

(function (sgs) {
    sgs.interface = sgs.interface || {};
    
    sgs.interface.CARD_COLOR = {
        color: ["red", "red", "black", "black"],
        number: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
    };
    var CARD_COLOR = sgs.interface.CARD_COLOR;
    
    sgs.interface.IDENTITY_INDEX = {
        "name": [  "主公", "忠臣", "内奸", "反贼" ]
    };

    sgs.interface.cardInfo = {
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

    sgs.interface.playerState = {
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

    /* 发牌 */
    sgs.interface.Deal = function (isPlayer, cards, role_id) {
        if(!isPlayer) {
            var len = cards.length,
                role_id_str = '#role' + role_id;
            $(cards).each(function(i, d) {
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
                }, 500, function() {
                    img.animate({ opacity: 0 }, 'slow', function() { img.remove(); });
                });
            });
            return;
        }
        $(cards).each(function(i, d) {
            var pattern = d.color,
                color = CARD_COLOR.color[pattern],
                num = d.digit,
                numStr = CARD_COLOR.number[num],
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
            }, 500, function () {
                d.jqObj.appendTo($('#cards'));
                d.jqObj.css('left', tempL);
                d.jqObj.css('top', 'auto');
                d.jqObj.css('bottom', 0);
                /* 绑定事件 */
                d.jqObj.click(CardClickFn);
            });
        });
    };

    /* 选牌 */
    CardClickFn = function (e) {
        if ($(this).find('.select_unable').css('display') == 'block')
            return false;
        if (playerState.stage == 1) {
            playerState.selectedCards.splice(0, playerState.selectedCards.length);
            if ($(this).css('bottom') == cardInfo.out + 'px') {
                $(this).animate({ 'bottom': 0 }, 100);
            } else {
                $('#cards .player_card').each(function (i, d) {
                    if ($(d).css('bottom') == cardInfo.out + 'px') {
                        $(this).animate({ 'bottom': 0 }, 100);
                        return false;
                    }
                });
                $(this).animate({ 'bottom': cardInfo.out }, 100);
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
            var temp = playerState.selectedCards[i].jqObj,
                left = temp.offset().left,
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
                        /* 装备装备 */
                        var ran = Math.random,
                            pattern = parseInt(ran() * 4),
                            num = parseInt(ran() * 13),
                            numStr = CARD_COLOR.number[num],
                            color = CARD_COLOR.color[num],
                            img = $(['<div class="equip_box"><img src="img/generals/weapons/border.png" style="left:0; width:142px; height:25px;" /><img src="img/generals/weapons/',
                                    'axe.png', '" style="position:absolute; left:0; width:137px; height:21px; margin:2px;" />',
                                    '<img src="img/pattern_',
                                    pattern, '.png" style="right:23px; position:absolute; height:13px; top:5px;" /><span style="right:3px; width:20px; position:absolute; font-weight:bold; top:2px; color:#111;">',
                                    numStr, '</span></div><div class="equip_back"></div>'
                                ].join(''));

                        if(pattern == 0) {
                            $('#attack').append(img);
                        } else if(pattern == 1) {
                            $('#defend').append(img);
                        } else if(pattern == 2) {
                            $('#attack_horse').append(img);
                        } else if(pattern == 3) {
                            $('#defend_horse').append(img);
                        }
                        img.click(function() {
                            $(this).animate({ left: $(this).css('left') == '10px' ? '0px' : '10px' }, 100, function(){})
                        });
                        
                        $('#ok').click(thisFn);
                    }
                });
            });

            /* 整理牌 */
            sgs.interface.ArrangeCard();
        });

        /* 清除选牌列表 */
        playerState.selectedCards.splice(0, playerState.selectedCards.length);
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

    /* 浏览器改变大小 */
    sgs.interface.BrowserResize = function (e) {
        var des = $(window).height() - $('#main').height();

        $('#main').css('margin-top', des > 0 ? (des < 80 ? des / 4 : cardInfo.out) : 0);
        if ($('#chose_role').css('display') == 'block') {

        }
    };

})(window.sgs);
