"use strict";
const $ = (id) => document.getElementById(id);
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
  $("status").textContent = labels[run?.status] || "Sin ejecución";
  $("message").textContent = run?.message || "La extensión no actúa hasta que pulses Iniciar.";
  $("completed").textContent = String(run?.batches || 0);
  $("processed").textContent = String(run?.processed || 0);
  $("start").disabled = running;
  $("open").disabled = running;
  $("stop").disabled = !running;
}
$("open").addEventListener("click", () => action(() => request("open")));
$("inspect").addEventListener("click", () => action(async () => {
  const { inspection: result } = await request("inspect");
  $("inspection").textContent = result.empty ? "Facebook muestra una lista vacía." :
    result.ready ? 'Página reconocida. Casilla «Todo» disponible y sin selección previa.' :
      `La página no está lista. Cargando: ${result.loading ? "sí" : "no"}; diálogos: ${result.dialogs}.`;
}));
$("form").addEventListener("submit", (event) => {
  event.preventDefault();
  void action(() => request("start", { acknowledged: $("ack").checked,
    maxBatches: Number($("batches").value), delaySeconds: Number($("delay").value) }));
});
$("stop").addEventListener("click", () => action(() => request("stop")));
void action(refresh);
setInterval(() => { void refresh().catch((error) => { $("error").textContent = error.message; }); }, 1000);
