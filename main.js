/// <reference path="" />

var cardw = 130;                                            /* Card Width */
var cardh = 180;                                            /* Card Height */
var cardOut = 35;                                           /* Selected Card Height */
var selectedCards = [];                                     /* Selected Cards */

var Card = function (o) {                                   /* Card Info */
    return {
        jqObj: o.jqObj != undefined ? o.jqObj : null,
        name: o.name != undefined ? o.name : '',
        type: o.type != undefined ? o.type : '',
        pattern: o.pattern != undefined ? o.pattern : '',
        num: o.num != undefined ? o.num : '',
        selected: false
    };
};

var playerState = new Object({                              /* Player State */
    stage: 1,
    weapons: [],
    cards: [],
    blod: 0
});



var RoleChooseFn = function (e) {
    var part = $(this).find('img').attr('src').split('/');
    var name = part[part.length - 1].split('.')[0];
    console.log(name);
};

var CardClickFn = function (e) {                            /* Card Click Event */
    switch (playerState.stage) {
        case 0:
            break;
        case 1:
            selectedCards.splice(0, selectedCards.length);
            if ($(this).css('bottom') == cardOut + 'px') {
                $(this).css('bottom', 0);
                selectedCards.push(Card({ jqObj: $(this) }));
            } else {
                $('#cards img').each(function (i, d) {
                    if ($(d).css('bottom') == cardOut + 'px') {
                        $(d).css('bottom', 0);
                        return false;
                    }
                });
                $(this).css('bottom', cardOut);
            }
            break;
        case 2:
            if (selectedCards.length == playerState.cards.length - playerState.blod && $(this).css('bottom') != (cardOut + 'px')) /* 所选牌数够了并且所点击的牌没有被选中 */
                break;
            else if ($(this).css('bottom') == (cardOut + 'px')) {
                $(this).css('bottom', 0);
            } else if ($(this).css('bottom') != (cardOut + 'px')) {
                $(this).css('bottom', (cardOut + 'px'));
            }

            selectedCards.splice(0, selectedCards.length);
            $('#cards img').each(function (i, d) {
                if ($(d).css('bottom') == (cardOut + 'px'))
                    selectedCards.push(Card({ jqObj: $(d) }));
            });
            break;
    }
};

var OkClickFn = function (e) {                              /* "OK" Button Click Event */

    if (selectedCards.length == 0)
        return false;
    /* 从用户牌堆中删除打出去的牌 */
    $(selectedCards).each(function (i, d) {
        $(playerState.cards).each(function (ii, dd) {
            if (d == dd.jqObj[0])
                playerState.cards.splice(ii, 1);
        });
    });

    var thisFn = arguments.callee;
    $('#ok').unbind('click', thisFn);
    $(selectedCards).each(function (i, d) {
        var temp = selectedCards[i].jqObj;
        var left = temp.offset().left;
        var top = temp.offset().top;
        selectedCards[i].jqObj.remove();
        selectedCards.splice(0, i);
        temp.appendTo($(document.body));
        temp.css({ left: left, top: top });
        temp.css('position', 'absolute');
        temp.addClass('card');

        var targetL;
        var targetW;
        if (playerState.stage == 1) {
            targetL = $('#equipment').offset().left + ($('#equipment').width() - cardw) / 2;
            targetW = $('#equipment').offset().top - 10;
        } else if (playerState.stage == 2) {
            targetL = $('#gameinfo').offset().left + ($('#gameinfo').width() - cardw) / 2;
            targetW = $('#gameinfo').offset().top;
        }
        temp.animate({
            left: targetL,
            top: targetW,
            bottom: 0,
            opacity: 0.5
        }, 'normal', function () {
            temp.animate({ opacity: 'toggle' }, 100, function () {
                temp.remove();
                $('#ok').click(thisFn);
                /* 装备武器等 */
            });
        });
        $('#cards img').each(function (ii, dd) {
            var cc = $('#cards img').length;
            var l;
            if (cc * cardw < $('#cards').width())
                l = cardw * ii;
            else
                l = ($('#cards').width() - cardw) / (cc - 1) * ii;
            $(dd).animate({ left: l }, 'normal');
        });
    });
};

var BrowserResizeFn = function (e) {                        /* 浏览器改变大小 */
    var des = $(window).height() - $('#main').height();
    $('#main').css('margin-top', des > 0 ? (des < 80 ? des / 4 : cardOut) : 0);
    if ($('#chose_role').css('display') == 'block') {
        
    }
};