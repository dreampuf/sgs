var sgs = sgs || {};

(function (sgs) {
    var dom = sgs.dom;

    sgs.interface = {};
    sgs.interface.bout = {};

    sgs.interface.HERO_PROPERTY_MAPPING = {};
    sgs.HERO.forEach(function(hero) {
        sgs.interface.HERO_PROPERTY_MAPPING[hero.name] = {
            skill: hero.skills
        };
    });

    sgs.interface.heroImage = function(name, size) {
        var image = sgs.HEROIMAG_MAPPING[name] || 'none.png';
        if(image.indexOf('/') == -1) {
            return 'img/generals/' + size + '/' + image;
        }
        if((size == 'big' || size == 'small') &&
           image.indexOf('expansion/shenhua/hero/') == 0) {
            image = image.replace(
                'expansion/shenhua/hero/',
                'expansion/shenhua/portrait/' + size + '/'
            );
        }
        return 'img/' + image;
    };

    sgs.interface.cardImage = function(name) {
        var image = sgs.CARDIMAG_MAPING[name] ||
            (sgs.CARDIMAG_MAPPING && sgs.CARDIMAG_MAPPING[name]) ||
            'img/system/none.png';
        if(image.indexOf('img/') === 0) return image;
        return image.indexOf('/') == -1 ? image : 'img/' + image;
    };

    sgs.interface.cardInfo = {
        width: 95,
        height: 133,
        out: 20
    };

    sgs.interface.Render_Skill_Tags = function(player) {
        var playerElement = sgs.view.playerElement(player),
            isSelf = playerElement == dom.one('#player'),
            anchor = isSelf ? dom.one('#player_head') : playerElement,
            skills = player.hero.skills || [],
            previous = anchor.querySelector('.skill_tags'),
            container;
        dom.remove(previous);
        container = dom.create(
            '<div class="skill_tags" role="list" aria-label="武将技能"></div>'
        );
        skills.forEach(function(skillName) {
            var tag = dom.create(
                '<span class="skill_tag" role="listitem" tabindex="0"></span>'
            );
            dom.text(tag, skillName);
            dom.attrs(tag, {
                'data-skill-name': skillName,
                'aria-label': '技能：' + skillName
            });
            container.append(tag);
        });
        anchor.append(container);
    };

    sgs.interface.Set_Action_Skill_Tags = function(player, skills) {
        var playerElement = sgs.view.playerElement(player),
            isSelf = playerElement == dom.one('#player'),
            anchor = isSelf ? dom.one('#player_head') : playerElement,
            activeByName = {};
        skills.forEach(function(skill) {
            activeByName[skill.name] = skill;
        });
        dom.all('.skill_tag', anchor).forEach(function(tag) {
            var skillName = tag.getAttribute('data-skill-name'),
                skill = activeByName[skillName],
                skillId = skill && skill.id,
                active = !!skill;
            tag.classList.toggle('active_skill_available', active);
            tag.classList.toggle(
                'active_skill_engaged',
                active && !!skill.active
            );
            tag.setAttribute('aria-disabled', active ? 'false' : 'true');
            if(active) {
                tag.setAttribute('data-skill-id', skillId);
                tag.setAttribute('role', 'button');
                tag.setAttribute(
                    'aria-label',
                    skill.active ?
                        '技能：' + skillName + '，正在发动' :
                        '技能：' + skillName + '，点击发动'
                );
            } else {
                tag.removeAttribute('data-skill-id');
                tag.setAttribute('role', 'listitem');
                tag.setAttribute('aria-label', '技能：' + skillName);
            }
            tag.removeAttribute('title');
        });
    };

    sgs.interface.Set_Equipment_Skill_States = function(player, skills) {
        if(sgs.view.playerElement(player) != dom.one('#player')) {
            return;
        }
        var slots = dom.all('#attack, #defend, #attack_horse, #defend_horse');
        slots.forEach(function(slot) {
            var cardName = slot.getAttribute('data-card-name');
            slot.classList.remove(
                'equipment_skill_available',
                'equipment_skill_active'
            );
            slot.removeAttribute('data-equipment-skill-id');
            slot.removeAttribute('role');
            slot.removeAttribute('tabindex');
            slot.setAttribute('aria-disabled', 'true');
            if(cardName) {
                slot.setAttribute('aria-label', cardName);
            }
        });
        skills.forEach(function(skill) {
            var slot = slots.find(function(candidate) {
                return candidate.getAttribute('data-card-name') ==
                    skill.cardName;
            });
            if(!slot) {
                return;
            }
            slot.classList.add('equipment_skill_available');
            slot.classList.toggle('equipment_skill_active', !!skill.active);
            slot.setAttribute('data-equipment-skill-id', skill.id);
            slot.setAttribute('role', 'button');
            slot.setAttribute('tabindex', '0');
            slot.setAttribute('aria-disabled', 'false');
            slot.setAttribute(
                'aria-label',
                skill.cardName + (skill.active ?
                    '：正在发动' :
                    '：可发动，点击使用')
            );
        });
    };

    sgs.interface.Render_Country_Badge = function(player) {
        var playerElement = sgs.view.playerElement(player),
            isSelf = playerElement == dom.one('#player'),
            anchor = isSelf ? dom.one('#player_head') : playerElement,
            country = player.hero.country || '',
            countryName = {
                wei: '魏',
                shu: '蜀',
                wu: '吴',
                qun: '群',
                god: '神'
            }[country] || country,
            countryClass = {
                '魏': 'wei',
                '蜀': 'shu',
                '吴': 'wu',
                '群': 'qun',
                '神': 'god',
                wei: 'wei',
                shu: 'shu',
                wu: 'wu',
                qun: 'qun',
                god: 'god'
            }[country] || 'unknown',
            previous = anchor.querySelector('.country_badge'),
            badge;
        dom.remove(previous);
        badge = dom.create('<span class="country_badge"></span>');
        badge.classList.add('country_' + countryClass);
        dom.text(badge, countryName);
        dom.attrs(badge, {
            'data-country': countryName,
            'aria-label': countryName + '阵营',
            title: countryName + '阵营'
        });
        anchor.append(badge);
    };

    sgs.interface.Set_RoleInfo = function(player, targetElement) {
        if(targetElement !== undefined) {
            sgs.view.bindPlayer(player, targetElement);
        }
        var playerElement = sgs.view.playerElement(player);
        if(!player.isAI) {
            dom.attrs(dom.one('#player_country'), {
                src: sgs.COUNTRY_IMG_MAPPING[player.hero.country]
            });
            dom.text(dom.one('#player_name'), player.nickname);
            dom.attrs(dom.one('#player_head_img'), {
                src: sgs.interface.heroImage(player.hero.name, 'big')
            });
            for(var i = 0; i < player.maxBlood; i++) {
                dom.append(
                    dom.one('#player_blod_0'),
                    '<img src="img/system/blod_0.png" />'
                );
                dom.append(
                    dom.one('#player_blod_1'),
                    '<img src="img/system/blod_1.png" />'
                );
            }
            dom.attrs(dom.one('#player_identity img'), {
                src: sgs.IDENTITY_IMG_MAPPING[player.identity]
            });
            dom.one('#player_head').name = player.hero.name;
        } else {
            dom.attrs(playerElement.querySelector('.role_country img'), {
                src: sgs.COUNTRY_IMG_MAPPING[player.hero.country]
            });
            dom.text(
                playerElement.querySelector('.role_name'),
                '_' + player.hero.name + '_'
            );
            if(player.identity == 0) {
                dom.attrs(playerElement.querySelector('.role_identity img'), {
                    src: sgs.IDENTITY_IMG_MAPPING[0]
                });
            }
            dom.attrs(playerElement.querySelector('.head_img img'), {
                src: sgs.interface.heroImage(player.hero.name, 'small')
            });
            for(var k = 0; k < player.maxBlood; k++) {
                dom.append(
                    playerElement.querySelector('.blods_0'),
                    '<img src="img/system/blod_0.png" />'
                );
                dom.append(
                    playerElement.querySelector('.blods_1'),
                    '<img src="img/system/blod_1.png" />'
                );
            }
            playerElement.querySelector('.head_img').name = player.hero.name;
        }
        sgs.interface.Render_Country_Badge(player);
        sgs.interface.Render_Skill_Tags(player);
    };

    sgs.interface.Load_Data = function() {
        var loading = dom.one('#data_load'),
            imageContainer = dom.one('#load_imgs'),
            percentage = dom.one('#data_load_perc'),
            count = 0;
        dom.show(loading);
        sgs.IMG_LIST.forEach(function(source) {
            var image = document.createElement('img');
            image.addEventListener('load', function() {
                count++;
                if(/data_load_bg.jpg/.test(image.getAttribute('src'))) {
                    dom.show(dom.one('#main'));
                }
                dom.text(
                    percentage,
                    parseInt(count / sgs.IMG_LIST.length * 100, 10) + '%'
                );
                if(count == sgs.IMG_LIST.length) {
                    sgs.motion.to(loading, { opacity: 0 }, 1000).then(
                        function() { dom.hide(loading); }
                    );
                }
            });
            image.src = source;
            imageContainer.append(image);
        });
    };

    sgs.interface.Show_CardChooseBox = function(
        title,
        cards,
        identityInfo,
        presentation
    ) {
        dom.text(dom.one('#action_prompt'), '');
        dom.hide(dom.one('#action_prompt'));
        var cardCount = cards.length,
            titleWidth = title.length * 18 + 20,
            titleHeight = 24,
            cardPadding = 3,
            boxWidth = cardCount * 93 +
                (cardCount - 1) * cardPadding * 2 + 40,
            contextText = presentation && presentation.contextText
                ? presentation.contextText
                : '',
            boxHeight = (identityInfo === undefined ? 180 : 210) +
                (contextText ? 36 : 0),
            background = dom.create('<div id="choose_box_bgcover"></div>'),
            box = dom.create([
                '<div id="choose_box"><div><div id="choose_box_content">',
                '<div id="choose_box_bgimgs">',
                '<img id="choose_box_bg" src="img/system/card_choose_bg.png" />',
                '<div id="choose_box_title">',
                '<img src="img/system/card_choose_title.png" /><font></font>',
                '</div></div><div id="choose_cards"></div>',
                '</div></div></div>'
            ].join('')),
            titleElement = box.querySelector('#choose_box_title'),
            content = box.querySelector('#choose_box_content'),
            cardContainer = box.querySelector('#choose_cards');

        dom.style(titleElement, {
            width: titleWidth,
            height: titleHeight,
            left: (boxWidth - titleWidth) / 2
        });
        dom.style(titleElement.querySelector('font'), {
            lineHeight: titleHeight
        });
        dom.style(content, {
            width: boxWidth,
            height: boxHeight
        });
        dom.text(titleElement.querySelector('font'), title);
        if(contextText) {
            var contextElement = dom.create(
                '<div class="choose_box_context"></div>'
            );
            dom.text(contextElement, contextText);
            content.append(contextElement);
            dom.style(cardContainer, 'margin-top', '58px');
        }

        if(identityInfo !== undefined) {
            cards.forEach(function(hero, index) {
                var card = dom.create(
                    '<div class="choose_role_card"><img src="' +
                    sgs.interface.heroImage(hero.name, 'hero') + '" /></div>'
                );
                card.name = hero.name;
                dom.attrs(card, {
                    role: 'button',
                    'aria-label': hero.name
                });
                dom.style(card, 'left', index * (93 + cardPadding * 2) + 'px');
                cardContainer.append(card);
            });
            dom.append(content, [
                '<div class="player_progress_bar" ',
                'style="display:block;bottom:25px;left:20px;">',
                '<img class="player_progress_bg" ',
                'src="img/system/progress/big/progress_bg.png" />',
                '<img class="player_progress" ',
                'src="img/system/progress/big/progress.png" />',
                '<img class="player_progress_bg" ',
                'src="img/system/progress/big/progress_border.png" />',
                '</div><div id="identity"></div>'
            ].join(''));
            dom.text(content.querySelector('#identity'), identityInfo);
            dom.style(content.querySelector('.player_progress_bar'), {
                height: 15,
                left: (boxWidth - 300) / 2,
                bottom: 30
            });
        } else {
            cards.forEach(function(cardModel, index) {
                var hidden = presentation &&
                        presentation.hiddenCards &&
                        presentation.hiddenCards.indexOf(cardModel) != -1,
                    zoneLabel = presentation && presentation.zoneLabels
                        ? presentation.zoneLabels[index]
                        : '',
                    card = hidden
                        ? dom.create(
                            '<div class="choose_card hidden_choice_card">' +
                            '<img src="img/system/card_back.png" />' +
                            '<div class="select_unable"></div></div>'
                        )
                        : dom.create([
                            '<div class="choose_card"><img src="',
                            sgs.interface.cardImage(cardModel.name),
                            '" /><div class="pat_num" style="color:',
                            sgs.CARD_COLOR_NUM_MAPPING.color[cardModel.color],
                            ';"><span class="pattern"><img src="',
                            sgs.PATTERN_IMG_MAPPING[cardModel.color],
                            '" /></span><span class="num">',
                            sgs.CARD_COLOR_NUM_MAPPING.number[cardModel.digit],
                            '</span></div><div class="select_unable"></div></div>'
                        ].join(''));
                card.name = cardModel.name;
                dom.attrs(card, {
                    role: 'button',
                    'aria-label': hidden ? '目标手牌（未知）' : cardModel.name
                });
                if(zoneLabel) {
                    var label = dom.create(
                        '<span class="choice_zone_label"></span>'
                    );
                    dom.text(label, zoneLabel);
                    card.append(label);
                }
                sgs.view.bindCardPreview(cardModel, card);
                dom.style(card, 'left', index * (93 + cardPadding * 2) + 'px');
                cardContainer.append(card);
            });
        }
        dom.one('#main').append(background, box);
    };

    sgs.interface.Show_GuanxingArrangeBox = function(
        title,
        cards,
        contextText
    ) {
        dom.text(dom.one('#action_prompt'), '');
        dom.hide(dom.one('#action_prompt'));
        dom.all('#choose_box_bgcover, #choose_box').forEach(dom.remove);
        var background = dom.create('<div id="choose_box_bgcover"></div>'),
            box = dom.create([
                '<div id="choose_box" class="guanxing_arrange_box">',
                '<div><div id="choose_box_content">',
                '<div id="choose_box_title"><font></font></div>',
                '<div class="choose_box_context"></div>',
                '<div class="guanxing_board">',
                '<section class="guanxing_zone guanxing_top_zone">',
                '<div class="guanxing_zone_heading">',
                '<strong>牌堆顶</strong><span>最左边最先判定／摸取</span>',
                '</div><div id="guanxing_top" class="guanxing_sequence" ',
                'data-zone="top"></div></section>',
                '<div class="guanxing_deck_divider" aria-hidden="true">',
                '<div class="guanxing_deck_stack"><i></i><i></i><i></i></div>',
                '<span>牌堆</span></div>',
                '<section class="guanxing_zone guanxing_bottom_zone">',
                '<div class="guanxing_zone_heading">',
                '<strong>牌堆底</strong><span>最右边最后进入牌堆</span>',
                '</div><div id="guanxing_bottom" class="guanxing_sequence" ',
                'data-zone="bottom"></div></section>',
                '</div><div class="guanxing_actions">',
                '<span>拖动卡牌调整顺序；点击卡牌可快速切换上下区域</span>',
                '<button id="guanxing_confirm" type="button">确认观星</button>',
                '</div></div></div></div>'
            ].join('')),
            content = box.querySelector('#choose_box_content'),
            titleElement = box.querySelector('#choose_box_title'),
            topSequence = box.querySelector('#guanxing_top'),
            bottomSequence = box.querySelector('#guanxing_bottom'),
            draggedCard = null,
            dragPointerId = null,
            dragStartX = 0,
            dragStartY = 0,
            didDrag = false,
            suppressClick = false;

        dom.style(content, { width: 900, height: 300 });
        dom.style(titleElement, { width: 500, left: 200 });
        dom.text(titleElement.querySelector('font'), title);
        dom.text(
            content.querySelector('.choose_box_context'),
            contextText || ''
        );

        var updateOrder = function() {
            [topSequence, bottomSequence].forEach(function(sequence) {
                dom.all('.guanxing_card', sequence).forEach(
                    function(card, index) {
                        var order = card.querySelector('.guanxing_order');
                        dom.text(order, String(index + 1));
                        card.setAttribute(
                            'aria-label',
                            card.name + '，' +
                                (sequence === topSequence
                                    ? '牌堆顶第 '
                                    : '牌堆底第 ') +
                                (index + 1) + ' 张'
                        );
                    }
                );
            });
        };
        var insertAtPointer = function(sequence, card, clientX) {
            var sibling = dom.all('.guanxing_card:not(.dragging)', sequence)
                .find(function(candidate) {
                    var rect = candidate.getBoundingClientRect();
                    return clientX < rect.left + rect.width / 2;
                });
            sequence.insertBefore(card, sibling || null);
            updateOrder();
        };
        var moveByKeyboard = function(card, event) {
            var sequence = card.parentNode,
                sibling;
            if(event.key == 'ArrowLeft') {
                sibling = card.previousElementSibling;
                if(sibling) sequence.insertBefore(card, sibling);
            } else if(event.key == 'ArrowRight') {
                sibling = card.nextElementSibling;
                if(sibling) sequence.insertBefore(sibling, card);
            } else if(event.key == 'ArrowUp' || event.key == 'ArrowDown') {
                (sequence === topSequence
                    ? bottomSequence
                    : topSequence).append(card);
            } else {
                return;
            }
            event.preventDefault();
            updateOrder();
            card.focus();
        };

        cards.forEach(function(cardModel, cardIndex) {
            var card = dom.create([
                '<div class="guanxing_card" tabindex="0">',
                '<img draggable="false" src="',
                sgs.interface.cardImage(cardModel.name), '" />',
                '<div class="pat_num" style="color:',
                sgs.CARD_COLOR_NUM_MAPPING.color[cardModel.color],
                ';"><span class="pattern"><img draggable="false" src="',
                sgs.PATTERN_IMG_MAPPING[cardModel.color],
                '" /></span><span class="num">',
                sgs.CARD_COLOR_NUM_MAPPING.number[cardModel.digit],
                '</span></div><span class="guanxing_order"></span>',
                '</div>'
            ].join(''));
            card.name = cardModel.name;
            dom.attrs(card, {
                role: 'button',
                'data-guanxing-card': String(cardIndex),
                'aria-label': cardModel.name
            });
            sgs.view.bindCardPreview(cardModel, card);
            card.addEventListener('pointerdown', function(event) {
                if(event.button !== 0) return;
                draggedCard = card;
                dragPointerId = event.pointerId;
                dragStartX = event.clientX;
                dragStartY = event.clientY;
                didDrag = false;
                suppressClick = false;
                card.setPointerCapture(event.pointerId);
            });
            card.addEventListener('click', function() {
                if(suppressClick) {
                    suppressClick = false;
                    return;
                }
                (card.parentNode === topSequence
                    ? bottomSequence
                    : topSequence).append(card);
                updateOrder();
            });
            card.addEventListener('keydown', function(event) {
                moveByKeyboard(card, event);
            });
            topSequence.append(card);
        });
        box.addEventListener('pointermove', function(event) {
            if(!draggedCard || event.pointerId !== dragPointerId) return;
            if(
                !didDrag &&
                Math.hypot(
                    event.clientX - dragStartX,
                    event.clientY - dragStartY
                ) < 5
            ) {
                return;
            }
            didDrag = true;
            draggedCard.classList.add('dragging');
            var hovered = document.elementFromPoint(
                    event.clientX,
                    event.clientY
                ),
                sequence = hovered && hovered.closest('.guanxing_sequence');
            if(sequence && box.contains(sequence)) {
                insertAtPointer(sequence, draggedCard, event.clientX);
            }
            event.preventDefault();
        });
        var finishPointerDrag = function(event) {
            if(!draggedCard || event.pointerId !== dragPointerId) return;
            draggedCard.classList.remove('dragging');
            if(draggedCard.hasPointerCapture(event.pointerId)) {
                draggedCard.releasePointerCapture(event.pointerId);
            }
            suppressClick = didDrag;
            draggedCard = null;
            dragPointerId = null;
            didDrag = false;
            updateOrder();
        };
        box.addEventListener('pointerup', finishPointerDrag);
        box.addEventListener('pointercancel', finishPointerDrag);
        updateOrder();
        dom.one('#main').append(background, box);
    };

    sgs.interface.Show_OptionChooseBox = function(
        title,
        options,
        contextText
    ) {
        dom.text(dom.one('#action_prompt'), '');
        dom.hide(dom.one('#action_prompt'));
        var columnCount = Math.max(1, Math.min(6, options.length)),
            rowCount = Math.ceil(options.length / columnCount),
            boxWidth = Math.max(300, columnCount * 138 + 40),
            hasContext = !!contextText,
            optionTop = hasContext ? 82 : 46,
            boxHeight = optionTop + rowCount * 46 + 20,
            background = dom.create('<div id="choose_box_bgcover"></div>'),
            box = dom.create([
                '<div id="choose_box"><div><div id="choose_box_content">',
                '<div id="choose_box_title"><font></font></div>',
                hasContext ? '<div class="choose_box_context"></div>' : '',
                '<div id="choose_options"></div>',
                '</div></div></div>'
            ].join('')),
            content = box.querySelector('#choose_box_content'),
            titleElement = box.querySelector('#choose_box_title'),
            optionContainer = box.querySelector('#choose_options');
        dom.style(content, { width: boxWidth, height: boxHeight });
        dom.style(titleElement, { width: boxWidth - 30, left: 15 });
        dom.text(titleElement.querySelector('font'), title);
        if(hasContext) {
            dom.text(content.querySelector('.choose_box_context'), contextText);
        }
        dom.style(optionContainer, {
            position: 'absolute',
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignContent: 'flex-start',
            gap: '8px 12px',
            top: optionTop,
            left: 15,
            right: 15
        });
        options.forEach(function(option) {
            var item = typeof option === 'string'
                    ? { label: option, value: option }
                    : option,
                button;
            button = dom.create(
                '<button class="choose_option"></button>'
            );
            dom.text(button, item.label);
            button.option = item.value;
            dom.style(button, {
                position: 'relative',
                margin: 0,
                minWidth: 116,
                height: 32
            });
            optionContainer.append(button);
        });
        dom.one('#main').append(background, box);
    };

    sgs.interface.Show_PlayerChooseBox = function(
        title,
        options,
        contextText
    ) {
        var values = options.map(function(option) { return option.value; });
        sgs.interface.Show_OptionChooseBox(title, options, contextText);
        dom.all('#choose_options .choose_option').forEach(
            function(button, index) {
                button.classList.remove('choose_option');
                button.classList.add('choose_players');
                button.player_ids = values[index];
            }
        );
    };
})(window.sgs);
