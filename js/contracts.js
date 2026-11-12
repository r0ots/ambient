// « Jardin sonore » : usage contracts — small, checkable goals ("change the drone colour 3 times
// while it plays"). Three are active at a time, drawn at random (seeded) among those whose nodes are owned.
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

  // contract: { id, need: [node ids], title, hint, reward, goal, on: { param|act|chord|note(st, …) } }
  const C = (id, need, title, reward, goal, on, hint) => ({ id, need, title, reward, goal, on, hint: hint || '' });
  const DEFS = [
    // Tronc
    C('k.couleur', ['racine'], 'Fais varier la couleur du drone 3 fois pendant qu\'il joue', 7, 3, {
      param(st, k, v, src) { if (k === 'drone.tone' && src === 'user' && playing() && gesture(st, k)) st.n = (st.n || 0) + 1; },
    }, 'Lecture, puis Sculpter > Drone > Couleur'),
    C('k.souffle', ['racine'], 'Coupe le drone puis rallume-le, sans arrêter la lecture', 7, 2, {
      param(st, k, v, src) {
        if (k !== 'drone.on' || src !== 'user' || !playing()) return;
        if (!v) st.n = 1; else if (st.n === 1) st.n = 2;
      },
    }),
    C('k.timbres', ['t.son'], 'Écoute les 4 timbres du drone', 10, 4, {
      param(st, k, v, src) { if (k === 'drone.wave' && src === 'user') distinct(st, v); },
    }),
    C('k.ecran', ['t.viz'], 'Passe par les 3 visuels de l\'écran', 6, 3, {
      act(st, id) { if (id === 'viz') st.n = (st.n || 0) + 1; },
    }, 'Bouton en haut à droite de l\'écran'),
    C('k.moments', ['t.journal'], 'Garde un moment (♥), puis reviens à un moment passé', 10, 2, {
      act(st, id) { if (id === 'keep') st.n = Math.max(st.n || 0, 1); else if (id === 'restore' && st.n === 1) st.n = 2; },
    }, 'Sculpter > Journal'),
    C('k.enreg', ['t.rec'], 'Enregistre au moins 30 secondes', 12, 1, {
      rec(st, secs) { if (secs >= 30) st.n = 1; }, // real duration of the finished recording
    }, '● Rec, puis ● Rec à nouveau pour arrêter (ou une durée fixe)'),
    C('k.xy', ['t.macros'], 'Glisse 4 fois sur l\'écran (lève le doigt entre chaque glissé)', 10, 4, {
      act(st, id) { if (id === 'xy' && gesture(st, 'xy', 700)) st.n = (st.n || 0) + 1; },
    }),
    C('k.paysages', ['t.dice', 't.journal'], 'Génère 3 paysages, puis garde celui qui te plaît', 12, 4, {
      act(st, id) {
        if (id === 'dice' && (st.n || 0) < 3) st.n = (st.n || 0) + 1;
        else if ((id === 'keep' || id === 'save') && st.n >= 3) st.n = 4;
      },
    }),

    // Harmonie
    C('h.forcer', ['h.pad'], 'Force 3 accords au clavier (touches Z à M)', 7, 3, {
      act(st, id) { if (id === 'chord' && gesture(st, 'chord', 600)) st.n = (st.n || 0) + 1; },
    }),
    C('h.ombre', ['h.pad'], 'Rends le Pad très sombre, puis très brillant', 7, 2, {
      param(st, k, v, src) { if (k !== 'pad.tone' || src !== 'user') return; if (v < 0.15) st.n = Math.max(st.n || 0, 1); else if (v > 0.85 && st.n === 1) st.n = 2; },
    }),
    C('h.suivre', ['h.drone'], 'Fais suivre les accords au drone, puis force un accord', 7, 2, {
      param(st, k, v, src) { if (k === 'drone.follow' && src === 'user' && v) st.n = Math.max(st.n || 0, 1); },
      act(st, id) { if (id === 'chord' && st.n === 1 && store.get('drone.follow')) st.n = 2; },
    }),
    C('h.riches', ['h.pad2'], 'Mets « Accords riches » au-dessus de 90, puis sous 10', 10, 2, {
      param(st, k, v, src) { if (k !== 'pad.voicing' || src !== 'user') return; if (v > 0.9) st.n = Math.max(st.n || 0, 1); else if (v < 0.1 && st.n === 1) st.n = 2; },
    }, 'Accords riches : de très remplis (haut) à très simples (bas)'),
    C('h.tonalite', ['h.key'], 'Change 3 fois de tonalité pendant la lecture', 10, 3, {
      param(st, k, v, src) { if (k === 'global.key' && src === 'user' && playing()) distinct(st, v); },
    }),
    C('h.gammes', ['h.scale'], 'Essaie 4 gammes différentes', 12, 4, {
      param(st, k, v, src) { if (k === 'global.scale' && src === 'user') distinct(st, v); },
    }),
    C('h.ecrire', ['h.prog'], 'Écris une progression de 4 accords et écoute-la', 14, 2, {
      param(st, k, v, src) {
        if (k === 'pad.custom' && src === 'user' && String(v).trim().split(/\s+/).filter(Boolean).length >= 4) st.n = Math.max(st.n || 0, 1);
      },
      chord(st) { if (st.n === 1 && store.get('pad.prog') === 'Perso') st.n = 2; },
    }, 'Composer > Progression'),

    // Espace
    C('e.extremes', ['e.reverb'], 'Mets la reverb au minimum, puis au maximum', 7, 2, {
      param(st, k, v, src) { if (k !== 'fx.space' || src !== 'user') return; if (v < 0.1) st.n = Math.max(st.n || 0, 1); else if (v > 0.9 && st.n === 1) st.n = 2; },
    }),
    C('e.envois', ['e.reverb'], 'Règle l\'espace de 3 couches différentes', 7, 3, {
      param(st, k, v, src) { if (k.endsWith('.send') && src === 'user') distinct(st, k); },
    }, 'Le réglage « Espace » de chaque couche'),
    C('e.textures', ['e.texture'], 'Écoute 4 textures différentes', 10, 4, {
      param(st, k, v, src) { if (k === 'texture.type' && src === 'user') distinct(st, v); },
    }),
    C('e.salles', ['e.salle'], 'Écoute les 3 salles', 10, 3, {
      param(st, k, v, src) { if (k === 'fx.revType' && src === 'user') distinct(st, v); },
    }),
    C('e.echo', ['e.echo'], 'Change la vitesse de l\'écho 3 fois pendant la lecture', 10, 3, {
      param(st, k, v, src) { if (k === 'fx.echoTime' && src === 'user' && playing()) st.n = (st.n || 0) + 1; },
    }),
    C('e.halo', ['e.halo'], 'Monte le Halo au-dessus de 75, puis redescends-le sous 25', 10, 2, {
      param(st, k, v, src) { if (k !== 'fx.shimmer' || src !== 'user') return; if (v > 0.75) st.n = Math.max(st.n || 0, 1); else if (v < 0.25 && st.n === 1) st.n = 2; },
    }, 'Réglages > Espace > Halo : tout en haut, puis tout en bas'),
    C('e.vieux', ['e.tape', 'e.lofi'], 'Pousse Cassette et Usure au-dessus de 50 en même temps', 12, 1, {
      param(st, k) { if ((k === 'fx.tape' || k === 'fx.lofi') && store.get('fx.tape') > 0.5 && store.get('fx.lofi') > 0.5) st.n = 1; },
    }),

    // Mouvement
    C('m.notes', ['m.bells'], 'Joue 8 notes au clavier (A à L) pendant la lecture', 7, 8, {
      note(st) { if (playing()) st.n = (st.n || 0) + 1; },
    }),
    C('m.densite', ['m.bells'], 'Rends la mélodie très clairsemée, puis très dense', 7, 2, {
      param(st, k, v, src) { if (k !== 'bells.density' || src !== 'user') return; if (v < 0.1) st.n = Math.max(st.n || 0, 1); else if (v > 0.8 && st.n === 1) st.n = 2; },
    }),
    C('m.libre', ['m.tempo'], 'Passe le Rythme en Flottant, puis reviens en Pulsé', 7, 2, {
      param(st, k, v, src) { if (k !== 'global.time' || src !== 'user') return; if (v === 'Flottant') st.n = Math.max(st.n || 0, 1); else if (st.n === 1) st.n = 2; },
    }),
    C('m.phrase', ['m.phrase'], 'Mets la mélodie en mode Phrase et écoute-la tourner 2 fois', 10, 2, {
      param(st, k, v, src) { if (k === 'bells.mode' && src === 'user' && v === 'Phrase') st.on = 1; else if (k === 'bells.mode' && v !== 'Phrase') st.on = 0; },
      phrase(st) { if (st.on && store.get('bells.mode') === 'Phrase') st.n = (st.n || 0) + 1; },
    }),
    C('m.derive', ['m.evolve'], 'Monte la Dérive au-dessus de 75, puis ramène-la sous 25', 10, 2, {
      param(st, k, v, src) { if (k !== 'global.evolve' || src !== 'user') return; if (v > 0.75) st.n = Math.max(st.n || 0, 1); else if (v < 0.25 && st.n === 1) st.n = 2; },
    }, 'La Dérive fait bouger les réglages toute seule : tout en haut, puis tout en bas'),
    C('m.grains', ['m.grains'], 'Essaie les 3 réglages de Hauteurs des grains', 10, 3, {
      param(st, k, v, src) { if (k === 'grains.pitch' && src === 'user') distinct(st, v); },
    }),
    C('m.figer', ['m.grains2'], 'Fige le son 2 fois (❄ ou touche Entrée)', 12, 2, {
      act(st, id) { if (id === 'freeze') st.n = (st.n || 0) + 1; },
    }),
    C('m.lfo', ['m.lfo'], 'Fais bouger deux réglages différents avec les 2 mouvements lents', 12, 1, {
      param(st, k) {
        if (!k.startsWith('mod.')) return;
        const a = store.get('mod.l1target'), b = store.get('mod.l2target');
        if (a !== '—' && b !== '—' && a !== b && store.get('mod.l1depth') > 0.1 && store.get('mod.l2depth') > 0.1) st.n = 1;
      },
    }),
    C('m.scenes', ['m.scenes'], 'Mémorise deux scènes, puis rappelle-les l\'une après l\'autre', 14, 4, {
      act(st, id) {
        if (id === 'sceneStore' && (st.n || 0) < 2 && gesture(st, 'store', 300)) st.n = (st.n || 0) + 1;
        else if (id === 'sceneRecall' && st.n >= 2 && gesture(st, 'recall', 300)) st.n += 1;
      },
    }, 'Maj+clic sur A ou B pour mémoriser'),

    // Composer
    C('c.dessin', ['c.seq'], 'Dessine 8 notes dans le piano roll', 10, 8, {
      param(st, k, v, src) { if (/^seq\.pat/.test(k) && src === 'user' && gesture(st, 'pat', 120)) st.n = (st.n || 0) + 1; },
    }),
    C('c.arp', ['c.arp'], 'Passe la mélodie écrite en Arpège et essaie 3 sens', 10, 4, {
      param(st, k, v, src) {
        if (src !== 'user') return;
        if (k === 'seq.mode' && v === 'Arpège') st.on = 1;
        if (k === 'seq.arpDir' && st.on) { st.seen = st.seen || []; if (!st.seen.includes(v)) st.seen.push(v); }
        st.n = (st.on || 0) + (st.seen ? st.seen.length : 0);
      },
    }),
    C('c.chaine', ['c.motifs'], 'Écris une chaîne qui enchaîne au moins deux motifs (ex. « A A B »)', 12, 1, {
      param(st, k, v, src) { if (k === 'seq.chain' && src === 'user' && new Set(String(v).toUpperCase().match(/[ABCD]/g) || []).size >= 2) st.n = 1; },
    }),
    C('c.reclive', ['c.motifs'], 'Enregistre 4 notes en Rec live', 12, 4, {
      note(st) { const r = AMB.pianoRoll && AMB.pianoRoll.roll; if (r && r.recording) st.n = (st.n || 0) + 1; },
    }),
    C('c.basse', ['c.bass'], 'Modifie 6 fois la grille de basse', 10, 6, {
      param(st, k, v, src) { if (k === 'bass.pattern' && src === 'user' && gesture(st, k, 150)) st.n = (st.n || 0) + 1; },
    }),
    C('c.pulses', ['c.perc'], 'Modifie 6 fois la grille des pulsations', 10, 6, {
      param(st, k, v, src) { if (k === 'perc.pattern' && src === 'user' && gesture(st, k, 150)) st.n = (st.n || 0) + 1; },
    }),
    C('c.swing', ['c.groove'], 'Mets le swing au-dessus de 60, puis ramène-le sous 10', 10, 2, {
      param(st, k, v, src) { if (k !== 'global.swing' || src !== 'user') return; if (v > 0.6) st.n = Math.max(st.n || 0, 1); else if (v < 0.1 && st.n === 1) st.n = 2; },
    }, 'Le swing donne un côté chaloupé : beaucoup, puis presque plus du tout'),
    C('c.export', ['c.midi'], 'Exporte ton morceau en fichier MIDI', 10, 1, {
      act(st, id) { if (id === 'midiExport') st.n = 1; },
    }),
    C('c.courbe', ['c.auto'], 'Dessine une courbe avec un vrai creux et un vrai sommet', 12, 1, {
      param(st, k, v, src) {
        if (k !== 'auto.curve' || src !== 'user') return;
        const pts = String(v).split('').map((c) => parseInt(c, 36)).filter((x) => x >= 0);
        if (pts.length && Math.max(...pts) - Math.min(...pts) >= 18) st.n = 1; // spread of at least ~50 out of 100
      },
    }, 'Composer > Automation : dessine avec le doigt, haut puis bas'),
    C('c.morceau', ['c.song'], 'Crée 3 sections, puis joue le morceau', 18, 4, {
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
      const g = AMB.game; if (!g.freePlay()) return; // free mode or a puzzle's target: nothing counts
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
