$(document).ready(function () {
    
    var bout, /* 一局 */
        identity, /* 身份列表 */
        heros, /* 随机英雄列表 */
        explanation_id, /* 技能解释 */
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
            $(this).find('.choose_hero_name').text(heros[i].name);
        });
        for(var i = 0; i < identity.length; i++)
            players[i].identity = identity[i];
        
        if(identity[0] == 0) { /* 玩家是主公时 */
            $('#identity').text('你的身份是 - ' + sgs.interface.IDENTITY_INDEX_MAPPING.name[identity[0]]);
            /* 国家、身份 */
        } else { /* 玩家不是主公时 */
            /* 主公随机选英雄 */
            var choose = parseInt(Math.random() * heros.length),
                tempName;
            for(var i = 0; i < identity.length; i++) {
                if(identity[i] == 0) {
                    players[i].hero = heros[choose];
                    $('#choose_box').find('.card_box').each(function(j, d) {
                        if($(this).find('.choose_hero_name').text() == heros[choose].name) {
                            $(this).find('.choose_role_card_cover').css('display', 'block');
                            /* 填上主公信息 */
                            var role_id_str = '#role' + i;
                            sgs.interface.Set_RoleInfo(
                                true,
                                new sgs.Player('_' + heros[choose].name + '_', 0, heros[choose], true),
                                role_id_str);
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
                sgs.interface.IDENTITY_INDEX_MAPPING.name[players[0].identity],
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
        
        var name = $(this).find('.choose_hero_name').text(), /* 所选英雄名称 */
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
                sgs.interface.Set_RoleInfo(false, this);
                setTimeout(sgs.animation.Deal_Player, 200, this.card); /* 发牌 */
            } else {
                if(identity[role_num] != 0) {
                    var role_id_str = '#role' + role_num;
                    sgs.interface.Set_RoleInfo(true, this, role_id_str);
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
    });
    
    /* 显示技能解释 */
    $('.card_box, .head_img, #player_head').hover(function(e) {
        if($(this).find('.choose_hero_name').text() == '')
            return false;
        var vthis = this,
            isShow = $('#explanation').css('display') == 'block';
        if(isShow && explanation_id != undefined)
            clearTimeout(explanation_id);
        explanation_id = setTimeout(function() {
            sgs.animation.Skill_Explanation(
                $(vthis).find('.choose_hero_name').text(),
                true,
                e.clientX,
                e.clientY
            );
            $('#explanation').css('display', 'block');
        }, isShow ? 0 : 1000);
    }, function(e) {
        explanation_id = setTimeout(function() {
            $('#explanation').css('display', 'none');
        }, 500);
    });
    $('#explanation').hover(function(e) {
        clearTimeout(explanation_id);
    }, function(e) {
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
            $(this).find('img').attr('src', sgs.interface.IDENTITY_IMG_MAPPING[0]);
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
        return false;
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