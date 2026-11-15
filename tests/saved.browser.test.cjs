const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const fixture = require('./saved-fixture.cjs');

async function setup(t, fixtureOptions = {}, url = 'https://www.facebook.com/saved/') {
  const extensionPath = path.resolve(__dirname, '..', 'extension');
  const options = { headless: true, channel: 'chromium', ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`
    ] };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const context = await chromium.launchPersistentContext('', options);
  t.after(() => context.close());
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (request.url().startsWith('chrome-extension://')) await route.continue();
    else if (request.isNavigationRequest() && new URL(request.url()).origin === 'https://www.facebook.com') {
      await route.fulfill({ contentType: 'text/html', body: fixture(fixtureOptions) });
    } else await route.abort();
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const controller = await context.newPage();
  await controller.goto(worker.url().replace('/background.js', '/popup.html'));
  const page = await context.newPage();
  await page.goto(url);
  await page.bringToFront();
  const request = (type, fields = {}) => controller.evaluate((message) => chrome.runtime.sendMessage(message),
    { app: 'fb-unsave-all', mode: 'saved', type, ...fields });
  for (let i = 0; i < 50; i++) {
    const result = await request('inspect');
    if (result.ok || !/Recarga Facebook/.test(result.error)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { controller, page, request,
    start: (fields = {}) => request('start', { acknowledged: true, maxItems: 0, delaySeconds: 1, ...fields }),
    events: () => page.evaluate(() => window.events),
    async untilStatus(status, timeout = 30000) {
      const deadline = Date.now() + timeout;
      let run;
      while (Date.now() < deadline) {
        run = (await request('status')).run;
        if (run?.status === status) return run;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Expected ${status}; got ${JSON.stringify(run)}`);
    }
  };
}

describe('Saved page extension fixtures', { concurrency: 3 }, () => {
  test('different saved products sharing a generic Facebook link remain distinct through rerenders', { timeout: 20000 }, async (t) => {
    const h = await setup(t, {
      realControls: true,
      nestedMain: true,
      genericLinkIds: [1, 2],
      savedItemMenuIds: [2],
      twoButtonIds: [1, 2],
      changingPrice: true
    });
    const inspection = await h.request('inspect');
    assert.equal(inspection.ok, true, inspection.error);
    assert.equal(inspection.inspection.loaded, 3);
    assert.equal(inspection.inspection.ready, true);
    assert.equal((await h.start({ maxItems: 3 })).ok, true);
    assert.equal((await h.untilStatus('finished', 15000)).processed, 3);
    const events = await h.events();
    assert.deepEqual(
      events.filter((event) => event.type === 'delete').map((event) => event.id),
      [1, 2, 3]
    );
    assert.equal(events.filter((event) => event.type === 'wrong-action').length, 0);
  });

  test('generic links with indistinguishable titles remain blocked before opening menus', { timeout: 10000 }, async (t) => {
    const h = await setup(t, {
      realControls: true,
      genericLinkIds: [1, 2],
      savedItemMenuIds: [1, 2],
      twoButtonIds: [1, 2],
      identicalGenericTitles: true
    });
    const result = await h.start();
    assert.equal(result.ok, false);
    assert.match(result.error, /identidades ambiguas/);
    assert.equal(
      (await h.events()).filter((event) => ['open', 'delete'].includes(event.type)).length,
      0
    );
  });

  test('a price update alone cannot confirm removal of a generic-link product', { timeout: 40000 }, async (t) => {
    const h = await setup(t, {
      realControls: true,
      genericLinkIds: [1, 2],
      savedItemMenuIds: [1, 2],
      twoButtonIds: [1, 2],
      changingPrice: true,
      noProgress: true
    });
    assert.equal((await h.start()).ok, true);
    const run = await h.untilStatus('blocked', 35000);
    assert.equal(run.processed, 0);
    assert.match(run.message, /No se pudo verificar la eliminación/);
    assert.equal((await h.events()).filter((event) => event.type === 'delete').length, 1);
  });

  test('mixed cards with two or three buttons recognize the saved-item More label and process every card', { timeout: 20000 }, async (t) => {
    const h = await setup(t, {
      realControls: true,
      nestedMain: true,
      singularHeading: true,
      footerLoading: true,
      twoButtonIds: [2, 3],
      savedItemMenuIds: [2]
    });
    assert.equal(await h.page.locator('[data-share]').count(), 1);
    assert.equal(
      await h.page.locator('[data-more="2"]').getAttribute('aria-label'),
      'Más opciones para el elemento guardado'
    );

    const result = await h.request('inspect');
    assert.equal(result.ok, true, result.error);
    assert.equal(result.inspection.loaded, 3);
    assert.equal(result.inspection.ready, true);
    assert.equal((await h.start({ maxItems: 3 })).ok, true);
    assert.equal((await h.untilStatus('finished', 15000)).processed, 3);

    const events = await h.events();
    assert.deepEqual(
      events.filter((event) => event.type === 'delete').map((event) => event.id),
      [1, 2, 3]
    );
    assert.equal(events.filter((event) => event.type === 'wrong-action').length, 0);
  });

  test('a two-button card with an unknown dialog action is refused before opening any menu', { timeout: 10000 }, async (t) => {
    const h = await setup(t, {
      realControls: true,
      twoButtonIds: [2],
      unknownMenuIds: [2]
    });
    const result = await h.start();
    assert.equal(result.ok, false);
    assert.match(result.error, /No se pudo aislar el menú de tres puntos/);
    assert.equal(
      (await h.events()).filter((event) => ['open', 'delete', 'wrong-action'].includes(event.type)).length,
      0
    );
  });

  test('observed Facebook labels with post context and dialog popup attributes recognize the actual three actions', { timeout: 15000 }, async (t) => {
    const h = await setup(t, { realControls: true, nestedMain: true, singularHeading: true, footerLoading: true });
    const result = await h.request('inspect');
    assert.equal(result.ok, true, result.error);
    assert.equal(result.inspection.loaded, 3);
    assert.equal(result.inspection.loading, false);
    assert.equal(result.inspection.ready, true);
    assert.equal((await h.start({ maxItems: 2 })).ok, true);
    assert.equal((await h.untilStatus('finished', 10000)).processed, 2);
    const events = await h.events();
    assert.deepEqual(events.filter((e) => e.type === 'delete').map((e) => e.id), [1, 2]);
    assert.equal(events.filter((e) => e.type === 'wrong-action').length, 0);
  });

  test('the persistent footer sentinel permits verifying the last loaded card and scrolling to fetch more', { timeout: 40000 }, async (t) => {
    const h = await setup(t, { realControls: true, nestedMain: true, footerLoading: true, moreOnScroll: true });
    assert.equal((await h.start({ maxItems: 4 })).ok, true);
    const run = await h.untilStatus('finished', 35000);
    assert.equal(run.processed, 4);
    const events = await h.events();
    assert.ok(events.some((e) => e.type === 'loaded'));
    assert.equal(events.filter((e) => e.type === 'wrong-action').length, 0);
  });
  test('Guardado with two sibling mains recognizes the card feed and ignores collection controls elsewhere', { timeout: 15000 }, async (t) => {
    const h = await setup(t, { otherMain: true, unrelatedAdd: true, singularHeading: true });
    assert.equal(await h.page.locator('main,[role="main"]').count(), 2);
    await h.controller.evaluate(() => document.getElementById('inspect').click());
    await h.controller.waitForFunction(() => document.getElementById('inspection').dataset.state === 'ready');
    assert.match(await h.controller.locator('#inspection').innerText(), /3 tarjetas reconocidas/);
    assert.equal((await h.start({ maxItems: 2 })).ok, true);
    const run = await h.untilStatus('finished', 10000);
    assert.equal(run.processed, 2);
    const events = await h.events();
    assert.deepEqual(events.filter((e) => e.type === 'delete').map((e) => e.id), [1, 2]);
    assert.equal(events.filter((e) => e.type === 'wrong-action').length, 0);
  });

  test('nested mains describe one feed rather than duplicate cards', { timeout: 15000 }, async (t) => {
    const h = await setup(t, { nestedMain: true });
    assert.equal(await h.page.locator('main,[role="main"]').count(), 2);
    const result = await h.request('inspect');
    assert.equal(result.ok, true, result.error);
    assert.equal(result.inspection.loaded, 3);
    assert.equal((await h.start({ maxItems: 2 })).ok, true);
    assert.equal((await h.untilStatus('finished', 10000)).processed, 2);
  });

  test('the recognized feed survives a menu hiding it and its last card disappearing beside another main', { timeout: 12000 }, async (t) => {
    const h = await setup(t, { otherMain: true, hiddenMain: true, initial: 1, singularHeading: true });
    assert.equal((await h.start({ maxItems: 1 })).ok, true);
    assert.equal((await h.untilStatus('finished', 9000)).processed, 1);
    assert.equal((await h.events()).filter((e) => e.type === 'wrong-action').length, 0);
  });

  test('two independent card feeds are refused before any menu is opened', { timeout: 10000 }, async (t) => {
    const h = await setup(t, { duplicateMain: true });
    const result = await h.start();
    assert.equal(result.ok, false);
    assert.match(result.error, /2 áreas independientes/);
    assert.equal((await h.events()).filter((e) => ['open', 'delete'].includes(e.type)).length, 0);
  });

  test('cards outside a nested feed make the scope ambiguous rather than silently omitting them', { timeout: 10000 }, async (t) => {
    const h = await setup(t, { splitMain: true });
    const result = await h.start();
    assert.equal(result.ok, false);
    assert.match(result.error, /fuera del área identificada/);
    assert.equal((await h.events()).filter((e) => ['open', 'delete'].includes(e.type)).length, 0);
  });

  test('an explicitly empty feed is recognized separately from its collections sidebar', { timeout: 10000 }, async (t) => {
    const h = await setup(t, { otherMain: true, initial: 0 });
    const result = await h.request('inspect');
    assert.equal(result.ok, true, result.error);
    assert.equal(result.inspection.empty, true);
    assert.equal(result.inspection.ready, false);
    assert.equal((await h.start()).ok, false);
  });

  test('busy state on an outer main still protects a nested feed', { timeout: 10000 }, async (t) => {
    const h = await setup(t, { nestedMain: true, busyOuter: true });
    const result = await h.request('inspect');
    assert.equal(result.ok, true, result.error);
    assert.equal(result.inspection.loading, true);
    assert.equal(result.inspection.ready, false);
    assert.equal((await h.start()).ok, false);
  });
  test('the actual Inspect button shows immediate progress and its result without deleting', { timeout: 10000 }, async (t) => {
    const h = await setup(t);
    const pending = await h.controller.evaluate(() => {
      document.getElementById('inspect').click();
      return { state: document.getElementById('inspection').dataset.state, disabled: document.getElementById('inspect').disabled };
    });
    assert.deepEqual(pending, { state: 'pending', disabled: true });
    await h.controller.waitForFunction(() => document.getElementById('inspection').dataset.state === 'ready');
    assert.match(await h.controller.locator('#inspection').innerText(), /3 tarjetas reconocidas/);
    assert.equal(await h.controller.locator('#inspect').isEnabled(), true);
    assert.equal((await h.events()).filter((e) => e.type === 'delete').length, 0);
  });

  test('a rejected page displays the exact inspection error beside the button in a popup-sized viewport', { timeout: 10000 }, async (t) => {
    const h = await setup(t, {}, 'https://www.facebook.com/saved/?collection_id=123');
    await h.controller.setViewportSize({ width: 380, height: 600 });
    await h.controller.evaluate(() => document.getElementById('inspect').click());
    await h.controller.waitForFunction(() => document.getElementById('inspection').dataset.state === 'error');
    assert.match(await h.controller.locator('#inspection').innerText(), /No se pudo comprobar.*colección/);
    const bounds = await h.controller.locator('#inspection').boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 600);
    assert.equal(await h.controller.locator('#inspect').isEnabled(), true);
    assert.equal((await h.events()).filter((e) => e.type === 'delete').length, 0);
  });
  test('busy state on the main container prevents starting a deletion', { timeout: 10000 }, async (t) => {
    const h = await setup(t, { rootBusy: true });
    const inspection = (await h.request('inspect')).inspection;
    assert.equal(inspection.loading, true);
    assert.equal(inspection.ready, false);
    assert.equal((await h.start()).ok, false);
    assert.equal((await h.events()).filter((e) => e.type === 'delete').length, 0);
  });
  test('scroll discovery uses the internal feed container after its last card disappears', { timeout: 40000 }, async (t) => {
    const h = await setup(t, { moreOnScroll: true, nestedScroll: true });
    assert.equal((await h.start({ maxItems: 4 })).ok, true);
    const run = await h.untilStatus('finished', 35000);
    assert.equal(run.processed, 4);
    assert.ok((await h.events()).some((e) => e.type === 'loaded'));
  });
  test('removes one at a time, survives full rerenders, waits the custom interval and scrolls for more', { timeout: 40000 }, async (t) => {
    const h = await setup(t, { moreOnScroll: true });
    assert.equal((await h.request('inspect')).inspection.loaded, 3);
    assert.equal((await h.start()).ok, true);
    const run = await h.untilStatus('finished', 35000);
    assert.equal(run.processed, 5);
    const events = await h.events();
    assert.deepEqual(events.filter((e) => e.type === 'delete').map((e) => e.id), [1, 2, 3, 4, 5]);
    assert.equal(events.filter((e) => e.type === 'wrong-action').length, 0);
    assert.equal(events.filter((e) => e.type === 'page-load').length, 1);
    assert.ok(events.some((e) => e.type === 'loaded'));
    const opened = events.filter((e) => e.type === 'open');
    const removed = events.filter((e) => e.type === 'removed');
    for (let i = 1; i < opened.length; i++) assert.ok(opened[i].at - removed[i - 1].at >= 1900);
  });

  test('unlabelled third button and an accessibility-hidden background use only the new menu Delete', { timeout: 15000 }, async (t) => {
    const h = await setup(t, { unlabelled: true, hiddenMain: true });
    assert.equal((await h.start({ maxItems: 1 })).ok, true);
    const run = await h.untilStatus('finished', 10000);
    assert.equal(run.processed, 1);
    assert.equal((await h.events()).filter((e) => e.type === 'wrong-action').length, 0);
  });

  test('the popup defaults to Saved, 4 seconds, and correctly switches configuration fields', { timeout: 10000 }, async (t) => {
    const h = await setup(t);
    assert.equal(await h.controller.locator('#mode').inputValue(), 'saved');
    assert.equal(await h.controller.locator('#item-delay').inputValue(), '4');
    assert.equal(await h.controller.locator('#saved-fields').isVisible(), true);
    await h.controller.locator('#mode').selectOption('activity');
    assert.equal(await h.controller.locator('#activity-fields').isVisible(), true);
    assert.equal(await h.controller.locator('#items').isDisabled(), true);
    await h.controller.locator('#mode').selectOption('saved');
    assert.equal(await h.controller.locator('#delay').isDisabled(), true);
  });

  test('a different Saved subpage or collection is refused without clicks', { timeout: 10000 }, async (t) => {
    const h = await setup(t, {}, 'https://www.facebook.com/saved/?collection_id=123');
    const result = await h.start();
    assert.equal(result.ok, false);
    assert.match(result.error, /colección/);
    assert.equal((await h.events()).filter((e) => e.type === 'delete').length, 0);
  });

  test('a similarly named menu action is refused even when Delete exists elsewhere', { timeout: 18000 }, async (t) => {
    const h = await setup(t, { missingDelete: true });
    assert.equal((await h.start()).ok, true);
    const run = await h.untilStatus('blocked', 15000);
    assert.equal(run.processed, 0);
    assert.equal((await h.events()).filter((e) => ['delete', 'wrong-action'].includes(e.type)).length, 0);
  });

  test('Stop during the interval prevents the next card', { timeout: 12000 }, async (t) => {
    const h = await setup(t);
    assert.equal((await h.start({ delaySeconds: 4 })).ok, true);
    await h.page.waitForFunction(() => window.events.some((e) => e.type === 'removed'));
    assert.equal((await h.request('stop')).ok, true);
    const run = await h.untilStatus('stopped');
    assert.equal(run.status, 'stopped');
    await h.page.waitForTimeout(4500);
    assert.equal((await h.events()).filter((e) => e.type === 'delete').length, 1);
  });

  test('a Facebook security alert stops before the next card', { timeout: 10000 }, async (t) => {
    const h = await setup(t, { security: true });
    assert.equal((await h.start()).ok, true);
    const run = await h.untilStatus('blocked', 7000);
    assert.equal(run.processed, 0);
    assert.equal((await h.events()).filter((e) => e.type === 'delete').length, 1);
  });
});
