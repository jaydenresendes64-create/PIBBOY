/**
 * ITEMS: Fallout 4-style 3D models, drawn as amber wireframe lines, turning
 * slowly next to each inventory category's title. Drag one sideways to turn
 * it by hand; let go and it goes back to turning on its own.
 *
 *   THINGS TO SELL  a price tag on its string
 *   APPAREL         a vault jumpsuit, with its belt and zip
 *   AID             a first-aid kit, with a cross and a handle
 *   MISC            a wooden crate
 *   IMPORTANT       a key
 *
 * The models are built from simple shapes (no model files). Three.js
 * (vendor/three/three.pibboy.min.js, only the parts the app uses) is loaded
 * the first time the ITEMS tab shows. One hidden WebGL canvas draws every
 * model in turn, and each is copied into its own small canvas: one GPU
 * context for all of them.
 *
 * Only runs while the ITEMS tab is open, at least one model is on screen and
 * the app is in the foreground, at about 30 frames a second. With reduced
 * motion the models stay still. Without WebGL (or opened from disk, where
 * modules can't load) the little canvases are simply hidden.
 */
(function(ST){
  'use strict';

  var THREE_URL = 'vendor/three/three.pibboy.min.js';
  var AMBER = 0xe8a33d;
  var SPIN = 0.55;              // radians a second
  var TILT = 0.32;              // looking slightly down on the model
  var FRAME_MS = 33;            // about 30 frames a second
  var MAX_RATIO = 2;

  var T = null;                 // the Three.js module
  var loading = null;
  var broken = false;
  var renderer = null, scene = null, camera = null;
  var models = {};              // category → a Three.js Group
  var angle = {};               // category → {y, x}: kept across re-renders of the tab
  var canvases = [];            // the small canvases of the ITEMS tab
  var onScreen = new Set();
  var observer = null;
  var tabShown = false;
  var frame = null, lastTime = 0;
  var drag = null;              // {canvas, cat, x, y}
  var motion = ST.motion, stayStill = ST.stayStill;      // the phone's Reduce Motion setting

  // ---------- the models (tested in tests/items3d.test.js) ----------
  // Each returns a Group of amber line segments, centred and sized to fit a
  // sphere of radius 1.
  function lines(T, geometry, material){
    return new T.LineSegments(new T.EdgesGeometry(geometry, 25), material);
  }
  function extruded(T, shape, depth, material){
    var g = new T.ExtrudeGeometry(shape, {depth:depth, bevelEnabled:false, curveSegments:18});
    g.translate(0, 0, -depth/2);
    return lines(T, g, material);
  }
  function box(T, w, h, d, material){ return lines(T, new T.BoxGeometry(w, h, d), material); }
  function segments(T, points, material){
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(points, 3));
    return new T.LineSegments(g, material);
  }

  var BUILDERS = {
    SELL: function(T, m){                                     // a price tag on its string
      var tag = new T.Shape();
      tag.moveTo(-1.0, 0); tag.lineTo(-0.6, 0.45); tag.lineTo(0.95, 0.45);
      tag.lineTo(0.95, -0.45); tag.lineTo(-0.6, -0.45); tag.lineTo(-1.0, 0);
      var hole = new T.Path();
      hole.absarc(-0.58, 0, 0.12, 0, Math.PI*2, true);
      tag.holes.push(hole);
      var g = new T.Group();
      g.add(extruded(T, tag, 0.08, m));
      var string = lines(T, new T.TorusGeometry(0.34, 0.012, 3, 14, Math.PI*0.95), m);
      string.position.set(-0.92, 0.22, 0);
      string.rotation.z = Math.PI*0.45;
      g.add(string);
      g.add(segments(T, [0.05, 0.2, 0.05, 0.7, 0.2, 0.05,   0.05, -0.05, 0.05, 0.7, -0.05, 0.05], m));   // writing on it
      return g;
    },
    APPAREL: function(T, m){                                  // a vault jumpsuit
      var s = new T.Shape();
      var half = [[-0.14, 0.95], [-0.46, 0.84], [-0.98, 0.36], [-0.8, 0.2], [-0.46, 0.52],
                  [-0.44, -0.12], [-0.48, -1.0], [-0.1, -1.0], [0, -0.36]];
      s.moveTo(half[0][0], half[0][1]);
      half.slice(1).forEach(function(p){ s.lineTo(p[0], p[1]); });
      half.slice().reverse().slice(1).forEach(function(p){ s.lineTo(-p[0], p[1]); });   // the mirrored half
      s.lineTo(0, 0.82);
      s.lineTo(half[0][0], half[0][1]);
      var g = new T.Group();
      g.add(extruded(T, s, 0.24, m));
      var belt = box(T, 0.92, 0.1, 0.28, m);
      belt.position.y = -0.1;
      g.add(belt);
      g.add(segments(T, [0, 0.82, 0.13, 0, -0.05, 0.13], m));  // the zip
      return g;
    },
    AID: function(T, m){                                      // a first-aid kit
      var g = new T.Group();
      g.add(box(T, 1.5, 1.0, 0.55, m));
      var c = new T.Shape(), a = 0.1, b = 0.32;
      [[-a, b], [a, b], [a, a], [b, a], [b, -a], [a, -a], [a, -b], [-a, -b], [-a, -a], [-b, -a], [-b, a], [-a, a]]
        .forEach(function(p, i){ if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); });
      var cross = extruded(T, c, 0.05, m);
      cross.position.z = 0.3;
      g.add(cross);
      var handle = lines(T, new T.TorusGeometry(0.26, 0.05, 4, 12, Math.PI), m);
      handle.position.y = 0.5;
      g.add(handle);
      return g;
    },
    MISC: function(T, m){                                     // a wooden crate
      var g = new T.Group(), s = 0.6, i = 0.46, p = [];
      g.add(box(T, s*2, s*2, s*2, m));
      [s, -s].forEach(function(z){                            // front and back: inner frame and a brace
        p.push(-i, -i, z, i, -i, z,   i, -i, z, i, i, z,   i, i, z, -i, i, z,   -i, i, z, -i, -i, z,   -i, -i, z, i, i, z);
      });
      [s, -s].forEach(function(x){                            // the sides: planks
        p.push(x, -0.2, -s, x, -0.2, s,   x, 0.2, -s, x, 0.2, s);
      });
      g.add(segments(T, p, m));
      return g;
    },
    IMPORTANT: function(T, m){                                // a key
      var g = new T.Group();
      var bow = new T.Shape();
      bow.absarc(0, 0, 0.36, 0, Math.PI*2, false);
      var hole = new T.Path();
      hole.absarc(0, 0, 0.16, 0, Math.PI*2, true);
      bow.holes.push(hole);
      var ring = extruded(T, bow, 0.08, m);
      ring.position.x = -0.62;
      g.add(ring);
      var shaft = new T.Shape();
      shaft.moveTo(-0.27, 0.07); shaft.lineTo(0.95, 0.07); shaft.lineTo(0.95, -0.3);
      shaft.lineTo(0.82, -0.3); shaft.lineTo(0.82, -0.07); shaft.lineTo(0.7, -0.07);
      shaft.lineTo(0.7, -0.24); shaft.lineTo(0.57, -0.24); shaft.lineTo(0.57, -0.07);
      shaft.lineTo(-0.27, -0.07); shaft.lineTo(-0.27, 0.07);
      g.add(extruded(T, shaft, 0.08, m));
      return g;
    }
  };

  function buildModel(T, cat, material){
    var build = BUILDERS[cat];
    if (!build) return null;
    var group = build(T, material || new T.LineBasicMaterial({color:AMBER}));
    // Centred and scaled to fit a sphere of radius 1, so every model has the same size on screen.
    var sphere = new T.Box3().setFromObject(group).getBoundingSphere(new T.Sphere());
    var holder = new T.Group();
    group.position.sub(sphere.center);
    holder.add(group);
    holder.scale.setScalar(1/(sphere.radius || 1));
    return holder;
  }

  // ---------- loading and the shared renderer ----------
  function load(){
    if (!loading){
      loading = import(new URL(THREE_URL, document.baseURI).href).then(function(module){
        T = module;
        renderer = new T.WebGLRenderer({antialias:true, alpha:true});
        renderer.setClearColor(0x000000, 0);
        renderer.domElement.addEventListener('webglcontextlost', function(){ fail(); });
        scene = new T.Scene();
        camera = new T.PerspectiveCamera(32, 1.8, 0.1, 20);
        camera.position.set(0, 0, 4.1);
        var material = new T.LineBasicMaterial({color:AMBER, transparent:true, opacity:0.95});
        Object.keys(BUILDERS).forEach(function(cat){ models[cat] = buildModel(T, cat, material); });
      });
      loading.catch(fail);
    }
    return loading;
  }
  function fail(){
    broken = true;
    stop();
    canvases.forEach(function(c){ c.hidden = true; });
  }

  // ---------- drawing ----------
  function draw(canvas){
    var cat = canvas.getAttribute('data-model');
    var model = models[cat];
    if (!model) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    var ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
    var pw = Math.round(w*ratio), ph = Math.round(h*ratio);
    if (canvas.width!==pw || canvas.height!==ph){ canvas.width = pw; canvas.height = ph; }
    if (renderer.domElement.width!==pw || renderer.domElement.height!==ph) renderer.setSize(pw, ph, false);
    camera.aspect = w/h;
    camera.updateProjectionMatrix();
    var a = angle[cat] || (angle[cat] = {y:Math.random()*Math.PI*2, x:TILT});
    model.rotation.set(a.x, a.y, 0);
    scene.add(model);
    renderer.render(scene, camera);
    scene.remove(model);
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(renderer.domElement, 0, 0);
  }
  function drawAll(){
    canvases.forEach(function(c){ if (onScreen.has(c)) draw(c); });
  }
  function tick(time){
    frame = null;
    if (!running()) return;
    frame = requestAnimationFrame(tick);
    if (time - lastTime < FRAME_MS) return;
    var dt = lastTime ? Math.min(time - lastTime, 100)/1000 : 0;
    lastTime = time;
    Object.keys(angle).forEach(function(cat){
      if (!drag || drag.cat!==cat) angle[cat].y += SPIN*dt;
    });
    drawAll();
  }
  function running(){
    return !broken && T && tabShown && onScreen.size>0 && document.visibilityState!=='hidden';
  }
  function start(){
    if (!running()) return;
    if (stayStill()){ drawAll(); return; }     // one still picture
    if (frame===null){ lastTime = 0; frame = requestAnimationFrame(tick); }
  }
  function stop(){
    if (frame!==null) cancelAnimationFrame(frame);
    frame = null;
  }

  // ---------- turning a model by hand ----------
  function onPointerDown(e){
    var canvas = e.currentTarget;
    drag = {canvas:canvas, cat:canvas.getAttribute('data-model'), x:e.clientX, y:e.clientY};
    try{ canvas.setPointerCapture(e.pointerId); }catch(err){}
  }
  function onPointerMove(e){
    if (!drag || drag.canvas!==e.currentTarget) return;
    var a = angle[drag.cat];
    if (!a) return;
    a.y += (e.clientX - drag.x)*0.03;
    a.x = Math.max(-0.9, Math.min(0.9, a.x + (e.clientY - drag.y)*0.02));
    drag.x = e.clientX; drag.y = e.clientY;
    if (stayStill()) draw(drag.canvas);
  }
  function onPointerUp(){ drag = null; }

  // ---------- the ITEMS tab ----------
  // Called after each render of the ITEMS tab (js/render.js): picks up its
  // new canvases.
  function attach(tab){
    if (!observer && 'IntersectionObserver' in window){
      observer = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if (entry.isIntersecting) onScreen.add(entry.target); else onScreen.delete(entry.target);
        });
        if (onScreen.size) start(); else stop();
      });
    }
    canvases.forEach(function(c){ if (observer) observer.unobserve(c); });
    onScreen.clear();
    canvases = Array.prototype.slice.call(tab.querySelectorAll('canvas.item-model'));
    canvases.forEach(function(c){
      if (broken){ c.hidden = true; return; }
      c.addEventListener('pointerdown', onPointerDown);
      c.addEventListener('pointermove', onPointerMove);
      c.addEventListener('pointerup', onPointerUp);
      c.addEventListener('pointercancel', onPointerUp);
      if (observer) observer.observe(c); else onScreen.add(c);
    });
    if (tabShown) show(true);
  }
  // The ITEMS tab opened or closed (js/render.js switchTab).
  function show(value){
    tabShown = !!value;
    if (!tabShown){ stop(); return; }
    if (broken) return;
    load().then(function(){ start(); drawAll(); }, function(){});
  }

  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState==='hidden') stop(); else start();
  });

  ST.items3d = { attach: attach, show: show, buildModel: buildModel, CATEGORIES: Object.keys(BUILDERS) };
})(window.StatusTerminal);
