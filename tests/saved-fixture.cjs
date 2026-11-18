module.exports = function fixture(options = {}) {
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Saved fixture</title>
  <style>body{font:16px system-ui;margin:0;background:#eee}h1{padding:15px;margin:0}
  main{padding:20px;min-height:1800px}article{padding:20px;margin:10px;background:white;width:650px;min-height:140px}
  button{padding:12px;margin:5px}#menu{position:fixed;top:200px;left:300px;padding:15px;background:white;border:2px solid black;z-index:10}
  [hidden]{display:none!important}svg{width:20px;height:20px}</style>
  <h1>Guardados</h1><button id="decoy">Eliminar</button>
  <main><div id="feed"></div><div id="loading" role="progressbar" hidden>Cargando</div><p id="empty" hidden>No tienes elementos guardados</p></main>
  <script>
  const options=${JSON.stringify(options)};
  let ids=Array.from({length:options.initial??3},(_,i)=>i+1);
  const blankIds = new Set(options.blankIds || []);
  const unavailableIds = new Set(options.unavailableIds || []);
  let nextAddedId = 100;
  let queued=options.moreOnScroll?(options.moreIdsOnScroll || [4,5]):[];
  let deleted=0;
  let renderCount=0;
  let loading=false;
  window.events=[];
  const record=(type,id)=>events.push({type,id,at:Date.now()});
  const main=document.querySelector('main');
  const feed=document.getElementById('feed');
  const busy=document.getElementById('loading');
  let footer=null;
  if(options.footerLoading){
    footer=document.createElement('div');footer.setAttribute('role','status');
    footer.setAttribute('data-visualcompletion','loading-state');footer.setAttribute('aria-label','Cargando...');
    footer.style.cssText='height:176px;position:static';main.append(footer);
  }
  if (options.collection) {
    const header = document.createElement('header');
    header.innerHTML = '<h2>Demo collection</h2><button>Invitar</button><button aria-label="Más opciones para la colección">…</button>';
    header.querySelectorAll('button').forEach(button => button.onclick = () => record('wrong-action'));
    main.prepend(header);
    document.getElementById('empty').textContent = 'No hay elementos en esta colección';
  }
  if(options.singularHeading)document.querySelector('h1').textContent='Guardado';
  if(options.otherMain){
    const sidebar=document.createElement('aside');sidebar.setAttribute('role','main');
    sidebar.innerHTML='<h2>Mis colecciones</h2><a href="/saved/?collection_id=999">General</a><button>Crear colección</button>'+
      (options.unrelatedAdd?'<button>Agregar a colección</button>':'');
    sidebar.querySelectorAll('button').forEach(button=>button.onclick=()=>record('wrong-action'));
    main.before(sidebar);
  }
  if(options.nestedMain||options.splitMain){
    const outer=document.createElement('div');outer.setAttribute('role','main');main.before(outer);outer.append(main);
    if(options.busyOuter)outer.setAttribute('aria-busy','true');
  }
  if(options.rootBusy)main.setAttribute('aria-busy','true');
  if(options.nestedScroll){
    const container=document.createElement('div');container.id='scroll-area';
    container.style.cssText='height:500px;overflow-y:auto';main.before(container);container.append(main);
    document.documentElement.style.overflow='hidden';
  }
  function render(){
    renderCount++;
    const html=ids.map(id=>{
      const contentId = (options.duplicateContentIds || []).includes(id) ? 'shared' : id;
      if (options.collection) {
        const unavailable = unavailableIds.has(id);
        const thumbnail = '<img alt="imagen" width="144" height="144">';
        const content = unavailable
          ? thumbnail + '<div>Este producto no está disponible ahora.</div><div>Es posible que haya cambiado la configuración de privacidad o que haya caducado.</div>'
          : '<a href="/watch/?ref=saved&v=' + contentId + '">' + thumbnail + '</a><a href="/watch/?ref=saved&v=' + contentId + '">Video de Demo ' + id + '</a><span>Reels • Demo</span>';
        return '<div data-fixture-id="' + id + '" data-card style="padding:20px;margin:10px;background:white;width:650px;min-height:180px">' + content +
          '<div><div role="button" tabindex="0" data-more="' + id + '" aria-label="Más" aria-haspopup="dialog" style="display:inline-block;padding:12px">…</div></div></div>';
      }
      const blank = blankIds.has(id);
      const title='Demo '+id+', compartir y share';
      const open=options.realControls?'<div role="button" tabindex="0"':'<button';
      const close=options.realControls?'</div>':'</button>';
      const savedItemMenu = (options.savedItemMenuIds || []).includes(id);
      const unknownMenu = (options.unknownMenuIds || []).includes(id);
      const hasShare = !blank && !(options.twoButtonIds || []).includes(id);
      const addLabel = blank || savedItemMenu
        ? ' aria-label="Agregar a colección"'
        : options.realControls ? ' aria-label="Agregar a la colección, ' + title + '"' : '';
      const shareLabel=options.realControls?'Compartir, '+title:'Compartir';
      const moreLabel = unknownMenu ? 'Acción desconocida'
        : blank || savedItemMenu ? 'Más opciones para el elemento guardado'
        : options.realControls ? 'Más, ' + title : 'Más opciones';
      const popup=options.realControls?'dialog':'menu';
      const shareButton = hasShare
        ? open + ' data-share="' + id + '" aria-label="' + shareLabel + '">↗' + close
        : '';
      const actions='<div class="actions">'+open+' data-add="'+id+'"'+addLabel+'>Agregar a colección'+close+
        shareButton+
        open+' data-more="'+id+'" '+(options.unlabelled?'':'aria-label="'+moreLabel+'" aria-haspopup="'+popup+'"')+'><svg aria-hidden="true"><circle cx="3" cy="10" r="2"/><circle cx="10" cy="10" r="2"/><circle cx="17" cy="10" r="2"/></svg>'+close+'</div>';
      const nested=options.realControls?'<div><div><div><div>'+actions+'</div></div></div></div>':actions;
      if (blank) {
        const placeholder = '<div style="width:144px;height:144px;background:#111"></div>';
        const thumbnail = (options.blankWithoutLinkIds || []).includes(id)
          ? placeholder
          : '<a href="https://facebook.com/">' + placeholder + '</a>';
        return '<article>' + thumbnail + '<span>Reel</span>' + nested + '</article>';
      }
      const genericLink = (options.genericLinkIds || []).includes(id);
      const titleHref = genericLink ? 'https://facebook.com/' : '/posts/saved-' + contentId;
      const titleText = genericLink && options.identicalGenericTitles ? 'Saved product' : 'Saved item ' + id;
      const price = options.changingPrice
        ? '<p data-price>Price: ' + (100 + renderCount) + '</p>'
        : '';
      return '<article><a href="' + titleHref + '">' + titleText + '</a>' + price + nested + '</article>';
    }).join('');
    if (options.incremental && options.collection) {
      const template = document.createElement('div');
      template.innerHTML = html;
      const desired = Array.from(template.children);
      for (const old of Array.from(feed.children)) {
        if (!ids.includes(Number(old.dataset.fixtureId))) old.remove();
      }
      for (const fresh of desired) {
        const old = Array.from(feed.children).find(node => node.dataset.fixtureId === fresh.dataset.fixtureId);
        feed.append(old || fresh);
      }
    } else {
      feed.innerHTML = html;
    }
    if(footer)footer.hidden=ids.length===0&&queued.length===0&&!loading;
    document.getElementById('empty').hidden=ids.length>0||loading||(footer&&queued.length>0);
    feed.querySelectorAll('[data-add],[data-share]').forEach(button=>button.onclick=()=>record('wrong-action'));
    feed.querySelectorAll('[data-more]').forEach(button=>button.onclick=()=>openMenu(Number(button.dataset.more),button));
  }
  function openMenu(id,button){
    record('open',id);
    const menu=document.createElement('div');menu.id='menu';menu.setAttribute('role','menu');
    button.setAttribute('aria-controls','menu');
    if (options.collection) {
      menu.innerHTML = '<div role="menuitem">Compartir</div><div role="menuitem">Eliminar</div><div role="menuitem">Eliminar colección</div>' +
        (options.missingDelete ? '' : '<div role="menuitem" data-remove>Eliminar de la colección</div>');
      menu.querySelectorAll('[role="menuitem"]').forEach(item => item.onclick = () => record('wrong-action'));
    } else {
      menu.innerHTML='<div role="menuitem" data-remove><span>'+(options.missingDelete?'Eliminar colección':'Eliminar')+'</span></div><div role="menuitem">Agregar a colección</div>';
    }
    const remove = menu.querySelector('[data-remove]');
    if (remove) remove.onclick=()=>{
      if (options.collection) record('remove-collection', id);
      record('delete',id);menu.remove();main.removeAttribute('aria-hidden');loading=true;busy.hidden=false;
      if(options.security){const alert=document.createElement('p');alert.setAttribute('role','alert');alert.textContent='Confirma tu identidad';document.body.append(alert);return;}
      setTimeout(()=>{
        loading=false;busy.hidden=true;
        if (options.removeOtherId) {
          ids = ids.filter(value => value !== options.removeOtherId);
        } else if (options.promoteUnavailableInsteadDelete && unavailableIds.has(id)) {
          unavailableIds.delete(id);
        } else if (options.promoteBlankInsteadDelete && blankIds.has(id)) {
          blankIds.delete(id);
        } else if(!options.noProgress){ids=ids.filter(value=>value!==id);deleted++;}
        if (options.appendOnDelete) {
          const anonymousId = nextAddedId++;
          unavailableIds.add(anonymousId);
          ids.push(anonymousId);
          if (!options.appendAnonymousOnly) ids.push(nextAddedId++);
          record('arrived', anonymousId);
        }
        render();record('removed',id);
      },300);
    };
    document.body.append(menu);
    if(options.hiddenMain)main.setAttribute('aria-hidden','true');
  }
  document.getElementById('decoy').onclick=()=>record('wrong-action');
  const scrollTarget=options.nestedScroll?document.getElementById('scroll-area'):window;
  scrollTarget.addEventListener('scroll',()=>{
    record('scroll');
    if(queued.length&&deleted>=(options.initial??3)&&!loading){
      loading=true;busy.hidden=false;render();
      setTimeout(()=>{ids=queued;queued=[];loading=false;busy.hidden=true;render();record('loaded');},400);
    }
  });
  render();
  if(options.duplicateMain){
    const duplicate=main.cloneNode(true);main.after(duplicate);
  }
  if(options.splitMain){
    const otherCard=feed.querySelector('article').cloneNode(true);main.after(otherCard);
  }
  record('page-load');
  </script></html>`;
};
