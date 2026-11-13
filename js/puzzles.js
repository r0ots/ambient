// « Jardin sonore » : « Réponse » (S4.2) — the Écho played INSIDE the music, no card. While the instrument plays in the
// path, the Melody auto now and then plays a marked phrase on the grid (one bar; the Melody plant lights up, the LCD says
// « ↺ À toi »); the player plays it back right after (A–L keys, pads or MIDI, any octave), one leaf per note on the
// plant: right, or red. Successes in a row make the phrases longer (3 → 8 notes); from 5 notes the rhythm counts too
// (each note against its place in the answer bar, timed with 'live'.played = seq.playedAt, latency compensated); a miss
// gives a shorter phrase. A phrase left unanswered changes nothing: the music goes on. Nothing is earned without playing.
// The gates (challenges kind 'reponse', js/contracts.js) open on a right answer of N notes (N from the depth of the node:
// 3 or 4 notes, never timed), or after 6 misses (never a dead end). Nothing in free mode nor once the instrument is
// handed over. The ambience is never touched: only the Melody auto yields during the phrase and its answer.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const MIN = 3, MAX = 8, RHYTHM = 5, TRIES = 6, DEGS = 9; // A–L = degrees 0..8 of octave 4
  const GAP = { gate: 1, free: 4 }; // bars of plain music between two phrases (a gate to open: right away)
  const SHOW = 3; // seconds the leaves of the last answer stay on the plant
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // a gate's length from its difficulty d (0..1): 3 notes at 0, up to 6 at 1
  const respLen = (d) => clamp(3 + Math.round((d || 0) * 3), 3, 6);
  // a singable phrase of n notes: a walk of steps (seconds, thirds; a fourth from 5 notes) inside A–L, no note twice in a row
  function phrase(n, rnd) {
    const steps = n >= RHYTHM ? [-3, -2, -1, 1, 2, 3] : [-2, -1, 1, 2];
    const out = [Math.floor(rnd() * 5)];
    while (out.length < n) {
      const p = out[out.length - 1], ok = steps.map((s) => p + s).filter((x) => x >= 0 && x < DEGS);
      out.push(ok[Math.floor(rnd() * ok.length)]);
    }
    return out;
  }
  // where its notes fall in the bar (16th steps): on the beats up to 4 notes (slow, the rhythm is not judged);
  // from 5 notes, a rhythm on the eighths, always starting on the downbeat
  function rhythm(n, rnd) {
    if (n < RHYTHM) return Array.from({ length: n }, (_, i) => i * 4);
    const pool = [1, 2, 3, 4, 5, 6, 7];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return [0].concat(pool.slice(0, n - 1).sort((a, b) => a - b)).map((e) => e * 2);
  }

  const R = {
    MIN, MAX, RHYTHM, TRIES, GAP, respLen, phrase, rhythm,
    cur: null, // the phrase waiting for its answer: { gate, degs, midis, steps, len, timed, sd, t0, from, ans, until, row }
    last: null, // the phrase just answered (its leaves stay a moment on the plant)
    wait: GAP.free, // bar lines to let pass before the next phrase (the music first)
    ignored: 0, // phrases left unanswered in a row (the next ones come more rarely)
    now() { const c = AMB.engine && AMB.engine.ctx; return c ? c.currentTime : 0; },
    // saved: the length reached, successes in a row, the best, the misses per gate
    st(g = AMB.game) {
      const s = g.s.resp || (g.s.resp = {});
      s.len = clamp(s.len | 0 || MIN, MIN, MAX); s.streak = s.streak | 0; s.best = s.best | 0; s.miss = s.miss || {};
      return s;
    },
    // the gate to open now: the active challenge, when it is a kind 'reponse'
    gate(g = AMB.game) {
      const K = AMB.contracts, id = K && g.path ? K.state(g).active[0] : null, d = id && K.byId[id];
      return d && d.kind === 'reponse' ? d : null;
    },
    need(d) { return respLen(d.d); },
    // path only, once the Melody is there; never in free mode nor once the instrument is handed over
    can(g = AMB.game) { return !!g && g.counts() && g.has('m.bells'); },
    busy() { return !!this.cur; },
    // the Melody auto keeps quiet from the phrase to the end of its answer (js/sequencer.js melodyNote)
    hush(time) { const c = this.cur; return !!c && time >= c.t0 - 0.05 && time <= c.until; },
    tol(sd) { return Math.max(0.09, sd * 1.2); }, // timing tolerance of a timed note (seconds)

    // at each step of the sequencer: an answer window that ran out closes; on a bar line, maybe a new phrase
    onStep(step, time, sd) {
      if (this.cur && this.now() >= this.cur.until) this.close();
      const S = AMB.seq;
      if (this.cur || (step - ((S && S.origin) || 0)) % 16 !== 0) return false;
      const g = AMB.game; if (!this.can(g)) return false;
      const gate = this.gate(g);
      if (gate) this.wait = Math.min(this.wait, GAP.gate); // a gate to open: its phrase comes soon
      if (this.wait > 0) { this.wait--; return false; }
      if (!gate && !store.get('bells.on')) return false; // the mastery loop needs the Melody heard
      if (AMB.pianoRoll && AMB.pianoRoll.roll && AMB.pianoRoll.roll.recording) return false; // Rec live: the notes are the roll's
      return this.launch(time, sd, gate);
    },
    // the marked phrase, on the grid of the bar starting at `time`, on the Melody voice
    launch(time, sd, gate = this.gate()) {
      const L = AMB.layers, S = AMB.seq, g = AMB.game; if (!L || !L.bells || !S || !AMB.contracts) return false;
      const s = this.st(g), rnd = AMB.contracts.rng(g);
      const len = gate ? Math.min(s.len, this.need(gate)) : s.len, timed = len >= RHYTHM;
      const degs = phrase(len, rnd), steps = rhythm(len, rnd), bar = 16 * sd;
      const midis = degs.map((dg) => AMB.theory.degreeToMidi(dg, S.root, S.scale, 4));
      if (!store.get('bells.on') && L.bells.ch) L.bells.ch.setLevel(Math.pow(store.get('bells.vol'), 1.6)); // a gate: heard anyway
      midis.forEach((m, i) => L.bells.note(m, time + steps[i] * sd, 0.85, true));
      const end = time + steps[len - 1] * sd;
      this.cur = {
        gate: gate ? gate.id : null, degs, midis, steps, len, timed, sd, t0: time, row: [],
        from: end + Math.min(0.15, sd), // notes played along with the phrase are not an answer
        ans: time + bar, // the answer bar
        until: timed ? time + 2 * bar + this.tol(sd) : time + bar + Math.max(2 * bar, 6), // untimed: take your time
      };
      this.last = null;
      g.emit('puzzle', { phase: 'call', len, ans: this.cur.ans });
      return true;
    },
    // a note played by the player ('live', path only): one leaf. Returns null (not an answer), { row } or the result.
    input(midi, played = this.now()) {
      const c = this.cur; if (!c || !this.can()) return null;
      if (played > c.until) { this.close(); return null; }
      if (played < c.from) return null;
      const i = c.row.length, t = c.midis[i];
      const m = midi + 12 * Math.round((t - midi) / 12); // any octave (a MIDI keyboard): the nearest one is compared
      let peg;
      if (m !== t) peg = { state: 'far', dir: m < t ? 'up' : 'down' };
      else if (c.timed) {
        const dt = played - (c.ans + c.steps[i] * c.sd);
        peg = Math.abs(dt) <= this.tol(c.sd) ? { state: 'ok', dir: null } : { state: 'off', dir: dt < 0 ? 'early' : 'late' };
      } else peg = { state: 'ok', dir: null };
      c.row.push(peg);
      AMB.game.emit('puzzle', { phase: 'note', i, peg });
      return c.row.length === c.len ? this.close() : { row: c.row };
    },
    // the answer is complete, or its window ran out. Unanswered: nothing changes. Returns the result or null.
    close() {
      const c = this.cur; if (!c) return null;
      this.cur = null;
      const g = AMB.game, s = this.st(g), gate = this.gate(g);
      if (!c.row.length) {
        this.ignored++;
        this.wait = c.gate ? GAP.gate : Math.min(16, GAP.free * (1 + this.ignored));
        g.emit('puzzle', { phase: 'end', res: null });
        return null;
      }
      this.ignored = 0;
      const ok = c.row.length === c.len && c.row.every((p) => p.state === 'ok');
      s.streak = ok ? s.streak + 1 : 0;
      s.len = ok ? Math.min(MAX, Math.max(s.len, c.len + 1)) : Math.max(MIN, c.len - 1);
      if (ok) s.best = Math.max(s.best, c.len);
      const res = { ok, len: c.len, row: c.row, next: s.len, streak: s.streak, gate: c.gate };
      this.last = Object.assign(c, { ok, at: this.now() });
      this.wait = gate ? GAP.gate : GAP.free;
      if (gate && c.gate === gate.id) {
        const miss = ok ? 0 : (s.miss[gate.id] || 0) + 1;
        if (ok && c.len >= this.need(gate)) res.open = gate.id;
        else if (!ok) { s.miss[gate.id] = miss; res.left = TRIES - miss; if (miss >= TRIES) { res.open = gate.id; res.out = true; } }
        if (res.open) { delete s.miss[gate.id]; AMB.contracts.finish(gate.id, g); }
      }
      g.save();
      g.emit('puzzle', { phase: 'end', res });
      return res;
    },
    // playback stopped, free mode, path restarted: the phrase goes, nothing is judged
    cancel() {
      const was = this.cur || this.last; this.cur = null; this.last = null; this.wait = GAP.free; this.ignored = 0;
      if (was && AMB.game) AMB.game.emit('puzzle', { phase: 'end', res: null });
    },
    // what the Melody plant shows (js/garden-visual.js): 'call' (the phrase is played: it blinks), 'answer' (lit, one leaf
    // per note played), 'done' (the leaves of the answer, a moment), or null
    view(now = this.now()) {
      const c = this.cur;
      if (c) return { phase: now < c.from ? 'call' : 'answer', len: c.len, row: c.row, timed: c.timed };
      const l = this.last;
      if (l && now - l.at < SHOW && this.can()) return { phase: 'done', len: l.len, row: l.row, ok: l.ok, age: now - l.at };
      return null;
    },
  };

  if (AMB.bus) {
    // the player's notes (keys, pads or MIDI, already heard on the Melody voice), at the moment they were played
    AMB.bus.on('live', (n) => { if (n && R.cur) R.input(n.midi, n.played != null ? n.played : n.time != null ? n.time : R.now()); });
    AMB.bus.on('panic', () => R.cancel()); // playback stopped
    ['game:mode', 'game:reset'].forEach((e) => AMB.bus.on(e, () => R.cancel()));
  }

  AMB.puzzles = R;
})();
