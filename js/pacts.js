// Pacts (G9.8): chosen difficulty à la Hades. Before a round the player ticks pacts on the cartridge; each one
// multiplies the score (total = product, shown on the cartridge and in the HUD). The rules live in the engine
// (js/arcade.js, header « Pacts »); this module holds the definitions, which pacts fit which mini-game, the secret
// pacts found in the path (js/secrets.js hasPact) and the choice remembered per mini-game (and per arcade profile,
// inside the arcade's own storage: never AMB.store). The cartridge chips are drawn here (chipsHTML) for arcade-ui.
//
// Applicability: a pact the mini-game cannot honour is not offered. A plugin may declare `pacts: {id: false|true}`
// (its own word wins); otherwise SKIP below. « Transposé »: the engine shifts every `midi` / `hz` event of the
// stimulus by api.transpose semitones — fine whenever the answer is relative (Plus haut, L'intrus, Qu'est-ce qui
// a bougé) ; pointless where the tonic is already drawn per challenge (Modes, Accordeur) ; wrong where the answer
// is played in a given key (Réponds: a plugin that wants it reads api.transpose and declares pacts.transpose true).
// Records: the score is weighted by the multiplier and records are kept per exact combination of pacts
// (the cartridge shows the record of the combination ticked).
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const DEFS = [
    { id: 'une-ecoute', label: 'Une écoute', mult: 1.2, hint: 'Une seule écoute : pas de Réécouter' },
    { id: 'transpose', label: 'Transposé', mult: 1.15, hint: 'Chaque défi transposé (±1 à 6 demi-tons)' },
    { id: 'proches', label: 'Leurres proches', mult: 1.3, hint: 'Défis servis plus durs : leurres plus proches, écarts plus fins' },
    { id: 'avant-fin', label: 'Avant la fin', mult: 1.25, hint: 'Réponds avant la fin du son, sinon c\'est raté' },
    { id: 'metronome', label: 'Métronome', mult: 1.25, secret: true, hint: 'Pacte secret : 3 s après le son pour répondre' },
    { id: 'silence', label: 'Silence', mult: 1.2, secret: true, hint: 'Pacte secret : ni verdict ni score avant la fin' },
    { id: 'funambule', label: 'Funambule', mult: 1.5, secret: true, hint: 'Pacte secret : une erreur et la manche s\'arrête' },
  ];
  const byId = Object.fromEntries(DEFS.map((p) => [p.id, p]));
  // pacts a mini-game cannot honour (see the header)
  const SKIP = {
    reponds: ['transpose', 'avant-fin', 'metronome', 'silence'], // the answer is played after the call, in its key, and judged on screen
    modes: ['transpose'], accordeur: ['transpose', 'silence'], // tonic already drawn per challenge; the needle shows the verdict
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const pacts = {
    DEFS, byId, SKIP,
    // a secret pact is offered once found in the path (the gift stays whatever the mode)
    owned(id) {
      const p = byId[id]; if (!p) return false;
      if (!p.secret) return true;
      try { return !!(AMB.secrets && AMB.game && AMB.game.s && AMB.secrets.hasPact(id)); } catch (e) { return false; }
    },
    applies(gameId, id) {
      const g = AMB.arcade && AMB.arcade.byId[gameId], own = g && g.pacts && g.pacts[id];
      if (own === false || own === true) return own;
      return !(SKIP[gameId] || []).includes(id);
    },
    available(gameId) { return DEFS.filter((p) => this.applies(gameId, p.id) && this.owned(p.id)); },
    mult(ids) { return Math.round((ids || []).reduce((m, id) => m * (byId[id] ? byId[id].mult : 1), 1) * 100) / 100; },
    fmt(m) { return '×' + m.toFixed(2).replace('.', ','); },

    // ---- the choice, per mini-game (arcade storage, per profile) ----
    chosen(gameId) {
      const A = AMB.arcade; if (!A || !A.byId[gameId]) return [];
      const ok = this.available(gameId).map((p) => p.id);
      return (A.stats(gameId).pacts || []).filter((id) => ok.includes(id));
    },
    set(gameId, ids) {
      const A = AMB.arcade; if (!A || !A.byId[gameId] || A.active) return false;
      const ok = this.available(gameId).map((p) => p.id);
      A.stats(gameId).pacts = DEFS.map((p) => p.id).filter((id) => ids.includes(id) && ok.includes(id));
      A.save();
      return true;
    },
    toggle(gameId, id) {
      const cur = this.chosen(gameId);
      return this.set(gameId, cur.includes(id) ? cur.filter((x) => x !== id) : cur.concat(id));
    },

    // ---- cartridge chips (drawn by js/arcade-ui.js under each cartridge) ----
    chipsHTML(gameId) {
      const av = this.available(gameId); if (!av.length) return '';
      const on = this.chosen(gameId), m = this.mult(on);
      return `<div class="arc-pacts" data-for="${esc(gameId)}" role="group" aria-label="Pactes">
        <span class="arc-pacts-total${on.length ? ' on' : ''}" title="Multiplicateur de score des pactes">PACTES ${this.fmt(m)}</span>
        ${av.map((p) => `<button class="arc-pact${p.secret ? ' secret' : ''}" data-pact="${p.id}" aria-pressed="${on.includes(p.id)}" title="${esc(p.hint)} (score ${this.fmt(p.mult)})">${p.secret ? '✦' : ''}${esc(p.label)} <i>${this.fmt(p.mult)}</i></button>`).join('')}
      </div>`;
    },
    // short summary for the HUD / end screen
    summary(ids) { return ids && ids.length ? `${ids.map((id) => (byId[id] ? byId[id].label : id)).join(' · ')} ${this.fmt(this.mult(ids))}` : ''; },
  };

  AMB.pacts = pacts;
})();
