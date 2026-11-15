"use strict";
(() => {
  const dom = globalThis.FBUnsave;
  let active = false;
  let cancelled = false;
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function send(type, fields = {}) {
    const result = await chrome.runtime.sendMessage({ app: "fb-unsave-all", type, ...fields });
    if (!result?.ok) throw new Error(result?.error || "La extensión no respondió.");
    return result;
  }
  function alive() { if (cancelled) throw new Error("Detenido por el usuario."); }
  async function waitFor(check, timeout, description, { guard = true } = {}) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
      alive();
      if (guard) dom.assertPage();
      try { const value = check(); if (value) return value; }
      catch (error) { lastError = error; }
      await pause(100);
    }
    throw new Error(`${description}. ${lastError?.message || "Tiempo de espera agotado; revisa la página manualmente."}`);
  }
  async function stableReady() {
    let since = 0;
    let fingerprint;
    return waitFor(() => {
      const state = dom.ready();
      if (!state) { since = 0; return null; }
      if (state.fingerprint !== fingerprint || !since) { fingerprint = state.fingerprint; since = Date.now(); }
      return Date.now() - since >= 1000 ? state : null;
    }, 30000, "No se pudo reconocer una lista estable de guardados", { guard: false });
  }
  async function check(run) {
    alive();
    dom.assertPage();
    const response = await send("check", { id: run.id });
    alive();
    return response.run;
  }
  async function phase(run, value, text, fields = {}) {
    await check(run);
    return (await send("phase", { id: run.id, phase: value, text, ...fields })).run;
  }
  function loadingTracker() {
    let observed = false;
    let blockedObserved = false;
    let idleSince = 0;
    function sample() {
      if (dom.isLoading()) { observed = true; idleSince = 0; }
      else if (observed && !idleSince) idleSince = Date.now();
      // Ignore the confirmation dialog itself; track a NEW blocked interaction after it closes.
      if (!dom.confirmationOpen() && dom.interactionState().blocked) blockedObserved = true;
    }
    const observer = new MutationObserver(sample);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["style", "class", "hidden", "aria-hidden", "aria-busy", "aria-label", "aria-valuetext", "data-visualcompletion", "role"] });
    sample();
    return { sample, get observed() { return observed; }, get blockedObserved() { return blockedObserved; },
      settled: () => observed && idleSince > 0 && Date.now() - idleSince >= 1500,
      disconnect: () => observer.disconnect() };
  }
  async function waitForDeletion(run, tracker, snapshot) {
    const appearanceDeadline = Date.now() + 15000;
    let completionDeadline = appearanceDeadline;
    let announcedLoading = false;
    let evidenceKey = null;
    let evidenceSince = 0;
    while (Date.now() < completionDeadline) {
      alive();
      dom.assertPage();
      tracker.sample();
      if ((tracker.observed || tracker.blockedObserved) && !announcedLoading) {
        completionDeadline = Date.now() + 90000;
        announcedLoading = true;
        await phase(run, "waiting", "Carga detectada. Esperando a que la página vuelva a estar disponible…");
      }
      if (dom.isLoading() || dom.dialogs().length || dom.interactionState().intercepted) {
        evidenceKey = null;
        evidenceSince = 0;
      } else {
        const state = dom.deletionState(snapshot);
        const kind = tracker.observed ? (state.selectionCleared && (state.interactionReady || state.empty) ? "loading" : null) :
          state.empty ? "empty" : state.itemsRemoved && state.interactionReady ? "items-removed" :
            state.selectionCleared && state.interactionReady ? "readiness" : null;
        const key = kind && `${kind}:${state.fingerprint}`;
        if (!kind || key !== evidenceKey) { evidenceKey = key; evidenceSince = kind ? Date.now() : 0; }
        if (kind && evidenceSince && Date.now() - evidenceSince >= 1500 && (!tracker.observed || tracker.settled())) {
          return { completionKind: kind, loadingObserved: tracker.observed, evidenceVerified: true,
            interactionCycleObserved: tracker.blockedObserved,
            selectionResetObserved: state.selectionCleared, interactionReady: state.interactionReady };
        }
      }
      await pause(100);
    }
    if (!tracker.observed && !tracker.blockedObserved) {
      throw new Error("No se observó el indicador de carga ni un resultado verificable de la eliminación. No se recargará ni repetirá el lote; revisa la página manualmente.");
    }
    throw new Error("La carga, el diálogo o la selección no terminaron de restablecerse. No se recargará la página.");
  }
  async function execute() {
    if (active) return;
    active = true;
    cancelled = false;
    let run;
    try {
      run = (await send("hello")).run;
      if (!run) return;
      if (run.mode === "saved") {
        await globalThis.runFBSaved(run, { send, alive, pause });
        return;
      }
      const state = await stableReady();
      await check(run);
      if (run.awaitingVerification && !state.empty && state.fingerprint === run.lastFingerprint) {
        throw new Error("La lista sigue igual después de recargar. No se repetirá una eliminación cuyo resultado es incierto.");
      }
      run = await phase(run, "verifying", "Lista comprobada después de cargar.");
      if (state.empty) {
        await send("finish", { id: run.id, text: "Facebook muestra que no quedan elementos guardados. Comprueba también la pantalla Guardados." });
        return;
      }
      if (run.batches >= run.maxBatches) {
        await send("finish", { id: run.id, text: "Se alcanzó el límite de lotes. La última página ya fue recargada y quedan elementos por revisar." });
        return;
      }
      if (Date.now() < run.notBefore) {
        await phase(run, "cooldown", "Pausa entre lotes…");
        while (Date.now() < run.notBefore) { await check(run); await pause(250); }
      }
      await phase(run, "selecting", 'Marcando «Todo»…');
      const fresh = dom.ready();
      if (!fresh || fresh.empty || fresh.fingerprint !== state.fingerprint) throw new Error("La lista cambió antes de seleccionar. Revisa la página.");
      await check(run);
      fresh.checkbox.click();
      const selected = await waitFor(() => {
        const count = dom.selectedCount(dom.assertPage());
        if (count > 0 && dom.checked(fresh.checkbox)) { dom.toolbarDelete(); return count; }
        return null;
      }, 15000, "No se pudo comprobar la cantidad seleccionada");
      const deletion = dom.captureDeletion(selected);
      await phase(run, "confirming", `${selected} elementos seleccionados. Abriendo confirmación…`, { selected, fingerprint: state.fingerprint });
      await check(run);
      dom.toolbarDelete().click();
      await waitFor(() => dom.dialogs().length && dom.confirmationDelete(), 15000, "No apareció una confirmación reconocible");
      await phase(run, "deleting", `Confirmando la eliminación de ${selected} elementos…`);
      if (dom.isLoading()) throw new Error("Ya hay un indicador de carga activo antes de confirmar. Revisa el diálogo.");
      const tracker = loadingTracker(); // Observe BEFORE the destructive click, including fast loaders.
      try {
        await check(run);
        dom.confirmationDelete().click();
        await phase(run, "waiting", "Esperando el fin de la eliminación: carga o cambio verificable en los elementos…");
        const completion = await waitForDeletion(run, tracker, deletion);
        await check(run);
        await send("reload", { id: run.id, ...completion });
      } finally { tracker.disconnect(); }
    } catch (error) {
      if (run && !cancelled) {
        await send("fail", { id: run.id, text: error.message }).catch(() => {});
      }
    } finally { active = false; }
  }
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message?.app !== "fb-unsave-all") return false;
    if (message.type === "inspect") {
      try { reply({ ok: true, inspection: message.mode === "saved" ? globalThis.FBSaved.inspect() : dom.inspect() }); }
      catch (error) { reply({ ok: false, error: error.message }); }
    } else if (message.type === "go") {
      if (active) reply({ ok: false, error: "La ejecución anterior todavía se está deteniendo. Espera un momento y vuelve a iniciar." });
      else { reply({ ok: true }); void execute(); }
    }
    else if (message.type === "stop") { cancelled = true; reply({ ok: true }); }
    return false;
  });
  void execute(); // A reload injects a new content script; only its authorized tab resumes.
})();
