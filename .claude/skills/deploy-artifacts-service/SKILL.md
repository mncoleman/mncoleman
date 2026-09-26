---
name: deploy-artifacts-service
description: Deploy the mncoleman artifact service (Bun + Hono container behind artifacts.mncoleman.com) to the Oracle ARM box. Use when shipping any change under server/ in the mncoleman repo, or when Matthew says "deploy the artifact service", "ship the server", "rebuild the artifacts container". Handles the chunked image transfer a `docker save | ssh` one-liner cannot do, and carries the live container env forward instead of retyping flags.
metadata:
  origin: agent
  created: 2026-08-05
  project: mncoleman
---

# Deploy the artifact service to the Oracle ARM box

Pushing to `main` does **not** deploy this. `server/` deploys separately from the site and
the Workers in the mncoleman repo; this is its own build-and-ship.

Two things make this non-obvious, and both have broken a real deploy:

1. **The obvious `docker save | ssh 'docker load'` one-liner does not work.** Sustained
   uploads to this box get reset. Plain `scp` of the ~96 MB tarball has died after 512 KB,
   and macOS ships `openrsync`, which has no `--append-verify` to resume with — it exits with
   a usage error that, inside a retry loop, looks like a hang producing 0-byte files.
2. **`server/README.md`'s `docker run` block has drifted before.** Retyping those flags is
   how the visitor guestbook and geocoding get silently killed. Carry the live env forward.

## Order matters when the Worker is also changing

The admin Worker mints the JWT the service authorises against, and stamps the `role` claim
the service gates private-artifact passwords on. **Deploy the Worker first**, then this. In
reverse, tokens carry no role while the service already requires it, and the admin password
column goes blank for everyone — including the owner.

## Steps

```bash
KEY="$HOME/Desktop/SSH Info/ssh-key-2025-06-27.key"
BOX=ubuntu@161.153.110.196
cd ~/Code/personal-repos/mncoleman/server

# 1. Build. The box is arm64; so is this Mac, so a native build matches.
bash scripts/fetch-fonts.sh          # no-op if fonts are cached
docker build --platform linux/arm64 -t artifacts:latest .
docker inspect artifacts:latest --format '{{.Architecture}}'   # must print arm64

# 2. Save and chunk.
docker save artifacts:latest | gzip > /tmp/artifacts.tar.gz
mkdir -p /tmp/chunks && rm -f /tmp/chunks/part-*
split -b 8m /tmp/artifacts.tar.gz /tmp/chunks/part-
md5 -q /tmp/artifacts.tar.gz         # keep this value for step 4

# 3. Ship each chunk, verifying SIZE per chunk. This is what makes it reliable.
ssh -i "$KEY" $BOX 'rm -rf /tmp/artchunks && mkdir -p /tmp/artchunks'
for f in /tmp/chunks/part-*; do
  b=$(basename "$f"); L=$(stat -f %z "$f")
  for try in $(seq 1 8); do
    scp -o ConnectTimeout=20 -o ServerAliveInterval=10 -i "$KEY" "$f" $BOX:/tmp/artchunks/"$b" >/dev/null 2>&1
    R=$(ssh -i "$KEY" $BOX "stat -c %s /tmp/artchunks/$b 2>/dev/null || echo 0")
    [ "$R" = "$L" ] && { echo "$b ok"; break; }
    [ $try -eq 8 ] && { echo "$b FAILED"; exit 1; }
    sleep 2
  done
done

# 4. Reassemble, VERIFY, load. Never load without comparing the md5 first.
ssh -i "$KEY" $BOX 'cat /tmp/artchunks/part-* > /tmp/artifacts.tar.gz && rm -rf /tmp/artchunks && md5sum /tmp/artifacts.tar.gz'
ssh -i "$KEY" $BOX 'docker load < /tmp/artifacts.tar.gz && rm -f /tmp/artifacts.tar.gz'
```

### 5. Recreate the container — carry env forward, keep a rollback

```bash
ssh -i "$KEY" $BOX 'bash -s' <<'REMOTE'
set -e
umask 077
docker inspect artifacts --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -v '^PATH=' | grep -v '^$' > /tmp/artifacts.env
echo "env vars carried: $(wc -l < /tmp/artifacts.env)"    # expect 13

docker stop artifacts
docker rename artifacts artifacts_prev     # rollback, NOT `docker rm`

docker run -d --name artifacts --restart unless-stopped \
  --memory=1g --memory-swap=2g \
  -p 127.0.0.1:7878:7878 \
  --env-file /tmp/artifacts.env \
  -v artifacts_data:/data -v /srv/library:/library \
  artifacts:latest
rm -f /tmp/artifacts.env
sleep 6
docker ps --filter name=artifacts --format "{{.Names}} | {{.Status}}"
curl -s -o /dev/null -w "health:%{http_code}\n" http://127.0.0.1:7878/health
REMOTE
```

**Never `docker rm -v`.** The `artifacts_data` volume holds every hosted artifact plus
`visitors.db`.

### 6. Verify through the public edge, then clean up

```bash
curl -s -o /dev/null -w "list:%{http_code}\n"     https://artifacts.mncoleman.com/api/list
curl -s -o /dev/null -w "library:%{http_code}\n"  https://artifacts.mncoleman.com/api/library/list
curl -s -o /dev/null -w "visitors:%{http_code}\n" https://artifacts.mncoleman.com/api/visitors
```

`/api/visitors` is the **canary**: it is the only endpoint that fails if `VISITOR_IP_SALT`,
`VISITOR_TOKEN_SECRET` or `GEOAPIFY_KEY` were dropped during the recreate.

If a security or authorization change shipped, verify the *behaviour* through the public
edge rather than reading the source — e.g. confirm `/api/list` exposes no `password` field
and `/api/admin/list` returns 401 unauthenticated.

Only once everything is green:

```bash
ssh -i "$KEY" $BOX 'docker rm artifacts_prev'   # previous image stays for rollback
```

## Notes

- OG cards are versioned. After changing `server/src/og.tsx`, bump `OG_VERSION` and stored
  cards re-render lazily on next read (no backfill step), and the
  matching change must also be made to `lib/og-card.tsx` in the Next.js app.
- The alternative rsync-then-build-on-the-box path still works if the network cooperates,
  but the chunked transfer above has succeeded first-try every time.
