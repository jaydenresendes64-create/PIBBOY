/**
 * Persistence: the state document is stored whole, twice.
 *
 * Every save writes the same copy to IndexedDB and to localStorage (same key
 * the single-file version used, so a save it made on this origin is picked
 * up on first load), each stamped with `savedAt`. load() checks both copies
 * and keeps the newest one that reads back as a valid state: a missing,
 * corrupted or half-written copy falls back to the other one. When a copy
 * exists but neither can be read, load() fails instead of starting empty,
 * so a fresh start can never be saved over real data.
 *
 * Several windows (tabs) can have the app open. A save never overwrites a
 * copy another window saved after this one last loaded or saved: the newer
 * copy is taken instead (onExternalChange). Windows also follow each
 * other's saves as they happen, through the localStorage `storage` event.
 */
(function(ST){
  'use strict';

  var DB_NAME = 'status_terminal';
  var DB_VERSION = 1;
  var STORE = 'docs';
  var DOC_ID = 'state/player';                 // same document path the Claude db used
  var LS_KEY = 'status_terminal_state_v1';
  var LS_SAVED_AT_KEY = 'status_terminal_saved_at_v1';
  var SAVE_DELAY_MS = 500;
  var OPEN_TIMEOUT_MS = 4000;
  var MAX_IMPORT_BYTES = 5*1024*1024;

  var dbPromise = null;
  var saveTimer = null;
  var lastSavedAt = 0;          // stamp of the copy this window loaded, took, or saved last
  var readOnly = false;         // the saved data couldn't be read: never write over it
  var onSaveFailed = function(){};
  var onExternalChange = function(){};

  // ---------- IndexedDB ----------
  // Resolves with an open database, or null when this browser has no
  // IndexedDB (then nothing can have been stored there). Rejects when it
  // exists but doesn't open: an error, or no answer in time (a known iOS
  // Safari bug). One retry; the next call tries again from scratch.
  function openDb(){
    if (!dbPromise){
      dbPromise = openOnce().catch(openOnce);
      dbPromise.catch(function(){ dbPromise = null; });
    }
    return dbPromise;
  }
  function openOnce(){
    return new Promise(function(resolve, reject){
      var req;
      try{
        if (!window.indexedDB){ resolve(null); return; }
        req = window.indexedDB.open(DB_NAME, DB_VERSION);
      }catch(e){ resolve(null); return; }       // storage disabled (SecurityError)
      var timedOut = false;
      var timer = setTimeout(function(){ timedOut = true; reject(new Error('IndexedDB did not open')); }, OPEN_TIMEOUT_MS);
      req.onupgradeneeded = function(){
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath:'id'});
      };
      req.onsuccess = function(){
        clearTimeout(timer);
        var db = req.result;
        if (timedOut){ db.close(); return; }
        db.onversionchange = function(){ db.close(); dbPromise = null; };
        db.onclose = function(){ dbPromise = null; };     // the browser dropped the connection
        resolve(db);
      };
      req.onerror = function(){ clearTimeout(timer); reject(req.error || new Error('IndexedDB error')); };
    });
  }
  // One copy as {status, savedAt, data}: status is 'found', 'empty' (nothing
  // saved), 'none' (this storage doesn't exist here) or 'failed' (it exists
  // but couldn't be read).
  function readIdb(){
    return openDb().then(function(db){
      if (!db) return {status:'none'};
      return new Promise(function(resolve, reject){
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).get(DOC_ID);
        req.onsuccess = function(){ resolve(copyOf(req.result)); };
        req.onerror = function(){ reject(req.error); };
      });
    }).catch(function(){ return {status:'failed'}; });
  }
  function copyOf(record){
    if (!record) return {status:'empty'};
    return {status:'found', savedAt:Number(record.savedAt)||0, data:record.data};
  }
  // Writes `record` unless the stored copy is newer than `base`, the stamp
  // this window last knew: then another window saved in between, and the
  // write is refused with err.newer = that copy. The check and the write
  // happen in one transaction, so two windows can't interleave them.
  function writeIdb(record, base){
    return openDb().then(function(db){
      if (!db) throw new Error('IndexedDB unavailable');
      return new Promise(function(resolve, reject){
        var tx = db.transaction(STORE, 'readwrite');
        var store = tx.objectStore(STORE);
        var newer = null;
        var get = store.get(DOC_ID);
        get.onsuccess = function(){
          var stored = copyOf(get.result);
          if (stored.status==='found' && stored.savedAt>base && ST.sanitizeImported(stored.data)){
            newer = stored;
            tx.abort();
          } else {
            store.put(record);
          }
        };
        tx.oncomplete = function(){ resolve(); };
        tx.onabort = function(){
          var err = tx.error || new Error('IndexedDB write aborted');
          err.newer = newer;
          reject(err);
        };
      });
    });
  }

  // ---------- localStorage ----------
  function readLocal(){
    var raw, stamp;
    try{
      raw = localStorage.getItem(LS_KEY);
      stamp = localStorage.getItem(LS_SAVED_AT_KEY);
    }catch(e){ return {status:'none'}; }
    if (raw===null) return {status:'empty'};
    try{ return {status:'found', savedAt:Number(stamp)||0, data:JSON.parse(raw)}; }
    catch(e){ return {status:'failed'}; }
  }
  // Just the stamp, so a save doesn't have to read the whole copy.
  function localStamp(){
    try{ return Number(localStorage.getItem(LS_SAVED_AT_KEY))||0; }catch(e){ return 0; }
  }
  // The data first, then its stamp: if the stamp can't be written, the copy
  // looks older than it is and never wins over a newer one by mistake.
  function writeLocal(state, savedAt){
    try{
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(LS_SAVED_AT_KEY, String(savedAt));
      return true;
    }catch(e){ return false; }
  }

  // A copy as a clean state document (migrated, checked), or null.
  function stateOf(copy){
    return copy.status==='found' ? ST.sanitizeImported(copy.data) : null;
  }

  // ---------- public API ----------
  // Resolves with the newest readable copy, already migrated and checked, or
  // null on a real first run (nothing saved anywhere). Rejects when saved data
  // exists but can't be read: the app then stops rather than start empty.
  function load(){
    return readIdb().then(function(idb){
      var best = null, unreadable = false;
      [idb, readLocal()].forEach(function(copy){
        var state = stateOf(copy);
        if (state){
          if (!best || copy.savedAt>best.savedAt) best = {savedAt:copy.savedAt, state:state};
        } else if (copy.status==='failed' || copy.status==='found'){
          unreadable = true;
        }
      });
      if (best){ lastSavedAt = best.savedAt; return best.state; }
      if (unreadable) throw new Error('Saved data could not be read');
      return null;
    }).catch(function(err){
      readOnly = true;
      throw err;
    });
  }

  // Takes a copy another window saved: it replaces this window's state.
  // `lost` says whether this window had a change that wasn't saved yet.
  function adopt(copy, lost){
    var state = stateOf(copy);
    if (!state) return false;
    clearTimeout(saveTimer);
    saveTimer = null;
    lastSavedAt = copy.savedAt;
    onExternalChange(state, lost);
    return true;
  }

  // Resolves 'saved', 'failed' (stored nowhere) or 'conflict' (another
  // window saved first; its copy was taken instead). The localStorage copy
  // is written before this returns, so a save started as the page goes away
  // is kept even if IndexedDB doesn't get to finish.
  function write(state){
    var base = lastSavedAt;
    if (localStamp()>base){
      var local = readLocal();
      if (local.status==='found' && local.savedAt>base && adopt(local, true)) return Promise.resolve('conflict');
    }
    // Always later than any copy seen, even if the clock was moved back.
    var savedAt = Math.max(Date.now(), base+1);
    lastSavedAt = savedAt;
    var localOk = writeLocal(state, savedAt);
    return writeIdb({id:DOC_ID, savedAt:savedAt, data:state}, base).then(function(){ return 'saved'; }, function(err){
      if (err && err.newer){
        // Put the localStorage copy back to the one being taken (unless yet
        // another save replaced it), so the refused change doesn't come back
        // on the next load.
        if (localOk && localStamp()===savedAt) writeLocal(err.newer.data, err.newer.savedAt);
        return adopt(err.newer, true) ? 'conflict' : 'failed';
      }
      return localOk ? 'saved' : 'failed';
    });
  }

  function saveNow(){
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!ST.app.state || readOnly) return Promise.resolve('failed');
    return write(ST.app.state).then(function(result){
      if (result==='failed') onSaveFailed();
      return result;
    });
  }
  function scheduleSave(){
    if (readOnly) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
  }

  // Runs when the page is hidden or unloaded: a save still waiting for its
  // delay is done now (its localStorage copy synchronously).
  function flush(){
    if (saveTimer!==null) saveNow();
  }

  // Another window saved: follow it. A change this window hadn't saved yet
  // can't be merged, so it gives way to the newer copy (and says so).
  function onStorage(e){
    if (e.key!==LS_SAVED_AT_KEY || readOnly || !ST.app.state || localStamp()<=lastSavedAt) return;
    var copy = readLocal();
    if (copy.status==='found' && copy.savedAt>lastSavedAt) adopt(copy, saveTimer!==null);
  }
  window.addEventListener('storage', onStorage);

  // Asks the browser not to clear this site's storage when space runs low
  // (Chrome decides silently; Firefox may ask once). Nothing changes if it
  // says no or doesn't support it.
  function requestPersistence(){
    var storage = navigator.storage;
    if (!storage || typeof storage.persist!=='function') return;
    Promise.resolve(typeof storage.persisted==='function' ? storage.persisted() : false).then(function(persisted){
      if (!persisted) return storage.persist();
    }).catch(function(){});
  }

  // ---------- backup files ----------
  function exportFile(state){
    var blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'status-terminal-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }
  function readJsonFile(file){
    return new Promise(function(resolve, reject){
      if (file.size > MAX_IMPORT_BYTES){ reject(new Error('File too large')); return; }
      var reader = new FileReader();
      reader.onload = function(){
        try{ resolve(JSON.parse(reader.result)); }catch(e){ reject(e); }
      };
      reader.onerror = function(){ reject(reader.error); };
      reader.readAsText(file);
    });
  }

  ST.storage = {
    load: load,
    saveNow: saveNow,
    scheduleSave: scheduleSave,
    flush: flush,
    requestPersistence: requestPersistence,
    exportFile: exportFile,
    readJsonFile: readJsonFile,
    onSaveFailed: function(fn){ onSaveFailed = fn; },
    onExternalChange: function(fn){ onExternalChange = fn; }
  };
})(window.StatusTerminal);
