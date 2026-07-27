const assert = require('assert');
const fs = require('fs');
const { loadGame, makePlayers, makeBout, cardState } = require('./support/game');

const { sgs, projectRoot } = loadGame();

const BASIC = new Set(['杀', '火杀', '雷杀', '闪', '桃', '酒']);
const WEAPONS = new Set([
  '诸葛连弩', '雌雄双股剑', '青釭剑', '青龙偃月刀', '丈八蛇矛', '贯石斧',
  '方天画戟', '麒麟弓', '寒冰剑', '古锭刀', '朱雀羽扇',
]);
const ARMORS = new Set(['八卦阵', '仁王盾', '藤甲', '白银狮子']);
const HORSES = new Set(['绝影', '的卢', '爪黄飞电', '骅骝', '赤兔', '大宛', '紫骍']);
const TRICKS = new Set([
  '五谷丰登', '桃园结义', '南蛮入侵', '万箭齐发', '决斗', '无中生有',
  '顺手牵羊', '过河拆桥', '借刀杀人', '无懈可击', '乐不思蜀', '闪电',
  '兵粮寸断', '铁索连环', '火攻',
]);
const RESPONSE_ONLY = new Set(['闪', '无懈可击']);

const cardNames = [...new Set(sgs.CARD.map((card) => card.name))];
const classified = new Set([...BASIC, ...WEAPONS, ...ARMORS, ...HORSES, ...TRICKS]);
assert.strictEqual(cardNames.length, 43, 'expected 43 unique card names');
assert.deepStrictEqual(
  cardNames.filter((name) => !classified.has(name)),
  [],
  'every card must belong to an explicit rule category',
);
assert.deepStrictEqual(
  [...classified].filter((name) => !cardNames.includes(name)),
  [],
  'the rule matrix must not contain cards absent from the deck',
);

assert.strictEqual(sgs.HERO.length, 49, 'expected 25 standard and 24 regular expansion generals');
sgs.HERO.forEach((hero) => {
  assert(hero.name && hero.life > 0 && hero.country && [0, 1].includes(hero.gender));
  assert(sgs.HEROIMAG_MAPPING[hero.name], `missing portrait mapping: ${hero.name}`);
  const mappedImage = sgs.HEROIMAG_MAPPING[hero.name];
  const images = mappedImage.includes('/')
    ? [`img/${mappedImage}`]
    : [`img/generals/big/${mappedImage}`, `img/generals/small/${mappedImage}`];
  images.forEach((image) => {
    assert(fs.existsSync(`${projectRoot}/${image}`), `missing portrait file: ${hero.name} -> ${image}`);
  });
  hero.skills.forEach((skill) => {
    assert(sgs.SKILL_EXPLANATION_MAPPING[skill], `missing skill explanation: ${hero.name}/${skill}`);
  });
});

let cardHeroIdentityCases = 0;
for (const hero of sgs.HERO) {
  for (const identity of [0, 1, 2, 3]) {
    for (const cardName of cardNames) {
    const players = makePlayers(sgs, hero.name, identity);
    const [source, target, third] = players;
    source.blood = Math.max(1, source.hero.life - 1);
    target.card = [new sgs.Card('杀', 3, 7), new sgs.Card('闪', 1, 2)];
    target.equip[0] = new sgs.Card('青釭剑', 3, 6);
    third.card = [new sgs.Card('桃', 1, 3)];
    const bout = makeBout(sgs, players);
    bout.card = Array.from({ length: 20 }, (_, index) => new sgs.Card('杀', index % 4, (index % 13) + 1));
    const card = new sgs.Card(cardName, 3, 7);
    source.card = [
      card,
      new sgs.Card('杀', 2, 8),
      new sgs.Card('闪', 0, 9),
      new sgs.Card('桃', 1, 6),
    ];

    const selection = sgs.interpreter.select(
      bout,
      new sgs.Operate(cardName, source, undefined, card),
    );
    assert(Array.isArray(selection) && Array.isArray(selection[0]), `${cardName}: invalid selection result`);

    if (RESPONSE_ONLY.has(cardName)) {
      assert.strictEqual(selection[1], -1, `${cardName} must not be actively playable`);
      cardHeroIdentityCases += 1;
      continue;
    }

    let selectedTarget;
    if (cardName === '借刀杀人') {
      selectedTarget = [target, third];
    } else if (cardName === '铁索连环') {
      selectedTarget = target;
    } else if (selection[1] === 0) {
      selectedTarget = selection[0].length > 1 ? selection[0] : (selection[0][0] || source);
    } else {
      selectedTarget = selection[0].find((player) => player !== source) || selection[0][0];
    }
    assert(selectedTarget, `${cardName}: playable card has no legal fixture target`);

    const before = cardState(bout);
    sgs.interpreter.choice_card(
      bout,
      new sgs.Operate(cardName, source, selectedTarget, card),
    );
    const after = cardState(bout);
    assert.notStrictEqual(
      after,
      before,
      `${hero.name}/${identity}/${cardName}: active use was a silent no-op`,
    );
    cardHeroIdentityCases += 1;
    }
  }
}

console.log(`content matrix passed: ${cardHeroIdentityCases} card/general/identity cases (${cardNames.length} × ${sgs.HERO.length} × 4)`);
