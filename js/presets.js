// Factory presets (partial patches merged over defaults)
(function () {
  const AMB = (window.AMB = window.AMB || {});

  AMB.PRESETS = {
    'Aube lydienne': { 'pad.counter': 0.3, 'fx.revType': 'Hall', 'mod.l1target': 'pad.tone', 'mod.l1rate': 0.4 },
    'Nuit sous la pluie': {
      'global.tempo': 56, 'global.key': 'A', 'global.scale': 'Éolien (mineur)',
      'drone.wave': 'Sub', 'drone.tone': 0.25, 'pad.wave': 'Verre', 'pad.tone': 0.3,
      'bells.wave': 'Verre', 'bells.density': 0.18, 'bells.range': 0.35,
      'grains.density': 0.25, 'texture.type': 'Pluie', 'texture.vol': 0.4,
      'fx.space': 0.7, 'fx.size': 0.9, 'fx.shimmer': 0.05, 'fx.tape': 0.45, 'fx.lofi': 0.3,
      'fx.revType': 'Plate', 'grains.reverse': 0.4, 'pad.counter': 0.35, 'mod.l1target': 'texture.vol', 'mod.l1rate': 0.3, 'mod.l1depth': 0.35, 'mod.l1shape': 'Dérive',
    },
    'Cathédrale': {
      'global.tempo': 48, 'global.key': 'F', 'global.scale': 'Ionien (majeur)', 'global.time': 'Flottant',
      'drone.wave': 'Orgue', 'drone.tone': 0.5, 'pad.wave': 'Chœur', 'pad.attack': 0.9, 'pad.length': 6, 'pad.prog': 'Pendule I–IV',
      'pad.vol': 0.65, 'bells.wave': 'Cloche', 'bells.density': 0.12, 'bells.decay': 0.85,
      'grains.on': false, 'texture.on': false,
      'fx.space': 0.85, 'fx.size': 1, 'fx.revType': 'Hall', 'fx.predelay': 0.55, 'fx.shimmer': 0.45, 'pad.counter': 0.5, 'fx.echo': 0.15, 'fx.tape': 0.1, 'fx.lofi': 0,
    },
    'Océan intérieur': {
      'global.tempo': 60, 'global.key': 'E', 'global.scale': 'Dorien',
      'drone.wave': 'Creux', 'drone.motion': 0.7, 'pad.wave': 'Cordes', 'pad.vol': 0.45,
      'bells.on': false, 'grains.density': 0.55, 'grains.size': 0.75, 'grains.pitch': 'Octaves',
      'texture.type': 'Océan', 'texture.vol': 0.45, 'texture.motion': 0.3,
      'fx.space': 0.6, 'fx.shimmer': 0.25, 'fx.echo': 0.2,
      'fx.revType': 'Cloud', 'grains.glide': 0.25, 'texture.motion': 0.6, 'mod.l1target': 'grains.scan', 'mod.l1rate': 0.25, 'mod.l1depth': 0.6,
    },
    'Cassette oubliée': {
      'global.tempo': 72, 'global.key': 'C', 'global.scale': 'Pentatonique maj.',
      'drone.vol': 0.3, 'pad.wave': 'Nappe', 'pad.tone': 0.25, 'bells.wave': 'Pluck', 'bells.density': 0.45,
      'grains.vol': 0.2, 'texture.type': 'Vinyle', 'texture.vol': 0.35,
      'fx.tape': 0.85, 'fx.lofi': 0.6, 'fx.revType': 'Plate', 'fx.predelay': 0.1, 'fx.echo': 0.45, 'fx.echoTime': '1/8.', 'fx.shimmer': 0,
    },
    'Jardin japonais': {
      'global.tempo': 64, 'global.key': 'D', 'global.scale': 'Hirajoshi',
      'drone.wave': 'Sub', 'drone.vol': 0.35, 'pad.wave': 'Verre', 'pad.vol': 0.35,
      'bells.wave': 'Kalimba', 'bells.density': 0.38, 'bells.range': 0.65, 'bells.mode': 'Phrase', 'bells.mutate': 0.25,
      'grains.pitch': 'Accord', 'grains.density': 0.2, 'texture.type': 'Ruisseau', 'texture.vol': 0.35,
      'fx.space': 0.5, 'fx.echo': 0.4, 'fx.shimmer': 0.1,
      'fx.revType': 'Plate', 'fx.predelay': 0.45, 'pad.counter': 0.2,
    },
    'Feu de camp': {
      'global.tempo': 58, 'global.key': 'G', 'global.scale': 'Mixolydien',
      'drone.wave': 'Chaud', 'drone.tone': 0.2, 'pad.wave': 'Nappe', 'pad.tone': 0.3, 'pad.voicing': 0.3,
      'bells.wave': 'Pluck', 'bells.density': 0.22, 'bells.tone': 0.3,
      'grains.vol': 0.25, 'texture.type': 'Feu', 'texture.vol': 0.45,
      'fx.space': 0.4, 'fx.size': 0.5, 'fx.tape': 0.5, 'fx.lofi': 0.25,
      'pad.counter': 0.4, 'mod.l1target': 'fx.tape', 'mod.l1rate': 0.2, 'mod.l1depth': 0.3, 'mod.l1shape': 'Dérive',
    },
    'Forêt matinale': {
      'global.tempo': 70, 'global.key': 'G', 'global.scale': 'Pentatonique maj.',
      'drone.wave': 'Orgue', 'drone.vol': 0.3, 'pad.wave': 'Onde', 'pad.tone': 0.5, 'pad.attack': 0.5,
      'bells.wave': 'Kalimba', 'bells.density': 0.3, 'bells.range': 0.7, 'bells.mode': 'Phrase', 'bells.phraseLen': '1 mes.', 'bells.mutate': 0.4,
      'grains.density': 0.3, 'grains.pitch': 'Octaves', 'texture.type': 'Oiseaux', 'texture.vol': 0.45,
      'fx.space': 0.45, 'fx.size': 0.6, 'fx.shimmer': 0.2, 'fx.echo': 0.35,
      'fx.revType': 'Hall', 'pad.prog': 'Montée I–ii–iii–IV', 'mod.l1target': 'bells.density', 'mod.l1rate': 0.35, 'mod.l1depth': 0.4,
    },
    'Métropole nocturne': {
      'global.tempo': 62, 'global.key': 'C#', 'global.scale': 'Dorien',
      'drone.wave': 'Sub', 'drone.vol': 0.45, 'pad.wave': 'FM', 'pad.tone': 0.35, 'pad.length': 2, 'pad.prog': 'i–VI–III–VII',
      'bells.wave': 'Pluck', 'bells.density': 0.35, 'bells.tone': 0.35,
      'grains.vol': 0.25, 'grains.pitch': 'Libre', 'texture.type': 'Ville', 'texture.vol': 0.4,
      'fx.space': 0.5, 'fx.echo': 0.5, 'fx.echoTime': '1/8.', 'fx.tape': 0.55, 'fx.lofi': 0.35,
    },
    'Dérive spatiale': {
      'global.tempo': 40, 'global.key': 'B', 'global.scale': 'Par tons', 'global.evolve': 0.7, 'global.time': 'Flottant',
      'drone.wave': 'Creux', 'drone.motion': 0.9, 'pad.wave': 'Chœur', 'pad.attack': 1, 'pad.length': 8,
      'bells.wave': 'Verre', 'bells.density': 0.1, 'grains.density': 0.7, 'grains.pitch': 'Libre', 'grains.spray': 0.8,
      'texture.type': 'Vent', 'texture.vol': 0.3,
      'fx.space': 0.9, 'fx.size': 1, 'fx.revType': 'Cloud', 'fx.shimmer': 0.6, 'fx.echo': 0.35, 'fx.feedback': 0.75,
      'grains.reverse': 0.5, 'grains.glide': 0.4, 'pad.counter': 0.5, 'mod.l1target': 'fx.shimmer', 'mod.l1rate': 0.2, 'mod.l1depth': 0.5, 'mod.l2target': 'drone.tone', 'mod.l2rate': 0.15, 'mod.l2depth': 0.5, 'mod.l2shape': 'Dérive',
    },
    // ---- dark landscapes (v1.14 sound prototype) ----
    // detuned saw brass whose filter opens slowly, a gliding brass lead, spaced iron bells, rain, a sub drone, a huge dark hall
    'Pluie sur la ville': {
      'global.tempo': 42, 'global.key': 'D', 'global.scale': 'Éolien (mineur)', 'global.evolve': 0.25, 'global.swing': 0,
      'drone.wave': 'Sub', 'drone.vol': 0.55, 'drone.tone': 0.12, 'drone.motion': 0.2, 'drone.send': 0.4,
      'pad.wave': 'Cuivres', 'pad.vol': 0.6, 'pad.tone': 0.32, 'pad.attack': 0.75, 'pad.length': 4, 'pad.prog': 'i–VI–III–VII', 'pad.voicing': 0.25, 'pad.counter': 0.1, 'pad.send': 0.75,
      'bells.wave': 'Lame', 'bells.vol': 0.5, 'bells.density': 0.16, 'bells.range': 0.3, 'bells.decay': 0.8, 'bells.tone': 0.35, 'bells.send': 0.8,
      'grains.on': false,
      'texture.type': 'Pluie', 'texture.vol': 0.5, 'texture.tone': 0.3, 'texture.motion': 0.35, 'texture.send': 0.2,
      'perc.on': true, 'perc.kit': 'Métal', 'perc.steps': '32', 'perc.vol': 0.5, 'perc.prob': 0.75, 'perc.send': 0.9, 'perc.tone': 0.3,
      'perc.pattern': '00000000000000000000000000000000.00000000000000000000000000000000.00000000000000000000000000000000.30000000000000000000200000000000',
      'fx.space': 0.85, 'fx.size': 1, 'fx.revType': 'Hall', 'fx.predelay': 0.4, 'fx.shimmer': 0, 'fx.echo': 0.2, 'fx.echoTime': '1/4.', 'fx.feedback': 0.5, 'fx.tape': 0.2, 'fx.lofi': 0.2,
      'mod.l1target': 'pad.tone', 'mod.l1rate': 0.3, 'mod.l1depth': 0.4, 'mod.l2target': 'texture.vol', 'mod.l2rate': 0.25, 'mod.l2depth': 0.3, 'mod.l2shape': 'Dérive',
    },
    // damaged drone (distortion + few bits), a pad that wears out, silences, rare heavy impacts, wind and tape hiss
    'Ruines': {
      'global.tempo': 46, 'global.key': 'F', 'global.scale': 'Phrygien', 'global.time': 'Flottant', 'global.evolve': 0.45,
      'drone.wave': 'Abîmé', 'drone.vol': 0.55, 'drone.tone': 0.3, 'drone.motion': 0.55, 'drone.follow': false, 'drone.send': 0.5,
      'pad.wave': 'Cendre', 'pad.vol': 0.5, 'pad.tone': 0.3, 'pad.attack': 0.85, 'pad.length': 8, 'pad.prog': 'Pendule I–IV', 'pad.voicing': 0.15, 'pad.counter': 0,
      'bells.wave': 'Cloche', 'bells.density': 0.05, 'bells.tone': 0.15, 'bells.range': 0.2, 'bells.decay': 0.9,
      'grains.density': 0.15, 'grains.size': 0.9, 'grains.reverse': 0.6, 'grains.pitch': 'Octaves', 'grains.vol': 0.25, 'grains.spray': 0.6, 'grains.scan': 0.1,
      'texture.type': 'Vent', 'texture.vol': 0.35, 'texture.tone': 0.15, 'texture.motion': 0.6,
      'perc.on': true, 'perc.kit': 'Métal', 'perc.steps': '32', 'perc.vol': 0.6, 'perc.prob': 0.4, 'perc.send': 0.7, 'perc.tone': 0.1,
      'perc.pattern': '30000000000000000000000000000000.00000000000000000000000000000000.00000000000000000000001000000000.00000000000000000000000000000000',
      'fx.space': 0.7, 'fx.size': 0.85, 'fx.revType': 'Cloud', 'fx.predelay': 0.2, 'fx.shimmer': 0, 'fx.echo': 0.15, 'fx.tape': 0.6, 'fx.lofi': 0.5,
      'mod.l1target': 'drone.tone', 'mod.l1rate': 0.2, 'mod.l1depth': 0.5, 'mod.l1shape': 'Dérive', 'mod.l2target': 'pad.vol', 'mod.l2rate': 0.3, 'mod.l2depth': 0.6, 'mod.l2shape': 'Dérive',
    },
    // pulsed distorted sub, metal and industrial percussion, waves that climb (filter + intensity) then fall back
    'Menace': {
      'global.tempo': 76, 'global.key': 'C', 'global.scale': 'Phrygien', 'global.swing': 0, 'global.evolve': 0.2,
      'drone.wave': 'Abîmé', 'drone.vol': 0.85, 'drone.tone': 0.35, 'drone.motion': 0.25, 'drone.follow': false,
      'pad.wave': 'Cendre', 'pad.vol': 0.35, 'pad.tone': 0.2, 'pad.length': 4, 'pad.prog': 'Pendule I–IV', 'pad.voicing': 0.1, 'pad.counter': 0,
      'bells.on': false, 'bells.wave': 'Lame', 'grains.on': false,
      'bass.on': true, 'bass.wave': 'Saturée', 'bass.vol': 0.75, 'bass.tone': 0.3, 'bass.decay': 0.35, 'bass.send': 0.1,
      'bass.pattern': '1010101010101010.0000000000000000.0000000000000000.0000000000000000',
      'texture.type': 'Ville', 'texture.vol': 0.3, 'texture.tone': 0.2,
      'perc.on': true, 'perc.kit': 'Métal', 'perc.vol': 0.6, 'perc.prob': 0.75, 'perc.send': 0.35, 'perc.tone': 0.35,
      'perc.pattern': '3000000000300000.0020002000200022.0000100000001010.0000000000000000',
      'fx.space': 0.5, 'fx.size': 0.6, 'fx.revType': 'Plate', 'fx.shimmer': 0, 'fx.echo': 0.25, 'fx.echoTime': '1/8.', 'fx.feedback': 0.4, 'fx.tape': 0.7, 'fx.lofi': 0.2,
      'mod.l1target': 'drone.tone', 'mod.l1shape': 'Montée', 'mod.l1rate': 0.62, 'mod.l1depth': 0.85,
      'mod.l2target': 'perc.prob', 'mod.l2shape': 'Montée', 'mod.l2rate': 0.62, 'mod.l2depth': 0.8,
    },
  };
})();
