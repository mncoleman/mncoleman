# Decap CMS Setup Guide

This guide will walk you through setting up Decap CMS (formerly Netlify CMS) to manage your blog content through a beautiful web interface - **without needing Vercel, Supabase, or any external services!**

## What is Decap CMS?

Decap CMS is an open-source, Git-based content management system that runs entirely in your browser. It's perfect for your use case because:

✅ **No backend server required** - Runs completely in the browser
✅ **No database needed** - Uses your GitHub repository as storage
✅ **Works with GitHub Pages** - Perfect integration
✅ **Free GitHub OAuth** - Simple authentication setup
✅ **Zero ongoing costs** - Completely free to use
✅ **Real-time updates** - Changes commit directly to your repo

## Quick Setup (5 Minutes)

### Step 1: Create a GitHub OAuth App

This is the only external setup needed - it allows Decap CMS to authenticate you and commit to your repository.

1. **Go to GitHub OAuth Apps**:
   - Visit: https://github.com/settings/developers
   - Click **"OAuth Apps"** in the left sidebar
   - Click **"New OAuth App"**

2. **Fill in the Application Details**:
   ```
   Application name: Matthew Coleman Blog CMS
   Homepage URL: https://slider003.github.io/matthew-coleman/
   Application description: Content management for my personal blog
   Authorization callback URL: https://api.netlify.com/auth/done
   ```

   **Important**: The callback URL must be exactly `https://api.netlify.com/auth/done` (this is a free service provided by Netlify for GitHub authentication - you don't need a Netlify account)

3. **Register the application**

4. **Save your credentials**:
   - You'll see a **Client ID** - copy this
   - Click **"Generate a new client secret"**
   - Copy the **Client Secret** (you won't see it again!)

### Step 2: Configure Decap CMS with Your OAuth Credentials

You have two options:

#### Option A: Use Netlify's Free OAuth Service (Recommended - Easiest)

This uses Netlify's free authentication service - you don't need a Netlify account or to host anything there.

1. The configuration in `public/admin/config.yml` is already set up for this!
2. Just update the OAuth app callback URL to: `https://api.netlify.com/auth/done`
3. Decap CMS will automatically use this service when you log in

**That's it!** No additional setup needed.

#### Option B: Self-Host OAuth (Advanced)

If you prefer full control, you can run your own OAuth gateway:

1. Deploy this service: https://github.com/vencax/netlify-cms-github-oauth-provider
2. Update the `base_url` in `config.yml` to your deployed service URL
3. More complex but gives you complete independence

### Step 3: Enable GitHub Pages

1. Go to your repository: https://github.com/slider003/matthew-coleman
2. Click **Settings** → **Pages**
3. Under **Source**, select **"GitHub Actions"**
4. Save

Your site will deploy automatically!

### Step 4: Access Your CMS

Once your site is deployed:

1. Visit: **https://slider003.github.io/matthew-coleman/admin/**
2. Click **"Login with GitHub"**
3. Authorize the application
4. Start creating content! 🎉

## Using Decap CMS

### Creating a New Blog Post

1. Log in to https://slider003.github.io/matthew-coleman/admin/
2. Click **"Blog Posts"** in the left sidebar
3. Click **"New Blog Posts"**
4. Fill in the form:
   - **Title**: Your post title
   - **Publish Date**: Select a date
   - **Excerpt**: A short summary for the blog listing
   - **Author**: Matthew Coleman (or your name)
   - **Tags**: Add tags (press Enter after each tag)
   - **Body**: Write your post using the rich markdown editor
5. Click **"Publish"** in the top right

The CMS will:
- Commit your new post to the repository
- Trigger a GitHub Actions build
- Deploy your updated site automatically
- Your post will be live in ~2 minutes!

### Editing a Blog Post

1. Go to **"Blog Posts"**
2. Click on any post to edit
3. Make your changes
4. Click **"Publish"**

### Managing Images

1. In the markdown editor, click the **image icon** (+)
2. Upload an image or select from media library
3. The image will be uploaded to `public/images/uploads/`
4. The correct path will be inserted into your post automatically

### Editing the About Page

1. Click **"Pages"** in the left sidebar
2. Select **"About Page"**
3. Edit the content
4. Click **"Publish"**

## Features

### Rich Text Editor

- **Bold**, *italic*, ~~strikethrough~~
- Headers (H1-H6)
- Lists (ordered and unordered)
- Links and images
- Code blocks with syntax highlighting
- Blockquotes
- Tables

### Live Preview

See exactly how your post will look as you write it.

### Media Library

All your uploaded images in one place, easy to reuse.

### Draft Workflow (Optional)

Want to enable drafts? Update `config.yml`:

```yaml
publish_mode: editorial_workflow
```

This adds:
- Draft status
- Review process
- Published status

## Configuration Reference

The configuration file is at `public/admin/config.yml`. Key settings:

```yaml
backend:
  name: github
  repo: slider003/matthew-coleman
  branch: main

media_folder: "personal-website/public/images/uploads"
public_folder: "/images/uploads"

collections:
  - name: "posts"
    label: "Blog Posts"
    folder: "personal-website/content/posts"
    # ... field definitions
```

### Adding Custom Fields

Want to add more fields to blog posts? Edit the `fields` array in `config.yml`:

```yaml
collections:
  - name: "posts"
    fields:
      # ... existing fields
      - { label: "Featured Image", name: "featuredImage", widget: "image", required: false }
      - { label: "Reading Time", name: "readingTime", widget: "number", required: false }
```

Available widgets:
- `string` - Single line text
- `text` - Multi-line text
- `markdown` - Rich markdown editor
- `boolean` - Checkbox
- `datetime` - Date/time picker
- `image` - Image uploader
- `list` - Array of items
- `object` - Nested fields
- `select` - Dropdown
- `number` - Numeric input

## Troubleshooting

### "Error loading the CMS configuration"

- Check that `public/admin/config.yml` is properly formatted (YAML is sensitive to indentation)
- Ensure the file is accessible at `/admin/config.yml` on your site

### "Authentication failed"

- Verify your OAuth app credentials
- Make sure the callback URL is exactly: `https://api.netlify.com/auth/done`
- Check that you authorized the app when prompted

### "Cannot save - repository not found"

- Ensure the repository name in `config.yml` matches your GitHub repo exactly: `slider003/matthew-coleman`
- Verify you have write access to the repository

### Changes not appearing on site

- Check the **Actions** tab in GitHub to see if the build succeeded
- Wait 2-3 minutes for the build and deployment to complete
- Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)

### Images not loading

- Check that images are in `personal-website/public/images/uploads/`
- Verify the path in your markdown matches the `public_folder` setting
- Ensure the build copied files to the `out` directory

## Local Development

To test Decap CMS locally:

1. Install the Decap CMS proxy server:
   ```bash
   npm install -g decap-server
   ```

2. In `public/admin/config.yml`, uncomment:
   ```yaml
   local_backend: true
   ```

3. Run the proxy server in one terminal:
   ```bash
   npx decap-server
   ```

4. Run your Next.js dev server in another:
   ```bash
   npm run dev
   ```

5. Access the CMS at: http://localhost:3000/admin/

**Note**: Remember to comment out `local_backend: true` before deploying!

## Security Notes

- Decap CMS uses your GitHub authentication - it's as secure as your GitHub account
- Only users with write access to your repository can edit content
- All changes are version-controlled in Git
- You can revert any change through GitHub's history

## Alternative: Direct GitHub Editing

Don't want to use the CMS? You can always edit files directly:

1. **On GitHub.com**:
   - Navigate to `personal-website/content/posts/`
   - Click "Add file" → "Create new file"
   - Write your post in markdown
   - Commit directly to main branch

2. **Locally**:
   - Clone the repository
   - Edit markdown files in `content/posts/`
   - Commit and push

Both methods work perfectly - the CMS just provides a nicer interface!

## Admin Access Summary

**CMS URL**: https://slider003.github.io/matthew-coleman/admin/

**Authentication**: Your GitHub account (the one with access to `slider003/matthew-coleman`)

**Permissions**: Anyone with write access to the repository can use the CMS

**Storage**: All content is stored in your GitHub repository at:
- Blog posts: `personal-website/content/posts/*.md`
- Images: `personal-website/public/images/uploads/`
- Pages: `personal-website/content/pages/*.md`

## Customization

### Change the Logo

Edit `public/admin/index.html` to add a custom logo or styling.

### Add More Collections

Edit `config.yml` to add new content types (projects, portfolio items, etc.).

### Custom Previews

You can customize how content looks in the preview pane - see [Decap CMS docs](https://decapcms.org/docs/customization/).

## Resources

- [Decap CMS Documentation](https://decapcms.org/docs/intro/)
- [Configuration Options](https://decapcms.org/docs/configuration-options/)
- [Widget Reference](https://decapcms.org/docs/widgets/)
- [Decap CMS GitHub](https://github.com/decaporg/decap-cms)

## Support

- [Decap CMS Community](https://decapcms.org/community/)
- [GitHub Discussions](https://github.com/decaporg/decap-cms/discussions)
- [Documentation](https://decapcms.org/docs/)

---

**You're all set!** Once you complete the OAuth app setup (Step 1), you can start managing your blog content through the web interface at `/admin/`.
