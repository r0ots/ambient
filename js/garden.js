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
      this.beats[id] = this.lastBeat; // several openings at once (a secret during a map sequence) keep their own beat
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
      this.chime('solve'); this.lcd('✦ L\'instrument est à toi', 6000);
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
        const r = e.res, node = r.open && AMB.tree.byId[AMB.contracts.byId[r.open].node];
        this.renderScore(r.ok && r.streak > 1);
        if (r.out) { AMB.ui.toast(`Pas cette fois, mais ${node ? node.name : 'la suite'} est prêt à ouvrir quand même.`); this.lcd('✦ Prêt quand même', 3000); }
        else if (r.open) return; // the ready chime and « ✦ Ouvrir » say it
        else if (r.tier) { this.cheer('tier'); this.lcd(`↑ Palier : ${r.tier}`, 4000); }
        else if (r.record) { this.cheer('record', r.best); this.lcd(`★ Record : série ${r.best} !`, 3500); }
        else if (r.ok && r.streak > 1) { this.cheer('streak', r.streak); this.lcd(`✓ Juste · série ${r.streak}`, 2500); }
        else if (r.ok) { this.chime('small'); this.lcd(`✓ Juste · prochaine : ${r.next}`, 2500); }
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
    // S5.3 juice (a series that grows, a record, a new tier): the LCD glitches, a short jingle lands on the next beat, the
    // Melody plant bounces and shines (a reflection only). Reduced motion: no glitch nor bounce (a steady flash, the jingle).
    cheer(kind, n = 0) {
      const lcd = $('#lcd'), cls = kind === 'streak' ? 'lcd-glitch' : 'lcd-glitch-big';
      if (lcd) {
        lcd.classList.remove('lcd-glitch', 'lcd-glitch-big'); void lcd.offsetWidth; lcd.classList.add(cls);
        clearTimeout(this._glT); this._glT = setTimeout(() => lcd.classList.remove(cls), kind === 'streak' ? 700 : 1400);
      }
      this.chime(kind, { at: this.strongBeat(0.08, undefined, undefined, 4), n });
      const GV = AMB.gardenVisual;
      if (GV && GV.kicks) { const t = GV.t || 0; GV.kicks.bells = { t0: t, last: t + (kind === 'streak' ? 0 : 0.6) }; GV.energy.bells = Math.max(GV.energy.bells || 0, kind === 'streak' ? 0.7 : 1); }
      return cls;
    },

    build() {
      this.hookActions();
      if (AMB.bus) {
        // a node opens: by a challenge = the unlock sequence on the map (garden-tree.js); by a secret = chime + LCD
        AMB.bus.on('game:unlock', (d) => {
          const n = AMB.tree.byId[d.id]; if (!AMB.game.path || !n || !n.req.length) return;
          if (this.checkEnd()) return;
          this.lcd(`✦ Ouvert : ${n.name}`); // « Ouvert : » agrees with every node name (Phrases, Grands réglages…)
          this.beat(d.id);
          if (d.by) this.unlockSeq(d.id); else this.chime('unlock', this.beatOf(d.id));
        });
        // S4.6: a challenge or a Réponse won: a sober celebration (chime, LCD), its node waits on « ✦ Ouvrir » (a secret
        // celebrates itself, secrets.js)
        AMB.bus.on('game:ready', (d) => {
          const c = d && d.by && AMB.contracts.byId[d.by]; if (!AMB.game.path || !c) return;
          this.chime('solve'); this.lcd(c.kind === 'reponse' ? '↺ ✓ Juste !' : '✓ Défi réussi', 3000);
        });
        AMB.bus.on('game:contracts', (d) => { // the last challenge opens no node: its own small chime
          const c = AMB.contracts.byId[d && d.id]; if (!AMB.game.path || !c || c.node) return;
          this.chime('small'); this.lcd('✓ Défi réussi', 2500);
        });
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
