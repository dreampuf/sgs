const assert = require('assert');
const { loadGame, makePlayers, makeBout } = require('./support/game');

const { sgs } = loadGame();
const allowedStatuses = new Set(['missing', 'partial', 'implemented']);
let heroIdentityCases = 0;
let aiLevelCases = 0;
let skillCases = 0;

for (const hero of sgs.HERO) {
  hero.skills.forEach((skill) => {
    assert(
      allowedStatuses.has(sgs.SKILL_IMPLEMENTATION_STATUS[skill]),
      `${hero.name}/${skill}: implementation status is not declared`,
    );
    skillCases += 1;
  });

  for (const identity of [0, 1, 2, 3]) {
    const players = makePlayers(sgs, hero.name, identity);
    const bout = makeBout(sgs, players);
    const player = players[0];
    assert.strictEqual(player.hero.name, hero.name);
    assert.strictEqual(player.identity, identity);
    assert.strictEqual(player.blood, hero.life);
    assert.strictEqual(player.skill('__不存在的技能__'), false);
    hero.skills.forEach((skill) => assert.strictEqual(player.skill(skill), true));
    for (const level of [0, 1, 2]) {
      assert.doesNotThrow(() => sgs.Ai.interpreter.attack_deviation(bout, player, level));
      const ai = new sgs.Ai(bout, player, level);
      assert.strictEqual(ai.lv, level);
      assert.doesNotThrow(() => ai.card_value(new sgs.Card('桃', 1, 3)));
      aiLevelCases += 1;
    }
    heroIdentityCases += 1;
  }
}

const partial = Object.entries(sgs.SKILL_IMPLEMENTATION_STATUS)
  .filter(([, status]) => status === 'partial')
  .map(([skill]) => skill)
  .sort();
assert.deepStrictEqual(partial, ['咆哮', '奇才', '洛神', '鬼才'].sort());

console.log(`hero matrix passed: ${heroIdentityCases} hero/identity cases, ${aiLevelCases} AI-level cases, ${skillCases} skill declarations`);
