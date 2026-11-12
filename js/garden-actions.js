// « Jardin sonore » : discoveries — first use of a control or an action pays; the notebook.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const $ = (s) => document.querySelector(s);
  Object.assign(AMB.garden, {
    // ---- discoveries (G3.1): the first time you touch a control, it pays ----
    REWARD: { toggle: 3, select: 3, text: 3, knob: 2 },
    paramReward(key) {
      const sp = AMB.store.spec(key); if (!sp) return 0;
      return this.REWARD[sp.type || 'knob'] || 2;
    },
    paramLabel(key) {
      const [sec, k] = key.split('.'); const S = AMB.SCHEMA[sec]; if (!S) return key;
      const sp = S.params[k];
      return k === 'on' ? S.label : sp ? `${S.label} · ${sp.label}` : S.label;
    },
    onParam(key, v, source) {
      const g = AMB.game;
      if (source !== 'user' || !g.path || !AMB.tree.paramUnlocked(key)) return;
      g.discover('p:' + key, this.paramReward(key));
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
  });
})();
