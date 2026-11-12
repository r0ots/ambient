// « Jardin sonore » : the game's interface (welcome choice, path/free switch, the contract on the LCD, puzzle card, end of the
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
    // ---- the contract on the 2nd line of the LCD (v1.06): one at a time, ↷ = the next one, a tap = how to do it ----
    renderContracts(flashId) {
      const box = $('#lcdTask'), line = $('#lcdLine'); if (!box || !AMB.contracts) return;
      const K = AMB.contracts, g = AMB.game, id = g.path ? K.state().active[0] : null, d = id && K.byId[id];
      box.hidden = !d; if (line) line.hidden = !!d;
      if (!d) return;
      if (box.dataset.id !== id) box.classList.remove('help');
      box.dataset.id = id;
      const n = K.progress(id), help = box.classList.contains('help') && d.hint;
      const txt = box.querySelector('.lcd-task-txt');
      txt.textContent = help ? d.hint : `◇ ${d.title}`;
      txt.title = help ? 'Toucher : revenir au contrat' : d.hint ? `${d.hint}\n(Toucher : comment faire)` : d.title;
      box.querySelector('.lcd-task-n').textContent = `${d.goal > 1 ? `${n}/${d.goal}` : n ? '✓' : '·'} ✧${d.reward}`;
      if (flashId === id) { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
    },
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
      const task = $('#lcdTask');
      if (task) {
        task.querySelector('.lcd-skip').addEventListener('click', () => { const id = task.dataset.id; if (id) AMB.contracts.skip(id); });
        task.querySelector('.lcd-task-txt').addEventListener('click', () => {
          clearTimeout(this._helpT);
          task.classList.toggle('help'); this.renderContracts();
          if (task.classList.contains('help')) this._helpT = setTimeout(() => { task.classList.remove('help'); this.renderContracts(); }, 15000);
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
