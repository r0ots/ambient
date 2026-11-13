// Sound layers: Drone, Pad, Bells (melody), Grains, Texture
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const { mtof } = AMB.theory;
  const { rand, pick, clamp } = AMB.util;

  const P = (layer, k) => store.get(`${layer}.${k}`);

  // Shared Hann window curve for grains / soft envelopes
  const HANN = new Float32Array(128);
  for (let i = 0; i < HANN.length; i++) HANN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (HANN.length - 1));

  // ---- Dark bricks (v1.14): built only by the dark timbres (drone Abîmé, pad Cuivres / Cendre, melody Lame,
  // bass Saturée, kit Métal), so the other sounds never pass through them ----
  const CURVES = {};
  // distortion: tanh at drive k, normalised so full scale stays full scale
  function driveCurve(k) {
    const key = 'd' + k;
    if (!CURVES[key]) { const n = 1024, c = new Float32Array(n), m = Math.tanh(k); for (let i = 0; i < n; i++) c[i] = Math.tanh(k * ((i / (n - 1)) * 2 - 1)) / m; CURVES[key] = c; }
    return CURVES[key];
  }
  // bitcrusher (bit depth only: a staircase transfer curve; a sample-rate reduction would need a worklet)
  function crushCurve(bits) {
    const key = 'c' + bits;
    if (!CURVES[key]) { const n = 4096, c = new Float32Array(n), q = Math.pow(2, bits - 1); for (let i = 0; i < n; i++) c[i] = Math.round(((i / (n - 1)) * 2 - 1) * q) / q; CURVES[key] = c; }
    return CURVES[key];
  }
  function shaper(ctx, curve) { const w = ctx.createWaveShaper(); w.curve = curve; w.oversample = 'none'; return w; }
  // metallic partials (inharmonic square cluster, the classic cymbal recipe), scaled by a base frequency
  const METAL = [1, 1.4826, 1.8004, 2.546, 2.6303, 3.8968];

  class Layer {
    constructor(name) {
      this.name = name;
      this.engine = AMB.engine;
      this.ctx = this.engine.ctx;
      this.ch = this.engine.channel();
      this.out = this.ch.input;
      this.update();
      store.on((key) => { if (key.startsWith(name + '.')) this.onParam(key.split('.')[1]); });
    }
    get active() { return !!P(this.name, 'on'); }
    update() {
      const on = this.active;
      this.ch.setLevel(on ? Math.pow(P(this.name, 'vol'), 1.6) : 0);
      this.ch.setSend(P(this.name, 'send'));
    }
    onParam(k) { if (k === 'vol' || k === 'on' || k === 'send') this.update(); }
  }

  // ===================== DRONE =====================
  class Drone extends Layer {
    constructor() {
      super('drone');
      const ctx = this.ctx;
      this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.Q.value = 0.7;
      this.amp = ctx.createGain(); this.amp.gain.value = 1;
      this.pan = ctx.createStereoPanner();
      this.trim = ctx.createGain(); this.trim.gain.value = 0.2; // drone is spectrally dense: keep it under the mix
      this.filter.connect(this.trim); this.trim.connect(this.amp); this.amp.connect(this.pan); this.pan.connect(this.out);
      // slow LFOs
      this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 0.05;
      this.lfoAmt = ctx.createGain(); this.lfoAmt.gain.value = 0;
      this.lfo.connect(this.lfoAmt); this.lfoAmt.connect(this.filter.frequency);
      this.lfo2 = ctx.createOscillator(); this.lfo2.frequency.value = 0.031;
      this.panAmt = ctx.createGain(); this.panAmt.gain.value = 0;
      this.lfo2.connect(this.panAmt); this.panAmt.connect(this.pan.pan);
      this.tremAmt = ctx.createGain(); this.tremAmt.gain.value = 0;
      this.lfo2.connect(this.tremAmt); this.tremAmt.connect(this.amp.gain);
      this.lfo.start(); this.lfo2.start();
      this.root = 50;
      this.voices = null;
      this.build();
      this.setTone();
    }
    build() {
      const ctx = this.ctx, t = ctx.currentTime;
      if (this.voices) {
        const old = this.voices;
        old.bus.gain.setTargetAtTime(0, t, 0.6);
        setTimeout(() => old.oscs.forEach((o) => { try { o.osc.stop(); } catch (e) {} }), 4000);
      }
      const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(this.filter);
      bus.gain.setTargetAtTime(1, t, 0.8);
      const type = P('drone', 'wave');
      // [semitone offset, wave, gain, detune cents]
      const defs = {
        'Chaud': [[0, 'sawtooth', 0.22, -6], [0, 'sawtooth', 0.22, 7], [7, 'triangle', 0.18, 0], [-12, 'sine', 0.45, 0]],
        'Creux': [[0, 'square', 0.12, -4], [12, 'triangle', 0.2, 3], [7, 'square', 0.07, 0], [-12, 'triangle', 0.35, 0]],
        'Orgue': [[0, 'sine', 0.35, 0], [12, 'sine', 0.2, 1], [19, 'sine', 0.12, -1], [24, 'sine', 0.08, 2], [-12, 'sine', 0.25, 0]],
        'Sub': [[-12, 'sine', 0.6, 0], [0, 'sine', 0.3, 0], [7, 'triangle', 0.08, 4]],
        'Abîmé': [[0, 'sawtooth', 0.22, -11], [0, 'sawtooth', 0.22, 13], [-12, 'square', 0.3, 0], [7, 'sawtooth', 0.08, 6]],
      }[type] || [];
      let dirt = null;
      if (type === 'Abîmé') { // damaged drone: driven into a distortion, then crushed to a few bits
        bus.disconnect();
        const pre = ctx.createGain(), sat = shaper(ctx, driveCurve(3)), crush = shaper(ctx, crushCurve(5)), post = ctx.createGain();
        post.gain.value = 0.55;
        bus.connect(pre); pre.connect(sat); sat.connect(crush); crush.connect(post); post.connect(this.filter);
        dirt = { pre, post };
      }
      const oscs = defs.map(([semi, wave, gain, det]) => {
        const osc = ctx.createOscillator();
        osc.type = wave; osc.detune.value = det;
        osc.frequency.value = mtof(this.root + semi);
        const gn = ctx.createGain(); gn.gain.value = gain;
        osc.connect(gn); gn.connect(bus);
        osc.start();
        return { osc, semi };
      });
      this.voices = { bus, oscs, dirt };
      if (dirt) this.setTone();
    }
    setRoot(midi, time) {
      this.root = midi;
      if (!this.voices) return;
      for (const v of this.voices.oscs) v.osc.frequency.setTargetAtTime(mtof(midi + v.semi), time, 1.2);
    }
    setTone() {
      const t = this.ctx.currentTime;
      const tone = P('drone', 'tone'), motion = P('drone', 'motion');
      const base = 80 + tone * tone * 3500;
      this.filter.frequency.setTargetAtTime(base, t, 0.3);
      this.lfoAmt.gain.setTargetAtTime(base * 0.6 * motion, t, 0.3);
      this.lfo.frequency.setTargetAtTime(0.02 + motion * 0.15, t, 0.3);
      this.panAmt.gain.setTargetAtTime(motion * 0.5, t, 0.3);
      this.tremAmt.gain.setTargetAtTime(motion * 0.25, t, 0.3);
      // Abîmé: more light = more drive (a rising filter also roars)
      if (this.voices && this.voices.dirt) this.voices.dirt.pre.gain.setTargetAtTime(0.6 + tone * 5, t, 0.3);
    }
    onParam(k) {
      super.onParam(k);
      if (k === 'wave') this.build();
      if (k === 'tone' || k === 'motion') this.setTone();
    }
  }

  // ===================== PAD =====================
  class Pad extends Layer {
    constructor() {
      super('pad');
      this.bus = this.ctx.createGain(); this.bus.gain.value = 0.6;
      this.bus.connect(this.out);
      this.active_ = new Set();
    }
    playChord(midis, time, dur) {
      if (!this.active) return;
      const atk = 0.4 + Math.pow(P('pad', 'attack'), 1.5) * 7;
      const rel = 1.5 + P('pad', 'attack') * 6;
      const g = 1 / Math.sqrt(midis.length);
      midis.forEach((m, i) => this.voice(m, time + i * rand(0, 0.25) * P('pad', 'attack'), dur, atk, rel, g));
    }
    // fade out every sounding chord (used when the player forces a new chord)
    releaseAll(time, tc = 0.7) {
      for (const r of this.active_) {
        const g = r.env.gain;
        // hold the current (possibly mid-attack) level instead of jumping back to the ramp's start
        if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(time);
        else { g.cancelScheduledValues(time); g.setValueAtTime(g.value, time); }
        g.setTargetAtTime(0, time, tc);
      }
    }
    voice(midi, time, dur, atk, rel, gainMul) {
      const ctx = this.ctx;
      const type = P('pad', 'wave');
      const tone = P('pad', 'tone');
      const rich = P('pad', 'voicing');
      const f = mtof(midi);
      const env = ctx.createGain(); env.gain.value = 0;
      const pan = ctx.createStereoPanner(); pan.pan.value = rand(-0.6, 0.6);
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass';
      filt.Q.value = 0.8;
      const cutoff = clamp(f * (1.5 + tone * 10), 200, 14000);
      filt.frequency.setValueAtTime(cutoff * 0.4, time);
      filt.frequency.linearRampToValueAtTime(cutoff, time + atk);
      filt.frequency.setTargetAtTime(cutoff * 0.6, time + atk, dur * 0.5 + 0.1);
      filt.connect(env); env.connect(pan); pan.connect(this.bus);
      const oscs = [];
      const det = 4 + rich * 16;
      const add = (wave, mult, gain, detune) => {
        const o = ctx.createOscillator(); o.type = wave;
        o.frequency.value = f * mult; o.detune.value = detune;
        const gn = ctx.createGain(); gn.gain.value = gain;
        o.connect(gn); gn.connect(filt); oscs.push(o);
        return o;
      };
      let level = 0.28;
      if (type === 'Nappe') {
        add('sawtooth', 1, 0.5, -det); add('sawtooth', 1, 0.5, det); add('triangle', 0.5, 0.3, 0);
      } else if (type === 'Verre') {
        add('sine', 1, 0.7, 0); add('triangle', 2, 0.25, det * 0.3); add('sine', 3, 0.1 + tone * 0.15, -det * 0.3);
        filt.Q.value = 2; level = 0.26;
      } else if (type === 'Chœur') {
        // saw through formant bandpasses
        const src = ctx.createGain(); src.gain.value = 1;
        const vib = ctx.createOscillator(); vib.frequency.value = rand(4.5, 5.5);
        const vibAmt = ctx.createGain(); vibAmt.gain.value = 6;
        vib.connect(vibAmt); oscs.push(vib);
        [[-det, 0.5], [det, 0.5]].forEach(([d, gn]) => {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
          vibAmt.connect(o.detune);
          const og = ctx.createGain(); og.gain.value = gn; o.connect(og); og.connect(src); oscs.push(o);
        });
        const formants = [[700, 1, 6], [1150, 0.6, 7], [2600, 0.25 + tone * 0.3, 8]];
        formants.forEach(([ff, gn, q]) => {
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = q;
          const bg = ctx.createGain(); bg.gain.value = gn * 3;
          src.connect(bp); bp.connect(bg); bg.connect(filt);
        });
        level = 0.3;
      } else if (type === 'Onde') {
        // wavetable-ish: two random harmonic spectra, crossfaded slowly over the note
        const waves = this.tables || (this.tables = [0, 1, 2, 3].map((seed) => {
          const n = 24, re = new Float32Array(n), im = new Float32Array(n);
          for (let h = 1; h < n; h++) {
            const odd = seed % 2 ? (h % 2 ? 1 : 0.15) : 1;
            im[h] = (Math.random() * 0.8 + 0.2) * odd / Math.pow(h, 0.7 + seed * 0.25);
          }
          return ctx.createPeriodicWave(re, im);
        }));
        const wA = pick(waves), wB = pick(waves);
        const mk = (w, d) => { const o = ctx.createOscillator(); o.setPeriodicWave(w); o.frequency.value = f; o.detune.value = d; return o; };
        const oA = mk(wA, -det * 0.5), oB = mk(wB, det * 0.5);
        const gA = ctx.createGain(), gB = ctx.createGain();
        const morphT = Math.max(dur, 1);
        gA.gain.setValueAtTime(0.6, time); gA.gain.linearRampToValueAtTime(0.1, time + morphT);
        gB.gain.setValueAtTime(0.1, time); gB.gain.linearRampToValueAtTime(0.6, time + morphT);
        oA.connect(gA); oB.connect(gB); gA.connect(filt); gB.connect(filt);
        oscs.push(oA, oB);
        level = 0.36;
      } else if (type === 'FM') {
        // soft FM pad: slowly breathing modulation index
        const car = ctx.createOscillator(); car.frequency.value = f; car.detune.value = det * 0.3;
        const car2 = ctx.createOscillator(); car2.frequency.value = f; car2.detune.value = -det * 0.3;
        const mod = ctx.createOscillator(); mod.frequency.value = f * pick([1, 2, 0.5, 3]);
        const idx = ctx.createGain();
        const top = f * (0.3 + tone * 2.5);
        idx.gain.setValueAtTime(0, time);
        idx.gain.linearRampToValueAtTime(top, time + atk * 1.5);
        idx.gain.linearRampToValueAtTime(top * 0.3, time + Math.max(dur, atk * 2));
        mod.connect(idx); idx.connect(car.frequency); idx.connect(car2.frequency);
        const cg = ctx.createGain(); cg.gain.value = 0.5;
        car.connect(cg); car2.connect(cg); cg.connect(filt);
        oscs.push(car, car2, mod);
        filt.frequency.cancelScheduledValues(time); filt.frequency.setValueAtTime(12000, time);
        level = 0.26;
      } else if (type === 'Aube') { // secret timbre (G10.1): two sines and a fifth, slow swell
        add('sine', 1, 0.6, -det * 0.5); add('sine', 2, 0.28, det * 0.5); add('triangle', 1.5, 0.12, 0);
        filt.Q.value = 1.4; level = 0.3;
      } else if (type === 'Cuivres') { // detuned saw brass: the filter opens slowly over the attack, then sinks back
        add('sawtooth', 1, 0.45, -det * 1.3); add('sawtooth', 1, 0.45, det * 1.3); add('sawtooth', 0.5, 0.25, det * 0.4);
        filt.Q.value = 2.2;
        const open = Math.min(9000, cutoff * 1.3), rise = Math.max(0.5, atk * 1.4);
        filt.frequency.cancelScheduledValues(time);
        filt.frequency.setValueAtTime(Math.min(open, Math.max(90, f * 0.8)), time);
        filt.frequency.exponentialRampToValueAtTime(open, time + rise);
        filt.frequency.setTargetAtTime(cutoff * 0.45, time + rise, dur * 0.35 + 0.1);
        level = 0.16;
      } else if (type === 'Cendre') { // a pad that wears out: its pitch sags and it sinks into a bitcrusher over the note
        const mix = ctx.createGain(), clean = ctx.createGain(), dirty = ctx.createGain(), cr = shaper(ctx, crushCurve(4));
        const life = Math.max(dur, 1);
        [[1, 0.5, -det], [1, 0.5, det], [0.5, 0.35, 0]].forEach(([m, gn, d]) => {
          const o = ctx.createOscillator(); o.type = m === 1 ? 'sawtooth' : 'triangle'; o.frequency.value = f * m;
          o.detune.setValueAtTime(d, time); o.detune.linearRampToValueAtTime(d - 35, time + life * 1.2);
          const og = ctx.createGain(); og.gain.value = gn; o.connect(og); og.connect(mix); oscs.push(o);
        });
        clean.gain.setValueAtTime(1, time); clean.gain.linearRampToValueAtTime(0.25, time + life);
        dirty.gain.setValueAtTime(0, time); dirty.gain.linearRampToValueAtTime(0.9, time + life);
        mix.connect(clean); clean.connect(filt); mix.connect(cr); cr.connect(dirty); dirty.connect(filt);
        filt.frequency.setTargetAtTime(cutoff * 0.3, time + atk, life * 0.4);
        level = 0.17;
      } else { // Cordes
        add('sawtooth', 1, 0.4, -det); add('sawtooth', 1, 0.4, 0); add('sawtooth', 1, 0.4, det);
        const vib = ctx.createOscillator(); vib.frequency.value = rand(4.8, 5.8);
        const vibAmt = ctx.createGain(); vibAmt.gain.value = 0;
        vibAmt.gain.setValueAtTime(0, time); vibAmt.gain.linearRampToValueAtTime(8, time + atk + 1);
        vib.connect(vibAmt); oscs.forEach((o) => vibAmt.connect(o.detune)); oscs.push(vib);
        level = 0.15;
      }
      const peak = level * gainMul;
      const end = time + Math.max(dur, atk + 0.1);
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(peak, time + atk);
      env.gain.setValueAtTime(peak, end);
      env.gain.setTargetAtTime(0, end, rel / 4);
      const stopAt = end + rel * 1.5;
      oscs.forEach((o) => { o.start(time); o.stop(stopAt); });
      const rec = { env, stopAt };
      this.active_.add(rec);
      oscs[0].onended = () => { env.disconnect(); pan.disconnect(); this.active_.delete(rec); };
      AMB.bus.emit('note', { layer: 'pad', midi, time, vel: 0.6, dur: end - time });
    }
  }

  // ===================== BELLS (melody) =====================
  class Bells extends Layer {
    constructor(name = 'bells') {
      super(name);
      this.bus = this.ctx.createGain(); this.bus.gain.value = 0.6;
      this.bus.connect(this.out);
    }
    // len (seconds, optional): sustain length for held voices (« Doux »), used by the step sequencer.
    // live (a note played by the player, js/sequencer.js playMidi): {bright: MIDI velocity 0..1 (a lowpass opens with
    // it; such a note stays centred, no random pan), dest: node replacing the layer's bus (while stopped)}.
    note(midi, time, vel = 0.8, force = false, len = 0, live = null) {
      if (!this.active && !force) return;
      const ctx = this.ctx;
      const type = P(this.name, 'wave');
      const tone = P(this.name, 'tone');
      const decay = 0.6 + Math.pow(P(this.name, 'decay'), 1.4) * 7;
      const f = mtof(midi);
      const env = ctx.createGain(); env.gain.value = 0;
      const pan = ctx.createStereoPanner(); pan.pan.value = live && live.bright != null ? 0 : rand(-0.7, 0.7);
      let cutoff = 0;
      if (live && live.bright != null) { // soft = dark, hard = open: f × 1.5 at velocity 0 up to the whole spectrum
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
        cutoff = Math.min(18000, f * (1.5 + 40 * live.bright * live.bright));
        lp.frequency.value = cutoff;
        env.connect(lp); lp.connect(pan);
      } else env.connect(pan);
      pan.connect((live && live.dest) || this.bus);
      const nodes = [];
      const amp = 0.5 * vel * ({ 'Verre': 1.6, 'Pluck': 1.7 }[type] || 1);
      let dur = decay;
      const fm = (ratio, index, idxDecay, carrierType = 'sine') => {
        const car = ctx.createOscillator(); car.type = carrierType; car.frequency.value = f;
        const mod = ctx.createOscillator(); mod.frequency.value = f * ratio;
        const modGain = ctx.createGain();
        modGain.gain.setValueAtTime(f * index, time);
        modGain.gain.setTargetAtTime(f * index * 0.05, time, idxDecay);
        mod.connect(modGain); modGain.connect(car.frequency);
        car.connect(env); nodes.push(car, mod);
      };
      if (type === 'Cloche') {
        fm(3.5, 1 + tone * 5, decay * 0.25);
        const o = ctx.createOscillator(); o.frequency.value = f * 2.01; const og = ctx.createGain(); og.gain.value = 0.2;
        o.connect(og); og.connect(env); nodes.push(o);
      } else if (type === 'Kalimba') {
        fm(4.0, 0.5 + tone * 3, 0.05 + tone * 0.06);
        dur = decay * 0.55;
      } else if (type === 'Verre') {
        [[1, 1], [2.756, 0.35 * (0.3 + tone)], [5.404, 0.18 * tone], [8.933, 0.08 * tone]].forEach(([r, gn]) => {
          const o = ctx.createOscillator(); o.frequency.value = f * r;
          const og = ctx.createGain(); og.gain.setValueAtTime(gn, time); og.gain.setTargetAtTime(0, time, decay / (r * 1.5));
          o.connect(og); og.connect(env); nodes.push(o);
        });
      } else if (type === 'Givre') { // secret timbre (G10.1): frosty inharmonic partials, short and high
        [[1, 0.8], [3.01, 0.4], [4.17, 0.22 * (0.4 + tone)], [7.2, 0.12 * tone]].forEach(([r, gn]) => {
          const o = ctx.createOscillator(); o.frequency.value = f * r * (r === 1 ? 1 : 1 + (r % 1) * 0.004);
          const og = ctx.createGain(); og.gain.setValueAtTime(gn, time); og.gain.setTargetAtTime(0, time, decay / (r * 2.2));
          o.connect(og); og.connect(env); nodes.push(o);
        });
        dur = decay * 0.8;
      } else if (type === 'Doux') {
        // soft sustained voice: sine + octave triangle, held for `len` then released
        const o = ctx.createOscillator(); o.frequency.value = f;
        const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
        const g2 = ctx.createGain(); g2.gain.value = 0.15 + tone * 0.3;
        o.connect(env); o2.connect(g2); g2.connect(env); nodes.push(o, o2);
        const hold = Math.max(0.15, len || decay * 0.3);
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(amp * 0.7, time + 0.06);
        env.gain.setValueAtTime(amp * 0.7, time + hold);
        env.gain.setTargetAtTime(0, time + hold, 0.15 + decay * 0.08);
        const stopAt = time + hold + 1 + decay * 0.4;
        nodes.forEach((n) => { n.start(time); n.stop(stopAt); });
        nodes[0].onended = () => { env.disconnect(); pan.disconnect(); };
        AMB.bus.emit('note', { layer: this.name, midi, time, vel, dur: hold, live: !!live && !live.loop, loop: !!(live && live.loop) });
        // a held live note (play.js) ends on release: same release curve, from the release time
        return { cutoff, release(t) {
          if (t >= time + hold) return;
          const at = Math.max(t, time + 0.07), tau = 0.15 + decay * 0.08;
          env.gain.cancelScheduledValues(at); env.gain.setValueAtTime(amp * 0.7, at); env.gain.setTargetAtTime(0, at, tau);
          nodes.forEach((n) => { try { n.stop(at + 1 + decay * 0.4); } catch (e) {} });
        } };
      } else if (type === 'Lame') {
        // brass lead: detuned saws, a filter that opens slowly, and a glide (portamento) from the previous note
        const prev = this.lastLame, glide = prev && time - prev.t < 8 ? 0.16 + 0.2 * tone : 0;
        this.lastLame = { f, t: time };
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5;
        [[-9, 0.5, 'sawtooth', 1], [9, 0.5, 'sawtooth', 1], [0, 0.25, 'square', 0.5]].forEach(([d, gn, w, m]) => {
          const o = ctx.createOscillator(); o.type = w; o.detune.value = d;
          if (glide) { o.frequency.setValueAtTime(prev.f * m, time); o.frequency.exponentialRampToValueAtTime(f * m, time + glide); } else o.frequency.value = f * m;
          const og = ctx.createGain(); og.gain.value = gn; o.connect(og); og.connect(lp); nodes.push(o);
        });
        const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
        const va = ctx.createGain(); va.gain.setValueAtTime(0, time); va.gain.linearRampToValueAtTime(9, time + 1.2);
        vib.connect(va); nodes.forEach((o) => va.connect(o.detune)); nodes.push(vib);
        const hold = Math.max(0.3, len || decay * 0.45), top = f * (2 + tone * 7), peakAt = time + 0.25 + hold * 0.5;
        lp.frequency.setValueAtTime(f * 0.9, time); lp.frequency.exponentialRampToValueAtTime(top, peakAt);
        lp.frequency.setTargetAtTime(f * 1.2, peakAt, 0.4 + decay * 0.1);
        lp.connect(env);
        const a = amp * 0.42, tau = 0.25 + decay * 0.1;
        env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(a, time + 0.09);
        env.gain.setValueAtTime(a, time + hold); env.gain.setTargetAtTime(0, time + hold, tau);
        const stopAt = time + hold + tau * 6;
        nodes.forEach((n) => { n.start(time); n.stop(stopAt); });
        nodes[0].onended = () => { env.disconnect(); pan.disconnect(); };
        AMB.bus.emit('note', { layer: this.name, midi, time, vel, dur: hold, live: !!live && !live.loop, loop: !!(live && live.loop) });
        // a held live note (play.js) ends on release, like « Doux »
        return { cutoff, release(t) {
          if (t >= time + hold) return;
          const at = Math.max(t, time + 0.1);
          env.gain.cancelScheduledValues(at); env.gain.setValueAtTime(a, at); env.gain.setTargetAtTime(0, at, tau);
          nodes.forEach((n) => { try { n.stop(at + tau * 6); } catch (e) {} });
        } };
      } else { // Pluck: filtered saw with fast filter env
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
        lp.frequency.setValueAtTime(f * (2 + tone * 12), time);
        lp.frequency.setTargetAtTime(f * 1.1, time, 0.08 + tone * 0.15);
        o.connect(lp); lp.connect(env); nodes.push(o);
        dur = decay * 0.5;
      }
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(amp, time + 0.004);
      env.gain.setTargetAtTime(0, time + 0.004, dur / 4);
      const stopAt = time + dur * 1.3 + 0.1;
      nodes.forEach((n) => { n.start(time); n.stop(stopAt); });
      nodes[0].onended = () => { env.disconnect(); pan.disconnect(); };
      AMB.bus.emit('note', { layer: this.name, midi, time, vel, dur, live: !!live && !live.loop, loop: !!(live && live.loop) });
      return { cutoff };
    }
  }

  // Step-sequencer voice: same synth family as the melody, own channel and settings
  class SeqVoice extends Bells { constructor() { super('seq'); } }

  // ===================== BASS (step-sequenced, follows the chord root) =====================
  class Bass extends Layer {
    constructor() {
      super('bass');
      this.bus = this.ctx.createGain(); this.bus.gain.value = 0.12; // low end is dense: keep it under the pads
      this.bus.connect(this.out);
    }
    note(midi, time, len) {
      const ctx = this.ctx, type = P('bass', 'wave'), tone = P('bass', 'tone');
      const f = mtof(midi);
      const env = ctx.createGain(); env.gain.value = 0;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.8;
      lp.frequency.value = 120 + tone * 1400;
      lp.connect(env); env.connect(this.bus);
      const nodes = [];
      const osc = (wave, mult, gain) => { const o = ctx.createOscillator(); o.type = wave; o.frequency.value = f * mult; const g = ctx.createGain(); g.gain.value = gain; o.connect(g); g.connect(lp); nodes.push(o); };
      if (type === 'Sub') { osc('sine', 1, 1); osc('sine', 2, 0.15); }
      else if (type === 'Ronde') { osc('triangle', 1, 0.8); osc('sine', 1, 0.6); osc('sawtooth', 1, 0.08 + tone * 0.2); }
      else if (type === 'Saturée') { // pulsed sub driven into a distortion: the low end growls
        osc('sine', 1, 1); osc('sawtooth', 1, 0.35);
        const pre = ctx.createGain(); pre.gain.value = 1.5 + tone * 4;
        const sat = shaper(ctx, driveCurve(2.5)), post = ctx.createGain(); post.gain.value = 0.75;
        lp.disconnect(); lp.connect(pre); pre.connect(sat); sat.connect(post); post.connect(env);
      }
      else { osc('sawtooth', 1, 0.6); lp.frequency.setValueAtTime(200 + tone * 3000, time); lp.frequency.setTargetAtTime(150, time, 0.08); }
      const hold = Math.max(0.12, len * (0.3 + P('bass', 'decay') * 0.7));
      env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.55, time + 0.012);
      env.gain.setValueAtTime(0.55, time + hold); env.gain.setTargetAtTime(0, time + hold, 0.08);
      const stopAt = time + hold + 0.6;
      nodes.forEach((n) => { n.start(time); n.stop(stopAt); });
      nodes[0].onended = () => { env.disconnect(); lp.disconnect(); };
      AMB.bus.emit('note', { layer: 'bass', midi, time, vel: 0.8, dur: hold });
    }
  }

  // Organic kit: hand drum, rain stick, water drop, kalimba
  function hitOrganic(track, time, vel) {
    const ctx = this.ctx, tone = P('perc', 'tone');
    const env = ctx.createGain(); env.gain.value = 0;
    const pan = ctx.createStereoPanner(); env.connect(pan); pan.connect(this.bus);
    const nodes = []; let stopAt;
    if (track === 0) { // hand drum: two damped sines, skin-like
      [[1, 1], [1.6, 0.35]].forEach(([r, gn]) => {
        const o = ctx.createOscillator(); o.frequency.setValueAtTime((90 + tone * 50) * r, time);
        o.frequency.exponentialRampToValueAtTime((70 + tone * 40) * r, time + 0.25);
        const g = ctx.createGain(); g.gain.value = gn; o.connect(g); g.connect(env); nodes.push(o);
      });
      env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.8 * vel, time + 0.005);
      env.gain.setTargetAtTime(0, time + 0.006, 0.2); stopAt = time + 1.2;
    } else if (track === 1) { // rain stick: long low-passed noise with a slow swell
      const src = ctx.createBufferSource(); src.buffer = this.noise;
      const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 2500 + tone * 3000; lp.Q.value = 0.8;
      src.connect(lp); lp.connect(env); nodes.push(src);
      env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.18 * vel, time + 0.12);
      env.gain.setTargetAtTime(0, time + 0.15, 0.18); pan.pan.value = (Math.random() - 0.5) * 0.8; stopAt = time + 1;
    } else if (track === 2) { // water drop: fast upward sine chirp
      const o = ctx.createOscillator(); const f = 500 + tone * 900 + Math.random() * 300;
      o.frequency.setValueAtTime(f, time); o.frequency.exponentialRampToValueAtTime(f * 2.2, time + 0.06);
      o.connect(env); nodes.push(o);
      env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.35 * vel, time + 0.003);
      env.gain.setTargetAtTime(0, time + 0.004, 0.03); pan.pan.value = (Math.random() - 0.5) * 1.2; stopAt = time + 0.4;
    } else { // kalimba on a chord tone
      const chord = (AMB.seq && AMB.seq.chord && AMB.seq.chord.length) ? AMB.seq.chord : [62];
      const f = mtof(chord[Math.floor(Math.random() * chord.length)] + 12);
      const o = ctx.createOscillator(); o.frequency.value = f;
      const m = ctx.createOscillator(); m.frequency.value = f * 4;
      const mg = ctx.createGain(); mg.gain.setValueAtTime(f * (0.4 + tone), time); mg.gain.setTargetAtTime(0, time, 0.05);
      m.connect(mg); mg.connect(o.frequency); o.connect(env); nodes.push(o, m);
      env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.3 * vel, time + 0.003);
      env.gain.setTargetAtTime(0, time + 0.004, 0.25); pan.pan.value = 0.35; stopAt = time + 1.6;
    }
    nodes.forEach((n) => { n.start(time); n.stop(stopAt); });
    nodes[0].onended = () => { env.disconnect(); pan.disconnect(); };
    AMB.bus.emit('perc', { track, time, vel });
  }

  // Metal kit (dark landscapes): heavy impact, scrap metal, sheet-metal clank, iron bell
  function hitMetal(track, time, vel) {
    const ctx = this.ctx, tone = P('perc', 'tone');
    const env = ctx.createGain(); env.gain.value = 0;
    const pan = ctx.createStereoPanner(); env.connect(pan); pan.connect(this.bus);
    const nodes = []; let stopAt;
    const metal = (base, dest) => METAL.forEach((r) => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = base * r; o.connect(dest); nodes.push(o); });
    if (track === 0) { // impact: a falling sub boom and a driven noise burst
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(70 + tone * 30, time); o.frequency.exponentialRampToValueAtTime(30, time + 0.5);
      const og = ctx.createGain(); og.gain.value = 1; o.connect(og); og.connect(env); nodes.push(o);
      const n = ctx.createBufferSource(); n.buffer = this.noise;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500 + tone * 1500;
      const pre = ctx.createGain(); pre.gain.setValueAtTime(3, time); pre.gain.setTargetAtTime(0, time, 0.08);
      const sat = shaper(ctx, driveCurve(4)); n.connect(lp); lp.connect(pre); pre.connect(sat); sat.connect(og); nodes.push(n);
      env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(1.1 * vel, time + 0.004);
      env.gain.setTargetAtTime(0, time + 0.01, 0.35); stopAt = time + 2.2;
    } else if (track === 1) { // scrap metal: a short bright square cluster
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000 + tone * 3000;
      const mix = ctx.createGain(); mix.gain.value = 0.6; metal(300 + tone * 120, mix); mix.connect(hp); hp.connect(env);
      env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.35 * vel, time + 0.002);
      env.gain.setTargetAtTime(0, time + 0.003, 0.035 + Math.random() * 0.04); pan.pan.value = (Math.random() - 0.5) * 0.9; stopAt = time + 0.4;
    } else if (track === 2) { // sheet-metal clank: lower cluster through a resonant band, driven
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + tone * 1800; bp.Q.value = 3;
      const mix = ctx.createGain(); mix.gain.value = 0.5; metal(140 + Math.random() * 40, mix);
      const sat = shaper(ctx, driveCurve(3)); mix.connect(bp); bp.connect(sat); sat.connect(env);
      env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.3 * vel, time + 0.002);
      env.gain.setTargetAtTime(0, time + 0.003, 0.12); pan.pan.value = (Math.random() - 0.5) * 1.2; stopAt = time + 0.9;
    } else { // iron bell: inharmonic sines on a chord tone, long ring with slow beating
      const chord = (AMB.seq && AMB.seq.chord && AMB.seq.chord.length) ? AMB.seq.chord : [62];
      const f = mtof(chord[Math.floor(Math.random() * chord.length)] + 12);
      [[1, 1, 9], [2.32, 0.5, 5], [4.25, 0.32, 3], [6.63, 0.2, 1.6], [9.38, 0.12, 0.9]].forEach(([r, gn, d]) => {
        const o = ctx.createOscillator(); o.frequency.value = f * r * (1 + (r - 1) * 0.0015);
        const og = ctx.createGain(); og.gain.setValueAtTime(gn * (r > 2 ? 0.5 + tone : 1), time); og.gain.setTargetAtTime(0, time, d * 0.35);
        o.connect(og); og.connect(env); nodes.push(o);
      });
      env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.16 * vel, time + 0.003);
      env.gain.setTargetAtTime(0, time + 0.004, 2.5); pan.pan.value = (Math.random() - 0.5) * 1.2; stopAt = time + 9;
    }
    nodes.forEach((n) => { n.start(time); n.stop(stopAt); });
    nodes[0].onended = () => { env.disconnect(); pan.disconnect(); };
    AMB.bus.emit('perc', { track, time, vel });
  }

  // ===================== PULSATIONS (soft percussion) =====================
  class Perc extends Layer {
    constructor() {
      super('perc');
      this.bus = this.ctx.createGain(); this.bus.gain.value = 0.38; // percussion is peaky: keep it under the textures
      this.bus.connect(this.out);
      this.noise = AMB.makeNoiseBuffer(this.ctx, 1, 'white', 1);
    }
    // track: 0 kick feutré, 1 shaker, 2 bois, 3 clochette
    hit(track, time, vel = 0.8) {
      if (P('perc', 'kit') === 'Organique') return this.hitOrganic(track, time, vel);
      if (P('perc', 'kit') === 'Métal') return this.hitMetal(track, time, vel);
      const ctx = this.ctx, tone = P('perc', 'tone');
      const env = ctx.createGain(); env.gain.value = 0;
      const pan = ctx.createStereoPanner();
      env.connect(pan); pan.connect(this.bus);
      let src, stopAt;
      if (track === 0) { // felt kick: sine with a short pitch drop, very round
        src = ctx.createOscillator(); src.frequency.setValueAtTime(110 + tone * 40, time);
        src.frequency.exponentialRampToValueAtTime(42, time + 0.18);
        env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.9 * vel, time + 0.008);
        env.gain.setTargetAtTime(0, time + 0.01, 0.12);
        src.connect(env); stopAt = time + 0.8;
      } else if (track === 1) { // shaker: band-passed noise burst
        src = ctx.createBufferSource(); src.buffer = this.noise;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 5000 + tone * 4000; bp.Q.value = 1.2;
        env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.35 * vel, time + 0.012);
        env.gain.setTargetAtTime(0, time + 0.015, 0.03);
        pan.pan.value = (Math.random() - 0.5) * 0.6;
        src.connect(bp); bp.connect(env); stopAt = time + 0.3;
      } else if (track === 2) { // wood: resonant click
        src = ctx.createOscillator(); src.type = 'triangle'; src.frequency.value = 600 + tone * 500;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + tone * 900; bp.Q.value = 6;
        env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.5 * vel, time + 0.002);
        env.gain.setTargetAtTime(0, time + 0.003, 0.025);
        pan.pan.value = -0.3;
        src.connect(bp); bp.connect(env); stopAt = time + 0.25;
      } else { // little bell: high FM ping on a chord tone
        const chord = (AMB.seq && AMB.seq.chord && AMB.seq.chord.length) ? AMB.seq.chord : [62];
        const m = chord[Math.floor(Math.random() * chord.length)] + 24;
        const f = AMB.theory.mtof(m);
        src = ctx.createOscillator(); src.frequency.value = f;
        const mod = ctx.createOscillator(); mod.frequency.value = f * 3.5;
        const mg = ctx.createGain(); mg.gain.setValueAtTime(f * (0.5 + tone), time); mg.gain.setTargetAtTime(0, time, 0.08);
        mod.connect(mg); mg.connect(src.frequency); mod.start(time); mod.stop(time + 1.5);
        env.gain.setValueAtTime(0, time); env.gain.linearRampToValueAtTime(0.18 * vel, time + 0.003);
        env.gain.setTargetAtTime(0, time + 0.004, 0.3);
        pan.pan.value = 0.4;
        src.connect(env); stopAt = time + 1.5;
      }
      src.start(time); src.stop(stopAt);
      src.onended = () => { env.disconnect(); pan.disconnect(); };
      AMB.bus.emit('perc', { track, time, vel });
    }
  }

  // ===================== GRAINS =====================
  // (Perc organic kit is attached below to keep the class definition readable)
  class Grains extends Layer {
    constructor() {
      super('grains');
      this.bus = this.ctx.createGain(); this.bus.gain.value = 0.7;
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120;
      this.bus.connect(hp); hp.connect(this.out);
      this.synthBuf = this.makeSynthBuffer();
      this.sampleBuf = null;
      this.sampleName = '';
      this.next = 0;
      this.pitches = [62];
      this.root = 62;
    }
    // A rich harmonic tone at C4 whose timbre morphs over its length; "scan" picks the timbre.
    makeSynthBuffer() {
      const ctx = this.ctx, sr = ctx.sampleRate, secs = 8;
      const len = sr * secs, buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      const f0 = 440 * Math.pow(2, -9 / 12); // C4 at A=440, tuning is applied at playback
      const parts = 16;
      const phases = Array.from({ length: parts }, () => Math.random() * Math.PI * 2);
      const det = Array.from({ length: parts }, () => 1 + (Math.random() - 0.5) * 0.004);
      let noise = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, x = i / len;
        let s = 0;
        for (let p = 1; p <= parts; p++) {
          // spectral envelope moves with x: from dark/sine-ish to bright/hollow to airy
          const bright = 0.25 + x * 2.2;
          let a = Math.exp(-(p - 1) / (bright * 3)) / p;
          if (x > 0.5 && p % 2 === 0) a *= 1 - (x - 0.5) * 1.6; // hollow (odd partials) in the 2nd half
          a *= 1 + 0.3 * Math.sin(t * (0.7 + p * 0.13) + phases[p - 1]);
          s += a * Math.sin(2 * Math.PI * f0 * p * det[p - 1] * t + phases[p - 1]);
        }
        noise = noise * 0.97 + (Math.random() * 2 - 1) * 0.03;
        d[i] = s * 0.5 + noise * (0.1 + x * 0.6);
      }
      // normalize
      let max = 0; for (let i = 0; i < len; i++) max = Math.max(max, Math.abs(d[i]));
      for (let i = 0; i < len; i++) d[i] /= max;
      return buf;
    }
    async loadFile(file) {
      const arr = await file.arrayBuffer();
      const buf = await this.ctx.decodeAudioData(arr);
      this.sampleBuf = buf;
      this.sampleName = file.name;
      store.set('grains.source', 'Échantillon', 'user');
    }
    setSampleBuffer(buf, name) {
      this.sampleBuf = buf; this.sampleName = name;
      store.set('grains.source', 'Échantillon', 'user');
    }
    // reversed copy of a buffer, cached
    reversedOf(buf) {
      this._rev = this._rev || new WeakMap();
      let rb = this._rev.get(buf);
      if (!rb) {
        rb = this.ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
        for (let c = 0; c < buf.numberOfChannels; c++) {
          const src = buf.getChannelData(c), dst = rb.getChannelData(c), n = src.length;
          for (let i = 0; i < n; i++) dst[i] = src[n - 1 - i];
        }
        this._rev.set(buf, rb);
      }
      return rb;
    }
    // Freeze: resample the last seconds of the whole mix and turn it into a grain cloud
    freeze(secs = 4) {
      const { buffer, peak } = this.engine.snapshot(secs);
      if (peak < 1e-4) return false;
      this.freezeBuf = buffer;
      store.set('grains.source', 'Gel', 'user');
      store.set('grains.on', true, 'user');
      // a frozen cloud wants long, overlapping grains to sustain like a held chord
      if (P('grains', 'size') < 0.7) store.set('grains.size', 0.7, 'user');
      if (P('grains', 'density') < 0.5) store.set('grains.density', 0.5, 'user');
      if (P('grains', 'vol') < 0.45) store.set('grains.vol', 0.45, 'user');
      AMB.bus.emit('freeze', {});
      return true;
    }
    setHarmony(chordMidis, root) { this.pitches = chordMidis; this.root = root; }
    schedule(until) {
      if (!this.active || P('grains', 'vol') < 0.01) { this.next = until; return; }
      const ctx = this.ctx;
      if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.01;
      const dens = P('grains', 'density');
      const rate = 1.5 + Math.pow(dens, 1.7) * 38; // grains / sec
      const size = 0.04 + Math.pow(P('grains', 'size'), 1.6) * 0.9;
      const overlap = Math.max(1, size * rate);
      const gain = 0.5 / Math.sqrt(overlap);
      const srcMode = P('grains', 'source');
      const ext = srcMode === 'Échantillon' ? this.sampleBuf : srcMode === 'Gel' ? this.freezeBuf : null;
      const useSample = !!ext;
      const buf = ext || this.synthBuf;
      const spray = P('grains', 'spray');
      const revProb = P('grains', 'reverse');
      const glide = P('grains', 'glide');
      const mode = P('grains', 'pitch');
      let n = 0;
      while (this.next < until && n++ < 160) {
        const t = this.next;
        this.next += (1 / rate) * rand(0.6, 1.4);
        const src = ctx.createBufferSource();
        const reversed = Math.random() < revProb;
        src.buffer = reversed ? this.reversedOf(buf) : buf;
        // pitch
        let target;
        if (mode === 'Accord') target = pick(this.pitches) + pick([0, 0, 12, -12]);
        else if (mode === 'Octaves') target = this.root + pick([0, 12, 24, -12, 7 + 12]);
        else target = this.root + Math.round(rand(-12, 24));
        // synth buffer is pitched at C4; a user sample is treated as being in the current key
        const base = useSample ? this.root : 60;
        const r = Math.pow(2, (target - base) / 12) * (useSample ? 1 : AMB.theory.A4 / 440);
        const rate0 = clamp(r * (1 + (Math.random() - 0.5) * 0.004 * spray), 0.0625, 8);
        const dur = size * rand(0.8, 1.2);
        if (glide > 0.01) {
          // pitch glide into the target note (or away from it), Evoke-style
          const semis = glide * 12 * (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 1);
          const from = clamp(rate0 * Math.pow(2, semis / 12), 0.0625, 8);
          src.playbackRate.setValueAtTime(from, t);
          src.playbackRate.exponentialRampToValueAtTime(rate0, t + dur * 0.9);
        } else src.playbackRate.value = rate0;
        const bufDur = buf.duration;
        const span = Math.max(0, bufDur - dur * r - 0.01);
        let pos = P('grains', 'scan') * span + (Math.random() - 0.5) * spray * span * 0.5;
        pos = clamp(pos, 0, span);
        if (reversed) pos = Math.max(0, bufDur - pos - dur * r - 0.01); // same region, played backwards
        const env = ctx.createGain(); env.gain.value = 0;
        const pan = ctx.createStereoPanner(); pan.pan.value = (Math.random() * 2 - 1) * (0.2 + spray * 0.8);
        src.connect(env); env.connect(pan); pan.connect(this.bus);
        const curve = new Float32Array(HANN.length);
        const vel = gain * rand(0.6, 1);
        for (let i = 0; i < curve.length; i++) curve[i] = HANN[i] * vel;
        env.gain.setValueCurveAtTime(curve, t, dur);
        src.start(t, pos, dur * r + 0.02);
        src.onended = () => { env.disconnect(); pan.disconnect(); };
        if (Math.random() < 0.08) AMB.bus.emit('grain', { layer: 'grains', midi: target, time: t, vel });
      }
    }
  }

  // ===================== TEXTURE =====================
  class Texture extends Layer {
    constructor() {
      super('texture');
      const ctx = this.ctx;
      this.cache = {};
      this.filter = ctx.createBiquadFilter();
      this.amp = ctx.createGain(); this.amp.gain.value = 0.7;
      this.pan = ctx.createStereoPanner();
      this.filter.connect(this.amp); this.amp.connect(this.pan); this.pan.connect(this.out);
      this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 0.08;
      this.lfoF = ctx.createGain(); this.lfoA = ctx.createGain(); this.lfoP = ctx.createGain();
      this.lfo.connect(this.lfoF); this.lfoF.connect(this.filter.frequency);
      this.lfo.connect(this.lfoA); this.lfoA.connect(this.amp.gain);
      this.lfo.connect(this.lfoP); this.lfoP.connect(this.pan.pan);
      this.lfo.start();
      this.src = null;
      this.build();
    }
    buffer(type) {
      if (this.cache[type]) return this.cache[type];
      const ctx = this.ctx, sr = ctx.sampleRate;
      const secs = type === 'Océan' ? 16 : type === 'Oiseaux' || type === 'Ville' ? 24 : 10;
      const len = sr * secs;
      let buf;
      if (type === 'Vent' || type === 'Océan' || type === 'Ville') buf = AMB.makeNoiseBuffer(ctx, secs, type === 'Vent' ? 'pink' : 'brown');
      else buf = AMB.makeNoiseBuffer(ctx, secs, type === 'Feu' ? 'brown' : 'pink');
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        if (type === 'Pluie') {
          for (let i = 0; i < len; i++) d[i] *= 0.35;
          const drops = secs * 260;
          for (let k = 0; k < drops; k++) {
            const at = Math.floor(Math.random() * (len - 2000));
            const fr = rand(1800, 6500), a = Math.pow(Math.random(), 3) * 0.6;
            const dl = Math.floor(sr * rand(0.004, 0.02));
            for (let i = 0; i < dl; i++) d[at + i] += a * Math.sin((2 * Math.PI * fr * i) / sr) * Math.exp(-i / (dl * 0.25));
          }
        } else if (type === 'Océan') {
          // waves: slow swells, two per buffer, with a hissy crest
          for (let i = 0; i < len; i++) {
            const x = i / len;
            const sw = Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * 2 * x + c * 0.6), 2.2);
            d[i] *= 0.15 + sw * 0.9;
          }
        } else if (type === 'Vinyle') {
          for (let i = 0; i < len; i++) d[i] *= 0.04;
          const pops = secs * 40;
          for (let k = 0; k < pops; k++) {
            const at = Math.floor(Math.random() * (len - 200));
            const a = Math.pow(Math.random(), 4) * 0.9 * (Math.random() < 0.5 ? -1 : 1);
            const dl = Math.floor(rand(5, 60));
            for (let i = 0; i < dl; i++) d[at + i] += a * Math.exp(-i / (dl * 0.2)) * (Math.random() * 0.6 + 0.4);
          }
        } else if (type === 'Ruisseau') {
          for (let i = 0; i < len; i++) d[i] *= 0.12;
          const bubbles = secs * 120;
          for (let k = 0; k < bubbles; k++) {
            const at = Math.floor(Math.random() * (len - 4000));
            let fr = rand(400, 1800); const a = Math.pow(Math.random(), 2) * 0.25;
            const dl = Math.floor(sr * rand(0.01, 0.05));
            let ph = 0;
            for (let i = 0; i < dl; i++) {
              fr *= 1.0002; ph += (2 * Math.PI * fr) / sr;
              d[at + i] += a * Math.sin(ph) * Math.sin((Math.PI * i) / dl);
            }
          }
        } else if (type === 'Oiseaux') {
          for (let i = 0; i < len; i++) d[i] *= 0.025; // leaves
          const calls = Math.floor(secs * 0.7);
          for (let k = 0; k < calls; k++) {
            let at = Math.floor(Math.random() * (len - sr * 2));
            const f0 = rand(2200, 5200), chirps = Math.floor(rand(2, 7));
            const shape = pick(['up', 'down', 'trill']);
            const amp = rand(0.08, 0.3) * (c === (k % 2) ? 1 : 0.35); // birds sit left or right
            for (let q = 0; q < chirps; q++) {
              const dl = Math.floor(sr * rand(0.05, 0.14));
              let ph = 0;
              for (let i = 0; i < dl; i++) {
                const x = i / dl;
                const fr = shape === 'up' ? f0 * (0.8 + 0.5 * x) : shape === 'down' ? f0 * (1.3 - 0.5 * x) : f0 * (1 + 0.08 * Math.sin(2 * Math.PI * 30 * i / sr));
                ph += (2 * Math.PI * fr) / sr;
                d[at + i] += amp * Math.sin(ph) * Math.sin(Math.PI * x);
              }
              at += dl + Math.floor(sr * rand(0.03, 0.12));
            }
          }
        } else if (type === 'Ville') {
          // distant traffic: brown rumble with slow swells of passing cars + faint mains hum
          const passes = Array.from({ length: 5 }, () => [Math.random(), rand(0.02, 0.06), rand(0.4, 1)]);
          for (let i = 0; i < len; i++) {
            const x = i / len;
            let sw = 0.35;
            for (const [cx, w, a] of passes) { const dx = Math.min(Math.abs(x - cx), 1 - Math.abs(x - cx)); sw += a * Math.exp(-(dx * dx) / (2 * w * w)); }
            d[i] = d[i] * 0.6 * sw + 0.01 * Math.sin((2 * Math.PI * 100 * i) / sr);
          }
        } else if (type === 'Feu') {
          for (let i = 0; i < len; i++) d[i] *= 0.5;
          const cr = secs * 70;
          for (let k = 0; k < cr; k++) {
            const at = Math.floor(Math.random() * (len - 800));
            const a = Math.pow(Math.random(), 3) * 0.8;
            const dl = Math.floor(rand(20, 400));
            for (let i = 0; i < dl; i++) d[at + i] += a * (Math.random() * 2 - 1) * Math.exp(-i / (dl * 0.15));
          }
        }
        // crossfade loop ends to avoid a click
        const xf = Math.floor(sr * 0.25);
        for (let i = 0; i < xf; i++) {
          const w = i / xf;
          d[i] = d[i] * w + d[len - xf + i] * (1 - w);
        }
      }
      return (this.cache[type] = buf);
    }
    build() {
      const ctx = this.ctx, t = ctx.currentTime;
      const type = P('texture', 'type');
      if (this.src) {
        const old = this.src, og = this.srcGain;
        og.gain.setTargetAtTime(0, t, 0.5);
        setTimeout(() => { try { old.stop(); } catch (e) {} og.disconnect(); }, 3000);
      }
      const src = ctx.createBufferSource();
      src.buffer = this.buffer(type);
      src.loop = true;
      const sg = ctx.createGain(); sg.gain.value = 0; sg.gain.setTargetAtTime(1, t, 0.8);
      src.connect(sg); sg.connect(this.filter);
      src.start(t, Math.random() * src.buffer.duration * 0.8);
      this.src = src; this.srcGain = sg;
      this.setTone();
    }
    setTone() {
      const t = this.ctx.currentTime;
      const type = P('texture', 'type');
      const tone = P('texture', 'tone'), motion = P('texture', 'motion');
      const cfg = {
        'Pluie': ['lowpass', 1500 + tone * 9000, 0.5, 0.25],
        'Vent': ['bandpass', 250 + tone * 1600, 2.5, 0.7],
        'Océan': ['lowpass', 300 + tone * 3000, 0.7, 0.2],
        'Vinyle': ['bandpass', 1000 + tone * 4000, 0.4, 0.05],
        'Ruisseau': ['bandpass', 500 + tone * 2500, 0.8, 0.3],
        'Feu': ['lowpass', 600 + tone * 6000, 0.6, 0.2],
        'Oiseaux': ['highpass', 300 + tone * 1500, 0.5, 0.1],
        'Ville': ['lowpass', 300 + tone * 2500, 0.6, 0.3],
      }[type];
      const [ftype, freq, q, fmod] = cfg;
      this.filter.type = ftype;
      this.filter.frequency.setTargetAtTime(freq, t, 0.3);
      this.filter.Q.setTargetAtTime(q, t, 0.3);
      this.lfo.frequency.setTargetAtTime(0.03 + motion * 0.25, t, 0.5);
      this.lfoF.gain.setTargetAtTime(freq * fmod * motion * 1.5, t, 0.5);
      this.lfoA.gain.setTargetAtTime(0.35 * motion, t, 0.5);
      this.lfoP.gain.setTargetAtTime(0.5 * motion, t, 0.5);
      const levelComp = { 'Pluie': 1, 'Vent': 2.6, 'Océan': 0.9, 'Vinyle': 2.2, 'Ruisseau': 1.6, 'Feu': 1.3, 'Oiseaux': 2.4, 'Ville': 1.1 }[type];
      this.amp.gain.setTargetAtTime(0.6 * levelComp, t, 0.5);
    }
    onParam(k) {
      super.onParam(k);
      if (k === 'type') this.build();
      if (k === 'tone' || k === 'motion') this.setTone();
    }
  }

  Perc.prototype.hitOrganic = hitOrganic;
  Perc.prototype.hitMetal = hitMetal;
  AMB.layers = { Drone, Pad, Bells, SeqVoice, Perc, Bass, Grains, Texture };
})();
