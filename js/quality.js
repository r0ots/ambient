// S10.1 « Fluide sur téléphone » — ONE quality level for the whole app, an fps counter, and the first-time warm-up.
// - Levels (LEVELS): 0 haut (desktop: the look as designed), 1 moyen (phone default), 2 bas. Each level says: the canvas
//   density (`dpr` cap: the city's 2D canvas and so the WebGL source), the WebGL pass (`gl`: 2 = two bloom radii at 1/2 and
//   1/4, 1 = one radius at 1/4, 0 = no WebGL, the 2D post), `fx` (× particles, sparks, trails, the city's life caps; 0 =
//   none), `lite` (the SUPER combos in their phone version), and `glass` (backdrop-filter blur; css: html.q-moyen / .q-bas
//   drop it and the neon loops become transform-only, see « S10.1 » at the end of css/style.css).
// - Start (pick()): a coarse pointer on a small screen, or deviceMemory ≤ 4 / hardwareConcurrency ≤ 4 → moyen; ≤ 2 → bas;
//   else haut. ?q=haut|moyen|bas forces a level (and turns the governor off); ?q=auto keeps it on even in a frame.
// - Governor (one rAF loop measuring the REAL interval between frames; a hidden tab or a pause > 250 ms is not counted):
//   average over 2 s above SLOW_MS (20 ms) → one level down. Back up, carefully: only up to the start level, after
//   UP_S (10 s) of averages under FAST_MS, and each failed climb doubles the wait. Off inside an iframe (the tests'
//   pages embed the app) unless ?q=auto. Bus event 'quality' {level, name, why}; listeners: Q.on(fn).
// - Counter (?fps=1, or ⋯ « Afficher les images/s »; remembered): a small neon box, images/s average and worst over 2 s,
//   the level, the density used, WebGL yes / no. Updated twice a second (no layout outside its own box: contain).
// - Warm-up (warm(), once, on an idle moment after load and the fonts): the first strike, the first party and the
//   first Arbre used to cost much more than the next ones (lazy DOM, a canvas context, fonts shaped on the spot,
//   effects rasterised for the first time). Each is done once ahead, out of sight.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const LEVELS = [
    { name: 'haut', dpr: 2, gl: 2, fx: 1, lite: false, glass: true },
    { name: 'moyen', dpr: 1, gl: 1, fx: 0.5, lite: true, glass: false },
    { name: 'bas', dpr: 1, gl: 0, fx: 0, lite: true, glass: false },
  ];
  const NAMES = LEVELS.map((l) => l.name);
  const qs = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
  const framed = (() => { try { return window.top !== window; } catch (e) { return true; } })();
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; };

  const Q = {
    LEVELS, NAMES, SLOW_MS: 20, FAST_MS: 17.5, WINDOW_MS: 2000, UP_S: 10,
    level: 0, start: 0, auto: true, why: 'start', subs: [],
    cur() { return LEVELS[this.level]; },
    name() { return this.cur().name; },
    fx() { return this.cur().fx; }, // × particles, sparks, trails, caps
    lite() { return this.cur().lite; },
    gl() { return this.cur().gl; },
    // the density of the canvases: the level's cap, never above the screen's
    dpr() { return Math.max(1, Math.min(this.cur().dpr, window.devicePixelRatio || 1)); },
    // the start level from what the device says (pure: tests call it with a fake navigator / screen)
    pick(nav = navigator, win = window) {
      const mm = (q) => { try { return !!win.matchMedia && win.matchMedia(q).matches; } catch (e) { return false; } };
      const small = Math.min(win.innerWidth || 9999, (win.screen && win.screen.width) || 9999) <= 820;
      const mem = +nav.deviceMemory || 8, cores = +nav.hardwareConcurrency || 8;
      if (mem <= 2 || cores <= 2) return 2;
      if ((mm('(pointer: coarse)') && small) || mem <= 4 || cores <= 4) return 1;
      return 0;
    },
    set(level, why = 'set') {
      const l = Math.max(0, Math.min(LEVELS.length - 1, level | 0));
      if (l === this.level) return false;
      this.level = l; this.why = why; this.apply();
      const ev = { level: l, name: this.name(), why };
      for (const f of this.subs.slice()) { try { f(ev); } catch (e) { console.error(e); } }
      if (AMB.bus) AMB.bus.emit('quality', ev);
      return true;
    },
    on(fn) { this.subs.push(fn); return () => { const i = this.subs.indexOf(fn); if (i >= 0) this.subs.splice(i, 1); }; },
    apply() {
      const de = document.documentElement; if (!de) return;
      NAMES.forEach((n, i) => de.classList.toggle('q-' + n, i === this.level));
    },
    state() { return { level: this.level, name: this.name(), start: this.start, auto: this.auto, why: this.why, dpr: this.dpr(), gl: AMB.cityGL ? AMB.cityGL.mode === 'gl' : false, fps: this.stat() }; },

    // ---- the governor: fed with the real interval between two frames (ms)
    win: [], winT: 0, good: 0, upWait: 0, sinceUp: null, last: 0, ring: [], ringT: 0,
    tick(dt) {
      if (!(dt > 0) || dt > 250) return; // a hidden tab, a pause, a debugger: not a slow frame
      this.ring.push(dt); this.ringT += dt;
      while (this.ringT > this.WINDOW_MS && this.ring.length > 1) this.ringT -= this.ring.shift();
      if (!this.auto) return;
      this.win.push(dt); this.winT += dt;
      if (this.winT < this.WINDOW_MS) return;
      const avg = this.winT / this.win.length;
      this.win.length = 0; this.winT = 0;
      const w = this.WINDOW_MS / 1000;
      if (avg > this.SLOW_MS) {
        this.good = 0;
        if (this.sinceUp != null && this.sinceUp < this.UP_S) this.upWait = Math.min(120, this.upWait * 2); // a climb that did not hold: wait longer next time
        this.sinceUp = null;
        if (this.level < LEVELS.length - 1) this.set(this.level + 1, `lent (${avg.toFixed(1)} ms)`);
      } else {
        if (this.sinceUp != null) this.sinceUp += w;
        if (avg < this.FAST_MS && this.level > this.start) {
          this.good += w;
          if (this.good >= this.upWait) { this.good = 0; this.sinceUp = 0; this.set(this.level - 1, `fluide (${avg.toFixed(1)} ms)`); }
        } else this.good = 0;
      }
    },
    // average / worst images per second over the last 2 s
    stat() {
      const r = this.ring, n = r.length; if (!n) return { avg: 0, worst: 0 };
      let mx = 0; for (const d of r) if (d > mx) mx = d;
      return { avg: Math.round(1000 / (this.ringT / n)), worst: Math.round(1000 / mx) };
    },
    loop() {
      const f = (t) => {
        if (!document.hidden) this.tick(this.last ? t - this.last : 0);
        this.last = document.hidden ? 0 : t;
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
      document.addEventListener('visibilitychange', () => { this.last = 0; this.win.length = 0; this.winT = 0; });
    },

    // ---- the counter
    meter: null, meterT: 0,
    showMeter(on, keep = true) {
      if (keep) store('ambient.fps', on ? '1' : null);
      if (!on) { if (this.meter) { clearInterval(this.meterT); this.meter.remove(); this.meter = null; } this.label(); return false; }
      if (this.meter) return true;
      const el = (this.meter = document.createElement('div'));
      el.className = 'fps-meter'; el.setAttribute('aria-hidden', 'true'); el.style.pointerEvents = 'none'; // (never in the way of a finger)
      document.body.append(el);
      const up = () => {
        const s = this.stat(), G = AMB.cityGL, gl = G && G.mode === 'gl';
        const V = AMB.visual, d = (V && V.dpr) || this.dpr();
        el.textContent = `${s.avg} i/s · pire ${s.worst}\n${this.name()} · ×${(+d).toFixed(d % 1 ? 1 : 0)} · ${gl ? 'WebGL' : '2D'}`;
        el.classList.toggle('slow', s.avg < 45);
      };
      up(); this.meterT = setInterval(up, 500);
      this.label();
      return true;
    },
    label() { const b = document.getElementById('fpsBtn'); if (b) b.textContent = this.meter ? '📈 Cacher les images/s' : '📈 Afficher les images/s'; },

    // ---- first-time costs, paid once ahead on an idle moment
    warmed: false,
    warm() {
      if (this.warmed) return false;
      this.warmed = true;
      const M = AMB.motion, G = AMB.garden;
      try { if (M && M.particles) { const L = M.particles.layer(), cv = L.querySelector('canvas'), g = cv && cv.getContext('2d'); if (g) { g.fillStyle = '#000'; g.fillRect(0, 0, 1, 1); g.clearRect(0, 0, 2, 2); } } } catch (e) {}
      // the fonts of the parties' word, the tags and the canvas captions: shaped and rasterised once, out of sight
      try {
        const box = document.createElement('div'); box.className = 'q-warm'; box.setAttribute('aria-hidden', 'true');
        box.innerHTML = '<b class="w1">SUPER PARFAIT OUVERT RÉUSSI PRÊT COMBO ×2 ✦</b><b class="w2">JunoJuno 0123456789</b><span class="k-laser"></span><span class="k-ring"></span>';
        document.body.append(box);
        requestAnimationFrame(() => requestAnimationFrame(() => box.remove()));
      } catch (e) {}
      // the Arbre's map: built now (its dialog hidden: no layout), so the first 🕹 Arbre only shows it
      try { if (G && G.renderTree && document.getElementById('treeDlg')) G.renderTree(); if (AMB.discoveries && AMB.discoveries.render) AMB.discoveries.render(); } catch (e) {}
      // canvas captions drawn before the webfont arrived are drawn again with it
      try {
        const F = document.fonts, done = () => { const gv = AMB.gardenVisual; if (gv && gv.labels) gv.labels.clear(); };
        if (F && F.load) Promise.all(['400 30px Monoton', '500 14px "Chakra Petch"', '700 14px "Chakra Petch"'].map((f) => F.load(f).catch(() => null))).then(done, done); else done();
      } catch (e) {}
      return true;
    },

    init() {
      const f = qs.get('q');
      this.start = NAMES.includes(f) ? NAMES.indexOf(f) : this.pick();
      this.level = this.start; this.upWait = this.UP_S;
      // the governor runs in the app itself (not in a test page, not in a frame), unless asked
      const app = /(^|\/)(index\.html)?$/.test(location.pathname);
      this.auto = f === 'auto' || (!NAMES.includes(f) && app && !framed && qs.get('gl') !== '1');
      this.apply();
      this.loop();
      const ready = () => {
        if (qs.get('fps') === '1' || (qs.get('fps') !== '0' && store('ambient.fps') === '1')) this.showMeter(true, qs.get('fps') !== '1');
        const b = document.getElementById('fpsBtn'); if (b) b.addEventListener('click', () => this.showMeter(!this.meter));
        this.label();
        const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 600));
        const go = () => idle(() => this.warm(), { timeout: 2500 });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go); else go();
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
    },
  };
  AMB.quality = Q;
  if (typeof document !== 'undefined') Q.init();
})();
