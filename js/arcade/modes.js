// Arcade mini-game « Chasseur de modes » (G9.6): a melodic phrase over a tonic drone (low, soft, held);
// the player names the mode. Relative pitch only: the tonic is drawn at random each challenge.
//
// Difficulty d (0..1) -> tier of choices, then tempo / length / leaps inside the tier:
//   d < 0.2   majeur vs mineur (Ionien / Éolien), labels « Joyeux / Triste » for the kid profile (arcade.kid), real names otherwise
//   d < 0.45  3 contrasted modes (pairwise >= 2 notes apart, no inclusion)
//   d < 0.7   4 contrasted modes (diatonic + Par tons, Hirajoshi)
//   d < 0.9   neighbour pairs: Ionien/Lydien, Dorien/Éolien, Mixolydien/Ionien, Phrygien/Éolien, Hirajoshi ⊂ Éolien
//   d >= 0.9  neighbour triples (one note apart, or the inclusion pair)
//   inside a tier: tempo 0.62 -> 0.36 s per beat, more split beats (passing eighths), more leaps,
//   the key note repeated on the free strong beats only at d < 0.45.
//
// Ambiguity validator (validate(ch) -> list of failures, [] = valid; make() rejects and regenerates):
//   1. every note belongs to the mode;
//   2. the phrase starts or ends on the tonic;
//   3. the mode's characteristic note (CHAR[mode][0]: Lydien ♯4, Dorien 6M, Phrygien ♭2, Mixolydien ♭7,
//      Ionien 3M, Éolien ♭3, Hirajoshi ♭6…) is played at least once on a strong beat;
//   4. for every other choice X that does NOT contain the mode: a note of mode \ X is played on a strong beat
//      (so X cannot hold all the notes played, and the difference is heard on an accent);
//   5. inclusion rule (the mode M is a subset of a choice X, e.g. Hirajoshi ⊂ Éolien): no played note can
//      exclude X, so the ABSENCE must be decisive: (a) every note of M is played (the whole scale is exposed,
//      nothing of X \ M), and (b) at least one melodic move between two neighbouring notes of M (<= 4 semitones)
//      jumps over a note of X \ M — where X would take a step, M leaves a hole you hear.
//      Conversely, when X is the answer, rule 4 already puts a note of X \ M on a strong beat.
// Beats: one beat = one grid unit; strong beats = beats 0 and 2 of each 4-beat bar (integers, even).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  if (!AMB.arcade) return;

  // fallback copy of js/theory.js SCALES (the game reads AMB.theory when it is loaded)
  const FALLBACK = {
    'Ionien (majeur)': [0, 2, 4, 5, 7, 9, 11], 'Lydien': [0, 2, 4, 6, 7, 9, 11], 'Mixolydien': [0, 2, 4, 5, 7, 9, 10],
    'Dorien': [0, 2, 3, 5, 7, 9, 10], 'Éolien (mineur)': [0, 2, 3, 5, 7, 8, 10], 'Phrygien': [0, 1, 3, 5, 7, 8, 10],
    'Hirajoshi': [0, 2, 3, 7, 8], 'Par tons': [0, 2, 4, 6, 8, 10],
  };
  // short name -> theory.js name
  const THEORY = { Ionien: 'Ionien (majeur)', Lydien: 'Lydien', Mixolydien: 'Mixolydien', Dorien: 'Dorien', 'Éolien': 'Éolien (mineur)', Phrygien: 'Phrygien', Hirajoshi: 'Hirajoshi', 'Par tons': 'Par tons' };
  // characteristic notes, by preference (semitones above the tonic); [0] = THE characteristic note
  const CHAR = {
    Ionien: [4, 11, 5, 9], Lydien: [6, 4, 11, 9], Mixolydien: [10, 4, 5, 9], Dorien: [9, 3, 10, 5],
    'Éolien': [3, 8, 2, 10, 5], Phrygien: [1, 3, 8, 10], Hirajoshi: [8, 3, 2, 7], 'Par tons': [6, 8, 4, 10],
  };
  const BRIGHT = ['Lydien', 'Ionien', 'Mixolydien', 'Dorien', 'Éolien', 'Phrygien', 'Hirajoshi', 'Par tons']; // display order
  const PAIRS = [['Ionien', 'Lydien'], ['Dorien', 'Éolien'], ['Mixolydien', 'Ionien'], ['Phrygien', 'Éolien'], ['Hirajoshi', 'Éolien']];
  const TRIPLES = [['Lydien', 'Ionien', 'Mixolydien'], ['Ionien', 'Mixolydien', 'Dorien'], ['Mixolydien', 'Dorien', 'Éolien'], ['Dorien', 'Éolien', 'Phrygien'], ['Hirajoshi', 'Éolien', 'Phrygien']];
  const DIATONIC = ['Lydien', 'Ionien', 'Mixolydien', 'Dorien', 'Éolien', 'Phrygien'];

  const scale = (name) => { const T = AMB.theory && AMB.theory.SCALES; return (T && T[THEORY[name]]) || FALLBACK[THEORY[name]]; };
  const pcOf = (midi, root) => (((midi - root) % 12) + 12) % 12;
  const minus = (a, b) => scale(a).filter((p) => !scale(b).includes(p)); // notes of a not in b
  const subset = (a, b) => minus(a, b).length === 0;
  const far = (a, b) => !subset(a, b) && !subset(b, a) && minus(a, b).length >= 2 && minus(b, a).length >= 2;
  const combos = (pool, k) => {
    const out = [], rec = (i, acc) => { if (acc.length === k) { out.push(acc.slice()); return; } for (let j = i; j < pool.length; j++) { acc.push(pool[j]); rec(j + 1, acc); acc.pop(); } };
    rec(0, []); return out;
  };
  const allFar = (set) => set.every((a, i) => set.every((b, j) => i === j || far(a, b)));
  let SETS3 = null, SETS4 = null; // contrasted sets, computed once (theory.js may load later)
  const sets = () => {
    if (!SETS3) { SETS3 = combos(DIATONIC, 3).filter(allFar); SETS4 = combos(BRIGHT, 4).filter(allFar); }
    return { 3: SETS3, 4: SETS4 };
  };

  const order = (names) => names.slice().sort((a, b) => BRIGHT.indexOf(a) - BRIGHT.indexOf(b));
  const clamp01 = (v) => Math.max(0, Math.min(1, +v || 0));

  const game = {
    id: 'modes',
    title: 'Chasseur de modes',
    skill: 'modes',
    blurb: 'Un bourdon, une phrase : quelle couleur ? Joyeux ou triste… jusqu\'aux modes voisins.',
    kid: true,
    CHAR, PAIRS, TRIPLES,
    scale, subset, minus,
    tierOf(d) { d = clamp01(d); return d < 0.2 ? 0 : d < 0.45 ? 1 : d < 0.7 ? 2 : d < 0.9 ? 3 : 4; },
    beatSec(d) { return 0.62 - 0.26 * clamp01(d); },

    pickChoices(rng, tier) {
      if (tier === 0) return ['Ionien', 'Éolien'];
      if (tier === 1) return order(rng.pick(sets()[3]));
      if (tier === 2) return order(rng.pick(sets()[4]));
      if (tier === 3) return order(rng.pick(PAIRS));
      return order(rng.pick(TRIPLES));
    },
    // key notes: THE characteristic note, then (greedy) one distinctive note per other choice not containing the mode
    keysFor(mode, choices) {
      const keys = [CHAR[mode][0]];
      for (const x of choices) {
        if (x === mode || subset(mode, x)) continue;
        const diff = minus(mode, x);
        if (keys.some((k) => diff.includes(k))) continue;
        keys.push(CHAR[mode].find((p) => diff.includes(p)) ?? diff[0]);
      }
      return keys;
    },

    make(rng, d) {
      d = clamp01(d);
      const tier = this.tierOf(d), choices = this.pickChoices(rng, tier), mode = rng.pick(choices);
      const root = 55 + rng.int(12); // G3..F#4: relative pitch only
      for (let tries = 0; tries < 400; tries++) {
        const ch = this.phrase(rng, d, tier, mode, choices, root);
        if (!this.validate(ch).length) { ch.kid = !!AMB.arcade.kid; return ch; }
      }
      throw new Error('modes: no valid phrase'); // never happens (tests: 300 seeds × every tier)
    },

    // one candidate phrase (validated by make)
    phrase(rng, d, tier, mode, choices, root) {
      const S = scale(mode), n = S.length, keys = this.keysFor(mode, choices);
      const incl = choices.some((x) => x !== mode && subset(mode, x));
      const bars = keys.length > 3 || incl ? 3 : 2, total = bars * 4;
      // rhythm: one onset per beat, weak beats sometimes split in two eighths; the last note is held 2 beats
      const pSplit = tier === 0 ? 0 : 0.1 + 0.45 * d;
      const onsets = [];
      for (let b = 0; b <= total - 2; b++) { onsets.push(b); if (b % 2 === 1 && rng() < pSplit) onsets.push(b + 0.5); }
      const strongIdx = onsets.map((b, i) => (Number.isInteger(b) && b % 2 === 0 ? i : -1)).filter((i) => i >= 0);
      const last = onsets.length - 1;
      const tonicAt = tier === 0 || rng() < 0.5 ? 'both' : rng() < 0.5 ? 'start' : 'end';
      // melodic walk in scale degrees (degree k -> octave floor(k/n), within [-2, n + 3])
      const lo = -2, hi = n + 3, leap = 0.1 + 0.4 * d;
      const deg = [];
      let k = rng.int(n + 1);
      for (let i = 0; i < onsets.length; i++) {
        if (i) {
          let step = rng() < leap ? (2 + rng.int(3)) : 1;
          if (rng() < 0.5) step = -step;
          k = Math.max(lo, Math.min(hi, k + step));
        }
        deg.push(k);
      }
      const nearest = (pc, around) => { // degree of pc closest to `around`
        const idx = S.indexOf(pc); let best = null;
        for (let o = -1; o <= 2; o++) { const c = idx + o * n; if (c >= lo && c <= hi && (best == null || Math.abs(c - around) < Math.abs(best - around))) best = c; }
        return best;
      };
      if (tonicAt !== 'end') deg[0] = nearest(0, deg[0]);
      if (tonicAt !== 'start') deg[last] = nearest(0, deg[last - 1]);
      // key notes on strong beats (not on a tonic slot)
      const free = strongIdx.filter((i) => !(i === 0 && tonicAt !== 'end') && !(i === last && tonicAt !== 'start'));
      for (let i = free.length - 1; i > 0; i--) { const j = rng.int(i + 1); [free[i], free[j]] = [free[j], free[i]]; }
      keys.forEach((p, j) => { if (j < free.length) deg[free[j]] = nearest(p, deg[Math.max(0, free[j] - 1)]); });
      if (d < 0.45) for (let j = keys.length; j < free.length; j++) if (rng() < 0.6) deg[free[j]] = nearest(keys[rng.int(keys.length)], deg[Math.max(0, free[j] - 1)]);
      if (incl) { // the subset mode is shown whole: sprinkle its missing notes on weak beats
        const weak = onsets.map((_, i) => i).filter((i) => !strongIdx.includes(i) && i !== last && i !== 0);
        for (const p of S) if (!deg.some((x) => S[((x % n) + n) % n] === p) && weak.length) { const i = weak.splice(rng.int(weak.length), 1)[0]; deg[i] = nearest(p, deg[i - 1]); }
      }
      const notes = onsets.map((b, i) => ({ beat: b, midi: root + S[((deg[i] % n) + n) % n] + 12 * Math.floor(deg[i] / n), strong: Number.isInteger(b) && b % 2 === 0 }));
      return { mode, choices, root, notes, total, tier, d, beat: this.beatSec(d), keys, answer: mode };
    },

    // the ambiguity validator: [] = valid, else the reasons
    validate(ch) {
      const bad = [], S = scale(ch.mode), N = ch.notes || [];
      if (!N.length) return ['vide'];
      const pcs = N.map((x) => pcOf(x.midi, ch.root)), played = new Set(pcs);
      const strongPcs = new Set(N.filter((x) => x.strong).map((x) => pcOf(x.midi, ch.root)));
      if (pcs.some((p) => !S.includes(p))) bad.push('note hors du mode');
      if (pcs[0] !== 0 && pcs[pcs.length - 1] !== 0) bad.push('ni début ni fin sur la tonique');
      if (!strongPcs.has(CHAR[ch.mode][0])) bad.push('note caractéristique absente des temps forts');
      for (const x of ch.choices) {
        if (x === ch.mode) continue;
        if (!subset(ch.mode, x)) {
          if (!minus(ch.mode, x).some((p) => strongPcs.has(p))) bad.push('rien ne distingue ' + x + ' sur un temps fort');
          continue;
        }
        // inclusion rule
        const extra = minus(x, ch.mode);
        if (!S.every((p) => played.has(p))) bad.push('inclusion ' + ch.mode + ' ⊂ ' + x + ' : gamme pas jouée en entier');
        const hole = N.some((a, i) => {
          if (!i) return false;
          const lo = Math.min(a.midi, N[i - 1].midi), hi = Math.max(a.midi, N[i - 1].midi);
          if (hi - lo > 4 || hi - lo < 2) return false;
          let gap = false;
          for (let m = lo + 1; m < hi; m++) { const p = pcOf(m, ch.root); if (S.includes(p)) return false; if (extra.includes(p)) gap = true; }
          return gap;
        });
        if (!hole) bad.push('inclusion ' + ch.mode + ' ⊂ ' + x + ' : aucun trou entendu');
      }
      return bad;
    },

    // kid profile (ch.kid = arcade.kid at make time): « Joyeux / Triste »; a musician reads the real names
    label(name, tier, kid) {
      if (tier === 0) return kid ? (name === 'Ionien' ? '☀ Joyeux' : '☂ Triste') : (name === 'Ionien' ? '☀ Ionien (majeur)' : '☂ Éolien (mineur)');
      return name;
    },
    choices(ch) { return ch.choices.map((c) => ({ value: c, label: this.label(c, ch.tier, ch.kid) })); },
    check(ch, a) { return { ok: a === ch.answer }; },

    LEAD: 0.9, // the drone sounds alone first: the tonic is set before the phrase
    timing(ch) { // seconds of each onset, from the start of the stimulus
      return ch.notes.map((x) => this.LEAD + x.beat * ch.beat);
    },
    stimulus(ch) {
      const T = this.timing(ch), end = this.LEAD + ch.total * ch.beat;
      const ev = [
        { t: 0, midi: ch.root - 12, dur: end + 0.6, vel: 0.5, voice: 'sine' },
        { t: 0, midi: ch.root - 24, dur: end + 0.6, vel: 0.4, voice: 'sine' },
      ];
      ch.notes.forEach((x, i) => {
        const next = i < T.length - 1 ? T[i + 1] : end;
        ev.push({ t: T[i], midi: x.midi, dur: Math.max(0.12, (next - T[i]) * 0.9), vel: x.strong ? 0.85 : 0.6, voice: 'triangle' });
      });
      return ev;
    },
    // custom playback: same events, plus the beat strip lit in time (visual rhythm only, no pitch shown)
    play(ch, api) {
      const res = api.play(this.stimulus(ch));
      this.light(ch, res);
      return res;
    },
    light(ch, res) {
      const strip = this.stage && this.stage.querySelector('.arc-modes-strip');
      if (!strip || !res) return;
      const now = typeof performance !== 'undefined' ? performance.now() : 0, base = res.t0 ? res.t0 - now : 100, T = this.timing(ch);
      strip.querySelectorAll('.arc-modes-dot').forEach((el, i) => {
        el.classList.remove('lit'); void el.offsetWidth; // restart the animation on replay
        el.style.animationDelay = `${Math.max(0, base + T[i] * 1000)}ms`;
        el.classList.add('lit');
      });
      const dr = strip.querySelector('.arc-modes-drone');
      if (dr) { dr.classList.remove('lit'); void dr.offsetWidth; dr.style.animationDelay = `${Math.max(0, base)}ms`; dr.classList.add('lit'); }
    },
    render(ch, el) {
      this.stage = el;
      const hint = ch.tier === 0 ? '☀ joyeux = majeur · ☂ triste = mineur'
        : ch.tier < 3 ? 'Le bourdon = la tonique · écoute les temps forts' : 'Modes voisins : une seule note change';
      const dots = ch.notes.map((x) => `<i class="arc-modes-dot${x.strong ? ' strong' : ''}" style="left:${(x.beat / ch.total) * 100}%"></i>`).join('');
      el.innerHTML = `<div class="arc-modes-stage${ch.tier ? ' arc-modes-names' : ''}"><p class="arc-modes-hint">${hint}</p>`
        + `<div class="arc-modes-strip" aria-hidden="true">${dots}<b class="arc-modes-drone"></b></div></div>`;
    },
  };

  AMB.arcade.register(game);
})();
