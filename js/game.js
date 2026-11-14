// « Jardin sonore » : progression state for the gamified path.
// S4.3: no currency. Each challenge (contract or Réponse gate, js/contracts.js) or discovery (js/discoveries.js) opens a node of the
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
    ready: [], // S4.6: won (challenge, Réponse, discovery), waiting for the player to open them, in order: [{id, by}]
    contracts: [], // challenges done (contracts and Réponse gates)
    resp: null, // « Réponse » (S4.2, puzzles.js): length reached, successes in a row, misses per gate
    active: [], prog: {}, // the active challenge (one at a time) and its progress (contracts.js)
    skipped: [], // objectives passed (↷: their piece goes to the back of the queue)
    log: [], // S11.1 the history the Objectifs widget shows: [{id (objective) | disc (discovery), node, t, by}], oldest first
    ob: 2, // S11.1 a piece asks for 2–3 objectives (older saves: 1, contracts.migrate)
    rng: null, // seed of the Réponse phrases (contracts.js)
    secrets: null, // discoveries state (discoveries.js; the field keeps its old name: older saves' secrets are discoveries)
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
          if (!('ob' in o)) { // before S11.1: one challenge per piece, and the keys from the start: a player who owns
            f.ob = 1; // pieces keeps them (the Piano counts as open)
            if (f.nodes.some((id) => id !== 'racine') && !f.nodes.includes('k.piano')) f.nodes.push('k.piano');
          }
          f.nodes = [...new Set((f.nodes || []).map((id) => MERGED[id] || id))];
          f.ready = (Array.isArray(f.ready) ? f.ready : []).filter((r) => r && typeof r.id === 'string' && !f.nodes.includes(r.id));
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
    // the path's effects may apply now (challenges, discoveries): never in free mode nor once the instrument is handed over
    counts() { return this.path && !this.s.ended; },
    setMode(m) {
      if (m !== 'path' && m !== 'free') return;
      this.s.mode = m; this.save(); this.emit('mode', m);
    },

    // nodes (the tree: tree.js). by = the challenge that opened it (garden plays the unlock sequence), or null
    has(id) { return this.s.nodes.includes(id); },
    isUnlocked(id) { return !this.path || !id || this.has(id); },
    unlock(id, by = null) {
      const q = this.s.ready || [];
      this.s.ready = q.filter((r) => r.id !== id);
      if (this.has(id)) { if (q.length !== this.s.ready.length) this.save(); return false; }
      this.s.nodes.push(id); this.save();
      this.emit('unlock', { id, by });
      return true;
    },
    // S4.6: a success no longer opens its node by itself: the node is « prêt » and waits in a queue until the player opens it
    // (garden.js: S11.1 « ✦ … est prêt » in the Objectifs widget, the Arbre, a few words on what it gives, then the opening). by = as for unlock
    isReady(id) { return (this.s.ready || []).some((r) => r.id === id); },
    readyIds() { return (this.s.ready || []).map((r) => r.id); },
    ready(id, by = null) {
      if (!id || this.has(id) || this.isReady(id)) return false;
      (this.s.ready = this.s.ready || []).push({ id, by }); this.save();
      this.emit('ready', { id, by });
      return true;
    },
    // a node and its missing prerequisites, ready in order (a discovery, a placement S5.4); returns the ids made ready
    readyChain(id, out = []) {
      const n = AMB.tree && AMB.tree.byId[id]; if (!n || this.has(id) || this.isReady(id)) return out;
      for (const r of n.req) this.readyChain(r, out);
      if (this.ready(id)) out.push(id);
      return out;
    },
    // the next one the player can open: the first of the queue whose prerequisites are open (a discovery queues them first)
    canOpen(id) { const n = AMB.tree && AMB.tree.byId[id]; return this.isReady(id) && (!n || n.req.every((x) => this.has(x))); },
    nextReady() { return (this.s.ready || []).find((r) => this.canOpen(r.id)) || null; },
    // open a waiting node (nextReady by default); never before its prerequisites are open
    open(id) {
      const r = id ? (this.s.ready || []).find((x) => x.id === id) : this.nextReady();
      if (!r || !this.canOpen(r.id)) return false;
      return this.unlock(r.id, r.by);
    },
    // S5.7: a touch screen (no keys, no MIDI): the texts of the path drop their keyboard parts. A text may hold
    // « {keyboard words|touch words} »; txt() keeps one side. `touchOverride` = tests.
    touchOverride: null,
    touch() { return this.touchOverride != null ? this.touchOverride : !!(window.matchMedia && matchMedia('(pointer: coarse)').matches); },
    txt(s) { if (s == null) return s; const t = this.touch(); return String(s).replace(/\{([^|{}]*)\|([^{}]*)\}/g, (m, a, b) => (t ? b : a)); },
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
