// Audio engine: master bus + space FX (reverb w/ shimmer, ping-pong delay, tape, lo-fi)
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;

  // ---------- helpers ----------
  function makeNoiseBuffer(ctx, seconds, color = 'white', channels = 2) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
    for (let c = 0; c < channels; c++) {
      const d = buf.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (color === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else if (color === 'brown') {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else d[i] = w;
      }
    }
    return buf;
  }

  // Synthetic impulse responses with three characters:
  //  Hall  – early reflections + darkening tail
  //  Plate – dense, bright, quick build-up
  //  Cloud – slow swelling attack, very diffuse and dark (pad-like)
  function makeImpulse(ctx, seconds, decayPow = 3, type = 'Hall') {
    const rate = ctx.sampleRate;
    if (type === 'Cloud') seconds *= 1.4;
    const len = Math.max(1, Math.floor(rate * seconds));
    const buf = ctx.createBuffer(2, len, rate);
    const swell = type === 'Cloud' ? rate * Math.min(1.5, seconds * 0.15) : rate * (type === 'Plate' ? 0.004 : 0.012);
    const dampA = type === 'Plate' ? 0.01 : type === 'Cloud' ? 0.25 : 0.04;
    const dampB = type === 'Plate' ? 0.35 : type === 'Cloud' ? 0.6 : 0.7;
    const pow = type === 'Plate' ? decayPow * 0.8 : decayPow;
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const coef = dampA + dampB * t * t; // damping: the tail gets darker over time
        const w = Math.random() * 2 - 1;
        lp = lp + (w - lp) * (1 - coef);
        const env = Math.pow(1 - t, pow);
        const pre = type === 'Cloud' ? Math.pow(Math.min(1, i / swell), 2) : Math.min(1, i / swell);
        d[i] = lp * env * pre;
      }
      if (type === 'Hall') {
        // a handful of discrete early reflections (different per channel for width)
        for (let k = 0; k < 8; k++) {
          const at = Math.floor(rate * (0.008 + Math.random() * 0.07));
          if (at < len) d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - k * 0.04);
        }
      }
    }
    return buf;
  }

  function satCurve(drive) {
    const n = 2048, curve = new Float32Array(n);
    // unity small-signal gain: only peaks get squashed, so loudness stays stable as drive rises
    const k = 1 + drive * 3;
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * 2; // shaper input range is [-1,1]; scale for headroom
      curve[i] = Math.tanh(k * x) / k;
    }
    return curve;
  }

  const DIVS = { '1/8': 0.5, '1/8.': 0.75, '1/4': 1, '1/4.': 1.5, '1/2': 2, '1/1': 4 };

  class Engine {
    constructor() {
      this.ctx = null;
      this.started = false;
    }

    init() {
      if (this.ctx) return;
      const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }));
      const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
      this.g = g;

      // --- buses ---
      this.dryBus = g(1);
      this.fxBus = g(1);
      this.preTape = g(1);

      // --- reverb ---
      this.revIn = g(0.5);
      this.revPre = ctx.createBiquadFilter(); this.revPre.type = 'highpass'; this.revPre.frequency.value = 180;
      this.conv = ctx.createConvolver();
      this.revOut = g(1.2);
      this.fxBus.connect(this.revIn);
      this.revIn.connect(this.revPre);
      this.preDelay = ctx.createDelay(0.5);
      this.revPre.connect(this.preDelay);
      this.preDelay.connect(this.conv);
      this.conv.connect(this.revOut);
      this.revOut.connect(this.preTape);

      // --- shimmer: doppler pitch shifter (+12) in the reverb feedback loop ---
      this.shimmerGain = g(0);
      this._buildShimmer();

      // --- ping-pong delay ---
      this.dlyIn = g(0.3);
      this.dlyL = ctx.createDelay(4); this.dlyR = ctx.createDelay(4);
      this.dlyFb = g(0.5);
      this.dlyTone = ctx.createBiquadFilter(); this.dlyTone.type = 'lowpass'; this.dlyTone.frequency.value = 3200;
      this.dlyHp = ctx.createBiquadFilter(); this.dlyHp.type = 'highpass'; this.dlyHp.frequency.value = 250;
      const panL = ctx.createStereoPanner(); panL.pan.value = -0.7;
      const panR = ctx.createStereoPanner(); panR.pan.value = 0.7;
      this.dlyOut = g(0.9);
      this.fxBus.connect(this.dlyIn);
      this.dlyIn.connect(this.dlyHp);
      this.dlyHp.connect(this.dlyL);
      this.dlyL.connect(this.dlyTone);
      this.dlyTone.connect(this.dlyR);
      this.dlyR.connect(this.dlyFb);
      this.dlyFb.connect(this.dlyL);
      this.dlyL.connect(panL); this.dlyR.connect(panR);
      panL.connect(this.dlyOut); panR.connect(this.dlyOut);
      this.dlyOut.connect(this.preTape);
      // delay feeds a little into the reverb: echoes melt into the space
      this.dlyToRev = g(0.35);
      this.dlyOut.connect(this.dlyToRev); this.dlyToRev.connect(this.revIn);

      this.dryBus.connect(this.preTape);

      // --- tape: wow/flutter + saturation ---
      this.tapeDelay = ctx.createDelay(0.1);
      this.tapeDelay.delayTime.value = 0.012;
      this.wow = ctx.createOscillator(); this.wow.frequency.value = 0.55;
      this.wowAmt = g(0);
      this.flutter = ctx.createOscillator(); this.flutter.frequency.value = 6.3;
      this.flutterAmt = g(0);
      this.wow.connect(this.wowAmt); this.wowAmt.connect(this.tapeDelay.delayTime);
      this.flutter.connect(this.flutterAmt); this.flutterAmt.connect(this.tapeDelay.delayTime);
      this.wow.start(); this.flutter.start();
      this.sat = ctx.createWaveShaper(); this.sat.oversample = '2x';
      this.satIn = g(1); this.satOut = g(1);
      this.preTape.connect(this.tapeDelay);
      this.tapeDelay.connect(this.satIn);
      this.satIn.connect(this.sat);
      this.sat.connect(this.satOut);

      // --- lo-fi: band-limit + hiss ---
      this.lofiLp = ctx.createBiquadFilter(); this.lofiLp.type = 'lowpass'; this.lofiLp.frequency.value = 20000; this.lofiLp.Q.value = 0.5;
      this.lofiHp = ctx.createBiquadFilter(); this.lofiHp.type = 'highpass'; this.lofiHp.frequency.value = 25;
      this.satOut.connect(this.lofiHp);
      this.lofiHp.connect(this.lofiLp);
      this.hiss = ctx.createBufferSource();
      this.hiss.buffer = makeNoiseBuffer(ctx, 4, 'pink');
      this.hiss.loop = true;
      this.hissGain = g(0);
      const hissHp = ctx.createBiquadFilter(); hissHp.type = 'highpass'; hissHp.frequency.value = 3000;
      this.hiss.connect(hissHp); hissHp.connect(this.hissGain); this.hissGain.connect(this.lofiLp);
      this.hiss.start();

      // --- master ---
      this.master = g(0.8);
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18; this.comp.ratio.value = 2.5; this.comp.knee.value = 12;
      this.comp.attack.value = 0.05; this.comp.release.value = 0.4;
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -3; this.limiter.ratio.value = 20; this.limiter.knee.value = 0;
      this.limiter.attack.value = 0.002; this.limiter.release.value = 0.15;
      this.out = g(1); // used for fades (sleep timer / stop)
      this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0.85;
      // gentle "air" shelf: the synth layers are filtered/dark by design, this restores some sheen
      this.air = ctx.createBiquadFilter(); this.air.type = 'highshelf'; this.air.frequency.value = 7000; this.air.gain.value = 4;
      this.lofiLp.connect(this.air);
      this.air.connect(this.master);
      this.master.connect(this.comp);
      this.comp.connect(this.limiter);
      this.limiter.connect(this.out);
      this.out.connect(this.analyser);
      this.analyser.connect(ctx.destination);
      // ring buffer of the last seconds of output, for the "Gel" (freeze/resample) grain source
      this.ringSecs = 6;
      this.ring = new Float32Array(Math.floor(ctx.sampleRate * this.ringSecs));
      this.ringPos = 0;
      this.tapSink = g(0); this.tapSink.connect(ctx.destination);
      this._setupTap();
      this.recDest = ctx.createMediaStreamDestination();
      this.out.connect(this.recDest);

      this._revSize = -1;
      this.applyAll();
      store.on((key) => this.apply(key));
    }

    _buildShimmer() {
      const ctx = this.ctx, g = this.g;
      // Two delay lines whose delay time is swept by a falling sawtooth -> pitch up.
      // slope = 2*D*f must equal 1 for +1 octave.
      const f = 6, D = 1 / (2 * f); // sweep half-range in seconds
      const input = g(1), out = g(1);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
      this.conv.connect(hp); hp.connect(input);
      const cosWave = ctx.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]), { disableNormalization: true });
      const now = ctx.currentTime + 0.05;
      for (let i = 0; i < 2; i++) {
        const d = ctx.createDelay(1);
        d.delayTime.value = D + 0.01;
        const saw = ctx.createOscillator(); saw.type = 'sawtooth'; saw.frequency.value = f;
        const sawAmt = g(-D);
        saw.connect(sawAmt); sawAmt.connect(d.delayTime);
        const win = g(0.5);
        const cos = ctx.createOscillator(); cos.setPeriodicWave(cosWave); cos.frequency.value = f;
        const winAmt = g(0.5);
        cos.connect(winAmt); winAmt.connect(win.gain);
        input.connect(d); d.connect(win); win.connect(out);
        const t0 = now + i * (0.5 / f);
        saw.start(t0); cos.start(t0);
      }
      out.connect(lp);
      lp.connect(this.shimmerGain);
      this.shimmerGain.connect(this.revIn);
    }

    // Output tap feeding the ring buffer and WAV capture. Prefers an AudioWorklet (off the main
    // thread, loaded from a Blob URL so no extra file is needed); falls back to ScriptProcessor.
    async _setupTap() {
      const ctx = this.ctx;
      const useSP = () => {
        this.tap = ctx.createScriptProcessor(4096, 2, 1);
        this.tap.onaudioprocess = (e) => this._onFrames(e.inputBuffer.getChannelData(0), e.inputBuffer.getChannelData(1));
        this.out.connect(this.tap); this.tap.connect(this.tapSink);
        this.tapKind = 'script';
      };
      if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') return useSP();
      const code = `class Tap extends AudioWorkletProcessor {
        constructor() { super(); this.n = 0; this.L = new Float32Array(4096); this.R = new Float32Array(4096); }
        process(inputs) {
          const inp = inputs[0]; if (!inp || !inp.length) return true;
          const l = inp[0], r = inp[1] || inp[0];
          this.L.set(l, this.n); this.R.set(r, this.n); this.n += l.length;
          if (this.n >= 4096) { this.port.postMessage([this.L, this.R], [this.L.buffer, this.R.buffer]); this.L = new Float32Array(4096); this.R = new Float32Array(4096); this.n = 0; }
          return true;
        }
      }
      registerProcessor('ambient-tap', Tap);`;
      try {
        const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        this.tap = new AudioWorkletNode(ctx, 'ambient-tap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
        this.tap.port.onmessage = (e) => this._onFrames(e.data[0], e.data[1]);
        this.out.connect(this.tap); this.tap.connect(this.tapSink);
        this.tapKind = 'worklet';
      } catch (e) {
        console.warn('AudioWorklet tap unavailable, using ScriptProcessor', e);
        useSP();
      }
    }
    _onFrames(L, R) {
      const ring = this.ring, n = ring.length;
      let p = this.ringPos;
      for (let i = 0; i < L.length; i++) { ring[p] = (L[i] + R[i]) * 0.5; p = p + 1 === n ? 0 : p + 1; }
      this.ringPos = p;
      if (this.capturing) {
        const out = new Int16Array(L.length * 2);
        for (let i = 0; i < L.length; i++) {
          out[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767;
          out[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
        }
        this.capturing.push(out);
        this.capturedFrames += L.length;
      }
    }

    // Lossless stereo capture of the master output -> 16-bit WAV Blob
    startCapture() { this.capturing = []; this.capturedFrames = 0; }
    stopCapture() {
      const chunks = this.capturing || [];
      this.capturing = null;
      const sr = this.ctx.sampleRate, frames = this.capturedFrames;
      const hdr = new DataView(new ArrayBuffer(44));
      const w = (o, str) => { for (let i = 0; i < str.length; i++) hdr.setUint8(o + i, str.charCodeAt(i)); };
      w(0, 'RIFF'); hdr.setUint32(4, 36 + frames * 4, true); w(8, 'WAVE'); w(12, 'fmt ');
      hdr.setUint32(16, 16, true); hdr.setUint16(20, 1, true); hdr.setUint16(22, 2, true);
      hdr.setUint32(24, sr, true); hdr.setUint32(28, sr * 4, true); hdr.setUint16(32, 4, true); hdr.setUint16(34, 16, true);
      w(36, 'data'); hdr.setUint32(40, frames * 4, true);
      return new Blob([hdr, ...chunks], { type: 'audio/wav' });
    }

    // Copy the last `secs` seconds of output into a normalized, faded AudioBuffer
    snapshot(secs = 4) {
      const sr = this.ctx.sampleRate, n = Math.min(this.ring.length, Math.floor(sr * secs));
      const buf = this.ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
      const start = (this.ringPos - n + this.ring.length) % this.ring.length;
      let peak = 0;
      for (let i = 0; i < n; i++) { const v = this.ring[(start + i) % this.ring.length]; d[i] = v; peak = Math.max(peak, Math.abs(v)); }
      const fade = Math.floor(sr * 0.03);
      for (let i = 0; i < fade; i++) { d[i] *= i / fade; d[n - 1 - i] *= i / fade; }
      if (peak > 1e-4) for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
      return { buffer: buf, peak };
    }

    get now() { return this.ctx ? this.ctx.currentTime : 0; }

    beatDur() { return 60 / store.get('global.tempo'); }

    apply(key) {
      if (!this.ctx) return;
      const v = store.get(key);
      const t = this.ctx.currentTime;
      const ramp = (param, val, tc = 0.08) => param.setTargetAtTime(val, t, tc);
      switch (key) {
        case 'global.volume':
          ramp(this.master.gain, v * v * 1.8);
          break;
        case 'fx.space': ramp(this.revIn.gain, v * 1.1); break;
        case 'fx.revType': this._revSize = -1; // force a rebuild, then fall through
        // eslint-disable-next-line no-fallthrough
        case 'fx.size': {
          clearTimeout(this._sizeT);
          this._sizeT = setTimeout(() => {
            const sz = store.get('fx.size');
            const secs = 1.5 + sz * 9.5;
            if (Math.abs(secs - this._revSize) < 0.6) return; // avoid reloading the IR on tiny moves (evolve/morph)
            this._revSize = secs;
            this.conv.buffer = makeImpulse(this.ctx, secs, 2.2 + (1 - sz) * 2, store.get('fx.revType'));
          }, 120);
          break;
        }
        case 'fx.predelay': ramp(this.preDelay.delayTime, v * v * 0.25, 0.2); break;
        case 'fx.shimmer': ramp(this.shimmerGain.gain, v * 0.42); break;
        case 'fx.echo': ramp(this.dlyIn.gain, v * 0.9); break;
        case 'fx.feedback': ramp(this.dlyFb.gain, v); break;
        case 'fx.echoTime':
        case 'global.tempo': {
          const secs = Math.min(3.9, this.beatDur() * DIVS[store.get('fx.echoTime')]);
          ramp(this.dlyL.delayTime, secs, 0.3); ramp(this.dlyR.delayTime, secs, 0.3);
          break;
        }
        case 'fx.tape': {
          ramp(this.wowAmt.gain, v * 0.0035);
          ramp(this.flutterAmt.gain, v * 0.00025);
          this.sat.curve = satCurve(v);
          ramp(this.satIn.gain, 0.5);
          ramp(this.satOut.gain, 2);
          break;
        }
        case 'fx.lofi': {
          ramp(this.lofiLp.frequency, 20000 * Math.pow(0.12, v));
          ramp(this.lofiHp.frequency, 25 + v * 220);
          ramp(this.hissGain.gain, v * 0.05);
          ramp(this.air.gain, 4 * (1 - v));
          break;
        }
      }
    }

    applyAll() {
      ['global.volume', 'fx.space', 'fx.size', 'fx.predelay', 'fx.shimmer', 'fx.echo', 'fx.feedback', 'fx.echoTime', 'fx.tape', 'fx.lofi']
        .forEach((k) => this.apply(k));
    }

    // Create a mixer channel for a layer. Returns {input, setLevel, setSend}
    channel() {
      const ctx = this.ctx, g = this.g;
      const input = g(1), level = g(0), send = g(0);
      input.connect(level);
      level.connect(this.dryBus);
      level.connect(send);
      send.connect(this.fxBus);
      return {
        input, level, send,
        setLevel: (v) => level.gain.setTargetAtTime(v, ctx.currentTime, 0.15),
        setSend: (v) => send.gain.setTargetAtTime(v, ctx.currentTime, 0.15),
      };
    }

    fadeOut(seconds) {
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(this.out.gain.value, t);
      this.out.gain.linearRampToValueAtTime(0, t + seconds);
    }
    fadeIn(seconds = 1.5) {
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(this.out.gain.value, t);
      this.out.gain.linearRampToValueAtTime(1, t + seconds);
    }
  }

  AMB.makeNoiseBuffer = makeNoiseBuffer;
  AMB.engine = new Engine();
})();
