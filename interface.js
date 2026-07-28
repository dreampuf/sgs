var sgs = sgs || {};

(function (sgs) {
    
    sgs.interface = {};

    sgs.interface.bout = {};
    
    sgs.interface.HERO_PROPERTY_MAPPING = {};
    $.each(sgs.HERO, (function(hero_mapping) {
        return function(i, d) {
            hero_mapping[d.name] = { "skill": d.skills };
        }
    })(sgs.interface.HERO_PROPERTY_MAPPING));

    sgs.interface.heroImage = function(name, size) {
        var image = sgs.HEROIMAG_MAPPING[name] || 'none.png';
        if(image.indexOf('/') == -1) {
            return 'img/generals/' + size + '/' + image;
        }
        if((size == 'big' || size == 'small') &&
           image.indexOf('expansion/shenhua/hero/') == 0) {
            image = image.replace('expansion/shenhua/hero/',
                'expansion/shenhua/portrait/' + size + '/');
        }
        return 'img/' + image;
    };
    sgs.interface.cardImage = function(name) {
        var image = sgs.CARDIMAG_MAPING[name] || (sgs.CARDIMAG_MAPPING && sgs.CARDIMAG_MAPPING[name]) || 'img/system/none.png';
        if(image.indexOf('img/') === 0) {
            return image;
        }
        return image.indexOf('/') == -1 ? image : 'img/' + image;
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
    
    /* 设置信息 */
    sgs.interface.Set_RoleInfo = function(player, dom) {
        if(dom != undefined)
            sgs.view.bindPlayer(player, dom);
        var playerDom = sgs.view.playerElement(player);
        if(!player.isAI) {
            $('#player_country').attr('src', sgs.COUNTRY_IMG_MAPPING[player.hero.country]);
            $('#player_name').text(player.nickname);
            $('#player_head_img').attr('src', sgs.interface.heroImage(player.hero.name, 'big'));
            for (var i = 0; i < player.maxBlood; i++) {
                $('<img src="img/system/blod_0.png" />').appendTo($('#player_blod_0'));
                $('<img src="img/system/blod_1.png" />').appendTo($('#player_blod_1'));
            }
            $("#player_identity img").attr('src', sgs.IDENTITY_IMG_MAPPING[player.identity]);
            $('#player_head')[0].name = player.hero.name;
        } else {
            $(playerDom).find('.role_country img').attr('src', sgs.COUNTRY_IMG_MAPPING[player.hero.country]);
            $(playerDom).find('.role_name').text('_' + player.hero.name + '_');
            if(player.identity == 0)
                $(playerDom).find('.role_identity img').attr('src', sgs.IDENTITY_IMG_MAPPING[0]);
            $(playerDom).find('.head_img img').attr('src', sgs.interface.heroImage(player.hero.name, 'small'));
            for(var k = 0; k < player.maxBlood; k++) {
                $(playerDom).find('.blods_0').append('<img src="img/system/blod_0.png" />');
                $(playerDom).find('.blods_1').append('<img src="img/system/blod_1.png" />');
            }
            $(playerDom).find('.head_img')[0].name = player.hero.name;
        }
    };

    /* 数据加载 */
    sgs.interface.Load_Data = function() {
        $('#data_load').css('display', 'block');
        $.each(sgs.IMG_LIST, function(i, d) {
            $('#load_imgs').append($('<img src=' + d + ' />'));
        });
        var count = 0;
        $('#load_imgs img').load(function() {
            count++;
            if(/data_load_bg.jpg/.test($(this).attr('src')))
                $('#main').css('display', 'block');
            $('#data_load_perc').text(parseInt(count / sgs.IMG_LIST.length * 100) + '%');
            if(count == sgs.IMG_LIST.length) {
                sgs.motion.to($('#data_load'), { opacity: 0 }, 1000).then(function() {
                    $('#data_load').css('display', 'none');
                });
            }
        });
    }

    /* 显示选牌框(选将/五谷/观星/..) */
    sgs.interface.Show_CardChooseBox = function(title, cards, identity_info, presentation) {
        $('#action_prompt').text('').css('display', 'none');
        var card_count = cards.length,
            title_width = title.length * 18 + 20,
            title_height = 24,
            card_padding = 3,
            box_width = card_count * 93 + (card_count - 1) * card_padding * 2 + 40, 
            box_height = identity_info == undefined ? 180 : 210,
            card_choose_bg = $('<div id="choose_box_bgcover"></div>'),
            card_choose_box = $([
                '<div id="choose_box">',
                    '<div>',
                        '<div id="choose_box_content">',
                            '<div id="choose_box_bgimgs">',
                                '<img id="choose_box_bg" src="img/system/card_choose_bg.png" />',
                                '<div id="choose_box_title">',
                                    '<img src="img/system/card_choose_title.png" />',
                                    '<font></font>',
                                '</div>',
                            '</div>',
                            '<div id="choose_cards"></div>',
                        '</div>',
                    '</div>',
                '</div>'
            ].join(''));
        
        card_choose_box.find('#choose_box_title').css({
            width: title_width + 'px',
            height: title_height + 'px',
            left: (box_width - title_width) / 2 + 'px',
        });
        card_choose_box.find('#choose_box_title font').css('line-height', title_height + 'px');
        card_choose_box.find('#choose_box_content').css({
            width: box_width + 'px',
            height: box_height + 'px',
        });
        card_choose_box.find('#choose_box_title font').text(title);
        if(identity_info != undefined) {
            $.each(cards, function(i, d) {
                var card = $('<div class="choose_role_card"><img src="' +
                        sgs.interface.heroImage(d.name, 'hero') + '" /></div>');
                card[0].name = d.name;
                card.attr({ role: 'button', 'aria-label': d.name, title: d.name });
                card.css('left', i * (93 + card_padding * 2) + 'px');
                card_choose_box.find('#choose_cards').append(card);
            });
            card_choose_box.find('#choose_box_content').append([
                    '<div class="player_progress_bar" style="display:block; bottom:25px; left:20px;">',
                        '<img class="player_progress_bg" src="img/system/progress/big/progress_bg.png" />',
                        '<img class="player_progress" src="img/system/progress/big/progress.png" />',
                        '<img class="player_progress_bg" src="img/system/progress/big/progress_border.png" />',
                    '</div>'
                ].join('')).append('<div id="identity">' + identity_info + '</div>');
            card_choose_box.find('.player_progress_bar').css({
                height: '15px',
                left: (box_width - 300) / 2 + 'px',
                bottom: '30px',
            });
        } else {
            $.each(cards, function(i, d) {
                var hidden = presentation && presentation.hiddenCards &&
                        presentation.hiddenCards.indexOf(d) != -1,
                    zoneLabel = presentation && presentation.zoneLabels ?
                        presentation.zoneLabels[i] : '',
                    card = hidden
                        ? $('<div class="choose_card hidden_choice_card"><img src="img/system/card_back.png" /><div class="select_unable"></div></div>')
                        : $(['<div class="choose_card"><img src="',
                            sgs.interface.cardImage(d.name), '" /><div class="pat_num" style="color:',
                            sgs.CARD_COLOR_NUM_MAPPING.color[d.color], ';"><span class="pattern"><img src="',
                            sgs.PATTERN_IMG_MAPPING[d.color], '" /></span><span class="num">',
                            sgs.CARD_COLOR_NUM_MAPPING.number[d.digit], '</span></div><div class="select_unable"></div></div>'].join(''));
                card[0].name = d.name;
                card.attr({
                    role: 'button',
                    'aria-label': hidden ? '目标手牌（未知）' : d.name,
                    title: hidden ? '目标手牌（未知）' : d.name
                });
                if(zoneLabel) {
                    card.append($('<span class="choice_zone_label"></span>').text(zoneLabel));
                }
                sgs.view.bindCardPreview(d, card[0]);
                card.css('left', i * (93 + card_padding * 2) + 'px');
                card_choose_box.find('#choose_cards').append(card);
            });
        }
        card_choose_bg.appendTo($('#main'));
        card_choose_box.appendTo($('#main'));
    };

    /* 显示通用选项框。选项只携带序列化字符串，由当前 Bout 提交命令。 */
    sgs.interface.Show_OptionChooseBox = function(title, options) {
        $('#action_prompt').text('').css('display', 'none');
        var box_width = Math.max(280, options.length * 120 + 40),
            card_choose_bg = $('<div id="choose_box_bgcover"></div>'),
            option_box = $([
                '<div id="choose_box">',
                    '<div><div id="choose_box_content">',
                        '<div id="choose_box_title"><font></font></div>',
                        '<div id="choose_options"></div>',
                    '</div></div>',
                '</div>'
            ].join(''));
        option_box.find('#choose_box_content').css({
            width: box_width + 'px',
            height: '130px'
        });
        option_box.find('#choose_box_title').css({
            width: (box_width - 30) + 'px',
            left: '15px'
        }).find('font').text(title);
        $.each(options, function(i, option) {
            var button = $('<button class="choose_option"></button>');
            button.text(option);
            button[0].option = option;
            button.css({
                position: 'relative',
                margin: '58px 8px 0 8px',
                minWidth: '92px',
                height: '32px'
            });
            option_box.find('#choose_options').append(button);
        });
        card_choose_bg.appendTo($('#main'));
        option_box.appendTo($('#main'));
    };

    /* 显示通用玩家组合选择框。value 由 Core 生成，界面只负责展示。 */
    sgs.interface.Show_PlayerChooseBox = function(title, options) {
        var labels = $.map(options, function(option) {
                return option.label;
            }),
            values = $.map(options, function(option) {
                return option.value;
            });
        sgs.interface.Show_OptionChooseBox(title, labels);
        $('#choose_options .choose_option').each(function(index) {
            $(this).removeClass('choose_option').addClass('choose_players');
            this.player_ids = values[index];
        });
    };

})(window.sgs);
