// Performance controls: macro knobs (simple view) and the XY pad on the visualizer
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
  function applyMacro(key, v) {
    for (const [k, a, b, pow] of MACROS[key]) store.set(k, a + (b - a) * Math.pow(v, pow || 1), 'macro');
    if (key === 'macro.nature') store.set('texture.on', v > 0.02, 'macro');
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
  function setView(simple) {
    document.body.classList.toggle('simple', simple);
    const b = $('#viewMode'); if (b) b.textContent = simple ? 'Expert' : 'Simple';
    try { localStorage.setItem('ambient.view', simple ? 'simple' : 'expert'); } catch (e) {}
  }

  // ---------- XY performance pad on the visualizer ----------
  const XY_MAP = {
    x: [['pad.tone', 0.08, 0.9], ['bells.tone', 0.05, 1], ['drone.tone', 0.08, 0.7], ['texture.tone', 0.15, 0.85]],
    y: [['bells.density', 0.04, 0.8], ['grains.density', 0.08, 0.9], ['fx.echo', 0.12, 0.55]],
  };
  function setupXY(canvas) {
    let down = false;
    const applyXY = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const y = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      AMB.visual.xy = { x, y, t: performance.now() };
      for (const [k, a, b] of XY_MAP.x) store.set(k, a + (b - a) * x, 'user');
      for (const [k, a, b] of XY_MAP.y) store.set(k, a + (b - a) * y, 'user');
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!AMB.seq.playing) return;
      down = true; canvas.setPointerCapture(e.pointerId); applyXY(e);
    });
    canvas.addEventListener('pointermove', (e) => { if (down) applyXY(e); });
    const up = () => { down = false; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  }

  AMB.perform = { MACROS, setView, setupXY, syncMacros };
})();
