// UI: knobs, selects, toggles, transport, presets, recording, visualizer
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  const widgets = {}; // key -> {render()}

  // ---------- Knob ----------
  function knob(key, sp, color) {
    const wrap = h('div', 'ctl knob');
    wrap.title = 'Glisser verticalement · double-clic : valeur par défaut · Maj : réglage fin';
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
      if (sp.unit) return `${Math.round(v)} ${sp.unit}`;
      return Math.round(((v - sp.min) / (sp.max - sp.min)) * 100);
    };
    function render() {
      const n = norm(), a = A0 + (A1 - A0) * n;
      arc.setAttribute('d', n > 0.001 ? arcPath(A0, a) : '');
      const [x, y] = polar(a, 13);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      val.textContent = fmt(store.get(key));
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
      const d = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02 }[e.key];
      if (d) { e.preventDefault(); store.set(key, store.get(key) + d * (sp.max - sp.min), 'user'); }
    });
    widgets[key] = { render, el: wrap };
    render();
    return wrap;
  }

  function select(key, sp) {
    const wrap = h('div', 'ctl sel');
    const s = h('select');
    sp.options.forEach((o) => { const op = h('option', null, o); op.value = o; s.append(op); });
    s.addEventListener('change', () => store.set(key, s.value, 'user'));
    wrap.append(s, h('div', 'k-lab', sp.label));
    widgets[key] = { render: () => { s.value = store.get(key); }, el: wrap };
    widgets[key].render();
    return wrap;
  }

  function toggle(key, sp, color) {
    const b = h('button', 'tog', sp.label);
    if (color) b.style.setProperty('--c', color);
    b.addEventListener('click', () => store.set(key, !store.get(key), 'user'));
    widgets[key] = { render: () => b.classList.toggle('on', !!store.get(key)), el: b };
    widgets[key].render();
    return b;
  }

  function section(secKey) {
    const sec = AMB.SCHEMA[secKey];
    const panel = h('section', 'panel');
    panel.dataset.sec = secKey;
    if (sec.color) panel.style.setProperty('--c', sec.color);
    const head = h('header');
    head.append(h('h2', null, sec.label));
    const ctls = h('div', 'ctls');
    for (const [k, sp] of Object.entries(sec.params)) {
      const key = `${secKey}.${k}`;
      if (sp.type === 'toggle' && k === 'on') head.append(toggle(key, { label: '' }, sec.color));
      else if (sp.type === 'toggle') ctls.append(toggle(key, sp, sec.color));
      else if (sp.type === 'select') ctls.append(select(key, sp));
      else ctls.append(knob(key, sp, sec.color));
    }
    panel.append(head, ctls);
    if (secKey === 'grains') {
      const row = h('div', 'sample-row');
      const lbl = h('label', 'btn small', 'Charger un son…');
      const inp = h('input'); inp.type = 'file'; inp.accept = 'audio/*'; inp.hidden = true;
      lbl.append(inp);
      const mic = h('button', 'btn small', '● Micro 8 s');
      const name = h('span', 'sample-name', '');
      inp.addEventListener('change', async () => {
        if (!inp.files[0]) return;
        await ensureStarted();
        try { await AMB.layers.grains.loadFile(inp.files[0]); name.textContent = inp.files[0].name; }
        catch (e) { name.textContent = 'Format non supporté'; console.error(e); }
      });
      mic.addEventListener('click', async () => {
        await ensureStarted();
        try {
          mic.disabled = true; mic.textContent = 'Enregistrement…';
          const buf = await AMB.recordMic(8);
          AMB.layers.grains.setSampleBuffer(buf, 'micro');
          name.textContent = 'micro (' + new Date().toLocaleTimeString() + ')';
        } catch (e) { name.textContent = 'Micro indisponible'; console.error(e); }
        mic.disabled = false; mic.textContent = '● Micro 8 s';
      });
      row.append(lbl, mic, name);
      panel.append(row);
    }
    return panel;
  }

  // ---------- mic capture for the grain sampler ----------
  AMB.recordMic = async function (seconds) {
    const ctx = AMB.engine.ctx;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start();
    await new Promise((r) => setTimeout(r, seconds * 1000));
    rec.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: rec.mimeType });
    return ctx.decodeAudioData(await blob.arrayBuffer());
  };

  // ---------- transport ----------
  let started = false;
  async function ensureStarted() {
    const E = AMB.engine;
    if (!E.ctx) {
      E.init();
      const L = AMB.layers;
      AMB.layers = {
        drone: new L.Drone(), pad: new L.Pad(), bells: new L.Bells(), grains: new L.Grains(), texture: new L.Texture(),
        classes: L,
      };
    }
    if (E.ctx.state !== 'running') await E.ctx.resume();
    unlockMobileAudio();
  }

  // iOS: Web Audio is muted by the silent switch unless the page is in "playback" mode.
  // Safari 17+ exposes navigator.audioSession; older versions need a looping (silent) <audio> element.
  let silentEl = null;
  function unlockMobileAudio() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    if (silentEl || !/iPhone|iPad|iPod/.test(navigator.userAgent)) return;
    const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, n * 2, true);
    silentEl = document.createElement('audio');
    silentEl.src = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    silentEl.loop = true; silentEl.setAttribute('playsinline', '');
    silentEl.play().catch(() => {});
  }

  // Lock-screen / media keys
  function mediaSession() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'Ambient', artist: $('#preset').selectedOptions[0]?.textContent || 'Paysage génératif' });
      navigator.mediaSession.setActionHandler('play', () => play());
      navigator.mediaSession.setActionHandler('pause', () => stop());
      navigator.mediaSession.setActionHandler('stop', () => stop());
    } catch (e) {}
  }

  async function play() {
    await ensureStarted();
    AMB.engine.fadeIn(2);
    AMB.seq.start();
    started = true;
    document.body.classList.add('playing');
    mediaSession();
    $('#play').textContent = '■ Stop';
  }
  function stop() {
    AMB.seq.stop();
    AMB.engine.fadeOut(2.5);
    started = false;
    document.body.classList.remove('playing');
    $('#play').textContent = '▶ Lecture';
  }

  // ---------- presets ----------
  const LS_KEY = 'ambient.userPresets.v1';
  const loadUser = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch (e) { return {}; } };
  const saveUser = (o) => { try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {} };

  function applyPatch(patch) {
    const defaults = {};
    for (const [sec, s] of Object.entries(AMB.SCHEMA))
      for (const [k, p] of Object.entries(s.params)) defaults[`${sec}.${k}`] = p.def;
    // keep master volume
    delete defaults['global.volume'];
    const p = { ...patch }; delete p['global.volume'];
    store.setMany({ ...defaults, ...p }, 'preset');
  }

  function fillPresetSelect() {
    const s = $('#preset');
    s.innerHTML = '';
    const g1 = h('optgroup'); g1.label = 'Usine';
    Object.keys(AMB.PRESETS).forEach((n) => { const o = h('option', null, n); o.value = 'f:' + n; g1.append(o); });
    s.append(g1);
    const user = loadUser();
    if (Object.keys(user).length) {
      const g2 = h('optgroup'); g2.label = 'Mes patchs';
      Object.keys(user).forEach((n) => { const o = h('option', null, n); o.value = 'u:' + n; g2.append(o); });
      s.append(g2);
    }
  }

  function randomize() {
    const r = Math.random;
    const patch = {};
    for (const [sec, s] of Object.entries(AMB.SCHEMA)) {
      for (const [k, sp] of Object.entries(s.params)) {
        const key = `${sec}.${k}`;
        if (key === 'global.volume' || key === 'global.evolve') continue;
        if (sp.type === 'select') patch[key] = sp.options[Math.floor(r() * sp.options.length)];
        else if (sp.type === 'toggle') patch[key] = k === 'on' ? r() > 0.15 : r() > 0.5;
        else {
          // stay in musical ranges: mostly near the default
          const span = sp.max - sp.min;
          const v = sp.def + (r() - 0.5) * span * 0.8;
          patch[key] = Math.max(sp.min, Math.min(sp.max, v));
        }
      }
    }
    patch['global.tempo'] = 40 + Math.round(r() * 50);
    patch['pad.on'] = true;
    store.setMany(patch, 'preset');
  }

  // ---------- recording ----------
  let recorder = null, recChunks = [];
  async function toggleRec(btn) {
    await ensureStarted();
    if (recorder) { recorder.stop(); return; }
    const stream = AMB.engine.recDest.stream;
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 256000 } : undefined);
    recChunks = [];
    recorder.ondataavailable = (e) => e.data.size && recChunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(recChunks, { type: recorder.mimeType });
      const ext = (recorder.mimeType.includes('ogg') ? 'ogg' : recorder.mimeType.includes('mp4') ? 'm4a' : 'webm');
      const a = h('a'); a.href = URL.createObjectURL(blob);
      a.download = `ambient-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
      document.body.append(a); a.click(); a.remove();
      recorder = null; btn.classList.remove('rec'); btn.textContent = '● Rec';
    };
    recorder.start(1000);
    btn.classList.add('rec'); btn.textContent = '■ Rec 0:00';
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (!recorder) return clearInterval(iv);
      const s = Math.floor((Date.now() - t0) / 1000);
      btn.textContent = `■ Rec ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 500);
  }

  // ---------- sleep timer ----------
  let sleepT = null;
  function setSleep(mins, label) {
    clearTimeout(sleepT); sleepT = null;
    label.textContent = '';
    if (!mins) return;
    const end = Date.now() + mins * 60000;
    const fadeSecs = Math.min(120, mins * 60 * 0.25);
    const tick = () => {
      const left = end - Date.now();
      if (!started) { label.textContent = ''; return; }
      if (left <= 0) { stop(); label.textContent = ''; $('#sleep').value = '0'; return; }
      if (left <= fadeSecs * 1000 && !tick.fading) { tick.fading = true; AMB.engine.fadeOut(left / 1000); }
      const m = Math.ceil(left / 60000);
      label.textContent = `${m} min`;
      sleepT = setTimeout(tick, 1000);
    };
    tick();
  }

  // ---------- build ----------
  function build() {
    const grid = $('#layers');
    ['drone', 'pad', 'bells', 'grains', 'texture'].forEach((s) => grid.append(section(s)));
    const top = $('#globals');
    top.append(section('global'), section('fx'));

    store.on((key) => { const w = widgets[key]; if (w) w.render(); });

    $('#play').addEventListener('click', () => (started ? stop() : play()));
    fillPresetSelect();
    $('#preset').addEventListener('change', (e) => {
      const v = e.target.value;
      if (v.startsWith('f:')) applyPatch(AMB.PRESETS[v.slice(2)]);
      else applyPatch(loadUser()[v.slice(2)]);
    });
    $('#save').addEventListener('click', () => {
      const name = prompt('Nom du patch :', 'Mon ambient ' + (Object.keys(loadUser()).length + 1));
      if (!name) return;
      const u = loadUser(); u[name] = store.snapshot(); saveUser(u);
      fillPresetSelect(); $('#preset').value = 'u:' + name;
    });
    $('#dice').addEventListener('click', randomize);
    $('#rec').addEventListener('click', (e) => toggleRec(e.currentTarget));
    $('#sleep').addEventListener('change', (e) => setSleep(Number(e.target.value), $('#sleepLeft')));

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); started ? stop() : play(); }
    });

    $('#bigPlay').addEventListener('click', play);
    $('#share').addEventListener('click', sharePatch);
    loadFromHash();
    window.addEventListener('hashchange', loadFromHash);
    setupHud();
    setupXY($('#viz'));
    AMB.visual.init($('#viz'));
  }

  // ---------- share via URL ----------
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }
  const b64e = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
  function encodePatch() {
    const diff = {};
    for (const [k, v] of Object.entries(store.snapshot())) {
      const sp = store.spec(k);
      if (k === 'global.volume' || v === sp.def) continue;
      diff[k] = typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
    }
    return b64e(JSON.stringify(diff));
  }
  async function sharePatch() {
    const url = location.href.split('#')[0] + '#p=' + encodePatch();
    history.replaceState(null, '', url);
    try { await navigator.clipboard.writeText(url); toast('Lien du patch copié ✓'); }
    catch (e) { toast('Lien dans la barre d\'adresse'); }
  }
  function loadFromHash() {
    const m = location.hash.match(/p=([A-Za-z0-9_-]+)/);
    if (!m) return;
    try { applyPatch(JSON.parse(b64d(m[1]))); toast('Patch chargé depuis le lien'); }
    catch (e) { console.warn('bad patch in URL', e); }
  }

  // ---------- HUD: chord name + position ----------
  function setupHud() {
    const name = $('#chordName'), info = $('#hudInfo');
    AMB.bus.on('chord', (c) => {
      const delay = Math.max(0, (c.time - AMB.engine.ctx.currentTime) * 1000);
      setTimeout(() => { name.textContent = AMB.theory.chordName(c.midis); }, delay);
    });
    const upd = () => {
      const bar = Math.floor(AMB.seq.step / 16) + 1;
      info.textContent = `${store.get('global.key')} ${store.get('global.scale')} · ${Math.round(store.get('global.tempo'))} bpm` +
        (started ? ` · mesure ${bar}` : '');
    };
    store.on(upd); setInterval(upd, 500); upd();
  }

  // ---------- XY performance pad on the visualizer ----------
  const XY_MAP = {
    x: [['pad.tone', 0.08, 0.9], ['bells.tone', 0.05, 1], ['drone.tone', 0.08, 0.7], ['texture.tone', 0.15, 0.85]],
    y: [['bells.density', 0.04, 0.8], ['grains.density', 0.08, 0.9], ['fx.echo', 0.12, 0.55]],
  };
  function setupXY(canvas) {
    let down = false;
    const applyXY = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const y = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      AMB.visual.xy = { x, y, t: performance.now() };
      for (const [k, a, b] of XY_MAP.x) store.set(k, a + (b - a) * x, 'user');
      for (const [k, a, b] of XY_MAP.y) store.set(k, a + (b - a) * y, 'user');
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!started) return;
      down = true; canvas.setPointerCapture(e.pointerId); applyXY(e);
    });
    canvas.addEventListener('pointermove', (e) => { if (down) applyXY(e); });
    const up = () => { down = false; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  }

  AMB.ui = { build, play, stop, ensureStarted, applyPatch, widgets, encodePatch, toast };

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
  }
  document.addEventListener('DOMContentLoaded', build);
})();
