// « Jardin sonore » : the unlock tree, as data.
// A node unlocks parameters (`params`: exact keys, "section.*" or "*.suffix") and interface
// features (`ui`: names used as data-node on elements). `req`: all must be owned first.
// `gate`: a target puzzle that must be solved before the node can be bought.
// Param resolution: exact key > "*.suffix" > "section.*". Costs are balanced in G6.1.
(function () {
  const AMB = (window.AMB = window.AMB || {});

  const BRANCHES = {
    tronc: { name: 'Tronc', color: '#e8d9b0' },
    harmonie: { name: 'Harmonie', color: '#b58cff' },
    espace: { name: 'Espace', color: '#7fd6ff' },
    mouvement: { name: 'Mouvement', color: '#8fe3a0' },
    composer: { name: 'Composer', color: '#ffb36b' },
  };

  const N = (id, branch, name, cost, req, params, ui, desc, gate) => ({ id, branch, name, cost, req, params, ui, desc, gate: gate || null });
  const NODES = [
    // Tronc — the starting point and the tools to keep / share a sound
    N('racine', 'tronc', 'Graine', 0, [], ['drone.on', 'drone.vol', 'drone.tone', 'global.volume'], ['play', 'mode-sculpt'], 'Une note tenue et sa couleur. Tout part de là.'),
    N('t.son', 'tronc', 'Timbre du drone', 5, ['racine'], ['drone.wave', 'drone.motion'], [], 'Choisir le son du drone et le faire respirer.'),
    N('t.viz', 'tronc', 'Écran', 5, ['racine'], [], ['viz', 'listen'], 'Changer de visuel, passer en plein écran.'),
    N('t.journal', 'tronc', 'Journal', 10, ['t.son'], [], ['journal', 'save'], 'Revenir à un moment passé, garder un son comme patch.'),
    N('t.rec', 'tronc', 'Enregistreur', 15, ['t.son'], [], ['rec'], 'Enregistrer ce que tu entends.'),
    N('t.macros', 'tronc', 'Grands réglages', 20, ['t.son', 'h.pad'], ['macro.*'], ['xy'], 'Les 5 macros et le pad XY : beaucoup de réglages d\'un geste.', 'p.premier'),
    N('t.share', 'tronc', 'Partage', 10, ['t.journal'], [], ['share', 'patches'], 'Partager un lien, exporter et importer ses patchs.'),
    N('t.dice', 'tronc', 'Paysages', 25, ['t.macros'], [], ['dice', 'preset'], '✦ Nouveau paysage et presets par humeur.'),

    // Harmonie — chords, key, scale, progression
    N('h.pad', 'harmonie', 'Pad', 10, ['racine'], ['pad.on', 'pad.vol', 'pad.wave', 'pad.tone'], [], 'Des accords tenus au-dessus du drone.'),
    N('h.drone', 'harmonie', 'Drone qui suit', 8, ['h.pad'], ['drone.follow'], [], 'Le drone change de note avec les accords.'),
    N('h.pad2', 'harmonie', 'Accords riches', 20, ['h.pad'], ['pad.attack', 'pad.voicing', 'pad.counter', 'pad.length'], [], 'Attaque, accords enrichis, voix intérieure, durée des accords.'),
    N('h.key', 'harmonie', 'Tonalité', 15, ['h.pad'], ['global.key', 'global.tuning'], [], 'Changer la note de départ de tout le morceau.'),
    N('h.scale', 'harmonie', 'Gammes', 25, ['h.key'], ['global.scale'], [], '11 couleurs harmoniques, du lumineux au mélancolique.', 'p.gamme'),
    N('h.prog', 'harmonie', 'Progression', 40, ['h.scale', 'h.pad2'], ['pad.prog', 'pad.custom'], ['chords', 'mode-compose'], 'Écrire sa suite d\'accords case par case.'),

    // Espace — reverb, echo, tape, textures
    N('e.reverb', 'espace', 'Reverb', 10, ['racine'], ['fx.space', '*.send'], [], 'Une salle autour du son, et combien chaque couche y envoie.'),
    N('e.texture', 'espace', 'Texture', 15, ['e.reverb'], ['texture.*'], [], 'Pluie, vent, océan, feu, oiseaux…'),
    N('e.salle', 'espace', 'Salles', 20, ['e.reverb'], ['fx.revType', 'fx.size', 'fx.predelay'], [], 'Hall, Plate ou Cloud, taille et pré-délai.'),
    N('e.echo', 'espace', 'Écho', 20, ['e.reverb'], ['fx.echo', 'fx.echoTime', 'fx.feedback'], [], 'Des répétitions calées sur le tempo.'),
    N('e.halo', 'espace', 'Halo', 30, ['e.salle'], ['fx.shimmer'], [], 'Une octave qui scintille dans la reverb.'),
    N('e.tape', 'espace', 'Cassette', 30, ['e.echo'], ['fx.tape'], [], 'Pleurage, scintillement et saturation de bande.', 'p.espace'),
    N('e.lofi', 'espace', 'Usure', 35, ['e.tape'], ['fx.lofi'], [], 'Un son abîmé, filtré, granuleux.'),

    // Mouvement — melody, time, drift, grains, slow movements, scenes
    N('m.bells', 'mouvement', 'Mélodie auto', 10, ['racine'], ['bells.on', 'bells.vol', 'bells.wave', 'bells.density', 'bells.tone', 'bells.decay', 'bells.range'], [], 'Des notes qui improvisent sur les accords.'),
    N('m.tempo', 'mouvement', 'Tempo', 15, ['m.bells'], ['global.tempo', 'global.time'], [], 'Vitesse, et rythme régulier ou libre.'),
    N('m.phrase', 'mouvement', 'Phrases', 25, ['m.bells'], ['bells.mode', 'bells.phraseLen', 'bells.mutate'], [], 'Un motif qui se répète et varie lentement.'),
    N('m.evolve', 'mouvement', 'Dérive', 25, ['m.tempo'], ['global.evolve'], [], 'Tes réglages dérivent tout seuls autour de leur valeur.'),
    N('m.grains', 'mouvement', 'Grains', 30, ['m.bells'], ['grains.on', 'grains.vol', 'grains.density', 'grains.size', 'grains.scan', 'grains.spray', 'grains.pitch'], [], 'Un nuage de minuscules fragments de son.'),
    N('m.grains2', 'mouvement', 'Matières', 40, ['m.grains'], ['grains.source', 'grains.reverse', 'grains.glide'], ['freeze'], 'Ton fichier, le micro, Figer le mix ; à l\'envers, glissando.'),
    N('m.lfo', 'mouvement', 'Mouvements lents', 45, ['m.evolve'], ['mod.*'], [], 'Faire bouger n\'importe quel réglage sur plusieurs minutes.', 'p.mouvement'),
    N('m.scenes', 'mouvement', 'Scènes', 50, ['m.lfo'], [], ['scenes'], 'Deux états A/B et un fondu automatique entre eux.'),

    // Composer — written melody, bass, pulses, automation, song
    N('c.seq', 'composer', 'Mélodie écrite', 40, ['h.pad', 'm.bells'], ['seq.on', 'seq.wave', 'seq.vol', 'seq.steps', 'seq.octave', 'seq.tone', 'seq.decay', 'seq.send', 'seq.pattern'], ['pianoroll', 'mode-compose'], 'Dessiner ses notes dans le piano roll.', 'p.composer'),
    N('c.arp', 'composer', 'Arpège', 35, ['c.seq'], ['seq.mode', 'seq.arpDir', 'seq.arpRate', 'seq.arpOct'], [], 'Égrener l\'accord en cours.'),
    N('c.motifs', 'composer', 'Motifs A–D', 50, ['c.seq'], ['seq.patB', 'seq.patC', 'seq.patD', 'seq.slot', 'seq.chain', 'seq.mutate', 'seq.follow'], ['motifs', 'reclive'], '4 motifs, une chaîne, la variation, l\'enregistrement live.'),
    N('c.bass', 'composer', 'Basse', 45, ['c.seq'], ['bass.*'], [], 'Une ligne de basse qui suit les accords.'),
    N('c.perc', 'composer', 'Pulsations', 45, ['c.seq'], ['perc.*'], [], '4 pistes rythmiques douces.'),
    N('c.groove', 'composer', 'Groove', 30, ['c.perc'], ['global.swing', 'global.humanize', 'seq.swing'], [], 'Swing et imprécision humaine.'),
    N('c.midi', 'composer', 'MIDI', 40, ['c.seq'], [], ['midi'], 'Jouer avec un clavier MIDI, importer et exporter des .mid.'),
    N('c.auto', 'composer', 'Automation', 60, ['c.motifs'], ['auto.*'], ['automation'], 'Dessiner l\'évolution d\'un réglage sur plusieurs mesures.'),
    N('c.song', 'composer', 'Morceau', 80, ['c.auto', 'h.prog'], [], ['song'], 'Enchaîner des sections pour faire un morceau entier.'),
  ];

  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const exact = {}, suffix = {}, prefix = {};
  for (const n of NODES) for (const p of n.params) {
    if (p.startsWith('*.')) suffix[p.slice(1)] = n.id; // ".send"
    else if (p.endsWith('.*')) prefix[p.slice(0, -1)] = n.id; // "macro."
    else exact[p] = n.id;
  }
  const uiNode = {};
  for (const n of NODES) for (const u of n.ui) if (!uiNode[u]) uiNode[u] = n.id; // first node that grants it

  // interface features (node `ui` names) -> elements; params are tagged through their data-key
  const UI_SEL = {
    play: '#play, #bigPlay',
    viz: '#vizMode', listen: '#listen',
    journal: '#journal', save: '#save, #renamePatch, #deletePatch',
    rec: '.recgrp', share: '#share', patches: '#exportPatches, label:has(#importFile)',
    dice: '#dice, #mood', preset: '#preset', xy: '#xyTip',
    freeze: '.sample-row', scenes: '#scenes', automation: '[data-sec=auto]',
    chords: '.chords-panel', song: '.song-panel', pianoroll: '.roll-wrap',
    motifs: '.slot-tabs, .roll-wrap [data-act=dup]',
    reclive: '.roll-wrap [data-act=liverec], .roll-wrap label:has([data-metro])',
    midi: '#midi, #exportMidi, .roll-wrap label:has([data-midi-in]), .roll-wrap [data-act=midi]',
    'mode-sculpt': '[data-mode=sculpt]', 'mode-compose': '[data-mode=compose]',
  };

  const tree = {
    BRANCHES, NODES, byId, UI_SEL,
    // write data-node on every control (data-key) and feature element; untagged = always there
    tagDom(root = document) {
      root.querySelectorAll('[data-key]').forEach((el) => { const n = this.nodeFor(el.dataset.key); if (n) el.dataset.node = n; });
      for (const [name, sel] of Object.entries(UI_SEL)) {
        const n = this.nodeForUi(name);
        root.querySelectorAll(sel).forEach((el) => { el.dataset.node = n; el.dataset.ui = name; });
      }
    },
    // node owning a parameter key, or null (always available)
    nodeFor(key) {
      if (exact[key]) return exact[key];
      const dot = key.indexOf('.');
      return suffix[key.slice(dot)] || prefix[key.slice(0, dot + 1)] || null;
    },
    nodeForUi(name) { return uiNode[name] || null; },
    // can this node be bought now? (prerequisites owned and gate puzzle solved)
    status(id, g = AMB.game) {
      const n = byId[id];
      if (!n) return 'none';
      if (g.has(id)) return 'owned';
      if (!n.req.every((r) => g.has(r))) return 'locked';
      if (n.gate && !g.s.puzzles.includes(n.gate)) return 'gated';
      return 'available';
    },
    buy(id, g = AMB.game) {
      if (this.status(id, g) !== 'available') return false;
      return g.unlock(id, byId[id].cost);
    },
    paramUnlocked(key, g = AMB.game) { return g.isUnlocked(this.nodeFor(key)); },
    uiUnlocked(name, g = AMB.game) {
      if (!g.path) return true;
      // a feature granted by several nodes (e.g. Composer mode) opens with any of them
      return NODES.some((n) => n.ui.includes(name) && g.has(n.id)) || !uiNode[name];
    },
  };

  // hide what is not unlocked yet (path mode only; free mode = the full app, untouched)
  tree.applyLocks = function (g = AMB.game) {
    if (typeof document === 'undefined' || !document.body) return;
    const on = g.path;
    document.body.classList.toggle('game', on);
    document.querySelectorAll('[data-node]').forEach((el) => {
      const locked = on && (el.dataset.ui ? !this.uiUnlocked(el.dataset.ui, g) : !g.isUnlocked(el.dataset.node));
      el.classList.toggle('is-locked', locked);
    });
    // a panel with nothing unlocked inside disappears as a whole
    document.querySelectorAll('.panel').forEach((p) => {
      if (p.dataset.node) return; // feature panels (chords, song) follow their own node
      const tagged = p.querySelectorAll('[data-node]');
      p.classList.toggle('is-locked', on && tagged.length > 0 && !p.querySelector('[data-node]:not(.is-locked)'));
    });
    // top-bar groups whose buttons are all locked disappear with their caption
    document.querySelectorAll('.tgrp').forEach((t) => {
      const tagged = t.querySelectorAll('[data-node]');
      t.classList.toggle('is-locked', on && tagged.length > 0 && !t.querySelector('[data-node]:not(.is-locked)'));
    });
    // never stay in a mode that is locked
    const cur = AMB.mode;
    if (on && cur && cur !== 'listen' && !this.uiUnlocked('mode-' + cur, g) && AMB.perform) AMB.perform.setMode('listen');
  };

  // ---- sound locking (G1.5) ----
  // While locked, a parameter is pinned to a neutral value; the store refuses any other write
  // (presets, generator, links, scenes, journal, undo, macros, LFO…) except from the game itself.
  const NEUTRAL = {
    'fx.space': 0.35, 'fx.shimmer': 0, 'fx.echo': 0, 'fx.tape': 0, 'fx.lofi': 0,
    'global.evolve': 0, 'global.swing': 0, 'global.humanize': 0, 'pad.counter': 0,
    'mod.l1depth': 0, 'mod.l2depth': 0, 'mod.l1target': '—', 'mod.l2target': '—',
  };
  tree.lockedValue = function (key) {
    if (key in NEUTRAL) return NEUTRAL[key];
    if (key.endsWith('.on')) return false; // locked layers are silent
    const sp = AMB.store.spec(key);
    return sp ? sp.def : undefined;
  };
  tree.allKeys = function () {
    const out = [];
    for (const [sec, o] of Object.entries(AMB.SCHEMA)) for (const k of Object.keys(o.params)) out.push(`${sec}.${k}`);
    return out;
  };
  tree.pinLocked = function (g = AMB.game) {
    if (!g.path) return;
    for (const k of this.allKeys()) if (!this.paramUnlocked(k, g)) AMB.store.set(k, this.lockedValue(k), 'game');
  };
  // each mode keeps its own sound: leaving the path gives the free sound back, and vice versa
  const snapKey = (m) => `${AMB.game.key}.snap.${m}`;
  const saveSnap = (m) => { try { localStorage.setItem(snapKey(m), JSON.stringify(AMB.store.stableSnapshot())); } catch (e) {} };
  const loadSnap = (m) => { try { return JSON.parse(localStorage.getItem(snapKey(m))); } catch (e) { return null; } };
  let wasPath = AMB.game ? AMB.game.path : false;
  tree.onMode = function () {
    const g = AMB.game, nowPath = g.path;
    if (nowPath && !g.has('racine')) g.unlock('racine'); // the root is free
    if (nowPath !== wasPath) {
      saveSnap(wasPath ? 'path' : 'free');
      const back = loadSnap(nowPath ? 'path' : 'free');
      if (back) AMB.store.setMany(back, 'game');
      wasPath = nowPath;
    }
    this.pinLocked();
  };
  // a freshly bought layer starts playing right away
  tree.onUnlock = function (id) {
    const n = byId[id]; if (!n) return;
    for (const p of n.params) if (p.endsWith('.on') && p !== 'auto.on') AMB.store.set(p, true, 'game');
  };

  AMB.tree = tree;
  if (AMB.store) AMB.store.guard = (key) => !AMB.game || !AMB.game.path || tree.paramUnlocked(key);
  if (AMB.bus) {
    AMB.bus.on('game:mode', () => tree.onMode());
    AMB.bus.on('game:reset', () => { if (AMB.game.path && !AMB.game.has('racine')) AMB.game.unlock('racine'); tree.pinLocked(); });
    AMB.bus.on('game:unlock', (d) => tree.onUnlock(d.id));
  }
  if (AMB.bus) ['mode', 'unlock', 'reset'].forEach((e) => AMB.bus.on('game:' + e, () => tree.applyLocks()));
  // the root is free: own it as soon as the path starts
})();
