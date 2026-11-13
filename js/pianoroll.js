// Piano roll for the step-sequencer voice.
// Rows are scale degrees, columns are 16th steps. A note off the scale keeps its row (the degree below) plus a
// sharp of 1–3 semitones (`a`, drawn ♯). The pattern lives in the store as text (`seq.pattern`), so presets,
// share links, scenes and undo all include it.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const T = AMB.theory;
  const ROWS = 15; // two octaves + 1 of scale degrees

  // ---------- pattern encoding: "step.row.len[.vel[.prob[.sharp]]]" in base36, comma separated ----------
  let cacheStr = null, cacheNotes = [];
  function parse(str) {
    if (str === cacheStr) return cacheNotes;
    const notes = [];
    for (const tok of String(str || '').split(',')) {
      const [s, r, l, v, p, a] = tok.split('.').map((x) => parseInt(x, 36));
      if ([s, r, l].every(Number.isFinite) && s >= 0 && s < 64 && r >= 0 && r < ROWS && l >= 1) {
        // v: velocity 1..9 (default 7), p: probability in tenths 1..10 (default 10), a: sharp in semitones (0..3)
        const n = { s, r, l: Math.min(l, 64), v: Number.isFinite(v) ? Math.max(1, Math.min(9, v)) : 7, p: Number.isFinite(p) ? Math.max(1, Math.min(10, p)) : 10 };
        if (a > 0) n.a = Math.min(3, a);
        notes.push(n);
      }
    }
    cacheStr = str; cacheNotes = notes;
    return notes;
  }
  const encode = (notes) => notes.map((n) => {
    let t = `${n.s.toString(36)}.${n.r.toString(36)}.${n.l.toString(36)}`;
    const v = n.v || 7, p = n.p || 10, a = n.a || 0;
    if (v !== 7 || p !== 10 || a) t += `.${v.toString(36)}`;
    if (p !== 10 || a) t += `.${p.toString(36)}`;
    if (a) t += `.${a.toString(36)}`;
    return t;
  }).join(',');
  const steps = () => parseInt(store.get('seq.steps'), 10) || 32;
  const SLOTKEY = { A: 'seq.pattern', B: 'seq.patB', C: 'seq.patC', D: 'seq.patD' };
  const editKey = () => SLOTKEY[store.get('seq.slot')] || 'seq.pattern';
  const chainList = () => String(store.get('seq.chain') || '').toUpperCase().split(/[^ABCD]+|(?=[ABCD])/).filter((x) => SLOTKEY[x]);
  // which slot plays during the pattern cycle that contains `step`
  let latched = null;
  const resetLatch = () => { latched = null; };
  function slotAt(step) {
    const chain = chainList();
    if (!chain.length) return store.get('seq.slot');
    return chain[Math.floor((step - (AMB.seq.origin || 0)) / steps()) % chain.length];
  }

  // ---------- playback (called by the sequencer on every 16th) ----------
  // ---------- arpeggiator: walks the current chord's tones over 1–3 octaves ----------
  const ARP_RATE = { '1/16': 1, '1/8': 2, '1/8.': 3, '1/4': 4 };
  let arpIdx = 0, arpUp = true;
  function arpStep(step, time, sd, chordDeg) {
    const every = ARP_RATE[store.get('seq.arpRate')] || 2;
    if ((step - (AMB.seq.origin || 0)) % every) return;
    const seq = AMB.seq, oct = parseInt(store.get('seq.octave'), 10) || 0;
    const span = parseInt(store.get('seq.arpOct'), 10) || 2;
    const n = seq.scale.length;
    const tones = [];
    for (let o = 0; o < span; o++) for (const d of T.chordDegrees(chordDeg, 4, seq.scale)) tones.push(T.degreeToMidi(d + o * n, seq.root, seq.scale, 3 + oct));
    const uniq = [...new Set(tones)].sort((a, b) => a - b);
    if (!uniq.length) return;
    const dir = store.get('seq.arpDir');
    let idx;
    if (dir === 'Aléatoire') idx = Math.floor(Math.random() * uniq.length);
    else if (dir === 'Descend') idx = uniq.length - 1 - (arpIdx++ % uniq.length);
    else if (dir === 'Aller-retour') {
      if (arpIdx >= uniq.length - 1) arpUp = false; else if (arpIdx <= 0) arpUp = true;
      idx = Math.max(0, Math.min(uniq.length - 1, arpIdx)); arpIdx += arpUp ? 1 : -1;
    } else idx = arpIdx++ % uniq.length;
    const swing = (step / every) % 2 === 1 ? Math.min(1, store.get('global.swing') + store.get('seq.swing')) * sd * every * 0.5 : 0;
    const vel = 0.55 + (step % 16 === 0 ? 0.3 : step % 4 === 0 ? 0.15 : 0) + Math.random() * 0.08;
    const hu = AMB.util.human();
    AMB.layers.seq.note(uniq[idx], Math.max(time, time + swing + hu.dt), vel * hu.dv, true, every * sd * 0.9);
  }

  // soft metronome click straight into the dry bus (independent of the Pulsations layer); also the looper's count-in
  function click(time, accent) {
    const E = AMB.engine, ctx = E.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(accent ? 0.22 : 0.12, time + 0.002);
    g.gain.setTargetAtTime(0, time + 0.003, 0.012);
    o.connect(g); g.connect(E.dryBus); o.start(time); o.stop(time + 0.08);
    o.onended = () => g.disconnect();
  }

  function onStep(step, time, sd, chordDeg) {
    if (roll.recording && roll.metro && step % 4 === 0 && AMB.engine.ctx) click(time, step % 16 === 0);
    if (!store.get('seq.on') || !AMB.layers.seq) return;
    if (store.get('seq.mode') === 'Arpège') { roll.playStep = -1; roll.mark(step, -1, null); return arpStep(step, time, sd, chordDeg); }
    const len = steps(), i = (step - (AMB.seq.origin || 0)) % len;
    // slot changes are quantised: the new motif starts at the next pattern boundary (like clip launching)
    if (i === 0 || latched == null) latched = slotAt(step);
    const slot = latched, key = SLOTKEY[slot];
    if (i === 0 && step > 0 && store.get('seq.mutate') > 0) mutate(store.get('seq.mutate'), key);
    roll.playSlot = slot;
    const notes = parse(store.get(key));
    if (!notes.length) return;
    const seq = AMB.seq, oct = parseInt(store.get('seq.octave'), 10) || 0;
    const swing = i % 2 === 1 ? Math.min(1, store.get('global.swing') + store.get('seq.swing')) * sd * 0.5 : 0;
    for (const n of notes) {
      if (n.s !== i) continue;
      if (n.p < 10 && Math.random() * 10 >= n.p) continue;
      const deg = n.r + (store.get('seq.follow') ? chordDeg : 0);
      const midi = T.degreeToMidi(deg, seq.root, seq.scale, 3 + oct) + (n.a || 0);
      const vel = (n.v / 9) * (0.85 + (i % 4 === 0 ? 0.15 : 0)) + Math.random() * 0.05;
      const hu = AMB.util.human();
      AMB.layers.seq.note(midi, Math.max(time, time + swing + hu.dt), vel * hu.dv, true, n.l * sd * 0.95);
    }
    roll.playStep = i; roll.mark(step, i, slot);
  }

  // ---------- slow mutation (like the Phrase mode): notes drift by step, some vanish, some appear ----------
  const original = {}; // last pattern written by the user per slot (to come back to)
  store.on((k, v, source) => { if (Object.values(SLOTKEY).includes(k) && source !== 'evolve') original[k] = v; });
  function mutate(m, key = editKey()) {
    const notes = parse(store.get(key)).map((n) => ({ ...n }));
    const len = steps();
    for (const n of notes) {
      if (Math.random() < m * 0.25) n.r = Math.max(0, Math.min(ROWS - 1, n.r + [-2, -1, 1, 2][Math.floor(Math.random() * 4)]));
    }
    let out = notes.filter(() => !(Math.random() < m * 0.06));
    if (Math.random() < m * 0.5 && out.length) {
      const src = out[Math.floor(Math.random() * out.length)];
      const s = Math.floor(Math.random() * len);
      if (!out.some((x) => x.s === s)) out.push({ s, r: Math.max(0, Math.min(ROWS - 1, src.r + [-1, 1, 2][Math.floor(Math.random() * 3)])), l: Math.min(src.l, len - s), v: 5, p: 10 });
    }
    if (!out.length && original[key]) out = parse(original[key]).map((n) => ({ ...n }));
    store.set(key, encode(out), 'evolve');
  }

  // exact cell for a midi note: the scale row at or just below it plus a sharp, so nothing is pulled onto the scale.
  // Rows start at octave 3 + seq.octave (or `base`) and move with the chord when following (`chordDeg`); a pitch
  // outside the 15 rows keeps its pitch class in the nearest octave that fits.
  function cellFor(midi, chordDeg = store.get('seq.follow') ? AMB.seq.chordDeg : 0, base = 3 + (parseInt(store.get('seq.octave'), 10) || 0)) {
    const seq = AMB.seq;
    let best = { r: 0, a: 0 }, bd = 99;
    for (const o of [0, -12, 12]) for (let r = 0; r < ROWS; r++) {
      const d = midi + o - T.degreeToMidi(r + (chordDeg || 0), seq.root, seq.scale, base);
      if (d >= 0 && d < bd) { bd = d; best = o ? { r, a: d, o } : { r, a: d }; }
    }
    if (best.a > 3) best.a = 0; // (only below the bottom row: nothing fits)
    return best;
  }
  const velOf = (ev) => Math.max(1, Math.min(9, Math.round(ev.vel * 9)));
  const cellNote = (s, c, l, v) => (c.a ? { s, r: c.r, l, v, p: 10, a: c.a } : { s, r: c.r, l, v, p: 10 });

  // ---------- live recording (computer keyboard / MIDI) into the edited motif, quantised, overdub ----------
  // the step is taken at the moment the note was played (event timestamp, see seq.playedAt), not when handled
  AMB.bus.on('live', (ev) => {
    if (!roll.recording || !AMB.seq.playing) return;
    const seq = AMB.seq, sd = seq.stepDur(), len = steps(), at = ev.played != null ? ev.played : ev.time;
    // step of the event relative to the scheduler position, rounded to the nearest 16th
    const s = ((Math.round((at - seq.nextTime) / sd) + seq.step) % len + len) % len;
    const c = cellFor(ev.midi);
    // S5.7: the roll holds 15 rows (2 octaves): a note above or below is written an octave closer — said once per take
    if (c.o && !roll.toldFold && AMB.ui) { roll.toldFold = true; AMB.ui.toast(`Note ${c.o < 0 ? 'trop aiguë' : 'trop grave'} pour le piano roll (2 octaves) : écrite une octave plus ${c.o < 0 ? 'bas' : 'haut'}. Octave du motif ${c.o < 0 ? '+1' : '−1'} pour la garder.`); }
    const notes = roll.notes().filter((n) => !(n.s === s && n.r === c.r));
    notes.push(cellNote(s, c, 1, velOf(ev)));
    roll.save(notes);
    roll.recCount = (roll.recCount || 0) + 1;
    if (ev.id) recHeld.set(ev.id, { s, r: c.r, time: at, key: editKey() });
  });
  // the release gives the real length: time held (sustain pedal included), quantised to the step, 1 step at least,
  // never past the end of the motif
  const recHeld = new Map(); // live note id → where it was written
  AMB.bus.on('liveOff', (ev) => {
    const h = recHeld.get(ev.id);
    if (!h) return;
    recHeld.delete(ev.id);
    if (h.key !== editKey()) return;
    const notes = roll.notes(), n = notes.find((x) => x.s === h.s && x.r === h.r);
    if (!n) return;
    const l = Math.max(1, Math.min(steps() - h.s, Math.round(((ev.played != null ? ev.played : ev.time) - h.time) / AMB.seq.stepDur())));
    if (l !== n.l) { n.l = l; roll.save(notes); }
  });

  // ---------- editor ----------
  const roll = {
    playStep: -1,
    metro: true,
    build(panel) {
      const wrap = document.createElement('div');
      wrap.className = 'roll-wrap';
      wrap.innerHTML = `
        <div class="roll-tools">
          <span class="slot-tabs">${['A', 'B', 'C', 'D'].map((x) => `<button class="slot-tab" data-slot="${x}" title="Éditer le motif ${x}">${x}</button>`).join('')}</span>
          <button class="btn small" data-act="dup" title="Copier ce motif dans le prochain emplacement libre">⧉ Dupliquer</button>
          <button class="btn small" data-act="clear" title="Effacer toutes les notes">Effacer</button>
          <button class="btn small" data-act="random" title="Motif aléatoire dans la gamme">⚄ Motif</button>
          <label class="btn small" title="Clic doux sur les temps pendant l'enregistrement (Rec live, boucles)"><input type="checkbox" data-metro checked> Métronome</label>
          <button class="btn small rec-btn" data-act="liverec" title="Enregistre ce que tu joues au clavier (A–L, Q–P) ou en MIDI dans ce motif, quantifié, en boucle (overdub)">● Rec live</button>
          <button class="btn small" data-act="shiftL" title="Décaler à gauche">◀</button>
          <button class="btn small" data-act="shiftR" title="Décaler à droite">▶</button>
          <button class="btn small" data-act="up" title="Monter d'un degré">▲</button>
          <button class="btn small" data-act="down" title="Descendre d'un degré">▼</button>
          <label class="btn small" title="Importer un fichier .mid dans ce motif (calé sur la grille, notes hors gamme gardées)">⬆ MIDI<input type="file" accept=".mid,.midi,audio/midi" hidden data-midi-in></label>
          <button class="btn small" data-act="midi" title="Exporter progression + motifs + pulsations en fichier MIDI">⬇ MIDI</button>
          <button class="btn small" data-act="restore" title="Revenir au dernier motif dessiné (annule les mutations)">↺ Original</button>
          <span class="roll-hint">Clic : ajouter/retirer · glisser une note : déplacer (bord droit : longueur) · molette : vélocité · clic droit : probabilité · Alt+glisser : sélection (⌘C ⌘V ⌘D, flèches, Suppr)</span>
        </div>
        <div class="roll-scroll"><canvas class="roll"></canvas></div>`;
      panel.append(wrap);
      this.canvas = wrap.querySelector('canvas');
      this.g = this.canvas.getContext('2d');
      wrap.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act, b)));
      const mi = wrap.querySelector('[data-midi-in]');
      mi.addEventListener('change', async () => {
        if (!mi.files[0] || !AMB.midiExport) return;
        try { await AMB.midiExport.importMidi(mi.files[0]); } catch (e) { AMB.ui.toast('Fichier MIDI illisible'); console.warn(e); }
        mi.value = '';
      });
      const metro = wrap.querySelector('[data-metro]');
      this.metro = metro.checked;
      metro.addEventListener('change', () => { this.metro = metro.checked; });
      this.tabs = [...wrap.querySelectorAll('[data-slot]')];
      this.tabs.forEach((b) => b.addEventListener('click', () => store.set('seq.slot', b.dataset.slot, 'user')));
      this.bindMouse();
      store.on((k) => { if (k.startsWith('seq.') || k === 'global.key' || k === 'global.scale') this.draw(); });
      window.addEventListener('resize', () => this.draw());
      // S7.2: the playhead and the notes that flash follow the step HEARD (seq.heard), not the scheduler; while an
      // effect lives (a note placed, erased, played, a selection), the roll is drawn each frame, else only on changes
      const loop = () => {
        const S = AMB.seq, h = S.playing ? S.heard() : -1, m = this.marks;
        let v = -1, vs = null;
        if (h >= 0) for (let k = m.length - 1; k >= 0; k--) if (m[k][0] <= h) { v = m[k][1]; vs = m[k][2]; break; }
        if (v !== this.vStep || vs !== this.vSlot) {
          if (v >= 0 && v !== this.vStep && vs === store.get('seq.slot')) this.flash(v);
          this.vStep = v; this.vSlot = vs; if (this.seen) this.draw(); else this.renderTabs(); // (off screen: redrawn when it comes back)
        } else if (this.fx.length) this.draw();
        requestAnimationFrame(loop);
      };
      this.seen = true;
      if (window.IntersectionObserver) new IntersectionObserver((es) => { this.seen = es[es.length - 1].isIntersecting; if (this.seen) this.draw(); }).observe(this.canvas);
      requestAnimationFrame(loop);
      this.draw();
    },
    // ---- S7.2 motion on the canvas: effects drawn over the notes for a moment (M = AMB.motion: tokens, JUICE, off) ----
    marks: [], vStep: -1, vSlot: null, fx: [], hover: null,
    mark(step, i, slot) { this.marks.push([step, i, slot]); if (this.marks.length > 48) this.marks.shift(); },
    // k: pop (placed), squash (erased), flash (plays), shine (selected); dur: a motion token; delay in ms
    addFx(k, notes, dur = 'slow', delay = () => 0) {
      const M = AMB.motion; if (!M || !M.on() || !this.canvas) return;
      const t = performance.now(), d = M.ms(dur);
      for (const n of notes) this.fx.push({ k, s: n.s, r: n.r, l: n.l || 1, t0: t + delay(n), d });
      if (this.fx.length > 200) this.fx.splice(0, this.fx.length - 200);
      if (k !== 'flash') this.draw();
    },
    // the screen point of a note (sparks)
    notePt(n) {
      const G = this.geom(), r = this.canvas.getBoundingClientRect();
      return { x: r.left + G.labelW + (n.s + Math.min(n.l || 1, 4) / 2) * G.cw, y: r.top + (ROWS - 1 - n.r + 0.5) * G.rowH };
    },
    placed(n) { const M = AMB.motion; this.addFx('pop', [n]); if (M) M.burst(this.notePt(n), { n: 10, speed: 280, life: 0.4, color: '#ffb347' }); },
    erased(ns) {
      const M = AMB.motion; if (!ns.length) return;
      this.addFx('squash', ns, 'med');
      if (M) ns.slice(0, 6).forEach((n) => M.burst(this.notePt(n), { n: 6, spread: Math.PI * 2, speed: 200, life: 0.35, G: 1400, color: '#ff8a5c' }));
    },
    flash(v) {
      if (!this.seen) return; // (off screen: no per-frame redraw for nobody)
      const ns = this.notes().filter((n) => n.s === v);
      if (ns.length) this.addFx('flash', ns, 'slow');
    },
    notes() { return parse(store.get(editKey())).slice(); },
    save(notes, source = 'user') { store.set(editKey(), encode(notes), source); },
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
    // ---- selection (Alt+drag rectangle, ⌘A) with copy/paste/delete/transpose from the keyboard ----
    sel: new Set(), clip: null, box: null, cursor: 0,
    keyOf: (n) => `${n.s}.${n.r}`,
    selected() { return this.notes().filter((n) => this.sel.has(this.keyOf(n))); },
    setSel(notes) {
      const before = this.sel; this.sel = new Set(notes.map(this.keyOf));
      // S7.2: notes that join the selection shimmer (a light sweeps across them, left to right)
      const fresh = notes.filter((n) => !before.has(this.keyOf(n)));
      if (fresh.length) { const s0 = Math.min(...fresh.map((n) => n.s)); this.addFx('shine', fresh, 'slow', (n) => (n.s - s0) * 12 * (AMB.motion ? AMB.motion.t() : 0)); }
      this.draw();
    },
    transformSel(fn) {
      const notes = this.notes(), out = [], moved = [];
      for (const n of notes) {
        if (!this.sel.has(this.keyOf(n))) { out.push(n); continue; }
        const m = fn({ ...n });
        if (m && m.r >= 0 && m.r < ROWS && m.s >= 0 && m.s < steps()) { out.push(m); moved.push(m); }
        else if (!m) this.erased([n]); // S7.2: deleted (Suppr, ⌘X): squashed
      }
      // drop unselected notes that now collide with moved ones
      const keys = new Set(moved.map(this.keyOf));
      const final = out.filter((n) => moved.includes(n) || !keys.has(this.keyOf(n)));
      this.save(final); this.setSel(moved);
    },
    onKey(e) {
      const mod = e.metaKey || e.ctrlKey, k = e.key;
      const sel = this.selected(), len = steps();
      const handled = () => { e.preventDefault(); e.stopPropagation(); };
      if (mod && k.toLowerCase() === 'a') { handled(); this.setSel(this.notes()); }
      else if (mod && k.toLowerCase() === 'c' && sel.length) { handled(); this.copySel(); }
      else if (mod && k.toLowerCase() === 'x' && sel.length) { handled(); this.copySel(); this.transformSel(() => null); }
      else if (mod && k.toLowerCase() === 'v' && this.clip) { handled(); this.paste(this.cursor); }
      else if (mod && k.toLowerCase() === 'd' && sel.length) { handled(); this.copySel(); this.paste(Math.max(...sel.map((n) => n.s + n.l)) % len); }
      else if ((k === 'Delete' || k === 'Backspace') && sel.length) { handled(); this.transformSel(() => null); }
      else if (k === 'Escape') { handled(); this.setSel([]); }
      else if (sel.length && (k === 'ArrowUp' || k === 'ArrowDown')) { handled(); const d = (k === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 7 : 1); this.transformSel((n) => ({ ...n, r: n.r + d })); }
      else if (sel.length && (k === 'ArrowLeft' || k === 'ArrowRight')) { handled(); const d = (k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 4 : 1); this.transformSel((n) => ({ ...n, s: n.s + d })); }
    },
    copySel() {
      const sel = this.selected(); if (!sel.length) return;
      const s0 = Math.min(...sel.map((n) => n.s));
      this.clip = sel.map((n) => ({ ...n, s: n.s - s0 }));
      AMB.ui.toast(`${sel.length} note(s) copiée(s)`);
    },
    paste(at) {
      const len = steps(), notes = this.notes(), pasted = [];
      for (const c of this.clip) {
        const s = at + c.s; if (s >= len) continue;
        const n = { ...c, s, l: Math.min(c.l, len - s) };
        const i = notes.findIndex((x) => x.s === n.s && x.r === n.r);
        if (i >= 0) notes.splice(i, 1);
        notes.push(n); pasted.push(n);
      }
      this.save(notes); this.setSel(pasted);
    },

    bindMouse() {
      let drag = null;
      this.canvas.tabIndex = 0;
      this.canvas.setAttribute('aria-label', 'Piano roll : Alt+glisser pour sélectionner, ⌘C/⌘V, flèches pour transposer');
      this.canvas.addEventListener('keydown', (e) => this.onKey(e));
      this.canvas.addEventListener('pointerdown', (e) => {
        const c = this.cellAt(e); if (!c) return;
        this.canvas.focus({ preventScroll: true });
        this.cursor = c.s;
        let notes = this.notes();
        if (e.altKey) { // rectangle selection
          this.box = { s0: c.s, r0: c.r, s1: c.s, r1: c.r };
          try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
          this.updateBox();
          return;
        }
        if (e.shiftKey) { // toggle a whole column off (or nothing to remove: no-op)
          this.erased(notes.filter((n) => c.s >= n.s && c.s < n.s + n.l));
          this.save(notes.filter((n) => !(c.s >= n.s && c.s < n.s + n.l)));
          return;
        }
        if (e.button === 2) return; // right button handled by contextmenu (probability)
        const hit = notes.find((n) => n.r === c.r && c.s >= n.s && c.s < n.s + n.l);
        if (hit) {
          // grab: right edge of a long note = resize, elsewhere = move (whole selection if the note is selected);
          // releasing without moving deletes the note, as before
          const inSel = this.sel.has(this.keyOf(hit));
          if (!inSel) this.sel = new Set();
          const group = inSel ? notes.filter((n) => this.sel.has(this.keyOf(n))) : [hit];
          const others = notes.filter((n) => !group.includes(n));
          drag = { mode: hit.l > 1 && c.s === hit.s + hit.l - 1 ? 'resize' : 'move', start: c, hit, group: group.map((n) => ({ ...n })), others, moved: false };
          try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
          return;
        }
        if (this.sel.size) this.sel = new Set();
        const note = { s: c.s, r: c.r, l: 1, v: 7, p: 10 };
        notes.push(note); this.save(notes); this.placed(note);
        drag = { mode: 'new', s: c.s, r: c.r };
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
        this.preview(c.r, c.s);
      });
      this.canvas.addEventListener('pointermove', (e) => {
        if (!drag && !this.box && e.pointerType === 'mouse') { // S7.2: the cell under the mouse glows (a ghost note)
          const c = this.cellAt(e), k = c ? c.s + '.' + c.r : null;
          if (k !== (this.hover && this.hover.k)) { this.hover = c && { ...c, k }; this.draw(); }
        }
        if (this.box) { const c = this.cellAt(e); if (c) { this.box.s1 = c.s; this.box.r1 = c.r; this.updateBox(); } return; }
        if (!drag) return;
        const c = this.cellAt(e); if (!c) return;
        if (drag.mode === 'move' || drag.mode === 'resize') {
          const ds = c.s - drag.start.s, dr = c.r - drag.start.r, len = steps();
          if (!ds && !dr && !drag.moved) return;
          drag.moved = true;
          let moved;
          if (drag.mode === 'resize') moved = drag.group.map((n) => ({ ...n, l: Math.max(1, Math.min(len - n.s, n.l + ds)) }));
          else {
            const minS = Math.min(...drag.group.map((n) => n.s)), maxS = Math.max(...drag.group.map((n) => n.s));
            const minR = Math.min(...drag.group.map((n) => n.r)), maxR = Math.max(...drag.group.map((n) => n.r));
            const ds2 = Math.max(-minS, Math.min(len - 1 - maxS, ds)), dr2 = Math.max(-minR, Math.min(ROWS - 1 - maxR, dr));
            moved = drag.group.map((n) => ({ ...n, s: n.s + ds2, r: n.r + dr2, l: Math.min(n.l, len - (n.s + ds2)) }));
            if (dr2 !== drag.lastDr && drag.group.length === 1) this.preview(moved[0].r, moved[0].s);
            drag.lastDr = dr2;
          }
          const keys = new Set(moved.map(this.keyOf));
          this.save([...drag.others.filter((n) => !keys.has(this.keyOf(n))), ...moved]);
          if (this.sel.size) this.sel = keys;
          return;
        }
        const notes = this.notes();
        const n = notes.find((x) => x.s === drag.s && x.r === drag.r);
        if (!n) return;
        const l = Math.max(1, c.s - drag.s + 1);
        if (l !== n.l) { n.l = l; this.save(notes); }
      });
      const noteAt = (e) => { const c = this.cellAt(e); if (!c) return [null, null]; const notes = this.notes(); return [notes, notes.find((n) => n.r === c.r && c.s >= n.s && c.s < n.s + n.l)]; };
      // wheel over a note: velocity
      this.canvas.addEventListener('wheel', (e) => {
        const [notes, n] = noteAt(e); if (!n) return;
        e.preventDefault();
        const i = notes.indexOf(n);
        notes[i] = { ...n, v: Math.max(1, Math.min(9, n.v + (e.deltaY < 0 ? 1 : -1))) };
        this.save(notes);
      }, { passive: false });
      // right click on a note: probability 100 → 75 → 50 → 25 → 100 %
      this.canvas.addEventListener('contextmenu', (e) => {
        const [notes, n] = noteAt(e); if (!n) return;
        e.preventDefault();
        const order = [10, 7, 5, 2], i = notes.indexOf(n);
        notes[i] = { ...n, p: order[(order.indexOf(n.p) + 1) % order.length] || 10 };
        this.save(notes);
      });
      const end = () => {
        if (drag && drag.mode === 'move' && !drag.moved) { // simple click on a note: delete it
          this.erased([drag.hit]);
          this.save(this.notes().filter((n) => !(n.s === drag.hit.s && n.r === drag.hit.r)));
        }
        drag = null;
        if (this.box) { this.box = null; this.draw(); }
      };
      this.canvas.addEventListener('pointerup', end);
      this.canvas.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.draw(); } });
      this.canvas.addEventListener('pointercancel', end);
    },
    // audition the note being placed; stopped, through the same live path as A–L (engine.liveInput, past the stop fade)
    preview(row, s) {
      if (!AMB.engine.ctx || !AMB.layers.seq) return;
      const seq = AMB.seq, oct = parseInt(store.get('seq.octave'), 10) || 0, L = AMB.layers;
      const deg = row + (store.get('seq.follow') && seq.playing ? seq.chordDeg : 0);
      L.seq.note(T.degreeToMidi(deg, seq.root, seq.scale, 3 + oct), AMB.engine.ctx.currentTime + 0.01, 0.6, true, 0.25, { bright: null, dest: seq.playing ? null : seq.liveDest(L.seq) });
    },
    act(a, btn) {
      const n = steps();
      let notes = this.notes();
      if (a === 'clear') notes = [];
      else if (a === 'random') notes = randomPattern(n);
      else if (a === 'shiftL' || a === 'shiftR') notes.forEach((x) => { x.s = (x.s + (a === 'shiftR' ? 1 : n - 1)) % n; });
      else if (a === 'up' || a === 'down') notes = notes.map((x) => ({ ...x, r: x.r + (a === 'up' ? 1 : -1) })).filter((x) => x.r >= 0 && x.r < ROWS);
      else if (a === 'liverec') {
        if (this.recording) return this.stopRecording();
        this.recording = !this.recording;
        btn.classList.toggle('rec', this.recording);
        btn.textContent = this.recording ? '■ Stop rec' : '● Rec live';
        if (this.recording) {
          this.recCount = 0; this.toldFold = false;
          if (!store.get('seq.on')) store.set('seq.on', true, 'user');
          if (store.get('seq.mode') !== 'Piano roll') store.set('seq.mode', 'Piano roll', 'user');
          if (!AMB.seq.playing) AMB.ui.play();
          AMB.ui.toast('Rec live : joue avec les touches A–L / Q–P ou ton clavier MIDI');
        }
        return;
      }
      else if (a === 'midi') { if (AMB.midiExport) AMB.midiExport.exportMidi(); return; }
      else if (a === 'restore') { if (original[editKey()] != null) notes = parse(original[editKey()]); }
      else if (a === 'dup') { // copy the edited slot into the next empty one and switch to it
        const free = ['A', 'B', 'C', 'D'].find((x) => !parse(store.get(SLOTKEY[x])).length);
        if (!free) { AMB.ui.toast('Les 4 motifs sont occupés'); return; }
        store.set(SLOTKEY[free], store.get(editKey()), 'user');
        store.set('seq.slot', free, 'user');
        AMB.ui.toast(`Motif copié dans ${free}`);
        return;
      }
      this.save(notes);
      if (a === 'random' && !store.get('seq.on')) store.set('seq.on', true, 'user');
    },
    renderTabs() {
      if (!this.tabs) return;
      const playing = AMB.seq.playing && store.get('seq.on') ? this.vSlot : null;
      for (const b of this.tabs) {
        const x = b.dataset.slot;
        b.classList.toggle('is-sel', store.get('seq.slot') === x);
        b.classList.toggle('filled', parse(store.get(SLOTKEY[x])).length > 0);
        b.classList.toggle('now', playing === x);
        // edited slot waiting for the next bar to start playing
        b.classList.toggle('queued', !!playing && !chainList().length && store.get('seq.slot') === x && playing !== x);
      }
    },
    draw() {
      this.renderTabs();
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
      const chordPcs = new Set((seq.chord && seq.chord.length ? seq.chord : seq.chordMidis(seq.chordDeg || 0)).map((m) => ((m % 12) + 12) % 12));
      for (let r = 0; r < ROWS; r++) {
        const y = (ROWS - 1 - r) * G.rowH;
        const isRoot = r % seq.scale.length === 0;
        g.fillStyle = isRoot ? '#2a2010' : r % 2 ? '#17140f' : '#1b1812';
        g.fillRect(G.labelW, y, G.w - G.labelW, G.rowH);
        // rows that are tones of the chord playing now (relative to the motif when following chords)
        if (chordPcs.has(((T.degreeToMidi(r + (store.get('seq.follow') ? seq.chordDeg : 0), seq.root, seq.scale, 3)) % 12 + 12) % 12)) {
          g.fillStyle = 'rgba(242,162,58,0.08)'; g.fillRect(G.labelW, y, G.w - G.labelW, G.rowH);
          g.fillStyle = '#f2a23a'; g.fillRect(G.labelW - 3, y + 4, 2, G.rowH - 8);
        }
        const midi = T.degreeToMidi(r, seq.root, seq.scale, 3);
        g.fillStyle = isRoot ? '#ffcf7a' : '#8a7f66';
        g.font = '10px system-ui, sans-serif'; g.textBaseline = 'middle';
        g.fillText(T.NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1), 4, y + G.rowH / 2);
      }
      // beat / bar lines
      for (let s = 0; s <= n; s++) {
        g.fillStyle = s % 16 === 0 ? '#5a4f33' : s % 4 === 0 ? '#3a3424' : '#2a261c';
        g.fillRect(G.labelW + s * G.cw, 0, s % 16 === 0 ? 1.5 : 1, G.h);
      }
      // playhead
      // the playhead is only meaningful when the edited slot is the one playing
      const ps = this.vSlot === store.get('seq.slot') ? this.vStep : -1; // (the step heard, S7.2)
      if (seq.playing && store.get('seq.on') && ps >= 0 && ps < n) {
        g.fillStyle = 'rgba(255,179,71,0.12)';
        g.fillRect(G.labelW + ps * G.cw, 0, G.cw, G.h);
      }
      // notes
      for (const nt of parse(store.get(editKey()))) {
        if (nt.s >= n) continue;
        const x = G.labelW + nt.s * G.cw + 1, y = (ROWS - 1 - nt.r) * G.rowH + 2;
        const w = Math.min(nt.l, n - nt.s) * G.cw - 2;
        const active = seq.playing && ps >= nt.s && ps < nt.s + nt.l;
        g.fillStyle = active ? '#ffe0a8' : '#ffb347';
        g.globalAlpha = (store.get('seq.on') && store.get('seq.mode') !== 'Arpège' ? 1 : 0.35) * (0.35 + 0.65 * (nt.v / 9));
        roundRect(g, x, y, w, G.rowH - 4, 3); g.fill();
        g.globalAlpha = 1;
        if (nt.a === 1) drawSharp(g, x + Math.max(5, w / 2), y + (G.rowH - 4) / 2, Math.min(G.rowH - 8, 9) / 2); // 1 semitone above the row
        else if (nt.a) { // off the scale by 2 / 3 semitones
          g.fillStyle = '#1d1407'; g.font = 'bold 10px system-ui, sans-serif'; g.textBaseline = 'middle';
          g.fillText('+' + nt.a, x + Math.max(2, w / 2 - 4), y + (G.rowH - 4) / 2 + 0.5);
        }
        if (this.sel.has(this.keyOf(nt))) { g.strokeStyle = '#fff3dc'; g.lineWidth = 1.5; roundRect(g, x, y, w, G.rowH - 4, 3); g.stroke(); }
        if (nt.p < 10) { // dashed outline + percentage for probabilistic notes
          g.setLineDash([3, 2]); g.strokeStyle = '#fff8'; g.lineWidth = 1;
          roundRect(g, x + 0.5, y + 0.5, w - 1, G.rowH - 5, 3); g.stroke(); g.setLineDash([]);
          if (w > 22) { g.fillStyle = '#1d1407'; g.font = '9px "IBM Plex Mono", monospace'; g.fillText(nt.p * 10 + '%', x + 3, y + (G.rowH - 4) / 2); }
        }
      }
      this.drawFx(g, G);
      if (this.box) { // selection rectangle
        const b = this.box, sa = Math.min(b.s0, b.s1), sb = Math.max(b.s0, b.s1), ra = Math.min(b.r0, b.r1), rb = Math.max(b.r0, b.r1);
        g.strokeStyle = '#fff3dccc'; g.setLineDash([4, 3]); g.lineWidth = 1;
        g.strokeRect(G.labelW + sa * G.cw, (ROWS - 1 - rb) * G.rowH, (sb - sa + 1) * G.cw, (rb - ra + 1) * G.rowH); g.setLineDash([]);
      }
    },
    // S7.2: the effects over the notes, and the ghost note under the mouse
    drawFx(g, G) {
      const now = performance.now(), M = AMB.motion, a = M ? Math.min(2, M.amp()) : 0, rh = G.rowH - 4;
      const box = (n) => [G.labelW + n.s * G.cw + 1, (ROWS - 1 - n.r) * G.rowH + 2, Math.max(4, Math.min(n.l, G.n - n.s) * G.cw - 2)];
      if (this.hover && a > 0) {
        const [x, y, w] = box({ s: this.hover.s, r: this.hover.r, l: 1 });
        g.save(); g.shadowColor = '#ffb347'; g.shadowBlur = 10 * a; g.strokeStyle = 'rgba(255,212,140,.85)'; g.lineWidth = 1.5;
        g.fillStyle = 'rgba(255,179,71,.18)'; roundRect(g, x, y, w, rh, 3); g.fill(); g.stroke(); g.restore();
      }
      if (!this.fx.length) return;
      g.save();
      this.fx = this.fx.filter((f) => {
        const p = (now - f.t0) / f.d; if (p >= 1) return false; if (p < 0) return true;
        const [x, y, w] = box(f), cx = x + w / 2, cy = y + rh / 2;
        if (f.k === 'pop') { // springs out big, then settles; a ring flies off
          const s = 1 + 0.7 * a * Math.pow(1 - p, 2) * Math.cos(p * 9);
          g.globalAlpha = 1; g.fillStyle = '#fff3c4'; g.shadowColor = '#ffb347'; g.shadowBlur = 14 * a * (1 - p);
          roundRect(g, cx - (w / 2) * s, cy - (rh / 2) * s, w * s, rh * s, 3); g.globalAlpha = 0.85 * (1 - p); g.fill();
          const o = 3 + 14 * a * p; g.shadowBlur = 0; g.globalAlpha = 1 - p; g.strokeStyle = '#ffd08a'; g.lineWidth = 2 * (1 - p) + 0.5;
          roundRect(g, x - o, y - o, w + 2 * o, rh + 2 * o, 4); g.stroke();
        } else if (f.k === 'squash') { // flattens and widens, then gone
          const sx = 1 + 0.6 * a * p, sy = Math.max(0.04, 1 - p * 1.1);
          g.globalAlpha = 1 - p * p; g.fillStyle = '#ff8a5c'; g.shadowColor = '#ff5e7a'; g.shadowBlur = 8 * a;
          roundRect(g, cx - (w / 2) * sx, y + rh - rh * sy + 2 * a * p, w * sx, rh * sy, 2); g.fill();
        } else if (f.k === 'flash') { // the note that plays: a white flash that spills, then fades
          const e = Math.pow(1 - p, 2);
          g.globalAlpha = 0.9 * e; g.fillStyle = '#ffffff'; g.shadowColor = '#ffe0a8'; g.shadowBlur = 18 * a * e;
          const o = 2 * a * e; roundRect(g, x - o, y - o, w + 2 * o, rh + 2 * o, 3); g.fill();
        } else if (f.k === 'shine') { // a light sweeps across, the outline sparkles
          const bx = x - 6 + (w + 12) * p;
          g.globalAlpha = Math.sin(Math.PI * p); g.fillStyle = '#ffffff'; g.shadowColor = '#fff3dc'; g.shadowBlur = 8 * a;
          g.fillRect(Math.max(x, bx - 2), y, Math.min(4, x + w - Math.max(x, bx - 2)), rh);
          g.strokeStyle = '#fff3dc'; g.lineWidth = 1 + 1.5 * Math.sin(Math.PI * p); roundRect(g, x, y, w, rh, 3); g.stroke();
        }
        return true;
      });
      g.restore();
    },
    stopRecording() {
      this.recording = false;
      const btn = document.querySelector('[data-act=liverec]');
      if (btn) { btn.classList.remove('rec'); btn.textContent = '● Rec live'; }
      AMB.ui.toast(`${this.recCount || 0} note(s) enregistrée(s)`);
    },
    updateBox() {
      const b = this.box, sa = Math.min(b.s0, b.s1), sb = Math.max(b.s0, b.s1), ra = Math.min(b.r0, b.r1), rb = Math.max(b.r0, b.r1);
      this.setSel(this.notes().filter((n) => n.r >= ra && n.r <= rb && n.s + n.l - 1 >= sa && n.s <= sb));
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

  // a sharp drawn as lines (the ♯ character falls back to a « # » look in small canvas text): 2 uprights, 2 slanted bars
  function drawSharp(g, cx, cy, r) {
    g.save(); g.strokeStyle = '#1d1407'; g.lineCap = 'butt';
    g.lineWidth = 1.1; g.beginPath();
    [-0.4, 0.4].forEach((k) => { g.moveTo(cx + k * r, cy - r + (k > 0 ? -0.3 : 0.3) * r); g.lineTo(cx + k * r, cy + r + (k > 0 ? -0.3 : 0.3) * r); });
    g.stroke(); g.lineWidth = Math.max(1.6, r * 0.45); g.beginPath();
    [-0.35, 0.35].forEach((k) => { g.moveTo(cx - 0.85 * r, cy + k * r + 0.2 * r); g.lineTo(cx + 0.85 * r, cy + k * r - 0.2 * r); });
    g.stroke(); g.restore();
  }

  AMB.pianoRoll = { originals: () => ({ ...original }), roll, resetLatch, cellFor, click, parse, encode, onStep, arpStep, randomPattern, mutate, slotAt, chainList, SLOTKEY, ROWS };
})();
