/**
 * "Add several places" (MAP tab): paste a list, one place per line
 * ("Montréal, Canada", "region: Casablanca-Settat, Morocco"), check what
 * each line matched on a review screen, then reveal them all at once.
 * Nothing is saved before "Reveal all".
 *
 * The review, per line: found (kept unless unticked), a choice when the
 * name is ambiguous or only close names were found, and "not found" lines
 * to fix (and check again), skip, or place by hand with a tap on the map
 * (they become a city circle with that name). Matching is js/places.js;
 * this file only draws the card, which js/map.js shows under the map.
 */
(function(ST){
  'use strict';

  var el = ST.el, escapeHtml = ST.escapeHtml, P = ST.places;

  var PLACED_RADIUS = 3000;           // a line placed by hand: a small town's circle
  var EXAMPLE = 'Montréal, Canada\nregion: Casablanca-Settat, Morocco';

  function panel(){
    var p = ST.map.currentPanel();
    return p && p.kind==='bulk' ? p : null;
  }
  function redraw(){ ST.map.renderPanel(); }

  // ---------- the card ----------
  function editHtml(p){
    return '<div class="place-card"><div class="place-card-title">Add several places</div>'+
      '<div class="place-meta">One place per line: a city, or <b>region:</b> then a region. Add the country after a comma.</div>'+
      '<textarea id="bulk-text" class="place-note bulk-text" rows="8" placeholder="'+escapeHtml(EXAMPLE)+'" aria-label="Places, one per line">'+escapeHtml(p.text||'')+'</textarea>'+
      (p.failed ? '<div class="place-meta reset-warning">The city list couldn’t load. Try again once online.</div>' : '')+
      '<div class="place-buttons">'+
        '<button class="place-go" data-map="bulk-check"'+(p.checking ? ' disabled' : '')+'>'+(p.checking ? 'Checking…' : 'Check the list')+'</button>'+
        '<button data-map="close">Cancel</button>'+
      '</div></div>';
  }
  // What a line will reveal, or null.
  function chosen(row){
    if (row.skip) return null;
    if (row.placed) return {kind:'city', city:row.placed};
    var m = row.match;
    if (m.status==='found') return row.keep ? m.options[0] : null;
    if (m.status==='choose' && m.pick>=0) return m.options[m.pick];
    return null;
  }
  function onMap(option){
    return option.kind==='city' ? !!(option.city.gid && P.revealedCity(option.city.gid)) : !!P.revealedRegion(option.region.code);
  }
  function optionText(option){
    return P.optionName(option)+' — '+P.optionWhere(option)+(onMap(option) ? ' (on the map)' : '');
  }
  function rowHtml(row, i){
    var m = row.match, line = escapeHtml(row.line.raw);
    var kind = function(o){ return '<span class="bulk-kind">'+(o.kind==='city' ? 'city' : 'region')+'</span>'; };
    if (row.skip){
      return '<div class="bulk-line skipped"><span class="bulk-raw">'+line+'</span> <span class="bulk-note">skipped</span>'+
        '<button class="bulk-link" data-map="bulk-unskip" data-i="'+i+'">Undo</button></div>';
    }
    if (row.placed){
      return '<div class="bulk-line found"><span class="bulk-mark">&#10003;</span><span class="bulk-name">'+escapeHtml(row.placed.name)+'</span>'+
        '<span class="bulk-where">placed by hand'+(row.placed.cc ? ', '+escapeHtml(P.countryName(row.placed.cc)) : '')+'</span>'+
        '<button class="bulk-link" data-map="bulk-skip" data-i="'+i+'">Skip</button></div>';
    }
    if (m.status==='found'){
      var o = m.options[0];
      return '<label class="bulk-line found"><input type="checkbox" class="bulk-keep" data-i="'+i+'"'+(row.keep ? ' checked' : '')+'>'+
        '<span class="bulk-name">'+escapeHtml(P.optionName(o))+'</span>'+
        '<span class="bulk-where">'+kind(o)+' '+escapeHtml(P.optionWhere(o))+(onMap(o) ? ' · on the map' : '')+'</span></label>';
    }
    if (m.status==='choose'){
      return '<div class="bulk-line choose"><span class="bulk-raw">'+line+'</span>'+
        '<span class="bulk-note">'+(m.fuzzy ? 'Not found as typed. Closest:' : 'Which one?')+'</span>'+
        '<select class="bulk-pick" data-i="'+i+'" aria-label="Which place: '+line+'">'+
          '<option value="-1">'+(m.fuzzy ? '— none of these (skip) —' : '— skip —')+'</option>'+
          m.options.map(function(o, k){
            return '<option value="'+k+'"'+(k===m.pick ? ' selected' : '')+'>'+escapeHtml(optionText(o))+'</option>';
          }).join('')+
        '</select></div>';
    }
    return '<div class="bulk-line missing"><span class="bulk-note reset-warning">Not found:</span> <span class="bulk-raw">'+line+'</span>'+
      '<input type="text" class="bulk-fix" data-i="'+i+'" value="'+escapeHtml(row.fix)+'" aria-label="Fix: '+line+'">'+
      '<div class="bulk-actions">'+
        '<button data-map="bulk-retry" data-i="'+i+'">Check again</button>'+
        '<button data-map="bulk-place" data-i="'+i+'">Place on map</button>'+
        '<button data-map="bulk-skip" data-i="'+i+'">Skip</button>'+
      '</div></div>';
  }
  function reviewHtml(p){
    var found = 0, choose = 0, missing = 0, count = 0;
    p.rows.forEach(function(row){
      if (row.skip) return;
      if (chosen(row)) count++;
      if (row.placed || row.match.status==='found') found++;
      else if (row.match.status==='choose') choose++;
      else missing++;
    });
    var summary = [found+' found', choose ? choose+' to choose' : '', missing ? missing+' not found' : ''].filter(Boolean).join(' · ');
    return '<div class="place-card bulk-card"><div class="place-card-title">Check your list</div>'+
      '<div class="place-meta">'+escapeHtml(summary)+'. Nothing is saved until Reveal all.</div>'+
      '<div class="bulk-lines">'+p.rows.map(rowHtml).join('')+'</div>'+
      '<div class="place-buttons">'+
        '<button class="place-go" data-map="bulk-reveal"'+(count ? '' : ' disabled')+'>Reveal all ('+count+')</button>'+
        '<button data-map="bulk-edit">Edit the list</button>'+
        '<button data-map="close">Cancel</button>'+
      '</div></div>';
  }
  function html(p){ return p.step==='review' ? reviewHtml(p) : editHtml(p); }

  // ---------- steps ----------
  function open(){
    ST.map.openPanel({kind:'bulk', step:'edit', text:''});
    var box = el('bulk-text');
    if (box) box.focus();
  }
  function row(entry){
    return {line:entry.line, match:entry.match, keep:true, skip:false, placed:null, fix:entry.line.raw};
  }
  function check(){
    var p = panel();
    if (!p || p.checking) return;
    if (!String(p.text||'').trim()){ var box = el('bulk-text'); if (box) box.focus(); return; }
    p.checking = true;
    p.failed = false;
    redraw();
    P.loadPlaces().then(function(){
      if (panel()!==p) return;
      p.checking = false;
      p.rows = P.matchList(p.text).map(row);
      p.step = 'review';
      redraw();
    }, function(){
      if (panel()!==p) return;
      p.checking = false;
      p.failed = true;
      redraw();
    });
  }
  function retry(i){
    var p = panel(), r = p && p.rows[i];
    if (!r) return;
    var line = P.parseLine(r.fix);
    if (!line) return;
    var fixed = row({line:line, match:P.matchLine(line)});
    fixed.fix = r.fix;
    p.rows[i] = fixed;
    redraw();
  }
  // A tap on the map places the line: a city circle with its name, and its
  // country when it can be found.
  function place(i){
    var p = panel(), r = p && p.rows[i];
    if (!r) return;
    ST.map.placeOnMap('Tap the map to place “'+r.line.name+'”', function(lat, lon){
      if (panel()!==p) return;
      var spot = {name:r.line.name, cc:r.line.country ? r.line.country.cc : '', lat:Math.round(lat*1e5)/1e5, lon:Math.round(lon*1e5)/1e5};
      r.placed = spot;
      r.skip = false;
      redraw();
      var card = document.querySelector('.bulk-card');
      if (card && card.scrollIntoView) card.scrollIntoView({block:'center'});
      if (!spot.cc){
        P.lookup(spot.lat, spot.lon).then(function(info){
          if (panel()===p && r.placed===spot && info.cc){ spot.cc = info.cc; redraw(); }
        });
      }
    });
  }
  function revealAll(){
    var p = panel();
    if (!p || !p.rows) return;
    var options = p.rows.map(chosen).filter(Boolean);
    if (!options.length) return;
    // One banner for all the new places, their XP counted once each.
    var results = options.map(function(o){
      return o.kind==='city' && !o.city.gid ? P.revealCity(o.city, PLACED_RADIUS) : P.revealAll([o])[0];
    });
    ST.map.closePanel();
    ST.map.changed();
    ST.map.celebrate(results);
    ST.map.fitAll();
  }

  // ---------- taps and typing (passed on by js/map.js) ----------
  function onAction(action, btn){
    var i = +btn.getAttribute('data-i'), p = panel();
    if (action==='bulk') open();
    else if (!p) return;
    else if (action==='bulk-check') check();
    else if (action==='bulk-edit'){ p.step = 'edit'; redraw(); }
    else if (action==='bulk-retry') retry(i);
    else if (action==='bulk-place') place(i);
    else if (action==='bulk-skip'){ p.rows[i].skip = true; redraw(); }
    else if (action==='bulk-unskip'){ p.rows[i].skip = false; redraw(); }
    else if (action==='bulk-reveal') revealAll();
  }
  function onInput(target){
    var p = panel();
    if (!p) return;
    if (target.id==='bulk-text') p.text = target.value;
    else if (target.classList.contains('bulk-fix')) p.rows[+target.getAttribute('data-i')].fix = target.value;
  }
  function onChange(target){
    var p = panel(), r = p && p.rows && p.rows[+target.getAttribute('data-i')];
    if (!r) return;
    if (target.classList.contains('bulk-keep')) r.keep = target.checked;
    else if (target.classList.contains('bulk-pick')) r.match.pick = +target.value;
    else return;
    redraw();
  }
  function onEnter(target){
    if (!target.classList.contains('bulk-fix')) return false;
    retry(+target.getAttribute('data-i'));
    return true;
  }

  ST.bulk = { html: html, onAction: onAction, onInput: onInput, onChange: onChange, onEnter: onEnter };
})(window.StatusTerminal);
