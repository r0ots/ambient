// « Jardin sonore » : target puzzles — "make your sound match this one". A puzzle is a target
// value for a few parameters; the score compares the current values to the target (knobs by
// distance, lists and switches by equality). Judged on reaching the target, never on taste.
// Puzzles only use parameters that are already unlocked when they become available.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const PASS = 0.9;

  // knob closeness: 1 at the target, 0 at a quarter of the range away (or further)
  const TOL = 0.25;
  function keyScore(key, v, target) {
    const sp = store.spec(key); if (!sp) return 0;
    if (sp.type === 'select' || sp.type === 'toggle' || sp.type === 'text') return v === target ? 1 : 0;
    const span = (sp.max - sp.min) || 1, d = Math.abs(Number(v) - Number(target)) / span;
    return Math.max(0, 1 - d / TOL);
  }

  // puzzle: { id, title, intro, need: [node ids to attempt], target: {key: value}, reward, opens }
  const P = (id, need, title, intro, target, reward, opens) => ({ id, need, title, intro, target, reward, opens: opens || null });
  const DEFS = [
    P('p.premier', ['t.son', 'h.pad'], 'Premier reflet',
      'Un drone d\'orgue clair sous un Pad de verre très sombre. Retrouve ce son.',
      { 'drone.wave': 'Orgue', 'drone.tone': 0.75, 'pad.wave': 'Verre', 'pad.tone': 0.2 }, 15, 't.macros'),
  ];
  const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));

  const puzzles = {
    DEFS, byId, PASS, keyScore,
    // per-key detail and overall score of the current sound against a puzzle
    score(id, values = store.snapshot()) {
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
    start(id) {
      if (!byId[id]) return false;
      this.current = id;
      AMB.game.emit('puzzle', { id, ...this.score(id) });
      return true;
    },
    stop() { this.current = null; AMB.game.emit('puzzle', { id: null }); },
    // validate: solved when the score reaches PASS
    check(id = this.current) {
      if (!id || !byId[id]) return false;
      const { total } = this.score(id);
      if (total < PASS) return false;
      AMB.game.solve(id, byId[id].reward); // emits game:puzzles + game:earn
      if (this.current === id) this.current = null;
      return true;
    },
  };

  // live score while a puzzle is open
  store.on(() => { if (puzzles.current) AMB.game.emit('puzzle', { id: puzzles.current, ...puzzles.score(puzzles.current) }); });

  AMB.puzzles = puzzles;
})();
