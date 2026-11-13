// Session journal: a timeline of "moments" (state snapshots taken at chord changes).
// Click a moment to go back to it; ♥ keeps the current moment as a user patch.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const MAX = 48, MIN_GAP = 15; // seconds between recorded moments

  const journal = {
    items: [],
    t0: 0,
    record(chordName) {
      const now = performance.now() / 1000;
      if (!this.t0) this.t0 = now;
      const last = this.items[this.items.length - 1];
      if (last && now - last.at < MIN_GAP) return;
      this.items.push({ at: now, label: chordName, state: store.stableSnapshot(), mood: (document.querySelector('#preset')?.selectedOptions[0]?.textContent || '').replace('✦ ', '') });
      if (this.items.length > MAX) this.items.shift();
      this.render();
    },
    fmt(sec) { const s = Math.floor(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; },
    restore(i) {
      const it = this.items[i];
      if (!it) return;
      AMB.ui.applyPatch(it.state);
      if (AMB.bus) AMB.bus.emit('act', 'restore');
      AMB.ui.toast(`↺ Retour à ${this.fmt(it.at - this.t0)} · ${it.label}`);
    },
    keep() {
      const it = this.items[this.items.length - 1];
      const state = store.stableSnapshot();
      const name = `♥ ${it ? it.label : 'Moment'} · ${new Date().toLocaleTimeString().slice(0, 5)}`;
      AMB.ui.saveUserPatch(name, state);
      if (AMB.bus) AMB.bus.emit('act', 'keep');
      AMB.ui.toast(`Gardé dans « Mes paysages » : ${name}`);
    },
    render() {
      if (!this.list) return;
      this.el.classList.toggle('empty', !this.items.length);
      this.list.innerHTML = '';
      this.items.forEach((it, i) => {
        const b = document.createElement('button');
        b.className = 'moment';
        b.title = `${this.fmt(it.at - this.t0)} · ${it.label}${it.mood ? ' · ' + it.mood : ''}\nClic : revenir à ce moment`;
        // hue from the chord root letter, so recurring harmonies share a colour
        const hue = (it.label.charCodeAt(0) * 47 + (it.label.includes('m') ? 40 : 0)) % 360;
        b.style.setProperty('--h', hue);
        b.addEventListener('click', () => this.restore(i));
        this.list.append(b);
      });
      this.list.scrollLeft = this.list.scrollWidth;
    },
    build(el) {
      this.el = el;
      el.innerHTML = `<span class="sc-title">Journal</span><div class="moments"></div>
        <button class="btn small" id="keepMoment" title="Garder l'état actuel dans Mes paysages">♥ Garder</button>`;
      this.list = el.querySelector('.moments');
      el.querySelector('#keepMoment').addEventListener('click', () => this.keep());
      AMB.bus.on('chord', (c) => {
        const delay = Math.max(0, (c.time - AMB.engine.ctx.currentTime) * 1000);
        setTimeout(() => this.record(AMB.theory.chordName(c.midis)), delay + 50);
      });
      this.render();
    },
  };

  AMB.journal = journal;
  document.addEventListener('DOMContentLoaded', () => { const el = document.getElementById('journal'); if (el) journal.build(el); });
})();
