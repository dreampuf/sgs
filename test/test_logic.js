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

});

test("Stage", function(){
    raises(
        function() {
            console.log(window);
            new sgs.bout(sgs.PLAYER_NUM + 1);
        },
        "创建大于指定人数局"
    );
    var about = new sgs.bout(4);
    ok(true, about.get_identity())
    equal(about.get_hero().length, 4, "指定人数随机英雄");
    ok(true, "获得随机英雄" + about.get_hero());

});
