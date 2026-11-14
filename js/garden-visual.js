// « Ville » (the code and the mode keep their old name « Jardin », `garden*`, `plants`): the visual of the screen, a neon
// city at night in the rain that the music lights up. Purely a reflection: it never earns, never writes the store or the
// game state, and nothing on it can be touched.
//
// S8.1 « Moteur de ville »: three parts, each knows nothing of the next one's insides.
//   1. TABLES (what the controls and the music mean, pure functions, unchanged since S4.6–S6.5): LOOK / LOOK_ALL (each
//      element shows its layer's settings), SCENE (every other control drives a scene layer), SPLASH (each note seen).
//      (S8.7: the combos are drawn by js/city-combos.js, through the hooks below.)
//   2. THE WORLD MODEL (`gv.world`, smoothed every frame): named DIMENSIONS (table DIMS: courant = power, trafic, caméra
//      = cam.back / cam.depth / cam.fog, météo = weather.rain / wind / storm, usure VHS, population, chantiers = sites,
//      aube, lecture), each `aim(c)` → 0..1 from the settings, the open layers and the scene, with its own smoothing;
//      plus IMPULSES (table PULSES: note, chord, beat, kick, flash, build) that decay on their own. The BUILDINGS (one per
//      open layer, `plants`) are part of it: a height in cells that never scales — a building that gets taller is BUILT
//      (scaffold, crane, floors stacking up, windows lit one by one), one that gets lower or whose layer is switched off is
//      DECONSTRUCTED (floors going dark and sinking, neon dust), both timed on the audio clock (`grow`).
//   3. THE DRAWING: an ordered stack of layers (STACK; `gv.addLayer({id, z, draw(g, world, cam, gv)})`): sky, stars, far
//      city, street, towers, sparks, traffic, weather, front, post, scene HUD. One camera
//      (`cam`: zoom = recul, pan with parallax by depth, shake) for all; `cam.set(g, d)` puts a layer at depth d (0 = sky,
//      1 = the main street, > 1 = in front). Later waves add dimensions (`gv.addDim`) and layers (`gv.addLayer`) without
//      touching the rest.
// Buildings never deform (no squash, no sway, no scale of their own): a note LIGHTS them (windows, neon, roof beacon),
// a touched control highlights its element. The camera may move (pan, recul, shake); the buildings stay still in it.
//
// Mode policy (wraps AMB.visual, visual.js is untouched): « Jardin » (the « Ville » on screen) is the default visual and
// in the cycle of both modes. In free mode the city is a pure reflection of the music: every layer has its building, at
// full height, and nothing of the game is drawn (no Réponse, tier marks, discoveries, celebrations, dawn of the end; S8.7:
// the combos are the instrument's, drawn in both modes by js/city-combos.js).
// Perf: sprites (normal, dark, emission) cached per element, height and look; cached skies, far city, ground; real dt;
// nothing drawn while the tab is hidden or the canvas off screen; reduced motion = nothing moves (the light still follows).
// stats() gives the cost per frame (ms). Canvas of any size and ratio (phone portrait to 21:9), any devicePixelRatio.
(function () {
  const AMB = (window.AMB = window.AMB || {});

  // one element per sound layer: its node of the tree, its neon colour, the drawing of its building (kind, see cells())
  const LAYERS = [
    { id: 'drone', node: 'racine', label: 'Drone', short: 'Drone', col: [124, 132, 255], kind: 'reed' },
    { id: 'pad', node: 'h.pad', label: 'Pad', short: 'Pad', col: [236, 96, 214], kind: 'bush' },
    { id: 'bells', node: 'm.bells', label: 'Mélodie auto', short: 'Mélo', col: [255, 196, 92], kind: 'bell' },
    { id: 'texture', node: 'e.texture', label: 'Texture', short: 'Text.', col: [80, 228, 236], kind: 'fern' },
    { id: 'grains', node: 'm.grains', label: 'Grains', short: 'Grain', col: [96, 240, 168], kind: 'puff' },
    { id: 'seq', node: 'c.seq', label: 'Mélodie écrite', short: 'Écrite', col: [255, 128, 72], kind: 'vine' },
    { id: 'bass', node: 'c.rythme', label: 'Basse', short: 'Basse', col: [150, 110, 255], kind: 'cactus' },
    { id: 'perc', node: 'c.rythme', label: 'Pulsations', short: 'Rythme', col: [255, 64, 110], kind: 'shroom' },
  ];
  // the city's palette: CSS tokens (css/style.css :root, --city-*), read once; these values without a stylesheet
  const TOK = (() => {
    const D = { night: '#07040f', sky: '#1c0b33', horizon: '#6a1f6e', wall: '#130c22', ground: '#06040b', pink: '#ff3fa4', cyan: '#3ff0ff',
      violet: '#9d6bff', amber: '#ffb347', red: '#ff3348', rain: '#a9b8ff', dawnTop: '#140a33', dawnMid: '#a8327e', dawnLow: '#ff7a4f', sunTop: '#ffd36b', sunLow: '#ff3f8e' };
    const out = {};
    let cs = null; try { cs = getComputedStyle(document.documentElement); } catch (e) {}
    for (const k in D) {
      let v = ''; try { v = cs ? cs.getPropertyValue('--city-' + k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())).trim() : ''; } catch (e) {}
      const m = /^#([0-9a-f]{6})$/i.exec(v) || /^#([0-9a-f]{6})$/i.exec(D[k]), n = parseInt(m[1], 16);
      out[k] = [n >> 16, (n >> 8) & 255, n & 255];
    }
    return out;
  })();
  const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const byLayer = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

  // ======================================================================================================================
  // 1. TABLES
  // ---- S4.6 SETTINGS → LOOK: each element shows its layer's settings as aspects, all 0..1 (how they are drawn is the
  // drawing's business):
  //   size  ← Niveau (× general Volume)             : how many floors (S8.1: built or deconstructed, never scaled)
  //   light ← Lumière (× Usure / Cassette, darker)  : share of lit windows, brightness of its neon
  //   shape ← Timbre                                : a dome on the roof ↔ masts and antennas, spikes on the outline
  //   halo  ← Distance of the layer × Reverb (+ Halo)  : soft aura around the building
  //   sway  ← the layer's movement (Mouvement, Attaque, Résonance, Swing +, Flou, Tenue) : (S8.1: no more sway; kept
  //           for the aspects table and later waves)
  //   pace  ← Tempo (Flottant = slower)
  //   bloom ← density / complexity (Densité, Accords riches, notes of the motif, hits of the pattern) : 1 to 4 neon signs
  //   on    ← the layer's On : switched off = deconstructed
  // A cell: 'layer.key' (a knob, normalised by its range, or a toggle), sel(key, {option: 0..1}) for a select, num(v), or
  // fn([keys], (get) => 0..1). The grands réglages move these same settings (js/perform.js MACROS).
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
  for (const id in LOOK) LOOK[id].on = id + '.on';
  // the general settings, the same for every element
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
    return Number.isFinite(n) ? clamp(n) : 0.5;
  }
  const cell = (c, get) => (typeof c === 'string' ? norm(c, get(c)) : clamp(+c.f(get) || 0));
  function lookAll(get) { const all = {}; for (const k in LOOK_ALL) all[k] = cell(LOOK_ALL[k], get); return all; }
  // get(key) → the store value (undefined = the schema default). Pure: same settings, same look.
  function look(get) {
    const all = lookAll(get), out = {};
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
  // which elements a setting concerns: its layer's, or all of them for the general ones (Volume, Tempo, Reverb, Halo…)
  const ALL_KEYS = new Set(); for (const k in LOOK_ALL) { const c = LOOK_ALL[k]; (typeof c === 'string' ? [c] : c.keys).forEach((x) => ALL_KEYS.add(x)); }
  function concerns(key) {
    const sec = String(key).split('.')[0];
    if (LOOK[sec]) return [sec];
    if (ALL_KEYS.has(key) || sec === 'fx') return Object.keys(LOOK);
    return [];
  }

  // ---- S5.8 SETTINGS → SCENE: every control the elements do not show drives a layer of the scene. A layer is one
  // intensity 0..1 (the MEAN of its cells: a select = its option's rank, a toggle 0/1, a text = how much it holds, a knob =
  // its range); `poll` = app state outside the store (mode, playback, song). A touched control (sources user / macro / cc,
  // or the event `ev`) kicks its layer: an impulse 1 → 0 in ~0.8 s on top of the lasting state. `layers()` gives them
  // (js/city-dims.js reads them). S8.7: Cassette has no layer of its own any more (its tape band doubled the WebGL VHS and
  // the S8.4 `vhs` dimension); Usure keeps its grain, drawn only without WebGL (one grain, never two).
  const SCENE = {
    hue: { at: 'ciel : teinte', keys: ['global.key', 'global.tuning'] },
    clouds: { at: 'ciel : nuages qui dérivent', keys: ['global.evolve'] },
    twinkle: { at: 'ciel : étoiles qui scintillent', keys: ['mod.l1target', 'mod.l1shape', 'mod.l1rate', 'mod.l1depth', 'mod.l2target', 'mod.l2shape', 'mod.l2rate', 'mod.l2depth', 'auto.on', 'auto.target', 'auto.bars', 'auto.curve'] },
    aurora: { at: 'lumières : aurores néon', keys: ['fx.shimmer'] },
    rays: { at: 'lumières : projecteurs qui balaient le ciel', keys: ['drone.follow', 'pad.length', 'pad.prog', 'pad.custom', 'pad.counter'] },
    fireflies: { at: 'lumières : drones qui clignotent', keys: ['bells.mode', 'bells.phraseLen', 'bells.mutate', 'bells.range', 'seq.mode', 'seq.arpDir', 'seq.arpRate', 'seq.arpOct', 'seq.steps', 'seq.octave', 'seq.follow', 'seq.decay', 'seq.mutate', 'seq.patB', 'seq.patC', 'seq.patD', 'seq.slot', 'seq.chain'] },
    snow: { at: 'météo : neige de pixels', keys: ['grains.scan', 'grains.pitch', 'grains.reverse', 'grains.glide'] },
    frost: { at: 'météo : givre', keys: ['grains.source'], ev: 'freeze' },
    ripple: { at: 'sol : ondulation', keys: ['global.swing', 'global.humanize', 'bass.octave', 'perc.steps'] },
    echo: { at: 'filtre : écho (bâtiments fantômes)', keys: ['fx.echo', 'fx.echoTime', 'fx.feedback'] },
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
      if (L.poll) { let v = 0; try { v = +L.poll() || 0; } catch (e) {} out[n] = clamp(v); continue; }
      let s = 0; for (const k of L.keys) s += level(k, get);
      out[n] = s / L.keys.length;
    }
    return out;
  }

  // ---- S5.2 « Chaque note se voit »: the TRIGGER (which element, who plays, how strong), apart from the drawing.
  // JUICE = the one knob for how much a note sets off (0 = calm, 1 = goofy default, 2 = way too much); js/motion.js owns it.
  const JUICE = AMB.motion ? AMB.motion.JUICE : 1;
  // per who: ring (wave brightness), parts (particles at vel 1), flash (element lit), life (s), spread (rad), shake
  const SPLASH = {
    player: { ring: 1, parts: 24, flash: 1, life: 0.8 },
    chord: { ring: 1, parts: 36, flash: 1, life: 1, spread: 4.2 },
    machine: { ring: 0.45, parts: 4, flash: 0.35, life: 0.5 },
    // S5.3 celebrations of the Réponse (cheer()): a series that grows, a record, a new tier
    streak: { ring: 1, parts: 30, flash: 1, life: 0.9, spread: 4.2 },
    record: { ring: 1, parts: 60, flash: 1, life: 1.1, spread: 6.3, shake: 0.6 },
    tier: { ring: 1, parts: 90, flash: 1, life: 1.3, spread: 6.3, shake: 1 },
  };
  const WAVES_PER_PLANT = 3, PARTS_MAX = 260, LOUD = 0.85, HELD_MAX = 30; // s: a release that never comes
  const MACHINE = new Set(['bells', 'seq', 'bass']); // the machine's melodies and bass (+ the rhythm, 'perc')
  const pitchK = (m) => clamp(((m == null ? 60 : +m) - 36) / 60); // 0 = low (C2) .. 1 = high (C7)
  // bus event → splash {plant, who, vel 0..1, pitch 0..1, held (live id | 'chord' | null), shake 0..1, time}, or null. Pure.
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
  const ih = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // ======================================================================================================================
  // 2. THE WORLD MODEL
  // ---- DIMENSIONS: name (a path in `world`) → {aim(c) 0..1, tau (s, smoothing), at (what it is)}. c = {get, L (scene
  // intensities, smoothed), all (LOOK_ALL), plants (open buildings, each with its smoothed `look`), dawn, free, sites}.
  // S8.1 wires each to the settings that meant it before (the look of the old garden stays); S8.4 rewires the grands
  // réglages to one dimension each, S8.5 the music, S8.6 the life — through this table only (`gv.addDim`).
  const mean = (ps, f) => { if (!ps.length) return 0; let s = 0; for (const p of ps) s += f(p); return s / ps.length; };
  const lk = (p) => p.look || { light: 0.6, on: 1, bloom: 0.3, size: 0.6 };
  const DIMS = {
    power: { tau: 0.5, at: 'courant : la lumière de la ville (fenêtres, néons, halos ; voilée à l\'arrêt)', aim: (c) => c.dawn + (1 - c.dawn) * (0.2 + 0.8 * mean(c.plants, (p) => lk(p).light * lk(p).on)) * (0.55 + 0.45 * c.L.play) },
    traffic: { tau: 1.2, at: 'trafic : voitures volantes et de la rue', aim: (c) => clamp((0.15 + 0.5 * mean(c.plants, (p) => lk(p).bloom * lk(p).on) + 0.35 * c.all.pace) * (0.35 + 0.65 * c.L.play) * Math.min(1, 0.25 + c.plants.length / 5)) },
    // the framing: the camera centres the built city and comes closer while it is small (never into the HUD)
    'cam.frame': { tau: 1.8, at: 'caméra : cadrage (1 = toute la rue, plus = plus près de la ville bâtie)', aim: (c) => c.frame().z },
    'cam.cx': { tau: 1.8, at: 'caméra : centre du cadrage (x, part de la largeur)', aim: (c) => c.frame().cx },
    'cam.back': { tau: 1.5, at: 'caméra : recul (0 = près, 1 = loin)', aim: (c) => 0.15 + 0.35 * c.all.space },
    'cam.depth': { tau: 1.5, at: 'caméra : profondeur (parallaxe)', aim: (c) => 0.3 + 0.7 * c.all.space },
    'cam.fog': { tau: 1.2, at: 'caméra : brouillard à l\'horizon', aim: (c) => 0.15 + 0.6 * c.all.space * c.all.space },
    'weather.rain': { tau: 2, at: 'météo : pluie (s\'arrête à l\'aube)', aim: (c) => (1 - c.dawn) * (0.45 + 0.55 * c.nature) },
    'weather.wind': { tau: 2, at: 'météo : vent (pluie penchée, nuages)', aim: (c) => 0.15 + 0.85 * c.L.clouds },
    'weather.storm': { tau: 2, at: 'météo : orage (éclairs)', aim: (c) => (1 - c.dawn) * clamp((c.nature - 0.75) / 0.25) },
    vhs: { tau: 0.6, at: 'usure VHS (bande, grain)', aim: (c) => c.all.worn },
    population: { tau: 2, at: 'population : la ville habitée (ville lointaine allumée)', aim: (c) => Math.max(c.dawn, clamp(0.05 + c.plants.length / 8) * (0.5 + 0.5 * c.L.play)) },
    sites: { tau: 0.4, at: 'chantiers : bâtiments en construction ou en démolition', aim: (c) => clamp(c.sites / 3) },
    dawn: { tau: 0, at: 'aube (fin du Parcours)', aim: (c) => c.dawn },
    play: { tau: 0.3, at: 'lecture', aim: (c) => c.L.play },
  };
  // ---- IMPULSES: name → decay time (s). gv.impulse(name, v) sets one (max), it falls to 0 linearly.
  const PULSES = { note: 0.3, chord: 1, beat: 0.35, kick: 0.8, flash: 0.4, build: 0.6 };
  function makeWorld() {
    const w = { pulse: {}, beat: { ph: 0, strong: false, k: 0, on: false }, cam: {}, weather: {} };
    for (const n in PULSES) w.pulse[n] = 0;
    return w;
  }
  const getPath = (o, p) => { const i = p.indexOf('.'); return i < 0 ? o[p] : (o[p.slice(0, i)] || {})[p.slice(i + 1)]; };
  const setPath = (o, p, v) => { const i = p.indexOf('.'); if (i < 0) o[p] = v; else (o[p.slice(0, i)] || (o[p.slice(0, i)] = {}))[p.slice(i + 1)] = v; };

  // ---- BUILDINGS: each element as a pixel matrix (1 cell = px canvas pixels; walls solid, lights as LEDs). The `kind` ids
  // of the old plants are kept (code), the drawing is the city's:
  //   reed = Tour (Drone), bush = Pyramide (Pad), bell = Enseigne néon (Mélodie auto), fern = Antenne radio (Texture),
  //   puff = Parabole (Grains), vine = Écran géant (Mélodie écrite), cactus = Pylône (Basse), shroom = Tour d'envol et
  //   voitures volantes (Pulsations), crystal = Hologramme (a discovery).
  // tones: 0 frame, 1 wall, 2 lit window, 3 neon tube, 4 hot light, 6 window (lit or not: dress, by Lumière), 7 dark
  // window, 8 red beacon, 12 cable (dim)
  const CW = 25; // sprite width in cells (axis at column 12)
  const FLOOR = 2; // cells per floor: heights move by whole floors
  function cells(kind, hC, seed, a) {
    const r = mulberry(seed), out = [];
    const put = (x, y, t) => { if (x >= 0 && x < CW && y >= 0) out.push([x, y, t]); };
    const C = 12;
    const line = (x0, y0, x1, y1, t) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (let i = 0; i <= n; i++) put(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), t); };
    if (kind === 'bush') { // a stepped pyramid (Tyrell), bands of windows
      const Wm = Math.min(11, 4 + Math.round(hC * 0.2));
      for (let y = 0; y < hC; y++) {
        const hw = Math.max(1, Math.round(Wm * (1 - y / (hC + 1))));
        for (let x = C - hw; x <= C + hw; x++) put(x, y, x === C - hw || x === C + hw ? 0 : y % 3 === 1 && (x - C) % 2 === 0 ? 6 : 1);
      }
    } else if (kind === 'cactus') { // an electricity pylon: a tapered lattice, cross-arms, insulators
      for (let y = 0; y < hC; y++) {
        const hw = Math.round(1 + 4 * (1 - y / hC) ** 1.6);
        put(C - hw, y, 0); put(C + hw, y, 0);
        const k = y % 6, d = Math.round(hw * (1 - k / 3)); if (hw > 1) { put(C + d, y, 0); put(C - d, y, 0); } // X bracing
      }
      put(C, hC, 0); put(C, hC + 1, 8);
      const arms = hC > 18 ? 2 : hC > 10 ? 1 : 0;
      for (let a = 0; a < arms; a++) {
        const y0 = Math.round(hC * (0.62 + 0.2 * a)), L = 5 + (a ? 0 : 2);
        for (let x = -L - 2; x <= L + 2; x++) put(C + x, y0, 0);
        for (const s of [-1, 1]) { put(C + s * (L + 2), y0 - 1, 4); put(C + s * (L + 2), y0 - 2, 4); put(C + s * 3, y0 - 1, 4); }
      }
    } else if (kind === 'shroom') { // a landing tower, flying cars parked around it
      const h = Math.round(hC * 0.78);
      for (let y = 0; y < h; y++) for (let x = -1; x <= 1; x++) put(C + x, y, x ? 0 : y % 3 === 1 ? 6 : 1);
      for (let x = -4; x <= 4; x++) { put(C + x, h, 0); if (x % 2 === 0) put(C + x, h + 1, 3); }
      const cars = 1 + Math.min(2, Math.floor(hC / 18));
      for (let k = 0; k < cars; k++) {
        const x0 = C + (k === 0 ? 0 : k === 1 ? -6 : 6), y = k ? Math.round(hC * 0.45) + 2 * k : h + 3, s = k === 1 ? -1 : 1;
        for (let x = -3; x <= 3; x++) { put(x0 + x, y, x === 3 * s ? 4 : x === -3 * s ? 8 : 1); if (Math.abs(x) <= 2) put(x0 + x, y - 1, 3); }
        for (let x = -1; x <= 1; x++) put(x0 + x - s, y + 1, 6);
      }
    } else if (kind === 'puff') { // a satellite dish on a mast, a small station at its foot
      const st = Math.min(Math.round(hC * 0.3), 8), ys = Math.round(hC * 0.62), R = Math.min(8, 3 + Math.round(hC * 0.12));
      for (let y = 0; y < st; y++) for (let x = -4; x <= 4; x++) put(C + x, y, Math.abs(x) === 4 || y === st - 1 ? 0 : y % 2 && x % 2 === 0 ? 6 : 1);
      for (let y = st; y < ys; y++) { put(C, y, 0); if (y % 3 === 0) { put(C - 1, y, 0); put(C + 1, y, 0); } }
      for (let x = -R; x <= R; x++) { const y = ys + Math.round((x * x) / (R * 1.1)); put(C + x, y, Math.abs(x) >= R - 1 ? 3 : 1); put(C + x, y + 1, Math.abs(x) === R ? 3 : 1); }
      line(C, ys, C, ys + R, 0); put(C, ys + R + 1, 4);
    } else if (kind === 'fern') { // a radio mast: a lattice, guy wires, red beacons
      for (const s of [-1, 1]) { line(C, Math.round(hC * 0.72), C + s * 8, 0, 12); line(C, Math.round(hC * 0.4), C + s * 5, 0, 12); }
      for (let y = 0; y < hC; y++) {
        const hw = Math.max(1, Math.round(2.5 * (1 - y / hC) + 0.5));
        put(C - hw, y, 0); put(C + hw, y, 0); const ph = (y % 6) / 6, z = Math.round(2 * hw * (ph < 0.5 ? ph * 2 : 2 - ph * 2)); put(C - hw + z, y, 0);
      }
      for (let i = 1; i <= 2; i++) { const y = Math.round(hC * i / 3); put(C - 2, y, 8); put(C + 2, y, 8); }
      put(C, hC, 0); put(C, hC + 1, 0); put(C, hC + 2, 8);
    } else if (kind === 'vine') { // a giant screen on legs, a piano roll lit on it
      const b = Math.round(hC * 0.4), hw = 7;
      for (let y = 0; y < b; y++) { put(C - 5, y, 0); put(C + 5, y, 0); if (y % 4 === 2) line(C - 5, y, C + 5, y + 2, 12); }
      for (let y = b; y < hC; y++) for (let x = -hw; x <= hw; x++) put(C + x, y, Math.abs(x) === hw || y === b || y === hC - 1 ? 0 : 1);
      for (let y = b + 2; y < hC - 2; y += 2) { let x = -hw + 2 + Math.floor(r() * 3); while (x < hw - 2) { const L = 1 + Math.floor(r() * 4); for (let i = 0; i < L && x + i < hw - 1; i++) put(C + x + i, y, 6); x += L + 1 + Math.floor(r() * 3); } }
      for (let x = -hw; x <= hw; x += 2) put(C + x, hC, 3);
    } else if (kind === 'crystal') { // a hologram: a diamond of light over a small base
      const h = hC;
      for (let y = 0; y < h; y++) { const w = Math.round((y < h * 0.6 ? y / (h * 0.6) : (h - y) / (h * 0.4)) * 3); for (let x = -w; x <= w; x++) put(C + x, y, x === 0 || y === Math.round(h * 0.6) ? 2 : 1); }
      put(C - 4, 0, 1); put(C - 3, 0, 1); put(C + 3, 0, 1); put(C + 4, 0, 2);
    } else if (kind === 'bell') { // a neon sign: a pole, a vertical sign box with glyphs
      const p = Math.round(hC * 0.38);
      for (let y = 0; y < p; y++) put(C, y, 0);
      put(C - 1, 0, 0); put(C + 1, 0, 0); put(C + 1, p - 1, 0); put(C + 2, p - 1, 0);
      for (let y = p; y < hC; y++) for (let x = -3; x <= 3; x++) put(C + x, y, Math.abs(x) === 3 || y === p || y === hC - 1 ? 3 : 1);
      for (let y = p + 2; y < hC - 2; y += 4) { // one glyph every 4 rows: a few strokes of a 3 × 3 grid
        const m = 1 + Math.floor(r() * 510);
        for (let i = 0; i < 9; i++) if (m >> i & 1) put(C - 1 + (i % 3), y + Math.floor(i / 3), 6);
      }
    } else { // reed: a slim tower, setbacks, a grid of windows, a mast
      const w = hC > 30 ? 5 : 4, s1 = Math.round(hC * 0.62), s2 = Math.round(hC * 0.86);
      for (let y = 0; y < hC; y++) {
        const hw = y < s1 ? w : y < s2 ? w - 1 : w - 2;
        for (let x = C - hw; x <= C + hw; x++) put(x, y, x === C - hw || x === C + hw ? 0 : y % 2 === 1 && y > 1 && (x - C + hw) % 2 === 1 ? 6 : 1);
      }
      put(C, hC, 0); put(C, hC + 1, 0); put(C, hC + 2, 8);
    }
    return a && kind !== 'crystal' ? dress(out, hC, seed, a) : out;
  }
  // the look on top of the element. a = {shape 0..1, light 0..1, bloom = neon signs 1..4} (quantized).
  // light: how many windows are lit; shape: a dome ↔ masts (1 to 5) and greebles on the outline; bloom: neon signs
  function dress(out, hC, seed, a) {
    const r = mulberry(seed ^ 0x5bd1e995), has = new Set(out.map((c) => c[0] + ',' + c[1]));
    const put = (x, y, t) => { const k = x + ',' + y; if (x >= 0 && x < CW && y >= 0 && !has.has(k)) { has.add(k); out.push([x, y, t]); } };
    const C = 12;
    for (const c of out) if (c[2] === 6) c[2] = r() < 0.08 + 0.88 * a.light ? (r() < 0.22 ? 4 : 2) : 7;
    const body = out.slice();
    if (a.shape > 0.45) { // spikes: from the outermost frame cell of a row, a short antenna up and outward, a light at its tip
      const ext = {}; for (const [x, y, t] of body) if (t === 0) { const e = ext[y] || (ext[y] = [x, x]); e[0] = Math.min(e[0], x); e[1] = Math.max(e[1], x); }
      const every = a.shape > 0.8 ? 3 : 5;
      for (const y in ext) {
        const yy = +y; if (yy < 2 || yy % every !== 1) continue;
        for (const [x, s] of [[ext[y][0], -1], [ext[y][1], 1]]) if (!has.has((x + s) + ',' + (yy + 1)) && !has.has((x + 2 * s) + ',' + (yy + 2))) { put(x + s, yy + 1, 0); put(x + 2 * s, yy + 2, (yy >> 2) % 2 ? 8 : 4); }
      }
    }
    let top = 0, tx = C; for (const [x, y] of body) if (y > top || (y === top && Math.abs(x - C) < Math.abs(tx - C))) { top = y; tx = x; }
    let xl = tx, xr = tx; for (const [x, y] of body) if (y === top) { xl = Math.min(xl, x); xr = Math.max(xr, x); }
    if (a.shape < 0.5) { // a dome, its rim in neon
      const R = Math.max(1, Math.min(3, Math.round((xr - xl) / 2) || 1 + Math.round(hC / 30)));
      for (let dy = 0; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const d = dx * dx + dy * dy; if (d <= R * R + 0.5) put(tx + dx, top + 1 + dy, d > (R - 1) * (R - 1) + 0.5 ? 3 : 1); }
    } else { // masts on the roof, a light at each tip
      const span = Math.max(1, xr - xl + 1), n = Math.min(1 + Math.round(a.shape * 4), Math.ceil(span / 2));
      for (let i = 0; i < n; i++) {
        const x = n === 1 ? tx : xl + Math.round(i * (span - 1) / (n - 1)), L = 2 + ((i * 2) % 3) + Math.round(a.shape * 2);
        for (let y = 1; y < L; y++) put(x, top + y, 0);
        put(x, top + L, i % 2 ? 8 : 4);
      }
    }
    const rows = [0.3, 0.55, 0.75], side0 = r() < 0.5 ? 1 : -1;
    for (let i = 1; i < a.bloom; i++) { // neon signs on brackets, alternately left and right
      const y = Math.round(hC * rows[i - 1]), s = i % 2 ? side0 : -side0;
      let edge = C; for (const [x, yy] of body) if (Math.abs(yy - y) <= 2 && (s > 0 ? x > edge : x < edge)) edge = x;
      put(edge + s, y, 0);
      for (let dy = -2; dy <= 2; dy++) for (let dx = 2; dx <= 3; dx++) put(edge + s * dx, y + dy, dy === 0 && dx === 2 ? 4 : 3);
    }
    return out;
  }
  // a building's construction (S8.1): heights in cells, h(now) eased from h0 to h1 over dur s from start (audio clock)
  const ease = (q) => q * q * (3 - 2 * q);
  const BUILD = { base: 0.7, perCell: 0.034, unbase: 0.5, unPerCell: 0.022, lag: 0.5 }; // s; lag = windows lit after the floor is up

  // sky per chord: a hue per scale degree; minor scales (minor third) darker and cooler
  const HUES = [285, 320, 200, 255, 230, 335, 5]; // I violet, ii magenta, iii cyan, IV indigo, V blue, vi pink, vii red
  const SKY_FADE = 2; // s

  // ======================================================================================================================
  // 3. THE DRAWING — the layers (calques). Each: {id, z, draw(g, world, cam, gv)}; the stack calls them in z order with
  // the context reset (no transform but the shake, alpha 1, source-over, no smoothing). cam.set(g, d) places a layer at
  // depth d; cam.x(d, x) / cam.y(d, y) / cam.k(d) map a point of that depth to the screen.
  const STACK = [];
  function addLayer(def) { const i = STACK.findIndex((l) => l.id === def.id); if (i >= 0) STACK.splice(i, 1); STACK.push(def); STACK.sort((a, b) => a.z - b.z); return def; }

  // ---- state → layout (pure): where each building stands (world coordinates, before the camera) ----
  // state = {layers: [ids], levels: {layer: 0..1}, secrets: [ids]}. One row of buildings on the street; on a narrow
  // screen (portrait) with more than 4 buildings, two rows: the back row higher up, smaller, between the front ones.
  const ROW_K = 0.74, ROW_D = 0.82; // the back row: its scale, its depth (parallax)
  // safe = {top, right, bottom, left}: fractions of the canvas the interface covers (S8.3); the street stays above the
  // bottom one, the buildings between the side ones.
  function layout(st, W, H, safe) {
    const ids = LAYERS.map((l) => l.id).filter((id) => (st.layers || []).includes(id)), sf = safe || {};
    const sl = clamp(+sf.left || 0, 0, 0.4), sr = clamp(+sf.right || 0, 0, 0.4), sb = clamp(+sf.bottom || 0, 0, 0.5), X0 = W * sl, FW = W * (1 - sl - sr);
    // S8.1: each layer has its own lot, always the same (a building never moves when another one opens); the camera
    // frames the lots that are built (cam.frame, cam.cx)
    const N = LAYERS.length, ground = Math.round(H * Math.max(0.45, Math.min(W < H ? 0.8 : 0.76, 1 - sb - 0.03))), rows = FW < H * 0.95 ? 2 : 1;
    const nf = rows === 2 ? Math.ceil(N / 2) : N, slotW = (FW * 0.9) / nf;
    const plants = ids.map((id) => {
      const i = LAYERS.indexOf(byLayer[id]), r = mulberry(hash('plant:' + id)), row = rows === 2 ? i % 2 : 0, j = rows === 2 ? i >> 1 : i;
      const lv = clamp(+((st.levels || {})[id]) || 0);
      const x = row ? X0 + FW * 0.05 + slotW * (j + 1) : X0 + FW * 0.05 + slotW * (j + 0.5);
      return {
        id, kind: byLayer[id].kind, col: byLayer[id].col, label: byLayer[id].label, short: byLayer[id].short, level: lv, row,
        x: Math.round(x + (r() - 0.5) * slotW * (row ? 0.15 : 0.3)),
        y: row ? Math.round(ground - H * 0.05) : ground + Math.round((r() - 0.5) * H * 0.01), phase: r() * 6.283, rare: false,
      };
    });
    const sec = (st.secrets || []).slice().sort();
    const rares = sec.map((id) => {
      const r = mulberry(hash('secret:' + id));
      return { id: 'secret:' + id, kind: 'crystal', rare: true, level: 0, row: 0, col: hsl2rgb(Math.floor(r() * 360), 0.85, 0.7), x: Math.round(X0 + FW * 0.05 + slotW * (Math.floor(r() * (nf + 1)) + (r() - 0.5) * 0.3)), y: ground, phase: r() * 6.283 };
    });
    return { plants, rares, ground, slotW, rows };
  }

  const gv = {
    LAYERS, byLayer, layout, cells, hash, FLOOR, BUILD, DIMS, PULSES, STACK,
    grow: {}, built: {}, growStart: null, growNext: false, // S8.1 construction: building id -> {h0, h1, spr, start, dur}
    skyKey: null, skyPrevKey: null, skyT: 0, skyQ: [], skies: new Map(), // S4.5w sky
    replay: null, lit: {}, // S4.5w finale
    LOOK, LOOK_ALL, ASPECTS, look, concerns, aim: null, cur: {}, kicks: {}, lookDirty: true, // S4.6 settings → look
    // S7.1 the one knob lives in js/motion.js (css --juice, interface motion); GV.JUICE reads and sets it there
    get JUICE() { return AMB.motion ? AMB.motion.JUICE : this._juice; }, set JUICE(v) { if (AMB.motion) AMB.motion.set({ juice: v }); else this._juice = v; }, _juice: JUICE,
    SPLASH, WAVES_PER_PLANT, PARTS_MAX, splash, waves: [], zap: {}, shake: null, ox: 0, oy: 0, // S5.2 notes seen
    SCENE, scene, sc: {}, kick: {}, sAim: null, sPoll: {}, st: 0, speed: 1, fxc: {}, // S5.8 scene layers
    world: makeWorld(), // S8.1 the world model
    hooks: [], post2d: true, safe: null, // S8.1 for S8.2 (afterDraw, post2d) and S8.3 (safe)
    sprites: new Map(), glows: new Map(), labels: new Map(),
    plants: [], rares: [], parts: [], pending: [],
    energy: {}, // building id -> 0..1 light of its notes
    visible: true, paused: false, reduced: false,
    times: [], frames: 0, cacheMisses: 0,
    clock: () => (AMB.engine && AMB.engine.ctx ? AMB.engine.ctx.currentTime : performance.now() / 1000),
    now: () => performance.now(),
    get canvas() { return this.active ? this.observed || null : null; },
    // S8.2: fn(canvas, world, info) after each frame of the city; returns off()
    afterDraw(f) { this.hooks.push(f); return () => { const i = this.hooks.indexOf(f); if (i >= 0) this.hooks.splice(i, 1); }; },
    addLayer, // S8.4–S8.7: a new layer of the drawing
    addDim(name, d) { DIMS[name] = d; return d; }, // a new dimension of the world (or a new wiring of one)
    impulse(name, v = 1) { const w = this.world.pulse; w[name] = Math.max(w[name] || 0, clamp(v, 0, 2)); },

    // ---- read the game / secrets state; a layer's level = share of its tree nodes owned ----
    layerNodes(id) { const T = AMB.tree; return T ? T.NODES.filter((n) => n.params.some((p) => p.startsWith(id + '.'))).map((n) => n.id) : []; },
    readState() {
      const g = AMB.game, st = { layers: [], levels: {}, secrets: [] };
      if (this.free) { for (const l of LAYERS) { st.layers.push(l.id); st.levels[l.id] = 1; } return st; } // free mode: the whole city
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
    cellPx(W, H, n, avail = H * 0.52) { return Math.max(2, Math.min(Math.floor(avail / 68), Math.floor((W * 0.9) / Math.max(1, n) / 19))); },
    // the height a layer's level gives (cells, before its Niveau): a third of the tallest at the first node, all at the last
    heightCells(p) { if (p.rare) return 9; const M = this.hMax || 58, m = Math.min(16, Math.round(M * 0.35)); return Math.round(m + (M - m) * p.level); },
    // S6.6: the HUD and the chips only cover the top corners — `zones` = their boxes (fractions of the canvas); `ceil` is the
    // free middle sky (SKY); a building under a corner is lower (ceilAt). S8.3 may set gv.safe = {top, zones?} instead.
    SKY: 0.1, zones: [],
    ceilFrac() {
      this.zones = [];
      const sf = this.safe && this.safe.top != null ? clamp(+this.safe.top, 0, 0.6) : null; // S8.3: the bar + LCD on top
      try {
        const c = this.observed, ch = document.getElementById('chordName'), info = document.getElementById('hudInfo'), tools = document.querySelector('.stage-tools'), hud = ch && ch.parentElement;
        const r = c && c.getBoundingClientRect();
        if (!r || !r.height || !ch) return sf != null ? sf : 0.3;
        const fy = (y) => Math.max(sf != null ? sf : this.SKY, Math.min(0.6, (y - r.top) / r.height + 0.03)), up = (x) => Math.min(1, Math.ceil(x * 20) / 20), dn = (x) => Math.max(0, Math.floor(x * 20) / 20);
        let b = ch.getBoundingClientRect().bottom;
        if (info) { const cs = getComputedStyle(info); b += (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.fontSize) || 12) * 1.3; }
        const hr = hud.getBoundingClientRect();
        if (hr.width && hr.height) this.zones.push({ l: 0, r: up((Math.max(hr.right, hr.left + 160) - r.left) / r.width + 0.02), b: fy(b) });
        const tr = tools && tools.getBoundingClientRect();
        if (tr && tr.height) this.zones.push({ l: dn((tr.left - r.left) / r.width - 0.02), r: 1, b: fy(tr.bottom) });
        return sf != null ? Math.max(sf, this.SKY) : this.SKY;
      } catch (e) { this.zones = []; return sf != null ? sf : 0.3; }
    },
    ceilAt(x, hw) { let c = this.ceil || 0; const W = this.W || 1; for (const z of this.zones) if (x + hw > z.l * W && x - hw < z.r * W) c = Math.max(c, z.b); return c; },
    // size aspect → how many floors: ×1 at the layer's default setting, ×0.5 at Niveau 0, ×SZ_MAX at the top
    SZ_MAX: 1.3,
    sizeK(id, v) {
      const d = (this.lookDef || (this.lookDef = look(() => undefined)))[id].size;
      return v <= d ? 0.5 + 0.5 * v / (d || 1) : 1 + (this.SZ_MAX - 1) * (v - d) / ((1 - d) || 1);
    },
    // the height a building should have now (cells, whole floors): its level × its Niveau, 0 when its layer is off, never
    // into the HUD (cap, from refresh)
    wantOf(p) {
      if (p.rare) return 9;
      const a = this.aim && this.aim[p.id];
      if (a && a.on < 0.5) return 0;
      const h = Math.round(this.heightCells(p) * (a ? this.sizeK(p.id, a.size) : 1) / FLOOR) * FLOOR;
      return Math.max(FLOOR * 3, Math.min(h, p.cap || 999));
    },

    // the look of a building, quantized (5 shapes × 5 lights × 1–4 signs), so a slider glides through a few cached sprites
    quant(a) { return a ? { shape: Math.round(a.shape * 4) / 4, light: Math.round(a.light * 4) / 4, bloom: 1 + Math.round(a.bloom * 3) } : null; },
    // the colour of each tone: walls dark and barely tinted, frames lighter, windows warm, neon in the element's colour
    tones(col, qq) {
      const L = qq ? qq.light : 0.75, mix = (u, w, t) => u.map((v, i) => v + (w[i] - v) * t), W = TOK.wall;
      const wall = mix(W, col, 0.14).map((v) => v * (0.9 + 0.5 * L)), frame = mix(wall, col, 0.5).map((v) => v * (1.05 + 0.35 * L));
      const neon = mix(col.map((v) => v * (0.55 + 0.6 * L)), [255, 255, 255], 0.1 * L), win = mix(col, [255, 236, 200], 0.55);
      const t = [];
      t[0] = rgb(frame); t[1] = rgb(wall); t[2] = rgb(win, 0.6 + 0.5 * L); t[3] = rgb(neon); t[4] = rgb(mix(col, [255, 255, 255], 0.75), 0.75 + 0.3 * L);
      t[5] = t[6] = t[2]; t[7] = rgb(mix(wall, col, 0.25), 1.15); t[8] = rgb(TOK.red, 0.7 + 0.4 * L); t[12] = rgb(mix(wall, col, 0.4), 1.4, 0.7);
      if (!qq) { t[1] = rgb(col, 0.55, 0.85); t[2] = rgb(col, 1.25); } // the hologram (discovery): its own colour
      return t;
    },
    // CRT colour fringes baked in the sprites (JUICE; off in reduced motion, or when S8.2's WebGL pass does it: post2d)
    crt() { return this.reduced || this.post2d === false ? 0 : Math.min(1.5, this.JUICE); },
    // the sprites of a building at a height (cells): cv = as it is, dk = all dark (under construction, power cut), em = its
    // lights only (windows, neon, beacons: what a note lights); wins = its lit windows (lit one by one on construction)
    sprite(p, px) {
      const hC = p.spr != null ? p.spr : this.heightCells(p), qq = p.rare ? null : this.quant(p.look), ab = this.crt(), key = `${p.kind}|${p.id}|${hC}|${px}|${ab}` + (qq ? `|${qq.shape}|${qq.light}|${qq.bloom}` : '');
      let s = this.sprites.get(key);
      if (s) return s;
      this.cacheMisses++;
      const cl = cells(p.kind, hC, hash(p.id), qq);
      let top = 0; for (const c of cl) top = Math.max(top, c[1]);
      const Hc = top + 1, mk = () => { const c = document.createElement('canvas'); c.width = CW * px; c.height = Hc * px; return c; };
      const cv = mk(), dk = mk(), em = mk(), g = cv.getContext('2d'), gk = dk.getContext('2d'), ge = em.getContext('2d'), gap = px >= 4 ? 1 : 0, col = p.col;
      const tones = this.tones(col, qq), dark = this.tones(col, qq ? { ...qq, light: 0 } : null), wins = [];
      for (const [x, y, t] of cl) {
        const X = x * px, Y = (Hc - 1 - y) * px, full = t === 0 || t === 1 || t === 3 || t === 7;
        const draw = (c, tn) => { c.fillStyle = tn[t] || tn[1]; if (t === 12) c.fillRect(X + (px >> 2), Y + (px >> 2), Math.max(1, px >> 1), Math.max(1, px >> 1)); else if (full) c.fillRect(X, Y, px, px); else c.fillRect(X, Y, px - gap, px - gap); };
        draw(g, tones);
        if (t === 2 || t === 4) { wins.push([X, Y]); gk.fillStyle = dark[7]; gk.fillRect(X, Y, px - gap, px - gap); } else draw(gk, t === 3 ? [, , , rgb(col, 0.35)] : t === 8 ? [, , , , , , , , rgb(TOK.red, 0.4)] : dark);
        if (t === 2 || t === 3 || t === 4 || t === 8) { ge.fillStyle = t === 3 ? rgb(col, 1.2) : t === 8 ? rgb(TOK.red, 1.2) : rgb(col.map((v) => v + (255 - v) * 0.6)); ge.fillRect(X, Y, px - gap, px - gap); }
      }
      if (ab) { // behind the element: its silhouette in red shifted left, in cyan shifted right
        const o = Math.max(1, Math.round(px * 0.35 * ab)), m = this.canvas(cv.width, cv.height), mg = m.getContext('2d');
        g.globalCompositeOperation = 'destination-over';
        [[TOK.red, -o], [TOK.cyan, o]].forEach(([c, dx]) => { mg.globalCompositeOperation = 'source-over'; mg.clearRect(0, 0, m.width, m.height); mg.drawImage(cv, 0, 0); mg.globalCompositeOperation = 'source-in'; mg.fillStyle = rgb(c, 1, 0.5); mg.fillRect(0, 0, m.width, m.height); g.drawImage(m, dx, 0); });
        g.globalCompositeOperation = 'source-over';
      }
      let x0 = CW, x1 = 0; for (const c of cl) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); }
      // l, r: drawn extent left and right of the axis; body: height of the body (px), the roof above it
      s = { cv, dk, em, wins, w: cv.width, h: cv.height, hC: Hc, body: hC * px, key, l: cv.width / 2 - x0 * px, r: (x1 + 1) * px - cv.width / 2 };
      this.sprites.set(key, s);
      if (this.sprites.size > 160) this.sprites.delete(this.sprites.keys().next().value);
      return s;
    },
    glow(col, R) {
      R = Math.max(1, Math.round(R));
      const key = col.join() + '|' + R;
      let s = this.glows.get(key);
      if (s) return s;
      const cv = document.createElement('canvas'); cv.width = cv.height = R * 2;
      const g = cv.getContext('2d'), grd = g.createRadialGradient(R, R, 0, R, R, R);
      grd.addColorStop(0, rgb(col, 1, 0.55)); grd.addColorStop(0.4, rgb(col, 1, 0.18)); grd.addColorStop(1, rgb(col, 1, 0));
      g.fillStyle = grd; g.fillRect(0, 0, R * 2, R * 2);
      this.glows.set(key, cv);
      if (this.glows.size > 120) this.glows.delete(this.glows.keys().next().value);
      return cv;
    },
    // « MÉLODIE AUTO » under its building, a neon caption; « MÉLO » when it does not fit its slot (phone)
    label(p, fs, maxW) {
      const full = p.label.toUpperCase(), key = full + '|' + fs + '|' + Math.round(maxW) + '|' + p.col.join();
      let s = this.labels.get(key);
      if (s) return s;
      const cv = document.createElement('canvas'), g = cv.getContext('2d'), pad = Math.ceil(fs * 0.4);
      let font = `${fs}px VT323, "IBM Plex Mono", monospace`; g.font = font;
      const fits = (t) => g.measureText(t).width + 4 + 2 * pad <= maxW, short = p.short.toUpperCase();
      const lines = [fits(full) ? full : short];
      if (!fits(lines[0])) { const f2 = Math.max(Math.round(fs * 0.7), Math.floor(fs * (maxW - 4 - 2 * pad) / g.measureText(short).width)); font = `${f2}px VT323, "IBM Plex Mono", monospace`; g.font = font; }
      const w = Math.ceil(Math.max(...lines.map((t) => g.measureText(t).width))) + 4 + 2 * pad;
      cv.width = w; cv.height = Math.ceil(fs * 1.05 * lines.length + fs * 0.2) + pad;
      g.font = font; g.textBaseline = 'top'; g.textAlign = 'center';
      g.shadowColor = rgb(p.col, 1, 0.9); g.shadowBlur = fs * 0.45; g.fillStyle = rgb(p.col, 0.9);
      lines.forEach((t, i) => g.fillText(t, w / 2, pad / 2 + i * fs * 1.05));
      g.shadowBlur = 0; g.fillStyle = rgb(p.col.map((v) => v + (255 - v) * 0.55));
      lines.forEach((t, i) => g.fillText(t, w / 2, pad / 2 + i * fs * 1.05));
      this.labels.set(key, cv);
      return cv;
    },
    // the far city (cached): two rows of buildings against the sky, wider than the screen (the camera pans), their windows
    // lit by a share k 0..1 (population, dawn), always the same ones first
    farCity(W, gd) {
      const px = this.px || 3, key = W + '|' + gd + '|' + px;
      if (this.bg && this.bg.key === key) return this.bg;
      const r = mulberry(7), blds = [], wins = [], FW = Math.round(W * 1.3), bandH = Math.round(gd * 0.24 / px) * px + 5 * px;
      [[0.06, 0.18, 6, 16, 0.8], [0.02, 0.1, 8, 22, 0.92]].forEach(([h0, h1, w0, w1, al], row) => {
        let x = -Math.floor(r() * 8) * px;
        while (x < FW) {
          const bw = Math.round(w0 + r() * (w1 - w0)) * px, bh = Math.round((h0 + r() * (h1 - h0)) * gd / px) * px, y = bandH - bh;
          blds.push([x, y, bw - px, bh, row, al]);
          if (r() < 0.3) { const mx = x + Math.round(bw / 2 / px) * px - px; blds.push([mx, y - 3 * px, px, 3 * px, row, al]); if (r() < 0.8) wins.push([mx, y - 4 * px, 0, 3, row]); }
          for (let yy = y + 2 * px; yy < bandH - px; yy += (2 + row) * px) for (let xx = x + px; xx < x + bw - 2 * px; xx += 2 * px) wins.push([xx, yy, r(), r() < 0.6 ? 0 : r() < 0.5 ? 1 : 2, row]);
          x += bw;
        }
      });
      this.bg = { key, blds, wins, bandH, FW };
      this.skyW = null;
      return this.bg;
    },
    skyline(k) {
      const bg = this.bg, qk = Math.round(k * 20) / 20, key = bg.key + '|' + qk;
      if (this.skyW && this.skyW.key === key) return this.skyW.cv;
      const cv = this.skyW && this.skyW.cv.width === bg.FW && this.skyW.cv.height === bg.bandH ? this.skyW.cv : this.canvas(bg.FW, bg.bandH), g = cv.getContext('2d'), px = this.px || 3;
      g.clearRect(0, 0, cv.width, cv.height);
      for (const [x, y, w, h, row, al] of bg.blds) { g.fillStyle = rgb(TOK.wall, 0.85 - 0.25 * row, al); g.fillRect(x, y, w, h); }
      const cols = [TOK.amber, TOK.cyan, TOK.pink, TOK.red], s = Math.max(1, px - 1);
      for (const [x, y, t, c, row] of bg.wins) if (t < qk || c === 3) { g.fillStyle = rgb(cols[c], c === 3 ? 1 : 0.95, (row ? 0.75 : 0.5) * (c === 0 ? 1 : 0.85)); g.fillRect(x, y, s, s); }
      this.skyW = { key, cv };
      return cv;
    },
    // the wet street (cached): asphalt, a faint synthwave grid to the horizon, puddles, a neon kerb; wider than the screen
    street(W, H, gd) {
      const px = this.px || 3, key = W + 'x' + H + '|' + gd + '|' + px;
      if (this.st0 && this.st0.key === key) return this.st0.cv;
      const r = mulberry(9), w = Math.round(W * 1.5), gh = Math.max(1, Math.round((H - gd) * 1.4) + px), gr = this.canvas(w, gh), g = gr.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 0, gh); grd.addColorStop(0, rgb(TOK.ground, 2.2)); grd.addColorStop(0.5, rgb(TOK.ground)); grd.addColorStop(1, rgb(TOK.ground, 0.7)); g.fillStyle = grd; g.fillRect(0, 0, w, gh);
      g.strokeStyle = rgb(TOK.pink, 1, 0.12); g.lineWidth = Math.max(1, px >> 1); g.beginPath();
      for (let k = -16; k <= 16; k++) { g.moveTo(w / 2 + k * W * 0.02, 0); g.lineTo(w / 2 + k * W * 0.16, gh); }
      for (let i = 1; i < 9; i++) { const y = Math.round(gh * (i / 9) ** 2); g.moveTo(0, y); g.lineTo(w, y); }
      g.stroke();
      for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? rgb(TOK.cyan, 1, 0.08) : rgb(TOK.pink, 1, 0.08); g.fillRect(Math.floor(r() * w / px) * px, Math.floor(r() * gh / px) * px, Math.round((4 + r() * 22)) * px, Math.max(1, px >> 1)); }
      g.fillStyle = rgb(TOK.pink, 1, 0.55); g.fillRect(0, 0, w, Math.max(1, px >> 1));
      this.st0 = { key, cv: gr };
      return gr;
    },
    // the sky of a chord: 'night' (before any chord), 'dawn' (finale), or `${deg}|${minor}`; cached by key and size
    skyColors(key, off = 0) {
      if (key === 'night') return off ? [[0, hex(TOK.night)], [0.6, `rgb(${hsl2rgb(((285 + off) % 360 + 360) % 360, 0.5, 0.09).join()})`], [1, `rgb(${hsl2rgb(((300 + off) % 360 + 360) % 360, 0.55, 0.2).join()})`]] : [[0, hex(TOK.night)], [0.6, hex(TOK.sky)], [1, hex(TOK.horizon)]];
      if (key === 'dawn') return [[0, hex(TOK.dawnTop)], [0.5, hex(TOK.dawnMid)], [0.85, hex(TOK.dawnLow)], [1, hex(TOK.sunTop)]];
      const [d, mi] = key.split('|'), h = ((HUES[(+d % 7 + 7) % 7] + (mi === '1' ? 18 : 0) + off) % 360 + 360) % 360;
      const c = (sa, l) => `rgb(${hsl2rgb(h, sa, l).join()})`;
      return [[0, hex(TOK.night)], [0.5, c(0.5, mi === '1' ? 0.07 : 0.1)], [1, c(0.65, mi === '1' ? 0.2 : 0.27)]];
    },
    hueOff() { const D = this.sDef, v = this.sc.hue; return D && v != null ? Math.round((v - D.hue) * 22) * 15 : 0; },
    sky(key, W, gd) {
      const off = key === 'dawn' ? 0 : this.hueOff(), k = key + '|' + off + '|' + W + 'x' + gd;
      let cv = this.skies.get(k);
      if (cv) return cv;
      this.cacheMisses++;
      cv = document.createElement('canvas'); cv.width = W; cv.height = Math.max(1, gd);
      const g = cv.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, gd);
      for (const [o, c] of this.skyColors(key, off)) grd.addColorStop(o, c);
      g.fillStyle = grd; g.fillRect(0, 0, W, gd);
      this.skies.set(k, cv);
      if (this.skies.size > 16) this.skies.delete(this.skies.keys().next().value);
      return cv;
    },
    // the dawn's sun: a synthwave disc, striped at its foot, rising behind the city (cached)
    sun(R) {
      return this.fx('dawnsun', R, R, () => {
        const c = this.canvas(2 * R, 2 * R), x = c.getContext('2d'), grd = x.createLinearGradient(0, 0, 0, 2 * R);
        grd.addColorStop(0, hex(TOK.sunTop)); grd.addColorStop(1, hex(TOK.sunLow)); x.fillStyle = grd;
        x.beginPath(); x.arc(R, R, R, 0, 6.283); x.fill(); x.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 7; i++) x.fillRect(0, R * (1.05 + i * 0.13), 2 * R, Math.max(1, R * 0.025 * (i + 1)));
        return c;
      });
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

    // ---- S8.1 construction, timed on the audio clock ----
    // growAt(t): the next change of the game state (an opening) builds from audio time t (null = now); retime(t): a
    // construction already armed waits until t (the map closing)
    growAt(t) { this.growNext = true; this.retime(t); },
    retime(t) {
      const now = this.clock(), at = t == null ? now : t;
      this.growStart = at;
      for (const id in this.grow) { const e = this.grow[id]; if (e.start + e.dur > now && e.h1 > e.h0) e.start = Math.max(at, now); }
    },
    // progress 0..1 of a building's construction (1 = done or none); h(): its height now (cells)
    growth(id, now) {
      const e = this.grow[id]; if (!e) return 1;
      const qq = (now - e.start) / e.dur;
      return qq <= 0 ? 0 : qq >= 1 ? 1 : ease(qq);
    },
    heightAt(id, now) { const e = this.grow[id]; if (!e) return this.built[id] || 0; return e.h0 + (e.h1 - e.h0) * this.growth(id, now); },
    // a building's target changes: from where it is now, to h1, starting at `start`; a lower target keeps the taller
    // sprite while its floors sink, a higher one shows the new building, its top floors in scaffolding
    retarget(p, h1, start, now) {
      const h0 = this.heightAt(p.id, now), e = this.grow[p.id], up = h1 > h0, d = Math.abs(h1 - h0);
      const spr = up ? h1 : Math.max(e ? e.spr : 0, this.built[p.id] || 0, Math.ceil(h0));
      if (this.reduced || d < 0.01) { delete this.grow[p.id]; this.built[p.id] = h1; return; }
      this.grow[p.id] = { h0, h1, spr, start, dur: up ? BUILD.base + BUILD.perCell * d : BUILD.unbase + BUILD.unPerCell * d };
      this.built[p.id] = h1;
      if (!up) this.impulse('build', 0.6);
    },
    updateBuildings(now) {
      const armed = this.armed, n0 = Object.keys(this.grow).length;
      for (const p of this.plants) {
        const w = this.wantOf(p), has = this.built[p.id] != null;
        if (!has) { // first sight: built at once (first frame, return of the state), or from the ground on an opening
          if (armed != null && !this.reduced) { this.built[p.id] = 0; this.retarget(p, w, armed, now); } else this.built[p.id] = w;
        } else if (w !== this.built[p.id]) this.retarget(p, w, armed != null ? armed : now, now);
        const e = this.grow[p.id];
        if (e && now >= e.start + e.dur) delete this.grow[p.id];
      }
      for (const id in this.grow) if (!this.plants.some((p) => p.id === id)) delete this.grow[id];
      this.armed = null;
      if (Object.keys(this.grow).length > n0) this.impulse('build', 1);
      let s = 0; for (const id in this.grow) if (now >= this.grow[id].start) s++;
      this.sites = s;
    },

    // ---- S4.5w finale: the recorded song is heard again (garden.finale); its events light the buildings ----
    replayStart(r) {
      const ev = (r.ev || []).filter((e) => e.t >= r.from && e.t < r.from + r.len).sort((x, y) => x.t - y.t);
      this.replay = { t0: r.t0, from: r.from, len: r.len, ev, i: 0 };
      this.pending.length = 0; this.skyQ.length = 0; this.lit = {};
    },
    replayStop() { this.replay = null; this.lit = {}; },
    dawnLevel(now) {
      const R = this.replay;
      if (R) return clamp((now - R.t0 - R.from) / Math.max(0.1, R.len));
      return !this.free && AMB.game && AMB.game.s && AMB.game.s.ended ? 1 : 0; // the instrument handed over: the city stays at dawn
    },
    // the beat (0..1 since the last one, strong = beat 1 or 3), null when the sequencer is stopped
    beatPhase(now) {
      const S = AMB.seq; if (!S || !S.playing || !S.stepDur) return null;
      const sd = S.stepDur(), pos = (S.step - (S.nextTime - now) / sd - (S.origin || 0)) / 4, bt = Math.floor(pos);
      return { ph: pos - bt, strong: ((bt % 2) + 2) % 2 === 0 };
    },

    // ---- state refresh (events + a cheap 1 s signature check, e.g. after a save import) ----
    refresh(W, H, force) {
      const st = this.readState(), ceil = this.ceilFrac(), sig = this.signature(st) + W + 'x' + H + '|' + ceil.toFixed(3) + JSON.stringify(this.zones) + JSON.stringify(this.safe || 0);
      if (!force && sig === this.sig) { this.lastCheck = this.now(); return false; }
      this.sig = sig; this.state = st;
      const L = layout(st, W, H, this.safe), old = Object.fromEntries(this.plants.map((p) => [p.id, p]));
      // the same object for a building that stays (it keeps its smoothed look)
      this.plants = L.plants.map((p) => (old[p.id] ? Object.assign(old[p.id], p) : p)); this.rares = L.rares; this.ground = L.ground; this.slotW = L.slotW; this.rows = L.rows;
      this.W = W; this.H = H; this.ceil = ceil;
      const top = Math.min(...this.plants.map((p) => p.y), L.ground), avail = Math.max(H * 0.2, top - H * ceil);
      const perRow = L.rows === 2 ? Math.ceil(this.plants.length / 2) : this.plants.length;
      this.px = this.cellPx(W, H, perRow, avail);
      this.hMax = Math.max(12, Math.min(W < H ? 96 : 64, Math.floor((avail / this.px - 8) / 1.1)));
      const xs = this.plants.slice().sort((u, v) => u.x - v.x);
      xs.forEach((p, i) => { p.roomL = (i ? (p.x - xs[i - 1].x) / 2 : p.x) - 1; p.roomR = (i < xs.length - 1 ? (xs[i + 1].x - p.x) / 2 : W - p.x) - 1; });
      for (const p of this.plants) { // never into the HUD: the tallest body + its roof (~7 cells) stays under its corner
        const rk = p.row ? ROW_K : 1; p.cap = Math.max(FLOOR * 3, Math.floor(((p.y - H * this.ceilAt(p.x, CW * this.px * 0.3)) / (this.px * rk) - 7) / FLOOR) * FLOOR);
      }
      // an opening (garden.beat → growAt) builds the new building from the ground, a taller one from its old height
      const stSig = this.signature(st);
      if (this.growNext && stSig !== this.stSig && this.stSig != null) this.armed = Math.max(this.growStart == null ? this.clock() : this.growStart, this.clock());
      if (stSig !== this.stSig) this.growNext = false;
      this.stSig = stSig;
      for (const id in this.built) if (!this.plants.some((p) => p.id === id)) { delete this.built[id]; delete this.grow[id]; }
      this.lastCheck = this.now();
      this.place(this.camera(W, H));
      return true;
    },

    // ---- S4.6 the look follows the settings: targets from the store (look), smoothed per building (~0.35 s);
    // a touched control (sources below) highlights its buildings while it is touched ----
    KICK: new Set(['user', 'macro', 'cc']),
    watch() {
      const S = AMB.store;
      if (!S || S === this.watched || typeof S.on !== 'function') return;
      this.watched = S; this.lookDirty = true;
      S.on((k, v, src) => this.onSet(k, src));
    },
    onSet(key, src) {
      this.lookDirty = true;
      if (!this.KICK.has(src) || !this.running()) return; // nothing is kept for a city off screen
      const t = this.t || 0;
      for (const n of SCENE_OF[key] || []) this.kick[n] = 1; // S5.8: the scene layer it drives
      for (const id of concerns(key)) { const k = this.kicks[id]; if (k && t - k.last < 0.25) k.last = t; else this.kicks[id] = { t0: t, last: t }; }
      this.impulse('kick', 1);
    },
    getter() { const S = AMB.store; return S && typeof S.get === 'function' ? (k) => S.get(k) : () => undefined; },
    updateLook(dt) {
      if (this.lookDirty || !this.aim) { const get = this.getter(); this.aim = look(get); this.allAim = lookAll(get); this.nature = norm('texture.vol', get('texture.vol')) * (val(get, 'texture.on') === false ? 0 : 1); this.lookDirty = false; }
      const kT = this.reduced ? 1 : 1 - Math.exp(-dt / 0.11);
      for (const p of this.plants) {
        const a = this.aim[p.id]; if (!a) continue;
        const c = this.cur[p.id] || (this.cur[p.id] = { ...a });
        for (const k of ASPECTS) c[k] += (a[k] - c[k]) * kT;
        p.look = c; p.sz = this.sizeK(p.id, c.size);
      }
    },

    // ---- S5.8 scene layers: targets from the table (store + polled app state), smoothed (~0.35 s); a polled state that
    // changes (mode, play / stop, section) kicks its layer; the impulses fade in ~0.8 s ----
    layers() { return scene(this.getter()); },
    updateScene(dt) {
      const get = this.getter();
      if (this.lookDirty || !this.sAim) { this.sAim = scene(get); this.sDef = this.sDef || scene(() => undefined); }
      else for (const n in SCENE) if (SCENE[n].poll) { let v = 0; try { v = +SCENE[n].poll() || 0; } catch (e) {} this.sAim[n] = clamp(v); }
      for (const n in SCENE) if (SCENE[n].poll) { const v = this.sAim[n]; if (this.sPoll[n] != null && this.sPoll[n] !== v) this.kick[n] = 1; this.sPoll[n] = v; }
      const kT = this.reduced ? 1 : 1 - Math.exp(-dt / 0.11);
      for (const n in SCENE) { const a = this.sAim[n], c = this.sc[n]; this.sc[n] = c == null ? a : c + (a - c) * kT; }
      for (const n in this.kick) { this.kick[n] -= dt / 0.8; if (this.kick[n] <= 0) delete this.kick[n]; }
      // the tempo is the scene's speed (Flottant slower); reduced motion: the scene stands still
      const tp = norm('global.tempo', get('global.tempo')), fl = val(get, 'global.time') === 'Flottant';
      this.speed = (0.5 + 1.5 * tp) * (fl ? 0.6 : 1);

    },
    // S5.9 → S5.8: a moment of the juice table (garden.FX `kick`) flares scene layers up, k = JUICE
    flare(names, k = this.JUICE) { if (!this.running() || this.reduced) return 0; let n = 0; for (const x of names) if (SCENE[x]) { this.kick[x] = Math.max(this.kick[x] || 0, Math.min(1, k)); n++; } return n; },
    // how much of a scene layer is drawn: its intensity squared (default settings = a calm scene) + the impulse of a touch
    amt(n) { const v = this.sc[n] || 0; return Math.min(1, v * v + 0.8 * (this.kick[n] || 0)); },

    // ---- S8.1 the world: every dimension smoothed toward its aim, the impulses falling, the beat ----
    updateWorld(dt, now) {
      const w = this.world, c = { get: this.getter(), L: this.sc, all: this.allAim || lookAll(() => undefined), plants: this.plants, dawn: this.dawnLevel(now), free: !!this.free, nature: this.nature || 0, sites: this.sites || 0, frame: () => fr || (fr = this.framing()) };
      let fr = null;
      for (const name in DIMS) {
        const D = DIMS[name]; let a = 0; try { a = +D.aim(c) || 0; } catch (e) {}
        const cur = getPath(w, name), kT = this.reduced || !D.tau || cur == null ? 1 : 1 - Math.exp(-dt / D.tau);
        setPath(w, name, cur == null ? a : cur + (a - cur) * kT);
      }
      for (const n in w.pulse) w.pulse[n] = Math.max(0, w.pulse[n] - dt / (PULSES[n] || 0.5));
      const bp = this.reduced ? null : this.beatPhase(now), b = w.beat;
      if (bp) { if (b.on && bp.ph < b.ph) this.impulse('beat', bp.strong ? 1 : 0.6); b.ph = bp.ph; b.strong = bp.strong; b.k = (bp.strong ? 1 : 0.55) * Math.exp(-bp.ph * 5); b.on = true; } else { b.on = false; b.k = 0; }
      // a storm: lightning on some strong beats (or every few seconds without the sequencer), never in reduced motion
      if (!this.reduced && w.weather.storm > 0.05) {
        const slot = Math.floor(this.st * 0.7), r = ih(slot, 77);
        if (slot !== this.boltSlot) { this.boltSlot = slot; if (r < 0.25 + 0.6 * w.weather.storm) { this.impulse('flash', 0.6 + 0.4 * w.weather.storm); this.bolt = { x: 0.15 + 0.7 * ih(slot, 3), seed: slot }; } }
      }
      // S8.4 hook: + cam.dx (a dimension: Espace's dolly and gesture push, js/city-dims.js)
      w.cam.x = (this.reduced ? 0 : Math.sin(this.st * 0.045) * 0.012 * (0.4 + (w.cam.depth || 0))) + (w.cam.dx || 0);
      w.cam.shake = Math.hypot(this.ox, this.oy);
      w.speed = this.speed; w.t = this.st;
      return w;
    },
    // ---- the camera: recul (zoom about the foot of the street), pan with parallax (depth d), shake ----
    camera(W, H) {
      const w = this.world, gd = this.ground || H * 0.76, cam = this.cam || (this.cam = {
        k(d) { return 1 + (this.zoom - 1) * d; },
        x(d, x) { const k = this.k(d); return x * k + this.W / 2 * (1 - k) + this.pan * d * this.W + this.ox; },
        y(d, y) { const k = this.k(d); return y * k + this.gd * (1 - k) + this.oy; },
        set(g, d) { const k = this.k(d); g.setTransform(k, 0, 0, k, this.W / 2 * (1 - k) + this.pan * d * this.W + this.ox, this.gd * (1 - k) + this.oy); return k; },
      });
      cam.W = W; cam.H = H; cam.gd = gd; cam.px = this.px || 3; cam.ox = this.ox || 0; cam.oy = this.oy || 0;
      const wc = w.cam || {}, z = (wc.frame || 1) * (1 - 0.16 * (wc.back || 0));
      cam.zoom = z; cam.pan = (wc.x || 0) - ((wc.cx == null ? 0.5 : wc.cx) - 0.5) * z;
      return cam;
    },
    // the framing the camera aims at: the built buildings (x span, the tallest) fill the street, never into the HUD;
    // at most ×1.6 closer; {z, cx}
    framing() {
      const W = this.W || 1, H = this.H || 1, gd = this.ground || H * 0.76, px = this.px || 3, ps = this.plants.concat(this.rares);
      if (!ps.length) return { z: 1, cx: 0.5 };
      let x0 = Infinity, x1 = -Infinity, up = 1;
      for (const p of ps) {
        const rk = p.row ? ROW_K : 1, hw = 10 * px * rk, hc = p.rare ? 9 : (this.built[p.id] != null ? this.built[p.id] : this.wantOf(p)) + 7;
        x0 = Math.min(x0, p.x - hw); x1 = Math.max(x1, p.x + hw); up = Math.max(up, gd - p.y + hc * px * rk);
      }
      const cx = (x0 + x1) / 2, span = Math.max(1, x1 - x0), room = gd - H * Math.max(this.ceil || 0.1, ...this.zones.map((zz) => zz.b));
      const z = clamp(Math.min(W * 0.8 / span, room / up), 1, 1.6);
      // a closer camera keeps the framed lots on screen; at ×1 the whole street is seen as it is
      return { z, cx: z <= 1.001 ? 0.5 : clamp(cx / W, 0.5 / z, 1 - 0.5 / z) };
    },
    // where each building is on screen now (sx, sy = its foot, k = its scale, vis = its built height in sprite px, gy =
    // built share), from the construction and the camera
    place(cam, now = this.clock()) {
      const px = this.px || 3;
      for (const p of this.plants) {
        const d = p.row ? ROW_D : 1;
        p.k = cam.k(d) * (p.row ? ROW_K : 1); p.sx = cam.x(d, p.x); p.sy = cam.y(d, p.y);
        const e = this.grow[p.id], h = this.heightAt(p.id, now), want = this.built[p.id] != null ? this.built[p.id] : this.wantOf(p);
        p.spr = e ? e.spr : want; p.h = h;
        const s = p.spr > 0 ? this.sprite(p, px) : null;
        p.vis = !s ? 0 : !e ? s.h : Math.min(s.h, h * px);
        p.gy = s ? p.vis / s.h : 0;
      }
      for (const p of this.rares) { p.k = cam.k(1); p.sx = cam.x(1, p.x); p.sy = cam.y(1, p.y); p.spr = 9; const s = this.sprite(p, px); p.vis = s.h; p.gy = 1; }
    },
    // cached canvases of the scene, rebuilt only when the size changes
    fx(name, W, H, build) {
      const key = name + '|' + W + 'x' + H + '|' + (this.px || 3);
      const c = this.fxc[name];
      if (c && c.key === key) return c.cv;
      this.cacheMisses++;
      const cv = build(W, H, this.px || 3);
      this.fxc[name] = { key, cv };
      return cv;
    },
    canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; },

    // ---- events: queued with their audio time, applied when they sound ----
    onEvent(layer, time, vel) {
      if (!this.running() || this.replay) return; // the finale lights the buildings from the recorded song only
      this.pending.push({ layer, time: time || 0, vel: vel == null ? 0.7 : vel });
      if (this.pending.length > 200) this.pending.splice(0, this.pending.length - 200);
    },
    running() { return this.active && this.visible && !this.paused && !(typeof document !== 'undefined' && document.hidden); },
    // a note of a layer: its building lights up (windows, neon, beacon), a spark flies off its roof
    hit(layer, vel) {
      const p = this.plants.find((qq) => qq.id === layer);
      if (!p) return false;
      this.energy[layer] = Math.min(1, (this.energy[layer] || 0) * 0.5 + 0.5 + vel * 0.5);
      this.impulse('note', 0.4 + 0.6 * vel);
      if (!this.reduced && this.parts.length < PARTS_MAX && p.vis) {
        const px = this.px, r = this.rng || (this.rng = mulberry(99));
        this.parts.push({ x: (p.sx || p.x) + (r() - 0.5) * 8 * px, y: (p.sy || p.y) - p.vis * (p.k || 1) * (0.6 + r() * 0.4), vx: (r() - 0.5) * 12 * px, vy: -(8 + r() * 10) * px, life: 1, col: r() < 0.3 ? [255, 233, 168] : p.col, s: r() < 0.5 ? 1 : 2 });
      }
      return true;
    },

    // ---- S5.2 splashes: queued with their audio time; at most WAVES_PER_PLANT per building, a machine note never pushes
    // out the player's ----
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
    // a celebration (kind = 'streak' | 'record' | 'tier', SPLASH) bursts from a building (the Melody's by default; the juice
    // table passes the opened layer's) at audio time `at`, same splashes, same JUICE
    cheer(kind, at, plant) {
      const S = SPLASH[kind]; if (!S || this.free) return false;
      this.onSplash('cheer', { kind, plant, time: at == null ? this.clock() : at });
      return true;
    },
    release(id, time) { const t = time == null ? this.clock() : time; for (const w of this.waves) if (w.off == null && w.held != null && (id == null || w.held === id)) w.off = t; },
    // brightness a (0..1) and ring radius r (0..1) of a splash now; null = over. A held note stays lit until released.
    waveEnv(w, now) {
      const S = SPLASH[w.who], age = now - w.t0, held = w.held != null;
      if (held && w.off == null && ((w.held === 'chord' && age > 0.05 && !(AMB.seq && AMB.seq.chordHold)) || age > HELD_MAX)) w.off = now;
      if (this.reduced) {
        const end = held ? (w.off == null ? Infinity : Math.max(w.off, w.t0 + 0.15)) : w.t0 + 0.3;
        return now < end ? { a: 1, r: 0 } : null;
      }
      const qq = Math.min(1, Math.max(0, age) / S.life), r = 1 - (1 - qq) ** 3;
      let a = held ? (qq < 1 ? 1 - 0.45 * qq : 0.55) : 1 - qq;
      if (held && w.off != null) a *= 1 - Math.max(0, now - Math.max(w.off, w.t0)) / 0.35;
      return a > 0.01 ? { a, r } : null;
    },
    // where a note sits on its building: low notes near the foot, high ones near the roof
    origin(p, pitch) { const h = (p.vis || 0) * (p.k || 1); return { x: p.sx != null ? p.sx : p.x, y: (p.sy != null ? p.sy : p.y) - h * (0.2 + 0.75 * pitch) }; },
    tint(col, pitch) { const k = Math.round(pitch * 4) / 4; return col.map((v) => Math.round(v + (255 - v) * 0.55 * k)); },
    // the moment it sounds: particles fly out, the building's lights flash, a chord or a loud note shakes the camera
    fire(w, p) {
      w.fired = true;
      this.impulse(w.who === 'chord' ? 'chord' : 'note', 0.5 + 0.5 * w.vel);
      if (this.reduced) return;
      const S = SPLASH[w.who], J = this.JUICE, v = 0.4 + 0.6 * w.vel, o = this.origin(p, w.pitch), px = this.px, r = this.rng || (this.rng = mulberry(99));
      const col = this.tint(p.col, w.pitch), n = Math.round(S.parts * J * v);
      for (let k = 0; k < n; k++) {
        const an = -Math.PI / 2 + (r() - 0.5) * (S.spread || 2.8), sp = (9 + r() * 24) * px * (0.6 + 0.5 * v) * (0.7 + 0.3 * J);
        const c = r(), big = w.who !== 'machine' ? (r() < 0.35 ? 3 : 2) : 1;
        this.parts.push({ x: o.x, y: o.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: 1, decay: 1 + r() * 0.7, g: 24, col: c < 0.3 ? [255, 240, 200] : c < 0.65 ? col : p.col, s: big });
      }
      if (this.parts.length > PARTS_MAX) this.parts.splice(0, this.parts.length - PARTS_MAX);
      this.zap[p.id] = Math.max(this.zap[p.id] || 0, S.flash * v);
      this.band = this.band || {}; this.band[p.id] = { pitch: w.pitch, a: S.flash * v };
      if (w.shake) this.shake = { t0: this.t || 0, amp: Math.max(this.shake ? this.shake.amp * 0.5 : 0, w.shake * J) };
    },
    // drawn in 'lighter' mode: a glow where the note sits (lit as long as it is held) and a ring of LEDs that spreads
    drawSplash(g, now) {
      const px = this.px;
      for (let i = this.waves.length - 1; i >= 0; i--) {
        const w = this.waves[i]; if (w.t0 > now + 0.02) continue;
        const p = this.plants.find((qq) => qq.id === w.plant), e = p && this.waveEnv(w, now);
        if (!e) { this.waves.splice(i, 1); continue; }
        if (!w.fired) this.fire(w, p);
        const S = SPLASH[w.who], o = this.origin(p, w.pitch), A = S.ring * (0.4 + 0.6 * w.vel) * e.a, col = w.col || (w.col = this.tint(p.col, w.pitch));
        const Rg = Math.max(12, Math.round(px * (w.who === 'machine' ? 6 : 12))), gl = this.glow(col, Rg);
        g.globalAlpha = Math.min(1, this.reduced ? 0.8 * S.ring : A); g.drawImage(gl, o.x - Rg, o.y - Rg);
        if (this.reduced) continue;
        const nd = w.who === 'machine' ? 10 : 20, R = px * (2 + (w.who === 'machine' ? 8 : 22) * (0.5 + 0.5 * w.vel) * (0.6 + 0.4 * this.JUICE) * e.r), sz = Math.max(1, px - 1);
        g.fillStyle = w.fill || (w.fill = rgb(col)); g.globalAlpha = Math.min(1, A);
        for (let k = 0; k < nd; k++) { const an = (k / nd) * 6.283 + w.t0 * 3; g.fillRect(Math.round((o.x + Math.cos(an) * R) / px) * px, Math.round((o.y + Math.sin(an) * R * 0.8) / px) * px, sz, sz); }
      }
      g.globalAlpha = 1;
    },

    // ---- one building, as it is now: lit, under construction (scaffold, crane, floors up, windows lit one by one) or
    // being taken down (floors dark and sinking, neon dust); never deformed ----
    drawBuilding(g, p, now, dark) {
      const px = this.px, s = this.sprite(p, px), k = p.k, red = this.reduced, e = this.grow[p.id], R = this.replay, w = this.world;
      const vis = p.vis, building = e && e.h1 > e.h0 && now >= e.start, sinking = e && e.h1 < e.h0 && now >= e.start;
      g.setTransform(k, 0, 0, k, p.sx, p.sy);
      if (vis < px * 0.5) { this.drawLot(g, p, s, now); return; }
      const sy0 = s.h - vis;
      const a = p.look, off = a ? 1 - a.on : 0, rep = R ? 0.3 + 0.7 * Math.min(1, this.lit[p.id] || 0) : 1;
      g.globalAlpha = rep;
      if (building) { // floors up, still dark; their windows light up one by one, a little later
        g.drawImage(s.dk, 0, sy0, s.w, vis, -s.w / 2, -vis, s.w, vis);
        const litH = Math.min(vis, Math.max(0, this.heightAt(p.id, now - BUILD.lag) * px));
        if (litH > 0) g.drawImage(s.cv, 0, s.h - litH, s.w, litH, -s.w / 2, -litH, s.w, litH);
        const band = vis - litH;
        if (band > 0) { // the lighting front: each window of the band comes on at its own moment
          g.fillStyle = rgb(p.col.map((v) => v + (255 - v) * 0.6)); const top = s.h - vis, bot = s.h - litH, gap = px >= 4 ? 1 : 0;
          for (const [x, y] of s.wins) if (y >= top && y < bot && ih(x, y) > (y - top) / band) g.fillRect(x - s.w / 2, y - s.h, px - gap, px - gap);
        }
      } else {
        g.drawImage(s.cv, 0, sy0, s.w, vis, -s.w / 2, -vis, s.w, vis);
        if (sinking) { // the top floors go dark before they sink
          const bandH = Math.min(vis, FLOOR * 2 * px); g.drawImage(s.dk, 0, sy0, s.w, bandH, -s.w / 2, -vis, s.w, bandH);
        }
      }
      // the city's power: a cut darkens it (dk over it), a surge makes its lights glow; a layer switched off: dark
      const pw = w.power == null ? 0.7 : w.power, cut = Math.max(0, (0.45 - pw) / 0.45) * 0.7 + 0.6 * off;
      if (cut > 0.02) { g.globalAlpha = Math.min(1, cut) * rep; g.drawImage(s.dk, 0, sy0, s.w, vis, -s.w / 2, -vis, s.w, vis); }
      // lights: a touch (hot), a note (zap, energy; brighter on the band of its pitch), the dawn, the power
      const hot = p.hot || 0, zap = this.zap[p.id] || 0, en = this.energy[p.id] || 0, dawn = w.dawn || 0;
      let L = Math.max(0.5 * hot, 0.55 * zap, 0.45 * en, 0.35 * dawn * (R ? Math.min(1, this.lit[p.id] || 0) : 1), Math.max(0, pw - 0.6) * 0.5) * (1 - off);
      if (p.kind === 'bell' && !red && !hot) { const b = Math.sin(this.t * 53 + p.phase) + Math.sin(this.t * 7.3) + Math.sin(this.t * 2.1 + 1); if (b > 2.2) L = 0; } // the neon sign buzzes
      if (L > 0.02 && !dark) {
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, L);
        g.drawImage(s.em, 0, sy0, s.w, vis, -s.w / 2, -vis, s.w, vis);
        const bd = this.band && this.band[p.id];
        if (bd && bd.a > 0.03) { const bh = Math.max(px * 4, vis * 0.3), by = clamp(vis * (0.2 + 0.75 * bd.pitch) - bh / 2, 0, vis - bh); g.globalAlpha = Math.min(1, bd.a); g.drawImage(s.em, 0, s.h - by - bh, s.w, bh, -s.w / 2, -by - bh, s.w, bh); }
        g.globalCompositeOperation = 'source-over';
      }
      g.globalAlpha = 1;
      if (building) this.drawScaffold(g, p, s, vis, e, now);
      else if (sinking && !red && Math.random() < 0.5 && this.parts.length < PARTS_MAX) { // neon dust off the cut
        const r = this.rng || (this.rng = mulberry(99)), x = (r() - 0.5) * (s.l + s.r);
        this.parts.push({ x: p.sx + x * k, y: p.sy - vis * k, vx: (r() - 0.5) * 6 * px + (w.weather.wind || 0) * 10 * px, vy: -(2 + r() * 6) * px, life: 1, decay: 0.9 + r() * 0.6, g: -2, col: r() < 0.5 ? p.col : [200, 190, 220], s: r() < 0.3 ? 2 : 1 });
      }
    },
    // the building's frame above its built floors up to its future roof, the crane over it, sparks of welding
    drawScaffold(g, p, s, vis, e, now) {
      const px = this.px, top = (e.h1 + 1) * px, red = this.reduced, x0 = -s.l, x1 = s.r, lw = Math.max(1, px >> 1), T = this.st;
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rgb(TOK.cyan, 0.7, 0.45); // the frame: two poles, a bar every floor
      g.fillRect(x0, -top, lw, top - vis + px); g.fillRect(x1 - lw, -top, lw, top - vis + px);
      for (let y = vis; y <= top; y += FLOOR * px) g.fillRect(x0, -y, x1 - x0, lw);
      g.fillStyle = rgb(TOK.amber, 1, 0.9); // the working floor's lamps blink
      for (let x = x0; x < x1; x += 3 * px) if (red || (Math.floor(T * 4 + x) & 1)) g.fillRect(x, -vis - px, px - 1, px - 1);
      // the tower crane: a mast beside the building, the jib turning slowly (seen from the street: its length changes)
      const mx = x1 + 2 * px, mt = top + 6 * px, an = red ? 0.6 : Math.sin(T * 0.5 + p.phase), jl = 16 * px * an, cl = 5 * px * an;
      g.fillStyle = rgb(TOK.amber, 0.8, 0.75);
      g.fillRect(mx, -mt, px, mt); for (let y = 2 * px; y < mt; y += 3 * px) g.fillRect(mx - px, -y, 3 * px, lw);
      g.fillRect(Math.min(mx, mx - jl), -mt, Math.abs(jl) + px, px); g.fillRect(Math.min(mx, mx + cl), -mt, Math.abs(cl) + px, px);
      g.fillRect(mx + cl - (cl < 0 ? px : 0), -mt + px, 2 * px * Math.sign(cl || 1), 2 * px); // counterweight
      const hx = mx - jl * 0.7; g.fillStyle = rgb(TOK.amber, 0.6, 0.5); g.fillRect(hx, -mt + px, lw, mt - vis - 3 * px); // the hook line, down to the floor being built
      g.fillStyle = rgb(TOK.amber, 1.1, 0.95); g.fillRect(hx - 2 * px, -vis - 3 * px, 4 * px, px); // a floor slab hanging
      if (red || Math.floor(T * 3) % 2) { g.fillStyle = rgb(TOK.red, 1.2); g.fillRect(mx, -mt - px, px, px); }
      g.globalCompositeOperation = 'source-over';
      if (!red && this.parts.length < PARTS_MAX && Math.random() < 0.35) { // welding sparks
        const r = this.rng || (this.rng = mulberry(99)), k = p.k;
        this.parts.push({ x: p.sx + (x0 + r() * (x1 - x0)) * k, y: p.sy - vis * k, vx: (r() - 0.5) * 14 * px, vy: -(4 + r() * 8) * px, life: 0.7, decay: 1.6, g: 30, col: r() < 0.5 ? [255, 240, 200] : TOK.amber, s: 1 });
      }
    },
    // an empty lot (layer switched off, or not built yet): a slab, a fence, a blinking amber lamp
    drawLot(g, p, s, now) {
      const px = this.px, hw = Math.max(5 * px, Math.round(Math.min(s.l, s.r) / px) * px);
      g.fillStyle = rgb(TOK.wall, 1.8); g.fillRect(-hw, -2 * px, 2 * hw, 2 * px); // the foundation slab
      g.fillStyle = rgb(p.col, 0.5, 0.9); for (let x = -hw; x <= hw; x += 2 * px) g.fillRect(x, -5 * px, Math.max(1, px >> 1), 3 * px); // fence posts
      for (let x = -hw, i = 0; x < hw; x += px, i++) { g.fillStyle = i % 2 ? rgb(TOK.amber, 0.9) : '#120a08'; g.fillRect(x, -5 * px, px, px); } // a hazard board
      g.fillStyle = rgb(p.col, 0.35, 0.9); for (let y = 3; y < 9; y += 2) g.fillRect(-px, -(5 + y) * px, 2 * px, Math.max(1, px >> 1)); // the starter of a crane mast
      if (this.reduced || Math.floor(this.st * 2) % 2) { g.fillStyle = rgb(TOK.amber, 1.2); g.fillRect(-hw, -6 * px, px, px); g.fillRect(hw - px, -6 * px, px, px); }
    },

    // ---- one frame (called by AMB.visual.draw while the mode is « Jardin ») ----
    frame(g, W, H, dpr = 1) {
      if (!this.running()) { this.lastT = null; return false; }
      const t0 = this.now();
      if (this.sig == null || this.W !== W || this.H !== H || t0 - (this.lastCheck || 0) > 1000) this.refresh(W, H, this.W !== W || this.H !== H);
      const dt = this.lastT == null ? 1 / 60 : Math.max(0, Math.min(0.1, (t0 - this.lastT) / 1000));
      this.lastT = t0; this.t = (this.t || 0) + dt; this.dt = dt; this.dpr = dpr;
      const now = this.clock();
      this.watch(); this.updateScene(dt); this.updateLook(dt);
      if (!this.reduced) this.st += dt * this.speed; // the scene's time: the tempo is its speed, still in reduced motion
      for (let i = this.pending.length - 1; i >= 0; i--) { const e = this.pending[i]; if (e.time <= now + 0.02) { this.pending.splice(i, 1); this.hit(e.layer, e.vel); } }
      const ans = this.answer(now);
      if (ans) this.lightAnswer(ans);
      for (let i = this.skyQ.length - 1; i >= 0; i--) { const e = this.skyQ[i]; if (e.time <= now + 0.02) { this.skyQ.splice(i, 1); this.setSky(e.key); } }
      const R = this.replay;
      if (R) for (; R.i < R.ev.length && R.ev[R.i].t <= now - R.t0; R.i++) {
        const e = R.ev[R.i];
        if (e.layer === 'chord') this.setSky(this.chordKey(e.deg)); else if (this.hit(e.layer, e.vel == null ? 0.7 : e.vel)) this.lit[e.layer] = 1;
      }
      for (const p of this.plants) { const kk = this.kicks[p.id]; p.hot = kk ? Math.max(0, 1 - (this.t - kk.last) / 0.6) : 0; if (kk && this.t - kk.t0 > 0.9 && !p.hot) delete this.kicks[p.id]; }
      this.updateBuildings(now);
      // a forced chord or a loud note shakes the camera (offset ox, oy on every layer)
      let ox = 0, oy = 0; const sh = this.shake;
      if (sh) { const age = this.t - sh.t0; if (age > 0.4 || this.reduced) this.shake = null; else { const A = sh.amp * this.px * 2.5 * Math.exp(-age * 11); ox = Math.round(A * Math.sin(age * 95)); oy = Math.round(A * 0.7 * Math.cos(age * 71)); } }
      this.ox = ox; this.oy = oy;
      const world = this.updateWorld(dt, now), cam = this.camera(W, H);
      this.place(cam, now); this.now_ = now; this.ans = ans;
      for (const L of STACK) {
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = false;
        L.draw(g, world, cam, this);
      }
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = true;
      for (const id in this.zap) this.zap[id] = Math.max(0, this.zap[id] - dt * 3.5);
      if (this.band) for (const id in this.band) { this.band[id].a -= dt * 3; if (this.band[id].a <= 0) delete this.band[id]; }
      for (const id in this.energy) this.energy[id] = Math.max(0, this.energy[id] - dt * (this.reduced ? 1.2 : 1.6));
      for (const id in this.lit) this.lit[id] = Math.max(0, this.lit[id] - dt * 0.35);
      const ms = this.now() - t0;
      this.times.push(ms); if (this.times.length > 240) this.times.shift();
      this.frames++;
      if (this.hooks.length) { const info = { W, H, dpr, dt, ms, reduced: this.reduced, juice: this.JUICE }; for (const f of this.hooks.slice()) { try { f(g.canvas, world, info); } catch (e) { if (!this.hookErr) { this.hookErr = 1; console.error(e); } } } }
      return true;
    },
    // ---- S4.2 « Réponse » on the Melody's building (its neon sign) ----
    LEAF_OK: [143, 227, 160], LEAF_BAD: [235, 84, 64],
    answer(now) { const P = AMB.puzzles; return !this.free && P && P.view && this.plants.some((qq) => qq.id === 'bells') ? P.view(now) : null; },
    lightAnswer(v) {
      const e = v.phase === 'call' ? (this.reduced ? 0.6 : 0.4 + 0.5 * Math.abs(Math.sin((this.t || 0) * 7)))
        : v.phase === 'answer' ? 0.6 : Math.max(0, 0.5 - v.age / 6);
      this.energy.bells = Math.max(this.energy.bells || 0, e);
    },
    // one lamp per note of the phrase, on brackets up the sign's pole, alternately left and right: dim = to play, green =
    // right, red = wrong. They keep a readable size (≥ 4 CSS px a cell) even on a small sign: the pole then reaches up.
    drawAnswer(g, v) {
      const p = this.plants.find((qq) => qq.id === 'bells'); if (!p) return 0;
      const gy = p.gy == null ? 1 : p.gy; if (gy < 0.05) return 0; // a sign still being built carries its lamps up
      const lp = Math.max(this.px, Math.round(4 * (this.dpr || 1))), gap = lp >= 4 ? 1 : 0, k = p.k || 1;
      // in screen pixels (crisp lamps at any camera scale)
      const h = this.sprite(p, this.px).h * gy * k, room = Math.max(h, p.sy - (this.H || 0) * this.ceilAt(p.sx, 0) - 3 * lp);
      const y0 = Math.max(h * 0.2, 2 * lp), top = Math.min(room, Math.max(h * 0.88, y0 + (v.len - 1) * 2.4 * lp));
      g.setTransform(1, 0, 0, 1, Math.round(p.sx), Math.round(p.sy));
      if (top > h * 0.9) { g.fillStyle = rgb(p.col, 0.7, 0.6); g.fillRect(-Math.floor(lp / 4), -Math.round(top), Math.max(1, Math.round(lp / 2)), Math.round(top - h * 0.85)); }
      let n = 0;
      for (let i = 0; i < v.len; i++) {
        const peg = v.row[i]; if (!peg && v.phase === 'call') continue;
        const y = -Math.round(y0 + (top - y0) * (v.len > 1 ? i / (v.len - 1) : 0.5)), s = i % 2 ? 1 : -1;
        g.fillStyle = !peg ? rgb(p.col, 0.8, 0.5) : rgb(peg.state === 'ok' ? this.LEAF_OK : this.LEAF_BAD);
        for (const [dx, dy] of [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [3, -1], [4, -1], [5, -1], [3, -2], [4, -2], [5, -2]]) g.fillRect(s * dx * lp - (s < 0 ? lp : 0), y + dy * lp, lp - gap, lp - gap);
        n++;
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      return n;
    },
    // S5.3: the Réponse tier reached (puzzles.mark()), as LED marks under the Melody's caption
    drawMark(g, fs) {
      const P = AMB.puzzles, n = this.free ? 0 : Math.min(9, P && P.mark ? P.mark() : 0), p = n && this.plants.find((qq) => qq.id === 'bells');
      if (!p) return 0;
      const lp = Math.max(2, Math.round(fs * 0.3)), y = Math.round((p.sy != null ? p.sy : p.y) + this.px * 1.5 + fs * 1.15), x0 = Math.round((p.sx != null ? p.sx : p.x) - (n * lp * 1.6) / 2);
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = rgb(p.col);
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
      bus.on('live', (n) => this.onSplash('live', n));
      bus.on('liveOff', (n) => n && this.release(n.id, n.time));
      bus.on('panic', () => this.release(null));
      bus.on('chord', (c) => {
        if (!c) return; this.onEvent('drone', c.time, 0.6); this.onEvent('pad', c.time, 0.3); this.onSplash('chord', c);
        if (this.running() && !this.replay) { this.skyQ.push({ time: c.time || 0, key: this.chordKey(c.deg) }); if (this.skyQ.length > 8) this.skyQ.shift(); }
      });
      for (const n in SCENE) if (SCENE[n].ev) bus.on(SCENE[n].ev, () => { if (this.running()) this.kick[n] = 1; });
      bus.on('game:puzzle', (e) => { if (e && e.peg && e.peg.state === 'ok') this.onEvent('bells', 0, 0.9); });
      ['game:unlock', 'game:reset', 'game:discovery'].forEach((ev) => bus.on(ev, () => { this.sig = null; }));
    },
  };

  // ======================================================================================================================
  // THE CORE LAYERS, back to front. Each draws with the world and the camera only (+ gv's caches and helpers).
  // sky (z 0): the chord's sky cross-fading, the dawn and its sun, the hue flash, aurora, searchlights, clouds, the song
  addLayer({ id: 'sky', z: 0, draw(g, w, cam, v) {
    const W = cam.W, H = cam.H, gd = cam.gd, px = cam.px, T = v.st, red = v.reduced, sf = Math.min(1, ((v.t || 0) - v.skyT) / SKY_FADE), dawn = w.dawn;
    g.fillStyle = hex(TOK.night); g.fillRect(0, 0, W, H);
    g.setTransform(1, 0, 0, 1, cam.ox, cam.oy);
    const sh = Math.max(gd, H * 0.2) + 4 * px; // the sky reaches under the street's edge (the camera may pull back)
    if (sf < 1) g.drawImage(v.sky(v.skyPrevKey || 'night', W, gd), 0, 0, W, sh);
    g.globalAlpha = sf; g.drawImage(v.sky(v.skyKey || 'night', W, gd), 0, 0, W, sh);
    if (dawn > 0) {
      g.globalAlpha = dawn * 0.95; g.drawImage(v.sky('dawn', W, gd), 0, 0, W, sh);
      const Rs = Math.max(8, Math.round(Math.min(gd * 0.26, W * 0.22))), sy0 = Math.round(gd + Rs * 0.7 - dawn * Rs * 1.15), gl = v.glow([255, 120, 150], 2 * Rs);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = dawn; g.drawImage(gl, Math.round(W / 2 - 2 * Rs), sy0 - 2 * Rs); g.globalCompositeOperation = 'source-over';
      g.drawImage(v.sun(Rs), Math.round(W / 2 - Rs), sy0 - Rs);
    }
    g.globalAlpha = 1;
    let a;
    if ((a = v.kick.hue || 0) > 0.02) { g.fillStyle = `rgba(255,200,245,${(0.16 * a).toFixed(3)})`; g.fillRect(0, 0, W, gd); }
    g.globalCompositeOperation = 'lighter';
    if ((a = v.amt('aurora')) > 0.03) {
      const cv = v.fx('aurora', W, gd, (ww, h) => {
        const c = v.canvas(ww / 4, h * 0.55 / 4), x = c.getContext('2d');
        for (let i = 0; i < c.width; i++) for (let r = 0; r < 2; r++) {
          const y = c.height * (0.35 + 0.22 * Math.sin(i * 0.035 + r * 2.1) + 0.08 * Math.sin(i * 0.11 + r)), hgt = c.height * (0.25 + 0.15 * Math.sin(i * 0.05 + r * 3));
          const grd = x.createLinearGradient(0, y - hgt, 0, y + 4); grd.addColorStop(0, 'rgba(63,240,255,0)'); grd.addColorStop(0.8, r ? 'rgba(255,63,164,0.45)' : 'rgba(63,240,255,0.45)'); grd.addColorStop(1, 'rgba(63,240,255,0)');
          x.fillStyle = grd; x.fillRect(i, y - hgt, 1, hgt + 4);
        }
        return c;
      });
      const dx = red ? 0 : Math.sin(T * 0.25) * W * 0.06;
      g.imageSmoothingEnabled = true; g.globalAlpha = Math.min(1, 0.15 + 0.85 * a);
      g.drawImage(cv, dx - W * 0.06, gd * 0.04, W * 1.12, gd * 0.55); g.imageSmoothingEnabled = false;
    }
    if ((a = v.amt('rays')) > 0.03) { // searchlights sweeping the sky from the city (Blade Runner)
      const bh = Math.round(gd * 1.1), cv = v.fx('beam', W, gd, () => {
        const c = v.canvas(64, 128), x = c.getContext('2d'), grd = x.createLinearGradient(0, 128, 0, 0);
        grd.addColorStop(0, 'rgba(210,235,255,0.55)'); grd.addColorStop(1, 'rgba(210,235,255,0)');
        x.fillStyle = grd; x.beginPath(); x.moveTo(30, 128); x.lineTo(34, 128); x.lineTo(64, 0); x.lineTo(0, 0); x.closePath(); x.fill();
        return c;
      });
      const n = 2 + Math.round(a * 3), bw = Math.round(W * 0.09);
      g.imageSmoothingEnabled = true;
      for (let i = 0; i < n; i++) {
        const bx = cam.x(0.6, W * (0.12 + 0.76 * ((i * 0.618 + 0.2) % 1))), an = (red ? 0.25 : Math.sin(T * (0.25 + 0.07 * i) + i * 2.1)) * 0.5, c = Math.cos(an), sn = Math.sin(an);
        g.setTransform(c, sn, -sn, c, bx, gd * 0.92 + cam.oy); g.globalAlpha = Math.min(1, 0.5 * a);
        g.drawImage(cv, -bw / 2, -bh, bw, bh);
      }
      g.setTransform(1, 0, 0, 1, cam.ox, cam.oy); g.imageSmoothingEnabled = false;
    }
    g.globalCompositeOperation = 'source-over';
    if ((a = v.amt('clouds')) > 0.03) { // pixel clouds drifting across the sky (Dérive), faster in the wind
      const cv = v.fx('cloud', W, gd, (ww, h, px2) => {
        const c = v.canvas(48 * px2, 12 * px2), x = c.getContext('2d'), r = mulberry(5);
        for (let j = 0; j < 12; j++) for (let i = 0; i < 48; i++) { const d = ((i - 24) / 24) ** 2 + ((j - 8) / (j < 8 ? 7 : 4)) ** 2 + 0.25 * Math.sin(i * 0.7) * (j < 6 ? 1 : 0); if (d < 1 && r() < 0.92) { x.fillStyle = j < 5 ? 'rgba(70,40,100,0.9)' : j < 9 ? 'rgba(120,50,130,0.88)' : 'rgba(190,70,160,0.85)'; x.fillRect(i * px2, j * px2, px2 - 1, px2 - 1); } }
        return c;
      });
      const r = mulberry(17), n = Math.max(1, Math.round(a * 6)), span = W + cv.width, wind = 0.5 + 1.5 * (w.weather.wind || 0);
      for (let i = 0; i < n; i++) {
        const x0 = r() * span, y = gd * (0.08 + 0.4 * r()), sc = 0.6 + 0.6 * r(), vv = (6 + 10 * r()) * px * (0.3 + a) * wind;
        const x = ((x0 + T * vv) % span + span) % span - cv.width;
        g.globalAlpha = Math.min(1, 0.12 + 0.4 * a); g.drawImage(cv, Math.round(x), Math.round(y), Math.round(cv.width * sc), Math.round(cv.height * sc));
      }
    }
    if ((a = v.sc.song || 0) > 0.01) { g.globalAlpha = 0.7; g.fillStyle = hex(TOK.cyan); g.fillRect(0, 0, Math.round(W * a), Math.max(2, px)); }
    if ((a = v.kick.song || 0) > 0.02 && !red) { const x = (1 - a) * W * 1.2 - W * 0.1; g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 * a; g.fillStyle = '#ffb0ec'; g.fillRect(Math.round(x), 0, Math.round(W * 0.08), gd); }
  } });
  // stars (z 10): a still field of faint stars (gone at dawn), the twinkling ones of the slow movements
  addLayer({ id: 'stars', z: 10, draw(g, w, cam, v) {
    const W = cam.W, gd = cam.gd, px = cam.px, T = v.st, red = v.reduced, s = Math.max(1, px - 1), r = mulberry(7), fade = 1 - w.dawn;
    if (fade < 0.02) return;
    g.setTransform(1, 0, 0, 1, cam.ox + cam.pan * W * 0.1, cam.oy);
    const n0 = Math.round(30 + W / px / 6);
    for (let i = 0; i < n0; i++) { g.globalAlpha = fade * (0.06 + r() * 0.16); g.fillStyle = '#dcc8ff'; g.fillRect(Math.floor(r() * W / px) * px, Math.floor(r() * gd * 0.55 / px) * px, s, s); }
    const a = v.amt('twinkle'); if (a < 0.03) { g.globalAlpha = 1; return; }
    g.globalCompositeOperation = 'lighter';
    const r2 = mulberry(31), n = Math.round(8 + 40 * a);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(r2() * W / px) * px, y = Math.floor(r2() * gd * 0.8 / px) * px, ph = r2() * 6.283;
      g.globalAlpha = fade * Math.min(1, (0.25 + 0.75 * a) * (red ? 0.7 : 0.5 + 0.5 * Math.sin(T * (1.5 + 5 * a) + ph)));
      g.fillStyle = i % 5 ? '#f4e6ff' : i % 2 ? '#ff5468' : '#bff6ff'; g.fillRect(x, y, s, s);
      if (a > 0.5 && i % 7 === 0) { g.fillRect(x - px, y, s, s); g.fillRect(x + px, y, s, s); g.fillRect(x, y - px, s, s); g.fillRect(x, y + px, s, s); }
    }
  } });
  // far city (z 20): the skyline behind the street, its windows lit by the population (all at dawn), the fog in front of it
  addLayer({ id: 'far', z: 20, draw(g, w, cam, v) {
    const W = cam.W, gd = cam.gd, bg = v.farCity(W, gd), d = 0.35 * (0.5 + w.cam.depth);
    const k = Math.max(w.dawn, (0.03 + 0.97 * w.population) * (0.4 + 0.6 * w.power)), sk = v.skyline(k);
    const kk = cam.k(0.35), x = cam.x(d, (W - bg.FW) / 2), y = cam.y(0.35, gd - bg.bandH);
    g.drawImage(sk, Math.round(x), Math.round(y), Math.round(bg.FW * kk), Math.round(bg.bandH * kk));
    const fog = w.cam.fog; // the haze of the horizon: the far city sinks into it
    if (fog > 0.02) {
      const fv = v.fx('farfog', W, gd, () => { const c = v.canvas(4, 64), x2 = c.getContext('2d'), grd = x2.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, 'rgba(120,50,140,0)'); grd.addColorStop(0.7, 'rgba(150,60,150,0.55)'); grd.addColorStop(1, 'rgba(170,70,150,0.7)'); x2.fillStyle = grd; x2.fillRect(0, 0, 4, 64); return c; });
      g.imageSmoothingEnabled = true; g.globalAlpha = Math.min(1, fog); g.drawImage(fv, 0, Math.round(gd - bg.bandH * 1.2 + cam.oy), W, Math.round(bg.bandH * 1.25)); g.imageSmoothingEnabled = false;
    }
  } });
  // street (z 30): the wet asphalt, the kerb flashing on the beat, the ground ripple, the buildings reflected
  addLayer({ id: 'street', z: 30, draw(g, w, cam, v) {
    const W = cam.W, H = cam.H, gd = cam.gd, px = cam.px, T = v.st, red = v.reduced, R = v.replay;
    const st = v.street(W, H, gd), k = cam.set(g, 1);
    g.drawImage(st, Math.round((W - st.width) / 2), gd);
    g.setTransform(1, 0, 0, 1, 0, 0);
    // reflections: each building upside down under its foot, faded by distance (cached overlay with rain streaks)
    for (const p of v.plants) {
      if (!p.vis) continue;
      const s = v.sprite(p, px), on = p.look ? 0.3 + 0.7 * p.look.on : 1, rk = p.k;
      g.globalAlpha = 0.4 * on * (R ? 0.3 + 0.7 * Math.min(1, v.lit[p.id] || 0) : 1) * (0.5 + 0.5 * w.power);
      g.setTransform(rk, 0, 0, -rk * 0.62, p.sx, p.sy + px * rk); g.drawImage(s.cv, 0, s.h - p.vis, s.w, p.vis, -s.w / 2, -p.vis, s.w, p.vis);
    }
    g.setTransform(1, 0, 0, 1, cam.ox, cam.oy); g.globalAlpha = 1;
    const sgd = cam.y(1, gd) - cam.oy, wet = v.fx('wet', W, H - gd, (ww, h, px2) => {
      const c = v.canvas(ww, Math.max(1, h)), x = c.getContext('2d'), grd = x.createLinearGradient(0, 0, 0, Math.max(1, h));
      grd.addColorStop(0, rgb(TOK.ground, 1, 0.05)); grd.addColorStop(0.6, rgb(TOK.ground, 1, 0.6)); grd.addColorStop(1, rgb(TOK.ground, 1, 0.95));
      x.fillStyle = grd; x.fillRect(0, 0, ww, h); x.fillStyle = rgb(TOK.ground, 1, 0.55);
      for (let y = px2; y < h; y += 2 * px2) x.fillRect(0, y, ww, Math.max(1, px2 >> 1));
      return c;
    });
    g.drawImage(wet, 0, Math.round(sgd), W, Math.round(H - sgd + 2 * px));
    // the kerb flashes on the beat (stronger on beats 1 and 3); the dawn warms the street
    g.globalCompositeOperation = 'lighter';
    if (w.dawn > 0) { g.fillStyle = `rgba(255,122,79,${(w.dawn * 0.12).toFixed(3)})`; g.fillRect(0, sgd, W, H - sgd); }
    const bp = red || R ? null : w.beat.on ? w.beat : null;
    if (!bp && (red || R)) v.pulse = 0; // (v.pulse: the street's beat, read by the tests)
    if (bp) { const a = (bp.strong ? 0.3 : 0.16) * Math.exp(-bp.ph * 5); v.pulse = a; g.fillStyle = rgb(TOK.pink, 1, Math.min(1, a * 2.2)); g.fillRect(0, sgd, W, Math.max(2, px)); g.fillStyle = rgb(TOK.pink, 1, a * 0.16); g.fillRect(0, sgd, W, H - sgd); }
    const a = v.amt('ripple'); // the ground ondulates (rhythm feel): two wavy lines of light along its edge
    if (a >= 0.03) {
      const A = px * (0.5 + 3 * a), stp = px * 2, s = Math.max(1, px >> 1);
      for (let j = 0; j < 2; j++) {
        g.fillStyle = `rgba(63,240,255,${((0.12 + 0.3 * a) / (j + 1)).toFixed(3)})`;
        const y0 = sgd + px * (2 + 5 * j), f = 0.012 + 0.01 * j;
        for (let x = 0; x < W; x += stp) g.fillRect(x, Math.round(y0 + Math.sin(x * f + T * (2.5 + j)) * A), stp - 1, s);
      }
    }
    void k;
  } });
  // towers (z 40): the back row, then the front row, then the discoveries; each with its halo and its echo ghosts
  addLayer({ id: 'towers', z: 40, draw(g, w, cam, v) {
    const px = cam.px, now = v.now_, R = v.replay;
    const order = v.plants.slice().sort((a, b) => b.row - a.row);
    for (const p of order) {
      const a = p.look;
      if (a && a.halo > 0.03 && p.vis > px) { // S4.6 halo (Espace): a soft aura, radius in 8 cached steps
        const Rg = Math.round(px * p.k * (8 + 18 * Math.round(a.halo * 7) / 7)), gl = v.glow(p.col, Rg);
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, (0.12 + 0.6 * a.halo) * (0.4 + 0.6 * w.power) * (R ? 0.3 + 0.7 * Math.min(1, v.lit[p.id] || 0) : 1));
        g.drawImage(gl, p.sx - Rg, p.sy - p.vis * p.k * 0.6 - Rg);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      }
      const e = v.amt('echo');
      if (e >= 0.1 && !R && p.vis > px) { // S5.8 Écho: faded copies of the building trailing to its right
        const s = v.sprite(p, px), n = 1 + Math.round(e * 2), d = px * (3 + 7 * e) * p.k;
        for (let i = n; i >= 1; i--) { g.globalAlpha = Math.min(1, (0.08 + 0.3 * e) / i); g.setTransform(p.k, 0, 0, p.k, p.sx + i * d, p.sy); g.drawImage(s.cv, 0, s.h - p.vis, s.w, p.vis, -s.w / 2, -p.vis, s.w, p.vis); }
        g.globalAlpha = 1;
      }
      v.drawBuilding(g, p, now, false);
      // the light of its notes over its roof
      const en = v.energy[p.id] || 0;
      if (en > 0.02 && p.vis) { const Rg = Math.max(16, px * 12 * p.k), gl = v.glow(p.col, Rg); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, en); g.drawImage(gl, p.sx - Rg, p.sy - p.vis * p.k * 0.85 - Rg); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    }
    for (const p of v.rares) { // the discoveries: holograms on the street, breathing
      const s = v.sprite(p, px), e = v.reduced ? 0.35 : 0.25 + 0.25 * Math.sin(v.t * 1.3 + p.phase);
      g.setTransform(p.k, 0, 0, p.k, p.sx, p.sy); g.drawImage(s.cv, -s.w / 2, -s.h);
      const Rg = Math.max(16, px * 8), gl = v.glow(p.col, Rg); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = e; g.drawImage(gl, p.sx - Rg, p.sy - s.h * p.k * 0.6 - Rg); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
  } });
  // sparks (z 45): the notes' rings and glows, the particles (notes, welding, dust)
  addLayer({ id: 'sparks', z: 45, draw(g, w, cam, v) {
    const px = cam.px, dt = v.dt || 0;
    g.globalCompositeOperation = 'lighter';
    v.drawSplash(g, v.now_);
    for (let i = v.parts.length - 1; i >= 0; i--) {
      const qq = v.parts[i];
      qq.life -= dt * (qq.decay || 0.8); qq.x += qq.vx * dt; qq.y += qq.vy * dt; qq.vx *= 0.98; qq.vy += (qq.g == null ? 2 : qq.g) * px * dt;
      if (qq.life <= 0) { v.parts.splice(i, 1); continue; }
      g.fillStyle = rgb(qq.col, 1, qq.life * 0.9);
      g.fillRect(Math.round(qq.x / px) * px, Math.round(qq.y / px) * px, px * qq.s - 1, px * qq.s - 1);
    }
  } });
  // traffic (z 50): S8.6 moved it to js/city-life.js (flying cars in lanes, zeppelin, light-cycles, people, holograms)
  // weather (z 60): rain (how much, slanted by the wind; it stops at dawn), splashes on the street, lightning
  addLayer({ id: 'weather', z: 60, draw(g, w, cam, v) { v.drawRain(g, cam, w); } });
  // front (z 70): street lamps near the camera (the strongest parallax), then the scene.s front layers: drones,
  // snow, frost, lens
  addLayer({ id: 'front', z: 70, draw(g, w, cam, v) {
    const W = cam.W, H = cam.H, gd = cam.gd, px = cam.px, T = v.st, red = v.reduced, s = Math.max(1, px - 1);
    { // two street lamps, near: dark poles, a sodium glow
      const d = 1.35, ys = cam.y(d, gd + (H - gd) * 0.35), k = cam.k(d), hgt = Math.min(H * 0.55, (ys - H * 0.08)), xs = W < H ? [0.06] : [0.04, 0.96];
      for (const xf of xs) {
        const x = Math.round(cam.x(d, W * xf)), lw = Math.max(2, Math.round(1.6 * px * k)), arm = Math.round(6 * px * k) * (xf < 0.5 ? 1 : -1);
        g.fillStyle = '#05030a'; g.fillRect(x, Math.round(ys - hgt), lw, Math.round(hgt)); g.fillRect(Math.min(x, x + arm), Math.round(ys - hgt), Math.abs(arm) + lw, lw);
        const gl = v.glow([255, 170, 90], Math.round(14 * px * k)); g.globalCompositeOperation = 'lighter'; g.globalAlpha = w.lamps != null ? clamp(w.lamps) : 0.5 + 0.3 * w.power; // S8.4 hook: lamps (dead in a blackout)
        g.drawImage(gl, x + arm - gl.width / 2, Math.round(ys - hgt) - gl.height / 2 + lw); g.fillStyle = '#ffd9a0'; g.fillRect(x + arm - lw, Math.round(ys - hgt + lw), 2 * lw, lw);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      }
    }
    g.setTransform(1, 0, 0, 1, cam.ox, cam.oy);
    let a;
    g.globalCompositeOperation = 'lighter';
    if ((a = v.amt('fireflies')) > 0.03) { // drones blinking between the towers
      const r = mulberry(23), n = Math.round(4 + 26 * a);
      for (let i = 0; i < n; i++) {
        const bx = r() * W, by = gd - (0.08 + 0.5 * r()) * gd * 0.7, ph = r() * 6.283, f = 0.3 + r() * 0.5;
        const x = bx + (red ? 0 : Math.sin(T * f + ph) * 14 * px), y = by + (red ? 0 : Math.cos(T * f * 1.3 + ph) * 6 * px);
        g.globalAlpha = Math.min(1, (0.3 + 0.7 * a) * (red ? 0.8 : 0.5 + 0.5 * Math.sin(T * 3 * f + ph * 2)));
        g.fillStyle = i % 3 ? '#ff5468' : '#e8f6ff'; g.fillRect(Math.round(x / px) * px, Math.round(y / px) * px, s, s);
        g.globalAlpha *= 0.35; g.fillRect(Math.round(x / px) * px - px, Math.round(y / px) * px - px, 3 * px - 1, 3 * px - 1);
      }
    }
    g.globalCompositeOperation = 'source-over';
    if ((a = v.amt('snow')) > 0.03) {
      const r = mulberry(41), n = Math.round(6 + 64 * a); g.fillStyle = '#bff6ff';
      for (let i = 0; i < n; i++) {
        const x0 = r() * W, y0 = r() * H, vv = (8 + 14 * r()) * px, ph = r() * 6.283;
        const y = ((y0 + T * vv) % H + H) % H, x = x0 + (red ? 0 : Math.sin(T * 0.8 + ph) * 3 * px);
        g.globalAlpha = Math.min(1, 0.3 + 0.6 * a); g.fillRect(Math.round(x / px) * px, Math.round(y / px) * px, s, s);
      }
    }
    if ((a = v.amt('frost')) > 0.03) {
      const cv = v.fx('frost', W, H, (ww, h, px2) => {
        const c = v.canvas(ww, h), x = c.getContext('2d'), r = mulberry(53), qq = px2 * 2;
        x.fillStyle = 'rgba(200,235,255,0.85)';
        for (let k = 0; k < 40; k++) {
          const side = k % 4; let cx = side === 1 ? ww : side === 3 ? 0 : r() * ww, cy = side === 0 ? 0 : side === 2 ? h : r() * h;
          let dx = side === 1 ? -1 : side === 3 ? 1 : (r() - 0.5), dy = side === 0 ? 1 : side === 2 ? -1 : (r() - 0.5);
          for (let i = 0, L = 6 + r() * 16; i < L; i++) { x.fillRect(Math.round(cx / qq) * qq, Math.round(cy / qq) * qq, qq - 1, qq - 1); cx += dx * qq; cy += dy * qq; if (r() < 0.3) dx += (r() - 0.5); if (r() < 0.3) dy += (r() - 0.5); }
        }
        return c;
      });
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = Math.min(1, 0.85 * a); g.drawImage(cv, 0, 0);
    }
    if ((a = v.amt('lens')) > 0.03) {
      const cv = v.fx('lens', W, H, (ww, h, px2) => {
        const c = v.canvas(ww, h), x = c.getContext('2d'), qq = px2 * 12;
        x.fillStyle = 'rgba(63,240,255,0.45)';
        for (let X = 0; X < ww; X += qq) for (let Y = 0; Y < h; Y += px2 * 3) x.fillRect(X, Y, Math.max(1, px2 >> 1), Math.max(1, px2 >> 1));
        for (let Y = 0; Y < h; Y += qq) for (let X = 0; X < ww; X += px2 * 3) x.fillRect(X, Y, Math.max(1, px2 >> 1), Math.max(1, px2 >> 1));
        return c;
      });
      const sv = v.sc.lens || 0, k = v.kick.lens || 0;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = Math.min(1, 0.5 * Math.min(1, 2 * sv) + 0.4 * k); g.drawImage(cv, 0, 0);
      const staff = Math.max(0, 2 * sv - 1); // Composer: the five lines of a staff across the sky
      if (staff > 0.02) { g.globalAlpha = Math.min(1, 0.35 * staff + 0.3 * k); g.fillStyle = '#ff9ee0'; for (let i = 0; i < 5; i++) g.fillRect(0, Math.round(gd * 0.18 + i * px * 4), W, Math.max(1, px >> 1)); }
    }
  } });
  // post (z 80): full-screen filters: grain and vignette (Usure, without WebGL), the veil when
  // stopped, a flash when it starts, the lightning, the CRT band
  addLayer({ id: 'post', z: 80, draw(g, w, cam, v) {
    const W = cam.W, H = cam.H, px = cam.px, T = v.st, red = v.reduced;
    let a;
    if (v.post2d !== false && (a = v.amt('grain')) > 0.03) { // (with WebGL, its own grain: S8.4 drives it from Nostalgie)
      const nw = Math.ceil(W / (2 * px)), nh = Math.ceil(H / (2 * px)), f = red ? 0 : Math.floor(T * 14) % 4;
      const cv = v.fx('grain' + f, W, H, () => {
        const c = v.canvas(nw, nh), x = c.getContext('2d'), d = x.createImageData(nw, nh), r = mulberry(70 + f);
        for (let i = 0; i < d.data.length; i += 4) { const vv = r(), on = vv < 0.18, l = vv < 0.09 ? 255 : 0; d.data[i] = d.data[i + 1] = d.data[i + 2] = l; d.data[i + 3] = on ? 90 : 0; }
        x.putImageData(d, 0, 0); return c;
      });
      g.globalAlpha = Math.min(1, 0.15 + 0.85 * a); g.drawImage(cv, 0, 0, W, H);
      g.imageSmoothingEnabled = true; g.globalAlpha = Math.min(1, 0.75 * a); g.drawImage(v.vignette(W, H), 0, 0, W, H); g.imageSmoothingEnabled = false;
    }
    const pl = v.sc.play == null ? 1 : v.sc.play, pk = v.kick.play || 0;
    if (pl < 0.98) { g.globalAlpha = 1; g.fillStyle = `rgba(4,2,10,${(0.3 * (1 - pl)).toFixed(3)})`; g.fillRect(0, 0, W, H); }
    if (pk > 0.02) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1; g.fillStyle = `rgba(255,80,200,${(0.05 * pk).toFixed(3)})`; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
    const fl = w.pulse.flash; // lightning: the whole sky white-violet, a bolt down to the city
    if (fl > 0.02 && !red) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, fl * 0.45); g.fillStyle = '#c8b8ff'; g.fillRect(0, 0, W, cam.gd);
      const b = v.bolt; if (b && fl > 0.25) { const r = mulberry(b.seed + 1); let x = b.x * W, y = 0; g.globalAlpha = Math.min(1, fl * 1.4); g.fillStyle = '#f4f0ff'; while (y < cam.gd * 0.8) { const ny = y + px * (3 + r() * 5), nx = x + (r() - 0.5) * px * 10; for (let i = 0; i < 6; i++) g.fillRect(Math.round((x + (nx - x) * i / 6) / px) * px, Math.round((y + (ny - y) * i / 6) / px) * px, px, px); x = nx; y = ny; } }
      g.globalCompositeOperation = 'source-over';
    }
    if (v.post2d !== false) v.drawCrt(g, W, H);
    g.globalAlpha = 1;
  } });
  // scene HUD (z 90): the captions under the buildings (above the roofs of the back row), the Réponse lamps, the tier
  // marks, the line that says what to do when the city is empty
  addLayer({ id: 'hud', z: 90, draw(g, w, cam, v) {
    const px = cam.px, fs = Math.round(Math.max(11 * (v.dpr || 1), px * 2.6));
    for (const p of v.plants) {
      const lb = v.label(p, fs, Math.min(v.slotW * 0.96, 2 * Math.min(p.roomL, p.roomR) - 2) * (p.row ? 1.4 : 1)), hot = p.hot || 0, off = p.look ? 1 - p.look.on : 0;
      const y = p.row ? Math.round(p.sy - Math.max(p.vis, 6 * px) * p.k - lb.height - px) : Math.round(p.sy + px * 1.5);
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = Math.min(1, 0.85 + 0.15 * hot) * (1 - 0.5 * off) * (p.row ? 0.8 : 1); g.drawImage(lb, Math.round(p.sx - lb.width / 2), y);
      if (hot > 0.02) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = hot; g.drawImage(lb, Math.round(p.sx - lb.width / 2), y); g.globalCompositeOperation = 'source-over'; }
    }
    g.globalAlpha = 1;
    if (v.ans) v.drawAnswer(g, v.ans);
    v.drawMark(g, fs);
    if (!v.plants.length && !v.rares.length) { g.setTransform(1, 0, 0, 1, 0, 0); g.font = `${Math.round(fs * 1.3)}px VT323, monospace`; g.fillStyle = hex(TOK.pink); g.textAlign = 'center'; g.shadowColor = hex(TOK.pink); g.shadowBlur = fs * 0.6; g.fillText('Ouvre une couche pour rallumer la ville', cam.W / 2, cam.H * 0.42); g.shadowBlur = 0; g.textAlign = 'start'; }
  } });

  // rain: streaks drawn directly (far and near, slanted by the wind), falling with the scene's time; splashes on the
  // street; how many = weather.rain (it stops at dawn)
  gv.drawRain = function (g, cam, w) {
    const k = w.weather.rain; if (k < 0.02) return 0;
    const W = cam.W, H = cam.H, px = cam.px, T = this.st, key = W + 'x' + H + '|' + px;
    if (!this.rain || this.rain.key !== key) { // [x0, y0, length, speed] per streak, by colour
      const r = mulberry(131), n = Math.round(90 * Math.min(2.5, Math.max(0.6, W / (this.dpr || 1) / 1000))), by = [[], [], []];
      for (let i = 0; i < n; i++) { const z = r() < 0.6 ? 0.55 : 1, L = Math.round(px * (3 + 6 * z)); by[i % 13 === 0 ? 2 : z < 1 ? 0 : 1].push([r() * W, r() * H, L, H * (0.55 + 0.5 * z), r()]); }
      this.rain = { key, by, n, lw: Math.max(1, Math.round(px * 0.34)), cols: [rgb(TOK.rain, 1, 0.2), rgb(TOK.rain, 1, 0.34), rgb(TOK.pink, 1, 0.4)] };
    }
    const Rn = this.rain, lw = Rn.lw, slant = 0.06 + 0.5 * (w.weather.wind || 0), mx = cam.pan * W * 1.2;
    g.setTransform(1, 0, 0, 1, cam.ox, cam.oy);
    g.globalAlpha = Math.min(1, k * 1.2); g.lineWidth = lw; g.lineCap = 'butt';
    for (let c = 0; c < 3; c++) { // one path per colour: each streak a line, slanted by the wind
      g.strokeStyle = Rn.cols[c]; g.beginPath();
      for (const [x0, y0, L, vv, keep] of Rn.by[c]) {
        if (keep > k) continue; // lighter rain: fewer streaks
        const d = y0 + T * vv, y = (d % (H + L)) - L, x = ((x0 - d * slant + mx) % W + W) % W;
        g.moveTo(x, y); g.lineTo(x - L * slant, y + L);
      }
      g.stroke();
    }
    const qq = mulberry(Math.floor(T * 9)), gd = cam.y(1, cam.gd) - cam.oy, s = Math.max(1, px >> 1);
    g.fillStyle = Rn.cols[1]; g.globalAlpha = Math.min(1, k * 0.9);
    for (let i = 0, n = Math.round(14 * k); i < n; i++) g.fillRect(Math.round(qq() * W / px) * px, Math.round((gd + px * 2 + qq() * (H - gd - px * 3)) / px) * px, 2 * px, s);
    g.globalAlpha = 1;
    return Rn.n;
  };
  // S6.5 a discreet cathode-ray screen (strength = JUICE; off in reduced motion): scanlines and violet vignette are css
  // (body.city .stage::after, opacity --crt), the colour fringes are baked in the sprites; here only a faint band
  gv.drawCrt = function (g, W, H) {
    const k = this.crt(); if (!k) return 0;
    const bh = Math.round(H * 0.1), y = ((this.st * H * 0.08) % (H + 3 * bh)) - 2 * bh;
    g.globalCompositeOperation = 'lighter'; g.fillStyle = '#b8a0ff'; g.globalAlpha = Math.min(1, 0.03 * k); g.fillRect(0, Math.round(y), W, bh);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    return 1;
  };
  gv.vignette = function (W, H) {
    return this.fx('vignette', W, H, (w, h) => {
      const c = this.canvas(w / 4, h / 4), x = c.getContext('2d'), gg = x.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.3, c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.62);
      gg.addColorStop(0, 'rgba(12,0,24,0)'); gg.addColorStop(1, 'rgba(12,0,24,0.9)'); x.fillStyle = gg; x.fillRect(0, 0, c.width, c.height); return c;
    });
  };

  try {
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    gv.reduced = !!(mq && mq.matches);
    if (mq && mq.addEventListener) mq.addEventListener('change', () => { gv.reduced = mq.matches; gv.parts.length = 0; gv.shake = null; });
  } catch (e) {}
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.hidden) { gv.pending.length = 0; gv.skyQ.length = 0; gv.waves.length = 0; gv.lastT = null; } });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => gv.labels.clear());
  }
  AMB.gardenVisual = gv;

  // ---- « Jardin » as a mode of AMB.visual ----
  const V = AMB.visual;
  if (!V) return;
  const NAME = 'Jardin', FREE_KEY = 'ambient.vizMode';
  const onPath = () => !!(AMB.game && AMB.game.path);
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const pathPref = () => NAME; // the Parcours always shows the city
  const freePref = () => { const m = get(FREE_KEY); return m === NAME || V.MODES.includes(m) ? m : NAME; }; // the city by default
  const SHOWN = { [NAME]: 'Ville' }; // the mode keeps its id (stored preference), the chip says « Ville »
  const chip = () => { const el = typeof document !== 'undefined' && document.getElementById('vizMode'); if (el) el.textContent = SHOWN[V.mode] || V.mode; };
  const setFree = () => { const free = !onPath(); if (free !== gv.free) { gv.free = free; gv.sig = null; gv.waves.length = 0; gv.parts.length = 0; gv.built = {}; gv.grow = {}; } };
  const sync = () => { V.mode = onPath() ? pathPref() : freePref(); setFree(); chip(); };
  const baseDraw = V.draw;
  V.draw = function () {
    gv.active = this.mode === NAME;
    setFree();
    if (gv.active !== gv.shown && typeof document !== 'undefined' && document.body) { // the city's CRT (css), set by JUICE
      gv.shown = gv.active; document.body.classList.toggle('city', gv.active); document.body.style.setProperty('--crt', String(Math.min(1, gv.crt() / 1.5 + 0.1)));
    }
    if (gv.active && this.c) {
      gv.attach(this.c);
      gv.frame(this.g, this.c.width, this.c.height, this.dpr || 1);
      return;
    }
    return baseDraw.call(this);
  };
  V.cycleMode = function () {
    if (onPath()) { this.mode = NAME; Promise.resolve().then(chip); return this.mode; }
    const L = [NAME, ...this.MODES];
    this.mode = L[(L.indexOf(this.mode) + 1) % L.length];
    try { localStorage.setItem(FREE_KEY, this.mode); } catch (e) {}
    Promise.resolve().then(chip);
    return this.mode;
  };
  V.gardenSync = sync;
  V.mode = onPath() ? pathPref() : freePref();
  if (AMB.bus) { AMB.bus.on('game:mode', sync); gv.listen(AMB.bus); }
  if (typeof window !== 'undefined') window.addEventListener('load', () => setTimeout(chip, 0));
})();
