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

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

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

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  AMB.theory = {
    NOTE_NAMES, SCALES, mtof, degreeToMidi, chordDegrees,
    CHORD_MOVES, CHORD_WEIGHTS, weightedPick,
  };
  AMB.util = { rand, randInt, pick, clamp, lerp };
})();
