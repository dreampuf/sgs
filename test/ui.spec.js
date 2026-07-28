const { test, expect } = require('@playwright/test');

const CARD_ID = {
  '杀': 'standard:slash',
  '闪': 'standard:jink',
  '桃': 'standard:peach',
  '酒': 'standard:wine',
  '无懈可击': 'standard:nullification',
  '无中生有': 'standard:ex-nihilo',
  '南蛮入侵': 'standard:savage-assault',
  '铁索连环': 'standard:iron-chain',
  '决斗': 'standard:duel',
  '五谷丰登': 'standard:amazing-grace',
  '火攻': 'standard:fire-attack',
  '朱雀羽扇': 'standard:fan',
  '过河拆桥': 'standard:dismantlement',
  '乐不思蜀': 'standard:indulgence',
  '八卦阵': 'standard:eight-diagram'
};

function capturePageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message || String(error)));
  return errors;
}

async function openStartScreen(page) {
  await page.goto('/');
  await page.evaluate(() => {
    const loading = document.querySelector('#data_load');
    if (loading) loading.style.display = 'none';
  });
  await expect(page.locator('#main')).toBeVisible();
  await expect(page.locator('#game_start')).toBeVisible();
  await expect(page.locator('#start_options')).toBeVisible();
}

async function startCoreGame(page) {
  await openStartScreen(page);
  await page.evaluate(() => {
    window.sgs.func.set_random_seed(20260727);
    window.sgs.motion.setInstant(true);
  });
  await page.locator('#game_start').click();
  await expect(page.locator('#choose_box')).toBeVisible();
  await page.locator('.choose_role_card').first().click();
  await page.waitForFunction(() => {
    const bout = window.sgs.interface.bout;
    return bout.engine === 'core' &&
      document.querySelectorAll('.player_card').length >= 4;
  }, null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.sgs.motion.setInstant(true);
    window.sgs.interface.bout.pause();
  });
  await configureState(page);
}

async function configureState(page, fixture = {}) {
  const payload = {
    ...fixture,
    humanHand: (fixture.humanHand || ['杀', '闪', '桃', '无懈可击'])
      .map((name) => CARD_ID[name]),
    aiHand: (fixture.aiHand || ['杀', '杀', '杀', '杀'])
      .map((name) => CARD_ID[name]),
    humanEquipment: fixture.humanEquipment
      ? CARD_ID[fixture.humanEquipment]
      : null
  };
  await page.evaluate((fixture) => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const state = bout.state();
    const opponents = bout.player.filter((player) => player !== human);
    const actor = fixture.current === 'ai' ? opponents[0] : human;
    state.currentPlayerId = actor.id;
    state.phase = fixture.phase || 'action';
    state.pendingDecision = null;
    state.stack = [];
    state.triggerQueue = [];
    state.turnUsage[actor.id] = {};

    const setHand = (playerId, definitions) => {
      const hand = state.zones[`zone:hand:${playerId}`];
      hand.forEach((cardId, index) => {
        state.cards[cardId].definitionId =
          definitions[index] || 'standard:jink';
      });
    };
    setHand(human.id, fixture.humanHand);
    opponents.forEach((player) => setHand(player.id, fixture.aiHand));

    if (fixture.clearOpponentCards) {
      opponents.forEach((player) => {
        const zoneId = `zone:hand:${player.id}`;
        state.zones['zone:discard'].push(...state.zones[zoneId]);
        state.zones[zoneId] = [];
      });
    }
    state.players[human.id].maxHp = 4;
    state.players[human.id].hp = fixture.humanHp ?? 4;
    state.players[human.id].skillIds = [...(fixture.humanSkills || [])];
    opponents.forEach((player) => {
      state.players[player.id].skillIds = [];
    });
    if (fixture.humanEquipment) {
      const handZoneId = `zone:hand:${human.id}`;
      const equipmentZoneId = `zone:equipment:${human.id}`;
      const cardId = state.zones[handZoneId][0];
      state.zones[handZoneId].shift();
      state.cards[cardId].definitionId = fixture.humanEquipment;
      state.zones[equipmentZoneId].push(cardId);
    }
    if (fixture.drawTop) {
      const topId = state.zones['zone:draw'][0];
      state.cards[topId].definitionId =
        fixture.drawTop.definitionId || 'standard:peach';
      state.cards[topId].suit = fixture.drawTop.suit;
      state.cards[topId].rank = fixture.drawTop.rank;
    }
    bout.restoreSnapshot(JSON.stringify(state));

    human.stage = actor === human && state.phase === 'action' ? 2 : -1;
    human.targets = [];
    human.selected_targets = [];
    human.selected_cards = [];
    human.target_selectable_count = -1;
    human.card_selectable_count = -1;
    human.card.forEach((card) => { card.selected = false; });
    document.querySelector('#player_cover').style.display =
      actor === human ? 'none' : 'block';
    document.querySelector('#ok').style.display = 'none';
    document.querySelector('#cancel').style.display = 'none';
    document.querySelector('#abandon').style.display =
      actor === human && state.phase === 'action' ? 'block' : 'none';
    if (actor === human && state.phase === 'action') human.choice_card();
  }, payload);
}

async function clickHandCard(page, name) {
  await page.locator('.player_card').evaluateAll((cards, cardName) => {
    const card = cards.find(
      (element) => window.sgs.view.cardFor(element)?.name === cardName
    );
    if (!card) throw new Error(`hand does not contain ${cardName}`);
    card.click();
  }, name);
}

async function showPendingHumanDecision(page) {
  await page.evaluate(() => window.sgs.interface.bout.resume());
  await expect.poll(() => page.evaluate(() => {
    const state = window.sgs.interface.bout.state();
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    return state.pendingDecision &&
      state.pendingDecision.request.playerId === human.id;
  })).toBeTruthy();
  await expect.poll(() => page.evaluate(() => {
    const request = window.sgs.interface.bout.state().pendingDecision.request;
    return request.type === 'respond-card'
      ? getComputedStyle(document.querySelector('#cancel')).display !== 'none'
      : !!document.querySelector('#choose_box');
  })).toBe(true);
  await page.evaluate(() => window.sgs.interface.bout.pause());
}

async function dispatchAiCard(page, definitionId, targetId) {
  await page.evaluate(({ definitionId, targetId }) => {
    const bout = window.sgs.interface.bout;
    const action = bout.legalActions().find((candidate) => {
      if (candidate.type !== 'use-card') return false;
      const state = bout.state();
      return state.cards[candidate.cardId].definitionId === definitionId &&
        candidate.targetIds.includes(targetId);
    });
    if (!action) throw new Error(`AI has no legal ${definitionId}`);
    bout.dispatchCommand(action);
  }, { definitionId, targetId });
}

async function passNonHumanDecisions(page) {
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    for (let guard = 0; guard < 32; guard += 1) {
      const request = bout.state().pendingDecision?.request;
      if (!request || request.playerId === human.id) break;
      const pass = bout.legalActions().find((action) => action.type === 'pass');
      if (!pass) break;
      bout.dispatchCommand(pass);
    }
  });
}

async function passAllDecisions(page) {
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    for (let guard = 0; guard < 64; guard += 1) {
      if (!bout.state().pendingDecision) break;
      const pass = bout.legalActions().find((action) => action.type === 'pass');
      if (!pass) break;
      bout.dispatchCommand(pass);
    }
  });
}

test('生产入口只加载 Core 对局，不再暴露旧解释器或旧 AI', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  const runtime = await page.evaluate(() => ({
    engine: window.sgs.interface.bout.engine,
    hasSession: !!window.sgs.interface.bout.session,
    interpreter: typeof window.sgs.interpreter,
    ai: typeof window.sgs.Ai,
    operate: typeof window.sgs.Operate,
    legacyBout: typeof window.sgs.Bout,
    nonLordHasLordSkill: window.sgs.interface.bout.player
      .filter((player) => player.identity !== 0)
      .some((player) => {
        const skillIds =
          window.sgs.interface.bout.state().players[player.id].skillIds;
        return skillIds.some((skillId) =>
          ['护驾', '激将', '救援', '黄天', '血裔', '颂威', '暴虐']
            .some((name) => skillId.endsWith(`:${name}`))
        );
      }),
    hasPlayerExpando: Object.prototype.hasOwnProperty.call(
      document.querySelector('#player'),
      'player'
    ),
    hasCardExpando: [...document.querySelectorAll('.player_card')]
      .some((element) => Object.prototype.hasOwnProperty.call(element, 'card')),
    modelHasDom: window.sgs.interface.bout.player
      .some((player) => Object.prototype.hasOwnProperty.call(player, 'dom'))
  }));
  expect(runtime).toEqual({
    engine: 'core',
    hasSession: true,
    interpreter: 'undefined',
    ai: 'undefined',
    operate: 'undefined',
    legacyBout: 'undefined',
    nonLordHasLordSkill: false,
    hasPlayerExpando: false,
    hasCardExpando: false,
    modelHasDom: false
  });
  expect(errors).toEqual([]);
});

test('首次原生发牌动画完成前 Core 不开始推进', async ({ page }) => {
  await openStartScreen(page);
  await page.evaluate(() => {
    window.sgs.func.set_random_seed(20260728);
    window.sgs.motion.setInstant(false);
  });
  await page.locator('#game_start').click();
  await page.locator('.choose_role_card').first().click();
  const started = await page.evaluate(() => ({
    eventCount: window.sgs.interface.bout.state().eventLog.length,
    nativeAnimations: document.getAnimations().length,
    motionAnimating: window.sgs.motion.isAnimating()
  }));
  expect(started.eventCount).toBe(0);
  expect(started.nativeAnimations).toBeGreaterThan(0);
  expect(started.motionAnimating).toBe(true);

  await page.waitForTimeout(150);
  expect(await page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.length
  )).toBe(0);
  await expect(page.locator('#cards > .player_card'))
    .toHaveCount(4, { timeout: 2000 });
  await page.evaluate(() => {
    window.sgs.interface.bout.pause();
    window.sgs.motion.setInstant(true);
  });
});

test('浏览器构造全部 43 张卡牌、49 名武将和 4 种身份组合', async ({ page }) => {
  await openStartScreen(page);
  await page.evaluate(() => window.sgs.motion.setInstant(true));
  for (const pack of ['wind', 'fire', 'forest', 'military']) {
    await page.locator(`input[value="${pack}"]`).check();
  }
  await page.locator('#game_start').click();
  await page.locator('.choose_role_card').first().click();
  await page.waitForFunction(() => {
    const bout = window.sgs.interface.bout;
    return bout.engine === 'core' &&
      document.querySelectorAll('.player_card').length >= 4;
  }, null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.sgs.motion.setInstant(true);
    window.sgs.interface.bout.pause();
  });
  const result = await page.evaluate(async () => {
    const manifest = window.sgs.interface.bout.contentManifest();
    const heroes = window.sgs.HERO;
    const cards = [...new Map(
      window.sgs.CARD.map((card) => [card.name, card])
    ).values()];
    const coreHeroes = new Map(
      manifest.heroes.map((hero) => [hero.name, hero])
    );
    const coreCards = new Map(
      manifest.cards.map((card) => [card.name, card])
    );
    const failures = [];
    let cases = 0;

    for (const hero of heroes) {
      for (const identity of [0, 1, 2, 3]) {
        for (const sourceCard of cards) {
          const player = new window.sgs.Player(
            `_${hero.name}_`,
            identity,
            hero,
            identity !== 0
          );
          const card = new window.sgs.Card(
            sourceCard.name,
            sourceCard.color,
            sourceCard.digit
          );
          if (
            player.hero !== hero ||
            player.identity !== identity ||
            !window.sgs.IDENTITY_INDEX_MAPPING.name[identity] ||
            card.name !== sourceCard.name ||
            !coreHeroes.has(hero.name) ||
            !coreCards.has(card.name)
          ) {
            failures.push(`${hero.name}/${identity}/${sourceCard.name}`);
          }
          cases += 1;
        }
      }
    }

    const assetUrls = [
      ...heroes.map((hero) =>
        window.sgs.interface.heroImage(hero.name, 'hero')
      ),
      ...cards.map((card) => window.sgs.interface.cardImage(card.name))
    ];
    const assetChecks = await Promise.all(assetUrls.map(async (url) => ({
      url,
      ok: url.indexOf('none.png') === -1 && (await fetch(url)).ok
    })));
    return {
      cardCount: cards.length,
      heroCount: heroes.length,
      identityCount: 4,
      cases,
      failures,
      missingAssets: assetChecks.filter((asset) => !asset.ok)
    };
  });

  expect(result).toEqual({
    cardCount: 43,
    heroCount: 49,
    identityCount: 4,
    cases: 8428,
    failures: [],
    missingAssets: []
  });
});

test('扩展包选择只更新选中的真实数据包与素材映射', async ({ page }) => {
  await openStartScreen(page);
  await page.evaluate(() => window.sgs.motion.setInstant(true));
  await page.locator('input[value="wind"]').uncheck();
  await page.locator('input[value="military"]').check();
  await page.locator('input[value="fire"]').check();
  await page.locator('#game_start').click();
  await expect(page.locator('#start_options')).toBeHidden();
  await expect.poll(() => page.evaluate(() => ({
    wind: !!window.sgs.EXPANSION_PACKS.wind.enabled,
    military: !!window.sgs.EXPANSION_PACKS.military.enabled,
    fire: !!window.sgs.EXPANSION_PACKS.fire.enabled
  }))).toEqual({ wind: false, military: true, fire: true });
  expect(await page.evaluate(() =>
    window.sgs.interface.heroImage('卧龙诸葛亮', 'small')
  )).toContain('portrait/small/wolong.jpg');
  await page.locator('.choose_role_card').first().click();
  await page.waitForFunction(() =>
    window.sgs.interface.bout.engine === 'core'
  );
  const content = await page.evaluate(() =>
    window.sgs.interface.bout.contentManifest()
  );
  expect(content.packs.map((pack) => pack.id)).toEqual([
    'standard',
    'maneuvering',
    'fire'
  ]);
  expect(content.cardPrintCount).toBe(160);
  expect(content.heroes.find((hero) => hero.name === '卧龙诸葛亮'))
    .toMatchObject({
      id: 'fire:hero:卧龙诸葛亮',
      implementation: 'complete',
      skillIds: [
        'fire:skill:八阵',
        'fire:skill:火计',
        'fire:skill:看破'
      ]
    });
  expect(content.heroes.some((hero) => hero.id.startsWith('wind:hero:')))
    .toBe(false);
});

test('出牌阶段根据 Core legalActions 预先灰置不可用牌', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['闪', '桃', '无懈可击', '过河拆桥'],
    clearOpponentCards: true
  });
  const disabled = await page.locator('.player_card').evaluateAll((cards) =>
    Object.fromEntries(cards.map((element) => [
      window.sgs.view.cardFor(element).name,
      element.getAttribute('aria-disabled')
    ]))
  );
  expect(disabled).toMatchObject({
    '闪': 'true',
    '桃': 'true',
    '无懈可击': 'true',
    '过河拆桥': 'true'
  });
});

test('主动出杀高亮合法目标，确认后进入 Core 响应窗口', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await configureState(page, { humanHand: ['杀'] });
  const before = await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).card.length
  );
  await clickHandCard(page, '杀');
  await expect(page.locator('.role.target_available')).not.toHaveCount(0);
  await expect(page.locator('#ok')).toBeHidden();
  await page.locator('.role.target_available').first().click();
  await expect(page.locator('.role.target_selected')).toHaveCount(1);
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();
  await expect.poll(() => page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).card.length
  )).toBe(before - 1);
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().pendingDecision?.request.responseKind
  )).toBe('jink');
  expect(errors).toEqual([]);
});

test('桃无需手选目标，并由 Core 恢复体力及移动手牌', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, { humanHand: ['桃'], humanHp: 3 });
  const before = await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).card.length
  );
  await clickHandCard(page, '桃');
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();
  await expect.poll(() => page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).blood
  )).toBe(4);
  await expect(page.locator('#cards > .player_card')).toHaveCount(before - 1);
  await expect(page.locator('#discard_pile_box .discard_card'))
    .toHaveCount(1, { timeout: 2500 });
});

test('五谷丰登作为零目标牌进入公共牌池选择界面', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await configureState(page, { humanHand: ['五谷丰登'] });
  await clickHandCard(page, '五谷丰登');
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().pendingDecision?.request.type
  )).toBe('respond-card');
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    for (let guard = 0; guard < 64; guard += 1) {
      const request = bout.state().pendingDecision?.request;
      if (
        !request ||
        (request.playerId === human.id && request.type === 'select-cards')
      ) {
        break;
      }
      const legal = bout.legalActions();
      const command = request.type === 'respond-card'
        ? legal.find((action) => action.type === 'pass')
        : legal.find((action) => action.type === 'choose-cards');
      if (!command) throw new Error(`cannot advance ${request.type}`);
      bout.dispatchCommand(command);
    }
  });
  await showPendingHumanDecision(page);

  const pending = await page.evaluate(() =>
    window.sgs.interface.bout.state().pendingDecision?.request
  );
  expect(pending).toMatchObject({
    type: 'select-cards',
    reason: 'amazing-grace',
    minimum: 1,
    maximum: 1
  });
  await expect(page.locator('#choose_box')).toBeVisible();
  await expect(page.locator('#choose_box .choose_card'))
    .toHaveCount(pending.selectableCardIds.length);

  const selectedName = await page.locator('#choose_box .choose_card')
    .first()
    .evaluate((element) => window.sgs.view.cardFor(element).name);
  await page.locator('#choose_box .choose_card').first().click();
  await expect.poll(() => page.evaluate((cardName) => {
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    return human.card.some((card) => card.name === cardName);
  }, selectedName)).toBe(true);
  expect(errors).toEqual([]);
});

test('铁索连环支持一至两名目标并投影横置状态', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, { humanHand: ['铁索连环'] });
  await clickHandCard(page, '铁索连环');
  const targets = page.locator('.role.target_available');
  await targets.nth(0).click();
  await targets.nth(1).click();
  await expect(page.locator('.role.target_selected')).toHaveCount(2);
  await page.locator('#ok').click();
  await passAllDecisions(page);
  await expect.poll(() => page.evaluate(() => {
    const state = window.sgs.interface.bout.state();
    return {
      count: Object.values(state.players)
        .filter((player) => player.marks.chained === true).length,
      pending: state.pendingDecision?.request.type || null,
      tail: state.eventLog.slice(-8).map((event) => event.type)
    };
  })).toMatchObject({ count: 2, pending: null });
});

test('过河拆桥的目标高亮来自 Core 目标集合', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, { humanHand: ['过河拆桥'] });
  const expected = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const state = bout.state();
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const cardId = state.zones[`zone:hand:${human.id}`].find(
      (id) => state.cards[id].definitionId === 'standard:dismantlement'
    );
    return new Set(bout.legalActions()
      .filter((action) => action.type === 'use-card' && action.cardId === cardId)
      .flatMap((action) => action.targetIds)).size;
  });
  await clickHandCard(page, '过河拆桥');
  await expect(page.locator('.role.target_available')).toHaveCount(expected);
});

test('过河拆桥只选择目标区域，目标手牌保持隐藏且不追加己方支付', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['过河拆桥', '杀', '闪', '桃'],
    aiHand: ['杀', '闪', '杀', '桃']
  });

  const fixture = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const state = bout.state();
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const cardId = state.zones[`zone:hand:${human.id}`].find(
      (id) => state.cards[id].definitionId === 'standard:dismantlement'
    );
    const use = bout.legalActions().find((action) =>
      action.type === 'use-card' &&
      action.cardId === cardId &&
      action.targetIds.length === 1
    );
    if (!use) throw new Error('过河拆桥没有合法的单一目标');
    const targetId = use.targetIds[0];
    const humanBefore = state.zones[`zone:hand:${human.id}`].length;
    const targetBefore = state.zones[`zone:hand:${targetId}`].length;
    bout.dispatchCommand(use);
    for (let guard = 0; guard < 16; guard += 1) {
      const request = bout.state().pendingDecision?.request;
      if (!request || request.type !== 'respond-card') break;
      const pass = bout.legalActions().find((action) => action.type === 'pass');
      if (!pass) throw new Error('无懈可击窗口无法跳过');
      bout.dispatchCommand(pass);
    }
    bout.resume();
    return { humanId: human.id, targetId, humanBefore, targetBefore };
  });

  await expect(page.locator('#choose_box')).toBeVisible();
  await page.evaluate(() => window.sgs.interface.bout.pause());
  const decision = await page.evaluate(() => {
    const state = window.sgs.interface.bout.state();
    const request = state.pendingDecision?.request;
    const zones = request.selectableCardIds.map((cardId) =>
      Object.entries(state.zones).find(([, ids]) => ids.includes(cardId))?.[0]
    );
    return {
      type: request.type,
      playerId: request.playerId,
      reason: request.reason,
      zones
    };
  });
  expect(decision).toMatchObject({
    type: 'select-cards',
    playerId: fixture.humanId,
    reason: 'dismantle'
  });
  expect(decision.zones.every((zone) =>
    zone === `zone:hand:${fixture.targetId}`
  )).toBe(true);
  await expect(page.locator('#choose_box_title')).toContainText('的区域');
  await expect(page.locator('#choose_box .hidden_choice_card'))
    .toHaveCount(fixture.targetBefore);
  await expect(page.locator('#choose_box .hidden_choice_card').first())
    .toHaveAttribute('aria-label', '目标手牌（未知）');
  await expect(page.locator('#choose_box .hidden_choice_card img').first())
    .toHaveAttribute('src', 'img/system/card_back.png');

  await page.locator('#choose_box .choose_card').first().click();
  await expect.poll(() => page.evaluate(({ humanId, targetId }) => {
    const state = window.sgs.interface.bout.state();
    return {
      human: state.zones[`zone:hand:${humanId}`].length,
      target: state.zones[`zone:hand:${targetId}`].length
    };
  }, fixture)).toEqual({
    human: fixture.humanBefore - 1,
    target: fixture.targetBefore - 1
  });
});

test('AI 出杀时玩家可用闪响应，牌与领域事件同步', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    aiHand: ['杀'],
    humanHand: ['闪']
  });
  const humanId = await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).id
  );
  await dispatchAiCard(page, 'standard:slash', humanId);
  await showPendingHumanDecision(page);
  const before = await page.locator('#cards > .player_card').count();
  await clickHandCard(page, '闪');
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();
  await expect(page.locator('#cards > .player_card')).toHaveCount(before - 1);
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.some(
      (event) => event.type === 'CardResponded' && event.responseKind === 'jink'
    )
  )).toBe(true);
});

test('取消闪响应不消耗手牌并由 Core 结算伤害', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    aiHand: ['杀'],
    humanHand: ['闪']
  });
  const humanId = await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).id
  );
  await dispatchAiCard(page, 'standard:slash', humanId);
  await showPendingHumanDecision(page);
  const before = await page.locator('#cards > .player_card').count();
  await page.locator('#cancel').click();
  await expect(page.locator('#cards > .player_card')).toHaveCount(before);
  await expect.poll(() => page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).blood
  )).toBe(3);
});

test('濒死后再次显示求桃响应，桃可完成救援', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    aiHand: ['杀'],
    humanHand: ['桃'],
    humanHp: 1
  });
  const humanId = await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).id
  );
  await dispatchAiCard(page, 'standard:slash', humanId);
  await showPendingHumanDecision(page);
  await page.locator('#cancel').click();
  await showPendingHumanDecision(page);
  await clickHandCard(page, '桃');
  await page.locator('#ok').click();
  await expect.poll(() => page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).blood
  )).toBe(1);
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.some(
      (event) => event.type === 'PlayerRescued'
    )
  )).toBe(true);
});

test('无懈可击走真实响应链并显示抵消反馈', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    aiHand: ['过河拆桥'],
    humanHand: ['无懈可击']
  });
  await page.evaluate(() => window.sgs.motion.setInstant(false));
  const targetId = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const sourceId = bout.state().currentPlayerId;
    return bout.player.find((player) =>
      player.id !== sourceId && player.isAI
    ).id;
  });
  await dispatchAiCard(page, 'standard:dismantlement', targetId);
  await passNonHumanDecisions(page);
  await showPendingHumanDecision(page);
  await clickHandCard(page, '无懈可击');
  await page.locator('#ok').click();
  await passAllDecisions(page);
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.some(
      (event) => event.type === 'CardCancelled' &&
        event.reason === 'nullification'
    )
  )).toBe(true);
  await expect(page.locator('.nullified_effect')).toContainText('抵消');
  await page.evaluate(() => window.sgs.motion.setInstant(true));
});

test('乐不思蜀进入判定区并由共享判定链移除', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['乐不思蜀'],
    drawTop: { suit: 'heart', rank: 7 }
  });
  await clickHandCard(page, '乐不思蜀');
  await page.locator('.role.target_available').first().click();
  await page.locator('#ok').click();
  await passAllDecisions(page);
  const targetId = await page.evaluate(() => {
    const event = [...window.sgs.interface.bout.state().eventLog]
      .reverse().find((item) => item.type === 'DelayedCardPlaced');
    return event.playerId;
  });
  await expect(page.locator('.delayed_status[data-card-name="乐不思蜀"]'))
    .toHaveCount(1);
  await page.evaluate((targetId) => {
    const bout = window.sgs.interface.bout;
    const state = bout.state();
    state.currentPlayerId = targetId;
    state.phase = 'judgment';
    state.pendingDecision = null;
    state.stack = [];
    state.triggerQueue = [];
    bout.restoreSnapshot(JSON.stringify(state));
    bout.dispatchCommand({ type: 'advance-phase', playerId: targetId });
  }, targetId);
  await passAllDecisions(page);
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.some(
      (event) => event.type === 'JudgmentRevealed'
    )
  )).toBe(true);
  await expect(page.locator('.delayed_status[data-card-name="乐不思蜀"]'))
    .toHaveCount(0);
});

test('八卦阵选项框触发红色判定并抵消杀', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    aiHand: ['杀'],
    humanHand: ['闪', '桃'],
    humanEquipment: '八卦阵',
    drawTop: { suit: 'heart', rank: 6 }
  });
  const humanId = await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).id
  );
  await dispatchAiCard(page, 'standard:slash', humanId);
  await showPendingHumanDecision(page);
  await expect(page.locator('.choose_option')).toHaveCount(2);
  await page.locator('.choose_option').filter({ hasText: 'activate' }).click();
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.some(
      (event) => event.type === 'JudgmentResolved' && event.matched
    )
  )).toBe(true);
  expect(await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).blood
  )).toBe(4);
});

test('装备牌只走原生装备动画并在完成后恢复 Core 推进', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['八卦阵', '杀', '闪', '桃']
  });
  await page.evaluate(() => window.sgs.motion.setInstant(false));
  const before = await page.locator('#cards > .player_card').count();
  await clickHandCard(page, '八卦阵');
  await page.locator('#ok').click();

  await page.evaluate(() => window.sgs.motion.whenIdle());
  const result = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const state = bout.state();
    return {
      equipment: state.zones[`zone:equipment:${human.id}`].map(
        (cardId) => state.cards[cardId].definitionId
      ),
      handState: state.zones[`zone:hand:${human.id}`].length,
      handModel: human.card.length,
      handDom: document.querySelectorAll('#cards > .player_card').length,
      equipDom: document.querySelectorAll('#defend .equip_box').length,
      nativeAnimations: document.getAnimations().length,
      motionAnimating: window.sgs.motion.isAnimating()
    };
  });
  expect(result).toEqual({
    equipment: ['standard:eight-diagram'],
    handState: before - 1,
    handModel: before - 1,
    handDom: before - 1,
    equipDom: 1,
    nativeAnimations: 0,
    motionAnimating: false
  });
  await page.evaluate(() => {
    window.sgs.interface.bout.pause();
    window.sgs.motion.setInstant(true);
  });
});

test('通用玩家选择框提交序列化 playerIds', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanSkills: ['standard:skill:突袭'],
    phase: 'judgment'
  });
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    bout.dispatchCommand({ type: 'advance-phase', playerId: human.id });
  });
  await showPendingHumanDecision(page);
  await expect(page.locator('.choose_players')).not.toHaveCount(0);
  await page.locator('.choose_players').nth(1).click();
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.some(
      (event) => event.type === 'DecisionResolved' &&
        Array.isArray(event.selectedPlayerIds) &&
        event.selectedPlayerIds.length === 1
    )
  )).toBe(true);
});

test('没有可用响应牌时自动放弃，不用玩家反复点击取消', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['无中生有'],
    clearOpponentCards: true
  });
  await clickHandCard(page, '无中生有');
  await page.locator('#ok').click();
  await page.evaluate(() => window.sgs.interface.bout.resume());

  await expect.poll(() => page.evaluate(() => {
    const state = window.sgs.interface.bout.state();
    return {
      pending: state.pendingDecision?.request || null,
      resolved: state.eventLog.some(
        (event) => event.type === 'CardsDrawn' && event.count === 2
      )
    };
  })).toEqual({ pending: null, resolved: true });
  await expect(page.locator('#cancel')).toBeHidden();
});

test('选择框使用临时卡牌绑定，火攻弃牌后不会留下幽灵手牌', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['火攻', '朱雀羽扇'],
    aiHand: ['闪']
  });
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const state = bout.state();
    for (const cardId of state.zones[`zone:hand:${human.id}`]) {
      state.cards[cardId].suit = 'diamond';
    }
    for (const player of bout.player.filter((candidate) => candidate !== human)) {
      for (const cardId of state.zones[`zone:hand:${player.id}`]) {
        state.cards[cardId].suit = 'diamond';
      }
    }
    bout.restoreSnapshot(JSON.stringify(state));
    human.stage = 2;
    human.choice_card();
  });

  await clickHandCard(page, '火攻');
  await page.locator('.role.target_available').first().click();
  await page.locator('#ok').click();
  await showPendingHumanDecision(page);
  await expect(page.locator('#choose_box_title')).toContainText(
    '火攻：弃置一张同花色手牌'
  );

  const binding = await page.locator('#choose_box .choose_card').first()
    .evaluate((choice) => {
      const card = window.sgs.view.cardFor(choice);
      const primary = window.sgs.view.cardElement(card);
      return {
        choiceName: card.name,
        primaryClass: primary?.className || '',
        primaryParentId: primary?.parentElement?.id || ''
      };
    });
  expect(binding.primaryClass).toContain('player_card');
  expect(binding.primaryParentId).toBe('cards');

  const before = await page.locator('#cards > .player_card').count();
  await page.locator('#choose_box .choose_card').first().click();
  await expect(page.locator('#cards > .player_card')).toHaveCount(before - 1);
  await expect.poll(() => page.evaluate(() => {
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    return {
      model: human.card.length,
      dom: document.querySelectorAll('#cards > .player_card').length
    };
  })).toEqual({ model: before - 1, dom: before - 1 });
});

test('给予等非摸牌移动后，手牌模型与玩家可见卡牌保持一致', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    aiHand: ['杀'],
    humanHand: ['闪']
  });

  const before = await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).card.length
  );
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const donor = bout.player.find((player) => player !== human);
    const state = bout.state();
    state.players[donor.id].skillIds = ['standard:skill:仁德'];
    bout.restoreSnapshot(JSON.stringify(state));
    const give = bout.legalActions().find((action) =>
      action.type === 'activate-skill' &&
      action.skillId === 'standard:skill:仁德' &&
      action.targetIds.length === 1 &&
      action.targetIds[0] === human.id &&
      action.materialCardIds.length === 1
    );
    if (!give) throw new Error('仁德没有生成单牌给予动作');
    bout.dispatchCommand(give);
  });

  await expect(page.locator('#cards > .player_card')).toHaveCount(before + 1);
  await expect.poll(() => page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    return {
      state: bout.state().zones[`zone:hand:${human.id}`].length,
      model: human.card.length,
      dom: document.querySelectorAll('#cards > .player_card').length
    };
  })).toEqual({ state: before + 1, model: before + 1, dom: before + 1 });
});

test('刘备仁德牌先完成入手动画，Core 才继续推进后续行动', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    aiHand: ['杀', '杀', '杀', '杀'],
    humanHand: ['闪', '桃', '杀', '闪']
  });

  const fixture = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const donor = bout.player.find((player) => player !== human);
    const state = bout.state();
    state.players[donor.id].skillIds = ['standard:skill:仁德'];
    bout.restoreSnapshot(JSON.stringify(state));
    window.sgs.motion.setInstant(false);
    const give = bout.legalActions().find((action) =>
      action.type === 'activate-skill' &&
      action.skillId === 'standard:skill:仁德' &&
      action.targetIds.length === 1 &&
      action.targetIds[0] === human.id &&
      action.materialCardIds.length === 1
    );
    if (!give) throw new Error('仁德没有生成单牌给予动作');
    bout.dispatchCommand(give);
    const eventCount = bout.state().eventLog.length;
    bout.resume();
    return {
      donorId: donor.id,
      humanId: human.id,
      givenCardId: give.materialCardIds[0],
      eventCount
    };
  });

  await page.waitForTimeout(530);
  const atAnimationEnd = await page.evaluate((fixture) => {
    const bout = window.sgs.interface.bout;
    const state = bout.state();
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const card = human.card.find(
      (candidate) => candidate.coreCardId === fixture.givenCardId
    );
    return {
      currentPlayerId: state.currentPlayerId,
      phase: state.phase,
      eventCount: state.eventLog.length,
      cardParent: window.sgs.view.cardElement(card)?.parentElement?.id || null
    };
  }, fixture);
  expect(atAnimationEnd).toEqual({
    currentPlayerId: fixture.donorId,
    phase: 'action',
    eventCount: fixture.eventCount,
    cardParent: 'cards'
  });
  await page.evaluate(() => {
    window.sgs.interface.bout.pause();
    window.sgs.motion.setInstant(true);
  });
});

test('无需弃牌时直接结束回合，不留下选择零张牌的旧提示', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, { humanHand: ['闪'] });
  const humanId = await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).id
  );

  await page.locator('#abandon').click();
  await expect(page.locator('#action_prompt')).toBeHidden();
  await expect.poll(() => page.evaluate((previousPlayerId) => {
    const state = window.sgs.interface.bout.state();
    return state.currentPlayerId !== previousPlayerId;
  }, humanId)).toBe(true);
});
