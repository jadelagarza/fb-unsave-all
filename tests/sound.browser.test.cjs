const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const fixture = require('./saved-fixture.cjs');

async function setup(t, url = 'https://www.facebook.com/saved/') {
  const extension = path.resolve(__dirname, '..', 'extension');
  const options = {
    headless: true, channel: 'chromium', ignoreDefaultArgs: ['--disable-extensions'],
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  };
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  const context = await chromium.launchPersistentContext('', options);
  t.after(() => context.close());
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.url().startsWith('chrome-extension://') || request.url().startsWith('data:audio/')) await route.continue();
    else if (request.isNavigationRequest() && new URL(request.url()).origin === 'https://www.facebook.com') {
      await route.fulfill({ contentType: 'text/html', body: fixture() });
    } else await route.abort();
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const base = worker.url().replace('background.js', '');
  const controller = await context.newPage();
  await controller.goto(base + 'popup.html');
  const page = await context.newPage();
  await page.goto(url);
  await page.bringToFront();
  const read = () => worker.evaluate(() => chrome.storage.session.get(['run', 'errorSound']));
  async function until(predicate, timeout = 12000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const state = await read();
      if (predicate(state)) return state;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Expected audio state; got ' + JSON.stringify(await read()));
  }
  const contexts = () => worker.evaluate(url => chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url]
  }), base + 'offscreen.html');
  return { context, worker, controller, page, base, read, until, contexts };
}

test('a real offscreen media player starts after a fixture error with the popup closed; reopening is silent', { timeout: 25000 }, async t => {
  const h = await setup(t);
  await h.page.waitForTimeout(300);
  const started = await h.controller.evaluate(() => chrome.runtime.sendMessage({
    app: 'fb-unsave-all', type: 'start', mode: 'saved', acknowledged: true, maxItems: 3, delaySeconds: 4
  }));
  assert.equal(started.ok, true, started.error);
  await h.until(state => state.run?.processed === 1);
  assert.equal((await h.contexts()).length, 0);
  await h.controller.close();
  await h.page.evaluate(() => {
    const alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    alert.textContent = 'Confirma tu identidad';
    document.body.append(alert);
  });
  const failed = await h.until(state => state.run?.status === 'blocked' && state.errorSound?.startedAt);
  assert.equal(failed.run.processed, 1);
  assert.equal(failed.errorSound.warning, '');
  assert.equal(failed.errorSound.eventId, 'run-' + failed.run.id);
  assert.equal((await h.contexts()).length, 1);
  assert.equal(h.controller.isClosed(), true);
  assert.equal((await h.page.evaluate(() => events.filter(e => e.type === 'delete'))).length, 1);
  const reopened = await h.context.newPage();
  await reopened.goto(h.base + 'popup.html');
  await reopened.getByText('Requiere revisión', { exact: true }).waitFor();
  await reopened.waitForTimeout(250);
  assert.equal((await h.read()).errorSound.eventId, failed.errorSound.eventId);
});

test('panel errors reuse the audio document; Test sound recreates an expired document without cleaning', { timeout: 25000 }, async t => {
  const h = await setup(t, 'https://www.facebook.com/saved/?collection_id=123');
  let previous;
  for (let i = 0; i < 2; i++) {
    await h.controller.getByRole('button', { name: '2. Comprobar esta página', exact: true }).click();
    const state = await h.until(state => state.errorSound?.startedAt && state.errorSound.eventId !== previous);
    assert.equal(state.errorSound.warning, '');
    assert.match(state.errorSound.eventId, /^action-/);
    assert.equal(state.run, undefined);
    previous = state.errorSound.eventId;
  }
  const old = await h.contexts();
  assert.equal(old.length, 1);
  await h.worker.evaluate(() => chrome.offscreen.closeDocument());
  assert.equal((await h.contexts()).length, 0);
  await h.controller.getByRole('button', { name: 'Probar sonido de error', exact: true }).click();
  await h.controller.getByText(/Aviso reproducido/).waitFor();
  const state = await h.until(state => state.errorSound?.startedAt && /^test-/.test(state.errorSound.eventId));
  assert.equal(state.errorSound.warning, '');
  const current = await h.contexts();
  assert.equal(current.length, 1);
  assert.notEqual(current[0].documentId, old[0].documentId);
  assert.equal((await h.page.evaluate(() => events.filter(e => e.type === 'delete'))).length, 0);
});
