// S8.6 « La vie de la ville » (AMB.cityLife): what lives in the city of js/garden-visual.js — flying cars in lanes, a
// rare advertising zeppelin, Tron light-cycles on the ground grid, little pixel people who arrive, go to work, come
// home, wait under the lamps and run in the storm, giant advertising holograms (koi, face, « JUNOJUNO ») and their
// searchlights. A pure reflection: nothing here can be touched, nothing writes the store or the game.
//
// It only READS the world (gv.world): `traffic` (how many cars), `population` (how many people, holograms), `play`,
// `power`, `dawn`, `speed` (tempo), `beat`, `pulse.*`, `weather.*`, and `music.level` / `music.kick` when S8.5 gives them
// (else it estimates the loudness from the buildings' note energy). The dimensions are driven elsewhere (S8.1, S8.4).
// Layers (gv.addLayer, back to front): `life-beams` 25 (searchlights), `life-bikes` 33 (light-cycles, on the S8.5 grid
// z 32), `life-holo` 36 (holograms behind the towers), `traffic-back` 38 (far lane, zeppelin), `life-people` 42 (people,
// small lamps, in front of the towers), `traffic` 50 (replaces S8.1's traffic: the two near lanes).
// Budget: every entity comes from a pool made once (no allocation per frame); caps per kind (smaller on a phone), and a
// quality factor `q` that drops when the life costs more than 2 ms a frame. Reduced motion: everything stands still.
// JUICE scales the goofy bits (nods, jumps, surges on the beat, tight turns, glitches); 0 = they keep moving, plainly.
(function () {
  const A = window.AMB = window.AMB || {}, GV = A.gardenVisual;
  if (!GV || !GV.addLayer) return;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const ih = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // ---- tables ----
  const CAP = { cars: 18, bikes: 4, people: 24, holos: 2, trail: 8 }; // desktop; a phone (≤ 600 css px wide) ~half
  const LANES = [ // flying-car lanes: depth (parallax and size), height (share of the sky above the street), direction, cap
    { d: 0.55, yf: 0.3, dir: 1, cap: 7, s: 1.5, v: 0.045, back: true },
    { d: 0.82, yf: 0.48, dir: -1, cap: 6, s: 2.2, v: 0.06 },
    { d: 1.1, yf: 0.64, dir: 1, cap: 5, s: 3.2, v: 0.08 },
  ];
  const DAY = 48; // s of play = one day: the first half is the morning (they go to work), the second the evening
  const COLS = [[95, 240, 255], [255, 84, 196], [255, 196, 92], [157, 107, 255]]; // car windows / neon trims
  const HOLO = ['koi', 'face', 'logo'];
  const FONT = { J: ['...#', '...#', '...#', '#..#', '.##.'], U: ['#..#', '#..#', '#..#', '#..#', '.##.'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
    O: ['.##.', '#..#', '#..#', '#..#', '.##.'], E: ['####', '#...', '###.', '#...', '####'], S: ['.###', '#...', '.##.', '...#', '###.'],
    L: ['#...', '#...', '#...', '#...', '####'], '*': ['#..#', '.##.', '####', '.##.', '#..#'], ' ': ['....', '....', '....', '....', '....'] };
  // people, facing right, 5 × 9 cells: h hat / hair, f face, c coat, t neon trim, v visor, l legs (3 leg rows: walk A, walk B, stand)
  const PEOPLE = [
    { body: ['.hhh.', 'hhhhh', '..ff.', '.ccc.', '.ctcc', '.ctc.', '.ccc.', '.ccc.'], coat: '#3b2c66', trim: '#5ff0ff' }, // trench coat
    { body: ['.....', '.hhh.', '.hff.', '.ccc.', '.cccc', '.ctc.', '.ccc.', '.c.c.'], coat: '#2a3350', trim: '#ff54c4', umbrella: true }, // umbrella
    { body: ['.hhh.', '.vvv.', '..ff.', '.ccc.', '.cccc', '.ttt.', '.ccc.', '.ccc.'], coat: '#30254a', trim: '#ffc45c', dog: true }, // visor + robot dog
    { body: ['.hhh.', 'hhff.', 'hhff.', 'hccc.', '.cccc', '.ctc.', '.cccc', 'ccccc'], coat: '#4a2350', trim: '#ff3f8e' }, // long coat
  ];
  const LEGS = [['.l.l.', 'l...l'], ['..l..', '.l.l.'], ['.l.l.', '.l.l.']];
  const DOG = [['....dd', '....de', 'ddddd.', 'd.d.d.'], ['....dd', '....de', 'ddddd.', '.d.d.d']];
  const UMB = ['..uuu..', '.uuuuu.', 'uuuuuuu', '...s...'];

  // ---- state: pools made once ----
  const L = {
    made: 0, f: -1, t: 0, day: 0.05, party: 0, ad: 0, adT: -9, chords: 0, q: 1, cost: 0, beatPh: 0, sec: 0, fresh: {}, growing: {},
    cars: [], bikes: [], people: [], zep: { on: false, x: 0, next: 25 }, spots: new Float32Array(16), nSpots: 0, doors: new Float32Array(16), doorId: [], nDoors: 0,
    spawnT: 0, carT: [0, 0, 0], W: 0, H: 0, px: 0, cache: {}, loud: 0, lay: {},
  };
  const make = (o) => { L.made++; return o; };
  LANES.forEach((ln, li) => { for (let i = 0; i < ln.cap; i++) L.cars.push(make({ lane: li, i, x: (i + 0.5 * ih(i, li)) / ln.cap, on: false, out: false, col: (i + li) % COLS.length, seed: ih(li * 31, i) * 6.28 })); });
  for (let i = 0; i < CAP.bikes; i++) L.bikes.push(make({ on: false, fade: 0, u: 0, z: 0, dir: 0, v: 0, col: [255, 255, 255], cs: '#fff', turn: 0, flare: 0, tr: new Float32Array(2 * CAP.trail), tn: 0, th: 0, lu: 0, lz: 0 }));
  for (let i = 0; i < CAP.people; i++) L.people.push(make({ on: false, st: 0, x: 0, tx: 0, tm: 0, v: 1, vr: i % PEOPLE.length, dir: 1, ph: ih(i, 5) * 6.28, row: ih(i, 9), job: null, jump: 0 }));
  const S_OFF = 0, S_WALK = 1, S_WAIT = 2, S_WORK = 3, S_IN = 4, S_HOME = 5, S_LEAVE = 6;

  const J = () => clamp(+GV.JUICE || 0, 0, 2);
  const phone = (v) => (v.W || 1) / (v.dpr || 1) <= 600;
  const caps = (v) => { const k = (phone(v) ? 0.55 : 1) * L.q; return { cars: k, people: Math.round(CAP.people * k), bikes: Math.max(1, Math.round(CAP.bikes * Math.min(1, k + 0.2))) }; };

  // ======================================================================================================================
  // SPRITES (cached per cell size; rebuilt only when the city's cell size changes)
  function pix(rows, cs, pal, flip) {
    const h = rows.length, w = rows[0].length, c = canvas(w * cs, h * cs), x = c.getContext('2d');
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const ch = rows[j][flip ? w - 1 - i : i], col = pal[ch]; if (col) { x.fillStyle = col; x.fillRect(i * cs, j * cs, cs, cs); } }
    return c;
  }
  function peopleSheet(cs) { // [variant][frame 0..2][dir 0 right, 1 left]
    return PEOPLE.map((p) => [0, 1, 2].map((f) => [false, true].map((fl) => {
      const rows = p.body.concat(LEGS[f]);
      return pix(rows, cs, { h: '#1a1030', f: '#f0c49a', c: p.coat, t: p.trim, v: p.trim, l: '#140c22' }, fl);
    })));
  }
  function carSprite(cs, col, flip) {
    const c = 'rgb(' + col.join(',') + ')';
    return pix(['..bbbb...', 'bbwwwwbbh', 'rbbbbbbbb', '.gg...gg.'], cs, { b: '#2b2340', w: c, h: '#fff6e0', r: '#ff3348', g: c }, flip);
  }
  function trailSprite(rgbA, rgbB) { const c = canvas(64, 1), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, 'rgba(' + rgbA + ',0)'); g.addColorStop(1, 'rgba(' + rgbB + ',0.55)'); x.fillStyle = g; x.fillRect(0, 0, 64, 1); return c; }
  function textStrip(str, cs, col) {
    const w = str.length * 5, c = canvas(w * cs, 5 * cs), x = c.getContext('2d'); x.fillStyle = col;
    for (let k = 0; k < str.length; k++) { const g = FONT[str[k]] || FONT[' ']; for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) if (g[j][i] === '#') x.fillRect((k * 5 + i) * cs, j * cs, cs, cs); }
    return c;
  }
  function zeppelin(cs) { // a dark hull with ribs, fins, a gondola; its screen is drawn at run time (scrolling text)
    const W = 44, H = 15, c = canvas(W * cs, H * cs), x = c.getContext('2d');
    for (let j = 0; j < 12; j++) for (let i = 0; i < W; i++) {
      const d = ((i - 21) / 20) ** 2 + ((j - 6) / 6) ** 2; if (d >= 1) continue;
      x.fillStyle = d > 0.8 ? '#5a4a80' : (i % 6 === 0 ? '#2c2244' : '#1e1832'); x.fillRect(i * cs, j * cs, cs, cs);
    }
    x.fillStyle = '#2c2244'; for (let j = 0; j < 5; j++) { x.fillRect((40 + Math.min(3, j)) * cs, (1 + j) * cs, cs, cs); x.fillRect((40 + Math.min(3, j)) * cs, (11 - j) * cs, cs, cs); }
    x.fillStyle = '#140f22'; x.fillRect(17 * cs, 12 * cs, 9 * cs, 2 * cs); x.fillStyle = '#ffc45c'; for (let i = 18; i < 25; i += 2) x.fillRect(i * cs, 12 * cs, cs, cs);
    x.fillStyle = '#05030a'; x.fillRect(9 * cs, 3 * cs, 25 * cs, 7 * cs); // the screen's frame
    return c;
  }
  // a hologram as a grid of lit cells (scanline gap baked in): koi, face (eyes open / closed), the « JUNOJUNO » logo
  function holo(kind, cs, alt) {
    let gw = 40, gh = 36; const cells = [];
    const put = (i, j, col) => cells.push(i, j, col);
    if (kind === 'koi') {
      gw = 44; gh = 26;
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const dy = j - 13 + (alt && i < 10 ? 1 : 0), body = ((i - 24) / 15) ** 2 + (dy / (5.5 - Math.max(0, 14 - i) * 0.25)) ** 2 < 1 && i > 9;
        const tail = i >= 2 && i <= 11 && Math.abs(dy) <= (11 - i) * 0.95 + 1 && Math.abs(dy) >= (11 - i) * 0.35;
        const fin = (i >= 20 && i <= 25 && j >= 18 && j <= 18 + (25 - i) / 2) || (i >= 22 && i <= 27 && j <= 8 && j >= 8 - (27 - i) / 2.5);
        if (i === 34 && j === 11) { put(i, j, 2); continue; }
        if (body) put(i, j, ih(i >> 2, j >> 2) < 0.35 ? 1 : 0); else if (tail || fin) put(i, j, 1);
      }
    } else if (kind === 'face') { // a woman's face, long hair framing it, big eyes (closed in `alt`), red lips
      gw = 36; gh = 42;
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const fx = (i - 18) / 10, fy = (j - 21) / 14, face = fx * fx + fy * fy < 1;
        const hairTop = ((i - 18) / 14) ** 2 + ((j - 15) / 13) ** 2 < 1 && (j < 11 || !face), hairSide = j >= 11 && j < 38 && Math.abs(i - 18) >= 10 && Math.abs(i - 18) <= 15 - (j > 30 ? (j - 30) * 0.4 : 0);
        const eyeRow = j >= 17 && j <= 19, eyeL = i >= 10 && i <= 15, eyeR = i >= 21 && i <= 26;
        const eye = eyeRow && (eyeL || eyeR) && (alt ? j === 19 : true), pupil = !alt && j === 18 && (i === 13 || i === 24);
        const brow = j === 15 && ((i >= 10 && i <= 15) || (i >= 21 && i <= 26)), nose = i === 18 && j >= 21 && j <= 25;
        const lips = (j === 29 && i >= 14 && i <= 22) || (j === 30 && i >= 15 && i <= 21) || (j === 28 && (i === 16 || i === 20 || i === 17 || i === 19));
        if (pupil) put(i, j, 2); else if (eye) put(i, j, alt ? 0 : 2); else if (lips) put(i, j, 1); else if (brow || nose) put(i, j, 0);
        else if (hairTop || hairSide) { if ((i + j) % 2 === 0 || j % 2 === 0) put(i, j, 1); }
        else if (face && (j % 2 === 0 || fx * fx + fy * fy > 0.8)) put(i, j, 0);
        else if (j >= 36 && Math.abs(i - 18) < 4 + (j - 36) * 2) put(i, j, 0);
      }
    } else {
      gw = 46; gh = 30;
      for (let i = 0; i < gw; i++) { put(i, 0, 1); put(i, gh - 1, 1); } for (let j = 0; j < gh; j++) { put(0, j, 1); put(gw - 1, j, 1); }
      const word = 'JUNO';
      for (let line = 0; line < 2; line++) for (let k = 0; k < 4; k++) { const g = FONT[word[k]]; for (let j = 0; j < 5; j++) for (let i = 0; i < 4; i++) if (g[j][i] === '#') for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) put(4 + k * 10 + i * 2 + a, 3 + line * 13 + j * 2 + b, line ? 2 : 0); }
    }
    const pal = kind === 'koi' ? ['#ff8a3d', '#fff0e0', '#05030a'] : kind === 'face' ? ['#5ff0ff', '#ff54c4', '#ffffff'] : ['#ff54c4', '#ffc45c', '#5ff0ff'];
    const c = canvas(gw * cs, gh * cs), x = c.getContext('2d'), gap = cs > 2 ? 1 : 0;
    for (let n = 0; n < cells.length; n += 3) { x.fillStyle = pal[cells[n + 2]]; x.fillRect(cells[n] * cs, cells[n + 1] * cs, cs, cs - gap); }
    return c;
  }
  function beam() { const c = canvas(64, 128), x = c.getContext('2d'), g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, 'rgba(210,235,255,0.6)'); g.addColorStop(1, 'rgba(210,235,255,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(30, 128); x.lineTo(34, 128); x.lineTo(64, 0); x.lineTo(0, 0); x.closePath(); x.fill(); return c; }
  function cone() { const c = canvas(32, 64), x = c.getContext('2d'), g = x.createLinearGradient(0, 64, 0, 0); g.addColorStop(0, 'rgba(95,240,255,0.5)'); g.addColorStop(1, 'rgba(95,240,255,0.04)'); x.fillStyle = g; x.beginPath(); x.moveTo(14, 64); x.lineTo(18, 64); x.lineTo(32, 0); x.lineTo(0, 0); x.closePath(); x.fill(); return c; }
  function sprites(v, gd) {
    const px = v.px || 3, hc = Math.max(2, Math.round(gd * 0.4 / 40)), key = px * 1000 + hc;
    if (L.cache.key === key) return L.cache;
    const cs = Math.max(1, Math.round(px * 1.1));
    L.cache = {
      key, cs, hc, people: peopleSheet(cs),
      dog: [0, 1].map((f) => [false, true].map((fl) => pix(DOG[f], cs, { d: '#9aa2c8', e: '#ff3348' }, fl))),
      umb: COLS.map((col) => pix(UMB, cs, { u: 'rgb(' + col.join(',') + ')', s: '#140c22' })),
      cars: LANES.map((ln) => { const cc = Math.max(1, Math.round(px * ln.s)); return COLS.map((col) => carSprite(cc, col, ln.dir < 0)); }),
      trailR: trailSprite('255,51,72', '255,70,110'), trailW: trailSprite('255,246,224', '255,246,224'),
      zep: zeppelin(Math.max(1, Math.round(px * 1.3))), zcs: Math.max(1, Math.round(px * 1.3)), ztext: textStrip('JUNOJUNO * NEON SOUL * ', Math.max(1, Math.round(px * 1.3)), '#ff54c4'),
      holo: HOLO.map((k) => [holo(k, hc, false), holo(k, hc, true)]), beam: beam(), cone: cone(),
    };
    return L.cache;
  }

  // ======================================================================================================================
  // UPDATE (once per frame, from whichever life layer draws first)
  function loudness(w, v) {
    if (w.music && w.music.level != null) return clamp(+w.music.level);
    let s = 0, n = 0; for (const id in v.energy) { s += v.energy[id]; n++; }
    return clamp((w.play || 0) * (0.3 + 1.4 * (n ? s / n : 0)));
  }
  function doors(v) { // front-row buildings that stand (door = foot of the building), the lamp spots between them
    L.nDoors = 0; L.doorId.length = 0;
    const ps = v.plants, W = v.W || 1;
    for (let i = 0; i < ps.length && L.nDoors < 16; i++) { const p = ps[i]; if (p.row || !(p.vis > 0)) continue; L.doors[L.nDoors] = p.x; L.doorId[L.nDoors] = p.id; L.nDoors++; }
    // spots: halfway between neighbouring doors (sorted by x), plus near both edges
    let n = 0; L.spots[n++] = W * 0.08; L.spots[n++] = W * 0.92;
    for (let i = 0; i < L.nDoors && n < 16; i++) { let best = Infinity; for (let j = 0; j < L.nDoors; j++) { const d = L.doors[j] - L.doors[i]; if (d > 0 && d < best) best = d; } if (best < Infinity) L.spots[n++] = L.doors[i] + best / 2; }
    L.nSpots = n;
  }
  function pickDoor() { // a fresh tower first (just built: its windows have just lit), else any
    let best = -1, bt = -1;
    for (let i = 0; i < L.nDoors; i++) { const f = L.fresh[L.doorId[i]]; if (f != null && L.t - f < 30 && f > bt) { bt = f; best = i; } }
    if (best >= 0 && Math.random() < 0.7) return best;
    return L.nDoors ? Math.floor(Math.random() * L.nDoors) : -1;
  }
  function go(p, st, tx) { p.st = st; p.tx = tx; p.dir = tx >= p.x ? 1 : -1; }
  function goWork(p) { const d = pickDoor(); if (d < 0) return false; p.job = L.doorId[d]; go(p, S_WORK, L.doors[d] + (Math.random() - 0.5) * 4 * (L.px || 3)); return true; }
  function goWait(p) { if (!L.nSpots) return go(p, S_LEAVE, p.x < (L.W || 1) / 2 ? -0.06 * L.W : 1.06 * L.W); go(p, S_WAIT, L.spots[Math.floor(Math.random() * L.nSpots)] + (Math.random() - 0.5) * 6 * (L.px || 3)); p.tm = -1; }

  function update(w, cam, v) {
    const red = v.reduced, dt = red ? 0 : Math.min(0.1, v.dt || 0), W = cam.W, px = cam.px, j = J(), c = caps(v);
    L.W = W; L.H = cam.H; L.px = px; L.t += dt;
    const loud = L.loud = loudness(w, v), morning = (L.day % 1) < 0.5;
    if (!red) L.day += dt * clamp(w.play || 0) / DAY;
    L.party = Math.max(0, L.party - dt);
    // buildings just finished = fresh (their windows have just lit)
    for (let i = 0; i < v.plants.length; i++) { const p = v.plants[i], g = !!v.grow[p.id]; if (L.growing[p.id] && !g) L.fresh[p.id] = L.t; if (L.growing[p.id] == null && !g && L.t > 0.5) L.fresh[p.id] = L.t; L.growing[p.id] = g; }
    doors(v);
    // the beat: a strong beat asks the bikes for a tight turn (JUICE)
    const b = w.beat || {}, newBeat = b.on && b.ph < L.beatPh; L.beatPh = b.ph || 0;
    if (dt) {
      // ---- cars: target per lane = traffic × cap; one enters per lane at most every 0.5 s, from off screen
      const tr = clamp(w.traffic || 0), sp = (w.speed || 1) * (1 + 0.35 * j * (b.k || 0) + 0.25 * loud);
      for (let li = 0; li < LANES.length; li++) {
        const ln = LANES[li], want = Math.round(tr * ln.cap * c.cars); let on = 0;
        for (let i = 0; i < L.cars.length; i++) { const k = L.cars[i]; if (k.lane === li && k.on && !k.out) on++; }
        L.carT[li] -= dt;
        for (let i = 0; i < L.cars.length; i++) {
          const k = L.cars[i]; if (k.lane !== li) continue;
          if (!k.on) { if (on < want && L.carT[li] <= 0) { k.on = true; k.out = false; k.x = ln.dir > 0 ? -0.12 : 1.12; on++; L.carT[li] = 0.5; } continue; }
          if (!k.out && on > want) { k.out = true; on--; }
          k.x += ln.dir * dt * ln.v * sp * (0.85 + 0.3 * ih(k.i, li));
          if (k.x > 1.15 || k.x < -0.15) { if (k.out || on > want) { k.on = false; k.out = false; } else k.x = ln.dir > 0 ? -0.12 : 1.12; }
        }
      }
      // ---- zeppelin: rare, slow, only in a lived-in city
      const z = L.zep;
      if (z.on) { z.x += dt * 0.012 * (w.speed || 1); if (z.x > 1.3) { z.on = false; z.next = L.t + 40 + 40 * Math.random(); } }
      else if (L.t > z.next && (w.population || 0) > 0.3 && !w.dawn) { z.on = true; z.x = -0.3; }
      // ---- bikes: one per open layer (its colour) while it plays, more when loud; turn at right angles on the grid
      const grid = v.grid || {}, cols = Math.max(4, Math.round(grid.cols || 12)), rows = Math.max(4, Math.round(grid.rows || 8)), du = 2 / cols, dz = 1 / rows;
      const nb = (w.play || 0) > 0.3 && !w.dawn ? Math.min(c.bikes, v.plants.length, 1 + Math.round(3 * clamp(loud + 0.4 * tr))) : 0;
      const vel = (1.1 + 4 * loud) * Math.sqrt(w.speed || 1);
      for (let i = 0; i < L.bikes.length; i++) {
        const k = L.bikes[i];
        if (i < nb && !k.on) { // start at a grid node, a trail of one point
          const col = v.plants[(i * 3) % v.plants.length].col; k.col = col; k.cs = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
          k.on = true; k.fade = 1; k.u = -1 + du * (1 + Math.floor(ih(i, L.t * 10) * (cols - 1))); k.z = dz * (1 + Math.floor(ih(i, 3) * (rows - 2))); k.dir = i % 4; k.tn = 0; k.th = 0; k.lu = k.u; k.lz = k.z;
          k.tr[0] = k.u; k.tr[1] = k.z; k.tn = 1;
        }
        if (!k.on) continue;
        if (i >= nb) { k.fade -= dt * 1.5; if (k.fade <= 0) { k.on = false; continue; } }
        if (newBeat && b.strong && j > 0) k.turn = 1;
        k.flare = Math.max(0, k.flare - dt * 3);
        k.v = vel;
        const ax = k.dir % 2 === 0, sg = k.dir < 2 ? 1 : -1, step = (ax ? du : dz), before = ax ? k.u : k.z, after = before + sg * k.v * dt * step;
        const n0 = Math.floor((before + (ax ? 1 : 0)) / step + 1e-6), n1 = Math.floor((after + (ax ? 1 : 0)) / step + 1e-6);
        if (n0 !== n1) { // crossed a grid line: snap to it, maybe turn
          const node = (sg > 0 ? n1 : n0) * step - (ax ? 1 : 0);
          const nu = ax ? node : k.u, nz = ax ? k.z : node;
          const edge = ax ? (nu + sg * du > 1 - du * 0.5 || nu + sg * du < -1 + du * 0.5) : (nz + sg * dz > 1 - dz * 0.5 || nz + sg * dz < dz * 0.5);
          if (edge || k.turn || Math.random() < 0.18) {
            k.u = nu; k.z = nz;
            const th = (k.th + 1) % CAP.trail; k.tr[2 * th] = nu; k.tr[2 * th + 1] = nz; k.th = th; k.tn = Math.min(CAP.trail, k.tn + 1);
            let nd = (k.dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
            const okd = (d) => { const a = d % 2 === 0, s = d < 2 ? 1 : -1; return a ? (nu + s * du <= 1 - du * 0.5 && nu + s * du >= -1 + du * 0.5) : (nz + s * dz <= 1 - dz * 0.5 && nz + s * dz >= dz * 0.5); };
            if (!okd(nd)) nd = (nd + 2) % 4; if (!okd(nd)) nd = (k.dir + 2) % 4;
            if (k.turn) k.flare = 1; k.turn = 0; k.dir = nd;
          } else { if (ax) k.u = after; else k.z = after; }
        } else { if (ax) k.u = after; else k.z = after; }
      }
      // ---- people: population × cap; arrive from the edges, go to work in the morning, come home in the evening
      const want = Math.round(clamp(w.population || 0) * c.people), storm = (w.weather && (w.weather.storm > 0.3 || w.weather.rain > 0.75)) ? 1 : 0;
      let alive = 0; for (let i = 0; i < L.people.length; i++) { const p = L.people[i]; if (p.st !== S_OFF && p.st !== S_LEAVE) alive++; }
      L.spawnT -= dt;
      if (alive < want && L.spawnT <= 0) { for (let i = 0; i < L.people.length; i++) { const p = L.people[i]; if (p.st !== S_OFF) continue; const left = Math.random() < 0.5; p.x = left ? -0.05 * W : 1.05 * W; p.v = 0.8 + 0.5 * Math.random(); p.jump = 0; p.job = null; if (!(morning && goWork(p))) goWait(p); alive++; L.spawnT = 0.35; break; } }
      if (alive > want) for (let i = L.people.length - 1; i >= 0 && alive > want; i--) { const p = L.people[i]; if (p.st !== S_OFF && p.st !== S_LEAVE) { go(p, S_LEAVE, p.x < W / 2 ? -0.06 * W : 1.06 * W); alive--; } }
      for (let i = 0; i < L.people.length; i++) {
        const p = L.people[i]; if (p.st === S_OFF) continue;
        if (L.party > 0 && j > 0 && p.st !== S_IN && p.jump <= 0) p.jump = 0.45;
        p.jump = Math.max(0, p.jump - dt);
        if (p.st === S_IN) { // at work: in the evening, they come out one by one
          if (!morning && Math.random() < dt * 0.35) { p.st = S_HOME; goWait(p); p.st = S_HOME; }
          else if (p.job && L.doorId.indexOf(p.job) < 0) { p.st = S_HOME; goWait(p); p.st = S_HOME; } // the building came down
          continue;
        }
        if (p.st === S_WAIT && p.tm >= 0) { p.tm -= dt; if (p.tm <= 0) { if (morning && goWork(p)) {} else goWait(p); } continue; }
        const run = storm ? 2.3 : 1, spd = p.v * run * W * (0.022 + 0.01 * (w.speed || 1)), d = p.tx - p.x;
        p.dir = d >= 0 ? 1 : -1;
        if (Math.abs(d) <= spd * dt) {
          p.x = p.tx;
          if (p.st === S_WORK) { p.st = S_IN; }
          else if (p.st === S_LEAVE) { p.st = S_OFF; }
          else { p.st = S_WAIT; p.tm = 2 + 6 * Math.random(); }
        } else p.x += p.dir * spd * dt;
      }
    }
  }
  const tick = (w, cam, v) => { if (v.frames !== L.f) { L.f = v.frames; L.c0 = performance.now(); L.acc = 0; update(w, cam, v); } };
  const timed = (fn) => (g, w, cam, v) => { tick(w, cam, v); const t0 = performance.now(); fn(g, w, cam, v); const ms = performance.now() - t0; L.acc += ms; L.lay[fn.name] = (L.lay[fn.name] || 0) * 0.97 + ms * 0.03; if (fn === drawTraffic) endFrame(); };
  function endFrame() { // the quality factor: the life gives way when it costs too much most of the time (a lone stall is not ours)
    L.cost = L.cost * 0.97 + Math.min(L.acc, 6) * 0.03; L.over = (L.over || 0) * 0.97 + (L.acc > 2 ? 0.03 : 0);
    if (L.over > 0.6 && L.q > 0.4) { L.q = Math.max(0.4, L.q - 0.2); L.over = 0.3; } else if (L.over < 0.1 && L.q < 1) L.q = Math.min(1, L.q + 0.002);
  }

  // ======================================================================================================================
  // DRAWING
  function drawBeams(g, w, cam, v) { // searchlights from the hologram bases, sweeping the sky
    const pop = clamp(w.population || 0), n = pop > 0.25 ? (pop > 0.6 ? 2 : 1) : 0; if (!n) return;
    const W = cam.W, gd = cam.gd, S = sprites(v, gd), T = v.reduced ? 0 : v.st, bh = Math.round(gd * 1.05), bw = Math.round(W * 0.07);
    g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true;
    for (let i = 0; i < n; i++) {
      const hx = i ? 0.79 : 0.21, bx = cam.x(0.72, W * hx), by = cam.y(0.72, gd);
      for (let s = 0; s < 2; s++) {
        const an = v.reduced ? (s ? 0.3 : -0.3) : Math.sin(T * (0.3 + 0.08 * s + 0.05 * i) + i * 2 + s * 3) * 0.55, co = Math.cos(an), sn = Math.sin(an);
        g.setTransform(co, sn, -sn, co, bx, by); g.globalAlpha = clamp((0.12 + 0.25 * pop) * (0.4 + 0.6 * (w.power || 0)) + 0.25 * (w.pulse.chord || 0));
        g.drawImage(S.beam, -bw / 2, -bh, bw, bh);
      }
    }
  }
  function drawBikes(g, w, cam, v) {
    const W = cam.W, H = cam.H, yT = cam.y(1, cam.gd), px = cam.px, k1 = cam.k(1);
    let any = false; for (let i = 0; i < L.bikes.length; i++) if (L.bikes[i].on) any = true; if (!any) return;
    const X = (u, z) => cam.x(1, W / 2 + u * 0.7 * W / (1 + 4 * z)), Y = (z) => yT + (H - yT) / (1 + 4 * z);
    g.globalCompositeOperation = 'lighter'; g.lineJoin = 'miter'; g.lineCap = 'butt';
    const lw = Math.max(1, Math.round(px * 0.7 * k1));
    for (let i = 0; i < L.bikes.length; i++) {
      const k = L.bikes[i]; if (!k.on) continue;
      g.strokeStyle = k.cs;
      for (let pass = 0; pass < (L.q < 0.7 ? 1 : 2); pass++) { // a wide glow, then the core
        g.lineWidth = pass ? lw : lw * 4;
        const n = k.tn, base = k.fade * (pass ? 0.95 : 0.22); let pu = k.u, pz = k.z;
        for (let m = 0; m < n; m++) { // from the head back to the oldest corner, fading
          const id = ((k.th - m) % CAP.trail + CAP.trail) % CAP.trail, u = k.tr[2 * id], z = k.tr[2 * id + 1];
          g.globalAlpha = base * (1 - m / (n + 1)); g.beginPath(); g.moveTo(X(pu, pz), Y(pz)); g.lineTo(X(u, z), Y(z)); g.stroke(); pu = u; pz = z;
        }
      }
      // the cycle: a bright head, bigger near the camera; a flare on a tight turn
      const hx = X(k.u, k.z), hy = Y(k.z), s = Math.max(2, Math.round(px * 1.6 * k1 / (1 + 2 * k.z)));
      g.globalAlpha = k.fade; g.fillStyle = k.cs; g.fillRect(Math.round(hx - s), Math.round(hy - s), 2 * s, s + 1);
      g.fillStyle = '#ffffff'; g.fillRect(Math.round(hx - s / 2), Math.round(hy - s), s, Math.max(1, s >> 1));
      if (k.flare > 0) { g.globalAlpha = k.flare * 0.8; g.fillStyle = k.cs; g.fillRect(Math.round(hx - 3 * s), Math.round(hy - s / 2), 6 * s, Math.max(1, s >> 1)); g.fillRect(Math.round(hx - s / 2), Math.round(hy - 3 * s), Math.max(1, s >> 1), 5 * s); }
    }
  }
  function drawHolo(g, w, cam, v) {
    const pop = clamp(w.population || 0), n = pop > 0.25 ? (pop > 0.6 ? 2 : 1) : 0; if (!n) return;
    const W = cam.W, gd = cam.gd, S = sprites(v, gd), T = v.reduced ? 0 : v.st, j = v.reduced ? 0 : J(), red = v.reduced;
    if (!red && (L.chords >= 4 || T - L.adT > 14)) { L.ad = (L.ad + 1) % HOLO.length; L.adT = T; L.chords = 0; }
    const glitch = red ? 0 : clamp(1 - (T - L.adT) / 0.45) * j, k = cam.k(0.72);
    for (let i = 0; i < n; i++) {
      const kind = (L.ad + i * 2) % HOLO.length, alt = kind === 1 ? (!red && (T % 4) > 3.82) : (!red && Math.floor(T * 3) % 2 === 1);
      const cv = S.holo[kind][alt ? 1 : 0], hw = cv.width * k, hh = cv.height * k, hx = i ? 0.79 : 0.21;
      const bx = cam.x(0.72, W * hx), base = cam.y(0.72, gd), lift = Math.round(gd * 0.12 * k), bob = red ? 0 : Math.sin(T * 0.9 + i * 2) * S.hc * 1.5 * k;
      const y0 = base - lift - hh + bob, x0 = bx - hw / 2 + (kind === 0 && !red ? Math.sin(T * 0.4 + i) * hw * 0.08 : 0);
      // the projector: a dark box on the ground, its cone of light up to the picture
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.setTransform(1, 0, 0, 1, 0, 0);
      const pb = Math.max(3, Math.round(S.hc * 3 * k)); g.fillStyle = '#0a0714'; g.fillRect(Math.round(bx - pb), Math.round(base - pb), 2 * pb, pb); g.fillStyle = '#5ff0ff'; g.fillRect(Math.round(bx - pb / 3), Math.round(base - pb), Math.max(1, Math.round(pb / 1.5)), Math.max(1, pb >> 2));
      g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.globalAlpha = 0.35 + 0.2 * (w.power || 0);
      g.drawImage(S.cone, Math.round(bx - hw * 0.45), Math.round(y0 + hh * 0.6), Math.round(hw * 0.9), Math.round(base - pb - y0 - hh * 0.6)); g.imageSmoothingEnabled = false;
      // the picture: flickers (JUICE), drops out now and then, slices slide when the ad changes
      const drop = !red && ih(Math.floor(T * 8), i) < 0.03 * j, fl = red ? 1 : 1 - 0.18 * j * (0.5 + 0.5 * Math.sin(T * 23 + i * 5));
      g.globalAlpha = drop ? 0.15 : clamp((0.42 + 0.35 * (w.power || 0)) * fl + 0.25 * (w.pulse.beat || 0) * j);
      if (glitch > 0.02 || (!red && ih(Math.floor(T * 3), 40 + i) < 0.04 * j)) {
        const sl = 5, sh = cv.height / sl;
        for (let s = 0; s < sl; s++) { const off = (ih(s, Math.floor(T * 20)) - 0.5) * 8 * S.hc * k * Math.max(glitch, 0.4); g.drawImage(cv, 0, s * sh, cv.width, sh, Math.round(x0 + off), Math.round(y0 + s * sh * k), Math.round(hw), Math.ceil(sh * k)); }
      } else g.drawImage(cv, Math.round(x0), Math.round(y0), Math.round(hw), Math.round(hh));
    }
  }
  function drawCarLane(g, w, cam, v, li) {
    const ln = LANES[li], W = cam.W, gd = cam.gd, S = sprites(v, gd), T = v.reduced ? 0 : v.st, k = cam.k(ln.d), y = cam.y(ln.d, gd * ln.yf);
    for (let i = 0; i < L.cars.length; i++) {
      const c = L.cars[i]; if (c.lane !== li || !c.on) continue;
      const spr = S.cars[li][c.col], sw = spr.width * k, sh = spr.height * k, x = cam.x(ln.d, -0.1 * W + c.x * 1.2 * W);
      const bob = v.reduced ? 0 : Math.sin(T * 1.3 + c.seed) * cam.px * 0.6 * k, xx = Math.round(x - sw / 2), yy = Math.round(y + bob - sh / 2);
      if (xx > W || xx + sw < -W * 0.2) continue;
      // trails: red behind, a white beam ahead
      const len = Math.round((10 + 14 * (w.traffic || 0)) * cam.px * k * ln.s), th = Math.max(1, Math.round(sh / 4));
      g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.globalAlpha = 0.85 * Math.min(1, ln.d);
      if (ln.dir > 0) { g.drawImage(S.trailR, xx - len, yy + Math.round(sh / 2) - th, len, th); g.globalAlpha *= 0.5; g.setTransform(-1, 0, 0, 1, xx + sw + Math.round(len * 0.6), 0); g.drawImage(S.trailW, 0, yy + Math.round(sh / 4), Math.round(len * 0.6), th); }
      else { g.setTransform(-1, 0, 0, 1, xx + sw + len, 0); g.drawImage(S.trailR, 0, yy + Math.round(sh / 2) - th, len, th); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha *= 0.5; g.drawImage(S.trailW, xx - Math.round(len * 0.6), yy + Math.round(sh / 4), Math.round(len * 0.6), th); }
      g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.drawImage(spr, xx, yy, Math.round(sw), Math.round(sh));
    }
  }
  function drawBack(g, w, cam, v) {
    drawCarLane(g, w, cam, v, 0);
    const z = L.zep; if (!z.on) return;
    const W = cam.W, gd = cam.gd, S = sprites(v, gd), k = cam.k(0.45), zw = S.zep.width * k, zh = S.zep.height * k, T = v.reduced ? 0 : v.st;
    const x = Math.round(cam.x(0.45, z.x * W)), y = Math.round(cam.y(0.45, gd * 0.14));
    g.drawImage(S.zep, x, y, Math.round(zw), Math.round(zh));
    // its screen: the text scrolls; red beacons blink
    const zc = S.zcs * k, sx = x + 10 * zc, sy = y + 4 * zc, sw = 23 * zc, src = S.ztext, srcW = sw / k, off = ((T * 6 * S.zcs) % (src.width - srcW) + (src.width - srcW)) % (src.width - srcW);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6 + 0.3 * (w.power || 0);
    g.drawImage(src, Math.round(off), 0, Math.round(srcW), src.height, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(src.height * k));
    if (v.reduced || Math.floor(T * 1.5) % 2) { g.fillStyle = '#ff3348'; g.fillRect(x + Math.round(2 * zc), y + Math.round(6 * zc), Math.ceil(zc), Math.ceil(zc)); g.fillRect(x + Math.round(41 * zc), y + Math.round(6 * zc), Math.ceil(zc), Math.ceil(zc)); }
  }
  function drawTraffic(g, w, cam, v) { drawCarLane(g, w, cam, v, 1); drawCarLane(g, w, cam, v, 2); }
  function drawPeople(g, w, cam, v) {
    const gd = cam.gd, S = sprites(v, gd), k = cam.k(1), red = v.reduced, j = red ? 0 : J(), T = red ? 0 : v.st, cs = S.cs, sy = cam.y(1, gd);
    const rain = w.weather ? w.weather.rain || 0 : 0, b = w.beat || {};
    // small lamps on the kerb where they wait
    if (L.nSpots && (w.population || 0) > 0.05) {
      const lh = Math.round(cs * 22 * k), lw = Math.max(1, Math.round(cs * k));
      for (let i = 0; i < L.nSpots; i++) {
        const x = Math.round(cam.x(1, L.spots[i]));
        g.fillStyle = '#0b0816'; g.fillRect(x, sy - lh, lw, lh); g.fillRect(x - 2 * lw, sy - lh, 3 * lw, lw);
        g.fillStyle = '#ffd9a0'; g.fillRect(x - 2 * lw, sy - lh + lw, 2 * lw, lw);
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.06 + 0.06 * (w.power || 0); g.fillStyle = '#ffb060';
        g.beginPath(); g.moveTo(x - 2 * lw, sy - lh + 2 * lw); g.lineTo(x - lw, sy - lh + 2 * lw); g.lineTo(x + lh * 0.25, sy); g.lineTo(x - lh * 0.3, sy); g.closePath(); g.fill();
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      }
    }
    for (let i = 0; i < L.people.length; i++) {
      const p = L.people[i]; if (p.st === S_OFF || p.st === S_IN) continue;
      const P = PEOPLE[p.vr], moving = p.st !== S_WAIT, fr = !moving ? 2 : (Math.floor(T * 6 * p.v + p.ph) & 1), dir = p.dir > 0 ? 0 : 1;
      const spr = S.people[p.vr][fr][dir], sw = spr.width * k, sh = spr.height * k, x = Math.round(cam.x(1, p.x) - sw / 2);
      let y = sy + Math.round(p.row * cs * 3 * k) - sh; // a bit of depth on the pavement
      if (!moving && j > 0 && b.on && b.k > 0.45) y += Math.round(cs * k); // nod on the beat
      if (p.jump > 0) y -= Math.round(Math.sin(p.jump / 0.45 * Math.PI) * cs * 5 * k * Math.min(1, j));
      g.drawImage(spr, x, Math.round(y), Math.round(sw), Math.round(sh));
      if (P.umbrella && rain > 0.15) { const u = S.umb[i % COLS.length]; g.drawImage(u, Math.round(x + sw / 2 - u.width * k / 2 + p.dir * cs * k), Math.round(y - u.height * k + cs * k), Math.round(u.width * k), Math.round(u.height * k)); }
      if (P.dog) { const d = S.dog[moving ? fr & 1 : 0][dir], dw = d.width * k; g.drawImage(d, Math.round(x + (p.dir > 0 ? sw + cs * k : -dw - cs * k)), Math.round(y + sh - d.height * k), Math.round(dw), Math.round(d.height * k)); }
      // the neon trim glows a little
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.25; g.fillStyle = P.trim; g.fillRect(x, Math.round(y + sh * 0.45), Math.round(sw), Math.max(1, Math.round(cs * k))); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
  }

  GV.addLayer({ id: 'life-beams', z: 25, draw: timed(drawBeams) });
  GV.addLayer({ id: 'life-bikes', z: 33, draw: timed(drawBikes) });
  GV.addLayer({ id: 'life-holo', z: 36, draw: timed(drawHolo) });
  GV.addLayer({ id: 'traffic-back', z: 38, draw: timed(drawBack) });
  GV.addLayer({ id: 'life-people', z: 42, draw: timed(drawPeople) });
  GV.addLayer({ id: 'traffic', z: 50, draw: timed(drawTraffic) }); // replaces S8.1's traffic layer (same place)

  // events: a party makes them jump; the chords turn the holograms' ads; a new song section turns the day
  const bus = A.bus;
  if (bus && bus.on) {
    ['game:discovery', 'game:ready', 'game:unlock'].forEach((e) => bus.on(e, () => { L.party = 1.2; }));
    bus.on('combo', (o) => { if (o && o.on) L.party = 1.2; });
    bus.on('chord', () => { L.chords++; });
    bus.on('section', () => { L.day = Math.floor(L.day * 2 + 1) / 2 + 0.01; });
  }

  A.cityLife = {
    L, CAP, LANES, DAY, PEOPLE,
    morning: () => (L.day % 1) < 0.5,
    party() { L.party = 1.2; },
    stats() {
      let cars = 0, carsOut = 0, bikes = 0, people = 0, leaving = 0, inside = 0, walking = 0;
      for (const c of L.cars) if (c.on) { if (c.out) carsOut++; else cars++; }
      for (const b of L.bikes) if (b.on) bikes++;
      for (const p of L.people) { if (p.st !== 0 && p.st !== S_LEAVE) people++; if (p.st === S_LEAVE) leaving++; if (p.st === S_IN) inside++; if (p.st === S_WORK || p.st === S_WALK || p.st === S_HOME || p.st === S_LEAVE) walking++; }
      return { cars, carsOut, bikes, people, leaving, inside, walking, zeppelin: L.zep.on, made: L.made, pools: L.cars.length + L.bikes.length + L.people.length, q: L.q, cost: L.cost, day: L.day, layers: L.lay };
    },
  };
})();
