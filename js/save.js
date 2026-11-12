// « Jardin sonore » G10.4 : exportable save of the path (file + link, import with strict validation).
// A save = the path's state (AMB.game.s, secrets included: game.s.secrets). Not saved: settings, patches, free mode.
// Older saves may carry fields of removed features (top-level or inside the game state): they are ignored.
// Import never throws: check() returns {ok, error, data}; unknown ids are refused, numbers are bounded,
// unknown fields are dropped: only the known keys of the state survive.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const VERSION = 1, APP = 'jardin-sonore';
  const MAX_FILE = 2e6, MAX_LINK = 300000;
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
  // ---- validation ----
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
    o.secrets = s.secrets == null ? null : secretsState(s.secrets, X);
    o.rng = s.rng == null ? null : int(s.rng, 0, 4294967295, 'tirage');
    return o;
  };
  const secretsState = (q, X) => {
    if (!isObj(q)) bad('secrets invalides');
    const o = { found: {}, secs: 0, mirrorOn: false, theme: '', gifts: { timbres: [], themes: [], mirror: false } };
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
    if (!Array.isArray(g.timbres || []) || (g.timbres || []).length > 40) bad('timbres invalides');
    for (const t of g.timbres || []) {
      if (!isObj(t) || typeof t.sec !== 'string' || !ID.test(t.sec) || typeof t.opt !== 'string' || t.opt.length > 40) bad('timbres invalides');
      o.gifts.timbres.push({ sec: t.sec, opt: t.opt });
    }
    if (q.theme != null) { if (typeof q.theme !== 'string' || (q.theme && !o.gifts.themes.includes(q.theme))) bad('thème invalide'); o.theme = q.theme; }
    return o;
  };

  // summary of a validated (or current) save: what the confirmation shows
  const summarize = (game) => {
    const T = AMB.tree;
    return {
      mode: game.mode, shards: game.shards, earned: game.earned,
      nodes: game.nodes.length, nodesTotal: T ? T.NODES.length : null,
      contracts: game.contracts.length, puzzles: game.puzzles.length,
      secrets: Object.keys((game.secrets && game.secrets.found) || {}).length,
    };
  };
  const sumText = (m) => [
    `✧ ${m.shards}`, `${m.nodes}${m.nodesTotal ? '/' + m.nodesTotal : ''} nœuds`,
    m.secrets ? `${m.secrets} secret${m.secrets > 1 ? 's' : ''}` : null,
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
    VERSION,
    now: () => Date.now(), // overridable by tests
    reload: () => { try { location.reload(); } catch (e) {} },

    // the current state as a save object
    build() {
      return { app: APP, kind: 'save', v: VERSION, at: this.now(), game: JSON.parse(JSON.stringify(AMB.game.s)) };
    },
    // never throws: {ok:true, data:{game, at}, summary} or {ok:false, error}
    check(o) {
      try {
        if (!isObj(o)) bad('ce n\'est pas une sauvegarde');
        if (o.app !== APP || o.kind !== 'save') bad('ce n\'est pas une sauvegarde du Jardin sonore');
        if (o.v !== VERSION) bad('version ' + (typeof o.v === 'number' ? o.v : '?') + ' non prise en charge');
        const data = { game: gameState(o.game), at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0 };
        return { ok: true, data, summary: summarize(data.game) };
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
      const g = AMB.game;
      g.s = JSON.parse(JSON.stringify(res.data.game)); g.save();
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

  };
  AMB.save = save;

  // ---- interface (index.html : #saveBtn in the ⋯ menu, path only; the dialog is built here) ----
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  let dlg, msg, body, linkBox, pending = null;

  const say = (t, err) => { if (!msg) return; msg.textContent = t || ''; msg.className = 'sv-msg' + (err ? ' err' : ''); msg.hidden = !t; };
  const summaryEl = (title, m) => {
    const box = el('div', 'sv-sum'); box.append(el('b', '', title));
    box.append(el('span', '', sumText(m)));
    return box;
  };
  const showMain = () => {
    pending = null; body.replaceChildren();
    const g = AMB.game;
    body.append(summaryEl('Ta progression', summarize(g.s)));
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
    cmp.append(summaryEl('Actuelle', summarize(AMB.game.s)), summaryEl('Importée', res.summary));
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
    card.append(x, el('h3', '', 'Sauvegarde du Parcours'), el('p', 'sv-sub', 'Ta progression et tes secrets, en fichier ou en lien. Le mode libre n\'en fait pas partie.'), body, msg);
    dlg.append(card); document.body.append(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dlg.hidden) close(); });
    showMain();
  };
  save.open = () => { if (!dlg) build(); showMain(); say(''); open(); };
  save.close = close;
  save.confirm = (res) => confirm(res);

  const wire = () => {
    const b = $('#saveBtn');
    const sync = () => { if (b) b.hidden = !AMB.game.path; };
    if (b) b.addEventListener('click', () => { const d = $('.more'); if (d) d.open = false; save.open(); });
    if (AMB.bus) AMB.bus.on('game:mode', sync);
    sync();
    // a link to import (#save=…): the confirmation shows both progressions, nothing is written before « Remplacer »
    const m = /(?:^|[#&])save=([A-Za-z0-9_\-]+)/.exec(location.hash);
    if (m) {
      save.decode(m[1]).then((res) => confirm(res));
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    }
  };
  document.addEventListener('DOMContentLoaded', () => setTimeout(wire, 0));
})();
