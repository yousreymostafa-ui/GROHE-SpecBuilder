(() => {
  'use strict';
  const $=id=>document.getElementById(id);

  function install(){
    const btn=$('btnExport');
    const dialog=$('exportChoiceDialog');
    if(!btn||!dialog)return;

    // Keep the export launcher resilient, but do not overwrite the real handlers
    // installed by app.js for Excel, PDF Kit Pro, or Excel + PDF.
    if(!btn.dataset.exportLauncherV1814){
      btn.dataset.exportLauncherV1814='1';
      btn.addEventListener('click',e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        if(!dialog.open)dialog.showModal();
      },true);
    }

    const excel=$('btnExportExcelOnly');
    const pdf=$('btnExportPdfOnly');
    const both=$('btnExportExcelPdf');
    if(excel)excel.querySelector('span').textContent='Export all selections with every Break on a separate worksheet tab.';
    if(pdf){
      const strong=pdf.querySelector('strong'); if(strong)strong.textContent='PDF Merge';
      const span=pdf.querySelector('span'); if(span)span.textContent='Open the original PDF Kit Pro to locate data sheets and merge the selected PDFs.';
    }
    if(both)both.querySelector('span').textContent='Create the multi-tab Excel workbook, then open PDF Kit Pro for merging.';
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  setTimeout(install,500);
})();