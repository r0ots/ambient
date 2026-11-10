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
      const [s, r, l, v, p] = tok.split('.').map((x) => parseInt(x, 36));
      if ([s, r, l].every(Number.isFinite) && s >= 0 && s < 64 && r >= 0 && r < ROWS && l >= 1) {
        // v: velocity 1..9 (default 7), p: probability in tenths 1..10 (default 10)
        notes.push({ s, r, l: Math.min(l, 64), v: Number.isFinite(v) ? Math.max(1, Math.min(9, v)) : 7, p: Number.isFinite(p) ? Math.max(1, Math.min(10, p)) : 10 });
      }
    }
    cacheStr = str; cacheNotes = notes;
    return notes;
  }
  const encode = (notes) => notes.map((n) => {
    let t = `${n.s.toString(36)}.${n.r.toString(36)}.${n.l.toString(36)}`;
    const v = n.v || 7, p = n.p || 10;
    if (v !== 7 || p !== 10) t += `.${v.toString(36)}`;
    if (p !== 10) t += `.${p.toString(36)}`;
    return t;
  }).join(',');
  const steps = () => parseInt(store.get('seq.steps'), 10) || 32;
  const SLOTKEY = { A: 'seq.pattern', B: 'seq.patB', C: 'seq.patC', D: 'seq.patD' };
  const editKey = () => SLOTKEY[store.get('seq.slot')] || 'seq.pattern';
  const chainList = () => String(store.get('seq.chain') || '').toUpperCase().split(/[^ABCD]+|(?=[ABCD])/).filter((x) => SLOTKEY[x]);
  // which slot plays during the pattern cycle that contains `step`
  let latched = null;
  function slotAt(step) {
    const chain = chainList();
    if (!chain.length) return store.get('seq.slot');
    return chain[Math.floor(step / steps()) % chain.length];
  }

  // ---------- playback (called by the sequencer on every 16th) ----------
  // ---------- arpeggiator: walks the current chord's tones over 1–3 octaves ----------
  const ARP_RATE = { '1/16': 1, '1/8': 2, '1/8.': 3, '1/4': 4 };
  let arpIdx = 0, arpUp = true;
  function arpStep(step, time, sd, chordDeg) {
    const every = ARP_RATE[store.get('seq.arpRate')] || 2;
    if (step % every) return;
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
    const swing = (step / every) % 2 === 1 ? store.get('seq.swing') * sd * every * 0.5 : 0;
    const vel = 0.55 + (step % 16 === 0 ? 0.3 : step % 4 === 0 ? 0.15 : 0) + Math.random() * 0.08;
    AMB.layers.seq.note(uniq[idx], time + swing, vel, true, every * sd * 0.9);
  }

  function onStep(step, time, sd, chordDeg) {
    if (!store.get('seq.on') || !AMB.layers.seq) return;
    if (store.get('seq.mode') === 'Arpège') { roll.playStep = -1; return arpStep(step, time, sd, chordDeg); }
    const len = steps(), i = step % len;
    // slot changes are quantised: the new motif starts at the next pattern boundary (like clip launching)
    if (i === 0 || latched == null) latched = slotAt(step);
    const slot = latched, key = SLOTKEY[slot];
    if (i === 0 && step > 0 && store.get('seq.mutate') > 0) mutate(store.get('seq.mutate'), key);
    roll.playSlot = slot;
    const notes = parse(store.get(key));
    if (!notes.length) return;
    const seq = AMB.seq, oct = parseInt(store.get('seq.octave'), 10) || 0;
    const swing = i % 2 === 1 ? store.get('seq.swing') * sd * 0.5 : 0;
    for (const n of notes) {
      if (n.s !== i) continue;
      if (n.p < 10 && Math.random() * 10 >= n.p) continue;
      const deg = n.r + (store.get('seq.follow') ? chordDeg : 0);
      const midi = T.degreeToMidi(deg, seq.root, seq.scale, 3 + oct);
      const vel = (n.v / 9) * (0.85 + (i % 4 === 0 ? 0.15 : 0)) + Math.random() * 0.05;
      AMB.layers.seq.note(midi, time + swing, vel, true, n.l * sd * 0.95);
    }
    roll.playStep = i;
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

  // ---------- editor ----------
  const roll = {
    playStep: -1,
    build(panel) {
      const wrap = document.createElement('div');
      wrap.className = 'roll-wrap';
      wrap.innerHTML = `
        <div class="roll-tools">
          <span class="slot-tabs">${['A', 'B', 'C', 'D'].map((x) => `<button class="slot-tab" data-slot="${x}" title="Éditer le motif ${x}">${x}</button>`).join('')}</span>
          <button class="btn small" data-act="dup" title="Copier ce motif dans le prochain emplacement libre">⧉ Dupliquer</button>
          <button class="btn small" data-act="clear" title="Effacer toutes les notes">Effacer</button>
          <button class="btn small" data-act="random" title="Motif aléatoire dans la gamme">⚄ Motif</button>
          <button class="btn small" data-act="capture" title="Enregistre ce que joue la Mélodie pendant un tour de motif">● Capturer la mélodie</button>
          <button class="btn small" data-act="shiftL" title="Décaler à gauche">◀</button>
          <button class="btn small" data-act="shiftR" title="Décaler à droite">▶</button>
          <button class="btn small" data-act="up" title="Monter d'un degré">▲</button>
          <button class="btn small" data-act="down" title="Descendre d'un degré">▼</button>
          <label class="btn small" title="Importer un fichier .mid dans ce motif (quantifié sur la gamme)">⬆ MIDI<input type="file" accept=".mid,.midi,audio/midi" hidden data-midi-in></label>
          <button class="btn small" data-act="midi" title="Exporter progression + motifs + pulsations en fichier MIDI">⬇ MIDI</button>
          <button class="btn small" data-act="restore" title="Revenir au dernier motif dessiné (annule les mutations)">↺ Original</button>
          <span class="roll-hint">Clic : ajouter/retirer · glisser : longueur · molette : vélocité · clic droit : probabilité · Alt+glisser : sélection (⌘C ⌘V ⌘D, flèches, Suppr)</span>
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
      this.tabs = [...wrap.querySelectorAll('[data-slot]')];
      this.tabs.forEach((b) => b.addEventListener('click', () => store.set('seq.slot', b.dataset.slot, 'user')));
      this.bindMouse();
      store.on((k) => { if (k.startsWith('seq.') || k === 'global.key' || k === 'global.scale') this.draw(); });
      window.addEventListener('resize', () => this.draw());
      const loop = () => { if (this.playStep !== this.lastDrawn || this.playSlot !== this.lastSlot) { this.draw(); this.lastSlot = this.playSlot; } requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
      this.draw();
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
    setSel(notes) { this.sel = new Set(notes.map(this.keyOf)); this.draw(); },
    transformSel(fn) {
      const notes = this.notes(), out = [], moved = [];
      for (const n of notes) {
        if (!this.sel.has(this.keyOf(n))) { out.push(n); continue; }
        const m = fn({ ...n });
        if (m && m.r >= 0 && m.r < ROWS && m.s >= 0 && m.s < steps()) { out.push(m); moved.push(m); }
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
        if (this.sel.size) this.sel = new Set();
        if (e.shiftKey) { // toggle a whole column off (or nothing to remove: no-op)
          this.save(notes.filter((n) => !(c.s >= n.s && c.s < n.s + n.l)));
          return;
        }
        if (e.button === 2) return; // right button handled by contextmenu (probability)
        const hit = notes.find((n) => n.r === c.r && c.s >= n.s && c.s < n.s + n.l);
        if (hit) { this.save(notes.filter((n) => n !== hit)); return; }
        const note = { s: c.s, r: c.r, l: 1, v: 7, p: 10 };
        notes.push(note); this.save(notes);
        drag = { s: c.s, r: c.r };
        try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
        this.preview(c.r, c.s);
      });
      this.canvas.addEventListener('pointermove', (e) => {
        if (this.box) { const c = this.cellAt(e); if (c) { this.box.s1 = c.s; this.box.r1 = c.r; this.updateBox(); } return; }
        if (!drag) return;
        const c = this.cellAt(e); if (!c) return;
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
      const end = () => { drag = null; if (this.box) { this.box = null; this.draw(); } };
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
      const playing = AMB.seq.playing && store.get('seq.on') ? this.playSlot : null;
      for (const b of this.tabs) {
        const x = b.dataset.slot;
        b.classList.toggle('sel', store.get('seq.slot') === x);
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
      // the playhead is only meaningful when the edited slot is the one playing
      const ps = this.playSlot === store.get('seq.slot') ? this.playStep : -1;
      if (seq.playing && store.get('seq.on') && ps >= 0 && ps < n) {
        g.fillStyle = 'rgba(255,159,214,0.12)';
        g.fillRect(G.labelW + ps * G.cw, 0, G.cw, G.h);
      }
      // notes
      for (const nt of parse(store.get(editKey()))) {
        if (nt.s >= n) continue;
        const x = G.labelW + nt.s * G.cw + 1, y = (ROWS - 1 - nt.r) * G.rowH + 2;
        const w = Math.min(nt.l, n - nt.s) * G.cw - 2;
        const active = seq.playing && ps >= nt.s && ps < nt.s + nt.l;
        g.fillStyle = active ? '#ffd0ec' : '#ff9fd6';
        g.globalAlpha = (store.get('seq.on') && store.get('seq.mode') !== 'Arpège' ? 1 : 0.35) * (0.35 + 0.65 * (nt.v / 9));
        roundRect(g, x, y, w, G.rowH - 4, 3); g.fill();
        g.globalAlpha = 1;
        if (this.sel.has(this.keyOf(nt))) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; roundRect(g, x, y, w, G.rowH - 4, 3); g.stroke(); }
        if (nt.p < 10) { // dashed outline + percentage for probabilistic notes
          g.setLineDash([3, 2]); g.strokeStyle = '#fff8'; g.lineWidth = 1;
          roundRect(g, x + 0.5, y + 0.5, w - 1, G.rowH - 5, 3); g.stroke(); g.setLineDash([]);
          if (w > 22) { g.fillStyle = '#2a0f20'; g.font = '9px system-ui'; g.fillText(nt.p * 10 + '%', x + 3, y + (G.rowH - 4) / 2); }
        }
      }
      if (this.box) { // selection rectangle
        const b = this.box, sa = Math.min(b.s0, b.s1), sb = Math.max(b.s0, b.s1), ra = Math.min(b.r0, b.r1), rb = Math.max(b.r0, b.r1);
        g.strokeStyle = '#ffffffcc'; g.setLineDash([4, 3]); g.lineWidth = 1;
        g.strokeRect(G.labelW + sa * G.cw, (ROWS - 1 - rb) * G.rowH, (sb - sa + 1) * G.cw, (rb - ra + 1) * G.rowH); g.setLineDash([]);
      }
      this.lastDrawn = this.playStep;
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

  AMB.pianoRoll = { roll, parse, encode, onStep, arpStep, randomPattern, mutate, slotAt, chainList, SLOTKEY, ROWS };
})();
