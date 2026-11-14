// « Découvertes » (S5.10): ONE system for everything the player finds by playing, never listed in the tree (« ??? »).
// Two kinds, one discovery each, found once, saved, celebrated (garden.fx('discovery', {name}): huge):
//   - COMBOS (S8.7): the huge combos of js/city-combos.js (its table COMBOS: two or three knobs pushed together, held
//     until the charge is full). A combo's FIRST « SUPER ! » is its discovery (`superCombo`, called by city-combos); the
//     combo itself is the instrument's (free mode too), only the discovery and its node are the Parcours'. `gate` (set
//     here) keeps a combo out of reach in the Parcours until its nodes are owned.
//   - GESTES: the former secrets (G10.1–S4.6): a musical gesture, detected on the bus (live notes, forced chords, user
//     changes of the store). They have no lasting effect; two give a timbre (Givre, Aube).
// Some discoveries make a node READY (table OPENS, the only one): its missing prerequisites too; if it is already owned,
// the next node of the path (contracts.nextNode) instead, never a dead reward. Path only: free mode finds and shows
// nothing. Never while a Réponse waits for its answer (S4.2) for the gestures.
// Saved in game.s.secrets (the field keeps its old name: older saves' secrets found ARE discoveries found; the 15 small
// combos of S5.10 found in an older save count as the huge combo that replaced them, table RENAMED):
//   found {id: time}, midi (a MIDI keyboard was connected), gifts {timbres [{sec, opt}]}, opened {id: node}.
// The notebook (« Découvertes n/N ») lives in the tree screen: found ones (name, effect, reward), then the others as
// « ??? » with their hint (the riddles); the clear hint of a gesture opens after HINT2.found discoveries.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;

  const GIFT = {
    givre: { type: 'timbre', sec: 'bells', opt: 'Givre', label: 'timbre « Givre » (Mélodie auto)' },
    aube: { type: 'timbre', sec: 'pad', opt: 'Aube', label: 'timbre « Aube » (Pad)' },
  };

  // ---- COMBOS (S8.7): the table of js/city-combos.js (loaded before), as discoveries
  const CC = AMB.cityCombos;
  const COMBOS = (CC ? CC.COMBOS : []).map((c) => ({ id: c.id, kind: 'combo', name: c.name, need: c.need, hint: c.hint, effect: c.effect, n: c.n }));
  // the 15 small combos of S5.10 (older saves) → the huge combo that replaced each of them
  const RENAMED = { monolithe: 'orage', blizzard: 'orage', constellation: 'hyper', portail: 'hyper', grille: 'hyper', vhs: 'wire', soleil: 'wire', quintes: 'wire',
    reseau: 'bouchon', maree: 'aurore', cathedrale: 'aurore', brume: 'kaiju', kaleido: 'disco', eclipse: 'disco', miroir: 'miroir' };

  // ---- GESTES (the former secrets): G(id, name, hint, hint2 (clear, after HINT2), reward, detect, need, midi) ----
  // detect = { live(note, D), chord(c, D), param(k, v, D) } -> true when the gesture is complete; midi: needs a MIDI keyboard
  const G = (id, name, hint, hint2, reward, detect, need, midi) => ({ id, kind: 'geste', name, hint, hint2, reward, detect, need: [need], midi: !!midi });
  const GESTES = [
    G('tons', 'Par tons', 'Cinq notes qui montent sans jamais se presser, un ton à chaque pas.',
      'Joue 5 notes de suite, chacune un ton entier (2 demi-tons) au-dessus de la précédente.', { gift: GIFT.givre },
      { live: (m, D) => !!D.tail(5) && D.ivs(5).every((i) => i === 2) }, 'm.bells'),
    G('dim', 'Arpège brisé', 'Des tierces mineures empilées, comme un escalier qui tourne en rond.',
      'Joue 4 notes d\'un arpège diminué : 3 demi-tons à chaque pas (en montant ou en descendant).', { gift: GIFT.aube },
      { live: (m, D) => !!D.tail(4) && (D.ivs(4).every((i) => i === 3) || D.ivs(4).every((i) => i === -3)) }, 'm.bells'),
    G('jazz', 'Deux, cinq, un', 'Trois accords qui se tiennent par la main et retombent sur leurs pieds.',
      'Force trois accords à la suite : II, V puis I ({touches X, B puis Z|appui long sur les pastilles 2, 5 puis 1}).', {},
      { chord: (c, D) => D.chordsEnd([1, 4, 0]) }, 'h.pad'),
    G('lent', 'Lenteur céleste', 'Plus lent qu\'une marée, plus clair qu\'un matin, sans aucune pulsation.',
      'Tempo à 36 bpm ou moins, Halo à 95 % ou plus, Rythme en Flottant, tout en même temps.', {},
      { param: (k) => ['global.tempo', 'fx.shimmer', 'global.time'].includes(k) && store.get('global.tempo') <= 36 && store.get('fx.shimmer') >= 0.95 && store.get('global.time') === 'Flottant' }, 'e.halo'),
    G('pulse', 'Sur le battement', 'Huit pas, et pas un de travers.',
      'Joue 8 notes, une exactement sur chaque temps, pendant que la musique tourne.', {},
      { live: (m, D) => D.onBeat(8) }, 'm.bells'),
    G('silence', 'Mesure de silence', 'Écouter, c\'est aussi savoir tout éteindre, puis tout rallumer.',
      'Coupe toutes les couches pendant une mesure entière (la lecture continue), puis rallume-en une.', {},
      { param: (k, v, D) => D.silenceDone(k) }, 'm.bells'),
    G('velo', 'Funambule', 'Fort, presque rien, puis fort encore. Il faut des touches qui sentent la force de la main.',
      'Au clavier MIDI : une note frappée très fort, une effleurée très doucement, puis une très fort, à la suite (la hauteur ne compte pas).', {},
      { live: (m, D) => !!D.tail(3) && D.w[D.w.length - 3].raw >= 0.9 && D.w[D.w.length - 2].raw <= 0.35 && m.raw >= 0.9 }, 'm.bells', true), // raw MIDI velocity (null from the computer keyboard)
    G('chroma', 'Entre les touches', 'Six marches, toutes les plus petites possibles, sans en sauter une seule : les noires comptent aussi.',
      'Au clavier MIDI : 6 notes de suite, chacune la touche voisine (blanches et noires), en montant ou en descendant. La molette de hauteur ne compte pas.', {},
      { live: (m, D) => !!D.tail(6) && (D.ivs(6).every((i) => i === 1) || D.ivs(6).every((i) => i === -1)) && D.out(6) >= 2 }, 'm.bells', true),
    G('cinq', 'Petite phrase', 'Autant de notes que de doigts, d\'une seule respiration.',
      'Joue 5 notes d\'affilée, jamais plus de 2 secondes de silence entre deux.', {},
      { live: (m, D) => !!D.tail(5) && D.gapsOk(5, 2) }, 'm.bells'),
  ];
  const ALL = COMBOS.concat(GESTES);
  const byId = Object.fromEntries(ALL.map((d) => [d.id, d]));
  // THE table: discovery -> the node it makes ready (former secrets unchanged; S8.7: each huge combo opens a node of
  // its world — or, owned already, the next node of the path)
  const OPENS = {
    tons: 'm.phrase', dim: 'h.pad2', jazz: 'h.prog', lent: 'm.evolve', pulse: 'm.tempo', silence: 'e.salle', velo: 'c.seq', chroma: 'h.scale', cinq: 't.rec',
    orage: 'e.texture', hyper: 'm.lfo', wire: 't.viz', bouchon: 'm.grains', aurore: 'e.halo', kaiju: 'h.drone', disco: 'c.rythme', miroir: 'e.tape',
  };
  const HINT2 = { found: 2 }; // the clear hint of a gesture opens after this many discoveries (no time)

  const D = {
    COMBOS, GESTES, ALL, byId, GIFT, HINT2, OPENS, RENAMED,
    w: [], chords: [], mem: {}, BASE: {},
    now: () => Date.now(), // overridable by tests

    // ---- persistent state (inside the game state; older saves get it lazily) ----
    state(g = AMB.game) {
      const s = g.s;
      if (!s.secrets) s.secrets = {};
      const q = s.secrets;
      q.found = q.found || {}; q.midi = !!q.midi;
      q.gifts = q.gifts || {}; q.gifts.timbres = q.gifts.timbres || []; // older saves: themes / mirror ignored
      for (const [o, n] of Object.entries(RENAMED)) if (o !== n && byId[n]) { // S8.7: the combos of S5.10 found → their huge combo
        if (q.found[o] != null) { if (q.found[n] == null) q.found[n] = q.found[o]; delete q.found[o]; }
        if (q.opened && q.opened[o] != null) { if (q.opened[n] == null) q.opened[n] = q.opened[o]; delete q.opened[o]; }
      }
      return q;
    },
    // gestures: path only (also once the instrument is handed over), never while a Réponse waits for its answer
    active() { const g = AMB.game, P = AMB.puzzles; return !!g && g.path && !(P && P.busy()); },
    foundCount() { const f = this.state().found; return ALL.filter((d) => f[d.id]).length; },
    has(id) { return !!this.state().found[id]; },
    reach(d, g = AMB.game) { return (!g.path || d.need.every((n) => g.has(n))) && (!d.midi || this.state().midi); },

    // ---- the notebook's list: [{id, kind, found, name|'???', hint, level, effect, reward, need}] ----
    // level 0 = out of reach (its nodes not owned yet, or a MIDI gesture before any keyboard), 1 = hint, 2 = clear hint
    // (gestures, after HINT2.found discoveries), 3 = found
    hint2Open() { return this.foundCount() >= HINT2.found; },
    list() {
      const q = this.state(), two = this.hint2Open();
      return ALL.map((d) => {
        const found = !!q.found[d.id], level = found ? 3 : !this.reach(d) ? 0 : two && d.hint2 ? 2 : 1;
        return {
          id: d.id, kind: d.kind, found, name: found ? d.name : '???', level, midi: d.midi, need: d.need,
          hint: level >= 2 && d.hint2 ? d.hint2 : level ? d.hint : '',
          effect: found && d.effect ? d.effect : '', reward: found ? this.rewardText(d) : '',
        };
      });
    },
    rewardText(d) {
      const q = this.state().opened || {}, n = AMB.tree.byId[q[d.id] || OPENS[d.id]], gift = d.reward && d.reward.gift;
      return [n ? `${n.name} ouvert` : '', gift ? gift.label : ''].filter(Boolean).join(' · ');
    },
    // S4.6, older saves: a discovery's node recorded but not open becomes ready
    migrate(g = AMB.game) {
      const q = g.s.secrets; if (!g.path || !q || !q.opened) return;
      for (const nid of Object.values(q.opened)) if (AMB.tree.byId[nid]) g.readyChain(nid);
    },

    // ---- COMBOS (S8.7): a combo's first SUPER (js/city-combos.js) = its discovery; true when it is new (celebrated)
    superCombo(id) {
      const d = byId[id], g = AMB.game;
      if (!d || d.kind !== 'combo' || !g || !g.path || this.has(id) || !this.reach(d, g)) return false;
      return this.find(id);
    },

    // ---- GESTES: pattern detector helpers (relative intervals: independent of the key) ----
    reset() { this.w = []; this.chords = []; this.mem = {}; },
    tail(n) { return this.w.length >= n ? this.w.slice(-n) : null; },
    ivs(n) { const t = this.w.slice(-n); return t.slice(1).map((x, i) => x.midi - t[i].midi); },
    gapsOk(n, maxGap) { const t = this.w.slice(-n); return t.slice(1).every((x, i) => x.time - t[i].time <= maxGap); },
    out(n) { // how many of the last n notes are outside the current scale
      const sc = (AMB.seq && AMB.seq.scale) || [], root = (AMB.seq && AMB.seq.root) || 0;
      return this.w.slice(-n).filter((x) => !sc.includes((((x.midi - root) % 12) + 12) % 12)).length;
    },
    chordsEnd(degs) {
      const t = this.chords.slice(-degs.length);
      return t.length === degs.length && t.every((c, i) => c.deg === degs[i] && (!i || c.at - t[i - 1].at <= 20000));
    },
    // rhythm: n notes on n successive beats of the running pulse
    beat() { return 60 / store.get('global.tempo'); },
    beatOffset(t) { // seconds from t to the nearest beat of the sequencer's clock (null if stopped)
      const q = AMB.seq; if (!q || !q.playing || !(q.nextTime > 0)) return null;
      const b = this.beat(), d = (((t - q.nextTime) % b) + b) % b;
      return d > b / 2 ? d - b : d;
    },
    onBeat(n, tol = 0.065) {
      const t = this.tail(n); if (!t) return false;
      const b = this.beat();
      for (let i = 0; i < n; i++) {
        const o = this.beatOffset(t[i].time);
        if (o === null || Math.abs(o) > tol) return false;
        if (i && Math.abs(t[i].time - t[i - 1].time - b) > 0.12) return false; // successive beats, none skipped
      }
      return true;
    },
    // silence: every reachable layer off for a full bar while playing, then one switched back on
    toggles() {
      const out = [];
      for (const [sec, o] of Object.entries(AMB.SCHEMA)) {
        const sp = o.params.on; if (sec === 'auto' || !sp || sp.type !== 'toggle') continue;
        if (AMB.tree && AMB.game.path && !AMB.tree.paramUnlocked(`${sec}.on`)) continue;
        out.push(`${sec}.on`);
      }
      return out;
    },
    silenceDone(k) {
      if (!/\.on$/.test(k) || !(AMB.seq && AMB.seq.playing)) return false;
      const m = (this.mem.silence = this.mem.silence || { since: 0 }), ks = this.toggles();
      if (ks.length < 2) return false;
      if (ks.every((x) => !store.get(x))) { if (!m.since) m.since = this.now(); return false; }
      const long = m.since && this.now() - m.since >= AMB.seq.stepDur() * 16 * 1000;
      m.since = 0;
      return !!long;
    },

    // ---- event routing ----
    run(ev, ...a) {
      if (!this.active()) return;
      for (const d of GESTES) {
        const fn = d.detect[ev];
        if (!fn || this.has(d.id)) continue;
        if (fn(...a, this) === true) this.find(d.id);
      }
    },
    onLive(n) {
      if (!this.active()) return;
      const last = this.w[this.w.length - 1];
      if (last && n.time - last.time > 3) this.w = []; // a phrase: a long pause starts a new one
      this.w.push({ midi: n.midi, time: n.time, vel: n.vel, raw: n.raw == null ? null : n.raw });
      if (this.w.length > 16) this.w.shift();
      this.run('live', n);
    },
    onChord(c) {
      if (!this.active() || !c.forced) return; // only chords the player forces, not the natural progression
      this.chords.push({ deg: c.deg, at: this.now() });
      if (this.chords.length > 6) this.chords.shift();
      this.run('chord', c);
    },

    // ---- a discovery: saved, its gift, its node ready, the biggest moment of the juice table ----
    find(id) {
      const d = byId[id], g = AMB.game; if (!d || !g.path || this.has(id)) return false;
      this.state().found[id] = this.now();
      this.giveGift(d.reward && d.reward.gift);
      g.save();
      let node = null;
      if (!g.s.ended && OPENS[id]) { // handed over: no node
        const own = OPENS[id], nid = g.has(own) || g.isReady(own) ? AMB.contracts && AMB.contracts.nextNode(g) : own;
        node = nid && AMB.tree.byId[nid];
        if (node) { g.readyChain(node.id); this.state().opened = { ...this.state().opened, [id]: node.id }; g.save(); }
      }
      g.emit('discovery', { id });
      this.celebrate(d, node);
      return true;
    },
    celebrate(d, node) {
      const GD = AMB.garden, gift = d.reward && d.reward.gift; // the juice table (S5.9 FX.discovery); its node waits on « ✦ Ouvrir »
      if (GD && GD.fx) GD.fx('discovery', { name: d.name, ms: 6000, boom: d.kind === 'combo' ? 'SUPER!' : undefined, toast: `✦ Découverte : ${d.name}${node ? ` · ${node.name} prêt à ouvrir` : ''}${gift ? ' · ' + gift.label : ''}` });
      this.render(true);
    },
    giveGift(gift) {
      if (!gift) return;
      const q = this.state(), gf = q.gifts;
      if (!gf.timbres.some((t) => t.opt === gift.opt)) gf.timbres.push({ sec: gift.sec, opt: gift.opt });
      this.applyGifts();
    },
    // make the stored gifts real: extra timbre options in the schema (+ live selects)
    applyGifts() {
      const gf = this.state().gifts;
      for (const t of gf.timbres) {
        const sp = AMB.SCHEMA[t.sec] && AMB.SCHEMA[t.sec].params.wave;
        if (sp && !sp.options.includes(t.opt)) sp.options.push(t.opt); // appended: existing option indexes (shared links) never move
        document.querySelectorAll(`.ctl[data-key="${t.sec}.wave"] select`).forEach((s) => {
          if (![...s.options].some((o) => o.value === t.opt)) { const op = document.createElement('option'); op.value = t.opt; op.textContent = t.opt; s.append(op); }
        });
      }
      // timbres no longer owned (path restarted): back to the classic list
      for (const [sec, base] of Object.entries(this.BASE)) {
        const sp = AMB.SCHEMA[sec].params.wave;
        for (const o of sp.options.slice()) {
          if (base.includes(o) || gf.timbres.some((t) => t.opt === o)) continue;
          sp.options.splice(sp.options.indexOf(o), 1);
          document.querySelectorAll(`.ctl[data-key="${sec}.wave"] option`).forEach((e) => { if (e.value === o) e.remove(); });
          if (store.get(`${sec}.wave`) === o) store.set(`${sec}.wave`, sp.def, 'game');
        }
      }
    },

    // ---- the notebook in the tree screen: « ✦ Découvertes n/N » (path only), folded by default ----
    render(fresh) {
      const box = this.box; if (!box) return;
      const g = AMB.game;
      box.hidden = !g.path;
      if (box.hidden) return;
      const head = box.querySelector('.dc-head');
      head.textContent = `✦ Découvertes ${this.foundCount()}/${ALL.length}`;
      head.setAttribute('aria-expanded', String(!box.classList.contains('min')));
      head.classList.toggle('fresh', !!fresh || head.classList.contains('fresh'));
      const body = box.querySelector('.dc-body'); body.innerHTML = '';
      const L = this.list(), items = L.filter((x) => x.found).concat(g.s.ended ? [] : L.filter((x) => !x.found)); // found first; handed over: found only
      for (const it of items) {
        const p = document.createElement('p'); p.className = 'dc-item' + (it.found ? ' found' : ' riddle') + (it.kind === 'combo' ? ' combo' : ''); p.dataset.id = it.id;
        const b = document.createElement('b'), s = document.createElement('span');
        b.textContent = it.found ? `✦ ${it.name}` : '???';
        if (it.found) s.textContent = [it.effect, it.reward].filter(Boolean).join(' → ') || 'trouvée';
        else s.textContent = AMB.game.txt(it.hint) || (it.midi && this.reach({ need: it.need }) ? 'Au clavier MIDI : branche-en un (bouton MIDI de la barre).' : `Plus loin : ${it.need.filter((n) => !g.has(n)).map((n) => AMB.tree.byId[n].name).join(', ')}.`);
        p.append(b, s); body.append(p);
      }
      // S7.3: a discovery found since the notebook was last seen is revealed in a glitch, once it is seen (the Arbre open)
      const M = AMB.motion, seen = !box.classList.contains('min') && !!box.offsetParent;
      if (!this.known) this.known = new Set(L.filter((x) => x.found).map((x) => x.id)); // (a loaded save reveals nothing)
      if (seen) for (const it of L) if (it.found && !this.known.has(it.id)) {
        this.known.add(it.id);
        const el = body.querySelector(`.dc-item[data-id="${it.id}"]`);
        if (el && M && M.pop(el, 'dc-reveal', { ms: M.ms('slow') * 2 })) M.burst(el.querySelector('b'), { n: 16, spread: Math.PI * 2, color: it.kind === 'combo' ? '#5ff0ff' : '#fff36b' });
      }
    },
    build() {
      if (this.box || !document.body) return;
      const box = (this.box = document.createElement('section'));
      box.id = 'discoveries'; box.className = 'discoveries min'; box.hidden = true; box.setAttribute('aria-label', 'Découvertes');
      box.innerHTML = '<button type="button" class="dc-head" aria-controls="discoveriesBody"></button><div class="dc-body" id="discoveriesBody"></div>';
      box.querySelector('.dc-head').addEventListener('click', () => {
        box.classList.toggle('min'); box.querySelector('.dc-head').classList.remove('fresh'); this.render();
        if (!box.classList.contains('min') && AMB.motion) AMB.motion.stagger(box.querySelector('.dc-body').children, { y: 12, max: 12 }); // S7.3: unfolds in a cascade
      });
      // inside the tree screen, above the legend (never floating over the app on mobile)
      const at = document.querySelector('#treeDlg .tree-legend');
      if (at) at.before(box); else document.body.append(box);
      this.render();
    },
  };
  for (const sec of ['bells', 'pad']) D.BASE[sec] = AMB.SCHEMA[sec].params.wave.options.slice();

  // ---- sources ----
  if (AMB.bus) {
    AMB.bus.on('live', (n) => n && D.onLive(n));
    AMB.bus.on('act', (id) => { if (id === 'midiConnect' && AMB.game.path && !D.state().midi) { D.state().midi = true; AMB.game.save(); D.render(); } });
    AMB.bus.on('chord', (c) => c && D.onChord(c));
    ['reset', 'mode'].forEach((e) => AMB.bus.on('game:' + e, () => { D.reset(); D.known = null; D.applyGifts(); D.render(); }));
    ['unlock', 'ready'].forEach((e) => AMB.bus.on('game:' + e, () => D.render()));
  }
  store.on((k, v, src) => { if (src === 'user') D.run('param', k, v); });
  // in the Parcours, a combo waits for its nodes (free mode: always, it is the instrument's)
  if (CC) CC.gate = (c) => { const g = AMB.game; return !g || !g.path || D.reach(byId[c.id] || c, g); };
  AMB.discoveries = D;
  D.migrate();
  D.applyGifts();
  document.addEventListener('DOMContentLoaded', () => {
    D.build();
    D.applyGifts(); // the « Son » selects exist now
  });
})();
