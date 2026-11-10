// Standard MIDI File export (type 1): tempo, chord progression (Pad), piano-roll chain and Pulsations.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const T = AMB.theory;
  const PPQ = 96, STEP = PPQ / 4; // ticks per quarter / per 16th

  const vlq = (n) => { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; };
  const str = (s) => Array.from(new TextEncoder().encode(s));
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

  // events: [{t, bytes}] -> track chunk
  function track(name, events) {
    const all = [{ t: 0, bytes: [0xff, 0x03, ...vlq(str(name).length), ...str(name)] }, ...events]
      .sort((a, b) => a.t - b.t || (a.off ? -1 : 0) - (b.off ? -1 : 0)); // note-offs before note-ons at equal times
    const data = []; let last = 0;
    for (const e of all) { data.push(...vlq(Math.max(0, e.t - last)), ...e.bytes); last = e.t; }
    data.push(0, 0xff, 0x2f, 0);
    return [...str('MTrk'), ...u32(data.length), ...data];
  }
  const note = (events, ch, t, dur, n, vel) => {
    if (n < 0 || n > 127) return;
    events.push({ t, bytes: [0x90 | ch, n, Math.max(1, Math.min(127, Math.round(vel)))] });
    events.push({ t: t + Math.max(1, dur), bytes: [0x80 | ch, n, 0], off: true });
  };

  function build() {
    const seq = AMB.seq, PR = AMB.pianoRoll, PU = AMB.pulses;
    const bpm = store.get('global.tempo');
    const barLen = store.get('pad.length');
    // progression: fixed list when available, otherwise the chord playing now
    const prog = (seq.progression && seq.progression()) || [seq.chordDeg || 0];
    const steps = parseInt(store.get('seq.steps'), 10) || 32;
    const chain = PR.chainList().length ? PR.chainList() : [store.get('seq.slot')];
    const progBars = prog.length * barLen, seqBars = (chain.length * steps) / 16;
    // a whole number of both cycles, capped to 64 bars
    let bars = Math.max(progBars, seqBars, 4);
    for (let b = bars; b <= 64; b++) if (b % progBars === 0 && b % seqBars === 0) { bars = b; break; }
    bars = Math.min(64, bars);
    const totalSteps = bars * 16;
    const chordAt = (step) => prog[Math.floor(step / (16 * barLen)) % prog.length];

    // tempo + time signature + key name
    const usq = Math.round(60000000 / bpm);
    const meta = [
      { t: 0, bytes: [0xff, 0x51, 3, (usq >> 16) & 255, (usq >> 8) & 255, usq & 255] },
      { t: 0, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] },
      { t: 0, bytes: [0xff, 0x01, ...vlq(str(`${store.get('global.key')} ${store.get('global.scale')}`).length), ...str(`${store.get('global.key')} ${store.get('global.scale')}`)] },
    ];

    // chords (channel 0)
    const ch = [];
    for (let s = 0; s < totalSteps; s += 16 * barLen) {
      const savedUpper = seq.lastUpper; // chordMidis voice-leads from the previous chord: keep it local
      const midis = seq.chordMidis(chordAt(s));
      seq.lastUpper = savedUpper;
      for (const m of midis) note(ch, 0, s * STEP, 16 * barLen * STEP - 4, m, 70);
    }

    // piano roll chain (channel 1)
    const pr = [];
    const oct = parseInt(store.get('seq.octave'), 10) || 0, follow = store.get('seq.follow');
    for (let s0 = 0, k = 0; s0 < totalSteps; s0 += steps, k++) {
      const notes = PR.parse(store.get(PR.SLOTKEY[chain[k % chain.length]]));
      for (const n of notes) {
        const s = s0 + n.s; if (s >= totalSteps) continue;
        const deg = n.r + (follow ? chordAt(s) : 0);
        note(pr, 1, s * STEP, n.l * STEP - 2, T.degreeToMidi(deg, seq.root, seq.scale, 3 + oct), 40 + n.v * 9);
      }
    }

    // Pulsations on the GM drum channel (9): kick, maracas, hi wood block, triangle
    const dr = [], DRUM = [36, 70, 76, 81];
    const grid = PU.parse(store.get('perc.pattern'));
    for (let s = 0; s < totalSteps; s++) grid.forEach((row, t) => { if (row[s % 16]) note(dr, 9, s * STEP, STEP - 2, DRUM[t], s % 4 === 0 ? 100 : 75); });

    const tracks = [track('Ambient', meta), track('Accords (Pad)', ch)];
    if (pr.length) tracks.push(track('Séquenceur', pr));
    if (dr.length && store.get('perc.on')) tracks.push(track('Pulsations', dr));
    const header = [...str('MThd'), ...u32(6), 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
    return { bytes: new Uint8Array([...header, ...tracks.flat()]), bars, tracks: tracks.length };
  }

  function exportMidi() {
    const { bytes, bars } = build();
    AMB.rec.download(new Blob([bytes], { type: 'audio/midi' }), 'mid');
    AMB.ui.toast(`MIDI exporté · ${bars} mesures`);
  }

  AMB.midiExport = { build, exportMidi };
})();
