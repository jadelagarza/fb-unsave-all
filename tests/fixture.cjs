module.exports = function fixture(mode = 'normal') {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Saved items fixture</title></head><body>
  <main><h1>${mode === 'wrong-category' ? 'Tus publicaciones' : 'Tus elementos guardados'}</h1><div id="list"></div><div id="loader" role="progressbar" aria-label="Cargando..." hidden></div></main>
  <div id="dialog" role="dialog" aria-label="Eliminar elementos guardados" hidden>
    <p>¿Eliminar los elementos guardados seleccionados?</p><button id="cancel">Cancelar</button><button id="confirm">Eliminar</button>
  </div>
  <script>
  const mode = ${JSON.stringify(mode)};
  const bareCounter = ['bare-counter', 'ambiguous-counter', 'number-in-post'].includes(mode);
  const batchSize = bareCounter ? 16 : 20;
  let remaining = Number(sessionStorage.getItem('remaining') ?? (bareCounter ? 16 : 40));
  let loads = Number(sessionStorage.getItem('loads') || 0) + 1;
  sessionStorage.setItem('loads', loads);
  const log = (event) => { const entries = JSON.parse(sessionStorage.getItem('events') || '[]'); entries.push({event, at:Date.now()}); sessionStorage.setItem('events', JSON.stringify(entries)); };
  log('page-load');
  function render() {
    const list = document.getElementById('list');
    if (!remaining) { list.innerHTML='<p>No hay elementos guardados</p>'; return; }
    list.innerHTML='<div id="selection-bar"><label><input type="checkbox" id="all">Todo</label><div id="toolbar"></div></div><article><p>Lote con '+remaining+' elementos pendientes</p><span>2026</span><span>4</span><span>16</span><span>5 elementos seleccionados</span></article>';
    document.getElementById('all').onchange = (event) => {
      const toolbar=document.getElementById('toolbar');
      const count=Math.min(remaining,batchSize);
      const counter=mode==='number-in-post' ? '' : '<span id="selection-count">'+count+(bareCounter ? '' : ' elementos seleccionados')+'</span>';
      const extra=mode==='ambiguous-counter' ? '<span>4</span>' : '';
      toolbar.innerHTML=event.target.checked ? counter+extra+'<button id="deselect">Desmarcar</button><button id="delete">Eliminar</button>' : '';
      if(event.target.checked) {
        document.getElementById('deselect').onclick=render;
        document.getElementById('delete').onclick=()=>{log('open-confirmation');document.getElementById('dialog').hidden=false;document.querySelector('main').setAttribute('aria-hidden','true');};
      }
    };
  }
  render();
  document.getElementById('cancel').onclick=()=>{document.getElementById('dialog').hidden=true;document.querySelector('main').removeAttribute('aria-hidden');};
  document.getElementById('confirm').onclick=()=>{
    log('confirm-delete');
    document.getElementById('dialog').hidden=true;
    document.querySelector('main').removeAttribute('aria-hidden');
    if (mode !== 'no-loader') { document.getElementById('loader').hidden=false; log('loading-start'); }
    if (mode === 'security') { const alert=document.createElement('div');alert.setAttribute('role','alert');alert.textContent='Confirma tu identidad';document.body.append(alert); }
    if(mode !== 'stuck-loader') setTimeout(()=>{
      if(mode !== 'no-progress') remaining=Math.max(0,remaining-batchSize);
      sessionStorage.setItem('remaining',remaining);
      document.getElementById('loader').hidden=true;log('loading-end');render();
    },200);
  };
  </script></body></html>`;
};
