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
    if (!AMB.engine.ctx) return; // notes sound when stopped too, once audio has been started once
    let i;
    // in the path, playing notes needs the Melody, forcing chords needs the Pad
    const g = AMB.game, can = (id) => !g || g.isUnlocked(id);
    if ((MELODY_LOW.includes(e.code) || MELODY_HIGH.includes(e.code)) && !can('m.bells')) return;
    if (CHORDS.includes(e.code) && !can('h.pad')) return;
    if ((i = MELODY_LOW.indexOf(e.code)) >= 0) press('k' + e.code, AMB.seq.playDegree(i, e.shiftKey ? 0.5 : 0.85, true));
    else if ((i = MELODY_HIGH.indexOf(e.code)) >= 0) press('k' + e.code, AMB.seq.playDegree(i + 7, e.shiftKey ? 0.5 : 0.85, true));
    else if ((i = CHORDS.indexOf(e.code)) >= 0) AMB.seq.forceChord(i);
    else return;
    e.preventDefault();
  }

  function onKeyUp(e) { lift('k' + e.code); }

  // ---------- held notes: key → live handle; the sustain pedal (CC64) delays the releases ----------
  const held = new Map(); // key ('k' + e.code or 'm' + midi note) → handle from AMB.seq.playMidi
  const sustained = new Set(); // handles released while the pedal is down
  let pedal = false;
  function press(key, h) {
    lift(key, true); // same key struck again: the previous note ends
    if (h && typeof h === 'object') held.set(key, h); // (a stub or a silent engine returns no handle)
  }
  function lift(key, now = false) {
    const h = held.get(key);
    if (!h) return;
    held.delete(key);
    if (pedal && !now) sustained.add(h);
    else AMB.seq.endLive(h);
  }
  function setPedal(down) {
    pedal = down;
    if (down) return;
    sustained.forEach((h) => AMB.seq.endLive(h));
    sustained.clear();
  }
  // stop, MIDI unplugged, focus lost: every note ends, the pedal is considered up, a held chord is let go
  function panic() {
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
  // the chord a set of notes spells in the current key: root and quality (any inversion) → scale degree 0..n-1;
  // notes outside every chord of the key → the degree whose chord shares the most, then the bass note's nearest degree
  function chordForNotes(midis) {
    const sc = AMB.seq.scale, root = AMB.seq.root, n = sc.length;
    const pc = (m) => (((m - root) % 12) + 12) % 12;
    const pcs = [...new Set(midis.map(pc))], bass = pc(Math.min(...midis));
    let best = null, bs = -99;
    for (let d = 0; d < n; d++) {
      const tones = [0, 2, 4].map((i) => sc[(d + i) % n]);
      const hit = pcs.filter((p) => tones.includes(p)).length;
      if (!hit) continue;
      // every note in the chord counts, a foreign note costs, the root present and in the bass break the ties
      const score = hit * 2 - (pcs.length - hit) * 1.5 + (pcs.includes(tones[0]) ? 1 : 0) + (bass === tones[0] ? 0.5 : 0);
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
    AMB.seq.forceChord(deg, hold);
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

  let midiAccess = null;
  function onMidi(msg) {
    const [st, d1, d2] = msg.data;
    const type = st & 0xf0;
    if (type === 0x80 || (type === 0x90 && d2 === 0)) { // note-off (or note-on at velocity 0)
      if (lowDown.delete(d1)) letChordGo();
      lift('m' + d1);
    } else if (type === 0x90) {
      // in the path, like the computer keyboard: notes need the Melody, low notes (chords) the Pad.
      // Notes sound while stopped too (like A–L), chords need the playback.
      const g = AMB.game, can = (id) => !g || g.isUnlocked(id);
      // the heard velocity is remapped to 0.25–1 (soft notes stay audible); the raw one (0..1) rides along on 'live'
      if (d1 < LOW) { if (can('h.pad') && AMB.seq.playing) lowOn(d1); }
      else if (can('m.bells') && wakeAudio()) press('m' + d1, AMB.seq.playMidi(d1, 0.25 + (d2 / 127) * 0.75, d2 / 127, true));
    } else if (type === 0xb0) {
      const v = d2 / 127;
      if (d1 === 64) { setPedal(d2 >= 64); return letChordGo(); } // sustain pedal (holds notes and the forced chord)
      if (d1 === 123 || d1 === 120) return panic(); // All Notes Off / All Sound Off
      // CCs drive the same macros as the XY pad: CC1 (mod wheel) = Densité, CC74 = Lumière, CC91 = Espace, CC93 = Nostalgie
      const cc = { 1: 'macro.density', 74: 'macro.light', 91: 'macro.space', 93: 'macro.nostalgia' }[d1];
      if (cc) AMB.perform.setMacro(cc, v);
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
        if (n && AMB.bus) AMB.bus.emit('act', 'midiConnect'); // a keyboard is there (the MIDI secrets show their hints)
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
    const btn = document.getElementById('midi');
    if (btn && navigator.requestMIDIAccess) {
      btn.hidden = false; // in the bar as soon as Web MIDI exists (in the path, the tree opens it with the Melody)
      btn.addEventListener('click', () => { wakeAudio(true); connectMidi(btn); });
      // already allowed (an earlier visit): connect without a click
      if (navigator.permissions) navigator.permissions.query({ name: 'midi' }).then((p) => { if (p.state === 'granted' && !midiAccess) connectMidi(btn, true); }).catch(() => {});
    }
  });

  AMB.play = { degreeForPitch, chordForNotes, onMidi, panic, get held() { return held.size + sustained.size; } };
})();
