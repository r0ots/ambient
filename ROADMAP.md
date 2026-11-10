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
- [x] v0.14 : section Modulation — 2 LFO lents (4 s à 10 min, sinus/triangle/dérive) assignables à n'importe quel paramètre continu, autour de la valeur utilisateur.
- [x] v0.15 : « ✦ Paysage » — générateur par humeur (Lumineux, Mélancolique, Mystérieux, Contemplatif, Nocturne, Aquatique) avec choix cohérents et nom poétique accordé en genre.
- [x] Tests accélérés (~5 min → ~1 min) : attentes × 0.4 (paramètre ?s=), Chrome --mute-audio, 3 pages en parallèle, logs tagués par page.
- [x] v0.16 : visuels Orbes / Horizon / Spectre (mémorisé), mode Écoute plein écran (Échap), URL kiosque ?viz=&listen=1&autoplay=1&mood=.
- [x] v0.17 : aide (bouton ? / touche ?), toast de première visite.
- [x] v0.18 : voice leading — basse sur la fondamentale, voix supérieures placées au plus près de l'accord précédent (notes communes tenues, pas de clusters de seconde).
- [x] v0.19 : reverb à 3 caractères (Hall avec réflexions précoces, Plate dense et brillante, Cloud à attaque gonflée) + pré-délai 0–250 ms.
- [x] v0.20 : Grains — probabilité Reverse (copie inversée en cache) et Glissando (rampe de pitch jusqu'à ±12 demi-tons vers la note).
- [x] v0.21 : test d'endurance (tests/endurance.html, hors suite rapide) en config extrême 60 s : voix de pad bornées (~28), heap stable (15–22 Mo), lag main thread ≤ 4 ms. fx.size retiré des cibles LFO (reconstruit l'IR).
- [x] v0.22 : Journal de session (un « moment » par changement d'accord, ≥15 s d'écart, 48 max) : clic = revenir à l'état, ♥ Garder = patch utilisateur. Anneau du visualiseur lissé.
- [x] v0.23 : vue Simple (5 grosses macros : Lumière, Densité, Espace, Nostalgie, Nature) ↔ Expert, mémorisée, ?view=simple.
- [x] v0.24 : barre d'outils sur une ligne — Sauver, Partager, MIDI, Sommeil, Aide dans un menu « ⋯ » ; compte à rebours du sommeil visible dans la barre.
- [x] v0.25 : annuler/rétablir (⌘Z / ⇧⌘Z, Ctrl+Y) des gestes, presets, macros et paysages générés ; groupés par 700 ms ; Evolve/LFO/morph ignorés ; volume jamais annulé.
- [x] v0.27 : macros synchronisées avec l'état réel (inverse moyen des mappings) après preset, annulation, morph ou édition directe.
- [x] v0.28 : README utilisateur complet, interrupteurs de couches dans la vue Simple, diapason 440/432 Hz.
- [x] v0.29 : accessibilité — knobs role=slider avec aria-valuenow/valuetext, flèches/PgUp/PgDn/Home/End, selects et interrupteurs étiquetés (aria-pressed), focus visible.
- [x] v0.30 : contre-chant (Pad) — voix intérieure lente, notes tenues de l'accord, mouvement conjoint, dosée par « Contre-chant » (evolve).
- [x] v0.31 : ui.js découpé (widgets.js, perform.js, rec.js) ; test tests/app.html qui pilote la vraie page (iframe) via ses boutons.
- [x] v0.32 : presets d'usine enrichis (contre-chant, caractères de reverb, LFO, reverse/glissando) ; « ☀ Paysage du jour » déterministe par date.
- [x] v0.33 : tap de sortie (Gel + WAV) en AudioWorklet chargé par Blob URL, repli ScriptProcessor ; endurance inchangée (heap 15–28 Mo, lag ≤ 5 ms).
- [x] v0.34 : gestion des patchs (renommer, supprimer avec confirmation) ; export/import .json des patchs + scènes A/B, sans écraser (suffixe « (importé) »).
- [x] v0.35 : corrections issues d'une revue de code indépendante — verrou d'accord forcé réinitialisé au Play, grains justes en 432 Hz, fin de Rec/sommeil pendant un fondu ne laisse plus la sortie muette, minuteur réglé avant Lecture respecté, reselection du paysage généré, release sans clic d'un pad en attaque, valeurs invalides (lien/import) ignorées au lieu de planter, patchs/liens/scènes sauvent la valeur utilisateur (pas la valeur modulée), renommage sans écrasement silencieux, SW ne cache plus les erreurs.
- [x] v0.36 : Séquenceur piano roll — voix dédiée (5 moteurs dont « Doux » tenu), grille 1/2/4 mesures en degrés de la gamme (toujours juste), suit les accords, swing, octave ; clic/glisser pour dessiner, décalages, motif aléatoire, « Capturer la mélodie » ; motif stocké dans le patch (presets, liens, scènes, ⌘Z).
- [x] v0.37 : « Pulsations » — séquenceur rythmique 4 pistes × 16 pas (feutre, shaker, bois, clochette sur notes de l'accord), Présence (probabilité), swing, générateur euclidien, Aérer ; dispersé en temps Flottant ; le générateur l'active parfois (Nocturne/Lumineux/Aquatique).
- [x] v0.38 : piano roll — vélocité par note (molette, opacité), probabilité 100/70/50/20 % (clic droit, contour pointillé), Mutation (le motif dérive à chaque tour, hors annulation) + « ↺ Original ».
- [x] v0.39 : panneau Progression — 8 cases d'accords diatoniques (chiffrage + nom réel selon tonalité/gamme), palette I–VII, case en cours surlignée, « Suggérer » (marche fonctionnelle), écrit pad.custom/Perso.
- [x] v0.40 : piano roll à 4 motifs A–D (onglets, ⧉ Dupliquer vers l'emplacement libre) + « Chaîne » (ex. « A A B C ») jouée en boucle ; onglet en cours de lecture surligné ; mutation par motif.

## Notes techniques
- L'extension Chrome n'est pas connectée : tester avec `tests/run.sh` (Chrome headless + serveur python qui logge `/__log?...`).
  Serveur : `python3 -u -m http.server 8765 2> $LOG`, puis `LOG=... tests/run-all.sh` (toujours avant commit). Capture : `--screenshot`.
- Niveaux cibles mesurés par tests/run.sh : rms 0.08–0.15 par preset, peak < 0.8.
- SW enregistré en relatif ('sw.js') : ne marche que depuis la racine (pas depuis tests/). Bumper CACHE dans sw.js si on ajoute des fichiers JS.
- Chrome headless ne descend pas sous ~500 px de large : passer par tests/mobile.html pour les captures mobiles.
- Spectre de référence (bandes sub/low/mid/high/air) : air ≈ −25 à −35 dB sous mid, c'est volontairement sombre ; ne pas sur-éclaircir.
- Tests : garder la suite complète sous ~1 min 30 (demande de l'utilisateur). Pas plus de 3 Chrome en parallèle (au-delà : chargements ratés). `--mute-audio` évite le contexte audio bloqué.
- Endurance : `LOG=... tests/run.sh endurance.html 1` (~70 s ; run.sh coupe à 50 s, les 5 premiers relevés suffisent), à lancer après tout changement du moteur.
- Si les logs de test s'interrompent d'un bloc (toutes pages figées), c'est la machine qui dort, pas un bug.
- Scripts classiques (pas de modules ES) pour que `index.html` marche aussi en file://.

## À faire (priorité décroissante)
Demande utilisateur (10/11) : « rajoute des trucs genre piano roll, sequencer etc. » → priorité aux outils de composition.
- [ ] Export MIDI (.mid) du motif et de la progression
