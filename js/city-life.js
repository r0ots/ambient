// S8.6 « La vie de la ville » (AMB.cityLife), S9.3 « La ville qui grandit avec toi »: what MOVES in the city of
// js/garden-visual.js, and only while it plays. Each moving thing is the reflection of one function (gv.feat, the table
// FUNCS of garden-visual.js: open AND active) and of its EVENTS:
//   - Mélodie auto: the air lanes are beaconed (built when the layer is heard); ONE flying car per note heard, at the
//     height of its pitch (high = far and high up), crossing the screen; a dense motif = a traffic jam (the lane slows).
//   - Basse: one Tron light-cycle per bass note, on the ground grid (S8.5), its trail fading behind it.
//   - Looper: a mooring mast (built when there are loops); one airship per loop that sounds, circling, its screen
//     flashing on the looper's notes.
//   - Pulsations: two searchlights sweeping the sky (a burst on the snare), brighter on the kick.
//   - Accords (Progression): a holographic sign that shows the name of the chord heard.
//   - Découvertes: one inhabitant per discovery found (the dog walker, the umbrella…), out only while it plays: they
//     arrive, go to work in the towers, come home, wait under the kerb lamps, run in the storm.
// Densité multiplies what exists (gv.many(): cars per note, inhabitants out). Silence = nothing moves, nobody outside.
// A pure reflection: nothing here can be touched, nothing writes the store or the game.
// Layers (gv.addLayer, back to front): `life-beams` 25 (searchlights), `life-bikes` 33 (light-cycles, on the S8.5 grid
// z 32), `life-sign` 36 (the chord sign, behind the towers), `traffic-back` 38 (beacons, far lane, mast, airships),
// `life-people` 42 (people, kerb lamps, in front of the towers), `traffic` 50 (the two near lanes).
// Budget: every entity comes from a pool made once (no allocation per frame); caps per kind (smaller on a phone), and a
// quality factor `q` that drops when the life costs more than 2 ms a frame. Reduced motion: everything stands still.
// JUICE scales the goofy bits (nods, jumps, surges on the beat, tight turns); 0 = they keep moving, plainly.
(function () {
  const A = window.AMB = window.AMB || {}, GV = A.gardenVisual;
  if (!GV || !GV.addLayer) return;
  const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
  const ih = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // ---- tables ----
  const CAP = { cars: 18, bikes: 6, people: 24, zeps: 4, trail: 8, pend: 64 }; // desktop; a phone (≤ 600 css px wide) ~half
  const LANES = [ // flying-car lanes by pitch (high notes far and high up): depth (parallax and size), direction, speed
    { d: 0.55, dir: 1, s: 1.1, v: 0.26, back: true },
    { d: 0.82, dir: -1, s: 1.5, v: 0.32 },
    { d: 1.1, dir: 1, s: 2, v: 0.4 },
  ];
  const laneOf = (k) => (k > 0.62 ? 0 : k > 0.3 ? 1 : 2); // pitch 0..1 → lane
  const yOf = (k) => 0.14 + 0.52 * (1 - k); // pitch → height (share of the sky above the street)
  const BEACONS = 18; // lights along each lane
  const CAR_LIFE = 9, BIKE_LIFE = 1.6; // s: a car that never leaves the screen, a light-cycle's ride
  const DAY = 48; // s of play = one day: the first half is the morning (they go to work), the second the evening
  const COLS = [[95, 240, 255], [255, 84, 196], [255, 196, 92], [157, 107, 255]]; // car windows / neon trims
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
    made: 0, f: -1, t: 0, day: 0.05, party: 0, q: 1, cost: 0, beatPh: 0, sec: 0, fresh: {}, growing: {}, sw: 0,
    cars: [], bikes: [], people: [], zeps: [], pend: [], spots: new Float32Array(16), nSpots: 0, doors: new Float32Array(16), doorId: [], nDoors: 0,
    spawnT: 0, laneFlash: new Float32Array(3), zepBlink: 0, snare: 0, chord: '', chordT: -9, W: 0, H: 0, px: 0, cache: {}, signs: new Map(), loud: 0, lay: {},
  };
  const make = (o) => { L.made++; return o; };
  for (let i = 0; i < CAP.cars; i++) L.cars.push(make({ lane: 0, i, x: 0, yf: 0.4, on: false, out: false, age: 0, fade: 0, col: i % COLS.length, seed: ih(i, 7) * 6.28 }));
  for (let i = 0; i < CAP.bikes; i++) L.bikes.push(make({ on: false, fade: 0, life: 0, u: 0, z: 0, dir: 0, v: 0, col: [255, 255, 255], cs: '#fff', turn: 0, flare: 0, tr: new Float32Array(2 * CAP.trail), tn: 0, th: 0 }));
  for (let i = 0; i < CAP.people; i++) L.people.push(make({ on: false, st: 0, x: 0, tx: 0, tm: 0, v: 1, vr: i % PEOPLE.length, dir: 1, ph: ih(i, 5) * 6.28, row: ih(i, 9), job: null, jump: 0 }));
  for (let i = 0; i < CAP.zeps; i++) L.zeps.push(make({ on: false, a: 0, ph: i * 2.3 + 0.4 }));
  for (let i = 0; i < CAP.pend; i++) L.pend.push(make({ on: false, kind: 0, t: 0, m: 60, v: 0.7 })); // notes waiting to be heard: 0 car, 1 bike
  const S_OFF = 0, S_WALK = 1, S_WAIT = 2, S_WORK = 3, S_IN = 4, S_HOME = 5, S_LEAVE = 6;

  const J = () => clamp(+GV.JUICE || 0, 0, 2);
  const phone = (v) => (v.W || 1) / (v.dpr || 1) <= 600;
  const caps = (v) => { const k = (phone(v) ? 0.55 : 1) * L.q; return { cars: Math.max(4, Math.round(CAP.cars * k)), people: Math.round(CAP.people * k), bikes: Math.max(2, Math.round(CAP.bikes * Math.min(1, k + 0.2))) }; };
  const heard = () => { const c = A.engine && A.engine.ctx; return GV.clock() - (c ? c.outputLatency || c.baseLatency || 0 : 0); };
  const pitchK = (m) => clamp(((m == null ? 60 : +m) - 48) / 36);

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
  function beam() { const c = canvas(64, 128), x = c.getContext('2d'), g = x.createLinearGradient(0, 128, 0, 0); g.addColorStop(0, 'rgba(210,235,255,0.6)'); g.addColorStop(1, 'rgba(210,235,255,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(30, 128); x.lineTo(34, 128); x.lineTo(64, 0); x.lineTo(0, 0); x.closePath(); x.fill(); return c; }
  function sprites(v, gd) {
    const px = v.px || 3, W = v.W || 1, key = px * 1e6 + Math.round(W / 100);
    if (L.cache.key === key) return L.cache;
    const cs = Math.max(1, Math.round(Math.min(px * 1.1, W / 150))), zc = Math.max(1, Math.round(Math.min(px * 0.8, W / 170))); // sizes: the city's cell, never too big for a narrow screen (S9.4: the airships smaller, they stay in the sky)
    L.cache = {
      key, cs, people: peopleSheet(cs),
      dog: [0, 1].map((f) => [false, true].map((fl) => pix(DOG[f], cs, { d: '#9aa2c8', e: '#ff3348' }, fl))),
      umb: COLS.map((col) => pix(UMB, cs, { u: 'rgb(' + col.join(',') + ')', s: '#140c22' })),
      cars: LANES.map((ln) => { const cc = Math.max(1, Math.round(Math.min(px, W / 170) * ln.s)); return COLS.map((col) => carSprite(cc, col, ln.dir < 0)); }),
      trailR: trailSprite('255,51,72', '255,70,110'), trailW: trailSprite('255,246,224', '255,246,224'),
      zep: zeppelin(zc), zcs: zc, ztext: textStrip('JUNOJUNO * NEON SOUL * ', zc, '#ff54c4'), beam: beam(),
    };
    return L.cache;
  }
  // the chord sign's text (cached by name and size): the name in neon, Chakra Petch (S9.2)
  function signText(name, fs) {
    const key = name + '|' + fs; let c = L.signs.get(key); if (c) return c;
    const m = canvas(8, 8).getContext('2d'); m.font = '600 ' + fs + 'px "Chakra Petch", sans-serif';
    const w = Math.ceil(m.measureText(name).width) + fs; c = canvas(w, Math.ceil(fs * 1.2));
    const x = c.getContext('2d'); x.font = m.font; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = '#5ff0ff'; x.shadowBlur = fs * 0.35; x.fillStyle = '#5ff0ff'; x.fillText(name, w / 2, c.height / 2);
    x.shadowBlur = 0; x.fillStyle = '#e8feff'; x.fillText(name, w / 2, c.height / 2);
    L.signs.set(key, c); if (L.signs.size > 24) L.signs.delete(L.signs.keys().next().value);
    return c;
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


  // a note heard → a car (Mélodie auto) or a light-cycle (Basse), × Densité
  function spawnCar(m, c, mul) {
    const k = pitchK(m), li = laneOf(k), ln = LANES[li];
    for (let n = 0; n < mul; n++) {
      let on = 0, free = null; for (let i = 0; i < L.cars.length; i++) { const q = L.cars[i]; if (q.on) on++; else if (!free) free = q; }
      if (!free || on >= c.cars) return; // a full sky: the jam is already there
      free.on = true; free.out = false; free.lane = li; free.age = 0; free.fade = 1; free.yf = clamp(yOf(k) + (n ? (ih(free.i, n) - 0.5) * 0.06 : 0), 0.08, 0.72);
      free.x = (ln.dir > 0 ? -0.12 : 1.12) - ln.dir * n * 0.06; free.col = (Math.round(k * 7) + n) % COLS.length;
      L.laneFlash[li] = 1;
    }
  }
  function spawnBike(vel, mul) {
    const grid = GV.grid || {}, cols = Math.max(4, Math.round(grid.cols || 12)), rows = Math.max(4, Math.round(grid.rows || 8)), du = 2 / cols, dz = 1 / rows;
    const C = GV.byLayer && GV.byLayer.bass ? GV.byLayer.bass.col : [150, 110, 255], pal = [C, [95, 240, 255], [255, 84, 196]];
    for (let n = 0; n < mul; n++) {
      let k = null; for (let i = 0; i < L.bikes.length; i++) { const b = L.bikes[i]; if (!b.on) { k = b; break; } if (!k || b.life < k.life) k = b; } // the oldest gives way
      const i = L.bikes.indexOf(k), col = pal[(i + n) % pal.length]; k.col = col; k.cs = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
      k.on = true; k.fade = 1; k.life = BIKE_LIFE * (0.8 + 0.4 * clamp(vel == null ? 0.7 : vel)); k.u = -1 + du * (1 + Math.floor(ih(i, L.t * 10 + n) * (cols - 1))); k.z = dz * (1 + Math.floor(ih(i, 3 + n) * (rows - 2))); k.dir = (i + n) % 4;
      k.tn = 1; k.th = 0; k.tr[0] = k.u; k.tr[1] = k.z; k.turn = 0; k.flare = 0;
    }
  }
  function queue(kind, d) {
    if (!GV.running() || GV.replay) return;
    let e = null; for (let i = 0; i < L.pend.length; i++) if (!L.pend[i].on) { e = L.pend[i]; break; }
    if (!e) return;
    e.on = true; e.kind = kind; e.t = d.time != null ? +d.time : heard(); e.m = d.midi; e.v = d.vel;
  }

  function update(w, cam, v) {
    const red = v.reduced, dt = red ? 0 : Math.min(0.1, v.dt || 0), W = cam.W, j = J(), c = caps(v), F = v.feat || {}, mul = v.many ? v.many() : 1, app = v.app_ || {};
    const playing = (w.play || 0) > 0.3 && !w.dawn, fall = Math.min(0.1, v.dt || 0.016);
    L.W = W; L.H = cam.H; L.px = cam.px; L.t += dt;
    const loud = L.loud = loudness(w, v), morning = (L.day % 1) < 0.5;
    if (!red) L.day += dt * clamp(w.play || 0) / DAY;
    L.party = Math.max(0, L.party - dt);
    // buildings just finished = fresh (their windows have just lit)
    for (let i = 0; i < v.plants.length; i++) { const p = v.plants[i], g = !!v.grow[p.id]; if (L.growing[p.id] && !g) L.fresh[p.id] = L.t; if (L.growing[p.id] == null && !g && L.t > 0.5) L.fresh[p.id] = L.t; L.growing[p.id] = g; }
    doors(v);
    // the notes heard now: their cars and light-cycles (only with their function there)
    const now = heard();
    for (let i = 0; i < L.pend.length; i++) {
      const e = L.pend[i]; if (!e.on || e.t > now + 0.004) continue;
      e.on = false; if (now - e.t > 1) continue; // late (tab hidden): dropped
      if (e.kind === 0 && F.bells) spawnCar(e.m, c, mul); else if (e.kind === 1 && F.bass) spawnBike(e.v, mul);
    }
    const b = w.beat || {}, newBeat = b.on && b.ph < L.beatPh; L.beatPh = b.ph || 0;
    for (let i = 0; i < 3; i++) L.laneFlash[i] = Math.max(0, L.laneFlash[i] - fall * 3);
    L.zepBlink = Math.max(0, L.zepBlink - fall * 4); L.snare = Math.max(0, L.snare - fall * 1.5);
    const nz = playing && F.looper ? Math.min(CAP.zeps, app.loops || 0) : 0;
    if (red) { // reduced motion: what exists stands still; what has lost its music goes away at once
      if (!playing || !F.bells) for (const k of L.cars) k.on = false;
      if (!playing || !F.bass) for (const k of L.bikes) k.on = false;
      for (let i = 0; i < L.zeps.length; i++) { const z = L.zeps[i]; z.on = i < nz; z.a = z.on ? 1 : 0; }
    }
    if (dt) {
      // ---- cars: each crosses the screen once; a crowded lane slows down (traffic jam); silence or stop: they fade
      const sp = (w.speed || 1) * (1 + 0.35 * j * (b.k || 0) + 0.25 * loud);
      let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < L.cars.length; i++) { const k = L.cars[i]; if (k.on) { if (k.lane === 0) b0++; else if (k.lane === 1) b1++; else b2++; } }
      for (let i = 0; i < L.cars.length; i++) {
        const k = L.cars[i]; if (!k.on) continue;
        const ln = LANES[k.lane], busy = k.lane === 0 ? b0 : k.lane === 1 ? b1 : b2; k.age += dt;
        if (!playing || !F.bells || k.age > CAR_LIFE) k.out = true;
        if (k.out) { k.fade -= dt * 2.5; if (k.fade <= 0) { k.on = false; continue; } }
        k.x += ln.dir * dt * ln.v * sp * (0.85 + 0.3 * ih(k.i, 3)) / (1 + 0.12 * Math.max(0, busy - 3));
        if (ln.dir > 0 ? k.x > 1.15 : k.x < -0.15) k.on = false; // gone past the far side (the followers start further back)
      }
      // ---- airships: one per loop that sounds, while it plays; they fade in, and away at the stop
      for (let i = 0; i < L.zeps.length; i++) { const z = L.zeps[i]; z.on = i < nz; z.a = clamp(z.a + (z.on ? 1 : -1) * dt / 1.2); z.ph += dt * 0.07 * (w.speed || 1); }
      // ---- bikes: one per bass note, a short ride; turn at right angles on the grid
      const grid = v.grid || {}, cols = Math.max(4, Math.round(grid.cols || 12)), rows = Math.max(4, Math.round(grid.rows || 8)), du = 2 / cols, dz = 1 / rows;
      const vel = (1.1 + 4 * loud) * Math.sqrt(w.speed || 1);
      for (let i = 0; i < L.bikes.length; i++) {
        const k = L.bikes[i];
        if (!k.on) { k.flare = 0; continue; }
        k.life -= dt; if (k.life <= 0 || !playing || !F.bass) { k.fade -= dt * 2.5; if (k.fade <= 0) { k.on = false; continue; } }
        if (newBeat && b.strong && j > 0) k.turn = 1; else if (j <= 0) k.turn = 0;
        k.flare = Math.max(0, k.flare - dt * 3);
        k.v = vel;
        const ax = k.dir % 2 === 0, sg = k.dir < 2 ? 1 : -1, step = (ax ? du : dz), before = ax ? k.u : k.z, after = before + sg * k.v * dt * step;
        const n0 = Math.floor((before + (ax ? 1 : 0)) / step + 1e-6), n1 = Math.floor((after + (ax ? 1 : 0)) / step + 1e-6);
        if (n0 !== n1) { // crossed a grid line: snap to it, maybe turn
          const node = (sg > 0 ? n1 : n0) * step - (ax ? 1 : 0);
          const nu = ax ? node : k.u, nz2 = ax ? k.z : node;
          const edge = ax ? (nu + sg * du > 1 - du * 0.5 || nu + sg * du < -1 + du * 0.5) : (nz2 + sg * dz > 1 - dz * 0.5 || nz2 + sg * dz < dz * 0.5);
          if (edge || k.turn || Math.random() < 0.18) {
            k.u = nu; k.z = nz2;
            const th = (k.th + 1) % CAP.trail; k.tr[2 * th] = nu; k.tr[2 * th + 1] = nz2; k.th = th; k.tn = Math.min(CAP.trail, k.tn + 1);
            let nd = (k.dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
            const okd = (d) => { const a = d % 2 === 0, s = d < 2 ? 1 : -1; return a ? (nu + s * du <= 1 - du * 0.5 && nu + s * du >= -1 + du * 0.5) : (nz2 + s * dz <= 1 - dz * 0.5 && nz2 + s * dz >= dz * 0.5); };
            if (!okd(nd)) nd = (nd + 2) % 4; if (!okd(nd)) nd = (k.dir + 2) % 4;
            if (k.turn) k.flare = 1; k.turn = 0; k.dir = nd;
          } else { if (ax) k.u = after; else k.z = after; }
        } else { if (ax) k.u = after; else k.z = after; }
      }
      // ---- people: one per discovery (× Densité), out only while it plays; arrive from the edges, go to work in the
      // morning, come home in the evening; at the stop, they all go home
      const want = playing && F.people ? Math.min(c.people, (app.found || 0) * mul) : 0, storm = (w.weather && (w.weather.storm > 0.3 || w.weather.rain > 0.75)) ? 1 : 0;
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
  function drawBeams(g, w, cam, v) { // S9.3 Pulsations: two searchlights sweeping the sky, a burst on the snare, brighter on the kick
    const pk = (v.featK && v.featK.perc) || 0; if (pk < 0.01) return;
    const W = cam.W, gd = cam.gd, S = sprites(v, gd), bh = Math.round(gd * 1.05 * Math.min(1, pk * 1.4)), bw = Math.round(W * 0.07), n = phone(v) ? 1 : 2, kick = (w.music && w.music.kick) || 0;
    L.sw += v.reduced ? 0 : Math.min(0.1, v.dt || 0) * (w.speed || 1) * (1 + 4 * L.snare);
    g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true;
    for (let i = 0; i < n; i++) {
      const hx = phone(v) ? 0.5 : i ? 0.79 : 0.21, bx = cam.x(0.72, W * hx), by = cam.y(0.72, gd);
      for (let s = 0; s < 2; s++) {
        const an = v.reduced ? (s ? 0.3 : -0.3) : Math.sin(L.sw * (0.3 + 0.08 * s + 0.05 * i) + i * 2 + s * 3) * 0.55, co = Math.cos(an), sn = Math.sin(an);
        g.setTransform(co, sn, -sn, co, bx, by); g.globalAlpha = clamp(pk * ((0.18 + 0.25 * kick + 0.15 * L.snare) * (0.4 + 0.6 * (w.power || 0)) + 0.2 * (w.pulse.chord || 0)));
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
  function drawSign(g, w, cam, v) { // S9.3 Accords: a holographic sign on a pole, the name of the chord heard; built with its function
    const k = (v.featK && v.featK.chords) || 0; if (k < 0.01 || !L.chord) return;
    const W = cam.W, gd = cam.gd, red = v.reduced, T = red ? 0 : v.st, d = 0.72, kk = cam.k(d), px = cam.px;
    const bx = Math.round(cam.x(d, W * (phone(v) ? 0.5 : 0.3))), base = Math.round(cam.y(d, gd)), ph = Math.round(gd * 0.42 * kk);
    const pole = Math.round(ph * Math.min(1, k * 1.6)), lw = Math.max(2, Math.round(px * kk));
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = '#0b0818'; g.fillRect(bx - lw, base - pole, 2 * lw, pole); // the pole, rising
    const lit = clamp(k * 2.5 - 1.5); if (lit <= 0) return;
    const fs = Math.max(12, Math.round(Math.min(W * 0.05, gd * 0.09) * kk)), tx = signText(L.chord, fs), tw = tx.width, th = tx.height;
    const glitch = red ? 0 : clamp(1 - (T - L.chordT) / 0.35) * J(), x0 = Math.round(bx - tw / 2), y0 = base - ph - th;
    g.fillStyle = 'rgba(10,30,44,0.55)'; g.fillRect(x0 - lw, y0 - lw, tw + 2 * lw, th + 2 * lw); // the panel
    g.globalCompositeOperation = 'lighter'; g.fillStyle = '#5ff0ff'; g.globalAlpha = 0.6 * lit;
    g.fillRect(x0 - lw, y0 - lw, tw + 2 * lw, Math.max(1, lw >> 1)); g.fillRect(x0 - lw, y0 + th + lw, tw + 2 * lw, Math.max(1, lw >> 1));
    const fl = red ? 1 : 0.85 + 0.15 * Math.sin(T * 23); g.globalAlpha = clamp(lit * fl * (0.55 + 0.45 * (w.power || 0)) + 0.3 * (w.pulse.chord || 0));
    if (glitch > 0.02) { const sl = 4, sh = th / sl; for (let s = 0; s < sl; s++) g.drawImage(tx, 0, s * sh, tw, sh, x0 + Math.round((ih(s, Math.floor(T * 30)) - 0.5) * fs * glitch), y0 + s * sh, tw, sh); }
    else g.drawImage(tx, x0, y0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  function drawCarLane(g, w, cam, v, li) {
    const ln = LANES[li], W = cam.W, gd = cam.gd, S = sprites(v, gd), T = v.reduced ? 0 : v.st, k = cam.k(ln.d);
    for (let i = 0; i < L.cars.length; i++) {
      const c = L.cars[i]; if (c.lane !== li || !c.on) continue;
      const spr = S.cars[li][c.col], sw = spr.width * k, sh = spr.height * k, x = cam.x(ln.d, -0.1 * W + c.x * 1.2 * W), y = cam.y(ln.d, gd * c.yf);
      const bob = v.reduced ? 0 : Math.sin(T * 1.3 + c.seed) * cam.px * 0.6 * k, xx = Math.round(x - sw / 2), yy = Math.round(y + bob - sh / 2);
      if (xx > W || xx + sw < -W * 0.2) continue;
      // trails: red behind, a white beam ahead
      const len = Math.round((10 + 14 * clamp(w.traffic || 0)) * cam.px * k * ln.s), th = Math.max(1, Math.round(sh / 4)), fa = clamp(c.fade);
      g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.globalAlpha = 0.85 * Math.min(1, ln.d) * fa;
      if (ln.dir > 0) { g.drawImage(S.trailR, xx - len, yy + Math.round(sh / 2) - th, len, th); g.globalAlpha *= 0.5; g.setTransform(-1, 0, 0, 1, xx + sw + Math.round(len * 0.6), 0); g.drawImage(S.trailW, 0, yy + Math.round(sh / 4), Math.round(len * 0.6), th); }
      else { g.setTransform(-1, 0, 0, 1, xx + sw + len, 0); g.drawImage(S.trailR, 0, yy + Math.round(sh / 2) - th, len, th); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha *= 0.5; g.drawImage(S.trailW, xx - Math.round(len * 0.6), yy + Math.round(sh / 4), Math.round(len * 0.6), th); }
      g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.globalCompositeOperation = 'source-over'; g.globalAlpha = fa;
      g.drawImage(spr, xx, yy, Math.round(sw), Math.round(sh)); g.globalAlpha = 1;
    }
  }
  // the air lanes of the Mélodie auto (S9.3): beacons along the three lanes, lit one by one from the left when the layer
  // is heard (built), a light that chases along them while it plays, a flash where a car has just entered
  function drawBeacons(g, w, cam, v) {
    const bk = (v.featK && v.featK.bells) || 0; if (bk < 0.01) return;
    const W = cam.W, gd = cam.gd, px = cam.px, T = v.reduced ? 0 : v.st, n = Math.round(BEACONS * bk), playing = (w.play || 0) > 0.3;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter';
    for (let li = 0; li < 3; li++) {
      const ln = LANES[li], y = Math.round(cam.y(ln.d, gd * yOf(li === 0 ? 0.81 : li === 1 ? 0.46 : 0.15))), s = Math.max(1, Math.round(px * cam.k(ln.d) * 0.5)), chase = playing ? Math.floor(T * 6 * ln.dir) : -99;
      for (let i = 0; i < n; i++) {
        const x = Math.round(cam.x(ln.d, -0.1 * W + (i + 0.5) / BEACONS * 1.2 * W)), on = ((i - chase) % 6 + 6) % 6 === 0;
        g.globalAlpha = Math.min(1, 0.3 + (on ? 0.5 : 0) + 0.5 * L.laneFlash[li]); g.fillStyle = i % 2 ? '#ffc45c' : '#ff3348';
        g.fillRect(x - s, y - s, 2 * s, 2 * s);
      }
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  // the looper's mast (S9.3, built when there are loops) and its airships, one per loop
  function drawBack(g, w, cam, v) {
    drawBeacons(g, w, cam, v);
    drawCarLane(g, w, cam, v, 0);
    const mk = (v.featK && v.featK.looper) || 0, W = cam.W, gd = cam.gd, px = cam.px, S = sprites(v, gd), T = v.reduced ? 0 : v.st;
    if (mk > 0.01) {
      const d = 0.6, kk = cam.k(d), mx = Math.round(cam.x(d, W * (phone(v) ? 0.86 : 0.9))), base = Math.round(cam.y(d, gd)), mh = Math.round(gd * 0.5 * kk * mk), lw = Math.max(1, Math.round(px * kk));
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#120c22'; g.fillRect(mx - lw, base - mh, 2 * lw, mh);
      g.fillStyle = 'rgba(255,84,196,0.7)'; for (let y = 4 * lw; y < mh; y += 5 * lw) g.fillRect(mx - 2 * lw, base - y, 4 * lw, Math.max(1, lw >> 1));
      if (mk > 0.95 && (v.reduced || Math.floor(T * 1.5) % 2)) { g.fillStyle = '#ff3348'; g.fillRect(mx - lw, base - mh - 2 * lw, 2 * lw, 2 * lw); }
    }
    for (let i = 0; i < L.zeps.length; i++) {
      const z = L.zeps[i]; if (z.a <= 0.01) continue;
      const d = 0.45, k = cam.k(d), zw = S.zep.width * k, zh = S.zep.height * k, fx = 0.5 + 0.36 * Math.sin(z.ph + i * 1.7);
      const x = Math.round(cam.x(d, fx * W) - zw / 2), y = Math.round(cam.y(d, gd * (0.08 + 0.09 * i)));
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = z.a; g.drawImage(S.zep, x, y, Math.round(zw), Math.round(zh));
      // its screen: the text scrolls, brighter on the looper's notes; red beacons blink
      const zc = S.zcs * k, sx = x + 10 * zc, sy = y + 4 * zc, sw = 23 * zc, src = S.ztext, srcW = sw / k, off = (((T + i * 3) * 6 * S.zcs) % (src.width - srcW) + (src.width - srcW)) % (src.width - srcW);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = z.a * Math.min(1, 0.22 + 0.15 * (w.power || 0) + 0.45 * L.zepBlink); // (S9.4: a dim screen, lit on the loop's notes)
      g.drawImage(src, Math.round(off), 0, Math.round(srcW), src.height, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(src.height * k));
      if (v.reduced || L.zepBlink > 0.3 || Math.floor(T * 1.5) % 2) { g.fillStyle = '#ff3348'; g.fillRect(x + Math.round(2 * zc), y + Math.round(6 * zc), Math.ceil(zc), Math.ceil(zc)); g.fillRect(x + Math.round(41 * zc), y + Math.round(6 * zc), Math.ceil(zc), Math.ceil(zc)); }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
  }
  function drawTraffic(g, w, cam, v) { drawCarLane(g, w, cam, v, 1); drawCarLane(g, w, cam, v, 2); }
  function drawPeople(g, w, cam, v) {
    const gd = cam.gd, S = sprites(v, gd), k = cam.k(1), red = v.reduced, j = red ? 0 : J(), T = red ? 0 : v.st, cs = S.cs, sy = cam.y(1, gd);
    const rain = w.weather ? w.weather.rain || 0 : 0, b = w.beat || {};
    // small lamps on the kerb where they wait (S9.3: only while someone is out)
    let out = 0; for (let i = 0; i < L.people.length; i++) if (L.people[i].st !== S_OFF && L.people[i].st !== S_IN) out++;
    if (L.nSpots && out) {
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
  GV.addLayer({ id: 'life-sign', z: 36, draw: timed(drawSign) });
  GV.addLayer({ id: 'traffic-back', z: 38, draw: timed(drawBack) });
  GV.addLayer({ id: 'life-people', z: 42, draw: timed(drawPeople) });
  GV.addLayer({ id: 'traffic', z: 50, draw: timed(drawTraffic) }); // replaces S8.1's traffic layer (same place)

  // events: the notes that make the cars and the light-cycles, the looper's notes, the snare, the chord's name; a party
  // makes them jump; a new song section turns the day
  const bus = A.bus;
  if (bus && bus.on) {
    bus.on('note', (n) => {
      if (!n || n.live) return;
      if (n.loop) { if (GV.running()) L.zepBlink = 1; return; }
      if (n.layer === 'bells') queue(0, n); else if (n.layer === 'bass') queue(1, n);
    });
    bus.on('perc', (p) => { if (p && p.track === 1 && GV.running()) L.snare = 1; });
    bus.on('chord', (c) => {
      if (!c || !c.midis || !A.theory || !A.theory.chordName) return;
      let nm = ''; try { nm = String(A.theory.chordName(c.midis) || ''); } catch (e) {}
      if (nm && nm !== L.chord) { L.chord = nm; L.chordT = GV.st || 0; }
    });
    ['game:discovery', 'game:ready', 'game:unlock'].forEach((e) => bus.on(e, () => { L.party = 1.2; }));
    bus.on('combo', (o) => { if (o && o.on) L.party = 1.2; });
    bus.on('section', () => { L.day = Math.floor(L.day * 2 + 1) / 2 + 0.01; });
  }

  A.cityLife = {
    L, CAP, LANES, DAY, PEOPLE, laneOf, yOf,
    morning: () => (L.day % 1) < 0.5,
    party() { L.party = 1.2; },
    // tests: nothing moving, nothing waiting
    clear() { for (const k of L.cars) k.on = false; for (const k of L.bikes) k.on = false; for (const e of L.pend) e.on = false; for (const p of L.people) p.st = S_OFF; for (const z of L.zeps) { z.on = false; z.a = 0; } },
    stats() {
      let cars = 0, carsOut = 0, bikes = 0, people = 0, leaving = 0, inside = 0, walking = 0, zeps = 0, pending = 0;
      for (const c of L.cars) if (c.on) { if (c.out) carsOut++; else cars++; }
      for (const b of L.bikes) if (b.on) bikes++;
      for (const z of L.zeps) if (z.a > 0.01) zeps++;
      for (const e of L.pend) if (e.on) pending++;
      for (const p of L.people) { if (p.st !== 0 && p.st !== S_LEAVE) people++; if (p.st === S_LEAVE) leaving++; if (p.st === S_IN) inside++; if (p.st === S_WORK || p.st === S_WALK || p.st === S_HOME || p.st === S_LEAVE) walking++; }
      return { cars, carsOut, bikes, people, leaving, inside, walking, zeps, pending, chord: L.chord, made: L.made, pools: L.cars.length + L.bikes.length + L.people.length + L.zeps.length + L.pend.length, q: L.q, cost: L.cost, day: L.day, layers: L.lay };
    },
  };
})();
