// Common harness of the gameui*.html pages (the app in an iframe, path chosen): gameUI(body, {choose}) loads
// ../index.html with its own game key, then runs `await body(T)` with T = {f, w, d, A, shown, locked, tn, task, lline,
// buyAll, sdiff}; logs DONE (or EXC) and clears the key. Split from one long page (v1.16) so the suite stays ~1 min.
window.gameUI = (body, o = {}) => {
  const KEY = 'ambient.game.uitest';
  localStorage.removeItem(KEY);
  const f = document.createElement('iframe'); f.id = 'f'; f.style.cssText = 'width:1300px;height:900px';
  f.src = '../index.html?gamekey=' + KEY;
  f.addEventListener('load', async () => {
    if (f.dataset.ran) return; f.dataset.ran = 1; // a test may reload the iframe
    try {
      const w = f.contentWindow, d = f.contentDocument, A = w.AMB;
      w.addEventListener('error', (e) => log('ERROR ' + e.message + ' @' + e.filename + ':' + e.lineno));
      const shown = (sel) => { const e = d.querySelector(sel); return !!e && e.getClientRects().length > 0 && !e.closest('.is-locked'); };
      const locked = (sel) => { const e = d.querySelector(sel); return !!e && !!e.closest('.is-locked'); };
      const tn = (id) => d.querySelector('.tree-node[data-id="' + id + '"]');
      const buyAll = () => { A.game.reset(); let guard = 0; while (A.tree.NODES.some((n) => !A.game.has(n.id)) && guard++ < 200) A.tree.NODES.forEach((n) => { if (A.tree.status(n.id) === 'available') A.game.unlock(n.id); }); };
      const sdiff = (was, now) => Object.keys(now).filter((k) => JSON.stringify(now[k]) !== JSON.stringify(was[k])).map((k) => k + ':' + JSON.stringify(was[k]) + '→' + JSON.stringify(now[k])).join(' ');
      if (o.choose !== false) { d.querySelector('[data-choose=path]').click(); await wait(50); }
      await body({ f, w, d, A, shown, locked, tn, task: d.getElementById('lcdTask'), lline: d.getElementById('lcdLine'), buyAll, sdiff, KEY });
      for (const k of Object.keys(localStorage)) if (k.startsWith(KEY)) localStorage.removeItem(k);
      log('DONE');
    } catch (e) { log('EXC ' + e.stack); }
  });
  document.body.append(f);
};
