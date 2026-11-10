// Music theory helpers: scales, chords, random utilities
(function () {
  const AMB = (window.AMB = window.AMB || {});

  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const SCALES = {
    'Ionien (majeur)': [0, 2, 4, 5, 7, 9, 11],
    'Lydien': [0, 2, 4, 6, 7, 9, 11],
    'Mixolydien': [0, 2, 4, 5, 7, 9, 10],
    'Dorien': [0, 2, 3, 5, 7, 9, 10],
    'Éolien (mineur)': [0, 2, 3, 5, 7, 8, 10],
    'Phrygien': [0, 1, 3, 5, 7, 8, 10],
    'Pentatonique maj.': [0, 2, 4, 7, 9],
    'Pentatonique min.': [0, 3, 5, 7, 10],
    'Hirajoshi': [0, 2, 3, 7, 8],
    'In Sen': [0, 1, 5, 7, 10],
    'Par tons': [0, 2, 4, 6, 8, 10],
  };

  // reference pitch is mutable (440 / 432 Hz) and read at call time
  const mtof = (m) => AMB.theory.A4 * Math.pow(2, (m - 69) / 12);

  // Returns midi note for a scale degree (can be negative / > length)
  function degreeToMidi(degree, root, scale, baseOctave) {
    const n = scale.length;
    const oct = Math.floor(degree / n);
    const idx = ((degree % n) + n) % n;
    return 12 * (baseOctave + 1) + root + scale[idx] + 12 * oct;
  }

  // Build a chord (stacked thirds in scale) on a degree. size 3..5
  function chordDegrees(degree, size, scale) {
    // For pentatonic/whole-tone scales thirds are irregular; stacking every 2nd degree still sounds consonant enough.
    const out = [];
    for (let i = 0; i < size; i++) out.push(degree + i * 2);
    return out;
  }

  // Weighted random walk of chord roots that favours ambient-friendly movement
  const CHORD_MOVES = [0, 3, -3, 2, -2, 4, -4, 1, -1, 5];
  const CHORD_WEIGHTS = [0.5, 3, 3, 2, 2, 1.5, 1.5, 1, 1, 1];

  function weightedPick(items, weights, rnd = Math.random) {
    let total = 0;
    for (const w of weights) total += w;
    let r = rnd() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // Human-readable chord name from midi notes (root = first note)
  function chordName(midis) {
    if (!midis || !midis.length) return '—';
    const root = midis[0];
    const ivs = new Set(midis.map((m) => (((m - root) % 12) + 12) % 12));
    const has = (i) => ivs.has(i);
    let tri = '', sus = '';
    if (has(4) && has(8) && !has(7)) tri = 'aug';
    else if (has(3) && has(6) && !has(7)) tri = 'dim';
    else if (has(3)) tri = 'm';
    else if (!has(4) && has(5)) sus = 'sus4';
    else if (!has(4) && has(2)) sus = 'sus2';
    let sev = has(11) ? 'maj7' : has(10) ? '7' : '';
    if (tri === 'dim' && has(10)) { tri = 'm'; sev = '7♭5'; }
    const ext = [];
    if (has(2) && sus !== 'sus2') {
      if (sev && sev !== '7♭5') { sev = sev.replace('7', '9'); } else ext.push('add9');
    }
    if (has(5) && sus !== 'sus4' && !tri.startsWith('aug')) ext.push(sev ? '11' : 'add11');
    if (has(6) && tri !== 'dim' && sev !== '7♭5') ext.push('♯11');
    if (has(9) && tri !== 'dim') ext.push(sev ? '13' : '6');
    if (tri === 'm' && sev === 'maj7') sev = '(maj7)';
    let e = '';
    if (ext.length === 2 && ext[0] === 'add9' && ext[1] === '6') e = '6/9';
    else if (ext.length === 1 && !sev && !sus) e = ext[0];
    else if (ext.length) e = '(' + ext.map((x) => x.replace('add', '')).join(',') + ')';
    return NOTE_NAMES[((root % 12) + 12) % 12] + tri + sev + sus + e;
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  AMB.theory = {
    A4: 440,
    NOTE_NAMES, SCALES, mtof, degreeToMidi, chordDegrees, chordName,
    CHORD_MOVES, CHORD_WEIGHTS, weightedPick,
  };
  // "human" feel for sequenced parts: small timing drift (up to ±25 ms) and velocity spread
  const human = () => { const h = AMB.store ? AMB.store.get('global.humanize') || 0 : 0; return { dt: (Math.random() - 0.5) * 0.05 * h, dv: 1 - Math.random() * 0.35 * h }; };
  AMB.util = { rand, randInt, pick, clamp, lerp, human };
})();
