// « Pulsations »: 4-track × 16-step soft percussion sequencer with a Euclidean generator.
// Pattern is stored in the store (perc.pattern) as four 16-bit hex masks: "kick.shaker.wood.bell".
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const TRACKS = ['Feutre', 'Shaker', 'Bois', 'Clochette'];
  const N = 16;

  function parse(str) {
    const parts = String(str || '').split('.');
    return TRACKS.map((_, t) => {
      const v = parseInt(parts[t] || '0', 16) || 0;
      return Array.from({ length: N }, (_, s) => !!(v & (1 << (N - 1 - s))));
    });
  }
  function encode(grid) {
    return grid.map((row) => row.reduce((v, on, s) => v | (on ? 1 << (N - 1 - s) : 0), 0).toString(16).padStart(4, '0')).join('.');
  }

  // Bjorklund-style even distribution of k hits over n steps, rotated
  function euclid(k, n, rot = 0) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(Math.floor(((i + rot) * k) / n) !== Math.floor(((i + rot - 1) * k) / n));
    return out;
  }
  function euclidPattern() {
    const r = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    return [euclid(r(2, 5), N, 0), euclid(r(4, 9), N, r(0, 3)), euclid(r(2, 5), N, r(1, 6)), euclid(r(1, 3), N, r(2, 10))];
  }

  let playStep = -1;
  function onStep(step, time, sd) {
    if (!store.get('perc.on')) return;
    const i = step % N;
    playStep = i;
    const grid = parse(store.get('perc.pattern'));
    const prob = store.get('perc.prob');
    const swing = i % 2 === 1 ? store.get('perc.swing') * sd * 0.5 : 0;
    // floating time loosens the grid a lot: percussion becomes scattered "found sounds"
    const loose = AMB.seq.floating ? Math.random() * sd * 1.5 : 0;
    grid.forEach((row, t) => {
      if (!row[i]) return;
      // the kick on the downbeat always plays; everything else follows the "Présence" probability
      if (!(t === 0 && i === 0) && Math.random() > prob) return;
      const vel = (i % 4 === 0 ? 1 : 0.7) * (0.8 + Math.random() * 0.2);
      AMB.layers.perc.hit(t, time + swing + loose, vel);
    });
  }

  const pulses = {
    build(panel) {
      const wrap = document.createElement('div');
      wrap.className = 'pulse-wrap';
      const grid = document.createElement('div');
      grid.className = 'pulse-grid';
      this.cells = TRACKS.map((name, t) => {
        const lab = document.createElement('div'); lab.className = 'pulse-lab'; lab.textContent = name;
        grid.append(lab);
        return Array.from({ length: N }, (_, s) => {
          const b = document.createElement('button');
          b.className = 'pulse-cell' + (s % 4 === 0 ? ' beat' : '');
          b.setAttribute('aria-label', `${name}, pas ${s + 1}`);
          b.addEventListener('click', () => {
            const g = parse(store.get('perc.pattern'));
            g[t][s] = !g[t][s];
            store.set('perc.pattern', encode(g), 'user');
            if (g[t][s] && AMB.engine.ctx && AMB.layers.perc) AMB.layers.perc.hit(t, AMB.engine.ctx.currentTime + 0.01, 0.8);
          });
          grid.append(b);
          return b;
        });
      });
      const tools = document.createElement('div');
      tools.className = 'roll-tools';
      tools.innerHTML = `<button class="btn small" data-p="euclid" title="Rythmes euclidiens : coups répartis régulièrement">⚄ Euclidien</button>
        <button class="btn small" data-p="clear">Effacer</button>
        <button class="btn small" data-p="sparse" title="Garder un coup sur deux">Aérer</button>`;
      tools.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
        let g = parse(store.get('perc.pattern'));
        if (b.dataset.p === 'euclid') { g = euclidPattern(); if (!store.get('perc.on')) store.set('perc.on', true, 'user'); }
        else if (b.dataset.p === 'clear') g = g.map((r) => r.map(() => false));
        else if (b.dataset.p === 'sparse') g = g.map((r) => { let k = 0; return r.map((on) => on && k++ % 2 === 0); });
        store.set('perc.pattern', encode(g), 'user');
      }));
      wrap.append(tools, grid);
      panel.append(wrap);
      store.on((k) => { if (k === 'perc.pattern' || k === 'perc.on') this.render(); });
      const loop = () => { if (playStep !== this.lastStep) this.render(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      this.render();
    },
    render() {
      if (!this.cells) return;
      const g = parse(store.get('perc.pattern'));
      const show = AMB.seq.playing && store.get('perc.on') ? playStep : -1;
      this.cells.forEach((row, t) => row.forEach((b, s) => {
        b.classList.toggle('on', g[t][s]);
        b.classList.toggle('now', s === show);
      }));
      this.lastStep = playStep;
    },
  };

  AMB.pulses = { ...pulses, build: pulses.build.bind(pulses), render: pulses.render.bind(pulses), onStep, parse, encode, euclid, euclidPattern, TRACKS };
})();
