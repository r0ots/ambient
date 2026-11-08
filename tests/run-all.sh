#!/bin/bash
# Runs every headless test page, N in parallel (PAR, default 3); fails on any JS error / exception / missing DONE.
cd "$(dirname "$0")"
# longest pages first so batches finish together
PAGES="engines smoke spectrum generator phrase lfo prog freeze play share wav reverb"
TMP=$(mktemp -d); FAIL=0
run() { ./run.sh $1.html "${SCALE:-0.4}" > "$TMP/$1.out"; }
set -- $PAGES
while [ $# -gt 0 ]; do
  for p in $(echo "$@" | tr " " "\n" | head -n ${PAR:-3}); do run "$p" & done
  wait; shift ${PAR:-3} 2>/dev/null || shift $#
done
# headless Chrome occasionally fails to load a page under parallel load: retry those once, alone
for p in $PAGES; do grep -q "^DONE" "$TMP/$p.out" || run "$p"; done
for p in $PAGES; do
  echo "== $p"; sed 's/^/   /' "$TMP/$p.out"
  grep -q "^DONE" "$TMP/$p.out" || { echo "   !! no DONE"; FAIL=1; }
  grep -qE "^(ERROR|EXC|REJECT|CONSOLE.ERROR)" "$TMP/$p.out" && FAIL=1
done
rm -rf "$TMP"
[ $FAIL = 0 ] && echo "ALL OK" || { echo "FAILURES"; exit 1; }
