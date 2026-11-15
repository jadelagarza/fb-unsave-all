/* One item at a time; discover more cards by scrolling, never by reloading. */
(() => {
  "use strict";
  globalThis.runFBSaved = async function (run, { send, alive, pause }) {
    const dom = globalThis.FBSaved;
    async function check() {
      alive();
      dom.assertPage();
      run = (await send("check", { id: run.id })).run;
      alive();
    }
    async function waitFor(read, timeout, error) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        await check();
        const value = read();
        if (value) return value;
        await pause(100);
      }
      throw new Error(error);
    }
    async function phase(value, text) {
      await check();
      run = (await send("phase", { id: run.id, phase: value, text })).run;
    }
    await check();
    if (!dom.inspect().ready) throw new Error("Carga las tarjetas de Guardados y cierra sus menús antes de iniciar.");
    const completed = new Set();
    const seen = new Set();
    async function discover() {
      const current = dom.cards();
      for (const item of current) seen.add(item.key);
      const total = run.maxItems ? Math.min(seen.size, run.maxItems) : seen.size;
      if (total > run.planned) run = (await send("saved-plan", { id: run.id, total })).run;
      return current.find((item) => !completed.has(item.key));
    }
    async function loadMore() {
      await phase("scrolling", "Desplazando para cargar más elementos guardados…");
      for (let attempt = 0; attempt < 3; attempt++) {
        await check();
        dom.scrollMore();
        const deadline = Date.now() + 2500;
        const loadingDeadline = Date.now() + 30000;
        while (Date.now() < deadline || dom.loading()) {
          await check();
          if (Date.now() >= loadingDeadline) throw new Error("Facebook sigue cargando más tarjetas. Se detuvo para revisión.");
          const next = await discover();
          if (next && !dom.loading()) return next;
          await pause(100);
        }
      }
      return null;
    }
    let reason = "";
    while (!run.maxItems || run.processed < run.maxItems) {
      let next = await discover();
      if (!next) next = await loadMore();
      if (!next) {
        reason = dom.deletionState("").empty ? "Facebook muestra una lista vacía." :
          "Facebook no entregó nuevas tarjetas después de desplazar. Esto no confirma que toda la cuenta esté vacía.";
        break;
      }
      const key = next.key;
      // The delay starts only after the previous removal was verified. Stop remains responsive.
      if (Date.now() < run.notBefore) {
        await phase("cooldown", `Pausa de ${run.delayMs / 1000} s entre elementos…`);
        while (Date.now() < run.notBefore) { await check(); await pause(Math.min(100, run.notBefore - Date.now())); }
      }
      await phase("selecting", `Abriendo menú del elemento ${run.processed + 1}…`);
      if (dom.openMenus().length) throw new Error("Hay un menú abierto ajeno a la operación. Ciérralo y revisa la página.");
      let card = dom.cards().find((item) => item.key === key);
      if (!card) throw new Error("Una tarjeta pendiente desapareció antes de procesarla. Revisa la lista.");
      card.more.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      await waitFor(() => {
        card = dom.cards().find((item) => item.key === key);
        return card && dom.clickable(card.more) && !dom.loading();
      }, 10000, "El botón de tres puntos no está disponible o está cubierto.");
      const before = dom.openMenus();
      await check();
      card.more.click();
      const remove = await waitFor(() => dom.menuDelete(before, card.more), 10000,
        'No apareció una única opción «Eliminar» en el menú de la tarjeta. No se hizo clic en otra opción.');
      await check();
      if (!dom.cards().some((item) => item.key === key) || !dom.clickable(remove)) {
        throw new Error("La tarjeta o su menú cambiaron antes de eliminar. Revisa la página.");
      }
      run = (await send("saved-pending", { id: run.id, key })).run;
      await check();
      remove.click();
      await phase("waiting", "Esperando a comprobar que desapareció la tarjeta…");
      let since = 0;
      let signature;
      await waitFor(() => {
        const state = dom.deletionState(key);
        if (!state.removed || !state.ready || !state.hasList) { since = 0; return false; }
        if (!since || signature !== state.signature) { signature = state.signature; since = Date.now(); }
        return Date.now() - since >= 1000;
      }, 30000, "No se pudo verificar la eliminación de la tarjeta. Se detuvo sin reintentar ni recargar; revisa Guardados.");
      await check();
      run = (await send("saved-completed", { id: run.id, key, evidenceVerified: true })).run;
      completed.add(key);
    }
    await check();
    if (!reason) reason = "Se alcanzó el máximo de elementos configurado.";
    await send("finish", { id: run.id, text: `${run.processed} elementos procesados. ${reason}` });
  };
})();
