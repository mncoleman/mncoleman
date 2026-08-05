# Admin Authentication Setup Guide

How to stand up the admin dashboard at `/admin`. Authentication is **Telegram OIDC** —
the bot acts as an OpenID Connect provider, and a Cloudflare Worker
(`mncoleman-admin-auth`) is the gatekeeper for every privileged action.

## Prerequisites

- A Telegram account
- A Cloudflare account (free tier is fine)
- Node.js and npm

## How the auth flow actually works

Worth reading before configuring anything, because the pieces reference each other:

1. `/admin` redirects to Telegram's OIDC authorize endpoint (PKCE + a signed `state` cookie).
2. Telegram redirects back to the Worker, which verifies the ID token against Telegram's
   JWKS with an algorithm allowlist, then checks the resulting `sub` against its user list.
3. The Worker mints a **session JWT** (7-day expiry) and hands it to the browser in the URL
   fragment. The admin page immediately clears the fragment via `history.replaceState` and
   stores the token in `sessionStorage`.
4. Every authenticated request revalidates the session against KV, so removing a user takes
   effect immediately rather than whenever their token happens to expire.
5. When the Worker proxies to the artifact service it mints a **separate**, 60-second,
   audience-scoped token carrying a `role` claim. That is why a stolen session token cannot
   be replayed against the artifact service even though both share a secret.

**Two roles.** The owner (matched by `OWNER_SUB`) is `super_admin`; invited users are
`admin`. Only `super_admin` can manage users or reveal private-artifact passwords.

## Step 1: Create a Telegram bot and enable OIDC

1. Open Telegram, talk to **@BotFather**, send `/newbot`, and follow the prompts.
2. Save the **HTTP API token** — this becomes `BOT_TOKEN` (used for profile/avatar lookups).
3. Get the bot's **numeric ID** (the digits before `:` in the API token). This is your OIDC
   `client_id` → `TELEGRAM_BOT_ID`.
4. Obtain the OIDC **client secret** from BotFather → `TELEGRAM_CLIENT_SECRET`.
5. Set the login domain: `/setdomain` → your bot → `https://mncoleman.com`.
   Telegram does not accept `localhost`; use a tunnel (e.g. ngrok) to test locally.
6. Get your own Telegram OIDC `sub` (message @userinfobot for your numeric ID) →
   `OWNER_SUB`. This account is always allowed, as `super_admin`, so you can never lock
   yourself out of your own dashboard.

## Step 2: Configure and deploy the Worker

```bash
cd worker
npx wrangler login          # one-time
```

Create the KV namespace for the user list and put its id in `wrangler.toml` under the
`ADMIN_USERS` binding (an id is already committed for this repo's own deployment):

```bash
npx wrangler kv namespace create ADMIN_USERS
```

Set the secrets:

```bash
npx wrangler secret put TELEGRAM_CLIENT_SECRET   # OIDC client secret from BotFather
npx wrangler secret put BOT_TOKEN                # Bot API token, for profile lookups
npx wrangler secret put JWT_SECRET               # signs session JWTs — openssl rand -hex 32
npx wrangler secret put OWNER_SUB                # your Telegram OIDC sub
npx wrangler secret put GITHUB_TOKEN             # PAT with `repo` scope, for rebuilds + artifacts
npx wrangler secret put ARTIFACTS_JWT_SECRET     # MUST match the artifact service's JWT_SECRET
npx wrangler secret put GA_SA_CLIENT_EMAIL       # optional — /admin/analytics only
npx wrangler secret put GA_SA_PRIVATE_KEY        # optional — PKCS#8 PEM
```

Non-secret values live in `[vars]` in `wrangler.toml`: `TELEGRAM_BOT_ID`, `FRONTEND_URL`,
`GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `ARTIFACTS_SERVICE_URL`, `GA_PROPERTY_ID`,
`N8N_WEBHOOK_URL`.

```bash
npx wrangler deploy
```

Note the Worker URL from the output (e.g. `https://mncoleman-admin-auth.<you>.workers.dev`).

> **`ARTIFACTS_JWT_SECRET` must equal the artifact service's `JWT_SECRET`.** They are one
> shared HS256 secret; rotating one without the other breaks every upload. See gotcha 7 in
> [`CLAUDE.md`](./CLAUDE.md).

## Step 3: Point the frontend at the Worker

There is nothing to edit in source — the admin panel reads these at build time. Add them to
`.env.local` for dev and as **GitHub Secrets** for production builds:

```env
NEXT_PUBLIC_WORKER_URL=https://mncoleman-admin-auth.<you>.workers.dev
NEXT_PUBLIC_TELEGRAM_BOT_NAME=your_bot_username
```

Both are public identifiers — this is a static site, so nothing here can be hidden anyway.

`app/admin/layout.tsx` owns the session gate and tab navigation for every `/admin/*`
subroute; each subpage pulls `workerUrl` and `user` from
`components/admin/admin-context.tsx`.

## Step 4: Build and deploy

Push to `main`. GitHub Actions builds and deploys the site.

Remember that this only ships the **site**. The Worker is deployed separately with
`wrangler deploy`, and the artifact service separately again — see
[`server/README.md`](./server/README.md).

## Usage

1. Visit `https://mncoleman.com/admin`.
2. Log in with Telegram and approve the request in the app.
3. The dashboard tabs are Artifacts, Library, Analytics, Visitors, and Users.
4. "Trigger Rebuild" fires a `repository_dispatch` at GitHub Actions — a good first test
   that the Worker's `GITHUB_TOKEN` is wired up correctly.

## Troubleshooting

- **Login redirect fails or loops** — check `TELEGRAM_BOT_ID` matches the numeric id in the
  bot token, and that `/setdomain` matches `FRONTEND_URL` exactly (scheme included).
- **"Invalid authentication"** — `TELEGRAM_CLIENT_SECRET` is wrong or was rotated.
- **"Unauthorized user"** — the `sub` isn't `OWNER_SUB` and has no active KV entry. Invite
  the user from the Users tab as the owner.
- **Logged in, but every action 401s** — the session was revalidated against KV and the user
  is gone or deactivated. Re-invite them.
- **Artifact uploads 401 at the service** — `ARTIFACTS_JWT_SECRET` and the service's
  `JWT_SECRET` have drifted apart.
- **Private-artifact passwords show blank for the owner** — the service is gating on the
  `role` claim but the deployed Worker predates it. Deploy the Worker, then the service.
- **Analytics tab empty** — `GA_SA_*` secrets missing, or the service account hasn't been
  granted Viewer on the GA4 property. Results are KV-cached for 10 minutes.
