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
    if (!AMB.seq.playing) return;
    let i;
    if ((i = MELODY_LOW.indexOf(e.code)) >= 0) AMB.seq.playDegree(i, e.shiftKey ? 0.5 : 0.85);
    else if ((i = MELODY_HIGH.indexOf(e.code)) >= 0) AMB.seq.playDegree(i + 7, e.shiftKey ? 0.5 : 0.85);
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
    if (type === 0x90 && d2 > 0) {
      if (!AMB.seq.playing) return;
      if (d1 < 48) AMB.seq.forceChord(degreeForPitch(d1));
      else AMB.seq.playMidi(d1, 0.25 + (d2 / 127) * 0.75);
    } else if (type === 0xb0) {
      const v = d2 / 127;
      if (d1 === 1) { // mod wheel -> density (XY Y axis)
        store.set('bells.density', 0.04 + 0.76 * v, 'user');
        store.set('grains.density', 0.08 + 0.82 * v, 'user');
      } else if (d1 === 74) { // brightness
        store.set('pad.tone', 0.08 + 0.82 * v, 'user');
        store.set('bells.tone', 0.05 + 0.95 * v, 'user');
      } else if (d1 === 91) store.set('fx.space', v, 'user');
      else if (d1 === 93) store.set('fx.shimmer', v, 'user');
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
