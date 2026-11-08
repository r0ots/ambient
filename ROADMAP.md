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
- [x] Grains sur fichier audio ou micro (8 s), shimmer (pitch-shift doppler dans la boucle reverb), minuteur de sommeil.
- [x] Mix vérifié en headless (tests/run.sh) : drone baissé (trim 0.2), mélodie remontée.

## Notes techniques
- L'extension Chrome n'est pas connectée : tester avec `tests/run.sh` (Chrome headless + serveur python qui logge `/__log?...`).
  Serveur : `python3 -u -m http.server 8765 2> $LOG`, puis `LOG=... tests/run.sh`. Capture : `--screenshot`.
- Scripts classiques (pas de modules ES) pour que `index.html` marche aussi en file://.

## À faire (priorité décroissante)
- [ ] Écran d'accueil/état vide du visualiseur + indicateur d'accord courant (nom de l'accord) et de la mesure
- [ ] Mode « Performance » : gros contrôles macro (Lumière/Ombre, Densité, Espace) + XY pad pour mobile
- [ ] Scènes A/B + slider Morph entre deux états
- [ ] Plus de moteurs de Pad (wavetable, FM pad) et de textures (feu, ville, oiseaux)
- [ ] PWA (manifest + service worker) pour installer comme appli
- [ ] Partage de patch via URL (state encodé dans le hash)
- [ ] Clavier / MIDI in pour jouer la mélodie par-dessus
- [ ] Responsive mobile
