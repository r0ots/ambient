// « Jardin » (G11.2) : a visual mode of the screen, the showcase of what the player has grown. Purely visual (never
// earns, never writes the store or the game state).
//   - one plant per UNLOCKED sound layer (tree node below), in a fixed order, spread evenly over the ground;
//   - it reacts to its own notes (bus `note` / `perc` / `grain` / `chord`): pulse of light + a leaf that pops out;
//   - its height = the share of the tree nodes of its layer that are unlocked (a node belongs to a layer when one of
//     its settings does: `<layer>.*`, js/tree.js);
//   - rare plants (glowing crystals) = secrets found, on the ground between two plants.
// Mode policy (wraps AMB.visual, visual.js is untouched): « Jardin » exists only in the Parcours, where it is the
// default (own preference key ambient.vizMode.path); in free mode (or mode not chosen) the cycle, the stored choice
// (ambient.vizMode) and the drawing are exactly the classic ones. Without this file the app is unchanged.
// Perf: LED sprites pre-rendered in offscreen canvases (cache by species / size / pixel size), cached
// background and labels, real dt, nothing drawn while the tab is hidden or the canvas off screen, reduced motion =
// no sway nor particles. stats() gives the cost per frame (ms).
(function () {
  const AMB = (window.AMB = window.AMB || {});

  const LAYERS = [
    { id: 'drone', node: 'racine', label: 'Drone', short: 'Drone', col: [111, 159, 216], kind: 'reed' },
    { id: 'pad', node: 'h.pad', label: 'Pad', short: 'Pad', col: [212, 150, 210], kind: 'bush' },
    { id: 'bells', node: 'm.bells', label: 'Mélodie', short: 'Mélo', col: [255, 196, 110], kind: 'bell' },
    { id: 'texture', node: 'e.texture', label: 'Texture', short: 'Text.', col: [120, 210, 200], kind: 'fern' },
    { id: 'grains', node: 'm.grains', label: 'Grains', short: 'Grain', col: [111, 207, 159], kind: 'puff' },
    { id: 'seq', node: 'c.seq', label: 'Séquence', short: 'Séq.', col: [255, 150, 71], kind: 'vine' },
    { id: 'bass', node: 'c.rythme', label: 'Basse', short: 'Basse', col: [127, 159, 224], kind: 'cactus' },
    { id: 'perc', node: 'c.rythme', label: 'Pulsations', short: 'Puls.', col: [255, 90, 60], kind: 'shroom' },
  ];
  const byLayer = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

  // ---- tiny deterministic helpers (never Math.random: positions and shapes depend only on the state) ----
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rgb = (c, k = 1, a = 1) => `rgba(${Math.min(255, Math.round(c[0] * k))},${Math.min(255, Math.round(c[1] * k))},${Math.min(255, Math.round(c[2] * k))},${a})`;
  const hsl2rgb = (h, s, l) => { const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };

  // ---- state → layout (pure) ----
  // state = {layers: [ids], levels: {layer: 0..1}, secrets: [ids]}
  function layout(st, W, H) {
    const ids = LAYERS.map((l) => l.id).filter((id) => (st.layers || []).includes(id));
    const n = ids.length, ground = Math.round(H * 0.74);
    const slotW = (W * 0.9) / Math.max(1, n);
    const plants = ids.map((id, i) => {
      const r = mulberry(hash('plant:' + id));
      const lv = Math.max(0, Math.min(1, +((st.levels || {})[id]) || 0));
      return {
        id, kind: byLayer[id].kind, col: byLayer[id].col, label: byLayer[id].label, short: byLayer[id].short, level: lv,
        x: Math.round(W * 0.05 + slotW * (i + 0.5) + (r() - 0.5) * slotW * 0.3),
        y: ground + Math.round((r() - 0.5) * H * 0.02), phase: r() * 6.283, rare: false,
      };
    });
    const sec = (st.secrets || []).slice().sort();
    const rares = sec.map((id) => {
      const r = mulberry(hash('secret:' + id));
      return { id: 'secret:' + id, kind: 'crystal', rare: true, level: 0, col: hsl2rgb(Math.floor(r() * 360), 0.85, 0.7), x: Math.round(W * 0.05 + slotW * (Math.floor(r() * (n + 1)) + (r() - 0.5) * 0.3)), y: ground, phase: r() * 6.283 }; // between two plants, on the ground
    });
    return { plants, rares, ground, slotW };
  }

  // ---- sprites: plants drawn as LED dot matrices (1 cell = px device pixels, 1 px gap) ----
  const CW = 25; // sprite width in cells (stem at column 12)
  function cells(kind, hC, seed) {
    const r = mulberry(seed), out = []; // [x, y (0 = base), tone]  tone: 0 stem, 1 leaf, 2 light, 4 dot
    const put = (x, y, t) => { if (x >= 0 && x < CW && y >= 0) out.push([x, y, t]); };
    const C = 12;
    if (kind === 'bush') {
      for (let y = 0; y < Math.max(2, hC * 0.25); y++) put(C, y, 0);
      const cy = hC * 0.55, rx = Math.min(11, 4 + hC * 0.22), ry = hC * 0.42;
      for (let y = 0; y <= hC; y++) for (let x = 0; x < CW; x++) {
        const d = ((x - C) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (d < 1 && r() < 0.86) put(x, y, d < 0.35 && r() < 0.3 ? 2 : 1);
      }
    } else if (kind === 'cactus') {
      const w = hC > 30 ? 2 : 1;
      for (let y = 0; y < hC; y++) for (let x = -w; x <= w; x++) put(C + x, y, x === 0 && y % 3 === 0 ? 2 : 1);
      const arms = hC > 18 ? 2 : hC > 10 ? 1 : 0;
      for (let a = 0; a < arms; a++) {
        const s = a ? 1 : -1, y0 = Math.round(hC * (0.35 + 0.15 * a)), len = Math.round(hC * 0.35);
        for (let x = 1; x <= 4; x++) put(C + s * (w + x), y0, 1);
        for (let y = 0; y < len; y++) put(C + s * (w + 4), y0 + y, 1);
      }
    } else if (kind === 'shroom') {
      const caps = 1 + Math.min(2, Math.floor(hC / 18));
      for (let k = 0; k < caps; k++) {
        const x0 = C + (k === 0 ? 0 : k === 1 ? -6 : 6), h = Math.round(hC * (k ? 0.55 : 0.85)), w = Math.max(2, Math.round(h * 0.28));
        for (let y = 0; y < h; y++) put(x0, y, 0);
        for (let y = 0; y <= w; y++) for (let x = -w * 2 + y; x <= w * 2 - y; x++) put(x0 + x, h + y, y === 0 ? 2 : (x + y) % 4 === 0 ? 4 : 1);
      }
    } else if (kind === 'puff') {
      let x = C;
      for (let y = 0; y < hC; y++) { put(Math.round(x), y, 0); x += (r() - 0.5) * 0.5; }
      const R = Math.min(8, 2 + hC * 0.13);
      for (let a = 0; a < 40; a++) { const t = (a / 40) * 6.283, rr = R * (0.6 + 0.4 * r()); put(Math.round(x + Math.cos(t) * rr), Math.round(hC + Math.sin(t) * rr), r() < 0.4 ? 2 : 1); }
      for (let y = 2; y < hC * 0.6; y += 4) put(C + (y % 8 ? 1 : -1), y, 1);
    } else if (kind === 'fern') {
      for (let f = -2; f <= 2; f++) {
        let x = C, len = hC * (1 - Math.abs(f) * 0.18);
        for (let y = 0; y < len; y++) {
          x += f * 0.22 * (y / len) * 1.6; put(Math.round(x), y, 0);
          if (y > 2 && y % 2 === 0) { put(Math.round(x) - 1, y + 1, 1); put(Math.round(x) + 1, y + 1, 1); if (y % 4 === 0) { put(Math.round(x) - 2, y + 2, 1); put(Math.round(x) + 2, y + 2, 1); } }
        }
      }
    } else if (kind === 'vine') {
      for (let y = 0; y < hC; y++) {
        const x = Math.round(C + Math.sin(y * 0.35) * 3); put(x, y, 0);
        if (y % 5 === 2) { const s = Math.sin(y * 0.35) > 0 ? 1 : -1; put(x + s, y, 1); put(x + 2 * s, y + 1, 1); put(x + s, y + 1, 2); }
      }
      for (let y = 0; y < hC; y++) put(C - 6 + (y % 2), y, y % 4 ? 3 + 9 : 0); // trellis (tone 12 = dim)
    } else if (kind === 'crystal') {
      const h = hC;
      for (let y = 0; y < h; y++) { const w = Math.round((y < h * 0.6 ? y / (h * 0.6) : (h - y) / (h * 0.4)) * 3); for (let x = -w; x <= w; x++) put(C + x, y, x === 0 || y === Math.round(h * 0.6) ? 2 : 1); }
      put(C - 4, 1, 1); put(C - 4, 2, 1); put(C - 5, 1, 1); put(C + 4, 1, 1); put(C + 5, 1, 1); put(C + 4, 2, 2);
    } else { // reed (drone) and bell (melody): a stem with leaves
      let x = C;
      for (let y = 0; y < hC; y++) {
        put(Math.round(x), y, 0); x += (r() - 0.5) * 0.35;
        if (y > 1 && y < hC - 3 && r() < 0.28) { const s = r() < 0.5 ? -1 : 1, L = 2 + Math.floor(r() * (kind === 'reed' ? 5 : 3)); for (let k = 1; k <= L; k++) put(Math.round(x) + s * k, y + Math.floor(k * (kind === 'reed' ? 0.9 : 0.5)), 1); }
      }
      if (kind === 'reed') { for (let y = 0; y < 4; y++) { put(Math.round(x), hC + y, 2); put(Math.round(x) + 1, hC + y, 1); } }
      else { const X = Math.round(x); for (let y = 0; y < 4; y++) for (let k = -(1 + (y >> 1)); k <= 1 + (y >> 1); k++) put(X + k, hC + 3 - y, y === 0 ? 2 : 1); put(X, hC - 1, 2); }
    }
    return out;
  }

  const gv = {
    LAYERS, byLayer, layout, cells, hash,
    sprites: new Map(), glows: new Map(), labels: new Map(),
    plants: [], rares: [], parts: [], pending: [],
    energy: {}, // plant id -> 0..1 pulse
    visible: true, paused: false, reduced: false,
    times: [], frames: 0, cacheMisses: 0,
    clock: () => (AMB.engine && AMB.engine.ctx ? AMB.engine.ctx.currentTime : performance.now() / 1000),
    now: () => performance.now(),

    // ---- read the game / secrets state; a layer's level = share of its tree nodes owned ----
    layerNodes(id) { const T = AMB.tree; return T ? T.NODES.filter((n) => n.params.some((p) => p.startsWith(id + '.'))).map((n) => n.id) : []; },
    readState() {
      const g = AMB.game, st = { layers: [], levels: {}, secrets: [] };
      if (!g || !g.s) return st;
      const own = g.s.nodes || [];
      st.layers = LAYERS.filter((l) => own.includes(l.node)).map((l) => l.id);
      for (const l of LAYERS) {
        const ns = this.layerNodes(l.id);
        st.levels[l.id] = ns.length ? ns.filter((n) => own.includes(n)).length / ns.length : 0;
      }
      const sq = g.s.secrets && g.s.secrets.found;
      st.secrets = sq ? Object.keys(sq).filter((k) => sq[k]) : [];
      return st;
    },
    signature(st) { return JSON.stringify([st.layers, st.levels, st.secrets.slice().sort()]); },

    // ---- sizes ----
    // The tallest plant stays under the stage HUD (chord + « D Lydien · 66 bpm » line, top left) and the tool chips (top
    // right): `ceil` = fraction of the canvas they cover (measured, 0.3 without a DOM). A sprite is at most ~1.1 × its
    // height in cells + 4 (heads, caps), hence `hMax`; heights stay comparable between plants (same scale for all).
    cellPx(W, H, n, avail = H * 0.52) { return Math.max(2, Math.min(Math.floor(avail / 68), Math.floor((W * 0.9) / Math.max(1, n) / 22))); },
    heightCells(p) { if (p.rare) return 9; const M = this.hMax || 58, m = Math.min(16, Math.round(M * 0.35)); return Math.round(m + (M - m) * p.level); },
    ceilFrac() {
      try {
        const c = this.observed, ch = document.getElementById('chordName'), info = document.getElementById('hudInfo'), tools = document.querySelector('.stage-tools');
        const r = c && c.getBoundingClientRect();
        if (!r || !r.height || !ch) return 0.3;
        let b = ch.getBoundingClientRect().bottom;
        if (info) { const cs = getComputedStyle(info); b += (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.fontSize) || 12) * 1.3; } // even while empty
        if (tools) b = Math.max(b, tools.getBoundingClientRect().bottom);
        return Math.max(0.12, Math.min(0.5, (b - r.top) / r.height + 0.03));
      } catch (e) { return 0.3; }
    },

    sprite(p, px) {
      const hC = this.heightCells(p), key = `${p.kind}|${p.id}|${hC}|${px}`;
      let s = this.sprites.get(key);
      if (s) return s;
      this.cacheMisses++;
      const cl = cells(p.kind, hC, hash(p.id));
      let top = 0; for (const c of cl) top = Math.max(top, c[1]);
      const Hc = top + 1, cv = document.createElement('canvas');
      cv.width = CW * px; cv.height = Hc * px;
      const g = cv.getContext('2d'), gap = px >= 4 ? 1 : 0, col = p.col;
      const tones = [rgb(col, 0.55), rgb(col, 0.85), rgb(col, 1.25), 'rgb(255,214,236)', 'rgb(255,233,168)'];
      for (const [x, y, t] of cl) { g.fillStyle = t === 12 ? 'rgba(107,74,26,0.55)' : tones[t]; g.fillRect(x * px, (Hc - 1 - y) * px, px - gap, px - gap); }
      s = { cv, w: cv.width, h: cv.height, hC: Hc };
      this.sprites.set(key, s);
      if (this.sprites.size > 96) this.sprites.delete(this.sprites.keys().next().value);
      return s;
    },
    glow(col, R) {
      const key = col.join() + '|' + R;
      let s = this.glows.get(key);
      if (s) return s;
      const cv = document.createElement('canvas'); cv.width = cv.height = R * 2;
      const g = cv.getContext('2d'), grd = g.createRadialGradient(R, R, 0, R, R, R);
      grd.addColorStop(0, rgb(col, 1, 0.55)); grd.addColorStop(0.4, rgb(col, 1, 0.18)); grd.addColorStop(1, rgb(col, 1, 0));
      g.fillStyle = grd; g.fillRect(0, 0, R * 2, R * 2);
      this.glows.set(key, cv);
      return cv;
    },
    // « MÉLODIE » under the plant; « MÉLO » when it does not fit its slot (phone)
    label(p, fs, maxW) {
      const full = p.label.toUpperCase(), key = full + '|' + fs + '|' + Math.round(maxW);
      let s = this.labels.get(key);
      if (s) return s;
      const cv = document.createElement('canvas'), g = cv.getContext('2d'), font = `${fs}px VT323, "IBM Plex Mono", monospace`;
      g.font = font;
      const lines = [g.measureText(full).width + 4 <= maxW ? full : p.short.toUpperCase()];
      const w = Math.ceil(Math.max(...lines.map((t) => g.measureText(t).width))) + 4;
      cv.width = w; cv.height = Math.ceil(fs * 1.05 * lines.length + fs * 0.2);
      g.font = font; g.textBaseline = 'top'; g.textAlign = 'center'; g.fillStyle = '#b38a4f';
      lines.forEach((t, i) => g.fillText(t, w / 2, i * fs * 1.05));
      this.labels.set(key, cv);
      return cv;
    },
    background(W, H, ground) {
      const key = W + 'x' + H + '|' + ground;
      if (this.bg && this.bg.key === key) return this.bg.cv;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'), r = mulberry(7), px = this.px || 3;
      const sky = g.createLinearGradient(0, 0, 0, ground);
      sky.addColorStop(0, '#0b0a08'); sky.addColorStop(1, '#17120b');
      g.fillStyle = sky; g.fillRect(0, 0, W, ground);
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,179,71,${0.08 + r() * 0.18})`; g.fillRect(Math.floor(r() * W / px) * px, Math.floor(r() * ground * 0.7 / px) * px, px - 1, px - 1); }
      g.fillStyle = '#120d07'; g.fillRect(0, ground, W, H - ground);
      for (let y = ground; y < H; y += px) for (let x = 0; x < W; x += px) {
        const v = r(); if (v < 0.22) { g.fillStyle = v < 0.05 ? '#4a3316' : '#2a1d0e'; g.fillRect(x, y, px - 1, px - 1); }
      }
      g.fillStyle = 'rgba(255,179,71,0.35)'; g.fillRect(0, ground, W, Math.max(1, px >> 1));
      this.bg = { key, cv };
      return cv;
    },

    // ---- state refresh (events + a cheap 1 s signature check, e.g. after a save import) ----
    refresh(W, H, force) {
      const st = this.readState(), ceil = this.ceilFrac(), sig = this.signature(st) + W + 'x' + H + '|' + ceil.toFixed(3);
      if (!force && sig === this.sig) { this.lastCheck = this.now(); return false; }
      this.sig = sig; this.state = st;
      const L = layout(st, W, H);
      this.plants = L.plants; this.rares = L.rares; this.ground = L.ground; this.slotW = L.slotW;
      const avail = Math.max(H * 0.2, this.ground - H * ceil);
      this.px = this.cellPx(W, H, this.plants.length, avail);
      this.hMax = Math.max(12, Math.min(58, Math.floor((avail / this.px - 4) / 1.1)));
      this.ceil = ceil;
      this.W = W; this.H = H; this.lastCheck = this.now();
      return true;
    },

    // ---- events: queued with their audio time, applied when they sound ----
    onEvent(layer, time, vel) {
      if (!this.running()) return;
      this.pending.push({ layer, time: time || 0, vel: vel == null ? 0.7 : vel });
      if (this.pending.length > 200) this.pending.splice(0, this.pending.length - 200);
    },
    running() { return this.active && this.visible && !this.paused && !(typeof document !== 'undefined' && document.hidden); },
    hit(layer, vel) {
      const p = this.plants.find((q) => q.id === layer);
      if (!p) return false;
      this.energy[layer] = Math.min(1, (this.energy[layer] || 0) * 0.5 + 0.5 + vel * 0.5);
      if (!this.reduced && this.parts.length < 120) {
        const hC = this.heightCells(p), px = this.px, r = this.rng || (this.rng = mulberry(99));
        this.parts.push({ x: p.x + (r() - 0.5) * 8 * px, y: p.y - hC * px * (0.6 + r() * 0.4), vx: (r() - 0.5) * 12 * px, vy: -(8 + r() * 10) * px, life: 1, col: r() < 0.3 ? [255, 233, 168] : p.col, s: r() < 0.5 ? 1 : 2 });
      }
      return true;
    },

    // ---- one frame (called by AMB.visual.draw while the mode is « Jardin ») ----
    frame(g, W, H, dpr = 1) {
      if (!this.running()) { this.lastT = null; return false; }
      const t0 = this.now();
      if (this.sig == null || this.W !== W || this.H !== H || t0 - (this.lastCheck || 0) > 1000) this.refresh(W, H, this.W !== W || this.H !== H);
      const dt = this.lastT == null ? 1 / 60 : Math.min(0.1, (t0 - this.lastT) / 1000);
      this.lastT = t0; this.t = (this.t || 0) + dt;
      const now = this.clock();
      for (let i = this.pending.length - 1; i >= 0; i--) { const e = this.pending[i]; if (e.time <= now + 0.02) { this.pending.splice(i, 1); this.hit(e.layer, e.vel); } }

      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.imageSmoothingEnabled = false;
      g.drawImage(this.background(W, H, this.ground), 0, 0);
      const px = this.px, red = this.reduced, fs = Math.round(Math.max(11 * dpr, px * 2.6));
      const all = this.plants.concat(this.rares);
      for (const p of all) {
        const s = this.sprite(p, px), e = this.energy[p.id] || 0;
        const sway = red ? 0 : (Math.sin(this.t * 0.7 + p.phase) * 0.05 + Math.sin(this.t * 1.9 + p.phase * 2) * 0.015) * (1 + e * 1.5);
        const k = red ? 1 : 1 + e * 0.05;
        g.setTransform(k, 0, -sway * k, k, p.x, p.y); // shear from the base: the plant bends, the root stays put
        g.drawImage(s.cv, -s.w / 2, -s.h);
        if (!p.rare) { const lb = this.label(p, fs, this.slotW * 0.96); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.85; g.drawImage(lb, Math.round(p.x - lb.width / 2), Math.round(p.y + px * 1.5)); g.globalAlpha = 1; }
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'lighter';
      for (const p of all) {
        let e = this.energy[p.id] || 0;
        if (p.rare) e = Math.max(e, red ? 0.35 : 0.25 + 0.25 * Math.sin(this.t * 1.3 + p.phase));
        if (e < 0.02) continue;
        const R = Math.max(16, px * (p.rare ? 8 : 12)), gl = this.glow(p.col, R), hC = this.heightCells(p);
        g.globalAlpha = Math.min(1, e);
        g.drawImage(gl, p.x - R, p.y - hC * px * (p.rare ? 0.6 : 0.85) - R);
      }
      g.globalAlpha = 1;
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const q = this.parts[i];
        q.life -= dt * 0.8; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.98; q.vy += 2 * px * dt;
        if (q.life <= 0) { this.parts.splice(i, 1); continue; }
        g.fillStyle = rgb(q.col, 1, q.life * 0.9);
        g.fillRect(Math.round(q.x / px) * px, Math.round(q.y / px) * px, px * q.s - 1, px * q.s - 1);
      }
      g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = true; // nearest-neighbour above: crisp LEDs, cheaper shear
      for (const id in this.energy) this.energy[id] = Math.max(0, this.energy[id] - dt * (red ? 1.2 : 1.6));
      if (!all.length) { g.font = `${fs * 1.3}px VT323, monospace`; g.fillStyle = '#b38a4f'; g.textAlign = 'center'; g.fillText('Débloque une couche pour planter ton jardin', W / 2, H * 0.5); g.textAlign = 'start'; }
      const ms = this.now() - t0;
      this.times.push(ms); if (this.times.length > 240) this.times.shift();
      this.frames++;
      return true;
    },
    stats() {
      const a = this.times.slice().sort((x, y) => x - y), n = a.length;
      return { frames: this.frames, avg: n ? a.reduce((s, v) => s + v, 0) / n : 0, p95: n ? a[Math.floor(n * 0.95) - (n > 1 ? 1 : 0)] : 0, max: n ? a[n - 1] : 0, sprites: this.sprites.size };
    },

    // ---- wiring ----
    attach(canvas) {
      if (this.observed === canvas || !canvas) return;
      this.observed = canvas;
      if (typeof IntersectionObserver !== 'undefined') {
        this.io = new IntersectionObserver((es) => { for (const e of es) this.visible = e.isIntersecting; });
        this.io.observe(canvas);
      }
    },
    listen(bus) {
      bus.on('note', (n) => n && this.onEvent(n.layer, n.time, n.vel));
      bus.on('grain', (n) => n && this.onEvent('grains', n.time, n.vel));
      bus.on('perc', (n) => n && this.onEvent('perc', n.time, n.vel));
      bus.on('chord', (c) => { if (!c) return; this.onEvent('drone', c.time, 0.6); this.onEvent('pad', c.time, 0.3); });
      ['game:unlock', 'game:reset', 'game:secret'].forEach((ev) => bus.on(ev, () => { this.sig = null; }));
    },
  };

  try {
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    gv.reduced = !!(mq && mq.matches);
    if (mq && mq.addEventListener) mq.addEventListener('change', () => { gv.reduced = mq.matches; gv.parts.length = 0; });
  } catch (e) {}
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) { gv.pending.length = 0; gv.lastT = null; } });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => gv.labels.clear());
  }
  AMB.gardenVisual = gv;

  // ---- « Jardin » as a mode of AMB.visual, only in the Parcours ----
  const V = AMB.visual;
  if (!V) return;
  const NAME = 'Jardin', PATH_KEY = 'ambient.vizMode.path';
  const onPath = () => !!(AMB.game && AMB.game.path);
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const pathPref = () => { const m = get(PATH_KEY); return m === NAME || V.MODES.includes(m) ? m : NAME; };
  const freePref = () => { const m = get('ambient.vizMode'); return V.MODES.includes(m) ? m : 'Orbes'; };
  const chip = () => { const el = typeof document !== 'undefined' && document.getElementById('vizMode'); if (el) el.textContent = V.mode; };
  const sync = () => { V.mode = onPath() ? pathPref() : freePref(); chip(); };
  const baseDraw = V.draw, baseCycle = V.cycleMode;
  V.draw = function () {
    gv.active = this.mode === NAME && onPath();
    if (this.mode === NAME && !onPath()) { sync(); }
    if (gv.active && this.c) {
      gv.attach(this.c);
      gv.frame(this.g, this.c.width, this.c.height, this.dpr || 1);
      return;
    }
    return baseDraw.call(this);
  };
  V.cycleMode = function () {
    if (!onPath()) return baseCycle.call(this);
    const L = [NAME, ...this.MODES];
    this.mode = L[(L.indexOf(this.mode) + 1) % L.length];
    try { localStorage.setItem(PATH_KEY, this.mode); } catch (e) {}
    return this.mode;
  };
  V.gardenSync = sync;
  if (onPath()) V.mode = pathPref();
  if (AMB.bus) { AMB.bus.on('game:mode', sync); gv.listen(AMB.bus); }
})();
