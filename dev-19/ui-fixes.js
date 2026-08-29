(() => {
'use strict';
const RELEASE='20260826-1';
const $=id=>document.getElementById(id);
const KEY='grohe-selection-text-size-dev19-v1';

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
function savedTextSize(){return clamp(Number(localStorage.getItem(KEY))||100,85,150);}
function applySelectionTextSize(value,persist=false){
  const n=clamp(Number(value)||100,85,150);
  const panel=document.querySelector('.sequence-panel');
  const slider=$('selectionTextSize'),label=$('selectionTextSizeValue');
  if(slider&&Number(slider.value)!==n)slider.value=String(n);
  if(label)label.textContent=`${n}%`;
  if(panel){
    const ui=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-font-scale'))||1.15;
    const scale=ui*n/100;
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
    Object.entries(sizes).forEach(([k,v])=>panel.style.setProperty(k,`${(v*scale).toFixed(2)}px`));
  }
  if(persist)localStorage.setItem(KEY,String(n));
}

function installSelectionTextControl(){
  const menu=document.querySelector('#sequenceViewMenu .sequence-view-popover');
  if(!menu||$('selectionTextSize'))return;
  const imageSetting=menu.querySelector('.selection-image-setting');
  const wrap=document.createElement('div');
  wrap.className='selection-text-setting';
  wrap.innerHTML='<div><span>Right text size</span><strong id="selectionTextSizeValue">100%</strong></div><input type="range" id="selectionTextSize" min="85" max="150" step="5" value="100" aria-label="Right selection text size" />';
  if(imageSetting)imageSetting.insertAdjacentElement('afterend',wrap);else menu.querySelector('#btnResetSelectionView')?.before(wrap);
  const slider=$('selectionTextSize');
  slider?.addEventListener('input',e=>applySelectionTextSize(e.target.value,false));
  slider?.addEventListener('change',e=>applySelectionTextSize(e.target.value,true));
  $('btnResetSelectionView')?.addEventListener('click',()=>{localStorage.removeItem(KEY);setTimeout(()=>applySelectionTextSize(100,false),0);});
  applySelectionTextSize(savedTextSize(),false);
  const observer=new MutationObserver(()=>applySelectionTextSize(savedTextSize(),false));
  observer.observe(document.documentElement,{attributes:true,attributeFilter:['style']});
}

function ensureExportChoiceWins(){
  const btn=$('btnExport'),choice=$('exportChoiceDialog');
  if(!btn||!choice||btn.dataset.exportChoiceGuard)return;
  btn.dataset.exportChoiceGuard='1';
  btn.addEventListener('click',e=>{
    e.preventDefault();e.stopImmediatePropagation();
    if(!choice.open)choice.showModal();
  },true);
}

function install(){
  installSelectionTextControl();
  ensureExportChoiceWins();
  document.documentElement.dataset.groheUiRelease=RELEASE;
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
setTimeout(install,500);
})();
