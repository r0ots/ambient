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
      const all = this.notebook();
      $('#treeDlg .tree-shards').textContent = `✧ ${g.s.shards}`;
      const sub = $('#treeDlg .tree-sub'); if (sub) sub.textContent = `${g.s.nodes.length}/${T.NODES.length} nœuds · ${all.done}/${all.total} découvertes · ✧ ${g.s.earned} gagnés en tout`;
      map.innerHTML = '';
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

    // ---- discoveries (G3.1): the first time you touch a control, it pays ----
    REWARD: { toggle: 3, select: 3, text: 3, knob: 2 },
    paramReward(key) {
      const sp = AMB.store.spec(key); if (!sp) return 0;
      return this.REWARD[sp.type || 'knob'] || 2;
    },
    paramLabel(key) {
      const [sec, k] = key.split('.'); const S = AMB.SCHEMA[sec]; if (!S) return key;
      const sp = S.params[k];
      return k === 'on' ? S.label : sp && !sp.hidden ? `${S.label} · ${sp.label}` : S.label;
    },
    onParam(key, v, source) {
      const g = AMB.game;
      if (source !== 'user' || !g.path || !AMB.tree.paramUnlocked(key)) return;
      g.discover('p:' + key, this.paramReward(key));
    },
    // small "+n ✧" notes that float under the LCD, one per gain
    pop(text) {
      let feed = $('#gainFeed');
      if (!feed) { feed = document.createElement('div'); feed.id = 'gainFeed'; feed.className = 'gain-feed'; feed.setAttribute('aria-live', 'polite'); document.body.append(feed); }
      const it = document.createElement('div'); it.className = 'gain'; it.textContent = text;
      feed.append(it);
      while (feed.children.length > 4) feed.firstChild.remove();
      setTimeout(() => it.remove(), 3200);
    },
    // ---- action discoveries (G3.2): doing something for the first time pays too ----
    // id: [node that must be owned, reward, label]
    ACTS: {
      play: ['racine', 5, 'lancer le paysage'], note: ['m.bells', 5, 'jouer une note au clavier'],
      chord: ['h.pad', 5, 'forcer un accord (Z–M)'], xy: ['t.macros', 5, 'glisser sur l\'écran'],
      viz: ['t.viz', 3, 'changer de visuel'], listen: ['t.viz', 3, 'écoute plein écran'],
      keep: ['t.journal', 5, 'garder un moment'], restore: ['t.journal', 5, 'revenir à un moment'], save: ['t.journal', 5, 'sauver un patch'],
      rec: ['t.rec', 8, 'enregistrer'], share: ['t.share', 5, 'partager un lien'],
      dice: ['t.dice', 5, 'nouveau paysage'], preset: ['t.dice', 3, 'choisir un preset'],
      freeze: ['m.grains2', 8, 'figer le son'], sceneStore: ['m.scenes', 5, 'mémoriser une scène'], sceneRecall: ['m.scenes', 5, 'rappeler une scène'],
      suggest: ['h.prog', 5, 'suggérer une progression'], random: ['c.seq', 3, 'motif aléatoire'],
      section: ['c.song', 8, 'créer une section'], song: ['c.song', 8, 'jouer le morceau'],
      midiExport: ['c.midi', 5, 'exporter en MIDI'], midiConnect: ['c.midi', 3, 'connecter un clavier MIDI'],
      reclive: ['c.motifs', 8, 'Rec live'],
    },
    // clicks that count as an action (checked in the capture phase, before any handler runs)
    CLICKS: [
      ['#play, #bigPlay', 'play'], ['#vizMode', 'viz'], ['#listen', 'listen'],
      ['#keepMoment', 'keep'], ['.moment', 'restore'], ['#save', 'save'], ['#rec', 'rec'], ['#share', 'share'], ['#dice', 'dice'],
      ['.sc-store', 'sceneStore'], ['[data-c=random]', 'suggest'], ['.roll-wrap [data-act=random]', 'random'],
      ['[data-s=add]', 'section'], ['[data-s=play]', 'song'], ['#exportMidi, .roll-wrap [data-act=midi]', 'midiExport'], ['#midi', 'midiConnect'],
      ['[data-act=liverec]', 'reclive'],
    ],
    act(id) {
      const a = this.ACTS[id], g = AMB.game;
      if (!a || !g.path || !g.has(a[0])) return false;
      return g.discover('a:' + id, a[1]);
    },
    hookActions() {
      document.addEventListener('click', (e) => {
        if (!AMB.game.path) return;
        const t = e.target.closest && e.target.closest('button, label, .moment'); if (!t) return;
        if (t.matches('.sc-slot')) return this.act(e.shiftKey ? 'sceneStore' : 'sceneRecall');
        for (const [sel, id] of this.CLICKS) if (t.matches(sel)) return this.act(id);
      }, true);
      const pre = $('#preset'); if (pre) pre.addEventListener('change', () => this.act('preset'));
      if (AMB.bus) AMB.bus.on('act', (id) => this.act(id));
      // live playing (computer keyboard and MIDI) goes through these two sequencer calls
      const seq = AMB.seq, me = this;
      if (seq) {
        const fc = seq.forceChord, pm = seq.playMidi;
        seq.forceChord = function (...a) { me.act('chord'); return fc.apply(this, a); };
        seq.playMidi = function (...a) { me.act('note'); return pm.apply(this, a); };
      }
      AMB.store.on((k, v, src) => { if (src === 'xy') this.act('xy'); });
    },
    // ---- discovery notebook (G3.3) ----
    // every discoverable thing: visible controls and actions, each tied to a node (hence a branch)
    discoverables() {
      if (this._disc) return this._disc;
      const T = AMB.tree, out = [];
      for (const k of T.allKeys()) {
        const sp = AMB.store.spec(k), node = T.nodeFor(k);
        if (!sp || sp.hidden || !node) continue;
        out.push({ id: 'p:' + k, node, label: this.paramLabel(k) });
      }
      for (const [id, [node, , label]] of Object.entries(this.ACTS)) out.push({ id: 'a:' + id, node, label });
      return (this._disc = out);
    },
    notebook(branch) {
      const T = AMB.tree, g = AMB.game, found = new Set(g.s.found);
      const items = this.discoverables().filter((x) => !branch || T.byId[x.node].branch === branch);
      const done = items.filter((x) => found.has(x.id));
      const todo = items.filter((x) => !found.has(x.id) && g.has(x.node)); // waiting, already within reach
      return { total: items.length, done: done.length, todo };
    },
    gainText(d) {
      if (d.reason === 'découverte' && d.id && d.id.startsWith('a:')) { const a = this.ACTS[d.id.slice(2)]; return `+${d.n} ✧ découverte : ${a ? a[2] : d.id}`; }
      if (d.reason === 'découverte' && d.id && d.id.startsWith('p:')) return `+${d.n} ✧ découverte : ${this.paramLabel(d.id.slice(2))}`;
      return `+${d.n} ✧ ${d.reason || ''}`;
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
