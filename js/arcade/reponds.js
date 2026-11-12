// Arcade mini-game « Réponds en jouant » (G9.5): call and response in rhythm.
// The machine counts in, plays a one-bar motif over a click, then the player plays it back during the next bar
// (computer keys A S D F G H J K L = scale degrees, as in js/play.js; MIDI; or the big pads on a phone).
// Each expected note is graded on pitch (pitch class relative to the tonic, any octave) and placement
// (gap to the grid in ms after the calibrated latency): parfait / bien / raté. check() -> {ok, partial, bonus, …}
// (bonus = share of « parfait » notes: the engine's precision bonus). reveal = 1200 ms to read the verdict.
// Curve: d = 0 (kid) 2–3 pentatonic notes on the beats, 84 BPM, tonic Do, notes shown on the grid;
//        d = 1 6–8 notes of the full major scale, eighth-note syncopations, 128 BPM, any tonic, notes hidden.
// Latency: a first-launch calibration (taps on 8 clicks -> median offset, per input: key / midi / touch) kept in
// localStorage (own key, never AMB.store). It runs in prepare(api), before the round starts (off the clock);
// the ⟲ button asks for a new one at the next round.
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
  const CAL = { n: 8, ms: 600, skip: 2, win: 250, min: 3 }; // calibration: 8 clicks at 100 BPM, the first 2 taps are warm-up
  const PTS = { perfect: 1, good: 0.75, off: 0.35, wrong: 0.15, miss: 0 };
  const LKEY = () => window.AMB_REPONDS_KEY || 'ambient.reponds.lat.v1';
  const now = () => A.clock.now();
  const state = new WeakMap(); // challenge -> live state (hits, phase, view)

  const game = {
    id: 'reponds',
    title: 'Réponds en jouant',
    skill: 'rythme',
    blurb: 'La machine joue une mesure, tu la rejoues juste et en place (A–L, MIDI ou pads).',
    kid: true,
    reveal: 1200,
    KEYS, SEMI, CAL, PTS,

    // ---- the challenge ----
    make(rng, d) {
      d = clamp(+d || 0, 0, 1);
      const bpm = Math.round(84 + 44 * d), beat = 60000 / bpm, eighth = beat / 2;
      // pitch pool: pentatonic (do ré mi sol la) for the kid, + high do, then the full scale
      const pool = d < 0.25 ? [0, 1, 2, 4, 5] : d < 0.5 ? [0, 1, 2, 4, 5, 7] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
      const onBeats = d < 0.3;
      const nMax = Math.round(3 + 5 * d), nMin = Math.max(2, nMax - 2);
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
        d, bpm, beat, eighth, bar: beat * 4, countIn: d < 0.5 ? 4 : 2, root, pool, notes,
        reveal: d < 0.4, // the kid sees which keys; the musician plays by ear
        win: { perfect: Math.round(45 - 15 * d), good: Math.round(100 - 30 * d), match: Math.min(eighth / 2, 180) },
      };
    },
    // count-in, call bar (click + motif), response bar (click only); t in seconds
    stimulus(ch) {
      const b = ch.beat / 1000, C = ch.countIn * b, ev = [];
      const click = (t, acc) => ev.push({ t, hz: acc ? 1760 : 1320, dur: 0.04, vel: acc ? 0.5 : 0.3, voice: 'sine' });
      for (let k = 0; k < ch.countIn; k++) click(k * b, k === 0);
      for (let bar = 0; bar < 2; bar++) for (let k = 0; k < 4; k++) click(C + bar * 4 * b + k * b, k === 0);
      ch.notes.forEach((nt, i) => {
        const next = ch.notes[i + 1], gap = (next ? next.t : ch.bar) - nt.t;
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

    // ---- latency calibration (localStorage, per input) ----
    lat: null,
    loadLat() {
      if (this.lat) return this.lat;
      let o = null;
      try { o = JSON.parse(localStorage.getItem(LKEY())); } catch (e) { o = null; }
      this.lat = o && o.v === 1 ? o : { v: 1 };
      return this.lat;
    },
    saveLat() { try { localStorage.setItem(LKEY(), JSON.stringify(this.lat)); } catch (e) { /* private mode: kept for the session */ } },
    calibrated() { return this.loadLat().any != null; },
    latFor(src) { const L = this.loadLat(); return L[src] != null ? L[src] : L.any != null ? L.any : 0; },
    // taps [{time, src}] against clicks at t0 + k * CAL.ms -> {ms, src, n} (median offset) or null
    calibrate(taps, t0) {
      const offs = {};
      for (const tp of taps) {
        const k = Math.round((tp.time - t0) / CAL.ms), off = tp.time - (t0 + k * CAL.ms);
        if (k < CAL.skip || k >= CAL.n || Math.abs(off) > CAL.win) continue;
        (offs[tp.src] = offs[tp.src] || []).push(off);
      }
      const src = Object.keys(offs).sort((x, y) => offs[y].length - offs[x].length)[0];
      if (!src || offs[src].length < CAL.min) return null;
      const v = offs[src].slice().sort((x, y) => x - y), m = v.length >> 1;
      const ms = Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
      return { ms: clamp(ms, -150, 300), src, n: v.length };
    },
    setLat(src, ms) { const L = this.loadLat(); L[src] = ms; L.any = ms; this.saveLat(); },

    // ---- calibration, before the round (js/arcade-ui.js calls prepare(api) off the clock) ----
    // pending: {t0, taps, api, resolve, view}; forceCal: the ⟲ button asked for a new one; calMsg: shown once
    cal: null, forceCal: false, calMsg: '',
    prepare(api) {
      if (this.calibrated() && !this.forceCal) return Promise.resolve(null);
      this.forceCal = false;
      return new Promise((resolve) => {
        const C = (this.cal = { taps: [], api, resolve, view: null, t0: 0 });
        const tap = (time, src, deg) => { C.taps.push({ time, src }); this.calFlash(deg); return true; };
        api.onKey((e) => { const deg = KEYS.indexOf(e.code); return deg >= 0 || e.code === 'Space' ? tap(this.evTime(e), 'key', deg) : false; });
        api.onMidi((m) => { tap(m.time != null ? m.time : api.now(), 'midi', -1); if (api.note) api.note({ midi: m.midi, voice: 'pluck', dur: 0.2, vel: 0.5 }); });
        if (api.stage) this.calView(api.stage, (deg, e) => tap(this.evTime(e), 'touch', deg));
        const ev = [];
        for (let k = 0; k < CAL.n; k++) ev.push({ t: (k * CAL.ms) / 1000, hz: k % 4 ? 1320 : 1760, dur: 0.04, vel: 0.5, voice: 'sine' });
        const res = api.play(ev);
        C.t0 = (res && res.t0) || api.now() + 100;
        if (!this.manual && typeof setInterval === 'function') C.timer = setInterval(() => this.calTick(), 30);
        this.calTick();
      });
    },
    // advances the calibration from the clock (the tests call it with an injected clock); resolves the promise at the end
    calTick() {
      const C = this.cal; if (!C) return null;
      const t = C.api.now(), cancelled = C.api.cancelled && C.api.cancelled();
      if (!cancelled && t <= C.t0 + CAL.n * CAL.ms + 350) {
        if (C.view) C.view.status.textContent = `CALIBRAGE ${clamp(Math.floor((t - C.t0) / CAL.ms) + 1, 0, CAL.n)}/${CAL.n}`;
        return null;
      }
      if (C.timer) clearInterval(C.timer);
      this.cal = null;
      let out = null;
      if (!cancelled) {
        out = this.calibrate(C.taps, C.t0);
        if (out) { this.setLat(out.src, out.ms); this.calMsg = `Latence ${out.src === 'midi' ? 'MIDI' : out.src === 'touch' ? 'tactile' : 'clavier'} : ${out.ms > 0 ? '+' : ''}${out.ms} ms`; }
        else { if (!this.calibrated()) this.setLat('any', 0); this.calMsg = 'Pas assez de tapes : latence 0 ms (⟲ pour refaire)'; }
      }
      C.resolve(out);
      return out;
    },
    calView(el, onPad) {
      el.innerHTML = `<div class="arc-reponds" data-mode="calib">
        <div class="arc-reponds-top"><span class="arc-reponds-key">Calibrage de la latence (hors chrono)</span><b class="arc-reponds-status" aria-live="polite">CALIBRAGE</b></div>
        <div class="arc-reponds-verdict">Tape une touche (A–L, Espace, MIDI ou un pad) pile sur chaque clic</div>
        <div class="arc-reponds-pads" style="--n:5">${[0, 1, 2, 4, 5].map((g) => `<button class="arc-reponds-pad" data-deg="${g}"><kbd>${LETTERS[g]}</kbd>${SHARPS[SEMI[g] % 12]}</button>`).join('')}</div>
      </div>`;
      this.cal.view = { status: el.querySelector('.arc-reponds-status'), pads: [...el.querySelectorAll('.arc-reponds-pad')] };
      el.querySelector('.arc-reponds-pads').addEventListener('pointerdown', (e) => {
        const b = e.target.closest('[data-deg]'); if (!b) return;
        e.preventDefault(); onPad(+b.dataset.deg, e);
      });
    },
    calFlash(deg) {
      const v = this.cal && this.cal.view, p = v && v.pads.find((b) => +b.dataset.deg === deg); if (!p) return;
      p.classList.remove('on'); void p.offsetWidth; p.classList.add('on');
    },

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
      if (this.calMsg) { s.calMsg = this.calMsg; this.calMsg = ''; }
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
        const rel = h.time - this.latFor(h.src) - (s.t0 + this.respStart(ch));
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
      return this.input(ch, { pc, midi: m.midi, vel: m.vel, time: m.time != null ? m.time : now(), src: 'midi' }, api);
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
      s.view.cal.addEventListener('click', () => { this.forceCal = true; this.draw(ch); });
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
      v.cal.lastElementChild.textContent = this.forceCal ? 'à la prochaine manche' : this.calibrated() ? `${lat > 0 ? '+' : ''}${lat} ms` : 'latence';
      let head = -1, status = '', cls = '';
      if (s.mode === 'count') {
        const k = Math.floor((t - s.t0) / ch.beat);
        status = k < 0 ? 'PRÊT ?' : `${'·'.repeat(clamp(k + 1, 1, ch.countIn))} ${clamp(k + 1, 1, ch.countIn)}`;
        v.verdict.textContent = s.calMsg || (ch.reveal ? 'Écoute, puis rejoue les mêmes touches' : 'Écoute la mesure, puis rejoue-la en rythme');
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
