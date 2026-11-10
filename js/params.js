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
        tempo: { label: 'Tempo', min: 30, max: 140, def: 66, step: 1, unit: 'bpm' },
        key: { label: 'Tonalité', type: 'select', options: NOTE_NAMES, def: 'D' },
        scale: { label: 'Gamme', type: 'select', options: Object.keys(SCALES), def: 'Lydien' },
        evolve: { label: 'Evolve', min: 0, max: 1, def: 0.35 },
        time: { label: 'Temps', type: 'select', options: ['Pulsé', 'Flottant'], def: 'Pulsé' },
        tuning: { label: 'Diapason', type: 'select', options: ['440 Hz', '432 Hz'], def: '440 Hz' },
        volume: { label: 'Volume', min: 0, max: 1, def: 0.8 },
      },
    },
    fx: {
      label: 'Espace',
      params: {
        space: { label: 'Reverb', min: 0, max: 1, def: 0.55, evolve: true },
        revType: { label: 'Caractère', type: 'select', options: ['Hall', 'Plate', 'Cloud'], def: 'Hall' },
        size: { label: 'Taille', min: 0, max: 1, def: 0.75 },
        predelay: { label: 'Pré-délai', min: 0, max: 1, def: 0.3, fmt: (v) => `${Math.round(v * v * 250)} ms` },
        shimmer: { label: 'Shimmer', min: 0, max: 1, def: 0.15, evolve: true },
        echo: { label: 'Delay', min: 0, max: 1, def: 0.3, evolve: true },
        echoTime: { label: 'Temps', type: 'select', options: ['1/8', '1/8.', '1/4', '1/4.', '1/2', '1/1'], def: '1/4.' },
        feedback: { label: 'Feedback', min: 0, max: 0.92, def: 0.55 },
        tape: { label: 'Tape', min: 0, max: 1, def: 0.35, evolve: true },
        lofi: { label: 'Lo-fi', min: 0, max: 1, def: 0.15 },
      },
    },
    drone: {
      label: 'Drone',
      color: '#7fb8ff',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        wave: { label: 'Moteur', type: 'select', options: ['Chaud', 'Creux', 'Orgue', 'Sub'], def: 'Chaud' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.5 },
        tone: { label: 'Tonalité', min: 0, max: 1, def: 0.35, evolve: true },
        motion: { label: 'Mouvement', min: 0, max: 1, def: 0.4, evolve: true },
        follow: { label: 'Suit accords', type: 'toggle', def: true },
        send: { label: 'Envoi FX', min: 0, max: 1, def: 0.5 },
      },
    },
    pad: {
      label: 'Pad',
      color: '#b58cff',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        wave: { label: 'Moteur', type: 'select', options: ['Nappe', 'Verre', 'Chœur', 'Cordes', 'Onde', 'FM'], def: 'Nappe' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.55 },
        tone: { label: 'Brillance', min: 0, max: 1, def: 0.4, evolve: true },
        attack: { label: 'Attaque', min: 0, max: 1, def: 0.6 },
        length: { label: 'Durée accord', min: 1, max: 8, def: 4, step: 1, unit: 'mes.' },
        prog: { label: 'Progression', type: 'select', options: ['Aléatoire', 'Plane (I)', 'Pendule I–IV', 'I–V–vi–IV', 'i–VI–III–VII', 'Montée I–ii–iii–IV', 'Perso'], def: 'Aléatoire' },
        custom: { label: 'Degrés perso', type: 'text', def: '1 6 4 5', placeholder: 'ex. 1 6 4 5' },
        voicing: { label: 'Richesse', min: 0, max: 1, def: 0.5, evolve: true },
        counter: { label: 'Contre-chant', min: 0, max: 1, def: 0.25, evolve: true },
        send: { label: 'Envoi FX', min: 0, max: 1, def: 0.7 },
      },
    },
    bells: {
      label: 'Mélodie',
      color: '#ffd27f',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        wave: { label: 'Moteur', type: 'select', options: ['Cloche', 'Kalimba', 'Verre', 'Pluck', 'Doux'], def: 'Kalimba' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.45 },
        mode: { label: 'Jeu', type: 'select', options: ['Aléatoire', 'Phrase'], def: 'Aléatoire' },
        phraseLen: { label: 'Phrase', type: 'select', options: ['1 mes.', '2 mes.', '4 mes.'], def: '2 mes.' },
        density: { label: 'Densité', min: 0, max: 1, def: 0.3, evolve: true },
        mutate: { label: 'Mutation', min: 0, max: 1, def: 0.3 },
        tone: { label: 'Brillance', min: 0, max: 1, def: 0.5, evolve: true },
        decay: { label: 'Résonance', min: 0, max: 1, def: 0.5 },
        range: { label: 'Registre', min: 0, max: 1, def: 0.5 },
        send: { label: 'Envoi FX', min: 0, max: 1, def: 0.75 },
      },
    },
    seq: {
      label: 'Séquenceur',
      color: '#ff9fd6',
      params: {
        on: { label: 'On', type: 'toggle', def: false },
        wave: { label: 'Moteur', type: 'select', options: ['Cloche', 'Kalimba', 'Verre', 'Pluck', 'Doux'], def: 'Doux' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.5 },
        steps: { label: 'Longueur', type: 'select', options: ['16', '32', '64'], labels: { 16: '1 mesure', 32: '2 mesures', 64: '4 mesures' }, def: '32' },
        octave: { label: 'Octave', type: 'select', options: ['-1', '0', '+1'], def: '0' },
        follow: { label: 'Suit accords', type: 'toggle', def: true },
        tone: { label: 'Brillance', min: 0, max: 1, def: 0.45 },
        decay: { label: 'Résonance', min: 0, max: 1, def: 0.45 },
        swing: { label: 'Swing', min: 0, max: 1, def: 0.1 },
        mutate: { label: 'Mutation', min: 0, max: 1, def: 0 },
        send: { label: 'Envoi FX', min: 0, max: 1, def: 0.6 },
        // notes as "step.row.len" (base36), comma separated; part of the patch so presets/links/undo include it
        pattern: { label: 'Motif', type: 'text', def: '', maxLen: 4000, hidden: true },
        // pattern chain: slots A–D (A is `pattern` for backward compatibility)
        patB: { label: 'Motif B', type: 'text', def: '', maxLen: 4000, hidden: true },
        patC: { label: 'Motif C', type: 'text', def: '', maxLen: 4000, hidden: true },
        patD: { label: 'Motif D', type: 'text', def: '', maxLen: 4000, hidden: true },
        slot: { label: 'Édition', type: 'select', options: ['A', 'B', 'C', 'D'], def: 'A', hidden: true },
        chain: { label: 'Chaîne', type: 'text', def: '', placeholder: 'ex. A A B C', maxLen: 64 },
      },
    },
    perc: {
      label: 'Pulsations',
      color: '#ffb36b',
      params: {
        on: { label: 'On', type: 'toggle', def: false },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.45 },
        prob: { label: 'Présence', min: 0, max: 1, def: 0.85, evolve: true },
        tone: { label: 'Couleur', min: 0, max: 1, def: 0.4 },
        swing: { label: 'Swing', min: 0, max: 1, def: 0.15 },
        send: { label: 'Envoi FX', min: 0, max: 1, def: 0.35 },
        // 4 tracks × 16 steps as hex bitmasks: "kick.shaker.wood.bell"
        pattern: { label: 'Motif', type: 'text', def: '8888.2222.0820.0001', maxLen: 40, hidden: true },
      },
    },
    grains: {
      label: 'Grains',
      color: '#7fffd4',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        source: { label: 'Source', type: 'select', options: ['Synthèse', 'Échantillon', 'Gel'], def: 'Synthèse' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.35 },
        density: { label: 'Densité', min: 0, max: 1, def: 0.4, evolve: true },
        size: { label: 'Taille', min: 0, max: 1, def: 0.55 },
        scan: { label: 'Position', min: 0, max: 1, def: 0.3, evolve: true },
        spray: { label: 'Dispersion', min: 0, max: 1, def: 0.4 },
        pitch: { label: 'Hauteurs', type: 'select', options: ['Accord', 'Octaves', 'Libre'], def: 'Accord' },
        reverse: { label: 'Reverse', min: 0, max: 1, def: 0.15 },
        glide: { label: 'Glissando', min: 0, max: 1, def: 0, evolve: true },
        send: { label: 'Envoi FX', min: 0, max: 1, def: 0.8 },
      },
    },
    texture: {
      label: 'Texture',
      color: '#ff9f9f',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        type: { label: 'Type', type: 'select', options: ['Pluie', 'Vent', 'Océan', 'Vinyle', 'Ruisseau', 'Feu', 'Oiseaux', 'Ville'], def: 'Pluie' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.25 },
        tone: { label: 'Tonalité', min: 0, max: 1, def: 0.5 },
        motion: { label: 'Mouvement', min: 0, max: 1, def: 0.5 },
        send: { label: 'Envoi FX', min: 0, max: 1, def: 0.3 },
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
    [`l${n}target`]: { label: `LFO ${n} → cible`, type: 'select', options: targets, labels, def: target },
    [`l${n}shape`]: { label: 'Forme', type: 'select', options: ['Sinus', 'Triangle', 'Dérive'], def: 'Sinus' },
    [`l${n}rate`]: { label: 'Période', min: 0, max: 1, def: rate, fmt: (v) => fmtPeriod(v) },
    [`l${n}depth`]: { label: 'Profondeur', min: 0, max: 1, def: depth },
  });
  // Macro knobs for the "Simple" view: each drives several parameters at once (see ui.js MACROS)
  SCHEMA.macro = { label: 'Macros', color: '#c9b6ff', params: {
    light: { label: 'Lumière', min: 0, max: 1, def: 0.45 },
    density: { label: 'Densité', min: 0, max: 1, def: 0.35 },
    space: { label: 'Espace', min: 0, max: 1, def: 0.55 },
    nostalgia: { label: 'Nostalgie', min: 0, max: 1, def: 0.25 },
    nature: { label: 'Nature', min: 0, max: 1, def: 0.4 },
  } };
  SCHEMA.mod = { label: 'Modulation', color: '#9fd0ff', params: { ...lfo(1, 'pad.tone', 0.45, 0.4), ...lfo(2, '—', 0.25, 0.3) } };

  // rate knob 0..1 -> period 4 s .. 10 min (log)
  function periodSecs(v) { return 4 * Math.pow(150, 1 - v); }
  function fmtPeriod(v) { const s = periodSecs(v); return s >= 90 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`; }
  AMB.periodSecs = periodSecs;

  AMB.SCHEMA = SCHEMA;
  AMB.store = new Store();
})();
