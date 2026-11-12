// Arcade mini-game « Dictée d'accords » (G9.9 variant): a chord is heard (its bass, the root an octave below,
// is put forward), the player names its colour; at a high level, its function in a short progression.
// Curve: d < 0.2 Majeur / Mineur (arpeggio then block, the kid's level) -> + 7 and m7 -> + 7M, Sus4 -> + Sus2, Dim
//        (6 choices among them: the answer and its closest neighbours) -> d >= 0.8 + Aug, and half of the challenges
//        are a function dictation: I, then a chord, then « ? » — which degree is it (I ii iii IV V vi)?
// Sound (analysis notes): timbres triangle / pluck / sine; the bell (Cloche, the most ambiguous for chords; the
// audition bus has no glass voice) only from d = 0.8; loudness equalized (per voice RMS, ÷√(number of notes)) so
// two chords never differ by level; bass a little louder than each upper voice.
// MIDI (bonus): the player may PLAY the chord instead of choosing: the chord is judged when it is released (first
// note-off with 3+ notes pressed, or the sustain pedal CC64 released, see onCC). Right colour (any root) = right
// answer; the exact chord heard (same notes; up to d = 0.3 any octave or inversion, above it the bass must be the
// heard bass in the right octave) = + the precision bonus. A mini-game never writes AMB.store.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  if (!AMB.arcade) return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mod = (x, n) => ((x % n) + n) % n;
  const SHARPS = ['Do', 'Do♯', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
  // qualities: intervals above the root, label on the button, full name
  const Q = {
    maj: { iv: [0, 4, 7], label: 'Majeur', kid: 'Majeur ☀' },
    min: { iv: [0, 3, 7], label: 'Mineur', kid: 'Mineur ☾' },
    dom7: { iv: [0, 4, 7, 10], label: '7' },
    min7: { iv: [0, 3, 7, 10], label: 'm7' },
    maj7: { iv: [0, 4, 7, 11], label: '7M' },
    sus4: { iv: [0, 5, 7], label: 'Sus4' },
    sus2: { iv: [0, 2, 7], label: 'Sus2' },
    dim: { iv: [0, 3, 6], label: 'Dim' },
    aug: { iv: [0, 4, 8], label: 'Aug' },
  };
  const ORDER = Object.keys(Q);
  const TIERS = [
    { to: 0.2, set: ['maj', 'min'] },
    { to: 0.4, set: ['maj', 'min', 'dom7', 'min7'] },
    { to: 0.6, set: ['maj', 'min', 'dom7', 'min7', 'maj7', 'sus4'] },
    { to: 0.8, set: ['maj', 'min', 'dom7', 'min7', 'maj7', 'sus4', 'sus2', 'dim'] },
    { to: 1.01, set: ORDER },
  ];
  const MAXCH = 6; // answer buttons at most (the answer + its closest neighbours)
  // function dictation (major key): degree -> semitones above the key and quality
  const FN = { I: [0, 'maj'], ii: [2, 'min'], iii: [4, 'min'], IV: [5, 'maj'], V: [7, 'maj'], vi: [9, 'min'] };
  const FN_FROM = 0.8, BELL_FROM = 0.8, OCT_TOL = 0.3;
  // perceived loudness of the audition voices at vel 1 (RMS, same table as L'intrus): equal level whatever the voice
  const LOUD = { sine: 0.2186, triangle: 0.1674, pluck: 0.0562, bell: 0.1126 };
  const LEVEL = 0.11, BASS = 1.25; // chord RMS target; bass = 1.25 × one upper voice
  const now = () => AMB.arcade.clock.now();
  const state = new WeakMap(); // challenge -> MIDI gesture {held, gesture, view}

  const dist = (a, b) => { const A = new Set(Q[a].iv), B = new Set(Q[b].iv); let n = 0; A.forEach((x) => { if (!B.has(x)) n++; }); B.forEach((x) => { if (!A.has(x)) n++; }); return n; };
  const pcsKey = (pcs) => [...new Set(pcs.map((p) => mod(p, 12)))].sort((x, y) => x - y).join(',');

  const game = {
    id: 'dictee',
    title: "Dictée d'accords",
    skill: 'harmonie',
    blurb: "Un accord sonne (basse en avant) : majeur ou mineur ? Puis 7e, sus, dim… et sa fonction. MIDI : joue-le !",
    kid: true,
    reveal: 900,
    Q, TIERS, FN, LOUD, LEVEL, BELL_FROM, FN_FROM, OCT_TOL,

    tier(d) { return TIERS.find((t) => d < t.to) || TIERS[TIERS.length - 1]; },
    voices(d) { return d >= BELL_FROM ? ['triangle', 'pluck', 'sine', 'bell'] : ['triangle', 'pluck', 'sine']; },
    velOf(voice, n) { return (LEVEL / LOUD[voice]) / Math.sqrt(n); },

    make(rng, d) {
      d = clamp(+d || 0, 0, 1);
      const voice = d < 0.2 ? 'triangle' : rng.pick(this.voices(d));
      if (d >= FN_FROM && rng() < 0.5) return this.makeFn(rng, d, voice);
      const set = this.tier(d).set, q = rng.pick(set);
      const root = 50 + rng.int(12); // Ré3..Do♯4: upper voices in the clearest register
      // upper voices: close position, rotated (inversions) from d = 0.5; the bass always plays the root
      let up = Q[q].iv.map((x) => root + x);
      const rot = d >= 0.5 ? rng.int(up.length) : 0;
      for (let k = 0; k < rot; k++) { up = up.slice(1).concat(up[0] + 12); }
      let opts = set.slice();
      if (opts.length > MAXCH) {
        const others = opts.filter((x) => x !== q).map((x) => ({ x, k: dist(q, x) + rng() * 0.5 })).sort((a, b) => a.k - b.k).slice(0, MAXCH - 1).map((o) => o.x);
        opts = ORDER.filter((x) => x === q || others.includes(x));
      }
      return { kind: 'quality', d, q, root, bass: root - 12, up, voice, opts, arp: d < 0.3, dur: d < 0.6 ? 1.6 : 1.2 };
    },
    // function: I (the key), a context chord, then the asked one
    makeFn(rng, d, voice) {
      const key = 50 + rng.int(12), degs = d >= 0.9 ? ['I', 'ii', 'iii', 'IV', 'V', 'vi'] : ['I', 'IV', 'V', 'vi'];
      const ans = rng.pick(degs), mid = rng.pick(['IV', 'V', 'vi', 'ii'].filter((g) => g !== ans && (degs.includes(g))));
      const chords = ['I', mid, ans].map((g) => this.voiceFn(key, g));
      return { kind: 'fn', d, key, ans, mid, chords, voice, opts: degs, dur: 1.0 };
    },
    // a degree's triad near the key's centre (smooth voice leading), bass = its root in the low octave
    voiceFn(key, g) {
      const [off, q] = FN[g], root = key + off;
      let best = null;
      for (let inv = 0; inv < 3; inv++) {
        let up = Q[q].iv.map((x) => root + x);
        for (let k = 0; k < inv; k++) up = up.slice(1).concat(up[0] + 12);
        while (up[0] > key + 7) up = up.map((m) => m - 12);
        const c = up.reduce((a, b) => a + b, 0) / up.length, cost = Math.abs(c - (key + 7));
        if (!best || cost < best.cost) best = { up, cost };
      }
      return { g, q, root, bass: root - 12 - (off >= 7 ? 12 : 0), up: best.up }; // bass in Sol1..Ré♭3
    },

    // events of one chord at t (s): bass first (a touch louder), upper voices with equal perceived loudness
    chordEv(c, t, dur, voice, arp) {
      const ev = [], n = c.up.length, vb = this.velOf('triangle', 1) * BASS / Math.sqrt(n + 1);
      const vu = this.velOf(voice, n + 1);
      ev.push({ t, midi: c.bass, dur: dur + (arp ? 0.2 * n : 0), vel: vb, voice: 'triangle', bass: true });
      c.up.forEach((m, i) => ev.push({ t: t + (arp ? 0.2 * (i + 1) : 0), midi: m, dur: dur + (arp ? 0.2 * (n - i - 1) : 0), vel: vu, voice }));
      return ev;
    },
    stimulus(ch) {
      if (ch.kind === 'fn') return ch.chords.flatMap((c, i) => this.chordEv(c, i * (ch.dur + 0.15), ch.dur, ch.voice, false));
      const c = { bass: ch.bass, up: ch.up };
      // the kid hears it broken (bass, then each note) and then together
      if (ch.arp) return this.chordEv(c, 0, 0.5, ch.voice, true).concat(this.chordEv(c, 0.2 * ch.up.length + 0.85, ch.dur, ch.voice, false));
      return this.chordEv(c, 0, ch.dur, ch.voice, false);
    },
    choices(ch) {
      if (ch.kind === 'fn') return ch.opts.map((g) => ({ value: g, label: g }));
      return ch.opts.map((q) => ({ value: q, label: ch.d < 0.2 ? Q[q].kid : Q[q].label }));
    },
    name(ch) {
      if (ch.kind === 'fn') return `${ch.ans} (${SHARPS[mod(ch.chords[2].root, 12)]} ${Q[ch.chords[2].q].label.toLowerCase()})`;
      return `${SHARPS[mod(ch.root, 12)]} ${Q[ch.q].label}`;
    },

    // ---- a played chord (MIDI): its colour, and whether it is the exact chord heard ----
    // played = [midi…] (any order). Returns {q: quality id or null, exact}
    readPlayed(ch, played) {
      const ms = [...new Set(played)].sort((a, b) => a - b);
      if (ms.length < 3 || ch.kind !== 'quality') return { q: null, exact: false };
      const tol = ch.d <= OCT_TOL, pcs = ms.map((m) => mod(m, 12)), key = pcsKey(pcs);
      const roots = tol ? [...new Set(pcs)] : [pcs[0]]; // above OCT_TOL: root position (the lowest note is the root)
      let q = null;
      for (const r of roots) {
        const iv = pcsKey(pcs.map((p) => p - r));
        q = ORDER.find((x) => pcsKey(Q[x].iv) === iv) || null;
        if (q === ch.q) break; // the expected reading wins (Sus2 / Sus4, Aug are symmetric)
      }
      const heard = pcsKey([ch.bass, ...ch.up]);
      const exact = key === heard && (tol || ms[0] === ch.bass); // same notes; above OCT_TOL, the heard bass itself
      return { q, exact };
    },
    check(ch, a) {
      if (a && typeof a === 'object' && Array.isArray(a.played)) {
        const r = this.readPlayed(ch, a.played);
        const ok = r.q === ch.q;
        return { ok, bonus: ok && r.exact ? 1 : 0, played: r.q, exact: r.exact };
      }
      return { ok: ch.kind === 'fn' ? a === ch.ans : a === ch.q };
    },

    // ---- MIDI: notes sound at once; a chord is judged when it is released ----
    st(ch) { let s = state.get(ch); if (!s) { s = { held: new Set(), gesture: [], view: null, sent: false }; state.set(ch, s); } return s; },
    onMidi(ch, m, api) {
      const s = this.st(ch);
      if (api && api.note) api.note({ midi: m.midi, voice: 'triangle', dur: 0.9, vel: 0.25 + 0.6 * (m.vel != null ? m.vel : 0.8) });
      if (!s.held.size && !m.sustain) s.gesture = [];
      s.held.add(m.midi);
      if (!s.gesture.includes(m.midi)) s.gesture.push(m.midi);
      this.drawPlayed(ch);
      return true;
    },
    onMidiOff(ch, m, api) {
      const s = this.st(ch);
      s.held.delete(m.midi);
      if (!m.sustain) this.release(ch, api);
      return true;
    },
    // CC64 released: the pedal held the chord, it is released now
    onCC(ch, c, api) {
      if (c.cc === 64 && !c.sustain) this.release(ch, api);
      return true;
    },
    release(ch, api) {
      const s = this.st(ch);
      if (s.sent || ch.kind !== 'quality' || s.gesture.length < 3) { if (!s.held.size) s.gesture = []; return; }
      s.sent = true;
      const played = s.gesture.slice();
      s.gesture = [];
      api.answer({ played });
    },

    // ---- view: what to listen for, the progression strip, the chord being played on MIDI ----
    render(ch, el) {
      const s = this.st(ch);
      const fn = ch.kind === 'fn';
      el.innerHTML = `<div class="arc-dictee${ch.opts.length <= 2 ? ' arc-dictee-kid' : ''}">
        ${fn ? `<div class="arc-dictee-prog" aria-label="Progression"><b>I</b><i>→</i><b>${ch.mid}</b><i>→</i><b class="q">?</b></div>
          <p class="arc-dictee-hint">Dans la tonalité, quelle est la fonction du dernier accord ?</p>`
          : `<div class="arc-dictee-chord" aria-hidden="true"><i></i><i></i><i></i>${ch.up.length > 3 ? '<i></i>' : ''}<b></b></div>
          <p class="arc-dictee-hint">${ch.d < 0.2 ? 'Écoute l\'accord : joyeux (majeur) ou triste (mineur) ?' : 'Quelle couleur d\'accord ? (basse en avant)'}</p>
          <p class="arc-dictee-midi">🎹 ou joue-le au clavier MIDI : bonus si c'est l'accord exact</p>`}
        <p class="arc-dictee-played" aria-live="polite"></p>
      </div>`;
      s.view = { el, played: el.querySelector('.arc-dictee-played') };
    },
    drawPlayed(ch) {
      const s = this.st(ch), v = s.view; if (!v || !v.el.isConnected || ch.kind !== 'quality') return;
      const r = this.readPlayed(ch, s.gesture);
      v.played.textContent = s.gesture.length ? `Tu joues : ${s.gesture.slice().sort((a, b) => a - b).map((m) => SHARPS[mod(m, 12)]).filter((x, i, a) => a.indexOf(x) === i).join(' ')}${r.q ? ' → ' + Q[r.q].label : ''}` : '';
    },
  };

  AMB.arcade.register(game);
})();
