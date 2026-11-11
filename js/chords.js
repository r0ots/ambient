// Chord timeline: draw the Pad progression as up to 8 slots of diatonic chords.
// It writes `pad.custom` ("1 6 4 5") and switches `pad.prog` to "Perso", so it stays
// compatible with presets, share links, scenes and undo.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const T = AMB.theory;
  const SLOTS = 8;
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  const degrees = () => String(store.get('pad.custom') || '').split(/[\s,;-]+/).map((x) => parseInt(x, 10)).filter((x) => x >= 1 && x <= 7);
  const chordLabel = (d) => {
    const seq = AMB.seq;
    const midis = T.chordDegrees(d - 1, 4, seq.scale).map((x) => T.degreeToMidi(x, seq.root, seq.scale, 3));
    return T.chordName(midis);
  };

  const chords = {
    sel: 0,
    build(container) {
      const panel = document.createElement('section');
      panel.className = 'panel chords-panel';
      panel.style.setProperty('--c', '#b58cff');
      panel.innerHTML = `<header><h2 data-n="09">Progression</h2>
          <span class="chords-mode"></span></header>
        <div class="chord-slots"></div>
        <div class="chord-palette"></div>
        <div class="roll-tools chord-tools">
          <button class="btn small" data-c="use">▶ Jouer cette progression</button>
          <button class="btn small" data-c="random">⚄ Suggérer</button>
          <button class="btn small" data-c="clear">Effacer</button>
          <span class="roll-hint">Choisis une case puis un accord · « — » coupe la progression à cet endroit</span>
        </div>`;
      container.prepend(panel);
      this.panel = panel;
      this.slotsEl = panel.querySelector('.chord-slots');
      this.paletteEl = panel.querySelector('.chord-palette');
      panel.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.c)));
      store.on((k) => { if (['pad.custom', 'pad.prog', 'global.key', 'global.scale', 'pad.length'].includes(k)) this.render(); });
      AMB.bus.on('chord', () => setTimeout(() => this.render(), 50));
      this.render();
    },
    write(list, activate = true) {
      store.set('pad.custom', list.join(' '), 'user');
      if (activate && list.length) store.set('pad.prog', 'Perso', 'user');
    },
    act(a) {
      if (a === 'use') { if (!degrees().length) this.write([1, 6, 4, 5]); else store.set('pad.prog', 'Perso', 'user'); }
      else if (a === 'clear') { this.write([], false); store.set('pad.prog', 'Aléatoire', 'user'); this.sel = 0; }
      else if (a === 'random') {
        // functional-ish walk: start on I, prefer moves by 4th/5th/3rd, end on IV, V or I
        const n = [4, 4, 4, 6, 8][Math.floor(Math.random() * 5)];
        const list = [1];
        const moves = [3, 4, -3, -4, 2, -2, 5];
        while (list.length < n) {
          let d = list[list.length - 1] + moves[Math.floor(Math.random() * moves.length)];
          d = ((d - 1 + 70) % 7) + 1;
          if (d !== list[list.length - 1]) list.push(d);
        }
        list[n - 1] = [4, 5, 1, 6][Math.floor(Math.random() * 4)];
        this.write(list);
      }
    },
    pick(deg) {
      const list = degrees();
      if (deg === 0) list.splice(this.sel); // "—": cut here
      else {
        while (list.length < this.sel) list.push(list[list.length - 1] || 1);
        list[this.sel] = deg;
        this.sel = Math.min(SLOTS - 1, this.sel + 1);
      }
      this.write(list);
    },
    render() {
      if (!this.panel || !AMB.seq) return;
      const list = degrees();
      const active = store.get('pad.prog') === 'Perso';
      this.panel.querySelector('.chords-mode').textContent = active
        ? `Perso · ${store.get('pad.length')} mes. par accord` : `Progression actuelle : ${store.get('pad.prog')}`;
      const playing = AMB.seq.playing && active && list.length ? (AMB.seq.progIdx || 0) % list.length : -1;
      this.slotsEl.innerHTML = '';
      for (let i = 0; i < SLOTS; i++) {
        const d = list[i];
        const b = document.createElement('button');
        b.className = 'chord-slot' + (i === this.sel ? ' is-sel' : '') + (i === playing ? ' now' : '') + (d ? '' : ' empty');
        b.innerHTML = d ? `<b>${ROMAN[d - 1]}</b><span>${chordLabel(d)}</span>` : `<b>+</b><span>${i < list.length + 1 ? 'ajouter' : ''}</span>`;
        b.addEventListener('click', () => { this.sel = Math.min(i, list.length); this.render(); });
        this.slotsEl.append(b);
      }
      this.paletteEl.innerHTML = '';
      for (let d = 1; d <= 7; d++) {
        const b = document.createElement('button');
        b.className = 'btn small chord-chip';
        b.innerHTML = `<b>${ROMAN[d - 1]}</b> ${chordLabel(d)}`;
        b.addEventListener('click', () => this.pick(d));
        this.paletteEl.append(b);
      }
      const cut = document.createElement('button');
      cut.className = 'btn small chord-chip'; cut.textContent = '—';
      cut.title = 'Couper la progression à cette case';
      cut.addEventListener('click', () => this.pick(0));
      this.paletteEl.append(cut);
    },
  };

  AMB.chords = chords;
})();
