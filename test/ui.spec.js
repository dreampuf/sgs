const { test, expect } = require('@playwright/test');

const CARD_ID = {
  '杀': 'standard:slash',
  '闪': 'standard:jink',
  '桃': 'standard:peach',
  '酒': 'standard:wine',
  '无懈可击': 'standard:nullification',
  '南蛮入侵': 'standard:savage-assault',
  '铁索连环': 'standard:iron-chain',
  '决斗': 'standard:duel',
  '五谷丰登': 'standard:amazing-grace',
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
  await page.evaluate(() => window.sgs.func.set_random_seed(20260727));
  await page.locator('#game_start').click();
  await expect(page.locator('#choose_box')).toBeVisible();
  await page.locator('.choose_role_card').first().click();
  await page.waitForFunction(() => {
    const bout = window.sgs.interface.bout;
    return bout.engine === 'core' &&
      document.querySelectorAll('.player_card').length >= 4;
  }, null, { timeout: 15_000 });
  await page.evaluate(() => {
    window.jQuery.fx.off = true;
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
    if (fixture.humanHp !== undefined) {
      state.players[human.id].hp = fixture.humanHp;
    }
    if (fixture.humanSkills) {
      state.players[human.id].skillIds = [...fixture.humanSkills];
    }
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
    hasPlayerExpando: false,
    hasCardExpando: false,
    modelHasDom: false
  });
  expect(errors).toEqual([]);
});

test('扩展包选择只更新选中的真实数据包与素材映射', async ({ page }) => {
  await openStartScreen(page);
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
      implementation: 'partial',
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
