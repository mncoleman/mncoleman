#!/usr/bin/env python3
"""Call the mncoleman.com admin Worker from the ARM box, signed in as a connected app.

The brief runner uses this so the model itself never holds an admin tool: the
script reads the source library, publishes the edition the model wrote, claims
queued requests and reports runs. The token is an MCP OAuth token (the same
sign-in a connected Claude uses), so it reaches only the routes listed in
mcpRouteAllowed (worker/mcp-oauth.ts), and removing "Brief agent (Oracle ARM
server)" under Connected apps on the admin Overview cuts it off.

  login --out FILE     One-time, on a machine with a browser. Registers a client
                       on a loopback callback, signs in through the admin Worker,
                       and writes {client_id, refresh_token} to FILE (mode 600).
                       Never prints a token.
  api METHOD PATH [BODY]
                       Call an admin Worker route, e.g. api GET /api/briefs.
                       BODY is JSON, or @path to read it from a file. Prints the
                       response body; exit 2 on an HTTP error status.

State lives in $MCP_STATE (default ./oauth.json next to this file). Refresh
tokens rotate on every use and a stale one, replayed later, ends the grant, so
the file is rewritten atomically under an exclusive lock straight after each
refresh. Access tokens last an hour and are cached until five minutes before
they expire.

Python standard library only.
"""
import base64
import fcntl
import hashlib
import http.server
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

AUTH = "https://mncoleman-admin-auth.mncoleman.workers.dev"  # also the admin API
RESOURCE = "https://mncoleman.com/mcp/admin"
HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.environ.get("MCP_STATE", os.path.join(HERE, "oauth.json"))
UA = "mncoleman-brief-agent/1"


def post(url, body, headers, form=False):
    data = urllib.parse.urlencode(body).encode() if form else json.dumps(body).encode()
    h = {"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" if form else "application/json"}
    h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def write_state(state):
    tmp = STATE + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(state, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, STATE)


def access_token():
    lock = open(STATE + ".lock", "a")
    fcntl.flock(lock, fcntl.LOCK_EX)
    try:
        with open(STATE) as f:
            state = json.load(f)
        if state.get("access_token") and state.get("access_exp", 0) - 300 > time.time():
            return state["access_token"]
        status, text = post(AUTH + "/oauth/token", {
            "grant_type": "refresh_token",
            "refresh_token": state["refresh_token"],
            "client_id": state["client_id"],
            "resource": RESOURCE,
        }, {}, form=True)
        if status != 200:
            raise SystemExit(f"token refresh failed ({status}): {text[:300]}")
        tok = json.loads(text)
        state.update(
            refresh_token=tok["refresh_token"],
            access_token=tok["access_token"],
            access_exp=time.time() + int(tok.get("expires_in", 3600)),
            refreshed_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )
        write_state(state)
        return state["access_token"]
    finally:
        fcntl.flock(lock, fcntl.LOCK_UN)
        lock.close()


def api(method, path, body=None):
    req = urllib.request.Request(AUTH + path, method=method, data=None if body is None else json.dumps(body).encode(), headers={
        "User-Agent": UA,
        "Authorization": "Bearer " + access_token(),
        # The Worker's CSRF gate wants this on every state-changing request; no Origin is sent.
        "X-Requested-With": "mncoleman-admin",
        **({"Content-Type": "application/json"} if body is not None else {}),
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def login(out):
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state_param = secrets.token_urlsafe(16)
    got = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            got.update({k: v[0] for k, v in q.items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Signed in. You can close this tab.")

        def log_message(self, *a):
            pass

    srv = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    redirect = f"http://127.0.0.1:{srv.server_port}/callback"
    status, text = post(AUTH + "/oauth/register", {
        "client_name": "Brief agent (Oracle ARM server)",
        "redirect_uris": [redirect],
        "grant_types": ["authorization_code", "refresh_token"],
        "token_endpoint_auth_method": "none",
    }, {})
    if status not in (200, 201):
        raise SystemExit(f"register failed ({status}): {text[:300]}")
    client_id = json.loads(text)["client_id"]
    url = AUTH + "/oauth/authorize?" + urllib.parse.urlencode({
        "response_type": "code", "client_id": client_id, "redirect_uri": redirect,
        "code_challenge": challenge, "code_challenge_method": "S256",
        "state": state_param, "resource": RESOURCE, "scope": "admin",
    })
    print("Opening the sign-in page. If it does not open, visit:\n" + url, file=sys.stderr)
    webbrowser.open(url)
    while "code" not in got and "error" not in got:
        srv.handle_request()
    if got.get("error") or got.get("state") != state_param:
        raise SystemExit(f"sign-in failed: {got.get('error')} {got.get('error_description', '')}")
    status, text = post(AUTH + "/oauth/token", {
        "grant_type": "authorization_code", "code": got["code"], "redirect_uri": redirect,
        "client_id": client_id, "code_verifier": verifier, "resource": RESOURCE,
    }, {}, form=True)
    if status != 200:
        raise SystemExit(f"code exchange failed ({status}): {text[:300]}")
    tok = json.loads(text)
    global STATE
    STATE = out
    write_state({"client_id": client_id, "refresh_token": tok["refresh_token"]})
    print(f"Saved to {out}", file=sys.stderr)


def main(argv):
    if len(argv) >= 3 and argv[1] == "login" and argv[2] == "--out":
        login(argv[3])
        return 0
    if len(argv) >= 4 and argv[1] == "api":
        body = None
        if len(argv) > 4:
            raw = argv[4]
            if raw.startswith("@"):
                with open(raw[1:]) as f:
                    raw = f.read()
            body = json.loads(raw)
        status, text = api(argv[2].upper(), argv[3], body)
        print(text)
        return 0 if status < 400 else 2
    print(__doc__, file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
