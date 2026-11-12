// Arcade demo mini-game (G9.1): « Plus haut ou plus bas ? » — two notes, is the second one higher?
// The gap shrinks with the difficulty d: a fifth (700 cents) at d = 0, 15 cents at d = 1.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  if (!AMB.arcade) return;
  AMB.arcade.register({
    id: 'hautbas',
    title: 'Plus haut ou plus bas ?',
    skill: 'hauteur',
    blurb: 'Deux notes : la deuxième est-elle plus haute ou plus basse ?',
    kid: true,
    gap(d) { return Math.round(15 + 685 * Math.pow(1 - Math.max(0, Math.min(1, d)), 2)); },
    make(rng, d) {
      const up = rng() < 0.5, gap = this.gap(d);
      return { base: 55 + rng.int(14), cents: up ? gap : -gap, answer: up ? 'up' : 'down', d };
    },
    stimulus(ch) {
      return [
        { t: 0, midi: ch.base, dur: 0.6, vel: 0.8, voice: 'triangle' },
        { t: 0.8, midi: ch.base, cents: ch.cents, dur: 0.6, vel: 0.8, voice: 'triangle' },
      ];
    },
    choices() { return [{ value: 'up', label: '⬆ Plus haut' }, { value: 'down', label: '⬇ Plus bas' }]; },
    check(ch, a) { return { ok: a === ch.answer }; },
  });
})();
