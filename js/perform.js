// Performance controls: macro knobs (simple view), driven by MIDI CCs too
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const { $ } = AMB.dom;
  // ---------- macros (simple view) ----------
  // Macro -> [param, at 0, at 1, curve exponent]
  const MACROS = {
    'macro.light': [['pad.tone', 0.08, 0.9], ['bells.tone', 0.05, 1], ['drone.tone', 0.08, 0.7], ['texture.tone', 0.15, 0.85]],
    'macro.density': [['bells.density', 0.04, 0.8], ['grains.density', 0.08, 0.9], ['fx.echo', 0.12, 0.55], ['pad.length', 8, 2]],
    'macro.space': [['fx.space', 0.15, 0.95], ['fx.size', 0.35, 1], ['fx.shimmer', 0, 0.55, 2], ['fx.predelay', 0.1, 0.6]],
    'macro.nostalgia': [['fx.tape', 0.05, 0.85], ['fx.lofi', 0, 0.6, 2]],
    'macro.nature': [['texture.vol', 0, 0.55]],
  };
  function applyMacro(key, v, source = 'macro') {
    for (const [k, a, b, pow] of MACROS[key]) store.set(k, a + (b - a) * Math.pow(v, pow || 1), source);
    if (key === 'macro.nature') store.set('texture.on', v > 0.02, source);
  }
  store.on((key, v, source) => { if (source === 'user' && MACROS[key]) applyMacro(key, v); });

  // Keep macro knobs truthful: after presets/undo/morph or direct knob edits, infer each
  // macro's position from the parameters it drives (average of the inverse mappings).
  let syncT = null;
  function syncMacros() {
    for (const [mk, list] of Object.entries(MACROS)) {
      let sum = 0, n = 0;
      for (const [k, a, b, pow] of list) {
        if (a === b) continue;
        const t = Math.max(0, Math.min(1, (store.get(k) - a) / (b - a)));
        sum += Math.pow(t, 1 / (pow || 1)); n++;
      }
      if (n) store.set(mk, sum / n, 'sync');
    }
  }
  store.on((key, v, source) => {
    if (key.startsWith('macro.') || source === 'macro' || source === 'sync' || source === 'evolve' || source === 'lfo') return;
    clearTimeout(syncT); syncT = setTimeout(syncMacros, 60);
  });

  // Simple / Expert view
  // Three modes: listen (5 macros), sculpt (every sound setting), compose (progression, tracks, song)
  const MODES = ['listen', 'sculpt', 'compose'];
  function setMode(mode) {
    if (!MODES.includes(mode)) mode = 'listen';
    const prev = AMB.mode;
    for (const m of MODES) document.body.classList.toggle('mode-' + m, m === mode);
    document.querySelectorAll('[data-mode]').forEach((b) => { const on = b.dataset.mode === mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    try { localStorage.setItem('ambient.mode', mode); } catch (e) {}
    AMB.mode = mode;
    window.dispatchEvent(new Event('resize')); // canvases re-measure when shown
    // S7.1: the lit key slides to the new mode; the view that comes in cascades behind a scan (not at load)
    const M = AMB.motion;
    if (M) { M.slide(document.querySelector('.modes')); if (prev && prev !== mode) M.swap(MODES.indexOf(mode) - MODES.indexOf(prev)); }
  }
  // legacy API: setView(true) = listen, setView(false) = sculpt
  const setView = (simple) => setMode(simple ? 'listen' : 'sculpt');

  // ---------- MIDI CCs drive the macros themselves (one mapping, knobs stay in sync) ----------
  // S6.2: the visualizer is a reflection, never a control surface (no more gliding on the screen)
  function setMacro(key, v) {
    v = Math.max(0, Math.min(1, v));
    store.set(key, v, 'sync'); // move the macro knob without re-triggering
    // performance gestures: not recorded in undo history. In the path the knob may still be locked: the CC then drives
    // the open settings it reaches (the drone's colour) directly.
    const T = AMB.tree;
    applyMacro(key, T && !T.paramUnlocked(key) ? v : store.get(key), 'cc');
  }

  AMB.perform = { MACROS, setMacro, applyMacro, setView, setMode, MODES, syncMacros };
})();
