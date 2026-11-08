#!/bin/bash
# Headless test of one page: prints its tagged log lines (levels, checks, JS errors).
# Needs a static server on :8765 logging requests to $LOG (python3 -u -m http.server 8765 2> $LOG).
# Usage: LOG=... ./run.sh page.html [scale]   (scale multiplies all waits, default 0.4)
LOG=${LOG:-/tmp/ambient-server.log}
PAGE=${1:-smoke.html}; TAG=${PAGE%.html}; SCALE=${2:-0.4}
START=$(( $(wc -l < "$LOG") + 1 ))
UD=$(mktemp -d)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --autoplay-policy=no-user-gesture-required \
  --user-data-dir="$UD" --no-first-run --disable-gpu --mute-audio "http://localhost:8765/tests/$PAGE?s=$SCALE" >/dev/null 2>&1 &
CPID=$!
lines() { tail -n +$START "$LOG" | grep "__log?$TAG%7C" | sed -E 's/.*__log\?([^ ]*) HTTP.*/\1/' | python3 -c "import sys,urllib.parse;[print(urllib.parse.unquote(l.strip()).split('|',1)[1]) for l in sys.stdin]"; }
for i in $(seq 1 100); do sleep 0.5; lines | grep -qE "^(DONE|EXC)" && break; done
kill $CPID 2>/dev/null; sleep 0.5; rm -rf "$UD" 2>/dev/null
lines
