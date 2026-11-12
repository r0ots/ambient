// « Jardin sonore » : usage contracts — small, checkable goals ("change the drone colour 3 times
// while it plays"). Three are active at a time, picked in order among those whose nodes are owned.
// Judged on usage only, never on taste. Progress lives in game.s.prog, completion in game.s.contracts.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const ACTIVE = 3;
  const playing = () => !!(AMB.seq && AMB.seq.playing);

  // a user gesture on `key` counts once per `gap` ms (a knob drag is one gesture, not 40)
  const gesture = (st, key, gap = 900) => {
    const now = Date.now(), k = 't_' + key;
    if (st[k] && now - st[k] < gap) { st[k] = now; return false; }
    st[k] = now; return true;
  };
  const distinct = (st, v) => { st.seen = st.seen || []; if (!st.seen.includes(v)) { st.seen.push(v); st.n = st.seen.length; } };

  // contract: { id, need: [node ids], title, hint, reward, goal, on: { param|act|chord|bar|note(st, …) } }
  const C = (id, need, title, reward, goal, on, hint) => ({ id, need, title, reward, goal, on, hint: hint || '' });
  const DEFS = [
    // Tronc
    C('k.couleur', ['racine'], 'Fais varier la couleur du drone 3 fois pendant qu\'il joue', 6, 3, {
      param(st, k, v, src) { if (k === 'drone.tone' && src === 'user' && playing() && gesture(st, k)) st.n = (st.n || 0) + 1; },
    }, 'Lecture, puis Sculpter > Drone > Couleur'),
    C('k.souffle', ['racine'], 'Coupe le drone puis rallume-le, sans arrêter la lecture', 6, 2, {
      param(st, k, v, src) {
        if (k !== 'drone.on' || src !== 'user' || !playing()) return;
        if (!v) st.n = 1; else if (st.n === 1) st.n = 2;
      },
    }),
    C('k.timbres', ['t.son'], 'Écoute les 4 timbres du drone', 8, 4, {
      param(st, k, v, src) { if (k === 'drone.wave' && src === 'user') distinct(st, v); },
    }),
    C('k.ecran', ['t.viz'], 'Passe par les 3 visuels de l\'écran', 5, 3, {
      act(st, id) { if (id === 'viz') st.n = (st.n || 0) + 1; },
    }, 'Bouton en haut à droite de l\'écran'),
    C('k.moments', ['t.journal'], 'Garde un moment (♥), puis reviens à un moment passé', 8, 2, {
      act(st, id) { if (id === 'keep') st.n = Math.max(st.n || 0, 1); else if (id === 'restore' && st.n === 1) st.n = 2; },
    }, 'Sculpter > Journal'),
    C('k.enreg', ['t.rec'], 'Enregistre au moins 30 secondes', 10, 1, {
      rec(st, secs) { if (secs >= 30) st.n = 1; }, // real duration of the finished recording
    }, '● Rec, puis ● Rec à nouveau pour arrêter (ou une durée fixe)'),
    C('k.xy', ['t.macros'], 'Glisse sur l\'écran pendant 4 mesures', 8, 4, {
      act(st, id) { if (id === 'xy') st.last = Date.now(); },
      bar(st) { if (st.last && Date.now() - st.last < 4000) st.n = (st.n || 0) + 1; },
    }),
    C('k.paysages', ['t.dice', 't.journal'], 'Génère 3 paysages, puis garde celui qui te plaît', 10, 4, {
      act(st, id) {
        if (id === 'dice' && (st.n || 0) < 3) st.n = (st.n || 0) + 1;
        else if ((id === 'keep' || id === 'save') && st.n >= 3) st.n = 4;
      },
    }),

    // Harmonie
    C('h.forcer', ['h.pad'], 'Force 3 accords au clavier (touches Z à M)', 6, 3, {
      act(st, id) { if (id === 'chord' && gesture(st, 'chord', 600)) st.n = (st.n || 0) + 1; },
    }),
    C('h.ombre', ['h.pad'], 'Rends le Pad très sombre, puis très brillant', 6, 2, {
      param(st, k, v, src) { if (k !== 'pad.tone' || src !== 'user') return; if (v < 0.15) st.n = Math.max(st.n || 0, 1); else if (v > 0.85 && st.n === 1) st.n = 2; },
    }),
    C('h.suivre', ['h.drone'], 'Fais suivre les accords au drone, puis force un accord', 6, 2, {
      param(st, k, v, src) { if (k === 'drone.follow' && src === 'user' && v) st.n = Math.max(st.n || 0, 1); },
      act(st, id) { if (id === 'chord' && st.n === 1 && store.get('drone.follow')) st.n = 2; },
    }),
    C('h.riches', ['h.pad2'], 'Écoute 2 changements d\'accord avec « Accords riches » au maximum', 8, 2, {
      chord(st) { if (store.get('pad.voicing') > 0.9 && store.get('pad.on')) st.n = (st.n || 0) + 1; },
    }),
    C('h.tonalite', ['h.key'], 'Change 3 fois de tonalité pendant la lecture', 8, 3, {
      param(st, k, v, src) { if (k === 'global.key' && src === 'user' && playing()) distinct(st, v); },
    }),
    C('h.gammes', ['h.scale'], 'Essaie 4 gammes différentes', 10, 4, {
      param(st, k, v, src) { if (k === 'global.scale' && src === 'user') distinct(st, v); },
    }),
    C('h.ecrire', ['h.prog'], 'Écris une progression de 4 accords et écoute-la', 12, 2, {
      param(st, k, v, src) {
        if (k === 'pad.custom' && src === 'user' && String(v).trim().split(/\s+/).filter(Boolean).length >= 4) st.n = Math.max(st.n || 0, 1);
      },
      chord(st) { if (st.n === 1 && store.get('pad.prog') === 'Perso') st.n = 2; },
    }, 'Composer > Progression'),

    // Espace
    C('e.extremes', ['e.reverb'], 'Mets la reverb au minimum, puis au maximum', 6, 2, {
      param(st, k, v, src) { if (k !== 'fx.space' || src !== 'user') return; if (v < 0.1) st.n = Math.max(st.n || 0, 1); else if (v > 0.9 && st.n === 1) st.n = 2; },
    }),
    C('e.envois', ['e.reverb'], 'Règle l\'espace de 3 couches différentes', 6, 3, {
      param(st, k, v, src) { if (k.endsWith('.send') && src === 'user') distinct(st, k); },
    }, 'Le réglage « Espace » de chaque couche'),
    C('e.textures', ['e.texture'], 'Écoute 4 textures différentes', 8, 4, {
      param(st, k, v, src) { if (k === 'texture.type' && src === 'user') distinct(st, v); },
    }),
    C('e.salles', ['e.salle'], 'Écoute les 3 salles', 8, 3, {
      param(st, k, v, src) { if (k === 'fx.revType' && src === 'user') distinct(st, v); },
    }),
    C('e.echo', ['e.echo'], 'Change la vitesse de l\'écho 3 fois pendant la lecture', 8, 3, {
      param(st, k, v, src) { if (k === 'fx.echoTime' && src === 'user' && playing()) st.n = (st.n || 0) + 1; },
    }),
    C('e.halo', ['e.halo'], 'Laisse le Halo au-dessus de 75 pendant 2 mesures', 8, 2, {
      bar(st) { if (store.get('fx.shimmer') > 0.75) st.n = (st.n || 0) + 1; else st.n = 0; },
    }),
    C('e.vieux', ['e.tape', 'e.lofi'], 'Pousse Cassette et Usure au-dessus de 50 en même temps', 10, 1, {
      param(st, k) { if ((k === 'fx.tape' || k === 'fx.lofi') && store.get('fx.tape') > 0.5 && store.get('fx.lofi') > 0.5) st.n = 1; },
    }),

    // Mouvement
    C('m.notes', ['m.bells'], 'Joue 8 notes au clavier (A à L) pendant la lecture', 6, 8, {
      note(st) { if (playing()) st.n = (st.n || 0) + 1; },
    }),
    C('m.densite', ['m.bells'], 'Rends la mélodie très clairsemée, puis très dense', 6, 2, {
      param(st, k, v, src) { if (k !== 'bells.density' || src !== 'user') return; if (v < 0.1) st.n = Math.max(st.n || 0, 1); else if (v > 0.8 && st.n === 1) st.n = 2; },
    }),
    C('m.libre', ['m.tempo'], 'Passe le Rythme en Flottant, puis reviens en Pulsé', 6, 2, {
      param(st, k, v, src) { if (k !== 'global.time' || src !== 'user') return; if (v === 'Flottant') st.n = Math.max(st.n || 0, 1); else if (st.n === 1) st.n = 2; },
    }),
    C('m.phrase', ['m.phrase'], 'Mets la mélodie en mode Phrase et écoute-la tourner 2 fois', 8, 3, {
      param(st, k, v, src) { if (k === 'bells.mode' && src === 'user' && v === 'Phrase') st.n = Math.max(st.n || 0, 1); },
      phrase(st) { if (st.n >= 1 && store.get('bells.mode') === 'Phrase') st.n += 1; },
    }),
    C('m.derive', ['m.evolve'], 'Monte la Dérive au-delà de 50 et laisse-la travailler 4 mesures', 8, 4, {
      bar(st) { if (store.get('global.evolve') > 0.5) st.n = (st.n || 0) + 1; else st.n = 0; },
    }),
    C('m.grains', ['m.grains'], 'Essaie les 3 réglages de Hauteurs des grains', 8, 3, {
      param(st, k, v, src) { if (k === 'grains.pitch' && src === 'user') distinct(st, v); },
    }),
    C('m.figer', ['m.grains2'], 'Fige le son 2 fois (❄ ou touche Entrée)', 10, 2, {
      act(st, id) { if (id === 'freeze') st.n = (st.n || 0) + 1; },
    }),
    C('m.lfo', ['m.lfo'], 'Fais bouger deux réglages différents avec les 2 mouvements lents', 10, 1, {
      param(st, k) {
        if (!k.startsWith('mod.')) return;
        const a = store.get('mod.l1target'), b = store.get('mod.l2target');
        if (a !== '—' && b !== '—' && a !== b && store.get('mod.l1depth') > 0.1 && store.get('mod.l2depth') > 0.1) st.n = 1;
      },
    }),
    C('m.scenes', ['m.scenes'], 'Mémorise deux scènes, puis rappelle-les l\'une après l\'autre', 12, 4, {
      act(st, id) {
        if (id === 'sceneStore' && (st.n || 0) < 2 && gesture(st, 'store', 300)) st.n = (st.n || 0) + 1;
        else if (id === 'sceneRecall' && st.n >= 2 && gesture(st, 'recall', 300)) st.n += 1;
      },
    }, 'Maj+clic sur A ou B pour mémoriser'),

    // Composer
    C('c.dessin', ['c.seq'], 'Dessine 8 notes dans le piano roll', 8, 8, {
      param(st, k, v, src) { if (/^seq\.pat/.test(k) && src === 'user' && gesture(st, 'pat', 120)) st.n = (st.n || 0) + 1; },
    }),
    C('c.arp', ['c.arp'], 'Passe la mélodie écrite en Arpège et essaie 3 sens', 8, 4, {
      param(st, k, v, src) {
        if (src !== 'user') return;
        if (k === 'seq.mode' && v === 'Arpège') st.on = 1;
        if (k === 'seq.arpDir' && st.on) { st.seen = st.seen || []; if (!st.seen.includes(v)) st.seen.push(v); }
        st.n = (st.on || 0) + (st.seen ? st.seen.length : 0);
      },
    }),
    C('c.chaine', ['c.motifs'], 'Écris une chaîne qui enchaîne au moins deux motifs (ex. « A A B »)', 10, 1, {
      param(st, k, v, src) { if (k === 'seq.chain' && src === 'user' && new Set(String(v).toUpperCase().match(/[ABCD]/g) || []).size >= 2) st.n = 1; },
    }),
    C('c.reclive', ['c.motifs'], 'Enregistre 4 notes en Rec live', 10, 4, {
      note(st) { const r = AMB.pianoRoll && AMB.pianoRoll.roll; if (r && r.recording) st.n = (st.n || 0) + 1; },
    }),
    C('c.basse', ['c.bass'], 'Modifie 6 fois la grille de basse', 8, 6, {
      param(st, k, v, src) { if (k === 'bass.pattern' && src === 'user' && gesture(st, k, 150)) st.n = (st.n || 0) + 1; },
    }),
    C('c.pulses', ['c.perc'], 'Modifie 6 fois la grille des pulsations', 8, 6, {
      param(st, k, v, src) { if (k === 'perc.pattern' && src === 'user' && gesture(st, k, 150)) st.n = (st.n || 0) + 1; },
    }),
    C('c.swing', ['c.groove'], 'Garde un swing au-dessus de 40 pendant 2 mesures', 8, 2, {
      bar(st) { if (store.get('global.swing') > 0.4) st.n = (st.n || 0) + 1; else st.n = 0; },
    }),
    C('c.export', ['c.midi'], 'Exporte ton morceau en fichier MIDI', 8, 1, {
      act(st, id) { if (id === 'midiExport') st.n = 1; },
    }),
    C('c.courbe', ['c.auto'], 'Dessine une courbe d\'automation et laisse-la jouer 4 mesures', 10, 4, {
      param(st, k, v, src) { if (k === 'auto.curve' && src === 'user') st.drawn = 1; },
      bar(st) { if (st.drawn && store.get('auto.on')) st.n = (st.n || 0) + 1; },
    }),
    C('c.morceau', ['c.song'], 'Crée 3 sections, puis joue le morceau', 15, 4, {
      act(st, id) {
        if (id === 'section' && (st.n || 0) < 3) st.n = (st.n || 0) + 1;
        else if (id === 'song' && st.n >= 3) st.n = 4;
      },
    }),
  ];
  const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));

  const contracts = {
    DEFS, byId,
    state(g = AMB.game) { g.s.active = g.s.active || []; g.s.prog = g.s.prog || {}; g.s.skipped = g.s.skipped || []; return g.s; },
    eligible(d, g = AMB.game) { return !g.s.contracts.includes(d.id) && d.need.every((n) => g.has(n)); },
    // keep three active contracts, in definition order
    refill(g = AMB.game) {
      if (!g.path) return;
      const s = this.state(g);
      s.active = s.active.filter((id) => byId[id] && !g.s.contracts.includes(id));
      const skipped = s.skipped || [];
      const order = DEFS.filter((d) => !skipped.includes(d.id)).concat(skipped.map((id) => byId[id]).filter(Boolean));
      for (const d of order) {
        if (s.active.length >= ACTIVE) break;
        if (!s.active.includes(d.id) && this.eligible(d, g)) { s.active.push(d.id); s.prog[d.id] = s.prog[d.id] || { n: 0 }; }
      }
      g.save(); g.emit('contract', { active: s.active.slice() });
    },
    progress(id, g = AMB.game) { const st = this.state(g).prog[id]; return Math.min(byId[id].goal, (st && st.n) || 0); },
    // route an event to every active contract; complete those that reach their goal
    dispatch(ev, ...args) {
      const g = AMB.game; if (!g.path) return;
      if (AMB.puzzles && AMB.puzzles.ab) return; // hearing a puzzle's target is not doing it
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
    AMB.bus.on('section', (x) => contracts.dispatch('section', x));
    ['unlock', 'mode', 'reset'].forEach((e) => AMB.bus.on('game:' + e, () => contracts.refill()));
  }
  // bar lines while playing (the sequencer counts 16th steps)
  let lastBar = -1;
  setInterval(() => {
    if (!playing()) { lastBar = -1; return; }
    const bar = Math.floor((AMB.seq.step || 0) / 16);
    if (bar !== lastBar) { if (lastBar >= 0) contracts.dispatch('bar', bar); lastBar = bar; }
  }, 250);

  AMB.contracts = contracts;
  contracts.refill();
})();
