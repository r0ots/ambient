#!/bin/bash
# Runs every headless test page, through a pool of PAR workers (default 4); fails on any JS error / exception / missing DONE.
cd "$(dirname "$0")"
# longest pages first so batches finish together
PAGES="engines smoke spectrum generator phrase lfo prog freeze play share wav reverb grains journal macros history app patches pianoroll pulses chords midi automation song bass game gameui balance audition arcade arcade-ui tree-map secrets arcade-intrus arcade-bouge arcade-reponds arcade-modes arcade-accordeur arcade-dictee placement pacts midi-path latency save daily duel garden-visual free-intact"
TMP=$(mktemp -d); FAIL=0; export TMP SCALE
run() { local t0=$(date +%s); ./run.sh $1.html "${SCALE:-0.4}" > "$TMP/$1.out"; echo "$1 $(( $(date +%s) - t0 ))" >> "$TMP/times"; }
export -f run
# job pool (not fixed batches): a slow page no longer holds back the others
echo $PAGES | tr " " "\n" | xargs -P ${PAR:-4} -I{} bash -c 'run {}'
# headless Chrome occasionally fails to load a page under parallel load: retry those once, alone
for p in $PAGES; do grep -q "^DONE" "$TMP/$p.out" || { echo "(retry $p)"; run "$p"; }; done
for p in $PAGES; do
  echo "== $p"; sed 's/^/   /' "$TMP/$p.out"
  grep -q "^DONE" "$TMP/$p.out" || { echo "   !! no DONE"; FAIL=1; }
  grep -qE "^(ERROR|EXC|REJECT|CONSOLE.ERROR)" "$TMP/$p.out" && FAIL=1
done
echo "slowest pages (s):"; sort -k2 -nr "$TMP/times" | head -6 | tr "\n" " "; echo
rm -rf "$TMP"
[ $FAIL = 0 ] && echo "ALL OK" || { echo "FAILURES"; exit 1; }
