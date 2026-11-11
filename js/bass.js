// Bass step sequencer: 4 rows of chord-relative roles (root, fifth, octave, approach) × 16 steps.
// Always follows the current chord, so it never clashes with the progression.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const T = AMB.theory;
  const ROLES = ['Fondamentale', 'Quinte', 'Octave', 'Approche'];
  const N = 16;

  const parse = (str) => { const parts = String(str || '').split('.'); return ROLES.map((_, r) => Array.from({ length: N }, (_, s) => (parts[r] || '')[s] === '1')); };
  const encode = (g) => g.map((row) => row.map((v) => (v ? '1' : '0')).join('')).join('.');

  function noteFor(role, chordDeg, nextDeg) {
    const seq = AMB.seq, oct = 2 + (parseInt(store.get('bass.octave'), 10) || 0);
    const rootM = T.degreeToMidi(chordDeg, seq.root, seq.scale, oct);
    if (role === 0) return rootM;
    if (role === 1) return T.degreeToMidi(chordDeg + 4, seq.root, seq.scale, oct); // diatonic fifth
    if (role === 2) return rootM + 12;
    // approach: the scale degree right next to the next chord's root (in key, never chromatic);
    // when the chord doesn't change, a neighbour of the current root instead
    if (nextDeg === chordDeg) return T.degreeToMidi(chordDeg + 1, seq.root, seq.scale, oct);
    return T.degreeToMidi(nextDeg + (nextDeg > chordDeg ? -1 : 1), seq.root, seq.scale, oct);
  }

  let playStep = -1;
  function onStep(step, time, sd, chordDeg) {
    if (!store.get('bass.on') || !AMB.layers.bass) return;
    const rel = step - (AMB.seq.origin || 0);
    const i = rel % N; playStep = i;
    const g = parse(store.get('bass.pattern'));
    const seq = AMB.seq, prog = seq.progression && seq.progression();
    // aim at the next chord only during the last bar before it changes
    const barLen = store.get('pad.length');
    const lastBar = rel % (16 * barLen) >= 16 * (barLen - 1);
    const nextDeg = lastBar && prog && prog.length ? prog[((seq.progIdx || 0) + 1) % prog.length] : chordDeg;
    // note length: until the next active step in any row
    let len = 1; while (len < N && !g.some((row) => row[(i + len) % N])) len++;
    g.forEach((row, r) => { if (row[i]) AMB.layers.bass.note(noteFor(r, chordDeg, nextDeg), Math.max(time, time + AMB.util.human().dt * 0.5), len * sd); });
  }

  const PRESETS = {
    'Tenue': ['1000000000000000', '0000000000000000', '0000000000000000', '0000000000000000'],
    'Pulsé': ['1000100010001000', '0000000000000000', '0000000000000000', '0000000000000000'],
    'Quintes': ['1000000010000000', '0000100000001000', '0000000000000000', '0000000000000000'],
    'Marche': ['1000000010000000', '0000100000000000', '0000000000100000', '0000000000000010'],
    'Octaves': ['1000001000100000', '0000000000000000', '0010000010000010', '0000000000000000'],
  };

  const bass = {
    build(panel) {
      const wrap = document.createElement('div');
      const tools = document.createElement('div'); tools.className = 'roll-tools';
      tools.innerHTML = Object.keys(PRESETS).map((k) => `<button class="btn small" data-b="${k}">${k}</button>`).join('') +
        '<button class="btn small" data-b="clear">Effacer</button><span class="roll-hint">Les notes suivent toujours l\'accord en cours</span>';
      tools.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', () => {
        const v = b.dataset.b;
        store.set('bass.pattern', v === 'clear' ? encode(parse('')) : PRESETS[v].join('.'), 'user');
        if (v !== 'clear' && !store.get('bass.on')) store.set('bass.on', true, 'user');
      }));
      const grid = document.createElement('div'); grid.className = 'pulse-grid';
      this.cells = ROLES.map((name, r) => {
        const lab = document.createElement('div'); lab.className = 'pulse-lab'; lab.textContent = name; grid.append(lab);
        return Array.from({ length: N }, (_, s) => {
          const b = document.createElement('button');
          b.className = 'pulse-cell' + (s % 4 === 0 ? ' beat' : '');
          b.setAttribute('aria-label', `Basse ${name}, pas ${s + 1}`);
          b.addEventListener('click', () => {
            const g = parse(store.get('bass.pattern')); g[r][s] = !g[r][s];
            store.set('bass.pattern', encode(g), 'user');
            if (g[r][s] && AMB.engine.ctx && AMB.layers.bass) AMB.layers.bass.note(noteFor(r, AMB.seq.chordDeg, AMB.seq.chordDeg), AMB.engine.ctx.currentTime + 0.01, 0.4);
          });
          grid.append(b); return b;
        });
      });
      wrap.append(tools, grid); panel.append(wrap);
      store.on((k) => { if (k.startsWith('bass.')) this.render(); });
      const loop = () => { if (playStep !== this.last) this.render(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      this.render();
    },
    render() {
      const g = parse(store.get('bass.pattern'));
      const show = AMB.seq.playing && store.get('bass.on') ? playStep : -1;
      this.cells.forEach((row, r) => row.forEach((b, s) => { b.classList.toggle('on', g[r][s]); b.classList.toggle('now', s === show); }));
      this.last = playStep;
    },
  };

  AMB.bassSeq = { build: bass.build.bind(bass), render: bass.render.bind(bass), onStep, parse, encode, noteFor, PRESETS, ROLES };
})();
