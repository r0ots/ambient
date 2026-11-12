// « Jardin sonore » : game feel — gain notes, chime tuned to the key, LCD messages. Shake: AMB.juice.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const $ = (s) => document.querySelector(s);
  Object.assign(AMB.garden, {
    // small "+n ✧" notes that float under the LCD, one per gain
    pop(text) {
      let feed = $('#gainFeed');
      if (!feed) { feed = document.createElement('div'); feed.id = 'gainFeed'; feed.className = 'gain-feed'; feed.setAttribute('aria-live', 'polite'); document.body.append(feed); }
      // float just under the LCD (wherever the header layout puts it)
      const lcd = $('#lcd');
      if (lcd) { const r = lcd.getBoundingClientRect(); feed.style.top = `${Math.round(r.bottom + 6)}px`; feed.style.left = `${Math.round(r.left)}px`; feed.style.right = 'auto'; }
      const it = document.createElement('div'); it.className = 'gain'; it.textContent = text;
      feed.append(it);
      while (feed.children.length > 4) feed.firstChild.remove();
      setTimeout(() => it.remove(), 3200);
    },
    // ---- game feedback (G6.2): a chime tuned to the current key, and LCD messages ----
    // kind: 'unlock' (rising arpeggio), 'solve' (two chords), 'small' (one soft note)
    chime(kind = 'unlock') {
      AMB.game.emit('chime', { kind }); // listened to by secrets.js (« Cloche gelée »)
      const E = AMB.engine, ctx = E && E.ctx;
      if (!ctx || ctx.state !== 'running' || !AMB.game.path) return 0;
      const Th = AMB.theory, root = Th.NOTE_NAMES.indexOf(AMB.store.get('global.key'));
      const scale = Th.SCALES[AMB.store.get('global.scale')] || Th.SCALES['Ionien (majeur)'];
      const degs = kind === 'small' ? [4] : kind === 'solve' ? [0, 2, 4, 7, 9, 11] : [0, 2, 4, 7];
      const out = ctx.createGain(); out.gain.value = 0.16;
      out.connect(ctx.destination); // straight to the speakers: never recorded nor frozen
      const t0 = ctx.currentTime + 0.02;
      degs.forEach((dg, i) => {
        const f = Th.mtof(Th.degreeToMidi(dg, root, scale, 5));
        const at = t0 + (kind === 'solve' ? (i < 3 ? 0 : 0.35) + i % 3 * 0.02 : i * 0.09);
        for (const [mul, amp] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) { // bell-ish partials
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f * mul;
          g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp * 0.5, at + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6 / mul);
          o.connect(g); g.connect(out); o.start(at); o.stop(at + 1.7);
        }
      });
      setTimeout(() => out.disconnect(), 3000);
      return degs.length;
    },
    lcd(text, ms = 3500) { AMB.lcdMsg = { text, until: Date.now() + ms }; },

    gainText(d) {
      if (d.reason === 'énigme' && AMB.puzzles && AMB.puzzles.byId[d.id]) return `+${d.n} ✧ énigme résolue : ${AMB.puzzles.byId[d.id].title}`;
      if (d.reason === 'contrat' && AMB.contracts && AMB.contracts.byId[d.id]) return `+${d.n} ✧ contrat rempli : ${AMB.contracts.byId[d.id].title}`;
      if (d.reason === 'découverte' && d.id && d.id.startsWith('a:')) { const a = this.ACTS[d.id.slice(2)]; return `+${d.n} ✧ découverte : ${a ? a[2] : d.id}`; }
      if (d.reason === 'découverte' && d.id && d.id.startsWith('p:')) return `+${d.n} ✧ découverte : ${this.paramLabel(d.id.slice(2))}`;
      return `+${d.n} ✧ ${d.reason || ''}`;
    },
  });

  // ======== G7.4 : AMB.juice — canvas particles, floating text, flash, shake, hitstop ========
  const MAXP = 300;
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const J = (AMB.juice = {
    reduced: !!(mq && mq.matches),
    cv: null, cx: null, raf: 0, last: 0, hold: 0, alive: 0, next: 0, wired: false,
    pool: Array.from({ length: MAXP }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 3, rot: 0, vr: 0, color: '#fff', kind: 'spark', still: false })),
    active() { return !!AMB.game && AMB.game.path === true; }, // free mode: never any effect
    canvas() {
      if (this.cv) return this.cv;
      const c = document.createElement('canvas'); c.id = 'fx'; c.setAttribute('aria-hidden', 'true');
      document.body.append(c); this.cv = c; this.cx = c.getContext('2d'); this.fit();
      window.addEventListener('resize', () => this.fit());
      return c;
    },
    fit() {
      const c = this.cv; if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(window.innerWidth * dpr); c.height = Math.round(window.innerHeight * dpr);
      if (this.cx) this.cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    center(el) { const r = el && el.getBoundingClientRect(); return r && (r.width || r.height) ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; },
    // ---- particles (fixed pool, ring buffer: the oldest is recycled, nothing is spliced) ----
    burst(x, y, o = {}) {
      if (!this.active()) return 0;
      const red = this.reduced, n = red ? 4 : Math.min(o.n == null ? 16 : o.n, MAXP);
      const kind = o.kind || 'spark', color = this.resolve(o.color || 'var(--fx-good)'), speed = o.speed == null ? 180 : o.speed;
      const grav = o.gravity == null ? (kind === 'petal' ? 40 : 260) : o.gravity;
      this.canvas();
      for (let i = 0; i < n; i++) {
        const p = this.pool[this.next]; this.next = (this.next + 1) % MAXP;
        if (!p.on) this.alive++;
        const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.65);
        p.on = true; p.x = x; p.y = y; p.still = red;
        p.vx = red ? 0 : Math.cos(a) * v; p.vy = red ? 0 : Math.sin(a) * v - (kind === 'petal' ? 0 : speed * 0.3);
        p.g = red ? 0 : grav; p.max = p.life = red ? 0.6 : 0.5 + Math.random() * 0.6;
        p.size = kind === 'shard' ? 3 + Math.random() * 4 : 2 + Math.random() * 3;
        p.rot = Math.random() * 6.28; p.vr = red ? 0 : (Math.random() - 0.5) * 10;
        p.color = color; p.kind = kind;
      }
      this.kick();
      return n;
    },
    burstAt(el, o) { const c = this.center(el); return c ? this.burst(c.x, c.y, o) : 0; },
    resolve(c) { // canvas can't read var(--x)
      const m = /^var\((--[\w-]+)\)$/.exec(c || '');
      return m ? (getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || '#ffb347') : c;
    },
    holdLeft() { return this.hold > performance.now(); },
    kick() { // the loop only runs while something is alive
      if (this.raf || (!this.alive && !this.holdLeft())) return;
      this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.tick(t));
    },
    tick(t) {
      this.raf = 0;
      const dt = Math.min((t - this.last) / 1000, 0.1); this.last = t;
      if (!this.holdLeft()) this.step(dt);
      if (this.alive > 0 || this.holdLeft()) this.raf = requestAnimationFrame((u) => this.tick(u));
      else if (this.cx) this.cx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    },
    step(dt) {
      const cx = this.cx; if (!cx) return;
      cx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (const p of this.pool) {
        if (!p.on) continue;
        p.life -= dt;
        if (p.life <= 0) { p.on = false; this.alive--; continue; }
        if (!p.still) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; if (p.kind === 'petal') p.x += Math.sin(p.life * 6 + p.rot) * 20 * dt; }
        cx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
        cx.fillStyle = p.color;
        if (p.kind === 'spark') { cx.beginPath(); cx.arc(p.x, p.y, p.size * 0.6, 0, 6.283); cx.fill(); }
        else { cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); if (p.kind === 'petal') cx.scale(1, 0.5); cx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size); cx.restore(); }
      }
      cx.globalAlpha = 1;
    },
    hitstop(ms = 60) { if (this.reduced || !this.active()) return; this.hold = Math.max(this.hold, performance.now() + ms); this.kick(); },
    // ---- DOM effects ----
    floatText(at, text) {
      if (!this.active()) return null;
      const c = at && at.nodeType ? this.center(at) : at;
      if (!c) return null;
      const e = document.createElement('div');
      e.className = 'fx-float' + (this.reduced ? ' still' : '');
      e.textContent = text; e.style.left = `${Math.round(c.x)}px`; e.style.top = `${Math.round(c.y)}px`;
      document.body.append(e);
      setTimeout(() => e.remove(), this.reduced ? 900 : 1300);
      return e;
    },
    flash(color = 'var(--fx-good)', ms = 160) {
      if (!this.active()) return null;
      const e = document.createElement('div'); e.className = 'fx-flash';
      e.style.background = color; e.style.setProperty('--fx-peak', this.reduced ? 0.1 : 0.28);
      e.style.animationDuration = `${ms}ms`;
      document.body.append(e); setTimeout(() => e.remove(), ms + 60);
      return e;
    },
    shake(el, amp = 6, ms = 320) { // damped translate
      if (!el || this.reduced || !this.active() || !el.animate) return;
      el.animate(Array.from({ length: 9 }, (_, i) => ({ transform: `translateX(${i === 8 ? 0 : (1 - i / 8) * amp * (i % 2 ? -1 : 1)}px)` })), { duration: ms, easing: 'linear' });
    },
    // ---- wiring (path only: every method above is already a no-op in free mode) ----
    wire() {
      const B = AMB.bus; if (!B || this.wired) return; this.wired = true;
      B.on('game:earn', (d) => {
        if (!this.active() || !(d.n > 0)) return;
        const el = $('#lcdShards'); if (el) this.floatText(el, `+${d.n} ✧`);
      });
      B.on('game:unlock', (d) => {
        const n = AMB.tree && AMB.tree.byId[d.id]; if (!this.active() || !n || !n.cost) return;
        const col = AMB.tree.BRANCHES[n.branch].color;
        const c = this.center(document.querySelector(`.tree-node[data-id="${d.id}"]`)) || this.center($('#lcdShards'));
        if (c) this.burst(c.x, c.y, { n: 24, color: col });
        this.flash(col, 140);
      });
      B.on('game:contracts', (d) => {
        if (!this.active()) return;
        this.burstAt(document.querySelector(`.ct-item[data-id="${d.id}"]`) || $('#contracts'), { n: 18, kind: 'petal' });
      });
      B.on('game:puzzles', () => {
        if (!this.active()) return;
        const c = this.center($('#puzzle')) || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        this.burst(c.x, c.y, { n: 70, color: 'var(--fx-combo)', speed: 320, kind: 'shard' });
        this.burst(c.x, c.y, { n: 40, speed: 220, kind: 'petal' });
        this.flash('var(--fx-combo)', 260);
      });
    },
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', (e) => { J.reduced = e.matches; });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => J.wire()); else J.wire();
})();
