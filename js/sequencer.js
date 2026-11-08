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
        if (source !== 'evolve') this.homes[key] = v;
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
      this.nextTime = ctx.currentTime + 0.1;
      this.chordDeg = 0;
      this.timer = setInterval(() => this.tick(), 50);
      this.tick();
    }
    stop() {
      this.playing = false;
      clearInterval(this.timer);
    }

    tick() {
      const ctx = AMB.engine.ctx;
      const until = ctx.currentTime + this.lookahead;
      while (this.nextTime < until) {
        this.onStep(this.step, this.nextTime);
        this.nextTime += this.stepDur();
        this.step++;
      }
      AMB.layers.grains.schedule(until);
    }

    chordMidis(deg) {
      const rich = store.get('pad.voicing');
      const size = 3 + Math.round(rich * 2);
      const degs = T.chordDegrees(deg, size, this.scale);
      // open voicing: spread the upper notes
      return degs.map((d, i) => T.degreeToMidi(d, this.root, this.scale, 3) + (i >= 3 ? 12 : 0) + (i === 1 && rich > 0.7 ? 12 : 0));
    }

    retune() {
      if (!this.playing) return;
      // re-voice current harmony to the new key/scale on next chord
      this.applyHarmony(AMB.engine.ctx.currentTime);
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

      // ---- chord changes ----
      if (step % (stepsPerBar * barLen) === 0) {
        if (step > 0) {
          const move = T.weightedPick(T.CHORD_MOVES, T.CHORD_WEIGHTS);
          // gravitate home so it never wanders too far
          this.chordDeg = clamp(this.chordDeg + move, -3, 6);
          if (Math.abs(this.chordDeg) > 4 && Math.random() < 0.5) this.chordDeg = 0;
        }
        const midis = this.applyHarmony(time);
        const dur = sd * stepsPerBar * barLen + 0.5;
        L.pad.playChord(midis, time, dur);
        AMB.bus.emit('chord', { time, deg: this.chordDeg, midis });
      }

      // ---- melody ----
      if (store.get('bells.mode') === 'Phrase') this.phraseStep(step, time, sd);
      else this.randomMelodyStep(step, time, sd);

      // ---- evolve macro (every beat) ----
      if (step % 4 === 0) this.evolve();
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
      const strong = step % 4 === 0 ? 1.6 : step % 2 === 0 ? 0.9 : 0.45;
      const p = Math.pow(dens, 1.6) * 0.6 * strong;
      if (Math.random() >= p) return;
      const [lo, hi] = this.melodyRange();
      // random walk, biased to chord tones
      this.melodyDeg = clamp(this.melodyDeg + pick([-2, -1, -1, 1, 1, 2, 3, -3, 0]), lo, hi);
      let deg = this.melodyDeg;
      if (Math.random() < 0.55) deg = this.snapToChord(deg);
      const midi = T.degreeToMidi(deg, this.root, this.scale, 3);
      const vel = rand(0.45, 1) * (step % 4 === 0 ? 1 : 0.8);
      const swing = (step % 2 === 1 ? sd * 0.12 : 0) + rand(0, 0.015);
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
      const swing = (i % 2 === 1 ? sd * 0.12 : 0) + rand(0, 0.01);
      AMB.layers.bells.note(midi, time + swing, ev.vel);
      AMB.bus.emit('phrase', { i, len, time });
    }

    evolve() {
      const amt = store.get('global.evolve');
      if (amt <= 0) return;
      for (const [sec, s] of Object.entries(AMB.SCHEMA)) {
        for (const [k, sp] of Object.entries(s.params)) {
          if (!sp.evolve) continue;
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
