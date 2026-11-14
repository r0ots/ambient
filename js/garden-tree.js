// « Jardin sonore » : the tree screen — a map to look at (G11.1, S4.3: touching a node shows what opens it), the unlock
// sequence (G8.5) when a challenge opens a node, and the reveal of what it opened.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const $ = (s) => document.querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';
  // lanes, left to right (S11.8): Effets, the trunk, Harmonie with Composer at its right, next to Mouvement (its two parents)
  const FAN = ['espace', 'tronc', 'harmonie', 'composer', 'mouvement'];
  const STATE_TXT = { owned: 'ouvert', ready: 'prêt', available: 'à ouvrir', locked: 'encore dans le noir' };
  // S11.8 layout units: row height, room above (branch names) and below, side margin, gap between two subtrees, the hexagon,
  // labels (13 px capitals: CH = width of a letter, ONE = the widest single line before it splits, PAD = its plate)
  const L = { ROW: 136, TOP: 110, BOT: 110, M: 60, GAP: 30, LED: 46, CH: 8.4, ONE: 100, PAD: 14, KR: 0.86 };
  const SEQ = { link: 380, end: 1700, reduced: 650 }; // unlock sequence timing (ms; S4.6: a bit longer, to see it)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  Object.assign(AMB.garden, {
    depth(id, memo = {}) {
      if (memo[id] != null) return memo[id];
      const n = AMB.tree.byId[id];
      return (memo[id] = n.req.length ? 1 + Math.max(...n.req.map((r) => this.depth(r, memo))) : 0);
    },
    fanOrder() {
      const bs = Object.keys(AMB.tree.BRANCHES);
      return FAN.filter((b) => bs.includes(b)).concat(bs.filter((b) => !FAN.includes(b)));
    },
    // ---- S11.8 layout: a real tree, rows by depth from Allumage, each piece right above its main parent ----
    // Only what is drawn is laid out (open and ready pieces, S9.4): the map stays tight, a piece that becomes ready
    // makes room for itself (the map is rebuilt; opening a ready piece moves nothing).
    // main parent = the prerequisite of its own branch (else the deepest one): its link is the solid trace; the other
    // prerequisites are thin dotted traces. Tidy-tree packing (each subtree's outline row by row, never closer than GAP),
    // siblings ordered by branch (lanes), then by where their other links go (fewer crossings). Deterministic, no
    // hand-placed coordinates. Labels: 13 px, one or two lines (split at the best space), never cut.
    labelLines(name) {
      const t = name.toUpperCase(), wd = (s) => s.length * L.CH, ws = t.split(' ');
      if (wd(t) <= L.ONE || ws.length < 2) return [t];
      let best = null;
      for (let i = 1; i < ws.length; i++) { const a = ws.slice(0, i).join(' '), b = ws.slice(i).join(' '), m = Math.max(wd(a), wd(b)); if (!best || m < best.m) best = { m, l: [a, b] }; }
      return best.l;
    },
    treeSig() { return AMB.tree.NODES.filter((n) => this.seen(n.id)).map((n) => n.id).join(); },
    treeLayout() {
      const T = AMB.tree, sig = this.treeSig();
      if (this._lay && this._lay.sig === sig) return this._lay;
      const memo = {}, dep = (id) => this.depth(id, memo), idx = {}, lane = {}, prim = {}, kids = {}, lab = {}, W = {};
      const on = new Set(sig ? sig.split(',') : T.NODES.filter((n) => !n.req.length).map((n) => n.id)), NS = T.NODES.filter((n) => on.has(n.id));
      this.fanOrder().forEach((b, i) => { lane[b] = i; });
      T.NODES.forEach((n, i) => {
        idx[n.id] = i; kids[n.id] = []; lab[n.id] = this.labelLines(n.name);
        W[n.id] = Math.max(n.req.length ? L.LED : 58, ...lab[n.id].map((s) => s.length * L.CH + L.PAD));
      });
      for (const n of NS) if (n.req.some((r) => on.has(r))) { // (main parent among the drawn ones: a ready piece may wait on a hidden one)
        prim[n.id] = n.req.filter((r) => on.has(r)).sort((a, b) => (T.byId[b].branch === n.branch) - (T.byId[a].branch === n.branch) || dep(b) - dep(a) || n.req.indexOf(a) - n.req.indexOf(b))[0];
        kids[prim[n.id]].push(n.id);
      }
      const roots = NS.filter((n) => !prim[n.id]).map((n) => n.id), sec = [];
      for (const n of NS) for (const r of n.req) if (r !== prim[n.id] && on.has(r)) sec.push([r, n.id]);
      // a subtree: positions relative to its root, and its outline row by row ([left, right]); a child two rows up keeps
      // a thin stem free through the row between (no neighbour sits on its trace)
      const sub = (id) => {
        const r0 = dep(id), w = W[id] / 2, pos = { [id]: 0 }, cont = {};
        const ks = kids[id];
        ks.forEach((k, i) => {
          const s = sub(k);
          for (let r = r0 + 1; r < dep(k); r++) s.cont[r] = s.cont[r] ? [Math.min(s.cont[r][0], -8), Math.max(s.cont[r][1], 8)] : [-8, 8];
          let off = 0;
          if (i) { off = -Infinity; for (const r in s.cont) if (cont[r]) off = Math.max(off, cont[r][1] + L.GAP - s.cont[r][0]); if (off === -Infinity) off = 0; }
          for (const r in s.cont) { const c = s.cont[r]; cont[r] = cont[r] ? [Math.min(cont[r][0], c[0] + off), Math.max(cont[r][1], c[1] + off)] : [c[0] + off, c[1] + off]; }
          for (const q in s.pos) pos[q] = s.pos[q] + off;
        });
        if (ks.length) { // the parent right under the middle of its children
          const c = (pos[ks[0]] + pos[ks[ks.length - 1]]) / 2;
          for (const q in pos) pos[q] -= c;
          for (const r in cont) { cont[r][0] -= c; cont[r][1] -= c; }
          pos[id] = 0;
        }
        cont[r0] = [-w, w];
        return { pos, cont };
      };
      const place = () => {
        const x = {}, cont = {}; let at = 0;
        for (const rt of roots) {
          const s = sub(rt); let off = 0;
          if (at) { off = -Infinity; for (const r in s.cont) if (cont[r]) off = Math.max(off, cont[r][1] + L.GAP * 2 - s.cont[r][0]); if (off === -Infinity) off = 0; }
          for (const r in s.cont) { const c = s.cont[r]; cont[r] = cont[r] ? [Math.min(cont[r][0], c[0] + off), Math.max(cont[r][1], c[1] + off)] : [c[0] + off, c[1] + off]; }
          for (const q in s.pos) x[q] = s.pos[q] + off;
          at++;
        }
        const lo = Math.min(...Object.values(cont).map((c) => c[0])), hi = Math.max(...Object.values(cont).map((c) => c[1]));
        for (const q in x) x[q] += L.M - lo;
        return { x, w: hi - lo + 2 * L.M };
      };
      // siblings: by lane first; then 4 passes pulling each subtree towards where its other links go (barycentre)
      const key = {}; NS.forEach((n) => { key[n.id] = lane[n.branch] * 1000 + idx[n.id]; });
      const members = {}; const coll = (id) => (members[id] = [id, ...kids[id].flatMap(coll)]); roots.forEach(coll);
      let P = null;
      for (let pass = 0; pass < 5; pass++) {
        for (const id in kids) kids[id].sort((a, b) => key[a] - key[b] || idx[a] - idx[b]);
        P = place();
        if (pass === 4) break;
        for (const id in members) {
          const S = new Set(members[id]), xs = sec.filter(([a, b]) => S.has(a) !== S.has(b)).map(([a, b]) => P.x[S.has(a) ? b : a]);
          key[id] = xs.length ? (P.x[id] + xs.reduce((u, v) => u + v, 0) / xs.length) / 2 : P.x[id];
        }
      }
      const maxL = Math.max(...NS.map((n) => dep(n.id))), pos = {};
      for (const n of NS) pos[n.id] = { x: Math.round(P.x[n.id]), y: L.TOP + (maxL - dep(n.id)) * L.ROW, l: dep(n.id), w: Math.round(W[n.id]) };
      return (this._lay = { sig, pos, prim, lab, W: Math.round(P.w), H: L.TOP + maxL * L.ROW + L.BOT, maxL });
    },
    // id: S11.1 open on that piece (« ✦ Pad est prêt » in the Objectifs widget), else the first ready one
    showTree(on, id = null) {
      const d = $('#treeDlg'); if (!d) return;
      if (!on && this.seq) { this.seqFinish(); return; } // closing during the unlock sequence = finish it now
      const was = d.hidden;
      if (!on && !was) this.crtOff(d.querySelector('.tree-card')); // S7.3: the screen switches off like an old CRT
      d.hidden = !on;
      if (this.resetPointers) this.resetPointers(); // no finger left over from the last visit
      // S9.4: opens on the first node waiting on « ✦ Ouvrir » (its card, the button), else on nothing
      if (on) {
        this.select(null); this.renderTree();
        const r = was && ((id && AMB.tree.byId[id] && AMB.tree.status(id) === 'ready' && AMB.tree.byId[id]) || AMB.tree.NODES.find((x) => AMB.tree.status(x.id) === 'ready')), b = r && d.querySelector(`.tree-node[data-id="${r.id}"]`);
        if (b) { this.sel = r.id; b.classList.add('is-sel'); this.showInfo(r.id); } // (its card, without dimming the rest)
        this.fitTree(); if (AMB.discoveries) AMB.discoveries.render();
      }
      if (this.hiscores) this.hiscores.render(); // S6.6 (the entry of the initials shows while the Arbre is open)
      if (on && was) this.treeIn();
    },
    // ---- S7.3 motion of the Arbre (js/motion.js tokens; nothing waits for it, reduced motion / JUICE 0: nothing) ----
    // opening: a neon curtain unrolls the screen, the nodes pop in level by level from the root, the links of what is
    // already open trace themselves along (their glow sweeps them once)
    treeIn() {
      const M = AMB.motion, map = $('#treeDlg .tree-map'), card = $('#treeDlg .tree-card');
      if (!M || !M.on() || !map || !card) return [];
      M.pop(card, 'm-tree-in', { ms: M.ms('slow') + M.ms('med') + 60 });
      const lay = this.treeLayout(), a = Math.min(1.5, M.amp()), st = M.ms(M.MS.stagger), d0 = M.ms('med'), out = [];
      map.querySelectorAll('.tree-node').forEach((b) => {
        const p = lay.pos[b.dataset.id]; if (!p) return;
        out.push(b.animate([{ opacity: 0, scale: 1 - 0.7 * Math.min(1, a), translate: `0 ${14 * a}px` }, { opacity: 1, scale: 1, translate: '0 0' }],
          { duration: M.ms('med'), delay: d0 + p.l * st, easing: M.EASE.spring, fill: 'backwards' }));
      });
      map.querySelectorAll('.tree-glow').forEach((g) => {
        if (!AMB.game.has(g.dataset.to)) return;
        const p = lay.pos[g.dataset.from] || { l: 0 };
        out.push(g.animate([{ strokeDashoffset: 1, opacity: 0.9 }, { strokeDashoffset: 0, opacity: 0.9, offset: 0.6 }, { strokeDashoffset: 0, opacity: 0 }],
          { duration: M.ms('slow') + M.ms('med'), delay: d0 + p.l * st, easing: 'linear' }));
      });
      return out;
    },
    // a screen that closes: a ghost of its frame collapses to a line, then a dot (under the windows: never over one;
    // not while an ask runs, the widget stays clear)
    crtOff(card) {
      const M = AMB.motion; if (!M || !M.on() || !card || (AMB.demands && AMB.demands.cur)) return null;
      const r = card.getBoundingClientRect(); if (!r.width) return null;
      const g = document.createElement('div'); g.className = 'm-crt-off'; g.setAttribute('aria-hidden', 'true');
      Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      document.body.append(g);
      const an = g.animate([{ scale: '1 1', opacity: 0.25, filter: 'brightness(1)' }, { scale: '1.02 .012', opacity: 1, filter: 'brightness(3)', offset: 0.45 },
        { scale: '.01 .01', opacity: 0.9, filter: 'brightness(4)', offset: 0.85 }, { scale: '0 0', opacity: 0 }], { duration: M.ms('slow'), easing: M.EASE.in, fill: 'forwards' });
      an.onfinish = an.oncancel = () => g.remove();
      return an;
    },
    // a link lights up towards the node being opened: a spark runs along it (particles left behind, its branch colour)
    sparkRun(path, ms) {
      const M = AMB.motion; if (!M || !M.on() || !path || !path.getTotalLength) return;
      const len = path.getTotalLength(), c = getComputedStyle(path).getPropertyValue('--c').trim() || null, t0 = performance.now();
      const step = (now) => {
        if (!path.isConnected || !this.seq) return;
        const t = Math.min(1, (now - t0) / ms), f = 1 - Math.pow(1 - t, 3), pt = path.getPointAtLength(len * f), m = path.getScreenCTM();
        if (m) M.burst({ x: m.a * pt.x + m.c * pt.y + m.e, y: m.b * pt.x + m.d * pt.y + m.f }, { n: 3, spread: Math.PI * 2, speed: 120, life: 0.4, G: 200, color: t > 0.5 ? '#fff3c4' : c });
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
    // the node opened: it lights up in an explosion of its colour (and gold)
    boom(el) {
      const M = AMB.motion, led = el && el.querySelector('.led'); if (!M || !led) return 0;
      const c = getComputedStyle(el).getPropertyValue('--c').trim() || null;
      return M.burst(led, { n: 30, spread: Math.PI * 2, speed: 420, life: 0.75, G: 260, color: c }) + M.burst(led, { n: 14, spread: Math.PI * 2, speed: 260, life: 0.6, G: 200, color: '#fff3c4' });
    },
    // ---- the screen: header (nodes open, discoveries) + the map, built once and repainted ----
    renderTree() {
      const map = $('#treeDlg .tree-map'); if (!map) return;
      const T = AMB.tree, g = AMB.game;
      const n = T.NODES.filter((x) => g.has(x.id)).length; // S9.1: no total, what is left is still in the dark
      $('#treeDlg .tree-count').textContent = g.s.ended ? '✦ L\'instrument est à toi' : `${n} ouvert${n > 1 ? 's' : ''}`;
      const cnt = $('#treeDlg .tree-count'), rdy = $('#treeDlg .tree-ready'), nr = T.NODES.filter((x) => T.status(x.id) === 'ready').length;
      cnt.classList.toggle('done', !!g.s.ended);
      if (rdy) { rdy.hidden = !nr || !!g.s.ended; rdy.textContent = `${nr} ${nr > 1 ? 'prêts' : 'prêt'}`; } // (S9.2: the neon counters)
      if (!map.querySelector('.tree-stage') || map.dataset.n !== this.treeSig()) this.buildMap(map);
      this.paintTree();
    },
    // what opens a node: its objectives (S11.1: all of them, ✓ = done), or a discovery (S4.3, S5.10) — « ◇ Joue 16 notes
    // + ✓ Laisse jouer 8 mesures… », « ↺ Réponse « Premier reflet » (4 notes) », « ✦ Découverte : ??? »
    objText(d) { return d.kind === 'reponse' ? `↺ Réponse « ${d.title} » (${AMB.puzzles.need(d)} notes)` : AMB.game.txt(d.kind === 'demande' ? `♪ Demande : ${d.title}` : `◇ ${d.title}`); },
    openers(id) {
      const K = AMB.contracts, S = AMB.discoveries, objs = K ? K.forNode(id) : [], out = [];
      if (objs.length) {
        const done = objs.filter((d) => K.done(d.id)).length;
        out.push({ kind: 'défi', d: objs[0], objs, done, text: objs.map((d) => (K.done(d.id) ? '✓ ' + this.objText(d).slice(2) : this.objText(d))).join(' + ') });
      }
      if (S) for (const [sid, nid] of Object.entries(S.OPENS)) if (nid === id) out.push({ kind: 'secret', text: `✦ Découverte : ${S.has(sid) ? S.byId[sid].name : '???'}` });
      return out;
    },
    // S11.8 a circuit trace from a (below) to b, right angles only. Main parent: up to its bus (just above it, shared by
    // all its children), across, straight up into the child. Another prerequisite (sec): up to just under the child's
    // label, across, up — a thin dotted trace that never runs on a bus.
    linkPath(a, b, sec) {
      if (a.x === b.x) return `M${a.x} ${a.y}V${b.y}`;
      const y = sec ? b.y + L.ROW - 54 : a.y - 42;
      return `M${a.x} ${a.y}V${y}H${b.x}V${b.y}`;
    },
    // the stage: SVG links under absolutely placed LED buttons, in layout units (pan/zoom = one transform)
    buildMap(map) {
      const T = AMB.tree, lay = this.treeLayout();
      map.innerHTML = ''; map.dataset.n = lay.sig;
      const stage = document.createElement('div');
      stage.className = 'tree-stage'; stage.style.width = lay.W + 'px'; stage.style.height = lay.H + 'px';
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'tree-links'); svg.setAttribute('viewBox', `0 0 ${lay.W} ${lay.H}`);
      svg.setAttribute('width', lay.W); svg.setAttribute('height', lay.H); svg.setAttribute('aria-hidden', 'true');
      // branch names in a header row above what is lit (placed by paintTree)
      for (const bid of this.fanOrder()) {
        if (bid === 'tronc') continue;
        const t = document.createElementNS(SVGNS, 'text');
        t.setAttribute('class', 'tree-bname'); t.setAttribute('text-anchor', 'middle'); t.style.setProperty('--c', T.BRANCHES[bid].color);
        t.textContent = T.BRANCHES[bid].name; t.dataset.b = bid; svg.append(t);
      }
      const gl = document.createElementNS(SVGNS, 'g'), defs = document.createElementNS(SVGNS, 'defs');
      svg.append(defs);
      for (const n of T.NODES) for (const r of n.req) {
        // (.x: a secondary prerequisite; one end hidden: a short stub out of the drawn end, into the dark; both: nothing)
        const a = lay.pos[r], c = lay.pos[n.id], cross = !!(a && c) && lay.prim[n.id] !== r;
        const d = a && c ? this.linkPath(a, c, cross) : a ? `M${a.x} ${a.y}V${a.y - 64}` : c ? `M${c.x} ${c.y}V${c.y + 100}` : 'M0 0';
        // S9.1: a link towards a node still in the dark fades out from the visible end (its gradient, oriented by paintTree)
        const lg = document.createElementNS(SVGNS, 'linearGradient');
        lg.id = `tl-${r}-${n.id}`.replace(/\./g, '_'); lg.setAttribute('gradientUnits', 'userSpaceOnUse');
        lg.innerHTML = `<stop offset="0" stop-color="${T.BRANCHES[n.branch].color}" stop-opacity=".9"/><stop offset=".5" stop-color="${T.BRANCHES[n.branch].color}" stop-opacity="0"/>`;
        defs.append(lg);
        for (const glow of [false, true]) {
          const p = document.createElementNS(SVGNS, 'path');
          p.setAttribute('d', d); if (glow) p.setAttribute('pathLength', '1');
          p.setAttribute('class', glow ? 'tree-glow' : 'tree-link' + (cross ? ' x' : ''));
          p.dataset.from = r; p.dataset.to = n.id; p.style.setProperty('--c', T.BRANCHES[n.branch].color);
          gl.append(p);
        }
      }
      svg.append(gl);
      stage.append(svg);
      // buttons in reading order: branch by branch (fan order), bottom to top
      const ord = this.fanOrder();
      const nodes = [...T.NODES].sort((a, b) => (a.id === 'racine' ? -1 : b.id === 'racine' ? 1 : 0)
        || ord.indexOf(a.branch) - ord.indexOf(b.branch) || this.depth(a.id) - this.depth(b.id) || ((lay.pos[a.id] || {}).x || 0) - ((lay.pos[b.id] || {}).x || 0));
      for (const n of nodes) {
        const p = lay.pos[n.id] || { x: 0, y: 0, w: 112 }, b = document.createElement('button'); // (hidden ones: not drawn, anywhere)
        b.type = 'button'; b.className = 'tree-node'; b.dataset.id = n.id;
        if (!n.req.length) b.classList.add('root');
        b.style.left = p.x + 'px'; b.style.top = p.y + 'px'; b.style.width = p.w + 'px'; b.style.marginLeft = -p.w / 2 + 'px'; b.style.setProperty('--c', T.BRANCHES[n.branch].color);
        b.innerHTML = `<i class="led" aria-hidden="true"></i><b>${lay.lab[n.id].join('<br>')}</b><span></span>`;
        b.title = `${n.desc}\n\nOuvre : ${T.grantsText(n.id) || '—'}`
          + (n.req.length ? `\nIl faut d'abord : ${n.req.map((r) => T.byId[r].name).join(', ')}` : '')
          + this.openers(n.id).map((o) => `\n${o.text}`).join('');
        stage.append(b);
      }
      map.append(stage);
    },
    // S9.4: what is drawn — open nodes and nodes waiting on « ✦ Ouvrir »; everything else stays in the dark
    seen(id) { const s = AMB.tree.status(id); return s === 'owned' || s === 'ready'; },
    // states only (classes, opener line, aria-label): never rebuilds, so the unlock animation survives
    paintTree() {
      const map = $('#treeDlg .tree-map'); if (!map) return;
      const T = AMB.tree, g = AMB.game;
      map.querySelectorAll('.tree-node').forEach((b) => {
        const n = T.byId[b.dataset.id]; if (!n) return;
        const st = T.status(n.id), op = this.openers(n.id)[0];
        for (const s of Object.keys(STATE_TXT)) b.classList.toggle('st-' + s, s === st);
        b.classList.toggle('dark', !this.seen(n.id)); b.tabIndex = this.seen(n.id) ? 0 : -1;
        b.querySelector('span').textContent = st === 'owned' ? '✓' : st === 'ready' ? '✦ prêt' : !op ? '' : op.objs ? `◇ ${op.done}/${op.objs.length}` : '✦';
        const ext = n.req.filter((r) => T.byId[r].branch !== n.branch);
        b.setAttribute('aria-label', `${n.name}, ${T.BRANCHES[n.branch].name}, ${STATE_TXT[st]}`
          + (st === 'ready' ? ', réussi : à toi de l\'ouvrir' : st !== 'owned' && op ? `, s'ouvre par : ${op.text}` : '')
          + (n.req.length && st !== 'owned' ? `, il faut d'abord ${n.req.map((r) => T.status(r) === 'locked' ? 'une pièce cachée' : T.byId[r].name).join(', ')}` : '')
          + (ext.length && st === 'owned' ? `, relié à ${ext.map((r) => T.byId[r].name).join(', ')}` : ''));
      });
      // S9.1: only what is open or can open now is drawn; a link to the dark leaves in fading dots, two dark ends: nothing
      if (map.dataset.n !== this.treeSig()) { this.buildMap(map); this.paintTree(); return; } // (a piece came into sight: room for it)
      const seen = (id) => this.seen(id), lay = this.treeLayout();
      map.querySelectorAll('.tree-link, .tree-glow').forEach((p) => {
        const f = seen(p.dataset.from), t = seen(p.dataset.to), glow = p.classList.contains('tree-glow');
        const st = !f && !t ? 'gone' : !f || !t ? 'dark' : g.has(p.dataset.to) ? 'owned' : 'available';
        for (const c of ['owned', 'available', 'dark', 'gone']) p.classList.toggle(c, c === st && !(glow && c !== 'gone' && c !== 'dark'));
        if (glow) return;
        const id = `tl-${p.dataset.from}-${p.dataset.to}`.replace(/\./g, '_'), lg = map.querySelector('#' + id);
        if (st === 'dark' && lg) {
          const a = lay.pos[f ? p.dataset.from : p.dataset.to], dy = f ? -64 : 100; // (along the stub, out of the drawn end)
          lg.setAttribute('x1', a.x); lg.setAttribute('y1', a.y + dy * 0.3); lg.setAttribute('x2', a.x); lg.setAttribute('y2', a.y + dy * 1.6);
          p.style.stroke = `url(#${id})`;
        } else p.style.stroke = '';
      });
      // a branch's name shows once one of its nodes is open: in a header row above everything lit, over the middle of its
      // lit pieces, names pushed apart so they never touch (S11.8)
      const lit = T.NODES.filter((n) => this.seen(n.id)).map((n) => lay.pos[n.id]), yTop = (lit.length ? Math.min(...lit.map((q) => q.y)) : lay.H) - 62;
      const names = [];
      map.querySelectorAll('.tree-bname').forEach((t) => {
        const off = !T.NODES.some((n) => n.branch === t.dataset.b && g.has(n.id)); t.classList.toggle('gone', off);
        const ps = T.NODES.filter((n) => n.branch === t.dataset.b && this.seen(n.id)).map((n) => lay.pos[n.id]); if (off || !ps.length) return;
        names.push({ t, x: (Math.min(...ps.map((q) => q.x)) + Math.max(...ps.map((q) => q.x))) / 2, w: t.textContent.length * 12.5 + 20 });
      });
      names.sort((a, b) => a.x - b.x).forEach((o, i, a) => { if (i) o.x = Math.max(o.x, a[i - 1].x + (a[i - 1].w + o.w) / 2); });
      names.forEach((o) => { o.t.setAttribute('x', Math.round(o.x)); o.t.setAttribute('y', yTop); });
      this._bx = names.length ? [Math.min(...names.map((o) => o.x - o.w / 2)), Math.max(...names.map((o) => o.x + o.w / 2))] : null; // (fitTree frames them too)
      if (this.sel) this.showInfo(this.sel);
    },

    // ---- pan / zoom (pointer events: drag, pinch, wheel; buttons) ----
    view: { k: 1, tx: 0, ty: 0 },
    kLimits() {
      const map = $('#treeDlg .tree-map'), lay = this.treeLayout();
      const fit = Math.min(map.clientWidth / lay.W, map.clientHeight / lay.H) || 1;
      return { fit, min: Math.min(fit, 1) * 0.9, max: 2 };
    },
    applyView() {
      const map = $('#treeDlg .tree-map'), stage = map && map.querySelector('.tree-stage'); if (!stage) return;
      const v = this.view, lay = this.treeLayout(), vw = map.clientWidth, vh = map.clientHeight, pad = 40;
      const w = lay.W * v.k, h = lay.H * v.k;
      v.tx = w <= vw ? (vw - w) / 2 : clamp(v.tx, vw - w - pad, pad);
      v.ty = h <= vh ? (vh - h) / 2 : clamp(v.ty, vh - h - pad, pad);
      stage.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.k})`;
      map.classList.toggle('zoomed', w > vw + 1 || h > vh + 1);
    },
    // S11.8: opens on what is lit (open and ready pieces, their branch names) at a size where every label reads (13 px ×
    // KR ≥ 11 px on screen); a lit tree bigger than the frame is not squeezed: it opens centred on the pieces waiting on
    // « ✦ Ouvrir » (else the last one opened) and pans. ⤢ (all = true) = everything lit in sight, however small.
    // Remembers the width it was fitted for (resize: refit only if it changes).
    fitTree(all = false) {
      const map = $('#treeDlg .tree-map'); if (!map || !map.clientWidth) return;
      const T = AMB.tree, lay = this.treeLayout(), lim = this.kLimits(), v = this.view, mw = map.clientWidth, mh = map.clientHeight;
      this.fitW = window.innerWidth; // (the window's, not the map's: a scrollbar that comes or goes is not a resize)
      const ids = T.NODES.filter((n) => this.seen(n.id)).map((n) => n.id);
      if (!ids.length) ids.push(T.NODES[0].id);
      const ps = ids.map((id) => lay.pos[id]);
      const bx = this._bx || [Infinity, -Infinity];
      const x0 = Math.min(bx[0], ...ps.map((p) => p.x - p.w / 2)) - 24, x1 = Math.max(bx[1], ...ps.map((p) => p.x + p.w / 2)) + 24;
      const y0 = Math.min(...ps.map((p) => p.y)) - 90, y1 = Math.max(...ps.map((p) => p.y)) + 96;
      const k = Math.min(mw / (x1 - x0), mh / (y1 - y0), 1.15);
      v.k = clamp(all ? k : Math.max(k, L.KR), lim.min, lim.max);
      let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      if (!all && k < L.KR) { // too big to read at once: centre on what waits, else on the last piece opened
        const g = AMB.game, rd = ids.filter((id) => T.status(id) === 'ready'), last = g.s.nodes[g.s.nodes.length - 1];
        const f = (rd.length ? rd : [last && lay.pos[last] ? last : ids[0]]).map((id) => lay.pos[id]);
        const fx = (Math.min(...f.map((p) => p.x)) + Math.max(...f.map((p) => p.x))) / 2, fy = (Math.min(...f.map((p) => p.y)) + Math.max(...f.map((p) => p.y))) / 2 + 20;
        if ((x1 - x0) * v.k > mw) cx = clamp(fx, x0 + mw / 2 / v.k, x1 - mw / 2 / v.k);
        if ((y1 - y0) * v.k > mh) cy = clamp(fy, y0 + mh / 2 / v.k, y1 - mh / 2 / v.k);
      }
      v.tx = mw / 2 - cx * v.k; v.ty = mh / 2 - cy * v.k;
      this.applyView();
    },
    zoomAt(cx, cy, f) {
      const map = $('#treeDlg .tree-map'), r = map.getBoundingClientRect(), v = this.view, lim = this.kLimits();
      const k = clamp(v.k * f, lim.min, lim.max), px = cx - r.left, py = cy - r.top;
      v.tx = px - (px - v.tx) * (k / v.k); v.ty = py - (py - v.ty) * (k / v.k); v.k = k;
      this.applyView();
    },
    panToNode(id, below = 0) { // bring a node into the view (keyboard focus, touch selection under the card)
      const map = $('#treeDlg .tree-map'), el = map && map.querySelector(`.tree-node[data-id="${id}"]`); if (!el) return;
      const r = map.getBoundingClientRect(), e = el.getBoundingClientRect(), m = 16;
      let dx = 0, dy = 0;
      if (e.left < r.left + m) dx = r.left + m - e.left; else if (e.right > r.right - m) dx = r.right - m - e.right;
      if (e.top < r.top + m) dy = r.top + m - e.top; else if (e.bottom > r.bottom - m - below) dy = r.bottom - m - below - e.bottom;
      if (dx || dy) { this.view.tx += dx; this.view.ty += dy; this.applyView(); }
    },

    // ---- hover / focus / touch selection: prerequisites & what follows lit, node card ----
    sel: null,
    mark(id) {
      const map = $('#treeDlg .tree-map'); if (!map) return;
      map.querySelectorAll('.is-req, .is-dep, .is-focus, .is-hl').forEach((e) => e.classList.remove('is-req', 'is-dep', 'is-focus', 'is-hl'));
      if (!id || !AMB.tree.byId[id]) return;
      const q = (x) => map.querySelector(`.tree-node[data-id="${x}"]`);
      const me = q(id); if (me) me.classList.add('is-focus');
      AMB.tree.byId[id].req.forEach((r) => { const e = q(r); if (e) e.classList.add('is-req'); });
      AMB.tree.dependents(id).forEach((r) => { const e = q(r); if (e) e.classList.add('is-dep'); });
      map.querySelectorAll(`.tree-link[data-to="${id}"], .tree-link[data-from="${id}"]`).forEach((p) => p.classList.add('is-hl'));
    },
    select(id) {
      this.sel = id || null;
      const map = $('#treeDlg .tree-map');
      if (map) map.querySelectorAll('.is-sel').forEach((e) => e.classList.remove('is-sel'));
      if (id && map) { const b = map.querySelector(`.tree-node[data-id="${id}"]`); if (b) b.classList.add('is-sel'); }
      this.mark(id); this.showInfo(id);
    },
    // the node card: what it opens, what it needs, and what opens it (S4.3: no button to buy; S4.2: a Réponse is played
    // in the music, no button either)
    showInfo(id) {
      const box = $('#treeDlg .tree-info'); if (!box) return;
      const T = AMB.tree, g = AMB.game, K = AMB.contracts, n = id && T.byId[id];
      // S9.4: nothing selected — on a wide screen the side panel stays, with what to do; on a phone it goes
      if (!n) { box.dataset.id = ''; box.className = 'tree-info empty'; box.style.removeProperty('--c'); box.innerHTML = `<p class="ti-d">${AMB.game.txt('{Survole|Touche} une pièce allumée pour voir ce qu\'elle ouvre.')}</p>`; box.hidden = false; return; }
      const st = T.status(id), br = T.BRANCHES[n.branch], ops = st === 'owned' || st === 'ready' ? [] : this.openers(id);
      const nm = (r) => (this.seen(r) ? T.byId[r].name : '???'); // (S9.1: what is still in the dark keeps its name)
      const req = n.req.map((r) => `<span class="${g.has(r) ? 'ok' : ''}">${g.has(r) ? '✓' : '·'} ${nm(r)}</span>`).join(' ');
      const now = ops.find((o) => o.objs) && K.current() === id;
      // S6.7: while nodes wait on « ✦ Ouvrir » no challenge runs (contracts.refill): its card says so, not a challenge
      // that cannot come yet
      const wait = g.path && !g.s.ended ? (g.s.ready || []).filter((r) => g.canOpen(r.id)).length : 0;
      const opTxt = (wait && ops.some((o) => o.d || o.objs) ? [`Ouvre d'abord ce qui est prêt (${wait})`] : []).concat(ops.filter((o) => !(wait && (o.d || o.objs))).map((o) => o.objs ? o.objs.map((d) => `${K.done(d.id) ? '☑' : '☐'} ${this.objText(d).slice(2)}`).join('<br>') : o.text));
      box.style.setProperty('--c', st === 'ready' ? 'var(--amber)' : br.color);
      const fresh = box.hidden || box.dataset.id !== id; // S7.3: a new card slides in (the same one repainted does not)
      box.dataset.id = id; box.className = `tree-info st-${st}`;
      box.innerHTML = `<p class="ti-h"><b>${n.name}</b> <small>${br.name} · ${STATE_TXT[st]}</small></p>`
        + `<p class="ti-d">${st === 'ready' ? g.txt(n.why) : n.desc}</p>`
        + `<p class="ti-g">Ouvre : ${T.grantsText(id) || '—'}</p>`
        + (n.req.length ? `<p class="ti-r">Il faut d'abord : ${req}</p>` : '')
        + (ops.length ? `<p class="ti-o">Pour l'ouvrir${now && !wait ? ' <em>(en cours)</em>' : ''} :<br>${opTxt.map((t) => `<span>${t}</span>`).join('<br>ou ')}</p>` : '')
        // S4.6 → S11.1: won, waiting for the player: THE « ✦ Ouvrir » of the path (after its prerequisites, for a secret's chain)
        + (st === 'ready' ? (n.req.every((r) => g.has(r)) ? '<p class="ti-o">✓ Réussi : à toi de l\'ouvrir. <button type="button" class="btn primary small ti-open">✦ Ouvrir</button></p>'
          : `<p class="ti-o">✓ Réussi : s'ouvre après ${n.req.filter((r) => !g.has(r)).map(nm).join(', ')}.</p>`) : '');
      box.hidden = false; // (S9.4: a side panel beside the map, under it on a phone: it never hides a node)
      const M = AMB.motion;
      if (fresh && M && M.on() && box.animate) box.animate([{ opacity: 0, translate: `${28 * Math.min(1.5, M.amp())}px 0`, scale: 0.94 }, { opacity: 1, translate: '0 0', scale: 1 }],
        { duration: M.ms('med'), easing: M.EASE.spring });
    },
    // all map interaction, wired once from garden.build()
    wireTree() {
      const map = $('#treeDlg .tree-map'), dlg = $('#treeDlg'); if (!map || this._wired) return; this._wired = true;
      let ptype = 'mouse', drag = null, pinch = null, suppress = false;
      const pts = new Map();
      const touchy = () => ptype === 'touch' || ptype === 'pen';
      map.addEventListener('pointerdown', (e) => {
        ptype = e.pointerType || 'mouse';
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 1) drag = { x0: e.clientX, y0: e.clientY, tx: this.view.tx, ty: this.view.ty, moved: false };
        if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
          if (drag) drag.moved = true;
        }
      });
      map.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size >= 2 && pinch) {
          const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
          this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d); pinch.d = d;
          return;
        }
        if (!drag) return;
        const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
        if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; try { map.setPointerCapture(e.pointerId); } catch (er) {} }
        if (drag.moved && !pinch) { this.view.tx = drag.tx + dx; this.view.ty = drag.ty + dy; this.applyView(); map.classList.add('panning'); }
      });
      const up = (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (drag && drag.moved) suppress = true;
        if (pts.size < 2) pinch = null;
        if (!pts.size) { drag = null; map.classList.remove('panning'); setTimeout(() => { suppress = false; }, 0); }
        else { const [a] = [...pts.values()]; drag = { x0: a.x, y0: a.y, tx: this.view.tx, ty: this.view.ty, moved: true }; }
      };
      map.addEventListener('pointerup', up); map.addEventListener('pointercancel', up);
      map.addEventListener('lostpointercapture', up); map.addEventListener('pointerleave', up); // never a stale finger
      this.resetPointers = () => { pts.clear(); drag = null; pinch = null; suppress = false; map.classList.remove('panning'); };
      this.pointers = () => pts.size; // (tests)
      map.addEventListener('click', (e) => { if (suppress) { e.stopPropagation(); e.preventDefault(); suppress = false; } }, true);
      map.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });
      // a focused button off-screen must not scroll the clipped map: pan instead
      map.addEventListener('scroll', () => { map.scrollLeft = 0; map.scrollTop = 0; });
      // hovering / focusing a node lights its prerequisites and what it leads to, and shows its card
      map.addEventListener('mouseover', (e) => { if (touchy()) return; const b = e.target.closest('.tree-node'); if (b) { this.mark(b.dataset.id); this.showInfo(b.dataset.id); } });
      map.addEventListener('mouseleave', () => { this.mark(this.sel); this.showInfo(this.sel); });
      map.addEventListener('focusin', (e) => { const b = e.target.closest('.tree-node'); if (!b) return; this.mark(b.dataset.id); this.showInfo(b.dataset.id); this.panToNode(b.dataset.id); });
      // click (mouse, finger or keyboard): select the node, its card says what opens it
      const info = $('#treeDlg .tree-info');
      // S9.1: ✦ Ouvrir in the Arbre opens right there (its card already says what it gives): the sequence plays on the map
      if (info) info.addEventListener('click', (e) => { if (e.target.closest('.ti-open')) this.openNode(info.dataset.id); });
      map.addEventListener('click', (e) => {
        const b = e.target.closest('.tree-node');
        if (!b) { this.select(null); return; }
        this.select(b.dataset.id);
        this.applyView(); this.panToNode(b.dataset.id); // (S9.4: on a phone the card takes the bottom of the screen: the map shrinks above it)
      });
      const zm = $('#treeDlg .tree-zoom');
      if (zm) zm.addEventListener('click', (e) => {
        const b = e.target.closest('[data-zoom]'); if (!b) return;
        const r = map.getBoundingClientRect();
        if (b.dataset.zoom === 'fit') this.fitTree(true); else this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, b.dataset.zoom === 'in' ? 1.3 : 1 / 1.3);
      });
      // any click during the unlock sequence fast-forwards it
      if (dlg) dlg.addEventListener('click', (e) => { if (this.seq) { e.stopPropagation(); e.preventDefault(); this.seqFinish(); } }, true);
      // refit only when the width changes (a mobile address bar showing / hiding changes the height only)
      window.addEventListener('resize', () => { if (!dlg || dlg.hidden) return; if (window.innerWidth !== this.fitW) { this.renderTree(); this.fitTree(); } else this.applyView(); }); // (S5.7: across 560 px, the other fan)
    },

    // ---- unlock sequence (G8.5): a challenge just opened a node ----
    // (S9.1: only when the Arbre is already open) ~1.2 s on the map: the parent→node links light up, the node is born (chime), newly reachable children blink, then the
    // tree closes and reveal() shows what opened. Reduced motion: final state + chime at once, short pause, close.
    seq: null,
    unlockSeq(id) {
      if (this.seq) this.seqFinish();
      const dlg = $('#treeDlg'); // S9.1: the Arbre opens by its button only; an opening elsewhere plays on the instrument
      const el = document.querySelector(`#treeDlg .tree-node[data-id="${id}"]`);
      const still = this.reduced || !el || !dlg || dlg.hidden;
      const s = (this.seq = { id, t: [], hit: false });
      if (still) {
        this.seqImpact();
        s.t.push(setTimeout(() => this.seqFinish(), el && dlg && !dlg.hidden ? SEQ.reduced : 0));
        return;
      }
      this.select(null);
      el.classList.remove('st-owned'); el.classList.add('is-buying'); // (painted as it was, until the impact)
      document.querySelectorAll(`#treeDlg .tree-glow[data-to="${id}"]`).forEach((p) => { p.classList.remove('lit'); void p.getBoundingClientRect(); p.classList.add('lit'); this.sparkRun(p, AMB.motion ? AMB.motion.ms('slow') : SEQ.link); });
      // S4.5w: the impact (chime) falls on the strong beat the opening waits for (beat(), garden.js)
      const b = this.beatOf(id), ctx = AMB.engine && AMB.engine.ctx;
      const hit = b.at != null && ctx ? Math.max(SEQ.link, (b.at - ctx.currentTime) * 1000 - 60) : SEQ.link;
      s.t.push(setTimeout(() => this.seqImpact(), hit));
      s.t.push(setTimeout(() => this.seqFinish(), hit + SEQ.end - SEQ.link));
    },
    seqImpact() {
      const s = this.seq; if (!s || s.hit) return; s.hit = true;
      const T = AMB.tree;
      // (the chime and the rest of the juice: garden.fx('open'), on the same strong beat)
      this.paintTree();
      const el = document.querySelector(`#treeDlg .tree-node[data-id="${s.id}"]`);
      if (!el || this.reduced) return;
      el.classList.remove('is-buying'); el.classList.add('is-born'); this.boom(el);
      for (const k of T.dependents(s.id)) {
        if (T.status(k) !== 'available') continue;
        const c = document.querySelector(`#treeDlg .tree-node[data-id="${k}"]`); if (c) c.classList.add('is-blink');
        document.querySelectorAll(`#treeDlg .tree-glow[data-from="${s.id}"][data-to="${k}"]`).forEach((p) => p.classList.add('hint'));
      }
    },
    seqFinish() {
      const s = this.seq; if (!s) return;
      this.seqImpact();
      s.t.forEach(clearTimeout); this.seq = null;
      document.querySelectorAll('#treeDlg .is-buying, #treeDlg .is-born, #treeDlg .is-blink, #treeDlg .tree-glow.lit, #treeDlg .tree-glow.hint')
        .forEach((e) => e.classList.remove('is-buying', 'is-born', 'is-blink', 'lit', 'hint'));
      this.showTree(false);
      // the plant grows once the map is gone (and not before the strong beat)
      const GV = AMB.gardenVisual, b = this.beatOf(s.id); if (GV) GV.growAt(Math.max(GV.clock(), b.at || 0));
      if (s.held) AMB.tree.release(); // what it opened comes in now (tree.appear: unfolds, halo, « Nouveau »)
      this.reveal(s.id);
    },
    // show what a node just opened: go to the right mode and scroll to it (S4.6: the animation and the highlight are
    // tree.appear's, for every lock that opens)
    revealTargets(id) {
      const n = AMB.tree.byId[id]; if (!n) return [];
      const els = [...document.querySelectorAll(`[data-node="${id}"]`)];
      for (const u of n.ui) document.querySelectorAll(`[data-ui="${u}"]`).forEach((e) => { if (!els.includes(e)) els.push(e); });
      return els.filter((e) => !e.closest('.is-locked') && !e.closest('.menu') && !e.matches('.stage .hint')); // the keys line just appears
    },
    reveal(id) {
      const els = this.revealTargets(id), nf = AMB.tree.newFirst;
      // the control tagged « Nouveau », else the first one
      const first = nf && els.includes(nf) ? nf : els[0];
      if (!first) return;
      const want = first.closest('.seqrow') ? 'compose' : first.closest('.drawer') ? 'sculpt' : null;
      if (want && AMB.mode !== want && AMB.perform) AMB.perform.setMode(want);
      try { first.scrollIntoView({ behavior: this.reduced ? 'auto' : 'smooth', block: 'center' }); } catch (e) { first.scrollIntoView(); }
    },

  });
})();
