module.exports = function fixture(mode = 'normal', options = {}) {
  const globalOverlay = mode.startsWith('global-overlay');
  const overlay = '<div id="overlay-root"><div id="loader" role="progressbar" aria-valuetext="Cargando..." tabindex="0"><div></div></div></div>';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Saved items fixture</title>
  <style>
  #overlay-root { position:relative; }
  #overlay-root #loader { display:none; opacity:0; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:1000; }
  #overlay-root #loader.active { display:flex; opacity:1; }
  #overlay-root #loader > div { width:32px; height:32px; border:3px solid #1877f2; border-top-color:transparent; border-radius:50%; margin:auto; }
  </style></head><body>
  <main><h1>${mode === 'wrong-category' ? 'Tus publicaciones' : 'Tus elementos guardados'}</h1><div id="list"></div>${globalOverlay ? '' : '<div id="loader" role="progressbar" aria-label="Cargando..." hidden></div>'}</main>
  ${globalOverlay ? overlay : ''}
  <div id="dialog" role="dialog" aria-label="Eliminar elementos guardados" hidden>
    <p>¿Eliminar los elementos guardados seleccionados?</p><button id="cancel">Cancelar</button><button id="confirm">Eliminar</button>
  </div>
  <script>
  const mode = ${JSON.stringify(mode)};
  const options = ${JSON.stringify(options)};
  const globalOverlay = ${JSON.stringify(globalOverlay)};
  const noLoader = mode.startsWith('no-loader');
  const bareCounter = ['bare-counter', 'ambiguous-counter', 'number-in-post'].includes(mode);
  const batchSize = bareCounter ? 16 : 20;
  const initialRemaining = options.initialRemaining ?? (bareCounter ? 16 : 40);
  let remaining = Number(sessionStorage.getItem('remaining') ?? initialRemaining);
  let loads = Number(sessionStorage.getItem('loads') || 0) + 1;
  sessionStorage.setItem('loads', loads);
  let batchViewEmpty = false;
  const log = (event, extra={}) => { const entries = JSON.parse(sessionStorage.getItem('events') || '[]'); entries.push({event, at:Date.now(), ...extra}); sessionStorage.setItem('events', JSON.stringify(entries)); };
  log('page-load');
  function render() {
    const list = document.getElementById('list');
    if (!remaining || batchViewEmpty) {
      list.innerHTML='<div id="selection-bar"><label><input type="checkbox" id="all" disabled>Todo</label><div id="toolbar"><button disabled>Eliminar</button></div></div><p>No hay nada para mostrar</p>';
      return;
    }
    const start = initialRemaining - remaining;
    const rows = Array.from({length:Math.min(remaining,batchSize)}, (_,index) => '<article><label><input class="item" type="checkbox" aria-label="Seleccionar publicación '+(start+index+1)+'">Elemento '+(start+index+1)+'</label><a href="https://www.facebook.com/example/posts/'+(start+index+1)+'">Publicación</a><span>2026</span><span>4</span><span>16</span><span>5 elementos seleccionados</span></article>').join('');
    list.innerHTML='<div id="selection-bar"><label><input type="checkbox" id="all">Todo</label><div id="toolbar"><button disabled>Eliminar</button></div></div><p>'+remaining+' elementos pendientes</p>'+rows;
    document.getElementById('all').onchange = (event) => {
      const toolbar=document.getElementById('toolbar');
      const count=Math.min(remaining,batchSize);
      document.querySelectorAll('input.item').forEach(checkbox => { checkbox.checked=event.target.checked; });
      const counter=mode==='number-in-post' ? '' : '<span id="selection-count">'+count+(bareCounter ? '' : ' elementos seleccionados')+'</span>';
      const extra=mode==='ambiguous-counter' ? '<span>4</span>' : '';
      toolbar.innerHTML=event.target.checked ? counter+extra+'<button id="deselect">Desmarcar</button><button id="delete">Eliminar</button>' : '<button disabled>Eliminar</button>';
      if(event.target.checked) {
        document.getElementById('deselect').onclick=render;
        document.getElementById('delete').onclick=()=>{log('open-confirmation');document.getElementById('dialog').hidden=false;document.querySelector('main').setAttribute('aria-hidden','true');};
      }
    };
  }
  function endLoading() {
    const loader=document.getElementById('loader');
    if (mode === 'global-overlay-opacity') loader.style.opacity='0';
    else if(mode === 'global-overlay-hidden-parent') document.getElementById('overlay-root').style.display='none';
    else if(mode === 'global-overlay-detached') loader.remove();
    else if(globalOverlay) loader.classList.remove('active');
    else loader.hidden=true;
    document.querySelector('main').removeAttribute('aria-hidden');
    log('loading-end');
  }
  function finishDeletion() {
    if (mode !== 'no-progress' && mode !== 'no-loader' && mode !== 'no-loader-transient-empty') remaining=Math.max(0,remaining-batchSize);
    sessionStorage.setItem('remaining',remaining);
    batchViewEmpty = options.emptyUntilReload === true;
    if (mode === 'no-loader-transient-empty') batchViewEmpty=true;
    render();
    log('deletion-finished');
    if (mode === 'no-loader-transient-empty') setTimeout(()=>{batchViewEmpty=false;render();log('transient-empty-ended');},400);
    if (options.optimisticRevert === true) sessionStorage.setItem('remaining',initialRemaining);
  }
  render();
  document.getElementById('cancel').onclick=()=>{document.getElementById('dialog').hidden=true;document.querySelector('main').removeAttribute('aria-hidden');};
  document.getElementById('confirm').onclick=()=>{
    const ids=Array.from(document.querySelectorAll('input.item:checked')).map(checkbox => checkbox.getAttribute('aria-label'));
    log('confirm-delete', {items:ids});
    document.getElementById('dialog').hidden=true;
    document.querySelector('main').removeAttribute('aria-hidden');
    if (!noLoader) {
      const loader=document.getElementById('loader');
      if(globalOverlay) {
        loader.classList.add('active');
        if(mode === 'global-overlay-hidden-main') document.querySelector('main').setAttribute('aria-hidden','true');
      } else loader.hidden=false;
      log('loading-start');
    }
    if (mode === 'security') { const alert=document.createElement('div');alert.setAttribute('role','alert');alert.textContent='Confirma tu identidad';document.body.append(alert); }
    if(mode !== 'stuck-loader' && mode !== 'global-overlay-stuck') setTimeout(()=>{
      endLoading();
      if (options.selectionResetDelay) setTimeout(finishDeletion, options.selectionResetDelay);
      else finishDeletion();
    },options.loadingDuration ?? 200);
  };
  </script></body></html>`;
};
