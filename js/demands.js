// « Demandes en direct » (S5.5, after Fuser): while the instrument plays in the path, the landscape now and then ASKS for
// a musical move, judged on the time: « Fais entrer la basse sur le 1 », « Force l'accord IV sur le 1 », « Joue 3 notes
// dans le temps », « Monte la Lumière avant la fin de la mesure »… One at a time, on the LCD's 2nd line, with a countdown
// in musical time (« dans 2 mesures », then the beats 4, 3, 2, 1, then « MAINTENANT »). Judged on the placement:
// PARFAIT (within the Réponse's tolerance), BIEN (within a beat), RATÉ (within two beats, or a hold let go too soon);
// further away a gesture is not judged. Successes in a row = a combo ×n. Missed or ignored: nothing is lost, the music
// goes on. Only on controls already open. Two sources, one judge:
//   - the challenges kind 'demande' of js/contracts.js (the former static interface challenges: turn this knob, change
//     that mode); asked first; PARFAIT or BIEN make their node ready (contracts.finish), MISSES misses make it ready
//     anyway (never a dead end);
//   - FREE below: musical asks for the fun and the combo; the first one after an opening introduces what it opened
//     (« Nouveau : … »).
// Never during a Réponse phrase (each waits for the other), while a node waits for « ✦ Ouvrir » (an ask in progress goes
// when a node becomes ready elsewhere), during a placement party (S5.4), during the Rec live, in
// free mode, once the instrument is handed over. Pace: at least 4 bars of music between two asks (4 to 8, more when they
// are ignored). Judged on the sequencer's grid (`onStep`), the gestures at the time they were heard (seq.playedAt).
// The juice: garden.fx('parfait' | 'bien' | 'rate', {n: combo}). Saved: game.s.dem {combo, best, miss {challenge: n}}.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const GAP = [4, 8]; // bars of music between two asks (random in between)
  const RETRY = 4; // bars before a missed challenge is asked again
  const LEAD = 2; // bars of countdown before the 1 (an ask 'by': one bar, then the bar to do it in)
  const MISSES = 4; // a challenge missed this many times is ready anyway
  const PARTY = 2; // bar lines left alone after a placement party (S5.4), even when its queue is empty
  const LAYERS = ['pad', 'bells', 'grains', 'texture', 'seq', 'bass', 'perc'];
  const open = (k) => !AMB.tree || AMB.tree.paramUnlocked(k);
  const on = (l) => !!store.get(l + '.on') && open(l + '.on');

  // ---- FREE asks: F(id, need (nodes of the controls it uses), title, ask, hint, intro). `ask` as in contracts.js (Dm):
  // how 'hit' (on the 1) | 'by' (before the end of the bar; bars = how many) | 'notes' (n notes on the beats from the 1) |
  // 'hold' (a state reached on the 1 and held `bars` bars); param / v / src, act, chord (degree, or 'any': a chord forced
  // by the player); ok() = it makes sense now (the bass to bring in is off…). ----
  const F = (id, need, title, ask, hint, intro) => ({ id, need, title, ask, hint, intro });
  const FREE = [
    F('accord', ['h.pad'], 'Force un accord sur le 1', { how: 'hit', chord: 'any' },
      'Une touche de Z à M, ou un appui long sur une pastille, pile sur le 1.', 'Nouveau : essaie le Pad, force un accord sur le 1'),
    F('iv', ['h.pad'], 'Force l\'accord IV sur le 1', { how: 'hit', chord: 3 },
      'L\'accord IV : la touche V, ou un appui long sur la 4e pastille, pile sur le 1.'),
    F('notes', ['m.bells'], 'Joue 3 notes dans le temps', { how: 'notes', n: 3 },
      'À partir du 1, trois notes sur les temps (pastilles, A à L ou MIDI), comme on tape du pied.', 'Nouveau : joue 3 notes dans le temps'),
    F('melodie', ['m.bells'], 'Fais revenir la Mélodie auto sur le 1', { how: 'hit', param: 'bells.on', v: (v) => !!v, ok: () => !store.get('bells.on') },
      'Sculpter > Mélodie auto > On, pile sur le 1.'),
    F('seul', ['h.pad'], 'Coupe tout sauf le drone sur le 1, pendant 2 mesures', {
      how: 'hold', param: '*.on', bars: 2, hold: () => on('drone') && !LAYERS.some(on), ok: () => on('drone') && LAYERS.some(on),
    }, 'Éteins les autres couches (On) pour que le drone chante seul à partir du 1, puis laisse-le 2 mesures.'),
    F('lumiere', ['t.macros'], 'Monte la Lumière avant la fin de la mesure', { how: 'by', param: 'macro.light', src: ['user', 'sync'], v: (v) => v >= 0.75, ok: () => store.get('macro.light') < 0.6 },
      'Écouter > Lumière vers la droite (ou glisse à droite sur l\'écran), au-dessus de 75.'),
    F('montee', ['t.macros'], 'Fais une montée : Densité au max en 2 mesures', { how: 'by', bars: 2, param: 'macro.density', src: ['user', 'sync'], v: (v) => v >= 0.95, ok: () => store.get('macro.density') < 0.7 },
      'Écouter > Densité tout en haut (ou glisse vers le haut de l\'écran) avant la fin de la 2e mesure.', 'Nouveau : fais une montée, Densité au max en 2 mesures'),
    F('tonalite', ['h.key'], 'Change de tonalité sur le 1', { how: 'hit', param: 'global.key' },
      'Sculpter > Global > Tonalité, pile sur le 1 : tout le paysage bascule.', 'Nouveau : change de tonalité sur le 1'),
    F('grains', ['m.grains'], 'Fais entrer les grains sur le 1', { how: 'hit', param: 'grains.on', v: (v) => !!v, ok: () => !store.get('grains.on') },
      'Sculpter > Grains > On, pile sur le 1.', 'Nouveau : fais entrer les grains sur le 1'),
    F('texture', ['e.texture'], 'Fais entrer la texture sur le 1', { how: 'hit', param: 'texture.on', v: (v) => !!v, ok: () => !store.get('texture.on') },
      'Sculpter > Texture > On, pile sur le 1.', 'Nouveau : fais entrer la texture sur le 1'),
    F('basse', ['c.rythme'], 'Fais entrer la basse sur le 1', { how: 'hit', param: 'bass.on', v: (v) => !!v, ok: () => !store.get('bass.on') },
      'Composer > Basse > On, pile sur le 1.', 'Nouveau : fais entrer la basse sur le 1'),
    F('fige', ['m.grains2'], 'Fige le son sur le 1', { how: 'hit', act: 'freeze' },
      '❄ Figer (ou Entrée), pile sur le 1.', 'Nouveau : fige le son sur le 1'),
  ];
  const byId = Object.fromEntries(FREE.map((f) => [f.id, f]));
  const keyIs = (p, k) => p === k || (p.endsWith('*') && k.startsWith(p.slice(0, -1))) || (p.startsWith('*') && k.endsWith(p.slice(1)));
  const mod = (d, n) => ((d % n) + n) % n;

  const D = {
    FREE, byId, GAP, RETRY, LEAD, MISSES,
    cur: null, // the ask in progress: { id, gate (challenge id), d, text, hint, how, T (step of the 1), tT, sd, until, got [], onset }
    wait: 2, // bar lines to let pass before the next ask
    ignored: 0, // asks left alone in a row (the next ones come more rarely)
    fresh: null, // a node just opened: the next ask introduces it
    last: null, // id of the last ask (never the same twice in a row)
    now() { const c = AMB.engine && AMB.engine.ctx; return c ? c.currentTime : 0; },
    at() { return AMB.seq && AMB.seq.playedAt && AMB.engine && AMB.engine.ctx ? AMB.seq.playedAt(null) : this.now(); }, // when the player did it (heard)
    st(g = AMB.game) { const s = g.s.dem || (g.s.dem = {}); s.combo = s.combo | 0; s.best = s.best | 0; s.miss = s.miss || {}; return s; },
    busy() { return !!this.cur; },
    // path only, playing, nothing else in the way (a Réponse, a node waiting to be opened, the Rec live)
    can(g = AMB.game) {
      const P = AMB.puzzles, R = AMB.pianoRoll && AMB.pianoRoll.roll;
      return !!g && g.counts() && !!(AMB.seq && AMB.seq.playing) && !(P && P.busy()) && !g.nextReady() && !(R && R.recording);
    },
    // an ask fits now: its nodes are owned, the control it names is open, and it makes sense (ok)
    reach(d, g = AMB.game) {
      const a = d.ask;
      return d.need.every((n) => g.has(n)) && (!a.param || a.param.includes('*') || open(a.param)) && (!a.ok || a.ok());
    },
    // the challenge to ask now: the active one, when it is a kind 'demande'
    gate(g = AMB.game) {
      const K = AMB.contracts, id = K && g.path ? K.state(g).active[0] : null, d = id && K.byId[id];
      return d && d.kind === 'demande' ? d : null;
    },
    // what to ask: an opening first introduces its controls, then the challenge to win, else a free ask (never twice in a row)
    pick(g = AMB.game) {
      const fresh = this.fresh && FREE.find((f) => f.need.includes(this.fresh) && this.reach(f, g));
      this.fresh = null;
      if (fresh) return { d: fresh, text: fresh.intro || 'Nouveau : ' + fresh.title };
      const gd = this.gate(g);
      if (gd) return gd.need.every((n) => g.has(n)) ? { d: gd, gate: gd.id, text: gd.title } : null;
      const pool = FREE.filter((f) => f.id !== this.last && this.reach(f, g));
      if (!pool.length) return null;
      const rnd = AMB.contracts ? AMB.contracts.rng(g) : Math.random;
      const f = pool[Math.floor(rnd() * pool.length)];
      return { d: f, text: f.title };
    },

    // at each step of the sequencer (after the Réponse): the ask in progress follows the grid; on a bar line, maybe a new one
    onStep(step, time, sd) {
      const c = this.cur, S = AMB.seq, o = (S && S.origin) || 0;
      if (c) {
        if (step <= c.T) { c.tT = time + (c.T - step) * sd; c.sd = sd; } // the 1 on the audio clock (the tempo may change)
        this.check();
        return false;
      }
      if ((step - o) % 16 !== 0 || !this.can()) return false;
      if (this.wait > 0) { this.wait--; return false; }
      const p = this.pick(); if (!p) return false;
      return this.launch(p, step, time, sd);
    },
    launch(p, step, time, sd) {
      const a = p.d.ask, by = a.how === 'by', span = (a.bars || 1) * 16;
      const T = step + (by ? 16 + span : LEAD * 16); // 'by': one bar of countdown, then the bar(s) to do it in, judged at the end
      this.cur = {
        id: p.d.id, gate: p.gate || null, d: p.d, text: p.text, hint: p.d.hint, how: a.how, T, tT: time + (T - step) * sd, sd,
        span, got: [], onset: null, at0: time,
      };
      this.last = p.d.id;
      this.until();
      AMB.game.emit('demand', { phase: 'ask', id: p.d.id, gate: this.cur.gate, text: p.text });
      this.render();
      return true;
    },
    // when an ask without its gesture is over (ignored)
    until() {
      const c = this.cur, beat = 4 * c.sd, bar = 16 * c.sd;
      c.end = c.how === 'notes' ? c.tT + 2 * bar : c.onset != null && c.how === 'hold' ? c.tT + (c.d.ask.bars || 1) * bar + beat : c.tT + 2 * beat;
      return c.end;
    },
    // ran out (ignored), or a hold let go / held to the end
    check(now = this.now()) {
      const c = this.cur; if (!c) return;
      this.until();
      if (c.how === 'hold' && c.onset != null) {
        if (!c.d.ask.hold()) return this.end('rate', 'tiens bon');
        if (now >= c.tT + (c.d.ask.bars || 1) * 16 * c.sd) return this.end(c.grade);
        return;
      }
      if (now > c.end) return this.end(c.how === 'notes' && c.got.length ? 'rate' : null, 'pas assez de notes');
    },
    // where t falls from the 1: 'parfait' (the Réponse's tolerance), 'bien' (within a beat), 'rate' (within two), or null
    place(t, target = this.cur.tT) {
      const c = this.cur, dt = t - target, beat = 4 * c.sd, tol = AMB.puzzles ? AMB.puzzles.tol(c.sd) : Math.max(0.09, c.sd * 1.2);
      const a = Math.abs(dt);
      return a <= tol ? 'parfait' : a <= beat ? 'bien' : a <= 2 * beat ? 'rate' : null;
    },
    // does this event do what the ask wants? ev 'param' (k, v, src) | 'act' (id) | 'chord' ({deg, forced})
    match(ask, ev, a, b, c) {
      if (ev === 'param') return !!ask.param && keyIs(ask.param, a) && (ask.src || ['user']).includes(c) && (!ask.v || ask.v(b)) && (ask.how !== 'hold' || ask.hold());
      if (ev === 'act') return !!ask.act && ask.act === a;
      if (ev === 'chord') return ask.chord != null && !!a && !!a.forced && (ask.chord === 'any' || mod(a.deg, (AMB.seq && AMB.seq.scale.length) || 7) === ask.chord);
      return false;
    },
    // a gesture of the player at time t (heard): judged against the ask in progress. Returns the result, or null.
    input(ev, args, t = this.at()) {
      const c = this.cur; if (!c || !AMB.game.counts()) return null;
      const a = c.d.ask, beat = 4 * c.sd;
      if (ev === 'note') {
        if (c.how !== 'notes' || t < c.tT - beat) return null;
        const k = Math.max(0, Math.round((t - c.tT) / beat)), g = this.place(t, c.tT + k * beat); // the nearest beat from the 1
        c.got.push(g || 'rate');
        this.render();
        if (c.got.length < a.n) return null;
        const worst = c.got.includes('rate') ? 'rate' : c.got.includes('bien') ? 'bien' : 'parfait';
        return this.end(worst, 'à côté du temps');
      }
      if (c.how === 'notes' || c.onset != null || !this.match(a, ev, ...args)) return null;
      if (c.how === 'by') { // anywhere in its bar(s) up to the 1 that ends it: perfect; just after: within the beat
        const from = c.tT - c.span * c.sd;
        if (t < from) return this.early();
        return this.end(t <= c.tT + this.tolOf() ? 'parfait' : t <= c.tT + beat ? 'bien' : t <= c.tT + 2 * beat ? 'rate' : null, 'trop tard');
      }
      const g = this.place(t);
      if (!g) return t < c.tT ? this.early() : null;
      if (c.how === 'hold') { c.onset = t; c.grade = g === 'rate' ? null : g; if (!c.grade) return this.end('rate', t < c.tT ? 'trop tôt' : 'trop tard'); this.until(); this.render(); return null; }
      return this.end(g, t < c.tT ? 'trop tôt' : 'trop tard');
    },
    tolOf() { return AMB.puzzles ? AMB.puzzles.tol(this.cur.sd) : 0.1; },
    // far too early: not judged, a word on the LCD (once per ask)
    early() {
      const c = this.cur; if (!c.told && AMB.garden) { c.told = true; AMB.garden.lcd(c.how === 'by' ? '♪ Pas encore…' : '♪ Pas encore : sur le 1 !', 1500); }
      return null;
    },
    // judged (grade 'parfait' | 'bien' | 'rate') or ignored (null). A challenge won makes its node ready. Returns the result.
    end(grade, why) {
      const c = this.cur; if (!c) return null;
      this.cur = null;
      const g = AMB.game, s = this.st(g), K = AMB.contracts;
      if (!grade) { // ignored: nothing lost but the combo; the next ones come more rarely
        this.ignored++; s.combo = 0;
        this.wait = c.gate ? RETRY : Math.min(16, this.gap() * (1 + this.ignored));
        g.save(); g.emit('demand', { phase: 'end', id: c.id, res: null }); this.render();
        return null;
      }
      this.ignored = 0;
      const ok = grade !== 'rate';
      s.combo = ok ? s.combo + 1 : 0; s.best = Math.max(s.best, s.combo);
      const res = { id: c.id, grade, ok, combo: s.combo, best: s.best, gate: c.gate, why: ok ? null : why };
      if (c.gate) {
        const miss = ok ? 0 : (s.miss[c.gate] || 0) + 1;
        if (ok || miss >= MISSES) { res.open = K.byId[c.gate].node; res.out = !ok; delete s.miss[c.gate]; } else { s.miss[c.gate] = miss; res.left = MISSES - miss; }
      }
      this.wait = c.gate && !res.open ? RETRY : this.gap();
      const n = res.open && AMB.tree.byId[res.open];
      if (AMB.garden) {
        if (res.out) AMB.garden.fx('consolation', { say: '✦ Prêt quand même', ms: 3000, toast: `Pas cette fois, mais ${n ? n.name : 'la suite'} est prêt à ouvrir quand même.` });
        else AMB.garden.fx(grade, { n: s.combo, why: res.why, node: n ? n.name : null });
      }
      if (res.open) K.finish(c.gate, g); // its node ready (game:ready: the juice above already said it)
      g.save();
      g.emit('demand', { phase: 'end', id: c.id, res });
      this.render();
      return res;
    },
    gap() { const rnd = AMB.contracts && AMB.game ? AMB.contracts.rng(AMB.game) : Math.random; return GAP[0] + Math.floor(rnd() * (GAP[1] - GAP[0] + 1)); },
    // playback stopped, free mode, path restarted: the ask goes, nothing is judged
    cancel() {
      const c = this.cur; this.cur = null; this.wait = 2; this.ignored = 0;
      if (c && AMB.game) AMB.game.emit('demand', { phase: 'end', id: c.id, res: null });
      this.render();
    },
    // what the LCD shows (garden.renderContracts): the ask and its countdown in musical time
    view(now = this.now()) {
      const c = this.cur; if (!c) return null;
      const bar = 16 * c.sd, beat = 4 * c.sd, tol = this.tolOf();
      let n, hot = false;
      if (c.how === 'notes' && c.got.length) { n = `${c.got.length}/${c.d.ask.n}`; hot = true; }
      else if (c.how === 'hold' && c.onset != null) { const r = Math.max(1, Math.ceil((c.tT + (c.d.ask.bars || 1) * bar - now) / bar - 1e-3)); n = `tiens ${r} mes.`; hot = true; }
      else {
        const goal = c.how === 'by' ? c.tT - c.span * c.sd : c.tT, r = goal - Math.max(now, c.at0); // 'by': the countdown runs to its bar (from the bar line it was asked on, scheduled a little ahead)
        if (c.how === 'by' && r <= 0) { n = `${Math.max(1, Math.ceil((c.tT - now) / beat - 1e-3))}…`; hot = true; } // the beats left in its bar(s)
        else if (r > bar) { const m = Math.ceil(r / bar - 1e-3); n = `dans ${m} mesure${m > 1 ? 's' : ''}`; }
        else if (r > tol) n = String(Math.ceil(r / beat - 1e-3));
        else { n = 'MAINTENANT !'; hot = true; }
      }
      return { text: c.text, n, hint: c.hint, hot, gate: c.gate };
    },
    render() {
      const G = AMB.garden; if (G && G.renderContracts) G.renderContracts();
      clearInterval(this._tick); this._tick = null;
      if (this.cur && typeof setInterval === 'function') this._tick = setInterval(() => { if (this.cur) { this.check(); if (AMB.garden) AMB.garden.renderContracts(); } else this.render(); }, 120);
    },
  };

  // ---- the gestures: the store (user moves), the bus (actions, forced chords, notes) ----
  store.on((k, v, src) => { if (D.cur && src !== 'game') D.input('param', [k, v, src]); });
  if (AMB.bus) {
    AMB.bus.on('act', (id) => { if (D.cur) D.input('act', [id]); });
    AMB.bus.on('chord', (c) => { if (D.cur && c && c.forced) D.input('chord', [c]); });
    AMB.bus.on('live', (n) => { if (D.cur && n) D.input('note', [n], n.played != null ? n.played : D.at()); });
    AMB.bus.on('panic', () => D.cancel());
    ['game:mode', 'game:reset'].forEach((e) => AMB.bus.on(e, () => D.cancel()));
    AMB.bus.on('game:unlock', (d) => { if (d && AMB.game.counts()) { D.fresh = d.id; D.wait = Math.min(D.wait, 2); } }); // introduce it soon
    AMB.bus.on('game:puzzle', (e) => { if (e && e.phase === 'call' && D.cur) D.cancel(); }); // (never both: each waits for the other)
    // S5.4 placement: never an ask during its party nor while its queue waits for « ✦ Ouvrir » (can() checks the queue)
    AMB.bus.on('resp:place', () => { if (D.cur) D.cancel(); D.wait = Math.max(D.wait, PARTY); });
    AMB.bus.on('game:ready', () => { if (D.cur) D.cancel(); }); // a node made ready elsewhere (a discovery, a Réponse): the ask goes
  }
  AMB.demands = D;
})();
