// « Jardin sonore » : the unlock tree, as data.
// A node unlocks parameters (`params`: exact keys, "section.*" or "*.suffix") and interface
// features (`ui`: names used as data-node on elements). `req`: all must be owned first.
// No cost (S4.3): each node is opened by a challenge (a Réponse gate among them) or a discovery (tables OPENS in js/contracts.js and js/discoveries.js).
// Param resolution: exact key > "*.suffix" > "section.*".
(function () {
  const AMB = (window.AMB = window.AMB || {});

  const BRANCHES = {
    tronc: { name: 'Tronc', color: '#e8d9b0' },
    harmonie: { name: 'Harmonie', color: '#b58cff' },
    espace: { name: 'Effets', color: '#7fd6ff' },
    mouvement: { name: 'Mouvement', color: '#8fe3a0' },
    composer: { name: 'Composer', color: '#ffb36b' },
  };

  const N = (id, branch, name, req, params, ui, desc) => ({ id, branch, name, req, params, ui, desc });
  const NODES = [
    // Tronc — the starting point and the tools to keep / share a sound
    N('racine', 'tronc', 'Allumage', [], ['drone.on', 'drone.vol', 'drone.tone', 'global.volume'], ['play'], 'Une note tenue et sa lumière : la machine s\'allume. Tout part de là.'),
    // S11.1: the player's own notes are a piece of their own, after the Mélodie auto (the machine starts with the drone alone)
    N('k.piano', 'tronc', 'Piano', ['m.bells'], [], ['keys', 'midi'], 'Tes propres notes, sur des touches de couleur.'),
    N('t.son', 'tronc', 'Timbre du drone', ['racine'], ['drone.wave', 'drone.motion'], [], 'Choisir le son du drone et le faire respirer.'),
    N('t.viz', 'tronc', 'Écran', ['racine'], [], ['listen'], 'Passer en plein écran : juste regarder la ville et écouter.'),
    N('t.journal', 'tronc', 'Journal', ['t.son'], [], ['journal', 'save'], 'Revenir à un moment passé, garder un paysage.'),
    N('t.rec', 'tronc', 'Enregistreur', ['t.son'], [], ['rec'], 'Enregistrer ce que tu entends.'),
    N('t.macros', 'tronc', 'Grands réglages', ['t.son', 'h.pad', 'm.bells'], ['macro.*'], [], 'Les 5 grands réglages : beaucoup de réglages d\'un geste.'),
    N('t.share', 'tronc', 'Partage', ['t.journal'], [], ['share', 'patches'], 'Partager un lien, exporter et importer ses paysages.'),
    N('t.dice', 'tronc', 'Paysages', ['t.macros'], [], ['dice', 'preset'], '✦ Nouveau paysage par humeur, et les paysages prêts.'),

    // Harmonie — chords, key, scale, progression
    N('h.pad', 'harmonie', 'Pad', ['racine'], ['pad.on', 'pad.vol', 'pad.wave', 'pad.tone'], [], 'Des accords tenus au-dessus du drone.'),
    N('h.drone', 'harmonie', 'Drone qui suit', ['h.pad'], ['drone.follow'], [], 'Le drone change de note avec les accords.'),
    N('h.pad2', 'harmonie', 'Accords riches', ['h.pad'], ['pad.attack', 'pad.voicing', 'pad.counter', 'pad.length'], [], 'Attaque, accords enrichis, voix intérieure, durée des accords.'),
    N('h.key', 'harmonie', 'Tonalité', ['h.pad'], ['global.key'], [], 'Changer la note de départ de tout le morceau.'),
    N('h.scale', 'harmonie', 'Gammes', ['h.key'], ['global.scale'], [], '11 gammes, de la plus lumineuse à la plus mélancolique.'),
    N('h.prog', 'harmonie', 'Progression', ['h.scale', 'h.pad2'], ['pad.prog', 'pad.custom'], ['chords', 'mode-compose'], 'Écrire sa suite d\'accords case par case.'),

    // Effets (id `espace`) — reverb, echo, tape, textures
    N('e.reverb', 'espace', 'Reverb', ['racine'], ['fx.space', '*.send'], [], 'Une salle autour du son, et la distance de chaque son.'),
    N('e.texture', 'espace', 'Texture', ['e.reverb'], ['texture.*'], [], 'Pluie, vent, océan, feu, oiseaux…'),
    N('e.salle', 'espace', 'Salles', ['e.reverb'], ['fx.revType', 'fx.size', 'fx.predelay'], [], 'Hall, Plate ou Cloud, taille et pré-délai.'),
    N('e.echo', 'espace', 'Écho', ['e.reverb'], ['fx.echo', 'fx.echoTime', 'fx.feedback'], [], 'Des répétitions calées sur le tempo.'),
    N('e.halo', 'espace', 'Halo', ['e.salle'], ['fx.shimmer'], [], 'Une octave qui scintille dans la reverb.'),
    N('e.tape', 'espace', 'Cassette', ['e.echo'], ['fx.tape'], [], 'Pleurage, scintillement et saturation de bande.'),
    N('e.lofi', 'espace', 'Usure', ['e.tape'], ['fx.lofi'], [], 'Un son abîmé, filtré, granuleux.'),

    // Mouvement — melody, time, drift, grains, slow movements, scenes
    N('m.bells', 'mouvement', 'Mélodie auto', ['racine'], ['bells.on', 'bells.vol', 'bells.wave', 'bells.density', 'bells.tone', 'bells.decay', 'bells.range'], [], 'Des notes qui improvisent sur les accords, au-dessus du drone.'),
    N('m.tempo', 'mouvement', 'Tempo', ['m.bells'], ['global.tempo', 'global.time'], [], 'Vitesse, et temps pulsé ou flottant.'),
    N('m.phrase', 'mouvement', 'Phrases', ['m.bells'], ['bells.mode', 'bells.phraseLen', 'bells.mutate'], [], 'Un motif qui se répète et varie lentement.'),
    N('m.evolve', 'mouvement', 'Dérive', ['m.tempo'], ['global.evolve'], [], 'Tes réglages dérivent tout seuls autour de leur valeur.'),
    N('m.grains', 'mouvement', 'Grains', ['m.bells'], ['grains.on', 'grains.vol', 'grains.density', 'grains.size', 'grains.scan', 'grains.spray', 'grains.pitch'], [], 'Un nuage de minuscules fragments de son.'),
    N('m.grains2', 'mouvement', 'Matières', ['m.grains'], ['grains.source', 'grains.reverse', 'grains.glide'], ['freeze'], 'Ton fichier, le micro, Figer le mix ; à l\'envers, glissando.'),
    N('m.lfo', 'mouvement', 'Mouvements lents', ['m.evolve'], ['mod.*'], [], 'Faire bouger n\'importe quel réglage sur plusieurs minutes.'),
    N('m.scenes', 'mouvement', 'Scènes', ['m.lfo'], [], ['scenes'], 'Deux états A/B et un fondu automatique entre eux.'),

    // Composer (S3.5: 3 nodes, was 8) — written melody (piano roll, arpeggio, motifs, Rec live), rhythm, the song
    N('c.seq', 'composer', 'Mélodie écrite', ['h.pad', 'm.bells'], ['seq.on', 'seq.wave', 'seq.vol', 'seq.steps', 'seq.octave', 'seq.tone', 'seq.decay', 'seq.send', 'seq.pattern',
      'seq.mode', 'seq.arpDir', 'seq.arpRate', 'seq.arpOct', 'seq.patB', 'seq.patC', 'seq.patD', 'seq.slot', 'seq.chain', 'seq.mutate', 'seq.follow'],
      ['pianoroll', 'mode-compose', 'midiFile', 'motifs', 'reclive'], 'Le piano roll, l\'arpège, 4 motifs et leur chaîne, le Rec live ; importer et exporter des .mid.'),
    N('c.rythme', 'composer', 'Rythme', ['c.seq'], ['bass.*', 'perc.*', 'global.swing', 'global.humanize', 'seq.swing'], [], 'Une basse qui suit les accords, 4 pistes de pulsations, le swing et l\'imprécision humaine.'),
    N('c.song', 'composer', 'Morceau', ['c.rythme', 'h.prog'], ['auto.*'], ['automation', 'song'], 'Enchaîner des sections (chacune ses motifs, ses accords et ses boucles jouées), faire évoluer un réglage sur plusieurs mesures, enregistrer le morceau entier.'),
  ];

  // S4.6 — what opening a node gives, in plain words for a child who is not a musician (the « ✦ Ouvrir » card, garden.js):
  // one or two sentences, the words of the lexicon (ARCHITECTURE.md). The only table of these texts.
  const EXPLAIN = {
    'k.piano': 'Tu joues tes propres notes : des touches de couleur sous l\'écran{, les lettres A à L ou ton clavier MIDI|}.',
    't.son': 'Le drone change de voix : plus doux, plus rond ou plus pointu, et il peut respirer lentement. À régler dans Sculpter, Drone.',
    't.viz': 'Tu peux passer en plein écran pour juste regarder la ville et écouter.',
    't.journal': 'L\'instrument se souvient de ce que tu as entendu : ♥ garde un moment, et tu peux revenir à un moment passé.',
    't.rec': '● Rec enregistre ce que tu entends dans un fichier, pour le réécouter ou le faire écouter.',
    't.macros': 'Cinq gros boutons qui changent beaucoup de choses d\'un coup : Lumière, Densité, Espace, Nostalgie, Nature. Ils sont en haut de Sculpter.',
    't.share': 'Tu peux envoyer ton paysage à quelqu\'un avec un lien, et garder tous tes paysages dans un fichier.',
    't.dice': '✦ Nouveau paysage invente un son complet selon une humeur, et le menu Paysage en propose des tout prêts.',
    'h.pad': 'Des accords : plusieurs notes tenues ensemble, qui s\'étendent sous le drone. Tu pourras choisir un autre son ou les couper dans Sculpter, Pad.',
    'h.drone': 'Le drone ne reste plus sur la même note : il change avec les accords du Pad.',
    'h.pad2': 'Les accords peuvent arriver doucement ou d\'un coup, avoir plus de notes, et durer plus ou moins longtemps.',
    'h.key': 'Tu peux faire monter ou descendre toute la musique d\'un coup. L\'écran montre aussi le nom des notes et des accords.',
    'h.scale': 'Une gamme, c\'est la famille de notes que joue l\'instrument. Il y en a 11, des plus joyeuses aux plus tristes.',
    'h.prog': 'Tu choisis toi-même les accords et leur ordre, case par case, dans Composer.',
    'e.reverb': 'Le son résonne comme dans une grande salle. Tu règles la taille de cet espace, et à quelle distance sonne chaque son.',
    'e.texture': 'Un nouveau son : des bruits de nature sous la musique, comme la pluie, le vent, l\'océan ou les oiseaux.',
    'e.salle': 'Tu choisis la forme de la salle où sonne la musique, et sa taille : une chapelle, une grotte, un nuage.',
    'e.echo': 'Les notes se répètent toutes seules, de plus en plus doucement, en rythme avec la musique.',
    'e.halo': 'Une lueur aiguë qui scintille autour du son, comme des étoiles dans la salle.',
    'e.tape': 'Le son tremble un peu, comme sur une vieille cassette : plus chaud, plus rêveur.',
    'e.lofi': 'Le son devient abîmé et granuleux, comme un vieux disque ou une radio lointaine.',
    'm.bells': 'Un son qui joue des notes tout seul, au-dessus du drone. Avec le Piano, il te proposera des phrases à rejouer.',
    'm.tempo': 'Tu choisis la vitesse de la musique, et si elle bat comme un cœur (Pulsé) ou si elle flotte (Flottant).',
    'm.phrase': 'La Mélodie auto peut répéter une petite phrase, qui change un peu à chaque tour, comme une chanson.',
    'm.evolve': 'Tes réglages bougent tout seuls, un tout petit peu, autour de là où tu les as mis : le son vit sans toi.',
    'm.grains': 'Un nouveau son fait de minuscules morceaux de son, comme un nuage de poussière qui chante.',
    'm.grains2': 'Les grains peuvent venir de ton propre son : un fichier, le micro, ou ❄ Figer qui attrape ce que tu entends.',
    'm.lfo': 'Tu choisis un réglage et il bouge tout seul, très lentement, comme une vague qui va et vient.',
    'm.scenes': 'Tu gardes deux sons, A et B, et tu glisses de l\'un à l\'autre, à la main ou tout seul.',
    'c.seq': 'Tu écris ta propre mélodie note par note dans Composer, ou tu la joues et elle s\'écrit toute seule (● Rec live).',
    'c.rythme': 'Une basse qui joue sous les accords, et des petits battements, comme une batterie toute douce.',
    'c.song': 'Tu enchaînes plusieurs moments pour faire un vrai morceau, du début à la fin, et tu peux l\'enregistrer.',
  };
  for (const n of NODES) n.why = EXPLAIN[n.id] || n.desc;

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
    listen: '#listen', // (S6.7: #vizMode is not on the path, the Parcours always shows the city)
    journal: '#journal', save: '#save, #renamePatch, #deletePatch',
    rec: '.recgrp', share: '#share', patches: '#exportPatches, label:has(#importFile)',
    dice: '#dice, #mood', preset: '#preset',
    freeze: '.sample-row', scenes: '#scenes', automation: '[data-sec=auto]',
    chords: '.chords-panel', song: '.song-panel', pianoroll: '.roll-wrap',
    motifs: '.slot-tabs, .roll-wrap [data-act=dup]',
    reclive: '.roll-wrap [data-act=liverec], .roll-wrap label:has([data-metro])',
    keys: '.stage .hint', midi: '#midi', midiFile: '#exportMidi, .roll-wrap label:has([data-midi-in]), .roll-wrap [data-act=midi]',
    'mode-compose': '[data-mode=compose]',
  };

  const UI_LABEL = {
    play: 'Lecture', listen: 'Plein écran', journal: 'Journal des moments', save: 'Sauver un paysage',
    rec: 'Enregistrement', share: 'Lien de partage', patches: 'Export / import des paysages', dice: '✦ Nouveau paysage',
    preset: 'Paysages prêts', freeze: 'Échantillon, micro, Figer', scenes: 'Scènes A/B', automation: 'Automation',
    chords: 'Panneau Progression', song: 'Morceau', pianoroll: 'Piano roll', motifs: 'Motifs A–D', reclive: 'Rec live',
    keys: 'Jouer au clavier (A–L)', midi: 'Clavier MIDI', midiFile: 'Import / export .mid', 'mode-compose': 'Mode Composer',
  };

  const tree = {
    BRANCHES, NODES, byId, UI_SEL, UI_LABEL, EXPLAIN,
    // what a node opens, grouped by layer and deduplicated (node card): « Mélodie : Son, Volume · Pad · Piano roll »
    grantGroups(id) {
      const n = byId[id]; if (!n) return [];
      const S = AMB.SCHEMA, groups = [], by = {};
      const grp = (label) => by[label] || (by[label] = groups[groups.push({ label, items: [], all: false }) - 1]);
      for (const p of n.params) {
        if (p.startsWith('*.')) { grp('Distance de chaque son'); continue; }
        const [sec, k] = p.split('.');
        if (!S[sec]) continue;
        if (k === '*') { grp(S[sec].label).all = true; continue; }
        const sp = S[sec].params[k];
        if (!sp || sp.hidden) continue;
        const g = grp(S[sec].label);
        if (k !== 'on' && !g.items.includes(sp.label)) g.items.push(sp.label);
      }
      for (const u of n.ui) grp(UI_LABEL[u] || u);
      return groups;
    },
    grantsText(id) {
      return this.grantGroups(id).map((g) => (g.all ? `${g.label} (tout)` : g.items.length ? `${g.label} : ${g.items.join(', ')}` : g.label)).join(' · ');
    },
    // nodes that list `id` as a prerequisite
    dependents(id) { return NODES.filter((n) => n.req.includes(id)).map((n) => n.id); },
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
    // can this node be opened now? (prerequisites owned). S4.6: 'ready' = won, waiting for the player to open it
    status(id, g = AMB.game) {
      const n = byId[id];
      if (!n) return 'none';
      if (g.has(id)) return 'owned';
      if (g.isReady && g.isReady(id)) return 'ready';
      return n.req.every((r) => g.has(r)) ? 'available' : 'locked';
    },
    paramUnlocked(key, g = AMB.game) {
      if (!g.isUnlocked(this.nodeFor(key))) return false;
      // a layer's « Distance » send only matters once the layer itself is there
      if (g.path && key.endsWith('.send')) { const on = key.replace(/\.send$/, '.on'); if (AMB.store.spec(on)) return g.isUnlocked(this.nodeFor(on)); }
      return true;
    },
    uiUnlocked(name, g = AMB.game) {
      if (!g.path) return true;
      // a feature granted by several nodes (e.g. Composer mode) opens with any of them
      return NODES.some((n) => n.ui.includes(name) && g.has(n.id)) || !uiNode[name];
    },
  };

  // hide what is not unlocked yet (path mode only; free mode = the full app, untouched)
  // live = a node was just opened: what comes out of its lock is animated in (appear)
  tree.applyLocks = function (g = AMB.game, live = false) {
    if (typeof document === 'undefined' || !document.body) return;
    const on = g.path, fresh = [];
    const lock = (el, locked) => { if (!locked && el.classList.contains('is-locked')) fresh.push(el); el.classList.toggle('is-locked', locked); };
    document.body.classList.toggle('game', on);
    document.querySelectorAll('[data-node]').forEach((el) => {
      lock(el, on && (el.dataset.ui ? !this.uiUnlocked(el.dataset.ui, g) : el.dataset.key ? !this.paramUnlocked(el.dataset.key, g) : !g.isUnlocked(el.dataset.node)));
    });
    // a panel with nothing unlocked inside disappears as a whole
    document.querySelectorAll('.panel').forEach((p) => {
      if (p.dataset.node) return; // feature panels (chords, song) follow their own node
      const tagged = p.querySelectorAll('[data-node]');
      lock(p, on && tagged.length > 0 && !p.querySelector('[data-node]:not(.is-locked)'));
    });
    // top-bar groups whose buttons are all locked disappear with their caption
    document.querySelectorAll('.tgrp').forEach((t) => {
      const tagged = t.querySelectorAll('[data-node]');
      lock(t, on && tagged.length > 0 && !t.querySelector('[data-node]:not(.is-locked)')); // (S9.1: Sculpter alone is no choice: the Mode group waits for Composer)
    });
    this.solo(g);
    if (live && on && fresh.length) this.appear(fresh);
    // never stay in a mode that is locked (Sculpter is always there)
    const cur = AMB.mode;
    if (on && cur && cur !== 'sculpt' && !this.uiUnlocked('mode-' + cur, g) && AMB.perform) AMB.perform.setMode('sculpt');
  };

  // S5.6: the On of a layer that is the only one open is hidden in the path: muting it would silence everything. Shown
  // again as soon as another layer opens, or if that layer is off (so that it can always be turned back on).
  tree.SOLO = ['drone', 'pad', 'bells', 'grains', 'texture', 'seq', 'bass', 'perc'];
  tree.solo = function (g = AMB.game) {
    if (typeof document === 'undefined') return;
    const tg = this.SOLO.map((l) => document.querySelector(`.panel[data-sec="${l}"] > header .tog[data-key="${l}.on"]`)).filter((b) => b && !b.closest('.is-locked'));
    document.querySelectorAll('.tog.is-solo').forEach((b) => b.classList.remove('is-solo'));
    if (g && g.path && tg.length === 1 && AMB.store.get(tg[0].dataset.key)) document.querySelectorAll(`.tog[data-key="${tg[0].dataset.key}"]`).forEach((b) => b.classList.add('is-solo')); // (its panel header)
  };
  if (AMB.store) AMB.store.on((k) => { if (/\.on$/.test(k) && tree.SOLO.includes(k.split('.')[0])) tree.solo(); });

  // ---- S4.6: what a node opens comes in animated, then stays highlighted ----
  // One generic class set, for every control, panel, button or mode a lock lets out: `is-appearing` (unfolds, fades and
  // grows in, ~0.5 s, css), then `is-new` (a pulsing halo) until the player touches it, NEW_MS at most; a « Nouveau » tag
  // (`is-new-first`) points at the first one. hold() keeps them back while the map's opening sequence plays
  // (garden-tree.js), release() lets them in. Reduced motion: no unfolding nor pulse (css), the halo and the tag stay.
  tree.NEW_MS = 8000;
  tree.APPEAR_MS = 550;
  tree.held = 0; tree.pending = [];
  tree.hold = function () { this.held++; };
  tree.release = function () {
    this.held = Math.max(0, this.held - 1);
    if (!this.held && this.pending.length) { const p = this.pending; this.pending = []; this.appear(p); }
  };
  tree.appear = function (els) {
    if (this.held) { this.pending.push(...els); return []; }
    els = [...new Set(els)].filter((e) => e.isConnected && !e.closest('.is-locked') && !e.closest('.menu'));
    // the outermost unfolds (a panel with its controls unfolds once); the controls themselves get the halo
    for (const e of els.filter((e) => !els.some((o) => o !== e && o.contains(e)))) {
      e.classList.remove('is-appearing'); void e.offsetWidth; e.classList.add('is-appearing');
      setTimeout(() => {
        e.classList.remove('is-appearing');
        // S7.3: it lands with a burst of sparks (where it is now: the reveal scrolled to it), if it is in the window
        const M = AMB.motion, r = e.getBoundingClientRect();
        if (M && r.width && r.bottom > 0 && r.top < innerHeight && !(AMB.garden && AMB.garden.modalUp && AMB.garden.modalUp())) M.burst({ x: r.left + r.width / 2, y: r.top + Math.min(r.height, 60) / 2 }, { n: 20, spread: Math.PI * 2, speed: 340, color: '#fff36b' });
      }, this.APPEAR_MS + 100);
    }
    const hl = els.filter((e) => e.dataset.node && !e.matches('.stage .hint')); // (the keys line just appears)
    if (!hl.length) return hl;
    hl.forEach((e) => e.classList.add('is-new'));
    // the tag: on the first full control in reading order (not a panel's on/off switch in its corner), never on a form
    // field (no ::after there)
    const tagOk = (e) => !e.matches('select, input, textarea, canvas, img');
    const first = hl.find((e) => tagOk(e) && !e.closest('.panel header')) || hl.find(tagOk) || null;
    document.querySelectorAll('.is-new-first').forEach((e) => e.classList.remove('is-new-first', 'is-new-rel'));
    if (first) { first.classList.add('is-new-first'); if (getComputedStyle(first).position === 'static') first.classList.add('is-new-rel'); }
    this.newFirst = first || hl[0];
    clearTimeout(this._newT); this._newT = setTimeout(() => this.clearNew(), this.NEW_MS);
    return hl;
  };
  tree.clearNew = function (el) {
    (el ? [el] : [...document.querySelectorAll('.is-new')]).forEach((e) => e.classList.remove('is-new', 'is-new-first', 'is-new-rel'));
  };
  // the first touch on a highlighted control ends its highlight, with a little juice (S5.9 garden.FX.first)
  if (typeof document !== 'undefined') ['pointerdown', 'change'].forEach((t) => document.addEventListener(t, (e) => {
    const el = e.target && e.target.closest && e.target.closest('.is-new'); if (!el) return;
    tree.clearNew(el); if (AMB.garden && AMB.garden.fx) AMB.garden.fx('first', { el });
  }, true));

  // ---- sound locking (G1.5) ----
  // While locked, a parameter is pinned to a neutral value; the store refuses any other write
  // (presets, generator, links, scenes, journal, undo, macros, LFO…) except from the game itself.
  const NEUTRAL = {
    'fx.space': 0.35, 'fx.shimmer': 0, 'fx.echo': 0, 'fx.tape': 0, 'fx.lofi': 0,
    'global.evolve': 0, 'global.swing': 0, 'global.humanize': 0, 'pad.counter': 0,
    'mod.l1depth': 0, 'mod.l2depth': 0, 'mod.l1target': '—', 'mod.l2target': '—', 'drone.follow': false,
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
  // a freshly opened layer starts playing right away
  tree.onUnlock = function (id) {
    const n = byId[id]; if (!n) return;
    for (const p of n.params) if (p.endsWith('.on') && p !== 'auto.on') AMB.store.set(p, true, 'game');
    // effects held at a neutral value while locked come back at their default, so the opening is heard
    for (const k of this.allKeys()) {
      if (!(k in NEUTRAL) || this.nodeFor(k) !== id || AMB.store.get(k) !== NEUTRAL[k]) continue;
      const sp = AMB.store.spec(k); if (sp && sp.def !== NEUTRAL[k]) AMB.store.set(k, sp.def, 'game');
    }
    // sends of layers that were waiting for this layer
    for (const k of this.allKeys()) if (k.endsWith('.send') && this.nodeFor(k.replace(/\.send$/, '.on')) === id && this.paramUnlocked(k)) AMB.store.set(k, AMB.store.spec(k).def, 'game');
  };

  AMB.tree = tree;
  if (AMB.store) AMB.store.guard = (key) => !AMB.game || !AMB.game.path || tree.paramUnlocked(key);
  if (AMB.bus) {
    AMB.bus.on('game:mode', () => tree.onMode());
    AMB.bus.on('game:reset', () => { if (AMB.game.path && !AMB.game.has('racine')) AMB.game.unlock('racine'); tree.pinLocked(); });
    AMB.bus.on('game:unlock', (d) => tree.onUnlock(d.id));
  }
  if (AMB.bus) ['mode', 'reset'].forEach((e) => AMB.bus.on('game:' + e, () => tree.applyLocks()));
  if (AMB.bus) AMB.bus.on('game:unlock', (d) => tree.applyLocks(AMB.game, !!(d && d.id !== 'racine')));
  // the root is free: own it as soon as the path starts
})();
