#!/bin/bash
# Cron, every 5 minutes. Checks in with the admin Worker, then starts run.sh when the
# admin panel has queued a request, or when the daily time has come and today's
# scheduled run has not happened yet. Nothing else on the box decides when to run.
#
# The scheduled run fires once per Mountain date, any time in the 3 hours after the
# configured time (so a short outage or a reboot still gets the edition out), and never
# later than that: turning the schedule on at 5 PM does not publish a surprise edition.
set -u
cd "$(dirname "$0")"
HERE=$(pwd)
LOG="$HERE/runs/tick.log"
mkdir -p runs

# A run is already going: leave any request queued for the next tick.
exec 9>"$HERE/run.lock"
flock -n 9 || exit 0
flock -u 9

STATE=$(python3 site_api.py api GET /api/briefs/agent) || { echo "$(date -Is) check-in failed: ${STATE:0:300}" >> "$LOG"; exit 1; }

eval "$(python3 - "$STATE" "$HERE/runs/extra.txt" <<'PY'
import json, shlex, sys
s = json.loads(sys.argv[1]); c = s["config"]; r = s.get("request")
open(sys.argv[2], "w").write(c.get("instructions") or "")
print(f"ENABLED={'1' if c.get('enabled') else '0'} AT={shlex.quote(c.get('time','06:00'))} MODEL={shlex.quote(c.get('model','claude-sonnet-5-5'))} HAS_REQUEST={'1' if r else '0'}")
PY
)"
export MODEL EXTRA_FILE="$HERE/runs/extra.txt"

if [ "$HAS_REQUEST" = "1" ]; then
  # Claim it: the DELETE returns the request and removes it, so it runs once.
  REQ=$(python3 site_api.py api DELETE /api/briefs/agent/request) || exit 1
  eval "$(python3 - "$REQ" <<'PY'
import json, shlex, sys
r = json.loads(sys.argv[1]).get("request") or {}
print(f"R_MODE={shlex.quote(r.get('mode',''))} R_DATE={shlex.quote(r.get('date',''))} R_ASK={shlex.quote(r.get('instructions',''))}")
PY
)"
  [ -n "$R_MODE" ] || exit 0
  echo "$(date -Is) request: $R_MODE ${R_DATE:-today}" >> "$LOG"
  [ -n "$R_DATE" ] && export DATE="$R_DATE"
  TRIGGER=manual ASK="$R_ASK" exec ./run.sh "$R_MODE"
fi

[ "$ENABLED" = "1" ] || exit 0
TODAY=$(TZ=America/Denver date +%F)
[ "$(cat runs/last-scheduled 2>/dev/null)" = "$TODAY" ] && exit 0
NOWMIN=$((10#$(TZ=America/Denver date +%H) * 60 + 10#$(TZ=America/Denver date +%M)))
ATMIN=$((10#${AT%%:*} * 60 + 10#${AT##*:}))
if [ $NOWMIN -ge $ATMIN ] && [ $NOWMIN -lt $((ATMIN + 180)) ]; then
  echo "$TODAY" > runs/last-scheduled
  echo "$(date -Is) scheduled run for $TODAY" >> "$LOG"
  TRIGGER=scheduled exec ./run.sh full
fi
