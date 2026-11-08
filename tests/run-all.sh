#!/bin/bash
# Runs every headless test page; fails if any JS error / exception is logged.
cd "$(dirname "$0")"
FAIL=0
for p in smoke engines phrase share play freeze prog wav spectrum lfo; do
  OUT=$(./run.sh $p.html)
  echo "== $p"; echo "$OUT" | sed 's/^/   /'
  echo "$OUT" | grep -q "DONE" || { echo "   !! no DONE"; FAIL=1; }
  echo "$OUT" | grep -qE "^(ERROR|EXC|REJECT|CONSOLE.ERROR)" && FAIL=1
done
[ $FAIL = 0 ] && echo "ALL OK" || { echo "FAILURES"; exit 1; }
