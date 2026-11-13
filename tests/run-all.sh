#!/bin/bash
# Runs every headless test page (the SLOW audio demo pages only with ALL=1), through a pool of PAR workers (default 5); fails on any JS error / exception / missing DONE.
cd "$(dirname "$0")"
# longest pages first so batches finish together
PAGES="gameui gameui-play garden-visual generator gameui-end midi-path phrase lfo prog freeze play share wav reverb grains journal macros history app patches pianoroll pulses chords midi automation song bass game balance placement demandes tree-map secrets juice combos free-intact narrow regards"
# slow audio demo pages (no ok() assertions): ALL=1 tests/run-all.sh
SLOW="engines smoke spectrum"
[ -n "$ALL" ] && PAGES="$SLOW $PAGES"
T0=$(date +%s); TMP=$(mktemp -d); FAIL=0; export TMP SCALE
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
