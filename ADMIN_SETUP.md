# Admin Authentication Setup Guide

How to stand up the admin dashboard at `/admin`. Sign-in is **Telegram OIDC** (the bot acts
as an OpenID Connect provider) or **Google**, and a Cloudflare Worker
(`mncoleman-admin-auth`, source in `worker/`) is the gatekeeper for every privileged action,
including every content commit to GitHub.

## Prerequisites

- A Telegram account
- A Cloudflare account (free tier is fine)
- Node.js and npm

## How the auth flow actually works

Worth reading before configuring anything, because the pieces reference each other:

1. `/admin` sends you to the Worker's `/auth/login` (Telegram OIDC authorize endpoint, PKCE + a signed `state` cookie) or `/auth/google/login`.
2. The provider redirects back to the Worker, which verifies the ID token (Telegram: JWKS
   with an algorithm allowlist) and checks the resulting `sub` (or, for Google, the verified
   email) against its user list. Both are invite-only.
3. The Worker mints a **session JWT** (7-day expiry) and hands it to the browser in the URL
   fragment. The admin page immediately clears the fragment via `history.replaceState` and
   stores the token in `sessionStorage`.
4. Every authenticated request revalidates the session against KV, so removing a user takes
   effect immediately rather than whenever their token happens to expire.
5. When the Worker proxies to the artifact service it mints a **separate**, 60-second,
   audience-scoped token carrying a `role` claim. That is why a stolen session token cannot
   be replayed against the artifact service even though both share a secret.

**Three roles.** The owner (matched by `OWNER_SUB`, or `OWNER_EMAIL` for Google) is
`super_admin` and is never stored in KV. Invited users are `site_admin` (every feature and
artifact, may set artifact visibility and passwords, cannot manage users) or `editor` (only
the features ticked for them, plus edit mode and Claude linking on the instant artifacts
granted to them; never changes visibility or passwords). Old KV records that say `admin` mean
`site_admin`. Only `super_admin` can manage users or reveal private-artifact passwords.
Features are `artifacts`, `content` (posts, projects, resources), `library`, `analytics` and
`rebuild`.

## Step 1: Create a Telegram bot and enable OIDC

1. Open Telegram, talk to **@BotFather**, send `/newbot`, and follow the prompts.
2. Save the **HTTP API token**: this becomes `BOT_TOKEN` (used for profile/avatar lookups).
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

Create the KV namespaces and put their ids in `wrangler.toml` (ids are already committed
for this repo's own deployment). `ADMIN_USERS` holds the user list, rate-limit and cache
entries, and the CalVer build counter; `POST_DRAFTS` holds blog post autosave drafts. Without
`POST_DRAFTS` the Worker still deploys and the draft routes answer 503 `drafts_unavailable`.

```bash
npx wrangler kv namespace create ADMIN_USERS
npx wrangler kv namespace create POST_DRAFTS
```

Set the secrets:

```bash
npx wrangler secret put TELEGRAM_CLIENT_SECRET   # OIDC client secret from BotFather
npx wrangler secret put BOT_TOKEN                # Bot API token, for profile lookups
npx wrangler secret put JWT_SECRET               # signs session JWTs: openssl rand -hex 32
npx wrangler secret put OWNER_SUB                # your Telegram OIDC sub
npx wrangler secret put GITHUB_TOKEN             # PAT with `repo` scope: commits posts, collections, artifacts
npx wrangler secret put PAGES_DEPLOY_HOOK        # Cloudflare Pages deploy hook URL, for rebuilds
npx wrangler secret put ARTIFACTS_JWT_SECRET     # MUST match the artifact service's JWT_SECRET
npx wrangler secret put BUILD_TOKEN              # same value as the Pages project's BUILD_TOKEN build variable
npx wrangler secret put GOOGLE_CLIENT_ID         # Google sign-in; the same OAuth client app.mncoleman.com uses
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put OWNER_EMAIL              # optional: owner's Google address, super_admin via Google
npx wrangler secret put GA_SA_CLIENT_EMAIL       # optional: /admin/analytics only
npx wrangler secret put GA_SA_PRIVATE_KEY        # optional: PKCS#8 PEM
```

The Google OAuth client's redirect URIs must include
`https://mncoleman-admin-auth.mncoleman.workers.dev/auth/google/callback` (your Worker's URL
plus `/auth/google/callback`).

Non-secret values live in `[vars]` in `wrangler.toml`: `TELEGRAM_BOT_ID`, `FRONTEND_URL`,
`GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `ARTIFACTS_SERVICE_URL`, `GA_PROPERTY_ID`,
`N8N_WEBHOOK_URL`. The `[triggers]` cron (`0 6 * * *`) fires the daily site rebuild.

```bash
npx wrangler deploy
```

Note the Worker URL from the output (e.g. `https://mncoleman-admin-auth.<you>.workers.dev`).

> **`ARTIFACTS_JWT_SECRET` must equal the artifact service's `JWT_SECRET`.** They are one
> shared HS256 secret; rotating one without the other breaks every upload. See gotcha 7 in
> [`CLAUDE.md`](./CLAUDE.md).

## Step 3: Point the frontend at the Worker

There is nothing to edit in source: the admin panel reads this at build time. Add it to
`.env.local` for dev and as a build variable on the **Cloudflare Pages project** for
production:

```env
NEXT_PUBLIC_WORKER_URL=https://mncoleman-admin-auth.<you>.workers.dev
```

It is a public identifier; this is a static site, so nothing here can be hidden anyway.

`app/admin/layout.tsx` owns the session gate and tab navigation for every `/admin/*`
subroute; each subpage pulls `workerUrl` and `user` from
`components/admin/admin-context.tsx`.

## Step 4: Build and deploy

Push to `main`. The Cloudflare Pages Git integration builds and deploys the site (there is no
GitHub Actions deploy workflow).

Remember that this only ships the **site**. The Worker is deployed separately with
`wrangler deploy`, and the artifact service separately again: see
[`server/README.md`](./server/README.md).

## Usage

1. Visit `https://mncoleman.com/admin`.
2. Log in with Telegram and approve the request in the app.
3. The sidebar sections you can see depend on your role: Posts, Projects, Resources,
   Artifacts, AI Library, Analytics, and Users (owner only). `/admin/content` just redirects
   to Projects.
4. The rebuild button POSTs the Pages deploy hook, a good first test that
   `PAGES_DEPLOY_HOOK` is wired up. Publishing a post, project or resource commits through
   `GITHUB_TOKEN` and the commit triggers the build on its own; do not also rebuild.

## Troubleshooting

- **Login redirect fails or loops**: check `TELEGRAM_BOT_ID` matches the numeric id in the
  bot token, and that `/setdomain` matches `FRONTEND_URL` exactly (scheme included).
- **"Authentication failed" / "Invalid authentication response"**: `TELEGRAM_CLIENT_SECRET` is wrong or was rotated.
- **"You are not authorized to access this area"**: the `sub` isn't `OWNER_SUB` and has no active KV entry. Invite
  the user from the Users tab as the owner (by Telegram username, or by email for Google).
- **"Google sign-in is not set up yet"**: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  are missing, or the callback URL is not an authorised redirect URI on the OAuth client.
- **Logged in, but every action 401s**: the session was revalidated against KV and the user
  is gone or deactivated. Re-invite them.
- **Artifact uploads 401 at the service**: `ARTIFACTS_JWT_SECRET` and the service's
  `JWT_SECRET` have drifted apart.
- **Private-artifact passwords show blank for the owner**: the service is gating on the
  `role` claim but the deployed Worker predates it. Deploy the Worker, then the service.
- **Publishing fails with a GitHub error**: `GITHUB_TOKEN` is missing, expired, or lacks
  `repo` scope. A 409 means the file changed underneath you (another admin or an earlier
  publish): reload and redo the edit.
- **Post drafts do not sync**: the `POST_DRAFTS` KV binding is missing (503
  `drafts_unavailable`); the editor keeps edits in the browser only.
- **Analytics tab empty**: `GA_SA_*` secrets missing, or the service account hasn't been
  granted Viewer on the GA4 property. Results are KV-cached for 10 minutes.
