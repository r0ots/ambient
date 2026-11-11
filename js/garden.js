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
    // ---- tree screen (G2.1) ----
    depth(id, memo = {}) {
      if (memo[id] != null) return memo[id];
      const n = AMB.tree.byId[id];
      return (memo[id] = n.req.length ? 1 + Math.max(...n.req.map((r) => this.depth(r, memo))) : 0);
    },
    showTree(on) { const d = $('#treeDlg'); if (!d) return; d.hidden = !on; if (on) this.renderTree(); },
    renderTree() {
      const map = $('#treeDlg .tree-map'); if (!map) return;
      const T = AMB.tree, g = AMB.game, memo = {};
      $('#treeDlg .tree-shards').textContent = `✧ ${g.s.shards}`;
      map.innerHTML = '';
      for (const [bid, br] of Object.entries(T.BRANCHES)) {
        const col = document.createElement('div');
        col.className = 'tree-col'; col.style.setProperty('--c', br.color);
        const nodes = T.NODES.filter((n) => n.branch === bid);
        const owned = nodes.filter((n) => g.has(n.id)).length;
        col.innerHTML = `<h4>${br.name} <small>${owned}/${nodes.length}</small></h4>`;
        const rows = {};
        for (const n of nodes) (rows[this.depth(n.id, memo)] = rows[this.depth(n.id, memo)] || []).push(n);
        for (const d of Object.keys(rows).sort((a, b) => a - b)) {
          const row = document.createElement('div'); row.className = 'tree-row';
          for (const n of rows[d]) {
            const st = T.status(n.id);
            const b = document.createElement('button');
            b.className = `tree-node st-${st}`; b.dataset.id = n.id;
            b.innerHTML = `<b>${n.name}</b><span>${st === 'owned' ? '✓' : n.cost ? `✧ ${n.cost}` : 'offert'}${n.gate && st !== 'owned' ? ' · 🔒 énigme' : ''}</span>`;
            b.title = n.desc;
            row.append(b);
          }
          col.append(row);
        }
        map.append(col);
      }
    },
    // ---- buying (G2.2) ----
    tryBuy(id) {
      const T = AMB.tree, g = AMB.game, n = T.byId[id], st = T.status(id);
      const el = document.querySelector(`.tree-node[data-id="${id}"]`);
      const shake = () => { if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } };
      if (st === 'owned') return false;
      if (st === 'locked') { shake(); AMB.ui.toast(`D'abord : ${n.req.filter((r) => !g.has(r)).map((r) => T.byId[r].name).join(', ')}`); return false; }
      if (st === 'gated') { shake(); AMB.ui.toast('🔒 Résous l\'énigme de ce nœud pour l\'ouvrir'); return false; }
      if (!g.canAfford(n.cost)) { shake(); AMB.ui.toast(`Il te manque ✧ ${n.cost - g.s.shards}`); return false; }
      T.buy(id);
      AMB.ui.toast(`🌱 ${n.name} débloqué`);
      this.showTree(false);
      this.reveal(id);
      return true;
    },
    // show what a node just opened: go to the right mode, scroll to it, make it glow for a while
    revealTargets(id) {
      const n = AMB.tree.byId[id]; if (!n) return [];
      const els = [...document.querySelectorAll(`[data-node="${id}"]`)];
      for (const u of n.ui) document.querySelectorAll(`[data-ui="${u}"]`).forEach((e) => { if (!els.includes(e)) els.push(e); });
      return els.filter((e) => !e.closest('.is-locked') && !e.closest('.menu'));
    },
    reveal(id) {
      const els = this.revealTargets(id); if (!els.length) return;
      // prefer the full panel over the Écouter shortcuts (layer chips, macros)
      const first = els.find((e) => !e.closest('.macros')) || els[0];
      const want = first.closest('.seqrow') ? 'compose' : first.closest('.globals, .layers, #scenes, #journal') ? 'sculpt' : first.closest('.macros') ? 'listen' : null;
      if (want && AMB.mode !== want && AMB.perform) AMB.perform.setMode(want);
      els.forEach((e) => { e.classList.remove('is-new'); void e.offsetWidth; e.classList.add('is-new'); });
      setTimeout(() => els.forEach((e) => e.classList.remove('is-new')), 6000);
      try { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { first.scrollIntoView(); }
    },

    build() {
      const tmap = $('#treeDlg .tree-map');
      if (tmap) tmap.addEventListener('click', (e) => { const b = e.target.closest('.tree-node'); if (b) this.tryBuy(b.dataset.id); });
      const tb = $('#treeBtn'); if (tb) tb.addEventListener('click', () => this.showTree(true));
      const td = $('#treeDlg');
      if (td) td.addEventListener('click', (e) => { if (e.target === td || e.target.hasAttribute('data-close')) this.showTree(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && td && !td.hidden) this.showTree(false); });
      if (AMB.bus) ['earn', 'spend', 'unlock', 'reset', 'puzzles'].forEach((ev) => AMB.bus.on('game:' + ev, () => { if (td && !td.hidden) this.renderTree(); }));
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
