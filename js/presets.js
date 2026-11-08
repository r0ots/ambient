// Factory presets (partial patches merged over defaults)
(function () {
  const AMB = (window.AMB = window.AMB || {});

  AMB.PRESETS = {
    'Aube lydienne': {},
    'Nuit sous la pluie': {
      'global.tempo': 56, 'global.key': 'A', 'global.scale': 'Éolien (mineur)',
      'drone.wave': 'Sub', 'drone.tone': 0.25, 'pad.wave': 'Verre', 'pad.tone': 0.3,
      'bells.wave': 'Verre', 'bells.density': 0.18, 'bells.range': 0.35,
      'grains.density': 0.25, 'texture.type': 'Pluie', 'texture.vol': 0.4,
      'fx.space': 0.7, 'fx.size': 0.9, 'fx.shimmer': 0.05, 'fx.tape': 0.45, 'fx.lofi': 0.3,
    },
    'Cathédrale': {
      'global.tempo': 48, 'global.key': 'F', 'global.scale': 'Ionien (majeur)',
      'drone.wave': 'Orgue', 'drone.tone': 0.5, 'pad.wave': 'Chœur', 'pad.attack': 0.9, 'pad.length': 6,
      'pad.vol': 0.65, 'bells.wave': 'Cloche', 'bells.density': 0.12, 'bells.decay': 0.85,
      'grains.on': false, 'texture.on': false,
      'fx.space': 0.85, 'fx.size': 1, 'fx.shimmer': 0.45, 'fx.echo': 0.15, 'fx.tape': 0.1, 'fx.lofi': 0,
    },
    'Océan intérieur': {
      'global.tempo': 60, 'global.key': 'E', 'global.scale': 'Dorien',
      'drone.wave': 'Creux', 'drone.motion': 0.7, 'pad.wave': 'Cordes', 'pad.vol': 0.45,
      'bells.on': false, 'grains.density': 0.55, 'grains.size': 0.75, 'grains.pitch': 'Octaves',
      'texture.type': 'Océan', 'texture.vol': 0.45, 'texture.motion': 0.3,
      'fx.space': 0.6, 'fx.shimmer': 0.25, 'fx.echo': 0.2,
    },
    'Cassette oubliée': {
      'global.tempo': 72, 'global.key': 'C', 'global.scale': 'Pentatonique maj.',
      'drone.vol': 0.3, 'pad.wave': 'Nappe', 'pad.tone': 0.25, 'bells.wave': 'Pluck', 'bells.density': 0.45,
      'grains.vol': 0.2, 'texture.type': 'Vinyle', 'texture.vol': 0.35,
      'fx.tape': 0.85, 'fx.lofi': 0.6, 'fx.echo': 0.45, 'fx.echoTime': '1/8.', 'fx.shimmer': 0,
    },
    'Jardin japonais': {
      'global.tempo': 64, 'global.key': 'D', 'global.scale': 'Hirajoshi',
      'drone.wave': 'Sub', 'drone.vol': 0.35, 'pad.wave': 'Verre', 'pad.vol': 0.35,
      'bells.wave': 'Kalimba', 'bells.density': 0.38, 'bells.range': 0.65,
      'grains.pitch': 'Accord', 'grains.density': 0.2, 'texture.type': 'Ruisseau', 'texture.vol': 0.35,
      'fx.space': 0.5, 'fx.echo': 0.4, 'fx.shimmer': 0.1,
    },
    'Feu de camp': {
      'global.tempo': 58, 'global.key': 'G', 'global.scale': 'Mixolydien',
      'drone.wave': 'Chaud', 'drone.tone': 0.2, 'pad.wave': 'Nappe', 'pad.tone': 0.3, 'pad.voicing': 0.3,
      'bells.wave': 'Pluck', 'bells.density': 0.22, 'bells.tone': 0.3,
      'grains.vol': 0.25, 'texture.type': 'Feu', 'texture.vol': 0.45,
      'fx.space': 0.4, 'fx.size': 0.5, 'fx.tape': 0.5, 'fx.lofi': 0.25,
    },
    'Forêt matinale': {
      'global.tempo': 70, 'global.key': 'G', 'global.scale': 'Pentatonique maj.',
      'drone.wave': 'Orgue', 'drone.vol': 0.3, 'pad.wave': 'Onde', 'pad.tone': 0.5, 'pad.attack': 0.5,
      'bells.wave': 'Kalimba', 'bells.density': 0.3, 'bells.range': 0.7,
      'grains.density': 0.3, 'grains.pitch': 'Octaves', 'texture.type': 'Oiseaux', 'texture.vol': 0.45,
      'fx.space': 0.45, 'fx.size': 0.6, 'fx.shimmer': 0.2, 'fx.echo': 0.35,
    },
    'Métropole nocturne': {
      'global.tempo': 62, 'global.key': 'C#', 'global.scale': 'Dorien',
      'drone.wave': 'Sub', 'drone.vol': 0.45, 'pad.wave': 'FM', 'pad.tone': 0.35, 'pad.length': 2,
      'bells.wave': 'Pluck', 'bells.density': 0.35, 'bells.tone': 0.35,
      'grains.vol': 0.25, 'grains.pitch': 'Libre', 'texture.type': 'Ville', 'texture.vol': 0.4,
      'fx.space': 0.5, 'fx.echo': 0.5, 'fx.echoTime': '1/8.', 'fx.tape': 0.55, 'fx.lofi': 0.35,
    },
    'Dérive spatiale': {
      'global.tempo': 40, 'global.key': 'B', 'global.scale': 'Par tons', 'global.evolve': 0.7,
      'drone.wave': 'Creux', 'drone.motion': 0.9, 'pad.wave': 'Chœur', 'pad.attack': 1, 'pad.length': 8,
      'bells.wave': 'Verre', 'bells.density': 0.1, 'grains.density': 0.7, 'grains.pitch': 'Libre', 'grains.spray': 0.8,
      'texture.type': 'Vent', 'texture.vol': 0.3,
      'fx.space': 0.9, 'fx.size': 1, 'fx.shimmer': 0.6, 'fx.echo': 0.35, 'fx.feedback': 0.75,
    },
  };
})();
