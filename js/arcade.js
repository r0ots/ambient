// Arcade de l'oreille (G9.1): a PURE round engine for the ear-training mini-games.
// No DOM, no audio of its own: an injected clock (arcade.clock.now(), ms), a seeded PRNG
// (AMB.audition.rng), mini-games registered as plugins, an adaptive staircase difficulty per
// mini-game and per profile, score × combo, stars and records in localStorage under its own key.
// While a round runs, `arcade.active` is true and AMB.audition.session(true) ducks the ambience
// and freezes the Dérive; nothing is ever written to AMB.store, so free mode keeps no trace.
//
// Plugin API (the contract the mini-games of js/arcade/<id>.js rely on) — arcade.register({
//   id, title, skill, blurb, kid: true|false,
//   make(rng, d) -> challenge          d in 0..1 (0 = easiest); rng = seeded mulberry32 (rng(), rng.int(n), rng.pick(a));
//                                      never Math.random: same seed + same answers = same round
//   stimulus(ch) -> [{t, midi|hz, dur, vel, cents?, voice}]   events for AMB.audition.play (voice: sine|triangle|pluck|bell)
//     or play(ch, api) -> Promise      custom playback (api.play(events) plays events and sets api.t0)
//   choices(ch) -> [{value, label}] | null    null = the answer is played (keyboard / MIDI) or given by render()
//   check(ch, answer) -> {ok, partial?, bonus?}   partial in 0..1 = share of the points (ok must be false);
//                                      bonus in 0..1 = precision bonus, adds SCORE.bonus × bonus of the base points
//                                      (e.g. Réponds en jouant: share of « parfait » notes)
//   reveal?: ms                        pause after the answer before the next challenge (default REVEAL = 450 ms):
//                                      time to see the plugin's own feedback (Accordeur's needle, Réponds' verdict);
//                                      answers are locked meanwhile. arcade:answer carries it as `reveal`
//   prepare?(api) -> Promise           called by js/arcade-ui.js BEFORE arcade.start, off the clock (e.g. Réponds'
//                                      first-launch latency calibration). api = {stage (element), play(events),
//                                      note(ev), stop(), now(), onKey(fn(e) -> true if handled), onMidi(fn({midi,
//                                      vel, time})), cancelled() -> true once the player left}; while it runs,
//                                      arcade.prep = {key, midi} routes the keys and MIDI to it
//   render?(ch, el, api)               optional custom UI inside the round's stage element (.arc-<id>-* classes)
//   onKey?(ch, e, api) -> true if handled     keys reach the plugin during a round (the app's are muted)
//   passKeys?: ['KeyA', …]             e.code values let through to the app's own shortcuts
//   onMidi?(ch, {midi, vel, time, sustain, input}, api)   MIDI note-on during a round (vel = raw MIDI velocity 0..1,
//                                      time = performance.now ms, sustain = CC64 pedal held, input = MIDI input name:
//                                      every connected input is accepted, several at once)
//   onMidiOff?(ch, {midi, time, sustain, input}, api)     MIDI note-off during a round (note-on with velocity 0 included);
//                                      while sustain is true the note still rings: a game that cares waits for onCC
//   onCC?(ch, {cc, value, time, sustain, input}, api)     any MIDI control change (value 0..1). Decision (G9b.2): the
//                                      engine tracks CC64 (sustain pedal) in arcade.sustain and puts it on every note
//                                      event; onCC gets the pedal's own moves (e.g. Dictée evaluates on pedal release)
//   rhythm games: prepare(api) { return AMB.latency.ensure(api); } and subtract AMB.latency.get(src, input) from the
//                                      tap times (js/latency.js: per device, per input key / touch / midi / MIDI keyboard)
//                                      while the cabinet is open the app never plays MIDI (js/play.js): without
//                                      these hooks the notes are simply ignored
// })
// api = {answer(x), replay(), play(events) -> {dur, at, t0}, stop(), note(ev), t0, ch, d, rng}
//   t0 = performance.now() ms at which the last stimulus really starts sounding (compare with MIDI / key times)
//   note(ev) = immediate feedback sound on the audition bus ({midi|hz, dur?, vel?, cents?, voice?}), does not move t0
// arcade.open = the cabinet is on screen (set by js/arcade-ui.js); arcade.active = a round is running.
// arcade.kid (also api.kid) = the player profile is « découverte » (AMB.game.isKid()): rounds start at d = 0 and
//   plugins show kid labels (read it in make() and store it in the challenge, e.g. Chasseur de modes).
// start(id, {seed, pacts, duration, d (start level), dMax (level cap), practice (no record, no play counted)}).
//
// Pacts (G9.8, chosen difficulty à la Hades; definitions, multipliers and per-game choice in js/pacts.js):
// start(id, {pacts: ['une-ecoute', …]}) — the engine applies their rules, the score is multiplied by
// AMB.pacts.mult(pacts) (stars too: weighted score), records stay per exact combination.
//   une-ecoute  replay() refused            transpose  every challenge shifted by ±1..6 semitones: playEvents
//   proches     make(rng, d + 0.2)          shifts every `midi` / `hz` event, api.transpose = the shift (a plugin
//   avant-fin   answer after the stimulus   whose answer depends on absolute pitch reads it, or declares
//               ended = wrong (late)        `pacts: {transpose: false}`); the staircase level is never touched
//   metronome   no answer 3 s after the stimulus ended = wrong (late)   funambule  first wrong answer ends the round
//   silence     UI only (no verdict, no score until the end)
// start(id, opts): opts.seed, opts.duration (ms; Infinity = no clock, « zen »), opts.d (starting level instead of the
// player's), opts.fixed (level frozen: no staircase), opts.count (the round ends after that many answers),
// opts.ghost (nothing saved: level, plays and records untouched — daily challenge, duels: js/daily.js, js/duel.js)
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const q = new URLSearchParams(location.search);
  const KEY = window.AMB_ARCADE_KEY || q.get('arcadekey') || 'ambient.arcade.v1';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const emit = (ev, d) => { if (AMB.bus) AMB.bus.emit(ev, d); };

  // staircase: 2 successes in a row -> harder, 1 error -> easier; the step shrinks at each reversal
  const STAIR = { step: 0.12, shrink: 0.7, minStep: 0.02, restart: 0.04, lo: 0, hi: 1 };
  const SCORE = { base: 100, levelBonus: 100, noReplay: 0.5, bonus: 0.5 };
  const REVEAL = 450; // default pause (ms) after an answer, before the next challenge (plugin hook: reveal)
  // stars: score relative to what is expected at the level the round started at
  const STARS = [0.4, 0.8, 1.3];
  // pact rules (G9.8): level offset of « Leurres proches », max transposition (semitones), « Métronome » window (ms)
  const PACT = { near: 0.2, transpose: 6, metronome: 3000 };

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
    STAIR, SCORE, STARS, REVEAL, PACT,
    games: [], byId: {},
    clock: { now: () => (window.performance ? performance.now() : Date.now()) },
    s: fresh(),
    round: null,
    active: false, // a round is running
    prep: null, // {key, midi} handlers while a plugin's prepare() runs (set by js/arcade-ui.js)
    open: false, // the cabinet (js/arcade-ui.js) is on screen: the app plays no MIDI, juice effects allowed in free mode

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
    // the player is the kid (profile « découverte », js/game.js): easy start level, kid labels
    get kid() { return !!(AMB.game && AMB.game.isKid && AMB.game.isKid()); },

    // ---- staircase ----
    // st = {d, step, run, dir}; returns the new d
    stair(st, ok) {
      let dir = 0;
      if (ok) { st.run = (st.run || 0) + 1; if (st.run >= 2) { dir = 1; st.run = 0; } } else { st.run = 0; dir = -1; }
      if (!dir) return st.d;
      if (st.dir && dir !== st.dir) st.step = Math.max(STAIR.minStep, st.step * STAIR.shrink); // reversal
      st.dir = dir;
      st.d = clamp(st.d + dir * st.step, STAIR.lo, st.hi != null ? st.hi : STAIR.hi);
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
      const d0 = clamp(opts.d != null && isFinite(opts.d) ? +opts.d : this.kid ? 0 : st.d, STAIR.lo, opts.dMax != null ? +opts.dMax : STAIR.hi);
      const pacts = (opts.pacts || []).slice(), P = AMB.pacts;
      this.round = {
        game: g, seed, rng, pacts, t0: now,
        pmult: P && P.mult ? P.mult(pacts) : 1, trRng: pacts.includes('transpose') ? AMB.audition.rng((seed ^ 0x5bd1e995) >>> 0) : null, tr: 0, stimEnd: 0, dur: opts.duration || this.DURATION,
        d0, stair: { d: d0, step: Math.max(st.step, STAIR.restart), run: 0, dir: 0, hi: opts.dMax }, peak: d0, practice: !!opts.practice, kid: this.kid,
        fixed: !!opts.fixed, count: Math.max(0, opts.count | 0), ghost: !!opts.ghost,
        score: 0, n: 0, good: 0, clean: 0, replays: 0, chReplays: 0, ch: null, history: [], over: false, t0Stim: 0,
      };
      this.active = true;
      this.combo().reset();
      if (AMB.audition) AMB.audition.session(true);
      this.next();
      emit('arcade:start', { id: g.id, seed, d: d0, pacts: this.round.pacts });
      return this.round;
    },
    next() {
      const r = this.round; if (!r) return null;
      // pacts: the transposition has its own rng (rounds without it are unchanged); « proches » serves harder challenges
      r.tr = r.trRng ? (1 + r.trRng.int(PACT.transpose)) * (r.trRng() < 0.5 ? -1 : 1) : 0;
      r.ch = r.game.make(r.rng, r.pacts.includes('proches') ? Math.min(1, r.stair.d + PACT.near) : r.stair.d);
      r.chReplays = 0; r.n++; r.stimEnd = 0;
      emit('arcade:challenge', { id: r.game.id, n: r.n, d: r.stair.d });
      return r.ch;
    },
    timeLeft() { const r = this.round; return r ? Math.max(0, r.dur - (this.clock.now() - r.t0)) : 0; },
    // the UI calls this regularly: ends the round when the time is up
    tick() {
      const r = this.round;
      if (r && !r.over && this.timeLeft() <= 0) return this.end();
      if (r && !r.over && r.stimEnd && r.pacts.includes('metronome') && this.clock.now() > r.stimEnd + PACT.metronome) this.answer(null, { late: true });
      return null;
    },
    api() {
      const r = this.round;
      return {
        answer: (x) => this.answer(x), replay: () => this.replay(), stop: () => AMB.audition && AMB.audition.stop(),
        play: (ev) => this.playEvents(ev), note: (ev) => this.note(ev),
        get t0() { return r ? r.t0Stim : 0; }, ch: r && r.ch, d: r && r.stair.d, rng: r && r.rng, kid: !!(r && r.kid),
        get transpose() { return r ? r.tr : 0; }, pacts: r ? r.pacts.slice() : [],
      };
    },
    // a stimulus: remembers when it really starts (api.t0)
    playEvents(ev) {
      const r = this.round, tr = r ? r.tr : 0;
      if (tr) ev = (ev || []).map((e) => (e.midi != null ? { ...e, midi: e.midi + tr } : e.hz != null ? { ...e, hz: e.hz * Math.pow(2, tr / 12) } : e));
      const res = AMB.audition ? AMB.audition.play(ev || []) : { dur: 0, at: 0, t0: 0 };
      if (r) {
        r.t0Stim = res.t0 || 0;
        const lead = res.t0 && window.performance ? Math.max(0, res.t0 - performance.now()) : 0;
        r.stimEnd = this.clock.now() + lead + (res.dur || 0) * 1000; // end of the stimulus (pacts « Avant la fin », « Métronome »)
      }
      return res;
    },
    // immediate feedback when the player answers (same bus, starts now, stimulus timing untouched)
    note(ev) {
      const Au = AMB.audition, ctx = AMB.engine && AMB.engine.ctx;
      if (!Au || !ev) return null;
      return Au.play([{ dur: 0.35, vel: 0.7, voice: 'triangle', ...ev, t: 0 }], ctx ? { when: ctx.currentTime + 0.005 } : {});
    },
    // play the current challenge's stimulus (no count); returns {dur, at, t0} or the plugin's Promise
    listen() {
      const r = this.round; if (!r || !r.ch) return null;
      if (AMB.audition) AMB.audition.stop();
      if (typeof r.game.play === 'function') return r.game.play(r.ch, this.api());
      if (typeof r.game.stimulus === 'function') return this.playEvents(r.game.stimulus(r.ch) || []);
      return null;
    },
    replay() {
      const r = this.round; if (!r || r.over || r.pacts.includes('une-ecoute')) return null;
      r.replays++; r.chReplays++;
      return this.listen();
    },
    // incoming MIDI while the cabinet is open (called by js/play.js): routed to the plugin (or to a prepare()), if it
    // listens. Payload {midi, vel (raw 0..1), time (performance.now ms), sustain (CC64 held), input (MIDI input name)}
    sustain: false,
    midiEv(note) { return { midi: note.midi, vel: note.vel, time: note.time != null ? note.time : this.clock.now(), sustain: this.sustain, input: note.input || null }; },
    midi(note) {
      const r = this.round;
      if (!r && this.prep && typeof this.prep.midi === 'function') { this.prep.midi(this.midiEv(note)); return true; }
      if (!r || r.over || !r.ch || typeof r.game.onMidi !== 'function') return false;
      r.game.onMidi(r.ch, this.midiEv(note), this.api());
      return true;
    },
    midiOff(note) {
      const r = this.round; if (!r || r.over || !r.ch || typeof r.game.onMidiOff !== 'function') return false;
      const ev = this.midiEv(note); delete ev.vel;
      r.game.onMidiOff(r.ch, ev, this.api());
      return true;
    },
    // a control change {cc, value (0..1), time, input}: CC64 (sustain pedal, >= 0.5 = held) is tracked in arcade.sustain,
    // rides along on every onMidi / onMidiOff, and every CC reaches the plugin's onCC(ch, {cc, value, time, sustain, input}, api)
    cc(m) {
      if (m.cc === 64) this.sustain = m.value >= 0.5;
      const r = this.round; if (!r || r.over || !r.ch || typeof r.game.onCC !== 'function') return false;
      r.game.onCC(r.ch, { cc: m.cc, value: m.value, time: m.time != null ? m.time : this.clock.now(), sustain: this.sustain, input: m.input || null }, this.api());
      return true;
    },
    choices() { const r = this.round; return r && r.ch && typeof r.game.choices === 'function' ? r.game.choices(r.ch) : null; },
    answer(x, opt) {
      const r = this.round; if (!r || r.over || !r.ch) return null;
      if (this.timeLeft() <= 0) { this.end(); return null; }
      const late = !!(opt && opt.late) || (r.pacts.includes('avant-fin') && r.stimEnd > 0 && this.clock.now() > r.stimEnd);
      const res = late ? { ok: false } : r.game.check(r.ch, x) || {}, ok = !!res.ok, clean = r.chReplays === 0;
      const C = this.combo();
      // the combo grows only on risky answers (no replay); a replayed right answer keeps it
      let mult = C.mult;
      if (ok && clean) mult = C.hit(); else if (!ok) mult = C.miss();
      const part = ok ? 1 : clamp(+res.partial || 0, 0, 1), bonus = clamp(+res.bonus || 0, 0, 1);
      let pts = 0;
      if (part + bonus > 0) {
        pts = (SCORE.base + SCORE.levelBonus * r.stair.d) * (part + SCORE.bonus * bonus);
        if (clean) pts *= 1 + SCORE.noReplay;
        pts = Math.round(pts * mult * r.pmult);
      }
      r.score += pts; if (ok) { r.good++; if (clean) r.clean++; }
      const dWas = r.stair.d, d = r.fixed ? dWas : this.stair(r.stair, ok);
      r.peak = Math.max(r.peak, d);
      r.history.push({ ok, pts, d: dWas, replays: r.chReplays });
      const reveal = typeof r.game.reveal === 'number' && r.game.reveal >= 0 ? Math.min(r.game.reveal, 5000) : REVEAL;
      const out = { ok, partial: res.partial, bonus, reveal, pts, d, combo: C.n, mult, clean, score: r.score, ch: r.ch, answer: x, late };
      emit('arcade:answer', out);
      if (!ok && r.pacts.includes('funambule')) { this.end({ fall: true }); return out; } // one slip ends the round
      if (r.count && r.history.length >= r.count) { this.end(); return out; }
      this.next();
      return out;
    },
    // expected score of a whole round at level d (the star thresholds scale with it)
    par(d, dur) { return Math.round(2400 * (0.5 + d) * ((dur || this.DURATION) / 75000)); },
    starsFor(score, d, dur) { const p = this.par(d, dur); return STARS.filter((k) => score >= k * p).length; },
    end(opts = {}) {
      const r = this.round; if (!r) return null;
      r.over = true;
      const g = r.game, abort = !!opts.abort, ghost = r.ghost;
      // a ghost round (daily challenge, duel) leaves the player's own stats alone
      const st = ghost ? { ...this.stats(g.id), best: { ...this.stats(g.id).best } } : this.stats(g.id);
      // the level always follows the staircase (it is the player's ear), even after an abort
      st.d = r.stair.d; st.step = r.stair.step; st.peak = Math.max(st.peak || 0, r.peak);
      const stars = abort || !isFinite(r.dur) ? 0 : this.starsFor(r.score, r.d0, r.dur);
      const pk = this.pactKey(r.pacts), prev = st.best[pk];
      const record = !abort && !ghost && !r.practice && r.score > 0 && (!prev || r.score > prev.score);
      if (!abort && !ghost && !r.practice) {
        st.plays++;
        if (record) st.best[pk] = { score: r.score, stars: Math.max(stars, prev ? prev.stars : 0), at: Date.now() };
        else if (prev && stars > prev.stars) prev.stars = stars;
      }
      if (!ghost) this.save();
      const out = { ghost, d0: r.d0, seed: r.seed, id: g.id, score: r.score, stars, record, abort, good: r.good, clean: r.clean, total: r.history.length, replays: r.replays, d: st.d, peak: st.peak, best: st.best[pk] || null, pacts: r.pacts, pmult: r.pmult, fall: !!opts.fall };
      this.round = null; this.active = false; this.last = out;
      if (AMB.audition) AMB.audition.session(false);
      emit('arcade:end', out);
      return out;
    },
  };

  AMB.arcade = arcade.load();
})();
