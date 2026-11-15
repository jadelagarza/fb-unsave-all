"use strict";
const $ = (id) => document.getElementById(id);
let restored = false;
let inspecting = false;
let refreshing = false;
let currentRun = null;
function renderMode() {
  const saved = $("mode").value === "saved";
  $("saved-fields").hidden = $("saved-hint").hidden = !saved;
  $("activity-fields").hidden = $("activity-hint").hidden = saved;
  for (const id of ["items", "item-delay"]) $(id).disabled = !saved;
  for (const id of ["batches", "delay"]) $(id).disabled = saved;
  $("inspection").textContent = saved ? "Abre Guardados. Puedes cargar tarjetas deslizando; la extensión también desplazará cuando haga falta." :
    "Abre Tus elementos guardados dentro del Registro de actividad.";
}
async function request(type, fields = {}) {
  let timer;
  try {
    const responsePromise = chrome.runtime.sendMessage({ app: "fb-unsave-all", type, ...fields });
    // Read-only requests may time out safely. Do not silently abandon a Start or Stop.
    const timeout = type === "inspect" ? 10000 : type === "status" ? 3000 : 0;
    const response = timeout ? await Promise.race([responsePromise, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("La extensión no respondió. Recarga la extensión en chrome://extensions y después la pestaña de Facebook.")), timeout);
    })]) : await responsePromise;
    if (!response?.ok) throw new Error(response?.error || "La extensión no respondió.");
    return response;
  } finally { clearTimeout(timer); }
}
function showError(error, scroll = false) {
  $("error").textContent = error.message;
  if (scroll) $("error").scrollIntoView({ block: "nearest" });
}
function renderMessage() {
  const run = currentRun;
  let message = run?.message || "La extensión no actúa hasta que pulses Iniciar.";
  if (run?.status === "running" && run.phase === "cooldown" && Number.isFinite(run.notBefore) && run.notBefore > 0) {
    const seconds = Math.max(0, Math.ceil((run.notBefore - Date.now()) / 1000));
    const next = run.mode === "saved" ? "elemento" : "lote";
    message = seconds > 0 ? `Esperando ${seconds} s para continuar con el siguiente ${next}…` :
      "Pausa terminada. Esperando el siguiente paso…";
  }
  if ($("message").textContent !== message) $("message").textContent = message;
}
function renderControls() {
  const running = currentRun?.status === "running";
  const busy = running || inspecting;
  for (const id of ["start", "open", "mode", "inspect"]) $(id).disabled = busy;
  $("stop").disabled = !running;
  $("inspect").textContent = inspecting ? "Comprobando…" : "2. Comprobar esta página";
  $("inspection").setAttribute("aria-busy", String(inspecting));
  for (const id of ["items", "item-delay", "batches", "delay", "ack"]) {
    $(id).disabled = busy || (["items", "item-delay"].includes(id) ? $("mode").value !== "saved" :
      ["batches", "delay"].includes(id) ? $("mode").value !== "activity" : false);
  }
}
async function action(fn) {
  $("error").textContent = "";
  try { await fn(); await refresh(); }
  catch (error) { showError(error, true); }
}
async function refresh() {
  if (inspecting || refreshing) return;
  refreshing = true;
  try {
  const { run } = await request("status");
  currentRun = run;
  const labels = { running: "En ejecución", stopped: "Detenido", blocked: "Requiere revisión", finished: "Finalizado" };
  const running = run?.status === "running";
  if (!restored && running) {
    $("mode").value = run.mode || "activity";
    $(run.mode === "saved" ? "items" : "batches").value = String(run.mode === "saved" ? run.maxItems : run.maxBatches);
    $(run.mode === "saved" ? "item-delay" : "delay").value = String(run.delayMs / 1000);
    renderMode();
  }
  restored = true;
  $("status").textContent = labels[run?.status] || "Sin ejecución";
  renderMessage();
  $("completed").textContent = String(run?.batches || 0);
  $("processed").textContent = String(run?.processed || 0);
  renderControls();
  const saved = (run?.mode || $("mode").value) === "saved";
  $("batch-metric").hidden = saved;
  $("counter-hint").textContent = saved ? "*Se contabilizan cuando se comprueba que la tarjeta desapareció. Comprueba también el resultado en Guardados." :
    "*Se contabilizan después de verificar la página recargada. Comprueba también el resultado en Guardados.";
  } finally { refreshing = false; }
}
$("mode").addEventListener("change", () => { renderMode(); void action(refresh); });
$("open").addEventListener("click", () => action(() => request("open", { mode: $("mode").value })));
$("inspect").addEventListener("click", async () => {
  if (inspecting || currentRun?.status === "running") return;
  inspecting = true;
  $("error").textContent = "";
  $("inspection").dataset.state = "pending";
  $("inspection").textContent = "Comprobando esta página… No se eliminará ningún elemento.";
  renderControls();
  try {
    const { inspection: result } = await request("inspect", { mode: $("mode").value });
    $("inspection").dataset.state = result.ready ? "ready" : "review";
    $("inspection").textContent = result.mode === "saved" ? (result.ready ? `${result.loaded} tarjetas reconocidas. Listo para eliminar una por una y desplazar cuando sea necesario.` :
      `Se reconocieron ${result.loaded} tarjetas. Cargando: ${result.loading ? "sí" : "no"}; menús o diálogos: ${result.dialogs}. Carga elementos y cierra los menús antes de iniciar.`) : result.empty ? "Facebook muestra una lista vacía." :
      result.ready ? 'Página reconocida. Casilla «Todo» disponible y sin selección previa.' :
        `La página no está lista. Cargando: ${result.loading ? "sí" : "no"}; diálogos: ${result.dialogs}.`;
  } catch (error) {
    $("inspection").dataset.state = "error";
    $("inspection").textContent = `No se pudo comprobar esta página: ${error.message}`;
    $("inspection").scrollIntoView({ block: "nearest" });
  } finally {
    inspecting = false;
    renderControls();
  }
});
$("form").addEventListener("submit", (event) => {
  event.preventDefault();
  void action(() => request("start", { acknowledged: $("ack").checked,
    mode: $("mode").value, maxItems: Number($("items").value), maxBatches: Number($("batches").value),
    delaySeconds: Number($($("mode").value === "saved" ? "item-delay" : "delay").value) }));
});
$("stop").addEventListener("click", () => action(() => request("stop")));
renderMode();
$("version").textContent = `v${chrome.runtime.getManifest().version}`;
void action(refresh);
setInterval(() => { void refresh().catch((error) => { showError(error); }); }, 1000);
// Render from the existing deadline locally; no extra messages or Facebook actions.
setInterval(renderMessage, 250);
