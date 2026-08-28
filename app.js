(() => {
  'use strict';
  // GROHE Products Builder v18.4.5 — generated from modular source sections.

  // ===== 00_bootstrap_state.js =====

const DB_NAME = 'grohe-product-selector-v1';
const DB_VERSION = 3;
const STORE_PRODUCTS = 'products';
const STORE_PROJECTS = 'projects';
const STORE_META = 'meta';
const STORE_HANDLES = 'handles';
const STORE_CHANGES = 'changes';

const {
  FINISH_CODES,RECOGNIZED_FINISHES,SEARCH_ALIASES,
  normalizeSku,normalizeText,esc,sortUnique,safeFilename,uid,today,
  compactSearchToken,searchVariants,smartFacetMatch
} = window.GROHECore;

const state = {
  db: null,
  products: [],
  productMap: new Map(),
  customCount: 0,
  project: null,
  projects: [],
  imageFiles: new Map(),
  imageUrls: new Map(),
  replaceItemId: null,
  dragItemId: null,
  dbSelectedSku: '',
  dbLimit: 120,
  deletedCount: 0,
  deletedRecords: [],
  imageFolderConnected: false,
  imageSource: '',
  manualImageHandle: null,
  filters: { area:[], category:[], family:[], finish:[], size:[], mounting:[], function:[], outlets:[], shape:[], status:[] },
  viewFilter: '',
  favorites: new Set(),
  hiddenSkus: new Set(),
  recentProducts: [],
  recentSearches: [],
  templates: [],
  compatRules: [],
  preferences: {},
  qualityIssues: [],
  runtimeErrors: [],
  importPreviewRows: [],
  resultLimit: 90,
  currentResults: [],
  renderedResults: 0,
  undoStack: [],
  redoStack: [],
  historyProjectId: '',
  historyLock: false,
  thumbnailSize: 136,
  fontSize: 115,
  productColumns: 4,
  catalogSidebarWidth: 260,
  selectionPanelWidth: 400,
  uiDensity: 'comfortable',
  includeCeramics: false,
  includePruned: false,
  showMissingImagesOnly: false,
  selectionView: {showImages:true,showDescriptions:true,showBadges:true,showParentRef:true,showConcealed:true,compactRows:true,imageSize:92},
  projectFinishTargetId: '',
  searchCache: new Map(),
  productDataVersion: 0,
  visibleProductCache: null,
  selectedSkuCounts: new Map(),
  searchVocabulary: new Set(),
  searchVocabularyVersion: 0,
  searchCorrectionCache: new Map(),
  searchLexiconVersion: 0,
  searchLexicon: {families:[], finishes:[]},
  catalogueView: {showImages:true,showFamily:true,showDescriptions:true,showFinish:true,showBadges:true,compactCards:false,cardLayout:'top'}
};

const $ = (id) => document.getElementById(id);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

// Phase 1 selection hierarchy: Project → Options → Rooms → Products.
// Legacy projects keep using project.items through an active-option compatibility
// alias, so every existing v15.6 feature continues to work without a UI rewrite.
function cloneItemsWithFreshIds(items=[]){
  const source=structuredClone(items||[]), idMap=new Map();
  source.forEach(it=>idMap.set(it.id,uid()));
  return source.map(it=>{
    const oldId=it.id, c={...it,id:idMap.get(oldId)};
    if(it.parentItemId)c.parentItemId=idMap.get(it.parentItemId)||null;
    if(it.groupId)c.groupId=idMap.get(it.groupId)||c.id;
    return c;
  });
}
function nextOptionName(project){
  const used=new Set((project?.options||[]).map(o=>String(o.name||'').trim().toLowerCase()));
  if(!used.has('selection')) return 'Selection';
  let n=2; while(used.has(`selection ${n}`))n++; return `Selection ${n}`;
}
function ensureProjectOptions(project){
  if(!project) return null;
  if(!Array.isArray(project.options)||!project.options.length){
    const initialItems=Array.isArray(project.items)?project.items:[];
    const first={id:uid(),name:'Selection',finish:String(project.finish||''),items:initialItems,createdAt:project.createdAt||new Date().toISOString()};
    project.options=[first]; project.activeOptionId=first.id;
  }
  project.options.forEach((o,i)=>{
    if(!o.id)o.id=uid();
    if(!o.name)o.name=i===0?'Selection':`Selection ${i+1}`;
    if(/^Option\s+\d+$/i.test(String(o.name||''))) o.name=i===0?'Selection':`Selection ${i+1}`;
    if(!Array.isArray(o.items))o.items=[];
    if(typeof o.finish!=='string')o.finish='';
  });
  let active=project.options.find(o=>o.id===project.activeOptionId);
  if(!active){active=project.options[0];project.activeOptionId=active.id;}
  project.items=active.items;
  project.finish=active.finish||'';
  return active;
}
function activeSelectionOption(project=state.project){return ensureProjectOptions(project);}
function syncActiveOption(project=state.project){
  if(!project)return null;
  const active=project.options?.find(o=>o.id===project.activeOptionId)||ensureProjectOptions(project);
  if(active){active.items=project.items||[];active.finish=String(project.finish||'');}
  return active;
}
function optionItems(option){return Array.isArray(option?.items)?option.items:[];}
function optionProductCount(option){return optionItems(option).filter(x=>x.type==='product'&&!x.auto).length;}
function optionRoomCount(option){return optionItems(option).filter(x=>x.type==='section').length|| (optionProductCount(option)?1:0);}

function isCeramicProduct(p){
  // Ceramics Off is a catalogue-level switch, not only a search modifier. Keep
  // ceramic fixtures out of the home list, smart-search results AND facet counts.
  // Avoid generic description matching because mixers legitimately contain words
  // such as "ceramic cartridge".
  const area=normalizeText(p?.area||'');
  const category=normalizeText(p?.category||'');
  const family=normalizeText(p?.family||'');
  const sourceText=normalizeText([p?.source,p?.keywords,p?.fullText].join(' '));
  if(area==='ceramics' || area.startsWith('ceramics ')) return true;
  if(category==='ceramics' || category.startsWith('ceramics ') || ['basin ceramic','wc / ceramic','bidet ceramic','shower toilet','shower tray'].includes(category)) return true;
  if(/\bceramic(?:s)?\b/.test(family)) return true;
  if(/\bgrohe ceramics\b/.test(sourceText)) return true;
  return false;
}
function isPrunedProduct(p){
  return !!p?.pruned || /\bpruned\b|discontinued\s*\/\s*pruned/i.test(String(p?.status||''));
}
function isWcActuationProduct(p){
  const category=normalizeText(p?.category||'');
  const h=normalizeText([p?.description,p?.fullText,p?.family].join(' '));
  const isPlate=category==='flush plate / actuation' || /\bflush plate\b|\bactuation plate\b|\bwc plate\b/.test(h);
  return isPlate && !/\burinal\b|inspection shaft|revision shaft/.test(h);
}
function visibleCatalogueProducts(){
  const key=`${state.productDataVersion}|${state.includeCeramics?'1':'0'}|${state.includePruned?'1':'0'}|h${state.hiddenSkus.size}`;
  if(state.visibleProductCache?.key===key) return state.visibleProductCache.list;
  const list=state.products.filter(p=>!state.hiddenSkus.has(normalizeSku(p.sku))&&(state.includeCeramics||!isCeramicProduct(p))&&(state.includePruned||!isPrunedProduct(p)));
  state.visibleProductCache={key,list};
  return list;
}
function invalidateSearchCaches(){ state.searchCache.clear(); state.visibleProductCache=null; }
function updateCeramicsToggle(){
  const btn=$('btnCeramicsToggle'); if(!btn) return;
  btn.classList.toggle('active',state.includeCeramics);
  btn.setAttribute('aria-checked',state.includeCeramics?'true':'false');
  btn.title=state.includeCeramics?'Ceramics are shown — click to hide them':'Ceramics are hidden — click to show them';
}
function updatePrunedToggle(){
  const btn=$('btnPrunedToggle'); if(!btn) return;
  btn.classList.toggle('active',state.includePruned);
  btn.setAttribute('aria-checked',state.includePruned?'true':'false');
  btn.title=state.includePruned?'Pruned products are shown — click to hide them':'Pruned products are hidden — click to show them';
}
function updateMissingImagesFilterButton(){
  const menuBtn=$('btnMissingImagesOnly');
  if(menuBtn){
    menuBtn.classList.toggle('active',!!state.showMissingImagesOnly);
    menuBtn.setAttribute('aria-pressed',state.showMissingImagesOnly?'true':'false');
    menuBtn.textContent=state.showMissingImagesOnly?'✓ Products without images only':'Show products without images';
  }
  const sideBtn=$('btnMissingImagesSidebar');
  if(sideBtn){
    sideBtn.classList.toggle('active',!!state.showMissingImagesOnly);
    sideBtn.setAttribute('aria-pressed',state.showMissingImagesOnly?'true':'false');
    sideBtn.textContent=state.showMissingImagesOnly?'Showing products without images':'Products without images';
  }
}
async function setMissingImagesOnly(value){
  const next=!!value;
  if(next && !state.imageFolderConnected){
    try{await connectImageFolder();}catch(_){}
    if(!state.imageFolderConnected){toast('Load the product image folder to identify missing images');return;}
  }
  state.showMissingImagesOnly=next;
  updateMissingImagesFilterButton();
  state.resultLimit=90;
  renderFilters();
}
function persistCatalogueScopePreference(key,value){
  if(!state.db) return;
  state.preferences[key]=!!value;
  Promise.resolve(savePreferences()).catch(()=>{});
}
async function setCeramicsIncluded(value,persist=true){
  state.includeCeramics=!!value;
  invalidateSearchCaches();
  updateCeramicsToggle();
  state.resultLimit=90;
  renderFilters();
  if(persist) persistCatalogueScopePreference('includeCeramics',state.includeCeramics);
}
async function setPrunedIncluded(value,persist=true){
  state.includePruned=!!value;
  if(!state.includePruned && Array.isArray(state.filters.status)) state.filters.status=state.filters.status.filter(v=>!/pruned/i.test(String(v)));
  invalidateSearchCaches();
  updatePrunedToggle();
  state.resultLimit=90;
  renderFilters();
  if(persist) persistCatalogueScopePreference('includePruned',state.includePruned);
}

function closeActionMenus(except=null){
  qsa('.action-menu[open]').forEach(menu=>{ if(menu!==except) menu.open=false; });
}
window.addEventListener('resize',()=>closeItemMenuPortal?.());
window.addEventListener('scroll',e=>{ if(e.target?.closest?.('#itemMenuPortal')) return; closeItemMenuPortal?.(); },true);

function projectSnapshot(){ if(!state.project)return null; syncActiveOption(state.project); return structuredClone(state.project); }
function updateHistoryButtons(){
  const undo=$('btnUndo'), redo=$('btnRedo');
  if(undo){ undo.disabled=!state.undoStack.length; undo.title=state.undoStack.length?`Undo: ${state.undoStack[state.undoStack.length-1].label}`:'Nothing to undo'; }
  if(redo){ redo.disabled=!state.redoStack.length; redo.title=state.redoStack.length?`Redo: ${state.redoStack[state.redoStack.length-1].label}`:'Nothing to redo'; }
}
function resetProjectHistory(){
  state.undoStack=[]; state.redoStack=[]; state.historyProjectId=state.project?.id||''; updateHistoryButtons();
}
function pushProjectHistory(label='Project change'){
  if(state.historyLock || !state.project) return;
  if(state.historyProjectId!==state.project.id) resetProjectHistory();
  state.undoStack.push({label,project:projectSnapshot()});
  if(state.undoStack.length>50) state.undoStack.shift();
  state.redoStack=[]; updateHistoryButtons();
}
async function persistHistoryProject(){
  if(!state.project) return;
  syncActiveOption(state.project);
  state.project.updatedAt=new Date().toISOString();
  await idbPut(STORE_PROJECTS,state.project);
  await idbPut(STORE_META,{key:'lastProjectId',value:state.project.id});
  const idx=state.projects.findIndex(p=>p.id===state.project.id);
  if(idx>=0) state.projects[idx]=structuredClone(state.project); else state.projects.unshift(structuredClone(state.project));
}
async function undoProject(){
  if(!state.project || !state.undoStack.length) return;
  const entry=state.undoStack.pop();
  state.redoStack.push({label:entry.label,project:projectSnapshot()});
  state.historyLock=true; state.project=structuredClone(entry.project);
  try{ await persistHistoryProject(); } finally { state.historyLock=false; }
  updateHistoryButtons(); renderProject(); renderResults(); toast(`Undo: ${entry.label}`);
}
async function redoProject(){
  if(!state.project || !state.redoStack.length) return;
  const entry=state.redoStack.pop();
  state.undoStack.push({label:entry.label,project:projectSnapshot()});
  state.historyLock=true; state.project=structuredClone(entry.project);
  try{ await persistHistoryProject(); } finally { state.historyLock=false; }
  updateHistoryButtons(); renderProject(); renderResults(); toast(`Redo: ${entry.label}`);
}

function applyThumbnailSize(value, persist=false){
  const n=Math.max(72,Math.min(180,Number(value)||136));
  state.thumbnailSize=n;
  document.documentElement.style.setProperty('--product-thumb-size',`${n}px`);
  document.documentElement.setAttribute('data-product-thumb-size',String(n));
  const slider=$('thumbnailSize'), label=$('thumbnailSizeValue');
  if(slider && Number(slider.value)!==n) slider.value=String(n);
  if(label) label.textContent=`${n} px`;
  if(persist && state.db){ state.preferences.thumbnailSize=n; savePreferences(); }
}


function applyFontSize(value, persist=false){
  const n=Math.max(90,Math.min(140,Number(value)||115));
  state.fontSize=n;
  document.documentElement.style.setProperty('--ui-font-scale',String(n/100));
  const slider=$('fontSize'), label=$('fontSizeValue');
  if(slider && Number(slider.value)!==n) slider.value=String(n);
  if(label) label.textContent=`${n}%`;
  if(state.selectionView) applySelectionView(false);
  if(persist && state.db){ state.preferences.fontSize=n; savePreferences(); }
}

function applyProductColumns(value, persist=false){
  const parsed=Number(value);
  const n=[2,3,4,5,6].includes(parsed)?parsed:4;
  state.productColumns=n;
  document.documentElement.style.setProperty('--selector-columns',String(n));
  document.documentElement.setAttribute('data-product-columns',String(n));
  const select=$('productColumns'), viewSelect=$('catalogueColumns'); if(select && Number(select.value)!==n) select.value=String(n); if(viewSelect && Number(viewSelect.value)!==n) viewSelect.value=String(n);
  if(persist && state.db){ state.preferences.productColumns=n; savePreferences(); }
}

function applyCatalogSidebarWidth(value, persist=false){
  const n=Math.max(230,Math.min(520,Number(value)||280));
  state.catalogSidebarWidth=n;
  document.documentElement.style.setProperty('--catalog-sidebar-width',`${n}px`);
  document.documentElement.setAttribute('data-catalog-sidebar-width',String(n));
  const slider=$('catalogSidebarWidth'), label=$('catalogSidebarWidthValue');
  if(slider && Number(slider.value)!==n) slider.value=String(n);
  if(label) label.textContent=`${n} px`;
  if(persist && state.db){ state.preferences.catalogSidebarWidth=n; savePreferences(); }
}

function applySelectionPanelWidth(value, persist=false){
  const n=Math.max(320,Math.min(760,Number(value)||430));
  state.selectionPanelWidth=n;
  document.documentElement.style.setProperty('--selection-panel-width',`${n}px`);
  document.documentElement.setAttribute('data-selection-panel-width',String(n));
  const slider=$('selectionPanelWidth'), label=$('selectionPanelWidthValue');
  if(slider && Number(slider.value)!==n) slider.value=String(n);
  if(label) label.textContent=`${n} px`;
  if(persist && state.db){ state.preferences.selectionPanelWidth=n; savePreferences(); }
}

function applyUiDensity(value='comfortable', persist=false){
  const allowed=new Set(['compact','comfortable','spacious']);
  const mode=allowed.has(String(value)) ? String(value) : 'comfortable';
  state.uiDensity=mode;
  document.documentElement.setAttribute('data-ui-density',mode);
  const select=$('uiDensity');
  if(select && select.value!==mode) select.value=mode;
  if(persist && state.db){ state.preferences.uiDensity=mode; savePreferences(); }
}

function resetUiLayout(){
  applyThumbnailSize(136,true);
  applyFontSize(115,true);
  applyProductColumns(4,true);
  applyCatalogSidebarWidth(260,true);
  applySelectionPanelWidth(400,true);
  applyUiDensity('comfortable',true);
  resetSelectionView();
  toast('Layout reset');
}

function applySelectionView(persist=false){
  const defaults={showImages:true,showDescriptions:true,showBadges:true,showParentRef:true,showConcealed:true,compactRows:true,imageSize:92,textSize:100};
  state.selectionView={...defaults,...(state.selectionView||{})};
  const panel=document.querySelector('.sequence-panel');
  const imageSize=Math.max(64,Math.min(160,Number(state.selectionView.imageSize)||92));
  const textSize=Math.max(85,Math.min(150,Number(state.selectionView.textSize)||100));
  if(panel){
    panel.classList.toggle('seq-hide-images',!state.selectionView.showImages);
    panel.classList.toggle('seq-hide-descriptions',!state.selectionView.showDescriptions);
    panel.classList.toggle('seq-hide-badges',!state.selectionView.showBadges);
    panel.classList.toggle('seq-hide-parent-ref',!state.selectionView.showParentRef);
    panel.classList.toggle('seq-hide-concealed',!state.selectionView.showConcealed);
    panel.classList.toggle('seq-compact',!!state.selectionView.compactRows);
    panel.style.setProperty('--selection-thumb-size',`${imageSize}px`);
    const ui=Math.max(.9,Math.min(1.4,Number(state.fontSize||115)/100));
    const scale=ui*(textSize/100);
    const sizes={
      '--seq-sku-font':10.3,
      '--seq-desc-font':9,
      '--seq-parent-font':6.8,
      '--seq-break-font':10,
      '--seq-break-finish-font':7.5,
      '--seq-body-label-font':6.5,
      '--seq-body-select-font':7.7,
      '--seq-required-font':7.2
    };
    Object.entries(sizes).forEach(([key,value])=>panel.style.setProperty(key,`${(value*scale).toFixed(2)}px`));
  }
  const map={viewShowImages:'showImages',viewShowDescriptions:'showDescriptions',viewShowBadges:'showBadges',viewShowParentRef:'showParentRef',viewShowConcealed:'showConcealed',viewCompactRows:'compactRows'};
  Object.entries(map).forEach(([id,key])=>{const el=$(id);if(el)el.checked=!!state.selectionView[key];});
  const imageSlider=$('selectionImageSize'),imageLabel=$('selectionImageSizeValue');
  if(imageSlider)imageSlider.value=String(imageSize); if(imageLabel)imageLabel.textContent=`${imageSize} px`;
  const textSlider=$('selectionTextSize'),textLabel=$('selectionTextSizeValue');
  if(textSlider)textSlider.value=String(textSize); if(textLabel)textLabel.textContent=`${textSize}%`;
  if(persist&&state.db){state.preferences.selectionView={...state.selectionView};savePreferences();}
}
function setSelectionViewOption(key,value){ state.selectionView[key]=value; applySelectionView(true); }
function resetSelectionView(){ state.selectionView={showImages:true,showDescriptions:true,showBadges:true,showParentRef:true,showConcealed:true,compactRows:true,imageSize:92,textSize:100};applySelectionView(true); }

function applyCatalogueView(persist=false){
  const defaults={showImages:true,showFamily:true,showDescriptions:true,showFinish:true,showBadges:true,compactCards:false,cardLayout:'top'};
  state.catalogueView={...defaults,...(state.catalogueView||{})};
  const panel=document.querySelector('.selector-panel');
  if(panel){
    panel.classList.toggle('catalogue-hide-images',!state.catalogueView.showImages);
    panel.classList.toggle('catalogue-hide-family',!state.catalogueView.showFamily);
    panel.classList.toggle('catalogue-hide-descriptions',!state.catalogueView.showDescriptions);
    panel.classList.toggle('catalogue-hide-finish',!state.catalogueView.showFinish);
    panel.classList.toggle('catalogue-hide-badges',!state.catalogueView.showBadges);
    panel.classList.toggle('catalogue-compact-cards',!!state.catalogueView.compactCards);
    panel.classList.toggle('catalogue-layout-side',state.catalogueView.cardLayout==='side');
    panel.classList.toggle('catalogue-layout-top',state.catalogueView.cardLayout!=='side');
  }
  const map={catalogueShowImages:'showImages',catalogueShowFamily:'showFamily',catalogueShowDescriptions:'showDescriptions',catalogueShowFinish:'showFinish',catalogueShowBadges:'showBadges',catalogueCompactCards:'compactCards'};
  Object.entries(map).forEach(([id,key])=>{const el=$(id);if(el)el.checked=!!state.catalogueView[key];});
  const layoutSelect=$('catalogueCardLayout'); if(layoutSelect) layoutSelect.value=state.catalogueView.cardLayout==='side'?'side':'top';
  if(persist&&state.db){state.preferences.catalogueView={...state.catalogueView};savePreferences();}
}
function setCatalogueViewOption(key,value){state.catalogueView[key]=value;applyCatalogueView(true);}
function resetCatalogueView(){state.catalogueView={showImages:true,showFamily:true,showDescriptions:true,showFinish:true,showBadges:true,compactCards:false,cardLayout:'top'};applyProductColumns(4,true);applyCatalogueView(true);}

const FINISH_VISUALS = {
  'Chrome':['linear-gradient(135deg,#ffffff 0%,#cfd8de 35%,#f8fbfd 55%,#9eabb4 100%)','#20323e','#8f9ea8'],'Crafted Chrome':['linear-gradient(135deg,#fdfefe 0%,#aebbc3 28%,#eef3f6 48%,#788891 72%,#dfe7eb 100%)','#20323e','#7d8d96'],'Supersteel':['linear-gradient(135deg,#e0e2e1,#9da4a5 48%,#c9cece)','#202a2e','#858e90'],'Stainless Steel':['linear-gradient(135deg,#e3e6e7,#a5abad 45%,#d1d5d6)','#253139','#8e979a'],'Satin Steel':['linear-gradient(135deg,#c8ced1,#969fa3 50%,#b9c0c3)','#26323a','#7d888d'],'Brushed Nickel':['repeating-linear-gradient(100deg,#b9afa0 0 2px,#d2c8b9 2px 4px)','#332f29','#968b7d'],'Cool Sunrise':['linear-gradient(135deg,#ffe99a,#d6aa24 52%,#f5d967)','#493700','#b68a16'],'Brushed Cool Sunrise':['repeating-linear-gradient(105deg,#d8c178 0 2px,#b99c4e 2px 4px)','#3c3109','#967b36'],'Brushed Crafted Cool Sunrise':['repeating-linear-gradient(105deg,#c7ad69 0 2px,#9f8545 2px 4px)','#372d09','#876f31'],'Warm Sunset':['linear-gradient(135deg,#e8b39c,#bd7458 52%,#d9987d)','#48251a','#a9624b'],'Brushed Warm Sunset':['repeating-linear-gradient(105deg,#c58c76 0 2px,#9f6854 2px 4px)','#43251c','#875443'],'Hard Graphite':['linear-gradient(135deg,#686e72,#353b3e 55%,#555b5e)','#ffffff','#292e31'],'Brushed Hard Graphite':['repeating-linear-gradient(105deg,#74787a 0 2px,#53585b 2px 4px)','#ffffff','#414649'],'Satin Graphite':['linear-gradient(135deg,#85898c,#5f6468 55%,#777c80)','#ffffff','#50555a'],'Phantom Black':['linear-gradient(135deg,#24292d,#07090b 65%,#171a1d)','#ffffff','#000000'],'Matte Black':['#161616','#ffffff','#000000'],'Velvet Black':['linear-gradient(135deg,#353438,#17171a)','#ffffff','#09090a'],'Black / Chrome':['linear-gradient(90deg,#171717 0 48%,#e5ebef 52% 100%)','#ffffff','#6f7a80'],'Chrome / black':['linear-gradient(90deg,#e5ebef 0 48%,#171717 52% 100%)','#ffffff','#6f7a80'],'Alpine White':['#f7f7f3','#30404a','#c6c8c4'],'Moon White':['#eeeae1','#36424a','#c8c1b4'],'Moon White / Chrome':['linear-gradient(90deg,#eeeae1 0 48%,#dce4e8 52% 100%)','#35424a','#b9c1c4'],'Glass':['linear-gradient(135deg,rgba(220,242,248,.92),rgba(255,255,255,.42),rgba(177,213,225,.86))','#274552','#8db5c3'],'Marble Black':['linear-gradient(135deg,#17191b 0 38%,#6b6964 40% 43%,#25272a 45% 70%,#8b877f 72% 74%,#111315 76%)','#ffffff','#050607'],'Marble White':['linear-gradient(135deg,#f4f2ec 0 40%,#b9b7b2 42% 44%,#ffffff 46% 72%,#c8c5bf 74% 76%,#efede8 78%)','#3b4348','#b8b5ae'],'No colour':['#e6eaec','#4f606a','#c8d0d4'],'No colour / technical':['repeating-linear-gradient(45deg,#edf1f3 0 5px,#dfe5e8 5px 10px)','#53616c','#c4ced3']
};
function finishVisual(name=''){
  const row=FINISH_VISUALS[String(name||'').trim()]||['#edf1f3','#425462','#d3dbe0'];
  return {bg:row[0],fg:row[1],border:row[2]};
}
function finishStyleAttr(name=''){ const v=finishVisual(name); return `--finish-bg:${v.bg};--finish-fg:${v.fg};--finish-border:${v.border}`; }
function finishSwatchHtml(name=''){ return `<i class="finish-swatch" style="${finishStyleAttr(name)}" aria-hidden="true"></i>`; }
function finishPillHtml(name='',code=''){ if(!name)return ''; return `<span class="finish-pill" style="${finishStyleAttr(name)}">${finishSwatchHtml(name)}<span>${esc(name)}${code?` · ${esc(code)}`:''}</span></span>`; }
function finishCodeBadgeHtml(name='',code=''){ const label=(code||productFinishCode(name)||'').trim(); if(!label)return ''; return `<span class="finish-code-badge" title="${esc(name)}" aria-label="${esc(name)}" style="${finishStyleAttr(name)}">${esc(label)}</span>`; }
function isSpaProduct(p){
  if(!p) return false;
  if(String(p.area||'').toUpperCase()==='GROHE SPA') return true;
  return /grohe spa|rainshower aqua|aqua tiles?|aquasymphony/.test(normalizeText([p.area,p.family,p.description,p.fullText,p.source].join(' ')));
}


const MAIN_CATALOGUE_SOURCE = 'GROHE Catalogue 2024/2025';
const FINISH_CODE_PAIRS = [
  ['AL','Brushed Hard Graphite'],['GN','Brushed Cool Sunrise'],['DL','Brushed Warm Sunset'],['DC','Supersteel'],
  ['GL','Cool Sunrise'],['DA','Warm Sunset'],['KF','Phantom Black'],['A0','Hard Graphite'],['SD','Stainless Steel'],
  ['MS','Satin Steel'],['MG','Satin Graphite'],['LS','Moon White'],['KS','Velvet Black']
];

function inferFinish(p){
  if(String(p.finish||'').trim()) return String(p.finish).trim();
  const sku=normalizeSku(p.sku||'');
  const tail=sku.slice(-6);
  for(const [code,name] of FINISH_CODE_PAIRS){
    const re=new RegExp(`${code}[0-9A-Z]{1,2}$`,'i');
    if(re.test(sku) || tail.includes(code)) return name;
  }
  const hay=normalizeText([p.description,p.fullText].join(' '));
  if(/\bmatte black\b/.test(hay) || /243[0-9a-z]$/.test(sku.toLowerCase())) return 'Matte Black';
  // GROHE chrome article numbers commonly end 00 + a revision digit (001/002/003),
  // while newer 10-digit numbers often end 0000. Treat both as Chrome so old
  // catalogue records participate in finish-variant selection correctly.
  if(/00[0-9A-Z]{1,2}$/.test(sku) || /\bchrome\b/.test(hay) || /^\d{6,10}0{2,4}$/.test(sku)) return 'Chrome';
  return 'No colour / technical';
}

function inferSize(p){
  if(String(p.size||'').trim()) return String(p.size).trim();
  const hay=normalizeText([p.description,p.fullText].join(' '));
  const named=hay.match(/\b(xs|xl|s|m|l)[ -]?size\b/); if(named) return named[1].toUpperCase();
  const mm=hay.match(/\b(110|130|150|210|250|260|300|310|360)\s*mm\b/); if(mm) return mm[1];
  if(/\bxl\b/.test(hay)&&/basin|mixer|vessel/.test(hay)) return 'XL';
  return 'Not specified';
}

function inferMounting(p){
  if(String(p.mounting||'').trim()) return String(p.mounting).trim();
  const hay=normalizeText([p.description,p.fullText].join(' '));
  if(/ceiling/.test(hay)) return 'Ceiling';
  // "for free-standing basins" describes the basin, not the mixer installation.
  // XL/vessel basin mixers using this wording are normal deck-mounted complete products.
  if(/for free[- ]?standing basins|for freestanding basins/.test(hay)) return 'Deck Mounted';
  if(/floor mounted|floor-mounted|floorstanding|free standing|free-standing|freestanding/.test(hay)) return 'Free Standing';
  if(/deck mount|deck mounted/.test(hay)) return 'Deck Mounted';
  if(/concealed|final installation for|trimset|trim set|rough in/.test(hay)) return 'Concealed';
  if(/wall mount|wall mounted|wall union|wall holder/.test(hay)) return 'Wall Mounted';
  if(/exposed/.test(hay)) return 'Exposed';
  return 'Not specified';
}

function inferFunction(p){
  if(String(p.function||'').trim()) return String(p.function).trim();
  const hay=normalizeText([p.description,p.fullText].join(' '));
  if(/smartcontrol/.test(hay)) return 'SmartControl';
  if(/thermostat|thermostatic|turbostat/.test(hay)) return 'Thermostatic';
  if(/electronic|infra red|infrared|touchless/.test(hay)) return 'Electronic / touchless';
  if(/self closing|self-closing/.test(hay)) return 'Self-closing';
  if(/two handle|2 handle|two-handle|3 hole|three hole/.test(hay)) return 'Two Handle / multi-hole';
  if(/single lever|single-lever|ohm|slm/.test(hay)) return 'Single Lever';
  return 'Standard / accessory';
}

function inferOutlets(p){
  if(String(p.outlets||'').trim()) return String(p.outlets).trim();
  const hay=normalizeText([p.description,p.fullText].join(' '));
  let m=hay.match(/\b([1-5])\s*(?:outlet|outlets|way|ways|valve|valves)\b/); if(m) return m[1];
  m=hay.match(/\b([2-5])-way\b/); if(m) return m[1];
  if(/2 way diverter|two way diverter/.test(hay)) return '2';
  if(/3 way diverter|three way diverter/.test(hay)) return '3';
  return 'Not applicable';
}

function inferShape(p){
  if(String(p.shape||'').trim()) return String(p.shape).trim();
  const hay=normalizeText([p.description,p.fullText,p.family].join(' '));
  if(/cube|square|rectangular/.test(hay)) return 'Square / Cube';
  if(/round|circular/.test(hay)) return 'Round';
  return 'Not specified';
}

function inferCategory(p){
  const existing=String(p.category||'').trim();
  if(existing){
    const aliases={'Concealed Body':'Concealed / Rough-in','Shower Rail':'Shower Set / Rail','Shower Rail / Holder / Outlet':'Shower Accessory','Thermostat':'Shower Mixer','Ceramics / Toilet':'WC / Ceramic','Flush Plate':'Flush Plate / Actuation'};
    return aliases[existing]||existing;
  }
  const hay=normalizeText([p.description,p.fullText,p.family,existing].join(' '));
  const page=Number(p.sourcePage)||0;
  const source=String(p.source||'');
  const legacyChapter=source==='GROHE Catalogue 2017/2018'?parseInt(String(p.sourcePage||'').match(/\d{2,3}/)?.[0]||'0',10):0;
  if(/foam shower/.test(hay)) return 'Foam Shower';
  if(/steam generator/.test(hay)) return 'Steam Generator';
  if(/kitchen sink|stainless steel sink|composite sink/.test(hay)) return 'Kitchen Sink';
  if(/blue professional|blue home|blue pure|grohe red|water filter|filter starter|filtering system|boiling water/.test(hay)) return 'Kitchen Water System';
  if(/sink mixer|kitchen tap|kitchen faucet/.test(hay)) return 'Kitchen Mixer';
  if(/flush plate|actuation plate|wall plate/.test(hay)) return 'Flush Plate / Actuation';
  if(/flushing cistern|flush valve|cistern/.test(hay) && !/concealed body/.test(hay)) return 'Flushing System';
  if(/rapid sl|rapid slx|uniset|installation frame|shower frame|support rail/.test(hay)) return 'Installation System';
  const primary=normalizeText([p.description,p.family].join(' '));
  const productIsRoughIn=/rough in|rough-in|concealed body|rapido smartbox/.test(primary) && !/without concealed body|final installation for|requires rough in|requires rough-in|to be ordered separately/.test(primary);
  if(productIsRoughIn) return 'Concealed / Rough-in';
  if(/urinal/.test(hay) && (/flush|actuation|frame|ceramic|inlet|outlet/.test(hay)||page>=418)) return 'Urinal';
  if(/sensia|shower toilet/.test(hay)) return 'Shower Toilet';
  if(/bidet ceramic|ceramic bidet/.test(hay)) return 'Bidet Ceramic';
  if(/wash basin|washbasin|basin ceramic/.test(hay) && /ceramic|ceramics/.test(hay)) return 'Basin Ceramic';
  if(/wall hung wc|wall-hung wc|floorstanding wc|floor-standing toilet|toilet seat|ceramic wc|wc ceramic/.test(hay) && (page>=418 || /ceramic/.test(hay))) return 'WC / Ceramic';
  if(/shower tray/.test(hay)) return 'Shower Tray';
  // Classify the visible/final product before looking at its required rough-in. This
  // prevents head showers and trimsets from incorrectly appearing under Rough-ins.
  if(/trigger spray/.test(hay)) return 'Trigger Spray';
  if(/body spray/.test(hay)) return 'Body Spray';
  if(/shower rail set|rail set|shower set/.test(hay)) return 'Shower Set / Rail';
  if(/shower rail/.test(hay)) return 'Shower Set / Rail';
  if(/wall holder set|hand shower holder|wall hand shower holder|shower outlet elbow|wall union/.test(hay)) return 'Shower Accessory';
  if(/shower hose/.test(hay)) return 'Shower Hose';
  if(/head shower|headshower|ceiling shower/.test(hay)) return 'Head Shower';
  if(/hand shower|handshower/.test(hay)) return 'Hand Shower';
  if(/shower system/.test(hay)) return 'Shower System';
  if(/bath mixer|bath tub mixer|bathtub mixer|bath combination|thermostatic bath|thermostat.*bath/.test(hay)) return 'Bath Mixer';
  if(/shower mixer|thermostatic shower|thermostat|thermostatic|smartcontrol/.test(hay)) return 'Shower Mixer';
  if(/bidet mixer/.test(hay)) return 'Bidet Mixer';
  if(/basin mixer|wash basin mixer|washbasin mixer|basin faucet/.test(hay)) return 'Basin Mixer';
  const relationOnly=/without concealed body|final installation for|requires rough in|requires rough-in|to be ordered separately/.test(hay);
  if(!relationOnly && /rough in|rough-in|concealed body|rapido smartbox/.test(hay)) return 'Concealed / Rough-in';
  if(/bath spout|cascade spout/.test(hay)) return 'Bath Spout';
  if(/waste set|pop-up|pop up|inlet combination|talento|talentofill/.test(hay)) return 'Waste / Bath Set';
  if(/bath mixer|bath combination/.test(hay)) return 'Bath Mixer';
  if(/bidet mixer/.test(hay)) return 'Bidet Mixer';
  if(/basin mixer|wash basin mixer|washbasin mixer/.test(hay)) return 'Basin Mixer';
  if(/electronic|infra red|infrared|touchless/.test(hay) && page>=392 && page<=417) return 'Electronic / Special Faucet';
  if(/self closing|self-closing|care|health/.test(hay) && /mixer|tap|faucet/.test(hay)) return 'Electronic / Special Faucet';
  if(/angle valve/.test(hay)) return 'Angle Valve';
  if(/safety system/.test(hay)) return 'Safety System';
  if(/holder|hook|towel|soap|glass|toilet paper|brush set|accessor/.test(hay)) return 'Accessory';
  if(legacyChapter===117) return 'Spare Part';
  if(legacyChapter>=38&&legacyChapter<=40) return 'Concealed / Rough-in';
  if(legacyChapter>=97&&legacyChapter<=103) return 'Installation System';
  if(legacyChapter>=104&&legacyChapter<=109) return 'Flushing System';
  if(legacyChapter>=110&&legacyChapter<=113) return 'Flush Plate / Actuation';
  if(legacyChapter>=114&&legacyChapter<=116) return 'Connections / Security';
  if(existing && existing!=='Other') return existing;
  return 'Other catalogue item';
}

function inferArea(p, category){
  const source=String(p.source||''); const page=Number(p.sourcePage)||0; const hay=normalizeText([p.description,p.fullText,p.family,category].join(' '));
  if(source==='GROHE Catalogue 2017/2018'){
    const chapter=parseInt(String(p.sourcePage||'').match(/\d{2,3}/)?.[0]||'0',10);
    if(chapter>=2&&chapter<=28) return 'Bathroom';
    if(chapter>=29&&chapter<=37) return 'Bathroom — Thermostats';
    if(chapter>=38&&chapter<=40) return 'Installation / Concealed';
    if(chapter>=41&&chapter<=61) return 'Showers';
    if(chapter>=62&&chapter<=81) return 'Kitchen';
    if(chapter>=82&&chapter<=95) return 'Special faucets';
    if(chapter===96) return 'Toilet & flushing';
    if(chapter>=97&&chapter<=103) return 'Installation systems';
    if(chapter>=104&&chapter<=113) return 'Toilet & flushing';
    if(chapter>=114&&chapter<=116) return 'Connections & security';
    if(chapter===117) return 'Spare parts';
  }
  if(source===MAIN_CATALOGUE_SOURCE){
    if(page>=14&&page<=111) return 'GROHE SPA';
    if(page>=112&&page<=247) return page>=224?'Bathroom — Thermostats':'Bathroom';
    if(page>=248&&page<=253) return 'Installation / Concealed';
    if(page>=254&&page<=331) return 'Showers';
    if(page>=332&&page<=391) return 'Kitchen';
    if(page>=392&&page<=417) return 'Special faucets';
    if(page>=418&&page<=443) return /ceramic/.test(hay)?'Ceramics':'Toilet';
    if(page>=444&&page<=461) return 'Installation systems';
    if(page>=462&&page<=487) return 'Toilet & flushing';
    if(page>=488&&page<=490) return 'Connections & security';
  }
  if(/kitchen|sink mixer|water system|blue |red /.test(hay)) return 'Kitchen';
  if(/flush plate|cistern|urinal|sensia|toilet/.test(hay)) return 'Toilet & flushing';
  if(/ceramic/.test(hay)) return 'Ceramics';
  if(/spa|aqua tile|rainshower aqua/.test(hay)) return 'GROHE SPA';
  if(/head shower|hand shower|handshower|shower system|shower rail|trigger spray|body spray|shower hose/.test(hay)) return 'Showers';
  if(/rapid sl|rapid slx|uniset|rough in|rough-in|concealed body|smartbox|installation/.test(hay)) return 'Installation systems';
  if(/electronic|self closing|special/.test(hay)) return 'Special faucets';
  if(/angle valve|safety system/.test(hay)) return 'Connections & security';
  return 'Bathroom';
}

function toast(message, timeout=2200){
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(()=>el.classList.remove('show'), timeout);
}

function openDb(){
  return window.GROHEStorage.open(DB_NAME,DB_VERSION,[
    {name:STORE_PRODUCTS,options:{keyPath:'sku'}},
    {name:STORE_PROJECTS,options:{keyPath:'id'}},
    {name:STORE_META,options:{keyPath:'key'}},
    {name:STORE_HANDLES,options:{keyPath:'key'}},
    {name:STORE_CHANGES,options:{keyPath:'id'}}
  ]);
}
function idbGetAll(store){ return window.GROHEStorage.getAll(state.db,store); }
function idbGet(store,key){ return window.GROHEStorage.get(state.db,store,key); }
function idbPut(store,value){ return window.GROHEStorage.put(state.db,store,value); }
function idbDelete(store,key){ return window.GROHEStorage.remove(state.db,store,key); }
function idbClear(store){ return window.GROHEStorage.clear(state.db,store); }

async function getMeta(key, fallback=null){
  const row=await idbGet(STORE_META,key);
  return row?.value ?? fallback;
}
async function setMeta(key,value){ return idbPut(STORE_META,{key,value}); }
async function loadAppMemory(){
  const [favorites,recentProducts,recentSearches,templates,rules,prefs,runtimeErrors,hiddenSkus]=await Promise.all([
    getMeta('favorites',[]),getMeta('recentProducts',[]),getMeta('recentSearches',[]),getMeta('templates',[]),getMeta('compatRules',[]),getMeta('preferences',{}),getMeta('runtimeErrors',[]),getMeta('hiddenSkus',[])
  ]);
  state.favorites=new Set((favorites||[]).map(normalizeSku));
  state.hiddenSkus=new Set((hiddenSkus||[]).map(normalizeSku).filter(Boolean));
  state.recentProducts=(recentProducts||[]).map(normalizeSku).filter(Boolean).slice(0,40);
  state.recentSearches=(recentSearches||[]).filter(Boolean).slice(0,20);
  state.templates=Array.isArray(templates)?templates:[];
  state.compatRules=Array.isArray(rules)?rules:[];
  state.preferences=prefs&&typeof prefs==='object'?prefs:{};
  state.includeCeramics=state.preferences.includeCeramics===true;
  state.includePruned=state.preferences.includePruned===true;
  state.selectionView={...state.selectionView,...(state.preferences.selectionView||{})};
  state.catalogueView={...state.catalogueView,...(state.preferences.catalogueView||{})};
  state.catalogSidebarWidth=Number(state.preferences.catalogSidebarWidth)||260;
  state.selectionPanelWidth=Number(state.preferences.selectionPanelWidth)||390;
  state.uiDensity=String(state.preferences.uiDensity||'comfortable');
  state.runtimeErrors=Array.isArray(runtimeErrors)?runtimeErrors:[];
  // v14 appearance migration: reset only appearance defaults for the new simplified layout.
  if(state.preferences.appearanceVersion!=='17.1'){
    state.preferences.fontSize=115;
    state.preferences.thumbnailSize=136;
    state.preferences.productColumns=4;
    if(typeof state.preferences.includeCeramics!=='boolean') state.preferences.includeCeramics=false;
    if(typeof state.preferences.includePruned!=='boolean') state.preferences.includePruned=false;
    state.preferences.catalogSidebarWidth=260;
    state.preferences.selectionPanelWidth=400;
    state.preferences.uiDensity='comfortable';
    state.preferences.appearanceVersion='17.1';
    setMeta('preferences',state.preferences).catch(()=>{});
  }
  // v18.4.3 — enlarge catalogue imagery once for existing installations that
  // still use the previous 60–112 px thumbnail range. Preserve any already-
  // larger custom value so user choices are not reduced.
  if(state.preferences.catalogueImageVersion!=='18.4.3'){
    const previousThumb=Number(state.preferences.thumbnailSize);
    if(!Number.isFinite(previousThumb) || previousThumb<=112) state.preferences.thumbnailSize=136;
    state.preferences.catalogueImageVersion='18.4.3';
    setMeta('preferences',state.preferences).catch(()=>{});
  }
  // v18.4.6 — replace the old 150% global font multiplier. It made any
  // unstyled text inherit a very large body size and caused issue popovers to
  // overwhelm the workspace. Preserve deliberate custom sizes below 140%.
  if(state.preferences.typographyVersion!=='18.4.6'){
    const previousFont=Number(state.preferences.fontSize);
    if(!Number.isFinite(previousFont) || previousFont>=145) state.preferences.fontSize=115;
    state.preferences.typographyVersion='18.4.6';
    setMeta('preferences',state.preferences).catch(()=>{});
  }
  if(state.preferences.selectorShare) document.documentElement.style.setProperty('--selector-share-memory',state.preferences.selectorShare);
}
async function persistFavorites(){ await setMeta('favorites',[...state.favorites]); }
async function rememberRecentProduct(sku){
  const key=normalizeSku(sku); if(!key) return;
  state.recentProducts=[key,...state.recentProducts.filter(x=>x!==key)].slice(0,40);
  await setMeta('recentProducts',state.recentProducts);
}
let recentSearchTimer=null;
function rememberSearch(query){
  clearTimeout(recentSearchTimer);
  recentSearchTimer=setTimeout(async()=>{
    const q=String(query||'').trim(); if(q.length<2) return;
    state.recentSearches=[q,...state.recentSearches.filter(x=>normalizeText(x)!==normalizeText(q))].slice(0,20);
    await setMeta('recentSearches',state.recentSearches);
  },700);
}
async function savePreferences(){ await setMeta('preferences',state.preferences||{}); }


async function logDbChange(action, sku='', details=''){
  try{
    await idbPut(STORE_CHANGES,{id:uid(),timestamp:new Date().toISOString(),action:String(action),sku:normalizeSku(sku),details:String(details||'')});
  }catch(err){ console.warn('Could not save database history',err); }
}

function seedProductBySku(sku){
  const key=normalizeSku(sku);
  const raw=(window.SEED_PRODUCTS||[]).find(x=>normalizeSku(x.sku)===key);
  return raw?normalizeProduct(raw):null;
}

function applyConcealedBodyRules(product, raw={}){
  if(!product || !product.sku) return product;
  const sku=product.sku;
  const hay=normalizeText([product.description,product.fullText,product.family,product.category].join(' '));
  const explicitText=[product.description,product.fullText].join('\n');
  const rawBodyValue=Array.isArray(raw.requiredBodies)?raw.requiredBodies.join(''):String(raw.requiredBodies||raw.requiredBody||'').trim();
  const rawBodies=Array.isArray(raw.requiredBodies)?raw.requiredBodies.map(normalizeSku):String(raw.requiredBodies||raw.requiredBody||'').split(/[;,|]/).map(normalizeSku).filter(Boolean);
  const isDedicatedFourFive=/\b(?:4|5)[ -]?(?:way|port)\s+diverter|diverter[^|]{0,18}\b(?:4|5)[ -]?(?:way|port)/.test(hay);
  const isCurrentSmartBoxDiverter=/\b(?:2|3)[ -]?way diverter/.test(hay) && /rapido smartbox|35 604|35 600/.test(hay);
  const hasWrongLegacyBody=rawBodies.some(x=>['33963000','33963001','33964000','33964001'].includes(x));
  // Faceplates/actuators never have an inspection shaft as an automatic required body,
  // even when a stale local/custom mapping from an older build exists.
  if(isWcActuationProduct(product)){ product.requiredBodies=[]; return product; }

  // v15.19: verified system relationships must survive old IndexedDB/custom records.
  // Earlier builds could persist a single/obsolete body in a custom override; because
  // the browser database survives upgrades, returning here made the corrected seed rule
  // invisible to the user. Keep genuine manual mappings authoritative, but always
  // re-normalize relationships that GROHE defines at system level.
  const smartControlFinalTrim=/smartcontrol/.test(hay) && /final installation for.*rapido smartbox|final installation.*35 604/.test(hay) && !/extension set/.test(hay);
  const smartBoxControlEvidence=(
    (rawBodies.some(x=>['35604000','35600000'].includes(x)) || /rapido smartbox|35 604|35 600/.test(hay) ||
      (/^24/.test(sku) && /concealed|trimset|trim set|final installation/.test(hay))) &&
    (product.category==='Shower Mixer' || product.category==='Bath Mixer' || smartControlFinalTrim ||
      (product.category==='Accessory' && /single lever|single-lever|mixer|diverter|thermostat|smartcontrol|trimset|trim set/.test(hay)))
  );
  if(/^2914[4-9]/.test(sku) && smartControlFinalTrim){ product.category='Shower Mixer'; product.categoryConfidence='High'; product.categoryReason='SmartControl final-installation control trim requiring Rapido SmartBox'; }
  const verifiedSpecialRelationship=smartBoxControlEvidence || /^19334/.test(sku) || /^10177[78]/.test(sku) || /^26254/.test(sku) ||
    ['36273000','36334SD0','36315000','36376000','36442000','36447000','36321000','36463000'].includes(sku);
  // Manual overrides remain authoritative except for verified system relationships and
  // known incompatible mappings that older builds could save.
  if(raw.custom && rawBodyValue && !verifiedSpecialRelationship && !(hasWrongLegacyBody && (isDedicatedFourFive||isCurrentSmartBoxDiverter))) return product;

  let bodies=(product.requiredBodies||[]).map(normalizeSku).filter(Boolean);
  const storedBodies=[...bodies];
  const uniq=arr=>[...new Set(arr.map(normalizeSku).filter(Boolean))];
  const setBodies=arr=>{ product.requiredBodies=uniq(arr).filter(x=>x!==sku); return product; };

  // WC faceplates / actuators may mention an inspection shaft for some installation
  // systems. The shaft is contextual and user-selected, never a required auto-child.
  if(isWcActuationProduct(product)) return setBodies([]);

  // 1) Catalogue-driven extraction. Look around relationship phrases rather than
  // relying only on prefixes. This catches wall-mounted basin mixers, diverters,
  // shower trims and head showers whenever the catalogue names the rough-in/body.
  const lines=explicitText.split(/\n|\|/).map(x=>x.trim()).filter(Boolean);
  const extracted=[];
  const relation=/final installation for|set for final installation for|fits for concealed|requires rough(?:ing)?[- ]?in|rough(?:ing)?[- ]?in (?:box|set)|concealed body.*(?:for|ref)|for concealed valve(?:s)?|concealed (?:fitting|installation|mounting) box|to be ordered separately/i;
  const longSku=/\b(\d{2,3})\s?(\d{3})\s?([A-Z0-9]{3,4})\b/g;
  const shortSku=/\b(\d{2})\s(\d{3})\b/g;
  for(let i=0;i<lines.length;i++){
    const controlledForUse=/for use with/i.test(lines[i]) && /rough(?:ing)?[- ]?in|concealed|rapido|mounting box|fitting box|installation box|concealed valve/.test(lines[i]);
    if(!relation.test(lines[i]) && !controlledForUse) continue;
    // Keep the relationship window tight. If the trigger line has no article
    // number, accept up to two following lines only when they START with an SKU.
    // This avoids treating included hand showers/spouts later in a product record
    // as concealed bodies.
    let block=lines[i];
    const hasCodeHere=/\b\d{2,3}\s?\d{3}(?:\s?[A-Z0-9]{3,4})?\b/.test(block);
    if(!hasCodeHere){
      for(let j=i+1;j<=Math.min(i+2,lines.length-1);j++){
        if(/^\d{2,3}\s?\d{3}(?:\s?[A-Z0-9]{3,4})?\b/.test(lines[j])) block+=' '+lines[j];
        else break;
      }
    }
    let m;
    longSku.lastIndex=0;
    while((m=longSku.exec(block))) { if(/\d/.test(m[3])) extracted.push(m[1]+m[2]+m[3]); }
    shortSku.lastIndex=0;
    while((m=shortSku.exec(block))) extracted.push(m[1]+m[2]+'000');
  }
  bodies=uniq([...bodies,...extracted.filter(x=>x!==sku)]);

  // Dedicated 4/5-way diverters are NOT bath/shower mixer trimsets. They use their
  // own diverter concealed bodies. This rule runs before the generic 19-series logic
  // so they can never fall through to 33 963/33 964.
  if(isDedicatedFourFive && !['29033000','29707000','29708000'].includes(sku)){
    const storedDedicated=storedBodies.filter(x=>['29033000','29707000','29708000'].includes(x));
    if(storedDedicated.length) return setBodies(storedDedicated);
    const explicitDedicated=bodies.filter(x=>['29033000','29707000','29708000'].includes(x));
    if(explicitDedicated.length) return setBodies(explicitDedicated);
    if(/^19133/.test(sku) || /4 port diverter|4-port diverter|4 way diverter|4-way diverter/.test(hay)) return setBodies(['29707000']);
    if(/^19134/.test(sku) || /5 port diverter|5-port diverter/.test(hay) || /grandera|eurosmart/.test(hay)) return setBodies(['29708000']);
    return setBodies(['29033000']);
  }

  // 3/4/5-hole bath and bath/shower combinations require the installation baseframe
  // stated by the official catalogue. The seed catalogue now stores this explicitly
  // across all current families, but keep a runtime fallback for imported/custom SKUs.
  const multiHoleBath=product.category==='Bath Mixer' && /\b(?:3|4|5)[ -]?(?:hole|h)\b/.test(hay);
  if(multiHoleBath){
    const storedMulti=storedBodies.filter(x=>['29037000','29037002','33339000'].includes(x));
    if(storedMulti.length) return setBodies(storedMulti);
    const explicitMulti=bodies.filter(x=>['29037000','29037002','33339000'].includes(x));
    if(explicitMulti.length) return setBodies(explicitMulti);
    if(/29\s*037\s*002|29037002/i.test(explicitText)) return setBodies(['29037002']);
    if(/29\s*037(?:\s*000)?|29037000/i.test(explicitText)) return setBodies(['29037000']);
    if(/33\s*339(?:\s*000)?|33339000/i.test(explicitText)) return setBodies(['33339000']);
    const currentMultiSource=/2024|2025|2026|price list|renovation|lookbook/i.test(String(product.source||''));
    const current002Family=/^(allure|atrio|atrio pc|atrio private collection|grohe plus)$/.test(normalizeText(product.family));
    if(currentMultiSource && current002Family) return setBodies(['29037002']);
    return setBodies(['29037000']);
  }

  // Floor-mounted / freestanding bath mixers have exactly two allowed concealed bodies.
  // This is intentionally strict: imported or older database relationships must not add any third option.
  const floorMountedBath=/floor mounted|floor-mounted|freestanding|free standing|floorstanding/.test(hay) && /bath mixer|single lever bath|two handle bath|bath\/shower/.test(hay);
  if(floorMountedBath) return setBodies(['29086000','45984001']);

  // 2) Known current wall-mounted two-hole basin families. A few catalogue records
  // are truncated directly after "final installation for", so there is no code left
  // for the parser to read. These are the current universal rough-in alternatives.
  const twoHoleWallBasin=/2 hole basin mixer|2-hole basin mixer|trimset basin 2 h wall|trim basin 2 h/.test(hay) && /wall mounted|wall mtd|wall/.test(hay);
  if(twoHoleWallBasin && /without concealed body|final installation|trimset|trim set/.test(hay)){
    const currentSource=/2024|2025|2026|renovation|lookbook|current/i.test(String(product.source||''));
    const currentUniversal=/lineare|eurosmart|eurostyle|eurocosmo|euroeco|concetto|essence/.test(hay) || /^2933[78]/.test(sku) || /^2919[23]/.test(sku) || /^23444/.test(sku) || /^19381/.test(sku);
    // Current GROHE wall-mounted 2-hole mixers commonly accept either the universal
    // concealed body 23 571 or 32 635. Keep both visible in the dropdown even when
    // a parsed catalogue row only retained one of them.
    if(currentUniversal && (currentSource || /^2933[78]|^2919[23]|^23444/.test(sku))) return setBodies([...bodies,'23571000','32635000']);
    if(bodies.length) return setBodies(bodies);
    if(currentUniversal) return setBodies(['23571000']);
    // Fallbacks for families whose catalogues specify a different body.
    if(/allure brilliant/.test(hay)) return setBodies(['23200002']);
    if(/grandera/.test(hay)) return setBodies(['23319000']);
    if(/eurocube joy/.test(hay)) return setBodies(['23429000']);
    if(/eurocube/.test(hay)) return setBodies(['23200002']);
    if(/veris/.test(hay)) return setBodies(['32635000']);
    if(/allure/.test(hay)) return setBodies(['33769000']);
  }

  // 3) Rainshower SmartActive 310 head shower SETS. These final-installation sets
  // require one of two Rainshower universal rough-ins. The finish does not change it.
  if(/^(26475|26477|26479|26481)/.test(sku) || /^(22123|22124)/.test(sku)){
    return setBodies(['26483000','26484000']);
  }
  if(/rainshower smartactive 310/.test(hay) && /head shower set|headshower set/.test(hay) && /2 spray/.test(hay)){
    return setBodies(['26483000','26484000']);
  }

  // 4) Rainshower Aqua / Aqua Tiles. Keep the alternatives as a dropdown so the
  // user can choose unrestricted vs Water Saving/ECO rough-ins where GROHE offers both.
  if(/rainshower aqua|rsh aqua/.test(hay) || /^(1049|10705|2673|2678|26887)/.test(sku)){
    // Aqua Tiles wall head showers and shower union.
    if(/^10705[56]/.test(sku)) return setBodies(['1070570000','1070580000']);
    if(/^107059/.test(sku)) return setBodies(['1070620000']);
    // Aqua Tiles ceiling covers: unrestricted and ECO rough-in alternatives.
    if(/^104986/.test(sku)) return setBodies(['1049779990','1049789990']);
    if(/^104987/.test(sku)) return setBodies(['1049799990','1049809990']);
    if(/^104988/.test(sku)) return setBodies(['1049839990','1049859990']);
    if(/^10499[234]/.test(sku)) return setBodies(['1049819990','1049829990']);
    // Classic Rainshower Aqua ceiling covers 1/2/3 holes all require 26 739.
    if(/^(26734|26735|26737|26784|26785|26786)/.test(sku)) return setBodies(['26739000']);
    // Rainshower Aqua 15 inch 3-spray head shower requires 26 855.
    if(/^26887/.test(sku)) return setBodies(['26855000']);
  }

  // Grohtherm Aqua Tiles control trimsets.
  if(/^106866/.test(sku)) return setBodies(['1068690000']);
  if(/^106867/.test(sku)) return setBodies(['1068810000']);
  if(/^106868/.test(sku)) return setBodies(['1068820000']);

  // 5) Rapido SmartBox control trims. Older v15.x builds intentionally kept
  // both universal SmartBox generations selectable: 35 604 is the current
  // preferred body, while 35 600 remains a compatible older-stock alternative.
  // Apply this to actual user-facing bath/shower controls whenever the catalogue
  // already maps the trim to either SmartBox or explicitly names Rapido SmartBox.
  // Do not apply it to rough-ins, extension sets, shower systems or unrelated parts.
  const smartBoxMapped=bodies.some(x=>['35604000','35600000'].includes(x)) || /rapido smartbox|35 604|35 600/.test(hay);
  const smartBoxControl=product.category==='Shower Mixer' || product.category==='Bath Mixer' ||
    (product.category==='Accessory' && /single lever|single-lever|mixer|diverter|thermostat|smartcontrol|trimset|trim set/.test(hay));
  if(smartBoxMapped && smartBoxControl){
    return setBodies(['35604000','35600000']);
  }

  // Some abbreviated collection/price-list rows do not retain the words
  // "Rapido SmartBox" even though the family member is the same 3-way SmartBox trim.
  if(sku==='24092DC1') return setBodies(['35604000','35600000']);

  // 24-series concealed shower/bath controls use Rapido SmartBox. Current
  // catalogue records use 35 604; retain 35 600 as an alternative for older stock.
  if(/^24/.test(sku) && /shower mixer|bath mixer|mixer with [23] way diverter|mixer with [23]-way diverter|trimset|trim set|final installation/.test(hay) && /concealed|final installation|smartbox|trimset|trim set/.test(hay)){
    return setBodies(['35604000','35600000']);
  }

  // Verified special relationships that do not follow the generic mixer prefix rules.
  if(/^101777/.test(sku) || /^101778/.test(sku)) return setBodies(['35604000','35600000']);
  if(/^19334/.test(sku)) return setBodies(['35028000','29032000']);
  if(/^29306/.test(sku) && /2 hole basin|2-hole basin|trimset basin 2/.test(hay)) return setBodies(['23200000']);
  if(/^26254/.test(sku)) return setBodies(['26264000']);
  if(sku==='36273000' || sku==='36334SD0') return setBodies(['36336001','36337001']);
  if(sku==='36315000' || sku==='36376000') return setBodies(['36339001']);
  if(sku==='36442000' || sku==='36447000') return setBodies(['38748002','36264001']);
  if(sku==='36321000') return setBodies(['36322000']);
  if(sku==='36463000') return setBodies(['36416000','36464000']);

  // 6) 19-series single-lever trimsets. Bath/diverter trims use 33 963 000/001;
  // shower-only trims use 33 964 000/001. Explicit catalogue relationships always win.
  if(/^19/.test(sku)){
    const smartBoxExplicit=bodies.some(x=>['35604000','35600000'].includes(x)) || /rapido smartbox|35 604|35 600/.test(hay);
    // Current SPA and other current-generation diverters that explicitly name Rapido
    // SmartBox must never inherit the legacy 33 963/33 964 body family.
    if(smartBoxExplicit) return setBodies(['35604000','35600000']);
    const modernExplicit=bodies.some(x=>['35501000','35500000'].includes(x)) || /rapido e|rapido t|rapido c|35 501|35 500/.test(hay);
    const thermostat=/\bthm\b|thermostat|thermostatic|safety mixer|smartcontrol|volume control|concealed valve|rapido t/.test(hay);
    // Thermostatic / SmartControl trims should keep their explicit modern rough-in.
    // Legacy single-lever 19-series trims are handled below so old/new body choices
    // remain selectable even when the catalogue also mentions Rapido E.
    if(modernExplicit && bodies.length && thermostat) return setBodies(bodies);
    const legacySingleLever=/trimset|trim set|concealed shower|concealed bath|final installation|ohm/.test(hay) && /single lever|single-lever|ohm|shower|bath/.test(hay);
    const excludedMultiHole=/basin|3 hole|3-hole|4 hole|4-hole|5 hole|5-hole|3 h|3-h|4 h|4-h|5 h|5-h|combination|deck mounted/.test(hay);
    if(!thermostat && legacySingleLever && !excludedMultiHole){
      const withDiverter=/diverter|bath mixer|bath trim|bath conc|bath\/shower|trimset bath/.test(hay);
      const showerOnly=/shower mixer|shower trim|trimset shower|shw|shower conc/.test(hay);
      if(withDiverter){
        const other=bodies.filter(x=>!['33963000','33963001','33964000','33964001'].includes(x));
        return setBodies(['33963001','33963000',...other]);
      }
      if(showerOnly){
        const other=bodies.filter(x=>!['33963000','33963001','33964000','33964001'].includes(x));
        return setBodies(['33964001','33964000',...other]);
      }
    }
  }

  if(bodies.length) return setBodies(bodies);
  return product;
}

// v15.11 compatibility safety layer. Catalogue terminology distinguishes
// final-installation/concealed products from complete exposed/deck-mounted mixers.
// This guard prevents broad local rules or stale saved mappings from attaching a
// concealed body to a fixture that is already complete as supplied.
const BASIN_BODY_STEMS=['23571','32635','23200','23319','23429','33769','29025','32706'];
const SHOWER_CONTROL_BODY_STEMS=['33963','33964','35600','35604','35500','35501','29032','35028'];
const BATH_BASE_STEMS=['29037','33339','29086','45984'];
const DIVERTER_BODY_STEMS=['29033','29707','29708'];
function bodyHasStem(sku,stems){const key=normalizeSku(sku);return stems.some(stem=>key.startsWith(stem));}
function rawRequiredBodies(raw={}){
  return (Array.isArray(raw.requiredBodies)?raw.requiredBodies:String(raw.requiredBodies||raw.requiredBody||'').split(/[;,|]/))
    .map(normalizeSku).filter(Boolean);
}
function hasExplicitRequiredComponentSignal(product){
  const h=normalizeText([product?.description,product?.fullText,product?.mounting,product?.function].join(' '));
  return /final installation for|set for final installation for|without concealed body|without roughing in|without roughing-in|requires rough(?:ing)? in|requires rough(?:ing)?-in|rough(?:ing)? in required|rough(?:ing)?-in required|trimset|trim set|concealed installation|for concealed installation|for concealed valve|concealed fitting box|concealed installation box|concealed mounting box|for use with .*rough(?:ing)?[- ]?in|rapido smartbox/.test(h);
}
function isClearlyCompleteExposedFixture(product){
  if(!product)return false;
  const cat=normalizeText(product.category||''), h=normalizeText([product.description,product.fullText,product.mounting,product.function].join(' '));
  const explicit=hasExplicitRequiredComponentSignal(product);
  if(explicit)return false;
  if(cat==='basin mixer'){
    // GROHE deck/single-hole mixers are complete products. Flexible hoses and
    // rapid/FastFixation installation are strong catalogue signals for this class.
    if(/single hole installation|single-hole installation|deck mounted|deck-mounted|for free standing basins|for free-standing basins/.test(h)) return true;
    if(/flexible connection hoses/.test(h) && !/wall mounted|wall-mounted/.test(h)) return true;
  }
  if(cat==='shower mixer'||cat==='bath mixer'){
    // Exposed wall mixers use unions/S-unions and do not take a concealed body.
    if(/\bexposed\b/.test(h) && !/exposed part/.test(h)) return true;
    if(/covered s unions|covered s-unions|s unions|s-unions/.test(h)) return true;
    if(/\b(?:shower|bath)\s+exp\b|\bexp(?:osed)?\s+(?:shower|bath)\b/.test(h)) return true;
  }
  return false;
}
function sanitizeRequiredComponentMapping(product,raw={}){
  if(!product?.sku)return product;
  const cat=normalizeText(product.category||'');
  const original=rawRequiredBodies(raw);
  let bodies=[...new Set((product.requiredBodies||[]).map(normalizeSku).filter(Boolean))];
  const explicit=hasExplicitRequiredComponentSignal(product);
  const h=normalizeText([product.description,product.fullText,product.mounting,product.function,product.family].join(' '));

  // Never allow a body family from a different fixture system to leak across
  // categories through a keyword/prefix compatibility rule.
  if(cat==='basin mixer'){
    bodies=bodies.filter(x=>!bodyHasStem(x,[...SHOWER_CONTROL_BODY_STEMS,...BATH_BASE_STEMS,...DIVERTER_BODY_STEMS]));
    const wallFinal=/wall mounted|wall-mounted/.test(h) && (/\b(?:2|3)[ -]?hole\b/.test(h)||explicit);
    const sourceMapped=original.some(x=>bodies.includes(x));
    if(isClearlyCompleteExposedFixture(product) || (!wallFinal&&!explicit&&!sourceMapped)) bodies=[];
  }else if(cat==='shower mixer'){
    bodies=bodies.filter(x=>!bodyHasStem(x,[...BASIN_BODY_STEMS,...BATH_BASE_STEMS]));
    const sourceMapped=original.some(x=>bodies.includes(x));
    if(isClearlyCompleteExposedFixture(product) || (!explicit&&!sourceMapped&&!/concealed|smartcontrol|diverter/.test(h))) bodies=[];
  }else if(cat==='bath mixer'){
    bodies=bodies.filter(x=>!bodyHasStem(x,BASIN_BODY_STEMS));
    const multiHole=/\b(?:3|4|5)[ -]?(?:hole|h)\b/.test(h);
    const sourceMapped=original.some(x=>bodies.includes(x));
    if(isClearlyCompleteExposedFixture(product) || (!multiHole&&!explicit&&!sourceMapped&&!/concealed|diverter/.test(h))) bodies=[];
  }
  product.requiredBodies=[...new Set(bodies)].filter(x=>x!==product.sku);
  product.compatibilityReason=product.requiredBodies.length
    ? (explicit?'Catalogue final-installation / concealed relationship':(original.length?'Catalogue/source mapped relationship':'Validated compatibility rule'))
    : '';
  return product;
}

function applyLocalCompatibilityRules(product){
  if(!product?.sku || !state.compatRules?.length) return product;
  const hay=normalizeText([product.sku,product.description,product.family,product.category,product.area,product.keywords].join(' '));
  const current=new Set((product.requiredBodies||[]).map(normalizeSku).filter(Boolean));
  for(const rule of state.compatRules){
    if(rule?.enabled===false) continue;
    if(rule.category && normalizeText(rule.category)!==normalizeText(product.category)) continue;
    const val=String(rule.matchValue||'').trim(); if(!val) continue;
    let match=false;
    if(rule.matchType==='exact') match=product.sku===normalizeSku(val);
    else if(rule.matchType==='prefix') match=product.sku.startsWith(normalizeSku(val));
    else {
      const tokens=normalizeText(val).split(/\s+/).filter(Boolean);
      match=tokens.length>0 && tokens.every(t=>hay.includes(t));
    }
    if(match) String(rule.bodies||'').split(/[;,|]/).map(normalizeSku).filter(Boolean).forEach(x=>current.add(x));
  }
  product.requiredBodies=[...current].filter(x=>x!==product.sku);
  return product;
}

function normalizeProduct(p){
  const category=inferCategory(p);
  const out = {
    sku: normalizeSku(p.sku),
    description: String(p.description||'GROHE product').trim(),
    family: String(p.family||'Universal / Other').trim() || 'Universal / Other',
    category,
    area: String(p.area||'').trim() || inferArea(p,category),
    finish: inferFinish(p),
    finishSkuCode: String(p.finishSkuCode||'').trim(),
    size: inferSize(p),
    mounting: inferMounting(p),
    function: inferFunction(p),
    outlets: inferOutlets(p),
    shape: inferShape(p),
    sprays: String(p.sprays||'').trim(),
    requiredBodies: Array.isArray(p.requiredBodies) ? p.requiredBodies.map(normalizeSku).filter(Boolean) : String(p.requiredBodies||p.requiredBody||'').split(/[;,|]/).map(normalizeSku).filter(Boolean),
    source: String(p.source||'Custom').trim(),
    sourceVersion: String(p.sourceVersion||p.sourceDate||'').trim(),
    sourcePage: p.sourcePage||'',
    status: String(p.status||'Active').trim(),
    replacement: normalizeSku(p.replacement||''),
    fullText: String(p.fullText||p.description||'').trim(),
    compatibilityTag: String(p.compatibilityTag||'').trim(),
    keywords: String(p.keywords||'').trim(),
    custom: !!p.custom,
    categoryConfidence: String(p.categoryConfidence||'').trim(),
    categoryReason: String(p.categoryReason||'').trim(),
    priority: !!p.priority,
    prioritySource: String(p.prioritySource||'').trim(),
    pruned: !!p.pruned || /\bpruned\b/i.test(String(p.status||'')),
    prunedSource: String(p.prunedSource||'').trim()
  };
  return sanitizeRequiredComponentMapping(applyLocalCompatibilityRules(applyConcealedBodyRules(out,p)),p);
}

  // ===== 10_products_compatibility.js =====
async function loadProducts(){
  const map = new Map();
  (window.SEED_PRODUCTS||[]).forEach(p=>{ const n=normalizeProduct(p); if(n.sku) map.set(n.sku,n); });
  const custom = await idbGetAll(STORE_PRODUCTS);
  let deleted=0, overrides=0; const deletedRecords=[];
  custom.forEach(raw=>{
    const sku=normalizeSku(raw.sku||'');
    if(!sku) return;
    if(raw.deleted){ map.delete(sku); deleted++; deletedRecords.push({...raw,sku}); return; }
    const seed=map.get(sku);
    const inheritedPruned=raw.pruned===undefined && !!seed?.pruned;
    const n=normalizeProduct({...raw,custom:true,priority:raw.priority??seed?.priority,prioritySource:raw.prioritySource||seed?.prioritySource||'',pruned:raw.pruned??seed?.pruned,prunedSource:raw.prunedSource||seed?.prunedSource||'',status:inheritedPruned?'Pruned':raw.status});
    n._searchText=''; n._searchCompact='';
    map.set(n.sku,n); overrides++;
  });
  state.customCount = overrides;
  state.deletedCount = deleted;
  state.deletedRecords = deletedRecords;
  state.productMap = map;
  state.products = [...map.values()];
  state.productDataVersion++;
  invalidateSearchCaches();
  state.products.forEach(p=>{p._searchText='';p._searchCompact='';p._searchIndex=null;prepareProductSearchIndex(p);});
  state.searchVocabularyVersion=0; ensureSearchVocabulary();
  hydrateFinishSelects();
  renderDatabaseMetrics();
  renderFilters();
  if($('databaseDialog')?.open) renderDatabaseManager();
}

const INSPECTION_SHAFT_SKUS=new Set(['66791000','40911000','40950000']);
function migrateLegacyInspectionShaftChildren(project){
  if(!project) return false;
  ensureProjectOptions(project);
  let changed=false;
  for(const option of project.options||[]){
    const items=Array.isArray(option.items)?option.items:[];
    const parents=new Map(items.filter(x=>x.type==='product'&&!x.auto).map(x=>[x.id,x]));
    option.items=items.filter(item=>{
      if(item?.type!=='product'||!item.auto||!item.parentItemId||item.componentRole==='inspection-shaft') return true;
      if(!INSPECTION_SHAFT_SKUS.has(normalizeSku(item.sku))) return true;
      const parent=parents.get(item.parentItemId), product=parent?getProduct(parent.sku):null;
      if(product&&isWcActuationProduct(product)){changed=true;return false;}
      return true;
    });
  }
  // Filtering replaces option item arrays, so refresh the active-option alias.
  ensureProjectOptions(project);
  return changed;
}

async function loadProjects(){
  state.projects = (await idbGetAll(STORE_PROJECTS)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  for(const project of state.projects){
    if(migrateLegacyInspectionShaftChildren(project)){
      project.updatedAt=project.updatedAt||new Date().toISOString();
      await idbPut(STORE_PROJECTS,project);
    }
  }
  const last = await idbGet(STORE_META,'lastProjectId');
  if(last?.value){
    const p = state.projects.find(x=>x.id===last.value);
    if(p && !p.archived) state.project = p;
  }
  if(!state.project && state.projects.length) state.project = state.projects.find(p=>!p.archived)||null;
  if(state.project) ensureProjectOptions(state.project);
  renderProject();
}

function hydrateFinishSelects(){
  const finishes = sortUnique([...Object.keys(FINISH_CODES), ...state.products.map(p=>p.finish).filter(f=>RECOGNIZED_FINISHES.has(f))]);
  const options = `<option value="">Mixed / not fixed</option>` + finishes.map(f=>`<option value="${esc(f)}">${esc(f)} (${esc(FINISH_CODES[f]||'')})</option>`).join('');
  $('projectInputFinish').innerHTML = options;
}

function getProduct(sku){ return state.productMap.get(normalizeSku(sku)); }
function finishCode(name){ return FINISH_CODES[name]||''; }
function productFinishCode(p){ return String(p?.finishSkuCode||'').trim() || finishCode(p?.finish); }

function productHaystack(p){
  if(p._searchText) return p._searchText;
  const synonyms=[];
  const fields=[p.sku,p.description,p.family,p.category,p.area,p.finish,productFinishCode(p),p.size,p.mounting,p.function,p.outlets,p.shape,p.status,p.replacement,p.fullText,p.sprays,p.keywords];
  const hayBase=normalizeText(fields.join(' '));
  if(hayBase.includes('hand shower')) synonyms.push('handshower');
  if(hayBase.includes('head shower')) synonyms.push('headshower');
  if(hayBase.includes('flush plate')) synonyms.push('wall plate wallplate actuator plate actuation plate');
  if(hayBase.includes('flushing cistern')) synonyms.push('flush tank flushtank tank');
  if(hayBase.includes('concealed body')||hayBase.includes('rough in')||hayBase.includes('trimset')) synonyms.push('roughin rough-in concealed part concealed trim');
  if(hayBase.includes('toilet paper holder')) synonyms.push('paper holder');
  if(hayBase.includes('basin mixer')) synonyms.push('basin tap washbasin faucet');
  if(hayBase.includes('sink mixer')) synonyms.push('kitchen tap kitchen faucet');
  if(/\bshw\b/.test(hayBase)) synonyms.push('shower');
  if(/\bconc\b/.test(hayBase)) synonyms.push('concealed');
  if(/\bbas\b/.test(hayBase)) synonyms.push('basin washbasin');
  if(/\bohm\b/.test(hayBase)) synonyms.push('single lever single-lever mixer');
  if(/\bthm\b/.test(hayBase)) synonyms.push('thermostat thermostatic');
  if(/\bexp\b/.test(hayBase)) synonyms.push('exposed');
  if(/\bfreest\b/.test(hayBase)) synonyms.push('freestanding free standing floor mounted');
  if(/\b2 h\b/.test(hayBase)||/\b2h\b/.test(hayBase)) synonyms.push('2 hole two hole');
  if(/\b3 h\b/.test(hayBase)||/\b3h\b/.test(hayBase)) synonyms.push('3 hole three hole');
  const finalText=normalizeText(hayBase+' '+synonyms.join(' '));
  p._searchText=finalText;
  p._searchCompact=finalText.replace(/\s+/g,'');
  return finalText;
}

function nearWordMatch(token,p){
  if(token.length<4) return false;
  const words=p._searchWords || (p._searchWords=(p._searchText||productHaystack(p)).split(/\s+/).filter(w=>w.length>=3));
  const maxDist=token.length>=7?2:1;
  for(const word of words){
    if(word.startsWith(token)||token.startsWith(word)) return true;
    if(Math.abs(word.length-token.length)>maxDist) continue;
    let prev=Array.from({length:token.length+1},(_,i)=>i);
    for(let i=1;i<=word.length;i++){
      const cur=[i]; let rowMin=i;
      for(let j=1;j<=token.length;j++){
        const v=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(word[i-1]===token[j-1]?0:1));
        cur[j]=v; if(v<rowMin) rowMin=v;
      }
      prev=cur; if(rowMin>maxDist && i>token.length+maxDist) break;
    }
    if(prev[token.length]<=maxDist) return true;
  }
  return false;
}

function normalizeSearchQuery(raw=''){
  return normalizeText(raw)
    .replace(/\bpop\s+up\b/g,'popup')
    .replace(/\b([1-5])\s*[- ]?way\b/g,'$1way')
    .replace(/\b([1-5])\s*[- ]?outlets?\b/g,'$1outlet')
    .replace(/\brough\s*[- ]?in\b/g,'roughin')
    .replace(/\bwall\s*plate\b/g,'wallplate')
    .replace(/\bflush\s*tank\b/g,'flushtank')
    .replace(/\bhand\s*shower\b/g,'handshower')
    .replace(/\bhead\s*shower\b/g,'headshower')
    .replace(/\brain\s*shower\b/g,'rainshower')
    .replace(/\bwall\s*mount(?:ed)?\b/g,'wallmounted')
    .replace(/\bdeck\s*mount(?:ed)?\b/g,'deckmount')
    .replace(/\bfloor\s*mount(?:ed)?\b/g,'floormount')
    .replace(/\bceiling\s*mount(?:ed)?\b/g,'ceilingmount')
    .replace(/\bbottle\s*trap\b/g,'bottletrap')
    .replace(/\bangle\s*valve\b/g,'anglevalve');
}

const PRODUCT_SEARCH_INTENTS = [
  {id:'popup',rx:/\b(?:popup|waste set|waste system|bath waste)\b/,cats:['Waste / Bath Set'],strict:true},
  {id:'basin-mixer',rx:/\b(?:basin|washbasin)\s+(?:mixer|tap|faucet)\b/,cats:['Basin Mixer'],strict:true},
  {id:'bidet-mixer',rx:/\bbidet\s+(?:mixer|tap|faucet)\b/,cats:['Bidet Mixer'],strict:true},
  {id:'shower-mixer',rx:/\bshower\s+(?:mixer|control|thermostat|thermostatic)\b/,cats:['Shower Mixer'],strict:true},
  {id:'bath-mixer',rx:/\bbath\s+(?:mixer|control)\b/,cats:['Bath Mixer'],strict:true},
  {id:'bath-spout',rx:/\bbath\s+(?:spout|filler)\b/,cats:['Bath Spout'],strict:true},
  {id:'head-shower',rx:/\bheadshower\b/,cats:['Head Shower'],strict:true},
  {id:'hand-shower',rx:/\bhandshower\b/,cats:['Hand Shower','Shower Set / Rail'],strict:true},
  {id:'shower-system',rx:/\bshower\s+system\b/,cats:['Shower System'],strict:true},
  {id:'shower-rail',rx:/\b(?:shower\s+rail|rail\s+set|shower\s+set)\b/,cats:['Shower Set / Rail'],strict:true},
  {id:'shower-hose',rx:/\bshower\s+hose\b/,cats:['Shower Hose'],strict:true},
  {id:'trigger-spray',rx:/\btrigger\s+spray\b/,cats:['Trigger Spray'],strict:true},
  {id:'body-spray',rx:/\bbody\s+spray\b/,cats:['Body Spray'],strict:true},
  {id:'roughin',rx:/\b(?:concealed body|concealed part|roughin|smartbox)\b/,cats:['Concealed / Rough-in'],strict:true},
  {id:'flush-plate',rx:/\b(?:flush plate|wallplate|actuation plate|actuator plate)\b/,cats:['Flush Plate / Actuation'],strict:true},
  {id:'kitchen-mixer',rx:/\b(?:kitchen|sink)\s+(?:mixer|tap|faucet)\b/,cats:['Kitchen Mixer'],strict:true}
];

function prepareProductSearchIndex(p){
  if(p._searchIndex) return p._searchIndex;
  const rawIdentity=[p.description,p.family,p.size].filter(Boolean).join(' ');
  const rawTechnical=String(p.fullText||'');
  const dimensionHits=new Set();
  const collectDimensions=(text,strict=false)=>{
    const src=String(text||'');
    const patterns=strict
      ? [/\b(?:diameter|dia\.?|ø|size)\s*[:=-]?\s*(\d{2,4})\b/gi,/\b(\d{2,4})\s*(?:mm|millimet(?:er|re)s?|[- ]?size)\b/gi]
      : [/\b(\d{2,4})\b/g];
    for(const rx of patterns){let m;while((m=rx.exec(src)))dimensionHits.add(m[1]);}
  };
  collectDimensions(rawIdentity,false); collectDimensions(rawTechnical,true);
  const idx={sku:normalizeText(p.sku),desc:normalizeText(p.description),family:normalizeText(p.family),category:normalizeText(p.category),area:normalizeText(p.area),finish:normalizeText(p.finish),finishCode:normalizeText(productFinishCode(p)),size:normalizeText(p.size),dimensions:[...dimensionHits].join(' '),mounting:normalizeText(p.mounting),function:normalizeText(p.function),outlets:normalizeText(p.outlets),shape:normalizeText(p.shape),status:normalizeText(p.status),replacement:normalizeText(p.replacement),sprays:normalizeText(p.sprays),keywords:normalizeText(p.keywords),secondary:normalizeText(p.fullText||'')};
  idx.primary=normalizeText([idx.sku,idx.desc,idx.family,idx.category,idx.area,idx.finish,idx.finishCode,idx.size,idx.dimensions,idx.mounting,idx.function,idx.outlets,idx.shape,idx.status,idx.replacement,idx.sprays,idx.keywords].join(' '));
  idx.compact=idx.primary.replace(/\s+/g,'');
  p._searchIndex=idx;
  return idx;
}
function ensureSearchVocabulary(){
  if(state.searchVocabularyVersion===state.productDataVersion && state.searchVocabulary.size) return state.searchVocabulary;
  const vocab=new Set(Object.keys(SEARCH_ALIASES).map(normalizeText));
  for(const targets of Object.values(SEARCH_ALIASES)) for(const target of targets) normalizeText(target).split(/\s+/).forEach(w=>w&&vocab.add(w));
  for(const p of state.products){
    const idx=prepareProductSearchIndex(p);
    [idx.family,idx.category,idx.finish,idx.function,idx.mounting,idx.area,idx.size,idx.shape,idx.desc,idx.keywords].join(' ').split(/\s+/).forEach(w=>w&&w.length>=2&&vocab.add(w));
  }
  state.searchVocabulary=vocab;
  state.searchVocabularyVersion=state.productDataVersion;
  state.searchCorrectionCache.clear();
  return vocab;
}

// Bounded optimal-string-alignment distance. It handles the common transposition
// typo ("shwoer" -> "shower") without running fuzzy matching against every
// product record. Corrections are resolved once per query token and cached.
function boundedSearchDistance(a,b,maxDist=2){
  a=normalizeText(a); b=normalizeText(b);
  if(a===b) return 0;
  if(!a||!b||Math.abs(a.length-b.length)>maxDist) return maxDist+1;
  let prev2=null, prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i]; let rowMin=i;
    for(let j=1;j<=b.length;j++){
      let v=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      if(prev2 && i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1]) v=Math.min(v,prev2[j-2]+1);
      cur[j]=v; if(v<rowMin) rowMin=v;
    }
    if(rowMin>maxDist) return maxDist+1;
    prev2=prev; prev=cur;
  }
  return prev[b.length];
}

function correctedSearchToken(token){
  const t=normalizeText(token); if(!t || /\d/.test(t) || t.length<4) return t;
  const direct=SEARCH_ALIASES[t]||SEARCH_ALIASES[compactSearchToken(t)];
  if(direct?.length) return t;
  const vocab=ensureSearchVocabulary(); if(vocab.has(t)) return t;
  const key=`${state.productDataVersion}|${t}`; if(state.searchCorrectionCache.has(key)) return state.searchCorrectionCache.get(key);
  const maxDist=t.length>=6?2:1; let best=t,bestDist=maxDist+1,bestPenalty=99;
  for(const word of vocab){
    if(!word || word.length<3 || word.includes(' ') || Math.abs(word.length-t.length)>maxDist) continue;
    const d=boundedSearchDistance(t,word,maxDist); if(d>maxDist) continue;
    // Prefer same leading character and similar length when two terms are equally close.
    const penalty=(word[0]===t[0]?0:2)+Math.abs(word.length-t.length);
    if(d<bestDist || (d===bestDist&&penalty<bestPenalty) || (d===bestDist&&penalty===bestPenalty&&word.length<best.length)){
      best=word;bestDist=d;bestPenalty=penalty;
    }
  }
  state.searchCorrectionCache.set(key,best); if(state.searchCorrectionCache.size>160) state.searchCorrectionCache.delete(state.searchCorrectionCache.keys().next().value);
  return best;
}

const SEARCH_CANONICAL_TOKENS={
  shw:'shower',bas:'basin',bm:'basin mixer',sm:'shower mixer',btm:'bath mixer',thm:'thermostat',thermo:'thermostat',conc:'concealed',exp:'exposed',
  wallmout:'wallmounted',wallmont:'wallmounted',mixr:'mixer',basn:'basin',shwoer:'shower',hower:'shower',raisn:'rain',
  tempeseta:'tempesta',essnce:'essence',conceald:'concealed',smc:'smartcontrol',rsh:'rainshower',line:'lineare',temp:'tempesta',euph:'euphoria',basmix:'basin mixer',shwmix:'shower mixer',wallmixer:'wall mounted mixer'
};
function canonicalizeSearchQuery(normalized){
  const expanded=String(normalized||'').split(/\s+/).filter(Boolean).map(token=>SEARCH_CANONICAL_TOKENS[normalizeText(token)]||correctedSearchToken(token)).join(' '); return normalizeSearchQuery(expanded);
}

function tokenSearchVariants(token){
  const original=normalizeText(token), corrected=correctedSearchToken(original), out=new Set();
  for(const t of [original,corrected]) for(const v of searchVariants(t)) { const n=normalizeText(v); if(n) out.add(n); }
  return [...out];
}

function ensureSearchLexicon(){
  if(state.searchLexiconVersion===state.productDataVersion) return state.searchLexicon;
  const families=new Map(),finishes=new Map();
  for(const p of state.products){
    const f=String(p.family||'').trim(), fn=normalizeText(f); if(f&&fn&&!families.has(fn))families.set(fn,f);
    const c=String(p.finish||'').trim(), cn=normalizeText(c); if(c&&cn&&!finishes.has(cn))finishes.set(cn,c);
  }
  state.searchLexicon={families:[...families.entries()],finishes:[...finishes.entries()]};
  state.searchLexiconVersion=state.productDataVersion; return state.searchLexicon;
}

function detectSearchIntent(normalized){ const matches=PRODUCT_SEARCH_INTENTS.filter(x=>x.rx.test(normalized)); return {matches,strict:matches.filter(x=>x.strict)}; }
// v15.8 compatibility wrappers retained so the refactor does not remove any
// previously named application function. Search execution itself uses the new
// structured index below.
function primaryProductSearchText(p){ return prepareProductSearchIndex(p).primary; }
function secondaryProductSearchText(p){ return prepareProductSearchIndex(p).secondary; }
function searchIntentProfile(raw){ return detectSearchIntent(canonicalizeSearchQuery(normalizeSearchQuery(raw))).matches; }
function searchIntentScore(p,intents,primary,secondary){
  if(!intents?.length) return 0;
  let score=0;
  for(const rule of intents){
    if((rule.cats||rule.categories||[]).includes(p.category)) score+=950;
    else if((rule.terms||[]).some(t=>primary.includes(normalizeText(t)))) score+=260;
    else if((rule.terms||[]).some(t=>secondary.includes(normalizeText(t)))) score-=120;
  }
  return score;
}
function detectStructuredSearchConstraints(normalized){
  const canonical=canonicalizeSearchQuery(normalized), padded=` ${canonical} `;
  const tokenSet=new Set(canonical.split(/\s+/).filter(Boolean));
  const lexicon=ensureSearchLexicon();
  const familyTargets=[];
  for(const [n,name] of lexicon.families){
    if(!n || /universal|other/.test(n)) continue;
    if(padded.includes(` ${n} `)) familyTargets.push(name);
  }
  const finishTargets=new Set();
  for(const [name,code] of Object.entries(FINISH_CODES)){
    const n=normalizeText(name), c=normalizeText(code);
    if((n.length>2 && padded.includes(` ${n} `)) || (c && tokenSet.has(c))) finishTargets.add(name);
  }
  const finishAliases={bws:'Brushed Warm Sunset',bcs:'Brushed Cool Sunrise',bhg:'Brushed Hard Graphite',mb:'Matte Black',pb:'Phantom Black',ss:'Supersteel'};
  for(const [alias,name] of Object.entries(finishAliases)) if(tokenSet.has(alias)) finishTargets.add(name);
  return {canonical,familyTargets:[...new Set(familyTargets)],finishTargets:[...finishTargets]};
}
function tokenFieldScore(token,idx,preparedVariants=null){
  const variants=(preparedVariants||tokenSearchVariants(token)).map(normalizeText).filter(Boolean); let best=0;
  const scoreField=(value,exact,prefix,contains)=>{
    if(!value)return;
    for(const v of variants){
      if(!v)continue;
      if(value===v)best=Math.max(best,exact);
      else if(/^\d+$/.test(v)){ if((` ${value} `).includes(` ${v} `)) best=Math.max(best,contains); }
      else if(v.length<=2){ if((` ${value} `).includes(` ${v} `)) best=Math.max(best,contains); }
      else if(value.startsWith(v))best=Math.max(best,prefix);
      else if(value.includes(v))best=Math.max(best,contains);
    }
  };
  // Identity fields deliberately outrank incidental technical/full-text wording.
  scoreField(idx.sku,1100,940,660);
  scoreField(idx.category,660,590,500);
  scoreField(idx.family,640,570,480);
  scoreField(idx.finish,570,510,420);
  scoreField(idx.finishCode,600,540,450);
  scoreField(idx.size,500,430,340);
  scoreField(idx.dimensions,620,560,500);
  scoreField(idx.function,470,400,315);
  scoreField(idx.mounting,450,385,300);
  scoreField(idx.outlets,430,370,290);
  scoreField(idx.shape,390,335,260);
  scoreField(idx.area,370,320,245);
  scoreField(idx.desc,540,470,380);
  scoreField(idx.keywords,500,430,350);
  scoreField(idx.sprays,330,285,220);
  if(best)return best;
  // Numeric dimensions/SKU fragments must be present in identity fields; otherwise
  // page numbers and unrelated technical prose create noisy matches.
  if(/^\d+$/.test(normalizeText(token))) return 0;
  // Full catalogue prose is recall-only. It can rescue a product, but it must not
  // outrank the product's actual family/category/description identity.
  for(const v of variants){ if(v.length>=3 && idx.secondary.includes(v)) return 36; }
  return 0;
}

function isShowerSolutionQuery(canonical=''){
  return /\b(?:tempesta|rainshower|shower|grohtherm|euphoria|smartcontrol|thermostat|thermostatic|trimset|trim set)\b/.test(canonical);
}
function showerSolutionTier(p,idx){
  const hay=` ${idx.primary} ${idx.secondary} `;
  const category=String(p.category||'');
  const hasRequiredBody=Array.isArray(p.requiredBodies)&&p.requiredBodies.length>0;
  const concealed=String(p.mounting||'').toLowerCase()==='concealed'||hasRequiredBody||/\bconcealed\b|\btrim\s*set\b|\btrimset\b|final installation|rapido smartbox|smartbox/.test(hay);
  const showerControl=['Shower Mixer','Bath Mixer'].includes(category)||/shower mixer|bath mixer|thermostat|smartcontrol|diverter/.test(hay);
  const showerSystem=category==='Shower System'||/shower system/.test(hay);
  const rainshower=category==='Head Shower'||(category!=='Shower System'&&/rainshower|head shower/.test(hay));
  const exposed=category==='Shower System'||category==='Shower Set / Rail'||(category==='Shower Mixer'&&!concealed)||/exposed|wall mounting|shower rail/.test(hay);
  if(concealed&&(showerControl||showerSystem)) return 0;
  if(rainshower) return 1;
  if(exposed) return 2;
  if(['Hand Shower','Shower Accessory','Shower Hose','Trigger Spray'].includes(category)) return 3;
  return 4;
}

  // ===== 20_search_filters_catalogue.js =====
function searchProducts(query, base=state.products){
  const raw=String(query||'').trim(); if(!raw)return base;
  const normalized=normalizeSearchQuery(raw),constraints=detectStructuredSearchConstraints(normalized),canonical=constraints.canonical||canonicalizeSearchQuery(normalized);
  const cacheable=(base===state.products||base===visibleCatalogueProducts());
  const cacheKey=cacheable?`${state.productDataVersion}|${state.includeCeramics?'1':'0'}|${state.includePruned?'1':'0'}|${normalized}|${canonical}|${base.length}`:'';
  if(cacheKey&&state.searchCache.has(cacheKey))return state.searchCache.get(cacheKey).slice();

  // SKU search is deterministic and never fuzzy. Partial prefixes such as 22041 must
  // return every revision/finish beginning with that article stem.
  const codeLike=/^\s*[A-Za-z0-9][A-Za-z0-9\s-]*\s*$/.test(raw) && /\d/.test(raw) && !/[a-zA-Z]{4,}/.test(raw.replace(/[A-Z]{1,3}\d*$/i,''));
  const skuQuery=codeLike?normalizeSku(raw):'';
  if(skuQuery && (raw.match(/\d/g)||[]).length>=4){
    const exact=state.productMap.get(skuQuery); if(exact&&base.includes(exact))return[exact];
    const prefixMatches=base.filter(p=>p.sku.startsWith(skuQuery));
    if(prefixMatches.length){const out=prefixMatches.sort((a,b)=>a.sku.localeCompare(b.sku,undefined,{numeric:true}));if(cacheKey)state.searchCache.set(cacheKey,out);return out.slice();}
  }

  const intent=detectSearchIntent(canonical);
  const hasDimensionIntent=/\b\d{2,4}\b/.test(canonical);
  const showerIntentQuery=isShowerSolutionQuery(canonical);
  const originalTokens=normalized.split(/\s+/).filter(Boolean);
  const canonicalTokens=canonical.split(/\s+/).filter(Boolean);
  const tokens=originalTokens.map((token,i)=>({raw:token,canonical:canonicalTokens[i]||correctedSearchToken(token),variants:tokenSearchVariants(token)}));
  const results=[];
  const allowedIntentCats=intent.strict.length?new Set(intent.strict.flatMap(x=>x.cats)):null;
  const concealedControlQuery=/\bconcealed\b/.test(canonical) && /\b(?:smartcontrol|thermostat|thermostatic|mixer|control)\b/.test(canonical) && !/\b(?:concealed body|concealed part|roughin|smartbox)\b/.test(canonical);
  for(const p of base){
    const idx=prepareProductSearchIndex(p); let score=0;
    if(concealedControlQuery){
      const isControl=['Shower Mixer','Bath Mixer'].includes(p.category) || (p.category==='Accessory' && /mixer|diverter|smartcontrol|thermostat/.test(idx.primary));
      if(!isControl) continue;
      if(['Shower Mixer','Bath Mixer'].includes(p.category)) score+=900; else score+=500;
    }
    if(allowedIntentCats){
      if(!allowedIntentCats.has(p.category))continue;
      score+=1000*intent.strict.filter(rule=>rule.cats.includes(p.category)).length;
    }
    const familyMatch=!constraints.familyTargets.length||constraints.familyTargets.some(f=>{const pf=normalizeText(p.family),tf=normalizeText(f);return pf===tf||pf.startsWith(tf+' ')||tf.startsWith(pf+' ');});
    const familyWords=[...new Set(constraints.familyTargets.flatMap(f=>normalizeText(f).split(/\s+/)).filter(w=>w&&!/^\d+$/.test(w)&&w.length>=3))];
    const showerSemanticFamilyQuery=showerIntentQuery && familyWords.length>0;
    // Tempesta / Rainshower / Euphoria-style searches must behave like product-identity
    // searches, not exact stored-family filters. Many valid results live under broader
    // stored families such as Head Shower, Shower System, Grohtherm, Cubeo and Eurosmart.
    if(showerSemanticFamilyQuery){
      const coreIdentity=normalizeText([p.family,p.description,p.category,p.size,p.area,p.mounting].join(' '));
      const identityWithKeywords=normalizeText([p.family,p.description,p.category,p.size,p.area,p.mounting,p.keywords,p.fullText].join(' '));
      const queryDimensions=canonical.match(/\b\d{2,4}\b/g)||[];
      if(familyWords.length && !familyWords.some(w=>(` ${identityWithKeywords} `).includes(` ${w} `))) continue;
      if(queryDimensions.length && !queryDimensions.every(n=>(` ${coreIdentity} `).includes(` ${n} `))) continue;
      score+=560;
    } else {
      if(constraints.familyTargets.length&&!familyMatch)continue;
      if(familyMatch&&constraints.familyTargets.length)score+=520;
    }
    if(constraints.finishTargets.length&&!constraints.finishTargets.includes(p.finish))continue;

    let matchedPrimary=0,matchedSecondary=0,failed=false;
    for(const t of tokens){
      const tokenScore=tokenFieldScore(t.raw,idx,t.variants);
      if(!tokenScore){failed=true;break;}
      if(tokenScore<=36)matchedSecondary++; else matchedPrimary++;
      score+=tokenScore;
    }
    if(failed)continue;

    if(idx.desc===canonical)score+=800; else if(idx.desc.startsWith(canonical))score+=590; else if(idx.desc.includes(canonical))score+=410;
    if(idx.keywords===canonical)score+=700; else if(idx.keywords.startsWith(canonical))score+=520; else if(canonical.length>=3&&idx.keywords.includes(canonical))score+=360;
    if(idx.category===canonical)score+=760;
    if(idx.family===canonical)score+=650;
    if(idx.finish===canonical||idx.finishCode===canonical)score+=620;
    if(matchedSecondary===tokens.length)score-=600;
    if(matchedPrimary===tokens.length && tokens.length>1)score+=120;
    results.push({p,score,tier:showerIntentQuery?showerSolutionTier(p,idx):0});
  }
  results.sort((a,b)=>(showerIntentQuery?(a.tier-b.tier):0)||b.score-a.score||productPriority(a.p)-productPriority(b.p)||a.p.sku.localeCompare(b.p.sku,undefined,{numeric:true}));
  const out=results.map(x=>x.p);
  if(cacheKey){state.searchCache.set(cacheKey,out);if(state.searchCache.size>80)state.searchCache.delete(state.searchCache.keys().next().value);}
  return out.slice();
}

function facetSearchScore(query,btn){
  const normalized=normalizeSearchQuery(query);if(!normalized)return 0;
  const canonical=canonicalizeSearchQuery(normalized),label=normalizeText(btn.dataset.label||btn.textContent||''),corpus=normalizeText(btn.dataset.search||btn.textContent||'');
  if(label===canonical||label===normalized)return 1000;
  if(label.startsWith(canonical)||label.startsWith(normalized))return 820;
  if(label.includes(canonical)||label.includes(normalized))return 680;
  const tokens=normalized.split(/\s+/).filter(Boolean);let total=0;
  for(const token of tokens){
    let best=0;
    for(const nv of tokenSearchVariants(token)){
      if(!nv)continue;
      if((` ${corpus} `).includes(` ${nv} `))best=Math.max(best,460);
      else if(corpus.startsWith(nv))best=Math.max(best,390);
      else if(corpus.includes(nv))best=Math.max(best,330);
    }
    if(!best){const corrected=correctedSearchToken(token);if(corrected.length>=3&&smartFacetMatch(corrected,corpus))best=170;}
    if(!best)return-1; total+=best;
  }
  return total;
}

function smartTextSearchMatch(query,text){
  const normalized=normalizeSearchQuery(query); if(!normalized) return true;
  const canonical=canonicalizeSearchQuery(normalized), corpus=normalizeText(text), compact=corpus.replace(/\s+/g,'');
  const rawTokens=normalized.split(/\s+/).filter(Boolean), canonicalTokens=canonical.split(/\s+/).filter(Boolean);
  return rawTokens.every((token,i)=>{
    const variants=new Set([...tokenSearchVariants(token),...(canonicalTokens[i]?tokenSearchVariants(canonicalTokens[i]):[])]);
    for(const v0 of variants){
      const v=normalizeText(v0), cv=v.replace(/\s+/g,''); if(!v) continue;
      if(v.length<=2 ? (` ${corpus} `).includes(` ${v} `) : corpus.includes(v)) return true;
      if(cv.length>=3 && compact.includes(cv)) return true;
    }
    const corrected=correctedSearchToken(token); return corrected.length>=3 && smartFacetMatch(corrected,corpus);
  });
}

function applyFacetMenuSearch(menu,key,root){
  const input=menu?.querySelector(`[data-facet-search="${key}"]`);if(!input||!root)return;const q=input.value.trim();const choices=qsa('[data-facet-choice]',root);choices.forEach((btn,i)=>{if(!btn.dataset.facetOrder)btn.dataset.facetOrder=String(i);const score=q?facetSearchScore(q,btn):0;btn.hidden=!!q&&score<0;btn.dataset.searchScore=String(score);});const clear=root.querySelector('[data-facet-clear]');if(clear)clear.hidden=false;const visible=choices.filter(btn=>!btn.hidden).sort((a,b)=>!q?Number(a.dataset.facetOrder||0)-Number(b.dataset.facetOrder||0):Number(b.dataset.searchScore||0)-Number(a.dataset.searchScore||0)||Number(a.dataset.facetOrder||0)-Number(b.dataset.facetOrder||0));visible.forEach(btn=>root.appendChild(btn));choices.filter(btn=>btn.hidden).forEach(btn=>root.appendChild(btn));const empty=root.querySelector('.facet-no-results');if(empty){root.appendChild(empty);empty.hidden=!(q&&visible.length===0);}input.classList.toggle('no-results',!!q&&visible.length===0);input.setAttribute('aria-label',visible.length===0?'No matching options':`${visible.length} matching options`);
}

function productPriority(p){
  let score=10;
  if(state.favorites.has(p.sku)) score-=4;
  if(p.priority) score-=3;
  if(['Active','New','Professional','Special / Project'].includes(p.status)) score-=2;
  if(p.status==='Legacy Catalogue') score+=3;
  if(isPrunedProduct(p)) score+=8;
  else if(p.status==='Discontinued / Pruned') score+=5;
  if(p.custom) score-=1;
  return score;
}

function getFilteredProducts(ignoreKey='',presearched=null){
  const query=$('smartSearch').value.trim();
  const skuPrefixMode=query&&/^\s*\d[\dA-Za-z\s-]*\s*$/.test(query)&&(query.match(/\d/g)||[]).length>=4;
  let list=Array.isArray(presearched)?presearched.slice():visibleCatalogueProducts().slice();
  if(query&&!Array.isArray(presearched)) list=searchProducts(query,list);
  if(!skuPrefixMode){
    for(const [key,raw] of Object.entries(state.filters)){
      const vals=Array.isArray(raw)?raw.filter(Boolean):(raw?[raw]:[]);
      if(key!==ignoreKey&&vals.length) list=list.filter(p=>vals.includes(String(p[key]||'')));
    }
  }
  if(state.showMissingImagesOnly && state.imageFolderConnected) list=list.filter(p=>!getImageFile(p.sku));
  if(!skuPrefixMode&&state.viewFilter==='favorites') list=list.filter(p=>state.favorites.has(p.sku));
  else if(!skuPrefixMode&&state.viewFilter==='recent'){
    const rank=new Map(state.recentProducts.map((sku,i)=>[sku,i]));
    list=list.filter(p=>rank.has(p.sku)).sort((a,b)=>rank.get(a.sku)-rank.get(b.sku));
  }
  if(!query&&state.viewFilter!=='recent') list.sort((a,b)=>productPriority(a)-productPriority(b)||a.family.localeCompare(b.family,undefined,{numeric:true})||a.description.localeCompare(b.description,undefined,{numeric:true}));
  return list;
}

const PRIORITY_FINISH_ORDER=['Chrome','Brushed Warm Sunset','Brushed Cool Sunrise','Brushed Hard Graphite','Cool Sunrise','Supersteel','Stainless Steel','Matte Black','Phantom Black','Warm Sunset','Hard Graphite','Alpine White','Moon White'];
const PRIMARY_CATEGORY_ORDER=['Basin Mixer','Shower Mixer','Head Shower','Flushing System','Hand Shower','Accessory'];
const CATEGORY_DISPLAY_ALIASES={'Shower Mixer':'Shower Trimset','Head Shower':'Rainshower','Flushing System':'Flushtank','Accessory':'Accessories'};
const MATTE_GROUP_VALUES=['Matte Black','Phantom Black'];

function facetDisplayLabel(key,value){
  if(key==='category') return CATEGORY_DISPLAY_ALIASES[value]||value;
  if(key==='finish' && value==='__matte_group__') return 'Matte / Phantom Black';
  return value;
}

function sortFacetValues(key,values){
  const list=[...values];
  const indexMap = new Map((key==='finish'?PRIORITY_FINISH_ORDER:key==='category'?PRIMARY_CATEGORY_ORDER:[]).map((v,i)=>[v,i]));
  return list.sort((a,b)=>{
    const ai=indexMap.has(a)?indexMap.get(a):999, bi=indexMap.has(b)?indexMap.get(b):999;
    if(ai!==bi) return ai-bi;
    return String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'});
  });
}

const FACET_LABELS={
  area:'All areas',category:'All categories',family:'All collections',finish:'All finishes',size:'All sizes',
  mounting:'All installation types',function:'All controls',outlets:'All outlets / ways',shape:'All shapes',status:'All statuses'
};

function filterValues(key){
  const raw=state.filters[key];
  return Array.isArray(raw)?raw.filter(Boolean):(raw?[raw]:[]);
}

function setFilterValues(key,values){
  state.filters[key]=[...new Set((values||[]).filter(Boolean))];
}

function facetSearchCorpus(key,value){
  const text=[value];
  const v=normalizeText(value);
  const categoryAliases={
    'waste bath set':'popup pop up pop-up waste drain inlet talento talentofill',
    'shower mixer':'shower control mixer thermostat thermostatic concealed exposed',
    'bath mixer':'bath control mixer diverter bath shower',
    'basin mixer':'basin faucet tap washbasin',
    'head shower':'headshower rainshower overhead shower rain shower',
    'hand shower':'handshower shower handset',
    'shower set rail':'rail set shower set hand shower',
    'concealed rough in':'concealed body rough in rough-in smartbox rapido',
    'flush plate actuation':'flush plate wall plate actuator actuation',
    'bath spout':'bath spout filler'
  };
  if(key==='category' && categoryAliases[v]) text.push(categoryAliases[v]);
  if(key==='finish'){
    const code=FINISH_CODES[value]; if(code) text.push(code);
    for(const [alias,targets] of Object.entries(SEARCH_ALIASES||{})){
      if((targets||[]).some(t=>normalizeText(t)===v)) text.push(alias);
    }
  }
  // Reverse aliases make abbreviations work inside any facet menu, not only
  // the global search (e.g. THM -> Thermostatic, BWS -> Brushed Warm Sunset).
  for(const [alias,targets] of Object.entries(SEARCH_ALIASES||{})){
    if(normalizeText(alias)===v || (targets||[]).some(t=>v.includes(normalizeText(t))||normalizeText(t).includes(v))) text.push(alias,...targets);
  }
  return normalizeText(text.join(' '));
}

function closeFacetMenuAfterSelection(menu,key){
  if(!menu) return;
  const search=menu.querySelector(`[data-facet-search="${key}"]`);
  if(search){
    search.value='';
    search.classList.remove('no-results');
  }
  if(menu.tagName==='DETAILS') menu.open=false;
}

function setFacetMenuOptions(key,context,current){
  const menu=document.querySelector(`.facet-menu[data-facet-key="${key}"]`); if(!menu) return;
  const counts=new Map();
  for(const p of context){ const v=String(p[key]||'').trim(); if(v) counts.set(v,(counts.get(v)||0)+1); }
  // Facet state is user-owned. Search and cross-filter counts must never silently
  // remove a selected value. Keep selected values visible even when the current
  // context count is zero; only an explicit user action changes state.filters.
  let selected=filterValues(key);
  let values=[...new Set([...counts.keys(),...selected])].filter(v=>!(key==='status' && v==='Legacy Catalogue'));
  values=sortFacetValues(key,values);
  const label=menu.querySelector(`[data-facet-value="${key}"]`);
  const matteGroupSelected=MATTE_GROUP_VALUES.every(v=>selected.includes(v));
  if(label){
    if(key==='finish' && matteGroupSelected && selected.length===MATTE_GROUP_VALUES.filter(v=>counts.has(v)).length) label.innerHTML=`${finishSwatchHtml('Matte Black')}<span>Matte / Phantom Black</span>`;
    else if(selected.length===1 && key==='finish') label.innerHTML=`${finishSwatchHtml(selected[0])}<span>${esc(facetDisplayLabel(key,selected[0]))}</span>`;
    else if(selected.length===1) label.textContent=facetDisplayLabel(key,selected[0]);
    else if(selected.length>1) label.textContent=`${selected.length} selected`;
    else label.textContent=FACET_LABELS[key]||'All';
  }
  const root=menu.querySelector(`[data-facet-options="${key}"]`); if(!root) return;
  const optionHtml=(value,count,extraCls='')=>{
    const display=facetDisplayLabel(key,value);
    const content=key==='finish'?`<span class="facet-finish-label">${finishSwatchHtml(value==='__matte_group__'?'Matte Black':value)}<span>${esc(display)}</span></span>`:`<span>${esc(display)}</span>`;
    const on=value==='__matte_group__'?MATTE_GROUP_VALUES.every(v=>selected.includes(v)):selected.includes(value);
    const searchValue=value==='__matte_group__'?'Matte Black Phantom Black KF 2430':facetSearchCorpus(key,display);
    return `<button type="button" class="facet-option multi ${on?'selected':''} ${key==='finish'?'finish-option':''} ${extraCls}" data-facet-choice="${esc(value)}" data-label="${esc(display)}" data-search="${esc(searchValue)}" aria-pressed="${on?'true':'false'}"><i class="facet-check">${on?'✓':''}</i>${content}<small>${Number(count||0).toLocaleString()}</small></button>`;
  };
  let html=`<button type="button" class="facet-option clear-facet ${!selected.length?'selected':''}" data-facet-clear="1" data-search="all"><i class="facet-check">${!selected.length?'✓':''}</i><span>${esc(FACET_LABELS[key]||'All')}</span><small>${context.length.toLocaleString()}</small></button>`;
  if(key==='finish'){
    const priority = PRIORITY_FINISH_ORDER.filter(v=>counts.has(v));
    const extras = values.filter(v=>!priority.includes(v));
    const matteCount = MATTE_GROUP_VALUES.reduce((n,v)=>n+(counts.get(v)||0),0);
    const priorityHtml=[];
    priority.forEach(v=>{ if(MATTE_GROUP_VALUES.includes(v)) return; priorityHtml.push(optionHtml(v,counts.get(v))); });
    if(matteCount) priorityHtml.push(optionHtml('__matte_group__',matteCount,'finish-pair-option'));
    const extraHtml = extras.map(v=>optionHtml(v,counts.get(v),'finish-extra')).join('');
    html += `<div class="finish-priority-list">${priorityHtml.join('')}</div>`;
    if(extraHtml){ html += `<div class="finish-show-more-wrap"><button type="button" class="finish-show-more-btn" data-toggle-more-finishes="1">Show more finishes</button><div class="finish-extra-list" hidden>${extraHtml}</div></div>`; }
    html += `<div class="facet-no-results" aria-live="polite" hidden>No matching options</div>`;
  } else {
    html += values.map(v=>optionHtml(v,counts.get(v))).join('')+`<div class="facet-no-results" aria-live="polite" hidden>No matching options</div>`;
  }
  root.innerHTML=html;
  const clearBtn=root.querySelector('[data-facet-clear]');
  if(clearBtn) clearBtn.onclick=()=>{
    setFilterValues(key,[]); state.resultLimit=90; renderFilters();
    closeFacetMenuAfterSelection(menu,key);
  };
  const toggleMore=root.querySelector('[data-toggle-more-finishes]');
  if(toggleMore){ toggleMore.onclick=()=>{ const extra=root.querySelector('.finish-extra-list'); const open=extra?.hidden===false; if(extra) extra.hidden=open; toggleMore.textContent=open?'Show more finishes':'Show fewer finishes'; }; }
  qsa('[data-facet-choice]',root).forEach(btn=>btn.onclick=()=>{
    const value=btn.dataset.facetChoice||'';
    let next=filterValues(key);
    if(key==='finish' && value==='__matte_group__'){
      const hasAll=MATTE_GROUP_VALUES.every(v=>next.includes(v));
      next=next.filter(v=>!MATTE_GROUP_VALUES.includes(v));
      if(!hasAll) MATTE_GROUP_VALUES.filter(v=>counts.has(v)).forEach(v=>next.push(v));
    } else {
      const pos=next.indexOf(value);
      if(pos>=0) next.splice(pos,1); else next.push(value);
    }
    setFilterValues(key,next); state.resultLimit=90;
    renderFilters();
    closeFacetMenuAfterSelection(menu,key);
  });
  const search=menu.querySelector(`[data-facet-search="${key}"]`);
  if(search){
    applyFacetMenuSearch(menu,key,root);
    search.oninput=()=>applyFacetMenuSearch(menu,key,root);
    search.onsearch=()=>applyFacetMenuSearch(menu,key,root);
    search.onkeydown=e=>{
      if(e.key==='Escape' && search.value){e.stopPropagation();search.value='';applyFacetMenuSearch(menu,key,root);return;}
      if(e.key==='ArrowDown'){e.preventDefault();const first=qsa('[data-facet-choice]',root).find(btn=>!btn.hidden);first?.focus();}
    };
  }
}

function renderFilters(){
  if(!state.products.length) return;
  const query=$('smartSearch').value.trim();
  const catalogueBase=visibleCatalogueProducts();
  const searchBase=query ? searchProducts(query,catalogueBase) : catalogueBase;
  const keys=['area','category','family','finish','size','mounting','function','outlets','shape','status'];
  // Search does not participate in facet construction. This prevents typing,
  // deleting, or changing a query from changing filter options or selections.
  const applyExcept=(ignoreKey='')=>{
    let list=catalogueBase;
    for(const [key,raw] of Object.entries(state.filters)){
      const vals=Array.isArray(raw)?raw.filter(Boolean):(raw?[raw]:[]);
      if(key!==ignoreKey && vals.length) list=list.filter(p=>vals.includes(String(p[key]||'')));
    }
    return list;
  };
  for(const key of keys) setFacetMenuOptions(key,applyExcept(key),filterValues(key));
  const chips=$('activeFilterChips');
  const active=[];
  for(const key of keys) for(const v of filterValues(key)) active.push([key,v]);
  chips.innerHTML=active.map(([key,v])=>`<button type="button" class="filter-chip" data-clear-facet="${esc(key)}" data-clear-value="${esc(v)}"><span>${esc(v)}</span> ×</button>`).join('')+(state.viewFilter?`<button type="button" class="filter-chip" data-clear-view="1"><span>${esc(state.viewFilter==='favorites'?'Favorites':'Recent')}</span> ×</button>`:'')+(state.showMissingImagesOnly?`<button type="button" class="filter-chip" data-clear-missing-images="1"><span>Without images</span> ×</button>`:'');
  qsa('[data-clear-facet]',chips).forEach(btn=>btn.onclick=()=>{const key=btn.dataset.clearFacet;setFilterValues(key,filterValues(key).filter(v=>v!==btn.dataset.clearValue));state.resultLimit=90;renderFilters();});
  const cv=chips.querySelector('[data-clear-view]'); if(cv) cv.onclick=()=>{state.viewFilter='';$('filterView').value='';renderFilters();};
  const cm=chips.querySelector('[data-clear-missing-images]'); if(cm) cm.onclick=()=>setMissingImagesOnly(false);
  $('catalogueTotal').textContent=`${visibleCatalogueProducts().length.toLocaleString()} SKUs`;
  const advancedKeys=['area','size','mounting','function','outlets','shape','status'];
  const advancedCount=advancedKeys.reduce((n,k)=>n+filterValues(k).length,0)+(state.viewFilter?1:0);
  const advancedBadge=$('advancedFilterCount');
  if(advancedBadge){ advancedBadge.textContent=String(advancedCount); advancedBadge.hidden=!advancedCount; }
  const moreFilters=$('moreFilters');
  if(moreFilters) moreFilters.classList.toggle('has-active-filters',advancedCount>0);
  renderSearchSuggestions();
  renderResults(getFilteredProducts('',searchBase));
}

function renderSearchSuggestions(){
  const dl=$('searchSuggestions'); if(!dl) return;
  const rec=state.recentSearches.slice(0,10), fav=[...state.favorites].slice(0,8).map(s=>getProduct(s)).filter(Boolean).map(p=>`${p.sku} ${p.family}`);
  dl.innerHTML=[...new Set([...rec,...fav])].map(v=>`<option value="${esc(v)}"></option>`).join('');
}

function getImageFile(sku){ return state.imageFiles.get(normalizeSku(sku)); }
function imageUrlFor(sku){
  const key=normalizeSku(sku); if(state.imageUrls.has(key)) return state.imageUrls.get(key);
  const f=getImageFile(key); if(!f) return '';
  if(typeof f==='string') return f;
  const url=URL.createObjectURL(f); state.imageUrls.set(key,url); return url;
}
function imageHtml(sku, cls='product-img'){
  const url=imageUrlFor(sku);
  return `<div class="${cls}">${url?`<img src="${url}" alt="${esc(sku)}" loading="lazy" decoding="async" />`:`<div class="sku-placeholder">${esc(sku)}</div>`}</div>`;
}

function resultCardHtml(p){
  const selectedCount=state.selectedSkuCounts.get(p.sku)||0;
  const fav=state.favorites.has(p.sku);
  const spa=isSpaProduct(p);
  const pruned=isPrunedProduct(p);
  return `<article class="product-card fast-card ${selectedCount?'is-selected':''}" data-sku="${esc(p.sku)}" tabindex="0">
    ${imageHtml(p.sku)}
    <div class="product-info">
      <div class="product-card-top"><div class="product-sku">${esc(p.sku)}</div><div class="card-badges">${pruned?'<span class="pruned-badge">PRUNED</span>':''}${spa?'<span class="spa-badge">SPA</span>':''}${selectedCount?`<span class="selected-count">✓${selectedCount>1?` ${selectedCount}`:''}</span>`:''}</div></div>
      ${p.family?`<div class="product-family">${esc(p.family)}</div>`:''}
      <div class="product-desc">${esc(p.description)}</div>
      <div class="product-card-meta">${p.finish?`${finishSwatchHtml(p.finish)}<span>${esc(p.finish)}</span>`:'<span class="technical-finish">Technical / concealed</span>'}</div>
    </div>
    <div class="card-actions-mini" aria-label="Product actions">${state.showMissingImagesOnly&&state.imageFolderConnected&&!getImageFile(p.sku)?`<button class="image-search-btn" data-google-image-sku="${esc(p.sku)}" title="Search Google Images for ${esc(p.sku)} GROHE" aria-label="Search image for ${esc(p.sku)}"><span>⌕</span><b>Image</b></button>`:''}<button class="favorite-btn ${fav?'active':''}" data-fav-sku="${esc(p.sku)}" title="${fav?'Remove from favorites':'Add to favorites'}" aria-label="${fav?'Remove from favorites':'Add to favorites'}">★</button><button class="pdf-sheet-btn" data-pdf-sku="${esc(p.sku)}" title="Preview PDF data sheet" aria-label="Preview PDF data sheet for ${esc(p.sku)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h4"/><path d="M9.5 13h5M9.5 16h5"/></svg></button><button class="quick-add" data-add-sku="${esc(p.sku)}" title="Add ${esc(p.sku)}" aria-label="Add ${esc(p.sku)}">＋</button></div>
  </article>`;
}

function appendResultBatch(){
  const list=state.currentResults||[];
  if(state.renderedResults>=list.length) return;
  const next=Math.min(list.length,state.renderedResults+72);
  const chunk=list.slice(state.renderedResults,next);
  $('resultsList').insertAdjacentHTML('beforeend',chunk.map(resultCardHtml).join(''));
  state.renderedResults=next;
}

function renderResults(listOverride=null){
  const list=Array.isArray(listOverride)?listOverride:getFilteredProducts();
  const hasFilters=Object.values(state.filters).some(v=>Array.isArray(v)?v.length:!!v) || $('smartSearch').value.trim();
  const resultSummary=$('resultSummary'); if(resultSummary) resultSummary.textContent='';
  state.currentResults=list;
  state.renderedResults=0;
  state.selectedSkuCounts=new Map();
  for(const item of (state.project?.items||[])){if(item.type==='product'&&!item.auto){const sku=normalizeSku(item.sku);state.selectedSkuCounts.set(sku,(state.selectedSkuCounts.get(sku)||0)+1);}}
  $('resultsList').innerHTML='';
  if(!list.length){
    $('resultsList').innerHTML=`<div class="sequence-empty no-results"><strong>No matching product</strong><p>Try broader keywords or clear one filter.</p></div>`;
    return;
  }
  appendResultBatch();
}

  // ===== 30_selection_intelligence.js =====
function currentSectionForIndex(index){
  if(!state.project) return '';
  let s='';
  for(let i=0;i<=index && i<state.project.items.length;i++) if(state.project.items[i].type==='section') s=state.project.items[i].title;
  return s;
}

function sectionBoundsForItem(itemId){
  if(!state.project) return [0,0];
  const items=state.project.items; const idx=items.findIndex(x=>x.id===itemId); if(idx<0) return [0,items.length];
  let start=0,end=items.length;
  for(let i=idx;i>=0;i--){ if(items[i].type==='section'){start=i+1;break;} }
  for(let i=idx+1;i<items.length;i++){ if(items[i].type==='section'){end=i;break;} }
  return [start,end];
}

function itemWarnings(item){
  if(!state.project || item.type!=='product') return [];
  const p=getProduct(item.sku); if(!p) return ['SKU not found in master database'];
  const warnings=[];
  if(state.project.finish && RECOGNIZED_FINISHES.has(p.finish) && !/^Concealed \/ Rough-in$/i.test(p.category) && p.finish!==state.project.finish){
    warnings.push(`Finish mismatch: project ${state.project.finish}, product ${p.finish}`);
  }
  if(isPrunedProduct(p)) warnings.push(p.replacement?`Pruned — replacement ${p.replacement}`:'Pruned product');
  else if(p.status==='Replacement Available' && p.replacement) warnings.push(`Replacement available: ${p.replacement}`);

  if(!item.auto && p.requiredBodies?.length){
    const candidates=new Set(bodyCandidatesForProduct(p));
    const childExists=state.project.items.some(x=>x.type==='product' && x.parentItemId===item.id && candidates.has(normalizeSku(x.sku)));
    if(!childExists) warnings.push(item.concealedSuppressed?`Required concealed body was removed (${[...candidates].join(' / ')||p.requiredBodies.join(' / ')})`:`Missing required concealed body (${[...candidates].join(' / ')||p.requiredBodies.join(' / ')})`);
  }
  if(!item.auto && p.compatibilityTag==='multi-component-required') warnings.push('This product requires multiple separately ordered installation components. Review the GROHE system components before finalising the selection.');
  if(!item.auto && p.compatibilityTag==='shower-control-required'){
    const [s,e]=sectionBoundsForItem(item.id);
    const hasControl=state.project.items.slice(s,e).some(x=>{
      if(x.type!=='product' || x.id===item.id) return false;
      const q=getProduct(x.sku); return q && ['Shower Mixer','Thermostat','Shower System'].includes(q.category);
    });
    if(!hasControl) warnings.push('SmartActive head shower requires compatible concealed installation components.');
  }
  return item.validationOverride ? [] : warnings;
}

function projectWarnings(){
  if(!state.project) return [];
  const out=[];
  state.project.items.forEach(item=>{ if(item.type==='product') itemWarnings(item).forEach(w=>out.push({item,w})); });
  const existing=new Set(out.map(x=>`${x.item?.id||''}|${x.w}`));
  phase1ProjectWarnings().forEach(x=>{const key=`${x.item?.id||''}|${x.w}`;if(!existing.has(key)){existing.add(key);out.push(x);}});
  return out;
}

function verifiedRuntimeBodyCandidates(p){
  if(!p?.sku || isWcActuationProduct(p)) return [];
  const sku=normalizeSku(p.sku), cat=String(p.category||''), h=normalizeText([p.description,p.fullText,p.family,p.category,p.mounting,p.function].join(' '));
  const smartControlFinalTrim=/smartcontrol/.test(h) && /final installation for.*rapido smartbox|final installation.*35 604/.test(h) && !/extension set/.test(h);
  if(smartControlFinalTrim) return ['35604000','35600000'];
  if(cat==='Concealed / Rough-in' || /universal rough in|universal rough-in|extension set/.test(h)) return [];
  const mapped=(p.requiredBodies||[]).map(normalizeSku);
  const smartBoxEvidence=mapped.some(x=>['35604000','35600000'].includes(x)) || /rapido smartbox|35 604|35 600/.test(h) ||
    (/^24/.test(sku) && /concealed|trimset|trim set|final installation/.test(h));
  const smartBoxControl=cat==='Shower Mixer' || cat==='Bath Mixer' || smartControlFinalTrim ||
    (cat==='Accessory' && /single lever|single-lever|mixer|diverter|thermostat|smartcontrol|trimset|trim set/.test(h));
  if(smartBoxEvidence && smartBoxControl) return ['35604000','35600000'];
  if(/^10177[78]/.test(sku)) return ['35604000','35600000'];
  if(/^19334/.test(sku)) return ['35028000','29032000'];
  if(/^26254/.test(sku)) return ['26264000'];
  if(sku==='36273000' || sku==='36334SD0') return ['36336001','36337001'];
  if(sku==='36315000' || sku==='36376000') return ['36339001'];
  if(sku==='36442000' || sku==='36447000') return ['38748002','36264001'];
  if(sku==='36321000') return ['36322000'];
  if(sku==='36463000') return ['36416000','36464000'];
  return [];
}

function bodyCandidatesForProduct(p){
  const category=normalizeText(p?.category||'');
  const bodyText=normalizeText([p?.description,p?.fullText,p?.mounting,p?.function].join(' '));
  if(category==='bath mixer' && /freestanding|free standing|free-standing|floor mounted|floor-mounted|floorstanding/.test(bodyText)){
    return ['29086000','45984001'].filter(sku=>!!getProduct(sku));
  }
  // Re-evaluate verified mappings at render/add time as well as load time. This is
  // deliberate: saved local overrides can outlive an application upgrade.
  const raw=[...new Set([...(p?.requiredBodies||[]),...verifiedRuntimeBodyCandidates(p)].map(normalizeSku).filter(Boolean))];
  const resolved=[];
  for(const sku of raw){
    if(getProduct(sku)){ resolved.push(sku); continue; }
    // Some catalogue rows abbreviate a body number without its revision suffix.
    // If the exact key is missing, resolve to an available SKU sharing the same
    // five-digit article stem rather than silently failing to add the body.
    const stem=sku.slice(0,5);
    const match=state.products.find(x=>x.sku!==p?.sku && x.sku.startsWith(stem) && /concealed|rough-in|rough in|rapido|installation/.test(normalizeText([x.category,x.description,x.fullText].join(' '))));
    if(match) resolved.push(match.sku);
  }
  return [...new Set(resolved)];
}

function inspectionShaftCandidatesForProduct(p){
  if(!isWcActuationProduct(p)) return [];
  const all=['66791000','40911000','40950000'].filter(sku=>!!getProduct(sku));
  const compact=normalizeSku([p?.description,p?.fullText].join(' '));
  const mentioned=all.filter(sku=>compact.includes(sku));
  return [...mentioned,...all.filter(sku=>!mentioned.includes(sku))];
}
function inspectionShaftChild(parentId){
  return state.project?.items.find(x=>x.type==='product' && x.parentItemId===parentId && x.componentRole==='inspection-shaft') || null;
}

function preferredBodyCandidate(p,candidates){
  if(!candidates?.length) return '';
  // Prefer current active revisions where both old/new versions exist.
  for(const pair of [['33963001','33963000'],['33964001','33964000'],['23571000','32635000']]){
    if(candidates.includes(pair[0])) return pair[0];
    if(candidates.includes(pair[1]) && !candidates.includes(pair[0])) return pair[1];
  }
  if(candidates.includes('35604000')) return '35604000';
  if(candidates.includes('35600000')) return '35600000';
  return candidates[0];
}

function requiredBodyChild(parentId){
  return state.project?.items.find(x=>x.type==='product' && x.parentItemId===parentId && x.componentRole!=='inspection-shaft') || null;
}

async function selectRequiredBody(parentId,sku){
  if(!state.project) return;
  const parent=state.project.items.find(x=>x.id===parentId && x.type==='product'); if(!parent) return;
  const p=getProduct(parent.sku); if(!p) return;
  const candidates=bodyCandidatesForProduct(p); const chosen=normalizeSku(sku);
  pushProjectHistory(`Change concealed part for ${parent.sku}`);
  state.project.items=state.project.items.filter(x=>!(x.parentItemId===parent.id && x.componentRole!=='inspection-shaft'));
  if(!chosen){ parent.concealedSuppressed=true; await touchProject(); renderProject(); return; }
  if(!candidates.includes(chosen)) return;
  parent.concealedSuppressed=false;
  const body=getProduct(chosen);
  if(body){
    const insertAt=state.project.items.findIndex(x=>x.id===parent.id)+1;
    state.project.items.splice(insertAt,0,{id:uid(),type:'product',sku:body.sku,qty:parent.qty||1,auto:true,componentRole:'required-body',parentItemId:parent.id,groupId:parent.id,validationOverride:false,note:'Selected concealed component'});
  }
  await touchProject(); renderProject();
}

async function selectInspectionShaft(parentId,sku){
  if(!state.project) return;
  const parent=state.project.items.find(x=>x.id===parentId && x.type==='product' && !x.auto); if(!parent) return;
  const p=getProduct(parent.sku); if(!p || !isWcActuationProduct(p)) return;
  const candidates=inspectionShaftCandidatesForProduct(p), chosen=normalizeSku(sku);
  pushProjectHistory(`Change inspection shaft for ${parent.sku}`);
  state.project.items=state.project.items.filter(x=>!(x.parentItemId===parent.id && x.componentRole==='inspection-shaft'));
  if(chosen && candidates.includes(chosen)){
    const shaft=getProduct(chosen);
    if(shaft){
      let insertAt=state.project.items.findIndex(x=>x.id===parent.id)+1;
      while(insertAt<state.project.items.length && state.project.items[insertAt].parentItemId===parent.id) insertAt++;
      state.project.items.splice(insertAt,0,{id:uid(),type:'product',sku:shaft.sku,qty:parent.qty||1,auto:true,componentRole:'inspection-shaft',parentItemId:parent.id,groupId:parent.id,validationOverride:false,note:'User-selected optional inspection shaft'});
    }
  }
  await touchProject(); renderProject();
}

async function ensureRequiredComponents(save=false){
  if(!state.project) return false;
  let changed=false;
  for(const parent of [...state.project.items]){
    if(parent.type!=='product' || parent.auto) continue;
    const p=getProduct(parent.sku); if(!p) continue;
    const candidates=bodyCandidatesForProduct(p); if(!candidates.length || parent.concealedSuppressed) continue;
    const child=requiredBodyChild(parent.id);
    if(child && candidates.includes(normalizeSku(child.sku))) continue;
    if(child){ state.project.items=state.project.items.filter(x=>x.id!==child.id); changed=true; }
    const preferred=preferredBodyCandidate(p,candidates); const body=getProduct(preferred);
    if(body){
      const at=state.project.items.findIndex(x=>x.id===parent.id)+1;
      state.project.items.splice(at,0,{id:uid(),type:'product',sku:body.sku,qty:parent.qty||1,auto:true,componentRole:'required-body',parentItemId:parent.id,groupId:parent.id,validationOverride:false,note:'Automatically added concealed component'});
      changed=true;
    }
  }
  if(changed && save) await touchProject();
  return changed;
}


// ---------- Phase 1 intelligence ----------
function roomGroupsFromItems(items=[]){
  const groups=[]; let current={id:'__selection__',title:'Selection',section:null,items:[]};
  for(const item of items){
    if(item.type==='section'){
      if(current.section||current.items.length)groups.push(current);
      current={id:item.id,title:item.title||'ROOM',section:item,items:[]};
    }else current.items.push(item);
  }
  if(current.section||current.items.length)groups.push(current);
  return groups;
}
function currentRoomGroup(){
  const groups=roomGroupsFromItems(state.project?.items||[]); return groups[groups.length-1]||null;
}
function isVisibleFinishProduct(p,item){
  if(!p||item?.auto)return false;
  const cat=normalizeText(p.category||''), finish=String(p.finish||'');
  if(/concealed|rough-in|rough in|installation system/.test(cat))return false;
  return RECOGNIZED_FINISHES.has(finish);
}
function dominantRoomFinish(group){
  const counts=new Map();
  for(const item of group?.items||[]){const p=getProduct(item.sku);if(!isVisibleFinishProduct(p,item))continue;counts.set(p.finish,(counts.get(p.finish)||0)+1);}
  const ranked=[...counts].sort((a,b)=>b[1]-a[1]);
  if(!ranked.length)return '';
  if(ranked.length>1&&ranked[0][1]===ranked[1][1])return '';
  return ranked[0][0];
}
function roomTargetFinish(group, optionFinish=''){
  return String(group?.section?.finish||optionFinish||dominantRoomFinish(group)||'');
}
function productOutletCapacity(p){
  const h=normalizeText([p?.outlets,p?.description,p?.function].join(' '));
  const nums=[];
  for(const re of [/\b([1-5])\s*(?:way|ways|outlet|outlets|valve|valves)\b/g,/\b([1-5])sc\b/g]){
    let m; while((m=re.exec(h))) nums.push(Number(m[1]));
  }
  if(nums.length) return Math.max(...nums);
  const cat=String(p?.category||'');
  if(cat==='Shower Mixer') return 1;
  // An exposed bath mixer normally contains the bath outlet and a shower outlet;
  // its one external shower connection should not be mistaken for a two-way
  // concealed diverter.
  if(cat==='Bath Mixer' && !/concealed|trimset|trim set|final installation|diverter/.test(h)) return 1;
  return 0;
}
function productSystemCapabilities(p){
  const category=String(p?.category||''), h=normalizeText([category,p?.description,p?.function,p?.mounting,p?.outlets].join(' '));
  const showerSystem=category==='Shower System';
  const showerMixer=category==='Shower Mixer';
  const bathMixer=category==='Bath Mixer';
  const capacity=productOutletCapacity(p);
  const multi=/diverter|[2-5]\s*(?:way|outlet|valve)|smartcontrol/.test(h) || capacity>1;
  const bathMention=/bath|filler|spout/.test(h);
  const concealed=/concealed|trimset|trim set|final installation|rough in|rough-in/.test(h);
  return {
    category,h,capacity,multi,concealed,showerSystem,showerMixer,bathMixer,
    showerControl:showerSystem||showerMixer||bathMixer,
    bathControl:bathMixer||(showerMixer&&multi&&bathMention),
    head:category==='Head Shower'||showerSystem,
    hand:category==='Hand Shower'||category==='Shower Set / Rail'||showerSystem,
    body:category==='Body Spray',
    bathSpout:category==='Bath Spout',
    hose:category==='Shower Hose'||/with shower hose|shower hose included/.test(h)||showerSystem||category==='Shower Set / Rail',
    arm:category==='Shower Accessory'&&/shower arm|ceiling connection|ceiling arm/.test(h)||category==='Head Shower'&&/head shower set|headshower set|with shower arm|ceiling/.test(h),
    handConnection:category==='Shower Accessory'&&/outlet elbow|wall union|shower union|holder with outlet|wall outlet/.test(h),
    integratedSystem:showerSystem,
    integratedBathOutlet:bathMixer&&!concealed
  };
}
function productAppearsToNeedRequiredComponent(p){
  if(!p) return false;
  if(p.compatibilityTag==='multi-component-required') return false;
  const category=normalizeText(p.category||''), h=normalizeText([p.description,p.mounting,p.function,p.fullText].join(' '));
  if(/concealed rough in|installation system/.test(category)) return false;
  if(/without concealed body|without roughing in|without roughing-in|requires rough(?:ing)?[- ]?in|for concealed valve|concealed (?:fitting|installation|mounting) box/.test(h)) return true;
  if(/final installation for|set for final installation for|trimset|trim set/.test(h) && !/with concealed body|rough[- ]?in \+ trim|roughing[- ]?in \+ trim|consisting of.*concealed body/.test(h)) return true;
  if(category==='bath mixer' && /\b[345][ -]?hole\b/.test(h)) return true;
  if(category==='basin mixer' && /\b2[ -]?hole\b/.test(h) && /wall mounted|wall mount/.test(h)) return true;
  // Only the mixer itself being floor/freestanding implies a floor rough-in.
  // Basin text such as "XL-Size for free-standing basins" must never trigger this.
  if(category==='bath mixer' && /freestanding|free standing|free-standing|floor mounted|floor-mounted/.test(h)) return true;
  return false;
}

function roomSystemTopology(group){
  const rows=(group?.items||[]).filter(x=>x.type==='product'&&!x.auto).map(item=>({item,p:getProduct(item.sku)})).filter(x=>x.p);
  const caps=rows.map(x=>({...x,c:productSystemCapabilities(x.p)}));
  const select=fn=>caps.filter(fn);
  return {
    rows,caps,
    showerControls:select(x=>x.c.showerControl),
    bathControls:select(x=>x.c.bathControl),
    head:select(x=>x.c.head&&!x.c.integratedSystem),
    hand:select(x=>x.c.hand&&!x.c.integratedSystem),
    body:select(x=>x.c.body),
    bathSpout:select(x=>x.c.bathSpout),
    hose:select(x=>x.c.hose),
    arm:select(x=>x.c.arm),
    handConnection:select(x=>x.c.handConnection),
    systems:select(x=>x.c.integratedSystem)
  };
}
function systemCompatibilityForRoom(group){
  const t=roomSystemTopology(group), conflicts=[],reviews=[];
  const hasShowerControl=t.showerControls.length>0||t.systems.length>0;
  const hasBathControl=t.bathControls.length>0;
  const showerOutputs=t.head.length+t.hand.length+t.body.length;

  if(t.bathSpout.length&&!hasBathControl){
    conflicts.push({item:t.bathSpout[0].item,text:'Bath spout is selected without a compatible bath/shower mixer or diverter control in this selection.'});
  }
  if(showerOutputs&&!hasShowerControl){
    const first=[...t.head,...t.hand,...t.body][0];
    conflicts.push({item:first?.item,text:'Shower outlet is selected without a shower mixer, thermostatic control or complete shower system.'});
  }

  // Compare selected outlet demand with controls whose outlet count is explicit or
  // safely inferable. Complete shower systems already contain their own routing.
  if(!t.systems.length && hasShowerControl){
    const externalNeeded=t.head.length+t.hand.length+t.bathSpout.length+(t.body.length?1:0);
    const controls=[...new Map(t.showerControls.map(x=>[x.item.id,x])).values()];
    const known=controls.filter(x=>x.c.capacity>0);
    const totalCapacity=known.reduce((n,x)=>n+x.c.capacity,0);
    if(externalNeeded>0 && known.length===controls.length && totalCapacity>0 && externalNeeded>totalCapacity){
      conflicts.push({item:controls[0]?.item,text:`${externalNeeded} outlet functions are selected, but the selected control configuration supports ${totalCapacity}. Add/change the diverter or reduce the outlets.`});
    }
  }

  // A control with nothing to control is usually an incomplete room selection,
  // but this remains Review rather than a hard incompatibility.
  if(t.showerControls.length&&!t.systems.length&&!showerOutputs&&!t.bathSpout.length){
    reviews.push({id:'control-without-outlet',text:'A shower/bath control is selected but no head shower, hand shower, body spray or bath spout is selected.'});
  }
  const concealedBath=t.bathControls.some(x=>x.c.bathMixer&&x.c.concealed);
  if(concealedBath&&!t.bathSpout.length&&!t.hand.length&&!t.head.length){
    reviews.push({id:'concealed-bath-without-outlet',text:'A concealed bath mixer/diverter is selected but no bath spout or shower outlet is selected.'});
  }
  return {topology:t,conflicts,reviews};
}

function completionRecommendationsForRoom(group){
  const system=systemCompatibilityForRoom(group), t=system.topology;
  const recs=[];
  const dismissed=new Set(group?.section?.dismissedCompletionSuggestions||[]);
  const add=(id,text)=>{if(!dismissed.has(id)&&!recs.some(x=>x.id===id))recs.push({id,text});};
  system.reviews.forEach(x=>add(x.id,x.text));
  const hasHead=t.head.length>0||t.systems.length>0;
  const hasHand=t.hand.length>0||t.systems.length>0;
  const hasControl=t.showerControls.length>0||t.systems.length>0;
  if(hasHead&&hasControl&&!hasHand)add('hand-shower','Head shower/control selected without a hand shower. Add one if the break specification requires a secondary shower outlet.');
  if(t.hand.length&&!t.hose.length){
    const standalone=t.hand.some(x=>x.p.category==='Hand Shower'&&!/set|hose|rail/.test(normalizeText(x.p.description||'')));
    if(standalone)add('shower-hose','Standalone hand shower selected without a shower hose or rail/set that includes one.');
  }
  if(t.hand.length&&!t.handConnection.length&&!t.systems.length){
    const concealedControl=t.showerControls.some(x=>x.c.concealed);
    const standalone=t.hand.some(x=>x.p.category==='Hand Shower'&&!/set|rail/.test(normalizeText(x.p.description||'')));
    if(concealedControl&&standalone)add('hand-shower-connection','Concealed shower control + standalone hand shower selected; check that a wall union / outlet elbow and holder are included.');
  }
  if(t.head.length&&!t.arm.length){
    const standalone=t.head.some(x=>!/set|arm|ceiling/.test(normalizeText(x.p.description||'')));
    if(standalone)add('head-shower-arm','Standalone head shower selected; check that a wall arm or ceiling connection is included.');
  }
  return recs;
}
function analyzeRoomGroup(group, optionFinish='', resolveFinishVariants=true){
  const requiredMissing=[],conflicts=[],unknown=[],finishMismatch=[],finishUnavailable=[];
  const itemMap=new Map((group?.items||[]).map(x=>[x.id,x]));
  const targetFinish=roomTargetFinish(group,optionFinish);
  for(const item of group?.items||[]){
    if(item.type!=='product')continue;
    const p=getProduct(item.sku);
    if(!p){unknown.push({item,text:`${item.sku} is not in the product master.`});continue;}
    if(item.auto){if(item.parentItemId&&!itemMap.has(item.parentItemId))conflicts.push({item,text:`${item.sku} has no parent product in this selection.`});continue;}
    const candidates=bodyCandidatesForProduct(p);
    const children=(group.items||[]).filter(x=>x.type==='product'&&x.parentItemId===item.id&&x.componentRole!=='inspection-shaft');
    if(candidates.length){
      const validChildren=children.filter(x=>candidates.includes(normalizeSku(x.sku)));
      const invalidChildren=children.filter(x=>!candidates.includes(normalizeSku(x.sku)));
      if(!validChildren.length){
        const removed=item.concealedSuppressed?' Required concealed part was manually removed.':'';
        requiredMissing.push({item,p,candidates,suppressed:!!item.concealedSuppressed,text:`${item.sku} requires ${candidates.join(' / ')}.${removed}`});
      }
      invalidChildren.forEach(child=>conflicts.push({item,child,text:`${item.sku} is connected to ${child.sku}, which is not a compatible required component.`}));
      if(validChildren.length>1)conflicts.push({item,text:`${item.sku} has more than one required concealed component selected.`});
    }else{
      if(productAppearsToNeedRequiredComponent(p)) conflicts.push({item,text:`${item.sku} appears to require a concealed / rough-in component, but no compatibility relationship is mapped. Review this SKU in Product Relationships.`});
      if(children.length) children.forEach(child=>conflicts.push({item,child,text:`${child.sku} is attached to ${item.sku}, but no required-component relationship exists for this product.`}));
    }
    if(targetFinish&&isVisibleFinishProduct(p,item)&&p.finish!==targetFinish&&!item.finishMismatchAcknowledged){
      const variant=resolveFinishVariants?finishVariantsForProduct(p).find(v=>v.finish===targetFinish):null;
      const row={item,p,targetFinish,variant,text:`${item.sku} is ${p.finish}; selection target is ${targetFinish}.`};
      finishMismatch.push(row); if(resolveFinishVariants&&!variant)finishUnavailable.push(row);
    }
  }
  const system=systemCompatibilityForRoom(group);
  system.conflicts.forEach(x=>conflicts.push(x));
  const recommendations=completionRecommendationsForRoom(group);
  const severity=(conflicts.length||requiredMissing.length||unknown.length)?'bad':(finishMismatch.length||recommendations.length)?'review':'good';
  return {group,targetFinish,requiredMissing,conflicts,unknown,finishMismatch,finishUnavailable,recommendations,severity,topology:system.topology};
}

function analyzeOption(option, resolveFinishVariants=false){
  const groups=roomGroupsFromItems(optionItems(option)), analyses=groups.map(g=>analyzeRoomGroup(g,option?.finish||'',resolveFinishVariants));
  const sum=k=>analyses.reduce((n,a)=>n+a[k].length,0);
  const conflicts=sum('conflicts')+sum('unknown'),required=sum('requiredMissing'),finish=sum('finishMismatch'),recommendations=sum('recommendations');
  return {groups,analyses,conflicts,required,finish,recommendations,severity:(conflicts||required)?'bad':(finish||recommendations)?'review':'good'};
}
function roomHealthLabel(analysis){
  if(analysis.severity==='bad')return `${analysis.conflicts.length+analysis.unknown.length+analysis.requiredMissing.length} issue${analysis.conflicts.length+analysis.unknown.length+analysis.requiredMissing.length===1?'':'s'}`;
  if(analysis.severity==='review')return `${analysis.finishMismatch.length+analysis.recommendations.length} review`;
  return 'Complete';
}
function phase1ProjectWarnings(){
  if(!state.project)return [];
  const option=activeSelectionOption(), analysis=analyzeOption(option), out=[];
  analysis.analyses.forEach(a=>{
    a.requiredMissing.forEach(x=>out.push({item:x.item,w:`Required component missing: ${x.text}`}));
    a.conflicts.forEach(x=>out.push({item:x.item,w:`Compatibility conflict: ${x.text}`}));
    a.unknown.forEach(x=>out.push({item:x.item,w:x.text}));
  });
  return out;
}
async function repairRoomRequiredComponents(sectionId){
  const room=sectionId==='__selection__'?roomGroupsFromItems(state.project?.items||[]).find(g=>g.id==='__selection__'):roomGroupsFromItems(state.project?.items||[]).find(g=>g.id===sectionId);
  if(!room)return;
  pushProjectHistory(`Repair required components in ${room.title}`);
  let changed=false;
  for(const item of room.items.filter(x=>x.type==='product'&&!x.auto)){
    const p=getProduct(item.sku);if(!p)continue;
    const candidates=bodyCandidatesForProduct(p);if(!candidates.length)continue;
    if(item.concealedSuppressed){item.concealedSuppressed=false;changed=true;}
    const children=state.project.items.filter(x=>x.parentItemId===item.id&&x.componentRole!=='inspection-shaft');
    const valid=children.find(x=>candidates.includes(normalizeSku(x.sku)));
    if(valid){
      const extras=children.filter(x=>x.id!==valid.id);
      if(extras.length){const ids=new Set(extras.map(x=>x.id));state.project.items=state.project.items.filter(x=>!ids.has(x.id));changed=true;}
      continue;
    }
    if(children.length){const ids=new Set(children.map(x=>x.id));state.project.items=state.project.items.filter(x=>!ids.has(x.id));changed=true;}
    const body=getProduct(preferredBodyCandidate(p,candidates));if(body){const at=state.project.items.findIndex(x=>x.id===item.id)+1;state.project.items.splice(at,0,{id:uid(),type:'product',sku:body.sku,qty:item.qty||1,auto:true,componentRole:'required-body',parentItemId:item.id,groupId:item.id,validationOverride:false,note:'Automatically added required component'});changed=true;}
  }
  if(changed){await touchProject();renderProject();toast('Required components repaired');}
}
async function acknowledgeFinishMismatch(itemId){
  const item=state.project?.items.find(x=>x.id===itemId);if(!item)return;pushProjectHistory(`Keep finish for ${item.sku}`);item.finishMismatchAcknowledged=true;await touchProject();renderProject();
}
async function dismissRoomRecommendations(sectionId){
  const group=roomGroupsFromItems(state.project?.items||[]).find(g=>g.id===sectionId);if(!group?.section)return;
  const recs=completionRecommendationsForRoom(group);if(!recs.length)return;pushProjectHistory(`Dismiss recommendations for ${group.title}`);
  group.section.dismissedCompletionSuggestions=[...new Set([...(group.section.dismissedCompletionSuggestions||[]),...recs.map(r=>r.id)])];await touchProject();renderProject();toast('Break recommendations dismissed');
}
async function restoreRoomRecommendations(sectionId){
  const section=state.project?.items.find(x=>x.id===sectionId&&x.type==='section');if(!section)return;pushProjectHistory(`Restore recommendations for ${section.title}`);section.dismissedCompletionSuggestions=[];await touchProject();renderProject();
}
function openRoomHealthPortal(sectionId,anchor){
  const group=roomGroupsFromItems(state.project?.items||[]).find(g=>g.id===sectionId);if(!group)return;
  const analysis=analyzeRoomGroup(group,activeSelectionOption()?.finish||'');
  let portal=$('itemMenuPortal');if(!portal)return;
  const rows=[];
  analysis.requiredMissing.forEach(x=>rows.push(`<div class="health-line bad"><b>Required</b><span>${esc(x.text)}</span></div>`));
  analysis.conflicts.forEach(x=>rows.push(`<div class="health-line bad"><b>Conflict</b><span>${esc(x.text)}</span></div>`));
  analysis.unknown.forEach(x=>rows.push(`<div class="health-line bad"><b>Unknown</b><span>${esc(x.text)}</span></div>`));
  analysis.finishMismatch.forEach(x=>rows.push(`<div class="health-line review"><b>Finish</b><span>${esc(x.text)}</span><div class="health-actions">${x.variant?`<button type="button" class="btn small" data-room-match-item="${x.item.id}" data-variant-sku="${esc(x.variant.sku)}">Match</button>`:''}<button type="button" class="btn small" data-keep-finish="${x.item.id}">Keep</button></div></div>`));
  analysis.recommendations.forEach(x=>rows.push(`<div class="health-line review"><b>Suggested</b><span>${esc(x.text)}</span></div>`));
  const t=analysis.topology||{}, systemPartCount=(t.showerControls?.length||0)+(t.bathControls?.length||0)+(t.systems?.length||0)+(t.head?.length||0)+(t.hand?.length||0)+(t.body?.length||0)+(t.bathSpout?.length||0);
  const systemSummary=systemPartCount?`<div class="system-topology-summary"><span>Controls <b>${new Set([...(t.showerControls||[]),...(t.bathControls||[]),...(t.systems||[])].map(x=>x.item.id)).size}</b></span><span>Head <b>${t.head?.length||0}</b></span><span>Hand <b>${t.hand?.length||0}</b></span><span>Body <b>${t.body?.length||0}</b></span><span>Bath spout <b>${t.bathSpout?.length||0}</b></span></div>`:'';
  const canRepair=analysis.requiredMissing.length||analysis.conflicts.some(x=>x.child);
  portal.innerHTML=`<div class="item-menu-title room-health-title"><span>${esc(group.title)}</span><span class="room-health-chip ${analysis.severity}">${esc(roomHealthLabel(analysis))}</span></div>
    ${analysis.targetFinish?`<div class="room-health-finish">Target finish: <strong>${esc(analysis.targetFinish)}</strong></div>`:''}${systemSummary}
    <div class="room-health-list">${rows.join('')||'<div class="health-line good"><b>✓</b><span>Required components, compatibility and finish are complete.</span></div>'}</div>
    <div class="room-health-footer">${canRepair?`<button type="button" class="item-menu-action" data-repair-room="${esc(sectionId)}">Repair required components</button>`:''}${analysis.finishMismatch.length?`<button type="button" class="item-menu-action" data-room-finish="${esc(sectionId)}">Change break finish…</button>`:''}${group.section&&analysis.recommendations.length?`<button type="button" class="item-menu-action" data-dismiss-room-recs="${esc(sectionId)}">Dismiss suggestions</button>`:''}${group.section?.dismissedCompletionSuggestions?.length?`<button type="button" class="item-menu-action" data-restore-room-recs="${esc(sectionId)}">Restore suggestions</button>`:''}</div>`;
  portal.classList.add('open');
  qsa('[data-repair-room]',portal).forEach(b=>b.onclick=()=>{closeItemMenuPortal();repairRoomRequiredComponents(b.dataset.repairRoom);});
  qsa('[data-room-match-item]',portal).forEach(b=>b.onclick=()=>{closeItemMenuPortal();replaceItemSku(b.dataset.roomMatchItem,b.dataset.variantSku);});
  qsa('[data-keep-finish]',portal).forEach(b=>b.onclick=()=>{closeItemMenuPortal();acknowledgeFinishMismatch(b.dataset.keepFinish);});
  qsa('[data-room-finish]',portal).forEach(b=>b.onclick=()=>{closeItemMenuPortal();openRoomFinishDialog(b.dataset.roomFinish);});
  qsa('[data-dismiss-room-recs]',portal).forEach(b=>b.onclick=()=>{closeItemMenuPortal();dismissRoomRecommendations(b.dataset.dismissRoomRecs);});
  qsa('[data-restore-room-recs]',portal).forEach(b=>b.onclick=()=>{closeItemMenuPortal();restoreRoomRecommendations(b.dataset.restoreRoomRecs);});
  const r=anchor.getBoundingClientRect(),margin=10;portal.style.visibility='hidden';portal.style.left='0px';portal.style.top='0px';
  requestAnimationFrame(()=>{const pr=portal.getBoundingClientRect();let left=Math.min(window.innerWidth-pr.width-margin,Math.max(margin,r.right-pr.width));let top=r.bottom+6;if(top+pr.height>window.innerHeight-margin)top=Math.max(margin,r.top-pr.height-6);portal.style.left=`${Math.round(left)}px`;portal.style.top=`${Math.round(top)}px`;portal.style.visibility='visible';});
}

let roomFinishTargetId='';
function openRoomFinishDialog(sectionId){
  const group=roomGroupsFromItems(state.project?.items||[]).find(g=>g.id===sectionId);if(!group)return;roomFinishTargetId=sectionId;
  const current=roomTargetFinish(group,activeSelectionOption()?.finish||'');
  $('roomFinishTarget').innerHTML=`<strong>${esc(group.title)}</strong><small>${group.items.filter(x=>x.type==='product'&&!x.auto).length} selected products</small>`;
  $('roomFinishSelect').innerHTML=projectFinishOptionsHtml(current);$('roomFinishSelect').value=current||'';updateRoomFinishPreview();$('roomFinishDialog').showModal();
}
function roomFinishPreviewData(group,target){
  let convertible=0,same=0,unavailable=0,ignored=0;
  for(const item of group.items.filter(x=>x.type==='product'&&!x.auto)){const p=getProduct(item.sku);if(!p||!isVisibleFinishProduct(p,item)){ignored++;continue;}if(!target||p.finish===target){same++;continue;}const match=finishVariantsForProduct(p).find(v=>v.finish===target);if(match)convertible++;else unavailable++;}
  return {convertible,same,unavailable,ignored};
}
function updateRoomFinishPreview(){
  const group=roomGroupsFromItems(state.project?.items||[]).find(g=>g.id===roomFinishTargetId);if(!group)return;const target=$('roomFinishSelect')?.value||'';const r=roomFinishPreviewData(group,target);
  $('roomFinishPreview').innerHTML=`<strong>${r.convertible}</strong> exact changes · <strong>${r.unavailable}</strong> need review · <strong>${r.same}</strong> already matching${r.ignored?` · ${r.ignored} technical/other ignored`:''}`;
}
async function applyRoomFinish(){
  const group=roomGroupsFromItems(state.project?.items||[]).find(g=>g.id===roomFinishTargetId);if(!group)return;const target=$('roomFinishSelect').value||'';
  pushProjectHistory(`Change ${group.title} finish to ${target||'Mixed'}`);let changed=0,unavailable=0;
  if(group.section) group.section.finish=target;
  else {const option=activeSelectionOption();if(option){option.finish=target;state.project.finish=target;}}
  if(target){for(const item of group.items.filter(x=>x.type==='product'&&!x.auto)){const p=getProduct(item.sku);if(!p||!isVisibleFinishProduct(p,item)||p.finish===target)continue;const match=finishVariantsForProduct(p).find(v=>v.finish===target);if(match){item.sku=match.sku;item.finishMismatchAcknowledged=false;item.concealedSuppressed=false;changed++;}else unavailable++;}}
  await ensureRequiredComponents(false);await touchProject();$('roomFinishDialog').close();renderProject();renderResults();toast(`${group.title}: ${changed} changed${unavailable?` · ${unavailable} need review`:''}`);
}

// ---------- Selection options ----------

  // ===== 40_options_variants.js =====
// ---------- Hidden catalogue items ----------
function updateHiddenItemsStatus(){
  const count=state.hiddenSkus.size;
  const status=$('settingsHiddenCount'); if(status) status.textContent=`${count.toLocaleString()} item${count===1?'':'s'}`;
}
async function persistHiddenSkus(){await setMeta('hiddenSkus',[...state.hiddenSkus].sort());}
function parseHiddenSkuInput(raw=''){
  return [...new Set(String(raw||'').split(/[\s,;|]+/).map(normalizeSku).filter(Boolean))];
}
function renderHiddenItemsDialog(){
  const list=$('hiddenItemsList'), summary=$('hiddenItemsSummary'); if(!list||!summary)return;
  const skus=[...state.hiddenSkus].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  summary.textContent=`${skus.length.toLocaleString()} hidden item${skus.length===1?'':'s'}`;
  list.innerHTML=skus.map(sku=>{const p=getProduct(sku);return `<div class="hidden-item-row"><div><strong>${esc(sku)}</strong><span>${esc(p?.description||p?.family||'Product')}</span></div><button type="button" class="btn small" data-unhide-sku="${esc(sku)}">Unhide</button></div>`;}).join('')||'<div class="db-empty">No products are hidden from search.</div>';
  qsa('[data-unhide-sku]',list).forEach(b=>b.onclick=()=>unhideSkuFromSearch(b.dataset.unhideSku));
  updateHiddenItemsStatus();
}
function openHiddenItemsDialog(){const input=$('hiddenItemsInput');if(input)input.value='';renderHiddenItemsDialog();$('hiddenItemsDialog')?.showModal();}
async function hideSkusFromSearch(){
  const input=$('hiddenItemsInput'); const requested=parseHiddenSkuInput(input?.value||'');
  if(!requested.length){toast('Paste at least one SKU to hide');input?.focus();return;}
  const valid=requested.filter(sku=>state.productMap.has(sku)); const missing=requested.filter(sku=>!state.productMap.has(sku));
  valid.forEach(sku=>state.hiddenSkus.add(sku));
  await persistHiddenSkus(); invalidateSearchCaches(); renderFilters(); renderHiddenItemsDialog(); if(input)input.value='';
  toast(`${valid.length} item${valid.length===1?'':'s'} hidden from search${missing.length?` · ${missing.length} SKU${missing.length===1?'':'s'} not found`:''}`);
}
async function unhideSkuFromSearch(sku){state.hiddenSkus.delete(normalizeSku(sku));await persistHiddenSkus();invalidateSearchCaches();renderFilters();renderHiddenItemsDialog();toast(`${normalizeSku(sku)} restored to search`);}
async function unhideAllSearchItems(){if(!state.hiddenSkus.size)return;state.hiddenSkus.clear();await persistHiddenSkus();invalidateSearchCaches();renderFilters();renderHiddenItemsDialog();toast('All hidden items restored to search');}

function optionStatusMeta(option){
  const a=analyzeOption(option);return {severity:a.severity,issues:a.conflicts+a.required,reviews:a.finish+a.recommendations};
}
function renderSelectionOptions(){
  const root=$('selectionTabs');
  if(!root) return;
  if(!state.project){
    root.innerHTML='<div class="selection-tab-shell active"><button type="button" class="selection-tab-btn" role="tab" aria-selected="true"><span>Selection</span></button></div><button type="button" class="selection-tab-add" disabled title="Create a project first">＋</button>';
    return;
  }
  ensureProjectOptions(state.project);
  const activeId=state.project.activeOptionId;
  const tabs=state.project.options.map(option=>{
    const active=option.id===activeId;
    return `<div class="selection-tab-shell ${active?'active':''}" data-option-shell="${esc(option.id)}"><button type="button" class="selection-tab-btn" data-option-tab="${esc(option.id)}" role="tab" aria-selected="${active?'true':'false'}" title="Double-click to rename"><span class="selection-tab-name" data-option-name="${esc(option.id)}">${esc(option.name||'Selection')}</span></button><button type="button" class="selection-tab-menu" data-option-menu="${esc(option.id)}" title="Selection options" aria-label="Selection options"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></button></div>`;
  }).join('');
  root.innerHTML=tabs+'<button type="button" class="selection-tab-add" id="btnAddSelectionTab" title="Add another selection" aria-label="Add another selection">＋</button>';
  qsa('[data-option-tab]',root).forEach(btn=>btn.onclick=e=>{e.preventDefault();switchSelectionOption(btn.dataset.optionTab);});
  qsa('[data-option-name]',root).forEach(label=>label.ondblclick=e=>{e.preventDefault();e.stopPropagation();startOptionInlineEdit(label.dataset.optionName,label);});
  qsa('[data-option-menu]',root).forEach(btn=>btn.onclick=e=>{e.preventDefault();e.stopPropagation();openOptionMenuPortal(btn.dataset.optionMenu,btn);});
  const add=$('btnAddSelectionTab'); if(add)add.onclick=e=>{e.preventDefault();e.stopPropagation();addSelectionOption('blank');};
  requestAnimationFrame(()=>root.querySelector('.selection-tab-shell.active')?.scrollIntoView({block:'nearest',inline:'nearest'}));
}

async function switchSelectionOption(id){
  if(!state.project)return;syncActiveOption(state.project);const target=state.project.options.find(o=>o.id===id);if(!target||target.id===state.project.activeOptionId)return;
  state.project.activeOptionId=target.id;state.project.items=target.items;state.project.finish=target.finish||'';resetProjectHistory();await touchProject();renderProject();renderResults();toast(`Opened ${target.name}`);
}
function createOptionPayload(name,items=[],finish=''){return {id:uid(),name,finish:String(finish||''),items,createdAt:new Date().toISOString()};}
async function addSelectionOption(mode='blank'){
  if(!state.project)return;const current=activeSelectionOption();pushProjectHistory(mode==='duplicate'?'Duplicate selection':'Add selection');
  let items=[],finish='';
  if(mode==='duplicate'){items=cloneItemsWithFreshIds(current.items);finish=current.finish||'';}
  if(mode==='room'){
    const group=currentRoomGroup();if(group){const raw=group.section?[group.section,...group.items]:group.items;items=cloneItemsWithFreshIds(raw);finish=group.section?.finish||current.finish||'';}
  }
  const option=createOptionPayload(nextOptionName(state.project),items,finish);state.project.options.push(option);syncActiveOption(state.project);state.project.activeOptionId=option.id;state.project.items=option.items;state.project.finish=option.finish;await touchProject();renderProject();renderResults();toast(`${option.name} created`);
}
async function duplicateSelectionOption(id){
  if(!state.project)return;const src=state.project.options.find(o=>o.id===id);if(!src)return;pushProjectHistory(`Duplicate ${src.name}`);const option=createOptionPayload(`${src.name} Copy`,cloneItemsWithFreshIds(src.items),src.finish||'');state.project.options.push(option);state.project.activeOptionId=option.id;state.project.items=option.items;state.project.finish=option.finish;await touchProject();renderProject();renderResults();toast(`${src.name} duplicated`);
}
async function clearSelectionOption(id){
  const option=state.project?.options.find(o=>o.id===id);if(!option||!confirm(`Clear all breaks and products from "${option.name}"?`))return;pushProjectHistory(`Clear ${option.name}`);option.items=[];if(state.project.activeOptionId===id)state.project.items=option.items;await touchProject();renderProject();renderResults();
}
async function deleteSelectionOption(id){
  if(!state.project||state.project.options.length<=1){toast('A project must keep at least one selection');return;}const option=state.project.options.find(o=>o.id===id);if(!option||!confirm(`Delete selection "${option.name}"?`))return;
  pushProjectHistory(`Delete ${option.name}`);const idx=state.project.options.findIndex(o=>o.id===id);state.project.options.splice(idx,1);if(state.project.activeOptionId===id){const next=state.project.options[Math.min(idx,state.project.options.length-1)];state.project.activeOptionId=next.id;state.project.items=next.items;state.project.finish=next.finish||'';}await touchProject();renderProject();renderResults();
}
async function renameSelectionOption(id,name){
  const option=state.project?.options.find(o=>o.id===id);const value=String(name||'').trim();if(!option||!value||value===option.name)return;pushProjectHistory(`Rename ${option.name}`);option.name=value;await touchProject();renderSelectionOptions();
}
function startOptionInlineEdit(id,label){
  const option=state.project?.options.find(o=>o.id===id);if(!option)return;const input=document.createElement('input');input.className='option-name-editor';input.value=option.name;label.replaceWith(input);input.focus();input.select();let done=false;
  const finish=async save=>{if(done)return;done=true;if(save&&input.value.trim()&&input.value.trim()!==option.name){await renameSelectionOption(id,input.value);return;}renderSelectionOptions();};
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();finish(false);}});input.addEventListener('blur',()=>finish(true));
}
function openOptionMenuPortal(id,anchor){
  const option=state.project?.options.find(o=>o.id===id);if(!option)return;let portal=$('itemMenuPortal');if(!portal)return;
  const switchRows=(state.project?.options||[]).filter(o=>o.id!==id).map(o=>`<button type="button" class="item-menu-action selection-switch-action" data-option-switch-menu="${o.id}">Open ${esc(o.name)}</button>`).join('');
  portal.innerHTML=`<div class="item-menu-title">${esc(option.name)}</div>${switchRows?`<div class="item-menu-section-label">Other selections</div>${switchRows}<div class="item-menu-divider"></div>`:''}<button type="button" class="item-menu-action" data-option-rename="${id}">Rename selection…</button><button type="button" class="item-menu-action" data-option-duplicate="${id}">Duplicate selection</button><button type="button" class="item-menu-action" data-option-finish="${id}">Change selection finish…</button><div class="item-menu-divider"></div><button type="button" class="item-menu-action" data-option-clear="${id}">Clear selection</button>${state.project.options.length>1?`<button type="button" class="item-menu-action danger-text" data-option-delete="${id}">Delete selection</button>`:''}`;portal.classList.add('open');
  qsa('[data-option-switch-menu]',portal).forEach(b=>b.onclick=()=>{const target=b.dataset.optionSwitchMenu;closeItemMenuPortal();switchSelectionOption(target);});
  qsa('[data-option-rename]',portal).forEach(b=>b.onclick=()=>{closeItemMenuPortal();const name=prompt('Selection name:',option.name);if(name!==null)renameSelectionOption(id,name);});
  qsa('[data-option-duplicate]',portal).forEach(b=>b.onclick=()=>{closeItemMenuPortal();duplicateSelectionOption(id);});
  qsa('[data-option-finish]',portal).forEach(b=>b.onclick=async()=>{closeItemMenuPortal();await switchSelectionOption(id);openProjectFinishDialog(state.project.id);});
  qsa('[data-option-clear]',portal).forEach(b=>b.onclick=()=>{closeItemMenuPortal();clearSelectionOption(id);});qsa('[data-option-delete]',portal).forEach(b=>b.onclick=()=>{closeItemMenuPortal();deleteSelectionOption(id);});
  const r=anchor.getBoundingClientRect(),margin=10;portal.style.visibility='hidden';portal.style.left='0px';portal.style.top='0px';requestAnimationFrame(()=>{const pr=portal.getBoundingClientRect();let left=Math.min(window.innerWidth-pr.width-margin,Math.max(margin,r.right-pr.width));let top=r.bottom+6;if(top+pr.height>window.innerHeight-margin)top=Math.max(margin,r.top-pr.height-6);portal.style.left=`${Math.round(left)}px`;portal.style.top=`${Math.round(top)}px`;portal.style.visibility='visible';});
}

function bodyChoiceHtml(item,p){
  if(item.auto) return '';
  const blocks=[];
  const candidates=bodyCandidatesForProduct(p);
  if(candidates.length){
    const child=requiredBodyChild(item.id); const current=normalizeSku(child?.sku||'');
    const opts=candidates.map(sku=>{
      const body=getProduct(sku); const label=body?.description||'Concealed body';
      const recommended=candidates.length===1?' — required':'';
      return `<option value="${esc(sku)}" ${current===sku?'selected':''}>${esc(sku)} — ${esc(label)}${recommended}</option>`;
    }).join('');
    const none=`<option value="" ${!current?'selected':''}>No concealed part (manual override)</option>`;
    const addAgain=!current?`<button type="button" class="add-required-body-btn" data-add-required-body="${item.id}" data-default-body="${esc(candidates[0]||'')}">+ Add concealed part</button>`:'';
    blocks.push(`<label class="body-choice required-body-choice"><span>Concealed part</span><div class="required-body-control"><select data-body-choice="${item.id}" aria-label="Select concealed part for ${esc(item.sku)}">${none}${opts}</select>${addAgain}</div></label>`);
  }
  const shafts=inspectionShaftCandidatesForProduct(p);
  if(shafts.length){
    const child=inspectionShaftChild(item.id), current=normalizeSku(child?.sku||'');
    const compact=normalizeSku([p.description,p.fullText].join(' '));
    const opts=shafts.map(sku=>{const q=getProduct(sku);const recommended=compact.includes(sku)?' — recommended':'';return `<option value="${esc(sku)}" ${current===sku?'selected':''}>${esc(sku)} — ${esc(q?.description||'Inspection shaft')}${recommended}</option>`;}).join('');
    blocks.push(`<label class="body-choice inspection-choice"><span>Inspection shaft (optional)</span><select data-inspection-shaft-choice="${item.id}"><option value="" ${!current?'selected':''}>No inspection shaft</option>${opts}</select></label>`);
  }
  return blocks.join('');
}

function skuFinishIdentity(sku=''){
  const key=normalizeSku(sku);
  let m=key.match(/^(.*?)(AL|GN|DL|DC|GL|DA|KF|A0|SD|MS|MG|LS|KS)([0-9A-Z]{1,2})$/i);
  if(m) return {base:m[1],code:m[2].toUpperCase(),revision:m[3]};
  m=key.match(/^(.*?)(243)([0-9A-Z])$/i);
  if(m) return {base:m[1],code:'243',revision:m[3]};
  m=key.match(/^(.*?)(00)([0-9A-Z]{1,2})$/i);
  if(m && m[1].length>=4) return {base:m[1],code:'00',revision:m[3]};
  if(key.length>=9) return {base:key.slice(0,-4),code:key.slice(-4,-2),revision:key.slice(-2)};
  if(key.length>=7) return {base:key.slice(0,-3),code:key.slice(-3,-1),revision:key.slice(-1)};
  return {base:key,code:'',revision:''};
}
function finishVariantBase(sku=''){ return skuFinishIdentity(sku).base; }
function variantDescriptionCore(p, ignoreSize=false){
  let s=normalizeText(p?.description||'');
  const finishTerms=[...Object.keys(FINISH_CODES),'matte black','phantom black','chrome','supersteel'].map(normalizeText).sort((a,b)=>b.length-a.length);
  for(const term of finishTerms) if(term) s=s.replace(new RegExp(`\\b${term.replace(/ /g,'\\s+')}\\b`,'g'),' ');
  if(ignoreSize){
    s=s.replace(/\b(xs|s|m|l|xl)\s*size\b/g,' ')
       .replace(/\b(extra small|small|medium|large|extra large)\b/g,' ')
       .replace(/\bprojection\s*\d+(?:\.\d+)?\s*mm\b/g,' ')
       .replace(/\b\d+(?:\.\d+)?\s*mm\s*projection\b/g,' ');
  }
  return s.replace(/\s+/g,' ').trim();
}
function finishVariantSignature(p){
  return [normalizeText(p?.family||''),normalizeText(p?.category||''),variantMountClass(p),variantKind(p),String(p?.size||'').toUpperCase(),variantDescriptionCore(p,false)].join('|');
}
function finishVariantsForProduct(p){
  if(!p?.sku) return [];
  const currentFinish=String(p.finish||''), base=finishVariantBase(p.sku), sig=finishVariantSignature(p);
  const candidates=state.products.filter(q=>{
    if(q.sku===p.sku || !q.finish || q.finish==='No colour / technical' || q.finish===currentFinish) return false;
    const sameSkuFamily=finishVariantBase(q.sku)===base;
    const sameSemantic=finishVariantSignature(q)===sig;
    return sameSkuFamily || sameSemantic;
  });
  const seen=new Set(), out=[];
  for(const q of candidates.sort((a,b)=>{
    const aSame=finishVariantBase(a.sku)===base?0:1,bSame=finishVariantBase(b.sku)===base?0:1;
    return aSame-bSame || String(a.finish).localeCompare(String(b.finish),undefined,{sensitivity:'base'}) || a.sku.localeCompare(b.sku);
  })){
    const code=productFinishCode(q)||q.finish, k=normalizeText(code);
    if(seen.has(k)) continue; seen.add(k); out.push(q);
  }
  return out;
}

function variantMountClass(p){
  const h=normalizeText([p?.mounting,p?.description].join(' '));
  if(/wall mounted|wall mount/.test(h)) return 'wall';
  if(/free standing|freestanding|floor mounted|floor mount/.test(h)) return 'free';
  if(/deck mounted|deck mount/.test(h)) return 'deck';
  if(/concealed|trimset|trim set/.test(h)) return 'concealed';
  return 'standard';
}
function variantKind(p){
  const h=normalizeText([p?.category,p?.description,p?.function].join(' '));
  if(/basin/.test(h)){
    if(/2 hole/.test(h)) return 'basin-2-hole';
    if(/3 hole/.test(h)) return 'basin-3-hole';
    if(/single lever|ohm/.test(h)) return 'basin-single-lever';
    return 'basin';
  }
  if(/bath/.test(h)){
    if(/3 hole/.test(h)) return 'bath-3-hole';
    if(/4 hole/.test(h)) return 'bath-4-hole';
    if(/5 hole/.test(h)) return 'bath-5-hole';
    if(/single lever|ohm/.test(h)) return 'bath-single-lever';
    return 'bath';
  }
  if(/shower/.test(h) && /mixer/.test(h)) return /thermost/.test(h)?'shower-thermostat':'shower-mixer';
  return normalizeText(p?.category||'product');
}
const SIZE_ORDER={XS:1,S:2,M:3,L:4,XL:5};
function productVariantSize(p){
  const direct=String(p?.size||'').toUpperCase().trim(); if(SIZE_ORDER[direct]) return direct;
  const m=String(p?.description||'').match(/\b(XS|S|M|L|XL)[ -]?Size\b/i); return m?m[1].toUpperCase():'';
}
function variantTokens(p){
  const stop=new Set(['grohe','mixer','single','lever','ohm','size','mounted','mount','with','without','for','final','installation','body','concealed','the','and','of','to','in']);
  return new Set(variantDescriptionCore(p,true).split(/\s+/).filter(x=>x.length>1&&!stop.has(x)&&!/^\d+$/.test(x)));
}
function tokenSimilarity(a,b){
  const A=variantTokens(a),B=variantTokens(b); if(!A.size||!B.size) return 0;
  let hit=0; for(const t of A) if(B.has(t)) hit++;
  return hit/Math.max(A.size,B.size);
}
function sizeVariantsForProduct(p){
  if(!p?.sku) return [];
  const currentSize=productVariantSize(p); if(!SIZE_ORDER[currentSize]) return [];
  const family=normalizeText(p.family||''), category=normalizeText(p.category||''), finish=normalizeText(p.finish||''), mount=variantMountClass(p), kind=variantKind(p);
  const matches=[];
  for(const q of state.products){
    const qs=productVariantSize(q); if(q.sku===p.sku || !SIZE_ORDER[qs] || qs===currentSize) continue;
    if(normalizeText(q.family||'')!==family || normalizeText(q.category||'')!==category || normalizeText(q.finish||'')!==finish) continue;
    if(variantMountClass(q)!==mount || variantKind(q)!==kind) continue;
    let score=tokenSimilarity(p,q);
    if(variantDescriptionCore(p,true)===variantDescriptionCore(q,true)) score+=1;
    const pBodies=(p.requiredBodies||[]).join('|'),qBodies=(q.requiredBodies||[]).join('|'); if(pBodies&&pBodies===qBodies) score+=.2;
    if(score>=.55) matches.push({q,score});
  }
  const bySize=new Map();
  for(const row of matches.sort((a,b)=>b.score-a.score||a.q.sku.localeCompare(b.q.sku))){
    const s=productVariantSize(row.q); if(!bySize.has(s)) bySize.set(s,row.q);
  }
  return [...bySize.values()].sort((a,b)=>SIZE_ORDER[productVariantSize(a)]-SIZE_ORDER[productVariantSize(b)]);
}

function itemMenuContentHtml(item,p){
  if(item.auto) return `<div class="item-menu-title">Item options</div><button type="button" class="item-menu-action" data-replace-item="${item.id}">Edit code / SKU…</button><button type="button" class="item-menu-action danger-text" data-delete-item="${item.id}">Remove item</button>`;
  const finishes=finishVariantsForProduct(p), sizes=sizeVariantsForProduct(p);
  const finishChoices=(action)=>finishes.map(v=>`<button type="button" class="item-choice" ${action}="${item.id}" data-variant-sku="${esc(v.sku)}"><span class="variant-finish">${finishSwatchHtml(v.finish)}<b>${esc(v.finish)}</b></span><small>${esc(productFinishCode(v)||v.sku)}</small></button>`).join('');
  const sizeChoices=sizes.map(v=>`<button type="button" class="item-choice" data-change-size="${item.id}" data-variant-sku="${esc(v.sku)}"><span><b>${esc(productVariantSize(v))}${variantMountClass(p)==='wall'?' length':''}</b><em>${esc(v.description)}</em></span><small>${esc(v.sku)}</small></button>`).join('');
  return `<div class="item-menu-title">Item options</div>
    <details class="item-menu-group"><summary>Duplicate in another finish <span>›</span></summary><div class="item-submenu">${finishes.length?finishChoices('data-duplicate-variant'):'<small>No other finishes found</small>'}</div></details>
    <details class="item-menu-group"><summary>Change current finish <span>›</span></summary><div class="item-submenu">${finishes.length?finishChoices('data-change-finish'):'<small>No other finishes found</small>'}</div></details>
    <details class="item-menu-group"><summary>Change size / length <span>›</span></summary><div class="item-submenu">${sizes.length?sizeChoices:'<small>No size variants found</small>'}</div></details>
    <div class="item-menu-divider"></div><button type="button" class="item-menu-action" data-replace-item="${item.id}">Edit code / SKU…</button><button type="button" class="item-menu-action danger-text" data-delete-item="${item.id}">Remove item</button>`;
}
function itemActionsMenuHtml(item,p){
  return `<button type="button" class="item-menu-button" data-open-item-menu="${item.id}" title="Item options" aria-label="Item options"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></button><button type="button" class="quick-remove-item" data-delete-item="${item.id}" title="Remove ${esc(item.sku||'item')}" aria-label="Remove item">×</button>`;
}
function closeItemMenuPortal(){ const portal=$('itemMenuPortal'); if(portal){portal.classList.remove('open');portal.innerHTML='';} }
function wireItemMenuPortal(portal){
  qsa('[data-duplicate-variant]',portal).forEach(b=>b.onclick=e=>{e.preventDefault();closeItemMenuPortal();duplicateItemAsVariant(b.dataset.duplicateVariant,b.dataset.variantSku);});
  qsa('[data-change-finish]',portal).forEach(b=>b.onclick=e=>{e.preventDefault();closeItemMenuPortal();replaceItemSku(b.dataset.changeFinish,b.dataset.variantSku);});
  qsa('[data-change-size]',portal).forEach(b=>b.onclick=e=>{e.preventDefault();closeItemMenuPortal();replaceItemSku(b.dataset.changeSize,b.dataset.variantSku);});
  qsa('[data-replace-item]',portal).forEach(b=>b.onclick=()=>{const id=b.dataset.replaceItem;closeItemMenuPortal();openReplaceDialog(id);});
  qsa('[data-delete-item]',portal).forEach(b=>b.onclick=()=>{const id=b.dataset.deleteItem;closeItemMenuPortal();deleteSequenceItem(id);});
}
function openItemMenuPortal(itemId,anchor){
  let portal=$('itemMenuPortal'); if(!portal){portal=document.createElement('div');portal.id='itemMenuPortal';portal.className='item-menu-portal';document.body.appendChild(portal);}
  const item=state.project?.items.find(x=>x.id===itemId&&x.type==='product'); if(!item) return;
  const p=getProduct(item.sku)||normalizeProduct({sku:item.sku,description:'Unknown SKU'});
  portal.innerHTML=itemMenuContentHtml(item,p); portal.classList.add('open'); wireItemMenuPortal(portal);
  const r=anchor.getBoundingClientRect(), margin=10;
  portal.style.visibility='hidden'; portal.style.left='0px'; portal.style.top='0px';
  requestAnimationFrame(()=>{
    const pr=portal.getBoundingClientRect();
    let left=Math.min(window.innerWidth-pr.width-margin,Math.max(margin,r.right-pr.width));
    let top=r.bottom+6;
    if(top+pr.height>window.innerHeight-margin) top=Math.max(margin,r.top-pr.height-6);
    portal.style.left=`${Math.round(left)}px`; portal.style.top=`${Math.round(top)}px`; portal.style.visibility='visible';
  });
}
function buildProjectProductBlock(sku){
  const p=getProduct(sku); if(!p) return [];
  const parent={id:uid(),type:'product',sku:p.sku,qty:1,auto:false,parentItemId:null,groupId:null,validationOverride:false,concealedSuppressed:false,note:''}; parent.groupId=parent.id;
  const block=[parent], candidates=bodyCandidatesForProduct(p);
  if(candidates.length){
    const bodySku=preferredBodyCandidate(p,candidates), body=getProduct(bodySku);
    if(body) block.push({id:uid(),type:'product',sku:body.sku,qty:parent.qty||1,auto:true,componentRole:'required-body',parentItemId:parent.id,groupId:parent.id,validationOverride:false,note:'Automatically added concealed component'});
  }
  return block;
}
async function duplicateItemAsVariant(itemId,sku){
  if(!state.project) return;
  const source=state.project.items.find(x=>x.id===itemId && x.type==='product' && !x.auto), p=getProduct(sku); if(!source||!p) return;
  pushProjectHistory(`Duplicate ${source.sku} as ${p.finish||p.sku}`);
  let insertAt=state.project.items.findIndex(x=>x.id===source.id)+1;
  while(insertAt<state.project.items.length && state.project.items[insertAt].parentItemId===source.id) insertAt++;
  const block=buildProjectProductBlock(p.sku); state.project.items.splice(insertAt,0,...block);
  await touchProject(); await rememberRecentProduct(p.sku); renderProject(); renderResults(); toast(`${p.sku} added in ${p.finish||'another finish'}`);
}

  // ===== 50_selection_projects.js =====
async function addSelectionBatch(entries=[], opts={}){
  if(!state.project){ openProjectDialog('new'); toast('Create a project first'); return {ok:false,reason:'no-project'}; }
  const clean=(entries||[]).map(e=>typeof e==='string'?{sku:e,qty:1}:e).map(e=>({sku:normalizeSku(e?.sku||''),qty:Math.max(1,Math.round(Number(e?.qty||1)))})).filter(e=>e.sku&&getProduct(e.sku));
  if(!clean.length){ toast('No valid products to add'); return {ok:false,reason:'empty'}; }
  pushProjectHistory(opts.label||`Add ${clean.length} products`);
  const added=[];
  for(const entry of clean){
    const p=getProduct(entry.sku); if(!p) continue;
    const parent={id:uid(),type:'product',sku:p.sku,qty:entry.qty,auto:false,parentItemId:null,groupId:null,validationOverride:false,concealedSuppressed:false,note:opts.note||'Added from AI Selection Assistant'}; parent.groupId=parent.id;
    state.project.items.push(parent); added.push(p.sku);
    if(opts.autoRequired!==false){
      const candidates=bodyCandidatesForProduct(p);
      if(candidates.length){const bodySku=preferredBodyCandidate(p,candidates),body=getProduct(bodySku);if(body)state.project.items.push({id:uid(),type:'product',sku:body.sku,qty:entry.qty,auto:true,componentRole:'required-body',parentItemId:parent.id,groupId:parent.id,validationOverride:false,note:'Automatically added concealed component'});}
    }
    await rememberRecentProduct(p.sku);
  }
  await touchProject(); renderProject(); renderResults(); toast(`${added.length} product${added.length===1?'':'s'} added from AI Build`);
  return {ok:true,added};
}

async function addSkuToProject(sku, opts={}){
  if(!state.project){ openProjectDialog('new'); toast('Create a project first'); return; }
  const p=getProduct(sku); if(!p){ toast('SKU not found in master database'); return; }
  pushProjectHistory(`Add ${p.sku}`);
  const parent={id:uid(),type:'product',sku:p.sku,qty:1,auto:!!opts.auto,parentItemId:opts.parentItemId||null,groupId:opts.groupId||null,validationOverride:false,concealedSuppressed:false,note:''};
  if(!parent.groupId) parent.groupId=parent.id;
  state.project.items.push(parent);
  if(!parent.auto){
    const candidates=bodyCandidatesForProduct(p);
    if(candidates.length){
      const bodySku=preferredBodyCandidate(p,candidates); const body=getProduct(bodySku);
      if(body) state.project.items.push({id:uid(),type:'product',sku:body.sku,qty:parent.qty||1,auto:true,componentRole:'required-body',parentItemId:parent.id,groupId:parent.id,validationOverride:false,note:'Automatically added concealed component'});
    }
  }
  await touchProject();
  await rememberRecentProduct(p.sku);
  try{window.GROHEAIBrainLearnSearch?.($('smartSearch')?.value||'',publicProduct(p));}catch{}
  const scrollTop=$('resultsList')?.scrollTop||0;
  renderProject();
  renderResults();
  requestAnimationFrame(()=>{if($('resultsList'))$('resultsList').scrollTop=scrollTop;});
  toast(`${p.sku} added${bodyCandidatesForProduct(p).length?' with concealed part':''}`);
}

async function touchProject(){
  if(!state.project) return;
  syncActiveOption(state.project);
  state.project.updatedAt=new Date().toISOString();
  await idbPut(STORE_PROJECTS,state.project);
  await idbPut(STORE_META,{key:'lastProjectId',value:state.project.id});
  const idx=state.projects.findIndex(p=>p.id===state.project.id);
  if(idx>=0) state.projects[idx]=structuredClone(state.project); else state.projects.unshift(structuredClone(state.project));
}

function updateWorkspaceSummary(){
  const items=state.project?.items||[];
  const selected=items.filter(x=>x.type==='product'&&!x.auto).length;
  const concealed=items.filter(x=>x.type==='product'&&x.auto&&x.componentRole!=='inspection-shaft').length;
  const warnings=state.project?projectWarnings():[];
  const score=selected?Math.max(0,Math.round((1-Math.min(1,warnings.length/Math.max(1,selected)))*100)):100;
  if($('summarySelectedCount')) $('summarySelectedCount').textContent=String(selected);
  if($('summaryConcealedCount')) $('summaryConcealedCount').textContent=String(concealed);
  if($('summaryCompleteness')) $('summaryCompleteness').textContent=`${score}%`;
}

function renderProject(){
  const p=state.project;
  if(!p){
    $('projectName').textContent='No project open'; $('projectMeta').textContent='Create a project to start selecting products.'; $('projectSavedBadge').textContent='Not saved'; $('projectSavedBadge').className='status-chip muted';
    renderSelectionOptions(); updateWorkspaceSummary(); renderSequence(); renderValidation(); renderFilters(); return;
  }
  ensureProjectOptions(p);
  $('projectName').textContent=p.name;
  const parts=[]; const activeOption=activeSelectionOption(p); if(activeOption)parts.push(activeOption.name); if(p.customer) parts.push(p.customer); if(p.date) parts.push(p.date); if(p.finish) parts.push(`${p.finish} (${finishCode(p.finish)})`); else parts.push('Mixed finish');
  $('projectMeta').textContent=parts.join(' · ');
  $('projectSavedBadge').textContent='Saved locally'; $('projectSavedBadge').className='status-chip good';
  ensureRequiredComponents(false).then(async changed=>{
    if(changed){
      await touchProject();
      // The compatibility pass is asynchronous. Refresh the visible Selection rows
      // after it inserts/replaces an auto child so the concealed part and dropdown
      // never appear one render behind the actual project data.
      renderSelectionOptions(); updateWorkspaceSummary(); renderSequence(); renderValidation();
    }
  });
  renderSelectionOptions(); updateWorkspaceSummary(); renderSequence(); renderValidation(); renderFilters();
}

function renderValidation(){
  const count=state.project?state.project.items.filter(x=>x.type==='product').length:0;
  const warnings=projectWarnings();
  const warningItems=new Set(warnings.map(x=>x.item.id)).size;
  const valid=Math.max(0,count-warningItems);
  $('validationBox').innerHTML=`<div class="validation-title">Project Validation</div><div class="validation-stats"><strong>${count}</strong> products · <span class="ok">${valid} valid</span> · <span class="warn">${warnings.length} warning${warnings.length===1?'':'s'}</span></div>`;
}

function parentSku(item){
  if(!item.parentItemId||!state.project) return '';
  return state.project.items.find(x=>x.id===item.parentItemId)?.sku||'';
}

function renderSequence(){
  const root=$('sequenceList'), empty=$('sequenceEmpty');
  if(!state.project || !state.project.items.length){ root.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display='none';
  const option=activeSelectionOption();
  const selectionGroups=roomGroupsFromItems(state.project.items);
  const roomAnalyses=new Map(selectionGroups.filter(g=>g.section).map(g=>[g.id,analyzeRoomGroup(g,option?.finish||'',false)]));
  const implicitGroup=selectionGroups.find(g=>g.id==='__selection__');
  const implicitHealth=implicitGroup?.items?.length?analyzeRoomGroup(implicitGroup,option?.finish||'',false):null;
  const implicitItemCount=implicitGroup?.items?.filter(x=>x.type==='product'&&!x.auto).length||0;
  const implicitHealthHtml='';
  const selectionIssueBtn=$('btnSelectionIssuesTop');
  if(selectionIssueBtn){
    if(implicitHealth && implicitHealth.severity!=='good'){ selectionIssueBtn.hidden=false; selectionIssueBtn.textContent=roomHealthLabel(implicitHealth); selectionIssueBtn.className=`selection-issue-top ${implicitHealth.severity}`; selectionIssueBtn.onclick=()=>openRoomHealthPortal('__selection__', selectionIssueBtn); }
    else { selectionIssueBtn.hidden=true; selectionIssueBtn.onclick=null; }
  }
  const warningItemIds=new Set(projectWarnings().map(x=>x.item?.id).filter(Boolean));
  root.innerHTML=implicitHealthHtml+state.project.items.map((item,idx)=>{
    if(item.type==='section'){const health=roomAnalyses.get(item.id);const finish=item.finish||'';return `<div class="section-row" data-item-id="${item.id}"><span class="drag-handle" draggable="true" data-drag-item="${item.id}" title="Drag to reorder">⋮⋮</span><div class="section-title"><span class="room-name-label" data-room-name="${item.id}" title="Double-click to edit break name">${esc(item.title)}</span>${finish?`<small class="room-finish-label">${esc(finish)}</small>`:''}</div>${health?`<button type="button" class="room-health-button ${health.severity}" data-room-health="${item.id}" title="Break completeness and compatibility">${health.severity==='good'?'✓':'!'} <span>${esc(roomHealthLabel(health))}</span></button>`:''}<button type="button" class="room-menu-button" data-open-room-menu="${item.id}" title="Break options" aria-label="Break options"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></button></div>`;}
    const p=getProduct(item.sku) || normalizeProduct({sku:item.sku,description:'Unknown SKU',category:'Other'});
    return `<div class="sequence-row ${item.auto?'auto-child':''} ${warningItemIds.has(item.id)?'has-warning':''}" data-item-id="${item.id}" data-item-sku="${esc(item.sku)}">
      <div class="drag-handle" draggable="true" data-drag-item="${item.id}" title="Drag to reorder">⋮⋮</div>${imageHtml(item.sku,'seq-img')}
      <div class="seq-main"><div class="seq-title"><span class="seq-sku editable-sku" data-edit-item-code="${item.id}" title="Double-click to edit code / SKU">${esc(item.sku)}</span>${isPrunedProduct(p)?'<span class="pruned-badge">PRUNED</span>':''}${isSpaProduct(p)?'<span class="spa-badge">SPA</span>':''}${item.auto?`<span class="status-chip auto ${item.componentRole==='inspection-shaft'?'shaft':''}">${item.componentRole==='inspection-shaft'?'SHAFT':'CONCEALED'}</span>`:''}${p.status&&p.status!=='Active'&&p.status!=='Legacy Catalogue'&&!isPrunedProduct(p)?`<span class="status-chip warning">${esc(p.status)}</span>`:''}</div><div class="seq-desc">${esc(p.description)}</div>${item.auto&&parentSku(item)?`<div class="seq-parent-ref">for ${esc(parentSku(item))}</div>`:''}${bodyChoiceHtml(item,p)}</div>
      <div class="row-actions">${itemActionsMenuHtml(item,p)}</div>
    </div>`;
  }).join('');

  qsa('[data-delete-item]',root).forEach(b=>b.onclick=()=>deleteSequenceItem(b.dataset.deleteItem));
  qsa('[data-open-item-menu]',root).forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openItemMenuPortal(b.dataset.openItemMenu,b);});
  qsa('[data-open-room-menu]',root).forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openRoomMenuPortal(b.dataset.openRoomMenu,b);});
  qsa('[data-room-health]',root).forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openRoomHealthPortal(b.dataset.roomHealth,b);});
  qsa('[data-edit-item-code]',root).forEach(el=>el.ondblclick=e=>{if(window.getSelection?.().toString().trim())return;e.preventDefault();e.stopPropagation();startSkuInlineEdit(el.dataset.editItemCode,el);});
  qsa('[data-body-choice]',root).forEach(sel=>sel.onchange=()=>selectRequiredBody(sel.dataset.bodyChoice,sel.value));
  qsa('[data-add-required-body]',root).forEach(btn=>btn.onclick=()=>selectRequiredBody(btn.dataset.addRequiredBody,btn.dataset.defaultBody));
  qsa('[data-inspection-shaft-choice]',root).forEach(sel=>sel.onchange=()=>selectInspectionShaft(sel.dataset.inspectionShaftChoice,sel.value));
  qsa('[data-room-name]',root).forEach(label=>label.ondblclick=e=>{e.preventDefault();e.stopPropagation();startRoomInlineEdit(label.dataset.roomName,label);});
  wireDragDrop();
}

async function deleteSequenceItem(id){
  if(!state.project) return;
  const item=state.project.items.find(x=>x.id===id); if(!item) return;
  pushProjectHistory(`Remove ${item.type==='product'?item.sku:(item.title||'section')}`);
  if(item.type==='product' && !item.auto){
    state.project.items=state.project.items.filter(x=>x.id!==id && x.parentItemId!==id);
  } else if(item.type==='product' && item.auto && item.parentItemId){
    const parent=state.project.items.find(x=>x.id===item.parentItemId);
    if(parent && item.componentRole!=='inspection-shaft') parent.concealedSuppressed=true;
    state.project.items=state.project.items.filter(x=>x.id!==id);
  } else state.project.items=state.project.items.filter(x=>x.id!==id);
  await touchProject(); renderProject(); renderResults();
}
async function clearSequence(){
  if(!state.project) return; if(!confirm(`Clear all selected products and breaks from ${activeSelectionOption()?.name||'this option'}?`)) return;
  pushProjectHistory('Clear selection');
  state.project.items=[]; await touchProject(); renderProject(); renderResults();
}
async function toggleValidationOverride(id){
  const item=state.project?.items.find(x=>x.id===id); if(!item) return; item.validationOverride=!item.validationOverride; await touchProject(); renderProject();
}
async function changeQty(id,delta){
  const item=state.project?.items.find(x=>x.id===id); if(!item) return; await setQty(id,Math.max(1,Number(item.qty||1)+delta));
}
async function setQty(id,val){
  const item=state.project?.items.find(x=>x.id===id); if(!item) return; item.qty=Math.max(1,Number.isFinite(val)?Math.round(val):1);
  if(!item.auto) state.project.items.filter(x=>x.parentItemId===item.id).forEach(x=>x.qty=item.qty);
  await touchProject(); renderProject();
}
async function renameSection(id,title){
  const item=state.project?.items.find(x=>x.id===id); if(!item) return; pushProjectHistory(`Rename section ${item.title||''}`); item.title=String(title||'SECTION').trim()||'SECTION'; await touchProject(); renderProject();
}
function startRoomInlineEdit(id,label){
  const item=state.project?.items.find(x=>x.id===id&&x.type==='section'); if(!item) return;
  const input=document.createElement('input'); input.className='room-name-editor'; input.value=item.title||''; input.size=Math.max(5,Math.min(32,String(item.title||'').length+1)); input.setAttribute('aria-label','Break name'); input.addEventListener('input',()=>{input.size=Math.max(5,Math.min(32,input.value.length+1));});
  label.replaceWith(input); input.focus(); input.select(); let finished=false;
  const finish=async(save)=>{if(finished)return;finished=true;if(save){const value=input.value.trim();if(value&&value!==item.title){await renameSection(id,value);return;}}renderProject();};
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();finish(false);}});
  input.addEventListener('blur',()=>finish(true));
}

function startSkuInlineEdit(itemId,label){
  const item=state.project?.items.find(x=>x.id===itemId&&x.type==='product'); if(!item) return;
  const input=document.createElement('input');
  input.className='sku-inline-editor'; input.value=item.sku||''; input.setAttribute('aria-label','Product SKU'); input.setAttribute('spellcheck','false');
  label.replaceWith(input); input.focus(); input.select(); let finished=false;
  const finish=async(save)=>{
    if(finished) return;
    if(!save){finished=true;renderProject();return;}
    const sku=normalizeSku(input.value);
    if(!sku || sku===item.sku){finished=true;renderProject();return;}
    const product=getProduct(sku);
    if(!product){input.classList.add('invalid');toast(`SKU ${sku||input.value.trim()} not found`);input.focus();input.select();return;}
    finished=true; await replaceItemSku(itemId,sku);
  };
  input.addEventListener('click',e=>e.stopPropagation());
  input.addEventListener('dblclick',e=>e.stopPropagation());
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();finish(true);}else if(e.key==='Escape'){e.preventDefault();finish(false);}});
  input.addEventListener('blur',()=>finish(true));
}

function roomBounds(sectionId){
  if(!state.project) return null;
  const items=state.project.items||[]; const start=items.findIndex(x=>x.id===sectionId&&x.type==='section'); if(start<0) return null;
  let end=items.length; for(let i=start+1;i<items.length;i++){ if(items[i].type==='section'){end=i;break;} }
  return {start,end,section:items[start],items:items.slice(start,end)};
}
async function promptRenameRoom(sectionId){
  const room=roomBounds(sectionId); if(!room) return;
  const title=prompt('Break name:',room.section.title||'BREAK'); if(title===null) return;
  await renameSection(sectionId,title);
}
async function duplicateRoomById(sectionId){
  const room=roomBounds(sectionId); if(!room||!room.items.length) return;
  pushProjectHistory(`Duplicate room ${room.section.title||''}`);
  const idMap=new Map(); room.items.forEach(it=>idMap.set(it.id,uid()));
  const copy=room.items.map((it,index)=>{
    const c=structuredClone(it); c.id=idMap.get(it.id);
    if(index===0&&c.type==='section') c.title=`${String(c.title||'ROOM').trim()} COPY`;
    if(c.parentItemId) c.parentItemId=idMap.get(c.parentItemId)||c.parentItemId;
    if(c.groupId) c.groupId=idMap.get(c.groupId)||c.groupId;
    return c;
  });
  state.project.items.splice(room.end,0,...copy);
  await touchProject(); renderProject(); renderResults(); toast(`Break duplicated: ${copy[0]?.title||'COPY'}`);
}
async function removeRoomById(sectionId){
  const room=roomBounds(sectionId); if(!room) return;
  const count=room.items.filter(x=>x.type==='product'&&!x.auto).length;
  if(!confirm(`Remove room "${room.section.title||'ROOM'}" and its ${count} selected product${count===1?'':'s'}?`)) return;
  pushProjectHistory(`Remove room ${room.section.title||''}`);
  state.project.items.splice(room.start,room.end-room.start);
  await touchProject(); renderProject(); renderResults(); toast('Break removed');
}
function roomMenuContentHtml(section){
  return `<div class="item-menu-title">Break options</div>
    <button type="button" class="item-menu-action" data-review-room="${section.id}">Break completeness & compatibility</button>
    <button type="button" class="item-menu-action" data-room-finish="${section.id}">Change break finish…</button>
    <div class="item-menu-divider"></div>
    <button type="button" class="item-menu-action" data-rename-room="${section.id}">Edit break name…</button>
    <button type="button" class="item-menu-action" data-duplicate-room="${section.id}">Duplicate whole break</button>
    <div class="item-menu-divider"></div>
    <button type="button" class="item-menu-action danger-text" data-remove-room="${section.id}">Remove whole break</button>`;
}
function openRoomMenuPortal(sectionId,anchor){
  let portal=$('itemMenuPortal'); if(!portal){portal=document.createElement('div');portal.id='itemMenuPortal';portal.className='item-menu-portal';document.body.appendChild(portal);}
  const section=state.project?.items.find(x=>x.id===sectionId&&x.type==='section'); if(!section) return;
  portal.innerHTML=roomMenuContentHtml(section); portal.classList.add('open');
  qsa('[data-review-room]',portal).forEach(b=>b.onclick=()=>{const id=b.dataset.reviewRoom;closeItemMenuPortal();const row=document.querySelector(`[data-item-id="${CSS.escape(id)}"]`);const anchor=row?.querySelector('[data-room-health]')||row?.querySelector('[data-open-room-menu]');if(anchor)openRoomHealthPortal(id,anchor);});
  qsa('[data-room-finish]',portal).forEach(b=>b.onclick=()=>{const id=b.dataset.roomFinish;closeItemMenuPortal();openRoomFinishDialog(id);});
  qsa('[data-rename-room]',portal).forEach(b=>b.onclick=()=>{const id=b.dataset.renameRoom;closeItemMenuPortal();promptRenameRoom(id);});
  qsa('[data-duplicate-room]',portal).forEach(b=>b.onclick=()=>{const id=b.dataset.duplicateRoom;closeItemMenuPortal();duplicateRoomById(id);});
  qsa('[data-remove-room]',portal).forEach(b=>b.onclick=()=>{const id=b.dataset.removeRoom;closeItemMenuPortal();removeRoomById(id);});
  const r=anchor.getBoundingClientRect(), margin=10; portal.style.visibility='hidden'; portal.style.left='0px'; portal.style.top='0px';
  requestAnimationFrame(()=>{const pr=portal.getBoundingClientRect();let left=Math.min(window.innerWidth-pr.width-margin,Math.max(margin,r.right-pr.width));let top=r.bottom+6;if(top+pr.height>window.innerHeight-margin)top=Math.max(margin,r.top-pr.height-6);portal.style.left=`${Math.round(left)}px`;portal.style.top=`${Math.round(top)}px`;portal.style.visibility='visible';});
}

const AUTO_BREAK_GROUPS=[
  {key:'wc',title:'WC'},
  {key:'basin',title:'Basin Mixer'},
  {key:'shower',title:'Shower Set'},
  {key:'accessories',title:'Accessories'}
];

function autoBreakGroupForProduct(product){
  if(!product)return '';
  const cat=normalizeText(product.category||'');
  const raw=[product.description,product.fullText,product.family,product.category,product.area,product.function,product.mounting].filter(Boolean).join(' ');
  const hay=normalizeText(raw);

  // WC
  if(
    cat==='flushing system' ||
    cat==='flush plate / actuation' ||
    cat==='wc / ceramic' ||
    cat==='shower toilet' ||
    cat==='trigger spray' ||
    /flush tank|flushtank|flushing cistern|cistern|inspection shaft|revision shaft/.test(hay)
  ) return 'wc';

  // Basin Mixer
  const angleValve=cat==='angle valve'||/angle valve/.test(hay);
  const halfThreeEighth=angleValve && (
    /1\s*\/\s*2[\s\S]{0,18}3\s*\/\s*8/i.test(raw) ||
    /1 2[\s\S]{0,18}3 8/.test(hay) ||
    /dn\s*15[\s\S]{0,18}3\s*\/\s*8/i.test(raw)
  );
  if(cat==='basin mixer'||halfThreeEighth||/bottle trap/.test(hay)) return 'basin';

  // Shower Set
  const showerCategories=new Set([
    'head shower','hand shower','shower system','shower set / rail',
    'shower mixer','shower hose','shower accessory','body spray'
  ]);
  const showerRoughIn=cat==='concealed / rough-in' &&
    /shower|smartbox|rapido|thermost|diverter|mixer|one way|two way|1 way|2 way/.test(hay) &&
    !/basin/.test(hay);
  if(
    showerCategories.has(cat) ||
    showerRoughIn ||
    /rainshower|head shower|headshower|hand shower|handshower|shower hose|outlet elbow|wall union|hand shower holder|shower holder/.test(hay)
  ) return 'shower';

  // Accessories
  if(cat==='accessory'||/\baccessor(?:y|ies)\b/.test(hay)) return 'accessories';

  return '';
}

function autoBreakProductBlocks(items=[]){
  const products=items.filter(item=>item?.type==='product');
  const byId=new Map(products.map(item=>[item.id,item]));
  const children=new Map();
  for(const item of products){
    if(item.auto&&item.parentItemId){
      if(!children.has(item.parentItemId))children.set(item.parentItemId,[]);
      children.get(item.parentItemId).push(item);
    }
  }
  const seen=new Set(),blocks=[];
  for(const item of products){
    if(seen.has(item.id))continue;
    if(item.auto&&item.parentItemId&&byId.has(item.parentItemId))continue;
    const block=[item,...(children.get(item.id)||[])];
    block.forEach(x=>seen.add(x.id));
    blocks.push(block);
  }
  for(const item of products){
    if(!seen.has(item.id)){seen.add(item.id);blocks.push([item]);}
  }
  return blocks;
}

async function autoCreateBreaks(){
  if(!state.project){openProjectDialog('new');return;}
  const blocks=autoBreakProductBlocks(state.project.items||[]);
  if(!blocks.length){toast('Add products before creating automatic breaks');return;}

  pushProjectHistory('Auto Breaks');

  const grouped=new Map(AUTO_BREAK_GROUPS.map(group=>[group.key,[]]));
  const unmatched=[];
  for(const block of blocks){
    const parent=block.find(item=>!item.auto)||block[0];
    const product=getProduct(parent?.sku);
    const group=autoBreakGroupForProduct(product);
    if(group&&grouped.has(group)) grouped.get(group).push(...block);
    else unmatched.push(...block);
  }

  const rebuilt=[...unmatched];
  for(const group of AUTO_BREAK_GROUPS){
    rebuilt.push({id:uid(),type:'section',title:group.title,autoGenerated:true});
    rebuilt.push(...grouped.get(group));
  }

  state.project.items=rebuilt;
  syncActiveOption(state.project);
  renderProject();
  updateHistoryButtons();

  const counts=AUTO_BREAK_GROUPS.map(group=>{
    const count=grouped.get(group).filter(item=>item.type==='product'&&!item.auto).length;
    return group.title+' '+count;
  }).join(' · ');

  try{
    await touchProject();
    toast('Auto Breaks created · '+counts,3600);
  }catch(err){
    console.error('Auto Breaks save failed',err);
    toast('Auto Breaks created, but project save needs retry',3600);
  }
}
async function addSection(){
  if(!state.project){ openProjectDialog('new'); return; }
  const title=prompt('Break name:', 'MASTER BATHROOM'); if(title===null) return;
  pushProjectHistory(`Add section ${String(title).trim()||'SECTION'}`);
  state.project.items.push({id:uid(),type:'section',title:String(title).trim()||'SECTION'}); await touchProject(); renderProject();
}

function wireDragDrop(){
  const root=$('sequenceList');
  const rows=qsa('[data-item-id]',root);
  const handles=qsa('[data-drag-item]',root);
  handles.forEach(handle=>{
    const row=handle.closest('[data-item-id]');
    handle.ondragstart=e=>{ state.dragItemId=handle.dataset.dragItem; e.dataTransfer.effectAllowed='move'; if(row) row.style.opacity='.55'; };
    handle.ondragend=()=>{ if(row) row.style.opacity=''; rows.forEach(x=>x.classList.remove('drop-target')); state.dragItemId=null; };
  });
  rows.forEach(row=>{
    row.ondragover=e=>{ if(!state.dragItemId) return; e.preventDefault(); row.classList.add('drop-target'); };
    row.ondragleave=()=>row.classList.remove('drop-target');
    row.ondrop=async e=>{
      if(!state.dragItemId) return;
      e.preventDefault(); row.classList.remove('drop-target');
      const target=row.dataset.itemId;
      if(state.dragItemId===target) return;
      await moveItemBlock(state.dragItemId,target);
    };
  });
}

async function moveItemBlock(sourceId,targetId){
  const items=state.project.items;
  const source=items.find(x=>x.id===sourceId), target=items.find(x=>x.id===targetId); if(!source||!target) return;
  pushProjectHistory('Reorder selection');
  let block=[];
  if(source.type==='product'&&!source.auto){ block=items.filter(x=>x.id===source.id||x.parentItemId===source.id); }
  else block=[source];
  let remaining=items.filter(x=>!block.some(b=>b.id===x.id));
  let targetIdx=remaining.findIndex(x=>x.id===targetId); if(targetIdx<0) targetIdx=remaining.length;
  remaining.splice(targetIdx,0,...block); state.project.items=remaining; await touchProject(); renderProject();
}

function openProjectDialog(mode='new'){
  $('projectDialogTitle').textContent=mode==='edit'?'Project Details':'New Project';
  const p=mode==='edit'?state.project:null;
  $('projectInputName').value=p?.name||''; $('projectInputCustomer').value=p?.customer||''; $('projectInputDate').value=p?.date||today(); $('projectInputFinish').value=p?.finish||'';
  $('projectDialog').dataset.mode=mode; $('projectDialog').showModal(); setTimeout(()=>$('projectInputName').focus(),50);
}

async function saveProjectForm(){
  const name=$('projectInputName').value.trim(); if(!name){ toast('Project name is required'); return; }
  const mode=$('projectDialog').dataset.mode;
  if(mode==='edit'&&state.project){ pushProjectHistory('Edit project details'); state.project.name=name; state.project.customer=$('projectInputCustomer').value.trim(); state.project.date=$('projectInputDate').value; state.project.finish=$('projectInputFinish').value; }
  else {
    const createdAt=new Date().toISOString();
    const firstOption=createOptionPayload('Selection',[],$('projectInputFinish').value);
    state.project={id:uid(),name,customer:$('projectInputCustomer').value.trim(),date:$('projectInputDate').value||today(),finish:firstOption.finish,items:firstOption.items,options:[firstOption],activeOptionId:firstOption.id,createdAt,updatedAt:createdAt};
    resetProjectHistory();
  }
  await touchProject(); $('projectDialog').close(); renderProject(); toast('Project saved locally');
}

async function saveCurrentProject(){ if(!state.project){openProjectDialog('new');return;} await touchProject(); renderProject(); toast('Project saved'); }

async function activateProjectById(id){
  state.projects=(await idbGetAll(STORE_PROJECTS)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
  const found=state.projects.find(p=>p.id===id); if(!found) return false;
  state.project=structuredClone(found); ensureProjectOptions(state.project); resetProjectHistory(); await idbPut(STORE_META,{key:'lastProjectId',value:state.project.id}); renderProject(); return true;
}
function projectFinishOptionsHtml(selected=''){
  const finishes=sortUnique(state.products.map(p=>p.finish).filter(f=>f&&RECOGNIZED_FINISHES.has(f)));
  return `<option value="">Mixed finish</option>`+finishes.map(f=>`<option value="${esc(f)}" ${f===selected?'selected':''}>${esc(f)} (${esc(finishCode(f))})</option>`).join('');
}
function projectFinishConversionPreview(project,target){
  if(project)ensureProjectOptions(project);
  const parents=(project?.items||[]).filter(x=>x.type==='product'&&!x.auto); let convertible=0,same=0,unavailable=0;
  for(const item of parents){const p=getProduct(item.sku);if(!p)continue;if(!target||p.finish===target){same++;continue;}const match=finishVariantsForProduct(p).find(v=>v.finish===target);if(match)convertible++;else unavailable++;}
  return {total:parents.length,convertible,same,unavailable};
}
function updateProjectFinishPreview(){
  const project=state.projects.find(p=>p.id===state.projectFinishTargetId)||state.project; if(!project)return; const target=$('projectFinishSelect')?.value||''; const r=projectFinishConversionPreview(project,target);
  $('projectFinishPreview').innerHTML=`<strong>${r.convertible}</strong> can change automatically · <strong>${r.unavailable}</strong> need review · <strong>${r.same}</strong> already matching`;
}
async function openProjectFinishDialog(id){
  const project=state.projects.find(p=>p.id===id)||state.project; if(!project)return; ensureProjectOptions(project); state.projectFinishTargetId=project.id;
  const option=activeSelectionOption(project);
  $('projectFinishTarget').innerHTML=`<strong>${esc(project.name)} · ${esc(option?.name||'Selection')}</strong><small>${esc([project.customer,project.finish].filter(Boolean).join(' · '))}</small>`;
  $('projectFinishSelect').innerHTML=projectFinishOptionsHtml(project.finish||''); $('projectFinishConvertItems').checked=true; updateProjectFinishPreview(); $('projectFinishDialog').showModal();
}
function rebuildAutoChildrenForProject(project){
  const oldItems=project.items||[], shaftByParent=new Map();
  oldItems.filter(x=>x.type==='product'&&x.auto&&x.componentRole==='inspection-shaft'&&x.parentItemId).forEach(x=>shaftByParent.set(x.parentItemId,x));
  const rebuilt=[];
  for(const item of oldItems){
    if(item.type==='product'&&item.auto)continue;
    rebuilt.push(item);
    if(item.type==='product'&&!item.auto&&!item.concealedSuppressed){
      const p=getProduct(item.sku), candidates=p?bodyCandidatesForProduct(p):[];
      if(candidates.length){const body=getProduct(preferredBodyCandidate(p,candidates));if(body)rebuilt.push({id:uid(),type:'product',sku:body.sku,qty:item.qty||1,auto:true,componentRole:'required-body',parentItemId:item.id,groupId:item.id,validationOverride:false,note:'Automatically added concealed component'});}
    }
    if(item.type==='product'&&!item.auto){
      const oldShaft=shaftByParent.get(item.id);
      if(oldShaft){const p=getProduct(item.sku),valid=p?inspectionShaftCandidatesForProduct(p):[];if(valid.includes(normalizeSku(oldShaft.sku)))rebuilt.push({...oldShaft,id:uid(),qty:item.qty||oldShaft.qty||1,parentItemId:item.id,groupId:item.id,componentRole:'inspection-shaft'});}
    }
  }
  project.items=rebuilt;
}
async function applyProjectFinishChange(){
  const id=state.projectFinishTargetId, target=$('projectFinishSelect').value, convert=$('projectFinishConvertItems').checked; if(!id)return;
  if(!(await activateProjectById(id)))return; pushProjectHistory(`Change project finish to ${target||'Mixed finish'}`); let changed=0,unavailable=0;
  if(convert&&target){for(const item of state.project.items.filter(x=>x.type==='product'&&!x.auto)){item.finishMismatchAcknowledged=false;const p=getProduct(item.sku);if(!p||p.finish===target)continue;const match=finishVariantsForProduct(p).find(v=>v.finish===target);if(match){item.sku=match.sku;item.concealedSuppressed=false;changed++;}else unavailable++;}rebuildAutoChildrenForProject(state.project);}
  state.project.finish=target; await touchProject(); $('projectFinishDialog').close(); renderProject(); renderResults(); toast(`Project finish updated${convert?` · ${changed} changed${unavailable?` · ${unavailable} need review`:''}`:''}`);
}
function closeDialogIfOpen(id){const d=$(id);if(d?.open)d.close();}
async function manageEditProject(id){
  if(!(await activateProjectById(id)))return;
  closeDialogIfOpen('projectsDialog');closeDialogIfOpen('manageProjectDialog');openProjectDialog('edit');
}

function projectOptionList(project){ return Array.isArray(project?.options)&&project.options.length?project.options:[{id:'legacy',name:'Selection',items:project?.items||[],finish:project?.finish||''}]; }
function projectManagementSummary(project){
  const options=projectOptionList(project), products=options.reduce((n,o)=>n+optionProductCount(o),0);
  return `${options.length} option${options.length===1?'':'s'} · ${products} selected SKUs`;
}
function projectListMatches(project,query,showArchived){
  if(showArchived?!project.archived:!!project.archived)return false;
  if(!query)return true;
  const optionText=projectOptionList(project).flatMap(o=>(o.items||[]).filter(x=>x.type==='product').map(x=>x.sku)).join(' ');
  return smartTextSearchMatch(query,[project.name,project.customer,project.finish,project.date,optionText].join(' '));
}
function projectRowsHtml(list){
  return list.map(p=>`<div class="project-list-row ${p.archived?'archived':''}"><div class="project-list-info"><strong>${esc(p.name)}</strong><small>${esc([p.customer,p.date].filter(Boolean).join(' · '))} · ${projectManagementSummary(p)}${p.archived?' · Archived':''}</small></div><div class="project-list-actions">${p.archived?`<button class="btn small" data-restore-project="${p.id}">Restore</button><button class="btn small danger-text" data-delete-project="${p.id}">Delete permanently</button>`:`<button class="btn small primary-soft" data-open-project="${p.id}">Open</button><button class="btn small" data-edit-project="${p.id}">Edit</button><button class="btn small" data-project-finish="${p.id}">Finish</button><button class="btn small" data-dup-project="${p.id}">Duplicate</button><button class="btn small" data-archive-project="${p.id}">Archive</button>`}</div></div>`).join('')||'<div class="sequence-empty"><strong>No matching projects</strong></div>';
}
function bindProjectRows(root,closeDialogId=''){
  if(!root)return;
  qsa('[data-open-project]',root).forEach(b=>b.onclick=async()=>{if(await activateProjectById(b.dataset.openProject)){if(closeDialogId)closeDialogIfOpen(closeDialogId);renderProject();updateManageProjectSummary();}});
  qsa('[data-edit-project]',root).forEach(b=>b.onclick=()=>manageEditProject(b.dataset.editProject));
  qsa('[data-project-finish]',root).forEach(b=>b.onclick=()=>openProjectFinishDialog(b.dataset.projectFinish));
  qsa('[data-dup-project]',root).forEach(b=>b.onclick=()=>duplicateProject(b.dataset.dupProject));
  qsa('[data-archive-project]',root).forEach(b=>b.onclick=()=>archiveProject(b.dataset.archiveProject));
  qsa('[data-restore-project]',root).forEach(b=>b.onclick=()=>restoreProject(b.dataset.restoreProject));
  qsa('[data-delete-project]',root).forEach(b=>b.onclick=()=>deleteProject(b.dataset.deleteProject));
}
function renderProjectListInto(listId,searchId,archiveId,closeDialogId=''){
  const root=$(listId);if(!root)return;
  const q=normalizeText($(searchId)?.value||''),showArchived=!!$(archiveId)?.checked;
  const list=state.projects.filter(p=>projectListMatches(p,q,showArchived));
  root.innerHTML=projectRowsHtml(list);bindProjectRows(root,closeDialogId);
}
function updateManageProjectSummary(){
  const name=$('manageProjectName'),meta=$('manageProjectMeta');if(!name||!meta)return;
  if(!state.project){name.textContent='No project open';meta.textContent='Create or open a project to start working.';return;}
  name.textContent=state.project.name||'Untitled project';
  meta.textContent=`${[state.project.customer,state.project.date].filter(Boolean).join(' · ')||'Local project'} · ${projectManagementSummary(state.project)}`;
}
async function loadProjectManagementData(){
  state.projects=(await idbGetAll(STORE_PROJECTS)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
}
async function renderProjectsDialog(){
  await loadProjectManagementData();renderProjectListInto('projectsList','projectSearch','showArchivedProjects','projectsDialog');
  if(!$('projectsDialog').open)$('projectsDialog').showModal();
}
async function renderManageProjectDialog(){
  await loadProjectManagementData();updateManageProjectSummary();renderProjectListInto('projectsListHub','projectSearchHub','showArchivedProjectsHub','manageProjectDialog');
  if(!$('manageProjectDialog').open)$('manageProjectDialog').showModal();
}
async function refreshProjectManagementViews(){
  await loadProjectManagementData();
  if($('projectsDialog')?.open)renderProjectListInto('projectsList','projectSearch','showArchivedProjects','projectsDialog');
  if($('manageProjectDialog')?.open){updateManageProjectSummary();renderProjectListInto('projectsListHub','projectSearchHub','showArchivedProjectsHub','manageProjectDialog');}
}
function openSpecificationDialog(sku){
  const product=getProduct(sku);if(!product){toast('Product not found');return;}
  $('specDialogTitle').textContent='Catalogue specification';
  $('specDialogSku').textContent=product.sku||'—';
  $('specDialogFamily').textContent=[product.family,product.category].filter(Boolean).join(' · ');
  $('specDialogDescription').textContent=product.description||'—';
  const url=imageUrlFor(product.sku);
  $('specDialogImage').innerHTML=url?`<img src="${url}" alt="${esc(product.sku)}" />`:`<div class="spec-no-image">No image available</div>`;
  $('specCatalogueText').textContent=String(product.fullText||product.description||'').trim();
  const sourceBits=[product.source,product.sourcePage?`Page ${product.sourcePage}`:'',product.sourceVersion].filter(Boolean);
  $('specSourceLine').textContent=sourceBits.length?`Source: ${sourceBits.join(' · ')}`:'Source information is not available in the catalogue record.';
  const fields=[['SKU',product.sku],['Finish',product.finish],['Status',product.status],['Family',product.family],['Category',product.category],['Size',product.size],['Installation',product.mounting],['Function',product.function],['Outlets',product.outlets],['Shape',product.shape],['Sprays',product.sprays],['Required concealed / rough-in',Array.isArray(product.requiredBodies)?product.requiredBodies.join(' / '):product.requiredBodies],['Replacement',product.replacement]];
  $('specDialogGrid').innerHTML=fields.filter(([,value])=>String(value||'').trim()).map(([label,value])=>`<div class="spec-field"><b>${esc(label)}</b><span>${esc(String(value))}</span></div>`).join('');
  $('specDialog').showModal();
}

async function duplicateProject(id){
  const src=state.projects.find(p=>p.id===id);if(!src)return;
  const copy=structuredClone(src);copy.id=uid();copy.name=src.name+' - Copy';copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;
  const sourceOptions=projectOptionList(src);copy.options=sourceOptions.map((o,i)=>createOptionPayload(o.name||`Option ${i+1}`,cloneItemsWithFreshIds(o.items||[]),o.finish||''));
  const srcActiveIndex=Math.max(0,sourceOptions.findIndex(o=>o.id===src.activeOptionId));const active=copy.options[Math.min(srcActiveIndex,copy.options.length-1)]||copy.options[0];
  copy.activeOptionId=active.id;copy.items=active.items;copy.finish=active.finish||'';
  await idbPut(STORE_PROJECTS,copy);state.project=copy;resetProjectHistory();await idbPut(STORE_META,{key:'lastProjectId',value:copy.id});closeDialogIfOpen('projectsDialog');closeDialogIfOpen('manageProjectDialog');await loadProjects();updateManageProjectSummary();toast('Project duplicated');
}
async function deleteProject(id){
  const p=state.projects.find(x=>x.id===id); if(!p||!confirm(`Delete project "${p.name}"?`))return; await idbDelete(STORE_PROJECTS,id); if(state.project?.id===id)state.project=null; await loadProjects(); renderProject(); await refreshProjectManagementViews();
}

  // ===== 60_images_database.js =====
async function loadAutomaticImages(rescan=false){
  try{
    const response=await fetch(rescan?'/api/rescan-images':'/api/images',{
      method:rescan?'POST':'GET', cache:'no-store'
    });
    if(!response.ok) throw new Error(`Image service returned ${response.status}`);
    const data=await response.json();
    state.imageFiles.clear();
    state.imageUrls.forEach(url=>{if(typeof url==='string'&&url.startsWith('blob:'))try{URL.revokeObjectURL(url);}catch(_){}});
    state.imageUrls.clear();
    const versions=data.versions||{};
    (data.skus||[]).forEach(rawSku=>{
      const sku=normalizeSku(rawSku);
      const version=versions[sku]||'1';
      if(sku) state.imageFiles.set(sku,`/thumbs/${encodeURIComponent(sku)}?v=${encodeURIComponent(version)}`);
    });
    state.imageFolderConnected=!!data.connected;
    state.imageSource=state.imageFolderConnected?'server':'';
    state.imageServerPath=String(data.path||'G:\\My Drive\\Images');
    updateFolderStatus(state.imageFiles.size,state.imageServerPath);
    renderResults(); renderSequence();
    if($('databaseDialog')?.open) renderDatabaseManager();
    if($('missingImagesDialog')?.open) renderMissingImages();
    if(rescan) toast(`${state.imageFiles.size.toLocaleString()} images indexed automatically`);
    return data;
  }catch(err){
    console.warn('Automatic image service is not available',err);
    state.imageFiles.clear(); state.imageFolderConnected=false; state.imageSource='';
    state.imageServerPath='G:\\My Drive\\Images';
    updateFolderStatus(0,state.imageServerPath);
    if($('missingImagesDialog')?.open) renderMissingImages();
    return null;
  }
}

function updateFolderStatus(count,name=''){
  const el=$('imageFolderStatus');
  if(el){
    el.textContent=state.imageFolderConnected
      ? `${name||'Image folder'} · ${count.toLocaleString()} image filenames indexed`
      : `Image folder not loaded`;
  }
  const settingsCount=$('settingsImageCount');
  if(settingsCount){ settingsCount.textContent=state.imageFolderConnected?`${count.toLocaleString()} loaded`:'Not loaded'; settingsCount.title=state.imageFolderConnected?(name||'Image folder'):'No image folder loaded'; }
  const buttons=[$('btnLoadImagesMenu'),$('btnLoadImagesAudit')].filter(Boolean);
  buttons.forEach(btn=>{
    if(state.imageFolderConnected){
      if(btn.id==='btnLoadImagesMenu') btn.textContent='Change Image Folder';
      else btn.textContent='Change image folder';
      btn.title=`${name||'Image folder'} · ${count.toLocaleString()} images indexed`;
      btn.classList.add('images-connected');
    }else{
      if(btn.id==='btnLoadImagesMenu') btn.textContent='Load / Change Image Folder';
      else btn.textContent='Load image folder';
      btn.title='Choose the local product image folder';
      btn.classList.remove('images-connected');
    }
  });
}

async function connectImageFolder(){
  // Preferred path when launched with start.bat: use the local Python server to
  // choose a real Windows folder path once, save it to grohe_selector_config.json,
  // and reload it automatically on every future launch without browser prompts.
  try{
    const response=await fetch('/api/select-image-folder',{method:'POST',cache:'no-store'});
    if(response.ok){
      const data=await response.json();
      if(data?.cancelled) return;
      if(data?.connected){
        await loadAutomaticImages(true);
        toast(`Image folder saved — ${state.imageFiles.size.toLocaleString()} images will auto-load next time`);
        return;
      }
    }
  }catch(err){
    console.warn('Native image folder picker is not available; using browser fallback',err);
  }
  try{
    if('showDirectoryPicker' in window){
      const handle=await window.showDirectoryPicker({mode:'read'});
      state.manualImageHandle=handle;
      try{await idbPut(STORE_HANDLES,{key:'images',handle});}catch(err){console.warn('Could not remember image folder handle',err);}
      await indexDirectoryHandle(handle);
      return;
    }
  }catch(err){
    if(err?.name==='AbortError') return;
    console.warn('Directory picker failed; using folder upload fallback',err);
  }
  const input=$('fallbackImageFolder');
  if(input){ input.value=''; input.click(); }
}

async function indexDirectoryHandle(handle){
  if(!handle) return;
  state.imageFiles.clear();
  state.imageUrls.forEach(url=>{if(typeof url==='string'&&url.startsWith('blob:'))try{URL.revokeObjectURL(url);}catch(_){}});
  state.imageUrls.clear();
  let count=0;
  async function walk(h){
    for await (const entry of h.values()){
      if(entry.kind==='directory') await walk(entry);
      else{
        const ext=entry.name.split('.').pop().toLowerCase();
        if(!['jpg','jpeg','png','webp','gif','bmp'].includes(ext)) continue;
        const sku=normalizeSku(entry.name.replace(/\.[^.]+$/,''));
        if(!sku || state.imageFiles.has(sku)) continue;
        try{state.imageFiles.set(sku,await entry.getFile());count++;}catch(_){ }
      }
    }
  }
  await walk(handle);
  state.imageFolderConnected=true;
  state.imageSource='manual';
  state.manualImageHandle=handle;
  updateFolderStatus(count,handle.name||'Selected image folder');
  renderResults(); renderSequence();
  if($('databaseDialog')?.open) renderDatabaseManager();
  if($('missingImagesDialog')?.open) renderMissingImages();
  toast(`${count.toLocaleString()} product images loaded`);
}

function indexFallbackImageFiles(fileList){
  if(!fileList?.length) return;
  state.imageFiles.clear();
  state.imageUrls.forEach(url=>{if(typeof url==='string'&&url.startsWith('blob:'))try{URL.revokeObjectURL(url);}catch(_){}});
  state.imageUrls.clear();
  let count=0;
  [...fileList].forEach(file=>{
    const ext=file.name.split('.').pop().toLowerCase();
    if(!['jpg','jpeg','png','webp','gif','bmp'].includes(ext)) return;
    const sku=normalizeSku(file.name.replace(/\.[^.]+$/,''));
    if(sku&&!state.imageFiles.has(sku)){state.imageFiles.set(sku,file);count++;}
  });
  state.imageFolderConnected=true;
  state.imageSource='fallback';
  state.manualImageHandle=null;
  updateFolderStatus(count,'Selected image folder');
  renderResults(); renderSequence();
  if($('databaseDialog')?.open) renderDatabaseManager();
  if($('missingImagesDialog')?.open) renderMissingImages();
  toast(`${count.toLocaleString()} product images loaded`);
}

async function restoreManualImageFolder(){
  if(!('showDirectoryPicker' in window)) return false;
  try{
    const rec=await idbGet(STORE_HANDLES,'images');
    const handle=rec?.handle;
    if(!handle) return false;
    const permission=await handle.queryPermission({mode:'read'});
    if(permission!=='granted') return false;
    await indexDirectoryHandle(handle);
    return true;
  }catch(err){
    console.warn('Could not restore saved image folder',err);
    return false;
  }
}

async function refreshImages(){
  if(state.imageSource==='manual'&&state.manualImageHandle){
    await indexDirectoryHandle(state.manualImageHandle);
    return;
  }
  if(state.imageSource==='fallback'){
    toast('Click Load Images to reselect the folder');
    return;
  }
  const data=await loadAutomaticImages(true);
  if(!data?.connected) await connectImageFolder();
}


const missingImageImportDraft={sku:'',dataUrl:'',sourceUrl:''};

function googleImageSearchUrlForSku(sku){
  const query=`${normalizeSku(sku)} GROHE`;
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

function resetMissingImageImportPreview(){
  missingImageImportDraft.dataUrl='';
  missingImageImportDraft.sourceUrl='';
  const preview=$('missingImageImportPreview');
  if(preview) preview.innerHTML='<span>Paste, drop, choose, or load an image URL</span>';
  const url=$('missingImageImportUrl'); if(url) url.value='';
  const file=$('missingImageImportFile'); if(file) file.value='';
  const save=$('btnSaveMissingImageJpeg'); if(save) save.disabled=true;
}

function setMissingImageImportDataUrl(dataUrl){
  if(!String(dataUrl||'').startsWith('data:image/')) return;
  missingImageImportDraft.dataUrl=String(dataUrl);
  missingImageImportDraft.sourceUrl='';
  const preview=$('missingImageImportPreview');
  if(preview) preview.innerHTML=`<img src="${esc(dataUrl)}" alt="Image preview" />`;
  const save=$('btnSaveMissingImageJpeg'); if(save) save.disabled=false;
}

function setMissingImageImportUrl(url){
  const value=String(url||'').trim();
  if(!/^https?:\/\//i.test(value)){toast('Paste a valid http/https image URL');return;}
  missingImageImportDraft.sourceUrl=value;
  missingImageImportDraft.dataUrl='';
  const preview=$('missingImageImportPreview');
  if(preview) preview.innerHTML=`<img src="${esc(value)}" alt="Image preview" referrerpolicy="no-referrer" /><small>If the preview is blocked by the website, Save JPEG may still work through the local server.</small>`;
  const save=$('btnSaveMissingImageJpeg'); if(save) save.disabled=false;
}

function readMissingImageFile(file){
  if(!file||!String(file.type||'').startsWith('image/')){toast('Choose an image file');return;}
  const reader=new FileReader();
  reader.onload=()=>setMissingImageImportDataUrl(reader.result);
  reader.onerror=()=>toast('Could not read the image file');
  reader.readAsDataURL(file);
}

function openMissingImageGoogleSearch(sku){
  const key=normalizeSku(sku); if(!key)return;
  missingImageImportDraft.sku=key;
  resetMissingImageImportPreview();
  const query=`${key} GROHE`;
  const code=$('missingImageImportSku'); if(code) code.textContent=key;
  const q=$('missingImageGoogleQuery'); if(q) q.value=query;
  const fileName=$('missingImageImportFileName'); if(fileName) fileName.textContent=`Will save as ${key}.jpg in ${state.imageServerPath||'G:\\My Drive\\Images'}`;
  const dialog=$('missingImageGoogleDialog'); if(dialog&&!dialog.open) dialog.showModal();
}

async function saveMissingImageAsJpeg(){
  const sku=missingImageImportDraft.sku;
  if(!sku)return;
  if(!missingImageImportDraft.dataUrl&&!missingImageImportDraft.sourceUrl){toast('Paste, choose, or load an image first');return;}
  const btn=$('btnSaveMissingImageJpeg'); if(btn){btn.disabled=true;btn.textContent='Saving…';}
  try{
    const response=await fetch('/api/images/import-jpeg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sku,data_url:missingImageImportDraft.dataUrl,url:missingImageImportDraft.sourceUrl})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.ok===false) throw new Error(data.error||`Save failed (${response.status})`);
    await refreshImages();
    if(state.showMissingImagesOnly) renderFilters();
    const dialog=$('missingImageGoogleDialog'); if(dialog?.open) dialog.close();
    toast(`${sku}.jpg saved`);
  }catch(err){toast(err.message||'Could not save image as JPEG');}
  finally{if(btn){btn.disabled=false;btn.textContent='Save JPEG';}}
}

function renderDatabaseMetrics(){
  if(!$('dbTotal')) return;
  $('dbTotal').textContent=state.products.length.toLocaleString();
  $('dbCustom').textContent=state.customCount.toLocaleString();
  if($('dbDeleted')) $('dbDeleted').textContent=state.deletedCount.toLocaleString();
  $('dbRules').textContent=state.products.filter(p=>p.requiredBodies?.length).length.toLocaleString();
}

function dbDeletedDisplayRecords(){
  return (state.deletedRecords||[]).map(raw=>{
    const seed=seedProductBySku(raw.sku);
    const base=seed||normalizeProduct({...raw,custom:true,status:'Removed locally'});
    return {...base,sku:normalizeSku(raw.sku),description:raw.description||base.description||'Removed product',status:'Removed locally',_deleted:true,custom:true};
  });
}

function dbFilteredProducts(){
  const status=$('dbFilterStatus')?.value||'';
  let list=status==='__deleted__'?dbDeletedDisplayRecords():state.products.slice();
  const q=String($('dbSearch')?.value||'').trim();
  if(q) list=searchProducts(q,list);
  const cat=$('dbFilterCategory')?.value||''; if(cat) list=list.filter(p=>p.category===cat);
  if(status && status!=='__deleted__') list=list.filter(p=>p.status===status);
  return list;
}

function populateDatabaseFilters(){
  const catSel=$('dbFilterCategory'), statusSel=$('dbFilterStatus');
  if(catSel){
    const cur=catSel.value, vals=sortUnique(state.products.map(p=>p.category));
    catSel.innerHTML='<option value="">All categories</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if(vals.includes(cur)) catSel.value=cur;
  }
  if(statusSel){
    const cur=statusSel.value, vals=sortUnique(state.products.map(p=>p.status));
    statusSel.innerHTML='<option value="">All status</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')+(state.deletedCount?`<option value="__deleted__">Removed locally (${state.deletedCount})</option>`:'');
    if(vals.includes(cur)||cur==='__deleted__') statusSel.value=cur;
  }
  const dl=$('dbCategorySuggestions'); if(dl) dl.innerHTML=sortUnique(state.products.map(p=>p.category)).map(v=>`<option value="${esc(v)}"></option>`).join('');
}

function renderDatabaseList(){
  if(!$('dbProductList')) return;
  const list=dbFilteredProducts();
  $('dbResultCount').textContent=`${list.length.toLocaleString()} results`;
  const shown=list.slice(0,state.dbLimit);
  $('dbProductList').innerHTML=shown.map(p=>{
    const img=p._deleted?'<span class="db-image-dot deleted" title="Removed locally">×</span>':(state.imageFolderConnected ? (getImageFile(p.sku)?'<span class="db-image-dot ok" title="Image found">●</span>':'<span class="db-image-dot missing" title="Missing image">●</span>') : '<span class="db-image-dot unknown" title="Image folder not connected">●</span>');
    return `<button type="button" class="db-product-row ${state.dbSelectedSku===p.sku?'active':''} ${p._deleted?'deleted':''}" data-db-sku="${esc(p.sku)}">
      <span class="db-row-sku">${esc(p.sku)}</span>
      <span class="db-row-main"><strong>${esc(p.description)}${isPrunedProduct(p)?' <span class="pruned-badge">PRUNED</span>':''}</strong><small>${esc([p.family,p.category,p.finish].filter(Boolean).join(' · '))}</small></span>
      ${img}
    </button>`;
  }).join('') || '<div class="db-empty">No matching products.</div>';
  qsa('[data-db-sku]',$('dbProductList')).forEach(b=>b.onclick=()=>selectDbSku(b.dataset.dbSku));
}

function clearDbEditor(){
  state.dbSelectedSku='';
  const ids=['dbSku','dbDescription','dbFamily','dbCategory','dbFinish','dbArea','dbSize','dbMounting','dbFunction','dbOutlets','dbShape','dbKeywords','dbRequired','dbReplacement','dbSource','dbSourceVersion'];
  ids.forEach(id=>{if($(id)) $(id).value='';});
  if($('dbStatus')) $('dbStatus').value='Active';
  if($('dbEditorTitle')) $('dbEditorTitle').textContent='New product';
  if($('dbSourceLine')) $('dbSourceLine').textContent='New local database record';
  updateDbImageBadge('');
  if($('btnSaveSku')) $('btnSaveSku').disabled=false; if($('btnDeleteSku')) $('btnDeleteSku').disabled=false; if($('btnRevertSku')) $('btnRevertSku').textContent='Revert to starter';
  renderDatabaseList();
}

function updateDbImageBadge(sku){
  const badge=$('dbImageBadge'); if(!badge) return;
  badge.className='db-image-badge';
  if(!sku){badge.textContent='No SKU selected';badge.classList.add('muted');return;}
  if(!state.imageFolderConnected){badge.textContent='Image folder not connected';badge.classList.add('muted');return;}
  if(getImageFile(sku)){badge.textContent='✓ Image found';badge.classList.add('good');}
  else {badge.textContent='Missing image';badge.classList.add('bad');}
}

function selectDbSku(sku){
  const key=normalizeSku(sku);
  let p=getProduct(key), tombstone=null;
  if(!p){
    tombstone=(state.deletedRecords||[]).find(x=>normalizeSku(x.sku)===key);
    if(tombstone) p=seedProductBySku(key)||normalizeProduct({...tombstone,custom:true});
  }
  if(!p) return;
  state.dbSelectedSku=key;
  $('dbSku').value=key; $('dbDescription').value=p.description||tombstone?.description||''; $('dbFamily').value=p.family||''; $('dbCategory').value=p.category||'';
  $('dbFinish').value=p.finish||''; $('dbArea').value=p.area||''; $('dbSize').value=p.size||''; $('dbMounting').value=p.mounting||''; $('dbFunction').value=p.function||'';
  $('dbOutlets').value=p.outlets||''; $('dbShape').value=p.shape||''; $('dbKeywords').value=p.keywords||''; $('dbRequired').value=(p.requiredBodies||[]).join('; ');
  $('dbStatus').value=[...$('dbStatus').options].some(o=>o.value===p.status)?p.status:'Unknown'; $('dbReplacement').value=p.replacement||''; $('dbSource').value=p.source||''; $('dbSourceVersion').value=p.sourceVersion||'';
  $('dbEditorTitle').textContent=tombstone?`${key} · removed locally`:key;
  const seed=seedProductBySku(key); const isOverride=!!p.custom||!!tombstone;
  $('dbSourceLine').textContent=tombstone?`Removed locally · ${seed?'starter record can be restored':'local-only record can be restored'}`:`Source: ${p.source||'Unknown'}${isOverride?' · local edit saved':''}${seed?' · starter record available':''}`;
  updateDbImageBadge(key);
  $('btnSaveSku').disabled=!!tombstone; $('btnDeleteSku').disabled=!!tombstone; $('btnRevertSku').textContent=tombstone?'Restore SKU':'Revert to starter';
  renderDatabaseList();
}

async function renderChangeHistory(){
  if(!$('dbChangeHistory')) return;
  const rows=(await idbGetAll(STORE_CHANGES)).sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp))).slice(0,24);
  $('dbChangeHistory').innerHTML=rows.map(r=>`<div class="db-change-row"><span>${esc(r.action)}</span><strong>${esc(r.sku||'')}</strong><small>${esc(r.details||'')} · ${esc(new Date(r.timestamp).toLocaleString())}</small></div>`).join('') || '<small>No local database changes yet.</small>';
}

async function renderDatabaseManager(){
  renderDatabaseMetrics(); populateDatabaseFilters(); renderDatabaseList();
  const selectedDeleted=state.dbSelectedSku && (state.deletedRecords||[]).some(x=>normalizeSku(x.sku)===normalizeSku(state.dbSelectedSku));
  if(state.dbSelectedSku && (getProduct(state.dbSelectedSku)||selectedDeleted)) selectDbSku(state.dbSelectedSku);
  else if(!state.dbSelectedSku && state.products.length) selectDbSku(state.products[0].sku);
  await renderChangeHistory();
}

function parseDelimited(text){
  const raw=String(text||'').trim(); if(!raw)return [];
  const lines=raw.split(/\r?\n/).filter(l=>l.trim()); if(!lines.length)return [];
  const delimiter=lines[0].includes('\t')?'\t':',';
  function splitCsv(line){
    if(delimiter==='\t') return line.split('\t');
    const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur);cur='';}else cur+=c;}out.push(cur);return out;
  }
  const rows=lines.map(splitCsv);
  const normalizedHeader=rows[0].map(x=>normalizeText(x));
  const hasHeader=normalizedHeader.some(h=>h==='sku'||h==='description'||h==='family');
  const defaultHeaders=['sku','description','family','category','finish','area','size','mounting','function','outlets','shape','keywords','required body','status','replacement','source','source version'];
  const headers=hasHeader?normalizedHeader:defaultHeaders;
  const data=hasHeader?rows.slice(1):rows;
  return data.map(cols=>{
    const obj={}; headers.forEach((h,i)=>obj[h]=String(cols[i]??'').trim());
    return normalizeProduct({
      sku:obj.sku,description:obj.description,family:obj.family,category:obj.category||'Other',finish:obj.finish,area:obj.area,size:obj.size,mounting:obj.mounting,function:obj.function,outlets:obj.outlets,shape:obj.shape,keywords:obj.keywords,
      requiredBodies:obj['required body']||obj['required bodies']||obj.requiredbody||'',status:obj.status||'Active',replacement:obj.replacement,source:obj.source||'Custom Import',sourceVersion:obj['source version']||obj.sourceversion||'',custom:true
    });
  }).filter(x=>x.sku&&x.description);
}

async function importRows(){
  const rows=state.importPreviewRows?.length?state.importPreviewRows:previewImportRows(); if(!rows.length){$('importStatus').textContent='No valid rows found.';return;}
  const conflicts=rows.filter(r=>r._importType==='CONFLICT').length, preserve=!!$('preserveLocalConflicts')?.checked;
  if(conflicts && !preserve && !confirm(`${conflicts} imported rows conflict with your existing local edits. Continue and overwrite those local product records?`)) return;
  await createDatabaseBackup(`Before import of ${rows.length} rows`);
  let applied=0,skipped=0;
  for(const r0 of rows){if(preserve&&r0._importType==='CONFLICT'){skipped++;continue;}const r={...r0};delete r._importType;await idbPut(STORE_PRODUCTS,r);applied++;}
  await logDbChange('Bulk import',rows[0]?.sku||'',`${rows.length} products imported / updated`);
  state.importPreviewRows=[]; $('importStatus').textContent=`Applied ${applied} rows${skipped?` · preserved ${skipped} local conflict(s)`:''}.`; $('importPreview').innerHTML=''; await loadProducts(); await renderDatabaseManager(); renderProject(); toast(`${applied} products imported / updated`);
}

async function renameSkuReferences(oldSku,newSku){
  const oldKey=normalizeSku(oldSku), newKey=normalizeSku(newSku); if(!oldKey||!newKey||oldKey===newKey) return;
  const impacted=state.products.filter(p=>(p.requiredBodies||[]).includes(oldKey)||p.replacement===oldKey);
  for(const p of impacted){
    const updated={...p,requiredBodies:(p.requiredBodies||[]).map(x=>x===oldKey?newKey:x),replacement:p.replacement===oldKey?newKey:p.replacement,custom:true};
    delete updated._searchText; delete updated._searchCompact; await idbPut(STORE_PRODUCTS,updated);
  }
  const projects=await idbGetAll(STORE_PROJECTS);
  for(const project of projects){
    let changed=false;
    for(const item of project.items||[]){if(item.type==='product'&&normalizeSku(item.sku)===oldKey){item.sku=newKey;changed=true;}}
    if(changed){project.updatedAt=new Date().toISOString();await idbPut(STORE_PROJECTS,project);}
  }
}

async function saveDbSku(){
  const sku=normalizeSku($('dbSku').value); if(!sku){toast('SKU is required');return;}
  const original=normalizeSku(state.dbSelectedSku||'');
  const renamed=!!original&&original!==sku;
  if(renamed && getProduct(sku)){toast(`SKU ${sku} already exists — choose another code`);return;}
  const existing=getProduct(original||sku);
  const p=normalizeProduct({sku,description:$('dbDescription').value,family:$('dbFamily').value,category:$('dbCategory').value,finish:$('dbFinish').value,area:$('dbArea').value,size:$('dbSize').value,mounting:$('dbMounting').value,function:$('dbFunction').value,outlets:$('dbOutlets').value,shape:$('dbShape').value,keywords:$('dbKeywords').value,requiredBodies:$('dbRequired').value,status:$('dbStatus').value,replacement:$('dbReplacement').value,source:$('dbSource').value.trim()||existing?.source||'Manual Database Edit',sourceVersion:$('dbSourceVersion').value.trim()||existing?.sourceVersion||'',finishSkuCode:existing?.finishSkuCode||'',custom:true});
  if(!p.description){toast('Product name / description is required');return;}
  if(renamed){
    await renameSkuReferences(original,sku);
    const old=existing||seedProductBySku(original);
    if(old) await idbPut(STORE_PRODUCTS,{...old,sku:original,deleted:true,custom:true,deletedAt:new Date().toISOString(),renamedTo:sku});
    await idbPut(STORE_PRODUCTS,p); await logDbChange('Renamed',sku,`${original} → ${sku} · ${p.description}`);
  }else{
    await idbPut(STORE_PRODUCTS,p); await logDbChange(existing?'Edited':'Added',p.sku,p.description);
  }
  state.dbSelectedSku=p.sku; await loadProducts(); await loadProjects(); await renderDatabaseManager(); renderProject(); toast(renamed?`${original} renamed to ${sku}`:`${p.sku} saved locally`);
}

async function deleteDbSku(){
  const sku=normalizeSku($('dbSku').value||state.dbSelectedSku); if(!sku) return;
  const p=getProduct(sku); if(!p) return;
  if(!confirm(`Remove ${sku} from the local product database?\n\nThis removal is remembered locally and can be restored from Database → Removed locally.`)) return;
  await idbPut(STORE_PRODUCTS,{...p,sku,deleted:true,custom:true,deletedAt:new Date().toISOString()});
  await logDbChange('Removed',sku,p.description);
  state.dbSelectedSku=''; await loadProducts(); clearDbEditor(); populateDatabaseFilters(); await renderChangeHistory(); renderProject(); toast(`${sku} removed locally`);
}

async function revertDbSku(){
  const sku=normalizeSku($('dbSku').value||state.dbSelectedSku); if(!sku) return;
  const seed=seedProductBySku(sku); const override=await idbGet(STORE_PRODUCTS,sku);
  if(!override){toast('This SKU has no local override');return;}
  if(override.deleted){
    if(seed){
      if(!confirm(`Restore ${sku} to the supplied starter catalogue record?`)) return;
      await idbDelete(STORE_PRODUCTS,sku); await logDbChange('Restored',sku,'Restored supplied starter record');
    }else{
      if(!confirm(`Restore the locally removed SKU ${sku}?`)) return;
      const restored={...override,deleted:false,custom:true}; delete restored.deletedAt; await idbPut(STORE_PRODUCTS,restored); await logDbChange('Restored',sku,'Restored local-only record');
    }
    state.dbSelectedSku=sku; await loadProducts(); await renderDatabaseManager(); renderProject(); toast(`${sku} restored`); return;
  }
  if(!confirm(seed?`Revert ${sku} to the supplied starter catalogue record?`:`Remove the locally added SKU ${sku}?`)) return;
  await idbDelete(STORE_PRODUCTS,sku); await logDbChange('Reverted',sku,seed?'Restored starter record':'Removed local-only record');
  state.dbSelectedSku=seed?sku:''; await loadProducts(); if(seed) selectDbSku(sku); else clearDbEditor(); await renderChangeHistory(); renderProject(); toast(seed?`${sku} restored`:`${sku} local record removed`);
}

async function resetCustomDb(){
  if(!confirm('Reset ALL local database edits, additions and removals? Projects are not affected.'))return;
  await createDatabaseBackup('Before reset of local database changes');
  await idbClear(STORE_PRODUCTS); state.compatRules=[]; await setMeta('compatRules',[]); await logDbChange('Reset database','','All local product changes and compatibility rules cleared'); state.dbSelectedSku=''; await loadProducts(); await renderDatabaseManager(); renderProject(); toast('Local database changes reset');
}

function exportMasterCsv(){
  const headers=['SKU','Description','Family','Category','Finish','Area','Size','Mounting','Function','Outlets','Shape','Keywords','Required Body','Status','Replacement','Source','Source Version'];
  const rows=state.products.map(p=>[p.sku,p.description,p.family,p.category,p.finish,p.area,p.size,p.mounting,p.function,p.outlets,p.shape,p.keywords||'',(p.requiredBodies||[]).join('; '),p.status,p.replacement||'',p.source,p.sourceVersion||'']);
  downloadText('GROHE_Product_Master.csv',toCsv([headers,...rows]),'text/csv;charset=utf-8');
}
function exportMasterJson(){ downloadText('GROHE_Product_Master.json',JSON.stringify(state.products,null,2),'application/json'); }
function toCsv(rows){return '\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');}
function downloadText(name,text,type='text/plain'){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}

function missingImageProducts(){
  if(!state.imageFolderConnected) return [];
  return state.products.filter(p=>!getImageFile(p.sku));
}

function renderMissingImages(){
  const notice=$('missingImagesNotice'), listEl=$('missingImageList'), countEl=$('missingImageCount');
  if(!state.imageFolderConnected){
    notice.textContent='No image folder is loaded. Click Load image folder and select G:\\My Drive\\Images (or your current product-image folder).';
    notice.classList.remove('good-note'); listEl.innerHTML=''; countEl.textContent=''; return;
  }
  const all=missingImageProducts();
  const q=normalizeText($('missingImageSearch')?.value||'');
  const filtered=q?searchProducts(q,all):all;
  notice.textContent=`${state.imageSource==='server'?(state.imageServerPath||'G:\\My Drive\\Images'):'Selected image folder'} · ${state.imageFiles.size.toLocaleString()} image filenames indexed.`;
  notice.classList.add('good-note');
  countEl.textContent=`${all.length.toLocaleString()} database SKUs have no matching image filename${q?` · ${filtered.length.toLocaleString()} shown by filter`:''}`;
  listEl.innerHTML=filtered.map(p=>`<div class="missing-image-row"><strong>${esc(p.sku)}</strong><span>${esc(p.description)}</span><small>${esc([p.family,p.category].filter(Boolean).join(' · '))}</small></div>`).join('') || '<div class="db-empty">No missing images match this filter.</div>';
}

function openMissingImages(){
  $('missingImageSearch').value=''; renderMissingImages(); $('missingImagesDialog').showModal();
}

async function copyMissingSkus(){
  if(!state.imageFolderConnected){toast('Automatic image folder is unavailable — launch with start.bat');return;}
  const text=missingImageProducts().map(p=>p.sku).join('\n');
  try{await navigator.clipboard.writeText(text);toast(`${missingImageProducts().length} missing-image SKUs copied`);}
  catch(_){downloadText('Missing_Image_SKUs.txt',text,'text/plain;charset=utf-8');toast('Clipboard unavailable — text file exported instead');}
}

function exportMissingImages(){
  if(!state.imageFolderConnected){toast('Automatic image folder is unavailable — launch with start.bat');return;}
  const rows=missingImageProducts().map(p=>[p.sku,p.description,p.family,p.category,p.finish,p.status]);
  downloadText('GROHE_Missing_Images.csv',toCsv([['SKU','Description','Family','Category','Finish','Status'],...rows]),'text/csv;charset=utf-8');
}

function openReplaceDialog(itemId){
  state.replaceItemId=itemId;
  const current=state.project?.items.find(x=>x.id===itemId)?.sku||'';
  $('replaceSearch').value=current;
  renderReplaceResults();
  $('replaceDialog').showModal();
  setTimeout(()=>{const input=$('replaceSearch');input.focus();input.select();},50);
}
function renderReplaceResults(){
  const query=$('replaceSearch').value.trim(); let list=query?searchProducts(query):[]; list=list.slice(0,30);
  $('replaceResults').innerHTML=list.map(p=>`<div class="replace-row"><div><strong>${esc(p.sku)}</strong><small>${esc(p.description)} · ${esc(p.finish||'')}</small></div><button class="btn primary small" data-choose-replace="${p.sku}">Use</button></div>`).join('') || '<small>Type a SKU, family or description.</small>';
  qsa('[data-choose-replace]',$('replaceResults')).forEach(b=>b.onclick=()=>replaceItemSku(state.replaceItemId,b.dataset.chooseReplace));
}
async function replaceItemSku(itemId,newSku){
  const item=state.project?.items.find(x=>x.id===itemId);const p=getProduct(newSku);if(!item||!p)return;
  pushProjectHistory(`Replace ${item.sku} with ${p.sku}`);
  item.sku=p.sku; item.finishMismatchAcknowledged=false;
  if(!item.auto){
    item.concealedSuppressed=false;
    state.project.items=state.project.items.filter(x=>x.parentItemId!==item.id);
    const candidates=bodyCandidatesForProduct(p);
    if(candidates.length){const chosen=preferredBodyCandidate(p,candidates),body=getProduct(chosen);if(body)state.project.items.splice(state.project.items.indexOf(item)+1,0,{id:uid(),type:'product',sku:body.sku,qty:item.qty||1,auto:true,componentRole:'required-body',parentItemId:item.id,groupId:item.id,validationOverride:false,note:'Automatically added concealed component'});}
  }
  await touchProject(); if($('replaceDialog').open)$('replaceDialog').close(); renderProject(); renderResults(); toast(`Replaced with ${p.sku}`);
}

function projectExportRows(){
  if(!state.project)return [];
  let section=''; const rows=[];
  for(const item of state.project.items){
    if(item.type==='section'){section=item.title;rows.push({section,sectionRow:true});continue;}
    const p=getProduct(item.sku)||normalizeProduct({sku:item.sku,description:'Unknown SKU'});
    const warnings=itemWarnings(item).join(' | ');
    rows.push({section,sku:p.sku,description:p.description,family:p.family,finish:p.finish,qty:item.qty||1,mode:item.auto?'Auto':'Manual',parentSku:parentSku(item),status:p.status||'Active',replacement:p.replacement||'',warning:warnings});
  }
  return rows;
}

  // ===== 70_export_templates.js =====
async function exportExcel(){
  if(!state.project){toast('Create or open a project first');return;}
  const rows=projectExportRows();
  const data=[['Section','SKU','Picture','Description','Family','Finish','Qty','Auto / Manual','Parent SKU','Status','Validation']];
  const imageRows=[];
  rows.forEach(r=>{
    if(r.sectionRow)data.push([r.section,'','','','','','','','','','']);
    else {data.push([r.section,r.sku,'',r.description,r.family,r.finish,r.qty,r.mode,r.parentSku,r.status,r.warning]);imageRows.push({row:data.length,col:3,sku:r.sku});}
  });
  toast('Preparing Excel with product pictures…');
  const blob=await buildXlsx(data,rows.map((r,i)=>r.sectionRow?i+2:null).filter(Boolean),imageRows);
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${safeFilename(state.project.name)} - ${safeFilename(activeSelectionOption()?.name||'Selection')}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Excel file exported with pictures');
}

async function exportImageBytes(sku){
  const src=imageUrlFor(sku); if(!src) return null;
  try{
    const response=await fetch(src); if(!response.ok) return null;
    const type=(response.headers.get('content-type')||'image/jpeg').toLowerCase();
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!bytes.length) return null;
    return {bytes,type};
  }catch(_){return null;}
}

async function loadExportPictures(imageRows=[]){
  const unique=[...new Set(imageRows.map(x=>normalizeSku(x.sku)).filter(Boolean))];
  const map=new Map(); let cursor=0; const workers=[];
  const worker=async()=>{while(cursor<unique.length){const sku=unique[cursor++];const img=await exportImageBytes(sku);if(img)map.set(sku,img);}};
  for(let i=0;i<Math.min(8,unique.length);i++)workers.push(worker());
  await Promise.all(workers); return map;
}

// Dependency-free XLSX writer with embedded product pictures.
async function buildXlsx(data,sectionRows=[],imageRows=[]){
  const xmlEsc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const colName=n=>{let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;};
  const pictures=await loadExportPictures(imageRows);
  const usable=imageRows.filter(x=>pictures.has(normalizeSku(x.sku)));
  const imageRowSet=new Set(usable.map(x=>x.row));
  const maxCols=Math.max(...data.map(r=>r.length),1);
  let sheet='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>';
  for(let ci=1;ci<=maxCols;ci++){
    const header=String(data[0]?.[ci-1]||'');
    let width=16;
    if(header==='Section')width=22; else if(header==='SKU')width=16; else if(header==='Picture')width=14; else if(header==='Description')width=58; else if(header==='Family'||header==='Finish')width=24;
    sheet+=`<col min="${ci}" max="${ci}" width="${width}" customWidth="1"/>`;
  }
  sheet+='</cols><sheetData>';
  data.forEach((row,ri)=>{const rn=ri+1;const style=ri===0?1:(sectionRows.includes(rn)?2:0);const ht=imageRowSet.has(rn)?' ht="72" customHeight="1"':'';sheet+=`<row r="${rn}"${ht}>`;row.forEach((v,ci)=>{const ref=colName(ci+1)+rn;if(typeof v==='number')sheet+=`<c r="${ref}" s="${style}"><v>${v}</v></c>`;else sheet+=`<c r="${ref}" s="${style}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;});sheet+='</row>';});
  sheet+=`</sheetData><autoFilter ref="A1:${colName(maxCols)}1"/>${usable.length?'<drawing r:id="rId1"/>':''}</worksheet>`;

  const files={
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+(usable.length?'<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>':'')+'</Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Selection" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F2B4B"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF356FD1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml':sheet
  };
  if(usable.length){
    let drawing='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    let rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    usable.forEach((item,i)=>{
      const sku=normalizeSku(item.sku),img=pictures.get(sku),idx=i+1,ext=img.type.includes('png')?'png':'jpg';
      files[`xl/media/image${idx}.${ext}`]=img.bytes;
      rels+=`<Relationship Id="rId${idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${idx}.${ext}"/>`;
      const col=Math.max(0,(item.col||1)-1),row=Math.max(0,item.row-1),emu=64*9525;
      drawing+=`<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${emu}" cy="${emu}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${idx}" name="${xmlEsc(sku)}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${idx}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu}" cy="${emu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
    });
    drawing+='</xdr:wsDr>'; rels+='</Relationships>';
    files['xl/drawings/drawing1.xml']=drawing; files['xl/drawings/_rels/drawing1.xml.rels']=rels;
    files['xl/worksheets/_rels/sheet1.xml.rels']='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
  }
  return new Blob([zipStore(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

function zipStore(files){
  const te=new TextEncoder();const chunks=[];const central=[];let offset=0;
  const u16=n=>new Uint8Array([n&255,(n>>>8)&255]); const u32=n=>new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255]);
  const concat=arrs=>{const len=arrs.reduce((s,a)=>s+a.length,0);const out=new Uint8Array(len);let o=0;arrs.forEach(a=>{out.set(a,o);o+=a.length;});return out;};
  const crcTable=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  const crc32=data=>{let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
  Object.entries(files).forEach(([name,content])=>{const nameB=te.encode(name),data=content instanceof Uint8Array?content:te.encode(String(content)),crc=crc32(data);const local=concat([u32(0x04034b50),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameB.length),u16(0),nameB,data]);chunks.push(local);const cent=concat([u32(0x02014b50),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(data.length),u32(data.length),u16(nameB.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),nameB]);central.push(cent);offset+=local.length;});
  const centralBlob=concat(central);const end=concat([u32(0x06054b50),u16(0),u16(0),u16(central.length),u16(central.length),u32(centralBlob.length),u32(offset),u16(0)]);return concat([...chunks,centralBlob,end]);
}


function projectManualSkus(){
  return state.project?(state.project.items||[]).filter(x=>x.type==='product'&&!x.auto).map(x=>normalizeSku(x.sku)).filter(Boolean):[];
}

async function toggleFavorite(sku){
  const key=normalizeSku(sku); if(!key) return;
  if(state.favorites.has(key)) state.favorites.delete(key); else state.favorites.add(key);
  const top=$('resultsList')?.scrollTop||0; await persistFavorites(); renderFilters(); requestAnimationFrame(()=>{if($('resultsList'))$('resultsList').scrollTop=top;});
}

function extractPastedSkus(text){
  const found=[];
  for(const line of String(text||'').split(/\r?\n/)){
    const cells=line.split(/[\t,;]+/).map(x=>x.trim()).filter(Boolean);
    let hit='';
    for(const cell of cells){
      const raw=cell.match(/[A-Za-z0-9][A-Za-z0-9\- ]{5,14}/g)||[];
      for(const token of raw){
        const sku=normalizeSku(token);
        if(sku.length>=7 && sku.length<=11 && /\d/.test(sku) && state.productMap.has(sku)){hit=sku;break;}
      }
      if(hit) break;
    }
    if(!hit){
      const sku=normalizeSku(line);
      if(state.productMap.has(sku)) hit=sku;
    }
    if(hit) found.push(hit);
  }
  return found;
}

function previewPastedSkus(){
  const skus=extractPastedSkus($('pasteSkusText').value);
  const lines=String($('pasteSkusText').value||'').split(/\r?\n/).filter(x=>x.trim()).length;
  $('pasteSkusPreview').innerHTML=`<strong>${skus.length}</strong> valid GROHE SKUs found${lines>skus.length?` · ${lines-skus.length} row(s) not matched`:''}<div class="paste-chip-list">${skus.slice(0,24).map(s=>`<span>${esc(s)}</span>`).join('')}${skus.length>24?`<span>+${skus.length-24}</span>`:''}</div>`;
  return skus;
}

function appendProductToProject(sku){
  const p=getProduct(sku); if(!p||!state.project) return false;
  const parent={id:uid(),type:'product',sku:p.sku,qty:1,auto:false,parentItemId:null,groupId:null,validationOverride:false,concealedSuppressed:false,note:''}; parent.groupId=parent.id;
  state.project.items.push(parent);
  const candidates=bodyCandidatesForProduct(p);
  if(candidates.length){
    const bodySku=preferredBodyCandidate(p,candidates), body=getProduct(bodySku);
    if(body) state.project.items.push({id:uid(),type:'product',sku:body.sku,qty:parent.qty||1,auto:true,componentRole:'required-body',parentItemId:parent.id,groupId:parent.id,validationOverride:false,note:'Automatically added concealed component'});
  }
  return true;
}

async function applyPastedSkus(){
  if(!state.project){$('pasteSkusDialog').close();openProjectDialog('new');return;}
  const skus=previewPastedSkus(); if(!skus.length){toast('No valid database SKUs found');return;}
  pushProjectHistory(`Paste ${skus.length} SKU${skus.length===1?'':'s'}`);
  let added=0; for(const sku of skus) if(appendProductToProject(sku)){added++;state.recentProducts=[sku,...state.recentProducts.filter(x=>x!==sku)].slice(0,40);}
  await setMeta('recentProducts',state.recentProducts); await touchProject(); $('pasteSkusDialog').close(); renderProject(); renderFilters(); toast(`${added} SKUs added`);
}

function openPasteSkus(){ $('pasteSkusText').value=''; $('pasteSkusPreview').innerHTML=''; $('pasteSkusDialog').showModal(); setTimeout(()=>$('pasteSkusText').focus(),30); }

async function copySelection(){
  const skus=projectManualSkus(); if(!skus.length){toast('No selected SKUs');return;}
  try{await navigator.clipboard.writeText(skus.join('\n'));toast(`${skus.length} SKUs copied`);}catch(_){downloadText('Selected_SKUs.txt',skus.join('\r\n'));}
}

function templateItemsFromProject(sectionOnly=false){
  if(!state.project) return [];
  let items=state.project.items||[];
  if(sectionOnly){
    let last=-1; for(let i=items.length-1;i>=0;i--) if(items[i].type==='section'){last=i;break;}
    if(last>=0) items=items.slice(last);
  }
  return items.filter(x=>x.type==='section'||(x.type==='product'&&!x.auto)).map(x=>x.type==='section'?{type:'section',title:x.title}:{type:'product',sku:normalizeSku(x.sku)});
}

async function saveTemplate(name,items,kind='bundle'){
  if(!items.length){toast('Nothing to save');return;}
  state.templates.unshift({id:uid(),name:String(name||'Template').trim()||'Template',kind,items,createdAt:new Date().toISOString()});
  state.templates=state.templates.slice(0,100); await setMeta('templates',state.templates); renderTemplates(); toast('Template saved');
}

async function saveCurrentProjectTemplate(){
  if(!state.project) return;
  const name=prompt('Template name',state.project.name); if(!name) return;
  await saveTemplate(name,templateItemsFromProject(false),'project');
}

async function saveCurrentSectionBundle(){
  if(!state.project) return;
  const items=templateItemsFromProject(true); const section=items.find(x=>x.type==='section');
  const name=prompt('Bundle name',section?.title||'Bathroom bundle'); if(!name) return;
  await saveTemplate(name,items,'bundle');
}

async function applyTemplate(id){
  if(!state.project){$('templatesDialog').close();openProjectDialog('new');return;}
  const t=state.templates.find(x=>x.id===id); if(!t) return;
  pushProjectHistory(`Add template ${t.name}`);
  let added=0;
  for(const it of t.items||[]){
    if(it.type==='section') state.project.items.push({id:uid(),type:'section',title:it.title||t.name});
    else if(it.type==='product' && appendProductToProject(it.sku)) added++;
  }
  await touchProject(); $('templatesDialog').close(); renderProject(); renderFilters(); toast(`${t.name}: ${added} products added`);
}

async function deleteTemplate(id){
  const t=state.templates.find(x=>x.id===id); if(!t||!confirm(`Delete template "${t.name}"?`)) return;
  state.templates=state.templates.filter(x=>x.id!==id); await setMeta('templates',state.templates); renderTemplates();
}

function renderTemplates(){
  const q=normalizeText($('templateSearch')?.value||'');
  const list=state.templates.filter(t=>{const itemText=(t.items||[]).filter(x=>x.type==='product').map(x=>{const p=getProduct(x.sku);return [x.sku,p?.family,p?.category,p?.finish,p?.description].filter(Boolean).join(' ');}).join(' ');return !q||smartTextSearchMatch(q,[t.name,t.kind,itemText].join(' '));});
  $('templateList').innerHTML=list.map(t=>`<div class="template-row"><div><strong>${esc(t.name)}</strong><small>${esc(t.kind)} · ${(t.items||[]).filter(x=>x.type==='product').length} products</small></div><div><button class="btn small" data-use-template="${t.id}">Add</button><button class="icon-btn" data-delete-template="${t.id}" title="Delete">×</button></div></div>`).join('')||'<div class="db-empty">No saved templates yet.</div>';
  qsa('[data-use-template]',$('templateList')).forEach(b=>b.onclick=()=>applyTemplate(b.dataset.useTemplate));
  qsa('[data-delete-template]',$('templateList')).forEach(b=>b.onclick=()=>deleteTemplate(b.dataset.deleteTemplate));
}
function openTemplates(){renderTemplates();$('templatesDialog').showModal();}

async function duplicateCurrentSection(){
  if(!state.project?.items?.length) return;
  const items=state.project.items; let section=null;
  for(let i=items.length-1;i>=0;i--){if(items[i].type==='section'){section=items[i];break;}}
  if(section){await duplicateRoomById(section.id);return;}
  // Projects created before room dividers existed: preserve the legacy behavior.
  pushProjectHistory('Duplicate current selection');
  const block=items.filter(x=>x.type==='product'); const idMap=new Map(); block.forEach(it=>idMap.set(it.id,uid()));
  const copy=block.map(it=>{const c=structuredClone(it);c.id=idMap.get(it.id);if(c.parentItemId)c.parentItemId=idMap.get(c.parentItemId)||c.parentItemId;if(c.groupId)c.groupId=idMap.get(c.groupId)||c.groupId;return c;});
  state.project.items.push(...copy); await touchProject(); renderProject(); renderFilters(); toast('Selection duplicated');
}

function openReviewIssues(){
  const issues=projectWarnings(); const productCount=state.project?(state.project.items||[]).filter(x=>x.type==='product'&&!x.auto).length:0;
  $('reviewSummary').innerHTML=`<strong>${productCount}</strong> selected products · <strong>${issues.length}</strong> issue${issues.length===1?'':'s'}`;
  $('reviewIssueList').innerHTML=issues.map(({item,w})=>{const p=getProduct(item.sku);return `<div class="review-issue"><div><strong>${esc(item.sku)}</strong><span>${esc(p?.description||'')}</span></div><p>${esc(w)}</p><div class="review-actions">${/Missing required concealed body/.test(w)?`<button class="btn small" data-repair-body="${item.id}">Repair body</button>`:''}${p?.replacement?`<button class="btn small" data-use-replacement="${item.id}" data-replacement="${esc(p.replacement)}">Use ${esc(p.replacement)}</button>`:''}</div></div>`;}).join('')||'<div class="good-review">✓ No compatibility, finish or lifecycle issues found.</div>';
  qsa('[data-repair-body]',$('reviewIssueList')).forEach(b=>b.onclick=async()=>{const parent=state.project.items.find(x=>x.id===b.dataset.repairBody);if(!parent)return;pushProjectHistory(`Repair concealed body for ${parent.sku}`);parent.concealedSuppressed=false;await ensureRequiredComponents(true);renderProject();openReviewIssues();});
  qsa('[data-use-replacement]',$('reviewIssueList')).forEach(b=>b.onclick=async()=>{await replaceItemSku(b.dataset.useReplacement,b.dataset.replacement);openReviewIssues();});
  $('reviewDialog').showModal();
}

function currentSectionNames(){
  return state.project?[...new Set((state.project.items||[]).filter(x=>x.type==='section').map(x=>x.title))]:[];
}
function openExportDialog(){
  if(!state.project){openProjectDialog('new');return;}
  $('exportSection').innerHTML='<option value="">All sections</option>'+currentSectionNames().map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  $('exportDialog').showModal();
}

function exportRowsForSection(sectionName=''){
  const rows=projectExportRows(); if(!sectionName) return rows;
  return rows.filter(r=>r.section===sectionName || (r.sectionRow&&r.section===sectionName));
}
async function runPresetExport(){
  const preset=document.querySelector('input[name="exportPreset"]:checked')?.value||'standard';
  const section=$('exportSection').value||''; const rows=exportRowsForSection(section);
  let data, sectionRows=[], imageRows=[];
  if(preset==='sku'){
    data=[['SKU','Picture','Qty']];
    rows.filter(r=>!r.sectionRow).forEach(r=>{data.push([r.sku,'',r.qty]);imageRows.push({row:data.length,col:2,sku:r.sku});});
  }else if(preset==='purchasing'){
    data=[['Section','SKU','Picture','Description','Qty','Status','Replacement']];
    rows.filter(r=>!r.sectionRow).forEach(r=>{data.push([r.section,r.sku,'',r.description,r.qty,r.status,r.replacement||'']);imageRows.push({row:data.length,col:3,sku:r.sku});});
  }else if(preset==='technical'){
    data=[['Section','SKU','Picture','Description','Family','Finish','Parent / Concealed','Validation']];
    rows.filter(r=>!r.sectionRow).forEach(r=>{data.push([r.section,r.sku,'',r.description,r.family,r.finish,r.parentSku,r.warning]);imageRows.push({row:data.length,col:3,sku:r.sku});});
  }else{
    data=[['Section','SKU','Picture','Description','Family','Finish','Qty','Auto / Manual','Parent SKU','Status','Validation']];
    rows.forEach(r=>{if(r.sectionRow){sectionRows.push(data.length+1);data.push([r.section,'','','','','','','','','','']);}else{data.push([r.section,r.sku,'',r.description,r.family,r.finish,r.qty,r.mode,r.parentSku,r.status,r.warning]);imageRows.push({row:data.length,col:3,sku:r.sku});}});
  }
  toast('Preparing Excel with product pictures…');
  const blob=await buildXlsx(data,sectionRows,imageRows),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${safeFilename(state.project.name)} - ${safeFilename(activeSelectionOption()?.name||'Selection')}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);$('exportDialog').close();toast('Excel exported with pictures');
}


async function createDatabaseBackup(reason='Manual backup'){
  const rows=await idbGetAll(STORE_PRODUCTS), rules=state.compatRules||[];
  const timestamp=new Date().toISOString(); const key=`backup:${timestamp}`;
  await idbPut(STORE_META,{key,value:{timestamp,reason,products:rows,rules}});
  const all=(await idbGetAll(STORE_META)).filter(x=>String(x.key).startsWith('backup:')).sort((a,b)=>String(b.key).localeCompare(String(a.key)));
  for(const old of all.slice(12)) await idbDelete(STORE_META,old.key);
  return key;
}

async function renderBackups(){
  const list=(await idbGetAll(STORE_META)).filter(x=>String(x.key).startsWith('backup:')).sort((a,b)=>String(b.key).localeCompare(String(a.key)));
  $('backupList').innerHTML=list.map(row=>`<div class="backup-row"><div><strong>${esc(row.value?.reason||'Backup')}</strong><small>${esc(new Date(row.value?.timestamp||row.key.slice(7)).toLocaleString())} · ${(row.value?.products||[]).length} local overrides</small></div><div><button class="btn small" data-restore-backup="${esc(row.key)}">Restore</button><button class="icon-btn" data-delete-backup="${esc(row.key)}">×</button></div></div>`).join('')||'<div class="db-empty">No backups yet.</div>';
  qsa('[data-restore-backup]',$('backupList')).forEach(b=>b.onclick=()=>restoreDatabaseBackup(b.dataset.restoreBackup));
  qsa('[data-delete-backup]',$('backupList')).forEach(b=>b.onclick=async()=>{if(confirm('Delete this backup?')){await idbDelete(STORE_META,b.dataset.deleteBackup);renderBackups();}}); renderRuntimeErrors();
}
async function restoreDatabaseBackup(key){
  const row=await idbGet(STORE_META,key); if(!row?.value||!confirm('Restore this database backup? Current local product edits will be replaced.')) return;
  await createDatabaseBackup('Automatic backup before restore'); await idbClear(STORE_PRODUCTS); for(const p of row.value.products||[]) await idbPut(STORE_PRODUCTS,p); state.compatRules=row.value.rules||[]; await setMeta('compatRules',state.compatRules); await loadProducts();await renderDatabaseManager();renderProject();toast('Database backup restored');
}

function ruleMatchesProduct(rule,p){
  if(rule?.enabled===false) return false; if(rule.category&&normalizeText(rule.category)!==normalizeText(p.category))return false;
  const v=String(rule.matchValue||'').trim(); if(!v)return false;
  if(rule.matchType==='exact')return p.sku===normalizeSku(v); if(rule.matchType==='prefix')return p.sku.startsWith(normalizeSku(v));
  const hay=normalizeText([p.sku,p.description,p.family,p.category,p.area,p.keywords].join(' '));return normalizeText(v).split(/\s+/).filter(Boolean).every(t=>hay.includes(t));
}
function renderCompatRules(){
  $('compatRulesList').innerHTML=(state.compatRules||[]).map(r=>`<button class="compat-rule-row ${$('ruleId').value===r.id?'active':''}" data-rule-id="${r.id}"><strong>${esc(r.name||'Rule')}</strong><small>${esc(r.matchType)}: ${esc(r.matchValue)} → ${esc(r.bodies||'')}</small><span>${state.products.filter(p=>ruleMatchesProduct(r,p)).length} matches</span></button>`).join('')||'<div class="db-empty">No local compatibility rules. Catalogue rules still apply automatically.</div>';
  qsa('[data-rule-id]',$('compatRulesList')).forEach(b=>b.onclick=()=>selectCompatRule(b.dataset.ruleId));
}
function clearRuleEditor(){['ruleId','ruleName','ruleMatchValue','ruleBodies','ruleCategory','ruleNotes'].forEach(id=>$(id).value='');$('ruleMatchType').value='exact';$('ruleEnabled').checked=true;renderCompatRules();}
function selectCompatRule(id){const r=state.compatRules.find(x=>x.id===id);if(!r)return;$('ruleId').value=r.id;$('ruleName').value=r.name||'';$('ruleMatchType').value=r.matchType||'exact';$('ruleMatchValue').value=r.matchValue||'';$('ruleBodies').value=r.bodies||'';$('ruleCategory').value=r.category||'';$('ruleNotes').value=r.notes||'';$('ruleEnabled').checked=r.enabled!==false;renderCompatRules();}
async function saveCompatRule(){
  const matchValue=$('ruleMatchValue').value.trim(),bodies=$('ruleBodies').value.trim();if(!matchValue||!bodies){toast('Rule match and body SKU are required');return;}
  const id=$('ruleId').value||uid(); const r={id,name:$('ruleName').value.trim()||'Compatibility rule',matchType:$('ruleMatchType').value,matchValue,bodies,category:$('ruleCategory').value.trim(),notes:$('ruleNotes').value.trim(),enabled:$('ruleEnabled').checked,updatedAt:new Date().toISOString()};
  const i=state.compatRules.findIndex(x=>x.id===id);if(i>=0)state.compatRules[i]=r;else state.compatRules.unshift(r);await setMeta('compatRules',state.compatRules);await logDbChange('Compatibility rule','',`${r.name}: ${r.matchValue} → ${r.bodies}`);await loadProducts();selectCompatRule(id);renderQualityAudit();toast('Compatibility rule saved');
}
async function deleteCompatRule(){const id=$('ruleId').value;if(!id)return;const r=state.compatRules.find(x=>x.id===id);if(!r||!confirm(`Delete rule "${r.name}"?`))return;state.compatRules=state.compatRules.filter(x=>x.id!==id);await setMeta('compatRules',state.compatRules);clearRuleEditor();await loadProducts();toast('Rule deleted');}

function buildQualityIssues(){
  const issues=[];
  for(const p of state.products){
    if(state.imageFolderConnected&&!getImageFile(p.sku))issues.push({type:'missingImage',sku:p.sku,msg:'Missing product image'});
    if(!p.category||/other catalogue item/i.test(p.category))issues.push({type:'missingCategory',sku:p.sku,msg:`Category needs review: ${p.category||'blank'}`});
    else if(String(p.categoryConfidence||'').toLowerCase()==='low')issues.push({type:'categoryReview',sku:p.sku,msg:`Category review: ${p.category}${p.categoryReason?` · ${p.categoryReason}`:''}`});
    if(!p.family||/universal \/ other/i.test(p.family))issues.push({type:'missingFamily',sku:p.sku,msg:'Family / collection needs review'});
    if((!p.finish||p.finish==='No colour / technical')&&!/Concealed|Installation|Flushing|Spare|Safety|Waste/.test(p.category))issues.push({type:'missingFinish',sku:p.sku,msg:'Finish is not classified'});
    const hay=normalizeText([p.description,p.fullText].join(' '));
    if(p.compatibilityTag==='multi-component-required') issues.push({type:'missingCompatibility',sku:p.sku,msg:'Complex system: multiple separately ordered installation components need project-specific review'});
    else if(!isWcActuationProduct(p)&&/without concealed body|final installation for|requires rough(?:ing)?[- ]?in|for concealed valve|concealed (?:fitting|installation|mounting) box/.test(hay)&&!bodyCandidatesForProduct(p).length)issues.push({type:'missingCompatibility',sku:p.sku,msg:'Product indicates a separate body / rough-in but no relationship is stored'});
    for(const ref of p.requiredBodies||[]) if(!state.productMap.has(normalizeSku(ref))) issues.push({type:'brokenReference',sku:p.sku,msg:`Concealed / rough-in SKU ${ref} is not in the product master`});
    if(p.replacement && !state.productMap.has(normalizeSku(p.replacement))) issues.push({type:'brokenReference',sku:p.sku,msg:`Replacement SKU ${p.replacement} is not in the product master`});
    if(['Legacy Catalogue','Discontinued / Pruned'].includes(p.status))issues.push({type:'legacy',sku:p.sku,msg:p.status});
  }
  state.qualityIssues=issues; return issues;
}
function renderQualityAudit(){
  if(!$('qualityMetrics'))return;const issues=buildQualityIssues();const productsWithIssues=new Set(issues.map(x=>x.sku)).size;const completeness=Math.max(0,Math.round((1-productsWithIssues/Math.max(1,state.products.length))*100));
  const counts=t=>issues.filter(x=>x.type===t).length;$('qualityMetrics').innerHTML=`<div><strong>${completeness}%</strong><span>clean records</span></div><div><strong>${counts('missingImage')}</strong><span>missing images</span></div><div><strong>${counts('missingCompatibility')}</strong><span>compatibility gaps</span></div><div><strong>${counts('missingCategory')+counts('missingFamily')}</strong><span>taxonomy gaps</span></div>`;
  const type=$('qualityIssueType')?.value||'';const list=type?issues.filter(x=>x.type===type):issues;
  $('qualityIssueList').innerHTML=list.slice(0,2000).map(x=>{const p=getProduct(x.sku);return `<button class="quality-row" data-quality-sku="${esc(x.sku)}"><strong>${esc(x.sku)}</strong><span>${esc(x.msg)}</span><small>${esc(p?.description||'')}</small></button>`;}).join('')||'<div class="good-review">✓ No issues in this category.</div>';
  qsa('[data-quality-sku]',$('qualityIssueList')).forEach(b=>b.onclick=()=>{setDbTab('products');selectDbSku(b.dataset.qualitySku);});
}
function exportQuality(){const issues=buildQualityIssues();const rows=[['Type','SKU','Issue','Description'],...issues.map(x=>[x.type,x.sku,x.msg,getProduct(x.sku)?.description||''])];downloadText('GROHE_Data_Quality_Issues.csv',toCsv(rows),'text/csv;charset=utf-8');}

function setDbTab(tab){
  const layout=$('databaseLayout');if(!layout)return;layout.dataset.tab=tab;qsa('[data-db-tab]',$('dbTabs')).forEach(b=>b.classList.toggle('active',b.dataset.dbTab===tab));
  if(tab==='rules')renderCompatRules();else if(tab==='quality')renderQualityAudit();else if(tab==='backups'){renderBackups();renderChangeHistory();}else if(tab==='import'){$('dbImportPanel').open=true;}
}

function previewImportRows(){
  const rows=parseDelimited($('importText').value);let add=0,update=0,same=0,conflict=0;
  const details=rows.map(r=>{const old=getProduct(r.sku);if(!old){add++;r._importType='ADD';return {r,type:'ADD'};}const keys=['description','family','category','finish','area','size','mounting','function','outlets','shape','keywords','status','replacement'];const changed=keys.some(k=>String(old[k]||'')!==String(r[k]||''))||JSON.stringify(old.requiredBodies||[])!==JSON.stringify(r.requiredBodies||[]);if(!changed){same++;r._importType='UNCHANGED';return {r,type:'UNCHANGED'};}if(old.custom){conflict++;r._importType='CONFLICT';return {r,type:'CONFLICT'};}update++;r._importType='UPDATE';return {r,type:'UPDATE'};});
  state.importPreviewRows=rows;
  $('importPreview').innerHTML=`<div class="import-summary"><strong>${add}</strong> add · <strong>${update}</strong> update · <strong>${conflict}</strong> local conflicts · <strong>${same}</strong> unchanged</div><div class="import-preview-list">${details.slice(0,120).map(x=>`<div class="import-preview-row ${x.type.toLowerCase()}"><strong>${x.type}</strong><span>${esc(x.r.sku)}</span><small>${esc(x.r.description)}</small></div>`).join('')}</div>`;return rows;
}

async function applyBulkEdit(){
  const list=dbFilteredProducts().filter(p=>!p._deleted);if(!list.length)return;const field=$('bulkEditField').value,value=$('bulkEditValue').value.trim();if(!value){toast('Enter a new value');return;}if(!confirm(`Apply ${field} = "${value}" to ${list.length} products?`))return;
  await createDatabaseBackup(`Before bulk edit ${field}`);for(const p of list){const updated={...p,[field]:field==='keywords'?[p.keywords,value].filter(Boolean).join(', '):value,custom:true};delete updated._searchText;delete updated._searchCompact;await idbPut(STORE_PRODUCTS,updated);}await logDbChange('Bulk edit','',`${field}=${value} on ${list.length} records`);$('bulkEditDialog').close();await loadProducts();await renderDatabaseManager();toast(`${list.length} products updated`);
}

function openBulkEdit(){const n=dbFilteredProducts().filter(p=>!p._deleted).length;$('bulkEditCount').textContent=`${n.toLocaleString()} currently matching products will be edited.`;$('bulkEditValue').value='';$('bulkEditDialog').showModal();}

  // ===== 80_project_tools.js =====
async function archiveProject(id){const p=state.projects.find(x=>x.id===id);if(!p)return;p.archived=true;p.updatedAt=new Date().toISOString();await idbPut(STORE_PROJECTS,p);if(state.project?.id===id)state.project=null;await loadProjects();renderProject();await refreshProjectManagementViews();}
async function restoreProject(id){const p=state.projects.find(x=>x.id===id);if(!p)return;p.archived=false;p.updatedAt=new Date().toISOString();await idbPut(STORE_PROJECTS,p);await loadProjects();await refreshProjectManagementViews();}
function backupProjects(){downloadText(`GROHE_Projects_Backup_${today()}.json`,JSON.stringify(state.projects,null,2),'application/json');}

function updateSelectorFocusButton(active){
  const btn=$('btnFocusSelector'); if(!btn) return;
  const label=btn.querySelector('span'); if(label) label.textContent=active?'Show Selection':'Product Selector';
  btn.classList.toggle('active',!!active);
  btn.title=active?'Return to split selector and selected SKUs':'Focus the product selector';
}
function toggleSelectorFocus(){
  const grid=document.querySelector('.workspace-grid'); if(!grid)return; const active=grid.classList.toggle('selector-full'); updateSelectorFocusButton(active);
}

async function captureRuntimeError(message, source='runtime'){
  if(!state.db) return;
  state.runtimeErrors=[{timestamp:new Date().toISOString(),message:String(message||'Unknown error').slice(0,800),source},...state.runtimeErrors].slice(0,40);
  try{await setMeta('runtimeErrors',state.runtimeErrors);}catch(_){}
  renderRuntimeErrors();
}
function renderRuntimeErrors(){
  const el=$('runtimeErrorLog'); if(!el)return; el.innerHTML=state.runtimeErrors.map(r=>`<div class="db-change-row"><span>${esc(r.source||'runtime')}</span><strong>${esc(r.message)}</strong><small>${esc(new Date(r.timestamp).toLocaleString())}</small></div>`).join('')||'<small>No captured runtime errors.</small>';
}
function installRuntimeDiagnostics(){
  window.addEventListener('error',e=>captureRuntimeError(e.message||e.error?.message||'Script error','window.error'));
  window.addEventListener('unhandledrejection',e=>captureRuntimeError(e.reason?.message||String(e.reason||'Unhandled promise rejection'),'promise'));
}

  // ===== 90_events_init.js =====
function setupKeyboardNavigation(){
  document.addEventListener('keydown',e=>{
    const tag=document.activeElement?.tagName?.toLowerCase();const typing=['input','textarea','select'].includes(tag);
    if(!typing && (e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoProject():undoProject();return;}
    if(!typing && (e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){e.preventDefault();redoProject();return;}
    if(e.key==='/'&&!typing){e.preventDefault();$('smartSearch').focus();return;}
    if(e.key==='Escape'&&document.activeElement===$('smartSearch')&&$('smartSearch').value){$('smartSearch').value='';renderFilters();return;}
    const card=document.activeElement?.closest?.('.fast-card');if(card&&['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Enter'].includes(e.key)){
      if(e.key==='Enter'){e.preventDefault();addSkuToProject(card.dataset.sku);return;}
      const cards=qsa('.fast-card',$('resultsList')),idx=cards.indexOf(card),cols=Math.max(1,Number(state.productColumns)||4),delta=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:e.key==='ArrowDown'?cols:-cols,n=cards[idx+delta];if(n){e.preventDefault();n.focus();}
    }
  });
}

function initWorkspaceResizer(){
  const grid=document.querySelector('.workspace-grid'), handle=$('workspaceResizer');
  if(!grid||!handle) return;
  let dragging=false;
  handle.addEventListener('pointerdown',e=>{if(window.innerWidth<1450)return;dragging=true;handle.setPointerCapture(e.pointerId);document.body.classList.add('resizing-workspace');e.preventDefault();});
  handle.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const r=grid.getBoundingClientRect();
    const width=Math.max(320,Math.min(760,Math.round(r.right-e.clientX)));
    applySelectionPanelWidth(width,false);
  });
  const finish=e=>{
    if(!dragging)return;dragging=false;document.body.classList.remove('resizing-workspace');
    applySelectionPanelWidth(state.selectionPanelWidth,true);
    try{handle.releasePointerCapture(e.pointerId);}catch(_){}
  };
  handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
  handle.addEventListener('dblclick',()=>applySelectionPanelWidth(430,true));
}

function initCatalogSidebarResizer(){
  const shell=document.querySelector('.selector-shell'), handle=$('catalogSidebarResizer');
  if(!shell||!handle)return;
  let dragging=false;
  handle.addEventListener('pointerdown',e=>{if(window.innerWidth<1050)return;dragging=true;handle.setPointerCapture(e.pointerId);document.body.classList.add('resizing-catalog-sidebar');e.preventDefault();});
  handle.addEventListener('pointermove',e=>{
    if(!dragging)return;
    const r=shell.getBoundingClientRect();
    const width=Math.max(230,Math.min(520,Math.round(e.clientX-r.left)));
    applyCatalogSidebarWidth(width,false);
  });
  const finish=e=>{if(!dragging)return;dragging=false;document.body.classList.remove('resizing-catalog-sidebar');applyCatalogSidebarWidth(state.catalogSidebarWidth,true);try{handle.releasePointerCapture(e.pointerId);}catch(_){}};
  handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);handle.addEventListener('dblclick',()=>applyCatalogSidebarWidth(280,true));
}

function setupImageHoverPreview(){
  // v18.15: no floating/mouse-follow preview. Thumbnail enlargement is handled
  // purely by CSS and stays anchored to the product image itself.
  const preview=$('imageHoverPreview');
  if(preview){preview.classList.remove('show');preview.innerHTML='';preview.style.cssText='';}
}

const RUNTIME_VERSION='18.4.6';
function validateRuntimeContract(){
  const required=['projectName','smartSearch','resultsList','sequenceList','btnSaveProjectQuick','btnProjectsQuick','btnUndo','btnRedo','btnExport','btnCeramicsToggle','btnPrunedToggle','catalogSidebarResizer','workspaceResizer','productColumns','catalogueColumns','catalogueCardLayout','catalogSidebarWidth','selectionPanelWidth','catalogueCompactCards','sequenceViewMenu','projectDialog','databaseDialog','exportDialog','manageProjectDialog','specDialog','btnMissingImagesSidebar','selectionTabs','btnHiddenItems','hiddenItemsDialog'];
  const missing=required.filter(id=>!$(id));
  if(missing.length) throw new Error(`UI contract failed; missing: ${missing.join(', ')}`);
  return {version:RUNTIME_VERSION,required:required.length};
}

function setupEvents(){
  $('btnNewProject').onclick=()=>openProjectDialog('new'); $('btnEditProject').onclick=()=>state.project?openProjectDialog('edit'):openProjectDialog('new'); $('projectFormSave').onclick=saveProjectForm;
  $('btnSaveProjectQuick').onclick=saveCurrentProject; $('btnProjectsQuick').onclick=renderManageProjectDialog;
  $('btnUndo').onclick=undoProject; $('btnRedo').onclick=redoProject;
  $('thumbnailSize').oninput=e=>applyThumbnailSize(e.target.value,false); $('thumbnailSize').onchange=e=>applyThumbnailSize(e.target.value,true);
  $('fontSize').oninput=e=>applyFontSize(e.target.value,false); $('fontSize').onchange=e=>applyFontSize(e.target.value,true);
  $('productColumns').onchange=e=>applyProductColumns(e.target.value,true);
  $('catalogueColumns').onchange=e=>applyProductColumns(e.target.value,true);
  $('catalogueCardLayout').onchange=e=>setCatalogueViewOption('cardLayout',e.target.value==='side'?'side':'top');
  $('catalogSidebarWidth').oninput=e=>applyCatalogSidebarWidth(e.target.value,false); $('catalogSidebarWidth').onchange=e=>applyCatalogSidebarWidth(e.target.value,true);
  $('selectionPanelWidth').oninput=e=>applySelectionPanelWidth(e.target.value,false); $('selectionPanelWidth').onchange=e=>applySelectionPanelWidth(e.target.value,true);
  $('uiDensity').onchange=e=>applyUiDensity(e.target.value,true);
  if($('btnResetLayout')) $('btnResetLayout').onclick=resetUiLayout;
  if($('btnClearFinish')) $('btnClearFinish').onclick=()=>{setFilterValues('finish',[]);state.resultLimit=90;renderFilters();};
  [['viewShowImages','showImages'],['viewShowDescriptions','showDescriptions'],['viewShowBadges','showBadges'],['viewShowParentRef','showParentRef'],['viewShowConcealed','showConcealed'],['viewCompactRows','compactRows']].forEach(([id,key])=>{$(id).onchange=e=>setSelectionViewOption(key,e.target.checked);});
  $('selectionImageSize').oninput=e=>{state.selectionView.imageSize=Number(e.target.value);applySelectionView(false);}; $('selectionImageSize').onchange=e=>{state.selectionView.imageSize=Number(e.target.value);applySelectionView(true);};
  if($('selectionTextSize')){$('selectionTextSize').oninput=e=>{state.selectionView.textSize=Number(e.target.value);applySelectionView(false);};$('selectionTextSize').onchange=e=>{state.selectionView.textSize=Number(e.target.value);applySelectionView(true);};}
  $('btnResetSelectionView').onclick=resetSelectionView;
  [['catalogueShowImages','showImages'],['catalogueShowFamily','showFamily'],['catalogueShowDescriptions','showDescriptions'],['catalogueShowFinish','showFinish'],['catalogueShowBadges','showBadges'],['catalogueCompactCards','compactCards']].forEach(([id,key])=>{const el=$(id);if(el)el.onchange=e=>setCatalogueViewOption(key,e.target.checked);});
  if($('btnResetCatalogueView'))$('btnResetCatalogueView').onclick=resetCatalogueView;
  $('btnCeramicsToggle').onclick=()=>setCeramicsIncluded(!state.includeCeramics,true);
  $('btnPrunedToggle').onclick=()=>setPrunedIncluded(!state.includePruned,true);
  if($('btnHiddenItems')) $('btnHiddenItems').onclick=openHiddenItemsDialog;
  if($('btnHideItemsApply')) $('btnHideItemsApply').onclick=hideSkusFromSearch;
  if($('btnUnhideAll')) $('btnUnhideAll').onclick=unhideAllSearchItems;
  document.addEventListener('pointerdown',e=>{
    qsa('.facet-menu[open]').forEach(menu=>{ if(!menu.classList.contains('primary-static-facet')&&!menu.contains(e.target)) menu.open=false; });
  });
  const headerProject=document.querySelector('.header-project'); if(headerProject){headerProject.title='Double-click to edit project details';headerProject.ondblclick=()=>state.project?openProjectDialog('edit'):openProjectDialog('new');}
  $('btnProjects').onclick=renderProjectsDialog; $('projectsNew').onclick=()=>{ closeDialogIfOpen('projectsDialog'); openProjectDialog('new'); };
  if($('btnManageProjectNew')) $('btnManageProjectNew').onclick=()=>{closeDialogIfOpen('manageProjectDialog');openProjectDialog('new');};
  if($('btnManageProjectEdit')) $('btnManageProjectEdit').onclick=()=>{closeDialogIfOpen('manageProjectDialog');state.project?openProjectDialog('edit'):openProjectDialog('new');};
  if($('btnManageProjectSave')) $('btnManageProjectSave').onclick=async()=>{await saveCurrentProject();updateManageProjectSummary();await refreshProjectManagementViews();};
  $('btnAddSection').onclick=addSection; $('btnAddSection2').onclick=addSection; if($('btnAutoBreaks')) $('btnAutoBreaks').onclick=autoCreateBreaks; $('btnClearSequence').onclick=clearSequence;
  if($('roomFinishSelect'))$('roomFinishSelect').onchange=updateRoomFinishPreview;
  if($('btnApplyRoomFinish'))$('btnApplyRoomFinish').onclick=applyRoomFinish;
  $('btnDatabase').onclick=async()=>{$('databaseDialog').showModal();state.dbLimit=120;setDbTab('products');await renderDatabaseManager();}; $('btnExport').onclick=openExportDialog; $('btnRunExport').onclick=runPresetExport;
  $('btnLoadImagesMenu').onclick=connectImageFolder; $('btnLoadImagesAudit').onclick=connectImageFolder;
  if($('btnMissingImagesOnly')) $('btnMissingImagesOnly').onclick=()=>setMissingImagesOnly(!state.showMissingImagesOnly); if($('btnMissingImagesSidebar')) $('btnMissingImagesSidebar').onclick=()=>setMissingImagesOnly(!state.showMissingImagesOnly);
  $('fallbackImageFolder').onchange=e=>indexFallbackImageFiles(e.target.files);
  if($('btnOpenGoogleImages')) $('btnOpenGoogleImages').onclick=()=>{const sku=missingImageImportDraft.sku;if(sku)window.open(googleImageSearchUrlForSku(sku),'_blank','noopener');};
  if($('btnLoadMissingImageUrl')) $('btnLoadMissingImageUrl').onclick=()=>setMissingImageImportUrl($('missingImageImportUrl').value);
  if($('btnChooseMissingImage')) $('btnChooseMissingImage').onclick=()=>$('missingImageImportFile').click();
  if($('missingImageImportFile')) $('missingImageImportFile').onchange=e=>readMissingImageFile(e.target.files?.[0]);
  if($('btnSaveMissingImageJpeg')) $('btnSaveMissingImageJpeg').onclick=saveMissingImageAsJpeg;
  const imageDrop=$('missingImageImportDrop');
  if(imageDrop){
    imageDrop.onclick=e=>{if(e.target.closest('button,input'))return;$('missingImageImportFile')?.click();};
    imageDrop.ondragover=e=>{e.preventDefault();imageDrop.classList.add('dragover');};
    imageDrop.ondragleave=()=>imageDrop.classList.remove('dragover');
    imageDrop.ondrop=e=>{e.preventDefault();imageDrop.classList.remove('dragover');readMissingImageFile(e.dataTransfer?.files?.[0]);};
    imageDrop.onpaste=e=>{const file=[...(e.clipboardData?.files||[])].find(f=>String(f.type||'').startsWith('image/'));if(file){e.preventDefault();readMissingImageFile(file);return;}const text=e.clipboardData?.getData('text/plain')?.trim();if(/^https?:\/\//i.test(text||'')){e.preventDefault();$('missingImageImportUrl').value=text;setMissingImageImportUrl(text);}};
  }
  qsa('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  let searchTimer=null; $('smartSearch').oninput=()=>{state.resultLimit=90;rememberSearch($('smartSearch').value);clearTimeout(searchTimer);searchTimer=setTimeout(()=>requestAnimationFrame(renderFilters),110);};
  $('filterView').onchange=e=>{state.viewFilter=e.target.value;state.resultLimit=90;renderFilters();};
  $('btnClearFilters').onclick=()=>{state.filters={area:[],category:[],family:[],finish:[],size:[],mounting:[],function:[],outlets:[],shape:[],status:[]};state.viewFilter='';$('filterView').value='';state.resultLimit=90;$('smartSearch').value='';const mf=$('moreFilters');if(mf)mf.open=false;renderFilters();};
  $('btnClearSearch').onclick=()=>{$('smartSearch').value='';state.resultLimit=90;renderFilters();$('smartSearch').focus();};
  $('resultsList').onclick=e=>{const image=e.target.closest('[data-google-image-sku]');if(image){e.stopPropagation();openMissingImageGoogleSearch(image.dataset.googleImageSku);return;}const fav=e.target.closest('[data-fav-sku]');if(fav){e.stopPropagation();toggleFavorite(fav.dataset.favSku);return;}const pdf=e.target.closest('[data-pdf-sku]');if(pdf){e.stopPropagation();if(window.GROHEDataSheets?.openProductPdf)window.GROHEDataSheets.openProductPdf(pdf.dataset.pdfSku);else toast('Data sheet viewer is not ready');return;}const b=e.target.closest('[data-add-sku]');if(b){e.stopPropagation();addSkuToProject(b.dataset.addSku);}};
  $('resultsList').ondblclick=e=>{const selected=window.getSelection?.().toString().trim();if(selected)return;const card=e.target.closest('.fast-card');if(card&&!e.target.closest('button'))addSkuToProject(card.dataset.sku);};
  $('resultsList').onscroll=()=>{const el=$('resultsList');if(el.scrollTop+el.clientHeight>=el.scrollHeight-320)appendResultBatch();};
  $('btnLoadCsv').onclick=()=>$('csvFileInput').click(); $('csvFileInput').onchange=async e=>{const f=e.target.files[0];if(f){$('importText').value=await f.text();setDbTab('import');previewImportRows();}}; $('btnPreviewImport').onclick=previewImportRows; $('btnImportRows').onclick=importRows;
  $('btnSaveSku').onclick=saveDbSku; $('btnDeleteSku').onclick=deleteDbSku; $('btnRevertSku').onclick=revertDbSku; $('btnDbNew').onclick=clearDbEditor; $('btnDbBulk').onclick=openBulkEdit; $('btnApplyBulkEdit').onclick=applyBulkEdit;
  $('dbSearch').oninput=()=>{state.dbLimit=120;renderDatabaseList();}; $('dbFilterCategory').onchange=()=>{state.dbLimit=120;renderDatabaseList();}; $('dbFilterStatus').onchange=()=>{state.dbLimit=120;renderDatabaseList();};
  $('dbProductList').onscroll=()=>{const el=$('dbProductList');const list=dbFilteredProducts();if(el.scrollTop+el.clientHeight>=el.scrollHeight-220&&state.dbLimit<list.length){const top=el.scrollTop;state.dbLimit+=180;renderDatabaseList();requestAnimationFrame(()=>{el.scrollTop=top;});}};
  $('btnDbImportToggle').onclick=()=>setDbTab('import');
  $('btnMissingImages').onclick=openMissingImages; $('missingImageSearch').oninput=renderMissingImages; $('btnCopyMissingSkus').onclick=copyMissingSkus; $('btnExportMissingImages').onclick=exportMissingImages; $('btnRefreshImages').onclick=refreshImages;
  $('btnExportDbCsv').onclick=exportMasterCsv; $('btnExportDbJson').onclick=exportMasterJson; $('btnResetCustomDb').onclick=resetCustomDb;
  qsa('[data-db-tab]',$('dbTabs')).forEach(b=>b.onclick=()=>setDbTab(b.dataset.dbTab));
  $('btnNewRule').onclick=clearRuleEditor; $('btnSaveRule').onclick=saveCompatRule; $('btnDeleteRule').onclick=deleteCompatRule;
  $('btnRefreshQuality').onclick=renderQualityAudit; $('qualityIssueType').onchange=renderQualityAudit; $('btnExportQuality').onclick=exportQuality;
  $('btnCreateBackup').onclick=async()=>{await createDatabaseBackup('Manual backup');renderBackups();toast('Database backup created');};
  $('btnPreviewPaste').onclick=previewPastedSkus; $('btnApplyPaste').onclick=applyPastedSkus;
  $('btnPasteSkus').onclick=openPasteSkus; $('btnPasteSkus2').onclick=openPasteSkus;
  $('btnTemplates').onclick=openTemplates; $('templateSearch').oninput=renderTemplates; $('btnSaveProjectTemplate').onclick=saveCurrentProjectTemplate; $('btnSaveBundle').onclick=saveCurrentSectionBundle;
  $('btnDuplicateSection').onclick=duplicateCurrentSection;
  $('btnReviewIssues').onclick=openReviewIssues; $('btnReviewIssues2').onclick=openReviewIssues;
  $('btnCopySelection').onclick=copySelection; $('btnCopySelection2').onclick=copySelection; $('btnFocusSelector').onclick=toggleSelectorFocus;
  $('projectSearch').oninput=renderProjectsDialog; $('showArchivedProjects').onchange=renderProjectsDialog; if($('projectSearchHub')) $('projectSearchHub').oninput=()=>renderProjectListInto('projectsListHub','projectSearchHub','showArchivedProjectsHub','manageProjectDialog'); if($('showArchivedProjectsHub')) $('showArchivedProjectsHub').onchange=()=>renderProjectListInto('projectsListHub','projectSearchHub','showArchivedProjectsHub','manageProjectDialog'); $('btnBackupProjects').onclick=backupProjects;
  $('projectFinishSelect').onchange=updateProjectFinishPreview; $('projectFinishConvertItems').onchange=updateProjectFinishPreview; $('btnApplyProjectFinish').onclick=applyProjectFinishChange;
  $('replaceSearch').oninput=renderReplaceResults;
  qsa('.action-menu').forEach(menu=>menu.addEventListener('toggle',()=>{if(menu.open)closeActionMenus(menu);}));
  document.addEventListener('click',e=>{
    const action=e.target.closest?.('.action-menu .menu-action');
    if(action){closeActionMenus();}
    else if(!e.target.closest?.('.action-menu')) closeActionMenus();
    if(!e.target.closest?.('.facet-menu')) qsa('.facet-menu[open]').forEach(m=>m.open=false);
    if(!e.target.closest?.('.variant-menu')) qsa('.variant-menu[open]').forEach(m=>m.open=false);
    if(!e.target.closest?.('#itemMenuPortal') && !e.target.closest?.('[data-open-item-menu]')) closeItemMenuPortal();
    if(!e.target.closest?.('.item-menu')) qsa('.item-menu[open]').forEach(m=>m.open=false);
  });
}

// Small public bridge used by the integrated Image Recovery drawer. It exposes
// live products (including local database edits/additions) without exposing the
// application's internal state object.
function publicProduct(p){
  if(!p)return null;
  return {sku:p.sku,description:p.description||'',family:p.family||'',category:p.category||'',area:p.area||'',finish:p.finish||'',size:p.size||'',mounting:p.mounting||'',function:p.function||'',outlets:p.outlets||'',shape:p.shape||'',sprays:p.sprays||'',keywords:p.keywords||'',fullText:p.fullText||'',status:p.status||'',priority:!!p.priority,pruned:isPrunedProduct(p),requiredBodies:[...(p.requiredBodies||[])]};
}
window.GROHEBuilder={
  health:()=>({version:RUNTIME_VERSION,products:state.products.length,projectOpen:!!state.project,images:state.imageFiles.size,prunedEnabled:state.includePruned,ceramicsEnabled:state.includeCeramics,hiddenFromSearch:state.hiddenSkus.size}),
  getProducts:()=>state.products.map(publicProduct),
  searchProducts:(query,limit=30)=>searchProducts(String(query||''),visibleCatalogueProducts()).slice(0,Math.max(1,Number(limit||30))).map(publicProduct),
  getContext:()=>{
    const option=activeSelectionOption();const room=currentRoomGroup();
    const contextItems=(room?.items?.length?room.items:(state.project?.items||[])).filter(x=>x.type==='product'&&!x.auto);
    const selectedProducts=contextItems.map(x=>publicProduct(getProduct(x.sku))).filter(Boolean);
    return {projectOpen:!!state.project,projectId:state.project?.id||'',projectName:state.project?.name||'',customer:state.project?.customer||'',projectDate:state.project?.date||'',optionName:option?.name||'',optionFinish:option?.finish||state.project?.finish||'',roomName:room?.section?.title||'',roomFinish:room?roomTargetFinish(room,option?.finish||''):'',selectedCount:(state.project?.items||[]).filter(x=>x.type==='product'&&!x.auto).length,selectedProducts};
  },
  getPdfKitData:()=>{
    const option=activeSelectionOption();
    const items=(option?.items||state.project?.items||[]).map(item=>{
      if(item.type==='section') return {type:'section',title:item.title||'Section'};
      if(item.type!=='product') return null;
      const product=getProduct(item.sku); if(!product) return null;
      return {type:'product',sku:product.sku,qty:item.qty||1,auto:!!item.auto,componentRole:item.componentRole||'',parentItemId:item.parentItemId||'',description:product.description||'',family:product.family||'',finish:product.finish||''};
    }).filter(Boolean);
    return {projectOpen:!!state.project,projectId:state.project?.id||'',projectName:state.project?.name||'',customer:state.project?.customer||'',date:state.project?.date||'',finish:option?.finish||state.project?.finish||'',optionName:option?.name||'',items};
  },
  addSelectionBatch:(entries,opts)=>addSelectionBatch(entries,opts),
  refreshImages:()=>refreshImages(),
  getImageInfo:()=>({count:state.imageFiles.size,connected:state.imageFolderConnected,path:state.imageServerPath||''}),
  openMissingImages:()=>openMissingImages(),
};

if(new URLSearchParams(location.search).has('debug')){
  window.__GROHE_TEST__={state,getProduct,finishVariantsForProduct,sizeVariantsForProduct,productVariantSize,addSkuToProject,addSelectionBatch,openItemMenuPortal,ensureProjectOptions,analyzeRoomGroup,analyzeOption,addSelectionOption,switchSelectionOption,repairRoomRequiredComponents};
}

async function init(){
  validateRuntimeContract();
  setupEvents();
  initWorkspaceResizer();
  initCatalogSidebarResizer();
  setupKeyboardNavigation();
  state.db=await openDb();
  await loadAppMemory();
  applyThumbnailSize(state.preferences.thumbnailSize||136,false);
  applyFontSize(state.preferences.fontSize||115,false);
  applyProductColumns(state.preferences.productColumns||4,false);
  applyCatalogSidebarWidth(state.catalogSidebarWidth||260,false);
  applySelectionPanelWidth(state.selectionPanelWidth||400,false);
  applyUiDensity(state.uiDensity||'comfortable',false);
  applySelectionView(false);
  applyCatalogueView(false);
  updateCeramicsToggle();
  updatePrunedToggle();
  updateHiddenItemsStatus();
  updateMissingImagesFilterButton();
  updateSelectorFocusButton(false);
  setupImageHoverPreview();
  installRuntimeDiagnostics();
  await loadProducts();
  state.qualityIssues=buildQualityIssues();
  const criticalIntegrity=state.qualityIssues.filter(x=>['missingCompatibility','brokenReference'].includes(x.type));
  if(criticalIntegrity.length) console.info(`GROHE database integrity: ${criticalIntegrity.length} compatibility/reference items need review in Data Quality.`);
  const autoImages=await loadAutomaticImages();
  if(!autoImages?.connected) await restoreManualImageFolder();
  updateFolderStatus(state.imageFiles.size,state.imageSource==='server'?state.imageServerPath:(state.manualImageHandle?.name||'Selected image folder'));
  await loadProjects();
  resetProjectHistory();
  if(!state.project && !state.projects.length) setTimeout(()=>openProjectDialog('new'),250);
}

init().catch(err=>{console.error(err);toast('Could not initialize local database. See console.',5000);});
})();
