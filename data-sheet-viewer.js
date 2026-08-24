(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = v => String(v || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  let currentSku = '';
  let currentUrl = '';
  let currentName = '';

  function toast(text){
    const t=$('toast'); if(!t) return;
    t.textContent=text; t.classList.add('show'); clearTimeout(toast._t);
    toast._t=setTimeout(()=>t.classList.remove('show'),3000);
  }

  function ensureUi(){
    if($('productPdfDialog')) return;
    const d=document.createElement('dialog');
    d.id='productPdfDialog'; d.className='product-pdf-dialog';
    d.innerHTML=`<div class="product-pdf-shell">
      <div class="product-pdf-head">
        <div class="product-pdf-heading"><strong id="productPdfTitle">Data sheet</strong><span id="productPdfMeta">Checking local Data Sheets folder…</span></div>
        <div class="product-pdf-head-actions">
          <button class="data-sheet-btn" id="productPdfChooseFolder">Folder</button>
          <button class="data-sheet-btn" id="productPdfRescan">Re-scan</button>
          <button class="data-sheet-close" id="productPdfClose" aria-label="Close">×</button>
        </div>
      </div>
      <div class="product-pdf-stage" id="productPdfStage"><div class="product-pdf-empty"><strong>Loading data sheet…</strong><span>Verifying the local PDF file before preview.</span></div></div>
      <div class="product-pdf-foot" id="productPdfFoot" hidden>
        <span id="productPdfFileName"></span>
        <div class="product-pdf-file-actions"><a class="data-sheet-btn" id="productPdfOpen" target="_blank" rel="noopener">Open PDF</a><a class="data-sheet-btn primary" id="productPdfDownload" download>Download</a></div>
      </div>
    </div>`;
    document.body.appendChild(d);
    $('productPdfClose').onclick=()=>d.close();
    $('productPdfRescan').onclick=async()=>{await rescan(); if(currentSku) await openProductPdf(currentSku,true);};
    $('productPdfChooseFolder').onclick=async()=>{await chooseFolder(); if(currentSku) await openProductPdf(currentSku,true);};
    d.addEventListener('close',()=>{const frame=$('productPdfFrame'); if(frame) frame.src='about:blank';});
  }

  async function apiJson(url, options={}){
    const r=await fetch(url,{cache:'no-store',...options});
    if(!r.ok) throw new Error(`Server returned ${r.status}`);
    return r.json();
  }

  async function folderState(){
    try{return await apiJson('/api/pdfs');}
    catch(e){return {connected:false,path:'',count:0,offline:true,error:e.message};}
  }

  function paintSettingsStatus(state){
    const status=$('settingsPdfStatus'), path=$('settingsPdfPath');
    if(!status) return;
    if(state?.offline){status.textContent='Service offline'; if(path)path.textContent='Start the app with start.bat'; return;}
    const count=Number(state?.count||0);
    status.textContent=state?.connected?`${count.toLocaleString()} PDF${count===1?'':'s'} indexed`:'Folder not loaded';
    if(path) path.textContent=state?.path||'Choose your Data Sheets folder';
  }

  async function refreshSettingsStatus(){
    const state=await folderState(); paintSettingsStatus(state); return state;
  }

  async function matchSku(sku){
    return apiJson(`/api/pdfs/match?sku=${encodeURIComponent(sku)}`);
  }

  async function rescan(){
    try{const d=await apiJson('/api/rescan-pdfs',{method:'POST'}); paintSettingsStatus(d); toast(`Indexed ${Number(d.count||0).toLocaleString()} data sheets`); return d;}
    catch(e){toast('Data-sheet service is offline. Start the app with start.bat.'); return null;}
  }

  async function chooseFolder(){
    try{
      const d=await apiJson('/api/select-pdf-folder',{method:'POST'});
      if(!d.cancelled) toast(`Data Sheets loaded · ${Number(d.count||0).toLocaleString()} PDFs`);
      paintSettingsStatus(d);
      return d;
    }catch(e){toast('Could not open the Data Sheets folder picker'); return null;}
  }

  function showError(title, detail, folder='', matchedFile=''){
    const stage=$('productPdfStage'), foot=$('productPdfFoot'); if(foot) foot.hidden=true;
    stage.innerHTML=`<div class="product-pdf-empty missing">
      <div class="pdf-error-icon">!</div>
      <strong>${esc(title)}</strong>
      <span>${esc(detail)}</span>
      ${matchedFile?`<div class="pdf-diagnostic"><b>Matched file</b><span>${esc(matchedFile)}</span></div>`:''}
      ${folder?`<div class="pdf-diagnostic"><b>Data Sheets folder</b><span>${esc(folder)}</span></div>`:''}
      <div class="product-pdf-empty-actions"><button class="data-sheet-btn primary" id="productPdfRetry">Re-scan</button><button class="data-sheet-btn" id="productPdfPickHere">Change Folder</button></div>
    </div>`;
    $('productPdfRetry').onclick=async()=>{await rescan(); await openProductPdf(currentSku,true);};
    $('productPdfPickHere').onclick=async()=>{await chooseFolder(); await openProductPdf(currentSku,true);};
  }

  async function verifyPdfBytes(url){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    try{
      const r=await fetch(url,{cache:'no-store',headers:{Range:'bytes=0-15'},signal:controller.signal});
      if(!(r.ok || r.status===206)) throw new Error(`PDF request returned ${r.status}`);
      const bytes=new Uint8Array(await r.arrayBuffer());
      if(bytes.length<5) throw new Error('PDF file returned no readable data');
      const sig=String.fromCharCode(...bytes.slice(0,5));
      if(sig!=='%PDF-') throw new Error('Matched file is not a valid PDF');
      return true;
    } finally { clearTimeout(timer); }
  }

  function downloadUrl(url){
    if(!url) return '';
    return `${url}${url.includes('?')?'&':'?'}download=1`;
  }

  async function openProductPdf(sku, refresh=false){
    ensureUi(); currentSku=norm(sku); if(!currentSku) return;
    const d=$('productPdfDialog'), stage=$('productPdfStage'), foot=$('productPdfFoot');
    $('productPdfTitle').textContent=`${currentSku} · Data sheet`;
    $('productPdfMeta').textContent='Checking local Data Sheets folder…';
    stage.innerHTML='<div class="product-pdf-empty"><div class="pdf-loading-ring"></div><strong>Loading data sheet…</strong><span>Verifying the local PDF file before preview.</span></div>';
    foot.hidden=true;
    if(!d.open) d.showModal();

    let fs=await folderState();
    paintSettingsStatus(fs);
    if(fs.offline){
      $('productPdfMeta').textContent='Local data-sheet service offline';
      showError('Data sheet service is not running','Open the app using start.bat. Browser-only opening cannot read G:\\My Drive\\Data Sheets.');
      return;
    }
    if(refresh || (fs.connected && Number(fs.count||0)===0)){
      const rescanned=await rescan(); if(rescanned) fs=rescanned;
    }
    $('productPdfMeta').textContent=`${Number(fs.count||0).toLocaleString()} PDFs indexed · ${fs.path||'No folder selected'}`;
    if(!fs.connected){
      showError('Data Sheets folder is not loaded','Choose the folder that contains your GROHE PDF files.',fs.path||'');
      return;
    }

    let match;
    try{match=await matchSku(currentSku);}catch(e){
      showError('PDF index could not be read',e.message,fs.path||''); return;
    }
    if(!match?.found){
      showError(`No PDF found for ${currentSku}`,'The folder loaded correctly, but no PDF filename containing this SKU was found.',fs.path||''); return;
    }
    if(!match.readable){
      showError('PDF matched but cannot be read','Windows/Google Drive reported the file, but the app could not open its bytes. Make the file available offline or check folder permissions.',fs.path||'',match.name||''); return;
    }
    if(match.signature===false){
      showError('Matched file is not a valid PDF','The filename matched the SKU, but the file content does not start with a PDF signature.',fs.path||'',match.name||''); return;
    }

    currentUrl=match.url || `/api/pdfs/file?sku=${encodeURIComponent(currentSku)}`;
    currentName=match.name || `${currentSku}.pdf`;
    $('productPdfMeta').textContent=`${currentName} · ${(Number(match.size||0)/1024/1024).toFixed(2)} MB`;
    $('productPdfFileName').textContent=currentName;
    $('productPdfOpen').href=currentUrl;
    $('productPdfDownload').href=downloadUrl(currentUrl);
    $('productPdfDownload').download=currentName;

    try{
      await verifyPdfBytes(currentUrl);
    }catch(e){
      const detail=e?.name==='AbortError'?'The PDF exists but did not become readable within 15 seconds. If it is stored in Google Drive, mark it Available offline and retry.':(e?.message||'The matched PDF could not be read.');
      showError('PDF matched, but preview cannot read it',detail,fs.path||'',currentName); return;
    }

    foot.hidden=false;
    stage.innerHTML=`<iframe id="productPdfFrame" class="product-pdf-frame" title="Data sheet ${esc(currentSku)}" src="${esc(currentUrl)}#view=FitH&toolbar=0&navpanes=0"></iframe>`;
    const frame=$('productPdfFrame');
    let loaded=false;
    const previewTimer=setTimeout(()=>{
      if(!loaded && frame?.isConnected) $('productPdfMeta').textContent=`${currentName} · PDF verified · preview is still rendering`;
    },4500);
    frame.addEventListener('load',()=>{
      loaded=true; clearTimeout(previewTimer);
      $('productPdfMeta').textContent=`${currentName} · PDF verified`;
    },{once:true});
  }

  ensureUi();
  const folderBtn=$('btnDataSheetsFolder'); if(folderBtn) folderBtn.onclick=async()=>{await chooseFolder(); await refreshSettingsStatus();};
  const rescanBtn=$('btnRescanDataSheets'); if(rescanBtn) rescanBtn.onclick=async()=>{await rescan(); await refreshSettingsStatus();};
  refreshSettingsStatus();
  window.GROHEDataSheets={openProductPdf,rescan,chooseFolder,refreshSettingsStatus,verifyPdfBytes};
})();
