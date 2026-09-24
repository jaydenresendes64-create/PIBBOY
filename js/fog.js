/**
 * Fog of war (MAP tab) — a MapLibre custom WebGL layer that js/map.js puts
 * on top of the map's own layers. It's drawn in the same frame as the map,
 * with the map's own camera, so it can't lag or slide during a drag or a
 * pinch.
 *
 * Each frame, first (prerender, into textures of its own):
 *  - the reveal mask, at the fog's resolution: every revealed region filled
 *    in its exact shape (the stencil buffer fills each ring, holes and
 *    islands included), then softened by a blur sized in real metres; every
 *    city and pin as a circle of its radius in real metres, soft on both
 *    sides of its edge.
 * then (render, onto the map):
 *  - the fog, everywhere the mask leaves it.
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

  // ---------- WebGL ----------
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
    // The fog, onto the map (premultiplied: the map's blending).
    fogFs: 'in vec2 v_uv; uniform sampler2D u_mask; out vec4 color;\n'+
      'void main(){ vec4 m = texture(u_mask, v_uv); float open = max(m.r, m.g);\n'+
      '  float a = 0.93*(1.0-smoothstep(0.35, 0.65, open));\n'+
      '  color = vec4(vec3(0.075, 0.045, 0.02)*a, a); }'
  };

  function compile(gl, vs, fs){
    function shader(type, source){
      var s = gl.createShader(type);
      gl.shaderSource(s, '#version 300 es\nprecision highp float;\n'+source);
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
    for (var i=0;i<n;i++){ var name = gl.getActiveUniform(program, i).name; u[name] = gl.getUniformLocation(program, name); }
    return {program:program, u:u};
  }
  function texture(gl, w, h){
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // The layer. `places()` returns {circles: [city or pin], shapes: [region shape]}.
  function createLayer(map, places){
    var gl = null, prog = null, res = null;
    var meshes = typeof WeakMap==='function' ? new WeakMap() : null;
    var circleData = new Float32Array(0);
    var size = {w:0, h:0};            // the textures' size, in texels
    var view = null, scale = 1;       // texels per CSS pixel

    function init(context){
      gl = context;
      prog = {
        region: compile(gl, SHADERS.regionVs, SHADERS.regionFs),
        circle: compile(gl, SHADERS.circleVs, SHADERS.circleFs),
        blur: compile(gl, SHADERS.screenVs, SHADERS.blurFs),
        fog: compile(gl, SHADERS.screenVs, SHADERS.fogFs)
      };
      res = {
        regionVao: gl.createVertexArray(), regionBuf: gl.createBuffer(),
        circleVao: gl.createVertexArray(), circleBuf: gl.createBuffer(),
        screenVao: gl.createVertexArray(),
        fbo: [gl.createFramebuffer(), gl.createFramebuffer()], tex: [null, null], stencil: gl.createRenderbuffer()
      };
      gl.bindVertexArray(res.regionVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, res.regionBuf);
      var loc = gl.getAttribLocation(prog.region.program, 'a_off');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
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
    // The two textures (the mask, and the half-way step of the blur), and
    // the stencil, at the screen's size times `scale`.
    function fit(w, h){
      if (size.w===w && size.h===h) return;
      size = {w:w, h:h};
      for (var i=0;i<2;i++){
        if (res.tex[i]) gl.deleteTexture(res.tex[i]);
        res.tex[i] = texture(gl, w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, res.tex[i], 0);
      }
      gl.bindRenderbuffer(gl.RENDERBUFFER, res.stencil);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo[0]);
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
        if (meshes) meshes.set(shape, m);
      }
      return m;
    }

    function drawRegions(shapes){
      var p = prog.region, drawn = false;
      gl.useProgram(p.program);
      gl.uniform1f(p.u.u_world, view.world);
      gl.uniform2f(p.u.u_size, view.width, view.height);
      gl.uniform1f(p.u.u_value, 1);
      gl.bindVertexArray(res.regionVao);
      gl.enable(gl.STENCIL_TEST);
      var loc = gl.getAttribLocation(p.program, 'a_off');
      shapes.forEach(function(shape){
        var m = mesh(shape);
        if (!boxOnScreen(view, shape.box, REGION_EDGE_MAX_PX)) return;
        var at = toScreen(view, m.anchor[0], m.anchor[1]);
        gl.uniform2f(p.u.u_anchor, at[0], at[1]);
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
    function drawCircles(circles){
      var list = [];
      circles.forEach(function(c){
        var s = circleOnScreen(view, c);
        if (s) list.push(s);
      });
      if (!list.length) return;
      if (circleData.length < list.length*36) circleData = new Float32Array(list.length*36*2);
      var k = 0;
      list.forEach(function(s){
        var e = s.r*(1+CIRCLE_SOFT)+2;
        var corners = [s.x-e, s.y-e, s.x+e, s.y-e, s.x+e, s.y+e, s.x-e, s.y-e, s.x+e, s.y+e, s.x-e, s.y+e];
        for (var i=0;i<12;i+=2){
          circleData[k++] = corners[i]; circleData[k++] = corners[i+1];
          circleData[k++] = s.x; circleData[k++] = s.y; circleData[k++] = s.r; circleData[k++] = 1;
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
      gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo[1]);
      gl.bindTexture(gl.TEXTURE_2D, res.tex[0]);
      gl.uniform2f(p.u.u_step, px/size.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo[0]);
      gl.bindTexture(gl.TEXTURE_2D, res.tex[1]);
      gl.uniform2f(p.u.u_step, 0, px/size.h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    var layer = {
      id: 'fog', type: 'custom', renderingMode: '2d',
      onAdd: function(m, context){ init(context); },
      onRemove: function(){ drop(); },
      prerender: function(context){
        if (!gl) init(context);
        var ratio = map.getPixelRatio();
        var cssW = gl.drawingBufferWidth/ratio, cssH = gl.drawingBufferHeight/ratio;
        var c = map.getCenter();
        view = viewOf(c.lng, c.lat, map.getZoom(), cssW, cssH);
        scale = 1;
        fit(Math.max(1, Math.round(cssW*scale)), Math.max(1, Math.round(cssH*scale)));
        var what = places();
        gl.bindFramebuffer(gl.FRAMEBUFFER, res.fbo[0]);
        gl.viewport(0, 0, size.w, size.h);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.clearColor(0, 0, 0, 0);
        gl.clearStencil(0);
        gl.stencilMask(0xff);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.MAX);
        gl.blendFunc(gl.ONE, gl.ONE);
        var regions = drawRegions(what.shapes);
        if (regions) blur();
        gl.enable(gl.BLEND);
        drawCircles(what.circles);
        gl.blendEquation(gl.FUNC_ADD);
        gl.bindVertexArray(null);
      },
      render: function(context){
        if (!res || !size.w) return;
        var p = prog.fog;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.STENCIL_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(p.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, res.tex[0]);
        gl.uniform1i(p.u.u_mask, 0);
        gl.bindVertexArray(res.screenVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
      }
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
    createLayer: createLayer
  };
})(window.StatusTerminal);
