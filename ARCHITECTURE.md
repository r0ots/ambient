# Architecture (v1.09)

Scripts classiques, pas de build. État global `window.AMB`. Un module = un IIFE qui pose `AMB.<nom>` (ordre de chargement = `index.html`). Bus : `AMB.bus.on/emit` (js/sequencer.js). Réglages : `AMB.store` (js/params.js, schéma `AMB.SCHEMA`).

Règle de produit (v1.05) : le jeu se joue SUR l'instrument (ses commandes, son son, son écran). Pas d'écran de jeu à part, pas de mini-jeu hors de l'instrument.

## Où mettre quoi
- Instrument : `engine.js` (graphe audio), `layers.js` (5 couches), `sequencer.js` (horloge, accords, Dérive, LFO), `ui.js` / `widgets.js` / `perform.js` (interface), `play.js` (clavier d'ordinateur et MIDI : notes tenues jusqu'au relâchement, pédale CC64, panique à l'arrêt, au débranchement et à la perte de focus ; `seq.playMidi(…, held)` rend une poignée `{id, midi, release}` (release : seule la voix « Doux » de `layers.js` tient la note, les voix frappées gardent leur résonance), `seq.endLive` émet `liveOff`, que le Rec live du piano roll convertit en longueur), `pianoroll.js`, `bass.js`, `pulses.js`, `chords.js`, `automation.js`, `song.js` (sections ; `seq.origin` = pas de début de la section, les mesures comptent de là), `scenes.js`, `journal.js`, `history.js`, `rec.js` (● Rec de la barre ; ● Rec du panneau Morceau : joue le morceau depuis la 1re section et l'enregistre en WAV jusqu'à la fin + `SONG_TAIL`, s'arrête seul, 2e clic = annulé), `visual.js`.
- Parcours (« Jardin sonore ») : `game.js` (état, ✧, nœuds), `tree.js` (arbre en données, verrous), `garden.js` (accueil, contrat sur le LCD, carte d'énigme, actions `act`, carillon, messages LCD, notes « +n ✧ », fin), `garden-tree.js` (écran Arbre), `contracts.js` (un contrat à la fois), `puzzles.js` (énigmes Mastermind, cible tirée à chaque essai ; et kind `echo`, voir plus bas), `secrets.js` (table `OPENS` : un secret ouvre son nœud pour 0 ✧, prérequis compris, ou rembourse le nœud déjà acheté ; l'indice 2 s'ouvre après 2 secrets), `garden-visual.js` (visuel Jardin). La progression vit dans localStorage (pas d'export).
- Nouveau module = sa page `tests/<module>.html` (≤ 10 s) avec l'en-tête commun `tests/lib.js` (log, ok, wait, done, fail, testBus, OLD_SAVE = un ancien lien `#save`, qui doit être ignoré), repris par toutes les pages sauf la page de captures `shot-tree.html`. CSS : tout dans `css/style.css`. `tests/game.html` vérifie que `sw.js` précache tout `index.html`, dans l'ordre (ASSETS + CACHE à mettre à jour). `tests/narrow.html` : à 390 px, aucun mode d'écran ne dépasse la largeur.

## Bus (événements)
- `live` {midi, time, vel (entendue), raw (vélocité MIDI brute 0..1, null au clavier)} · `chord` {time, deg, midis, forced (accord joué par le joueur)} · `phrase` {i, len, time} · `section` {index, name}
- `liveOff` {id, midi, time} (fin d'une note tenue) · `panic` {} (arrêt de la lecture : toutes les notes tenues finissent, pédale relevée)
- `note` {layer, midi, time, vel, dur} · `perc` {track, time, vel} · `grain` {layer, midi, time, vel} · `freeze` {}
- `act` 'id' (action réussie, comptée par les contrats : save, keep, restore, chord, freeze, xy, dice, sceneStore, sceneRecall, songRec (● Rec du morceau mené à son terme) ; midiConnect = un clavier MIDI est là) · `rec:done` secondes (● Rec de la barre, ou ● Rec du panneau Morceau mené à son terme ; rien à l'annulation)
- `game:*` earn {n, reason, id, total}, spend, unlock {id}, contracts / puzzles {id}, mode, reset, contract, puzzle, opened, secret

## Store (sources de `store.set(k, v, source)`)
- `user` = la seule qui compte (contrats, secrets) ; l'annulation enregistre `user`, `preset`, `macro`.
- `preset`, `macro`, `undo`, `sync` (position des macros recalculée, muette), `xy` (pad XY et CC MIDI), `morph` (scènes, morceau), `evolve` (Dérive), `lfo`, `game` (verrous de l'arbre, cible d'énigme, cadeaux).
- Cible d'énigme : tirée au début de chaque essai (`puzzles.draw`, gardée dans `game.s.runs[id].target` jusqu'à la réussite ou au 6e échec) ; `puzzles.listen('target')` la joue sur l'ambiance réelle (source `game`) ; `puzzles.ab.mine` garde les valeurs du joueur, que `stableSnapshot()` rend à la place ; `game.counts()` est faux pendant l'écoute ; un changement de mode (`tree.onMode`) ou toucher un réglage rend le son du joueur.

## Écho (S3.1, S3.6)
- Énigme `kind: 'echo'` dans `puzzles.DEFS` (pas de `keys`, une difficulté `d` : 3 notes à 0, jusqu'à 6) : l'instrument joue une phrase sur la voix Mélodie (`echoPlay`, sans événement `live`), le joueur la rejoue (touches A–L, les 9 pastilles A–L de la carte, MIDI à n'importe quelle octave, même lecture arrêtée) ; un pion par note (✓ ⬆ ⬇), l'essai est jugé à la dernière note, nouvelle phrase à chaque essai (rng du jeu). Porte ouverte en réussissant ou après 6 échecs (sans ✧), comme les autres.
- Portes Écho : Premier reflet → Grands réglages (`t.macros`), Suite connue → Phrases (`m.phrase`). Le `need` d'un Écho contient la Mélodie (`m.bells`, qui rend A–L et le MIDI jouables) et le nœud-porte la demande aussi : l'Écho est jouable dès que la porte est atteinte.
- Pendant un Écho, aucun secret n'est détecté (`secrets.active()`) et les notes jouées ne comptent pour aucun contrat. Pendant que l'instrument joue la phrase (`puzzles.hush(time)`), la Mélodie auto se tait (`seq.melodyNote`, par où passent toutes ses notes) puis reprend. Capture : `tests/shot-tree.html#echo`.

## Composer et remise de l'instrument (S3.5, S3.7)
- Composer = 3 nœuds : Mélodie écrite (`c.seq` : piano roll, arpège, motifs, Rec live), Rythme (`c.rythme` : basse, pulsations, groove), Morceau (`c.song` : sections, automation, Rec du morceau). `game.load()` remplace les anciens ids (`game.MERGED` : c.arp, c.motifs → c.seq ; c.bass, c.perc, c.groove → c.rythme ; c.auto → c.song), sans toucher aux ✧.
- Contrats Composer joués : 8 notes en Rec live, un groove de basse qui tourne 4 mesures (événements `note` de la basse), « Enregistre ton morceau » (`act` songRec). Ce dernier (`first`) passe avant les autres dès que Morceau est acquis.
- Remise (`garden.checkEnd`) : arbre complet → le dernier contrat d'abord ; une fois fait ou passé (↷) : `game.s.ended` (sauvegardé), carillon, « L'instrument est à toi » sur le LCD, puis la ligne de contrat et le compteur ✧ disparaissent (`garden.handedOver()`). Le store n'est pas touché. Ensuite `game.counts()` est faux : ni contrat ni ✧ ; l'arbre reste consultable (sans ✧ ni énigmes). Les secrets restent à trouver (`secrets.active()` ne dépend que du Parcours, de la cible et de l'Écho) : cadeau, carillon et LCD, sans nœud ni ✧ ; le panneau ne montre que les secrets trouvés.

## Mode libre intact
- En libre : aucun verrou, aucune interface de jeu (la 2e ligne du LCD redevient l'état du son), aucun gain ni détection, pas de carillon. Son, journal, annulation et liens partagés sans trace du jeu. `AMB.game.counts()` = Parcours, instrument pas encore remis et pas de cible d'énigme en écoute.
- Cadeaux des secrets : seulement les timbres Givre et Aube, disponibles partout une fois trouvés.
- `tests/free-intact.html` vérifie store, journal, annulation, lien de partage, UI visible, aide de base seule, pas de Jardin, anciens liens `#dj` / `#df` / `#save` ignorés (aucune boîte, aucune écriture).

## Liens et anciennes données
- `#p=…` patch partagé (js/ui.js), dans les deux modes. Les liens `#save` (sauvegarde exportable, retirée en v1.06), `#dj` / `#df` et les clés localStorage des fonctions retirées en v1.05 sont ignorés.
- Ancien état du Parcours dans localStorage : `game.load()` ne garde que les champs connus (`found`, `stars`, thèmes et miroir des secrets ignorés ; plusieurs contrats actifs → un seul ; énigme en cours sans cible → une cible est tirée), testé par `tests/game.html` et `tests/secrets.html`.

## Tester
- Serveur : `python3 -u -m http.server 8765 2> $LOG`, puis `LOG=… tests/run.sh <page>.html 0.4` ; suite : `LOG=… tests/run-all.sh` (ALL OK, ~1 min ; `ALL=1 LOG=… tests/run-all.sh` ajoute les pages de démo audio lentes `engines`, `smoke`, `spectrum`, sans `ok()`).
- Captures regardées (bureau + 390 px) : `tests/shot-tree.html?w=390&h=780#<mode>` (Chrome headless impose ≥ 500 px). Modes : `#echo` (carte Écho), `#song` / `#song-empty` (panneau Morceau), `#bar` (barre + LCD avec le contrat), `#task-help`, `#free`, `#sel=<nœud>`, `#pz`, `#more`, `#help-path`, `#help-free`, `#garden`, `#garden-adv`.
