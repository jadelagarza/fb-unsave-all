/* Adapter for the Saved page. No private endpoints or generated Facebook classes. */
(() => {
  "use strict";
  const { normalize, visible, visuallyVisible, name, unique } = globalThis.FBUnsave;
  let verified = null;
  let scrollArea = null;
  const controls = 'button,[role="button"]';
  const collectionNames = new Set(["agregar a coleccion", "agregar a la coleccion", "anadir a coleccion", "anadir a la coleccion", "add to collection"]);
  const moreNames = new Set([
    "mas",
    "mas opciones",
    "mas opciones para el elemento guardado",
    "opciones",
    "more",
    "more options",
    "options",
    "menu"
  ]);
  const shareNames = new Set(["compartir", "share"]);
  const actionNames = new Set([...collectionNames, ...moreNames, ...shareNames]);
  const deleteNames = new Set(["eliminar", "delete", "quitar de guardados", "eliminar de guardados", "unsave", "remove from saved"]);
  const headings = new Set(["guardado", "guardados", "elementos guardados", "tus elementos guardados", "saved", "saved items", "your saved items"]);
  const menusSelector = '[role="menu"],[role="listbox"]';
  const alertsSelector = '[role="alert"],[role="dialog"],[role="alertdialog"]';
  const errorPattern = /actividad sospechosa|confirma tu identidad|comprueba que eres tu|demasiadas solicitudes|vuelve a intentarlo mas tarde|se produjo un error|no se pudo (?:eliminar|quitar)|bloquea(?:do|mos) temporalmente|suspicious activity|confirm your identity|too many requests|try again later|something went wrong|couldn.t (?:remove|delete)|temporarily blocked/;
  const all = (scope, selector) => Array.from(scope.querySelectorAll(selector)).filter(visible);
  const cardElements = (scope, selector) => Array.from(scope.querySelectorAll(selector)).filter(visuallyVisible);
  const enabled = (el) => !el.disabled && el.getAttribute("aria-disabled") !== "true" && !el.closest("[inert]");
  // Keep only the outer interactive element if Facebook wraps a button in another button.
  const buttons = (scope) => cardElements(scope, controls).filter((el) => {
    const parent = el.parentElement?.closest(controls);
    return !parent || !scope.contains(parent);
  });
  function findScrollArea(start) {
    for (let node = start; node && node !== document.body; node = node.parentElement) {
      if (node.clientHeight > 0 && /auto|scroll|overlay/.test(getComputedStyle(node).overflowY)) return node;
    }
    return document.scrollingElement;
  }
  function hash(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(16);
  }
  function actionName(element) {
    const label = name(element);
    // Real Saved cards append ", <post title>" to the accessible control name.
    // Strip that context only for known card actions, never for Delete menu items.
    const prefix = label.split(",", 1)[0].trim();
    return actionNames.has(prefix) ? prefix : label;
  }
  const collectionControls = (scope) => buttons(scope).filter((el) => collectionNames.has(actionName(el)));
  function narrowestScope(candidates) {
    const inner = candidates.filter(({ scope }) => !candidates.some((other) => other.scope !== scope && scope.contains(other.scope)));
    if (inner.length !== 1) {
      throw new Error(`Se encontraron ${inner.length} áreas independientes con tarjetas de Guardados. No se puede determinar una única lista; no se hará clic.`);
    }
    const selected = inner[0].scope;
    // An outer main may also contain cards outside the inner list. Never silently
    // discard that second group merely because one main is nested inside another.
    for (const candidate of candidates) {
      for (const add of candidate.adds) {
        if (selected.contains(add)) continue;
        try { readCard(add, candidate.scope); }
        catch { continue; } // An unrelated collection control is not a saved card.
        throw new Error("Hay tarjetas de Guardados fuera del área identificada. La lista es ambigua; no se hará clic.");
      }
    }
    return selected;
  }
  function listScope(url) {
    const mains = all(document, 'main,[role="main"]');
    const previous = verified?.url === url && verified.scope.isConnected ? verified.scope : null;
    // Menus can hide the background only for accessibility. Reuse that exact scope
    // only after it was recognized in this document, not an arbitrary hidden main.
    if (previous && !mains.includes(previous) && visuallyVisible(previous) && all(document, menusSelector).length) mains.push(previous);
    const candidates = mains.map((scope) => ({ scope, adds: collectionControls(scope) })).filter((candidate) =>
      candidate.adds.some((add) => {
        try { readCard(add, candidate.scope); return true; }
        catch { return false; }
      }));
    if (candidates.length) return narrowestScope(candidates);
    // Keep the recognized feed while its last card disappears or while it loads.
    // Do not switch to the remaining sidebar just because it is now the only main.
    if (previous && mains.includes(previous)) return previous;
    if (mains.length === 1) return mains[0];
    const empty = mains.filter(hasEmptyMessage);
    if (empty.length) return narrowestScope(empty.map((scope) => ({ scope, adds: [] })));
    throw new Error("No se pudo identificar el área que contiene las tarjetas de Guardados. Espera a que carguen los elementos y vuelve a comprobar.");
  }
  function assertPage() {
    const url = new URL(location.href);
    if (url.origin !== "https://www.facebook.com" || !/^\/saved\/?$/.test(url.pathname) ||
        [...url.searchParams.keys()].some((key) => /collection|list_id/i.test(key))) {
      throw new Error("Abre https://www.facebook.com/saved/ en la vista de todos los guardados, fuera de una colección.");
    }
    if (!cardElements(document, 'h1,h2,h3,[role="heading"]').some((el) => headings.has(name(el)))) {
      throw new Error("No se reconoce el título de Guardados. No se hará clic.");
    }
    const scope = listScope(url.href);
    verified = { url: url.href, scope };
    if (all(document, alertsSelector).some((el) => errorPattern.test(normalize(el.innerText)))) {
      throw new Error("Facebook muestra un error o una verificación. Revisa la página manualmente.");
    }
    return scope;
  }
  function actionGroup(add, scope) {
    for (let group = add.parentElement; group && group !== scope; group = group.parentElement) {
      const list = buttons(group);
      if (list.filter((el) => collectionNames.has(actionName(el))).length !== 1) break;
      const more = list.filter((el) => el !== add && (moreNames.has(actionName(el)) || el.getAttribute("aria-haspopup") === "menu") && !shareNames.has(actionName(el)));
      // A recognized More action works with or without Facebook's Share button.
      if (more.length === 1) {
        return { group, more: more[0] };
      }
      // The observed layout is Add to collection, Share, More. Only open the third
      // button in that exact three-button group; deletion still requires a scoped menu.
      if (list.length === 3 && list[0] === add && !shareNames.has(actionName(list[2])) &&
          (!name(list[2]) || moreNames.has(actionName(list[2])))) return { group, more: list[2] };
    }
    throw new Error("No se pudo aislar el menú de tres puntos de una tarjeta. No se hará clic.");
  }
  function identity(card, group, add) {
    const entries = cardElements(card, 'a[href]')
      .filter((element) => !group.contains(element))
      .map((element) => {
        const url = new URL(element.getAttribute("href"), location.href);
        if (!/^https?:$/.test(url.protocol)) return null;

        for (const key of [...url.searchParams.keys()]) {
          if (/^(?:__|fbclid|ref$|refsrc$|mibextid$)/.test(key)) {
            url.searchParams.delete(key);
          }
        }
        url.hash = "";
        url.searchParams.sort();

        const facebook = /(^|\.)facebook\.com$/.test(url.hostname);
        const home = facebook && url.pathname === "/" && !url.search;
        const collection = facebook && /^\/saved\/?$/.test(url.pathname);
        return { element, url: url.href, home, generic: home || collection };
      })
      .filter(Boolean);

    const links = entries.filter((entry) => !entry.generic).map((entry) => entry.url);
    if (links.length) {
      return hash([...new Set(links)].sort().join("|"));
    }

    // Facebook sometimes links distinct saved products to its home page.
    // Use the item title, not a collection name, price, or position in the list.
    const label = name(add);
    const comma = label.indexOf(",");
    const contextTitle = comma >= 0 ? label.slice(comma + 1).trim() : "";
    const titles = contextTitle
      ? [contextTitle]
      : entries
          .filter((entry) => entry.home)
          .map((entry) => normalize(entry.element.innerText || ""))
          .filter(Boolean);

    if (!titles.length) {
      throw new Error("La tarjeta no ofrece un enlace propio ni un título identificable. Revisa el elemento manualmente.");
    }
    return hash(`title:${JSON.stringify([...new Set(titles)].sort())}`);
  }
  function readCard(add, scope) {
    const { group, more } = actionGroup(add, scope);
    let card = group;
    // The smallest ancestor with its own content link and exactly one action group
    // is the card. Do not promote a card to the entire feed.
    while (card && card !== scope) {
      if (collectionControls(card).length !== 1) break;
      if (cardElements(card, 'a[href]').some((el) => !group.contains(el))) {
        return { element: card, more, key: identity(card, group, add) };
      }
      card = card.parentElement;
    }
    throw new Error("No se pudo reconocer una tarjeta individual de Guardados.");
  }
  function cards() {
    const scope = assertPage();
    const result = collectionControls(scope).map((add) => readCard(add, scope));
    if (new Set(result.map((card) => card.key)).size !== result.length) {
      throw new Error("Hay tarjetas con identidades ambiguas. Revisa la lista antes de eliminar.");
    }
    if (result.length) scrollArea = findScrollArea(result.at(-1).element.parentElement);
    return result;
  }
  function loadingIndicators(scope) {
    return all(scope, '[role="progressbar"],[aria-busy="true"],[data-visualcompletion="loading-state"]');
  }
  function footerLoaders(scope) {
    const adds = collectionControls(scope);
    return loadingIndicators(scope).filter((el) => {
      if (!el.matches('[role="status"][data-visualcompletion="loading-state"]') ||
          el.getAttribute("aria-busy") === "true" || !/^(?:cargando|loading)(?:\.{3}|…)?$/.test(name(el)) ||
          el.querySelector('button,[role="button"],a[href],input')) return false;
      // The real feed keeps a static loading sentinel AFTER its cards even while
      // their controls are interactive. Fixed/absolute overlays are not that sentinel.
      for (let node = el; node && node !== scope; node = node.parentElement) {
        if (["fixed", "absolute"].includes(getComputedStyle(node).position)) return false;
      }
      return adds.every((add) => Boolean(add.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
  }
  function loading() {
    const scope = assertPage();
    const footer = new Set(footerLoaders(scope));
    return Boolean(scope.closest('[aria-busy="true"]')) ||
      loadingIndicators(scope).some((el) => !footer.has(el));
  }
  function moreLoading() {
    const scope = assertPage();
    return Boolean(scope.closest('[aria-busy="true"]')) || loadingIndicators(scope).length > 0;
  }
  const openMenus = () => all(document, menusSelector);
  function inspect() {
    const items = cards();
    const busy = loading();
    const overlays = openMenus().length + all(document, '[role="dialog"],[role="alertdialog"]').length;
    return { mode: "saved", ready: items.length > 0 && !busy && !overlays, loaded: items.length,
      empty: items.length === 0, loading: busy, dialogs: overlays };
  }
  function clickable(element) {
    if (!visible(element) || !enabled(element)) return false;
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (hit === element || element.contains(hit)));
  }
  function menuDelete(before, trigger) {
    assertPage();
    const controlled = (trigger.getAttribute("aria-controls") || "").split(/\s+/).filter(Boolean);
    const candidates = openMenus().filter((menu) => !before.includes(menu) || controlled.includes(menu.id));
    if (candidates.length === 0) return null;
    const menu = unique(candidates, "menú recién abierto de la tarjeta");
    const items = all(menu, '[role="menuitem"],[role="option"],button,[role="button"]')
      .filter((el) => deleteNames.has(name(el)) && enabled(el));
    // A nested menuitem/button can represent one action. Never choose among two actions.
    const targets = items.filter((el) => !items.some((other) => other !== el && other.contains(el)));
    return targets.length ? unique(targets, 'opción «Eliminar» del menú') : null;
  }
  function hasEmptyMessage(scope) {
    return all(scope, 'p,span,div,[role="status"]').some((el) => {
      const text = normalize(el.innerText || "");
      return text.length < 130 && /^(?:(?:todavia )?no (?:hay|tienes) (?:nada|(?:mas |ningun )?elementos?)(?: guardados?)?(?: para mostrar)?[.!]?|you (?:have no|haven.t saved any) (?:saved )?items[.!]?|nothing to show[.!]?|no saved items[.!]?)$/.test(text);
    });
  }
  function deletionState(key) {
    const scope = assertPage();
    const current = cards();
    // Disappearance of the action buttons alone (e.g. during a rerender) is not evidence.
    const explicitEmpty = hasEmptyMessage(scope);
    return { removed: !current.some((card) => card.key === key), ready: !loading() && !openMenus().length &&
      !all(document, '[role="dialog"],[role="alertdialog"]').length,
      hasList: current.length > 0 || explicitEmpty || footerLoaders(scope).length > 0, empty: current.length === 0 && explicitEmpty,
      signature: current.map((card) => card.key).join(",") };
  }
  function scrollMore() {
    const scope = assertPage();
    cards(); // Refresh the remembered container before the final card disappears.
    const scroll = scrollArea?.isConnected ? scrollArea : findScrollArea(scope);
    if (!scroll) throw new Error("No se pudo reconocer el área desplazable de Guardados.");
    scroll.scrollBy({ top: Math.max(400, scroll.clientHeight * 0.85), behavior: "instant" });
  }
  globalThis.FBSaved = Object.freeze({ assertPage, cards, inspect, loading, moreLoading, openMenus, clickable, menuDelete, deletionState, scrollMore });
})();
