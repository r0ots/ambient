// « Jardin sonore » : progression state for the gamified path.
// S4.3: no currency. Each challenge (contract or Réponse gate, js/contracts.js) or secret (js/secrets.js) opens a node of the
// tree directly. "Free mode" unlocks everything (the classic app).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  // tests use their own key (window.AMB_GAME_KEY, or ?gamekey= for the real page in an iframe)
  const KEY = window.AMB_GAME_KEY || new URLSearchParams(location.search).get('gamekey') || 'ambient.game.v1';

  // v1.08 (S3.5): the 8 Composer nodes became 3; an owned old node gives the new node that holds it
  const MERGED = { 'c.arp': 'c.seq', 'c.motifs': 'c.seq', 'c.bass': 'c.rythme', 'c.perc': 'c.rythme', 'c.groove': 'c.rythme', 'c.auto': 'c.song' };

  const fresh = () => ({
    v: 1,
    mode: null, // null = not chosen yet (behaves as free until asked), 'path' or 'free'
    nodes: [], // unlocked node ids
    contracts: [], // challenges done (contracts and Réponse gates)
    resp: null, // « Réponse » (S4.2, puzzles.js): length reached, successes in a row, misses per gate
    active: [], prog: {}, // the active challenge (one at a time) and its progress (contracts.js)
    skipped: [], // challenges passed (back of the queue)
    rng: null, // seed of the Réponse phrases (contracts.js)
    secrets: null, // secrets state (secrets.js)
    ended: false, // whole tree owned: the instrument was handed over (S3.7), no game interface any more
  });

  const game = {
    key: KEY, MERGED,
    s: fresh(),
    // only the known fields are kept: older saves lose their ✧ (shards, earned), solved puzzles and opened gates,
    // and keep their nodes (S4.3)
    load() {
      try {
        const o = JSON.parse(localStorage.getItem(KEY));
        if (o && o.v === 1) {
          const f = fresh();
          for (const k of Object.keys(f)) if (k in o) f[k] = o[k];
          f.nodes = [...new Set((f.nodes || []).map((id) => MERGED[id] || id))];
          this.s = f;
        }
      } catch (e) {}
      return this;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (e) {} },
    // restart the path (the chosen mode is kept; the root is given back by tree.js)
    reset() { const m = this.s.mode; this.s = fresh(); this.s.mode = m; this.save(); this.emit('reset'); },
    emit(ev, data) { if (AMB.bus) AMB.bus.emit('game:' + ev, data); },

    // mode
    get path() { return this.s.mode === 'path'; },
    // the path's effects may apply now (challenges, secrets): never in free mode nor once the instrument is handed over
    counts() { return this.path && !this.s.ended; },
    setMode(m) {
      if (m !== 'path' && m !== 'free') return;
      this.s.mode = m; this.save(); this.emit('mode', m);
    },

    // nodes (the tree: tree.js). by = the challenge that opened it (garden plays the unlock sequence), or null
    has(id) { return this.s.nodes.includes(id); },
    isUnlocked(id) { return !this.path || !id || this.has(id); },
    unlock(id, by = null) {
      if (this.has(id)) return false;
      this.s.nodes.push(id); this.save();
      this.emit('unlock', { id, by });
      return true;
    },
    // a challenge done (once)
    complete(id) {
      if (this.s.contracts.includes(id)) return false;
      this.s.contracts.push(id); this.save();
      this.emit('contracts', { id });
      return true;
    },
  };

  AMB.game = game.load();
})();
