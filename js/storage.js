/**
 * Persistence — replaces the Claude-only `db` capability.
 *
 * The state document is stored whole in IndexedDB. When IndexedDB is missing
 * or a write fails, it goes to localStorage instead (same key the single-file
 * version used, so a save it made on this origin is picked up on first load).
 * Each copy carries a `savedAt` timestamp and load() returns the newer one.
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
  var OPEN_TIMEOUT_MS = 3000;
  var MAX_IMPORT_BYTES = 5*1024*1024;

  var dbPromise = null;
  var saveTimer = null;
  var writesInFlight = 0;
  var onSaveFailed = function(){};

  // ---------- IndexedDB ----------
  // Resolves with an open database, or null when IndexedDB can't be used here
  // (disabled, private-mode restrictions, or it never answers).
  function openDb(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function(resolve){
      var req;
      try{ req = window.indexedDB ? window.indexedDB.open(DB_NAME, DB_VERSION) : null; }catch(e){ req = null; }
      if (!req){ resolve(null); return; }
      var timer = setTimeout(function(){ resolve(null); }, OPEN_TIMEOUT_MS);
      req.onupgradeneeded = function(){
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath:'id'});
      };
      req.onsuccess = function(){
        clearTimeout(timer);
        var db = req.result;
        db.onversionchange = function(){ db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = function(){ clearTimeout(timer); resolve(null); };
    });
    return dbPromise;
  }
  function idbGet(){
    return openDb().then(function(db){
      if (!db) return null;
      return new Promise(function(resolve, reject){
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).get(DOC_ID);
        req.onsuccess = function(){ resolve(req.result || null); };
        req.onerror = function(){ reject(req.error); };
      });
    });
  }
  function idbPut(record){
    return openDb().then(function(db){
      if (!db) throw new Error('IndexedDB unavailable');
      return new Promise(function(resolve, reject){
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = function(){ resolve(); };
        tx.onerror = function(){ reject(tx.error); };
        tx.onabort = function(){ reject(tx.error || new Error('IndexedDB write aborted')); };
        if (typeof tx.commit==='function') tx.commit();
      });
    });
  }

  // ---------- localStorage ----------
  function readLocal(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return {savedAt:Number(localStorage.getItem(LS_SAVED_AT_KEY))||0, data:JSON.parse(raw)};
    }catch(e){ return null; }
  }
  function writeLocal(state, savedAt){
    try{
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(LS_SAVED_AT_KEY, String(savedAt));
      return true;
    }catch(e){ return false; }
  }

  // ---------- public API ----------
  // Resolves with the most recently saved state document, or null on first run.
  function load(){
    return idbGet().catch(function(){ return null; }).then(function(record){
      var local = readLocal();
      if (record && local) return local.savedAt > (record.savedAt||0) ? local.data : record.data;
      if (record) return record.data;
      return local ? local.data : null;
    });
  }

  // Resolves true once the state is stored somewhere, false if nothing worked.
  function write(state){
    var savedAt = Date.now();
    writesInFlight++;
    return idbPut({id:DOC_ID, savedAt:savedAt, data:state}).then(function(){ return true; }, function(){
      return writeLocal(state, savedAt);
    }).then(function(ok){
      writesInFlight--;
      return ok;
    });
  }

  function saveNow(){
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!ST.app.state) return Promise.resolve(false);
    return write(ST.app.state).then(function(ok){
      if (!ok) onSaveFailed();
      return ok;
    });
  }
  function scheduleSave(){
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DELAY_MS);
  }

  // Runs when the page is hidden or unloaded. An IndexedDB write started now
  // isn't guaranteed to finish before the page goes away, so a synchronous
  // localStorage copy is taken as well; load() keeps whichever is newer.
  function flush(){
    if (!ST.app.state || (!saveTimer && !writesInFlight)) return;
    var pending = saveTimer!==null;
    clearTimeout(saveTimer);
    saveTimer = null;
    writeLocal(ST.app.state, Date.now());
    if (pending) write(ST.app.state);
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
    exportFile: exportFile,
    readJsonFile: readJsonFile,
    onSaveFailed: function(fn){ onSaveFailed = fn; }
  };
})(window.StatusTerminal);
