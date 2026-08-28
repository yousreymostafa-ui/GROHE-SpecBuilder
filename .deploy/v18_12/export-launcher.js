(() => {
  'use strict';
  const $=id=>document.getElementById(id);

  function ensureExportChoice(){
    let dialog=$('exportChoiceDialog');
    if(!dialog){
      dialog=document.createElement('dialog');
      dialog.id='exportChoiceDialog';
      dialog.className='modal medium export-choice-dialog';
      dialog.innerHTML=
        '<div class="modal-header"><div><div class="eyebrow">EXPORT</div><h3>Export Project</h3></div><button class="icon-btn" data-export-close aria-label="Close">✕</button></div>'+
        '<div class="modal-body"><p class="export-choice-intro">Choose the output you want to create.</p><div class="export-choice-grid">'+
        '<button type="button" class="export-choice-card" id="btnExportExcelOnly"><strong>Excel</strong><span>Export all selections with every Break on a separate worksheet tab.</span><b>Export Excel →</b></button>'+
        '<button type="button" class="export-choice-card featured" id="btnExportPdfOnly"><strong>PDF Merge</strong><span>Open the original PDF Kit Pro to locate data sheets and merge the selected PDFs.</span><b>Open PDF Kit Pro →</b></button>'+
        '<button type="button" class="export-choice-card" id="btnExportExcelPdf"><strong>Excel + PDF</strong><span>Create the multi-tab Excel workbook, then open PDF Kit Pro for merging.</span><b>Export both →</b></button>'+
        '</div></div>';
      document.body.appendChild(dialog);
    }

    const excel=$('btnExportExcelOnly'),pdf=$('btnExportPdfOnly'),both=$('btnExportExcelPdf');
    if(excel){
      excel.innerHTML='<strong>Excel</strong><span>Export all selections with every Break on a separate worksheet tab.</span><b>Export Excel →</b>';
      excel.onclick=()=>{if(dialog.open)dialog.close();if(typeof window.openExportDialog==='function')window.openExportDialog();};
    }
    if(pdf){
      pdf.innerHTML='<strong>PDF Merge</strong><span>Open the original PDF Kit Pro to locate data sheets and merge the selected PDFs.</span><b>Open PDF Kit Pro →</b>';
      pdf.onclick=()=>{if(dialog.open)dialog.close();if(typeof window.exportPdfOnly==='function')window.exportPdfOnly();else if(typeof window.openPdfKitPro==='function')window.openPdfKitPro();};
    }
    if(both){
      both.innerHTML='<strong>Excel + PDF</strong><span>Create the multi-tab Excel workbook, then open PDF Kit Pro for merging.</span><b>Export both →</b>';
      both.onclick=async()=>{if(dialog.open)dialog.close();if(typeof window.exportExcelAndOpenPdfKit==='function')await window.exportExcelAndOpenPdfKit();else{if(typeof window.exportExcel==='function')await window.exportExcel();if(typeof window.openPdfKitPro==='function')window.openPdfKitPro();}};
    }
    dialog.querySelector('[data-export-close]')?.addEventListener('click',()=>dialog.close());
    return dialog;
  }

  function install(){
    const dialog=ensureExportChoice();
    const btn=$('btnExport');
    if(btn&&!btn.dataset.exportLauncherV1812){
      btn.dataset.exportLauncherV1812='1';
      btn.addEventListener('click',e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        if(!dialog.open)dialog.showModal();
      },true);
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  setTimeout(install,500);
})();