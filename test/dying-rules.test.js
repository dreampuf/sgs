const assert = require('assert');
const { loadGame, makePlayers, makeBout } = require('./support/game');

const { sgs } = loadGame();
let identityCases = 0;

function exhaustPeachRequests(bout) {
  while (bout.choice.length) {
    const request = bout.choice.at(-1);
    sgs.interpreter.response_card(
      bout,
      new sgs.Operate('桃', request.target, request.source),
    );
  }
}

for (const killerIdentity of [0, 1, 2, 3]) {
  for (const victimIdentity of [0, 1, 2, 3]) {
    const players = makePlayers(sgs, '曹操', killerIdentity);
    const [killer, victim] = players;
    victim.identity = victimIdentity;
    victim.blood = 1;
    victim.card = [new sgs.Card('闪', 1, 2)];
    const bout = makeBout(sgs, players);
    bout.card = Array.from({ length: 20 }, (_, index) => new sgs.Card('杀', 3, index + 1));
    const slash = new sgs.Card('杀', 3, 7);
    sgs.interpreter.choice_card(bout, new sgs.Operate('杀', killer, victim, slash));
    sgs.interpreter.response_card(bout, new sgs.Operate('闪', victim, killer));
    assert(bout.choice.every((request) => request.id === '桃' && request.data === '桃'));
    exhaustPeachRequests(bout);
    assert.strictEqual(victim.blood, 0);
    assert.strictEqual(victim.status.dead, true, `${killerIdentity}->${victimIdentity}: death not finalized`);
    assert.strictEqual(victim.card.length, 0, 'dead player hand should enter discard pile');
    assert(bout.events.some((event) => event.type === 'death'), 'death event should be emitted');
    identityCases += 1;
  }
}

{
  const players = makePlayers(sgs, '曹操', 0);
  const [killer, victim, rescuer] = players;
  victim.blood = 1;
  const bout = makeBout(sgs, players);
  const slash = new sgs.Card('杀', 3, 7);
  sgs.interpreter.choice_card(bout, new sgs.Operate('杀', killer, victim, slash));
  sgs.interpreter.response_card(bout, new sgs.Operate('闪', victim, killer));
  const rescue = bout.choice.find((request) => request.target === rescuer);
  assert(rescue, 'living rescuer should receive a Peach request');
  sgs.interpreter.response_card(
    bout,
    new sgs.Operate('桃', rescuer, victim, new sgs.Card('桃', 1, 3)),
  );
  assert.strictEqual(victim.blood, 1);
  assert.strictEqual(victim.status.dead, false);
  assert.strictEqual(bout.choice.length, 0, 'successful rescue should clear remaining Peach requests');
}

{
  const players = makePlayers(sgs, '曹操', 1);
  const [killer, rebel] = players;
  rebel.identity = 3;
  rebel.blood = 0;
  const bout = makeBout(sgs, players);
  bout.card = [
    new sgs.Card('杀', 3, 7),
    new sgs.Card('闪', 1, 2),
    new sgs.Card('桃', 1, 3),
  ];
  const before = killer.card.length;
  sgs.interpreter.ask_peach(bout, rebel, killer);
  exhaustPeachRequests(bout);
  assert.strictEqual(killer.card.length, before + 3, 'killing a rebel should draw three cards');
}

{
  const players = makePlayers(sgs, '曹操', 0);
  const [lord, loyalist] = players;
  loyalist.identity = 1;
  loyalist.blood = 0;
  lord.card = [new sgs.Card('杀', 3, 7), new sgs.Card('桃', 1, 3)];
  lord.equip[0] = new sgs.Card('青釭剑', 3, 6);
  const bout = makeBout(sgs, players);
  sgs.interpreter.ask_peach(bout, loyalist, lord);
  exhaustPeachRequests(bout);
  assert.strictEqual(lord.card.length, 0, 'lord killing a loyalist should discard all hand cards');
  assert.strictEqual(lord.equip[0], undefined, 'lord killing a loyalist should discard all equipment');
}

console.log(`dying/death scenarios passed: ${identityCases} killer/victim identity cases plus rescue and rewards`);
