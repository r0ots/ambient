# Architecture (v1.06)

Scripts classiques, pas de build. État global `window.AMB`. Un module = un IIFE qui pose `AMB.<nom>` (ordre de chargement = `index.html`). Bus : `AMB.bus.on/emit` (js/sequencer.js). Réglages : `AMB.store` (js/params.js, schéma `AMB.SCHEMA`).

Règle de produit (v1.05) : le jeu se joue SUR l'instrument (ses commandes, son son, son écran). Pas d'écran de jeu à part, pas de mini-jeu hors de l'instrument.

## Où mettre quoi
- Instrument : `engine.js` (graphe audio), `layers.js` (5 couches), `sequencer.js` (horloge, accords, Dérive, LFO), `ui.js` / `widgets.js` / `perform.js` (interface), `play.js` (clavier d'ordinateur et MIDI), `pianoroll.js`, `bass.js`, `pulses.js`, `chords.js`, `automation.js`, `song.js`, `scenes.js`, `journal.js`, `history.js`, `rec.js`, `visual.js`.
- Parcours (« Jardin sonore ») : `game.js` (état, ✧, nœuds), `tree.js` (arbre en données, verrous), `garden.js` (accueil, contrat sur le LCD, carte d'énigme, actions `act`, carillon, messages LCD, notes « +n ✧ », fin), `garden-tree.js` (écran Arbre), `contracts.js` (un contrat à la fois), `puzzles.js` (énigmes Mastermind, cible tirée à chaque essai), `secrets.js`, `garden-visual.js` (visuel Jardin). La progression vit dans localStorage (pas d'export).
- Nouveau module = sa page `tests/<module>.html` (≤ 10 s) avec l'en-tête commun `tests/lib.js` (log, ok, wait, done, fail, testBus, OLD_SAVE = un ancien lien `#save`, qui doit être ignoré), repris par toutes les pages sauf les captures (`mobile.html`, `shot-tree.html`). CSS : tout dans `css/style.css`. `tests/game.html` vérifie que `sw.js` précache tout `index.html`, dans l'ordre (ASSETS + CACHE à mettre à jour).

## Bus (événements)
- `live` {midi, time, vel (entendue), raw (vélocité MIDI brute 0..1, null au clavier)} · `chord` {time, deg, midis, forced (accord joué par le joueur)} · `phrase` {i, len, time} · `section` {index, name}
- `note` {layer, midi, time, vel, dur} · `perc` {track, time, vel} · `grain` {layer, midi, time, vel} · `freeze` {}
- `act` 'id' (action réussie, comptée par les contrats : save, keep, restore, chord, freeze, xy, dice, sceneStore, sceneRecall, section, song ; midiConnect = un clavier MIDI est là) · `rec:done` secondes
- `game:*` earn {n, reason, id, total}, spend, unlock {id}, contracts / puzzles {id}, mode, reset, contract, puzzle, opened, secret

## Store (sources de `store.set(k, v, source)`)
- `user` = la seule qui compte (contrats, secrets) ; l'annulation enregistre `user`, `preset`, `macro`.
- `preset`, `macro`, `undo`, `sync` (position des macros recalculée, muette), `xy` (pad XY et CC MIDI), `morph` (scènes, morceau), `evolve` (Dérive), `lfo`, `game` (verrous de l'arbre, cible d'énigme, cadeaux).
- Cible d'énigme : tirée au début de chaque essai (`puzzles.draw`, gardée dans `game.s.runs[id].target` jusqu'à la réussite ou au 6e échec) ; `puzzles.listen('target')` la joue sur l'ambiance réelle (source `game`) ; `puzzles.ab.mine` garde les valeurs du joueur, que `stableSnapshot()` rend à la place ; `game.counts()` est faux pendant l'écoute ; un changement de mode (`tree.onMode`) ou toucher un réglage rend le son du joueur.

## Mode libre intact
- En libre : aucun verrou, aucune interface de jeu (la 2e ligne du LCD redevient l'état du son), aucun gain ni détection, pas de carillon. Son, journal, annulation et liens partagés sans trace du jeu. `AMB.game.counts()` = Parcours et pas de cible d'énigme en écoute.
- Cadeaux des secrets : seulement les timbres Givre et Aube, disponibles partout une fois trouvés.
- `tests/free-intact.html` vérifie store, journal, annulation, lien de partage, UI visible, aide de base seule, pas de Jardin, anciens liens `#dj` / `#df` / `#save` ignorés (aucune boîte, aucune écriture).

## Liens et anciennes données
- `#p=…` patch partagé (js/ui.js), dans les deux modes. Les liens `#save` (sauvegarde exportable, retirée en v1.06), `#dj` / `#df` et les clés localStorage des fonctions retirées en v1.05 sont ignorés.
- Ancien état du Parcours dans localStorage : `game.load()` ne garde que les champs connus (`found`, `stars`, thèmes et miroir des secrets ignorés ; plusieurs contrats actifs → un seul ; énigme en cours sans cible → une cible est tirée), testé par `tests/game.html` et `tests/secrets.html`.

## Tester
- Serveur : `python3 -u -m http.server 8765 2> $LOG`, puis `LOG=… tests/run.sh <page>.html 0.4` ; suite : `LOG=… tests/run-all.sh` (ALL OK, ~1 min ; `ALL=1 LOG=… tests/run-all.sh` ajoute les pages de démo audio lentes `engines`, `smoke`, `spectrum`, sans `ok()`).
- Captures regardées (bureau + 390 px) : `tests/shot-tree.html?w=390&h=780#<mode>` (Chrome headless impose ≥ 500 px). Modes : `#bar` (barre + LCD avec le contrat), `#task-help`, `#free`, `#sel=<nœud>`, `#pz`, `#more`, `#help-path`, `#help-free`, `#garden`, `#garden-adv`.
