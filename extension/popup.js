"use strict";
const $ = (id) => document.getElementById(id);
let restored = false;
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
  const response = await chrome.runtime.sendMessage({ app: "fb-unsave-all", type, ...fields });
  if (!response?.ok) throw new Error(response?.error || "La extensión no respondió.");
  return response;
}
async function action(fn) {
  $("error").textContent = "";
  try { await fn(); await refresh(); }
  catch (error) { $("error").textContent = error.message; }
}
async function refresh() {
  const { run } = await request("status");
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
  $("message").textContent = run?.message || "La extensión no actúa hasta que pulses Iniciar.";
  $("completed").textContent = String(run?.batches || 0);
  $("processed").textContent = String(run?.processed || 0);
  $("start").disabled = running;
  $("open").disabled = running;
  $("stop").disabled = !running;
  $("mode").disabled = running;
  $("inspect").disabled = running;
  for (const id of ["items", "item-delay", "batches", "delay", "ack"]) {
    $(id).disabled = running || (["items", "item-delay"].includes(id) ? $("mode").value !== "saved" :
      ["batches", "delay"].includes(id) ? $("mode").value !== "activity" : false);
  }
  const saved = (run?.mode || $("mode").value) === "saved";
  $("batch-metric").hidden = saved;
  $("counter-hint").textContent = saved ? "*Se contabilizan cuando se comprueba que la tarjeta desapareció. Comprueba también el resultado en Guardados." :
    "*Se contabilizan después de verificar la página recargada. Comprueba también el resultado en Guardados.";
}
$("mode").addEventListener("change", () => { renderMode(); void action(refresh); });
$("open").addEventListener("click", () => action(() => request("open", { mode: $("mode").value })));
$("inspect").addEventListener("click", () => action(async () => {
  const { inspection: result } = await request("inspect", { mode: $("mode").value });
  $("inspection").textContent = result.mode === "saved" ? (result.ready ? `${result.loaded} tarjetas reconocidas. Listo para eliminar una por una y desplazar cuando sea necesario.` :
    `Se reconocieron ${result.loaded} tarjetas. Carga elementos y cierra menús o diálogos antes de iniciar.`) : result.empty ? "Facebook muestra una lista vacía." :
    result.ready ? 'Página reconocida. Casilla «Todo» disponible y sin selección previa.' :
      `La página no está lista. Cargando: ${result.loading ? "sí" : "no"}; diálogos: ${result.dialogs}.`;
}));
$("form").addEventListener("submit", (event) => {
  event.preventDefault();
  void action(() => request("start", { acknowledged: $("ack").checked,
    mode: $("mode").value, maxItems: Number($("items").value), maxBatches: Number($("batches").value),
    delaySeconds: Number($($("mode").value === "saved" ? "item-delay" : "delay").value) }));
});
$("stop").addEventListener("click", () => action(() => request("stop")));
renderMode();
void action(refresh);
setInterval(() => { void refresh().catch((error) => { $("error").textContent = error.message; }); }, 1000);
