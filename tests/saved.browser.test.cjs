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
