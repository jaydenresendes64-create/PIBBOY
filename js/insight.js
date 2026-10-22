/**
 * Insight: what VITALS has to say (2026-10-12, the owner asked for readings
 * that tell something and an urge decoder with more than one tip a need).
 * Only words: it reads the state through ST's helpers and changes nothing,
 * saves nothing. js/vitals.js draws what it returns.
 *
 * The check-in's readings (readings()), from the logged check-ins only (an
 * entry not logged yet holds the last check-in's levels, not today's). At
 * most a few short lines, each one there only when the data says
 * something:
 *   STATUS    what today's levels show: a level past its line (LINES), the
 *             lowest or highest in the recent check-ins, or nothing past
 *             its line;
 *   TREND     what moved, the strongest of: a level going one way three
 *             check-ins running, today against the average of the check-ins
 *             before, the change since the last one, how regularly the
 *             check-in was done, urges ridden out this week and last;
 *   PRIORITY  the one level that most deserves attention today (past its
 *             line, more so when it got worse), and
 *   ACTION    one practical step for it, optional (the NEXT step, a trial
 *             or a daily, stays under the report);
 *   PATTERN   a link in the history (craving higher on the days with low
 *             sleep, high tension...), only when today is one of those days
 *             and both sides have enough check-ins; said as a link to
 *             watch, never as a cause.
 * The same situation is worded differently from one day to the next (the
 * day picks the phrasing); the facts never change for it.
 *
 * The urge decoder (urgeContext(), urgeMessages()): around the owner's own
 * tip for the need named (vitals.js TIPS), messages in several styles:
 * DECODER (what might be behind it), REALITY CHECK, DIRECT, INNER DIALOGUE,
 * STRATEGY (space between the urge and a decision), WHY (the chem-free
 * run and the owner's own streaks: the goals they set), REFLECTION (at
 * zero) and RESET (after a lapse). What's known comes first, as questions, never as facts about the
 * owner: today's check-in (low sleep, high hunger or tension, asked about,
 * not assumed), the urges ridden out before (the same need: how many, the
 * last one's rounds), a second round, a late hour. Then the general ones,
 * styles taking turns in an order that suits the need, starting at a
 * different place each urge. "Another angle" walks down the list: no
 * message twice in a round until all have shown. No new data is kept.
 */
(function(ST){
  'use strict';

  var app = ST.app;
  var NIGHT_FROM = 22, NIGHT_TO = 4;  // late: from 22:00 to 4:00 (VITALS' day starts at 4:00)
  var LABEL = {energy:'Energy', mood:'Mood', hunger:'Hunger', tension:'Tension', sleep:'Sleep', craving:'Craving'};
  // Each level's line: past it, a level deserves a look (low or high).
  var LINES = {sleep:{low:3}, energy:{low:3}, mood:{low:3}, tension:{high:7}, hunger:{high:7}, craving:{high:6}};
  var RECENT = 13;                 // the check-ins before today a "lowest / highest" looks at
  var AVERAGE_OF = 7;              // ... and an average
  var DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

  function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
  // An earlier check-in's level, null when it isn't a number (a damaged
  // entry): an unknown level is left out, never read as 0.
  function level(e, k){
    var v = e ? e[k] : null;
    return typeof v==='number' && isFinite(v) ? v : null;
  }
  function known(list, k){ return list.filter(function(e){ return level(e, k)!==null; }); }
  function mean(list, k){ return list.reduce(function(s, e){ return s+level(e, k); }, 0)/list.length; }
  function dayNumber(date){
    var m = DATE.exec(date || '');
    return m ? Date.UTC(+m[1], +m[2]-1, +m[3])/864e5 : NaN;
  }
  function round1(v){ return (Math.round(v*10)/10).toFixed(1).replace(/\.0$/, ''); }
  function plural(n, word){ return n+' '+word+(n===1 ? '' : 's'); }
  // One of the phrasings, the same all day: `seed` is the day (and a salt).
  function pick(list, seed){ return list[((seed % list.length) + list.length) % list.length]; }
  function fill(text, vars){
    return text.replace(/\{(\w+)\}/g, function(all, k){ return vars[k]===undefined ? all : String(vars[k]); });
  }
  function shortDay(day){
    var m = DATE.exec(day || '');
    return m ? new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '';
  }
  function agoText(days, date){
    return days===1 ? 'yesterday' : days===0 ? 'earlier today' : days<7 ? days+' days ago' : 'on '+shortDay(date);
  }
  function past(key, v){ var l = LINES[key]; return !!l && (l.low!==undefined ? v<=l.low : v>=l.high); }
  // How far past its line (1 at the line), 0 when it isn't.
  function beyond(key, v){
    var l = LINES[key];
    if (!l || !past(key, v)) return 0;
    return 1 + (l.low!==undefined ? l.low-v : v-l.high);
  }

  // ---------- the check-in's readings ----------
  // The logged check-ins, newest first, and today's (the VITALS day) when
  // it's logged; the ones before it.
  function history(){
    var all = ST.lastVitals(400).filter(function(v){ return v && v.logged && isFinite(dayNumber(v.date)); });
    var e = ST.vitalsToday(false), today = e && e.logged ? e : null;
    var t = today ? dayNumber(today.date) : dayNumber(ST.vitalsDayStr());
    return {today:today, before:all.filter(function(v){ return dayNumber(v.date)<t; }), day:t};
  }

  // A level going the same way check-in after check-in, today last:
  // {key, dir (+1 up, -1 down), values (oldest first)} when it moved at
  // least twice in a row by 2 or more in all, within the last 10 days.
  function runOf(key, today, before){
    var seq = [num(today[key])], t = dayNumber(today.date);
    for (var i = 0; i<before.length && i<5; i++){
      if (t - dayNumber(before[i].date) > 10 || level(before[i], key)===null) break;
      seq.push(level(before[i], key));
    }
    var dir = Math.sign(seq[0]-(seq.length>1 ? seq[1] : seq[0])), n = 1;
    if (!dir) return null;
    while (n<seq.length && Math.sign(seq[n-1]-seq[n])===dir) n++;
    var values = seq.slice(0, n).reverse();
    if (n<3 || Math.abs(values[n-1]-values[0])<2) return null;
    return {key:key, dir:dir, values:values};
  }

  function statusLine(today, before, seed){
    var notes = [];
    ST.VITAL_KEYS.forEach(function(k){
      var v = num(today[k]), recent = known(before.slice(0, RECENT), k).map(function(x){ return level(x, k); });
      var weight = beyond(k, v), extreme = '';
      if (recent.length>=4){
        if (v<Math.min.apply(null, recent)){ extreme = 'the lowest in '+(recent.length+1)+' check-ins'; weight += LINES[k] && LINES[k].low!==undefined ? 1.5 : 0.8; }
        else if (v>Math.max.apply(null, recent)){ extreme = 'the highest in '+(recent.length+1)+' check-ins'; weight += LINES[k] && LINES[k].high!==undefined ? 1.5 : 0.8; }
      }
      if (!weight) return;
      var said = extreme || (LINES[k].low!==undefined ? pick(['low', 'on the low side', 'down at the bottom'], seed+k.length) :
        pick(['high', 'up high', 'on the high side'], seed+k.length));
      notes.push({key:k, w:weight, text:LABEL[k]+' '+v+', '+said+'.'});
    });
    notes.sort(function(a, b){ return b.w-a.w; });
    if (notes.length) return {id:'status-'+notes[0].key, keys:notes.slice(0, 2).map(function(n){ return n.key; }),
      text:notes.slice(0, 2).map(function(n){ return n.text; }).join(' ')};
    if (before.length>=3){
      var steady = ST.VITAL_KEYS.every(function(k){
        var avg = known(before.slice(0, AVERAGE_OF), k);
        return !avg.length || Math.abs(num(today[k])-mean(avg, k))<=1;
      });
      if (steady) return {id:'status-steady', keys:[], text:pick(['Every level within a point of your recent average.',
        'A steady day: each level close to its recent average.', 'Nothing far from your usual levels today.'], seed)};
    }
    return {id:'status-clear', keys:[], text:pick(['Nothing past its line today.', 'No level past its line today.'], seed)};
  }

  function trendCandidates(h, seed){
    var today = h.today, before = h.before, out = [];
    ST.VITAL_KEYS.forEach(function(k){
      var run = runOf(k, today, before);
      if (run){
        out.push({id:'trend-run-'+k, key:k, score:Math.abs(run.values[run.values.length-1]-run.values[0]) + run.values.length*0.5,
          text:fill(pick(['{L} {way} {n} check-ins running: {seq}.', '{L}: {seq}, {way} {n} check-ins in a row.'], seed),
            {L:LABEL[k], way:run.dir>0 ? 'up' : 'down', n:run.values.length, seq:run.values.join(' → ')})});
      }
      var prev = known(before.slice(0, AVERAGE_OF), k);
      if (prev.length>=4){
        var m = mean(prev, k), d = num(today[k])-m;
        if (Math.abs(d)>=2) out.push({id:'trend-avg-'+k, key:k, score:Math.abs(d),
          text:fill(pick(['{L} {v}, {side} your {n}-check-in average of {m}.', '{L} {v} today; the last {n} check-ins averaged {m}.'], seed+1),
            {L:LABEL[k], v:num(today[k]), side:d>0 ? 'above' : 'below', n:prev.length, m:round1(m)})});
      }
      var last = before[0];
      if (last && level(last, k)!==null){
        var gap = h.day - dayNumber(last.date), c = num(today[k])-level(last, k);
        if (gap<=3 && Math.abs(c)>=2) out.push({id:'trend-last-'+k, key:k, score:Math.abs(c)-0.5,
          text:fill(pick(['{L} {v}, {way} from {p} {when}.', '{L} {way} to {v}, from {p} {when}.'], seed+2),
            {L:LABEL[k], v:num(today[k]), way:c>0 ? 'up' : 'down', p:level(last, k), when:agoText(gap, last.date)})});
      }
    });
    // How regularly: the last 7 VITALS days, today included; or the first in a while.
    if (before.length){
      var gapLast = h.day - dayNumber(before[0].date);
      if (gapLast>=3) out.push({id:'trend-back', score:1.2, text:fill(pick(['First check-in in {n} days.', 'Back after {n} days without a check-in.'], seed), {n:gapLast})});
      else {
        var week = 1 + before.filter(function(v){ return h.day - dayNumber(v.date) < 7; }).length;
        if (week>=5) out.push({id:'trend-regular', score:0.6, text:fill(pick(['Checked in {n} of the last 7 days.', '{n} check-ins in the last 7 days.'], seed), {n:week})});
      }
    }
    // Urges ridden out, this week and the one before (the log's days are calendar days).
    var log = ((app.state.urges && app.state.urges.log) || []).filter(ridden), now = dayNumber(ST.todayStr());
    var thisWeek = 0, lastWeek = 0;
    log.forEach(function(u){
      var d = now - dayNumber(u.date);
      if (d>=0 && d<7) thisWeek++;
      else if (d>=7 && d<14) lastWeek++;
    });
    if (thisWeek || lastWeek){
      out.push({id:'trend-urges', score:Math.abs(thisWeek-lastWeek)>=2 ? 1 : 0.4,
        text:fill(pick(['{a} ridden out in the last 7 days, {b} the week before.', 'Urges ridden out: {n} this week, {b} last week.'], seed),
          {a:plural(thisWeek, 'urge'), n:thisWeek, b:lastWeek})});
    }
    return out.sort(function(a, b){ return b.score-a.score; });
  }

  // The level that most deserves attention: past its line, more so the
  // further and when it got worse (a run the wrong way); craving first
  // among equals. Null when none is past its line.
  function priority(h){
    var best = null;
    ST.VITAL_KEYS.forEach(function(k){
      var v = num(h.today[k]), w = beyond(k, v);
      if (!w) return;
      var run = runOf(k, h.today, h.before), bad = LINES[k].low!==undefined ? -1 : 1;
      if (run && run.dir===bad) w += 1;
      if (k==='craving') w += 0.5;
      if (!best || w>best.w) best = {key:k, v:v, w:w};
    });
    return best;
  }
  var PRIORITY = {
    sleep: ['Sleep, at {v}. The rest of the day runs on it.', 'Sleep, at {v}: tonight is the one to protect.'],
    craving: ['Craving, at {v}. Keep the urge decoder close today.', 'Craving, at {v}: worth keeping an eye on through the day.'],
    tension: ['Tension, at {v}. It tends to look for a way out.', 'Tension, at {v}: let some of it off before it builds.'],
    hunger: ['Hunger, at {v}. Eat before deciding anything else.', 'Hunger, at {v}: a real meal comes first.'],
    energy: ['Energy, at {v}. Keep today’s list short.', 'Energy, at {v}: spend it on one thing that matters.'],
    mood: ['Mood, at {v}. Go easy on the day.', 'Mood, at {v}: some company or daylight may help.']
  };
  var ACTION = {
    sleep: ['An earlier night tonight, screens away half an hour before.', 'A 20-minute lie-down this afternoon, if the day allows.', 'Caffeine before noon only, today.'],
    craving: ['If it climbs, open the urge decoder and name the need first.', 'Plan the next few hours: somewhere else, with someone, or busy with your hands.'],
    tension: ['Ten minutes of walking before the next task.', 'A shower or cold water on your face, then one thing at a time.'],
    hunger: ['A real meal now, then a glass of water.', 'Eat something filling before the next decision.'],
    energy: ['Daylight and water first, then the smallest task on the list.', 'Pick the one task that matters and stop there.'],
    mood: ['Message one person today. A short one counts.', 'Ten minutes outside, even just around the block.']
  };

  // A link in the history between a level and craving, said only when today
  // is one of those days: [condition, its words].
  var LINKS = [
    {key:'sleep', test:function(v){ return v<=4; }, words:'sleep at 4 or less'},
    {key:'tension', test:function(v){ return v>=7; }, words:'tension at 7 or more'},
    {key:'hunger', test:function(v){ return v>=7; }, words:'hunger at 7 or more'},
    {key:'energy', test:function(v){ return v<=3; }, words:'energy at 3 or less'},
    {key:'mood', test:function(v){ return v<=3; }, words:'mood at 3 or less'}
  ];
  function pattern(h, seed){
    var all = known([h.today].concat(h.before).slice(0, 60), 'craving'), best = null;
    LINKS.forEach(function(l){
      if (!l.test(num(h.today[l.key]))) return;
      var both = known(all, l.key);
      var yes = both.filter(function(v){ return l.test(level(v, l.key)); }), no = both.filter(function(v){ return !l.test(level(v, l.key)); });
      if (yes.length<3 || no.length<3) return;
      var a = mean(yes, 'craving'), b = mean(no, 'craving');
      if (a-b>=1.5 && (!best || a-b>best.d)) best = {l:l, d:a-b, a:a, b:b, ny:yes.length, nn:no.length};
    });
    if (!best) return null;
    return {id:'pattern-'+best.l.key, key:best.l.key, text:fill(pick([
      'On the {ny} days with {w}, craving averaged {a}; on the other {nn}, {b}. A link worth watching, not a proof.',
      'Craving ran higher on days with {w}: {a} on average over {ny} days, against {b} over {nn}. A link, not a cause.'], seed),
      {ny:best.ny, nn:best.nn, w:best.l.words, a:round1(best.a), b:round1(best.b)})};
  }

  // [{tag, id, text}] for today's logged check-in, [] before it's logged.
  function readings(){
    var h = history();
    if (!h.today) return [];
    var seed = h.day, out = [];
    var status = statusLine(h.today, h.before, seed);
    out.push({tag:'STATUS', id:status.id, text:status.text});
    // Today against the average, for a level STATUS already flagged, says it twice: the next one.
    var trends = trendCandidates(h, seed).filter(function(t){ return !(t.id==='trend-avg-'+t.key && status.keys.indexOf(t.key)!==-1); });
    if (trends.length) out.push({tag:'TREND', id:trends[0].id, text:trends[0].text});
    var p = priority(h);
    if (p){
      out.push({tag:'PRIORITY', id:'priority-'+p.key, key:p.key, text:fill(pick(PRIORITY[p.key], seed), {v:p.v})});
      out.push({tag:'ACTION', id:'action-'+p.key, key:p.key, text:pick(ACTION[p.key], seed+3)});
    }
    var link = pattern(h, seed);
    if (link) out.push({tag:'PATTERN', id:link.id, text:link.text});
    return out;
  }

  // ---------- the urge decoder ----------
  var NEED_WORDS = {HUNGRY:'hungry', ANGRY:'angry', LONELY:'lonely', TIRED:'tired', NONE:'none of these'};
  var PATTERN_MIN = 3;                // urges logged (or noted the same way) before a pattern is told
  function ridden(u){ return u.outcome!=='lapsed'; }
  // Each of the player's ways, from the log: how often it was used (on this
  // need, when given) and how many of those urges were ridden out.
  function copeStats(log, copes, need){
    return copes.map(function(c){
      var used = log.filter(function(u){ return (!need || u.need===need) && (u.copes || []).indexOf(c.id)!==-1; });
      return {id:c.id, name:c.name, uses:used.length, won:used.filter(ridden).length};
    });
  }
  // The way most often ridden out with, used at least `least` times and
  // more often won than not; null when none.
  function bestCope(log, copes, need, least){
    var best = null;
    copeStats(log, copes, need).forEach(function(c){
      if (c.uses<least || c.won*2<=c.uses) return;
      if (!best || c.won/c.uses>best.won/best.uses || (c.won/c.uses===best.won/best.uses && c.uses>best.uses)) best = c;
    });
    return best;
  }
  // What's known about this urge, from the state: never more.
  function urgeContext(){
    var s = app.state, u = s.urges || {}, a = u.active || null, all = u.log || [], log = all.filter(ridden), copes = u.copes || [];
    var e = ST.vitalsToday(false), checkin = e && e.logged ? e : null;
    var need = a ? a.need : null;
    var same = need ? log.filter(function(x){ return x.need===need; }) : [];
    var lastSame = same.length ? same[same.length-1] : null;
    var chems = s.chems || {}, lapses = chems.lapses || [];
    var day = ST.cleanDay(), next = ST.nextCleanMilestone();
    return {
      phase: !a ? 'start' : ST.urgeLeft()>0 ? 'running' : 'over',
      need: need, rounds: a ? Math.max(1, num(a.rounds)) : 0,
      hour: new Date().getHours(),
      checkin: checkin ? {sleep:num(checkin.sleep), hunger:num(checkin.hunger), tension:num(checkin.tension), craving:num(checkin.craving), energy:num(checkin.energy)} : null,
      total: log.length, sameCount: same.length,
      lastSame: lastSame ? {ago:ST.daysSince(lastSame.date), date:lastSame.date, rounds:Math.max(1, num(lastSame.rounds))} : null,
      streak: day!==null && day>0 ? {day:day, done:ST.cleanFullDays(), next:next} : null,
      best: ST.cleanBest(), totalClean: ST.cleanTotal(),
      // The player's own streaks under way: the same, with the name they gave it.
      own: (s.streaks || []).map(function(x){
        var d = ST.cleanDay(x.id);
        return d!==null && d>0 ? {id:x.id, name:x.name, day:d, done:ST.cleanFullDays(x.id), next:ST.nextCleanMilestone(x.id), best:ST.cleanBest(x.id)} : null;
      }).filter(Boolean),
      lapseToday: ST.lapsedToday ? ST.lapsedToday() : lapses.length>0 && lapses[lapses.length-1]===ST.todayStr(),
      // The player's way most often ridden out with: on this need (2 tries), else on any (3).
      cope: need ? (bestCope(all, copes, need, 2) || bestCope(all, copes, null, PATTERN_MIN)) : null,
      trigger: a && a.trigger ? a.trigger : '',
      seed: all.length + (a ? Math.floor(num(a.start)/60000) : dayNumber(ST.todayStr()))
    };
  }

  // The general messages, by style; {need-specific} ones are kept when the
  // need matches. Short ones (DIRECT) and longer ones side by side.
  var POOL = {
    DECODER: [
      'What happened in the hour before this started? A place, a person, a time of day?',
      'Is it the thing itself you want, or a break from something else?',
      'What were you doing right before it hit? Sometimes that is the trigger, not the urge.',
      {HUNGRY:'When did you last eat a full meal? Hunger and craving use the same alarm.'},
      {ANGRY:'Who or what is the anger about? Naming it takes some of the push out of it.'},
      {LONELY:'Who was the last person you actually talked to today?'},
      {TIRED:'How long have you been awake? Past a point, the brain asks for anything that feels like rest.'},
      {NONE:'No hunger, anger, loneliness or tiredness: look at the setting. Same room, same hour as usual?'}
    ],
    'REALITY CHECK': [
      'An urge is a signal, not an order.',
      'You don’t have to decide anything now. Look again when the clock reaches zero.',
      'Picture the next hour both ways: acting on it, and not. Which one do you want to be in?',
      'Urges rise, peak and fall, usually within the half hour. You’re timing this one.'
    ],
    DIRECT: [
      'Leave the room. Now.',
      'Glass of water. Then sit somewhere else.',
      'Phone down, stand up, walk.',
      {HUNGRY:'Eat first. Decide later.'},
      {TIRED:'Lie down. Phone across the room.'},
      {LONELY:'Text someone. “Hey” is enough.'},
      {ANGRY:'Move: fast walk, stairs, cold water on your face.'}
    ],
    'INNER DIALOGUE': [
      'Part of you wants relief right now. Another part wants to be glad about today tomorrow. Let that one hold the clock.',
      'The urge speaks in “just this once”. What does the rest of you want from today?',
      'Two things are true at once: you want it, and you want what you’re building. Wanting it doesn’t decide anything.'
    ],
    STRATEGY: [
      'Put distance between you and it: another room, outside, or someone else’s company.',
      'Change one thing about where you are: the room, the light, the sound.',
      'Ten minutes of something with your hands: dishes, a shower, a walk around the block.',
      'Delay, don’t decide: at zero you can choose again, with a clearer head.',
      {LONELY:'Go where people are: a café, a shop, a park. Being near people counts.'},
      {ANGRY:'Write down what set it off, in one line. Don’t send it.'},
      {HUNGRY:'Make something simple, toast, eggs, fruit, and eat it sitting down.'},
      {TIRED:'Can’t sleep? Lie down anyway for the twenty minutes.'}
    ]
  };
  // The order the styles take turns in, for each need.
  var ORDER = {
    HUNGRY: ['STRATEGY', 'DECODER', 'DIRECT', 'REALITY CHECK', 'INNER DIALOGUE'],
    ANGRY: ['DIRECT', 'DECODER', 'STRATEGY', 'INNER DIALOGUE', 'REALITY CHECK'],
    LONELY: ['STRATEGY', 'DECODER', 'INNER DIALOGUE', 'DIRECT', 'REALITY CHECK'],
    TIRED: ['DECODER', 'DIRECT', 'STRATEGY', 'REALITY CHECK', 'INNER DIALOGUE'],
    NONE: ['DECODER', 'REALITY CHECK', 'STRATEGY', 'INNER DIALOGUE', 'DIRECT']
  };
  // A style's messages for this need: [{text, id}].
  function forNeed(style, need){
    return POOL[style].map(function(m, i){
      var text = typeof m==='string' ? m : m[need];
      return text ? {text:text, id:'pool-'+style.toLowerCase().replace(/ /g, '-')+'-'+i} : null;
    }).filter(Boolean);
  }

  // [{style, id, text}] for the running timer: what's known first, then the
  // general ones, styles in turn, starting at a place that changes each urge.
  function urgeMessages(ctx){
    ctx = ctx || urgeContext();
    var need = ctx.need && ORDER[ctx.need] ? ctx.need : 'NONE', out = [], c = ctx.checkin;
    // What's known: today's check-in (asked, not assumed), the urges before, a second round, the hour.
    if (c){
      if (c.sleep<=3 && need!=='TIRED') out.push({style:'DECODER', id:'ctx-sleep', text:'You logged sleep '+c.sleep+' this morning. Could tiredness be part of this, even if it doesn’t feel like it?'});
      if (c.hunger>=7 && need!=='HUNGRY') out.push({style:'DECODER', id:'ctx-hunger', text:'Hunger was '+c.hunger+' at check-in. Have you eaten since?'});
      if (c.tension>=7 && need!=='ANGRY') out.push({style:'DECODER', id:'ctx-tension', text:'Tension was '+c.tension+' at check-in. Is this urge some of that tension looking for a way out?'});
    }
    if (ctx.cope) out.push({style:'STRATEGY', id:'ctx-cope', text:'“'+ctx.cope.name+'”: you rode it out '+ctx.cope.won+' of the '+
      plural(ctx.cope.uses, 'time')+' you used it. Worth a go now?'});
    if (ctx.rounds>=2) out.push({style:'DIRECT', id:'ctx-round', text:pick([
      'Round '+ctx.rounds+'. Still here after twenty minutes is information, not failure. Change something this time: room, task, company.',
      'Round '+ctx.rounds+'. A longer urge still passes. Do the next twenty somewhere different.'], ctx.seed)});
    if (ctx.lastSame) out.push({style:'DECODER', id:'ctx-same', text:'You’ve ridden out “'+NEED_WORDS[need]+'” '+(ctx.sameCount===1 ? 'once' : ctx.sameCount+' times')+
      ' here. The last one passed in '+plural(ctx.lastSame.rounds, 'round')+', '+agoText(ctx.lastSame.ago, ctx.lastSame.date)+'.'});
    else if (ctx.total>0) out.push({style:'REALITY CHECK', id:'ctx-total', text:plural(ctx.total, 'urge')+' ridden out here so far. Each one passed.'});
    if (ctx.hour>=NIGHT_FROM || ctx.hour<NIGHT_TO) out.push({style:'REALITY CHECK', id:'ctx-late', text:'It’s late. Everything is louder at this hour; part of this may just be the time.'});
    // The streaks under way: the goals the owner set (each own streak by the name they gave it).
    function why(label, s, best){
      var text = label+' day '+s.day+'.';
      if (s.next) text += ' '+(s.next.days-s.done)+' to the '+s.next.days+'-day milestone (+'+s.next.xp+' XP).';
      if (best>s.done) text += ' Best run so far: '+best+' days.';
      return text;
    }
    if (ctx.streak) out.push({style:'WHY', id:'ctx-streak', text:why('Chem-free', ctx.streak, ctx.best)});
    (ctx.own || []).forEach(function(o){ out.push({style:'WHY', id:'ctx-streak-'+o.id, text:why(String(o.name), o, o.best)}); });
    // The general ones, the styles taking turns.
    var styles = ORDER[need], lists = styles.map(function(st){ return forNeed(st, need); });
    var start = ctx.seed % styles.length, longest = Math.max.apply(null, lists.map(function(l){ return l.length; }));
    for (var i = 0; i<longest; i++){
      for (var j = 0; j<styles.length; j++){
        var k = (start+j) % styles.length, list = lists[k];
        if (i>=list.length) continue;
        var m = list[(i + ctx.seed) % list.length];
        out.push({style:styles[k], id:m.id, text:m.text});
      }
    }
    // Once each.
    var seen = {};
    return out.filter(function(m){ if (seen[m.text]) return false; seen[m.text] = true; return true; });
  }

  // What the decoder's own log shows, once there's enough of it: counted,
  // never a cause. [{style:'PATTERN', id, text}], the most useful first, at
  // most 4: the way most often ridden out with, what most often set urges
  // off, the time of day most come at, the intensity lately, how they ended.
  var DAY_PARTS = [{name:'morning', from:4, to:12}, {name:'afternoon', from:12, to:17}, {name:'evening', from:17, to:22}, {name:'night', from:22, to:28}];
  function urgePatterns(){
    var u = app.state.urges || {}, log = u.log || [], out = [];
    if (log.length<PATTERN_MIN) return out;
    var cope = bestCope(log, u.copes || [], null, PATTERN_MIN);
    if (cope) out.push({id:'pat-cope', text:'“'+cope.name+'”: ridden out '+cope.won+' of the '+plural(cope.uses, 'time')+' you used it.'});
    var counts = {}, noted = 0, top = null;
    log.forEach(function(x){ if (x.trigger){ counts[x.trigger] = (counts[x.trigger] || 0) + 1; noted++; } });
    Object.keys(counts).forEach(function(k){ if (!top || counts[k]>counts[top]) top = k; });
    if (top && counts[top]>=PATTERN_MIN) out.push({id:'pat-trigger', text:'Most often set off by: '+String(ST.URGE_TRIGGER_LABELS[top] || top).toLowerCase()+
      ' ('+counts[top]+' of '+noted+' noted).'});
    var timed = log.filter(function(x){ return x.hour>=0; });
    if (timed.length>=5){
      var parts = DAY_PARTS.map(function(p){
        return {name:p.name, n:timed.filter(function(x){ var h = x.hour<4 ? x.hour+24 : x.hour; return h>=p.from && h<p.to; }).length};
      }).sort(function(a, b){ return b.n-a.n; });
      if (parts[0].n*10>=timed.length*4) out.push({id:'pat-time', text:'Most come in the '+parts[0].name+' ('+parts[0].n+' of '+timed.length+').'});
    }
    var rated = log.filter(function(x){ return x.intensity>0; }).slice(-10);
    if (rated.length>=6){
      var half = Math.floor(rated.length/2), avg = function(l){ return l.reduce(function(t, x){ return t+x.intensity; }, 0)/l.length; };
      var before = avg(rated.slice(0, half)), lately = avg(rated.slice(half));
      if (Math.abs(lately-before)>=1) out.push({id:'pat-intensity', text:'Intensity lately: '+lately.toFixed(1)+' on average, '+
        (lately<before ? 'down' : 'up')+' from '+before.toFixed(1)+'.'});
    }
    var won = log.filter(ridden).length;
    out.push({id:'pat-outcome', text:won===log.length ? 'All '+log.length+' urges decoded here were ridden out.' :
      won+' of the '+log.length+' urges decoded here were ridden out.'});
    return out.slice(0, 4).map(function(p){ return {style:'PATTERN', id:p.id, text:p.text}; });
  }

  // At zero, before "Rode it out / Still strong": one question to look back with.
  function urgeReflection(ctx){
    ctx = ctx || urgeContext();
    var need = ctx.need && NEED_WORDS[ctx.need] ? ctx.need : 'NONE';
    var list = [
      'What helped most this time: leaving the room, the clock, or naming the need?',
      'Did it peak and fade, or stay flat? Either is worth knowing for next time.',
      'What would make the next one easier, before it even starts?'
    ];
    if (need!=='NONE') list.push('Was “'+NEED_WORDS[need]+'” the right name for it? Good to know for next time.');
    if (ctx.rounds>=2) list = ['It took '+plural(ctx.rounds, 'round')+'. What changed between the first and this one?'].concat(list);
    return {style:'REFLECTION', id:'reflect', text:ctx.rounds>=2 ? list[0] : pick(list, ctx.seed)};
  }

  // After a lapse logged today, and on the decoder that day: a way back, no
  // blame. `shift` picks another of the lines, always as many (the
  // decoder's, the chem-free card's and an own streak's card differ).
  function resetLine(ctx, shift){
    ctx = ctx || urgeContext();
    var list = ['A lapse is a day, not a direction. Tomorrow is day 1.', 'What was different today? Name it once, then let it go.',
      'One day doesn’t undo the days behind it.',
      ctx.best>0 ? 'Best run: '+plural(ctx.best, 'day')+'. You’ve done it before.' : 'Rest, eat, sleep. Tomorrow starts fresh.'];
    return {style:'RESET', id:'reset', text:pick(list, dayNumber(ST.todayStr()) + (shift || 0))};
  }

  // Before an urge is named: one line when something is known that matters
  // (a lapse today, a short night or a high craving at check-in), else null.
  function urgeHint(ctx){
    ctx = ctx || urgeContext();
    if (ctx.lapseToday) return resetLine(ctx, 1);
    var c = ctx.checkin;
    if (c && c.sleep<=3) return {style:'DECODER', id:'hint-sleep', text:'Sleep '+c.sleep+' today: tired can read as craving.'};
    if (c && c.hunger>=7) return {style:'DECODER', id:'hint-hunger', text:'Hunger '+c.hunger+' at check-in: eaten since?'};
    return null;
  }

  ST.insight = {
    readings: readings, urgeContext: urgeContext, urgeMessages: urgeMessages,
    urgeReflection: urgeReflection, resetLine: resetLine, urgeHint: urgeHint, urgePatterns: urgePatterns,
    LINES: LINES
  };
})(window.StatusTerminal);
