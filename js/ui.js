// UI shell: panels, transport, presets, share, HUD, listening mode (widgets/rec/perform live in their own files)
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const { $, h, bind } = AMB.dom;
  const { registry: widgets, knob, select, textField, toggle } = AMB.widgets;
  const { setView, setupXY } = AMB.perform;
  const { toggleRec, setSleep } = AMB.rec;

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
    const mv = moodSel ? moodSel.value : '';
    const { mood, title, patch } = mv === '__day' ? AMB.generator.generateDaily() : AMB.generator.generate(mv);
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

  // ---------- build ----------
  function build() {
    const grid = $('#layers');
    ['drone', 'pad', 'bells', 'grains', 'texture'].forEach((s) => grid.append(section(s)));
    const top = $('#globals');
    top.append(section('global'), section('fx'), section('mod'));
    const mac = $('#macros');
    if (mac) {
      mac.append(section('macro'));
      // layer on/off chips so the simple view can still shape the arrangement
      const chips = h('div', 'layer-chips');
      for (const l of ['drone', 'pad', 'bells', 'grains', 'texture']) {
        const sp = AMB.SCHEMA[l];
        // own button (not toggle()) so the expert panel's widget registration is untouched
        const b = h('button', 'tog', sp.label); b.style.setProperty('--c', sp.color);
        const key = `${l}.on`;
        const r = () => b.classList.toggle('on', !!store.get(key));
        b.addEventListener('click', () => store.set(key, !store.get(key), 'user'));
        store.on((k) => { if (k === key) r(); }); r();
        chips.append(b);
      }
      mac.querySelector('.panel').append(chips);
    }
    // reference pitch
    const applyTuning = () => {
      AMB.theory.A4 = store.get('global.tuning') === '432 Hz' ? 432 : 440;
      if (AMB.layers.drone && AMB.layers.drone.setRoot) AMB.layers.drone.setRoot(AMB.layers.drone.root, AMB.engine.ctx.currentTime);
    };
    store.on((k) => { if (k === 'global.tuning') applyTuning(); });
    AMB.theory.A4 = store.get('global.tuning') === '432 Hz' ? 432 : 440;
    bind('#viewMode', 'click', () => setView(!document.body.classList.contains('simple')));
    try { setView(localStorage.getItem('ambient.view') === 'simple'); } catch (e) {}

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
    const more = $('.more');
    if (more) {
      more.querySelectorAll('.menu button').forEach((b) => b.addEventListener('click', () => { more.open = false; }));
      document.addEventListener('click', (e) => { if (more.open && !more.contains(e.target)) more.open = false; });
    }
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
    if (q.get('view')) setView(q.get('view') === 'simple');
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

  AMB.ui = { build, play, stop, ensureStarted, applyPatch, widgets, encodePatch, toast, freezeNow, saveUserPatch };

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
  }
  document.addEventListener('DOMContentLoaded', build);
})();
