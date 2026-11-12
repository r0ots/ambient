// « Jardin sonore » : the Écho (S3.1) — the instrument plays a short phrase on the Melody voice, in the current key and
// scale; the player plays it back (A–L keys, the card's pads or MIDI, the 'live' path) and gets one peg per note:
// ✓ right, ⬆ play higher, ⬇ play lower (any octave on MIDI). A whole phrase right = done: its node opens (an Écho is a
// challenge of js/contracts.js, kind 'echo'). Each new attempt draws a new phrase (seeded game rng); after 6 attempts
// the node opens anyway (never a dead end). S4.3: the « set the knobs to a target » puzzles are gone.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const TRIES = 6;
  const ECHO_DEGS = 9, ECHO_GAP = 0.55; // A–L = degrees 0..8 of octave 4; seconds between the phrase's notes
  const def = (id) => { const d = AMB.contracts && AMB.contracts.byId[id]; return d && d.kind === 'echo' ? d : null; };
  // 3 notes at difficulty 0, up to 6 at 1
  const echoLen = (d) => Math.max(3, Math.min(6, 3 + Math.round((d || 0) * 3)));
  // a singable phrase: a walk of steps (seconds, thirds; a fourth from d ≥ 0.5) inside A–L, never twice the same note in a row
  function echoPhrase(d, rnd) {
    const n = echoLen(d), steps = d >= 0.5 ? [-3, -2, -1, 1, 2, 3] : [-2, -1, 1, 2];
    const out = [Math.floor(rnd() * 5)];
    while (out.length < n) {
      const p = out[out.length - 1], ok = steps.map((s) => p + s).filter((x) => x >= 0 && x < ECHO_DEGS);
      out.push(ok[Math.floor(rnd() * ok.length)]);
    }
    return out;
  }

  const puzzles = {
    TRIES, echoLen, echoPhrase,
    // a new phrase (seeded game rng), never the same as the previous one
    draw(id, prev = null) {
      const d = def(id), rnd = AMB.contracts.rng();
      let t = null;
      for (let i = 0; i < 10; i++) { t = { degs: echoPhrase(d.d, rnd) }; if (!prev || t.degs.join() !== prev.degs.join()) break; }
      return t;
    },
    target(id = this.current) { const r = this.run(id); return r && r.target; },
    current: null,
    // the attempt in progress (kept in the game state until done: closing the card and coming back gives neither the
    // 6 attempts nor a new phrase)
    run(id = this.current, g = AMB.game) {
      if (!id || !def(id)) return null;
      const runs = g.s.runs || (g.s.runs = {});
      const r = runs[id] || (runs[id] = { tries: [] });
      if (!r.target || !r.target.degs) { r.target = this.draw(id); g.save(); } // older saves: a knob target
      return r;
    },
    start(id) {
      if (!def(id)) return false;
      if (this.current && this.current !== id) this.stop();
      this.current = id; this.run(id);
      AMB.game.emit('puzzle', { id });
      return true;
    },
    stop() { this.current = null; this.echoRow = []; AMB.game.emit('puzzle', { id: null }); },

    isEcho(id = this.current) { return !!def(id); },
    echoRow: [], // pegs of the phrase being played back (the attempt in progress)
    echoFrom: 0, echoUntil: 0, // audio times of the phrase: notes played meanwhile are not judged, the Melody auto is silent
    // the Melody's own generative notes keep quiet while the instrument plays the phrase (they resume right after)
    hush(time) { return time >= this.echoFrom && time <= this.echoUntil; },
    // the phrase's notes, in the current key and scale, where the A–L keys play them
    echoMidis(id = this.current) {
      const t = this.target(id), S = AMB.seq; if (!t || !t.degs || !S) return [];
      return t.degs.map((dg) => AMB.theory.degreeToMidi(dg, S.root, S.scale, 4));
    },
    // the instrument plays the phrase on the Melody voice, like the player's notes (no 'live' event: it is not played
    // by the player, nothing counts it); the ambience is left as it is. Returns the number of notes scheduled.
    echoPlay(id = this.current) {
      const ctx = AMB.engine && AMB.engine.ctx, L = AMB.layers;
      if (!this.isEcho(id) || !AMB.game.path || !ctx || !L || !L.bells) return 0;
      if (!store.get('bells.on')) L.bells.ch.setLevel(Math.pow(store.get('bells.vol'), 1.6)); // as seq.playMidi does
      const ms = this.echoMidis(id), t0 = ctx.currentTime + 0.12;
      const S = AMB.seq, live = { dest: S && !S.playing && S.liveDest ? S.liveDest(L.bells) : null }; // heard while stopped too
      ms.forEach((m, i) => L.bells.note(m, t0 + i * ECHO_GAP, 0.8, true, 0, live));
      this.echoFrom = t0 - 0.05; this.echoUntil = t0 + (ms.length - 1) * ECHO_GAP + 0.1;
      return ms.length;
    },
    // a note played by the player (path only): one peg; the last note of the phrase makes the attempt.
    // Returns null (not judged), { row } (in progress) or the attempt's result.
    echoInput(midi, id = this.current) {
      if (!this.isEcho(id) || !AMB.game.path || this.current !== id) return null;
      const ctx = AMB.engine && AMB.engine.ctx; if (ctx && ctx.currentTime < this.echoUntil) return null;
      const ms = this.echoMidis(id), i = this.echoRow.length, t = ms[i]; if (t === undefined) return null;
      // any octave (a MIDI keyboard): the note is brought to the octave nearest the target, then compared (same pitch
      // class = right; otherwise the arrow says which way, within that octave)
      const m = midi + 12 * Math.round((t - midi) / 12);
      this.echoRow.push({ key: 'n' + (i + 1), state: m === t ? 'ok' : 'far', dir: m === t ? null : m < t ? 'up' : 'down' });
      if (this.echoRow.length < ms.length) { AMB.game.emit('puzzle', { id, note: i + 1 }); return { row: this.echoRow }; }
      const res = this.attempt(id);
      AMB.game.emit('puzzle', { id, res });
      return res;
    },
    // the whole phrase played back: right when every note is. Returns { ok, row, tries, left, out } or null.
    // Done (or out of attempts): the challenge finishes and its node opens.
    attempt(id = this.current) {
      if (!def(id) || this.echoRow.length < this.echoMidis(id).length) return null;
      const g = AMB.game, r = this.run(id, g), pegs = this.echoRow;
      this.echoRow = [];
      const row = { total: pegs.filter((p) => p.state === 'ok').length / pegs.length, pegs };
      r.tries.push(row);
      const res = { ok: row.total === 1, row, tries: r.tries.length, left: TRIES - r.tries.length };
      if (res.ok || res.left <= 0) {
        res.out = !res.ok;
        delete g.s.runs[id]; if (this.current === id) this.current = null;
        AMB.contracts.finish(id, g);
      } else { r.target = this.draw(id, r.target); g.save(); } // a new phrase at each attempt
      return res;
    },
  };

  // the player's notes (computer keyboard, pads or MIDI, already heard on the Melody voice) are judged in the path only
  if (AMB.bus) AMB.bus.on('live', (n) => { if (n && puzzles.isEcho()) puzzles.echoInput(n.midi); });

  AMB.puzzles = puzzles;
})();
