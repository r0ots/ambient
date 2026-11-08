# Ambient

Machine à ambient générative dans le navigateur, inspirée des Sonicware LIVEN Ambient Ø / Evoke.

**Lancer** : `python3 -m http.server 8765` puis ouvrir http://localhost:8765 (ou double-cliquer `index.html`).
Espace = lecture/stop.

- 5 couches : Drone, Pad (accords génératifs), Mélodie (cloches FM), Grains (granulaire, sur synthèse, fichier ou micro), Texture (pluie, vent, océan, vinyle, ruisseau, feu)
- Espace : reverb à convolution + shimmer, delay ping-pong, tape (wow/flutter/saturation), lo-fi
- Evolve : dérive lente des paramètres autour de vos réglages
- Presets, patch aléatoire, sauvegarde locale, enregistrement de la sortie, minuteur de sommeil

Tests : `tests/run.sh` (Chrome headless, mesure les niveaux de chaque couche). Voir `ROADMAP.md`.
