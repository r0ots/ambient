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

- [x] v0.2 : HUD (nom d'accord, tonalité, mesure), gros bouton de lancement, pad XY sur le visualiseur (X = lumière, Y = densité).
- [x] v0.3 : scènes A/B + morph (manuel ou auto ping-pong 1–20 min), saturation tape à gain unitaire (loudness stable entre presets), master +4 dB.
- [x] v0.4 : pads Onde (wavetable morphé) et FM, textures Oiseaux et Ville, 2 presets, niveaux par moteur équilibrés (tests/engines.html).
- [x] v0.5 : Mélodie en mode Phrase (motif de 1/2/4 mesures relatif à l'accord, qui mute à chaque tour selon « Mutation »).
- [x] v0.6 : partage de patch par lien (#p=base64 du diff vs défauts), PWA installable (manifest, icône SVG, service worker network-first).
- [x] v0.7 : jeu live — clavier d'ordi (A–L notes en gamme, Q–P octave +, Z–M accords forcés), Web MIDI (notes < C3 = accords, CC1 densité, CC74 brillance, CC91 reverb, CC93 shimmer).
- [x] v0.8 : responsive mobile vérifié (tests/mobile.html = iframes 390/760 px), fix chevauchement des selects, déblocage audio iOS (audioSession + <audio> silencieux), Media Session (écran verrouillé).
- [x] v0.9 : Gel (Freeze) — capture des 4 dernières s du mix (ring buffer via ScriptProcessor) comme source des Grains, touche Entrée, flash visuel.
- [x] v0.10 : progressions d'accords (Aléatoire, Plane, Pendule, I–V–vi–IV, i–VI–III–VII, Montée, Perso = degrés tapés « 1 6 4 5 »), widget texte.
- [x] v0.11 : enregistrement WAV 16 bits stéréo sans perte (capture via le tap), ou compressé ; durée fixe 1/3/10/20 min avec fondu final ; plafond WAV 30 min.
- [x] v0.12 : tests/run-all.sh (8 pages, échoue sur toute erreur JS), lookahead 1.6 s quand l'onglet est en arrière-plan (timers bridés), UI tolérante aux éléments absents.
- [x] v0.13 : analyse spectrale par preset (tests/spectrum.html) → IR de reverb moins amortie, shimmer plus ouvert, shelf « air » +4 dB à 7 kHz (réduit par Lo-fi).

## Notes techniques
- L'extension Chrome n'est pas connectée : tester avec `tests/run.sh` (Chrome headless + serveur python qui logge `/__log?...`).
  Serveur : `python3 -u -m http.server 8765 2> $LOG`, puis `LOG=... tests/run-all.sh` (toujours avant commit). Capture : `--screenshot`.
- Niveaux cibles mesurés par tests/run.sh : rms 0.08–0.15 par preset, peak < 0.8.
- SW enregistré en relatif ('sw.js') : ne marche que depuis la racine (pas depuis tests/). Bumper CACHE dans sw.js si on ajoute des fichiers JS.
- Chrome headless ne descend pas sous ~500 px de large : passer par tests/mobile.html pour les captures mobiles.
- Le tap ScriptProcessor (engine.tap) tourne en permanence ; si perf mobile insuffisante, le passer en AudioWorklet.
- Spectre de référence (bandes sub/low/mid/high/air) : air ≈ −25 à −35 dB sous mid, c'est volontairement sombre ; ne pas sur-éclaircir.
- Scripts classiques (pas de modules ES) pour que `index.html` marche aussi en file://.

## À faire (priorité décroissante)
- [ ] LFO assignables simples par couche (filtre / volume / pan) avec vitesse très lente
