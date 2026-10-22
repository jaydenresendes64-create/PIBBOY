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
 *
 * Each copy also carries the data format it was written in (`schema`,
 * ST.DATA_SCHEMA; none for saves from before it, read as 0). A copy written
 * by a newer version of the app (a higher schema: fields this code would
 * drop) is never taken in and never written over: this window stops saving
 * and says to reopen the app (onNewerVersion). So an old tab, or an old
 * cached version, can't overwrite newer data.
 */
(function(ST){
  'use strict';

  var DB_NAME = 'status_terminal';
  var DB_VERSION = 1;
  var STORE = 'docs';
  var DOC_ID = 'state/player';                 // same document path the Claude db used
  var LS_KEY = 'status_terminal_state_v1';
  var LS_SAVED_AT_KEY = 'status_terminal_saved_at_v1';
  var LS_SCHEMA_KEY = 'status_terminal_schema_v1';
  var SCHEMA = ST.DATA_SCHEMA;
  var SAVE_DELAY_MS = 500;
  var OPEN_TIMEOUT_MS = 4000;
  var MAX_IMPORT_BYTES = 5*1024*1024;

  var dbPromise = null;
  var saveTimer = null;
  var lastSavedAt = 0;          // stamp of the copy this window loaded, took, or saved last
  var readOnly = false;         // the saved data couldn't be read: never write over it
  var stale = false;            // a newer version of the app saved: this one stops saving
  var onSaveFailed = function(){};
  var onNewerVersion = function(){};
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
    return {status:'found', savedAt:Number(record.savedAt)||0, schema:Number(record.schema)||0, data:record.data};
  }
  // A copy written by a newer version of the app than this one.
  function fromNewer(copy){ return copy.status==='found' && copy.schema>SCHEMA; }
  // This window stops saving for good (until the app is opened again) and says so, once.
  function goStale(){
    if (stale) return;
    stale = readOnly = true;
    clearTimeout(saveTimer);
    saveTimer = null;
    onNewerVersion();
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
          if (stored.status==='found' && (stored.savedAt>base || fromNewer(stored)) && ST.sanitizeImported(stored.data)){
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

  // ---------- the data before a replace (Settings → Undo) ----------
  // Before a backup, a reset or the old terminal's data replaces or changes
  // the whole state, the state as it was is kept in IndexedDB under its own
  // key, one at a time, so Settings can put it back. Copied at once (the
  // caller goes on changing app.state). Resolves true once kept.
  var PREVIOUS_ID = 'state/previous';
  function keepPrevious(state, reason){
    if (readOnly || !state) return Promise.resolve(false);
    var record = {id:PREVIOUS_ID, savedAt:Date.now(), schema:SCHEMA, reason:String(reason || ''), data:JSON.parse(JSON.stringify(state))};
    return openDb().then(function(db){
      if (!db) return false;
      return new Promise(function(resolve){
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(record);
        tx.oncomplete = function(){ resolve(true); };
        tx.onabort = function(){ resolve(false); };
      });
    }).catch(function(){ return false; });
  }
  // The kept one as {at, reason, state} (checked and migrated), or null:
  // none, unreadable, or written by a newer version (never put back here).
  function readPrevious(){
    return openDb().then(function(db){
      if (!db) return null;
      return new Promise(function(resolve){
        var req = db.transaction(STORE, 'readonly').objectStore(STORE).get(PREVIOUS_ID);
        req.onsuccess = function(){
          var r = req.result, state = r && !(Number(r.schema)>SCHEMA) ? ST.sanitizeImported(r.data) : null;
          resolve(state ? {at:Number(r.savedAt) || 0, reason:String(r.reason || ''), state:state} : null);
        };
        req.onerror = function(){ resolve(null); };
      });
    }).catch(function(){ return null; });
  }

  // ---------- localStorage ----------
  function readLocal(){
    var raw, stamp;
    try{
      raw = localStorage.getItem(LS_KEY);
      stamp = localStorage.getItem(LS_SAVED_AT_KEY);
    }catch(e){ return {status:'none'}; }
    if (raw===null) return {status:'empty'};
    try{ return {status:'found', savedAt:Number(stamp)||0, schema:localSchema(), data:JSON.parse(raw)}; }
    catch(e){ return {status:'failed'}; }
  }
  function localSchema(){
    try{ return Number(localStorage.getItem(LS_SCHEMA_KEY))||0; }catch(e){ return 0; }
  }
  // Just the stamp, so a save doesn't have to read the whole copy.
  function localStamp(){
    try{ return Number(localStorage.getItem(LS_SAVED_AT_KEY))||0; }catch(e){ return 0; }
  }
  // The data first, then its format, then its stamp: if the stamp can't be
  // written, the copy looks older than it is and never wins over a newer
  // one by mistake.
  function writeLocal(state, savedAt, schema){
    try{
      localStorage.setItem(LS_KEY, JSON.stringify(state));
      localStorage.setItem(LS_SCHEMA_KEY, String(schema));
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
      var best = null, unreadable = false, copies = [idb, readLocal()];
      // Saved by a newer version: shown as this version reads it, never saved over.
      if (copies.some(fromNewer)) goStale();
      copies.forEach(function(copy){
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
    if (fromNewer(copy)){ goStale(); return false; }
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
    if (localSchema()>SCHEMA){ goStale(); return Promise.resolve('failed'); }
    if (localStamp()>base){
      var local = readLocal();
      if (local.status==='found' && local.savedAt>base && adopt(local, true)) return Promise.resolve('conflict');
    }
    // Always later than any copy seen, even if the clock was moved back.
    var savedAt = Math.max(Date.now(), base+1);
    lastSavedAt = savedAt;
    var localOk = writeLocal(state, savedAt, SCHEMA);
    return writeIdb({id:DOC_ID, savedAt:savedAt, schema:SCHEMA, data:state}, base).then(function(){ return 'saved'; }, function(err){
      if (err && err.newer){
        // Put the localStorage copy back to the one being taken (unless yet
        // another save replaced it), so the refused change doesn't come back
        // on the next load.
        if (localOk && localStamp()===savedAt) writeLocal(err.newer.data, err.newer.savedAt, err.newer.schema);
        return adopt(err.newer, true) ? 'conflict' : 'failed';
      }
      return localOk ? 'saved' : 'failed';
    });
  }

  // After any change (a save asked for): the listener runs once, just after
  // (events.js looks for bobbleheads found).
  var onChange = null, changeTimer = null;
  function changed(){
    if (!onChange || changeTimer!==null) return;
    changeTimer = setTimeout(function(){ changeTimer = null; onChange(); }, 0);
  }

  function saveNow(){
    clearTimeout(saveTimer);
    saveTimer = null;
    changed();
    if (!ST.app.state || readOnly) return Promise.resolve('failed');
    return write(ST.app.state).then(function(result){
      if (result==='failed') onSaveFailed();
      return result;
    });
  }
  function scheduleSave(){
    if (readOnly) return;
    changed();
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
    if (e.key!==LS_SAVED_AT_KEY || readOnly || !ST.app.state) return;
    if (localSchema()>SCHEMA){ goStale(); return; }
    if (localStamp()<=lastSavedAt) return;
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
  // status-terminal-backup-YYYY-MM-DD.json, dated today, so backups sort by
  // date and a new one doesn't replace an older one.
  function backupName(){
    var d = new Date();
    function two(n){ return (n<10 ? '0' : '')+n; }
    return 'status-terminal-backup-'+d.getFullYear()+'-'+two(d.getMonth()+1)+'-'+two(d.getDate())+'.json';
  }
  // Resolves true once the file is handed over, false when the person
  // cancelled. On a phone, the share sheet (Save to Files, iCloud Drive,
  // AirDrop...): a Home Screen app on iPhone can't download a file. On a
  // computer, or when sharing files isn't possible, a download.
  function exportFile(state){
    var text = JSON.stringify(state, null, 2), name = backupName();
    var file = typeof File==='function' ? new File([text], name, {type:'application/json'}) : null;
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (touch && file && navigator.canShare && navigator.share && navigator.canShare({files:[file]})){
      return navigator.share({files:[file], title:name}).then(function(){ return true; }, function(err){
        return err && err.name==='AbortError' ? false : download(text, name);
      });
    }
    return Promise.resolve(download(text, name));
  }
  function download(text, name){
    var url = URL.createObjectURL(new Blob([text], {type:'application/json'}));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    return true;
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
    backupName: backupName,
    exportFile: exportFile,
    readJsonFile: readJsonFile,
    keepPrevious: keepPrevious,
    readPrevious: readPrevious,
    onSaveFailed: function(fn){ onSaveFailed = fn; },
    onNewerVersion: function(fn){ onNewerVersion = fn; },
    stale: function(){ return stale; },
    onExternalChange: function(fn){ onExternalChange = fn; },
    onChange: function(fn){ onChange = fn; }
  };
})(window.StatusTerminal);
