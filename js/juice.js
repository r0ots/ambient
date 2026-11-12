// « Jardin sonore » : game feel — gain notes, chime tuned to the key, LCD messages, shake.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const $ = (s) => document.querySelector(s);
  Object.assign(AMB.garden, {
    // restart a CSS shake animation on an element
    shake(el) { if (!el) return; el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); },
    // small "+n ✧" notes that float under the LCD, one per gain
    pop(text) {
      let feed = $('#gainFeed');
      if (!feed) { feed = document.createElement('div'); feed.id = 'gainFeed'; feed.className = 'gain-feed'; feed.setAttribute('aria-live', 'polite'); document.body.append(feed); }
      // float just under the LCD (wherever the header layout puts it)
      const lcd = $('#lcd');
      if (lcd) { const r = lcd.getBoundingClientRect(); feed.style.top = `${Math.round(r.bottom + 6)}px`; feed.style.left = `${Math.round(r.left)}px`; feed.style.right = 'auto'; }
      const it = document.createElement('div'); it.className = 'gain'; it.textContent = text;
      feed.append(it);
      while (feed.children.length > 4) feed.firstChild.remove();
      setTimeout(() => it.remove(), 3200);
    },
    // ---- game feedback (G6.2): a chime tuned to the current key, and LCD messages ----
    // kind: 'unlock' (rising arpeggio), 'solve' (two chords), 'small' (one soft note)
    chime(kind = 'unlock') {
      const E = AMB.engine, ctx = E && E.ctx;
      if (!ctx || ctx.state !== 'running' || !AMB.game.path) return 0;
      const Th = AMB.theory, root = Th.NOTE_NAMES.indexOf(AMB.store.get('global.key'));
      const scale = Th.SCALES[AMB.store.get('global.scale')] || Th.SCALES['Ionien (majeur)'];
      const degs = kind === 'small' ? [4] : kind === 'solve' ? [0, 2, 4, 7, 9, 11] : [0, 2, 4, 7];
      const out = ctx.createGain(); out.gain.value = 0.16;
      out.connect(ctx.destination); // straight to the speakers: never recorded nor frozen
      const t0 = ctx.currentTime + 0.02;
      degs.forEach((dg, i) => {
        const f = Th.mtof(Th.degreeToMidi(dg, root, scale, 5));
        const at = t0 + (kind === 'solve' ? (i < 3 ? 0 : 0.35) + i % 3 * 0.02 : i * 0.09);
        for (const [mul, amp] of [[1, 1], [2.76, 0.25], [5.4, 0.08]]) { // bell-ish partials
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f * mul;
          g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp * 0.5, at + 0.008);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 1.6 / mul);
          o.connect(g); g.connect(out); o.start(at); o.stop(at + 1.7);
        }
      });
      setTimeout(() => out.disconnect(), 3000);
      return degs.length;
    },
    lcd(text, ms = 3500) { AMB.lcdMsg = { text, until: Date.now() + ms }; },

    gainText(d) {
      if (d.reason === 'énigme' && AMB.puzzles && AMB.puzzles.byId[d.id]) return `+${d.n} ✧ énigme résolue : ${AMB.puzzles.byId[d.id].title}`;
      if (d.reason === 'contrat' && AMB.contracts && AMB.contracts.byId[d.id]) return `+${d.n} ✧ contrat rempli : ${AMB.contracts.byId[d.id].title}`;
      if (d.reason === 'découverte' && d.id && d.id.startsWith('a:')) { const a = this.ACTS[d.id.slice(2)]; return `+${d.n} ✧ découverte : ${a ? a[2] : d.id}`; }
      if (d.reason === 'découverte' && d.id && d.id.startsWith('p:')) return `+${d.n} ✧ découverte : ${this.paramLabel(d.id.slice(2))}`;
      return `+${d.n} ✧ ${d.reason || ''}`;
    },
  });
})();
