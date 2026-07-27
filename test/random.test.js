const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = { window: { sgs: {} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync("logic_func.js", "utf8"), context);

const func = context.window.sgs.func;
func.set_random_seed(20260727);
const first = [func.rint(1000), func.rint(1000), func.rint(1000)];
func.set_random_seed(20260727);
const second = [func.rint(1000), func.rint(1000), func.rint(1000)];
assert.deepStrictEqual(first, second);
assert.strictEqual(func.get_random_seed(), 20260727);

func.set_random_seed(99);
const shuffledA = func.shuffle([1, 2, 3, 4, 5, 6]);
func.set_random_seed(99);
const shuffledB = func.shuffle([1, 2, 3, 4, 5, 6]);
assert.deepStrictEqual(shuffledA, shuffledB);

func.reset_random_source();
assert.strictEqual(func.get_random_seed(), null);

console.log("legacy deterministic random tests passed");
