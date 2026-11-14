// S8.5 « La musique pilote la lumière » (AMB.cityMusic): the music drives the city's LIGHT, never its shape. Loaded after
// garden-visual.js and city-gl.js; plugs into the city engine (S8.1) only through its public hooks: `gv.addDim` (the
// world: `music.level` / `music.kick` / `music.bass`, and the `power` cut of a RATÉ), `gv.addLayer` (six layers) and
// `gv.impulse` / `gv.energy` (the windows that blink); the bloom pulse through `AMB.cityGL.pulse`.
//   (S9.3: each of these only with its function heard — grid = Basse, ring = Pulsations, sky tint = Pad, shooting stars =
//   Texture / Grains; the Mélodie auto's notes are cars and the looper's airships, js/city-life.js)
//   - LASERS: every melody note (Mélodie écrite, the player's pads / keys / MIDI) fires a beam
//     from the roof of its layer's building: elevation = pitch (low = grazing, high = vertical), colour = the layer, length
//     in time = the note, velocity = width and glow; a forced chord = a fan; the player's beams beat the machine's.
//   - KICK (and the strong beats without a kick): the city throbs (bloom), a ring of light runs over the ground from the
//     centre, the windows blink.
//   - CHORD that changes: a sweep of colour across the sky (hue by function: tonic / subdominant / dominant), the clouds
//     lit from below.
//   - BASS: a synthwave GRID on the ground (lines running to the horizon) scrolling towards us on the tempo (one line a
//     beat), lit on each bass note.
//   - SHOOTING STARS on accents, phrase ends and very high notes (rare); a shower on a party of garden.FX.
//   - garden.FX: `city` ingredient — 'blackout' (RATÉ: half a second of power cut),
//     'stars' (a party: a shower of shooting stars). No second juice system: garden.fxPlay calls `cityMusic.fx` on its beat.
// Every event waits for the moment it is HEARD (audio clock minus the output latency), not the scheduler's lookahead.
// Caps (LASERS, STARS, WAVES) × the quality `q` (0.3..1: S10.1, from the app's quality level, AMB.quality, end of js/motion.js).
// JUICE (AMB.motion) scales it; JUICE 0 or reduced motion: nothing moves (no ring, no shooting star, no scroll, no sweep,
// no flicker), the light still follows (beams, grid lit on the bass, sky tint).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const GV = AMB.gardenVisual;
  if (!GV || !GV.addLayer) return;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const ease = (x) => 1 - (1 - x) ** 3;
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const mix = (c, k) => c.map((v) => Math.round(v + (255 - v) * k));
  const D2R = Math.PI / 180;

  // chord function → hue of the sky sweep: tonic (I iii vi) magenta, subdominant (ii IV) cyan, dominant (V vii°) amber
  const FUNC_OF = ['T', 'S', 'T', 'S', 'D', 'T', 'D'];
  const FUNC_COL = { T: [255, 70, 196], S: [56, 226, 255], D: [255, 154, 52] };
  const MELODY = new Set(['bells', 'seq']);
  const CAPS = { lasers: 28, stars: 8, waves: 5 };
  // per who: width (in cells), brightness, minimum length (s), max: the longest beam (S8.8: the machine's and the looper's notes are SHOTS — a legato Mélodie auto of 1.6 s notes kept a
  // beam standing all the time, one bar frozen over the city; the player's held notes stay held)
  const WHO = { player: { w: 1, a: 1, min: 0.32, max: 1.6 }, loop: { w: 0.7, a: 0.75, min: 0.2, max: 0.5 }, machine: { w: 0.7, a: 0.6, min: 0.16, max: 0.4 } };
  const STAR_GAP = { player: 1.5, machine: 6 }; // s between two shooting stars of the same source (rare)

  const CM = {
    CAPS, FUNC_OF, FUNC_COL, WHO,
    lasers: [], stars: [], waves: [], pending: [],
    sweep: null, tint: { col: FUNC_COL.T, a: 0, prev: null }, lastDeg: null,
    grid: { flash: 0, phase: 0, base: 0 }, kick: 0, bass: 0, level: 0, act: 0,
    blackout: null, q: 1, auto: true,
    lastStar: { player: -99, machine: -99 }, lastKick: -99, beatIdx: null, now: 0,
    times: [], rng: 1,

    // ---- time: what is heard now (audio clock minus the output latency) and the beat position heard (beats, float)
    heard() {
      const c = AMB.engine && AMB.engine.ctx;
      return GV.clock() - (c ? c.outputLatency || c.baseLatency || 0 : 0);
    },
    beatPos(now) {
      const S = AMB.seq; if (!S || !S.playing || !S.stepDur) return null;
      if (typeof S.heard === 'function' && AMB.engine && AMB.engine.ctx) { const h = S.heard(); return h < 0 ? null : (h - (S.origin || 0)) / 4; }
      return (S.step - (S.nextTime - now) / S.stepDur() - (S.origin || 0)) / 4;
    },
    juice() { const J = GV.JUICE; return J == null ? 1 : Math.max(0, +J); },
    still() { return GV.reduced || this.juice() <= 0.001; }, // nothing moves (the light still follows)
    rand() { this.rng = (this.rng * 16807) % 2147483647; return (this.rng - 1) / 2147483646; },

    // ---- events, queued with their audio time; applied when heard
    push(kind, d) {
      if (!GV.running() || GV.replay) return;
      this.pending.push({ kind, d, time: d && d.time != null ? +d.time : this.heard() });
      if (this.pending.length > 240) this.pending.splice(0, this.pending.length - 240);
    },
    listen(bus) {
      bus.on('note', (n) => {
        if (!n || n.live) return; // a live note is seen through `live` (one beam, not two)
        // S9.3: the Mélodie auto's notes are flying cars and the looper's blink its airships (js/city-life.js); a laser
        // is a note of the Mélodie écrite or of the player
        if (n.loop || n.layer === 'bells') return;
        if (MELODY.has(n.layer)) this.push('laser', { layer: n.layer, midi: n.midi, vel: n.vel == null ? 0.7 : n.vel, dur: n.dur, time: n.time, who: n.loop ? 'loop' : 'machine' });
        else if (n.layer === 'bass') this.push('bass', n);
      });
      bus.on('live', (n) => {
        if (!n) return;
        const P = AMB.pianoRoll, rec = !!(P && P.roll && P.roll.recording), s = GV.splash ? GV.splash('live', n, rec) : null;
        this.push('laser', { layer: s ? s.plant : 'bells', midi: n.midi, vel: n.raw != null ? n.raw : n.vel == null ? 0.85 : n.vel, held: n.id == null ? null : n.id, time: n.time, who: 'player', raw: n.raw });
      });
      bus.on('liveOff', (n) => n && this.push('off', n));
      bus.on('panic', () => { for (const L of this.lasers) if (L.held != null && L.t1 === Infinity) L.t1 = this.now; });
      bus.on('chord', (c) => {
        if (!c) return;
        this.push('chord', c);
        if (c.forced) this.push('fan', c);
      });
      bus.on('perc', (p) => p && p.track === 0 && this.push('kick', p));
      bus.on('phrase', (p) => p && p.len > 1 && p.i === p.len - 1 && this.push('star', { time: p.time, who: 'machine' }));
    },

    // ---- the world advances once per frame (called by the `music.level` dimension, before the layers draw)
    tick() {
      const now = this.heard(), dt = clamp(GV.dt || 1 / 60, 0, 0.1);
      this.now = now;
      for (let i = 0; i < this.pending.length; i++) {
        const e = this.pending[i]; if (e.time > now + 0.004) continue;
        this.pending.splice(i--, 1); this.apply(e, now);
      }
      // the strong beats (1 and 3) without a kick: a softer throb
      const bp = this.beatPos(now);
      if (bp != null) {
        const b = Math.floor(bp);
        if (this.beatIdx != null && b !== this.beatIdx && ((b % 2) + 2) % 2 === 0) {
          const S = AMB.seq, beat = S && S.stepDur ? S.stepDur() * 4 : 0.5;
          if (now - this.lastKick > beat * 0.75) this.throb(((b % 4) + 4) % 4 === 0 ? 0.55 : 0.35, 'beat');
        }
        this.beatIdx = b;
        if (!this.still()) this.grid.phase = ((bp % 1) + 1) % 1; // one line a beat, towards us
      } else this.beatIdx = null;
      // decays
      this.kick = Math.max(0, this.kick - dt / 0.3);
      this.grid.flash = Math.max(0, this.grid.flash - dt / 0.45);
      this.bass = this.grid.flash;
      this.act = Math.max(0, this.act - dt * 0.35);
      const t = this.tint; if (t.a > 0.22) t.a = Math.max(0.22, t.a - dt / 2.5);
      const bo = this.blackout; if (bo && now > bo.t1 + 0.6) this.blackout = null;
      for (let i = this.lasers.length - 1; i >= 0; i--) { const L = this.lasers[i]; if (L.t1 !== Infinity && now > L.t1 + L.rel) this.lasers.splice(i, 1); else if (now - L.t0 > 30) this.lasers.splice(i, 1); }
      for (let i = this.stars.length - 1; i >= 0; i--) if (now > this.stars[i].t0 + this.stars[i].dur) this.stars.splice(i, 1);
      for (let i = this.waves.length - 1; i >= 0; i--) if (now > this.waves[i].t0 + this.waves[i].dur) this.waves.splice(i, 1);
      if (this.sweep && now > this.sweep.t0 + this.sweep.dur) this.sweep = null;
      this.level = clamp(0.15 * this.lasers.length / 4 + 0.5 * this.act + 0.3 * this.kick);
      return this.level;
    },
    apply(e, now) {
      const d = e.d;
      if (e.kind === 'laser') {
        this.act = Math.min(1, this.act + (d.who === 'player' ? 0.18 : 0.08));
        this.laser(d.layer, d.midi, d.vel, d.who, e.time, d.held != null ? Infinity : e.time + Math.max(WHO[d.who].min, Math.min(WHO[d.who].max, +d.dur || 0.3)), d.held);
        if (d.midi >= 84 || (d.who === 'player' && (d.raw != null ? d.raw : d.vel) >= 0.92)) this.star(d.who === 'player' ? 'player' : 'machine', e.time);
      } else if (e.kind === 'off') {
        for (const L of this.lasers) if (L.held === d.id && L.t1 === Infinity) L.t1 = Math.max(e.time, L.t0 + WHO.player.min);
      } else if (e.kind === 'bass') {
        this.grid.flash = Math.min(1, 0.55 + 0.45 * (d.vel == null ? 0.8 : d.vel)); this.grid.base = 1;
      } else if (e.kind === 'kick') {
        this.lastKick = e.time; this.throb(0.6 + 0.4 * (d.vel == null ? 0.8 : d.vel), 'kick');
      } else if (e.kind === 'chord') {
        const deg = (((d.deg | 0) % 7) + 7) % 7;
        if (deg !== this.lastDeg || d.forced) this.chord(deg, e.time);
        this.lastDeg = deg;
      } else if (e.kind === 'fan') {
        const ms = (d.midis || []).slice(0, 5), p = this.plant('pad');
        ms.forEach((m, i) => this.laser(p ? 'pad' : 'bells', m + 12, 0.9, 'player', e.time, e.time + 1.1, null, (i - (ms.length - 1) / 2) * 16));
      } else if (e.kind === 'star') this.star(d.who || 'machine', e.time);
    },

    // ---- a beam: from the roof of `layer`'s building (or the tallest one, or the street's centre)
    plant(id) { return GV.plants.find((p) => p.id === id && p.vis > 0); },
    elevOf(midi) { return 6 + 84 * clamp(((midi == null ? 60 : +midi) - 48) / 36); }, // degrees above the horizon
    laser(layer, midi, vel, who, t0, t1, held, spread = 0) {
      const W = WHO[who] || WHO.machine, cap = Math.max(4, Math.round(CAPS.lasers * this.q));
      while (this.lasers.length >= cap) { // the machine never pushes out the player
        let i = this.lasers.findIndex((L) => L.who !== 'player');
        if (i < 0) { if (who !== 'player') return null; i = 0; }
        this.lasers.splice(i, 1);
      }
      // S8.8: a note repeated on the same beam (same roof, same pitch) RE-LIGHTS that beam instead of stacking another one
      // on it: additive beams piled at the same angle made a huge white bar that never went away
      if (!spread && held == null) {
        const p0 = this.plant(layer), pid = p0 ? p0.id : null, el = this.elevOf(midi);
        for (const L of this.lasers) {
          if (L.plant !== pid || L.held != null || Math.abs(L.elev - el) > 2.5 || (L.t1 !== Infinity && t0 > L.t1 + L.rel)) continue;
          L.t1 = Math.max(L.t1, t1); L.a = Math.max(L.a, (WHO[who] || W).a * (0.55 + 0.45 * clamp(vel == null ? 0.7 : +vel))); if (who === 'player') L.who = who;
          return L;
        }
      }
      const p = this.plant(layer) || GV.plants.filter((qq) => qq.vis > 0).sort((a, b) => b.vis * b.k - a.vis * a.k)[0];
      const lay = GV.LAYERS.find((l) => l.id === layer), col = (p && p.id === layer ? p.col : lay && lay.col) || [255, 196, 92];
      const elev = clamp(this.elevOf(midi) + Math.abs(spread) * -0.4, 4, 90);
      // which way it leans: away from the centre of the street (a beam from the middle alternates with the pitch)
      const cx = (GV.W || 1) / 2, x = p ? p.sx : cx, side = spread ? Math.sign(spread) : Math.abs(x - cx) < (GV.W || 1) * 0.08 ? (((midi | 0) % 2) ? 1 : -1) : Math.sign(x - cx);
      const v = clamp(vel == null ? 0.7 : +vel);
      const L = { layer, plant: p ? p.id : null, midi, who, t0, t1, held, rel: this.still() ? 0.08 : 0.28, elev, side, ang: side * (90 - elev) * D2R, col, hot: mix(col, 0.55),
        w: W.w * (0.45 + 0.55 * v), a: W.a * (0.55 + 0.45 * v), ph: this.rand() * 6.283 };
      this.lasers.push(L);
      return L;
    },
    // the kick (or a strong beat): bloom, a ring over the ground, the windows blink
    throb(v, kind) {
      if (kind === 'kick') this.kick = Math.max(this.kick, v);
      const G = AMB.cityGL, J = this.juice();
      if (G && G.pulse) G.pulse('bloom', (kind === 'kick' ? 0.7 : 0.4) * v, 260);
      for (const p of GV.plants) GV.energy[p.id] = Math.max(GV.energy[p.id] || 0, (kind === 'kick' ? 0.42 : 0.28) * v * (0.6 + 0.4 * Math.min(1, J)));
      GV.impulse('beat', v);
      if (this.still() || !GV.feat.perc) return; // S9.3: the ring over the ground is the Pulsations'
      const cap = Math.max(1, Math.round(CAPS.waves * this.q));
      if (this.waves.length >= cap) this.waves.shift();
      this.waves.push({ t0: this.now, dur: kind === 'kick' ? 0.95 : 0.8, a: v * Math.min(1.5, J), col: kind === 'kick' ? [255, 63, 164] : [63, 240, 255] });
    },
    chord(deg, t) {
      const col = FUNC_COL[FUNC_OF[deg]], tt = this.tint;
      tt.prev = tt.a > 0.02 ? tt.col : null; tt.prevA = tt.a; tt.col = col; tt.a = 1; tt.fn = FUNC_OF[deg];
      this.sweep = { t0: t, dur: this.still() ? 0 : 0.9, col, dir: (this.sweepDir = -(this.sweepDir || -1)) };
    },
    star(who, t, force) {
      if (this.still()) return null;
      if (!force && !(GV.feat.texture || GV.feat.grains)) return null; // S9.3: shooting stars belong to the starry sky (Texture, Grains)
      if (!force && t - this.lastStar[who] < STAR_GAP[who]) return null;
      const cap = Math.max(1, Math.round(CAPS.stars * this.q)); if (this.stars.length >= cap) return null;
      this.lastStar[who] = t;
      const r = () => this.rand(), dir = r() < 0.5 ? -1 : 1, an = (18 + 22 * r()) * D2R;
      const s = { t0: t, dur: 0.7 + 0.5 * r(), x: dir > 0 ? 0.05 + 0.5 * r() : 0.45 + 0.5 * r(), y: 0.04 + 0.25 * r(), vx: dir * Math.cos(an) * 0.8, vy: Math.sin(an) * 0.8, col: r() < 0.6 ? [235, 245, 255] : r() < 0.5 ? [255, 160, 230] : [160, 240, 255] };
      this.stars.push(s);
      return s;
    },

    // ---- garden.FX ingredient `city` (garden.fxPlay calls it on the beat of the moment)
    fx(kind) {
      const now = this.heard();
      if (kind === 'blackout') { this.blackout = { t0: now, t1: now + 0.5 }; return true; } // RATÉ: half a second of power cut
      if (kind === 'stars') { for (let i = 0; i < 7; i++) this.star('player', now + i * 0.22 * (0.6 + 0.8 * this.rand()), true); return true; }
      return false;
    },
    out(now = this.now) { const b = this.blackout; return b && now >= b.t0 && now < b.t1; },

    // ---- the ground grid, shared with S8.6 (motos): yT = cam.y(1, gd) the street's edge, depth D = 1 + 4z (z 0 = the bottom
    // of the screen, z grows into the distance), y = yT + (H − yT) / D, x = cam.x(1, W/2 + u · 0.7 W / D)
    project(cam, u, z) {
      const yT = cam.y(1, cam.gd), D = 1 + 4 * z;
      return { x: cam.x(1, cam.W / 2 + u * 0.7 * cam.W / D), y: yT + (cam.H - yT) / D };
    },

    // ---- automatic quality: slow frames lower the caps (lasers, stars, rings, grid lines); fast frames bring them back
    // S10.1: the app's ONE governor (AMB.quality, end of js/motion.js) decides; its own frame watch of S8.5 is gone (haut 1, moyen 0.6, bas 0.3)
    budget() {
      if (!this.auto || !AMB.quality) return;
      this.q = [1, 0.6, 0.3][AMB.quality.level] || 1;
    },
    cost(ms) { this.times.push(ms); if (this.times.length > 240) this.times.shift(); },
    stats() {
      const a = this.times.slice().sort((x, y) => x - y), n = a.length;
      return { avg: n ? a.reduce((s, v) => s + v, 0) / n : 0, p95: n ? a[Math.max(0, Math.floor(n * 0.95) - 1)] : 0, lasers: this.lasers.length, stars: this.stars.length, waves: this.waves.length, q: this.q };
    },
    set(o) { if (o.q != null) this.q = clamp(o.q, 0.3, 1); if (o.auto != null) this.auto = !!o.auto; },
    reset() { this.lasers.length = 0; this.stars.length = 0; this.waves.length = 0; this.pending.length = 0; this.sweep = null; this.blackout = null; this.kick = 0; this.grid.flash = 0; this.tint.a = 0; this.lastStar = { player: -99, machine: -99 }; this.lastDeg = null; },

    // ---- cached sprites (by colour): a beam (soft glow across, fading along) and a white core
    spr: new Map(),
    beam(col, core) {
      const key = (core ? 'c' : 'g') + col.join();
      let c = this.spr.get(key); if (c) return c;
      c = document.createElement('canvas'); c.width = 32; c.height = 256;
      const x = c.getContext('2d'), across = x.createLinearGradient(0, 0, 32, 0);
      const cc = core ? [255, 255, 255] : col;
      across.addColorStop(0, rgba(cc, 0)); across.addColorStop(core ? 0.35 : 0.2, rgba(cc, core ? 0.6 : 0.18)); across.addColorStop(0.5, rgba(cc, 1)); across.addColorStop(core ? 0.65 : 0.8, rgba(cc, core ? 0.6 : 0.18)); across.addColorStop(1, rgba(cc, 0));
      x.fillStyle = across; x.fillRect(0, 0, 32, 256);
      x.globalCompositeOperation = 'destination-in';
      const along = x.createLinearGradient(0, 256, 0, 0); along.addColorStop(0, 'rgba(0,0,0,1)'); along.addColorStop(0.5, 'rgba(0,0,0,0.55)'); along.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = along; x.fillRect(0, 0, 32, 256);
      this.spr.set(key, c); return c;
    },
    skyGrad(col) {
      const key = 's' + col.join(); let c = this.spr.get(key); if (c) return c;
      c = document.createElement('canvas'); c.width = 1; c.height = 64;
      const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.55, rgba(col, 0.25)); g.addColorStop(1, rgba(col, 0.75));
      x.fillStyle = g; x.fillRect(0, 0, 1, 64); this.spr.set(key, c); return c;
    },
    front(col) {
      const key = 'f' + col.join(); let c = this.spr.get(key); if (c) return c;
      c = document.createElement('canvas'); c.width = 64; c.height = 1;
      const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.8, rgba(col, 0.9)); g.addColorStop(0.92, 'rgba(255,255,255,1)'); g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g; x.fillRect(0, 0, 64, 1); this.spr.set(key, c); return c;
    },
    // a pixel cloud, its underside lit in `col` (seen from the street, a city's light thrown up)
    cloud(col, px, seed) {
      const key = 'k' + col.join() + '|' + px + '|' + seed; let c = this.spr.get(key); if (c) return c;
      const cw = 44, ch = 12; c = document.createElement('canvas'); c.width = cw * px; c.height = ch * px;
      const x = c.getContext('2d'); let r = seed * 7919 + 1; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
      const bot = new Array(cw).fill(-1);
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
        const d = ((i - cw / 2) / (cw / 2)) ** 2 + ((j - 7) / (j < 7 ? 6.5 : 4.5)) ** 2 + 0.3 * Math.sin(i * 0.6 + seed) * (j < 6 ? 1 : 0);
        if (d < 1 && rnd() < 0.93) { x.fillStyle = 'rgba(22,10,40,0.92)'; x.fillRect(i * px, j * px, px, px); bot[i] = Math.max(bot[i], j); }
      }
      for (let i = 0; i < cw; i++) if (bot[i] >= 0) { // the lit underside: the last two rows of each column
        x.fillStyle = rgba(mix(col, 0.35), 1); x.fillRect(i * px, bot[i] * px, px, px);
        x.fillStyle = rgba(col, 0.55); x.fillRect(i * px, (bot[i] - 1) * px, px, px);
      }
      this.spr.set(key, c); return c;
    },
  };

  // ---- the world: the music's dimensions (S8.6 reads world.music.level), the power cut of a RATÉ
  GV.addDim('music.level', { tau: 0.5, at: 'musique : intensité (notes, grosse caisse) — S8.5', aim: () => CM.tick() });
  GV.addDim('music.kick', { tau: 0, at: 'musique : grosse caisse (retombe en 0,3 s)', aim: () => CM.kick });
  GV.addDim('music.bass', { tau: 0, at: 'musique : éclat de la dernière note de basse', aim: () => CM.bass });
  const P0 = GV.DIMS.power;
  if (P0) GV.addDim('power', { at: P0.at + ' ; RATÉ : coupure d\'une demi-seconde (S8.5)', get tau() { return CM.blackout ? (CM.out() ? 0 : 0.35) : P0.tau; }, aim: (c) => (CM.out() ? 0 : P0.aim(c)) });
  Object.defineProperty(GV, 'grid', { configurable: true, get() { return CM.gridInfo; } });

  // ---- the layers. Each measures its own cost (CM.stats()).
  const timed = (f) => function (g, w, cam, v) { const t0 = performance.now(); f(g, w, cam, v); CM.cost_ += performance.now() - t0; };
  // the sky (z 5, over the sky, under the stars): the chord's tint sweeping across, the clouds lit from below
  GV.addLayer({ id: 'music-sky', z: 5, draw: timed((g, w, cam, v) => {
    CM.cost_ = 0;
    const t = CM.tint, W = cam.W, gd = cam.y(1, cam.gd), now = CM.now, still = CM.still(), pk = GV.featK.pad || 0;
    if (t.a < 0.01 || pk < 0.01) return; // S9.3: the sky takes the chord's colour once the Pad is heard
    g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true;
    const sw = CM.sweep, e = sw && sw.dur ? ease(clamp((now - sw.t0) / sw.dur)) : 1;
    let x0 = 0, x1 = W; // the new tint covers [x0, x1]; the old one the rest
    if (e < 1) { if (sw.dir > 0) x1 = e * W * 1.15; else x0 = W - e * W * 1.15; }
    const kOff = (CM.out() ? 0.15 : 1) * pk, A = Math.min(1, t.a) * 0.55 * kOff;
    if (t.prev && e < 1) { g.globalAlpha = Math.min(1, t.prevA || 0.22) * 0.55 * kOff; const sp = CM.skyGrad(t.prev); if (sw.dir > 0) g.drawImage(sp, Math.max(0, x1), 0, W - Math.max(0, x1), gd); else g.drawImage(sp, 0, 0, Math.min(W, x0), gd); }
    g.globalAlpha = A; g.drawImage(CM.skyGrad(t.col), Math.max(0, x0), 0, Math.max(0, Math.min(W, x1) - Math.max(0, x0)), gd);
    if (e < 1) { // the front of the sweep: the tint brighter towards its leading edge, a thin bright line on it
      const fw = W * 0.22, lead = sw.dir > 0 ? x1 : x0, sp = CM.skyGrad(t.col), k = (1 - e * 0.6) * kOff;
      for (let j = 0; j < 4; j++) { const xa = sw.dir > 0 ? lead - fw * (4 - j) / 4 : lead + fw * j / 4; g.globalAlpha = Math.min(1, 0.25 * (j + 1) * k); g.drawImage(sp, Math.round(xa), 0, Math.ceil(fw / 4), gd); }
      g.globalAlpha = 0.9 * k; g.drawImage(CM.skyGrad(mix(t.col, 0.6)), Math.round(lead - cam.px / 2), 0, Math.max(1, cam.px), gd);
    }
    g.imageSmoothingEnabled = false; g.globalCompositeOperation = 'source-over';
    // the clouds, lit from below by the chord (dark otherwise): only as lit as the tint
    const px = cam.px, T = still ? 0 : v.st, n = Math.max(2, Math.round(4 * CM.q)), span = W * 1.3;
    for (let i = 0; i < n; i++) {
      const c = CM.cloud(t.col, px * 2, i + 1), lit = clamp(t.a), within = !sw || e >= 1 || (sw.dir > 0 ? (i + 0.5) / n < e : (i + 0.5) / n > 1 - e);
      const x = (((i * 0.31 + 0.07) * span + T * px * (3 + i)) % span) - W * 0.15, y = gd * (0.1 + 0.11 * i);
      g.globalAlpha = (within ? lit : 0.25) * 0.9 * kOff; g.drawImage(c, Math.round(x), Math.round(y));
    }
    g.globalAlpha = 1;
  }) });
  // shooting stars (z 12): a white head and a fading trail across the upper sky
  GV.addLayer({ id: 'music-stars', z: 12, draw: timed((g, w, cam) => {
    if (!CM.stars.length) return;
    const W = cam.W, H = cam.H, now = CM.now, px = cam.px, core = CM.beam([255, 255, 255], true);
    g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true;
    for (const s of CM.stars) {
      const age = now - s.t0; if (age < 0) continue;
      const k = age / s.dur, x = (s.x + s.vx * age) * W, y = (s.y + s.vy * age) * H * 0.6, a = Math.sin(Math.PI * clamp(k)), len = Math.min(W * 0.22, W * 0.4 * Math.min(1, age * 3));
      const an = Math.atan2(s.vy * H * 0.6, s.vx * W) + Math.PI / 2; // the sprite points up: rotate so its top trails behind
      g.setTransform(Math.cos(an), Math.sin(an), -Math.sin(an), Math.cos(an), x, y);
      g.globalAlpha = a; g.drawImage(core, -px * 1.5, 0, px * 3, len);
      g.setTransform(1, 0, 0, 1, 0, 0);
      const gl = GV.glow(s.col, Math.round(px * 5)); g.globalAlpha = a * 0.9; g.drawImage(gl, x - gl.width / 2, y - gl.height / 2);
      g.fillStyle = '#ffffff'; g.fillRect(Math.round(x - px / 2), Math.round(y - px / 2), px, px);
    }
    g.imageSmoothingEnabled = false; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }) });
  // the ground grid (z 32, over the street, under the towers): lines to the horizon, rows scrolling on the beat
  GV.addLayer({ id: 'music-grid', z: 32, draw: timed((g, w, cam) => {
    const G = CM.grid, W = cam.W, H = cam.H, hz = cam.y(1, cam.gd); if (hz >= H - 2) return;
    const rows = Math.max(4, Math.round(8 * CM.q)), cols = Math.max(6, Math.round(12 * CM.q)), ph = G.phase, ZF = 4; // rows: z step 1/rows, up to z = ZF
    CM.gridInfo = { project: (u, z) => CM.project(cam, u, z), phase: ph, rows, cols, flash: G.flash };
    const bk = GV.featK.bass || 0; // S9.3: the grid is the Bass's: it unrolls from us to the horizon when the bass is heard
    const base = (0.07 + 0.05 * G.base) * (0.5 + 0.5 * (w.play == null ? 1 : w.play)), a = (base + 0.55 * G.flash) * (CM.out() ? 0.1 : 1) * Math.min(1, bk * 1.5);
    if (a < 0.01) return;
    const lw = Math.max(1, Math.round(cam.px * (0.35 + 0.35 * G.flash)));
    g.globalCompositeOperation = 'lighter'; g.lineWidth = lw;
    // the lines running to the horizon (u step 2/cols)
    g.strokeStyle = rgba([255, 63, 164], a); g.beginPath();
    for (let i = -2 * cols; i <= 2 * cols; i++) { const u = i * 2 / cols, p0 = CM.project(cam, u, 0), p1 = CM.project(cam, u, bk >= 1 ? 60 : 0.02 + 60 * bk ** 3); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); }
    g.stroke();
    // the rows (z step 1/rows), one per beat, coming towards us; brighter near us
    for (let i = 1; i <= rows * ZF * bk; i++) {
      const z = (i - ph) / rows; if (z <= 0) continue;
      const p = CM.project(cam, 0, z), aa = a * 1.3 / (1 + z) ** 1.7; // (S8.8: the far rows fade: no bright slab at the horizon)
      g.fillStyle = rgba(G.flash > 0.3 ? [255, 120, 210] : [255, 63, 164], aa); g.fillRect(0, Math.round(p.y), W, lw);
    }
    if (bk > 0.95) { g.fillStyle = rgba([63, 240, 255], Math.min(1, a * 1.6)); g.fillRect(0, Math.round(hz), W, lw); } // the horizon line
    g.globalCompositeOperation = 'source-over';
  }) });
  // the ring of the kick (z 34): an ellipse of light running over the ground from the street's centre
  GV.addLayer({ id: 'music-wave', z: 34, draw: timed((g, w, cam) => {
    if (!CM.waves.length) return;
    const W = cam.W, H = cam.H, hz = cam.y(1, cam.gd), cx = W / 2 + cam.ox, now = CM.now, px = cam.px;
    g.globalCompositeOperation = 'lighter';
    for (const wv of CM.waves) {
      const k = (now - wv.t0) / wv.dur; if (k < 0 || k > 1) continue;
      const e = ease(k), rx = e * W * 0.85, ry = e * (H - hz) * 1.25, a = Math.min(1, wv.a) * (1 - k);
      g.beginPath(); g.ellipse(cx, hz, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI);
      g.strokeStyle = rgba(wv.col, a * 0.22); g.lineWidth = px * 5; g.stroke();
      g.strokeStyle = rgba(mix(wv.col, 0.5), a * 0.9); g.lineWidth = Math.max(1, px * 0.8); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
  }) });
  // the lasers (z 46, over the towers and their sparks): one beam per note from its building's roof
  GV.addLayer({ id: 'music-lasers', z: 46, draw: timed((g, w, cam, v) => {
    if (!CM.lasers.length) return;
    const now = CM.now, still = CM.still(), J = Math.min(2, CM.juice()), px = cam.px, len = Math.hypot(cam.W, cam.H) * 1.15, off = CM.out();
    if (off) return;
    g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true;
    const kJ = 0.5 + 0.5 * Math.min(1, J) + 0.2 * Math.max(0, J - 1);
    for (const L of CM.lasers) {
      if (now < L.t0) continue;
      const age = now - L.t0, env = (age < 0.06 && !still ? 1.35 : 1) * (now > L.t1 ? 1 - (now - L.t1) / L.rel : 1);
      if (env <= 0) continue;
      const p = L.plant && v.plants.find((qq) => qq.id === L.plant);
      const x = p ? p.sx : cam.W / 2, y = p ? p.sy - p.vis * p.k : cam.y(1, cam.gd);
      const an = L.ang + (still ? 0 : Math.sin(v.st * 2.2 + L.ph) * 0.035 * J), c = Math.cos(an), s = Math.sin(an);
      const wg = px * 9 * L.w * kJ * (still ? 0.8 : 1), wc = Math.max(1, px * 1.4 * L.w * (0.6 + 0.4 * kJ)), A = Math.min(1, L.a * env * kJ);
      g.setTransform(c, s, -s, c, x, y);
      g.globalAlpha = A; g.drawImage(CM.beam(L.col, false), -wg / 2, -len, wg, len);
      g.globalAlpha = Math.min(1, A * 1.1); g.drawImage(CM.beam(L.col, true), -wc / 2, -len, wc, len);
      g.setTransform(1, 0, 0, 1, 0, 0);
      const R = Math.round(px * (3 + 4 * L.w)), gl = v.glow(L.hot, R); g.globalAlpha = A; g.drawImage(gl, x - gl.width / 2, y - gl.height / 2); // the emitter
    }
    g.imageSmoothingEnabled = false; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }) });
  // the power cut of a RATÉ (z 78, under the post filters): the city goes dark, flickers back
  GV.addLayer({ id: 'music-blackout', z: 78, draw: timed((g, w, cam) => {
    const b = CM.blackout; if (!b) return;
    const now = CM.now, still = CM.still(); if (now < b.t0) return;
    let a;
    if (now < b.t1) a = still ? 0.55 : (now - b.t0 < 0.12 ? (Math.floor((now - b.t0) * 40) % 2 ? 0.3 : 0.75) : 0.75);
    else { const k = (now - b.t1) / 0.6; a = (1 - k) * 0.5 * (still ? 1 : (Math.floor(k * 14) % 3 ? 1 : 0.2)); }
    if (a <= 0.01) return;
    g.fillStyle = `rgba(2,1,6,${clamp(a).toFixed(3)})`; g.fillRect(0, 0, cam.W, cam.H);
  }) });
  GV.afterDraw((cv, w, info) => { CM.cost(CM.cost_ || 0); CM.budget(info); });
  CM.gridInfo = null;

  if (AMB.bus) CM.listen(AMB.bus);
  AMB.cityMusic = CM;
})();
