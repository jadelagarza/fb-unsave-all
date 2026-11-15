const { test } = require('node:test');
const assert = require('node:assert/strict');
const { backgroundHarness, contentHarness } = require('./helpers.cjs');

test('a batch waits for loading to end, then reloads once and persists progress', async () => {
  const h = await contentHarness();
  await h.start();
  await h.clock.until(() => h.bg.reloads.length === 1);
  assert.deepEqual(h.events.map((event) => event.type), ['select', 'open-confirmation', 'confirm-delete', 'loading-start', 'loading-end']);
  const ended = h.events.find((event) => event.type === 'loading-end').at;
  assert.ok(h.bg.reloads[0].at >= ended + 1500, 'reload must follow a stable disappearance of the loader');
  assert.equal(h.bg.run.batches, 1);
  assert.equal(h.bg.run.processed, 20);
  assert.equal(h.bg.run.phase, 'reloading');
  h.reloadDocument();
  await h.clock.until(() => h.bg.run.status === 'finished');
  assert.match(h.bg.run.message, /límite/);
  assert.equal(h.events.filter((event) => event.type === 'confirm-delete').length, 1);
});

test('multiple batches resume only after reload, then finish on an explicit empty list', async () => {
  const h = await contentHarness();
  await h.start(100);
  await h.clock.until(() => h.bg.reloads.length === 1);
  h.reloadDocument();
  await h.clock.until(() => h.bg.reloads.length === 2);
  assert.equal(h.bg.run.processed, 40);
  h.setState({ empty: true });
  h.reloadDocument();
  await h.clock.until(() => h.bg.run.status === 'finished');
  assert.match(h.bg.run.message, /no quedan/);
  assert.equal(h.bg.reloads.length, 2);
});

test('a loader that never appears blocks without reload or repeated deletion', async () => {
  const h = await contentHarness({ noLoader: true });
  await h.start();
  await h.clock.until(() => h.bg.run.status === 'blocked');
  assert.match(h.bg.run.message, /No se observó/);
  assert.equal(h.bg.reloads.length, 0);
  assert.equal(h.events.filter((event) => event.type === 'confirm-delete').length, 1);
});

test('a stuck loader times out without reloading', async () => {
  const h = await contentHarness({ stuckLoader: true });
  await h.start();
  await h.clock.until(() => h.bg.run.status === 'blocked');
  assert.match(h.bg.run.message, /no terminaron/);
  assert.equal(h.bg.reloads.length, 0);
});

test('an unchanged list after reload blocks before another destructive click', async () => {
  const h = await contentHarness({ noProgress: true });
  await h.start(100);
  await h.clock.until(() => h.bg.reloads.length === 1);
  h.reloadDocument();
  await h.clock.until(() => h.bg.run.status === 'blocked');
  assert.match(h.bg.run.message, /sigue igual/);
  assert.equal(h.events.filter((event) => event.type === 'confirm-delete').length, 1);
});

test('Stop during an in-flight deletion prevents reload and further clicks', async () => {
  const h = await contentHarness({ loadingDuration: 10000 });
  await h.start(100);
  await h.clock.until(() => h.events.some((event) => event.type === 'loading-start'));
  await h.bg.request('stop');
  await h.clock.until(() => h.events.some((event) => event.type === 'loading-end'));
  assert.equal(h.bg.run.status, 'stopped');
  assert.equal(h.bg.reloads.length, 0);
  assert.equal(h.events.filter((event) => event.type === 'confirm-delete').length, 1);
});

test('security challenge before selection prevents destructive clicks', async () => {
  const h = await contentHarness({ securityError: true });
  await h.start();
  await h.clock.until(() => h.bg.run.status === 'blocked');
  assert.equal(h.events.length, 0);
  assert.match(h.bg.run.message, /verificación/);
});

test('unrecognized UI is blocked instead of being declared empty', async () => {
  const h = await contentHarness({ unrecognized: true });
  await h.start();
  await h.clock.until(() => h.bg.run.status === 'blocked');
  assert.equal(h.events.length, 0);
  assert.match(h.bg.run.message, /lista estable/);
});

test('background rejects missing acknowledgement, invalid limits, and messages from another tab', async () => {
  const h = backgroundHarness();
  assert.equal((await h.request('start', { maxBatches: 1, delaySeconds: 3 })).ok, false);
  assert.equal((await h.request('start', { acknowledged: true, maxBatches: 0, delaySeconds: 3 })).ok, false);
  assert.equal((await h.request('start', { acknowledged: true, maxBatches: 1, delaySeconds: 0 })).ok, false);
  assert.equal((await h.request('start', { acknowledged: true, maxBatches: 1, delaySeconds: 3 })).ok, true);
  await h.request('hello', {}, h.pageSender());
  assert.equal((await h.request('check', { id: h.run.id }, h.pageSender('other-doc', 8))).ok, false);
  assert.equal((await h.request('status', {}, h.pageSender())).ok, false);
});

test('unexpected manual reload never silently resumes a pending batch', async () => {
  const h = backgroundHarness();
  await h.request('start', { acknowledged: true, maxBatches: 10, delaySeconds: 3 });
  await h.request('hello', {}, h.pageSender());
  await h.request('hello', {}, h.pageSender('unexpected-document'));
  assert.equal(h.run.status, 'blocked');
  assert.match(h.run.message, /inesperada/);
});

test('closing the authorized tab stops its run', async () => {
  const h = backgroundHarness();
  await h.request('start', { acknowledged: true, maxBatches: 10, delaySeconds: 3 });
  h.removeTab(7);
  await h.clock.flush();
  assert.equal(h.run.status, 'stopped');
});

test('a request to reload before completion is rejected', async () => {
  const h = backgroundHarness();
  await h.request('start', { acknowledged: true, maxBatches: 1, delaySeconds: 3 });
  await h.request('hello', {}, h.pageSender());
  const response = await h.request('reload', { id: h.run.id, loadingObserved: true }, h.pageSender());
  assert.equal(response.ok, false);
  assert.equal(h.reloads.length, 0);
});
