// Recording (lossless WAV or compressed, fixed length with fade) and sleep timer
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const { $, h } = AMB.dom;
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
    await AMB.ui.ensureStarted();
    if (recState) return finishRec(btn);
    if (songRec) { AMB.ui.toast('Le morceau est en cours d\'enregistrement'); return; }
    if (!AMB.seq.playing) await AMB.ui.play();
    const fmt = $('#recFmt').value, mins = Number($('#recDur').value);
    recState = { fmt, t0: Date.now(), at: AMB.engine.ctx.currentTime };
    if (fmt === 'wav') AMB.engine.startCapture();
    else {
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
      recorder = new MediaRecorder(AMB.engine.recDest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 256000 } : undefined);
      recChunks = [];
      recorder.ondataavailable = (e) => e.data.size && recChunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(recChunks, { type: recorder.mimeType });
        if (!keep(blob)) download(blob, recorder.mimeType.includes('ogg') ? 'ogg' : recorder.mimeType.includes('mp4') ? 'm4a' : 'webm');
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
      recState.fadeT = setTimeout(() => { recState.fading = true; AMB.engine.fadeOut(fade); }, (mins * 60 - fade) * 1000);
      recState.endT = setTimeout(() => { finishRec(btn); setTimeout(() => AMB.seq.playing && AMB.engine.fadeIn(2), 300); }, mins * 60 * 1000);
    }
    btn.textContent = '■ 0:00';
  }
  function finishRec(btn) {
    if (!recState) return;
    clearInterval(recState.iv); clearTimeout(recState.fadeT); clearTimeout(recState.endT);
    if (recState.fading && AMB.seq.playing) AMB.engine.fadeIn(2); // stopped during the end fade: bring sound back
    if (AMB.bus) AMB.bus.emit('rec:done', (Date.now() - recState.t0) / 1000); // real duration, however it stopped
    // S6.7: when this take is the path's « Enregistre ton morceau » (rec:done just ended it), the finale replays it and
    // offers it (js/garden.js keepSong) instead of a download
    let kept = false;
    if (recState.fmt === 'wav') { const blob = AMB.engine.stopCapture(); kept = keep(blob); if (!kept) api.download(blob, 'wav'); }
    else if (recorder) { kept = !!(AMB.garden && AMB.garden.handing); recorder.stop(); }
    recState = null;
    btn.classList.remove('rec'); btn.textContent = '● Rec';
    AMB.ui.toast(kept ? 'Morceau enregistré' : 'Enregistrement téléchargé');
  }
  const keep = (blob) => !!(AMB.garden && AMB.garden.keepSong && AMB.garden.keepSong(blob));

  // ---------- the song in one gesture (● Rec of the Morceau panel) ----------
  // Plays the song once from its first section into a WAV, then stops by itself. The drone and
  // texture layers never fall silent, so silence detection could wait forever: the ending is a
  // fixed SONG_TAIL fade (the reverb rings into it), like the fade of a timed recording, after
  // which the sound comes back. Every wait runs on the audio clock (the WAV is audio frames).
  // A second click cancels: no file and no rec:done (a cut-off take is not a recording).
  const SONG_TAIL = 2; // seconds (api.SONG_TAIL: a test may shorten it)
  let songRec = null; // {btn, t0, end, iv}
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  async function toggleSongRec(btn) {
    const song = AMB.song;
    if (songRec) return endSongRec(false);
    if (!song.sections.length) return;
    await AMB.ui.ensureStarted();
    if (recState) { AMB.ui.toast('Arrête d\'abord l\'enregistrement en cours (● Rec de la barre)'); return; }
    if (song.playing) song.stop();
    const ctx = AMB.engine.ctx;
    const total = song.sections.reduce((a, s) => a + s.bars, 0) * 16 * AMB.seq.stepDur() + api.SONG_TAIL;
    songRec = { btn, t0: ctx.currentTime, end: null };
    AMB.engine.startCapture();
    song.start((t) => {
      songRec.end = t + api.SONG_TAIL;
      AMB.engine.fadeOut(Math.max(0.1, songRec.end - ctx.currentTime));
    });
    if (!song.playing) { songRec = null; AMB.engine.stopCapture(); return; }
    btn.classList.add('rec');
    songRec.iv = setInterval(() => {
      if (!songRec) return;
      const now = ctx.currentTime;
      btn.textContent = `■ ${clock(now - songRec.t0)} / ${clock(total)}`;
      // the tap hands frames over in blocks: wait one block past the end before closing the file
      if (songRec.end != null) { if (now >= songRec.end + 0.15) endSongRec(true); }
      else if (!song.playing) endSongRec(false); // the song was stopped some other way (■ Stop, ■ Arrêter le morceau)
    }, 100);
    btn.textContent = `■ 0:00 / ${clock(total)}`;
  }
  function endSongRec(complete) {
    const r = songRec; if (!r) return;
    songRec = null;
    clearInterval(r.iv);
    const blob = AMB.engine.stopCapture();
    if (AMB.song.playing) AMB.song.stop();
    if (AMB.seq.playing) AMB.engine.fadeIn(2); // back to the normal sound (after the end fade, or a cancel during it)
    r.btn.classList.remove('rec'); r.btn.textContent = '● Rec';
    AMB.song.render();
    if (!complete) { AMB.ui.toast('Enregistrement du morceau annulé'); return; }
    if (AMB.bus) { AMB.bus.emit('act', 'songRec'); AMB.bus.emit('rec:done', AMB.engine.capturedFrames / AMB.engine.ctx.sampleRate); }
    // the path's finale replays it first, then offers it (js/garden.js keepSong); otherwise it downloads now
    const kept = !!(AMB.garden && AMB.garden.keepSong && AMB.garden.keepSong(blob));
    if (!kept) api.download(blob, 'wav');
    AMB.ui.toast(kept ? 'Morceau enregistré' : 'Morceau enregistré et téléchargé');
  }

  // ---------- sleep timer ----------
  let sleepT = null, sleepFading = false;
  function setSleep(mins, label) {
    clearTimeout(sleepT); sleepT = null;
    label.textContent = '';
    // cancelled or changed during the final fade: restore the volume
    if (sleepFading && AMB.seq.playing) AMB.engine.fadeIn(1.5);
    sleepFading = false;
    if (!mins) return;
    const end = Date.now() + mins * 60000;
    const fadeSecs = Math.min(120, mins * 60 * 0.25);
    const tick = () => {
      const left = end - Date.now();
      if (left <= 0) { if (AMB.seq.playing) AMB.ui.stop(); sleepFading = false; label.textContent = ''; $('#sleep').value = '0'; return; }
      // keeps counting while stopped, so a timer set before pressing play still applies
      if (AMB.seq.playing && left <= fadeSecs * 1000 && !sleepFading) { sleepFading = true; AMB.engine.fadeOut(left / 1000); }
      const m = Math.ceil(left / 60000);
      label.textContent = `${m} min`;
      sleepT = setTimeout(tick, 1000);
    };
    tick();
  }

  const api = (AMB.rec = { toggleRec, toggleSongRec, setSleep, download, SONG_TAIL,
    recording: () => !!(recState || songRec), songRecording: () => !!songRec, songT0: () => (songRec ? songRec.t0 : recState ? recState.at : null) });
})();
