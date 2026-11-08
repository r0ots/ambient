// "Nouveau paysage": mood-based patch generator with coherent musical choices and a poetic name
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const { rand, pick } = AMB.util;

  // Each mood constrains choices so results stay musical. Ranges are [min, max].
  const MOODS = {
    Lumineux: {
      scales: ['Lydien', 'Ionien (majeur)', 'Pentatonique maj.', 'Mixolydien'], tempo: [60, 84],
      drone: ['Orgue', 'Chaud'], pad: ['Verre', 'Onde', 'Nappe', 'FM'], bells: ['Kalimba', 'Cloche', 'Verre'],
      textures: ['Oiseaux', 'Ruisseau', 'Vent'], progs: ['Aléatoire', 'I–V–vi–IV', 'Pendule I–IV', 'Montée I–ii–iii–IV'],
      fx: { space: [0.4, 0.65], shimmer: [0.15, 0.45], echo: [0.25, 0.45], tape: [0.1, 0.35], lofi: [0, 0.15] },
      tone: [0.45, 0.75], density: [0.25, 0.5],
      adj: [['doré', 'dorée'], ['clair', 'claire'], ['suspendu', 'suspendue'], ['naissant', 'naissante'], ['léger', 'légère'], ['ouvert', 'ouverte']], noun: [['Aube', 'f'], ['Clairière', 'f'], ['Lumière', 'f'], ['Pré', 'm'], ['Matin', 'm'], ['Éclaircie', 'f']],
    },
    Mélancolique: {
      scales: ['Éolien (mineur)', 'Dorien', 'Pentatonique min.'], tempo: [48, 66],
      drone: ['Sub', 'Chaud', 'Creux'], pad: ['Cordes', 'Nappe', 'Chœur'], bells: ['Verre', 'Pluck', 'Kalimba'],
      textures: ['Pluie', 'Vinyle', 'Ville'], progs: ['Aléatoire', 'i–VI–III–VII', 'Pendule I–IV'],
      fx: { space: [0.55, 0.8], shimmer: [0, 0.2], echo: [0.25, 0.5], tape: [0.3, 0.65], lofi: [0.15, 0.45] },
      tone: [0.2, 0.45], density: [0.15, 0.35],
      adj: [['gris', 'grise'], ['lointain', 'lointaine'], ['effacé', 'effacée'], ['tardif', 'tardive'], ['pâle', 'pâle'], ['oublié', 'oubliée']], noun: [['Pluie', 'f'], ['Mémoire', 'f'], ['Fenêtre', 'f'], ['Automne', 'm'], ['Souvenir', 'm'], ['Quai', 'm']],
    },
    Mystérieux: {
      scales: ['Phrygien', 'In Sen', 'Hirajoshi', 'Par tons'], tempo: [40, 60],
      drone: ['Creux', 'Sub'], pad: ['Chœur', 'FM', 'Onde'], bells: ['Cloche', 'Verre'],
      textures: ['Vent', 'Océan', 'Feu'], progs: ['Aléatoire', 'Plane (I)', 'Pendule I–IV'],
      fx: { space: [0.65, 0.95], shimmer: [0.25, 0.6], echo: [0.3, 0.55], tape: [0.1, 0.4], lofi: [0, 0.2] },
      tone: [0.25, 0.55], density: [0.08, 0.3],
      adj: [['voilé', 'voilée'], ['profond', 'profonde'], ['secret', 'secrète'], ['immobile', 'immobile'], ['sans fond', 'sans fond'], ['ancien', 'ancienne']], noun: [['Grotte', 'f'], ['Crypte', 'f'], ['Brume', 'f'], ['Abîme', 'm'], ['Forêt', 'f'], ['Temple', 'm']],
    },
    Contemplatif: {
      scales: ['Ionien (majeur)', 'Lydien', 'Dorien', 'Pentatonique maj.'], tempo: [44, 62],
      drone: ['Orgue', 'Chaud', 'Sub'], pad: ['Nappe', 'Verre', 'Chœur', 'Onde'], bells: ['Kalimba', 'Verre', 'Cloche'],
      textures: ['Ruisseau', 'Pluie', 'Océan', 'Vent'], progs: ['Plane (I)', 'Pendule I–IV', 'Aléatoire'],
      fx: { space: [0.55, 0.8], shimmer: [0.1, 0.35], echo: [0.15, 0.35], tape: [0.15, 0.4], lofi: [0, 0.2] },
      tone: [0.3, 0.55], density: [0.1, 0.28],
      adj: [['lent', 'lente'], ['immobile', 'immobile'], ['paisible', 'paisible'], ['silencieux', 'silencieuse'], ['intérieur', 'intérieure'], ['infini', 'infinie']], noun: [['Méditation', 'f'], ['Lac', 'm'], ['Horizon', 'm'], ['Souffle', 'm'], ['Jardin', 'm'], ['Rive', 'f']],
    },
    Nocturne: {
      scales: ['Dorien', 'Éolien (mineur)', 'Mixolydien', 'Pentatonique min.'], tempo: [54, 76],
      drone: ['Sub', 'Creux'], pad: ['FM', 'Nappe', 'Onde'], bells: ['Pluck', 'Kalimba'],
      textures: ['Ville', 'Pluie', 'Vinyle'], progs: ['i–VI–III–VII', 'Aléatoire', 'I–V–vi–IV'],
      fx: { space: [0.45, 0.7], shimmer: [0, 0.2], echo: [0.35, 0.6], tape: [0.35, 0.7], lofi: [0.2, 0.5] },
      tone: [0.25, 0.5], density: [0.25, 0.45],
      adj: [['nocturne', 'nocturne'], ['électrique', 'électrique'], ['endormi', 'endormie'], ['humide', 'humide'], ['bleu', 'bleue'], ['désert', 'déserte']], noun: [['Métropole', 'f'], ['Néon', 'm'], ['Avenue', 'f'], ['Quai', 'm'], ['Insomnie', 'f'], ['Toit', 'm']],
    },
    Aquatique: {
      scales: ['Lydien', 'Dorien', 'Pentatonique maj.', 'Par tons'], tempo: [50, 70],
      drone: ['Creux', 'Orgue', 'Sub'], pad: ['Onde', 'Verre', 'Cordes'], bells: ['Verre', 'Cloche', 'Kalimba'],
      textures: ['Océan', 'Ruisseau', 'Pluie'], progs: ['Aléatoire', 'Pendule I–IV', 'Montée I–ii–iii–IV'],
      fx: { space: [0.6, 0.85], shimmer: [0.2, 0.5], echo: [0.3, 0.55], tape: [0.25, 0.5], lofi: [0, 0.25] },
      tone: [0.35, 0.6], density: [0.18, 0.4],
      adj: [['immergé', 'immergée'], ['fluide', 'fluide'], ['bleu', 'bleue'], ['ondoyant', 'ondoyante'], ['marin', 'marine'], ['liquide', 'liquide']], noun: [['Lagune', 'f'], ['Abysse', 'm'], ['Marée', 'f'], ['Récif', 'm'], ['Courant', 'm'], ['Océan', 'm']],
    },
  };

  const r = (range) => rand(range[0], range[1]);

  function generate(moodName) {
    const name = moodName && MOODS[moodName] ? moodName : pick(Object.keys(MOODS));
    const m = MOODS[name];
    const keys = AMB.theory.NOTE_NAMES;
    const tone = r(m.tone), dens = r(m.density);
    const patch = {
      'global.tempo': Math.round(r(m.tempo)), 'global.key': pick(keys), 'global.scale': pick(m.scales),
      'global.evolve': rand(0.25, 0.6), 'global.time': (name === 'Mystérieux' || name === 'Contemplatif') && Math.random() < 0.6 ? 'Flottant' : Math.random() < 0.2 ? 'Flottant' : 'Pulsé',
      'drone.wave': pick(m.drone), 'drone.vol': rand(0.3, 0.55), 'drone.tone': tone * 0.8, 'drone.motion': rand(0.2, 0.8),
      'pad.wave': pick(m.pad), 'pad.vol': rand(0.4, 0.6), 'pad.tone': tone, 'pad.attack': rand(0.4, 1),
      'pad.length': pick([2, 3, 4, 4, 6, 8]), 'pad.voicing': rand(0.3, 0.9), 'pad.prog': pick(m.progs),
      'bells.on': Math.random() > 0.12, 'bells.wave': pick(m.bells), 'bells.density': dens, 'bells.tone': tone + rand(-0.1, 0.2),
      'bells.decay': rand(0.3, 0.85), 'bells.range': rand(0.3, 0.75), 'bells.mode': Math.random() < 0.45 ? 'Phrase' : 'Aléatoire',
      'bells.phraseLen': pick(['1 mes.', '2 mes.', '2 mes.', '4 mes.']), 'bells.mutate': rand(0.15, 0.5),
      'grains.on': Math.random() > 0.2, 'grains.vol': rand(0.2, 0.4), 'grains.density': rand(0.15, 0.6),
      'grains.size': rand(0.4, 0.85), 'grains.scan': Math.random(), 'grains.spray': rand(0.2, 0.7),
      'grains.pitch': pick(['Accord', 'Accord', 'Octaves', 'Libre']), 'grains.reverse': rand(0, 0.5), 'grains.glide': Math.random() < 0.3 ? rand(0.1, 0.4) : 0,
      'texture.on': Math.random() > 0.1, 'texture.type': pick(m.textures), 'texture.vol': rand(0.2, 0.45),
      'texture.tone': rand(0.3, 0.7), 'texture.motion': rand(0.3, 0.7),
      'fx.space': r(m.fx.space), 'fx.size': rand(0.55, 1), 'fx.revType': pick(['Hall', 'Hall', 'Plate', 'Cloud']), 'fx.predelay': rand(0.1, 0.6), 'fx.shimmer': r(m.fx.shimmer), 'fx.echo': r(m.fx.echo),
      'fx.echoTime': pick(['1/4.', '1/4', '1/8.', '1/2']), 'fx.feedback': rand(0.4, 0.75),
      'fx.tape': r(m.fx.tape), 'fx.lofi': r(m.fx.lofi),
      // one slow LFO on something meaningful
      'mod.l1target': pick(['pad.tone', 'fx.space', 'grains.scan', 'texture.vol', 'drone.tone']),
      'mod.l1rate': rand(0.2, 0.6), 'mod.l1depth': rand(0.2, 0.5), 'mod.l1shape': pick(['Sinus', 'Dérive']),
      'mod.l2target': '—',
    };
    const [noun, gender] = pick(m.noun);
    const adj = pick(m.adj)[gender === 'f' ? 1 : 0];
    const title = `${noun} ${adj}`;
    return { mood: name, title, patch };
  }

  AMB.generator = { MOODS, generate };
})();
