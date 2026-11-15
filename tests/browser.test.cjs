const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const fixture = require('./fixture.cjs');
const extensionPath = path.resolve(__dirname, '..', 'extension');

async function setup(t, mode = 'normal', fixtureOptions = {}) {
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
      await route.fulfill({ contentType: 'text/html', body: fixture(mode, fixtureOptions) });
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
  assert.equal(inspection.ok, true, inspection.error);
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
      const previous = events.slice(0, index).findLast(event => event.event === 'loading-end');
      assert.ok(previous);
      assert.ok(events[index].at - previous.at >= 1400);
    }
  }
});

test('two global-loader batches each finish, reload, and select distinct items before stopping at the limit', { timeout: 30000 }, async (t) => {
  const h = await setup(t, 'global-overlay', {initialRemaining:60, loadingDuration:700, emptyUntilReload:true});
  assert.equal((await h.request('start', {acknowledged:true,maxBatches:2,delaySeconds:3})).ok,true);
  const run=await h.untilStatus('finished',25000);
  assert.equal(run.batches,2);
  assert.equal(run.processed,40);
  assert.match(run.message,/límite/);
  const events=await h.events();
  const confirmations=events.filter(event=>event.event==='confirm-delete');
  const loads=events.filter(event=>event.event==='page-load');
  assert.equal(confirmations.length,2);
  assert.equal(loads.length,3,'the final authorized batch must also reload');
  const uniqueItems=new Set(confirmations.flatMap(event=>event.items));
  assert.equal(uniqueItems.size,40,'a selected item must never be submitted in both batches');
  for(let index=0;index<2;index++) {
    const finished=events.filter(event=>event.event==='deletion-finished')[index];
    const loadingEnd=events.filter(event=>event.event==='loading-end')[index];
    assert.ok(loads[index+1].at>=finished.at+1400);
    assert.ok(loads[index+1].at>=loadingEnd.at+1400);
    if(index===0) assert.ok(confirmations[1].at>loads[1].at,'next deletion must follow the reload');
  }
});

test('a one-batch empty view without an observable spinner is verified by reloading and finishes with its count', { timeout: 15000 }, async (t) => {
  const h=await setup(t,'no-loader-completed',{initialRemaining:20,emptyUntilReload:true});
  assert.equal((await h.request('start',{acknowledged:true,maxBatches:1,delaySeconds:3})).ok,true);
  const run=await h.untilStatus('finished',10000);
  assert.equal(run.lastCompletionKind,'empty');
  assert.equal(run.batches,1);
  assert.equal(run.processed,20);
  assert.match(run.message,/no quedan/);
  const events=await h.events();
  assert.equal(events.filter(event=>event.event==='page-load').length,2);
  assert.equal(events.some(event=>event.event==='loading-start'),false);
  const inspection=await h.request('inspect');
  assert.equal(inspection.inspection.empty,true,'recognize No hay nada para mostrar with a retained disabled Todo');
});

test('three missed-spinner batches continue across temporarily empty views and only finish after a fresh empty page', { timeout: 35000 }, async (t) => {
  const h=await setup(t,'no-loader-completed',{initialRemaining:45,emptyUntilReload:true});
  assert.equal((await h.request('start',{acknowledged:true,maxBatches:10,delaySeconds:3})).ok,true);
  const run=await h.untilStatus('finished',30000);
  assert.equal(run.batches,3);
  assert.equal(run.processed,45);
  const events=await h.events();
  assert.equal(events.filter(event=>event.event==='confirm-delete').length,3);
  assert.equal(events.filter(event=>event.event==='page-load').length,4);
  assert.equal(new Set(events.filter(event=>event.event==='confirm-delete').flatMap(event=>event.items)).size,45);
});

test('selected-item disappearance can verify a missed spinner while other rows remain', { timeout: 20000 }, async (t) => {
  const h=await setup(t,'no-loader-completed',{initialRemaining:60});
  assert.equal((await h.request('start',{acknowledged:true,maxBatches:2,delaySeconds:3})).ok,true);
  const run=await h.untilStatus('finished',15000);
  assert.equal(run.lastCompletionKind,'items-removed');
  assert.equal(run.batches,2);
  assert.equal(run.processed,40);
  assert.equal((await h.events()).filter(event=>event.event==='page-load').length,3);
});

test('a brief empty view never finishes the run or repeats a deletion; a verification reload blocks unchanged data', { timeout: 25000 }, async (t) => {
  const h=await setup(t,'no-loader-transient-empty');
  assert.equal((await h.request('start',{acknowledged:true,maxBatches:2,delaySeconds:3})).ok,true);
  const run=await h.untilStatus('blocked');
  assert.match(run.message,/sigue igual/);
  assert.equal(run.processed,0);
  assert.equal((await h.events()).filter(event=>event.event==='page-load').length,2);
  assert.equal((await h.events()).filter(event=>event.event==='confirm-delete').length,1);
});

test('a completed loader still waits for the selected rows and toolbar to reset before reloading', { timeout: 18000 }, async (t) => {
  const h=await setup(t,'global-overlay',{initialRemaining:40,selectionResetDelay:2500});
  assert.equal((await h.request('start',{acknowledged:true,maxBatches:1,delaySeconds:3})).ok,true);
  await h.untilStatus('finished',14000);
  const events=await h.events();
  const finished=events.find(event=>event.event==='deletion-finished');
  const nextLoad=events.filter(event=>event.event==='page-load')[1];
  assert.ok(nextLoad.at>=finished.at+1400,'UI restoration must be stable, not just the spinner disappearing');
});

test('a failed deletion restored by reload blocks before submitting the same batch again', { timeout: 15000 }, async (t) => {
  const h=await setup(t,'no-loader-completed',{initialRemaining:40,optimisticRevert:true});
  assert.equal((await h.request('start',{acknowledged:true,maxBatches:2,delaySeconds:3})).ok,true);
  const run=await h.untilStatus('blocked',10000);
  assert.match(run.message,/sigue igual/);
  assert.equal(run.batches,0);
  assert.equal(run.processed,0);
  assert.equal((await h.events()).filter(event=>event.event==='confirm-delete').length,1);
});

test('five decorative-spinner batches keep stale rows until reload and continue without repeating items', { timeout: 55000 }, async (t) => {
  const h=await setup(t,'visual-overlay',{initialRemaining:110,staleRowsUntilReload:true,navigationProgress:true,loadingDuration:500});
  const inspection=await h.request('inspect');
  assert.equal(inspection.ok,true,inspection.error);
  assert.equal(inspection.inspection.loading,false,'the 4px navigation bar is not a deletion loader');
  assert.equal((await h.request('start',{acknowledged:true,maxBatches:5,delaySeconds:3})).ok,true);
  const run=await h.untilStatus('finished',50000);
  assert.equal(run.lastCompletionKind,'loading','detect the painted aria-hidden ring without progressbar metadata');
  assert.equal(run.batches,5);
  assert.equal(run.processed,100);
  const events=await h.events();
  const confirmations=events.filter(event=>event.event==='confirm-delete');
  const loads=events.filter(event=>event.event==='page-load');
  assert.equal(confirmations.length,5);
  assert.equal(loads.length,6);
  assert.equal(new Set(confirmations.flatMap(event=>event.items)).size,100);
  for(let index=0;index<5;index++) assert.ok(loads[index+1].at>=events.filter(event=>event.event==='loading-end')[index].at+1400);
});

test('unknown loading with stale rows uses readiness for one verification reload per batch and counts fresh results', { timeout: 25000 }, async (t) => {
  const h=await setup(t,'no-loader-completed',{initialRemaining:60,staleRowsUntilReload:true,navigationProgress:true});
  assert.equal((await h.request('start',{acknowledged:true,maxBatches:2,delaySeconds:3})).ok,true);
  const run=await h.untilStatus('finished',20000);
  assert.equal(run.lastCompletionKind,'readiness');
  assert.equal(run.batches,2);
  assert.equal(run.processed,40);
  assert.equal((await h.events()).filter(event=>event.event==='page-load').length,3);
});

test('an early selection reset never permits reload while the decorative blocking spinner remains painted', { timeout: 15000 }, async (t) => {
  const h=await setup(t,'visual-overlay',{initialRemaining:40,staleRowsUntilReload:true,earlySelectionReset:true,loadingDuration:1800});
  assert.equal((await h.request('start',{acknowledged:true,maxBatches:1,delaySeconds:3})).ok,true);
  const run=await h.untilStatus('finished',12000);
  assert.equal(run.batches,1);
  const events=await h.events();
  const ended=events.find(event=>event.event==='loading-end');
  const nextLoad=events.filter(event=>event.event==='page-load')[1];
  assert.ok(nextLoad.at>=ended.at+1400);
});

test('a decorative spinner that never leaves prevents reload and any processed count', { timeout: 15000 }, async (t) => {
  const h=await setup(t,'visual-overlay-stuck',{earlySelectionReset:true,staleRowsUntilReload:true});
  assert.equal((await h.request('start',{acknowledged:true,maxBatches:2,delaySeconds:3})).ok,true);
  const deadline=Date.now()+8000;
  let run;
  while(Date.now()<deadline) {
    run=(await h.request('status')).run;
    if(run?.message.startsWith('Carga detectada.')) break;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.match(run.message,/^Carga detectada\./);
  await new Promise(resolve=>setTimeout(resolve,1800));
  assert.equal((await h.events()).filter(event=>event.event==='page-load').length,1);
  assert.equal((await h.request('status')).run.processed,0);
  await h.request('stop');
});

test('installed extension rejects another activity-log category', { timeout: 15000 }, async (t) => {
  const h = await setup(t, 'wrong-category');
  const response = await h.request('start', { acknowledged: true, maxBatches: 100, delaySeconds: 3 });
  assert.equal(response.ok, false);
  assert.match(response.error, /título/);
  assert.equal((await h.events()).some((event) => event.event === 'confirm-delete'), false);
});

test('installed extension reads the bare 16 counter in the selection bar and ignores post numbers', { timeout: 15000 }, async (t) => {
  const h = await setup(t, 'bare-counter');
  const inspection = await h.request('inspect');
  assert.equal(inspection.ok, true, inspection.error);
  assert.equal(inspection.inspection.selected, 0, 'unselected post text must not count as a selection');
  const started = await h.request('start', { acknowledged: true, maxBatches: 1, delaySeconds: 3 });
  assert.equal(started.ok, true, started.error);
  const run = await h.untilStatus('finished');
  assert.equal(run.processed, 16);
  assert.equal(run.batches, 1);
  const events = await h.events();
  assert.equal(events.filter((event) => event.event === 'confirm-delete').length, 1);
  assert.equal(events.filter((event) => event.event === 'page-load').length, 2);
  assert.ok(events.findIndex((event) => event.event === 'loading-end') < events.findLastIndex((event) => event.event === 'page-load'));
  const emptyInspection = await h.request('inspect');
  assert.equal(emptyInspection.ok, true, emptyInspection.error);
  assert.equal(emptyInspection.inspection.empty, true);
  assert.equal(emptyInspection.inspection.selected, 0);
});

test('installed extension rejects conflicting counters in the selection bar before deleting', { timeout: 25000 }, async (t) => {
  const h = await setup(t, 'ambiguous-counter');
  const started = await h.request('start', { acknowledged: true, maxBatches: 1, delaySeconds: 3 });
  assert.equal(started.ok, true, started.error);
  const run = await h.untilStatus('blocked');
  assert.match(run.message, /ambiguo/);
  assert.equal((await h.events()).some((event) => event.event === 'confirm-delete'), false);
});

test('installed extension does not use numbers or selection-like text from saved posts as the counter', { timeout: 25000 }, async (t) => {
  const h = await setup(t, 'number-in-post');
  const started = await h.request('start', { acknowledged: true, maxBatches: 1, delaySeconds: 3 });
  assert.equal(started.ok, true, started.error);
  const run = await h.untilStatus('blocked');
  assert.match(run.message, /cantidad seleccionada/);
  assert.equal((await h.events()).some((event) => event.event === 'confirm-delete'), false);
});

test('installed extension verifies restored readiness once and blocks unchanged data without counting or repeating', { timeout: 30000 }, async (t) => {
  const h = await setup(t, 'no-loader');
  assert.equal((await h.request('start', { acknowledged: true, maxBatches: 100, delaySeconds: 3 })).ok, true);
  const run = await h.untilStatus('blocked');
  assert.match(run.message, /sigue igual/);
  assert.equal(run.batches,0);
  assert.equal(run.processed,0);
  assert.equal((await h.events()).filter((event) => event.event === 'page-load').length, 2);
  assert.equal((await h.events()).filter((event) => event.event === 'confirm-delete').length,1);
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

for (const mode of ['global-overlay', 'global-overlay-opacity', 'global-overlay-hidden-parent', 'global-overlay-detached', 'global-overlay-hidden-main']) {
  test(`installed extension observes ${mode} outside main and reloads only after it becomes invisible`, { timeout: 20000 }, async (t) => {
    const h = await setup(t, mode);
    const inspection = await h.request('inspect');
    assert.equal(inspection.ok, true, inspection.error);
    assert.equal(inspection.inspection.loading, false, 'a persistent but hidden global progressbar must not block startup');
    const started = await h.request('start', { acknowledged: true, maxBatches: 1, delaySeconds: 3 });
    assert.equal(started.ok, true, started.error);
    const run = await h.untilStatus('finished', 15000);
    assert.equal(run.batches, 1);
    assert.equal(run.processed, 20);
    const events = await h.events();
    assert.equal(events.filter(event => event.event === 'confirm-delete').length, 1);
    const secondLoad = events.filter(event => event.event === 'page-load')[1];
    const loadingEnd = events.find(event => event.event === 'loading-end');
    assert.ok(secondLoad && loadingEnd);
    assert.ok(secondLoad.at - loadingEnd.at >= 1400, 'reload must follow the real disappearance, not just DOM presence');
  });
}

test('installed extension never reloads while the global deletion overlay remains visible', { timeout: 20000 }, async (t) => {
  const h = await setup(t, 'global-overlay-stuck');
  assert.equal((await h.request('start', { acknowledged: true, maxBatches: 1, delaySeconds: 3 })).ok, true);
  const deadline = Date.now() + 8000;
  let run;
  while (Date.now() < deadline) {
    run = (await h.request('status')).run;
    if (run?.message.startsWith('Carga detectada.')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.match(run.message, /^Carga detectada\./);
  await new Promise(resolve => setTimeout(resolve, 1800));
  assert.equal((await h.events()).filter(event => event.event === 'page-load').length, 1);
  assert.equal((await h.request('status')).run.status, 'running');
  await h.request('stop');
});
