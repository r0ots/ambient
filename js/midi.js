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
    const durs = prog.map((_, i) => (seq.chordBars ? seq.chordBars(i) : barLen));
    const progBars = durs.reduce((a, b) => a + b, 0), seqBars = (chain.length * steps) / 16;
    // a whole number of both cycles, capped to 64 bars
    let bars = Math.max(progBars, seqBars, 4);
    for (let b = bars; b <= 64; b++) if (b % progBars === 0 && b % seqBars === 0) { bars = b; break; }
    bars = Math.min(64, bars);
    const totalSteps = bars * 16;
    const chordAt = (step) => { let b = Math.floor(step / 16) % progBars; for (let i = 0; i < prog.length; i++) { if (b < durs[i]) return prog[i]; b -= durs[i]; } return prog[0]; };

    // tempo + time signature + key name
    const usq = Math.round(60000000 / bpm);
    const meta = [
      { t: 0, bytes: [0xff, 0x51, 3, (usq >> 16) & 255, (usq >> 8) & 255, usq & 255] },
      { t: 0, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] },
      { t: 0, bytes: [0xff, 0x01, ...vlq(str(`${store.get('global.key')} ${store.get('global.scale')}`).length), ...str(`${store.get('global.key')} ${store.get('global.scale')}`)] },
    ];

    // chords (channel 0)
    const ch = [];
    const savedUpper = seq.lastUpper; // chordMidis voice-leads from the previous chord: restore after export
    seq.lastUpper = null;
    for (let s = 0, k = 0; s < totalSteps; k++) {
      const len = 16 * durs[k % durs.length];
      const midis = seq.chordMidis(chordAt(s));
      for (const m of midis) note(ch, 0, s * STEP, len * STEP - 4, m, 70);
      s += len;
    }

    seq.lastUpper = savedUpper;

    // piano roll chain (channel 1)
    const pr = [];
    const oct = parseInt(store.get('seq.octave'), 10) || 0, follow = store.get('seq.follow');
    for (let s0 = 0, k = 0; s0 < totalSteps; s0 += steps, k++) {
      const notes = PR.parse(store.get(PR.SLOTKEY[chain[k % chain.length]]));
      for (const n of notes) {
        if (n.s >= steps) continue; // beyond the current motif length: not played
        const s = s0 + n.s; if (s >= totalSteps) continue;
        const deg = n.r + (follow ? chordAt(s) : 0);
        note(pr, 1, s * STEP, n.l * STEP - 2, T.degreeToMidi(deg, seq.root, seq.scale, 3 + oct), 40 + n.v * 9);
      }
    }

    // Pulsations on the GM drum channel (9): kick, maracas, hi wood block, triangle
    const dr = [], DRUM = [36, 70, 76, 81];
    const grid = PU.parse(store.get('perc.pattern'));
    for (let s = 0; s < totalSteps; s++) grid.forEach((row, t) => { const lvl = row[s % row.length]; if (lvl) note(dr, 9, s * STEP, STEP - 2, DRUM[t], [0, 50, 85, 115][lvl] || 85); });

    const tracks = [track('Ambient', meta), track('Accords (Pad)', ch)];
    if (pr.length && store.get('seq.on') && store.get('seq.mode') !== 'Arpège') tracks.push(track('Séquenceur', pr));
    if (dr.length && store.get('perc.on')) tracks.push(track('Pulsations', dr));
    const header = [...str('MThd'), ...u32(6), 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
    return { bytes: new Uint8Array([...header, ...tracks.flat()]), bars, tracks: tracks.length };
  }

  // ---------- import: Standard MIDI File -> piano-roll notes (quantised to 16ths and to the scale) ----------
  function parseSmf(buf) {
    const d = new DataView(buf); let p = 0;
    const rd = (n) => { let v = 0; for (let i = 0; i < n; i++) v = (v << 8) | d.getUint8(p++); return v >>> 0; };
    const vl = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    const tag = () => String.fromCharCode(rd(1), rd(1), rd(1), rd(1));
    if (tag() !== 'MThd') throw new Error('not a MIDI file');
    const hl = rd(4); rd(2); const ntr = rd(2); const ppq = rd(2); p += hl - 6;
    const tracks = [];
    for (let t = 0; t < ntr && p < d.byteLength; t++) {
      if (tag() !== 'MTrk') break;
      const len = rd(4), end = p + len; let tick = 0, run = 0; const on = {}, notes = [];
      while (p < end) {
        tick += vl();
        let st = d.getUint8(p);
        if (st & 0x80) p++; else st = run;
        if (st === 0xff) { p++; const l = vl(); p += l; continue; }
        if (st === 0xf0 || st === 0xf7) { const l = vl(); p += l; continue; }
        run = st;
        const type = st & 0xf0, ch = st & 15;
        const a = d.getUint8(p++), b = type === 0xc0 || type === 0xd0 ? 0 : d.getUint8(p++);
        if (ch === 9) continue; // ignore drums
        if (type === 0x90 && b > 0) on[a] = { tick, vel: b };
        else if ((type === 0x80 || (type === 0x90 && b === 0)) && on[a]) { notes.push({ tick: on[a].tick, dur: tick - on[a].tick, midi: a, vel: on[a].vel }); delete on[a]; }
      }
      p = end;
      tracks.push(notes);
    }
    return { ppq, tracks };
  }

  async function importMidi(file) {
    const PR = AMB.pianoRoll, seq = AMB.seq;
    const { ppq, tracks } = parseSmf(await file.arrayBuffer());
    const notes = tracks.sort((a, b) => b.length - a.length)[0] || [];
    if (!notes.length) { AMB.ui.toast('Aucune note trouvée dans ce fichier'); return 0; }
    const q = ppq / 4;
    notes.sort((a, b) => a.tick - b.tick);
    const t0 = Math.floor(notes[0].tick / q / 16) * 16 * q; // start at the bar of the earliest note-on
    const lastStep = Math.max(...notes.map((n) => Math.round((n.tick - t0) / q)));
    const len = lastStep < 16 ? 16 : lastStep < 32 ? 32 : 64;
    // map pitches to scale degrees; pick the octave so the lowest note lands on the bottom rows
    const minMidi = Math.min(...notes.map((n) => n.midi));
    const oct = Math.max(1, Math.min(6, Math.floor(minMidi / 12) - 1));
    const rowOf = (m) => {
      let best = 0, bd = 99;
      for (let r = 0; r < PR.ROWS; r++) {
        const dm = Math.abs(T.degreeToMidi(r, seq.root, seq.scale, oct) - m);
        if (dm < bd) { bd = dm; best = r; }
      }
      return best;
    };
    const out = []; let cut = 0;
    for (const n of notes) {
      const s = Math.round((n.tick - t0) / q);
      if (s < 0 || s >= len) { cut++; continue; }
      const r = rowOf(n.midi);
      if (out.some((x) => x.s === s && x.r === r)) continue;
      out.push({ s, r, l: Math.max(1, Math.min(len - s, Math.round(n.dur / q))), v: Math.max(1, Math.min(9, Math.round(n.vel / 14))), p: 10 });
    }
    store.set('seq.steps', String(len), 'user');
    store.set('seq.octave', String(Math.max(-1, Math.min(1, oct - 3))), 'user');
    store.set('seq.follow', false, 'user'); // play as written
    store.set('seq.mode', 'Piano roll', 'user');
    PR.roll.save(out);
    store.set('seq.on', true, 'user');
    AMB.ui.toast(`${out.length} notes importées (quantifiées sur la gamme)` + (cut ? ` · seules les 4 premières mesures sont gardées` : ''));
    return out.length;
  }

  function exportMidi() {
    const { bytes, bars } = build();
    AMB.rec.download(new Blob([bytes], { type: 'audio/midi' }), 'mid');
    AMB.ui.toast(`MIDI exporté · ${bars} mesures`);
  }

  AMB.midiExport = { build, exportMidi, parseSmf, importMidi };
})();
