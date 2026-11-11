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
    wrap.title = (sp.hint ? sp.hint + '\n' : '') + 'Glisser verticalement · double-clic : valeur par défaut · Maj : réglage fin';
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
    track.setAttribute('class', 'k-track'); arc.setAttribute('class', 'k-arc'); dot.setAttribute('class', 'k-dot');
    dot.setAttribute('r', '3');
    if (color) arc.style.stroke = color;
    const body = document.createElementNS(svgNS, 'circle');
    body.setAttribute('cx', 30); body.setAttribute('cy', 30); body.setAttribute('r', 17); body.setAttribute('class', 'k-body');
    svg.append(track, arc, body, dot);
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
      arc.setAttribute('d', n > 0.001 ? arcPath(A0, a) : '');
      const [x, y] = polar(a, 13);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      val.textContent = fmt(store.get(key));
      wrap.setAttribute('aria-valuenow', +store.get(key).toFixed(3));
      wrap.setAttribute('aria-valuetext', String(val.textContent));
    }
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
      store.set(key, sp.min + n * (sp.max - sp.min), 'user');
    });
    const end = () => { dragging = false; wrap.classList.remove('active'); };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
    wrap.addEventListener('dblclick', () => store.set(key, sp.def, 'user'));
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const n = Math.max(0, Math.min(1, norm() - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.03)));
      store.set(key, sp.min + n * (sp.max - sp.min), 'user');
    }, { passive: false });
    // keyboard accessibility
    wrap.tabIndex = 0;
    wrap.addEventListener('keydown', (e) => {
      const span = sp.max - sp.min;
      const d = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02, PageUp: 0.1, PageDown: -0.1 }[e.key];
      if (d) { e.preventDefault(); e.stopPropagation(); store.set(key, store.get(key) + d * (e.shiftKey ? 0.25 : 1) * span, 'user'); }
      else if (e.key === 'Home') { e.preventDefault(); store.set(key, sp.min, 'user'); }
      else if (e.key === 'End') { e.preventDefault(); store.set(key, sp.max, 'user'); }
    });
    widgets[key] = { render, el: wrap };
    render();
    return wrap;
  }

  function select(key, sp) {
    const wrap = h('div', 'ctl sel');
    if (sp.hint) wrap.title = sp.hint;
    const s = h('select');
    s.setAttribute('aria-label', `${(AMB.SCHEMA[key.split('.')[0]] || {}).label || ''} · ${sp.label}`);
    sp.options.forEach((o) => { const op = h('option', null, (sp.labels && sp.labels[o]) || o); op.value = o; s.append(op); });
    s.addEventListener('change', () => store.set(key, s.value, 'user'));
    wrap.append(s, h('div', 'k-lab', sp.label));
    widgets[key] = { render: () => { s.value = store.get(key); }, el: wrap };
    widgets[key].render();
    return wrap;
  }

  function textField(key, sp) {
    const wrap = h('div', 'ctl sel txt');
    if (sp.hint) wrap.title = sp.hint;
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
    if (sp.hint) b.title = sp.hint;
    if (color) b.style.setProperty('--c', color);
    b.addEventListener('click', () => store.set(key, !store.get(key), 'user'));
    if (!sp.label) b.setAttribute('aria-label', `${(AMB.SCHEMA[key.split('.')[0]] || {}).label || ''} activé`);
    widgets[key] = { render: () => { const on = !!store.get(key); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }, el: b };
    widgets[key].render();
    return b;
  }

  AMB.dom = { $, h, bind };
  AMB.widgets = { registry: widgets, knob, select, textField, toggle };
})();
