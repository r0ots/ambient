// Song / arrangement mode: an ordered list of sections, each one a full snapshot of the sound
// (layers, FX, sequencer motifs, progression…) held for N bars. Playing the song walks the
// sections, crossfading continuous parameters over the first bars of each new section.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const LS = 'ambient.song.v1';
  const SKIP = new Set(['global.volume']);
  // composition material is shared by all sections (edit a motif once, the whole song follows);
  // sections only choose sound, which motif slot/chain plays, which layers are on, etc.
  const SHARED = new Set(['seq.pattern', 'seq.patB', 'seq.patC', 'seq.patD', 'bass.pattern', 'perc.pattern', 'pad.custom', 'auto.curve']);

  const song = {
    sections: [], playing: false, loop: true, idx: 0, barInSection: 0, fade: null,
    load() { try { const o = JSON.parse(localStorage.getItem(LS)); if (o && Array.isArray(o.sections)) { this.sections = o.sections; this.loop = o.loop !== false; } } catch (e) {} },
    save() { try { localStorage.setItem(LS, JSON.stringify({ sections: this.sections, loop: this.loop })); } catch (e) {} },
    snap() { const s = store.stableSnapshot(); for (const k of SKIP) delete s[k]; for (const k of SHARED) delete s[k]; return s; },

    add() {
      const names = ['Intro', 'A', 'B', 'Pont', 'C', 'Final'];
      const name = names[this.sections.length] || `Section ${this.sections.length + 1}`;
      this.sections.push({ name, bars: this.sections.length ? 16 : 8, snap: this.snap() });
      this.save(); this.render();
    },
    capture(i) { this.sections[i].snap = this.snap(); this.save(); this.render(); AMB.ui.toast(`« ${this.sections[i].name} » = état actuel`); },
    remove(i) { this.sections.splice(i, 1); if (this.idx >= this.sections.length) this.idx = 0; this.save(); this.render(); },
    move(i, d) {
      const j = i + d; if (j < 0 || j >= this.sections.length) return;
      [this.sections[i], this.sections[j]] = [this.sections[j], this.sections[i]];
      this.save(); this.render();
    },

    start() {
      if (!this.sections.length) { AMB.ui.toast('Ajoute d\'abord des sections (+ Section)'); return; }
      this.playing = true; this.idx = 0; this.barInSection = 0;
      this.enter(0, true);
      if (!AMB.seq.playing) AMB.ui.play();
      this.render();
    },
    stop() { this.playing = false; this.fade = null; this.render(); },

    // switch to section i: discrete params now, continuous params faded over `fadeBars`
    enter(i, instant = false) {
      const sec = this.sections[i]; if (!sec) return;
      const from = store.snapshot(), to = sec.snap;
      const discrete = {}, cont = [];
      for (const [k, v] of Object.entries(to)) {
        const sp = store.spec(k); if (!sp || SKIP.has(k) || SHARED.has(k)) continue;
        if (!sp.type || sp.type === 'knob') { if (from[k] !== v) cont.push([k, from[k], v]); }
        else discrete[k] = v;
      }
      store.setMany(discrete, 'morph');
      // start the section's own progression and motif chain from their beginning, right now
      AMB.seq.progIdx = -1;
      AMB.seq.origin = AMB.seq.step; // bars, chords and motif chains restart at the section start
      if (!instant) AMB.seq.forceChordChange = true;
      if (AMB.pianoRoll && AMB.pianoRoll.resetLatch) AMB.pianoRoll.resetLatch();
      if (instant || !cont.length) { for (const [k, , b] of cont) store.set(k, b, 'morph'); this.fade = null; }
      else this.fade = { cont, step: 0, steps: 32 }; // two bars of 16ths
      AMB.bus.emit('section', { index: i, name: sec.name });
    },

    // called by the sequencer on every 16th
    onStep(step) {
      if (!this.playing) return;
      if (this.fade) {
        const f = this.fade, t = Math.min(1, ++f.step / f.steps);
        const e = t * t * (3 - 2 * t); // smoothstep
        for (const [k, a, b] of f.cont) if (!AMB.isAutomated(k)) store.set(k, a + (b - a) * e, 'morph');
        if (t >= 1) this.fade = null;
      }
      if (step % 16 !== 0 || step === 0) return;
      // queued jump (keys 1–8): switch on the next bar line
      if (this.pending != null && this.sections[this.pending]) {
        this.idx = this.pending; this.pending = null; this.barInSection = 0;
        this.enter(this.idx); this.renderProgress(); return;
      }
      this.barInSection++;
      const sec = this.sections[this.idx];
      if (sec && this.barInSection >= sec.bars) {
        this.barInSection = 0;
        if (this.idx + 1 >= this.sections.length) {
          if (!this.loop) { this.stop(); AMB.ui.toast('Fin du morceau'); return; }
          this.idx = 0;
        } else this.idx++;
        this.enter(this.idx);
      }
      this.renderProgress();
    },

    build(container) {
      const panel = document.createElement('section');
      panel.className = 'panel song-panel';
      panel.style.setProperty('--c', '#7fd6ff');
      panel.innerHTML = `<header><h2 data-n="14">Morceau</h2><span class="chords-mode song-total"></span></header>
        <div class="song-sections"></div>
        <div class="roll-tools">
          <button class="btn small" data-s="add" title="Nouvelle section = état actuel du son">+ Section</button>
          <button class="btn small" data-s="play">▶ Jouer le morceau</button>
          <label class="btn small"><input type="checkbox" data-s="loop"> Boucler</label>
          <span class="roll-hint">Chaque section mémorise le son (couches, effets, motif joué) ; les motifs et la progression sont partagés. Touches 1–8 : aller à une section.</span>
        </div>`;
      container.prepend(panel);
      this.panel = panel;
      this.list = panel.querySelector('.song-sections');
      panel.querySelector('[data-s=add]').addEventListener('click', () => this.add());
      this.playBtn = panel.querySelector('[data-s=play]');
      this.playBtn.addEventListener('click', () => (this.playing ? this.stop() : this.start()));
      const lp = panel.querySelector('[data-s=loop]');
      lp.checked = this.loop;
      lp.addEventListener('change', () => { this.loop = lp.checked; this.save(); });
      this.render();
    },
    render() {
      if (!this.list) return;
      this.playBtn.textContent = this.playing ? '■ Arrêter le morceau' : '▶ Jouer le morceau';
      this.playBtn.classList.toggle('on', this.playing);
      const total = this.sections.reduce((a, s) => a + s.bars, 0);
      const secs = total * 4 * 60 / store.get('global.tempo');
      this.panel.querySelector('.song-total').textContent = this.sections.length
        ? `${this.sections.length} sections · ${total} mesures · ~${Math.floor(secs / 60)} min ${String(Math.round(secs % 60)).padStart(2, '0')}` : 'vide';
      this.list.innerHTML = '';
      if (!this.sections.length) {
        this.list.innerHTML = '<div class="song-empty">Règle un son, puis « + Section ». Recommence pour chaque partie du morceau.</div>';
        return;
      }
      this.sections.forEach((s, i) => {
        const card = document.createElement('div');
        card.className = 'song-card' + (this.playing && i === this.idx ? ' now' : '');
        card.innerHTML = `<input class="song-name" value="${s.name.replace(/"/g, '&quot;')}" aria-label="Nom de la section">
          <select class="song-bars" aria-label="Durée">${[4, 8, 16, 32, 64].map((b) => `<option value="${b}"${b === s.bars ? ' selected' : ''}>${b} mes.</option>`).join('')}</select>
          <div class="song-meta">${s.snap['global.key'] || ''} ${s.snap['global.scale'] || ''} · ${s.snap['pad.wave'] || ''}</div>
          <div class="song-prog"><i></i></div>
          <div class="song-btns">
            <button title="Écouter cette section maintenant" data-b="go">▶</button>
            <button title="Mettre à jour avec l'état actuel" data-b="cap">⟲</button>
            <button title="Déplacer à gauche" data-b="l">◀</button>
            <button title="Déplacer à droite" data-b="r">▶︎</button>
            <button title="Supprimer" data-b="del">✕</button>
          </div>`;
        card.querySelector('.song-name').addEventListener('change', (e) => { s.name = e.target.value.slice(0, 24) || s.name; this.save(); });
        card.querySelector('.song-name').addEventListener('keydown', (e) => e.stopPropagation());
        card.querySelector('.song-bars').addEventListener('change', (e) => { s.bars = Number(e.target.value); this.save(); this.render(); });
        card.querySelector('[data-b=go]').addEventListener('click', () => { this.idx = i; this.barInSection = 0; this.enter(i, !this.playing); this.render(); });
        card.querySelector('[data-b=cap]').addEventListener('click', () => this.capture(i));
        card.querySelector('[data-b=l]').addEventListener('click', () => this.move(i, -1));
        card.querySelector('[data-b=r]').addEventListener('click', () => this.move(i, 1));
        card.querySelector('[data-b=del]').addEventListener('click', () => { if (confirm(`Supprimer « ${s.name} » ?`)) this.remove(i); });
        this.list.append(card);
      });
      this.renderProgress();
    },
    renderProgress() {
      if (!this.list) return;
      this.list.querySelectorAll('.song-card').forEach((c, i) => {
        c.classList.toggle('now', this.playing && i === this.idx);
        const bar = c.querySelector('.song-prog i');
        if (bar) bar.style.width = this.playing && i === this.idx ? `${(this.barInSection / this.sections[i].bars) * 100}%` : '0';
      });
    },
  };

  // keys 1–8 jump to a section at the next bar (starts the song if needed)
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const n = parseInt(e.key, 10);
    if (!(n >= 1 && n <= 8) || !song.sections[n - 1]) return;
    if (AMB.tree && !AMB.tree.uiUnlocked('song')) return; // locked in the path
    e.preventDefault();
    if (!song.playing) { song.start(); song.idx = n - 1; song.enter(n - 1, true); song.render(); return; }
    song.pending = n - 1;
    AMB.ui.toast(`→ ${song.sections[n - 1].name} à la prochaine mesure`);
  });

  song.load();
  AMB.song = song;
})();
