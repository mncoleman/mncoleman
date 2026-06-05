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
docker save artifacts:latest | gzip | \
    ssh -i ~/Desktop/SSH\ Info/ssh-key-2025-06-27.key ubuntu@161.153.110.196 \
    'gunzip | docker load'

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
    -v artifacts_data:/data \
    artifacts:latest

# MAX_UPLOAD_BYTES=104857600 (100 MB) raises the upload ceiling from the 25 MB
#   default. Uploads transit the Cloudflare Worker, which caps request bodies at
#   ~100 MB on Free/Pro — going higher needs a CF plan upgrade.
# The handler buffers each file in memory (formData -> arrayBuffer), so --memory
#   is 1g to comfortably hold a ~100 MB upload (2-3x transient) plus OG render.

# Add the caddyfile.snippet content to /etc/caddy/Caddyfile then:
sudo systemctl reload caddy
```

## Auth

The Cloudflare Worker mints a short-lived HS256 JWT, signed with the same
`JWT_SECRET` this service holds. Upload requests carry `Authorization: Bearer
<jwt>`. Public reads (the `/a/:slug`, `/raw/:slug`, `/og/:slug.png`,
`/api/list` endpoints) are unauthenticated.

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
