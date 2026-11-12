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
  // stop, MIDI unplugged, focus lost: every note ends, the pedal is considered up
  function panic() {
    held.forEach((h) => AMB.seq.endLive(h));
    held.clear();
    setPedal(false);
  }

  // nearest scale degree (0..n-1) for a pitch class
  function degreeForPitch(midi) {
    const sc = AMB.seq.scale, root = AMB.seq.root;
    const pc = (((midi - root) % 12) + 12) % 12;
    let best = 0, bd = 99;
    sc.forEach((iv, d) => { const dd = Math.min(Math.abs(iv - pc), 12 - Math.abs(iv - pc)); if (dd < bd) { bd = dd; best = d; } });
    return best;
  }

  let midiAccess = null;
  function onMidi(msg) {
    const [st, d1, d2] = msg.data;
    const type = st & 0xf0;
    if (type === 0x80 || (type === 0x90 && d2 === 0)) lift('m' + d1); // note-off (or note-on at velocity 0)
    else if (type === 0x90) {
      // stopped: MIDI notes are ignored, except to play an Écho back (its phrase is heard while stopped, like A–L)
      if (!AMB.seq.playing && !(AMB.puzzles && AMB.puzzles.isEcho())) return;
      // in the path, like the computer keyboard: notes need the Melody, low notes (chords) the Pad
      const g = AMB.game, can = (id) => !g || g.isUnlocked(id);
      // the heard velocity is remapped to 0.25–1 (soft notes stay audible); the raw one (0..1) rides along on 'live'
      if (d1 < 48) { if (can('h.pad')) AMB.seq.forceChord(degreeForPitch(d1)); }
      else if (can('m.bells')) press('m' + d1, AMB.seq.playMidi(d1, 0.25 + (d2 / 127) * 0.75, d2 / 127, true));
    } else if (type === 0xb0) {
      const v = d2 / 127;
      if (d1 === 64) return setPedal(d2 >= 64); // sustain pedal
      if (d1 === 123 || d1 === 120) return panic(); // All Notes Off / All Sound Off
      // CCs drive the same macros as the XY pad: mod wheel = Densité, CC74 = Lumière, CC91 = Espace, CC93 = Nostalgie
      const cc = { 1: 'macro.density', 74: 'macro.light', 91: 'macro.space', 93: 'macro.nostalgia' }[d1];
      if (cc) AMB.perform.setMacro(cc, v);
    }
  }

  async function connectMidi(btn) {
    if (!navigator.requestMIDIAccess) { AMB.ui.toast('Web MIDI non supporté par ce navigateur'); return; }
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
      AMB.ui.toast(n ? `${n} entrée(s) MIDI connectée(s)` : 'Aucun appareil MIDI détecté');
    } catch (e) {
      AMB.ui.toast('Accès MIDI refusé');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', panic);
    document.addEventListener('visibilitychange', () => { if (document.hidden) panic(); });
    AMB.bus.on('panic', panic);
    const btn = document.getElementById('midi');
    if (btn) btn.addEventListener('click', () => connectMidi(btn));
  });

  AMB.play = { degreeForPitch, onMidi, panic, get held() { return held.size + sustained.size; } };
})();
