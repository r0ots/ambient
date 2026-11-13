# Ambient

Machine à paysages sonores génératifs dans le navigateur, inspirée des Sonicware LIVEN Ambient Ø et LIVEN Evoke.
HTML + JS vanilla + Web Audio, aucune dépendance, aucun build, rien n'est envoyé en ligne.

## Lancer

```bash
python3 -m http.server 8765    # puis http://localhost:8765
```
(ou double-cliquer `index.html` : tout marche sauf l'installation en appli / hors-ligne)

Clique **▶ Lecture** ou **✦ Nouveau paysage**, puis laisse tourner. `?` ouvre l'aide (une page Parcours en plus dans le Parcours).

Trois modes (en haut) :
- **Écouter** — l'écran (glisse dessus : Lumière, sombre ↔ clair ; Densité, plus ou moins de notes), les 5 grands réglages, les couches.
- **Sculpter** — tous les réglages du son (couches, espace, mouvements lents, scènes, journal).
- **Composer** — progression d'accords, mélodie écrite (piano roll), basse, pulsations, automation, morceau.

**Mode libre vs Parcours.** Au premier lancement l'appli propose le **Parcours** ou le **mode libre** (menu ⋯, à tout moment, sans perdre son parcours).
- **Mode libre** : tout est ouvert, aucune interface de jeu. Rien du jeu n'écrit dans les réglages, le journal, l'annulation ni les liens de partage (testé par `tests/free-intact.html`).
- **Parcours** : on commence avec une seule note (touche une pastille, A–L ou ton clavier MIDI) et on ouvre l'outil dans un arbre de 32 nœuds (5 branches), sans monnaie : chaque nœud s'ouvre par un **défi** musical, affiché un à la fois sur la 2e ligne de l'écran LCD (touche-le pour l'aide, ↷ pour passer), ou par une **Réponse** : pendant la lecture, la plante Mélodie auto marque une phrase et le joueur la rejoue juste après, sans carte (après 6 ratés le nœud s’ouvre quand même ; les réussites allongent les phrases, dès 5 notes le rythme compte). Une réussite ne change rien toute seule : le nœud devient **prêt**, l'écran dit « ✦ Ouvrir : <nœud> » ; le toucher dit en une ou deux phrases ce qu'il apporte, **Ouvrir** l'ouvre en musique (« ✦ Tout ouvrir » quand plus de 3 attendent), et ce qui arrive dans l'interface se déploie puis brille (« Nouveau ») jusqu'à ce qu'on le touche. L'Arbre est une carte : chaque nœud dit ce qui l'ouvre. Les **découvertes** rendent parfois un nœud prêt aussi : des **combos** (une musique tenue deux mesures, pour laquelle le Jardin invente un effet visuel à lui) et des gestes musicaux cachés ; leur carnet (« ??? » et un indice chacune) est dans l'Arbre. Au début, pas de jargon à l'écran (ni tonalité, ni gamme, ni tempo) jusqu'au nœud Tonalité. Tout se joue sur l'instrument ; le visuel **Jardin** montre ce qui a poussé (une plante par couche), la progression reste dans le navigateur. Compter environ 45 min (35 min pour un musicien qui trouve les gestes cachés) ; ça finit, tout l'arbre ouvert, par « Enregistre ton morceau » (rejoué à l'aube, puis une fête), puis l'instrument est à toi : la ligne de défi s'efface, le son reste. On juge l'usage ou la cible, jamais le goût.

Look : façade de synthé japonais fin 80 (version nuit), écran LCD d'état en haut à droite.

## Ce qu'il y a dedans

| | |
|---|---|
| **5 couches génératives** | Drone (suit les accords) · Pad (6 moteurs, accords voice-leadés) · Mélodie auto (4 timbres, mode Aléatoire ou Phrase qui mute) · Grains (granulaire sur synthèse, fichier, micro ou **Gel** du mix, reverse, glissando) · Texture (pluie, vent, océan, vinyle, ruisseau, feu, oiseaux, ville) |
| **Harmonie** | 11 gammes, progressions (aléatoire, I–V–vi–IV, i–VI–III–VII, perso « 1 6 4 5 »…), Temps Pulsé ou Flottant |
| **Effets** | Reverb Hall/Plate/Cloud + pré-délai + shimmer (octave), delay ping-pong, tape (wow/flutter/saturation), lo-fi |
| **Mouvement** | Dérive (autour de tes réglages), 2 Mouvements lents assignables, scènes A/B avec fondu auto |
| **Jouer** | Pad XY sur l'écran, clavier (A–L notes, même lecture arrêtée ; Z–M accords), MIDI ; dans le Parcours, 9 pastilles au doigt (appui long = accord) ; « ⤓ Garder » range les 4 dernières mesures jouées (ou, sans rien jouer, celles de la Mélodie) dans un motif |
| **Composer** | Progression d'accords en cases (I–VII), Séquenceur piano roll (vélocité, probabilité, mutation, sélection/copier-coller, motifs A–D + chaîne, arpégiateur, Rec live avec métronome, import/export MIDI), Basse en grille qui suit les accords, Pulsations (4 pistes, 16/32 pas, kits Feutré/Organique, euclidien), Automation dessinée, mode Morceau (sections enchaînées avec fondus), réglage « Humain » |
| **Vues** | Écouter (5 grands réglages : Lumière, Densité, Espace, Nostalgie, Nature), Sculpter, Composer ; visuels Orbes/Horizon/Spectre (et Ville néon dans le Parcours) ; ⤢ Plein écran |
| **Garder** | Paysages prêts + ✦ Nouveau paysage par humeur, Mes paysages (sauver, exporter, importer), journal des moments, ⌘Z/⇧⌘Z, partage par lien, Rec WAV/compressé à durée fixe, minuteur de sommeil |

Lien « kiosque » : `?mood=Contemplatif&viz=Horizon&listen=1&autoplay=1`

## MIDI

Branche un clavier ou des pads (Chrome, Edge, Opera ; Web MIDI), puis le bouton **MIDI** de la barre (connexion automatique ensuite). Les notes graves (sous le do 3, MIDI 48) forment un accord reconnu dans la tonalité, tenu tant que les touches ou la pédale (CC64) le sont ; au-dessus, les notes jouent la Mélodie, même lecture arrêtée, la vélocité règle la force et l'éclat. Les CC pilotent les grandes commandes : CC1 Densité, CC74 Lumière, CC91 Espace, CC93 Nostalgie. Import/export de fichiers `.mid` dans le piano roll. Dans le Parcours, le clavier MIDI joue dès la Graine (comme les touches A–L et les pastilles : le premier défi est une note ; sur un écran tactile, le bouton MIDI est caché), les accords avec le Pad, l'import/export avec la Mélodie écrite. Un accord de septième renversé est lu comme l'accord de la tonalité qui contient toutes ses notes.

## Développement

- **Lancer en local** : `python3 -m http.server 8765`, puis http://localhost:8765.
- **Structure** : `js/` (un fichier par domaine), `css/style.css`, `tests/` (en-tête commun `lib.js`). Où mettre quoi, bus, store : voir [ARCHITECTURE.md](ARCHITECTURE.md).
- **Tests** (Chrome headless, sans audio réel) : serveur `python3 -u -m http.server 8765 2> /tmp/srv.log`, puis
  - une page : `LOG=/tmp/srv.log tests/run.sh game.html 0.4` (une page par module : `tests/<module>.html`, ≤ 10 s ; `PORT=…` pour un autre port) ;
  - tout : `LOG=/tmp/srv.log tests/run-all.sh` (~1 min, `ALL OK` attendu ; `balance.html` simule l'équilibrage du parcours ; `ALL=1` ajoute les pages de démo audio lentes `engines`, `smoke`, `spectrum`) ;
  - endurance : `tests/run.sh endurance.html 1`. `tests/game.html` vérifie aussi que `sw.js` précache tout `index.html`, dans l'ordre.
- Feuille de route et journal des versions : `ROADMAP.md`.
