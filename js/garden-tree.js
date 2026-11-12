// « Jardin sonore » : the tree screen — layout, buying, reveal, shard counter and badge.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const $ = (s) => document.querySelector(s);
  Object.assign(AMB.garden, {
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
      const all = this.notebook();
      $('#treeDlg .tree-shards').textContent = `✧ ${g.s.shards}`;
      const sub = $('#treeDlg .tree-sub'); if (sub) sub.textContent = `${this.complete() ? '✦ Jardin complet · ' : ''}${g.s.nodes.length}/${T.NODES.length} nœuds · ${all.done}/${all.total} découvertes · ✧ ${g.s.earned} gagnés en tout`;
      map.innerHTML = '';
      // puzzles: bonus ones you can try now, and how many are solved
      const pzEl = $('#treeDlg .tree-puzzles');
      if (pzEl && AMB.puzzles) {
        const P = AMB.puzzles, solved = P.DEFS.filter((x) => g.s.puzzles.includes(x.id)).length;
        const open = P.available().filter((x) => x.bonus);
        pzEl.innerHTML = `<span>Énigmes ${solved}/${P.DEFS.length}</span>` + (open.length ? ' · bonus :' : '');
        for (const x of open) {
          const b = document.createElement('button'); b.className = 'btn small'; b.textContent = `◈ ${x.title} · ✧ ${x.reward}`;
          b.title = x.intro; b.addEventListener('click', () => this.openPuzzle(x.id));
          pzEl.append(b);
        }
      }
      for (const [bid, br] of Object.entries(T.BRANCHES)) {
        const col = document.createElement('div');
        col.className = 'tree-col'; col.style.setProperty('--c', br.color);
        const nodes = T.NODES.filter((n) => n.branch === bid);
        const owned = nodes.filter((n) => g.has(n.id)).length;
        col.innerHTML = `<h4>${br.name} <small>${owned}/${nodes.length}</small></h4>`;
        const nb = this.notebook(bid), pct = nb.total ? Math.round((nb.done / nb.total) * 100) : 0;
        const nbEl = document.createElement('div');
        nbEl.className = 'tree-nb';
        nbEl.innerHTML = `<span>Découvertes ${nb.done}/${nb.total}</span><i style="--p:${pct}%"></i>`
          + (nb.todo.length ? `<em>${nb.todo.length} à essayer</em>` : '');
        nbEl.title = nb.todo.length ? `À essayer (déjà débloqué) :\n${nb.todo.map((x) => '· ' + x.label).join('\n')}` : 'Rien à essayer pour l\'instant : débloque d\'autres nœuds';
        col.append(nbEl);
        const rows = {};
        for (const n of nodes) (rows[this.depth(n.id, memo)] = rows[this.depth(n.id, memo)] || []).push(n);
        for (const d of Object.keys(rows).sort((a, b) => a - b)) {
          const row = document.createElement('div'); row.className = 'tree-row';
          for (const n of rows[d]) {
            const st = T.status(n.id);
            const b = document.createElement('button');
            b.className = `tree-node st-${st}`; b.dataset.id = n.id;
            // prerequisites from another branch are spelled out under the name
            const ext = n.req.filter((r) => T.byId[r].branch !== n.branch).map((r) => T.byId[r].name);
            b.innerHTML = `<b>${n.name}</b><span>${st === 'owned' ? '✓' : n.cost ? `✧ ${n.cost}` : 'offert'}${n.gate && st !== 'owned' ? ' · 🔒 énigme' : ''}</span>`
              + (ext.length && st !== 'owned' ? `<em>← ${ext.join(', ')}</em>` : '');
            b.title = `${n.desc}\n\nDébloque : ${T.grants(n.id).join(', ') || '—'}`
              + (n.req.length ? `\nDemande : ${n.req.map((r) => T.byId[r].name).join(', ')}` : '')
              + (n.gate ? `\nPorte : une énigme d'écoute à résoudre` : '');
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
      const shake = () => this.shake(el);
      if (st === 'owned') return false;
      if (st === 'locked') { shake(); AMB.ui.toast(`D'abord : ${n.req.filter((r) => !g.has(r)).map((r) => T.byId[r].name).join(', ')}`); return false; }
      if (st === 'gated') {
        const pz = AMB.puzzles && AMB.puzzles.forNode(id);
        if (pz && pz.need.every((r) => g.has(r))) { this.openPuzzle(pz.id); return false; }
        shake(); AMB.ui.toast(pz ? `🔒 Énigme : débloque d'abord ${pz.need.filter((r) => !g.has(r)).map((r) => T.byId[r].name).join(', ')}` : '🔒 Énigme bientôt disponible');
        return false;
      }
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

    // ---- shard counter + "something to buy" badge (G2.3) ----
    affordable() {
      const T = AMB.tree, g = AMB.game;
      return T.NODES.filter((n) => T.status(n.id) === 'available' && g.canAfford(n.cost));
    },
    renderCounter(gain) {
      const el = $('#lcdShards'), badge = $('#treeBtn .tree-badge');
      if (!AMB.game.path) { if (el) el.textContent = ''; if (badge) badge.hidden = true; return; }
      if (el) {
        el.textContent = `✧ ${AMB.game.s.shards}`;
        if (gain) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      }
      const n = this.affordable().length;
      if (badge) { badge.hidden = !n; badge.textContent = n; }
      const tb = $('#treeBtn'); if (tb) tb.title = n ? `${n} nœud${n > 1 ? 's' : ''} à débloquer dans l'arbre` : 'L\'arbre du jardin : ce que tu as débloqué et ce qui t\'attend';
    },

  });
})();
