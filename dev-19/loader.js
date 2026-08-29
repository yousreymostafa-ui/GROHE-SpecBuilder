(async()=>{
'use strict';
try{
  const RELEASE='dev19-baseline';
  const response=await fetch('app.html',{cache:'no-store'});
  if(!response.ok) throw new Error('Could not load the DEV 19 application snapshot.');
  let html=await response.text();

  html=html.replace('<head>','<head><base href="./">');

  const badge='<div class="dev19-badge" title="DEV 19 uses isolated local browser storage"><strong>DEV 19</strong><span>LOCAL TEST</span></div>';
  html=html.replace('<div class="header-actions">','<div class="header-actions">'+badge);

  const devStyle='<style>.dev19-badge{height:32px;display:inline-flex;align-items:center;gap:5px;padding:0 8px;border:1px solid #9fc7e4;border-radius:8px;background:#eef8ff;color:#1b5d88;white-space:nowrap}.dev19-badge strong{font:600 9px/1 Poppins,Arial,sans-serif}.dev19-badge span{font:600 7px/1 Poppins,Arial,sans-serif;letter-spacing:.06em;color:#7292a8}@media(max-width:700px){.dev19-badge span{display:none}}</style>';
  html=html.replace('</head>',devStyle+'</head>');

  const storageTag='<script src="storage.js"></scr'+'ipt>';
  html=html.replace(storageTag,'<script src="dev-storage.js?v='+RELEASE+'"></scr'+'ipt>');

  const assets=['favicon.svg','styles.css','card-pdf-actions.css','missing-image-google.css','data-sheet-viewer.css','core.js','seed-products.js','data-sheet-viewer.js','settings-ui.css','settings-ui.js','ui-fixes.css','ui-fixes.js','pruned-sync.js','design-system.css','responsive-ui.js','export-launcher.js','ui-refactor.css','app.js'];
  assets.forEach(file=>{
    html=html.replaceAll('href="'+file+'"','href="'+file+'?v='+RELEASE+'"');
    html=html.replaceAll('src="'+file+'"','src="'+file+'?v='+RELEASE+'"');
  });

  document.open();
  document.write(html);
  document.close();
}catch(err){
  document.body.innerHTML='<div class="route-loader"><div><strong>Could not load DEV 19</strong><span>'+String(err?.message||err)+'</span></div></div>';
}
})();