// « Pulsations »: 4-track × 16-step soft percussion sequencer with a Euclidean generator.
// Pattern is stored in the store (perc.pattern) as four 16-bit hex masks: "kick.shaker.wood.bell".
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const TRACK_NAMES = { 'Feutré': ['Feutre', 'Shaker', 'Bois', 'Clochette'], 'Organique': ['Tambour', 'Bâton de pluie', 'Goutte', 'Kalimba'], 'Métal': ['Impact', 'Ferraille', 'Tôle', 'Cloche de fer'] };
  const TRACKS = TRACK_NAMES['Feutré'];
  const nSteps = () => parseInt(store.get('perc.steps'), 10) || 16;
  const LEVEL_VEL = [0, 0.45, 0.75, 1];

  // grid[track][step] = level 0..3
  function parse(str, n = nSteps()) {
    const parts = String(str || '').split('.');
    return TRACKS.map((_, t) => {
      const p = parts[t] || '';
      if (/^[0-9a-f]{4}$/i.test(p)) { // legacy 16-step bitmask
        const v = parseInt(p, 16);
        return Array.from({ length: n }, (_, s) => ((v & (1 << (15 - (s % 16)))) ? 2 : 0));
      }
      return Array.from({ length: n }, (_, s) => { const c = parseInt(p[s % Math.max(1, p.length)], 10); return p.length && c >= 0 && c <= 3 ? c : 0; });
    });
  }
  const encode = (grid) => grid.map((row) => row.map((v) => (v === true ? 2 : v || 0)).join('')).join('.');

  // Bjorklund-style even distribution of k hits over n steps, rotated
  function euclid(k, n, rot = 0) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(Math.floor(((i + rot) * k) / n) !== Math.floor(((i + rot - 1) * k) / n));
    return out;
  }
  function euclidPattern(n = nSteps()) {
    const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const f = n / 16;
    const rows = [euclid(r(2, 5) * f, n, 0), euclid(r(4, 9) * f, n, r(0, 3)), euclid(r(2, 5) * f, n, r(1, 6)), euclid(r(1, 3) * f, n, r(2, 10))];
    // levels: accents on beats, softer off-beats
    return rows.map((row) => row.map((on, s) => (on ? (s % 4 === 0 ? 3 : s % 2 === 0 ? 2 : 1 + (Math.random() < 0.5 ? 1 : 0)) : 0)));
  }

  const marks = []; // S7.2: [scheduled step, its cell] — the grid lights the step the listener HEARS (seq.heard)
  function onStep(step, time, sd) {
    if (!store.get('perc.on')) return;
    const n = nSteps(), i = (step - (AMB.seq.origin || 0)) % n;
    marks.push([step, i]); if (marks.length > 48) marks.shift();
    const grid = parse(store.get('perc.pattern'), n);
    const prob = store.get('perc.prob');
    const swing = i % 2 === 1 ? Math.min(1, store.get('global.swing') + store.get('perc.swing')) * sd * 0.5 : 0;
    // floating time loosens the grid a lot: percussion becomes scattered "found sounds"
    const loose = AMB.seq.floating ? Math.random() * sd * 1.5 : 0;
    grid.forEach((row, t) => {
      const lvl = row[i];
      if (!lvl) return;
      // the kick on the downbeat always plays; everything else follows the "Présence" probability
      if (!(t === 0 && i === 0) && Math.random() > prob) return;
      const vel = LEVEL_VEL[lvl] * (0.85 + Math.random() * 0.15);
      const hu = AMB.util.human();
      AMB.layers.perc.hit(t, Math.max(time, time + swing + loose + hu.dt), vel * hu.dv);
    });
  }

  const pulses = {
    build(panel) {
      const wrap = document.createElement('div');
      wrap.className = 'pulse-wrap';
      this.grid = document.createElement('div');
      this.grid.className = 'pulse-grid';
      const tools = document.createElement('div');
      tools.className = 'roll-tools';
      tools.innerHTML = `<button class="btn small" data-p="euclid" title="Rythmes euclidiens : coups répartis régulièrement">⚄ Euclidien</button>
        <button class="btn small" data-p="clear">Effacer</button>
        <button class="btn small" data-p="sparse" title="Garder un coup sur deux">Aérer</button>
        <button class="btn small" data-p="double" title="Recopier la 1re mesure sur la 2e (32 pas)">⧉ Doubler</button>
        <span class="roll-hint">Clic : on/off · clic droit ou molette : intensité (doux / normal / accent)</span>`;
      tools.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
        const n = nSteps();
        let g = parse(store.get('perc.pattern'), n);
        if (b.dataset.p === 'euclid') { g = euclidPattern(n); if (!store.get('perc.on')) store.set('perc.on', true, 'user'); }
        else if (b.dataset.p === 'clear') g = g.map((r) => r.map(() => 0));
        else if (b.dataset.p === 'sparse') g = g.map((r) => { let k = 0; return r.map((v) => (v && k++ % 2 === 0 ? v : 0)); });
        else if (b.dataset.p === 'double') { if (n < 32) store.set('perc.steps', '32', 'user'); g = parse(store.get('perc.pattern'), 16).map((r) => [...r, ...r]); }
        store.set('perc.pattern', encode(g), 'user');
      }));
      wrap.append(tools, this.grid);
      panel.append(wrap);
      store.on((k) => {
        if (k === 'perc.steps' || k === 'perc.kit') this.buildCells();
        if (k === 'perc.pattern' || k === 'perc.on') this.render();
      });
      const loop = () => { const v = heardMark(marks, store.get('perc.on')); if (v !== this.lastStep) this.beat(v); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      this.buildCells();
    },
    buildCells() {
      const n = nSteps(), names = TRACK_NAMES[store.get('perc.kit')] || TRACKS;
      this.grid.innerHTML = '';
      this.grid.style.gridTemplateColumns = `var(--pl, 86px) repeat(${n}, minmax(${n > 16 ? '8px' : 'var(--pc, 14px)'}, 1fr))`; // --pl / --pc: narrower on phones
      const setLevel = (t, s, f) => {
        const g = parse(store.get('perc.pattern'), n);
        const old = g[t][s]; g[t][s] = f(old);
        store.set('perc.pattern', encode(g), 'user');
        if (g[t][s] && AMB.engine.ctx && AMB.layers.perc) AMB.layers.perc.hit(t, AMB.engine.ctx.currentTime + 0.01, LEVEL_VEL[g[t][s]]);
      };
      this.cells = names.map((name, t) => {
        const lab = document.createElement('div'); lab.className = 'pulse-lab'; lab.textContent = name;
        this.grid.append(lab);
        return Array.from({ length: n }, (_, s) => {
          const b = document.createElement('button');
          b.className = 'pulse-cell' + (s % 4 === 0 ? ' beat' : '') + (s % 16 === 0 && s ? ' bar' : '');
          b.setAttribute('aria-label', `${name}, pas ${s + 1}`);
          b.addEventListener('click', () => setLevel(t, s, (v) => (v ? 0 : 2)));
          b.addEventListener('contextmenu', (e) => { e.preventDefault(); setLevel(t, s, (v) => (v % 3) + 1); });
          b.addEventListener('wheel', (e) => { e.preventDefault(); setLevel(t, s, (v) => Math.max(0, Math.min(3, v + (e.deltaY < 0 ? 1 : -1)))); }, { passive: false });
          this.grid.append(b);
          return b;
        });
      });
      this.render();
    },
    render() {
      if (!this.cells) return;
      const g = parse(store.get('perc.pattern'), nSteps()), lit = [];
      this.cells.forEach((row, t) => row.forEach((b, s) => {
        const lvl = g[t] ? g[t][s] : 0;
        if (lvl && !b.classList.contains('on') && this.drawn) lit.push([b, s]);
        b.classList.toggle('on', !!lvl);
        if (b.dataset.lvl !== String(lvl)) b.dataset.lvl = lvl;
      }));
      this.drawn = true;
      stepsLit(lit);
      this.beat(heardMark(marks, store.get('perc.on')));
    },
    // the column that plays (only its cells change: no work on the others, every step)
    beat(v) {
      if (!this.cells) return;
      for (const row of this.cells) { const o = row[this.lastStep], b = row[v]; if (o && o !== b) o.classList.remove('now'); if (b) b.classList.add('now'); }
      this.lastStep = v;
    },
  };

  // S7.2 (shared with js/bass.js): the cell heard now (-1: stopped, layer off), from the marks the scheduler left
  function heardMark(m, on) {
    const S = AMB.seq; if (!on || !S.playing || !m.length) return -1;
    const h = S.heard(); let v = -1;
    for (let k = m.length - 1; k >= 0; k--) if (m[k][0] <= h) { v = m[k][1]; break; }
    return v;
  }
  // steps switched on: one pops (sparks); many (a pattern, a preset, a section) light up in a wave, column by column
  function stepsLit(lit) {
    const M = AMB.motion; if (!M || !lit.length || !M.on()) return;
    if (!lit[0][0].offsetParent) return;
    if (lit.length === 1) { const [b] = lit[0]; M.fx(b, (a) => [{ scale: 1 + 0.9 * a, filter: 'brightness(2.4)' }, { scale: 1, filter: 'brightness(1)' }], { dur: 'slow', ease: 'bounce' }); M.burst(b, { n: 8, speed: 240, life: 0.35 }); return; }
    for (const [b, s] of lit) M.fx(b, (a) => [{ scale: 0.2, opacity: 0 }, { scale: 1 + 0.35 * a, opacity: 1, offset: 0.5 }, { scale: 1, opacity: 1 }], { dur: 'med', ease: 'spring', delay: M.ms(M.MS.stagger) * 0.5 * s });
  }
  AMB.gridMotion = { heardMark, stepsLit };

  AMB.pulses = { ...pulses, build: pulses.build.bind(pulses), render: pulses.render.bind(pulses), buildCells: pulses.buildCells.bind(pulses), onStep, parse, encode, euclid, euclidPattern, TRACKS };
})();
