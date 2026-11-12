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

    // ---- puzzle card (G5.3) ----
    pz: null, // { id, fails, t0 }
    openPuzzle(id) {
      const P = AMB.puzzles; if (!P || !P.byId[id]) return;
      this.showTree(false);
      this.pz = { id, fails: 0, t0: Date.now() };
      P.start(id);
      const card = $('#puzzle'); card.hidden = false;
      const d = P.byId[id];
      card.querySelector('.pz-title').textContent = `Énigme · ${d.title}`;
      card.querySelector('.pz-intro').textContent = d.intro;
      this.pzKeys = () => (d.bonus && this.hintLevel() < 2 ? `Énigme bonus : ${Object.keys(d.target).length} réglages en jeu, à toi de trouver lesquels`
        : `Joue sur : ${Object.keys(d.target).map((k) => this.paramLabel(k)).join(', ')}`);
      card.querySelector('.pz-keys').textContent = this.pzKeys();
      this.renderPuzzle();
      if (!this.pzTimer) this.pzTimer = setInterval(() => { if (this.pz) this.renderPuzzle(); }, 5000);
    },
    closePuzzle() {
      if (AMB.puzzles) AMB.puzzles.stop(); this.pz = null;
      if (this.pzTimer) { clearInterval(this.pzTimer); this.pzTimer = null; }
      const c = $('#puzzle'); if (c) c.hidden = true;
    },
    // hints grow with failed validations and time spent
    hintLevel() { const p = this.pz; if (!p) return 0; const t = (Date.now() - p.t0) / 1000; return p.fails >= 3 || t > 120 ? 2 : p.fails >= 1 || t > 45 ? 1 : 0; },
    hintText(sc) {
      const lvl = this.hintLevel(), off = sc.keys.filter((k) => k.s < 0.9).sort((a, b) => a.s - b.s);
      if (!off.length) return 'Tout y est : valide !';
      if (lvl === 0) return 'Écoute la cible, reviens à ton son, ajuste.';
      const word = (k) => {
        const sp = AMB.store.spec(k.key);
        if (sp.type === 'select' && sp.options && sp.options.indexOf(k.value) >= 0 && /^(global\.key|fx\.echoTime)$/.test(k.key))
          return sp.options.indexOf(k.value) < sp.options.indexOf(k.target) ? 'plus haut' : 'plus bas';
        if (sp.type) return 'essaie une autre option';
        return Number(k.value) < Number(k.target) ? 'plus haut' : 'plus bas';
      };
      const bonus = AMB.puzzles && AMB.puzzles.byId[this.pz.id] && AMB.puzzles.byId[this.pz.id].bonus;
      if (lvl === 1) return bonus ? `Un réglage est encore loin (${off.length} à revoir)` : `Le plus éloigné : ${this.paramLabel(off[0].key)}`;
      return off.map((k) => `${this.paramLabel(k.key)} : ${word(k)}`).join(' · ');
    },
    renderPuzzle() {
      const card = $('#puzzle'), P = AMB.puzzles; if (!card || !this.pz || !P) return;
      const sc = P.currentScore(), pct = Math.round(sc.total * 100), ready = sc.total >= P.PASS;
      card.querySelector('.pz-gauge i').style.width = pct + '%';
      card.querySelector('.pz-gauge').classList.toggle('ready', ready);
      card.querySelector('.pz-pct').textContent = `${pct} %`;
      const target = P.side() === 'target';
      const ab = card.querySelector('.pz-ab');
      ab.textContent = target ? '◀ Revenir à mon son' : '▶ Écouter la cible';
      ab.classList.toggle('on', target);
      const okb = card.querySelector('.pz-ok'); okb.classList.toggle('ready', ready && !target); okb.disabled = target;
      if (this.pzKeys) card.querySelector('.pz-keys').textContent = this.pzKeys();
      card.querySelector('.pz-hint').textContent = target ? 'Tu entends la cible. Touche un réglage ou reviens à ton son pour continuer.' : this.hintText(sc);
    },
    validatePuzzle() {
      const P = AMB.puzzles; if (!this.pz || !P) return;
      const id = this.pz.id, d = P.byId[id];
      if (P.check(id)) {
        this.closePuzzle();
        AMB.ui.toast(`✓ Énigme résolue : ${d.title}${d.opens ? ` · « ${AMB.tree.byId[d.opens].name} » peut s'acheter` : ''}`);
        if (d.opens) this.showTree(true);
      } else {
        this.pz.fails++;
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
        ['spend', 'unlock', 'reset', 'mode', 'puzzles'].forEach((ev) => AMB.bus.on('game:' + ev, () => this.renderCounter()));
      }
      this.renderCounter();
      const pzc = $('#puzzle');
      if (pzc) {
        pzc.querySelector('.pz-x').addEventListener('click', () => this.closePuzzle());
        pzc.querySelector('.pz-ab').addEventListener('click', () => AMB.puzzles.listen(AMB.puzzles.side() === 'target' ? 'mine' : 'target'));
        pzc.querySelector('.pz-ok').addEventListener('click', () => this.validatePuzzle());
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
      const tmap = $('#treeDlg .tree-map');
      // hovering a node lights up its prerequisites and what it leads to
      const mark = (id) => {
        tmap.querySelectorAll('.is-req, .is-dep, .is-focus').forEach((e) => e.classList.remove('is-req', 'is-dep', 'is-focus'));
        if (!id) return;
        const q = (x) => tmap.querySelector(`.tree-node[data-id="${x}"]`);
        const me = q(id); if (me) me.classList.add('is-focus');
        AMB.tree.byId[id].req.forEach((r) => { const e = q(r); if (e) e.classList.add('is-req'); });
        AMB.tree.dependents(id).forEach((r) => { const e = q(r); if (e) e.classList.add('is-dep'); });
      };
      if (tmap) {
        tmap.addEventListener('mouseover', (e) => { const b = e.target.closest('.tree-node'); mark(b && b.dataset.id); });
        tmap.addEventListener('mouseleave', () => mark(null));
        tmap.addEventListener('focusin', (e) => { const b = e.target.closest('.tree-node'); mark(b && b.dataset.id); });
      }
      if (tmap) tmap.addEventListener('click', (e) => { const b = e.target.closest('.tree-node'); if (b) this.tryBuy(b.dataset.id); });
      const tb = $('#treeBtn'); if (tb) tb.addEventListener('click', () => this.showTree(true));
      const td = $('#treeDlg');
      if (td) td.addEventListener('click', (e) => { if (e.target === td || e.target.hasAttribute('data-close')) this.showTree(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && td && !td.hidden) this.showTree(false); });
      if (AMB.bus) ['earn', 'spend', 'unlock', 'reset', 'puzzles'].forEach((ev) => AMB.bus.on('game:' + ev, () => { if (td && !td.hidden) this.renderTree(); }));
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
