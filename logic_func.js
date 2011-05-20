var sgs = sgs || {};

(function(sgs){
    var srd = Math.random,
        slice = Array.prototype.slice,
        copy = function(ary){ return slice.apply(ary); };

    sgs.func = sgs.func || {};
    sgs.func.rint = function(max) {
        max = max || 100;
        return srd() * max | 0;
    };
    sgs.func.shuffle = (function(rint) { return function(list) {
        var llen = list.length, 
            newlist = [],
            cur = 0;
        for(; cur < llen; cur++) {
            newlist.splice(rint(cur+1), 0, list[cur]);
        }
        return newlist;
    } })(sgs.func.rint);
    sgs.func.choice = (function(rint) { return function(list, num) {
        var llen = list.length,
            choiced = []
            num = num || 1,
            tmp = -1;
        if(llen < num) {
            throw new Error("choice num can't more then list length");
        }
        if(num * 2 <= llen) {
            while(choiced.length < num) {
                tmp = rint(llen);
                if(choiced.indexOf(list[tmp]) == -1) {
                    choiced.push(list[tmp]);
                }
            }
        } else {
            choiced = sgs.func.shuffle(list);
            choiced = choiced.splice(llen - num);
        }
        return choiced;
    } })(sgs.func.rint);
    sgs.func.range = function(num, func) {
        if(func) {
            var i = 0;
            while(i < num) {
                if(func(i++) == false) {
                    return ;
                }
            }
        } else {
            var i = 0, slist = [];
            for(; i < num; i++) {
                slist.push(i);
            }
            return slist;
        };
    };
    sgs.func.each = function(list, func) {
        var llen = list.length,
            cur = 0;
        for(;cur < llen; cur++) {
            if(func(cur, list[cur], llen) == false)
                return;
        }
    };
    sgs.func.format = function(source) {
        var args = copy(arguments).splice(1);
        return source.replace(/\{(\d+)\}/gm, function(m, i) {
            return args[i]; 
        });
    };
    sgs.func.filter = (function(each){ return function(list, func) {
        var result = []; 
        each(list, function(n, i) {
            if(func(i)) {
                result.push(i);
            }
        });
        return result;
    } })(sgs.func.each);
    sgs.func.exclude = (function(each){ return function(list, func) {
        var result = [];
        each(list, function(n, i) {
            if(!func(i)) {
                result.push(i);
            }
        });
        return result;
    } })(sgs.func.each);
})(window.sgs);
