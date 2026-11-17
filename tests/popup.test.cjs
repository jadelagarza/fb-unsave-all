const { test } = require('node:test');
const assert = require('node:assert/strict');
const { vm, source, Clock, backgroundHarness } = require('./helpers.cjs');

async function popupHarness(inspect) {
  const clock = new Clock();
  const nodes = new Map();
  const messages = [];
  const intervals = [];
  for (const match of source('popup.html').matchAll(/id="([^"]+)"/g)) {
    nodes.set(match[1], {
      value: '', textContent: '', disabled: false, hidden: false, checked: false, dataset: {}, attrs: {}, listeners: {},
      setAttribute(key, value) { this.attrs[key] = value; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      scrollIntoView() { this.scrolled = true; }
    });
  }
  nodes.get('mode').value = 'saved';
  const context = vm.createContext({
    document: { getElementById: (id) => nodes.get(id) },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    setInterval: (fn) => intervals.push(fn),
    chrome: { runtime: {
      getManifest: () => ({ version: require('../package.json').version }),
      sendMessage: (message) => {
        messages.push(message);
        return message.type === 'inspect' ? inspect(message, clock) : Promise.resolve({ ok: true, run: null });
      }
    } }
  });
  vm.runInContext(source('popup.js'), context);
  await clock.flush();
  return { clock, messages, intervals, node: (id) => nodes.get(id),
    click: (id) => nodes.get(id).listeners.click() };
}

test('Inspect immediately shows progress, prevents double clicks and reports a read-only result', async () => {
  const h = await popupHarness((_message, clock) => new Promise((resolve) => clock.setTimeout(() =>
    resolve({ ok: true, inspection: { mode: 'saved', ready: true, loaded: 3 } }), 300)));
  let done = false;
  h.click('inspect').then(() => { done = true; });
  assert.equal(h.node('inspection').dataset.state, 'pending');
  assert.match(h.node('inspection').textContent, /Comprobando/);
  assert.equal(h.node('inspect').disabled, true);
  assert.equal(h.node('start').disabled, true);
  assert.equal(h.node('inspection').attrs['aria-busy'], 'true');
  await h.click('inspect');
  const count = h.messages.length;
  h.intervals[0](); // Polling must not add status requests behind a pending inspection.
  await h.clock.flush();
  assert.equal(h.messages.length, count);
  await h.clock.until(() => done);
  assert.equal(h.node('inspection').dataset.state, 'ready');
  assert.match(h.node('inspection').textContent, /3 tarjetas reconocidas/);
  assert.equal(h.node('inspect').disabled, false);
  assert.equal(h.node('inspection').attrs['aria-busy'], 'false');
  assert.equal(h.messages.filter((message) => message.type === 'inspect').length, 1);
  assert.equal(h.messages.some((message) => ['start', 'go', 'reload'].includes(message.type)), false);
});

test('Inspect errors replace the nearby status instead of disappearing at the bottom of the popup', async () => {
  const h = await popupHarness(async () => ({ ok: false, error: 'No se reconoce el título de Guardados.' }));
  await h.click('inspect');
  assert.equal(h.node('inspection').dataset.state, 'error');
  assert.match(h.node('inspection').textContent, /No se pudo comprobar.*No se reconoce el título/);
  assert.equal(h.node('inspection').scrolled, true);
  assert.equal(h.node('inspect').disabled, false);
});

test('an unanswered inspection times out and ignores a late success response', async () => {
  let respond;
  const h = await popupHarness(() => new Promise((resolve) => { respond = resolve; }));
  let done = false;
  h.click('inspect').then(() => { done = true; });
  await h.clock.until(() => done);
  assert.equal(h.node('inspection').dataset.state, 'error');
  assert.match(h.node('inspection').textContent, /no respondió.*Recarga/);
  assert.equal(h.node('inspect').disabled, false);
  respond({ ok: true, inspection: { mode: 'saved', ready: true, loaded: 99 } });
  await h.clock.flush();
  assert.equal(h.node('inspection').dataset.state, 'error');
  assert.doesNotMatch(h.node('inspection').textContent, /99 tarjetas/);
});

test('background inspection times out without blocking status requests indefinitely', async () => {
  const bg = backgroundHarness();
  bg.setPageHandler(() => new Promise(() => {}));
  let result;
  bg.request('inspect', { mode: 'saved' }).then((value) => { result = value; });
  await bg.clock.until(() => result);
  assert.equal(result.ok, false);
  assert.match(result.error, /8 segundos/);
  assert.equal((await bg.request('status')).ok, true);
  assert.equal(bg.run, null);
});

test('a Start inspection timeout cannot start a run when its page replies later', async () => {
  const bg = backgroundHarness();
  let respond;
  bg.setPageHandler(() => new Promise((resolve) => { respond = resolve; }));
  let result;
  bg.request('start', { mode: 'saved', acknowledged: true, maxItems: 1, delaySeconds: 4 }).then((value) => { result = value; });
  await bg.clock.until(() => result);
  assert.equal(result.ok, false);
  respond({ ok: true, inspection: { mode: 'saved', ready: true, empty: false } });
  await bg.clock.flush();
  assert.equal(bg.run, null);
});

test('an old or malformed content-script response gives reload instructions', async () => {
  const bg = backgroundHarness();
  bg.setPageHandler(async () => ({ ok: true, inspection: { ready: true } }));
  const old = await bg.request('inspect', { mode: 'saved' });
  assert.equal(old.ok, false);
  assert.match(old.error, /script anterior.*Recarga/);
  bg.setPageHandler(async () => ({ ok: true }));
  const malformed = await bg.request('inspect', { mode: 'saved' });
  assert.equal(malformed.ok, false);
  assert.match(malformed.error, /respuesta incompatible.*Recarga/);
});


test('collection inspection names the item action and states that the collection is preserved', async () => {
  const h = await popupHarness(async () => ({ ok: true,
    inspection: { mode: 'saved', collection: true, ready: true, loaded: 3 } }));
  await h.click('inspect');
  assert.match(h.node('inspection').textContent, /Eliminar de la colección/);
  assert.match(h.node('inspection').textContent, /colección se conserva/);
  assert.match(h.node('ack-text').textContent, /uno por uno de la colección/);
  assert.equal(h.messages.some(message => message.type === 'start'), false);
});
