// Arcade mini-game « Réponds en jouant » (G9.5): call and response in rhythm.
// The machine counts in, plays a one-bar motif over a click, then the player plays it back during the next bar
// (computer keys A S D F G H J K L = scale degrees, as in js/play.js; MIDI; or the big pads on a phone).
// Each expected note is graded on pitch (pitch class relative to the tonic, any octave) and placement
// (gap to the grid in ms after the calibrated latency): parfait / bien / raté. check() -> {ok, partial, bonus, …}
// (bonus = share of « parfait » notes: the engine's precision bonus). reveal = 1200 ms to read the verdict.
// Curve: d = 0 (kid) 2–3 pentatonic notes on the beats, 84 BPM, tonic Do, notes shown on the grid;
//        d = 1 6–8 notes of the full major scale, eighth-note syncopations, 128 BPM, any tonic, notes hidden.
// Mutators (G9.9, from d = 0.5, drawn more and more often, consigne shown above the grid): TRANSPOSÉ (answer k scale
// steps up / down, announced), À REBOURS (same rhythm, pitches last to first), MIROIR (diatonic inversion around the
// first note); a mutated bar has 3–5 notes and is 12 BPM slower. ch.call = what is heard, ch.notes = what to play.
// Latency: the global calibration of js/latency.js (G9b.2: per device and per input key / touch / midi / MIDI
// keyboard), run by prepare(api) before the round (off the clock) on the first launch; ⟲ asks for a new one.
// The game keys go to onKey (not passKeys: a passed key would reach the app's own keyboard, not the plugin).
// Everything is driven by AMB.arcade.clock.now() through tick(): the test page runs it with an injected clock.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  if (!AMB.arcade) return;
  const A = AMB.arcade;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL']; // degree 0..8
  const LETTERS = 'ASDFGHJKL';
  const SEMI = [0, 2, 4, 5, 7, 9, 11, 12, 14]; // major scale, degree -> semitones above the tonic
  const SHARPS = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  const FLATS = ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
  const ROOTS = [55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65]; // Sol..Fa: at most 5 accidentals, spelled right
  const pcName = (root, pc) => ([1, 3, 5, 8, 10].includes(root % 12) ? FLATS : SHARPS)[((pc % 12) + 12) % 12];
  const MUT = { // G9.9 mutators, unlocked by the level
    transpose: { from: 0.5, name: 'TRANSPOSÉ', short: 'transposée' },
    retro: { from: 0.65, name: 'À REBOURS', short: 'à rebours' },
    miroir: { from: 0.8, name: 'MIROIR', short: 'en miroir' },
  };
  const STEPS = { 1: 'seconde', 2: 'tierce', 3: 'quarte', 4: 'quinte' }; // diatonic steps -> interval name
  const PTS = { perfect: 1, good: 0.75, off: 0.35, wrong: 0.15, miss: 0 };
  const now = () => A.clock.now();
  const state = new WeakMap(); // challenge -> live state (hits, phase, view)

  const game = {
    id: 'reponds',
    title: 'Réponds en jouant',
    skill: 'rythme',
    blurb: 'La machine joue une mesure, tu la rejoues juste et en place (A–L, MIDI ou pads).',
    kid: true,
    reveal: 1200,
    KEYS, SEMI, PTS, MUT,
    forceMut: null,

    // ---- the challenge ----
    // mutators (G9.9) come with the level, from d = 0.5 (never for the kid): which one is drawn among the unlocked,
    // more and more often (25 % -> 60 %); forceMut (tests, captures) imposes one
    mutChance(d) { return d < MUT.transpose.from ? 0 : 0.25 + 0.35 * clamp((d - 0.5) / 0.5, 0, 1); },
    unlocked(d) { return Object.keys(MUT).filter((k) => d >= MUT[k].from); },
    make(rng, d) {
      d = clamp(+d || 0, 0, 1);
      let mut = null;
      if (this.forceMut && MUT[this.forceMut]) mut = this.forceMut;
      else if (d >= MUT.transpose.from && rng() < this.mutChance(d)) mut = rng.pick(this.unlocked(d));
      for (let k = 0; ; k++) { // a motif the mutator can transform (in range, not a palindrome…); else plain
        const ch = this.motif(rng, d, mut);
        if (!mut) return ch;
        const m = this.mutate(ch, mut, rng);
        if (m) return m;
        if (k >= 20) { const plain = this.motif(rng, d, null); return plain; }
      }
    },
    motif(rng, d, mut) {
      const bpm = Math.round(84 + 44 * d) - (mut ? 12 : 0), beat = 60000 / bpm, eighth = beat / 2; // a mutated answer gets a slower bar
      // pitch pool: pentatonic (do ré mi sol la) for the kid, + high do, then the full scale
      const pool = d < 0.25 ? [0, 1, 2, 4, 5] : d < 0.5 ? [0, 1, 2, 4, 5, 7] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
      const onBeats = d < 0.3;
      const nMax = mut ? 5 : Math.round(3 + 5 * d), nMin = mut ? 3 : Math.max(2, nMax - 2); // mutated: 3–5 notes to transform
      const n = Math.min(onBeats ? 4 : 8, nMin + rng.int(nMax - nMin + 1));
      // positions (eighths 0..7): on the beats only at first, off-beats more and more likely
      const wOff = onBeats ? 0 : 0.3 + 0.9 * (d - 0.3) / 0.7;
      const pos = [];
      if (d < 0.5) pos.push(0); // the kid always starts on « 1 »
      while (pos.length < n) {
        const cand = [0, 1, 2, 3, 4, 5, 6, 7].filter((p) => !pos.includes(p) && (p % 2 === 0 || wOff > 0));
        const w = cand.map((p) => (p % 2 ? wOff : 1)), tot = w.reduce((a, b) => a + b, 0);
        let x = rng() * tot, k = 0;
        while (k < cand.length - 1 && x >= w[k]) { x -= w[k]; k++; }
        pos.push(cand[k]);
      }
      pos.sort((a, b) => a - b);
      // expert: at least one syncopation (an off-beat note) when the bar is not full
      if (d >= 0.7 && n < 8 && !pos.some((p) => p % 2)) {
        const on = pos.filter((p) => p > 0), p = on[rng.int(on.length)], free = [p - 1, p + 1].filter((q) => q >= 0 && q < 8 && !pos.includes(q));
        pos[pos.indexOf(p)] = free.length ? free[rng.int(free.length)] : p + (p < 7 ? 1 : -1);
        pos.sort((a, b) => a - b);
      }
      // pitches: small steps for the kid, wider leaps later; no repeated note below d = 0.5
      const maxStep = d < 0.25 ? 2 : 2 + Math.round(3 * d);
      let pi = rng.int(Math.min(pool.length, 4));
      const notes = pos.map((p, i) => {
        if (i > 0) {
          const opts = pool.map((_, j) => j).filter((j) => Math.abs(j - pi) <= maxStep && (d >= 0.5 || j !== pi));
          pi = opts[rng.int(opts.length)];
        }
        const deg = pool[pi];
        return { pos: p, deg, semi: SEMI[deg], pc: SEMI[deg] % 12, t: p * eighth };
      });
      const root = d < 0.5 ? 60 : ROOTS[rng.int(ROOTS.length)];
      return {
        d, bpm, beat, eighth, bar: beat * 4, countIn: d < 0.5 ? 4 : 2, root, pool, notes, call: notes, mut: null,
        reveal: d < 0.4, // the kid sees which keys; the musician plays by ear
        win: { perfect: Math.round(45 - 15 * d), good: Math.round(100 - 30 * d), match: Math.min(eighth / 2, 180) },
      };
    },
    // the answer to play: transposed (k scale steps, announced), backwards (same rhythm, pitches last to first),
    // mirror (diatonic inversion around the first note). Scale degrees 0..8 = the keys A–L, so the keyboard can play it.
    mutate(ch, id, rng) {
      const call = ch.notes, degs = call.map((n) => n.deg);
      let to, k = 0;
      if (id === 'transpose') {
        const ks = [2, -2, 3, -3, 4, -4].filter((x) => degs.every((g) => g + x >= 0 && g + x <= 8));
        if (!ks.length) return null;
        k = ks[rng.int(ks.length)];
        to = degs.map((g) => g + k);
      } else if (id === 'retro') {
        to = degs.slice().reverse();
        if (to.every((g, i) => g === degs[i])) return null; // a palindrome sounds the same backwards
      } else if (id === 'miroir') {
        to = degs.map((g) => 2 * degs[0] - g);
        if (to.some((g) => g < 0 || g > 8) || to.every((g, i) => g === degs[i])) return null;
      } else return null;
      const notes = call.map((n, i) => ({ pos: n.pos, deg: to[i], semi: SEMI[to[i]], pc: SEMI[to[i]] % 12, t: n.t }));
      const m = MUT[id];
      const text = id === 'transpose' ? `rejoue-la une ${STEPS[Math.abs(k)]} plus ${k > 0 ? 'haut' : 'bas'} (${k > 0 ? '+' : '−'}${Math.abs(k)} touches)`
        : id === 'retro' ? 'mêmes notes, de la dernière à la première, même rythme'
        : `autour de la 1re note (${pcName(ch.root, ch.root + SEMI[degs[0]])}) : ce qui montait descend`;
      return { ...ch, call, notes, mut: { id, k, name: m.name, text, short: m.short } };
    },
    // count-in, call bar (click + motif), response bar (click only); t in seconds
    stimulus(ch) {
      const b = ch.beat / 1000, C = ch.countIn * b, ev = [];
      const click = (t, acc) => ev.push({ t, hz: acc ? 1760 : 1320, dur: 0.04, vel: acc ? 0.5 : 0.3, voice: 'sine' });
      for (let k = 0; k < ch.countIn; k++) click(k * b, k === 0);
      for (let bar = 0; bar < 2; bar++) for (let k = 0; k < 4; k++) click(C + bar * 4 * b + k * b, k === 0);
      ch.call.forEach((nt, i) => {
        const next = ch.call[i + 1], gap = (next ? next.t : ch.bar) - nt.t;
        ev.push({ t: C + nt.t / 1000, midi: ch.root + nt.semi, dur: Math.max(0.12, (Math.min(gap, ch.eighth * 2) / 1000) * 0.9), vel: 0.85, voice: 'pluck' });
      });
      return ev.sort((x, y) => x.t - y.t);
    },
    callStart(ch) { return ch.countIn * ch.beat; }, // ms after t0
    respStart(ch) { return ch.countIn * ch.beat + ch.bar; },
    choices() { return null; },

    // ---- grading: answer = {hits: [{pc, t}]}, t = ms from the response bar's downbeat, latency already removed ----
    check(ch, a) {
      const hits = (a && a.hits) || [], W = ch.win, n = ch.notes.length;
      const pairs = [];
      hits.forEach((h, i) => ch.notes.forEach((nt, j) => {
        const dt = h.t - nt.t;
        if (Math.abs(dt) <= W.match) pairs.push({ i, j, dt, right: ((h.pc % 12) + 12) % 12 === nt.pc, cost: Math.abs(dt) + (((h.pc % 12) + 12) % 12 === nt.pc ? 0 : 1000) });
      }));
      pairs.sort((x, y) => x.cost - y.cost || x.i - y.i);
      const noteOf = new Array(n).fill(null), hitOf = new Array(hits.length).fill(null);
      for (const p of pairs) if (noteOf[p.j] == null && hitOf[p.i] == null) { noteOf[p.j] = p; hitOf[p.i] = p; }
      const grade = (p) => (!p ? 'miss' : !p.right ? 'wrong' : Math.abs(p.dt) <= W.perfect ? 'perfect' : Math.abs(p.dt) <= W.good ? 'good' : 'off');
      const grades = noteOf.map(grade);
      const hitGrades = hitOf.map((p) => (p ? grade(p) : 'extra'));
      const extras = hitGrades.filter((g) => g === 'extra').length;
      const sum = grades.reduce((s, g) => s + PTS[g], 0);
      const score = clamp((sum - 0.5 * extras) / n, 0, 1);
      const ok = grades.every((g) => g === 'perfect' || g === 'good') && extras === 0;
      const count = (g) => grades.filter((x) => x === g).length;
      return {
        ok, partial: ok ? undefined : Math.round(score * 100) / 100, bonus: n ? count('perfect') / n : 0, score, grades, hitGrades, extras,
        perfect: count('perfect'), good: count('good'), dts: noteOf.map((p) => (p ? Math.round(p.dt) : null)),
      };
    },

    // ---- latency: the global calibration (js/latency.js, per device and per input) ----
    latFor(src, input) { return AMB.latency ? AMB.latency.get(src, input) : 0; },
    calibrated() { return !!(AMB.latency && AMB.latency.calibrated()); },
    // first launch (or ⟲): the calibration runs in prepare(api), before the round starts (off the clock)
    prepare(api) { return AMB.latency ? AMB.latency.ensure(api) : Promise.resolve(null); },

    // ---- the round's live part ----
    st(ch) { let s = state.get(ch); if (!s) { s = { mode: 'idle', hits: [], res: null, view: null }; state.set(ch, s); } return s; },
    play(ch, api) {
      const s = this.st(ch);
      s.api = api;
      this.startCall(ch, api);
      this.ensureTimer(ch);
      return null;
    },
    startCall(ch, api) {
      const s = this.st(ch), res = api.play(this.stimulus(ch));
      s.mode = 'count'; s.hits = []; s.res = null; s.live = null;
      const L = AMB.latency; if (L && L.msg) { s.calMsg = L.msg; L.msg = ''; }
      s.t0 = (res && res.t0) || now() + 100;
      this.draw(ch);
    },
    ensureTimer(ch) {
      const s = this.st(ch);
      if (s.timer || typeof setInterval !== 'function' || this.manual) return;
      s.timer = setInterval(() => {
        const r = A.round;
        if (!r || r.over || r.ch !== ch || s.mode === 'sent') { clearInterval(s.timer); s.timer = 0; return; }
        this.tick(ch, s.api || A.api());
      }, 30);
    },
    // advance the phases from the clock (the tests call it with an injected clock)
    tick(ch, api) {
      const s = this.st(ch), t = now();
      if (s.mode === 'count' || s.mode === 'listen' || s.mode === 'answer') {
        const rs = s.t0 + this.respStart(ch);
        s.mode = t < s.t0 + this.callStart(ch) ? 'count' : t < rs - ch.win.match ? 'listen' : 'answer';
        if (t > rs + ch.bar + ch.win.match + 40) { s.res = this.check(ch, { hits: s.hits }); s.mode = 'judged'; s.judgedAt = t; }
      } else if (s.mode === 'judged') {
        if (t > s.judgedAt + 400) { s.mode = 'sent'; api.answer({ hits: s.hits.slice() }); return; }
      }
      this.draw(ch);
    },
    // one played note from any input: {pc, midi, time (performance.now ms), src: key|midi|touch}
    input(ch, h, api) {
      const s = this.st(ch);
      if (h.midi != null && api && api.note) api.note({ midi: h.midi, voice: 'pluck', dur: 0.3, vel: h.vel != null ? 0.4 + 0.5 * h.vel : 0.8 });
      if (s.mode === 'answer' || s.mode === 'listen') {
        const rel = h.time - this.latFor(h.src, h.input) - (s.t0 + this.respStart(ch));
        if (rel >= -ch.win.match && rel <= ch.bar + ch.win.match) {
          s.hits.push({ pc: h.pc, t: Math.round(rel * 10) / 10, src: h.src, midi: h.midi });
          s.live = this.check(ch, { hits: s.hits });
        }
      }
      this.flash(ch, h);
      this.draw(ch);
      return true;
    },
    evTime(e) { return e && typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : now(); },
    fromDeg(ch, deg, time, src) { return { deg, pc: SEMI[deg] % 12, midi: ch.root + SEMI[deg], time, src }; },
    onKey(ch, e, api) {
      const deg = KEYS.indexOf(e.code);
      if (deg >= 0) return this.input(ch, this.fromDeg(ch, deg, this.evTime(e), 'key'), api);
      return false;
    },
    onMidi(ch, m, api) {
      const pc = (((m.midi - ch.root) % 12) + 12) % 12;
      return this.input(ch, { pc, midi: m.midi, vel: m.vel, time: m.time != null ? m.time : now(), src: 'midi', input: m.input || null }, api);
    },

    // ---- view ----
    name(ch, deg) { return pcName(ch.root, ch.root + SEMI[deg]); },
    // label of a played / expected note: its key letter while the keys are shown (kid), else its note name
    label(ch, pc) {
      pc = ((pc % 12) + 12) % 12;
      const deg = ch.pool.find((g) => SEMI[g] % 12 === pc);
      return ch.reveal && deg != null ? LETTERS[deg] : pcName(ch.root, ch.root + pc);
    },
    render(ch, el, api) {
      const s = this.st(ch);
      s.api = s.api || api;
      const tonic = pcName(ch.root, ch.root);
      const pads = ch.pool;
      const top = Math.max(...ch.pool);
      const cells = Array.from({ length: 8 }, (_, i) => `<i class="arc-reponds-cell${i % 2 ? '' : ' beat'}">${i % 2 ? '' : i / 2 + 1}</i>`).join('');
      const exp = ch.notes.map((nt, j) => `<b class="arc-reponds-exp" data-j="${j}" style="left:${(nt.pos / 8) * 100}%;bottom:${ch.reveal ? 8 + (nt.deg / Math.max(1, top)) * 52 : 30}%">${ch.reveal ? this.label(ch, nt.pc) : "?"}</b>`).join('');
      el.innerHTML = `<div class="arc-reponds">
        <div class="arc-reponds-top"><span class="arc-reponds-key">${tonic} majeur · ${ch.bpm} BPM</span><b class="arc-reponds-status" aria-live="polite"></b><button class="arc-reponds-cal" title="Recalibrer la latence (8 clics) au lancement de la prochaine manche">⟲ <span></span></button></div>
        ${ch.mut ? `<div class="arc-reponds-mut" data-mut="${ch.mut.id}"><b>${ch.mut.name}</b><span>${ch.mut.text}</span></div>` : ''}
        <div class="arc-reponds-grid"><div class="arc-reponds-in"><div class="arc-reponds-cells">${cells}</div><div class="arc-reponds-lane">${exp}</div><div class="arc-reponds-hits"></div><i class="arc-reponds-head"></i></div></div>
        <div class="arc-reponds-verdict"></div>
        <div class="arc-reponds-pads" style="--n:${Math.min(5, pads.length)}">${pads.map((g) => `<button class="arc-reponds-pad" data-deg="${g}"><kbd>${LETTERS[g]}</kbd>${this.name(ch, g)}</button>`).join('')}</div>
      </div>`;
      const q = (c) => el.querySelector('.arc-reponds-' + c);
      s.view = { el, status: q('status'), head: q('head'), hits: q('hits'), verdict: q('verdict'), cal: q('cal'), grid: q('grid'), padsEl: q('pads') };
      s.view.pads = [...el.querySelectorAll('.arc-reponds-pad')];
      s.view.exp = [...el.querySelectorAll('.arc-reponds-exp')];
      s.view.padsEl.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('[data-deg]'); if (!b) return;
        e.preventDefault();
        this.input(ch, this.fromDeg(ch, +b.dataset.deg, this.evTime(e), 'touch'), s.api || api);
      });
      s.view.cal.addEventListener('click', () => { if (AMB.latency) AMB.latency.request(); this.draw(ch); });
      this.draw(ch);
    },
    flash(ch, h) {
      const v = this.st(ch).view; if (!v || h.deg == null) return;
      const p = v.pads.find((b) => +b.dataset.deg === h.deg); if (!p) return;
      p.classList.remove('on'); void p.offsetWidth; p.classList.add('on');
    },
    draw(ch) {
      const s = this.st(ch), v = s.view;
      if (!v || !v.el.isConnected) return;
      const t = now(), lat = this.latFor('key');
      v.cal.lastElementChild.textContent = AMB.latency && AMB.latency.force ? 'à la prochaine manche' : this.calibrated() ? `${lat > 0 ? '+' : ''}${lat} ms` : 'latence';
      let head = -1, status = '', cls = '';
      if (s.mode === 'count') {
        const k = Math.floor((t - s.t0) / ch.beat);
        status = k < 0 ? 'PRÊT ?' : `${'·'.repeat(clamp(k + 1, 1, ch.countIn))} ${clamp(k + 1, 1, ch.countIn)}`;
        v.verdict.textContent = s.calMsg || (ch.mut ? `Écoute, puis rejoue-la ${ch.mut.short}` : ch.reveal ? 'Écoute, puis rejoue les mêmes touches' : 'Écoute la mesure, puis rejoue-la en rythme');
      } else if (s.mode === 'listen') {
        head = (t - s.t0 - this.callStart(ch)) / ch.bar; status = 'ÉCOUTE'; cls = 'listen';
      } else if (s.mode === 'answer') {
        head = (t - s.t0 - this.respStart(ch)) / ch.bar; status = 'À TOI !'; cls = 'answer';
        if (!s.hits.length) v.verdict.textContent = '';
      }
      v.status.textContent = status || v.status.textContent;
      v.el.dataset.mode = s.mode;
      v.grid.dataset.phase = cls;
      v.head.style.left = `${clamp(head, 0, 1) * 100}%`;
      v.head.hidden = head < 0 || head > 1.02;
      // the player's hits, graded live
      const res = s.res || s.live;
      const key = s.hits.length + ':' + (s.res ? 'f' : 'l');
      if (v.hitsKey !== key) {
        v.hitsKey = key;
        v.hits.innerHTML = s.hits.map((h, i) => {
          const g = res ? res.hitGrades[i] : '';
          return `<b class="arc-reponds-hit ${g}" style="left:${clamp(h.t / ch.bar, -0.04, 1.04) * 100}%">${this.label(ch, h.pc)}</b>`;
        }).join('');
        if (s.mode === 'answer' && res) {
          const g = res.hitGrades[s.hits.length - 1];
          v.verdict.innerHTML = `<b class="arc-reponds-word ${g}">${{ perfect: 'PARFAIT', good: 'BIEN', off: 'RATÉ', wrong: 'FAUX', extra: 'EN TROP' }[g] || ''}</b>`;
        }
      }
      if (s.res && v.done !== s.res) {
        v.done = s.res;
        const r = s.res;
        v.exp.forEach((b, j) => { b.className = 'arc-reponds-exp ' + r.grades[j]; b.textContent = this.label(ch, ch.notes[j].pc); b.style.bottom = `${8 + (ch.notes[j].deg / Math.max(1, Math.max(...ch.pool))) * 52}%`; });
        const word = r.ok ? (r.perfect === ch.notes.length ? 'PARFAIT !' : 'BIEN !') : r.score >= 0.5 ? 'PRESQUE' : 'RATÉ';
        v.status.textContent = word;
        v.verdict.innerHTML = `<span class="perfect">${r.perfect} parfait</span> · <span class="good">${r.good} bien</span> · <span class="off">${ch.notes.length - r.perfect - r.good} raté</span>${r.extras ? ` · ${r.extras} en trop` : ''}`;
        v.el.dataset.verdict = r.ok ? 'ok' : 'ko';
      }
    },
  };

  A.register(game);
})();
