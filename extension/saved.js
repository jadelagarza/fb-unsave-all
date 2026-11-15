/* Adapter for the Saved page. No private endpoints or generated Facebook classes. */
(() => {
  "use strict";
  const { normalize, visible, visuallyVisible, name, unique } = globalThis.FBUnsave;
  let verified = null;
  const controls = 'button,[role="button"]';
  const collectionNames = new Set(["agregar a coleccion", "agregar a la coleccion", "anadir a coleccion", "anadir a la coleccion", "add to collection"]);
  const moreNames = new Set(["mas", "mas opciones", "opciones", "more", "more options", "options", "menu"]);
  const deleteNames = new Set(["eliminar", "delete", "quitar de guardados", "eliminar de guardados", "unsave", "remove from saved"]);
  const headings = new Set(["guardados", "elementos guardados", "tus elementos guardados", "saved", "saved items", "your saved items"]);
  const menusSelector = '[role="menu"],[role="listbox"]';
  const alertsSelector = '[role="alert"],[role="dialog"],[role="alertdialog"]';
  const errorPattern = /actividad sospechosa|confirma tu identidad|comprueba que eres tu|demasiadas solicitudes|vuelve a intentarlo mas tarde|se produjo un error|no se pudo (?:eliminar|quitar)|bloquea(?:do|mos) temporalmente|suspicious activity|confirm your identity|too many requests|try again later|something went wrong|couldn.t (?:remove|delete)|temporarily blocked/;
  const all = (scope, selector) => Array.from(scope.querySelectorAll(selector)).filter(visible);
  const cardElements = (scope, selector) => Array.from(scope.querySelectorAll(selector)).filter(visuallyVisible);
  const enabled = (el) => !el.disabled && el.getAttribute("aria-disabled") !== "true" && !el.closest("[inert]");
  // Keep only the outer interactive element if Facebook wraps a button in another button.
  const buttons = (scope) => cardElements(scope, controls).filter((el, _i, list) => !list.some((other) => other !== el && other.contains(el)));
  function hash(text) {
    let value = 2166136261;
    for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
    return (value >>> 0).toString(16);
  }
  function assertPage() {
    const url = new URL(location.href);
    if (url.origin !== "https://www.facebook.com" || !/^\/saved\/?$/.test(url.pathname) ||
        [...url.searchParams.keys()].some((key) => /collection|list_id/i.test(key))) {
      throw new Error("Abre https://www.facebook.com/saved/ en la vista de todos los guardados, fuera de una colección.");
    }
    const main = all(document, 'main,[role="main"]');
    const knownMenu = all(document, menusSelector).length > 0;
    const scope = main.length === 1 ? main[0] : knownMenu && verified?.url === url.href && verified.scope.isConnected ? verified.scope :
      unique(main, "área principal de Guardados");
    if (!cardElements(document, 'h1,h2,h3,[role="heading"]').some((el) => headings.has(name(el)))) {
      throw new Error("No se reconoce el título de Guardados. No se hará clic.");
    }
    verified = { url: url.href, scope };
    if (all(document, alertsSelector).some((el) => errorPattern.test(normalize(el.innerText)))) {
      throw new Error("Facebook muestra un error o una verificación. Revisa la página manualmente.");
    }
    return scope;
  }
  function actionGroup(add, scope) {
    for (let group = add.parentElement; group && group !== scope; group = group.parentElement) {
      const list = buttons(group);
      if (list.filter((el) => collectionNames.has(name(el))).length !== 1) break;
      const more = list.filter((el) => el !== add && (moreNames.has(name(el)) || el.getAttribute("aria-haspopup") === "menu") && !/compartir|share/.test(name(el)));
      if (more.length === 1) return { group, more: more[0] };
      // The observed layout is Add to collection, Share, More. Only open the third
      // button in that exact three-button group; deletion still requires a scoped menu.
      if (list.length === 3 && list[0] === add && !/compartir|share/.test(name(list[2])) &&
          (!name(list[2]) || moreNames.has(name(list[2])))) return { group, more: list[2] };
    }
    throw new Error("No se pudo aislar el menú de tres puntos de una tarjeta. No se hará clic.");
  }
  function identity(card, group) {
    const links = cardElements(card, 'a[href]').filter((el) => !group.contains(el)).map((el) => {
      const url = new URL(el.getAttribute("href"), location.href);
      if (!/^https?:$/.test(url.protocol)) return null;
      for (const key of [...url.searchParams.keys()]) if (/^(?:__|fbclid|ref$|refsrc$|mibextid$)/.test(key)) url.searchParams.delete(key);
      url.hash = "";
      url.searchParams.sort();
      return url.href;
    }).filter(Boolean);
    if (!links.length) throw new Error("Una tarjeta no tiene un enlace reconocible para verificar su eliminación.");
    return hash([...new Set(links)].sort().join("|"));
  }
  function cards() {
    const scope = assertPage();
    const adds = buttons(scope).filter((el) => collectionNames.has(name(el)));
    const result = adds.map((add) => {
      const { group, more } = actionGroup(add, scope);
      let card = group;
      // The smallest ancestor with its own content link and exactly one action group
      // is the card. Do not promote a card to the entire feed.
      while (card && card !== scope) {
        if (adds.filter((other) => card.contains(other)).length !== 1) break;
        if (cardElements(card, 'a[href]').some((el) => !group.contains(el))) {
          return { element: card, more, key: identity(card, group) };
        }
        card = card.parentElement;
      }
      throw new Error("No se pudo reconocer una tarjeta individual de Guardados.");
    });
    if (new Set(result.map((card) => card.key)).size !== result.length) {
      throw new Error("Hay tarjetas con identidades ambiguas. Revisa la lista antes de eliminar.");
    }
    return result;
  }
  function loading() {
    return all(assertPage(), '[role="progressbar"],[aria-busy="true"],[data-visualcompletion="loading-state"]').length > 0;
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
  function deletionState(key) {
    const scope = assertPage();
    const current = cards();
    // Disappearance of the action buttons alone (e.g. during a rerender) is not evidence.
    const explicitEmpty = all(scope, 'p,span,div,[role="status"]').some((el) => {
      const text = normalize(el.innerText || "");
      return text.length < 130 && /^(?:(?:todavia )?no (?:hay|tienes) (?:nada|(?:mas |ningun )?elementos?)(?: guardados?)?(?: para mostrar)?[.!]?|you (?:have no|haven.t saved any) (?:saved )?items[.!]?|nothing to show[.!]?|no saved items[.!]?)$/.test(text);
    });
    return { removed: !current.some((card) => card.key === key), ready: !loading() && !openMenus().length &&
      !all(document, '[role="dialog"],[role="alertdialog"]').length,
      hasList: current.length > 0 || explicitEmpty, empty: current.length === 0 && explicitEmpty,
      signature: current.map((card) => card.key).join(",") };
  }
  function scrollMore() {
    const scope = assertPage();
    const last = cards().at(-1)?.element || scope;
    let scroll = last.parentElement;
    while (scroll && scroll !== document.body && !(scroll.scrollHeight > scroll.clientHeight + 2 &&
      /auto|scroll|overlay/.test(getComputedStyle(scroll).overflowY))) scroll = scroll.parentElement;
    if (!scroll || scroll === document.body) scroll = document.scrollingElement;
    if (!scroll) throw new Error("No se pudo reconocer el área desplazable de Guardados.");
    scroll.scrollBy({ top: Math.max(400, scroll.clientHeight * 0.85), behavior: "instant" });
  }
  globalThis.FBSaved = Object.freeze({ assertPage, cards, inspect, loading, openMenus, clickable, menuDelete, deletionState, scrollMore });
})();
