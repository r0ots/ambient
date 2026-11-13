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
      // S7.2: the slot that plays lights when the chord is HEARD (the scheduler runs ahead of the ear)
      AMB.bus.on('chord', (c) => { const x = AMB.engine.ctx, lat = x ? x.outputLatency || x.baseLatency || 0 : 0; setTimeout(() => this.render(), Math.max(50, x && c && c.time ? (c.time + lat - x.currentTime) * 1000 : 0)); });
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
        this.dropped = this.sel; // S7.2: this slot's chord falls in
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
      // S7.2: the rows of buttons are rebuilt only when what they show changes (a chord change while playing keeps
      // them, their hover and their motion)
      const sigM = [mode, AMB.seq.root, store.get('global.scale'), mine.length].join('|');
      if (this.modesEl._sig !== sigM) { this.modesEl._sig = sigM;
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
      } }
      this.panel.classList.toggle('chords-auto', !active);
      const playing = AMB.seq.playing && active && list.length ? (AMB.seq.progIdx || 0) % list.length : -1;
      // S7.2: the 8 slots are kept (updated in place): a chord that falls in, the one that plays, keep their motion
      if (!this.slotEls) {
        this.slotsEl.innerHTML = '';
        this.slotEls = Array.from({ length: SLOTS }, (_, i) => {
          const b = document.createElement('button');
          b.addEventListener('click', () => this.select(Math.min(i, shown().length)));
          this.slotsEl.append(b); return b;
        });
      }
      const M = AMB.motion, was = this.slotEls.findIndex((b) => b.classList.contains('now'));
      if (playing >= 0 && playing !== was) this.slotsEl.style.setProperty('--beat-ph', AMB.seq.beatPhase()); // its glow on the beat heard
      this.slotEls.forEach((b, i) => {
        const d = list[i];
        const cls = 'chord-slot' + (i === this.sel ? ' is-sel' : '') + (i === playing ? ' now' : '') + (d ? '' : ' empty') + (d && i >= heard ? ' unheard' : '');
        const keep = [...b.classList].filter((c) => /^(m-|is-)/.test(c)).join(' '); // (motion classes stay)
        b.className = cls + (keep ? ' ' + keep : '');
        const html = d ? `<b>${chordLabel(d)}</b><span>${roman(d)}</span><em>${eff[i]} mes.</em>` : `<b>+</b><span>${i < list.length + 1 ? 'ajouter' : ''}</span>`;
        if (b._html !== html) { b.innerHTML = html; b._html = html; }
        b.title = d && i >= heard ? `Pas joué : « ${sec.name} » s'arrête avant` : '';
      });
      // a chord just placed falls into its slot and bounces (sparks where it lands); the slot that starts playing flashes
      if (M && this.dropped != null) {
        const b = this.slotEls[this.dropped]; this.dropped = null;
        const an = M.fx(b.querySelector('b'), (a) => [{ translate: `0 ${-34 * a}px`, scale: `${1 - 0.2 * Math.min(1, a)} ${1 + 0.3 * Math.min(1, a)}`, opacity: 0 }, { opacity: 1, offset: 0.25 }, { translate: '0 0', scale: '1' }], { dur: 'slow', ease: 'bounce' });
        if (an) { M.fx(b, (a) => [{ scale: '1' }, { scale: `${1 + 0.1 * a} ${1 - 0.14 * a}`, offset: 0.3 }, { scale: '1' }], { dur: 'slow', ease: 'out' });
          setTimeout(() => M.burst(b, { n: 12, angle: -Math.PI / 2, spread: 2.8, speed: 260 }), M.ms('slow') * 0.3); }
      }
      if (M && playing >= 0 && playing !== was) M.fx(this.slotEls[playing], (a) => [{ scale: 1 + 0.12 * a, filter: 'brightness(2)' }, { scale: 1, filter: 'brightness(1)' }], { dur: 'slow', ease: 'out' });
      const sigP = [AMB.seq.root, store.get('global.scale')].join('|');
      if (this.paletteEl._sig === sigP) return this.renderDurs(sl, eff);
      this.paletteEl._sig = sigP;
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
      this.renderDurs(sl, eff);
    },
    // the selected slot hops when picked
    select(i) {
      this.sel = i; this.render();
      const b = this.slotEls && this.slotEls[i]; if (b && AMB.motion) AMB.motion.fx(b, (a) => [{ translate: '0 0' }, { translate: `0 ${-10 * a}px`, offset: 0.35 }, { translate: '0 0' }], { dur: 'slow', ease: 'out' });
    },
    // duration of the selected chord
    renderDurs(sl, eff) {
      const sigD = [this.sel, sl.length, eff.join(',')].join('|');
      if (this.dursEl._sig === sigD) return;
      this.dursEl._sig = sigD;
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
