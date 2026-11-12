// Common header for headless test pages (tests/run.sh reads the /__log requests of the static server).
// Load it first: <script src="lib.js"></script>. It gives:
//   TAG (page name), S (wait scale, ?s=), log(msg), ok(cond, msg), wait(ms), done(), fail(err)
//   and captures JS errors, unhandled rejections and console.error as ERROR / REJECT / CONSOLE.ERROR lines.
// Pages that test the pure arcade engine can call testBus() to get a tiny AMB.bus without the app.
(function () {
  const TAG = location.pathname.split('/').pop().replace('.html', '');
  const S = +(new URLSearchParams(location.search).get('s') || 0.4);
  const log = (m) => fetch('/__log?' + encodeURIComponent(TAG + '|' + m)).catch(() => {});
  window.TAG = TAG; window.S = S; window.log = log;
  window.ok = (c, m) => log((c ? 'ok ' : 'ERROR fail ') + m);
  window.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.done = () => log('DONE');
  window.fail = (e) => log('EXC ' + ((e && e.stack) || e));
  window.onerror = (m, s, l) => log('ERROR ' + m + ' @' + s + ':' + l);
  window.addEventListener('unhandledrejection', (e) => log('REJECT ' + ((e.reason && e.reason.stack) || e.reason)));
  const oe = console.error;
  console.error = (...a) => { log('CONSOLE.ERROR ' + a.join(' ')); oe(...a); };
  window.testBus = () => {
    const A = (window.AMB = window.AMB || {});
    A.bus = A.bus || { fns: {}, on(e, f) { (this.fns[e] = this.fns[e] || []).push(f); }, emit(e, d) { (this.fns[e] || []).forEach((f) => f(d)); } };
    return A.bus;
  };
})();
