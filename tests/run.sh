#!/bin/bash
# Headless test of one page: prints its tagged log lines (levels, checks, JS errors).
# Needs a static server on :$PORT (default 8765) logging requests to $LOG (python3 -u -m http.server $PORT 2> $LOG).
# Usage: LOG=... ./run.sh page.html [scale]   (scale multiplies all waits, default 0.4)
LOG=${LOG:-/tmp/ambient-server.log}; PORT=${PORT:-8765}
PAGE=${1:-smoke.html}; TAG=${PAGE%.html}; SCALE=${2:-0.4}
START=$(( $(wc -l < "$LOG") + 1 ))
launch() {
  UD=$(mktemp -d)
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --autoplay-policy=no-user-gesture-required \
    --user-data-dir="$UD" --no-first-run --disable-gpu --mute-audio --disable-audio-output "http://localhost:$PORT/tests/$PAGE?s=$SCALE" >/dev/null 2>&1 &
  CPID=$!
}
stopc() { kill $CPID 2>/dev/null; sleep 0.3; rm -rf "$UD" 2>/dev/null; }
lines() { tail -n +$START "$LOG" | grep "__log?$TAG%7C" | sed -E 's/.*__log\?([^ ]*) HTTP.*/\1/' | python3 -c "import sys,urllib.parse;[print(urllib.parse.unquote(l.strip()).split('|',1)[1]) for l in sys.stdin]"; }
# A page whose audio context never starts logs nothing: relaunch it after 8 s instead of waiting the full timeout.
for attempt in 1 2 3; do
  START=$(( $(wc -l < "$LOG") + 1 ))
  launch
  for i in $(seq 1 100); do
    sleep 0.5
    out=$(lines)
    echo "$out" | grep -qE "^(DONE|EXC)" && break 2
    [ $i -ge 16 ] && [ -z "$out" ] && break
  done
  stopc
done
stopc
lines
