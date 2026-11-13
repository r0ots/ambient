// « Jardin » (G11.2) : a visual mode of the screen, the showcase of what the player has grown. Purely visual (never
// earns, never writes the store or the game state).
//   - one plant per UNLOCKED sound layer (tree node below), in a fixed order, spread evenly over the ground;
//   - it reacts to its own notes (bus `note` / `perc` / `grain` / `chord`): pulse of light + a leaf that pops out;
//   - its height = the share of the tree nodes of its layer that are unlocked (a node belongs to a layer when one of
//     its settings does: `<layer>.*`, js/tree.js);
//   - rare plants (glowing crystals) = secrets found, on the ground between two plants;
//   - S4.2 « Réponse » (js/puzzles.js view()): the Melody plant blinks while the marked phrase plays, stays lit while it
//     waits for the answer, and grows one leaf per note played back (green = right, red = wrong).
// Mode policy (wraps AMB.visual, visual.js is untouched): « Jardin » exists only in the Parcours, where it is the
// default (own preference key ambient.vizMode.path); in free mode (or mode not chosen) the cycle, the stored choice
// (ambient.vizMode) and the drawing are exactly the classic ones. Without this file the app is unchanged.
// S4.5w (calé sur la musique): a plant that appears or gets taller GROWS (~1.2 s, Y scale of its cached sprite) from the
// strong beat its layer comes in on (garden.beat / growAt); the sky follows the chord and the scale (cached skies,
// cross-faded with globalAlpha); the ground pulses on the beat; the finale replays the recorded song (replayStart):
// night -> dawn, each plant lights up when its layer plays. Reduced motion: no growth, no pulse (the sky still follows).
// S4.6: each plant shows its layer's settings (one table, LOOK below: size, light, shape, halo, sway, pace, bloom) and
// bounces when one of them is touched.
// S5.2 « Chaque note se voit »: each note splashes from the plant that plays it (trigger: splash(), drawing: drawSplash,
// fire; one knob, JUICE): the player's (A–L, pads, MIDI; a forced chord on the Pad) loud and goofy — a ring of LEDs, a glow
// where the pitch sits on the stem (lit while held), particles, a flash, squash & stretch, a shake on chords and loud
// MIDI notes; the machine's (Mélodie auto, Mélodie écrite, Basse, Pulsations) the same, smaller. Reduced motion: a
// fixed, brief glow only. Still a reflection: nothing on the scene can be touched.
// S5.8 « Chaque bouton a un impact visuel »: every control the plants do not show drives a layer of the scene (one table,
// SCENE: sky tint, clouds, stars, aurora, rays, fireflies, mist, snow, frost, ground ripple, echo ghosts, tape, grain,
// lens, playback veil, song), each an intensity 0..1 (layers()) plus an impulse when touched; the tempo is its speed.
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
    { id: 'seq', node: 'c.seq', label: 'Mélodie écrite', short: 'Écrite', col: [255, 150, 71], kind: 'vine' },
    { id: 'bass', node: 'c.rythme', label: 'Basse', short: 'Basse', col: [127, 159, 224], kind: 'cactus' },
    { id: 'perc', node: 'c.rythme', label: 'Pulsations', short: 'Rythme', col: [255, 90, 60], kind: 'shroom' },
  ];
  const byLayer = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

  // ---- S4.6 SETTINGS → LOOK: the one table. Each plant shows its layer's settings as 7 aspects, all 0..1, and knows
  // nothing of how they are drawn (a later skin, e.g. a city at night, reads the same aspects and draws them its way):
  //   size  ← Niveau (× general Volume)             : height and width of the plant
  //   light ← Lumière (× Usure / Cassette, darker)  : colour and brightness, petals open (bright) or closed in a bud (dark)
  //   shape ← Timbre                                : round petals and smooth leaves ↔ pointed petals, more points, serrated leaves
  //   halo  ← Espace of the layer × Reverb (+ Halo)  : soft aura around the plant
  //   sway  ← the layer's movement (Mouvement, Attaque, Résonance, Swing +, Flou, Tenue) : how wide the stem waves
  //   pace  ← Tempo (Flottant = slower)             : how fast it waves
  //   bloom ← density / complexity (Densité, Accords riches, notes of the motif, hits of the pattern) : 1 to 4 flowers
  // A cell: 'layer.key' (a knob, normalised by its range, or a toggle), sel(key, {option: 0..1}) for a select, num(v), or
  // fn([keys], (get) => 0..1). The grands réglages (Lumière, Densité, Espace, Nostalgie, Nature) move these same
  // settings (js/perform.js MACROS), so they reach every plant they concern through this table.
  const sel = (k, map) => ({ keys: [k], f: (get) => { const v = map[val(get, k)]; return v == null ? 0.5 : v; } });
  const num = (v) => ({ keys: [], f: () => v });
  const fn = (keys, f) => ({ keys, f });
  const share = (s, re) => { s = String(s || ''); const all = s.replace(/[^0-9a-z]/gi, '').length; return all ? (s.match(re) || []).length / all : 0; };
  const BELL_WAVES = { Cloche: 0.55, Kalimba: 0.3, Verre: 0.85, Pluck: 1, Doux: 0 };
  const LOOK = {
    drone: { size: 'drone.vol', light: 'drone.tone', shape: sel('drone.wave', { Sub: 0, Chaud: 0.2, Creux: 0.55, Orgue: 0.9 }), halo: 'drone.send', sway: 'drone.motion', bloom: num(0) },
    pad: { size: 'pad.vol', light: 'pad.tone', shape: sel('pad.wave', { Nappe: 0.1, Onde: 0.25, 'Chœur': 0.35, Cordes: 0.6, Verre: 0.85, FM: 1 }), halo: 'pad.send', sway: 'pad.attack', bloom: 'pad.voicing' },
    bells: { size: 'bells.vol', light: 'bells.tone', shape: sel('bells.wave', BELL_WAVES), halo: 'bells.send', sway: 'bells.decay', bloom: 'bells.density' },
    texture: { size: 'texture.vol', light: 'texture.tone', shape: sel('texture.type', { 'Océan': 0, Ruisseau: 0.2, Vent: 0.35, Pluie: 0.55, Oiseaux: 0.65, Ville: 0.8, Vinyle: 0.9, Feu: 1 }), halo: 'texture.send', sway: 'texture.motion', bloom: num(0.35) },
    grains: { size: 'grains.vol', light: num(0.6), shape: fn(['grains.size'], (get) => 1 - norm('grains.size', get('grains.size'))), halo: 'grains.send', sway: 'grains.spray', bloom: 'grains.density' },
    seq: { size: 'seq.vol', light: 'seq.tone', shape: sel('seq.wave', BELL_WAVES), halo: 'seq.send', sway: 'seq.swing', bloom: fn(['seq.pattern'], (get) => Math.min(1, (String(val(get, 'seq.pattern') || '').split(',').filter(Boolean).length) / 16)) },
    bass: { size: 'bass.vol', light: 'bass.tone', shape: sel('bass.wave', { Sub: 0, Ronde: 0.35, Pluck: 1 }), halo: 'bass.send', sway: 'bass.decay', bloom: fn(['bass.pattern'], (get) => Math.min(1, share(val(get, 'bass.pattern'), /1/g) * 6)) },
    perc: { size: 'perc.vol', light: 'perc.tone', shape: sel('perc.kit', { 'Feutré': 0.15, Organique: 0.85 }), halo: 'perc.send', sway: 'perc.swing', bloom: fn(['perc.pattern', 'perc.prob'], (get) => Math.min(1, share(val(get, 'perc.pattern'), /[1-9a-z]/gi) * 2) * (0.4 + 0.6 * norm('perc.prob', get('perc.prob')))) },
  };
  // S5.8: on ← the layer's On (coupure de couche): a silent layer's plant goes dim
  for (const id in LOOK) LOOK[id].on = id + '.on';
  // the general settings, the same for every plant
  const LOOK_ALL = { volume: 'global.volume', space: 'fx.space', shimmer: 'fx.shimmer', worn: fn(['fx.tape', 'fx.lofi'], (get) => 0.5 * norm('fx.tape', get('fx.tape')) + 0.5 * norm('fx.lofi', get('fx.lofi'))), pace: 'global.tempo', float: sel('global.time', { 'Pulsé': 0, Flottant: 1 }) };
  const ASPECTS = ['size', 'light', 'shape', 'halo', 'sway', 'pace', 'bloom', 'on'];
  const spec = (key) => { const S = AMB.SCHEMA, [sec, k] = key.split('.'); return S && S[sec] && S[sec].params[k]; };
  const val = (get, k) => { const v = get(k); if (v != null) return v; const sp = spec(k); return sp ? sp.def : v; }; // unknown = the schema default
  function norm(key, v) {
    const sp = spec(key);
    if (v == null && sp) v = sp.def;
    if (typeof v === 'boolean') return v ? 1 : 0;
    const lo = sp && sp.min != null ? sp.min : 0, hi = sp && sp.max != null ? sp.max : 1;
    const n = (Number(v) - lo) / ((hi - lo) || 1);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
  }
  const cell = (c, get) => (typeof c === 'string' ? norm(c, get(c)) : Math.max(0, Math.min(1, +c.f(get) || 0)));
  // get(key) → the store value (undefined = the schema default). Pure: same settings, same look.
  function look(get) {
    const all = {}; for (const k in LOOK_ALL) all[k] = cell(LOOK_ALL[k], get);
    const out = {};
    for (const id in LOOK) {
      const L = LOOK[id], a = {};
      for (const k of ['size', 'light', 'shape', 'halo', 'sway', 'bloom', 'on']) a[k] = cell(L[k], get);
      a.size = Math.min(1, a.size / 0.8) * (0.7 + 0.3 * Math.min(1, all.volume / 0.8));
      a.light *= 1 - 0.35 * all.worn;
      a.halo = Math.min(1, a.halo * (0.2 + 0.8 * all.space) + 0.25 * all.shimmer * a.halo);
      a.pace = all.pace * (1 - 0.5 * all.float);
      a.sway = Math.min(1, a.sway + 0.25 * all.float);
      out[id] = a;
    }
    return out;
  }
  // which plants a setting concerns: its layer's, or all of them for the general ones (Volume, Tempo, Reverb, Halo…)
  const ALL_KEYS = new Set(); for (const k in LOOK_ALL) { const c = LOOK_ALL[k]; (typeof c === 'string' ? [c] : c.keys).forEach((x) => ALL_KEYS.add(x)); }
  function concerns(key) {
    const sec = String(key).split('.')[0];
    if (LOOK[sec]) return [sec];
    if (ALL_KEYS.has(key) || sec === 'fx') return Object.keys(LOOK);
    return [];
  }

  // ---- S5.8 « Chaque bouton a un impact visuel »: SETTINGS → SCENE, the second table. Every control the plants do not
  // show drives a layer of the scene (sky, weather, lights, ground, full-screen filters). A layer is one intensity 0..1
  // (the MEAN of its cells: a select = its option's rank, a toggle 0/1, a text = how much it holds, a knob = its range);
  // `poll` = app state outside the store (mode, playback, song). The drawing (drawScene) reads intensities only: a later
  // skin, or S5.10's combos, read the same `layers()`. A touched control (sources user / macro / xy, or the event `ev`)
  // kicks its layer: an impulse 1 → 0 in ~0.8 s on top of the lasting state.
  const SCENE = {
    hue: { at: 'ciel : teinte', keys: ['global.key', 'global.tuning'] },
    clouds: { at: 'ciel : nuages qui dérivent', keys: ['global.evolve'] },
    twinkle: { at: 'ciel : étoiles qui scintillent', keys: ['mod.l1target', 'mod.l1shape', 'mod.l1rate', 'mod.l1depth', 'mod.l2target', 'mod.l2shape', 'mod.l2rate', 'mod.l2depth', 'auto.on', 'auto.target', 'auto.bars', 'auto.curve'] },
    aurora: { at: 'lumières : aurores', keys: ['fx.shimmer'] },
    rays: { at: 'lumières : rayons', keys: ['drone.follow', 'pad.length', 'pad.prog', 'pad.custom', 'pad.counter'] },
    fireflies: { at: 'lumières : lucioles', keys: ['bells.mode', 'bells.phraseLen', 'bells.mutate', 'bells.range', 'seq.mode', 'seq.arpDir', 'seq.arpRate', 'seq.arpOct', 'seq.steps', 'seq.octave', 'seq.follow', 'seq.decay', 'seq.mutate', 'seq.patB', 'seq.patC', 'seq.patD', 'seq.slot', 'seq.chain'] },
    haze: { at: 'météo : brume', keys: ['fx.space', 'fx.revType', 'fx.size', 'fx.predelay'] },
    snow: { at: 'météo : neige de pixels', keys: ['grains.scan', 'grains.pitch', 'grains.reverse', 'grains.glide'] },
    frost: { at: 'météo : givre', keys: ['grains.source'], ev: 'freeze' },
    ripple: { at: 'sol : ondulation', keys: ['global.swing', 'global.humanize', 'bass.octave', 'perc.steps'] },
    echo: { at: 'filtre : écho (plantes fantômes)', keys: ['fx.echo', 'fx.echoTime', 'fx.feedback'] },
    tape: { at: 'filtre : bande qui défile, image qui tremble', keys: ['fx.tape'] },
    grain: { at: 'filtre : grain et vignette', keys: ['fx.lofi'] },
    lens: { at: 'filtre : grille (Sculpter), portée (Composer)', poll: () => ({ sculpt: 0.5, compose: 1 })[AMB.mode] || 0 },
    play: { at: 'lumière : allumée en lecture, voilée à l\'arrêt', poll: () => (AMB.seq && AMB.seq.playing ? 1 : 0) },
    song: { at: 'ciel : avancée du Morceau, balayage à chaque section', poll: () => { const S = AMB.song; return S && S.playing && S.sections && S.sections.length ? (S.idx + 1) / S.sections.length : 0; }, ev: 'section' },
  };
  const SCENE_OF = {}; for (const n in SCENE) for (const k of SCENE[n].keys || []) (SCENE_OF[k] = SCENE_OF[k] || []).push(n);
  function level(key, get) {
    const sp = spec(key), v = val(get, key);
    if (!sp) return 0;
    if (sp.type === 'select') { const i = sp.options.indexOf(v); return i < 0 ? 0 : i / Math.max(1, sp.options.length - 1); }
    if (sp.type === 'toggle') return v ? 1 : 0;
    if (sp.type === 'text') return Math.min(1, String(v || '').replace(/[^0-9a-z]/gi, '').length / 32);
    return norm(key, v);
  }
  // get(key) → the store value (undefined = the schema default). Pure but for the `poll` layers (app state).
  function scene(get) {
    const out = {};
    for (const n in SCENE) {
      const L = SCENE[n];
      if (L.poll) { let v = 0; try { v = +L.poll() || 0; } catch (e) {} out[n] = Math.max(0, Math.min(1, v)); continue; }
      let s = 0; for (const k of L.keys) s += level(k, get);
      out[n] = s / L.keys.length;
    }
    return out;
  }

  // ---- S5.2 « Chaque note se voit »: the TRIGGER (which plant, who plays, how strong), apart from the drawing (a later
  // skin reads the same splashes and draws them its way: drawSplash only). The garden stays a reflection: nothing on the
  // scene is touchable. JUICE = the one knob for how much a note sets off (0 = calm, 1 = goofy default, 2 = way too much).
  const JUICE = 1;
  // per who: ring (wave brightness), parts (particles at vel 1), flash (plant lit), squash (squash & stretch), life (s)
  const SPLASH = {
    player: { ring: 1, parts: 24, flash: 1, squash: 0.28, life: 0.8 },
    chord: { ring: 1, parts: 36, flash: 1, squash: 0.36, life: 1, spread: 4.2 },
    machine: { ring: 0.45, parts: 4, flash: 0.35, squash: 0.08, life: 0.5 },
    // S5.3 celebrations of the Réponse on the Melody plant (cheer()): a series that grows, a record, a new tier
    streak: { ring: 1, parts: 30, flash: 1, squash: 0.32, life: 0.9, spread: 4.2 },
    record: { ring: 1, parts: 60, flash: 1, squash: 0.45, life: 1.1, spread: 6.3, shake: 0.6 },
    tier: { ring: 1, parts: 90, flash: 1, squash: 0.55, life: 1.3, spread: 6.3, shake: 1 },
  };
  const WAVES_PER_PLANT = 3, PARTS_MAX = 260, LOUD = 0.85, HELD_MAX = 30; // s: a release that never comes
  const MACHINE = new Set(['bells', 'seq', 'bass']); // the machine's melodies and bass (+ the rhythm, 'perc')
  const pitchK = (m) => Math.max(0, Math.min(1, ((m == null ? 60 : +m) - 36) / 60)); // 0 = low (C2) .. 1 = high (C7)
  // bus event → splash {plant, who, vel 0..1, pitch 0..1, held (live id | 'chord' | null), shake 0..1, time}, or null. Pure.
  // live = a note the player plays (A–L, pads, MIDI; on the written melody's plant while the piano roll records);
  // a forced chord = the Pad; the machine's notes ('note' not live: Réponse phrases and the player's own are live) and hits.
  function splash(ev, d, recording) {
    if (!d) return null;
    const t = d.time || 0;
    if (ev === 'live') {
      const vel = d.raw != null ? d.raw : d.vel == null ? 0.85 : d.vel;
      return { plant: recording ? 'seq' : 'bells', who: 'player', vel, pitch: pitchK(d.midi), held: d.id == null ? null : d.id, shake: d.raw != null && d.raw >= LOUD ? 0.6 : 0, time: t };
    }
    if (ev === 'chord') {
      if (!d.forced) return null;
      const ms = d.midis || [], m = ms.length ? ms.reduce((s, v) => s + v, 0) / ms.length : 60;
      return { plant: 'pad', who: 'chord', vel: 0.9, pitch: pitchK(m), held: 'chord', shake: 1, time: t };
    }
    if (ev === 'note' && !d.live && MACHINE.has(d.layer)) return { plant: d.layer, who: 'machine', vel: d.vel == null ? 0.7 : d.vel, pitch: pitchK(d.midi), held: null, shake: 0, time: t };
    if (ev === 'cheer') return SPLASH[d.kind] ? { plant: d.plant || 'bells', who: d.kind, vel: 1, pitch: 0.8, held: null, shake: SPLASH[d.kind].shake || 0, time: t } : null;
    if (ev === 'perc') return { plant: 'perc', who: 'machine', vel: d.vel == null ? 0.7 : d.vel, pitch: 0.15 + 0.2 * ((d.track | 0) % 4), held: null, shake: 0, time: t };
    return null;
  }

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
  function cells(kind, hC, seed, a) {
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
    return a && kind !== 'crystal' ? dress(out, hC, seed, a) : out;
  }

  // S4.6: the look on top of the species. a = {shape 0..1, light 0..1, bloom = number of flowers 1..4} (quantized).
  // shape: leaves get teeth (> 0.45, more > 0.8), petals go from round discs to pointed rays (4 to 7 points);
  // light: the petals open (dark = a closed bud, petals up only; bright = a wide flower)
  function dress(out, hC, seed, a) {
    const r = mulberry(seed ^ 0x5bd1e995), has = new Set(out.map((c) => c[0] + ',' + c[1]));
    const put = (x, y, t) => { const k = x + ',' + y; if (x >= 0 && x < CW && y >= 0 && !has.has(k)) { has.add(k); out.push([x, y, t]); } };
    const C = 12, body = out.slice();
    if (a.shape > 0.45) for (const [x, y, t] of body) { // teeth: a leaf cell on the outline sprouts a point outward
      if (t !== 1 || (x * 7 + y * 3) % (a.shape > 0.8 ? 2 : 3)) continue;
      const s = x >= C ? 1 : -1;
      if (!has.has((x + s) + ',' + y)) { put(x + s, y + 1, 1); if (a.shape > 0.8 && (x + y) % 2) put(x + 2 * s, y + 2, 1); }
    }
    const flower = (cx, cy, R) => {
      const n = 4 + Math.round(a.shape * 3), open = a.light, reach = 1.4 + open * 2.6 * R / 3, up = Math.PI / 2;
      const span = Math.PI * (0.35 + 0.65 * Math.min(1, open * 1.6)); // closed bud: only the petals around the top
      for (let i = 0; i < n; i++) {
        const ang = up + (i / n) * 2 * Math.PI + (n % 2 ? 0 : Math.PI / n);
        const off = Math.abs(Math.atan2(Math.sin(ang - up), Math.cos(ang - up)));
        if (off > span) continue;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        if (a.shape < 0.5) { // round petal: a small disc
          const pr = Math.max(1, reach * 0.42), px0 = cx + ca * reach * 0.62, py0 = cy + sa * reach * 0.62;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= pr * pr + 0.3) put(Math.round(px0 + dx), Math.round(py0 + dy), 3);
        } else { // pointed petal: a ray, wide at the base, a light point at the tip
          const L = reach * (1 + 0.45 * a.shape);
          for (let d = 1; d <= L; d += 0.5) {
            const x = Math.round(cx + ca * d), y = Math.round(cy + sa * d);
            put(x, y, d > L - 1 ? 4 : 3);
            if (d < L * 0.45) put(Math.round(x - sa), Math.round(y + ca), 3);
          }
        }
      }
      put(Math.round(cx), Math.round(cy), 4); if (R >= 3) { put(cx + 1, cy, 2); put(cx - 1, cy, 2); put(cx, cy + 1, 2); }
    };
    let top = 0, tx = C; for (const [x, y] of body) if (y > top || (y === top && Math.abs(x - C) < Math.abs(tx - C))) { top = y; tx = x; }
    const R = Math.max(2, Math.min(4, Math.round(2 + hC / 22))), mx = (x, R) => Math.max(R + 1, Math.min(CW - 2 - R, x));
    flower(mx(tx, R), top + 1 + Math.round(R * (0.3 + 0.5 * a.light)), R);
    const rows = [0.62, 0.42, 0.8], side0 = r() < 0.5 ? 1 : -1;
    for (let i = 1; i < a.bloom; i++) { // more flowers: on the sides, smaller, each on a short stalk
      const y = Math.round(hC * rows[i - 1]), s = i % 2 ? side0 : -side0;
      let edge = C; for (const [x, yy] of body) if (Math.abs(yy - y) <= 1 && (s > 0 ? x > edge : x < edge)) edge = x;
      const fx = mx(edge + s * 3, R - 1);
      put(edge + s, y, 0); put(edge + 2 * s, y + 1, 0);
      flower(fx, y + 2, R - 1);
    }
    return out;
  }

  // sky per chord: a hue per scale degree; minor scales (minor third) darker and cooler
  const HUES = [35, 315, 190, 160, 215, 275, 0]; // I amber, ii magenta, iii cyan, IV teal, V blue, vi violet, vii red
  const GROW = 1.2, SKY_FADE = 2; // s
  const ease = (q) => q * q * (3 - 2 * q) + 0.1 * Math.sin(Math.PI * q) * q * q; // slow start, a slight overshoot at the end

  const gv = {
    LAYERS, byLayer, layout, cells, hash, GROW,
    grow: {}, prevH: {}, growStart: null, growNext: false, // S4.5w growth: plant id -> {from (0..1 of its height), start}
    skyKey: null, skyPrevKey: null, skyT: 0, skyQ: [], skies: new Map(), // S4.5w sky
    replay: null, lit: {}, // S4.5w finale
    LOOK, LOOK_ALL, ASPECTS, look, concerns, aim: null, cur: {}, kicks: {}, swPh: {}, lookDirty: true, // S4.6 settings → look
    JUICE, SPLASH, WAVES_PER_PLANT, PARTS_MAX, splash, waves: [], squash: {}, zap: {}, shake: null, ox: 0, oy: 0, // S5.2 notes seen
    SCENE, scene, sc: {}, kick: {}, sAim: null, sPoll: {}, st: 0, speed: 1, fxc: {}, // S5.8 scene layers
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

    // S4.6: the sprite of a look, quantized (5 shapes × 5 lights × 1–4 flowers) so a slider glides through a few
    // cached sprites; size, halo and sway are drawn continuously on top (transform, glow), never in the sprite
    quant(a) { return a ? { shape: Math.round(a.shape * 4) / 4, light: Math.round(a.light * 4) / 4, bloom: 1 + Math.round(a.bloom * 3) } : null; },
    tones(col, q) {
      if (!q) return [rgb(col, 0.55), rgb(col, 0.85), rgb(col, 1.25), 'rgb(255,214,236)', 'rgb(255,233,168)'];
      const L = q.light, grey = (col[0] + col[1] + col[2]) / 3, dull = (1 - L) * 0.55;
      const c = col.map((v) => v + (grey - v) * dull), mix = (u, w, t) => u.map((v, i) => v + (w[i] - v) * t);
      const petal = mix(c, [255, 250, 240], 0.15 + 0.5 * L);
      return [rgb(c, 0.4 + 0.3 * L), rgb(c, 0.55 + 0.5 * L), rgb(c, 0.8 + 0.6 * L), rgb(petal, 0.45 + 0.65 * L), rgb(mix(petal, [255, 240, 190], L), 0.6 + 0.6 * L)];
    },
    sprite(p, px) {
      const hC = this.heightCells(p), q = p.rare ? null : this.quant(p.look), key = `${p.kind}|${p.id}|${hC}|${px}` + (q ? `|${q.shape}|${q.light}|${q.bloom}` : '');
      let s = this.sprites.get(key);
      if (s) return s;
      this.cacheMisses++;
      const cl = cells(p.kind, hC, hash(p.id), q);
      let top = 0; for (const c of cl) top = Math.max(top, c[1]);
      const Hc = top + 1, cv = document.createElement('canvas');
      cv.width = CW * px; cv.height = Hc * px;
      const g = cv.getContext('2d'), gap = px >= 4 ? 1 : 0, col = p.col;
      const tones = this.tones(col, q);
      for (const [x, y, t] of cl) { g.fillStyle = t === 12 ? 'rgba(107,74,26,0.55)' : tones[t]; g.fillRect(x * px, (Hc - 1 - y) * px, px - gap, px - gap); }
      let x0 = CW, x1 = 0; for (const c of cl) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); }
      s = { cv, w: cv.width, h: cv.height, hC: Hc, key, l: cv.width / 2 - x0 * px, r: (x1 + 1) * px - cv.width / 2 }; // l, r: drawn extent left and right of the stem
      this.sprites.set(key, s);
      if (this.sprites.size > 200) this.sprites.delete(this.sprites.keys().next().value);
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
    // ground + stars (static), drawn under the sky of the current chord (S4.5w: two layers so the dawn can fade the stars)
    background(W, H, ground) {
      const key = W + 'x' + H + '|' + ground + '|' + (this.px || 3);
      if (this.bg && this.bg.key === key) return this.bg;
      const r = mulberry(7), px = this.px || 3;
      const st = document.createElement('canvas'); st.width = W; st.height = Math.max(1, ground);
      let g = st.getContext('2d');
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,179,71,${0.08 + r() * 0.18})`; g.fillRect(Math.floor(r() * W / px) * px, Math.floor(r() * ground * 0.7 / px) * px, px - 1, px - 1); }
      const gr = document.createElement('canvas'); gr.width = W; gr.height = Math.max(1, H - ground);
      g = gr.getContext('2d');
      g.fillStyle = '#120d07'; g.fillRect(0, 0, W, H - ground);
      for (let y = 0; y < H - ground; y += px) for (let x = 0; x < W; x += px) {
        const v = r(); if (v < 0.22) { g.fillStyle = v < 0.05 ? '#4a3316' : '#2a1d0e'; g.fillRect(x, y, px - 1, px - 1); }
      }
      g.fillStyle = 'rgba(255,179,71,0.35)'; g.fillRect(0, 0, W, Math.max(1, px >> 1));
      this.bg = { key, stars: st, ground: gr };
      return this.bg;
    },
    // the sky of a chord: 'night' (before any chord), 'dawn' (finale), or `${deg}|${minor}`; cached by key and size
    // S5.8: off = hue shift (degrees) of the « hue » layer (Tonalité, Diapason), 0 at the default settings
    skyColors(key, off = 0) {
      if (key === 'night') return off ? [[0, '#0b0a08'], [1, `rgb(${hsl2rgb(((38 + off) % 360 + 360) % 360, 0.45, 0.075).join()})`]] : [[0, '#0b0a08'], [1, '#17120b']];
      if (key === 'dawn') return [[0, '#141a33'], [0.5, '#4d2f4f'], [0.82, '#b0584a'], [1, '#f2a65a']];
      const [d, mi] = key.split('|'), h = ((HUES[(+d % 7 + 7) % 7] + (mi === '1' ? 18 : 0) + off) % 360 + 360) % 360;
      const c = (sa, l) => `rgb(${hsl2rgb(h, sa, l).join()})`;
      return [[0, c(0.35, 0.03)], [0.55, c(0.5, mi === '1' ? 0.07 : 0.09)], [1, c(0.6, mi === '1' ? 0.17 : 0.22)]];
    },
    hueOff() { const D = this.sDef, v = this.sc.hue; return D && v != null ? Math.round((v - D.hue) * 22) * 15 : 0; },
    sky(key, W, ground) {
      const off = key === 'dawn' ? 0 : this.hueOff(), k = key + '|' + off + '|' + W + 'x' + ground;
      let cv = this.skies.get(k);
      if (cv) return cv;
      this.cacheMisses++;
      cv = document.createElement('canvas'); cv.width = W; cv.height = Math.max(1, ground);
      const g = cv.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, ground);
      for (const [o, c] of this.skyColors(key, off)) grd.addColorStop(o, c);
      g.fillStyle = grd; g.fillRect(0, 0, W, ground);
      this.skies.set(k, cv);
      if (this.skies.size > 16) this.skies.delete(this.skies.keys().next().value);
      return cv;
    },
    chordKey(deg) {
      let minor = false;
      try { const Th = AMB.theory, sc = Th && AMB.store && AMB.store.get && Th.SCALES[AMB.store.get('global.scale')]; minor = !!(sc && sc[2] === 3); } catch (e) {}
      return `${((deg | 0) % 7 + 7) % 7}|${minor ? 1 : 0}`;
    },
    setSky(key) {
      if (key === this.skyKey) return;
      this.skyPrevKey = this.skyKey || 'night'; this.skyKey = key; this.skyT = this.t || 0;
    },

    // ---- S4.5w growth: armed by an opening (garden.beat), timed on the audio clock ----
    // growAt(t): the next state change grows from audio time t (null = now); retime(t): the growth already armed waits
    // until t (the map closing)
    growAt(t) { this.growNext = true; this.retime(t); },
    retime(t) {
      const now = this.clock(), at = t == null ? now : t;
      this.growStart = at;
      for (const id in this.grow) if (this.grow[id].start + GROW > now) this.grow[id].start = Math.max(at, now);
    },
    growth(id, now) {
      const e = this.grow[id]; if (!e) return 1;
      const q = (now - e.start) / GROW;
      if (q >= 1) { delete this.grow[id]; return 1; }
      return q <= 0 ? e.from : e.from + (1 - e.from) * ease(q);
    },

    // ---- S4.5w finale: the recorded song is heard again (garden.finale); its events light the plants ----
    // r = {t0 (audio time of the song's start), from, len (s, the excerpt), ev: [{layer, t, vel, deg}]}
    replayStart(r) {
      const ev = (r.ev || []).filter((e) => e.t >= r.from && e.t < r.from + r.len).sort((x, y) => x.t - y.t);
      this.replay = { t0: r.t0, from: r.from, len: r.len, ev, i: 0 };
      this.pending.length = 0; this.skyQ.length = 0; this.lit = {};
    },
    replayStop() { this.replay = null; this.lit = {}; },
    dawnLevel(now) {
      const R = this.replay;
      if (R) return Math.max(0, Math.min(1, (now - R.t0 - R.from) / Math.max(0.1, R.len)));
      return AMB.game && AMB.game.s && AMB.game.s.ended ? 1 : 0; // the instrument handed over: the garden stays at dawn
    },
    // the beat (0..1 since the last one, strong = beat 1 or 3), null when the sequencer is stopped
    beatPhase(now) {
      const S = AMB.seq; if (!S || !S.playing || !S.stepDur) return null;
      const sd = S.stepDur(), pos = (S.step - (S.nextTime - now) / sd - (S.origin || 0)) / 4, bt = Math.floor(pos);
      return { ph: pos - bt, strong: ((bt % 2) + 2) % 2 === 0 };
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
      this.hMax = Math.max(12, Math.min(58, Math.floor((avail / this.px - 10) / 1.1))); // S4.6: the flowers (≈ 6 rows more than the old heads) fit in
      // S4.6: each plant may spread half-way to its neighbours (or to the edge), never over them (phones)
      const xs = this.plants.slice().sort((u, v) => u.x - v.x);
      xs.forEach((p, i) => { p.roomL = (i ? (p.x - xs[i - 1].x) / 2 : p.x) - 1; p.roomR = (i < xs.length - 1 ? (xs[i + 1].x - p.x) / 2 : W - p.x) - 1; });
      this.ceil = ceil;
      // S4.5w: after an opening, a new plant grows from 0, a taller one from its old height
      const stSig = this.signature(st), now = this.clock(), hs = {};
      for (const p of this.plants) hs[p.id] = this.heightCells(p);
      if (this.growNext && stSig !== this.stSig && !this.reduced) {
        const start = Math.max(this.growStart == null ? now : this.growStart, now);
        for (const p of this.plants) { const was = this.prevH[p.id]; if (was == null || hs[p.id] > was) this.grow[p.id] = { from: was == null ? 0 : was / hs[p.id], start }; }
      }
      if (stSig !== this.stSig) this.growNext = false;
      this.stSig = stSig; this.prevH = hs;
      this.W = W; this.H = H; this.lastCheck = this.now();
      return true;
    },

    // ---- S4.6 the look follows the settings: targets from the store (look), smoothed per plant (cur, ~0.35 s);
    // a touched control (sources below) kicks its plants: a damped bounce, a wider sway, the plant lit while it is touched ----
    KICK: new Set(['user', 'macro', 'xy']),
    watch() {
      const S = AMB.store;
      if (!S || S === this.watched || typeof S.on !== 'function') return;
      this.watched = S; this.lookDirty = true;
      S.on((k, v, src) => this.onSet(k, src));
    },
    onSet(key, src) {
      this.lookDirty = true;
      if (!this.KICK.has(src) || !this.running()) return; // nothing is kept for a garden off screen
      const t = this.t || 0;
      for (const n of SCENE_OF[key] || []) this.kick[n] = 1; // S5.8: the scene layer it drives
      for (const id of concerns(key)) { const k = this.kicks[id]; if (k && t - k.last < 0.25) k.last = t; else this.kicks[id] = { t0: t, last: t }; } // a slider held: one bounce, then it follows
    },
    // size aspect → scale of the plant: 1 at the layer's default setting (the plants of before S4.6), down to 0.5 at
    // Niveau 0, up to SZ_MAX at the top; the stage HUD and the neighbours cap it when drawn
    SZ_MAX: 1.3,
    sizeK(id, v) {
      const d = (this.lookDef || (this.lookDef = look(() => undefined)))[id].size;
      return v <= d ? 0.5 + 0.5 * v / (d || 1) : 1 + (this.SZ_MAX - 1) * (v - d) / ((1 - d) || 1);
    },
    updateLook(dt) {
      if (this.lookDirty || !this.aim) { const S = AMB.store, get = S && typeof S.get === 'function' ? (k) => S.get(k) : () => undefined; this.aim = look(get); this.lookDirty = false; }
      const kT = this.reduced ? 1 : 1 - Math.exp(-dt / 0.11);
      for (const p of this.plants) {
        const a = this.aim[p.id]; if (!a) continue;
        const c = this.cur[p.id] || (this.cur[p.id] = { ...a });
        for (const k of ASPECTS) c[k] += (a[k] - c[k]) * kT;
        p.look = c;
      }
    },

    // ---- S5.8 scene layers: targets from the table (store + polled app state), smoothed like the plants (~0.35 s);
    // a polled state that changes (mode, play / stop, section) kicks its layer; the impulses fade in ~0.8 s ----
    layers() { const S = AMB.store; return scene(S && typeof S.get === 'function' ? (k) => S.get(k) : () => undefined); },
    updateScene(dt) {
      const S = AMB.store, get = S && typeof S.get === 'function' ? (k) => S.get(k) : () => undefined;
      if (this.lookDirty || !this.sAim) { this.sAim = scene(get); this.sDef = this.sDef || scene(() => undefined); }
      else for (const n in SCENE) if (SCENE[n].poll) { let v = 0; try { v = +SCENE[n].poll() || 0; } catch (e) {} this.sAim[n] = Math.max(0, Math.min(1, v)); }
      for (const n in SCENE) if (SCENE[n].poll) { const v = this.sAim[n]; if (this.sPoll[n] != null && this.sPoll[n] !== v) this.kick[n] = 1; this.sPoll[n] = v; }
      const kT = this.reduced ? 1 : 1 - Math.exp(-dt / 0.11);
      for (const n in SCENE) { const a = this.sAim[n], c = this.sc[n]; this.sc[n] = c == null ? a : c + (a - c) * kT; }
      for (const n in this.kick) { this.kick[n] -= dt / 0.8; if (this.kick[n] <= 0) delete this.kick[n]; }
      // the tempo is the scene's speed (Flottant slower); reduced motion: the scene stands still
      const tp = norm('global.tempo', get('global.tempo')), fl = val(get, 'global.time') === 'Flottant';
      this.speed = (0.5 + 1.5 * tp) * (fl ? 0.6 : 1);
      if (!this.reduced) this.st += dt * this.speed;
    },
    // how much of a layer is drawn: its intensity squared (the default settings keep a calm scene, the ends are loud),
    // plus the impulse of a touch
    amt(n) { const v = this.sc[n] || 0; return Math.min(1, v * v + 0.8 * (this.kick[n] || 0)); },
    // cached canvases of the scene, rebuilt only when the size changes
    fx(name, W, H, build) {
      const key = name + '|' + W + 'x' + H + '|' + (this.px || 3);
      let c = this.fxc[name];
      if (c && c.key === key) return c.cv;
      this.cacheMisses++;
      const cv = build(W, H, this.px || 3);
      this.fxc[name] = { key, cv };
      return cv;
    },
    canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; },
    // the sky's layers (under the ground and the plants): tint flash, aurora, rays, clouds, twinkling stars, song
    drawSky(g, W, gd) {
      const px = this.px || 3, T = this.st, red = this.reduced;
      let a;
      if ((a = this.kick.hue || 0) > 0.02) { g.fillStyle = `rgba(255,226,190,${(0.16 * a).toFixed(3)})`; g.fillRect(0, 0, W, gd); }
      g.globalCompositeOperation = 'lighter';
      if ((a = this.amt('aurora')) > 0.03) {
        const cv = this.fx('aurora', W, gd, (w, h) => {
          const c = this.canvas(w / 4, h * 0.55 / 4), x = c.getContext('2d');
          for (let i = 0; i < c.width; i++) for (let r = 0; r < 2; r++) {
            const y = c.height * (0.35 + 0.22 * Math.sin(i * 0.035 + r * 2.1) + 0.08 * Math.sin(i * 0.11 + r)), hgt = c.height * (0.25 + 0.15 * Math.sin(i * 0.05 + r * 3));
            const grd = x.createLinearGradient(0, y - hgt, 0, y + 4); grd.addColorStop(0, 'rgba(90,255,190,0)'); grd.addColorStop(0.8, r ? 'rgba(170,110,255,0.45)' : 'rgba(90,255,190,0.5)'); grd.addColorStop(1, 'rgba(90,255,190,0)');
            x.fillStyle = grd; x.fillRect(i, y - hgt, 1, hgt + 4);
          }
          return c;
        });
        const dx = red ? 0 : Math.sin(T * 0.25) * W * 0.06;
        g.imageSmoothingEnabled = true; g.globalAlpha = Math.min(1, 0.15 + 0.85 * a);
        g.drawImage(cv, dx - W * 0.06, gd * 0.04, W * 1.12, gd * 0.55); g.imageSmoothingEnabled = false;
      }
      if ((a = this.amt('rays')) > 0.03) {
        const cv = this.fx('rays', W, gd, (w, h) => {
          const c = this.canvas(w / 4, h / 4), x = c.getContext('2d');
          for (let i = 0; i < 5; i++) {
            const x0 = c.width * (0.1 + 0.2 * i), sp = c.width * (0.05 + 0.03 * (i % 3));
            const grd = x.createLinearGradient(0, 0, 0, c.height); grd.addColorStop(0, 'rgba(255,214,150,0.5)'); grd.addColorStop(1, 'rgba(255,214,150,0)');
            x.fillStyle = grd; x.beginPath(); x.moveTo(x0, 0); x.lineTo(x0 + sp * 0.4, 0); x.lineTo(x0 + sp * 3 + c.width * 0.15, c.height); x.lineTo(x0 + c.width * 0.15, c.height); x.closePath(); x.fill();
          }
          return c;
        });
        g.imageSmoothingEnabled = true; g.globalAlpha = Math.min(1, 0.6 * a * (red ? 1 : 0.8 + 0.2 * Math.sin(T * 0.6)));
        g.drawImage(cv, red ? 0 : Math.sin(T * 0.15) * W * 0.03, 0, W, gd); g.imageSmoothingEnabled = false;
      }
      if ((a = this.amt('twinkle')) > 0.03) { // 48 stars: how many and how fast they twinkle
        const r = mulberry(31), n = Math.round(8 + 40 * a), s = Math.max(1, px - 1);
        for (let i = 0; i < n; i++) {
          const x = Math.floor(r() * W / px) * px, y = Math.floor(r() * gd * 0.8 / px) * px, ph = r() * 6.283;
          g.globalAlpha = Math.min(1, (0.25 + 0.75 * a) * (red ? 0.7 : 0.5 + 0.5 * Math.sin(T * (1.5 + 5 * a) + ph)));
          g.fillStyle = i % 5 ? '#fff4d6' : '#bfe6ff'; g.fillRect(x, y, s, s);
          if (a > 0.5 && i % 7 === 0) { g.fillRect(x - px, y, s, s); g.fillRect(x + px, y, s, s); g.fillRect(x, y - px, s, s); g.fillRect(x, y + px, s, s); }
        }
      }
      g.globalCompositeOperation = 'source-over';
      if ((a = this.amt('clouds')) > 0.03) { // pixel clouds drifting across the sky (Dérive)
        const cv = this.fx('cloud', W, gd, (w, h, px) => {
          const c = this.canvas(48 * px, 12 * px), x = c.getContext('2d'), r = mulberry(5);
          for (let j = 0; j < 12; j++) for (let i = 0; i < 48; i++) { const d = ((i - 24) / 24) ** 2 + ((j - 8) / (j < 8 ? 7 : 4)) ** 2 + 0.25 * Math.sin(i * 0.7) * (j < 6 ? 1 : 0); if (d < 1 && r() < 0.92) { x.fillStyle = j < 5 ? 'rgba(232,214,196,0.9)' : 'rgba(170,150,140,0.85)'; x.fillRect(i * px, j * px, px - 1, px - 1); } }
          return c;
        });
        const r = mulberry(17), n = Math.max(1, Math.round(a * 6)), span = W + cv.width;
        for (let i = 0; i < n; i++) {
          const x0 = r() * span, y = gd * (0.08 + 0.4 * r()), sc = 0.6 + 0.6 * r(), v = (6 + 10 * r()) * px * (0.3 + a);
          const x = ((x0 + T * v) % span + span) % span - cv.width;
          g.globalAlpha = Math.min(1, 0.12 + 0.4 * a); g.drawImage(cv, Math.round(x), Math.round(y), Math.round(cv.width * sc), Math.round(cv.height * sc));
        }
      }
      if ((a = this.sc.song || 0) > 0.01) { g.globalAlpha = 0.6; g.fillStyle = '#ffb347'; g.fillRect(0, 0, Math.round(W * a), Math.max(2, px)); }
      if ((a = this.kick.song || 0) > 0.02 && !red) { const x = (1 - a) * W * 1.2 - W * 0.1; g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 * a; g.fillStyle = '#ffd9a0'; g.fillRect(Math.round(x), 0, Math.round(W * 0.08), gd); g.globalCompositeOperation = 'source-over'; }
      g.globalAlpha = 1;
    },
    // the ground ondulates (rhythm feel): two wavy lines of light along its edge
    drawGround(g, W, H, gd) {
      const a = this.amt('ripple'); if (a < 0.03) return;
      const px = this.px || 3, T = this.st, A = px * (0.5 + 3 * a), st = px * 2, s = Math.max(1, px >> 1);
      g.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 2; j++) {
        g.fillStyle = `rgba(255,179,71,${((0.12 + 0.3 * a) / (j + 1)).toFixed(3)})`;
        const y0 = gd + px * (2 + 5 * j), f = 0.012 + 0.01 * j;
        for (let x = 0; x < W; x += st) g.fillRect(x, Math.round(y0 + Math.sin(x * f + T * (2.5 + j)) * A), st - 1, s);
      }
      g.globalCompositeOperation = 'source-over';
    },
    // S5.8 echo: faded copies of a plant trailing to its right (Écho: how many, how far)
    drawEcho(g, p, s, kx, ky, sway, gy, ox, oy) {
      const a = this.amt('echo'); if (a < 0.1 || gy < 0.05) return;
      const n = 1 + Math.round(a * 2), d = this.px * (3 + 7 * a);
      for (let i = n; i >= 1; i--) {
        g.globalAlpha = Math.min(1, (0.08 + 0.3 * a) / i);
        g.setTransform(kx, 0, -sway * ky * gy, ky * gy, p.x + ox + i * d, p.y + oy); g.drawImage(s.cv, -s.w / 2, -s.h);
      }
      g.globalAlpha = 1;
    },
    // in front of the plants: mist, fireflies, snow, frost, lens (grid / staff)
    drawFront(g, W, H, gd) {
      const px = this.px || 3, T = this.st, red = this.reduced, s = Math.max(1, px - 1);
      let a;
      if ((a = this.amt('haze')) > 0.03) {
        const bh = Math.round(H * 0.32), cv = this.fx('haze', W, H, (w, h) => {
          const c = this.canvas(w / 4, bh / 4), x = c.getContext('2d'), r = mulberry(11);
          const grd = x.createLinearGradient(0, 0, 0, c.height); grd.addColorStop(0, 'rgba(200,190,220,0)'); grd.addColorStop(0.6, 'rgba(200,190,220,0.4)'); grd.addColorStop(1, 'rgba(200,190,220,0.1)');
          x.fillStyle = grd; x.fillRect(0, 0, c.width, c.height);
          for (let i = 0; i < 14; i++) { const cx = r() * c.width, cy = c.height * (0.35 + 0.4 * r()), R = c.height * (0.2 + 0.3 * r()), gg = x.createRadialGradient(cx, cy, 0, cx, cy, R); gg.addColorStop(0, 'rgba(220,210,235,0.35)'); gg.addColorStop(1, 'rgba(220,210,235,0)'); x.fillStyle = gg; x.fillRect(cx - R, cy - R, 2 * R, 2 * R); }
          return c;
        });
        const off = red ? 0 : ((T * px * 4) % W + W) % W, y = gd - bh * 0.7;
        g.imageSmoothingEnabled = true; g.globalAlpha = Math.min(1, 0.9 * a);
        g.drawImage(cv, off, y, W, bh); g.drawImage(cv, off - W, y, W, bh); g.imageSmoothingEnabled = false;
      }
      g.globalCompositeOperation = 'lighter';
      if ((a = this.amt('fireflies')) > 0.03) {
        const r = mulberry(23), n = Math.round(4 + 26 * a);
        for (let i = 0; i < n; i++) {
          const bx = r() * W, by = gd - (0.08 + 0.5 * r()) * gd * 0.7, ph = r() * 6.283, f = 0.3 + r() * 0.5;
          const x = bx + (red ? 0 : Math.sin(T * f + ph) * 14 * px), y = by + (red ? 0 : Math.cos(T * f * 1.3 + ph) * 6 * px);
          g.globalAlpha = Math.min(1, (0.3 + 0.7 * a) * (red ? 0.8 : 0.5 + 0.5 * Math.sin(T * 3 * f + ph * 2)));
          g.fillStyle = '#ffe07a'; g.fillRect(Math.round(x / px) * px, Math.round(y / px) * px, s, s);
          g.globalAlpha *= 0.35; g.fillRect(Math.round(x / px) * px - px, Math.round(y / px) * px - px, 3 * px - 1, 3 * px - 1);
        }
      }
      g.globalCompositeOperation = 'source-over';
      if ((a = this.amt('snow')) > 0.03) {
        const r = mulberry(41), n = Math.round(6 + 64 * a); g.fillStyle = '#e4efff';
        for (let i = 0; i < n; i++) {
          const x0 = r() * W, y0 = r() * H, v = (8 + 14 * r()) * px, ph = r() * 6.283;
          const y = ((y0 + T * v) % H + H) % H, x = x0 + (red ? 0 : Math.sin(T * 0.8 + ph) * 3 * px);
          g.globalAlpha = Math.min(1, 0.3 + 0.6 * a); g.fillRect(Math.round(x / px) * px, Math.round(y / px) * px, s, s);
        }
      }
      if ((a = this.amt('frost')) > 0.03) {
        const cv = this.fx('frost', W, H, (w, h, px) => {
          const c = this.canvas(w, h), x = c.getContext('2d'), r = mulberry(53), q = px * 2;
          x.fillStyle = 'rgba(200,235,255,0.85)';
          for (let k = 0; k < 40; k++) { // branches growing in from the edges
            const side = k % 4; let cx = side === 1 ? w : side === 3 ? 0 : r() * w, cy = side === 0 ? 0 : side === 2 ? h : r() * h;
            let dx = side === 1 ? -1 : side === 3 ? 1 : (r() - 0.5), dy = side === 0 ? 1 : side === 2 ? -1 : (r() - 0.5);
            for (let i = 0, L = 6 + r() * 16; i < L; i++) { x.fillRect(Math.round(cx / q) * q, Math.round(cy / q) * q, q - 1, q - 1); cx += dx * q; cy += dy * q; if (r() < 0.3) dx += (r() - 0.5); if (r() < 0.3) dy += (r() - 0.5); }
          }
          return c;
        });
        g.globalAlpha = Math.min(1, 0.85 * a); g.drawImage(cv, 0, 0);
      }
      if ((a = this.amt('lens')) > 0.03) {
        const cv = this.fx('lens', W, H, (w, h, px) => {
          const c = this.canvas(w, h), x = c.getContext('2d'), q = px * 12;
          x.fillStyle = 'rgba(140,200,255,0.5)';
          for (let X = 0; X < w; X += q) for (let Y = 0; Y < h; Y += px * 3) x.fillRect(X, Y, Math.max(1, px >> 1), Math.max(1, px >> 1));
          for (let Y = 0; Y < h; Y += q) for (let X = 0; X < w; X += px * 3) x.fillRect(X, Y, Math.max(1, px >> 1), Math.max(1, px >> 1));
          return c;
        });
        const sv = this.sc.lens || 0, k = this.kick.lens || 0;
        g.globalAlpha = Math.min(1, 0.5 * Math.min(1, 2 * sv) + 0.4 * k); g.drawImage(cv, 0, 0);
        const staff = Math.max(0, 2 * sv - 1); // Composer: the five lines of a staff across the sky
        if (staff > 0.02) { g.globalAlpha = Math.min(1, 0.35 * staff + 0.3 * k); g.fillStyle = '#ffd9a0'; for (let i = 0; i < 5; i++) g.fillRect(0, Math.round(gd * 0.18 + i * px * 4), W, Math.max(1, px >> 1)); }
      }
      g.globalAlpha = 1;
    },
    // full-screen filters, last: the tape band and wobble (Cassette), grain and vignette (Usure), the veil when stopped
    drawPost(g, W, H) {
      const px = this.px || 3, T = this.st, red = this.reduced;
      let a;
      if ((a = this.amt('tape')) > 0.03) {
        const bh = Math.round(H * 0.07), cv = this.fx('tape', W, H, (w) => {
          const c = this.canvas(w / 4, bh), x = c.getContext('2d'), r = mulberry(61);
          const grd = x.createLinearGradient(0, 0, 0, bh); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.5, 'rgba(220,230,255,0.25)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = grd; x.fillRect(0, 0, c.width, bh);
          for (let i = 0; i < 60; i++) { x.fillStyle = ['rgba(255,60,60,0.5)', 'rgba(60,255,200,0.5)', 'rgba(80,120,255,0.5)'][i % 3]; x.fillRect(r() * c.width, bh * (0.3 + 0.4 * r()), 2 + r() * 10, 1); }
          return c;
        });
        const y = red ? H * 0.6 : ((T * H * 0.12) % (H + bh)) - bh;
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, 0.2 + 0.7 * a); g.imageSmoothingEnabled = true;
        g.drawImage(cv, 0, Math.round(y), W, bh); g.imageSmoothingEnabled = false; g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        if (a > 0.2) for (let i = 0; i < 3; i++) { // tracking lines: a dark and a coloured line that jitter (no read-back of the canvas: it would stall)
          const sy = Math.round(((T * (40 + 30 * i) * px + i * H / 3) % H) / px) * px, dx = red ? 0 : Math.round(Math.sin(T * 9 + i * 2) * a * px * 6);
          g.globalAlpha = Math.min(1, 0.5 * a); g.fillStyle = 'rgba(0,0,0,0.8)'; g.fillRect(0, sy, W, px);
          g.globalCompositeOperation = 'lighter'; g.fillStyle = i % 2 ? 'rgba(255,70,90,0.6)' : 'rgba(70,200,255,0.6)'; g.fillRect(dx, sy + px, W, Math.max(1, px >> 1)); g.globalCompositeOperation = 'source-over';
        }
        g.globalAlpha = 1;
      }
      if ((a = this.amt('grain')) > 0.03) {
        const nw = Math.ceil(W / (2 * px)), nh = Math.ceil(H / (2 * px)), f = red ? 0 : Math.floor(T * 14) % 4;
        const cv = this.fx('grain' + f, W, H, () => {
          const c = this.canvas(nw, nh), x = c.getContext('2d'), d = x.createImageData(nw, nh), r = mulberry(70 + f);
          for (let i = 0; i < d.data.length; i += 4) { const v = r(), on = v < 0.18; const l = v < 0.09 ? 255 : 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = l; d.data[i + 3] = on ? 90 : 0; }
          x.putImageData(d, 0, 0); return c;
        });
        const vg = this.fx('vignette', W, H, (w, h) => {
          const c = this.canvas(w / 4, h / 4), x = c.getContext('2d'), gg = x.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.3, c.width / 2, c.height / 2, c.width * 0.62);
          gg.addColorStop(0, 'rgba(20,10,0,0)'); gg.addColorStop(1, 'rgba(20,10,0,0.9)'); x.fillStyle = gg; x.fillRect(0, 0, c.width, c.height); return c;
        });
        g.globalAlpha = Math.min(1, 0.15 + 0.85 * a); g.drawImage(cv, 0, 0, W, H);
        g.imageSmoothingEnabled = true; g.globalAlpha = Math.min(1, 0.75 * a); g.drawImage(vg, 0, 0, W, H); g.imageSmoothingEnabled = false;
      }
      const pl = this.sc.play == null ? 1 : this.sc.play, pk = this.kick.play || 0;
      if (pl < 0.98) { g.globalAlpha = 1; g.fillStyle = `rgba(6,4,2,${(0.3 * (1 - pl)).toFixed(3)})`; g.fillRect(0, 0, W, H); }
      if (pk > 0.02) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1; g.fillStyle = `rgba(255,200,130,${(0.12 * pk).toFixed(3)})`; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
      g.globalAlpha = 1;
    },

    // ---- events: queued with their audio time, applied when they sound ----
    onEvent(layer, time, vel) {
      if (!this.running() || this.replay) return; // the finale lights the plants from the recorded song only
      this.pending.push({ layer, time: time || 0, vel: vel == null ? 0.7 : vel });
      if (this.pending.length > 200) this.pending.splice(0, this.pending.length - 200);
    },
    running() { return this.active && this.visible && !this.paused && !(typeof document !== 'undefined' && document.hidden); },
    hit(layer, vel) {
      const p = this.plants.find((q) => q.id === layer);
      if (!p) return false;
      this.energy[layer] = Math.min(1, (this.energy[layer] || 0) * 0.5 + 0.5 + vel * 0.5);
      if (!this.reduced && this.parts.length < PARTS_MAX) {
        const hC = this.heightCells(p), px = this.px, r = this.rng || (this.rng = mulberry(99));
        this.parts.push({ x: p.x + (r() - 0.5) * 8 * px, y: p.y - hC * px * (p.sz || 1) * (0.6 + r() * 0.4), vx: (r() - 0.5) * 12 * px, vy: -(8 + r() * 10) * px, life: 1, col: r() < 0.3 ? [255, 233, 168] : p.col, s: r() < 0.5 ? 1 : 2 });
      }
      return true;
    },

    // ---- S5.2 splashes: queued with their audio time (a scheduled note shows when it sounds); at most WAVES_PER_PLANT
    // per plant, a machine note never pushes out the player's ----
    onSplash(ev, d) {
      if (!this.running() || this.replay) return;
      const P = AMB.pianoRoll, s = splash(ev, d, !!(P && P.roll && P.roll.recording));
      if (!s || !this.plants.some((p) => p.id === s.plant)) return;
      const mine = this.waves.filter((w) => w.plant === s.plant);
      if (mine.length >= WAVES_PER_PLANT) {
        const old = mine.find((w) => w.who === 'machine') || (s.who === 'machine' ? null : mine[0]);
        if (!old) return;
        this.waves.splice(this.waves.indexOf(old), 1);
      }
      this.waves.push({ ...s, t0: s.time, off: null, fired: false });
    },
    // S5.3 → S5.2: a celebration (kind = 'streak' | 'record' | 'tier', SPLASH) bursts from a plant (the Melody's by default;
    // S5.9 the juice table passes the opened layer's) at audio time `at` (the jingle's beat), same splashes, same JUICE
    cheer(kind, at, plant) {
      const S = SPLASH[kind]; if (!S) return false;
      this.onSplash('cheer', { kind, plant, time: at == null ? this.clock() : at });
      return true;
    },
    // a held note let go (liveOff id), or every note (panic: id null)
    release(id, time) { const t = time == null ? this.clock() : time; for (const w of this.waves) if (w.off == null && w.held != null && (id == null || w.held === id)) w.off = t; },
    // brightness a (0..1) and ring radius r (0..1) of a splash now; null = over. A held note stays lit until released.
    waveEnv(w, now) {
      const S = SPLASH[w.who], age = now - w.t0, held = w.held != null;
      if (held && w.off == null && ((w.held === 'chord' && age > 0.05 && !(AMB.seq && AMB.seq.chordHold)) || age > HELD_MAX)) w.off = now;
      if (this.reduced) { // a fixed, brief glow, no wave
        const end = held ? (w.off == null ? Infinity : Math.max(w.off, w.t0 + 0.15)) : w.t0 + 0.3;
        return now < end ? { a: 1, r: 0 } : null;
      }
      const q = Math.min(1, Math.max(0, age) / S.life), r = 1 - (1 - q) ** 3;
      let a = held ? (q < 1 ? 1 - 0.45 * q : 0.55) : 1 - q;
      if (held && w.off != null) a *= 1 - Math.max(0, now - Math.max(w.off, w.t0)) / 0.35;
      return a > 0.01 ? { a, r } : null;
    },
    // where a note sits on its plant: low notes near the root, high ones near the top (it bends with the plant)
    origin(p, pitch) {
      const h = this.heightCells(p) * this.px * (p.sz || 1) * (p.gy == null ? 1 : p.gy), y = p.y - h * (0.2 + 0.75 * pitch);
      return { x: p.x + (p.sway || 0) * (p.y - y), y };
    },
    // its colour: the plant's, lighter for high notes (5 steps, so the glows stay cached)
    tint(col, pitch) { const k = Math.round(pitch * 4) / 4; return col.map((v) => Math.round(v + (255 - v) * 0.55 * k)); },
    // the moment it sounds: particles fly out, the plant flashes and squashes, a chord or a loud note shakes the scene
    fire(w, p) {
      w.fired = true;
      if (this.reduced) return;
      const S = SPLASH[w.who], v = 0.4 + 0.6 * w.vel, o = this.origin(p, w.pitch), px = this.px, r = this.rng || (this.rng = mulberry(99));
      const col = this.tint(p.col, w.pitch), n = Math.round(S.parts * JUICE * v);
      for (let k = 0; k < n; k++) {
        const an = -Math.PI / 2 + (r() - 0.5) * (S.spread || 2.8), sp = (9 + r() * 24) * px * (0.6 + 0.5 * v) * (0.7 + 0.3 * JUICE);
        const c = r(), big = w.who !== 'machine' ? (r() < 0.35 ? 3 : 2) : 1;
        this.parts.push({ x: o.x, y: o.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 1, decay: 1 + r() * 0.7, g: 24, col: c < 0.3 ? [255, 240, 200] : c < 0.65 ? col : p.col, s: big });
      }
      if (this.parts.length > PARTS_MAX) this.parts.splice(0, this.parts.length - PARTS_MAX);
      this.squash[p.id] = { t0: this.t || 0, amp: S.squash * JUICE * v };
      this.zap[p.id] = Math.max(this.zap[p.id] || 0, S.flash * v);
      if (w.shake) this.shake = { t0: this.t || 0, amp: Math.max(this.shake ? this.shake.amp * 0.5 : 0, w.shake * JUICE) };
    },
    // drawn in 'lighter' mode: a glow where the note sits (lit as long as it is held) and a ring of LEDs that spreads
    drawSplash(g, now) {
      const px = this.px;
      for (let i = this.waves.length - 1; i >= 0; i--) {
        const w = this.waves[i]; if (w.t0 > now + 0.02) continue;
        const p = this.plants.find((q) => q.id === w.plant), e = p && this.waveEnv(w, now);
        if (!e) { this.waves.splice(i, 1); continue; }
        if (!w.fired) this.fire(w, p);
        const S = SPLASH[w.who], o = this.origin(p, w.pitch), A = S.ring * (0.4 + 0.6 * w.vel) * e.a, col = w.col || (w.col = this.tint(p.col, w.pitch));
        const Rg = Math.max(12, Math.round(px * (w.who === 'machine' ? 6 : 12))), gl = this.glow(col, Rg);
        g.globalAlpha = Math.min(1, this.reduced ? 0.8 * S.ring : A); g.drawImage(gl, o.x - Rg, o.y - Rg);
        if (this.reduced) continue;
        const nd = w.who === 'machine' ? 10 : 20, R = px * (2 + (w.who === 'machine' ? 8 : 22) * (0.5 + 0.5 * w.vel) * (0.6 + 0.4 * JUICE) * e.r), sz = Math.max(1, px - 1);
        g.fillStyle = w.fill || (w.fill = rgb(col)); g.globalAlpha = Math.min(1, A);
        for (let k = 0; k < nd; k++) { const an = (k / nd) * 6.283 + w.t0 * 3; g.fillRect(Math.round((o.x + Math.cos(an) * R) / px) * px, Math.round((o.y + Math.sin(an) * R * 0.8) / px) * px, sz, sz); }
      }
      g.globalAlpha = 1;
    },

    // ---- one frame (called by AMB.visual.draw while the mode is « Jardin ») ----
    frame(g, W, H, dpr = 1) {
      if (!this.running()) { this.lastT = null; return false; }
      const t0 = this.now();
      if (this.sig == null || this.W !== W || this.H !== H || t0 - (this.lastCheck || 0) > 1000) this.refresh(W, H, this.W !== W || this.H !== H);
      const dt = this.lastT == null ? 1 / 60 : Math.max(0, Math.min(0.1, (t0 - this.lastT) / 1000));
      this.lastT = t0; this.t = (this.t || 0) + dt;
      const now = this.clock();
      this.watch(); this.updateScene(dt); this.updateLook(dt);
      for (let i = this.pending.length - 1; i >= 0; i--) { const e = this.pending[i]; if (e.time <= now + 0.02) { this.pending.splice(i, 1); this.hit(e.layer, e.vel); } }
      const ans = this.answer(now);
      if (ans) this.lightAnswer(ans);
      for (let i = this.skyQ.length - 1; i >= 0; i--) { const e = this.skyQ[i]; if (e.time <= now + 0.02) { this.skyQ.splice(i, 1); this.setSky(e.key); } }
      const R = this.replay;
      if (R) for (; R.i < R.ev.length && R.ev[R.i].t <= now - R.t0; R.i++) {
        const e = R.ev[R.i];
        if (e.layer === 'chord') this.setSky(this.chordKey(e.deg)); else if (this.hit(e.layer, e.vel == null ? 0.7 : e.vel)) this.lit[e.layer] = 1;
      }

      // S5.2: the whole scene shakes a little on a forced chord or a loud note (offset ox, oy on every transform)
      let ox = 0, oy = 0; const sh = this.shake;
      if (sh) { const age = this.t - sh.t0; if (age > 0.4 || this.reduced) this.shake = null; else { const A = sh.amp * this.px * 2.5 * Math.exp(-age * 11); ox = Math.round(A * Math.sin(age * 95)); oy = Math.round(A * 0.7 * Math.cos(age * 71)); } }
      this.ox = ox; this.oy = oy;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; g.imageSmoothingEnabled = false;
      if (ox || oy) { g.fillStyle = '#0b0a08'; g.fillRect(0, 0, W, H); g.setTransform(1, 0, 0, 1, ox, oy); }
      // sky: the previous chord's, the current one fading in over it, the dawn (finale), the stars; then the ground
      const gd = this.ground, bg = this.background(W, H, gd), sf = Math.min(1, ((this.t || 0) - this.skyT) / SKY_FADE), dawn = this.dawnLevel(now);
      if (sf < 1) g.drawImage(this.sky(this.skyPrevKey || 'night', W, gd), 0, 0);
      g.globalAlpha = sf; g.drawImage(this.sky(this.skyKey || 'night', W, gd), 0, 0);
      if (dawn > 0) { g.globalAlpha = dawn * 0.92; g.drawImage(this.sky('dawn', W, gd), 0, 0); }
      g.globalAlpha = 1 - dawn * 0.85; g.drawImage(bg.stars, 0, 0);
      g.globalAlpha = 1; this.drawSky(g, W, gd); // S5.8 sky layers
      g.drawImage(bg.ground, 0, gd); this.drawGround(g, W, H, gd);
      const px = this.px, red = this.reduced, fs = Math.round(Math.max(11 * dpr, px * 2.6));
      this.dpr = dpr;
      // the ground breathes on the beat (stronger on beats 1 and 3); still in reduced motion and during the finale
      const bp = red || R ? null : this.beatPhase(now);
      if (bp || dawn > 0) {
        g.globalCompositeOperation = 'lighter';
        if (dawn > 0) { g.fillStyle = `rgba(242,166,90,${(dawn * 0.1).toFixed(3)})`; g.fillRect(0, gd, W, H - gd); }
        if (bp) { const a = (bp.strong ? 0.3 : 0.16) * Math.exp(-bp.ph * 5); this.pulse = a; g.fillStyle = `rgba(255,179,71,${a.toFixed(3)})`; g.fillRect(0, gd, W, Math.max(2, px)); g.fillStyle = `rgba(255,179,71,${(a * 0.18).toFixed(3)})`; g.fillRect(0, gd, W, H - gd); }
        g.globalCompositeOperation = 'source-over';
      }
      const all = this.plants.concat(this.rares), sy = {};
      for (const p of all) {
        const s = this.sprite(p, px), e = this.energy[p.id] || 0, gy = (sy[p.id] = p.rare ? 1 : this.growth(p.id, now));
        const a = p.look, kk = this.kicks[p.id], since = kk ? this.t - kk.t0 : 9, hot = (p.hot = kk ? Math.max(0, 1 - (this.t - kk.last) / 0.6) : 0);
        if (kk && since > 0.9 && !hot) delete this.kicks[p.id];
        const sq = this.squash[p.id], sqA = sq ? this.t - sq.t0 : 9; if (sq && (sqA > 0.9 || red)) delete this.squash[p.id];
        const squash = red || !sq ? 0 : -sq.amp * Math.exp(-sqA * 7) * Math.cos(sqA * 22); // S5.2: a note squashes it, then it stretches back
        const spring = red || !kk ? 0 : Math.exp(-since * 6), bounce = (p.bounce = 0.14 * spring * Math.cos(since * 20) + squash);
        const sz = a ? this.sizeK(p.id, a.size) : 1;
        let sway = 0;
        if (!red) {
          if (a) {
            const ph = (this.swPh[p.id] = (this.swPh[p.id] == null ? p.phase : this.swPh[p.id]) + dt * (0.45 + 1.4 * a.pace) * (0.7 + 0.6 * a.sway));
            sway = (0.015 + 0.075 * a.sway) * (1 + e * 1.5) * (1 + 2.5 * hot) * (Math.sin(ph) + 0.3 * Math.sin(2.7 * ph + p.phase)) + 0.2 * spring * Math.sin(since * 16);
          } else sway = (Math.sin(this.t * 0.7 + p.phase) * 0.05 + Math.sin(this.t * 1.9 + p.phase * 2) * 0.015) * (1 + e * 1.5);
        }
        const k = red ? 1 : 1 + e * 0.05, wide = p.rare ? 1e9 : Math.min(p.roomL / s.l, p.roomR / s.r); // never over a neighbour (phone)
        const tall = p.rare ? 1e9 : (p.y - (this.H || 0) * (this.ceil || 0)) / s.h; // never into the stage HUD
        const szc = (p.sz = Math.min(sz, Math.max(1, tall / k))), kx = (p.kx = Math.min(k * szc * (1 - 0.6 * bounce), wide)), ky = k * szc * (1 + bounce);
        p.sway = sway; p.k = k; p.gy = gy; // the Réponse leaves follow the plant (drawAnswer)
        if (a && a.halo > 0.03 && gy > 0.01) { // S4.6 halo (Espace): a soft aura, radius in 8 cached steps
          const Rg = Math.round(px * (8 + 18 * Math.round(a.halo * 7) / 7)), gl = this.glow(p.col, Rg);
          g.setTransform(1, 0, 0, 1, ox, oy); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, (0.12 + 0.6 * a.halo) * (R ? 0.3 + 0.7 * Math.min(1, this.lit[p.id] || 0) : 1));
          g.drawImage(gl, p.x - Rg, p.y - this.heightCells(p) * px * p.sz * gy * 0.6 - Rg);
          g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        }
        if (!p.rare && !R) this.drawEcho(g, p, s, kx, ky, sway, gy, ox, oy); // S5.8 Écho: ghost copies behind it
        if (R && !p.rare) g.globalAlpha = 0.3 + 0.7 * Math.min(1, this.lit[p.id] || 0); // finale: dark until its layer plays
        if (a && a.on < 0.99) g.globalAlpha *= 0.3 + 0.7 * a.on; // S5.8: its layer switched off = a dim plant
        if (gy > 0.01) {
          g.setTransform(kx, 0, -sway * ky * gy, ky * gy, p.x + ox, p.y + oy); g.drawImage(s.cv, -s.w / 2, -s.h); // shear from the base: the plant bends, the root stays put; it grows from there
          const lit = Math.max(0.5 * hot, 0.75 * (this.zap[p.id] || 0)); // S4.6: lit while touched; S5.2: a flash on each note
          if (lit > 0.02) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, lit); g.drawImage(s.cv, -s.w / 2, -s.h); g.globalCompositeOperation = 'source-over'; }
          if (hot > 0.02) this.energy[p.id] = Math.max(this.energy[p.id] || 0, 0.55 * hot);
        }
        g.globalAlpha = 1;
        if (!p.rare) { const lb = this.label(p, fs, this.slotW * 0.96); g.setTransform(1, 0, 0, 1, ox, oy); g.globalAlpha = Math.min(1, 0.85 + 0.15 * hot) * Math.min(1, gy * 2); g.drawImage(lb, Math.round(p.x - lb.width / 2), Math.round(p.y + px * 1.5)); if (hot > 0.02) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = hot; g.drawImage(lb, Math.round(p.x - lb.width / 2), Math.round(p.y + px * 1.5)); g.globalCompositeOperation = 'source-over'; } g.globalAlpha = 1; }
      }
      if (ans) this.drawAnswer(g, ans);
      this.drawMark(g, fs);
      g.setTransform(1, 0, 0, 1, ox, oy);
      g.globalCompositeOperation = 'lighter';
      for (const p of all) {
        let e = this.energy[p.id] || 0;
        if (p.rare) e = Math.max(e, red ? 0.35 : 0.25 + 0.25 * Math.sin(this.t * 1.3 + p.phase));
        if (e < 0.02) continue;
        const Rg = Math.max(16, px * (p.rare ? 8 : 12)), gl = this.glow(p.col, Rg), hC = this.heightCells(p) * sy[p.id] * (p.sz || 1);
        g.globalAlpha = Math.min(1, e);
        g.drawImage(gl, p.x - Rg, p.y - hC * px * (p.rare ? 0.6 : 0.85) - Rg);
      }
      g.globalAlpha = 1;
      this.drawSplash(g, now);
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const q = this.parts[i];
        q.life -= dt * (q.decay || 0.8); q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.98; q.vy += (q.g || 2) * px * dt;
        if (q.life <= 0) { this.parts.splice(i, 1); continue; }
        g.fillStyle = rgb(q.col, 1, q.life * 0.9);
        g.fillRect(Math.round(q.x / px) * px, Math.round(q.y / px) * px, px * q.s - 1, px * q.s - 1);
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      this.drawFront(g, W, H, gd); g.setTransform(1, 0, 0, 1, 0, 0); this.drawPost(g, W, H); // S5.8 scene layers in front, then the filters
      g.imageSmoothingEnabled = true; // nearest-neighbour above: crisp LEDs, cheaper shear
      for (const id in this.zap) this.zap[id] = Math.max(0, this.zap[id] - dt * 3.5);
      for (const id in this.energy) this.energy[id] = Math.max(0, this.energy[id] - dt * (red ? 1.2 : 1.6));
      for (const id in this.lit) this.lit[id] = Math.max(0, this.lit[id] - dt * 0.35);
      if (!all.length) { g.font = `${fs * 1.3}px VT323, monospace`; g.fillStyle = '#b38a4f'; g.textAlign = 'center'; g.fillText('Ouvre une couche pour planter ton jardin', W / 2, H * 0.5); g.textAlign = 'start'; }
      const ms = this.now() - t0;
      this.times.push(ms); if (this.times.length > 240) this.times.shift();
      this.frames++;
      return true;
    },
    // ---- S4.2 « Réponse » on the Melody plant ----
    LEAF_OK: [143, 227, 160], LEAF_BAD: [235, 84, 64],
    answer(now) { const P = AMB.puzzles; return P && P.view && this.plants.some((q) => q.id === 'bells') ? P.view(now) : null; },
    // its light: blinks with the phrase, steady while it waits, fades after the answer
    lightAnswer(v) {
      const e = v.phase === 'call' ? (this.reduced ? 0.6 : 0.4 + 0.5 * Math.abs(Math.sin((this.t || 0) * 7)))
        : v.phase === 'answer' ? 0.6 : Math.max(0, 0.5 - v.age / 6);
      this.energy.bells = Math.max(this.energy.bells || 0, e);
    },
    // one leaf per note of the phrase, up the stem, alternately left and right: dim = to play, green = right, red = wrong.
    // The leaves keep a readable size (≥ 4 CSS px a cell) even on a small plant: the stem then reaches up to carry them.
    drawAnswer(g, v) {
      const p = this.plants.find((q) => q.id === 'bells'); if (!p) return 0;
      const gy = p.gy == null ? 1 : p.gy; if (gy < 0.05) return 0; // S4.5w: a plant still growing carries its leaves up
      const px = this.px, lp = Math.max(px, Math.round(4 * (this.dpr || 1))), gap = lp >= 4 ? 1 : 0, k = p.k || 1;
      const h = this.heightCells(p) * px * gy * (p.sz || 1), room = Math.max(h, p.y - (this.H || 0) * (this.ceil || 0) - 3 * lp);
      const y0 = Math.max(h * 0.2, 2 * lp), top = Math.min(room, Math.max(h * 0.88, y0 + (v.len - 1) * 2.4 * lp));
      g.setTransform(k, 0, -(p.sway || 0) * k * gy, k, p.x + (this.ox || 0), p.y + (this.oy || 0)); // bends with the plant
      if (top > h * 0.9) { g.fillStyle = rgb(p.col, 0.7, 0.6); g.fillRect(-Math.floor(lp / 4), -Math.round(top), Math.max(1, Math.round(lp / 2)), Math.round(top - h * 0.85)); }
      let n = 0;
      for (let i = 0; i < v.len; i++) {
        const peg = v.row[i]; if (!peg && v.phase === 'call') continue;
        const y = -Math.round(y0 + (top - y0) * (v.len > 1 ? i / (v.len - 1) : 0.5)), s = i % 2 ? 1 : -1;
        g.fillStyle = !peg ? rgb(p.col, 0.8, 0.5) : rgb(peg.state === 'ok' ? this.LEAF_OK : this.LEAF_BAD);
        for (const [dx, dy] of [[1, 0], [2, 0], [3, 0], [2, -1], [3, -1], [4, -1], [5, -1], [4, -2], [5, -2]]) g.fillRect(s * dx * lp - (s < 0 ? lp : 0), y + dy * lp, lp - gap, lp - gap);
        n++;
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      return n;
    },
    // S5.3: the Réponse tier reached (puzzles.mark(): 0 = Phrases, one more per tier), as LED marks beside the Melody
    // plant's name; the number is the game's, only these few lines draw it (a later skin draws its own)
    drawMark(g, fs) {
      const P = AMB.puzzles, n = Math.min(9, P && P.mark ? P.mark() : 0), p = n && this.plants.find((q) => q.id === 'bells');
      if (!p) return 0;
      const lp = Math.max(2, Math.round(fs * 0.3)), y = Math.round(p.y + this.px * 1.5 + fs * 1.15), x0 = Math.round(p.x - (n * lp * 1.6) / 2);
      g.setTransform(1, 0, 0, 1, this.ox || 0, this.oy || 0); g.fillStyle = rgb(p.col);
      for (let i = 0; i < n; i++) g.fillRect(x0 + Math.round(i * lp * 1.6), y, lp, lp);
      return n;
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
      bus.on('note', (n) => { if (n) { this.onEvent(n.layer, n.time, n.vel); this.onSplash('note', n); } });
      bus.on('grain', (n) => n && this.onEvent('grains', n.time, n.vel));
      bus.on('perc', (n) => { if (n) { this.onEvent('perc', n.time, n.vel); this.onSplash('perc', n); } });
      bus.on('live', (n) => this.onSplash('live', n)); // S5.2: the player's notes, held until 'liveOff'
      bus.on('liveOff', (n) => n && this.release(n.id, n.time));
      bus.on('panic', () => this.release(null));
      bus.on('chord', (c) => {
        if (!c) return; this.onEvent('drone', c.time, 0.6); this.onEvent('pad', c.time, 0.3); this.onSplash('chord', c);
        if (this.running() && !this.replay) { this.skyQ.push({ time: c.time || 0, key: this.chordKey(c.deg) }); if (this.skyQ.length > 8) this.skyQ.shift(); }
      });
      for (const n in SCENE) if (SCENE[n].ev) bus.on(SCENE[n].ev, () => { if (this.running()) this.kick[n] = 1; }); // S5.8: Gel, section
      bus.on('game:puzzle', (e) => { if (e && e.peg && e.peg.state === 'ok') this.onEvent('bells', 0, 0.9); }); // a right note: a spark
      ['game:unlock', 'game:reset', 'game:secret'].forEach((ev) => bus.on(ev, () => { this.sig = null; }));
    },
  };

  try {
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    gv.reduced = !!(mq && mq.matches);
    if (mq && mq.addEventListener) mq.addEventListener('change', () => { gv.reduced = mq.matches; gv.parts.length = 0; gv.squash = {}; gv.shake = null; });
  } catch (e) {}
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) { gv.pending.length = 0; gv.skyQ.length = 0; gv.waves.length = 0; gv.lastT = null; } });
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
