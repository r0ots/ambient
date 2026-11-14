// DOM helpers + parameter widgets (knob, select, text field, toggle) bound to the store
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const $ = (s, el = document) => el.querySelector(s);
  // attach a listener if the element exists (test pages only stub part of the DOM)
  const bind = (sel, ev, fn) => { const el = document.querySelector(sel); if (el) el.addEventListener(ev, fn); };
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  const widgets = {}; // key -> {render()}

  // ---------- Knob ----------
  function knob(key, sp, color) {
    const wrap = h('div', 'ctl knob');
    wrap.dataset.key = key;
    if (sp.hint) wrap.dataset.hint = sp.hint; // S11.6: the neon help bubble (tip, below), not the system's title
    wrap.dataset.how = 'knob';
    const secLabel = (AMB.SCHEMA[key.split('.')[0]] || {}).label || '';
    wrap.setAttribute('role', 'slider');
    wrap.setAttribute('aria-label', `${secLabel} · ${sp.label}`);
    wrap.setAttribute('aria-valuemin', sp.min); wrap.setAttribute('aria-valuemax', sp.max);
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 60 60');
    const track = document.createElementNS(svgNS, 'path');
    const arc = document.createElementNS(svgNS, 'path');
    const dot = document.createElementNS(svgNS, 'circle');
    // S7.1: the needle turns (a group rotated around the centre: it follows with a light spring, css .k-needle); the arc
    // has a glow twin that lights up while the knob is being turned (.knob.active / .turning)
    const needle = document.createElementNS(svgNS, 'g'), glow = document.createElementNS(svgNS, 'path');
    track.setAttribute('class', 'k-track'); arc.setAttribute('class', 'k-arc'); dot.setAttribute('class', 'k-dot');
    needle.setAttribute('class', 'k-needle'); glow.setAttribute('class', 'k-glow');
    dot.setAttribute('r', '2.4'); dot.setAttribute('cx', 30); dot.setAttribute('cy', 18); needle.append(dot);
    if (color) { arc.style.stroke = color; glow.style.stroke = color; }
    const body = document.createElementNS(svgNS, 'circle');
    body.setAttribute('cx', 30); body.setAttribute('cy', 30); body.setAttribute('r', 17); body.setAttribute('class', 'k-body');
    svg.append(track, glow, arc, body, needle);
    const val = h('div', 'k-val');
    const lab = h('div', 'k-lab', sp.label);
    wrap.append(svg, val, lab);

    const A0 = -135, A1 = 135;
    const polar = (a, r = 24) => { const rad = ((a - 90) * Math.PI) / 180; return [30 + r * Math.cos(rad), 30 + r * Math.sin(rad)]; };
    const arcPath = (a0, a1) => {
      const [x0, y0] = polar(a0), [x1, y1] = polar(a1);
      return `M ${x0} ${y0} A 24 24 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
    };
    track.setAttribute('d', arcPath(A0, A1));
    const norm = () => (store.get(key) - sp.min) / (sp.max - sp.min);
    const fmt = (v) => {
      if (sp.fmt) return sp.fmt(v);
      if (sp.unit) return `${Math.round(v)} ${sp.unit}`;
      return Math.round(((v - sp.min) / (sp.max - sp.min)) * 100);
    };
    function render() {
      const n = norm(), a = A0 + (A1 - A0) * n;
      const d = n > 0.001 ? arcPath(A0, a) : '';
      arc.setAttribute('d', d); glow.setAttribute('d', d);
      needle.style.transform = `rotate(${a.toFixed(1)}deg)`;
      if (AMB.motion) AMB.motion.roll(val, fmt(store.get(key))); else val.textContent = fmt(store.get(key));
      wrap.setAttribute('aria-valuenow', +store.get(key).toFixed(3));
      wrap.setAttribute('aria-valuetext', String(val.textContent));
    }
    // S7.1: a change by hand (drag, wheel, keys) — the knob reacts at each notch (squash, glow, sparks off the needle)
    const userSet = (v) => {
      const n0 = norm(); store.set(key, v, 'user'); const n1 = norm();
      if (AMB.motion && n1 !== n0) AMB.motion.turn(wrap, n1 - n0, A0 + (A1 - A0) * n1);
    };
    let startY = 0, startV = 0, dragging = false;
    wrap.addEventListener('pointerdown', (e) => {
      dragging = true; startY = e.clientY; startV = norm();
      wrap.setPointerCapture(e.pointerId); wrap.classList.add('active');
      e.preventDefault();
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const sens = e.shiftKey ? 600 : 160;
      const n = Math.max(0, Math.min(1, startV + (startY - e.clientY) / sens));
      userSet(sp.min + n * (sp.max - sp.min));
    });
    const end = () => { dragging = false; wrap.classList.remove('active'); };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
    wrap.addEventListener('dblclick', () => store.set(key, sp.def, 'user'));
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const n = Math.max(0, Math.min(1, norm() - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.03)));
      userSet(sp.min + n * (sp.max - sp.min));
    }, { passive: false });
    // keyboard accessibility
    wrap.tabIndex = 0;
    wrap.addEventListener('keydown', (e) => {
      const span = sp.max - sp.min;
      const d = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02, PageUp: 0.1, PageDown: -0.1 }[e.key];
      if (d) { e.preventDefault(); e.stopPropagation(); userSet(store.get(key) + d * (e.shiftKey ? 0.25 : 1) * span); }
      else if (e.key === 'Home') { e.preventDefault(); userSet(sp.min); }
      else if (e.key === 'End') { e.preventDefault(); userSet(sp.max); }
    });
    widgets[key] = { render, el: wrap };
    render();
    return wrap;
  }

  function select(key, sp) {
    const wrap = h('div', 'ctl sel');
    wrap.dataset.key = key;
    if (sp.hint) wrap.dataset.hint = sp.hint;
    const s = h('select');
    s.setAttribute('aria-label', `${(AMB.SCHEMA[key.split('.')[0]] || {}).label || ''} · ${sp.label}`);
    sp.options.forEach((o) => { const op = h('option', null, (sp.labels && sp.labels[o]) || o); op.value = o; s.append(op); });
    s.addEventListener('change', () => store.set(key, s.value, 'user'));
    wrap.append(s, h('div', 'k-lab', sp.label));
    neonSelect(s);
    widgets[key] = { render: () => { s.value = store.get(key); }, el: wrap };
    widgets[key].render();
    return wrap;
  }

  function textField(key, sp) {
    const wrap = h('div', 'ctl sel txt');
    wrap.dataset.key = key;
    if (sp.hint) wrap.dataset.hint = sp.hint;
    const inp = h('input'); inp.type = 'text'; inp.placeholder = sp.placeholder || ''; inp.spellcheck = false;
    inp.addEventListener('change', () => store.set(key, inp.value.trim(), 'user'));
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
    wrap.append(inp, h('div', 'k-lab', sp.label));
    widgets[key] = { render: () => { inp.value = store.get(key); }, el: wrap };
    widgets[key].render();
    return wrap;
  }

  function toggle(key, sp, color) {
    const b = h('button', 'tog', sp.label);
    b.dataset.key = key;
    if (sp.hint) b.dataset.hint = sp.hint;
    if (color) b.style.setProperty('--c', color);
    b.addEventListener('click', () => store.set(key, !store.get(key), 'user'));
    if (!sp.label) b.setAttribute('aria-label', `${(AMB.SCHEMA[key.split('.')[0]] || {}).label || ''} activé`);
    widgets[key] = { render: () => { const on = !!store.get(key); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }, el: b };
    widgets[key].render();
    return b;
  }

  // ---------- S9.2 the neon list: ONE component in place of every <select> (no system menu anywhere) ----------
  // The native <select> stays in the page, hidden, as the source of truth (value, options, 'change': the code and the
  // tests keep using it); a button shows its choice and opens a list of neon rows (fixed, over everything). Keyboard:
  // ↑ ↓ (Home / End) move, Entrée / Espace choose, Échap closes (and undoes a timbre being tried), Tab chooses and goes
  // on; a click outside closes; aria: button (haspopup = listbox, expanded) + listbox / option (selected,
  // activedescendant). A timbre (a layer's « wave »): each row tried is heard at once (the layer plays it).
  const NS = new WeakMap();
  const PROTO = {}; ['value', 'selectedIndex'].forEach((k) => { PROTO[k] = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, k); });
  let openSt = null, uid = 0;
  function nsName(sel) {
    const a = sel.getAttribute('aria-label'); if (a) return a;
    const lb = sel.closest('label');
    return lb ? [...lb.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim() : sel.title || '';
  }
  function nsLayer(sel) { const w = sel.closest('.ctl.sel[data-key]'), k = w && w.dataset.key; return k && /\.wave$/.test(k) ? k.split('.')[0] : null; }
  // a timbre tried: the layer plays a note of the key (a chord for the Pad; the Drone is heard as it holds)
  function previewTimbre(layer) {
    const E = AMB.engine, L = AMB.layers && AMB.layers[layer], S = AMB.seq, T = AMB.theory;
    if (!E || !E.ctx || !L || !S || !S.scale || !T || typeof L !== 'object') return;
    const t = E.ctx.currentTime + 0.02, m = (d, o) => T.degreeToMidi(d, S.root, S.scale, o);
    try {
      if (typeof L.playChord === 'function') L.playChord([m(0, 3), m(2, 3), m(4, 3)], t, 1.2);
      else if (layer === 'bass' && L.note) L.note(m(0, 2), t, 0.5);
      else if (L.note) L.note(m(4, 4), t, 0.75, true, 0.5, { bright: null, dest: S.playing || !S.liveDest ? null : S.liveDest(L) });
    } catch (e) { /* a layer that cannot play now: the choice stays */ }
  }
  function neonSelect(sel) {
    if (!sel || NS.has(sel) || sel.multiple || !sel.parentNode) return null;
    const btn = h('button', 'nsel-btn'), val = h('span', 'nsel-val'), car = h('i', 'nsel-car', '▾');
    btn.type = 'button'; car.setAttribute('aria-hidden', 'true'); btn.append(val, car);
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    if (sel.id) btn.dataset.for = sel.id;
    if (sel.title) btn.title = sel.title;
    btn.classList.add(...[...sel.classList]); // (its size rules: .song-bars, .loop-len…)
    sel.classList.add('nsel-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    sel.after(btn);
    const st = { sel, btn, list: null, act: -1, orig: -1, layer: nsLayer(sel) };
    const sync = () => {
      const o = sel.options[PROTO.selectedIndex.get.call(sel)];
      val.textContent = o ? o.textContent : '';
      btn.disabled = sel.disabled;
      btn.setAttribute('aria-label', `${nsName(sel)} : ${val.textContent}`.replace(/^ : /, ''));
      if (st.list) st.list.querySelectorAll('[role=option]').forEach((li) => li.setAttribute('aria-selected', +li.dataset.i === sel.selectedIndex));
    };
    st.sync = sync;
    // set by code (sel.value = …, a list refilled): the button follows
    for (const k of ['value', 'selectedIndex']) Object.defineProperty(sel, k, { configurable: true, get() { return PROTO[k].get.call(this); }, set(v) { PROTO[k].set.call(this, v); sync(); } });
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label'] });
    btn.addEventListener('click', () => (st.list ? nsClose(st) : nsOpen(st)));
    btn.addEventListener('keydown', (e) => { if (!st.list && /^(ArrowDown|ArrowUp)$/.test(e.key)) { e.preventDefault(); e.stopPropagation(); nsOpen(st); } });
    NS.set(sel, st); sel._neon = btn;
    sync();
    return btn;
  }
  function nsOpts(st) { return [...st.list.querySelectorAll('[role=option]:not([aria-disabled=true])')]; }
  function nsOpen(st) {
    const { sel, btn } = st; if (st.list || sel.disabled) return;
    if (openSt) nsClose(openSt, false);
    const ul = h('ul', 'nsel-list'); ul.id = 'nsel-' + ++uid; ul.tabIndex = -1;
    ul.setAttribute('role', 'listbox'); ul.setAttribute('aria-label', nsName(sel));
    const c = getComputedStyle(btn).getPropertyValue('--c').trim(); if (c) ul.style.setProperty('--c', c);
    const add = (o) => {
      const li = h('li', 'nsel-opt', o.textContent); li.id = `${ul.id}-${o.index}`; li.dataset.i = o.index;
      // S11.9: a timbre says what it sounds like, on a second line (the schema's optHints)
      const hs = st.layer && AMB.store && AMB.store.spec(`${st.layer}.wave`), hint = hs && hs.optHints && hs.optHints[o.value];
      if (hint) { li.classList.add('has-hint'); li.append(h('small', 'nsel-hint', hint)); }
      li.setAttribute('role', 'option'); li.setAttribute('aria-selected', o.index === sel.selectedIndex);
      if (o.disabled) li.setAttribute('aria-disabled', 'true');
      ul.append(li);
    };
    for (const ch of sel.children) {
      if (ch.tagName === 'OPTGROUP') { const g = h('li', 'nsel-grp', ch.label); g.setAttribute('role', 'presentation'); ul.append(g); [...ch.children].forEach(add); } else if (ch.tagName === 'OPTION') add(ch);
    }
    document.body.append(ul);
    st.list = ul; st.orig = sel.selectedIndex; openSt = st;
    btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-controls', ul.id); btn.classList.add('open');
    nsPlace(st); nsAct(st, sel.selectedIndex);
    ul.addEventListener('pointermove', (e) => { const li = e.target.closest('[role=option]'); if (li && li.getAttribute('aria-disabled') !== 'true') nsAct(st, +li.dataset.i, false); });
    ul.addEventListener('click', (e) => { const li = e.target.closest('[role=option]'); if (li && li.getAttribute('aria-disabled') !== 'true') { nsChoose(st, +li.dataset.i, true); nsClose(st); } });
    ul.addEventListener('keydown', (e) => nsKey(st, e));
    ul.focus({ preventScroll: true });
    const M = AMB.motion;
    if (M && M.on() && ul.animate) {
      const up = ul.classList.contains('up');
      ul.style.transformOrigin = up ? '50% 100%' : '50% 0';
      ul.animate([{ opacity: 0, transform: `scaleY(${1 - 0.6 * Math.min(1, M.amp())})`, filter: 'brightness(2.2)' }, { opacity: 1, transform: 'none', filter: 'none' }],
        { duration: M.ms('med'), easing: M.EASE.spring });
      M.stagger(ul.children, { y: up ? 6 : -6, max: 10 });
    }
  }
  function nsPlace(st) {
    const r = st.btn.getBoundingClientRect(), ul = st.list, vh = innerHeight, vw = innerWidth, below = vh - r.bottom - 10, above = r.top - 10;
    const up = below < 180 && above > below;
    ul.classList.toggle('up', up);
    ul.style.minWidth = Math.max(140, r.width) + 'px';
    ul.style.maxHeight = Math.max(120, Math.min(420, up ? above : below)) + 'px';
    const w = ul.offsetWidth, left = Math.max(6, Math.min(r.left, vw - w - 6));
    ul.style.left = left + 'px';
    if (up) { ul.style.top = 'auto'; ul.style.bottom = (vh - r.top + 4) + 'px'; } else { ul.style.bottom = 'auto'; ul.style.top = (r.bottom + 4) + 'px'; }
  }
  function nsAct(st, i, scroll = true) {
    const ul = st.list; if (!ul) return;
    const li = ul.querySelector(`[data-i="${i}"]`); st.act = li ? i : -1;
    ul.querySelectorAll('.act').forEach((x) => x.classList.remove('act'));
    if (!li) { ul.removeAttribute('aria-activedescendant'); return; }
    li.classList.add('act'); ul.setAttribute('aria-activedescendant', li.id);
    if (scroll) { const top = li.offsetTop, bot = top + li.offsetHeight; if (top < ul.scrollTop) ul.scrollTop = top; else if (bot > ul.scrollTop + ul.clientHeight) ul.scrollTop = bot - ul.clientHeight; }
  }
  function nsChoose(st, i, hear) {
    const sel = st.sel;
    if (i !== sel.selectedIndex) {
      PROTO.selectedIndex.set.call(sel, i); st.sync();
      sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (hear && st.layer) previewTimbre(st.layer);
  }
  function nsKey(st, e) {
    e.stopPropagation(); // (A–L, Espace…: the list has the keys, not the instrument)
    const o = nsOpts(st), k = o.findIndex((li) => +li.dataset.i === st.act);
    const go = (j) => { const li = o[Math.max(0, Math.min(o.length - 1, j))]; if (!li) return; nsAct(st, +li.dataset.i); if (st.layer) nsChoose(st, +li.dataset.i, true); };
    if (e.key === 'ArrowDown') { e.preventDefault(); go(k + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(k - 1); }
    else if (e.key === 'Home') { e.preventDefault(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); go(o.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (st.act >= 0) nsChoose(st, st.act, !st.layer); nsClose(st); }
    else if (e.key === 'Escape') { e.preventDefault(); if (st.layer && st.sel.selectedIndex !== st.orig) nsChoose(st, st.orig, false); nsClose(st); }
    else if (e.key === 'Tab') { if (st.act >= 0) nsChoose(st, st.act, false); nsClose(st, false); }
  }
  function nsClose(st, focus = true) {
    if (!st || !st.list) return;
    const ul = st.list; st.list = null; if (openSt === st) openSt = null;
    st.btn.setAttribute('aria-expanded', 'false'); st.btn.removeAttribute('aria-controls'); st.btn.classList.remove('open');
    ul.remove();
    if (focus && st.btn.isConnected) st.btn.focus({ preventScroll: true });
  }
  // a click outside, the window resized or scrolled under it: the open list closes (as it is)
  document.addEventListener('pointerdown', (e) => { if (openSt && !openSt.list.contains(e.target) && !openSt.btn.contains(e.target)) nsClose(openSt, false); }, true);
  window.addEventListener('resize', () => openSt && nsClose(openSt, false));
  document.addEventListener('scroll', (e) => { if (openSt && !(e.target instanceof Node && openSt.list.contains(e.target))) nsClose(openSt, false); }, true);
  // every select of the page, now and to come (panels rebuilt, looper, song, scenes)
  function neonAll(root) { if (root.tagName === 'SELECT') neonSelect(root); else if (root.querySelectorAll) root.querySelectorAll('select').forEach(neonSelect); }
  const start = () => {
    neonAll(document);
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) neonAll(n); }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  AMB.dom = { $, h, bind };

  // ---------- S11.6 the help bubble: a control's name and what it does, in plain words ----------
  // A mouse resting DELAY ms on a control (or keyboard focus) shows it; on a touch screen, a tap on the control's NAME
  // (its label under the knob / list) shows it for HOLD ms. One bubble for the whole app (#tip), placed above the
  // control (below when there is no room), never over the pointer. Any press, scroll or Échap hides it.
  const tip = {
    DELAY: 550, HOLD: 4500, el: null, t: 0, cur: null,
    box() {
      if (!this.el) { this.el = h('div', 'tip'); this.el.id = 'tip'; this.el.setAttribute('role', 'tooltip'); this.el.hidden = true; document.body.append(this.el); }
      return this.el;
    },
    text(ctl) {
      const lab = ctl.querySelector('.k-lab'), name = (lab && lab.textContent) || ctl.textContent.trim() || '';
      return { name, hint: ctl.dataset.hint || '', how: ctl.dataset.how === 'knob' && matchMedia('(hover: hover)').matches ? 'Glisse vers le haut ou le bas · double-clic : valeur de départ · Maj : réglage fin' : '' };
    },
    show(ctl, ms) {
      if (!ctl || !ctl.isConnected || !ctl.dataset.hint) return;
      const b = this.box(), t = this.text(ctl);
      b.replaceChildren(h('b', null, t.name), h('span', null, t.hint));
      if (t.how) b.append(h('small', null, t.how));
      const col = getComputedStyle(ctl).getPropertyValue('--c').trim(); if (col) b.style.setProperty('--c', col); else b.style.removeProperty('--c');
      b.hidden = false; this.cur = ctl;
      const r = ctl.getBoundingClientRect(), W = innerWidth, bw = Math.min(280, W - 24); b.style.width = bw + 'px';
      const bh = b.offsetHeight, x = Math.max(12, Math.min(W - bw - 12, r.left + r.width / 2 - bw / 2));
      const y = r.top - bh - 10 >= 8 ? r.top - bh - 10 : r.bottom + 10;
      b.style.left = x + 'px'; b.style.top = y + 'px';
      if (AMB.motion && AMB.motion.on()) AMB.motion.pop(b, 'pop');
      clearTimeout(this.t); if (ms) this.t = setTimeout(() => this.hide(), ms);
    },
    hide() { clearTimeout(this.t); this.cur = null; if (this.el) this.el.hidden = true; },
    wire() {
      const ctlOf = (e) => e.target.closest && e.target.closest('[data-hint]');
      let touch = false;
      document.addEventListener('pointerover', (e) => {
        if (e.pointerType !== 'mouse') return;
        const c = ctlOf(e); if (c === this.cur) return;
        this.hide(); if (c) this.t = setTimeout(() => this.show(c), this.DELAY);
      });
      document.addEventListener('pointerdown', (e) => { touch = e.pointerType !== 'mouse'; if (!(touch && e.target.closest('.k-lab'))) this.hide(); }, true);
      document.addEventListener('click', (e) => { // a touch: the control's name
        if (!touch) return; const lab = e.target.closest && e.target.closest('.k-lab'), c = lab && ctlOf(e);
        if (c) { if (this.cur === c) this.hide(); else this.show(c, this.HOLD); }
      });
      document.addEventListener('focusin', (e) => { const c = ctlOf(e); if (c && e.target.matches(':focus-visible')) { clearTimeout(this.t); this.t = setTimeout(() => this.show(c), this.DELAY); } });
      document.addEventListener('focusout', () => this.hide());
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.hide(); });
      addEventListener('scroll', () => this.hide(), true);
    },
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => tip.wire()); else tip.wire();

  AMB.widgets = { tip, registry: widgets, knob, select, textField, toggle, neonSelect, neonClose: () => nsClose(openSt, false), neonOpen: (sel) => { const s = NS.get(sel); if (s) nsOpen(s); return s && s.list; } };
})();
