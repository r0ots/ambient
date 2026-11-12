// Défi du jour (G10.2) + classement du jour (G10.5) + what the cousin links share (codec, level, offer).
// No server: everything travels in the URL hash, like the patch links of js/ui.js (#p=…).
//   #dj=<base64url(JSON)>~<checksum>   a daily score   {v, day, n (name), s (score), p (m|n|k level), z (zen 0|1), r (relative)}
// The checksum (FNV-1a over a salt + the payload) only stops naive cheating (editing the score by hand);
// a malformed or forged link is ignored with a short message, never an exception.
// The daily challenge: the local date gives the seed → the same 3 mini-games and the same seeds for everybody that day,
// 3 × 30 s (or « zen »: 3 × 5 challenges, no clock). Starting level by player level (profile), staircase inside the round,
// ghost rounds (the player's arcade levels and records are untouched). The first run of the day is the official one
// (leaving it keeps the score reached so far); the next ones are practice.
// Relative score = score × coefficient of the player's level (AMB.game profile: musicien ×1, découverte ×1.35;
// profile not chosen yet (game.s.profile null) → neutral « standard » ×1.15). Path only: nothing of this shows in free mode; a link opened in free
// mode offers to switch to the path (nothing is stored before that).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const q = new URLSearchParams(location.search);
  const KEY = window.AMB_DAILY_KEY || q.get('dailykey') || 'ambient.daily.v1';
  const SALT = 'jardin-sonore|cousins|v1';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => Math.round(+n || 0).toLocaleString('fr-FR').replace(/\s/g, ' ');

  // ---------- link codec (shared with js/duel.js) ----------
  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  const sign = (b) => fnv(SALT + '|' + b).toString(36);
  const b64e = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
  const link = {
    sign, fnv,
    encode(obj) { const b = b64e(JSON.stringify(obj)); return b + '~' + sign(b); },
    // → the object, or null (bad shape, bad checksum, bad JSON): never throws
    decode(str) {
      try {
        const m = /^([A-Za-z0-9_-]{2,2000})~([0-9a-z]{1,8})$/.exec(String(str || ''));
        if (!m || sign(m[1]) !== m[2]) return null;
        const o = JSON.parse(b64d(m[1]));
        return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
      } catch (e) { return null; }
    },
    url(param, obj) { return location.href.split('#')[0] + '#' + param + '=' + this.encode(obj); },
    // the raw value of #param=… in the hash (null if absent)
    raw(param, hash = location.hash) { const m = new RegExp('[#&]' + param + '=([^&]*)').exec(String(hash || '')); return m ? m[1] : null; },
    clear() { try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) {} },
  };
  // a name typed by a player: short, printable
  const cleanName = (n) => String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);

  // ---------- player level (AMB.game.profile() comes from the placement test; neutral fallback) ----------
  const LEVELS = {
    m: { label: 'musicien', coef: 1, d: 0.45 },
    n: { label: 'standard', coef: 1.15, d: 0.25 },
    k: { label: 'découverte', coef: 1.35, d: 0.1 },
  };
  function level() {
    let p = null;
    // the raw choice (game.s.profile: null until the player picks one, js/game.js) — game.profile() answers 'musicien'
    // by default, which would hide « not chosen yet » → neutral level
    try { const g = AMB.game; p = g && g.s && 'profile' in g.s ? g.s.profile : g && typeof g.profile === 'function' ? g.profile() : null; } catch (e) { p = null; }
    if (p && typeof p === 'object') p = p.id || p.kind || p.name || p.profile || null;
    p = String(p || '').toLowerCase();
    if (/music|expert/.test(p)) return 'm';
    if (/d[ée]couv|kid|enfant|debut|début|novice/.test(p)) return 'k';
    return 'n';
  }
  const rel = (raw, p) => Math.round((Math.max(0, +raw || 0)) * (LEVELS[p] || LEVELS.n).coef);
  const lvlLabel = (p) => (LEVELS[p] ? LEVELS[p].label : '—');

  // ---------- free mode: a game link proposes the path, nothing else ----------
  function offerPath(text, fn) {
    const g = AMB.game;
    if (!g) return;
    if (g.path) { fn(); return; }
    if (g.s.mode === null && AMB.bus) { // the welcome question is on screen: wait for the answer
      const off = () => { const L = AMB.bus.fns && AMB.bus.fns['game:mode']; if (L) { const i = L.indexOf(h); if (i >= 0) L.splice(i, 1); } };
      const h = () => { off(); if (g.path) fn(); else showOffer(text, fn); };
      AMB.bus.on('game:mode', h);
      return;
    }
    showOffer(text, fn);
  }
  function showOffer(text, fn) {
    let d = $('#cousinDlg');
    if (!d) {
      d = document.createElement('div');
      d.id = 'cousinDlg'; d.className = 'modal cousin-dlg'; d.hidden = true;
      d.innerHTML = `<div class="modal-card welcome-card" role="dialog" aria-label="Défi reçu"><h3>⚔ Défi reçu</h3><p class="cz-text"></p>
        <p class="muted">Les défis se jouent dans le Parcours. Ton mode libre reste intact : tu peux y revenir à tout moment (menu ⋯).</p>
        <div class="end-btns"><button class="btn primary" data-cz="path">🌱 Passer en Parcours</button><button class="btn" data-cz="no">Plus tard</button></div></div>`;
      document.body.append(d);
    }
    $('.cz-text', d).textContent = text;
    d.hidden = false;
    d.onclick = (e) => {
      const b = e.target.closest('[data-cz]');
      if (!b && e.target !== d) return;
      d.hidden = true; link.clear();
      if (b && b.dataset.cz === 'path') {
        if (AMB.garden && AMB.garden.choose) AMB.garden.choose('path'); else AMB.game.setMode('path');
        fn();
      }
    };
    const y = $('[data-cz="path"]', d); if (y) y.focus();
  }
  function toast(m) { if (AMB.ui && AMB.ui.toast) AMB.ui.toast(m); }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  }

  // ---------- the day ----------
  const pad2 = (n) => String(n).padStart(2, '0');
  const dayKey = (t = new Date()) => `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  const dayLabel = (day) => { const m = /^\d{4}-(\d\d)-(\d\d)$/.exec(day || ''); return m ? `${m[2]}/${m[1]}` : '?'; };
  const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

  const fresh = () => ({ v: 1, name: '', days: {}, board: {} });

  const daily = {
    key: KEY, LEVELS, link, level, rel, lvlLabel, offerPath, esc, fmt, cleanName, copy, dayKey, dayLabel,
    POOL: ['intrus', 'bouge', 'reponds', 'modes', 'accordeur', 'dictee'], GAMES: 3, ROUND_MS: 30000, ZEN_COUNT: 5, MAX_SCORE: 1e6,
    s: fresh(),
    run: null, // the run in progress {day, zen, plan, i, parts, official}
    view: 'home', note: '', hi: null,
    now: () => new Date(),

    load() {
      try { const o = JSON.parse(localStorage.getItem(this.key)); if (o && o.v === 1) this.s = { ...fresh(), ...o }; } catch (e) {}
      return this;
    },
    save() { try { localStorage.setItem(this.key, JSON.stringify(this.s)); } catch (e) {} },
    today() { return dayKey(this.now()); },
    seedOf(str) { return fnv('day|' + str); },

    // same day → same 3 games, same seeds, for everybody (only the registered mini-games of the pool)
    plan(day = this.today()) {
      const A = AMB.arcade, Au = AMB.audition;
      const pool = this.POOL.filter((id) => A && A.byId[id]);
      if (!pool.length || !Au) return [];
      const rng = Au.rng(this.seedOf(day)), left = pool.slice(), out = [];
      while (out.length < Math.min(this.GAMES, pool.length)) {
        const id = left.splice(rng.int(left.length), 1)[0];
        out.push({ id, seed: Math.floor(rng() * 4294967296) >>> 0 });
      }
      return out;
    },
    dayState(day = this.today()) { return (this.s.days[day] = this.s.days[day] || {}); },
    official(zen, day = this.today()) { const D = this.s.days[day]; return (D && D[zen ? 'z' : 'c']) || null; },

    // ---- a run: the 3 rounds one after the other (js/arcade-ui.js plays them; ui.after brings us back) ----
    start(zen) {
      const U = AMB.arcadeUI, plan = this.plan();
      if (!U || !plan.length || !(AMB.game && AMB.game.path)) return false;
      const day = this.today(), p = level();
      const official = !this.official(zen, day);
      this.run = { day, zen: !!zen, plan, i: 0, parts: [], official, p };
      if (official) { this.dayState(day)[zen ? 'z' : 'c'] = { s: 0, r: 0, p, partial: true, at: Date.now() }; this.prune(); this.save(); }
      this.playRound();
      return true;
    },
    playRound() {
      const r = this.run, U = AMB.arcadeUI; if (!r) return;
      const step = r.plan[r.i];
      U.after = this.afterFn;
      U.start(step.id, { seed: step.seed, d: LEVELS[r.p].d, ghost: true, pacts: [], duration: r.zen ? Infinity : this.ROUND_MS, count: r.zen ? this.ZEN_COUNT : 0 })
        .then(() => { const t = U.el('.arc-game'); if (t && this.run === r && AMB.arcade.round) t.textContent = `DÉFI ${r.i + 1}/${r.plan.length} · ${AMB.arcade.byId[step.id].title}`; });
    },
    roundEnd(d) {
      const r = this.run; if (!r) return false;
      r.parts.push({ id: d.id, score: d.score, good: d.good, total: d.total });
      r.i++;
      const total = r.parts.reduce((a, x) => a + x.score, 0);
      if (r.official) {
        const o = this.dayState(r.day)[r.zen ? 'z' : 'c'] = { s: total, r: rel(total, r.p), p: r.p, partial: r.i < r.plan.length, at: Date.now() };
        if (!o.partial) this.addEntry(r.day, { n: this.s.name || 'Moi', s: total, p: r.p, z: r.zen ? 1 : 0, me: 1 });
        this.save();
      }
      this.view = r.i < r.plan.length ? 'between' : 'result';
      if (this.view === 'result') { this.last = { ...r, total }; this.run = null; if (AMB.arcadeUI.after === this.afterFn) AMB.arcadeUI.after = null; }
      this.show();
      return true;
    },
    drop() {
      if (!this.run) return;
      const r = this.run; this.run = null;
      if (AMB.arcadeUI && AMB.arcadeUI.after === this.afterFn) AMB.arcadeUI.after = null;
      // the official run left on the way keeps the score reached so far
      if (r.official) {
        const o = this.official(r.zen, r.day);
        if (o && o.partial) { o.partial = false; o.left = 1; this.addEntry(r.day, { n: this.s.name || 'Moi', s: o.s, p: r.p, z: r.zen ? 1 : 0, me: 1 }); this.save(); }
      }
    },

    // ---- leaderboard (G10.5): one entry per name and mode, the best kept ----
    addEntry(day, e) {
      if (!DAY_RE.test(day)) return null;
      const B = (this.s.board[day] = this.s.board[day] || []);
      const n = cleanName(e.n) || '?', z = e.z ? 1 : 0, p = LEVELS[e.p] ? e.p : 'n', s = Math.max(0, Math.min(this.MAX_SCORE, Math.round(+e.s || 0)));
      const ent = { n, s, r: rel(s, p), p, z, at: Date.now(), ...(e.me ? { me: 1 } : {}) };
      const i = B.findIndex((x) => x.z === z && (e.me ? x.me : !x.me && x.n.toLowerCase() === n.toLowerCase()));
      if (i >= 0) { if (B[i].r > ent.r && !e.me) return B[i]; B[i] = ent; } else B.push(ent);
      if (B.length > 40) B.splice(0, B.length - 40);
      this.prune(); this.save();
      return ent;
    },
    board(day = this.today(), zen = false) {
      return (this.s.board[day] || []).filter((x) => !!x.z === !!zen).slice().sort((a, b) => b.r - a.r || b.s - a.s);
    },
    prune() {
      const keep = (o) => Object.keys(o).sort().slice(-14);
      for (const k of ['board', 'days']) { const ks = keep(this.s[k]); for (const d of Object.keys(this.s[k])) if (!ks.includes(d)) delete this.s[k][d]; }
    },
    // one short line for the « depuis ta dernière visite » box (js/save.js); '' in free mode (no trace)
    backLine() {
      try {
        if (!(AMB.game && AMB.game.path) || !this.plan().length) return '';
        const day = this.today(), o = this.official(false), B = this.board(day), others = B.filter((x) => !x.me).length;
        if (!o) return `★ Défi du jour ${dayLabel(day)} : pas encore joué${others ? ` · ${others} score${others > 1 ? 's' : ''} de cousins à battre` : ''}`;
        const rank = B.findIndex((x) => x.me) + 1;
        return `★ Défi du jour ${dayLabel(day)} : ${fmt(o.s)}${rank && B.length > 1 ? ` · ${rank}${rank === 1 ? 'er' : 'e'} sur ${B.length}` : ''}`;
      } catch (e) { return ''; }
    },
    setName(n) { this.s.name = cleanName(n); for (const B of Object.values(this.s.board)) B.forEach((x) => { if (x.me) x.n = this.s.name || 'Moi'; }); this.save(); },

    // ---- score links ----
    payload(zen, day = this.today()) {
      const o = this.official(zen, day); if (!o || o.partial) return null;
      return { v: 1, day, n: this.s.name || 'Moi', s: o.s, p: o.p, z: zen ? 1 : 0, r: o.r };
    },
    shareText(pl) { return `J'ai fait ${fmt(pl.s)} au défi du ${dayLabel(pl.day)}${pl.z ? ' (zen)' : ''} 🎧`; },
    shareUrl(pl) { return link.url('dj', pl); },
    // a received payload → a clean entry, or null (forged, malformed, out of range)
    parse(o) {
      if (!o || o.v !== 1 || typeof o.day !== 'string' || !DAY_RE.test(o.day)) return null;
      const n = cleanName(o.n), s = o.s, p = o.p;
      if (!n || !Number.isInteger(s) || s < 0 || s > this.MAX_SCORE || !LEVELS[p] || (o.z !== 0 && o.z !== 1) || o.r !== rel(s, p)) return null;
      return { day: o.day, n, s, p, z: o.z, r: o.r };
    },
    // #dj=… : adds the score to the local leaderboard (path only), shows the board
    fromHash(hash = location.hash) {
      const raw = link.raw('dj', hash);
      if (raw == null) return false;
      const e = this.parse(link.decode(raw));
      if (!e) { link.clear(); toast('Lien de score illisible (abîmé ou modifié)'); return true; }
      offerPath(`${e.n} te montre son score au défi du ${dayLabel(e.day)} : ${fmt(e.s)}.`, () => {
        link.clear();
        this.addEntry(e.day, e);
        this.hi = e.n.toLowerCase();
        this.note = e.day === this.today() ? `Score de ${e.n} ajouté au classement du jour.` : `Score de ${e.n} ajouté (défi du ${dayLabel(e.day)}, pas celui d'aujourd'hui).`;
        this.view = this.run ? this.view : 'home';
        this.openScreen();
      });
      return true;
    },

    // ---------- interface (a section of the arcade cabinet) ----------
    openScreen() {
      const U = AMB.arcadeUI; if (!U || !U.dlg) return;
      if (U.dlg.hidden) U.open();
      if (this.run) return; // a run is on: the board will show at the end
      if (this.view !== 'result') this.view = 'home';
      this.show();
    },
    show() { const U = AMB.arcadeUI; this.render(); U.show('daily'); const b = $('.arc-dj [data-dj-go]', U.dlg) || $('.arc-dj button', U.dlg); if (b) b.focus(); },
    setup() {
      const U = AMB.arcadeUI;
      if (!U || !U.dlg || this.sec) return;
      this.afterFn = (d) => this.roundEnd(d);
      const cab = $('.arc-cab', U.dlg);
      this.sec = document.createElement('section');
      this.sec.className = 'arc-daily arc-dj'; this.sec.hidden = true;
      cab.append(this.sec);
      // the banner of the menu (path only): daily challenge + the cousin's duel (js/duel.js adds its button)
      const bar = (this.bar = document.createElement('div'));
      bar.className = 'arc-dj-bar'; bar.hidden = true;
      bar.innerHTML = `<button class="arc-dj-open" data-dj="open"><b>★ DÉFI DU JOUR</b><span class="arc-dj-date"></span><small>même tirage pour tous · score à partager</small></button>`;
      const menu = $('.arc-menu', U.dlg), carts = $('.arc-carts', menu);
      menu.insertBefore(bar, carts);
      bar.addEventListener('click', (e) => { if (e.target.closest('[data-dj="open"]')) { this.view = 'home'; this.note = ''; this.show(); } });
      this.sec.addEventListener('click', (e) => this.onClick(e));
      this.sec.addEventListener('change', (e) => { if (e.target.matches('.arc-dj-name')) { this.setName(e.target.value); this.render(); } });
      const B = AMB.bus;
      if (B) {
        B.on('arcade:screen', (name) => { if (name === 'menu' || name === 'closed') { this.drop(); this.renderBar(); } });
        B.on('arcade:end', (d) => { if (d.abort && this.run && !AMB.arcade.round) this.drop(); });
        B.on('game:mode', () => this.renderBar());
      }
      this.renderBar();
      window.addEventListener('hashchange', () => this.fromHash());
      setTimeout(() => this.fromHash(), 0);
    },
    renderBar() {
      if (!this.bar) return;
      this.bar.hidden = !(AMB.game && AMB.game.path) || !this.plan().length;
      const dt = $('.arc-dj-date', this.bar); if (dt) dt.textContent = dayLabel(this.today());
    },
    onClick(e) {
      const b = e.target.closest('[data-dj]'); if (!b) return;
      const a = b.dataset.dj;
      if (a === 'menu') AMB.arcadeUI.menu();
      else if (a === 'go') this.start(false);
      else if (a === 'zen') this.start(true);
      else if (a === 'next') this.playRound();
      else if (a === 'home') { this.view = 'home'; this.note = ''; this.show(); }
      else if (a === 'share') this.share(b.dataset.z === '1', b);
    },
    async share(zen, btn) {
      const inp = $('.arc-dj-name', this.sec); if (inp && inp.value !== this.s.name) this.setName(inp.value);
      const pl = this.payload(zen); if (!pl) return;
      const text = this.shareText(pl) + ' ' + this.shareUrl(pl);
      const out = $('.arc-dj-link', this.sec); if (out) { out.hidden = false; out.value = text; out.select && out.select(); }
      const okc = await copy(text);
      if (btn) btn.textContent = okc ? '✓ Lien copié' : '↓ Lien ci-dessous';
    },
    boardHtml(day, zen) {
      const B = this.board(day, zen);
      if (!B.length) return '';
      return `<table class="arc-dj-board"><caption>${zen ? 'Classement zen' : 'Classement du jour'}</caption>
        <thead><tr><th>#</th><th>Joueur</th><th>Niveau</th><th>Score</th><th title="Score × coefficient du niveau : musicien ×1, découverte ×1,35">Relatif</th></tr></thead><tbody>${
        B.map((x, i) => `<tr class="${x.me ? 'me' : ''}${this.hi && !x.me && x.n.toLowerCase() === this.hi ? ' hi' : ''}"><td>${i + 1}</td><td>${esc(x.n)}${x.me ? ' <i>(toi)</i>' : ''}</td><td>${esc(lvlLabel(x.p))}</td><td>${fmt(x.s)}</td><td><b>${fmt(x.r)}</b></td></tr>`).join('')}</tbody></table>`;
    },
    shareHtml(zen) {
      const pl = this.payload(zen); if (!pl) return '';
      return `<div class="arc-dj-share"><label>Ton prénom <input class="arc-dj-name" maxlength="16" placeholder="ex. Léo" value="${esc(this.s.name)}"></label>
        <button class="btn" data-dj="share" data-z="${zen ? 1 : 0}">🔗 Partager mon score</button>
        <textarea class="arc-dj-link" rows="2" readonly hidden aria-label="Lien à envoyer"></textarea></div>`;
    },
    render() {
      if (!this.sec) return;
      const day = this.today(), plan = this.plan(), A = AMB.arcade, p = level();
      const names = plan.map((x) => esc(A.byId[x.id].title)).join(' · ');
      let body = '';
      if (this.view === 'between' && this.run) {
        const r = this.run, last = r.parts[r.parts.length - 1], tot = r.parts.reduce((a, x) => a + x.score, 0), nx = r.plan[r.i];
        body = `<p class="arc-dj-big">${fmt(last.score)}</p><p class="arc-dj-line">Manche ${r.i}/${r.plan.length} · ${esc(A.byId[last.id].title)} · ${last.good}/${last.total} justes</p>
          <p class="arc-dj-line">Total : <b>${fmt(tot)}</b></p>
          <div class="arc-dj-btns"><button class="btn arc-dj-main" data-dj="next" data-dj-go>▶ Manche ${r.i + 1} : ${esc(A.byId[nx.id].title)}</button></div>`;
      } else if (this.view === 'result' && this.last) {
        const r = this.last;
        body = `<p class="arc-dj-tag">${r.official ? (r.zen ? 'ZEN · SCORE DU JOUR' : 'SCORE DU JOUR') : 'ENTRAÎNEMENT'}</p><p class="arc-dj-big">${fmt(r.total)}</p>
          <p class="arc-dj-line">${r.parts.map((x) => `${esc(A.byId[x.id].title)} ${fmt(x.score)}`).join(' · ')}</p>
          <p class="arc-dj-line">Relatif (${esc(lvlLabel(r.p))}) : <b>${fmt(rel(r.total, r.p))}</b>${r.official ? '' : ' · ne compte pas (ton score du jour est déjà fait)'}</p>
          ${this.shareHtml(r.zen)}${this.boardHtml(day, r.zen)}
          <div class="arc-dj-btns"><button class="btn" data-dj="home" data-dj-go>◂ Défi du jour</button><button class="btn" data-dj="menu">Menu</button></div>`;
      } else {
        const oc = this.official(false), oz = this.official(true);
        const mine = (o, zen) => o ? `<p class="arc-dj-line">${zen ? 'Zen' : 'Ton score du jour'} : <b>${fmt(o.s)}</b> (relatif ${fmt(o.r)})${o.left ? ' · manche quittée' : ''}</p>` : '';
        body = `${this.note ? `<p class="arc-dj-note" role="status">${esc(this.note)}</p>` : ''}
          <p class="arc-dj-line">${names}</p>
          <p class="arc-dj-line arc-dj-small">Ton niveau : ${esc(lvlLabel(p))} · départ NIV ${Math.round(LEVELS[p].d * 100)}% · le 1er essai compte, les suivants sont de l'entraînement</p>
          ${mine(oc)}${mine(oz, true)}
          <div class="arc-dj-btns"><button class="btn arc-dj-main" data-dj="go" data-dj-go>▶ ${oc ? 'Rejouer (entraînement)' : `Jouer · ${plan.length} × ${this.ROUND_MS / 1000} s`}</button>
          <button class="btn" data-dj="zen">◌ Zen · sans chrono${oz ? ' (entraînement)' : ''}</button></div>
          ${oc ? this.shareHtml(false) : ''}${this.boardHtml(day, false)}${oz ? this.shareHtml(true) : ''}${this.boardHtml(day, true)}
          <div class="arc-dj-btns"><button class="btn" data-dj="menu">◂ Menu</button></div>`;
      }
      this.sec.innerHTML = `<h3 class="arc-title">DÉFI DU JOUR</h3><p class="arc-sub">${dayLabel(day)} · même tirage pour tous aujourd'hui</p>${body}`;
    },
  };

  AMB.daily = daily.load();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => daily.setup()); else daily.setup();
})();
