# Personal Website & Blog

A modern, minimalist personal website and blog built with Next.js, TypeScript, and Tailwind CSS. Features a clean design with dark mode support and blog functionality powered by Notion.

## Features

- 🎨 **Modern Design** - Clean, minimalist interface with professional typography
- 🌓 **Dark Mode** - Seamless light/dark mode toggle with system preference detection
- 📝 **Blog** - Markdown-based blog with tag support
- 🚀 **Fast** - Static site generation for optimal performance
- 📱 **Responsive** - Works perfectly on all devices
- 🎯 **SEO Ready** - Optimized for search engines
- 🔧 **Type Safe** - Built with TypeScript
- 📦 **Notion CMS** - Blog content managed through Notion database

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui + ReactBits
- **Content**: Notion API for blog posts
- **CMS**: Notion for blog management
- **Deployment**: GitHub Pages
- **Theme**: next-themes

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

## Managing Content

### Blog Posts

Blog posts are managed through **Notion**. See [`NOTION_SETUP.md`](./NOTION_SETUP.md) for detailed setup instructions.

**Quick overview:**
1. Create a Notion integration and database with the required properties (Title, Slug, Date, Tags, Published, Excerpt, Author)
2. Add your `NOTION_TOKEN` and `NOTION_DATABASE_ID` to GitHub repository secrets
3. Create posts in Notion and mark them as Published
4. The site rebuilds daily at 6 AM UTC, or you can trigger a manual rebuild via the admin panel

### Static Pages

Static pages (like About, Home) are hardcoded React components in the `app/` directory:
- **About page**: Edit `app/about/page.tsx`
- **Home page**: Edit `app/page.tsx`

After editing, commit and push to GitHub to trigger a rebuild and deployment.

## Project Structure

```
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
├── lib/                 # Utility functions
│   ├── blog.ts         # Blog utilities (adapter)
│   ├── notion.ts       # Notion API integration
│   └── utils.ts        # General utilities
├── public/             # Static assets
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
- **Blog posts**: Edit in your Notion database (see `NOTION_SETUP.md`)

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

Built with ❤️ using Next.js, Tailwind CSS, and Notion
