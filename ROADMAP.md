# Ambient — machine à ambient générative (web)

Inspiration : Sonicware LIVEN Ambient Ø (couches génératives, textures, FX "espace") et LIVEN Evoke (granulaire, sampling).
Stack : HTML + CSS + JS vanilla, Web Audio API, aucun build. Ouvrir `index.html` directement ou `python3 -m http.server`.

## Consignes pour chaque itération de la boucle (/loop)
1. Lire ce fichier, choisir la prochaine tâche de la section « À faire » (la plus utile en premier).
2. L'implémenter proprement, vérifier dans Chrome (console sans erreur, son qui sort via l'AnalyserNode).
3. Commit git local (pas de push), cocher la tâche, noter ici toute décision/limite découverte.
4. Ajuster cette liste si une meilleure idée apparaît (c'est le « prompt » évolutif).

## Fait
- [x] v0.1 : moteur audio (bus master, reverb à convolution générée, delay filtré, tape wobble/saturation, lo-fi), 5 couches (Drone, Pad, Bells FM, Grains, Texture), séquenceur génératif (progressions d'accords, marche aléatoire), gammes, UI à knobs, visualiseur, presets, Evolve, enregistrement.

## À faire (priorité décroissante)
- [ ] Vérifier v0.1 dans Chrome, corriger bugs et niveaux (mix équilibré, pas de clipping)
- [ ] Sampling façon Evoke : charger un fichier audio / micro comme source des Grains
- [ ] Scènes A/B + slider Morph entre deux états
- [ ] Shimmer reverb (octave up dans la boucle de reverb)
- [ ] Plus de moteurs de Pad (wavetable, FM pad) et de textures (feu, ville, oiseaux)
- [ ] Mode « Sleep » : fade-out programmé (15/30/60 min)
- [ ] PWA (manifest + service worker) pour installer comme appli
- [ ] Partage de patch via URL (state encodé dans le hash)
- [ ] Clavier / MIDI in pour jouer la mélodie par-dessus
- [ ] Responsive mobile
