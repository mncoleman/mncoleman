<div align="center">

# Matthew Coleman

### Personal Information Hub

A modern, minimalist information hub featuring blog, resources, and professional resume—all powered by Notion CMS and Next.js.

[![Deploy to GitHub Pages](https://github.com/mncoleman/matthew-coleman/actions/workflows/deploy.yml/badge.svg)](https://github.com/mncoleman/matthew-coleman/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Notion](https://img.shields.io/badge/CMS-Notion-black?logo=notion)](https://www.notion.so/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38bdf8?logo=tailwind-css)](https://tailwindcss.com/)

[Live Demo](https://mncoleman.github.io/matthew-coleman/) · [Report Bug](https://github.com/mncoleman/matthew-coleman/issues) · [Request Feature](https://github.com/mncoleman/matthew-coleman/issues)

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🎨 Design & UX

- **WebGL Background** - Animated Dark Veil effect
- **Frosted Glass UI** - Modern glassmorphism design
- **Bento Grid Layout** - Clean, responsive information hub
- **Dark Mode** - System-aware theme switching
- **PWA Ready** - Installable progressive web app
- **100% Responsive** - Perfect on all devices

</td>
<td width="50%">

### ⚡ Performance & Tech

- **Static Generation** - Lightning-fast pre-rendered pages
- **Type Safety** - Full TypeScript coverage
- **Zero Runtime** - 100% static export
- **Auto Refresh** - Daily content updates
- **SEO Optimized** - Meta tags & structured data
- **Analytics Ready** - Google Analytics 4 integration

</td>
</tr>
</table>

### 📦 Content Management

| Feature | Description |
|---------|-------------|
| 📝 **Blog** | Notion-powered blog with markdown rendering & tag filtering |
| 🔗 **Resources** | Curated link library organized by category |
| 📄 **Resume** | Professional CV rendered from Notion pages |
| ⭐ **Featured Posts** | Pin important content to the top |
| 🏷️ **Smart Tags** | Auto-extracted tag filtering system |
| 📊 **Admin Dashboard** | Blog statistics & quick CMS access |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Notion account (for content management)

### Installation

```bash
# Clone the repository
git clone https://github.com/mncoleman/matthew-coleman.git
cd matthew-coleman

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Notion credentials

# Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see your site.

---

## 🔧 Configuration

### Environment Variables

Create a `.env.local` file with the following:

```env
# Notion Integration (required)
NOTION_TOKEN=ntn_your_integration_token_here
NOTION_DATABASE_ID=your_blog_database_id
NOTION_RESOURCES_DATABASE_ID=your_resources_database_id
NOTION_RESUME_PAGE_ID=your_resume_page_id

# Google Analytics (optional)
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

### Notion CMS Template (Quick Start)

**🎯 Use the pre-configured template to get started instantly:**

[![Duplicate Notion Template](https://img.shields.io/badge/Duplicate-Notion%20Template-black?logo=notion)](https://matthewcoleman.notion.site/Personal-Site-CMS-Template-2eac6cc793dc80789468f171f49604f3)

**What's Included:**

- ✅ **Blog Database** - Pre-configured with all required properties (Title, Slug, Date, Tags, Published, Featured, Excerpt, Author)
- ✅ **Resources Database** - Ready-to-use link library (Name, URL, Category, Description, Published)
- ✅ **Resume Page** - Formatted resume template with markdown blocks
- ✅ **Sample Content** - Example posts and resources to demonstrate the structure

**How to Use:**

1. Click the template link above and select "Duplicate" in the top-right corner
2. Create a Notion integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
3. Share all three databases/pages with your integration
4. Copy the database/page IDs from the URLs and add to `.env.local`
5. Copy your integration token (starts with `ntn_`) to `.env.local`

### Manual Notion Setup (Without Template)

If you prefer to set up manually:

1. **Create a Notion Integration**
   - Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
   - Create new integration and copy the token (starts with `ntn_`)

2. **Set Up Databases**
   - **Blog**: Title, Slug, Date, Tags, Published, Featured, Excerpt, Author
   - **Resources**: Name, URL, Category, Description, Published
   - **Resume**: Single page with markdown content

3. **Share Databases**
   - Share each database/page with your integration
   - Copy the database/page IDs to `.env.local`

📚 **Detailed guides**: See [`NOTION_SETUP.md`](./NOTION_SETUP.md) and [`GOOGLE_ANALYTICS_SETUP.md`](./GOOGLE_ANALYTICS_SETUP.md)

---

## 🏗️ Tech Stack

<table>
<tr>
<td align="center" width="96">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nextjs/nextjs-original.svg" width="48" height="48" alt="Next.js" />
<br>Next.js 16
</td>
<td align="center" width="96">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="48" height="48" alt="TypeScript" />
<br>TypeScript
</td>
<td align="center" width="96">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/tailwindcss/tailwindcss-plain.svg" width="48" height="48" alt="Tailwind" />
<br>Tailwind CSS
</td>
<td align="center" width="96">
<img src="https://www.notion.so/cdn-cgi/image/format=auto,width=96,quality=100/front-static/shared/icons/notion-app-icon-3d.png" width="48" height="48" alt="Notion" />
<br>Notion API
</td>
<td align="center" width="96">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg" width="48" height="48" alt="GitHub" />
<br>GitHub Pages
</td>
</tr>
</table>

**Core Technologies:**

- **Framework**: Next.js 16 (App Router) with static export
- **Language**: TypeScript 5.0
- **Styling**: Tailwind CSS + shadcn/ui components
- **CMS**: Notion API (`@notionhq/client`, `notion-to-md`)
- **Graphics**: OGL (WebGL library) for animated backgrounds
- **Deployment**: GitHub Pages with GitHub Actions
- **Analytics**: Google Analytics 4 via `@next/third-parties`
- **PWA**: Service worker with app manifest

---

## 🔧 How It Works: Notion CMS + Static Site Architecture

This site uses a unique architecture that combines **Notion's powerful CMS** with **100% static hosting** on GitHub Pages. Here's how it works:

### The Build-Time CMS Approach

Unlike traditional CMS platforms that require a server to fetch content on every page load, this site fetches all content from Notion **once during the build process** and generates static HTML files.

```
┌─────────────┐      Build Time        ┌──────────────┐      Deploy        ┌─────────────┐
│   Notion    │ ──────────────────────>│  Next.js     │ ────────────────> │   GitHub    │
│  Databases  │   Fetch via API        │  Static      │   Upload HTML     │   Pages     │
│             │   Convert to Markdown  │  Generation  │   (out/ folder)   │  (Hosting)  │
└─────────────┘                        └──────────────┘                    └─────────────┘
     ↓                                         ↓                                  ↓
  Content                                  Pre-render                         Fast Delivery
  Management                               All Pages                          No Server Needed
```

### Benefits of This Approach

| Benefit | Description |
|---------|-------------|
| 🚀 **Lightning Fast** | No API calls at runtime - all content is pre-rendered as HTML |
| 💰 **Zero Cost Hosting** | Static files hosted free on GitHub Pages |
| 🔒 **Secure** | No server to hack, no databases to breach |
| 📝 **Easy Content Management** | Write in Notion's beautiful editor with rich formatting |
| 🌍 **Global CDN** | GitHub Pages automatically distributes your site globally |
| 📱 **Works Offline** | PWA-ready static files can be cached for offline use |

### How Content Updates Work

**1. Edit Content in Notion**

- Open your Notion workspace
- Update blog posts, resources, or resume
- Changes are saved in Notion immediately

**2. Trigger a Rebuild**

- **Automatic**: GitHub Actions rebuilds daily at 6:00 AM UTC
- **Manual**: Trigger deployment from GitHub Actions tab
- **On Push**: Any commit to `main` branch triggers rebuild

**3. Build Process**

```bash
npm run build
```

- Next.js fetches latest content from Notion API
- Converts Notion blocks to Markdown using `notion-to-md`
- Generates static HTML files for all pages
- Outputs to `out/` directory

**4. Deploy to GitHub Pages**

- GitHub Actions uploads `out/` folder to `gh-pages` branch
- Site updates at your custom domain
- **No downtime** - atomic deployment

### Why This Architecture?

**Traditional CMS (WordPress, etc.)**

```
User Request → Server → Database Query → Render HTML → Send to User
❌ Slow (database queries on every request)
❌ Expensive (requires hosting server)
❌ Security risks (server + database vulnerabilities)
```

**This Site (Notion + Static)**

```
User Request → CDN → Serve Pre-rendered HTML → Done
✅ Fast (no server processing)
✅ Free (static file hosting)
✅ Secure (no server to attack)
```

### Key Technical Details

**Data Fetching** (`lib/notion.ts`)

- Uses `@notionhq/client` to query Notion databases
- Fetches only published content (filtered by "Published" checkbox)
- Gracefully falls back to sample data if Notion credentials are missing

**Markdown Conversion** (`notion-to-md`)

- Converts Notion's block structure to Markdown
- Preserves formatting (bold, italic, links, code blocks)
- Handles images, lists, headings, and more

**Static Generation** (Next.js `output: 'export'`)

- Pre-renders all pages at build time
- No server-side rendering (SSR) or API routes
- Pure HTML/CSS/JS files

**Content Refresh**

- Daily automatic rebuilds keep content fresh
- Notion webhook support could enable real-time updates (future enhancement)
- For now, content updates require rebuild (15-30 seconds)

### Trade-offs

**Advantages:**

- ✅ Blazing fast performance
- ✅ Free hosting
- ✅ No server maintenance
- ✅ Easy content editing in Notion

**Limitations:**

- ⏱️ Content updates require rebuild (~1-2 minutes)
- 🔄 Not real-time (scheduled or manual deploys)
- 📊 Build-time only (can't fetch data from browsers)

For most blogs and portfolios, these trade-offs are worth it for the **speed, cost savings, and security benefits**.

---

## 📁 Project Structure

```
matthew-coleman/
├── app/                           # Next.js App Router
│   ├── blog/                      # Blog pages
│   │   ├── [slug]/page.tsx       # Dynamic post pages
│   │   └── page.tsx              # Blog listing with tags
│   ├── resources/page.tsx        # Resource library
│   ├── resume/page.tsx           # Professional resume
│   ├── about/page.tsx            # About page
│   ├── admin/page.tsx            # Admin dashboard
│   ├── layout.tsx                # Root layout & navigation
│   ├── page.tsx                  # Bento grid home page
│   └── globals.css               # Theme variables & styles
│
├── components/
│   ├── ui/                        # UI components
│   │   ├── dark-veil.tsx         # WebGL animated background
│   │   └── ...                   # shadcn/ui components
│   ├── blog-list.tsx             # Tag filtering component
│   ├── pwa-install.tsx           # PWA service worker
│   └── theme-provider.tsx        # Dark mode provider
│
├── lib/                           # Data layer & utilities
│   ├── notion.ts                 # Notion API integration
│   ├── blog.ts                   # Blog adapter
│   ├── resources.ts              # Resources adapter
│   ├── resume.ts                 # Resume adapter
│   └── utils.ts                  # Helper functions
│
├── .github/workflows/
│   └── deploy.yml                # GitHub Actions deployment
│
└── public/                        # Static assets & icons
```

---

## 🎨 Customization

### Bento Grid Layout

The home page uses a responsive CSS Grid bento layout. Edit `app/page.tsx`:

```typescript
const bentoCards = [
  {
    id: 'hero',
    title: 'Matthew Coleman',
    description: 'Welcome to my personal information hub...',
    span: 'md:col-span-2 md:row-span-1',
    link: '/about',
    icon: User
  },
  // Add or modify cards...
];
```

### Dark Veil Background

Customize the animated WebGL background in `app/page.tsx`:

```typescript
<DarkVeil
  hueShift={40}           // Color hue (0-360)
  speed={0.5}             // Animation speed
  resolutionScale={0.8}   // Render quality (0.5-1.0)
/>
```

### Theme Colors

Edit CSS variables in `app/globals.css`:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 3.9%;
  --primary: 0 0% 9%;
  /* ... more variables */
}
```

### Adding UI Components

```bash
# shadcn/ui components
npx shadcn@latest add button
npx shadcn@latest add card

# ReactBits components (configured in components.json)
npx shadcn@latest add @react-bits/avatar
```

---

## 📝 Content Management

### Writing Blog Posts

1. Open your Notion blog database
2. Create a new page with required properties:
   - **Title**: Your post title
   - **Slug**: URL-friendly identifier (`my-awesome-post`)
   - **Date**: Publication date
   - **Tags**: Category tags (comma-separated)
   - **Published**: ✓ Check to make visible
   - **Featured**: ✓ Check to pin to top (optional)
   - **Excerpt**: Short description for previews
   - **Author**: Your name
3. Write content using Notion blocks (converts to markdown)
4. Rebuild site (automatic daily or manual trigger)

### Adding Resources

1. Open your Notion resources database
2. Add entries with:
   - **Name**: Resource title
   - **URL**: External link
   - **Category**: Resource category
   - **Description**: Brief description
   - **Published**: ✓ Check to make visible
3. Resources automatically group by category

### Updating Resume

Edit your Notion resume page directly. Content converts to markdown automatically.

### Content Refresh

**Automatic**: Daily at 6:00 AM UTC via GitHub Actions

**Manual**:

- GitHub Actions: Actions tab → "Deploy to GitHub Pages" → Run workflow
- Admin Dashboard: Visit `/admin` (links to GitHub Actions)

---

## 🚢 Deployment

### GitHub Pages Deployment

**1. Configure GitHub Secrets**

Go to Settings → Secrets and variables → Actions:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `NOTION_TOKEN` | Notion integration token | `ntn_abc123...` |
| `NOTION_DATABASE_ID` | Blog database ID | `2b5c6cc793dc...` |
| `NOTION_RESOURCES_DATABASE_ID` | Resources database ID | `2dac6cc793dc...` |
| `NOTION_RESUME_PAGE_ID` | Resume page ID | `2dac6cc793dc...` |
| `NEXT_PUBLIC_GA_ID` | Google Analytics ID (optional) | `G-XXXXXXXXXX` |

**2. Enable GitHub Pages**

Settings → Pages → Source: "GitHub Actions"

**3. Deploy**

Push to `main` branch or trigger manually from Actions tab.

### Deployment Triggers

- ✅ **Push to main** - Automatic on every commit
- ⏰ **Daily rebuild** - 6:00 AM UTC (keeps content fresh)
- 🔘 **Manual dispatch** - Trigger from GitHub Actions

### Build Process

```bash
npm ci              # Install dependencies
npm run build       # Generate static site (out/)
# Deploy to GitHub Pages
```

The site will be available at: `https://mncoleman.github.io/matthew-coleman/`

---

## 📊 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server at localhost:3000 |
| `npm run build` | Build static site for production (outputs to `out/`) |
| `npm run start` | Start production server (for testing build) |
| `npm run lint` | Run ESLint for code quality checks |

---

## 🐛 Troubleshooting

<details>
<summary><strong>Posts not appearing on the site</strong></summary>

- Verify "Published" checkbox is enabled in Notion
- Check all required properties are filled
- Trigger manual rebuild via GitHub Actions
- Review build logs for Notion API errors
- Ensure Notion integration has database access

</details>

<details>
<summary><strong>Dark Veil background not covering viewport</strong></summary>

- Clear browser cache and hard reload
- Check browser console for WebGL errors
- Ensure browser supports WebGL 2.0
- Verify `overflow-x: hidden` in globals.css

</details>

<details>
<summary><strong>Build failures in GitHub Actions</strong></summary>

- Verify all GitHub Secrets are set correctly
- Check Notion token starts with `ntn_` (not `secret_`)
- Ensure Notion databases are shared with integration
- Review Actions logs for specific error messages

</details>

<details>
<summary><strong>Images not loading</strong></summary>

- Notion images have expiring URLs (require rebuild)
- For permanent images, upload to `/public`
- Reference with base path: `/matthew-coleman/image.jpg`
- Use Next.js `Image` component with `unoptimized` prop

</details>

<details>
<summary><strong>Environment variables not working</strong></summary>

- Client-side vars must use `NEXT_PUBLIC_` prefix
- Rebuild required after changing `.env.local`
- GitHub Secrets are only available in Actions builds
- Verify no typos in variable names

</details>

---

## 📚 Documentation

- **[CLAUDE.md](./CLAUDE.md)** - AI assistant project guide & architecture
- **[NOTION_SETUP.md](./NOTION_SETUP.md)** - Detailed Notion CMS configuration
- **[GOOGLE_ANALYTICS_SETUP.md](./GOOGLE_ANALYTICS_SETUP.md)** - Google Analytics integration

---

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**Matthew Coleman**

- Website: [mncoleman.github.io/matthew-coleman/](https://mncoleman.github.io/matthew-coleman/)
- GitHub: [@mncoleman](https://github.com/mncoleman)

---

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - React framework
- [Notion](https://notion.so/) - Content management system
- [shadcn/ui](https://ui.shadcn.com/) - UI component library
- [ReactBits](https://www.reactbits.dev/) - Dark Veil component
- [OGL](https://github.com/oframe/ogl) - WebGL library
- [Tailwind CSS](https://tailwindcss.com/) - Styling framework

---

<div align="center">

**Built with ❤️ using Next.js, TypeScript, Tailwind CSS, and Notion**

⭐ Star this repo if you find it helpful!

</div>
