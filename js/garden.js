// « Jardin sonore » : the game's interface (welcome choice, path/free switch, the challenge on the LCD, the Réponse's
// feedback (S4.2: LCD and chime; the phrase itself lives in the music, js/puzzles.js), end of the path; the tree
// screen is in garden-tree.js). Progression lives in game.js, the tree and locks in tree.js.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const $ = (s) => document.querySelector(s);

  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  const garden = {
    reduced: !!(mq && mq.matches), // reduced motion: the unlock sequence jumps to its final state
    welcome(on) { const d = $('#welcomeDlg'); if (d) d.hidden = !on; },
    choose(mode) {
      AMB.game.setMode(mode);
      this.welcome(false);
      this.renderSwitch();
      AMB.ui.toast(mode === 'path' ? '🌱 Parcours : une seule note pour commencer. Glisse sur l\'écran pour l\'entendre.' : '◎ Mode libre : tout est ouvert');
    },
    renderSwitch() {
      const b = $('#gameMode'); if (!b) return;
      b.textContent = AMB.game.path ? '◎ Passer en mode libre' : '🌱 Parcours (ouvrir pas à pas)';
    },
    // ---- the challenge on the 2nd line of the LCD (v1.06): one at a time, ↷ = the next one, a tap = how to do it ----
    // S4.6: a node won waits there first, « ✦ Ouvrir : <nœud> » (pulsing; « N prêts » when several wait): a tap tells what
    // it gives (ask), « Ouvrir » opens it (openNode). The next challenge comes once the queue is empty.
    renderContracts(flashId) {
      const box = $('#lcdTask'), line = $('#lcdLine'); if (!box || !AMB.contracts) return;
      const K = AMB.contracts, g = AMB.game, live = g.path && !this.handedOver();
      const ready = live ? g.s.ready || [] : [], nr = live && g.nextReady(), rn = nr && AMB.tree.byId[nr.id];
      const id = live && !rn ? K.state().active[0] : null, d = id && K.byId[id];
      const offer = !d && !rn && g.path && this.offer && this.handedOver(); // S4.5w: after the finale, the song is offered here
      box.hidden = !d && !offer && !rn; if (line) line.hidden = !!(d || offer || rn);
      box.classList.toggle('ready', !!rn);
      const tb = $('#treeBtn'); if (tb) tb.classList.toggle('has-ready', !!rn);
      const skip = box.querySelector('.lcd-skip'), skipTxt = offer ? 'Non merci' : 'Passer au défi suivant';
      if (skip) { skip.title = skipTxt; skip.setAttribute('aria-label', skipTxt); skip.hidden = !!rn; }
      if (rn) {
        box.dataset.id = 'open:' + rn.id; box.classList.remove('help');
        const t = box.querySelector('.lcd-task-txt'); t.textContent = `✦ Ouvrir : ${rn.name}`; t.title = 'Toucher : voir ce qui s\'ouvre';
        box.querySelector('.lcd-task-n').textContent = ready.length > 1 ? `${ready.length} prêts` : '';
        return;
      }
      if (offer) {
        box.dataset.id = 'wav'; box.classList.remove('help');
        const t = box.querySelector('.lcd-task-txt'); t.textContent = '⤓ Garde ton morceau (WAV)'; t.title = 'Toucher : télécharger le morceau que tu viens d\'entendre';
        box.querySelector('.lcd-task-n').textContent = '';
        return;
      }
      if (!d) return;
      if (box.dataset.id !== id) box.classList.remove('help');
      box.dataset.id = id;
      const n = K.progress(id), resp = d.kind === 'reponse', help = box.classList.contains('help') && d.hint;
      const txt = box.querySelector('.lcd-task-txt');
      txt.textContent = help ? d.hint : resp ? `↺ Réponse : ${d.title}` : `◇ ${d.title}`;
      txt.title = help ? 'Toucher : revenir au défi' : `${d.hint}\n(Toucher : comment faire)`;
      box.querySelector('.lcd-task-n').textContent = resp ? `${AMB.puzzles.need(d)} ♪` : d.goal > 1 ? `${n}/${d.goal}` : n ? '✓' : '·';
      if (flashId === id) { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
    },
    // clicks that always succeed go on the bus as actions (contracts count them); actions that can fail or be
    // cancelled (save, journal, chords, freeze) are emitted by their own code once they really happened
    CLICKS: [['#dice', 'dice'], ['.sc-store', 'sceneStore']],
    hookActions() {
      const emit = (id) => AMB.bus.emit('act', id);
      document.addEventListener('click', (e) => {
        if (!AMB.game.path) return;
        const t = e.target.closest && e.target.closest('button, label'); if (!t) return;
        if (t.matches('.sc-slot')) return emit(e.shiftKey ? 'sceneStore' : 'sceneRecall');
        for (const [sel, id] of this.CLICKS) if (t.matches(sel)) return emit(id);
      }, true);
      AMB.store.on((k, v, src) => { if (src === 'xy' && AMB.game.path) emit('xy'); });
    },
    // ---- game feedback (G6.2): a chime tuned to the key, LCD messages ----
    // kind: 'unlock' (rising arpeggio), 'solve' (two chords), 'small' (one soft note); straight to the speakers
    // S4.5w: `at` = audio time (the next strong beat, see beat()), `deg` = the opened layer's own note, in the key
    chime(kind = 'unlock', o = {}) {
      const E = AMB.engine, ctx = E && E.ctx;
      if (!ctx || ctx.state !== 'running' || !AMB.game.path) return 0;
      const Th = AMB.theory, root = Th.NOTE_NAMES.indexOf(AMB.store.get('global.key'));
      const scale = Th.SCALES[AMB.store.get('global.scale')] || Th.SCALES['Ionien (majeur)'];
      const J = this.JINGLES[kind], up = J ? Math.min(7, o.n || 0) : 0; // S5.3: the juice of the Réponse, higher as the series grows
      const degs = (J ? J.degs : kind === 'small' ? [4] : kind === 'solve' ? [0, 2, 4, 7, 9, 11] : [0, 2, 4, 7]).map((d) => d + (o.deg || 0) + up);
      const out = ctx.createGain(); out.gain.value = 0.16;
      out.connect(ctx.destination); // never recorded nor frozen
      const t0 = Math.max(ctx.currentTime + 0.02, o.at || 0);
      if (J && J.boing) { // a goofy « boing »: a triangle sliding up two octaves
        const b = ctx.createOscillator(), bg = ctx.createGain(), f0 = Th.mtof(Th.degreeToMidi(up, root, scale, 3)), tb = t0 + degs.length * J.gap;
        b.type = 'triangle'; b.frequency.setValueAtTime(f0, tb); b.frequency.exponentialRampToValueAtTime(f0 * 4, tb + 0.28);
        bg.gain.setValueAtTime(0, tb); bg.gain.linearRampToValueAtTime(0.35, tb + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, tb + 0.4);
        b.connect(bg); bg.connect(out); b.start(tb); b.stop(tb + 0.45);
      }
      degs.forEach((dg, i) => {
        const f = Th.mtof(Th.degreeToMidi(dg, root, scale, 5));
        const at = t0 + (J ? i * J.gap : kind === 'solve' ? (i < 3 ? 0 : 0.35) + i % 3 * 0.02 : i * 0.09);
        for (const [mul, amp] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) { // bell-ish partials
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f * mul;
          g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp * 0.5, at + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6 / mul);
          o.connect(g); g.connect(out); o.start(at); o.stop(at + 1.7);
        }
      });
      setTimeout(() => out.disconnect(), 3000 + (t0 - ctx.currentTime) * 1000);
      return degs.length;
    },
    // S5.3 jingles of the Réponse (scale degrees, gap between notes in s): a series that grows, a record, a new tier
    JINGLES: {
      streak: { degs: [0, 2, 4], gap: 0.07 },
      record: { degs: [0, 4, 2, 6, 4, 9], gap: 0.06, boing: true },
      tier: { degs: [0, 2, 4, 7, 9, 11, 14], gap: 0.075, boing: true },
      // S5.9 the juice table's moments (FX), bigger for bigger moments
      pop: { degs: [7], gap: 0.05 },
      ready: { degs: [4, 7], gap: 0.08 },
      defi: { degs: [0, 2, 4, 7, 4, 7, 11], gap: 0.06, boing: true },
      end: { degs: [0, 4, 7, 11, 14, 11, 14, 18, 21], gap: 0.09, boing: true },
      discovery: { degs: [0, 7, 4, 11, 7, 14, 11, 18, 14, 21], gap: 0.05, boing: true },
    },
    // ---- S4.5w: an opening lands on the music ----
    // next strong beat (beat 1 or 3 of the bar, counted from the song section's start) at least `lead` s ahead, on the
    // audio clock; null while the sequencer is stopped. S.step is the next step to schedule, at S.nextTime.
    // unit = 4: the next beat
    strongBeat(lead = 0.05, S = AMB.seq, now = AMB.engine && AMB.engine.ctx && AMB.engine.ctx.currentTime, unit = 8) {
      if (!S || !S.playing || now == null) return null;
      const sd = S.stepDur(), o = S.origin || 0;
      let j = S.step + Math.ceil((now + lead - S.nextTime) / sd - 1e-6);
      j += (unit - (((j - o) % unit) + unit) % unit) % unit;
      return S.nextTime + (j - S.step) * sd;
    },
    // the opened layer's own chime note (scale degrees above the key's root): each plant has its voice
    LAYER_DEG: { pad: 2, bells: 4, texture: 5, grains: 3, seq: 6, bass: -3, perc: 1 },
    layersOf(id) { const GV = AMB.gardenVisual; return GV ? GV.LAYERS.filter((l) => l.node === id).map((l) => l.id) : []; },
    FADE: 1.6, // s: a new layer comes in from silence on the strong beat
    // a node opens (path): its chime and its layer wait for the next strong beat (map: after its link lit up), the layer
    // fades in from there, its plant grows (garden-visual.js). Stopped: right away.
    beat(id) {
      const ctx = AMB.engine && AMB.engine.ctx, run = ctx && ctx.state === 'running';
      const at = run ? this.strongBeat(0.45) : null, now = run ? ctx.currentTime : 0;
      const ls = this.layersOf(id);
      this.lastBeat = { id, at, deg: ls.length ? this.LAYER_DEG[ls[0]] || 0 : 0 };
      this.beats[id] = this.lastBeat; // several openings at once (a discovery during a map sequence) keep their own beat
      if (AMB.gardenVisual) AMB.gardenVisual.growAt(at != null ? at : null);
      if (!run) return this.lastBeat;
      for (const l of ls) { // tree.onUnlock already switched it on (level glides up): hold it at 0 until the beat
        const L = AMB.layers && AMB.layers[l], lv = L && L.ch && L.ch.level; if (!lv || !L.active) continue;
        const v = Math.pow(AMB.store.get(l + '.vol'), 1.6), t = at != null ? at : now;
        lv.gain.cancelScheduledValues(now); lv.gain.setValueAtTime(0, now); lv.gain.setValueAtTime(0, t);
        lv.gain.linearRampToValueAtTime(v, t + this.FADE);
      }
      return this.lastBeat;
    },
    beats: {}, // node id -> {id, at, deg}
    beatOf(id) { return this.beats[id] || {}; },
    lcd(text, ms = 3500) { AMB.lcdMsg = { text, until: Date.now() + ms }; },
    // ---- S4.6: opening is the player's move. The card says in plain words what the node gives (tree.EXPLAIN), then
    // « Ouvrir » plays the opening (chime on the beat, the layer comes in, the plant grows, the map's sequence for a
    // challenge) and what it opens comes in animated (tree.appear). Nothing goes away on a timer before that. ----
    ask(id) {
      const dlg = $('#openDlg'); if (!dlg) return false;
      const g = AMB.game, n = id && AMB.tree.byId[id];
      if (!n || !g.path || !g.canOpen(id)) { dlg.hidden = true; dlg.dataset.id = ''; return false; }
      const more = (g.s.ready || []).length - 1;
      dlg.dataset.id = id;
      dlg.querySelector('.modal-card').style.setProperty('--c', AMB.tree.BRANCHES[n.branch].color);
      dlg.querySelector('.open-name').textContent = n.name;
      dlg.querySelector('.open-why').textContent = n.why;
      dlg.querySelector('.open-more').textContent = more > 0 ? `Ensuite, encore ${more} à ouvrir.` : '';
      dlg.hidden = false;
      const go = dlg.querySelector('.open-go'); if (go) go.focus({ preventScroll: true });
      return true;
    },
    openNode(id) {
      const g = AMB.game, T = AMB.tree;
      this.ask(null);
      if (!id || !g.canOpen(id)) return false;
      T.hold(); // what it opens waits for the end of the map's sequence (seqFinish), or comes in now
      const ok = g.open(id);
      if (ok && this.seq && this.seq.id === id) this.seq.held = true;
      else { T.release(); if (ok) this.reveal(id); }
      return ok;
    },
    // ---- the instrument handed over (G6.3, S3.7) ----
    complete() { const T = AMB.tree; return T.NODES.every((n) => AMB.game.has(n.id)); },
    // whole tree owned: no game interface any more (challenge line), the tree stays to look at; saved (game.s.ended)
    handing: false, // the moment itself (chime, LCD message) before the game interface goes
    handedOver() { return !!AMB.game.s.ended && !this.handing; },
    // the path's last challenge (« Enregistre ton morceau ») closes it: with the whole tree owned, it comes first, and
    // the instrument is handed over once it is done or passed (↷)
    FINALE: 'c.morceau',
    checkEnd() {
      const g = AMB.game, K = AMB.contracts, F = this.FINALE;
      if (!g.path || g.s.ended || !this.complete()) return false;
      if (K && K.byId[F] && !g.s.contracts.includes(F) && !(g.s.skipped || []).includes(F)) {
        if (K.state(g).active[0] !== F) { g.s.active = [F]; g.s.prog[F] = g.s.prog[F] || { n: 0 }; g.save(); g.emit('contract', { active: [F] }); }
        return false;
      }
      g.s.ended = true; g.save(); // nothing counts from now on (game.counts)
      // no end screen: the instrument itself says it (chime, LCD), then the challenge line goes; the sound is untouched.
      // S4.5w: when the recorded song just ended the path (keepSong), it is heard again first (finale)
      this.handing = true;
      setTimeout(() => { this.showTree(false); if (this.song) this.finale(); else this.handOver(); }, 900);
      return true;
    },
    handOver() {
      this.fx('end', { say: '✦ L\'instrument est à toi', ms: 6000 });
      setTimeout(() => { this.handing = false; this.renderContracts(); }, 2000);
    },

    // ---- S4.5w: a real ending. The song recorded by « Enregistre ton morceau » is replayed on the instrument (the live
    // sound steps back), the garden goes from night to dawn and each plant lights up when its layer plays (the events
    // taped during the recording); then « L'instrument est à toi » and the WAV is offered on the LCD line. ----
    // The replay is an excerpt of REPLAY s (the whole song if barely longer): a song lasts 1-3 min at these tempos, the
    // dawn is a moment to watch, not a second listening; the window with the most layers heard is chosen, and the whole
    // WAV is what is offered.
    REPLAY: 18,
    songTape: { t0: null, ev: [] },
    tape(layer, time, vel, deg) { // bus events during the song's recording (path only), times from its start
      const R = AMB.rec, t0 = R && R.songT0 && R.songT0();
      if (t0 == null || !AMB.game.path) return;
      if (this.songTape.t0 !== t0) this.songTape = { t0, ev: [] };
      if (this.songTape.ev.length < 20000) this.songTape.ev.push({ layer, t: (time || 0) - t0, vel, deg });
    },
    // rec.js hands the finished WAV here first: kept (true) when this recording is ending the path
    keepSong(blob) {
      if (!AMB.game.path || !this.handing || this.song || !blob) return false;
      this.song = { blob, ev: this.songTape.ev.slice() };
      return true;
    },
    excerpt(ev, dur, len = this.REPLAY) {
      if (dur <= len + 4) return { from: 0, len: dur };
      const e = ev.filter((x) => x.layer !== 'chord').sort((a, b) => a.t - b.t), cnt = {};
      let best = 0, bestN = -1, lo = 0, hi = 0, n = 0;
      for (let f = 0; f <= dur - len; f += 1) {
        for (; hi < e.length && e[hi].t < f + len; hi++) if (!cnt[e[hi].layer]++) n++;
        for (; lo < hi && e[lo].t < f; lo++) if (!--cnt[e[lo].layer]) n--;
        if (n > bestN) { bestN = n; best = f; }
      }
      return { from: best, len };
    },
    async finale() {
      const s = this.song, E = AMB.engine, ctx = E && E.ctx, GV = AMB.gardenVisual;
      let buf = null;
      try { if (ctx && ctx.state === 'running') buf = await ctx.decodeAudioData(await s.blob.arrayBuffer()); } catch (e) { buf = null; }
      if (!buf) { this.offer = s.blob; this.song = null; return this.handOver(); }
      const w = this.excerpt(s.ev, buf.duration), live = !!(AMB.seq && AMB.seq.playing);
      if (live) E.fadeOut(0.8); // the instrument steps back while its song plays
      const src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime + (live ? 0.9 : 0.1), fo = Math.min(2, w.len / 4);
      src.buffer = buf; src.connect(g); g.connect(ctx.destination); // straight to the speakers: never recorded again
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.3);
      g.gain.setValueAtTime(1, t + w.len - fo); g.gain.linearRampToValueAtTime(0, t + w.len);
      src.start(t, w.from, w.len);
      this.playback = { src, g, live, t, len: w.len };
      if (GV) GV.replayStart({ t0: t - w.from, from: w.from, len: w.len, ev: s.ev });
      this.lcd('♪ Ton morceau', (t - ctx.currentTime + w.len) * 1000);
      src.onended = () => this.finaleEnd();
      this.playback.timer = setTimeout(() => this.finaleEnd(), (t - ctx.currentTime + w.len) * 1000 + 1500); // safety
    },
    finaleEnd() {
      const p = this.playback; if (!p) return;
      this.playback = null; clearTimeout(p.timer);
      const ctx = AMB.engine.ctx, n = ctx ? ctx.currentTime : 0;
      try { p.g.gain.cancelScheduledValues(n); p.g.gain.setValueAtTime(p.g.gain.value, n); p.g.gain.linearRampToValueAtTime(0, n + 0.15); p.src.stop(n + 0.2); } catch (e) {} // ■ Stop: a short fade, no click
      if (AMB.gardenVisual) AMB.gardenVisual.replayStop();
      if (p.live && AMB.seq && AMB.seq.playing) AMB.engine.fadeIn(2);
      this.offer = this.song && this.song.blob; this.song = null;
      this.handOver();
    },

    // ---- « Réponse » (S4.2): no card, the instrument says it — « ↺ À toi » when the answer bar comes, a soft note
    // for a right answer, the unlock sequence when it opens a gate ----
    reponse(e) {
      const P = AMB.puzzles; if (!e || !P || !AMB.game.path) return;
      if (e.phase === 'call') {
        const ctx = AMB.engine && AMB.engine.ctx, c = P.cur, ms = ctx ? Math.max(0, (e.ans - ctx.currentTime) * 1000) : 0;
        const say = e.tr ? '↺ Une quinte plus haut !' : e.chord ? (e.len > 1 ? '↺ À toi : les accords' : '↺ À toi : l\'accord') : '↺ À toi';
        clearTimeout(this._toiT); this.renderScore();
        this._toiT = setTimeout(() => { if (P.cur === c && c) this.lcd(say, 2500); }, ms);
      } else if (e.phase === 'end' && e.res) {
        const r = e.res;
        this.renderScore(r.ok && r.streak > 1);
        if (r.open || r.tier || r.tier || r.record || r.ok && r.streak > 1) return; // the juice table (FX: resp:*, game:ready) says it
        else if (r.ok) this.lcd(`✓ Juste · prochaine : ${r.next}`, 2500); // (its small juice: resp:streak → FX.juste)
        else this.lcd(P.level(r.lvl).tier ? `↺ Presque · ${r.name}` : `↺ Presque · prochaine : ${r.next}`, 2500);
      }
    },
    // S5.3 the score of the Réponse on the LCD (path only, once a phrase came): tier reached, series, record
    renderScore(bump) {
      const el = $('#lcdScore'), P = AMB.puzzles; if (!el || !P) return;
      const v = AMB.game.path && !this.handedOver() ? P.score() : null;
      el.hidden = !v; if (!v) return;
      el.textContent = `↺ ${v.name.toUpperCase()} · SÉRIE ${v.streak} · RECORD ${v.best}`;
      el.title = `Réponse : palier ${v.name}, ${v.streak} réussie${v.streak > 1 ? 's' : ''} d'affilée, record ${v.best}`;
      if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    },
    // ---- S5.9 « juice central »: ONE table, a moment of the game → a recipe of effects, all landing on the music's next
    // beat (or on the opening's strong beat). One intensity knob: JUICE (garden-visual.js). Path only: free mode never
    // gets here. Ingredients of a recipe:
    //   flash (the scene, 0..1) · confetti (pixel squares at JUICE 1, they spill out of the scene over the interface;
    //   `from` = where they burst) · shake (1 = the scene, 2 = the whole instrument too) · lcd ('glitch' | 'glitch-big' |
    //   'arcade' = the message scrolls in and blinks) · bounce (the buttons hop) · hop (one element hops) · punch (the scene
    //   zooms in, 1 | 1.5 | 2) · jingle (garden.chime kind, in the key) · pop (text that jumps out, arcade combo) · splash
    //   (S5.2 splashes of a plant) · beats (confetti again on the next beats) · say (the LCD message) · kick (S5.8 scene
    //   layers of the Jardin that flare up: gardenVisual.flare, same JUICE).
    // Moments fired in the same tick merge: the biggest (rank) plays alone (a gate answered = a challenge won, not also a
    // series). Reduced motion: a soft flash only (plus the jingle and the LCD message). S5.10 (combos, discoveries) reuses
    // it: fx('discovery', {name}).
    FX: {
      first: { rank: 1, confetti: 16, from: 'el', hop: 'el', jingle: 'pop', pop: '✦', kick: ['fireflies'] }, // a new control touched the 1st time
      juste: { rank: 2, confetti: 12, from: '#lcd', hop: '#lcdScore', jingle: 'small', kick: ['fireflies'] }, // a right answer (series of 1)
      ready: { rank: 2, confetti: 24, from: '#treeBtn', hop: '#treeBtn', jingle: 'ready', kick: ['fireflies', 'twinkle'] }, // a node waits on « ✦ Ouvrir »
      consolation: { rank: 2, confetti: 10, from: '#treeBtn', hop: '#treeBtn', jingle: 'small', kick: ['fireflies'] }, // a gate missed 6 times: « prêt quand même », no party
      streak: { rank: 3, flash: 0.25, confetti: 40, shake: 1, lcd: 'glitch', jingle: 'streak', pop: (o) => `×${o.n} !`, splash: 'streak', kick: ['twinkle', 'ripple'], say: (o) => `✓ Juste · série ${o.n}` },
      defi: { rank: 4, flash: 0.5, confetti: 140, shake: 1, lcd: 'arcade', bounce: 1, punch: 1, jingle: 'defi', pop: 'DÉFI RÉUSSI !!!', kick: ['rays', 'twinkle', 'ripple'] },
      record: { rank: 5, flash: 0.55, confetti: 160, shake: 2, lcd: 'glitch-big', bounce: 1, punch: 1, jingle: 'record', pop: (o) => `★ RECORD ×${o.n} !`, splash: 'record', kick: ['aurora', 'twinkle', 'song'], say: (o) => `★ Record : série ${o.n} !` },
      tier: { rank: 6, flash: 0.65, confetti: 220, shake: 2, lcd: 'glitch-big', bounce: 1, punch: 1.5, jingle: 'tier', pop: (o) => `↑ ${String(o.name || 'palier').toUpperCase()} !!`, splash: 'tier', kick: ['aurora', 'rays', 'song', 'ripple'], say: (o) => `↑ Palier : ${o.name}` },
      open: { rank: 7, flash: 0.75, confetti: 260, shake: 2, lcd: 'arcade', bounce: 1, punch: 1.5, jingle: 'unlock', pop: 'OUVERT !!!', splash: 'tier', kick: ['rays', 'aurora', 'ripple', 'hue'] },
      end: { rank: 8, flash: 1, confetti: 380, shake: 2, lcd: 'arcade', bounce: 1, punch: 2, jingle: 'end', pop: 'À TOI !!!', beats: 3, kick: ['aurora', 'rays', 'twinkle', 'fireflies', 'song', 'hue'] },
      placement: { rank: 10, flash: 1, confetti: 480, shake: 2, lcd: 'glitch-big', bounce: 1, punch: 2, jingle: 'discovery', pop: (o) => `⚡ ${String(o.name || 'musicien').toUpperCase()} !!!`, hop: '#treeBtn', splash: 'tier', beats: 4, kick: ['aurora', 'rays', 'twinkle', 'fireflies', 'song', 'ripple', 'hue'], say: (o) => `⚡ ${o.name || 'Musicien'} détecté` }, // S5.4 a Réponse placement (the queue « n prêts » is on the LCD's 2nd line)
      discovery: { rank: 9, flash: 1, confetti: 480, shake: 2, lcd: 'glitch-big', bounce: 1, punch: 2, jingle: 'discovery', pop: (o) => o.name ? `${String(o.name).toUpperCase()} !!!` : 'DÉCOUVERTE !!!', splash: 'tier', beats: 4, kick: ['aurora', 'rays', 'twinkle', 'fireflies', 'song', 'ripple', 'hue'], say: (o) => `✦ Découverte${o.name ? ' : ' + o.name : ' !'}` },
    },
    // the bus events that are moments (the others call fx() where they happen: an opening, a discovery, the end, a first touch)
    FX_ON: {
      'game:ready': (d) => {
        const c = d.by && AMB.contracts.byId[d.by], n = AMB.tree.byId[d.id];
        if (c && AMB.puzzles && AMB.puzzles.outGate === c.id) return ['consolation', { say: '✦ Prêt quand même', ms: 3000, toast: `Pas cette fois, mais ${n ? n.name : 'la suite'} est prêt à ouvrir quand même.` }];
        return c ? ['defi', { say: c.kind === 'reponse' ? '↺ ✓ Juste !' : '✓ Défi réussi' }] : ['ready'];
      },
      'game:contracts': (d) => { const c = AMB.contracts.byId[d.id]; return c && !c.node ? ['defi', { say: '✓ Défi réussi', ms: 2500 }] : null; }, // the last one
      'resp:streak': (d) => [d.streak > 1 ? 'streak' : 'juste', { n: d.streak }],
      'resp:record': (d) => ['record', { n: d.best }],
      'resp:tier': (d) => ['tier', { name: d.name }],
      'resp:place': (d) => ['placement', { name: d.name, n: (d.nodes || []).length, ms: 6000, toast: (d.nodes || []).length ? `Tu joues déjà : ${d.nodes.map((id) => AMB.tree.byId[id].name).join(', ')}. Ouvre-les un par un avec ✦ Ouvrir.` : '' }],
    },
    juice() { const GV = AMB.gardenVisual; return GV && GV.JUICE != null ? GV.JUICE : 1; },
    // a moment: its message at once (LCD, toast), its effects on the next beat. Returns the queued {kind, o} or null.
    fx(kind, o = {}) {
      const R = this.FX[kind]; if (!R || !AMB.game || !AMB.game.path) return null;
      const say = o.say || (typeof R.say === 'function' ? R.say(o) : R.say);
      if (say) this.lcd(say, o.ms || 3500);
      if (o.toast && AMB.ui && AMB.ui.toast) AMB.ui.toast(o.toast);
      const q = this._fxQ;
      if (q) { if (R.rank > this.FX[q.kind].rank) { q.kind = kind; q.o = o; } return q; }
      const nq = (this._fxQ = { kind, o });
      Promise.resolve().then(() => { this._fxQ = null; this.fxPlay(nq.kind, nq.o); });
      return nq;
    },
    // plays a recipe now (fx merges first): the jingle and the plant's splash are placed on the audio clock, the rest is
    // timed to the same beat. Returns the plan {kind, at, delay, did: [ingredients]}.
    fxPlay(kind, o = {}) {
      const R = this.FX[kind]; if (!R || !AMB.game.path) return null;
      const ctx = AMB.engine && AMB.engine.ctx, run = !!(ctx && ctx.state === 'running');
      const at = o.at != null ? o.at : run ? this.strongBeat(0.08, undefined, undefined, 4) : null;
      const delay = at != null && run ? Math.max(0, (at - ctx.currentTime + (ctx.outputLatency || 0)) * 1000) : 0;
      const red = this.reduced, J = this.juice(), GV = AMB.gardenVisual;
      const did = R.flash ? ['flash'] : [];
      if (R.jingle) { this.chime(R.jingle, { at, n: o.n || 0, deg: o.deg || 0 }); did.push('jingle'); }
      if (R.splash && GV) { GV.cheer(R.splash, at, o.plant); did.push('splash'); }
      if (!red) for (const k of ['confetti', 'shake', 'lcd', 'bounce', 'hop', 'punch', 'pop', 'kick']) if (R[k]) did.push(k);
      const beatMs = AMB.seq && AMB.seq.playing ? AMB.seq.stepDur() * 4000 : 380;
      const fire = () => {
        if (!AMB.game.path) return;
        const stage = $('.stage');
        if (R.flash) this.fxFlash(stage, red ? 0.22 : Math.min(1, R.flash * J), red);
        if (red) return;
        if (R.shake) { this.fxClass(stage, 'fx-shake', 500); if (R.shake > 1) this.fxClass($('.app'), 'fx-quake', 650); }
        if (R.punch) this.fxClass($('#viz'), R.punch >= 2 ? 'fx-punch-big' : 'fx-punch', 650);
        if (R.lcd) this.fxClass($('#lcd'), 'lcd-' + R.lcd, R.lcd === 'glitch' ? 700 : 1400);
        if (R.bounce) this.fxClass(document.body, 'fx-bounce', 800);
        const el = R.hop === 'el' ? o.el : R.hop && $(R.hop); if (el) this.fxClass(el, 'fx-hop', 550);
        if (R.kick && GV && GV.flare) GV.flare(R.kick, J);
        if (R.pop) this.fxPop(typeof R.pop === 'function' ? R.pop(o) : R.pop, stage, R.rank);
        if (R.confetti) {
          const src = R.from === 'el' ? o.el : R.from ? $(R.from) : stage, n = Math.round(R.confetti * J);
          this.confetti.burst(n, src || stage);
          for (let b = 1; b < (R.beats || 1); b++) setTimeout(() => this.confetti.burst(Math.round(n * 0.6), src || stage), b * beatMs); // again on the next beats
        }
      };
      if (delay > 0) setTimeout(fire, delay); else fire();
      return (this.fxLast = { kind, at, delay, did });
    },
    fxClass(el, cls, ms) {
      if (!el) return;
      el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
      const k = '_fx_' + cls; clearTimeout(el[k]); el[k] = setTimeout(() => el.classList.remove(cls), ms);
    },
    fxFlash(stage, a, soft) {
      if (!stage) return;
      let f = stage.querySelector(':scope > .fx-flash');
      if (!f) { f = document.createElement('div'); f.className = 'fx-flash'; f.setAttribute('aria-hidden', 'true'); stage.append(f); }
      f.style.setProperty('--a', a.toFixed(2)); f.classList.toggle('soft', !!soft);
      this.fxClass(f, 'on', soft ? 950 : 600);
    },
    fxPop(text, stage, rank) {
      const L = this.confetti.layer(), r = stage ? stage.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
      const p = document.createElement('div'); p.className = 'fx-pop'; p.textContent = text;
      p.style.left = Math.round(r.left + r.width / 2) + 'px'; p.style.top = Math.round(r.top + r.height * 0.42) + 'px';
      p.style.fontSize = `min(${24 + rank * 5}px, 10vw)`;
      L.hidden = false; L.append(p); setTimeout(() => { p.remove(); this.confetti.idle(); }, 1300);
      while (L.querySelectorAll('.fx-pop').length > 3) L.querySelector('.fx-pop').remove();
    },
    // pixel confetti on one fixed, click-through canvas over the whole page; it only draws while some are flying
    confetti: {
      COLORS: ['#ffb347', '#fff3c4', '#ff4fa0', '#4fe0ff', '#8fe3a0'], MAX: 700, G: 1500,
      bins: null, n: 0, raf: 0, last: 0, times: [],
      layer() {
        let L = document.getElementById('fxLayer');
        if (!L) { L = document.createElement('div'); L.id = 'fxLayer'; L.className = 'fx-layer'; L.setAttribute('aria-hidden', 'true'); L.innerHTML = '<canvas></canvas>'; document.body.append(L); }
        return L;
      },
      burst(n, src) {
        const L = this.layer(), cv = L.querySelector('canvas'), W = innerWidth, H = innerHeight;
        if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
        if (!this.bins) this.bins = this.COLORS.map(() => []);
        const r = src && src.getBoundingClientRect ? src.getBoundingClientRect() : { left: W / 2, top: H / 2, width: 0, height: 0 };
        for (let i = 0; i < n && this.n < this.MAX; i++, this.n++) {
          const x = r.left + Math.random() * r.width, y = r.top + Math.random() * r.height * 0.5, an = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = 380 + Math.random() * 780;
          this.bins[i % this.COLORS.length].push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, s: 3 + ((Math.random() * 4) | 0), w: 4 + Math.random() * 14, t: 0, life: 1.3 + Math.random() * 0.9 });
        }
        L.hidden = false; cv.hidden = false;
        if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.frame(t)); }
      },
      frame(ts) {
        const t0 = performance.now(), dt = Math.min(0.05, Math.max(0, (ts - this.last) / 1000)); this.last = ts;
        const cv = document.querySelector('#fxLayer canvas'), g = cv && cv.getContext('2d'); if (!g) { this.raf = 0; return; }
        g.clearRect(0, 0, cv.width, cv.height);
        const drag = Math.pow(0.12, dt); let n = 0;
        this.bins.forEach((b, c) => {
          g.fillStyle = this.COLORS[c];
          for (let i = b.length - 1; i >= 0; i--) {
            const p = b[i]; p.t += dt;
            if (p.t > p.life || p.y > cv.height + 20) { b[i] = b[b.length - 1]; b.pop(); continue; }
            p.vx *= drag; p.vy = p.vy * drag + this.G * dt; p.x += p.vx * dt; p.y += p.vy * dt;
            const w = Math.max(1, Math.round(p.s * Math.abs(Math.cos(p.w * p.t)))); // a flat square that spins
            g.globalAlpha = p.t > p.life - 0.3 ? (p.life - p.t) / 0.3 : 1;
            g.fillRect(Math.round(p.x), Math.round(p.y), w, p.s);
            n++;
          }
        });
        g.globalAlpha = 1; this.n = n;
        this.times.push(performance.now() - t0); if (this.times.length > 600) this.times.shift();
        if (n) this.raf = requestAnimationFrame((t) => this.frame(t)); else { this.raf = 0; cv.hidden = true; this.idle(); }
      },
      idle() { const L = document.getElementById('fxLayer'); if (L && !this.raf && !L.querySelector('.fx-pop')) L.hidden = true; }, // nothing left on the page
      stats() { const a = this.times.slice().sort((x, y) => x - y), k = a.length; return { frames: k, avg: k ? a.reduce((s, v) => s + v, 0) / k : 0, p95: k ? a[Math.max(0, Math.ceil(k * 0.95) - 1)] : 0, max: k ? a[k - 1] : 0 }; },
    },

    build() {
      this.hookActions();
      if (AMB.bus) {
        // a node opens: by a challenge = the unlock sequence on the map (garden-tree.js); by a discovery = chime + LCD
        AMB.bus.on('game:unlock', (d) => {
          const n = AMB.tree.byId[d.id]; if (!AMB.game.path || !n || !n.req.length) return;
          if (this.checkEnd()) return;
          // the opening's juice lands on its strong beat, with the opened layer's own note and plant (S5.9 FX.open);
          // « Ouvert : » agrees with every node name (Phrases, Grands réglages…)
          const b = this.beat(d.id);
          this.fx('open', { say: `✦ Ouvert : ${n.name}`, at: b.at, deg: b.deg, plant: this.layersOf(d.id)[0] });
          if (d.by) this.unlockSeq(d.id);
        });
        // S5.9: the other moments of the bus (a challenge or a Réponse won, a node ready, the Réponse's series, record and
        // tier) go through the juice table; a discovery (discoveries.js), the end and a first touch call fx() themselves
        for (const ev in this.FX_ON) AMB.bus.on(ev, (d) => { const m = this.FX_ON[ev](d || {}); if (m) this.fx(m[0], m[1]); });
        AMB.bus.on('game:puzzle', (e) => this.reponse(e));
        AMB.bus.on('panic', () => this.finaleEnd()); // ■ Stop also stops the replay of the finale (then the handover)
        AMB.bus.on('game:reset', () => { this.offer = null; }); // a new path: no song from the old one offered
        // S4.5w: what each layer plays while the song is being recorded (the finale lights the plants with it)
        AMB.bus.on('note', (n) => n && this.tape(n.layer, n.time, n.vel));
        AMB.bus.on('perc', (n) => n && this.tape('perc', n.time, n.vel));
        AMB.bus.on('grain', (n) => n && this.tape('grains', n.time, n.vel));
        AMB.bus.on('chord', (c) => { if (c) { this.tape('chord', c.time, 0.6, c.deg); this.tape('drone', c.time, 0.6); this.tape('pad', c.time, 0.3); } });
      }
      const task = $('#lcdTask');
      if (task) {
        task.querySelector('.lcd-skip').addEventListener('click', () => {
          const id = task.dataset.id; if (id === 'wav') { this.offer = null; return this.renderContracts(); }
          if (id && !id.startsWith('open:')) AMB.contracts.skip(id);
        });
        task.querySelector('.lcd-task-txt').addEventListener('click', () => {
          const id = task.dataset.id;
          if (id === 'wav') { if (this.offer) AMB.rec.download(this.offer, 'wav'); this.offer = null; AMB.ui.toast('Morceau téléchargé'); return this.renderContracts(); }
          if (id && id.startsWith('open:')) return this.ask(id.slice(5));
          task.classList.toggle('help'); this.renderContracts(); // (S4.6: the help stays until touched again)
        });
      }
      if (AMB.bus) {
        AMB.bus.on('game:contract', (d) => { this.renderContracts(d && d.id); if (!d || !d.id) this.checkEnd(); }); // ↷ on the last one
        AMB.bus.on('game:contracts', () => this.checkEnd());
        ['contracts', 'mode', 'reset', 'unlock'].forEach((ev) => AMB.bus.on('game:' + ev, () => { this.renderContracts(); this.renderScore(); }));
        AMB.bus.on('game:ready', () => this.renderContracts());
        ['mode', 'reset'].forEach((ev) => AMB.bus.on('game:' + ev, () => this.ask(null)));
      }
      if (AMB.contracts) AMB.contracts.refill();
      this.renderContracts(); this.renderScore();
      this.wireTree(); // map: hover / focus / touch selection, pan & zoom (garden-tree.js)
      const tb = $('#treeBtn'); if (tb) tb.addEventListener('click', () => this.showTree(true));
      const od = $('#openDlg');
      if (od) {
        od.addEventListener('click', (e) => {
          if (e.target === od || e.target.closest('[data-close]')) this.ask(null);
          else if (e.target.closest('.open-go')) this.openNode(od.dataset.id);
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !od.hidden) this.ask(null); });
      }
      const td = $('#treeDlg');
      if (td) td.addEventListener('click', (e) => { if (e.target === td || e.target.hasAttribute('data-close')) this.showTree(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && td && !td.hidden) this.showTree(false); });
      if (AMB.bus) ['unlock', 'ready', 'reset'].forEach((ev) => AMB.bus.on('game:' + ev, () => { if (td && !td.hidden && !this.seq) this.renderTree(); }));
      document.querySelectorAll('[data-choose]').forEach((b) => b.addEventListener('click', () => this.choose(b.dataset.choose)));
      const sw = $('#gameMode');
      if (sw) sw.addEventListener('click', () => this.choose(AMB.game.path ? 'free' : 'path'));
      this.renderSwitch();
      // first visit (also for people who used the app before the path existed): ask once.
      // Kiosk / test URLs (autoplay, listen) skip the question and stay in free mode.
      const q = new URLSearchParams(location.search);
      if (AMB.game.s.mode === null && !q.get('autoplay') && !q.get('listen')) this.welcome(true);
    },
  };

  if (mq && mq.addEventListener) mq.addEventListener('change', (e) => { garden.reduced = e.matches; });
  AMB.garden = garden;
  document.addEventListener('DOMContentLoaded', () => garden.build());
})();
