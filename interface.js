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
            player.dom = dom;
        if(!player.isAI) {
            $('#player_country').attr('src', sgs.COUNTRY_IMG_MAPPING[player.hero.country]);
            $('#player_name').text(player.nickname);
            $('#player_head_img').attr('src', 'img/generals/big/' + sgs.HEROIMAG_MAPPING[player.hero.name]);
            for (var i = 0; i < player.hero.life; i++) {
                $('<img src="img/system/blod_0.png" />').appendTo($('#player_blod_0'));
                $('<img src="img/system/blod_1.png" />').appendTo($('#player_blod_1'));
            }
            $("#player_identity img").attr('src', sgs.IDENTITY_IMG_MAPPING[player.identity]);
            $('#player_head')[0].name = player.hero.name;
        } else {
            $(player.dom).find('.role_country img').attr('src', sgs.COUNTRY_IMG_MAPPING[player.hero.country]);
            $(player.dom).find('.role_name').text('_' + player.hero.name + '_');
            if(player.identity == 0)
                $(player.dom).find('.role_identity img').attr('src', sgs.IDENTITY_IMG_MAPPING[0]);
            $(player.dom).find('.head_img img').attr('src', 'img/generals/small/' + sgs.HEROIMAG_MAPPING[player.hero.name]);
            for(var k = 0; k < player.hero.life; k++) {
                $(player.dom).find('.blods_0').append('<img src="img/system/blod_0.png" />');
                $(player.dom).find('.blods_1').append('<img src="img/system/blod_1.png" />');
            }
            $(player.dom).find('.head_img')[0].name = player.hero.name;
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
                $('#data_load').animate({
                    opacity: 0
                }, 1000, function() {
                    $('#data_load').css('display', 'none');
                });
            }
        });
    }

    /* 显示选牌框(选将/五谷/观星/..) */
    sgs.interface.Show_CardChooseBox = function(title, cards, identity_info) {
        var card_count = cards.length,
            title_width = title.length * 18 + 20,
            title_height = 24,
            card_padding = 3,
            box_width = card_count * 93 + (card_count - 1) * card_padding * 2 + 40, 
            box_height = 210,
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
                var card = $('<div class="choose_role_card"><img src="img/generals/hero/' +
                        sgs.HEROIMAG_MAPPING[d.name] + '" /></div>');
                card[0].name = d.name;
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
            
        }
        card_choose_bg.appendTo($('#main'));
        card_choose_box.appendTo($('#main'));
    };

})(window.sgs);
