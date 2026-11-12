// « Jardin sonore » : contracts — small musical goals ("play 8 notes", "force 3 chords"). One at a time, shown on
// the 2nd line of the LCD, drawn at random (seeded) among those whose nodes are owned; ↷ passes to the next one.
// Judged on usage only, never on taste. Progress lives in game.s.prog, completion in game.s.contracts.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const ACTIVE = 1;
  const playing = () => !!(AMB.seq && AMB.seq.playing);

  // a user gesture on `key` counts once per `gap` ms (a knob drag is one gesture, not 40)
  const gesture = (st, key, gap = 900) => {
    const now = Date.now(), k = 't_' + key;
    if (st[k] && now - st[k] < gap) { st[k] = now; return false; }
    st[k] = now; return true;
  };
  const distinct = (st, v) => { st.seen = st.seen || []; if (!st.seen.includes(v)) { st.seen.push(v); st.n = st.seen.length; } };

  // contract: { id, need: [node ids], title, hint, reward, goal, on: { param|act|chord|note|rec|phrase(st, …) } }
  // v1.06: only contracts that make the player PLAY or LISTEN to something musical (no « min then max », no « try N options »)
  const C = (id, need, title, reward, goal, on, hint) => ({ id, need, title, reward, goal, on, hint: hint || '' });
  const DEFS = [
    // Tronc
    C('k.couleur', ['racine'], 'Fais varier la couleur du drone pendant qu\'il joue', 7, 2, {
      param(st, k, v, src) { if (k === 'drone.tone' && src === 'user' && playing() && gesture(st, k)) st.n = (st.n || 0) + 1; },
    }, 'Lance la lecture, puis Sculpter > Drone > Couleur : tourne le bouton deux fois en écoutant le son s\'ouvrir et se fermer.'),
    C('k.moments', ['t.journal'], 'Garde un moment (♥), puis reviens à un moment passé', 10, 2, {
      act(st, id) { if (id === 'keep') st.n = Math.max(st.n || 0, 1); else if (id === 'restore' && st.n === 1) st.n = 2; },
    }, 'Sculpter > Journal : ♥ garde le son de l\'instant ; un clic sur un moment passé le fait revenir.'),
    C('k.enreg', ['t.rec'], 'Enregistre au moins 30 secondes', 12, 1, {
      rec(st, secs) { if (secs >= 30) st.n = 1; }, // real duration of the finished recording
    }, '● Rec, joue au moins 30 s, puis ● Rec à nouveau pour arrêter (ou choisis une durée fixe dans ▾).'),
    C('k.xy', ['t.macros'], 'Joue sur l\'écran : 4 glissés', 10, 4, {
      act(st, id) { if (id === 'xy' && gesture(st, 'xy', 700)) st.n = (st.n || 0) + 1; },
    }, 'Glisse le doigt ou la souris sur l\'écran (gauche-droite : sombre-clair, bas-haut : densité) ; lève-le entre chaque glissé.'),
    C('k.paysages', ['t.dice', 't.journal'], 'Écoute 3 paysages, garde celui qui te plaît', 12, 4, {
      act(st, id) {
        if (id === 'dice' && (st.n || 0) < 3) st.n = (st.n || 0) + 1;
        else if ((id === 'keep' || id === 'save') && st.n >= 3) st.n = 4;
      },
    }, '✦ Nouveau paysage trois fois, puis ♥ dans le Journal (ou 💾 Sauver le patch) sur celui que tu préfères.'),

    // Harmonie
    C('h.forcer', ['h.pad'], 'Force 3 accords au clavier (Z à M)', 7, 3, {
      act(st, id) { if (id === 'chord' && gesture(st, 'chord', 600)) st.n = (st.n || 0) + 1; },
    }, 'Pendant la lecture, les touches Z, X, C, V, B, N, M jouent les accords I à VII (au clavier MIDI : les notes graves).'),
    C('h.suivre', ['h.drone'], 'Fais suivre les accords au drone, puis force un accord', 7, 2, {
      param(st, k, v, src) { if (k === 'drone.follow' && src === 'user' && v) st.n = Math.max(st.n || 0, 1); },
      act(st, id) { if (id === 'chord' && st.n === 1 && store.get('drone.follow')) st.n = 2; },
    }, 'Sculpter > Drone > Suit accords, puis une touche de Z à M pendant la lecture : écoute le drone changer de note.'),
    C('h.tonalite', ['h.key'], 'Module : change 3 fois de tonalité pendant la lecture', 10, 3, {
      param(st, k, v, src) { if (k === 'global.key' && src === 'user' && playing()) distinct(st, v); },
    }, 'Sculpter > Global > Tonalité, pendant que ça joue : écoute tout le paysage monter ou descendre.'),
    C('h.ecrire', ['h.prog'], 'Écris une progression de 4 accords et écoute-la', 14, 2, {
      param(st, k, v, src) {
        if (k === 'pad.custom' && src === 'user' && String(v).trim().split(/\s+/).filter(Boolean).length >= 4) st.n = Math.max(st.n || 0, 1);
      },
      chord(st) { if (st.n === 1 && store.get('pad.prog') === 'Perso') st.n = 2; },
    }, 'Composer > Progression : choisis 4 accords case par case, puis laisse jouer jusqu\'au changement d\'accord.'),

    // Espace
    C('e.echo', ['e.echo', 'm.bells'], 'Joue 6 notes dans l\'écho', 10, 6, {
      note(st) { if (playing() && store.get('fx.echo') >= 0.4) st.n = (st.n || 0) + 1; },
    }, 'Monte l\'Écho au-dessus de 40 (Sculpter > Espace), puis joue des notes (A à L) et écoute-les se répéter.'),

    // Mouvement
    C('m.notes', ['m.bells'], 'Joue 8 notes au clavier (A à L)', 7, 8, {
      note(st) { if (playing()) st.n = (st.n || 0) + 1; },
    }, 'Pendant la lecture, les touches A à L jouent la gamme (Q à P une octave au-dessus), ou ton clavier MIDI.'),
    C('m.phrase', ['m.phrase'], 'Mets la mélodie en Phrase et écoute-la tourner 2 fois', 10, 2, {
      param(st, k, v, src) { if (k === 'bells.mode' && src === 'user' && v === 'Phrase') st.on = 1; else if (k === 'bells.mode' && v !== 'Phrase') st.on = 0; },
      phrase(st) { if (st.on && store.get('bells.mode') === 'Phrase') st.n = (st.n || 0) + 1; },
    }, 'Sculpter > Mélodie > Jeu : Phrase. Le motif se répète et varie un peu à chaque tour.'),
    C('m.figer', ['m.grains2'], 'Fige le son 2 fois (❄ ou Entrée)', 12, 2, {
      act(st, id) { if (id === 'freeze') st.n = (st.n || 0) + 1; },
    }, 'Pendant la lecture, ❄ Figer (ou Entrée) capture les 4 dernières secondes : les grains les rejouent.'),
    C('m.scenes', ['m.scenes'], 'Mémorise deux scènes, puis rappelle-les l\'une après l\'autre', 14, 4, {
      act(st, id) {
        if (id === 'sceneStore' && (st.n || 0) < 2 && gesture(st, 'store', 300)) st.n = (st.n || 0) + 1;
        else if (id === 'sceneRecall' && st.n >= 2 && gesture(st, 'recall', 300)) st.n += 1;
      },
    }, 'Maj+clic sur A puis sur B pour mémoriser deux sons, puis un clic sur A et sur B pour passer de l\'un à l\'autre.'),

    // Composer
    C('c.dessin', ['c.seq'], 'Dessine 8 notes dans le piano roll', 10, 8, {
      param(st, k, v, src) { if (/^seq\.pat/.test(k) && src === 'user' && gesture(st, 'pat', 120)) st.n = (st.n || 0) + 1; },
    }, 'Composer > Mélodie écrite : un clic pose une note, glisser l\'allonge.'),
    C('c.chaine', ['c.motifs'], 'Enchaîne au moins deux motifs (ex. « A A B »)', 12, 1, {
      param(st, k, v, src) { if (k === 'seq.chain' && src === 'user' && new Set(String(v).toUpperCase().match(/[ABCD]/g) || []).size >= 2) st.n = 1; },
    }, 'Composer > Mélodie écrite : écris dans « Chaîne » l\'ordre des motifs, par exemple A A B.'),
    C('c.reclive', ['c.motifs'], 'Enregistre 4 notes en Rec live', 12, 4, {
      note(st) { const r = AMB.pianoRoll && AMB.pianoRoll.roll; if (r && r.recording) st.n = (st.n || 0) + 1; },
    }, 'Composer > Mélodie écrite > ● Rec live, puis joue au clavier (A à L) ou au clavier MIDI.'),
    C('c.basse', ['c.bass'], 'Écris ta ligne de basse : 6 pas', 10, 6, {
      param(st, k, v, src) { if (k === 'bass.pattern' && src === 'user' && gesture(st, k, 150)) st.n = (st.n || 0) + 1; },
    }, 'Composer > Basse : allume ou éteins des pas de la grille et écoute la ligne changer.'),
    C('c.pulses', ['c.perc'], 'Écris ton rythme : 6 pas', 10, 6, {
      param(st, k, v, src) { if (k === 'perc.pattern' && src === 'user' && gesture(st, k, 150)) st.n = (st.n || 0) + 1; },
    }, 'Composer > Pulsations : allume ou éteins des pas de la grille et écoute le rythme changer.'),
    C('c.courbe', ['c.auto'], 'Dessine une courbe avec un vrai creux et un vrai sommet', 12, 1, {
      param(st, k, v, src) {
        if (k !== 'auto.curve' || src !== 'user') return;
        const pts = String(v).split('').map((c) => parseInt(c, 36)).filter((x) => x >= 0);
        if (pts.length && Math.max(...pts) - Math.min(...pts) >= 18) st.n = 1; // spread of at least ~50 out of 100
      },
    }, 'Composer > Automation : dessine avec le doigt, bien en bas puis bien en haut, et écoute le réglage bouger.'),
    C('c.morceau', ['c.song'], 'Crée 3 sections, puis joue le morceau', 18, 4, {
      act(st, id) {
        if (id === 'section' && (st.n || 0) < 3) st.n = (st.n || 0) + 1;
        else if (id === 'song' && st.n >= 3) st.n = 4;
      },
    }, 'Composer > Morceau : + Section trois fois (change le son entre chaque), puis ▶ Jouer le morceau.'),
  ];
  const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));

  const contracts = {
    DEFS, byId,
    state(g = AMB.game) { g.s.active = g.s.active || []; g.s.prog = g.s.prog || {}; g.s.skipped = g.s.skipped || []; return g.s; },
    eligible(d, g = AMB.game) { return !g.s.contracts.includes(d.id) && d.need.every((n) => g.has(n)); },
    // keep one active contract
    refill(g = AMB.game) {
      if (!g.path) return;
      const s = this.state(g);
      s.active = s.active.filter((id) => byId[id] && !g.s.contracts.includes(id)).slice(0, ACTIVE); // older saves: 3 active
      // random draw (seeded PRNG kept in the game state) among the eligible ones; skipped ones come last
      const skipped = s.skipped || [], rnd = this.rng(g);
      for (const pool of [DEFS.filter((d) => !skipped.includes(d.id)), skipped.map((id) => byId[id]).filter(Boolean)]) {
        const cand = pool.filter((d) => !s.active.includes(d.id) && this.eligible(d, g));
        while (s.active.length < ACTIVE && cand.length) {
          const d = cand.splice(Math.floor(rnd() * cand.length), 1)[0];
          s.active.push(d.id); s.prog[d.id] = s.prog[d.id] || { n: 0 };
        }
      }
      g.save(); g.emit('contract', { active: s.active.slice() });
    },
    // mulberry32 whose state lives in game.s.rng (older saves get a fresh seed)
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
    // route an event to every active contract; complete those that reach their goal
    dispatch(ev, ...args) {
      const g = AMB.game; if (!g.counts()) return; // free mode or a puzzle's target: nothing counts
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
    finish(id, g = AMB.game) {
      const d = byId[id]; if (!d) return;
      const s = this.state(g);
      s.active = s.active.filter((x) => x !== id);
      delete s.prog[id];
      g.complete(id, d.reward); // emits game:contracts + game:earn
      this.refill(g);
    },
    // a stuck contract can be put back at the end of the queue (no reward)
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
    AMB.bus.on('phrase', (p) => contracts.dispatch('phrase', p));
    ['unlock', 'mode', 'reset'].forEach((e) => AMB.bus.on('game:' + e, () => contracts.refill()));
  }
  AMB.contracts = contracts;
  contracts.refill();
})();
