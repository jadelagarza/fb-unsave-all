const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const fixture = require('./fixture.cjs');
const extensionPath = path.resolve(__dirname, '..', 'extension');

async function setup(t, mode = 'normal') {
  const options = {
    headless: true,
    channel: 'chromium',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
  };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const context = await chromium.launchPersistentContext('', options);
  t.after(() => context.close());
  // Intercept every HTTP request. These tests never contact Facebook or use a real account.
  await context.route('**/*', async (route) => {
    const request = route.request();
    if (request.url().startsWith('chrome-extension://')) await route.continue();
    else if (request.isNavigationRequest() && new URL(request.url()).origin === 'https://www.facebook.com') {
      await route.fulfill({ contentType: 'text/html', body: fixture(mode) });
    } else await route.abort();
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const controller = await context.newPage();
  await controller.goto(worker.url().replace('/background.js', '/popup.html'));
  const page = await context.newPage();
  await page.goto('https://www.facebook.com/me/allactivity/?category_key=SAVEDFORLATER');
  await page.bringToFront();
  const request = (type, fields = {}) => controller.evaluate((message) => chrome.runtime.sendMessage(message), { app: 'fb-unsave-all', type, ...fields });
  // Wait for the manifest content script to be ready, without triggering a deletion.
  for (let i = 0; i < 50; i++) {
    const result = await request('inspect');
    if (result.ok || !/Recarga Facebook/.test(result.error)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { context, controller, page, request,
    async untilStatus(status, timeout = 30000) {
      const deadline = Date.now() + timeout;
      let run;
      while (Date.now() < deadline) {
        run = (await request('status')).run;
        if (run?.status === status) return run;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(`Expected ${status}; got ${JSON.stringify(run)}`);
    },
    events: () => page.evaluate(() => JSON.parse(sessionStorage.getItem('events') || '[]'))
  };
}

test('installed extension processes two real DOM batches and reloads only after loading ends', { timeout: 45000 }, async (t) => {
  const h = await setup(t);
  const inspection = await h.request('inspect');
  assert.equal(inspection.inspection.ready, true);
  const started = await h.request('start', { acknowledged: true, maxBatches: 100, delaySeconds: 3 });
  assert.equal(started.ok, true, started.error);
  const run = await h.untilStatus('finished');
  assert.equal(run.batches, 2);
  assert.equal(run.processed, 40);
  const events = await h.events();
  assert.equal(events.filter((event) => event.event === 'page-load').length, 3);
  assert.equal(events.filter((event) => event.event === 'confirm-delete').length, 2);
  for (let index = 1; index < events.length; index++) {
    if (events[index].event === 'page-load') {
      assert.equal(events[index - 1].event, 'loading-end');
      assert.ok(events[index].at - events[index - 1].at >= 1400);
    }
  }
});

test('installed extension rejects another activity-log category', { timeout: 15000 }, async (t) => {
  const h = await setup(t, 'wrong-category');
  const response = await h.request('start', { acknowledged: true, maxBatches: 100, delaySeconds: 3 });
  assert.equal(response.ok, false);
  assert.match(response.error, /título/);
  assert.equal((await h.events()).some((event) => event.event === 'confirm-delete'), false);
});

test('installed extension stops when there is no loading indicator and never reloads blindly', { timeout: 30000 }, async (t) => {
  const h = await setup(t, 'no-loader');
  assert.equal((await h.request('start', { acknowledged: true, maxBatches: 100, delaySeconds: 3 })).ok, true);
  const run = await h.untilStatus('blocked');
  assert.match(run.message, /No se observó/);
  assert.equal((await h.events()).filter((event) => event.event === 'page-load').length, 1);
});

test('installed extension recognizes an unchanged list after a completed reload', { timeout: 20000 }, async (t) => {
  const h = await setup(t, 'no-progress');
  assert.equal((await h.request('start', { acknowledged: true, maxBatches: 100, delaySeconds: 3 })).ok, true);
  const run = await h.untilStatus('blocked');
  assert.match(run.message, /sigue igual/);
  assert.equal((await h.events()).filter((event) => event.event === 'confirm-delete').length, 1);
});

test('installed extension stops on an actual security-alert element', { timeout: 15000 }, async (t) => {
  const h = await setup(t, 'security');
  assert.equal((await h.request('start', { acknowledged: true, maxBatches: 100, delaySeconds: 3 })).ok, true);
  const run = await h.untilStatus('blocked');
  assert.match(run.message, /seguridad/);
  assert.equal((await h.events()).filter((event) => event.event === 'page-load').length, 1);
});
