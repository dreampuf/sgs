module("Logic");

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
});

test("Stage", function(){
    raises(
        function() {
            new sgs.bout(new Array(sgs.PLAYER_NUM + 1));
        },
        "创建大于指定人数局"
    );
    ok(true, sgs.bout.get_identity(4))
    equal(sgs.bout.get_hero(4).length, 4, "指定人数随机英雄");
    ok(true, "获得随机英雄" + sgs.bout.get_hero(4));

    /**/
    idens = sgs.bout.get_identity(4);
    heros = sgs.bout.get_hero(4);
    players = [];
    var i = 4;
    while(i-- > 0) {
        players.push(new sgs.Player(sgs.func.choice("明明小刚安红".split(""), 2).join(""),
                                    idens[i],
                                    heros[i],
                                    i != 0));
    }


    var about = new sgs.bout(players);
    notEqual(about.ishero(players[2].hero), undefined, "根据英雄查找玩家,查找英雄:" + players[2].hero.name);
    ok(true, about.get_buff_log());

    equal(4, players[0].card.length, "初始化牌数等于4");
    about.getcard(new sgs.Operate("摸牌", undefined, players[0]));
    equal(6, players[0].card.length, "摸排后牌数等于6");
    
    var ma = new sgs.Card("的驴", 0, 4),
        wuqi5 = new sgs.Card("方天画戟", 0, 5); 
    players[0].equip[3] = ma;
    players[3].equip[0] = wuqi5;
    equal(3, about.hero_range(players[3]).length, "装备了武器,都能攻击得到");
    equal(1, about.hero_range(players[1]).length, "只能攻击没有装备+1马的玩家");
    





});
