// « Jardin sonore » : target puzzles — "make your sound match this one". A puzzle is a target
// value for a few parameters; the score compares the current values to the target (knobs by
// distance, lists and switches by equality). Judged on reaching the target, never on taste.
// Puzzles only use parameters that are already unlocked when they become available.
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

  // puzzle: { id, title, intro, need: [node ids to attempt], target: {key: value}, reward, opens }
  const P = (id, need, title, intro, target, reward, opens) => ({ id, need, title, intro, target, reward, opens: opens || null });
  const B = (id, need, title, intro, target, reward) => ({ ...P(id, need, title, intro, target, reward), bonus: true });
  const DEFS = [
    P('p.premier', ['t.son', 'h.pad'], 'Premier reflet',
      'Un drone d\'orgue clair sous un Pad de verre très sombre. Retrouve ce son.',
      { 'drone.wave': 'Orgue', 'drone.tone': 0.75, 'pad.wave': 'Verre', 'pad.tone': 0.2 }, 15, 't.macros'),
    P('p.gamme', ['h.key'], 'Autre lumière',
      'Le même paysage, transposé ailleurs : un chœur assez brillant au-dessus d\'un drone sombre. Trouve la bonne tonalité : un peu plus haut que celle de départ.',
      { 'global.key': 'F', 'pad.wave': 'Chœur', 'pad.tone': 0.65, 'drone.tone': 0.25 }, 20, 'h.scale'),
    P('p.espace', ['e.echo', 'h.pad'], 'La grotte',
      'Un grand espace où le Pad se noie, et un écho un peu boiteux qui revient longtemps.',
      { 'fx.space': 0.85, 'pad.send': 0.9, 'fx.echo': 0.6, 'fx.echoTime': '1/8.', 'fx.feedback': 0.75 }, 25, 'e.tape'),
    P('p.mouvement', ['m.evolve'], 'Pluie de notes',
      'Des cloches nombreuses, sans pulsation, lentes, qui dérivent toutes seules.',
      { 'bells.wave': 'Cloche', 'bells.density': 0.75, 'global.time': 'Flottant', 'global.tempo': 50, 'global.evolve': 0.6 }, 25, 'm.lfo'),
    P('p.composer', ['h.pad', 'm.bells'], 'Boîte à musique',
      'Pas de Pad : une mélodie pincée, aiguë et claire, posée sur un drone très sombre.',
      { 'pad.on': false, 'bells.wave': 'Pluck', 'bells.range': 0.85, 'bells.tone': 0.75, 'drone.tone': 0.12 }, 25, 'c.seq'),

    // bonus puzzles (G5.5): harder, nothing to open, the controls involved stay secret until the last hint
    B('b.gamme', ['h.scale'], 'Quelle couleur ?', 'Retrouve la tonalité et la gamme de ce paysage, à l\'oreille.',
      { 'global.key': 'A', 'global.scale': 'Dorien' }, 25),
    B('b.progression', ['h.prog'], 'Suite connue', 'Une suite d\'accords très connue, deux mesures par accord. Laquelle ?',
      { 'pad.prog': 'I–V–vi–IV', 'pad.length': 2 }, 25),
    B('b.pad', ['h.pad2'], 'Cordes lentes', 'Un Pad de cordes qui arrive très lentement, accords larges, voix intérieure bien présente, plutôt sombre.',
      { 'pad.wave': 'Cordes', 'pad.attack': 0.85, 'pad.voicing': 0.9, 'pad.counter': 0.6, 'pad.tone': 0.3 }, 25),
    B('b.salle', ['e.halo'], 'Cathédrale de verre', 'Une salle immense qui gonfle lentement, un halo cristallin, un léger silence avant la réverbération.',
      { 'fx.revType': 'Cloud', 'fx.size': 0.9, 'fx.shimmer': 0.7, 'fx.predelay': 0.4, 'fx.space': 0.8 }, 25),
    B('b.radio', ['e.lofi', 'e.texture'], 'Vieille radio sous la pluie', 'Un son abîmé, une cassette fatiguée, et la pluie bien présente.',
      { 'texture.type': 'Pluie', 'texture.vol': 0.7, 'fx.lofi': 0.7, 'fx.tape': 0.65 }, 25),
    B('b.grains', ['m.grains2'], 'Nuage à l\'envers', 'Des grains longs, nombreux, presque tous à l\'envers, sur les octaves.',
      { 'grains.reverse': 0.85, 'grains.density': 0.7, 'grains.size': 0.8, 'grains.pitch': 'Octaves' }, 25),
    B('b.groove', ['c.groove', 'm.tempo'], 'Chaloupé', 'Un rythme organique, assez rapide, très chaloupé et un peu imprécis.',
      { 'perc.kit': 'Organique', 'global.tempo': 92, 'global.swing': 0.5, 'global.humanize': 0.45 }, 25),
  ];
  const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));

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
  // stars for a solved puzzle: fewer validations and fewer listens to the target score more;
  // solved with the live gauge (help) gives none
  function stars(tries, listens, help) {
    if (help) return 0;
    let n = tries <= 1 ? 3 : tries <= 3 ? 2 : 1;
    if (listens > 3) n--;
    if (listens > 6) n--;
    return Math.max(1, n);
  }

  const puzzles = {
    DEFS, byId, PASS, TRIES, NEAR, keyScore, peg, stars,
    // per-key detail and overall score of the current sound against a puzzle
    score(id, values = store.stableSnapshot()) {
      const d = byId[id]; if (!d) return { total: 0, keys: [] };
      const keys = Object.entries(d.target).map(([k, t]) => ({ key: k, target: t, value: values[k], s: keyScore(k, values[k], t) }));
      const total = keys.reduce((a, x) => a + x.s, 0) / keys.length;
      return { total, keys };
    },
    // puzzles that can be attempted now (prerequisite nodes owned, not solved yet)
    available(g = AMB.game) { return DEFS.filter((d) => !g.s.puzzles.includes(d.id) && d.need.every((n) => g.has(n))); },
    // the puzzle guarding a node (tree gate)
    forNode(nodeId) { return DEFS.find((d) => d.opens === nodeId) || null; },
    current: null,
    // the attempt in progress for a puzzle (kept in the game state until solved or given up:
    // closing the card and coming back does not give the 6 validations back)
    run(id = this.current, g = AMB.game) {
      if (!id || !byId[id]) return null;
      const runs = g.s.runs || (g.s.runs = {});
      return runs[id] || (runs[id] = { tries: [], listens: 0, help: !!g.s.pzHelp });
    },
    best(id, g = AMB.game) { return (g.s.stars && g.s.stars[id]) || 0; },
    // a gate opened after 6 failed validations (no ✧, no star; the puzzle stays playable)
    given(id, g = AMB.game) { return (g.s.opened || []).includes(id); },
    // the live gauge for players who want it (sticky for the attempt: no stars)
    setHelp(on, g = AMB.game) {
      g.s.pzHelp = !!on;
      const r = this.current && this.run();
      if (r && on) r.help = true;
      g.save(); g.emit('puzzle', { id: this.current, side: this.side(), ...this.currentScore() });
    },
    // A/B listening (G5.2): `mine` holds the player's own values while the target is heard
    ab: null,
    side() { return this.ab ? 'target' : 'mine'; },
    // the player's values (what the score is about), even while the target is playing
    values() { return this.ab ? { ...store.stableSnapshot(), ...this.ab.mine } : store.stableSnapshot(); },
    currentScore() { return this.current ? this.score(this.current, this.values()) : { total: 0, keys: [] }; },
    listen(side) {
      const d = byId[this.current]; if (!d) return false;
      if (side === 'target' && !this.ab) {
        const r = this.run(); if (r) { r.listens++; AMB.game.save(); }
        // the target borrows the sound (store.borrow, js/params.js): ab.mine = the player's own values
        this.applying = true; store.borrow('puzzle', d.target); this.applying = false;
        this.ab = { mine: store.loans.puzzle || {} };
        this.veil(true);
      } else if (side === 'mine' && this.ab) {
        this.ab = null;
        this.applying = true; store.giveBack('puzzle'); this.applying = false;
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
      if (on && d) for (const k of Object.keys(d.target)) document.querySelectorAll(`[data-key="${k}"]`).forEach((e) => e.classList.add('pz-veiled'));
    },
    start(id) {
      if (!byId[id]) return false;
      if (this.current && this.current !== id) this.stop();
      this.current = id;
      AMB.game.emit('puzzle', { id, side: 'mine', ...this.currentScore() });
      return true;
    },
    stop() { if (this.ab) this.listen('mine'); this.current = null; AMB.game.emit('puzzle', { id: null }); },
    // validate (G8.1): one of the 6 validations, judged on the player's own sound (never while
    // the target is playing). Returns { ok, row, tries, left, stars, first, out } or null.
    attempt(id = this.current) {
      if (!id || !byId[id] || this.ab) return null;
      const g = AMB.game, d = byId[id], sc = this.score(id), r = this.run(id, g);
      if (g.s.pzHelp) r.help = true; // validated while the gauge is shown
      const row = { total: sc.total, pegs: sc.keys.map((k) => peg(k.key, k.value, k.target)) };
      r.tries.push(row);
      const res = { ok: sc.total >= PASS, row, tries: r.tries.length, left: TRIES - r.tries.length, listens: r.listens, help: r.help };
      if (res.ok || res.left <= 0) delete g.s.runs[id];
      if (res.ok) {
        res.stars = stars(r.tries.length, r.listens, r.help);
        g.s.stars = g.s.stars || {};
        res.record = res.stars > (g.s.stars[id] || 0);
        if (res.record) g.s.stars[id] = res.stars;
        g.save();
        res.first = g.solve(id, d.reward); // first resolution only: emits game:puzzles + game:earn
        g.emit('stars', { id, stars: res.stars, record: res.record });
        if (this.current === id) this.current = null;
      } else if (res.left <= 0) {
        // out of validations: never a dead end — the gate opens anyway, without ✧ nor star
        res.out = true;
        g.s.opened = g.s.opened || [];
        if (!g.s.opened.includes(id) && !g.s.puzzles.includes(id)) g.s.opened.push(id);
        g.save(); g.emit('opened', { id });
        if (this.current === id) this.current = null;
      } else g.save();
      return res;
    },
  };

  // live score while a puzzle is open; touching a control while hearing the target brings your
  // own sound back first (your values, plus the change you just made) — no copying the target
  store.on((k, v, src) => {
    if (!puzzles.current || src === 'lfo' || src === 'evolve') return;
    if (puzzles.ab && src === 'user' && !puzzles.applying) {
      puzzles.ab = null;
      puzzles.applying = true; store.giveBack('puzzle', k); puzzles.applying = false;
      puzzles.veil(false);
    }
    AMB.game.emit('puzzle', { id: puzzles.current, side: puzzles.side(), ...puzzles.currentScore() });
  });

  // never leave the target sound behind when the page goes away or the mode changes
  if (AMB.bus) AMB.bus.on('game:mode', () => { if (puzzles.ab) puzzles.listen('mine'); });
  window.addEventListener('pagehide', () => { if (puzzles.ab) puzzles.listen('mine'); });

  AMB.puzzles = puzzles;
})();
