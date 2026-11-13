// Looper (S6.4): loops PLAYED (pads, A–L / Q–P, Z–M chords, MIDI with its velocity), on the bar, replayed in a loop,
// layered. They belong to the selected song section (`section.loops`, js/song.js): a section plays its own loops, saved,
// exported (file, MIDI) with it. A layer = {bars, mute, notes}; a note = {s, d, a, l, v, b} (s: position in 16ths from the
// section's bar lines, fractional = the played timing; d + a: scale degree + sharp, so a loop follows the key; l: length
// in 16ths; v: heard velocity; b: raw MIDI velocity, the timbre's brightness), a chord = {s, c} (degree, replayed as a
// forced chord). Positions are taken when the note was HEARD (seq.playedAt: event timestamp minus output latency), like
// the Réponse, so a loop replays where it was played.
// ● Boucle: count-in to the next bar line (clicks), records `bars` bars into a new layer (4 at most), then it plays.
// ⊕ Overdub: adds to the last layer, loop after loop, until pressed again. ⤓ Garder (moved from the piano roll): the last
// bars played, without having pressed anything (or, nothing played, the Mélodie auto's) become a layer. ↶: the last take
// undone. A chip = a layer: tap = mute, ✕ = erase. Keys 0 (● Boucle) and 9 (⊕ Overdub); MIDI CC 80 / 81 (value ≥ 64).
// Never a Demande or a Réponse during a take (busy()).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const T = AMB.theory;
  const MAX = 4, LENS = [1, 2, 4, 8], UNDO = 12, BUF_MAX = 256;
  const r2 = (x) => Math.round(x * 100) / 100;

  // a pitch as scale degree (+ sharp) from octave 0 of the key, and back: a loop follows the key and the scale
  function toDeg(midi) {
    const S = AMB.seq, sc = S.scale, n = sc.length, x = midi - 12 - S.root;
    const oct = Math.floor(x / 12), pc = x - oct * 12;
    let i = 0; while (i + 1 < n && sc[i + 1] <= pc) i++;
    return { d: oct * n + i, a: pc - sc[i] };
  }
  const toMidi = (n) => T.degreeToMidi(n.d, AMB.seq.root, AMB.seq.scale, 0) + (n.a || 0);

  const seq = () => AMB.seq;
  const now = () => (AMB.engine.ctx ? AMB.engine.ctx.currentTime : 0);
  const outLat = () => { const c = AMB.engine.ctx; return c ? c.outputLatency || c.baseLatency || 0 : 0; };
  // the sequencer position (in 16ths, fractional) of an audio time on the scheduler's grid
  const absAt = (t) => { const S = seq(); return S.step + (t - S.nextTime) / S.stepDur(); };
  const heardAbs = () => absAt(now() - outLat()); // where the listener is now
  const origin = () => seq().origin || 0;

  // ---------- what was played lately (for ⤓ Garder): notes and forced chords, and the Mélodie auto's notes ----------
  const heard = [], heardById = new Map(), auto = [];
  const bufSpan = () => 8 * 16 * seq().stepDur() * 1.05; // 8 bars, the longest loop
  const trim = (ring, t) => { while (ring.length > BUF_MAX || (ring.length && ring[0].at < t - bufSpan())) { const e = ring.shift(); if (e.id) heardById.delete(e.id); } };

  const looper = {
    bars: 2, quant: false, state: 'idle', take: null, undos: [],
    sec() { return AMB.song && AMB.song.sel(); },
    layers() { const s = this.sec(); return s ? (s.loops = s.loops || []) : []; },
    busy() { return this.state !== 'idle'; },

    // ---- the takes ----
    // ● Boucle: count-in, then `bars` bars into a new layer. Pressed again: the count is cancelled / the take ends now.
    rec() {
      if (this.state === 'count' || this.state === 'rec') return this.end();
      if (this.state === 'dub') this.end();
      if (!this.ready()) return;
      if (this.layers().length >= MAX) { AMB.ui.toast(`${MAX} couches au plus : efface-en une (✕) ou ⊕ Overdub`); return; }
      this.begin('count');
    },
    // ⊕ Overdub: onto the last layer, right away, loop after loop, until pressed again (no layer yet: a new one)
    dub() {
      if (this.state === 'dub') return this.end();
      if (this.state !== 'idle') this.end();
      if (!this.layers().length) return this.rec();
      if (!this.ready()) return;
      this.begin('dub');
    },
    // a section to hold the loops (the first one = what is heard: « + Section »), the music playing, no Rec live
    ready() {
      const R = AMB.pianoRoll && AMB.pianoRoll.roll;
      if (R && R.recording) { AMB.ui.toast('Arrête d\'abord le Rec live du piano roll'); return false; }
      if (!AMB.song) return false;
      if (!this.sec()) { AMB.song.add(); AMB.ui.toast(`Boucles dans la section « ${this.sec().name} »`); }
      return true;
    },
    begin(state) {
      const sec = this.sec(), S = seq();
      this.pushUndo(sec);
      // nothing else asks for the player's notes during a take
      if (AMB.demands && AMB.demands.busy()) AMB.demands.cancel();
      if (AMB.puzzles && AMB.puzzles.cur) AMB.puzzles.cancel();
      let layer;
      if (state === 'dub') layer = sec.loops[sec.loops.length - 1];
      else { layer = { bars: this.bars, mute: false, notes: [] }; sec.loops.push(layer); }
      layer.mute = false;
      this.take = { sec, layer, from: null, to: Infinity, held: new Map(), n: 0 };
      this.state = state;
      if (state === 'dub') this.take.from = -Infinity;
      else if (S.playing) this.take.from = this.barAfter(Math.max(heardAbs() + 3, S.step));
      // stopped: the playback starts, the count-in is the first bar (set on the first step)
      if (!S.playing && AMB.ui && AMB.ui.play) Promise.resolve(AMB.ui.play()).catch(() => {});
      this.render(); this.save();
    },
    // first bar line (from the section's start) at or after abs
    barAfter(abs) { const o = origin(); return o + Math.ceil((abs - o) / 16) * 16; },
    // end of a take: what was played stays (an empty new layer goes); notes still held end here
    end(cancel = false) {
      const k = this.take; if (!k) { this.state = 'idle'; return this.render(); }
      const len = k.layer.bars * 16, stop = Math.min(k.to, heardAbs());
      for (const [, h] of k.held) h.n.l = r2(Math.max(0.5, Math.min(len, stop - h.abs)));
      const empty = !k.layer.notes.length;
      if (empty && this.state !== 'dub') k.sec.loops.splice(k.sec.loops.indexOf(k.layer), 1);
      if (empty || cancel) this.undos.pop(); // nothing happened: nothing to undo
      const n = k.n;
      this.take = null; this.state = 'idle';
      if (!cancel) AMB.ui.toast(n ? `Boucle : ${n} note${n > 1 ? 's' : ''} · ${k.layer.bars} mes.` : 'Rien de joué : pas de boucle');
      if (n && AMB.bus) AMB.bus.emit('act', 'loop');
      this.save(); this.render();
    },

    // a note heard at abs: its place in the layer (from the section's bar lines), lightly pulled to the 16th if asked
    place(abs, len) {
      let p = abs - origin();
      if (this.quant) p += (Math.round(p) - p) * 0.6;
      return r2(((p % len) + len) % len);
    },
    // a played note (pads, keys, MIDI): into the take if it falls inside it (just before the 1 counts as the 1)
    onLive(ev) {
      const at = ev.played != null ? ev.played : ev.time;
      const e = { id: ev.id, midi: ev.midi, at, end: null, vel: ev.vel, raw: ev.raw, abs: seq().playing ? absAt(at) : null };
      heard.push(e); if (ev.id) heardById.set(ev.id, e); trim(heard, at);
      const k = this.take; if (!k || e.abs == null || this.state === 'count' && k.from == null) return;
      const abs = Math.max(e.abs, k.from); // up to half a 16th early = on the 1
      if (e.abs < k.from - 0.5 || abs >= k.to - 0.5) return;
      const len = k.layer.bars * 16, n = { s: this.place(abs, len), ...toDeg(ev.midi), l: 1, v: r2(ev.vel) };
      if (ev.raw != null) n.b = r2(ev.raw);
      k.layer.notes.push(n); k.n++;
      if (ev.id) k.held.set(ev.id, { n, abs: e.abs });
      this.renderChips();
    },
    onLiveOff(ev) {
      const at = ev.played != null ? ev.played : ev.time;
      const e = heardById.get(ev.id); if (e) { e.end = at; heardById.delete(ev.id); }
      const k = this.take, h = k && k.held.get(ev.id); if (!h) return;
      k.held.delete(ev.id);
      h.n.l = r2(Math.max(0.5, Math.min(k.layer.bars * 16, absAt(at) - h.abs)));
    },
    // a chord forced by the player (Z–M, low MIDI notes, long press on a pad)
    onChord(c) {
      if (!c || !c.forced || !seq().playing) return;
      const at = now() - outLat(), abs = absAt(at);
      heard.push({ chord: c.deg, at, abs }); trim(heard, at);
      const k = this.take; if (!k || this.state === 'count' || abs < k.from - 0.5 || abs >= k.to - 0.5) return;
      k.layer.notes.push({ s: this.place(Math.max(abs, k.from), k.layer.bars * 16), c: c.deg }); k.n++;
      this.renderChips();
    },

    // ---- called by the sequencer on every 16th (after the melody, before the piano roll) ----
    onStep(step, time, sd) {
      const k = this.take;
      if (k) {
        if (this.state === 'count' && k.from == null) k.from = this.barAfter(Math.max(step + 1, heardAbs() + 3));
        // count-in: a click on each beat up to the 1 (accent on the bar), then the metronome of the piano roll if on
        const rel = step - origin(), metro = !AMB.pianoRoll || AMB.pianoRoll.roll.metro;
        if (rel % 4 === 0 && AMB.pianoRoll && AMB.pianoRoll.click && (this.state === 'count' ? step < k.from : metro))
          AMB.pianoRoll.click(time, rel % 16 === 0);
        if (this.state === 'count' && step >= k.from) { this.state = 'rec'; k.to = k.from + k.layer.bars * 16; }
        const h = heardAbs();
        if (this.state === 'rec' && h >= k.to + 0.5) this.end();
        else this.renderStatus(h);
      }
      // the selected section's layers (a layer being recorded plays what it already holds)
      const L = AMB.layers, bells = L && L.bells; if (!bells) return;
      for (const layer of this.layers()) {
        if (layer.mute || !layer.notes.length) continue;
        const len = layer.bars * 16, i = (((step - origin()) % len) + len) % len;
        for (const n of layer.notes) {
          if (n.s < i || n.s >= i + 1) continue;
          const t = time + (n.s - i) * sd;
          if (n.c != null) { seq().forceChord(n.c, false, t); continue; }
          if (!store.get('bells.on')) bells.ch.setLevel(Math.pow(store.get('bells.vol'), 1.6)); // the voice of the played notes
          bells.note(toMidi(n), t, n.v, true, (n.l || 1) * sd, { bright: n.b != null ? n.b : null, loop: true });
        }
      }
    },

    // ⤓ Garder: the last `bars` bars played (ending with the bar of the last note) become a new layer, without having
    // pressed anything; nothing played lately: the Mélodie auto's. src 'melody' = the Mélodie even if notes were played
    keep(src) {
      const S = seq(), sd = S.stepDur(), t = now(), len = this.bars * 16;
      if (this.state !== 'idle') this.end();
      if (this.layers().length >= MAX && this.sec()) { AMB.ui.toast(`${MAX} couches au plus : efface-en une (✕)`); return null; }
      const recent = (r) => r.filter((e) => e.at > t - bufSpan() && e.at <= t);
      let ph = src === 'melody' ? [] : recent(heard);
      const mel = !ph.some((e) => e.midi != null);
      if (mel) ph = recent(auto);
      if (!ph.length) { AMB.ui.toast('Rien à garder : joue d\'abord quelques notes'); return null; }
      const grid = ph[ph.length - 1].abs != null;
      ph = ph.filter((e) => (e.abs != null) === grid);
      // with the music: the grid and its bars; stopped: the first note kept is the 1
      const o = grid ? origin() : 0, last = ph[ph.length - 1];
      const pos = grid ? (e) => e.abs : (e) => (e.at - ph.find((x) => x.at >= last.at - len * sd).at) / sd;
      const endBar = grid ? o + (Math.floor((Math.round(pos(last)) - o) / 16) + 1) * 16 : len;
      ph = ph.filter((e) => pos(e) >= endBar - len - 0.5);
      if (!ph.length || !this.ready()) return null;
      const sec = this.sec();
      this.pushUndo(sec);
      const notes = ph.map((e) => {
        const p = r2(((Math.max(pos(e), endBar - len) - o) % len + len) % len);
        if (e.chord != null) return { s: p, c: e.chord };
        const n = { s: p, ...toDeg(e.midi), l: r2(Math.max(0.5, Math.min(len, ((e.end != null ? e.end : t) - e.at) / sd))), v: r2(e.vel) };
        if (e.raw != null) n.b = r2(e.raw);
        return n;
      });
      const layer = { bars: this.bars, mute: false, notes };
      sec.loops.push(layer);
      AMB.ui.toast(`⤓ ${notes.length} note${notes.length > 1 ? 's' : ''}${mel ? ' de la Mélodie auto' : ''} en boucle · ${this.bars} mes.`);
      if (AMB.bus) AMB.bus.emit('act', 'loop');
      this.save(); this.render();
      return layer;
    },
    canKeep() { const t = now(); return [heard, auto].some((r) => r.length > 0 && r[r.length - 1].at > t - bufSpan()); },

    // ---- layers: mute, erase, undo the last take ----
    mute(i) { const l = this.layers()[i]; if (!l) return; l.mute = !l.mute; this.save(); this.render(); },
    erase(i) {
      const sec = this.sec(), l = sec && sec.loops[i]; if (!l) return;
      if (this.take && this.take.layer === l) this.end(true);
      this.pushUndo(sec); sec.loops.splice(i, 1); this.save(); this.render();
    },
    pushUndo(sec) { this.undos.push({ sec, loops: JSON.stringify(sec.loops || []) }); if (this.undos.length > UNDO) this.undos.shift(); },
    undo() {
      if (this.state !== 'idle') this.end(true);
      const u = this.undos.pop(); if (!u) return;
      u.sec.loops = JSON.parse(u.loops);
      if (AMB.song && !AMB.song.sections.includes(u.sec)) return this.undo(); // a section deleted since
      AMB.ui.toast('↶ Dernière prise annulée');
      this.save(); this.render();
    },
    save() { if (AMB.song) { AMB.song.saveSoon(); AMB.song.renderMeta(); } },

    // ---- interface: one row of the Morceau panel ----
    build(panel) {
      const row = document.createElement('div');
      row.className = 'looper';
      row.innerHTML = `<span class="loop-label">Boucles</span>
        <select class="loop-len" aria-label="Longueur de la boucle">${LENS.map((b) => `<option value="${b}">${b} mes.</option>`).join('')}</select>
        <button class="btn small rec-btn" data-l="rec" title="Touche 0 · CC 80 : décompte jusqu'au prochain 1, enregistre ce que tu joues (pastilles, clavier, MIDI) sur la longueur choisie, puis le rejoue en boucle">● Boucle</button>
        <button class="btn small" data-l="dub" title="Touche 9 · CC 81 : ajoute ce que tu joues à la dernière couche, tour après tour, jusqu'au prochain appui">⊕ Overdub</button>
        <button class="btn small" data-l="keep" title="Garde les dernières mesures que tu viens de jouer (sans avoir appuyé sur ●) comme nouvelle couche ; sans note jouée, celles de la Mélodie auto">⤓ Garder</button>
        <button class="btn small" data-l="undo" title="Annuler la dernière prise" aria-label="Annuler la dernière prise">↶</button>
        <label class="btn small" title="Rapproche légèrement chaque note de la double croche la plus proche"><input type="checkbox" data-l="q"> Caler</label>
        <span class="loop-chips" aria-label="Couches de boucle"></span>`;
      const ref = panel.querySelector('.roll-tools');
      panel.insertBefore(row, ref);
      this.row = row; this.chips = row.querySelector('.loop-chips');
      this.btnRec = row.querySelector('[data-l=rec]'); this.btnDub = row.querySelector('[data-l=dub]');
      this.btnKeep = row.querySelector('[data-l=keep]'); this.btnUndo = row.querySelector('[data-l=undo]');
      const lenSel = row.querySelector('.loop-len'); lenSel.value = String(this.bars);
      lenSel.addEventListener('change', () => { this.bars = Number(lenSel.value); });
      row.querySelector('[data-l=q]').addEventListener('change', (e) => { this.quant = e.target.checked; });
      row.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const a = b.dataset.l;
        if (a === 'rec') this.rec(); else if (a === 'dub') this.dub(); else if (a === 'keep') this.keep(); else if (a === 'undo') this.undo();
        else if (b.dataset.x != null) this.erase(Number(b.dataset.x));
        else if (b.dataset.k != null) this.mute(Number(b.dataset.k));
      });
      const tick = () => { if (this.btnKeep.disabled === this.canKeep()) this.btnKeep.disabled = !this.canKeep(); setTimeout(tick, 400); };
      tick();
      this.render();
    },
    render() {
      if (!this.row) return;
      const st = this.state, sec = this.sec();
      this.btnRec.classList.toggle('rec', st === 'count' || st === 'rec');
      this.btnDub.classList.toggle('rec', st === 'dub');
      this.btnRec.textContent = st === 'count' ? '● …' : st === 'rec' ? '■ Boucle' : '● Boucle';
      this.btnDub.textContent = st === 'dub' ? '■ Overdub' : '⊕ Overdub';
      this.btnUndo.disabled = !this.undos.length;
      this.row.classList.toggle('loop-busy', st !== 'idle');
      this.row.title = sec ? '' : 'La première boucle crée une section';
      this.renderChips();
    },
    renderChips() {
      if (!this.chips) return;
      const ls = this.layers(), cur = this.take && this.take.layer;
      this.chips.innerHTML = ls.map((l, i) => {
        const notes = l.notes.filter((n) => n.c == null).length, ch = l.notes.length - notes;
        const what = [notes && `${notes} ♪`, ch && `${ch} acc.`].filter(Boolean).join(' ') || 'vide';
        return `<span class="loop-chip${l.mute ? ' mute' : ''}${l === cur ? ' rec' : ''}"><button data-k="${i}" aria-pressed="${!l.mute}" title="${l.mute ? 'Remettre' : 'Couper'} la couche ${i + 1}"><b>${i + 1}</b> ${l.bars} mes. · ${what}</button><button data-x="${i}" title="Effacer la couche ${i + 1}" aria-label="Effacer la couche ${i + 1}">✕</button></span>`;
      }).join('') || '<span class="loop-empty">Joue, puis ● ou ⤓</span>';
    },
    // the count-in (beats to the 1) and the take's bar, on the button
    renderStatus(h) {
      const k = this.take; if (!k || !this.btnRec) return;
      if (this.state === 'count' && k.from != null) { const b = Math.max(1, Math.ceil((k.from - h) / 4)); this.btnRec.textContent = `● ${b}…`; }
      else if (this.state === 'rec') this.btnRec.textContent = `■ ${Math.max(1, Math.min(k.layer.bars, Math.floor((h - k.from) / 16) + 1))}/${k.layer.bars}`;
    },
  };

  if (AMB.bus) {
    AMB.bus.on('live', (ev) => ev && looper.onLive(ev));
    AMB.bus.on('liveOff', (ev) => ev && looper.onLiveOff(ev));
    AMB.bus.on('chord', (c) => looper.onChord(c));
    AMB.bus.on('note', (ev) => { // the Mélodie auto (not the player, not a loop): what ⤓ Garder keeps when nothing was played
      const S = seq();
      if (!ev || ev.layer !== 'bells' || ev.live || ev.loop || !S.playing) return;
      auto.push({ midi: ev.midi, at: ev.time, end: ev.time + Math.min(ev.dur, 4 * S.stepDur()), vel: ev.vel, abs: absAt(ev.time) });
      trim(auto, ev.time);
    });
    // ■ Stop: the take ends with what was played; another mode / section: the take ends there
    AMB.bus.on('panic', () => { if (looper.state !== 'idle') looper.end(); });
    AMB.bus.on('game:mode', () => { if (looper.state !== 'idle') looper.end(true); looper.render(); });
    AMB.bus.on('section', () => { if (looper.take && looper.take.sec !== looper.sec()) looper.end(); looper.render(); });
  }
  // keys 0 (● Boucle) and 9 (⊕ Overdub), where the Morceau panel is open
  document.addEventListener('keydown', (e) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code !== 'Digit0' && e.code !== 'Digit9') return;
    if (!AMB.engine.ctx || (AMB.tree && !AMB.tree.uiUnlocked('song'))) return;
    e.preventDefault();
    if (e.code === 'Digit0') looper.rec(); else looper.dub();
  });

  AMB.looper = looper;
})();
