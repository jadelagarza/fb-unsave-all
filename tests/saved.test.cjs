const { test } = require('node:test');
const assert = require('node:assert/strict');
const { vm, source, Clock, backgroundHarness } = require('./helpers.cjs');

async function harness(options = {}) {
  const clock = new Clock();
  const bg = backgroundHarness(clock);
  bg.setTabUrl("https://www.facebook.com/saved/");
  const events = [];
  let items = options.items || ['a', 'b'];
  const anonymousIds = new Set(options.anonymousIds || []);
  const nodes = new Map();
  let menu = false;
  let removeKey;
  let loading = false;
  let scrolls = 0;
  let securityError = false;
  let reclassified = false;
  const record = (type, key) => events.push({ type, key, at: clock.now });
  const knownKeys = () => items.filter((key) => !anonymousIds.has(key)).sort();
  const anonymousCount = () => items.filter((key) => anonymousIds.has(key)).length;
  const sameKeys = (keys) => JSON.stringify(knownKeys()) === JSON.stringify(keys);
  function moreFor(key) {
    if (!nodes.has(key)) nodes.set(key, {
      scrollIntoView() { record('view', key); },
      click() { menu = true; removeKey = key; record('open', key); }
    });
    return nodes.get(key);
  }
  const dom = {
    assertPage() { if (securityError) throw new Error('Verificación de Facebook.'); },
    inspect: () => ({ ready: true }),
    loading: () => loading,
    moreLoading: () => loading,
    openMenus: () => menu ? [{}] : [],
    clickable: () => true,
    rememberRemoved() {},
    cards: () => items.map((key) => ({
      key: anonymousIds.has(key) ? null : key,
      ...(reclassified && ['b', 'c'].includes(key) ? { repeatedKey: 'b' } : {}),
      anonymous: anonymousIds.has(key), testId: key, more: moreFor(key)
    })),
    menuDelete() {
      if (!menu || options.missingDelete) return null;
      return { click() {
        record('delete', removeKey); menu = false; loading = true;
        if (options.securityError) securityError = true;
        if (!options.stuck) clock.setTimeout(() => {
          loading = false;
          if (options.identifyInsteadOfDelete) anonymousIds.delete(removeKey);
          else if (!options.noProgress) items = items.filter((key) => key !== removeKey);
          if (options.removePeerOnDelete) items = items.filter((key) => key !== options.removePeerOnDelete);
          record('removed', removeKey);
        }, 600);
      } };
    },
    captureAnonymous: () => ({ kind: 'anonymous', groups: [], beforeAnonymous: anonymousCount(), identifiedKeys: knownKeys() }),
    anonymousTargetReady: (card, snapshot) => items.includes(card.testId) && anonymousIds.has(card.testId) &&
      anonymousCount() === snapshot.beforeAnonymous && sameKeys(snapshot.identifiedKeys),
    deletionState: (target) => {
      const peersUnchanged = target?.kind === 'anonymous' && sameKeys(target.identifiedKeys);
      return {
        removed: target?.kind === 'anonymous'
          ? anonymousCount() === target.beforeAnonymous - 1 && peersUnchanged
          : !items.includes(target),
        completionKind: 'anonymous-list', reason: loading ? 'loading' : options.noProgress ? 'target-present' : 'references-lost',
        anonymousAfter: anonymousCount(), peersUnchanged, ready: !loading && !menu,
        hasList: true, empty: items.length === 0, signature: items.join(',')
      };
    },
    scrollMore() {
      record('scroll');
      if (options.moreOnScroll && scrolls++ === 0) {
        loading = true;
        clock.setTimeout(() => { items = ['c', 'd']; loading = false; record('loaded'); }, 600);
      }
    }
  };
  bg.setPageHandler(async (message) => message.type === 'inspect' ?
    { ok: true, inspection: { mode: 'saved', pageUrl: 'https://www.facebook.com/saved/', collection: false, ready: true, empty: false, loaded: 2 } } : { ok: true });
  const started = await bg.request('start', { mode: 'saved', acknowledged: true,
    maxItems: options.maxItems ?? 0, delaySeconds: options.delaySeconds ?? 4 });
  assert.equal(started.ok, true, started.error);
  const sender = bg.pageSender();
  const run = (await bg.request('hello', {}, sender)).run;
  const context = vm.createContext({ FBSaved: dom, Date: clock.Date, setTimeout: clock.setTimeout });
  vm.runInContext(source('saved-content.js'), context);
  const send = async (type, fields) => {
    if (options.repeatDuringCooldown && !reclassified && type === 'phase' && fields.phase === 'cooldown') {
      reclassified = true;
      anonymousIds.add('b');
      anonymousIds.add('c');
      items.push('c');
    }
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

test('multiple anonymous cards are counted individually and do not prevent processing identified peers', async () => {
  const h = await harness({ items: ['a', 'b', 'c'], anonymousIds: ['a', 'b'], maxItems: 3 });
  await h.clock.until(() => h.bg.run.status === 'finished');
  assert.equal(h.bg.run.processed, 3);
  assert.equal(h.bg.run.planned, 3);
  assert.deepEqual(h.events.filter((event) => event.type === 'delete').map((event) => event.key), ['a', 'b', 'c']);
  assert.equal(h.bg.reloads.length, 0);
});

test('a pending card becoming repeated during cooldown stays bound to its own menu and is counted once', async () => {
  const h = await harness({ repeatDuringCooldown: true, delaySeconds: 0.3 });
  await h.clock.until(() => h.bg.run.status === 'finished');
  await h.done;
  assert.equal(h.bg.run.processed, 3);
  assert.equal(h.bg.run.planned, 3);
  assert.deepEqual(h.events.filter(event => event.type === 'open').map(event => event.key), ['a', 'b', 'c']);
  assert.deepEqual(h.events.filter(event => event.type === 'delete').map(event => event.key), ['a', 'b', 'c']);
  assert.equal(h.bg.reloads.length, 0);
});

test('an anonymous card that remains is not counted or retried', async () => {
  const h = await harness({ anonymousIds: ['a'], noProgress: true });
  await h.clock.until(() => h.bg.run.status === 'blocked');
  assert.equal(h.bg.run.processed, 0);
  assert.equal(h.events.filter((event) => event.type === 'delete').length, 1);
});

test('a blank card gaining an identity is not mistaken for a removal', async () => {
  const h = await harness({ anonymousIds: ['a'], identifyInsteadOfDelete: true });
  await h.clock.until(() => h.bg.run.status === 'blocked');
  assert.equal(h.bg.run.processed, 0);
  assert.equal(h.events.filter((event) => event.type === 'delete').length, 1);
});

test('a simultaneous change to identified peers prevents counting an anonymous removal', async () => {
  const h = await harness({ anonymousIds: ['a'], removePeerOnDelete: 'b' });
  await h.clock.until(() => h.bg.run.status === 'blocked');
  assert.equal(h.bg.run.processed, 0);
  assert.equal(h.events.filter((event) => event.type === 'delete').length, 1);
});

test('Stop during an anonymous removal cannot be overwritten by a later completion', async () => {
  const h = await harness({ anonymousIds: ['a'], stuck: true });
  await h.clock.until(() => h.events.some((event) => event.type === 'delete'));
  await h.bg.request('stop');
  let settled = false;
  h.done.then(() => { settled = true; });
  await h.clock.until(() => settled);
  assert.equal(h.bg.run.status, 'stopped');
  assert.equal(h.bg.run.processed, 0);
  assert.equal(h.events.filter((event) => event.type === 'delete').length, 1);
});

test('anonymous protocol requires a matching operation, a one-card decrease and unchanged peers', async () => {
  const bg = backgroundHarness();
  bg.setTabUrl("https://www.facebook.com/saved/");
  bg.setPageHandler(async () => ({ ok: true, inspection: { mode: 'saved', pageUrl: 'https://www.facebook.com/saved/', collection: false, ready: true, empty: false } }));
  await bg.request('start', { mode: 'saved', acknowledged: true, maxItems: 1, delaySeconds: 4 });
  const sender = bg.pageSender();
  const { run } = await bg.request('hello', {}, sender);
  const request = (type, fields = {}) => bg.request(type, { id: run.id, ...fields }, sender);
  await request('saved-plan', { total: 1 });
  await request('phase', { phase: 'selecting' });
  const pending = { kind: 'anonymous', key: 'anonymous-1', anonymousBefore: 3 };
  assert.equal((await request('saved-pending', { ...pending, anonymousBefore: 0 })).ok, false);
  assert.equal((await request('saved-pending', pending)).ok, true);
  await request('phase', { phase: 'waiting' });
  const complete = { kind: 'anonymous', key: 'anonymous-1', evidenceVerified: true, anonymousAfter: 2, peersUnchanged: true };
  assert.equal((await request('saved-completed', { ...complete, kind: 'identified' })).ok, false);
  assert.equal((await request('saved-completed', { ...complete, anonymousAfter: 3 })).ok, false);
  assert.equal((await request('saved-completed', { ...complete, anonymousAfter: 1 })).ok, false);
  assert.equal((await request('saved-completed', { ...complete, peersUnchanged: false })).ok, false);
  assert.equal((await request('saved-completed', complete)).ok, true);
  assert.equal((await request('saved-completed', complete)).ok, false);
  assert.equal(bg.run.processed, 1);
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
  bg.setTabUrl("https://www.facebook.com/saved/");
  bg.setPageHandler(async () => ({ ok: true, inspection: { mode: 'saved', pageUrl: 'https://www.facebook.com/saved/', collection: false, ready: true, empty: false } }));
  const settings = { mode: 'saved', acknowledged: true, maxItems: 2, delaySeconds: 4 };
  for (const invalid of [{ mode: 'other' }, { acknowledged: false }, { delaySeconds: 0 }, { delaySeconds: 0.05 }, { maxItems: -1 }]) {
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

test('all shipped version declarations agree on the release', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const json = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file)));
  const version = json('package.json').version;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(json('extension/manifest.json').version, version);
  assert.equal(json('package-lock.json').version, version);
  assert.equal(json('package-lock.json').packages[''].version, version);
});


test('collection authorization is canonical and cannot be reused in another collection or the all-items view', async () => {
  const bg = backgroundHarness();
  bg.setTabUrl('https://www.facebook.com/saved/?list_id=123&referrer=sidebar');
  bg.setPageHandler(async () => ({ ok: true, inspection: {
    mode: 'saved', ready: true, empty: false, collection: true,
    pageUrl: 'https://www.facebook.com/saved/?list_id=123'
  } }));
  assert.equal((await bg.request('start', { mode: 'saved', acknowledged: true, maxItems: 2, delaySeconds: 4 })).ok, true);
  assert.equal(bg.run.savedCollection, true);
  assert.equal(bg.run.savedUrl, 'https://www.facebook.com/saved/?list_id=123');
  bg.setTabUrl('https://www.facebook.com/saved?referrer=other&list_id=123');
  const sender = bg.pageSender();
  const run = (await bg.request('hello', {}, sender)).run;
  assert.equal((await bg.request('check', { id: run.id }, bg.pageSender())).ok, true);
  bg.setTabUrl('https://www.facebook.com/saved/?list_id=456');
  assert.equal((await bg.request('check', { id: run.id }, bg.pageSender())).ok, false);
  assert.equal(bg.run.status, 'blocked');
  assert.equal(bg.run.processed, 0);
  assert.equal((await bg.request('phase', { id: run.id, phase: 'selecting' }, sender)).ok, false);
});

test('a collection switch during Start inspection cannot authorize stale cards', async () => {
  const bg = backgroundHarness();
  bg.setTabUrl('https://www.facebook.com/saved/?list_id=123');
  bg.setPageHandler(async () => {
    bg.setTabUrl('https://www.facebook.com/saved/?list_id=456');
    return { ok: true, inspection: { mode: 'saved', ready: true, empty: false,
      collection: true, pageUrl: 'https://www.facebook.com/saved/?list_id=123' } };
  });
  const result = await bg.request('start', { mode: 'saved', acknowledged: true, maxItems: 2, delaySeconds: 4 });
  assert.equal(result.ok, false);
  assert.equal(bg.run, null);
});


test('bounded-group completion is tied to the pre-click group and does not require a global count decrease', async () => {
  const bg = backgroundHarness();
  bg.setTabUrl('https://www.facebook.com/saved/');
  bg.setPageHandler(async () => ({ ok: true, inspection: {
    mode: 'saved', pageUrl: 'https://www.facebook.com/saved/', collection: false, ready: true, empty: false
  } }));
  await bg.request('start', { mode: 'saved', acknowledged: true, maxItems: 1, delaySeconds: 4 });
  const sender = bg.pageSender();
  const run = (await bg.request('hello', {}, sender)).run;
  const request = (type, fields = {}, from = sender) => bg.request(type, { id: run.id, ...fields }, from);
  await request('saved-plan', { total: 1 });
  await request('phase', { phase: 'selecting' });
  for (const anonymousGroups of [[0], [6], [1, 2, 3], ['1']]) {
    assert.equal((await request('saved-pending', { key: 'anonymous-1', kind: 'anonymous', anonymousBefore: 5, anonymousGroups })).ok, false);
  }
  assert.equal((await request('saved-pending', { key: 'anonymous-1', kind: 'anonymous', anonymousBefore: 5, anonymousGroups: [1, 3] })).ok, true);
  await request('phase', { phase: 'waiting' });
  const completed = { key: 'anonymous-1', kind: 'anonymous', evidenceVerified: true,
    completionKind: 'anonymous-group', groupIndex: 1, groupAfter: 2,
    anchorsVerified: true, targetAbsent: true, anonymousAfter: 10, peersUnchanged: false };
  for (const patch of [
    { groupIndex: -1 }, { groupIndex: 2 }, { groupAfter: 3 }, { groupAfter: -1 },
    { anchorsVerified: false }, { targetAbsent: false }, { evidenceVerified: false },
    { key: 'anonymous-2' }, { completionKind: 'unknown' }
  ]) assert.equal((await request('saved-completed', { ...completed, ...patch })).ok, false);
  assert.equal((await request('saved-completed', completed, bg.pageSender('other-document'))).ok, false);
  assert.equal(bg.run.processed, 0);
  assert.equal((await request('saved-completed', completed)).ok, true);
  assert.equal(bg.run.processed, 1);
  assert.equal(bg.run.lastCompletionKind, 'anonymous-group');
  assert.equal((await request('saved-completed', completed)).ok, false);
});

test('verification timeouts identify pending loading and a target that did not disappear', async () => {
  const busy = await harness({ anonymousIds: ['a'], stuck: true });
  await busy.clock.until(() => busy.bg.run.status === 'blocked');
  assert.match(busy.bg.run.message, /Motivo: Facebook sigue mostrando carga pendiente/);
  assert.equal(busy.bg.run.processed, 0);
  const unchanged = await harness({ anonymousIds: ['a'], noProgress: true });
  await unchanged.clock.until(() => unchanged.bg.run.status === 'blocked');
  assert.match(unchanged.bg.run.message, /Motivo: la tarjeta original sigue presente/);
  assert.equal(unchanged.bg.run.processed, 0);
});


test('decimal pauses of 0.3 and 0.6 seconds are kept precisely after verification', async () => {
  for (const delaySeconds of [0.3, 0.6]) {
    const h = await harness({ maxItems: 2, delaySeconds });
    await h.clock.until(() => h.bg.run.status === 'finished');
    assert.equal(h.bg.run.delayMs, Math.round(delaySeconds * 1000));
    assert.equal(h.bg.run.processed, 2);
    const firstRemoved = h.events.find(e => e.type === 'removed');
    const secondOpened = h.events.filter(e => e.type === 'open')[1];
    const interval = secondOpened.at - firstRemoved.at;
    assert.ok(interval >= 1000 + delaySeconds * 1000);
    assert.ok(interval < 1000 + delaySeconds * 1000 + 101);
    assert.equal(h.bg.reloads.length, 0);
  }
});

test('saved mode accepts one decimal place within range and Activity Log retains whole-second limits', async () => {
  for (const delaySeconds of [0.1, 0.3, 0.6, 1.5, 7.3, 3600]) {
    const bg = backgroundHarness();
    bg.setTabUrl('https://www.facebook.com/saved/');
    bg.setPageHandler(async () => ({ ok: true, inspection: { mode: 'saved', collection: false,
      pageUrl: 'https://www.facebook.com/saved/', ready: true, empty: false } }));
    const result = await bg.request('start', { mode: 'saved', acknowledged: true, maxItems: 1, delaySeconds });
    assert.equal(result.ok, true, result.error);
    assert.equal(bg.run.delayMs, Math.round(delaySeconds * 1000));
    assert.equal(Number.isInteger(bg.run.delayMs), true);
  }
  for (const delaySeconds of [0, -0.3, 0.05, 0.11, 0.333, NaN, Infinity, 3600.1]) {
    const bg = backgroundHarness();
    bg.setTabUrl('https://www.facebook.com/saved/');
    bg.setPageHandler(async () => ({ ok: true, inspection: { mode: 'saved', collection: false,
      pageUrl: 'https://www.facebook.com/saved/', ready: true, empty: false } }));
    const result = await bg.request('start', { mode: 'saved', acknowledged: true, maxItems: 1, delaySeconds });
    assert.equal(result.ok, false);
    assert.match(result.error, /pasos de 0.1/);
    assert.equal(bg.run, null);
  }
  for (const delaySeconds of [0.3, 0.6, 3.5]) {
    const bg = backgroundHarness();
    const result = await bg.request('start', { mode: 'activity', acknowledged: true, maxBatches: 1, delaySeconds });
    assert.equal(result.ok, false);
    assert.match(result.error, /segundos enteros/);
    assert.equal(bg.run, null);
  }
});

test('the worker rejects another deletion until all 300 milliseconds of its cooldown have elapsed', async () => {
  const bg = backgroundHarness();
  bg.setTabUrl('https://www.facebook.com/saved/');
  bg.setPageHandler(async () => ({ ok: true, inspection: { mode: 'saved', collection: false,
    pageUrl: 'https://www.facebook.com/saved/', ready: true, empty: false } }));
  await bg.request('start', { mode: 'saved', acknowledged: true, maxItems: 2, delaySeconds: 0.3 });
  const sender = bg.pageSender();
  const run = (await bg.request('hello', {}, sender)).run;
  const request = (type, fields = {}) => bg.request(type, { id: run.id, ...fields }, sender);
  await request('saved-plan', { total: 2 });
  await request('phase', { phase: 'selecting' });
  await request('saved-pending', { key: 'a' });
  await request('phase', { phase: 'waiting' });
  await request('saved-completed', { key: 'a', evidenceVerified: true });
  await request('phase', { phase: 'selecting' });
  assert.equal((await request('saved-pending', { key: 'b' })).ok, false);
  bg.clock.now += 299;
  assert.equal((await request('saved-pending', { key: 'b' })).ok, false);
  bg.clock.now += 1;
  assert.equal((await request('saved-pending', { key: 'b' })).ok, true);
});

test('Stop during a fractional pause prevents the next item', async () => {
  const h = await harness({ delaySeconds: 0.6 });
  await h.clock.until(() => h.bg.run.phase === 'cooldown');
  assert.equal((await h.bg.request('stop')).ok, true);
  let settled = false;
  h.done.then(() => { settled = true; });
  await h.clock.until(() => settled);
  assert.equal(h.bg.run.status, 'stopped');
  assert.equal(h.events.filter(e => e.type === 'delete').length, 1);
});
