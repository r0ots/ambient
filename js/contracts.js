// « Jardin sonore » : usage contracts — small, checkable goals ("change the drone colour 3 times
// while it plays"). Three are active at a time, picked in order among those whose nodes are owned.
// Judged on usage only, never on taste. Progress lives in game.s.prog, completion in game.s.contracts.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const ACTIVE = 3;
  const playing = () => !!(AMB.seq && AMB.seq.playing);

  // a user gesture on `key` counts once per `gap` ms (a knob drag is one gesture, not 40)
  const gesture = (st, key, gap = 900) => {
    const now = Date.now(), k = 't_' + key;
    if (st[k] && now - st[k] < gap) { st[k] = now; return false; }
    st[k] = now; return true;
  };
  const distinct = (st, v) => { st.seen = st.seen || []; if (!st.seen.includes(v)) { st.seen.push(v); st.n = st.seen.length; } };

  // contract: { id, need: [node ids], title, hint, reward, goal, on: { param|act|chord|bar|note(st, …) } }
  const C = (id, need, title, reward, goal, on, hint) => ({ id, need, title, reward, goal, on, hint: hint || '' });
  const DEFS = [
    // Tronc
    C('k.couleur', ['racine'], 'Fais varier la couleur du drone 3 fois pendant qu\'il joue', 6, 3, {
      param(st, k, v, src) { if (k === 'drone.tone' && src === 'user' && playing() && gesture(st, k)) st.n = (st.n || 0) + 1; },
    }, 'Lecture, puis Sculpter > Drone > Couleur'),
    C('k.souffle', ['racine'], 'Coupe le drone puis rallume-le, sans arrêter la lecture', 6, 2, {
      param(st, k, v, src) {
        if (k !== 'drone.on' || src !== 'user' || !playing()) return;
        if (!v) st.n = 1; else if (st.n === 1) st.n = 2;
      },
    }),
    C('k.timbres', ['t.son'], 'Écoute les 4 timbres du drone', 8, 4, {
      param(st, k, v, src) { if (k === 'drone.wave' && src === 'user') distinct(st, v); },
    }),
  ];
  const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));

  const contracts = {
    DEFS, byId,
    state(g = AMB.game) { g.s.active = g.s.active || []; g.s.prog = g.s.prog || {}; g.s.skipped = g.s.skipped || []; return g.s; },
    eligible(d, g = AMB.game) { return !g.s.contracts.includes(d.id) && d.need.every((n) => g.has(n)); },
    // keep three active contracts, in definition order
    refill(g = AMB.game) {
      if (!g.path) return;
      const s = this.state(g);
      s.active = s.active.filter((id) => byId[id] && !g.s.contracts.includes(id));
      const skipped = s.skipped || [];
      const order = DEFS.filter((d) => !skipped.includes(d.id)).concat(skipped.map((id) => byId[id]).filter(Boolean));
      for (const d of order) {
        if (s.active.length >= ACTIVE) break;
        if (!s.active.includes(d.id) && this.eligible(d, g)) { s.active.push(d.id); s.prog[d.id] = s.prog[d.id] || { n: 0 }; }
      }
      g.save(); g.emit('contract', { active: s.active.slice() });
    },
    progress(id, g = AMB.game) { const st = this.state(g).prog[id]; return Math.min(byId[id].goal, (st && st.n) || 0); },
    // route an event to every active contract; complete those that reach their goal
    dispatch(ev, ...args) {
      const g = AMB.game; if (!g.path) return;
      const s = this.state(g); let changed = false;
      for (const id of s.active.slice()) {
        const d = byId[id]; const fn = d && d.on[ev]; if (!fn) continue;
        const st = (s.prog[id] = s.prog[id] || { n: 0 }), before = st.n || 0;
        fn(st, ...args);
        if ((st.n || 0) !== before) {
          changed = true;
          g.emit('contract', { id, n: this.progress(id), goal: d.goal });
          if ((st.n || 0) >= d.goal) this.finish(id);
        }
      }
      if (changed) g.save();
    },
    finish(id, g = AMB.game) {
      const d = byId[id]; if (!d) return;
      const s = this.state(g);
      s.active = s.active.filter((x) => x !== id);
      delete s.prog[id];
      g.complete(id, d.reward); // emits game:contracts + game:earn
      this.refill(g);
    },
    // a stuck contract can be put back at the end of the queue (no reward)
    skip(id, g = AMB.game) {
      const s = this.state(g); if (!s.active.includes(id)) return;
      s.active = s.active.filter((x) => x !== id);
      s.skipped = (s.skipped || []).filter((x) => x !== id).concat(id); // back of the queue
      this.refill(g);
    },
  };

  // ---- event sources ----
  store.on((k, v, src) => contracts.dispatch('param', k, v, src));
  if (AMB.bus) {
    AMB.bus.on('chord', (c) => contracts.dispatch('chord', c));
    AMB.bus.on('act', (id) => contracts.dispatch('act', id));
    AMB.bus.on('live', (n) => contracts.dispatch('note', n));
    ['unlock', 'mode', 'reset'].forEach((e) => AMB.bus.on('game:' + e, () => contracts.refill()));
  }
  // bar lines while playing (the sequencer counts 16th steps)
  let lastBar = -1;
  setInterval(() => {
    if (!playing()) { lastBar = -1; return; }
    const bar = Math.floor((AMB.seq.step || 0) / 16);
    if (bar !== lastBar) { if (lastBar >= 0) contracts.dispatch('bar', bar); lastBar = bar; }
  }, 250);

  AMB.contracts = contracts;
  contracts.refill();
})();
