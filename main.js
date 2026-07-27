$(document).ready(function () {
    
    sgs.interface.Load_Data();
    
    var identity, /* 身份列表 */
        player_count, /* 玩家数量 */
        players = [], /* 玩家列表(临时变量) */
        player_heros, /* 玩家可选英雄 */
        choose_heros; /* 所有可选英雄 */

    var clearTargetSelection = function(player) {
        $('.role').each(function(i, d) {
            $(d).find('.role_cover').css('display', 'none');
            $(d).removeClass('target_available target_selected');
            if(d.player) {
                d.player.selected = false;
            }
        });
        $('#player').removeClass('target_available target_selected');
        player.targets = [];
        player.selected_targets = [];
        player.target_selectable_count = -1;
        player.target_min_selectable_count = -1;
    };

    var clearCardSelection = function(player) {
        $('.player_card').each(function(i, d) {
            if(d.card) {
                d.card.selected = false;
            }
            $(d).stop(true, true).css('top', 0);
            $(d).removeClass('card_unusable').attr('aria-disabled', 'false');
            $(d).find('.select_unable').css('display', 'none');
        });
        player.selected_cards = [];
        player.card_selectable_count = -1;
    };

    var setCardUsable = function(cardDom, usable) {
        $(cardDom)
            .toggleClass('card_unusable', !usable)
            .attr('aria-disabled', usable ? 'false' : 'true')
            .find('.select_unable').css('display', usable ? 'none' : 'block');
    };

    var refreshPlayableCards = function(player) {
        if(!sgs.interface.bout || player.stage != 2) {
            return;
        }
        $('.player_card').each(function(i, cardDom) {
            var card = cardDom.card,
                targetsInfo = card && sgs.interface.bout.select_card(
                    new sgs.Operate(card.name, player, undefined, card)
                );
            setCardUsable(cardDom, !!targetsInfo && targetsInfo[1] >= 0);
        });
    };

    var showTargetSelection = function(player) {
        $('.role').each(function(i, roleDom) {
            var available = roleDom.player && player.targets.indexOf(roleDom.player) != -1;
            $(roleDom)
                .toggleClass('target_available', available)
                .removeClass('target_selected');
            $(roleDom).find('.role_cover').css('display', available ? 'none' : 'block');
        });
        if(player.targets.indexOf(player) != -1) {
            $('#player').addClass('target_available');
        }
    };

    var lockCommittedCards = function(player, cards) {
        $('.player_card').each(function(i, cardDom) {
            if(cards.indexOf(cardDom.card) == -1) {
                if(cardDom.card) {
                    cardDom.card.selected = false;
                }
                $(cardDom).stop(true, true).css('top', 0);
            }
        });
        player.selected_cards = [];
        clearTargetSelection(player);
        $('#ok, #cancel, #abandon').css('display', 'none');
        $('#player_cover').css('display', 'block');
    };

    var resetInteraction = function(player, lockPlayer) {
        clearCardSelection(player);
        clearTargetSelection(player);
        $('#ok, #cancel, #abandon').css('display', 'none');
        $('#player_cover').css('display', lockPlayer ? 'block' : 'none');
    };
    
    var overwrite = function(player) { /* 重写玩家方法 */
        player.choice_card = function() {
            if(player.stage != 2) {
                resetInteraction(player, false);
                $('#player_cover').css('display', 'none');
                $('#abandon').css('display', 'block');
                sgs.animation.Play_Sound('sound/system/your-turn.ogg');
                player.stage = 2;
            }
            refreshPlayableCards(player);
        };
        player.discard = function() {
            clearCardSelection(player);
            $.each($('.player_card .select_unable'), function(i, d) {
                $(d).css('display', 'none');
            });
        };
        player.ask_card = function(opt) {
            resetInteraction(player, false);
            $('#player_cover').css('display', 'none');
            $('#cancel').css('display', 'block');
            $('.player_card').each(function(i, d) {
                setCardUsable(d, d.card.name == opt.data);
            });
            player.pending_response = opt;
            player.source_card = opt.data;
            player.stage = -1;
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
        sgs.interface.bout.attach("equip_off", sgs.animation.Remove_Equipment);
        sgs.interface.bout.attach("choice_card", sgs.animation.Play_Card);
        sgs.interface.bout.attach("response_card", sgs.animation.Play_Card);
        sgs.interface.bout.attach("discard", sgs.animation.Discard_Card);
        sgs.interface.bout.attach("delayed_on", sgs.animation.Delayed_On);
        sgs.interface.bout.attach("delayed_off", sgs.animation.Delayed_Off);
        sgs.interface.bout.attach("nullified", sgs.animation.Nullified);
        sgs.interface.bout.attach("status_change", sgs.animation.Status_Change);
        sgs.interface.bout.attach("judge_card", sgs.animation.Judge_Card);
        sgs.interface.bout.attach("show_card", sgs.animation.Show_Card);
        sgs.interface.bout.attach("death", sgs.animation.Player_Death);
        sgs.interface.bout.attach("apply_card", function(player, targets, cards) {
            targets = Array.isArray(targets) ? targets : [targets];
            switch(cards.name) {
                case "杀":
                case "火杀":
                case "雷杀":
                case "决斗":
                case "火攻":
                case "南蛮入侵":
                case "万箭齐发":
                case "闪电":
                    $.each(targets, function(i, d) {
                        sgs.animation.Get_Damage(d);
                    });
                    break;
                case "桃":
                case "桃园结义":
                    $.each(targets, function(i, d) {
                        sgs.animation.Refresh_Blood(d);
                    });
                    break;
            }
        });
    };
    
    var selectedExpansionPacks = function() {
        var packs = [];
        $('.expansion_pack:checked').each(function(i, d) {
            packs.push($(d).val());
        });
        return packs;
    };
    var selectedAiLevel = function() {
        var level = parseInt($('#ai_level').val(), 10);
        return isNaN(level) ? sgs.DEFAULT_AI_LV : level;
    };

    /* 游戏开始 */
    $('#game_start').click(function (e) {
        $('#game_start').unbind('click', arguments.callee);
        $('#game_start, #start_options').css('display', 'none');
        $.each(selectedExpansionPacks(), function(i, expansionPack) {
            sgs.applyExpansionPack(expansionPack);
        });
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
        sgs.interface.bout = new sgs.Bout(pls, selectedAiLevel());
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
        if($(this).hasClass('card_unusable'))
            return false;
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
                            clearTargetSelection(player);
                            $('#ok').css('display', 'none');/* 隐藏确定按钮 */
                        } else { /* 卡牌没有被选中时 */
                            clearTargetSelection(player);
                            cardDom.card.selected = true;
                            $(cardDom).animate({ 'top': -cardOut + 'px' }, 100);

                            var targets_info = sgs.interface.bout.select_card(new sgs.Operate(cardDom.card.name, player, undefined, cardDom.card));
                            console.log('选牌', d.card, '可选目标:', targets_info[0], '可选目标数:', targets_info[1])
                            if(targets_info[1] < 0) {
                                cardDom.card.selected = false;
                                $(cardDom).animate({ 'top': '0px' }, 100);
                                $(cardDom).find('.select_unable').css('display', 'block');
                                player.targets = [];
                                player.target_selectable_count = -1;
                                player.target_min_selectable_count = -1;
                                $('#ok').css('display', 'none');
                                return;
                            }
                            player.targets = targets_info[0];
                            player.target_selectable_count = targets_info[1];
                            player.target_min_selectable_count = targets_info[2];
                            showTargetSelection(player);
                            if(player.target_min_selectable_count == 0 ||
                               player.targets.length == 1 && player.targets[0] == $('#player')[0].player)
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
                else
                    $('#ok').css('display', 'none');
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
        
        var player = $('#player')[0].player;
        
        if(player.targets.length == 0)
            return false;
        
        if(!this.player.selected) {
            $(this).removeClass('target_available').addClass('target_selected');
            this.player.selected = true;
            player.selected_targets.push(this.player);
            player.target_selectable_count--;
            console.log('选择目标:', this.player, this.player.nickname);
            if(player.target_selectable_count == 0) {/* 选择目标达到【目标数量】时，将其他可选目标设为不可选状态 */
                $.each(sgs.func.sub(player.targets, player.selected_targets), function(i, d) {
                    $(d.dom).find('.role_cover').css('display', 'block');
                    $(d.dom).removeClass('target_available');
                });
                $('#ok').css('display', 'block');
                console.log('可以出牌, 目标:', player.selected_targets);
            } else if(player.selected_targets.length >= player.target_min_selectable_count) {
                $('#ok').css('display', 'block');
            }
        } else {
            $(this).removeClass('target_selected').addClass('target_available');
            this.player.selected = false;
            player.selected_targets = sgs.func.sub(player.selected_targets, [this.player]);
            player.target_selectable_count++;
            console.log('取消选择目标:', this.player);
            if(player.target_selectable_count > 0) {
                $.each(sgs.func.sub(player.targets, player.selected_targets), function(i, d) {
                    $(d.dom).find('.role_cover').css('display', 'none');
                    $(d.dom).addClass('target_available');
                });
            }
            $('#ok').css('display',
                player.selected_targets.length >= player.target_min_selectable_count ? 'block' : 'none');
        }
    });

    /* 确定按钮 */
    $('#ok').click(function(e) {
        $(this).find('.hover').css('display', 'block');
        var player = $('#player')[0].player,
            stage = player.stage,
            selected_cards = [];

        $.each(player.card, function(i, d) {
            if(d.selected)
                selected_cards.push(d);
        });
        if(selected_cards.length == 0)
            return;

        player.selected_cards = selected_cards;
        if(stage == -1) {
            var pending_response = player.pending_response,
                response_target = pending_response ? pending_response.source : player;
            lockCommittedCards(player, selected_cards);
            player.pending_response = undefined;
            sgs.interface.bout.response_card(new sgs.Operate(
                pending_response ? pending_response.id : player.source_card,
                player,
                response_target,
                selected_cards[0]
            ));
        } else if(stage == 2) {
            var selected_target = player.selected_targets.length > 1 ?
                    player.selected_targets :
                    (player.selected_targets[0] ||
                     (player.targets.length > 1 ? player.targets : player.targets[0]) ||
                     player);
            console.log('出牌:', player, '目标:', selected_target);
            lockCommittedCards(player, selected_cards);
            player.stage = -1;
            sgs.interface.bout.choice_card(new sgs.Operate(
                selected_cards[0].name,
                player,
                selected_target,
                selected_cards[0]
            ));
        } else if(stage == 3) {
            lockCommittedCards(player, selected_cards);
            player.stage = -1;
            sgs.interface.bout.discard(new sgs.Operate("弃牌", player, player, selected_cards));
        }
    });
    
    /* 取消按钮 */
    $('#cancel').click(function(e) {
        var player = $('#player')[0].player,
            pending_response = player.pending_response,
            response_target = pending_response ? pending_response.source : player;
        switch(player.stage) {
            case -1:
                resetInteraction(player, true);
                player.pending_response = undefined;
                sgs.interface.bout.response_card(new sgs.Operate(
                    pending_response ? pending_response.id : player.source_card,
                    player,
                    response_target,
                    undefined
                ));
                break;
        }
    });
    
    /* 弃牌按钮 */
    $('#abandon').click(function(e) {
        $(this).find('.hover').css('display', 'block');
        var player = $('#player')[0].player,
            discard_count = Math.max(0, player.card.length - player.blood);
        clearCardSelection(player);
        clearTargetSelection(player);
        $('#ok, #cancel, #abandon').css('display', 'none');
        player.card_selectable_count = discard_count;
        player.stage = 3;
        if(discard_count == 0) {
            $('#player_cover').css('display', 'block');
            player.stage = -1;
            sgs.interface.bout.discard(new sgs.Operate("弃牌", player, player, []));
        }
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
