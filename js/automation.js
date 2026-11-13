// Drawn automation lane: paint a curve (32 points) that drives one parameter over 4–32 bars.
// Values are absolute (bottom = min, top = max). Writes use source 'lfo' so they don't
// pollute undo history nor the user's "home" values; turning it off restores the home value.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const N = 32;
  const decode = (s) => Array.from({ length: N }, (_, i) => { const v = parseInt((s || '')[i] || 'i', 36); return Number.isFinite(v) ? v / 35 : 0.5; });
  const encode = (arr) => arr.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 35).toString(36)).join('');

  let lastTarget = null;
  function release(target) {
    const homes = AMB.seq && AMB.seq.homes;
    if (target && target !== '—' && homes && homes[target] !== undefined) store.set(target, homes[target], 'lfo');
  }
  store.on((k, v) => {
    if (k === 'auto.on' && !v) release(store.get('auto.target'));
    if (k === 'auto.target') { release(lastTarget); lastTarget = v; }
  });

  let pos = -1;
  function onStep(step) {
    if (!store.get('auto.on')) { pos = -1; return; }
    const target = store.get('auto.target'), sp = store.spec(target);
    if (!sp || target === '—') return;
    lastTarget = target;
    const total = (parseInt(store.get('auto.bars'), 10) || 8) * 16;
    const x = (step % total) / total * N;
    const pts = decode(store.get('auto.curve'));
    const i0 = Math.floor(x) % N, i1 = (i0 + 1) % N, f = x - Math.floor(x);
    const v = pts[i0] + (pts[i1] - pts[i0]) * f;
    store.set(target, sp.min + v * (sp.max - sp.min), 'lfo');
    pos = x / N;
  }

  const lane = {
    build(panel) {
      const wrap = document.createElement('div');
      wrap.className = 'auto-wrap';
      wrap.innerHTML = `<div class="roll-tools">
          <button class="btn small" data-a="ramp" title="Montée progressive">⟋ Montée</button>
          <button class="btn small" data-a="fall" title="Descente progressive">⟍ Descente</button>
          <button class="btn small" data-a="wave" title="Vague douce">∿ Vague</button>
          <button class="btn small" data-a="random" title="Courbe aléatoire lissée">⚄ Hasard</button>
          <button class="btn small" data-a="flat" title="Ligne plate au milieu">— Plat</button>
          <span class="roll-hint">Dessine la courbe à la souris · bas = minimum, haut = maximum</span>
        </div><canvas class="auto-lane"></canvas>`;
      panel.append(wrap);
      this.canvas = wrap.querySelector('canvas');
      wrap.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => this.shape(b.dataset.a)));
      let down = false, buf = null;
      const paint = (e) => {
        const r = this.canvas.getBoundingClientRect();
        const i = Math.max(0, Math.min(N - 1, Math.floor(((e.clientX - r.left) / r.width) * N)));
        const v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
        buf[i] = v;
        if (this.lastI != null) { // fill gaps when moving fast
          const a = Math.min(this.lastI, i), b = Math.max(this.lastI, i);
          for (let k = a + 1; k < b; k++) buf[k] = buf[this.lastI] + (v - buf[this.lastI]) * ((k - this.lastI) / (i - this.lastI));
        }
        this.lastI = i;
        store.set('auto.curve', encode(buf), 'user');
        // S7.2: the pen leaves a glowing trail (and a few sparks) that fades behind it
        const M = AMB.motion;
        if (M && M.on()) {
          const t = performance.now(); this.trail.push({ x: e.clientX - r.left, y: e.clientY - r.top, t });
          if (t - (this.sparkT || 0) > 45) { this.sparkT = t; M.burst({ x: e.clientX, y: e.clientY }, { n: 3, speed: 200, life: 0.35, color: '#c8ff8a' }); }
        }
      };
      this.canvas.addEventListener('pointerdown', (e) => { down = true; buf = decode(store.get('auto.curve')); this.lastI = null; this.canvas.setPointerCapture(e.pointerId); paint(e); if (!store.get('auto.on')) store.set('auto.on', true, 'user'); });
      this.canvas.addEventListener('pointermove', (e) => { if (down) paint(e); });
      const up = () => { down = false; };
      this.canvas.addEventListener('pointerup', up); this.canvas.addEventListener('pointercancel', up);
      store.on((k) => { if (k.startsWith('auto.')) this.draw(); });
      window.addEventListener('resize', () => this.draw());
      const loop = () => { if (pos !== this.lastPos || this.trail.length || this.trace) { this.draw(); this.lastPos = pos; } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      this.draw();
    },
    trail: [], trace: null,
    shape(a) {
      // S7.2: a shape button traces its curve: a bright head runs left to right with a glowing tail
      const M = AMB.motion; if (M && M.on()) this.trace = { t0: performance.now(), d: M.ms('slow') * 1.6 };
      let pts;
      if (a === 'ramp') pts = Array.from({ length: N }, (_, i) => 0.1 + 0.8 * (i / (N - 1)));
      else if (a === 'fall') pts = Array.from({ length: N }, (_, i) => 0.9 - 0.8 * (i / (N - 1)));
      else if (a === 'wave') pts = Array.from({ length: N }, (_, i) => 0.5 - 0.4 * Math.cos((2 * Math.PI * i) / N));
      else if (a === 'flat') pts = Array(N).fill(0.5);
      else { let v = Math.random(); pts = Array.from({ length: N }, () => (v = Math.max(0.05, Math.min(0.95, v + (Math.random() - 0.5) * 0.3)))); }
      store.set('auto.curve', encode(pts), 'user');
      if (a !== 'flat' && !store.get('auto.on')) store.set('auto.on', true, 'user');
    },
    draw() {
      const c = this.canvas; if (!c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = c.parentElement.clientWidth, H = 90;
      if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px'; }
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#0d130c'; g.fillRect(0, 0, W, H);
      const bars = parseInt(store.get('auto.bars'), 10) || 8;
      for (let b = 0; b <= bars; b++) { g.fillStyle = b % 4 === 0 ? '#2f3f2a' : '#1f2a1c'; g.fillRect((b / bars) * W, 0, 1, H); }
      const pts = decode(store.get('auto.curve')), on = store.get('auto.on');
      g.beginPath();
      pts.forEach((v, i) => { const x = ((i + 0.5) / N) * W, y = (1 - v) * (H - 8) + 4; i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.strokeStyle = on ? '#9fd36f' : '#4a6a38'; g.lineWidth = 2; g.stroke();
      g.lineTo(W, H); g.lineTo(0, H); g.closePath();
      g.fillStyle = on ? 'rgba(159,211,111,0.12)' : 'rgba(159,211,111,0.05)'; g.fill();
      if (on && pos >= 0 && AMB.seq.playing) { g.fillStyle = '#ffffffaa'; g.fillRect(pos * W, 0, 1.5, H); }
      this.drawGlow(g, W, H, pts);
    },
    // S7.2: the pen's trail (fades over --m-slow) and a shape being traced (the head runs along the curve)
    drawGlow(g, W, H, pts) {
      const M = AMB.motion, now = performance.now(), life = M ? M.ms('slow') : 0, a = M ? Math.min(2, M.amp()) : 0;
      this.trail = this.trail.filter((p) => now - p.t < life);
      if (!a) { this.trail.length = 0; this.trace = null; return; }
      g.save(); g.lineCap = 'round'; g.shadowColor = '#c8ff8a';
      for (let i = 1; i < this.trail.length; i++) {
        const p = this.trail[i], q = this.trail[i - 1], k = 1 - (now - p.t) / life;
        g.globalAlpha = k; g.strokeStyle = '#eaffd0'; g.lineWidth = 1 + 4 * k * a; g.shadowBlur = 12 * k * a;
        g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(p.x, p.y); g.stroke();
      }
      const tr = this.trace;
      if (tr) {
        const p = (now - tr.t0) / tr.d;
        if (p >= 1) this.trace = null;
        else {
          const X = (i) => ((i + 0.5) / N) * W, Y = (v) => (1 - v) * (H - 8) + 4, head = p * (N - 1), tail = Math.max(0, head - N * 0.35);
          const at = (x) => { const i = Math.min(N - 2, Math.floor(x)); return pts[i] + (pts[i + 1] - pts[i]) * (x - i); };
          g.beginPath(); g.moveTo(X(tail), Y(at(tail)));
          for (let i = Math.ceil(tail); i < head; i++) g.lineTo(X(i), Y(pts[i]));
          g.lineTo(X(head), Y(at(head)));
          g.globalAlpha = 1; g.strokeStyle = '#eaffd0'; g.lineWidth = 3 * a; g.shadowBlur = 14 * a; g.stroke();
          g.fillStyle = '#ffffff'; g.beginPath(); g.arc(X(head), Y(at(head)), 3 + 2 * a, 0, Math.PI * 2); g.fill();
        }
      }
      g.restore();
    },
  };

  AMB.automation = { lane, onStep, decode, encode };
})();
