// Arcade mini-game « Accordeur » (G9.7): reference tone, then a test tone — higher, lower or in tune?
// Gap in cents shrinks with the difficulty d: ±50 cents at d = 0 down to ±2 cents at d = 1 (log scale).
// "In tune" = exactly 0 cent, about 20 % of the challenges (rarer on the easiest levels).
// The reference pitch is never on the 440 Hz grid (random offset of ±40 cents): no absolute pitch, no tuning-fork anchor.
// Pure sines (stable timbre, no overtones to mislead). A tuner needle shows the real gap AFTER the answer
// (reveal = 1600 ms: the engine waits that long before the next challenge).
// At fine levels (d >= 0.5) a "beats" button plays both tones together (beats = |gap| Hz-ish, no beats = in tune).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  if (!AMB.arcade) return;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MAX = 50, MIN = 2, BEATS_FROM = 0.5;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (c) => (c === 0 ? 'JUSTE' : (c > 0 ? '+' : '−') + Math.abs(Math.round(c * 10) / 10).toString().replace('.', ',') + ' cents');
  const cur = { ch: null, el: null }; // challenge currently drawn in the stage

  const G = {
    id: 'accordeur',
    title: 'Accordeur',
    skill: 'hauteur',
    blurb: 'Une note de référence, puis une autre : plus haute, plus basse ou juste ? Écart de 50 à 2 cents.',
    kid: false,
    reveal: 1600,
    MAX, MIN, BEATS_FROM,
    // smallest gap (cents) at difficulty d: 50 at d = 0, 2 at d = 1, geometric in between
    threshold(d) { return MAX * Math.pow(MIN / MAX, clamp(+d || 0, 0, 1)); },
    // probability of an in-tune challenge: 8 % on the easiest level, 20 % from d = 0.5
    pJuste(d) { return 0.08 + 0.12 * clamp((+d || 0) / 0.5, 0, 1); },
    hz(midi, cents) { return 440 * Math.pow(2, (midi - 69) / 12 + (cents || 0) / 1200); },
    make(rng, d) {
      d = clamp(+d || 0, 0, 1);
      const juste = rng() < this.pJuste(d);
      const sign = rng() < 0.5 ? 1 : -1;
      const mag = Math.min(MAX, this.threshold(d) * (1 + 0.6 * rng()));
      const cents = juste ? 0 : sign * Math.round(mag * 10) / 10;
      const midi = 52 + rng.int(25), off = Math.round((rng() * 80 - 40) * 10) / 10;
      const f1 = this.hz(midi, off), f2 = f1 * Math.pow(2, cents / 1200);
      return { midi, off, cents, f1, f2, answer: cents === 0 ? 'ok' : cents > 0 ? 'up' : 'down', d };
    },
    stimulus(ch) {
      return [
        { t: 0, hz: ch.f1, dur: 1.0, vel: 0.7, voice: 'sine' },
        { t: 1.3, hz: ch.f2, dur: 1.0, vel: 0.7, voice: 'sine' },
      ];
    },
    beats(ch, api) { // both tones together, no stimulus count
      api.stop();
      return api.play([{ t: 0, hz: ch.f1, dur: 2.6, vel: 0.5, voice: 'sine' }, { t: 0, hz: ch.f2, dur: 2.6, vel: 0.5, voice: 'sine' }]);
    },
    choices() { return [{ value: 'up', label: '⬆ Haut' }, { value: 'down', label: '⬇ Bas' }, { value: 'ok', label: '＝ Juste' }]; },
    check(ch, a) { return { ok: a === ch.answer }; },
    onKey(ch, e, api) {
      const v = { ArrowUp: 'up', ArrowDown: 'down', Space: 'ok', Equal: 'ok', NumpadEqual: 'ok', NumpadAdd: 'ok' }[e.code];
      if (v) { api.answer(v); return true; }
      if (e.code === 'KeyB' && ch.d >= BEATS_FROM) { G.beats(ch, api); return true; }
      return false;
    },
    // needle angle (deg) for a gap in cents: -60..+60
    angle(c) { return clamp(c, -MAX, MAX) / MAX * 60; },
    render(ch, el, api) {
      let ticks = '';
      for (let c = -50; c <= 50; c += 10) {
        const a = (G.angle(c) - 90) * Math.PI / 180, r1 = c % 50 === 0 || c === 0 ? 78 : 84;
        ticks += `<line x1="${(100 + 90 * Math.cos(a)).toFixed(1)}" y1="${(100 + 90 * Math.sin(a)).toFixed(1)}" x2="${(100 + r1 * Math.cos(a)).toFixed(1)}" y2="${(100 + r1 * Math.sin(a)).toFixed(1)}"/>`;
      }
      el.innerHTML = `<div class="arc-accordeur-box"><svg class="arc-accordeur-gauge" viewBox="0 0 200 110" aria-hidden="true">${ticks}`
        + '<g class="arc-accordeur-needle" style="transform:rotate(0deg)"><line x1="100" y1="100" x2="100" y2="22"/><circle cx="100" cy="100" r="5"/></g></svg>'
        + '<div class="arc-accordeur-read">Écoute la référence, puis le test</div>'
        + (ch.d >= BEATS_FROM ? '<button type="button" class="arc-accordeur-beats"><kbd>B</kbd> battements</button>' : '')
        + '</div>';
      const b = el.querySelector('.arc-accordeur-beats');
      if (b) b.addEventListener('click', () => G.beats(ch, api));
      cur.ch = ch; cur.el = el;
    },
    // after the answer: the needle swings to the real gap
    showGap(ch, el, picked) {
      const box = el && el.querySelector('.arc-accordeur-box'); if (!box) return;
      box.classList.add('shown', ch.cents === 0 ? 'in-tune' : 'off');
      const n = box.querySelector('.arc-accordeur-needle'); if (n) n.style.transform = `rotate(${G.angle(ch.cents)}deg)`;
      const r = box.querySelector('.arc-accordeur-read');
      if (r) r.textContent = ch.cents === 0 ? 'JUSTE : 0 cent' : `${fmt(ch.cents)} : le test était ${ch.cents > 0 ? 'plus haut' : 'plus bas'}`;
    },
  };
  if (AMB.bus) AMB.bus.on('arcade:answer', (d) => { if (d && d.ch && cur.ch === d.ch && cur.el) G.showGap(d.ch, cur.el, d.answer); });
  AMB.arcade.register(G);
})();
