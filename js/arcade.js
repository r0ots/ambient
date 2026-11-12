// Arcade de l'oreille (G9.1): a PURE round engine for the ear-training mini-games.
// No DOM, no audio of its own: an injected clock (arcade.clock.now(), ms), a seeded PRNG
// (AMB.audition.rng), mini-games registered as plugins, an adaptive staircase difficulty per
// mini-game and per profile, score × combo, stars and records in localStorage under its own key.
// While a round runs, `arcade.active` is true and AMB.audition.session(true) ducks the ambience
// and freezes the Dérive; nothing is ever written to AMB.store, so free mode keeps no trace.
//
// Plugin API — arcade.register({
//   id, title, skill, blurb, kid: true|false,
//   make(rng, d) -> challenge          d in 0..1 (0 = easiest); rng = seeded mulberry32 (rng(), rng.int(n), rng.pick(a))
//   stimulus(ch) -> [{t, midi|hz, dur, vel, cents?, voice}]   events for AMB.audition.play
//     or play(ch, api) -> Promise      custom playback (api.play(events) plays events)
//   choices(ch) -> [{value, label}] | null    null = the answer is played (keyboard / MIDI)
//   check(ch, answer) -> {ok, partial?}       partial in 0..1 = share of the points (ok must be false)
//   render?(ch, el, api)               optional custom UI inside the round's stage element
//   onKey?(ch, e, api) -> true if handled     keys reach the plugin during a round (the app's are muted)
//   passKeys?: ['KeyA', …]             e.code values let through to the app's own shortcuts
// })
// api = {answer(x), replay(), play(events), stop(), ch, d, rng}
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const q = new URLSearchParams(location.search);
  const KEY = window.AMB_ARCADE_KEY || q.get('arcadekey') || 'ambient.arcade.v1';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const emit = (ev, d) => { if (AMB.bus) AMB.bus.emit(ev, d); };

  // staircase: 2 successes in a row -> harder, 1 error -> easier; the step shrinks at each reversal
  const STAIR = { step: 0.12, shrink: 0.7, minStep: 0.02, restart: 0.04, lo: 0, hi: 1 };
  const SCORE = { base: 100, levelBonus: 100, noReplay: 0.5 };
  // stars: score relative to what is expected at the level the round started at
  const STARS = [0.4, 0.8, 1.3];

  const fresh = () => ({ v: 1, profile: 'default', profiles: {} });

  // internal combo (same rule as AMB.juice.combo: x1 -> x4, one tier every 3 hits)
  const ownCombo = {
    n: 0, mult: 1, best: 0,
    hit() { this.n++; this.best = Math.max(this.best, this.n); this.mult = Math.min(4, 1 + Math.floor(this.n / 3)); return this.mult; },
    miss() { this.n = 0; this.mult = 1; return 1; },
    reset() { this.n = 0; this.mult = 1; this.best = 0; },
  };

  const arcade = {
    key: KEY,
    DURATION: 75000,
    STAIR, SCORE, STARS,
    games: [], byId: {},
    clock: { now: () => (window.performance ? performance.now() : Date.now()) },
    s: fresh(),
    round: null,
    active: false,

    // ---- registry ----
    register(g) {
      if (!g || !g.id || typeof g.make !== 'function' || typeof g.check !== 'function') throw new Error('arcade.register: id, make, check required');
      if (this.byId[g.id]) this.games.splice(this.games.indexOf(this.byId[g.id]), 1);
      const def = { title: g.id, skill: '', blurb: '', kid: false, ...g };
      this.games.push(def); this.byId[g.id] = def;
      emit('arcade:register', { id: g.id });
      return def;
    },

    // ---- persistence (per profile, per mini-game) ----
    load() {
      try { const o = JSON.parse(localStorage.getItem(this.key)); if (o && o.v === 1) this.s = { ...fresh(), ...o }; } catch (e) {}
      return this;
    },
    save() { try { localStorage.setItem(this.key, JSON.stringify(this.s)); } catch (e) {} },
    get profile() { return this.s.profile; },
    setProfile(name) { if (!name || this.active) return false; this.s.profile = String(name); this.save(); return true; },
    stats(id, profile = this.s.profile) {
      const P = (this.s.profiles[profile] = this.s.profiles[profile] || { games: {} });
      return (P.games[id] = P.games[id] || { d: 0, peak: 0, step: STAIR.step, plays: 0, best: {} });
    },
    pactKey(pacts) { return (pacts || []).slice().sort().join('+'); },
    record(id, pacts) { return this.stats(id).best[this.pactKey(pacts)] || null; },
    level(id) { return this.stats(id).d; },

    // ---- staircase ----
    // st = {d, step, run, dir}; returns the new d
    stair(st, ok) {
      let dir = 0;
      if (ok) { st.run = (st.run || 0) + 1; if (st.run >= 2) { dir = 1; st.run = 0; } } else { st.run = 0; dir = -1; }
      if (!dir) return st.d;
      if (st.dir && dir !== st.dir) st.step = Math.max(STAIR.minStep, st.step * STAIR.shrink); // reversal
      st.dir = dir;
      st.d = clamp(st.d + dir * st.step, STAIR.lo, STAIR.hi);
      return st.d;
    },

    // ---- round ----
    combo() { return (AMB.juice && AMB.juice.combo) || ownCombo; },
    start(gameId, opts = {}) {
      const g = this.byId[gameId];
      if (!g) return null;
      if (this.round) this.end({ abort: true });
      const st = this.stats(gameId), now = this.clock.now();
      const seed = opts.seed != null ? opts.seed >>> 0 : (Math.floor(now * 1000) ^ 0x9e3779b9) >>> 0;
      const rng = AMB.audition ? AMB.audition.rng(seed) : null;
      if (!rng) return null;
      this.round = {
        game: g, seed, rng, pacts: (opts.pacts || []).slice(), t0: now, dur: opts.duration || this.DURATION,
        d0: st.d, stair: { d: st.d, step: Math.max(st.step, STAIR.restart), run: 0, dir: 0 }, peak: st.d,
        score: 0, n: 0, good: 0, clean: 0, replays: 0, chReplays: 0, ch: null, history: [], over: false,
      };
      this.active = true;
      this.combo().reset();
      if (AMB.audition) AMB.audition.session(true);
      this.next();
      emit('arcade:start', { id: g.id, seed, d: st.d, pacts: this.round.pacts });
      return this.round;
    },
    next() {
      const r = this.round; if (!r) return null;
      r.ch = r.game.make(r.rng, r.stair.d);
      r.chReplays = 0; r.n++;
      emit('arcade:challenge', { id: r.game.id, n: r.n, d: r.stair.d });
      return r.ch;
    },
    timeLeft() { const r = this.round; return r ? Math.max(0, r.dur - (this.clock.now() - r.t0)) : 0; },
    // the UI calls this regularly: ends the round when the time is up
    tick() { if (this.round && !this.round.over && this.timeLeft() <= 0) return this.end(); return null; },
    api() {
      const r = this.round;
      return {
        answer: (x) => this.answer(x), replay: () => this.replay(), stop: () => AMB.audition && AMB.audition.stop(),
        play: (ev) => (AMB.audition ? AMB.audition.play(ev) : 0), ch: r && r.ch, d: r && r.stair.d, rng: r && r.rng,
      };
    },
    // play the current challenge's stimulus (no count); returns its duration (s) or a Promise
    listen() {
      const r = this.round; if (!r || !r.ch) return 0;
      if (AMB.audition) AMB.audition.stop();
      if (typeof r.game.play === 'function') return r.game.play(r.ch, this.api());
      if (typeof r.game.stimulus === 'function' && AMB.audition) return AMB.audition.play(r.game.stimulus(r.ch) || []);
      return 0;
    },
    replay() {
      const r = this.round; if (!r || r.over) return 0;
      r.replays++; r.chReplays++;
      return this.listen();
    },
    choices() { const r = this.round; return r && r.ch && typeof r.game.choices === 'function' ? r.game.choices(r.ch) : null; },
    answer(x) {
      const r = this.round; if (!r || r.over || !r.ch) return null;
      if (this.timeLeft() <= 0) { this.end(); return null; }
      const res = r.game.check(r.ch, x) || {}, ok = !!res.ok, clean = r.chReplays === 0;
      const C = this.combo();
      // the combo grows only on risky answers (no replay); a replayed right answer keeps it
      let mult = C.mult;
      if (ok && clean) mult = C.hit(); else if (!ok) mult = C.miss();
      const part = ok ? 1 : clamp(+res.partial || 0, 0, 1);
      let pts = 0;
      if (part > 0) {
        pts = (SCORE.base + SCORE.levelBonus * r.stair.d) * part;
        if (clean) pts *= 1 + SCORE.noReplay;
        pts = Math.round(pts * mult);
      }
      r.score += pts; if (ok) { r.good++; if (clean) r.clean++; }
      const dWas = r.stair.d, d = this.stair(r.stair, ok);
      r.peak = Math.max(r.peak, d);
      r.history.push({ ok, pts, d: dWas, replays: r.chReplays });
      const out = { ok, partial: res.partial, pts, d, combo: C.n, mult, clean, score: r.score, ch: r.ch, answer: x };
      emit('arcade:answer', out);
      this.next();
      return out;
    },
    // expected score of a whole round at level d (the star thresholds scale with it)
    par(d, dur) { return Math.round(2400 * (0.5 + d) * ((dur || this.DURATION) / 75000)); },
    starsFor(score, d, dur) { const p = this.par(d, dur); return STARS.filter((k) => score >= k * p).length; },
    end(opts = {}) {
      const r = this.round; if (!r) return null;
      r.over = true;
      const g = r.game, st = this.stats(g.id), abort = !!opts.abort;
      // the level always follows the staircase (it is the player's ear), even after an abort
      st.d = r.stair.d; st.step = r.stair.step; st.peak = Math.max(st.peak || 0, r.peak);
      const stars = abort ? 0 : this.starsFor(r.score, r.d0, r.dur);
      const pk = this.pactKey(r.pacts), prev = st.best[pk];
      const record = !abort && r.score > 0 && (!prev || r.score > prev.score);
      if (!abort) {
        st.plays++;
        if (record) st.best[pk] = { score: r.score, stars: Math.max(stars, prev ? prev.stars : 0), at: Date.now() };
        else if (prev && stars > prev.stars) prev.stars = stars;
      }
      this.save();
      const out = { id: g.id, score: r.score, stars, record, abort, good: r.good, clean: r.clean, total: r.history.length, replays: r.replays, d: st.d, peak: st.peak, best: st.best[pk] || null, pacts: r.pacts };
      this.round = null; this.active = false; this.last = out;
      if (AMB.audition) AMB.audition.session(false);
      emit('arcade:end', out);
      return out;
    },
  };

  AMB.arcade = arcade.load();
})();
