// UI shell: panels, transport, presets, share, HUD, listening mode (widgets/rec/perform live in their own files)
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const store = AMB.store;
  const { $, h, bind } = AMB.dom;
  const { registry: widgets, knob, select, textField, toggle } = AMB.widgets;
  const { setView, setMode } = AMB.perform;
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
      if (sp.hidden) continue;
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
      const frz = h('button', 'btn small', '❄ Figer le son');
      frz.title = 'Capture les 4 dernières secondes du mix comme source de grains (touche Entrée)';
      frz.addEventListener('click', () => freezeNow(name));
      row.append(lbl, mic, frz, name);
      panel.append(row);
    }
    return panel;
  }

  function freezeNow(nameEl) {
    if (!started) { toast('Lance la lecture avant de figer le son'); return; }
    if (AMB.layers.grains.freeze(4)) {
      toast('❄ Son figé → nuage de grains');
      if (AMB.bus) AMB.bus.emit('act', 'freeze');
      const n = nameEl || document.querySelector('.sample-name');
      if (n) n.textContent = 'figé ' + new Date().toLocaleTimeString();
    } else toast('Rien à figer (silence)');
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
        drone: new L.Drone(), pad: new L.Pad(), bells: new L.Bells(), seq: new L.SeqVoice(), perc: new L.Perc(), bass: new L.Bass(), grains: new L.Grains(), texture: new L.Texture(),
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
      navigator.mediaSession.metadata = new MediaMetadata({ title: 'JunoJuno', artist: $('#preset').selectedOptions[0]?.textContent || 'Paysage génératif' });
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
    if (AMB.song && AMB.song.playing) AMB.song.stop();
    if (AMB.pianoRoll && AMB.pianoRoll.roll.recording) AMB.pianoRoll.roll.stopRecording();
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
    if (AMB.motion && sel) AMB.motion.glitch(sel); // S7.4
  }

  // ---- user patch management ----
  const currentUserPatch = () => { const v = $('#preset') && $('#preset').value; return v && v.startsWith('u:') ? v.slice(2) : null; };
  function updatePatchButtons() {
    const own = !!currentUserPatch();
    ['#renamePatch', '#deletePatch'].forEach((id) => { const b = $(id); if (b) b.disabled = !own; });
  }
  function renamePatch() {
    const old = currentUserPatch(); if (!old) return;
    const name = prompt('Nouveau nom :', old);
    if (!name || name === old) return;
    const u = loadUser();
    if (u[name] && !confirm(`Un paysage « ${name} » existe déjà. Le remplacer ?`)) return;
    u[name] = u[old]; delete u[old]; saveUser(u);
    fillPresetSelect(); $('#preset').value = 'u:' + name; updatePatchButtons();
    toast(`Renommé en « ${name} »`);
  }
  function deletePatch() {
    const name = currentUserPatch(); if (!name) return;
    if (!confirm(`Supprimer définitivement le paysage « ${name} » ?`)) return;
    const u = loadUser(); delete u[name]; saveUser(u);
    fillPresetSelect(); updatePatchButtons();
    toast(`« ${name} » supprimé`);
  }
  function exportPatches() {
    let scenes = null;
    try { scenes = JSON.parse(localStorage.getItem('ambient.scenes.v1')); } catch (e) {}
    const data = { app: 'ambient', version: 1, exported: new Date().toISOString(), patches: loadUser(), scenes, current: store.stableSnapshot(), song: AMB.song ? { sections: AMB.song.sections, loop: AMB.song.loop } : null };
    AMB.rec.download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'json');
    toast(`${Object.keys(data.patches).length} paysage(s) exporté(s)`);
  }
  async function importPatches(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'ambient' || typeof data.patches !== 'object') throw new Error('format');
      const u = loadUser(); let n = 0;
      for (const [name, state] of Object.entries(data.patches)) {
        let nm = name; while (u[nm] && JSON.stringify(u[nm]) !== JSON.stringify(state)) nm += ' (importé)';
        u[nm] = state; n++;
      }
      saveUser(u); fillPresetSelect(); updatePatchButtons();
      if (data.scenes && (data.scenes.A || data.scenes.B) && AMB.scenes) {
        AMB.scenes.A = data.scenes.A; AMB.scenes.B = data.scenes.B; AMB.scenes.save(); AMB.scenes.render();
      }
      if (data.song && Array.isArray(data.song.sections) && AMB.song && (!AMB.song.sections.length || confirm('Remplacer le morceau actuel par celui du fichier ?'))) {
        AMB.song.replace(data.song);
      }
      toast(`${n} paysage(s) importé(s)`);
    } catch (e) { toast('Fichier non reconnu'); console.warn(e); }
  }

  function fillPresetSelect() {
    const s = $('#preset');
    s.innerHTML = '';
    const g1 = h('optgroup'); g1.label = 'Paysages prêts';
    Object.keys(AMB.PRESETS).forEach((n) => { const o = h('option', null, n); o.value = 'f:' + n; g1.append(o); });
    s.append(g1);
    const user = loadUser();
    if (Object.keys(user).length) {
      const g2 = h('optgroup'); g2.label = 'Mes paysages';
      Object.keys(user).forEach((n) => { const o = h('option', null, n); o.value = 'u:' + n; g2.append(o); });
      s.append(g2);
    }
  }

  let lastGenerated = null;
  // "Nouveau paysage": coherent mood-based generation (see generator.js)
  function randomize() {
    const moodSel = $('#mood');
    const mv = moodSel ? moodSel.value : '';
    const { mood, title, patch } = mv === '__day' ? AMB.generator.generateDaily() : AMB.generator.generate(mv);
    applyPatch(patch);
    lastGenerated = patch;
    const s = $('#preset');
    if (s) {
      let g = s.querySelector('optgroup[data-gen]');
      if (!g) { g = h('optgroup'); g.label = 'Généré'; g.dataset.gen = '1'; s.prepend(g); }
      g.innerHTML = '';
      const o = h('option', null, `✦ ${title}`); o.value = 'g:' + title; g.append(o);
      s.value = o.value;
    }
    toast(`✦ ${title} · ${mood}`);
    if (AMB.motion) AMB.motion.landscape($('#dice'), s); // S7.4: the die rolls, the name rolls in, the scene reacts
    if (navigator.mediaSession && navigator.mediaSession.metadata) navigator.mediaSession.metadata.artist = title;
  }

  // ---------- build ----------
  function build() {
    const grid = $('#layers');
    ['drone', 'pad', 'bells', 'grains', 'texture'].forEach((s) => grid.append(section(s)));
    const seqRow = $('#seqrow');
    if (seqRow && AMB.pianoRoll) {
      const sp = section('seq');
      seqRow.append(sp);
      AMB.pianoRoll.roll.build(sp);
    }
    if (seqRow && AMB.chords) AMB.chords.build(seqRow);
    if (seqRow && AMB.song) AMB.song.build(seqRow);
    if (seqRow && AMB.automation) {
      const ap = section('auto');
      seqRow.append(ap);
      AMB.automation.lane.build(ap);
    }
    if (seqRow && AMB.bassSeq) {
      const bp = section('bass');
      seqRow.append(bp);
      AMB.bassSeq.build(bp);
    }
    if (seqRow && AMB.pulses) {
      const pp = section('perc');
      seqRow.append(pp);
      AMB.pulses.build(pp);
    }
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
        b.dataset.key = key;
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
    document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
    // first visit = "Écouter"; returning users get their last mode (old 'ambient.view' mapped)
    let saved = null;
    try { saved = localStorage.getItem('ambient.mode') || ({ simple: 'listen', expert: 'sculpt' })[localStorage.getItem('ambient.view')]; } catch (e) {}
    setMode(saved || 'listen');
    layoutWatch(); // S8.3

    store.on((key) => { const w = widgets[key]; if (w) w.render(); });
    const showCustom = () => { if (widgets['pad.custom']) widgets['pad.custom'].el.style.display = store.get('pad.prog') === 'Perso' ? '' : 'none'; };
    store.on((key) => { if (key === 'pad.prog') showCustom(); });
    showCustom();
    if (AMB.tree) { AMB.tree.tagDom(); AMB.tree.applyLocks(); AMB.tree.pinLocked(); } // Jardin sonore: every control knows its unlock node

    bind('#play', 'click', () => (started ? stop() : play()));
    fillPresetSelect();
    bind('#preset', 'change', (e) => {
      const v = e.target.value;
      if (v.startsWith('f:')) applyPatch(AMB.PRESETS[v.slice(2)]);
      else if (v.startsWith('g:')) { if (lastGenerated) applyPatch(lastGenerated); }
      else if (loadUser()[v.slice(2)]) applyPatch(loadUser()[v.slice(2)]);
    });
    bind('#save', 'click', () => {
      const name = prompt('Nom du paysage :', 'Mon ambient ' + (Object.keys(loadUser()).length + 1));
      if (!name) return;
      saveUserPatch(name, store.stableSnapshot());
      if (AMB.bus) AMB.bus.emit('act', 'save'); // counted only once really saved
    });
    bind('#dice', 'click', randomize);
    bind('#renamePatch', 'click', renamePatch);
    bind('#deletePatch', 'click', deletePatch);
    bind('#exportPatches', 'click', exportPatches);
    bind('#exportMidi', 'click', () => AMB.midiExport && AMB.midiExport.exportMidi());
    bind('#importFile', 'change', (e) => { if (e.target.files[0]) importPatches(e.target.files[0]); e.target.value = ''; });
    bind('#preset', 'change', updatePatchButtons);
    updatePatchButtons();
    bind('#rec', 'click', (e) => toggleRec(e.currentTarget));
    bind('#sleep', 'change', (e) => setSleep(Number(e.target.value), $('#sleepLeft')));

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); started ? stop() : play(); }
      if (e.code === 'Enter' && e.target.tagName !== 'BUTTON') { e.preventDefault(); if (!AMB.tree || AMB.tree.uiUnlocked('freeze')) freezeNow(); }
      if (e.code === 'Escape') { showHelp(false); if (document.body.classList.contains('listen')) setListen(false); }
      if (e.key === '?') { const d = $('#helpDlg'); showHelp(d && d.hidden); }
    });

    bind('#bigPlay', 'click', play);
    bind('#share', 'click', sharePatch);
    const vm = $('#vizMode');
    const vizLabel = (m) => (m === 'Jardin' ? 'Ville' : m); // the city keeps its mode id (stored choices)
    if (vm) { vm.textContent = vizLabel(AMB.visual.mode); vm.addEventListener('click', () => { vm.textContent = vizLabel(AMB.visual.cycleMode()); }); }
    bind('#listen', 'click', toggleListen);
    bind('#help', 'click', () => showHelp(true));
    const more = $('.more');
    if (more) {
      more.querySelectorAll('.menu button').forEach((b) => b.addEventListener('click', () => { more.open = false; }));
      document.addEventListener('click', (e) => { if (more.open && !more.contains(e.target)) more.open = false; });
    }
    const recOpts = $('.rec-opts');
    if (recOpts) document.addEventListener('click', (e) => { if (recOpts.open && !recOpts.contains(e.target)) recOpts.open = false; });
    bind('#helpDlg', 'click', (e) => { const t = e.target.closest && e.target.closest('[data-help-tab]'); if (t) helpTab($('#helpDlg'), t.dataset.helpTab); });
    bind('#helpDlg', 'click', (e) => { if (e.target.id === 'helpDlg' || e.target.hasAttribute('data-close')) showHelp(false); });
    try {
      if (!localStorage.getItem('ambient.seenHelp') && AMB.game && AMB.game.s.mode !== null) { localStorage.setItem('ambient.seenHelp', '1'); setTimeout(() => toast('Première visite ? Appuie sur ? pour l\'aide'), 1200); }
    } catch (e) {}
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) setListen(false); });
    loadFromHash();
    window.addEventListener('hashchange', loadFromHash);
    setupHud();
    AMB.visual.init($('#viz'));

    // kiosk-style URL options: ?viz=Horizon&listen=1&autoplay=1&mood=Nocturne
    const q = new URLSearchParams(location.search);
    const vz = q.get('viz') === 'Ville' && AMB.gardenVisual ? 'Jardin' : q.get('viz'); // S6.7: the city (its mode id) too
    if (vz && (AMB.visual.MODES.includes(vz) || vz === 'Jardin')) { AMB.visual.mode = vz; if (vm) vm.textContent = vizLabel(vz); }
    if (q.get('mood')) { const m = $('#mood'); if (m) m.value = q.get('mood'); randomize(); }
    if (q.get('view')) setView(q.get('view') === 'simple');
    if (q.get('mode')) setMode(q.get('mode'));
    if (q.get('listen')) setListen(true);
    if (q.get('autoplay')) play().catch(() => toast('Clique sur Lecture pour démarrer'));
  }

  // Help: free mode keeps the base help; the Parcours adds its own page, with the base help as a second tab
  function helpTab(d, tab) {
    d.querySelectorAll('[data-help-lvl]').forEach((e) => { e.hidden = e.dataset.helpLvl !== tab; });
    const fr = d.querySelector('.help-free'); if (fr) fr.hidden = tab !== 'basics';
    d.querySelectorAll('[data-help-tab]').forEach((b) => b.classList.toggle('primary', b.dataset.helpTab === tab));
  }
  function showHelp(on) {
    const d = $('#helpDlg'); if (!d) return;
    d.hidden = !on;
    if (!on) return;
    const path = !!(AMB.game && AMB.game.path), hp = d.querySelector('.help-path'), fr = d.querySelector('.help-free');
    if (hp) hp.hidden = !path;
    if (path) helpTab(d, 'path'); else if (fr) fr.hidden = false;
  }

  // ---------- S8.3 layout: the city fills the window, the instrument floats over it ----------
  // The canvas #viz is the whole window (css « S8.3 »: .stage fixed, inset 0); its size changes only with the window
  // (visual.js resize, devicePixelRatio), never with a mode or a drawer. `free` = the part of the city that no floating
  // piece covers (bar, Écouter knobs, pads, drawer), in css px from each edge: --free-t / -r / -b / -l on <html> (the
  // stage's own overlays sit inside it) and AMB.gardenVisual.safe {top, right, bottom, left} = fractions of the window
  // (the city keeps what matters there). A piece taller than half the window is a side drawer, the others are bands.
  function layoutWatch() {
    const de = document.documentElement, P = ['.top', '#macros', '#pads', '.drawer'].map((q) => $(q)).filter(Boolean);
    let raf = 0;
    const measure = () => {
      raf = 0;
      const W = window.innerWidth || 1, H = window.innerHeight || 1, f = { t: 0, r: 0, b: 0, l: 0 };
      for (const e of P) {
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
        if (r.height > H / 2) { if (r.left + r.width / 2 > W / 2) f.r = Math.max(f.r, W - r.left); else f.l = Math.max(f.l, r.right); }
        else if (r.top + r.height / 2 < H / 2) f.t = Math.max(f.t, r.bottom); else f.b = Math.max(f.b, H - r.top);
      }
      for (const k in f) { f[k] = Math.max(0, Math.round(f[k])); de.style.setProperty('--free-' + k, f[k] + 'px'); }
      AMB.layout.free = f;
      if (AMB.gardenVisual) AMB.gardenVisual.safe = { top: f.t / H, right: f.r / W, bottom: f.b / H, left: f.l / W };
    };
    const later = () => { if (!raf) raf = requestAnimationFrame(measure); };
    AMB.layout = { free: { t: 0, r: 0, b: 0, l: 0 }, measure };
    if (window.ResizeObserver) { const ro = new ResizeObserver(later); P.forEach((e) => ro.observe(e)); }
    window.addEventListener('resize', later);
    measure();
  }

  // ---------- listening mode ----------
  function setListen(on) {
    document.body.classList.toggle('listen', on);
    const b = $('#listen'); if (b) b.textContent = on ? '✕ Quitter' : '⤢ Plein écran';
    window.dispatchEvent(new Event('resize'));
  }
  function toggleListen() {
    const on = !document.body.classList.contains('listen');
    setListen(on);
    if (AMB.motion) AMB.motion.scene(); // S7.4
    try {
      if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen();
    } catch (e) {}
  }

  // ---------- share via URL ----------
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    const again = t.classList.contains('show');
    t.textContent = msg; t.classList.add('show'); // S7.1: bounces in, is sucked away (css); a new one over it nudges it
    if (again && AMB.motion) AMB.motion.pop(t, 'nudge');
    // S6.7: long enough to be read (a long sentence vanished before a child got through it)
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), Math.min(6500, Math.max(2200, String(msg).length * 65)));
  }
  const b64e = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64d = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));
  function encodePatch() {
    const diff = {};
    for (const [k, v] of Object.entries(store.stableSnapshot())) {
      const sp = store.spec(k);
      if (k === 'global.volume' || v === sp.def) continue;
      diff[k] = typeof v === 'number' ? Math.round(v * 1000) / 1000 : v;
    }
    return b64e(JSON.stringify(diff));
  }
  async function sharePatch() {
    const url = location.href.split('#')[0] + '#p=' + encodePatch();
    history.replaceState(null, '', url);
    if (AMB.motion) AMB.motion.rainbow($('.more > summary'), { n: 5, speed: 380 }); // S7.4: the link flies off
    try { await navigator.clipboard.writeText(url); toast('Lien du paysage copié ✓'); }
    catch (e) { toast('Lien dans la barre d\'adresse'); }
  }
  function loadFromHash() {
    const m = location.hash.match(/p=([A-Za-z0-9_-]+)/);
    if (!m) return;
    try { applyPatch(JSON.parse(b64d(m[1]))); toast('Paysage chargé depuis le lien'); }
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
      const beat = (60 / Math.max(20, store.get('global.tempo'))).toFixed(3) + 's'; // S7.1: ▶ pulses on the tempo (css --beat)
      if (beat !== upd.beat) { upd.beat = beat; document.documentElement.style.setProperty('--beat', beat); }
      const bar = Math.floor(AMB.seq.step / 16) + 1;
      info.textContent = `${store.get('global.key')} ${store.get('global.scale')} · ${Math.round(store.get('global.tempo'))} bpm` +
        (started ? ` · mesure ${bar}` : '');
    };
    store.on(upd); setInterval(upd, 500); upd();
    // LCD status screen in the top bar
    const top = $('#lcdTop'), line = $('#lcdLine');
    const abbr = (s) => s.split(' ')[0].slice(0, 4).toUpperCase();
    const lcd = () => {
      if (!top || !line) return;
      const sel = $('#preset'), patch = sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent.replace('✦ ', '') : 'JUNOJUNO';
      const rec = document.querySelector('#rec.rec');
      // short game messages (G6.2) take over the top line for a few seconds
      const m = AMB.lcdMsg, on = m && Date.now() < m.until;
      // S4.3: in the path, the jargon (landscape name, key, scale, tempo, chord name) waits for the Tonalité node
      const G = AMB.game, plain = !!(G && G.path && !G.has('h.key'));
      document.body.classList.toggle('jargon-off', plain);
      const txt = on ? m.text.toUpperCase().slice(0, 48) : (plain ? 'JUNOJUNO' : patch.toUpperCase().slice(0, 24)) + (rec ? '  ● REC' : '');
      const lw = top.parentElement ? top.parentElement.clientWidth : 0;
      if (top.textContent !== txt || lw !== top._lw) {
        // S7.1: a new text is typed in (a cursor sweeps it, neon), a resize only re-fits it
        if (top.textContent !== txt && top.textContent && AMB.motion) { if (on && m.stamp) AMB.motion.pop(top, 'm-stamp', { ms: AMB.motion.ms('slow') + 60 }); else AMB.motion.pop(top, 'type'); } // (S7.3: PARFAIT / BIEN / RATÉ stamp in)
        top.textContent = txt; top._lw = lw;
        // S5.7: a game message is never cut (« ENTRE LES TOU… »): too long for the screen, it gets smaller
        top.style.fontSize = '';
        const lcdEl = top.parentElement, room = lcdEl ? lcdEl.clientWidth - 24 : 0;
        if (on && room > 0 && top.scrollWidth > room) top.style.fontSize = Math.max(11, Math.floor(parseFloat(getComputedStyle(top).fontSize) * room / top.scrollWidth)) + 'px';
      }
      const bar = String(Math.floor(AMB.seq.step / 16) + 1).padStart(3, '0');
      const was = line.textContent;
      line.textContent = plain ? (started ? `▶ M${bar}` : '■ STOP') : `${started ? '▶' : '■'} ${store.get('global.key')} ${abbr(store.get('global.scale'))} · ${String(Math.round(store.get('global.tempo'))).padStart(3, '0')} BPM` +
        (started ? ` · ${name.textContent} · M${bar}` : ' · STOP');
      // S7.1: the 2nd line glitches when the sound's state changes (play, key, tempo, chord), not at every bar
      const core = (x) => x.replace(/ ?· ?M\d+$|M\d+$/, '');
      if (was && AMB.motion && core(was) !== core(line.textContent)) AMB.motion.glitch(line);
    };
    setInterval(lcd, 300); lcd();
  }

  AMB.ui = { build, play, stop, ensureStarted, applyPatch, widgets, encodePatch, toast, freezeNow, saveUserPatch, importPatches, exportPatches };

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch((e) => console.warn('SW', e)));
  }
  document.addEventListener('DOMContentLoaded', build);
})();
