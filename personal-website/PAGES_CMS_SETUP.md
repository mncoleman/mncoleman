# Pages CMS Setup Guide

This guide will walk you through setting up Pages CMS to manage your blog content through a user-friendly web interface.

## What is Pages CMS?

Pages CMS is an open-source, Git-based content management system that provides a web interface for managing content stored in your GitHub repository. It's perfect for static sites because:

- ✅ No separate database required (uses your Git repository as the database)
- ✅ All content changes are Git commits
- ✅ Full version history and rollback capabilities
- ✅ Works seamlessly with GitHub Pages deployment
- ✅ Free to self-host

## Prerequisites

Before starting, you'll need:

1. A GitHub account
2. A Supabase account (free tier is sufficient)
3. A Vercel account (free tier is sufficient) OR another hosting platform

## Step-by-Step Setup

### Step 1: Create a GitHub App

1. Go to [GitHub Settings → Developer settings → GitHub Apps](https://github.com/settings/apps)
2. Click **"New GitHub App"**
3. Fill in the following details:

   **Basic Information:**
   - **GitHub App name**: `My Personal Website CMS` (or any unique name)
   - **Homepage URL**: `https://your-cms-name.vercel.app` (temporary URL, you'll update this later)
   - **Callback URL**: `https://your-cms-name.vercel.app/api/auth/callback`
   - **Setup URL**: Leave blank
   - **Webhook URL**: `https://your-cms-name.vercel.app/api/webhook`
   - **Webhook secret**: Generate a strong random string (save this!)
     ```bash
     # Generate webhook secret
     openssl rand -hex 32
     ```

   **Permissions (Repository permissions):**
   - **Contents**: Read & write
   - **Metadata**: Read-only
   - **Pull requests**: Read & write
   - **Webhooks**: Read & write

   **Subscribe to events:**
   - ☑ Push
   - ☑ Pull request

   **Where can this GitHub App be installed?**
   - Select "Only on this account"

4. Click **"Create GitHub App"**
5. After creation:
   - Note your **App ID** (shown at the top)
   - Note your **Client ID** (shown in the "Basic information" section)
   - Click **"Generate a new client secret"** and save it
   - Scroll down to **"Private keys"** and click **"Generate a private key"**
   - Download the `.pem` file and keep it safe

### Step 2: Set Up Supabase Database

1. Go to [Supabase](https://supabase.com) and sign up/log in
2. Click **"New project"**
3. Fill in:
   - **Name**: `pages-cms` (or any name)
   - **Database Password**: Generate a strong password (save this!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free
4. Click **"Create new project"** (this takes ~2 minutes)
5. Once ready, go to **Settings → Database**
6. Under **Connection string**, select **"URI"** and **copy the connection string**
7. Replace `[YOUR-PASSWORD]` in the connection string with your database password
8. Your connection string should look like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
   ```

### Step 3: Deploy Pages CMS to Vercel

#### Option A: Quick Deploy (Recommended)

1. Go to the [Pages CMS GitHub repository](https://github.com/pages-cms/pages-cms)
2. Click the **"Deploy with Vercel"** button (if available)
3. Or manually:
   - Fork the repository to your GitHub account
   - Go to [Vercel](https://vercel.com) and sign up/log in
   - Click **"Add New... → Project"**
   - Import your forked `pages-cms` repository

#### Option B: Manual Deploy

```bash
# Clone the Pages CMS repository
git clone https://github.com/pages-cms/pages-cms.git
cd pages-cms

# Push to your own GitHub repository
git remote set-url origin https://github.com/YOUR_USERNAME/pages-cms.git
git push -u origin main

# Then import this repository in Vercel
```

### Step 4: Configure Environment Variables in Vercel

During deployment or in your Vercel project settings, add these environment variables:

```bash
# Database
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# GitHub App Credentials
GITHUB_APP_ID=123456
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxx

# GitHub Private Key (the content of your .pem file)
# Open the .pem file and copy ALL contents including BEGIN/END lines
GITHUB_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCA...
(all the key content)
...
-----END RSA PRIVATE KEY-----

# Encryption Key (generate a random 32-character string)
CRYPTO_KEY=your-random-32-character-string-here

# NextAuth Configuration
NEXTAUTH_URL=https://your-cms-name.vercel.app
NEXTAUTH_SECRET=another-random-string-here

# Optional: Email notifications (if you want to use Resend)
# RESEND_API_KEY=re_xxxxxxxxxxxx
# EMAIL_FROM=noreply@yourdomain.com
```

**To generate random strings for secrets:**
```bash
# For CRYPTO_KEY (32 characters)
openssl rand -hex 16

# For NEXTAUTH_SECRET
openssl rand -base64 32
```

### Step 5: Update GitHub App URLs

After your Vercel deployment completes, you'll get a URL like `https://your-cms-name.vercel.app`

1. Go back to your GitHub App settings
2. Update the following URLs with your actual Vercel URL:
   - Homepage URL: `https://your-cms-name.vercel.app`
   - Callback URL: `https://your-cms-name.vercel.app/api/auth/callback`
   - Webhook URL: `https://your-cms-name.vercel.app/api/webhook`
3. Save changes

### Step 6: Install the GitHub App

1. In your GitHub App settings, click **"Install App"** in the left sidebar
2. Click **"Install"** next to your account
3. Choose **"Only select repositories"**
4. Select your `matthew-coleman` repository
5. Click **"Install"**

### Step 7: Access Your CMS

1. Visit your Pages CMS URL: `https://your-cms-name.vercel.app`
2. Click **"Sign in with GitHub"**
3. Authorize the application
4. You should now see the Pages CMS dashboard!

## Using Pages CMS

### Creating a New Blog Post

1. Log in to your Pages CMS
2. Navigate to **"Blog Posts"** in the sidebar
3. Click **"New Post"** or **"Create new"**
4. Fill in the form:
   - **Title**: Your post title
   - **Date**: Publication date
   - **Excerpt**: A short summary (shown on blog listing)
   - **Author**: Matthew Coleman (or your name)
   - **Tags**: Add relevant tags (comma-separated)
   - **Content**: Write your post in Markdown
5. Click **"Save"** or **"Publish"**

Pages CMS will commit this change to your GitHub repository, which will trigger a rebuild and deployment of your site!

### Editing a Blog Post

1. Go to **"Blog Posts"**
2. Click on the post you want to edit
3. Make your changes
4. Click **"Save"**

### Managing Images

1. Upload images through the **"Media"** section
2. Images will be stored in `public/images/`
3. Reference them in your posts using: `![Alt text](/images/your-image.jpg)`

## Troubleshooting

### "Authentication failed" error

- Double-check your GitHub App credentials in Vercel environment variables
- Make sure the callback URL matches exactly: `https://your-cms-name.vercel.app/api/auth/callback`
- Verify your NEXTAUTH_URL is set correctly

### "Database connection failed" error

- Verify your DATABASE_URL is correct
- Check that your Supabase project is running
- Make sure you replaced `[YOUR-PASSWORD]` with your actual database password

### Changes not appearing on the website

- Check GitHub Actions tab in your repository to see if the build succeeded
- Verify the deploy workflow is configured correctly
- Make sure GitHub Pages is enabled in repository settings

### Webhook errors

- Verify the webhook URL in your GitHub App settings
- Check Vercel deployment logs for errors
- Ensure the webhook secret matches

## Admin Login Information

**CMS Admin URL**: `https://your-cms-name.vercel.app`

**Authentication**: Sign in with your GitHub account that has access to the `matthew-coleman` repository

**Repository**: The CMS directly modifies files in `slider003/matthew-coleman/personal-website/content/posts/`

## Alternative: Direct Git Editing

If you prefer not to set up Pages CMS, you can always edit blog posts directly:

1. Navigate to `personal-website/content/posts/`
2. Create/edit `.md` files
3. Commit and push to GitHub
4. GitHub Actions will automatically build and deploy

## Next Steps

- Customize the `.pages.yml` configuration file to add more content types
- Add custom fields to your blog posts
- Set up email notifications for content changes
- Configure custom domains for your CMS

## Resources

- [Pages CMS Documentation](https://pagescms.org/docs)
- [Pages CMS GitHub](https://github.com/pages-cms/pages-cms)
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Documentation](https://vercel.com/docs)

---

Need help? Check the [Pages CMS Discord community](https://discord.gg/pagescms) or [open an issue](https://github.com/pages-cms/pages-cms/issues).
