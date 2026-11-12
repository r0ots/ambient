# Architecture (v1.01)

Scripts classiques, pas de build. État global `window.AMB`. Un module = un IIFE qui pose `AMB.<nom>` (ordre de chargement = `index.html`). Bus : `AMB.bus.on/emit` (js/sequencer.js). Réglages : `AMB.store` (js/params.js, schéma `AMB.SCHEMA`).

## Où mettre quoi
- Mini-jeu = `js/arcade/<id>.js` + `css/arcade-<id>.css` + `tests/arcade-<id>.html`, rien d'autre. Coquilles déjà déclarées dans `index.html`, `sw.js`, `tests/run-all.sh` (intrus, bouge, reponds, modes, accordeur, dictee ; démo : hautbas).
- Nouveau module = sa page `tests/<module>.html` (≤ 10 s) avec l'en-tête `tests/lib.js` (log, ok, wait, done, fail, testBus ; erreurs capturées). Plus rien dans gameui.html. Une CSS par module (`css/<module>.css`) : les agents ne touchent pas `css/style.css`. Les agents lancent seulement leurs pages ; la suite complète est lancée à la fusion. `tests/game.html` vérifie que `sw.js` précache tout `index.html`, dans l'ordre.
- Visuel « Jardin » (G11.2) : `js/garden-visual.js` (à charger après visual.js et game.js) enveloppe `AMB.visual.draw` / `cycleMode` ; Jardin n'existe qu'en Parcours (défaut, préférence `ambient.vizMode.path`), le libre garde `ambient.vizMode` et ses 3 visuels. Lecture seule de `game.s.nodes`, `arcade.s` (jamais `arcade.stats()`, qui crée des entrées) et `game.s.secrets.found` ; correspondance couche ↔ mini-jeu en tête du fichier.
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
Optionnels : `reveal` (ms, pause après la réponse avant le défi suivant, réponses bloquées ; défaut `arcade.REVEAL` = 450 ; Accordeur 1600, Réponds 1200), `prepare(api)` → Promise (appelé par arcade-ui AVANT `arcade.start`, hors chrono ; `api = {stage, play, note, stop, now, onKey(fn), onMidi(fn), cancelled()}`, touches et MIDI routés via `arcade.prep`, Échap annule ; ex. calibration de latence de Réponds), MIDI (G9b.2) : `onMidi` reçoit `{midi, vel (brute 0..1), time, sustain (CC64 tenu), input (nom de l'entrée, plusieurs à la fois)}`, `onCC(ch, {cc, value, time, sustain, input}, api)` reçoit les CC (pédale : `arcade.sustain`) ; jeux rythmiques : `prepare(api) { return AMB.latency.ensure(api); }` et retirer `AMB.latency.get(src, input)` des temps de frappe (`js/latency.js` : calibration globale par appareil et par entrée key / touch / midi / clavier MIDI, recalibrable par « ⟲ Latence » dans la borne), `bonus` dans `check` (0..1 : + `SCORE.bonus` (0,5) × bonus des points de base, ex. part de « parfait »), `play(ch, api)`, `render(ch, el, api)`, `onKey(ch, e, api)`, `passKeys`, `onMidi(ch, {midi, vel, time}, api)`, `onMidiOff(ch, {midi, time}, api)`. `api = {answer, replay, play(ev) → {dur, at, t0}, stop, note(ev), t0, ch, d, rng}` ; `t0` = performance.now() (ms) du départ réel du stimulus (même horloge que `time` du MIDI) ; `note(ev)` = retour sonore immédiat. Voix : sine, triangle, pluck, bell (`ev.atk` = attaque en s des voix simples sine / triangle, défaut min(20 ms, dur/4)). Profil joueur : `AMB.game.profile()` ('musicien' | 'decouverte') / `isKid()` (game.s.profile) ; un plugin lit `AMB.arcade.kid` dans `make()` (départ à d = 0 et libellés enfant, ex. Chasseur de modes) ou `api.kid` ; `arcade.start(id, {d, dMax, duration, practice})`, `arcadeUI.start(id, {…, label, onEnd})` pour enchaîner des manches (js/placement.js). Classes CSS `.arc-<id>-*`. Jamais `Math.random`. `arcade.open` = borne à l'écran, `arcade.active` = manche en cours.

## Bus (événements et charges utiles)
- `live` {midi, time (s ctx), vel (entendue), raw (vélocité MIDI brute 0..1, null au clavier d'ordinateur)} · `chord` {time, deg, midis} · `phrase` {i, len, time} · `section` {index, name}
- `note` {layer, midi, time, vel, dur} · `perc` {track, time, vel} · `grain` {layer, midi, time, vel} · `freeze` {}
- `act` 'id' (action réussie : save, share, keep, restore, rec, reclive, chord, note, freeze, xy, midiConnect, midiExport, preset, sceneStore…) · `rec:done` secondes · `secret` {id}
- `game:*` earn {n, reason, id, total}, spend, unlock {id}, found / contracts / puzzles {id}, mode, reset, contract, puzzle, stars, opened, secret, chime {kind}
- `arcade:*` register, start {id, seed, d, pacts}, challenge {id, n, d}, answer {ok, partial, bonus, reveal, pts, d, combo, mult, late…}, end {score, stars, record, ghost, pacts, pmult, fall…}, screen 'menu' | 'play' | 'end' | 'daily' | 'duel' | 'closed' (arcade-ui `show`, toute `section.arc-<nom>` de la borne) · `juice:combo` {n, mult, best} · `game:profile` 'musicien' | 'decouverte'

## Manches (options de `arcade.start` / `arcadeUI.start`)
- `{seed, duration (Infinity = zen), d (départ), dMax (plafond), fixed (pas d'escalier), count (fin après n réponses), practice (ni record ni partie comptée), ghost (rien d'enregistré), pacts}` + côté UI `label`, `onEnd` (manches enchaînées : placement, « Jouer 2 min ») et `arcadeUI.after(d)` (défi du jour, duel).
- Pactes (js/pacts.js) : seulement ceux cochés sur la cartouche pour une manche normale ; jamais en manche enchaînée (`onEnd`) ni fantôme (`ghost` : défi du jour, duel) pour que les scores restent comparables. Exclusions par jeu : `pacts.SKIP` ou `pacts: {id: bool}` du plugin.
- Profil joueur : `AMB.game.s.profile` (null = pas choisi, `profile()` répond alors 'musicien') ; le défi du jour lit la valeur brute (null → « standard » ×1,15, musicien ×1, découverte ×1,35).
- Latence : `AMB.latency` (par appareil et par entrée, jamais exportée). Sauvegarde (js/save.js) : `game.s` (profil, placement), `arcade.s` (niveaux, records, pactes cochés), `daily.s` (nom, essais, classement) ; pas la latence ni les essais de duel.

## Store (sources de `store.set(k, v, source)`)
- `user` = la seule qui paie ou compte (découvertes, contrats, secrets) ; l'annulation enregistre `user`, `preset`, `macro`.
- `preset` (presets, liens partagés), `macro` (potards macro), `undo`, `sync` (position des macros recalculée, muette), `xy` (pad XY et CC MIDI sur les cibles des macros : hors annulation, émet `act` 'xy'), `morph` (scènes, sections du morceau), `evolve` (Dérive), `lfo` (Mouvements lents + automation), `game` (passe les verrous du Parcours : arbre, cible d'énigme, cadeaux).
- Un mini-jeu n'écrit JAMAIS dans le store : il joue par `AMB.audition` (bus à part, ambiance atténuée, Dérive et LFO gelés pendant la manche).

## Mode libre intact
- En libre : aucun verrou, aucune interface de jeu, aucun gain ni détection, pas de juice (sauf dans la borne), pas de carillon. Son, journal, annulation et liens partagés sans trace du jeu.
- `AMB.game.freePlay()` = les effets et gains du Parcours peuvent s'appliquer (Parcours, pas de manche d'arcade, pas d'écoute de cible d'énigme).
- Cadeaux : timbres trouvés disponibles partout ; clavier miroir et thèmes LCD seulement en Parcours. Borne ouverte : l'appli ne joue pas le MIDI et le reste de la page est inert ; pas de manche pendant un enregistrement.

## Tester
- Un serveur par worktree : `python3 -u -m http.server $PORT 2> $LOG` (PORT=87xx), puis `PORT=… LOG=… tests/run.sh <page>.html 0.4` ; suite : `tests/run-all.sh` (ALL OK).
- Page dédiée ≤ 10 s, sans audio réel (horloge injectée `arcade.clock.now`, rng à graine, OfflineAudioContext si le son doit être vérifié).
- 2 captures regardées (bureau + 390 px). Chrome headless impose ≥ 500 px : pour 390 px, `tests/shot-tree.html?w=390&h=780` (page dans une iframe de 390 px). Modes : `#sel=<nœud>`, `#pz`, `#bar`, `#free`, `#arcade`, `#arcade-pacts`, `#arcade-play=<id>` (`&d=0.7`, `&mut=…`), `#arcade-end`, `#arcade-daily`, `#arcade-duel`, `#pf-profile`, `#pf-end`, `#pf-kid`, `#pf-joy`, `#save-open`, `#save-confirm`, `#save-back`, `#garden`, `#garden-adv` (manche : ajouter `--autoplay-policy=no-user-gesture-required` ; en `#arcade*`, `#pf-*`, `#save-*`, `#garden*` particules et juice coupés).

## Points ouverts
- Aucun pour l'instant.
