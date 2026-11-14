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

  // Render a span of music into the event arrays, reading parameters through `get`
  // (live store for loop export, a section snapshot for song export).
  // fit (S6.7): a song section's bars, the progression fits in it as the sequencer plays it
  function renderSpan(get, s0, span, out, loops = [], fit = 0) {
    const PR = AMB.pianoRoll, PU = AMB.pulses, BS = AMB.bassSeq;
    const root = T.NOTE_NAMES.indexOf(get('global.key')), scale = T.SCALES[get('global.scale')] || T.SCALES['Lydien'];
    const barLen = get('pad.length');
    // progression (same rules as the sequencer)
    let prog = [], durs = [];
    if (get('pad.prog') === 'Perso') {
      for (const tok of String(get('pad.custom')).split(/[\s,;]+/)) {
        const [d, bb] = tok.split(':').map((x) => parseInt(x, 10));
        if (d >= 1 && d <= 14) { prog.push(d - 1); durs.push(bb >= 1 && bb <= 16 ? bb : barLen); }
      }
    } else if (T.progDegrees(get('pad.prog'), scale)) { prog = T.progDegrees(get('pad.prog'), scale); durs = prog.map(() => barLen); }
    if (!prog.length) { prog = [AMB.seq.chordDeg || 0]; durs = [barLen]; }
    if (fit) durs = T.fitBars(durs, fit);
    const progBars = durs.reduce((x, y) => x + y, 0);
    const chordAt = (rel) => { let b = Math.floor(rel / 16) % progBars; for (let i = 0; i < prog.length; i++) { if (b < durs[i]) return prog[i]; b -= durs[i]; } return prog[0]; };
    const dm = (deg, oct) => T.degreeToMidi(deg, root, scale, oct);

    // chords: stacked thirds, 3–5 notes depending on « Accords riches »
    if (get('pad.on')) {
      const size = 3 + Math.round(get('pad.voicing') * 2);
      for (let rel = 0, k = 0; rel < span; k++) {
        const len = Math.min(16 * durs[k % durs.length], span - rel);
        T.chordDegrees(chordAt(rel), size, scale).forEach((d, i) => note(out.ch, 0, (s0 + rel) * STEP, len * STEP - 4, dm(d, 3) + (i === 0 ? -12 : 0), 70));
        rel += 16 * durs[k % durs.length];
      }
    }
    // written melody (piano roll chain); the arpeggio is not exported
    if (get('seq.on') && get('seq.mode') !== 'Arpège') {
      const steps = parseInt(get('seq.steps'), 10) || 32;
      const chainStr = String(get('seq.chain') || '').toUpperCase().match(/[ABCD]/g);
      const chain = chainStr && chainStr.length ? chainStr : [get('seq.slot')];
      const oct = parseInt(get('seq.octave'), 10) || 0, follow = get('seq.follow');
      for (let r0 = 0, k = 0; r0 < span; r0 += steps, k++) {
        for (const n of PR.parse(get(PR.SLOTKEY[chain[k % chain.length]]))) {
          if (n.s >= steps) continue;
          const rel = r0 + n.s; if (rel >= span) continue;
          note(out.pr, 1, (s0 + rel) * STEP, Math.min(n.l, span - rel) * STEP - 2, dm(n.r + (follow ? chordAt(rel) : 0), 3 + oct) + (n.a || 0), 40 + n.v * 9);
        }
      }
    }
    // bass grid (follows the chords)
    if (get('bass.on') && BS) {
      const g = BS.parse(get('bass.pattern')), oct = 2 + (parseInt(get('bass.octave'), 10) || 0);
      for (let rel = 0; rel < span; rel++) {
        const i = rel % 16;
        let len = 1; while (len < 16 && !g.some((row) => row[(i + len) % 16])) len++;
        const cd = chordAt(rel), nd = chordAt(rel + 16);
        g.forEach((row, r) => {
          if (!row[i]) return;
          const m = r === 0 ? dm(cd, oct) : r === 1 ? dm(cd + 4, oct) : r === 2 ? dm(cd, oct) + 12 : dm(nd !== cd ? nd + (nd > cd ? -1 : 1) : cd + 1, oct);
          note(out.bs, 2, (s0 + rel) * STEP, Math.min(len, span - rel) * STEP - 2, m, 90);
        });
      }
    }
    // Pulsations on the GM drum channel (9): kick, maracas, hi wood block, triangle
    if (get('perc.on')) {
      const DRUM = [36, 70, 76, 81], grid = PU.parse(get('perc.pattern'), parseInt(get('perc.steps'), 10) || 16);
      for (let rel = 0; rel < span; rel++) grid.forEach((row, t) => { const lvl = row[rel % row.length]; if (lvl) note(out.dr, 9, (s0 + rel) * STEP, STEP - 2, DRUM[t], [0, 50, 85, 115][lvl] || 85); });
    }
    // S6.4: the section's loop layers (played timing kept to the tick, velocity, key of the section), channel 4
    for (const l of loops) {
      if (!l || l.mute || !l.notes) continue;
      const len = l.bars * 16;
      for (let r0 = 0; r0 < span; r0 += len) for (const n of l.notes) {
        const rel = r0 + n.s; if (rel >= span) continue;
        if (n.c != null) T.chordDegrees(n.c, 3, scale).forEach((d) => note(out.lp, 3, Math.round((s0 + rel) * STEP), STEP * 4, dm(d, 3), 80));
        else note(out.lp, 3, Math.round((s0 + rel) * STEP), Math.round(Math.min(n.l || 1, span - rel) * STEP) - 2, dm(n.d, 0) + (n.a || 0), (n.b != null ? n.b : n.v) * 127);
      }
    }
    return { progBars };
  }

  // whole song when it has sections, otherwise the current loop (a whole number of cycles, ≤ 64 bars)
  function build(opts = {}) {
    const song = AMB.song, useSong = opts.song !== false && song && song.sections.length;
    const out = { ch: [], pr: [], bs: [], dr: [], lp: [] };
    let totalSteps = 0, bars;
    const live = (k) => store.get(k);
    if (useSong) {
      for (const sec of song.sections) {
        const get = song.getter(sec); // the section's own sound, motifs and progression
        renderSpan(get, totalSteps, sec.bars * 16, out, sec.loops || [], sec.bars);
        totalSteps += sec.bars * 16;
      }
      bars = totalSteps / 16;
    } else {
      const steps = parseInt(store.get('seq.steps'), 10) || 32;
      const chain = AMB.pianoRoll.chainList().length ? AMB.pianoRoll.chainList() : [store.get('seq.slot')];
      const probe = renderSpan(live, 0, 0, { ch: [], pr: [], bs: [], dr: [] });
      const seqBars = (chain.length * steps) / 16;
      bars = Math.max(probe.progBars, seqBars, 4);
      for (let b = bars; b <= 64; b++) if (b % probe.progBars === 0 && b % seqBars === 0) { bars = b; break; }
      bars = Math.min(64, bars);
      totalSteps = bars * 16;
      renderSpan(live, 0, totalSteps, out);
    }
    const bpm = store.get('global.tempo'), usq = Math.round(60000000 / bpm);
    const title = useSong ? 'JunoJuno · morceau' : `${store.get('global.key')} ${store.get('global.scale')}`;
    const meta = [
      { t: 0, bytes: [0xff, 0x51, 3, (usq >> 16) & 255, (usq >> 8) & 255, usq & 255] },
      { t: 0, bytes: [0xff, 0x58, 4, 4, 2, 24, 8] },
      { t: 0, bytes: [0xff, 0x01, ...vlq(str(title).length), ...str(title)] },
    ];
    if (useSong) { // section names as markers
      let t = 0;
      for (const sec of song.sections) { meta.push({ t, bytes: [0xff, 0x06, ...vlq(str(sec.name).length), ...str(sec.name)] }); t += sec.bars * 16 * STEP; }
    }
    const tracks = [track('JunoJuno', meta)];
    if (out.ch.length) tracks.push(track('Accords (Pad)', out.ch));
    if (out.pr.length) tracks.push(track('Mélodie écrite', out.pr));
    if (out.bs.length) tracks.push(track('Basse', out.bs));
    if (out.dr.length) tracks.push(track('Pulsations', out.dr));
    if (out.lp.length) tracks.push(track('Boucles', out.lp));
    const header = [...str('MThd'), ...u32(6), 0, 1, 0, tracks.length, (PPQ >> 8) & 255, PPQ & 255];
    return { bytes: new Uint8Array([...header, ...tracks.flat()]), bars, tracks: tracks.length, song: !!useSong };
  }

  // ---------- import: Standard MIDI File -> piano-roll notes (quantised to 16ths; notes off the scale keep their ♯) ----------
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
    const PR = AMB.pianoRoll;
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
    const out = []; let cut = 0;
    for (const n of notes) {
      const s = Math.round((n.tick - t0) / q);
      if (s < 0 || s >= len) { cut++; continue; }
      const c = PR.cellFor(n.midi, 0, oct);
      if (out.some((x) => x.s === s && x.r === c.r)) continue;
      out.push({ s, r: c.r, l: Math.max(1, Math.min(len - s, Math.round(n.dur / q))), v: Math.max(1, Math.min(9, Math.round(n.vel / 14))), p: 10, ...(c.a ? { a: c.a } : {}) });
    }
    store.set('seq.steps', String(len), 'user');
    store.set('seq.octave', String(Math.max(-1, Math.min(1, oct - 3))), 'user');
    store.set('seq.follow', false, 'user'); // play as written
    store.set('seq.mode', 'Piano roll', 'user');
    PR.roll.save(out);
    store.set('seq.on', true, 'user');
    AMB.ui.toast(`${out.length} notes importées` + (cut ? ` · seules les 4 premières mesures sont gardées` : ''));
    return out.length;
  }

  function exportMidi() {
    const { bytes, bars, song } = build();
    AMB.rec.download(new Blob([bytes], { type: 'audio/midi' }), 'mid');
    AMB.ui.toast(`MIDI exporté · ${song ? 'morceau entier, ' : ''}${bars} mesures`);
  }

  AMB.midiExport = { build, exportMidi, parseSmf, importMidi };
})();
