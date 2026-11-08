// Visualizer: drifting light orbs for notes + a breathing waveform ring
(function () {
  const AMB = (window.AMB = window.AMB || {});

  const COLORS = { pad: [181, 140, 255], bells: [255, 210, 127], grains: [127, 255, 212], drone: [127, 184, 255] };

  const visual = {
    orbs: [],
    pending: [],
    init(canvas) {
      this.c = canvas;
      this.g = canvas.getContext('2d');
      const resize = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const r = canvas.getBoundingClientRect();
        canvas.width = r.width * dpr; canvas.height = r.height * dpr;
        this.dpr = dpr;
      };
      resize();
      window.addEventListener('resize', resize);
      AMB.bus.on('note', (n) => this.pending.push(n));
      AMB.bus.on('grain', (n) => this.pending.push(n));
      AMB.bus.on('chord', (c) => { this.chordFlash = c; });
      AMB.bus.on('freeze', () => { this.frozenAt = performance.now(); });
      this.wave = null;
      const loop = () => { this.draw(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },
    draw() {
      const { c, g } = this;
      const W = c.width, H = c.height;
      const eng = AMB.engine;
      const now = eng.ctx ? eng.ctx.currentTime : 0;
      // fade previous frame -> trails
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(8, 9, 16, 0.14)';
      g.fillRect(0, 0, W, H);

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

      // XY pad cursor
      if (this.xy) {
        const age = (performance.now() - this.xy.t) / 1000;
        const a = Math.max(0, 1 - age / 3);
        if (a > 0) {
          const px = this.xy.x * W, py = (1 - this.xy.y) * H;
          g.globalCompositeOperation = 'lighter';
          const grd = g.createRadialGradient(px, py, 0, px, py, 40 * this.dpr);
          grd.addColorStop(0, `rgba(255,255,255,${0.25 * a})`);
          grd.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grd; g.beginPath(); g.arc(px, py, 40 * this.dpr, 0, Math.PI * 2); g.fill();
          g.strokeStyle = `rgba(200,190,255,${0.12 * a})`; g.lineWidth = this.dpr;
          g.beginPath(); g.moveTo(px, 0); g.lineTo(px, H); g.moveTo(0, py); g.lineTo(W, py); g.stroke();
        }
      }

      // waveform ring
      if (eng.analyser) {
        const an = eng.analyser;
        if (!this.wave) this.wave = new Float32Array(an.fftSize);
        an.getFloatTimeDomainData(this.wave);
        let rms = 0; for (let i = 0; i < this.wave.length; i++) rms += this.wave[i] * this.wave[i];
        rms = Math.sqrt(rms / this.wave.length);
        this.rms = rms;
        const cx = W / 2, cy = H / 2, R = Math.min(W, H) * (0.22 + rms * 0.6);
        g.globalCompositeOperation = 'source-over';
        g.strokeStyle = `rgba(220, 225, 255, ${0.15 + Math.min(0.5, rms * 3)})`;
        g.lineWidth = 1.2 * this.dpr;
        g.beginPath();
        const N = 256, step = Math.floor(this.wave.length / N);
        for (let i = 0; i <= N; i++) {
          const v = this.wave[(i % N) * step];
          const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
          const rr = R * (1 + v * 0.9);
          const x = cx + Math.cos(ang) * rr, y = cy + Math.sin(ang) * rr;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
    },
  };

  AMB.visual = visual;
})();
