const { test, expect } = require('@playwright/test');

const CARD_ID = {
  '杀': 'standard:slash',
  '火杀': 'standard:fire-slash',
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
  '丈八蛇矛': 'standard:spear',
  '借刀杀人': 'standard:collateral',
  '过河拆桥': 'standard:dismantlement',
  '乐不思蜀': 'standard:indulgence',
  '闪电': 'standard:lightning',
  '八卦阵': 'standard:eight-diagram'
};

function capturePageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message || String(error)));
  return errors;
}

function rectanglesOverlap(first, second) {
  return first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top;
}

test('加载进度覆盖生成清单中的全部图片并等待音频目录', async ({ page }) => {
  const errors = capturePageErrors(page);
  await page.goto('/');
  await page.waitForFunction(() => window.sgsAssets?.snapshot().complete, null, {
    timeout: 20_000
  });
  const loading = await page.evaluate(() => ({
    snapshot: window.sgsAssets.snapshot(),
    display: getComputedStyle(document.querySelector('#data_load')).display,
    phase: document.querySelector('#data_load_phase').textContent,
    percentage: document.querySelector('#data_load_perc').textContent,
    detail: document.querySelector('#data_load_detail').textContent
  }));
  expect(loading.snapshot.totalImages).toBeGreaterThan(202);
  expect(loading.snapshot.total).toBe(loading.snapshot.totalImages + 2);
  expect(loading.snapshot.loaded).toBe(loading.snapshot.total);
  expect(loading.snapshot.failed).toBe(0);
  expect(loading.snapshot.failedUrls).toEqual([]);
  expect(loading.display).toBe('none');
  expect(loading.phase).toBe('资源加载完成');
  expect(loading.percentage).toBe('100%');
  expect(loading.detail).toBe(
    `${loading.snapshot.total} / ${loading.snapshot.total}`
  );
  expect(errors).toEqual([]);
});

test('单项图片失败会计入加载结果且不会卡死启动界面', async ({ page }) => {
  await page.route('**/img/expansion/shenhua/card/analeptic.png', (route) =>
    route.abort('failed')
  );
  await page.goto('/');
  await page.waitForFunction(() => window.sgsAssets?.snapshot().complete, null, {
    timeout: 20_000
  });
  const snapshot = await page.evaluate(() => window.sgsAssets.snapshot());
  expect(snapshot.failed).toBe(1);
  expect(snapshot.loaded + snapshot.failed).toBe(snapshot.total);
  expect(snapshot.failedUrls).toEqual([
    'img/expansion/shenhua/card/analeptic.png'
  ]);
  await expect(page.locator('#data_load')).toBeHidden();
  await expect(page.locator('#game_start')).toBeVisible();
});

async function openStartScreen(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.sgsAssets?.snapshot().complete, null, {
    timeout: 20_000
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
      const draw = state.zones['zone:draw'];
      while (hand.length < definitions.length && draw.length > 0) {
        hand.push(draw.shift());
      }
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

    if (fixture.humanSkills) {
      human.hero.skills = fixture.humanSkills.map(
        (skillId) => skillId.split(':').at(-1)
      );
      window.sgs.interface.Render_Skill_Tags(human);
    }

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
      : !!document.querySelector(
          '#choose_box, .action_skill_material_selectable'
        );
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
    jquery: typeof window.jQuery,
    dollar: typeof window.$,
    identityMapping: window.sgs.interface.bout.player.map((player) => ({
      ui: player.identity,
      core: window.sgs.interface.bout.state().players[player.id].identity
    })),
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
    jquery: 'undefined',
    dollar: 'undefined',
    identityMapping: expect.arrayContaining([
      { ui: 0, core: 'lord' },
      { ui: 1, core: 'loyalist' },
      { ui: 2, core: 'renegade' },
      { ui: 3, core: 'rebel' }
    ]),
    nonLordHasLordSkill: false,
    hasPlayerExpando: false,
    hasCardExpando: false,
    modelHasDom: false
  });
  expect(errors).toEqual([]);
});

test('本地玩家固定 DOM 契约完整且进度条引用有效', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  const contract = await page.evaluate(async () => {
    const requiredIds = [
      'player',
      'cards',
      'attack',
      'defend',
      'attack_horse',
      'defend_horse',
      'ok_cancel_abandon',
      'player_identity',
      'player_head',
      'player_head_img',
      'player_name_back',
      'player_name',
      'player_country',
      'player_blods',
      'player_blod_0',
      'player_blod_1',
      'player_progress_bar',
      'player_progress'
    ];
    await window.sgs.animation.Time_Last(false, 0.01);
    const playerName = document.querySelector('#player_name');
    return {
      missing: requiredIds.filter((id) => !document.getElementById(id)),
      duplicates: requiredIds.filter((id) =>
        document.querySelectorAll(`#${id}`).length !== 1
      ),
      playerNameParent: playerName.parentElement.id,
      playerName: playerName.textContent,
      progressClass: document.querySelector('#player_progress').className
    };
  });
  expect(contract).toEqual({
    missing: [],
    duplicates: [],
    playerNameParent: 'player_head',
    playerName: expect.stringMatching(/^_.+_$/),
    progressClass: 'player_progress'
  });
  expect(errors).toEqual([]);
});

test('本地英雄头像只在进入游戏场景后显示', async ({ page }) => {
  const errors = capturePageErrors(page);
  await openStartScreen(page);
  const playerHead = page.locator('#player_head');
  await expect(playerHead).toBeHidden();
  await expect(playerHead).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#main')).not.toHaveClass(/game_scene_active/);

  await page.locator('#game_start').click();
  await expect(page.locator('#choose_box')).toBeVisible();
  await expect(playerHead).toBeHidden();

  await page.locator('.choose_role_card').first().click();
  await page.waitForFunction(() =>
    window.sgs.interface.bout?.engine === 'core' &&
    document.querySelectorAll('.player_card').length >= 4
  );
  await expect(page.locator('#main')).toHaveClass(/game_scene_active/);
  await expect(playerHead).toBeVisible();
  await expect(playerHead).toHaveAttribute('aria-hidden', 'false');
  expect(errors).toEqual([]);
});

test('原创音频目录、设置和 Core 事件音效序列接入浏览器', async ({ page }) => {
  const catalogResponse = await page.request.get('/audio/catalog.json');
  expect(catalogResponse.ok()).toBe(true);
  const catalog = await catalogResponse.json();
  expect(Object.keys(catalog.sfx)).toHaveLength(27);
  expect(Object.keys(catalog.music)).toHaveLength(15);
  expect(catalog.encoding).toMatch(/^ogg\//);
  expect((await page.request.get(catalog.sfx['card.slash'].url)).ok())
    .toBe(true);
  expect((await page.request.get(catalog.music['music.identity'].url)).ok())
    .toBe(true);
  const heroCatalogResponse = await page.request.get(
    '/audio/heroes/catalog.json'
  );
  expect(heroCatalogResponse.ok()).toBe(true);
  const heroCatalog = await heroCatalogResponse.json();
  expect(Object.keys(heroCatalog.heroes)).toHaveLength(49);
  expect(Object.keys(heroCatalog.music)).toHaveLength(49);
  expect((await page.request.get(
    heroCatalog.heroes['standard:hero:关羽'].cues.signature.assets[1].url
  )).ok()).toBe(true);

  await startCoreGame(page);
  await expect(page.locator('#music_toggle')).toBeVisible();
  await expect(page.locator('#sfx_toggle')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    window.sgsAudio.snapshot().catalogReady
  )).toBe(true);
  await expect.poll(() => page.evaluate(() =>
    window.sgsAudio.snapshot().desiredMusicId
  )).toMatch(/^music\.hero\./);

  await page.locator('#sfx_toggle').click();
  await expect(page.locator('#sfx_toggle')).toHaveAttribute(
    'aria-pressed',
    'false'
  );
  expect(await page.evaluate(() =>
    JSON.parse(localStorage.getItem('sgs.audio-settings.v1')).sfxEnabled
  )).toBe(false);
  await page.locator('#sfx_toggle').click();

  await page.evaluate(() => {
    window.sgsAudio.clearCueHistory();
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const state = bout.state();
    state.players[human.id].heroDefinitionId = 'standard:hero:关羽';
    bout.restoreSnapshot(JSON.stringify(state));
    const action = bout.legalActions().find((candidate) =>
      candidate.type === 'use-card' &&
      bout.state().cards[candidate.cardId].definitionId === 'standard:slash'
    );
    if (!action) throw new Error('expected a legal slash action');
    bout.dispatchCommand(action);
  });
  await expect.poll(() => page.evaluate(() =>
    window.sgsAudio.snapshot().cueHistory.map((cue) => cue.id)
  )).toContain('card.slash');
  await expect.poll(() => page.evaluate(() =>
    window.sgsAudio.snapshot().heroCueHistory.at(-1)
  )).toMatchObject({
    kind: 'card',
    heroDefinitionId: 'standard:hero:关羽',
    cardDefinitionId: 'standard:slash',
    line: '青龙所向，邪佞皆斩。'
  });
});

test('音效网络失败降级为警告且不触发全局故障', async ({ page }) => {
  const errors = capturePageErrors(page);
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.route('**/audio/sfx/card-savage-assault.ogg', (route) =>
    route.abort('failed')
  );
  await page.addInitScript(() => {
    window.__sgsUnhandledRejections = [];
    window.addEventListener('unhandledrejection', (event) => {
      window.__sgsUnhandledRejections.push(
        event.reason?.message ?? String(event.reason)
      );
    });
  });
  await startCoreGame(page);
  await page.evaluate(async () => {
    localStorage.removeItem('sgs.last-failure-jsonl');
    await window.sgsAudio.unlock();
    window.sgsAudio.playSfx('card.savage-assault');
  });

  await expect.poll(() => warnings).toContainEqual(
    expect.stringContaining('card.savage-assault')
  );
  expect(warnings.join('\n')).toContain(
    '/audio/sfx/card-savage-assault.ogg'
  );
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => ({
    unhandled: window.__sgsUnhandledRejections,
    failure: localStorage.getItem('sgs.last-failure-jsonl')
  }))).toEqual({
    unhandled: [],
    failure: null
  });
});

test('页面隐藏或失焦时停止全部声音，恢复后遵守用户音频开关', async ({ page }) => {
  await startCoreGame(page);
  await page.evaluate(() => window.sgsAudio.unlock());
  await expect.poll(() => page.evaluate(() => {
    const audio = window.sgsAudio.snapshot();
    return {
      pageActive: audio.pageActive,
      context: audio.audioContextState,
      musicPaused: audio.musicPaused
    };
  })).toEqual({
    pageActive: true,
    context: 'running',
    musicPaused: false
  });

  await page.evaluate(() => {
    window.sgsAudio.playSfx('combat.death');
  });
  await expect.poll(() => page.evaluate(() =>
    window.sgsAudio.snapshot().activeSfxCount
  )).toBeGreaterThan(0);
  const desiredMusicId = await page.evaluate(() =>
    window.sgsAudio.snapshot().desiredMusicId
  );

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect.poll(() => page.evaluate(() => {
    const audio = window.sgsAudio.snapshot();
    return {
      pageActive: audio.pageActive,
      focused: audio.windowFocused,
      musicPaused: audio.musicPaused,
      activeSfxCount: audio.activeSfxCount,
      context: audio.audioContextState
    };
  })).toEqual({
    pageActive: false,
    focused: false,
    musicPaused: true,
    activeSfxCount: 0,
    context: 'suspended'
  });

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => page.evaluate(() => {
    const audio = window.sgsAudio.snapshot();
    return {
      pageActive: audio.pageActive,
      desiredMusicId: audio.desiredMusicId,
      musicPaused: audio.musicPaused,
      context: audio.audioContextState
    };
  })).toEqual({
    pageActive: true,
    desiredMusicId,
    musicPaused: false,
    context: 'running'
  });

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden'
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => {
    const audio = window.sgsAudio.snapshot();
    return {
      pageActive: audio.pageActive,
      visible: audio.pageVisible,
      musicPaused: audio.musicPaused
    };
  })).toEqual({
    pageActive: false,
    visible: false,
    musicPaused: true
  });

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible'
    });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(() => page.evaluate(() => {
    const audio = window.sgsAudio.snapshot();
    return {
      pageActive: audio.pageActive,
      musicPaused: audio.musicPaused
    };
  })).toEqual({
    pageActive: true,
    musicPaused: false
  });

  await page.evaluate(() => {
    window.sgsAudio.setMusicEnabled(false);
    window.sgsAudio.setSfxEnabled(false);
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
    window.sgsAudio.playSfx('combat.death');
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => {
    const audio = window.sgsAudio.snapshot();
    return {
      settings: audio.settings,
      musicPaused: audio.musicPaused,
      activeSfxCount: audio.activeSfxCount
    };
  })).toMatchObject({
    settings: {
      musicEnabled: false,
      sfxEnabled: false
    },
    musicPaused: true,
    activeSfxCount: 0
  });
});

test('牌局状态音乐识别危急与逆转并采用同相位交叉淡化', async ({ page }) => {
  await startCoreGame(page);
  const openingTrackId = await page.evaluate(() =>
    window.sgsAudio.snapshot().desiredMusicId
  );
  expect(openingTrackId).toMatch(/^music\.hero\./);
  await expect.poll(() => page.evaluate(() =>
    window.sgsAdaptiveMusic.snapshot().currentMood
  )).toBe('opening');
  await expect.poll(() => page.evaluate(() => {
    const audio = window.sgsAudio.snapshot();
    return {
      currentMusicId: audio.currentMusicId,
      transitioning: audio.transitioning
    };
  })).toEqual({
    currentMusicId: openingTrackId,
    transitioning: false
  });
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const state = bout.state();
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    state.turnNumber = 2;
    state.players[human.id].hp = 1;
    window.sgsAdaptiveMusic.update(state);
  });
  await expect.poll(() => page.evaluate(() =>
    window.sgsAdaptiveMusic.snapshot().currentMood
  )).toBe('critical');
  await expect.poll(() => page.evaluate(() =>
    window.sgsAudio.snapshot().musicHistory.at(-1)
  )).toMatchObject({
    fromId: openingTrackId,
    toId: 'music.critical',
    crossfadeMs: 1800,
    phaseAligned: true
  });

  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const state = bout.state();
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    state.players[human.id].hp = 3;
    const hand = state.zones[`zone:hand:${human.id}`];
    while (hand.length < 8) hand.push(`music-test-card-${hand.length}`);
    window.sgsAdaptiveMusic.update(state);
  });
  await expect.poll(() => page.evaluate(() =>
    window.sgsAdaptiveMusic.snapshot().currentMood
  )).toBe('comeback');
  await expect.poll(() => page.evaluate(() =>
    window.sgsAudio.snapshot().musicHistory.at(-1)
  )).toMatchObject({
    fromId: 'music.critical',
    toId: 'music.comeback',
    crossfadeMs: 1800,
    phaseAligned: true
  });
  await expect.poll(() => page.evaluate(() => {
    const audio = window.sgsAudio.snapshot();
    return {
      currentMusicId: audio.currentMusicId,
      transitioning: audio.transitioning
    };
  })).toEqual({
    currentMusicId: 'music.comeback',
    transitioning: false
  });
});

test('音乐淡入首帧早于起始时间时音量仍保持合法', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await expect.poll(() => page.evaluate(() =>
    window.sgsAudio.snapshot().transitioning
  )).toBe(false);

  await page.evaluate(() => {
    const nativeRequestAnimationFrame =
      window.requestAnimationFrame.bind(window);
    let staleFrame = true;
    window.requestAnimationFrame = (callback) =>
      nativeRequestAnimationFrame(() => {
        callback(staleFrame
          ? performance.now() - 100
          : performance.now() + 5_000);
        staleFrame = false;
      });

    const bout = window.sgs.interface.bout;
    const state = bout.state();
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    state.turnNumber = 2;
    state.players[human.id].hp = 1;
    window.sgsAdaptiveMusic.update(state);
  });

  await expect.poll(() => page.evaluate(() => ({
    mood: window.sgsAdaptiveMusic.snapshot().currentMood,
    transitioning: window.sgsAudio.snapshot().transitioning
  }))).toEqual({
    mood: 'critical',
    transitioning: false
  });
  expect(errors).toEqual([]);
});

test('未捕获的浏览器异常自动下载带现场状态的 JSONL', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['无中生有', '杀', '桃', '无懈可击'],
    aiHand: ['杀', '杀', '杀', '杀']
  });
  await page.evaluate(() => window.localStorage.removeItem(
    'sgs.last-failure-jsonl'
  ));
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const exNihilo = bout.legalActions().find((action) =>
      action.type === 'use-card' &&
      bout.state().cards[action.cardId].definitionId ===
        'standard:ex-nihilo'
    );
    bout.dispatchCommand(exNihilo);
    for (let guard = 0; guard < 16; guard += 1) {
      if (!bout.state().pendingDecision) break;
      bout.dispatchCommand(
        bout.legalActions().find((action) => action.type === 'pass')
      );
    }
  });
  const downloadPromise = page.waitForEvent('download');
  await page.evaluate(() => {
    window.setTimeout(() => {
      const bout = window.sgs.interface.bout;
      const human = window.sgs.view.playerFor(
        document.querySelector('#player')
      );
      const slash = human.card.find((card) => card.name === '杀');
      bout.choice_card(slash, []);
    }, 0);
  });
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^sgs-failure-.*\.jsonl$/);
  await expect.poll(() => page.evaluate(() =>
    window.sgsDebug.lastFailure()
  )).not.toBeNull();
  const report = await page.evaluate(() => {
    const jsonl = window.sgsDebug.lastFailure();
    const lines = jsonl.trim().split(/\r?\n/).map(JSON.parse);
    const failure = lines.at(-1);
    return {
      kinds: lines.map((line) => line.kind),
      commandCount: lines.filter((line) => line.kind === 'command').length,
      message: failure.message,
      context: failure.diagnostics.context,
      hasState: !!failure.diagnostics.state,
      legalActionCount: failure.diagnostics.legalActions.length,
      hasStack: failure.diagnostics.stack.includes('choice_card')
    };
  });
  expect(report).toMatchObject({
    message: 'selected card targets are not legal',
    context: {
      type: 'error',
      operation: 'choice_card',
      selectedTargetIds: []
    },
    hasState: true,
    hasStack: true
  });
  expect(report.kinds[0]).toBe('meta');
  expect(report.kinds.at(-1)).toBe('failure');
  expect(report.commandCount).toBeGreaterThan(0);
  expect(report.legalActionCount).toBeGreaterThan(0);
  await expect(page.locator('#debug_export_notice')).toContainText(
    '调试 JSONL 已自动导出'
  );
});

test('借刀杀人的有序目标只能按合法前缀选择且移走武器后清空 UI', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['借刀杀人', '闪', '桃', '无懈可击'],
    aiHand: ['杀', '杀', '杀', '杀']
  });
  const fixture = await page.evaluate(async () => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const state = bout.state();
    const holders = bout.player.filter((player) => player !== human).slice(0, 2);
    for (const holder of holders) {
      const handZoneId = `zone:hand:${holder.id}`;
      const equipmentZoneId = `zone:equipment:${holder.id}`;
      const weaponId = state.zones[handZoneId].shift();
      state.cards[weaponId].definitionId = 'standard:crossbow';
      state.zones[equipmentZoneId].push(weaponId);
    }
    bout.restoreSnapshot(JSON.stringify(state));
    for (const holder of holders) {
      await bout.notify('equip_on', holder, holder.equip[0]);
    }
    human.choice_card();
    return {
      humanId: human.id,
      holderIds: holders.map((holder) => holder.id)
    };
  });
  await clickHandCard(page, '借刀杀人');
  const firstCandidates = await page.locator('.role.target_available')
    .evaluateAll((elements) => elements.map(
      (element) => window.sgs.view.playerFor(element).id
    ));
  expect(firstCandidates.sort()).toEqual([...fixture.holderIds].sort());

  await page.locator('.role.target_available').first().click();
  const selection = await page.evaluate(() => {
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    return {
      selectedIds: human.selected_targets.map((player) => player.id),
      nextIds: [...document.querySelectorAll('.role.target_available')]
        .map((element) => window.sgs.view.playerFor(element).id),
      okVisible: getComputedStyle(document.querySelector('#ok')).display !==
        'none'
    };
  });
  expect(selection.selectedIds).toHaveLength(1);
  expect(selection.nextIds.length).toBeGreaterThan(0);
  expect(selection.okVisible).toBe(false);

  await page.locator('.role.target_available').first().click();
  await expect(page.locator('#ok')).toBeVisible();
  const selectedIds = await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player'))
      .selected_targets.map((player) => player.id)
  );
  await page.locator('#ok').click();
  await passAllDecisions(page);
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().pendingDecision
  )).toBeNull();
  await expect.poll(() => page.evaluate((holderId) => {
    const bout = window.sgs.interface.bout;
    const holder = bout.player.find((player) => player.id === holderId);
    return window.sgs.view.playerElement(holder).querySelector('.attack')
      .getAttribute('data-card-name');
  }, selectedIds[0])).toBeNull();

  const result = await page.evaluate(({ selectedIds }) => {
    const bout = window.sgs.interface.bout;
    const state = bout.state();
    const human = bout.player.find((player) =>
      player.id === state.eventLog.find(
        (event) => event.type === 'CardUsed' &&
          state.cards[event.cardId].definitionId === 'standard:collateral'
      ).playerId
    );
    const holder = bout.player.find((player) => player.id === selectedIds[0]);
    const holderElement = window.sgs.view.playerElement(holder);
    return {
      usedTargets: state.eventLog.find(
        (event) => event.type === 'CardUsed' &&
          state.cards[event.cardId].definitionId === 'standard:collateral'
      ).targetIds,
      holderEquipment: state.zones[`zone:equipment:${holder.id}`],
      humanHasCrossbow: state.zones[`zone:hand:${human.id}`].some(
        (cardId) => state.cards[cardId].definitionId === 'standard:crossbow'
      ),
      holderUiWeapon: holderElement.querySelector('.attack')
        .getAttribute('data-card-name')
    };
  }, { selectedIds });
  expect(result).toEqual({
    usedTargets: selectedIds,
    holderEquipment: [],
    humanHasCrossbow: true,
    holderUiWeapon: null
  });
  expect(errors).toEqual([]);
});

test('开始界面提供标准身份场与剧情模式', async ({ page }) => {
  await openStartScreen(page);
  await expect(page.locator('#home_scene')).toHaveAttribute(
    'data-faction',
    'identity'
  );
  await expect(page.locator('#home_scene')).toContainText('三国杀');
  await expect(page.locator('#home_scene_caption')).toContainText(
    '标准身份场'
  );
  await expect.poll(() => page.locator('#home_scene').evaluate((scene) =>
    scene.style.getPropertyValue('--home-background')
  )).toContain('background-identity.jpg');
  await expect(page.locator('.mode_card')).toHaveCount(2);
  await expect(page.locator('.mode_card').nth(0)).toContainText('标准身份场');
  await expect(page.locator('.mode_card').nth(1)).toContainText('剧情模式');
  await expect(page.locator('input[name="game_mode"]:checked'))
    .toHaveValue('identity');
  await expect(page.locator('#identity_player_count')).toHaveValue('4');
  await expect(page.locator('#identity_player_count_value')).toHaveText('4 人');
  await expect(page.locator('#ai_level, .ai_level_option')).toHaveCount(0);
  await expect(page.locator('#start_options')).not.toContainText('AI 难度');
  await expect(page.locator('#identity_mix_preview'))
    .toContainText('主公 1 · 忠臣 1 · 反贼 1 · 内奸 1');
  const backgroundsLoaded = await page.evaluate(async () => {
    const paths = ['identity', 'story-wei', 'story-shu', 'story-wu', 'story-qun']
      .map((name) => `img/system/home/background-${name}.jpg`);
    return Promise.all(paths.map((src) => new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(
        image.naturalWidth === 1672 && image.naturalHeight === 941
      );
      image.onerror = () => resolve(false);
      image.src = src;
    })));
  });
  expect(backgroundsLoaded).toEqual([true, true, true, true, true]);
});

test('开始界面只保留有效的人数设置', async ({ page }) => {
  await openStartScreen(page);
  await page.getByRole('button', { name: '增加一名玩家' }).click();
  await expect(page.locator('#identity_player_count')).toHaveValue('5');
  await expect(page.locator('#identity_player_count_value')).toHaveText('5 人');
  await expect(page.locator('#identity_mix_preview'))
    .toContainText('主公 1 · 忠臣 1 · 反贼 2 · 内奸 1');

  await expect(page.locator('#ai_level, .ai_level_option')).toHaveCount(0);
});

test('人数滑杆支持真实指针拖动', async ({ page }) => {
  await openStartScreen(page);
  const slider = page.locator('#identity_player_count');
  const box = await slider.boundingBox();
  if (!box) throw new Error('player count slider has no bounding box');
  await page.mouse.move(box.x + 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2, {
    steps: 8
  });
  await page.mouse.up();
  await expect(slider).toHaveValue('20');
  await expect(page.locator('#identity_player_count_value')).toHaveText('20 人');
  await expect(page.locator('#identity_mix_preview'))
    .toContainText('主公 1 · 忠臣 7 · 反贼 9 · 内奸 3');
});

test('二十人身份场生成完整弧形对手座位', async ({ page }) => {
  const errors = capturePageErrors(page);
  await openStartScreen(page);
  await page.evaluate(() => {
    window.sgs.func.set_random_seed(20260731);
    window.sgs.motion.setInstant(true);
  });
  await page.locator('#identity_player_count').fill('20');
  await expect(page.locator('#identity_mix_preview'))
    .toContainText('主公 1 · 忠臣 7 · 反贼 9 · 内奸 3');
  await page.locator('#game_start').click();
  await expect(page.locator('#choose_box')).toBeVisible();
  await page.locator('.choose_role_card').first().click();
  await page.waitForFunction(() =>
    window.sgs.interface.bout.engine === 'core' &&
    window.sgs.interface.bout.player.length === 20
  );
  const layout = await page.evaluate(() => {
    window.sgs.interface.bout.pause();
    const plainRect = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom
      };
    };
    return {
      motionSpeed: window.sgs.motion.getSpeed(),
      motionSpeedAttribute: document.documentElement.getAttribute(
        'data-sgs-motion-speed'
      ),
      seats: [...document.querySelectorAll('#opponent_seats > .role')]
        .map((seat) => ({
          id: seat.id,
          index: seat.getAttribute('data-seat-index'),
          angle: Number(seat.getAttribute('data-seat-angle')),
          scale: Number(seat.getAttribute('data-seat-scale')),
          obstacles: seat.getAttribute('data-layout-obstacles'),
          left: parseInt(seat.style.left, 10),
          top: parseInt(seat.style.top, 10),
          rect: plainRect(seat)
        })),
      fixtures: [
        plainRect(document.querySelector('#cards_last')),
        plainRect(document.querySelector('#discard_pile_box'))
      ]
    };
  });
  expect(layout.motionSpeed).toBe(3);
  expect(layout.motionSpeedAttribute).toBe('3.00');
  expect(layout.seats).toHaveLength(19);
  expect(layout.seats.map((seat) => seat.id)).toEqual(
    Array.from({ length: 19 }, (_, index) => `role${index + 1}`)
  );
  expect(layout.seats.every((seat, index) =>
    seat.index === String(index + 1) &&
    seat.scale === 0.42 &&
    seat.obstacles === 'cards_last,discard_pile_box' &&
    seat.left >= -10 &&
    seat.left <= 880 &&
    seat.top >= 30 &&
    seat.top <= 390 &&
    (index === 0 || seat.angle > layout.seats[index - 1].angle) &&
    layout.fixtures.every((fixture) =>
      !rectanglesOverlap(seat.rect, fixture)
    )
  )).toBe(true);
  expect(errors).toEqual([]);
});

test('四人身份场座位为摸牌堆和弃牌堆预留空间', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  const geometry = await page.evaluate(() => {
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left,
        right: value.right,
        top: value.top,
        bottom: value.bottom
      };
    };
    return {
      motionSpeed: window.sgs.motion.getSpeed(),
      seats: [...document.querySelectorAll('#opponent_seats > .role')]
        .map((seat) => ({
          angle: Number(seat.getAttribute('data-seat-angle')),
          rect: rect(seat)
        })),
      fixtures: [
        rect(document.querySelector('#cards_last')),
        rect(document.querySelector('#discard_pile_box'))
      ]
    };
  });
  expect(geometry.motionSpeed).toBe(1);
  expect(geometry.seats).toHaveLength(3);
  expect(geometry.seats.every((seat) =>
    geometry.fixtures.every((fixture) =>
      !rectanglesOverlap(seat.rect, fixture)
    )
  )).toBe(true);
  const angles = geometry.seats.map((seat) => seat.angle);
  expect(angles[1]).toBe(270);
  expect(angles[0] + angles[2]).toBeCloseTo(540, 5);
  expect(errors).toEqual([]);
});

test('剧情模式展示阵营年代线、锁定场景并进入相关人物战局', async ({ page }) => {
  const errors = capturePageErrors(page);
  await openStartScreen(page);
  await page.evaluate(() => {
    window.sgs.func.set_random_seed(20260729);
    window.sgs.motion.setInstant(true);
  });
  await page.locator('input[value="story"]').check();
  await expect(page.locator('#home_scene')).toHaveAttribute(
    'data-faction',
    'shu'
  );
  await expect.poll(() => page.locator('#home_scene').evaluate((scene) =>
    scene.style.getPropertyValue('--home-background')
  )).toContain('background-story-shu.jpg');
  await page.locator('#game_start').click();
  await expect(page.locator('#story_intro')).toBeVisible();
  await expect(page.locator('#home_scene')).toHaveAttribute(
    'data-scenario',
    'shu-184-taoyuan'
  );
  await expect(page.locator('.story_campaign')).toHaveCount(4);
  await page.locator('.story_campaign[data-faction="wu"]').click();
  await expect(page.locator('#home_scene')).toHaveAttribute(
    'data-faction',
    'wu'
  );
  await expect(page.locator('#home_scene')).toHaveAttribute(
    'data-scenario',
    'wu-190-sishuiguan'
  );
  await expect.poll(() => page.locator('#home_scene').evaluate((scene) =>
    scene.style.getPropertyValue('--home-background')
  )).toContain('background-story-wu.jpg');
  await page.locator('.story_campaign[data-faction="shu"]').click();
  await expect(page.locator('.story_timeline button')).toHaveCount(3);
  await expect(page.locator('.story_timeline button').nth(1)).toBeDisabled();
  await expect(page.locator('#story_intro')).toContainText('桃园举义');
  await expect(page.locator('#story_intro')).toContainText('涿郡');
  await expect(page.locator('#story_intro')).toContainText('4 人 · 初阵');
  await expect(page.locator('#story_intro')).toContainText(
    '我方：刘备（玩家）、关羽、张飞'
  );
  await expect(page.locator('#story_intro')).toContainText('敌方：张角');
  await expect(page.locator('#story_intro')).toContainText('胜利解锁：关羽、张飞');
  await page.locator('#story_continue').click();
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(page.locator('#story_hud')).toBeVisible();
  await expect(page.locator('#story_hud')).toContainText('桃园举义');
  await expect(page.locator('#story_event_banner')).toBeVisible();
  await expect(page.locator('#story_event_banner')).toContainText('桃园誓言');
  await expect(page.locator('#game_toolbar')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    window.sgsAudio.snapshot().desiredMusicId
  )).toBe('music.hero.standard:hero:刘备');
  const scenarioState = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    bout.pause();
    return {
      heroes: bout.state().turnOrder.map((playerId) =>
        bout.state().players[playerId].heroDefinitionId
      ),
      drawNames: bout.state().zones['zone:draw'].map((cardId) => {
        const card = bout.state().cards[cardId];
        return card.definitionId;
      })
    };
  });
  expect(scenarioState.heroes).toEqual([
    'standard:hero:刘备',
    'standard:hero:关羽',
    'standard:hero:张飞',
    'wind:hero:张角'
  ]);
  expect(scenarioState.drawNames.length).toBeGreaterThan(0);
  await page.locator('#save_game').click();
  const savedCampaign = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('sgs.saved-match.v1'));
    return saved.campaign;
  });
  expect(savedCampaign).toMatchObject({
    campaignId: 'shu',
    scenarioId: 'shu-184-taoyuan',
    currentScenarioId: 'shu-184-taoyuan',
    unlockedHeroDefinitionIds: ['standard:hero:刘备']
  });
  expect(errors).toEqual([]);
});

test('剧情胜利进度持久化后解锁下一年代事件与新武将', async ({ page }) => {
  await openStartScreen(page);
  await page.evaluate(() => {
    const initial = window.sgsCore.createCampaignProgress('shu', 10);
    const completed = window.sgsCore.completeCampaignScenario(
      initial,
      'shu-184-taoyuan',
      20
    );
    localStorage.setItem(
      'sgs.story-progress.v1.shu',
      JSON.stringify(completed)
    );
  });
  await page.reload();
  await page.locator('input[value="story"]').check();
  await page.locator('#game_start').click();
  await expect(page.locator('.story_timeline button').nth(1)).toBeEnabled();
  await expect(page.locator('.story_timeline button').nth(1))
    .toContainText('虎牢扬名');
  await expect(page.locator('.story_timeline button').nth(1))
    .toHaveClass(/selected/);
  await expect(page.locator('#story_intro')).toContainText('6 人 · 鏖战');
  await expect(page.locator('#story_intro')).toContainText(
    '我方：刘备（玩家）、关羽、张飞'
  );
  await expect(page.locator('#story_intro')).toContainText(
    '敌方：董卓、吕布、贾诩'
  );
  await page.locator('#story_continue').click();
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(page.locator('#game_toolbar')).toBeVisible();
});

test('群雄传张角发牌后拖动手牌使用真实卡牌目标而不是委托 document', async ({ page }) => {
  const errors = capturePageErrors(page);
  await openStartScreen(page);
  await page.evaluate(() => {
    window.sgs.func.set_random_seed(2876737188);
    window.sgs.motion.setInstant(true);
  });
  await page.locator('input[value="story"]').check();
  await page.locator('#game_start').click();
  await page.getByRole('button', { name: /群雄传/ }).click();
  await expect(page.locator('#story_intro h2')).toHaveText('苍天已死');
  await page.locator('#story_continue').click();
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await page.waitForFunction(() =>
    document.querySelectorAll('#cards > .player_card').length >= 6
  );
  const dragState = await page.evaluate(async () => {
    const card = document.querySelector('#cards > .player_card');
    const rect = card.getBoundingClientRect();
    card.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: rect.left + 8,
      clientY: rect.top + 8
    }));
    document.body.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      clientX: rect.left + 18,
      clientY: rect.top + 18
    }));
    const activeDuringMove = document.body.onDragDom;
    document.body.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      button: 0,
      clientX: rect.left + 18,
      clientY: rect.top + 18
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    window.sgs.interface.bout.pause();
    return {
      activeWasCard: activeDuringMove === card,
      activeAfterMouseUp: document.body.onDragDom,
      zIndex: card.style.zIndex,
      tagName: activeDuringMove && activeDuringMove.tagName
    };
  });
  expect(dragState).toEqual({
    activeWasCard: true,
    activeAfterMouseUp: undefined,
    zIndex: '10',
    tagName: 'DIV'
  });
  expect(errors).toEqual([]);
});

test('手牌按下后的轻微位移仍按点击选牌处理', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['闪', '桃', '无懈可击', '杀']
  });
  await page.locator('#cards > .player_card').evaluateAll((cards) => {
    const card = cards.find(
      (element) => window.sgs.view.cardFor(element)?.name === '杀'
    );
    if (!card) throw new Error('hand does not contain slash');
    card.setAttribute('data-drag-test', 'jitter');
  });
  const card = page.locator('[data-drag-test="jitter"]');
  const box = await card.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box.x + box.width / 2, box.y + 70);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 6, box.y + 74);
  await page.mouse.up();

  await expect.poll(() => card.evaluate((element) => ({
    selected: window.sgs.view.cardFor(element).selected,
    dragging: element.onDrag === true,
    activeDrag: document.body.onDragDom === element
  }))).toEqual({
    selected: true,
    dragging: false,
    activeDrag: false
  });
  await expect(page.locator('#card_play_drop_zone'))
    .not.toHaveClass(/card_drop_active/);
  expect(errors).toEqual([]);
});

test('把可用手牌拖到牌桌区域视为出牌', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await configureState(page, {
    humanHp: 3,
    humanHand: ['闪', '杀', '无懈可击', '桃']
  });
  const before = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    return {
      hp: bout.state().players[human.id].hp,
      hand: bout.state().zones[`zone:hand:${human.id}`].length,
      revision: bout.state().revision,
      cardId: human.card.find((card) => card.name === '桃').coreCardId
    };
  });
  await page.locator('#cards > .player_card').evaluateAll((cards) => {
    const card = cards.find(
      (element) => window.sgs.view.cardFor(element)?.name === '桃'
    );
    if (!card) throw new Error('hand does not contain peach');
    card.setAttribute('data-drag-test', 'play');
  });
  const card = page.locator('[data-drag-test="play"]');
  const cardBox = await card.boundingBox();
  const dropBox = await page.locator('#card_play_drop_zone').boundingBox();
  expect(cardBox).not.toBeNull();
  expect(dropBox).not.toBeNull();

  await page.mouse.move(cardBox.x + 30, cardBox.y + 70);
  await page.mouse.down();
  await page.mouse.move(cardBox.x + 45, cardBox.y + 55);
  await expect(page.locator('#card_play_drop_zone'))
    .toHaveClass(/card_drop_active/);
  await page.mouse.move(
    dropBox.x + dropBox.width / 2,
    dropBox.y + dropBox.height / 2,
    { steps: 4 }
  );
  await expect(page.locator('#card_play_drop_zone'))
    .toHaveClass(/card_drop_hover/);
  await page.mouse.up();

  await expect.poll(() => page.evaluate((before) => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    return {
      hp: bout.state().players[human.id].hp,
      hand: bout.state().zones[`zone:hand:${human.id}`].length,
      revision: bout.state().revision,
      usedInProcessing:
        bout.state().zones['zone:processing'].includes(before.cardId),
      usedInDiscard:
        bout.state().zones['zone:discard'].includes(before.cardId)
    };
  }, before)).toEqual({
    hp: 4,
    hand: before.hand - 1,
    revision: before.revision + 1,
    usedInProcessing: false,
    usedInDiscard: true
  });
  await expect(page.locator('#card_play_drop_zone'))
    .not.toHaveClass(/card_drop_active|card_drop_hover/);
  expect(errors).toEqual([]);
});

test('激将借用其他角色的响应牌时出牌动画不依赖本地手牌 DOM', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);

  const result = await page.evaluate(async () => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const responder = bout.player.find((player) => player !== human);
    const borrowedCard = responder.card[0];
    const hadLocalDom = !!window.sgs.view.cardElement(borrowedCard);

    await window.sgs.animation.Play_Card(
      responder,
      human,
      borrowedCard
    );
    await window.sgs.animation.Play_Card(
      human,
      responder,
      borrowedCard
    );

    return {
      hadLocalDom,
      tableCards: document.querySelectorAll('.table_card').length,
      borrowedCardBoundToHand:
        !!window.sgs.view.cardElement(borrowedCard)?.classList
          .contains('player_card')
    };
  });

  expect(result).toEqual({
    hadLocalDom: false,
    tableCards: 0,
    borrowedCardBoundToHand: false
  });
  expect(errors).toEqual([]);
});

test('保存的 Core 对局可以在刷新页面后继续', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await configureState(page, {
    humanEquipment: '朱雀羽扇'
  });
  const before = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    return {
      revision: bout.state().revision,
      currentPlayerId: bout.state().currentPlayerId,
      phase: bout.state().phase,
      humanId: human.id,
      hand: bout.state().zones[`zone:hand:${human.id}`],
      equipment: bout.state().zones[`zone:equipment:${human.id}`]
    };
  });
  await page.locator('#save_game').click();
  await expect(page.locator('#save_feedback')).toHaveText('已保存');
  const savedTiming = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('sgs.saved-match.v1'));
    return {
      activeDurationMs: saved.activeDurationMs,
      wallDurationMs: saved.savedAt - saved.startedAt
    };
  });
  expect(savedTiming.activeDurationMs).toBeGreaterThanOrEqual(0);
  expect(savedTiming.activeDurationMs)
    .toBeLessThan(savedTiming.wallDurationMs + 1_000);
  await page.reload();
  await page.waitForFunction(() => window.sgsAssets?.snapshot().complete, null, {
    timeout: 20_000
  });
  await page.evaluate(() => {
    window.sgs.motion.setInstant(true);
  });
  await expect(page.locator('#continue_game')).toBeVisible();
  await page.locator('#continue_game').click();
  await expect(page.locator('#game_toolbar')).toBeVisible();
  await expect(page.locator('#main')).toHaveClass(/game_scene_active/);
  await expect(page.locator('#player_head')).toBeVisible();
  await expect(page.locator('#player_head'))
    .toHaveAttribute('aria-hidden', 'false');
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout?.engine
  )).toBe('core');
  const after = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    bout.pause();
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    return {
      revision: bout.state().revision,
      currentPlayerId: bout.state().currentPlayerId,
      phase: bout.state().phase,
      humanId: human.id,
      hand: bout.state().zones[`zone:hand:${human.id}`],
      equipment: bout.state().zones[`zone:equipment:${human.id}`]
    };
  });
  expect(after).toEqual(before);
  await expect(page.locator('.player_card')).toHaveCount(before.hand.length);
  await expect(page.locator('#attack')).toHaveAttribute(
    'data-card-name',
    '朱雀羽扇'
  );
  await page.locator('#restart_game').click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => window.sgsAssets?.snapshot().complete, null, {
    timeout: 20_000
  });
  await expect(page.locator('#game_start')).toBeVisible();
  await expect(page.locator('#continue_game')).toBeHidden();
  expect(errors).toEqual([]);
});

test('载入 Core 存档后恢复阵亡英雄的黑屏状态', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  const deadPlayerId = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const deadPlayer = bout.player.find((player) => player !== human);
    const state = bout.state();
    state.players[deadPlayer.id].alive = false;
    state.players[deadPlayer.id].dying = false;
    state.players[deadPlayer.id].hp = 0;
    bout.restoreSnapshot(JSON.stringify(state));
    return deadPlayer.id;
  });
  await page.locator('#save_game').click();
  await expect(page.locator('#save_feedback')).toHaveText('已保存');

  await page.reload();
  await page.waitForFunction(() => window.sgsAssets?.snapshot().complete, null, {
    timeout: 20_000
  });
  await page.evaluate(() => {
    window.sgs.motion.setInstant(true);
  });
  await page.locator('#continue_game').click();
  await expect(page.locator('#game_toolbar')).toBeVisible();

  await expect.poll(() => page.evaluate((playerId) => {
    const bout = window.sgs.interface.bout;
    const player = bout.player.find((candidate) => candidate.id === playerId);
    const element = window.sgs.view.playerElement(player);
    const portrait = element.id === 'player'
      ? element.querySelector('#player_head_img')
      : element.querySelector('.head_img img');
    const cover = element.id === 'player'
      ? element.querySelector('#player_cover')
      : element.querySelector('.role_cover');
    const identity = element.id === 'player'
      ? element.querySelector('#player_identity img')
      : element.querySelector('.role_identity img');
    return {
      alive: bout.state().players[playerId].alive,
      filter: portrait.style.filter,
      coverDisplay: getComputedStyle(cover).display,
      deadClass: element.classList.contains('player_dead'),
      identityImage: identity.getAttribute('src')
    };
  }, deadPlayerId)).toMatchObject({
    alive: false,
    filter: 'grayscale(1)',
    coverDisplay: 'block',
    deadClass: true
  });
  const identityImage = await page.evaluate((playerId) => {
    const bout = window.sgs.interface.bout;
    const player = bout.player.find((candidate) => candidate.id === playerId);
    const element = window.sgs.view.playerElement(player);
    return element.querySelector('.role_identity img').getAttribute('src');
  }, deadPlayerId);
  expect(identityImage).toContain('dead');
  expect(errors).toEqual([]);
});

test('胜负完成后展示动画结算与逐人统计', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await page.evaluate(() => {
    window.sgsAudio.clearCueHistory();
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const state = bout.state();
    const lord = bout.player.find((player) => player.identity === 0);
    for (const player of bout.player) {
      const core = state.players[player.id];
      core.alive = player === human || player === lord;
      core.hp = core.alive ? core.hp : 0;
      core.dying = false;
    }
    state.players[lord.id].hp = 1;
    state.currentPlayerId = human.id;
    state.phase = 'action';
    state.pendingDecision = null;
    state.stack = [];
    state.triggerQueue = [];
    state.turnUsage[human.id] = {};
    const slashId = state.zones[`zone:hand:${human.id}`][0];
    state.cards[slashId].definitionId = 'standard:slash';
    bout.restoreSnapshot(JSON.stringify(state));
    const slash = bout.legalActions().find((action) =>
      action.type === 'use-card' &&
      action.cardId === slashId &&
      action.targetIds.length === 1 &&
      action.targetIds[0] === lord.id
    );
    if (!slash) throw new Error('fixture did not produce a legal slash');
    bout.dispatchCommand(slash, false);
    for (let guard = 0; guard < 32 && bout.state().phase !== 'finished'; guard += 1) {
      const pass = bout.legalActions().find((action) => action.type === 'pass');
      if (!pass) break;
      bout.dispatchCommand(pass, false);
    }
  });
  await expect(page.locator('#game_result')).toBeVisible();
  await expect(page.locator('.result_title')).toHaveText('胜利');
  await expect(page.locator('.result_overview')).toContainText('用时 0分');
  await expect(page.locator('.result_statistics tbody tr')).toHaveCount(4);
  await expect(page.locator('.local_result_row')).toContainText('1');
  await expect(page.locator('#play_again')).toBeVisible();
  await expect(page.locator('#result_main_menu')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    window.sgsAudio.snapshot().heroCueHistory.map((cue) => cue.kind)
  )).toEqual(expect.arrayContaining(['death', 'victory']));
  expect(errors).toEqual([]);
});

test('二十人结算统计可独立滚动且操作按钮保持可见', async ({ page }) => {
  const errors = capturePageErrors(page);
  await openStartScreen(page);
  await page.evaluate(() => {
    window.sgs.func.set_random_seed(20260802);
    window.sgs.motion.setInstant(true);
  });
  await page.locator('#identity_player_count').fill('20');
  await page.locator('#game_start').click();
  await page.locator('.choose_role_card').first().click();
  await page.waitForFunction(() =>
    window.sgs.interface.bout?.engine === 'core' &&
    window.sgs.interface.bout.player.length === 20
  );
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    bout.pause();
    const state = bout.state();
    const lord = bout.player.find((player) => player.identity === 0);
    const attacker = bout.player.find((player) => player !== lord);
    for (const player of bout.player) {
      const core = state.players[player.id];
      core.alive = player === attacker || player === lord;
      core.hp = player === lord ? 1 : Math.max(1, core.hp);
      core.dying = false;
      core.skillIds = [];
      state.zones[`zone:hand:${player.id}`].forEach((cardId) => {
        state.cards[cardId].definitionId = 'standard:jink';
      });
    }
    state.currentPlayerId = attacker.id;
    state.phase = 'action';
    state.pendingDecision = null;
    state.stack = [];
    state.triggerQueue = [];
    state.turnUsage[attacker.id] = {};
    const duelId = state.zones[`zone:hand:${attacker.id}`][0];
    state.cards[duelId].definitionId = 'standard:duel';
    bout.restoreSnapshot(JSON.stringify(state));
    const duel = bout.legalActions().find((action) =>
      action.type === 'use-card' &&
      action.cardId === duelId &&
      action.targetIds.length === 1 &&
      action.targetIds[0] === lord.id
    );
    if (!duel) throw new Error('fixture did not produce a legal duel');
    bout.dispatchCommand(duel, false);
    for (
      let guard = 0;
      guard < 128 && bout.state().phase !== 'finished';
      guard += 1
    ) {
      const pass = bout.legalActions().find((action) => action.type === 'pass');
      if (!pass) break;
      bout.dispatchCommand(pass, false);
    }
  });

  await expect(page.locator('#game_result')).toBeVisible();
  await expect(page.locator('.result_statistics tbody tr')).toHaveCount(20);
  const scroller = page.locator('.result_statistics_scroll');
  await expect(scroller).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#play_again')).toBeVisible();
  await expect(page.locator('#result_main_menu')).toBeVisible();
  const before = await scroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop
  }));
  expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);
  expect(before.scrollTop).toBe(0);
  const box = await scroller.boundingBox();
  if (!box) throw new Error('result statistics scroller has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const stickyHeader = await page.evaluate(() => {
    const scroll = document.querySelector('.result_statistics_scroll');
    const header = document.querySelector('.result_statistics th');
    const scrollRect = scroll.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    return Math.abs(headerRect.top - scrollRect.top) <= 2;
  });
  expect(stickyHeader).toBe(true);
  await expect(page.locator('#play_again')).toBeVisible();
  await expect(page.locator('#result_main_menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('玩家所属阵营落败时展示失败结算而不是胜利', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await page.evaluate(() => {
    window.sgsAudio.clearCueHistory();
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const state = bout.state();
    const lord = bout.player.find((player) => player.identity === 0);
    const loyalist = bout.player.find((player) => player.identity === 1);
    for (const player of bout.player) {
      const core = state.players[player.id];
      core.alive = player === human || player === lord || player === loyalist;
      core.hp = core.alive ? core.hp : 0;
      core.dying = false;
    }
    state.players[human.id].hp = 1;
    state.currentPlayerId = lord.id;
    state.phase = 'action';
    state.pendingDecision = null;
    state.stack = [];
    state.triggerQueue = [];
    state.turnUsage[lord.id] = {};
    const slashId = state.zones[`zone:hand:${lord.id}`][0];
    state.cards[slashId].definitionId = 'standard:slash';
    bout.restoreSnapshot(JSON.stringify(state));
    const slash = bout.legalActions().find((action) =>
      action.type === 'use-card' &&
      action.cardId === slashId &&
      action.targetIds.length === 1 &&
      action.targetIds[0] === human.id
    );
    if (!slash) throw new Error('fixture did not produce a legal slash');
    bout.dispatchCommand(slash, false);
    for (let guard = 0; guard < 32 && bout.state().phase !== 'finished'; guard += 1) {
      const pass = bout.legalActions().find((action) => action.type === 'pass');
      if (!pass) break;
      bout.dispatchCommand(pass, false);
    }
  });
  await expect(page.locator('#game_result')).toBeVisible();
  await expect(page.locator('#game_result')).toHaveClass(/defeat/);
  await expect(page.locator('.result_title')).toHaveText('失败');
  await expect(page.locator('.result_statistics tbody tr')).toHaveCount(4);
  await expect.poll(() => page.evaluate(() =>
    window.sgsAudio.snapshot().heroCueHistory.map((cue) => cue.kind)
  )).toContain('death');
  expect(await page.evaluate(() =>
    window.sgsAudio.snapshot().heroCueHistory.some(
      (cue) => cue.kind === 'victory'
    )
  )).toBe(false);
  expect(errors).toEqual([]);
});

test('武将技能和全部区域卡牌提供完整规则说明', async ({ page }) => {
  await startCoreGame(page);
  const fixture = await page.evaluate(() => {
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const card = human.card[0];
    return {
      heroName: human.hero.name,
      country: ({
        wei: '魏',
        shu: '蜀',
        wu: '吴',
        qun: '群',
        god: '神'
      })[human.hero.country] || human.hero.country,
      skillName: human.hero.skills[0],
      skillCount: human.hero.skills.length,
      skillDescription:
        window.sgs.SKILL_EXPLANATION_MAPPING[human.hero.skills[0]],
      cardName: card.name,
      cardCategory: window.sgs.CARD_EXPLANATION_MAPPING[card.name].category
    };
  });

  const localSkillTags = page.locator('#player_head > .skill_tags > .skill_tag');
  await expect(page.locator('#player_head > .country_badge'))
    .toHaveText(fixture.country);
  await expect(page.locator('#player_head > .country_badge'))
    .toHaveAttribute('aria-label', `${fixture.country}阵营`);
  await expect(localSkillTags).toHaveCount(fixture.skillCount);
  await expect(localSkillTags.first()).toHaveText(fixture.skillName);
  await expect(localSkillTags.first()).not.toHaveAttribute('title');
  await localSkillTags.first().hover();
  await expect(page.locator('#explanation')).toBeVisible({ timeout: 2_000 });
  await expect(page.locator('#explanation')).toHaveAttribute(
    'data-explanation-name',
    fixture.skillName
  );
  await expect(page.locator('#explanation')).toContainText(
    fixture.skillDescription
  );

  const opponentHero = page.locator('.role .head_img').first();
  const heroChoiceHasNativeTitle = await page.evaluate(() => {
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    window.sgs.interface.Show_CardChooseBox(
      '选择武将',
      [human.hero],
      '身份'
    );
    return document.querySelector('.choose_role_card').hasAttribute('title');
  });
  expect(heroChoiceHasNativeTitle).toBe(false);
  await page.evaluate(() => {
    document.querySelector('#choose_box')?.remove();
    document.querySelector('#choose_box_bgcover')?.remove();
  });
  await expect(opponentHero).not.toHaveAttribute('title');

  const skillLayout = await page.evaluate(() => {
    window.sgs.applyExpansionPack('fire');
    window.sgs.applyExpansionPack('forest');
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const opponent = bout.player.find((player) => player !== human);
    const originalHumanHero = human.hero;
    const originalOpponentHero = opponent.hero;
    const failures = [];
    const countryClasses = new Set();
    const inside = (tag, portrait) =>
      tag.left >= portrait.left - 1 &&
      tag.top >= portrait.top - 1 &&
      tag.right <= portrait.right + 1 &&
      tag.bottom <= portrait.bottom + 1;

    for (const hero of window.sgs.HERO) {
      human.hero = hero;
      opponent.hero = hero;
      window.sgs.interface.Render_Skill_Tags(human);
      window.sgs.interface.Render_Skill_Tags(opponent);
      window.sgs.interface.Render_Country_Badge(human);
      window.sgs.interface.Render_Country_Badge(opponent);
      const localTags = [
        ...document.querySelectorAll('#player_head > .skill_tags > .skill_tag')
      ];
      const opponentDom = window.sgs.view.playerElement(opponent);
      const opponentTags = [
        ...opponentDom.querySelectorAll(':scope > .skill_tags > .skill_tag')
      ];
      const localBadge =
        document.querySelector('#player_head > .country_badge');
      const opponentBadge =
        opponentDom.querySelector(':scope > .country_badge');
      countryClasses.add(
        [...localBadge.classList].find(
          (name) => name.startsWith('country_') && name !== 'country_badge'
        )
      );
      const localPortrait =
        document.querySelector('#player_head_img').getBoundingClientRect();
      const opponentPortrait =
        opponentDom.querySelector('.head_img img').getBoundingClientRect();
      if (
        localTags.length !== hero.skills.length ||
        opponentTags.length !== hero.skills.length ||
        localBadge.textContent !== hero.country ||
        opponentBadge.textContent !== hero.country ||
        !inside(localBadge.getBoundingClientRect(), localPortrait) ||
        !inside(opponentBadge.getBoundingClientRect(), opponentPortrait) ||
        localTags.some((tag) => !inside(tag.getBoundingClientRect(), localPortrait)) ||
        opponentTags.some(
          (tag) => !inside(tag.getBoundingClientRect(), opponentPortrait)
        )
      ) {
        failures.push(hero.name);
      }
    }
    human.hero = originalHumanHero;
    opponent.hero = originalOpponentHero;
    window.sgs.interface.Render_Skill_Tags(human);
    window.sgs.interface.Render_Skill_Tags(opponent);
    window.sgs.interface.Render_Country_Badge(human);
    window.sgs.interface.Render_Country_Badge(opponent);
    return {
      heroes: window.sgs.HERO.length,
      countryClasses: [...countryClasses].sort(),
      failures
    };
  });
  expect(skillLayout).toEqual({
    heroes: 49,
    countryClasses: [
      'country_qun',
      'country_shu',
      'country_wei',
      'country_wu'
    ],
    failures: []
  });

  await page.locator('#player_head').hover();
  await expect(page.locator('#explanation')).toBeVisible({ timeout: 2_000 });
  await expect(page.locator('#explanation')).toHaveAttribute(
    'data-explanation-kind',
    'skill'
  );
  await expect(page.locator('#explanation')).toContainText(fixture.heroName);
  await expect(page.locator('#explanation')).toContainText(fixture.skillName);
  await expect(page.locator('#explanation')).toContainText('技能说明');

  const firstCard = page.locator('#cards > .player_card').first();
  await expect(firstCard).not.toHaveAttribute('title');
  await firstCard.hover();
  await expect(page.locator('#explanation')).toHaveAttribute(
    'data-explanation-kind',
    'card',
    { timeout: 2_000 }
  );
  await expect(page.locator('#explanation')).toContainText(fixture.cardName);
  await expect(page.locator('#explanation')).toContainText(fixture.cardCategory);
  await expect(page.locator('#explanation')).toContainText('目标');
  await expect(page.locator('#explanation')).toContainText('效果');
  await expect(firstCard).toHaveAttribute('aria-describedby', 'explanation');

  await page.evaluate(() => {
    document.querySelector('#player_cover').style.display = 'block';
  });
  const cardBox = await firstCard.boundingBox();
  if (!cardBox) throw new Error('card has no visible bounding box');
  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await expect(page.locator('#explanation')).toHaveAttribute(
    'data-explanation-kind',
    'card',
    { timeout: 2_000 }
  );
  await expect(page.locator('#explanation')).toBeVisible();
  await page.evaluate(() => {
    document.querySelector('#player_cover').style.display = 'none';
  });

  const coverage = await page.evaluate(() => {
    const names = [...new Set(window.sgs.CARD.map((card) => card.name))];
    return {
      names: names.length,
      explained: names.filter(
        (name) => window.sgs.CARD_EXPLANATION_MAPPING[name]
      ).length
    };
  });
  expect(coverage).toEqual({ names: 43, explained: 43 });
});

test('杀与伤害效果显示在玩家卡牌上方', async ({ page }) => {
  await startCoreGame(page);
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const opponent = bout.player.find((player) => player !== human);
    window.sgs.motion.setInstant(false);
    window.__combatEffectAnimation = Promise.all([
      window.sgs.animation.Card_Flash(opponent, '杀'),
      window.sgs.animation.Get_Damage(human)
    ]).finally(() => window.sgs.motion.setInstant(true));
  });

  await expect(page.locator('.combat_effect.card_flash_effect').first())
    .toBeVisible();
  await expect(page.locator('.combat_effect.damage_effect')).toBeVisible();
  const layers = await page.locator('.combat_effect').evaluateAll((effects) =>
    effects.map((effect) => ({
      zIndex: Number(getComputedStyle(effect).zIndex),
      pointerEvents: getComputedStyle(effect).pointerEvents
    }))
  );
  expect(layers.length).toBeGreaterThanOrEqual(2);
  expect(layers.every(({ zIndex }) => zIndex === 180)).toBe(true);
  expect(layers.every(({ pointerEvents }) => pointerEvents === 'none')).toBe(true);
  await page.evaluate(() => window.__combatEffectAnimation);
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
  test.setTimeout(90_000);
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

    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const baseState = bout.state();
    const testedCardId = baseState.zones[`zone:hand:${human.id}`][0];
    const suitByIndex = ['diamond', 'heart', 'club', 'spade'];
    const coreIdentity = ['lord', 'loyalist', 'renegade', 'rebel'];
    const lordSkills = ['护驾', '激将', '救援', '黄天', '血裔', '颂威', '暴虐'];
    const projectionFailures = [];
    let projectionCases = 0;
    let enabledCases = 0;
    let explicitVirtualCases = 0;
    for (const hero of heroes) {
      const coreHero = coreHeroes.get(hero.name);
      for (const identity of [0, 1, 2, 3]) {
        for (const sourceCard of cards) {
          const coreCard = coreCards.get(sourceCard.name);
          const state = structuredClone(baseState);
          state.currentPlayerId = human.id;
          state.phase = 'action';
          state.pendingDecision = null;
          state.stack = [];
          state.triggerQueue = [];
          state.players[human.id].identity = coreIdentity[identity];
          state.players[human.id].heroDefinitionId = coreHero.id;
          state.players[human.id].maxHp = hero.life;
          state.players[human.id].hp = Math.max(1, hero.life - 1);
          state.players[human.id].skillIds = coreHero.skillIds.filter(
            (skillId) =>
              identity === 0 ||
              !lordSkills.some((name) => skillId.endsWith(`:${name}`))
          );
          Object.assign(state.cards[testedCardId], {
            definitionId: coreCard.id,
            suit: suitByIndex[sourceCard.color],
            rank: Number(sourceCard.digit) || 1
          });
          bout.restoreSnapshot(JSON.stringify(state));
          human.identity = identity;
          human.stage = 2;
          human.choice_card();
          const uiCard = human.card.find(
            (card) => card.coreCardId === testedCardId
          );
          const info = bout.select_card(uiCard, human);
          const directEnabled = bout.legalActions().some(
            (action) =>
              action.type === 'use-card' &&
              action.cardId === testedCardId
          );
          const virtualEnabled = bout.legalActions().some(
            (action) =>
              action.type === 'use-virtual-card' &&
              action.materialCardIds.includes(testedCardId)
          );
          const cardElement = [...document.querySelectorAll('.player_card')]
            .find((element) =>
              window.sgs.view.cardFor(element)?.coreCardId === testedCardId
            );
          const domEnabled =
            cardElement?.getAttribute('aria-disabled') === 'false';
          const adapterEnabled = info[1] >= 0;
          if (
            !uiCard ||
            !cardElement ||
            adapterEnabled !== directEnabled ||
            domEnabled !== directEnabled
          ) {
            projectionFailures.push(
              `${hero.name}/${identity}/${sourceCard.name}:` +
              `${directEnabled}/${adapterEnabled}/${domEnabled}`
            );
          }
          if (directEnabled) enabledCases += 1;
          if (virtualEnabled && !directEnabled) explicitVirtualCases += 1;
          projectionCases += 1;
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
      projectionCases,
      enabledCases,
      explicitVirtualCases,
      projectionFailures,
      missingAssets: assetChecks.filter((asset) => !asset.ok)
    };
  });

  expect(result).toEqual({
    cardCount: 43,
    heroCount: 49,
    identityCount: 4,
    cases: 8428,
    failures: [],
    projectionCases: 8428,
    enabledCases: expect.any(Number),
    explicitVirtualCases: expect.any(Number),
    projectionFailures: [],
    missingAssets: []
  });
  expect(result.enabledCases).toBeGreaterThan(0);
  expect(result.explicitVirtualCases).toBeGreaterThan(0);
});

test('首次进入默认勾选并实际加载全部扩展包', async ({ page }) => {
  await openStartScreen(page);
  await expect(page.locator('#expansion_pack_options')).toBeHidden();
  await expect(page.locator('#expansion_pack_options .home_rule_label'))
    .toHaveText('扩展包');
  expect(await page.locator('.expansion_pack:checked').evaluateAll((inputs) =>
    inputs.map((input) => input.value)
  )).toEqual(['wind', 'military', 'fire', 'forest']);

  await page.evaluate(() => window.sgs.motion.setInstant(true));
  await page.locator('#game_start').click();
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
    'wind',
    'fire',
    'forest'
  ]);
});

test('隐藏的扩展包配置仍只加载选中的真实数据包与素材映射', async ({ page }) => {
  await openStartScreen(page);
  await page.evaluate(() => window.sgs.motion.setInstant(true));
  await page.evaluate(() => {
    const enabled = new Set(['military', 'fire']);
    document.querySelectorAll('.expansion_pack').forEach((input) => {
      input.checked = enabled.has(input.value);
    });
  });
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

test('取消选择火杀后彻底退出目标选择状态', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, { humanHand: ['火杀'] });

  await clickHandCard(page, '火杀');
  await expect(page.locator('.role.target_available')).not.toHaveCount(0);
  await expect(page.locator('#action_prompt'))
    .toContainText('已选择【火杀】，请选择目标');

  await clickHandCard(page, '火杀');
  await expect(page.locator('.role.target_available')).toHaveCount(0);
  await expect(page.locator('.role.target_selected')).toHaveCount(0);
  await expect(page.locator('#ok')).toBeHidden();
  await expect(page.locator('#action_prompt')).toHaveText(
    '出牌阶段：选择一张可用手牌，或点击“弃牌”结束出牌'
  );
  await expect.poll(() => page.evaluate(() => {
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    return {
      targets: human.targets.length,
      selectedTargets: human.selected_targets.length,
      selectedCards: human.card.filter((card) => card.selected).length
    };
  })).toEqual({
    targets: 0,
    selectedTargets: 0,
    selectedCards: 0
  });
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

test('关羽点击红桃时实体桃优先于武圣且不指定目标即对自己使用', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHp: 3,
    humanSkills: ['standard:skill:武圣'],
    humanHand: ['桃', '闪', '杀', '无懈可击']
  });
  const before = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const peach = human.card.find((card) => card.name === '桃');
    const state = bout.state();
    state.players[human.id].maxHp = 5;
    state.players[human.id].hp = 4;
    state.cards[peach.coreCardId].suit = 'heart';
    bout.restoreSnapshot(JSON.stringify(state));
    human.stage = -1;
    human.choice_card();
    const uiPeach = human.card.find(
      (card) => card.coreCardId === peach.coreCardId
    );
    const legal = bout.legalActions().filter((action) =>
      (action.type === 'use-card' && action.cardId === peach.coreCardId) ||
      (action.type === 'use-virtual-card' &&
        action.materialCardIds.includes(peach.coreCardId))
    );
    return {
      hp: bout.state().players[human.id].hp,
      hand: bout.state().zones[`zone:hand:${human.id}`].length,
      hasDirectPeach: legal.some((action) =>
        action.type === 'use-card' &&
        action.targetIds.length === 1 &&
        action.targetIds[0] === human.id
      ),
      hasWushengSlash: legal.some((action) =>
        action.type === 'use-virtual-card' &&
        action.skillId === 'standard:skill:武圣'
      ),
      projectedTargets: bout.select_card(uiPeach, human)[0]
        .map((player) => player.id)
    };
  });

  expect(before).toMatchObject({
    hp: 4,
    hasDirectPeach: true,
    hasWushengSlash: true
  });
  expect(before.projectedTargets).toHaveLength(1);

  await clickHandCard(page, '桃');
  await expect(page.locator('#ok')).toBeVisible();
  await expect(page.locator('#action_prompt'))
    .toContainText('点击“确定”使用');
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    return {
      hp: bout.state().players[human.id].hp,
      hand: bout.state().zones[`zone:hand:${human.id}`].length
    };
  })).toEqual({
    hp: 5,
    hand: before.hand - 1
  });
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

test('关闭无懈询问后自动放弃本地响应且保留无懈可击', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    aiHand: ['过河拆桥'],
    humanHand: ['无懈可击']
  });
  const toggle = page.locator('#nullification_prompt_toggle');
  await expect(toggle).toHaveAttribute('role', 'switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => JSON.parse(
    localStorage.getItem('sgs.interaction-settings.v1')
  ).promptForNullification)).toBe(false);

  const targetId = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const sourceId = bout.state().currentPlayerId;
    return bout.player.find((player) =>
      player.id !== sourceId && player.isAI
    ).id;
  });
  await dispatchAiCard(page, 'standard:dismantlement', targetId);
  await passNonHumanDecisions(page);
  const pending = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const request = bout.state().pendingDecision.request;
    if (
      request.playerId !== human.id ||
      request.type !== 'respond-card' ||
      request.responseKind !== 'nullification'
    ) throw new Error('expected a local nullification response');
    document.body.dataset.nullificationAskCount = '0';
    const original = human.ask_card;
    human.ask_card = function(...args) {
      document.body.dataset.nullificationAskCount = String(
        Number(document.body.dataset.nullificationAskCount) + 1
      );
      return original.apply(this, args);
    };
    bout.resume();
    return { id: request.id, humanId: human.id };
  });
  await expect.poll(() => page.evaluate((decisionId) =>
    window.sgs.interface.bout.state().pendingDecision?.request.id !==
      decisionId
  , pending.id)).toBe(true);
  const outcome = await page.evaluate(({ id, humanId }) => {
    const bout = window.sgs.interface.bout;
    bout.pause();
    const state = bout.state();
    return {
      askCount: Number(document.body.dataset.nullificationAskCount),
      retained: state.zones[`zone:hand:${humanId}`].some((cardId) =>
        state.cards[cardId].definitionId === 'standard:nullification'
      ),
      responded: state.eventLog.some((event) =>
        event.type === 'CardResponded' &&
        event.playerId === humanId &&
        event.responseKind === 'nullification'
      ),
      passed: state.eventLog.some((event) =>
        event.type === 'DecisionResolved' &&
        event.decisionId === id &&
        event.result === 'passed'
      )
    };
  }, pending);
  expect(outcome).toEqual({
    askCount: 0,
    retained: true,
    responded: false,
    passed: true
  });
  await expect(page.locator('#cancel')).toBeHidden();

  await page.reload();
  await expect(page.locator('#nullification_prompt_toggle'))
    .toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#peach_prompt_toggle'))
    .toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('关闭无懈询问后仍会询问影响自己的锦囊', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    aiHand: ['过河拆桥'],
    humanHand: ['无懈可击']
  });
  await page.locator('#nullification_prompt_toggle').click();
  const humanId = await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).id
  );
  await dispatchAiCard(page, 'standard:dismantlement', humanId);
  await passNonHumanDecisions(page);
  await showPendingHumanDecision(page);
  await expect(page.locator('#action_prompt')).toContainText('无懈可击');
  await expect(page.locator('#cancel')).toBeVisible();
  expect(errors).toEqual([]);
});

test('关闭桃询问只跳过救援他人，自己濒死仍会询问', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await configureState(page, { humanHand: ['桃'] });
  const toggle = page.locator('#peach_prompt_toggle');
  await expect(toggle).toHaveAttribute('role', 'switch');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => JSON.parse(
    localStorage.getItem('sgs.interaction-settings.v1')
  ))).toMatchObject({
    promptForNullification: true,
    promptForPeach: false
  });
  const baseSnapshot = await page.evaluate(() =>
    window.sgs.interface.bout.snapshot()
  );

  const installRescueDecision = async (self) => page.evaluate(
    ({ snapshot, self }) => {
      const bout = window.sgs.interface.bout;
      bout.restoreSnapshot(snapshot);
      const human = window.sgs.view.playerFor(document.querySelector('#player'));
      const state = bout.state();
      const target = self
        ? human
        : bout.player.find((player) => player.isAI);
      const sourceCardId = state.zones[`zone:hand:${target.id}`][0];
      state.players[target.id].hp = 0;
      state.players[target.id].dying = true;
      state.players[target.id].alive = true;
      state.pendingDecision = {
        request: {
          id: `decision:test-peach-${self ? 'self' : 'other'}`,
          playerId: human.id,
          type: 'respond-card',
          cardId: sourceCardId,
          acceptedDefinitionIds: ['standard:peach'],
          passAllowed: true,
          responseKind: 'peach'
        },
        remainingResponderIds: [],
        continuation: {
          type: 'rescue',
          playerId: target.id,
          sourceId: null,
          cardId: sourceCardId
        }
      };
      bout.restoreSnapshot(JSON.stringify(state));
      const projectedHuman = window.sgs.view.playerFor(
        document.querySelector('#player')
      );
      document.body.dataset.peachAskCount = '0';
      window.__originalPeachAskCard ||= projectedHuman.ask_card;
      const original = window.__originalPeachAskCard;
      projectedHuman.ask_card = function(...args) {
        document.body.dataset.peachAskCount = String(
          Number(document.body.dataset.peachAskCount) + 1
        );
        return original.apply(this, args);
      };
      bout.resume();
      return {
        id: state.pendingDecision.request.id,
        humanId: projectedHuman.id
      };
    },
    { snapshot: baseSnapshot, self }
  );

  const other = await installRescueDecision(false);
  await expect.poll(() => page.evaluate((decisionId) =>
    window.sgs.interface.bout.state().pendingDecision?.request.id !==
      decisionId
  , other.id)).toBe(true);
  const skipped = await page.evaluate(({ id, humanId }) => {
    const bout = window.sgs.interface.bout;
    bout.pause();
    const state = bout.state();
    return {
      askCount: Number(document.body.dataset.peachAskCount),
      retained: state.zones[`zone:hand:${humanId}`].some((cardId) =>
        state.cards[cardId].definitionId === 'standard:peach'
      ),
      passed: state.eventLog.some((event) =>
        event.type === 'DecisionResolved' &&
        event.decisionId === id &&
        event.result === 'passed'
      )
    };
  }, other);
  expect(skipped).toEqual({ askCount: 0, retained: true, passed: true });

  const self = await installRescueDecision(true);
  await expect.poll(() => page.evaluate(() =>
    Number(document.body.dataset.peachAskCount)
  )).toBe(1);
  expect(await page.evaluate((decisionId) =>
    window.sgs.interface.bout.state().pendingDecision?.request.id ===
      decisionId
  , self.id)).toBe(true);
  await expect(page.locator('#action_prompt')).toContainText('桃');
  await expect(page.locator('#cancel')).toBeVisible();
  await page.evaluate(() => window.sgs.interface.bout.pause());
  expect(errors).toEqual([]);
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

test('诸葛亮观星后闪电不中且乐不思蜀生效时只能弃牌', async ({ page }) => {
  const pageErrors = capturePageErrors(page);
  await startCoreGame(page);
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const state = bout.state();
    const humanIndex = state.turnOrder.indexOf(human.id);
    const predecessorId = state.turnOrder[
      (humanIndex - 1 + state.turnOrder.length) % state.turnOrder.length
    ];
    const handZoneId = `zone:hand:${human.id}`;
    const judgmentZoneId = `zone:judgment:${human.id}`;
    const lightningId = state.zones[handZoneId][0];
    const indulgenceId = state.zones[handZoneId][1];
    state.cards[lightningId].definitionId = 'standard:lightning';
    state.cards[lightningId].sourcePlayerId = predecessorId;
    state.cards[indulgenceId].definitionId = 'standard:indulgence';
    state.cards[indulgenceId].sourcePlayerId = predecessorId;
    state.zones[handZoneId] = state.zones[handZoneId].slice(2);
    state.zones[judgmentZoneId] = [lightningId, indulgenceId];

    const [bottomId, indulgenceMatchId, lightningMissId, finalBottomId] =
      state.zones['zone:draw'].slice(0, 4);
    Object.assign(state.cards[lightningMissId], {
      definitionId: 'standard:peach',
      suit: 'heart',
      rank: 1
    });
    Object.assign(state.cards[indulgenceMatchId], {
      definitionId: 'standard:slash',
      suit: 'spade',
      rank: 13
    });
    Object.assign(state.cards[bottomId], {
      definitionId: 'standard:jink',
      suit: 'club',
      rank: 2
    });
    Object.assign(state.cards[finalBottomId], {
      definitionId: 'standard:wine',
      suit: 'diamond',
      rank: 9
    });
    state.players[human.id].heroDefinitionId = 'standard:hero:诸葛亮';
    state.players[human.id].skillIds = ['standard:skill:观星'];
    state.players[human.id].maxHp = 3;
    state.players[human.id].hp = 3;
    state.currentPlayerId = predecessorId;
    state.phase = 'discard';
    state.pendingDecision = null;
    state.stack = [];
    state.triggerQueue = [];
    state.turnUsage[predecessorId] = {};
    bout.restoreSnapshot(JSON.stringify(state));
    bout.dispatchCommand({ type: 'end-turn', playerId: predecessorId });
    bout.resume();
  });

  await expect(page.locator('#choose_box')).toBeVisible();
  await page.locator('.choose_option').filter({ hasText: /^发动$/ }).click();
  await expect(page.locator('#choose_box.guanxing_arrange_box')).toBeVisible();
  await expect(page.locator('#guanxing_top .guanxing_card')).toHaveCount(4);
  await expect.poll(() => page.locator('#guanxing_top .guanxing_card')
    .evaluateAll((cards) => cards.map((card) => card.name)))
    .toEqual(['闪', '杀', '桃', '酒']);
  await page.locator('.guanxing_card[aria-label^="桃，"]').dragTo(
    page.locator('#guanxing_top'),
    { targetPosition: { x: 4, y: 70 } }
  );
  await expect.poll(() => page.locator('#guanxing_top .guanxing_card')
    .evaluateAll((cards) => cards.map((card) => card.name)))
    .toEqual(['桃', '闪', '杀', '酒']);
  await page.locator('.guanxing_card[aria-label^="闪，"]').dragTo(
    page.locator('#guanxing_bottom'),
    { targetPosition: { x: 10, y: 70 } }
  );
  await page.locator('.guanxing_card[aria-label^="酒，"]').dragTo(
    page.locator('#guanxing_bottom'),
    { targetPosition: { x: 100, y: 70 } }
  );
  await expect.poll(() => page.locator('#guanxing_top .guanxing_card')
    .evaluateAll((cards) => cards.map((card) => card.name)))
    .toEqual(['桃', '杀']);
  await expect.poll(() => page.locator('#guanxing_bottom .guanxing_card')
    .evaluateAll((cards) => cards.map((card) => card.name)))
    .toEqual(['闪', '酒']);
  await page.locator('#guanxing_confirm').click();
  await expect(page.locator('#cancel')).toBeVisible();
  await page.evaluate(() => window.sgs.interface.bout.pause());
  await passAllDecisions(page);
  await expect.poll(() => page.evaluate(() => {
    const state = window.sgs.interface.bout.state();
    return state.phase === 'draw' && state.pendingDecision === null;
  })).toBe(true);
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const state = bout.state();
    bout.dispatchCommand({
      type: 'advance-phase',
      playerId: state.currentPlayerId
    });
    bout.resume();
  });

  await expect.poll(() => page.evaluate(() => {
    const state = window.sgs.interface.bout.state();
    return state.phase === 'discard' && state.pendingDecision === null;
  })).toBe(true);
  await page.evaluate(() => window.sgs.interface.bout.pause());

  const result = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const state = bout.state();
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const judgments = state.eventLog.filter(
      (event) => event.type === 'JudgmentResolved'
    );
    const lightningOwner = state.turnOrder.find((playerId) =>
      state.zones[`zone:judgment:${playerId}`].some(
        (cardId) => state.cards[cardId].definitionId === 'standard:lightning'
      )
    );
    return {
      humanId: human.id,
      stage: human.stage,
      judgments: judgments.slice(-2).map((event) => event.matched),
      lightningOwner,
      indulgenceDiscarded: state.zones['zone:discard'].some(
        (cardId) => state.cards[cardId].definitionId === 'standard:indulgence'
      ),
      legalTypes: [...new Set(bout.legalActions().map((action) => action.type))]
    };
  });
  expect(result.judgments).toEqual([false, true]);
  expect(result.lightningOwner).not.toBe(result.humanId);
  expect(result.indulgenceDiscarded).toBe(true);
  expect(result.legalTypes).toEqual(['discard-cards']);
  expect(result.stage).toBe(3);
  await expect(page.locator('#abandon')).toHaveAttribute(
    'aria-disabled',
    'true'
  );
  await expect(page.locator('#abandon')).toHaveCSS('pointer-events', 'none');

  const cardUsedBefore = await page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.filter(
      (event) => event.type === 'CardUsed'
    ).length
  );
  await page.locator('.player_card').first().click({ force: true });
  expect(await page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.filter(
      (event) => event.type === 'CardUsed'
    ).length
  )).toBe(cardUsedBefore);
  expect(pageErrors).toEqual([]);
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
  await expect(page.locator('#choose_box_title')).toContainText('八卦阵');
  await expect(page.locator('.choose_box_context')).toContainText('发起者：');
  await page.evaluate(() => window.sgs.motion.setInstant(false));
  await page.locator('.choose_option').filter({ hasText: /^发动$/ }).click();
  const judgment = page.locator('.judge_effect');
  await expect(judgment).toBeVisible();
  await expect(judgment.locator('.pattern img'))
    .toHaveAttribute('src', 'img/system/pattern/heart.png');
  await expect(judgment.locator('.num')).toHaveText('6');
  await expect(judgment).toHaveAttribute(
    'aria-label',
    '判定牌：红桃 6，桃'
  );
  const cardMetaGeometry = await page.evaluate(() => {
    const geometry = (card, meta) => {
      const cardRect = card.getBoundingClientRect();
      const metaRect = meta.getBoundingClientRect();
      const patternRect = meta.querySelector('.pattern img')
        .getBoundingClientRect();
      const numberStyle = getComputedStyle(meta.querySelector('.num'));
      return {
        left: metaRect.left - cardRect.left,
        top: metaRect.top - cardRect.top,
        width: metaRect.width,
        height: metaRect.height,
        patternWidth: patternRect.width,
        patternHeight: patternRect.height,
        numberSize: numberStyle.fontSize
      };
    };
    const judgmentCard = document.querySelector('.judge_effect');
    const handCard = document.querySelector('.player_card');
    return {
      judgment: geometry(
        judgmentCard,
        judgmentCard.querySelector('.pat_num')
      ),
      hand: geometry(handCard, handCard.querySelector('.pat_num'))
    };
  });
  expect(cardMetaGeometry.judgment).toEqual(cardMetaGeometry.hand);
  await page.evaluate(() => window.sgs.motion.setInstant(true));
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.some(
      (event) => event.type === 'JudgmentResolved' && event.matched
    )
  )).toBe(true);
  expect(await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).blood
  )).toBe(4);
});

test('虚拟牌和技能伤害直接由 DamageApplied 驱动动画', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['闪'],
    clearOpponentCards: true
  });
  const result = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const state = bout.state();
    const materialCardId = state.zones[`zone:hand:${human.id}`][0];
    state.players[human.id].skillIds = ['standard:skill:武圣'];
    state.cards[materialCardId].suit = 'heart';
    state.cards[materialCardId].rank = 7;
    bout.restoreSnapshot(JSON.stringify(state));
    const action = bout.legalActions().find(
      (candidate) =>
        candidate.type === 'use-virtual-card' &&
        candidate.skillId === 'standard:skill:武圣'
    );
    if (!action) throw new Error('武圣没有生成虚拟杀');
    window.sgs.motion.setInstant(false);
    bout.dispatchCommand(action);
    const pass = bout.legalActions().find(
      (candidate) => candidate.type === 'pass'
    );
    if (!pass) throw new Error('虚拟杀没有进入响应');
    bout.dispatchCommand(pass);
    bout.pause();
    const damageEvent = [...bout.state().eventLog].reverse().find(
      (event) =>
        event.type === 'DamageApplied' &&
        event.cardId.startsWith('virtual-card-')
    );
    return {
      targetId: damageEvent?.targetId,
      targetHp: damageEvent
        ? bout.state().players[damageEvent.targetId].hp
        : null,
      targetMaxHp: damageEvent
        ? bout.state().players[damageEvent.targetId].maxHp
        : null,
      damageEvents: bout.state().eventLog.filter(
        (event) =>
          event.type === 'DamageApplied' &&
          event.cardId.startsWith('virtual-card-')
      ).length,
      animating: window.sgs.motion.isAnimating()
    };
  });
  expect(result.damageEvents).toBe(1);
  expect(result.animating).toBe(true);
  await expect(page.locator('img[src="img/system/damage.png"]'))
    .toHaveCount(1);
  expect(result.targetHp).toBe(result.targetMaxHp - 1);
  await page.evaluate(() => window.sgs.motion.setInstant(true));
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

test('竖版扩展装备在装备栏裁切显示而不拉伸', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  const render = await page.evaluate(async () => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const state = bout.state();
    const handZoneId = `zone:hand:${human.id}`;
    const equipmentZoneId = `zone:equipment:${human.id}`;
    const [gudingId, hualiuId] = state.zones[handZoneId].splice(0, 2);
    state.cards[gudingId].definitionId = 'standard:guding-blade';
    state.cards[hualiuId].definitionId = 'standard:hualiu';
    state.zones[equipmentZoneId].push(gudingId, hualiuId);
    bout.restoreSnapshot(JSON.stringify(state));
    await bout.projectState();
    await Promise.all(
      [...document.querySelectorAll('.equip_img')].map((image) =>
        image.decode()
      )
    );

    const inspect = (selector) => {
      const slot = document.querySelector(selector);
      const image = slot.querySelector('.equip_img');
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return {
        cardName: slot.getAttribute('data-card-name'),
        cropName: slot.querySelector('.equip_crop_name')?.textContent,
        naturalRatio: image.naturalWidth / image.naturalHeight,
        renderedRatio: rect.width / rect.height,
        objectFit: style.objectFit,
        objectPosition: style.objectPosition
      };
    };
    return {
      guding: inspect('#attack'),
      hualiu: inspect('#attack_horse'),
      unprotectedSemanticImages: [
        ...document.querySelectorAll(
          '#cards > .player_card > img:first-child, #player_head_img, ' +
          '.head_img img, .equip_img, .delayed_status > img'
        )
      ].filter((image) => {
        if (!image.naturalWidth || !image.naturalHeight) return false;
        const rect = image.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        const sourceRatio = image.naturalWidth / image.naturalHeight;
        const renderedRatio = rect.width / rect.height;
        const ratioChange = Math.max(
          sourceRatio / renderedRatio,
          renderedRatio / sourceRatio
        );
        const objectFit = getComputedStyle(image).objectFit;
        return ratioChange > 1.15 &&
          objectFit !== 'cover' && objectFit !== 'contain';
      }).map((image) => image.getAttribute('src'))
    };
  });

  expect(render.guding).toMatchObject({
    cardName: '古锭刀',
    cropName: '古锭刀',
    objectFit: 'cover',
    objectPosition: '50% 38%'
  });
  expect(render.hualiu).toMatchObject({
    cardName: '骅骝',
    cropName: '骅骝',
    objectFit: 'cover',
    objectPosition: '50% 44%'
  });
  expect(render.guding.naturalRatio).toBeLessThan(1);
  expect(render.hualiu.naturalRatio).toBeLessThan(1);
  expect(render.guding.renderedRatio).toBeGreaterThan(5);
  expect(render.hualiu.renderedRatio).toBeGreaterThan(5);
  expect(render.unprotectedSemanticImages).toEqual([]);
  expect(errors).toEqual([]);
});

test('技能玩家选择显示上下文，并在点击后直接提交', async ({ page }) => {
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
  await expect(page.locator('#choose_box_title')).toContainText('突袭');
  await expect(page.locator('.choose_box_context')).toContainText('发起者：');
  await expect(page.locator('.choose_box_context')).toContainText('决策者：');
  await expect(page.locator('.choose_box_context')).toContainText('候选目标：');
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

test('火攻直接从当前手牌弃同花色牌，不复制手牌或留下幽灵牌', async ({ page }) => {
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
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(page.locator('#action_prompt')).toContainText(
    '火攻：弃置一张同花色手牌'
  );

  const binding = await page
    .locator('.player_card.action_skill_material_selectable').first()
    .evaluate((choice) => {
      const card = window.sgs.view.cardFor(choice);
      const primary = window.sgs.view.cardElement(card);
      return {
        isCurrentHandCard: primary === choice,
        primaryClass: primary?.className || '',
        primaryParentId: primary?.parentElement?.id || ''
      };
    });
  expect(binding.isCurrentHandCard).toBe(true);
  expect(binding.primaryClass).toContain('player_card');
  expect(binding.primaryParentId).toBe('cards');

  const before = await page.locator('#cards > .player_card').count();
  await page.locator('.player_card.action_skill_material_selectable')
    .first().click();
  await page.locator('#ok').click();
  await expect(page.locator('#cards > .player_card')).toHaveCount(before - 1);
  await expect.poll(() => page.evaluate(() => {
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    return {
      model: human.card.length,
      dom: document.querySelectorAll('#cards > .player_card').length
    };
  })).toEqual({ model: before - 1, dom: before - 1 });
});

test('技能流程要求多张手牌时也直接在当前手牌多选', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['杀', '闪', '桃', '无懈可击']
  });
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const state = bout.state();
    const hand = state.zones[`zone:hand:${human.id}`];
    state.pendingDecision = {
      request: {
        id: 'decision:test-skill-hand',
        type: 'select-cards',
        playerId: human.id,
        cardId: hand[0],
        selectableCardIds: [...hand],
        minimum: 2,
        maximum: 2,
        reason: 'ganglie-discard'
      },
      remainingResponderIds: [],
      continuation: {
        type: 'selected-cards',
        destination: { type: 'discard' },
        reason: 'ganglie-discard',
        moveReason: 'discard'
      }
    };
    bout.restoreSnapshot(JSON.stringify(state));
    bout.resume();
  });

  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(page.locator('#action_prompt')).toContainText(
    '刚烈：弃置两张手牌'
  );
  await expect(
    page.locator('.player_card.action_skill_material_selectable')
  ).toHaveCount(4);
  await expect(page.locator('#cancel')).toBeHidden();
  await expect(page.locator('#ok')).toBeHidden();

  await page.locator('.player_card.action_skill_material_selectable')
    .nth(0).click();
  await expect(page.locator('#ok')).toBeHidden();
  await page.locator('.player_card.action_skill_material_selectable')
    .nth(1).click();
  await expect(page.locator('#ok')).toBeVisible();
  await expect(page.locator('#action_prompt')).toContainText('已选 2 张');
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    return {
      pending: bout.state().pendingDecision,
      hand: bout.state().zones[`zone:hand:${human.id}`].length
    };
  })).toEqual({ pending: null, hand: 2 });
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

test('可用主动技在技能标签高亮，仁德从手牌自由多选后选择目标', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanSkills: ['standard:skill:仁德'],
    humanHand: ['杀', '闪', '桃', '无懈可击']
  });
  const before = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    return bout.state().zones[`zone:hand:${human.id}`].length;
  });
  await page.evaluate(() => window.sgs.interface.bout.resume());
  const rendeTag = page.locator(
    '#player_head .skill_tag.active_skill_available'
  ).filter({ hasText: /^仁德$/ });
  await expect(rendeTag).toHaveCount(1);
  await expect(rendeTag).toHaveAttribute(
    'data-skill-id',
    'standard:skill:仁德'
  );
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await rendeTag.click();
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(page.locator('#action_prompt')).toContainText(
    '【仁德】选择材料牌'
  );
  await expect(
    page.locator('.player_card.action_skill_material_selectable')
  ).toHaveCount(4);
  await expect(page.locator('.choose_option')).toHaveCount(0);
  await expect(page.locator('#ok')).toBeHidden();
  await page.locator('.player_card.action_skill_material_selectable')
    .nth(0).click();
  await page.locator('.player_card.action_skill_material_selectable')
    .nth(2).click();
  await expect(page.locator('.player_card.action_skill_material_selected'))
    .toHaveCount(2);
  await expect(page.locator('#action_prompt'))
    .toContainText('已选 2 张');
  await expect(page.locator('#ok')).toBeVisible();
  const selectedCardIds = await page
    .locator('.player_card.action_skill_material_selected')
    .evaluateAll((cards) => cards.map(
      (card) => window.sgs.view.cardFor(card).coreCardId
    ));
  await page.locator('#ok').click();
  await expect(page.locator('#choose_box')).toContainText(
    '【仁德】选择目标'
  );
  await page.locator('.choose_option')
    .filter({ hasNotText: '返回' }).first().click();
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.find(
      (event) =>
        event.type === 'SkillActivated' &&
        event.skillId === 'standard:skill:仁德'
    )
  )).toMatchObject({
    materialCardIds: expect.arrayContaining(selectedCardIds)
  });
  await page.evaluate(() => window.sgs.interface.bout.pause());
  const after = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    return {
      core: bout.state().zones[`zone:hand:${human.id}`].length,
      ui: human.card.length
    };
  });
  expect(after.core).toBe(before - 2);
  expect(after.ui).toBe(after.core);
});

test('制衡直接从当前手牌和装备区多选，不再枚举牌的组合', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanSkills: ['standard:skill:制衡'],
    humanHand: ['丈八蛇矛', '杀', '闪', '桃'],
    humanEquipment: '丈八蛇矛',
    clearOpponentCards: true
  });
  await page.evaluate(async () => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    await window.sgs.animation.Equip_Equipment(human, human.equip[0]);
    bout.resume();
  });

  const zhiheng = page.locator(
    '#player_head .skill_tag.active_skill_available'
  ).filter({ hasText: /^制衡$/ });
  await expect(zhiheng).toHaveCount(1);
  await zhiheng.click();

  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(page.locator('.choose_option')).toHaveCount(0);
  await expect(page.locator('#action_prompt')).toContainText(
    '直接点击当前手牌或装备区选择'
  );
  await expect(
    page.locator('.player_card.action_skill_material_selectable')
  ).toHaveCount(3);
  await expect(page.locator('#attack'))
    .toHaveClass(/action_skill_material_selectable/);

  await page.locator('.player_card.action_skill_material_selectable')
    .first().click();
  await page.locator('#attack .equip_box').click();
  await expect(page.locator('#attack'))
    .toHaveClass(/action_skill_material_selected/);
  await expect(page.locator('#action_prompt')).toContainText('已选 2 张');
  await expect(page.locator('#ok')).toBeVisible();

  const selectedCardIds = await page.evaluate(() => [
    window.sgs.view.cardFor(
      document.querySelector('.player_card.action_skill_material_selected')
    ).coreCardId,
    window.sgs.view.cardFor(document.querySelector('#attack')).coreCardId
  ]);
  await page.locator('#ok').click();
  await expect(page.locator('#choose_box')).toHaveCount(0);

  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.find(
      (event) =>
        event.type === 'SkillActivated' &&
        event.skillId === 'standard:skill:制衡'
    )
  )).toMatchObject({
    materialCardIds: expect.arrayContaining(selectedCardIds)
  });
  await expect.poll(() => page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    return bout.state().zones[`zone:equipment:${human.id}`].length;
  })).toBe(0);
});

test('全部视为技都进入显式技能或装备入口清单', async ({ page }) => {
  await openStartScreen(page);
  const manifest = await page.evaluate(async () => {
    const { createEarlyExpansionRegistry } = await import(
      '/src/content/early-expansions.ts'
    );
    const registry = createEarlyExpansionRegistry([
      'wind',
      'military',
      'fire',
      'forest'
    ]);
    const skillIds = [...new Set(registry.heroes().flatMap(
      (hero) => hero.skillIds
    ))];
    const skillRules = skillIds.flatMap((skillId) =>
      (registry.skill(skillId).abilities || [])
        .filter((ability) => ability.type === 'view-as')
        .map((ability) => ability.id)
    );
    const cardIds = [...new Set(registry.cardPrints().map(
      (print) => print.definitionId
    ))];
    const equipmentRules = cardIds.flatMap((cardId) =>
      (registry.card(cardId).abilities || [])
        .filter((ability) => ability.type === 'view-as')
        .map((ability) => ability.id)
    );
    return {
      ruleCount: skillRules.length + equipmentRules.length,
      activators: [...new Set([...skillRules, ...equipmentRules])].sort()
    };
  });
  expect(manifest.ruleCount).toBe(17);
  expect(manifest.activators).toEqual([
    'fire:skill:乱击',
    'fire:skill:双雄',
    'fire:skill:火计',
    'fire:skill:看破',
    'fire:skill:连环',
    'forest:skill:断粮',
    'forest:skill:酒池',
    'standard:equipment:fan',
    'standard:equipment:spear',
    'standard:skill:倾国',
    'standard:skill:国色',
    'standard:skill:奇袭',
    'standard:skill:急救',
    'standard:skill:武圣',
    'standard:skill:龙胆',
    'wind:skill:蛊惑'
  ]);
});

test('武圣必须点击高亮技能标签后才把红牌当杀', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanSkills: ['standard:skill:武圣'],
    humanHand: ['闪', '闪', '桃', '无懈可击'],
    clearOpponentCards: true
  });
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const state = bout.state();
    const hand = state.zones[`zone:hand:${human.id}`];
    hand.forEach((cardId) => {
      state.cards[cardId].suit = 'club';
    });
    state.cards[hand[0]].suit = 'heart';
    bout.restoreSnapshot(JSON.stringify(state));
    bout.resume();
  });

  const wusheng = page.locator(
    '#player_head .skill_tag'
  ).filter({ hasText: /^武圣$/ });
  await expect(wusheng).toHaveCount(1);
  await expect(wusheng).toHaveClass(/active_skill_available/);
  await expect(page.locator('.player_card.card_unusable')).toHaveCount(4);
  await page.locator('.player_card').first().click({ force: true });
  await expect(page.locator('#choose_box')).toHaveCount(0);

  await wusheng.click();
  await expect(wusheng).toHaveClass(/active_skill_engaged/);
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(page.locator('#action_prompt')).toContainText(
    '【武圣】选择 1 张牌'
  );
  await expect(
    page.locator('.player_card.action_skill_material_selectable')
  ).toHaveCount(1);
  await page.locator('#cancel').click();
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(wusheng).toHaveClass(/active_skill_available/);
  await expect(wusheng).not.toHaveClass(/active_skill_engaged/);

  await wusheng.click();
  await page.locator('.player_card.action_skill_material_selectable').click();
  await page.locator('#ok').click();
  await expect(page.locator('#choose_box')).toContainText(
    '【武圣】选择目标'
  );
  await page.locator('.choose_option')
    .filter({ hasNotText: '返回选择材料' }).first().click();

  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.find(
      (event) =>
        event.type === 'CardUsed' &&
        event.skillId === 'standard:skill:武圣'
    )
  )).toBeTruthy();
  await expect(wusheng).not.toHaveClass(/active_skill_engaged/);
});

test('倾国响应杀时必须先点击技能标签', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    humanSkills: ['standard:skill:倾国'],
    aiHand: ['杀'],
    humanHand: ['桃', '桃', '无懈可击', '桃']
  });
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const state = bout.state();
    state.zones[`zone:hand:${human.id}`].forEach((cardId) => {
      state.cards[cardId].suit = 'club';
    });
    bout.restoreSnapshot(JSON.stringify(state));
  });
  const humanId = await page.evaluate(() =>
    window.sgs.view.playerFor(document.querySelector('#player')).id
  );
  await dispatchAiCard(page, 'standard:slash', humanId);
  await showPendingHumanDecision(page);

  const qingguo = page.locator(
    '#player_head .skill_tag.active_skill_available'
  ).filter({ hasText: /^倾国$/ });
  await expect(qingguo).toHaveCount(1);
  await expect(page.locator('.player_card.card_unusable')).toHaveCount(4);
  await qingguo.click();
  await expect(qingguo).toHaveClass(/active_skill_engaged/);
  await page.locator('.player_card.action_skill_material_selectable').first().click();
  await page.locator('#ok').click();
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.find(
      (event) =>
        event.type === 'CardResponded' &&
        event.skillId === 'standard:skill:倾国'
    )
  )).toMatchObject({ responseKind: 'jink' });
});

test('蛊惑选择材料后仍需明确选择声明牌名', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanSkills: ['wind:skill:蛊惑'],
    humanHand: ['闪', '桃', '杀', '无懈可击'],
    clearOpponentCards: true
  });
  await page.evaluate(() => window.sgs.interface.bout.resume());

  const guhuo = page.locator(
    '#player_head .skill_tag.active_skill_available'
  ).filter({ hasText: /^蛊惑$/ });
  await expect(guhuo).toHaveCount(1);
  await guhuo.click();
  await page.locator('.player_card.action_skill_material_selectable').first().click();
  await page.locator('#ok').click();
  await expect(page.locator('#choose_box_title')).toContainText(
    '【蛊惑】选择要转化的牌'
  );
  expect(await page.locator('.choose_option').count()).toBeGreaterThan(5);
  await expect(page.locator('.choose_option').filter({ hasText: /^杀$/ }))
    .toHaveCount(1);
});

test('蛊惑集中展示 AI 与玩家的质疑结果', async ({ page }) => {
  await startCoreGame(page);
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    const opponents = bout.player.filter((player) => player !== human);
    void bout.notify(
      'guhuo_decisions',
      opponents[0],
      [human, opponents[1]],
      [opponents[2]]
    );
  });
  await expect(page.locator('#guhuo_feedback')).toBeVisible();
  await expect(page.locator('#guhuo_feedback')).toContainText('发动蛊惑');
  await expect(page.locator('#guhuo_feedback span')).toContainText('质疑：');
  await expect(page.locator('#guhuo_feedback span'))
    .toContainText('1 人选择不质疑');
});

test('丈八蛇矛只在点击高亮装备后选择两张手牌发动', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['丈八蛇矛', '闪', '桃', '无懈可击'],
    humanEquipment: '丈八蛇矛',
    clearOpponentCards: true
  });
  await page.evaluate(async () => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    await window.sgs.animation.Equip_Equipment(human, human.equip[0]);
    bout.resume();
  });

  const spear = page.locator('#attack');
  await expect(spear).toHaveClass(/equipment_skill_available/);
  await expect(spear).not.toHaveClass(/equipment_skill_active/);
  await expect(spear).toHaveAttribute(
    'data-equipment-skill-id',
    'standard:equipment:spear'
  );
  await expect(page.locator('.player_card.card_unusable')).toHaveCount(3);

  const revision = await page.evaluate(() =>
    window.sgs.interface.bout.state().revision
  );
  await page.locator('.player_card').first().click({ force: true });
  expect(await page.evaluate(() =>
    window.sgs.interface.bout.state().revision
  )).toBe(revision);
  await expect(page.locator('#choose_box')).toHaveCount(0);

  await spear.click();
  await expect(spear).toHaveClass(/equipment_skill_active/);
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(page.locator('#action_prompt')).toContainText(
    '【丈八蛇矛】选择 2 张牌'
  );
  await expect(
    page.locator('.player_card.action_skill_material_selectable')
  ).toHaveCount(3);
  await page.locator('.player_card.action_skill_material_selectable')
    .nth(0).click();
  await page.locator('.player_card.action_skill_material_selectable')
    .nth(1).click();
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#cancel').click();
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(spear).toHaveClass(/equipment_skill_available/);
  await expect(spear).not.toHaveClass(/equipment_skill_active/);

  await spear.click();
  await page.locator('.player_card.action_skill_material_selectable').nth(0).click();
  await page.locator('.player_card.action_skill_material_selectable').nth(1).click();
  const materialCardIds = await page
    .locator('.player_card.action_skill_material_selected')
    .evaluateAll((cards) => cards.map(
      (card) => window.sgs.view.cardFor(card).coreCardId
    ));
  await page.locator('#ok').click();
  await expect(page.locator('#choose_box')).toContainText(
    '【丈八蛇矛】选择目标'
  );
  await expect(spear).toHaveClass(/equipment_skill_active/);
  await page.locator('.choose_option')
    .filter({ hasNotText: '返回选择材料' }).first().click();

  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.find(
      (event) =>
        event.type === 'CardUsed' &&
        event.skillId === 'standard:equipment:spear'
    )
  )).toMatchObject({
    materialCardIds: expect.arrayContaining(materialCardIds)
  });
  await expect(spear).not.toHaveClass(/equipment_skill_active/);
});

test('丈八蛇矛响应南蛮入侵时也必须先点击装备', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    aiHand: ['南蛮入侵'],
    humanHand: ['丈八蛇矛', '桃', '闪', '桃'],
    humanEquipment: '丈八蛇矛'
  });
  await page.evaluate(async () => {
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    await window.sgs.animation.Equip_Equipment(human, human.equip[0]);
  });
  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const action = bout.legalActions().find((candidate) =>
      candidate.type === 'use-card' &&
      bout.state().cards[candidate.cardId].definitionId ===
        'standard:savage-assault'
    );
    if (!action) throw new Error('AI has no legal Savage Assault');
    bout.dispatchCommand(action);
  });
  await showPendingHumanDecision(page);

  const spear = page.locator('#attack');
  await expect(spear).toHaveClass(/equipment_skill_available/);
  await expect(page.locator('.player_card.card_unusable')).toHaveCount(3);
  await expect(page.locator('#ok')).toBeHidden();

  await spear.click();
  await expect(spear).toHaveClass(/equipment_skill_active/);
  await page.locator('.player_card.action_skill_material_selectable').nth(0).click();
  await page.locator('.player_card.action_skill_material_selectable').nth(1).click();
  const materialCardIds = await page
    .locator('.player_card.action_skill_material_selected')
    .evaluateAll((cards) => cards.map(
      (card) => window.sgs.view.cardFor(card).coreCardId
    ));
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.find(
      (event) =>
        event.type === 'CardResponded' &&
        event.skillId === 'standard:equipment:spear'
    )
  )).toMatchObject({
    responseKind: 'slash',
    materialCardIds: expect.arrayContaining(materialCardIds)
  });
  await expect(spear).not.toHaveClass(/equipment_skill_active/);
});

test('朱雀羽扇必须点击装备后才把实体杀转为火杀', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHand: ['朱雀羽扇', '杀', '闪', '桃'],
    humanEquipment: '朱雀羽扇',
    clearOpponentCards: true
  });
  await page.evaluate(async () => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    await window.sgs.animation.Equip_Equipment(human, human.equip[0]);
    bout.resume();
  });

  const fan = page.locator('#attack');
  await expect(fan).toHaveClass(/equipment_skill_available/);
  const normalSlash = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(
      document.querySelector('#player')
    );
    const slash = human.card.find((card) => card.name === '杀');
    const targets = bout.select_card(slash, human)[0];
    return {
      definitionId: slash.definitionId,
      targetCount: targets.length
    };
  });
  expect(normalSlash).toEqual({
    definitionId: 'standard:slash',
    targetCount: 3
  });

  await fan.click();
  await expect(fan).toHaveClass(/equipment_skill_active/);
  await expect(
    page.locator('.player_card.action_skill_material_selectable')
  ).toHaveCount(1);
  expect(await page
    .locator('.player_card.action_skill_material_selectable')
    .evaluate((card) => window.sgs.view.cardFor(card).name)
  ).toBe('杀');
  await page.locator('.player_card.action_skill_material_selectable').click();
  await page.locator('#ok').click();
  await page.locator('.choose_option')
    .filter({ hasNotText: '返回选择材料' }).first().click();
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().eventLog.find(
      (event) =>
        event.type === 'CardUsed' &&
        event.skillId === 'standard:equipment:fan'
    )
  )).toBeTruthy();
});

test('正常出牌不会再次弹出主动技枚举，仍可从高亮标签发动', async ({ page }) => {
  await startCoreGame(page);
  await configureState(page, {
    humanHp: 3,
    humanSkills: ['standard:skill:仁德'],
    humanHand: ['杀', '闪', '桃', '无懈可击']
  });
  await page.evaluate(() => window.sgs.interface.bout.resume());
  const rendeTag = page.locator(
    '#player_head .skill_tag.active_skill_available'
  ).filter({ hasText: /^仁德$/ });
  await expect(rendeTag).toHaveCount(1);
  await expect(page.locator('#choose_box')).toHaveCount(0);

  await clickHandCard(page, '桃');
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();
  await expect.poll(() => page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const human = window.sgs.view.playerFor(document.querySelector('#player'));
    return bout.state().players[human.id].hp;
  })).toBe(4);
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(rendeTag).toHaveCount(1);

  await rendeTag.click();
  await expect(page.locator('#choose_box')).toHaveCount(0);
  await expect(page.locator('#action_prompt')).toContainText(
    '【仁德】选择材料牌'
  );
  await page.evaluate(() => window.sgs.interface.bout.pause());
});

test('JSONL 可重绑浏览器状态并逐步播放动画语义序列', async ({ page }) => {
  await startCoreGame(page);
  const result = await page.evaluate(async () => {
    const bout = window.sgs.interface.bout;
    const [
      { JsonlReplayRecorder },
      { GameSession },
      { createEarlyExpansionRegistry }
    ] = await Promise.all([
      import('/src/replay/jsonl.ts'),
      import('/src/session/game-session.ts'),
      import('/src/content/early-expansions.ts')
    ]);
    const registry = createEarlyExpansionRegistry([]);
    const session = new GameSession(bout.state(), registry);
    const recorder = new JsonlReplayRecorder(
      session,
      registry,
      'browser-visual-step'
    );
    const use = session.legalActions().find((action) =>
      action.type === 'use-card' &&
      session.state().cards[action.cardId].definitionId === 'standard:slash'
    );
    if (!use) throw new Error('replay fixture does not expose Slash');
    await recorder.dispatch(use);
    const pass = session.legalActions().find(
      (action) => action.type === 'pass'
    );
    if (!pass) throw new Error('replay fixture does not expose pass');
    await recorder.dispatch(pass);

    const loaded = await bout.loadReplayJsonl(recorder.jsonl());
    const boundCards =
      bout.boundCoreCardIds().length === Object.keys(bout.state().cards).length;
    const first = await bout.stepReplay();
    const firstVisual = bout.visualEvents(true);
    const second = await bout.stepReplay();
    const secondVisual = bout.visualEvents(true);
    return {
      loaded,
      first,
      second,
      boundCards,
      firstTypes: firstVisual.map((event) => event.type),
      secondTypes: secondVisual.map((event) => event.type)
    };
  });
  expect(result.loaded).toMatchObject({
    loaded: true,
    cursor: 0,
    total: 2,
    finished: false,
    scenario: 'browser-visual-step'
  });
  expect(result.first).toMatchObject({ cursor: 1, finished: false });
  expect(result.second).toMatchObject({ cursor: 2, finished: true });
  expect(result.boundCards).toBe(true);
  expect(result.firstTypes).toEqual([
    'choice_card',
    'sync_hand'
  ]);
  expect(result.secondTypes).toContain('damage');
});

test('非 instant 动画下 AI 使用自目标酒后继续推进', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startCoreGame(page);
  await configureState(page, {
    current: 'ai',
    aiHand: ['酒', '闪', '闪', '闪'],
    humanHand: ['闪', '桃', '杀', '闪']
  });
  const dispatchedRevision = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    window.sgs.motion.setInstant(false);
    const wine = bout.legalActions().find((action) =>
      action.type === 'use-card' &&
      bout.state().cards[action.cardId].definitionId === 'standard:wine'
    );
    if (!wine) throw new Error('AI has no legal Wine');
    bout.dispatchCommand(wine);
    const revision = bout.state().revision;
    bout.resume();
    return revision;
  });

  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.state().revision
  ), { timeout: 5_000 }).toBeGreaterThan(dispatchedRevision);
  await page.evaluate(() => {
    window.sgs.interface.bout.pause();
    window.sgs.motion.setInstant(true);
  });
  expect(errors).toEqual([]);
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
