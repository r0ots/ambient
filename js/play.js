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
    if (!AMB.engine.ctx) return; // audition works when stopped too, once audio has been started once
    let i;
    // in the path, playing notes needs the Melody, forcing chords needs the Pad
    const g = AMB.game, can = (id) => !g || g.isUnlocked(id);
    if ((MELODY_LOW.includes(e.code) || MELODY_HIGH.includes(e.code)) && !can('m.bells')) return;
    if (CHORDS.includes(e.code) && !can('h.pad')) return;
    const mir = AMB.secrets && AMB.secrets.mirrorOn(), md = (d) => (mir ? AMB.secrets.mirrorDeg(d) : d); // G10.1 mirror keyboard (a found gift)
    if ((i = MELODY_LOW.indexOf(e.code)) >= 0) AMB.seq.playDegree(md(i), e.shiftKey ? 0.5 : 0.85);
    else if ((i = MELODY_HIGH.indexOf(e.code)) >= 0) AMB.seq.playDegree(md(i + 7), e.shiftKey ? 0.5 : 0.85);
    else if ((i = CHORDS.indexOf(e.code)) >= 0) AMB.seq.forceChord(i);
    else return;
    e.preventDefault();
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
    // during an arcade round the app stays silent: notes go to the mini-game (if it listens), the rest is ignored
    if (AMB.arcade && AMB.arcade.active) {
      if (type === 0x90 && d2 > 0) AMB.arcade.midi({ midi: d1, vel: d2 / 127, time: msg.timeStamp });
      return;
    }
    if (type === 0x90 && d2 > 0) {
      if (!AMB.seq.playing) return;
      if (d1 < 48) AMB.seq.forceChord(degreeForPitch(d1));
      else AMB.seq.playMidi(AMB.secrets && AMB.secrets.mirrorOn() ? AMB.secrets.mirrorMidi(d1) : d1, 0.25 + (d2 / 127) * 0.75);
    } else if (type === 0xb0) {
      const v = d2 / 127;
      // CCs drive the same macros as the XY pad: mod wheel = Densité, CC74 = Lumière, CC91 = Espace, CC93 = Nostalgie
      const cc = { 1: 'macro.density', 74: 'macro.light', 91: 'macro.space', 93: 'macro.nostalgia' }[d1];
      if (cc) AMB.perform.setMacro(cc, v);
    }
  }

  async function connectMidi(btn) {
    if (!navigator.requestMIDIAccess) { AMB.ui.toast('Web MIDI non supporté par ce navigateur'); return; }
    try {
      midiAccess = midiAccess || (await navigator.requestMIDIAccess());
      if (AMB.bus) AMB.bus.emit('act', 'midiConnect');
      const bind = () => {
        let n = 0;
        midiAccess.inputs.forEach((inp) => { inp.onmidimessage = onMidi; n++; });
        btn.classList.toggle('on', n > 0);
        btn.textContent = n ? `MIDI · ${n}` : 'MIDI';
        return n;
      };
      midiAccess.onstatechange = bind;
      const n = bind();
      AMB.ui.toast(n ? `${n} entrée(s) MIDI connectée(s)` : 'Aucun appareil MIDI détecté');
    } catch (e) {
      AMB.ui.toast('Accès MIDI refusé');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('keydown', onKey);
    const btn = document.getElementById('midi');
    if (btn) btn.addEventListener('click', () => connectMidi(btn));
  });

  AMB.play = { degreeForPitch, onMidi };
})();
