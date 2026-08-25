(async()=>{
  'use strict';
  try{
    const session=await window.GROHEAuth?.requireSession?.();
    if(!session) return;
    const script=document.createElement('script');
    script.src='../app.js';
    script.defer=false;
    document.body.appendChild(script);
  }catch(err){
    console.error(err);
    const gate=document.getElementById('authGate');
    if(gate) gate.hidden=false;
    const msg=document.getElementById('authMessage');
    if(msg){msg.hidden=false;msg.dataset.type='error';msg.textContent=err?.message||'Could not initialize secure workspace.';}
  }
})();
