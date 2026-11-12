// « Jardin sonore » : the game's interface (welcome choice, path/free switch, contracts card, puzzle card, end of the
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
    // ---- contracts card (G4.4) ----
    renderContracts(flashId) {
      const box = $('#contracts'); if (!box || !AMB.contracts) return;
      const K = AMB.contracts, g = AMB.game;
      box.hidden = !g.path;
      if (!g.path) return;
      const act = K.state().active;
      box.querySelector('.ct-count').textContent = `${g.s.contracts.length}/${K.DEFS.length}`;
      const list = box.querySelector('.ct-list');
      list.innerHTML = act.length ? '' : '<p class="ct-empty">Débloque des nœuds pour recevoir de nouveaux contrats.</p>';
      for (const id of act) {
        const d = K.byId[id], n = K.progress(id), pct = Math.round((n / d.goal) * 100);
        const it = document.createElement('div');
        it.className = 'ct-item'; it.dataset.id = id;
        if (d.hint) it.title = d.hint;
        it.innerHTML = `<p>${d.title}</p><div class="ct-bar"><i style="width:${pct}%"></i></div>
          <span class="ct-meta">${d.goal > 1 ? `${n}/${d.goal}` : n ? 'fait' : 'à faire'} · ✧ ${d.reward}</span>
          <button class="ct-skip" title="Passer ce contrat (il reviendra plus tard)">↷</button>`;
        it.querySelector('.ct-skip').addEventListener('click', () => K.skip(id));
        list.append(it);
      }
      if (flashId) { const el = list.querySelector(`[data-id="${flashId}"]`); if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }
    },
    paramLabel(key) {
      const [sec, k] = key.split('.'); const S = AMB.SCHEMA[sec]; if (!S) return key;
      const sp = S.params[k];
      return k === 'on' ? S.label : sp ? `${S.label} · ${sp.label}` : S.label;
    },
    // clicks that always succeed go on the bus as actions (contracts count them); actions that can fail or be
    // cancelled (save, journal, chords, freeze) are emitted by their own code once they really happened
    CLICKS: [['#dice', 'dice'], ['.sc-store', 'sceneStore'], ['[data-s=add]', 'section'], ['[data-s=play]', 'song']],
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
    // ---- game feedback (G6.2): « +n ✧ » notes under the LCD, a chime tuned to the key, LCD messages ----
    pop(text) {
      let feed = $('#gainFeed');
      if (!feed) { feed = document.createElement('div'); feed.id = 'gainFeed'; feed.className = 'gain-feed'; feed.setAttribute('aria-live', 'polite'); document.body.append(feed); }
      const lcd = $('#lcd'); // float just under the LCD (wherever the header layout puts it)
      if (lcd) { const r = lcd.getBoundingClientRect(); feed.style.top = `${Math.round(r.bottom + 6)}px`; feed.style.left = `${Math.round(r.left)}px`; feed.style.right = 'auto'; }
      const it = document.createElement('div'); it.className = 'gain'; it.textContent = text;
      feed.append(it);
      while (feed.children.length > 4) feed.firstChild.remove();
      setTimeout(() => it.remove(), 3200);
    },
    gainText(d) {
      const P = AMB.puzzles, K = AMB.contracts;
      if (d.reason === 'énigme' && P && P.byId[d.id]) return `+${d.n} ✧ énigme résolue : ${P.byId[d.id].title}`;
      if (d.reason === 'contrat' && K && K.byId[d.id]) return `+${d.n} ✧ contrat rempli : ${K.byId[d.id].title}`;
      return `+${d.n} ✧ ${d.reason || ''}`;
    },
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
    // ---- end of the path (G6.3) ----
    complete() { const T = AMB.tree; return T.NODES.every((n) => AMB.game.has(n.id)); },
    checkEnd() {
      const g = AMB.game;
      if (!g.path || g.s.ended || !this.complete()) return false;
      g.s.ended = true; g.save();
      // no end screen: the instrument itself says it (chime, LCD, a toast), the player keeps playing
      setTimeout(() => { this.showTree(false); this.chime('solve'); this.lcd('✦ jardin complet', 6000); AMB.ui.toast('✦ Ton jardin est complet : tout l\'outil est à toi.'); }, 900);
      return true;
    },

    // ---- puzzle card (G5.3, « Mastermind » G8.1) ----
    pz: null, // { id, mode: the screen mode to come back to }
    pzKeys() { return `Joue sur : ${Object.keys(AMB.puzzles.byId[this.pz.id].keys).map((k) => this.paramLabel(k)).join(', ')}`; },
    // the controls of a puzzle live in Sculpter, except the progression and the pulses (Composer)
    pzMode(id) { return Object.keys(AMB.puzzles.byId[id].keys).some((k) => /^(pad\.prog|perc\.)/.test(k)) ? 'compose' : 'sculpt'; },
    openPuzzle(id) {
      const P = AMB.puzzles; if (!P || !P.byId[id]) return;
      this.showTree(false);
      const back = this.pz ? this.pz.mode : AMB.mode;
      this.pz = { id, mode: back };
      P.start(id);
      // show the controls in play (the screen goes back to its mode when the card closes)
      const want = this.pzMode(id);
      if (AMB.perform && AMB.mode !== want && AMB.tree.uiUnlocked('mode-' + want)) AMB.perform.setMode(want);
      const card = $('#puzzle'); card.hidden = false;
      const d = P.byId[id];
      card.querySelector('.pz-title').textContent = `Énigme · ${d.title}`;
      card.querySelector('.pz-intro').textContent = d.intro;
      this.renderPuzzle();
    },
    closePuzzle() {
      if (AMB.puzzles) AMB.puzzles.stop();
      const back = this.pz && this.pz.mode; this.pz = null;
      const c = $('#puzzle'); if (c) c.hidden = true;
      if (back && AMB.perform && AMB.mode !== back && AMB.game.path && (back === 'listen' || AMB.tree.uiUnlocked('mode-' + back))) AMB.perform.setMode(back);
    },
    // one validation = one row of pegs: ✓ right, ≈ close, ✗ far, plus ⬆ / ⬇ or « autre » (another option)
    PEG: { ok: ['✓', 'juste'], near: ['≈', 'proche'], far: ['✗', 'loin'] },
    DIR: { up: ['⬆', 'plus haut'], down: ['⬇', 'plus bas'], other: [' autre', 'autre option'] },
    pegHTML(p) {
      const [sym, word] = this.PEG[p.state], dir = p.dir ? this.DIR[p.dir] : null;
      return `<span class="pz-peg ${p.state}" data-k="${p.key}" title="${this.paramLabel(p.key)} : ${word}${dir ? `, ${dir[1]}` : ''}">${sym}${dir ? dir[0] : ''}</span>`;
    },
    renderBoard() {
      const card = $('#puzzle'), P = AMB.puzzles, d = P.byId[this.pz.id], r = P.run(d.id);
      const board = card.querySelector('.pz-board'), keys = Object.keys(d.keys);
      board.style.setProperty('--n', keys.length);
      if (!r.tries.length) { board.innerHTML = ''; return; }
      const short = (k) => { const l = this.paramLabel(k); return l.includes(' · ') ? l.split(' · ').pop() : l; };
      board.innerHTML = `<div class="pz-row pz-head"><span></span>${keys.map((k) => `<span title="${this.paramLabel(k)}">${short(k)}</span>`).join('')}</div>`
        + r.tries.map((t, i) => `<div class="pz-row"><span class="pz-n">${i + 1}</span>${t.pegs.map((p) => this.pegHTML(p)).join('')}</div>`).join('');
    },
    statusText(r) {
      const P = AMB.puzzles, left = P.TRIES - r.tries.length, last = r.tries[r.tries.length - 1];
      const leftTxt = `${left} essai${left > 1 ? 's' : ''} restant${left > 1 ? 's' : ''} sur ${P.TRIES}`;
      if (!last) return `Écoute la cible, reviens à ton son, règle, valide. ${leftTxt}.`;
      const n = (s) => last.pegs.filter((p) => p.state === s).length;
      return `Pas encore : ${n('ok')} juste${n('ok') > 1 ? 's' : ''}, ${n('near')} proche${n('near') > 1 ? 's' : ''}. ${leftTxt}.`;
    },
    renderPuzzle() {
      const card = $('#puzzle'), P = AMB.puzzles; if (!card || !this.pz || !P) return;
      const r = P.run(this.pz.id), help = !!AMB.game.s.pzHelp;
      const sc = P.currentScore(), pct = Math.round(sc.total * 100), ready = help && sc.total >= P.PASS;
      const gauge = card.querySelector('.pz-gauge');
      gauge.hidden = !help;
      if (help) {
        gauge.querySelector('i').style.width = pct + '%';
        gauge.classList.toggle('ready', ready);
        card.querySelector('.pz-pct').textContent = `${pct} %`;
      }
      const cb = card.querySelector('.pz-help input'); if (cb) cb.checked = help;
      const target = P.side() === 'target';
      const ab = card.querySelector('.pz-ab');
      ab.textContent = target ? '◀ Revenir à mon son' : '▶ Écouter la cible';
      ab.classList.toggle('on', target);
      const okb = card.querySelector('.pz-ok'); okb.classList.toggle('ready', ready && !target); okb.disabled = target;
      okb.textContent = `Valider (${r.tries.length + 1}/${P.TRIES})`;
      card.querySelector('.pz-keys').textContent = this.pzKeys();
      this.renderBoard();
      card.querySelector('.pz-hint').textContent = target ? 'Tu entends la cible. Touche un réglage ou reviens à ton son pour continuer.' : this.statusText(r);
    },
    validatePuzzle() {
      const P = AMB.puzzles; if (!this.pz || !P) return;
      const id = this.pz.id, d = P.byId[id];
      const res = P.attempt(id); if (!res) return;
      if (res.ok) {
        this.closePuzzle();
        AMB.ui.toast(`✓ Énigme résolue en ${res.tries} essai${res.tries > 1 ? 's' : ''} : ${d.title}${res.first && d.opens ? ` · « ${AMB.tree.byId[d.opens].name} » peut s'acheter` : ''}`);
        if (!res.first && AMB.game.path) { this.chime('solve'); this.lcd(`◈ résolue en ${res.tries}`); }
        if (res.first && d.opens) this.showTree(true);
      } else if (res.out) {
        // never a dead end: the gate opens anyway (no ✧), the puzzle can be replayed later with a new target
        this.closePuzzle();
        const gate = d.opens && !AMB.game.s.puzzles.includes(id);
        AMB.ui.toast(gate ? `Pas cette fois, mais la porte s'ouvre quand même : « ${AMB.tree.byId[d.opens].name} » peut s'acheter. L'énigme reste à rejouer.`
          : 'Pas cette fois : elle était dure. Rejoue-la depuis l\'arbre, avec une nouvelle cible.');
        if (AMB.game.path) this.lcd(gate ? '◈ porte ouverte' : '◈ à rejouer', 3000);
        if (gate) this.showTree(true);
      } else this.renderPuzzle();
    },

    build() {
      this.hookActions();
      if (AMB.bus) AMB.bus.on('game:earn', (d) => { if (AMB.game.path) this.pop(this.gainText(d)); });
      if (AMB.bus) {
        AMB.bus.on('game:earn', () => this.renderCounter(true));
        ['spend', 'unlock', 'reset', 'mode', 'puzzles', 'opened'].forEach((ev) => AMB.bus.on('game:' + ev, () => this.renderCounter()));
      }
      this.renderCounter();
      const pzc = $('#puzzle');
      if (pzc) {
        pzc.querySelector('.pz-x').addEventListener('click', () => this.closePuzzle());
        pzc.querySelector('.pz-ab').addEventListener('click', () => AMB.puzzles.listen(AMB.puzzles.side() === 'target' ? 'mine' : 'target'));
        pzc.querySelector('.pz-ok').addEventListener('click', () => this.validatePuzzle());
        const hb = pzc.querySelector('.pz-help input'); if (hb) hb.addEventListener('change', () => AMB.puzzles.setHelp(hb.checked));
      }
      if (AMB.bus) {
        AMB.bus.on('game:unlock', (d) => {
          const n = AMB.tree.byId[d.id]; if (!AMB.game.path || !n || !n.cost) return;
          if (this.checkEnd()) return;
          this.chime('unlock'); this.lcd(`✦ ${n.name} débloqué`);
        });
        AMB.bus.on('game:puzzles', (d) => { if (!AMB.game.path) return; this.chime('solve'); this.lcd('◈ énigme résolue'); });
        AMB.bus.on('game:contracts', () => { if (!AMB.game.path) return; this.chime('small'); this.lcd('✓ contrat rempli', 2500); });
        AMB.bus.on('game:puzzle', () => this.renderPuzzle());
        AMB.bus.on('game:mode', () => { if (!AMB.game.path) this.closePuzzle(); });
        AMB.bus.on('game:reset', () => this.closePuzzle());
      }
      const ct = $('#contracts');
      if (ct) {
        let collapsed = false; try { collapsed = localStorage.getItem('ambient.contracts.min') === '1'; } catch (e) {}
        ct.classList.toggle('min', collapsed);
        ct.querySelector('.ct-head').addEventListener('click', () => {
          const m = !ct.classList.contains('min'); ct.classList.toggle('min', m);
          try { localStorage.setItem('ambient.contracts.min', m ? '1' : '0'); } catch (e) {}
        });
      }
      if (AMB.bus) {
        AMB.bus.on('game:contract', (d) => this.renderContracts(d && d.id));
        ['contracts', 'mode', 'reset', 'unlock'].forEach((ev) => AMB.bus.on('game:' + ev, () => this.renderContracts()));
      }
      if (AMB.contracts) AMB.contracts.refill();
      this.renderContracts();
      this.wireTree(); // map: hover / focus / touch selection, pan & zoom, buying (garden-tree.js)
      const tb = $('#treeBtn'); if (tb) tb.addEventListener('click', () => this.showTree(true));
      const td = $('#treeDlg');
      if (td) td.addEventListener('click', (e) => { if (e.target === td || e.target.hasAttribute('data-close')) this.showTree(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && td && !td.hidden) this.showTree(false); });
      if (AMB.bus) ['earn', 'spend', 'unlock', 'reset', 'puzzles', 'opened'].forEach((ev) => AMB.bus.on('game:' + ev, () => { if (td && !td.hidden) this.renderTree(); }));
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
