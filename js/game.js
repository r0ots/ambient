// « Jardin sonore » : progression state for the gamified path.
// Shards (✧) are earned by discoveries, usage contracts and target puzzles — never by waiting —
// and spent to unlock nodes of the tree. "Free mode" unlocks everything (the classic app).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  // tests use their own key (window.AMB_GAME_KEY, or ?gamekey= for the real page in an iframe)
  const KEY = window.AMB_GAME_KEY || new URLSearchParams(location.search).get('gamekey') || 'ambient.game.v1';

  const fresh = () => ({
    v: 1,
    mode: null, // null = not chosen yet (behaves as free until asked), 'path' or 'free'
    shards: 0, earned: 0, // current balance, lifetime total
    nodes: [], // unlocked node ids
    found: [], // discovery ids
    contracts: [], // completed contract ids
    puzzles: [], // solved puzzle ids
    stars: {}, opened: [], runs: {}, pzHelp: false, // puzzles (G8.1): best stars per puzzle, gates opened after 6 failures, attempts in progress, live gauge
    active: [], prog: {}, // active contracts and their progress (contracts.js)
    ended: false, // the end screen was shown (whole tree owned)
    profile: null, // player profile (G8.4 / G9b.3): null (not chosen, behaves as 'musicien'), 'musicien' or 'decouverte'
    placed: [], placement: null, // nodes opened by the placement test (their discoveries pay nothing), last test {at, passed}
  });

  const game = {
    key: KEY,
    s: fresh(),
    load() {
      try {
        const o = JSON.parse(localStorage.getItem(KEY));
        if (o && o.v === 1) this.s = { ...fresh(), ...o };
      } catch (e) {}
      return this;
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch (e) {} },
    // restart the path (the chosen mode is kept; the root is given back by tree.js)
    reset() { const m = this.s.mode, p = this.s.profile; this.s = fresh(); this.s.mode = m; this.s.profile = p; this.save(); this.emit('reset'); },
    emit(ev, data) { if (AMB.bus) AMB.bus.emit('game:' + ev, data); },

    // mode
    get path() { return this.s.mode === 'path'; },
    // the path's effects and gains may apply now: path on, no arcade round running, no puzzle target being heard
    // (contracts, secrets; free mode, the arcade and a puzzle's « ▶ cible » never count as playing the path)
    freePlay() { return this.path && !(AMB.arcade && AMB.arcade.active) && !(AMB.puzzles && AMB.puzzles.ab); },
    setMode(m) {
      if (m !== 'path' && m !== 'free') return;
      this.s.mode = m; this.save(); this.emit('mode', m);
    },

    // player profile (whoever plays, in any mode): 'musicien' (real names, placement test) or 'decouverte' (the kid:
    // easy start levels, kid labels, « Jouer 2 min »). Read it with profile() / isKid(); emits game:profile
    PROFILES: ['musicien', 'decouverte'],
    profile() { return this.s.profile || 'musicien'; },
    isKid() { return this.s.profile === 'decouverte'; },
    setProfile(p) {
      if (!this.PROFILES.includes(p)) return false;
      this.s.profile = p; this.save(); this.emit('profile', p);
      return true;
    },
    // a node opened by the placement test: its discoveries are marked but pay nothing (no free ✧)
    isPlaced(id) { return !!id && (this.s.placed || []).includes(id); },

    // shards
    earn(n, reason, id) {
      n = Math.max(0, Math.round(n));
      if (!n) return 0;
      this.s.shards += n; this.s.earned += n; this.save();
      this.emit('earn', { n, reason, id, total: this.s.shards });
      return n;
    },
    canAfford(n) { return this.s.shards >= n; },
    spend(n) {
      if (!this.canAfford(n)) return false;
      this.s.shards -= n; this.save();
      this.emit('spend', { n, total: this.s.shards });
      return true;
    },

    // nodes (the tree itself is defined in G1.2; `cost` comes from it)
    has(id) { return this.s.nodes.includes(id); },
    isUnlocked(id) { return !this.path || !id || this.has(id); },
    unlock(id, cost = 0) {
      if (this.has(id)) return false;
      if (cost && !this.spend(cost)) return false;
      this.s.nodes.push(id); this.save();
      this.emit('unlock', { id });
      return true;
    },

    // one-shot records: discoveries, contracts, puzzles — each only ever counts once
    mark(list, id, reward, reason) {
      const arr = this.s[list];
      if (!arr || arr.includes(id)) return false;
      arr.push(id); this.save();
      this.emit(list, { id });
      if (reward) this.earn(reward, reason || list, id);
      return true;
    },
    discover(id, reward) { return this.mark('found', id, reward, 'découverte'); },
    complete(id, reward) { return this.mark('contracts', id, reward, 'contrat'); },
    solve(id, reward) { return this.mark('puzzles', id, reward, 'énigme'); },
  };

  AMB.game = game.load();
})();
