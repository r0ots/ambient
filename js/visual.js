// Visualizer: drifting light orbs for notes + a breathing waveform ring
(function () {
  const AMB = (window.AMB = window.AMB || {});

  const COLORS = { pad: [212, 150, 210], bells: [255, 196, 110], grains: [111, 207, 159], drone: [111, 159, 216], seq: [255, 179, 71], bass: [127, 159, 224] };

  const visual = {
    orbs: [],
    pending: [],
    init(canvas) {
      this.c = canvas;
      this.g = canvas.getContext('2d');
      // S10.1: the density follows the quality level (AMB.quality: haut ≤ 2, moyen / bas 1 — a 3× phone drew 4× the pixels)
      const resize = () => {
        const Q = AMB.quality, dpr = Q ? Q.dpr() : Math.min(2, window.devicePixelRatio || 1);
        const r = canvas.getBoundingClientRect();
        canvas.width = r.width * dpr; canvas.height = r.height * dpr;
        this.dpr = dpr;
      };
      resize();
      window.addEventListener('resize', resize);
      if (AMB.quality) AMB.quality.on(() => { if (this.dpr !== AMB.quality.dpr()) resize(); });
      AMB.bus.on('note', (n) => this.pending.push(n));
      AMB.bus.on('grain', (n) => this.pending.push(n));
      AMB.bus.on('chord', (c) => { this.chordFlash = c; });
      AMB.bus.on('freeze', () => { this.frozenAt = performance.now(); });
      this.wave = null;
      const loop = () => { this.draw(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },
    mode: (() => { try { return localStorage.getItem('ambient.vizMode') || 'Orbes'; } catch (e) { return 'Orbes'; } })(),
    MODES: ['Orbes', 'Horizon', 'Spectre'],
    cycleMode() {
      this.mode = this.MODES[(this.MODES.indexOf(this.mode) + 1) % this.MODES.length];
      try { localStorage.setItem('ambient.vizMode', this.mode); } catch (e) {}
      return this.mode;
    },
    level() {
      const an = AMB.engine.analyser;
      if (!an) return 0;
      if (!this.wave) this.wave = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(this.wave);
      let r = 0; for (let i = 0; i < this.wave.length; i += 4) r += this.wave[i] * this.wave[i];
      this.rms = Math.sqrt(r / (this.wave.length / 4));
      this.lvl = (this.lvl || 0) * 0.92 + this.rms * 0.08;
      return this.lvl;
    },
    // layered drifting ridges, like a horizon breathing with the music
    drawHorizon(g, W, H) {
      const lvl = this.level();
      const hue = 28 + 14 * Math.sin(this.t * 0.03);
      for (let L = 0; L < 5; L++) {
        const base = H * (0.45 + L * 0.12);
        const amp = H * (0.05 + lvl * 1.4) * (1 - L * 0.12);
        g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 8 * this.dpr) {
          const u = x / W;
          const y = base - amp * (Math.sin(u * (3 + L) + this.t * (0.15 + L * 0.05) + L) * 0.6 + Math.sin(u * (7 + L * 2) - this.t * 0.11) * 0.4);
          g.lineTo(x, y);
        }
        g.lineTo(W, H); g.closePath();
        g.fillStyle = `hsla(${hue - L * 6}, 55%, ${14 + L * 5}%, 0.10)`;
        g.fill();
      }
    },
    // smoothed log-frequency bars
    drawSpectrum(g, W, H) {
      const an = AMB.engine.analyser;
      if (!an) return;
      if (!this.freq) { this.freq = new Float32Array(an.frequencyBinCount); this.bars = new Float32Array(64); }
      an.getFloatFrequencyData(this.freq);
      const N = this.bars.length, sr = AMB.engine.ctx.sampleRate, bins = this.freq.length;
      const bw = W / N;
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < N; i++) {
        const f0 = 30 * Math.pow(16000 / 30, i / N), f1 = 30 * Math.pow(16000 / 30, (i + 1) / N);
        const b0 = Math.floor((f0 / (sr / 2)) * bins), b1 = Math.max(b0 + 1, Math.floor((f1 / (sr / 2)) * bins));
        let m = -140; for (let b = b0; b < b1 && b < bins; b++) m = Math.max(m, this.freq[b]);
        const v = Math.max(0, (m + 100) / 70);
        this.bars[i] = this.bars[i] * 0.85 + v * 0.15;
        const h = this.bars[i] * H * 0.8;
        const hue = 20 + (i / N) * 150;
        const grd = g.createLinearGradient(0, H, 0, H - h);
        grd.addColorStop(0, `hsla(${hue}, 80%, 65%, 0.35)`);
        grd.addColorStop(1, `hsla(${hue}, 80%, 65%, 0)`);
        g.fillStyle = grd;
        g.fillRect(i * bw + bw * 0.15, H - h, bw * 0.7, h);
      }
      g.globalCompositeOperation = 'source-over';
    },
    draw() {
      const { c, g } = this;
      const W = c.width, H = c.height;
      const eng = AMB.engine;
      const now = eng.ctx ? eng.ctx.currentTime : 0;
      // fade previous frame -> trails
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(12, 10, 8, 0.14)';
      g.fillRect(0, 0, W, H);
      this.t = (this.t || 0) + 1 / 60;
      if (this.mode === 'Horizon') this.drawHorizon(g, W, H);
      else if (this.mode === 'Spectre') this.drawSpectrum(g, W, H);

      // spawn due notes
      for (let i = this.pending.length - 1; i >= 0; i--) {
        const n = this.pending[i];
        if (n.time <= now + 0.02) {
          this.pending.splice(i, 1);
          const col = COLORS[n.layer] || [255, 255, 255];
          const x = ((n.midi - 36) / 60) * W * 0.9 + W * 0.05 + (Math.random() - 0.5) * W * 0.05;
          const big = n.layer === 'pad';
          this.orbs.push({
            x, y: H * (big ? 0.55 + Math.random() * 0.25 : 0.2 + Math.random() * 0.5),
            vx: (Math.random() - 0.5) * 0.15 * this.dpr, vy: -(0.05 + Math.random() * 0.2) * this.dpr,
            r: (big ? 50 : n.layer === 'grains' ? 6 : 14 + n.vel * 18) * this.dpr,
            life: 1, decay: big ? 0.0025 : n.layer === 'grains' ? 0.02 : 0.006 + Math.random() * 0.004,
            col,
          });
        }
      }
      if (this.pending.length > 400) this.pending.splice(0, this.pending.length - 400);

      g.globalCompositeOperation = 'lighter';
      for (let i = this.orbs.length - 1; i >= 0; i--) {
        const o = this.orbs[i];
        o.x += o.vx; o.y += o.vy; o.life -= o.decay;
        if (o.life <= 0) { this.orbs.splice(i, 1); continue; }
        const a = Math.pow(o.life, 1.5) * 0.35;
        const grd = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * (1.6 - o.life * 0.6));
        grd.addColorStop(0, `rgba(${o.col[0]},${o.col[1]},${o.col[2]},${a})`);
        grd.addColorStop(1, `rgba(${o.col[0]},${o.col[1]},${o.col[2]},0)`);
        g.fillStyle = grd;
        g.beginPath(); g.arc(o.x, o.y, o.r * 1.6, 0, Math.PI * 2); g.fill();
      }

      // freeze bloom: icy wash fading over 2 s
      if (this.frozenAt) {
        const a = 1 - (performance.now() - this.frozenAt) / 2000;
        if (a > 0) {
          g.globalCompositeOperation = 'lighter';
          const grd = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
          grd.addColorStop(0, `rgba(170,230,255,${0.18 * a})`);
          grd.addColorStop(1, 'rgba(170,230,255,0)');
          g.fillStyle = grd; g.fillRect(0, 0, W, H);
        }
      }

      // waveform ring (orbs mode only; other modes read the analyser themselves)
      if (eng.analyser && this.mode === 'Orbes') {
        const an = eng.analyser;
        if (!this.wave) this.wave = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(this.wave);
        let rms = 0; for (let i = 0; i < this.wave.length; i++) rms += this.wave[i] * this.wave[i];
        rms = Math.sqrt(rms / this.wave.length);
        this.rms = rms;
        const cx = W / 2, cy = H / 2, R = Math.min(W, H) * (0.22 + rms * 0.6);
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = `rgba(255, 214, 160, ${0.15 + Math.min(0.5, rms * 3)})`;
        g.lineWidth = 1.2 * this.dpr;
        g.beginPath();
        const N = 256, step = Math.floor(this.wave.length / N);
        for (let i = 0; i <= N; i++) {
          // average a window of samples so the ring breathes instead of bristling
          let v = 0; const j0 = (i % N) * step;
          for (let k = 0; k < step; k++) v += this.wave[j0 + k];
          v /= step;
          const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
          const rr = R * (1 + v * 1.2);
          const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    },
  };

  AMB.visual = visual;
})();
