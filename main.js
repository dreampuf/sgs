$(document).ready(function () {
    
    sgs.interface.Load_Data();
    
    var identity, /* 身份列表 */
        explanation_id, /* 技能解释 */
        player_count,
        players = [],
        player_heros,
        choose_heros;
    
    /* 游戏开始 */
    $('#game_start').click(function (e) {
        $('#game_start').unbind('click', arguments.callee);
        $('#choose_back').css('display', 'block');
        $('#choose_box').css('display', 'table');
        
        player_count = 4;
        choose_heros = sgs.Bout.get_hero((player_count - 1) * 3 + 1);
        
        identity = sgs.Bout.get_identity(player_count); /* 第0个表示玩家身份 */
        
        identity[0] = 0;
        identity[1] = 2;
        identity[2] = 3;
        identity[3] = 1;
        
        for(var i = 0; i < player_count; i++) {
            players.push({
                "identity": identity[i],
                "dom": (i == 0 ? $('#player') : $('#role' + i))[0],
                "isAI": i == 0 ? false : true
            });
        }
        
        if(identity[0] == 0) { /* 玩家是主公时 */
            $('#choose_role_bg, #choose_role').css('width', '550px');
            $('#choose_role_content').css('width', '520px');
            $('#choose_role_title').css('left', '195px');
            $('.player_progress_bar').css('left', '125px');
            
            player_heros = sgs.Bout.get_king_hero();
        } else { /* 玩家不是主公时 */
            $('#choose_role_bg, #choose_role').css('width', '340px');
            $('#choose_role_content').css('width', '310px');
            $('#choose_role_title').css('left', '90px');
            $('.player_progress_bar').css('left', '20px');
            
            /* 主公随机选英雄 */
            king_hero = sgs.func.choice(sgs.Bout.get_king_hero())[0];
            
            $.each(identity, function(i, d) {
                if(d == 0) {
                    players[i].hero = king_hero;
                    /* 填上主公信息 */
                    sgs.interface.Set_RoleInfo(new sgs.Player('_' + king_hero.name + '_', 0, king_hero, true), $('#role' + i)[0]);
                    return false;
                }
            });
            choose_heros = sgs.func.sub(choose_heros, [king_hero]);
            player_heros = choose_heros.slice(0, 3);
        }
        
        sgs.interface.Show_CardChooseBox(
            '选择您的武将',
            player_heros,
            '你的身份是 - ' + sgs.interface.IDENTITY_INDEX_MAPPING.name[identity[0]]);
    });
    
    /* 选择英雄 */
    $('.choose_role_card').live('click', function (e) {
        $('#choose_box_bgcover').remove();
        $('#choose_box').remove();
    
        var vthis = this,
            pls = [];
        
        
        $.each(player_heros, function(i, d) { /* 玩家选择英雄 */
            if (d.name == vthis.name) {
                players[0].hero = d;
                return false;
            }
        });
        
        if(players[0].identity == 0)
            choose_heros = sgs.func.sub(choose_heros, [players[0].hero]);
        
        for(var i = 1; i < player_count; i++) { /* 电脑选择英雄 */
            if(players[i].hero != undefined)
                continue;
            players[i].hero = choose_heros.slice((i - 1) * 3, (i - 1) * 3 + 1)[0];
        }
        
        for(var i = 0; i < player_count; i++) {
            var tempPlayer = new sgs.Player('_' + players[i].hero.name + '_', players[i].identity, players[i].hero, players[i].isAI),
                tempDom = (i == 0 ? $('#player') : $('#role' + i))[0];
            
            tempPlayer.dom = tempDom;
            tempPlayer.selected = false;
            tempDom.player = tempPlayer;
            if(i == 0) {
                tempPlayer.choice_card = function() {
                    $('#player_cover').css('display', 'none');
                    $('#abandon').css('display', 'block');
                };
            }
            pls.push(tempPlayer);
        }
        sgs.interface.bout = new sgs.Bout(pls);
        bing_event();
        
        /*** 测试用 ***/
        $.each(sgs.interface.bout.player, function(i, d) {
            return false;
            if(0 == 1) {
                d.card[0].name = '杀';
                d.card[1].name = '决斗';
                d.card[2].name = '南蛮入侵';
                d.card[3].name = '万箭齐发';
            } else {
                d.card[0].name = '诸葛连弩';
                d.card[1].name = '八卦阵';
                d.card[2].name = '的卢';
                d.card[3].name = '赤兔';
            }
        });
        
        /* 设置信息并发牌 */
        $(sgs.interface.bout.player).each(function (i, d) {
            if (d.dom == $('#player')[0]) {
                sgs.interface.Set_RoleInfo(d);
                setTimeout(sgs.animation.Deal_Player, 200, d.card); /* 发牌 */
            } else {
                if(d.identity != 0)
                    sgs.interface.Set_RoleInfo(d);
                setTimeout(sgs.animation.Deal_Comp, 200, d.card.length, d); /* 发牌 */
            }
        });
    });
    
    var bing_event = function() {
        sgs.interface.bout.attach("get_card", function(player, cards) {
            if(player.dom == $('#player')[0]) {
                sgs.animation.Deal_Player(cards);
            } else {
                sgs.animation.Deal_Comp(cards.length, player);
            }
        });
        sgs.interface.bout.attach("equip_on", sgs.animation.Equip_Equipment);
    };
    
    /* 选牌 */
    $('.player_card').live('click', sgs.animation.Select_Card);
    
    /* 选择目标 */
    $('.role').click(function(e) {
        if($(this).find('.role_cover').css('display') == 'block')
            return false;
        
        var leftNum = parseInt($(this).css('left')),
            topNum = parseInt($(this).css('top')),
            player = $('#player')[0].player;
        
        if(player.targets == undefined)
            return false;
        
        if(!this.player.selected) {
            this.player.selected = true;
            player.targets.selected.push(this.player);
            if(player.targets.selected.length == player.targets[1]) {
                /* 选择目标达到【目标数量】时，将其他可选目标设为不可选状态 */
                $.each(sgs.func.sub(player.targets[0], player.targets.selected), function(i, d) {
                    $(d.dom).find('.role_cover').css('display', 'block');
                });
                /* 激活确定按钮 */
                $('#ok').css('display', 'block');
            }
            $(this).css({
                'box-shadow': '0px 0px 15px 5px #dd0200',
                left: leftNum - 1,
                top: topNum - 1
            });
        } else {
            this.player.selected = false;
            player.targets.selected = sgs.func.sub(player.targets.selected, [this.player]);
            if(player.targets.selected.length == player.targets[1] - 1) {
                /* 【已选目标数量】比【可选目标数量】刚好小【1】时将其他可选目标设为可选状态 */
                $.each(sgs.func.sub(player.targets[0], player.targets.selected), function(i, d) {
                    $(d.dom).find('.role_cover').css('display', 'none');
                });
                /* 隐藏确定按钮 */
                $('#ok').css('display', 'none');
            }
            $(this).css({
                'box-shadow': '2px 2px 2px #000',
                left: leftNum + 1,
                top: topNum + 1
            });
        }
    });

    /* 确定按钮 */
    $('#ok').mouseup(function(e) {
        var player = $('#player')[0].player,
            selectedCard;
        $('.player_card').each(function(i, d) {
            if(this.card.selected == true)
                selectedCard = this.card;
        });
        var a = sgs.interface.bout.choice_card(new sgs.Operate(selectedCard.name, player, player.targets.selected[0], selectedCard));
        var b = 0;
    });
    
    /* 选择角色界面 */
    $('.card_box').mousedown(function () {
        if($(this).find('.choose_role_card_cover').css('display') == 'block')
            return false;
        
    }).mouseup(function () {
        
    }).mouseout(function () {
        
    });
    
    /* 显示技能解释 */
    $('.card_box, .head_img, #player_head').live('mousemove', function(e) {
        var vthis = this;
        $('#explanation').css('display', 'none');
        if(explanation_id != undefined)
            clearTimeout(explanation_id);
        explanation_id = setTimeout(function() {
            sgs.animation.Skill_Explanation(
                vthis.name,
                true,
                e.clientX,
                e.clientY
            );
            $('#explanation').css('display', 'block');
        }, 1000);
    }).live('mouseout', function(e) {
        if(explanation_id != undefined)
            clearTimeout(explanation_id);
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
            $(this).find('img').attr('src', 'img/system/none.png');
            var target = $(this).next('.role_identity_select');
            target.css('display', target.css('display') == 'none' ? 'block' : 'none');
        }
        return false;
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
