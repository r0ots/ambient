// UI: knobs, selects, toggles, transport, presets, recording, visualizer
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
    sp.options.forEach((o) => { const op = h('option', null, (sp.labels && sp.labels[o]) || o); op.value = o; s.append(op); });
    s.addEventListener('change', () => store.set(key, s.value, 'user'));
    wrap.append(s, h('div', 'k-lab', sp.label));
    widgets[key] = { render: () => { s.value = store.get(key); }, el: wrap };
    widgets[key].render();
    return wrap;
  }

  function textField(key, sp) {
    const wrap = h('div', 'ctl sel txt');
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
      else if (sp.type === 'text') ctls.append(textField(key, sp));
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
      const frz = h('button', 'btn small', '❄ Geler la sortie');
      frz.title = 'Capture les 4 dernières secondes du mix comme source de grains (touche Entrée)';
      frz.addEventListener('click', () => freezeNow(name));
      row.append(lbl, mic, frz, name);
      panel.append(row);
    }
    return panel;
  }

  function freezeNow(nameEl) {
    if (!started) { toast('Lance la lecture avant de geler'); return; }
    if (AMB.layers.grains.freeze(4)) {
      toast('❄ Sortie gelée → nuage de grains');
      const n = nameEl || document.querySelector('.sample-name');
      if (n) n.textContent = 'gel ' + new Date().toLocaleTimeString();
    } else toast('Rien à geler (silence)');
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

  function saveUserPatch(name, state) {
    const u = loadUser(); u[name] = state; saveUser(u);
    fillPresetSelect(); const sel = $('#preset'); if (sel) sel.value = 'u:' + name;
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

  // "Nouveau paysage": coherent mood-based generation (see generator.js)
  function randomize() {
    const moodSel = $('#mood');
    const { mood, title, patch } = AMB.generator.generate(moodSel ? moodSel.value : '');
    applyPatch(patch);
    const s = $('#preset');
    if (s) {
      let g = s.querySelector('optgroup[data-gen]');
      if (!g) { g = h('optgroup'); g.label = 'Généré'; g.dataset.gen = '1'; s.prepend(g); }
      g.innerHTML = '';
      const o = h('option', null, `✦ ${title}`); o.value = 'g:' + title; g.append(o);
      s.value = o.value;
    }
    toast(`✦ ${title} · ${mood}`);
    if (navigator.mediaSession && navigator.mediaSession.metadata) navigator.mediaSession.metadata.artist = title;
  }

  // ---------- recording ----------
  let recorder = null, recChunks = [];
  function download(blob, ext) {
    const a = h('a'); a.href = URL.createObjectURL(blob);
    a.download = `ambient-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  let recState = null; // {mode, t0, iv, auto}
  async function toggleRec(btn) {
    await ensureStarted();
    if (recState) return finishRec(btn);
    if (!started) await play();
    const fmt = $('#recFmt').value, mins = Number($('#recDur').value);
    recState = { fmt, t0: Date.now() };
    if (fmt === 'wav') AMB.engine.startCapture();
    else {
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      recorder = new MediaRecorder(AMB.engine.recDest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 256000 } : undefined);
      recChunks = [];
      recorder.ondataavailable = (e) => e.data.size && recChunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(recChunks, { type: recorder.mimeType });
        download(blob, recorder.mimeType.includes('ogg') ? 'ogg' : recorder.mimeType.includes('mp4') ? 'm4a' : 'webm');
        recorder = null;
      };
      recorder.start(1000);
    }
    btn.classList.add('rec');
    recState.iv = setInterval(() => {
      const s = Math.floor((Date.now() - recState.t0) / 1000);
      btn.textContent = `■ ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` + (mins ? ` / ${mins}:00` : '');
      // WAV is held in memory: cap at 30 min (~600 MB) to stay safe
      if (fmt === 'wav' && s >= 1800) finishRec(btn);
    }, 250);
    if (mins) {
      const fade = 5;
      recState.fadeT = setTimeout(() => AMB.engine.fadeOut(fade), (mins * 60 - fade) * 1000);
      recState.endT = setTimeout(() => { finishRec(btn); setTimeout(() => started && AMB.engine.fadeIn(2), 300); }, mins * 60 * 1000);
    }
    btn.textContent = '■ 0:00';
  }
  function finishRec(btn) {
    if (!recState) return;
    clearInterval(recState.iv); clearTimeout(recState.fadeT); clearTimeout(recState.endT);
    if (recState.fmt === 'wav') download(AMB.engine.stopCapture(), 'wav');
    else if (recorder) recorder.stop();
    recState = null;
    btn.classList.remove('rec'); btn.textContent = '● Rec';
    toast('Enregistrement téléchargé');
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
    top.append(section('global'), section('fx'), section('mod'));

    store.on((key) => { const w = widgets[key]; if (w) w.render(); });
    const showCustom = () => { widgets['pad.custom'].el.style.display = store.get('pad.prog') === 'Perso' ? '' : 'none'; };
    store.on((key) => { if (key === 'pad.prog') showCustom(); });
    showCustom();

    bind('#play', 'click', () => (started ? stop() : play()));
    fillPresetSelect();
    bind('#preset', 'change', (e) => {
      const v = e.target.value;
      if (v.startsWith('f:')) applyPatch(AMB.PRESETS[v.slice(2)]);
      else applyPatch(loadUser()[v.slice(2)]);
    });
    bind('#save', 'click', () => {
      const name = prompt('Nom du patch :', 'Mon ambient ' + (Object.keys(loadUser()).length + 1));
      if (!name) return;
      saveUserPatch(name, store.snapshot());
    });
    bind('#dice', 'click', randomize);
    bind('#rec', 'click', (e) => toggleRec(e.currentTarget));
    bind('#sleep', 'change', (e) => setSleep(Number(e.target.value), $('#sleepLeft')));

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); started ? stop() : play(); }
      if (e.code === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); freezeNow(); }
      if (e.code === 'Escape') { showHelp(false); if (document.body.classList.contains('listen')) setListen(false); }
      if (e.key === '?') { const d = $('#helpDlg'); showHelp(d && d.hidden); }
    });

    bind('#bigPlay', 'click', play);
    bind('#share', 'click', sharePatch);
    const vm = $('#vizMode');
    if (vm) { vm.textContent = AMB.visual.mode; vm.addEventListener('click', () => { vm.textContent = AMB.visual.cycleMode(); }); }
    bind('#listen', 'click', toggleListen);
    bind('#help', 'click', () => showHelp(true));
    bind('#helpDlg', 'click', (e) => { if (e.target.id === 'helpDlg' || e.target.hasAttribute('data-close')) showHelp(false); });
    try {
      if (!localStorage.getItem('ambient.seenHelp')) { localStorage.setItem('ambient.seenHelp', '1'); setTimeout(() => toast('Première visite ? Appuie sur ? pour l\'aide'), 1200); }
    } catch (e) {}
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) setListen(false); });
    loadFromHash();
    window.addEventListener('hashchange', loadFromHash);
    setupHud();
    setupXY($('#viz'));
    AMB.visual.init($('#viz'));

    // kiosk-style URL options: ?viz=Horizon&listen=1&autoplay=1&mood=Nocturne
    const q = new URLSearchParams(location.search);
    if (q.get('viz') && AMB.visual.MODES.includes(q.get('viz'))) { AMB.visual.mode = q.get('viz'); if (vm) vm.textContent = AMB.visual.mode; }
    if (q.get('mood')) { const m = $('#mood'); if (m) m.value = q.get('mood'); randomize(); }
    if (q.get('listen')) setListen(true);
    if (q.get('autoplay')) play().catch(() => toast('Clique sur Lecture pour démarrer'));
  }

  function showHelp(on) { const d = $('#helpDlg'); if (d) d.hidden = !on; }

  // ---------- listening mode ----------
  function setListen(on) {
    document.body.classList.toggle('listen', on);
    const b = $('#listen'); if (b) b.textContent = on ? '✕ Quitter' : '⤢ Écoute';
    window.dispatchEvent(new Event('resize'));
  }
  function toggleListen() {
    const on = !document.body.classList.contains('listen');
    setListen(on);
    try {
      if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen();
    } catch (e) {}
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

  AMB.ui = { build, play, stop, ensureStarted, applyPatch, widgets, encodePatch, toast, freezeNow, saveUserPatch };

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
  }
  document.addEventListener('DOMContentLoaded', build);
})();
