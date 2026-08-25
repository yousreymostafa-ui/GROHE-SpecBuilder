(() => {
  'use strict';

  function requestResult(req){
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  function txDone(tx){
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error || new Error('IndexedDB transaction aborted'));
    });
  }

  async function open(name,version,stores){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(name,version);
      req.onupgradeneeded=()=>{
        const db=req.result;
        for(const store of stores){
          if(!db.objectStoreNames.contains(store.name)) db.createObjectStore(store.name,store.options||{});
        }
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }

  function cloudProjects(store){ return store==='projects' && !!window.GROHEAuth?.isSignedIn?.(); }
  function getAll(db,store){ if(cloudProjects(store)) return window.GROHEAuth.listProjects(); return requestResult(db.transaction(store,'readonly').objectStore(store).getAll()).then(x=>x||[]); }
  function get(db,store,key){ if(cloudProjects(store)) return window.GROHEAuth.getProject(key); return requestResult(db.transaction(store,'readonly').objectStore(store).get(key)); }
  function put(db,store,value){ if(cloudProjects(store)) return window.GROHEAuth.putProject(value); const tx=db.transaction(store,'readwrite'); tx.objectStore(store).put(value); return txDone(tx); }
  function remove(db,store,key){ if(cloudProjects(store)) return window.GROHEAuth.deleteProject(key); const tx=db.transaction(store,'readwrite'); tx.objectStore(store).delete(key); return txDone(tx); }
  function clear(db,store){ if(cloudProjects(store)) return window.GROHEAuth.clearProjects(); const tx=db.transaction(store,'readwrite'); tx.objectStore(store).clear(); return txDone(tx); }

  window.GROHEStorage=Object.freeze({open,getAll,get,put,remove,clear});
})();
