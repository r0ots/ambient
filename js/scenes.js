// Scenes A/B with a morph crossfader (manual or slow automatic ping-pong)
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const LS = 'ambient.scenes.v1';
  const SKIP = new Set(['global.volume']);

  const scenes = {
    A: null, B: null, morph: 0, autoMins: 0, _t0: 0,
    load() {
      try { const o = JSON.parse(localStorage.getItem(LS)) || {}; this.A = o.A || null; this.B = o.B || null; } catch (e) {}
    },
    save() { try { localStorage.setItem(LS, JSON.stringify({ A: this.A, B: this.B })); } catch (e) {} },
    capture(slot) { this[slot] = store.stableSnapshot(); this.save(); this.render(); },
    recall(slot) {
      if (!this[slot]) return this.capture(slot);
      const x0 = this.morph;
      this.setMorph(slot === 'A' ? 0 : 1);
      if (AMB.motion && this.A && this.B) AMB.motion.run(this.slider, x0, this.morph); // S7.4: the morph runs along the fader
    },
    setMorph(x) {
      this.morph = x;
      if (this.slider) this.slider.value = String(Math.round(x * 1000));
      if (!this.A || !this.B) return;
      const out = {};
      for (const key of Object.keys(this.A)) {
        if (SKIP.has(key)) continue;
        const sp = store.spec(key);
        if (!sp || !(key in this.B) || AMB.isAutomated(key)) continue;
        const a = this.A[key], b = this.B[key];
        if (!sp.type || sp.type === 'knob') out[key] = a + (b - a) * x;
        else out[key] = x < 0.5 ? a : b;
      }
      store.setMany(out, 'morph');
      this.render();
    },
    tick() {
      if (!this.autoMins || !this.A || !this.B || !document.body.classList.contains('playing')) return;
      const period = this.autoMins * 60;
      const t = (performance.now() - this._t0) / 1000;
      // smooth ping-pong A -> B -> A, starting from the current position
      const x = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period + this._phase);
      this.setMorph(x);
    },
    render() {
      if (!this.el) return;
      for (const s of ['A', 'B']) {
        const b = this.el.querySelector(`[data-slot="${s}"]`);
        b.classList.toggle('filled', !!this[s]);
        b.classList.toggle('near', !!this[s] && (s === 'A' ? this.morph < 0.5 : this.morph >= 0.5));
      }
      this.el.classList.toggle('ready', !!(this.A && this.B));
      this.el.classList.toggle('auto', !!this.autoMins); // S7.4: the fader shows the blend (--morph) and runs while Auto plays
      this.el.style.setProperty('--morph', this.morph.toFixed(3));
    },
    build(el) {
      this.el = el;
      el.innerHTML = `
        <span class="sc-title">Scènes</span>
        <button class="sc-slot" data-slot="A" title="Clic : rappeler · Maj+clic : mémoriser">A</button>
        <input class="sc-morph" type="range" min="0" max="1000" value="0" aria-label="Morph A ↔ B">
        <button class="sc-slot" data-slot="B" title="Clic : rappeler · Maj+clic : mémoriser">B</button>
        <button class="btn small sc-store" data-store="A">→ A</button>
        <button class="btn small sc-store" data-store="B">→ B</button>
        <label class="sc-auto" title="Morph automatique lent entre A et B">Auto
          <select><option value="0">off</option><option value="1">1 min</option><option value="3">3 min</option><option value="8">8 min</option><option value="20">20 min</option></select>
        </label>`;
      this.slider = el.querySelector('.sc-morph');
      this.slider.addEventListener('input', () => this.setMorph(this.slider.value / 1000));
      el.querySelectorAll('.sc-slot').forEach((b) => b.addEventListener('click', (e) => {
        if (e.shiftKey) this.capture(b.dataset.slot); else this.recall(b.dataset.slot);
      }));
      el.querySelectorAll('.sc-store').forEach((b) => b.addEventListener('click', () => {
        this.capture(b.dataset.store);
        b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 400);
      }));
      el.querySelector('.sc-auto select').addEventListener('change', (e) => {
        this.autoMins = Number(e.target.value);
        this._t0 = performance.now();
        // phase so the cosine starts at the current morph position
        this._phase = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * this.morph)));
        this.render();
      });
      this.load();
      this.render();
      setInterval(() => this.tick(), 150);
    },
  };

  AMB.scenes = scenes;
  document.addEventListener('DOMContentLoaded', () => { const el = document.getElementById('scenes'); if (el) scenes.build(el); });
})();
