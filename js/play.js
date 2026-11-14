// Live playing over the generative landscape: computer keyboard + Web MIDI
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;

  // Physical key positions (e.code) so it works on AZERTY and QWERTY alike.
  const MELODY_LOW = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'];
  const MELODY_HIGH = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'];
  const CHORDS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM'];

  function onKey(e) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    let i;
    // in the path, notes play from the Graine (S5.7: the first challenge is a note), forcing chords needs the Pad
    const g = AMB.game, can = (id) => !g || g.isUnlocked(id), note = MELODY_LOW.includes(e.code) || MELODY_HIGH.includes(e.code);
    if (CHORDS.includes(e.code) && !can('h.pad')) return;
    // notes sound when stopped too, once audio has been started once (in the path, a note key starts it: S5.7)
    if (!AMB.engine.ctx && !(note && g && g.path && wakeAudio(true))) return;
    if (note) firstNote();
    if ((i = MELODY_LOW.indexOf(e.code)) >= 0) press('k' + e.code, AMB.seq.playDegree(i, e.shiftKey ? 0.5 : 0.85, true, e.timeStamp), i < PADS.length ? i : null);
    else if ((i = MELODY_HIGH.indexOf(e.code)) >= 0) press('k' + e.code, AMB.seq.playDegree(i + 7, e.shiftKey ? 0.5 : 0.85, true, e.timeStamp));
    else if ((i = CHORDS.indexOf(e.code)) >= 0) { AMB.seq.forceChord(i); tapChord(i); }
    else return;
    e.preventDefault();
  }

  function onKeyUp(e) { lift('k' + e.code, false, e.timeStamp); }

  // ---------- held notes: key → live handle; the sustain pedal (CC64) delays the releases ----------
  const held = new Map(); // key ('k' + e.code or 'm' + midi note) → handle from AMB.seq.playMidi
  const sustained = new Set(); // handles released while the pedal is down
  let pedal = false;
  // pad = the on-screen key it shows on (index 0..8), else the one nearest to the note played (padForMidi)
  function press(key, h, pad = null) {
    lift(key, true); // same key struck again: the previous note ends
    keyUp(key);
    if (h && typeof h === 'object') held.set(key, h); // (a stub or a silent engine returns no handle)
    const b = padEl(pad != null ? pad : h && typeof h === 'object' && h.midi != null ? padForMidi(h.midi) : -1);
    if (b) { struck.set(key, b); strike(b, true); }
  }
  // stamp: the input event's timeStamp, so a recorded length is the one played (not the handling delay)
  function lift(key, now = false, stamp = null) {
    keyUp(key);
    const h = held.get(key);
    if (!h) return;
    held.delete(key);
    if (pedal && !now) sustained.add(h);
    else AMB.seq.endLive(h, stamp);
  }
  function setPedal(down, stamp = null) {
    pedal = down;
    if (down) return;
    sustained.forEach((h) => AMB.seq.endLive(h, stamp));
    sustained.clear();
  }
  // stop, MIDI unplugged, focus lost: every note ends, the pedal is considered up, a held chord is let go
  function panic() {
    padsUp();
    held.forEach((h) => AMB.seq.endLive(h));
    held.clear();
    setPedal(false);
    lowDown.clear(); lowNew = []; clearTimeout(lowTimer); lowTimer = null;
    if (chordHeld) { chordHeld = false; AMB.seq.releaseChord(); }
  }

  // nearest scale degree (0..n-1) for a pitch class
  function degreeForPitch(midi) {
    const sc = AMB.seq.scale, root = AMB.seq.root;
    const pc = (((midi - root) % 12) + 12) % 12;
    let best = 0, bd = 99;
    sc.forEach((iv, d) => { const dd = Math.min(Math.abs(iv - pc), 12 - Math.abs(iv - pc)); if (dd < bd) { bd = dd; best = d; } });
    return best;
  }

  // ---------- left hand: low notes (< 48) pressed within CHORD_MS make one chord, forced once ----------
  const LOW = 48, CHORD_MS = 40;
  const lowDown = new Set(); // low keys held now
  let lowNew = [], lowTimer = null, chordHeld = false;
  // the chord a set of notes spells in the current key: root and quality (any inversion) → scale degree 0..n-1.
  // S5.7: the diatonic chord that holds ALL the notes wins — its triad first, then its seventh chord (Amaj7 with C# in the
  // bass is I, not iii); otherwise the degree whose chord shares the most, then the bass note's nearest degree
  function chordForNotes(midis) {
    const sc = AMB.seq.scale, root = AMB.seq.root, n = sc.length;
    const pc = (m) => (((m - root) % 12) + 12) % 12;
    const pcs = [...new Set(midis.map(pc))], bass = pc(Math.min(...midis));
    let best = null, bs = -99;
    for (let d = 0; d < n; d++) {
      const tones = [0, 2, 4].map((i) => sc[(d + i) % n]), seventh = tones.concat(sc[(d + 6) % n]);
      const hit = pcs.filter((p) => tones.includes(p)).length;
      if (!hit) continue;
      const all = pcs.every((p) => tones.includes(p)) ? 20 : pcs.every((p) => seventh.includes(p)) ? 10 : 0;
      // every note in the chord counts, a foreign note costs, the root present and in the bass break the ties
      const score = all + hit * 2 - (pcs.length - hit) * 1.5 + (pcs.includes(tones[0]) ? 1 : 0) + (bass === tones[0] ? 0.5 : 0);
      if (score > bs) { bs = score; best = d; }
    }
    return best != null ? best : degreeForPitch(Math.min(...midis));
  }
  function lowOn(m) {
    lowDown.add(m); lowNew.push(m);
    if (!lowTimer) lowTimer = setTimeout(flushChord, CHORD_MS);
  }
  function flushChord() {
    lowTimer = null;
    const notes = [...new Set([...lowNew, ...lowDown])];
    lowNew = [];
    if (!notes.length || !AMB.seq.playing) return;
    const deg = chordForNotes(notes), hold = lowDown.size > 0 || pedal;
    if (chordHeld && hold && deg === AMB.seq.chordDeg) return; // more notes of the chord already held: no re-strike
    AMB.seq.forceChord(deg, hold); tapChord(deg);
    chordHeld = hold && AMB.seq.chordHold;
  }
  // keys and pedal up: the forced chord may end (at the next chord boundary)
  function letChordGo() {
    if (!chordHeld || lowDown.size || pedal) return;
    chordHeld = false;
    AMB.seq.releaseChord();
  }

  // MIDI notes sound before the first ▶ too: the audio starts silently (the landscape stays faded out until ▶) on the
  // click on the MIDI button, or on a note once the page has had a gesture (browsers refuse sound before that)
  function wakeAudio(clicked = false) {
    const E = AMB.engine;
    if (E.ctx) return true;
    if (!(clicked || (navigator.userActivation && navigator.userActivation.hasBeenActive)) || !AMB.ui.ensureStarted) return false;
    const p = AMB.ui.ensureStarted(); // its synchronous part builds the graph: silence it before any sound is rendered
    E.out.gain.value = 0;
    p.catch(() => {});
    return true;
  }

  // ---------- S9.1 ONE strike for the on-screen keys, whatever plays them (mouse, finger, A–L, MIDI) ----------
  // The same classes, motion and sparks for every input: .on while held (+ .chord for a forced chord), the shared press
  // of motion.js (sinks, springs back with sparks) and a burst in the key's colour when it is struck. Nothing waits for
  // it (the note already sounds). The machine's notes light the keys their own way (padAuto, softer).
  const struck = new Map(); // input key ('k…', 'm…', 'p…') → the pad button it holds down
  const downs = new Map(); // pad button → how many inputs hold it
  function padEl(i) { const bar = document.getElementById('pads'); return bar && !bar.hidden && i >= 0 ? bar.children[i] || null : null; }
  function strike(b, down, o = {}) {
    if (!b) return;
    const M = AMB.motion, n = (downs.get(b) || 0) + (down ? 1 : -1);
    if (n > 0) downs.set(b, n); else downs.delete(b);
    if (down) {
      b.classList.add('on'); if (o.chord) b.classList.add('chord');
      if (M) { M.press(b, true); M.burst(b, { n: 9, spread: 1.7, speed: 280 }); }
    } else if (n <= 0) {
      b.classList.remove('on', 'chord');
      if (M) M.press(b, false);
    }
  }
  function keyUp(key) { const b = struck.get(key); if (b) { struck.delete(key); strike(b, false); } }
  // a forced chord from a key (Z–M, MIDI low notes): its key strikes once with the chord mark
  function tapChord(deg) {
    const b = padEl(deg % PADS.length); if (!b) return;
    strike(b, true, { chord: true }); setTimeout(() => strike(b, false), 160);
  }

  // ---------- touch pads: the 9 notes of A–L under the screen (a phone has no keys) ----------
  // Same path as the keys (playDegree, held until the finger lifts: notes, Rec live, contracts); a long press forces the chord of that degree.
  // Path only, from the Graine (S5.7; free mode is unchanged). The first touch starts the audio (a user gesture) and the note sounds.
  const PADS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'], PAD_LONG_MS = 450;
  const padPtr = new Map(); // pointerId → { b: pad button, t: long-press timer }
  function padsWanted() { // S5.7: from the Graine (its challenge is « Joue une note »)
    const g = AMB.game;
    return !!(g && g.path);
  }
  // S5.7: in the path, before the Mélodie auto is open, the first note also starts the playback (the drone comes in), as
  // the first glide does; free mode unchanged
  function firstNote() {
    const g = AMB.game;
    if (AMB.garden && AMB.garden.coin && AMB.garden.coin()) return; // S6.6: « INSERT COIN » — the first press starts the music
    if (g && g.path && !g.has('m.bells') && AMB.seq && !AMB.seq.playing && AMB.ui && AMB.ui.play) Promise.resolve(AMB.ui.play()).catch(() => {});
  }
  function padsRefresh() {
    const bar = document.getElementById('pads'); if (!bar) return;
    bar.hidden = !padsWanted();
    if (bar.hidden) padsUp();
  }
  function padsUp() { [...padPtr.keys()].forEach(padUp); [...struck.keys()].forEach(keyUp); }
  function padDown(e) {
    const b = e.target.closest && e.target.closest('.pad'); if (!b || !AMB.seq || padPtr.has(e.pointerId)) return;
    const g = AMB.game, can = (id) => !g || g.isUnlocked(id);
    e.preventDefault();
    if (!wakeAudio(true)) return;
    firstNote();
    const deg = +b.dataset.deg, key = 'p' + e.pointerId;
    try { b.setPointerCapture(e.pointerId); } catch (err) {}
    press(key, AMB.seq.playDegree(deg, 0.85, true, e.timeStamp), deg); // (strike: the same as a key or a MIDI note)
    const t = setTimeout(() => { // long press: the chord of this degree (needs the Pad; the note keeps sounding)
      if (!padPtr.has(e.pointerId) || !can('h.pad')) return;
      AMB.seq.forceChord(deg % (AMB.seq.scale.length || 7));
      b.classList.add('chord');
      if (navigator.vibrate) try { navigator.vibrate(15); } catch (err) {}
    }, PAD_LONG_MS);
    padPtr.set(e.pointerId, { b, t });
  }
  function padUp(id) {
    const p = padPtr.get(id); if (!p) return;
    padPtr.delete(id); clearTimeout(p.t); lift('p' + id);
  }
  // S5.2: the pads light up briefly on the Mélodie auto's notes (in their own colour), so the player sees what the machine
  // plays and can copy it. The pad of the same note, nearest in pitch (another octave = the pad of that degree).
  // The player's notes are 'live' notes: they light nothing here (S6.7: the Réponse's phrase lights them long, 'resp:call').
  const AUTO_MS = 170, autoT = new Map();
  function padForMidi(midi) {
    const S = AMB.seq, T = AMB.theory; if (!S || !S.scale || !T) return -1;
    let best = -1, bs = 1e9;
    for (let i = 0; i < PADS.length; i++) {
      const m = T.degreeToMidi(i, S.root, S.scale, 4), d = (((m - midi) % 12) + 12) % 12, sc = Math.min(d, 12 - d) * 100 + Math.abs(m - midi);
      if (sc < bs) { bs = sc; best = i; }
    }
    return best;
  }
  function padAuto(n) {
    if (!n || n.layer !== 'bells' || n.live) return;
    padLight(n.midi, n.time, AUTO_MS, 'auto');
  }
  // the pad of this note lit at `time` (audio clock) for ms; S6.7 'call' = the Réponse's phrase, bright and long (a Simon)
  function padLight(midi, time, ms, cls) {
    const bar = document.getElementById('pads'); if (!bar || bar.hidden || document.hidden) return;
    const b = bar.children[padForMidi(midi)]; if (!b) return;
    const ctx = AMB.engine && AMB.engine.ctx, wait = ctx && time ? Math.max(0, (time - ctx.currentTime) * 1000) : 0, T = cls === 'auto' ? autoT : callT;
    setTimeout(() => {
      b.classList.add(cls); clearTimeout(T.get(b));
      T.set(b, setTimeout(() => b.classList.remove(cls), ms));
    }, wait);
  }
  const callT = new Map();
  const padCall = (e) => { if (e && e.notes) e.notes.forEach((n) => n.midis.forEach((m) => padLight(m, n.time, n.dur * 1000, 'call'))); };
  function padsInit() {
    const bar = document.getElementById('pads'); if (!bar) return;
    bar.innerHTML = PADS.map((k, i) => `<button type="button" class="pad" data-deg="${i}" style="--i:${i};--c:hsl(${250 - i * 27}, 85%, 64%)" title="Touche ${k} · appui long : accord" aria-label="Note ${i + 1}"><span>${k}</span></button>`).join('');
    bar.addEventListener('pointerdown', padDown);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((n) => bar.addEventListener(n, (e) => padUp(e.pointerId)));
    bar.addEventListener('contextmenu', (e) => e.preventDefault());
    ['game:mode', 'game:unlock', 'game:reset'].forEach((n) => AMB.bus.on(n, padsRefresh));
    AMB.bus.on('note', padAuto);
    AMB.bus.on('resp:call', padCall);
    padsRefresh();
  }

  let midiAccess = null;
  function onMidi(msg) {
    const [st, d1, d2] = msg.data;
    const type = st & 0xf0;
    if (type === 0x80 || (type === 0x90 && d2 === 0)) { // note-off (or note-on at velocity 0)
      if (lowDown.delete(d1)) letChordGo();
      lift('m' + d1, false, msg.timeStamp);
    } else if (type === 0x90) {
      // in the path, like the computer keyboard: notes from the Graine (S5.7), low notes (chords) the Pad.
      // Notes sound while stopped too (like A–L), chords need the playback.
      const g = AMB.game, can = (id) => !g || g.isUnlocked(id);
      // the heard velocity is remapped to 0.25–1 (soft notes stay audible); the raw one (0..1) rides along on 'live'
      if (d1 < LOW) { if (can('h.pad') && AMB.seq.playing) lowOn(d1); }
      else if (wakeAudio()) { firstNote(); press('m' + d1, AMB.seq.playMidi(d1, 0.25 + (d2 / 127) * 0.75, d2 / 127, true, msg.timeStamp)); }
    } else if (type === 0xb0) {
      const v = d2 / 127;
      if (d1 === 64) { setPedal(d2 >= 64, msg.timeStamp); return letChordGo(); } // sustain pedal (holds notes and the forced chord)
      if (d1 === 123 || d1 === 120) return panic(); // All Notes Off / All Sound Off
      // S6.4: CC 80 = ● Boucle, CC 81 = ⊕ Overdub (a footswitch or a pad: pressed = value ≥ 64), where the Morceau is open
      if ((d1 === 80 || d1 === 81) && AMB.looper) { if (d2 >= 64 && (!AMB.tree || AMB.tree.uiUnlocked('song'))) { if (AMB.motion) AMB.motion.tap(document.querySelector(`.seqrow [data-l="${d1 === 80 ? 'rec' : 'dub'}"]`)); d1 === 80 ? AMB.looper.rec() : AMB.looper.dub(); } return; }
      // CCs drive the macros (perform.setMacro, source 'cc'): CC1 (mod wheel) = Densité, CC74 = Lumière, CC91 = Espace, CC93 = Nostalgie
      const cc = { 1: 'macro.density', 74: 'macro.light', 91: 'macro.space', 93: 'macro.nostalgia' }[d1];
      if (cc) AMB.perform.setMacro(cc, v);
    } else if (type === 0xc0) { // Program Change n = section n+1 of the Morceau, on the next bar line (S6.3)
      if (AMB.song) AMB.song.jump(d1);
    }
  }

  // quiet: automatic connection at load (MIDI already allowed), no toast
  async function connectMidi(btn, quiet = false) {
    if (!navigator.requestMIDIAccess) { if (!quiet) AMB.ui.toast('Web MIDI non supporté par ce navigateur'); return; }
    try {
      midiAccess = midiAccess || (await navigator.requestMIDIAccess());
      const bind = () => {
        let n = 0;
        midiAccess.inputs.forEach((inp) => { inp.onmidimessage = onMidi; n++; });
        btn.classList.toggle('on', n > 0);
        btn.textContent = n ? `MIDI · ${n}` : 'MIDI';
        if (n && AMB.bus) AMB.bus.emit('act', 'midiConnect'); // a keyboard is there (the MIDI gestures show their hints)
        return n;
      };
      midiAccess.onstatechange = (e) => { if (e && e.port && e.port.state === 'disconnected') panic(); bind(); };
      const n = bind();
      if (!quiet) AMB.ui.toast(n ? `${n} entrée(s) MIDI connectée(s)` : 'Aucun appareil MIDI détecté');
    } catch (e) {
      if (!quiet) AMB.ui.toast('Accès MIDI refusé');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', panic);
    document.addEventListener('visibilitychange', () => { if (document.hidden) panic(); });
    AMB.bus.on('panic', panic);
    padsInit();
    const btn = document.getElementById('midi');
    if (btn && navigator.requestMIDIAccess) {
      btn.hidden = false; // in the bar as soon as Web MIDI exists (in the path, the tree opens it with the Melody)
      btn.addEventListener('click', () => { wakeAudio(true); connectMidi(btn); });
      // already allowed (an earlier visit): connect without a click
      if (navigator.permissions) navigator.permissions.query({ name: 'midi' }).then((p) => { if (p.state === 'granted' && !midiAccess) connectMidi(btn, true); }).catch(() => {});
    }
  });

  AMB.play = { PADS, strike, padsRefresh, padForMidi, degreeForPitch, chordForNotes, onMidi, panic, get held() { return held.size + sustained.size; } };
})();
