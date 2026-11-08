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
      const dens = store.get('bells.density');
      const strong = step % 4 === 0 ? 1.6 : step % 2 === 0 ? 0.9 : 0.45;
      const p = Math.pow(dens, 1.6) * 0.6 * strong;
      if (Math.random() < p) {
        const range = store.get('bells.range');
        const lo = 4 + Math.round(range * 6), hi = lo + 9;
        // random walk, biased to chord tones
        let step_ = pick([-2, -1, -1, 1, 1, 2, 3, -3, 0]);
        this.melodyDeg = clamp(this.melodyDeg + step_, lo, hi);
        let deg = this.melodyDeg;
        if (Math.random() < 0.55) {
          // snap to nearest chord tone
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
          deg = best;
        }
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

      // ---- evolve macro (every beat) ----
      if (step % 4 === 0) this.evolve();
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
