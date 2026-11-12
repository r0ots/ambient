// « Jardin sonore » : challenges — small musical goals ("play 6 notes", "force 3 chords") and gates opened by a
// « Réponse » (answer a phrase marked in the music, js/puzzles.js). S4.3: each one opens a node of the tree (table OPENS
// below), no currency. One at a time, on the 2nd line of the LCD, in the order of OPENS among those whose node can be
// reached now; ↷ passes to the next one. Judged on usage only, never on taste. Progress lives in game.s.prog,
// completion in game.s.contracts.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const playing = () => !!(AMB.seq && AMB.seq.playing);

  // a user gesture on `key` counts once per `gap` ms (a knob drag is one gesture, not 40)
  const gesture = (st, key, gap = 900) => {
    const now = Date.now(), k = 't_' + key;
    if (st[k] && now - st[k] < gap) { st[k] = now; return false; }
    st[k] = now; return true;
  };
  const distinct = (st, v) => { st.seen = st.seen || []; if (!st.seen.includes(v)) { st.seen.push(v); st.n = st.seen.length; } };

  // a contract: { id, need: [node ids it plays with], title, goal, on: { param|act|chord|note|rec|phrase|bass(st, …) }, hint }
  // v1.06: only challenges that make the player PLAY or LISTEN to something musical (no « min then max », no « try N options »)
  const C = (id, need, title, goal, on, hint) => ({ id, need, title, goal, on, hint: hint || '' });
  // a gate opened by a « Réponse » (S4.2, js/puzzles.js): during playback the Melody marks a phrase, the player plays it
  // back right after; N notes right open the node (N from the depth of the node, `d` below). `need` holds the Melody.
  const E = (id, need, title) => ({ id, kind: 'echo', need, title, goal: 1, on: {} });
  // counting helpers: a run of notes where each one follows `rule` from the previous one; a setting, then playing
  const run = (rule) => ({ note(st, n) { st.n = st.p && rule(st.p, n) ? (st.n || 1) + 1 : 1; st.p = { midi: n.midi, time: n.time }; } });
  const thenNotes = (test) => ({
    param(st, k, v, src) { if (src === 'user' && test(k, v)) st.n = Math.max(st.n || 0, 1); },
    note(st) { if (st.n >= 1) st.n += 1; },
  });
  const thenChords = (test) => ({
    param(st, k, v, src) { if (src === 'user' && test(k, v)) st.n = Math.max(st.n || 0, 1); },
    act(st, id) { if (id === 'chord' && st.n >= 1 && gesture(st, 'chord', 600)) st.n += 1; },
  });
  const DEFS = [
    // Tronc
    C('k.xy', ['racine'], 'Glisse sur l\'écran : 4 glissés', 4, {
      act(st, id) { if (id === 'xy' && gesture(st, 'xy', 700)) st.n = (st.n || 0) + 1; },
    }, 'Glisse le doigt ou la souris sur l\'écran (le son démarre) : à gauche plus sombre, à droite plus clair. Lève-le entre chaque glissé.'),
    C('k.couleur', ['racine'], 'Fais varier la couleur du drone pendant qu\'il joue', 2, {
      param(st, k, v, src) { if (k === 'drone.tone' && src === 'user' && playing() && gesture(st, k)) st.n = (st.n || 0) + 1; },
    }, 'Lance la lecture, puis Sculpter > Drone > Couleur : tourne le bouton deux fois en écoutant le son s\'ouvrir et se fermer.'),
    C('k.timbre', ['t.son', 'm.bells'], 'Change le son du drone, puis joue 3 notes dessus', 4, thenNotes((k) => k === 'drone.wave'),
      'Sculpter > Drone > Son : choisis-en un autre, puis joue 3 notes (pastilles ou A à L) et écoute-les sur ce fond.'),
    C('k.moments', ['t.journal'], 'Garde un moment (♥), puis reviens à un moment passé', 2, {
      act(st, id) { if (id === 'keep') st.n = Math.max(st.n || 0, 1); else if (id === 'restore' && st.n === 1) st.n = 2; },
    }, 'Sculpter > Journal : ♥ garde le son de l\'instant ; un clic sur un moment passé le fait revenir.'),
    C('k.enreg', ['t.rec'], 'Enregistre au moins 30 secondes', 1, {
      rec(st, secs) { if (secs >= 30) st.n = 1; }, // real duration of the finished recording
    }, '● Rec, joue au moins 30 s, puis ● Rec à nouveau pour arrêter (ou choisis une durée fixe dans ▾).'),
    C('k.macros', ['t.macros'], 'Tourne un grand réglage, puis joue 3 notes', 4, thenNotes((k) => k.startsWith('macro.')),
      'Écouter : tourne Lumière, Densité, Espace, Nostalgie ou Nature, puis joue 3 notes dans ce nouveau paysage.'),

    // Harmonie
    C('h.forcer', ['h.pad'], 'Force 3 accords (Z à M, ou appui long sur une pastille)', 3, {
      act(st, id) { if (id === 'chord' && gesture(st, 'chord', 600)) st.n = (st.n || 0) + 1; },
    }, 'Pendant la lecture, les touches Z, X, C, V, B, N, M jouent les accords I à VII ; au doigt, un appui long sur une pastille force l\'accord de son degré (au clavier MIDI : les notes graves).'),
    C('h.son', ['h.pad'], 'Change le son du Pad, puis force un accord', 2, thenChords((k) => k === 'pad.wave'),
      'Sculpter > Pad > Son : choisis-en un autre, puis force un accord (Z à M, ou appui long sur une pastille) pour l\'entendre.'),
    C('h.suivre', ['h.drone'], 'Fais suivre les accords au drone, puis force un accord', 2, {
      param(st, k, v, src) { if (k === 'drone.follow' && src === 'user' && v) st.n = Math.max(st.n || 0, 1); },
      act(st, id) { if (id === 'chord' && st.n === 1 && store.get('drone.follow')) st.n = 2; },
    }, 'Sculpter > Drone > Suit accords, puis une touche de Z à M pendant la lecture : écoute le drone changer de note.'),
    C('h.tonalite', ['h.key'], 'Module : change 2 fois de tonalité pendant la lecture', 2, {
      param(st, k, v, src) { if (k === 'global.key' && src === 'user' && playing()) distinct(st, v); },
    }, 'Sculpter > Global > Tonalité, pendant que ça joue : écoute tout le paysage monter ou descendre.'),

    // Espace
    C('e.resonne', ['e.reverb', 'm.bells'], 'Ouvre l\'espace (au-dessus de 60), puis joue 3 notes', 4, thenNotes((k, v) => k === 'fx.space' && v >= 0.6),
      'Sculpter > Espace > Espace au-dessus de 60, puis joue 3 notes et écoute-les se prolonger.'),
    C('m.respire', ['e.reverb', 'm.bells'], 'Laisse respirer : 3 notes, une seconde et demie entre chacune', 3, run((p, n) => n.time - p.time >= 1.5 && n.time - p.time <= 6),
      'Joue une note, laisse-la s\'éteindre dans l\'espace (au moins une seconde et demie), puis la suivante : trois fois.'),
    C('e.noyer', ['e.reverb', 'h.pad'], 'Noie le Pad dans l\'espace, puis force un accord', 2, thenChords((k, v) => k === 'pad.send' && v >= 0.7),
      'Sculpter > Pad > Espace au-dessus de 70, puis force un accord (Z à M) : il flotte dans la salle.'),
    C('e.grande', ['e.salle', 'm.bells'], 'Agrandis la salle (au-dessus de 80), puis joue 3 notes', 4, thenNotes((k, v) => k === 'fx.size' && v >= 0.8),
      'Sculpter > Espace > Taille au-dessus de 80, puis joue 3 notes dans cette grande salle.'),
    C('e.echo', ['e.echo', 'm.bells'], 'Joue 4 notes dans l\'écho', 4, {
      note(st) { if (store.get('fx.echo') >= 0.4) st.n = (st.n || 0) + 1; },
    }, 'Monte l\'Écho au-dessus de 40 (Sculpter > Espace), puis joue des notes (pastilles ou A à L) et écoute-les se répéter.'),

    // Mouvement
    C('m.notes', ['m.bells'], 'Joue 6 notes (pastilles ou clavier A à L)', 6, {
      note(st) { st.n = (st.n || 0) + 1; },
    }, 'Les pastilles sous l\'écran ou les touches A à L jouent la gamme (Q à P une octave au-dessus), ou ton clavier MIDI.'),
    C('m.monte', ['m.bells'], 'Joue 4 notes qui montent', 4, run((p, n) => n.midi > p.midi),
      'Quatre notes de suite, chacune plus aiguë que la précédente : de gauche à droite sur les pastilles (ou A, S, D, F).'),
    C('m.descend', ['m.bells'], 'Joue 4 notes qui descendent', 4, run((p, n) => n.midi < p.midi),
      'Quatre notes de suite, chacune plus grave que la précédente : de droite à gauche sur les pastilles (ou L, K, J, H).'),
    C('m.pas', ['m.bells'], 'Marche : 4 notes régulières, comme des pas', 4, {
      note(st, n) { // each gap 0.25–1.5 s and within a quarter of the previous one: a steady walk
        const g = st.p ? n.time - st.p.time : null, fine = g != null && g >= 0.25 && g <= 1.5;
        st.n = fine && (!st.g || Math.abs(g - st.g) <= st.g * 0.25) ? (st.n || 1) + 1 : fine ? 2 : 1;
        st.g = fine ? g : null; st.p = { time: n.time };
      },
    }, 'Quatre notes à intervalles égaux, comme des pas tranquilles (ni trop vite ni trop lent) : c\'est un tempo.'),
    C('m.ralenti', ['m.tempo', 'm.bells'], 'Ralentis sous 60 bpm, puis joue 3 notes', 4, thenNotes((k, v) => k === 'global.tempo' && v < 60),
      'Sculpter > Global > Tempo sous 60, puis joue 3 notes sur ce paysage plus lent.'),
    C('m.phrase', ['m.phrase'], 'Mets la mélodie en Phrase et écoute-la tourner 2 fois', 2, {
      param(st, k, v, src) { if (k === 'bells.mode' && src === 'user' && v === 'Phrase') st.on = 1; else if (k === 'bells.mode' && v !== 'Phrase') st.on = 0; },
      phrase(st) { if (st.on && store.get('bells.mode') === 'Phrase') st.n = (st.n || 0) + 1; },
    }, 'Sculpter > Mélodie > Jeu : Phrase. Le motif se répète et varie un peu à chaque tour.'),
    C('m.nuage', ['m.grains', 'm.bells'], 'Épaissis les grains (au-dessus de 60), puis joue 3 notes', 4, thenNotes((k, v) => k === 'grains.density' && v >= 0.6),
      'Sculpter > Grains > Densité au-dessus de 60, puis joue 3 notes au milieu du nuage.'),
    C('m.figer', ['m.grains2'], 'Fige le son 2 fois (❄ ou Entrée)', 2, {
      act(st, id) { if (id === 'freeze') st.n = (st.n || 0) + 1; },
    }, 'Pendant la lecture, ❄ Figer (ou Entrée) capture les 4 dernières secondes : les grains les rejouent.'),

    // Composer (S3.5: played, not drawn — the notes, the groove and the song come from playing them)
    C('c.reclive', ['c.seq'], 'Enregistre 6 notes en Rec live', 6, {
      note(st) { const r = AMB.pianoRoll && AMB.pianoRoll.roll; if (r && r.recording) st.n = (st.n || 0) + 1; },
    }, 'Composer > Mélodie écrite > ● Rec live, puis joue sur les pastilles, au clavier (A à L) ou au clavier MIDI : tes notes s\'écrivent dans le piano roll.'),
    C('c.groove', ['c.rythme'], 'Change ta ligne de basse, puis fais tourner le groove 4 mesures', 4, {
      param(st, k, v, src) { if (k === 'bass.pattern' && src === 'user') st.on = 1; },
      bass(st) { // one count per bar where the bass plays, once the player has made the line his own
        const S = AMB.seq; if (!st.on || !playing() || !S) return;
        const bar = Math.floor((S.step - (S.origin || 0)) / 16);
        if (bar !== st.bar) { st.bar = bar; st.n = (st.n || 0) + 1; }
      },
    }, 'Composer > Rythme : allume ou éteins des pas de la grille de basse, puis laisse jouer 4 mesures avec les pulsations.'),
    // the path's last challenge: proposed first as soon as Morceau is owned (`first`); it opens no node, it ends the path
    C('c.morceau', ['c.song'], 'Enregistre ton morceau', 1, {
      act(st, id) { if (id === 'songRec') st.n = 1; },
    }, 'Composer > Morceau : + Section pour garder un son (fais-en au moins deux), puis ● Rec : le morceau joue du début à la fin et s\'enregistre.'),

    // gates opened by a Réponse (S4.3: they replaced the « set the knobs to a target » puzzles; S4.2: played in the music)
    E('p.premier', ['t.son', 'h.pad', 'm.bells'], 'Premier reflet'),
    E('p.suite', ['m.bells'], 'Suite connue'),
    E('p.composer', ['h.pad', 'm.bells'], 'Boîte à musique'),
    E('p.gamme', ['h.scale', 'm.bells'], 'Autre lumière'),
    E('p.espace', ['e.tape', 'm.bells'], 'La grotte'),
    E('p.mouvement', ['m.evolve', 'm.bells'], 'Pluie de notes'),
  ];
  // S4.3 — THE table: which challenge opens which node, in the order of the path (the queue follows it). Secrets open
  // their own nodes too (js/secrets.js OPENS). A node waits for its prerequisites and for what its challenge plays with
  // (`need`); that graph has no cycle (tests/game.html), so no order of play can block the path (tests/balance.html).
  const OPENS = {
    'm.bells': 'k.xy', 'h.pad': 'm.notes', 't.son': 'k.couleur', 'e.reverb': 'm.monte', 't.viz': 'm.descend',
    'h.drone': 'h.forcer', 't.macros': 'p.premier', 'm.tempo': 'm.pas', 'm.phrase': 'p.suite', 'h.key': 'h.suivre',
    'h.pad2': 'h.son', 't.journal': 'k.timbre', 'e.echo': 'e.resonne', 'e.salle': 'm.respire', 'e.texture': 'e.noyer',
    't.rec': 'k.moments', 't.dice': 'k.macros', 'h.scale': 'h.tonalite', 'm.evolve': 'm.ralenti', 'm.grains': 'm.phrase',
    'c.seq': 'p.composer', 'e.halo': 'e.grande', 'e.tape': 'e.echo', 'c.rythme': 'c.reclive', 't.share': 'k.enreg',
    'h.prog': 'p.gamme', 'm.grains2': 'm.nuage', 'e.lofi': 'p.espace', 'm.lfo': 'p.mouvement', 'm.scenes': 'm.figer',
    'c.song': 'c.groove',
  };
  const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));
  for (const [node, id] of Object.entries(OPENS)) byId[id].node = node;
  byId['c.morceau'].first = true;
  const ORDER = Object.values(OPENS).map((id) => byId[id]).concat(DEFS.filter((d) => !d.node));
  // a Réponse gate's difficulty from the depth of its node: 3 notes up to depth 3, one more per level, up to 6
  const depth = (id) => { const n = AMB.tree.byId[id]; return n.req.length ? 1 + Math.max(...n.req.map(depth)) : 0; };
  for (const d of DEFS) if (d.kind === 'echo') {
    d.d = Math.max(0, Math.min(1, (depth(d.node) - 3) / 3));
    const n = 3 + Math.round(d.d * 3); // AMB.puzzles.echoLen
    d.hint = `Pendant la lecture, la plante Mélodie s'allume et l'écran dit « ↺ À toi » : rejoue la phrase juste après (pastilles, A à L ou MIDI). ${n} notes justes ouvrent le nœud.`;
  }

  const contracts = {
    DEFS, byId, OPENS, ORDER,
    state(g = AMB.game) { g.s.active = g.s.active || []; g.s.prog = g.s.prog || {}; g.s.skipped = g.s.skipped || []; return g.s; },
    // proposed only when its node can be opened now (prerequisites owned) and what it plays with is there;
    // the last one (no node): once, when Morceau is owned
    eligible(d, g = AMB.game) {
      if (!d.need.every((n) => g.has(n))) return false;
      return d.node ? AMB.tree.status(d.node, g) === 'available' : !g.s.contracts.includes(d.id);
    },
    // the challenge that opens a node (tree card)
    forNode(nodeId) { return byId[OPENS[nodeId]] || null; },
    // the next node of the path that can be opened now (a secret whose own node is owned opens this one)
    nextNode(g = AMB.game) {
      const a = byId[this.state(g).active[0]];
      if (a && a.node && this.eligible(a, g)) return a.node;
      const d = ORDER.find((x) => x.node && AMB.tree.status(x.node, g) === 'available');
      return d ? d.node : null;
    },
    // keep one active challenge: the first eligible in the order of the path; the skipped ones last, in the order passed
    refill(g = AMB.game) {
      if (!g.path) return;
      const s = this.state(g);
      s.active = s.active.filter((id) => byId[id] && this.eligible(byId[id], g)).slice(0, 1); // older saves: 3 active, removed ids
      const skipped = s.skipped.filter((id) => byId[id]);
      const queue = ORDER.filter((d) => d.first).concat(ORDER.filter((d) => !d.first && !skipped.includes(d.id)), skipped.map((id) => byId[id]));
      const next = !s.active.length && queue.find((d) => this.eligible(d, g));
      if (next) { s.active.push(next.id); s.prog[next.id] = s.prog[next.id] || { n: 0 }; }
      g.save(); g.emit('contract', { active: s.active.slice() });
    },
    // mulberry32 whose state lives in game.s.rng (older saves get a fresh seed): the Réponse phrases
    seed(n, g = AMB.game) { g.s.rng = n >>> 0; },
    rng(g = AMB.game) {
      if (typeof g.s.rng !== 'number') this.seed((Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0, g);
      return () => {
        let t = (g.s.rng = (g.s.rng + 0x6D2B79F5) >>> 0);
        t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    progress(id, g = AMB.game) { const st = this.state(g).prog[id]; return Math.min(byId[id].goal, (st && st.n) || 0); },
    // route an event to the active challenge; finish it when it reaches its goal
    dispatch(ev, ...args) {
      const g = AMB.game; if (!g.counts()) return; // free mode, or the instrument handed over: nothing counts
      if (ev === 'param' && args[2] === 'game') return;
      const s = this.state(g); let changed = false;
      for (const id of s.active.slice()) {
        const d = byId[id]; const fn = d && d.on[ev]; if (!fn) continue;
        const st = (s.prog[id] = s.prog[id] || { n: 0 }), before = st.n || 0;
        fn(st, ...args);
        if ((st.n || 0) !== before) {
          changed = true;
          g.emit('contract', { id, n: this.progress(id), goal: d.goal });
          if ((st.n || 0) >= d.goal) this.finish(id);
        }
      }
      if (changed) g.save();
    },
    // done: recorded, and its node opens (by = this challenge: the garden plays the unlock sequence)
    finish(id, g = AMB.game) {
      const d = byId[id]; if (!d) return;
      const s = this.state(g);
      s.active = s.active.filter((x) => x !== id);
      delete s.prog[id];
      g.complete(id);
      if (d.node) g.unlock(d.node, id);
      this.refill(g);
    },
    // a stuck challenge can be put back at the end of the queue
    skip(id, g = AMB.game) {
      const s = this.state(g); if (!s.active.includes(id)) return;
      s.active = s.active.filter((x) => x !== id);
      s.skipped = (s.skipped || []).filter((x) => x !== id).concat(id); // back of the queue
      this.refill(g);
    },
  };

  // ---- event sources ----
  store.on((k, v, src) => contracts.dispatch('param', k, v, src));
  if (AMB.bus) {
    AMB.bus.on('chord', (c) => contracts.dispatch('chord', c));
    AMB.bus.on('act', (id) => contracts.dispatch('act', id));
    AMB.bus.on('rec:done', (secs) => contracts.dispatch('rec', secs));
    AMB.bus.on('live', (n) => contracts.dispatch('note', n));
    AMB.bus.on('note', (n) => { if (n && n.layer === 'bass') contracts.dispatch('bass', n); });
    AMB.bus.on('phrase', (p) => contracts.dispatch('phrase', p));
    ['unlock', 'mode', 'reset'].forEach((e) => AMB.bus.on('game:' + e, () => contracts.refill()));
  }
  AMB.contracts = contracts;
  contracts.refill();
})();
