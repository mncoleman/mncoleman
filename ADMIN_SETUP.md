# Admin Authentication Setup Guide

This guide will walk you through setting up the secure admin dashboard for your blog.

## Prerequisites

- A Telegram account
- A Cloudflare account (free tier is fine)
- Node.js and npm installed (which you already have)

## Step 1: Create a Telegram Bot

1. Open Telegram and search for **@BotFather**.
2. Send the command `/newbot`.
3. Follow the prompts to name your bot (e.g., "MNColeman Admin Bot") and give it a username (e.g., `mncoleman_admin_bot`).
4. **Important**: Save the **HTTP API Token** shown. You will need this later.
5. Set the domain for the login widget:
    - Send `/setdomain` to @BotFather.
    - Select your bot.
    - Enter your website domain: `https://mncoleman.github.io` (or your custom domain if you have one linked).
    - If you want to test on localhost, you'll need to use a tunneling service like ngrok, as Telegram doesn't support `localhost` directly for the widget.

## Step 2: Deploy the Cloudflare Worker

The worker acts as the secure gatekeeper.

1. Navigate to the worker directory:

    ```bash
    cd worker
    ```

2. Login to Cloudflare (one-time setup):

    ```bash
    npx wrangler login
    ```

3. Set your secrets. Run these commands and paste the values when prompted:
    - **Bot Token** (from Step 1):

      ```bash
      npx wrangler secret put BOT_TOKEN
      ```

    - **JWT Secret** (generate a random long string):

      ```bash
      npx wrangler secret put JWT_SECRET
      ```

    - **GitHub Token** (Personal Access Token with `repo` scope):

      ```bash
      npx wrangler secret put GITHUB_TOKEN
      ```

4. Set your Admin ID and Repo details in `wrangler.toml` (or via vars if you prefer not to commit them, but `wrangler.toml` [vars] are for non-secrets).
    - Open `worker/wrangler.toml` and set `ALLOWED_USER_ID` to your Telegram ID.
    - To find your Telegram ID, message @userinfobot on Telegram.
    - Update `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` in `worker/index.ts` or add them as vars in `wrangler.toml` if you prefer to externalize them.
    *(Note: The current `index.ts` expects them in `Env` interface. It's easiest to hardcode them in `wrangler.toml` implementation or code if they aren't secrets.)*

    **Recommended Update to `worker/wrangler.toml`**:

    ```toml
    [vars]
    ALLOWED_USER_ID = "12345678" # Your ID
    GITHUB_REPO_OWNER = "mncoleman"
    GITHUB_REPO_NAME = "mncoleman"
    ```

5. Deploy the worker:

    ```bash
    npx wrangler deploy
    ```

6. Note the **Worker URL** output (e.g., `https://mncoleman-admin-auth.yourname.workers.dev`).

## Step 3: Configure the Frontend

1. Open `app/admin/page.tsx`.
2. Update the constants at the top (or use `.env.local` for local dev, but for static export you need them at build time).

    Since this is a static site on GitHub Pages, we can't hide these values, but they are public identifiers anyway.

    You can create a `.env.production` file:

    ```env
    NEXT_PUBLIC_WORKER_URL=https://mncoleman-admin-auth.yourname.workers.dev
    NEXT_PUBLIC_TELEGRAM_BOT_NAME=mncoleman_admin_bot
    ```

3. Or verify `app/admin/page.tsx` uses:

    ```typescript
    const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL;
    const BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME;
    ```

## Step 4: Build and Deploy

1. Push your changes to GitHub.

    ```bash
    git add .
    git commit -m "Add admin authentication"
    git push
    ```

2. The GitHub Action should trigger a build.

## Usage

1. Go to `https://your-site.com/admin`.
2. Click "Log in with Telegram".
3. Accept the request in your Telegram app.
4. You should be redirected to the Dashboard.
5. Click "Trigger Full Rebuild" to test the connection.

## Troubleshooting

- **Login widget not showing?** Check if `BOT_NAME` is correct and the domain is whitelisted via @BotFather.
- **"Invalid authentication" error?** Ensure `BOT_TOKEN` in Cloudflare secrets matches the one from @BotFather.
- **"Unauthorized user" error?** Ensure `ALLOWED_USER_ID` matches your Telegram ID.
