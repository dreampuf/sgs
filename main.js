var sgs = sgs || {};

(function (sgs) {
    sgs.interface = sgs.interface || {};
    sgs.interface.cardinfo = {
        width: 400,   /* 牌宽度 */
        height: 562,  /* 牌高度 */
        out: 35       /* 选中时突出的高度 */
    };

    sgs.interface.PlayerState = sgs.interface.PlayerState || {
        stage: 1,
        weapons: [],
        cards: [],
        selectedCards: [],
        blod: 0
    };

    sgs.interface.structure = sgs.interface.structure || {};

    sgs.interface.structure.NewCard = function (o) {                                   /* 构造Card */
        return {
            jqObj: o.jqObj != undefined ? o.jqObj : null,
            name: o.name != undefined ? o.name : '',
            type: o.type != undefined ? o.type : '',
            pattern: o.pattern != undefined ? o.pattern : '',
            num: o.num != undefined ? o.num : '',
            selected: false
        };
    };

    /* 操作 */
    sgs.interface.operation = sgs.interface.operation || {};

    /* 发牌 */
    sgs.interface.operation.Deal = function() {
        for (var i = 0; i < 3; i++) {
            var ran = Math.random;
            var pattern = parseInt(ran() * 4);
            var num = parseInt(ran() * 13);
            var color;
            var patternStr;
            var numStr;
            switch (pattern) {
                case 0: patternStr = '♦'; color = 'red'; break;
                case 1: patternStr = '♥'; color = 'red'; break;
                case 2: patternStr = '♣'; color = 'black'; break;
                case 3: patternStr = '♠'; color = 'black'; break;
            }
            switch (num) {
                case 0: numStr = 'A'; break;
                case 10: numStr = 'J'; break;
                case 11: numStr = 'Q'; break;
                case 12: numStr = 'K'; break;
                default:
                    if (num < 0 || num > 12)
                        break;
                    numStr = (num + 1).toString();
                    break;
            }
            var img = $('<div class="player_card"><img src="img/gnerals/card/crossbow.png" /><div class="pat_num" style="color:' + 
                color + ';"><span class="pattern">' + 
                patternStr + '</span><span class="num">' + 
                numStr + '</span></div><div class="select_unable"></div></div>')

            var left = $('#cards_last').offset().left;
            var top = $('#cards_last').offset().top;
            img.appendTo($(document.body));
            img.css({ left: left, top: top });
            img.css('position', 'absolute');

            img.find('.select_unable').css('display', i % 2 ? 'block' : 'none');
            sgs.interface.PlayerState.cards.push(sgs.interface.structure.NewCard({
                jqObj: img,
                pattern: pattern,
                num: num
            }));
        }

        $(sgs.interface.PlayerState.cards).each(function (i, d) {
            if(d.jqObj[0].parentNode != document.body)
                return true;
            var tempL;
            var targetL;
            var targetT = $('#cards').offset().top;
            var cc = sgs.interface.PlayerState.cards.length;
            if (cc * sgs.interface.cardinfo.width / 3.2 < $('#cards').width())
                tempL = sgs.interface.cardinfo.width / 3.2 * i;
            else
                tempL = ($('#cards').width() - sgs.interface.cardinfo.width / 3.2) / (cc - 1) * i;
            targetL = $('#cards').offset().left + tempL;
            d.jqObj.animate({
                left: targetL,
                top: targetT
            }, 'fast', function() {
                d.jqObj.appendTo($('#cards'));
                d.jqObj.css('left', tempL);
                d.jqObj.css('top', 'auto');
                d.jqObj.css('bottom', 0);
                /* 绑定事件 */
                d.jqObj.click(sgs.interface.operation.CardClickFn);
            });
        });
    };

    /* 整理牌 */
    sgs.interface.operation.ArrangeCard = function() {
        var cc = sgs.interface.PlayerState.cards.length;
        $(sgs.interface.PlayerState.cards).each(function (i, d) {
            if(d.jqObj[0].parentNode == document.body)
                return true;
            var left;
            if (cc * sgs.interface.cardinfo.width / 3.2 < $('#cards').width())
                left = sgs.interface.cardinfo.width / 3.2 * i;
            else
                left = ($('#cards').width() - sgs.interface.cardinfo.width / 3.2) / (cc - 1) * i;
            d.jqObj.animate({ left: left }, 'normal');
        });
    };

    /* 选牌 */
    sgs.interface.operation.CardClickFn = function (e) {                            /* Card Click Event */
        if($(this).find('.select_unable').css('display') == 'block')
            return false;
        if (sgs.interface.PlayerState.stage == 1) {
            sgs.interface.PlayerState.selectedCards.splice(0, sgs.interface.PlayerState.selectedCards.length);
                if ($(this).css('bottom') == sgs.interface.cardinfo.out + 'px') {
                    $(this).css('bottom', 0);
                } else {
                    $('#cards .player_card').each(function (i, d) {
                        if ($(d).css('bottom') == sgs.interface.cardinfo.out + 'px') {
                            $(d).css('bottom', 0);
                            return false;
                        }
                    });
                    $(this).css('bottom', sgs.interface.cardinfo.out);
                    sgs.interface.PlayerState.selectedCards.push(sgs.interface.structure.NewCard({ jqObj: $(this) }));
                }
        } else if(sgs.interface.PlayerState.stage == 2) {
            if (sgs.interface.PlayerState.selectedCards.length == sgs.interface.PlayerState.cards.length - sgs.interface.PlayerState.blod && $(this).css('bottom') != (sgs.interface.cardinfo.out + 'px')) /* 所选牌数够了并且所点击的牌没有被选中 */
                return false;
            else if ($(this).css('bottom') == (sgs.interface.cardinfo.out + 'px')) {
                $(this).css('bottom', 0);
            } else if ($(this).css('bottom') != (sgs.interface.cardinfo.out + 'px')) {
                $(this).css('bottom', (sgs.interface.cardinfo.out + 'px'));
            }

            sgs.interface.PlayerState.selectedCards.splice(0, sgs.interface.PlayerState.selectedCards.length);
            $('#cards .player_card').each(function (i, d) {
                if ($(d).css('bottom') == (sgs.interface.cardinfo.out + 'px'))
                    sgs.interface.PlayerState.selectedCards.push(sgs.interface.structure.NewCard({ jqObj: $(d) }));
            });
        }
    };

    /* 出牌(点击确定) */
    sgs.interface.operation.OkClick = function (e) {                              /* "OK" Button Click Event */
        if (sgs.interface.PlayerState.selectedCards.length == 0)
            return false;
        /* 从用户牌堆中删除打出去的牌 */
        $(sgs.interface.PlayerState.selectedCards).each(function (i, d) {
            $(sgs.interface.PlayerState.cards).each(function (ii, dd) {
                if (d.jqObj[0] == dd.jqObj[0]) {
                    sgs.interface.PlayerState.cards.splice(ii, 1);
                    return false;
                }
            });
        });

        var thisFn = arguments.callee;
        $('#ok').unbind('click', thisFn);
        /* 将选牌从DOM中抽出（方便牌整理） */
        $(sgs.interface.PlayerState.selectedCards).each(function (i, d) {
            var temp = sgs.interface.PlayerState.selectedCards[i].jqObj;
            var left = temp.offset().left;
            var top = temp.offset().top;
            sgs.interface.PlayerState.selectedCards[i].jqObj.remove();
            temp.appendTo($(document.body));
            temp.css({ left: left, top: top });
            temp.css('position', 'absolute');
        });

        /* 记录选牌数（判断所有动画结束） */
        var cardLength = sgs.interface.PlayerState.selectedCards.length;
        /* 动画 */
        $(sgs.interface.PlayerState.selectedCards).each(function (i, d) {
            var temp = sgs.interface.PlayerState.selectedCards[i].jqObj;
            var targetL;
            var targetT;
            if (sgs.interface.PlayerState.stage == 1) {
                targetL = $('#equipment').offset().left + ($('#equipment').width() - sgs.interface.cardinfo.width / 3.2) / 2;
                targetT = $('#equipment').offset().top - 10;
            } else if (sgs.interface.PlayerState.stage == 2) {
                targetL = $('#gameinfo').offset().left + ($('#gameinfo').width() - sgs.interface.cardinfo.width / 3.2) / 2;
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
                    if(cardLength == i + 1) {
                        temp.remove();
                        var ran = Math.random;
                        var pattern = parseInt(ran() * 4);
                        var num = parseInt(ran() * 13);
                        var color;
                        var patternStr;
                        var numStr;
                        switch (pattern) {
                            case 0: patternStr = '♦'; color = 'red'; break;
                            case 1: patternStr = '♥'; color = 'red'; break;
                            case 2: patternStr = '♣'; color = 'black'; break;
                            case 3: patternStr = '♠'; color = 'black'; break;
                        }
                        switch (num) {
                            case 0: numStr = 'A'; break;
                            case 10: numStr = 'J'; break;
                            case 11: numStr = 'Q'; break;
                            case 12: numStr = 'K'; break;
                            default:
                                if (num < 0 || num > 12)
                                    break;
                                numStr = (num + 1).toString();
                                break;
                        }
//                        $('#attack').find('.pattern').text(patternStr);
//                        $('#attack').find('.pattern').css('color', color);
//                        $('#attack').find('.num').text(numStr);
//                        $('#attack').find('.num').css('color', color);
//                        $('#attack').find('.name').text('贯石斧');

                        var img = $('<div class="img_box"><img src="img/gnerals/card/crossbow.png" style="width:100%; height:100%;" /></div>');
                        img.appendTo($('#attack .equip_name'));
                        img.css('position', 'relative').css('top', '-13px').css('left', '-35px');
                        $('#ok').click(thisFn);

                        var q = 2.2;
                        console.log(400 / q + ' ' + 562 / q);
                    }
                    /* 装备武器等 */
                });
            });

            /* 整理牌 */
            sgs.interface.operation.ArrangeCard();
        });

        /* 清除选牌列表 */
        sgs.interface.PlayerState.selectedCards.splice(0, sgs.interface.PlayerState.selectedCards.length);
    };

    /* 选择角色 */
    sgs.interface.operation.RoleChoose = function (e) {
        var part = $(this).find('img').attr('src').split('/');
        var name = part[part.length - 1].split('.')[0];
        $('#choose_bak').css('display', 'none');
        $('#choose_box').css('display', 'none');
    };

    /* 浏览器改变大小 */
    sgs.interface.operation.BrowserResize = function (e) {
        var des = $(window).height() - $('#main').height();
        $('#main').css('margin-top', des > 0 ? (des < 80 ? des / 4 : sgs.interface.cardinfo.out) : 0);
        if ($('#chose_role').css('display') == 'block') {
        
        }
    };

})(window.sgs);