/**
 * Fog of war (MAP tab) — a MapLibre custom WebGL layer that js/map.js puts
 * on top of the map's own layers. It's drawn in the same frame as the map,
 * with the map's own camera, so it can't lag or slide during a drag or a
 * pinch.
 *
 * Each frame, first (prerender, into textures of its own, at the fog's
 * resolution, which drops by itself if frames come too slowly):
 *  - the reveal mask: every revealed region filled in its exact shape (the
 *    stencil buffer fills each ring, holes and islands included), softened
 *    by a blur sized in real metres; every city and pin as a circle of its
 *    radius in real metres, soft across its edge. A new place clears in, a
 *    removed one fogs over (makeReveals).
 *  - the clouds: three layers of fractal noise at different sizes, each
 *    drifting its own way, gently warped into smoke, lit a little on their
 *    edges, and stuck to the world (cloudFrame). Where they meet the mask,
 *    their edges billow as the noise drifts.
 * then (render, onto the map): the clouds, with a fine still grain.
 *
 * It only moves while the map is on the screen and the app in front, at
 * 30 frames a second while the map is still (full speed while it moves);
 * with reduced motion the fog stays still and changes at once.
 *
 * Positions are worked out here in double precision, relative to the
 * screen (the map is always north up and flat), so nothing shakes at
 * street level, where the world is 268 million pixels wide.
 *
 * The helpers at the top don't touch WebGL or the page, so the tests run
 * them in Node.
 */
(function(ST){
  'use strict';

  var P = ST.places, clamp = ST.clamp;

  var TILE_PX = 512;                  // MapLibre's whole world, in pixels, at zoom 0
  var MIN_HOLE_PX = 3;                // a place still shows as a spark when zoomed far out
  var CIRCLE_SOFT = 0.25;             // a circle's soft edge: this share of its radius, each side of it
  var REGION_EDGE_M = 2500;           // how far a region's soft edge reaches, each side of its border
  var REGION_EDGE_MIN_PX = 2, REGION_EDGE_MAX_PX = 28;

  // ---------- where things are on the screen ----------
  // The view: the map's centre on the 0-1 world (P.mercX/mercY), the
  // world's width in CSS pixels at this zoom, and the screen's size.
  function viewOf(lng, lat, zoom, width, height){
    return {x:P.mercX(lng), y:P.mercY(lat), world:TILE_PX*Math.pow(2, zoom), width:width, height:height};
  }
  // A point of the 0-1 world, in CSS pixels from the screen's top-left corner.
  function toScreen(view, mx, my){
    return [(mx-view.x)*view.world + view.width/2, (my-view.y)*view.world + view.height/2];
  }
  // A city or pin: its centre and radius in CSS pixels, or null when it's
  // off the screen.
  function circleOnScreen(view, c){
    var at = toScreen(view, P.mercX(c.lon), P.mercY(c.lat));
    var r = Math.max(MIN_HOLE_PX, c.radius*P.pixelsPerMetre(c.lat, view.world));
    var reach = r*(1+CIRCLE_SOFT);
    if (at[0] < -reach || at[1] < -reach || at[0] > view.width+reach || at[1] > view.height+reach) return null;
    return {x:at[0], y:at[1], r:r};
  }
  // How far a region's soft edge reaches, in CSS pixels: real metres, but
  // never too thin to see nor wider than a thumb.
  function regionEdgePx(view, lat){
    return clamp(REGION_EDGE_M*P.pixelsPerMetre(lat, view.world), REGION_EDGE_MIN_PX, REGION_EDGE_MAX_PX);
  }
  // A region's shape (js/places.js), ready to draw: each ring as a fan of
  // triangles from its first point, relative to the middle of the region
  // (small numbers stay exact in 32 bits). Filled with the stencil buffer's
  // invert, a fan counts every pixel once per ring around it: odd is inside.
  function regionMesh(shape){
    var b = shape.box, ax = (b[0]+b[2])/2, ay = (b[1]+b[3])/2;
    var count = 0;
    shape.polygons.forEach(function(rings){
      rings.forEach(function(ring){ count += Math.max(0, ring.length/2-2)*3; });
    });
    var v = new Float32Array(count*2), k = 0;
    shape.polygons.forEach(function(rings){
      rings.forEach(function(ring){
        for (var i=2;i+3<ring.length;i+=2){
          v[k++] = ring[0]-ax; v[k++] = ring[1]-ay;
          v[k++] = ring[i]-ax; v[k++] = ring[i+1]-ay;
          v[k++] = ring[i+2]-ax; v[k++] = ring[i+3]-ay;
        }
      });
    });
    // The box, as two triangles: what the fill is painted through.
    var box = new Float32Array([b[0]-ax, b[1]-ay, b[2]-ax, b[1]-ay, b[2]-ax, b[3]-ay,
      b[0]-ax, b[1]-ay, b[2]-ax, b[3]-ay, b[0]-ax, b[3]-ay]);
    return {anchor:[ax, ay], vertices:v, count:count, box:box, lat:shape.lat};
  }
  // A region's box is on the screen (with its soft edge).
  function boxOnScreen(view, box, pad){
    var a = toScreen(view, box[0], box[1]), b = toScreen(view, box[2], box[3]);
    return !(b[0] < -pad || b[1] < -pad || a[0] > view.width+pad || a[1] > view.height+pad);
  }

  // ---------- the clouds, stuck to the world ----------
  // The clouds are a repeating noise picture, laid on the world at two
  // neighbouring whole zooms: the one below the map's zoom and the one
  // above, faded from one to the other as the zoom goes between them. So
  // the clouds keep about the same size on the screen at every zoom, grow
  // with the map while pinching, and never jump. For a layer whose picture
  // repeats every `tilePx` CSS pixels at a whole zoom: where the screen's
  // top-left corner falls in the picture at the whole zoom `level` (0 to 1,
  // worked out in double precision) and how far one CSS pixel moves in it.
  function cloudFrame(view, zoom, level, tilePx){
    var magnify = Math.pow(2, zoom-level);        // the map, larger than at `level`
    var world = TILE_PX*Math.pow(2, level);
    function start(v, half){ var t = (v*world - half/magnify)/tilePx; return t - Math.floor(t); }
    return {x:start(view.x, view.width/2), y:start(view.y, view.height/2), step:1/(magnify*tilePx)};
  }
  // How much of the upper zoom's clouds to show: 0 at a whole zoom, 1 at the next.
  function cloudFade(zoom){
    var f = zoom - Math.floor(zoom);
    return f*f*(3-2*f);
  }

  // ---------- revealing and removing, smoothly ----------
  // Tracks the revealed places across frames. Each is {key, item}: the
  // item is what's drawn (a circle, a region's shape, or null while that
  // shape loads). A place that appears clears in over REVEAL_MS; one that's
  // removed fogs over in REMOVE_MS (its last item is kept for that). What's
  // there the first time is simply there.
  var REVEAL_MS = 1400, REMOVE_MS = 900;
  function makeReveals(){
    var known = null;           // key -> {item, from, to, start, ms}
    function value(k, now){
      var t = k.ms>0 ? clamp((now-k.start)/k.ms, 0, 1) : 1;
      var e = 1-Math.pow(1-t, 3);                   // eases out, like smoke settling
      return k.from + (k.to-k.from)*e;
    }
    // Returns {list: [{item, value}] to draw, moving: an animation is under
    // way}. `instant`: no animation (reduced motion).
    function update(entries, now, instant){
      var first = known===null, seen = {};
      if (first) known = {};
      entries.forEach(function(e){
        seen[e.key] = true;
        var k = known[e.key];
        if (!k){
          known[e.key] = {item:e.item, from:first || instant ? 1 : 0, to:1, start:now, ms:first || instant ? 0 : REVEAL_MS};
        } else {
          if (e.item) k.item = e.item;
          if (k.to!==1){ k.from = value(k, now); k.to = 1; k.start = now; k.ms = instant ? 0 : REVEAL_MS; }
        }
      });
      var list = [], moving = false;
      Object.keys(known).forEach(function(key){
        var k = known[key];
        if (!seen[key] && k.to!==0){ k.from = value(k, now); k.to = 0; k.start = now; k.ms = instant ? 0 : REMOVE_MS; }
        var v = value(k, now);
        if (k.to===0 && v<=0){ delete known[key]; return; }
        if (v!==k.to) moving = true;
        if (k.item) list.push({item:k.item, value:v});
      });
      return {list:list, moving:moving};
    }
    return {update:update};
  }

  // ---------- keeping it smooth ----------
  // The fog's resolution, in texels per CSS pixel. It starts at the top and
  // steps down when frames come too slowly while the fog moves (45 frames
  // averaging over 20 ms, under 50 a second), and back up after a long run
  // of full-speed ones (each step down makes that wait twice as long, so it
  // doesn't see-saw).
  var QUALITY = [1, 0.75, 0.5, 0.35];
  function makeQuality(){
    var level = 0, times = [], upAfter = 240;
    function sample(ms){
      times.push(ms);
      if (times.length>upAfter) times.shift();
      var recent = times.slice(-45);
      var avg = recent.reduce(function(a, b){ return a+b; }, 0)/recent.length;
      if (recent.length===45 && avg>20 && level<QUALITY.length-1){
        level++; times = []; upAfter = Math.min(upAfter*2, 3600);
      } else if (times.length>=upAfter && level>0 && times.reduce(function(a, b){ return a+b; }, 0)/times.length<17.5){
        level--; times = [];
      }
      return QUALITY[level];
    }
    return {sample:sample, scale:function(){ return QUALITY[level]; }, level:function(){ return level; }};
  }

  // ---------- WebGL ----------
  var NOISE_PX = 256;                 // the repeating noise picture, generated once on the graphics chip
  // Three layers of cloud: how many CSS pixels their picture spans at a
  // whole zoom (big slow banks, middle billows, fine wisps), and their drift,
  // each its own speed and direction, in pictures per second.
  var LAYERS = [
    {tile:1500, drift:[0.0036, 0.0012]},
    {tile:700, drift:[-0.0034, 0.0056]},
    {tile:320, drift:[0.0105, -0.0074]}
  ];
  var IDLE_FRAME_MS = 33;             // the clouds drift at 30 frames a second while the map is still

  var SHADERS = {
    // A region: its fan (into the stencil), then its box (painted where the stencil says inside).
    regionVs: 'in vec2 a_off; uniform vec2 u_anchor; uniform float u_world; uniform vec2 u_size;\n'+
      'void main(){ vec2 px = u_anchor + a_off*u_world; gl_Position = vec4(px.x/u_size.x*2.0-1.0, 1.0-px.y/u_size.y*2.0, 0.0, 1.0); }',
    regionFs: 'uniform float u_value; out vec4 color; void main(){ color = vec4(u_value, 0.0, 0.0, 0.0); }',
    // A circle: a square around it, clear inside, soft across its edge.
    circleVs: 'in vec2 a_pos; in vec4 a_circle; uniform vec2 u_size; out vec2 v_pos; out vec4 v_circle;\n'+
      'void main(){ v_pos = a_pos; v_circle = a_circle; gl_Position = vec4(a_pos.x/u_size.x*2.0-1.0, 1.0-a_pos.y/u_size.y*2.0, 0.0, 1.0); }',
    circleFs: 'in vec2 v_pos; in vec4 v_circle; out vec4 color;\n'+
      'void main(){ float soft = max('+CIRCLE_SOFT.toFixed(2)+', 1.5/v_circle.z);\n'+
      '  float d = distance(v_pos, v_circle.xy)/v_circle.z;\n'+
      '  color = vec4(0.0, v_circle.w*(1.0-smoothstep(1.0-soft, 1.0+soft, d)), 0.0, 0.0); }',
    // The whole screen (one triangle covering it).
    screenVs: 'const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));\n'+
      'out vec2 v_uv; void main(){ vec2 p = P[gl_VertexID]; v_uv = p*0.5+0.5; gl_Position = vec4(p, 0.0, 1.0); }',
    // The regions' blur, one direction at a time (the circles pass through).
    blurFs: 'in vec2 v_uv; uniform sampler2D u_tex; uniform vec2 u_step; out vec4 color;\n'+
      'const float W[5] = float[5](0.2270, 0.1945, 0.1216, 0.0540, 0.0162);\n'+
      'void main(){ vec4 c = texture(u_tex, v_uv); float r = c.r*W[0];\n'+
      '  for (int i=1;i<5;i++){ vec2 o = u_step*float(i); r += (texture(u_tex, v_uv+o).r + texture(u_tex, v_uv-o).r)*W[i]; }\n'+
      '  color = vec4(r, c.g, 0.0, 0.0); }',
    // The noise picture: four independent channels of smooth fractal
    // noise (5 octaves of gradient noise), repeating seamlessly at its edges.
    noiseFs: 'in vec2 v_uv; out vec4 color;\n'+
      'uvec3 pcg(uvec3 v){ v = v*1664525u + 1013904223u; v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y;\n'+
      '  v ^= v >> 16u; v.x += v.y*v.z; v.y += v.z*v.x; v.z += v.x*v.y; return v; }\n'+
      'vec2 grad(ivec2 c, int period, uint seed){ uvec2 w = uvec2(c % period); float a = float(pcg(uvec3(w, seed)).x)*(6.2831853/4294967296.0); return vec2(cos(a), sin(a)); }\n'+
      'float gnoise(vec2 p, int period, uint seed){ ivec2 i = ivec2(floor(p)); vec2 f = p-vec2(i); vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);\n'+
      '  float a = dot(grad(i, period, seed), f), b = dot(grad(i+ivec2(1,0), period, seed), f-vec2(1.0,0.0));\n'+
      '  float c = dot(grad(i+ivec2(0,1), period, seed), f-vec2(0.0,1.0)), d = dot(grad(i+ivec2(1,1), period, seed), f-vec2(1.0));\n'+
      '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }\n'+
      'float fbm(vec2 uv, uint seed){ float sum = 0.0, amp = 0.5, norm = 0.0; int period = 4;\n'+
      '  for (int o=0;o<5;o++){ sum += amp*gnoise(uv*float(period), period, seed+uint(o)*7919u); norm += amp; amp *= 0.5; period *= 2; }\n'+
      '  return clamp(0.5 + sum/norm*1.5, 0.0, 1.0); }\n'+
      'void main(){ color = vec4(fbm(v_uv, 1u), fbm(v_uv, 1013u), fbm(v_uv, 2027u), fbm(v_uv, 3037u)); }',
    // The clouds, at the fog's resolution: three layers of noise stuck to
    // the world (each read at the zoom below and above, faded between),
    // gently warped into smoke; lit a little on their edges; cleared where
    // the mask is, with edges that billow as the noise drifts.
    cloudFs: 'in vec2 v_uv; uniform sampler2D u_noise; uniform sampler2D u_mask;\n'+
      'uniform vec2 u_size; uniform vec3 u_lo[3]; uniform vec3 u_hi[3]; uniform vec2 u_drift[3]; uniform float u_fade;\n'+
      'out vec4 color;\n'+
      'vec4 layer(int i, vec2 p, vec2 warp){\n'+
      '  vec4 a = texture(u_noise, u_lo[i].xy + p*u_lo[i].z + u_drift[i] + warp);\n'+
      '  vec4 b = texture(u_noise, u_hi[i].xy + p*u_hi[i].z + u_drift[i] + warp);\n'+
      '  float w = u_fade; return 0.5 + ((a-0.5)*(1.0-w) + (b-0.5)*w)*inversesqrt((1.0-w)*(1.0-w) + w*w); }\n'+
      'void main(){\n'+
      '  vec2 p = vec2(v_uv.x, 1.0-v_uv.y)*u_size;\n'+
      '  vec4 mid = layer(1, p, vec2(0.0));\n'+
      '  vec2 warp = (mid.ba-0.5)*0.16;\n'+
      '  float big = layer(0, p, warp).r, fine = layer(2, p, warp*1.6).a;\n'+
      '  float density = smoothstep(0.22, 0.78, big*0.5 + mid.g*0.32 + fine*0.18);\n'+
      '  vec4 m = texture(u_mask, v_uv);\n'+
      '  float open = max(m.r, m.g) + ((fine-0.5)*0.8 + (mid.g-0.5)*0.6)*0.5;\n'+
      '  float fog = 1.0 - smoothstep(0.38, 0.62, open);\n'+
      '  vec3 col = mix(vec3(0.03, 0.023, 0.018), vec3(0.225, 0.175, 0.125), density);\n'+
      '  float rim = 1.0 - abs(density-0.5)*2.0; col += vec3(0.15, 0.095, 0.04)*rim*rim*rim*0.8;\n'+
      '  col += vec3(0.30, 0.17, 0.05)*fog*(1.0-fog)*1.4;\n'+
      '  float a = fog*mix(0.93, 0.99, density);\n'+
      '  color = vec4(col*a, a); }',
    // Onto the map: the clouds, scaled up smoothly, with a fine grain that
    // stays still (so it never flickers). Premultiplied, like the map.
    compositeFs: 'in vec2 v_uv; uniform sampler2D u_fog; out vec4 color;\n'+
      'float grain(vec2 p){ uvec2 q = uvec2(p)*uvec2(1597334673u, 3812015801u); uint n = (q.x ^ q.y)*1597334673u; n ^= n >> 15u; return float(n)/4294967296.0; }\n'+
      'void main(){ vec4 f = texture(u_fog, v_uv); float g = grain(gl_FragCoord.xy)-0.5;\n'+
      '  color = vec4(max(f.rgb + vec3(0.9, 0.72, 0.5)*g*0.06*f.a, 0.0), f.a); }'
  };

  function compile(gl, vs, fs){
    function shader(type, source){
      var s = gl.createShader(type);
      gl.shaderSource(s, '#version 300 es\nprecision highp float;\nprecision highp int;\n'+source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Fog shader: '+gl.getShaderInfoLog(s));
      return s;
    }
    var program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Fog program: '+gl.getProgramInfoLog(program));
    var u = {}, n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (var i=0;i<n;i++){
      var name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, '');
      u[name] = gl.getUniformLocation(program, name);
    }
    return {program:program, u:u};
  }
  function texture(gl, w, h, repeat){
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    return t;
  }
  function target(gl, tex){
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return fbo;
  }
  function stayStill(){
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // The layer. `places()` returns {circles: [{key, lat, lon, radius}],
  // regions: [{key, shape or null}]}. setActive(false) (the map off the
  // screen) stops the drift; so does the app going to the background.
  function createLayer(map, places){
    var gl = null, prog = null, res = null;
    var meshes = typeof WeakMap==='function' ? new WeakMap() : null;
    var circleData = new Float32Array(0);
    var size = {w:0, h:0};            // the fog's textures, in texels
    var view = null, scale = 1;       // texels per CSS pixel
    var reveals = makeReveals(), quality = makeQuality();
    var shown = true, active = true, timer = null;
    var clock = 0, lastFrame = 0, lastBusy = false, moving = false;

    function init(context){
      gl = context;
      prog = {
        region: compile(gl, SHADERS.regionVs, SHADERS.regionFs),
        circle: compile(gl, SHADERS.circleVs, SHADERS.circleFs),
        blur: compile(gl, SHADERS.screenVs, SHADERS.blurFs),
        noise: compile(gl, SHADERS.screenVs, SHADERS.noiseFs),
        cloud: compile(gl, SHADERS.screenVs, SHADERS.cloudFs),
        composite: compile(gl, SHADERS.screenVs, SHADERS.compositeFs)
      };
      res = {
        regionVao: gl.createVertexArray(),
        circleVao: gl.createVertexArray(), circleBuf: gl.createBuffer(),
        screenVao: gl.createVertexArray(),
        tex: {}, fbo: {}, stencil: gl.createRenderbuffer(), noise: null
      };
      gl.bindVertexArray(res.regionVao);
      gl.enableVertexAttribArray(gl.getAttribLocation(prog.region.program, 'a_off'));
      gl.bindVertexArray(res.circleVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.circleBuf);
      var pos = gl.getAttribLocation(prog.circle.program, 'a_pos'), circle = gl.getAttribLocation(prog.circle.program, 'a_circle');
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(circle);
      gl.vertexAttribPointer(circle, 4, gl.FLOAT, false, 24, 8);
      gl.bindVertexArray(null);
      size = {w:0, h:0};
    }
    function drop(){
      gl = null; prog = null; res = null;
      if (meshes) meshes = new WeakMap();
    }
    // The noise picture, drawn once (in a frame, where the map expects
    // its drawing state to be changed).
    function makeNoise(){
      res.noise = texture(gl, NOISE_PX, NOISE_PX, true);
      var fbo = target(gl, res.noise);
      gl.viewport(0, 0, NOISE_PX, NOISE_PX);
      gl.disable(gl.BLEND);
      gl.useProgram(prog.noise.program);
      gl.bindVertexArray(res.screenVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      gl.bindTexture(gl.TEXTURE_2D, res.noise);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    // The mask (with its stencil), the blur's half-way step, and the clouds,
    // at the screen's size times `scale`.
    function fit(w, h){
      if (size.w===w && size.h===h) return;
      size = {w:w, h:h};
      ['mask', 'blur', 'cloud'].forEach(function(name){
        if (res.tex[name]){ gl.deleteTexture(res.tex[name]); gl.deleteFramebuffer(res.fbo[name]); }
        res.tex[name] = texture(gl, w, h, false);
        res.fbo[name] = target(gl, res.tex[name]);
      });
      gl.bindRenderbuffer(gl.RENDERBUFFER, res.stencil);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo.mask);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, res.stencil);
    }
    function mesh(shape){
      var m = meshes ? meshes.get(shape) : null;
      if (!m){
        m = regionMesh(shape);
        m.buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer);
        var all = new Float32Array(m.vertices.length+m.box.length);
        all.set(m.vertices); all.set(m.box, m.vertices.length);
        gl.bufferData(gl.ARRAY_BUFFER, all, gl.STATIC_DRAW);
        m.vertices = null;
        if (meshes) meshes.set(shape, m);
      }
      return m;
    }

    // ---------- the mask ----------
    function drawRegions(regions){
      var p = prog.region, drawn = false;
      gl.useProgram(p.program);
      gl.uniform1f(p.u.u_world, view.world);
      gl.uniform2f(p.u.u_size, view.width, view.height);
      gl.bindVertexArray(res.regionVao);
      gl.enable(gl.STENCIL_TEST);
      var loc = gl.getAttribLocation(p.program, 'a_off');
      regions.forEach(function(r){
        var shape = r.item;
        if (!boxOnScreen(view, shape.box, REGION_EDGE_MAX_PX)) return;
        var m = mesh(shape), at = toScreen(view, m.anchor[0], m.anchor[1]);
        gl.uniform2f(p.u.u_anchor, at[0], at[1]);
        gl.uniform1f(p.u.u_value, r.value);
        gl.bindBuffer(gl.ARRAY_BUFFER, m.buffer);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        // Inside: an odd count in the stencil...
        gl.colorMask(false, false, false, false);
        gl.stencilFunc(gl.ALWAYS, 0, 1);
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
        gl.drawArrays(gl.TRIANGLES, 0, m.count);
        // ...painted through its box, which also clears the stencil.
        gl.colorMask(true, false, false, false);
        gl.stencilFunc(gl.EQUAL, 1, 1);
        gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
        gl.drawArrays(gl.TRIANGLES, m.count, 6);
        drawn = true;
      });
      gl.disable(gl.STENCIL_TEST);
      gl.colorMask(true, true, true, true);
      return drawn;
    }
    // A circle being revealed grows from a third of its size as it clears.
    function drawCircles(circles){
      var list = [];
      circles.forEach(function(c){
        var s = circleOnScreen(view, c.item);
        if (!s) return;
        s.r *= 0.35+0.65*c.value;
        s.value = c.value;
        list.push(s);
      });
      if (!list.length) return;
      if (circleData.length < list.length*36) circleData = new Float32Array(list.length*36*2);
      var k = 0;
      list.forEach(function(s){
        var e = s.r*(1+CIRCLE_SOFT)+2;
        var corners = [s.x-e, s.y-e, s.x+e, s.y-e, s.x+e, s.y+e, s.x-e, s.y-e, s.x+e, s.y+e, s.x-e, s.y+e];
        for (var i=0;i<12;i+=2){
          circleData[k++] = corners[i]; circleData[k++] = corners[i+1];
          circleData[k++] = s.x; circleData[k++] = s.y; circleData[k++] = s.r; circleData[k++] = s.value;
        }
      });
      var p = prog.circle;
      gl.useProgram(p.program);
      gl.uniform2f(p.u.u_size, view.width, view.height);
      gl.bindVertexArray(res.circleVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.circleBuf);
      gl.bufferData(gl.ARRAY_BUFFER, circleData.subarray(0, k), gl.DYNAMIC_DRAW);
      gl.colorMask(false, true, false, false);
      gl.drawArrays(gl.TRIANGLES, 0, list.length*6);
      gl.colorMask(true, true, true, true);
    }
    // The regions' soft edge: blurred across, then down, back into the mask.
    function blur(){
      var p = prog.blur;
      var px = regionEdgePx(view, latOf(view.y))*scale/4;
      gl.useProgram(p.program);
      gl.bindVertexArray(res.screenVao);
      gl.disable(gl.BLEND);
      gl.uniform1i(p.u.u_tex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo.blur);
      gl.bindTexture(gl.TEXTURE_2D, res.tex.mask);
      gl.uniform2f(p.u.u_step, px/size.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo.mask);
      gl.bindTexture(gl.TEXTURE_2D, res.tex.blur);
      gl.uniform2f(p.u.u_step, 0, px/size.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function drawMask(list){
      var circles = [], regions = [];
      list.forEach(function(s){ (s.item.box ? regions : circles).push(s); });
      gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo.mask);
      gl.viewport(0, 0, size.w, size.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clearStencil(0);
      gl.stencilMask(0xff);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);
      if (drawRegions(regions)) blur();
      gl.enable(gl.BLEND);
      drawCircles(circles);
      gl.blendEquation(gl.FUNC_ADD);
    }

    // ---------- the clouds ----------
    function drawClouds(zoom){
      var p = prog.cloud, lo = new Float32Array(9), hi = new Float32Array(9), drift = new Float32Array(6);
      var level = Math.floor(zoom);
      LAYERS.forEach(function(layer, i){
        var a = cloudFrame(view, zoom, level, layer.tile), b = cloudFrame(view, zoom, level+1, layer.tile);
        lo.set([a.x, a.y, a.step], i*3);
        hi.set([b.x, b.y, b.step], i*3);
        var dx = layer.drift[0]*clock, dy = layer.drift[1]*clock;
        drift.set([dx-Math.floor(dx), dy-Math.floor(dy)], i*2);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo.cloud);
      gl.viewport(0, 0, size.w, size.h);
      gl.disable(gl.BLEND);
      gl.useProgram(p.program);
      gl.uniform2f(p.u.u_size, view.width, view.height);
      gl.uniform3fv(p.u.u_lo, lo);
      gl.uniform3fv(p.u.u_hi, hi);
      gl.uniform2fv(p.u.u_drift, drift);
      gl.uniform1f(p.u.u_fade, cloudFade(zoom));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, res.noise);
      gl.uniform1i(p.u.u_noise, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, res.tex.mask);
      gl.uniform1i(p.u.u_mask, 1);
      gl.bindVertexArray(res.screenVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    }

    // ---------- moving ----------
    // After each frame: the next one right away while the map or a reveal
    // moves, else in IDLE_FRAME_MS for the drift. Nothing while the map is
    // off the screen, the app is in the background, or motion is reduced.
    function next(busy){
      if (!active || !shown || stayStill()) return;
      if (busy){ map.triggerRepaint(); return; }
      if (!timer) timer = setTimeout(function(){ timer = null; if (active && shown) map.triggerRepaint(); }, IDLE_FRAME_MS);
    }
    function onVisibility(){
      shown = document.visibilityState!=='hidden';
      lastFrame = 0;
      if (shown && active) map.triggerRepaint();
    }
    document.addEventListener('visibilitychange', onVisibility);

    var layer = {
      id: 'fog', type: 'custom', renderingMode: '2d',
      onAdd: function(m, context){ init(context); },
      onRemove: function(){
        document.removeEventListener('visibilitychange', onVisibility);
        clearTimeout(timer);
        drop();
      },
      prerender: function(context){
        if (!gl) init(context);
        if (!res.noise) makeNoise();
        // The clock only runs while the fog moves; frames coming at full
        // speed tell how the phone keeps up.
        var now = typeof performance!=='undefined' ? performance.now() : Date.now();
        var dt = lastFrame ? now-lastFrame : 0;
        lastFrame = now;
        var still = stayStill();
        if (!still && dt<250) clock += Math.min(dt, 100)/1000;
        if (lastBusy && dt>0 && dt<250 && !still) quality.sample(dt);
        scale = quality.scale();
        var ratio = map.getPixelRatio();
        var cssW = gl.drawingBufferWidth/ratio, cssH = gl.drawingBufferHeight/ratio;
        var c = map.getCenter(), zoom = map.getZoom();
        view = viewOf(c.lng, c.lat, zoom, cssW, cssH);
        fit(Math.max(1, Math.round(cssW*scale)), Math.max(1, Math.round(cssH*scale)));
        var what = places(), entries = [];
        what.circles.forEach(function(c){ entries.push({key:c.key, item:{lat:c.lat, lon:c.lon, radius:c.radius}}); });
        what.regions.forEach(function(r){ entries.push({key:r.key, item:r.shape}); });
        var state = reveals.update(entries, now, still);
        moving = state.moving;
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        drawMask(state.list);
        drawClouds(zoom);
        gl.bindVertexArray(null);
      },
      render: function(){
        if (!res || !size.w) return;
        var p = prog.composite;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(p.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, res.tex.cloud);
        gl.uniform1i(p.u.u_fog, 0);
        gl.bindVertexArray(res.screenVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        lastBusy = moving || map.isMoving();
        next(lastBusy);
      },
      // The map on the screen or not (js/map.js).
      setActive: function(on){
        active = !!on;
        lastFrame = 0;
        if (active) map.triggerRepaint();
        else { clearTimeout(timer); timer = null; }
      },
      // For checking: the fog's resolution now (texels per CSS pixel).
      scale: function(){ return scale; }
    };
    map.on('webglcontextlost', drop);
    return layer;
  }
  // The latitude at a point of the 0-1 world, from top (0) to bottom (1).
  function latOf(my){
    return Math.atan(Math.sinh(Math.PI*(1-2*my)))*180/Math.PI;
  }

  ST.fog = {
    TILE_PX: TILE_PX,
    viewOf: viewOf,
    toScreen: toScreen,
    circleOnScreen: circleOnScreen,
    regionEdgePx: regionEdgePx,
    regionMesh: regionMesh,
    boxOnScreen: boxOnScreen,
    latOf: latOf,
    cloudFrame: cloudFrame,
    cloudFade: cloudFade,
    REVEAL_MS: REVEAL_MS,
    REMOVE_MS: REMOVE_MS,
    makeReveals: makeReveals,
    QUALITY: QUALITY,
    makeQuality: makeQuality,
    createLayer: createLayer
  };
})(window.StatusTerminal);
