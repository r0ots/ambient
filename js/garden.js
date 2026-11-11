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
      const shake = () => { if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } };
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
      // float just under the LCD (wherever the header layout puts it)
      const lcd = $('#lcd');
      if (lcd) { const r = lcd.getBoundingClientRect(); feed.style.top = `${Math.round(r.bottom + 6)}px`; feed.style.left = `${Math.round(r.left)}px`; feed.style.right = 'auto'; }
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
      // every action goes on the bus (discoveries count the first one, contracts count them all)
      const emit = (id) => AMB.bus.emit('act', id);
      document.addEventListener('click', (e) => {
        if (!AMB.game.path) return;
        const t = e.target.closest && e.target.closest('button, label, .moment'); if (!t) return;
        if (t.matches('.sc-slot')) return emit(e.shiftKey ? 'sceneStore' : 'sceneRecall');
        for (const [sel, id] of this.CLICKS) if (t.matches(sel)) return emit(id);
      }, true);
      const pre = $('#preset'); if (pre) pre.addEventListener('change', () => emit('preset'));
      if (AMB.bus) AMB.bus.on('act', (id) => this.act(id));
      // live playing (computer keyboard and MIDI) goes through these two sequencer calls
      const seq = AMB.seq, me = this;
      if (seq) {
        const fc = seq.forceChord, pm = seq.playMidi;
        seq.forceChord = function (...a) { emit('chord'); return fc.apply(this, a); };
        seq.playMidi = function (...a) { emit('note'); return pm.apply(this, a); };
      }
      AMB.store.on((k, v, src) => { if (src === 'xy') emit('xy'); });
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
    closePuzzle() { if (AMB.puzzles) AMB.puzzles.stop(); this.pz = null; const c = $('#puzzle'); if (c) c.hidden = true; },
    // hints grow with failed validations and time spent
    hintLevel() { const p = this.pz; if (!p) return 0; const t = (Date.now() - p.t0) / 1000; return p.fails >= 3 || t > 120 ? 2 : p.fails >= 1 || t > 45 ? 1 : 0; },
    hintText(sc) {
      const lvl = this.hintLevel(), off = sc.keys.filter((k) => k.s < 0.9).sort((a, b) => a.s - b.s);
      if (!off.length) return 'Tout y est : valide !';
      if (lvl === 0) return 'Écoute la cible, reviens à ton son, ajuste.';
      const word = (k) => {
        const sp = AMB.store.spec(k.key);
        if (sp.type) return 'essaie une autre option';
        return Number(k.value) < Number(k.target) ? 'plus haut' : 'plus bas';
      };
      if (lvl === 1) return `Le plus éloigné : ${this.paramLabel(off[0].key)}`;
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
        const c = $('#puzzle'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
        this.renderPuzzle();
      }
    },
    gainText(d) {
      if (d.reason === 'énigme' && AMB.puzzles && AMB.puzzles.byId[d.id]) return `+${d.n} ✧ énigme résolue : ${AMB.puzzles.byId[d.id].title}`;
      if (d.reason === 'contrat' && AMB.contracts && AMB.contracts.byId[d.id]) return `+${d.n} ✧ contrat rempli : ${AMB.contracts.byId[d.id].title}`;
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
      const pzc = $('#puzzle');
      if (pzc) {
        pzc.querySelector('.pz-x').addEventListener('click', () => this.closePuzzle());
        pzc.querySelector('.pz-ab').addEventListener('click', () => AMB.puzzles.listen(AMB.puzzles.side() === 'target' ? 'mine' : 'target'));
        pzc.querySelector('.pz-ok').addEventListener('click', () => this.validatePuzzle());
      }
      if (AMB.bus) {
        AMB.bus.on('game:puzzle', () => this.renderPuzzle());
        AMB.bus.on('game:mode', () => { if (!AMB.game.path) this.closePuzzle(); });
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
