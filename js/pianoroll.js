// Piano roll for the step-sequencer voice.
// Rows are scale degrees (always in key), columns are 16th steps. The pattern lives in the
// store as text (`seq.pattern`), so presets, share links, scenes and undo all include it.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const T = AMB.theory;
  const ROWS = 15; // two octaves + 1 of scale degrees

  // ---------- pattern encoding: "step.row.len" in base36, comma separated ----------
  let cacheStr = null, cacheNotes = [];
  function parse(str) {
    if (str === cacheStr) return cacheNotes;
    const notes = [];
    for (const tok of String(str || '').split(',')) {
      const [s, r, l] = tok.split('.').map((x) => parseInt(x, 36));
      if ([s, r, l].every(Number.isFinite) && s >= 0 && s < 64 && r >= 0 && r < ROWS && l >= 1) notes.push({ s, r, l: Math.min(l, 64) });
    }
    cacheStr = str; cacheNotes = notes;
    return notes;
  }
  const encode = (notes) => notes.map((n) => `${n.s.toString(36)}.${n.r.toString(36)}.${n.l.toString(36)}`).join(',');
  const steps = () => parseInt(store.get('seq.steps'), 10) || 32;

  // ---------- playback (called by the sequencer on every 16th) ----------
  function onStep(step, time, sd, chordDeg) {
    if (!store.get('seq.on')) return;
    const len = steps(), i = step % len;
    const notes = parse(store.get('seq.pattern'));
    if (!notes.length) return;
    const seq = AMB.seq, oct = parseInt(store.get('seq.octave'), 10) || 0;
    const swing = i % 2 === 1 ? store.get('seq.swing') * sd * 0.5 : 0;
    for (const n of notes) {
      if (n.s !== i) continue;
      const deg = n.r + (store.get('seq.follow') ? chordDeg : 0);
      const midi = T.degreeToMidi(deg, seq.root, seq.scale, 3 + oct);
      const vel = 0.7 + (i % 4 === 0 ? 0.2 : 0) + Math.random() * 0.1;
      AMB.layers.seq.note(midi, time + swing, vel, true, n.l * sd * 0.95);
    }
    roll.playStep = i;
  }

  // ---------- editor ----------
  const roll = {
    playStep: -1,
    build(panel) {
      const wrap = document.createElement('div');
      wrap.className = 'roll-wrap';
      wrap.innerHTML = `
        <div class="roll-tools">
          <button class="btn small" data-act="clear" title="Effacer toutes les notes">Effacer</button>
          <button class="btn small" data-act="random" title="Motif aléatoire dans la gamme">⚄ Motif</button>
          <button class="btn small" data-act="capture" title="Enregistre ce que joue la Mélodie pendant un tour de motif">● Capturer la mélodie</button>
          <button class="btn small" data-act="shiftL" title="Décaler à gauche">◀</button>
          <button class="btn small" data-act="shiftR" title="Décaler à droite">▶</button>
          <button class="btn small" data-act="up" title="Monter d'un degré">▲</button>
          <button class="btn small" data-act="down" title="Descendre d'un degré">▼</button>
          <span class="roll-hint">Clic : ajouter/retirer · glisser : longueur · Maj+clic : toute la colonne</span>
        </div>
        <div class="roll-scroll"><canvas class="roll"></canvas></div>`;
      panel.append(wrap);
      this.canvas = wrap.querySelector('canvas');
      this.g = this.canvas.getContext('2d');
      wrap.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act, b)));
      this.bindMouse();
      store.on((k) => { if (k.startsWith('seq.') || k === 'global.key' || k === 'global.scale') this.draw(); });
      window.addEventListener('resize', () => this.draw());
      const loop = () => { if (this.playStep !== this.lastDrawn) this.draw(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      this.draw();
    },
    notes() { return parse(store.get('seq.pattern')).slice(); },
    save(notes, source = 'user') { store.set('seq.pattern', encode(notes), source); },
    geom() {
      const n = steps();
      const labelW = 34;
      const w = Math.max(this.canvas.parentElement.clientWidth, labelW + n * 14);
      const rowH = 16;
      return { n, labelW, w, rowH, cw: (w - labelW) / n, h: ROWS * rowH };
    },
    cellAt(e) {
      const r = this.canvas.getBoundingClientRect(), G = this.geom();
      const x = e.clientX - r.left - G.labelW, y = e.clientY - r.top;
      if (x < 0) return null;
      return { s: Math.min(G.n - 1, Math.floor(x / G.cw)), r: ROWS - 1 - Math.min(ROWS - 1, Math.floor(y / G.rowH)) };
    },
    bindMouse() {
      let drag = null;
      this.canvas.addEventListener('pointerdown', (e) => {
        const c = this.cellAt(e); if (!c) return;
        let notes = this.notes();
        if (e.shiftKey) { // toggle a whole column off (or nothing to remove: no-op)
          this.save(notes.filter((n) => !(c.s >= n.s && c.s < n.s + n.l)));
          return;
        }
        const hit = notes.find((n) => n.r === c.r && c.s >= n.s && c.s < n.s + n.l);
        if (hit) { this.save(notes.filter((n) => n !== hit)); return; }
        const note = { s: c.s, r: c.r, l: 1 };
        notes.push(note); this.save(notes);
        drag = { s: c.s, r: c.r };
        this.canvas.setPointerCapture(e.pointerId);
        this.preview(c.r, c.s);
      });
      this.canvas.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const c = this.cellAt(e); if (!c) return;
        const notes = this.notes();
        const n = notes.find((x) => x.s === drag.s && x.r === drag.r);
        if (!n) return;
        const l = Math.max(1, c.s - drag.s + 1);
        if (l !== n.l) { n.l = l; this.save(notes); }
      });
      const end = () => { drag = null; };
      this.canvas.addEventListener('pointerup', end);
      this.canvas.addEventListener('pointercancel', end);
    },
    // audition the note being placed
    preview(row, s) {
      if (!AMB.engine.ctx || !AMB.layers.seq) return;
      const seq = AMB.seq, oct = parseInt(store.get('seq.octave'), 10) || 0;
      const deg = row + (store.get('seq.follow') && seq.playing ? seq.chordDeg : 0);
      AMB.layers.seq.note(T.degreeToMidi(deg, seq.root, seq.scale, 3 + oct), AMB.engine.ctx.currentTime + 0.01, 0.6, true, 0.25);
    },
    act(a, btn) {
      const n = steps();
      let notes = this.notes();
      if (a === 'clear') notes = [];
      else if (a === 'random') notes = randomPattern(n);
      else if (a === 'shiftL' || a === 'shiftR') notes.forEach((x) => { x.s = (x.s + (a === 'shiftR' ? 1 : n - 1)) % n; });
      else if (a === 'up' || a === 'down') notes = notes.map((x) => ({ ...x, r: x.r + (a === 'up' ? 1 : -1) })).filter((x) => x.r >= 0 && x.r < ROWS);
      else if (a === 'capture') return capture(btn);
      this.save(notes);
      if (a === 'random' && !store.get('seq.on')) store.set('seq.on', true, 'user');
    },
    draw() {
      const c = this.canvas; if (!c) return;
      const G = this.geom(), dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(G.w * dpr) || c.height !== Math.round(G.h * dpr)) {
        c.width = Math.round(G.w * dpr); c.height = Math.round(G.h * dpr);
        c.style.width = G.w + 'px'; c.style.height = G.h + 'px';
      }
      const g = this.g; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, G.w, G.h);
      const seq = AMB.seq, n = G.n;
      // rows
      for (let r = 0; r < ROWS; r++) {
        const y = (ROWS - 1 - r) * G.rowH;
        const isRoot = r % seq.scale.length === 0;
        g.fillStyle = isRoot ? '#1d1a30' : r % 2 ? '#14161f' : '#171a25';
        g.fillRect(G.labelW, y, G.w - G.labelW, G.rowH);
        const midi = T.degreeToMidi(r, seq.root, seq.scale, 3);
        g.fillStyle = isRoot ? '#c9b6ff' : '#5c6384';
        g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
        g.fillText(T.NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1), 4, y + G.rowH / 2);
      }
      // beat / bar lines
      for (let s = 0; s <= n; s++) {
        g.fillStyle = s % 16 === 0 ? '#4a5078' : s % 4 === 0 ? '#2c3149' : '#1f2335';
        g.fillRect(G.labelW + s * G.cw, 0, s % 16 === 0 ? 1.5 : 1, G.h);
      }
      // playhead
      const ps = this.playStep;
      if (seq.playing && store.get('seq.on') && ps >= 0 && ps < n) {
        g.fillStyle = 'rgba(255,159,214,0.12)';
        g.fillRect(G.labelW + ps * G.cw, 0, G.cw, G.h);
      }
      // notes
      for (const nt of parse(store.get('seq.pattern'))) {
        if (nt.s >= n) continue;
        const x = G.labelW + nt.s * G.cw + 1, y = (ROWS - 1 - nt.r) * G.rowH + 2;
        const w = Math.min(nt.l, n - nt.s) * G.cw - 2;
        const active = seq.playing && ps >= nt.s && ps < nt.s + nt.l;
        g.fillStyle = active ? '#ffd0ec' : '#ff9fd6';
        g.globalAlpha = store.get('seq.on') ? 1 : 0.45;
        roundRect(g, x, y, w, G.rowH - 4, 3); g.fill();
        g.globalAlpha = 1;
      }
      this.lastDrawn = ps;
    },
  };

  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  // gentle random motif: stepwise contour, more notes on beats, some held notes
  function randomPattern(n) {
    const notes = []; let r = 4 + Math.floor(Math.random() * 4);
    for (let s = 0; s < n;) {
      const p = s % 4 === 0 ? 0.55 : s % 2 === 0 ? 0.25 : 0.12;
      if (Math.random() < p) {
        r = Math.max(0, Math.min(ROWS - 1, r + [-2, -1, -1, 0, 1, 1, 2, 3, -3][Math.floor(Math.random() * 9)]));
        const l = [1, 1, 2, 2, 3, 4, 6][Math.floor(Math.random() * 7)];
        notes.push({ s, r, l: Math.min(l, n - s) });
        s += Math.max(1, Math.min(l, 2));
      } else s++;
    }
    return notes;
  }

  // record the generative melody for one pattern cycle, quantised to steps and scale degrees
  function capture(btn) {
    if (!AMB.seq.playing) { AMB.ui.toast('Lance la lecture pour capturer la mélodie'); return; }
    const n = steps(), sd = AMB.seq.stepDur();
    const startStep = Math.ceil(AMB.seq.step / n) * n; // align to the next pattern start
    const got = [];
    const onNote = (ev) => {
      if (ev.layer !== 'bells') return;
      const rel = Math.round((ev.time - AMB.seq.nextTime) / sd) + AMB.seq.step - startStep;
      if (rel < 0 || rel >= n) return;
      // midi -> nearest scale degree relative to the key (and to the chord if following)
      const seq = AMB.seq, oct = parseInt(store.get('seq.octave'), 10) || 0;
      let best = 0, bd = 99;
      for (let r = 0; r < ROWS; r++) {
        const deg = r + (store.get('seq.follow') ? seq.chordDeg : 0);
        const m = T.degreeToMidi(deg, seq.root, seq.scale, 3 + oct);
        for (const o of [-12, 0, 12]) if (Math.abs(m + o - ev.midi) < bd) { bd = Math.abs(m + o - ev.midi); best = r; }
      }
      if (!got.some((x) => x.s === rel && x.r === best)) got.push({ s: rel, r: best, l: 2 });
    };
    AMB.bus.on('note', onNote);
    btn.disabled = true; btn.textContent = '● Capture…';
    const ms = ((startStep - AMB.seq.step) + n) * sd * 1000 + 400;
    setTimeout(() => {
      AMB.bus.fns.note = AMB.bus.fns.note.filter((f) => f !== onNote);
      btn.disabled = false; btn.textContent = '● Capturer la mélodie';
      if (!got.length) { AMB.ui.toast('Aucune note de Mélodie entendue (est-elle allumée ?)'); return; }
      roll.save(got);
      store.set('seq.on', true, 'user');
      AMB.ui.toast(`${got.length} notes capturées dans le séquenceur`);
    }, ms);
  }

  AMB.pianoRoll = { roll, parse, encode, onStep, randomPattern, ROWS };
})();
