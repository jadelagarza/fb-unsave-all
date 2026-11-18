"use strict";
const KEY = "run";
const URLS = { saved: "https://www.facebook.com/saved/", activity: "https://www.facebook.com/me/allactivity/?category_key=SAVEDFORLATER" };
function modeOf(message) {
  const mode = message.mode ?? "activity"; // Compatibility with pre-1.0 messages and tests.
  if (!Object.hasOwn(URLS, mode)) throw new Error("Modo inválido.");
  return mode;
}
let queue = Promise.resolve();
const read = async () => (await chrome.storage.session.get(KEY))[KEY] || null;
let alertGeneration = 0;
let creatingAudio = null;
async function ensureAudioDocument() {
  if (creatingAudio) return creatingAudio;
  creatingAudio = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"], documentUrls: [chrome.runtime.getURL("offscreen.html")]
    });
    if (!contexts.length) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html", reasons: ["AUDIO_PLAYBACK"],
        justification: "Reproducir un aviso breve cuando ocurre un error en la limpieza de guardados."
      });
    }
  })();
  try { await creatingAudio; }
  finally { creatingAudio = null; }
}
async function playErrorSound(eventId) {
  let timer;
  try {
    const result = await Promise.race([
      (async () => {
        await ensureAudioDocument();
        return chrome.runtime.sendMessage({ app: "fb-unsave-all", target: "error-audio", type: "play", eventId });
      })(),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Audio timeout")), 4000);
      })
    ]);
    if (!result?.ok || result.started !== true) throw new Error("Audio unavailable");
    const sound = { eventId, startedAt: Date.now(), warning: "" };
    await chrome.storage.session.set({ errorSound: sound });
    return sound;
  } catch {
    const sound = { eventId, startedAt: null,
      warning: "No se pudo iniciar el aviso sonoro. Pulsa Probar sonido y comprueba el audio de Chrome y del sistema." };
    await chrome.storage.session.set({ errorSound: sound }).catch(() => {});
    return sound;
  } finally { clearTimeout(timer); }
}
async function write(run) {
  const previous = await read();
  await chrome.storage.session.set({ [KEY]: run });
  if (run.status === "blocked" && (previous?.id !== run.id || previous.status !== "blocked")) {
    alertGeneration++;
    void playErrorSound(`run-${run.id}`);
  }
  return run;
}
function extensionSender(sender) {
  return sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL("popup.html");
}
function validTabUrl(url) {
  try { return new URL(url).origin === "https://www.facebook.com"; } catch { return false; }
}
function savedPageUrl(href) {
  const url = new URL(href);
  const ids = url.searchParams.getAll("list_id");
  const unknownCollection = [...url.searchParams.keys()].some((key) =>
    /collection|list_id/i.test(key) && key !== "list_id");
  if (url.origin !== "https://www.facebook.com" || !/^\/saved\/?$/.test(url.pathname) ||
      unknownCollection || ids.length > 1 || (ids.length === 1 && !/^\d{1,40}$/.test(ids[0]))) {
    throw new Error("Abre Guardados o una colección válida antes de iniciar.");
  }
  return URLS.saved + (ids.length ? `?list_id=${ids[0]}` : "");
}
async function sameSavedPage(run, sender) {
  if (run.mode !== "saved") return;
  let current;
  try { current = savedPageUrl(sender.url || sender.tab?.url); } catch { current = null; }
  if (current !== run.savedUrl) {
    await write({ ...run, status: "blocked", message: "Cambió la colección o la vista de Guardados. Se detuvo la ejecución." });
    throw new Error("La página ya no corresponde a la colección o vista autorizada.");
  }
}
async function inspectTab(tabId, mode) {
  let timer;
  let timedOut = false;
  try {
    return await Promise.race([
      chrome.tabs.sendMessage(tabId, { app: "fb-unsave-all", type: "inspect", mode }, { frameId: 0 }),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error("Facebook no respondió a la comprobación en 8 segundos. Espera a que termine de cargar y vuelve a comprobar; si persiste, recarga la extensión y Facebook."));
        }, 8000);
      })
    ]);
  } catch (error) {
    if (timedOut) throw error;
    throw new Error("Recarga Facebook una vez para activar la extensión recién instalada o actualizada.");
  } finally { clearTimeout(timer); }
}
async function requireOwner(sender, id) {
  const run = await read();
  if (!run || run.status !== "running" || run.id !== id || run.tabId !== sender.tab?.id ||
      run.documentId !== sender.documentId || sender.frameId !== 0) throw new Error("La ejecución fue detenida o esta página no tiene autorización.");
  await sameSavedPage(run, sender);
  return run;
}
async function handle(message, sender) {
  if (!message || message.app !== "fb-unsave-all") return null;
  if (message.type === "status") {
    if (!extensionSender(sender)) throw new Error("Origen no autorizado.");
    return { run: await read(), sound: (await chrome.storage.session.get("errorSound")).errorSound || null };
  }
  if (message.type === "test-sound") {
    if (!extensionSender(sender)) throw new Error("Origen no autorizado.");
    return { sound: await playErrorSound(`test-${crypto.randomUUID()}`) };
  }
  if (message.type === "open") {
    if (!extensionSender(sender)) throw new Error("Origen no autorizado.");
    if ((await read())?.status === "running") throw new Error("Detén la ejecución antes de abrir otra página.");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = URLS[modeOf(message)];
    if (tab && validTabUrl(tab.url)) await chrome.tabs.update(tab.id, { url });
    else await chrome.tabs.create({ url });
    return { ok: true };
  }
  if (message.type === "inspect" || message.type === "start") {
    if (!extensionSender(sender)) throw new Error("Origen no autorizado.");
    const mode = modeOf(message);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !validTabUrl(tab.url)) throw new Error("Abre la pestaña de Facebook que vas a limpiar.");
    const result = await inspectTab(tab.id, mode);
    if (!result?.ok) throw new Error(result?.error || "No se pudo comprobar la página.");
    if (!result.inspection || typeof result.inspection.ready !== "boolean") throw new Error("La página devolvió una respuesta incompatible. Recarga la extensión y después Facebook.");
    if (mode === "saved" && result.inspection.mode !== "saved") throw new Error("Facebook conserva un script anterior. Recarga la extensión en chrome://extensions y después Facebook para activar el modo Guardados.");
    let savedUrl = null;
    let savedCollection = false;
    if (mode === "saved") {
      savedUrl = savedPageUrl(tab.url);
      savedCollection = new URL(savedUrl).searchParams.has("list_id");
      if (result.inspection.pageUrl !== savedUrl || result.inspection.collection !== savedCollection) {
        throw new Error("La vista cambió o Facebook conserva un script anterior. Recarga la extensión y Facebook y vuelve a comprobar.");
      }
    }
    if (message.type === "inspect") return { inspection: result.inspection };
    if ((await read())?.status === "running") throw new Error("Ya hay una ejecución activa; deténla primero.");
    if (message.acknowledged !== true) throw new Error("Debes confirmar que quieres quitar los guardados.");
    const maxBatches = mode === "activity" ? Number(message.maxBatches) : 0;
    const maxItems = mode === "saved" ? Number(message.maxItems ?? 0) : 0;
    const delaySeconds = Number(message.delaySeconds);
    if (mode === "activity" && (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 500)) throw new Error("El límite debe estar entre 1 y 500 lotes.");
    if (mode === "saved" && (!Number.isInteger(maxItems) || maxItems < 0 || maxItems > 100000)) throw new Error("El límite debe ser 0 (todos los cargados) o entre 1 y 100000 elementos.");
    const minimum = mode === "saved" ? 0.1 : 3;
    const validPrecision = Number.isFinite(delaySeconds) && (mode === "saved"
      ? Number(delaySeconds.toFixed(1)) === delaySeconds
      : Number.isInteger(delaySeconds));
    if (!validPrecision || delaySeconds < minimum || delaySeconds > 3600) {
      throw new Error(mode === "saved"
        ? "La pausa debe estar entre 0.1 y 3600 segundos, en pasos de 0.1."
        : "La pausa debe estar entre 3 y 3600 segundos enteros.");
    }
    if (!result.inspection.ready || result.inspection.empty) throw new Error("La lista no está lista o ya está vacía.");
    if (mode === "saved") {
      const [latestTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (latestTab?.id !== tab.id || savedPageUrl(latestTab.url) !== savedUrl) {
        throw new Error("La pestaña o la colección cambió mientras se comprobaba. Vuelve a comprobarla.");
      }
    }
    const run = await write({
      id: crypto.randomUUID(), tabId: tab.id, documentId: null, status: "running", phase: "starting",
      mode, savedUrl, savedCollection, maxBatches, maxItems, planned: 0, pendingKey: null, pendingKind: null,
      anonymousBefore: 0, anonymousGroups: [], lastCompletedKey: null,
      delayMs: Math.round(delaySeconds * 1000), batches: 0, processed: 0, pendingSelected: 0,
      lastFingerprint: null, awaitingVerification: false, notBefore: 0,
      startedAt: Date.now(), message: "Iniciando…"
    });
    try {
      const started = await chrome.tabs.sendMessage(tab.id, { app: "fb-unsave-all", type: "go" }, { frameId: 0 });
      if (!started?.ok) throw new Error(started?.error || "La página no pudo iniciar la ejecución.");
    }
    catch (error) { await write({ ...run, status: "blocked", message: String(error) }); throw error; }
    return { run };
  }
  if (message.type === "stop") {
    if (!extensionSender(sender)) throw new Error("Origen no autorizado.");
    const run = await read();
    if (run) {
      await write({ ...run, status: "stopped", message: "Detenido por el usuario. Una eliminación ya confirmada no puede cancelarse." });
      chrome.tabs.sendMessage(run.tabId, { app: "fb-unsave-all", type: "stop" }, { frameId: 0 }).catch(() => {});
    }
    return { ok: true };
  }
  if (message.type === "hello") {
    const run = await read();
    if (!run || run.status !== "running" || sender.tab?.id !== run.tabId || sender.frameId !== 0) return { run: null };
    if (run.documentId && run.documentId !== sender.documentId && run.phase !== "reloading") {
      await write({ ...run, status: "blocked", message: "Recarga o navegación inesperada. Revisa el resultado antes de iniciar otra ejecución." });
      return { run: null };
    }
    if (!validTabUrl(sender.tab.url)) throw new Error("Página no autorizada.");
    await sameSavedPage(run, sender);
    return { run: await write({ ...run, documentId: sender.documentId, phase: "ready" }) };
  }
  const run = await requireOwner(sender, message.id);
  if (message.type === "check") return { run };
  if (["saved-plan", "saved-pending", "saved-completed"].includes(message.type)) {
    if (run.mode !== "saved") throw new Error("La ejecución no está en el modo Guardados.");
    if (message.type === "saved-plan") {
      if (!["ready", "scrolling"].includes(run.phase) || run.pendingKey || !Number.isInteger(message.total) || message.total <= run.planned ||
          message.total > 100000 || (run.maxItems && message.total > run.maxItems)) throw new Error("Plan de elementos inválido.");
      return { run: await write({ ...run, planned: message.total }) };
    }
    const kind = message.kind || "identified";
    const anonymous = kind === "anonymous";
    const validKey = anonymous
      ? message.key === `anonymous-${run.processed + 1}`
      : kind === "identified" && /^[a-f0-9]{1,8}$/.test(message.key || "");
    if (!run.planned || run.processed >= run.planned || !validKey) throw new Error("Elemento pendiente inválido.");
    if (message.type === "saved-pending") {
      if (run.phase !== "selecting" || run.pendingKey || message.key === run.lastCompletedKey || Date.now() < run.notBefore) throw new Error("No se puede eliminar otro elemento en este estado.");
      if (anonymous && (!Number.isInteger(message.anonymousBefore) || message.anonymousBefore < 1 || message.anonymousBefore > 100000)) {
        throw new Error("Cantidad inicial de tarjetas vacías inválida.");
      }
      const anonymousGroups = anonymous ? (message.anonymousGroups || []) : [];
      if (!Array.isArray(anonymousGroups) || anonymousGroups.length > 2 ||
          anonymousGroups.some((count) => !Number.isInteger(count) || count < 1 || count > message.anonymousBefore)) {
        throw new Error("Los grupos iniciales de tarjetas sin identificar no son válidos.");
      }
      return { run: await write({ ...run, pendingKey: message.key, pendingKind: kind,
        anonymousBefore: anonymous ? message.anonymousBefore : 0, anonymousGroups, phase: "deleting" }) };
    }
    if (run.phase !== "waiting" || run.pendingKey !== message.key || (run.pendingKind || "identified") !== kind || message.evidenceVerified !== true) throw new Error("No se ha verificado la eliminación del elemento pendiente.");
    if (anonymous) {
      const wholeList = (!message.completionKind || message.completionKind === "anonymous-list") &&
        Number.isInteger(message.anonymousAfter) && message.anonymousAfter === run.anonymousBefore - 1 && message.peersUnchanged === true;
      const group = message.completionKind === "anonymous-group" && message.targetAbsent === true &&
        message.anchorsVerified === true && Number.isInteger(message.groupIndex) && message.groupIndex >= 0 &&
        message.groupIndex < run.anonymousGroups.length && Number.isInteger(message.groupAfter) &&
        message.groupAfter === run.anonymousGroups[message.groupIndex] - 1;
      if (!wholeList && !group) {
        throw new Error("No se comprobó una reducción de una tarjeta sin identificar en la lista o en un grupo autorizado.");
      }
    }
    return { run: await write({ ...run, processed: run.processed + 1, pendingKey: null, pendingKind: null,
      anonymousBefore: 0, anonymousGroups: [], lastCompletedKey: message.key,
      lastCompletionKind: anonymous ? (message.completionKind || "anonymous-list") : "identified",
      phase: "ready", notBefore: Date.now() + run.delayMs, message: `Elemento ${run.savedCollection ? "quitado de la colección" : "eliminado"} y comprobado. ${run.processed + 1} de ${run.planned}.` }) };
  }
  if (message.type === "phase") {
    const allowed = ["selecting", "confirming", "deleting", "waiting", "cooldown", "verifying", "scrolling"];
    if (!allowed.includes(message.phase)) throw new Error("Fase inválida.");
    if (run.mode === "saved" && ["confirming", "verifying"].includes(message.phase)) throw new Error("Fase no válida para Guardados.");
    if (run.mode !== "saved" && message.phase === "scrolling") throw new Error("Fase no válida para Registro de actividad.");
    const update = { ...run, phase: message.phase, message: String(message.text || message.phase) };
    if (message.phase === "confirming") {
      if (!Number.isInteger(message.selected) || message.selected < 1 || message.selected > 10000) throw new Error("Contador inválido.");
      update.pendingSelected = message.selected;
      update.lastFingerprint = String(message.fingerprint);
    }
    if (message.phase === "verifying") {
      if (run.awaitingVerification && run.pendingSelected > 0) {
        update.batches = run.batches + 1;
        update.processed = run.processed + run.pendingSelected;
        update.pendingSelected = 0;
      }
      update.awaitingVerification = false;
    }
    return { run: await write(update) };
  }
  if (message.type === "finish" || message.type === "fail") {
    return { run: await write({ ...run, status: message.type === "finish" ? "finished" : "blocked", message: String(message.text) }) };
  }
  if (message.type === "reload") {
    if (run.mode === "saved") throw new Error("El modo Guardados no recarga la página entre elementos.");
    const validCompletion = message.evidenceVerified === true &&
      ((message.completionKind === "loading" && message.loadingObserved === true) ||
       message.completionKind === "empty" || message.completionKind === "items-removed" ||
       (message.completionKind === "readiness" && message.selectionResetObserved === true && message.interactionReady === true));
    if (run.phase !== "waiting" || run.pendingSelected < 1 || !validCompletion) throw new Error("Recarga rechazada: no se ha verificado el fin de la eliminación.");
    await write({ ...run, phase: "reloading",
      awaitingVerification: true, lastCompletionKind: message.completionKind,
      notBefore: Date.now() + run.delayMs, message: "Página disponible. Recargando para verificar la eliminación antes de continuar…" });
    try { await chrome.tabs.reload(run.tabId, { bypassCache: false }); }
    catch (error) {
      const latest = await read();
      await write({ ...latest, status: "blocked", message: `No se pudo recargar: ${error.message}` });
      throw error;
    }
    return { ok: true };
  }
  throw new Error("Mensaje desconocido.");
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.app !== "fb-unsave-all" || message.target === "error-audio") return false;
  // Serialize storage changes so Stop cannot race a stale update from a page.
  queue = queue.then(async () => {
    const generation = alertGeneration;
    try { reply({ ok: true, ...await handle(message, sender) }); }
    catch (error) {
      const userAction = extensionSender(sender) && ["open", "inspect", "start", "stop"].includes(message.type);
      // A Start failure may already have blocked its new run. Alert once, not twice.
      if (userAction && generation === alertGeneration) {
        alertGeneration++;
        void playErrorSound(`action-${crypto.randomUUID()}`);
      }
      reply({ ok: false, error: error.message });
    }
  });
  return true;
});
chrome.tabs.onRemoved.addListener((tabId) => {
  queue = queue.then(async () => {
    const run = await read();
    if (run?.tabId === tabId && run.status === "running") await write({ ...run, status: "stopped", message: "Se cerró la pestaña de la ejecución." });
  }).catch(() => {});
});
