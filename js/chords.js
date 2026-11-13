// Chord timeline: draw the Pad progression as up to 8 slots of diatonic chords.
// It writes `pad.custom` ("1 6 4 5") and switches `pad.prog` to "Perso", so it stays
// compatible with presets, share links, scenes and undo.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const T = AMB.theory;
  const SLOTS = 8;

  // slots as [{d: 1..7, b: bars|null}] from pad.custom ("1 6:2 4 5:8")
  const slots = () => String(store.get('pad.custom') || '').split(/[\s,;]+/).map((t) => {
    const [d, b] = t.split(':').map((x) => parseInt(x, 10));
    return d >= 1 && d <= 14 ? { d: ((d - 1) % 7) + 1, b: b >= 1 && b <= 16 ? b : null } : null;
  }).filter(Boolean);
  const MODES = ['Aléatoire', 'Plane (I)', 'Pendule I–IV', 'I–V–vi–IV', 'i–VI–III–VII', 'Montée I–ii–iii–IV', 'Perso'];
  const MODE_LABEL = { 'Aléatoire': '⚄ Aléatoire', 'Perso': '✎ Mes accords' };
  const chordLabel = (d) => {
    const seq = AMB.seq;
    const midis = T.chordDegrees(d - 1, 4, seq.scale).map((x) => T.degreeToMidi(x, seq.root, seq.scale, 3));
    return T.chordName(midis);
  };
  const roman = (d) => T.roman(d - 1, AMB.seq.scale);
  // S6.7: a fixed progression's chords in the current key and scale, as written on its button: "Am – F – C – G"
  const fixedSlots = (m) => (T.progDegrees(m, AMB.seq.scale) || []).map((d) => ({ d: d + 1, b: null }));
  const names = (m) => fixedSlots(m).map((x) => T.triadName(x.d - 1, AMB.seq.root, AMB.seq.scale)).join(' – ');
  // what the slots show and edit: the fixed progression playing (editing it starts « Mes accords » from it), else mine
  const shown = () => (T.PROGS[store.get('pad.prog')] ? fixedSlots(store.get('pad.prog')) : slots());

  const chords = {
    sel: 0,
    // S6.7: a state's progression as chord names (« C–G–Am–F »), read through get (live store or a song section)
    summary(get = (k) => store.get(k)) {
      const sc = T.SCALES[get('global.scale')] || AMB.seq.scale, k = T.NOTE_NAMES.indexOf(get('global.key'));
      const root = k >= 0 ? k : AMB.seq.root, m = get('pad.prog');
      const degs = m === 'Perso' ? String(get('pad.custom') || '').split(/[\s,;]+/).map((t) => parseInt(t, 10) - 1).filter((d) => d >= 0 && d < 14)
        : T.progDegrees(m, sc);
      return degs && degs.length ? degs.map((d) => T.triadName(d, root, sc)).join('–') : 'aléatoires';
    },
    build(container) {
      const panel = document.createElement('section');
      panel.className = 'panel chords-panel';
      panel.style.setProperty('--c', '#b58cff');
      panel.innerHTML = `<header><h2 data-n="09">Progression</h2>
          <span class="chords-mode"></span></header>
        <div class="chord-modes roll-tools"></div>
        <div class="chord-slots"></div>
        <div class="chord-palette"></div>
        <div class="chord-durs roll-tools"></div>
        <div class="roll-tools chord-tools">
          <button class="btn small" data-c="use">▶ Jouer cette progression</button>
          <button class="btn small" data-c="random">⚄ Suggérer</button>
          <button class="btn small" data-c="clear">Effacer</button>
          <span class="roll-hint">Choisis une case puis un accord et sa durée · « — » coupe la progression à cet endroit</span>
        </div>`;
      container.prepend(panel);
      this.panel = panel;
      this.slotsEl = panel.querySelector('.chord-slots');
      this.paletteEl = panel.querySelector('.chord-palette');
      this.modesEl = panel.querySelector('.chord-modes');
      this.dursEl = panel.querySelector('.chord-durs');
      panel.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.c)));
      store.on((k) => { if (['pad.custom', 'pad.prog', 'global.key', 'global.scale', 'pad.length'].includes(k)) this.render(); });
      AMB.bus.on('chord', () => setTimeout(() => this.render(), 50));
      AMB.bus.on('section', () => this.render()); // S6.7: chord lengths fit the selected song section
      this.render();
    },
    write(list, activate = true) {
      // list items: degree number or {d, b}
      const str = list.map((x) => (typeof x === 'object' ? (x.b ? `${x.d}:${x.b}` : `${x.d}`) : `${x}`)).join(' ');
      store.set('pad.custom', str, 'user');
      if (activate && list.length) store.set('pad.prog', 'Perso', 'user');
    },
    act(a) {
      if (a === 'use') { const cur = shown(); this.write(cur.length ? cur : [1, 6, 4, 5]); } // what the slots show becomes « Mes accords »
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
      const list = shown();
      if (deg === 0) list.splice(this.sel); // "—": cut here
      else {
        while (list.length < this.sel) list.push({ d: (list[list.length - 1] || { d: 1 }).d, b: null });
        list[this.sel] = { d: deg, b: list[this.sel] ? list[this.sel].b : null };
        this.sel = Math.min(SLOTS - 1, this.sel + 1);
      }
      this.write(list);
    },
    setBars(bars) {
      const list = shown(); const i = Math.min(this.sel, list.length - 1);
      if (i < 0) return;
      list[i] = { ...list[i], b: bars };
      this.write(list);
    },
    render() {
      if (!this.panel || !AMB.seq) return;
      const mode = store.get('pad.prog'), fixed = !!T.PROGS[mode], active = mode === 'Perso' || fixed;
      const sl = shown(), list = sl.map((x) => x.d), mine = slots();
      const def = store.get('pad.length');
      // lengths as heard: in a song section the progression is fitted to it (seq.chordDurs)
      const eff = (active && AMB.seq.chordDurs && AMB.seq.chordDurs()) || sl.map((x) => x.b || def);
      const total = eff.reduce((a, b) => a + b, 0);
      const sec = AMB.song && AMB.song.sel();
      const fitted = sec && active && eff.some((b, i) => b !== (sl[i].b || def));
      let heard = list.length;
      if (sec && active) { heard = 0; for (let t = 0; heard < eff.length && t < sec.bars; t += eff[heard]) heard++; }
      this.panel.querySelector('.chords-mode').textContent = !active ? `Suite automatique · ${def} mes. par accord`
        : [`${sl.length} accords · ${total} mesures`, heard < list.length ? `« ${sec.name} » (${sec.bars} mes.) n'en joue que ${heard} : allonge la section`
          : fitted && `durées réduites pour tenir dans « ${sec.name} » (${sec.bars} mes.)`].filter(Boolean).join(' · ');
      // mode chips (single source of truth for the progression)
      this.modesEl.innerHTML = '<span class="roll-hint" style="margin:0 6px 0 0">Mode :</span>';
      for (const m of MODES) {
        const b = document.createElement('button');
        b.className = 'btn small' + (m === mode ? ' on' : '') + (T.PROGS[m] ? ' chord-mode' : '');
        if (T.PROGS[m]) { // its name and its chords in this key: no frozen roman numerals
          b.innerHTML = `<small>${T.PROGS[m].name}</small> ${names(m)}`;
          b.title = fixedSlots(m).map((x) => roman(x.d)).join('–');
        } else b.textContent = MODE_LABEL[m] || m;
        b.addEventListener('click', () => { if (m === 'Perso' && !mine.length) this.write([1, 6, 4, 5]); store.set('pad.prog', m, 'user'); });
        this.modesEl.append(b);
      }
      this.panel.classList.toggle('chords-auto', !active);
      const playing = AMB.seq.playing && active && list.length ? (AMB.seq.progIdx || 0) % list.length : -1;
      this.slotsEl.innerHTML = '';
      for (let i = 0; i < SLOTS; i++) {
        const d = list[i];
        const b = document.createElement('button');
        b.className = 'chord-slot' + (i === this.sel ? ' is-sel' : '') + (i === playing ? ' now' : '') + (d ? '' : ' empty');
        b.className += d && i >= heard ? ' unheard' : '';
        b.innerHTML = d ? `<b>${chordLabel(d)}</b><span>${roman(d)}</span><em>${eff[i]} mes.</em>` : `<b>+</b><span>${i < list.length + 1 ? 'ajouter' : ''}</span>`;
        if (d && i >= heard) b.title = `Pas joué : « ${sec.name} » s'arrête avant`;
        b.addEventListener('click', () => { this.sel = Math.min(i, list.length); this.render(); });
        this.slotsEl.append(b);
      }
      this.paletteEl.innerHTML = '';
      for (let d = 1; d <= 7; d++) {
        const b = document.createElement('button');
        b.className = 'btn small chord-chip';
        b.innerHTML = `<b>${roman(d)}</b> ${chordLabel(d)}`;
        b.addEventListener('click', () => this.pick(d));
        this.paletteEl.append(b);
      }
      const cut = document.createElement('button');
      cut.className = 'btn small chord-chip'; cut.textContent = '—';
      cut.title = 'Couper la progression à cette case';
      cut.addEventListener('click', () => this.pick(0));
      this.paletteEl.append(cut);
      // duration of the selected chord
      this.dursEl.innerHTML = '<span class="roll-hint" style="margin:0 6px 0 0">Durée de la case :</span>';
      const cur = sl[Math.min(this.sel, sl.length - 1)];
      for (const n of [1, 2, 4, 8]) {
        const b = document.createElement('button');
        b.className = 'btn small' + (cur && eff[Math.min(this.sel, sl.length - 1)] === n ? ' on' : ''); // as heard (fitted in a section)
        b.textContent = `${n} mes.`;
        b.addEventListener('click', () => this.setBars(n));
        this.dursEl.append(b);
      }
    },
  };

  AMB.chords = chords;
})();
