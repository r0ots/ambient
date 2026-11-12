// Generative sequencer: clock, chord progression, melody random walk, evolve macro
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const T = AMB.theory;
  const { rand, pick, clamp } = AMB.util;

  // tiny event bus
  AMB.bus = {
    fns: {},
    on(ev, fn) { (this.fns[ev] = this.fns[ev] || []).push(fn); },
    emit(ev, data) { (this.fns[ev] || []).forEach((f) => f(data)); },
  };

  class Sequencer {
    constructor() {
      this.playing = false;
      this.step = 0; // 16th steps
      this.nextTime = 0;
      this.lookahead = 0.25;
      this.chordDeg = 0;
      this.chord = [];
      this.melodyDeg = 7;
      this.homes = store.snapshot(); // evolve anchor values
      this.timer = null;
      store.on((key, v, source) => {
        if (source !== 'evolve' && source !== 'lfo') this.homes[key] = v;
        if (key === 'global.key' || key === 'global.scale') this.retune();
      });
    }

    get scale() { return T.SCALES[store.get('global.scale')]; }
    get root() { return T.NOTE_NAMES.indexOf(store.get('global.key')); }
    stepDur() { return 60 / store.get('global.tempo') / 4; }

    start() {
      const ctx = AMB.engine.ctx;
      if (this.playing) return;
      this.playing = true;
      this.step = 0;
      this.nextChordAt = null;
      this.origin = 0; // step where the current song section started (bars count from here)
      this.lockUntil = 0;
      this.nextTime = ctx.currentTime + 0.1;
      this.chordDeg = 0;
      this.timer = setInterval(() => this.tick(), 50);
      this.lfoTimer = setInterval(() => this.runLfos(), 100);
      this.tick();
    }
    stop() {
      this.playing = false;
      clearInterval(this.timer);
      clearInterval(this.lfoTimer);
    }

    tick() {
      const ctx = AMB.engine.ctx;
      // background tabs throttle timers to ~1/s: schedule further ahead so the music never gaps
      const ahead = document.hidden ? 1.6 : this.lookahead;
      const until = ctx.currentTime + ahead;
      while (this.nextTime < until) {
        this.onStep(this.step, this.nextTime);
        this.nextTime += this.stepDur();
        this.step++;
      }
      AMB.layers.grains.schedule(until);
    }

    // Voice-led chord: bass on the root (low), upper voices placed as close as possible
    // to the previous chord's upper voices, so progressions glide instead of jumping.
    chordMidis(deg) {
      const rich = store.get('pad.voicing');
      const size = 3 + Math.round(rich * 2);
      const degs = T.chordDegrees(deg, size, this.scale);
      const raw = degs.map((d) => T.degreeToMidi(d, this.root, this.scale, 3));
      let bass = raw[0];
      while (bass > 55) bass -= 12;
      while (bass < 43) bass += 12;
      const pcs = raw.slice(1).map((m) => ((m % 12) + 12) % 12);
      if (rich > 0.6) pcs.push(((raw[0] % 12) + 12) % 12); // doubled root on top for rich voicings
      const prev = this.lastUpper && this.lastUpper.length ? this.lastUpper : null;
      const center = prev ? prev.reduce((a, b) => a + b, 0) / prev.length : 62 + rich * 4;
      const lo = 52, hi = 81, upper = [];
      for (const pc of pcs) {
        const cands = [];
        for (let m = lo; m <= hi; m++) if (m % 12 === pc) cands.push(m);
        // prefer the candidate closest to a previous voice (common tones stay put), else to the center
        const target = (m) => prev ? Math.min(...prev.map((p) => Math.abs(p - m))) + 0.15 * Math.abs(m - center) : Math.abs(m - center);
        cands.sort((a, b) => target(a) - target(b));
        // avoid semitone/tone clusters inside the voicing
        const ok = cands.find((m) => upper.every((u) => Math.abs(u - m) > 2)) || cands[0];
        upper.push(ok);
      }
      upper.sort((a, b) => a - b);
      // keep the bass clear of the upper voices
      while (upper.length && upper[0] - bass < 5) bass -= 12;
      this.lastUpper = upper;
      return [bass, ...upper];
    }

    retune() {
      if (!this.playing) return;
      // re-voice current harmony to the new key/scale on next chord
      this.applyHarmony(AMB.engine.ctx.currentTime);
    }

    // Fixed progression as 0-based scale degrees, or null for the random walk
    progression() {
      const P = {
        'Plane (I)': [0], 'Pendule I–IV': [0, 3], 'I–V–vi–IV': [0, 4, 5, 3],
        'i–VI–III–VII': [0, 5, 2, 6], 'Montée I–ii–iii–IV': [0, 1, 2, 3],
      };
      const name = store.get('pad.prog');
      if (name === 'Perso') {
        const degs = this.customSteps().map((c) => c.deg);
        return degs.length ? degs : null;
      }
      return P[name] || null;
    }
    // "Perso" progression as [{deg, bars}] from pad.custom: "1 6:2 4 5:8" (bars optional, default pad.length)
    customSteps() {
      return String(store.get('pad.custom')).split(/[\s,;]+/).map((tok) => {
        const [d, b] = tok.split(':').map((x) => parseInt(x, 10));
        return d >= 1 && d <= 14 ? { deg: d - 1, bars: b >= 1 && b <= 16 ? b : null } : null;
      }).filter(Boolean);
    }
    // bars held by the chord at progression index i
    chordBars(i) {
      const def = store.get('pad.length');
      if (store.get('pad.prog') !== 'Perso') return def;
      const cs = this.customSteps();
      return (cs.length && cs[((i % cs.length) + cs.length) % cs.length].bars) || def;
    }

    // Player-forced chord (keyboard / MIDI): plays now and holds for one chord length
    forceChord(deg) {
      if (!this.playing) return;
      if (AMB.bus) AMB.bus.emit('act', 'chord');
      const ctx = AMB.engine.ctx, t = ctx.currentTime + 0.03;
      const barLen = store.get('pad.length');
      this.chordDeg = deg;
      const midis = this.applyHarmony(t);
      AMB.layers.pad.releaseAll(t);
      AMB.layers.pad.playChord(midis, t, this.stepDur() * 16 * barLen + 0.5);
      AMB.bus.emit('chord', { time: t, deg, midis });
      // hold until the next natural chord boundary after a full chord length
      const span = 16 * barLen;
      this.lockUntil = Math.ceil((this.step + span * 0.5) / span) * span;
      this.nextChordAt = this.lockUntil;
    }
    // Player note: scale degree (quantized) or raw midi
    playDegree(deg, vel = 0.85) {
      const midi = T.degreeToMidi(deg, this.root, this.scale, 4);
      this.playMidi(midi, vel);
    }
    // raw = MIDI velocity 0..1 as played (null from the computer keyboard), carried by the 'live' event
    playMidi(midi, vel = 0.85, raw = null) {
      if (!AMB.engine.ctx) return;
      if (AMB.bus) AMB.bus.emit('act', 'note');
      const L = AMB.layers;
      const wasOn = store.get('bells.on');
      // the melody voice is used as the instrument even if its generative part is muted
      if (!wasOn) { L.bells.ch.setLevel(Math.pow(store.get('bells.vol'), 1.6)); }
      const t = AMB.engine.ctx.currentTime + 0.01;
      // while the piano roll records, live notes are heard on the sequencer voice (what gets recorded)
      if (AMB.pianoRoll && AMB.pianoRoll.roll.recording) L.seq.note(midi, t, vel, true, this.stepDur() * 2);
      else L.bells.note(midi, t, vel, true);
      AMB.bus.emit('live', { midi, time: t, vel, raw });
    }

    applyHarmony(time) {
      const midis = this.chordMidis(this.chordDeg);
      this.chord = midis;
      const L = AMB.layers;
      const droneRoot = store.get('drone.follow')
        ? T.degreeToMidi(this.chordDeg, this.root, this.scale, 2)
        : 12 * 3 + this.root;
      L.drone.setRoot(droneRoot, time);
      L.grains.setHarmony(midis.map((m) => m + 12), 12 * 5 + this.root);
      return midis;
    }

    onStep(step, time) {
      const stepsPerBar = 16;
      const sd = this.stepDur();
      const L = AMB.layers;
      const barLen = store.get('pad.length');

      // song sections switch first, so this step's chord/motifs already use the new section
      if (AMB.song) AMB.song.onStep(step);

      // ---- chord changes ----
      const forced = this.forceChordChange; this.forceChordChange = false;
      // a chord lasts chordBars() bars (per-slot durations in the chord panel), counted from its own start
      const due = this.nextChordAt == null || step >= this.nextChordAt;
      if ((forced || due) && !(this.lockUntil > step)) {
        if (step > 0) {
          const seq = this.progression();
          if (seq) {
            this.progIdx = ((this.progIdx || 0) + 1) % seq.length;
            this.chordDeg = seq[this.progIdx];
          } else {
            const move = T.weightedPick(T.CHORD_MOVES, T.CHORD_WEIGHTS);
            // gravitate home so it never wanders too far
            this.chordDeg = clamp(this.chordDeg + move, -3, 6);
            if (Math.abs(this.chordDeg) > 4 && Math.random() < 0.5) this.chordDeg = 0;
          }
        } else {
          const seq = this.progression();
          this.progIdx = 0;
          if (seq) this.chordDeg = seq[0];
        }
        const bars = this.chordBars(this.progIdx || 0);
        this.chordStart = step;
        this.nextChordAt = step + stepsPerBar * bars;
        const midis = this.applyHarmony(time);
        const dur = sd * stepsPerBar * bars + 0.5;
        // floating time: chords arrive late and loosely, never exactly on the bar
        L.pad.playChord(midis, time + (this.floating ? rand(0, sd * 6) : 0), dur);
        AMB.bus.emit('chord', { time, deg: this.chordDeg, midis });
      }

      // ---- counter-melody: slow sustained inner voice moving by step between chord tones ----
      if (step % 8 === 4 && store.get('pad.on')) this.counterStep(time, sd);

      // ---- melody ----
      if (store.get('bells.mode') === 'Phrase') this.phraseStep(step, time, sd);
      else this.randomMelodyStep(step, time, sd);

      // ---- step sequencer / piano roll ----
      if (AMB.pianoRoll) AMB.pianoRoll.onStep(step, time, sd, this.chordDeg);
      if (AMB.pulses) AMB.pulses.onStep(step, time, sd);
      if (AMB.bassSeq) AMB.bassSeq.onStep(step, time, sd, this.chordDeg);
      if (AMB.automation) AMB.automation.onStep(step);

      // ---- evolve macro (every beat) ----
      if (step % 4 === 0) this.evolve();
    }

    get floating() { return store.get('global.time') === 'Flottant'; }
    // timing offset of a note: light swing when pulsed, wide free drift when floating
    offset(step, sd) {
      if (this.floating) return rand(0, sd * 3.5);
      return (step % 2 === 1 ? sd * store.get('global.swing') : 0) + rand(0, 0.015);
    }

    counterStep(time, sd) {
      const amt = store.get('pad.counter');
      if (amt <= 0.01 || Math.random() > amt * 0.45) return;
      const n = this.scale.length;
      const chordDegs = T.chordDegrees(this.chordDeg, 4, this.scale);
      // stay in the middle register, prefer the chord tone nearest to the previous counter note
      const prev = this.counterDeg !== undefined ? this.counterDeg : n + chordDegs[1];
      let best = prev, bd = 99;
      for (const cd of chordDegs) for (let o = 0; o <= 2; o++) {
        const c = cd + o * n, d = Math.abs(c - prev) + (c === prev ? 1.5 : 0); // avoid repeating
        if (d < bd && c >= n - 1 && c <= 2 * n + 2) { bd = d; best = c; }
      }
      this.counterDeg = best;
      const midi = T.degreeToMidi(best, this.root, this.scale, 3);
      const dur = sd * 16 * (1 + Math.random());
      const atk = 1.2 + store.get('pad.attack') * 3;
      AMB.layers.pad.voice(midi, time + (this.floating ? rand(0, sd * 4) : 0), dur, atk, atk * 1.5, 0.55);
    }

    melodyRange() {
      const range = store.get('bells.range');
      const lo = 4 + Math.round(range * 6);
      return [lo, lo + 9];
    }

    snapToChord(deg) {
      const chordDegs = T.chordDegrees(this.chordDeg, 4, this.scale);
      const n = this.scale.length;
      let best = deg, bd = 99;
      for (const cd of chordDegs) {
        for (let o = -3; o <= 3; o++) {
          const cand = cd + o * n;
          const dd = Math.abs(cand - deg);
          if (dd < bd) { bd = dd; best = cand; }
        }
      }
      return best;
    }

    randomMelodyStep(step, time, sd) {
      const L = AMB.layers;
      const dens = store.get('bells.density');
      const strong = this.floating ? 0.85 : step % 4 === 0 ? 1.6 : step % 2 === 0 ? 0.9 : 0.45;
      const p = Math.pow(dens, 1.6) * 0.6 * strong;
      if (Math.random() >= p) return;
      const [lo, hi] = this.melodyRange();
      // random walk, biased to chord tones
      this.melodyDeg = clamp(this.melodyDeg + pick([-2, -1, -1, 1, 1, 2, 3, -3, 0]), lo, hi);
      let deg = this.melodyDeg;
      if (Math.random() < 0.55) deg = this.snapToChord(deg);
      const midi = T.degreeToMidi(deg, this.root, this.scale, 3);
      const vel = rand(0.45, 1) * (step % 4 === 0 ? 1 : 0.8);
      const swing = this.offset(step, sd);
      L.bells.note(midi, time + swing, vel);
      // occasional answering note
      if (Math.random() < 0.15 * dens) {
        const m2 = T.degreeToMidi(deg + pick([2, 4, -3, 7]), this.root, this.scale, 3);
        L.bells.note(m2, time + sd * pick([2, 3, 6]), vel * 0.6);
      }
    }

    // ---- Phrase mode: a looping motif (relative to the chord) that mutates slowly ----
    newPhrase(len) {
      const dens = store.get('bells.density');
      const ph = new Array(len).fill(null);
      const [lo, hi] = this.melodyRange();
      let d = Math.round((lo + hi) / 2) - this.chordDeg;
      for (let i = 0; i < len; i++) {
        const strong = i % 4 === 0 ? 1.8 : i % 2 === 0 ? 0.8 : 0.3;
        if (Math.random() < Math.pow(dens, 1.2) * 0.45 * strong) {
          d += pick([-2, -1, 1, 2, 0, 3, -3]);
          ph[i] = { d, vel: rand(0.5, 1) * (i % 4 === 0 ? 1 : 0.8) };
        }
      }
      if (!ph.some(Boolean)) ph[0] = { d, vel: 0.9 };
      return ph;
    }
    mutatePhrase() {
      const m = store.get('bells.mutate');
      const ph = this.phrase;
      const dens = store.get('bells.density');
      for (let i = 0; i < ph.length; i++) {
        if (ph[i]) {
          if (Math.random() < m * 0.25) ph[i].d += pick([-2, -1, 1, 2]);
          else if (Math.random() < m * 0.12 * (1.2 - dens)) ph[i] = null;
        } else if (Math.random() < m * 0.06 * dens * (i % 2 ? 0.5 : 1.5)) {
          const prev = ph.slice(0, i).reverse().find(Boolean);
          ph[i] = { d: (prev ? prev.d : 7) + pick([-1, 1, 2, -2]), vel: rand(0.4, 0.9) };
        }
      }
      if (!ph.some(Boolean)) this.phrase = this.newPhrase(ph.length);
      this.phraseGen = (this.phraseGen || 0) + 1;
    }
    phraseStep(step, time, sd) {
      const len = 16 * parseInt(store.get('bells.phraseLen'), 10);
      if (!this.phrase || this.phrase.length !== len) this.phrase = this.newPhrase(len);
      const i = step % len;
      if (i === 0 && step > 0) this.mutatePhrase();
      const ev = this.phrase[i];
      if (!ev) return;
      const [lo, hi] = this.melodyRange();
      let deg = ev.d + this.chordDeg;
      const n = this.scale.length;
      while (deg > hi + 2) deg -= n;
      while (deg < lo - 2) deg += n;
      const midi = T.degreeToMidi(deg, this.root, this.scale, 3);
      const swing = this.offset(i, sd);
      AMB.layers.bells.note(midi, time + swing, ev.vel);
      AMB.bus.emit('phrase', { i, len, time });
    }

    // Slow LFOs (control rate, ~10 Hz) modulating around the user's value
    runLfos() {
      const t = performance.now() / 1000;
      this.lfoState = this.lfoState || {};
      for (const n of [1, 2]) {
        const target = store.get(`mod.l${n}target`);
        const st = (this.lfoState[n] = this.lfoState[n] || { phase: Math.random(), last: t, drift: 0, driftTarget: 0 });
        const dt = Math.min(0.5, t - st.last); st.last = t;
        if (st.target && st.target !== target && this.homes[st.target] !== undefined) {
          store.set(st.target, this.homes[st.target], 'lfo'); // release the old target
        }
        st.target = target;
        if (!target || target === '—' || AMB.isAutomated(target)) continue;
        const sp = store.spec(target); if (!sp) continue;
        st.phase = (st.phase + dt / AMB.periodSecs(store.get(`mod.l${n}rate`))) % 1;
        const shape = store.get(`mod.l${n}shape`);
        let y;
        if (shape === 'Triangle') y = 1 - 4 * Math.abs(st.phase - 0.5);
        else if (shape === 'Dérive') {
          if (st.phase < st.prevPhase) st.driftTarget = Math.random() * 2 - 1;
          st.drift += (st.driftTarget - st.drift) * Math.min(1, dt * 4 / AMB.periodSecs(store.get(`mod.l${n}rate`)));
          y = st.drift;
        } else y = Math.sin(2 * Math.PI * st.phase);
        st.prevPhase = st.phase;
        st.value = y;
        const home = this.homes[target] !== undefined ? this.homes[target] : store.get(target);
        const range = sp.max - sp.min;
        store.set(target, clamp(home + y * store.get(`mod.l${n}depth`) * range * 0.5, sp.min, sp.max), 'lfo');
      }
    }

    evolve() {
      const amt = store.get('global.evolve');
      if (amt <= 0) return;
      for (const [sec, s] of Object.entries(AMB.SCHEMA)) {
        for (const [k, sp] of Object.entries(s.params)) {
          if (!sp.evolve || AMB.isAutomated(`${sec}.${k}`)) continue;
          const key = `${sec}.${k}`;
          if (Math.random() > 0.35) continue;
          const home = this.homes[key] !== undefined ? this.homes[key] : store.get(key);
          const range = sp.max - sp.min;
          const v = store.get(key);
          // Ornstein–Uhlenbeck drift around the user's value
          const nv = v + 0.04 * (home - v) + (Math.random() - 0.5) * range * 0.05 * amt;
          const lim = range * 0.35 * amt;
          store.set(key, clamp(nv, Math.max(sp.min, home - lim), Math.min(sp.max, home + lim)), 'evolve');
        }
      }
    }
  }

  AMB.seq = new Sequencer();
})();
