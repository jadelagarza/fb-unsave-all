const { test } = require('node:test');
const assert = require('node:assert/strict');
const { vm, source, Clock, backgroundHarness } = require('./helpers.cjs');

async function start(bg) {
  const result = await bg.request('start', { acknowledged: true, maxBatches: 1, delaySeconds: 3 });
  assert.equal(result.ok, true, result.error);
  const sender = bg.pageSender();
  const run = (await bg.request('hello', {}, sender)).run;
  return { run, sender };
}

test('a blocked execution alerts once; status polling and a duplicate failure do not repeat it', async () => {
  const bg = backgroundHarness();
  const { run, sender } = await start(bg);
  await bg.request('fail', { id: run.id, text: 'Fixture failure' }, sender);
  await bg.clock.flush();
  assert.equal(bg.audioPlays.length, 1);
  assert.equal(bg.audioDocuments.length, 1);
  assert.equal(bg.audioDocuments[0].reasons[0], 'AUDIO_PLAYBACK');
  assert.equal(bg.run.status, 'blocked');
  assert.equal(bg.run.message, 'Fixture failure');
  await bg.request('status');
  await bg.request('status');
  await bg.request('fail', { id: run.id, text: 'Repeated failure' }, sender);
  await bg.clock.flush();
  assert.equal(bg.audioPlays.length, 1);
  assert.equal(bg.errorSound.warning, '');
  assert.equal(bg.errorSound.eventId, `run-${run.id}`);
  const next = await start(bg);
  await bg.request('fail', { id: next.run.id, text: 'Another failure' }, next.sender);
  await bg.clock.flush();
  assert.equal(bg.audioPlays.length, 2);
  assert.equal(bg.audioDocuments.length, 1);
});

test('completion, manual Stop and closing the execution tab are silent', async () => {
  for (const end of ['finish', 'stop', 'close']) {
    const bg = backgroundHarness();
    const { run, sender } = await start(bg);
    if (end === 'finish') await bg.request('finish', { id: run.id, text: 'Done' }, sender);
    else if (end === 'stop') await bg.request('stop');
    else bg.removeTab(7);
    await bg.clock.flush();
    assert.equal(bg.audioPlays.length, 0);
  }
});

test('an unexpected document reload alerts independently of its lost content script', async () => {
  const bg = backgroundHarness();
  await start(bg);
  await bg.request('hello', {}, bg.pageSender('unexpected-document'));
  await bg.clock.flush();
  assert.equal(bg.run.status, 'blocked');
  assert.equal(bg.audioPlays.length, 1);
});

test('panel errors alert per action; a Start failure that blocks its run does not alert twice', async () => {
  const bg = backgroundHarness();
  bg.setPageHandler(async () => ({ ok: false, error: 'Page not recognized' }));
  assert.equal((await bg.request('inspect')).ok, false);
  await bg.clock.flush();
  assert.equal(bg.audioPlays.length, 1);
  assert.equal((await bg.request('inspect')).ok, false);
  await bg.clock.flush();
  assert.equal(bg.audioPlays.length, 2);
  bg.setPageHandler(async message => message.type === 'inspect'
    ? { ok: true, inspection: { ready: true, empty: false } }
    : { ok: false, error: 'Cannot start content script' });
  assert.equal((await bg.request('start', { acknowledged: true, maxBatches: 1, delaySeconds: 3 })).ok, false);
  await bg.clock.flush();
  assert.equal(bg.run.status, 'blocked');
  assert.equal(bg.audioPlays.length, 3);
});

test('sound failures preserve the original error, do not block Stop, and can be tested again', async () => {
  const bg = backgroundHarness();
  bg.setAudioHandler(() => new Promise(() => {}));
  const { run, sender } = await start(bg);
  const failed = await bg.request('fail', { id: run.id, text: 'Original error' }, sender);
  assert.equal(failed.ok, true);
  assert.equal((await bg.request('status')).run.message, 'Original error');
  assert.equal((await bg.request('stop')).ok, true);
  await bg.clock.until(() => bg.errorSound?.warning);
  assert.match(bg.errorSound.warning, /No se pudo iniciar/);
  assert.equal(bg.run.message.includes('Detenido por el usuario'), true);
  bg.setAudioHandler(async () => ({ ok: true, started: true }));
  bg.expireAudioDocument();
  const tested = await bg.request('test-sound');
  assert.equal(tested.sound.warning, '');
  assert.equal(bg.audioDocuments.length, 2);
  assert.equal(bg.run.status, 'stopped');
});

test('page messages cannot request a test tone or turn invalid protocol messages into alerts', async () => {
  const bg = backgroundHarness();
  const { run } = await start(bg);
  assert.equal((await bg.request('test-sound', {}, bg.pageSender())).ok, false);
  assert.equal((await bg.request('fail', { id: run.id, text: 'Foreign failure' }, bg.pageSender('other'))).ok, false);
  await bg.clock.flush();
  assert.equal(bg.audioPlays.length, 0);
  assert.equal(bg.run.status, 'running');
});

function audioHarness() {
  const clock = new Clock();
  const audios = [];
  let listener;
  let rejectPlay = false;
  class FakeAudio {
    constructor(url) { this.src = url; this.events = {}; audios.push(this); }
    addEventListener(type, handler) { this.events[type] = handler; }
    play() {
      if (rejectPlay) return Promise.reject(new Error('Blocked playback'));
      clock.setTimeout(() => this.events.ended?.(), 850);
      return Promise.resolve();
    }
    pause() { this.paused = true; }
  }
  const context = vm.createContext({
    Audio: FakeAudio, btoa, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    chrome: { runtime: { id: 'fixture-extension', getURL: value => `chrome-extension://fixture/${value}`,
      onMessage: { addListener: fn => { listener = fn; } } } }
  });
  vm.runInContext(source('offscreen.js'), context);
  const sender = { id: 'fixture-extension', url: 'chrome-extension://fixture/background.js' };
  const request = (eventId, from = sender) => new Promise(resolve => {
    const accepted = listener({ app: 'fb-unsave-all', target: 'error-audio', type: 'play', eventId }, from, resolve);
    if (!accepted) resolve(null);
  });
  return { clock, audios, request, sender, reject(value) { rejectPlay = value; } };
}

test('the local tone is valid non-silent PCM WAV audio with three separated pulses', async () => {
  const h = audioHarness();
  assert.equal((await h.request('one')).started, true);
  const wav = Buffer.from(h.audios[0].src.split(',')[1], 'base64');
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), wav.length - 44);
  const sample = t => wav.readInt16LE(44 + Math.round(t * 16000) * 2);
  for (const t of [0.041, 0.291, 0.541]) assert.notEqual(sample(t), 0);
  for (const t of [0.20, 0.45, 0.80]) assert.equal(sample(t), 0);
});

test('offscreen playback deduplicates one event and queues a separate event without overlapping', async () => {
  const h = audioHarness();
  const one = h.request('one');
  const repeated = h.request('one');
  const two = h.request('two');
  assert.equal((await one).started, true);
  assert.equal((await repeated).started, true);
  assert.equal(h.audios.length, 1);
  let second;
  two.then(value => { second = value; });
  await h.clock.until(() => second);
  assert.equal(second.started, true);
  assert.equal(h.audios.length, 2);
  assert.equal(h.audios[0].paused, true);
});

test('offscreen playback rejects page and popup senders and recovers from a failed play request', async () => {
  const h = audioHarness();
  assert.equal(await h.request('page', { ...h.sender, tab: { id: 7 } }), null);
  assert.equal(await h.request('popup', { ...h.sender, url: 'chrome-extension://fixture/popup.html' }), null);
  assert.equal(await h.request('foreign', { ...h.sender, id: 'other' }), null);
  assert.equal(h.audios.length, 0);
  h.reject(true);
  assert.equal((await h.request('bad')).ok, false);
  h.reject(false);
  assert.equal((await h.request('good')).started, true);
});
