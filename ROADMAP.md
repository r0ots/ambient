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
- [x] v0.41 : export MIDI (.mid type 1, 96 ppq) — tempo/tonalité, piste Accords (voicings du Pad), piste Séquenceur (chaîne A–D, suit les accords, vélocités), piste Pulsations (canal batterie GM) ; longueur = multiple commun des cycles (≤ 64 mesures).
- [x] v0.42 : arpégiateur du Séquenceur (Jeu : Piano roll / Arpège) — monte, descend, aller-retour, aléatoire sur les notes de l'accord courant, 1/16 à 1/4, étendue 1–3 octaves, accents de temps, swing.
- [x] v0.43 : piste d'Automation — courbe dessinée à la souris (32 points) sur 4–32 mesures pour n'importe quel paramètre continu, formes Montée/Descente/Vague/Hasard/Plat, tête de lecture, valeur utilisateur restaurée à l'arrêt.
- [x] v0.44 : import MIDI dans le motif édité (piste la plus fournie hors batterie, quantification 1/16 et sur la gamme, longueur 1/2/4 mesures auto, octave ajustée, vélocités conservées, suit-accords coupé).
- [x] v0.45 : lancement de motif quantifié — changer d'onglet A–D pendant la lecture démarre le nouveau motif au prochain tour (onglet clignotant en attente).
- [x] v0.46 : mode Morceau — sections (instantané complet du son) de 4 à 64 mesures, renommables/réordonnables, lecture enchaînée avec fondu de 2 mesures des réglages continus, barre de progression, boucle, durée totale ; inclus dans l'export/import.
- [x] v0.47 : piano roll — sélection (Alt+glisser, ⌘A), ⌘C/⌘X/⌘V (au dernier pas cliqué), ⌘D dupliquer à la suite, Suppr, flèches ↑↓ transposer (Maj = octave), ←→ décaler (Maj = temps) ; notes sélectionnées cerclées de blanc.
- [x] v0.48 : Pulsations — intensité par pas (doux / normal / accent via clic droit ou molette), 16 ou 32 pas (⧉ Doubler), kit Organique (tambour, bâton de pluie, goutte, kalimba) ; ancien format de motif relu automatiquement ; export MIDI avec vélocités.
- [x] v0.49 : « ● Rec live » — enregistre en boucle (overdub) ce qu'on joue au clavier d'ordi ou en MIDI dans le motif édité, quantifié à la double-croche et sur la gamme, vélocité conservée ; on entend la voix du séquenceur pendant l'enregistrement.
- [x] v0.50 : métronome pendant Rec live ; séquenceur de Basse — 4 rôles relatifs à l'accord (fondamentale, quinte, octave, approche vers l'accord suivant) × 16 pas, 3 sons (Sub, Ronde, Pluck), motifs Tenue/Pulsé/Quintes/Marche/Octaves, durée jusqu'au pas suivant.
- [x] v0.51 : réglage global « Humain » (décalage ±25 ms + vélocité variable) sur Séquenceur, arpège, Basse et Pulsations ; aide et README mis à jour avec toute la partie Composer.
- [x] v0.52 : corrections issues d'une revue des outils de composition — sections du Morceau appliquées avant le calcul du pas (progression et chaîne repartent au début), automation protégée d'Evolve/LFO/fondus/morph, ⌘Z ne déplace plus les valeurs de référence modulées, Stop arrête aussi le Morceau et le Rec live, approche de basse en degrés et seulement avant le changement d'accord, MIDI : notes hors longueur exclues, piste Séquenceur seulement si active, voicings d'export cohérents, import calé sur la première note-on.
- [x] v0.53 : piano roll — glisser une note (ou toute la sélection) pour la déplacer, glisser sa dernière case pour l'allonger/raccourcir, clic simple = supprimer ; lignes des notes de l'accord en cours surlignées.

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
- Flake connu (1 occurrence, 10/11 22:31) : tests/app.html « AMB.ui undefined → toast » dans l'iframe ; non reproduit au 2e passage. À surveiller (piste : SW/cache dans l'iframe).
- Scripts classiques (pas de modules ES) pour que `index.html` marche aussi en file://.

## À faire (priorité décroissante)
### Refonte « lisible + rétro » (11/11) — décidée après 3 revues (débutant, musicien, designer)
Constat : ~120 réglages visibles sans hiérarchie, 7 façons de mémoriser un état, 5 façons de bouger les mêmes knobs, libellés jargon. Gel des nouvelles features tant que la refonte n'est pas finie.

**✅ Refonte terminée (v0.54 → v0.63).**

**Phase A — Clarté (priorité 1)**
- [x] A1. (v0.54) 3 modes en sélecteur segmenté (état visible) : **Écouter** (défaut 1re visite : écran + 5 macros + couches + humeur), **Sculpter** (couches, Global, Espace, Modulation, Scènes, Journal), **Composer** (Progression → Mélodie écrite → Basse → Pulsations → Automation → Morceau, dans cet ordre)
- [x] A2. (v0.55) Barre du haut : groupes légendés (Lecture / Son / Enreg. / Vue), Rec + format + durée regroupés, « ✦ Nouveau paysage » + Humeur
- [x] A3. (v0.56) Renommer le jargon (Evolve→Dérive, Shimmer→Halo, Tape→Cassette, Lo-fi→Usure, Envoi FX→Espace, Moteur→Son, Tonalité(timbre)→Couleur, Temps Pulsé/Flottant→Rythme Régulier/Libre, Temps(delay)→Vitesse écho, Caractère→Salle, Mutation→Variation, Gel→Figer, Humain→Imprécision, LFO→Mouvement lent, Séquenceur→Mélodie écrite, Mélodie→Mélodie auto…)
- [x] A4. (v0.56) Infobulles d'explication (`hint` dans SCHEMA) sur les ~40 réglages principaux
- [x] A5. (v0.57) Pad XY visible (légendes lisibles, bulle d'aide après le 1er Play) et branché sur les macros Lumière/Densité (plus de table en double)
- [x] A6. (v0.57) Piano roll : « Suit accords » désactivé par défaut (activé seulement pour l'arpège)

**Phase B — Look rétro « synthé japonais fin 80, version nuit » (Juno-106/D-50)**
- [x] B1. (v0.58) Tokens (anthracite, crème, ambre LCD), polices IBM Plex Sans Condensed / Plex Mono / VT323, panneaux biseautés numérotés, boutons membrane avec LED, knobs à anneau segmenté, selects en mini-LCD
- [x] B2. (v0.59) Écran LCD d'état dans la barre (patch, tonalité, tempo, accord, mesure, ▶/■, REC) ; visualiseur en CRT (cadre, scanlines discrètes) ; canvas piano roll ambre, automation vert phosphore ; prefers-reduced-motion respecté

**Phase C — Modèle de composition consolidé + bugs**
- [x] C1. (v0.60) Morceau : les sections ne copient plus les motifs/progression (partagés) → corriger un motif met à jour tout le morceau ; touches 1–8 = aller à la section (au prochain temps fort)
- [x] C2. (v0.60) Transitions de section : pas relatif au début de section (accords, chaîne A–D, approche de basse non tronqués)
- [x] C3. (v0.61) Progression : une seule source (le panneau), retirer le select/texte du Pad ; durée par case
- [x] C4. (v0.62) Bugs revue : journal en stableSnapshot ; XY/CC MIDI en source non-annulable ; degrés > 7 ; jeu clavier audible à l'arrêt ; mutation qui écrase le motif sauvegardé ; swing unifié
- [x] C5. (v0.63) Export MIDI : piste Basse + export du Morceau entier

**Backlog (après la refonte)** : horloge MIDI + note-off, MIDI learn, mute/solo, parameter locks, stems WAV par couche, banc de scènes 8 slots.

### Parcours « Jardin sonore » — gamification (11/11)
Demande utilisateur : gamifier l'outil comme un **incrémental actif** (pas idle : rien ne se gagne en attendant), interactif / puzzle, avec un **arbre de déblocage**. Public : musiciens ou non ; le but est de découvrir l'outil et débloquer des choses, pas d'apprendre la musique.
Décisions :
- Progression **permanente**, **pas de prestige**.
- On ne juge **jamais le beau** : seulement l'**usage** (découvertes, contrats vérifiables) ou l'**atteinte d'une cible** (énigmes).
- Ressource « éclats ✧ » gagnée par : découvertes (1re utilisation d'un réglage/d'une action), contrats d'usage, énigmes à cible. Jamais par le temps d'écoute.
- Arbre permanent : tronc (Drone + 1 réglage) puis 4 branches Harmonie / Espace / Mouvement / Composer, ~30 nœuds = fonctions existantes ; coûts croissants ; certains nœuds sont des **portes** qui demandent une énigme.
- Incrémental : chaque déblocage ouvre de nouvelles découvertes et contrats (plus de façons de gagner) pendant que les coûts montent.
- « Mode libre » (tout débloqué) toujours accessible : l'appli actuelle reste intacte derrière.
Technique : `js/game.js` (état `localStorage` `ambient.game.v1`, clé surchargée par `window.AMB_GAME_KEY` dans les tests ; `mode` null = pas encore choisi, se comporte comme libre ; événements `game:earn|spend|unlock|found|contracts|puzzles|mode|reset` sur AMB.bus), arbre en données, `data-node` sur l'UI + table param→nœud ; test `tests/game.html` dans run-all.

**G1 — Fondations**
- [x] G1.1 (v0.64) `game.js` : état persistant (éclats, nœuds achetés, découvertes, contrats, énigmes, mode libre), API earn/spend/unlock/isUnlocked, événements bus ; `tests/game.html`
- [x] G1.2 (v0.65) Arbre en données (`js/tree.js` : 38 nœuds, coût total ~1030 ✧, 5 portes p.premier/p.gamme/p.espace/p.mouvement/p.composer ; tout réglage du SCHEMA résolu exact > `*.suffixe` > `section.*` ; `ui` = noms de fonctions pour `data-node` ; racine offerte au démarrage du parcours) (~30 nœuds, tronc + 4 branches, coûts, prérequis, portes) ; le test vérifie : pas de cycle, tout nœud atteignable
- [x] G1.3 (v0.66) Rattacher chaque réglage (param → nœud) et chaque élément d'UI (`data-node`) à un nœud ; le test vérifie que tout réglage visible appartient à un nœud. Fait : widgets avec `data-key`, `AMB.tree.tagDom()` écrit `data-node` (+ `data-ui` pour les fonctions, table `UI_SEL`) en fin de build ; tests/app.html vérifie 0 réglage sans nœud et chaque fonction trouvée. Une fonction accordée par plusieurs nœuds (mode-compose : h.prog ou c.seq) → utiliser `tree.uiUnlocked(data-ui)`, pas seulement `data-node`
- [x] G1.4 (v0.67) Masquage visuel : `body.game`, éléments verrouillés cachés, modes Sculpter/Composer verrouillés au départ. Fait : `tree.applyLocks()` (classe `is-locked`, panneau caché s'il n'a rien de débloqué, retour en Écouter si le mode est fermé), relancé sur game:mode/unlock/reset. Décision : Sculpter ouvert dès la racine (sinon les réglages du drone n'ont nulle part où s'afficher). `reset()` garde le mode et rend la racine. `?gamekey=` pour tester la vraie page (tests/gameui.html)
- [x] G1.5 (v0.68) Verrouillage sonore : couches/fonctions verrouillées coupées ; presets, générateur, liens, scènes, journal et undo n'écrivent pas les clés verrouillées. Fait : `store.guard` (params.js) refuse toute écriture d'une clé verrouillée sauf source 'game' → couvre d'un coup presets, générateur, liens, scènes, journal, undo, macros, LFO, Dérive. Clé verrouillée figée à une valeur neutre (`tree.lockedValue` : couches muettes, écho/halo/cassette/usure/dérive/swing à 0, reverb 0.35). Acheter un nœud allume sa couche. Chaque mode garde son son (`<clé>.snap.path|free`) : passer en libre rend le son libre intact
- [x] G1.6 (v0.69) Accueil : choix « Parcours » / « Mode libre » à la 1re visite (et pour les anciens utilisateurs), bascule dans le menu ⋯. Fait : `js/garden.js` (interface du jeu, chargé après ui.js), dialogue `#welcomeDlg`, bouton `#gameMode` dans ⋯. Les URL kiosque/tests (`autoplay`, `listen`) sautent la question et restent en libre. Le toast « Première visite ? » attend que le mode soit choisi

**G2 — Arbre**
- [x] G2.1 (v0.70) Écran Arbre (superposition) : carte des 4 branches, états verrouillé / disponible / acquis, style rétro. Fait : `#treeDlg` + bouton `#treeBtn` (visible seulement en parcours), 5 colonnes (tronc + 4 branches), nœuds rangés par profondeur de prérequis, compteur x/n par branche, 4 états dont « énigme à résoudre ». Capture de dev : `tests/shot-tree.html` (hors suite)
- [x] G2.2 (v0.71) Acheter un nœud : coût, animation, révélation de l'élément dans l'interface (surlignage + défilement + étiquette « Nouveau »). Fait : `garden.tryBuy` (refus expliqués : prérequis manquants, énigme, éclats manquants + secousse), `garden.reveal` (bascule vers le mode qui contient l'élément, préfère le panneau complet aux raccourcis d'Écouter, classe `is-new` 6 s)
- [x] G2.3 (v0.72) Éclats affichés dans le LCD ; bouton Arbre avec pastille quand un nœud est abordable. Fait : `#lcdShards` (sursaut à chaque gain), groupe « Jardin » dans la barre (visible seulement en parcours) avec pastille = nombre de nœuds achetables ; les groupes de la barre dont tout est verrouillé disparaissent avec leur légende
- [x] G2.4 (v0.73) Liens et prérequis visibles, nœuds-portes marqués (énigme requise), infobulle « ce que ça débloque ». Fait : `tree.grants(id)` (libellés lisibles des réglages et fonctions) et `tree.dependents(id)` ; infobulle Débloque / Demande / Porte ; prérequis d'une autre branche écrits sous le nom (« ← Pad, Mélodie auto ») ; survol = prérequis en vert, suites en pointillés, le reste estompé. Plutôt que des traits SVG entre colonnes (illisibles avec les liens croisés)

**G3 — Découvertes**
- [x] G3.1 (v0.74) Découverte d'un réglage (1re modification utilisateur) : gain, toast discret, pas de gain en double. Fait : écoute du store, seulement source 'user' (pas les macros, presets, LFO…), seulement en parcours et sur un réglage débloqué ; +2 ✧ knob, +3 ✧ interrupteur/liste ; id `p:<clé>` ; notes « +n ✧ découverte : … » flottantes sous le LCD (`#gainFeed`, 4 max)
- [ ] G3.2 Découvertes d'actions (forcer un accord, Figer, Garder un moment, enregistrer, exporter MIDI, créer une section…)
- [ ] G3.3 Carnet des découvertes dans l'écran Arbre (x / total par branche)

**G4 — Contrats d'usage**
- [ ] G4.1 Moteur : contrats = conditions sur événements/état, 3 actifs à la fois, récompense, renouvellement
- [ ] G4.2 Contrats Tronc / Harmonie / Espace (~12)
- [ ] G4.3 Contrats Mouvement / Composer (~12, dont durées en mesures de lecture)
- [ ] G4.4 Carte des contrats dans l'écran principal (progression visible, réduite pendant l'écoute)

**G5 — Énigmes à cible**
- [ ] G5.1 Moteur : cible = sous-ensemble de clés, ressemblance par clé (knob : distance normalisée ; select : égalité), jauge 0–100 %, réussite à 90 %
- [ ] G5.2 Écouter la cible ↔ mon son (bascule A/B sans perdre son état)
- [ ] G5.3 Interface d'énigme : jauge, indices progressifs (la zone la plus éloignée) après quelques essais
- [ ] G5.4 Énigmes-portes (une par branche + tronc)
- [ ] G5.5 Énigmes bonus plus difficiles (retrouver la gamme, reproduire une progression, recréer un son de Pad…)

**G6 — Équilibrage et finitions**
- [ ] G6.1 Simulation d'équilibrage (parcours type scripté → durée estimée ~1 h à 1 h 30), ajuster les coûts
- [ ] G6.2 Retours de jeu : petit carillon accordé à la tonalité au déblocage, animations LCD
- [ ] G6.3 Arbre complet : écran de fin, défis restants en bonus
- [ ] G6.4 Aide et README ; `tests/app.html` en mode libre et en parcours
- [ ] G6.5 Revue par sous-agents (joueur débutant + musicien) puis corrections

**Backlog (après le parcours)** : horloge MIDI + note-off, MIDI learn, mute/solo, parameter locks, stems WAV par couche, banc de scènes 8 slots, catalogue de sons commun à toutes les parties.
