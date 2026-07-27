const fs = require('fs');
const path = require('path');
const vm = require('vm');

const projectRoot = path.resolve(__dirname, '../..');

function loadGame(options = {}) {
  const timers = [];
  const logs = [];
  const context = {
    console: options.console || {
      log: (...args) => logs.push(args),
      warn: (...args) => logs.push(args),
      error: (...args) => logs.push(args),
    },
    window: {},
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
  };
  context.window = context;
  vm.createContext(context);
  [
    'logic_func.js',
    'data.js',
    'logic_interpreter.js',
    'logic.js',
    'logic_ai.js',
  ].forEach((file) => {
    vm.runInContext(
      fs.readFileSync(path.join(projectRoot, file), 'utf8').replace(/^\uFEFF/, ''),
      context,
      { filename: file },
    );
  });
  Object.keys(context.sgs.EXPANSION_PACKS).forEach((pack) => {
    context.sgs.applyExpansionPack(pack);
  });
  return { context, sgs: context.sgs, timers, logs, projectRoot };
}

function makePlayers(sgs, heroName, sourceIdentity = 0) {
  const sourceHero = sgs.HERO.find((hero) => hero.name === heroName) || sgs.HERO[0];
  const fallbackHeroes = ['刘备', '孙权', '吕布']
    .map((name) => sgs.HERO.find((hero) => hero.name === name));
  const identities = [sourceIdentity, 0, 1, 3];
  return [sourceHero, ...fallbackHeroes].map((hero, index) => {
    const player = new sgs.Player(`p${index}`, identities[index], hero, true);
    player.dom = {};
    return player;
  });
}

function makeBout(sgs, players) {
  const events = [];
  const playernum = {};
  players.forEach((player, index) => { playernum[player.nickname] = index; });
  const bout = {
    player: players,
    playerlen: players.length,
    playernum,
    opt: [],
    choice: [],
    card: [],
    discardPile: [],
    last_judge_card: undefined,
    events,
    continueCalls: 0,
    notify(type, ...args) { events.push({ type, args }); },
    continue() { this.continueCalls += 1; },
    judge() { return true; },
    live_body_identity() {
      return this.player.map((player) => player.blood > 0 ? player.identity : -1);
    },
    hero_range(player, distance) {
      return sgs.Bout.prototype.hero_range.call(this, player, distance);
    },
    next_player(player) {
      return sgs.Bout.prototype.next_player.call(this, player);
    },
  };
  return bout;
}

function cardState(bout) {
  return JSON.stringify({
    hands: bout.player.map((player) => player.card.map((card) => card.name)),
    blood: bout.player.map((player) => player.blood),
    equips: bout.player.map((player) => player.equip.map((card) => card && card.name)),
    decisions: bout.player.map((player) => player.be_decision.map((item) => item.id)),
    status: bout.player.map((player) => player.status),
    choices: bout.choice.map((item) => item.id),
    stack: bout.opt.map((item) => item.id),
    discard: (bout.discardPile || []).map((card) => card.name),
    applied: bout.events.filter((event) => event.type !== 'choice_card').map((event) => event.type),
  });
}

module.exports = {
  loadGame,
  makePlayers,
  makeBout,
  cardState,
};
