# Ambient

Machine à paysages sonores génératifs dans le navigateur, inspirée des Sonicware LIVEN Ambient Ø et LIVEN Evoke.
HTML + JS vanilla + Web Audio, aucune dépendance, aucun build, rien n'est envoyé en ligne.

## Lancer

```bash
python3 -m http.server 8765    # puis http://localhost:8765
```
(ou double-cliquer `index.html` : tout marche sauf l'installation en appli / hors-ligne)

Clique **▶ Lecture** ou **✦ Nouveau paysage**, puis laisse tourner. `?` ouvre l'aide (deux niveaux dans le Parcours).

Trois modes (en haut) :
- **Écouter** — l'écran (glisse dessus : sombre ↔ clair, plus ou moins de notes), 5 grands réglages, les couches.
- **Sculpter** — tous les réglages du son (couches, espace, mouvements lents, scènes, journal).
- **Composer** — progression d'accords, mélodie écrite (piano roll), basse, pulsations, automation, morceau.

**Mode libre vs Parcours.** Au premier lancement l'appli propose le **Parcours** (le « Jardin sonore ») ou le **mode libre** (menu ⋯, à tout moment, sans perdre son parcours).
- **Mode libre** : tout est ouvert, aucune interface de jeu ; seule la borne d'arcade reste offerte. Rien du jeu n'écrit dans les réglages, le journal, l'annulation ni les liens de partage (testé par `tests/free-intact.html`).
- **Parcours** : on commence avec une seule note et on débloque l'outil dans un arbre de 38 nœuds (5 branches). Les ✧ éclats se gagnent en jouant : découvrir un réglage, remplir un **contrat** d'usage, résoudre une **énigme d'écoute** (reproduire un son cible en 6 validations, 0 à 3 ★ ; après 6 échecs la porte s'ouvre quand même), trouver des **secrets**. S'y ajoutent l'**arcade** (7 mini-jeux d'oreille, pactes, défi du jour, défie ton cousin par lien, classement), un **profil** (musicien / découverte) avec test de placement, et la **sauvegarde** (fichier ou lien). Environ 1 h 30 pour tout l'arbre. On juge l'usage ou la cible, jamais le goût.

Look : façade de synthé japonais fin 80 (version nuit), écran LCD d'état en haut à droite.

## Ce qu'il y a dedans

| | |
|---|---|
| **5 couches génératives** | Drone (suit les accords) · Pad (6 moteurs, accords voice-leadés) · Mélodie (4 timbres, mode Aléatoire ou Phrase qui mute) · Grains (granulaire sur synthèse, fichier, micro ou **Gel** du mix, reverse, glissando) · Texture (pluie, vent, océan, vinyle, ruisseau, feu, oiseaux, ville) |
| **Harmonie** | 11 gammes, progressions (aléatoire, I–V–vi–IV, i–VI–III–VII, perso « 1 6 4 5 »…), temps Pulsé ou Flottant |
| **Espace** | Reverb Hall/Plate/Cloud + pré-délai + shimmer (octave), delay ping-pong, tape (wow/flutter/saturation), lo-fi |
| **Mouvement** | Evolve (dérive autour de tes réglages), 2 LFO lents assignables, scènes A/B avec morph auto |
| **Jouer** | Pad XY sur l'écran, clavier (A–L notes, Z–M accords), MIDI |
| **Composer** | Progression d'accords en cases (I–VII), Séquenceur piano roll (vélocité, probabilité, mutation, sélection/copier-coller, motifs A–D + chaîne, arpégiateur, Rec live avec métronome, import/export MIDI), Basse en grille qui suit les accords, Pulsations (4 pistes, 16/32 pas, kits Feutré/Organique, euclidien), Automation dessinée, mode Morceau (sections enchaînées avec fondus), réglage « Humain » |
| **Vues** | Écouter (5 macros : Lumière, Densité, Espace, Nostalgie, Nature), Sculpter, Composer ; visuels Orbes/Horizon/Spectre ; mode Écoute plein écran |
| **Garder** | Presets + ✦ générateur par humeur, journal des moments, ⌘Z/⇧⌘Z, partage par lien, Rec WAV/compressé à durée fixe, minuteur de sommeil |

Lien « kiosque » : `?mood=Contemplatif&viz=Horizon&listen=1&autoplay=1`

## MIDI

Branche un clavier ou des pads (Chrome, Edge, Opera ; Web MIDI) : ils jouent l'appli (notes graves = accords, CC1 densité, CC74 brillance) et les jeux d'arcade (Réponds, Dictée). Import/export de fichiers `.mid` dans le piano roll. **⟲ Latence** (menu de l'arcade) calibre le retard de chaque entrée (clavier, écran, MIDI) pour les jeux de rythme.

## Développement

- **Lancer en local** : `python3 -m http.server 8765`, puis http://localhost:8765.
- **Structure** : `js/` (un fichier par domaine ; `js/arcade/` = un fichier par mini-jeu), `css/`, `tests/`. Où mettre quoi, bus, store, contrat d'un mini-jeu : voir [ARCHITECTURE.md](ARCHITECTURE.md).
- **Tests** (Chrome headless, sans audio réel) : serveur `python3 -u -m http.server 8765 2> /tmp/srv.log`, puis
  - une page : `LOG=/tmp/srv.log tests/run.sh daily.html 0.4` (une page par module : `tests/<module>.html`, ≤ 10 s ; `PORT=…` pour un autre port) ;
  - tout : `LOG=/tmp/srv.log tests/run-all.sh` (~2 min, `ALL OK` attendu ; `balance.html` simule l'équilibrage du parcours) ;
  - endurance : `tests/run.sh endurance.html 1`. `tests/game.html` vérifie aussi que `sw.js` précache tout `index.html`, dans l'ordre.
- Feuille de route et journal des versions : `ROADMAP.md`.
