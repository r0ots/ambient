# Architecture (v1.05)

Scripts classiques, pas de build. État global `window.AMB`. Un module = un IIFE qui pose `AMB.<nom>` (ordre de chargement = `index.html`). Bus : `AMB.bus.on/emit` (js/sequencer.js). Réglages : `AMB.store` (js/params.js, schéma `AMB.SCHEMA`).

Règle de produit (v1.05) : le jeu se joue SUR l'instrument (ses commandes, son son, son écran). Pas d'écran de jeu à part, pas de mini-jeu hors de l'instrument.

## Où mettre quoi
- Instrument : `engine.js` (graphe audio), `layers.js` (5 couches), `sequencer.js` (horloge, accords, Dérive, LFO), `ui.js` / `widgets.js` / `perform.js` (interface), `play.js` (clavier d'ordinateur et MIDI), `pianoroll.js`, `bass.js`, `pulses.js`, `chords.js`, `automation.js`, `song.js`, `scenes.js`, `journal.js`, `history.js`, `rec.js`, `visual.js`.
- Parcours (« Jardin sonore ») : `game.js` (état, ✧, nœuds), `tree.js` (arbre en données, verrous), `garden.js` (accueil, contrats, énigme, fin), `garden-tree.js` (écran Arbre), `garden-actions.js` (découvertes), `contracts.js`, `puzzles.js` (énigmes Mastermind), `secrets.js`, `juice.js` (carillon, LCD, particules), `garden-visual.js` (visuel Jardin), `save.js` (sauvegarde).
- Nouveau module = sa page `tests/<module>.html` (≤ 10 s) avec l'en-tête `tests/lib.js` (log, ok, wait, done, fail, testBus, OLD_SAVE). Une CSS par module (`css/<module>.css`). `tests/game.html` vérifie que `sw.js` précache tout `index.html`, dans l'ordre (ASSETS + CACHE à mettre à jour).

## Bus (événements)
- `live` {midi, time, vel (entendue), raw (vélocité MIDI brute 0..1, null au clavier)} · `chord` {time, deg, midis, forced (accord joué par le joueur)} · `phrase` {i, len, time} · `section` {index, name}
- `note` {layer, midi, time, vel, dur} · `perc` {track, time, vel} · `grain` {layer, midi, time, vel} · `freeze` {}
- `act` 'id' (action réussie : save, share, keep, restore, rec, reclive, chord, note, freeze, xy, midiConnect, midiExport, preset, sceneStore…) · `rec:done` secondes
- `game:*` earn {n, reason, id, total}, spend, unlock {id}, found / contracts / puzzles {id}, mode, reset, contract, puzzle, stars, opened, secret, chime {kind}

## Store (sources de `store.set(k, v, source)`)
- `user` = la seule qui paie ou compte (découvertes, contrats, secrets) ; l'annulation enregistre `user`, `preset`, `macro`.
- `preset`, `macro`, `undo`, `sync` (position des macros recalculée, muette), `xy` (pad XY et CC MIDI), `morph` (scènes, morceau), `evolve` (Dérive), `lfo`, `game` (verrous de l'arbre, cible d'énigme, cadeaux).
- Emprunt du son : `store.borrow(owner, vals)` / `giveBack(owner)` / `giveBackAll()` / `lending()` / `borrowed()`. La cible d'une énigme (`puzzles.ab`) s'entend sur l'ambiance réelle ; pendant l'emprunt `stableSnapshot()` voit les valeurs du joueur et `game.freePlay()` est faux ; un changement de mode rend tout.

## Mode libre intact
- En libre : aucun verrou, aucune interface de jeu, aucun gain ni détection, pas de juice ni de carillon. Son, journal, annulation et liens partagés sans trace du jeu. `AMB.game.freePlay()` = Parcours et pas de cible d'énigme en écoute.
- Cadeaux des secrets : timbres trouvés disponibles partout ; clavier miroir et thèmes LCD seulement en Parcours.
- `tests/free-intact.html` vérifie store, journal, annulation, lien de partage, UI visible, aide de base seule, pas de Jardin, anciens liens `#dj` / `#df` ignorés, `#save` (confirmation, « Annuler » n'écrit rien).

## Liens et anciennes données
- `#p=…` patch partagé (js/ui.js), dans les deux modes. `#save=…` sauvegarde du Parcours (js/save.js) : confirmation avant tout remplacement, en libre comme en Parcours.
- Les liens `#dj` / `#df` et les clés localStorage des fonctions retirées en v1.05 sont ignorés. Une ancienne sauvegarde s'importe : ses champs retirés sont ignorés (`tests/save.html`, fixture `OLD_SAVE`).

## Tester
- Serveur : `python3 -u -m http.server 8765 2> $LOG`, puis `LOG=… tests/run.sh <page>.html 0.4` ; suite : `LOG=… tests/run-all.sh` (ALL OK, ~1 min).
- Captures regardées (bureau + 390 px) : `tests/shot-tree.html?w=390&h=780#<mode>` (Chrome headless impose ≥ 500 px). Modes : `#bar`, `#free`, `#sel=<nœud>`, `#pz`, `#more`, `#save-open`, `#save-confirm`, `#help-path`, `#help-free`, `#garden`, `#garden-adv`.
