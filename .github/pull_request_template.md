# Personal Website with Blog and Decap CMS

This PR adds a complete personal website with blog functionality.

## Features

- Modern, minimalist design with Next.js and TypeScript
- Light/dark mode toggle with system preference detection
- Static blog powered by markdown files
- **Decap CMS integration** for easy content management (no backend/database needed!)
- GitHub Pages deployment via GitHub Actions
- shadcn/ui and ReactBits component support
- Responsive design with Tailwind CSS
- Three sample blog posts included

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v3
- **CMS**: Decap CMS (browser-only, Git-based)
- **Deployment**: GitHub Pages

## What's Included

### Website Structure
- Homepage with recent blog posts
- Blog listing page
- Individual blog post pages
- About page
- Responsive header with navigation
- Dark mode toggle

### Decap CMS
- Admin interface at `/admin/`
- Rich markdown editor
- Media library for images
- No backend server or database required
- Simple 5-minute setup (just create GitHub OAuth app)

### Documentation
- Complete README with setup instructions
- Detailed Decap CMS setup guide
- Sample blog posts
- GitHub Actions workflow for auto-deployment

## Next Steps

Once merged:

1. **Enable GitHub Pages**:
   - Go to Settings → Pages
   - Source should already be set to "GitHub Actions"

2. **Set up Decap CMS** (optional, for web-based content editing):
   - Follow instructions in `personal-website/DECAP_CMS_SETUP.md`
   - Takes ~5 minutes to create GitHub OAuth app
   - Then access admin at `/admin/`

3. **Site will be live at**:
   - `https://slider003.github.io/matthew-coleman/`

## Files Added

- Complete Next.js application in `personal-website/`
- GitHub Actions workflow for deployment
- Decap CMS admin interface
- Sample blog posts and content
- Comprehensive documentation

---

Ready to deploy!
