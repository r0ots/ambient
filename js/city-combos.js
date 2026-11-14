// S8.7 « Combos énormes »: two (or three) knobs pushed together into a zone (Nature high + Lumière low…) = a COMBO.
// The arcade grammar, the same in the Parcours and in free mode (it is the instrument):
//   1. a knob of the zone moved by hand (source user, or its parameters by a MIDI CC) puts the set inside the zone:
//      « COMBO ×2 » (×3 for three knobs) in arcade neon (garden.FX `combo`, the one juice table; free mode included);
//   2. HOLDING the position fills a CHARGE gauge drawn in the city (the arcade meter under the HUD) while the energy
//      builds in the city itself: crackling arcs between the roofs, the light (bloom) rising, the camera trembling, the
//      combo's own picture growing. The music counts: notes played (the player's, the Mélodie's), forced chords fill it
//      faster (BOOST);
//   3. full: « SUPER ! » on the next HEARD beat (garden.FX `super`; the first time it is a discovery, js/discoveries.js),
//      and the combo's effect plays at full size for SUPER_BEATS beats, its story timed on the beats; held on, it charges
//      again (sustain); let go before the end of the charge = the partial effect falls back.
// Each combo transforms the WHOLE screen through the world (dimensions wrapped with gv.addDim: power, traffic, camera,
// weather, fog) and AMB.cityGL (warp, wire, bloom, fog, flash, shake), plus its own layers (sky, behind the towers, ground,
// in front, HUD). Buildings never deform. The table COMBOS is THE table of the combos: js/discoveries.js reads it (names,
// hints, nodes needed) to make each one a discovery; `gate` (set there) keeps a combo out of reach in the Parcours until
// its nodes are owned.
// JUICE 0 / reduced motion: the gauge and a softer effect only — no flash, no shake, no tremble; reduced motion = still.
// Cost: pools of a fixed size, nothing allocated per frame but a few short arrays; `stats()` = JS cost of the layers.
(function () {
  const AMB = (window.AMB = window.AMB || {});
  const gv = AMB.gardenVisual;
  if (!gv || !gv.addLayer) return;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const ih = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  const spec = (key) => { const S = AMB.SCHEMA, [s, k] = key.split('.'); return S && S[s] && S[s].params[k]; };
  const knobKey = (k) => (k.includes('.') ? k : 'macro.' + k);
  // a knob now, 0..1 by its range (undefined = the schema default)
  const value = (k) => {
    const key = knobKey(k), S = AMB.store, sp = spec(key);
    let v = S && typeof S.get === 'function' ? S.get(key) : undefined; if (v == null && sp) v = sp.def;
    const lo = sp && sp.min != null ? sp.min : 0, hi = sp && sp.max != null ? sp.max : 1, n = (+v - lo) / ((hi - lo) || 1);
    return Number.isFinite(n) ? clamp(n) : 0;
  };

  // ---- THE TABLE: Z(id, name, zone {knob: 'hi' | 'lo'}, need (Parcours nodes), hint (the notebook's riddle), effect (in
  // words, once found), col (its neon)). Knobs: the 5 grands réglages, or an effect of the instrument (`fx.echo`).
  const Z = (id, name, zone, need, hint, effect, col) => ({ id, name, zone, knobs: Object.keys(zone), n: Object.keys(zone).length, need, hint, effect, col });
  const COMBOS = [
    Z('orage', 'Orage électrique', { nature: 'hi', light: 'lo' }, ['t.macros'], 'Quand le ciel se déchaîne au-dessus d\'une ville sans lumière, la foudre cherche les tours.',
      'la foudre frappe les tours, panne totale, puis la ville se rallume sur les temps', [200, 180, 255]),
    Z('hyper', 'Hyperespace', { space: 'hi', nature: 'lo' }, ['t.macros'], 'Un espace immense sous un ciel sans un nuage : il n\'attend qu\'un signal pour sauter.',
      'la caméra fonce sur la grille, les étoiles en traits', [120, 220, 255]),
    Z('wire', '1984', { nostalgia: 'hi', light: 'hi' }, ['t.macros'], 'Une vieille bande, poussée à fond sous une lumière crue, se souvient des premiers écrans.',
      'toute la ville en fil de fer vectoriel, vert phosphore puis néon', [80, 255, 150]),
    Z('bouchon', 'Embouteillage stellaire', { density: 'hi', space: 'hi' }, ['t.macros'], 'Trop de monde dans une ville trop grande : le trafic finit par chercher la sortie par le haut.',
      'le trafic monte jusqu\'au ciel en spirale', [255, 196, 92]),
    Z('aurore', 'Aurore de néon', { nature: 'lo', light: 'lo' }, ['t.macros'], 'La nuit la plus noire sous le ciel le plus pur : il finit par onduler.',
      'des rideaux de néon qui ondulent au-dessus de la ville éteinte', [90, 255, 190]),
    Z('kaiju', 'Kaiju dans la brume', { space: 'hi', nature: 'hi' }, ['t.macros'], 'Dans le brouillard le plus épais, sous l\'orage, quelque chose de très grand marche au tempo.',
      'un monstre géant traverse la brume, chaque pas fait trembler la ville', [255, 80, 120]),
    Z('disco', 'Blackout disco', { light: 'lo', density: 'hi', space: 'lo' }, ['t.macros'], 'Trois gestes : éteins tout, remplis la ville, serre les murs. La fête commence.',
      'une boule à facettes géante, la ville danse en couleurs', [255, 90, 220]),
    Z('miroir', 'Ville miroir', { 'fx.echo': 'hi', light: 'hi' }, ['t.macros', 'e.echo'], 'Des échos à n\'en plus finir sous une lumière crue : la ville se voit la tête en bas.',
      'la ville reflétée à l\'envers dans le ciel, écho après écho', [150, 200, 255]),
  ];
  const byId = Object.fromEntries(COMBOS.map((c) => [c.id, c]));
  const HI = 0.8, LO = 0.2, HYS = 0.08; // the zone (and its hysteresis once inside)
  const ARM = 2.5; // s: a knob of the zone moved by hand that recently arms it (a landscape loaded in the zone does not)
  const CHARGE_BEATS = 8, SUPER_BEATS = 16, FREE_BEAT = 0.75; // (stopped: a free pulse of 80 bpm)
  const BOOST = { live: 0.07, melody: 0.02, chord: 0.1 }; // charge added by a note heard during the charge
  const MACRO_OF_CC = (k) => { const D = AMB.cityDims; return D && D.ofParam ? D.ofParam(k) : null; };
  const PAL = [[255, 60, 200], [60, 230, 255], [255, 220, 70], [140, 90, 255], [80, 255, 140], [255, 110, 60]];

  const C = {
    COMBOS, byId, HI, LO, ARM, CHARGE_BEATS, SUPER_BEATS, BOOST,
    gate: () => true, // js/discoveries.js: in the Parcours, a combo waits for its nodes
    touched: {}, // knob -> s (gv.now) of its last hand gesture
    cur: null, // {id, n, phase: 'charge' | 'ready' | 'super', charge, beats, sp, rounds, left}
    lvl: {}, // id -> the effect drawn, 0..1 (smoothed)
    boost: 0, any: false, ph: null, fph: 0, b: { hit: false, ph: 0, dur: FREE_BEAT },
    bolts: [], arcs: 0, times: [], cost_: 0, T: 0,
    clock() { return gv.now() / 1000; },
    juice() { return gv.JUICE == null ? 1 : Math.max(0, +gv.JUICE); },
    live() { return !gv.reduced && this.juice() > 0.001; }, // flashes, shakes, tremble
    soft() { return this.live() ? 1 : 0.6; }, // JUICE 0 / reduced motion: a softer effect
    playing() { return !!(AMB.seq && AMB.seq.playing); },
    value,
    L(id) { return this.lvl[id] || 0; },
    inZone(c, held) {
      const h = held ? HYS : 0;
      for (const k of c.knobs) { const v = value(k); if (c.zone[k] === 'hi' ? v < HI - h : v > LO + h) return false; }
      return true;
    },
    ok(c) { try { return !!this.gate(c); } catch (e) { return false; } },
    // the name shown (the gauge, the pop): a combo not yet discovered in the Parcours stays « ??? »
    shown(c) { const D = AMB.discoveries, g = AMB.game; return !g || !g.path || !D || D.has(c.id) ? c.name : '???'; },
    fx(kind, o) { const G = AMB.garden; if (G && G.fx) G.fx(kind, o); },
    emit(e, d) { if (AMB.bus) AMB.bus.emit(e, d); },

    // ---- the beat heard (audio clock − output latency); stopped: a free pulse
    beatTick(dt) {
      const S = AMB.seq;
      if (S && S.playing && S.stepDur && gv.beatPhase) {
        const c = AMB.engine && AMB.engine.ctx, bp = gv.beatPhase(gv.clock() - (c ? c.outputLatency || c.baseLatency || 0 : 0));
        if (bp) { const hit = this.ph != null && bp.ph < this.ph; this.ph = bp.ph; return { hit, ph: bp.ph, dur: S.stepDur() * 4 }; }
      }
      this.ph = null; this.fph += dt / FREE_BEAT; const hit = this.fph >= 1; if (hit) this.fph %= 1;
      return { hit, ph: this.fph, dur: FREE_BEAT };
    },

    // ---- one step (once per frame, from the world's dimension `combo.a`; tests call it directly)
    step(dt = gv.dt || 1 / 60) {
      const now = this.clock(), b = (this.b = this.beatTick(dt)), cur = this.cur;
      this.T = gv.reduced ? this.T : gv.st || 0;
      // the zone the knobs are in now, armed by a hand gesture (a held combo stays armed)
      let best = null, bestLast = -1e9;
      for (const c of COMBOS) {
        const held = !!cur && cur.id === c.id;
        if (!this.ok(c) || !this.inZone(c, held)) continue;
        let last = -1e9; for (const k of c.knobs) if (this.touched[k] != null) last = Math.max(last, this.touched[k]);
        if (!held && now - last > ARM) continue;
        if (!best || c.n > best.n || (c.n === best.n && (held || (!(cur && cur.id === best.id) && last > bestLast)))) { best = c; bestLast = last; }
      }
      if (cur) {
        const c = byId[cur.id], inz = this.ok(c) && this.inZone(c, true);
        if (best && best.id !== cur.id && best.n > cur.n && cur.phase !== 'super') this.upgrade(best); // ×2 → ×3: the charge is kept
        else if (best && best.id !== cur.id && (!inz || cur.phase === 'super')) { this.end(); this.start(best); } // a new zone: the next combo
        else if (!inz) { if (cur.phase === 'super') cur.left = true; else this.end(); } // let go: the partial effect falls back
      } else if (best) this.start(best);
      const k = this.cur;
      if (k) {
        if (k.phase === 'charge') {
          k.charge = Math.min(1, k.charge + dt / (CHARGE_BEATS * b.dur) + this.boost);
          if (k.charge >= 1) k.phase = 'ready';
        }
        if (k.phase === 'ready' && (b.hit || !this.playing())) this.superStart();
        else if (k.phase === 'super') {
          if (b.hit) { k.beats++; this.onBeat(k); }
          k.sp = Math.min(1, (k.beats + b.ph) / SUPER_BEATS);
          if (k.beats >= SUPER_BEATS) {
            const c = byId[k.id];
            if (!k.left && this.ok(c) && this.inZone(c, true)) { k.phase = 'charge'; k.charge = 0; k.rounds++; k.beats = 0; k.sp = 0; } // held: it charges again
            else this.end();
          }
        }
      }
      this.boost = 0;
      // the levels drawn: charging = the effect growing, SUPER = all of it, held after a SUPER = sustained
      const kU = gv.reduced ? 1 : 1 - Math.exp(-dt / 0.15), kD = gv.reduced ? 1 : 1 - Math.exp(-dt / 0.6);
      let any = false;
      for (const c of COMBOS) {
        const x = this.cur && this.cur.id === c.id ? this.cur : null;
        const want = !x ? 0 : x.phase === 'super' ? 1 : Math.max(x.rounds ? 0.3 : 0, 0.1 + 0.5 * x.charge);
        const v = this.lvl[c.id] || 0, n = v + (want - v) * (want > v ? kU : kD);
        if (n < 0.004 && !want) delete this.lvl[c.id]; else { this.lvl[c.id] = n; any = true; }
      }
      this.any = any;
      for (let i = this.bolts.length - 1; i >= 0; i--) { this.bolts[i].life -= dt / 0.32; if (this.bolts[i].life <= 0) this.bolts.splice(i, 1); }
      const w = gv.world; w.combo = { id: this.cur ? this.cur.id : null, phase: this.cur ? this.cur.phase : null, charge: this.cur ? this.cur.charge : 0 };
      return this.cur ? this.lvl[this.cur.id] || 0 : 0;
    },
    start(c) {
      this.cur = { id: c.id, n: c.n, phase: 'charge', charge: 0, beats: 0, sp: 0, rounds: 0, left: false, t0: this.clock() };
      this.fx('combo', { n: c.n, name: this.shown(c) });
      this.emit('combo', { id: c.id, on: true, n: c.n });
    },
    upgrade(c) {
      const ch = this.cur.charge; this.end(); this.start(c); this.cur.charge = ch;
    },
    end() {
      const k = this.cur; if (!k) return;
      this.cur = null;
      this.emit('combo', { id: k.id, on: false });
    },
    superStart() {
      const k = this.cur, c = byId[k.id];
      k.phase = 'super'; k.beats = 0; k.sp = 0; k.supers = (k.supers || 0) + 1;
      const D = AMB.discoveries, first = !!(D && D.superCombo && D.superCombo(c.id)); // the first time: a discovery (its own party)
      if (!first) this.fx('super', { name: c.name, n: c.n });
      if (this.live()) {
        const G = AMB.cityGL, J = Math.min(2, this.juice());
        if (G) { G.pulse('flash', 0.45 * J, 160); G.pulse('shake', 0.9 * J, 700); G.pulse('bloom', 0.9, 700); }
        gv.shake = { t0: gv.t || 0, amp: 1.2 * J };
      }
      this.emit('combo', { id: c.id, on: true, n: c.n, super: true });
      this.onBeat(k);
    },
    // a beat of a SUPER (and its start, beat 0): the combos' stories on the beats
    onBeat(k) {
      const id = k.id, live = this.live(), G = AMB.cityGL, J = Math.min(2, this.juice()), roofs = this.roofs();
      if (id === 'orage') {
        const n = k.beats === 0 ? Math.min(5, roofs.length || 1) : 1;
        for (let i = 0; i < n; i++) this.strike(roofs.length ? roofs[k.beats === 0 ? i : Math.floor(ih(k.beats, 17) * roofs.length)] : null, k.beats * 13 + i);
        if (live) { gv.impulse('flash', k.beats === 0 ? 1 : 0.6); if (G) G.pulse('flash', (k.beats === 0 ? 0.6 : 0.25) * J, 200); }
      } else if (id === 'kaiju' && k.beats > 0 && live) { // a footstep
        if (G) G.pulse('shake', 0.45 * J, 320);
        gv.shake = { t0: gv.t || 0, amp: 0.7 * J };
      } else if (id === 'disco' && live && k.beats % 4 === 0 && G) G.pulse('bloom', 0.8, 300);
    },
    strike(r, seed) {
      if (this.bolts.length >= 8) this.bolts.shift();
      const W = gv.W || 1, gd = gv.ground || (gv.H || 1) * 0.76;
      this.bolts.push({ x: r ? r.x : W * (0.2 + 0.6 * ih(seed, 3)), y: r ? r.y : gd * 0.6, x0: W * (0.15 + 0.7 * ih(seed, 5)), seed: seed * 31 + 7, life: 1 });
    },
    // the roofs on screen (x, y of the top, colour), tallest first
    roofs() {
      const out = [];
      for (const p of gv.plants) if (p.vis > (gv.px || 3) && p.sx != null) out.push({ x: p.sx, y: p.sy - p.vis * (p.k || 1), col: p.col });
      return out.sort((a, b) => a.y - b.y);
    },
    // the notes heard during a charge fill it faster
    note(kind) { const k = this.cur; if (k && k.phase === 'charge') this.boost += BOOST[kind] || 0; },
    stop() { if (this.cur) this.end(); this.lvl = {}; this.any = false; this.bolts.length = 0; },
    stats() { const a = this.times.slice().sort((x, y) => x - y), n = a.length; return { avg: n ? a.reduce((s, x) => s + x, 0) / n : 0, med: n ? a[n >> 1] : 0, p95: n ? a[Math.floor(n * 0.95) - (n > 1 ? 1 : 0)] : 0, n }; },
  };

  // ======================================================================================================================
  // THE WORLD: the combos reshape the dimensions (wrapping the current wiring, S8.4–S8.6) and the WebGL pass
  const wrap = (name, at, f) => {
    const P = gv.DIMS[name]; if (!P) return;
    gv.addDim(name, { at: P.at + ' ; ' + at, get tau() { return P.tau; }, aim: (c) => { const v = P.aim(c); return C.any ? f(+v || 0, c) : v; } });
  };
  // Orage: total blackout at the SUPER, then the city relit by chunks on the beats; charging, the current flickers.
  // Blackout disco: the lights go out for the party. (The power field of S8.4 is cut column by column.)
  const NCOL = 32, ORDER = Array.from({ length: NCOL }, (_, i) => i).sort((a, b) => ih(a, 41) - ih(b, 41));
  wrap('power', 'S8.7 : Orage (panne, rallumage sur les temps), Blackout disco', (v) => {
    const o = C.L('orage'), d = C.L('disco'), k = C.cur, D = AMB.cityDims;
    if (o < 0.01 && d < 0.01) return v;
    const sup = k && k.phase === 'super', mask = (i) => {
      let m = 1;
      if (o > 0.01) {
        if (sup && k.id === 'orage') { const lit = Math.floor(NCOL * clamp((k.beats + (C.b.ph || 0) * 0.5 - 1) / 11)); m = ORDER.indexOf(i) < lit ? 1 : 0.02; }
        else m = 1 - o * (C.live() && ih(i, Math.floor((gv.t || 0) * 14)) < 0.35 * o ? 0.9 : 0.2); // brown-out flicker
      }
      if (d > 0.01) m = Math.min(m, 1 - 0.85 * d);
      return m;
    };
    if (D && D.cols) { let s = 0; for (let i = 0; i < D.cols.length; i++) { D.cols[i] = Math.min(D.cols[i], mask(i)); s += D.cols[i]; } return s / D.cols.length; }
    let s = 0; for (let i = 0; i < NCOL; i++) s += mask(i); return v * s / NCOL;
  });
  wrap('traffic', 'S8.7 : Embouteillage stellaire', (v) => Math.min(1.3, v + 0.6 * C.L('bouchon')));
  wrap('weather.storm', 'S8.7 : Orage électrique, Kaiju', (v) => clamp(v + 0.8 * C.L('orage') + 0.4 * C.L('kaiju')));
  wrap('weather.clear', 'S8.7 : Hyperespace, Aurore (ciel pur)', (v) => clamp(v + 0.6 * Math.max(C.L('hyper'), C.L('aurore'))));
  wrap('cam.back', 'S8.7 : Hyperespace (la caméra fonce), Embouteillage (elle recule)', (v) => v - 1.7 * C.L('hyper') * (C.cur && C.cur.id === 'hyper' && C.cur.phase === 'super' ? 1 : 0.35) + 0.5 * C.L('bouchon'));
  wrap('cam.fog', 'S8.7 : Kaiju dans la brume', (v) => clamp(v + 0.6 * C.L('kaiju')));
  wrap('cam.dx', 'S8.7 : la caméra tremble pendant la charge', (v) => {
    const k = C.cur; if (!k || k.phase === 'super' || !C.live()) return v;
    return v + (ih(Math.floor((gv.t || 0) * 30), 9) - 0.5) * 0.008 * k.charge * Math.min(2, C.juice());
  });
  gv.addDim('combo.a', { tau: 0, at: 'S8.7 combo en cours : niveau de son effet (et world.combo = {id, phase, charge})', aim: () => C.step() });
  // the WebGL pass: after S8.4 set its base levels (its hook runs first), the combos add theirs
  gv.afterDraw(() => {
    const G = AMB.cityGL; if (!G || !G.set) return;
    const k = C.cur, ch = k && k.phase !== 'super' ? k.charge : 0, sup = k && k.phase === 'super' ? 1 : 0;
    G.set('warp', 1.5 * C.L('hyper') * (k && k.id === 'hyper' && k.phase === 'super' ? 1 : 0.25));
    G.set('shake', 0.22 * ch);
    if (C.any) { G.set('bloom', (G.get('bloom') || 0) + 0.45 * ch + 0.3 * sup); G.set('fog', (G.get('fog') || 0) + 0.7 * C.L('kaiju')); }
    const wv = C.L('wire'); // 1984: a clean vector screen (the worn tape of Nostalgie would smear its lines)
    if (wv > 0.01) for (const n of ['vhs', 'grain', 'chroma', 'fog']) G.set(n, (G.get(n) || 0) * (1 - 0.85 * wv));
  });
  gv.afterDraw(() => { if (C.any || C.cost_) { C.times.push(C.cost_); if (C.times.length > 240) C.times.shift(); } C.cost_ = 0; });

  // ======================================================================================================================
  // THE LAYERS (screen coordinates; the camera's shake is in the buildings' positions)
  const timed = (f) => function (g, w, cam, v) { if (!C.any) return; const t0 = performance.now(); f(g, w, cam, v); C.cost_ += performance.now() - t0; };
  const phone = (cam) => cam.W / (gv.dpr || 1) < 600;
  // sky (z 13): aurora curtains, hyperspace streaks, the mirrored city, the disco ball and its beams
  gv.addLayer({ id: 'combo-sky', z: 13, draw: timed((g, w, cam, v) => {
    const W = cam.W, H = cam.H, gd = cam.y(1, cam.gd), px = cam.px, T = C.T, s = C.soft(), k = C.cur;
    let a;
    if ((a = C.L('aurore') * s) > 0.01) { // three curtains of neon waving across the dark sky, flaring on the beats
      const step = Math.max(2, px * 2), sup = k && k.id === 'aurore' && k.phase === 'super', beat = C.live() && w.beat ? w.beat.k || 0 : 0;
      g.globalCompositeOperation = 'lighter';
      for (let j = 0; j < 3; j++) {
        const col = [[70, 255, 170], [255, 70, 200], [70, 200, 255]][(j + (sup ? Math.floor(k.beats / 4) : 0)) % 3], img = curtain(col);
        g.globalAlpha = Math.min(1, a * (0.55 + 0.35 * beat) * (j === 0 ? 1 : 0.75));
        for (let x = 0; x < W; x += step) {
          const u = x / W, top = gd * (0.08 + 0.1 * j + 0.07 * Math.sin(u * 5.3 + T * (0.35 + 0.1 * j) + j * 2)), len = gd * (0.18 + 0.22 * a) * (0.6 + 0.4 * Math.sin(u * 11 - T * 0.8 + j));
          g.drawImage(img, x, top, step, len);
        }
      }
    }
    if ((a = C.L('hyper') * s) > 0.01) { // stars stretched into lines from the vanishing point
      const sup = k && k.id === 'hyper' && k.phase === 'super', cx = W / 2 + (cam.pan || 0) * W * 0.3, cy = gd * 0.62, R = Math.hypot(W, gd), n = Math.round((phone(cam) ? 80 : 140) * Math.min(1, 0.3 + a));
      const spd = sup ? 0.9 : 0.12 + 0.3 * a, len = (sup ? 0.32 : 0.05 + 0.1 * a) * R;
      g.globalCompositeOperation = 'lighter'; g.lineWidth = Math.max(1, px * 0.5); g.lineCap = 'round';
      for (let c = 0; c < 2; c++) {
        g.strokeStyle = c ? '#bfe9ff' : '#ff8ae0'; g.globalAlpha = Math.min(1, a * (c ? 0.9 : 0.6)); g.beginPath();
        for (let i = c; i < n; i += 2) {
          const an = ih(i, 3) * 6.283, r0 = (ih(i, 5) + T * spd * (0.5 + ih(i, 7))) % 1, d0 = r0 * r0 * R, ca = Math.cos(an), sa = Math.sin(an) * 0.7;
          const y0 = cy + sa * d0; if (y0 > gd) continue;
          g.moveTo(cx + ca * d0, y0); g.lineTo(cx + ca * (d0 + len * r0), Math.min(gd, cy + sa * (d0 + len * r0)));
        }
        g.stroke();
      }
    }
    if ((a = C.L('miroir') * s) > 0.01) { // the city upside down hanging from the sky, echo after echo
      const top = (gv.H || H) * Math.max(gv.ceil || 0.1, 0.06), sup = k && k.id === 'miroir' && k.phase === 'super';
      const nE = 1 + Math.round(3 * clamp(value('fx.feedback'))), shown = sup ? Math.min(nE, 1 + Math.floor(k.beats / 2)) : Math.round(nE * (k && k.id === 'miroir' ? k.charge : 0.3));
      for (let i = shown; i >= 0; i--) {
        const kk = 0.55 * (1 - 0.13 * i), al = a * 0.7 * Math.pow(0.55, i), dy = top + i * px * 5, dx = i * px * (4 + 4 * Math.sin(T * 0.7));
        for (const p of v.plants) {
          if (!p.vis) continue;
          const sp = v.sprite(p, px), sc = (p.k || 1) * kk, x = W / 2 + (p.sx - W / 2) * (1 - 0.1 * i) + dx;
          g.globalCompositeOperation = 'source-over'; g.globalAlpha = Math.min(1, al * 0.8);
          g.setTransform(sc, 0, 0, -sc, x, dy); g.drawImage(sp.cv, 0, sp.h - p.vis, sp.w, p.vis, -sp.w / 2, -p.vis, sp.w, p.vis);
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, al * (0.6 + 0.4 * (w.beat ? w.beat.k || 0 : 0)));
          g.drawImage(sp.em, 0, sp.h - p.vis, sp.w, p.vis, -sp.w / 2, -p.vis, sp.w, p.vis);
        }
      }
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, a * 0.5); g.fillStyle = '#9fd0ff';
      g.fillRect(0, Math.round(top), W, Math.max(1, px >> 1)); // the mirror's edge
    }
    if ((a = C.L('disco') * s) > 0.01) { // the mirror ball comes down; its beams turn over the city
      const R = Math.max(10, Math.round(Math.min(W, gd) * 0.085)), sup = k && k.id === 'disco' && k.phase === 'super', ch = k && k.id === 'disco' ? (sup ? 1 : k.charge) : 1;
      const cx = W / 2, cy = Math.round(-R + (gd * 0.24 + R) * Math.min(1, 0.25 + 0.75 * ch)), rot = T * 1.3;
      g.globalCompositeOperation = 'lighter';
      if (sup || a > 0.5) for (let i = 0; i < 10; i++) { // beams
        const an = rot * 0.6 + i * 0.628, L2 = Math.hypot(W, H), col = PAL[i % PAL.length];
        g.globalAlpha = Math.min(1, a * 0.13); g.fillStyle = rgba(col, 1);
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(an - 0.035) * L2, cy + Math.abs(Math.sin(an - 0.035)) * L2); g.lineTo(cx + Math.cos(an + 0.035) * L2, cy + Math.abs(Math.sin(an + 0.035)) * L2); g.closePath(); g.fill();
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = Math.min(1, a); g.fillStyle = '#556';
      g.fillRect(cx - Math.max(1, px >> 1), 0, Math.max(1, px), Math.max(0, cy - R)); // its string
      const cs = Math.max(2, Math.round(R / 7));
      for (let y = -R; y < R; y += cs) for (let x = -R; x < R; x += cs) {
        const d = Math.hypot(x + cs / 2, y + cs / 2); if (d > R) continue;
        const col = Math.floor((x / R + 1) * 6 + rot * 3), row = Math.floor((y / R + 1) * 6), h = ih(col, row);
        const l = 90 + Math.round(150 * h * (1 - d / R * 0.6));
        g.fillStyle = h > 0.93 ? '#ffffff' : `rgb(${l},${l},${Math.min(255, l + 25)})`; g.fillRect(Math.round(cx + x), Math.round(cy + y), cs - 1, cs - 1);
      }
      g.globalCompositeOperation = 'lighter'; const gl = v.glow([255, 200, 255], R * 2); g.globalAlpha = Math.min(1, a * 0.6); g.drawImage(gl, cx - R * 2, cy - R * 2);
    }
  }) });
  // a cached vertical gradient (a curtain's column): bright at the bottom edge, fading up
  const curtains = new Map();
  function curtain(col) {
    const key = col.join(); let c = curtains.get(key); if (c) return c;
    c = document.createElement('canvas'); c.width = 1; c.height = 64; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(0.7, rgba(col, 0.35)); gr.addColorStop(0.93, rgba(col.map((v) => Math.min(255, v + 90)), 0.9)); gr.addColorStop(1, rgba(col, 0));
    x.fillStyle = gr; x.fillRect(0, 0, 1, 64); curtains.set(key, c); return c;
  }

  // behind the towers (z 24, between the far city and the background buildings of Densité): the kaiju, the back half
  // of the traffic spiral
  const KAIJU = (() => { // its silhouette as cells (x 0..47, y 0..39 from the ground up); 1 = body, 2 = spine, 3 = eye
    const m = [], set = (x, y, t) => { if (x >= 0 && x < 48 && y >= 0 && y < 40) m[y * 48 + x] = t; };
    const ell = (cx, cy, rx, ry, t) => { for (let y = 0; y < 40; y++) for (let x = 0; x < 48; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) set(x, y, t); };
    ell(22, 19, 11, 12, 1); ell(10, 9, 9, 4, 1); ell(3, 5, 4, 2, 1); // body, tail
    for (let y = 0; y < 9; y++) for (let x = 15; x < 20; x++) set(x, y, 1); for (let y = 0; y < 9; y++) for (let x = 25; x < 30; x++) set(x, y, 1); // legs
    ell(31, 30, 6, 7, 1); ell(37, 34, 7, 4, 1); ell(43, 33, 4, 2, 1); // neck, head, snout
    for (let x = 32; x < 38; x++) set(x, 21 + (x & 1), 1); for (let x = 36; x < 39; x++) set(x, 22, 1); // arm
    for (let i = 0; i < 7; i++) { const x = 9 + i * 3.6, y = 22 + i * 2.2 - (i > 4 ? (i - 4) * 2 : 0); for (let h = 0; h < 4; h++) for (let w2 = -1 + (h >> 1); w2 <= 1 - (h >> 1); w2++) set(Math.round(x + w2), Math.round(y + h), 2); }
    set(39, 35, 3); set(40, 35, 3);
    return m;
  })();
  let kaijuSpr = null;
  function kaijuSprite(cell) {
    if (kaijuSpr && kaijuSpr.cell === cell) return kaijuSpr;
    const mk = () => { const c = document.createElement('canvas'); c.width = 48 * cell; c.height = 40 * cell; return c; };
    const body = mk(), glow = mk(), b = body.getContext('2d'), gg = glow.getContext('2d');
    for (let y = 0; y < 40; y++) for (let x = 0; x < 48; x++) {
      const t = KAIJU[y * 48 + x]; if (!t) continue;
      const X = x * cell, Y = (39 - y) * cell, edge = !KAIJU[(y + 1) * 48 + x] || !KAIJU[y * 48 + x - 1] || !KAIJU[y * 48 + x + 1] || (y > 0 && !KAIJU[(y - 1) * 48 + x]);
      if (t === 1) { b.fillStyle = edge ? '#b0306e' : '#0a0512'; b.fillRect(X, Y, cell, cell); if (edge) { gg.fillStyle = 'rgba(255,60,160,0.75)'; gg.fillRect(X, Y, cell, cell); } } // a magenta rim light (also in the glow: it shines through the fog)
      if (t === 2) { gg.fillStyle = '#55f0ff'; gg.fillRect(X, Y, cell - (cell > 3 ? 1 : 0), cell - (cell > 3 ? 1 : 0)); b.fillStyle = '#123848'; b.fillRect(X, Y, cell, cell); }
      if (t === 3) { gg.fillStyle = '#ff3050'; gg.fillRect(X, Y, cell, cell); b.fillStyle = '#ff3050'; b.fillRect(X, Y, cell, cell); }
    }
    return (kaijuSpr = { cell, body, glow });
  }
  gv.addLayer({ id: 'combo-back', z: 24, draw: timed((g, w, cam, v) => {
    const W = cam.W, H = cam.H, gd = cam.y(1, cam.gd), px = cam.px, T = C.T, s = C.soft(), k = C.cur;
    let a;
    if ((a = C.L('kaiju') * s) > 0.01) {
      const mine = k && k.id === 'kaiju', sup = mine && k.phase === 'super', cell = Math.max(2, Math.round(gd * 0.62 / 40)), sp = kaijuSprite(cell);
      const ph = C.b.ph || 0, prog = sup ? (k.beats + Math.min(1, ph * 2.5)) / SUPER_BEATS : mine ? 0.12 * k.charge : 0.5;
      const x = Math.round(-sp.body.width * 0.3 + (W + sp.body.width * 0.1) * (0.12 + 0.7 * prog) + cam.ox), bob = sup && C.live() ? -Math.round(Math.sin(Math.min(1, ph * 2.5) * Math.PI) * cell * 1.5) : 0;
      const y = Math.round(gd - sp.body.height + cell * 2 + bob + cam.oy);
      { // backlit by the city's glow in the fog: a dark shape against light (S8.8)
        const R = Math.round(sp.body.height * 0.75), bg = v.glow([255, 50, 140], R); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, a * 0.55);
        g.drawImage(bg, x + sp.body.width / 2 - R, y + sp.body.height * 0.55 - R); g.globalCompositeOperation = 'source-over';
      }
      g.globalAlpha = Math.min(1, a * 0.95); g.drawImage(sp.body, x, y);
      const roar = sup && k.beats >= 8 && k.beats < 13;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.min(1, a * (0.55 + 0.45 * (w.beat ? w.beat.k || 0 : 0) + (roar ? 0.4 : 0))); g.drawImage(sp.glow, x, y);
      const ex = x + 39.5 * cell, ey = y + 4.5 * cell, eg = v.glow([255, 40, 70], cell * 5); g.globalAlpha = Math.min(1, a); g.drawImage(eg, ex - cell * 5, ey - cell * 5);
      if (roar) { // the breath: a cyan beam from its mouth sweeping the sky
        const an = -0.35 - 0.5 * ((k.beats - 8 + ph) / 5), L2 = W * 1.2, mx = x + 46 * cell, my = y + 7 * cell;
        g.globalAlpha = Math.min(1, a * 0.85); g.fillStyle = '#7ff6ff';
        g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(an - 0.05) * L2, my + Math.sin(an - 0.05) * L2); g.lineTo(mx + Math.cos(an + 0.05) * L2, my + Math.sin(an + 0.05) * L2); g.closePath(); g.fill();
        g.globalAlpha = Math.min(1, a); g.fillStyle = '#ffffff';
        g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + Math.cos(an - 0.012) * L2, my + Math.sin(an - 0.012) * L2); g.lineTo(mx + Math.cos(an + 0.012) * L2, my + Math.sin(an + 0.012) * L2); g.closePath(); g.fill();
      }
    }
    if ((a = C.L('bouchon') * s) > 0.01) spiral(g, cam, a, false);
  }) });
  // the traffic spiral: flying cars climbing a helix from the street to the sky (back half behind the towers, front
  // half in front), a ribbon of light along it, a star gate at the top
  function spiral(g, cam, a, front) {
    const W = cam.W, H = cam.H, gd = cam.y(1, cam.gd), px = cam.px, T = C.T, k = C.cur, mine = k && k.id === 'bouchon', sup = mine && k.phase === 'super';
    const top = H * Math.max(gv.ceil || 0.1, 0.05) + px * 6, reach = (gd - top) * (sup ? 0.55 + 0.45 * Math.min(1, k.sp * 3) : 0.25 + 0.35 * (mine ? k.charge : 0.5));
    const cx = W / 2 + cam.ox, n = Math.round((phone(cam) ? 60 : 110) * Math.min(1, 0.35 + a)), turns = 3.2, spd = sup ? 0.07 : 0.035, s = Math.max(1, Math.round(px * 0.8));
    const at = (u, th) => [cx + Math.cos(th) * W * (0.07 + 0.2 * u), gd - u * reach + Math.sin(th) * W * 0.035 * (0.5 + u)];
    g.globalCompositeOperation = 'lighter';
    // the ribbon
    g.strokeStyle = rgba([255, 190, 90], 1); g.lineWidth = Math.max(1, px * 0.6); g.globalAlpha = Math.min(1, a * 0.28); g.beginPath();
    let pen = false;
    for (let i = 0; i <= 120; i++) { const u = i / 120, th = u * turns * 6.283 + T * 0.5, f = Math.sin(th) > 0; if (f !== front) { pen = false; continue; } const [x, y] = at(u, th); if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; }
    g.stroke();
    for (let i = 0; i < n; i++) {
      const u = (i / n + T * spd) % 1, th = u * turns * 6.283 + T * 0.5; if ((Math.sin(th) > 0) !== front) continue;
      const [x, y] = at(u, th), z = front ? 1.4 : 0.8, dir = -Math.sin(th) >= 0 ? 1 : -1, X = Math.round(x), Y = Math.round(y);
      g.globalAlpha = Math.min(1, a * (front ? 1 : 0.7));
      g.fillStyle = '#fff3c0'; g.fillRect(X, Y, Math.round(2 * s * z), Math.round(s * z));
      g.fillStyle = '#ff3a50'; g.fillRect(X - dir * Math.round(4 * s * z), Y, Math.round(2 * s * z), Math.round(s * z));
    }
    if (!front && a > 0.2) { const gl = gv.glow([255, 200, 120], Math.max(8, Math.round(W * 0.05))); g.globalAlpha = Math.min(1, a * 0.7); g.drawImage(gl, cx - gl.width / 2, gd - reach - gl.height / 2); }
  }
  // the ground (z 33): the hyperspace grid rushing toward the camera
  gv.addLayer({ id: 'combo-ground', z: 33, draw: timed((g, w, cam) => {
    const a = C.L('hyper') * C.soft(); if (a < 0.01) return;
    const W = cam.W, H = cam.H, yT = cam.y(1, cam.gd), px = cam.px, k = C.cur, sup = k && k.id === 'hyper' && k.phase === 'super', T = C.T, cx = W / 2 + cam.ox;
    const spd = sup ? 3.2 : 0.3 + 0.8 * a, N = 14;
    g.globalCompositeOperation = 'lighter'; g.lineWidth = Math.max(1, px * 0.5);
    g.strokeStyle = '#ff4fd8'; g.globalAlpha = Math.min(1, a * 0.55); g.beginPath();
    for (let i = 0; i < N; i++) { const z = ((i / N - T * spd / N * 4) % 1 + 1) % 1, y = Math.round(yT + (H - yT) / (1 + 4 * z)); g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke(); g.strokeStyle = '#4ff0ff'; g.beginPath();
    for (let u = -8; u <= 8; u++) { g.moveTo(cx + u * 0.7 * W / 5, yT + (H - yT) / 5); g.lineTo(cx + u * 0.7 * W, H); }
    g.stroke();
  }) });
  // in front (z 74): the bolts on the roofs, the front of the spiral, the disco's colours, 1984 in vector lines,
  // the charge crackling between the roofs
  gv.addLayer({ id: 'combo-front', z: 74, draw: timed((g, w, cam, v) => {
    const W = cam.W, H = cam.H, gd = cam.y(1, cam.gd), px = cam.px, T = C.T, s = C.soft(), k = C.cur;
    let a;
    if ((a = C.L('bouchon') * s) > 0.01) spiral(g, cam, a, true);
    if (C.bolts.length) { // lightning on the roofs
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const b of C.bolts) {
        const r = mulberry(b.seed), pts = [[b.x0, 0]];
        for (let i = 1; i < 10; i++) { const f = i / 10; pts.push([b.x0 + (b.x - b.x0) * f + (r() - 0.5) * px * 16, b.y * f]); }
        pts.push([b.x, b.y]);
        for (const [lw, col, al] of [[px * 3, '#a98bff', 0.35], [Math.max(1, px * 0.8), '#ffffff', 1]]) {
          g.lineWidth = lw; g.strokeStyle = col; g.globalAlpha = Math.min(1, b.life * al * s); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
        }
        const gl = v.glow([200, 180, 255], px * 10); g.globalAlpha = Math.min(1, b.life * s); g.drawImage(gl, b.x - px * 10, b.y - px * 10);
      }
    }
    if ((a = C.L('disco') * s) > 0.01) { // windows flashing colours in rows climbing on the beat, colour spots sweeping
      const bt = k && k.id === 'disco' ? k.beats + (k.phase === 'super' ? 0 : 0) : 0, ph = C.b.ph || 0;
      g.globalCompositeOperation = 'lighter';
      for (const p of v.plants) {
        if (!p.vis) continue;
        const sp = v.sprite(p, px), kk = p.k || 1, x0 = p.sx - sp.l * kk * 0.8, w2 = (sp.l + sp.r) * kk * 0.8, h = p.vis * kk, rowH = px * kk * 2, rows = Math.floor(h / (rowH * 2));
        for (let r2 = 0; r2 < rows; r2++) {
          const col = PAL[(r2 + bt + Math.floor(p.x)) % PAL.length], on = ih(r2 + bt * 3, Math.floor(p.x)) < 0.6;
          if (!on) continue;
          g.globalAlpha = Math.min(1, a * (0.35 + 0.4 * (1 - ph))); g.fillStyle = rgba(col, 1);
          g.fillRect(Math.round(x0), Math.round(p.sy - (r2 * 2 + 1) * rowH), Math.round(w2), Math.max(1, Math.round(rowH * 0.7)));
        }
      }
      const n = phone(cam) ? 16 : 30;
      for (let i = 0; i < n; i++) {
        const x = W * (0.5 + 0.48 * Math.sin(T * (0.7 + ih(i, 1)) + i * 2.1)), y = gd * (0.35 + 0.6 * (0.5 + 0.5 * Math.sin(T * (0.5 + ih(i, 2)) + i))), r2 = Math.max(3, px * 2.5);
        g.globalAlpha = Math.min(1, a * 0.55); g.fillStyle = rgba(PAL[i % PAL.length], 1); g.fillRect(Math.round(x - r2), Math.round(y - r2 * 0.5), Math.round(2 * r2), Math.round(r2));
      }
    }
    if (k && k.phase !== 'super' && k.charge > 0.02) { // the energy building up: arcs crackling between the roofs
      const roofs = C.roofs(); if (roofs.length) {
        const seed = C.live() ? Math.floor((gv.t || 0) * 16) : 1, r = mulberry(seed * 977 + 13), n = Math.min(10, 1 + Math.round(9 * k.charge)), col = byId[k.id].col;
        g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round';
        for (let i = 0; i < n; i++) {
          const A = roofs[Math.floor(r() * roofs.length)], B = r() < 0.3 || roofs.length < 2 ? { x: A.x + (r() - 0.5) * W * 0.3, y: Math.max(px * 4, A.y - gd * (0.15 + 0.3 * r())) } : roofs[Math.floor(r() * roofs.length)];
          if (A === B) continue;
          for (const [lw, c2, al] of [[px * 2, rgba(col, 1), 0.3], [Math.max(1, px * 0.5), '#ffffff', 0.9]]) {
            g.lineWidth = lw; g.strokeStyle = c2; g.globalAlpha = Math.min(1, (0.25 + 0.75 * k.charge) * al * s); g.beginPath(); g.moveTo(A.x, A.y);
            const rr = mulberry(seed * 31 + i);
            for (let j = 1; j < 7; j++) { const f = j / 7; g.lineTo(A.x + (B.x - A.x) * f + (rr() - 0.5) * px * 8, A.y + (B.y - A.y) * f + (rr() - 0.5) * px * 8); }
            g.lineTo(B.x, B.y); g.stroke();
          }
        }
      }
    }
  }) });
  // 1984 (S8.8: drawn from the world model, not edge-detected on the picture): the screen goes black and the city is
  // redrawn in clean vector lines, Battlezone / Tron style — each building's silhouette (its sprite's skyline, simplified
  // into straight strokes: stairs become slopes, masts stay spikes) and its floors, the ground grid scrolling on the
  // beat, a mountain range and a moon on the horizon, the notes' beams as single lines. Phosphor green, then (second half
  // of the SUPER) each building takes its own neon, swept from left to right. The HUD (captions) stays on top.
  const outlines = new WeakMap();
  function outline(sp, cell) { // the skyline of a sprite in its pixels (y up from the base), simplified; + the column tops
    let o = outlines.get(sp); if (o && o.cell === cell) return o;
    const n = Math.max(1, Math.round(sp.w / cell)), top = new Array(n).fill(0);
    try {
      const d = sp.cv.getContext('2d').getImageData(0, 0, sp.w, sp.h).data;
      for (let c = 0; c < n; c++) {
        const x = Math.min(sp.w - 1, Math.round((c + 0.5) * cell));
        for (let y = 0; y < sp.h; y += Math.max(1, cell >> 1)) if (d[(y * sp.w + x) * 4 + 3] > 90) { top[c] = sp.h - y; break; }
      }
    } catch (e) { top.fill(sp.h); }
    let a = 0, b = n - 1; while (a < b && !top[a]) a++; while (b > a && !top[b]) b--;
    const pts = [{ x: a * cell, y: 0 }];
    for (let c = a; c <= b; c++) pts.push({ x: c * cell, y: top[c] }, { x: (c + 1) * cell, y: top[c] });
    pts.push({ x: (b + 1) * cell, y: 0 });
    o = { cell, top, a, b, pts: rdp(pts, cell * 1.1) }; outlines.set(sp, o); return o;
  }
  function rdp(P, eps) { // Ramer–Douglas–Peucker: the pixel stairs become straight strokes
    if (P.length < 3) return P;
    const A = P[0], B = P[P.length - 1], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
    let im = 0, dm = 0;
    for (let i = 1; i < P.length - 1; i++) { const dd = Math.abs(dy * P[i].x - dx * P[i].y + B.x * A.y - B.y * A.x) / L; if (dd > dm) { dm = dd; im = i; } }
    if (dm <= eps) return [A, B];
    return rdp(P.slice(0, im + 1), eps).slice(0, -1).concat(rdp(P.slice(im), eps));
  }
  const MOUNT = [0, 0.3, 0.07, 0.75, 0.13, 0.4, 0.2, 1, 0.27, 0.5, 0.31, 0.62, 0.38, 0.2, 0.47, 0.55, 0.53, 0.35, 0.6, 0.85, 0.66, 0.3, 0.74, 0.6, 0.8, 0.15, 0.88, 0.7, 0.94, 0.4, 1, 0.25];
  function vector(g, cam, v, a) {
    const W = cam.W, H = cam.H, gd = cam.y(1, cam.gd), px = cam.px, k = C.cur, mine = k && k.id === 'wire', sup = mine && k.phase === 'super';
    const neonK = sup ? clamp((k.sp - 0.5) / 0.12) : 0, green = [60, 255, 140], lw = Math.max(1, Math.round(px * 0.45));
    const flick = C.live() ? 0.9 + 0.1 * ih(Math.floor((gv.t || 0) * 30), 77) : 1;
    const colAt = (x, col) => { const f = clamp(neonK * 1.6 - x / W * 0.6); return f <= 0 ? green : green.map((c, i) => Math.round(c + (col[i] - c) * f)); };
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
    g.globalAlpha = Math.min(0.94, a * 1.1); g.fillStyle = '#010604'; g.fillRect(0, 0, W, H); // the screen goes black
    g.globalCompositeOperation = 'lighter'; g.lineJoin = 'miter'; g.lineCap = 'square';
    const A = Math.min(1, a * 1.4) * flick;
    const stroke = (col, al, w2) => { g.strokeStyle = rgba(col, 1); g.globalAlpha = Math.min(1, al); g.lineWidth = w2; g.stroke(); };
    const glowStroke = (col, al) => { stroke(col, al * 0.22, lw * 4); stroke(col, al, lw); };
    // horizon: the mountain range, the moon
    const mh = gd * 0.09;
    g.beginPath(); for (let i = 0; i < MOUNT.length; i += 2) { const x = MOUNT[i] * W, y = gd - MOUNT[i + 1] * mh; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    glowStroke(colAt(0, [255, 80, 220]), A * 0.7);
    g.beginPath(); g.arc(W * 0.8, gd * 0.3, Math.max(6, gd * 0.06), 0, Math.PI * 2); glowStroke(colAt(W * 0.8, [255, 200, 90]), A * 0.6);
    // the ground: horizon line, lines to the vanishing point, rows coming on the beat (S8.5's grid phase)
    const G2 = gv.grid, ph = G2 ? G2.phase : 0, cx = W / 2 + (cam.ox || 0);
    g.beginPath(); g.moveTo(0, Math.round(gd) + 0.5); g.lineTo(W, Math.round(gd) + 0.5);
    for (let u = -10; u <= 10; u++) { g.moveTo(cx + u * W * 0.035, gd); g.lineTo(cx + u * W * 0.35, H); }
    for (let i = 1; i <= 8; i++) { const z = (i - ph) / 3; if (z <= 0) continue; const y = Math.round(gd + (H - gd) / (1 + 4 * z)) + 0.5; g.moveTo(0, y); g.lineTo(W, y); }
    glowStroke(colAt(W / 2, [255, 63, 164]), A * 0.55);
    // the buildings: silhouette + floors, from their sprites (back row first)
    const order = v.plants.slice().sort((p1, p2) => p2.row - p1.row);
    for (const p of order) {
      if (!p.vis || p.vis < px) continue;
      const sp = v.sprite(p, px), o = outline(sp, px), kk = p.k || 1, X = (x) => p.sx + (x - sp.w / 2) * kk, Y = (y) => p.sy - Math.min(y, p.vis) * kk;
      const col = colAt(p.sx, p.col), en = Math.min(1, (v.energy && v.energy[p.id]) || 0);
      g.beginPath(); o.pts.forEach((q, i) => (i ? g.lineTo(X(q.x), Y(q.y)) : g.moveTo(X(q.x), Y(q.y))));
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = Math.min(0.94, a * 1.1); g.fillStyle = '#010604'; g.fill(); // solid: hides what is behind (hidden lines)
      g.globalCompositeOperation = 'lighter'; glowStroke(col, A * (0.85 + 0.3 * en));
      g.beginPath(); // floors every 4 cells, where the building is that tall
      const fl = px * 4;
      for (let y = fl; y < p.vis - px; y += fl) {
        let run = -1;
        for (let c = o.a; c <= o.b + 1; c++) {
          const inb = c <= o.b && o.top[c] > y + px;
          if (inb && run < 0) run = c;
          else if (!inb && run >= 0) { if (c - run >= 2) { const yy = Math.round(Y(y)) + 0.5; g.moveTo(X(run * px + px * 0.5), yy); g.lineTo(X(c * px - px * 0.5), yy); } run = -1; }
        }
      }
      stroke(col, A * (0.3 + 0.4 * en), lw);
    }
    // the notes: one line per beam
    const CM = AMB.cityMusic;
    if (CM && CM.lasers.length) {
      const L2 = Math.hypot(W, H);
      for (const L of CM.lasers) {
        if (CM.now < L.t0 || (L.t1 !== Infinity && CM.now > L.t1 + L.rel)) continue;
        const p = L.plant && v.plants.find((q) => q.id === L.plant), x = p ? p.sx : W / 2, y = p ? p.sy - p.vis * p.k : gd;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.sin(L.ang) * L2, y - Math.cos(L.ang) * L2); glowStroke(colAt(x, L.col), A * 0.8 * L.a);
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.lineCap = 'butt';
  }
  // 1984 (z 79.5): over the city and its VHS grading (z 79), under the post filters and the HUD
  gv.addLayer({ id: 'combo-vector', z: 79.5, draw: timed((g, w, cam, v) => { const a = C.L('wire'); if (a > 0.01) vector(g, cam, v, a); }) });
  // the HUD (z 88): the arcade charge meter under the top of the screen: « COMBO ×n · NAME », 16 segments; SUPER: the
  // segments empty with the beats left
  gv.addLayer({ id: 'combo-hud', z: 88, draw: timed((g, w, cam) => {
    const k = C.cur; if (!k) return;
    const c = byId[k.id], W = cam.W, H = cam.H, dpr = gv.dpr || 1, fs = Math.round(Math.max(14 * dpr, Math.min(30 * dpr, W * 0.022))), sup = k.phase === 'super';
    const bw = Math.round(Math.min(W * 0.7, 420 * dpr)), bh = Math.round(fs * 0.55), x0 = Math.round(W / 2 - bw / 2), y0 = Math.round(H * Math.max(gv.ceil || 0.1, 0.06) + fs * 1.6);
    const segs = 16, fill = sup ? 1 - k.sp : k.charge, lit = Math.ceil(fill * segs - 0.001), blink = C.live() ? (w.beat ? w.beat.k || 0 : 0) : 0, col = c.col;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 0.6; g.fillStyle = '#05020c'; g.fillRect(x0 - 3 * dpr, y0 - 3 * dpr, bw + 6 * dpr, bh + 6 * dpr);
    const sw = (bw - (segs - 1) * 2 * dpr) / segs;
    for (let i = 0; i < segs; i++) {
      const on = i < lit, hot = i >= segs - 3;
      g.globalAlpha = on ? 1 : 0.22; g.fillStyle = on ? (hot && !sup ? '#ff3a6a' : sup ? (i % 2 ? '#fff36b' : rgba(col, 1)) : rgba(col, 1)) : '#3a2a50';
      g.fillRect(Math.round(x0 + i * (sw + 2 * dpr)), y0, Math.max(1, Math.round(sw)), bh);
    }
    g.font = `${fs}px VT323, monospace`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const txt = `${sup ? 'SUPER !' : 'COMBO ×' + k.n} · ${C.shown(c).toUpperCase()}`, ty = y0 - Math.round(fs * 0.35);
    g.globalAlpha = 0.9; g.fillStyle = rgba(col, 1); g.fillText(txt, W / 2 + dpr, ty + dpr);
    g.globalAlpha = 1; g.fillStyle = sup && blink > 0.5 ? '#fff36b' : '#ffffff'; g.fillText(txt, W / 2, ty);
    if (!sup) { g.globalAlpha = 0.85; g.font = `${Math.round(fs * 0.7)}px VT323, monospace`; g.fillStyle = '#d8c8ff'; g.fillText(k.charge >= 1 ? 'SUR LE TEMPS…' : 'TIENS LA POSITION · JOUE DES NOTES', W / 2, y0 + bh + Math.round(fs * 0.85)); }
    g.textAlign = 'start'; g.globalAlpha = 1;
  }) });

  // ---- sources: the hand on the knobs (user; a MIDI CC on the macros' settings), the notes heard, Stop
  const watch = () => {
    const S = AMB.store; if (!S || typeof S.on !== 'function') return;
    S.on((key, v, src) => {
      let kn = null;
      if (key.startsWith('macro.') && src === 'user') kn = key.slice(6);
      else if (src === 'cc' && MACRO_OF_CC(key)) kn = MACRO_OF_CC(key);
      if (kn) C.touched[kn] = C.clock();
      if ((src === 'user' || src === 'cc') && key.startsWith('fx.')) C.touched[key] = C.clock(); // the instrument's effects (Écho…)
    });
  };
  watch();
  if (AMB.bus) {
    AMB.bus.on('live', () => C.note('live'));
    AMB.bus.on('note', (n) => { if (n && !n.live && (n.layer === 'bells' || n.layer === 'seq')) C.note('melody'); });
    AMB.bus.on('chord', (c) => { if (c && c.forced) C.note('chord'); });
    AMB.bus.on('panic', () => C.stop());
    ['game:mode', 'game:reset'].forEach((e) => AMB.bus.on(e, () => { C.stop(); C.touched = {}; }));
  }
  AMB.cityCombos = C;
})();
