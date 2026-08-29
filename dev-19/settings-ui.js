(() => {
'use strict';

const DB_NAME='grohe-product-selector-dev19-v1';
const STORE_PRODUCTS='products';
const $=id=>document.getElementById(id);
const normSku=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isPruned=p=>!!p?.pruned||/\bpruned\b|discontinued\s*\/\s*pruned/i.test(String(p?.status||''));
let catalogCache=null;

function parseSkuList(value){
  return [...new Set(String(value||'').split(/[\s,;]+/).map(normSku).filter(Boolean))];
}

async function openExistingDb(){
  if(indexedDB.databases){
    try{
      const dbs=await indexedDB.databases();
      if(!dbs.some(x=>x.name===DB_NAME)) throw new Error('The local product database is still loading. Try again in a moment.');
    }catch(err){
      if(/still loading/i.test(String(err?.message||''))) throw err;
    }
  }
  return await new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME);
    req.onerror=()=>reject(req.error||new Error('Could not open the product database.'));
    req.onsuccess=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE_PRODUCTS)){db.close();reject(new Error('Product database is not ready yet.'));return;}
      resolve(db);
    };
  });
}

async function readCatalogue(force=false){
  if(catalogCache&&!force)return catalogCache;
  const db=await openExistingDb();
  const overrides=await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_PRODUCTS,'readonly');
    const req=tx.objectStore(STORE_PRODUCTS).getAll();
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error||new Error('Could not read product overrides.'));
  });
  db.close();
  const seed=Array.isArray(window.SEED_PRODUCTS)?window.SEED_PRODUCTS:[];
  const seedMap=new Map(seed.map(p=>[normSku(p.sku),p]));
  const overrideMap=new Map();
  const map=new Map(seed.map(p=>[normSku(p.sku),{...p,sku:normSku(p.sku)}]));
  for(const raw of overrides){
    const sku=normSku(raw?.sku);if(!sku)continue;
    overrideMap.set(sku,raw);
    if(raw.deleted){map.delete(sku);continue;}
    map.set(sku,{...(map.get(sku)||{}),...raw,sku});
  }
  catalogCache={products:[...map.values()],map,seedMap,overrideMap};
  return catalogCache;
}

function statusMessage(text,type='info'){
  const el=$('prunedSettingsMessage');if(!el)return;
  el.hidden=!text;el.textContent=text||'';el.dataset.type=type;
}

async function setManualPruned(skus,value){
  const list=[...new Set((skus||[]).map(normSku).filter(Boolean))];
  if(!list.length){statusMessage('Enter at least one SKU.','error');return;}
  statusMessage(value?'Marking products as pruned…':'Marking products as active…');
  try{
    const cat=await readCatalogue(true);
    const db=await openExistingDb();
    const tx=db.transaction(STORE_PRODUCTS,'readwrite');
    const store=tx.objectStore(STORE_PRODUCTS);
    const missing=[];let changed=0;
    for(const sku of list){
      const current=cat.map.get(sku);
      if(!current){missing.push(sku);continue;}
      const raw=cat.overrideMap.get(sku)||{};
      const seed=cat.seedMap.get(sku);
      let nextStatus='Discontinued / Pruned';
      if(!value){
        if(seed&&!isPruned(seed)) nextStatus=String(seed.status||'Active');
        else if(raw.status&&!isPruned({status:raw.status,pruned:false})) nextStatus=String(raw.status);
        else nextStatus='Active';
      }
      const record={...current,...raw,sku,custom:true,pruned:!!value,prunedSource:value?'Manual · Settings':'Manual active override · Settings',status:nextStatus};
      delete record._searchText;delete record._searchCompact;delete record._deleted;
      store.put(record);changed++;
    }
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not save product status.'));tx.onabort=()=>reject(tx.error||new Error('Product status update was cancelled.'));});
    db.close();catalogCache=null;
    const extra=missing.length?` ${missing.length} SKU${missing.length===1?' was':'s were'} not found: ${missing.slice(0,6).join(', ')}${missing.length>6?'…':''}`:'';
    statusMessage(`${changed} product${changed===1?'':'s'} ${value?'marked as pruned':'marked as active'}.${extra}`,missing.length?'warning':'success');
    await renderPrunedList();
    if(changed){setTimeout(()=>location.reload(),850);}
  }catch(err){statusMessage(err?.message||'Could not update product status.','error');}
}

async function renderPrunedList(){
  const listEl=$('prunedSettingsList'),countEl=$('prunedSettingsCount');if(!listEl)return;
  listEl.innerHTML='<div class="settings-loading">Loading product status…</div>';
  try{
    const cat=await readCatalogue(true);
    const query=String($('prunedSettingsSearch')?.value||'').trim().toLowerCase();
    const all=cat.products.filter(isPruned).sort((a,b)=>String(a.sku).localeCompare(String(b.sku)));
    if(countEl)countEl.textContent=`${all.length.toLocaleString()} pruned products`;
    const filtered=!query?all:all.filter(p=>[p.sku,p.description,p.family,p.status].some(v=>String(v||'').toLowerCase().includes(query)));
    if(!filtered.length){listEl.innerHTML='<div class="settings-empty">No pruned products match this search.</div>';return;}
    listEl.innerHTML=filtered.slice(0,300).map(p=>{
      const raw=cat.overrideMap.get(normSku(p.sku));
      const manual=!!raw&&Object.prototype.hasOwnProperty.call(raw,'pruned');
      return `<div class="pruned-product-row"><div><strong>${esc(p.sku)}</strong><span>${esc(p.description||'GROHE product')}</span></div><div class="pruned-row-meta"><small class="${manual?'manual':''}">${manual?'Manual':'Catalogue'}</small><button type="button" class="settings-mini-btn" data-unprune-sku="${esc(p.sku)}">Mark active</button></div></div>`;
    }).join('')+(filtered.length>300?`<div class="settings-more">Showing first 300 of ${filtered.length.toLocaleString()} matching products.</div>`:'');
  }catch(err){listEl.innerHTML=`<div class="settings-empty error">${esc(err?.message||'Could not load product status.')}</div>`;if(countEl)countEl.textContent='Status unavailable';}
}

function createSettingsDialog(){
  if($('settingsWorkspaceDialog'))return $('settingsWorkspaceDialog');
  const dialog=document.createElement('dialog');
  dialog.id='settingsWorkspaceDialog';dialog.className='settings-workspace-dialog';
  dialog.innerHTML=`
    <div class="settings-workspace-shell">
      <header class="settings-workspace-header"><div><span>GROHE SPECBUILDER</span><h2>Settings</h2></div><button type="button" class="settings-close" id="btnCloseSettingsWorkspace" aria-label="Close settings">×</button></header>
      <div class="settings-workspace-body">
        <nav class="settings-workspace-nav" aria-label="Settings sections">
          <button type="button" class="active" data-settings-tab="appearance"><b>Appearance</b><small>Layout and catalogue density</small></button>
          <button type="button" data-settings-tab="assets"><b>Files & assets</b><small>Images and data sheets</small></button>
          <button type="button" data-settings-tab="status"><b>Product status</b><small>Pruned product labels</small></button>
          <button type="button" data-settings-tab="visibility"><b>Visibility</b><small>Hidden catalogue items</small></button>
          <button type="button" data-settings-tab="advanced"><b>Advanced</b><small>Products and templates</small></button>
        </nav>
        <main class="settings-workspace-content">
          <section class="settings-panel active" data-settings-panel="appearance"><div class="settings-panel-title"><div><span>APPEARANCE</span><h3>Workspace layout</h3><p>Adjust the catalogue and selection workspace without changing project data.</p></div></div><div id="settingsAppearanceMount" class="settings-card-grid"></div></section>
          <section class="settings-panel" data-settings-panel="assets"><div class="settings-panel-title"><div><span>FILES & ASSETS</span><h3>Product images and PDFs</h3><p>Manage the folders SpecBuilder uses for local product images and technical data sheets.</p></div></div><div id="settingsAssetsMount" class="settings-card-grid"></div></section>
          <section class="settings-panel" data-settings-panel="status"><div class="settings-panel-title"><div><span>PRODUCT STATUS</span><h3>Pruned products</h3><p>Manually label discontinued items. Pruned items remain hidden while the Pruned catalogue toggle is off.</p></div><strong id="prunedSettingsCount" class="settings-count-chip">Loading…</strong></div>
            <div class="settings-status-editor"><label><span>Paste SKU(s)</span><textarea id="prunedSettingsInput" rows="5" placeholder="Example:\n23462000\n19296000\n2760110E"></textarea><small>Paste one or many SKUs separated by spaces, commas or new lines.</small></label><div class="settings-status-actions"><button type="button" class="btn primary" id="btnMarkPruned">Mark as pruned</button><button type="button" class="btn" id="btnMarkActive">Mark as active</button></div><div id="prunedSettingsMessage" class="settings-status-message" hidden></div></div>
            <div class="settings-list-head"><div><strong>Pruned catalogue</strong><small>Catalogue labels plus your manual overrides</small></div><label class="settings-search"><span>⌕</span><input id="prunedSettingsSearch" type="search" placeholder="Search SKU or description…"></label></div><div id="prunedSettingsList" class="pruned-settings-list"></div>
          </section>
          <section class="settings-panel" data-settings-panel="visibility"><div class="settings-panel-title"><div><span>VISIBILITY</span><h3>Hidden catalogue items</h3><p>Hide products from search and restore them later without deleting them from the product database.</p></div></div><div id="settingsVisibilityMount" class="settings-card-grid"></div></section>
          <section class="settings-panel" data-settings-panel="advanced"><div class="settings-panel-title"><div><span>ADVANCED</span><h3>Catalogue tools</h3><p>Open the full product database or manage reusable templates and bundles.</p></div></div><div id="settingsAdvancedMount" class="settings-card-grid"></div></section>
        </main>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  return dialog;
}

function moveWrap(id,targetId,selector){
  const el=$(id),target=$(targetId);if(!el||!target)return;
  const node=selector?el.closest(selector)||el:el;
  if(node.parentElement===target)return;
  const card=document.createElement('div');card.className='settings-control-card';card.appendChild(node);target.appendChild(card);
}

function populateSettingsPanels(){
  moveWrap('thumbnailSize','settingsAppearanceMount','.thumbnail-setting');
  moveWrap('fontSize','settingsAppearanceMount','.font-setting');
  moveWrap('productColumns','settingsAppearanceMount','.columns-setting');
  moveWrap('catalogSidebarWidth','settingsAppearanceMount','.thumbnail-setting');
  moveWrap('selectionPanelWidth','settingsAppearanceMount','.thumbnail-setting');
  moveWrap('uiDensity','settingsAppearanceMount','.columns-setting');
  moveWrap('btnResetLayout','settingsAppearanceMount');

  moveWrap('settingsImageCount','settingsAssetsMount','.image-setting-status');
  moveWrap('btnLoadImagesMenu','settingsAssetsMount');
  moveWrap('settingsPdfStatus','settingsAssetsMount','.data-sheet-setting-status');
  moveWrap('btnDataSheetsFolder','settingsAssetsMount');
  moveWrap('btnRescanDataSheets','settingsAssetsMount');

  moveWrap('settingsHiddenCount','settingsVisibilityMount','.hidden-items-setting-status');
  moveWrap('btnHiddenItems','settingsVisibilityMount');

  moveWrap('btnTemplates','settingsAdvancedMount');
  moveWrap('btnDatabase','settingsAdvancedMount');
}

function setSettingsTab(name){
  document.querySelectorAll('[data-settings-tab]').forEach(b=>b.classList.toggle('active',b.dataset.settingsTab===name));
  document.querySelectorAll('[data-settings-panel]').forEach(p=>p.classList.toggle('active',p.dataset.settingsPanel===name));
  if(name==='status')renderPrunedList();
}

function installExportBack(){
  const d=$('exportDialog');if(!d||$('btnBackExportChoice'))return;
  const footer=d.querySelector('.modal-footer');if(!footer)return;
  const back=document.createElement('button');back.type='button';back.className='btn export-back-btn';back.id='btnBackExportChoice';back.textContent='← Back';
  back.addEventListener('click',()=>{if(d.open)d.close();const choice=$('exportChoiceDialog');if(choice&&!choice.open)choice.showModal();});
  footer.prepend(back);
}

function install(){
  const menu=$('projectMenu');if(!menu)return;
  const dialog=createSettingsDialog();populateSettingsPanels();installExportBack();
  const summary=menu.querySelector('summary');
  if(summary&&!summary.dataset.settingsWorkspaceBound){
    summary.dataset.settingsWorkspaceBound='1';
    summary.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();menu.open=false;if(!dialog.open)dialog.showModal();},true);
  }
  $('btnCloseSettingsWorkspace')?.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  dialog.querySelectorAll('[data-settings-tab]').forEach(b=>b.addEventListener('click',()=>setSettingsTab(b.dataset.settingsTab)));
  $('btnMarkPruned')?.addEventListener('click',()=>setManualPruned(parseSkuList($('prunedSettingsInput')?.value),true));
  $('btnMarkActive')?.addEventListener('click',()=>setManualPruned(parseSkuList($('prunedSettingsInput')?.value),false));
  $('prunedSettingsSearch')?.addEventListener('input',renderPrunedList);
  $('prunedSettingsList')?.addEventListener('click',e=>{const b=e.target.closest('[data-unprune-sku]');if(b)setManualPruned([b.dataset.unpruneSku],false);});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
setTimeout(install,500);
})();
