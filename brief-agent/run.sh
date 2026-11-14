#!/bin/bash
# The MNColeman Brief, compiled on the Oracle ARM box and published to mncoleman.com.
# Normally started by tick.sh (cron, every 5 minutes), which reads the schedule and any
# queued request from the admin panel (/admin/brief, Automation). By hand:
#
#   ./run.sh                          compile today's edition from scratch
#   ASK="what to change" ./run.sh update
#                                     revise the published edition in place: the model
#                                     gets the stored edition and edits only what was asked
#   DATE=2026-11-15 ./run.sh ...      another date (Mountain Time)
#
# Optional env: MODEL, EXTRA_FILE (standing instructions), TRIGGER (scheduled|manual).
#
# The model never holds an admin tool. It researches and writes edition.json; this script
# reads the source library, publishes, sends validation errors back to the same session to
# fix (up to 3 tries), checks the public page, and reports the run to the admin panel.
# Publishing a date again replaces it and keeps its edition number.
#
# Claude runs on the subscription token in ~/cjeu-watch/oauth-token (one copy to rotate).
# Telegram bot settings come from ~/cjeu-watch/.env. Alerts are sent on failure only.
set -u
cd "$(dirname "$0")"
HERE=$(pwd)
MODE=${1:-full}
ASK=${ASK:-}
MODEL=${MODEL:-claude-sonnet-5-5}
TRIGGER=${TRIGGER:-manual}
DATE=${DATE:-$(TZ=America/Denver date +%F)}
OFFSET=$(TZ=America/Denver date -d "$DATE 12:00" +%:z)
NOW=$(TZ=America/Denver date +%Y-%m-%dT%H:%M:%S%:z)
RUN_ID="$(date -u +%Y%m%d%H%M%S)$(head -c 3 /dev/urandom | od -An -tx1 | tr -d ' \n')"
STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)
WORK="$HERE/work/$DATE-$RUN_ID"
LOG="$HERE/runs/runs.log"
CLAUDE="$HOME/.local/bin/claude"
API="python3 $HERE/site_api.py api"
mkdir -p "$WORK" runs

exec 9>"$HERE/run.lock"
flock -n 9 || { echo "$(date -Is) another run is in progress" >> "$LOG"; exit 1; }

. "$HOME/cjeu-watch/.env"
export CLAUDE_CODE_OAUTH_TOKEN=$(cat "$HOME/cjeu-watch/oauth-token")
export USER=ubuntu TMPDIR=/tmp

# Report this run to the admin panel. $1 = running|ok|failed, $2 = error text (optional).
report() {
  python3 - "$WORK" "$1" "${2:-}" "$RUN_ID" "$TRIGGER" "$MODE" "$DATE" "$STARTED" "$MODEL" "$ASK" > "$WORK/report.json" <<'PY'
import json, glob, sys, time
work, status, error, rid, trigger, mode, date, started, model, ask = sys.argv[1:11]
r = {"id": rid, "status": status, "trigger": trigger, "mode": mode, "date": date, "startedAt": started, "model": model}
if ask: r["instructions"] = ask
if error: r["error"] = error[-1000:]
if status != "running":
    r["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    cost = ms = out = 0
    for f in glob.glob(work + "/claude-*.json"):
        try: d = json.load(open(f))
        except Exception: continue
        cost += d.get("total_cost_usd") or 0; ms += d.get("duration_ms") or 0
        out += (d.get("usage") or {}).get("output_tokens", 0)
    r.update(costUsd=round(cost, 2), minutes=round(ms / 60000, 1), tokensOut=out)
    try:
        e = json.load(open(work + "/edition.json"))
        r["counts"] = {s["key"]: len(s.get("items", [])) for s in e.get("sectors", [])}
    except Exception: pass
    for f in sorted(glob.glob(work + "/publish-*.txt")):
        try: r["warnings"] = len(json.load(open(f)).get("warnings", []))
        except Exception: pass
print(json.dumps(r))
PY
  $API POST /api/briefs/agent/runs "@$WORK/report.json" > "$WORK/report.out" 2>&1 || true
  python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); print(r["status"], r["date"], r["mode"], r["trigger"], "cost=$%s" % r.get("costUsd","?"), "min=%s" % r.get("minutes","?"), r.get("counts",""), r.get("error",""))' "$WORK/report.json" \
    | sed "s|^|$(date -Is) |" >> "$LOG"
}

alert() {
  report failed "$1"
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d chat_id="${TELEGRAM_CHAT_ID}" --data-urlencode text="MNColeman Brief ($DATE, $MODE) failed: $1
Log: ~/mncoleman-brief/work/$(basename "$WORK")" > /dev/null
  exit 1
}

N=0
SID=
ask_claude() {  # $1 = prompt; resumes this run's session after the first call
  N=$((N+1))
  local resume=()
  [ -n "$SID" ] && resume=(--resume "$SID")
  (cd "$WORK" && timeout 90m "$CLAUDE" -p "$1" "${resume[@]}" --model "$MODEL" \
     --allowedTools "WebSearch,WebFetch,Task,Agent,Read,Write,Edit" \
     --max-turns 200 --output-format json > "claude-$N.json" 2> "claude-$N.err")
  local rc=$?
  SID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("session_id",""))' "$WORK/claude-$N.json" 2>/dev/null)
  [ $rc -eq 0 ] || alert "Claude stopped with code $rc on call $N. $(tail -c 300 "$WORK/claude-$N.err")"
}

report running

EXTRA=""
[ -n "${EXTRA_FILE:-}" ] && [ -s "$EXTRA_FILE" ] && EXTRA="

STANDING INSTRUCTIONS FROM MATTHEW (these override anything above they conflict with)
$(cat "$EXTRA_FILE")"

if [ "$MODE" = "update" ]; then
  [ -n "$ASK" ] || alert "an update needs instructions (ASK)"
  $API GET "/api/briefs/$DATE" > "$WORK/live.json" || alert "there is no stored edition for $DATE to update"
  # The stored edition minus what the server assigns.
  python3 - "$WORK/live.json" "$WORK/edition.json" <<'PY' || alert "the stored edition was not readable"
import json, sys
e = json.load(open(sys.argv[1]))["edition"]
e.pop("edition_number", None)
json.dump(e, open(sys.argv[2], "w"), indent=1, ensure_ascii=False)
PY
  ask_claude "edition.json in the current directory is the published MNColeman Brief for $DATE. The time now is $NOW. Revise it in place as asked below, then stop. Change only what the request covers and keep everything else exactly as it is (ids, sources, wording). Research with WebSearch and WebFetch as needed; every new fact needs a real source URL you read, and anything you touch must reflect the latest news as of now, with dates written out rather than words like today or yesterday. Set compiled_at to the time you finish, with offset $OFFSET. Same rules as the edition: plain text only, no en or em dashes, no emojis, 3 to 8 items per sector, unique item ids. End with one short line saying what you changed.

Request: $ASK$EXTRA"
else
  $API GET /api/briefs > "$WORK/briefs.json" 2> "$WORK/sources.err"
  python3 - "$WORK/briefs.json" > "$WORK/sources.json" <<'PY' || echo '{"error": "The source library could not be read for this run."}' > "$WORK/sources.json"
import json, sys
links = json.load(open(sys.argv[1]))["config"].get("links", [])
print(json.dumps({"count": len(links), "sources": links}, indent=1, ensure_ascii=False))
PY
  PROMPT=$(python3 - "$HERE/prompt.md" "$WORK/sources.json" "$DATE" "$OFFSET" "$NOW" <<'PY'
import sys
p = open(sys.argv[1]).read()
for k, v in (("SOURCES", open(sys.argv[2]).read()), ("DATE", sys.argv[3]), ("OFFSET", sys.argv[4]), ("NOW", sys.argv[5])):
    p = p.replace("{{" + k + "}}", v)
print(p)
PY
)
  ask_claude "$PROMPT$EXTRA"
fi

# Publish, feeding validation errors back to the same session.
for try in 1 2 3; do
  [ -s "$WORK/edition.json" ] || alert "the model did not write edition.json"
  python3 -c 'import json,sys; json.dump({"edition": json.load(open(sys.argv[1]))}, open(sys.argv[2], "w"))' \
    "$WORK/edition.json" "$WORK/publish-args.json" 2> "$WORK/publish-$try.txt" \
    && $API PUT "/api/briefs/$DATE" "@$WORK/publish-args.json" > "$WORK/publish-$try.txt" 2>&1
  rc=$?
  [ $rc -eq 0 ] && break
  [ $try -eq 3 ] && alert "publishing was refused 3 times: $(tail -c 400 "$WORK/publish-$try.txt")"
  ask_claude "Publishing edition.json failed. Fix exactly these problems in edition.json (each error names the field path), change nothing else, then stop:
$(tail -c 4000 "$WORK/publish-$try.txt")"
done

# Check the public copy (KV takes up to a minute to propagate).
WANT=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["compiled_at"])' "$WORK/edition.json")
ok=0
for i in 1 2 3 4 5 6 7 8; do
  got=$(curl -fsS "https://mncoleman.com/api/brief/$DATE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["edition"].get("compiled_at",""))' 2>/dev/null)
  [ "$got" = "$WANT" ] && { ok=1; break; }
  sleep 15
done
[ $ok -eq 1 ] || alert "published, but the public page did not show this edition after 2 minutes (is the brief set to Private?)"
report ok

# Keep two weeks of run folders.
find "$HERE/work" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
