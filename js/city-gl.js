// S8.2 « Passe de rendu WebGL »: the scene's 2D canvas (#viz: the city of garden-visual.js, and the Orbes / Horizon /
// Spectre of visual.js, the same canvas) is uploaded as a texture each frame and recomposed on a WebGL canvas laid over
// it (.city-gl, click-through; #viz stays in the page, transparent, and keeps drawing). No dependency, raw WebGL1.
//   - passes: bright pass (threshold) at half resolution → 9-tap gaussian blur (H, V) at half then quarter resolution
//     (neon bloom, two radii) → one composite: barrel curvature, chromatic aberration, VHS (tracking bands, colour bleed),
//     warp (hyperspace radial blur), fog, bloom, flash, a hue-keeping highlight shoulder (S8.8: saturated colours, never a
//     white or milky veil; blacks stay black), CRT (scanlines, vignette, optional shadow mask `mask`), grain.
//     (S8.8: the Sobel `wire` input is gone: 1984 is drawn in vector lines from the world model, js/city-combos.js.)
//   - named inputs (0..2), driven later from the world model: bloom, chroma, crt, fog, vhs, flash, shake, warp,
//     grain, mask. AMB.cityGL.set(name, v) sets the base level; pulse(name, amount, ms) adds a decaying impulse on top.
//   - JUICE (AMB.motion): look effects (bloom, chroma, crt, mask) × (0.25 + 0.75 JUICE); motion effects (vhs, grain,
//     shake, warp, flash) × JUICE; JUICE 0 = a still image (time frozen, no motion effect). Reduced motion: the look at
//     half strength, every motion effect off (no flash), time frozen. fog is content (not scaled).
//   - robustness: no WebGL, a lost context, or a frame budget blown (sliding measure of the frame interval and of this
//     pass's own cost: quality steps down — render scale 0.7, one bloom radius, scale 0.5 — then 2D) → automatic fallback:
//     the GL canvas hides, #viz shows again with the css CRT (body.city .stage::after) and the 2D post of garden-visual
//     (gardenVisual.post2d). A restored context brings WebGL back; a budget fallback stays for the session.
//     ?gl=0 = never WebGL; ?gl=1 = WebGL without the budget fallback (dev captures).
//   - resolution: output = source size × min(1, 1.5 / devicePixelRatio) × quality scale; bloom at 1/2 and 1/4 of it.
//     Follows any size of #viz (ResizeObserver: S8.3 full screen); the overlay copies #viz's box and its punch animations.
// Hook: wraps AMB.visual.draw (loaded after garden-visual.js) → render after every frame of any visual mode; nothing
// drawn when the tab is hidden or the city is off screen. No change in garden-visual.js or visual.js.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const NAMES = ['bloom', 'chroma', 'crt', 'fog', 'vhs', 'flash', 'shake', 'warp', 'grain', 'mask'];
  const LOOK = { bloom: 1, chroma: 1, crt: 1, mask: 1 }, MOTION = { vhs: 1, grain: 1, shake: 1, warp: 1, flash: 1 };
  const BASE = { bloom: 1.2, chroma: 0.35, crt: 0.55, grain: 0.2 }; // the default look (others 0)
  const FOG = [0.13, 0.05, 0.2]; // S8.8: a DARK violet haze (the lights glow through it), never a milky veil
  const LEVELS = [{ scale: 1, q: true }, { scale: 0.7, q: false }, { scale: 0.5, q: false }]; // budget steps, then 2D
  const BUDGET = { warm: 30, window: 90, interval: 36, own: 6 }; // ms: below ~28 fps, or this pass > 6 ms → one step down
  const qs = (() => { try { return new URLSearchParams(location.search).get('gl'); } catch (e) { return null; } })();

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const BRIGHT = `precision mediump float;varying vec2 v;uniform sampler2D S;uniform vec2 TX;uniform float TH;
void main(){vec3 c=(texture2D(S,v+TX*vec2(-1.,-1.)).rgb+texture2D(S,v+TX*vec2(1.,-1.)).rgb+texture2D(S,v+TX*vec2(-1.,1.)).rgb+texture2D(S,v+TX).rgb)*.25;
float m=max(c.r,max(c.g,c.b)),l=dot(c,vec3(.299,.587,.114));gl_FragColor=vec4(c*smoothstep(TH,1.,m)*(1.25-.45*smoothstep(.75,1.,l)),1.);}`;
  const BLUR = `precision mediump float;varying vec2 v;uniform sampler2D S;uniform vec2 D;
void main(){vec3 c=texture2D(S,v).rgb*.227027+(texture2D(S,v+D*1.384615).rgb+texture2D(S,v-D*1.384615).rgb)*.316216+(texture2D(S,v+D*3.230769).rgb+texture2D(S,v-D*3.230769).rgb)*.070270;gl_FragColor=vec4(c,1.);}`;
  const COMP = `precision mediump float;varying vec2 v;
uniform sampler2D S,B1,B2;uniform vec2 R,TX,SH;uniform vec3 FC;
uniform float T,SL,BL,CH,CR,FG,VH,FL,WP,GR,MK;
float hs(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 tx(vec2 u){return texture2D(S,u).rgb;}
vec3 scene(vec2 u){vec3 c=tx(u);if(WP>.001){vec3 a=vec3(0.);vec2 d=(u-.5)*WP*.035;for(int i=1;i<9;i++)a+=tx(u-d*float(i))*(1.-float(i)*.09);c=max(c,a*.14*min(1.,WP));}return c;}
float lu(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){
vec2 c=v*2.-1.;c*=1.+CR*.07*vec2(c.y*c.y,c.x*c.x);vec2 t=c*.5+.5;vec2 u=t+SH;
if(VH>.001){float row=floor(u.y*R.y/4.);float roll=smoothstep(.96,1.,fract(u.y*.8-T*.21));float band=smoothstep(.82,1.,sin(u.y*4.+T*1.3))+roll*2.;
u.x+=(hs(vec2(row,floor(T*24.)))-.5)*.006*VH+band*.018*VH*(hs(vec2(row*.7,floor(T*24.)))-.35);}
vec2 d=(u-.5)*CH*.012+vec2(VH*.004,0.);
vec3 col=vec3(scene(u+d).r,scene(u).g,scene(u-d).b);
if(VH>.001){vec3 sm=(tx(u-vec2(TX.x*5.,0.))+tx(u-vec2(TX.x*10.,0.)))*.5;float l=lu(col);vec3 ch=mix(col,sm,.7)-lu(mix(col,sm,.7));
col=mix(col,vec3(l)+ch*1.15,min(1.,VH));col*=1.-.12*VH;
float roll=smoothstep(.97,1.,fract(u.y*.8-T*.21));col+=VH*(roll*.5+.06)*hs(vec2(floor(u.y*R.y/2.),floor(gl_FragCoord.x/3.)+T));}
vec3 bl=max(texture2D(B1,u).rgb*.6+texture2D(B2,u).rgb*.55-.03,0.);col+=bl*min(BL,1.6)*(1.+FG*.5);
if(FG>.001){float n=.5+.25*sin(u.x*6.+T*.3+sin(u.y*9.-T*.2))+.25*sin(u.x*13.-T*.5+u.y*4.);float fo=FG*(1.-smoothstep(.05,.9,u.y))*(.45+.55*n);col=mix(col,FC+bl*1.1,clamp(fo,0.,.55));}
col=col*(1.+FL*1.3)+FL*.12*vec3(.7,.65,1.);
float mx=max(col.r,max(col.g,col.b));if(mx>.72){col*=(.72+.28*(1.-exp((.72-mx)/.28)))/mx;}
col=max(mix(vec3(lu(col)),col,1.18)-.012,0.);col=mix(col,col*col*(3.-2.*min(col,1.)),.4);
float s=.5+.5*sin(gl_FragCoord.y*3.14159/SL);col*=1.-CR*.28*(1.-s);
if(MK>.001){float m=mod(gl_FragCoord.x,3.);vec3 mk=m<1.?vec3(1.,.55,.55):m<2.?vec3(.55,1.,.55):vec3(.55,.55,1.);col*=mix(vec3(1.),mk*1.3,min(1.,MK)*.6);}
float r2=dot(c,c);col*=1.-CR*.45*r2*r2*.25;
vec2 o=smoothstep(vec2(0.),vec2(.004),t)*smoothstep(vec2(0.),vec2(.004),1.-t);col*=o.x*o.y;
col+=(hs(gl_FragCoord.xy+fract(T*.37)*911.)-.5)*.14*GR;
gl_FragColor=vec4(col,1.);}`;

  const G = {
    NAMES, BASE, BUDGET, LEVELS,
    base: Object.fromEntries(NAMES.map((n) => [n, BASE[n] || 0])),
    pulses: [], // {name, amount, t0, ms}
    mode: 'off', // 'gl' | '2d' | 'off' (not started)
    reason: null, level: 0, noBudget: qs === '1', forceNoGL: qs === '0',
    frames: 0, times: [], own: [], last: 0, T: 0,

    // ---- inputs
    set(name, v) {
      if (!(name in this.base)) return false;
      this.base[name] = Math.max(0, Math.min(2, +v || 0));
      return true;
    },
    get(name) { return this.base[name]; },
    pulse(name, amount = 1, ms = 400) {
      if (!(name in this.base)) return false;
      this.pulses.push({ name, amount: +amount || 0, t0: performance.now(), ms: Math.max(1, +ms || 1) });
      if (this.pulses.length > 32) this.pulses.shift();
      return true;
    },
    juice() { const M = AMB.motion; return M ? Math.max(0, +M.JUICE || 0) : 1; },
    reduced() { const M = AMB.motion; return !!(M && M.reduced); },
    // the effective value of an input now (base + pulses, × JUICE / reduced motion)
    value(name, now = performance.now()) {
      let v = this.base[name] || 0;
      for (const p of this.pulses) if (p.name === name) { const k = 1 - (now - p.t0) / p.ms; if (k > 0) v += p.amount * k * k; }
      const J = this.juice(), red = this.reduced();
      if (LOOK[name]) v *= red ? 0.5 : 0.25 + 0.75 * Math.min(2, J);
      else if (MOTION[name]) v *= red ? 0 : Math.min(2, J);
      if (name === 'flash') v = Math.min(1, v);
      return Math.max(0, v);
    },

    // ---- life cycle
    init(src) {
      this.src = src; this.parent = src.parentNode;
      if (!this.cv) {
        const cv = (this.cv = document.createElement('canvas'));
        cv.className = 'city-gl'; cv.setAttribute('aria-hidden', 'true');
        src.insertAdjacentElement('afterend', cv);
        cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; this.fallback('lost'); });
        cv.addEventListener('webglcontextrestored', () => { this.lost = false; this.dropGL(); if (this.reason === 'lost') this.enable(); });
        if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => this.place()); this.ro.observe(src); }
        window.addEventListener('resize', () => this.place());
        // #viz's punch (garden fx-punch classes, motion.scene() Web Animations) must show on the overlay too
        if (typeof MutationObserver !== 'undefined') new MutationObserver(() => this.mirror()).observe(src, { attributes: true, attributeFilter: ['class'] });
        if (src.animate && !src.__glAnim) { const a = src.animate.bind(src); src.__glAnim = 1; src.animate = (k, o) => { try { if (this.mode === 'gl') cv.animate(k, o); } catch (e) {} return a(k, o); }; }
      }
      this.enable();
    },
    enable() {
      if (!this.cv) return false;
      if (this.forceNoGL) return this.fallback('off');
      if (!this.gl && !this.setupGL()) return this.fallback('nogl');
      this.mode = 'gl'; this.reason = null; this.level = 0; this.times.length = 0; this.own.length = 0; this.frames = 0;
      this.show(true); this.place();
      return true;
    },
    fallback(reason) {
      this.mode = '2d'; this.reason = reason || 'forced';
      this.show(false);
      return false;
    },
    show(on) {
      if (this.cv) this.cv.hidden = !on;
      if (this.src) this.src.style.opacity = on ? '0' : '';
      if (this.parent && this.parent.classList) this.parent.classList.toggle('gl', !!on);
      const gv = AMB.gardenVisual; if (gv) gv.post2d = !on; // S8.1: the 2D CRT band / fringes / vignette only in 2D
    },
    place() {
      const s = this.src, cv = this.cv; if (!s || !cv) return;
      Object.assign(cv.style, { left: s.offsetLeft + 'px', top: s.offsetTop + 'px', width: s.offsetWidth + 'px', height: s.offsetHeight + 'px' });
    },
    mirror() { if (this.cv && this.src) this.cv.className = 'city-gl ' + [...this.src.classList].filter((c) => c.startsWith('fx-')).join(' '); },
    dropGL() { this.gl = null; this.P = null; this.fb = null; this.tex = null; this.fw = this.fh = 0; },

    setupGL() {
      let gl = null;
      try { gl = this.cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'low-power' }); } catch (e) {}
      if (!gl || gl.isContextLost()) return false;
      const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      const prog = (fs) => {
        const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
        gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
        return { p, u };
      };
      try {
        this.P = { bright: prog(BRIGHT), blur: prog(BLUR), comp: prog(COMP) };
      } catch (e) { this.err = String(e.message || e); return false; }
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.tex = this.mkTex(gl);
      this.gl = gl; this.fb = null; this.fw = this.fh = 0;
      return true;
    },
    mkTex(gl) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    },
    // render targets: A, B at 1/2, C, D at 1/4 of the output
    targets(w, h) {
      const gl = this.gl;
      if (this.fb && this.fw === w && this.fh === h) return;
      if (this.fb) this.fb.forEach((f) => { gl.deleteFramebuffer(f.f); gl.deleteTexture(f.t); });
      const mk = (fw, fh) => {
        const t = this.mkTex(gl); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        return { f, t, w: fw, h: fh };
      };
      const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1), qw = Math.max(1, w >> 2), qh = Math.max(1, h >> 2);
      this.fb = [mk(hw, hh), mk(hw, hh), mk(qw, qh), mk(qw, qh)];
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.fw = w; this.fh = h;
    },
    pass(P, target, tex, set) {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
      gl.viewport(0, 0, target ? target.w : this.cv.width, target ? target.h : this.cv.height);
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); if (P.u.S) gl.uniform1i(P.u.S, 0);
      if (set) set(P.u);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },

    // ---- one frame: the scene canvas has just been drawn
    render(now = performance.now()) {
      if (this.mode !== 'gl' || !this.gl || !this.src) return false;
      const gl = this.gl, src = this.src, t0 = performance.now();
      if (gl.isContextLost()) { this.fallback('lost'); return false; }
      if (!src.width || !src.height) return false;
      const dpr = (AMB.visual && AMB.visual.dpr) || window.devicePixelRatio || 1, L = LEVELS[this.level];
      const sc = Math.min(1, 1.5 / dpr) * L.scale, w = Math.max(2, Math.round(src.width * sc)), h = Math.max(2, Math.round(src.height * sc));
      if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; this.place(); }
      this.targets(w, h);
      // time runs only when motion does (JUICE 0 / reduced motion: a still image)
      const live = !this.reduced() && this.juice() > 0;
      if (live) this.T = (this.T + Math.min(0.1, Math.max(0, (now - (this.tLast || now)) / 1000))) % 1000;
      this.tLast = now;
      this.pulses = this.pulses.filter((p) => now - p.t0 < p.ms);
      const V = {}; for (const n of NAMES) V[n] = this.value(n, now);
      gl.disable(gl.BLEND);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      const [A, B, C, D] = this.fb, P = this.P;
      const bloom = V.bloom > 0.001 || V.fog > 0.001;
      if (bloom) {
        this.pass(P.bright, A, this.tex, (u) => { gl.uniform2f(u.TX, 1 / src.width, 1 / src.height); gl.uniform1f(u.TH, 0.58); });
        this.pass(P.blur, B, A.t, (u) => gl.uniform2f(u.D, 1 / A.w, 0));
        this.pass(P.blur, A, B.t, (u) => gl.uniform2f(u.D, 0, 1 / A.h));
        if (L.q) {
          this.pass(P.blur, C, A.t, (u) => gl.uniform2f(u.D, 0.5 / A.w, 0.5 / A.h));
          this.pass(P.blur, D, C.t, (u) => gl.uniform2f(u.D, 1 / C.w, 0));
          this.pass(P.blur, C, D.t, (u) => gl.uniform2f(u.D, 0, 1 / C.h));
        }
      }
      const sh = V.shake * 0.012;
      this.pass(P.comp, null, this.tex, (u) => {
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, A.t); gl.uniform1i(u.B1, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, L.q ? C.t : A.t); gl.uniform1i(u.B2, 2);
        gl.activeTexture(gl.TEXTURE0);
        gl.uniform2f(u.R, w, h); gl.uniform2f(u.TX, 1 / src.width, 1 / src.height);
        gl.uniform2f(u.SH, sh ? (Math.random() - 0.5) * sh : 0, sh ? (Math.random() - 0.5) * sh : 0);
        gl.uniform3f(u.FC, FOG[0], FOG[1], FOG[2]);
        gl.uniform1f(u.T, this.T); gl.uniform1f(u.SL, Math.max(1.5, h / 300));
        const U = { BL: 'bloom', CH: 'chroma', CR: 'crt', FG: 'fog', VH: 'vhs', FL: 'flash', WP: 'warp', GR: 'grain', MK: 'mask' };
        for (const k in U) if (u[k]) gl.uniform1f(u[k], bloom || k !== 'BL' ? V[U[k]] : 0);
      });
      this.measure(now, performance.now() - t0);
      return true;
    },
    // sliding budget: frame interval and own cost; one quality step down per blown window, then 2D
    measure(now, own) {
      this.frames++;
      const dt = this.last ? now - this.last : 0; this.last = now;
      if (this.frames <= BUDGET.warm || this.noBudget) return;
      if (dt > 0 && dt < 250) this.times.push(dt); // (a hidden tab / a pause is not a slow frame)
      this.own.push(own);
      if (this.own.length < BUDGET.window) return;
      const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0), ai = avg(this.times), ao = avg(this.own);
      this.stat = { interval: ai, own: ao, level: this.level };
      this.times.length = 0; this.own.length = 0;
      if (ai > BUDGET.interval || ao > BUDGET.own) {
        this.level++;
        if (this.level >= LEVELS.length) { this.level = LEVELS.length - 1; this.fallback('budget'); }
      }
    },
    state() { return { mode: this.mode, reason: this.reason, level: this.level, w: this.cv ? this.cv.width : 0, h: this.cv ? this.cv.height : 0, stat: this.stat || null }; },
  };
  AMB.cityGL = G;

  // ---- hook: after every frame of AMB.visual (city or classic modes)
  const V = AMB.visual;
  if (!V || typeof document === 'undefined') return;
  const baseDraw = V.draw;
  V.draw = function () {
    const r = baseDraw.apply(this, arguments);
    if (!this.c) return r;
    if (G.src !== this.c) G.init(this.c);
    const gv = AMB.gardenVisual;
    if (document.hidden || (gv && gv.active && gv.visible === false)) return r;
    G.render();
    return r;
  };
})();
