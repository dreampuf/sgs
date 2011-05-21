var sgs = sgs || {};

(function (sgs) {
    sgs.interface = sgs.interface || {};
    
    sgs.interface.CARD_COLOR_NUM = {
        "color": { 0: "red", 1: "red", 2: "black", 3: "black" },
        "number": [ "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K" ]
    };
    
    sgs.interface.IDENTITY_INDEX = {
        "name": {  0: "主公", 1: "忠臣", 2: "内奸", 3: "反贼" }
    };
    
    sgs.interface.IDENTITY_IMG = {
        0: "img/king.png",
        1: "img/liegeman.png",
        2: "img/traitor.png",
        3: "img/enemy.png"
    };
    
    sgs.interface.COUNTRY_IMG = {
        "魏": "img/wei.png",
        "蜀": "img/shu.png",
        "吴": "img/wu.png",
        "群": "img/qun.png"
    };
    
    sgs.interface.EQUIPMENT_TYPE = {
        "name": { 0: "武器", 1: "防具", 2: "+1马", 3: "-1马" }
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

    sgs.interface.playerState = {
        /*
         *      玩家状态
         *
         * width       - 牌宽度
         * height      - 牌高度
         * out         - 选中时突出的高度
         */
        stage: 1,
        weapons: [],
        cards: [],
        selectedCards: [],
        blod: 0
    };

    sgs.interface.Card = function (jqObj, name, type, pattern, num, selected) {
        /*
         *      构造牌对象
         *
         * jqObj        - jQuery对象
         * name         - 名称
         * type         - 类型
         * pattern        - 花色
         * num          - 数值
         * selected     - 是否选中
         */
        this.jqObj = jqObj;
        this.name = name;
        this.type = type;
        this.pattern = pattern;
        this.num = num;
        this.selected = selected;
    };

})(window.sgs);
