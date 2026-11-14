#!/bin/bash
# Headless test of one page: prints its tagged log lines (levels, checks, JS errors).
# Needs a static server on :$PORT (default 8765) logging requests to $LOG (python3 -u -m http.server $PORT 2> $LOG).
# Usage: LOG=... ./run.sh page.html [scale]   (scale multiplies all waits, default 0.4)
LOG=${LOG:-/tmp/ambient-server.log}; PORT=${PORT:-8765}; HOST=${HOST:-localhost}
PAGE=${1:-smoke.html}; TAG=${PAGE%.html}; SCALE=${2:-0.4}
START=$(( $(wc -l < "$LOG") + 1 ))
# one page loads at a time (the others keep running): python's http.server resets connections when several headless
# Chromes fetch their ~40 scripts at once (listen backlog 5), and a page then fails to load
LOCK="${TMPDIR:-/tmp}/ambient-launch.lock"
launch() {
  for _ in $(seq 1 30); do mkdir "$LOCK" 2>/dev/null && break; sleep 0.1; done
  UD=$(mktemp -d)
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --autoplay-policy=no-user-gesture-required \
    --user-data-dir="$UD" --no-first-run --disable-gpu $([ "$PAGE" = city-gl.html ] && echo --enable-unsafe-swiftshader) --mute-audio --disable-audio-output "http://$HOST:$PORT/tests/$PAGE?s=$SCALE" >/dev/null 2>&1 &
  CPID=$!
  ( sleep ${LOCK_S:-0.6}; rmdir "$LOCK" 2>/dev/null ) &
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
    echo "$out" | grep -q "^DONE" && break 2
    # errors before any normal line = the app did not load (a script refused by the server under load): relaunch now
    if [ -n "$out" ] && ! echo "$out" | grep -qvE "^(EXC|ERROR|REJECT|CONSOLE|[[:space:]])"; then why='load failure'; [ $i -ge 3 ] && break; continue; fi
    echo "$out" | grep -q "^EXC" && break 2
    [ $i -ge 16 ] && [ -z "$out" ] && { why='no output in 8 s'; break; }
    why='no DONE in 50 s'
  done
  echo "($TAG: attempt $attempt: $why, relaunched)" >&2
  stopc
done
stopc
lines
