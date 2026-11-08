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
        volume: { label: 'Volume', min: 0, max: 1, def: 0.8 },
      },
    },
    fx: {
      label: 'Espace',
      params: {
        space: { label: 'Reverb', min: 0, max: 1, def: 0.55, evolve: true },
        size: { label: 'Taille', min: 0, max: 1, def: 0.75 },
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
        wave: { label: 'Moteur', type: 'select', options: ['Nappe', 'Verre', 'Chœur', 'Cordes'], def: 'Nappe' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.55 },
        tone: { label: 'Brillance', min: 0, max: 1, def: 0.4, evolve: true },
        attack: { label: 'Attaque', min: 0, max: 1, def: 0.6 },
        length: { label: 'Durée accord', min: 1, max: 8, def: 4, step: 1, unit: 'mes.' },
        voicing: { label: 'Richesse', min: 0, max: 1, def: 0.5, evolve: true },
        send: { label: 'Envoi FX', min: 0, max: 1, def: 0.7 },
      },
    },
    bells: {
      label: 'Mélodie',
      color: '#ffd27f',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        wave: { label: 'Moteur', type: 'select', options: ['Cloche', 'Kalimba', 'Verre', 'Pluck'], def: 'Kalimba' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.45 },
        density: { label: 'Densité', min: 0, max: 1, def: 0.3, evolve: true },
        tone: { label: 'Brillance', min: 0, max: 1, def: 0.5, evolve: true },
        decay: { label: 'Résonance', min: 0, max: 1, def: 0.5 },
        range: { label: 'Registre', min: 0, max: 1, def: 0.5 },
        send: { label: 'Envoi FX', min: 0, max: 1, def: 0.75 },
      },
    },
    grains: {
      label: 'Grains',
      color: '#7fffd4',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        source: { label: 'Source', type: 'select', options: ['Synthèse', 'Échantillon'], def: 'Synthèse' },
        vol: { label: 'Niveau', min: 0, max: 1, def: 0.35 },
        density: { label: 'Densité', min: 0, max: 1, def: 0.4, evolve: true },
        size: { label: 'Taille', min: 0, max: 1, def: 0.55 },
        scan: { label: 'Position', min: 0, max: 1, def: 0.3, evolve: true },
        spray: { label: 'Dispersion', min: 0, max: 1, def: 0.4 },
        pitch: { label: 'Hauteurs', type: 'select', options: ['Accord', 'Octaves', 'Libre'], def: 'Accord' },
        send: { label: 'Envoi FX', min: 0, max: 1, def: 0.8 },
      },
    },
    texture: {
      label: 'Texture',
      color: '#ff9f9f',
      params: {
        on: { label: 'On', type: 'toggle', def: true },
        type: { label: 'Type', type: 'select', options: ['Pluie', 'Vent', 'Océan', 'Vinyle', 'Ruisseau', 'Feu'], def: 'Pluie' },
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
      if (!sp.type || sp.type === 'knob') {
        v = Math.max(sp.min, Math.min(sp.max, Number(v)));
        if (sp.step) v = Math.round(v / sp.step) * sp.step;
      }
      if (this.values[key] === v) return;
      this.values[key] = v;
      for (const fn of this.listeners) fn(key, v, source);
    }
    setMany(obj, source) {
      for (const [k, v] of Object.entries(obj)) if (this.spec(k)) this.set(k, v, source);
    }
    snapshot() { return { ...this.values }; }
    on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  }

  AMB.SCHEMA = SCHEMA;
  AMB.store = new Store();
})();
