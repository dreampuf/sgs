module("Logic");

var _ = sgs.func.format,
    filter = sgs.func.filter,
    exclude = sgs.func.exclude, 
    shuffle = sgs.func.shuffle,
    range = sgs.func.range,
    choice = sgs.func.choice,
    each = sgs.func.each,
    zip = sgs.func.zip,
    map = sgs.func.map,
    and = sgs.func.and,
    or = sgs.func.or,
    sub = sgs.func.sub;

/* Test Setting */
sgs.DELAY = 0;

test("Func", function(){
    equal(sgs.func.shuffle([1,2,3,4]).length, 4); 
    ok(true, "抽取1个随机对象" + sgs.func.choice([1,2,3,4,5,6,7,8,9,0]));
    ok(true, "抽取4个随机对象" + sgs.func.choice([1,2,3,4,5,6,7,8,9,0], 4));
    ok(true, "抽取8个随机对象" + sgs.func.choice([1,2,3,4,5,6,7,8,9,0], 8));
    raises(
        function() {
            sgs.func.choice([2,3,4], 5);
        },
        "从三个元素的数组中抽取5个随机,报错"
    );
    var i = 0;
    sgs.func.range(4, function(k) { i += k; });
    equal(i, 6, "sgs.func.range test pass");
    var i = 0;
    sgs.func.each([2, 3, 5, 8], function(n, item) {
        i += item;
    }); 
    equal(i, 18);
    
    deepEqual(sgs.func.range(4), [0, 1, 2, 3]);
    equal(sgs.func.format("{0}牵着{1}的手", "五条杠", "档中痒"), "五条杠牵着档中痒的手");
    deepEqual(sgs.func.exclude([1, 2, 3, 4, 5, 6], function(i) { return i % 2 == 0; }),
              [1, 3, 5]); 
    var al = [1,2,3],
        bl = [4,5,6],
        cl = [7,8,9],
        ol = sgs.func.zip(al, bl, cl, function(a, b, c) { return [a, b, c]; }); 
    deepEqual(ol,
              [[1, 4, 7],
               [2, 5, 8],
               [3, 6, 9]]);
    equal(sgs.func.max([1,2,3,5,6,7,8,99,4,1,23,45,6]), 99);
    equal(sgs.func.max([{"key": 11}, {"key": 222}, {"key": 55}], function(i){ return i["key"]; }), 222);
    
    deepEqual(sgs.func.map([1,2,3,4,5], function(i){ return i+2; }), [3,4,5,6,7], "sgs.func.map");
    deepEqual(sgs.func.and([1,2,3,4], [2,3,4,5,6]), [2,3,4], "sgs.func.and");
    deepEqual(sgs.func.or([1,2,3,4], [3,4,5,6,7]), [1,2,3,4,5,6,7], "sgs.func.or");
    deepEqual(sgs.func.sub([1,2,3,4,5], [1,3,4]), [2,5], "sgs.func.sub");

    equal(sgs.func.all([2, 4, 6, 8, 10], function(i){ return i%2 == 0; }), true, "sgs.func.all");
    equal(sgs.func.all([1, 3, 5, 6], function(i){ return i%2 != 0; }), false, "sgs.func.all");
    equal(sgs.func.any([1,2,3,4,5,6], function(i){ return i == 3; }), true, "sgs.func.any");
    equal(sgs.func.any([1,2,3,4,5,6], function(i){ return i == 7; }), false, "sgs.func.any");
});

test("Stage", function(){
    raises(
        function() {
            new sgs.Bout(new Array(sgs.PLAYER_NUM + 1));
        },
        "创建大于指定人数局"
    );
    ok(true, sgs.Bout.get_identity(4))
    equal(sgs.Bout.get_hero(4).length, 4, "指定人数随机英雄");
    ok(true, "获得随机英雄" + sgs.Bout.get_hero(4));

    /**/
    idens = sgs.Bout.get_identity(4);
    king_num = idens.indexOf(0);
    heros = sgs.Bout.get_hero(4);
    players = sgs.func.zip(idens, heros, function(iden, hero, n) {
        return new sgs.Player(sgs.func.choice("明明小刚安红".split(""), 2).join(""),
                                   iden,
                                   hero,
                                   n != 0); /* player[0] 为玩家,身份随机,英雄随机 */ 
    });
    var single = "blablablablaaaa.";

    each(filter(players, function(i) { return !i.isAI; }), function(n, i) {
        i.choice_card = function() {
            /* 重写玩家的trun方法 */
            /* 现在轮到玩家 */
            single = "yes i'm player";
        };
    });
    

    var about = new sgs.Bout(players);
    equal(about.player[0].identity, 0, "根据主公调整顺序");
    equal(about.ishero(players[2].hero).nickname, 
          players[2].nickname, 
          "根据英雄查找玩家,查找英雄:" + players[2].hero.name);
    ok(true, about.get_buff_log());
    ok(about.player[0].hascard(about.player[0].card[0].name), "恩,有牌");

    players = about.player;
    //equal(4, players[0].card.length, "初始化牌数等于4");
    //about.getcard(new sgs.Operate("摸牌", players[0]));
    //equal(6, players[0].card.length, "摸排后牌数等于6");
    
    var ma = new sgs.Card("的驴", 0, 4),
        wuqi5 = new sgs.Card("方天画戟", 0, 5); 
    players[0].equip[2] = ma;
    players[0].equip[0] = wuqi5;
    console.log(players[1]);
    equal(about.hero_range(players[0]).length, 3,  "装备了武器,都能攻击得到");
    equal(about.hero_range(players[1]).length, 1,  "只能攻击没有装备+1马的玩家");
    
    var king_choices = sgs.Bout.get_king_hero();
    equal(king_choices.length, 5, "获取主公随机武将");
    equal(filter(king_choices, function(i){ return i.name == "曹操" ||
                                                   i.name == "刘备" ||
                                                   i.name == "孙权" ;}).length, 3, "主公随机武将含有三巨头.");
});

test("AI_1v1", function(){
    var idens = sgs.Bout.get_identity(2),
        heros = sgs.Bout.get_hero(2),
        players = [],
        about;

    heros[0] = filter(sgs.HERO, function(i) { return i.name == "甄姬"; })[0];
    range(2, function(n) {
        players.push(new sgs.Player(heros[n].name,
                                    idens[n],
                                    heros[n],
                                    true));
    });
    about = new sgs.Bout(players); 
});

test("AI_1v1v1", function(){ 
    var idens = sgs.Bout.get_identity(3),
        heros = sgs.Bout.get_hero(3),
        players = [],
        about;

    //heros[0] = filter(sgs.HERO, function(i) { return i.name == "甄姬"; })[0];
    range(3, function(n) {
        players.push(new sgs.Player(heros[n].name,
                                    idens[n],
                                    heros[n],
                                    true));
    });
    about = new sgs.Bout(players); 
});
