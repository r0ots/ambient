// Song / arrangement (S6.3): an ordered list of sections (Intro, Couplet, Montée, Refrain, Fin…), each one a whole
// state of the instrument held for N bars: its sound (layers, effects) AND its own material: written melody (piano roll
// slots A–D and their chain), bass grid, Pulsations grid, chord progression.
// The selected section is the one you hear and edit: selecting it loads its state into the store, and every change the
// player makes from then on (knob, motif drawn, progression, paysage loaded, undo…) is written back into it. So the
// existing editors (piano roll, Pulsations, Basse, Progression) show and write the selected section's motifs, nothing
// to capture by hand. Playing the song walks the sections on the bar line, crossfading continuous parameters over the
// first two bars of each new section. A song saved before S6.3 (sound only, motifs shared) fills each section's missing
// motifs with the current ones the first time it is loaded; a saved patch or a shared link is one state = one section.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const LS = 'ambient.song.v1';
  const SKIP = new Set(['global.volume']);
  const GLOBAL = new Set(['auto.curve']); // the drawn automation curve stays one for the whole song
  // writes that are not the player's: morphs (sections, scenes), slow movements, motif variation, the game's locks
  const IGNORE = new Set(['morph', 'evolve', 'lfo', 'game', 'sync']);
  // a new section starts with empty motifs (its sound and its progression come from the selected section)
  const ROWS0 = Array(4).fill('0'.repeat(16)).join('.');
  const EMPTY = { 'seq.pattern': '', 'seq.patB': '', 'seq.patC': '', 'seq.patD': '', 'seq.chain': '', 'bass.pattern': ROWS0, 'perc.pattern': ROWS0 };
  const NAMES = ['Intro', 'Couplet', 'Montée', 'Refrain', 'Pont', 'Fin'];
  const BARS = [2, 4, 8, 16, 32, 64];
  // `loops`: S6.4's looper will keep the loops recorded in a section here (played whenever the section plays)
  const make = (name, bars, snap) => ({ name, bars, snap, loops: [] });

  const song = {
    // idx = the selected section (heard, edited, playing); -1 = none (after a reload, a mode change, an empty song)
    sections: [], playing: false, loop: true, idx: -1, barInSection: 0, fade: null, pending: null,
    load() {
      try {
        const o = JSON.parse(localStorage.getItem(LS));
        if (o && Array.isArray(o.sections)) this.replace(o, false);
      } catch (e) {}
    },
    // a song from storage or from an exported file (older ones: no loops, motifs filled on first load)
    replace(o, persist = true) {
      this.sections = o.sections.filter((s) => s && s.snap).map((s) => ({ ...make(String(s.name || 'Section'), Number(s.bars) || 8, s.snap), loops: s.loops || [] }));
      this.loop = o.loop !== false; this.idx = -1; this.pending = null;
      if (persist) { this.save(); this.render(); }
    },
    save() { clearTimeout(this._t); try { localStorage.setItem(LS, JSON.stringify({ sections: this.sections, loop: this.loop })); } catch (e) {} },
    saveSoon() { clearTimeout(this._t); this._t = setTimeout(() => this.save(), 400); },
    snap() { const s = store.stableSnapshot(); for (const k of SKIP) delete s[k]; for (const k of GLOBAL) delete s[k]; return s; },
    sel() { return this.sections[this.idx] || null; },
    // read a parameter as the section plays it (MIDI export)
    getter(sec) { return (k) => (sec && k in sec.snap ? sec.snap[k] : store.get(k)); },

    // + Section: after the selected one, same sound and progression, empty motifs; the first one is the current state
    add() {
      const base = this.sel(), n = this.sections.length;
      const name = NAMES[n] || `Section ${n + 1}`;
      const snap = base ? { ...base.snap, ...EMPTY } : this.snap();
      const at = base ? this.idx + 1 : n;
      this.sections.splice(at, 0, make(name, 8, snap));
      this.shiftPending(at, 1);
      this.save(); this.select(at, true);
    },
    dup(i = this.idx) {
      const s = this.sections[i]; if (!s) return;
      const name = /\d$/.test(s.name) ? s.name.replace(/\d+$/, (d) => Number(d) + 1) : `${s.name} 2`;
      this.sections.splice(i + 1, 0, { ...make(name.slice(0, 24), s.bars, { ...s.snap }), loops: JSON.parse(JSON.stringify(s.loops || [])) });
      this.shiftPending(i + 1, 1);
      this.save(); this.select(i + 1, true);
    },
    remove(i = this.idx) {
      if (!this.sections[i]) return;
      this.sections.splice(i, 1);
      if (this.pending === i) this.pending = null; else this.shiftPending(i, -1);
      if (i === this.idx) { // the heard section is gone: its neighbour is loaded
        this.idx = -1;
        if (this.sections.length) { const j = Math.min(i, this.sections.length - 1); if (this.playing) { this.idx = j; this.barInSection = 0; this.enter(j); } else this.enter(j, !AMB.seq.playing); }
      } else if (i < this.idx) this.idx--;
      if (!this.sections.length && this.playing) this.stop();
      this.save(); this.render();
    },
    move(i, d) {
      const j = i + d; if (j < 0 || j >= this.sections.length) return;
      [this.sections[i], this.sections[j]] = [this.sections[j], this.sections[i]];
      if (this.idx === i) this.idx = j; else if (this.idx === j) this.idx = i;
      if (this.pending === i) this.pending = j; else if (this.pending === j) this.pending = i;
      this.save(); this.render();
      const c = this.strip && this.strip.querySelector(`[data-i="${j}"]`); if (c && this.panel.contains(document.activeElement)) c.focus();
    },
    shiftPending(at, d) { if (this.pending != null && this.pending >= at) this.pending += d; },

    // select a section to hear and edit it: right now when stopped, on the next bar line when the music plays
    select(i, now = false) {
      if (!this.sections[i]) return;
      if (AMB.seq.playing && !now) {
        if (i === this.idx && this.pending == null) return this.render();
        this.pending = i; this.render();
        AMB.ui.toast(`→ ${this.sections[i].name} à la prochaine mesure`);
        return;
      }
      this.pending = null;
      if (this.playing) this.barInSection = 0;
      this.enter(i, !AMB.seq.playing);
      this.render();
    },
    // keys 1–8, MIDI Program Change: go to a section (starts the song when it does not play)
    jump(i) {
      if (!this.sections[i]) return false;
      if (AMB.tree && !AMB.tree.uiUnlocked('song')) return false; // locked in the path
      if (!this.playing) { this.start(null, i); return true; }
      this.select(i);
      return true;
    },

    // onEnd (the one-gesture song recording, js/rec.js): play the song once, then call onEnd(audio time of the end)
    start(onEnd, from = 0) {
      if (!this.sections.length) { AMB.ui.toast('Ajoute d\'abord des sections (+ Section)'); return; }
      this.playing = true; this.barInSection = 0; this.pending = null;
      this.onEnd = typeof onEnd === 'function' ? onEnd : null;
      this.enter(this.sections[from] ? from : 0, true);
      if (!AMB.seq.playing) AMB.ui.play();
      this.render();
    },
    stop() { this.playing = false; this.pending = null; this.finishFade(); this.onEnd = null; this.render(); },
    finishFade() { if (this.fade) { for (const [k, , b] of this.fade.cont) if (!AMB.isAutomated(k)) store.set(k, b, 'morph'); this.fade = null; } },

    // load section i into the store: discrete params now, continuous params faded over two bars (unless instant)
    enter(i, instant = false) {
      const sec = this.sections[i]; if (!sec) return;
      this.finishFade();
      this.idx = i;
      const from = store.snapshot(), to = sec.snap;
      const discrete = {}, cont = [];
      for (const [k, v] of Object.entries(to)) {
        const sp = store.spec(k); if (!sp || SKIP.has(k) || GLOBAL.has(k)) continue;
        if (!sp.type || sp.type === 'knob') { if (from[k] !== v) cont.push([k, from[k], v]); }
        else discrete[k] = v;
      }
      store.setMany(discrete, 'morph');
      // a section saved before S6.3 (or before a parameter existed) takes what is heard now for what it lacks
      for (const [k, v] of Object.entries(this.snap())) if (!(k in sec.snap)) sec.snap[k] = v;
      // the section's own progression and motif chain start from their beginning, right now
      AMB.seq.progIdx = -1;
      AMB.seq.origin = AMB.seq.step; // bars, chords and motif chains restart at the section start
      if (!instant) AMB.seq.forceChordChange = true;
      if (AMB.pianoRoll && AMB.pianoRoll.resetLatch) AMB.pianoRoll.resetLatch();
      if (instant || !cont.length) { for (const [k, , b] of cont) store.set(k, b, 'morph'); this.fade = null; }
      else this.fade = { cont, step: 0, steps: 32 }; // two bars of 16ths
      AMB.bus.emit('section', { index: i, name: sec.name });
    },

    // every change the player makes goes into the selected section
    write(k, v, source) {
      const sec = this.sel();
      if (!sec || IGNORE.has(source) || SKIP.has(k) || GLOBAL.has(k)) return;
      if (this.fade) this.fade.cont = this.fade.cont.filter((c) => c[0] !== k); // the player takes this one over
      if (sec.snap[k] === v) return;
      sec.snap[k] = v; this.saveSoon(); this.renderMeta();
    },

    // called by the sequencer on every 16th
    onStep(step) {
      if (this.fade) {
        const f = this.fade, t = Math.min(1, ++f.step / f.steps);
        const e = t * t * (3 - 2 * t); // smoothstep
        for (const [k, a, b] of f.cont) if (!AMB.isAutomated(k)) store.set(k, a + (b - a) * e, 'morph');
        if (t >= 1) this.fade = null;
      }
      // bar lines count from the section start (seq.origin), like the sequencer's bars: a section lasts its full bars
      const rel = step - (AMB.seq.origin || 0);
      if (rel <= 0 || rel % 16 !== 0) return;
      // queued jump (a section selected, keys 1–8, Program Change): switch on the next bar line
      if (this.pending != null) {
        const p = this.pending; this.pending = null;
        if (this.sections[p]) { this.barInSection = 0; this.enter(p); this.render(); return; }
      }
      if (!this.playing) return;
      this.barInSection++;
      const sec = this.sel();
      if (sec && this.barInSection >= sec.bars) {
        this.barInSection = 0;
        if (this.idx + 1 >= this.sections.length) {
          const onEnd = this.onEnd;
          if (onEnd) { this.stop(); onEnd(AMB.seq.nextTime); return; } // the step being scheduled = end of the last bar
          if (!this.loop) { this.stop(); AMB.ui.toast('Fin du morceau'); return; }
          this.enter(0);
        } else this.enter(this.idx + 1);
        this.render(); return;
      }
      this.renderProgress();
    },

    // ---- panel: a strip of sections (select = hear and edit), the selected one's settings, the song's transport ----
    build(container) {
      const panel = document.createElement('section');
      panel.className = 'panel song-panel';
      panel.style.setProperty('--c', '#7fd6ff');
      panel.innerHTML = `<header><h2 data-n="14">Morceau</h2><span class="chords-mode song-total"></span></header>
        <div class="song-strip" role="listbox" aria-label="Sections du morceau"></div>
        <div class="song-edit">
          <input class="song-name" maxlength="24" aria-label="Nom de la section">
          <select class="song-bars" aria-label="Longueur de la section">${BARS.map((b) => `<option value="${b}">${b} mes.</option>`).join('')}</select>
          <span class="song-btns">
            <button data-b="dup" title="Dupliquer la section (son et motifs)" aria-label="Dupliquer">⧉</button>
            <button data-b="l" title="Avancer la section" aria-label="Déplacer avant">◀</button>
            <button data-b="r" title="Reculer la section" aria-label="Déplacer après">▶</button>
            <button data-b="del" title="Supprimer la section" aria-label="Supprimer">✕</button>
          </span>
          <span class="song-meta"></span>
        </div>
        <div class="roll-tools">
          <button class="btn small" data-s="play">▶ Jouer le morceau</button>
          <button class="btn small" data-s="rec" title="Joue le morceau depuis le début et l'enregistre en WAV jusqu'à la fin">● Rec</button>
          <span class="song-rec-why">● Rec : ajoute d'abord une section</span>
          <label class="btn small"><input type="checkbox" data-s="loop"> Boucler</label>
          <span class="roll-hint">Choisis une section : son son, ses motifs et ses accords s'éditent dessous. Touches 1–8 ou Program Change MIDI : y aller.</span>
        </div>`;
      container.prepend(panel);
      this.panel = panel;
      this.strip = panel.querySelector('.song-strip');
      this.edit = panel.querySelector('.song-edit');
      this.strip.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.s === 'add') this.add(); else this.select(Number(b.dataset.i));
      });
      this.strip.addEventListener('keydown', (e) => { // ← → between sections, Alt+← → to move the focused one
        const b = e.target.closest('[data-i]'); if (!b || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        const i = Number(b.dataset.i), d = e.key === 'ArrowLeft' ? -1 : 1;
        if (e.altKey) return this.move(i, d);
        const n = this.strip.querySelector(`[data-i="${i + d}"]`) || (d > 0 && this.strip.querySelector('[data-s=add]')); if (n) n.focus();
      });
      const name = panel.querySelector('.song-name');
      name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') name.blur(); });
      name.addEventListener('change', () => { const s = this.sel(); if (s) { s.name = name.value.trim().slice(0, 24) || s.name; this.save(); this.render(); } });
      panel.querySelector('.song-bars').addEventListener('change', (e) => { const s = this.sel(); if (s) { s.bars = Number(e.target.value); this.save(); this.render(); } });
      this.edit.addEventListener('click', (e) => {
        const b = e.target.closest('[data-b]'); if (!b || this.idx < 0) return;
        const a = b.dataset.b, s = this.sel();
        if (a === 'dup') this.dup();
        else if (a === 'l') this.move(this.idx, -1);
        else if (a === 'r') this.move(this.idx, 1);
        else if (a === 'del' && confirm(`Supprimer « ${s.name} » ?`)) this.remove();
      });
      this.playBtn = panel.querySelector('[data-s=play]');
      this.playBtn.addEventListener('click', () => (this.playing ? this.stop() : this.start()));
      this.recBtn = panel.querySelector('[data-s=rec]');
      this.recBtn.addEventListener('click', () => AMB.rec.toggleSongRec(this.recBtn));
      const lp = panel.querySelector('[data-s=loop]');
      lp.checked = this.loop;
      lp.addEventListener('change', () => { this.loop = lp.checked; this.save(); });
      this.render();
    },
    render() {
      if (!this.strip) return;
      this.playBtn.textContent = this.playing ? '■ Arrêter le morceau' : '▶ Jouer le morceau';
      this.playBtn.classList.toggle('on', this.playing);
      const recording = AMB.rec && AMB.rec.songRecording();
      this.recBtn.disabled = !this.sections.length && !recording;
      this.panel.classList.toggle('song-none', !this.sections.length);
      const total = this.sections.reduce((a, s) => a + s.bars, 0);
      const secs = total * 4 * 60 / store.get('global.tempo');
      this.panel.querySelector('.song-total').textContent = this.sections.length
        ? `${this.sections.length} section${this.sections.length > 1 ? 's' : ''} · ${total} mesures · ~${Math.floor(secs / 60)} min ${String(Math.round(secs % 60)).padStart(2, '0')}` : 'vide';
      const focused = this.panel.contains(document.activeElement) && document.activeElement.dataset ? document.activeElement.dataset.i : null;
      const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      this.strip.innerHTML = this.sections.map((s, i) => `<button class="song-chip${i === this.idx ? ' sel' : ''}${i === this.pending ? ' next' : ''}" data-i="${i}" role="option" aria-selected="${i === this.idx}" title="${i < 8 ? `Touche ${i + 1} · ` : ''}${esc(s.name)}">
          <b>${esc(s.name)}</b><small>${s.bars}</small><i class="song-prog"><i></i></i></button>`).join('')
        + `<button class="song-chip song-add" data-s="add" title="Nouvelle section : même son et mêmes accords, motifs vides">+ Section</button>`;
      if (!this.sections.length) this.strip.insertAdjacentHTML('afterbegin', '<div class="song-empty">Une section = un son, ses motifs et ses accords. « + Section » part de ce que tu entends.</div>');
      if (focused != null) { const f = this.strip.querySelector(`[data-i="${focused}"]`); if (f) f.focus(); }
      const s = this.sel();
      this.edit.hidden = !s;
      if (s) {
        const name = this.edit.querySelector('.song-name'); if (document.activeElement !== name) name.value = s.name;
        const bars = this.edit.querySelector('.song-bars');
        if (!BARS.includes(s.bars)) bars.insertAdjacentHTML('beforeend', `<option value="${s.bars}">${s.bars} mes.</option>`);
        bars.value = String(s.bars);
        this.edit.querySelector('[data-b=l]').disabled = this.idx === 0;
        this.edit.querySelector('[data-b=r]').disabled = this.idx === this.sections.length - 1;
      }
      this.renderMeta();
      this.renderProgress();
    },
    // what the selected section holds, in a few words
    renderMeta() {
      const s = this.sel(), el = this.edit && this.edit.querySelector('.song-meta'); if (!el || !s) return;
      const g = this.getter(s), PR = AMB.pianoRoll;
      const notes = PR ? ['seq.pattern', 'seq.patB', 'seq.patC', 'seq.patD'].reduce((a, k) => a + PR.parse(g(k)).length, 0) : 0;
      const hits = (k) => g(k.split('.')[0] + '.on') && /[1-9a-f]/i.test(String(g(k)).replace(/\./g, ''));
      const prog = g('pad.prog') === 'Perso' ? String(g('pad.custom')).trim() : g('pad.prog');
      el.textContent = [`${notes} note${notes > 1 ? 's' : ''}`, hits('bass.pattern') && 'basse', hits('perc.pattern') && 'pulsations', `accords ${prog}`].filter(Boolean).join(' · ');
    },
    renderProgress() {
      if (!this.strip) return;
      this.strip.querySelectorAll('.song-chip[data-i]').forEach((c) => {
        const i = Number(c.dataset.i), now = this.playing && i === this.idx;
        c.classList.toggle('now', now);
        const bar = c.querySelector('.song-prog i');
        if (bar) bar.style.width = now ? `${(this.barInSection / this.sections[i].bars) * 100}%` : '0';
      });
    },
  };

  store.on((k, v, source) => song.write(k, v, source));
  // keys 1–8 jump to a section at the next bar (start the song if needed)
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const n = parseInt(e.key, 10);
    if (!(n >= 1 && n <= 8) || !song.sections[n - 1]) return;
    if (song.jump(n - 1)) e.preventDefault();
  });
  if (AMB.bus) {
    // another mode brings its own sound: the song lets go of it (pick a section to hear it again)
    AMB.bus.on('game:mode', () => { if (song.playing) song.stop(); song.idx = -1; song.pending = null; song.render(); });
    AMB.bus.on('game:reset', () => { song.idx = -1; song.pending = null; song.render(); });
    // a node opened in the path (a layer turned on, an effect back at its default) is opened in every section
    AMB.bus.on('game:unlock', (d) => {
      const T = AMB.tree; if (!T || !d || !song.sections.length) return;
      const keys = T.allKeys().filter((k) => T.nodeFor(k) === d.id && !SKIP.has(k) && !GLOBAL.has(k));
      for (const s of song.sections) for (const k of keys) s.snap[k] = store.get(k);
      if (keys.length) song.save();
    });
  }
  window.addEventListener('pagehide', () => song.save());

  song.load();
  AMB.song = song;
})();
