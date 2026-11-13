// « Jardin sonore » : challenges — small musical goals ("play 6 notes", "force 3 chords") and gates opened by a
// « Réponse » (answer a phrase marked in the music, js/puzzles.js). S4.3: each one opens a node of the tree (table OPENS
// below), no currency. One at a time, on the 2nd line of the LCD, in the order of OPENS among those whose node can be
// reached now; ↷ passes to the next one. Judged on usage only, never on taste. Progress lives in game.s.prog,
// completion in game.s.contracts. S5.5: the interface challenges are ASKED in the music (kind 'demande', js/demands.js).
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

  // a contract: { id, need: [node ids it plays with], title, goal, on: { param|act|chord|note|rec|phrase|bass(st, …) }, hint }
  // v1.06: only challenges that make the player PLAY or LISTEN to something musical (no « min then max », no « try N options »)
  const C = (id, need, title, goal, on, hint) => ({ id, need, title, goal, on, hint: hint || '' });
  // a gate opened by a « Réponse » (S4.2, js/puzzles.js): during playback the Melody marks a phrase, the player plays it
  // back right after; N notes right open the node (N from the depth of the node, `d` below). `need` holds the Melody.
  const E = (id, need, title) => ({ id, kind: 'reponse', need, title, goal: 1, on: {} });
  // counting helper: a run of notes where each one follows `rule` from the previous one
  const run = (rule) => ({ note(st, n) { st.n = st.p && rule(st.p, n) ? (st.n || 1) + 1 : 1; st.p = { midi: n.midi, time: n.time }; } });
  // S5.5 — a challenge ASKED in the music (js/demands.js, after Fuser): the landscape asks for the gesture with a countdown,
  // it is judged on its placement (on the 1, or before the end of the bar). They replaced the static interface challenges
  // (« turn this knob, then play 3 notes », « change the mode »): same nodes, same order. `ask` = the gesture (demands.match)
  // and its place in time: how 'hit' (on the 1) | 'by' (before the end of the bar); param (key, 'macro.*'), v (test of the
  // value), src (sources that count, 'user' by default), act (a bus action).
  const Dm = (id, need, title, ask, hint) => ({ id, kind: 'demande', need, title, goal: 1, on: {}, ask, hint });
  const ON1 = 'Pendant la lecture, l\'écran te le demandera avec un compte à rebours (3, 2, 1) : fais-le pile quand il dit MAINTENANT. ';
  const BY = 'Pendant la lecture, l\'écran te le demandera avec un compte à rebours : fais-le avant la fin de la mesure. ';
  const DEFS = [
    // Tronc
    // S5.7: the first challenge is a note (a pad, a key or a MIDI keyboard: they all play from the Graine)
    C('k.note', ['racine'], 'Joue une note{ (pastille, touche A à L ou MIDI)| : touche une pastille}', 1, {
      note(st) { st.n = 1; },
    }, '{Touche une pastille sous l\'écran, une touche de A à L ou ton clavier MIDI : le son démarre.|Touche une pastille de couleur sous l\'écran : le son démarre.}'),
    Dm('k.couleur', ['racine'], 'Tourne la lumière du drone sur MAINTENANT', { how: 'hit', param: 'drone.tone', src: ['user', 'cc'] },
      ON1 + 'Sculpter > Drone > Lumière{ (ou la molette CC74 du clavier MIDI)|} : le son s\'ouvre et se ferme.'),
    Dm('k.timbre', ['t.son'], 'Change le timbre du drone sur MAINTENANT', { how: 'hit', param: 'drone.wave' },
      ON1 + 'Sculpter > Drone > Timbre : choisis-en un autre.'),
    Dm('k.moments', ['t.journal'], 'Garde ce moment (♥) sur MAINTENANT', { how: 'hit', act: 'keep' },
      ON1 + 'Sculpter > Journal : ♥ garde le son de l\'instant ; plus tard, un clic sur un moment passé le fait revenir.'),
    C('k.enreg', ['t.rec'], 'Enregistre au moins 30 secondes', 1, {
      rec(st, secs) { if (secs >= 30) st.n = 1; }, // real duration of the finished recording
    }, '● Rec, joue au moins 30 s, puis ● Rec à nouveau pour arrêter (ou choisis une durée fixe dans ▾).'),
    Dm('k.macros', ['t.macros'], 'Tourne un grand réglage avant la fin de la mesure', { how: 'by', param: 'macro.*', src: ['user', 'sync'] },
      BY + 'Écouter : Lumière, Densité, Espace, Nostalgie ou Nature.'),

    // Harmonie
    C('h.forcer', ['h.pad'], 'Force 3 accords ({Z à M, ou appui long sur une pastille|appui long sur une pastille})', 3, {
      act(st, id) { if (id === 'chord' && gesture(st, 'chord', 600)) st.n = (st.n || 0) + 1; },
    }, '{Pendant la lecture, les touches Z, X, C, V, B, N, M jouent les accords I à VII ; au doigt, un appui long sur une pastille force l\'accord de son degré (au clavier MIDI : les notes graves).|Pendant la lecture, garde le doigt appuyé sur une pastille : elle joue tout un accord.}'),
    Dm('h.son', ['h.pad'], 'Change le timbre du Pad sur MAINTENANT', { how: 'hit', param: 'pad.wave' },
      ON1 + 'Sculpter > Pad > Timbre : choisis-en un autre.'),
    Dm('h.suivre', ['h.drone'], 'Fais suivre les accords au drone sur MAINTENANT', { how: 'hit', param: 'drone.follow', v: (v) => !!v },
      ON1 + 'Sculpter > Drone > Suit accords : écoute ensuite le drone changer de note avec les accords.'),
    Dm('h.tonalite', ['h.key'], 'Module : change de tonalité sur MAINTENANT', { how: 'hit', param: 'global.key' },
      ON1 + 'Sculpter > Global > Tonalité : tout le paysage monte ou descend.'),

    // Effets
    Dm('e.resonne', ['e.reverb'], 'Ouvre l\'espace (Reverb au-dessus de 60) avant la fin de la mesure', { how: 'by', param: 'fx.space', v: (v) => v >= 0.6 },
      BY + 'Sculpter > Effets > Reverb au-dessus de 60 : les notes se prolongent.'),
    C('m.respire', ['e.reverb', 'm.bells'], 'Laisse respirer : 3 notes, une seconde et demie entre chacune', 3, run((p, n) => n.time - p.time >= 1.5 && n.time - p.time <= 6),
      'Joue une note, laisse-la s\'éteindre dans l\'espace (au moins une seconde et demie), puis la suivante : trois fois.'),
    Dm('e.noyer', ['e.reverb', 'h.pad'], 'Noie le Pad (Distance au-dessus de 70) avant la fin de la mesure', { how: 'by', param: 'pad.send', v: (v) => v >= 0.7 },
      BY + 'Sculpter > Pad > Distance au-dessus de 70 : ses accords flottent dans la salle.'),
    Dm('e.grande', ['e.salle'], 'Agrandis la salle (Taille au-dessus de 80) avant la fin de la mesure', { how: 'by', param: 'fx.size', v: (v) => v >= 0.8 },
      BY + 'Sculpter > Effets > Taille au-dessus de 80.'),
    C('e.echo', ['e.echo', 'm.bells'], 'Joue 4 notes dans l\'écho', 4, {
      note(st) { if (store.get('fx.echo') >= 0.4) st.n = (st.n || 0) + 1; },
    }, 'Monte l\'Écho au-dessus de 40 (Sculpter > Effets), puis joue des notes (pastilles{, A à L ou MIDI|}) et écoute-les se répéter.'),

    // Mouvement
    C('m.notes', ['m.bells'], 'Joue 6 notes (pastilles{, A à L ou MIDI|})', 6, {
      note(st) { st.n = (st.n || 0) + 1; },
    }, '{Les pastilles sous l\'écran ou les touches A à L jouent la gamme (Q à P une octave au-dessus), ou ton clavier MIDI.|Les pastilles de couleur sous l\'écran jouent la gamme : touche-les une par une.}'),
    C('m.monte', ['m.bells'], 'Joue 4 notes qui montent', 4, run((p, n) => n.midi > p.midi),
      'Quatre notes de suite, chacune plus aiguë que la précédente : des pastilles violettes (les plus graves) vers les orange (les plus aiguës){, ou A, S, D, F|}.'),
    C('m.descend', ['m.bells'], 'Joue 4 notes qui descendent', 4, run((p, n) => n.midi < p.midi),
      'Quatre notes de suite, chacune plus grave que la précédente : des pastilles orange (les plus aiguës) vers les violettes (les plus graves){, ou L, K, J, H|}.'),
    C('m.pas', ['m.bells'], 'Marche : 4 notes régulières, comme des pas', 4, {
      note(st, n) { // each gap 0.25–1.5 s and within a quarter of the previous one: a steady walk
        const g = st.p ? n.time - st.p.time : null, fine = g != null && g >= 0.25 && g <= 1.5;
        st.n = fine && (!st.g || Math.abs(g - st.g) <= st.g * 0.25) ? (st.n || 1) + 1 : fine ? 2 : 1;
        st.g = fine ? g : null; st.p = { time: n.time };
      },
    }, 'Quatre notes à intervalles égaux, comme des pas tranquilles (ni trop vite ni trop lent) : c\'est un tempo.'),
    Dm('m.ralenti', ['m.tempo'], 'Ralentis sous 60 bpm avant la fin de la mesure', { how: 'by', param: 'global.tempo', v: (v) => v < 60 },
      BY + 'Sculpter > Global > Tempo sous 60 : tout le paysage ralentit.'),
    Dm('m.phrase', ['m.phrase'], 'Passe la Mélodie auto en Phrase sur MAINTENANT', { how: 'hit', param: 'bells.mode', v: (v) => v === 'Phrase' },
      ON1 + 'Sculpter > Mélodie auto > Jeu : Phrase. Le motif se répète et varie un peu à chaque tour.'),
    Dm('m.nuage', ['m.grains'], 'Épaissis les grains (Densité au-dessus de 60) avant la fin de la mesure', { how: 'by', param: 'grains.density', src: ['user', 'macro', 'cc'], v: (v) => v >= 0.6 },
      BY + 'Sculpter > Grains > Densité au-dessus de 60 (ou Densité dans Écouter{, ou la molette de modulation MIDI|}).'),
    Dm('m.figer', ['m.grains2'], 'Fige le son sur MAINTENANT (❄{ ou Entrée|})', { how: 'hit', act: 'freeze' },
      ON1 + '❄ Figer{ (ou Entrée)|} capture les 4 dernières secondes : les grains les rejouent.'),

    // Composer (S3.5: played, not drawn — the notes, the groove and the song come from playing them)
    C('c.reclive', ['c.seq'], 'Enregistre 6 notes en Rec live', 6, {
      note(st) { const r = AMB.pianoRoll && AMB.pianoRoll.roll; if (r && r.recording) st.n = (st.n || 0) + 1; },
    }, 'Composer > Mélodie écrite > ● Rec live, puis joue sur les pastilles{, au clavier (A à L) ou au clavier MIDI|} : tes notes s\'écrivent dans le piano roll.'),
    C('c.groove', ['c.rythme'], 'Change ta ligne de basse, puis fais tourner le groove 4 mesures', 4, {
      param(st, k, v, src) { if (k === 'bass.pattern' && src === 'user') st.on = 1; },
      bass(st) { // one count per bar where the bass plays, once the player has made the line his own
        const S = AMB.seq; if (!st.on || !playing() || !S) return;
        const bar = Math.floor((S.step - (S.origin || 0)) / 16);
        if (bar !== st.bar) { st.bar = bar; st.n = (st.n || 0) + 1; }
      },
    }, 'Composer > Basse : allume ou éteins des pas de la grille, puis laisse jouer 4 mesures avec les pulsations.'),
    // the path's last challenge (`first`): proposed once the whole tree is open (S5.7); it opens no node, it ends the path
    // S6.7: the bar's ● Rec counts too (a child could not find Composer > Morceau > + Section ×2 > ● Rec): a take of 3 s
    // or more, stopped by ■; rec.js then hands its WAV to the finale instead of downloading it
    C('c.morceau', ['c.song'], 'Enregistre ton morceau', 1, {
      act(st, id) { if (id === 'songRec') st.n = 1; },
      rec(st, secs) { if (secs >= 3) st.n = 1; },
    }, '{● Rec en haut, joue un moment, puis ■ : ton morceau est gardé. Ou Composer > Morceau > ● Rec : tes sections, du début à la fin.|Touche ● Rec en haut, joue un peu, puis touche ■ pour arrêter.}'),

    // gates opened by a Réponse (S4.3: they replaced the « set the knobs to a target » puzzles; S4.2: played in the music)
    E('p.premier', ['t.son', 'h.pad', 'm.bells'], 'Premier reflet'),
    E('p.suite', ['m.bells'], 'Suite connue'),
    E('p.composer', ['h.pad', 'm.bells'], 'Boîte à musique'),
    E('p.gamme', ['h.scale', 'm.bells'], 'Autre lumière'),
    E('p.espace', ['e.tape', 'm.bells'], 'La grotte'),
    E('p.mouvement', ['m.evolve', 'm.bells'], 'Pluie de notes'),
  ];
  // S4.3 — THE table: which challenge opens which node, in the order of the path (the queue follows it). Discoveries open
  // their own nodes too (js/discoveries.js OPENS). A node waits for its prerequisites and for what its challenge plays with
  // (`need`); that graph has no cycle (tests/game.html), so no order of play can block the path (tests/balance.html).
  const OPENS = {
    'm.bells': 'k.note', 'h.pad': 'm.notes', 't.son': 'k.couleur', 'e.reverb': 'm.monte', 't.viz': 'm.descend',
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
  for (const d of DEFS) if (d.kind === 'reponse') {
    d.d = Math.max(0, Math.min(1, (depth(d.node) - 3) / 3));
    const n = 3 + Math.round(d.d * 3); // AMB.puzzles.respLen
    d.hint = `Pendant la lecture, l'enseigne Mélodie auto s'allume et l'écran dit « ↺ À toi » : rejoue la phrase juste après (pastilles{, A à L ou MIDI|}). ${n} notes justes ouvrent le nœud.`;
  }

  const contracts = {
    DEFS, byId, OPENS, ORDER,
    state(g = AMB.game) { g.s.active = g.s.active || []; g.s.prog = g.s.prog || {}; g.s.skipped = g.s.skipped || []; return g.s; },
    // proposed only when its node can be opened now (prerequisites owned) and what it plays with is there;
    // the last one (no node): once, S5.7 only when every node is open (it ends the path: never a plain challenge after it)
    eligible(d, g = AMB.game) {
      if (!d.need.every((n) => g.has(n))) return false;
      return d.node ? AMB.tree.status(d.node, g) === 'available' : !g.s.contracts.includes(d.id) && AMB.tree.NODES.every((n) => g.has(n.id));
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
      this.migrate(g);
      const s = this.state(g);
      // S4.6: while a node won waits for the player to open it, no challenge (the next one comes once it is open; the
      // progress of a challenge put aside is kept in s.prog, the order brings it back first)
      if ((s.ready || []).length) { s.active = []; g.save(); g.emit('contract', { active: [] }); return; }
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
    // done: recorded, and its node is ready (S4.6: the player opens it; by = this challenge: the map's opening sequence)
    finish(id, g = AMB.game) {
      const d = byId[id]; if (!d) return;
      const s = this.state(g);
      s.active = s.active.filter((x) => x !== id);
      delete s.prog[id];
      g.complete(id);
      if (d.node) g.ready(d.node, id);
      this.refill(g);
    },
    // S4.6, older saves: a challenge done (or a discovery found, discoveries.migrate) whose node is not open becomes ready
    migrate(g = AMB.game) {
      if (!g.path) return;
      for (const id of g.s.contracts || []) { const d = byId[id]; if (d && d.node && !g.has(d.node) && !g.isReady(d.node)) g.ready(d.node, id); }
      if (AMB.discoveries) AMB.discoveries.migrate(g);
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
    ['unlock', 'ready', 'mode', 'reset'].forEach((e) => AMB.bus.on('game:' + e, () => contracts.refill()));
  }
  AMB.contracts = contracts;
  contracts.refill();
})();
