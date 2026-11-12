// Arcade mini-game « L'intrus » (G9.3): A / B / X — we hear A, then B, then X; is X the same sound as A or as B?
// A and B differ on exactly ONE dimension, drawn by level (never the volume: loudness is equalized per voice):
//   timbre (voices far apart -> neighbours), pitch (700 -> 10 cents), duration (x3 -> x1.15).
// Every gap shrinks with d (0 = easy) and stays above a realistic audible threshold (MIN).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  if (!AMB.arcade) return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Perceived loudness: RMS of each audition voice at vel 1 (OfflineAudioContext, 0.6 s note, same at every pitch).
  // velOf(voice) brings every voice to the same RMS, so A, B and X never differ by level.
  const LOUD = { sine: 0.2186, triangle: 0.1674, pluck: 0.0562, bell: 0.1126 };
  const TARGET = 0.11;
  const velOf = (voice) => TARGET / LOUD[voice];
  // Spectral "brightness" axis of the voices (sine = pure ... pluck = sawtooth): distance between two timbres
  const BRIGHT = { sine: 0, triangle: 1, bell: 2, pluck: 3.2 };
  const MIN = { pitch: 10, timbre: 1, duree: 1.15 }; // smallest gap ever served (cents, brightness units, duration ratio)
  const PAIRS = [];
  { const v = Object.keys(BRIGHT); for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) PAIRS.push({ a: v[i], b: v[j], gap: Math.abs(BRIGHT[v[i]] - BRIGHT[v[j]]) }); }
  const NOTE_PAUSE = 0.45, SHORT = 0.5, LAMPS = ['A', 'B', 'X'];

  const game = {
    id: 'intrus',
    title: "L'intrus",
    skill: 'discrimination',
    blurb: 'Trois sons : A, B, puis X. X est-il A ou B ?',
    kid: true,
    velOf, MIN, BRIGHT,
    dims(d) { return d < 0.3 ? ['timbre', 'timbre', 'pitch'] : ['timbre', 'pitch', 'duree']; },
    // the gap served for a dimension at level d (cents / brightness units / duration ratio)
    gap(dim, d) {
      d = clamp(d, 0, 1);
      if (dim === 'pitch') return Math.round(MIN.pitch + 690 * Math.pow(1 - d, 2));
      if (dim === 'duree') return +(MIN.duree + 1.85 * Math.pow(1 - d, 2)).toFixed(3);
      const T = 3.2 - 2.2 * d, ok = PAIRS.filter((p) => p.gap >= T - 1e-9);
      return Math.min(...ok.map((p) => p.gap));
    },
    make(rng, d) {
      d = clamp(d, 0, 1);
      const dim = rng.pick(this.dims(d)), g = this.gap(dim, d);
      const base = { voice: rng.pick(['sine', 'triangle', 'bell', 'pluck']), midi: 55 + rng.int(14), cents: 0, dur: 0.6 };
      const lo = { ...base }, hi = { ...base };
      if (dim === 'pitch') hi.cents = g;
      else if (dim === 'duree') { lo.voice = hi.voice = rng.pick(['sine', 'triangle']); lo.dur = SHORT; hi.dur = +(SHORT * g).toFixed(3); }
      else { const p = rng.pick(PAIRS.filter((q) => Math.abs(q.gap - g) < 1e-9)); lo.voice = p.a; hi.voice = p.b; }
      const swap = rng() < 0.5, x = rng() < 0.5 ? 'A' : 'B';
      const A = swap ? hi : lo, B = swap ? lo : hi;
      return { dim, gap: g, A, B, x, answer: x, d };
    },
    note(n, t) { return { t, midi: n.midi, cents: n.cents, dur: n.dur, vel: velOf(n.voice), voice: n.voice }; },
    // when A, B, X start (s) and how long they last
    timeline(ch) {
      const out = []; let t = 0;
      for (const k of LAMPS) { const n = k === 'X' ? ch[ch.x] : ch[k]; out.push({ k, t, dur: n.dur }); t += n.dur + NOTE_PAUSE; }
      return out;
    },
    stimulus(ch) { return this.timeline(ch).map((e) => this.note(e.k === 'X' ? ch[ch.x] : ch[e.k], e.t)); },
    play(ch, api) {
      const res = api.play(this.stimulus(ch));
      (this._timers || []).forEach(clearTimeout);
      this._timers = [];
      const lamps = document.querySelectorAll('.arc-intrus-lamp');
      if (lamps.length) {
        const lit = (k, on) => lamps.forEach((l) => { if (l.dataset.k === k) l.classList.toggle('on', on); });
        lamps.forEach((l) => l.classList.remove('on'));
        this.timeline(ch).forEach((e) => {
          this._timers.push(setTimeout(() => lit(e.k, true), 100 + e.t * 1000));
          this._timers.push(setTimeout(() => lit(e.k, false), 100 + (e.t + e.dur) * 1000));
        });
      }
      return res;
    },
    render(ch, el) {
      el.innerHTML = '<div class="arc-intrus-lamps">' + LAMPS.map((k) => `<span class="arc-intrus-lamp" data-k="${k}">${k}</span>`).join('') + '</div><div class="arc-intrus-ask">X est… A ou B ?</div>';
    },
    choices() { return [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }]; },
    onKey(ch, e, api) {
      const v = e.code === 'KeyA' || e.code === 'ArrowLeft' ? 'A' : e.code === 'KeyB' || e.code === 'ArrowRight' ? 'B' : null;
      if (!v) return false;
      const btn = document.querySelector('.arc-choice[data-value="' + v + '"]');
      if (btn) btn.click(); else api.answer(v);
      return true;
    },
    check(ch, a) { return { ok: a === ch.answer }; },
  };
  AMB.arcade.register(game);
})();
