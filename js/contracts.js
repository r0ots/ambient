// « Jardin sonore » : objectives (« défis » in the code) — musical goals ("play 16 notes", "force 6 chords", "let 8 bars
// play with the Pad", "play for a minute") and gates opened by a « Réponse » (answer a phrase marked in the music,
// js/puzzles.js). S11.1: a piece (node of the tree) asks for 2 or 3 objectives (table OPENS below: node → list), all
// shown together in the Objectifs widget (garden.js); the piece is READY once they are all done, and only the Arbre
// opens it. One piece at a time, in the order of OPENS among those that can be reached now; ↷ puts the piece back at the
// end of the queue. Judged on usage only, never on taste. Progress lives in game.s.prog, completion in game.s.contracts,
// the history the widget shows in game.s.log.
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
  // a single gesture on a control (S5.5 they were « asked in the music » with a countdown; S11.5 plain objectives again):
  // counted when it happens during playback. `a` = { param (key, 'macro.*'), v (test of the value), src (sources that
  // count, 'user' by default) } or { act (a bus action) }
  const keyIs = (p, k) => p === k || (p.endsWith('*') && k.startsWith(p.slice(0, -1)));
  const Dm = (id, need, title, a, hint) => Object.assign(C(id, need, title, 1, a.act
    ? { act(st, x) { if (x === a.act && playing()) st.n = 1; } }
    : { param(st, k, v, src) { if (keyIs(a.param, k) && (a.src || ['user']).includes(src) && (!a.v || a.v(v)) && playing()) st.n = 1; } }, hint), { gesture: true });
  // S11.1 generic objectives, parametrised (musical: play, listen, let it play — never « turn this knob to min then max »)
  const on = (l) => !!store.get(l + '.on');
  const NOTES = '{Les touches de couleur sous l\'écran, les lettres A à L (Q à P une octave au-dessus) ou ton clavier MIDI : joue ce que tu veux, chaque note compte.|Les touches de couleur sous l\'écran : joue ce que tu veux, chaque note compte.}';
  // n notes played (when(): only while it holds)
  const Nn = (id, need, n, title, when, hint) => C(id, need, title || `Joue ${n} notes`, n, { note(st) { if (!when || when()) st.n = (st.n || 0) + 1; } }, hint || NOTES);
  // `secs` seconds of playing: the time between two notes counts while no silence is longer than 4 s
  const Tm = (id, need, secs, title, hint) => Object.assign(C(id, need, title, secs, {
    note(st, n) { const t = n && n.time != null ? n.time : 0; if (st.p != null && t > st.p && t - st.p <= 4) { st.t = (st.t || 0) + t - st.p; st.n = Math.min(secs, Math.floor(st.t)); } st.p = t; },
  }, hint || 'Joue des notes sans t\'arrêter (jamais plus de 4 secondes de silence) : le temps compte tant que tu joues, à ton rythme.'), { unit: 's' });
  // `bars` bars of playback while when() holds: the player sets the sound, then listens (sequencer bar lines: onStep)
  const Br = (id, need, bars, title, when, hint) => Object.assign(C(id, need, title, bars, {
    bar(st) { if (playing() && (!when || when())) st.n = (st.n || 0) + 1; },
  }, hint), { unit: 'mes.' });
  // n chords forced by the player (Z–M, a finger held on a key, low MIDI notes)
  const CHORDS = '{Pendant la lecture, les lettres Z à M jouent les accords ; au doigt, garde une touche appuyée (au clavier MIDI : les notes graves).|Pendant la lecture, garde le doigt appuyé sur une touche : elle joue tout un accord.}';
  const Ch = (id, need, n, title, when) => C(id, need, title || `Joue ${n} accords`, n, {
    act(st, a) { if (a === 'chord' && gesture(st, 'chord', 600) && (!when || when())) st.n = (st.n || 0) + 1; },
  }, CHORDS);
  const ON1 = 'Pendant la lecture : ', BY = ON1; // a gesture counts while the music plays
  const DEFS = [
    // Tronc
    // S11.1: the machine starts asleep with the drone alone; the first gesture is to switch it on (the power button,
    // Space or Entrée: garden.coin → act 'wake'); then the drone and listening, the Mélodie auto, and only then the Piano
    C('k.allume', ['racine'], 'Allume la machine', 1, { act(st, a) { if (a === 'wake') st.n = 1; } },
      '{Le bouton ⏻ du Drone clignote, à droite dans son panneau (ou la barre d\'espace, ou Entrée) : la machine se réveille.|Touche le bouton ⏻ du Drone qui clignote, dans son panneau : la machine se réveille.}'),
    C('k.drone', ['racine'], 'Change la Lumière du drone pendant qu\'il joue', 1, {
      param(st, k, v, src) { if (k === 'drone.tone' && (src === 'user' || src === 'cc') && playing()) st.n = 1; },
    }, 'Sculpter > Drone > Lumière{ (ou le bouton CC74 de ton clavier MIDI)|}, pendant la lecture : le son s\'ouvre et se ferme.'),
    Br('k.ecoute', ['racine'], 8, 'Laisse jouer 8 mesures avec le drone', () => on('drone'), 'Pendant la lecture, laisse le drone tenir sa note : chaque mesure compte. Écoute-le respirer.'),
    Br('v.regarde', ['racine'], 28, 'Regarde la ville : laisse jouer 28 mesures', null, 'Lance la lecture et laisse tourner : chaque mesure compte. Regarde la ville réagir à la musique.'),
    Dm('k.couleur', ['racine'], 'Tourne la Lumière du drone', { how: 'hit', param: 'drone.tone', src: ['user', 'cc'] },
      ON1 + 'Sculpter > Drone > Lumière{ (ou le bouton CC74 de ton clavier MIDI)|} : le son s\'ouvre et se ferme.'),
    Dm('k.timbre', ['t.son'], 'Change le son du drone', { how: 'hit', param: 'drone.wave' },
      ON1 + 'Sculpter > Drone > Timbre : choisis-en un autre.'),
    Dm('k.moments', ['t.journal'], 'Garde un moment (♥)', { how: 'hit', act: 'keep' },
      ON1 + 'Sculpter > Journal : ♥ garde le son de l\'instant ; plus tard, un clic sur un moment passé le fait revenir.'),
    C('k.enreg', ['t.rec'], 'Enregistre au moins 45 secondes', 1, {
      rec(st, secs) { if (secs >= 45) st.n = 1; }, // real duration of the finished recording
    }, '● Rec, joue au moins 45 s, puis ● Rec à nouveau pour arrêter (ou choisis une durée fixe dans ▾).'),
    Dm('k.macros', ['t.macros'], 'Tourne un grand réglage', { how: 'by', param: 'macro.*', src: ['user', 'sync'] },
      BY + 'Sculpter > Grands réglages : Lumière, Densité, Espace, Nostalgie ou Nature.'),

    // Harmonie
    C('h.forcer', ['h.pad'], 'Joue 6 accords ({Z à M, ou garde le doigt sur une touche|garde le doigt sur une touche})', 6, {
      act(st, id) { if (id === 'chord' && gesture(st, 'chord', 600)) st.n = (st.n || 0) + 1; },
    }, '{Pendant la lecture, les lettres Z, X, C, V, B, N, M jouent les accords I à VII ; au doigt, garde une touche appuyée : elle joue tout son accord (au clavier MIDI : les notes graves).|Pendant la lecture, garde le doigt appuyé sur une touche : elle joue tout un accord.}'),
    Dm('h.son', ['h.pad'], 'Change le son du Pad', { how: 'hit', param: 'pad.wave' },
      ON1 + 'Sculpter > Pad > Timbre : choisis-en un autre.'),
    Dm('h.suivre', ['h.drone'], 'Fais suivre les accords au drone', { how: 'hit', param: 'drone.follow', v: (v) => !!v },
      ON1 + 'Sculpter > Drone > Suit accords : écoute ensuite le drone changer de note avec les accords.'),
    Dm('h.tonalite', ['h.key'], 'Change de tonalité', { how: 'hit', param: 'global.key' },
      ON1 + 'Sculpter > Global > Tonalité : tout le paysage monte ou descend.'),

    // Effets
    Dm('e.resonne', ['e.reverb'], 'Ouvre l\'espace : Reverb au-dessus de 60', { how: 'by', param: 'fx.space', v: (v) => v >= 0.6 },
      BY + 'Sculpter > Effets > Reverb au-dessus de 60 : les notes résonnent plus longtemps.'),
    C('m.respire', ['e.reverb', 'm.bells'], 'Laisse respirer : 4 notes, une seconde et demie entre chacune', 4, run((p, n) => n.time - p.time >= 1.5 && n.time - p.time <= 6),
      'Joue une note, laisse-la s\'éteindre dans l\'espace (au moins une seconde et demie), puis la suivante : quatre fois.'),
    Dm('e.noyer', ['e.reverb', 'h.pad'], 'Éloigne le Pad : Distance au-dessus de 70', { how: 'by', param: 'pad.send', v: (v) => v >= 0.7 },
      BY + 'Sculpter > Pad > Distance au-dessus de 70 : ses accords flottent dans la salle.'),
    Dm('e.grande', ['e.salle'], 'Agrandis la salle : Taille au-dessus de 80', { how: 'by', param: 'fx.size', v: (v) => v >= 0.8 },
      BY + 'Sculpter > Effets > Taille au-dessus de 80.'),
    C('e.echo', ['e.echo', 'm.bells'], 'Joue 12 notes dans l\'écho', 12, {
      note(st) { if (store.get('fx.echo') >= 0.4) st.n = (st.n || 0) + 1; },
    }, 'Monte l\'Écho au-dessus de 40 (Sculpter > Effets), puis joue des notes (touches à l\'écran{, A à L ou MIDI|}) et écoute-les se répéter.'),

    // Mouvement
    C('m.notes', ['m.bells'], 'Joue 24 notes (touches à l\'écran{, A à L ou MIDI|})', 24, {
      note(st) { st.n = (st.n || 0) + 1; },
    }, '{Les touches de couleur sous l\'écran ou les lettres A à L jouent la gamme (Q à P une octave au-dessus), ou ton clavier MIDI.|Les touches de couleur sous l\'écran jouent la gamme : appuie dessus une par une.}'),
    C('m.monte', ['m.bells'], 'Joue 5 notes qui montent', 5, run((p, n) => n.midi > p.midi),
      'Cinq notes de suite, chacune plus aiguë que la précédente : des touches violettes (les plus graves) vers les orange (les plus aiguës){, ou A, S, D, F|}.'),
    C('m.descend', ['m.bells'], 'Joue 5 notes qui descendent', 5, run((p, n) => n.midi < p.midi),
      'Cinq notes de suite, chacune plus grave que la précédente : des touches orange (les plus aiguës) vers les violettes (les plus graves){, ou L, K, J, H|}.'),
    C('m.pas', ['m.bells'], 'Marche : 8 notes régulières, comme des pas', 8, {
      note(st, n) { // each gap 0.25–1.5 s and within a quarter of the previous one: a steady walk
        const g = st.p ? n.time - st.p.time : null, fine = g != null && g >= 0.25 && g <= 1.5;
        st.n = fine && (!st.g || Math.abs(g - st.g) <= st.g * 0.25) ? (st.n || 1) + 1 : fine ? 2 : 1;
        st.g = fine ? g : null; st.p = { time: n.time };
      },
    }, 'Huit notes à intervalles égaux, comme des pas tranquilles (ni trop vite ni trop lent) : c\'est un tempo.'),
    Dm('m.ralenti', ['m.tempo'], 'Ralentis sous 60 bpm', { how: 'by', param: 'global.tempo', v: (v) => v < 60 },
      BY + 'Sculpter > Global > Tempo sous 60 : tout le paysage ralentit.'),
    Dm('m.phrase', ['m.phrase'], 'Passe la Mélodie auto en Phrase', { how: 'hit', param: 'bells.mode', v: (v) => v === 'Phrase' },
      ON1 + 'Sculpter > Mélodie auto > Jeu : Phrase. Le motif se répète et varie un peu à chaque tour.'),
    Dm('m.nuage', ['m.grains'], 'Épaissis les grains : Densité au-dessus de 60', { how: 'by', param: 'grains.density', src: ['user', 'macro', 'cc'], v: (v) => v >= 0.6 },
      BY + 'Sculpter > Grains > Densité au-dessus de 60 (ou Sculpter > Grands réglages > Densité{, ou la molette de modulation MIDI|}).'),
    Dm('m.figer', ['m.grains2'], 'Fige le son (❄{ ou Entrée|})', { how: 'hit', act: 'freeze' },
      ON1 + '❄ Figer{ (ou Entrée)|} capture les 4 dernières secondes : les grains les rejouent.'),

    // Composer (S3.5: played, not drawn — the notes, the groove and the song come from playing them)
    C('c.reclive', ['c.seq'], 'Enregistre 12 notes en Rec live', 12, {
      note(st) { const r = AMB.pianoRoll && AMB.pianoRoll.roll; if (r && r.recording) st.n = (st.n || 0) + 1; },
    }, 'Composer > Mélodie écrite > ● Rec live, puis joue sur les touches{ (à l\'écran, A à L ou MIDI)|} : tes notes s\'écrivent dans le piano roll.'),
    C('c.groove', ['c.rythme'], 'Change ta ligne de basse, puis laisse-la jouer 8 mesures', 8, {
      param(st, k, v, src) { if (k === 'bass.pattern' && src === 'user') st.on = 1; },
      bass(st) { // one count per bar where the bass plays, once the player has made the line his own
        const S = AMB.seq; if (!st.on || !playing() || !S) return;
        const bar = Math.floor((S.step - (S.origin || 0)) / 16);
        if (bar !== st.bar) { st.bar = bar; st.n = (st.n || 0) + 1; }
      },
    }, 'Composer > Basse : allume ou éteins des cases de la grille, puis laisse jouer 8 mesures.'),
    // the path's last challenge (`first`): proposed once the whole tree is open (S5.7); it opens no node, it ends the path
    // S6.7: the bar's ● Rec counts too (a child could not find Composer > Morceau > + Section ×2 > ● Rec): a take of 3 s
    // or more, stopped by ■; rec.js then hands its WAV to the finale instead of downloading it
    C('c.morceau', ['c.song'], 'Enregistre ton morceau', 1, {
      act(st, id) { if (id === 'songRec') st.n = 1; },
      rec(st, secs) { if (secs >= 3) st.n = 1; },
    }, '{● Rec en haut, joue un moment, puis ■ : ton morceau est gardé. Ou Composer > Morceau > ● Rec : tes sections, du début à la fin.|Touche ● Rec en haut, joue un peu, puis touche ■ pour arrêter.}'),

    // S11.1 the second and third objectives of each piece (generic, above)
    Nn('k.notes', ['k.piano'], 32),
    Br('m.ecoute', ['m.bells'], 20, 'Laisse jouer 20 mesures avec la Mélodie auto', () => on('bells'), 'Pendant la lecture, laisse la Mélodie auto improviser (Sculpter > Mélodie auto > On) : chaque mesure compte. Tu peux jouer par-dessus.'),
    Tm('k.minute', ['k.piano'], 150, 'Joue pendant 2 minutes et demie'),
    Br('h.ecoute', ['h.pad'], 20, 'Laisse jouer 20 mesures avec le Pad', () => on('pad'), 'Pendant la lecture, laisse les accords du Pad tourner (Sculpter > Pad > On) : chaque mesure compte.'),
    Br('t.ecoute', ['racine'], 20, 'Écoute 20 mesures sans t\'arrêter', null, 'Lance la lecture et laisse tourner : chaque mesure compte. Regarde la ville réagir.'),
    Nn('h.chant', ['h.pad'], 32, 'Joue 32 notes sur les accords du Pad', () => on('pad')),
    Tm('t.joue', ['k.piano'], 180, 'Joue pendant 3 minutes'),
    Nn('m.notes2', ['m.bells'], 56),
    Br('m.phrase8', ['m.bells'], 28, 'Laisse jouer 28 mesures avec la Mélodie auto', () => on('bells'), 'Pendant la lecture, laisse la Mélodie auto improviser : écoute ce qui revient d\'une mesure à l\'autre.'),
    Ch('h.accords', ['h.pad'], 14),
    Br('h.tient', ['h.pad'], 28, 'Laisse jouer 28 mesures avec le Pad', () => on('pad'), 'Pendant la lecture, laisse les accords du Pad tourner : chaque mesure compte.'),
    Tm('t.deux', ['t.son'], 210, 'Joue pendant 3 minutes et demie'),
    Nn('e.loin', ['e.reverb'], 40, 'Joue 40 notes avec la Reverb au-dessus de 65', () => store.get('fx.space') >= 0.65,
      '{Sculpter > Effets > Reverb au-dessus de 65, puis joue (touches à l\'écran, A à L ou MIDI) : chaque note résonne.|Sculpter > Effets > Reverb au-dessus de 65, puis joue sur les touches de couleur : chaque note résonne.}'),
    Br('e.salle8', ['e.reverb'], 20, 'Laisse jouer 20 mesures avec la Reverb au-dessus de 65', () => store.get('fx.space') >= 0.65, 'Sculpter > Effets > Reverb au-dessus de 65, puis laisse tourner : écoute la salle.'),
    Ch('e.accords', ['e.reverb', 'h.pad'], 10, 'Joue 10 accords dans la Reverb', () => store.get('fx.space') >= 0.5),
    Tm('e.minute', ['e.reverb'], 150, 'Joue pendant 2 minutes et demie'),
    Nn('t.notes', ['t.son'], 80),
    Br('k.lumiere', ['t.macros'], 20, 'Laisse jouer 20 mesures avec la Lumière au-dessus de 60', () => store.get('macro.light') >= 0.6, 'Sculpter > Grands réglages > Lumière au-dessus de 60, puis laisse tourner.'),
    Ch('h.accords2', ['h.key'], 14, 'Joue 14 accords dans ta nouvelle tonalité'),
    Br('m.lent', ['m.tempo'], 20, 'Laisse jouer 20 mesures sous 60 bpm', () => store.get('global.tempo') < 60, 'Sculpter > Global > Tempo sous 60, puis laisse tourner : tout respire plus lentement.'),
    Br('m.phrase16', ['m.phrase'], 28, 'Laisse jouer 28 mesures avec la Mélodie auto en Phrase', () => on('bells') && store.get('bells.mode') === 'Phrase', 'Sculpter > Mélodie auto > Jeu : Phrase, puis laisse tourner : le motif revient et varie.'),
    Tm('c.minute', ['h.pad', 'm.bells'], 180, 'Joue pendant 3 minutes'),
    Br('e.grande8', ['e.salle'], 20, 'Laisse jouer 20 mesures dans une grande salle (Taille au-dessus de 80)', () => store.get('fx.size') >= 0.8, 'Sculpter > Effets > Taille au-dessus de 80, puis laisse tourner.'),
    Br('e.echo16', ['e.echo'], 28, 'Laisse jouer 28 mesures avec l\'Écho au-dessus de 45', () => store.get('fx.echo') >= 0.45, 'Sculpter > Effets > Écho au-dessus de 45, puis laisse tourner : les notes se répètent en rythme.'),
    Br('c.ecrite', ['c.seq'], 20, 'Laisse jouer 20 mesures avec ta Mélodie écrite', () => on('seq'), 'Composer > Mélodie écrite > On (écris ou joue des notes dans le piano roll), puis laisse tourner.'),
    Nn('t.notes2', ['t.journal'], 80),
    Ch('h.accords3', ['h.scale', 'h.pad2'], 20),
    Br('m.grains16', ['m.grains'], 28, 'Laisse jouer 28 mesures avec les Grains', () => on('grains'), 'Sculpter > Grains > On, puis laisse tourner : le nuage de grains vit avec la musique.'),
    Br('e.cassette', ['e.tape'], 20, 'Laisse jouer 20 mesures avec la Cassette au-dessus de 50', () => store.get('fx.tape') >= 0.5, 'Sculpter > Effets > Cassette au-dessus de 50, puis laisse tourner : le son tremble comme une vieille bande.'),
    Br('m.derive', ['m.evolve'], 28, 'Laisse jouer 28 mesures avec la Dérive au-dessus de 50', () => store.get('global.evolve') >= 0.5, 'Sculpter > Global > Dérive au-dessus de 50, puis laisse tourner : tes réglages bougent tout seuls.'),
    Tm('m.deux', ['m.lfo'], 210, 'Joue pendant 3 minutes et demie'),
    Tm('c.trois', ['c.rythme', 'h.prog'], 270, 'Joue pendant 4 minutes et demie'),

    // gates opened by a Réponse (S4.3: they replaced the « set the knobs to a target » puzzles; S4.2: played in the music)
    E('p.premier', ['t.son', 'h.pad', 'm.bells'], 'Premier reflet'),
    E('p.suite', ['m.bells'], 'Suite connue'),
    E('p.composer', ['h.pad', 'm.bells'], 'Boîte à musique'),
    E('p.gamme', ['h.scale', 'm.bells'], 'Autre lumière'),
    E('p.espace', ['e.tape', 'm.bells'], 'La grotte'),
    E('p.mouvement', ['m.evolve', 'm.bells'], 'Pluie de notes'),
  ];
  // S4.3 → S11.1 — THE table: the objectives of each piece, in the order of the path (the queue follows it). Discoveries make
  // their own pieces ready too (js/discoveries.js OPENS). A piece waits for its prerequisites and for what its
  // objectives play with (`need`); that graph has no cycle (tests/game.html), so no order of play can block the path
  // (tests/balance.html). Pace (balance.html): the first piece after ~1 min of play, then one every 2–4 min.
  const OPENS = {
    'm.bells': ['k.allume', 'k.drone', 'k.ecoute'], 'k.piano': ['m.ecoute', 'k.couleur'],
    'h.pad': ['m.notes', 'k.minute'], 't.son': ['k.notes', 't.ecoute'],
    'e.reverb': ['m.monte', 'h.ecoute'], 't.viz': ['m.descend', 'v.regarde'], 'h.drone': ['h.forcer', 'h.chant'],
    't.macros': ['p.premier', 't.joue'], 'm.tempo': ['m.pas', 'm.notes2'], 'm.phrase': ['p.suite', 'm.phrase8'],
    'h.key': ['h.suivre', 'h.accords'], 'h.pad2': ['h.son', 'h.tient'],
    't.journal': ['k.timbre', 't.deux'], 'e.echo': ['e.resonne', 'e.loin'], 'e.salle': ['m.respire', 'e.salle8', 'e.accords'],
    'e.texture': ['e.noyer', 'e.minute'], 't.rec': ['k.moments', 't.notes'], 't.dice': ['k.macros', 'k.lumiere'],
    'h.scale': ['h.tonalite', 'h.accords2'], 'm.evolve': ['m.ralenti', 'm.lent'], 'm.grains': ['m.phrase', 'm.phrase16'],
    'c.seq': ['p.composer', 'c.minute'], 'e.halo': ['e.grande', 'e.grande8'], 'e.tape': ['e.echo', 'e.echo16'],
    'c.rythme': ['c.reclive', 'c.ecrite'], 't.share': ['k.enreg', 't.notes2'], 'h.prog': ['p.gamme', 'h.accords3'],
    'm.grains2': ['m.nuage', 'm.grains16'], 'e.lofi': ['p.espace', 'e.cassette'], 'm.lfo': ['p.mouvement', 'm.derive'],
    'm.scenes': ['m.figer', 'm.deux'], 'c.song': ['c.groove', 'c.trois'],
  };
  // before S11.1 a piece had ONE challenge (older saves: done, the piece is ready)
  const LEGACY = {
    'm.bells': 'k.note', 'h.pad': 'm.notes', 't.son': 'k.couleur', 'e.reverb': 'm.monte', 't.viz': 'm.descend',
    'h.drone': 'h.forcer', 't.macros': 'p.premier', 'm.tempo': 'm.pas', 'm.phrase': 'p.suite', 'h.key': 'h.suivre',
    'h.pad2': 'h.son', 't.journal': 'k.timbre', 'e.echo': 'e.resonne', 'e.salle': 'm.respire', 'e.texture': 'e.noyer',
    't.rec': 'k.moments', 't.dice': 'k.macros', 'h.scale': 'h.tonalite', 'm.evolve': 'm.ralenti', 'm.grains': 'm.phrase',
    'c.seq': 'p.composer', 'e.halo': 'e.grande', 'e.tape': 'e.echo', 'c.rythme': 'c.reclive', 't.share': 'k.enreg',
    'h.prog': 'p.gamme', 'm.grains2': 'm.nuage', 'e.lofi': 'p.espace', 'm.lfo': 'p.mouvement', 'm.scenes': 'm.figer',
    'c.song': 'c.groove',
  };
  // S11.1: whatever is played with notes or chords (and a Réponse, a Rec live) waits for the Piano
  for (const d of DEFS) if ((d.on.note || d.on.act && !d.gesture && d.id !== 'k.allume' && d.id !== 'c.morceau' || d.kind === 'reponse') && !d.need.includes('k.piano')) d.need.push('k.piano');
  const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));
  for (const [node, ids] of Object.entries(OPENS)) for (const id of ids) byId[id].node = node;
  byId['c.morceau'].first = true;
  const PIECES = Object.keys(OPENS); // the path's order
  const ORDER = PIECES.flatMap((n) => OPENS[n].map((id) => byId[id])).concat(DEFS.filter((d) => !d.node));
  // a Réponse gate's length from the depth of its node: S11.1 4 notes up to depth 3, one more per level, up to 7
  const depth = (id) => { const n = AMB.tree.byId[id]; return n.req.length ? 1 + Math.max(...n.req.map(depth)) : 0; };
  for (const d of DEFS) if (d.kind === 'reponse') {
    d.d = Math.max(0, Math.min(1, (depth(d.node) - 3) / 3));
    const n = 4 + Math.round(d.d * 3); // AMB.puzzles.respLen
    d.hint = `Pendant la lecture, l'enseigne Mélodie auto s'allume et l'écran dit « ↺ À toi » : rejoue la phrase juste après (touches à l'écran{, A à L ou MIDI|}). ${n} notes justes cochent l'objectif.`;
  }
  const LOG_MAX = 120; // the history kept (the widget shows the last ~6, the rest behind « voir tout »)
  const logPush = (s, e) => { s.log.push(e); if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX); };

  const contracts = {
    DEFS, byId, OPENS, PIECES, ORDER, LEGACY,
    state(g = AMB.game) { g.s.active = g.s.active || []; g.s.prog = g.s.prog || {}; g.s.skipped = g.s.skipped || []; g.s.log = g.s.log || []; return g.s; },
    done(id, g = AMB.game) { return (g.s.contracts || []).includes(id); },
    // the objectives of a piece (the tree card, the widget), and those left to do
    forNode(nodeId) { return (OPENS[nodeId] || []).map((id) => byId[id]); },
    left(nodeId, g = AMB.game) { return this.forNode(nodeId).filter((d) => !this.done(d.id, g)); },
    // a piece can be worked on now: it can be opened (prerequisites owned) and what its objectives play with is there
    pieceOk(node, g = AMB.game) {
      const left = this.left(node, g);
      return !!left.length && AMB.tree.status(node, g) === 'available' && left.every((d) => d.need.every((n) => g.has(n)));
    },
    // an objective that can be worked on now; the last one (no piece): once, S5.7 only when every piece is open
    eligible(d, g = AMB.game) {
      if (this.done(d.id, g) || !d.need.every((n) => g.has(n))) return false;
      return d.node ? this.pieceOk(d.node, g) : AMB.tree.NODES.every((n) => g.has(n.id));
    },
    // the piece being worked on (its objectives left are `active`), or null
    current(g = AMB.game) { const d = byId[this.state(g).active[0]]; return d ? d.node || null : null; },
    // the next piece of the path that can be opened now (a discovery whose own piece is owned makes this one ready)
    nextNode(g = AMB.game) {
      const c = this.current(g); if (c && AMB.tree.status(c, g) === 'available') return c;
      return PIECES.find((n) => AMB.tree.status(n, g) === 'available') || null;
    },
    // the queue: the pieces in the order of the path, those passed (↷) last, in the order passed
    queue(g = AMB.game) {
      const later = [...new Set(this.state(g).skipped.map((id) => byId[id] && byId[id].node).filter(Boolean))];
      return PIECES.filter((n) => !later.includes(n)).concat(later);
    },
    // keep the objectives left of ONE piece active: the current one, else the first that can be worked on in the queue
    refill(g = AMB.game) {
      if (!g.path) return;
      this.migrate(g);
      const s = this.state(g);
      // a piece whose objectives are all done (a placement, an older save) is ready as soon as it can be opened
      for (const n of PIECES) if (!this.left(n, g).length && AMB.tree.status(n, g) === 'available') g.ready(n, OPENS[n][OPENS[n].length - 1]);
      // S4.6: while a piece won waits for the player to open it (in the Arbre), no objective (the progress stays in s.prog)
      if ((s.ready || []).length) { s.active = []; g.save(); g.emit('contract', { active: [] }); return; }
      const fin = DEFS.find((d) => d.first), cur = this.current(g);
      if (fin && this.eligible(fin, g)) s.active = [fin.id];
      else {
        const node = cur && this.pieceOk(cur, g) ? cur : this.queue(g).find((n) => this.pieceOk(n, g));
        s.active = node ? this.left(node, g).map((d) => d.id) : [];
      }
      for (const id of s.active) s.prog[id] = s.prog[id] || { n: 0 };
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
    progress(id, g = AMB.game) { if (this.done(id, g)) return byId[id].goal; const st = this.state(g).prog[id]; return Math.min(byId[id].goal, (st && st.n) || 0); },
    // route an event to the active objectives; finish each one that reaches its goal
    dispatch(ev, ...args) {
      const g = AMB.game; if (!g.counts()) return; // free mode, or the instrument handed over: nothing counts
      if (ev === 'param' && args[2] === 'game') return;
      const s = this.state(g); let changed = false;
      for (const id of s.active.slice()) {
        const d = byId[id], fn = d && d.on[ev]; if (!fn || !s.active.includes(id)) continue;
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
    // done: recorded (game.s.contracts) and in the history (game.s.log); the piece's last one makes it ready (S4.6: the
    // player opens it in the Arbre; by = this objective). `by` = what checked it ('place': a placement, S5.4)
    finish(id, g = AMB.game, by = null) {
      const d = byId[id]; if (!d || this.done(id, g)) return false;
      const s = this.state(g);
      s.active = s.active.filter((x) => x !== id);
      delete s.prog[id];
      logPush(s, by ? { id, node: d.node || null, t: Date.now(), by } : { id, node: d.node || null, t: Date.now() });
      g.complete(id);
      const left = d.node ? this.left(d.node, g).length : 0;
      g.emit('objective', { id, node: d.node || null, left, by });
      if (d.node && !left && AMB.tree.status(d.node, g) === 'available') g.ready(d.node, id);
      if (!s.active.length || !left) this.refill(g); else { g.save(); g.emit('contract', { active: s.active.slice() }); }
      return true;
    },
    // S5.4 → S11.1: a placement checks the first objective left of each of these pieces, never the last one (the piece
    // still asks to be played). Returns the objectives checked.
    grant(nodes, g = AMB.game) {
      const out = [];
      for (const n of nodes) {
        const left = this.left(n, g);
        if (left.length > 1 && !g.has(n) && !g.isReady(n)) { this.finish(left[0].id, g, 'place'); out.push(left[0].id); }
      }
      return out;
    },
    // a discovery that made a piece ready (discoveries.js): one line in the history
    note(entry, g = AMB.game) { logPush(this.state(g), Object.assign({ t: Date.now() }, entry)); g.save(); },
    // older saves: before S11.1 a piece had ONE challenge (LEGACY): done, its piece becomes ready
    // (once, game.s.ob); S4.6: a success recorded without its piece open (a discovery: discoveries.migrate) is ready
    migrate(g = AMB.game) {
      if (!g.path) return;
      const s = this.state(g);
      if (s.ob !== 2) {
        s.ob = 2;
        for (const [n, id] of Object.entries(LEGACY)) if (!g.has(n) && !g.isReady(n) && this.done(id, g)) g.ready(n, id);
        if (!s.log.length) for (const id of s.contracts || []) if (byId[id]) s.log.push({ id, node: byId[id].node || null, t: 0 }); // the history starts with what was done
        g.save();
      }
      if (AMB.discoveries) AMB.discoveries.migrate(g);
    },
    // ↷: a stuck objective puts its piece back at the end of the queue (its progress is kept)
    skip(id, g = AMB.game) {
      const s = this.state(g); if (!s.active.includes(id)) return;
      s.skipped = (s.skipped || []).filter((x) => x !== id).concat(id);
      s.active = []; // (refill picks the next piece in the queue)
      this.refill(g);
    },
    // S11.1 bar lines (sequencer.js, each step): the « let N bars play » objectives
    onStep(step) {
      const S = AMB.seq; if (!S || (((step - (S.origin || 0)) % 16) + 16) % 16 !== 0) return;
      this.dispatch('bar', step);
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
