const { test } = require('node:test');
const assert = require('node:assert/strict');
const { vm, source, Clock, backgroundHarness } = require('./helpers.cjs');

async function harness(options = {}) {
  const clock = new Clock();
  const bg = backgroundHarness(clock);
  const events = [];
  let items = ['a', 'b'];
  let menu = false;
  let removeKey;
  let loading = false;
  let scrolls = 0;
  let securityError = false;
  const record = (type, key) => events.push({ type, key, at: clock.now });
  const dom = {
    assertPage() { if (securityError) throw new Error('Verificación de Facebook.'); },
    inspect: () => ({ ready: true }),
    loading: () => loading,
    openMenus: () => menu ? [{}] : [],
    clickable: () => true,
    cards: () => items.map((key) => ({ key, more: {
      scrollIntoView() { record('view', key); },
      click() { menu = true; removeKey = key; record('open', key); }
    } })),
    menuDelete() {
      if (!menu || options.missingDelete) return null;
      return { click() {
        record('delete', removeKey); menu = false; loading = true;
        if (options.securityError) securityError = true;
        if (!options.stuck) clock.setTimeout(() => {
          loading = false;
          if (!options.noProgress) items = items.filter((key) => key !== removeKey);
          record('removed', removeKey);
        }, 600);
      } };
    },
    deletionState: (key) => ({ removed: !items.includes(key), ready: !loading && !menu,
      hasList: true, empty: items.length === 0, signature: items.join(',') }),
    scrollMore() {
      record('scroll');
      if (options.moreOnScroll && scrolls++ === 0) {
        loading = true;
        clock.setTimeout(() => { items = ['c', 'd']; loading = false; record('loaded'); }, 600);
      }
    }
  };
  bg.setPageHandler(async (message) => message.type === 'inspect' ?
    { ok: true, inspection: { mode: 'saved', ready: true, empty: false, loaded: 2 } } : { ok: true });
  const started = await bg.request('start', { mode: 'saved', acknowledged: true,
    maxItems: options.maxItems ?? 0, delaySeconds: options.delaySeconds ?? 4 });
  assert.equal(started.ok, true, started.error);
  const sender = bg.pageSender();
  const run = (await bg.request('hello', {}, sender)).run;
  const context = vm.createContext({ FBSaved: dom, Date: clock.Date, setTimeout: clock.setTimeout });
  vm.runInContext(source('saved-content.js'), context);
  const send = async (type, fields) => {
    const result = await bg.request(type, fields, sender);
    if (!result.ok) throw new Error(result.error);
    return result;
  };
  const done = context.runFBSaved(run, { send, alive() {}, pause: (ms) => new Promise((resolve) => clock.setTimeout(resolve, ms)) })
    .catch((error) => bg.request('fail', { id: run.id, text: error.message }, sender));
  await clock.flush();
  return { bg, clock, events, done };
}

test('saved mode removes sequentially, scrolls to load more, and never reloads', async () => {
  const h = await harness({ moreOnScroll: true });
  await h.clock.until(() => h.bg.run.status === 'finished');
  await h.done;
  assert.equal(h.bg.run.processed, 4);
  assert.equal(h.bg.run.planned, 4);
  assert.equal(h.bg.reloads.length, 0);
  assert.deepEqual(h.events.filter((e) => e.type === 'delete').map((e) => e.key), ['a', 'b', 'c', 'd']);
  const deletions = h.events.filter((e) => e.type === 'delete');
  const removed = h.events.filter((e) => e.type === 'removed');
  for (let i = 1; i < deletions.length; i++) assert.ok(deletions[i].at - removed[i - 1].at >= 5000);
});

test('saved mode respects the item limit and a custom interval', async () => {
  const h = await harness({ maxItems: 2, delaySeconds: 7, moreOnScroll: true });
  await h.clock.until(() => h.bg.run.status === 'finished');
  assert.equal(h.bg.run.processed, 2);
  assert.equal(h.events.some((e) => e.type === 'scroll'), false);
  const deletions = h.events.filter((e) => e.type === 'delete');
  const removed = h.events.find((e) => e.type === 'removed');
  assert.ok(deletions[1].at - removed.at >= 8000);
});

test('missing removal evidence times out without counting or retrying', async () => {
  const h = await harness({ noProgress: true });
  await h.clock.until(() => h.bg.run.status === 'blocked');
  assert.equal(h.bg.run.processed, 0);
  assert.equal(h.events.filter((e) => e.type === 'delete').length, 1);
  assert.equal(h.bg.reloads.length, 0);
});

test('a missing Delete menu action prevents every destructive click', async () => {
  const h = await harness({ missingDelete: true });
  await h.clock.until(() => h.bg.run.status === 'blocked');
  assert.equal(h.events.filter((e) => e.type === 'delete').length, 0);
});

test('Stop during the interval prevents the next item and cannot be overwritten', async () => {
  const h = await harness();
  await h.clock.until(() => h.bg.run.processed === 1);
  assert.equal((await h.bg.request('stop')).ok, true);
  let settled = false;
  h.done.then(() => { settled = true; });
  await h.clock.until(() => settled);
  assert.equal(h.bg.run.status, 'stopped');
  assert.equal(h.events.filter((e) => e.type === 'delete').length, 1);
});

test('a security message prevents subsequent items', async () => {
  const h = await harness({ securityError: true });
  await h.clock.until(() => h.bg.run.status === 'blocked');
  assert.equal(h.bg.run.processed, 0);
  assert.equal(h.events.filter((e) => e.type === 'delete').length, 1);
});

test('saved protocol validates settings, owner, progress evidence, duplicates and reloads', async () => {
  const bg = backgroundHarness();
  bg.setPageHandler(async () => ({ ok: true, inspection: { mode: 'saved', ready: true, empty: false } }));
  const settings = { mode: 'saved', acknowledged: true, maxItems: 2, delaySeconds: 4 };
  for (const invalid of [{ mode: 'other' }, { acknowledged: false }, { delaySeconds: 0 }, { delaySeconds: 1.5 }, { maxItems: -1 }]) {
    assert.equal((await bg.request('start', { ...settings, ...invalid })).ok, false);
  }
  assert.equal((await bg.request('open', { mode: 'saved' })).ok, true);
  assert.equal(bg.navigations.at(-1).url, 'https://www.facebook.com/saved/');
  assert.equal((await bg.request('start', settings)).ok, true);
  const sender = bg.pageSender();
  const run = (await bg.request('hello', {}, sender)).run;
  const request = (type, fields = {}, from = sender) => bg.request(type, { id: run.id, ...fields }, from);
  assert.equal((await request('saved-plan', { total: 2 }, bg.pageSender('other'))).ok, false);
  assert.equal((await request('saved-plan', { total: 2 })).ok, true);
  assert.equal((await request('saved-plan', { total: 3 })).ok, false);
  await request('phase', { phase: 'selecting' });
  assert.equal((await request('saved-pending', { key: 'a' })).ok, true);
  assert.equal((await request('saved-completed', { key: 'a', evidenceVerified: true })).ok, false);
  await request('phase', { phase: 'waiting' });
  assert.equal((await request('saved-completed', { key: 'a', evidenceVerified: false })).ok, false);
  assert.equal((await request('saved-completed', { key: 'b', evidenceVerified: true })).ok, false);
  assert.equal((await request('saved-completed', { key: 'a', evidenceVerified: true })).ok, true);
  assert.equal((await request('saved-completed', { key: 'a', evidenceVerified: true })).ok, false);
  assert.equal((await request('reload', { evidenceVerified: true, completionKind: 'empty' })).ok, false);
  assert.equal(bg.run.processed, 1);
  const reloaded = await bg.request('hello', {}, bg.pageSender('new-document'));
  assert.equal(reloaded.run, null);
  assert.equal(bg.run.status, 'blocked');
});

test('all shipped version declarations agree on the major release', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const json = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file)));
  assert.equal(json('extension/manifest.json').version, '1.0.0');
  assert.equal(json('package.json').version, '1.0.0');
  assert.equal(json('package-lock.json').version, '1.0.0');
  assert.equal(json('package-lock.json').packages[''].version, '1.0.0');
});
