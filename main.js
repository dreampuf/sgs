$(document).ready(function () {
            
    var bout, /* 一局 */
        identity, /* 身份列表 */
        heros, /* 随机英雄列表 */
        players = [
            { "identity": -1, "hero": undefined },
            { "identity": -1, "hero": undefined },
            { "identity": -1, "hero": undefined },
            { "identity": -1, "hero": undefined }
        ]; /* 玩家对应的身份和英雄 */
    
    /* 游戏开始 */
    $('#game_start').click(function (e) {
        $('#game_start').unbind('click', arguments.callee);
        $('#choose_back').css('display', 'block');
        $('#choose_box').css('display', 'table');
        
        identity = sgs.bout.get_identity(4); /* 第0个表示玩家身份 */
        heros = sgs.bout.get_hero(4);
        $('.choose_role_card').each(function (i, d) {
            $(this).find('img').attr('src', 'img/generals/hero/' + sgs.HEROIMAG_MAPPING[heros[i].name]);
            $(this).find('.choose_role_name').text(heros[i].name);
        });
        for(var i = 0; i < identity.length; i++)
            players[i].identity = identity[i];
        
        if(identity[0] == 0) { /* 玩家是主公时 */
            $('#identity').text('你的身份是 - ' + sgs.interface.IDENTITY_INDEX.name[identity[0]]);
            /* 国家、身份 */
        } else { /* 玩家不是主公时 */
            /* 主公随机选英雄 */
            var choose = parseInt(Math.random() * heros.length),
                tempName;
            for(var i = 0; i < identity.length; i++) {
                if(identity[i] == 0) {
                    players[i].hero = heros[choose];
                    $('#choose_box').find('.card_box').each(function(j, d) {
                        if($(this).find('.choose_role_name').text() == heros[choose].name) {
                            $(this).find('.choose_role_card_cover').css('display', 'block');
                            /* 填上主公信息 */
                            var role_id_str = '#role' + i;
                            $(role_id_str).find('.role_country img').attr('src', sgs.interface.COUNTRY_IMG[heros[choose].country]);
                            $(role_id_str).find('.role_name').text('_' + heros[choose].name + '_');
                            $(role_id_str).find('.role_identity img').attr('src', 'img/king.png');
                            $(role_id_str).find('.head_img img').attr('src', 'img/generals/small/' + sgs.HEROIMAG_MAPPING[heros[choose].name]);
                            for(var k = 0; k < heros[choose].life; k++) {
                                $(role_id_str).find('.blods_0').append('<img src="img/blod_0.png" />');
                                $(role_id_str).find('.blods_1').append('<img src="img/blod_1.png" />');
                            }
                            return false;
                        }
                    });
                    tempName = heros[choose].name;
                    heros.splice(choose, 1); /* 将已选英雄从 heros 中删除 */
                    break;
                }
            }
            $('#identity').append([
                '你的身份是 - <span style="font-weight:bold;">',
                sgs.interface.IDENTITY_INDEX.name[players[0].identity],
                '</span>,     主公选择了 - <span style="font-weight:bold;">',
                tempName,
                '</span>'
            ].join(''));
        }
    });
    
    /* 选择英雄 */
    $('.card_box').mouseup(function (e) {
        if($(this).find('.choose_role_card_cover').css('display') == 'block')
            return false; /* 已被选 */
            
        $('#choose_back').css('display', 'none');
        $('#choose_box').css('display', 'none');
        
        var name = $(this).find('.choose_role_name').text(), /* 所选英雄名称 */
            pls = [], /* new bout() 所需参数 */
            temp, /* 保存主公在 heros 中的位置 */
            role_num; /* 出牌顺序编号 */
        
        for (var i = 0; i < heros.length; i++) { /* 玩家选择英雄 */
            if (heros[i].name == name) {
                players[0].hero = heros[i];
                heros.splice(i, 1);
                break;
            }
        }
        for(var i = 1; i < players.length; i++) { /* 电脑随机选择英雄 */
            if(!!players[i].hero)
                continue;
            players[i].hero = heros[0];
            heros.splice(0, 1);
        }
        for(var i = 0; i < players.length; i++) { /* 查找主公在 heros 中的位置 */
            if(players[i].identity == 0) {
                temp = i;
                break;
            }
        }
        for(var i = 0; i < players.length; i++) { /* 从主公开始按顺序将 player 加到列表 */
            role_num = temp - i < 0 ? temp - i + 4 : temp - i;
            pls.push(new sgs.Player(
                        "_" + players[role_num].hero.name + '_',
                        players[role_num].identity,
                        players[role_num].hero,
                        role_num == 0 ? true : false));
        }
        bout = new sgs.bout(pls);
        
        /* 设置信息并发牌 */
        $(bout.player).each(function (i, d) {
            role_num = temp - i < 0 ? temp - i + 4 : temp - i;
            if (role_num == 0) {
                $('#player_country').attr('src', sgs.interface.COUNTRY_IMG[this.hero.country]);
                $('#player_name').text(this.nickname);
                $('#player_head_img').attr('src', 'img/generals/big/' + sgs.HEROIMAG_MAPPING[this.hero.name]);
                for (var i = 0; i < this.hero.life; i++) {
                    $('<img src="img/blod_0.png" />').appendTo($('#player_blod_0'));
                    $('<img src="img/blod_1.png" />').appendTo($('#player_blod_1'));
                }
                $("#player_identity img").attr('src', sgs.interface.IDENTITY_IMG[this.identity]);
                setTimeout(sgs.animation.Deal_Player, 200, this.card); /* 发牌 */
            } else {
                if(identity[role_num] != 0) {
                    var role_id_str = '#role' + role_num;
                    $(role_id_str).find('.role_country img').attr('src', sgs.interface.COUNTRY_IMG[this.hero.country]);
                    $(role_id_str).find('.role_name').text(this.nickname);
                    $(role_id_str).find('.head_img img').attr('src', 'img/generals/small/' + sgs.HEROIMAG_MAPPING[this.hero.name]);
                    $(role_id_str).find('.card_count span').text(this.card.length);
                    for (var i = 0; i < this.hero.life; i++) {
                        $('<img src="img/blod_0.png" />').appendTo($(role_id_str).find('.blods_0'));
                        $('<img src="img/blod_1.png" />').appendTo($(role_id_str).find('.blods_1'));
                    }
                }
                setTimeout(sgs.animation.Deal_Comp, 200, this.card.length, role_num); /* 发牌 */
            }
        });
    });

    /* 确定按钮 */
    $('#ok').mouseup();
    
    
    
    /* 选择角色界面 */
    $('.card_box').mousedown(function () {
        if($(this).find('.choose_role_card_cover').css('display') == 'block')
            return false;
        $(this).css('border-style', 'inset');
    }).mouseup(function () {
        $(this).css('border-style', 'outset');
    }).mouseout(function () {
        $(this).css('border-style', 'outset');
    }).hover(function() { /* 显示技能解释 */
        
        $('#explanation').css('display', 'block');
    }, function() {
        $('#explanation').css('display', 'none');
    });
    
    /* 身份按钮 */
    $('#player_identity').click(function(e) {
        var target = $(this).find('img');
        target.css('display', target.css('display') == 'none' ? 'block' : 'none');
    });
    $('.role_identity').click(function(e) {
        var imgSrcPart = $(this).find('img').attr('src').split('/');
        if(imgSrcPart[imgSrcPart.length - 1] == 'king.png') {
            if($(this).find('span').length == 0)
                $(this).append($('<span style="display:none;"></span>'));
            $(this).find('img').attr('src', 'img/none.png');
        } else if($(this).find('span').length != 0) {
            $(this).find('img').attr('src', 'img/king.png');
        } else {
            $(this).find('img').attr('src', 'img/none.png');
            var target = $(this).next('.role_identity_select');
            target.css('display', target.css('display') == 'none' ? 'block' : 'none');
        }
    });
    $('.role_identity_select img').click(function(e) {
        $(this).parent().prev().find('img').attr('src', $(this).attr('src'));
        $(this).parent().css('display', 'none');
    });

    /* 按钮样式变化 */
    $('#ok, #cancel, #abandon').hover(function (e) {
        $(this).find('.normal').css('display', 'none');
        $(this).find('.hover').css('display', 'block');
    }, function (e) {
        $(this).find('.normal').css('display', 'block');
        $(this).find('.hover').css('display', 'none');
    }).mousedown(function (e) {
        $(this).find('.hover').css('display', 'none');
    }).mouseup(function (e) {
        $(this).find('.hover').css('display', 'block');
    });

    /* 浏览器改变大小 */
    $(window).resize(function (e) {
        var des = $(window).height() - $('#main').height(),
            val;
        if(des < 0)
            val = 0;
        else if(des < 80)
            val = des / 2;
        else
            val = 80;
        $('#main').css('margin-top', val);
    });
});