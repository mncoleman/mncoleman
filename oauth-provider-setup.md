# Simple OAuth Gateway for Decap CMS

## Quick Deploy to Vercel (5 minutes, Free)

Since Decap CMS needs a backend to handle GitHub OAuth securely, here's the simplest solution:

### Step 1: Fork the OAuth Provider

1. Go to: https://github.com/vencax/netlify-cms-github-oauth-provider
2. Click **"Fork"** to create your own copy

### Step 2: Deploy to Vercel

1. Go to: https://vercel.com/new
2. Import your forked repository
3. Add environment variables:
   - `OAUTH_CLIENT_ID`: Your GitHub OAuth App Client ID
   - `OAUTH_CLIENT_SECRET`: Your GitHub OAuth App Client Secret
4. Click **Deploy**

### Step 3: Update Your GitHub OAuth App

1. Go to your OAuth app: https://github.com/settings/developers
2. Update **Authorization callback URL** to:
   `https://your-vercel-app.vercel.app/callback`

### Step 4: Update Decap CMS Config

In `personal-website/public/admin/config.yml`:

```yaml
backend:
  name: github
  repo: slider003/matthew-coleman
  branch: claude/personal-website-blog-cms-01PeQo6GUb1HL1TtbpYQ2qBU
  base_url: https://your-vercel-app.vercel.app
```

### Step 5: Test

Visit `https://slider003.github.io/matthew-coleman/admin/` and login!

---

**Why is this needed?**
GitHub OAuth requires a client secret, which can't be exposed in the browser. This tiny backend service handles the OAuth exchange securely.

**Cost:** $0 (Vercel free tier)
**Maintenance:** None (set it and forget it)
