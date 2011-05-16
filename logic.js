var sgs = sgs || {};
sgs.PLAYER_NUM = 4;

sgs.IDENTITY_MAPPING = {
    /* 0: "主公", 1: "忠臣", 2: "内奸", 3: "反贼" */
    4: [0, 1, 2, 3],
}
sgs.HERO = [
    ["赵云", 4, ["龙胆"], "吴"],
    ["孙权", 4, ["救援", "制衡"], "吴"],
    ["郭嘉", 3, ["天妒", "遗计"], "魏"],
    ["黄盖", 4, ["苦肉"], "吴"],
];


(function(sgs){
    var srd = Math.random;
    sgs.func = sgs.func || {};
    sgs.func.rint = function(max) {
        return srd() * max | 0;
    };
    sgs.func.shuffle = function(list) {
        var llen = list.length, 
            newlist = [],
            cur = 0,
            rint = sgs.func.rint;
        for(; cur < llen; cur++) {
            newlist.splice(rint(cur), 0, list.pop());
        }
        return newlist;
    };
    sgs.bout = function(player_num) {
        /* 回合 */
        if(player_num > sgs.PLAYER_NUM) {
            throw new Error("不能超过" + sgs.PLAYER_NUM + "名玩家");
        }
        this.log = [];
        this.start_time = new Date();
        
        this.get_identity = function() {
            return sgs.func.shuffle(sgs.IDENTITY_MAPPING[player_num]);
        }
    }

    /*
     * 赵云, 4, ["龙胆"], 蜀
     * 孙权, 4, ["救援", "制衡"], 吴
     * 郭嘉, 3, ["天妒", "遗计"], 魏
     * 黄盖, 4, ["苦肉"], 吴
     */
    
    sgs.hero = function(name, life, skills, country) {
        /* 英雄 */
        /*
         * name : 英雄名称
         * life : 生命值,对应可用派数.
         * skill : 技能
         * country : 所属国.
         */
        

    }

    sgs.player = function(nickname, identity) {
        /* 玩家 */ 
        /*
         * nickname : 昵称
         * identity : 身份
         */

    }
    
    sgs.card = function(name, color, digit, type, subject, operate) {
        /* 卡牌 */
        /*
         * name : 名称
         * color : 花色 (0 : 方块, 1 : 红桃, 2 : 梅花, 3 : 黑桃)
         * digit : 牌字 (A, 2, 3 ... 10, J, Q, K)
         * type : 排类型 (基本, 锦囊, 装备)
         * subject : 小分类
         * 操作 : 操作对象
         */
        this.name = name;

    }

    sgs.operate = function(id) {

    }
    

 
})(window.sgs)
