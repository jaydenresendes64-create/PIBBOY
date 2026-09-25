/**
 * Custom sounds — replace any of the app's sounds with a clip of your own,
 * cut from a video or audio file on this device (for example a recording of
 * the real Pip-Boy).
 *
 * The footer link "Custom sounds" opens a panel:
 *   - each sound, with ▶ to hear it and Reset to go back to the built-in one;
 *   - "Choose a video or audio file": the file is decoded in the browser and
 *     every separate sound in it is found automatically (detectSegments).
 *     Each one gets ▶, start/end boxes to trim it, and "Use as…" to make it
 *     one of the app's sounds.
 *
 * The clips are kept only in this browser (IndexedDB "status_terminal_sounds",
 * separate from the saved data): never in the repository, never in backups.
 * Each clip is stored as a mono WAV: at most MAX_CLIP_S seconds, except the
 * level-up and main-quest sounds (LONG_SLOTS), which may play a whole piece of
 * music, up to MAX_LONG_S. The "ALL" line of the list is the whole file.
 */
(function(ST){
  'use strict';

  var DB_NAME = 'status_terminal_sounds';
  var STORE = 'clips';
  var MAX_CLIP_S = 6;
  var MAX_LONG_S = 60;
  var LONG_SLOTS = {levelUp:true, quest:true};
  function maxFor(slot){ return LONG_SLOTS[slot] ? MAX_LONG_S : MAX_CLIP_S; }
  var MAX_FILE_BYTES = 80*1024*1024;
  var FADE_S = 0.004;           // a tiny fade at each end of a cut, so it doesn't click
  var LABELS = {
    boot:'Power on', tick:'Scroll tick', press:'Button', tab:'Tab switch', complete:'Quest check',
    levelUp:'Level up', quest:'Main quest completed', discover:'Place discovered', sold:'Item sold', error:'Error',
    step:'Skill + / −', mapSelect:'Map: select a place', geiger:'Rads (Geiger counter)', radaway:'Backup made (RadAway)', key:'RobCo boot: typing', ping:'Scanner: blip', perk:'Perk acquired', bobble:'Bobblehead found', tape:'Holotape in / out'
  };

  // ---------- storage ----------
  var dbPromise = null;
  function openDb(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function(resolve){
      var req;
      try{ req = window.indexedDB ? window.indexedDB.open(DB_NAME, 1) : null; }catch(e){ req = null; }
      if (!req){ resolve(null); return; }
      var timer = setTimeout(function(){ resolve(null); }, 3000);
      req.onupgradeneeded = function(){
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath:'slot'});
      };
      req.onsuccess = function(){ clearTimeout(timer); resolve(req.result); };
      req.onerror = function(){ clearTimeout(timer); resolve(null); };
    });
    return dbPromise;
  }
  function request(mode, action){
    return openDb().then(function(db){
      if (!db) throw new Error('Storage unavailable');
      return new Promise(function(resolve, reject){
        var tx = db.transaction(STORE, mode);
        var req = action(tx.objectStore(STORE));
        tx.oncomplete = function(){ resolve(req ? req.result : undefined); };
        tx.onerror = tx.onabort = function(){ reject(tx.error || new Error('Storage error')); };
      });
    });
  }
  // Every saved clip: [{slot, wav (ArrayBuffer), seconds, savedAt}].
  function readAll(){
    return request('readonly', function(store){ return store.getAll(); }).then(function(list){
      return (list || []).filter(function(r){ return r && LABELS[r.slot] && r.wav instanceof ArrayBuffer; });
    }, function(){ return []; });
  }
  function saveClip(slot, wav, seconds){
    return request('readwrite', function(store){ return store.put({slot:slot, wav:wav, seconds:seconds, savedAt:Date.now()}); });
  }
  function removeClip(slot){
    return request('readwrite', function(store){ return store.delete(slot); });
  }

  // ---------- sound maths (tested in tests/sfx.test.js) ----------
  // Finds the separate sounds in a recording: stretches louder than the
  // background, split where it goes quiet for more than gapMs. Returns
  // [{start, end}] in seconds, with a little room before and after each.
  function detectSegments(samples, sampleRate, options){
    options = options || {};
    var frame = Math.max(1, Math.round(sampleRate*0.01));          // 10 ms
    var count = Math.floor(samples.length/frame);
    if (!count) return [];
    var rms = new Float32Array(count), peak = 0;
    for (var i=0; i<count; i++){
      var sum = 0;
      for (var j=i*frame, end=j+frame; j<end; j++) sum += samples[j]*samples[j];
      rms[i] = Math.sqrt(sum/frame);
      if (rms[i] > peak) peak = rms[i];
    }
    if (peak < 1e-4) return [];
    var sorted = Array.prototype.slice.call(rms).sort(function(a, b){ return a-b; });
    var floor = sorted[Math.floor(count*0.2)];
    var threshold = Math.max(floor*3, floor + (peak-floor)*(options.sensitivity || 0.08), peak*0.02);
    var gapFrames = Math.round((options.gapMs || 120)/10);
    var minFrames = Math.max(1, Math.round((options.minMs || 40)/10));
    var duration = samples.length/sampleRate;
    var segments = [], first = -1, last = -1;
    function close(){
      if (last-first+1 >= minFrames){
        var start = Math.max(0, first*frame/sampleRate - 0.015);
        var stop = Math.min(duration, (last+1)*frame/sampleRate + 0.06);
        segments.push({start:round2(start), end:round2(Math.min(stop, start + MAX_CLIP_S))});
      }
      first = last = -1;
    }
    for (i=0; i<count; i++){
      if (rms[i] > threshold){ if (first<0) first = i; last = i; }
      else if (first>=0 && i-last > gapFrames) close();
    }
    if (first>=0) close();
    return segments.slice(0, 60);
  }
  function round2(v){ return Math.round(v*100)/100; }

  // A mono cut of an AudioBuffer between two times, with tiny fades.
  function cut(buffer, start, end, limit){
    var rate = buffer.sampleRate;
    var from = Math.max(0, Math.floor(start*rate));
    var to = Math.min(buffer.length, Math.floor(Math.min(end, start + (limit || MAX_CLIP_S))*rate));
    var length = Math.max(0, to-from);
    var out = new Float32Array(length);
    var channels = buffer.numberOfChannels;
    for (var c=0; c<channels; c++){
      var data = buffer.getChannelData(c);
      for (var i=0; i<length; i++) out[i] += data[from+i]/channels;
    }
    var fade = Math.min(Math.floor(FADE_S*rate), Math.floor(length/2));
    for (i=0; i<fade; i++){
      var k = i/fade;
      out[i] *= k;
      out[length-1-i] *= k;
    }
    return out;
  }
  // 16-bit mono WAV file.
  function encodeWav(samples, sampleRate){
    var buffer = new ArrayBuffer(44 + samples.length*2);
    var view = new DataView(buffer);
    function text(offset, s){ for (var i=0; i<s.length; i++) view.setUint8(offset+i, s.charCodeAt(i)); }
    text(0, 'RIFF'); view.setUint32(4, 36 + samples.length*2, true); text(8, 'WAVE');
    text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate*2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, samples.length*2, true);
    for (var i=0; i<samples.length; i++){
      var s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i*2, s<0 ? s*0x8000 : s*0x7FFF, true);
    }
    return buffer;
  }

  // ---------- sound packs ----------
  // Every clip in one JSON file, to move them to another device (for example
  // cut on a computer, used on the phone): "Export sound pack" / "Import sound
  // pack" in the panel. Like the clips themselves, a pack never goes into the
  // repository (.gitignore) or into backups.
  var PACK_TYPE = 'pibboy-sounds';
  function toBase64(buffer){
    var bytes = new Uint8Array(buffer), chunks = [];
    for (var i=0; i<bytes.length; i+=0x8000) chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i+0x8000)));
    return btoa(chunks.join(''));
  }
  function fromBase64(text){
    var binary = atob(text), bytes = new Uint8Array(binary.length);
    for (var i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  function makePack(records){
    return JSON.stringify({type:PACK_TYPE, version:1, clips:records.map(function(r){
      return {slot:r.slot, seconds:Math.round((r.seconds||0)*1000)/1000, wav:toBase64(r.wav)};
    })});
  }
  // [{slot, wav, seconds}] from a pack's text; throws when it isn't one.
  function readPack(text){
    var pack = JSON.parse(text);
    if (!pack || pack.type!==PACK_TYPE || !Array.isArray(pack.clips)) throw new Error('Not a sound pack');
    return pack.clips.filter(function(c){
      return c && LABELS[c.slot] && typeof c.wav==='string' && c.wav.length < 12e6;
    }).map(function(c){
      return {slot:c.slot, wav:fromBase64(c.wav), seconds:Number(c.seconds)||0};
    });
  }
  function exportPack(){
    readAll().then(function(records){
      if (!records.length){ status('No clips of yours to export yet.'); return; }
      var blob = new Blob([makePack(records)], {type:'application/json'});
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'pibboy-sound-pack.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      status('Exported '+records.length+' clip'+(records.length>1 ? 's' : '')+'.');
    });
  }
  function importPack(file){
    if (!file) return Promise.resolve(0);
    if (file.size > 20*1024*1024){ status('That file is too big for a sound pack.'); return Promise.resolve(0); }
    return file.text().then(readPack).then(function(clips){
      var done = 0;
      return clips.reduce(function(chain, clip){
        return chain.then(function(){
          return ST.sfx.setCustom(clip.slot, clip.wav).then(function(ok){
            if (!ok) return;
            return saveClip(clip.slot, clip.wav, clip.seconds).then(function(){ done++; });
          });
        });
      }, Promise.resolve()).then(function(){
        status(done ? 'Imported '+done+' sound'+(done>1 ? 's' : '')+'.' : 'No usable sounds in that pack.');
        renderSlots();
        return done;
      });
    }).catch(function(){
      status('That file isn’t a PIBBOY sound pack.');
      if (ST.sfx) ST.sfx.play('error');
      return 0;
    });
  }

  // ---------- the panel ----------
  var panel = null, opener = null;
  var source = null;            // the decoded file
  var segments = [];

  function el(id){ return document.getElementById(id); }
  function escapeHtml(s){ return ST.escapeHtml ? ST.escapeHtml(s) : String(s); }
  function status(text){ var s = el('sl-status'); if (s) s.textContent = text; }
  function time(v){ return Number(v).toFixed(2); }

  function renderSlots(){
    el('sl-slots').innerHTML = ST.sfx.NAMES.map(function(name){
      var own = ST.sfx.hasCustom(name);
      return '<div class="sl-row">'+
        '<span class="sl-name">'+escapeHtml(LABELS[name] || name)+'</span>'+
        '<span class="sl-kind'+(own ? ' sl-own' : '')+'">'+(own ? 'your clip' : 'built-in')+'</span>'+
        '<button class="sl-btn" data-sl="hear" data-name="'+name+'" aria-label="Play '+escapeHtml(LABELS[name])+'">&#9654;</button>'+
        (own ? '<button class="sl-btn" data-sl="reset" data-name="'+name+'">Reset</button>' : '<span class="sl-spacer"></span>')+
      '</div>';
    }).join('');
  }
  function renderSegments(){
    var options = '<option value="">Use as…</option>' + ST.sfx.NAMES.map(function(name){
      return '<option value="'+name+'">'+escapeHtml(LABELS[name])+'</option>';
    }).join('');
    el('sl-segments').innerHTML = segments.map(function(seg, i){
      var label = seg.whole ? 'the whole file' : 'sound '+i;
      return '<div class="sl-row sl-seg">'+
        '<span class="sl-num">'+(seg.whole ? 'ALL' : '#'+i)+'</span>'+
        '<input class="sl-time" type="number" step="0.01" min="0" data-i="'+i+'" data-edge="start" value="'+time(seg.start)+'" aria-label="'+label+' start, seconds">'+
        '<span class="sl-dash">–</span>'+
        '<input class="sl-time" type="number" step="0.01" min="0" data-i="'+i+'" data-edge="end" value="'+time(seg.end)+'" aria-label="'+label+' end, seconds">'+
        '<button class="sl-btn" data-sl="try" data-i="'+i+'" aria-label="Play '+label+'">&#9654;</button>'+
        '<select class="sl-use" data-i="'+i+'" aria-label="Use '+label+' as">'+options+'</select>'+
      '</div>';
    }).join('');
  }

  function loadFile(file){
    if (!file) return Promise.resolve();
    if (file.size > MAX_FILE_BYTES){ status('That file is too big (80 MB max).'); return Promise.resolve(); }
    status('Reading '+file.name+'…');
    el('sl-segments').innerHTML = '';
    return file.arrayBuffer().then(ST.sfx.decode).then(function(buffer){
      if (!buffer){
        status('This browser can’t read the sound in that file. Try an mp4, m4a, mp3 or wav.');
        if (ST.sfx) ST.sfx.play('error');
        return;
      }
      source = buffer;
      // "ALL" (the whole file) first, then each sound found in it, #1, #2…
      var found = detectSegments(wholeMono(buffer), buffer.sampleRate);
      segments = [{start:0, end:round2(Math.min(buffer.duration, MAX_LONG_S)), whole:true}].concat(found);
      status((found.length
        ? 'Found '+found.length+' sound'+(found.length>1 ? 's' : '')+' in '+time(buffer.duration)+' s.'
        : 'No separate sounds found in '+time(buffer.duration)+' s.')+
        ' Play them with ▶, trim with the times if needed, then pick "Use as…". ALL is the whole file (level up and main quest can use up to '+MAX_LONG_S+' s; other sounds keep their first '+MAX_CLIP_S+' s).');
      renderSegments();
    }, function(){ status('That file couldn’t be read.'); });
  }
  // The whole file as mono, for finding its sounds (cut() stops at MAX_CLIP_S).
  function wholeMono(buffer){
    var out = new Float32Array(buffer.length), channels = buffer.numberOfChannels;
    for (var c=0; c<channels; c++){
      var data = buffer.getChannelData(c);
      for (var i=0; i<buffer.length; i++) out[i] += data[i]/channels;
    }
    return out;
  }
  function segName(i){ return segments[i] && segments[i].whole ? 'the whole file' : 'sound #'+i; }
  function segmentBuffer(i, limit){
    var seg = segments[i];
    if (!source || !seg || !(seg.end > seg.start)) return null;
    var samples = cut(source, seg.start, seg.end, limit);
    return {samples:samples, rate:source.sampleRate};
  }
  function tryIt(i){
    var clip = segmentBuffer(i, MAX_LONG_S);
    if (!clip || !clip.samples.length) return;
    ST.sfx.decode(encodeWav(clip.samples, clip.rate)).then(function(buffer){ if (buffer) ST.sfx.preview(buffer); });
  }
  function useAs(i, name, select){
    var clip = segmentBuffer(i, maxFor(name));
    if (!clip || !clip.samples.length || !LABELS[name]) return;
    var wav = encodeWav(clip.samples, clip.rate);
    ST.sfx.setCustom(name, wav).then(function(ok){
      if (!ok) throw new Error('decode');
      return saveClip(name, wav, clip.samples.length/clip.rate);
    }).then(function(){
      status('Saved: '+segName(i)+' is now "'+LABELS[name]+'".');
      renderSlots();
      ST.sfx.preview(name);
    }, function(){
      status('Couldn’t save that clip on this device.');
      ST.sfx.setCustom(name, null);
      renderSlots();
    });
    if (select) select.value = '';
  }
  function reset(name){
    removeClip(name).catch(function(){}).then(function(){
      return ST.sfx.setCustom(name, null);
    }).then(function(){
      status('"'+LABELS[name]+'" is back to the built-in sound.');
      renderSlots();
    });
  }

  function build(){
    panel = document.createElement('div');
    panel.className = 'sound-lab';
    panel.id = 'sound-lab';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Custom sounds');
    panel.innerHTML =
      '<div class="sound-lab-box">'+
        '<div class="sl-head"><span class="sl-title">CUSTOM SOUNDS</span><button class="sl-btn" data-sl="close">Close</button></div>'+
        '<p class="sl-note">Replace any sound with a clip from a video or audio file on this device. Your clips stay on this device only.</p>'+
        '<div class="panel-title">Sounds</div>'+
        '<div id="sl-slots"></div>'+
        '<div class="sl-pack">'+
          '<button class="sl-btn" data-sl="export">Export sound pack</button>'+
          '<button class="sl-btn" data-sl="import">Import sound pack</button>'+
          '<input type="file" id="sl-pack-file" accept="application/json,.json" hidden>'+
        '</div>'+
        '<div class="panel-title">Cut from a file</div>'+
        '<button class="sl-pick" data-sl="pick">Choose a video or audio file</button>'+
        '<input type="file" id="sl-file" accept="audio/*,video/*,.mp4,.m4a,.mp3,.wav,.aac,.ogg,.mov" hidden>'+
        '<div class="sl-status" id="sl-status" role="status"></div>'+
        '<div id="sl-segments"></div>'+
      '</div>';
    panel.addEventListener('click', function(e){
      if (e.target===panel){ close(); return; }
      var btn = e.target.closest('[data-sl]');
      if (!btn) return;
      var what = btn.getAttribute('data-sl');
      if (what==='close') close();
      else if (what==='pick') el('sl-file').click();
      else if (what==='hear') ST.sfx.preview(btn.getAttribute('data-name'));
      else if (what==='reset') reset(btn.getAttribute('data-name'));
      else if (what==='try') tryIt(Number(btn.getAttribute('data-i')));
      else if (what==='export') exportPack();
      else if (what==='import') el('sl-pack-file').click();
    });
    panel.addEventListener('change', function(e){
      var t = e.target;
      if (t.id==='sl-file'){ var f = t.files && t.files[0]; t.value = ''; loadFile(f); }
      else if (t.id==='sl-pack-file'){ var p = t.files && t.files[0]; t.value = ''; importPack(p); }
      else if (t.classList.contains('sl-use') && t.value) useAs(Number(t.getAttribute('data-i')), t.value, t);
      else if (t.classList.contains('sl-time')){
        var seg = segments[Number(t.getAttribute('data-i'))];
        var v = Number(t.value);
        if (seg && isFinite(v) && v>=0) seg[t.getAttribute('data-edge')] = Math.min(v, source ? source.duration : v);
      }
    });
    panel.addEventListener('keydown', function(e){ if (e.key==='Escape') close(); });
    document.body.appendChild(panel);
  }

  function open(){
    opener = document.activeElement;
    if (!panel) build();
    panel.hidden = false;
    document.documentElement.classList.add('sl-open');
    renderSlots();
    if (!segments.length) status('');
    var closeBtn = panel.querySelector('[data-sl="close"]');
    if (closeBtn) closeBtn.focus();
  }
  function close(){
    if (!panel) return;
    panel.hidden = true;
    document.documentElement.classList.remove('sl-open');
    if (opener && opener.focus) opener.focus();
  }

  ST.sfxCustom = {
    open: open,
    close: close,
    readAll: readAll,
    loadFile: loadFile,
    importPack: importPack,
    makePack: makePack,
    readPack: readPack,
    detectSegments: detectSegments,
    encodeWav: encodeWav,
    wholeMono: wholeMono
  };
})(window.StatusTerminal);
