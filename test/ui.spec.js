const { test, expect } = require('@playwright/test');

async function openStartScreen(page) {
  await page.goto('/');
  await expect(page.locator('#main')).toBeVisible();
  await expect(page.locator('#game_start')).toBeVisible();
  await expect(page.locator('#start_options')).toBeVisible();
}

async function startDeterministicGame(page) {
  await openStartScreen(page);
  await page.locator('#game_start').click();
  await expect(page.locator('#choose_box')).toBeVisible();
  await page.locator('.choose_role_card').first().click();

  await page.evaluate(() => {
    window.jQuery.fx.off = true;
    const bout = window.sgs.interface.bout;
    bout.continue = function () {};
  });
  await page.waitForFunction(() => document.querySelectorAll('.player_card').length === 4);

  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const player = document.querySelector('#player').player;
    bout.curplayer = bout.player.indexOf(player);
    bout.step = 2;
    player.stage = 2;
    player.targets = [];
    player.selected_targets = [];
    player.selected_cards = [];
    player.target_selectable_count = -1;
    player.card_selectable_count = -1;
    player.card.forEach((card) => { card.selected = false; });
    document.querySelector('#player_cover').style.display = 'none';
    document.querySelector('#ok').style.display = 'none';
    document.querySelector('#cancel').style.display = 'none';
    document.querySelector('#abandon').style.display = 'block';
  });
}

async function clickHandCard(page, name) {
  await page.locator('.player_card').evaluateAll((cards, cardName) => {
    const card = cards.find((element) => element.card && element.card.name === cardName);
    if (!card) {
      throw new Error(`hand does not contain ${cardName}`);
    }
    card.click();
  }, name);
}

async function clickFirstAvailableTarget(page) {
  await page.evaluate(() => {
    const player = document.querySelector('#player').player;
    if (!player.targets.length) {
      throw new Error('selected card has no available target');
    }
    player.targets[0].dom.click();
  });
}

async function removeNullifications(page) {
  await page.evaluate(() => {
    window.sgs.interface.bout.player.forEach((player) => {
      player.card.forEach((card) => {
        if (card.name === '无懈可击') {
          card.name = '杀';
        }
      });
    });
  });
}

function capturePageErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message || String(error)));
  return errors;
}

test('开始游戏后隐藏开始按钮和扩展包选项，并只启用勾选的扩展', async ({ page }) => {
  const errors = capturePageErrors(page);
  await openStartScreen(page);

  await page.locator('input[value="wind"]').uncheck();
  await page.locator('input[value="military"]').check();
  await page.locator('input[value="fire"]').check();
  await page.locator('#ai_level').selectOption('2');
  await page.locator('#game_start').click();

  await expect(page.locator('#game_start')).toBeHidden();
  await expect(page.locator('#start_options')).toBeHidden();
  await expect(page.locator('#choose_box')).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    wind: !!window.sgs.EXPANSION_PACKS.wind.enabled,
    military: !!window.sgs.EXPANSION_PACKS.military.enabled,
    fire: !!window.sgs.EXPANSION_PACKS.fire.enabled,
    forest: !!window.sgs.EXPANSION_PACKS.forest.enabled,
  }))).toEqual({ wind: false, military: true, fire: true, forest: false });
  await expect.poll(() => page.evaluate(() => ({
    militaryCards: window.sgs.EXPANSION_PACKS.military.cards.length,
    fireHeroes: window.sgs.EXPANSION_PACKS.fire.heroes.length,
    hasGudingBlade: window.sgs.CARD.some((card) => card.name === '古锭刀'),
    hasWolong: window.sgs.HERO.some((hero) => hero.name === '卧龙诸葛亮'),
  }))).toEqual({
    militaryCards: 52,
    fireHeroes: 8,
    hasGudingBlade: true,
    hasWolong: true,
  });
  expect(errors).toEqual([]);
});

test('主动出杀：选牌、选目标、确认后移除手牌并进入响应队列', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);
  const initialCount = await page.evaluate(() => document.querySelector('#player').player.card.length);

  await clickHandCard(page, '杀');
  await expect(page.locator('#ok')).toBeHidden();
  await clickFirstAvailableTarget(page);
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.card.length))
    .toBe(initialCount - 1);
  await expect(page.locator('#ok')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.choice.at(-1)?.id)).toBe('闪');
  expect(errors).toEqual([]);
});

test('自用牌：桃不需要手动选目标即可确认并恢复体力', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  const initial = await page.evaluate(() => {
    const player = document.querySelector('#player').player;
    player.blood = player.hero.life - 1;
    return { count: player.card.length, blood: player.blood };
  });
  await clickHandCard(page, '桃');
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.card.length))
    .toBe(initial.count - 1);
  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.blood))
    .toBe(initial.blood + 1);
  expect(errors).toEqual([]);
});

test('全体锦囊：无需选择目标即可确认且不会抛出目标类型异常', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  const initialCount = await page.evaluate(() => {
    const player = document.querySelector('#player').player;
    player.card[0].name = '南蛮入侵';
    return player.card.length;
  });
  await clickHandCard(page, '南蛮入侵');
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.card.length))
    .toBe(initialCount - 1);
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.choice.length))
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('响应专用牌不能在出牌阶段主动消耗', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  await page.evaluate(() => {
    const player = document.querySelector('#player').player;
    player.card[0].name = '闪';
    player.card[1].name = '无懈可击';
  });
  const initialCount = await page.evaluate(() => document.querySelector('#player').player.card.length);

  await clickHandCard(page, '闪');
  await expect(page.locator('#ok')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.target_selectable_count))
    .toBe(-1);

  await clickHandCard(page, '无懈可击');
  await expect(page.locator('#ok')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.card.length))
    .toBe(initialCount);
  expect(errors).toEqual([]);
});

test('铁索连环允许选择一至两名目标并结算双方横置状态', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);
  await removeNullifications(page);

  await page.evaluate(() => {
    document.querySelector('#player').player.card[0].name = '铁索连环';
  });
  await clickHandCard(page, '铁索连环');
  await expect(page.locator('#ok')).toBeHidden();
  await clickFirstAvailableTarget(page);
  await expect(page.locator('#ok')).toBeVisible();
  await clickFirstAvailableTarget(page);
  await expect(page.locator('#ok')).toBeHidden();
  await clickFirstAvailableTarget(page);
  await expect(page.locator('#ok')).toBeVisible();
  await page.evaluate(() => {
    const player = document.querySelector('#player').player;
    player.targets.find((target) => !target.selected).dom.click();
  });
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() => {
    const player = document.querySelector('#player').player;
    return player.selected_targets.length;
  })).toBe(0);
  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.player.filter((player) => player.status.chained).length
  )).toBe(2);
  expect(errors).toEqual([]);
});

test('决斗选定目标后进入杀的交替响应链', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);
  await removeNullifications(page);

  const initialCount = await page.evaluate(() => {
    const player = document.querySelector('#player').player;
    player.card[0].name = '决斗';
    return player.card.length;
  });
  await clickHandCard(page, '决斗');
  await clickFirstAvailableTarget(page);
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.card.length))
    .toBe(initialCount - 1);
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.choice.at(-1)?.id))
    .toBe('杀');
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.opt.at(-1)?.data?.name))
    .toBe('决斗');
  expect(errors).toEqual([]);
});

test('五谷丰登不会静默消耗：每名存活角色获得一张牌', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);
  await removeNullifications(page);

  const before = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const player = document.querySelector('#player').player;
    player.card[0].name = '五谷丰登';
    return {
      counts: bout.player.map((item) => item.card.length),
      sourceIndex: bout.player.indexOf(player),
    };
  });
  await clickHandCard(page, '五谷丰登');
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() =>
    window.sgs.interface.bout.player.map((item) => item.card.length)
  )).toEqual(before.counts.map((count, index) => count + (index === before.sourceIndex ? 0 : 1)));
  expect(errors).toEqual([]);
});

test('被动响应：选择闪后确认走响应接口，移除手牌并清理选择状态', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  const initialCount = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const player = document.querySelector('#player').player;
    const attacker = bout.player.find((candidate) => candidate !== player);
    const slash = new window.sgs.Card('杀', 3, 7);
    bout.opt = [new window.sgs.Operate('杀', attacker, player, slash)];
    bout.choice = [new window.sgs.Operate('闪', attacker, player, '闪')];
    player.ask_card(bout.choice[0]);
    return player.card.length;
  });

  await clickHandCard(page, '闪');
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.card.length))
    .toBe(initialCount - 1);
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.choice.length)).toBe(0);
  await expect(page.locator('#ok')).toBeHidden();
  await expect(page.locator('#cancel')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.selected_cards.length))
    .toBe(0);
  expect(errors).toEqual([]);
});

test('取消响应：不消耗手牌，提交无响应并恢复界面', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  const initialCount = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const player = document.querySelector('#player').player;
    const attacker = bout.player.find((candidate) => candidate !== player);
    const slash = new window.sgs.Card('杀', 3, 7);
    bout.opt = [new window.sgs.Operate('杀', attacker, player, slash)];
    bout.choice = [new window.sgs.Operate('闪', attacker, player, '闪')];
    player.ask_card(bout.choice[0]);
    return player.card.length;
  });

  await clickHandCard(page, '闪');
  await page.locator('#cancel').click();

  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.card.length))
    .toBe(initialCount);
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.choice.length)).toBe(0);
  await expect(page.locator('#ok')).toBeHidden();
  await expect(page.locator('#cancel')).toBeHidden();
  expect(errors).toEqual([]);
});

test('濒死求桃：玩家可以选择桃完成救援', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const player = document.querySelector('#player').player;
    const killer = bout.player.find((candidate) => candidate !== player);
    player.blood = 0;
    player.status.dead = false;
    const request = new window.sgs.Operate('桃', player, player, '桃');
    request.damage_source = killer;
    bout.choice = [request];
    player.ask_card(request);
  });
  await clickHandCard(page, '桃');
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.blood)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.choice.length)).toBe(0);
  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.status.dead)).toBe(false);
  expect(errors).toEqual([]);
});

test('濒死求桃：最后一名响应者取消后完成死亡结算', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const player = document.querySelector('#player').player;
    const killer = bout.player.find((candidate) => candidate !== player);
    player.blood = 0;
    player.status.dead = false;
    const request = new window.sgs.Operate('桃', player, player, '桃');
    request.damage_source = killer;
    bout.choice = [request];
    player.ask_card(request);
  });
  await page.locator('#cancel').click();

  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.status.dead)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.choice.length)).toBe(0);
  await expect(page.locator('#player_identity img')).toHaveAttribute('src', /img\/system\/dead\//);
  expect(errors).toEqual([]);
});

test('结束出牌且无需弃牌：点击弃牌后立即推进到下一名玩家', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  const previousPlayer = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const player = document.querySelector('#player').player;
    player.blood = player.card.length;
    return bout.curplayer;
  });
  await page.locator('#abandon').click();

  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.curplayer))
    .not.toBe(previousPlayer);
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.step)).toBe(0);
  await expect(page.locator('#abandon')).toBeHidden();
  expect(errors).toEqual([]);
});

test('结束出牌且需要弃牌：选足数量后确认弃牌并推进回合', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  const state = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const player = document.querySelector('#player').player;
    player.blood = player.card.length - 1;
    return { count: player.card.length, curplayer: bout.curplayer };
  });
  await page.locator('#abandon').click();
  await expect(page.locator('#ok')).toBeHidden();
  await page.locator('.player_card').first().click();
  await expect(page.locator('#ok')).toBeVisible();
  await page.locator('#ok').click();

  await expect.poll(() => page.evaluate(() => document.querySelector('#player').player.card.length))
    .toBe(state.count - 1);
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.curplayer))
    .not.toBe(state.curplayer);
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.step)).toBe(0);
  expect(errors).toEqual([]);
});

test('出牌阶段预先灰置响应牌、满血桃和无合法目标的锦囊', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  const state = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const player = document.querySelector('#player').player;
    player.card[0].name = '过河拆桥';
    bout.player.filter((candidate) => candidate !== player).forEach((candidate) => {
      candidate.card = [];
      candidate.equip = [];
      candidate.be_decision = [];
    });
    player.choice_card();
    return [...document.querySelectorAll('.player_card')].reduce((result, element) => {
      result[element.card.name] = {
        disabled: element.getAttribute('aria-disabled'),
        covered: getComputedStyle(element.querySelector('.select_unable')).display,
      };
      return result;
    }, {});
  });

  expect(state['过河拆桥']).toEqual({ disabled: 'true', covered: 'block' });
  expect(state['闪']).toEqual({ disabled: 'true', covered: 'block' });
  expect(state['桃']).toEqual({ disabled: 'true', covered: 'block' });
  expect(state['无懈可击']).toEqual({ disabled: 'true', covered: 'block' });
  expect(errors).toEqual([]);
});

test('选中过河拆桥后明确高亮全部合法目标，并区分已选择目标', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);
  await removeNullifications(page);

  const expectedTargets = await page.evaluate(() => {
    const player = document.querySelector('#player').player;
    player.card[0].name = '过河拆桥';
    player.choice_card();
    return window.sgs.interface.bout.select_card(
      new window.sgs.Operate('过河拆桥', player, undefined, player.card[0])
    )[0].length;
  });
  await clickHandCard(page, '过河拆桥');

  await expect(page.locator('.role.target_available')).toHaveCount(expectedTargets);
  await expect(page.locator('.role.target_selected')).toHaveCount(0);
  await page.locator('.role.target_available').first().click();
  await expect(page.locator('.role.target_selected')).toHaveCount(1);
  await expect(page.locator('#ok')).toBeVisible();
  expect(errors).toEqual([]);
});

test('使用手牌后立即离开手牌区，桌面展示后进入可见弃牌堆', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  const initialCount = await page.evaluate(() => {
    const player = document.querySelector('#player').player;
    player.blood = player.hero.life - 1;
    player.choice_card();
    return document.querySelectorAll('#cards > .player_card').length;
  });
  await clickHandCard(page, '桃');
  await page.locator('#ok').click();

  await expect(page.locator('#cards > .player_card')).toHaveCount(initialCount - 1);
  await expect(page.locator('#played_card_box .table_card')).toHaveCount(1);
  await expect(page.locator('#discard_pile_box .discard_card')).toHaveCount(1, { timeout: 2500 });
  await expect(page.locator('#played_card_box .table_card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('乐不思蜀进入目标判定区，并在开始结算时显示判定动画后移除状态', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);
  await removeNullifications(page);

  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const player = document.querySelector('#player').player;
    player.card[0].name = '乐不思蜀';
    player.choice_card();
  });
  await clickHandCard(page, '乐不思蜀');
  await page.locator('.role.target_available').first().click();
  await page.locator('#ok').click();

  const target = page.locator('.role').filter({
    has: page.locator(`.delayed_status[data-card-name="乐不思蜀"]`),
  });
  await expect(target).toHaveCount(1);

  await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const delayedTarget = bout.player.find((candidate) =>
      candidate.be_decision.some((pending) => pending.data.name === '乐不思蜀')
    );
    const pending = delayedTarget.be_decision.pop();
    bout.card.unshift(new window.sgs.Card('杀', 1, 7));
    window.sgs.interpreter.decision(bout, delayedTarget, pending);
  });
  await expect(page.locator('.delayed_status[data-card-name="乐不思蜀"]')).toHaveCount(0);
  await expect(page.locator('.judge_effect')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('无懈可击作为响应牌离开手牌，并明确展示被抵消的锦囊和目标反馈', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  const initialCount = await page.evaluate(() => {
    const bout = window.sgs.interface.bout;
    const player = document.querySelector('#player').player;
    const attacker = bout.player.find((candidate) => candidate !== player);
    const target = bout.player.find((candidate) => candidate !== player && candidate !== attacker);
    const trick = new window.sgs.Card('过河拆桥', 3, 3);
    player.card[0].name = '无懈可击';
    bout.opt = [new window.sgs.Operate('过河拆桥', attacker, target, trick)];
    const request = new window.sgs.Operate('无懈可击', target, player, '无懈可击');
    bout.choice = [request];
    player.ask_card(request);
    return document.querySelectorAll('#cards > .player_card').length;
  });
  await clickHandCard(page, '无懈可击');
  await page.locator('#ok').click();

  await expect(page.locator('#cards > .player_card')).toHaveCount(initialCount - 1);
  await expect(page.locator('.nullified_effect')).toContainText('抵消 过河拆桥');
  await expect(page.locator('.nullified_target')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.sgs.interface.bout.opt.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('扩展武将在选将时保留整卡图，对局内改用统一尺寸的裁切头像', async ({ page }) => {
  const errors = capturePageErrors(page);
  await startDeterministicGame(page);

  const paths = await page.evaluate(async () => {
    const bout = window.sgs.interface.bout;
    const human = document.querySelector('#player').player;
    const ai = bout.player.find((candidate) => candidate !== human);
    const caoren = window.sgs.HERO.find((hero) => hero.name === '曹仁');
    human.hero = caoren;
    ai.hero = caoren;
    window.sgs.interface.Set_RoleInfo(human);
    window.sgs.interface.Set_RoleInfo(ai, ai.dom);
    const humanImage = document.querySelector('#player_head_img');
    const aiImage = ai.dom.querySelector('.head_img img');
    await Promise.all([humanImage.decode(), aiImage.decode()]);
    return {
      choose: window.sgs.interface.heroImage('曹仁', 'hero'),
      human: humanImage.getAttribute('src'),
      humanSize: [humanImage.naturalWidth, humanImage.naturalHeight],
      ai: aiImage.getAttribute('src'),
      aiSize: [aiImage.naturalWidth, aiImage.naturalHeight],
    };
  });

  expect(paths.choose).toContain('/hero/caoren.jpg');
  expect(paths.human).toContain('/portrait/big/caoren.jpg');
  expect(paths.humanSize).toEqual([141, 144]);
  expect(paths.ai).toContain('/portrait/small/caoren.jpg');
  expect(paths.aiSize).toEqual([137, 62]);
  expect(errors).toEqual([]);
});
