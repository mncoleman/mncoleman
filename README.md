# Personal Website & Blog

A modern, minimalist personal website and blog built with Next.js, TypeScript, and Tailwind CSS. Features a clean design with animated backgrounds and blog functionality powered by Notion.

## Features

- 🎨 **Modern Design** - Clean, minimalist interface with professional typography and animated WebGL background
- 📝 **Blog** - Notion-powered blog with markdown rendering and tag filtering
- ⭐ **Featured Posts** - Pin important posts to the top of your blog
- 🏷️ **Tag Filtering** - Client-side tag filtering for easy content discovery
- 🚀 **Fast** - Static site generation for optimal performance (100% static)
- 📱 **Responsive** - Works perfectly on all devices
- 🎯 **SEO Ready** - Optimized for search engines
- 🔧 **Type Safe** - Built with TypeScript
- 📦 **Notion CMS** - Blog content managed through Notion database
- 📊 **Admin Dashboard** - View blog statistics (total posts, word count, reading time)
- ♻️ **Auto-Refresh** - Daily automated content updates via GitHub Actions
- 📈 **Analytics** - Google Analytics 4 integration support
- ✨ **Animations** - Smooth text animations and interactive profile card
- 📲 **PWA Support** - Progressive Web App capabilities with service worker

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui + ReactBits
- **Content**: Notion API for blog posts
- **CMS**: Notion for blog management
- **Deployment**: GitHub Pages
- **Graphics**: OGL (WebGL library) for animated backgrounds
- **Analytics**: Google Analytics 4 (via @next/third-parties)

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/slider003/matthew-coleman.git
cd matthew-coleman
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```
Then edit `.env.local` with your credentials:
- **Notion**: See [`NOTION_SETUP.md`](./NOTION_SETUP.md)
- **Google Analytics**: See [`GOOGLE_ANALYTICS_SETUP.md`](./GOOGLE_ANALYTICS_SETUP.md)

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Building for Production

```bash
npm run build
```

This will generate a static export in the `out` directory.

## Managing Content

### Blog Posts

Blog posts are managed through **Notion**. See [`NOTION_SETUP.md`](./NOTION_SETUP.md) for detailed setup instructions.

**Quick overview:**
1. Create a Notion integration and database with the required properties (Title, Slug, Date, Tags, Published, Featured, Excerpt, Author)
2. Add your `NOTION_TOKEN` and `NOTION_DATABASE_ID` to `.env.local` for development
3. Add the same credentials to GitHub repository secrets for production builds
4. Create posts in Notion and mark them as Published (optionally mark as Featured to pin them to the top)
5. Content updates appear after a rebuild (automatic daily at 6 AM UTC, or manual trigger)

**Content Refresh Options:**
- **Automatic**: Daily rebuild at 6 AM UTC via GitHub Actions cron job
- **Manual**: Trigger GitHub Actions workflow from the repository's "Actions" tab → "Deploy to GitHub Pages" → "Run workflow"
- **Admin Dashboard**: Visit `/admin` to view blog statistics and access Google Analytics

### Static Pages

Static pages (like About, Home) are hardcoded React components in the `app/` directory:
- **About page**: Edit `app/about/page.tsx`
- **Home page**: Edit `app/page.tsx`

After editing, commit and push to GitHub to trigger a rebuild and deployment.

## Project Structure

```
├── app/                      # Next.js app directory (App Router)
│   ├── blog/                # Blog pages
│   │   ├── [slug]/         # Dynamic blog post pages
│   │   └── page.tsx        # Blog listing page
│   ├── about/              # About page
│   ├── admin/              # Admin dashboard (stats & refresh)
│   ├── api/                # API routes (refresh endpoint)
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles & theme variables
├── components/             # React components
│   ├── ui/                # UI components (shadcn/ui + custom)
│   │   ├── dark-veil.tsx  # Animated WebGL background
│   │   ├── profile-card.tsx # Interactive profile card with tilt
│   │   ├── text-type.tsx  # Typewriter animation effect
│   │   └── blur-text.tsx  # Text blur animation effect
│   ├── blog-list.tsx      # Client-side tag filtering component
│   ├── pwa-install.tsx    # PWA service worker registration
│   └── theme-provider.tsx # Theme context provider
├── lib/                   # Utility functions & data layer
│   ├── blog.ts           # Blog adapter (public interface)
│   ├── notion.ts         # Notion API integration
│   └── utils.ts          # General utilities
├── public/               # Static assets (images, icons, etc.)
├── .github/workflows/    # GitHub Actions (deployment)
├── components.json       # shadcn/ui configuration
├── next.config.ts        # Next.js configuration
├── CLAUDE.md            # Claude Code project instructions
├── NOTION_SETUP.md      # Notion CMS setup guide
└── GOOGLE_ANALYTICS_SETUP.md # Google Analytics setup guide
```

### Architecture Notes

- **Static Export**: Entire site is pre-rendered at build time (no server required)
- **Content Layer**: Two-tier adapter pattern (`lib/notion.ts` → `lib/blog.ts`)
- **Client Components**: Tag filtering, PWA registration, and animations
- **Build-time Data**: All Notion content fetched during `npm run build`
- **WebGL Rendering**: OGL library for performant animated backgrounds

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Customization

### Changing Colors

Edit `app/globals.css` to modify the color scheme. The site uses CSS variables for easy theming. You can also customize the animated background by modifying parameters in the `DarkVeil` component.

### Adding Components

Install shadcn/ui components:
```bash
npx shadcn@latest add button
npx shadcn@latest add card
```

For ReactBits components, they can be added via the same CLI with the custom registry configured in `components.json`.

### Modifying Content

- **Home page**: Edit `app/page.tsx` (includes animated background)
- **About page**: Edit `app/about/page.tsx` (includes profile card and text animations)
- **Blog posts**: Edit in your Notion database (see `NOTION_SETUP.md`)

### Customizing Animations

The site includes several animation components:

- **DarkVeil** (`components/ui/dark-veil.tsx`): WebGL-powered animated background
  - Adjust `hueShift`, `speed`, `warpAmount` props in `app/page.tsx`
- **TextType** (`components/ui/text-type.tsx`): Typewriter animation effect
  - Customize `speed` and `text` props
- **BlurText** (`components/ui/blur-text.tsx`): Text blur reveal animation
  - Adjust `duration` prop
- **ProfileCard** (`components/ui/profile-card.tsx`): 3D tilt effect card
  - Configure `enableTilt`, `enableMobileTilt`, and social links

### PWA Configuration

The site is configured as a Progressive Web App:
- Service worker registered in production (`public/sw.js`)
- App icons configured in `app/layout.tsx` (icon-192.png, icon-512.png, apple-touch-icon.png)
- Installable on mobile devices and desktop browsers

## Deployment

This site deploys automatically to GitHub Pages using GitHub Actions.

### GitHub Pages Setup

1. **Configure GitHub Secrets** (required for production builds):
   - Go to Settings → Secrets and variables → Actions
   - Add `NOTION_TOKEN` - Your Notion integration token ([setup guide](./NOTION_SETUP.md))
   - Add `NOTION_DATABASE_ID` - Your Notion database ID
   - Add `NEXT_PUBLIC_GA_ID` - Google Analytics measurement ID ([setup guide](./GOOGLE_ANALYTICS_SETUP.md))

2. **Enable GitHub Pages**:
   - Go to Settings → Pages
   - Set source to "GitHub Actions"
   - The site will be available at: `https://slider003.github.io/matthew-coleman/`

3. **Deployment Triggers**:
   - **Push to main**: Automatic deployment on every commit to `main`
   - **Daily rebuild**: Automatic at 6:00 AM UTC (keeps content fresh)
   - **Manual dispatch**: Trigger from Actions tab → "Deploy to GitHub Pages" → Run workflow

### Deployment Workflow

The GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Checks out code
2. Installs dependencies with `npm ci`
3. Injects Notion credentials from secrets
4. Builds static site with `npm run build`
5. Deploys `out/` directory to GitHub Pages

**Note**: API routes (`app/api/*`) only work on serverless platforms (Vercel/Netlify), not on GitHub Pages static hosting. The refresh endpoint will return 404 in production.

## Common Workflows

### Adding a New Blog Post

1. Open your Notion database
2. Create a new page with all required properties:
   - **Title**: Post title
   - **Slug**: URL-friendly identifier (e.g., `my-awesome-post`)
   - **Date**: Publication date
   - **Tags**: One or more category tags
   - **Published**: ✓ Check to make visible
   - **Featured**: ✓ Check to pin to top (optional)
   - **Excerpt**: Short description for listing pages
   - **Author**: Your name
3. Write your content in the Notion page
4. Wait for daily rebuild (6 AM UTC) or trigger manual deployment
5. Your post will appear at `/blog/your-slug`

### Updating Site Content

**For blog posts**: Edit in Notion, then wait for/trigger a rebuild

**For static pages**:
1. Edit the React component (e.g., `app/about/page.tsx`)
2. Commit and push to GitHub
3. Deployment happens automatically

### Adding New Tags

Tags are automatically extracted from published Notion posts. To add a new tag:
1. Add it to a post's Tags property in Notion
2. Rebuild the site
3. The tag will appear in the filter buttons on `/blog`

### Viewing Analytics and Statistics

**Blog Statistics** (word count, reading time, total posts):
1. Visit `/admin` on your deployed site
2. View total posts, total words, and average reading time
3. Quick links to Google Analytics and Notion CMS

**Google Analytics** (visitor tracking):
1. Set up GA4 following [`GOOGLE_ANALYTICS_SETUP.md`](./GOOGLE_ANALYTICS_SETUP.md)
2. Add `NEXT_PUBLIC_GA_ID` to GitHub Secrets (production)
3. Access via admin dashboard or directly at analytics.google.com

## Troubleshooting

### Posts Not Appearing

- Verify "Published" checkbox is enabled in Notion
- Check that all required properties are filled
- Trigger a manual rebuild via GitHub Actions
- Check build logs for Notion API errors

### Images Not Loading

- Notion images have expiring URLs (refresh needed)
- For permanent images, upload to `/public` and reference with `/matthew-coleman/image.jpg`
- Remember the `/matthew-coleman` base path in production

### Build Failures

- Verify GitHub Secrets are set correctly
- Check that Notion integration has access to the database
- Review GitHub Actions logs for specific errors
- Ensure all required Notion properties exist

### Animations Not Working

- **WebGL background not showing**: Check browser console for WebGL errors, ensure browser supports WebGL
- **Service worker errors**: Clear browser cache and re-register service worker
- **Profile card tilt not working**: Ensure JavaScript is enabled, check mobile device gyroscope permissions

## License

MIT

## Author

Matthew Coleman

---

Built with ❤️ using Next.js, Tailwind CSS, and Notion
