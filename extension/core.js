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
    /\bno hay (?:mas )?(?:elementos|actividad|nada) para mostrar\b/,
    /\bnothing to (?:show|display)\b/,
    /\bno (?:saved items|items to show|activity to show)\b/,
    /\byou (?:have no|haven't saved any) (?:saved )?items\b/
  ];
  const errorPattern = /no puedes usar esta funcion|te (?:hemos )?bloquea(?:mos|do) temporalmente|actividad sospechosa|confirma tu identidad|comprueba que eres tu|demasiadas solicitudes|vuelve a intentarlo mas tarde|esta pagina no esta disponible|se produjo un error|temporarily blocked|suspicious activity|confirm your identity|too many requests|try again later|something went wrong|this page isn't available/;
  let verifiedContext = null;

  function visuallyVisible(element) {
    if (!element || !element.isConnected || element.closest('[hidden]')) return false;
    if (element.getClientRects().length === 0) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || Number(style.opacity) === 0) return false;
    }
    return true;
  }
  function visible(element) {
    return visuallyVisible(element) && !element.closest('[aria-hidden="true"]');
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
  function confirmationOpen() {
    return dialogs().some((dialog) => buttons(dialog, cancelNames).length > 0 && buttons(dialog, deleteNames).length > 0);
  }
  function main() { return unique(elements(document, 'main,[role="main"]'), "área principal"); }
  function checked(element) { return element.checked === true || element.getAttribute("aria-checked") === "true"; }
  function allCheckbox(scope) {
    const candidates = elements(scope, 'input[type="checkbox"],[role="checkbox"]')
      .filter((element) => allNames.has(name(element)));
    if (candidates.length === 0) return null;
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
    } else if ((dialogs().length || globalLoadingIndicators().length || blockingVisualIndicators().length) && verifiedContext?.url === url.href && verifiedContext.scope.isConnected &&
      Array.from(document.querySelectorAll(headingSelector)).some((element) => titles.has(name(element)))) {
      // Modals and global loading overlays can mark their background aria-hidden. Reuse only the saved-items
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
  function loadingSignal(element) {
    return element.matches('[role="progressbar"],[aria-busy="true"],[data-visualcompletion="loading-state"]') ||
      /^(?:cargando|loading)(?:\.{3}|…)?$/.test(normalize(element.getAttribute("aria-valuetext") || name(element)));
  }
  function globalLoadingIndicators() {
    // A fixed, 4px-high progressbar is Facebook's navigation bar, NOT the central deletion
    // spinner. Never treat that bar as evidence of this deletion's loading cycle.
    return elements(document, '[role="progressbar"],[role="status"],[aria-busy="true"],[aria-valuetext],[data-visualcompletion="loading-state"]')
      .filter((element) => {
        if (!loadingSignal(element)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return false;
        for (let node = element; node && node !== document.body; node = node.parentElement) {
          if (getComputedStyle(node).position === "fixed") return true;
        }
        return false;
      });
  }
  function interactionState() {
    const scope = verifiedContext?.url === location.href && verifiedContext.scope.isConnected ? verifiedContext.scope : null;
    const checkbox = scope && Array.from(scope.querySelectorAll('input[type="checkbox"],[role="checkbox"]'))
      .find((element) => allNames.has(name(element)) && visuallyVisible(element));
    if (!checkbox) return { ready: false, blocked: false, blocker: null };
    const rect = checkbox.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return { ready: false, blocked: false, blocker: null };
    const hit = document.elementFromPoint(x, y);
    const label = checkbox.closest("label");
    const intercepted = Boolean(hit && visuallyVisible(hit) && hit !== checkbox && !checkbox.contains(hit) && !(label && label.contains(hit)));
    const disabled = checkbox.disabled || checkbox.getAttribute("aria-disabled") === "true" || Boolean(checkbox.closest("[inert]"));
    return { ready: Boolean(hit) && !intercepted && !disabled, blocked: intercepted || disabled, blocker: intercepted ? hit : null };
  }
  function blockingVisualIndicators() {
    const interaction = interactionState();
    if (!interaction.blocker) return [];
    const scope = verifiedContext.scope;
    for (let overlay = interaction.blocker; overlay && overlay !== document.body; overlay = overlay.parentElement) {
      if (overlay === scope || overlay.contains(scope)) break;
      if (!visuallyVisible(overlay)) continue;
      const style = getComputedStyle(overlay);
      if (style.position !== "fixed" && style.position !== "absolute") continue;
      const rect = overlay.getBoundingClientRect();
      if (rect.width < innerWidth * 0.35 || rect.height < innerHeight * 0.35) continue;
      // Identity dialogs and other interactive popups are not deletion loaders.
      if (Array.from(overlay.querySelectorAll('button,[role="button"],a[href],input')).some(visible)) continue;
      const graphics = Array.from(overlay.querySelectorAll('svg,div,span')).slice(0, 250);
      const spinner = graphics.some((element) => {
        if (!visuallyVisible(element)) return false;
        const bounds = element.getBoundingClientRect();
        if (bounds.width < 8 || bounds.height < 8 || bounds.width > 128 || bounds.height > 128) return false;
        const computed = getComputedStyle(element);
        const animated = computed.animationName !== "none" && parseFloat(computed.animationDuration) > 0;
        const ring = element.tagName.toLowerCase() === "svg" && Array.from(element.querySelectorAll("circle,path"))
          .some((shape) => getComputedStyle(shape).stroke !== "none" && parseFloat(getComputedStyle(shape).strokeWidth) > 0);
        return ring || animated;
      });
      if (spinner) return [overlay];
    }
    return [];
  }
  function loadingIndicators() {
    const scopes = [...elements(document, 'main,[role="main"]'), ...dialogs()];
    const indicators = new Set([...globalLoadingIndicators(), ...blockingVisualIndicators()]);
    for (const scope of scopes) {
      if (scope.getAttribute("aria-busy") === "true") indicators.add(scope);
      for (const element of elements(scope, '[role="progressbar"],[aria-busy="true"],[aria-label],[aria-valuetext],[data-visualcompletion="loading-state"]')) {
        if (loadingSignal(element)) indicators.add(element);
      }
    }
    return [...indicators];
  }
  function isLoading() { return loadingIndicators().length > 0; }
  function selectionBar(scope) {
    const checkbox = allCheckbox(scope);
    if (!checkbox || !checked(checkbox)) return null;
    const outsideDialog = (element) => !element.closest('[role="dialog"],[role="alertdialog"]');
    const clear = unique(buttons(scope, deselectNames).filter(outsideDialog), 'botón «Desmarcar»');
    const remove = unique(buttons(scope, deleteNames).filter(outsideDialog), 'botón «Eliminar» de la barra');
    // The smallest common container binds a bare number to Todo + Desmarcar + Eliminar.
    // Never interpret arbitrary numbers in the main list (dates, times, or post text).
    for (let bar = checkbox.parentElement; bar && bar !== scope; bar = bar.parentElement) {
      if (!bar.contains(clear) || !bar.contains(remove)) continue;
      const includesRows = elements(bar, 'article,[role="listitem"],[role="row"]').length > 0;
      const includesItemCheckboxes = elements(bar, 'input[type="checkbox"],[role="checkbox"]')
        .some((element) => element !== checkbox);
      if (includesRows || includesItemCheckboxes) throw new Error("No se pudo aislar la barra de selección de los elementos guardados.");
      return { element: bar, remove };
    }
    throw new Error("No se pudo aislar la barra de selección con Todo, Desmarcar y Eliminar.");
  }
  function selectedCount(scope) {
    const bar = selectionBar(scope);
    if (!bar) return 0;
    const matches = new Set();
    for (const element of elements(bar.element, 'span,div,p,h1,h2,h3,strong,b,output,[role="status"]')) {
      if (element.closest('button,[role="button"],label,input,[role="checkbox"]')) continue;
      const text = normalize(element.innerText || "");
      if (text.length > 100) continue;
      const match = text.match(/^(\d[\d.,]*)\s+(?:(?:elementos?|publicaciones?|items?)\s+)?(?:seleccionad[oa]s?|selected)$/) ||
        text.match(/^(?:seleccionad[oa]s?|selected)\s*:?\s*(\d[\d.,]*)$/) ||
        text.match(/^(\d+|\d{1,3}(?:[.,]\d{3})+)$/);
      if (match) {
        const count = Number(match[1].replace(/[.,]/g, ""));
        if (Number.isSafeInteger(count) && count > 0) matches.add(count);
      }
    }
    if (matches.size > 1) throw new Error("El contador de seleccionados es ambiguo.");
    return [...matches][0] || 0;
  }
  function hashText(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16);
  }
  function fingerprint(scope) {
    // Store only a short hash in extension session memory, never post text or URLs.
    return hashText(normalize(scope.innerText));
  }
  function itemCheckboxes(scope) {
    return elements(scope, 'input[type="checkbox"],[role="checkbox"]')
      .filter((element) => !allNames.has(name(element)));
  }
  function itemKey(checkbox, scope) {
    const label = name(checkbox);
    for (let row = checkbox.parentElement; row && row !== scope; row = row.parentElement) {
      if (row.querySelectorAll('input[type="checkbox"],[role="checkbox"]').length > 1) break;
      const links = Array.from(row.querySelectorAll('a[href]')).map((link) => link.getAttribute("href")).sort();
      if (links.length) return hashText(`${label}|${links.join("|")}`);
    }
    return label ? hashText(label) : null;
  }
  function captureDeletion(selected) {
    const scope = assertPage();
    const selectedItems = itemCheckboxes(scope).filter(checked);
    const keys = new Set(selectedItems.map((checkbox) => itemKey(checkbox, scope)).filter(Boolean));
    return { keys: [...keys], allCaptured: selectedItems.length === selected && keys.size === selected };
  }
  function hasEmptyMessage(scope) {
    return elements(scope, 'div,p,span,[role="status"]').some((element) => {
      if (element.closest('article,[role="row"],[role="listitem"]')) return false;
      const text = normalize(element.innerText || "");
      return text.length <= 100 && emptyPatterns.some((pattern) => pattern.test(text));
    });
  }
  function deletionState(snapshot) {
    const scope = assertPage();
    const items = itemCheckboxes(scope);
    const all = allCheckbox(scope);
    const selectionCleared = (!all || (!checked(all) && all.getAttribute("aria-checked") !== "mixed")) &&
      !items.some(checked) && buttons(scope, deselectNames).length === 0 && buttons(scope, deleteNames).length === 0;
    const empty = hasEmptyMessage(scope) && items.length === 0 && selectionCleared;
    const currentKeys = new Set(items.map((checkbox) => itemKey(checkbox, scope)).filter(Boolean));
    const itemsRemoved = Boolean(snapshot?.allCaptured && snapshot.keys.length &&
      snapshot.keys.every((key) => !currentKeys.has(key)) && items.length > 0 && selectionCleared);
    return { selectionCleared, empty, itemsRemoved, interactionReady: interactionState().ready, fingerprint: fingerprint(scope) };
  }
  function ready() {
    const scope = assertPage();
    if (isLoading() || dialogs().length) return null;
    const boxes = elements(scope, 'input[type="checkbox"],[role="checkbox"]')
      .filter((element) => allNames.has(name(element)) && !element.disabled && element.getAttribute("aria-disabled") !== "true");
    const completion = deletionState();
    if (completion.empty) return { empty: true, fingerprint: completion.fingerprint };
    if (boxes.length === 0) return null; // Absence of controls alone does NOT mean the list is empty.
    const checkbox = unique(boxes, 'casilla «Todo»');
    if (checked(checkbox) || selectedCount(scope) > 0) throw new Error("Desmarca la selección existente antes de comenzar.");
    return { empty: false, checkbox, fingerprint: fingerprint(scope) };
  }
  function toolbarDelete() {
    const scope = assertPage();
    const bar = selectionBar(scope);
    if (!bar) throw new Error('La casilla «Todo» no está marcada.');
    return bar.remove;
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
  root.FBUnsave = Object.freeze({ normalize, visible, name, buttons, unique, dialogs, confirmationOpen, checked,
    assertPage, isLoading, interactionState, selectedCount, fingerprint, captureDeletion, deletionState, ready, toolbarDelete, confirmationDelete, inspect });
})(globalThis);
