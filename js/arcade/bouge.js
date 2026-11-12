// Arcade mini-game « Qu'est-ce qui a bougé ? » (G9.4): a short loop (pad chord + bass + melody), then the
// same loop with ONE perceptual setting changed; the player names it among 2 (d = 0) to 6 (d = 1) choices.
// Settings = what AMB.audition can vary with its fixed voices: transposition, one melody note, one chord note,
// bass octave, tempo, added notes, one note displaced, note length, melody instrument, brightness (added
// upper partials), volume. Each has a minimum audible amplitude (MIN, never gone below); amplitudes shrink with d.
// Easy: coarse settings only, decoys from other perceptual families. Expert: decoys from the same family.
// Direction is random: A and B are swapped half of the time (B louder or quieter, faster or slower…).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  if (!AMB.arcade) return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // id -> perceptual family and label (icon + word)
  const PARAMS = {
    transpo: { fam: 'hauteur', label: '↕ Hauteur' },
    melodie: { fam: 'hauteur', label: '♪ Une note' },
    accord: { fam: 'hauteur', label: '♫ Accord' },
    basse: { fam: 'hauteur', label: '▼ Basse' },
    tempo: { fam: 'temps', label: '⏱ Vitesse' },
    densite: { fam: 'temps', label: '✚ Notes en plus' },
    rythme: { fam: 'temps', label: '↹ Rythme' },
    duree: { fam: 'temps', label: '✂ Durée' },
    voix: { fam: 'timbre', label: '🎷 Instrument' },
    brillance: { fam: 'timbre', label: '✨ Brillance' },
    volume: { fam: 'timbre', label: '🔊 Volume' },
  };
  // settings unlocked with d: coarse and fun first (the kid's level), fine ones later
  const TIERS = [
    [0, ['transpo', 'tempo', 'voix', 'densite', 'basse']],
    [0.35, ['melodie', 'volume', 'rythme', 'accord']],
    [0.6, ['brillance', 'duree']],
  ];
  // the inaudible map: minimum amplitude per setting (below it the change is not reliably heard)
  const MIN = {
    transpo: 20, // cents, whole loop
    tempo: 0.06, // relative change of the beat
    volume: 2, // dB
    brillance: 0.22, // level of the added partials (x2, x3) relative to the melody
    duree: 0.35, // share of the length removed (factor ≤ 0.65)
    rythme: 0.2, // beats of displacement (and ≥ 90 ms)
    melodie: 1, accord: 1, // semitones
    basse: 12, // semitones
    densite: 1, // notes added
    voix: 1, // a different voice
  };
  const MAJ = [0, 2, 4, 7, 9, 12, 14, 16], MIN_PENTA = [0, 3, 5, 7, 10, 12, 15, 17];
  const PATTERNS = [[1, 1, 1, 1], [2, 1, 1], [1, 1, 2], [1, 2, 1]];
  const PATTERNS_HARD = [[1.5, 0.5, 1, 1], [1, 0.5, 0.5, 2], [1, 1, 1.5, 0.5]];
  const GAP = 0.7; // s of silence between A and B

  AMB.arcade.register({
    id: 'bouge',
    title: 'Qu\'est-ce qui a bougé ?',
    skill: 'écoute',
    blurb: 'Une boucle, puis la même avec UN réglage changé : lequel ?',
    // kid: at d = 0 there are 2 big, concrete changes (a fourth higher, 35 % faster, bell vs flute, two
    // extra notes, bass an octave up) with icon labels: a non-musician hears them, it plays like a spot-the-difference
    kid: true,
    PARAMS, MIN, TIERS,

    pool(d) { return TIERS.filter(([t]) => d >= t).flatMap(([, ids]) => ids); },
    nChoices(d) { return clamp(2 + Math.floor(clamp(d, 0, 1) * 5), 2, 6); },
    // amplitude of the change of `id` at level d (always ≥ MIN[id])
    amount(id, d) {
      d = clamp(d, 0, 1); const e = 1 - d;
      switch (id) {
        case 'transpo': return Math.round(25 + 475 * e * e);
        case 'tempo': return 0.07 + 0.28 * e * e;
        case 'volume': return 2.5 + 5.5 * e * e;
        case 'brillance': return 0.25 + 0.35 * e * e;
        case 'duree': return 0.7 - 0.3 * d; // share removed: 70 % → 40 %
        case 'rythme': return 0.5 - 0.25 * d;
        case 'melodie': return d < 0.4 ? 4 : d < 0.75 ? 2 : 1;
        case 'accord': return d < 0.6 ? 2 : 1;
        case 'basse': return 12;
        case 'densite': return d < 0.5 ? 2 : 1;
        case 'voix': return 1;
      }
      return 0;
    },
    otherVoice(d) { return d < 0.4 ? 'bell' : d < 0.75 ? 'pluck' : 'sine'; },

    make(rng, d) {
      d = clamp(+d || 0, 0, 1);
      const pool = this.pool(d), answer = pool[rng.int(pool.length)];
      // decoys: the same family's settings take more of the slots as d grows (all of them at d = 1)
      const n = this.nChoices(d), fam = PARAMS[answer].fam;
      const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
      const same = shuffle(pool.filter((p) => p !== answer && PARAMS[p].fam === fam));
      const other = shuffle(pool.filter((p) => PARAMS[p].fam !== fam));
      const kSame = Math.min(same.length, n - 1, d >= 1 ? n - 1 : Math.round(d * (n - 1)));
      let decoys = same.slice(0, kSame).concat(other.slice(0, n - 1 - kSame));
      if (decoys.length < n - 1) decoys = decoys.concat(same.slice(kSame, kSame + n - 1 - decoys.length));
      const options = shuffle([answer, ...decoys]);

      // the base loop
      const minor = rng() < 0.4, scale = minor ? MIN_PENTA : MAJ;
      const pat = rng.pick(d >= 0.5 && rng() < 0.6 ? PATTERNS_HARD : PATTERNS);
      let k = 2 + rng.int(3), b = 0;
      const mel = pat.map((l) => {
        const note = { b, p: scale[k], l };
        b += l;
        k = clamp(k + rng.pick([-2, -1, 1, 1, 2]), 0, scale.length - 1);
        return note;
      });
      const base = { root: 52 + rng.int(8), cents: 0, beat: 0.42 + rng() * 0.12, gain: 1, bright: 0, art: 1, voice: 'triangle', bass: 0, chord: [0, minor ? 3 : 4, 7], mel };
      const mod = this.change(base, answer, d, rng);
      const swap = rng() < 0.5;
      return { d, answer, options, a: swap ? mod : base, b: swap ? base : mod, amount: this.amount(answer, d) };
    },

    // a copy of S with only `id` changed
    change(S, id, d, rng) {
      const T = { ...S, chord: S.chord.slice(), mel: S.mel.map((m) => ({ ...m })) }, amt = this.amount(id, d);
      switch (id) {
        case 'transpo': T.cents = amt; break;
        case 'tempo': T.beat = S.beat * (1 + amt); break;
        case 'volume': T.gain = Math.pow(10, -amt / 20); break;
        case 'brillance': T.bright = amt; break;
        case 'duree': T.art = 1 - amt; break;
        case 'voix': T.voice = this.otherVoice(d); break;
        case 'basse': T.bass = amt; break;
        case 'accord': if (amt === 1) T.chord[1] = S.chord[1] === 4 ? 3 : 4; else T.chord[2] = 9; break;
        case 'melodie': {
          const i = rng.int(T.mel.length), m = T.mel[i];
          let dir = rng() < 0.5 ? -1 : 1;
          const bad = (p) => p < -3 || p > 19 || (T.mel[i - 1] && T.mel[i - 1].p === p) || (T.mel[i + 1] && T.mel[i + 1].p === p);
          if (bad(m.p + dir * amt)) dir = -dir;
          m.p += dir * amt;
          break;
        }
        case 'rythme': { // one note (not the first) comes late: the previous one is held longer
          const ok = T.mel.map((m, i) => i).filter((i) => i > 0 && T.mel[i].l >= amt + 0.25);
          const i = ok[rng.int(ok.length)];
          T.mel[i].b += amt; T.mel[i].l -= amt; T.mel[i - 1].l += amt;
          break;
        }
        case 'densite': { // long notes split in two: the second half is a neighbour note
          const long = T.mel.filter((m) => m.l >= 1);
          const picks = long.slice();
          for (let n = 0; n < amt; n++) {
            const m = picks.splice(rng.int(picks.length), 1)[0];
            const h = m.l / 2; m.l = h;
            T.mel.push({ b: m.b + h, p: m.p + rng.pick([-2, 2, 3]), l: h });
          }
          T.mel.sort((x, y) => x.b - y.b);
          break;
        }
      }
      return T;
    },

    // which settings differ between two loops (the test invariant: exactly one)
    diff(A, B) {
      const out = [];
      if (A.cents !== B.cents) out.push('transpo');
      if (A.beat !== B.beat) out.push('tempo');
      if (A.gain !== B.gain) out.push('volume');
      if (A.bright !== B.bright) out.push('brillance');
      if (A.art !== B.art) out.push('duree');
      if (A.voice !== B.voice) out.push('voix');
      if (A.bass !== B.bass) out.push('basse');
      if (A.root !== B.root) out.push('tonalite');
      if (A.chord.join() !== B.chord.join()) out.push('accord');
      if (A.mel.length !== B.mel.length) out.push('densite');
      else {
        if (A.mel.some((m, i) => m.p !== B.mel[i].p)) out.push('melodie');
        if (A.mel.some((m, i) => m.b !== B.mel[i].b)) out.push('rythme');
      }
      return out;
    },

    // events of one loop starting at t0 (s)
    loop(S, t0) {
      const ev = [], c = S.cents, g = S.gain, bar = 4 * S.beat;
      for (const iv of S.chord) ev.push({ t: t0, midi: S.root + iv, cents: c, dur: bar, vel: 0.34 * g, voice: 'sine' });
      for (const at of [0, 2]) ev.push({ t: t0 + at * S.beat, midi: S.root - 12 + S.bass, cents: c, dur: 2 * S.beat * 0.9, vel: 0.6 * g, voice: 'pluck' });
      for (const m of S.mel) {
        const t = t0 + m.b * S.beat, dur = Math.max(0.06, m.l * S.beat * 0.92 * S.art), midi = S.root + 12 + m.p, vel = 0.6 * g;
        ev.push({ t, midi, cents: c, dur, vel, voice: S.voice });
        if (S.bright > 0) {
          ev.push({ t, midi: midi + 12, cents: c, dur, vel: vel * S.bright, voice: 'sine' });
          ev.push({ t, midi: midi + 19, cents: c, dur, vel: vel * S.bright * 0.6, voice: 'sine' });
        }
      }
      return ev;
    },
    offsetB(ch) { return 4 * ch.a.beat + GAP; },
    stimulus(ch) { return this.loop(ch.a, 0).concat(this.loop(ch.b, this.offsetB(ch))); },
    // plays the stimulus and lights A then B on the stage (visual only)
    play(ch, api) {
      const res = api.play(this.stimulus(ch));
      const el = this.stage, now = performance.now();
      if (el && el.isConnected && res && res.t0) {
        const tok = (this.tok = (this.tok || 0) + 1); // a replay or a new challenge cancels the old lights
        const lit = (k) => el.querySelectorAll('.arc-bouge-pad').forEach((p) => p.classList.toggle('on', p.dataset.k === k));
        const at = (ms, k) => setTimeout(() => { if (tok === this.tok && el.isConnected) lit(k); }, Math.max(0, ms - now));
        at(res.t0, 'a'); at(res.t0 + 4 * ch.a.beat * 1000, ''); at(res.t0 + this.offsetB(ch) * 1000, 'b'); at(res.t0 + res.dur * 1000, '');
      }
      return res;
    },
    render(ch, el) {
      this.stage = el; this.tok = (this.tok || 0) + 1;
      el.innerHTML = '<div class="arc-bouge-ab"><span class="arc-bouge-pad" data-k="a">A</span><span class="arc-bouge-arrow">→</span><span class="arc-bouge-pad" data-k="b">B</span></div><p class="arc-bouge-q">Un seul réglage change entre A et B</p>';
    },
    choices(ch) { return ch.options.map((id) => ({ value: id, label: PARAMS[id].label })); },
    check(ch, a) { return { ok: a === ch.answer }; },
  });
})();
