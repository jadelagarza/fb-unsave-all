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
  let ids=Array.from({length:options.initial||3},(_,i)=>i+1);
  let queued=options.moreOnScroll?[4,5]:[];
  let deleted=0;
  let loading=false;
  window.events=[];
  const record=(type,id)=>events.push({type,id,at:Date.now()});
  const main=document.querySelector('main');
  const feed=document.getElementById('feed');
  const busy=document.getElementById('loading');
  if(options.rootBusy)main.setAttribute('aria-busy','true');
  if(options.nestedScroll){
    const container=document.createElement('div');container.id='scroll-area';
    container.style.cssText='height:500px;overflow-y:auto';main.before(container);container.append(main);
    document.documentElement.style.overflow='hidden';
  }
  function render(){
    feed.innerHTML=ids.map(id=>'<article><a href="/posts/saved-'+id+'">Saved item '+id+'</a><div class="actions"><button data-add="'+id+'">Agregar a colección</button><button data-share="'+id+'" aria-label="Compartir">↗</button><button data-more="'+id+'" '+(options.unlabelled?'':'aria-label="Más opciones" aria-haspopup="menu"')+'><svg aria-hidden="true"><circle cx="3" cy="10" r="2"/><circle cx="10" cy="10" r="2"/><circle cx="17" cy="10" r="2"/></svg></button></div></article>').join('');
    document.getElementById('empty').hidden=ids.length>0||loading;
    feed.querySelectorAll('[data-add],[data-share]').forEach(button=>button.onclick=()=>record('wrong-action'));
    feed.querySelectorAll('[data-more]').forEach(button=>button.onclick=()=>openMenu(Number(button.dataset.more),button));
  }
  function openMenu(id,button){
    record('open',id);
    const menu=document.createElement('div');menu.id='menu';menu.setAttribute('role','menu');
    button.setAttribute('aria-controls','menu');
    menu.innerHTML='<div role="menuitem"><span>'+(options.missingDelete?'Eliminar colección':'Eliminar')+'</span></div><div role="menuitem">Agregar a colección</div>';
    menu.querySelector('[role="menuitem"]').onclick=()=>{
      record('delete',id);menu.remove();main.removeAttribute('aria-hidden');loading=true;busy.hidden=false;
      if(options.security){const alert=document.createElement('p');alert.setAttribute('role','alert');alert.textContent='Confirma tu identidad';document.body.append(alert);return;}
      setTimeout(()=>{
        loading=false;busy.hidden=true;
        if(!options.noProgress){ids=ids.filter(value=>value!==id);deleted++;}
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
    if(queued.length&&deleted>=(options.initial||3)&&!loading){
      loading=true;busy.hidden=false;render();
      setTimeout(()=>{ids=queued;queued=[];loading=false;busy.hidden=true;render();record('loaded');},400);
    }
  });
  render();record('page-load');
  </script></html>`;
};
