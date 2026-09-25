/**
 * Holotapes (LOG tab) — journal entries in MALIK's own voice, like the
 * holotapes found in Fallout: record with the microphone, then play them
 * back on the Pip-Boy, rename them, share them (the share sheet on a
 * phone: Save to Files, AirDrop...) or remove them.
 *
 * The recordings stay on this device, in their own IndexedDB database
 * (status_terminal_holotapes), not in the saved state: they're too big
 * for it and for the backup file (a tape's Share button keeps a copy). The
 * state only counts them (lifetimeHolotapes, for a bobblehead).
 *
 * The microphone is asked for on the first "Record" (never before); the
 * recording stops by itself after MAX_S, or when the app goes to the
 * background (what was recorded is kept).
 *
 * The helpers at the top don't touch the page, so the tests run them in Node.
 */
(function(ST){
  'use strict';

  var DB_NAME = 'status_terminal_holotapes', STORE = 'tapes';
  var MAX_S = 300;                  // five minutes a tape
  var BARS = 16;                    // the level meter while recording
  var MIMES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  var escapeHtml = ST.escapeHtml, attr = ST.escapeHtml;

  // ---------- pure helpers ----------
  // The first format this browser records (iPhone: audio/mp4), or '' to
  // let it choose.
  function pickMime(isSupported){
    for (var i=0;i<MIMES.length;i++){ try{ if (isSupported(MIMES[i])) return MIMES[i]; }catch(e){} }
    return '';
  }
  function extFor(mime){
    return /mp4|aac|m4a/.test(mime) ? '.m4a' : /webm/.test(mime) ? '.webm' : /ogg/.test(mime) ? '.ogg' : '.audio';
  }
  // 0:07, 1:32.
  function durationText(seconds){
    var s = Math.max(0, Math.round(Number(seconds)||0));
    return Math.floor(s/60)+':'+(s%60<10 ? '0' : '')+(s%60);
  }
  function tapeTitle(n){ return 'Holotape #'+n; }
  // A record read back from the database, checked (or null).
  function checkRecord(r){
    if (!r || typeof r!=='object' || typeof r.id!=='string' || !(r.audio instanceof ArrayBuffer)) return null;
    return {id:r.id, title:String(r.title||'Holotape').slice(0, 80), date:typeof r.date==='string' ? r.date : '',
      at:Number(r.at)||0, seconds:Math.max(0, Number(r.seconds)||0), mime:typeof r.mime==='string' ? r.mime : '', audio:r.audio};
  }

  // ---------- storage ----------
  var dbPromise = null;
  function openDb(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function(resolve){
      var req;
      try{ req = window.indexedDB ? window.indexedDB.open(DB_NAME, 1) : null; }catch(e){ req = null; }
      if (!req){ resolve(null); return; }
      var timer = setTimeout(function(){ resolve(null); }, 4000);
      req.onupgradeneeded = function(){
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath:'id'});
      };
      req.onsuccess = function(){ clearTimeout(timer); resolve(req.result); };
      req.onerror = function(){ clearTimeout(timer); resolve(null); };
    });
    dbPromise.then(function(db){ if (!db) dbPromise = null; });
    return dbPromise;
  }
  function run(mode, work){
    return openDb().then(function(db){
      if (!db) throw new Error('No storage');
      return new Promise(function(resolve, reject){
        var tx = db.transaction(STORE, mode), result;
        result = work(tx.objectStore(STORE));
        tx.oncomplete = function(){ resolve(result && 'result' in result ? result.result : undefined); };
        tx.onerror = tx.onabort = function(){ reject(tx.error || new Error('Storage error')); };
      });
    });
  }
  function readAll(){
    return run('readonly', function(store){ return store.getAll(); }).then(function(list){
      return (list||[]).map(checkRecord).filter(Boolean).sort(function(a, b){ return b.at-a.at; });
    });
  }
  function put(record){ return run('readwrite', function(store){ store.put(record); }); }
  function remove(id){ return run('readwrite', function(store){ store.delete(id); }); }

  // ---------- state of the deck ----------
  var tapes = null;                 // the list, newest first (null until read)
  var failed = false;               // the database couldn't be opened
  var rec = null;                   // recording: {recorder, stream, chunks, started, mime, meter, timer}
  var player = null;                // playing: {id, audio, url}
  var confirmId = null;             // the tape whose removal awaits "Yes"
  var message = '';                 // a line under the deck (a refused microphone...)

  function load(){
    readAll().then(function(list){ tapes = list; failed = false; render(); }, function(){ tapes = []; failed = true; render(); });
  }

  // ---------- recording ----------
  function startRecording(){
    if (rec) return;
    message = '';
    var md = navigator.mediaDevices;
    if (!md || !md.getUserMedia || typeof MediaRecorder!=='function'){
      message = 'This browser can’t record audio.';
      render();
      return;
    }
    md.getUserMedia({audio:true}).then(function(stream){
      var mime = pickMime(function(t){ return MediaRecorder.isTypeSupported(t); });
      var recorder;
      try{ recorder = mime ? new MediaRecorder(stream, {mimeType:mime}) : new MediaRecorder(stream); }
      catch(e){ recorder = new MediaRecorder(stream); mime = ''; }
      rec = {recorder:recorder, stream:stream, chunks:[], started:Date.now(), mime:recorder.mimeType || mime || 'audio/mp4', meter:meter(stream)};
      recorder.ondataavailable = function(e){ if (e.data && e.data.size) rec.chunks.push(e.data); };
      recorder.onstop = finish;
      recorder.start(1000);
      rec.timer = setInterval(function(){
        if (!rec) return;
        var s = (Date.now()-rec.started)/1000;
        var clock = document.getElementById('tape-clock');
        if (clock) clock.textContent = durationText(s)+' / '+durationText(MAX_S);
        if (s>=MAX_S) stopRecording();
      }, 250);
      if (ST.sfx) ST.sfx.play('tape');
      render();
    }, function(err){
      message = err && err.name==='NotAllowedError'
        ? 'Microphone not allowed. Allow it for this app, then try again.'
        : 'No microphone available.';
      render();
    });
  }
  function stopRecording(){
    if (!rec || rec.stopping) return;
    rec.stopping = true;
    try{ rec.recorder.stop(); }catch(e){ finish(); }
  }
  // The recorder stopped: the tape saved, the microphone released.
  function finish(){
    var r = rec;
    if (!r) return;
    rec = null;
    clearInterval(r.timer);
    if (r.meter) r.meter.stop();
    r.stream.getTracks().forEach(function(t){ t.stop(); });
    if (ST.sfx) ST.sfx.play('tape');
    var seconds = (Date.now()-r.started)/1000;
    if (!r.chunks.length || seconds<0.5){ render(); return; }
    new Blob(r.chunks, {type:r.mime}).arrayBuffer().then(function(audio){
      var n = (tapes ? tapes.length : 0)+1;
      var record = {id:ST.genId(), title:tapeTitle(n), date:ST.todayStr(), at:Date.now(), seconds:seconds, mime:r.mime, audio:audio};
      return put(record).then(function(){
        tapes = [record].concat(tapes || []);
        if (ST.app.state){
          ST.app.state.lifetimeHolotapes = (ST.app.state.lifetimeHolotapes||0)+1;
          ST.storage.scheduleSave();
        }
        if (ST.render) ST.render.showNotice('Holotape saved: '+record.title+' ('+durationText(seconds)+')');
        render();
      });
    }).catch(function(){
      message = 'The holotape couldn’t be saved on this device.';
      render();
    });
  }
  // A small level meter while recording: BARS bars following the voice.
  function meter(stream){
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try{
      var ctx = new AC(), source = ctx.createMediaStreamSource(stream), analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      var data = new Uint8Array(analyser.frequencyBinCount), frame = null;
      (function draw(){
        var bars = document.querySelectorAll('.tape-meter i');
        if (bars.length && !ST.stayStill()){
          analyser.getByteFrequencyData(data);
          for (var i=0;i<bars.length;i++) bars[i].style.height = (8+Math.round(data[i+1]/255*92))+'%';
        }
        frame = requestAnimationFrame(draw);
      })();
      return {stop:function(){ cancelAnimationFrame(frame); ctx.close().catch(function(){}); }};
    }catch(e){ return null; }
  }

  // ---------- playing ----------
  function play(id){
    var was = player && player.id;
    stopPlaying();
    if (was===id) return;                   // the same tape again: stop
    var tape = find(id);
    if (!tape) return;
    var url = URL.createObjectURL(new Blob([tape.audio], {type:tape.mime}));
    var audio = new Audio(url);
    player = {id:id, audio:audio, url:url};
    audio.addEventListener('timeupdate', progress);
    audio.addEventListener('ended', function(){ stopPlaying(); render(); });
    audio.play().catch(function(){ stopPlaying(); message = 'This holotape can’t be played here.'; render(); });
    if (ST.sfx) ST.sfx.play('tape');
    render();
  }
  function stopPlaying(){
    if (!player) return;
    player.audio.pause();
    URL.revokeObjectURL(player.url);
    player = null;
  }
  function progress(){
    if (!player) return;
    var bar = document.querySelector('.tape[data-id="'+player.id+'"] .tape-progress i');
    var d = player.audio.duration, t = player.audio.currentTime;
    if (bar && d>0 && isFinite(d)) bar.style.width = (t/d*100)+'%';
  }

  // ---------- sharing, renaming, removing ----------
  function share(id){
    var tape = find(id);
    if (!tape) return;
    var name = tape.title.replace(/[^\w\- #]+/g, '').trim()+extFor(tape.mime);
    var file = typeof File==='function' ? new File([tape.audio], name, {type:tape.mime}) : null;
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (touch && file && navigator.canShare && navigator.share && navigator.canShare({files:[file]})){
      navigator.share({files:[file], title:tape.title}).catch(function(){});
      return;
    }
    var url = URL.createObjectURL(new Blob([tape.audio], {type:tape.mime}));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }
  function rename(id, title){
    var tape = find(id);
    title = String(title||'').trim().slice(0, 80);
    if (!tape || !title || title===tape.title) return;
    tape.title = title;
    put(tape).catch(function(){});
  }
  function removeTape(id){
    if (player && player.id===id) stopPlaying();
    confirmId = null;
    remove(id).then(function(){
      tapes = (tapes||[]).filter(function(t){ return t.id!==id; });
      render();
    }, function(){ message = 'The holotape couldn’t be removed.'; render(); });
  }
  function find(id){ return (tapes||[]).filter(function(t){ return t.id===id; })[0] || null; }

  // ---------- on the screen ----------
  // Drawn into #holotapes, which renderLog() (js/render.js) puts in the LOG tab.
  function render(){
    var box = document.getElementById('holotapes');
    if (!box) return;
    var html = '<div class="panel-title">Holotapes <span class="panel-count">'+(tapes ? tapes.length : '…')+'</span></div>';
    if (rec){
      html += '<div class="tape-deck recording"><span class="tape-rec">&#9679; REC</span>'+
        '<span class="tape-meter" aria-hidden="true">'+new Array(BARS+1).join('<i></i>')+'</span>'+
        '<span class="tape-clock" id="tape-clock">'+durationText((Date.now()-rec.started)/1000)+' / '+durationText(MAX_S)+'</span>'+
        '<button class="tape-btn tape-stop" data-tape="stop">&#9632; Stop</button></div>';
    } else {
      html += '<button class="tape-btn tape-record" data-tape="record">&#9679; Record a holotape</button>';
    }
    if (message) html += '<div class="empty-note reset-warning">'+escapeHtml(message)+'</div>';
    if (failed) html += '<div class="empty-note">Holotapes can’t be kept in this browser.</div>';
    else if (tapes && !tapes.length && !rec) html += '<div class="empty-note">No holotapes yet: tell the Pip-Boy about your day.</div>';
    (tapes||[]).forEach(function(t){
      var playing = player && player.id===t.id;
      html += '<div class="tape'+(playing ? ' playing' : '')+'" data-id="'+attr(t.id)+'">'+
        '<svg class="tape-icon" viewBox="0 0 32 22" aria-hidden="true"><rect x="1.5" y="1.5" width="29" height="19" rx="2"/>'+
          '<circle cx="10" cy="10" r="3.5"/><circle cx="22" cy="10" r="3.5"/><path d="M13.5 10h5M7 20l2-4h14l2 4"/></svg>'+
        '<div class="tape-text">'+
          '<input class="tape-title" data-tape="title" data-id="'+attr(t.id)+'" value="'+escapeHtml(t.title)+'" maxlength="80" aria-label="Holotape name">'+
          '<span class="tape-meta">'+escapeHtml([ST.dateText(t.date), durationText(t.seconds)].filter(Boolean).join(' · '))+'</span>'+
          '<span class="tape-progress" aria-hidden="true"><i></i></span>'+
        '</div>'+
        '<button class="tape-btn" data-tape="play" data-id="'+attr(t.id)+'" aria-label="'+(playing ? 'Stop' : 'Play')+': '+escapeHtml(t.title)+'">'+(playing ? '&#9632;' : '&#9654;')+'</button>'+
        '<button class="tape-btn" data-tape="share" data-id="'+attr(t.id)+'" aria-label="Share: '+escapeHtml(t.title)+'">&#8599;</button>'+
        '<button class="remove-btn" data-tape="remove" data-id="'+attr(t.id)+'" aria-label="Remove: '+escapeHtml(t.title)+'">&times;</button>'+
      '</div>';
      if (confirmId===t.id){
        html += '<div class="card-confirm row-confirm"><span class="reset-warning">Erase this holotape?</span>'+
          '<button class="confirm-yes" data-tape="remove-yes" data-id="'+attr(t.id)+'">Yes, erase</button>'+
          '<button data-tape="remove-no">Cancel</button></div>';
      }
    });
    box.innerHTML = html;
    if (player) progress();
  }

  function onClick(e){
    var btn = e.target.closest('[data-tape]');
    if (!btn || btn.tagName==='INPUT') return;
    var what = btn.getAttribute('data-tape'), id = btn.getAttribute('data-id');
    if (what==='record') startRecording();
    else if (what==='stop') stopRecording();
    else if (what==='play') play(id);
    else if (what==='share') share(id);
    else if (what==='remove'){ confirmId = id; render(); }
    else if (what==='remove-no'){ confirmId = null; render(); }
    else if (what==='remove-yes') removeTape(id);
  }
  function onChange(e){
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-tape')==='title'){
      rename(t.getAttribute('data-id'), t.value);
      var tape = find(t.getAttribute('data-id'));
      if (tape) t.value = tape.title;       // emptied: the name stays as it was
    }
  }
  function init(){
    var tab = document.getElementById('tab-log');
    if (!tab) return;
    tab.addEventListener('click', onClick);
    tab.addEventListener('change', onChange);
    tab.addEventListener('keydown', function(e){
      if (e.key==='Enter' && e.target.getAttribute && e.target.getAttribute('data-tape')==='title'){ e.preventDefault(); e.target.blur(); }
    });
    // To the background: what's recorded is kept, and nothing plays on.
    document.addEventListener('visibilitychange', function(){
      if (document.visibilityState!=='hidden') return;
      stopRecording();
      if (player){ stopPlaying(); render(); }
    });
    load();
  }

  ST.holotapes = {
    MAX_S: MAX_S,
    pickMime: pickMime, extFor: extFor, durationText: durationText, tapeTitle: tapeTitle, checkRecord: checkRecord,
    init: init, render: render
  };
})(window.StatusTerminal);
