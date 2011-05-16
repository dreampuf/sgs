var pub = function(){
    this.funcs = [];
    this.addEvent = function(stype, func) {
        this.funcs.push({"stype" : stype, "func": func});
    }
    this.notify = function(stype) {
        for(var n = this.funcs.length; n > 0; n--) {
            var obj = this.funcs[n-1];
            console.log(obj);
            if(obj["stype"] == stype) {
                obj["func"].apply({}, Array.prototype.slice.apply(arguments).splice(1));
            }
        }
    }
}


var aBeAttach = function(arg) {
    alert(arg);
}

var aEvent = new pub();
aEvent.addEvent("justAStr", aBeAttach);
console.log(aEvent.funcs);

/*.....some operate......*/

aEvent.notify("justAStr", "i am a javascripter");
