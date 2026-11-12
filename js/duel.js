// « Défie ton cousin » (G10.3): set a target, beat it yourself, send it as a link; the cousin takes it up.
// No server: the link carries the challenge (#df=<base64url(JSON)>~<checksum>, codec of js/daily.js), never the answer:
//   Réponds en jouant  {v, k:'r', sd (seed), d (level), n, s, p}   → the same motif (same seed, same frozen level) for both
//   Énigme Mastermind  {v, k:'m', th (puzzle theme), sd, n, s, p, t (validations), l (listens)}
//                      → the theme gives the settings, the seed gives the target AND the starting sound (same for both)
// The sender must succeed first (motif played right / target found) before the link exists. The receiver's first try
// counts; the comparison uses the relative score (AMB.daily.rel: score × level coefficient). A reply link is the same
// challenge with the receiver's score: opening it shows the comparison. Mastermind is heard on the real ambience
// (store writes with source 'game', like the path's puzzles); the player's own values come back when leaving.
// Ghost rounds (arcade.start opts): the arcade levels and records are untouched; path only, nothing in free mode.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const q = new URLSearchParams(location.search);
  const KEY = window.AMB_DUEL_KEY || q.get('duelkey') || 'ambient.duel.v1';
  const $ = (s, r = document) => r.querySelector(s);
  const D = () => AMB.daily;
  const LVL = [{ d: 0.15, label: 'Facile' }, { d: 0.45, label: 'Moyen' }, { d: 0.8, label: 'Expert' }];
  const MAXTRY = 6, MAX_R = 4000;
  const PEG = { ok: '✓', near: '≈', far: '✗' }, DIR = { up: '⬆', down: '⬇', other: '↔' };

  // Mastermind score: fewer validations, fewer listens (3 free) → more points; failed = 0
  const mmScore = (t, l) => (t >= 1 && t <= MAXTRY ? Math.max(500, 1000 * (7 - t) - 100 * Math.max(0, l - 3)) : 0);

  const duel = {
    key: KEY, LVL, MAXTRY, mmScore,
    s: { v: 1, mine: {} }, // mine[challengeKey] = {s, r, p, ok, t?, l?} : the first try (sender: the success)
    view: 'make', kind: 'r', draft: null, mm: null, incoming: null, result: null, note: '',

    load() {
      try { const o = JSON.parse(localStorage.getItem(this.key)); if (o && o.v === 1 && o.mine && typeof o.mine === 'object') this.s = o; } catch (e) {}
      return this;
    },
    save() {
      const ks = Object.keys(this.s.mine); if (ks.length > 60) ks.slice(0, ks.length - 60).forEach((k) => delete this.s.mine[k]);
      try { localStorage.setItem(this.key, JSON.stringify(this.s)); } catch (e) {}
    },
    ckey(c) { return c.k === 'r' ? `r:${c.sd}:${c.d}` : `m:${c.th}:${c.sd}`; },
    newSeed() { this.ctr = (this.ctr || 0) + 1; return D().link.fnv(`${Date.now()}|${this.ctr}|${(AMB.arcade && AMB.arcade.clock.now()) || 0}`) >>> 0; },

    // ---- Mastermind targets: theme = a puzzle of js/puzzles.js (its settings), seed → target + starting sound ----
    themes(g = AMB.game) { const P = AMB.puzzles; return P ? P.DEFS.filter((d) => d.need.every((n) => g.has(n))) : []; },
    keysOf(th) {
      const P = AMB.puzzles, d = P && P.byId[th]; if (!d) return [];
      return Object.keys(d.target).filter((k) => { const sp = AMB.store.spec(k); return sp && sp.type !== 'text'; });
    },
    draw(th, sd) {
      const keys = this.keysOf(th), Au = AMB.audition; if (!keys.length || !Au) return null;
      const rng = Au.rng(sd >>> 0), target = {}, start = {};
      const LEVELS = [0.1, 0.3, 0.5, 0.7, 0.9];
      for (const k of keys) {
        const sp = AMB.store.spec(k);
        const knob = (f) => { let v = sp.min + f * (sp.max - sp.min); if (sp.step) v = Math.round(v / sp.step) * sp.step; return Math.round(v * 1000) / 1000; };
        if (sp.type === 'select') {
          const o = sp.options, i = rng.int(o.length); target[k] = o[i];
          start[k] = o[(i + 1 + rng.int(o.length - 1)) % o.length];
        } else if (sp.type === 'toggle') { target[k] = rng() < 0.5; start[k] = !target[k]; }
        else {
          const i = rng.int(LEVELS.length), far = [0, 1, 2, 3, 4].filter((j) => Math.abs(j - i) >= 2);
          target[k] = knob(LEVELS[i]); start[k] = knob(LEVELS[far[rng.int(far.length)]]);
        }
      }
      return { keys, target, start };
    },
    label(k) { const [sec] = k.split('.'), S = AMB.SCHEMA && AMB.SCHEMA[sec], sp = AMB.store.spec(k); return `${S ? S.label : sec} · ${sp ? sp.label : k}`; },

    // ---- a received link → a clean challenge, or null (forged, malformed, out of range) ----
    parse(o) {
      const L = D().LEVELS, P = AMB.puzzles;
      if (!o || o.v !== 1 || (o.k !== 'r' && o.k !== 'm')) return null;
      const n = D().cleanName(o.n), s = o.s, p = o.p, sd = o.sd;
      if (!n || !Number.isInteger(s) || s < 0 || !L[p] || !Number.isInteger(sd) || sd < 0 || sd > 4294967295) return null;
      const c = { k: o.k, sd, n, s, p };
      if (o.k === 'r') {
        if (typeof o.d !== 'number' || !(o.d >= 0 && o.d <= 1) || s < 1 || s > MAX_R) return null;
        c.d = Math.round(o.d * 100) / 100;
      } else {
        if (typeof o.th !== 'string' || !P || !P.byId[o.th] || !Number.isInteger(o.t) || !Number.isInteger(o.l) || o.l < 0 || o.l > 999 || s !== mmScore(o.t, o.l) || !s) return null;
        c.th = o.th; c.t = o.t; c.l = o.l;
      }
      return c;
    },
    payload(c, me) {
      const o = { v: 1, k: c.k, sd: c.sd, n: D().s.name || 'Moi', s: me.s, p: me.p };
      if (c.k === 'r') o.d = c.d; else { o.th = c.th; o.t = me.t; o.l = me.l; }
      return o;
    },
    title(c) { return c.k === 'r' ? `Réponds en jouant · ${this.lvlName(c.d)}` : `Énigme · ${(AMB.puzzles.byId[c.th] || {}).title || '?'}`; },
    lvlName(d) { const L = LVL.reduce((a, x) => (Math.abs(x.d - d) < Math.abs(a.d - d) ? x : a)); return `${L.label} (${Math.round(d * 100)} %)`; },

    // ---- playing a challenge (who: 'me' = the sender trying their own, 'them' = taking up a cousin's) ----
    play(c, who) {
      this.cur = { c, who };
      if (c.k === 'r') {
        const U = AMB.arcadeUI;
        U.after = this.afterFn;
        U.start('reponds', { seed: c.sd, d: c.d, fixed: true, ghost: true, count: 1, duration: Infinity })
          .then(() => { const t = U.el('.arc-game'); if (t && AMB.arcade.round) t.textContent = who === 'me' ? 'TON DÉFI' : `DÉFI DE ${c.n.toUpperCase()}`; });
      } else this.mmStart(c);
    },
    roundEnd(d) {
      if (AMB.arcadeUI.after === this.afterFn) AMB.arcadeUI.after = null;
      const cur = this.cur; if (!cur) return false;
      this.finish({ ok: d.good >= 1, s: d.score });
      return true;
    },
    // a try is over: the sender's success unlocks the link; the receiver's first try is kept for the comparison
    finish(res) {
      const { c, who } = this.cur, p = D().level(), k = this.ckey(c);
      const me = { s: res.ok ? res.s : 0, r: res.ok ? D().rel(res.s, p) : 0, p, ok: !!res.ok, t: res.t, l: res.l };
      if (who === 'me') {
        if (res.ok && (!this.s.mine[k] || !this.s.mine[k].ok)) { this.s.mine[k] = me; this.save(); }
        this.result = { c, me, first: true };
      } else {
        const first = !this.s.mine[k];
        if (first) { this.s.mine[k] = me; this.save(); }
        this.result = { c, me: this.s.mine[k], tried: me, first };
      }
      this.view = who === 'me' ? 'made' : 'taken';
      this.show();
    },

    // ---- Mastermind duel in the cabinet ----
    mmStart(c) {
      const dr = this.draw(c.th, c.sd); if (!dr) return;
      const S = AMB.store, orig = {};
      dr.keys.forEach((k) => { orig[k] = S.get(k); });
      this.mmLeave();
      this.mm = { c, ...dr, mine: { ...dr.start }, tries: [], listens: 0, side: 'mine', orig };
      this.apply(this.mm.mine);
      this.view = 'mm'; this.show();
    },
    apply(vals) {
      if (AMB.puzzles && AMB.puzzles.ab) AMB.puzzles.listen('mine');
      AMB.store.setMany(vals, 'game');
      if (AMB.seq && !AMB.seq.playing && AMB.ui && AMB.ui.play) AMB.ui.play().catch(() => {});
    },
    mmListen(side) {
      const m = this.mm; if (!m) return;
      if (side === 'target' && m.side !== 'target') m.listens++;
      m.side = side; this.apply(side === 'target' ? m.target : m.mine); this.render();
    },
    mmSet(k, v) {
      const m = this.mm; if (!m) return;
      const sp = AMB.store.spec(k);
      m.mine[k] = sp.type === 'toggle' ? v === 'true' || v === true : sp.type === 'select' ? v : Number(v);
      m.side = 'mine'; this.apply(m.mine);
      const b = $('.arc-mm-side', this.sec); if (b) b.textContent = '◀ ton son';
    },
    mmValidate() {
      const m = this.mm, P = AMB.puzzles; if (!m || !P) return null;
      const pegs = m.keys.map((k) => P.peg(k, m.mine[k], m.target[k]));
      const total = m.keys.reduce((a, k) => a + P.keyScore(k, m.mine[k], m.target[k]), 0) / m.keys.length;
      m.tries.push({ pegs, total });
      const ok = total >= P.PASS;
      if (ok || m.tries.length >= MAXTRY) {
        const t = m.tries.length, l = m.listens;
        this.mmLeave();
        this.finish({ ok, s: ok ? mmScore(t, l) : 0, t, l });
      } else this.render();
      return { ok, pegs, total };
    },
    // leaving the Mastermind: the player's own sound comes back
    mmLeave() {
      const m = this.mm; if (!m) return;
      this.mm = null;
      AMB.store.setMany(m.orig, 'game');
    },

    // ---- links ----
    url(c, me) { return D().link.url('df', this.payload(c, me)); },
    fromHash(hash = location.hash) {
      const L = D().link, raw = L.raw('df', hash);
      if (raw == null) return false;
      const c = this.parse(L.decode(raw));
      if (!c) { L.clear(); if (AMB.ui) AMB.ui.toast('Lien de défi illisible (abîmé ou modifié)'); return true; }
      D().offerPath(`${c.n} te défie : ${this.title(c)}, son score ${D().fmt(c.s)}.`, () => {
        L.clear();
        this.incoming = c; this.result = null;
        this.view = 'take';
        const U = AMB.arcadeUI; if (U.dlg.hidden) U.open();
        if (!AMB.arcade.round) this.show();
      });
      return true;
    },

    // ---------- interface ----------
    show() { const U = AMB.arcadeUI; this.render(); U.show('duel'); const b = $('[data-du-go]', this.sec) || $('.arc-duel button', U.dlg); if (b) b.focus(); },
    setup() {
      const U = AMB.arcadeUI;
      if (!U || !U.dlg || this.sec || !D() || !D().bar) return;
      this.afterFn = (d) => this.roundEnd(d);
      this.sec = document.createElement('section');
      this.sec.className = 'arc-duel arc-dj'; this.sec.hidden = true;
      $('.arc-cab', U.dlg).append(this.sec);
      const b = document.createElement('button');
      b.className = 'arc-dj-open'; b.dataset.du = 'open';
      b.innerHTML = '<b>⚔ DÉFIE TON COUSIN</b><small>fixe une cible, réussis-la, envoie le lien</small>';
      D().bar.append(b);
      b.addEventListener('click', () => { this.view = 'make'; this.result = null; this.show(); });
      this.sec.addEventListener('click', (e) => this.onClick(e));
      this.sec.addEventListener('input', (e) => { const k = e.target.dataset.mm; if (k) this.mmSet(k, e.target.value); });
      this.sec.addEventListener('change', (e) => {
        if (e.target.matches('.arc-dj-name')) D().setName(e.target.value);
        if (e.target.matches('.arc-du-theme')) { this.draft = { k: 'm', th: e.target.value, sd: this.newSeed() }; this.render(); }
      });
      if (AMB.bus) {
        AMB.bus.on('arcade:screen', (name) => { if (name !== 'duel') this.mmLeave(); if (name === 'menu' && U.after === this.afterFn) U.after = null; });
        AMB.bus.on('game:mode', () => this.mmLeave());
      }
      window.addEventListener('pagehide', () => this.mmLeave());
      window.addEventListener('hashchange', () => this.fromHash());
      setTimeout(() => this.fromHash(), 0);
    },
    onClick(e) {
      const b = e.target.closest('[data-du]'); if (!b) return;
      const a = b.dataset.du, dr = this.draft;
      if (a === 'menu') AMB.arcadeUI.menu();
      else if (a === 'kind') { this.kind = b.dataset.k; this.draft = null; this.view = 'make'; this.render(); }
      else if (a === 'lvl') { this.draft = { k: 'r', d: +b.dataset.d, sd: this.newSeed() }; this.render(); }
      else if (a === 'reroll' && dr) { dr.sd = this.newSeed(); this.render(); }
      else if (a === 'try' && dr) this.play({ ...dr }, 'me');
      else if (a === 'retry' && this.result) this.play(this.result.c, 'me');
      else if (a === 'take' && this.incoming) this.play(this.incoming, 'them');
      else if (a === 'make') { this.view = 'make'; this.result = null; this.render(); }
      else if (a === 'target') this.mmListen('target');
      else if (a === 'mine') this.mmListen('mine');
      else if (a === 'validate') this.mmValidate();
      else if (a === 'quit') { const m = this.mm; this.mmLeave(); this.view = m && this.cur && this.cur.who === 'them' ? 'take' : 'make'; this.render(); }
      else if (a === 'share') this.share(b);
    },
    async share(btn) {
      const inp = $('.arc-dj-name', this.sec); if (inp) D().setName(inp.value);
      const r = this.result; if (!r || !r.me || !r.me.ok) return;
      const c = r.c, url = this.url(c, r.me);
      const text = r.c === this.incoming || this.cur && this.cur.who === 'them'
        ? `J'ai relevé ton défi (${this.title(c)}) : ${D().fmt(r.me.s)} ! À toi : ${url}`
        : `Je te défie : ${this.title(c)}, mon score ${D().fmt(r.me.s)}. Bats-le : ${url}`;
      const out = $('.arc-dj-link', this.sec); if (out) { out.hidden = false; out.value = text; }
      const okc = await D().copy(text);
      btn.textContent = okc ? '✓ Lien copié' : '↓ Lien ci-dessous';
    },
    shareHtml(label) {
      const esc = D().esc;
      return `<div class="arc-dj-share"><label>Ton prénom <input class="arc-dj-name" maxlength="16" placeholder="ex. Léo" value="${esc(D().s.name)}"></label>
        <button class="btn" data-du="share" data-du-go>🔗 ${label}</button><textarea class="arc-dj-link" rows="3" readonly hidden aria-label="Lien à envoyer"></textarea></div>`;
    },
    vs(c, me) {
      const Dd = D(), f = Dd.fmt, esc = Dd.esc, them = { n: c.n, s: c.s, r: Dd.rel(c.s, c.p), p: c.p };
      const win = me.r > them.r ? 'Tu gagnes !' : me.r < them.r ? `${esc(c.n)} gagne.` : 'Égalité !';
      return `<p class="arc-dj-big">${win}</p><table class="arc-dj-board"><thead><tr><th>Joueur</th><th>Niveau</th><th>Score</th><th>Relatif</th></tr></thead><tbody>
        <tr class="${me.r >= them.r ? 'me' : ''}"><td>Toi</td><td>${esc(Dd.lvlLabel(me.p))}</td><td>${f(me.s)}</td><td><b>${f(me.r)}</b></td></tr>
        <tr class="${them.r > me.r ? 'hi' : ''}"><td>${esc(c.n)}</td><td>${esc(Dd.lvlLabel(them.p))}</td><td>${f(them.s)}</td><td><b>${f(them.r)}</b></td></tr></tbody></table>`;
    },
    render() {
      if (!this.sec) return;
      const Dd = D(), esc = Dd.esc, f = Dd.fmt, P = AMB.puzzles;
      let body = '', title = 'DÉFIE TON COUSIN';
      if (this.view === 'mm' && this.mm) {
        const m = this.mm, c = m.c, def = P.byId[c.th];
        const missing = def.need.filter((n) => !AMB.game.has(n));
        title = 'ÉNIGME DE DUEL';
        body = `<p class="arc-dj-line"><b>${esc(def.title)}</b> · retrouve le son cible · ${MAXTRY - m.tries.length} validation${MAXTRY - m.tries.length > 1 ? 's' : ''} · écoutes ${m.listens}</p>
          ${missing.length ? '<p class="arc-dj-note">Une partie de ce son est encore fermée dans ton arbre : tu ne l\'entends peut-être pas en entier.</p>' : ''}
          <div class="arc-dj-btns"><button class="btn" data-du="target">▶ Écouter la cible</button><button class="btn arc-mm-side" data-du="mine">${m.side === 'target' ? '◀ revenir à ton son' : '◀ ton son'}</button></div>
          <div class="arc-mm-keys">${m.keys.map((k) => {
            const sp = AMB.store.spec(k), v = m.mine[k];
            const ctl = sp.type === 'select' ? `<select data-mm="${esc(k)}">${sp.options.map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`
              : sp.type === 'toggle' ? `<select data-mm="${esc(k)}"><option value="true"${v ? ' selected' : ''}>oui</option><option value="false"${v ? '' : ' selected'}>non</option></select>`
                : `<input type="range" data-mm="${esc(k)}" min="${sp.min}" max="${sp.max}" step="${sp.step || (sp.max - sp.min) / 100}" value="${v}">`;
            return `<label class="arc-mm-key"><span>${esc(this.label(k))}</span>${ctl}</label>`;
          }).join('')}</div>
          <div class="arc-mm-rows">${m.tries.map((t, i) => `<div class="arc-mm-row"><b>${i + 1}</b>${t.pegs.map((g, j) => `<span class="arc-mm-peg ${g.state}" title="${esc(this.label(m.keys[j]))}">${PEG[g.state]}${g.dir ? DIR[g.dir] : ''}</span>`).join('')}</div>`).join('')}</div>
          <div class="arc-dj-btns"><button class="btn arc-dj-main" data-du="validate" data-du-go>Valider (${m.tries.length + 1}/${MAXTRY})</button><button class="btn" data-du="quit">Abandonner</button></div>`;
      } else if (this.view === 'made' && this.result) {
        const r = this.result;
        body = r.me.ok
          ? `<p class="arc-dj-tag">DÉFI RÉUSSI</p><p class="arc-dj-big">${f(r.me.s)}</p><p class="arc-dj-line">${esc(this.title(r.c))} · relatif ${f(r.me.r)}</p>${this.shareHtml('Envoyer le défi')}
            <div class="arc-dj-btns"><button class="btn" data-du="make">Autre défi</button><button class="btn" data-du="menu">Menu</button></div>`
          : `<p class="arc-dj-tag">PAS ENCORE</p><p class="arc-dj-line">Réussis ton propre défi avant de pouvoir l'envoyer.</p>
            <div class="arc-dj-btns"><button class="btn arc-dj-main" data-du="retry" data-du-go>↻ Réessayer</button><button class="btn" data-du="make">Autre défi</button></div>`;
      } else if (this.view === 'taken' && this.result) {
        const r = this.result, c = r.c;
        body = `${r.first ? '' : `<p class="arc-dj-note">Seul ton premier essai compte (celui-ci : ${f(r.tried.s)}).</p>`}${this.vs(c, r.me)}
          ${r.me.ok ? this.shareHtml(`Renvoyer ta réponse à ${esc(c.n)}`) : ''}
          <div class="arc-dj-btns"><button class="btn" data-du="take">↻ Rejouer</button><button class="btn" data-du="menu">Menu</button></div>`;
      } else if (this.view === 'take' && this.incoming) {
        const c = this.incoming, mine = this.s.mine[this.ckey(c)];
        title = `DÉFI DE ${c.n.toUpperCase()}`;
        if (mine) { this.result = { c, me: mine, first: true }; }
        body = `<p class="arc-dj-line"><b>${esc(c.n)}</b> (${esc(Dd.lvlLabel(c.p))}) te défie : ${esc(this.title(c))}</p>
          <p class="arc-dj-line">Son score : <b>${f(c.s)}</b> · relatif ${f(Dd.rel(c.s, c.p))}${c.k === 'm' ? ` · ${c.t} validation${c.t > 1 ? 's' : ''}, ${c.l} écoute${c.l > 1 ? 's' : ''}` : ''}</p>
          ${mine ? this.vs(c, mine) : `<p class="arc-dj-line arc-dj-small">${c.k === 'r' ? 'Écoute le motif d\'une mesure, puis rejoue-le en rythme (clavier A–L, MIDI ou pads).' : 'Retrouve le son cible : chaque validation te dit, réglage par réglage, si tu es juste, proche ou loin.'} Ton premier essai compte.</p>`}
          <div class="arc-dj-btns"><button class="btn arc-dj-main" data-du="take" data-du-go>${mine ? '↻ Rejouer (ne compte plus)' : '⚔ Relever le défi'}</button><button class="btn" data-du="menu">Menu</button></div>
          ${mine && mine.ok ? this.shareHtml(`Renvoyer ta réponse à ${esc(c.n)}`) : ''}`;
      } else {
        const themes = this.themes(), dr = this.draft && this.draft.k === this.kind ? this.draft : null;
        let inner = '';
        if (this.kind === 'r') {
          inner = `<p class="arc-dj-line">Un motif d'une mesure à rejouer en rythme. Choisis le niveau :</p>
            <div class="arc-dj-btns">${LVL.map((L) => `<button class="btn${dr && dr.d === L.d ? ' on' : ''}" data-du="lvl" data-d="${L.d}">${L.label}</button>`).join('')}</div>`;
          if (dr) inner += `<p class="arc-dj-line arc-dj-small">Motif n° ${dr.sd.toString(36).toUpperCase()} · ${this.lvlName(dr.d)}</p>`;
        } else if (!themes.length) {
          inner = '<p class="arc-dj-line">Débloque d\'abord le Pad dans l\'arbre : les énigmes de duel se jouent sur ses réglages.</p>';
        } else {
          const th = dr ? dr.th : '';
          inner = `<p class="arc-dj-line">Un son à retrouver, réglage par réglage. Choisis les réglages en jeu :</p>
            <label class="arc-mm-key"><span>Énigme</span><select class="arc-du-theme"><option value="">—</option>${themes.map((t) => `<option value="${esc(t.id)}"${t.id === th ? ' selected' : ''}>${esc(t.title)} (${this.keysOf(t.id).length} réglages)</option>`).join('')}</select></label>`;
          if (dr) inner += `<p class="arc-dj-line arc-dj-small">Cible n° ${dr.sd.toString(36).toUpperCase()} : ${this.keysOf(dr.th).map((k) => esc(this.label(k))).join(', ')}</p>`;
        }
        body = `<div class="arc-dj-btns arc-du-kinds"><button class="btn${this.kind === 'r' ? ' on' : ''}" data-du="kind" data-k="r">Réponds en jouant</button><button class="btn${this.kind === 'm' ? ' on' : ''}" data-du="kind" data-k="m">Énigme Mastermind</button></div>
          ${inner}
          ${dr ? `<div class="arc-dj-btns"><button class="btn arc-dj-main" data-du="try" data-du-go>▶ Réussir mon défi</button><button class="btn" data-du="reroll">🎲 Autre ${this.kind === 'r' ? 'motif' : 'cible'}</button></div>` : ''}
          <p class="arc-dj-line arc-dj-small">Il faut réussir ton défi avant de l'envoyer. Ton cousin reçoit un lien ; le score compare vos niveaux (musicien ×1, découverte ×1,35).</p>
          <div class="arc-dj-btns"><button class="btn" data-du="menu">◂ Menu</button></div>`;
      }
      this.sec.innerHTML = `<h3 class="arc-title">${esc(title)}</h3>${body}`;
    },
  };

  AMB.duel = duel.load();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => duel.setup()); else duel.setup();
})();
