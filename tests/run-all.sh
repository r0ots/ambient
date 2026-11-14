#!/bin/bash
# Runs every headless test page (the SLOW audio demo pages only with ALL=1), through a pool of PAR workers (default 5); fails on any JS error / exception / missing DONE.
cd "$(dirname "$0")"
# longest pages first so batches finish together
PAGES="gameui gameui-play garden-visual generator dark gameui-end midi-path phrase lfo prog freeze play share wav reverb grains journal macros history app patches pianoroll pulses chords midi automation song looper bass motion game balance placement demandes tree-map secrets juice combos free-intact narrow regards"
# slow audio demo pages (no ok() assertions): ALL=1 tests/run-all.sh
SLOW="engines smoke spectrum"
[ -n "$ALL" ] && PAGES="$SLOW $PAGES"
T0=$(date +%s); TMP=$(mktemp -d); FAIL=0; export TMP SCALE
# its own static server for the run (any free port): threaded, with a deep listen backlog. python's plain http.server
# (backlog 5) resets connections when several headless Chromes fetch their ~40 scripts at once, and pages failed to load
python3 -u -c 'import http.server as h, functools, sys
class S(h.ThreadingHTTPServer): request_queue_size = 512; daemon_threads = True
s = S(("127.0.0.1", 0), functools.partial(h.SimpleHTTPRequestHandler, directory=".."))
print(s.server_address[1], file=open(sys.argv[1], "w"), flush=True); s.serve_forever()' "$TMP/port" 2> "$TMP/server.log" &
SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT
for _ in $(seq 1 50); do [ -s "$TMP/port" ] && break; sleep 0.1; done
export PORT=$(cat "$TMP/port") LOG="$TMP/server.log" HOST=127.0.0.1 LOCK_S=0.25
run() { local t0=$(date +%s); ./run.sh $1.html "${SCALE:-0.4}" > "$TMP/$1.out"; echo "$1 $(( $(date +%s) - t0 ))" >> "$TMP/times"; }
export -f run
# job pool (not fixed batches): a slow page no longer holds back the others
echo $PAGES | tr " " "\n" | xargs -P ${PAR:-5} -I{} bash -c 'run {}'
# headless Chrome occasionally fails to load a page under parallel load: retry those once, alone
for p in $PAGES; do grep -q "^DONE" "$TMP/$p.out" || { echo "(retry $p: $(grep -cE '^ok' "$TMP/$p.out") ok, $(grep -E '^(EXC|ERROR)' "$TMP/$p.out" | head -1 | cut -c1-160))"; run "$p"; }; done
for p in $PAGES; do
  echo "== $p"; sed 's/^/   /' "$TMP/$p.out"
  grep -q "^DONE" "$TMP/$p.out" || { echo "   !! no DONE"; FAIL=1; }
  grep -qE "^(ERROR|EXC|REJECT|CONSOLE.ERROR)" "$TMP/$p.out" && FAIL=1
done
echo "slowest pages (s):"; sort -k2 -nr "$TMP/times" | head -6 | tr "\n" " "; echo; echo "total $(( $(date +%s) - T0 )) s"
rm -rf "$TMP"
[ $FAIL = 0 ] && echo "ALL OK" || { echo "FAILURES"; exit 1; }
