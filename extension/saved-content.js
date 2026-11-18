/* One item at a time; discover more cards by scrolling, never by reloading. */
(() => {
  "use strict";
  globalThis.runFBSaved = async function (run, { send, alive, pause }) {
    const dom = globalThis.FBSaved;
    const collection = Boolean(run.savedCollection);
    const action = collection ? "Eliminar de la colección" : "Eliminar";
    async function check() {
      alive();
      dom.assertPage(run.savedUrl);
      run = (await send("check", { id: run.id })).run;
      alive();
      dom.assertPage(run.savedUrl);
    }
    async function waitFor(read, timeout, error) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        await check();
        const value = read();
        if (value) return value;
        await pause(100);
      }
      throw new Error(typeof error === "function" ? error() : error);
    }
    async function phase(value, text) {
      await check();
      run = (await send("phase", { id: run.id, phase: value, text })).run;
    }
    await check();
    if (!dom.inspect().ready) throw new Error("Carga las tarjetas de Guardados y cierra sus menús antes de iniciar.");
    const completed = new Set();
    const seen = new Set();
    let anonymousCompleted = 0;
    async function discover() {
      const current = dom.cards();
      for (const item of current) {
        if (item.repeatedKey && !completed.has(item.repeatedKey)) seen.delete(item.repeatedKey);
        if (!item.anonymous) seen.add(item.key);
      }
      const discovered = seen.size + anonymousCompleted + current.filter((item) => item.anonymous).length;
      const total = run.maxItems ? Math.min(discovered, run.maxItems) : discovered;
      if (total > run.planned) run = (await send("saved-plan", { id: run.id, total })).run;
      return current.find((item) => item.anonymous || !completed.has(item.key));
    }
    function pendingCard(current, preferred) {
      const pending = (item) => item.anonymous || !completed.has(item.key);
      return current.find((item) => item.more === preferred?.more && pending(item)) ||
        (!preferred?.anonymous && current.find((item) => !item.anonymous && item.key === preferred?.key && pending(item))) ||
        current.find(pending);
    }
    async function loadMore() {
      await phase("scrolling", "Desplazando para cargar más elementos guardados…");
      for (let attempt = 0; attempt < 3; attempt++) {
        await check();
        dom.scrollMore();
        const deadline = Date.now() + 2500;
        const loadingDeadline = Date.now() + 30000;
        while (Date.now() < deadline || dom.moreLoading()) {
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
        reason = dom.deletionState("").empty ? (collection ? "Facebook muestra la colección vacía. La colección se conserva." : "Facebook muestra una lista vacía.") :
          "Facebook no entregó nuevas tarjetas después de desplazar. Esto no confirma que toda la cuenta esté vacía.";
        break;
      }
      // The delay starts only after the previous removal was verified. Stop remains responsive.
      if (Date.now() < run.notBefore) {
        await phase("cooldown", `Pausa de ${run.delayMs / 1000} s entre elementos…`);
        while (Date.now() < run.notBefore) { await check(); await pause(Math.min(100, run.notBefore - Date.now())); }
      }
      await phase("selecting", `Abriendo menú del elemento ${run.processed + 1}…`);
      if (dom.openMenus().length) throw new Error("Hay un menú abierto ajeno a la operación. Ciérralo y revisa la página.");
      let card = pendingCard(dom.cards(), next);
      if (!card) throw new Error("Una tarjeta pendiente desapareció antes de procesarla. Revisa la lista.");
      card.more.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      await waitFor(() => {
        const current = dom.cards();
        const fresh = pendingCard(current, card);
        if (fresh && fresh.more !== card?.more) {
          fresh.more.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
        }
        card = fresh;
        return card && dom.clickable(card.more) && !dom.loading();
      }, 10000, "El botón de tres puntos no está disponible o está cubierto.");
      const before = dom.openMenus();
      await check();
      card.more.click();
      const remove = await waitFor(() => dom.menuDelete(before, card.more), 10000,
        `No apareció una única opción «${action}» en el menú de la tarjeta. No se hizo clic en otra opción.`);
      await check();
      // Bind the operation to the control whose menu is already open. A key can
      // become shared while scrolling/loading, without invalidating this card.
      const openedMore = card.more;
      card = dom.cards().find((item) => item.more === openedMore);
      if (!card) throw new Error("El elemento cambió después de abrir su menú. Revisa la página.");
      const anonymous = Boolean(card.anonymous);
      const kind = anonymous ? "anonymous" : "identified";
      const key = anonymous ? `anonymous-${run.processed + 1}` : card.key;
      const snapshot = anonymous ? dom.captureAnonymous(card) : key;
      if ((!anonymous && !dom.cards().some((item) => item.key === key)) || !dom.clickable(remove)) {
        throw new Error("La tarjeta o su menú cambiaron antes de eliminar. Revisa la página.");
      }
      run = (await send("saved-pending", {
        id: run.id, key, kind,
        ...(anonymous ? { anonymousBefore: snapshot.beforeAnonymous, anonymousGroups: snapshot.groups.map((group) => group.before) } : {})
      })).run;
      await check();
      if (anonymous && !dom.anonymousTargetReady(card, snapshot)) {
        throw new Error("El elemento o su lista cambiaron antes de eliminar. Revisa la página.");
      }
      remove.click();
      await phase("waiting", anonymous
        ? "Comprobando la retirada de la tarjeta sin identificar y sus referencias cercanas…"
        : "Esperando a comprobar que desapareció la tarjeta…");
      let since = 0;
      let signature;
      let lastState;
      const completion = await waitFor(() => {
        const state = lastState = dom.deletionState(snapshot);
        if (!state.removed || !state.ready || !state.hasList) { since = 0; return false; }
        if (!since || signature !== state.signature) { signature = state.signature; since = Date.now(); }
        return Date.now() - since >= (anonymous ? 1500 : 1000) ? state : null;
      }, 30000, () => {
        const reasons = {
          "loading": "Facebook sigue mostrando carga pendiente",
          "menu": "el menú de la tarjeta sigue abierto",
          "dialog": "hay un diálogo pendiente en Facebook",
          "no-list": "no se reconoce una lista disponible ni un estado vacío explícito",
          "target-present": "la tarjeta original sigue presente",
          "identity-changed": "apareció información identificable dentro del grupo observado; no se puede atribuir el cambio a una retirada",
          "references-lost": "cambió la estructura de la lista y se perdieron las referencias necesarias para comprobar la tarjeta",
          "count-mismatch": "el grupo observado no disminuyó exactamente en una tarjeta",
          "unstable": "el resultado no permaneció estable el tiempo necesario"
        };
        const detail = reasons[lastState?.reason] || "no se obtuvo evidencia suficiente de la retirada";
        return `No se pudo verificar la eliminación de la tarjeta. Motivo: ${detail}. Se detuvo sin reintentar ni recargar; revisa la vista abierta.`;
      });
      await check();
      run = (await send("saved-completed", {
        id: run.id, key, kind, evidenceVerified: true,
        ...(anonymous ? {
          completionKind: completion.completionKind,
          anonymousAfter: completion.anonymousAfter, peersUnchanged: completion.peersUnchanged,
          groupIndex: completion.groupIndex, groupAfter: completion.groupAfter,
          anchorsVerified: completion.anchorsVerified, targetAbsent: completion.targetAbsent
        } : {})
      })).run;
      if (anonymous) anonymousCompleted++;
      else {
        completed.add(key);
        dom.rememberRemoved(key);
      }
    }
    await check();
    if (!reason) reason = "Se alcanzó el máximo de elementos configurado.";
    await send("finish", { id: run.id, text: `${run.processed} elementos ${collection ? "quitados de la colección" : "procesados"}. ${reason}` });
  };
})();
