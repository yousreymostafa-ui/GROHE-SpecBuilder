(async()=>{
'use strict';
try{await window.GROHEAuth?.initialize?.()}catch(err){console.warn('Account features unavailable; continuing as guest.',err)}
const current=document.currentScript?.src||location.href;
let release='';
try{release=new URL(current,location.href).searchParams.get('v')||'';}catch(_){}
const s=document.createElement('script');
s.src='app.js'+(release?'?v='+encodeURIComponent(release):'?v='+Date.now());
s.defer=false;
document.body.appendChild(s);
})();