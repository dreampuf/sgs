const assert = require('assert');
const { loadGame, makePlayers, makeBout } = require('./support/game');

const { sgs } = loadGame();

function fixture(hero = '曹操') {
  const players = makePlayers(sgs, hero, 0);
  const bout = makeBout(sgs, players);
  bout.card = Array.from({ length: 30 }, (_, index) => new sgs.Card('杀', index % 4, (index % 13) + 1));
  return { players, bout, source: players[0], target: players[1], third: players[2] };
}

const equipmentByType = {
  0: ['诸葛连弩', '雌雄双股剑', '青釭剑', '青龙偃月刀', '丈八蛇矛', '贯石斧', '方天画戟', '麒麟弓', '寒冰剑', '古锭刀', '朱雀羽扇'],
  1: ['八卦阵', '仁王盾', '藤甲', '白银狮子'],
  2: ['绝影', '的卢', '爪黄飞电', '骅骝'],
  3: ['赤兔', '大宛', '紫骍'],
};

Object.entries(equipmentByType).forEach(([type, names]) => {
  names.forEach((name) => {
    const { bout, source } = fixture();
    const card = new sgs.Card(name, 3, 1);
    sgs.interpreter.choice_card(bout, new sgs.Operate(name, source, source, card));
    assert.strictEqual(source.equip[Number(type)], card, `${name}: wrong equipment slot`);
    if (Number(type) === 0) {
      assert(sgs.EQUIP_RANGE_MAPPING[name] >= 1, `${name}: missing weapon range`);
    }
  });
});

{
  const { bout, source } = fixture();
  source.blood--;
  const oldArmor = new sgs.Card('白银狮子', 2, 1);
  source.equip[1] = oldArmor;
  const newArmor = new sgs.Card('八卦阵', 3, 2);
  sgs.interpreter.choice_card(bout, new sgs.Operate('八卦阵', source, source, newArmor));
  assert.strictEqual(source.blood, source.hero.life, 'removing Silver Lion should heal one');
  assert(bout.discardPile.includes(oldArmor), 'replaced equipment should enter discard pile');
}

{
  const { bout, source, target } = fixture();
  const slash = new sgs.Card('杀', 3, 7);
  sgs.interpreter.choice_card(bout, new sgs.Operate('杀', source, target, slash));
  assert.strictEqual(
    sgs.interpreter.select(bout, new sgs.Operate('杀', source, undefined, slash))[1],
    -1,
    'a second Slash should be rejected',
  );
  source.equip[0] = new sgs.Card('诸葛连弩', 2, 1);
  assert.strictEqual(
    sgs.interpreter.select(bout, new sgs.Operate('杀', source, undefined, slash))[1],
    1,
    'Crossbow should allow another Slash',
  );
}

{
  const { bout, source } = fixture();
  source.hero = sgs.HERO.find((hero) => hero.name === '张飞');
  source.status.used_slash = true;
  assert.strictEqual(
    sgs.interpreter.select(bout, new sgs.Operate('杀', source, undefined, new sgs.Card('杀', 3, 7)))[1],
    1,
    'Paoxiao should allow another Slash',
  );
}

{
  const { bout, source } = fixture();
  const wine = new sgs.Card('酒', 3, 9);
  sgs.interpreter.choice_card(bout, new sgs.Operate('酒', source, source, wine));
  assert.strictEqual(
    sgs.interpreter.select(bout, new sgs.Operate('酒', source, undefined, wine))[1],
    -1,
    'a second Analeptic in the same turn should be rejected',
  );
}

{
  const { bout, source, target } = fixture();
  const slash = new sgs.Card('杀', 3, 7);
  const before = target.blood;
  sgs.interpreter.choice_card(bout, new sgs.Operate('杀', source, target, slash));
  sgs.interpreter.response_card(bout, new sgs.Operate('闪', target, source));
  assert.strictEqual(target.blood, before - 1, 'unanswered Slash should deal damage');
}

{
  const { bout, source, target } = fixture();
  const slash = new sgs.Card('杀', 3, 7);
  const before = target.blood;
  sgs.interpreter.choice_card(bout, new sgs.Operate('杀', source, target, slash));
  sgs.interpreter.response_card(
    bout,
    new sgs.Operate('闪', target, source, new sgs.Card('闪', 1, 2)),
  );
  assert.strictEqual(target.blood, before, 'Jink should cancel Slash damage');
  assert.strictEqual(bout.opt.length, 0);
}

for (const [aoe, response] of [['南蛮入侵', '杀'], ['万箭齐发', '闪']]) {
  const { bout, source, players } = fixture();
  const before = players.map((player) => player.blood);
  sgs.interpreter.choice_card(
    bout,
    new sgs.Operate(aoe, source, players, new sgs.Card(aoe, 3, 7)),
  );
  let answered = false;
  while (bout.choice.length) {
    const request = bout.choice.at(-1);
    sgs.interpreter.response_card(
      bout,
      new sgs.Operate(
        response,
        request.target,
        request.source,
        answered ? undefined : new sgs.Card(response, 2, 8),
      ),
    );
    answered = true;
  }
  assert.strictEqual(players[1].blood + players[2].blood + players[3].blood,
    before[1] + before[2] + before[3] - 2,
    `${aoe}: exactly the two unanswered targets should take damage`);
  assert.strictEqual(bout.opt.length, 0, `${aoe}: response stack should close`);
}

{
  const { bout, source, target } = fixture();
  const before = target.blood;
  sgs.interpreter.choice_card(
    bout,
    new sgs.Operate('决斗', source, target, new sgs.Card('决斗', 3, 1)),
  );
  sgs.interpreter.response_card(bout, new sgs.Operate('杀', target, source));
  assert.strictEqual(target.blood, before - 1, 'the first Duel participant who cannot Slash should take damage');
  assert.strictEqual(bout.opt.length, 0);
}

{
  const { bout, source, target } = fixture();
  const before = source.blood;
  sgs.interpreter.choice_card(
    bout,
    new sgs.Operate('决斗', source, target, new sgs.Card('决斗', 3, 1)),
  );
  sgs.interpreter.response_card(
    bout,
    new sgs.Operate('杀', target, source, new sgs.Card('杀', 2, 7)),
  );
  sgs.interpreter.response_card(bout, new sgs.Operate('杀', source, target));
  assert.strictEqual(source.blood, before - 1, 'Duel should alternate Slash responses');
}

{
  const { bout, source, target, third } = fixture();
  const weapon = new sgs.Card('青釭剑', 3, 6);
  target.equip[0] = weapon;
  sgs.interpreter.choice_card(
    bout,
    new sgs.Operate('借刀杀人', source, [target, third], new sgs.Card('借刀杀人', 2, 12)),
  );
  sgs.interpreter.response_card(bout, new sgs.Operate('杀', target, source));
  assert.strictEqual(target.equip[0], undefined);
  assert(source.card.includes(weapon), 'failed Collateral should transfer the weapon');
}

{
  const { bout, source, players } = fixture();
  const before = players.map((player) => player.card.length);
  sgs.interpreter.choice_card(
    bout,
    new sgs.Operate('五谷丰登', source, players, new sgs.Card('五谷丰登', 1, 3)),
  );
  players.forEach((player, index) => {
    assert.strictEqual(player.card.length, before[index] + 1, 'Amazing Grace should give each living player one card');
  });
}

{
  const { bout, source, players } = fixture();
  players[1].blood--;
  players[2].blood--;
  sgs.interpreter.choice_card(
    bout,
    new sgs.Operate('桃园结义', source, players, new sgs.Card('桃园结义', 1, 1)),
  );
  assert.strictEqual(players[1].blood, players[1].hero.life);
  assert.strictEqual(players[2].blood, players[2].hero.life);
}

{
  const { bout, source } = fixture();
  const before = source.card.length;
  sgs.interpreter.choice_card(
    bout,
    new sgs.Operate('无中生有', source, source, new sgs.Card('无中生有', 1, 7)),
  );
  assert.strictEqual(source.card.length, before + 2);
}

{
  const { bout, source, target } = fixture();
  target.card = [new sgs.Card('桃', 1, 3)];
  sgs.interpreter.choice_card(
    bout,
    new sgs.Operate('顺手牵羊', source, target, new sgs.Card('顺手牵羊', 3, 3)),
  );
  assert(source.card.some((card) => card.name === '桃'));
  assert.strictEqual(target.card.length, 0);
}

{
  const { bout, source, target } = fixture();
  target.card = [];
  target.equip[1] = new sgs.Card('八卦阵', 3, 2);
  sgs.interpreter.choice_card(
    bout,
    new sgs.Operate('过河拆桥', source, target, new sgs.Card('过河拆桥', 3, 3)),
  );
  assert.strictEqual(target.equip[1], undefined);
  assert(bout.discardPile.some((card) => card.name === '八卦阵'));
}

{
  const { bout, source, target } = fixture();
  source.card = [new sgs.Card('杀', 3, 7)];
  target.card = [new sgs.Card('闪', 3, 2)];
  const before = target.blood;
  sgs.interpreter.choice_card(
    bout,
    new sgs.Operate('火攻', source, target, new sgs.Card('火攻', 1, 2)),
  );
  assert.strictEqual(target.blood, before - 1, 'Fire Attack should damage after discarding a matching suit');
  assert.strictEqual(source.card.length, 0);
}

{
  const { bout, source, target, third } = fixture();
  sgs.interpreter.choice_card(
    bout,
    new sgs.Operate('铁索连环', source, [target, third], new sgs.Card('铁索连环', 3, 11)),
  );
  assert.strictEqual(target.status.chained, true);
  assert.strictEqual(third.status.chained, true);
}

console.log('card rule scenarios passed');
