/**
 * Errors: what goes wrong in the app is kept on this device (the latest
 * ERRORS_MAX, in localStorage; never sent anywhere) and said once a
 * session, so it can be reported: Settings → About shows the latest and
 * copies the list. Loaded first, so it also catches the other scripts'.
 * Another site's script ("Script error.") has nothing to read: left out.
 */
(function(ST){
  'use strict';

  var KEY = 'status_terminal_errors_v1';
  var ERRORS_MAX = 20;
  var told = false;

  // The kept ones, oldest first: [{t, message, where}].
  function list(){
    try{
      var l = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(l) ? l.filter(function(e){ return e && typeof e.message==='string'; }) : [];
    }catch(e){ return []; }
  }
  // One error kept (and, the first time this session, a notice); its entry, or null.
  function record(message, where){
    message = String(message===undefined || message===null ? '' : message).slice(0, 300);
    if (!message || /^Script error\.?$/.test(message)) return null;
    var entry = {t:Date.now(), message:message, where:String(where || '').slice(0, 120)};
    var l = list().concat(entry).slice(-ERRORS_MAX);
    try{ localStorage.setItem(KEY, JSON.stringify(l)); }catch(e){}
    if (!told && ST.render && ST.render.showNotice){
      told = true;
      ST.render.showNotice('Something went wrong. Your data is safe: details in Settings → About.');
    }
    if (ST.errors.onChange) ST.errors.onChange();
    return entry;
  }
  function clear(){ try{ localStorage.removeItem(KEY); }catch(e){} }
  // The list as plain text, to paste in a message.
  function text(){
    return list().map(function(e){ return new Date(e.t).toISOString()+'  '+e.message+(e.where ? '  ('+e.where+')' : ''); }).join('\n');
  }

  window.addEventListener('error', function(e){
    if (!e || e.target!==window && e.target && e.target.tagName) return;      // a picture or file that didn't load
    record(e.message, (String(e.filename || '').split('/').pop() || '?')+':'+(e.lineno || 0));
  });
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason;
    record(r && r.message ? (r.name ? r.name+': ' : '')+r.message : r, 'promise');
  });

  ST.errors = {list:list, record:record, clear:clear, text:text, onChange:null, ERRORS_MAX:ERRORS_MAX};
})(window.StatusTerminal = window.StatusTerminal || {});
