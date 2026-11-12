// « Jardin sonore » G10.4 : exportable save (file + link, import with strict validation) and
// « depuis ta dernière visite » (a sober reminder card — never any gain collected while away).
// A save = the path's state (AMB.game.s, secrets included: game.s.secrets; player profile, nodes opened by the
// placement test) + the arcade's (AMB.arcade.s: levels, records per profile and Pacts, the pacts ticked per mini-game)
// + the daily challenge's (AMB.daily.s: name, the day's tries, leaderboard; optional, an older save keeps the current one).
// Not saved: latency calibration (per device, js/latency.js), duel tries, settings, patches.
// Import never throws: validate() returns {ok, error, data}; unknown ids are refused, numbers are bounded,
// unknown extra fields (added by later versions) are kept only if small and plain.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const VERSION = 1, APP = 'jardin-sonore';
  const MAX_FILE = 2e6, MAX_LINK = 300000, ABSENCE = 3600e3;
  const VISIT_KEY = window.AMB_VISIT_KEY || new URLSearchParams(location.search).get('visitkey') || 'ambient.visit.v1';
  const ID = /^[A-Za-z0-9_.\-]{1,48}$/;

  class Bad extends Error {}
  const bad = (m) => { throw new Bad(m); };
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const int = (v, lo, hi, what) => { if (!Number.isInteger(v) || v < lo || v > hi) bad(what + ' invalide'); return v; };
  const num = (v, lo, hi, what) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) bad(what + ' invalide'); return v; };
  const bool = (v, what) => { if (typeof v !== 'boolean') bad(what + ' invalide'); return v; };
  const ids = (a, what, known, max = 600) => {
    if (!Array.isArray(a) || a.length > max) bad(what + ' invalide');
    const out = [];
    for (const x of a) {
      if (typeof x !== 'string' || !ID.test(x)) bad(what + ' invalide');
      if (known && !known(x)) bad(what + ' : « ' + x.slice(0, 20) + ' » inconnu');
      if (!out.includes(x)) out.push(x);
    }
    return out;
  };
  // fields we do not know about (a newer build) are kept when plain and small
  const extras = (src, dst, known) => {
    for (const k of Object.keys(src)) {
      if (known.includes(k) || !/^[a-z][A-Za-z0-9_]{0,23}$/.test(k)) continue;
      let j; try { j = JSON.stringify(src[k]); } catch (e) { continue; }
      if (j && j.length <= 20000) dst[k] = JSON.parse(j);
    }
  };

  // ---- validation ----
  const GAME_KEYS = ['v', 'mode', 'shards', 'earned', 'nodes', 'found', 'contracts', 'puzzles', 'stars', 'opened', 'runs', 'pzHelp', 'active', 'prog', 'skipped', 'ended', 'secrets', 'profile', 'placed', 'placement'];
  const gameState = (s) => {
    if (!isObj(s)) bad('progression absente');
    if (s.v !== 1) bad('version de progression inconnue');
    const T = AMB.tree, C = AMB.contracts, P = AMB.puzzles, X = AMB.secrets;
    const o = { v: 1 };
    if (s.mode !== null && s.mode !== 'path' && s.mode !== 'free') bad('mode invalide');
    o.mode = s.mode;
    o.shards = int(s.shards, 0, 1e7, '✧'); o.earned = int(s.earned, 0, 1e8, '✧ gagnés');
    if (o.shards > o.earned) bad('✧ incohérents');
    o.nodes = ids(s.nodes, 'nœuds', T && ((x) => !!T.byId[x]));
    o.found = ids(s.found, 'découvertes');
    o.contracts = ids(s.contracts, 'contrats', C && ((x) => !!C.byId[x]));
    o.puzzles = ids(s.puzzles, 'énigmes', P && ((x) => !!P.byId[x]));
    o.opened = ids(s.opened || [], 'énigmes ouvertes', P && ((x) => !!P.byId[x]));
    o.stars = {};
    if (!isObj(s.stars || {})) bad('étoiles invalides');
    for (const [k, v] of Object.entries(s.stars || {})) { if (!ID.test(k) || (P && !P.byId[k])) bad('étoiles invalides'); o.stars[k] = int(v, 0, 3, 'étoiles'); }
    o.runs = {}; // attempts in progress are not carried over
    o.pzHelp = s.pzHelp == null ? false : bool(s.pzHelp, 'aide');
    o.active = ids(s.active || [], 'contrats actifs', C && ((x) => !!C.byId[x]), 10);
    o.prog = {};
    if (!isObj(s.prog || {})) bad('progrès invalides');
    for (const [k, v] of Object.entries(s.prog || {})) {
      if (!ID.test(k) || (C && !C.byId[k]) || !isObj(v)) bad('progrès invalides');
      const p = {}; for (const [a, b] of Object.entries(v)) if (/^[A-Za-z_]{1,12}$/.test(a) && (typeof b === 'number' && Number.isFinite(b) || Array.isArray(b) && b.length < 40 && b.every((x) => typeof x === 'string' || typeof x === 'number'))) p[a] = b;
      o.prog[k] = p;
    }
    o.skipped = ids(s.skipped || [], 'contrats passés', C && ((x) => !!C.byId[x]));
    o.ended = s.ended == null ? false : bool(s.ended, 'fin');
    if (s.secrets != null) o.secrets = secretsState(s.secrets, X);
    // player profile and placement test (G8.4, js/game.js, js/placement.js)
    const PROF = (AMB.game && AMB.game.PROFILES) || ['musicien', 'decouverte'];
    if (s.profile != null) { if (!PROF.includes(s.profile)) bad('profil de joueur invalide'); o.profile = s.profile; } else o.profile = null;
    o.placed = ids(s.placed || [], 'nœuds du placement', T && ((x) => !!T.byId[x]));
    if (s.placement != null) {
      const pl = s.placement;
      if (!isObj(pl)) bad('test de placement invalide');
      o.placement = { at: num(pl.at, 0, 1e14, 'date du placement'), passed: ids(pl.passed || [], 'branches du placement', T && T.BRANCHES && ((x) => !!T.BRANCHES[x]), 10) };
    } else o.placement = null;
    extras(s, o, GAME_KEYS);
    return o;
  };
  const secretsState = (q, X) => {
    if (!isObj(q)) bad('secrets invalides');
    const o = { found: {}, secs: 0, mirrorOn: false, theme: '', gifts: { timbres: [], themes: [], mirror: false, pacts: [] } };
    if (q.found != null) {
      if (!isObj(q.found)) bad('secrets invalides');
      for (const [k, v] of Object.entries(q.found)) { if (!ID.test(k) || (X && !X.byId[k])) bad('secret inconnu'); o.found[k] = num(v, 0, 1e14, 'date de secret'); }
    }
    if (q.secs != null) o.secs = int(q.secs, 0, 1e9, 'temps de jeu');
    if (q.mirrorOn != null) o.mirrorOn = bool(q.mirrorOn, 'miroir');
    const g = q.gifts == null ? {} : q.gifts;
    if (!isObj(g)) bad('cadeaux invalides');
    if (g.mirror != null) o.gifts.mirror = bool(g.mirror, 'miroir');
    o.gifts.themes = ids(g.themes || [], 'thèmes', (x) => !X || !!X.THEMES[x], 10);
    o.gifts.pacts = ids(g.pacts || [], 'pactes', null, 20);
    if (!Array.isArray(g.timbres || []) || (g.timbres || []).length > 40) bad('timbres invalides');
    for (const t of g.timbres || []) {
      if (!isObj(t) || typeof t.sec !== 'string' || !ID.test(t.sec) || typeof t.opt !== 'string' || t.opt.length > 40) bad('timbres invalides');
      o.gifts.timbres.push({ sec: t.sec, opt: t.opt });
    }
    if (q.theme != null) { if (typeof q.theme !== 'string' || (q.theme && !o.gifts.themes.includes(q.theme))) bad('thème invalide'); o.theme = q.theme; }
    return o;
  };

  const STAT_KEYS = ['d', 'peak', 'step', 'plays', 'best', 'pacts'];
  const arcadeState = (a) => {
    if (!isObj(a)) bad('arcade absente');
    if (a.v !== 1) bad('version d\'arcade inconnue');
    const A = AMB.arcade, o = { v: 1, profile: 'default', profiles: {} };
    if (typeof a.profile !== 'string' || !a.profile || a.profile.length > 40) bad('profil invalide');
    o.profile = a.profile;
    if (!isObj(a.profiles) || Object.keys(a.profiles).length > 20) bad('profils invalides');
    for (const [name, P] of Object.entries(a.profiles)) {
      if (!name || name.length > 40 || !isObj(P) || !isObj(P.games)) bad('profil invalide');
      const po = { games: {} };
      for (const [id, st] of Object.entries(P.games)) {
        if (!ID.test(id) || (A && A.games.length && !A.byId[id]) || !isObj(st)) bad('mini-jeu inconnu');
        const so = {
          d: num(st.d, 0, 1, 'niveau'), peak: num(st.peak, 0, 1, 'sommet'), step: num(st.step, 0, 1, 'pas'),
          plays: int(st.plays, 0, 1e7, 'parties'), best: {},
        };
        if (!isObj(st.best) || Object.keys(st.best).length > 64) bad('records invalides');
        for (const [pk, r] of Object.entries(st.best)) {
          if (!/^[A-Za-z0-9_+\-]{0,80}$/.test(pk) || !isObj(r)) bad('records invalides');
          const ro = { score: int(r.score, 0, 1e9, 'score'), stars: int(r.stars, 0, 3, 'étoiles'), at: num(r.at, 0, 1e14, 'date') };
          extras(r, ro, ['score', 'stars', 'at']);
          so.best[pk] = ro;
        }
        // the pacts ticked on this cartridge (G9.8, js/pacts.js)
        if (st.pacts != null) so.pacts = ids(st.pacts, 'pactes', AMB.pacts && ((x) => !!AMB.pacts.byId[x]), 20);
        extras(st, so, STAT_KEYS);
        po.games[id] = so;
      }
      extras(P, po, ['games']);
      o.profiles[name] = po;
    }
    if (!o.profiles[o.profile] && Object.keys(o.profiles).length) bad('profil actif absent');
    extras(a, o, ['v', 'profile', 'profiles']);
    return o;
  };

  // the daily challenge (G10.2 / G10.5, js/daily.js): name, official tries per day, leaderboard per day
  const DAY = /^\d{4}-\d{2}-\d{2}$/, LVL = ['m', 'n', 'k'];
  const str = (v, max, what) => { if (typeof v !== 'string' || v.length > max || /[\u0000-\u001f<>]/.test(v)) bad(what + ' invalide'); return v; };
  const lvl = (v) => { if (!LVL.includes(v)) bad('niveau du défi invalide'); return v; };
  const dailyState = (d) => {
    if (!isObj(d) || d.v !== 1) bad('défi du jour invalide');
    const o = { v: 1, name: d.name == null ? '' : str(d.name, 16, 'nom'), days: {}, board: {} };
    if (!isObj(d.days || {}) || !isObj(d.board || {}) || Object.keys(d.days || {}).length > 30 || Object.keys(d.board || {}).length > 30) bad('défi du jour invalide');
    for (const [day, D] of Object.entries(d.days || {})) {
      if (!DAY.test(day) || !isObj(D)) bad('essai du jour invalide');
      const od = {};
      for (const k of ['c', 'z']) {
        if (D[k] == null) continue;
        const t = D[k]; if (!isObj(t)) bad('essai du jour invalide');
        od[k] = { s: int(t.s, 0, 1e7, 'score du jour'), r: int(t.r, 0, 1e7, 'score relatif'), p: lvl(t.p), at: num(t.at, 0, 1e14, 'date') };
        if (t.partial != null) od[k].partial = bool(t.partial, 'essai');
        if (t.left != null) od[k].left = t.left ? 1 : 0;
      }
      o.days[day] = od;
    }
    for (const [day, B] of Object.entries(d.board || {})) {
      if (!DAY.test(day) || !Array.isArray(B) || B.length > 40) bad('classement invalide');
      o.board[day] = B.map((e) => {
        if (!isObj(e)) bad('classement invalide');
        const oe = { n: str(e.n, 16, 'nom'), s: int(e.s, 0, 1e7, 'score'), r: int(e.r, 0, 1e7, 'score relatif'), p: lvl(e.p), z: e.z ? 1 : 0, at: num(e.at || 0, 0, 1e14, 'date') };
        if (e.me) oe.me = 1;
        return oe;
      });
    }
    return o;
  };

  // summary of a validated (or current) save: what the confirmation shows
  const summarize = (game, arcade) => {
    const T = AMB.tree, recs = [];
    let nrec = 0;
    for (const [pn, P] of Object.entries((arcade && arcade.profiles) || {})) {
      for (const [id, st] of Object.entries(P.games || {})) {
        const n = Object.keys(st.best || {}).length; nrec += n;
        const top = Object.values(st.best || {}).reduce((m, r) => Math.max(m, r.score || 0), 0);
        if (n) recs.push({ profile: pn, id, title: (AMB.arcade && AMB.arcade.byId[id] && AMB.arcade.byId[id].title) || id, best: top });
      }
    }
    return {
      mode: game.mode, shards: game.shards, earned: game.earned,
      nodes: game.nodes.length, nodesTotal: T ? T.NODES.length : null,
      contracts: game.contracts.length, puzzles: game.puzzles.length,
      secrets: Object.keys((game.secrets && game.secrets.found) || {}).length,
      records: nrec, recList: recs,
    };
  };
  const sumText = (m) => [
    `✧ ${m.shards}`, `${m.nodes}${m.nodesTotal ? '/' + m.nodesTotal : ''} nœuds`,
    `${m.records} record${m.records > 1 ? 's' : ''}`, m.secrets ? `${m.secrets} secret${m.secrets > 1 ? 's' : ''}` : null,
  ].filter(Boolean).join(' · ');

  // ---- bytes <-> text <-> link ----
  const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (t) => { const s = atob(t.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
  const pipe = async (bytes, stream, cap) => {
    const r = new Blob([bytes]).stream().pipeThrough(stream).getReader(), parts = [];
    let n = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; n += value.length; if (n > cap) bad('données trop grandes'); parts.push(value); }
    const out = new Uint8Array(n); let p = 0; for (const c of parts) { out.set(c, p); p += c.length; }
    return out;
  };

  const save = {
    VERSION, ABSENCE, VISIT_KEY, validate: null,
    now: () => Date.now(), // overridable by tests
    reload: () => { try { location.reload(); } catch (e) {} },

    // the current state as a save object
    build() {
      const g = AMB.game, a = AMB.arcade;
      const o = { app: APP, kind: 'save', v: VERSION, at: this.now(), game: JSON.parse(JSON.stringify(g.s)), arcade: JSON.parse(JSON.stringify(a ? a.s : { v: 1, profile: 'default', profiles: {} })) };
      if (AMB.daily && AMB.daily.s) o.daily = JSON.parse(JSON.stringify(AMB.daily.s));
      return o;
    },
    // never throws: {ok:true, data:{game, arcade, at}, summary} or {ok:false, error}
    check(o) {
      try {
        if (!isObj(o)) bad('ce n\'est pas une sauvegarde');
        if (o.app !== APP || o.kind !== 'save') bad('ce n\'est pas une sauvegarde du Jardin sonore');
        if (o.v !== VERSION) bad('version ' + (typeof o.v === 'number' ? o.v : '?') + ' non prise en charge');
        const data = { game: gameState(o.game), arcade: arcadeState(o.arcade), at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0 };
        if (o.daily != null) data.daily = dailyState(o.daily);
        return { ok: true, data, summary: summarize(data.game, data.arcade) };
      } catch (e) { return { ok: false, error: e instanceof Bad ? e.message : 'fichier illisible' }; }
    },
    parse(text) {
      try {
        if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'fichier vide' };
        if (text.length > MAX_FILE) return { ok: false, error: 'fichier trop gros' };
        let o; try { o = JSON.parse(text); } catch (e) { return { ok: false, error: 'ce n\'est pas un fichier de sauvegarde (JSON invalide)' }; }
        return this.check(o);
      } catch (e) { return { ok: false, error: 'fichier illisible' }; }
    },
    // replace the progression (after the player confirmed), save, and reload so every screen is rebuilt
    apply(res, reload = true) {
      if (!res || !res.ok) return false;
      const g = AMB.game, a = AMB.arcade;
      g.s = JSON.parse(JSON.stringify(res.data.game)); g.save();
      if (a) { a.s = JSON.parse(JSON.stringify(res.data.arcade)); a.save(); }
      const D = AMB.daily; if (D && res.data.daily) { D.s = JSON.parse(JSON.stringify(res.data.daily)); D.save(); }
      if (AMB.secrets) { try { AMB.secrets.reset(); } catch (e) {} }
      g.emit('reset'); g.emit('mode', g.s.mode);
      if (reload) this.reload();
      return true;
    },

    // ---- file ----
    fileName(t = this.now()) { const d = new Date(t), p = (n) => String(n).padStart(2, '0'); return `jardin-sonore-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`; },
    exportFile() {
      const text = JSON.stringify(this.build(), null, 1), name = this.fileName();
      try {
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch (e) { return null; }
      return { name, size: text.length };
    },
    async readFile(file) {
      if (!file) return { ok: false, error: 'aucun fichier' };
      if (file.size > MAX_FILE) return { ok: false, error: 'fichier trop gros' };
      try { return this.parse(await file.text()); } catch (e) { return { ok: false, error: 'fichier illisible' }; }
    },

    // ---- link: #save=<z|b><base64url>  (z = deflate-raw, b = plain JSON) ----
    async encode(obj = this.build()) {
      const bytes = new TextEncoder().encode(JSON.stringify(obj));
      if (typeof CompressionStream === 'function') {
        try { return 'z' + b64u(await pipe(bytes, new CompressionStream('deflate-raw'), MAX_FILE)); } catch (e) {}
      }
      return 'b' + b64u(bytes);
    },
    async link() { return location.href.split('#')[0] + '#save=' + (await this.encode()); },
    async decode(code) {
      try {
        if (typeof code !== 'string' || code.length < 2 || code.length > MAX_LINK || !/^[zb][A-Za-z0-9_\-]+$/.test(code)) return { ok: false, error: 'lien invalide' };
        let bytes = unb64u(code.slice(1));
        if (code[0] === 'z') {
          if (typeof DecompressionStream !== 'function') return { ok: false, error: 'ce navigateur ne sait pas lire ce lien (utilise un fichier)' };
          bytes = await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_FILE);
        }
        return this.parse(new TextDecoder().decode(bytes));
      } catch (e) { return { ok: false, error: e instanceof Bad ? e.message : 'lien illisible' }; }
    },
    // a pasted link, a bare hash or the code itself
    async fromLink(text) {
      const m = /save=([A-Za-z0-9_\-]+)/.exec(String(text || '')), code = m ? m[1] : String(text || '').trim();
      return this.decode(code);
    },

    // ---- « depuis ta dernière visite » ----
    // reads the previous visit stamp, writes the new one; returns the card data or null (never gains)
    visit: { last: 0, prev: 0 },
    readVisit() { try { const o = JSON.parse(localStorage.getItem(VISIT_KEY)); return o && Number.isFinite(o.last) ? o.last : 0; } catch (e) { return 0; } },
    touch(t = this.now()) { this.visit.last = t; try { localStorage.setItem(VISIT_KEY, JSON.stringify({ last: t })); } catch (e) {} },
    // what waits for the player — only the state of things, nothing earned meanwhile
    backCard(since, g = AMB.game) {
      if (!g || !g.path || !since) return null;
      const lines = [], T = AMB.tree, C = AMB.contracts;
      const act = (g.s.active || []).filter((id) => C && C.byId[id]);
      if (act.length) {
        const d = C.byId[act[0]], n = C.progress ? C.progress(act[0]) : 0;
        lines.push({ k: 'Contrat en cours', v: d.title + (d.goal > 1 ? ` (${n}/${d.goal})` : '') });
      }
      if (T) {
        const av = T.NODES.filter((n) => T.status(n.id, g) === 'available').sort((a, b) => a.cost - b.cost);
        const pick = av.find((n) => g.canAfford(n.cost)) || av[0];
        if (pick) lines.push({ k: 'Prochain nœud', v: `${pick.name} · ✧ ${pick.cost}` + (g.canAfford(pick.cost) ? '' : ` (il te manque ${pick.cost - g.s.shards})`) });
      }
      // the daily challenge belongs to another module: use its line when it offers one, else a generic one
      try {
        const D = AMB.daily;
        if (D) {
          const t = typeof D.backLine === 'function' ? D.backLine() : null;
          lines.push({ k: 'Défi du jour', v: typeof t === 'string' && t ? t : 'à relever dans l\'Arcade' });
        }
      } catch (e) {}
      return { since, lines };
    },
    dateText(t) {
      try { return new Date(t).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); } catch (e) { return new Date(t).toISOString(); }
    },
    card: null, // pending return card
    refreshCard(since) {
      this.card = this.backCard(since);
      if (this.renderCard) this.renderCard();
    },
    init() {
      const prev = this.readVisit(), now = this.now();
      this.touch(now);
      this.visit.prev = prev;
      this.away = prev && now - prev > ABSENCE ? prev : 0;
    },
  };
  save.validate = save.check;
  AMB.save = save;
  save.init();

  // ---- interface (index.html : #saveBtn in the ⋯ menu; the dialog and card are built here) ----
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  let dlg, msg, body, linkBox, pending = null;

  const say = (t, err) => { if (!msg) return; msg.textContent = t || ''; msg.className = 'sv-msg' + (err ? ' err' : ''); msg.hidden = !t; };
  const summaryEl = (title, m) => {
    const box = el('div', 'sv-sum'); box.append(el('b', '', title));
    box.append(el('span', '', sumText(m)));
    if (m.recList.length) box.append(el('small', '', 'Records : ' + m.recList.slice(0, 6).map((r) => `${r.title} ${r.best}`).join(' · ')));
    return box;
  };
  const showMain = () => {
    pending = null; body.replaceChildren();
    const g = AMB.game;
    body.append(summaryEl('Ta progression', summarize(g.s, AMB.arcade.s)));
    const row = el('div', 'sv-row');
    const dl = el('button', 'btn', '⬇ Télécharger le fichier'); dl.dataset.act = 'file';
    dl.addEventListener('click', () => { const r = save.exportFile(); say(r ? `Fichier ${r.name} enregistré.` : 'Impossible de créer le fichier.', !r); });
    const lk = el('button', 'btn', '🔗 Copier le lien'); lk.dataset.act = 'link';
    lk.addEventListener('click', async () => {
      const url = await save.link(); linkBox.value = url; linkBox.hidden = false; linkBox.select();
      let copied = false; try { await navigator.clipboard.writeText(url); copied = true; } catch (e) {}
      say(copied ? 'Lien copié. Ouvre-le sur un autre appareil pour retrouver ta progression.' : 'Copie le lien ci-dessous.');
    });
    row.append(dl, lk); body.append(row);
    linkBox = el('input', 'sv-link'); linkBox.readOnly = true; linkBox.hidden = true; linkBox.setAttribute('aria-label', 'Lien de sauvegarde');
    body.append(linkBox);
    body.append(el('h4', '', 'Importer'));
    const lab = el('label', 'btn sv-file', '⬆ Importer un fichier'), inp = el('input'); inp.type = 'file'; inp.accept = 'application/json,.json'; inp.hidden = true; inp.id = 'saveFile';
    inp.addEventListener('change', async () => { const f = inp.files && inp.files[0]; inp.value = ''; confirm(await save.readFile(f)); });
    lab.append(inp);
    const pr = el('div', 'sv-paste'), ti = el('input'); ti.placeholder = 'Coller un lien de sauvegarde'; ti.setAttribute('aria-label', 'Lien de sauvegarde à importer'); ti.id = 'savePaste';
    const tb = el('button', 'btn', 'Lire le lien'); tb.addEventListener('click', async () => confirm(await save.fromLink(ti.value)));
    pr.append(ti, tb); body.append(lab, pr);
  };
  const confirm = (res) => {
    if (!dlg) build();
    if (!res.ok) { open(); say('Import impossible : ' + res.error + '.', true); return; }
    say(''); pending = res; body.replaceChildren();
    body.append(el('p', 'sv-ask', 'Remplacer ta progression ?'));
    const cmp = el('div', 'sv-cmp');
    cmp.append(summaryEl('Actuelle', summarize(AMB.game.s, AMB.arcade.s)), summaryEl('Importée', res.summary));
    body.append(cmp);
    const row = el('div', 'sv-row'), yes = el('button', 'btn sv-go', 'Remplacer'), no = el('button', 'btn', 'Annuler');
    yes.dataset.act = 'replace'; no.dataset.act = 'cancel';
    yes.addEventListener('click', () => { if (pending && save.apply(pending)) say('Progression remplacée.'); });
    no.addEventListener('click', () => { say(''); showMain(); });
    row.append(yes, no); body.append(row);
    open();
  };
  const open = () => { if (!dlg) build(); dlg.hidden = false; };
  const close = () => { if (dlg) dlg.hidden = true; pending = null; };
  const build = () => {
    dlg = el('div', 'modal sv-dlg'); dlg.id = 'saveDlg'; dlg.hidden = true;
    const card = el('div', 'modal-card sv-card'); card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Sauvegarde du Parcours');
    const x = el('button', 'modal-x', '✕'); x.setAttribute('aria-label', 'Fermer'); x.addEventListener('click', close);
    body = el('div', 'sv-body'); msg = el('p', 'sv-msg'); msg.hidden = true; msg.setAttribute('role', 'status');
    card.append(x, el('h3', '', 'Sauvegarde du Parcours'), el('p', 'sv-sub', 'Ta progression, tes records d\'arcade et tes secrets, en fichier ou en lien. Le mode libre n\'en fait pas partie.'), body, msg);
    dlg.append(card); document.body.append(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dlg.hidden) close(); });
    showMain();
  };
  save.open = () => { if (!dlg) build(); showMain(); say(''); open(); };
  save.close = close;
  save.confirm = (res) => confirm(res);

  // the return card, at the top of the ⋯ menu, with a dot on ⋯ until it is read
  save.renderCard = () => {
    const menu = $('.more .menu'), sum = $('.more > summary'); if (!menu) return;
    let c = $('#backCard');
    const c0 = save.card;
    if (!c0 || !c0.lines.length && !c0.since) { if (c) c.remove(); if (sum) sum.classList.remove('has-back'); return; }
    if (!c) { c = el('aside', 'back-card'); c.id = 'backCard'; menu.prepend(c); }
    c.replaceChildren();
    const x = el('button', 'back-x', '✕'); x.setAttribute('aria-label', 'Masquer'); x.addEventListener('click', () => { save.card = null; save.renderCard(); });
    c.append(x, el('b', '', 'Depuis ta dernière visite'), el('small', '', save.dateText(c0.since)));
    for (const l of c0.lines) { const p = el('p', ''); p.append(el('span', '', l.k + ' : '), document.createTextNode(l.v)); c.append(p); }
    c.append(el('small', 'back-note', 'Rien n\'a bougé pendant ton absence : le jardin t\'attendait.'));
    if (sum) sum.classList.add('has-back');
  };

  const wire = () => {
    const b = $('#saveBtn');
    const sync = () => { if (b) b.hidden = !AMB.game.path; if (!AMB.game.path) { save.card = null; save.renderCard(); } };
    if (b) b.addEventListener('click', () => { const d = $('.more'); if (d) d.open = false; save.open(); });
    if (AMB.bus) AMB.bus.on('game:mode', sync);
    sync();
    if (save.away) save.refreshCard(save.away);
    const more = $('.more'); if (more) more.addEventListener('toggle', () => { if (more.open) { const s = $('.more > summary'); if (s) s.classList.remove('has-back'); } });
    // back to the tab after a long absence
    let hiddenAt = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { hiddenAt = save.now(); save.touch(hiddenAt); return; }
      if (hiddenAt && save.now() - hiddenAt > ABSENCE) save.refreshCard(hiddenAt);
      hiddenAt = 0; save.touch();
    });
    window.addEventListener('pagehide', () => save.touch());
    // a link to import (#save=…): ask before anything is replaced
    const m = /(?:^|[#&])save=([A-Za-z0-9_\-]+)/.exec(location.hash);
    if (m) {
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      save.decode(m[1]).then((res) => confirm(res));
    }
  };
  document.addEventListener('DOMContentLoaded', () => setTimeout(wire, 0));
})();
