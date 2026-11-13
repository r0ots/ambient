// « Jardin sonore » G10.1 : secrets — surprises found by playing, never listed in the tree (shown as « ??? »).
// Detection runs on bus events (live notes, forced chords) and user changes of the store; only in the
// path (free mode: nothing is detected nor shown). Rewards persist in game.s.secrets:
//   found {id: time}, midi (a MIDI keyboard was connected), gifts {timbres [{sec,opt}]}.
// S3.2 « secrets-clés »: a secret found OPENS A NODE of the tree (S4.6: the node is ready, game.ready, and the player opens
// it with « ✦ Ouvrir » like any other; here the LCD says « ✦ Secret : <titre> »). The secret -> node table is OPENS below (the only
// place; musical sense in parentheses):
//   tons -> Phrases (m.phrase)         dim -> Accords riches (h.pad2)    jazz -> Progression (h.prog, II-V-I)
//   lent -> Dérive (m.evolve)          pulse -> Tempo (m.tempo)          silence -> Salles (e.salle)
//   velo -> Mélodie écrite (c.seq)     chroma -> Gammes (h.scale)        cinq -> Enregistreur (t.rec)
// Rules: (1) missing prerequisites of the node are opened too (the musician's fast ramp); (2) S4.3: if the node is
// already owned, the secret opens the next node of the path instead (contracts.nextNode: the current challenge's),
// never a dead reward; (3) hint 2 opens after HINT2.found secrets found, never with time (no timer left).
// Two secrets also give a timbre (Givre, Aube); found timbres stay in the Melody / Pad « Son » list whatever the
// mode; until one is found the classic app is untouched, and free mode never detects nor shows anything.
// The MIDI-only secrets (Funambule, Entre les touches) show their hints once a MIDI keyboard has been connected.
// The panel lives inside the tree screen (#treeDlg), folded by default; free mode: hidden.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store, T = AMB.theory;

  // ---- definitions: S(id, title, hint1, hint2, reward, detect, node) ----
  // reward { gift? }; node = tree node that makes the secret reachable (hint 1 shows once owned); what it opens: OPENS
  // detect = { live(note, X), chord(c, X), param(k, v, X) } -> true when the gesture is complete; midi: needs a MIDI keyboard
  const S = (id, title, hint1, hint2, reward, detect, node, midi) => ({ id, title, hint1, hint2, reward, detect, node, midi: !!midi });
  const GIFT = {
    givre: { type: 'timbre', sec: 'bells', opt: 'Givre', label: 'timbre « Givre » (Mélodie)' },
    aube: { type: 'timbre', sec: 'pad', opt: 'Aube', label: 'timbre « Aube » (Pad)' },
  };
  const DEFS = [
    S('tons', 'Par tons', 'Cinq notes qui montent sans jamais se presser, un ton à chaque pas.',
      'Joue 5 notes de suite, chacune un ton entier (2 demi-tons) au-dessus de la précédente.', { gift: GIFT.givre },
      { live: (m, X) => !!X.tail(5) && X.ivs(5).every((i) => i === 2) }, 'm.bells'),
    S('dim', 'Arpège brisé', 'Des tierces mineures empilées, comme un escalier qui tourne en rond.',
      'Joue 4 notes d\'un arpège diminué : 3 demi-tons à chaque pas (en montant ou en descendant).', { gift: GIFT.aube },
      { live: (m, X) => !!X.tail(4) && (X.ivs(4).every((i) => i === 3) || X.ivs(4).every((i) => i === -3)) }, 'm.bells'),
    S('jazz', 'Deux, cinq, un', 'Trois accords qui se tiennent par la main et retombent sur leurs pieds.',
      'Force trois accords à la suite : II, V puis I (touches X, B puis Z).', {},
      { chord: (c, X) => X.chordsEnd([1, 4, 0]) }, 'h.pad'),
    S('lent', 'Lenteur céleste', 'Plus lent qu\'une marée, plus clair qu\'un matin, sans aucune pulsation.',
      'Tempo à 36 bpm ou moins, Halo à 95 % ou plus, Rythme en Flottant, tout en même temps.', {},
      { param: (k) => ['global.tempo', 'fx.shimmer', 'global.time'].includes(k) && store.get('global.tempo') <= 36 && store.get('fx.shimmer') >= 0.95 && store.get('global.time') === 'Flottant' }, 'e.halo'),
    S('pulse', 'Sur le battement', 'Huit pas, et pas un de travers.',
      'Joue 8 notes, une exactement sur chaque temps, pendant que la musique tourne.', {},
      { live: (m, X) => X.onBeat(8) }, 'm.bells'),
    S('silence', 'Mesure de silence', 'Écouter, c\'est aussi savoir tout éteindre, puis tout rallumer.',
      'Coupe toutes les couches pendant une mesure entière (la lecture continue), puis rallume-en une.', {},
      { param: (k, v, X) => X.silenceDone(k) }, 'm.bells'),
    S('velo', 'Funambule', 'Du plus fort au presque rien, puis encore tout en haut. Il faut des touches qui sentent la main.',
      'Au clavier MIDI : une note très forte, une note très douce, puis une très forte, à la suite.', {},
      { live: (m, X) => !!X.tail(3) && X.w[X.w.length - 3].raw >= 0.9 && X.w[X.w.length - 2].raw <= 0.35 && m.raw >= 0.9 }, 'm.bells', true), // raw MIDI velocity (null from the computer keyboard)
    S('chroma', 'Entre les touches', 'Il y a des notes entre les notes, et elles se laissent descendre ou monter.',
      'Au clavier MIDI : 6 notes de suite, une par demi-ton, en montant ou en descendant.', {},
      { live: (m, X) => !!X.tail(6) && (X.ivs(6).every((i) => i === 1) || X.ivs(6).every((i) => i === -1)) && X.out(6) >= 2 }, 'm.bells', true),
    S('cinq', 'Petite phrase', 'Une main qui se promène sans se presser.',
      'Joue 5 notes de suite au clavier (A à L), sans t\'arrêter plus de 2 secondes.', {},
      { live: (m, X) => !!X.tail(5) && X.gapsOk(5, 2) }, 'm.bells'),
  ];
  const byId = Object.fromEntries(DEFS.map((d) => [d.id, d]));
  const OPENS = { tons: 'm.phrase', dim: 'h.pad2', jazz: 'h.prog', lent: 'm.evolve', pulse: 'm.tempo', silence: 'e.salle', velo: 'c.seq', chroma: 'h.scale', cinq: 't.rec' };
  const HINT2 = { found: 2 }; // hint 2 opens after this many secrets found (no time)

  const secrets = {
    DEFS, byId, GIFT, HINT2, OPENS,
    w: [], chords: [], mem: {}, BASE: {},
    now: () => Date.now(), // overridable by tests

    // ---- persistent state (inside the game state; older saves get it lazily) ----
    state(g = AMB.game) {
      const s = g.s;
      if (!s.secrets) s.secrets = {};
      const q = s.secrets;
      q.found = q.found || {}; q.midi = !!q.midi;
      q.gifts = q.gifts || {}; q.gifts.timbres = q.gifts.timbres || []; // older saves: themes / mirror ignored
      return q;
    },
    // detection runs only in the path (also once the instrument is handed over: a musician's pleasure), never while a
    // Réponse waits for its answer (S4.2: the phrase and the notes played back are the Réponse's)
    active() { const g = AMB.game, P = AMB.puzzles; return !!g && g.path && !(P && P.busy()); },
    foundCount() { return Object.keys(this.state().found).length; },
    has(id) { return !!this.state().found[id]; },

    // ---- list for the tree's panel: [{id, found, title|'???', hint, level, node, reward}] ----
    // level 0 = hidden (node not owned, or a MIDI secret before any MIDI keyboard), 1 = cryptic hint, 2 = clear hint, 3 = found
    hint2Open() { return this.foundCount() >= HINT2.found; },
    list() {
      const g = AMB.game, q = this.state(), two = this.hint2Open();
      return DEFS.map((d) => {
        const found = !!q.found[d.id], reach = (!g.path || g.has(d.node)) && (!d.midi || q.midi);
        const level = found ? 3 : !reach ? 0 : two ? 2 : 1;
        return {
          id: d.id, found, title: found ? d.title : '???', node: d.node, level, midi: d.midi,
          hint: level === 3 || level === 2 ? d.hint2 : level === 1 ? d.hint1 : '',
          reward: found ? this.rewardText(d) : '',
        };
      });
    },

    rewardText(d) {
      const q = this.state().opened || {}, n = AMB.tree.byId[q[d.id] || OPENS[d.id]];
      return `${n.name} ouvert${d.reward.gift ? ' · ' + d.reward.gift.label : ''}`;
    },
    // make a node ready, with its missing prerequisites first (the queue opens them in that order: game.open)
    openChain(id, out) {
      const n = AMB.tree.byId[id], g = AMB.game; if (!n || g.has(id) || g.isReady(id)) return out;
      for (const r of n.req) this.openChain(r, out);
      if (g.ready(id)) out.push(id);
      return out;
    },
    // S4.6, older saves: a secret's node recorded but not open becomes ready
    migrate(g = AMB.game) {
      const q = g.s.secrets; if (!g.path || !q || !q.opened) return;
      for (const nid of Object.values(q.opened)) if (AMB.tree.byId[nid]) this.openChain(nid, []);
    },

    // ---- pattern detector helpers (relative intervals: independent of the key) ----
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
      for (const d of DEFS) {
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

    // ---- discovery ----
    find(id) {
      const d = byId[id], g = AMB.game; if (!d || !g.path || this.has(id)) return false;
      this.state().found[id] = this.now();
      this.giveGift(d.reward.gift);
      g.save();
      if (g.s.ended) { g.emit('secret', { id }); this.celebrate(d, null); return true; } // handed over: no node
      // its node, or (already owned) the next node of the path
      const own = OPENS[id], nid = g.has(own) || g.isReady(own) ? AMB.contracts && AMB.contracts.nextNode(g) : own;
      const node = nid && AMB.tree.byId[nid];
      if (node) { this.openChain(node.id, []); this.state().opened = { ...this.state().opened, [id]: node.id }; g.save(); }
      g.emit('secret', { id });
      this.celebrate(d, node);
      return true;
    },
    // node null = the instrument was handed over (or the whole tree owned): the LCD names the secret, the toast its gift
    celebrate(d, node) {
      const G = AMB.garden;
      if (G) { if (G.chime) G.chime('solve'); if (G.lcd) G.lcd(`✦ Secret : ${d.title}`, 6000); } // its node waits on « ✦ Ouvrir » (garden.js)
      const gift = d.reward.gift;
      if (AMB.ui && AMB.ui.toast) AMB.ui.toast(`✦ Secret trouvé : ${d.title}${node ? ` · ${node.name} prêt à ouvrir` : ''}${gift ? ' · ' + gift.label : ''}`);
      this.render();
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

    // ---- panel in the tree screen: « Secrets n/N » (path only), folded by default ----
    render() {
      const box = this.box; if (!box) return;
      const g = AMB.game;
      box.hidden = !g.path;
      if (box.hidden) return;
      const head = box.querySelector('.sc-head');
      head.textContent = `✦ Secrets ${this.foundCount()}/${DEFS.length}`;
      head.setAttribute('aria-expanded', String(!box.classList.contains('min')));
      const body = box.querySelector('.sc-body'); body.innerHTML = '';
      const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; body.append(e); return e; };
      for (const it of this.list()) {
        if (g.s.ended && !it.found) continue; // the instrument handed over (S3.7): only the secrets found stay
        const p = el('p', 'sc-item' + (it.found ? ' found' : '')); p.dataset.id = it.id;
        const b = document.createElement('b'), s = document.createElement('span');
        b.textContent = it.found ? `✦ ${it.title}` : '???';
        s.textContent = it.found ? `${it.hint} → ${it.reward}` : it.hint || (it.midi && AMB.game.has(it.node) ? 'Au clavier MIDI : branche-en un (bouton MIDI de la barre).' : 'Ouvre d\'abord le nœud lié.');
        p.append(b, s);
      }
    },
    build() {
      if (this.box || !document.body) return;
      const box = (this.box = document.createElement('section'));
      box.id = 'secrets'; box.className = 'secrets min'; box.hidden = true; box.setAttribute('aria-label', 'Secrets');
      box.innerHTML = '<button type="button" class="sc-head" aria-controls="secretsBody"></button><div class="sc-body" id="secretsBody"></div>';
      box.querySelector('.sc-head').addEventListener('click', () => { box.classList.toggle('min'); this.render(); });
      // inside the tree screen, above the legend (never floating over the app on mobile)
      const at = document.querySelector('#treeDlg .tree-legend');
      if (at) at.before(box); else document.body.append(box);
      this.render();
    },
  };
  for (const sec of ['bells', 'pad']) secrets.BASE[sec] = AMB.SCHEMA[sec].params.wave.options.slice();

  // ---- sources ----
  if (AMB.bus) {
    AMB.bus.on('live', (n) => secrets.onLive(n));
    AMB.bus.on('act', (id) => { if (id === 'midiConnect' && AMB.game.path && !secrets.state().midi) { secrets.state().midi = true; AMB.game.save(); secrets.render(); } });
    AMB.bus.on('chord', (c) => secrets.onChord(c));
    ['reset', 'mode'].forEach((e) => AMB.bus.on('game:' + e, () => { secrets.reset(); secrets.applyGifts(); secrets.render(); }));
    ['unlock', 'ready'].forEach((e) => AMB.bus.on('game:' + e, () => secrets.render()));
  }
  store.on((k, v, src) => { if (src === 'user') secrets.run('param', k, v); });
  AMB.secrets = secrets;
  secrets.migrate();
  secrets.applyGifts();
  document.addEventListener('DOMContentLoaded', () => {
    secrets.build();
    secrets.applyGifts(); // the « Son » selects exist now
  });
})();
