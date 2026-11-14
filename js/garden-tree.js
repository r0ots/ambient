// « Jardin sonore » : the tree screen — a map to look at (G11.1, S4.3: touching a node shows what opens it), the unlock
// sequence (G8.5) when a challenge opens a node, and the reveal of what it opened.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const $ = (s) => document.querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';
  // fan order, left to right: the trunk in the middle, Composer between its two parents
  const FAN = ['espace', 'harmonie', 'tronc', 'composer', 'mouvement'];
  const STATE_TXT = { owned: 'ouvert', ready: 'prêt', available: 'à ouvrir', locked: 'encore dans le noir' };
  const L = { W: 1220, ROW: 98, TOP: 60, BOT: 66, MIN: 94, GAP: 94, A: 46, B: 50, M: 50 };
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
    // ---- layout (G11.1): rows by level from the bottom, branch bands spreading out like a fan ----
    // A branch holds at most 2 nodes per row (3 for the trunk and big branches), so rows stay readable
    // and the outer branches climb into the upper corners.
    // S5.7: a phone (map < 560 px) gets a narrow fan — branches side by side but barely spreading, taller rows — so the
    // whole map fits its width and fills its height (the wide fan was cut at the sides, with an empty quarter below)
    narrowTree() { const m = $('#treeDlg .tree-map'); return !!m && m.clientWidth > 0 && m.clientWidth < 560; },
    treeLayout() {
      const T = AMB.tree, nar = this.narrowTree(), A = nar ? 8 : L.A, B = nar ? 6 : L.B, ROW = nar ? 185 : L.ROW, MIN = nar ? 82 : L.MIN, GAP = nar ? 82 : L.GAP;
      if (this._lay && this._lay.n === T.NODES.length && this._lay.nar === nar) return this._lay;
      const memo = {}, order = this.fanOrder(), mid = (order.length - 1) / 2;
      const slot = Object.fromEntries(order.map((b, i) => [b, i - mid]));
      const count = {}; T.NODES.forEach((n) => { count[n.branch] = (count[n.branch] || 0) + 1; });
      const lvl = {}, used = {};
      const sorted = T.NODES.map((n, i) => [n, i]).sort((a, b) => this.depth(a[0].id, memo) - this.depth(b[0].id, memo) || a[1] - b[1]).map((x) => x[0]);
      for (const n of sorted) {
        let l = n.req.length ? 1 + Math.max(...n.req.map((r) => lvl[r])) : 0;
        const cap = slot[n.branch] === 0 || count[n.branch] > 8 ? 3 : 2;
        while ((used[n.branch + '|' + l] || 0) >= cap) l++;
        used[n.branch + '|' + l] = (used[n.branch + '|' + l] || 0) + 1;
        lvl[n.id] = l;
      }
      const maxL = Math.max(...Object.values(lvl)), H = L.TOP + maxL * ROW + L.BOT, CX = L.W / 2;
      const pos = {};
      for (let l = 0; l <= maxL; l++) {
        const row = [];
        for (const b of order) {
          const sib = T.NODES.filter((n) => n.branch === b && lvl[n.id] === l);
          sib.forEach((n, i) => row.push({ n, want: CX + slot[b] * (A + B * l) + (i - (sib.length - 1) / 2) * GAP }));
        }
        if (!row.length) continue;
        // (rows are built branch by branch in fan order: branches never interleave)
        // sweep: keep a minimum gap, then shift the row back to where it wanted to be, inside the stage
        row.forEach((r, i) => { r.x = i ? Math.max(r.want, row[i - 1].x + MIN) : r.want; });
        const shift = row.reduce((s, r) => s + r.want - r.x, 0) / row.length;
        let lo = row[0].x + shift, hi = row[row.length - 1].x + shift, d = shift;
        if (lo < L.M) d += L.M - lo; else if (hi > L.W - L.M) d -= hi - (L.W - L.M);
        lo = row[0].x + d; if (lo < L.M) d += L.M - lo; // too wide: pin to the left edge
        row.forEach((r) => { pos[r.n.id] = { x: Math.round(r.x + d), y: L.TOP + (maxL - l) * ROW, l }; });
      }
      // a row too wide for the stage is pinned left and spills right: widen the stage so "see all" really shows all
      const W = Math.max(L.W, ...Object.values(pos).map((p) => p.x + L.M));
      if (nar) { // the narrow fan: the stage only as wide as its widest row
        const xs = Object.values(pos).map((p) => p.x), lo = Math.min(...xs) - 42;
        for (const p of Object.values(pos)) p.x -= lo;
        return (this._lay = { n: T.NODES.length, nar, pos, W: Math.max(...xs) - lo + 42, H, maxL });
      }
      return (this._lay = { n: T.NODES.length, nar, pos, W, H, maxL });
    },
    showTree(on) {
      const d = $('#treeDlg'); if (!d) return;
      if (!on && this.seq) { this.seqFinish(); return; } // closing during the unlock sequence = finish it now
      const was = d.hidden;
      if (!on && !was) this.crtOff(d.querySelector('.tree-card')); // S7.3: the screen switches off like an old CRT
      d.hidden = !on;
      if (this.resetPointers) this.resetPointers(); // no finger left over from the last visit
      // S9.4: opens on the first node waiting on « ✦ Ouvrir » (its card, the button), else on nothing
      if (on) {
        this.select(null); this.renderTree();
        const r = was && AMB.tree.NODES.find((x) => AMB.tree.status(x.id) === 'ready'), b = r && d.querySelector(`.tree-node[data-id="${r.id}"]`);
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
    // not while an ask runs, the LCD stays clear)
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
      if (!map.querySelector('.tree-stage') || map.dataset.n !== T.NODES.length + (this.narrowTree() ? 'n' : '')) this.buildMap(map);
      this.paintTree();
    },
    // what opens a node: its challenge, or a discovery (S4.3, S5.10) — « ◇ Joue 6 notes », « ↺ Réponse « Premier reflet » (3 notes) », « ✦ Découverte : ??? »
    openers(id) {
      const K = AMB.contracts, S = AMB.discoveries, d = K && K.forNode(id), out = [];
      if (d) out.push({ kind: d.kind === 'reponse' ? 'reponse' : 'défi', d, text: d.kind === 'reponse' ? `↺ Réponse « ${d.title} » (${AMB.puzzles.need(d)} notes)` : AMB.game.txt(d.kind === 'demande' ? `♪ Demande : ${d.title}` : `◇ ${d.title}`) });
      if (S) for (const [sid, nid] of Object.entries(S.OPENS)) if (nid === id) out.push({ kind: 'secret', text: `✦ Découverte : ${S.has(sid) ? S.byId[sid].name : '???'}` });
      return out;
    },
    // S9.2 a circuit trace from a (below) to b: straight up, a 45° bend towards b's column (a flat run if the step is
    // wide), straight up into b — never a curve
    linkPath(a, b) {
      const dx = b.x - a.x, dy = a.y - b.y, sx = Math.sign(dx), diag = Math.min(Math.abs(dx), Math.max(0, dy - 24)), flat = Math.abs(dx) - diag;
      if (!dx) return `M${a.x} ${a.y}V${b.y}`;
      const y1 = a.y - Math.max(12, (dy - diag) / 2), y2 = y1 - diag;
      return `M${a.x} ${a.y}V${y1}L${a.x + sx * diag} ${y2}${flat ? `H${b.x}` : ''}V${b.y}`;
    },
    // the stage: SVG links under absolutely placed LED buttons, in layout units (pan/zoom = one transform)
    buildMap(map) {
      const T = AMB.tree, lay = this.treeLayout();
      map.innerHTML = ''; map.dataset.n = T.NODES.length + (lay.nar ? 'n' : '');
      const stage = document.createElement('div');
      stage.className = 'tree-stage'; stage.style.width = lay.W + 'px'; stage.style.height = lay.H + 'px';
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'tree-links'); svg.setAttribute('viewBox', `0 0 ${lay.W} ${lay.H}`);
      svg.setAttribute('width', lay.W); svg.setAttribute('height', lay.H); svg.setAttribute('aria-hidden', 'true');
      // branch names at the tip of each band
      const tops = {}; // (narrow fan: names side by side on one row alternate on two lines)
      for (const bid of this.fanOrder()) {
        const ps = T.NODES.filter((n) => n.branch === bid).map((n) => lay.pos[n.id]); if (!ps.length) continue;
        const top = Math.min(...ps.map((p) => p.y)), xs = ps.filter((p) => p.y === top).map((p) => p.x);
        const t = document.createElementNS(SVGNS, 'text'), up = lay.nar && bid !== 'tronc' && (tops[top] = (tops[top] || 0) + 1) % 2 === 0 ? 26 : 0;
        t.setAttribute('class', 'tree-bname'); t.setAttribute('x', xs.reduce((a, b) => a + b, 0) / xs.length); t.setAttribute('y', top - 30 - up);
        t.setAttribute('text-anchor', 'middle'); t.style.setProperty('--c', T.BRANCHES[bid].color); t.textContent = T.BRANCHES[bid].name; t.dataset.b = bid;
        if (bid !== 'tronc') svg.append(t);
      }
      const gl = document.createElementNS(SVGNS, 'g'), defs = document.createElementNS(SVGNS, 'defs');
      svg.append(defs);
      for (const n of T.NODES) for (const r of n.req) {
        const d = this.linkPath(lay.pos[r], lay.pos[n.id]);
        const cross = T.byId[r].branch !== n.branch;
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
        || ord.indexOf(a.branch) - ord.indexOf(b.branch) || lay.pos[a.id].l - lay.pos[b.id].l || lay.pos[a.id].x - lay.pos[b.id].x);
      for (const n of nodes) {
        const p = lay.pos[n.id], b = document.createElement('button');
        b.type = 'button'; b.className = 'tree-node'; b.dataset.id = n.id;
        if (!n.req.length) b.classList.add('root');
        b.style.left = p.x + 'px'; b.style.top = p.y + 'px'; b.style.setProperty('--c', T.BRANCHES[n.branch].color);
        b.innerHTML = `<i class="led" aria-hidden="true"></i><b>${n.name}</b><span></span>`;
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
        b.querySelector('span').textContent = st === 'owned' ? '✓' : st === 'ready' ? '✦ prêt' : !op ? '' : op.kind === 'reponse' ? '↺ Réponse' : op.d && op.d.kind === 'demande' ? '♪ demande' : '◇ défi';
        const ext = n.req.filter((r) => T.byId[r].branch !== n.branch);
        b.setAttribute('aria-label', `${n.name}, ${T.BRANCHES[n.branch].name}, ${STATE_TXT[st]}`
          + (st === 'ready' ? ', réussi : à toi de l\'ouvrir' : st !== 'owned' && op ? `, s'ouvre par : ${op.text.slice(2)}` : '')
          + (n.req.length && st !== 'owned' ? `, il faut d'abord ${n.req.map((r) => T.status(r) === 'locked' ? 'une pièce cachée' : T.byId[r].name).join(', ')}` : '')
          + (ext.length && st === 'owned' ? `, relié à ${ext.map((r) => T.byId[r].name).join(', ')}` : ''));
      });
      // S9.1: only what is open or can open now is drawn; a link to the dark leaves in fading dots, two dark ends: nothing
      const seen = (id) => this.seen(id), lay = this.treeLayout();
      map.querySelectorAll('.tree-link, .tree-glow').forEach((p) => {
        const f = seen(p.dataset.from), t = seen(p.dataset.to), glow = p.classList.contains('tree-glow');
        const st = !f && !t ? 'gone' : !f || !t ? 'dark' : g.has(p.dataset.to) ? 'owned' : 'available';
        for (const c of ['owned', 'available', 'dark', 'gone']) p.classList.toggle(c, c === st && !(glow && c !== 'gone' && c !== 'dark'));
        if (glow) return;
        const id = `tl-${p.dataset.from}-${p.dataset.to}`.replace(/\./g, '_'), lg = map.querySelector('#' + id);
        if (st === 'dark' && lg) {
          const a = lay.pos[f ? p.dataset.from : p.dataset.to], b = lay.pos[f ? p.dataset.to : p.dataset.from];
          lg.setAttribute('x1', a.x); lg.setAttribute('y1', a.y); lg.setAttribute('x2', b.x); lg.setAttribute('y2', b.y);
          p.style.stroke = `url(#${id})`;
        } else p.style.stroke = '';
      });
      // a branch's name shows once one of its nodes is open
      // (S9.2: right above its highest node in sight, not at the tip of a band still in the dark)
      map.querySelectorAll('.tree-bname').forEach((t) => {
        t.classList.toggle('gone', !T.NODES.some((n) => n.branch === t.dataset.b && g.has(n.id)));
        const ps = T.NODES.filter((n) => n.branch === t.dataset.b && this.seen(n.id)).map((n) => lay.pos[n.id]).filter(Boolean); if (!ps.length) return;
        const top = Math.min(...ps.map((q) => q.y)), xs = ps.filter((q) => q.y === top).map((q) => q.x);
        t.setAttribute('x', xs.reduce((u, v) => u + v, 0) / xs.length); t.setAttribute('y', top - 40);
      });
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
    // opens on the whole map; on a narrow screen (< 560 px) at k ≈ 0.6 centred on the root so labels stay
    // readable (⤢ = whole map, all = true). Remembers the width it was fitted for (resize: refit only if it changes).
    // S9.4: frames what is lit (open and ready nodes, the start of the dotted traces around them), not the dark: at most
    // 1.15, no smaller than 0.45 on a phone (then it pans). Remembers the width it was fitted for (resize: refit only if it changes).
    fitTree() {
      const map = $('#treeDlg .tree-map'); if (!map || !map.clientWidth) return;
      const lay = this.treeLayout(), lim = this.kLimits(), v = this.view;
      this.fitW = window.innerWidth; // (the window's, not the map's: a scrollbar that comes or goes is not a resize)
      const ps = AMB.tree.NODES.filter((n) => this.seen(n.id)).map((n) => lay.pos[n.id]).filter(Boolean);
      if (!ps.length) ps.push(lay.pos.racine || { x: lay.W / 2, y: lay.H });
      const x0 = Math.min(...ps.map((p) => p.x)) - 110, x1 = Math.max(...ps.map((p) => p.x)) + 110;
      const y0 = Math.min(...ps.map((p) => p.y)) - 80, y1 = Math.max(...ps.map((p) => p.y)) + 90;
      v.k = clamp(Math.min(map.clientWidth / (x1 - x0), map.clientHeight / (y1 - y0), 1.15), lay.nar ? Math.max(0.45, lim.min) : lim.min, lim.max);
      v.tx = map.clientWidth / 2 - (x0 + x1) / 2 * v.k;
      v.ty = map.clientHeight / 2 - (y0 + y1) / 2 * v.k;
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
      const now = ops.find((o) => o.d && K.state().active[0] === o.d.id);
      // S6.7: while nodes wait on « ✦ Ouvrir » no challenge runs (contracts.refill): its card says so, not a challenge
      // that cannot come yet
      const wait = g.path && !g.s.ended ? (g.s.ready || []).filter((r) => g.canOpen(r.id)).length : 0;
      const opTxt = (wait && ops.some((o) => o.d) ? [`Ouvre d'abord ce qui est prêt (${wait})`] : []).concat(ops.filter((o) => !(wait && o.d)).map((o) => o.text));
      box.style.setProperty('--c', st === 'ready' ? 'var(--amber)' : br.color);
      const fresh = box.hidden || box.dataset.id !== id; // S7.3: a new card slides in (the same one repainted does not)
      box.dataset.id = id; box.className = `tree-info st-${st}`;
      box.innerHTML = `<p class="ti-h"><b>${n.name}</b> <small>${br.name} · ${STATE_TXT[st]}</small></p>`
        + `<p class="ti-d">${st === 'ready' ? g.txt(n.why) : n.desc}</p>`
        + `<p class="ti-g">Ouvre : ${T.grantsText(id) || '—'}</p>`
        + (n.req.length ? `<p class="ti-r">Il faut d'abord : ${req}</p>` : '')
        + (ops.length ? `<p class="ti-o">Pour l'ouvrir : ${opTxt.map((t) => `<span>${t}</span>`).join(' · ou ')}${now && !wait ? ' <em>(le défi en cours)</em>' : ''}</p>` : '')
        // S4.6: won, waiting for the player: the same « ✦ Ouvrir » as on the LCD (after its prerequisites, for a secret's chain)
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
        if (b.dataset.zoom === 'fit') this.fitTree(); else this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, b.dataset.zoom === 'in' ? 1.3 : 1 / 1.3);
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
