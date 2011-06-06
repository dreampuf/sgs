$(document).ready(function () {
    
    sgs.interface.Load_Data();
    
    var identity, /* 身份列表 */
        player_count, /* 玩家数量 */
        players = [], /* 玩家列表(临时变量) */
        player_heros, /* 玩家可选英雄 */
        choose_heros; /* 所有可选英雄 */
    
    var overwrite = function(player) { /* 重写玩家方法 */
        player.choice_card = function() {
            if(player.stage != 2) {
                $('#player_cover').css('display', 'none');
                $('#abandon').css('display', 'block');
                $('#sound')[0].src = 'sound/system/your-turn.ogg';
                $('#sound')[0].play();
                $('.player_card .select_unable').each(function(i, d) {
                    $(d).css('display', 'none');
                });
                player.stage = 2;
            }
        };
        player.discard = function() {
            $.each($('.player_card .select_unable'), function(i, d) {
                $(d).css('display', 'none');
            });
        };
        player.ask_card = function(opt) {
            $('#player_cover').css('display', 'none');
            $('#cancel').css('display', 'block');
            $('.player_card').each(function(i, d) {
                if(d.card.name != opt.data)
                    $(d).find('.select_unable').css('display', 'block');
            });
            $('#player')[0].player.targets.push(opt.target);
            $('#player')[0].player.source_card = opt.data;
        };
    };
    
    var bin_event = function() { /* 绑定事件 */
        sgs.interface.bout.attach("get_card", function(player, cards) {
            if(player.dom == $('#player')[0]) {
                sgs.animation.Deal_Player(cards);
            } else {
                sgs.animation.Deal_Comp(cards.length, player);
            }
        });
        sgs.interface.bout.attach("equip_on", sgs.animation.Equip_Equipment);
        sgs.interface.bout.attach("choice_card", sgs.animation.Play_Card);
        sgs.interface.bout.attach("apply_card", function(player, targets, cards) {
            targets = targets instanceof Array ? targets : [targets];
            switch(cards.name) {
                case "杀":
                    $.each(targets, function(i, d) {
                        sgs.animation.Get_Damage(d);
                    });
                    break;
            }
        });
    };
    
    /* 游戏开始 */
    $('#game_start').click(function (e) {
        $('#game_start').unbind('click', arguments.callee);
        $('#choose_back').css('display', 'block');
        $('#choose_box').css('display', 'table');
        
        player_count = 4;
        choose_heros = sgs.Bout.get_hero((player_count - 1) * 3 + 1);
        
        identity = sgs.Bout.get_identity(player_count); /* 第0个表示玩家身份 */
        
        identity[0] = 3;
        identity[1] = 2;
        identity[2] = 1;
        identity[3] = 0;
        
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
            '你的身份是 - ' + sgs.IDENTITY_INDEX_MAPPING.name[identity[0]]);
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
            if(i == 0)
                overwrite(tempPlayer);
            pls.push(tempPlayer);
        }
        /**************************************/
        /*********** 游戏正式开始 *************/
        /**************************************/
        sgs.interface.bout = new sgs.Bout(pls);
        bin_event();
        
        /*** 测试用 ***/
        $.each(sgs.interface.bout.player, function(i, d) {
            if(d.identity == 0) {
                d.card[0].name = '杀';
                d.card[1].name = '闪';
                d.card[2].name = '桃';
                d.card[3].name = '无懈可击';
            } else {
                d.card[0].name = '杀';
                d.card[1].name = '闪';
                d.card[2].name = '桃';
                d.card[3].name = '无懈可击';
            }
        });
        
        var player_self = $('#player')[0].player;
        player_self.stage = -1;
        player_self.card_selectable_count = -1;
        player_self.selected_cards = [];
        player_self.targets = [];
        player_self.selected_targets = [];
        player_self.target_selectable_count = -1;
        player_self.source_card = '';
        
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
    
    /* 选牌 */
    $('.player_card').live('click', function (e) {
        if(this.onDrag)
            return;
        var cardDom = this,
            cardOut = sgs.interface.cardInfo.out,
            player = $('#player')[0].player;

        switch(player.stage) {
            case -1:
                $('.player_card').each(function(i, d) {
                    if(d == cardDom) {
                        $(d).animate({ 'top': (d.card.selected ? 0 : -cardOut) }, 100);
                        $('#ok').css('display', d.card.selected ? 'none' : 'block');
                        d.card.selected = !d.card.selected;
                        console.log('选牌:', d.card);
                    } else {
                        $(d).animate({ 'top': 0 }, 100);
                        d.card.selected = false;
                    }
                });
                break;
            case 2:/* 出牌阶段 */
                $('.player_card').each(function(i, d) {/* 设置卡牌选中状态与玩家选中状态 */
                    if(d == cardDom) {
                        if(cardDom.card.selected) { /* 卡牌已被选中时则取消选中 */
                            console.log('取消选牌:', d.card);
                            $(cardDom).animate({ 'top': '0px' }, 100);
                            cardDom.card.selected = false;
                            player.targets = [];
                            $('.role').each(function(i, d) {/* 设置玩家为可选状态 */
                                $(d).find('.role_cover').css('display', 'none');
                                if(d.player.selected) {
                                    $(d).css({
                                        'box-shadow': '2px 2px 2px #000',
                                        left: parseInt($(d).css('left')) + 1,
                                        top: parseInt($(d).css('top')) + 1,
                                    });
                                    d.player.selected = false;
                                }
                            });
                            $('#ok').css('display', 'none');/* 隐藏确定按钮 */
                        } else { /* 卡牌没有被选中时 */
                            cardDom.card.selected = true;
                            $(cardDom).animate({ 'top': -cardOut + 'px' }, 100);

                            var targets_info = sgs.interface.bout.select_card(new sgs.Operate(cardDom.card.name, player, undefined, cardDom.card));
                            console.log('选牌', d.card, '可选目标:', targets_info[0], '可选目标数:', targets_info[1])
                            player.targets = targets_info[0];
                            player.target_selectable_count = targets_info[1];
                            $('.role .role_cover').each(function(i, d) {/* 设置玩家可选状态 */
                                $(d).css('display', 'block');
                            });
                            $.each(player.targets, function(i, d) {
                                $('.role').each(function(ii, dd) {
                                    if(d.nickname == dd.player.nickname) {
                                        $(dd).find('.role_cover').css('display', 'none');
                                    }
                                });
                            });
                            if(player.targets[0] == $('#player')[0].player)/* 如果是对自己使用的卡牌则激活“确定”按 */
                                $('#ok').css('display', 'block');
                            else
                                $('#ok').css('display', 'none');
                        }
                    } else {
                        d.card.selected = false;
                        $(d).animate({ 'top': 0 }, 100);
                    }
                });
                break;
            case 3:/* 弃牌阶段 */
                if(cardDom.card.selected) {
                    $(cardDom).animate({ 'top': 0 }, 100);
                    cardDom.card.selected = false;
                    player.card_selectable_count++;
                } else {
                    if(player.card_selectable_count == 0)
                        return;
                    $(cardDom).animate({ 'top': -cardOut + 'px' }, 100);
                    cardDom.card.selected = true;
                    player.card_selectable_count--;
                }
                if(player.card_selectable_count == 0)
                    $('#ok').css('display', 'block');
                break;
        }

    });

    /* 选择装备(技能) */
    $('.equip_box').live('click', function(e) {
        //$(this).animation({ left: });
    });
    
    /* 拖动 */
    $('.player_card').live('dragstart', function() { return false; });
    $('.player_card').live('mousedown', sgs.animation.Mouse_Down);
    $(document.body).bind('mousemove', sgs.animation.Mouse_Move);
    $('.player_card').live('mouseup', sgs.animation.Mouse_Up);/* mouseout 防止拖动过快 */
    
    /* 选择目标 */
    $('.role').click(function(e) {
        if($(this).find('.role_cover').css('display') == 'block')
            return false;
        
        var leftNum = parseInt($(this).css('left')),
            topNum = parseInt($(this).css('top')),
            player = $('#player')[0].player;
        
        if(player.targets.length == 0)
            return false;
        
        if(!this.player.selected) {
            $(this).css({
                'box-shadow': '0px 0px 15px 5px #dd0200',
                left: leftNum - 1,
                top: topNum - 1
            });
            this.player.selected = true;
            player.selected_targets.push(this.player);
            player.target_selectable_count--;
            console.log('选择目标:', this.player, this.player.nickname);
            if(player.target_selectable_count == 0) {/* 选择目标达到【目标数量】时，将其他可选目标设为不可选状态 */
                $.each(sgs.func.sub(player.targets[0], player.selected_targets), function(i, d) {
                    $(d.dom).find('.role_cover').css('display', 'block');
                });
                $('#ok').css('display', 'block');
                console.log('可以出牌, 目标:', player.selected_targets);
            }
        } else {
            $(this).css({
                'box-shadow': '2px 2px 2px #000',
                left: leftNum + 1,
                top: topNum + 1
            });
            this.player.selected = false;
            player.selected_targets = sgs.func.sub(player.selected_targets, [this.player]);
            player.target_selectable_count++;
            console.log('取消选择目标:', this.player);
            if(player.target_selectable_count == 1) {/* 【已选目标数量】比【可选目标数量】刚好小【1】时将其他可选目标设为可选状态 */
                $.each(sgs.func.sub(player.targets[0], player.selected_targets), function(i, d) {
                    $(d.dom).find('.role_cover').css('display', 'none');
                });
                $('#ok').css('display', 'none');
            }
        }
    });

    /* 确定按钮 */
    $('#ok').mouseup(function(e) {
        $(this).find('.hover').css('display', 'block');
        var player = $('#player')[0].player;
        
        $.each(player.card, function(i, d) {
            if(d.selected)
                player.selected_cards.push(d);
        });
        console.log('出牌:', player, '目标:', player.selected_targets.length == 0 ? player : player.selected_targets);
        sgs.interface.bout.choice_card(
            new sgs.Operate(
                player.selected_cards[0].name,
                player,
                player.selected_targets.length == 0 ? player : player.selected_targets,
                player.selected_cards
            )
        );
        $(this).css('display', 'none');
    });
    
    /* 取消按钮 */
    $('#cancel').mouseup(function(e) {
        if(e.button != 0)
            return;
        $(this).css('display', 'none');
        var player = $('#player')[0].player;
        switch(player.stage) {
            case -1:
                $('.player_card').each(function(i, d) {
                    d.card.selected = false;
                    $(d).find('.select_unable').css('display', 'none');
                    $(d).animate({ top: 0 }, 100);
                });
                $('#player_cover').css('display', '');
                sgs.interface.bout.response_card(new sgs.Operate(player.source_card, player, player.targets[0], undefined));
                break;
        }
    });
    
    /* 弃牌按钮 */
    $('#abandon').mouseup(function(e) {
        $(this).find('.hover').css('display', 'block');
        $('.player_card').each(function(i, d) {
            $(d).css('top', 0);
            $(d).find('.select_unable').css('display', 'none');
        });
        
        var player = $('#player')[0].player;
        player.card_selectable_count = player.card.length - player.blood;
        player.stage = 3;
    });

    /* 五谷丰登等选牌 */
    $('.choose_card').live('click', function(e) {
        //...
    });
    
    /* 显示技能解释 */
    $('.choose_role_card, .head_img, #player_head').live('mousemove', function(e) {
        var vthis = this,
            expDom = $('#explanation')[0];

        $('#explanation').css({
            display: 'none',
            'z-index': '0',
        });
        if(expDom.explanation_id != undefined)
            clearTimeout(expDom.explanation_id);
        expDom.explanation_id = setTimeout(function() {
            sgs.animation.Skill_Explanation(
                vthis.name,
                true,
                e.clientX,
                e.clientY
            );
            $('#explanation').css({
                display: 'block',
                'z-index': '999',
            });
        }, 1000);
    }).live('mouseout mouseup', function(e) {
        var expDom = $('#explanation')[0];
        if(expDom.explanation_id != undefined)
            clearTimeout(expDom.explanation_id);
        $('#explanation').css({
            display: 'none',
            'z-index': '0',
        });
    })
    $('#explanation').hover(function(e) {
        this.hover = true;
        clearTimeout(this.explanation_id);
    }, function(e) {
        this.hover = false;
        $('#explanation').css({
            display: 'none',
            'z-index': '0',
        });
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
            $(this).find('img').attr('src', sgs.IDENTITY_IMG_MAPPING[0]);
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
        return false;
    });

    /* 按钮样式变化 */
    $('#ok, #cancel, #abandon').hover(function (e) {
        $(this).find('.normal').css('display', 'none');
        $(this).find('.hover').css('display', 'block');
    }, function (e) {
        $(this).find('.normal').css('display', 'block');
        $(this).find('.hover').css('display', 'none');
    }).mousedown(function (e) {
        if(e.button != 0)
            return false;
        $(this).find('.hover').css('display', 'none');
    });

    $('#main').mousedown(function(e) { return false; });
    
    /* 取消浏览器默认拖动 */
    $('img').live('dragstart', function() { return false; });

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
