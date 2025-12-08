# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a personal website and blog project built with Next.js 16 (App Router) as a static site with a Notion-powered blog. The site is deployed to GitHub Pages at `https://slider003.github.io/matthew-coleman/`.

## Development Commands

```bash
npm run dev      # Start development server at http://localhost:3000
npm run build    # Build static site (outputs to out/)
npm run start    # Start production server (for testing build)
npm run lint     # Run ESLint
```

### Environment Setup

Create `.env.local` in the root directory with:
```
NOTION_TOKEN=secret_your_integration_token
NOTION_DATABASE_ID=your_database_id
```

See `NOTION_SETUP.md` for detailed Notion CMS configuration.

## Architecture

### Next.js Configuration

- **Output**: Static export (`output: 'export'`)
- **Base Path**: `/matthew-coleman` in production (GitHub Pages subpath)
- **Images**: Unoptimized (required for static export)
- **Trailing Slash**: Enabled for better compatibility

### Content Management Architecture

The blog uses a **two-layer adapter pattern**:

1. **lib/notion.ts** - Direct Notion API integration
   - `getPublishedPosts()` - Fetch all published posts
   - `getPostBySlug(slug)` - Fetch single post with markdown content
   - `getBlogStats()` - Calculate aggregate statistics
   - Returns `NotionPost` interface with metadata and markdown content

2. **lib/blog.ts** - Thin adapter layer
   - Provides stable public interface (`Post` type = `NotionPost`)
   - Future-proof: can switch backends without changing consuming code
   - `getAllPosts()` and `getPostBySlug()` are the public API

**Notion Database Schema** (required properties):
- Title (title)
- Slug (text) - URL-friendly identifier
- Date (date)
- Tags (multi-select)
- Published (checkbox)
- Excerpt (text)
- Author (text)

Content is converted from Notion blocks to Markdown using `notion-to-md`.

### Component Organization

- **components/ui/** - shadcn/ui components (button, card, etc.)
- **components/** - Custom components (theme-toggle, pwa-install, refresh-button)
- **app/** - Next.js App Router pages and layouts
  - `app/page.tsx` - Home page
  - `app/about/page.tsx` - About page
  - `app/blog/page.tsx` - Blog listing
  - `app/blog/[slug]/page.tsx` - Dynamic blog post pages
  - `app/admin/page.tsx` - Admin dashboard (stats, manual refresh)
  - `app/api/refresh/route.ts` - API route for triggering GitHub rebuild

### Styling System

- **Tailwind CSS** with CSS variables for theming
- **Dark mode**: `next-themes` with class-based toggle
- **Typography**: `@tailwindcss/typography` for blog content
- **Component library**: shadcn/ui (New York style) + ReactBits registry
- **Path aliases**: `@/components`, `@/lib`, etc.

Theme colors defined in `app/globals.css` using HSL CSS variables.

### Deployment Pipeline

**GitHub Actions** (`.github/workflows/deploy.yml`):
- Triggered on: push to `main`, manual dispatch, daily cron (6 AM UTC)
- Build process:
  1. Install dependencies with `npm ci`
  2. Inject `NOTION_TOKEN`, `NOTION_DATABASE_ID` from GitHub Secrets
  3. Run `npm run build` (Next.js static export)
  4. Upload `out/` artifact
  5. Deploy to GitHub Pages
- Optional: n8n callback support via `resumeUrl` workflow input

**GitHub Secrets Required**:
- `NOTION_TOKEN` - Notion integration token
- `NOTION_DATABASE_ID` - Blog database ID
- `NEXT_PUBLIC_GA_ID` - Google Analytics (optional)

## Key Implementation Patterns

### Static Generation with Notion

All Notion data is fetched at **build time** (ISR/SSG):
- Blog listing pre-rendered from Notion database query
- Individual posts pre-rendered using `generateStaticParams()`
- No runtime Notion API calls in production (fully static)

To refresh content:
1. Trigger manual rebuild via GitHub Actions
2. Wait for daily cron rebuild (6 AM UTC)
3. Use admin refresh button (requires serverless platform, not GitHub Pages)

### Adding shadcn/ui Components

Two registries configured in `components.json`:
```bash
npx shadcn@latest add button              # shadcn/ui
npx shadcn@latest add @react-bits/avatar  # ReactBits
```

### Working with Blog Posts

Read posts via the adapter:
```typescript
import { getAllPosts, getPostBySlug } from '@/lib/blog';

const posts = await getAllPosts();
const post = await getPostBySlug('my-post-slug');
```

Markdown content is in `post.content` and should be rendered with proper sanitization.

## Common Pitfalls

1. **Base Path**: Always account for `/matthew-coleman` prefix in production. Use Next.js `<Link>` component for navigation.

2. **Image Optimization**: Disabled for static export. Use `<img>` tags or unoptimized Next.js `<Image>` component.

3. **API Routes**: Not available in static export. The `app/api/refresh/route.ts` only works when deployed to serverless platforms (Vercel/Netlify), not GitHub Pages.

4. **Environment Variables**: Build-time only. Client-side variables must use `NEXT_PUBLIC_` prefix.

5. **Notion Content Updates**: Require rebuild to appear on site. Not real-time.
