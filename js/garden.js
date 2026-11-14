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
      // S6.6: stopped, the Parcours starts on « INSERT COIN » (the stage says it, no toast); already playing, the toast
      if (mode === 'free') AMB.ui.toast('◎ Mode libre : tout est ouvert');
      else if (!this.coinUp()) AMB.ui.toast(AMB.game.txt('🕹 Parcours : une seule note pour commencer. {Appuie sur une touche de couleur, une lettre de A à L ou ton clavier MIDI.|Appuie sur une touche de couleur.}'));
    },
    // ---- S6.6 « INSERT COIN »: in the Parcours, before the first sound, the stage is a blinking title screen (css
    // body.game:not(.playing):not(.coined) #coin); the first press — a finger on it or on a pad, a key, a MIDI note
    // (play.js firstNote) — starts the music. Once per page; free mode never sees it. ----
    coinUp() { const b = document.body; return !!(AMB.game && AMB.game.path && b && !b.classList.contains('playing') && !b.classList.contains('coined')); },
    coin() {
      if (!this.coinUp()) return false;
      document.body.classList.add('coined');
      this.coinFx();
      if (AMB.ui && AMB.ui.play) Promise.resolve(AMB.ui.play()).catch(() => {});
      return true;
    },
    // S7.3: the coin drops into the slot (gold sparks), then the screen lights up like a CRT (a line that opens out);
    // the title is already gone (the state changed), this only dresses the stage, click-through
    coinFx() {
      const M = AMB.motion, stage = $('.stage'); if (!M || !M.on() || !stage) return null;
      const f = document.createElement('div'); f.className = 'coin-fx'; f.setAttribute('aria-hidden', 'true');
      f.innerHTML = '<i class="cf-coin">¢</i><b class="cf-crt"></b>';
      stage.append(f);
      const land = M.ms('slow') * 0.9;
      setTimeout(() => { const c = f.querySelector('.cf-coin'); if (c && f.isConnected) M.burst(c, { n: 22, spread: Math.PI * 1.2, speed: 300, color: '#fff36b' }); }, land);
      setTimeout(() => f.remove(), M.ms('slow') * 2 + 120);
      return f;
    },
    coinWire() {
      const c = $('#coin'); if (!c) return;
      const say = () => { const s = c.querySelector('small'); if (s) s.textContent = AMB.game.txt('{une note : touche à l\'écran, A–L ou clavier MIDI|touche l\'écran ou une touche de couleur}'); };
      say(); if (AMB.bus) AMB.bus.on('game:mode', say);
      c.addEventListener('pointerdown', (e) => { e.preventDefault(); this.coin(); });
      c.addEventListener('click', () => this.coin()); // (keyboard: Enter on the focused button)
      window.addEventListener('keydown', (e) => {
        if (!this.coinUp() || e.repeat || e.metaKey || e.ctrlKey || e.altKey || this.modalUp() || /^(Shift|Tab|Escape|Meta|Control|Alt|CapsLock|Dead)$/.test(e.key)) return;
        const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
        if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } // (not also ui.js's play / stop toggle)
        this.coin(); // a note key goes on: play.js plays it
      }, true);
      // the music started another way (▶ Lecture of the bar): the title is gone for good
      if (typeof MutationObserver === 'function') new MutationObserver(() => { const b = document.body; if (b.classList.contains('playing') && !b.classList.contains('coined')) b.classList.add('coined'); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    },
    renderSwitch() {
      const b = $('#gameMode'); if (!b) return;
      b.textContent = AMB.game.path ? '◎ Passer en mode libre' : '🕹 Parcours (ouvrir pas à pas)';
    },
    // ---- the challenge on the 2nd line of the LCD (v1.06): one at a time, ↷ = the next one, a tap = how to do it ----
    // S4.6: a node won waits there first, « ✦ Ouvrir : <nœud> » (pulsing; « N prêts » when several wait): a tap tells what
    // it gives (ask), « Ouvrir » opens it (openNode). The next challenge comes once the queue is empty.
    renderContracts(flashId) {
      const box = $('#lcdTask'), line = $('#lcdLine'); if (!box || !AMB.contracts) return;
      const K = AMB.contracts, g = AMB.game, live = g.path && !this.handedOver();
      const ready = live ? g.s.ready || [] : [], nr = live && g.nextReady(), rn = nr && AMB.tree.byId[nr.id];
      const dm = live && !rn && AMB.demands ? AMB.demands.view() : null; // S5.5: an ask in progress takes the line
      const id = live && !rn ? K.state().active[0] : null, d = id && K.byId[id];
      const offer = !d && !rn && g.path && this.offer && this.handedOver(); // S4.5w: after the finale, the song is offered here
      box.hidden = !d && !offer && !rn && !dm; if (line) line.hidden = !!(d || offer || rn || dm);
      box.classList.toggle('ready', !!rn);
      box.classList.toggle('demand', !!dm); box.classList.toggle('hot', !!(dm && dm.hot));
      const tb = $('#treeBtn'); if (tb) tb.classList.toggle('has-ready', !!rn);
      const skip = box.querySelector('.lcd-skip'), skipTxt = offer ? 'Non merci' : 'Passer au défi suivant';
      if (skip) { skip.title = skipTxt; skip.setAttribute('aria-label', skipTxt); skip.hidden = !!(rn || dm); }
      if (dm) { // the ask and its countdown (« dans 2 mesures », 4, 3, 2, 1, « MAINTENANT ! »); a tap = how to do it
        if (box.dataset.id !== 'demand') box.classList.remove('help');
        box.dataset.id = 'demand';
        const t = box.querySelector('.lcd-task-txt'), help = box.classList.contains('help');
        const T = (x) => g.txt(x);
        t.textContent = help ? T(dm.hint) : `♪ ${T(dm.text)}`; t.title = help ? 'Toucher : revenir à la demande' : `${T(dm.hint)}\n(Toucher : comment faire)`;
        this.slam(box.querySelector('.lcd-task-n'), dm.n);
        return;
      }
      if (rn) {
        box.dataset.id = 'open:' + rn.id; box.classList.remove('help');
        const t = box.querySelector('.lcd-task-txt'); t.textContent = `✦ Ouvrir : ${rn.name}`; t.title = 'Toucher : voir ce qui s\'ouvre';
        this.rollN(box.querySelector('.lcd-task-n'), ready.length > 1 ? `${ready.length} prêtes` : '');
        return;
      }
      if (offer) {
        box.dataset.id = 'wav'; box.classList.remove('help');
        const t = box.querySelector('.lcd-task-txt'); t.textContent = '⤓ Garde ton morceau (WAV)'; t.title = 'Toucher : télécharger le morceau que tu viens d\'entendre';
        box.querySelector('.lcd-task-n').textContent = '';
        return;
      }
      if (!d) return;
      const was = box.dataset.id;
      if (was !== id) box.classList.remove('help');
      box.dataset.id = id;
      const n = K.progress(id), resp = d.kind === 'reponse', ask = d.kind === 'demande', help = box.classList.contains('help') && d.hint;
      const txt = box.querySelector('.lcd-task-txt');
      if (was && was !== id && AMB.motion) AMB.motion.pop(txt, 'type'); // S7.3: a new challenge is typed in
      txt.textContent = g.txt(help ? d.hint : resp ? `↺ Réponse : ${d.title}` : `◇ ${d.title}`);
      txt.title = help ? 'Toucher : revenir au défi' : `${g.txt(d.hint)}\n(Toucher : comment faire)`;
      // S5.5 a challenge asked in the music: it comes with the playback
      this.rollN(box.querySelector('.lcd-task-n'), resp ? `${AMB.puzzles.need(d)} ♪` : ask ? (AMB.seq && AMB.seq.playing ? '♪ bientôt' : '▶ lecture') : d.goal > 1 ? `${n}/${d.goal}` : n ? '✓' : '·');
      if (flashId === id) { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
    },
    // S7.3: the LCD's counter — a count rolls in (motion.roll), the countdown of an ask slams in (« MAINTENANT ! » harder)
    rollN(el, v) { if (!el) return; if (AMB.motion) AMB.motion.roll(el, v); else el.textContent = v; },
    slam(el, v) {
      if (!el || el.textContent === String(v)) return;
      const was = el.textContent; el.textContent = v;
      const M = AMB.motion; if (!was || !M) return;
      M.pop(el, /MAINTENANT/.test(v) ? 'm-slam-now' : 'm-slam', { ms: M.ms('slow') + 60 });
    },
    // clicks that always succeed go on the bus as actions (contracts count them); actions that can fail or be
    // cancelled (save, journal, chords, freeze) are emitted by their own code once they really happened
    CLICKS: [['#dice', 'dice'], ['.sc-store', 'sceneStore']],
    // S6.7 → S8.3: in the Parcours the LCD never leaves the window: the bar floats fixed over the city (css « S8.3 »), the
    // panels scroll inside their drawer, so the LCD stays in view (the old pin-on-scroll is gone; demands.seen still checks)
    hookActions() {
      const emit = (id) => AMB.bus.emit('act', id);
      document.addEventListener('click', (e) => {
        if (!AMB.game.path) return;
        const t = e.target.closest && e.target.closest('button, label'); if (!t) return;
        if (t.matches('.sc-slot')) return emit(e.shiftKey ? 'sceneStore' : 'sceneRecall');
        for (const [sel, id] of this.CLICKS) if (t.matches(sel)) return emit(id);
      }, true);
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
      const at = run ? (this.batch ? this.strongBeat(0.08, undefined, undefined, this.batch) : this.strongBeat(0.45)) : null, now = run ? ctx.currentTime : 0;
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
    lcd(text, ms = 3500, stamp = false) { AMB.lcdMsg = { text, until: Date.now() + ms, stamp }; }, // S7.3 stamp: PARFAIT / BIEN / RATÉ land like a rubber stamp
    // ---- S4.6: opening is the player's move. The card says in plain words what the node gives (tree.EXPLAIN), then
    // « Ouvrir » plays the opening (chime on the beat, the layer comes in, the plant grows, the map's sequence for a
    // challenge) and what it opens comes in animated (tree.appear). Nothing goes away on a timer before that. ----
    ask(id) {
      const dlg = $('#openDlg'); if (!dlg) return false;
      const g = AMB.game, n = id && AMB.tree.byId[id];
      if (!n || !g.path || !g.canOpen(id)) { if (!dlg.hidden) this.suck(dlg.querySelector('.open-card'), id === null && this._suckTo); this._suckTo = null; dlg.hidden = true; dlg.dataset.id = ''; return false; }
      const more = (g.s.ready || []).length - 1;
      dlg.dataset.id = id;
      dlg.querySelector('.modal-card').style.setProperty('--c', AMB.tree.BRANCHES[n.branch].color);
      dlg.querySelector('.open-name').textContent = n.name;
      dlg.querySelector('.open-why').textContent = g.txt(n.why);
      // S5.7: a long queue (a placement: up to 21) — its next names, and « ✦ Tout ouvrir (n) » past OPEN_ALL
      const next = (g.s.ready || []).map((r) => r.id).filter((x) => x !== id).map((x) => AMB.tree.byId[x]).filter(Boolean).map((x) => x.name);
      dlg.querySelector('.open-more').textContent = more > 0 ? `Ensuite : ${next.slice(0, 3).join(', ')}${more > 3 ? ` et ${more - 3} autre${more > 4 ? 's' : ''}` : ''}.` : '';
      const all = dlg.querySelector('.open-all');
      if (all) { all.hidden = more + 1 <= this.OPEN_ALL; all.textContent = `✦ Tout ouvrir (${more + 1})`; }
      dlg.hidden = false;
      const go = dlg.querySelector('.open-go'); if (go) go.focus({ preventScroll: true });
      return true;
    },
    // S7.3: a card that goes is sucked away (a ghost of it, under the windows: the Arbre opening next covers it), towards
    // the ✦ on the LCD (« Plus tard ») or the Arbre's button (« Ouvrir »)
    suck(card, to) {
      const M = AMB.motion; if (!M || !M.on() || !card) return null;
      const r = card.getBoundingClientRect(); if (!r.width) return null;
      const g = card.cloneNode(true); g.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
      g.setAttribute('aria-hidden', 'true'); g.inert = true; g.classList.add('m-ghost');
      Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      document.body.append(g);
      const t = (to || $('#lcdTask:not([hidden]) .lcd-task-txt') || $('#treeBtn'));
      const tr = t && t.getBoundingClientRect(), ok = tr && tr.width;
      const dx = ok ? tr.left + tr.width / 2 - (r.left + r.width / 2) : 0, dy = ok ? tr.top + tr.height / 2 - (r.top + r.height / 2) : -r.bottom;
      const an = g.animate([{ translate: '0 0', scale: '1 1', opacity: 1 }, { translate: `${-dx * 0.05}px ${-dy * 0.05}px`, scale: '1.1 .82', opacity: 1, filter: 'brightness(1.6)', offset: 0.3 },
        { translate: `${dx}px ${dy}px`, scale: '.04 .02', opacity: 0.3, filter: 'brightness(2)' }], { duration: M.ms('slow'), easing: M.EASE.in, fill: 'forwards' });
      an.onfinish = an.oncancel = () => g.remove();
      return an;
    },
    openNode(id) {
      const g = AMB.game, T = AMB.tree;
      this._suckTo = $('#treeBtn');
      this.ask(null);
      if (!id || !g.canOpen(id)) return false;
      T.hold(); // what it opens waits for the end of the map's sequence (seqFinish), or comes in now
      const ok = g.open(id);
      if (ok && this.seq && this.seq.id === id) this.seq.held = true;
      else { T.release(); if (ok && !this.batch) this.reveal(id); }
      return ok;
    },
    // S5.7 « ✦ Tout ouvrir (n) » (the card, when more than OPEN_ALL wait): every node of the queue opens in turn, one per
    // beat (one per eighth past 8 nodes), each with its own juice on its beat; no map, no scrolling between two (the LCD
    // stays in sight). Stopped: one every 0.3 s. Returns how many will open.
    OPEN_ALL: 3,
    batch: 0, // the grid unit (16ths) of the openings in progress, 0 = none
    openAll() {
      const g = AMB.game, n = (g.s.ready || []).length; this.ask(null);
      if (!g.path || !n || this.batch) return 0;
      const unit = n > 8 ? 2 : 4;
      this.batch = unit;
      const next = () => {
        const r = g.path && g.nextReady();
        if (!r || !this.batch) { this.batch = 0; this.renderContracts(); return; }
        this.openNode(r.id);
        const M = AMB.motion, tb = $('#treeBtn'); // S7.3: each opening of the cascade pops the Arbre's button, sparks
        if (M && tb) { M.pop(tb, 'pop'); M.burst(tb, { n: 14, spread: Math.PI * 2, color: r && AMB.tree.byId[r.id] ? AMB.tree.BRANCHES[AMB.tree.byId[r.id].branch].color : null }); }
        const S = AMB.seq, ms = S && S.playing ? S.stepDur() * unit * 1000 : 300;
        this._allT = setTimeout(next, ms);
      };
      next();
      return n;
    },
    // ---- the instrument handed over (G6.3, S3.7) ----
    complete() { const T = AMB.tree; return T.NODES.every((n) => AMB.game.has(n.id)); },
    // whole tree owned: no game interface any more (challenge line), the tree stays to look at; saved (game.s.ended)
    handing: false, // the moment itself (chime, LCD message) before the game interface goes
    handedOver() { return !!AMB.game.s.ended && !this.handing; },
    // the path's last challenge (« Enregistre ton morceau ») closes it: with the whole tree owned, it comes first, and
    // the instrument is handed over once it is done or passed (↷)
    FINALE: 'c.morceau',
    END_MS: 900, HAND_MS: 2000, // the tree closes, then the handover; the challenge line goes HAND_MS later (tests shorten them)
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
      setTimeout(() => { this.showTree(false); if (this.song) this.finale(); else this.handOver(); }, this.END_MS);
      return true;
    },
    handOver() {
      this.fx('end', { say: '✦ L\'instrument est à toi', ms: 6000 });
      setTimeout(() => { this.handing = false; this.renderContracts(); }, this.HAND_MS);
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
        const say = (e.again ? '↺ Encore : ' : '') + (e.tr ? '↺ Une quinte plus haut !' : e.chord ? (e.len > 1 ? '↺ À toi : les accords' : '↺ À toi : l\'accord') : '↺ À TOI !');
        clearTimeout(this._toiT); this.renderScore();
        if (ms > 300) this.lcd(e.again ? '↺ Réécoute…' : '↺ Écoute…', ms); // S6.7: the phrase first (the pads light up with it)
        // S6.7: « À toi » stays as long as the answer is awaited (at least puzzles.START s), not 2.5 s
        const left = () => (P.cur && ctx ? Math.max(0, P.cur.until - ctx.currentTime) : P.START) * 1000;
        this._toiT = setTimeout(() => { if (P.cur === c && c) { this._toi = say; this.lcd(say, left()); } }, ms);
      } else if (e.phase === 'note' && this._toi && P.cur) { // the window moves with the answer (timed: its bar; untimed: a slow child)
        const ctx = AMB.engine && AMB.engine.ctx; if (ctx) this.lcd(this._toi, Math.max(0, P.cur.until - ctx.currentTime) * 1000);
      } else if (e.phase === 'end') {
        clearTimeout(this._toiT);
        if (this._toi && AMB.lcdMsg && AMB.lcdMsg.text === this._toi) AMB.lcdMsg = null; // (left alone: « À toi » goes)
        this._toi = null;
        const r = e.res; if (!r) return;
        this.renderScore(r.ok && r.streak > 1);
        if (r.open || r.tier || r.tier || r.record || r.ok && r.streak > 1) return; // the juice table (FX: resp:*, game:ready) says it
        else if (r.ok) this.lcd(`✓ Juste · prochaine : ${r.next}`, 2500); // (its small juice: resp:streak → FX.juste)
        // S6.7: a wrong answer is SEEN: « RATÉ » (the juice table), and the phrase comes once more
        else this.fx('rate', { say: r.replay ? '✗ RATÉ ! Réécoute…' : `✗ RATÉ · ${r.left != null ? `encore ${r.left} essai${r.left > 1 ? 's' : ''}` : r.name}`, ms: 3000 });
      }
    },
    // S5.3 the score of the Réponse on the LCD (path only, once a phrase came): tier reached, series, record
    renderScore(bump) {
      const el = $('#lcdScore'), P = AMB.puzzles; if (!el || !P) return;
      const v = AMB.game.path && !this.handedOver() ? P.score() : null;
      el.hidden = !v || !v.best; if (el.hidden) return; // S5.7: not before a first series (« RECORD 0 » said nothing)
      el.textContent = `↺ ${v.name.toUpperCase()} · SÉRIE ${v.streak} · RECORD ${v.best}`;
      el.title = `Réponse : niveau ${v.name}, ${v.streak} réussie${v.streak > 1 ? 's' : ''} d'affilée, record ${v.best}`;
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
    //   layers of the Jardin that flare up: gardenVisual.flare, same JUICE). S9.1: the pop is one short word (PARFAIT,
    //   RATÉ, COMBO…), written plainly; the comic onomatopoeias (POW!, BZZT!…) and their bubbles are gone.
    // Moments fired in the same tick merge: the biggest (rank) plays alone (a gate answered = a challenge won, not also a
    // series). Reduced motion: a soft flash only (plus the jingle and the LCD message). S5.10 (combos, discoveries) reuses
    // it: fx('discovery', {name}).
    FX: {
      first: { rank: 1, confetti: 16, from: 'el', hop: 'el', jingle: 'pop', pop: 'NOUVEAU', kick: ['fireflies'] }, // a new control touched the 1st time
      juste: { rank: 2, confetti: 12, from: '#lcd', hop: '#lcdScore', jingle: 'small', pop: 'JUSTE', kick: ['fireflies'] }, // a right answer (series of 1)
      ready: { rank: 2, confetti: 24, from: '#treeBtn', hop: '#treeBtn', jingle: 'ready', pop: 'PRÊT', kick: ['fireflies', 'twinkle'] }, // a node waits on « ✦ Ouvrir »
      consolation: { rank: 2, confetti: 10, from: '#treeBtn', hop: '#treeBtn', jingle: 'small', kick: ['fireflies'] }, // a gate missed 6 times: « prêt quand même », no party
      streak: { rank: 3, flash: 0.25, confetti: 40, shake: 1, lcd: 'glitch', jingle: 'streak', pop: (o) => `SÉRIE ×${o.n}`, splash: 'streak', kick: ['twinkle', 'ripple'], say: (o) => `✓ Juste · série ${o.n}` },
      defi: { city: 'stars', rank: 4, flash: 0.5, confetti: 140, shake: 1, lcd: 'arcade', bounce: 1, punch: 1, jingle: 'defi', pop: 'RÉUSSI', kick: ['rays', 'twinkle', 'ripple'] },
      record: { city: 'stars', rank: 5, flash: 0.55, confetti: 160, shake: 2, lcd: 'glitch-big', bounce: 1, punch: 1, jingle: 'record', pop: (o) => `RECORD ×${o.n}`, splash: 'record', kick: ['aurora', 'twinkle', 'song'], say: (o) => `★ Record : série ${o.n} !` },
      tier: { city: 'stars', rank: 6, flash: 0.65, confetti: 220, shake: 2, lcd: 'glitch-big', bounce: 1, punch: 1.5, jingle: 'tier', pop: (o) => String(o.name || 'niveau').toUpperCase(), splash: 'tier', kick: ['aurora', 'rays', 'song', 'ripple'], say: (o) => `↑ Niveau : ${o.name}` },
      open: { city: 'stars', rank: 7, flash: 0.75, confetti: 260, shake: 2, lcd: 'arcade', bounce: 1, punch: 1.5, jingle: 'unlock', pop: 'OUVERT', splash: 'tier', kick: ['rays', 'aurora', 'ripple', 'hue'] },
      end: { city: 'stars', rank: 8, flash: 1, confetti: 380, shake: 2, lcd: 'arcade', bounce: 1, punch: 2, jingle: 'end', pop: 'À TOI', beats: 3, kick: ['aurora', 'rays', 'twinkle', 'fireflies', 'song', 'hue'] },
      placement: { city: 'stars', rank: 10, flash: 1, confetti: 480, shake: 2, lcd: 'glitch-big', bounce: 1, punch: 2, jingle: 'discovery', pop: (o) => String(o.name || 'musicien').toUpperCase(), hop: '#treeBtn', splash: 'tier', beats: 4, kick: ['aurora', 'rays', 'twinkle', 'fireflies', 'song', 'ripple', 'hue'], say: (o) => `⚡ ${o.name || 'Musicien'} détecté` }, // S5.4 a Réponse placement (the queue « n prêts » is on the LCD's 2nd line)
      // S5.5 the live asks (js/demands.js), judged on the time; n = the combo of successes in a row
      parfait: { city: 'salvo', rank: 4, stamp: 1, flash: 0.5, confetti: 130, shake: 1, lcd: 'arcade', bounce: 1, punch: 1, jingle: 'streak', pop: (o) => o.n > 1 ? `PARFAIT ×${o.n}` : 'PARFAIT', splash: 'streak', kick: ['rays', 'twinkle', 'ripple'],
        say: (o) => `★ Parfait !${o.n > 1 ? ' ×' + o.n : ''}${o.node ? ' · ✦ ' + o.node : ''}` },
      bien: { rank: 3, stamp: 1, flash: 0.25, confetti: 50, shake: 1, lcd: 'glitch', jingle: 'streak', pop: (o) => o.n > 1 ? `BIEN ×${o.n}` : 'BIEN', kick: ['twinkle'],
        say: (o) => `✓ Bien !${o.n > 1 ? ' ×' + o.n : ''}${o.node ? ' · ✦ ' + o.node : ''}` },
      rate: { city: 'blackout', rank: 1, stamp: 1, lcd: 'glitch', pop: 'RATÉ', say: (o) => `✗ Raté${o.why ? ' · ' + o.why : ''} : la musique continue` },
      // S8.7 the huge combos (js/city-combos.js), the instrument's: they play in free mode too (`free`), silent (no
      // jingle: the music is the player's), never a flash (the city flashes itself, × JUICE). A combo's first SUPER is a
      // discovery: the `discovery` recipe, its word « SUPER » (o.boom)
      combo: { free: 1, rank: 3, confetti: 30, pop: (o) => `COMBO ×${o.n || 2}`, say: (o) => `⚡ Combo ×${o.n || 2}${o.name ? ' · ' + o.name : ''} : garde les réglages là !` },
      super: { free: 1, city: 'stars', rank: 8, confetti: 300, shake: 2, bounce: 1, punch: 2, beats: 3, pop: (o) => `SUPER · ${String(o.name || 'combo').toUpperCase()}`, say: (o) => `⚡ SUPER ! ${o.name || ''}` },
      discovery: { city: 'stars', rank: 9, flash: 1, confetti: 480, shake: 2, lcd: 'glitch-big', bounce: 1, punch: 2, jingle: 'discovery', pop: (o) => o.boom || 'DÉCOUVERTE', splash: 'tier', beats: 4, kick: ['aurora', 'rays', 'twinkle', 'fireflies', 'song', 'ripple', 'hue'], say: (o) => `✦ Découverte${o.name ? ' : ' + o.name : ' !'}` },
    },
    // the bus events that are moments (the others call fx() where they happen: an opening, a discovery, the end, a first touch)
    FX_ON: {
      'game:ready': (d) => {
        const c = d.by && AMB.contracts.byId[d.by], n = AMB.tree.byId[d.id];
        if (c && c.kind === 'demande') return null; // S5.5: the ask's own PARFAIT / BIEN already said it
        if (c && AMB.puzzles && AMB.puzzles.outGate === c.id) return ['consolation', { say: '✦ Prêt quand même', ms: 3000, toast: `Pas cette fois, mais ${n ? n.name : 'la suite'} est prêt à ouvrir quand même.` }];
        return c ? ['defi', { say: c.kind === 'reponse' ? '↺ ✓ Juste !' : '✓ Défi réussi' }] : ['ready'];
      },
      'game:contracts': (d) => { const c = AMB.contracts.byId[d.id]; return c && !c.node ? ['defi', { say: '✓ Défi réussi', ms: 2500 }] : null; }, // the last one
      'resp:streak': (d) => [d.streak > 1 ? 'streak' : 'juste', { n: d.streak }],
      'resp:record': (d) => ['record', { n: d.best }],
      'resp:tier': (d) => ['tier', { name: d.name }],
      'resp:place': (d) => ['placement', { name: d.name, n: (d.nodes || []).length, ms: 6000, toast: (d.nodes || []).length ? `Tu joues déjà bien : ${d.nodes.length} pièce${d.nodes.length > 1 ? 's' : ''} prête${d.nodes.length > 1 ? 's' : ''} → touche ✦ Ouvrir sur l'écran du haut` : '' }],
    },
    juice() { const GV = AMB.gardenVisual; return GV && GV.JUICE != null ? GV.JUICE : 1; },
    // a moment: its message at once (LCD, toast), its effects on the next beat. Returns the queued {kind, o} or null.
    fx(kind, o = {}) {
      const R = this.FX[kind]; if (!R || !AMB.game || !(AMB.game.path || R.free)) return null;
      const say = !AMB.game.path ? null : o.say || (typeof R.say === 'function' ? R.say(o) : R.say); // (free mode: the LCD stays the sound's)
      if (say) this.lcd(say, o.ms || 3500, !!R.stamp);
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
      const R = this.FX[kind]; if (!R || !(AMB.game.path || R.free)) return null;
      const ctx = AMB.engine && AMB.engine.ctx, run = !!(ctx && ctx.state === 'running');
      const at = o.at != null ? o.at : run ? this.strongBeat(0.08, undefined, undefined, 4) : null;
      const delay = at != null && run ? Math.max(0, (at - ctx.currentTime + (ctx.outputLatency || 0)) * 1000) : 0;
      const red = this.reduced, J = this.juice(), GV = AMB.gardenVisual;
      const did = R.flash ? ['flash'] : [];
      if (R.jingle) { this.chime(R.jingle, { at, n: o.n || 0, deg: o.deg || 0 }); did.push('jingle'); }
      if (R.splash && GV) { GV.cheer(R.splash, at, o.plant); did.push('splash'); }
      if (!red) for (const k of ['confetti', 'shake', 'lcd', 'bounce', 'hop', 'punch', 'pop', 'kick']) if (R[k]) did.push(k);
      const beatMs = AMB.seq && AMB.seq.playing ? AMB.seq.stepDur() * 4000 : 380;
      let waits = 0;
      const fire = () => {
        if (!AMB.game.path && !R.free) return;
        // S5.7: never over a window (Arbre, carnet, carte) — the party comes on the instrument once it closes, 6 s at most
        if (this.modalUp()) { if (++waits < 40) setTimeout(fire, 150); return; }
        const stage = $('.stage');
        if (R.flash) this.fxFlash(stage, red ? 0.22 : Math.min(1, R.flash * J), red);
        if (R.city && AMB.cityMusic) AMB.cityMusic.fx(R.city); // S8.5 the city's light: salvo of lasers, power cut, shooting stars
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
    applyTouch() { document.body.classList.toggle('touch', AMB.game.touch()); this.renderContracts(); },
    modalUp() { return [...document.querySelectorAll('.modal')].some((m) => !m.hidden); },
    // S7.1: one mechanism for one-shot classes (js/motion.js pop); the recipe already decided (reduced motion, JUICE)
    fxClass(el, cls, ms) {
      if (!el) return;
      return AMB.motion.pop(el, cls, { ms, force: true });
    },
    fxFlash(stage, a, soft) {
      if (!stage) return;
      let f = stage.querySelector(':scope > .fx-flash');
      if (!f) { f = document.createElement('div'); f.className = 'fx-flash'; f.setAttribute('aria-hidden', 'true'); stage.append(f); }
      f.style.setProperty('--a', a.toFixed(2)); f.classList.toggle('soft', !!soft);
      this.fxClass(f, 'on', soft ? 950 : 600);
    },
    // the pop text: one short word, plainly (S9.1); S6.7: two never overlap — while one is up, a bigger (or equal)
    // moment replaces it, a smaller one is dropped; never over the LCD (it stays readable during an ask)
    fxPop(text, stage, rank) {
      const cur = this._pop, now = Date.now();
      if (cur && cur.el.isConnected) { if (now < cur.until && rank < cur.rank) return null; cur.el.remove(); }
      const L = this.confetti.layer(), r = stage ? stage.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
      const p = document.createElement('div'); p.className = 'fx-pop';
      const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height * 0.42);
      p.textContent = text; p.style.fontSize = `min(${24 + rank * 5}px, 10vw)`;
      p.style.left = x + 'px'; p.style.top = y + 'px';
      L.hidden = false; L.append(p);
      const lcd = document.getElementById('lcd'), lr = lcd && lcd.getBoundingClientRect(), half = p.offsetHeight * 0.75;
      if (lr && lr.height && y - half < lr.bottom + 6) p.style.top = Math.round(lr.bottom + 6 + half) + 'px'; // under the LCD, never over it
      const ms = rank >= 7 ? 1800 : 1300;
      this._pop = { el: p, rank, until: now + ms };
      setTimeout(() => { p.remove(); this.confetti.idle(); }, ms);
      return p;
    },
    // pixel confetti on one fixed, click-through canvas over the whole page; S7.1: the app's ONE particle emitter now
    // lives in js/motion.js (the controls' sparks share it): the same object
    confetti: AMB.motion.particles,

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
          if (d.by && !this.batch) this.unlockSeq(d.id); // (« Tout ouvrir »: no map between two openings)
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
      // S5.6: a window that opens clears the confetti of an earlier party (a party fired after it still plays above)
      if (typeof MutationObserver === 'function') {
        const mo = new MutationObserver((ms) => { if (ms.some((m) => !m.target.hidden)) this.confetti.clear(); });
        document.querySelectorAll('.modal').forEach((m) => mo.observe(m, { attributes: true, attributeFilter: ['hidden'] }));
      }
      this.coinWire(); this.hiscores.build();
      // S5.7: a touch screen in the path: no MIDI button, no keyboard words (css body.game.touch, game.txt)
      this.applyTouch(); if (window.matchMedia) { const q = matchMedia('(pointer: coarse)'); if (q.addEventListener) q.addEventListener('change', () => this.applyTouch()); }
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
          else if (e.target.closest('.open-all')) this.openAll();
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

  // ---- S6.6 HIGH SCORES of the Réponse (its series: the same score as the LCD's « SÉRIE · RECORD », no second one) ----
  // Top 5 kept in localStorage (<game key>.hiscores, try/catch), shown in the Arbre like an arcade cabinet. A series that
  // enters the top 5 (≥ MIN) waits to be signed (★ on the Arbre button); in the Arbre, three initials arcade-style:
  // letters typed (↑ ↓ ← →, ⌫, Entrée), ▲ ▼ and OK under a finger, or MIDI notes = their name (C D E F G A B).
  // The series goes on growing after it is signed: its line follows.
  const HS = {
    MAX: 5, MIN: 3, LETTERS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', NOTE: 'CCDDEFFGGAAB',
    d: null, run: null, ent: null, // d = {list: [{n, s, t, run}], last}; run = {id, s}; ent = {l: [3 letters], cur}
    key() { return ((AMB.game && AMB.game.key) || 'ambient.game.v1') + '.hiscores'; },
    load() {
      if (this.d) return this.d;
      let d = null; try { d = JSON.parse(localStorage.getItem(this.key()) || 'null'); } catch (e) { d = null; }
      return (this.d = d && Array.isArray(d.list) ? d : { list: [], last: 'AAA', pend: null });
    },
    save() { try { localStorage.setItem(this.key(), JSON.stringify(this.d)); } catch (e) {} },
    list() { return this.load().list; },
    qualifies(s) { const L = this.list(); return s >= this.MIN && (L.length < this.MAX || s > L[L.length - 1].s); },
    sort(L) { L.sort((a, b) => b.s - a.s || a.t - b.t); L.length = Math.min(L.length, this.MAX); },
    // a right answer of the Réponse (resp:streak): the series' line follows, or it may enter the table
    onStreak(n) {
      if (!AMB.game || !AMB.game.path) return;
      const d = this.load();
      if (n === 1 || !this.run) this.run = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), s: 0 };
      this.run.s = n;
      const mine = d.list.find((e) => e.run === this.run.id);
      if (mine) { mine.s = Math.max(mine.s, n); this.sort(d.list); this.save(); return this.render(); }
      if (!this.qualifies(n)) return;
      const first = !d.pend || d.pend.run !== this.run.id;
      d.pend = { run: this.run.id, s: n }; this.save();
      if (first && AMB.ui && AMB.ui.toast) AMB.ui.toast('★ HIGH SCORE ! Signe tes 3 initiales dans l\'Arbre');
      this.render();
    },
    pend() { const p = this.load().pend; return p && this.qualifies(p.s) ? p : null; },
    // the entry (Arbre open, a series waiting): letter i of 3, ▲ ▼, a typed letter or a MIDI note
    entry() { const p = this.pend(), td = $('#treeDlg'); return p && td && !td.hidden ? (this.ent || (this.ent = { l: (this.load().last || 'AAA').split('').slice(0, 3), cur: 0 })) : null; },
    put(ch) { const e = this.entry(); if (!e) return false; const i = e.cur; e.l[i] = ch; if (e.cur < 2) { e.cur++; this.render(); this.drum(i, 1); } else this.sign(); return true; },
    spin(i, k) { const e = this.entry(); if (!e) return; const L = this.LETTERS; e.cur = i; e.l[i] = L[(L.indexOf(e.l[i]) + k + L.length) % L.length]; this.render(); this.drum(i, k); },
    // S7.3: a letter of the initials rolls in like a drum (▲ from below, ▼ from above), with a few sparks
    drum(i, k) {
      const M = AMB.motion, l = this.box && this.box.querySelector(`.hs-slot[data-i="${i}"] .hs-l`); if (!M || !M.on() || !l || !l.animate) return;
      const a = Math.min(1.5, M.amp());
      l.animate([{ translate: `0 ${0.8 * k * a}em`, scale: '1 .4', opacity: 0.1 }, { translate: `0 ${-0.12 * k * a}em`, scale: '1 1.15', opacity: 1, offset: 0.6 }, { translate: '0 0', scale: '1 1' }],
        { duration: M.ms('med'), easing: M.EASE.out });
      M.burst(l, { n: 5, angle: k > 0 ? -Math.PI / 2 : Math.PI / 2, spread: 1.2, speed: 180, color: '#fff36b' });
    },
    sign() {
      const d = this.load(), p = this.pend(), e = this.ent; if (!p || !e) return null;
      const n = e.l.join(''), row = { n, s: p.s, t: Date.now(), run: p.run };
      d.list.push(row); this.sort(d.list); d.last = n; d.pend = null; this.ent = null; this.save(); this.fresh = row.run; // (its line flashes in)
      if (garden.lcd) garden.lcd(`★ ${n} · SÉRIE ${p.s} · HIGH SCORE`, 3000);
      this.render(); return row;
    },
    onKey(e) {
      if (!this.entry() || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      const k = e.key, ent = this.ent;
      if (/^[a-z]$/i.test(k)) this.put(k.toUpperCase());
      else if (k === 'Backspace' || k === 'ArrowLeft') { ent.cur = Math.max(0, ent.cur - 1); this.render(); }
      else if (k === 'ArrowRight') { ent.cur = Math.min(2, ent.cur + 1); this.render(); }
      else if (k === 'ArrowUp' || k === 'ArrowDown') this.spin(ent.cur, k === 'ArrowUp' ? 1 : -1);
      else if (k === 'Enter') this.sign();
      else return;
      e.preventDefault(); e.stopPropagation(); // (no note played, the map does not move)
    },
    render() {
      const box = this.box; if (!box) return;
      const g = AMB.game, L = this.list(), p = this.pend(), ent = this.entry();
      box.hidden = !g || !g.path || (!L.length && !p);
      const tb = $('#treeBtn'); if (tb) tb.classList.toggle('has-hs', !!(g && g.path && p));
      const td = $('#treeDlg'), was = this.shown;
      this.shown = !box.hidden && !box.classList.contains('min') && !!td && !td.hidden;
      if (box.hidden) return;
      if (ent) box.classList.remove('min');
      const head = box.querySelector('.hs-title'), top = L[0];
      head.textContent = `★ HIGH SCORES · RÉPONSE${top ? ` · ${top.n} ×${top.s}` : ''}`; head.setAttribute('aria-expanded', String(!box.classList.contains('min')));
      const rows = L.map((r) => ({ n: r.n, s: r.s, me: !!(this.run && r.run === this.run.id) }));
      if (p) rows.push({ n: ent ? ent.l.map((c, i) => (i <= ent.cur ? c : '_')).join('') : '???', s: p.s, me: true, pend: true });
      rows.sort((a, b) => b.s - a.s || (a.pend ? 1 : 0) - (b.pend ? 1 : 0));
      const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH'], ol = box.querySelector('.hs-list'); ol.innerHTML = '';
      for (let i = 0; i < this.MAX; i++) {
        const r = rows[i], li = document.createElement('li'); if (r && r.me) li.className = 'me';
        if (r && r.pend) li.classList.add('pend'); // S7.3: the line being signed blinks like a cabinet
        if (r && this.fresh && L.some((x) => x.run === this.fresh && x.n === r.n && x.s === r.s)) li.classList.add('hs-new');
        [ORD[i], r ? r.n : '---', r ? `×${r.s}` : '×0', r ? 'série' : ''].forEach((x, j) => { const s = document.createElement('span'); s.textContent = x; if (j === 2) s.className = 'hs-s'; if (j === 3) s.className = 'hs-t'; li.append(s); });
        ol.append(li);
      }
      const M = AMB.motion;
      this.shown = !box.classList.contains('min') && !!td && !td.hidden;
      // S7.3: the table comes up line by line like an arcade cabinet's attract screen (when it shows), a new score flashes in
      if (M && this.shown && !was) M.stagger(ol.children, { y: 22, dur: 'slow' });
      const nw = ol.querySelector('.hs-new');
      if (nw && M) { this.fresh = null; M.pop(nw, 'hs-new', { ms: M.ms('slow') * 3 }); M.burst(nw, { n: 18, spread: Math.PI * 2, color: '#ff3fa4' }); }
      const en = box.querySelector('.hs-entry'); en.hidden = !ent;
      if (!ent) return;
      en.querySelector('.hs-say').textContent = `★ NOUVEAU HIGH SCORE ×${p.s} ! TES INITIALES :`;
      en.querySelectorAll('.hs-slot').forEach((s, i) => { s.classList.toggle('cur', i === ent.cur); s.querySelector('.hs-l').textContent = ent.l[i]; });
      en.querySelector('.hs-help').textContent = g.txt('{Tape 3 lettres (↑ ↓ pour défiler, Entrée = OK) ou joue 3 notes au clavier MIDI : leur nom s\'écrit (do = C, ré = D…)|Touche ▲ ▼ pour choisir chaque lettre, puis OK}');
    },
    build() {
      if (this.box || !document.body) return;
      const box = (this.box = document.createElement('section'));
      box.id = 'hiscores'; box.className = 'hiscores'; box.hidden = true; box.setAttribute('aria-label', 'Meilleurs scores de la Réponse');
      const slot = (i) => `<div class="hs-slot" data-i="${i}"><button type="button" data-k="1" aria-label="Lettre ${i + 1} : suivante">▲</button><button type="button" class="hs-l" aria-label="Lettre ${i + 1}"></button><button type="button" data-k="-1" aria-label="Lettre ${i + 1} : précédente">▼</button></div>`;
      box.innerHTML = `<button type="button" class="hs-title" aria-controls="hsBody"></button><div id="hsBody" class="hs-body"><ol class="hs-list"></ol><div class="hs-entry" hidden><span class="hs-say"></span><div class="hs-slots">${slot(0)}${slot(1)}${slot(2)}</div><button type="button" class="btn hs-ok">OK</button><p class="hs-help"></p></div></div>`;
      box.classList.add('min'); // folded like the notebook of discoveries (the map keeps its room); open while signing
      box.addEventListener('click', (e) => {
        const b = e.target.closest('button'), s = b && b.closest('.hs-slot');
        if (b && b.classList.contains('hs-title')) { box.classList.toggle('min'); return this.render(); }
        if (!b || !this.entry()) return;
        if (b.classList.contains('hs-ok')) return this.sign();
        if (s) { const i = +s.dataset.i; if (b.dataset.k) this.spin(i, +b.dataset.k); else { this.ent.cur = i; this.render(); } }
      });
      const at = document.querySelector('#treeDlg .tree-legend');
      if (at) at.before(box); else document.body.append(box);
      window.addEventListener('keydown', (e) => this.onKey(e), true);
      if (AMB.bus) {
        AMB.bus.on('resp:streak', (x) => x && this.onStreak(x.streak));
        AMB.bus.on('live', (n) => { if (n && n.raw != null && this.entry()) this.put(this.NOTE[((n.midi % 12) + 12) % 12]); }); // a MIDI note writes its name
        ['mode', 'reset'].forEach((ev) => AMB.bus.on('game:' + ev, () => { this.ent = null; this.render(); }));
      }
      this.render();
    },
  };
  garden.hiscores = HS;

  if (mq && mq.addEventListener) mq.addEventListener('change', (e) => { garden.reduced = e.matches; });
  AMB.garden = garden;
  document.addEventListener('DOMContentLoaded', () => garden.build());
})();
