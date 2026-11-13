// « Jardin sonore » : the tree screen — a map to look at (G11.1, S4.3: touching a node shows what opens it), the unlock
// sequence (G8.5) when a challenge opens a node, and the reveal of what it opened.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const $ = (s) => document.querySelector(s);
  const SVGNS = 'http://www.w3.org/2000/svg';
  // fan order, left to right: the trunk in the middle, Composer between its two parents
  const FAN = ['espace', 'harmonie', 'tronc', 'composer', 'mouvement'];
  const STATE_TXT = { owned: 'ouvert', available: 'peut s\'ouvrir', locked: 'fermé' };
  const L = { W: 1220, ROW: 98, TOP: 60, BOT: 66, MIN: 94, GAP: 94, A: 46, B: 50, M: 50 };
  const SEQ = { link: 380, end: 1200, reduced: 650 }; // unlock sequence timing (ms)
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
    treeLayout() {
      const T = AMB.tree;
      if (this._lay && this._lay.n === T.NODES.length) return this._lay;
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
      const maxL = Math.max(...Object.values(lvl)), H = L.TOP + maxL * L.ROW + L.BOT, CX = L.W / 2;
      const pos = {};
      for (let l = 0; l <= maxL; l++) {
        const row = [];
        for (const b of order) {
          const sib = T.NODES.filter((n) => n.branch === b && lvl[n.id] === l);
          sib.forEach((n, i) => row.push({ n, want: CX + slot[b] * (L.A + L.B * l) + (i - (sib.length - 1) / 2) * L.GAP }));
        }
        if (!row.length) continue;
        // (rows are built branch by branch in fan order: branches never interleave)
        // sweep: keep a minimum gap, then shift the row back to where it wanted to be, inside the stage
        row.forEach((r, i) => { r.x = i ? Math.max(r.want, row[i - 1].x + L.MIN) : r.want; });
        const shift = row.reduce((s, r) => s + r.want - r.x, 0) / row.length;
        let lo = row[0].x + shift, hi = row[row.length - 1].x + shift, d = shift;
        if (lo < L.M) d += L.M - lo; else if (hi > L.W - L.M) d -= hi - (L.W - L.M);
        lo = row[0].x + d; if (lo < L.M) d += L.M - lo; // too wide: pin to the left edge
        row.forEach((r) => { pos[r.n.id] = { x: Math.round(r.x + d), y: L.TOP + (maxL - l) * L.ROW, l }; });
      }
      // a row too wide for the stage is pinned left and spills right: widen the stage so "see all" really shows all
      const W = Math.max(L.W, ...Object.values(pos).map((p) => p.x + L.M));
      return (this._lay = { n: T.NODES.length, pos, W, H, maxL });
    },
    showTree(on) {
      const d = $('#treeDlg'); if (!d) return;
      if (!on && this.seq) { this.seqFinish(); return; } // closing during the unlock sequence = finish it now
      d.hidden = !on;
      if (this.resetPointers) this.resetPointers(); // no finger left over from the last visit
      if (on) { this.select(null); this.renderTree(); this.fitTree(); if (AMB.secrets) AMB.secrets.render(); }
    },
    // ---- the screen: header (nodes open, secrets) + the map, built once and repainted ----
    renderTree() {
      const map = $('#treeDlg .tree-map'); if (!map) return;
      const T = AMB.tree, g = AMB.game;
      $('#treeDlg .tree-count').textContent = g.s.ended ? '✦ L\'instrument est à toi' : `${T.NODES.filter((n) => g.has(n.id)).length}/${T.NODES.length}`;
      if (!map.querySelector('.tree-stage') || map.dataset.n !== String(T.NODES.length)) this.buildMap(map);
      this.paintTree();
    },
    // what opens a node: its challenge, or a secret (S4.3) — « ◇ Joue 6 notes », « ↺ Réponse « Premier reflet » (3 notes) », « ✦ Secret : ??? »
    openers(id) {
      const K = AMB.contracts, S = AMB.secrets, d = K && K.forNode(id), out = [];
      if (d) out.push({ kind: d.kind === 'reponse' ? 'reponse' : 'défi', d, text: d.kind === 'reponse' ? `↺ Réponse « ${d.title} » (${AMB.puzzles.need(d)} notes)` : `◇ ${d.title}` });
      if (S) for (const [sid, nid] of Object.entries(S.OPENS)) if (nid === id) out.push({ kind: 'secret', text: `✦ Secret : ${S.has(sid) ? S.byId[sid].title : '???'}` });
      return out;
    },
    // the stage: SVG links under absolutely placed LED buttons, in layout units (pan/zoom = one transform)
    buildMap(map) {
      const T = AMB.tree, lay = this.treeLayout();
      map.innerHTML = ''; map.dataset.n = T.NODES.length;
      const stage = document.createElement('div');
      stage.className = 'tree-stage'; stage.style.width = lay.W + 'px'; stage.style.height = lay.H + 'px';
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'tree-links'); svg.setAttribute('viewBox', `0 0 ${lay.W} ${lay.H}`);
      svg.setAttribute('width', lay.W); svg.setAttribute('height', lay.H); svg.setAttribute('aria-hidden', 'true');
      // branch names at the tip of each band
      for (const bid of this.fanOrder()) {
        const ps = T.NODES.filter((n) => n.branch === bid).map((n) => lay.pos[n.id]); if (!ps.length) continue;
        const top = Math.min(...ps.map((p) => p.y)), xs = ps.filter((p) => p.y === top).map((p) => p.x);
        const t = document.createElementNS(SVGNS, 'text');
        t.setAttribute('class', 'tree-bname'); t.setAttribute('x', xs.reduce((a, b) => a + b, 0) / xs.length); t.setAttribute('y', top - 30);
        t.setAttribute('text-anchor', 'middle'); t.style.setProperty('--c', T.BRANCHES[bid].color); t.textContent = T.BRANCHES[bid].name;
        if (bid !== 'tronc') svg.append(t);
      }
      const gl = document.createElementNS(SVGNS, 'g');
      for (const n of T.NODES) for (const r of n.req) {
        const a = lay.pos[r], b = lay.pos[n.id], dy = a.y - b.y;
        const d = `M${a.x} ${a.y}C${a.x} ${a.y - dy * 0.55} ${b.x} ${b.y + dy * 0.45} ${b.x} ${b.y}`;
        const cross = T.byId[r].branch !== n.branch;
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
          + (n.req.length ? `\nDemande : ${n.req.map((r) => T.byId[r].name).join(', ')}` : '')
          + this.openers(n.id).map((o) => `\n${o.text}`).join('');
        stage.append(b);
      }
      map.append(stage);
    },
    // states only (classes, opener line, aria-label): never rebuilds, so the unlock animation survives
    paintTree() {
      const map = $('#treeDlg .tree-map'); if (!map) return;
      const T = AMB.tree, g = AMB.game;
      map.querySelectorAll('.tree-node').forEach((b) => {
        const n = T.byId[b.dataset.id]; if (!n) return;
        const st = T.status(n.id), op = this.openers(n.id)[0];
        for (const s of Object.keys(STATE_TXT)) b.classList.toggle('st-' + s, s === st);
        b.querySelector('span').textContent = st === 'owned' ? '✓' : !op ? '' : op.kind === 'reponse' ? '↺ Réponse' : '◇ défi';
        const ext = n.req.filter((r) => T.byId[r].branch !== n.branch);
        b.setAttribute('aria-label', `${n.name}, ${T.BRANCHES[n.branch].name}, ${STATE_TXT[st]}`
          + (st !== 'owned' && op ? `, s'ouvre par : ${op.text.slice(2)}` : '')
          + (n.req.length && st !== 'owned' ? `, demande ${n.req.map((r) => T.byId[r].name).join(', ')}` : '')
          + (ext.length && st === 'owned' ? `, relié à ${ext.map((r) => T.byId[r].name).join(', ')}` : ''));
      });
      map.querySelectorAll('.tree-link').forEach((p) => {
        const st = g.has(p.dataset.to) ? 'owned' : g.has(p.dataset.from) ? 'available' : 'locked';
        p.classList.toggle('owned', st === 'owned'); p.classList.toggle('available', st === 'available'); p.classList.toggle('locked', st === 'locked');
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
    fitTree(all) {
      const map = $('#treeDlg .tree-map'); if (!map || !map.clientWidth) return;
      const lay = this.treeLayout(), lim = this.kLimits(), v = this.view;
      this.fitW = map.clientWidth;
      v.k = !all && map.clientWidth < 560 ? clamp(0.6, lim.min, lim.max) : Math.min(lim.fit, 1.15);
      const root = lay.pos.racine || { x: lay.W / 2, y: lay.H };
      v.tx = map.clientWidth / 2 - root.x * v.k;
      v.ty = map.clientHeight - (lay.H - L.BOT / 3) * v.k; // root (bottom) in view
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
      if (!n) { box.hidden = true; box.dataset.id = ''; return; }
      const st = T.status(id), br = T.BRANCHES[n.branch], ops = st === 'owned' ? [] : this.openers(id);
      const req = n.req.map((r) => `<span class="${g.has(r) ? 'ok' : ''}">${g.has(r) ? '✓' : '·'} ${T.byId[r].name}</span>`).join(' ');
      const now = ops.find((o) => o.d && K.state().active[0] === o.d.id);
      box.style.setProperty('--c', br.color);
      box.dataset.id = id; box.className = `tree-info st-${st}`;
      box.innerHTML = `<p class="ti-h"><b>${n.name}</b> <small>${br.name} · ${STATE_TXT[st]}</small></p>`
        + `<p class="ti-d">${n.desc}</p>`
        + `<p class="ti-g">Ouvre : ${T.grantsText(id) || '—'}</p>`
        + (n.req.length ? `<p class="ti-r">Demande : ${req}</p>` : '')
        + (ops.length ? `<p class="ti-o">Pour l'ouvrir : ${ops.map((o) => `<span>${o.text}</span>`).join(' · ou ')}${now ? ' <em>(le défi en cours)</em>' : ''}</p>` : '');
      // the card sits in the empty corner opposite to the node (the fan leaves both bottom corners free)
      const map = $('#treeDlg .tree-map'), el = map && map.querySelector(`.tree-node[data-id="${id}"]`);
      if (el && map) { const r = map.getBoundingClientRect(), e = el.getBoundingClientRect(); box.classList.toggle('right', e.left + e.width / 2 < r.left + r.width / 2); }
      box.hidden = false;
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
      map.addEventListener('click', (e) => {
        const b = e.target.closest('.tree-node');
        if (!b) { this.select(null); return; }
        this.select(b.dataset.id);
        const box = $('#treeDlg .tree-info');
        if (box && getComputedStyle(box).position === 'absolute') this.panToNode(b.dataset.id, touchy() ? box.offsetHeight + 8 : 0);
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
      window.addEventListener('resize', () => { if (!dlg || dlg.hidden) return; if (map.clientWidth !== this.fitW) this.fitTree(); else this.applyView(); });
    },

    // ---- unlock sequence (G8.5): a challenge just opened a node ----
    // ~1.2 s on the map: the parent→node links light up, the node is born (chime), newly reachable children blink, then the
    // tree closes and reveal() shows what opened. Reduced motion: final state + chime at once, short pause, close.
    seq: null,
    unlockSeq(id) {
      if (this.seq) this.seqFinish();
      const dlg = $('#treeDlg');
      if (dlg && dlg.hidden && !this.reduced) this.showTree(true);
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
      document.querySelectorAll(`#treeDlg .tree-glow[data-to="${id}"]`).forEach((p) => { p.classList.remove('lit'); void p.getBoundingClientRect(); p.classList.add('lit'); });
      // S4.5w: the impact (chime) falls on the strong beat the opening waits for (beat(), garden.js)
      const b = this.beatOf(id), ctx = AMB.engine && AMB.engine.ctx;
      const hit = b.at != null && ctx ? Math.max(SEQ.link, (b.at - ctx.currentTime) * 1000 - 60) : SEQ.link;
      s.t.push(setTimeout(() => this.seqImpact(), hit));
      s.t.push(setTimeout(() => this.seqFinish(), hit + SEQ.end - SEQ.link));
    },
    seqImpact() {
      const s = this.seq; if (!s || s.hit) return; s.hit = true;
      const T = AMB.tree;
      this.chime('unlock', this.beatOf(s.id));
      this.paintTree();
      const el = document.querySelector(`#treeDlg .tree-node[data-id="${s.id}"]`);
      if (!el || this.reduced) return;
      el.classList.remove('is-buying'); el.classList.add('is-born');
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
      this.reveal(s.id);
    },
    // show what a node just opened: go to the right mode, scroll to it, make it glow for a while
    revealTargets(id) {
      const n = AMB.tree.byId[id]; if (!n) return [];
      const els = [...document.querySelectorAll(`[data-node="${id}"]`)];
      for (const u of n.ui) document.querySelectorAll(`[data-ui="${u}"]`).forEach((e) => { if (!els.includes(e)) els.push(e); });
      return els.filter((e) => !e.closest('.is-locked') && !e.closest('.menu') && !e.matches('.stage .hint')); // the keys line just appears
    },
    reveal(id) {
      const els = this.revealTargets(id); if (!els.length) return;
      // prefer the full panel over the Écouter shortcuts (layer chips, macros)
      const first = els.find((e) => !e.closest('.macros')) || els[0];
      const want = first.closest('.seqrow') ? 'compose' : first.closest('.globals, .layers, #scenes, #journal') ? 'sculpt' : first.closest('.macros') ? 'listen' : null;
      if (want && AMB.mode !== want && AMB.perform) AMB.perform.setMode(want);
      els.forEach((e) => { e.classList.remove('is-new'); void e.offsetWidth; e.classList.add('is-new'); });
      setTimeout(() => els.forEach((e) => e.classList.remove('is-new')), 6000);
      try { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { first.scrollIntoView(); }
    },

  });
})();
