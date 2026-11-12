// « Jardin sonore » : the game's interface (welcome choice, path/free switch; tree screen and
// challenges come later). Progression lives in game.js, the tree and locks in tree.js.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const $ = (s) => document.querySelector(s);

  const garden = {
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
    // ---- end of the path (G6.3) ----
    complete() { const T = AMB.tree; return T.NODES.every((n) => AMB.game.has(n.id)); },
    leftovers() {
      const g = AMB.game, all = this.notebook();
      return {
        disc: all.total - all.done,
        contracts: AMB.contracts ? AMB.contracts.DEFS.length - g.s.contracts.length : 0,
        puzzles: AMB.puzzles ? AMB.puzzles.DEFS.filter((d) => !g.s.puzzles.includes(d.id)).length : 0,
      };
    },
    showEnd(on = true) {
      const dlg = $('#endDlg'); if (!dlg) return;
      dlg.hidden = !on; if (!on) return;
      const g = AMB.game, all = this.notebook(), L = this.leftovers();
      const P = AMB.puzzles, C = AMB.contracts;
      dlg.querySelector('.end-stats').innerHTML = [
        `${AMB.tree.NODES.length} nœuds débloqués`,
        `${all.done}/${all.total} découvertes`,
        `${g.s.contracts.length}/${C ? C.DEFS.length : 0} contrats`,
        `${g.s.puzzles.length}/${P ? P.DEFS.length : 0} énigmes`,
        `✧ ${g.s.earned} gagnés en tout`,
      ].map((x) => `<li>${x}</li>`).join('');
      const rest = [L.disc && `${L.disc} découvertes`, L.contracts && `${L.contracts} contrats`, L.puzzles && `${L.puzzles} énigmes`].filter(Boolean);
      dlg.querySelector('.end-left').textContent = rest.length
        ? `Il reste en bonus : ${rest.join(', ')}. Tout reste jouable dans le carnet, la carte des contrats et l'arbre, pour le plaisir de tout trouver.`
        : 'Tu as absolument tout trouvé. Bravo.';
    },
    checkEnd() {
      const g = AMB.game;
      if (!g.path || g.s.ended || !this.complete()) return false;
      g.s.ended = true; g.save();
      setTimeout(() => { this.showTree(false); this.showEnd(true); this.chime('solve'); this.lcd('✦ jardin complet', 6000); }, 900);
      return true;
    },

    // ---- puzzle card (G5.3, « Mastermind » G8.1) ----
    pz: null, // { id }
    starText(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); },
    // bonus puzzles keep their controls secret until the last validation
    pzReveal() {
      const P = AMB.puzzles, d = this.pz && P.byId[this.pz.id]; if (!d) return true;
      const r = P.run(d.id);
      return !d.bonus || (r && r.tries.length >= P.TRIES - 1);
    },
    pzKeys() {
      const P = AMB.puzzles, d = P.byId[this.pz.id], n = Object.keys(d.target).length, best = P.best(d.id);
      const rec = best ? ` · record ${this.starText(best)}` : '';
      return (this.pzReveal() ? `Joue sur : ${Object.keys(d.target).map((k) => this.paramLabel(k)).join(', ')}`
        : `Énigme bonus : ${n} réglages en jeu, à toi de trouver lesquels`) + rec;
    },
    openPuzzle(id) {
      const P = AMB.puzzles; if (!P || !P.byId[id]) return;
      this.showTree(false);
      this.pz = { id };
      P.start(id); P.run(id);
      const card = $('#puzzle'); card.hidden = false;
      const d = P.byId[id];
      card.querySelector('.pz-title').textContent = `Énigme · ${d.title}`;
      card.querySelector('.pz-intro').textContent = d.intro;
      this.renderPuzzle();
    },
    closePuzzle() {
      if (AMB.puzzles) AMB.puzzles.stop(); this.pz = null;
      const c = $('#puzzle'); if (c) c.hidden = true;
    },
    // one validation = one row of pegs: ✓ right, ≈ close, ✗ far, plus ⬆ / ⬇ or « autre » (another option)
    PEG: { ok: ['✓', 'juste'], near: ['≈', 'proche'], far: ['✗', 'loin'] },
    DIR: { up: ['⬆', 'plus haut'], down: ['⬇', 'plus bas'], other: [' autre', 'autre option'] },
    pegHTML(p, named) {
      const [sym, word] = this.PEG[p.state], dir = named && p.dir ? this.DIR[p.dir] : null;
      const tip = named ? `${this.paramLabel(p.key)} : ${word}${dir ? `, ${dir[1]}` : ''}` : word;
      return `<span class="pz-peg ${p.state}"${named ? ` data-k="${p.key}"` : ''} title="${tip}">${sym}${dir ? dir[0] : ''}</span>`;
    },
    renderBoard() {
      const card = $('#puzzle'), P = AMB.puzzles, d = P.byId[this.pz.id], r = P.run(d.id);
      const board = card.querySelector('.pz-board'), keys = Object.keys(d.target), named = this.pzReveal();
      board.style.setProperty('--n', keys.length);
      if (!r.tries.length) { board.innerHTML = ''; return; }
      const short = (k) => { const l = this.paramLabel(k); return l.includes(' · ') ? l.split(' · ').pop() : l; };
      const rank = { ok: 0, near: 1, far: 2 };
      board.innerHTML = (named ? `<div class="pz-row pz-head"><span></span>${keys.map((k) => `<span title="${this.paramLabel(k)}">${short(k)}</span>`).join('')}</div>` : '')
        + r.tries.map((t, i) => {
          // unnamed (bonus) pegs are sorted by state: their position says nothing about the control
          const pegs = named ? t.pegs : [...t.pegs].sort((a, b) => rank[a.state] - rank[b.state]);
          return `<div class="pz-row"><span class="pz-n">${i + 1}</span>${pegs.map((p) => this.pegHTML(p, named)).join('')}</div>`;
        }).join('');
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
      card.querySelector('.pz-hint').textContent = target ? 'Tu entends la cible. Touche un réglage ou reviens à ton son pour continuer.'
        : this.statusText(r) + (r.help ? ' Aide utilisée : pas d\'étoiles cette fois.' : '');
    },
    validatePuzzle() {
      const P = AMB.puzzles; if (!this.pz || !P) return;
      const id = this.pz.id, d = P.byId[id];
      const res = P.attempt(id); if (!res) return;
      if (res.ok) {
        this.closePuzzle();
        const st = res.help ? 'avec l\'aide' : `${this.starText(res.stars)}${res.record && !res.first ? ' · record !' : ''}`;
        AMB.ui.toast(`✓ Énigme résolue en ${res.tries} essai${res.tries > 1 ? 's' : ''} : ${d.title} · ${st}${res.first && d.opens ? ` · « ${AMB.tree.byId[d.opens].name} » peut s'acheter` : ''}`);
        if (!res.first && AMB.game.path) { this.chime('solve'); this.lcd(`◈ ${res.help ? 'résolue' : this.starText(res.stars)}`); }
        if (res.first && d.opens) this.showTree(true);
      } else if (res.out) {
        // never a dead end: the gate opens anyway (no ✧, no star), the puzzle can be replayed later
        this.closePuzzle();
        const gate = d.opens && !AMB.game.s.puzzles.includes(id);
        AMB.ui.toast(gate ? `Pas cette fois, mais la porte s'ouvre quand même : « ${AMB.tree.byId[d.opens].name} » peut s'acheter. Reviens tenter les étoiles quand tu veux.`
          : 'Pas cette fois : elle était dure. Elle t\'attend dans l\'arbre, reviens tenter les étoiles quand tu veux.');
        if (AMB.game.path) this.lcd(gate ? '◈ porte ouverte' : '◈ à rejouer', 3000);
        if (gate) this.showTree(true);
      } else {
        this.shake($('#puzzle')); if (AMB.juice) AMB.juice.shake($('#puzzle'), 7);
        this.renderPuzzle();
      }
    },

    build() {
      AMB.store.on((k, v, src) => this.onParam(k, v, src));
      this.hookActions();
      if (AMB.bus) AMB.bus.on('game:earn', (d) => { if (AMB.game.path && d.reason !== 'test') this.pop(this.gainText(d)); });
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
      if (AMB.bus) ['earn', 'spend', 'unlock', 'reset', 'puzzles', 'opened', 'stars'].forEach((ev) => AMB.bus.on('game:' + ev, () => { if (td && !td.hidden) this.renderTree(); }));
      document.querySelectorAll('[data-end]').forEach((b) => b.addEventListener('click', () => { this.showEnd(false); if (b.dataset.end === 'tree') this.showTree(true); }));
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

  AMB.garden = garden;
  document.addEventListener('DOMContentLoaded', () => garden.build());
})();
