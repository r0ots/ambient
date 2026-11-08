#!/bin/bash
# Headless smoke test: plays each layer/preset and prints RMS/peak levels + any JS error.
# Needs a static server on :8765 logging requests to $LOG (python3 -u -m http.server 8765 2> $LOG).
LOG=${LOG:-/tmp/ambient-server.log}
PAGE=${1:-smoke.html}
START=$(( $(wc -l < "$LOG") + 1 ))
UD=$(mktemp -d)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --autoplay-policy=no-user-gesture-required \
  --user-data-dir="$UD" --no-first-run --disable-gpu "http://localhost:8765/tests/$PAGE" >/dev/null 2>&1 &
CPID=$!
for i in $(seq 1 150); do sleep 1; tail -n +$START "$LOG" | grep -q "DONE\|EXC" && break; done
sleep 1; kill $CPID 2>/dev/null; sleep 1; rm -rf "$UD" 2>/dev/null
tail -n +$START "$LOG" | grep __log | sed -E 's/.*__log\?([^ ]*) HTTP.*/\1/' | python3 -c "import sys,urllib.parse;[print(urllib.parse.unquote(l.strip())) for l in sys.stdin]"
