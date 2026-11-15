"use strict";
const KEY = "run";
const SAVED_URL = "https://www.facebook.com/me/allactivity/?category_key=SAVEDFORLATER";
let queue = Promise.resolve();
const read = async () => (await chrome.storage.session.get(KEY))[KEY] || null;
const write = async (run) => { await chrome.storage.session.set({ [KEY]: run }); return run; };
function extensionSender(sender) {
  return !sender.tab && sender.url?.startsWith(chrome.runtime.getURL(""));
}
function validTabUrl(url) {
  try { return new URL(url).origin === "https://www.facebook.com"; } catch { return false; }
}
async function requireOwner(sender, id) {
  const run = await read();
  if (!run || run.status !== "running" || run.id !== id || run.tabId !== sender.tab?.id ||
      run.documentId !== sender.documentId || sender.frameId !== 0) throw new Error("La ejecución fue detenida o esta página no tiene autorización.");
  return run;
}
async function handle(message, sender) {
  if (!message || message.app !== "fb-unsave-all") return null;
  if (message.type === "status") {
    if (!extensionSender(sender)) throw new Error("Origen no autorizado.");
    return { run: await read() };
  }
  if (message.type === "open") {
    if (!extensionSender(sender)) throw new Error("Origen no autorizado.");
    if ((await read())?.status === "running") throw new Error("Detén la ejecución antes de abrir otra página.");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && validTabUrl(tab.url)) await chrome.tabs.update(tab.id, { url: SAVED_URL });
    else await chrome.tabs.create({ url: SAVED_URL });
    return { ok: true };
  }
  if (message.type === "inspect" || message.type === "start") {
    if (!extensionSender(sender)) throw new Error("Origen no autorizado.");
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !validTabUrl(tab.url)) throw new Error("Abre la pestaña de Facebook que vas a limpiar.");
    let result;
    try { result = await chrome.tabs.sendMessage(tab.id, { app: "fb-unsave-all", type: "inspect" }, { frameId: 0 }); }
    catch { throw new Error("Recarga Facebook una vez para activar la extensión recién instalada."); }
    if (!result?.ok) throw new Error(result?.error || "No se pudo comprobar la página.");
    if (message.type === "inspect") return { inspection: result.inspection };
    if ((await read())?.status === "running") throw new Error("Ya hay una ejecución activa; deténla primero.");
    if (message.acknowledged !== true) throw new Error("Debes confirmar que quieres quitar los guardados.");
    const maxBatches = Number(message.maxBatches);
    const delaySeconds = Number(message.delaySeconds);
    if (!Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 500) throw new Error("El límite debe estar entre 1 y 500 lotes.");
    if (!Number.isInteger(delaySeconds) || delaySeconds < 3 || delaySeconds > 3600) throw new Error("La pausa debe estar entre 3 y 3600 segundos.");
    if (!result.inspection.ready || result.inspection.empty) throw new Error("La lista no está lista o ya está vacía.");
    const run = await write({
      id: crypto.randomUUID(), tabId: tab.id, documentId: null, status: "running", phase: "starting",
      maxBatches, delayMs: delaySeconds * 1000, batches: 0, processed: 0, pendingSelected: 0,
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
      await write({ ...run, status: "blocked", message: "Recarga o navegación inesperada. Revisa el lote antes de iniciar otra ejecución." });
      return { run: null };
    }
    if (!validTabUrl(sender.tab.url)) throw new Error("Página no autorizada.");
    return { run: await write({ ...run, documentId: sender.documentId, phase: "ready" }) };
  }
  const run = await requireOwner(sender, message.id);
  if (message.type === "check") return { run };
  if (message.type === "phase") {
    const allowed = ["selecting", "confirming", "deleting", "waiting", "cooldown", "verifying"];
    if (!allowed.includes(message.phase)) throw new Error("Fase inválida.");
    const update = { ...run, phase: message.phase, message: String(message.text || message.phase) };
    if (message.phase === "confirming") {
      if (!Number.isInteger(message.selected) || message.selected < 1 || message.selected > 10000) throw new Error("Contador inválido.");
      update.pendingSelected = message.selected;
      update.lastFingerprint = String(message.fingerprint);
    }
    if (message.phase === "verifying") update.awaitingVerification = false;
    return { run: await write(update) };
  }
  if (message.type === "finish" || message.type === "fail") {
    return { run: await write({ ...run, status: message.type === "finish" ? "finished" : "blocked", message: String(message.text) }) };
  }
  if (message.type === "reload") {
    if (run.phase !== "waiting" || run.pendingSelected < 1 || message.loadingObserved !== true) throw new Error("Recarga rechazada: no se ha verificado el ciclo de carga.");
    await write({ ...run, phase: "reloading", batches: run.batches + 1,
      processed: run.processed + run.pendingSelected, pendingSelected: 0,
      awaitingVerification: true, notBefore: Date.now() + run.delayMs, message: "Carga finalizada. Recargando la página…" });
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
  if (message?.app !== "fb-unsave-all") return false;
  // Serialize storage changes so Stop cannot race a stale update from a page.
  queue = queue.then(() => handle(message, sender)).then(
    (result) => reply({ ok: true, ...result }),
    (error) => reply({ ok: false, error: error.message })
  );
  return true;
});
chrome.tabs.onRemoved.addListener((tabId) => {
  queue = queue.then(async () => {
    const run = await read();
    if (run?.tabId === tabId && run.status === "running") await write({ ...run, status: "stopped", message: "Se cerró la pestaña de la ejecución." });
  }).catch(() => {});
});
