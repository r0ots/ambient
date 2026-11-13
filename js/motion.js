// S7.1 Motion: ONE system for the movement of every piece of interface (80s arcade, goofy but quick).
// - CSS tokens on :root (css/style.css « S7.1 Mouvement »): durations --m-fast / --m-med / --m-slow / --m-stagger
//   (= base × --m-t), curves --m-spring (overshoot) / --m-snap / --m-bounce / --m-out / --m-in (sucked away), amplitude
//   --m-amp (distances, squash, overshoot sizes) and --juice. This module writes --juice, --m-t and --m-amp on <html>:
//   JUICE = the one knob of all the juice (0 = still, 1 = goofy default, 2 = way too much; garden-visual reads it too);
//   reduced motion (or JUICE 0) → --m-t 0 (every duration 0) and --m-amp 0 (no squash, no overshoot).
// - Utilities (no dependency; Web Animations or one class; never a listener per element, nothing left behind):
//   stagger(els) entry cascade · flip(container, mutate) reorder · roll(el, value) a value that rolls in ·
//   pop(el, kind) one-shot animation class · glitch(el) neon glitch · slide(group) the lit key slides to the active one ·
//   swap(dir) a view change (wipe + cascade of the sections that come in) · burst(el | {x, y}, o) neon sparks out of a
//   control · turn(knob, dv, deg) a knob's notches (squash, glow, sparks off the needle) · particles = the app's ONE
//   particle emitter (a click-through canvas; the parties' confetti of garden.FX are the same object).
// - Base controls wired here once, everywhere (Parcours and free mode; sound and behaviour untouched): hover = lift,
//   glow, shadow and a 3D lean towards the pointer (.m-tilt); press = squash, then a springy release that sparks; menus
//   (<details>) unfold in a cascade; selects glitch and spark on change. The state always changes at once: the motion
//   only dresses it, nothing waits for it.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const root = document.documentElement;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  // the same numbers as the css tokens (tests/motion.html checks they agree)
  const MS = { fast: 110, med: 220, slow: 420, stagger: 35 };
  const EASE = {
    spring: 'cubic-bezier(.34, 1.56, .64, 1)', // overshoots, then settles: entries, needles, lit keys
    snap: 'cubic-bezier(.2, 0, 0, 1)', // quick and dry: presses, beats
    bounce: 'linear(0, .55 14%, 1.12 30%, .94 46%, 1.03 62%, .99 80%, 1)', // a ball that lands: toasts, pops
    out: 'cubic-bezier(.16, 1, .3, 1)', // decelerates: fades, hovers
    in: 'cubic-bezier(.55, 0, .85, .25)', // accelerates away: exits (« aspirée »)
  };
  // one-shot classes (pop): kind → duration token; the class is `m-<kind>` (css), removed by a timer after it
  const POP = { pop: 'med', glitch: 'med', type: 'med', nudge: 'med', led: 'med' };
  // every interactive control, by default (later waves add their own zones on top of this generic layer)
  const PRESS = 'button, summary, [role=button], .knob, .ctl.sel, .pad, select:not(.ctl.sel select), input[type=range], label.btn';
  const TILT = 'button:not(.pad):not(.modal-x):not(.tree-node):not(.coin):not(.welcome-choice), summary, [role=button]:not(.knob), select, label.btn'; // (not the pads: a playing surface; knobs: css)
  const SPARKY = '.tog, .chip, .mode-btn, .pad, .song-chip, .chord-slot, .pulse-cell'; // more sparks when let go
  const sparkColor = (el) => { try { return (getComputedStyle(el).getPropertyValue('--c') || '').trim() || null; } catch (e) { return null; } };
  const notch = new WeakMap(); // knob → travel since its last notch
  const timers = new WeakMap(); // el → Map(class → timeout)
  const rolls = new WeakMap(); // el → its running roll animation
  let live = 0; // pending one-shot classes (tests: back to 0 = nothing left behind)

  const M = {
    MS, EASE, POP, PRESS,
    JUICE: 1,
    forced: null, // tests: true / false forces reduced motion, null = the system's setting
    get reduced() { return this.forced != null ? !!this.forced : !!(mq && mq.matches); },
    t() { return this.reduced || !(this.JUICE > 0) ? 0 : 1; }, // time factor (0 = every motion off)
    amp() { return this.reduced ? 0 : Math.max(0, this.JUICE); }, // amplitude
    on() { return this.t() > 0; },
    ms(k) { return (typeof k === 'number' ? k : MS[k] || 0) * this.t(); },
    live: () => live,
    // writes the knob to the css (called at load, by set(), and when the system's reduced motion changes)
    apply() {
      root.style.setProperty('--juice', String(Math.max(0, +this.JUICE || 0)));
      root.style.setProperty('--m-t', String(this.t()));
      root.style.setProperty('--m-amp', String(this.amp()));
      root.classList.toggle('m-still', !this.on());
    },
    set(o = {}) {
      if (o.juice != null) this.JUICE = Math.max(0, +o.juice || 0);
      if ('reduced' in o) this.forced = o.reduced;
      this.apply();
      return this;
    },

    // ---- one-shot class: added now, removed after its duration (restart = remove, reflow, add). `kind` = a POP kind
    // (class m-<kind>, duration from its token, off when motion is off) or any class with {ms} (garden's party classes;
    // {force: true} plays it even when motion is off — the caller already decided). Returns true if it plays.
    pop(el, kind, o = {}) {
      if (!el || !el.classList) return false;
      const tok = POP[kind], cls = tok ? 'm-' + kind : kind;
      if (!o.force && !this.on()) return false;
      const ms = o.ms != null ? o.ms : this.ms(tok || 'med') + 60;
      let m = timers.get(el);
      if (!m) timers.set(el, (m = new Map()));
      if (m.has(cls)) { clearTimeout(m.get(cls)); live--; }
      if (el.classList.contains(cls)) { // restart: rewind its running animations (no layout), else remove + reflow + add
        const run = el.getAnimations ? el.getAnimations({ subtree: true }).filter((a) => a.effect && a.effect.target === el) : [];
        if (run.length) run.forEach((a) => { a.currentTime = 0; }); else { el.classList.remove(cls); void el.offsetWidth; }
      }
      el.classList.add(cls); live++;
      m.set(cls, setTimeout(() => { el.classList.remove(cls); m.delete(cls); live--; }, ms));
      return true;
    },
    glitch(el) { return this.pop(el, 'glitch'); },
    // stops a one-shot class now (shot pages freeze a moment instead)
    unpop(el, kind) {
      const cls = POP[kind] ? 'm-' + kind : kind, m = el && timers.get(el);
      if (m && m.has(cls)) { clearTimeout(m.get(cls)); m.delete(cls); live--; }
      if (el) el.classList.remove(cls);
    },

    // ---- entry cascade: each element comes in (fade, rise, small overshoot), one after the other. Elements not shown
    // (display: none) or below the window come in without motion. Web Animations, fill backwards: nothing stays after.
    stagger(els, o = {}) {
      if (!this.on() || !els) return [];
      const a = this.amp(), vh = window.innerHeight || 800, out = [];
      const dx = (o.x || 0) * a, dy = (o.y != null ? o.y : 14) * a, s0 = 1 - 0.05 * Math.min(a, 2);
      let i = 0;
      for (const el of els) {
        if (!el || !el.animate || !el.isConnected) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || r.top > vh) continue;
        out.push(el.animate([{ opacity: 0, translate: `${dx}px ${dy}px`, scale: s0 }, { opacity: 1, translate: '0 0', scale: 1 }],
          { duration: this.ms(o.dur || 'med'), delay: this.ms(MS.stagger) * Math.min(i++, o.max || 8) + (o.delay || 0), easing: EASE.spring, fill: 'backwards' }));
      }
      return out;
    },

    // ---- FLIP: mutate() re-orders / adds / removes the container's children; the ones that stayed glide from their
    // old place, the new ones pop in. `o.key(el)` matches children across a re-render (default: the same element).
    flip(container, mutate, o = {}) {
      const key = o.key || ((el) => el), before = new Map();
      const on = container && this.on();
      if (on) for (const el of container.children) before.set(key(el), el.getBoundingClientRect());
      mutate();
      if (!on) return [];
      const out = [], d = this.ms('med');
      for (const el of container.children) {
        if (!el.animate) continue;
        const r = el.getBoundingClientRect(), b = before.get(key(el));
        if (b) {
          const dx = b.left - r.left, dy = b.top - r.top;
          if (Math.abs(dx) + Math.abs(dy) >= 1) out.push(el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: d, easing: EASE.spring }));
        } else out.push(el.animate([{ opacity: 0, scale: 1 - 0.4 * Math.min(1, this.amp()) }, { opacity: 1, scale: 1 }], { duration: d, easing: EASE.spring }));
      }
      return out;
    },

    // ---- a value that rolls: the text is written at once (readers see the new value), it comes in from below when it
    // grows, from above when it falls (a drum). While one runs (a knob being turned) the next value just replaces the text.
    // The element must not be display: inline (a transform needs a box). Returns true if it rolled.
    roll(el, value) {
      if (!el) return false;
      const s = String(value), old = el.textContent;
      if (s === old) return false;
      el.textContent = s;
      if (old === '' || !this.on() || !el.animate) return false;
      const cur = rolls.get(el);
      if (cur && cur.playState === 'running') return false;
      const a = parseFloat(old), b = parseFloat(s), dir = isFinite(a) && isFinite(b) && b < a ? -1 : 1;
      const an = el.animate([{ translate: `0 ${0.55 * dir * Math.min(1.5, this.amp())}em`, opacity: 0.25 }, { translate: '0 0', opacity: 1 }],
        { duration: this.ms('fast'), easing: EASE.spring });
      rolls.set(el, an);
      return true;
    },

    // ---- a group of keys where one is active (Écouter / Sculpter / Composer…): a lit key behind them slides to the
    // active one with a spring (transform only). The group gets `m-slide` (its keys go transparent over the lit key).
    slide(group, sel = '.on') {
      if (!group) return null;
      let ind = group.querySelector(':scope > .m-ind'), fresh = false;
      if (!ind) {
        ind = document.createElement('i'); ind.className = 'm-ind'; ind.setAttribute('aria-hidden', 'true');
        group.prepend(ind); group._mSel = sel; fresh = true;
        if (sizes) sizes.observe(group); // shown later (a locked group), resized: re-placed
      }
      const act = group.querySelector(':scope > ' + sel);
      // placed only when the active key has a size; until then the keys keep their own lit look (css .m-placed)
      const ok = !!(act && act.offsetWidth);
      if (ok) {
        if (fresh || !group.classList.contains('m-placed')) ind.style.transition = 'none'; // (no glide from nowhere)
        ind.style.transform = `translateX(${act.offsetLeft}px) scaleX(${act.offsetWidth / 100})`;
        if (ind.style.transition) { void ind.offsetWidth; ind.style.transition = ''; }
      }
      group.classList.toggle('m-placed', ok);
      return ind;
    },

    // ---- a view change (Écouter ↔ Sculpter ↔ Composer): a neon scan sweeps the window in the direction of travel
    // (dir > 0 = to the right), the sections that come in cascade behind it. The sections are shown at once.
    SECTIONS: '.app > .row > *, .app > .scenes',
    swap(dir = 1) {
      if (!this.on()) return [];
      let w = document.querySelector('.m-wipe');
      if (!w) { w = document.createElement('div'); w.className = 'm-wipe'; w.setAttribute('aria-hidden', 'true'); document.body.append(w); }
      const vw = window.innerWidth || 1000, from = dir < 0 ? vw : -0.4 * vw, to = dir < 0 ? -0.4 * vw : vw;
      const out = [w.animate([{ translate: `${from}px 0`, opacity: 1 }, { translate: `${to}px 0`, opacity: 1 }], { duration: this.ms('med') + 60, easing: EASE.snap })];
      const els = [...document.querySelectorAll(this.SECTIONS)];
      return out.concat(this.stagger(els, { x: 22 * Math.sign(dir || 1), y: 10, delay: this.ms(MS.stagger) }));
    },

    // ---- particles: ONE emitter for the whole app (the parties' confetti of garden.FX too: garden.confetti = this).
    // A fixed canvas over everything (#fxLayer, pointer-events: none, hidden at rest), drawn only while something flies,
    // MAX alive at most. burst(n, src, o): n particles from an element (src) or a point (o.x, o.y); default = a party's
    // confetti (flat spinning squares, gravity); o = {x, y, angle, spread, speed, life, size, G, color}.
    particles: {
      COLORS: ['#ffb347', '#fff3c4', '#ff4fa0', '#4fe0ff', '#8fe3a0'], MAX: 700, G: 1500,
      bins: null, n: 0, raf: 0, last: 0, times: [],
      layer() {
        let L = document.getElementById('fxLayer');
        if (!L) { L = document.createElement('div'); L.id = 'fxLayer'; L.className = 'fx-layer'; L.setAttribute('aria-hidden', 'true'); L.innerHTML = '<canvas></canvas>'; document.body.append(L); }
        return L;
      },
      bin(c) {
        let i = this.COLORS.indexOf(c);
        if (i < 0) { if (this.COLORS.length >= 24) return 0; i = this.COLORS.push(c) - 1; }
        while (this.bins.length < this.COLORS.length) this.bins.push([]);
        return i;
      },
      burst(n, src, o = {}) {
        const L = this.layer(), cv = L.querySelector('canvas'), W = innerWidth, H = innerHeight;
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        if (!this.bins) this.bins = this.COLORS.map(() => []);
        const r = o.x != null ? { left: o.x, top: o.y, width: 0, height: 0 } : src && src.getBoundingClientRect ? src.getBoundingClientRect() : { left: W / 2, top: H / 2, width: 0, height: 0 };
        const spark = o.speed != null, ci = o.color ? this.bin(o.color) : -1;
        let k = 0;
        for (let i = 0; i < n && this.n < this.MAX; i++, this.n++, k++) {
          const x = r.left + Math.random() * r.width, y = r.top + Math.random() * r.height * (spark ? 1 : 0.5);
          const an = (o.angle != null ? o.angle : -Math.PI / 2) + (Math.random() - 0.5) * (o.spread != null ? o.spread : 2.2);
          const sp = spark ? o.speed * (0.5 + Math.random()) : 380 + Math.random() * 780;
          const s = o.size || 3 + ((Math.random() * 4) | 0);
          this.bins[ci >= 0 && (spark || i % 3) ? ci : i % 5].push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, s, w: spark ? 0 : 4 + Math.random() * 14, t: 0,
            life: o.life != null ? o.life * (0.6 + 0.6 * Math.random()) : 1.3 + Math.random() * 0.9, g: o.G != null ? o.G : this.G });
        }
        L.hidden = false; cv.hidden = false;
        if (!this.raf && k) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.frame(t)); }
        return k;
      },
      frame(ts) {
        const t0 = performance.now(), dt = Math.min(0.05, Math.max(0, (ts - this.last) / 1000)); this.last = ts;
        const cv = document.querySelector('#fxLayer canvas'), g = cv && cv.getContext('2d'); if (!g) { this.raf = 0; return; }
        g.clearRect(0, 0, cv.width, cv.height);
        const drag = Math.pow(0.12, dt); let n = 0;
        this.bins.forEach((b, c) => {
          g.fillStyle = this.COLORS[c];
          for (let i = b.length - 1; i >= 0; i--) {
            const p = b[i]; p.t += dt;
            if (p.t > p.life || p.y > cv.height + 20) { b[i] = b[b.length - 1]; b.pop(); continue; }
            p.vx *= drag; p.vy = p.vy * drag + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
            const w = p.w ? Math.max(1, Math.round(p.s * Math.abs(Math.cos(p.w * p.t)))) : p.s; // a flat square that spins (sparks: plain pixels)
            g.globalAlpha = p.t > p.life - 0.3 ? Math.max(0, (p.life - p.t) / 0.3) : 1;
            g.fillRect(Math.round(p.x), Math.round(p.y), w, p.s);
            n++;
          }
        });
        g.globalAlpha = 1; this.n = n;
        this.times.push(performance.now() - t0); if (this.times.length > 600) this.times.shift();
        if (n) this.raf = requestAnimationFrame((t) => this.frame(t)); else { this.raf = 0; cv.hidden = true; this.idle(); }
      },
      // a window opens (Arbre, carnet, aide, carte « Ouvrir »): what is left of an earlier party goes, at once
      clear() {
        const L = document.getElementById('fxLayer'); if (!L) return;
        if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; this.n = 0;
        if (this.bins) this.bins.forEach((b) => { b.length = 0; });
        const cv = L.querySelector('canvas'); if (cv) { const g = cv.getContext('2d'); if (g) g.clearRect(0, 0, cv.width, cv.height); cv.hidden = true; }
        L.querySelectorAll('.fx-pop').forEach((p) => p.remove());
        L.hidden = true;
      },
      idle() { const L = document.getElementById('fxLayer'); if (L && !this.raf && !L.querySelector('.fx-pop')) L.hidden = true; }, // nothing left on the page
      stats() { const a = this.times.slice().sort((x, y) => x - y), k = a.length; return { frames: k, avg: k ? a.reduce((s, v) => s + v, 0) / k : 0, p95: k ? a[Math.max(0, Math.ceil(k * 0.95) - 1)] : 0, max: k ? a[k - 1] : 0 }; },
    },
    // interface sparks: neon pixels out of a control, n × JUICE (40 at most), off when motion is off. `at` = an element
    // (its centre) or {x, y}; o = {n, angle, spread, speed, life, color (default: the element's --c)}. Returns the count.
    burst(at, o = {}) {
      if (!this.on() || !at) return 0;
      let x = at.x, y = at.y;
      const el = at.getBoundingClientRect ? at : null;
      if (el) { const r = el.getBoundingClientRect(); if (!r.width) return 0; x = r.left + r.width / 2; y = r.top + r.height / 2; }
      const n = Math.min(40, Math.round((o.n || 8) * this.JUICE));
      if (!n) return 0;
      const color = o.color || (el && sparkColor(el)) || '#ffb347';
      return this.particles.burst(n, null, { x, y, angle: o.angle != null ? o.angle : -Math.PI / 2, spread: o.spread != null ? o.spread : Math.PI * 1.6,
        speed: (o.speed || 260) * Math.min(1.6, 0.6 + 0.4 * this.JUICE), life: o.life || 0.45, size: o.size || 2 + (Math.random() < 0.3 ? 1 : 0), G: o.G != null ? o.G : 900, color });
    },
    // a knob turned by hand: dv = the change (fraction of its course), deg = the needle's new angle. Each notch (1/40 of
    // the course) gives a tiny squash and sparks off the needle's tip, along the turn, more when it turns faster.
    NOTCH: 1 / 40,
    turn(el, dv, deg) {
      if (!el || !dv || !this.on()) return 0;
      this.pop(el, 'm-turning', { ms: 450 });
      const acc = (notch.get(el) || 0) + Math.abs(dv);
      if (acc < this.NOTCH) { notch.set(el, acc); return 0; }
      notch.set(el, acc % this.NOTCH);
      this.pop(el, 'm-tick', { ms: this.ms('fast') + 30 });
      const svg = el.querySelector('svg'), r = svg ? svg.getBoundingClientRect() : null;
      if (!r || !r.width) return 0;
      const a = ((deg - 90) * Math.PI) / 180, R = (r.width * 24) / 60;
      const x = r.left + r.width / 2 + Math.cos(a) * R, y = r.top + r.height / 2 + Math.sin(a) * R;
      const along = a + (dv > 0 ? Math.PI / 2 : -Math.PI / 2); // tangent, the way it turns
      return this.burst({ x, y }, { n: Math.min(12, 2 + Math.floor(acc / this.NOTCH) * 2), angle: along, spread: 1.1, speed: 220, life: 0.4, color: sparkColor(el) });
    },

    // ---- base controls, once (global listeners only)
    installed: false,
    init() {
      if (this.installed) return; this.installed = true;
      this.apply();
      if (mq && mq.addEventListener) mq.addEventListener('change', () => this.apply());
      // press: sinks (squash) while held, springs back when let go (css .is-pressed / .is-released)
      let held = null, safety = 0;
      const up = () => {
        clearTimeout(safety); if (!held) return;
        const e = held; held = null;
        e.classList.remove('is-pressed');
        this.pop(e, 'is-released', { ms: this.ms('slow') + 40 });
        if (!e.classList.contains('knob') && e.isConnected) this.burst(e, { n: e.matches(SPARKY) ? 12 : 6 }); // let go: it sparks (toggles, chips: more)
      };
      document.addEventListener('pointerdown', (ev) => {
        const t = ev.target && ev.target.closest && ev.target.closest(PRESS);
        if (!t || t.disabled) return;
        up(); held = t; this.unpop(t, 'is-released'); t.classList.add('is-pressed');
        if (!t.classList.contains('knob')) safety = setTimeout(up, 1500); // a native list (select) may swallow the release
      }, true);
      ['pointerup', 'pointercancel'].forEach((k) => window.addEventListener(k, up, true));
      window.addEventListener('blur', (e) => { if (e.target === window) up(); });
      // menus: a <details> that opens unfolds, its rows cascade in (toggle does not bubble: caught on the way down)
      document.addEventListener('toggle', (e) => {
        const d = e.target;
        if (!d || d.tagName !== 'DETAILS' || !d.open) return;
        const menu = d.querySelector(':scope > .menu');
        if (menu && this.pop(menu, 'pop')) this.stagger(menu.children, { y: -8 });
      }, true);
      // a select changed by hand: its LCD glitches once
      document.addEventListener('change', (e) => { if (e.target && e.target.tagName === 'SELECT' && this.glitch(e.target)) this.burst(e.target, { n: 8 }); }, true);
      // hover (a fine pointer): the control under it lifts in 3D and leans towards the pointer (css .m-tilt, --m-rx /
      // --m-ry), one element at a time, at most once per frame
      let tilted = null, pend = null, raf = 0;
      const untilt = () => { if (tilted) { tilted.classList.remove('m-tilt'); tilted.style.removeProperty('--m-rx'); tilted.style.removeProperty('--m-ry'); tilted = null; } };
      const lean = () => {
        raf = 0; const e = pend; pend = null; if (!e) return;
        const t = this.on() && e.target && e.target.closest ? e.target.closest(TILT) : null;
        if (t !== tilted) { untilt(); if (t && !t.disabled) { tilted = t; t.classList.add('m-tilt'); } }
        if (!tilted) return;
        const r = tilted.getBoundingClientRect(), A = 10 * Math.min(1.5, this.amp());
        if (!r.width || !r.height) return;
        tilted.style.setProperty('--m-rx', (-((e.clientY - r.top) / r.height - 0.5) * A).toFixed(1) + 'deg');
        tilted.style.setProperty('--m-ry', (((e.clientX - r.left) / r.width - 0.5) * A).toFixed(1) + 'deg');
      };
      this.lean = (e) => { pend = e; lean(); }; // (tests, shot pages: a hover without a mouse)
      document.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return; pend = e; if (!raf) raf = requestAnimationFrame(lean); }, { passive: true });
      document.documentElement.addEventListener('pointerleave', untilt);
      window.addEventListener('blur', untilt);
    },
  };
  // the slide groups are re-placed when their size changes (one observer for all)
  const sizes = typeof ResizeObserver === 'function' ? new ResizeObserver((es) => { for (const e of es) M.slide(e.target, e.target._mSel); }) : null;
  AMB.motion = M;
  M.apply();
  M.init(); // (global listeners on document / window: no need to wait for the page)
})();
