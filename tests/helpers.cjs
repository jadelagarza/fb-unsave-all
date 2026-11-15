const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const source = (file) => fs.readFileSync(path.join(__dirname, '..', 'extension', file), 'utf8');

// A deterministic clock lets the tests cover the real 15/30/90-second timeouts without sleeping.
class Clock {
  now = 1;
  timers = [];
  setTimeout = (fn, ms = 0) => { const timer = { at: this.now + ms, fn }; this.timers.push(timer); return timer; };
  async flush() { await new Promise((resolve) => setImmediate(resolve)); }
  async until(predicate, maxTime = 140000) {
    await this.flush();
    const deadline = this.now + maxTime;
    for (let i = 0; i < 15000; i++) {
      if (predicate()) return;
      this.timers.sort((a, b) => a.at - b.at);
      const timer = this.timers.shift();
      if (!timer || timer.at > deadline) throw new Error('Test deadline exceeded');
      this.now = timer.at;
      timer.fn();
      await this.flush();
    }
    throw new Error('Too many test steps');
  }
  Date = (() => {
    const clock = this;
    return class extends Date { static now() { return clock.now; } };
  })();
}

function backgroundHarness(clock = new Clock()) {
  let listener;
  let removed;
  let run = null;
  let pageHandler = async () => ({ ok: true, inspection: { ready: true, empty: false } });
  const reloads = [];
  const navigations = [];
  const sender = { id: 'fixture-extension', url: 'chrome-extension://fixture/popup.html' };
  const context = vm.createContext({
    console, URL, crypto: { randomUUID }, Date: clock.Date,
    chrome: {
      storage: { session: { get: async () => ({ run }), set: async (value) => { run = value.run; } } },
      runtime: { id: 'fixture-extension', getURL: (suffix) => `chrome-extension://fixture/${suffix}`, onMessage: { addListener: (fn) => { listener = fn; } } },
      tabs: {
        query: async () => [{ id: 7, url: 'https://www.facebook.com/me/allactivity/?category_key=SAVEDFORLATER' }],
        sendMessage: async (_tabId, message) => pageHandler(message),
        update: async (id, options) => navigations.push({ id, ...options }),
        create: async (options) => navigations.push(options),
        reload: async (id, options) => { reloads.push({ id, options, at: clock.now }); },
        onRemoved: { addListener: (fn) => { removed = fn; } }
      }
    }
  });
  vm.runInContext(source('background.js'), context, { filename: 'background.js' });
  const request = (type, fields = {}, from = sender) => new Promise((resolve) => {
    listener({ app: 'fb-unsave-all', type, ...fields }, from, resolve);
  });
  return { request, reloads, navigations, clock,
    get run() { return run; }, setPageHandler(fn) { pageHandler = fn; },
    removeTab: (id) => removed(id),
    pageSender: (documentId = 'document-1', tabId = 7) => ({ tab: { id: tabId, url: 'https://www.facebook.com/me/allactivity/' }, documentId, frameId: 0,
      url: 'https://www.facebook.com/me/allactivity/' })
  };
}

async function contentHarness(options = {}) {
  const clock = new Clock();
  const bg = backgroundHarness(clock);
  let state = { loading: false, checked: false, dialog: false, selected: 0, empty: false, fingerprint: 'batch-a', ...options };
  const events = [];
  const observers = new Set();
  let listener;
  let documentId = 'document-1';
  function notify() { for (const fn of observers) fn(); }
  const record = (type) => events.push({ type, at: clock.now });
  const checkbox = { click() { state.checked = true; state.selected = 20; record('select'); } };
  const dom = {
    assertPage: () => { if (state.securityError) throw new Error('Facebook muestra una verificación de seguridad.'); return {}; },
    ready: () => {
      dom.assertPage();
      if (state.loading || state.dialog || state.unrecognized) return null;
      return { empty: state.empty, checkbox, fingerprint: state.fingerprint };
    },
    checked: () => state.checked,
    selectedCount: () => state.selected,
    dialogs: () => state.dialog ? [{}] : [],
    isLoading: () => state.loading,
    toolbarDelete: () => ({ click() { state.dialog = true; record('open-confirmation'); } }),
    confirmationDelete: () => {
      if (!state.dialog) throw new Error('Missing confirmation');
      return { click() {
        record('confirm-delete');
        state.dialog = false;
        if (!state.noLoader) { state.loading = true; notify(); record('loading-start'); }
        if (state.onConfirm) state.onConfirm({ bg, state, clock });
        if (!state.stuckLoader) clock.setTimeout(() => {
          state.loading = false; state.checked = false; state.selected = 0;
          if (!state.noProgress) state.fingerprint = 'batch-b';
          record('loading-end'); notify();
        }, state.loadingDuration || 500);
      } };
    }
  };
  function load() {
    const thisDocument = documentId;
    vm.runInContext(source('content.js'), vm.createContext({
      console, Date: clock.Date, setTimeout: clock.setTimeout, FBUnsave: dom,
      document: { documentElement: {} },
      MutationObserver: class {
        constructor(fn) { this.fn = fn; }
        observe() { observers.add(this.fn); }
        disconnect() { observers.delete(this.fn); }
      },
      chrome: { runtime: {
        sendMessage: (message) => bg.request(message.type, message, bg.pageSender(thisDocument)),
        onMessage: { addListener: (fn) => { listener = fn; } }
      } }
    }), { filename: 'content.js' });
  }
  bg.setPageHandler((message) => new Promise((resolve) => {
    if (message.type === 'inspect') resolve({ ok: true, inspection: { ready: true, empty: false } });
    else listener(message, {}, resolve);
  }));
  load();
  await clock.flush();
  const start = async (maxBatches = 1) => {
    const result = await bg.request('start', { acknowledged: true, maxBatches, delaySeconds: 3 });
    if (!result.ok) throw new Error(result.error);
    await clock.flush();
  };
  return { bg, clock, events, state, start,
    reloadDocument() { documentId = `document-${randomUUID()}`; load(); },
    setState(patch) { Object.assign(state, patch); notify(); }
  };
}
module.exports = { vm, source, Clock, backgroundHarness, contentHarness };
