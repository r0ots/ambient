// Player profile UI, placement test (G8.4) and « Jouer 2 min » (G9b.3). Parcours only; free mode never sees any of it.
// - Profile: AMB.game.profile() / isKid() (js/game.js, saved in game.s.profile). Asked once when the Parcours starts
//   (welcome or ⋯ switch), changed from the ⋯ menu (« 👤 Profil »). Synced to the arcade profile (levels and records
//   apart for the kid) ; arcade.kid gives the plugins easy start levels and kid labels.
// - Placement test (musician): one ear test per branch of the tree, reusing the arcade mini-games through the cabinet
//   (arcadeUI.start(id, {d, duration, practice, label, onEnd})). 4 right answers before 2 errors = the branch opens at
//   once (game.unlock(id, 0) in prerequisite order, gates opened like after 6 failed validations, entry nodes of other
//   branches it needs come along). Nothing is paid: no ✧ earned or spent, and the discoveries of those nodes pay 0
//   (game.s.placed). Optional (« Plus tard »), stoppable (Échap: what passed stays open), replayable from the ⋯ menu
//   (only the branches not fully owned yet are tested; it only ever opens).
// - « Jouer 2 min » (kid): one big button chains 4 short rounds of kid games at d = 0 (capped at QUICK.dMax), then a
//   happy end screen.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // branch -> skill -> mini-game (start level d: a musician's ear, well above the kid's level)
  const TESTS = [
    { branch: 'tronc', game: 'accordeur', d: 0.45, skill: 'Justesse' },
    { branch: 'harmonie', game: 'modes', d: 0.5, skill: 'Couleurs des modes' },
    { branch: 'espace', game: 'intrus', d: 0.5, skill: 'Timbre et détail' },
    { branch: 'mouvement', game: 'bouge', d: 0.5, skill: 'Ce qui bouge' },
    { branch: 'composer', game: 'reponds', d: 0.45, skill: 'Rejouer une phrase' },
  ];
  const QUICK = { games: ['hautbas', 'bouge', 'modes', 'intrus'], dur: 25000, dMax: 0.15 };
  const PROFILE_TXT = { musicien: '🎹 Musicien', decouverte: '🌼 Découverte' };

  const P = {
    TESTS, QUICK,
    NEED: 4, MISS: 2, DUR: 40000, // per test: 4 right before 2 errors, 40 s at most
    BETWEEN: 1400, REVEAL_CAP: 5000, // pause between two rounds (banner), cap on the plugin's reveal before ending (tests lower them)
    cur: null, // chained run in progress

    // ---- placement: what a set of passed branches opens (pure: no write) ----
    // the branch's nodes in prerequisite order; a missing prerequisite from another branch comes along only if it is an
    // entry node (needs nothing but owned nodes, e.g. Pad, Mélodie auto); otherwise the node waits (e.g. Morceau needs Progression)
    plan(branches, g = AMB.game) {
      const T = AMB.tree, out = [], has = (id) => g.has(id) || out.includes(id);
      const entry = (id) => { const n = T.byId[id]; return n && n.req.every(has); };
      for (let changed = true; changed;) {
        changed = false;
        for (const n of T.NODES) {
          if (has(n.id) || !branches.includes(n.branch)) continue;
          const miss = n.req.filter((r) => !has(r));
          if (!miss.every((r) => entry(r) && !branches.includes(T.byId[r].branch))) continue;
          out.push(...miss, n.id); changed = true;
        }
      }
      return { nodes: out, extra: out.filter((id) => !branches.includes(T.byId[id].branch)) };
    },
    // open them for real: existing unlock path at cost 0, gates opened without ✧, discoveries unpaid
    apply(branches, g = AMB.game) {
      const T = AMB.tree, pl = this.plan(branches, g);
      g.s.placed = g.s.placed || []; g.s.opened = g.s.opened || [];
      g.quiet = true; // one chime for the whole batch, no end screen in the middle
      try {
        for (const id of pl.nodes) {
          const gate = T.byId[id].gate;
          if (gate && !g.s.puzzles.includes(gate) && !g.s.opened.includes(gate)) { g.s.opened.push(gate); g.emit('opened', { id: gate }); }
          if (!g.s.placed.includes(id)) g.s.placed.push(id);
          g.unlock(id, 0);
        }
      } finally { g.quiet = false; }
      g.s.placement = { at: Date.now(), passed: branches.slice() };
      g.save();
      return pl;
    },
    // tests still worth taking: branches not fully owned, mini-game loaded
    todo(g = AMB.game) {
      const T = AMB.tree, A = AMB.arcade;
      return TESTS.filter((t) => A && A.byId[t.game] && T.NODES.some((n) => n.branch === t.branch && !g.has(n.id)));
    },

    // ---- chained rounds in the arcade cabinet ----
    // steps [{game, label, opts, decide?(tally)}]; hooks.result(step, end, tally) -> {text, good, ...}; hooks.done(results, stopped)
    chain(steps, hooks) {
      const U = AMB.arcadeUI, A = AMB.arcade;
      if (!U || !U.dlg || !A || !steps.length) return false;
      if (U.recording()) { AMB.ui.toast('● Enregistrement en cours : arrête-le d\'abord.'); return false; }
      const run = (this.cur = { steps, i: 0, results: [], tally: null, hooks });
      const finish = (stopped) => {
        if (this.cur !== run) return; this.cur = null;
        if (A.round) A.end({ abort: true });
        U.close();
        hooks.done(run.results, stopped);
      };
      const go = async () => {
        if (this.cur !== run) return;
        if (run.i > 0 && (!A.open || U.screen !== 'play')) return finish(true); // Échap / closed during the banner
        if (run.i >= steps.length) return finish(false);
        const idx = run.i, st = steps[idx], tally = (run.tally = { ok: 0, miss: 0, decided: false, step: st });
        if (!A.open) U.open();
        await U.start(st.game, { ...st.opts, label: st.label, onEnd: (d) => {
          if (this.cur !== run) return;
          if (d.abort && !tally.decided) return finish(true);
          const res = hooks.result(st, d, tally); run.results.push(res);
          this.banner(res.text, res.good);
          run.i++; setTimeout(go, this.BETWEEN);
        } });
        if (this.cur === run && run.i === idx && !A.round) { U.run = null; finish(true); } // left during prepare, or refused
      };
      go();
      return true;
    },
    onAnswer(d) {
      const run = this.cur, t = run && run.tally, A = AMB.arcade;
      if (!t || t.decided || !A.round) return;
      if (d.ok) t.ok++; else t.miss++;
      if (t.step.decide && t.step.decide(t)) {
        t.decided = true;
        setTimeout(() => { if (this.cur === run && A.round) A.end(); }, Math.min(d.reveal || 0, this.REVEAL_CAP));
      }
    },
    banner(text, good) {
      const U = AMB.arcadeUI; if (!U || !U.dlg) return;
      U.el('.arc-choices').innerHTML = '';
      U.el('.arc-stage').innerHTML = `<div class="pf-banner${good ? ' good' : ''}">${esc(text)}</div>`;
    },

    // ---- placement test ----
    startPlacement() {
      const g = AMB.game, T = AMB.tree; if (!g.path) return false;
      const todo = this.todo(), n = todo.length;
      if (!n) { AMB.ui.toast('Toutes les branches sont déjà ouvertes.'); return false; }
      this.show(false);
      const steps = todo.map((t, i) => ({
        ...t, label: `Placement ${i + 1}/${n} · ${T.BRANCHES[t.branch].name}`,
        opts: { d: t.d, duration: this.DUR, practice: true },
        decide: (k) => k.ok >= this.NEED || k.miss >= this.MISS,
      }));
      return this.chain(steps, {
        result: (st, d, k) => {
          const pass = k.ok >= this.NEED, name = T.BRANCHES[st.branch].name;
          return { branch: st.branch, game: st.game, pass, ok: k.ok, miss: k.miss, good: pass, text: pass ? `✓ ${name} s'ouvre` : `${name} : pas cette fois` };
        },
        done: (res, stopped) => this.placementDone(res, stopped),
      });
    },
    placementDone(res, stopped) {
      const passed = res.filter((r) => r.pass).map((r) => r.branch);
      const pl = passed.length ? this.apply(passed) : { nodes: [], extra: [] };
      this.last = { res, stopped, plan: pl };
      if (pl.nodes.length && AMB.garden && AMB.game.path) { AMB.garden.chime('unlock'); AMB.garden.lcd(`✦ ${pl.nodes.length} nœuds ouverts`); }
      this.renderResult();
    },
    renderResult() {
      const T = AMB.tree, A = AMB.arcade, L = this.last; if (!L) return;
      const rows = L.res.map((r) => {
        const b = T.BRANCHES[r.branch], mine = L.plan.nodes.filter((id) => T.byId[id].branch === r.branch);
        const what = r.pass ? `${mine.length} nœud${mine.length > 1 ? 's' : ''} : ${mine.map((id) => T.byId[id].name).join(', ')}` : `${r.ok} juste${r.ok > 1 ? 's' : ''} : à débloquer en jouant`;
        return `<li class="pf-row${r.pass ? ' pass' : ''}" style="--c:${b.color}"><b>${r.pass ? '✓' : '·'} ${esc(b.name)}</b><span class="pf-game">${esc(A.byId[r.game] ? A.byId[r.game].title : r.game)}</span><span class="pf-what">${esc(what)}</span></li>`;
      }).join('');
      const extra = L.plan.extra.length ? `<p class="pf-note">Ouverts aussi, car nécessaires : ${esc(L.plan.extra.map((id) => T.byId[id].name).join(', '))}.</p>` : '';
      const n = L.plan.nodes.length;
      const head = n ? `✦ ${n} nœud${n > 1 ? 's' : ''} ouvert${n > 1 ? 's' : ''}` : L.stopped && !L.res.length ? 'Test arrêté' : 'Rien d\'ouvert cette fois';
      this.render(`<h3>${head}</h3>
        <p>${L.stopped ? 'Test arrêté : ce qui est réussi reste ouvert.' : 'Test de placement terminé.'} Ces nœuds sont à toi sans ✧ : leurs découvertes ne rapportent rien, le reste de l'arbre se gagne en jouant.</p>
        ${L.res.length ? `<ul class="pf-list">${rows}</ul>` : ''}${extra}
        <div class="pf-btns">${n ? '<button class="btn pf-main" data-pf="tree">Voir l\'arbre</button>' : ''}<button class="btn" data-pf="close">Continuer</button><button class="btn" data-pf="retry" title="Refaire le test (seulement les branches pas encore ouvertes)">↻ Refaire</button></div>`, 'pf-result');
    },
    // the opened nodes light up one after the other in the tree (same classes as the G8.5 unlock sequence)
    showOpened(ids) {
      const G = AMB.garden, J = AMB.juice, T = AMB.tree; if (!G) return;
      G.showTree(true);
      if (J && J.reduced) return;
      ids.forEach((id, i) => setTimeout(() => {
        const el = $(`#treeDlg .tree-node[data-id="${id}"]`); if (!el) return;
        el.classList.add('is-born'); if (J) J.burstAt(el, { n: 18, color: T.BRANCHES[T.byId[id].branch].color, kind: 'shard', speed: 200 });
        setTimeout(() => el.classList.remove('is-born'), 900);
      }, 200 + i * 110));
    },

    // ---- « Jouer 2 min » (kid) ----
    startQuick() {
      const A = AMB.arcade, g = AMB.game; if (!g.path || !A) return false;
      const ids = QUICK.games.filter((id) => A.byId[id] && typeof A.byId[id].prepare !== 'function'), n = ids.length;
      const steps = ids.map((id, i) => ({ game: id, label: `Jouer 2 min · ${i + 1}/${n} · ${A.byId[id].title}`, opts: { d: 0, dMax: QUICK.dMax, duration: QUICK.dur, practice: true } }));
      return this.chain(steps, {
        result: (st, d) => ({ game: st.game, stars: d.stars, good: d.good, total: d.total, text: d.good ? `${'★'.repeat(Math.max(1, d.stars))} Bravo ! ${d.good} juste${d.good > 1 ? 's' : ''}` : 'Bien essayé !' }),
        done: (res) => { if (res.length) this.quickDone(res); },
      });
    },
    quickDone(res) {
      const good = res.reduce((s, r) => s + r.good, 0), stars = res.reduce((s, r) => s + Math.max(r.good ? 1 : 0, r.stars), 0);
      this.render(`<h3>🎉 Bravo !</h3>
        <div class="pf-stars" aria-label="${stars} étoiles">${res.map((r, i) => `<i style="animation-delay:${0.2 + i * 0.25}s">${'★'.repeat(Math.max(r.good ? 1 : 0, r.stars)) || '☆'}</i>`).join('')}</div>
        <p class="pf-big">${good} bonne${good > 1 ? 's' : ''} réponse${good > 1 ? 's' : ''} en ${res.length} jeu${res.length > 1 ? 'x' : ''} !</p>
        <div class="pf-btns"><button class="btn pf-main" data-pf="quick">▶ Encore !</button><button class="btn" data-pf="close">Fini</button></div>`, 'pf-joy');
      if (AMB.garden && AMB.game.path) AMB.garden.chime('solve');
      if (AMB.juice) setTimeout(() => AMB.juice.burstAt($('#placeDlg .pf-stars'), { n: 70, color: 'var(--fx-combo)', kind: 'shard', speed: 300 }), 250);
    },

    // ---- dialogs ----
    dlg: null,
    render(html, cls) {
      const d = this.dlg; if (!d) return;
      d.querySelector('.pf-card').className = 'modal-card pf-card ' + (cls || '');
      d.querySelector('.pf-body').innerHTML = html;
      d.hidden = false;
      const f = d.querySelector('.pf-main, [data-pf]'); if (f) f.focus();
    },
    show(on) { if (this.dlg) this.dlg.hidden = !on; },
    profileScreen(first) {
      const cur = AMB.game.s.profile;
      const card = (p, title, txt) => `<button class="welcome-choice pf-choice${cur === p ? ' on' : ''}" data-profile="${p}" aria-pressed="${cur === p}"><b>${title}</b><span>${txt}</span></button>`;
      this.render(`<h3>Qui joue ?</h3>
        <p>Le jeu s'adapte au joueur. Tu pourras changer plus tard (menu ⋯).</p>
        <div class="welcome-choices">
          ${card('musicien', '🎹 Je suis musicien', 'Vrais noms (Ionien, Éolien…), niveaux qui montent vite. Un test d\'oreille de 3 min peut ouvrir d\'un coup les branches que tu maîtrises.')}
          ${card('decouverte', '🌼 Découverte', 'Pas besoin de connaître la musique : jeux faciles, mots simples, et un gros bouton « Jouer 2 min ».')}
        </div>`, 'pf-profile');
      this.first = !!first;
    },
    introScreen() {
      const T = AMB.tree, A = AMB.arcade, todo = this.todo();
      this.render(`<h3>🎹 Test de placement</h3>
        <p>${todo.length} épreuve${todo.length > 1 ? 's' : ''} d'oreille, environ 3 min. Chaque épreuve réussie (${this.NEED} justes avant ${this.MISS} erreurs) ouvre sa branche de l'arbre d'un coup, sans ✧.</p>
        <ul class="pf-list">${todo.map((t) => `<li class="pf-row" style="--c:${T.BRANCHES[t.branch].color}"><b>${esc(T.BRANCHES[t.branch].name)}</b><span class="pf-game">${esc(A.byId[t.game].title)}</span><span class="pf-what">${esc(t.skill)}</span></li>`).join('')}</ul>
        <p class="pf-note">Échap pour arrêter : ce qui est réussi reste ouvert. Refaisable depuis le menu ⋯.</p>
        <div class="pf-btns"><button class="btn pf-main" data-pf="go">Commencer</button><button class="btn" data-pf="close">Plus tard</button></div>`, 'pf-intro');
    },
    onClick(e) {
      const b = e.target.closest('[data-profile], [data-pf]'); if (!b) { if (e.target === this.dlg) this.show(false); return; }
      if (b.dataset.profile) {
        const p = b.dataset.profile; AMB.game.setProfile(p);
        if (p === 'musicien' && this.first && this.todo().length) { this.introScreen(); return; }
        this.show(false); AMB.ui.toast(p === 'decouverte' ? '🌼 Profil Découverte : appuie sur « Jouer 2 min » !' : '🎹 Profil Musicien');
        return;
      }
      const a = b.dataset.pf;
      if (a === 'close') this.show(false);
      else if (a === 'go' || a === 'retry') this.startPlacement();
      else if (a === 'tree') { const ids = this.last ? this.last.plan.nodes : []; this.show(false); this.showOpened(ids); AMB.garden.checkEnd(); }
      else if (a === 'quick') { this.show(false); this.startQuick(); }
    },

    // ---- page wiring ----
    syncArcade() {
      const A = AMB.arcade; if (!A || !AMB.game) return;
      const want = AMB.game.isKid() ? 'decouverte' : 'default';
      if (A.profile !== want) A.setProfile(want);
    },
    paint() {
      const g = AMB.game, path = g.path, kid = g.isKid();
      const pb = $('#profileBtn'); if (pb) { pb.hidden = !path; pb.textContent = `👤 Profil : ${PROFILE_TXT[g.profile()]}`; }
      const tb = $('#placeBtn'); if (tb) tb.hidden = !path || kid;
      const q = $('#quickPlay'); if (q) q.hidden = !path || !kid;
      document.body.classList.toggle('kid', path && kid);
    },
    build() {
      const g = AMB.game; if (!g) return;
      const d = (this.dlg = document.createElement('div'));
      d.id = 'placeDlg'; d.className = 'modal pf'; d.hidden = true;
      d.innerHTML = '<div class="modal-card pf-card" role="dialog" aria-label="Profil et test de placement"><button class="modal-x" data-pf="close" title="Fermer">✕</button><div class="pf-body"></div></div>';
      document.body.append(d);
      d.addEventListener('click', (e) => this.onClick(e));
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !d.hidden) this.show(false); });
      const sw = $('#gameMode');
      if (sw) {
        sw.insertAdjacentHTML('afterend', '<button id="profileBtn" class="btn" title="Qui joue : musicien ou découverte" hidden></button><button id="placeBtn" class="btn" title="Test d\'oreille de 3 min : chaque épreuve réussie ouvre une branche de l\'arbre" hidden>🎹 Test de placement</button>');
        $('#profileBtn').addEventListener('click', () => this.profileScreen(false));
        $('#placeBtn').addEventListener('click', () => this.introScreen());
      }
      const stage = $('.stage');
      if (stage) {
        stage.insertAdjacentHTML('beforeend', '<button id="quickPlay" class="quick-play" hidden>▶ Jouer 2 min</button>');
        $('#quickPlay').addEventListener('click', () => this.startQuick());
      }
      // the Parcours starts (welcome or ⋯ switch, a real click): ask who plays, once
      document.addEventListener('click', (e) => {
        if (!e.target.closest || !e.target.closest('[data-choose="path"], #gameMode')) return;
        setTimeout(() => { if (g.path && g.s.profile == null) this.profileScreen(true); }, 0);
      });
      if (AMB.bus) {
        AMB.bus.on('arcade:answer', (x) => this.onAnswer(x));
        ['profile', 'mode', 'reset'].forEach((ev) => AMB.bus.on('game:' + ev, () => { this.paint(); this.syncArcade(); }));
      }
      this.syncArcade(); this.paint();
    },
  };

  AMB.placement = P;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => P.build()); else P.build();
})();
