# mncoleman artifact service

Tiny Bun + Hono service that hosts uploaded HTML/PDF/image artifacts at
`https://artifacts.mncoleman.com/a/<slug>` with auto-generated OG share images.

## Endpoints

| Method | Path                | Auth   | Purpose                                      |
| ------ | ------------------- | ------ | -------------------------------------------- |
| `GET`  | `/health`           | —      | Liveness probe.                              |
| `GET`  | `/api/list`         | —      | Public list of artifacts (for the website).  |
| `POST` | `/api/upload`       | Bearer | Multipart upload. `file` + optional `name`, `description`, `slug`. |
| `DELETE` | `/api/:slug`      | Bearer | Remove an artifact.                          |
| `GET`  | `/a/:slug`          | —      | Public view. HTML gets OG meta injected.     |
| `GET`  | `/raw/:slug`        | —      | Force-download the underlying file.          |
| `GET`  | `/og/:slug.png`     | —      | Cached OG image (1200x630, branded).         |
| `GET`  | `/api/library/list` | —      | Public list of "A"I library items (prompts + skills), full content included. |
| `POST` | `/api/library`      | Bearer | Create a prompt or skill. JSON body, `kind: 'prompt'\|'skill'`. |
| `PATCH`| `/api/library/:slug`| Bearer | Partial update of a library item.            |
| `DELETE`| `/api/library/:slug`| Bearer | Remove a library item.                      |
| `GET`  | `/library/:slug`    | —      | Public details/share page (server-rendered). |
| `GET`  | `/raw/library/:slug.txt\|.md\|.zip` | — | Download — prompts as `.txt`/`.md`, skills as `.zip`. |
| `GET`  | `/og/library/:slug.png` | —  | Cached OG image for a library item.          |

## Local dev

```bash
cd server
bun install
bash scripts/fetch-fonts.sh         # one-time: pulls Inter regular + semibold
cp .env.example .env                # then edit JWT_SECRET
bun run dev
```

The service listens on `:7878` and stores artifacts under `STORAGE_ROOT`
(default `/srv/artifacts`).

## Deploy to ARM box

```bash
# On your laptop:
cd server
bash scripts/fetch-fonts.sh
docker build -t artifacts:latest .
docker build --platform linux/arm64 -t artifacts:latest .   # the box is arm64

# Ship it. The obvious one-liner is NOT reliable here:
#   docker save artifacts:latest | gzip | ssh ... 'gunzip | docker load'
# Sustained uploads to this box get reset mid-stream. That pipe has failed, plain
# `scp` of the ~96 MB tarball died after ~512 KB, and macOS ships `openrsync`,
# which has no --append-verify to resume with. Chunk it instead — this has worked
# first try every time:
KEY=~/Desktop/SSH\ Info/ssh-key-2025-06-27.key
docker save artifacts:latest | gzip > /tmp/artifacts.tar.gz
mkdir -p /tmp/chunks && split -b 8m /tmp/artifacts.tar.gz /tmp/chunks/part-
ssh -i "$KEY" ubuntu@161.153.110.196 'rm -rf /tmp/artchunks && mkdir -p /tmp/artchunks'
for f in /tmp/chunks/part-*; do
    b=$(basename "$f")
    until [ "$(ssh -i "$KEY" ubuntu@161.153.110.196 "stat -c %s /tmp/artchunks/$b 2>/dev/null || echo 0")" \
           = "$(stat -f %z "$f")" ]; do
        scp -i "$KEY" "$f" ubuntu@161.153.110.196:/tmp/artchunks/"$b"
    done
done
md5 -q /tmp/artifacts.tar.gz    # compare against the md5sum below

# On the ARM box: reassemble, VERIFY, then load.
cat /tmp/artchunks/part-* > /tmp/artifacts.tar.gz && rm -rf /tmp/artchunks
md5sum /tmp/artifacts.tar.gz    # must match the laptop's md5 before loading
docker load < /tmp/artifacts.tar.gz && rm -f /tmp/artifacts.tar.gz

# On the ARM box (one-time, before the first run with library support):
mkdir -p /srv/library

# On the ARM box — retire the running container first, the name is already taken.
#   Keep the old one around under a new name until the replacement is verified,
#   then `docker rm artifacts-old`. NEVER `docker rm -v` — the -v would delete the
#   artifacts_data volume and every hosted artifact plus visitors.db with it.
docker stop artifacts                    # skip both on a first-ever run —
docker rename artifacts artifacts-old    #   there is no container yet

# On the ARM box:
docker run -d \
    --name artifacts \
    --restart unless-stopped \
    --memory=1g \
    --memory-swap=2g \
    -p 127.0.0.1:7878:7878 \
    -e PUBLIC_BASE_URL=https://artifacts.mncoleman.com \
    -e JWT_SECRET="$(cat /home/ubuntu/.artifacts.jwt-secret)" \
    -e CORS_ORIGINS=https://mncoleman.com,https://mncoleman.github.io,http://localhost:3000 \
    -e MAX_UPLOAD_BYTES=104857600 \
    -e LIBRARY_ROOT=/library \
    -e VISITOR_IP_SALT="$(cat /home/ubuntu/.visitor-ip-salt)" \
    -e VISITOR_TOKEN_SECRET="$(cat /home/ubuntu/.visitor-token-secret)" \
    -e GEOAPIFY_KEY="$(cat /home/ubuntu/.geoapify.key)" \
    -v artifacts_data:/data \
    -v /srv/library:/library \
    artifacts:latest

# The last three are secrets read from chmod-600 files on the box — the
#   `$(cat ...)` must run on the ARM box, never as a literal pasted from here.
#   Omitting them does NOT fail the build: the visitor-globe guestbook silently
#   falls back to JWT_SECRET-derived salts (invalidating every issued submission
#   token) and geocoding returns no results. Both have bitten a real deploy.
#
# SAFER THAN RETYPING THE FLAGS: carry the running container's env forward, so a
#   drift in this file can never silently drop a variable again.
#     umask 077
#     docker inspect artifacts --format '{{range .Config.Env}}{{println .}}{{end}}' \
#         | grep -v '^PATH=' | grep -v '^$' > /tmp/artifacts.env
#     docker run -d --name artifacts ... --env-file /tmp/artifacts.env ... artifacts:latest
#     rm -f /tmp/artifacts.env
#   Then health-check before `docker rm artifacts-old`:
#     curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:7878/health

# /srv/library is a bind mount (not a named volume) so the host-side private MCP
#   server can read prompt/skill files directly off the filesystem with no extra
#   plumbing — see the "A"I library MCP addendum.

# MAX_UPLOAD_BYTES=104857600 (100 MB) raises the upload ceiling from the 25 MB
#   default. Uploads transit the Cloudflare Worker, which caps request bodies at
#   ~100 MB on Free/Pro — going higher needs a CF plan upgrade.
# The handler buffers each file in memory (formData -> arrayBuffer), so --memory
#   is 1g to comfortably hold a ~100 MB upload (2-3x transient) plus OG render.

# Add the caddyfile.snippet content to /etc/caddy/Caddyfile then:
sudo systemctl reload caddy
```

## Auth

Requests carry a `role` claim (`admin` | `super_admin`) that the Worker stamps on the
short-lived token. The decrypted plaintext password of a private artifact is returned
**only** to `super_admin`, and the check **fails closed** — an absent claim omits the field
rather than exposing it. That means the Worker must be deployed *before* this service;
otherwise tokens carry no role and the admin UI's password column goes blank in between.

OG images are versioned. Each stored card records the `OG_VERSION` it was rendered at
(`src/og.tsx`); `/og/:slug.png` and `/og/library/:slug.png` re-render lazily when that no
longer matches, so a card redesign reaches already-published items rather than only new
ones. The card must stay visually identical to `lib/og-card.tsx` in the Next.js app — bump
`OG_VERSION` whenever you change either.

The Cloudflare Worker mints a short-lived HS256 JWT, signed with the same
`JWT_SECRET` this service holds. Upload requests carry `Authorization: Bearer
<jwt>`. Public reads (the `/a/:slug`, `/raw/:slug`, `/og/:slug.png`,
`/api/list` endpoints) are unauthenticated.

The JWT carries a `role` claim (`super_admin` | `admin`) copied from the
authenticated session user. Admin responses include a private artifact's
decrypted plaintext `password` only when `role === 'super_admin'`; any other
value — including the claim being absent on older tokens — omits the field.

Generate the shared secret with `openssl rand -hex 32`, then:
- store it in the Worker via `wrangler secret put JWT_SECRET`
- store it on the ARM box via the env var passed to `docker run`

## Storage layout

```
/data/<slug>/
    <safe-filename>       # original artifact bytes
    meta.json             # name, description, type, size, uploadedAt
    og.png                # cached 1200x630 share image
```

Single Docker volume `artifacts_data`. Fully portable — `docker run` with the
same volume on a fresh container preserves all state.

### "A"I library layout

```
/library/<slug>/
    meta.json              # kind, name, description (skills only), timestamps
    og.png                 # cached share image

    prompt.md              # prompt-kind only: raw prompt text

    SKILL.md               # skill-kind only: server-assembled frontmatter + body
    scripts/*               #   optional, admin-authored
    references/*
    assets/*
    skill.zip              # cached zip (`<slug>/SKILL.md` as the zip root entry)
```

Bind-mounted at `/srv/library` on the host (not a named volume) so the private
MCP server running directly on the ARM box can read it without going through
this service.
