// Audition (G7.3): deterministic stimulus player for the ear-training mini-games.
// Fixed-parameter voices on the engine's audition bus (clean short room, no user FX), a local
// seeded PRNG (never replaces Math.random), and a "session" that ducks the ambience and freezes
// the Dérive / LFOs. Emits nothing on AMB.bus: visuals, contracts and discoveries stay asleep.
(function () {
  const AMB = (window.AMB = window.AMB || {});

  // mulberry32: returns a function -> [0, 1); same seed, same sequence
  function rng(seed) {
    let a = (seed >>> 0) || 0;
    const f = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (n) => Math.floor(f() * n);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    return f;
  }

  const hzOf = (ev) => (ev.hz || 440 * Math.pow(2, ((ev.midi == null ? 69 : ev.midi) - 69) / 12)) * Math.pow(2, (ev.cents || 0) / 1200);

  // Each voice builds its nodes into `dest` and returns {stopAt, nodes(sources), gain}
  const VOICES = {
    sine: (ctx, dest, hz, t, dur, vel) => simple(ctx, dest, 'sine', hz, t, dur, vel * 0.32),
    triangle: (ctx, dest, hz, t, dur, vel) => simple(ctx, dest, 'triangle', hz, t, dur, vel * 0.3),
    pluck(ctx, dest, hz, t, dur, vel) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
      f.frequency.setValueAtTime(Math.min(12000, hz * 8), t);
      f.frequency.exponentialRampToValueAtTime(Math.max(200, hz * 1.5), t + Math.min(0.6, dur));
      const a = ctx.createGain(); a.gain.value = 0;
      const pk = vel * 0.26, end = t + dur;
      a.gain.setValueAtTime(0, t);
      a.gain.linearRampToValueAtTime(pk, t + 0.004);
      a.gain.setTargetAtTime(pk * 0.05, t + 0.004, Math.max(0.08, dur * 0.35));
      a.gain.setTargetAtTime(0, end, 0.03);
      o.connect(f); f.connect(a); a.connect(dest);
      o.start(t); o.stop(end + 0.2);
      return { srcs: [o], gain: a, stopAt: end + 0.2 };
    },
    bell(ctx, dest, hz, t, dur, vel) {
      // harmonic partials (no inharmonicity: pitch stays unambiguous), higher ones decay faster
      const P = [[1, 1, 1], [2, 0.5, 0.6], [3, 0.28, 0.4], [4, 0.16, 0.3], [6, 0.08, 0.2]];
      const a = ctx.createGain(); a.gain.value = vel * 0.22;
      const srcs = [], end = t + dur;
      for (const [m, amp, dec] of P) {
        if (hz * m > ctx.sampleRate / 2 - 500) continue;
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz * m;
        const e = ctx.createGain(); e.gain.value = 0;
        e.gain.setValueAtTime(0, t);
        e.gain.linearRampToValueAtTime(amp, t + 0.003);
        e.gain.setTargetAtTime(0, t + 0.003, Math.max(0.05, dur * dec));
        e.gain.setTargetAtTime(0, end, 0.03);
        o.connect(e); e.connect(a);
        o.start(t); o.stop(end + 0.2);
        srcs.push(o);
      }
      a.connect(dest);
      return { srcs, gain: a, stopAt: end + 0.2 };
    },
  };

  function simple(ctx, dest, type, hz, t, dur, pk) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz;
    const a = ctx.createGain(); a.gain.value = 0;
    const end = t + dur, atk = Math.min(0.02, dur * 0.25);
    a.gain.setValueAtTime(0, t);
    a.gain.linearRampToValueAtTime(pk, t + atk);
    a.gain.setValueAtTime(pk, Math.max(t + atk, end - 0.04));
    a.gain.linearRampToValueAtTime(0, end);
    o.connect(a); a.connect(dest);
    o.start(t); o.stop(end + 0.05);
    return { srcs: [o], gain: a, stopAt: end + 0.05 };
  }

  const audition = {
    rng,
    VOICES,
    voices: [], // live voices (for stop())
    lastCount: 0,
    active: false,

    // events: [{t, midi | hz, dur, vel, cents?, voice}] -> {dur, at, t0}: total duration (s), start time on the
    // audio clock (ctx s) and the same instant in performance.now() ms (what MIDI / key timestamps are compared to).
    // opts.ctx / opts.dest let tests render into an OfflineAudioContext; opts.when = start (ctx s).
    play(events, opts = {}) {
      const eng = AMB.engine;
      const ctx = opts.ctx || (eng && eng.ctx);
      if (!ctx) return { dur: 0, at: 0, t0: 0 };
      const dest = opts.dest || (opts.ctx ? ctx.destination : eng.audIn);
      const when = opts.when != null ? opts.when : ctx.currentTime + 0.1;
      let total = 0, n = 0;
      for (const ev of events) {
        const dur = Math.max(0.03, ev.dur || 0.5), t0 = when + (ev.t || 0);
        const mk = VOICES[ev.voice] || VOICES.sine;
        const v = mk(ctx, dest, hzOf(ev), t0, dur, ev.vel == null ? 0.8 : ev.vel);
        v.ctx = ctx; n++;
        total = Math.max(total, (ev.t || 0) + dur);
        if (opts.ctx) continue; // offline render (tests): nothing to track
        this.voices.push(v);
        v.srcs[v.srcs.length - 1].onended = () => { const i = this.voices.indexOf(v); if (i >= 0) this.voices.splice(i, 1); };
      }
      this.lastCount = n;
      return { dur: total, at: when, t0: this.perfAt(ctx, when) };
    },
    // performance.now() ms of an audio-clock time (output timestamp when the browser gives one)
    perfAt(ctx, when) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      try {
        const ts = ctx.getOutputTimestamp && ctx.getOutputTimestamp();
        if (ts && ts.performanceTime > 0 && ts.contextTime > 0) return ts.performanceTime + (when - ts.contextTime) * 1000;
      } catch (e) { /* offline context */ }
      return now + (when - (ctx.currentTime || 0)) * 1000;
    },

    // Cut every scheduled / sounding voice with a 30 ms ramp
    stop() {
      for (const v of this.voices) {
        const t = v.ctx.currentTime;
        try {
          v.gain.gain.cancelScheduledValues(t);
          v.gain.gain.setValueAtTime(v.gain.gain.value, t);
          v.gain.gain.linearRampToValueAtTime(0, t + 0.03);
          v.srcs.forEach((s) => { try { s.stop(t + 0.04); } catch (e) { /* not started */ } });
        } catch (e) { /* already gone */ }
      }
      this.voices = [];
    },

    // A round: duck the ambience and freeze Dérive / LFOs (and undo both)
    session(on) {
      on = !!on;
      this.active = on;
      if (AMB.seq) AMB.seq.frozen = on;
      if (AMB.engine && AMB.engine.duck) AMB.engine.duck(on);
      if (!on) this.stop();
    },
  };

  AMB.audition = audition;
})();
