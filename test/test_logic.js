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

});

test("Stage", function(){
    raises(
        function() {
            new sgs.bout(sgs.PLAYER_NUM + 1);
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
        players.push(new sgs.player(sgs.func.choice("abcdefg".split(""), 4).join(""),
                                    idens[i],
                                    heros[i],
                                    i != 0));
    }
    var about = new sgs.bout(4);
    about.set_player(players);
    notEqual(about.ishero(players[2].hero), undefined, "根据英雄查找玩家,查找英雄:" + players[2].hero.name);
});
