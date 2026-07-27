const assert = require('assert');
const { loadGame, makePlayers, makeBout } = require('./support/game');

const { sgs, timers } = loadGame();
let cases = 0;

for (const hero of sgs.HERO) {
  for (const identity of [0, 1, 2, 3]) {
    const players = makePlayers(sgs, hero.name, identity);
    const source = players[0];
    const bout = makeBout(sgs, players);
    bout.curplayer = 0;
    bout.step = 0;
    bout.card = Array.from({ length: 30 }, (_, index) => new sgs.Card('杀', index % 4, (index % 13) + 1));

    assert.doesNotThrow(() => sgs.Bout.prototype.decision.call(bout), `${hero.name}/${identity}: decision`);
    if (hero.name === '甄姬') {
      assert.strictEqual(bout.choice.at(-1).data, '洛神');
      bout.choice = [];
      source.status['zhenji.luoshen'] = -1;
    } else {
      assert.strictEqual(bout.step, 1);
    }

    bout.step = 1;
    const handBeforeDraw = source.card.length;
    assert.doesNotThrow(() => sgs.Bout.prototype.getcard.call(bout), `${hero.name}/${identity}: draw`);
    assert.strictEqual(source.card.length, handBeforeDraw + 2);
    assert.strictEqual(bout.step, 2);

    let playRequests = 0;
    source.choice_card = () => { playRequests += 1; };
    assert.doesNotThrow(() => sgs.Bout.prototype.usecard.call(bout), `${hero.name}/${identity}: play`);
    assert.strictEqual(playRequests, 1);

    source.card = Array.from({ length: source.blood + 2 }, (_, index) => new sgs.Card('杀', 3, index + 1));
    bout.step = 3;
    const discard = source.card.slice(0, 2);
    assert.doesNotThrow(
      () => sgs.Bout.prototype.discard.call(
        bout,
        new sgs.Operate('弃牌', source, source, discard),
      ),
      `${hero.name}/${identity}: discard`,
    );
    assert.strictEqual(source.card.length, source.blood);
    const advance = timers.pop();
    assert(advance, `${hero.name}/${identity}: discard did not schedule turn advance`);
    advance();
    assert.strictEqual(bout.curplayer, 1);
    assert.strictEqual(bout.step, 0);
    cases += 1;
  }
}

{
  const players = makePlayers(sgs, '曹操', 0);
  const bout = makeBout(sgs, players);
  bout.curplayer = 0;
  bout.step = 1;
  bout.card = [new sgs.Card('杀', 3, 7), new sgs.Card('闪', 1, 2)];
  players[0].status.bingliang = true;
  sgs.Bout.prototype.getcard.call(bout);
  assert.strictEqual(players[0].card.length, 0, 'supply shortage should skip drawing');
  assert.strictEqual(bout.step, 2);
}

{
  const players = makePlayers(sgs, '曹操', 0);
  const bout = makeBout(sgs, players);
  bout.curplayer = 0;
  bout.step = 1;
  bout.card = [new sgs.Card('杀', 3, 7), new sgs.Card('闪', 1, 2)];
  players[0].status.lebusishu = true;
  sgs.Bout.prototype.getcard.call(bout);
  assert.strictEqual(bout.step, 3, 'indulgence should skip play phase');
}

{
  const players = makePlayers(sgs, '曹操', 0);
  players[1].blood = 0;
  const bout = makeBout(sgs, players);
  bout.curplayer = 0;
  bout.step = 3;
  sgs.Bout.prototype.discard.call(
    bout,
    new sgs.Operate('弃牌', players[0], players[0], []),
  );
  const advance = timers.pop();
  advance();
  assert.strictEqual(bout.curplayer, 2, 'turn advancement must skip dead players');
}

{
  const players = makePlayers(sgs, '曹操', 0);
  const bout = makeBout(sgs, players);
  bout.curplayer = 0;
  bout.step = 3;
  players[0].status = {
    chained: true,
    used_slash: true,
    used_jiu: true,
    jiu_damage: true,
    lebusishu: true,
  };
  sgs.Bout.prototype.discard.call(
    bout,
    new sgs.Operate('弃牌', players[0], players[0], []),
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(players[0].status)),
    { chained: true },
    'turn end should preserve chained state but clear turn-scoped flags',
  );
  timers.pop();
}

{
  const players = makePlayers(sgs, '曹操', 0);
  const bout = makeBout(sgs, players);
  bout.curplayer = 0;
  bout.step = 1;
  const recycled = [new sgs.Card('桃', 1, 3), new sgs.Card('闪', 0, 2)];
  bout.card = [];
  bout.discardPile = recycled.slice();
  sgs.Bout.prototype.getcard.call(bout);
  assert.strictEqual(players[0].card.length, 2, 'draw should recycle the discard pile');
  assert.strictEqual(bout.discardPile.length, 0);
  assert(recycled.every((card) => players[0].card.includes(card)), 'draw must not clone a fresh deck');
}

console.log(`turn matrix passed: ${cases} hero/identity cycles plus delayed-state cases`);
