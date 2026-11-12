// « Jardin sonore » : target puzzles — "make your sound match this one". A puzzle names a few controls;
// each attempt draws a target for them, the score compares the player's values to it (knobs by distance,
// lists and switches by equality). Judged on reaching the target, never on taste. Plus the Écho (S3.1): a phrase
// to play back. Some guard a node of the tree (gate), all pay their ✧ once and stay replayable with a new target.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const PASS = 0.9;
  // G8.1 « Mastermind »: a limited number of validations, each one answered key by key
  const TRIES = 6, NEAR = 0.6;
  const ORDERED = /^(global\.key|fx\.echoTime)$/; // lists where « higher / lower » makes sense

  // knob closeness, forgiving near the target (what an ear can do): ±0.05 → 98 %, ±0.1 → 92 %,
  // ±0.2 → 67 %, 0 from 35 % of the range away
  const TOL = 0.35;
  function keyScore(key, v, target) {
    const sp = store.spec(key); if (!sp) return 0;
    if (sp.type === 'select' || sp.type === 'toggle' || sp.type === 'text') return v === target ? 1 : 0;
    const span = (sp.max - sp.min) || 1, d = Math.abs(Number(v) - Number(target)) / span;
    return Math.max(0, 1 - (d / TOL) ** 2);
  }

  // puzzle: { id, title, intro, need: [node ids to attempt], keys: {key: range}, reward, opens (gate node) }; an Écho
  // (kind 'echo', below) has a difficulty `d` instead of `keys`
  // range: null = the whole control; [lo, hi] for a knob; a list of options for a list. Every new attempt draws
  // a fresh target for the same controls: nothing to learn by heart, always replayable.
  const P = (id, need, title, intro, keys, reward, opens) => ({ id, need, title, intro, keys, reward, opens: opens || null });
  const TONE = [0.05, 0.95];
  // S3.1 « Écho » : the instrument plays a short phrase on the Melody voice, in the current key and scale; the player
  // plays it back (A–L keys, the card's pads or MIDI, the 'live' path) and gets one peg per note: ✓ right, ⬆ play
  // higher, ⬇ play lower (any octave on MIDI). A whole phrase right = solved; each new attempt draws a new phrase
  // (seeded game rng). d = difficulty 0..1: 3 notes at 0, up to 6. `need` holds the Melody (it is what plays them).
  const E = (id, need, title, intro, d, reward, opens) => ({ id, kind: 'echo', need, title, intro, d, reward, opens: opens || null });
  const DEFS = [
    // S3.6: the first gates are Échos (play a phrase back), not knobs to match: the son's first steps are with his hands and ears
    E('p.premier', ['t.son', 'h.pad', 'm.bells'], 'Premier reflet', 'Écoute la petite phrase, puis rejoue-la note à note.', 0, 15, 't.macros'),
    P('p.gamme', ['h.key'], 'Autre lumière', 'Le même paysage ailleurs : la tonalité, le son et la brillance du Pad, la couleur du drone.',
      { 'global.key': null, 'pad.wave': null, 'pad.tone': TONE, 'drone.tone': TONE }, 20, 'h.scale'),
    P('p.espace', ['e.echo', 'h.pad'], 'La grotte', 'La taille de l\'espace, la part du Pad qui s\'y noie, l\'écho : quantité, vitesse, répétitions.',
      { 'fx.space': [0.1, 1], 'pad.send': [0.1, 1], 'fx.echo': [0, 0.9], 'fx.echoTime': null, 'fx.feedback': [0.1, 0.9] }, 25, 'e.tape'),
    P('p.mouvement', ['m.evolve'], 'Pluie de notes', 'Les notes de la mélodie : leur son, leur nombre, la pulsation, le tempo et la dérive.',
      { 'bells.wave': null, 'bells.density': TONE, 'global.time': null, 'global.tempo': [40, 110], 'global.evolve': [0, 1] }, 25, 'm.lfo'),
    P('p.composer', ['h.pad', 'm.bells'], 'Boîte à musique', 'La mélodie : son, registre et brillance, et la couleur du drone dessous.',
      { 'bells.wave': null, 'bells.range': [0.1, 0.9], 'bells.tone': TONE, 'drone.tone': TONE }, 25, 'c.seq'),
    P('b.gamme', ['h.scale'], 'Quelle couleur ?', 'La tonalité et la gamme de ce paysage, à l\'oreille.',
      { 'global.key': null, 'global.scale': null }, 25),
    E('p.suite', ['m.bells'], 'Suite connue', 'Une phrase un peu plus longue : écoute-la, puis rejoue-la note à note.', 0.34, 25, 'm.phrase'),
    P('b.pad', ['h.pad2'], 'Cordes lentes', 'Le Pad en détail : son, attaque, accords riches, voix intérieure, brillance.',
      { 'pad.wave': null, 'pad.attack': TONE, 'pad.voicing': TONE, 'pad.counter': [0, 0.9], 'pad.tone': TONE }, 25),
    P('b.salle', ['e.halo'], 'Cathédrale de verre', 'La salle : son caractère, sa taille, le halo, le silence avant la réverbération, la quantité.',
      { 'fx.revType': null, 'fx.size': [0.1, 1], 'fx.shimmer': [0, 0.9], 'fx.predelay': [0, 0.9], 'fx.space': [0.1, 1] }, 25),
    P('b.radio', ['e.lofi', 'e.texture'], 'Vieille radio', 'La texture de fond et son volume, l\'usure et la cassette.',
      { 'texture.type': null, 'texture.vol': [0.2, 0.9], 'fx.lofi': [0, 0.9], 'fx.tape': [0, 0.9] }, 25),
    P('b.grains', ['m.grains2'], 'Nuage de grains', 'Les grains : à l\'envers ou non, combien, quelle taille, quelles hauteurs.',
      { 'grains.reverse': [0, 1], 'grains.density': [0.1, 0.9], 'grains.size': [0.1, 0.9], 'grains.pitch': null }, 25),
    P('b.groove', ['c.rythme', 'm.tempo'], 'Chaloupé', 'Le rythme : le kit des pulsations, le tempo, le swing et l\'imprécision.',
      { 'perc.kit': null, 'global.tempo': [50, 120], 'global.swing': [0, 0.8], 'global.humanize': [0, 0.8] }, 25),
  ];
  const ECHO_DEGS = 9, ECHO_GAP = 0.55; // A–L = degrees 0..8 of octave 4; seconds between the phrase's notes
  const ECHOS = DEFS.filter((d) => d.kind === 'echo');
  const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));
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

  // one peg per key: state ok / near / far, and which way to go (up / down / other option)
  function peg(key, value, target) {
    const s = keyScore(key, value, target), sp = store.spec(key) || {};
    const state = s >= PASS ? 'ok' : s >= NEAR ? 'near' : 'far';
    let dir = null;
    if (state !== 'ok') {
      if (sp.type === 'select' && ORDERED.test(key) && sp.options.indexOf(value) >= 0) dir = sp.options.indexOf(value) < sp.options.indexOf(target) ? 'up' : 'down';
      else if (sp.type) dir = 'other';
      else dir = Number(value) < Number(target) ? 'up' : 'down';
    }
    return { key, state, dir };
  }
  // a value drawn for one control: an option of the list, or a knob value on a 0.05 grid (its own step if it has one)
  function drawValue(key, range, rnd) {
    const sp = store.spec(key); if (!sp) return undefined;
    if (sp.type === 'select') { const o = Array.isArray(range) && typeof range[0] === 'string' ? range : sp.options; return o[Math.floor(rnd() * o.length)]; }
    if (sp.type === 'toggle') return rnd() < 0.5;
    const [lo, hi] = range || [sp.min, sp.max], q = sp.step || (sp.max - sp.min) * 0.05;
    return Math.min(sp.max, Math.max(sp.min, +(Math.round((lo + rnd() * (hi - lo)) / q) * q).toFixed(4)));
  }

  const puzzles = {
    DEFS, ECHOS, byId, PASS, TRIES, NEAR, keyScore, peg, drawValue, echoLen, echoPhrase,
    rnd: Math.random, // overridable by tests
    // a new target for a puzzle: same controls, values drawn anew, never already reached by `values`;
    // an echo: a new phrase (seeded game rng), never the same as the previous one
    draw(id, values = store.stableSnapshot(), prev = null) {
      const d = byId[id]; let t = null;
      if (d.kind === 'echo') {
        const rnd = AMB.contracts ? AMB.contracts.rng() : this.rnd;
        for (let i = 0; i < 10; i++) { t = { degs: echoPhrase(d.d, rnd) }; if (!prev || t.degs.join() !== prev.degs.join()) break; }
        return t;
      }
      for (let i = 0; i < 30; i++) {
        t = {}; for (const [k, r] of Object.entries(d.keys)) t[k] = drawValue(k, r, this.rnd);
        if (this.score(id, values, t).total < 0.75) break;
      }
      return t;
    },
    // per-key detail and overall score of a sound against a target (the attempt's own by default)
    score(id, values = store.stableSnapshot(), target = this.target(id)) {
      if (!byId[id] || !target || byId[id].kind === 'echo') return { total: 0, keys: [] };
      const keys = Object.entries(target).map(([k, t]) => ({ key: k, target: t, value: values[k], s: keyScore(k, values[k], t) }));
      const total = keys.reduce((a, x) => a + x.s, 0) / keys.length;
      return { total, keys };
    },
    target(id = this.current) { const r = this.run(id); return r && r.target; },
    // puzzles that can be attempted now (prerequisite nodes owned), solved or not: they are always replayable
    available(g = AMB.game) { return DEFS.filter((d) => d.need.every((n) => g.has(n))); },
    // the puzzle guarding a node (tree gate)
    forNode(nodeId) { return DEFS.find((d) => d.opens === nodeId) || null; },
    current: null,
    // the attempt in progress (kept in the game state until solved or out of validations: closing the card and
    // coming back gives neither the 6 validations nor a new target); a new attempt draws a new target
    run(id = this.current, g = AMB.game) {
      if (!id || !byId[id]) return null;
      const runs = g.s.runs || (g.s.runs = {});
      const r = runs[id] || (runs[id] = { tries: [] });
      // older saves: no target yet, or one of the other kind (a gate that became an Écho)
      if (!r.target || !!r.target.degs !== (byId[id].kind === 'echo')) { r.target = this.draw(id, this.values()); g.save(); }
      return r;
    },
    // a gate opened after 6 failed validations (no ✧; the puzzle stays playable)
    given(id, g = AMB.game) { return (g.s.opened || []).includes(id); },
    // the live gauge for players who want it
    setHelp(on, g = AMB.game) {
      g.s.pzHelp = !!on; g.save();
      g.emit('puzzle', { id: this.current, side: this.side(), ...this.currentScore() });
    },
    // A/B listening (G5.2): `mine` holds the player's own values while the target is heard
    ab: null,
    side() { return this.ab ? 'target' : 'mine'; },
    // the player's values (what the score is about), even while the target is playing
    values() { return this.ab ? { ...store.stableSnapshot(), ...this.ab.mine } : store.stableSnapshot(); },
    currentScore() { return this.current ? this.score(this.current, this.values()) : { total: 0, keys: [] }; },
    listen(side) {
      if (this.isEcho()) return false; // an echo is heard with echoPlay, never on the controls
      const target = this.target(); if (!target) return false;
      if (side === 'target' && !this.ab) {
        // the target is played on the real ambience (source 'game'); ab.mine = the player's own values of those keys
        const mine = {}; for (const k of Object.keys(target)) if (store.spec(k)) mine[k] = store.get(k);
        store.setMany(target, 'game');
        this.ab = { mine };
        this.veil(true);
      } else if (side === 'mine' && this.ab) {
        const mine = this.ab.mine; this.ab = null;
        store.setMany(mine, 'game');
        this.veil(false);
      }
      AMB.game.emit('puzzle', { id: this.current, side: this.side(), ...this.currentScore() });
      return true;
    },
    // the target's values stay hidden on the controls (listening, not copying)
    veil(on) {
      if (typeof document === 'undefined') return;
      document.body.classList.toggle('pz-veil', on);
      document.querySelectorAll('.pz-veiled').forEach((e) => e.classList.remove('pz-veiled'));
      const d = byId[this.current];
      if (on && d) for (const k of Object.keys(d.keys)) document.querySelectorAll(`[data-key="${k}"]`).forEach((e) => e.classList.add('pz-veiled'));
    },
    start(id) {
      if (!byId[id]) return false;
      if (this.current && this.current !== id) this.stop();
      this.current = id; this.run(id);
      AMB.game.emit('puzzle', { id, side: 'mine', ...this.currentScore() });
      return true;
    },
    stop() { if (this.ab) this.listen('mine'); this.current = null; this.echoRow = []; AMB.game.emit('puzzle', { id: null }); },

    // ---- Écho (S3.1) ----
    isEcho(id = this.current) { const d = byId[id]; return !!d && d.kind === 'echo'; },
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
      ms.forEach((m, i) => L.bells.note(m, t0 + i * ECHO_GAP, 0.8, true));
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
      this.echoRow.push({ key: 'n' + (i + 1), state: m === t ? 'ok' : 'far', dir: m === t ? null : m < t ? 'up' : 'down', echo: true });
      if (this.echoRow.length < ms.length) { AMB.game.emit('puzzle', { id, side: 'mine', total: 0, keys: [], note: i + 1 }); return { row: this.echoRow }; }
      const res = this.attempt(id);
      AMB.game.emit('puzzle', { id, side: 'mine', total: 0, keys: [], res });
      return res;
    },
    // validate (G8.1): one of the 6 validations, judged on the player's own sound (never while
    // the target is playing). Returns { ok, row, tries, left, first, out } or null.
    attempt(id = this.current) {
      if (!id || !byId[id] || this.ab) return null;
      const g = AMB.game, d = byId[id], r = this.run(id, g), echo = d.kind === 'echo';
      let row;
      if (echo) { // the whole phrase played back: right when every note is
        if (this.echoRow.length < this.echoMidis(id).length) return null;
        const pegs = this.echoRow; this.echoRow = [];
        row = { total: pegs.filter((p) => p.state === 'ok').length / pegs.length, pegs };
      } else {
        const sc = this.score(id);
        row = { total: sc.total, pegs: sc.keys.map((k) => peg(k.key, k.value, k.target)) };
      }
      r.tries.push(row);
      const res = { ok: echo ? row.total === 1 : row.total >= PASS, row, tries: r.tries.length, left: TRIES - r.tries.length };
      if (res.ok || res.left <= 0) { delete g.s.runs[id]; if (this.current === id) this.current = null; }
      else if (echo) r.target = this.draw(id, null, r.target); // an echo: a new phrase at each attempt
      if (res.ok) res.first = g.solve(id, d.reward); // first resolution only: emits game:puzzles + game:earn (saves)
      else if (res.left <= 0) {
        // out of validations: never a dead end — the gate opens anyway, without ✧
        res.out = true;
        g.s.opened = g.s.opened || [];
        if (!g.s.opened.includes(id) && !g.s.puzzles.includes(id)) g.s.opened.push(id);
        g.save(); g.emit('opened', { id });
      } else g.save();
      return res;
    },
  };

  // live score while a puzzle is open; touching a control while hearing the target brings your
  // own sound back first (your values, plus the change you just made) — no copying the target
  store.on((k, v, src) => {
    if (!puzzles.current || src === 'lfo' || src === 'evolve') return;
    if (puzzles.ab && src === 'user') {
      const mine = { ...puzzles.ab.mine }; delete mine[k]; // the change just made stays
      puzzles.ab = null;
      store.setMany(mine, 'game');
      puzzles.veil(false);
    }
    AMB.game.emit('puzzle', { id: puzzles.current, side: puzzles.side(), ...puzzles.currentScore() });
  });

  // Écho: the player's notes (computer keyboard or MIDI, already heard on the Melody voice) are judged in the path only
  if (AMB.bus) AMB.bus.on('live', (n) => { if (n && puzzles.isEcho()) puzzles.echoInput(n.midi); });

  // never leave the target sound behind when the page goes away (a mode change is handled by tree.onMode)
  window.addEventListener('pagehide', () => { if (puzzles.ab) puzzles.listen('mine'); });

  AMB.puzzles = puzzles;
})();
