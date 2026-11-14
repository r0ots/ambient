// « Jardin sonore » : « Réponse » (S4.2) — the Écho played INSIDE the music, no card. While the instrument plays in the
// path, the Melody auto now and then plays a marked phrase on the grid (one bar; the Melody plant lights up, the LCD says
// « ↺ À toi »); the player plays it back right after (A–L keys, pads or MIDI, any octave), one leaf per note on the
// plant: right, or red. Each success climbs one level, a miss goes one level down (S5.3: no ceiling, `level` below):
// phrases of 3 → 8 notes (from 5 notes the rhythm counts too, each note against its place in the answer bar, timed with
// 'live'.played = seq.playedAt, latency compensated), then named tiers: octave leaps, syncopations, the phrase answered
// a fifth higher, chords (any inversion, by hand on MIDI or a long press on a pad), then combinations judged tighter.
// A phrase left unanswered changes nothing: the music goes on. Nothing is earned without playing.
// The gates (challenges kind 'reponse', js/contracts.js) open on a right answer of N notes (N from the depth of the node:
// 3 or 4 notes, never timed, never a tier), or after 6 misses (never a dead end). Nothing in free mode nor once the
// instrument is handed over. The ambience is never touched: only the Melody auto yields during the phrase and its answer.
// Bus (S5.3, for the juice): 'resp:streak' {streak}, 'resp:record' {best}, 'resp:tier' {tier, name, lvl};
// S5.4 'resp:place' {id, name, nodes} (placement, PLACE below); S6.7 'resp:call' {notes: [{midis, time, dur}]} (the pads
// light up on the machine's phrase, like a Simon: js/play.js).
// S6.7: « À toi » leaves at least START s for the first note; a timed answer is judged from the beat its first note comes
// on; a wrong answer says « RATÉ » (garden.FX) and the phrase is played once more. ONE table of timing windows
// (TOL), in absolute seconds: tight at the MIDI keyboard, a child's at the pads and keys. At the MIDI keyboard (or after a
// first long answer right and tight), the ladder skips the Phrases and starts at the Octaves.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const MIN = 3, MAX = 8, RHYTHM = 5, TRIES = 6, DEGS = 9; // A–L = degrees 0..8 of octave 4
  const GAP = { gate: 1, free: 4, hot: 2 }; // bars of plain music between two phrases (a gate to open, a replay: right away; after a right answer: soon)
  const START = 5; // s: the least the player has after « À toi » to play the first note
  // S6.7 THE timing windows (± s, absolute, after latency compensation: 'live'.played), one row per hand.
  // parfait / bien: the live asks (js/demands.js; beyond bien, RATÉ up to two beats); juste: a timed note of the Réponse.
  const TOL = {
    midi: { parfait: 0.06, bien: 0.13, juste: 0.13 }, // a MIDI keyboard: a musician's timing
    doigt: { parfait: 0.25, bien: 0.6, juste: 0.25 }, // the pads, the A–L keys, the knobs: a child's
  };
  const SHOW = 3; // seconds the leaves of the last answer stay on the plant
  const GROUP = 0.35; // s: the notes of a chord played by hand (MIDI, keys) come within this
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  // a gate's length from its difficulty d (0..1): S11.1 4 notes at 0, up to 7 at 1 (never timed)
  const respLen = (d) => clamp(4 + Math.round((d || 0) * 3), 4, 7);
  // S5.3 — THE ladder. A level = a tier and a length (notes, or chords for the Accords); a success climbs one, a miss
  // goes one down. Past the named tiers, without end: combinations (octave leaps or a fifth higher, always syncopated),
  // a little longer, judged tighter (f scales the timing tolerance). `mark` = the tier mark on the Melody plant.
  const TIERS = [
    { id: 'phrases', name: 'Phrases', lens: [3, 4, 5, 6, 7, 8] },
    { id: 'octaves', name: 'Octaves', oct: 1, lens: [6, 7] },
    { id: 'syncopes', name: 'Syncopes', sync: 1, lens: [5, 6] },
    { id: 'quinte', name: 'Quinte', tr: 1, lens: [5, 6] },
    { id: 'accords', name: 'Accords', chord: 1, lens: [1, 2] },
  ];
  function level(lvl) {
    let i = Math.max(0, lvl | 0);
    for (let t = 0; t < TIERS.length; t++) {
      const T = TIERS[t]; if (i < T.lens.length) return Object.assign({}, T, { tier: t, len: T.lens[i], f: 1, mark: t });
      i -= T.lens.length;
    }
    return { id: 'combi', name: 'Combinaisons', tier: TIERS.length, plus: i + 1, oct: i % 2 ? 0 : 1, tr: i % 2, sync: 1,
      len: Math.min(MAX, 6 + Math.floor(i / 4)), f: Math.max(0.45, Math.pow(0.9, i + 1)), mark: TIERS.length + Math.floor(i / 2) };
  }
  // S5.4 — placement (Rocksmith): the Réponse is also a discreet level test, without a « musician » mode to choose. RUN
  // right answers in a row at a tier or higher (a gate's phrase aside: it is capped, it neither counts nor breaks the run)
  // check one objective of each piece of a set at once (S11.1: never a whole piece, the others are still to play; the
  // pieces open in the Arbre as always). A place includes the ones below; any time on the path. Discoveries stay to be
  // found (one whose piece is ready opens the next piece instead). Never by chance: Syncopes are 5–6 timed notes with off-beats, reached after ≥ 8 right answers
  // climbing (a miss = one level down); the son's 3 slow notes stay at Phrases.
  const RUN = 2;
  const OCT = TIERS[0].lens.length; // S6.7: the first level of the Octaves, where a musician starts
  const PLACE = [ // what a musician already masters: harmony, melody and time, his studio tools; then composition and classic effects.
    // Left to discover by playing: the instrument's own sound (Grands réglages, Paysages, Écran, Texture, Halo, Usure, Grains).
    // Musicien: Syncopes (5–6 timed notes, off-beats) ×2; Virtuose: Quinte (answered a fifth higher) ×2.
    { id: 'musicien', name: 'Musicien', tier: 2, nodes: ['h.pad', 'h.drone', 'h.pad2', 'h.key', 'h.scale', 'h.prog', 'm.tempo', 'm.phrase', 'c.seq', 't.journal', 't.rec', 't.share'] },
    { id: 'virtuose', name: 'Virtuose', tier: 3, nodes: ['c.rythme', 'c.song', 'm.evolve', 'm.lfo', 'm.scenes', 'e.reverb', 'e.salle', 'e.echo', 'e.tape'] },
  ];
  // the highest place earned by the last answers (tiers of the right ones, -1 = a miss), or -1
  const placeOf = (pt) => {
    if (!pt || pt.length < RUN) return -1;
    const low = Math.min(...pt.slice(-RUN));
    for (let p = PLACE.length - 1; p >= 0; p--) if (low >= PLACE[p].tier) return p;
    return -1;
  };
  // the level's name as the LCD shows it: « Syncopes », « Combinaisons +3 »
  const tierName = (lv) => lv.plus ? `${lv.name} +${lv.plus}` : lv.name;
  // a singable walk of n notes from `start`, inside 0..hi-1 (seconds, thirds; a fourth from 5 notes), no note twice in a row
  function walk(n, rnd, start, hi = DEGS) {
    const steps = n >= RHYTHM ? [-3, -2, -1, 1, 2, 3] : [-2, -1, 1, 2];
    const out = [start];
    while (out.length < n) {
      const p = out[out.length - 1], ok = steps.map((s) => p + s).filter((x) => x >= 0 && x < hi);
      out.push(ok[Math.floor(rnd() * ok.length)]);
    }
    return out;
  }
  const phrase = (n, rnd) => walk(n, rnd, Math.floor(rnd() * 5));
  // one leap of an octave (L degrees, the scale's length) inside the phrase, up or down, still within A–L
  function leap(n, rnd, L) {
    if (DEGS - L < 1) return phrase(n, rnd);
    const lo = Math.floor(rnd() * (DEGS - L)), j = 1 + Math.floor(rnd() * (n - 1)), up = rnd() < 0.5;
    return walk(j, rnd, up ? lo : lo + L).reverse().concat(walk(n - j, rnd, up ? lo + L : lo));
  }
  // where its notes fall in the bar (16th steps): on the beats up to 4 notes (slow, the rhythm is not judged);
  // from 5 notes, a rhythm on the eighths, always starting on the downbeat
  function rhythm(n, rnd) {
    if (n < RHYTHM) return Array.from({ length: n }, (_, i) => i * 4);
    const pool = [1, 2, 3, 4, 5, 6, 7];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return [0].concat(pool.slice(0, n - 1).sort((a, b) => a - b)).map((e) => e * 2);
  }
  // syncopated: the downbeat, then at least half of the other notes between the beats (off-beat eighths)
  function syncs(n, rnd) {
    const sh = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const offs = sh([1, 3, 5, 7]), ons = sh([2, 4, 6]), k = Math.min(4, Math.max(Math.ceil((n - 1) / 2), n - 4));
    return [0].concat(offs.slice(0, k), ons.slice(0, n - 1 - k)).sort((a, b) => a - b).map((e) => e * 2);
  }
  // « a fifth higher »: the degrees to add (the scale's 7 semitones; else 4 degrees)
  const fifth = (scale) => { const i = scale.indexOf(7); return i > 0 ? i : 4; };
  const pcOf = (m) => ((m % 12) + 12) % 12;

  const R = {
    MIN, MAX, RHYTHM, TRIES, GAP, START, TOL, OCT, TIERS, RUN, PLACE, placeOf, respLen, phrase, rhythm, syncs, leap, level, tierName,
    midi: false, // S6.7: a MIDI keyboard was played this session (its notes carry a raw velocity)
    again: null, // S6.7: the phrase just missed, played once more
    cur: null, // the phrase waiting for its answer: { gate, lvl, degs, midis, want, steps, len, timed, chord, sd, t0, from, ans, until, row }
    last: null, // the phrase just answered (its leaves stay a moment on the plant)
    wait: GAP.free, // bar lines to let pass before the next phrase (the music first)
    ignored: 0, // phrases left unanswered in a row (the next ones come more rarely)
    now() { const c = AMB.engine && AMB.engine.ctx; return c ? c.currentTime : 0; },
    // saved: the level reached (lvl; len = its length, kept for older readers), successes in a row, the record of the
    // series (best), the misses per gate; S5.4 the last answers' tiers (pt) and the place reached (place, index of
    // PLACE; absent = none). Older saves (len = 3..8, best = a length) start from their length.
    st(g = AMB.game) {
      const s = g.s.resp || (g.s.resp = {});
      if (s.lvl == null) { s.lvl = clamp((s.len | 0 || MIN) - MIN, 0, MAX - MIN); s.best = s.streak | 0; }
      s.lvl = Math.max(0, s.lvl | 0); s.len = level(s.lvl).len; s.streak = s.streak | 0; s.best = Math.max(s.best | 0, s.streak); s.miss = s.miss || {};
      return s;
    },
    // the score on the LCD (garden.js): null until the first answer
    score(g = AMB.game) {
      if (!g || !g.s || !g.s.resp || !this.can(g)) return null;
      const s = this.st(g), lv = level(s.lvl);
      return { lvl: s.lvl, tier: lv.tier, name: tierName(lv), mark: lv.mark, streak: s.streak, best: s.best };
    },
    // the tier mark of the Melody plant (garden-visual.js): 0 = Phrases, then one more per tier
    mark(g = AMB.game) { const v = this.score(g); return v ? v.mark : 0; },
    // the gate to answer now: the first active objective of kind 'reponse' (S11.1: a piece has several objectives)
    gate(g = AMB.game) {
      const K = AMB.contracts; if (!K || !g.path) return null;
      const id = K.state(g).active.find((x) => K.byId[x] && K.byId[x].kind === 'reponse');
      return id ? K.byId[id] : null;
    },
    need(d) { return respLen(d.d); },
    // path only, once the Melody is there; never in free mode nor once the instrument is handed over
    can(g = AMB.game) { return !!g && g.counts() && g.has('m.bells') && g.has('k.piano'); }, // (S11.1: answered on the Piano)
    busy() { return !!this.cur; },
    // the Melody auto keeps quiet from the phrase to the end of its answer (js/sequencer.js melodyNote)
    hush(time) { const c = this.cur; return !!c && time >= c.t0 - 0.05 && time <= c.until; },
    // S6.7 the hand of a gesture ('midi' | 'doigt') and its windows: a note, by its raw velocity (MIDI only); a gesture
    // without one (raw undefined: a chord, a knob), by the session (a MIDI keyboard played)
    hand(raw) { return raw != null || (raw === undefined && this.midi) ? 'midi' : 'doigt'; },
    win(hand) { return TOL[hand] || TOL.doigt; },
    tol(hand, f = 1) { return this.win(hand).juste * f; }, // timing tolerance of a timed note of the Réponse (seconds)

    // at each step of the sequencer: an answer window that ran out closes; on a bar line, maybe a new phrase
    onStep(step, time, sd) {
      const songRec = !!(AMB.rec && AMB.rec.songRecording && AMB.rec.songRecording()); // S5.7: ● Rec of the song: nothing on the take
      if (songRec && this.cur) this.cancel();
      if (this.cur && this.now() >= this.cur.until) this.close();
      const S = AMB.seq;
      if (this.cur || (step - ((S && S.origin) || 0)) % 16 !== 0) return false;
      const g = AMB.game; if (!this.can(g)) return false;
      const gate = this.gate(g);
      if (gate) this.wait = Math.min(this.wait, GAP.gate); // a gate to open: its phrase comes soon
      if (AMB.demands && AMB.demands.busy()) return false; // S5.5: a live ask in progress, the phrase waits
      if (this.wait > 0) { this.wait--; return false; }
      if (!gate && !store.get('bells.on')) return false; // the mastery loop needs the Melody heard
      if (AMB.pianoRoll && AMB.pianoRoll.roll && AMB.pianoRoll.roll.recording) return false; // Rec live: the notes are the roll's
      if (songRec) return false;
      if (AMB.looper && AMB.looper.busy()) return false; // S6.4: a loop take, the notes are the loop's
      return this.launch(time, sd, gate);
    },
    // the marked phrase (or chords), on the grid of the bar starting at `time`, on the Melody voice
    launch(time, sd, gate = this.gate()) {
      const L = AMB.layers, S = AMB.seq, g = AMB.game; if (!L || !L.bells || !S || !AMB.contracts) return false;
      const s = this.st(g), rnd = AMB.contracts.rng(g), Th = AMB.theory, sc = S.scale, Ls = sc.length;
      const a = this.again; this.again = null;
      const re = !!a && a.gate === (gate ? gate.id : null); // S6.7: the phrase just missed, once more (same notes, same places)
      // S6.7: a musician at the MIDI keyboard skips the Phrases (once; his first scales and arpeggios already told)
      if (!gate && !re && this.midi && !s.skip && s.lvl < OCT) { s.lvl = OCT; s.skip = true; s.len = level(s.lvl).len; }
      // a gate: a plain phrase, its length capped (never a tier); otherwise the level reached
      const lv = re ? a.lv : gate ? level(Math.min(s.lvl, MAX - MIN, this.need(gate) - MIN)) : level(s.lvl), len = lv.len;
      const tr = lv.tr ? fifth(sc) : 0, chord = !!lv.chord, timed = !chord && !gate && len >= RHYTHM; // (a gate is never timed)
      const mid = (dg) => Th.degreeToMidi(dg, S.root, sc, 4);
      let degs, steps, midis, want, cdeg = null, pcs = null, tri = null;
      if (chord) { // 1 or 2 chords on the beats 1 and 3 (triads of the key), any inversion accepted
        if (re) cdeg = a.cdeg; else { cdeg = []; while (cdeg.length < len) { const d = Math.floor(rnd() * Ls); if (d !== cdeg[cdeg.length - 1]) cdeg.push(d); } }
        steps = cdeg.map((_, i) => i * 8);
        tri = cdeg.map((d) => [0, 2, 4].map((k) => mid(d + k)));
        pcs = tri.map((t) => t.map(pcOf)); degs = cdeg; midis = [].concat(...tri); want = tri.map((t) => t[0]);
        tri.forEach((t, i) => t.forEach((m) => L.bells.note(m, time + steps[i] * sd, 0.7, true)));
      } else {
        degs = re ? a.degs : lv.oct ? leap(len, rnd, Ls) : tr ? walk(len, rnd, Math.floor(rnd() * 5), DEGS - tr) : phrase(len, rnd);
        steps = re ? a.steps : lv.sync ? syncs(len, rnd) : rhythm(len, rnd);
        midis = degs.map(mid); want = degs.map((dg) => mid(dg + tr));
        midis.forEach((m, i) => L.bells.note(m, time + steps[i] * sd, 0.85, true));
      }
      if (!store.get('bells.on') && L.bells.ch) L.bells.ch.setLevel(Math.pow(store.get('bells.vol'), 1.6)); // a gate: heard anyway
      const bar = 16 * sd, end = time + steps[len - 1] * sd, f = lv.f || 1, ans = time + bar;
      this.cur = {
        gate: gate ? gate.id : null, lvl: re ? a.lvl : gate ? len - MIN : s.lvl, tier: lv.id, lv, degs, midis, want, steps, len, timed, sd, f,
        oct: !!lv.oct, sync: !!lv.sync, tr, chord, cdeg, pcs, grp: null, off: null, t0: time, row: [], again: re,
        from: end + Math.min(0.15, sd), // notes played along with the phrase are not an answer
        ans, // the answer bar (timed: moved to the beat of the first note played, input)
        // S6.7: the first note may come up to START s (at least a bar) after « À toi »; a timed answer then has its bar
        until: timed ? ans + Math.max(START, bar) + bar + this.tol('doigt', f) : ans + Math.max(2 * bar, 6, START), // untimed: take your time
      };
      this.last = null;
      // S6.7: the pads light up on the phrase, each note until the next one (a Simon: the child sees where to play)
      if (AMB.bus) AMB.bus.emit('resp:call', { notes: steps.map((st, i) => ({
        midis: chord ? tri[i] : [midis[i]], time: time + st * sd,
        dur: clamp(((i + 1 < len ? steps[i + 1] : st + 4) - st) * sd * 0.85, 0.25, 0.7) })) });
      g.emit('puzzle', { phase: 'call', len, ans, until: this.cur.until, tier: lv.id, tr: !!tr, chord, again: re });
      return true;
    },
    // one answered note (or chord) of the current answer: a leaf; the last one closes the answer
    peg(peg) {
      const c = this.cur, i = c.row.length; c.grp = null;
      c.row.push(peg);
      AMB.game.emit('puzzle', { phase: 'note', i, peg });
      return c.row.length === c.len ? this.close() : { row: c.row };
    },
    // a note played by the player ('live', path only): one leaf. Returns null (not an answer), { row } or the result.
    // raw: the MIDI velocity (null: pads, keys) — the hand whose window judges it
    input(midi, played = this.now(), raw = null) {
      const c = this.cur; if (!c || !this.can()) return null;
      if (played > c.until) { this.close(); return null; }
      if (played < c.from) return null;
      const i = c.row.length, t = (c.want || c.midis)[i];
      if (!i && c.timed) { // S6.7: the answer starts on the beat of its first note (the downbeat, or a later beat)
        c.ans += Math.max(0, Math.round((played - c.ans) / (4 * c.sd))) * 4 * c.sd;
        c.until = Math.min(c.until, c.ans + 16 * c.sd + this.tol('doigt', c.f));
      } else if (!c.timed) c.until = Math.max(c.until, played + 4); // untimed: never cut in the middle of an answer
      if (c.chord) { // by hand: its notes within GROUP s, in any order and octave; a foreign note = wrong
        const want = c.pcs[i], pc = pcOf(midi);
        if (!want.includes(pc)) return this.peg({ state: 'far', dir: null });
        if (!c.grp || played - c.grp.t0 > GROUP) c.grp = { t0: played, pcs: [] };
        if (!c.grp.pcs.includes(pc)) c.grp.pcs.push(pc);
        return c.grp.pcs.length >= want.length ? this.peg({ state: 'ok', dir: null }) : { row: c.row };
      }
      // any octave (a MIDI keyboard): the nearest one is compared; with octave leaps, the first note sets the octave
      if (c.oct && c.off == null) c.off = 12 * Math.round((t - midi) / 12);
      const m = c.oct ? midi + c.off : midi + 12 * Math.round((t - midi) / 12);
      let peg;
      if (m !== t) peg = { state: 'far', dir: m < t ? 'up' : 'down' };
      else if (c.timed) {
        const dt = played - (c.ans + c.steps[i] * c.sd), h = this.hand(raw);
        peg = Math.abs(dt) <= this.tol(h, c.f) ? { state: 'ok', dir: null, dt } : { state: 'off', dir: dt < 0 ? 'early' : 'late', dt };
      } else peg = { state: 'ok', dir: null };
      return this.peg(peg);
    },
    // a chord forced by the player (long press on a pad, low notes on MIDI: js/play.js, any inversion): its degree
    chordIn(deg, time) {
      const c = this.cur; if (!c || !c.chord || !this.can() || time < c.from) return null;
      if (time > c.until) { this.close(); return null; }
      const n = AMB.seq.scale.length, i = c.row.length;
      return this.peg(((deg % n) + n) % n === c.cdeg[i] ? { state: 'ok', dir: null } : { state: 'far', dir: null });
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
      const was = level(s.lvl), best0 = s.best;
      s.streak = ok ? s.streak + 1 : 0;
      s.best = Math.max(s.best, s.streak);
      // one level up, or one down (a replay missed, S6.7: not one more)
      s.lvl = ok ? Math.max(s.lvl, c.lvl + 1) : c.again ? s.lvl : Math.max(0, s.lvl - 1);
      // S6.7: a first long answer right and tight (a musician's, whatever the hand): the Phrases are skipped, the Octaves now
      if (ok && !c.gate && !s.skip && c.timed && s.lvl < OCT && c.row.every((p) => Math.abs(p.dt) <= TOL.midi.juste)) { s.lvl = OCT; s.skip = true; }
      const lv = level(s.lvl); s.len = lv.len;
      const res = { ok, len: c.len, row: c.row, next: s.len, lvl: s.lvl, name: tierName(lv), streak: s.streak, best: s.best, gate: c.gate, again: c.again };
      if (ok && lv.id !== was.id && lv.tier > was.tier) res.tier = lv.name; // a new tier reached
      if (!ok) s.beat = false; else if (best0 > 0 && s.streak > best0 && !s.beat) { s.beat = true; res.record = s.best; } // the record beaten (once per series)
      if (!c.gate && !c.again) { // S5.4 placement: the run of the last answers (a replay, heard twice, does not count)
        s.pt = (s.pt || []).concat(ok ? level(c.lvl).tier : -1).slice(-RUN);
        const p = placeOf(s.pt); if (p > (s.place != null ? s.place : -1)) res.place = this.place(p, g);
      }
      this.last = Object.assign(c, { ok, at: this.now() });
      // S6.7: missed the first time: the same phrase once more, right away
      if (!ok && !c.again) { this.again = { gate: c.gate, lv: c.lv, lvl: c.lvl, degs: c.degs, steps: c.steps, cdeg: c.cdeg }; res.replay = true; }
      const asks = AMB.demands && AMB.demands.gate(g); // a challenge asked in the music waits its turn: no hurry then
      this.wait = gate || res.replay ? GAP.gate : ok && !asks ? GAP.hot : GAP.free;
      if (gate && c.gate === gate.id) {
        const miss = ok ? 0 : (s.miss[gate.id] || 0) + 1;
        if (ok && c.len >= this.need(gate)) res.open = gate.id;
        else if (!ok) { s.miss[gate.id] = miss; res.left = TRIES - miss; if (miss >= TRIES) { res.open = gate.id; res.out = true; } }
        if (res.open) { this.again = null; res.replay = false; delete s.miss[gate.id]; this.outGate = res.out ? gate.id : null; AMB.contracts.finish(gate.id, g); this.outGate = null; } // outGate: the juice knows it was « prêt quand même »
      }
      g.save();
      g.emit('puzzle', { phase: 'end', res });
      if (AMB.bus) { // for the juice (garden.js, and any listener)
        if (ok) AMB.bus.emit('resp:streak', { streak: s.streak });
        if (res.record) AMB.bus.emit('resp:record', { best: s.best });
        if (res.tier) AMB.bus.emit('resp:tier', { tier: lv.tier, name: lv.name, lvl: s.lvl });
        if (res.place) AMB.bus.emit('resp:place', res.place);
      }
      return res;
    },
    // S5.4: place p reached → S11.1: the first objective left of each piece of « Musicien » is checked (the lower place's
    // too, when a player jumps straight to Virtuose); never a whole piece (its other objectives still ask to be played).
    // « Virtuose » itself checks nothing more: it lifts the Réponse to the Quinte (balance.html: the nephew's 1 h 30 – 2 h).
    // `objs` = the objectives checked
    place(p, g = AMB.game) {
      const s = this.st(g), first = !(s.place >= 0);
      s.place = p;
      const objs = AMB.contracts && first ? AMB.contracts.grant(PLACE[0].nodes, g) : []; // (once: the first place reached)
      g.save();
      return { id: PLACE[p].id, name: PLACE[p].name, objs, nodes: [...new Set(objs.map((id) => AMB.contracts.byId[id].node))] };
    },
    // playback stopped, free mode, path restarted: the phrase goes, nothing is judged
    cancel() {
      const was = this.cur || this.last; this.cur = null; this.last = null; this.again = null; this.wait = GAP.free; this.ignored = 0;
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
    AMB.bus.on('live', (n) => {
      if (n && n.raw != null) R.midi = true; // S6.7: a MIDI keyboard is played (its velocity rides along)
      if (n && R.cur) R.input(n.midi, n.played != null ? n.played : n.time != null ? n.time : R.now(), n.raw != null ? n.raw : null);
    });
    AMB.bus.on('chord', (c) => { if (c && c.forced && R.cur) R.chordIn(c.deg, R.now()); }); // a chord forced by the player
    AMB.bus.on('panic', () => R.cancel()); // playback stopped
    ['game:mode', 'game:reset'].forEach((e) => AMB.bus.on(e, () => R.cancel()));
  }

  AMB.puzzles = R;
})();
