# Architecture (v0.99)

Scripts classiques, pas de build. État global `window.AMB`. Un module = un IIFE qui pose `AMB.<nom>` (ordre de chargement = `index.html`). Bus : `AMB.bus.on/emit` (js/sequencer.js). Réglages : `AMB.store` (js/params.js, schéma `AMB.SCHEMA`).

## Où mettre quoi
- Mini-jeu = `js/arcade/<id>.js` + `css/arcade-<id>.css` + `tests/arcade-<id>.html`, rien d'autre. Coquilles déjà déclarées dans `index.html`, `sw.js`, `tests/run-all.sh` (intrus, bouge, reponds, modes, accordeur ; démo : hautbas).
- Nouveau module = sa page `tests/<module>.html` (≤ 10 s) avec l'en-tête `tests/lib.js` (log, ok, wait, done, fail, testBus ; erreurs capturées). Plus rien dans gameui.html.
- Seul le réconciliateur modifie `index.html`, `sw.js` (ASSETS dans l'ordre d'index.html + CACHE), `ROADMAP.md`, `css/style.css` et les manifestes.

## Plugin d'arcade (contrat : en-tête de js/arcade.js)
```js
AMB.arcade.register({ id: 'x', title: 'Titre', skill: 'hauteur', blurb: 'Une phrase.', kid: true,
  make(rng, d) { return { up: rng() < 0.5, d }; },          // d 0..1 (0 = facile) ; rng() rng.int(n) rng.pick(a)
  stimulus(ch) { return [{ t: 0, midi: 60, dur: 0.6, vel: 0.8, voice: 'triangle' }]; }, // ou play(ch, api)
  choices(ch) { return [{ value: 'up', label: '⬆' }, { value: 'down', label: '⬇' }]; }, // null = réponse jouée
  check(ch, a) { return { ok: a === (ch.up ? 'up' : 'down') }; },                       // {ok, partial?}
});
```
Optionnels : `play(ch, api)`, `render(ch, el, api)`, `onKey(ch, e, api)`, `passKeys`, `onMidi(ch, {midi, vel, time}, api)`, `onMidiOff(ch, {midi, time}, api)`. `api = {answer, replay, play(ev) → {dur, at, t0}, stop, note(ev), t0, ch, d, rng}` ; `t0` = performance.now() (ms) du départ réel du stimulus (même horloge que `time` du MIDI) ; `note(ev)` = retour sonore immédiat. Voix : sine, triangle, pluck, bell. Classes CSS `.arc-<id>-*`. Jamais `Math.random`. `arcade.open` = borne à l'écran, `arcade.active` = manche en cours.

## Bus (événements et charges utiles)
- `live` {midi, time (s ctx), vel (entendue), raw (vélocité MIDI brute 0..1, null au clavier d'ordinateur)} · `chord` {time, deg, midis} · `phrase` {i, len, time} · `section` {index, name}
- `note` {layer, midi, time, vel, dur} · `perc` {track, time, vel} · `grain` {layer, midi, time, vel} · `freeze` {}
- `act` 'id' (action réussie : save, share, keep, restore, rec, reclive, chord, note, freeze, xy, midiConnect, midiExport, preset, sceneStore…) · `rec:done` secondes · `secret` {id}
- `game:*` earn {n, reason, id, total}, spend, unlock {id}, found / contracts / puzzles {id}, mode, reset, contract, puzzle, stars, opened, secret, chime {kind}
- `arcade:*` register, start {id, seed, d, pacts}, challenge {id, n, d}, answer {ok, pts, d, combo, mult…}, end {score, stars, record…} · `juice:combo` {n, mult, best}

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
- 2 captures regardées (bureau + 390 px). Chrome headless impose ≥ 500 px : pour 390 px, `tests/shot-tree.html?w=390&h=780` (page dans une iframe de 390 px). Modes : `#sel=<nœud>`, `#pz`, `#bar`, `#free`, `#arcade`, `#arcade-play=<id>`, `#arcade-end` (manche : ajouter `--autoplay-policy=no-user-gesture-required`).
