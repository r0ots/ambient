// Parameter schema + central state store
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const { SCALES, NOTE_NAMES } = AMB.theory;

  // type: 'knob' (default) | 'select' | 'toggle'
  // evolve: true => the global "Evolve" macro can drift this parameter
  const SCHEMA = {
    global: {
      label: 'Global',
      params: {
        tempo: { label: 'Tempo', hint: 'Vitesse générale du morceau (battements par minute).', min: 30, max: 140, def: 66, step: 1, unit: 'bpm' },
        key: { label: 'Tonalité', hint: 'Note de départ de la gamme : tout le morceau est construit dessus.', type: 'select', options: NOTE_NAMES, def: 'D' },
        scale: { label: 'Gamme', hint: 'Couleur harmonique : Lydien lumineux, Éolien mélancolique, Pentatonique toujours doux…', type: 'select', options: Object.keys(SCALES), def: 'Lydien' },
        evolve: { label: 'Dérive', hint: 'Fait bouger lentement et tout seul les réglages autour de tes valeurs.', min: 0, max: 1, def: 0.35 },
        time: { label: 'Rythme', hint: 'Régulier : notes sur les temps. Libre : notes qui flottent sans pulsation.', type: 'select', options: ['Pulsé', 'Flottant'], def: 'Pulsé' },
        humanize: { label: 'Imprécision', hint: 'Petits décalages de temps et de force pour un jeu moins mécanique.', min: 0, max: 1, def: 0.2 },
        tuning: { label: 'Diapason', hint: 'Fréquence de référence du La (440 Hz standard, 432 Hz un peu plus grave).', type: 'select', options: ['440 Hz', '432 Hz'], def: '440 Hz' },
        volume: { label: 'Volume', hint: 'Volume général.', min: 0, max: 1, def: 0.8 },
      },
    },
    fx: {
      label: 'Espace',
      params: {
        space: { label: 'Reverb', hint: 'Quantité de réverbération : la sensation d\'un grand espace.', min: 0, max: 1, def: 0.55, evolve: true },
        revType: { label: 'Salle', hint: 'Hall : grande salle. Plate : brillante et dense. Cloud : nuage qui gonfle lentement.', type: 'select', options: ['Hall', 'Plate', 'Cloud'], def: 'Hall' },
        size: { label: 'Taille', hint: 'Durée de la réverbération (petite pièce → cathédrale).', min: 0, max: 1, def: 0.75 },
        predelay: { label: 'Pré-délai', hint: 'Court silence avant la réverbération : garde le son direct plus net.', min: 0, max: 1, def: 0.3, fmt: (v) => `${Math.round(v * v * 250)} ms` },
        shimmer: { label: 'Halo', hint: 'Ajoute un halo cristallin une octave au-dessus, dans la réverbération.', min: 0, max: 1, def: 0.15, evolve: true },
        echo: { label: 'Écho', hint: 'Quantité d\'échos répétés.', min: 0, max: 1, def: 0.3, evolve: true },
        echoTime: { label: 'Vitesse écho', hint: 'Écart entre les échos, calé sur le tempo.', type: 'select', options: ['1/8', '1/8.', '1/4', '1/4.', '1/2', '1/1'], def: '1/4.' },
        feedback: { label: 'Répétitions', hint: 'Nombre de répétitions de l\'écho avant qu\'il s\'éteigne.', min: 0, max: 0.92, def: 0.55 },
        tape: { label: 'Cassette', hint: 'Pleurage et saturation douce d\'une vieille cassette.', min: 0, max: 1, def: 0.35, evolve: true },
        lofi: { label: 'Usure', hint: 'Son plus étouffé et souffle léger, comme un vieil enregistrement.', min: 0, max: 1, def: 0.15 },
      },
    },
    drone: {
      label: 'Drone',
      color: '#6f9fd8',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        wave: { label: 'Son', hint: 'Timbre de la note tenue de fond.', type: 'select', options: ['Chaud', 'Creux', 'Orgue', 'Sub'], def: 'Chaud' },
        vol: { label: 'Niveau', hint: 'Volume de la couche.', min: 0, max: 1, def: 0.5 },
        tone: { label: 'Couleur', hint: 'Sombre ↔ brillant.', min: 0, max: 1, def: 0.35, evolve: true },
        motion: { label: 'Mouvement', hint: 'Lent mouvement du filtre, du volume et de la position stéréo.', min: 0, max: 1, def: 0.4, evolve: true },
        follow: { label: 'Suit accords', hint: 'La note de fond change avec les accords (sinon elle reste sur la tonalité).', type: 'toggle', def: true },
        send: { label: 'Espace', hint: 'Part de cette couche envoyée dans la réverbération et l\'écho.', min: 0, max: 1, def: 0.5 },
      },
    },
    pad: {
      label: 'Pad',
      color: '#b48ad6',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        wave: { label: 'Son', hint: 'Timbre des accords tenus.', type: 'select', options: ['Nappe', 'Verre', 'Chœur', 'Cordes', 'Onde', 'FM'], def: 'Nappe' },
        vol: { label: 'Niveau', hint: 'Volume de la couche.', min: 0, max: 1, def: 0.55 },
        tone: { label: 'Brillance', hint: 'Sombre ↔ brillant.', min: 0, max: 1, def: 0.4, evolve: true },
        attack: { label: 'Attaque', hint: 'Les accords arrivent doucement (haut) ou directement (bas).', min: 0, max: 1, def: 0.6 },
        length: { label: 'Durée accord', hint: 'Combien de mesures dure chaque accord.', min: 1, max: 8, def: 4, step: 1, unit: 'mes.' },
        prog: { label: 'Progression', hint: 'Comment les accords s\'enchaînent. Plus de contrôle dans Composer > Progression.', type: 'select', options: ['Aléatoire', 'Plane (I)', 'Pendule I–IV', 'I–V–vi–IV', 'i–VI–III–VII', 'Montée I–ii–iii–IV', 'Perso'], def: 'Aléatoire' },
        custom: { label: 'Degrés perso', hint: 'Suite de degrés 1–7 (ex. 1 6 4 5). Plus simple : Composer > Progression.', type: 'text', def: '1 6 4 5', placeholder: 'ex. 1 6 4 5' },
        voicing: { label: 'Accords riches', hint: 'Accords à 3 notes (bas) jusqu\'à 5 notes ouvertes (haut).', min: 0, max: 1, def: 0.5, evolve: true },
        counter: { label: 'Voix intérieure', hint: 'Une voix lente qui tient des notes de l\'accord et avance pas à pas.', min: 0, max: 1, def: 0.25, evolve: true },
        send: { label: 'Espace', hint: 'Part de cette couche envoyée dans la réverbération et l\'écho.', min: 0, max: 1, def: 0.7 },
      },
    },
    bells: {
      label: 'Mélodie auto',
      color: '#f2c14e',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        wave: { label: 'Son', hint: 'Timbre des notes de mélodie.', type: 'select', options: ['Cloche', 'Kalimba', 'Verre', 'Pluck', 'Doux'], def: 'Kalimba' },
        vol: { label: 'Niveau', hint: 'Volume de la couche.', min: 0, max: 1, def: 0.45 },
        mode: { label: 'Jeu', hint: 'Aléatoire : improvise. Phrase : répète un motif qui varie lentement.', type: 'select', options: ['Aléatoire', 'Phrase'], def: 'Aléatoire' },
        phraseLen: { label: 'Phrase', hint: 'Longueur du motif répété en mode Phrase.', type: 'select', options: ['1 mes.', '2 mes.', '4 mes.'], def: '2 mes.' },
        density: { label: 'Densité', hint: 'Nombre de notes jouées.', min: 0, max: 1, def: 0.3, evolve: true },
        mutate: { label: 'Variation', hint: 'À quel point la phrase change à chaque tour.', min: 0, max: 1, def: 0.3 },
        tone: { label: 'Brillance', hint: 'Sombre ↔ brillant.', min: 0, max: 1, def: 0.5, evolve: true },
        decay: { label: 'Résonance', hint: 'Durée pendant laquelle chaque note résonne.', min: 0, max: 1, def: 0.5 },
        range: { label: 'Registre', hint: 'Grave ↔ aigu.', min: 0, max: 1, def: 0.5 },
        send: { label: 'Espace', hint: 'Part de cette couche envoyée dans la réverbération et l\'écho.', min: 0, max: 1, def: 0.75 },
      },
    },
    seq: {
      label: 'Mélodie écrite',
      color: '#e89ab8',
      params: {
        on: { label: 'On', type: 'toggle', def: false },
        wave: { label: 'Son', hint: 'Timbre de la mélodie écrite. « Doux » tient la longueur des notes.', type: 'select', options: ['Cloche', 'Kalimba', 'Verre', 'Pluck', 'Doux'], def: 'Doux' },
        mode: { label: 'Jeu', hint: 'Piano roll : joue tes notes. Arpège : égrène l\'accord en cours.', type: 'select', options: ['Piano roll', 'Arpège'], def: 'Piano roll' },
        arpDir: { label: 'Arpège', hint: 'Sens de l\'arpège.', type: 'select', options: ['Monte', 'Descend', 'Aller-retour', 'Aléatoire'], def: 'Monte' },
        arpRate: { label: 'Vitesse', hint: 'Vitesse de l\'arpège.', type: 'select', options: ['1/16', '1/8', '1/8.', '1/4'], def: '1/8' },
        arpOct: { label: 'Étendue', hint: 'Nombre d\'octaves parcourues par l\'arpège.', type: 'select', options: ['1 oct.', '2 oct.', '3 oct.'], def: '2 oct.' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.5 },
        steps: { label: 'Longueur', hint: 'Longueur du motif.', type: 'select', options: ['16', '32', '64'], labels: { 16: '1 mesure', 32: '2 mesures', 64: '4 mesures' }, def: '32' },
        octave: { label: 'Octave', type: 'select', options: ['-1', '0', '+1'], def: '0' },
        follow: { label: 'Suit accords', hint: 'Transpose tes notes avec chaque accord (pratique pour les arpèges, déroutant pour une mélodie).', type: 'toggle', def: false },
        tone: { label: 'Brillance', min: 0, max: 1, def: 0.45 },
        decay: { label: 'Résonance', min: 0, max: 1, def: 0.45 },
        swing: { label: 'Swing', hint: 'Retarde une double-croche sur deux : jeu plus chaloupé.', min: 0, max: 1, def: 0.1 },
        mutate: { label: 'Variation', hint: 'Le motif change un peu à chaque tour (↺ Original pour revenir).', min: 0, max: 1, def: 0 },
        send: { label: 'Espace', hint: 'Part de cette couche envoyée dans la réverbération et l\'écho.', min: 0, max: 1, def: 0.6 },
        // notes as "step.row.len" (base36), comma separated; part of the patch so presets/links/undo include it
        pattern: { label: 'Motif', type: 'text', def: '', maxLen: 4000, hidden: true },
        // pattern chain: slots A–D (A is `pattern` for backward compatibility)
        patB: { label: 'Motif B', type: 'text', def: '', maxLen: 4000, hidden: true },
        patC: { label: 'Motif C', type: 'text', def: '', maxLen: 4000, hidden: true },
        patD: { label: 'Motif D', type: 'text', def: '', maxLen: 4000, hidden: true },
        slot: { label: 'Édition', type: 'select', options: ['A', 'B', 'C', 'D'], def: 'A', hidden: true },
        chain: { label: 'Chaîne', hint: 'Ordre de lecture des motifs, ex. « A A B C ». Vide = le motif affiché.', type: 'text', def: '', placeholder: 'ex. A A B C', maxLen: 64 },
      },
    },
    bass: {
      label: 'Basse',
      color: '#7f9fe0',
      params: {
        on: { label: 'On', type: 'toggle', def: false },
        wave: { label: 'Son', type: 'select', options: ['Sub', 'Ronde', 'Pluck'], def: 'Ronde' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.5 },
        tone: { label: 'Brillance', min: 0, max: 1, def: 0.3 },
        decay: { label: 'Tenue', hint: 'Notes courtes ↔ notes liées.', min: 0, max: 1, def: 0.6 },
        octave: { label: 'Octave', type: 'select', options: ['-1', '0', '+1'], def: '0' },
        send: { label: 'Espace', hint: 'Part de cette couche envoyée dans la réverbération et l\'écho.', min: 0, max: 1, def: 0.15 },
        // 4 rows (fondamentale, quinte, octave, approche) × 16 steps, "1"/"0" per step
        pattern: { label: 'Motif', type: 'text', def: '1000000010000000.0000000000001000.0000000000000000.0000000000000000', maxLen: 80, hidden: true },
      },
    },
    perc: {
      label: 'Pulsations',
      color: '#e8955d',
      params: {
        on: { label: 'On', type: 'toggle', def: false },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.45 },
        prob: { label: 'Présence', hint: 'Chance que chaque coup soit joué : moins = plus aéré et imprévisible.', min: 0, max: 1, def: 0.85, evolve: true },
        tone: { label: 'Couleur', min: 0, max: 1, def: 0.4 },
        swing: { label: 'Swing', min: 0, max: 1, def: 0.15 },
        send: { label: 'Espace', hint: 'Part de cette couche envoyée dans la réverbération et l\'écho.', min: 0, max: 1, def: 0.35 },
        kit: { label: 'Kit', hint: 'Feutré : sons doux électroniques. Organique : tambour, bâton de pluie, gouttes, kalimba.', type: 'select', options: ['Feutré', 'Organique'], def: 'Feutré' },
        steps: { label: 'Pas', type: 'select', options: ['16', '32'], def: '16' },
        // 4 tracks "kick.shaker.wood.bell"; each a string of levels 0–3 per step (legacy: 4-char hex bitmask)
        pattern: { label: 'Motif', type: 'text', def: '8888.2222.0820.0001', maxLen: 200, hidden: true },
      },
    },
    grains: {
      label: 'Grains',
      color: '#6fcf9f',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        source: { label: 'Source', hint: 'Matière découpée en grains : synthèse, ton fichier, ou « Figé » (capture du son).', type: 'select', options: ['Synthèse', 'Échantillon', 'Gel'], def: 'Synthèse' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.35 },
        density: { label: 'Densité', hint: 'Nombre de grains par seconde.', min: 0, max: 1, def: 0.4, evolve: true },
        size: { label: 'Taille', hint: 'Longueur de chaque grain : court = scintillant, long = nappe.', min: 0, max: 1, def: 0.55 },
        scan: { label: 'Zone', hint: 'Endroit de la matière d\'où sont pris les grains.', min: 0, max: 1, def: 0.3, evolve: true },
        spray: { label: 'Flou', hint: 'Dispersion des grains autour de la zone et dans l\'espace stéréo.', min: 0, max: 1, def: 0.4 },
        pitch: { label: 'Hauteurs', hint: 'Hauteurs des grains : notes de l\'accord, octaves, ou libres.', type: 'select', options: ['Accord', 'Octaves', 'Libre'], def: 'Accord' },
        reverse: { label: 'À l\'envers', hint: 'Proportion de grains joués à l\'envers.', min: 0, max: 1, def: 0.15 },
        glide: { label: 'Glissando', hint: 'Les grains glissent vers leur note.', min: 0, max: 1, def: 0, evolve: true },
        send: { label: 'Espace', hint: 'Part de cette couche envoyée dans la réverbération et l\'écho.', min: 0, max: 1, def: 0.8 },
      },
    },
    texture: {
      label: 'Texture',
      color: '#e87a5d',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        type: { label: 'Type', hint: 'Ambiance sonore de fond.', type: 'select', options: ['Pluie', 'Vent', 'Océan', 'Vinyle', 'Ruisseau', 'Feu', 'Oiseaux', 'Ville'], def: 'Pluie' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.25 },
        tone: { label: 'Couleur', hint: 'Étouffé ↔ clair.', min: 0, max: 1, def: 0.5 },
        motion: { label: 'Mouvement', hint: 'Variations lentes de volume, de filtre et de stéréo.', min: 0, max: 1, def: 0.5 },
        send: { label: 'Espace', hint: 'Part de cette couche envoyée dans la réverbération et l\'écho.', min: 0, max: 1, def: 0.3 },
      },
    },
  };

  class Store {
    constructor() {
      this.values = {};
      this.listeners = new Set();
      this.reset();
    }
    reset() {
      for (const [sec, s] of Object.entries(SCHEMA))
        for (const [k, p] of Object.entries(s.params)) this.values[`${sec}.${k}`] = p.def;
    }
    spec(key) {
      const [sec, k] = key.split('.');
      return SCHEMA[sec] && SCHEMA[sec].params[k];
    }
    get(key) { return this.values[key]; }
    set(key, v, source) {
      const sp = this.spec(key);
      if (!sp) return;
      // reject malformed values (bad share links / imports) instead of crashing the engine
      if (sp.type === 'select' && !sp.options.includes(v)) return;
      if (sp.type === 'toggle') v = !!v;
      if (sp.type === 'text') v = String(v == null ? '' : v).slice(0, sp.maxLen || 80);
      if (!sp.type || sp.type === 'knob') {
        if (!Number.isFinite(Number(v))) return;
        v = Math.max(sp.min, Math.min(sp.max, Number(v)));
        if (sp.step) v = Math.round(v / sp.step) * sp.step;
      }
      if (this.values[key] === v) return;
      const prev = this.values[key];
      this.values[key] = v;
      for (const fn of this.listeners) fn(key, v, source, prev);
    }
    setMany(obj, source) {
      for (const [k, v] of Object.entries(obj)) if (this.spec(k)) this.set(k, v, source);
    }
    snapshot() { return { ...this.values }; }
    // user-intended values: LFO/Evolve drift replaced by the anchor ("home") values when known
    stableSnapshot() {
      const snap = this.snapshot(), homes = (AMB.seq && AMB.seq.homes) || {};
      for (const k of Object.keys(snap)) if (homes[k] !== undefined && this.spec(k) && !this.spec(k).type) snap[k] = homes[k];
      return snap;
    }
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  }

  // ---- Modulation section: 2 slow LFOs whose targets can be any continuous parameter ----
  const targets = ['—'], labels = { '—': 'Aucune' };
  for (const [sec, sdef] of Object.entries(SCHEMA)) {
    for (const [k, p] of Object.entries(sdef.params)) {
      const key = `${sec}.${k}`;
      if (p.type || p.step || ['global.volume', 'global.evolve', 'fx.size'].includes(key)) continue; // size rebuilds the IR: not modulatable
      targets.push(key); labels[key] = `${sdef.label} · ${p.label}`;
    }
  }
  const lfo = (n, target, rate, depth) => ({
    [`l${n}target`]: { label: `Mouvement ${n} : quoi`, hint: 'Réglage qui va bouger tout seul, lentement.', type: 'select', options: targets, labels, def: target },
    [`l${n}shape`]: { label: 'Forme', type: 'select', options: ['Sinus', 'Triangle', 'Dérive'], def: 'Sinus' },
    [`l${n}rate`]: { label: 'Lenteur', hint: 'Durée d’un aller-retour (de 4 s à 10 min).', min: 0, max: 1, def: rate, fmt: (v) => fmtPeriod(v) },
    [`l${n}depth`]: { label: 'Ampleur', hint: 'De combien le réglage bouge autour de ta valeur.', min: 0, max: 1, def: depth },
  });
  // Macro knobs for the "Simple" view: each drives several parameters at once (see ui.js MACROS)
  SCHEMA.macro = { label: 'Macros', color: '#f2a23a', params: {
    light: { label: 'Lumière', hint: 'Son sombre et feutré ↔ clair et brillant.', min: 0, max: 1, def: 0.45 },
    density: { label: 'Densité', min: 0, max: 1, def: 0.35, hint: 'Peu de notes et accords longs ↔ beaucoup de notes et de grains.' },
    space: { label: 'Espace', min: 0, max: 1, def: 0.55, hint: 'Petite pièce sèche ↔ immense espace avec halo.' },
    nostalgia: { label: 'Nostalgie', hint: 'Son propre ↔ vieille cassette usée.', min: 0, max: 1, def: 0.25 },
    nature: { label: 'Nature', hint: 'Volume de la texture (pluie, océan…). Tout à gauche : coupée.', min: 0, max: 1, def: 0.4 },
  } };
  // Drawn automation lane: an absolute curve (32 points, base36 0..z) over N bars for one parameter
  SCHEMA.auto = { label: 'Automation', color: '#9fd36f', params: {
    on: { label: 'On', type: 'toggle', def: false },
    target: { label: 'Paramètre', type: 'select', options: targets, labels, def: 'fx.space' },
    bars: { label: 'Durée', type: 'select', options: ['4', '8', '16', '32'], labels: { 4: '4 mesures', 8: '8 mesures', 16: '16 mesures', 32: '32 mesures' }, def: '8' },
    curve: { label: 'Courbe', type: 'text', def: 'i'.repeat(32), maxLen: 32, hidden: true },
  } };
  SCHEMA.mod = { label: 'Mouvements lents', color: '#8fb8d8', params: { ...lfo(1, 'pad.tone', 0.45, 0.4), ...lfo(2, '—', 0.25, 0.3) } };

  // rate knob 0..1 -> period 4 s .. 10 min (log)
  function periodSecs(v) { return 4 * Math.pow(150, 1 - v); }
  function fmtPeriod(v) { const s = periodSecs(v); return s >= 90 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`; }
  AMB.periodSecs = periodSecs;

  AMB.SCHEMA = SCHEMA;
  // a parameter driven by the drawn automation lane must not be touched by Evolve/LFO/morphs
  AMB.isAutomated = (key) => AMB.store && AMB.store.get('auto.on') && AMB.store.get('auto.target') === key;
  AMB.store = new Store();
})();
