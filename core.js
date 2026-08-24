(() => {
  'use strict';

  const FINISH_CODES = Object.freeze({
    'Chrome':'00','Supersteel':'DC','Cool Sunrise':'GL','Brushed Cool Sunrise':'GN','Warm Sunset':'DA',
    'Brushed Warm Sunset':'DL','Hard Graphite':'A0','Brushed Hard Graphite':'AL','Phantom Black':'KF',
    'Matte Black':'2430','Chrome / black':'KI','Stainless Steel':'SD','Satin Steel':'MS','Satin Graphite':'MG','Moon White':'LS','Velvet Black':'KS'
  });

  const SEARCH_ALIASES = Object.freeze({
    'tap':['mixer','faucet'], 'faucet':['mixer','tap'], 'mixer':['faucet','tap'],
    'basin':['wash basin','washbasin','basin mixer'], 'washbasin':['wash basin','basin'],
    'sink':['kitchen','sink mixer'], 'kitchen':['sink mixer'],
    'wallplate':['wall plate','flush plate','actuation plate'], 'plate':['flush plate','actuation plate'],
    'flushtank':['flush tank','flushing cistern','cistern'], 'tank':['cistern','flushing cistern'], 'cistern':['flush tank','flushing cistern'],
    'concealed':['trimset','trim set','rough in','rough-in','concealed body','smartbox'],
    'roughin':['rough in','rough-in','concealed body','smartbox'], 'rough':['rough in','rough-in'],
    'exposed':['wall mounted exposed'], 'wall':['wall mounted'], 'ceiling':['ceiling mounted'],
    'freestanding':['free standing','floor mounted','floorstanding'], 'floorstanding':['free standing','freestanding'],
    'thermostat':['thermostatic','turbostat','grohtherm'], 'thermostatic':['thermostat','grohtherm'],
    'smartcontrol':['smart control','grohtherm smartcontrol'],
    'handshower':['hand shower'], 'headshower':['head shower'],
    'trigger':['trigger spray','tempesta f'], 'rail':['shower rail'], 'hose':['shower hose'],
    'popup':['pop up','pop-up','waste set','waste system'], 'waste':['waste set','pop up','pop-up','bath waste'],
    'spout':['bath spout','basin spout'],
    'accessory':['accessories','holder','hook','towel','soap'], 'accessories':['accessory'],
    'black':['matte black','phantom black','kf','2430'], 'gold':['cool sunrise','brushed cool sunrise','warm sunset','brushed warm sunset','gl','gn','da','dl'],
    'chrome':['00'], '00':['chrome'], 'dc':['supersteel'], 'supersteel':['dc'],
    'al':['brushed hard graphite'], 'graphite':['hard graphite','brushed hard graphite','a0','al'],
    'dl':['brushed warm sunset'], 'bws':['brushed warm sunset','dl'],
    'gn':['brushed cool sunrise'], 'bcs':['brushed cool sunrise','gn'],
    'da':['warm sunset'], 'gl':['cool sunrise'], 'kf':['phantom black'],
    '2way':['2 way','2-way','2 outlet','two way','2','2 valve','2 valves','2 function','2 functions'], '3way':['3 way','3-way','3 outlet','three way','3','3 valve','3 valves','3 function','3 functions'],
    '1way':['1 way','1-way','1 outlet','one way','1','1 valve','1 function'], '2outlet':['2 outlet','2 way','2'], '3outlet':['3 outlet','3 way','3'],
    'xl':['xl size','extra large'], 'large':['l size'], 'medium':['m size'], 'small':['s size'],
    // Common GROHE / sales abbreviations. These aliases are shared by the main
    // smart search and the searchable filter menus.
    'shw':['shower'], 'bas':['basin','wash basin','washbasin'], 'conc':['concealed','rough in','rough-in'],
    'thm':['thermostat','thermostatic','grohtherm'], 'thermo':['thermostat','thermostatic','grohtherm'], 'exp':['exposed'], 'freest':['freestanding','free standing','floor mounted'],
    'ohm':['single lever mixer','single-lever mixer'], 'slm':['single lever mixer','single-lever mixer'],
    '1h':['1 hole','single hole'], '2h':['2 hole','two hole'], '3h':['3 hole','three hole'], '4h':['4 hole','four hole'], '5h':['5 hole','five hole'],
    'div':['diverter'], 'acc':['accessory','accessories'],
    // Sales shorthand / common user wording shared by every product-search surface.
    'bm':['basin mixer','washbasin mixer'], 'sm':['shower mixer'], 'btm':['bath mixer'],
    'wm':['wall mounted'], 'wallmount':['wall mounted'], 'wallmounted':['wall mounted'], 'deckmount':['deck mounted'],
    'floormount':['floor mounted','freestanding'], 'ceilingmount':['ceiling mounted'],
    'rainshower':['rain shower','head shower'], 'rain':['rainshower','rain shower'],
    'bottletrap':['bottle trap'], 'anglevalve':['angle valve'],
    'mb':['matte black'], 'pb':['phantom black'], 'bhg':['brushed hard graphite','al'],
    'hg':['hard graphite','a0'], 'ss':['supersteel','dc'],
    'smartbox':['rapido smartbox','concealed body','rough in'], 'smc':['smartcontrol','smart control','grohtherm smartcontrol'],
    'rsh':['rainshower','rain shower','head shower'], 'line':['lineare'], 'temp':['tempesta'], 'euph':['euphoria'],
    'basmix':['basin mixer'], 'shwmix':['shower mixer'], 'wallmixer':['wall mounted mixer'],
    'actuator':['flush plate','actuation plate'], 'faceplate':['flush plate','actuation plate'],
    // Frequently observed typing patterns in project-sales searches.
    'wallmout':['wall mounted'], 'wallmont':['wall mounted'], 'conceald':['concealed'],
    'tempeseta':['tempesta'], 'essnce':['essence'], 'raisn':['rain'], 'hower':['shower'],
    'shwoer':['shower'], 'mixr':['mixer'], 'basn':['basin']
  });

  const normalizeSku = (v='') => String(v).replace(/[^A-Za-z0-9]/g,'').toUpperCase();
  const normalizeText = (v='') => String(v).toLowerCase().replace(/[\s\-_\/]+/g,' ').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const sortUnique = (arr) => [...new Set((arr||[]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:'base'}));
  const safeFilename = (s='project') => String(s).replace(/[\\/:*?"<>|]+/g,' ').replace(/\s+/g,' ').trim() || 'project';
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  const today = () => new Date().toISOString().slice(0,10);
  const compactSearchToken = (v='') => normalizeText(v).replace(/\s+/g,'');

  function searchVariants(token){
    const t=normalizeText(token);
    const c=compactSearchToken(t);
    const out=new Set([t,c]);
    const direct=SEARCH_ALIASES[t]||SEARCH_ALIASES[c]||[];
    direct.forEach(v=>{ out.add(normalizeText(v)); out.add(compactSearchToken(v)); });
    return [...out].filter(Boolean);
  }

  function fuzzyWordMatch(token,hay){
    token=normalizeText(token);
    if(!token || token.length<3) return false;
    const words=normalizeText(hay).split(/\s+/).filter(w=>w.length>=3);
    const maxDist=token.length>=7?2:1;
    for(const word of words){
      if(word.startsWith(token) || token.startsWith(word)) return true;
      if(Math.abs(word.length-token.length)>maxDist) continue;
      let prev=Array.from({length:token.length+1},(_,i)=>i);
      for(let i=1;i<=word.length;i++){
        const cur=[i];
        for(let j=1;j<=token.length;j++){
          cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(word[i-1]===token[j-1]?0:1));
        }
        prev=cur;
      }
      if(prev[token.length]<=maxDist) return true;
    }
    return false;
  }

  function smartFacetMatch(query,searchText){
    let normalized=normalizeText(query)
      .replace(/\b([1-5])\s*[- ]?way\b/g,'$1way')
      .replace(/\b([1-5])\s*[- ]?outlets?\b/g,'$1outlet')
      .replace(/\brough\s*[- ]?in\b/g,'roughin')
      .replace(/\bwall\s*plate\b/g,'wallplate')
      .replace(/\bflush\s*tank\b/g,'flushtank');
    if(!normalized) return true;
    const hay=normalizeText(searchText);
    const compact=hay.replace(/\s+/g,'');
    const tokens=normalized.split(/\s+/).filter(Boolean);
    return tokens.every(token=>{
      const variants=searchVariants(token);
      return variants.some(v=>{
        const nv=normalizeText(v); const cv=nv.replace(/\s+/g,'');
        if(!nv) return false;
        if(nv.length<=2 && (` ${hay} `).includes(` ${nv} `)) return true;
        if(hay.includes(nv)) return true;
        if(cv.length>=2 && compact.includes(cv)) return true;
        return fuzzyWordMatch(nv,hay);
      });
    });
  }

  window.GROHECore = Object.freeze({
    FINISH_CODES,
    RECOGNIZED_FINISHES:new Set(Object.keys(FINISH_CODES)),
    SEARCH_ALIASES,
    normalizeSku,normalizeText,esc,sortUnique,safeFilename,uid,today,compactSearchToken,searchVariants,fuzzyWordMatch,smartFacetMatch
  });
})();
