# Personal Website & Blog

A modern, minimalist personal website and blog built with Next.js, TypeScript, and Tailwind CSS. Features a clean design with dark mode support and blog functionality powered by Decap CMS.

## Features

- 🎨 **Modern Design** - Clean, minimalist interface with professional typography
- 🌓 **Dark Mode** - Seamless light/dark mode toggle with system preference detection
- 📝 **Blog** - Markdown-based blog with tag support
- 🚀 **Fast** - Static site generation for optimal performance
- 📱 **Responsive** - Works perfectly on all devices
- 🎯 **SEO Ready** - Optimized for search engines
- 🔧 **Type Safe** - Built with TypeScript
- 📦 **No Database** - All content managed through markdown files

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui + ReactBits
- **Content**: Markdown with gray-matter
- **CMS**: Decap CMS (Git-based, browser-only)
- **Deployment**: GitHub Pages
- **Theme**: next-themes

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/slider003/matthew-coleman.git
cd matthew-coleman/personal-website
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Building for Production

```bash
npm run build
```

This will generate a static export in the `out` directory.

## Managing Content with Decap CMS

Decap CMS provides a user-friendly web interface for managing your blog posts - **no backend server or database required!**

### What is Decap CMS?

Decap CMS (formerly Netlify CMS) is an open-source, Git-based content management system that runs entirely in your browser. It's perfect for static sites because:

✅ **No backend needed** - Runs completely in the browser
✅ **No database required** - Uses your GitHub repository as storage
✅ **Works with GitHub Pages** - Perfect integration
✅ **Free to use** - Zero ongoing costs
✅ **Simple setup** - Just create a GitHub OAuth app (2 minutes)

### Quick Setup (5 Minutes)

**See the detailed guide in [`DECAP_CMS_SETUP.md`](./DECAP_CMS_SETUP.md) for complete instructions.**

Quick version:

1. **Create a GitHub OAuth App**:
   - Go to https://github.com/settings/developers
   - Click "OAuth Apps" → "New OAuth App"
   - Fill in:
     - Name: `Matthew Coleman Blog CMS`
     - Homepage: `https://slider003.github.io/matthew-coleman/`
     - Callback: `https://api.netlify.com/auth/done`
   - Save your Client ID and Client Secret

2. **Enable GitHub Pages**:
   - Go to repository Settings → Pages
   - Set source to "GitHub Actions"

3. **Access Your CMS**:
   - Visit: `https://slider003.github.io/matthew-coleman/admin/`
   - Click "Login with GitHub"
   - Start creating content!

### Admin Access

**CMS URL**: `https://slider003.github.io/matthew-coleman/admin/`

**Login**: Your GitHub account (must have write access to the repository)

**Features**:
- Rich markdown editor with live preview
- Image upload and media library
- Tag management
- Publish directly to your site

### Creating Blog Posts

#### Via Decap CMS (Recommended):
1. Visit `https://slider003.github.io/matthew-coleman/admin/`
2. Click "Blog Posts" → "New Blog Posts"
3. Fill in the title, date, excerpt, tags, and content
4. Click "Publish"
5. Your changes commit automatically and trigger a rebuild
6. Site updates in ~2 minutes!

#### Via Git (Direct):
Create a new markdown file in `content/posts/`:

```markdown
---
title: Your Post Title
date: 2025-11-14
excerpt: A brief description of your post
author: Matthew Coleman
tags:
  - tag1
  - tag2
---

Your post content here in Markdown format.
```

## Project Structure

```
personal-website/
├── app/                    # Next.js app directory
│   ├── blog/              # Blog pages
│   ├── about/             # About page
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── theme-provider.tsx
│   └── theme-toggle.tsx
├── content/              # Content files
│   └── posts/           # Blog posts (Markdown)
├── lib/                 # Utility functions
│   ├── blog.ts         # Blog utilities
│   └── utils.ts        # General utilities
├── public/             # Static assets
│   └── admin/         # Decap CMS admin interface
└── next.config.ts      # Next.js configuration
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Customization

### Changing Colors

Edit `app/globals.css` to modify the color scheme. The site uses CSS variables for easy theming.

### Adding Components

Install shadcn/ui components:
```bash
npx shadcn@latest add button
npx shadcn@latest add card
```

For ReactBits components, they can be added via the same CLI with the custom registry configured in `components.json`.

### Modifying Content

- **Home page**: Edit `app/page.tsx`
- **About page**: Edit `app/about/page.tsx`
- **Blog posts**: Add/edit files in `content/posts/`

## Deployment

This site is configured to deploy automatically to GitHub Pages via GitHub Actions.

### GitHub Pages Setup

1. Go to your repository settings
2. Navigate to "Pages"
3. Set source to "GitHub Actions"
4. Push to the `main` or any `claude/*` branch
5. GitHub Actions will build and deploy automatically

Your site will be available at:
```
https://slider003.github.io/matthew-coleman/
```

## License

MIT

## Author

Matthew Coleman

---

Built with ❤️ using Next.js, Tailwind CSS, and Decap CMS
