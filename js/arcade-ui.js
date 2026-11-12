// Arcade screen (G9.2): a full-screen amber LCD cabinet over the app (#arcadeDlg).
// Menu of cartridges (one per registered mini-game), round screen (timer, 6-digit score, combo,
// replay, big answer buttons with 1–4 shortcuts), end screen (falling stars, blinking RECORD).
// While the cabinet is open, the app's keyboard shortcuts are muted (window capture listener);
// only the keys a mini-game asks for (passKeys) reach the app. Échap quits cleanly.
// The rest of the app is `inert` while the cabinet is open (focus goes back to #arcadeBtn on close); the
// app's MIDI is muted too (js/play.js reads arcade.open). A round starts the audio if needed (never muted)
// and refuses to start while a recording runs (the round ducks the ambience).
// A plugin's prepare(api) runs before arcade.start, off the clock (keys / MIDI routed to it, Échap cancels);
// after an answer the next challenge waits the plugin's `reveal` ms (default arcade.REVEAL).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const $ = (s, r = document) => r.querySelector(s);
  const pad6 = (n) => String(Math.max(0, Math.round(n))).padStart(6, '0').slice(-6);
  const starStr = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ui = {
    dlg: null, prep: null, screen: 'closed', gameId: null, timer: 0, token: 0, lockUntil: 0, lastPick: null, startTok: 0, inerted: [],

    get A() { return AMB.arcade; },
    el(sel) { return $(sel, this.dlg); },

    setup() {
      this.dlg = $('#arcadeDlg');
      const btn = $('#arcadeBtn');
      if (!this.dlg || !btn || !AMB.arcade) return;
      btn.addEventListener('click', () => this.open());
      this.el('[data-close]').addEventListener('click', () => this.close());
      this.el('.arc-replay').addEventListener('click', () => this.replay());
      this.el('.arc-again').addEventListener('click', () => this.start(this.gameId));
      this.el('.arc-menu-btn').addEventListener('click', () => this.menu());
      this.el('.arc-carts').addEventListener('click', (e) => { const c = e.target.closest('[data-game]'); if (c) this.start(c.dataset.game); });
      this.el('.arc-choices').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) this.pick(+b.dataset.i); });
      window.addEventListener('keydown', (e) => this.onKey(e), true); // capture: before every app shortcut
      const B = AMB.bus; if (!B) return;
      B.on('arcade:challenge', () => this.onChallenge());
      B.on('arcade:answer', (d) => this.onAnswer(d));
      B.on('arcade:end', (d) => this.onEnd(d));
    },

    // ---- screens ----
    show(name) {
      this.screen = name;
      // every section of the cabinet (.arc-<name>), including those added by other modules (js/daily.js, js/duel.js)
      this.dlg.querySelectorAll('.arc-cab > section').forEach((s) => { s.hidden = !s.classList.contains('arc-' + name); });
      if (AMB.bus) AMB.bus.emit('arcade:screen', name);
    },
    open() {
      if (!this.dlg) return;
      this.dlg.hidden = false; this.A.open = true;
      document.body.classList.add('arcade-on');
      this.setInert(true);
      this.say('');
      this.menu();
    },
    close() {
      if (!this.dlg) return;
      this.startTok++; this.endPrep(true);
      if (this.A.round) this.A.end({ abort: true });
      this.stopTimer();
      if (AMB.juice) AMB.juice.showCombo(false);
      this.dlg.hidden = true; this.A.open = false; this.screen = 'closed';
      if (AMB.bus) AMB.bus.emit('arcade:screen', 'closed');
      document.body.classList.remove('arcade-on');
      this.setInert(false);
      const btn = $('#arcadeBtn'); if (btn) btn.focus();
    },
    // everything but the cabinet (and its ancestors) becomes inert: no focus, no click, hidden from screen readers
    setInert(on) {
      this.inerted.forEach((e) => { e.inert = false; }); this.inerted = [];
      if (!on || !this.dlg) return;
      for (let el = this.dlg; el.parentElement && el !== document.body; el = el.parentElement) {
        for (const sib of el.parentElement.children) {
          if (sib === el || sib.inert || /^(SCRIPT|STYLE|LINK)$/.test(sib.tagName) || sib.id === 'fx') continue;
          sib.inert = true; this.inerted.push(sib);
        }
      }
    },
    say(text) { const m = this.el('.arc-msg'); if (!m) return; m.textContent = text || ''; m.hidden = !text; },
    recording() {
      return !!((AMB.rec && AMB.rec.recording && AMB.rec.recording()) || (AMB.pianoRoll && AMB.pianoRoll.roll && AMB.pianoRoll.roll.recording));
    },
    menu() {
      if (this.prep) { this.startTok++; this.endPrep(true); }
      if (this.A.round) this.A.end({ abort: true });
      this.stopTimer();
      if (AMB.juice) AMB.juice.showCombo(false);
      this.renderMenu(); this.show('menu');
      const first = this.el('.arc-cart'); if (first) first.focus();
    },
    renderMenu() {
      const A = this.A;
      this.el('.arc-carts').innerHTML = A.games.map((g) => {
        const st = A.stats(g.id), rec = A.record(g.id);
        return `<button class="arc-cart" data-game="${esc(g.id)}">
          <span class="arc-cart-top"><b>${esc(g.title)}</b>${g.kid ? '<i class="arc-kid">facile</i>' : ''}</span>
          <span class="arc-cart-blurb">${esc(g.blurb)}</span>
          <span class="arc-cart-meta"><span title="Niveau atteint">NIV ${Math.round((st.peak || 0) * 100)}%</span><span title="Record">REC ${pad6(rec ? rec.score : 0)}</span><span class="arc-cart-stars" title="Étoiles">${starStr(rec ? rec.stars : 0)}</span></span>
        </button>`;
      }).join('') || '<p class="arc-empty">Aucune cartouche.</p>';
    },

    // ---- round ----
    // opts go to arcade.start (seed, duration, d, fixed, count, ghost); ui.after(endData) → true = the caller shows its own screen
    async start(id, opts = {}) {
      const A = this.A;
      if (!id || !A.byId[id]) return;
      if (this.recording()) {
        if (this.screen !== 'menu') this.menu();
        this.say('● Enregistrement en cours : arrête-le avant de lancer une manche (elle baisserait le son enregistré).');
        return;
      }
      const tok = ++this.startTok;
      // the round must be heard: start / resume the audio first (a click on a cartridge is a user gesture)
      // (bounded: a browser that never resumes without a gesture must not freeze the cabinet)
      const audio = (async () => {
        if (AMB.ui && AMB.ui.ensureStarted) await AMB.ui.ensureStarted();
        const ctx = AMB.engine && AMB.engine.ctx;
        if (ctx && ctx.state === 'suspended') await ctx.resume();
      })().catch(() => {}); // no audio: the round still runs (silent)
      await Promise.race([audio, new Promise((r) => setTimeout(r, 1500))]);
      if (tok !== this.startTok || !this.dlg || this.dlg.hidden) return; // closed (or another start) meanwhile
      this.say('');
      this.gameId = id; this.lastPick = null; this.lockUntil = 0;
      this.show('play');
      this.el('.arc-game').textContent = A.byId[id].title;
      if (typeof A.byId[id].prepare === 'function') {
        await this.prepare(A.byId[id], tok);
        if (tok !== this.startTok || !this.dlg || this.dlg.hidden) return; // left during the preparation
      }
      const r = A.start(id, opts);
      if (!r) { this.menu(); return; }
      if (AMB.juice) { const c = AMB.juice.comboEl(); this.el('.arc-combo-slot').append(c); AMB.juice.showCombo(true); }
      this.renderHud();
      this.stopTimer();
      this.timer = setInterval(() => { if (!this.A.tick()) this.renderHud(); }, 100);
    },
    // the plugin's prepare(api), off the clock: HUD frozen at the full time, keys / MIDI routed to it
    async prepare(g, tok) {
      const A = this.A, Au = AMB.audition, stage = this.el('.arc-stage'), P = (this.prep = { key: null, midi: null });
      A.prep = P;
      this.el('.arc-choices').innerHTML = ''; stage.innerHTML = '';
      this.el('.arc-time').textContent = String(Math.ceil(A.DURATION / 1000)).padStart(2, '0');
      this.el('.arc-time').classList.remove('low');
      this.el('.arc-bar i').style.width = '100%';
      this.el('.arc-score').textContent = pad6(0);
      this.el('.arc-replay').hidden = true; // nothing to replay before the round
      if (Au) Au.session(true); // the ambience is ducked during the preparation too
      const api = {
        stage, play: (ev) => A.playEvents(ev), note: (ev) => A.note(ev), stop: () => Au && Au.stop(), now: () => A.clock.now(),
        onKey: (fn) => { P.key = fn; }, onMidi: (fn) => { P.midi = fn; }, cancelled: () => tok !== this.startTok,
      };
      try { await g.prepare(api); } catch (e) { /* a failed preparation never blocks the round */ }
      if (this.prep === P) this.endPrep(false);
    },
    endPrep(cancel) {
      if (!this.prep) return;
      this.prep = null; this.A.prep = null;
      this.el('.arc-replay').hidden = false;
      if (cancel && AMB.audition && !this.A.round) AMB.audition.session(false);
    },
    stopTimer() { if (this.timer) clearInterval(this.timer); this.timer = 0; },
    renderHud() {
      const A = this.A, r = A.round; if (!r) return;
      const left = A.timeLeft();
      if (!isFinite(r.dur)) { // no clock (zen): answers given / to give
        this.el('.arc-time').textContent = r.count ? `${Math.min(r.history.length + 1, r.count)}/${r.count}` : '∞';
        this.el('.arc-time').classList.remove('low'); this.el('.arc-bar i').style.width = '100%';
        this.el('.arc-score').textContent = pad6(r.score); this.el('.arc-level').textContent = `NIV ${Math.round(r.stair.d * 100)}%`;
        return;
      }
      this.el('.arc-time').textContent = String(Math.ceil(left / 1000)).padStart(2, '0');
      this.el('.arc-time').classList.toggle('low', left < 10000);
      this.el('.arc-bar i').style.width = `${(left / r.dur) * 100}%`;
      this.el('.arc-score').textContent = pad6(r.score);
      this.el('.arc-level').textContent = `NIV ${Math.round(r.stair.d * 100)}%`;
    },
    // a new challenge: draw its answers now (or after the feedback of the last answer), then play it
    onChallenge() {
      if (this.screen !== 'play' || !this.A.round) return;
      const tok = ++this.token, wait = Math.max(0, this.lockUntil - Date.now());
      this.lockUntil = Date.now() + wait + 350;
      setTimeout(() => { if (tok === this.token && this.A.round) { this.renderChallenge(); setTimeout(() => { if (tok === this.token && this.A.round) this.A.listen(); }, 250); } }, wait);
    },
    renderChallenge() {
      const A = this.A, r = A.round, g = r.game, box = this.el('.arc-choices'), stage = this.el('.arc-stage');
      const ch = A.choices();
      this.choices = ch || [];
      box.innerHTML = (ch || []).map((c, i) => `<button class="arc-choice" data-i="${i}" data-value="${esc(c.value)}"><kbd>${i + 1}</kbd>${esc(c.label)}</button>`).join('');
      stage.innerHTML = '';
      if (typeof g.render === 'function') g.render(r.ch, stage, A.api());
      this.renderHud();
    },
    pick(i) {
      const c = this.choices && this.choices[i];
      if (!c || !this.A.round || Date.now() < this.lockUntil) return;
      this.lastPick = i;
      this.A.answer(c.value);
    },
    replay() { if (this.A.round && Date.now() >= this.lockUntil) this.A.replay(); },
    onAnswer(d) {
      if (this.screen !== 'play') return;
      const J = AMB.juice, A = this.A, g = A.round && A.round.game, btns = [...this.dlg.querySelectorAll('.arc-choice')];
      // the right answer(s), whatever the mini-game: ask its own check()
      btns.forEach((b, i) => { const c = this.choices[i]; if (c && g && g.check(d.ch, c.value).ok) b.classList.add('good'); });
      const mine = btns.find((b) => b.dataset.value === String(d.answer)) || (this.lastPick != null && btns[this.lastPick]);
      if (mine && !d.ok) mine.classList.add('bad');
      this.lockUntil = Date.now() + (d.reveal != null ? d.reveal : this.A.REVEAL);
      const at = mine || this.el('.arc-stage');
      if (J) {
        if (d.ok) {
          J.burstAt(at, { n: 18 + d.mult * 6 });
          if (d.pts) J.floatText(at, `+${d.pts}`, { big: d.mult >= 3 });
          J.hitstop(40);
        } else {
          J.shake(this.el('.arc-cab'), 8);
          J.flash('var(--fx-bad)', 180);
        }
      }
      this.lastPick = null;
      this.renderHud();
    },
    onEnd(d) {
      this.stopTimer();
      if (AMB.juice) AMB.juice.showCombo(false);
      if (this.screen !== 'play' || d.abort) return;
      this.token++;
      if (typeof this.after === 'function' && this.after(d) === true) return;
      this.show('end');
      const g = this.A.byId[d.id];
      this.el('.arc-end-game').textContent = g ? g.title : d.id;
      this.el('.arc-end-score').textContent = pad6(d.score);
      this.el('.arc-stars').innerHTML = [0, 1, 2].map((i) => `<i class="arc-star${i < d.stars ? ' on' : ''}" style="animation-delay:${0.25 + i * 0.45}s">★</i>`).join('');
      this.el('.arc-record').hidden = !d.record;
      this.el('.arc-end-stats').textContent = `${d.good}/${d.total} justes · ${d.clean} sans réécouter · niveau ${Math.round(d.d * 100)}%`;
      const again = this.el('.arc-again'); if (again) again.focus();
      if (d.record && AMB.juice) setTimeout(() => AMB.juice.burstAt(this.el('.arc-record'), { n: 60, color: 'var(--fx-combo)', kind: 'shard', speed: 280 }), 300);
    },

    // ---- keyboard: the cabinet owns the keys while it is open ----
    onKey(e) {
      if (!this.dlg || this.dlg.hidden) return;
      const r = this.A.round, g = r && r.game;
      if (g && g.passKeys && g.passKeys.includes(e.code)) return; // asked for by the mini-game
      e.stopPropagation(); // no app shortcut: Space, Enter, A–L, Z–M, 1–8, ⌘Z…
      if (e.metaKey || e.ctrlKey || e.altKey) { if (/^Key[ZY]$/.test(e.code)) e.preventDefault(); return; }
      if (e.key === 'Escape') { e.preventDefault(); if (this.screen !== 'menu') this.menu(); else this.close(); return; }
      if (this.screen === 'play' && !r && this.prep) { if (!e.repeat && this.prep.key && this.prep.key(e)) e.preventDefault(); return; }
      if (this.screen !== 'play' || !r) return;
      if (e.code === 'Space') e.preventDefault(); // never "click" a focused answer by accident
      if (e.repeat) return;
      if (typeof g.onKey === 'function' && g.onKey(r.ch, e, this.A.api())) { e.preventDefault(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9 && this.choices && this.choices[n - 1]) { e.preventDefault(); this.pick(n - 1); return; }
      if (e.code === 'KeyR') { e.preventDefault(); this.replay(); }
    },
  };

  AMB.arcadeUI = ui;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ui.setup()); else ui.setup();
})();
