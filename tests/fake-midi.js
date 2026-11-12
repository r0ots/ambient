// Fake MIDI keyboard for the test pages (G9b.1). Load it after lib.js: <script src="fake-midi.js"></script>.
// fakeMidi(win) installs a fake Web MIDI access in `win` (the page itself or an iframe's contentWindow) BEFORE the
// app asks for it (the « MIDI » button, js/play.js connectMidi). The app then binds its real handler
// (input.onmidimessage = AMB.play.onMidi) and every event goes through the same entry point as a real keyboard:
//   const kb = fakeMidi(w); await kb.connect();      // clicks #midi, resolves once the input is bound
//   kb.on(60, 100, time?)  note-on (velocity 1..127, time = performance.now ms of `win`, default now)
//   kb.off(60, time?, {zero: true})   note-off (0x80), or note-on with velocity 0 when zero is true
//   kb.cc(74, 64)          control change · kb.send([status, d1, d2], time?) raw message · kb.sent = log
// Messages are {data: Uint8Array, timeStamp} like a real MIDIMessageEvent; channel 1 (status 0x90 / 0x80 / 0xB0).
(function () {
  window.fakeMidi = function (win = window) {
    const input = { id: 'fake-1', name: 'Faux clavier', manufacturer: 'tests', type: 'input', state: 'connected', onmidimessage: null };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null, sysexEnabled: false };
    let asked = 0;
    Object.defineProperty(win.navigator, 'requestMIDIAccess', { configurable: true, value: () => { asked++; return Promise.resolve(access); } });
    const kb = {
      input, access, sent: [],
      get asked() { return asked; },
      get bound() { return typeof input.onmidimessage === 'function'; },
      async connect(btn = win.document.getElementById('midi')) {
        if (btn) btn.click();
        for (let i = 0; i < 100 && !kb.bound; i++) await new Promise((r) => setTimeout(r, 10));
        return kb.bound;
      },
      send(bytes, time) {
        const ev = { data: Uint8Array.from(bytes), timeStamp: time != null ? time : win.performance.now(), target: input };
        kb.sent.push(ev);
        if (typeof input.onmidimessage === 'function') input.onmidimessage(ev);
        return ev;
      },
      on(midi, vel = 100, time) { return kb.send([0x90, midi & 127, Math.max(1, Math.min(127, vel))], time); },
      off(midi, time, opt = {}) { return kb.send(opt.zero ? [0x90, midi & 127, 0] : [0x80, midi & 127, 64], time); },
      cc(n, v, time) { return kb.send([0xb0, n & 127, v & 127], time); },
    };
    return kb;
  };
})();
