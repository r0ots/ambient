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
    if (!AMB.seq.playing) await AMB.ui.play();
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
      recState.fadeT = setTimeout(() => { recState.fading = true; AMB.engine.fadeOut(fade); }, (mins * 60 - fade) * 1000);
      recState.endT = setTimeout(() => { finishRec(btn); setTimeout(() => AMB.seq.playing && AMB.engine.fadeIn(2), 300); }, mins * 60 * 1000);
    }
    btn.textContent = '■ 0:00';
    if (AMB.bus) AMB.bus.emit('act', 'rec');
  }
  function finishRec(btn) {
    if (!recState) return;
    clearInterval(recState.iv); clearTimeout(recState.fadeT); clearTimeout(recState.endT);
    if (recState.fading && AMB.seq.playing) AMB.engine.fadeIn(2); // stopped during the end fade: bring sound back
    if (AMB.bus) AMB.bus.emit('rec:done', (Date.now() - recState.t0) / 1000); // real duration, however it stopped
    if (recState.fmt === 'wav') download(AMB.engine.stopCapture(), 'wav');
    else if (recorder) recorder.stop();
    recState = null;
    btn.classList.remove('rec'); btn.textContent = '● Rec';
    AMB.ui.toast('Enregistrement téléchargé');
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

  AMB.rec = { toggleRec, setSleep, download, recording: () => !!recState };
})();
