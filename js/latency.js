// Global latency calibration (G9b.2): click -> tap offset (median), kept per device (localStorage of this browser)
// AND per input: 'key' (computer keyboard), 'touch' (pads / screen), 'midi' (any MIDI input) and 'midi:<name>' (one
// MIDI keyboard: several inputs can be plugged at once, each keeps its own offset). Used by every rhythm game
// (Réponds en jouant today): a plugin's prepare(api) returns AMB.latency.ensure(api) and its grading subtracts
// AMB.latency.get(src, input) from the tap times. The cabinet's menu has a « ⟲ Latence » button (js/arcade-ui.js)
// that runs run(api, {force: true}) on its own; request() asks for a new one at the next rhythm round.
// Never AMB.store (own localStorage key, under try/catch); the tests drive tick() with an injected clock (manual = true).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const CAL = { n: 8, ms: 600, skip: 2, win: 250, min: 3 }; // 8 clicks at 100 BPM, the first 2 taps are warm-up
  const KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Space'];
  const OLD = 'ambient.reponds.lat.v1'; // v1.00: Réponds kept its own calibration, migrated once
  const NAMES = { key: 'clavier', touch: 'tactile', midi: 'MIDI' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const L = {
    CAL, KEYS,
    data: null,
    force: false, // request(): recalibrate at the next rhythm round
    msg: '', // last result, shown once by the game that ran it
    cur: null, // running calibration {t0, taps, api, resolve, view, timer}
    manual: false, // tests: no interval, they call tick()

    lkey() { return window.AMB_LATENCY_KEY || window.AMB_REPONDS_KEY || 'ambient.latency.v1'; },
    load() {
      if (this.data) return this.data;
      let o = null;
      try { o = JSON.parse(localStorage.getItem(this.lkey())); if (!o && this.lkey() === 'ambient.latency.v1') o = JSON.parse(localStorage.getItem(OLD)); } catch (e) { o = null; }
      this.data = o && o.v === 1 ? { dev: {}, ...o } : { v: 1, dev: {} };
      return this.data;
    },
    save() { try { localStorage.setItem(this.lkey(), JSON.stringify(this.data)); } catch (e) { /* private mode: kept for the session */ } },
    reset() { this.data = null; this.force = false; this.msg = ''; },
    calibrated() { return this.load().any != null; },
    // offset (ms) to subtract from a tap of this input: this MIDI keyboard > this kind of input > the last calibration > 0
    get(src, input) {
      const D = this.load();
      if (input && D.dev[src + ':' + input] != null) return D.dev[src + ':' + input];
      return D[src] != null ? D[src] : D.any != null ? D.any : 0;
    },
    set(src, ms, input) {
      const D = this.load();
      if (src !== 'any') D[src] = ms;
      if (input) D.dev[src + ':' + input] = ms;
      D.any = ms;
      this.save();
    },
    label(src) { return NAMES[src] || src; },
    request() { this.force = true; },
    needs() { return !this.calibrated() || this.force; },

    // taps [{time, src, input?}] against clicks at t0 + k * CAL.ms -> {ms, src, input, n} (median of the busiest input) or null
    measure(taps, t0) {
      const offs = {};
      for (const tp of taps) {
        const k = Math.round((tp.time - t0) / CAL.ms), off = tp.time - (t0 + k * CAL.ms);
        if (k < CAL.skip || k >= CAL.n || Math.abs(off) > CAL.win) continue;
        const id = tp.src + (tp.input ? '\u0000' + tp.input : '');
        (offs[id] = offs[id] || []).push(off);
      }
      const id = Object.keys(offs).sort((x, y) => offs[y].length - offs[x].length)[0];
      if (!id || offs[id].length < CAL.min) return null;
      const v = offs[id].slice().sort((x, y) => x - y), m = v.length >> 1;
      const ms = Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
      const [src, input] = id.split('\u0000');
      return { ms: clamp(ms, -150, 300), src, input: input || null, n: v.length };
    },

    // a rhythm game's prepare(api): calibrates only on the first launch or when asked (request / ⟲)
    ensure(api) { return this.needs() ? this.run(api) : Promise.resolve(null); },
    // the calibration itself, off the clock. api = the prepare api of js/arcade-ui.js
    // ({stage, play, note, stop, now, onKey, onMidi, cancelled}); resolves {ms, src, input, n} or null
    run(api, opts = {}) {
      this.force = false;
      if (this.cur) this.finish(true);
      return new Promise((resolve) => {
        const C = (this.cur = { taps: [], api, resolve, view: null, t0: 0, title: opts.title || 'Calibrage de la latence (hors chrono)' });
        const tap = (time, src, input) => { C.taps.push({ time, src, input }); this.flash(); return true; };
        api.onKey((e) => (KEYS.includes(e.code) ? tap(this.evTime(e, api), 'key') : false));
        api.onMidi((m) => { tap(m.time != null ? m.time : api.now(), 'midi', m.input || null); if (api.note) api.note({ midi: m.midi, voice: 'pluck', dur: 0.2, vel: 0.5 }); });
        if (api.stage) this.view(api.stage, (e) => tap(this.evTime(e, api), 'touch'));
        const ev = [];
        for (let k = 0; k < CAL.n; k++) ev.push({ t: (k * CAL.ms) / 1000, hz: k % 4 ? 1320 : 1760, dur: 0.04, vel: 0.5, voice: 'sine' });
        const res = api.play(ev);
        C.t0 = (res && res.t0) || api.now() + 100;
        if (!this.manual && typeof setInterval === 'function') C.timer = setInterval(() => this.tick(), 30);
        this.tick();
      });
    },
    evTime(e, api) { return e && typeof e.timeStamp === 'number' && e.timeStamp > 0 ? e.timeStamp : api.now(); },
    // advances from the clock; resolves the promise once the 8 clicks are over (or the player left)
    tick() {
      const C = this.cur; if (!C) return null;
      const t = C.api.now(), cancelled = C.api.cancelled && C.api.cancelled();
      if (!cancelled && t <= C.t0 + CAL.n * CAL.ms + 350) {
        const k = clamp(Math.floor((t - C.t0) / CAL.ms) + 1, 0, CAL.n);
        if (C.view) {
          C.view.status.textContent = `${k}/${CAL.n}`;
          C.view.dots.forEach((d, i) => d.classList.toggle('on', i < k));
        }
        return null;
      }
      return this.finish(cancelled);
    },
    finish(cancelled) {
      const C = this.cur; if (!C) return null;
      if (C.timer) clearInterval(C.timer);
      this.cur = null;
      let out = null;
      if (!cancelled) {
        out = this.measure(C.taps, C.t0);
        if (out) { this.set(out.src, out.ms, out.input); this.msg = `Latence ${this.label(out.src)}${out.input ? ' (' + out.input + ')' : ''} : ${out.ms > 0 ? '+' : ''}${out.ms} ms`; }
        else { if (!this.calibrated()) this.set('any', 0); this.msg = 'Pas assez de tapes : latence 0 ms (⟲ pour refaire)'; }
      }
      C.resolve(out);
      return out;
    },
    view(el, onPad) {
      el.innerHTML = `<div class="lat">
        <p class="lat-title">${esc(this.cur.title)}</p>
        <div class="lat-top"><span class="lat-dots">${Array.from({ length: CAL.n }, (_, i) => `<i class="lat-dot${i % 4 ? '' : ' acc'}"></i>`).join('')}</span><b class="lat-status" aria-live="polite">0/${CAL.n}</b></div>
        <p class="lat-hint">Tape pile sur chaque clic : touche A–L ou Espace, clavier MIDI ou le gros bouton</p>
        <button class="lat-pad" type="button">TAPE</button>
      </div>`;
      this.cur.view = { status: el.querySelector('.lat-status'), dots: [...el.querySelectorAll('.lat-dot')], pad: el.querySelector('.lat-pad') };
      this.cur.view.pad.addEventListener('pointerdown', (e) => { e.preventDefault(); onPad(e); });
    },
    flash() {
      const p = this.cur && this.cur.view && this.cur.view.pad; if (!p) return;
      p.classList.remove('on'); void p.offsetWidth; p.classList.add('on');
    },
    // one line for the cabinet's menu button
    summary() {
      if (!this.calibrated()) return 'à calibrer';
      const D = this.load(), part = ['key', 'touch', 'midi'].filter((s) => D[s] != null).map((s) => `${this.label(s)} ${D[s] > 0 ? '+' : ''}${D[s]} ms`);
      return part.length ? part.join(' · ') : `${D.any} ms`;
    },
  };

  AMB.latency = L;
})();
