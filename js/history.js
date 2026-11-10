// Undo / redo of deliberate changes (knobs, presets, macros, generator…).
// Automatic motion (evolve, LFO, morph) is not recorded. Rapid changes are grouped into one step.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const RECORDED = new Set(['user', 'preset', 'macro']);
  const MAX = 60, GROUP_MS = 700;

  const history = {
    past: [], future: [], open: false, timer: null,
    onChange(key, v, source, prev) {
      if (!RECORDED.has(source)) return;
      if (!this.open) {
        const before = store.stableSnapshot();
        before[key] = prev; // state just before this gesture started
        this.past.push(before);
        if (this.past.length > MAX) this.past.shift();
        this.future = [];
        this.open = true;
      }
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { this.open = false; }, GROUP_MS);
    },
    restore(snap) {
      const keep = { 'global.volume': store.get('global.volume') }; // never undo the master volume
      store.setMany({ ...snap, ...keep }, 'undo');
    },
    undo() {
      this.open = false;
      const snap = this.past.pop();
      if (!snap) return AMB.ui.toast('Rien à annuler');
      this.future.push(store.stableSnapshot());
      this.restore(snap);
      AMB.ui.toast('↶ Annulé');
    },
    redo() {
      this.open = false;
      const snap = this.future.pop();
      if (!snap) return AMB.ui.toast('Rien à rétablir');
      this.past.push(store.stableSnapshot());
      this.restore(snap);
      AMB.ui.toast('↷ Rétabli');
    },
  };

  store.on((k, v, s, p) => history.onChange(k, v, s, p));
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); history.redo(); }
  });

  AMB.history = history;
})();
