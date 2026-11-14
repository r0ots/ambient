// S8.4 « Un réglage = une dimension du monde »: each grand réglage drives one WHOLE dimension of the city (js/garden-visual.js
// world model), visible on the whole screen, and reacts to the GESTURE (how fast the knob turns) as well as to the value.
//   Lumière   → power: the city's current. 0 = blackout (a few windows), 1 = every sign lit, saturated
//               neon (bloom up). Turning it sends a WAVE of lighting / blackout across the city, left to right, at the speed
//               of the gesture (a power FIELD of NC columns: windows switch in cascade, a light snap at the front).
//   Densité   → traffic (S9.3: Densité builds nothing any more — the 22 buildings of the background city are gone; it
//               multiplies what exists: cars per note, inhabitants out, js/city-life.js; `traffic` = their trails).
//   Espace    → the camera: recul (zoom out), depth (parallax: a slow dolly, stronger), fog in layers (2D bands + cityGL
//               fog); the reverb (fx.space × fx.size) = TRAILS of the neons (persistence, a light echo of the last frames).
//   Nostalgie → vhs (fx.tape, fx.lofi): cityGL vhs / chroma / grain, colour grading to magenta-sepia, tracking bands that
//               jump with the gesture.
//   Nature    → weather: clear starry sky at 0 → drizzle → downpour → storm (wind slants the rain, lightning with a cityGL
//               flash, then the visual thunder: a shake), the puddles stronger (S9.3: the wet ground is the Reverb's).
// The other settings (effects, volumes, mutes, tempo, key) each have their reflection: one table, TABLE (setting →
// dimension), read by tests/city-dims.html. Turning fast (> HOT ranges per second) = OVERLOAD: the dimension overshoots
// for ~0.7 s (shake, flash, sparks) then comes back (world.surge[name]).
// Still a reflection: nothing here writes the store or the game; nothing can be touched. Parcours and free mode alike.
// JUICE 0: the dimensions and the waves stay (they are the content), no snap, no overload, no flash. Reduced motion: no
// wave (the power follows at once), no construction (floors at once), no trails, no tracking jumps, no overload.
// Ownership (S8.5 / S8.6 / S8.7): S8.4 sets the BASE levels of cityGL bloom, chroma, fog, vhs, grain (cityGL.set) every
// frame; others add impulses (cityGL.pulse). S8.4 owns the DIMS power, traffic, cam.*, weather.*, vhs, trails, cam.dx;
// world.surge, world.wave.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const gv = AMB.gardenVisual;
  if (!gv) return;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const ih = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const spec = (key) => { const S = AMB.SCHEMA, [s, k] = key.split('.'); return S && S[s] && S[s].params[k]; };
  // a setting now, 0..1 by its range (undefined = the schema default)
  const get = (key) => { const S = AMB.store; let v = S && typeof S.get === 'function' ? S.get(key) : undefined; const sp = spec(key); if (v == null && sp) v = sp.def; if (typeof v === 'boolean') return v ? 1 : 0; if (sp && sp.type === 'select') { const i = sp.options.indexOf(v); return i < 0 ? 0 : i / Math.max(1, sp.options.length - 1); } const lo = sp && sp.min != null ? sp.min : 0, hi = sp && sp.max != null ? sp.max : 1, n = (Number(v) - lo) / ((hi - lo) || 1); return Number.isFinite(n) ? clamp(n) : 0; };

  const MAC = ['light', 'density', 'space', 'nostalgia', 'nature'];
  const HOT = 2.2; // ranges per second: faster = overload
  const NC = 32; // columns of the power field (screen width)
  const COLS = { light: [255, 214, 140], density: [255, 170, 60], space: [120, 220, 255], nostalgia: [255, 90, 190], nature: [190, 170, 255] };

  // ---- THE TABLE: setting → dimension of the world (one reading of what every control does to the city). `dim`: a world
  // path (gv.world, smoothed), `scene:<layer>` (garden-visual SCENE), `look:<aspect>` (each building, LOOK), `speed`.
  const TABLE = [
    { name: 'Lumière', keys: ['macro.light'], dim: 'power', at: 'courant : fenêtres, néons, bloom ; vague d\'allumage au geste' },
    { name: 'Densité', keys: ['macro.density'], dim: 'traffic', at: 'multiplie ce qui existe : voitures par note, habitants dehors (S9.3), traînées' },
    { name: 'Espace', keys: ['macro.space'], dim: 'cam.back', also: ['cam.depth', 'cam.fog'], at: 'caméra : recul, parallaxe, brouillard en couches' },
    { name: 'Nostalgie', keys: ['macro.nostalgia', 'fx.tape', 'fx.lofi'], dim: 'vhs', at: 'bande VHS, chroma, grain, étalonnage magenta-sépia, tracking au geste' },
    { name: 'Nature', keys: ['macro.nature'], dim: 'weather.rain', also: ['weather.wind', 'weather.storm', 'weather.clear'], at: 'ciel clair → bruine → averse → orage, flaques' },
    { name: 'Reverb', keys: ['fx.space', 'fx.size', 'fx.revType', 'fx.predelay'], dim: 'trails', at: 'traînées des néons (persistance)' },
    { name: 'Écho (delay)', keys: ['fx.echo', 'fx.echoTime', 'fx.feedback'], dim: 'scene:echo', at: 'bâtiments fantômes qui se répètent' },
    { name: 'Halo (shimmer)', keys: ['fx.shimmer'], dim: 'scene:aurora', at: 'aurores néon dans le ciel' },
    { name: 'Cassette / Usure', keys: ['fx.tape', 'fx.lofi'], dim: 'vhs', at: 'voir Nostalgie (même dimension)' },
    { name: 'Volumes', keys: ['drone.vol', 'pad.vol', 'bells.vol', 'texture.vol', 'grains.vol', 'seq.vol', 'bass.vol', 'perc.vol', 'global.volume'], dim: 'look:size', at: 'étages de chaque bâtiment (construits / déconstruits)' },
    { name: 'Coupure des couches', keys: ['drone.on', 'pad.on', 'bells.on', 'texture.on', 'grains.on', 'seq.on', 'bass.on', 'perc.on'], dim: 'look:on', at: 'couche coupée : son élément est déconstruit, il n\'en reste rien (S9.3)' },
    { name: 'Tempo', keys: ['global.tempo', 'global.time'], dim: 'speed', at: 'vitesse de toute la scène (pluie, trafic, nuages)' },
    { name: 'Tonalité / gamme', keys: ['global.key'], dim: 'scene:hue', at: 'teinte du ciel (et ciel de chaque accord)' },
  ];

  const D = {
    TABLE, HOT, NC, MAC,
    gest: {}, // macro → {v, t, rate (ranges/s), dir, last}
    surge: {}, // macro → 0..1 (overload, falls in ~0.7 s)
    cols: null, colAim: null, waves: [], // the power field and the lighting waves
    trail: null, // the trails canvas (reverb)
    track: 0, // tracking jump (Nostalgie gesture) 0..1
    thunder: [], prevFlash: 0, ms: [],
    juice() { return gv.JUICE == null ? 1 : +gv.JUICE; },
    live() { return !gv.reduced && this.juice() > 0; },
    mac(m) { return get('macro.' + m); },
    // ---- the gesture: a macro moved by the hand (source user) or by a MIDI CC (its parameters, source cc)
    watch() {
      const S = AMB.store;
      if (!S || S === this.watched || typeof S.on !== 'function') return;
      this.watched = S;
      S.on((k, v, src) => {
        let m = null;
        if (k.startsWith('macro.') && src === 'user') m = k.slice(6);
        else if (src === 'cc') m = this.ofParam(k);
        if (m && MAC.includes(m)) this.gesture(m, get('macro.' + m));
      });
    },
    ofParam(k) {
      const P = AMB.perform && AMB.perform.MACROS; if (!P) return null;
      if (!this.pmap) { this.pmap = {}; for (const mk in P) for (const [pk] of P[mk]) this.pmap[pk] = mk.slice(6); }
      return this.pmap[k] || null;
    },
    gesture(m, v) {
      const now = gv.now() / 1000, G = this.gest[m] || (this.gest[m] = { v, t: -9, rate: 0, dir: 0, last: -9 }), dt = now - G.t;
      if (dt > 0.35 && this.seen[m] != null) G.v = this.seen[m]; // a new gesture starts from the value the city showed
      const dv = v - G.v; if (Math.abs(dv) < 1e-4) return;
      const inst = Math.abs(dv) / Math.max(1 / 120, dt);
      // a new gesture after a pause: a jump counts as done in ~0.12 s; during a gesture: smoothed speed
      G.rate = dt > 0.35 ? Math.min(6, Math.abs(dv) / 0.12) : G.rate * 0.55 + Math.min(8, inst) * 0.45;
      G.v = v; G.t = now; G.dir = Math.sign(dv); G.last = now; G.n = (G.n || 0) + 1;
      this.seen[m] = v;
      if (!gv.running || !gv.running()) return;
      if (m === 'light') this.wave(G, dv);
      if (m === 'nostalgia' && !gv.reduced) { this.track = Math.max(this.track, clamp(0.35 + G.rate / 3)); this.gl('pulse', 'vhs', 0.6 * clamp(G.rate / 2, 0.3, 1.2), 380); }
      if (m === 'space' && this.live()) this.camKick = clamp((this.camKick || 0) + 0.006 * G.dir * clamp(G.rate, 0.3, 3), -0.035, 0.035); // the camera leans with the gesture
      if (G.rate > HOT && this.live()) this.overload(m, G);
    },
    seen: {},
    // the cost of the heavy layers (trails, grading), watched over 40 frames: above SLOW_MS, that layer goes (or simpler)
    // for the session — a software canvas (no GPU) cannot afford them
    slow: {}, costs: {}, SLOW_MS: 2.5, // (the grading is two plain fills: not watched)
    // quick verdict first (the 3 frames after the first two: a software canvas costs ~15 ms there, a GPU one < 0.5 ms),
    // then a sliding check over 40 frames
    cost(name, ms) {
      const c = this.costs[name] || (this.costs[name] = { n: 0, s: 0, q: 0, first: true });
      c.n++;
      if (c.first) { if (c.n > 2) c.q += ms; if (c.n === 5) { c.first = false; if (c.q / 3 > this.SLOW_MS && !this.noSlow) this.slow[name] = true; c.n = 0; } return; }
      if (c.n > 5) c.s += ms;
      if (c.n >= 45) { if (c.s / 40 > this.SLOW_MS && !this.noSlow) this.slow[name] = true; c.n = 0; c.s = 0; }
    },
    // ---- Lumière: a wave sweeps the power field from the left, at the gesture's speed (screen widths / s)
    wave(G, dv) {
      const target = this.powerTarget(this.lastC), speed = clamp(0.45 + 0.9 * G.rate, 0.45, 4.5), w = this.waves[this.waves.length - 1];
      if (gv.reduced) { this.waves.length = 0; return; }
      if (w && w.x < 0.12 && w.dir === Math.sign(dv)) { w.target = target; w.speed = Math.max(w.speed, speed); w.amp = Math.max(w.amp, Math.abs(dv)); return; }
      this.waves.push({ x: -0.02, i: 0, speed, target, dir: Math.sign(dv), amp: Math.abs(dv), t0: gv.t || 0 });
      if (this.waves.length > 5) this.waves.shift();
      if (this.juice() > 0) this.gl('pulse', 'bloom', 0.5 * Math.min(1, 4 * Math.abs(dv) + 0.2) * (dv > 0 ? 1 : 0.4), 260);
    },
    overload(m, G) {
      const J = Math.min(2, this.juice()), first = (this.surge[m] || 0) < 0.3;
      this.surge[m] = 1;
      if (!first) return;
      this.gl('pulse', 'shake', 0.55 * J, 420); this.gl('pulse', 'flash', 0.18 * J, 180);
      gv.shake = { t0: gv.t || 0, amp: 0.7 * J };
      if (m === 'nature') { gv.impulse('flash', 1); gv.bolt = { x: 0.2 + 0.6 * ih(G.n, 5), seed: G.n | 0 }; this.thunder.push({ t: (gv.t || 0) + 0.25, a: 1 }); }
      if (m === 'nostalgia') this.track = 1;
      // sparks across the city in the setting's colour
      const W = gv.W || 0, H = gv.H || 0, px = gv.px || 3, r = mulberry(G.n * 7 + 3), n = Math.round(26 * J);
      for (let i = 0; i < n && gv.parts.length < (gv.PARTS_MAX || 260); i++) gv.parts.push({ x: W * (0.05 + 0.9 * r()), y: (gv.ground || H * 0.76) * (0.35 + 0.55 * r()), vx: (r() - 0.5) * 30 * px, vy: -(10 + r() * 22) * px, life: 1, decay: 1.1, g: 18, col: r() < 0.4 ? [255, 250, 230] : COLS[m], s: r() < 0.3 ? 2 : 1 });
    },
    gl(fn, name, a, ms) { const G = AMB.cityGL; if (G && G[fn]) G[fn](name, a, ms); },

    // ---- per frame (called first by the power dimension, before every other one)
    step(c) {
      this.watch(); this.lastC = c;
      for (const m of MAC) this.seen[m] = this.mac(m);
      const t = gv.t || 0, dt = Math.min(0.1, Math.max(0, t - (this.tLast == null ? t : this.tLast))); this.tLast = t; this.dt = dt;
      for (const m in this.surge) { this.surge[m] = Math.max(0, this.surge[m] - dt / 0.7); }
      this.track = Math.max(0, this.track - dt / 0.45);
      this.camKick = (this.camKick || 0) * Math.exp(-dt / 0.6);
      // the power field
      const target = this.powerTarget(c);
      if (!this.cols) { this.cols = new Float32Array(NC).fill(target); this.colAim = new Float32Array(NC).fill(target); }
      if (gv.reduced) { this.waves.length = 0; this.cols.fill(target); this.colAim.fill(target); return; }
      if (!this.waves.length) this.colAim.fill(target);
      for (let k = this.waves.length - 1; k >= 0; k--) {
        const w = this.waves[k]; w.x += w.speed * dt;
        while (w.i < NC && (w.i + 0.5) / NC <= w.x) { this.colAim[w.i] = w.target; w.i++; }
        if (w.i >= NC && w.x > 1.15) this.waves.splice(k, 1);
      }
      const kT = 1 - Math.exp(-dt / 0.06);
      for (let i = 0; i < NC; i++) this.cols[i] += (this.colAim[i] - this.cols[i]) * kT;
    },
    powerTarget(c) {
      const dawn = c ? c.dawn : 0, play = c && c.L && c.L.play != null ? c.L.play : 1;
      return clamp(dawn + (1 - dawn) * (0.03 + 0.97 * this.mac('light')) * (0.62 + 0.38 * play));
    },
    colAt(f) { if (!this.cols) return gv.world.power || 0.5; const i = clamp(Math.floor(f * NC), 0, NC - 1); return this.cols[i]; },
    meanPower() { if (!this.cols) return 0.5; let s = 0; for (let i = 0; i < NC; i++) s += this.cols[i]; return s / NC; },
  };

  // ======================================================================================================================
  // THE DIMENSIONS (re-wired through gv.addDim; S8.1's table keeps its key order: power runs first and steps the frame)
  const sur = (m) => D.surge[m] || 0;
  gv.addDim('power', { tau: 0, at: 'courant (Lumière) : moyenne du champ de courant (vague au geste) ; aube = 1', aim: (c) => { D.step(c); return clamp(D.meanPower() + 0.25 * sur('light')); } });
  gv.addDim('traffic', { tau: 0.8, at: 'trafic (Densité) : voitures volantes et files (dessin S8.6)', aim: (c) => clamp((0.04 + 0.96 * Math.pow(D.mac('density'), 0.9)) * (0.5 + 0.5 * c.L.play) + 0.35 * sur('density'), 0, 1.3) });
  gv.addDim('cam.back', { tau: 0.9, at: 'caméra : recul (Espace ; 1,6 = zoom ×0,74)', aim: () => 1.6 * D.mac('space') + 0.6 * sur('space') });
  gv.addDim('cam.depth', { tau: 0.9, at: 'caméra : profondeur, parallaxe (Espace)', aim: () => 0.1 + 1.9 * D.mac('space') });
  gv.addDim('cam.fog', { tau: 1, at: 'caméra : brouillard (Espace)', aim: () => 0.04 + 0.9 * Math.pow(D.mac('space'), 1.3) });
  // a slow dolly, wider with Espace (parallax by depth), plus the push of an Espace gesture (S8.4 hook in updateWorld)
  gv.addDim('cam.dx', { tau: 0, at: 'caméra : travelling latéral (Espace)', aim: () => (gv.reduced ? 0 : D.mac('space') * 0.05 * Math.sin((gv.st || 0) * 0.13) + (D.camKick || 0)) });
  gv.addDim('trails', { tau: 0.6, at: 'traînées des néons (Reverb × Taille ; Salle Cloud plus longue, Pré-délai un peu moins)', aim: () => get('fx.space') * (0.35 + 0.45 * get('fx.size') + 0.2 * get('fx.revType')) * (1 - 0.3 * get('fx.predelay')) });
  gv.addDim('vhs', { tau: 0.4, at: 'usure VHS (Nostalgie : Cassette, Usure)', aim: () => clamp((0.5 * get('fx.tape') + 0.5 * get('fx.lofi')) / 0.72 + 0.6 * sur('nostalgia'), 0, 1.6) });
  const nat = () => D.mac('nature'), wx = () => (gv.featK && gv.featK.weather) || 0; // S9.4: no weather before Nature is open (and the music heard)
  gv.addDim('weather.rain', { tau: 1, at: 'pluie (Nature) : rien à 0, bruine, averse', aim: (c) => wx() * (1 - c.dawn) * (nat() < 0.04 ? 0 : 0.1 + 0.9 * nat()) });
  gv.addDim('weather.wind', { tau: 1, at: 'vent (Nature, Dérive)', aim: (c) => clamp(0.05 + wx() * 0.85 * Math.pow(nat(), 1.4) + 0.2 * (c.L.clouds || 0) + 0.4 * sur('nature')) });
  gv.addDim('weather.storm', { tau: 1, at: 'orage (Nature haute)', aim: (c) => wx() * (1 - c.dawn) * clamp((nat() - 0.62) / 0.33) });
  gv.addDim('weather.clear', { tau: 1, at: 'ciel clair étoilé (Nature à 0)', aim: (c) => wx() * (1 - c.dawn) * Math.pow(clamp(1 - nat() / 0.45), 2) });

  // ======================================================================================================================
  // THE LAYERS (gv.addLayer)
  // clear sky (z 11): a dense starfield and a milky way when Nature is low
  gv.addLayer({ id: 'dims-clear', z: 11, draw(g, w, cam, v) {
    const a = w.weather.clear || 0; if (a < 0.02) return;
    const W = cam.W, gd = cam.gd, px = cam.px, T = v.reduced ? 0 : v.st;
    const cv = v.fx('dims-stars', W, gd, (ww, h, p2) => {
      const c = v.canvas(ww, h), x = c.getContext('2d'), r = mulberry(211), s = Math.max(1, p2 - 1);
      const band = x.createLinearGradient(0, h * 0.75, ww, 0); band.addColorStop(0, 'rgba(120,90,200,0)'); band.addColorStop(0.5, 'rgba(170,140,255,0.16)'); band.addColorStop(1, 'rgba(120,90,200,0)');
      x.fillStyle = band; x.fillRect(0, 0, ww, h * 0.8);
      for (let i = 0; i < ww * h / (p2 * p2 * 90); i++) { const xx = r() * ww, yy = r() * h * 0.8, b = r(); x.fillStyle = b < 0.1 ? '#fff4d6' : b < 0.2 ? '#bff6ff' : `rgba(230,220,255,${(0.25 + 0.5 * r()).toFixed(2)})`; x.fillRect(Math.floor(xx / p2) * p2, Math.floor(yy / p2) * p2, s, s); }
      return c;
    });
    g.setTransform(1, 0, 0, 1, cam.ox + cam.pan * W * 0.05, cam.oy); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, a);
    g.drawImage(cv, 0, 0);
    const r = mulberry(97); g.fillStyle = '#ffffff'; // a few bright stars that twinkle
    for (let i = 0; i < 14; i++) { const x = Math.floor(r() * W / px) * px, y = Math.floor(r() * gd * 0.7 / px) * px; g.globalAlpha = a * (0.55 + 0.45 * Math.sin(T * (1 + r() * 2) + i)); g.fillRect(x - px, y, 3 * px - 1, px - 1); g.fillRect(x, y - px, px - 1, 3 * px - 1); }
  } });
  // storm clouds (z 12): a dark rolling ceiling, lit from inside by the lightning
  gv.addLayer({ id: 'dims-storm', z: 12, draw(g, w, cam, v) {
    const rain = w.weather.rain || 0, st = w.weather.storm || 0, a = clamp(rain * 0.5 + st * 0.6); if (a < 0.03) return;
    const W = cam.W, gd = cam.gd, T = v.reduced ? 0 : v.st;
    const cv = v.fx('dims-cloud', W, gd, (ww, h) => {
      const c = v.canvas(Math.ceil(ww / 6), Math.ceil(h * 0.5 / 6)), x = c.getContext('2d'), r = mulberry(303);
      const grd = x.createLinearGradient(0, 0, 0, c.height); grd.addColorStop(0, 'rgba(10,6,22,0.95)'); grd.addColorStop(1, 'rgba(30,14,44,0)'); x.fillStyle = grd; x.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 40; i++) { const cx = r() * c.width, cy = c.height * (0.2 + 0.6 * r()), R = c.height * (0.2 + 0.3 * r()), gg = x.createRadialGradient(cx, cy, 0, cx, cy, R); gg.addColorStop(0, 'rgba(36,20,56,0.8)'); gg.addColorStop(1, 'rgba(36,20,56,0)'); x.fillStyle = gg; x.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
      return c;
    });
    const off = ((T * W * 0.01 * (0.3 + 2 * (w.weather.wind || 0))) % W + W) % W;
    g.setTransform(1, 0, 0, 1, cam.ox, cam.oy); g.imageSmoothingEnabled = true; g.globalAlpha = Math.min(1, a);
    g.drawImage(cv, off, 0, W, gd * 0.5); g.drawImage(cv, off - W, 0, W, gd * 0.5);
    const fl = (w.pulse.flash || 0) * Math.min(1, D.juice());
    if (fl > 0.05 && !v.reduced) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, fl * 0.6); g.drawImage(cv, off, 0, W, gd * 0.5); g.drawImage(cv, off - W, 0, W, gd * 0.5); g.fillStyle = 'rgba(120,80,255,0.14)'; g.fillRect(0, 0, W, gd * 0.45); }
    g.imageSmoothingEnabled = false;
  } });
  // fog in layers (z 22 behind the background city, z 27 in front of it, z 36 at the foot of the towers): Espace
  const fogBand = (z, depth, hK, aK, id) => gv.addLayer({ id, z, draw(g, w, cam, v) {
    const f = w.cam.fog || 0, a = f * aK; if (a < 0.03) return;
    const W = cam.W, gd = cam.gd, T = v.reduced ? 0 : v.st, bh = Math.round(gd * hK);
    const cv = v.fx('dims-fog', W, gd, () => {
      const c = v.canvas(96, 32), x = c.getContext('2d'), r = mulberry(404), grd = x.createLinearGradient(0, 0, 0, 32);
      grd.addColorStop(0, 'rgba(40,12,70,0)'); grd.addColorStop(0.6, 'rgba(48,16,84,0.6)'); grd.addColorStop(1, 'rgba(26,8,52,0.35)'); // S8.8: dark haze, not a milky veil x.fillStyle = grd; x.fillRect(0, 0, 96, 32);
      for (let i = 0; i < 16; i++) { const cx = r() * 96, cy = 10 + r() * 16, R = 6 + r() * 10, gg = x.createRadialGradient(cx, cy, 0, cx, cy, R); gg.addColorStop(0, 'rgba(120,50,170,0.3)'); gg.addColorStop(1, 'rgba(120,50,170,0)'); x.fillStyle = gg; x.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
      return c;
    });
    const off = ((T * W * 0.006 * depth * (0.5 + 1.5 * (w.weather.wind || 0)) + cam.pan * depth * W) % W + W) % W, y = Math.round(cam.y(depth, gd) - bh * 0.85);
    g.setTransform(1, 0, 0, 1, cam.ox, cam.oy); g.imageSmoothingEnabled = true; g.globalAlpha = Math.min(1, a);
    g.drawImage(cv, off, y, W, bh); g.drawImage(cv, off - W, y, W, bh); g.imageSmoothingEnabled = false;
  } });
  fogBand(22, 0.4, 0.34, 0.75, 'dims-fog-far'); fogBand(27, 0.6, 0.3, 0.6, 'dims-fog-mid'); fogBand(36, 1, 0.22, 0.45, 'dims-fog-near');

  // the downpour (z 61, over the S8.1 rain): long streaks, slanted by the wind, when Nature is past the drizzle
  gv.addLayer({ id: 'dims-rain', z: 61, draw(g, w, cam, v) {
    const k = clamp(((w.weather.rain || 0) - 0.4) / 0.6); if (k < 0.03) return;
    const W = cam.W, H = cam.H, px = cam.px, T = v.st, n = Math.round(k * 160 * clamp(W / (v.dpr || 1) / 1000, 0.5, 2.2)), slant = 0.1 + 0.6 * (w.weather.wind || 0), r = mulberry(717);
    g.setTransform(1, 0, 0, 1, cam.ox, cam.oy); g.lineWidth = Math.max(1, Math.round(px * 0.4)); g.strokeStyle = 'rgba(190,200,255,0.32)'; g.globalAlpha = Math.min(1, 0.4 + 0.6 * k);
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const x0 = r() * W, y0 = r() * H, L = px * (8 + 10 * r()), vv = H * (1.1 + 0.6 * r()), d = y0 + T * vv, y = (d % (H + L)) - L, x = ((x0 - d * slant) % W + W) % W;
      g.moveTo(x, y); g.lineTo(x - L * slant, y + L);
    }
    g.stroke();
  } });
  // puddles and stronger reflections (z 31, on the wet street): S9.3 the wet ground is the Reverb's; Nature's rain adds to it
  gv.addLayer({ id: 'dims-puddles', z: 31, draw(g, w, cam, v) {
    const wet = (v.featK.reverb || 0) * clamp(0.3 + (w.weather.rain || 0) * 0.9); if (wet < 0.05) return;
    const W = cam.W, H = cam.H, px = cam.px, T = v.reduced ? 0 : v.st, sgd = cam.y(1, cam.gd);
    g.globalCompositeOperation = 'lighter';
    for (const p of v.plants) { // the lights of each building, reflected, rippling
      if (!p.vis) continue;
      const s = v.sprite(p, px), rk = p.k, dx = v.reduced ? 0 : Math.sin(T * 2.3 + p.x * 0.05) * px;
      g.globalAlpha = Math.min(1, 0.55 * wet * (0.3 + 0.7 * (w.power || 0)) * (p.look ? p.look.on : 1));
      g.setTransform(rk, 0, 0, -rk * 0.8, p.sx + dx, p.sy + px * rk); g.drawImage(s.em, 0, s.h - p.vis, s.w, p.vis, -s.w / 2, -p.vis, s.w, p.vis);
    }
    g.setTransform(1, 0, 0, 1, cam.ox, cam.oy);
    const r = mulberry(606), n = Math.round(3 + 9 * wet), cols = [[255, 63, 164], [63, 240, 255], [255, 179, 71]];
    for (let i = 0; i < n; i++) { // puddles: flat neon pools, shimmering
      const x = r() * W, y = sgd + (H - sgd) * (0.12 + 0.8 * r()), pw = W * (0.04 + 0.08 * r()) * (0.5 + 0.5 * wet), ph = Math.max(px, (H - sgd) * 0.025), c = cols[i % 3];
      g.globalAlpha = Math.min(1, wet * (0.2 + 0.12 * Math.sin(T * 3 + i))); g.fillStyle = rgba(c, 0.6);
      g.fillRect(Math.round(x - pw / 2), Math.round(y), Math.round(pw), Math.round(ph));
      g.globalAlpha *= 1.6; g.fillRect(Math.round(x - pw * 0.3), Math.round(y), Math.round(pw * 0.6), Math.max(1, px >> 1));
    }
  } });
  // the power wave (z 41, over the towers): each building as the power where it stands (the field), the front's snap
  // the blackout veil (z 39, behind the towers): the whole background goes dark with the current (sky glow, far city,
  // fog, street), column by column with the wave
  gv.addLayer({ id: 'dims-dark', z: 39, draw(g, w, cam) {
    if (!D.cols) return;
    const W = cam.W, H = cam.H, cw = W / NC;
    g.fillStyle = '#030108';
    for (let i = 0; i < NC;) { // runs of columns at the same darkness: one rect each
      const d = Math.round(clamp((0.42 - D.cols[i]) / 0.42) * 12) / 12; let j = i + 1;
      while (j < NC && Math.round(clamp((0.42 - D.cols[j]) / 0.42) * 12) / 12 === d) j++;
      if (d > 0.02) { g.globalAlpha = 0.75 * d; g.fillRect(Math.floor(i * cw), 0, Math.ceil((j - i) * cw) + 1, H); }
      i = j;
    }
  } });
  gv.addLayer({ id: 'dims-power', z: 41, draw(g, w, cam, v) {
    const W = cam.W, px = cam.px, P = w.power || 0, applied = clamp((0.45 - P) / 0.45) * 0.7; // garden-visual's own cut
    for (const p of v.plants) {
      if (!p.vis || !p.k) continue;
      const loc = D.colAt(clamp(p.sx / W)), want = Math.pow(clamp((0.55 - loc) / 0.5), 0.8) * 0.96, dark = want > applied ? 1 - (1 - want) / (1 - applied) : 0, lift = loc - P;
      if (dark < 0.03 && lift < 0.03) continue;
      const s = v.sprite(p, px), sy0 = s.h - p.vis;
      g.setTransform(p.k, 0, 0, p.k, p.sx, p.sy);
      if (dark >= 0.03) {
        g.globalAlpha = Math.min(1, dark); g.drawImage(s.dk, 0, sy0, s.w, p.vis, -s.w / 2, -p.vis, s.w, p.vis);
        if (want > 0.5) { // a blackout: only a few windows still lit (always the same ones), the red beacons
          g.globalAlpha = Math.min(1, 1.2 * want); g.fillStyle = rgba(p.col.map((c) => c + (255 - c) * 0.5), 0.9); const gap = px >= 4 ? 1 : 0;
          for (const [x, y] of s.wins) if (y >= sy0 && ih(x * 7 + 3, y) < 0.07) g.fillRect(x - s.w / 2, y - s.h, px - gap, px - gap);
        }
      } else { g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, lift * 1.3); g.drawImage(s.em, 0, sy0, s.w, p.vis, -s.w / 2, -p.vis, s.w, p.vis); g.globalCompositeOperation = 'source-over'; }
    }
    g.globalAlpha = 1;
    if (!D.waves.length || D.juice() <= 0) return;
    const gd = cam.y(1, cam.gd), J = Math.min(2, D.juice());
    g.setTransform(1, 0, 0, 1, cam.ox, cam.oy); g.globalCompositeOperation = 'lighter';
    for (const wv of D.waves) { // the front: a column of light (on) or a red-violet cut (off), sparks along it
      if (wv.x < 0 || wv.x > 1.05) continue;
      const x = wv.x * W, bw = Math.max(3 * px, W * 0.025), a = Math.min(1, (0.25 + 1.4 * wv.amp) * J * 0.6), col = wv.dir > 0 ? [255, 236, 190] : [190, 80, 255];
      const gl = v.fx('dims-front', 1, 1, () => { const c = v.canvas(32, 4), x2 = c.getContext('2d'), grd = x2.createLinearGradient(0, 0, 32, 0); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.75, 'rgba(255,255,255,0.8)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); x2.fillStyle = grd; x2.fillRect(0, 0, 32, 4); return c; });
      g.imageSmoothingEnabled = true; g.globalAlpha = a * 0.5; g.drawImage(gl, Math.round(x - bw * 0.75), 0, Math.round(bw), Math.round(gd));
      g.globalAlpha = a; g.fillStyle = rgba(col, 0.9); g.fillRect(Math.round(x), Math.round(gd * 0.15), Math.max(1, px >> 1), Math.round(gd * 0.85));
      g.imageSmoothingEnabled = false;
      if (gv.parts.length < 220 && ih(Math.floor((v.t || 0) * 60), 77) < 0.6 * J) gv.parts.push({ x, y: gd * (0.3 + 0.65 * ih(Math.floor((v.t || 0) * 90), 3)), vx: (wv.dir > 0 ? 1 : -1) * 8 * px, vy: -8 * px, life: 0.7, decay: 1.6, g: 25, col, s: 1 });
    }
  } });
  // trails (z 78, before the post filters): the light of the last frames, kept where it is brighter than now (reverb of
  // the light). A small buffer (1/4) multiplied by itself every frame: dim things (sky, walls)
  // vanish at once, bright neon fades over a few frames — only the lights leave trails. Its cost is watched: too slow
  // (software canvas) → off for the session (D.slow).
  gv.addLayer({ id: 'dims-trails', z: 78, draw(g, w, cam, v) {
    const a = w.trails || 0, cv = g.canvas;
    const QF = AMB.quality ? AMB.quality.fx() : 1; // S10.1: half the persistence at moyen, no trails at bas
    if (a * QF < 0.04 || v.reduced || !cv || D.slow.trails) { D.trail = null; return; }
    const t0 = performance.now(), tw = Math.max(1, Math.round(cv.width / 4)), th = Math.max(1, Math.round(cv.height / 4));
    if (!D.trail || D.trail.width !== tw || D.trail.height !== th) D.trail = gv.canvas(tw, th);
    const T = D.trail, x = T.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true; g.globalCompositeOperation = 'lighten'; g.globalAlpha = Math.min(1, (0.2 + 0.5 * a) * QF);
    g.drawImage(T, 0, 0, cv.width, cv.height);
    const k60 = (D.dt || 1 / 60) * 60; x.imageSmoothingEnabled = false; x.globalCompositeOperation = 'multiply'; x.globalAlpha = Math.min(1, (1.15 - a) * k60); x.drawImage(T, 0, 0);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.fillStyle = `rgba(0,0,0,${Math.min(1, (0.3 - 0.22 * a) * k60).toFixed(3)})`; x.fillRect(0, 0, tw, th); // even pure white fades (a few frames)
    x.globalCompositeOperation = 'lighten'; x.globalAlpha = 1; x.imageSmoothingEnabled = true; x.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, tw, th);
    g.imageSmoothingEnabled = false;
    D.cost('trails', performance.now() - t0);
  } });
  // VHS grading and tracking (z 79): magenta-sepia colour, washed blacks; tracking bands jump with the gesture
  gv.addLayer({ id: 'dims-vhs', z: 79, draw(g, w, cam, v) {
    const a = clamp(((w.vhs || 0) - 0.3) / 0.7), W = cam.W, H = cam.H, px = cam.px; // the default Nostalgie: no grading
    if (a > 0.02) { // magenta-sepia: a warm magenta multiply, then washed blacks (two plain fills: cheap on any canvas)
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.5 * a; g.fillStyle = '#ffa8c0'; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 0.1 * a; g.fillStyle = '#3a1834'; g.fillRect(0, 0, W, H); // (S8.8: blacks barely lifted)
    }
    const tk = D.track; if (tk < 0.03 || v.reduced || !g.canvas) return;
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    const r = mulberry(Math.floor((v.t || 0) * 24)), n = 2 + Math.round(4 * tk), cv = g.canvas;
    for (let i = 0; i < n; i++) { // a strip of the picture torn sideways, with its noise line
      const y = Math.round(r() * H / px) * px, h = Math.max(px, Math.round(r() * H * 0.06 * tk / px) * px), dx = Math.round((r() - 0.5) * W * 0.08 * tk);
      g.drawImage(cv, 0, y, W, h, dx, y, W, h);
      g.globalAlpha = 0.6 * tk; g.fillStyle = i % 2 ? 'rgba(240,240,255,0.7)' : 'rgba(255,60,120,0.6)'; g.fillRect(0, y, W, Math.max(1, px >> 1)); g.globalAlpha = 1;
    }
  } });

  // ======================================================================================================================
  // after each frame: the WebGL look follows the world (base levels), the lightning gives a flash then the thunder
  gv.afterDraw((canvas, w, info) => {
    const t0 = performance.now(), G = AMB.cityGL, t = gv.t || 0;
    const fl = w.pulse.flash || 0;
    if (fl > D.prevFlash + 0.2 && (w.weather.storm || 0) > 0.02) { D.gl('pulse', 'flash', 0.25 + 0.4 * w.weather.storm, 200); D.thunder.push({ t: t + 0.2 + 0.4 * ih(Math.floor(t), 1), a: w.weather.storm }); }
    D.prevFlash = fl;
    for (let i = D.thunder.length - 1; i >= 0; i--) { const th = D.thunder[i]; if (th.t <= t) { D.thunder.splice(i, 1); if (D.live()) { D.gl('pulse', 'shake', 0.5 * th.a, 600); gv.shake = { t0: t, amp: 0.5 * th.a * Math.min(2, D.juice()) }; } } }
    if (G && G.set) {
      const P = clamp(w.power || 0, 0, 1.3), vh = w.vhs || 0;
      G.set('bloom', 0.35 + 1.25 * P + 0.6 * sur('light') + 0.3 * (w.weather.storm || 0));
      const old = clamp((vh - 0.3) / 0.7, 0, 1.6); // the default Nostalgie (~0.3) = the clean S8.2 look; worn, still readable
      G.set('chroma', 0.35 + 0.8 * old);
      G.set('vhs', 0.85 * old);
      G.set('grain', 0.2 + 0.5 * old);
      G.set('fog', 0.85 * (w.cam.fog || 0) + 0.15 * (w.weather.rain || 0));
    }
    D.ms.push(performance.now() - t0); if (D.ms.length > 120) D.ms.shift();
  });

  // what a dimension reads now, for the TABLE (tests, combos): world path, scene layer, look aspect, speed
  D.read = function (dim) {
    if (dim === 'speed') return gv.speed || 0;
    if (dim.startsWith('scene:')) return (gv.layers() || {})[dim.slice(6)] || 0;
    if (dim.startsWith('look:')) { const a = gv.look(gv.getter()), k = dim.slice(5); let s = 0, n = 0; for (const id in a) { s += a[id][k]; n++; } return n ? s / n : 0; }
    const i = dim.indexOf('.'), w = gv.world; return +(i < 0 ? w[dim] : (w[dim.slice(0, i)] || {})[dim.slice(i + 1)]) || 0;
  };
  gv.world.surge = D.surge;
  Object.defineProperty(gv.world, 'wave', { get: () => (D.waves.length ? D.waves[D.waves.length - 1].x : null), enumerable: true });
  AMB.cityDims = D;
})();
