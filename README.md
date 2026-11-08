# Ambient

Machine à paysages sonores génératifs dans le navigateur, inspirée des Sonicware LIVEN Ambient Ø et LIVEN Evoke.
HTML + JS vanilla + Web Audio, aucune dépendance, aucun build, rien n'est envoyé en ligne.

## Lancer

```bash
python3 -m http.server 8765    # puis http://localhost:8765
```
(ou double-cliquer `index.html` : tout marche sauf l'installation en appli / hors-ligne)

Clique **▶ Lecture** ou **✦ Paysage**, puis laisse tourner. `?` ouvre l'aide.

## Ce qu'il y a dedans

| | |
|---|---|
| **5 couches génératives** | Drone (suit les accords) · Pad (6 moteurs, accords voice-leadés) · Mélodie (4 timbres, mode Aléatoire ou Phrase qui mute) · Grains (granulaire sur synthèse, fichier, micro ou **Gel** du mix, reverse, glissando) · Texture (pluie, vent, océan, vinyle, ruisseau, feu, oiseaux, ville) |
| **Harmonie** | 11 gammes, progressions (aléatoire, I–V–vi–IV, i–VI–III–VII, perso « 1 6 4 5 »…), temps Pulsé ou Flottant |
| **Espace** | Reverb Hall/Plate/Cloud + pré-délai + shimmer (octave), delay ping-pong, tape (wow/flutter/saturation), lo-fi |
| **Mouvement** | Evolve (dérive autour de tes réglages), 2 LFO lents assignables, scènes A/B avec morph auto |
| **Jouer** | Pad XY sur l'écran, clavier (A–L notes, Z–M accords), MIDI |
| **Vues** | Simple (5 macros : Lumière, Densité, Espace, Nostalgie, Nature) ou Expert ; visuels Orbes/Horizon/Spectre ; mode Écoute plein écran |
| **Garder** | Presets + ✦ générateur par humeur, journal des moments, ⌘Z/⇧⌘Z, partage par lien, Rec WAV/compressé à durée fixe, minuteur de sommeil |

Lien « kiosque » : `?mood=Contemplatif&viz=Horizon&listen=1&autoplay=1`

## Développement

- Code : `js/` (un fichier par domaine : `engine` audio, `layers` sons, `sequencer` génératif, `ui`, etc.), styles dans `css/style.css`.
- Tests : `python3 -u -m http.server 8765 2> /tmp/srv.log` puis `LOG=/tmp/srv.log tests/run-all.sh` (Chrome headless, ~1 min 20, mesure niveaux/spectres et échoue sur toute erreur JS). Endurance : `tests/run.sh endurance.html 1`.
- Feuille de route et journal des versions : `ROADMAP.md`.
