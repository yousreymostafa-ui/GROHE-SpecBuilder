(() => {
  'use strict';

  const mq = window.matchMedia('(max-width: 900px)');
  let currentView = 'catalogue';

  function ensureMobileUi(){
    if(document.querySelector('.mobile-workspace-nav')) return;
    const workspace=document.querySelector('.workspace-grid');
    if(!workspace) return;

    const nav=document.createElement('div');
    nav.className='mobile-workspace-nav';
    nav.setAttribute('aria-label','Mobile workspace navigation');
    nav.innerHTML=
      '<button type="button" data-mobile-view="catalogue" class="active">Catalogue</button>'+
      '<button type="button" data-mobile-view="selection">Selection</button>'+
      '<button type="button" class="mobile-filter-btn" data-mobile-filters>Filters</button>';
    workspace.parentNode.insertBefore(nav,workspace);

    const backdrop=document.createElement('button');
    backdrop.type='button';
    backdrop.className='mobile-filter-backdrop';
    backdrop.setAttribute('aria-label','Close filters');
    document.body.appendChild(backdrop);

    nav.querySelectorAll('[data-mobile-view]').forEach(btn=>{
      btn.addEventListener('click',()=>setMobileView(btn.dataset.mobileView));
    });
    nav.querySelector('[data-mobile-filters]')?.addEventListener('click',()=>{
      document.body.classList.toggle('mobile-filters-open');
    });
    backdrop.addEventListener('click',()=>document.body.classList.remove('mobile-filters-open'));

    const filterSidebar=document.querySelector('.filter-sidebar');
    if(filterSidebar){
      filterSidebar.addEventListener('click',e=>{
        if(e.target.closest('button, input, select, summary, label')) return;
      });
    }
  }

  function selectedCount(){
    return document.querySelectorAll('.sequence-list .sequence-row:not(.auto-child)').length;
  }

  function refreshLabels(){
    const nav=document.querySelector('.mobile-workspace-nav');
    if(!nav) return;
    const selection=nav.querySelector('[data-mobile-view="selection"]');
    if(selection){
      const count=selectedCount();
      selection.textContent=count?('Selection · '+count):'Selection';
    }
  }

  function setMobileView(view){
    currentView=view==='selection'?'selection':'catalogue';
    document.body.classList.toggle('mobile-view-catalogue',currentView==='catalogue');
    document.body.classList.toggle('mobile-view-selection',currentView==='selection');
    document.body.classList.remove('mobile-filters-open');
    document.querySelectorAll('[data-mobile-view]').forEach(btn=>{
      btn.classList.toggle('active',btn.dataset.mobileView===currentView);
      btn.setAttribute('aria-pressed',btn.dataset.mobileView===currentView?'true':'false');
    });
    refreshLabels();
  }

  function syncResponsiveMode(){
    ensureMobileUi();
    if(mq.matches){
      if(!document.body.classList.contains('mobile-view-catalogue')&&!document.body.classList.contains('mobile-view-selection')){
        setMobileView(currentView);
      }
    }else{
      document.body.classList.remove('mobile-view-catalogue','mobile-view-selection','mobile-filters-open');
    }
    refreshLabels();
  }

  function installObserver(){
    const list=document.querySelector('.sequence-list');
    if(!list||list.dataset.mobileObserved) return;
    list.dataset.mobileObserved='1';
    new MutationObserver(refreshLabels).observe(list,{childList:true,subtree:true});
  }

  function install(){
    ensureMobileUi();
    installObserver();
    syncResponsiveMode();
    mq.addEventListener?.('change',syncResponsiveMode);
    window.addEventListener('resize',syncResponsiveMode,{passive:true});

    document.addEventListener('keydown',e=>{
      if(e.key==='Escape') document.body.classList.remove('mobile-filters-open');
    });

    document.getElementById('btnExport')?.addEventListener('click',()=>document.body.classList.remove('mobile-filters-open'));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
  setTimeout(()=>{ensureMobileUi();installObserver();syncResponsiveMode();},700);
})();