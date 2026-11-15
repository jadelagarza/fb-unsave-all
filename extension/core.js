/* DOM adapter shared by the extension and the browser-fixture tests. */
(function (root) {
  "use strict";
  const normalize = (value = "") => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
  const titles = new Set(["tus elementos guardados", "your saved items"]);
  const allNames = new Set(["todo", "todos", "all", "select all"]);
  const deleteNames = new Set(["eliminar", "delete"]);
  const cancelNames = new Set(["cancelar", "cancel"]);
  const deselectNames = new Set(["desmarcar", "deseleccionar", "deselect", "deselect all"]);
  const emptyPatterns = [
    /\bno (?:hay|tienes) (?:ningun |mas )?elementos? guardados?\b/,
    /\bno hay (?:mas )?(?:elementos|actividad) para mostrar\b/,
    /\bno (?:saved items|items to show|activity to show)\b/,
    /\byou (?:have no|haven't saved any) (?:saved )?items\b/
  ];
  const errorPattern = /no puedes usar esta funcion|te (?:hemos )?bloquea(?:mos|do) temporalmente|actividad sospechosa|confirma tu identidad|comprueba que eres tu|demasiadas solicitudes|vuelve a intentarlo mas tarde|esta pagina no esta disponible|se produjo un error|temporarily blocked|suspicious activity|confirm your identity|too many requests|try again later|something went wrong|this page isn't available/;
  let verifiedContext = null;

  function visible(element) {
    if (!element || !element.isConnected || element.closest('[hidden],[aria-hidden="true"]')) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }
  function name(element) {
    const labelledBy = element.getAttribute("aria-labelledby");
    const labelled = labelledBy && labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ");
    return normalize(element.getAttribute("aria-label") || labelled ||
      (element.labels && Array.from(element.labels).map((label) => label.textContent).join(" ")) || element.innerText || element.textContent || "");
  }
  function elements(scope, selector) { return Array.from(scope.querySelectorAll(selector)).filter(visible); }
  function buttons(scope, names) {
    return elements(scope, 'button,[role="button"],input[type="button"],input[type="submit"]')
      .filter((element) => names.has(name(element)) && !element.disabled && element.getAttribute("aria-disabled") !== "true");
  }
  function unique(items, description) {
    if (items.length !== 1) throw new Error(`Se esperaba un único ${description}; se encontraron ${items.length}. No se hará clic.`);
    return items[0];
  }
  function dialogs() { return elements(document, '[role="dialog"],[role="alertdialog"]'); }
  function main() { return unique(elements(document, 'main,[role="main"]'), "área principal"); }
  function checked(element) { return element.checked === true || element.getAttribute("aria-checked") === "true"; }
  function allCheckbox(scope) {
    const candidates = elements(scope, 'input[type="checkbox"],[role="checkbox"]')
      .filter((element) => allNames.has(name(element)));
    return unique(candidates, 'casilla «Todo»');
  }
  function assertPage() {
    const url = new URL(location.href);
    if (url.origin !== "https://www.facebook.com" || !/\/allactivity\/?$/.test(url.pathname)) {
      throw new Error("Abre Tus elementos guardados dentro del Registro de actividad de Facebook.");
    }
    // Both the URL and the dedicated heading are mandatory. Never use the general activity log.
    const headingSelector = 'h1,h2,h3,[role="heading"]';
    const headings = elements(document, headingSelector);
    let scope;
    if (headings.some((element) => titles.has(name(element))) && elements(document, 'main,[role="main"]').length === 1) {
      scope = main();
      verifiedContext = { url: url.href, scope };
    } else if (dialogs().length && verifiedContext?.url === url.href && verifiedContext.scope.isConnected &&
      Array.from(document.querySelectorAll(headingSelector)).some((element) => titles.has(name(element)))) {
      // Accessible modals can mark their background aria-hidden. Reuse only the saved-items
      // scope already verified in this exact document and URL; never authorize a new page here.
      scope = verifiedContext.scope;
    } else {
      throw new Error('No se encontró el título «Tus elementos guardados» con un área principal única. No se borrará otra categoría.');
    }
    const messages = [scope.innerText, ...elements(document, '[role="alert"],[role="dialog"],[role="alertdialog"]').map((element) => element.innerText)];
    if (messages.some((message) => errorPattern.test(normalize(message)))) {
      throw new Error("Facebook muestra un error o una verificación de seguridad. Revisa la página manualmente.");
    }
    return scope;
  }
  function isLoading() {
    const scopes = [...elements(document, 'main,[role="main"]'), ...dialogs()];
    return scopes.some((scope) => {
      if (scope.getAttribute("aria-busy") === "true") return true;
      return elements(scope, '[role="progressbar"],[aria-busy="true"],[aria-label]')
        .some((element) => element.matches('[role="progressbar"],[aria-busy="true"]') ||
          /^(?:cargando|loading)(?:\.{3}|…)?$/.test(name(element)));
    });
  }
  function selectedCount(scope) {
    const matches = new Set();
    for (const element of elements(scope, 'span,div,p,h1,h2,h3,[role="status"]')) {
      const text = normalize(element.innerText || "");
      if (text.length > 100) continue;
      const match = text.match(/^(\d[\d.,]*)\s+(?:(?:elementos?|publicaciones?|items?)\s+)?(?:seleccionad[oa]s?|selected)$/) ||
        text.match(/^(?:seleccionad[oa]s?|selected)\s*:?\s*(\d[\d.,]*)$/);
      if (match) matches.add(Number(match[1].replace(/[.,]/g, "")));
    }
    if (matches.size > 1) throw new Error("El contador de seleccionados es ambiguo.");
    return [...matches][0] || 0;
  }
  function fingerprint(scope) {
    // Store only a short hash in extension session memory, never post text or URLs.
    const text = normalize(scope.innerText);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16);
  }
  function ready() {
    const scope = assertPage();
    if (isLoading() || dialogs().length) return null;
    const boxes = elements(scope, 'input[type="checkbox"],[role="checkbox"]')
      .filter((element) => allNames.has(name(element)) && !element.disabled && element.getAttribute("aria-disabled") !== "true");
    const empty = emptyPatterns.some((pattern) => pattern.test(normalize(scope.innerText)));
    if (empty && boxes.length === 0) return { empty: true, fingerprint: fingerprint(scope) };
    if (boxes.length === 0) return null; // Absence of controls alone does NOT mean the list is empty.
    const checkbox = unique(boxes, 'casilla «Todo»');
    if (checked(checkbox) || selectedCount(scope) > 0) throw new Error("Desmarca la selección existente antes de comenzar.");
    return { empty: false, checkbox, fingerprint: fingerprint(scope) };
  }
  function toolbarDelete() {
    const scope = assertPage();
    unique(buttons(scope, deselectNames).filter((element) => !element.closest('[role="dialog"],[role="alertdialog"]')), 'botón «Desmarcar»');
    return unique(buttons(scope, deleteNames).filter((element) => !element.closest('[role="dialog"],[role="alertdialog"]')), 'botón «Eliminar» de la barra');
  }
  function confirmationDelete() {
    assertPage();
    const dialog = unique(dialogs(), "diálogo de confirmación");
    unique(buttons(dialog, cancelNames), 'botón «Cancelar» de la confirmación');
    // The page guard already requires the dedicated saved-items heading and activity-log URL.
    return unique(buttons(dialog, deleteNames), 'botón «Eliminar» de la confirmación');
  }
  function inspect() {
    const scope = assertPage();
    const state = ready();
    return {
      ready: Boolean(state), empty: state?.empty || false, loading: isLoading(),
      selected: selectedCount(scope), dialogs: dialogs().length,
      allCheckboxes: elements(scope, 'input[type="checkbox"],[role="checkbox"]').filter((element) => allNames.has(name(element))).length,
      heading: "Tus elementos guardados / Your saved items"
    };
  }
  root.FBUnsave = Object.freeze({ normalize, visible, name, buttons, unique, dialogs, checked,
    assertPage, isLoading, selectedCount, fingerprint, ready, toolbarDelete, confirmationDelete, inspect });
})(globalThis);
