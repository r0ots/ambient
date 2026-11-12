# Architecture (v1.02)

Scripts classiques, pas de build. État global `window.AMB`. Un module = un IIFE qui pose `AMB.<nom>` (ordre de chargement = `index.html`). Bus : `AMB.bus.on/emit` (js/sequencer.js). Réglages : `AMB.store` (js/params.js, schéma `AMB.SCHEMA`).

## Où mettre quoi
- Mini-jeu = `js/arcade/<id>.js` + `css/arcade-<id>.css` + `tests/arcade-<id>.html`, rien d'autre. Coquilles déjà déclarées dans `index.html`, `sw.js`, `tests/run-all.sh` (intrus, bouge, reponds, modes, accordeur, dictee ; démo : hautbas).
- Nouveau module = sa page `tests/<module>.html` (≤ 10 s) avec l'en-tête `tests/lib.js` (log, ok, wait, done, fail, testBus ; erreurs capturées). Plus rien dans gameui.html. Une CSS par module (`css/<module>.css`) : les agents ne touchent pas `css/style.css`. Les agents lancent seulement leurs pages ; la suite complète est lancée à la fusion. `tests/game.html` vérifie que `sw.js` précache tout `index.html`, dans l'ordre.
- Seul le réconciliateur modifie `index.html`, `sw.js` (ASSETS dans l'ordre d'index.html + CACHE), `ROADMAP.md`, `css/style.css` et les manifestes.

## Plugin d'arcade (contrat : en-tête de js/arcade.js)
```js
AMB.arcade.register({ id: 'x', title: 'Titre', skill: 'hauteur', blurb: 'Une phrase.', kid: true,
  make(rng, d) { return { up: rng() < 0.5, d }; },          // d 0..1 (0 = facile) ; rng() rng.int(n) rng.pick(a)
  stimulus(ch) { return [{ t: 0, midi: 60, dur: 0.6, vel: 0.8, voice: 'triangle' }]; }, // ou play(ch, api)
  choices(ch) { return [{ value: 'up', label: '⬆' }, { value: 'down', label: '⬇' }]; }, // null = réponse jouée
  check(ch, a) { return { ok: a === (ch.up ? 'up' : 'down') }; },                       // {ok, partial?, bonus?}
});
```
Optionnels : `reveal` (ms, pause après la réponse avant le défi suivant, réponses bloquées ; défaut `arcade.REVEAL` = 450 ; Accordeur 1600, Réponds 1200), `prepare(api)` → Promise (appelé par arcade-ui AVANT `arcade.start`, hors chrono ; `api = {stage, play, note, stop, now, onKey(fn), onMidi(fn), cancelled()}`, touches et MIDI routés via `arcade.prep`, Échap annule ; ex. calibration de latence de Réponds), MIDI (G9b.2) : `onMidi` reçoit `{midi, vel (brute 0..1), time, sustain (CC64 tenu), input (nom de l'entrée, plusieurs à la fois)}`, `onCC(ch, {cc, value, time, sustain, input}, api)` reçoit les CC (pédale : `arcade.sustain`) ; jeux rythmiques : `prepare(api) { return AMB.latency.ensure(api); }` et retirer `AMB.latency.get(src, input)` des temps de frappe (`js/latency.js` : calibration globale par appareil et par entrée key / touch / midi / clavier MIDI, recalibrable par « ⟲ Latence » dans la borne), `bonus` dans `check` (0..1 : + `SCORE.bonus` (0,5) × bonus des points de base, ex. part de « parfait »), `play(ch, api)`, `render(ch, el, api)`, `onKey(ch, e, api)`, `passKeys`, `onMidi(ch, {midi, vel, time}, api)`, `onMidiOff(ch, {midi, time}, api)`. `api = {answer, replay, play(ev) → {dur, at, t0}, stop, note(ev), t0, ch, d, rng}` ; `t0` = performance.now() (ms) du départ réel du stimulus (même horloge que `time` du MIDI) ; `note(ev)` = retour sonore immédiat. Voix : sine, triangle, pluck, bell (`ev.atk` = attaque en s des voix simples sine / triangle, défaut min(20 ms, dur/4)). Profil joueur : `AMB.game.profile()` ('musicien' | 'decouverte') / `isKid()` (game.s.profile) ; un plugin lit `AMB.arcade.kid` dans `make()` (libellés enfant, ex. Chasseur de modes) ou `api.kid`. Classes CSS `.arc-<id>-*`. Jamais `Math.random`. `arcade.open` = borne à l'écran, `arcade.active` = manche en cours.

## Bus (événements et charges utiles)
- `live` {midi, time (s ctx), vel (entendue), raw (vélocité MIDI brute 0..1, null au clavier d'ordinateur)} · `chord` {time, deg, midis} · `phrase` {i, len, time} · `section` {index, name}
- `note` {layer, midi, time, vel, dur} · `perc` {track, time, vel} · `grain` {layer, midi, time, vel} · `freeze` {}
- `act` 'id' (action réussie : save, share, keep, restore, rec, reclive, chord, note, freeze, xy, midiConnect, midiExport, preset, sceneStore…) · `rec:done` secondes · `secret` {id}
- `game:*` earn {n, reason, id, total}, spend, unlock {id}, found / contracts / puzzles {id}, mode, reset, contract, puzzle, stars, opened, secret, chime {kind}
- `arcade:*` register, start {id, seed, d, pacts}, challenge {id, n, d}, answer {ok, partial, bonus, reveal, pts, d, combo, mult, late…}, end {score, stars, record, ghost, pacts, pmult, fall…}, screen 'menu' | 'play' | 'end' | 'daily' | 'duel' | 'closed' (arcade-ui `show`, toute `section.arc-<nom>` de la borne) · `juice:combo` {n, mult, best} · `game:profile` 'musicien' | 'decouverte'

## Manches
- `arcade.start(id, {kind, seed, d, dMax, fixed, count, duration, pacts})` → la manche (null si jeu inconnu). `kind` décide ce que la manche touche : `'normal'` (cartouche : pactes = `opts.pacts` ou ceux cochés, jamais pour l'enfant ; record, partie comptée, niveau gardé), `'practice'` (placement, « Jouer 2 min » : ni pacte, ni record, ni partie ; niveau gardé), `'ghost'` (défi du jour, duel : ni pacte, rien d'enregistré). Les anciens drapeaux `ghost: true` / `practice: true` s'y ramènent. Réglages de manche, quel que soit le kind : `seed`, `d` (départ), `dMax` (plafond), `fixed` (pas d'escalier), `count` (fin après n réponses), `duration` (ms ; Infinity = zen).
- `arcadeUI.start(id, {…mêmes options, label, onEnd})` → Promise<boolean> (false = refusée : enregistrement en cours, borne fermée entre-temps). `onEnd(fin)` = LE seul crochet de fin de manche, passé à chaque appel, appelé une fois (abandon compris) ; il renvoie `true` pour garder son propre écran (placement, « Jouer 2 min », défi du jour, duel), sinon l'écran de fin de la borne. Plus d'emplacement global `arcadeUI.after`.
- Enregistrement en cours : la manche est refusée AVANT toute écriture ; défi du jour et duel testent `recording()` avant d'écrire l'essai et affichent leur message.
- Pactes (js/pacts.js) : règles dans le moteur ; « Avant la fin » et « Métronome » comptent depuis la fin du PREMIER stimulus du défi (réécouter ne repousse rien). Menu : un bouton « Pactes ×1,00 ▸ » par cartouche déplie ses puces ; rien en profil Découverte. Exclusions par jeu : `pacts.SKIP` ou `pacts: {id: bool}` du plugin.
- Profil joueur : `AMB.game.s.profile` (null = pas choisi, `profile()` répond alors 'musicien'). Découverte : niveau repris d'une session à l'autre sous un plafond doux (`arcade.KID.cap`, 0,35), aucun pacte, calibration de latence jamais imposée (« Passer ▸ », pas redemandée dans la session).
- Niveaux figés (anti-triche) : défi du jour → niveau lu à la 1re ouverture du défi du jour et gardé dans `daily.s.days[jour].p` (un nouveau profil compte le lendemain ; null → « standard » ×1,15, musicien ×1, découverte ×1,35) ; Découverte = tirage parmi les jeux kid non rythmiques (`daily.KID_POOL`) et classement à part. Duel → niveau `d` et niveau du créateur `p` (coefficient) figés dans le lien (p figé au brouillon), niveau du relevé figé à la 1re ouverture du lien (`duel.s.seen`).
- `arcade.sustain` (pédale CC64) : faux au chargement, suit CC64 tant que la borne reçoit le MIDI, remis à faux à l'ouverture et à la fermeture de la borne.
- Latence : `AMB.latency` (par appareil et par entrée, jamais exportée). Sauvegarde (js/save.js) : `game.s` (profil, placement), `arcade.s` (niveaux, records, pactes cochés), `daily.s` (nom, essais, niveaux du jour, classement) ; pas la latence ni les essais de duel. L'import FUSIONNE le défi du jour : un essai déjà présent (et son niveau figé) gagne toujours, mes lignes du classement aussi ; les essais de duel ne sont pas touchés.
- Essai officiel laissé « partiel » par un rechargement : terminé au chargement suivant avec son score (comme Échap).

## Liens (hash)
- `#p=…` patch partagé (js/ui.js) : marche dans les deux modes, sans trace du jeu.
- `#dj=…` score du défi du jour, `#df=…` défi de cousin (codec + somme de contrôle de js/daily.js `link`), `#save=…` sauvegarde (js/save.js). En mode libre, chacun propose d'abord de passer en Parcours (`daily.offerPath`) ; rien n'est enregistré avant. Lien abîmé ou falsifié : ignoré avec un message, jamais d'exception. (Backlog R3 : js/links.js, codec et routeur uniques.)

## Ordre de chargement (dépendances)
- `arcade.js` → `pacts.js` → `latency.js` → mini-jeux → … → `save.js` → `arcade-ui.js` → `placement.js` → `daily.js` → `duel.js`. arcade-ui avant placement / daily / duel (ils ajoutent leurs sections à la borne) ; daily avant duel (codec des liens, niveaux, `offerPath`, bannière). save.js lit `AMB.daily` seulement à l'usage (après DOMContentLoaded).

## Store (sources de `store.set(k, v, source)`)
- `user` = la seule qui paie ou compte (découvertes, contrats, secrets) ; l'annulation enregistre `user`, `preset`, `macro`.
- `preset` (presets, liens partagés), `macro` (potards macro), `undo`, `sync` (position des macros recalculée, muette), `xy` (pad XY et CC MIDI sur les cibles des macros : hors annulation, émet `act` 'xy'), `morph` (scènes, sections du morceau), `evolve` (Dérive), `lfo` (Mouvements lents + automation), `game` (passe les verrous du Parcours : arbre, cible d'énigme, Mastermind de duel, cadeaux, placement).
- Emprunt du son : `store.borrow(owner, vals)` (source `game`) garde les valeurs du joueur à la 1re prise de chaque réglage, `giveBack(owner, skip?)` les rend, `giveBackAll()`, `lending()`, `borrowed()`. Utilisé par la cible d'une énigme (`puzzles.ab`, owner 'puzzle') et le Mastermind de duel (owner 'duel'). Pendant un emprunt : `stableSnapshot()` (journal, patchs, instantanés de mode) voit les valeurs du joueur, `game.freePlay()` est faux, un changement de mode rend tout (`tree.onMode`).
- `game.quiet` (js/game.js) : vrai pendant un lot de déblocages (test de placement) : un seul carillon, pas d'écran de fin au milieu. `game.s.placed` : nœuds ouverts par le placement, leurs découvertes ne rapportent rien.
- Un mini-jeu n'écrit JAMAIS dans le store : il joue par `AMB.audition` (bus à part, ambiance atténuée, Dérive et LFO gelés pendant la manche).

## Mode libre intact
- En libre : aucun verrou, aucune interface de jeu, aucun gain ni détection, pas de juice (sauf dans la borne), pas de carillon. Son, journal, annulation et liens partagés sans trace du jeu.
- `AMB.game.freePlay()` = les effets et gains du Parcours peuvent s'appliquer (Parcours, pas de manche d'arcade, pas d'écoute de cible d'énigme).
- Cadeaux : timbres trouvés disponibles partout ; clavier miroir et thèmes LCD seulement en Parcours. Borne ouverte : l'appli ne joue pas le MIDI et le reste de la page est inert ; pas de manche pendant un enregistrement.
- Menu ⋯ : les entrées du Parcours (Profil, Test de placement, Sauvegarde) sont dans une sous-section repliable « Mon Parcours » (`#pathMenu`, js/placement.js), cachée en mode libre ; le menu ouvert passe au-dessus des panneaux fixes (Contrats).

## Tester
- Un serveur par worktree : `python3 -u -m http.server $PORT 2> $LOG` (PORT=87xx), puis `PORT=… LOG=… tests/run.sh <page>.html 0.4` ; suite : `tests/run-all.sh` (ALL OK).
- Page dédiée ≤ 10 s, sans audio réel (horloge injectée `arcade.clock.now`, rng à graine, OfflineAudioContext si le son doit être vérifié).
- 2 captures regardées (bureau + 390 px). Chrome headless impose ≥ 500 px : pour 390 px, `tests/shot-tree.html?w=390&h=780` (page dans une iframe de 390 px). Modes : `#sel=<nœud>`, `#pz`, `#bar`, `#free`, `#more` (menu ⋯ en Parcours), `#arcade`, `#arcade-kid`, `#arcade-pacts`, `#arcade-play=<id>` (`&d=0.7`, `&mut=…`), `#arcade-end`, `#arcade-daily`, `#arcade-duel`, `#pf-profile`, `#pf-end`, `#pf-kid`, `#pf-joy`, `#save-open`, `#save-confirm`, `#save-back` (manche : ajouter `--autoplay-policy=no-user-gesture-required` ; en `#arcade*`, `#pf-*`, `#save-*`, `#more` particules et juice coupés).

## Points ouverts
- Aucun pour l'instant.
