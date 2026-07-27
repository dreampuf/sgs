const assert = require('assert');
const { loadGame, makePlayers, makeBout } = require('./support/game');

const { sgs } = loadGame();
let cases = 0;

for (const identity of [0, 1, 2, 3]) {
  {
    const players = makePlayers(sgs, '曹操', identity);
    const bout = makeBout(sgs, players);
    const [source, target] = players;
    const indulgence = new sgs.Card('乐不思蜀', 1, 6);
    sgs.interpreter.choice_card(bout, new sgs.Operate('乐不思蜀', source, target, indulgence));
    assert.strictEqual(target.be_decision.length, 1);
    bout.card = [new sgs.Card('杀', 3, 7)];
    sgs.interpreter.decision(bout, target, target.be_decision.pop());
    assert.strictEqual(target.status.lebusishu, true);
    assert(bout.discardPile.includes(indulgence));
    assert.strictEqual(bout.opt.length, 0);
    cases += 1;
  }

  {
    const players = makePlayers(sgs, '曹操', identity);
    const bout = makeBout(sgs, players);
    const [source, target] = players;
    const shortage = new sgs.Card('兵粮寸断', 2, 4);
    sgs.interpreter.choice_card(bout, new sgs.Operate('兵粮寸断', source, target, shortage));
    bout.card = [new sgs.Card('杀', 2, 7)];
    sgs.interpreter.decision(bout, target, target.be_decision.pop());
    assert.strictEqual(target.status.bingliang, undefined, 'club judgment should pass Supply Shortage');
    assert(bout.discardPile.includes(shortage));
    assert.strictEqual(bout.opt.length, 0);
    cases += 1;
  }

  {
    const players = makePlayers(sgs, '曹操', identity);
    const bout = makeBout(sgs, players);
    const [source, target, next] = players;
    const lightning = new sgs.Card('闪电', 3, 1);
    sgs.interpreter.choice_card(bout, new sgs.Operate('闪电', source, source, lightning));
    assert.strictEqual(source.be_decision[0].has_init, true);
    bout.card = [new sgs.Card('闪', 1, 7)];
    sgs.interpreter.decision(bout, source, source.be_decision.pop());
    assert.strictEqual(target.be_decision.length, 1, 'missed Lightning should pass to the next living player');
    assert.strictEqual(target.be_decision[0].data, lightning);
    assert.strictEqual(next.be_decision.length, 0);
    assert(!bout.discardPile.includes(lightning));
    cases += 1;
  }

  {
    const players = makePlayers(sgs, '曹操', identity);
    const bout = makeBout(sgs, players);
    const [source] = players;
    const lightning = new sgs.Card('闪电', 3, 1);
    const before = source.blood;
    sgs.interpreter.choice_card(bout, new sgs.Operate('闪电', source, source, lightning));
    bout.card = [new sgs.Card('杀', 3, 5)];
    sgs.interpreter.decision(bout, source, source.be_decision.pop());
    assert.strictEqual(source.blood, before - 3);
    assert(bout.discardPile.includes(lightning));
    assert.strictEqual(bout.opt.length, 0);
    cases += 1;
  }
}

{
  const players = makePlayers(sgs, '曹操', 0);
  const bout = makeBout(sgs, players);
  const [source, target, nullifier] = players;
  const indulgence = new sgs.Card('乐不思蜀', 1, 6);
  nullifier.card = [new sgs.Card('无懈可击', 3, 11)];
  sgs.interpreter.choice_card(bout, new sgs.Operate('乐不思蜀', source, target, indulgence));
  bout.card = [new sgs.Card('杀', 3, 7)];
  sgs.interpreter.decision(bout, target, target.be_decision.pop());
  assert.strictEqual(bout.choice.at(-1).id, '无懈可击');
  sgs.interpreter.response_card(
    bout,
    new sgs.Operate('无懈可击', nullifier, target, nullifier.card[0]),
  );
  assert.strictEqual(bout.opt.length, 0);
  assert.strictEqual(bout.choice.length, 0);
  assert(bout.discardPile.includes(indulgence));
}

console.log(`delayed trick scenarios passed: ${cases} identity/card cases plus nullification`);
