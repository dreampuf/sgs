const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const context = { console, window: {}, setTimeout: () => {} };
context.window = context;
vm.createContext(context);
['logic_func.js', 'data.js', 'logic_interpreter.js', 'logic.js', 'logic_ai.js'].forEach((file) => {
  vm.runInContext(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''), context, { filename: file });
});

const { sgs } = context;
const packs = sgs.EXPANSION_PACKS;
assert.deepStrictEqual(Object.keys(packs), ['wind', 'military', 'fire', 'forest']);
assert.strictEqual(packs.wind.releaseDate, '2009-03-23');
assert.strictEqual(packs.military.releaseDate, '2009-09-21');
const heroCount = sgs.HERO.length;
const cardCount = sgs.CARD.length;
assert.strictEqual(sgs.applyExpansionPack('wind'), true);
assert.strictEqual(sgs.applyExpansionPack('wind'), false);
assert.strictEqual(sgs.applyExpansionPack('military'), true);
assert.strictEqual(packs.wind.heroes.length, 8, 'wind should contain all eight regular generals');
assert.strictEqual(packs.fire.heroes.length, 8, 'fire should contain all eight regular generals');
assert.strictEqual(packs.forest.heroes.length, 8, 'forest should contain all eight regular generals');
assert.strictEqual(packs.military.cards.length, 52, 'maneuvering should contain the original 52-card deck');
assert.strictEqual(sgs.HERO.length, heroCount + 8);
assert.strictEqual(sgs.CARD.length, cardCount + 52);
assert(sgs.HERO.some((hero) => hero.name === '曹仁' && hero.skills.includes('据守')));
assert(sgs.CARD.some((card) => card.name === '火杀'));
assert(sgs.CARD.some((card) => card.name === '古锭刀'));
assert.strictEqual(sgs.CARD_CONTERACT_MAPPING['火杀'], '闪');
assert.strictEqual(sgs.EQUIP_RANGE_MAPPING['青釭剑'], 2);
assert(sgs.HERO.some((hero) => hero.name === '夏侯惇'), 'standard general name should be 夏侯惇');
Object.values(sgs.DEAD_IDENTITY_MAPPING).forEach((image) => {
  assert(fs.existsSync(image), `missing death identity image: ${image}`);
});
Object.values(sgs.EQUIP_IMG_MAPPING).forEach((image) => {
  assert(fs.existsSync(image), `missing equipment strip image: ${image}`);
});
Object.values(packs).forEach((pack) => {
  Object.values(pack.heroImages).forEach((image) => {
    assert(fs.existsSync(`img/${image}`), `missing expansion hero image: ${image}`);
  });
  Object.values(pack.cardImages).forEach((image) => {
    assert(fs.existsSync(`img/${image}`), `missing expansion card image: ${image}`);
  });
});
const allSkillNames = new Set([
  ...sgs.HERO.flatMap((hero) => hero.skills),
  ...Object.values(packs).flatMap((pack) => pack.heroes.flatMap((hero) => hero[2])),
]);
allSkillNames.forEach((skill) => {
  assert(sgs.SKILL_EXPLANATION_MAPPING[skill], `missing skill explanation: ${skill}`);
});

function makePlayer(name, identity, heroName) {
  const hero = sgs.HERO.find((item) => item.name === heroName) || sgs.HERO[0];
  return new sgs.Player(name, identity, hero, true);
}

function makeBout(players) {
  const playernum = {};
  players.forEach((player, index) => { playernum[player.nickname] = index; });
  return {
    player: players,
    playerlen: players.length,
    playernum,
    opt: [],
    choice: [],
    card: [],
    last_judge_card: undefined,
    notify() {},
    continue() {},
    hero_range() { return players.filter((player) => player !== players[0]); },
  };
}

const lord = makePlayer('lord', 0, '曹操');
const loyalist = makePlayer('loyalist', 1, '刘备');
const renegade = makePlayer('renegade', 2, '司马懿');
const rebel = makePlayer('rebel', 3, '曹仁');
const aiBout = makeBout([lord, loyalist, renegade, rebel]);
const rebelScore = sgs.Ai.interpreter.attack_deviation(aiBout, rebel, 2);
assert.strictEqual(rebelScore.indexOf(Math.max(...rebelScore)), 0, 'rebel hard AI should prioritize lord');
const loyalistScore = sgs.Ai.interpreter.attack_deviation(aiBout, loyalist, 2);
assert.notStrictEqual(loyalistScore.indexOf(Math.max(...loyalistScore)), 0, 'loyalist hard AI should avoid attacking lord');
const ai = new sgs.Ai(aiBout, loyalist, 2);
assert(ai.card_value(new sgs.Card('桃', 1, 3)) > ai.card_value(new sgs.Card('杀', 3, 7)), 'support roles should preserve peach');

const trickSource = makePlayer('trickSource', 3, '曹操');
const trickTarget = makePlayer('trickTarget', 0, '刘备');
const firstNullifier = makePlayer('firstNullifier', 1, '关羽');
const secondNullifier = makePlayer('secondNullifier', 2, '司马懿');
const nullificationBout = makeBout([trickSource, trickTarget, firstNullifier, secondNullifier]);
const trick = new sgs.Card('无中生有', 1, 7);
nullificationBout.opt = [new sgs.Operate('无中生有', trickSource, trickTarget, trick)];
nullificationBout.choice = [
  new sgs.Operate('无懈可击', trickTarget, firstNullifier, '无懈可击'),
  new sgs.Operate('无懈可击', trickTarget, secondNullifier, '无懈可击'),
];
sgs.interpreter.response_card(
  nullificationBout,
  new sgs.Operate('无懈可击', secondNullifier, trickTarget, new sgs.Card('无懈可击', 3, 11)),
);
assert.strictEqual(nullificationBout.opt.length, 0, 'nullification should cancel the pending trick');
assert.strictEqual(
  nullificationBout.choice.filter((choice) => choice.id === '无懈可击').length,
  0,
  'one nullification should clear stale requests for the same pending trick',
);

const staleNullificationBout = makeBout([loyalist, rebel]);
let staleResponse;
staleNullificationBout.opt = [];
staleNullificationBout.choice = [new sgs.Operate('无懈可击', loyalist, rebel, '无懈可击')];
staleNullificationBout.response_card = (response) => { staleResponse = response; };
new sgs.Ai(staleNullificationBout, loyalist, 1).ask_card(
  new sgs.Operate('无懈可击', loyalist, rebel, '无懈可击'),
);
assert(staleResponse && staleResponse.data === undefined, 'AI should safely decline a stale nullification request');

const attacker = makePlayer('attacker', 3, '曹仁');
const defender = makePlayer('defender', 0, '曹操');
const combatBout = makeBout([attacker, defender]);
sgs.interpreter.choice_card(combatBout, new sgs.Operate('酒', attacker, attacker, new sgs.Card('酒', 3, 9)));
sgs.interpreter.choice_card(combatBout, new sgs.Operate('火杀', attacker, defender, new sgs.Card('火杀', 1, 4)));
sgs.interpreter.response_card(combatBout, new sgs.Operate('闪', defender, attacker));
assert.strictEqual(defender.blood, defender.hero.life - 2, 'wine should increase next slash damage');

const delayed = makePlayer('delayed', 0, '曹操');
const caster = makePlayer('caster', 3, '曹仁');
const decisionBout = makeBout([caster, delayed]);
decisionBout.card = [new sgs.Card('杀', 3, 7)];
sgs.interpreter.decision(decisionBout, delayed, new sgs.Operate('兵粮寸断', caster, delayed, new sgs.Card('兵粮寸断', 2, 10)));
assert.strictEqual(delayed.status.bingliang, true, 'supply shortage should mark draw skip on failed judge');

const chainTarget = makePlayer('chainTarget', 0, '曹操');
const chainBout = makeBout([attacker, chainTarget]);
sgs.interpreter.choice_card(chainBout, new sgs.Operate('铁索连环', attacker, chainTarget, new sgs.Card('铁索连环', 3, 11)));
assert.strictEqual(chainTarget.status.chained, true, 'iron chain toggles chained status');

console.log('smoke tests passed');
