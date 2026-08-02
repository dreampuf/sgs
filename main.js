var initializeGame = function() {
    
    sgs.interface.Load_Data();
    
    var ui = sgs.dom,
        identity, /* 身份列表 */
        player_count, /* 玩家数量 */
        players = [], /* 玩家列表(临时变量) */
        player_heros, /* 玩家可选英雄 */
        choose_heros, /* 所有可选英雄 */
        match_setup,
        core_hero_by_id,
        active_match,
        SAVE_KEY = 'sgs.saved-match.v1',
        STORY_PROGRESS_PREFIX = 'sgs.story-progress.v1.',
        INTERACTION_SETTINGS_KEY = 'sgs.interaction-settings.v1',
        selected_story_campaign_id = 'shu',
        selected_story_scenario_id,
        story_progress,
        action_skill_material_mode,
        autosaveCurrentMatch,
        showGameResult;

    var role_template = ui.one('#role2').cloneNode(true),
        opponent_seats = document.createElement('div');
    opponent_seats.id = 'opponent_seats';
    ui.one('#main').insertBefore(opponent_seats, ui.one('.role'));
    ui.all('.role').forEach(ui.remove);

    var tableLayoutObstacles = function() {
        var mainRect = ui.one('#main').getBoundingClientRect(),
            padding = 12;
        return ['#cards_last', '#discard_pile_box'].map(function(selector) {
            var element = ui.one(selector),
                rect = element.getBoundingClientRect();
            return {
                id: selector.slice(1),
                left: rect.left - mainRect.left - padding,
                right: rect.right - mainRect.left + padding,
                top: rect.top - mainRect.top - padding,
                bottom: rect.bottom - mainRect.top + padding
            };
        });
    };

    var rectanglesOverlap = function(first, second) {
        return first.left < second.right &&
            first.right > second.left &&
            first.top < second.bottom &&
            first.bottom > second.top;
    };

    var opponentSeatRect = function(angle, scale) {
        var radians = angle * Math.PI / 180,
            centerLeft = 500 + 440 * Math.cos(radians),
            centerTop = 445 + 330 * Math.sin(radians),
            width = 131 * scale,
            height = 152 * scale;
        return {
            angle: angle,
            centerLeft: centerLeft,
            centerTop: centerTop,
            left: centerLeft - width / 2,
            right: centerLeft + width / 2,
            top: centerTop - height / 2,
            bottom: centerTop + height / 2
        };
    };

    var layoutOpponentSeats = function() {
        var seats = ui.all('.role', opponent_seats),
            count = seats.length,
            scale = count <= 5 ? 1 :
                count <= 8 ? 0.75 :
                count <= 11 ? 0.58 :
                count <= 15 ? 0.48 : 0.42,
            span = count <= 5 ? 140 : Math.min(170, 132 + count * 2),
            start = 270 - span / 2,
            end = 270 + span / 2,
            obstacles = tableLayoutObstacles();
        /*
         * The draw and discard piles are table fixtures, not decoration.
         * Shorten the available right-hand arc until a scaled seat clears
         * their current rendered rectangles, including a small visual gap.
         */
        while(
            end > 270 &&
            obstacles.some(function(obstacle) {
                return rectanglesOverlap(
                    opponentSeatRect(end, scale),
                    obstacle
                );
            })
        ) {
            end -= 0.5;
        }
        /*
         * Sparse tables can keep a balanced single arc after the right edge
         * is shortened. Dense tables retain the longer left side because
         * they need the additional circumference.
         */
        if(count <= 5) {
            start = Math.max(start, 540 - end);
        }
        seats.forEach(function(seat, index) {
            var angle = count == 1 ? 270 :
                    start + (end - start) * index / (count - 1),
                rect = opponentSeatRect(angle, scale);
            seat.style.left = Math.round(rect.centerLeft - 65.5) + 'px';
            seat.style.top = Math.round(rect.centerTop - 76) + 'px';
            seat.style.setProperty('--seat-scale', String(scale));
            seat.style.zIndex = String(10 + Math.round(rect.centerTop / 20));
            seat.setAttribute('data-seat-angle', angle.toFixed(2));
            seat.setAttribute('data-seat-scale', String(scale));
            seat.setAttribute(
                'data-layout-obstacles',
                obstacles.map(function(obstacle) {
                    return obstacle.id;
                }).join(',')
            );
        });
    };

    var ensureOpponentSeats = function(totalPlayers) {
        ui.empty(opponent_seats);
        for(var i = 1; i < totalPlayers; i++) {
            var role = role_template.cloneNode(true);
            role.id = 'role' + i;
            role.className = 'role';
            role.removeAttribute('style');
            role.setAttribute('data-seat-index', String(i));
            ui.empty(ui.one('.blods_0', role));
            ui.empty(ui.one('.blods_1', role));
            ui.all('.equipment > div', role).forEach(ui.empty);
            ui.one('.card_count span', role).textContent = '0';
            ui.one('.role_identity img', role)
                .setAttribute('src', 'img/system/none.png');
            opponent_seats.append(role);
        }
        layoutOpponentSeats();
    };
    window.addEventListener('resize', layoutOpponentSeats);

    var clearTargetSelection = function(player) {
        ui.all('.role').forEach(function(d) {
            var target = sgs.view.playerFor(d);
            ui.hide(ui.one('.role_cover', d));
            d.classList.remove('target_available', 'target_selected');
            if(target) {
                target.selected = false;
            }
        });
        ui.one('#player').classList.remove('target_available', 'target_selected');
        player.targets = [];
        player.selected_targets = [];
        player.target_selectable_count = -1;
        player.target_min_selectable_count = -1;
    };

    var setActionPrompt = function(message) {
        var prompt = ui.one('#action_prompt');
        ui.text(prompt, message || '');
        prompt.style.display = message ? 'block' : 'none';
    };

    var setGameSceneActive = function(active) {
        ui.one('#main').classList.toggle('game_scene_active', active);
        ui.one('#player_head').setAttribute(
            'aria-hidden',
            active ? 'false' : 'true'
        );
    };

    var setActionPhasePrompt = function() {
        setActionPrompt('出牌阶段：选择一张可用手牌，或点击“弃牌”结束出牌');
    };

    var responsePromptEnabled = function(selector) {
        return ui.one(selector)
            .getAttribute('aria-checked') != 'false';
    };

    var promptForNullification = function() {
        return responsePromptEnabled('#nullification_prompt_toggle');
    };

    var promptForPeach = function() {
        return responsePromptEnabled('#peach_prompt_toggle');
    };

    var renderResponsePromptPreference = function(
        selector,
        responseName,
        enabled
    ) {
        var toggle = ui.one(selector);
        toggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
        ui.text(ui.one('small', toggle), enabled ? '开' : '关');
        toggle.setAttribute(
            'aria-label',
            responseName + '询问：' + (enabled ? '开' : '关')
        );
    };

    var saveResponsePromptPreferences = function() {
        try {
            window.localStorage.setItem(
                INTERACTION_SETTINGS_KEY,
                JSON.stringify({
                    promptForNullification: promptForNullification(),
                    promptForPeach: promptForPeach()
                })
            );
        } catch(error) {
            console.warn('无法保存交互设置', error);
        }
    };

    var loadResponsePromptPreferences = function() {
        var stored = null;
        try {
            stored = JSON.parse(
                window.localStorage.getItem(INTERACTION_SETTINGS_KEY) ||
                'null'
            );
        } catch(error) {
            console.warn('无法读取交互设置', error);
        }
        renderResponsePromptPreference(
            '#nullification_prompt_toggle',
            '无懈可击',
            !stored || stored.promptForNullification !== false
        );
        renderResponsePromptPreference(
            '#peach_prompt_toggle',
            '桃',
            !stored || stored.promptForPeach !== false
        );
    };

    var setAbandonEnabled = function(enabled) {
        var abandon = ui.one('#abandon');
        abandon.classList.toggle('action_disabled', !enabled);
        abandon.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        ui.style(abandon, {
            pointerEvents: enabled ? 'auto' : 'none',
            opacity: enabled ? 1 : 0.45
        });
    };

    var clearCardSelection = function(player) {
        ui.all('.player_card').forEach(function(d) {
            var card = sgs.view.cardFor(d);
            if(card) {
                card.selected = false;
            }
            sgs.motion.cancel(d);
            d.style.top = '0px';
            d.classList.remove('card_unusable');
            d.setAttribute('aria-disabled', 'false');
            ui.hide(ui.one('.select_unable', d));
        });
        player.selected_cards = [];
        player.card_selectable_count = -1;
    };

    var setCardUsable = function(cardDom, usable) {
        cardDom.classList.toggle('card_unusable', !usable);
        cardDom.setAttribute('aria-disabled', usable ? 'false' : 'true');
        ui.one('.select_unable', cardDom).style.display = usable ? 'none' : 'block';
    };

    var refreshPlayableCards = function(player) {
        if(!sgs.interface.bout || player.stage != 2) {
            return;
        }
        ui.all('.player_card').forEach(function(cardDom) {
            var card = sgs.view.cardFor(cardDom),
                targetsInfo = card && sgs.interface.bout.select_card(
                    card,
                    player
                );
            setCardUsable(cardDom, !!targetsInfo && targetsInfo[1] >= 0);
        });
    };

    var showTargetSelection = function(player) {
        ui.all('.role').forEach(function(roleDom) {
            var rolePlayer = sgs.view.playerFor(roleDom),
                available = rolePlayer && player.targets.indexOf(rolePlayer) != -1;
            roleDom.classList.toggle('target_available', available);
            roleDom.classList.remove('target_selected');
            ui.one('.role_cover', roleDom).style.display = available ? 'none' : 'block';
        });
        if(player.targets.indexOf(player) != -1) {
            ui.one('#player').classList.add('target_available');
        }
    };

    var refreshTargetSelection = function(player, selectedCard) {
        selectedCard = selectedCard || player.card.filter(function(card) {
            return card.selected;
        })[0];
        if(!selectedCard || !sgs.interface.bout.target_selection) {
            showTargetSelection(player);
            return {
                targets: player.targets,
                canConfirm:
                    player.selected_targets.length >=
                    player.target_min_selectable_count
            };
        }
        var selection = sgs.interface.bout.target_selection(
            selectedCard,
            player,
            player.selected_targets
        );
        player.targets = selection.targets;
        player.target_selectable_count = Math.max(
            0,
            selection.maximum - player.selected_targets.length
        );
        player.target_min_selectable_count = selection.minimum;
        ui.all('.role').forEach(function(roleDom) {
            var rolePlayer = sgs.view.playerFor(roleDom),
                selected = player.selected_targets.indexOf(rolePlayer) != -1,
                available = selection.targets.indexOf(rolePlayer) != -1;
            roleDom.classList.toggle('target_selected', selected);
            roleDom.classList.toggle('target_available', !selected && available);
            ui.one('.role_cover', roleDom).style.display =
                selected || available ? 'none' : 'block';
            if(rolePlayer) {
                rolePlayer.selected = selected;
            }
        });
        ui.one('#ok').style.display = selection.canConfirm ? 'block' : 'none';
        return selection;
    };

    var lockCommittedCards = function(player, cards) {
        ui.all('.player_card').forEach(function(cardDom) {
            var card = sgs.view.cardFor(cardDom);
            if(cards.indexOf(card) == -1) {
                if(card) {
                    card.selected = false;
                }
                sgs.motion.cancel(cardDom);
                cardDom.style.top = '0px';
            }
        });
        player.selected_cards = [];
        clearTargetSelection(player);
        ui.all('#ok, #cancel, #abandon').forEach(ui.hide);
        ui.show(ui.one('#player_cover'));
        setActionPrompt('');
    };

    var resetInteraction = function(player, lockPlayer) {
        clearCardSelection(player);
        clearTargetSelection(player);
        ui.all('#ok, #cancel, #abandon').forEach(ui.hide);
        ui.one('#player_cover').style.display = lockPlayer ? 'block' : 'none';
        setActionPrompt('');
    };

    var actionSkillEquipmentSlots = function() {
        return ui.all('#attack, #defend, #attack_horse, #defend_horse');
    };

    var refreshActionSkillMaterialPrompt = function(selection) {
        if(!action_skill_material_mode) {
            return;
        }
        action_skill_material_mode.selectedCount = selection.selectedCount;
        action_skill_material_mode.canConfirm = selection.canConfirm;
        ui.one('#ok').style.display = selection.canConfirm ? 'block' : 'none';
        setActionPrompt(
            action_skill_material_mode.title + '：' +
            action_skill_material_mode.contextText +
            '；已选 ' + selection.selectedCount + ' 张'
        );
    };

    var endActionSkillMaterialSelection = function() {
        var mode = action_skill_material_mode,
            player = sgs.view.playerFor(ui.one('#player'));
        if(!mode) {
            return;
        }
        action_skill_material_mode = null;
        if(player) {
            clearCardSelection(player);
        }
        actionSkillEquipmentSlots().forEach(function(slot) {
            var card = sgs.view.cardFor(slot),
                original = mode.equipmentAttributes.get(slot);
            if(card) {
                card.selected = false;
            }
            slot.classList.remove(
                'action_skill_material_selectable',
                'action_skill_material_selected'
            );
            if(!original) {
                return;
            }
            Object.keys(original).forEach(function(name) {
                if(original[name] == null) {
                    slot.removeAttribute(name);
                } else {
                    slot.setAttribute(name, original[name]);
                }
            });
        });
        ui.all('#ok, #cancel, #abandon').forEach(ui.hide);
        setActionPrompt('');
    };

    sgs.interface.Begin_ActionSkillMaterialSelection = function(
        title,
        cards,
        contextText,
        canConfirm,
        canCancel
    ) {
        var player = sgs.view.playerFor(ui.one('#player')),
            equipmentAttributes = new Map();
        endActionSkillMaterialSelection();
        resetInteraction(player, false);
        action_skill_material_mode = {
            title: title,
            contextText: contextText,
            selectedCount: 0,
            canConfirm: canConfirm,
            canCancel: canCancel,
            equipmentAttributes: equipmentAttributes
        };
        ui.hide(ui.one('#abandon'));
        if(canCancel) {
            ui.show(ui.one('#cancel'));
        } else {
            ui.hide(ui.one('#cancel'));
        }
        ui.all('#cards > .player_card').forEach(function(cardDom) {
            var card = sgs.view.cardFor(cardDom),
                selectable = cards.indexOf(card) != -1;
            setCardUsable(cardDom, selectable);
            cardDom.classList.toggle(
                'action_skill_material_selectable',
                selectable
            );
            cardDom.classList.remove('action_skill_material_selected');
            if(selectable) {
                cardDom.setAttribute('aria-pressed', 'false');
            }
        });
        actionSkillEquipmentSlots().forEach(function(slot) {
            var card = sgs.view.cardFor(slot),
                selectable = cards.indexOf(card) != -1;
            if(!selectable) {
                return;
            }
            equipmentAttributes.set(slot, {
                role: slot.getAttribute('role'),
                tabindex: slot.getAttribute('tabindex'),
                'aria-disabled': slot.getAttribute('aria-disabled'),
                'aria-label': slot.getAttribute('aria-label'),
                'aria-pressed': slot.getAttribute('aria-pressed')
            });
            slot.classList.add('action_skill_material_selectable');
            slot.classList.remove('action_skill_material_selected');
            slot.setAttribute('role', 'button');
            slot.setAttribute('tabindex', '0');
            slot.setAttribute('aria-disabled', 'false');
            slot.setAttribute('aria-pressed', 'false');
            slot.setAttribute(
                'aria-label',
                card.name + '：可作为技能材料'
            );
        });
        refreshActionSkillMaterialPrompt({
            selectedCount: 0,
            canConfirm: canConfirm
        });
    };
    
    var overwrite = function(player) { /* 重写玩家方法 */
        player.choice_card = function() {
            if(player.stage != 2) {
                resetInteraction(player, false);
                ui.hide(ui.one('#player_cover'));
                ui.show(ui.one('#abandon'));
                setAbandonEnabled(true);
                if(window.sgsAudio) {
                    window.sgsAudio.playSfx('system.your-turn');
                }
                player.stage = 2;
            }
            refreshPlayableCards(player);
            setActionPhasePrompt();
        };
        player.begin_discard = function(discard_count) {
            resetInteraction(player, false);
            ui.hide(ui.one('#player_cover'));
            ui.show(ui.one('#abandon'));
            setAbandonEnabled(false);
            player.card_selectable_count = discard_count;
            player.stage = 3;
            setActionPrompt(
                '弃牌阶段：请选择 ' + discard_count + ' 张手牌'
            );
        };
        player.discard = function() {
            clearCardSelection(player);
            ui.all('.player_card .select_unable').forEach(ui.hide);
        };
        player.ask_card = function(opt) {
            resetInteraction(player, false);
            ui.hide(ui.one('#player_cover'));
            ui.show(ui.one('#cancel'));
            ui.all('.player_card').forEach(function(d) {
                var card = sgs.view.cardFor(d);
                setCardUsable(
                    d,
                    sgs.interface.bout.isLegalResponseCard ?
                        sgs.interface.bout.isLegalResponseCard(card) :
                        card.name == opt.data
                );
            });
            player.pending_response = opt;
            player.source_card = opt.data;
            player.stage = -1;
            setActionPrompt('请打出【' + opt.data + '】，或点击“取消”放弃响应');
        };
    };
    
    var bin_event = function() { /* 绑定事件 */
        sgs.interface.bout.attach("get_card", function(player, cards) {
            if(sgs.view.playerElement(player) == ui.one('#player')) {
                return sgs.animation.Deal_Player(cards);
            } else {
                return sgs.animation.Deal_Comp(cards.length, player);
            }
        });
        sgs.interface.bout.attach("sync_hand", sgs.animation.Sync_Player_Hand);
        sgs.interface.bout.attach("equip_on", sgs.animation.Equip_Equipment);
        sgs.interface.bout.attach("equip_off", function(player, card, type, destination) {
            return sgs.animation.Remove_Equipment(
                player,
                card,
                type,
                destination
            );
        });
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
        sgs.interface.bout.attach("audio_cue", function(cue) {
            if(window.sgsAudio) {
                window.sgsAudio.playCue(cue);
            }
        });
        sgs.interface.bout.attach("hero_audio_cue", function(cue) {
            if(window.sgsAudio) {
                window.sgsAudio.playHeroCue(cue);
            }
        });
        sgs.interface.bout.attach("state_changed", function(state) {
            if(autosaveCurrentMatch) {
                autosaveCurrentMatch(false);
            }
            updateStoryBeat(state);
            if(
                window.sgsAdaptiveMusic &&
                active_match &&
                active_match.localPlayerId
            ) {
                window.sgsAdaptiveMusic.update(state);
            }
        });
        sgs.interface.bout.attach("game_ended", function(state) {
            if(showGameResult) {
                showGameResult(state);
            }
        });
        sgs.interface.bout.attach("damage", function(source, target) {
            return sgs.animation.Get_Damage(target);
        });
        sgs.interface.bout.attach("recover", function(player) {
            sgs.animation.Refresh_Blood(player);
        });
        sgs.interface.bout.attach(
            "guhuo_decisions",
            function(source, questioned, trusted) {
                var feedback = ui.one('#guhuo_feedback'),
                    names = questioned.map(function(player) {
                        return player.hero.name;
                    }),
                    visibleNames = names.slice(0, 6).join('、'),
                    questionText = names.length == 0 ?
                        '无人质疑' :
                        '质疑：' + visibleNames +
                            (names.length > 6 ? '等 ' + names.length + ' 人' : ''),
                    trustText = trusted.length > 0 ?
                        ' ｜ ' + trusted.length + ' 人选择不质疑' : '';
                ui.text(ui.one('strong', feedback), source.hero.name + '发动蛊惑');
                ui.text(ui.one('span', feedback), questionText + trustText);
                ui.show(feedback);
                window.clearTimeout(feedback.hideTimer);
                feedback.hideTimer = window.setTimeout(function() {
                    ui.hide(feedback);
                }, 2400);
                return sgs.motion.delay(900);
            }
        );
    };
    
    var selectedExpansionPacks = function() {
        return ui.all('.expansion_pack:checked').map(function(d) {
            return d.value;
        });
    };
    var selectedGameMode = function() {
        var selected = ui.one('input[name="game_mode"]:checked');
        return selected ? selected.value : 'identity';
    };
    var HOME_BACKGROUNDS = {
        identity: 'img/system/home/background-identity.jpg',
        wei: 'img/system/home/background-story-wei.jpg',
        shu: 'img/system/home/background-story-shu.jpg',
        wu: 'img/system/home/background-story-wu.jpg',
        qun: 'img/system/home/background-story-qun.jpg'
        },
        HOME_SCENARIO_BACKGROUNDS = {
            /* 'wu:wu-208-chibi': 'img/system/home/background-story-wu-chibi.jpg' */
        },
        pageAssetUrl = function(path) {
            return new URL(path.replace(/^\/+/, ''), document.baseURI).href;
        };
    Object.keys(HOME_BACKGROUNDS).forEach(function(key) {
        var image = new Image();
        image.src = pageAssetUrl(HOME_BACKGROUNDS[key]);
    });
    var setHomeBackground = function(modeId, campaignId, scenarioId) {
        var faction = modeId == 'story' && HOME_BACKGROUNDS[campaignId]
                ? campaignId
                : 'identity',
            scene = ui.one('#home_scene'),
            campaign = faction == 'identity'
                ? null
                : window.sgsCore.storyCampaigns[faction],
            scenarioKey = faction + ':' + (scenarioId || ''),
            background = HOME_SCENARIO_BACKGROUNDS[scenarioKey] ||
                HOME_BACKGROUNDS[faction];
        scene.dataset.mode = modeId;
        scene.dataset.faction = faction;
        scene.dataset.scenario = scenarioId || '';
        scene.style.setProperty(
            '--home-background',
            'url("' + pageAssetUrl(background) + '")'
        );
        ui.one('#main').setAttribute('data-home-faction', faction);
        ui.text(
            ui.one('#home_scene_caption strong'),
            campaign ? campaign.name : '标准身份场'
        );
        ui.text(
            ui.one('#home_scene_caption small'),
            campaign ? campaign.banner : '四方势力，同局争锋'
        );
    };
    var selectedIdentityPlayerCount = function() {
        var value = parseInt(ui.one('#identity_player_count').value, 10);
        return Math.max(2, Math.min(20, isNaN(value) ? 4 : value));
    };
    var refreshIdentityPlayerOptions = function() {
        var identityMode = selectedGameMode() == 'identity',
            options = ui.one('#identity_player_options'),
            count = selectedIdentityPlayerCount(),
            countInput = ui.one('#identity_player_count');
        options.style.display = identityMode ? 'flex' : 'none';
        countInput.value = String(count);
        ui.text(ui.one('#identity_player_count_value'), count + ' 人');
        ui.all('[data-player-count-delta]').forEach(function(button) {
            var delta = parseInt(button.dataset.playerCountDelta, 10);
            button.disabled = delta < 0 ? count <= 2 : count >= 20;
        });
        if(identityMode && window.sgsCore) {
            var counts = window.sgsCore.identityCounts(count);
            ui.text(
                ui.one('#identity_mix_preview'),
                '主公 ' + counts.lord +
                ' · 忠臣 ' + counts.loyalist +
                ' · 反贼 ' + counts.rebel +
                ' · 内奸 ' + counts.renegade
            );
        }
    };
    var clearSavedMatch = function() {
        try {
            window.localStorage.removeItem(SAVE_KEY);
        } catch(error) {
            console.warn('Unable to remove saved match', error);
        }
    };
    var storedMatch = function() {
        try {
            var serialized = window.localStorage.getItem(SAVE_KEY);
            return serialized && window.sgsCore ?
                window.sgsCore.parseSavedMatch(serialized) : null;
        } catch(error) {
            console.warn('Unable to read saved match', error);
            clearSavedMatch();
            return null;
        }
    };
    var refreshContinueButton = function() {
        var saved = storedMatch(),
            continueButton = ui.one('#continue_game');
        continueButton.style.display = saved ? 'block' : 'none';
        continueButton.setAttribute(
            'title',
            saved ? '保存于 ' + new Date(saved.savedAt).toLocaleString() : ''
        );
    };
    var modeDefinition = function(modeId) {
        return window.sgsCore.gameModes[modeId] ||
            window.sgsCore.gameModes.identity;
    };
    var storyCampaign = function(campaignId) {
        return window.sgsCore.storyCampaigns[campaignId];
    };
    var loadStoryProgress = function(campaignId) {
        var key = STORY_PROGRESS_PREFIX + campaignId,
            serialized = window.localStorage.getItem(key);
        if(serialized) {
            try {
                return window.sgsCore.parseCampaignProgress(
                    serialized,
                    campaignId
                );
            } catch(error) {
                console.warn('Unable to read story progress', error);
                window.localStorage.removeItem(key);
            }
        }
        return window.sgsCore.createCampaignProgress(campaignId);
    };
    var saveStoryProgress = function(progress) {
        window.localStorage.setItem(
            STORY_PROGRESS_PREFIX + progress.campaignId,
            JSON.stringify(progress)
        );
    };
    var storyScenario = function(campaignId, scenarioId) {
        return storyCampaign(campaignId).timeline.find(function(item) {
            return item.id == scenarioId;
        });
    };
    var heroNameFromId = function(heroId) {
        return heroId.split(':').slice(2).join(':');
    };
    var renderStoryScenario = function() {
        var campaign = storyCampaign(selected_story_campaign_id),
            availableIds = campaign.timeline.filter(function(item, index) {
                return index == 0 ||
                    story_progress.completedScenarioIds.indexOf(
                        campaign.timeline[index - 1].id
                    ) != -1;
            }).map(function(item) { return item.id; }),
            selected = storyScenario(
                selected_story_campaign_id,
                selected_story_scenario_id
            ) || campaign.timeline[0],
            timeline = ui.one('#story_intro .story_timeline');
        selected_story_scenario_id = selected.id;
        setHomeBackground(
            'story',
            selected_story_campaign_id,
            selected_story_scenario_id
        );
        ui.empty(timeline);
        campaign.timeline.forEach(function(item) {
            var button = document.createElement('button'),
                completed = story_progress.completedScenarioIds.indexOf(item.id) != -1;
            button.type = 'button';
            button.disabled = availableIds.indexOf(item.id) == -1;
            button.classList.toggle('selected', item.id == selected.id);
            button.innerHTML = '<span>' + item.year + ' · ' + item.title +
                '</span><small>' + (completed ? '已完成' :
                    (button.disabled ? '尚未解锁' :
                        item.seats.length + ' 人 · ' + item.difficulty)) +
                '</small>';
            button.addEventListener('click', function() {
                selected_story_scenario_id = item.id;
                renderStoryScenario();
            });
            timeline.append(button);
        });
        ui.text(ui.one('#story_intro .story_era'), selected.era);
        ui.text(ui.one('#story_intro h2'), selected.title);
        ui.text(ui.one('#story_intro .story_location'), selected.location);
        var storyCopy = ui.one('#story_intro .story_copy');
        ui.empty(storyCopy);
        selected.prologue.forEach(function(paragraph) {
            var item = document.createElement('p');
            item.textContent = paragraph;
            storyCopy.append(item);
        });
        ui.text(ui.one('#story_intro .story_objective'), selected.objective);
        var localSide = function(identity) {
                if(selected.localIdentity == 'lord' ||
                   selected.localIdentity == 'loyalist') {
                    return identity == 'lord' || identity == 'loyalist';
                }
                return identity == selected.localIdentity;
            },
            allies = selected.seats.filter(function(seat) {
                return localSide(seat.identity);
            }).map(function(seat, index) {
                return heroNameFromId(seat.heroDefinitionId) +
                    (index == 0 ? '（玩家）' : '');
            }),
            enemies = selected.seats.filter(function(seat) {
                return !localSide(seat.identity);
            }).map(function(seat) {
                return heroNameFromId(seat.heroDefinitionId);
            });
        ui.text(
            ui.one('#story_intro .story_roster'),
            selected.seats.length + ' 人 · ' + selected.difficulty +
            '｜我方：' + allies.join('、') +
            '｜敌方：' + enemies.join('、') +
            '｜胜利解锁：' +
            selected.unlockHeroDefinitionIds.map(heroNameFromId).join('、')
        );
    };
    var showStoryIntro = function() {
        var campaigns = ui.one('#story_intro .story_campaigns');
        setHomeBackground('story', selected_story_campaign_id);
        ui.empty(campaigns);
        Object.keys(window.sgsCore.storyCampaigns).forEach(function(campaignId) {
            var campaign = storyCampaign(campaignId),
                button = document.createElement('button');
            button.type = 'button';
            button.className = 'story_campaign';
            button.setAttribute('data-faction', campaignId);
            button.classList.toggle(
                'selected',
                campaignId == selected_story_campaign_id
            );
            button.innerHTML = '<strong>' + campaign.name +
                '</strong><small>' + campaign.banner + '</small>';
            button.addEventListener('click', function() {
                selected_story_campaign_id = campaignId;
                story_progress = loadStoryProgress(campaignId);
                selected_story_scenario_id = story_progress.currentScenarioId;
                showStoryIntro();
            });
            campaigns.append(button);
        });
        story_progress = story_progress &&
            story_progress.campaignId == selected_story_campaign_id
            ? story_progress
            : loadStoryProgress(selected_story_campaign_id);
        selected_story_scenario_id = selected_story_scenario_id ||
            story_progress.currentScenarioId;
        renderStoryScenario();
        ui.show(ui.one('#story_intro'), 'flex');
    };
    var showStoryHud = function(modeId, scenario) {
        var story = scenario || modeDefinition(modeId).story;
        if(!story) {
            ui.hide(ui.one('#story_hud'));
            return;
        }
        ui.text(ui.one('#story_hud strong'), story.title);
        ui.text(ui.one('#story_hud span'), story.objective);
        ui.show(ui.one('#story_hud'));
    };
    var updateStoryBeat = function(state) {
        if(!active_match || !active_match.storyScenario) {
            return;
        }
        var due = active_match.storyScenario.beats.filter(function(beat) {
            return beat.turn <= state.turnNumber &&
                active_match.revealedStoryBeatIds.indexOf(beat.id) == -1;
        });
        if(!due.length) {
            return;
        }
        due.forEach(function(beat) {
            active_match.revealedStoryBeatIds.push(beat.id);
        });
        var beat = due[due.length - 1],
            banner = ui.one('#story_event_banner');
        ui.text(ui.one('strong', banner), beat.title);
        ui.text(ui.one('span', banner), beat.text);
        ui.show(banner);
        window.clearTimeout(banner.hideTimer);
        banner.hideTimer = window.setTimeout(function() {
            ui.hide(banner);
        }, 4200);
    };
    var describePlayers = function(state) {
        return players.map(function(player) {
            var corePlayer = state.players[player.id];
            return {
                id: player.id,
                nickname: player.nickname,
                identity: player.identity,
                isAI: player.isAI,
                hero: {
                    id: corePlayer.heroDefinitionId,
                    name: player.hero.name,
                    life: player.hero.life,
                    country: player.hero.country,
                    skills: (player.hero.skills || []).slice()
                }
            };
        });
    };
    autosaveCurrentMatch = function(manual) {
        if(!active_match || !sgs.interface.bout ||
           sgs.interface.bout.engine != 'core') {
            return false;
        }
        try {
            var state = sgs.interface.bout.state();
            if(state.phase == 'finished') {
                return false;
            }
            var saved = window.sgsCore.createSavedMatch({
                    startedAt: active_match.startedAt,
                    activeDurationMs: active_match.clock.elapsed(),
                    modeId: active_match.modeId,
                    expansionIds: active_match.expansionIds.slice(),
                    aiLevel: active_match.aiLevel,
                    seed: active_match.seed,
                    localPlayerId: active_match.localPlayerId,
                    campaign: active_match.campaign ? {
                        ...active_match.campaign,
                        scenarioId: active_match.storyScenario.id
                    } : undefined,
                    players: describePlayers(state),
                    snapshot: sgs.interface.bout.snapshot()
                });
            window.localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
            if(manual) {
                ui.text(ui.one('#save_feedback'), '已保存');
                window.setTimeout(function() {
                    ui.text(ui.one('#save_feedback'), '');
                }, 1800);
            }
            return true;
        } catch(error) {
            console.error('Unable to save match', error);
            if(manual) {
                ui.text(ui.one('#save_feedback'), '保存失败');
            }
            return false;
        }
    };
    var formatDuration = function(durationMs) {
        var seconds = Math.floor(durationMs / 1000),
            minutes = Math.floor(seconds / 60);
        return minutes + '分' + String(seconds % 60).replace(/^(\d)$/, '0$1') + '秒';
    };
    showGameResult = function(state) {
        if(!active_match) {
            return;
        }
        active_match.clock.stop();
        var summary = window.sgsCore.summarizeMatch(
                state,
                active_match.localPlayerId,
                active_match.clock.elapsed()
            ),
            localWon = summary.outcome == 'victory',
            story = active_match.storyScenario ||
                modeDefinition(active_match.modeId).story,
            playerById = {};
        if(window.sgsAdaptiveMusic) {
            window.sgsAdaptiveMusic.finish(
                localWon ? 'victory' : 'defeat'
            );
        }
        if(localWon && window.sgsAudio) {
            var winningPlayer = state.players[active_match.localPlayerId];
            if(winningPlayer) {
                window.sgsAudio.playHeroCue({
                    kind: 'victory',
                    heroDefinitionId: winningPlayer.heroDefinitionId,
                    playerId: active_match.localPlayerId,
                    eventType: 'GameResult',
                    dedupeKey: 'result:' + active_match.startedAt +
                        ':victory:' +
                        active_match.localPlayerId
                });
            }
        }
        if(localWon && active_match.campaign) {
            active_match.campaign = window.sgsCore.completeCampaignScenario(
                active_match.campaign,
                active_match.storyScenario.id
            );
            saveStoryProgress(active_match.campaign);
        }
        sgs.interface.bout.player.forEach(function(player) {
            playerById[player.id] = player;
        });
        sgs.interface.bout.pause();
        clearSavedMatch();
        ui.all('#choose_box_bgcover, #choose_box').forEach(ui.remove);
        ui.all('#game_toolbar, #action_prompt').forEach(ui.hide);
        ui.show(ui.one('#player_cover'));
        var result = ui.one('#game_result');
        result.classList.remove('victory', 'defeat');
        result.classList.add(summary.outcome);
        ui.show(result, 'flex');
        ui.text(ui.one('#game_result .result_title'), localWon ? '胜利' : '失败');
        ui.text(ui.one('#game_result .result_subtitle'),
            localWon ? '你的阵营完成了胜利目标' : '你的阵营未能坚持到最后'
        );
        ui.text(ui.one('#game_result .result_story'),
            story ? (localWon ? story.victoryText : story.defeatText) :
                (localWon ? '战局已定，胜者将名留此役。' : '胜负已分，重整之后再战。')
        );
        var storyNextButton = ui.one('#story_next'),
            hasNextStory = localWon && active_match.campaign &&
                active_match.campaign.currentScenarioId !=
                    active_match.storyScenario.id;
        storyNextButton.style.display = hasNextStory ? 'inline-block' : 'none';
        ui.text(ui.one('#game_result .result_overview'),
            '历经 ' + summary.turns + ' 回合 · 用时 ' +
            formatDuration(summary.durationMs) + ' · 胜者 ' +
            summary.winnerIds.map(function(id) {
                return playerById[id] ? playerById[id].hero.name : id;
            }).join('、')
        );
        var statisticsBody = ui.one('#game_result .result_statistics tbody');
        ui.empty(statisticsBody);
        summary.players.forEach(function(stats) {
            var player = playerById[stats.playerId],
                row = document.createElement('tr');
            if(!player) {
                return;
            }
            if(player.id == active_match.localPlayerId) {
                row.classList.add('local_result_row');
            }
            [
                player.hero.name,
                sgs.IDENTITY_INDEX_MAPPING.name[player.identity],
                stats.cardsUsed,
                stats.responses,
                stats.skillsActivated,
                stats.damageDealt,
                stats.damageReceived,
                stats.recovered,
                stats.kills
            ].forEach(function(value) {
                var cell = document.createElement('td');
                cell.textContent = value;
                row.append(cell);
            });
            statisticsBody.append(row);
        });
    };

    var beginNewMatch = function() {
        var mode = modeDefinition(selectedGameMode()),
            prepared_match,
            currentStoryScenario = null;
        clearSavedMatch();
        ui.hide(ui.one('#story_intro'));
        ui.all('#game_start, #continue_game, #start_options, #home_scene')
            .forEach(ui.hide);
        selectedExpansionPacks().forEach(function(expansionPack) {
            sgs.applyExpansionPack(expansionPack);
        });
        if(!window.sgsCore) {
            throw new Error('Core browser runtime is not available');
        }
        ui.show(ui.one('#choose_box'), 'table');

        players = [];
        if(mode.id == 'story') {
            story_progress = story_progress ||
                loadStoryProgress(selected_story_campaign_id);
            prepared_match = window.sgsCore.prepareStoryMatch(
                selected_story_campaign_id,
                selected_story_scenario_id,
                story_progress.unlockedHeroDefinitionIds
            );
            currentStoryScenario = prepared_match.scenario;
            prepared_match.requiredExpansionIds.forEach(function(expansionPack) {
                var input = ui.one(
                    '.expansion_pack[value="' + expansionPack + '"]'
                );
                if(input) {
                    input.checked = true;
                }
                sgs.applyExpansionPack(expansionPack);
            });
            player_count = currentStoryScenario.seats.length;
        } else {
            player_count = selectedIdentityPlayerCount();
            prepared_match = window.sgsCore.prepareMatch(
                player_count,
                player_count == 2 ? 'rebel' : mode.localIdentity
            );
        }
        ensureOpponentSeats(player_count);
        sgs.motion.setPlayerCount(player_count);
        match_setup = prepared_match.setup;
        core_hero_by_id = {};
        prepared_match.heroes.forEach(function(hero) {
            core_hero_by_id[hero.id] = hero;
        });
        choose_heros = match_setup.availableHeroDefinitionIds.map(function(heroId) {
            return core_hero_by_id[heroId];
        });
        var identity_index = {
            lord: 0,
            loyalist: 1,
            rebel: 3,
            renegade: 2
        };
        identity = match_setup.seats.map(function(seat) {
            return identity_index[seat.identity];
        });

        for(var i = 0; i < player_count; i++) {
            players.push({
                "identity": identity[i],
                "isAI": i == 0 ? false : true
            });
        }

        if(identity[0] == 0) {
            player_heros = match_setup.localHeroChoices.map(function(heroId) {
                return core_hero_by_id[heroId];
            });
        } else {
            match_setup.seats.forEach(function(seat, i) {
                if(seat.identity == 'lord' && seat.heroDefinitionId) {
                    players[i].hero = core_hero_by_id[seat.heroDefinitionId];
                    sgs.interface.Set_RoleInfo(
                        new sgs.Player(
                            '_' + players[i].hero.name + '_',
                            0,
                            players[i].hero,
                            true
                        ),
                        ui.one('#role' + i)
                    );
                }
            });
            player_heros = match_setup.localHeroChoices.map(function(heroId) {
                return core_hero_by_id[heroId];
            });
        }

        active_match = {
            modeId: mode.id,
            expansionIds: selectedExpansionPacks(),
            aiLevel: sgs.DEFAULT_AI_LV,
            seed: match_setup.seed,
            startedAt: Date.now(),
            clock: window.sgsCore.createMatchPlayClock(),
            localPlayerId: null,
            campaign: mode.id == 'story' ? story_progress : null,
            storyScenario: currentStoryScenario,
            revealedStoryBeatIds: []
        };
        if(window.sgsAudio) {
            window.sgsAudio.playMusic(
                mode.id == 'story' && active_match.campaign
                    ? 'music.story.' + active_match.campaign.campaignId
                    : 'music.identity'
            );
        }
        sgs.interface.Show_CardChooseBox(
            '选择您的武将',
            player_heros,
            '你的身份是 - ' + sgs.IDENTITY_INDEX_MAPPING.name[identity[0]]);
        if(mode.id == 'story' && player_heros.length == 1) {
            ui.one('.choose_role_card').click();
        }
    };

    /* 游戏开始 */
    ui.one('#game_start').addEventListener('click', function() {
        if(selectedGameMode() == 'story') {
            showStoryIntro();
            return;
        }
        beginNewMatch();
    });
    
    /* 选择英雄 */
    ui.delegate(document, 'click', '.choose_role_card', function() {
        ui.remove(ui.one('#choose_box_bgcover'));
        ui.remove(ui.one('#choose_box'));
    
        var vthis = this,
            pls = [];
        
        var selected_hero;
        player_heros.some(function(d) { /* 玩家选择英雄 */
            if (d.name == vthis.name) {
                selected_hero = d;
                return true;
            }
            return false;
        });
        if(!selected_hero) {
            throw new Error('Core MatchSetup did not offer the selected hero');
        }
        var finalized_match = window.sgsCore.finalizeMatch(
            match_setup,
            selected_hero.id
        );
        for(var i = 0; i < player_count; i++) {
            players[i].hero = core_hero_by_id[
                finalized_match.seats[i].heroDefinitionId
            ];
        }
        
        for(var i = 0; i < player_count; i++) {
            var tempPlayer = new sgs.Player('_' + players[i].hero.name + '_', players[i].identity, players[i].hero, players[i].isAI),
                tempDom = ui.one(i == 0 ? '#player' : '#role' + i);
            
            tempPlayer.selected = false;
            sgs.view.bindPlayer(tempPlayer, tempDom);
            if(i == 0)
                overwrite(tempPlayer);
            pls.push(tempPlayer);
        }
        players = pls;
        /**************************************/
        /*********** 游戏正式开始 *************/
        /**************************************/
        sgs.interface.bout = window.sgsCore.createBout(
            pls,
            active_match.aiLevel,
            active_match.seed,
            {
                cardNames: active_match.storyScenario ?
                    active_match.storyScenario.cardNames : undefined,
                publicIdentities: Boolean(active_match.storyScenario),
                shouldPromptForNullification: promptForNullification,
                shouldPromptForPeach: promptForPeach
            }
        );
        bin_event();
        if(window.sgsAudio) {
            window.sgsAudio.clearCueHistory();
        }
        
        var player_self = sgs.view.playerFor(ui.one('#player'));
        active_match.localPlayerId = player_self.id;
        if(window.sgsAdaptiveMusic) {
            var openingHero = sgs.interface.bout.state().players[player_self.id];
            window.sgsAdaptiveMusic.start(
                sgs.interface.bout.state(),
                player_self.id,
                openingHero
                    ? 'music.hero.' + openingHero.heroDefinitionId
                    : 'music.opening'
            );
        }
        player_self.stage = -1;
        player_self.card_selectable_count = -1;
        player_self.selected_cards = [];
        player_self.targets = [];
        player_self.selected_targets = [];
        player_self.target_selectable_count = -1;
        player_self.source_card = '';
        
        /* 设置信息并发牌 */
        setGameSceneActive(true);
        sgs.interface.bout.player.forEach(function(d) {
            if (sgs.view.playerElement(d) == ui.one('#player')) {
                sgs.interface.Set_RoleInfo(d);
                sgs.interface.bout.notify("get_card", d, d.card); /* 发牌 */
            } else {
                if(d.identity != 0)
                    sgs.interface.Set_RoleInfo(d);
                sgs.interface.bout.notify("get_card", d, d.card); /* 发牌 */
            }
        });
        ui.show(ui.one('#game_toolbar'), 'flex');
        showStoryHud(active_match.modeId, active_match.storyScenario);
        active_match.clock.start();
        autosaveCurrentMatch(false);
        sgs.interface.bout.continue();
    });

    var restoreSavedMatch = function(saved) {
        ui.all(
            '#game_start, #continue_game, #start_options, #story_intro, ' +
            '#home_scene'
        )
            .forEach(ui.hide);
        ui.all('.expansion_pack').forEach(function(item) {
            item.checked = false;
        });
        saved.expansionIds.forEach(function(expansionPack) {
            ui.one('.expansion_pack[value="' + expansionPack + '"]').checked = true;
            sgs.applyExpansionPack(expansionPack);
        });
        players = [];
        player_count = saved.players.length;
        ensureOpponentSeats(player_count);
        sgs.motion.setPlayerCount(player_count);
        var pls = [];
        saved.players.forEach(function(descriptor, i) {
            var hero = new sgs.Hero(
                    descriptor.hero.name,
                    descriptor.hero.life,
                    descriptor.hero.skills,
                    descriptor.hero.country
                ),
                player = new sgs.Player(
                    descriptor.nickname,
                    descriptor.identity,
                    hero,
                    descriptor.isAI,
                    descriptor.id
                ),
                playerDom = ui.one(i == 0 ? '#player' : '#role' + i);
            hero.definitionId = descriptor.hero.id;
            player.selected = false;
            sgs.view.bindPlayer(player, playerDom);
            if(i == 0) {
                overwrite(player);
            }
            players.push(player);
            pls.push(player);
        });
        var restoredStoryScenario = saved.campaign ?
                storyScenario(
                    saved.campaign.campaignId,
                    saved.campaign.scenarioId
                ) : null,
            restoredCampaign = saved.campaign ?
                { ...saved.campaign } : null;
        if(restoredCampaign) {
            delete restoredCampaign.scenarioId;
        }
        active_match = {
            modeId: saved.modeId,
            expansionIds: saved.expansionIds.slice(),
            aiLevel: sgs.DEFAULT_AI_LV,
            seed: saved.seed,
            startedAt: saved.startedAt,
            clock: window.sgsCore.createMatchPlayClock(
                saved.activeDurationMs
            ),
            localPlayerId: saved.localPlayerId,
            campaign: restoredCampaign,
            storyScenario: restoredStoryScenario,
            revealedStoryBeatIds: []
        };
        sgs.interface.bout = window.sgsCore.createBout(
            pls,
            active_match.aiLevel,
            saved.seed,
            {
                cardNames: restoredStoryScenario ?
                    restoredStoryScenario.cardNames : undefined,
                publicIdentities: Boolean(restoredStoryScenario),
                shouldPromptForNullification: promptForNullification,
                shouldPromptForPeach: promptForPeach
            }
        );
        bin_event();
        sgs.interface.bout.restoreSnapshot(saved.snapshot);
        if(window.sgsAdaptiveMusic) {
            var restoredState = sgs.interface.bout.state(),
                restoredHero =
                    restoredState.players[active_match.localPlayerId];
            window.sgsAdaptiveMusic.start(
                restoredState,
                active_match.localPlayerId,
                restoredHero
                    ? 'music.hero.' + restoredHero.heroDefinitionId
                    : 'music.opening'
            );
        }

        setGameSceneActive(true);
        players.forEach(function(player, i) {
            sgs.interface.Set_RoleInfo(
                player,
                ui.one(i == 0 ? '#player' : '#role' + i)
            );
            sgs.animation.Refresh_Blood(player);
        });
        ui.show(ui.one('#game_toolbar'), 'flex');
        showStoryHud(saved.modeId, restoredStoryScenario);
        ui.text(ui.one('#save_feedback'), '已读取存档');

        sgs.interface.bout.projectState().then(function() {
            window.setTimeout(function() {
                ui.text(ui.one('#save_feedback'), '');
            }, 1800);
            if(sgs.interface.bout.state().phase == 'finished') {
                showGameResult(sgs.interface.bout.state());
            } else {
                active_match.clock.start();
                sgs.interface.bout.resume();
            }
        });
    };

    ui.all('input[name="game_mode"]').forEach(function(input) {
        input.addEventListener('change', function() {
            ui.all('.mode_card').forEach(function(card) {
                card.classList.remove('mode_selected');
            });
            this.closest('.mode_card').classList.add('mode_selected');
            refreshIdentityPlayerOptions();
            setHomeBackground(
                this.value,
                this.value == 'story' ? selected_story_campaign_id : null
            );
        });
    });
    ui.one('#identity_player_count').addEventListener('input', refreshIdentityPlayerOptions);
    ui.one('#identity_player_count').addEventListener('change', refreshIdentityPlayerOptions);
    ui.all('[data-player-count-delta]').forEach(function(button) {
        button.addEventListener('click', function() {
            var input = ui.one('#identity_player_count'),
                delta = parseInt(this.dataset.playerCountDelta, 10),
                value = selectedIdentityPlayerCount() + delta;
            input.value = String(Math.max(2, Math.min(20, value)));
            refreshIdentityPlayerOptions();
        });
    });
    var bindResponsePromptToggle = function(
        selector,
        responseName,
        responseKind
    ) {
        ui.one(selector).addEventListener('click', function() {
            var enabled = !responsePromptEnabled(selector);
            renderResponsePromptPreference(
                selector,
                responseName,
                enabled
            );
            saveResponsePromptPreferences();
            if(
                !enabled &&
                sgs.interface.bout &&
                sgs.interface.bout.engine == 'core' &&
                sgs.interface.bout.autoPassDisabledLocalResponse &&
                sgs.interface.bout.autoPassDisabledLocalResponse(responseKind)
            ) {
                var player = sgs.view.playerFor(ui.one('#player'));
                resetInteraction(player, true);
                player.pending_response = undefined;
            }
        });
    };
    bindResponsePromptToggle(
        '#nullification_prompt_toggle',
        '无懈可击',
        'nullification'
    );
    bindResponsePromptToggle('#peach_prompt_toggle', '桃', 'peach');
    loadResponsePromptPreferences();
    window.setTimeout(function() {
        refreshIdentityPlayerOptions();
    }, 0);
    ui.one('#story_continue').addEventListener('click', beginNewMatch);
    ui.one('#story_back').addEventListener('click', function() {
        ui.hide(ui.one('#story_intro'));
    });
    ui.one('#continue_game').addEventListener('click', function() {
        var saved = storedMatch();
        if(saved) {
            restoreSavedMatch(saved);
        } else {
            refreshContinueButton();
        }
    });
    ui.one('#save_game').addEventListener('click', function() {
        autosaveCurrentMatch(true);
    });
    document.addEventListener('visibilitychange', function() {
        if(!active_match || !active_match.clock) {
            return;
        }
        if(document.visibilityState == 'hidden') {
            active_match.clock.stop();
            autosaveCurrentMatch(false);
        } else if(
            sgs.interface.bout &&
            sgs.interface.bout.engine == 'core' &&
            sgs.interface.bout.state().phase != 'finished'
        ) {
            active_match.clock.start();
        }
    });
    window.addEventListener('pagehide', function() {
        if(active_match && active_match.clock) {
            active_match.clock.stop();
            autosaveCurrentMatch(false);
        }
    });
    var reloadForNewGame = function(preserveMode) {
        var nextModeId = preserveMode && active_match
            ? active_match.modeId
            : null,
            nextCampaign = active_match && active_match.campaign,
            nextScenario = active_match && active_match.storyScenario;
        clearSavedMatch();
        active_match = null;
        if(nextModeId) {
            window.sessionStorage.setItem('sgs.next-mode', nextModeId);
            if(nextModeId == 'story' && nextCampaign) {
                window.sessionStorage.setItem(
                    'sgs.next-story-campaign',
                    nextCampaign.campaignId
                );
                if(!window.sessionStorage.getItem('sgs.next-story-scenario')) {
                    window.sessionStorage.setItem(
                        'sgs.next-story-scenario',
                        nextScenario.id
                    );
                }
            }
        } else {
            window.sessionStorage.removeItem('sgs.next-mode');
            window.sessionStorage.removeItem('sgs.next-story-campaign');
            window.sessionStorage.removeItem('sgs.next-story-scenario');
        }
        window.location.reload();
    };
    ui.one('#restart_game').addEventListener('click', function() {
        reloadForNewGame(true);
    });
    ui.one('#play_again').addEventListener('click', function() {
        reloadForNewGame(true);
    });
    ui.one('#story_next').addEventListener('click', function() {
        if(active_match && active_match.campaign) {
            window.sessionStorage.setItem(
                'sgs.next-story-scenario',
                active_match.campaign.currentScenarioId
            );
        }
        reloadForNewGame(true);
    });
    ui.one('#result_main_menu').addEventListener('click', function() {
        reloadForNewGame(false);
    });
    var nextMode = window.sessionStorage.getItem('sgs.next-mode');
    if(nextMode) {
        window.sessionStorage.removeItem('sgs.next-mode');
        var nextModeInput = ui.one('input[name="game_mode"][value="' + nextMode + '"]');
        nextModeInput.checked = true;
        nextModeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var nextStoryCampaign = window.sessionStorage.getItem(
            'sgs.next-story-campaign'
        ),
        nextStoryScenario = window.sessionStorage.getItem(
            'sgs.next-story-scenario'
        );
    window.sessionStorage.removeItem('sgs.next-story-campaign');
    window.sessionStorage.removeItem('sgs.next-story-scenario');
    if(nextStoryCampaign && storyCampaign(nextStoryCampaign)) {
        selected_story_campaign_id = nextStoryCampaign;
        story_progress = loadStoryProgress(nextStoryCampaign);
        selected_story_scenario_id = nextStoryScenario ||
            story_progress.currentScenarioId;
        setHomeBackground('story', selected_story_campaign_id);
    }
    window.setTimeout(function() {
        refreshContinueButton();
        setHomeBackground(
            selectedGameMode(),
            selectedGameMode() == 'story' ? selected_story_campaign_id : null
        );
    }, 0);
    
    /* 选牌 */
    ui.delegate(document, 'click', '.player_card', function() {
        if(this.onDrag)
            return;
        var cardDom = this,
            selectedCard = sgs.view.cardFor(cardDom),
            cardOut = sgs.interface.cardInfo.out,
            player = sgs.view.playerFor(ui.one('#player'));
        if(action_skill_material_mode) {
            if(cardDom.classList.contains('card_unusable')) {
                return false;
            }
            var materialSelection =
                sgs.interface.bout.toggle_action_skill_material(selectedCard);
            selectedCard.selected = materialSelection.selected;
            cardDom.classList.toggle(
                'action_skill_material_selected',
                materialSelection.selected
            );
            cardDom.setAttribute(
                'aria-pressed',
                materialSelection.selected ? 'true' : 'false'
            );
            sgs.motion.to(
                cardDom,
                { top: materialSelection.selected ? -cardOut : 0 },
                100
            );
            refreshActionSkillMaterialPrompt(materialSelection);
            return false;
        }
        if(this.classList.contains('card_unusable'))
            return false;

        switch(player.stage) {
            case -1:
                ui.all('.player_card').forEach(function(d) {
                    var card = sgs.view.cardFor(d);
                    if(d == cardDom) {
                        sgs.motion.to(d, { top: card.selected ? 0 : -cardOut }, 100);
                        ui.one('#ok').style.display = card.selected ? 'none' : 'block';
                        card.selected = !card.selected;
                        console.log('选牌:', card);
                    } else {
                        sgs.motion.to(d, { top: 0 }, 100);
                        card.selected = false;
                    }
                });
                break;
            case 2:/* 出牌阶段 */
                ui.all('.player_card').forEach(function(d) {/* 设置卡牌选中状态与玩家选中状态 */
                    var card = sgs.view.cardFor(d);
                    if(d == cardDom) {
                        if(selectedCard.selected) { /* 卡牌已被选中时则取消选中 */
                            console.log('取消选牌:', card);
                            sgs.motion.to(cardDom, { top: 0 }, 100);
                            selectedCard.selected = false;
                            clearTargetSelection(player);
                            ui.hide(ui.one('#ok'));/* 隐藏确定按钮 */
                            setActionPhasePrompt();
                        } else { /* 卡牌没有被选中时 */
                            clearTargetSelection(player);
                            selectedCard.selected = true;
                            sgs.motion.to(cardDom, { top: -cardOut }, 100);

                            var targets_info = sgs.interface.bout.select_card(
                                selectedCard,
                                player
                            );
                            console.log('选牌', card, '可选目标:', targets_info[0], '可选目标数:', targets_info[1])
                            if(targets_info[1] < 0) {
                                selectedCard.selected = false;
                                sgs.motion.to(cardDom, { top: 0 }, 100);
                                ui.show(ui.one('.select_unable', cardDom));
                                player.targets = [];
                                player.target_selectable_count = -1;
                                player.target_min_selectable_count = -1;
                                ui.hide(ui.one('#ok'));
                                return;
                            }
                            player.targets = targets_info[0];
                            player.target_selectable_count = targets_info[1];
                            player.target_min_selectable_count = targets_info[2];
                            var target_selection = refreshTargetSelection(
                                player,
                                selectedCard
                            );
                            if(target_selection.canConfirm ||
                               player.targets.length == 1 && player.targets[0] == sgs.view.playerFor(ui.one('#player'))) {
                                ui.show(ui.one('#ok'));
                                setActionPrompt('已选择【' + selectedCard.name + '】，点击“确定”使用');
                            } else {
                                ui.hide(ui.one('#ok'));
                                setActionPrompt('已选择【' + selectedCard.name + '】，请选择目标');
                            }
                        }
                    } else {
                        card.selected = false;
                        sgs.motion.to(d, { top: 0 }, 100);
                    }
                });
                break;
            case 3:/* 弃牌阶段 */
                if(selectedCard.selected) {
                    sgs.motion.to(cardDom, { top: 0 }, 100);
                    selectedCard.selected = false;
                    player.card_selectable_count++;
                } else {
                    if(player.card_selectable_count == 0)
                        return;
                    sgs.motion.to(cardDom, { top: -cardOut }, 100);
                    selectedCard.selected = true;
                    player.card_selectable_count--;
                }
                if(player.card_selectable_count == 0)
                    ui.show(ui.one('#ok'));
                else
                    ui.hide(ui.one('#ok'));
                setActionPrompt(player.card_selectable_count == 0 ?
                    '已选足弃牌，点击“确定”结束回合' :
                    '弃牌阶段：还需选择 ' + player.card_selectable_count + ' 张手牌');
                break;
        }

    });

    /* 选择装备(技能材料) */
    ui.delegate(document, 'click', '.equip_box', function() {
        if(!action_skill_material_mode) {
            return;
        }
        var slot = this.parentElement,
            card = sgs.view.cardFor(slot);
        if(
            !card ||
            !slot.classList.contains('action_skill_material_selectable')
        ) {
            return false;
        }
        var materialSelection =
            sgs.interface.bout.toggle_action_skill_material(card);
        card.selected = materialSelection.selected;
        slot.classList.toggle(
            'action_skill_material_selected',
            materialSelection.selected
        );
        slot.setAttribute(
            'aria-pressed',
            materialSelection.selected ? 'true' : 'false'
        );
        refreshActionSkillMaterialPrompt(materialSelection);
        return false;
    });
    
    /* 拖动 */
    ui.delegate(document, 'dragstart', '.player_card', function(event) {
        event.preventDefault();
    });
    sgs.animation.canPlayCardDrop = function(cardDom) {
        var player = sgs.view.playerFor(ui.one('#player'));
        return !!player &&
            !action_skill_material_mode &&
            player.stage == 2 &&
            !cardDom.classList.contains('card_unusable');
    };
    ui.delegate(document, 'sgs-card-play-drop', '.player_card', function() {
        var card = sgs.view.cardFor(this),
            player = sgs.view.playerFor(ui.one('#player')),
            ok = ui.one('#ok');
        if(!card || !player || player.stage != 2 ||
           this.classList.contains('card_unusable')) {
            return;
        }
        if(!card.selected) {
            this.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
        if(card.selected && getComputedStyle(ok).display != 'none') {
            ok.click();
        }
    });
    ui.delegate(document, 'mousedown', '.player_card', sgs.animation.Mouse_Down);
    document.body.addEventListener('mousemove', sgs.animation.Mouse_Move);
    document.body.addEventListener('mouseup', sgs.animation.Mouse_Up);/* 在卡牌外松开也必须清理拖动状态 */
    
    /* 选择目标 */
    ui.delegate(document, 'click', '.role', function() {
        if(getComputedStyle(ui.one('.role_cover', this)).display == 'block')
            return false;
        
        var player = sgs.view.playerFor(ui.one('#player')),
            target = sgs.view.playerFor(this);
        if(!player || !target || !sgs.interface.bout) {
            return false;
        }
        
        if(player.targets.length == 0 && !target.selected)
            return false;
        
        if(!target.selected) {
            if(player.targets.indexOf(target) == -1)
                return false;
            player.selected_targets.push(target);
            console.log('选择目标:', target, target.nickname);
            var selection = refreshTargetSelection(player);
            if(selection.canConfirm) {
                console.log('可以出牌, 目标:', player.selected_targets);
            }
        } else {
            var selectedIndex = player.selected_targets.indexOf(target),
                removedTargets = player.selected_targets.slice(selectedIndex);
            removedTargets.forEach(function(removed) {
                removed.selected = false;
            });
            player.selected_targets = player.selected_targets.slice(
                0,
                selectedIndex
            );
            console.log('取消选择目标:', target);
            refreshTargetSelection(player);
        }
    });

    /* 确定按钮 */
    ui.one('#ok').addEventListener('click', function() {
        ui.show(ui.one('.hover', this));
        if(action_skill_material_mode) {
            if(!action_skill_material_mode.canConfirm) {
                return;
            }
            endActionSkillMaterialSelection();
            sgs.interface.bout.confirm_action_skill_material();
            return;
        }
        var player = sgs.view.playerFor(ui.one('#player')),
            stage = player.stage,
            selected_cards = [];

        player.card.forEach(function(d) {
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
            sgs.interface.bout.response_card(selected_cards[0]);
        } else if(stage == 2) {
            var selected_target = player.selected_targets.slice();
            if(
                selected_target.length == 0 &&
                player.targets.length == 1 &&
                player.targets[0] == player
            ) {
                selected_target = [player];
            }
            console.log('出牌:', player, '目标:', selected_target);
            lockCommittedCards(player, selected_cards);
            player.stage = -1;
            sgs.interface.bout.choice_card(
                selected_cards[0],
                selected_target
            );
        } else if(stage == 3) {
            lockCommittedCards(player, selected_cards);
            player.stage = -1;
            sgs.interface.bout.discard(selected_cards);
        }
    });
    
    /* 取消按钮 */
    ui.one('#cancel').addEventListener('click', function() {
        if(action_skill_material_mode) {
            if(!action_skill_material_mode.canCancel) {
                return;
            }
            endActionSkillMaterialSelection();
            sgs.interface.bout.back_action_skill_material();
            return;
        }
        var player = sgs.view.playerFor(ui.one('#player')),
            pending_response = player.pending_response,
            response_target = pending_response ? pending_response.source : player;
        switch(player.stage) {
            case -1:
                resetInteraction(player, true);
                player.pending_response = undefined;
                sgs.interface.bout.response_card();
                break;
        }
    });
    
    /* 弃牌按钮 */
    ui.one('#abandon').addEventListener('click', function() {
        if(this.getAttribute('aria-disabled') == 'true')
            return false;
        ui.show(ui.one('.hover', this));
        var player = sgs.view.playerFor(ui.one('#player')),
            discard_count = Math.max(0, player.card.length - player.blood);
        clearCardSelection(player);
        clearTargetSelection(player);
        ui.all('#ok, #cancel, #abandon').forEach(ui.hide);
        player.card_selectable_count = discard_count;
        player.stage = 3;
        setActionPrompt(discard_count > 0 ?
            '弃牌阶段：请选择 ' + discard_count + ' 张手牌' : '');
        if(discard_count == 0) {
            ui.show(ui.one('#player_cover'));
            player.stage = -1;
            sgs.interface.bout.discard([]);
        }
    });

    /* 五谷丰登等选牌 */
    ui.delegate(document, 'click', '.choose_card', function() {
        if(sgs.interface.bout && sgs.interface.bout.choose_card) {
            var selected = sgs.view.cardFor(this);
            ui.all('#choose_box_bgcover, #choose_box').forEach(ui.remove);
            sgs.interface.bout.choose_card(selected);
        }
    });

    ui.delegate(document, 'click', '#guanxing_confirm', function() {
        if(sgs.interface.bout && sgs.interface.bout.arrange_guanxing) {
            var topCards = ui.all('#guanxing_top .guanxing_card').map(
                    function(card) { return sgs.view.cardFor(card); }
                ),
                bottomCards = ui.all('#guanxing_bottom .guanxing_card').map(
                    function(card) { return sgs.view.cardFor(card); }
                );
            ui.all('#choose_box_bgcover, #choose_box').forEach(ui.remove);
            sgs.interface.bout.arrange_guanxing(topCards, bottomCards);
        }
    });

    ui.delegate(document, 'click', '.skill_tag.active_skill_available', function() {
        if(
            action_skill_material_mode ||
            !sgs.interface.bout ||
            !sgs.interface.bout.activate_action_skill
        ) {
            return;
        }
        var skillId = this.getAttribute('data-skill-id');
        if(!skillId) {
            return;
        }
        hide_explanation();
        sgs.interface.bout.activate_action_skill(skillId);
    });

    ui.delegate(document, 'click', '.equipment_skill_available', function() {
        if(
            action_skill_material_mode ||
            !sgs.interface.bout ||
            !sgs.interface.bout.activate_equipment_skill
        ) {
            return;
        }
        var skillId = this.getAttribute('data-equipment-skill-id');
        if(!skillId) {
            return;
        }
        hide_explanation();
        sgs.interface.bout.activate_equipment_skill(skillId);
    });

    ui.delegate(document, 'keydown', '.equipment_skill_available', function(e) {
        if(e.key != 'Enter' && e.key != ' ') {
            return;
        }
        e.preventDefault();
        this.click();
    });

    ui.delegate(document, 'click', '.choose_option', function() {
        if(sgs.interface.bout && sgs.interface.bout.choose_option) {
            var option = this.option;
            ui.all('#choose_box_bgcover, #choose_box').forEach(ui.remove);
            sgs.interface.bout.choose_option(option);
        }
    });

    ui.delegate(document, 'click', '.choose_players', function() {
        if(sgs.interface.bout && sgs.interface.bout.choose_players) {
            var player_ids = this.player_ids;
            ui.all('#choose_box_bgcover, #choose_box').forEach(ui.remove);
            sgs.interface.bout.choose_players(player_ids);
        }
    });
    
    var hide_explanation = function() {
        var expDom = ui.one('#explanation');
        if(expDom.explanation_id != undefined)
            clearTimeout(expDom.explanation_id);
        ui.style(expDom, {
            display: 'none',
            visibility: 'hidden',
            zIndex: 0
        });
    };

    var schedule_explanation = function(show, clientX, clientY, delay) {
        var expDom = ui.one('#explanation');
        hide_explanation();
        expDom.explanation_id = setTimeout(function() {
            if(show(clientX, clientY) !== false) {
                ui.style(expDom, {
                    display: 'block',
                    visibility: 'visible',
                    zIndex: 999
                });
            }
        }, delay);
    };

    /* 自定义说明浮层与浏览器原生 title 不应同时出现。 */
    var disable_native_explanation_title = function(element) {
        if(element && element.hasAttribute('title')) {
            element.removeAttribute('title');
        }
    };

    /* 单个技能文本标签优先显示对应技能说明。 */
    ui.delegate(document, 'mousemove', '.skill_tag', function(e) {
        var skillName = this.getAttribute('data-skill-name');
        disable_native_explanation_title(this);
        e.stopPropagation();
        schedule_explanation(function(clientX, clientY) {
            sgs.animation.Skill_Explanation(
                skillName,
                false,
                clientX,
                clientY
            );
        }, e.clientX, e.clientY, 220);
    });
    ['mouseout', 'mouseup'].forEach(function(eventName) {
        ui.delegate(document, eventName, '.skill_tag', function(e) {
        e.stopPropagation();
        hide_explanation();
        });
    });
    ui.delegate(document, 'focusin', '.skill_tag', function() {
        var skillName = this.getAttribute('data-skill-name'),
            rect = this.getBoundingClientRect();
        sgs.animation.Skill_Explanation(
            skillName,
            false,
            rect.right,
            rect.bottom
        );
        ui.style(ui.one('#explanation'), {
            display: 'block',
            visibility: 'visible',
            zIndex: 999
        });
    });
    ui.delegate(document, 'focusout', '.skill_tag', hide_explanation);

    /* 显示武将和技能解释 */
    var heroExplanationSelector = '.choose_role_card, .head_img, #player_head';
    ui.delegate(document, 'mousemove', heroExplanationSelector, function(e) {
        if(e.target.closest('.skill_tag')) {
            return;
        }
        disable_native_explanation_title(this);
        var heroName = this.name;
        schedule_explanation(function(clientX, clientY) {
            sgs.animation.Skill_Explanation(
                heroName,
                true,
                clientX,
                clientY
            );
        }, e.clientX, e.clientY, 600);
    });
    ['mouseout', 'mouseup'].forEach(function(eventName) {
        ui.delegate(document, eventName, heroExplanationSelector, hide_explanation);
    });

    /* 显示手牌、桌面牌、判定牌和装备牌解释 */
    var cardExplanationSelector = '.player_card, .table_card, .choose_card, .guanxing_card, .discard_card, .delayed_status, #attack, #defend, #attack_horse, #defend_horse, .attack, .defend, .attack_horse, .defend_horse';
    ui.delegate(document, 'mousemove', cardExplanationSelector, function(e) {
        var card = sgs.view.cardFor(this),
            cardName = card && card.name ?
                card.name :
                (this.getAttribute('data-card-name') || this.getAttribute('aria-label'));
        if(!cardName || !sgs.CARD_EXPLANATION_MAPPING[cardName]) {
            return;
        }
        disable_native_explanation_title(this);
        this.setAttribute('aria-describedby', 'explanation');
        schedule_explanation(function(clientX, clientY) {
            return sgs.animation.Card_Explanation(
                card || cardName,
                clientX,
                clientY
            );
        }, e.clientX, e.clientY, 350);
    });
    ['mouseout', 'mouseup'].forEach(function(eventName) {
        ui.delegate(document, eventName, cardExplanationSelector, hide_explanation);
    });

    /* 非当前玩家回合时遮罩仍允许查看其下方手牌说明，但不放行点击。 */
    ui.delegate(document, 'mousemove', '#player_cover', function(e) {
        var matchedDom,
            matchedCard;
        ui.all('#cards > .player_card').some(function(cardDom) {
            var rect = cardDom.getBoundingClientRect();
            if(
                e.clientX >= rect.left &&
                e.clientX <= rect.right &&
                e.clientY >= rect.top &&
                e.clientY <= rect.bottom
            ) {
                matchedDom = cardDom;
                matchedCard = sgs.view.cardFor(cardDom);
                return true;
            }
            return false;
        });
        if(!matchedCard || !sgs.CARD_EXPLANATION_MAPPING[matchedCard.name]) {
            hide_explanation();
            return;
        }
        matchedDom.setAttribute('aria-describedby', 'explanation');
        schedule_explanation(function(clientX, clientY) {
            return sgs.animation.Card_Explanation(
                matchedCard,
                clientX,
                clientY
            );
        }, e.clientX, e.clientY, 350);
    });
    ['mouseout', 'mouseup'].forEach(function(eventName) {
        ui.delegate(document, eventName, '#player_cover', hide_explanation);
    });

    var explanation = ui.one('#explanation');
    explanation.addEventListener('mouseenter', function() {
        this.hover = true;
        clearTimeout(this.explanation_id);
    });
    explanation.addEventListener('mouseleave', function() {
        this.hover = false;
        hide_explanation();
    });
    
    /* 身份按钮 */
    ui.one('#player_identity').addEventListener('click', function() {
        var target = ui.one('img', this);
        target.style.display = getComputedStyle(target).display == 'none' ? 'block' : 'none';
    });
    ui.delegate(document, 'click', '.role_identity', function(e) {
        var image = ui.one('img', this),
            imgSrcPart = image.getAttribute('src').split('/');
        if(imgSrcPart[imgSrcPart.length - 1] == 'king.png') {
            if(!ui.one('span', this))
                this.append(ui.create('<span style="display:none;"></span>'));
            image.setAttribute('src', 'img/none.png');
        } else if(ui.one('span', this)) {
            image.setAttribute('src', sgs.IDENTITY_IMG_MAPPING[0]);
        } else {
            image.setAttribute('src', 'img/system/none.png');
            var target = this.nextElementSibling;
            if(target && target.matches('.role_identity_select')) {
                target.style.display = getComputedStyle(target).display == 'none' ? 'block' : 'none';
            }
        }
        e.preventDefault();
        e.stopPropagation();
    });
    ui.delegate(document, 'click', '.role_identity_select img', function(e) {
        var picker = this.parentElement,
            identityButton = picker.previousElementSibling;
        ui.one('img', identityButton).setAttribute('src', this.getAttribute('src'));
        ui.hide(picker);
        e.preventDefault();
        e.stopPropagation();
    });

    /* 按钮样式变化 */
    ui.all('#ok, #cancel, #abandon').forEach(function(button) {
        button.addEventListener('mouseenter', function() {
            ui.hide(ui.one('.normal', this));
            ui.show(ui.one('.hover', this));
        });
        button.addEventListener('mouseleave', function() {
            ui.show(ui.one('.normal', this));
            ui.hide(ui.one('.hover', this));
        });
        button.addEventListener('mousedown', function(e) {
            if(e.button != 0) {
                e.preventDefault();
                return;
            }
            ui.hide(ui.one('.hover', this));
        });
    });

    ui.one('#main').addEventListener('mousedown', function(e) {
        if(e.target.closest('input, button, select, textarea, label')) {
            return;
        }
        e.preventDefault();
    });
    
    /* 取消浏览器默认拖动 */
    ui.delegate(document, 'dragstart', 'img', function(e) {
        e.preventDefault();
    });
};

if(document.readyState == 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGame);
} else {
    initializeGame();
}
