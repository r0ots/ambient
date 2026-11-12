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
    padsUp();
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

  // ---------- touch pads: the 9 notes of A–L under the screen (a phone has no keys) ----------
  // Same path as the keys (playDegree, held until the finger lifts: notes, Rec live, contracts); a long press forces the chord of that degree.
  // Shown in the path once the Melody is owned (any device), in free mode only on a touch screen (desktop free mode is unchanged).
  const PADS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'], PAD_LONG_MS = 450;
  const padPtr = new Map(); // pointerId → { b: pad button, t: long-press timer }
  function padsWanted() {
    const g = AMB.game;
    if (g && g.path) return g.isUnlocked('m.bells');
    return !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  }
  function padsRefresh() {
    const bar = document.getElementById('pads'); if (!bar) return;
    bar.hidden = !padsWanted();
    if (bar.hidden) padsUp();
  }
  function padsUp() { [...padPtr.keys()].forEach(padUp); }
  function padDown(e) {
    const b = e.target.closest && e.target.closest('.pad'); if (!b || !AMB.seq || padPtr.has(e.pointerId)) return;
    const g = AMB.game, can = (id) => !g || g.isUnlocked(id);
    e.preventDefault();
    if (!can('m.bells')) return;
    const deg = +b.dataset.deg, key = 'p' + e.pointerId;
    try { b.setPointerCapture(e.pointerId); } catch (err) {}
    b.classList.add('on');
    press(key, AMB.seq.playDegree(deg, 0.85, true));
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
    if (![...padPtr.values()].some((q) => q.b === p.b)) p.b.classList.remove('on', 'chord');
  }
  function padsInit() {
    const bar = document.getElementById('pads'); if (!bar) return;
    bar.innerHTML = PADS.map((k, i) => `<button type="button" class="pad" data-deg="${i}" style="--i:${i}" title="Touche ${k} · appui long : accord" aria-label="Note ${i + 1}"><span>${k}</span></button>`).join('');
    bar.addEventListener('pointerdown', padDown);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((n) => bar.addEventListener(n, (e) => padUp(e.pointerId)));
    bar.addEventListener('contextmenu', (e) => e.preventDefault());
    ['game:mode', 'game:unlock', 'game:reset'].forEach((n) => AMB.bus.on(n, padsRefresh));
    padsRefresh();
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
    padsInit();
    const btn = document.getElementById('midi');
    if (btn) btn.addEventListener('click', () => connectMidi(btn));
  });

  AMB.play = { PADS, padsRefresh, degreeForPitch, onMidi, panic, get held() { return held.size + sustained.size; } };
})();
