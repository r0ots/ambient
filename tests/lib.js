// Common header for headless test pages (tests/run.sh reads the /__log requests of the static server).
// Load it first: <script src="lib.js"></script>. It gives:
//   TAG (page name), S (wait scale, ?s=), log(msg), ok(cond, msg), wait(ms), done(), fail(err)
//   and captures JS errors, unhandled rejections and console.error as ERROR / REJECT / CONSOLE.ERROR lines.
// Pages that test a module without the app can call testBus() to get a tiny AMB.bus.
// OLD_SAVE: the code of a #save link made by v1.04, with the fields of the features removed in v1.05 (shards 321, 3 nodes).
(function () {
  const TAG = location.pathname.split('/').pop().replace('.html', '');
  const S = +(new URLSearchParams(location.search).get('s') || 0.4);
  // one log request at a time, in order: the static server (python http.server, HTTP/1.0, listen backlog 5) resets
  // connections when several headless pages burst requests at once, which made pages fail to load under the suite's pool
  let q = Promise.resolve();
  const log = (m) => (q = q.then(() => fetch('/__log?' + encodeURIComponent(TAG + '|' + m)).catch(() => {})));
  window.TAG = TAG; window.S = S; window.log = log;
  window.ok = (c, m) => log((c ? 'ok ' : 'ERROR fail ') + m);
  window.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  window.done = () => log('DONE');
  window.fail = (e) => log('EXC ' + ((e && e.stack) || e));
  window.onerror = (m, s, l) => log('ERROR ' + m + ' @' + s + ':' + l);
  window.addEventListener('unhandledrejection', (e) => log('REJECT ' + ((e.reason && e.reason.stack) || e.reason)));
  const oe = console.error;
  console.error = (...a) => { log('CONSOLE.ERROR ' + a.join(' ')); oe(...a); };
  window.OLD_SAVE = 'beyJhcHAiOiJqYXJkaW4tc29ub3JlIiwia2luZCI6InNhdmUiLCJ2IjoxLCJhdCI6MTc2MjkwMDAwMDAwMCwiZ2FtZSI6eyJ2IjoxLCJtb2RlIjoicGF0aCIsInNoYXJkcyI6MzIxLCJlYXJuZWQiOjQwMCwibm9kZXMiOlsicmFjaW5lIiwidC5zb24iLCJoLnBhZCJdLCJmb3VuZCI6W10sImNvbnRyYWN0cyI6W10sInB1enpsZXMiOltdLCJzdGFycyI6e30sIm9wZW5lZCI6W10sInJ1bnMiOnt9LCJwekhlbHAiOmZhbHNlLCJhY3RpdmUiOltdLCJwcm9nIjp7fSwic2tpcHBlZCI6W10sImVuZGVkIjpmYWxzZSwicHJvZmlsZSI6ImRlY291dmVydGUiLCJwbGFjZWQiOlsiaC5wYWQiXSwicGxhY2VtZW50Ijp7ImF0IjoxLCJwYXNzZWQiOlsiaGFybW9uaWUiXX0sInNlY3JldHMiOnsiZm91bmQiOnsidG9ucyI6MX0sInNlY3MiOjEwLCJtaXJyb3JPbiI6ZmFsc2UsInRoZW1lIjoiIiwiZ2lmdHMiOnsidGltYnJlcyI6W10sInRoZW1lcyI6W10sIm1pcnJvciI6ZmFsc2UsInBhY3RzIjpbIm1ldHJvbm9tZSJdfX19LCJhcmNhZGUiOnsidiI6MSwicHJvZmlsZSI6ImRlZmF1bHQiLCJwcm9maWxlcyI6eyJkZWZhdWx0Ijp7ImdhbWVzIjp7ImhhdXRiYXMiOnsiZCI6MC40LCJwZWFrIjowLjUsInN0ZXAiOjAuMSwicGxheXMiOjIsImJlc3QiOnt9fX19fX0sImRhaWx5Ijp7InYiOjEsIm5hbWUiOiJNYXgiLCJkYXlzIjp7fSwiYm9hcmQiOnt9fX0';
  window.testBus = () => {
    const A = (window.AMB = window.AMB || {});
    A.bus = A.bus || { fns: {}, on(e, f) { (this.fns[e] = this.fns[e] || []).push(f); }, emit(e, d) { (this.fns[e] || []).forEach((f) => f(d)); } };
    return A.bus;
  };
})();
