# Personal Website & Blog

A modern, minimalist personal website and blog built with Next.js, TypeScript, and Tailwind CSS. Features a clean design with dark mode support and blog functionality powered by Pages CMS.

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
- **CMS**: Pages CMS (Git-based)
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

## Managing Content with Pages CMS

Pages CMS provides a user-friendly interface for managing your blog posts without touching code.

### What is Pages CMS?

Pages CMS is an open-source, Git-based content management system that integrates directly with your GitHub repository. It allows you to:

- Create and edit blog posts through a web interface
- Upload and manage images
- Preview changes before publishing
- All changes are committed directly to your Git repository

### Setting Up Pages CMS

To use Pages CMS with this website, you'll need to deploy a Pages CMS instance. Here's how:

#### Option 1: Deploy to Vercel (Recommended - Free)

1. **Create a GitHub App**:
   - Go to GitHub Settings > Developer settings > GitHub Apps > New GitHub App
   - **GitHub App name**: `My Pages CMS` (or any name you prefer)
   - **Homepage URL**: `https://your-app-name.vercel.app` (you'll get this after deployment)
   - **Callback URL**: `https://your-app-name.vercel.app/api/auth/callback`
   - **Webhook URL**: `https://your-app-name.vercel.app/api/webhook`
   - **Webhook secret**: Generate a random string (save this!)
   - **Repository permissions**:
     - Contents: Read & write
     - Metadata: Read-only
     - Pull requests: Read & write
   - **Subscribe to events**: Push, Pull request
   - Click "Create GitHub App"
   - Generate a private key and download it
   - Note your App ID and Client ID

2. **Set up Database** (Supabase - Free):
   - Go to [supabase.com](https://supabase.com) and create a free account
   - Create a new project
   - Go to Project Settings > Database and copy the connection string
   - Set the connection pooling mode to "Session"

3. **Deploy to Vercel**:
   ```bash
   git clone https://github.com/pages-cms/pages-cms.git
   cd pages-cms
   ```
   - Push to your GitHub account
   - Go to [vercel.com](https://vercel.com) and import the repository
   - Add environment variables:
     ```
     DATABASE_URL=your_supabase_connection_string
     GITHUB_APP_ID=your_app_id
     GITHUB_CLIENT_ID=your_client_id
     GITHUB_CLIENT_SECRET=your_client_secret
     GITHUB_PRIVATE_KEY=your_private_key_content
     CRYPTO_KEY=your_random_32_char_string
     NEXTAUTH_URL=https://your-app-name.vercel.app
     NEXTAUTH_SECRET=your_random_string
     ```
   - Deploy!

4. **Install the GitHub App**:
   - Go to your GitHub App settings
   - Click "Install App"
   - Select your repository (`slider003/matthew-coleman`)
   - Authorize the installation

5. **Access Your CMS**:
   - Visit `https://your-app-name.vercel.app`
   - Sign in with GitHub
   - Start creating and editing blog posts!

### Pages CMS Admin URL

Once you've deployed Pages CMS, your admin interface will be available at:
```
https://your-app-name.vercel.app
```

**Login**: Use your GitHub account to authenticate.

### Creating Blog Posts

#### Via Pages CMS (Recommended):
1. Log in to your Pages CMS admin panel
2. Navigate to "Blog Posts"
3. Click "New Post"
4. Fill in the title, date, excerpt, tags, and content
5. Click "Save" - this will commit directly to your repository
6. GitHub Actions will automatically rebuild and deploy your site

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
├── .pages.yml          # Pages CMS configuration
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

Built with ❤️ using Next.js, Tailwind CSS, and Pages CMS
