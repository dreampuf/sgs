module("Logic");

test("Func", function(){
    equal(sgs.func.shuffle([1,2,3,4]).length, 4); 
});

test("Stage", function(){
    equal(0, 0, "真的相等啦");
    raises(
        function() {
            console.log(window);
            new sgs.bout(sgs.PLAYER_NUM + 1);
        },
        "创建大于指定人数局"
    );
    var about = new sgs.bout(4);
    ok(true, about.get_identity())

});
