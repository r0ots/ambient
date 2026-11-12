// « Jardin sonore » : the game's interface (welcome choice, path/free switch, the challenge on the LCD, Écho card, end of the
// path; the tree screen is in garden-tree.js). Progression lives in game.js, the tree and locks in tree.js.
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
      AMB.ui.toast(mode === 'path' ? '🌱 Parcours : une seule note pour commencer. Lance la lecture et explore.' : '◎ Mode libre : tout est ouvert');
    },
    renderSwitch() {
      const b = $('#gameMode'); if (!b) return;
      b.textContent = AMB.game.path ? '◎ Passer en mode libre' : '🌱 Parcours (débloquer pas à pas)';
    },
    // ---- the challenge on the 2nd line of the LCD (v1.06): one at a time, ↷ = the next one, a tap = how to do it
    // (an Écho: a tap opens its card) ----
    renderContracts(flashId) {
      const box = $('#lcdTask'), line = $('#lcdLine'); if (!box || !AMB.contracts) return;
      const K = AMB.contracts, g = AMB.game, id = g.path && !this.handedOver() ? K.state().active[0] : null, d = id && K.byId[id];
      box.hidden = !d; if (line) line.hidden = !!d;
      if (!d) return;
      if (box.dataset.id !== id) box.classList.remove('help');
      box.dataset.id = id;
      const n = K.progress(id), echo = d.kind === 'echo', help = !echo && box.classList.contains('help') && d.hint;
      const txt = box.querySelector('.lcd-task-txt');
      txt.textContent = help ? d.hint : echo ? `◈ Écho : ${d.title}` : `◇ ${d.title}`;
      txt.title = echo ? 'Toucher : écouter la phrase et la rejouer' : help ? 'Toucher : revenir au défi' : `${d.hint}\n(Toucher : comment faire)`;
      box.querySelector('.lcd-task-n').textContent = echo ? '▶' : d.goal > 1 ? `${n}/${d.goal}` : n ? '✓' : '·';
      if (flashId === id) { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
    },
    paramLabel(key) {
      const [sec, k] = key.split('.'); const S = AMB.SCHEMA[sec]; if (!S) return key;
      const sp = S.params[k];
      return k === 'on' ? S.label : sp ? `${S.label} · ${sp.label}` : S.label;
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
    chime(kind = 'unlock') {
      const E = AMB.engine, ctx = E && E.ctx;
      if (!ctx || ctx.state !== 'running' || !AMB.game.path) return 0;
      const Th = AMB.theory, root = Th.NOTE_NAMES.indexOf(AMB.store.get('global.key'));
      const scale = Th.SCALES[AMB.store.get('global.scale')] || Th.SCALES['Ionien (majeur)'];
      const degs = kind === 'small' ? [4] : kind === 'solve' ? [0, 2, 4, 7, 9, 11] : [0, 2, 4, 7];
      const out = ctx.createGain(); out.gain.value = 0.16;
      out.connect(ctx.destination); // never recorded nor frozen
      const t0 = ctx.currentTime + 0.02;
      degs.forEach((dg, i) => {
        const f = Th.mtof(Th.degreeToMidi(dg, root, scale, 5));
        const at = t0 + (kind === 'solve' ? (i < 3 ? 0 : 0.35) + i % 3 * 0.02 : i * 0.09);
        for (const [mul, amp] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) { // bell-ish partials
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f * mul;
          g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp * 0.5, at + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6 / mul);
          o.connect(g); g.connect(out); o.start(at); o.stop(at + 1.7);
        }
      });
      setTimeout(() => out.disconnect(), 3000);
      return degs.length;
    },
    lcd(text, ms = 3500) { AMB.lcdMsg = { text, until: Date.now() + ms }; },
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
      // no end screen: the instrument itself says it (chime, LCD), then the challenge line goes; the sound is untouched
      this.handing = true;
      setTimeout(() => {
        this.showTree(false); this.chime('solve'); this.lcd('✦ L\'instrument est à toi', 6000);
        setTimeout(() => { this.handing = false; this.closePuzzle(); this.renderContracts(); }, 2000);
      }, 900);
      return true;
    },

    // ---- Écho card (S3.1): the phrase is heard, then played back note by note ----
    pz: null, // { id }
    openPuzzle(id) {
      const P = AMB.puzzles; if (!P || !P.isEcho(id)) return;
      this.showTree(false);
      this.pz = { id };
      P.start(id);
      const card = $('#puzzle'); card.hidden = false;
      document.body.classList.add('pz-open', 'pz-echo'); // the card has its own pads: the bar under the screen steps aside
      card.querySelector('.pz-title').textContent = `Écho · ${AMB.contracts.byId[id].title}`;
      card.querySelector('.pz-intro').textContent = AMB.contracts.byId[id].intro;
      this.renderPuzzle();
      clearTimeout(this._echoT);
      this._echoT = setTimeout(() => P.echoPlay(id), 400); // an echo starts by being heard
    },
    closePuzzle() {
      if (AMB.puzzles && AMB.puzzles.current) AMB.puzzles.stop();
      this.pz = null;
      const c = $('#puzzle'); if (c) c.hidden = true;
      document.body.classList.remove('pz-open', 'pz-echo');
    },
    get PADS() { return AMB.play.PADS; }, // the 9 pads of the bar under the screen (js/play.js), also on the Écho card
    DIR: { up: ['⬆', 'plus haut'], down: ['⬇', 'plus bas'] },
    pegHTML(p) { // ✓ right, ⬆ / ⬇ which way the note should go
      const dir = p.dir && this.DIR[p.dir];
      return `<span class="pz-peg ${p.state}" data-k="${p.key}" title="Note ${p.key.slice(1)} : ${dir ? dir[1] : 'juste'}">${dir ? dir[0] : '✓'}</span>`;
    },
    // one row per phrase played back, the one in progress last (its notes to come as « · »)
    renderBoard() {
      const P = AMB.puzzles, id = this.pz.id, r = P.run(id), board = $('#puzzle .pz-board');
      const n = P.echoMidis(id).length, cur = P.echoRow;
      board.style.setProperty('--n', n);
      const rows = r.tries.map((t, i) => [i + 1, t.pegs]);
      if (cur.length || r.tries.length) rows.push([r.tries.length + 1, cur]);
      board.innerHTML = !rows.length ? '' : `<div class="pz-row pz-head"><span></span>${Array.from({ length: n }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>`
        + rows.map(([k, pegs]) => `<div class="pz-row"><span class="pz-n">${k}</span>${pegs.map((p) => this.pegHTML(p)).join('')}${'<span class="pz-peg wait">·</span>'.repeat(Math.max(0, n - pegs.length))}</div>`).join('');
    },
    statusText(r) {
      const P = AMB.puzzles, left = P.TRIES - r.tries.length, last = r.tries[r.tries.length - 1];
      const leftTxt = `${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''} sur ${P.TRIES}`;
      const n = P.echoMidis(this.pz.id).length, at = P.echoRow.length;
      if (at) return `Note ${at + 1} sur ${n}. ${leftTxt}.`;
      if (!last) return `${n} notes à rejouer. ${leftTxt}.`;
      const k = last.pegs.filter((p) => p.state === 'ok').length;
      return `Pas encore : ${k} note${k > 1 ? 's' : ''} juste${k > 1 ? 's' : ''} sur ${n}. Nouvelle phrase. ${leftTxt}.`;
    },
    renderPuzzle() {
      const card = $('#puzzle'), P = AMB.puzzles; if (!card || !this.pz || !P) return;
      const pads = card.querySelector('.pz-pads');
      if (pads && !pads.children.length) pads.innerHTML = this.PADS.map((k, i) => `<button type="button" class="pz-pad" data-deg="${i}" title="Touche ${k}">${k}</button>`).join('');
      this.renderBoard();
      card.querySelector('.pz-hint').textContent = this.statusText(P.run(this.pz.id));
    },
    // after an attempt (the last note of the phrase): done (its node opens: the unlock sequence), out of attempts (it
    // opens anyway), or the next phrase
    puzzleResult(id, res) {
      if (res.ok || res.out) {
        this.closePuzzle();
        const d = AMB.contracts.byId[id], node = d.node && AMB.tree.byId[d.node];
        AMB.ui.toast(res.ok ? `✓ Écho réussi en ${res.tries} essai${res.tries > 1 ? 's' : ''}${node ? ` : ${node.name} s'ouvre` : ''}`
          : `Pas cette fois, mais ${node ? `${node.name} s'ouvre` : 'la suite s\'ouvre'} quand même.`);
      } else {
        this.renderPuzzle();
        // the new phrase is heard right away (never idle)
        clearTimeout(this._echoT);
        this._echoT = setTimeout(() => { if (this.pz && this.pz.id === id) AMB.puzzles.echoPlay(id); }, 1200);
      }
    },

    build() {
      this.hookActions();
      const pzc = $('#puzzle');
      if (pzc) {
        pzc.querySelector('.pz-x').addEventListener('click', () => this.closePuzzle());
        pzc.querySelector('.pz-ab').addEventListener('click', () => AMB.puzzles.echoPlay());
        const pads = pzc.querySelector('.pz-pads');
        if (pads) pads.addEventListener('pointerdown', (e) => {
          const b = e.target.closest('.pz-pad'); if (!b || !AMB.puzzles.isEcho() || !AMB.seq) return;
          e.preventDefault(); AMB.seq.playDegree(+b.dataset.deg);
        });
      }
      if (AMB.bus) {
        // a node opens: by a challenge = the unlock sequence on the map (garden-tree.js); by a secret = chime + LCD
        AMB.bus.on('game:unlock', (d) => {
          const n = AMB.tree.byId[d.id]; if (!AMB.game.path || !n || !n.req.length) return;
          if (this.checkEnd()) return;
          this.lcd(`✦ ${n.name} ouvert`);
          if (d.by) this.unlockSeq(d.id); else this.chime('unlock');
        });
        AMB.bus.on('game:contracts', (d) => { // the last challenge opens no node: its own small chime
          const c = AMB.contracts.byId[d && d.id]; if (!AMB.game.path || !c || c.node) return;
          this.chime('small'); this.lcd('✓ défi réussi', 2500);
        });
        AMB.bus.on('game:puzzle', (e) => { if (e && e.res && this.pz && this.pz.id === e.id) this.puzzleResult(e.id, e.res); else this.renderPuzzle(); });
        AMB.bus.on('game:mode', () => { if (!AMB.game.path) this.closePuzzle(); });
        AMB.bus.on('game:reset', () => this.closePuzzle());
      }
      const task = $('#lcdTask');
      if (task) {
        task.querySelector('.lcd-skip').addEventListener('click', () => { const id = task.dataset.id; if (id) AMB.contracts.skip(id); });
        task.querySelector('.lcd-task-txt').addEventListener('click', () => {
          const id = task.dataset.id; if (AMB.puzzles && AMB.puzzles.isEcho(id)) return this.openPuzzle(id); // an Écho: its card
          clearTimeout(this._helpT);
          task.classList.toggle('help'); this.renderContracts();
          if (task.classList.contains('help')) this._helpT = setTimeout(() => { task.classList.remove('help'); this.renderContracts(); }, 15000);
        });
      }
      if (AMB.bus) {
        AMB.bus.on('game:contract', (d) => { this.renderContracts(d && d.id); if (!d || !d.id) this.checkEnd(); }); // ↷ on the last one
        AMB.bus.on('game:contracts', () => this.checkEnd());
        ['contracts', 'mode', 'reset', 'unlock'].forEach((ev) => AMB.bus.on('game:' + ev, () => this.renderContracts()));
      }
      if (AMB.contracts) AMB.contracts.refill();
      this.renderContracts();
      this.wireTree(); // map: hover / focus / touch selection, pan & zoom (garden-tree.js)
      const tb = $('#treeBtn'); if (tb) tb.addEventListener('click', () => this.showTree(true));
      const td = $('#treeDlg');
      if (td) td.addEventListener('click', (e) => { if (e.target === td || e.target.hasAttribute('data-close')) this.showTree(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && td && !td.hidden) this.showTree(false); });
      if (AMB.bus) ['unlock', 'reset'].forEach((ev) => AMB.bus.on('game:' + ev, () => { if (td && !td.hidden && !this.seq) this.renderTree(); }));
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
