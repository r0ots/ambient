# Ambient

Machine à paysages sonores génératifs dans le navigateur, inspirée des Sonicware LIVEN Ambient Ø et LIVEN Evoke.
HTML + JS vanilla + Web Audio, aucune dépendance, aucun build, rien n'est envoyé en ligne.

## Lancer

```bash
python3 -m http.server 8765    # puis http://localhost:8765
```
(ou double-cliquer `index.html` : tout marche sauf l'installation en appli / hors-ligne)

Clique **▶ Lecture** ou **✦ Nouveau paysage**, puis laisse tourner. `?` ouvre l'aide.

Trois modes (en haut) :
- **Écouter** — l'écran (glisse dessus : sombre ↔ clair, plus ou moins de notes), 5 grands réglages, les couches.
- **Sculpter** — tous les réglages du son (couches, espace, mouvements lents, scènes, journal).
- **Composer** — progression d'accords, mélodie écrite (piano roll), basse, pulsations, automation, morceau.

**Jardin sonore** (au premier lancement, ou menu ⋯) : un parcours pour découvrir l'outil. On commence avec une seule note et on débloque le reste dans un arbre de 38 nœuds (5 branches : Tronc, Harmonie, Espace, Mouvement, Composer). Les ✧ éclats se gagnent en jouant, jamais en attendant : découvrir un réglage, remplir un contrat (« coupe le drone puis rallume-le »), résoudre une énigme d'écoute (reproduire un son cible en 6 validations au plus, chacune dit réglage par réglage juste, proche ou loin et dans quel sens ; 0 à 3 étoiles selon les essais et les écoutes ; une aide affiche une jauge en direct, sans étoiles ; après 6 échecs la porte s'ouvre quand même, sans ✧). On juge l'usage ou la cible, jamais le goût. Environ 1 h 30 pour tout l'arbre. Le **mode libre** ouvre tout, à tout moment, sans perdre son parcours.

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

## Développement

- Code : `js/` (un fichier par domaine : `engine` audio, `layers` sons, `sequencer` génératif, `ui`, etc. ; jeu : `game` état, `tree` arbre et verrous, `garden` interface, `contracts`, `puzzles`), styles dans `css/style.css`.
- Tests : `python3 -u -m http.server 8765 2> /tmp/srv.log` puis `LOG=/tmp/srv.log tests/run-all.sh` (Chrome headless, ~1 min 30–2 min, dont `balance.html` = simulation d'équilibrage du parcours, mesure niveaux/spectres et échoue sur toute erreur JS). Endurance : `tests/run.sh endurance.html 1`.
- Feuille de route et journal des versions : `ROADMAP.md`.
