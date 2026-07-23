'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Palette,
    Type,
    Layout,
    Layers,
    Download,
    Copy,
    Check,
    Zap,
    MessageSquareCode,
    ClipboardCheck,
    Github,
    ExternalLink,
    Globe2,
    ChevronDown
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { gsap } from 'gsap';
import Lenis from 'lenis';
import { useLenis } from 'lenis/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import DarkVeil from '@/components/ui/dark-veil';
import GlassCube from '@/components/ui/glass-cube';
import { BlurText } from '@/components/ui/blur-text';
import { FallInText } from '@/components/ui/fall-in-text';
import { TextType } from '@/components/ui/text-type';


const noScrollbarStyle: React.CSSProperties = {
    overflow: 'auto',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    WebkitOverflowScrolling: 'touch',
};

const VisitorGlobeDemo = dynamic(() => import('@/components/visitor-globe/VisitorGlobe'), { ssr: false });

const GLOBE_DEMO_PINS = [
    { id: 'g1', lat: 40.71, lng: -74.0, place_label: 'New York', country: 'US', name: null, food: null, song: null, fact: null, quote: null, created_at: 0 },
    { id: 'g2', lat: 51.51, lng: -0.13, place_label: 'London', country: 'UK', name: null, food: null, song: null, fact: null, quote: null, created_at: 0 },
    { id: 'g3', lat: 35.68, lng: 139.65, place_label: 'Tokyo', country: 'JP', name: null, food: null, song: null, fact: null, quote: null, created_at: 0 },
    { id: 'g4', lat: -33.87, lng: 151.21, place_label: 'Sydney', country: 'AU', name: null, food: null, song: null, fact: null, quote: null, created_at: 0 },
    { id: 'g5', lat: -23.55, lng: -46.63, place_label: 'São Paulo', country: 'BR', name: null, food: null, song: null, fact: null, quote: null, created_at: 0 },
];

const globePalette = [
    { name: 'Globe Base', hex: '#1C1C21', rgb: '0.11, 0.11, 0.13', usage: 'Sphere surface · baseColor' },
    { name: 'Globe Glow', hex: '#292B38', rgb: '0.16, 0.17, 0.22', usage: 'Atmosphere halo · glowColor' },
    { name: 'Pin Ping', hex: '#4F7CFF', rgb: '0.31, 0.49, 1.0', usage: 'Visitor pins · pulse marker' },
];

function GlobeShowcase({ copyToClipboard, copiedColor }: { copyToClipboard: (text: string, label: string) => void; copiedColor: string | null }) {
    return (
        <div className="space-y-8">
            <Card className="border-border/40 bg-background/60 backdrop-blur-xl overflow-hidden group">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                            <Globe2 className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl">The Visitor Globe</CardTitle>
                            <CardDescription>A minimalist dark globe (cobe) with branded, pulsing visitor pins.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-2 gap-8 items-center">
                        <div className="relative mx-auto w-full max-w-[300px] aspect-square">
                            <VisitorGlobeDemo pins={GLOBE_DEMO_PINS} className="h-full w-full" />
                        </div>
                        <div className="space-y-3 text-sm text-muted-foreground">
                            <p>A single-draw-call WebGL globe, dark and dotted by default. Each visitor location is a bright &ldquo;location ping&rdquo; with sonar pulse rings. Grab to spin, hover a pin for its name, click it for details.</p>
                            <ul className="space-y-1.5">
                                <li className="flex gap-2"><span className="text-primary">&bull;</span> Monochrome globe, electric-blue pins — one intentional accent.</li>
                                <li className="flex gap-2"><span className="text-primary">&bull;</span> Self-driven rAF, gated on visibility + reduced-motion.</li>
                                <li className="flex gap-2"><span className="text-primary">&bull;</span> Pins locked to the sphere via cobe&rsquo;s exact projection.</li>
                            </ul>
                        </div>
                    </div>

                    <h4 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Globe palette</h4>
                    <div className="grid sm:grid-cols-3 gap-4">
                        {globePalette.map((c) => (
                            <div
                                key={c.name}
                                onClick={() => copyToClipboard(c.hex, c.name)}
                                className="cursor-pointer rounded-2xl border border-border/40 p-3 hover:scale-[1.02] transition-transform"
                            >
                                <div className="h-16 rounded-xl border border-white/10" style={{ backgroundColor: c.hex }} />
                                <div className="mt-2 flex items-center justify-between">
                                    <span className="text-sm font-medium">{c.name}</span>
                                    {copiedColor === c.name ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-40" />}
                                </div>
                                <div className="text-xs font-mono text-muted-foreground">{c.hex}</div>
                                <div className="text-[11px] text-muted-foreground/70">rgb({c.rgb}) · {c.usage}</div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
                <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="text-lg">Glass dialog surface</CardTitle>
                        <CardDescription>
                            The <code className="text-xs">.glass-panel</code> utility — frosted, theme-aware, with a solid reduced-transparency fallback.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="glass-panel p-5">
                            <h5 className="font-bold">Where are you from?</h5>
                            <p className="text-sm text-muted-foreground mb-3">Drop a pin on the globe and say hello. 🌍</p>
                            <div className="h-9 rounded-md border border-input bg-transparent flex items-center px-3 text-sm text-muted-foreground">
                                Country, city, or full address…
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                    <CardHeader>
                        <CardTitle className="text-lg">Branded mini-captcha</CardTitle>
                        <CardDescription>Server-signed puzzles — human-friendly, lightly humorous, spam-slowing.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="rounded-lg border border-border/40 bg-background/30 p-3">
                            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm bg-primary/15 text-[10px] text-primary">?</span>
                                Quick human check
                            </div>
                            <p className="mb-2 text-sm">Which one is NOT a real animal?</p>
                            <div className="flex flex-wrap gap-2">
                                {['Cat', 'Dog', 'Sasquatch'].map((o, i) => (
                                    <span
                                        key={o}
                                        className={`rounded-md border px-3 py-1.5 text-sm ${i === 2 ? 'border-primary bg-primary/15 text-foreground' : 'border-border/50'}`}
                                    >
                                        {o}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

const STACK_CARDS = ['Hero', 'Blog', 'Resources', 'Resume'];

function ScrollStackPreview() {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollProgress, setScrollProgress] = useState(0);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const onScroll = () => {
            const max = el.scrollHeight - el.clientHeight;
            setScrollProgress(max > 0 ? el.scrollTop / max : 0);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div className="relative h-full">
            <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
            <div
                ref={scrollRef}
                // Its own scroll drives the preview's stack progress — the
                // site-wide Lenis must not intercept the wheel here.
                data-lenis-prevent
                className="h-full no-scrollbar"
                style={noScrollbarStyle}
            >
                <div className="h-[400px] relative px-3 pt-2">
                    {STACK_CARDS.map((label, i) => {
                        const cardStart = i / STACK_CARDS.length;
                        const cardProgress = Math.max(0, Math.min(1, (scrollProgress - cardStart) * STACK_CARDS.length));
                        const scale = 1 - cardProgress * 0.06 * (STACK_CARDS.length - 1 - i);
                        const yOffset = cardProgress * i * 4;

                        return (
                            <div
                                key={label}
                                className="sticky top-0 mb-8"
                                style={{
                                    top: `${8 + i * 6}px`,
                                    zIndex: i + 1,
                                    transform: `scale(${Math.max(0.85, scale)}) translateY(${yOffset}px)`,
                                    transformOrigin: 'top center',
                                    transition: 'transform 0.1s ease-out',
                                }}
                            >
                                <div className="rounded-lg border border-border/30 bg-muted/30 backdrop-blur-sm p-3 shadow-lg">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
                                    <div className="mt-1 h-2 w-2/3 rounded bg-foreground/10" />
                                    <div className="mt-1 h-2 w-1/2 rounded bg-foreground/5" />
                                </div>
                            </div>
                        );
                    })}
                    <div className="h-32" />
                </div>
            </div>
            <div className="absolute bottom-1 inset-x-0 text-center">
                <span className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">Scroll to interact</span>
            </div>
        </div>
    );
}

/**
 * Two identical scrollers side by side — one native, one driven by its own Lenis
 * instance. The difference only exists in motion, so a still image or a code
 * sample can't show it; wheeling over both back to back can.
 */
function SmoothScrollPreview() {
    const lenisWrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const wrapper = lenisWrapperRef.current;
        const content = wrapper?.firstElementChild as HTMLElement | null;
        if (!wrapper || !content) return;
        // Container mode: `wrapper` + `content` scope this instance to the pane,
        // leaving the site-wide root instance alone.
        const lenis = new Lenis({ wrapper, content, lerp: 0.07, autoRaf: true });
        return () => lenis.destroy();
    }, []);

    const rows = Array.from({ length: 26 }, (_, i) => i);
    const Rows = () => (
        <div className="px-4 py-3 space-y-3">
            {rows.map(i => (
                <div
                    key={i}
                    className="h-2.5 rounded bg-foreground/10"
                    style={{ width: `${45 + ((i * 37) % 50)}%` }}
                />
            ))}
        </div>
    );

    // grid-rows-[minmax(0,1fr)]: without it the row auto-sizes to the bars and the
    // panes grow past the 128px preview box instead of scrolling inside it.
    return (
        <div className="grid h-full grid-cols-2 grid-rows-[minmax(0,1fr)] divide-x divide-border/40">
            <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
            {[
                { label: 'Native', ref: undefined },
                { label: 'Lenis', ref: lenisWrapperRef },
            ].map(pane => (
                <div key={pane.label} className="relative h-full">
                    <div
                        ref={pane.ref}
                        // Both panes scroll themselves, so the site-wide Lenis has to
                        // ignore them — including the one that runs its own instance.
                        data-lenis-prevent
                        className="h-full overflow-y-auto no-scrollbar"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        <Rows />
                    </div>
                    <span className="pointer-events-none absolute bottom-1 inset-x-0 text-center text-[9px] uppercase tracking-widest text-muted-foreground/60">
                        {pane.label}
                    </span>
                </div>
            ))}
        </div>
    );
}

function ScrollFloatPreview() {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const tweenRef = useRef<gsap.core.Tween | null>(null);
    const hasPlayedRef = useRef(false);

    useEffect(() => {
        const container = containerRef.current;
        const textEl = textRef.current;
        if (!container || !textEl) return;

        const chars = textEl.querySelectorAll('.char');
        gsap.set(chars, {
            opacity: 0,
            yPercent: 120,
            scaleY: 2.3,
            scaleX: 0.7,
            transformOrigin: '50% 0%',
        });

        const onScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            const progress = scrollTop / (scrollHeight - clientHeight);

            if (progress > 0.3 && !hasPlayedRef.current) {
                hasPlayedRef.current = true;
                tweenRef.current?.kill();
                tweenRef.current = gsap.to(chars, {
                    duration: 0.8,
                    ease: 'back.inOut(2)',
                    opacity: 1,
                    yPercent: 0,
                    scaleY: 1,
                    scaleX: 1,
                    stagger: 0.03,
                });
            } else if (progress <= 0.15 && hasPlayedRef.current) {
                hasPlayedRef.current = false;
                tweenRef.current?.kill();
                tweenRef.current = gsap.to(chars, {
                    duration: 0.8,
                    ease: 'back.inOut(2)',
                    opacity: 0,
                    yPercent: 120,
                    scaleY: 2.3,
                    scaleX: 0.7,
                    stagger: 0.03,
                });
            }
        };

        container.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            container.removeEventListener('scroll', onScroll);
            tweenRef.current?.kill();
        };
    }, []);

    const text = 'Scroll Float';
    const chars = text.split('').map((char, i) => (
        <span key={i} className="char inline-block">
            {char === ' ' ? '\u00A0' : char}
        </span>
    ));

    return (
        <div
            ref={containerRef}
            // Scrolling this container is what triggers the ScrollFloat preview.
            data-lenis-prevent
            className="h-full no-scrollbar"
            style={{
                overflowY: 'scroll',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
            }}
        >
            <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
            <div className="h-[60px] flex items-end justify-center pb-2">
                <span className="text-[9px] text-muted-foreground/40 uppercase tracking-widest">Scroll down</span>
            </div>
            <div className="sticky top-0 h-[128px] flex items-center justify-center">
                <div ref={textRef} className="overflow-hidden">
                    <span className="inline-block text-lg font-bold leading-[1.5]">{chars}</span>
                </div>
            </div>
            <div className="h-[40px]" />
        </div>
    );
}

const MASTER_PROMPT = `You are a web developer AI assistant. I want you to build me a personal website inspired by mncoleman.com. This site was built entirely with AI prompting and uses a modern, minimalist design system. Below is everything you need to recreate or remix this design.

## Tech Stack

- **Framework**: Next.js 16 (App Router) with static export (\`output: 'export'\`)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3 with CSS variables for theming
- **Component Library**: shadcn/ui (New York style) — https://ui.shadcn.com
- **Animation Library**: React Bits — https://www.reactbits.dev
- **Icons**: Lucide React — https://lucide.dev
- **Animation Engine**: GSAP 3 — https://gsap.com
- **WebGL**: OGL — https://github.com/oframe/ogl
- **3D (optional)**: Three.js with React Three Fiber + Drei
- **CMS**: Notion API (@notionhq/client + notion-to-md)
- **Theme**: next-themes (class-based dark mode)
- **Hosting**: GitHub Pages (static)
- **Smooth Scrolling**: Lenis — https://github.com/darkroomengineering/lenis

## shadcn/ui Setup

Initialize shadcn with the "new-york" style and "neutral" base color:
\`\`\`bash
npx shadcn@latest init
\`\`\`

Add React Bits as a second registry. In your \`components.json\`, add:
\`\`\`json
{
  "registries": {
    "react-bits": {
      "url": "https://www.reactbits.dev/r"
    }
  }
}
\`\`\`

You can also configure the shadcn MCP server for AI-assisted component installation. Create \`.mcp.json\`:
\`\`\`json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
\`\`\`

Install components as needed:
\`\`\`bash
npx shadcn@latest add button card badge tabs separator  # shadcn/ui
npx shadcn@latest add @react-bits/dark-veil             # WebGL background
npx shadcn@latest add @react-bits/scroll-float          # Scroll text animation
\`\`\`

## Design System

### Color Palette (Monochromatic / Zero Saturation)

All colors are pure grayscale. Define them as CSS custom properties in HSL format.

**Light Mode:**
- Background: \`hsl(0 0% 100%)\` — #FFFFFF
- Foreground: \`hsl(0 0% 3.9%)\` — #0A0A0A
- Primary: \`hsl(0 0% 9%)\` — #171717
- Muted: \`hsl(0 0% 96.1%)\` — #F5F5F5
- Border: \`hsl(0 0% 89.8%)\` — #E5E5E5

**Dark Mode:**
- Background: \`hsl(0 0% 3.9%)\` — #0A0A0A
- Foreground: \`hsl(0 0% 98%)\` — #FAFAFA
- Primary: \`hsl(0 0% 98%)\` — #FAFAFA
- Secondary: \`hsl(0 0% 14.9%)\` — #262626
- Border: \`hsl(0 0% 14.9%)\` — #262626

### Typography

Use a system font stack (no custom fonts to load):
\`\`\`css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
\`\`\`

Scale: H1 = text-4xl/text-5xl font-black, H2 = text-3xl/text-4xl font-bold, H3 = text-2xl/text-3xl font-semibold, Body = text-base.

### Glassmorphism (Core Visual Language)

Apply this pattern to all cards and surfaces:
\`\`\`
bg-background/40 backdrop-blur-xl border border-border/30
\`\`\`

On hover: \`hover:border-primary/50 hover:bg-background/50\`

### Corner Radii
- Cards/Bento tiles: \`rounded-2xl\` (1rem)
- Buttons/Badges: \`rounded-full\` (pill shape)
- Default: \`rounded-lg\` (0.5rem)

## Page Architecture

### Home Page — Bento Grid Layout
- CSS Grid: \`grid-cols-1 md:grid-cols-3\` with responsive spans
- Desktop: Interactive 3D glass cube cards with tilt on hover, idle pulse animation sweeping columns
- Mobile: Scroll Stack layout where cards use \`position: sticky\` and overlap as user scrolls
- Detect hover capability with \`window.matchMedia('(hover: hover)')\` to switch between desktop/mobile layouts
- Dark Veil WebGL animated background behind everything

### Dark Veil Background
- WebGL animated background using OGL (from React Bits)
- Must use \`position: fixed\` with \`100vw/100vh\` sizing
- Set \`z-index: 0\` to keep behind content
- Add \`overflow-x: hidden\` to html/body to prevent scrollbar issues
- Props: \`hueShift={40} speed={0.5} resolutionScale={0.8}\`

### Glass Cube Cards (Desktop)
- 3D CSS transforms with \`transform-style: preserve-3d\`
- Mouse-tracking tilt effect
- Glassmorphism front face: \`rgba(255, 255, 255, 0.03)\` background with \`backdrop-filter: blur(12px) saturate(1.4)\`
- Depth slices (translucent borders) for 3D depth illusion
- Wobble animation on load, idle pulse animation when not interacting

### Smooth Scroll
- One site-wide Lenis instance (\`<ReactLenis root>\`) scrolling the real document — \`sticky\`/\`fixed\` and \`window.scrollY\` readers keep working
- Every nested scroll container needs \`data-lenis-prevent\`, or Lenis swallows its wheel events
- Corner panel exposes glide (\`lerp\`) and reach (\`wheelMultiplier\`) live; prefs persist to \`localStorage\`
- Off entirely under \`prefers-reduced-motion\`; page scrollbar hidden on \`html\`/\`body\`

### Custom Cursor
- Hide OS cursor with \`cursor: none\` on all elements
- Render a small dot (8px) that follows cursor immediately
- Render a larger ring (32px) that lerps toward cursor position (factor: 0.15)
- Scale down on click, hide on touch devices
- z-index: 9999

### Text Animations
- **Fall In Text**: Drop from above with overshoot easing \`cubic-bezier(0.34, 1.56, 0.64, 1)\`
- **Blur Text**: Fade in from \`blur-md opacity-0\` to \`blur-0 opacity-100\`
- **Text Type**: Character-by-character typewriter reveal with blinking cursor
- **Scroll Float**: GSAP-powered per-character animation on scroll (opacity, scale, yPercent)

### Navigation
- Sticky header with \`bg-background/80 backdrop-blur-md\`
- Desktop: horizontal nav links with keyboard shortcuts
- Mobile: hamburger menu with slide-in overlay
- Pages: Home, Blog, Projects, Resources, Resume, About, Brand Kit

### Content Management
- All content (Blog, Resources, Resume, Projects) fetched from Notion API at build time
- Graceful fallback to sample data when Notion credentials aren't configured
- Validate credentials BEFORE making API calls

## Key Dependencies (package.json)

\`\`\`json
{
  "next": "^16.1.5",
  "react": "^19.2.0",
  "tailwindcss": "^3.4.18",
  "gsap": "^3.14.2",
  "ogl": "^1.0.11",
  "lucide-react": "^0.553.0",
  "next-themes": "^0.4.6",
  "@notionhq/client": "^2.3.0",
  "notion-to-md": "^3.1.9",
  "react-markdown": "^10.1.0",
  "lenis": "^1.3.17",
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "tailwind-merge": "^3.4.0",
  "tailwindcss-animate": "^1.0.7",
  "@tailwindcss/typography": "^0.5.19"
}
\`\`\`

## Source Code Reference

The full source code is available at: https://github.com/mncoleman/mncoleman

## Instructions

Build me a personal website using this design system. Adapt the content to be about me — I'll provide my name and details. Keep the same monochromatic, glassmorphism-heavy aesthetic with the animated WebGL background, 3D bento grid layout, and interactive text animations. Use shadcn/ui and React Bits components. Deploy as a static site.

If I want to connect Notion as a CMS, help me set up the Notion integration with graceful fallback to sample data. Otherwise, use local markdown or JSON files for content.

Start by scaffolding the Next.js project, installing dependencies, and setting up the design system (CSS variables, Tailwind config, shadcn/ui). Then build the pages one at a time.`;

const QUICK_START_PROMPT = `Create a Next.js 16 personal website with static export. Use Tailwind CSS with a monochromatic color scheme (pure grayscale, zero saturation). Install shadcn/ui with the "new-york" style and "neutral" base color. Add a Dark Veil WebGL animated background from React Bits (reactbits.dev). Build a bento grid home page with glassmorphism cards (bg-background/40 backdrop-blur-xl border border-border/30). Include pages for Blog, Projects, Resources, Resume, and About. Use system fonts, Lucide icons, and GSAP for animations. Reference https://github.com/mncoleman/mncoleman for the full source code.`;

const DESIGN_ONLY_PROMPT = `I want to recreate the visual design system from mncoleman.com. Here are the specs:

**Colors** (all zero-saturation grayscale):
- Light: Background #FFFFFF, Foreground #0A0A0A, Primary #171717, Muted #F5F5F5, Border #E5E5E5
- Dark: Background #0A0A0A, Foreground #FAFAFA, Primary #FAFAFA, Secondary #262626, Border #262626

**Typography**: System font stack (-apple-system, BlinkMacSystemFont, Segoe UI, Roboto...). H1: text-4xl font-black. H2: text-3xl font-bold. Body: text-base.

**Core Visual Pattern — Glassmorphism**:
- Cards: bg-background/40 backdrop-blur-xl border border-border/30
- Hover: hover:border-primary/50 hover:bg-background/50
- Corners: rounded-2xl for cards, rounded-full for buttons

**Background**: Dark Veil — a full-screen fixed WebGL animated background using OGL (position: fixed, 100vw/100vh, z-index: 0). Content sits on top with relative z-index.

**Layout**: Bento grid (CSS Grid, 3 columns on desktop, single column on mobile) with frosted glass cards overlaying the animated background.

Apply this design system to my project using Tailwind CSS custom properties and shadcn/ui components.`;

function PromptingSection({ copyToClipboard, copiedColor }: { copyToClipboard: (text: string, label: string) => void; copiedColor: string | null }) {
    const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

    const prompts = [
        {
            id: 'master',
            title: 'Master Prompt',
            description: 'The complete prompt with full tech stack, design system, and architecture details. Give this to any AI coding assistant to recreate or remix the entire site.',
            content: MASTER_PROMPT,
            badge: 'Complete',
            badgeVariant: 'default' as const,
        },
        {
            id: 'quickstart',
            title: 'Quick Start Prompt',
            description: 'A concise prompt that captures the essentials. Good for getting a project scaffolded quickly.',
            content: QUICK_START_PROMPT,
            badge: 'Concise',
            badgeVariant: 'secondary' as const,
        },
        {
            id: 'design',
            title: 'Design System Only',
            description: 'Just the visual design specs — colors, typography, glassmorphism, and layout. Use this to apply the aesthetic to an existing project.',
            content: DESIGN_ONLY_PROMPT,
            badge: 'Visual',
            badgeVariant: 'outline' as const,
        },
    ];

    return (
        <div className="space-y-8">
            {/* Explanation Card */}
            <Card className="border-border/40 bg-background/60 backdrop-blur-xl overflow-hidden">
                <CardHeader>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                            <MessageSquareCode className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl">Build a Site Like This with AI</CardTitle>
                            <CardDescription>No coding experience required — just copy, paste, and prompt.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        This entire website was built using AI prompting — no hand-written code. The prompts below
                        capture everything an AI coding assistant needs to know to recreate this design from scratch
                        or adapt it for your own personal site.
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Copy any of these prompts into an AI tool like{' '}
                        <strong>Claude</strong>,{' '}
                        <strong>ChatGPT</strong>,{' '}
                        <strong>Cursor</strong>, or{' '}
                        <strong>Claude Code</strong>{' '}
                        and it will guide the AI to build a site using the same tech stack, design system, and
                        architecture. You can also{' '}
                        <a
                            href="https://github.com/mncoleman/mncoleman"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-4 hover:text-primary transition-colors"
                        >
                            clone the repository
                        </a>{' '}
                        directly if you prefer.
                    </p>
                    <Separator className="my-2" />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
                            <span className="text-lg font-bold text-primary mt-0.5">1</span>
                            <div>
                                <p className="text-sm font-medium">Copy a prompt</p>
                                <p className="text-xs text-muted-foreground">Pick the one that fits your needs</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
                            <span className="text-lg font-bold text-primary mt-0.5">2</span>
                            <div>
                                <p className="text-sm font-medium">Paste into your AI</p>
                                <p className="text-xs text-muted-foreground">Claude, ChatGPT, Cursor, etc.</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/10">
                            <span className="text-lg font-bold text-primary mt-0.5">3</span>
                            <div>
                                <p className="text-sm font-medium">Customize it</p>
                                <p className="text-xs text-muted-foreground">Add your name, content, and style</p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Prompt Cards */}
            <div className="space-y-4">
                {prompts.map((prompt) => (
                    <Card key={prompt.id} className="border-border/40 bg-background/60 backdrop-blur-xl overflow-hidden group">
                        <CardHeader className="cursor-pointer" onClick={() => setExpandedPrompt(expandedPrompt === prompt.id ? null : prompt.id)}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-lg">{prompt.title}</CardTitle>
                                        <Badge variant={prompt.badgeVariant}>{prompt.badge}</Badge>
                                    </div>
                                    <CardDescription>{prompt.description}</CardDescription>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(prompt.content, prompt.id);
                                    }}
                                >
                                    {copiedColor === prompt.id ? (
                                        <>
                                            <ClipboardCheck className="h-4 w-4 mr-2" />
                                            Copied
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="h-4 w-4 mr-2" />
                                            Copy
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardHeader>
                        {expandedPrompt === prompt.id && (
                            <CardContent>
                                <div className="relative">
                                    <pre data-lenis-prevent className="p-4 rounded-xl bg-muted/50 border border-border/40 text-xs leading-relaxed whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto font-mono">
                                        {prompt.content}
                                    </pre>
                                </div>
                            </CardContent>
                        )}
                    </Card>
                ))}
            </div>

            {/* Tools & Resources */}
            <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                <CardHeader>
                    <CardTitle>Tools & Resources Referenced</CardTitle>
                    <CardDescription>Everything used to build this site, with links.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                            { name: 'Next.js', url: 'https://nextjs.org', desc: 'React framework' },
                            { name: 'Tailwind CSS', url: 'https://tailwindcss.com', desc: 'Utility-first CSS' },
                            { name: 'shadcn/ui', url: 'https://ui.shadcn.com', desc: 'Component library' },
                            { name: 'React Bits', url: 'https://www.reactbits.dev', desc: 'Animation components' },
                            { name: 'GSAP', url: 'https://gsap.com', desc: 'Animation engine' },
                            { name: 'OGL', url: 'https://github.com/oframe/ogl', desc: 'WebGL library' },
                            { name: 'Lucide', url: 'https://lucide.dev', desc: 'Icon library' },
                            { name: 'Notion API', url: 'https://developers.notion.com', desc: 'Content management' },
                            { name: 'Radix UI', url: 'https://www.radix-ui.com', desc: 'UI primitives' },
                            { name: 'Lenis', url: 'https://github.com/darkroomengineering/lenis', desc: 'Smooth scrolling' },
                            { name: 'next-themes', url: 'https://github.com/pacocoursey/next-themes', desc: 'Theme management' },
                            { name: 'Source Code', url: 'https://github.com/mncoleman/mncoleman', desc: 'GitHub repository' },
                        ].map((tool) => (
                            <a
                                key={tool.name}
                                href={tool.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/20 transition-all group/tool"
                            >
                                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover/tool:text-primary transition-colors shrink-0" />
                                <div>
                                    <p className="text-sm font-medium">{tool.name}</p>
                                    <p className="text-xs text-muted-foreground">{tool.desc}</p>
                                </div>
                            </a>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

const TAB_SLUGS = ['colors', 'type', 'system', 'ui-kit', 'effects', 'prompting', 'globe'] as const;

const LOGO_FORMATS: { format: LogoFormat; label: string; note: string }[] = [
    { format: 'svg', label: 'SVG', note: 'vector' },
    { format: 'png', label: 'PNG', note: 'transparent' },
    { format: 'jpeg', label: 'JPG', note: 'opaque' },
];

/** One download button per size, with the three formats behind it. */
function LogoDownloadMenu({ variant, size }: { variant: LogoVariant; size: number }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Download the ${size} pixel ${variant} logo`}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    open
                        ? 'border-border bg-muted/50 text-foreground'
                        : 'border-border/40 text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground'
                }`}
            >
                <Download className="h-3 w-3" />
                Download
                <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute left-1/2 top-full z-20 mt-1 w-36 -translate-x-1/2 rounded-lg border border-border/50 bg-background/95 p-1 shadow-lg backdrop-blur-xl"
                >
                    {LOGO_FORMATS.map(({ format, label, note }) => (
                        <button
                            key={format}
                            role="menuitem"
                            type="button"
                            onClick={() => {
                                downloadLogo(variant, size, format);
                                setOpen(false);
                            }}
                            className="flex w-full items-baseline justify-between rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60"
                        >
                            <span className="font-mono text-[11px] uppercase tracking-wider">{label}</span>
                            <span className="text-[10px] text-muted-foreground/70">{note}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function LogoHero({ variant }: { variant: LogoVariant }) {
    const dark = variant === 'dark';
    return (
        <div
            className={`relative aspect-video rounded-2xl flex items-center justify-center border group/logo ${
                dark ? 'bg-black border-white/10' : 'bg-white border-black/5'
            }`}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={logoDataUrl(variant, 96)}
                width={96}
                height={96}
                alt={`MC monogram, ${variant} version`}
                className="rounded-2xl shadow-2xl transition-transform group-hover/logo:scale-110"
            />
            <div className="absolute inset-x-0 bottom-4 text-center">
                <span
                    className={`text-xs font-mono tracking-widest uppercase ${
                        dark ? 'text-white/40' : 'text-black/40'
                    }`}
                >
                    {variant} Version
                </span>
            </div>
        </div>
    );
}

function LogoSizeRamp({ variant }: { variant: LogoVariant }) {
    return (
        <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {variant} Version Sizes
            </h3>

            <div className="mt-5 flex flex-wrap items-end gap-6">
                {LOGO_SIZES.map(size => (
                    <div key={size} className="flex flex-col items-center gap-2.5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={logoDataUrl(variant, size)}
                            width={size}
                            height={size}
                            alt={`MC monogram, ${variant} version, ${size} by ${size} pixels`}
                            className="shrink-0"
                        />
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                            {size}×{size}
                        </span>
                        <LogoDownloadMenu variant={variant} size={size} />
                    </div>
                ))}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Larger
                </span>
                {LOGO_EXPORT_ONLY_SIZES.map(size => (
                    <div key={size} className="flex items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">
                            {size}
                        </span>
                        <LogoDownloadMenu variant={variant} size={size} />
                    </div>
                ))}
            </div>
        </div>
    );
}

// Shown at true pixel size, so the ramp stops where a tile still fits the
// half-width column it lives in. Bigger sizes are export-only, in their own row.
const LOGO_SIZES = [16, 32, 64, 128];
const LOGO_EXPORT_ONLY_SIZES = [256, 512, 1024];
type LogoVariant = 'dark' | 'light';
type LogoFormat = 'svg' | 'png' | 'jpeg';

/**
 * The single source of truth for the mark: the size ramp on this page and every
 * download are rendered from this same string, so what you see is what you get.
 *
 * `width`/`height` are set explicitly, not just `viewBox` — an <img> fed an SVG
 * with only a viewBox rasterises at the browser's default 300x150 (or nothing),
 * which is how you end up with blank PNGs.
 */
function logoSvg(variant: LogoVariant, size: number) {
    const bg = variant === 'dark' ? '#18181b' : '#ffffff';
    const fg = variant === 'dark' ? '#ffffff' : '#18181b';
    // The light mark is white on white: without a hairline it disappears on a
    // light page, which is exactly where it gets used.
    const hairline =
        variant === 'light'
            ? '<rect x="0.5" y="0.5" width="99" height="99" rx="19.5" fill="none" stroke="rgba(0,0,0,0.1)"/>'
            : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="${bg}"/>${hairline}
  <text x="50" y="50" font-family="system-ui, -apple-system, sans-serif" font-size="42" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="central">MC</text>
</svg>`;
}

const logoDataUrl = (variant: LogoVariant, size: number) =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg(variant, size))}`;

function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function downloadLogo(variant: LogoVariant, size: number, format: LogoFormat) {
    const svg = logoSvg(variant, size);
    const name = `mncoleman-logo-${variant}-${size}`;
    if (format === 'svg') {
        return saveBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
    }

    const img = new Image();
    img.src = logoDataUrl(variant, size);
    await img.decode();

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // JPG has no alpha, so the rounded corners would rasterise black. PNG and SVG
    // keep them transparent, which is what you want for a rounded mark.
    if (format === 'jpeg') {
        ctx.fillStyle = variant === 'dark' ? '#18181b' : '#ffffff';
        ctx.fillRect(0, 0, size, size);
    }
    ctx.drawImage(img, 0, 0, size, size);
    canvas.toBlob(
        blob => blob && saveBlob(blob, `${name}.${format === 'jpeg' ? 'jpg' : 'png'}`),
        `image/${format}`,
        0.95
    );
}

export default function BrandKitClient() {
    const [tab, setTab] = useState<string>('colors');
    const [logoOpen, setLogoOpen] = useState(true);
    const tabsRef = useRef<HTMLDivElement>(null);
    const lenis = useLenis();
    const [floorHeight, setFloorHeight] = useState<number | null>(null);

    // Deep links: /brand-kit#effects opens that section. Read after mount rather
    // than during render so the server and first client pass agree.
    useEffect(() => {
        const fromHash = () => {
            const slug = window.location.hash.replace('#', '');
            if ((TAB_SLUGS as readonly string[]).includes(slug)) setTab(slug);
        };
        fromHash();
        window.addEventListener('hashchange', fromHash);
        return () => window.removeEventListener('hashchange', fromHash);
    }, []);

    const handleTabChange = (next: string) => {
        const el = tabsRef.current;
        const oldTabsH = el?.getBoundingClientRect().height ?? 0;
        const oldDocH = document.documentElement.scrollHeight;

        // Switching to a shorter section shrinks the document, and the browser
        // clamps scrollY the instant it does — that snap is the jerk. The panels'
        // min-h-[80vh] means this rarely bites now; when it still does, hold the
        // outgoing height as a floor so nothing clamps, glide to a sane position,
        // then drop the floor.
        if (el) setFloorHeight(oldTabsH);
        setTab(next);
        history.replaceState(null, '', `#${next}`);

        const release = () => setFloorHeight(null);
        requestAnimationFrame(() => {
            const list = el?.querySelector('[role="tablist"]') as HTMLElement | null;
            const panel = el?.querySelector('[role="tabpanel"]') as HTMLElement | null;
            if (!list || !panel) return release();

            // offsetTop delta rather than a hardcoded 32: it picks up the panel's
            // top margin without assuming which utility class set it.
            const newTabsH = panel.offsetTop - list.offsetTop + panel.offsetHeight;
            const newMax = Math.max(0, oldDocH - oldTabsH + newTabsH - window.innerHeight);
            // Nothing will clamp — stay exactly where you are. This is the common
            // case now that the panels carry a min-height.
            if (window.scrollY <= newMax) return release();

            // Something has to move. Land on the tab strip rather than on the new
            // bottom of the page: being dumped at the top of the document every
            // time you change section is worse than the snap we set out to fix.
            const stripTop = list.getBoundingClientRect().top + window.scrollY - 96;
            const target = Math.min(Math.max(0, stripTop), newMax);

            if (lenis) {
                lenis.scrollTo(target, { duration: 0.6, onComplete: release });
            } else {
                window.scrollTo({ top: target, behavior: 'smooth' });
                window.setTimeout(release, 700);
            }
        });
        // Belt and braces: a pinned floor is far worse than a missed animation,
        // so drop it regardless of whether the callbacks above ever fire.
        window.setTimeout(release, 1500);
    };

    const [copiedColor, setCopiedColor] = useState<string | null>(null);
    const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
    const [cursorPos, setCursorPos] = useState({ x: 50, y: 50 }); // percentage positions
    const cursorPreviewRef = useRef<HTMLDivElement>(null);
    const targetPosRef = useRef({ x: 50, y: 50 });
    const currentPosRef = useRef({ x: 50, y: 50 });

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopiedColor(label);
        setTimeout(() => setCopiedColor(null), 2000);
    };

    // Track global mouse movement for cursor preview with smooth lerping
    useEffect(() => {
        if (selectedComponent !== 'Custom Cursor' || !cursorPreviewRef.current) return;

        let animationFrameId: number;

        const handleMouseMove = (e: MouseEvent) => {
            const preview = cursorPreviewRef.current;
            if (!preview) return;

            const rect = preview.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;

            // Update target position with clamping
            targetPosRef.current = {
                x: Math.max(0, Math.min(100, x)),
                y: Math.max(0, Math.min(100, y))
            };
        };

        // Smooth animation loop
        const animate = () => {
            // Lerp current position towards target
            const lerpFactor = 0.15;
            currentPosRef.current.x += (targetPosRef.current.x - currentPosRef.current.x) * lerpFactor;
            currentPosRef.current.y += (targetPosRef.current.y - currentPosRef.current.y) * lerpFactor;

            setCursorPos({
                x: currentPosRef.current.x,
                y: currentPosRef.current.y
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        window.addEventListener('mousemove', handleMouseMove);
        animationFrameId = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, [selectedComponent]);

    const reactBitsComponents = [
        {
            name: 'Dark Veil',
            description: 'Dynamic animated background system.',
            file: '/components/ui/dark-veil.tsx',
            preview: 'bg-gradient-to-br from-primary/10 via-primary/5 to-transparent animate-pulse'
        },
        {
            name: 'Glass Cube',
            description: '3D CSS cube with frosted glass faces for bento grid cards.',
            file: '/components/ui/glass-cube.tsx',
            preview: 'bg-primary/5'
        },
        {
            name: 'Smooth Scroll',
            description: 'Site-wide Lenis scrolling, with live glide and reach controls in the corner.',
            file: '/components/smooth-scroll.tsx',
            preview: 'bg-foreground/5'
        },
        {
            name: 'Scroll Float',
            description: 'Per-character scroll-triggered entrance animation using IntersectionObserver.',
            file: '/components/ScrollFloat.tsx',
            preview: 'font-bold'
        },
        {
            name: 'Scroll Stack',
            description: 'Mobile sticky-card stacking layout for the homepage.',
            file: '/components/ScrollStack.tsx',
            preview: 'animate-bounce'
        },
        {
            name: 'Custom Cursor',
            description: 'Smooth, directional interactive cursor.',
            file: '/components/ui/CustomCursor.tsx',
            preview: 'cursor-default'
        },
        {
            name: 'Blur Text',
            description: 'Sophisticated typography blur animation.',
            file: '/components/ui/blur-text.tsx',
            preview: 'blur-sm hover:blur-none transition-all'
        },
        {
            name: 'Fall In Text',
            description: 'Text entrance animation effect.',
            file: '/components/ui/fall-in-text.tsx',
            preview: 'animate-bounce'
        },
        {
            name: 'Text Type',
            description: 'Typewriter text animation.',
            file: '/components/ui/text-type.tsx',
            preview: 'font-mono'
        }
    ];

    const colors = [
        { name: 'Background', hsl: '0 0% 100%', hex: '#FFFFFF', usage: 'Light mode background' },
        { name: 'Foreground', hsl: '0 0% 3.9%', hex: '#0A0A0A', usage: 'Light mode text' },
        { name: 'Primary', hsl: '0 0% 9%', hex: '#171717', usage: 'Primary brand elements' },
        { name: 'Muted', hsl: '0 0% 96.1%', hex: '#F5F5F5', usage: 'Muted backgrounds' },
        { name: 'Border', hsl: '0 0% 89.8%', hex: '#E5E5E5', usage: 'Dividers and borders' },
        { name: 'Dark Background', hsl: '0 0% 3.9%', hex: '#0A0A0A', usage: 'Dark mode background' },
        { name: 'Dark Foreground', hsl: '0 0% 98%', hex: '#FAFAFA', usage: 'Dark mode text' },
        { name: 'Dark Secondary', hsl: '0 0% 14.9%', hex: '#262626', usage: 'Dark mode surfaces' },
    ];

    const typography = [
        { level: 'H1', class: 'text-4xl md:text-6xl font-black mb-4', sample: 'Matthew Coleman' },
        { level: 'H2', class: 'text-3xl md:text-4xl font-bold mb-3', sample: 'Personal Website' },
        { level: 'H3', class: 'text-2xl md:text-3xl font-semibold mb-2', sample: 'Brand Guidelines' },
        { level: 'Body', class: 'text-base text-muted-foreground', sample: 'Transparent, minimalist, and functional.' },
    ];

    return (
        <div className="space-y-12">
            {/* Introduction */}
            <section className="text-center space-y-4 pt-8">
                <Badge variant="outline" className="px-4 py-1 border-primary/20 bg-primary/5 text-primary animate-pulse">
                    Design System v1.0
                </Badge>
                <h1 className="text-5xl md:text-7xl font-black tracking-tight bg-gradient-to-r from-primary via-primary/50 to-primary bg-clip-text text-transparent">
                    BRAND KIT
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto backdrop-blur-sm">
                    A collection of design assets and guidelines for the Matthew Coleman brand.
                    Minimalist, high-performance, and elegant.
                </p>
            </section>

            {/* Logo Section */}
            <Card className="border-border/40 bg-background/60 backdrop-blur-xl overflow-hidden group">
                <CardHeader>
                    <button
                        type="button"
                        onClick={() => setLogoOpen(o => !o)}
                        aria-expanded={logoOpen}
                        className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
                    >
                        <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                            <Layers className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl">The Logo</CardTitle>
                            <CardDescription>Official "MC" monogram and typography.</CardDescription>
                        </div>
                        <ChevronDown
                            className={`ml-auto h-5 w-5 text-muted-foreground transition-transform duration-300 ${
                                logoOpen ? '' : '-rotate-90'
                            }`}
                        />
                    </button>
                </CardHeader>
                {/* grid-rows 1fr→0fr animates the collapse without measuring the
                    content, which matters because the ramps reflow as the card
                    changes width. */}
                <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                        logoOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                >
                    <div className="overflow-hidden">
                <CardContent>
                    {/* One column per variant: hero above its own size ramp, so each
                        family reads top to bottom and the two sit side by side. */}
                    <div className="grid gap-10 lg:grid-cols-2">
                        {(['dark', 'light'] as LogoVariant[]).map(variant => (
                            <div key={variant} className="space-y-6">
                                <LogoHero variant={variant} />
                                <LogoSizeRamp variant={variant} />
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-border/30 pt-6">
                        <p className="text-xs text-muted-foreground/70">
                            Ramps are shown at actual size. Every download is generated from the same
                            source as the mark you see.
                        </p>
                        <Button className="ml-auto rounded-full px-6 transition-all hover:scale-105" variant="secondary" asChild>
                            <a href="/icon.svg" download="mncoleman-logo.svg">
                                <Download className="mr-2 h-4 w-4" />
                                Source SVG
                            </a>
                        </Button>
                    </div>
                </CardContent>
                    </div>
                </div>
            </Card>

            <Tabs
                value={tab}
                onValueChange={handleTabChange}
                className="w-full"
                ref={tabsRef}
                style={floorHeight ? { minHeight: floorHeight } : undefined}
            >
                <TabsList className="grid w-full h-auto grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 bg-muted/50 p-1 rounded-2xl xl:rounded-full border border-border/40">
                    <TabsTrigger value="colors" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Palette className="h-4 w-4 mr-2" />
                        Colors
                    </TabsTrigger>
                    <TabsTrigger value="type" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Type className="h-4 w-4 mr-2" />
                        Type
                    </TabsTrigger>
                    <TabsTrigger value="system" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Layout className="h-4 w-4 mr-2" />
                        System
                    </TabsTrigger>
                    <TabsTrigger value="ui-kit" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Layers className="h-4 w-4 mr-2" />
                        UI Kit
                    </TabsTrigger>
                    <TabsTrigger value="effects" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Zap className="h-4 w-4 mr-2" />
                        Effects
                    </TabsTrigger>
                    <TabsTrigger value="prompting" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <MessageSquareCode className="h-4 w-4 mr-2" />
                        Prompting
                    </TabsTrigger>
                    <TabsTrigger value="globe" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Globe2 className="h-4 w-4 mr-2" />
                        Globe
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="colors" className="mt-8 min-h-[80vh]">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {colors.map((color) => (
                            <div key={color.name} className="group relative">
                                <div
                                    className="h-40 rounded-3xl border border-border shadow-inner transition-all group-hover:scale-[1.02] group-hover:shadow-lg cursor-pointer flex flex-col justify-end p-4 overflow-hidden"
                                    style={{ backgroundColor: color.hex }}
                                    onClick={() => copyToClipboard(color.hex, color.name)}
                                >
                                    <div className={`p-2 rounded-xl backdrop-blur-md flex items-center justify-between ${parseInt(color.hsl.split(' ')[2]) > 50 ? 'bg-black/5 text-black' : 'bg-white/5 text-white'}`}>
                                        <span className="text-xs font-mono font-medium">{color.hex}</span>
                                        {copiedColor === color.name ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-40" />}
                                    </div>
                                </div>
                                <div className="mt-3 px-1">
                                    <h4 className="font-bold text-sm">{color.name}</h4>
                                    <p className="text-xs text-muted-foreground">{color.usage}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="type" className="mt-8 min-h-[80vh]">
                    <div className="space-y-6">
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Font Stack</CardTitle>
                                <CardDescription>System font stack for optimal performance and native feel.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-4 rounded-xl bg-muted/50 border border-border/40">
                                    <code className="text-xs break-all">
                                        -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
                                        'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif
                                    </code>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    We use a system font stack that prioritizes native fonts for each platform, ensuring
                                    fast load times, excellent readability, and a familiar feel for users.
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Typography Scale</CardTitle>
                                <CardDescription>Hierarchical text styles for consistent visual rhythm.</CardDescription>
                            </CardHeader>
                            <CardContent className="pt-8 space-y-10">
                                {typography.map((type) => (
                                    <div key={type.level} className="relative group">
                                        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-2 border-b border-border/20 pb-6 transition-colors group-hover:border-primary/20">
                                            <span className={type.class}>{type.sample}</span>
                                            <Badge variant="secondary" className="w-fit">{type.level}</Badge>
                                        </div>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="system" className="mt-8 min-h-[80vh]">
                    <div className="grid md:grid-cols-2 gap-8">
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Rounding</CardTitle>
                                <CardDescription>Bento-style corner radii.</CardDescription>
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-6">
                                <div className="space-y-3">
                                    <div className="w-20 h-20 bg-primary/10 rounded-2xl border border-primary/20 flex items-center justify-center text-xs font-mono">1rem</div>
                                    <p className="text-center font-bold text-xs uppercase">Bento</p>
                                </div>
                                <div className="space-y-3">
                                    <div className="w-20 h-20 bg-primary/10 rounded-full border border-primary/20 flex items-center justify-center text-xs font-mono">Full</div>
                                    <p className="text-center font-bold text-xs uppercase">Pill</p>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Glassmorphism</CardTitle>
                                <CardDescription>The core design language.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl">
                                    <p className="text-sm italic opacity-80">"Design is not just what it looks like and feels like. Design is how it works."</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="ui-kit" className="mt-8 min-h-[80vh]">
                    <div className="grid md:grid-cols-2 gap-6">
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Shadcn UI</CardTitle>
                                <CardDescription>Core components built with Radix UI and Tailwind CSS.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex flex-wrap gap-2">
                                    <Badge variant="outline">Button</Badge>
                                    <Badge variant="outline">Card</Badge>
                                    <Badge variant="outline">Badge</Badge>
                                    <Badge variant="outline">Tabs</Badge>
                                    <Badge variant="outline">Separator</Badge>
                                    <Badge variant="outline">Tooltip</Badge>
                                    <Badge variant="outline">Dialog</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    We use Shadcn UI for its accessibility, reliability, and ease of customization. It provides the foundational building blocks for our interface.
                                </p>
                                <Button variant="link" className="px-0 text-primary" asChild>
                                    <a href="https://ui.shadcn.com" target="_blank" rel="noopener noreferrer">shadcn/ui documentation →</a>
                                </Button>
                            </CardContent>
                        </Card>
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>Component Preview</CardTitle>
                                <CardDescription>Live look at our base components.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="flex items-center gap-4">
                                    <Button size="sm">Primary</Button>
                                    <Button size="sm" variant="secondary">Secondary</Button>
                                    <Button size="sm" variant="outline">Outline</Button>
                                </div>
                                <Separator />
                                <div className="flex items-center gap-4">
                                    <Badge>Default</Badge>
                                    <Badge variant="secondary">Secondary</Badge>
                                    <Badge variant="outline">Outline</Badge>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="effects" className="mt-8 min-h-[80vh]">
                    <div className="grid md:grid-cols-2 gap-6">
                        <Card className="border-border/40 bg-background/60 backdrop-blur-xl">
                            <CardHeader>
                                <CardTitle>React Bits Components</CardTitle>
                                <CardDescription>Click a component to view details and preview.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-3">
                                    {reactBitsComponents.map((component) => (
                                        <button
                                            key={component.name}
                                            onClick={() => setSelectedComponent(component.name)}
                                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer text-left ${selectedComponent === component.name
                                                ? 'bg-primary/10 border-primary/30 ring-2 ring-primary/20'
                                                : 'bg-primary/5 border-primary/10 hover:bg-primary/8 hover:border-primary/20'
                                                }`}
                                        >
                                            <div className="bg-primary/10 p-2 rounded-lg">
                                                <Zap className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-bold">{component.name}</p>
                                                <p className="text-xs text-muted-foreground">{component.description}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                <Separator />
                                <Button variant="link" className="px-0 text-primary" asChild>
                                    <a href="https://www.reactbits.dev" target="_blank" rel="noopener noreferrer">
                                        React Bits documentation →
                                    </a>
                                </Button>
                            </CardContent>
                        </Card>
                        <Card className={`border-border/40 overflow-hidden ${selectedComponent === 'Dark Veil' ? 'bg-transparent shadow-none border-none' : 'bg-background/60 backdrop-blur-xl'}`}>
                            <CardHeader>
                                <CardTitle>
                                    {selectedComponent || 'Component Preview'}
                                </CardTitle>
                                <CardDescription>
                                    {selectedComponent
                                        ? reactBitsComponents.find(c => c.name === selectedComponent)?.description
                                        : 'Select a component to see it in action'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {selectedComponent ? (
                                    <>
                                        {/* Smooth Scroll gets a taller box: you can't feel the
                                            difference between the two panes through a 128px slit. */}
                                        <div className={`relative rounded-xl overflow-hidden border border-border/40 bg-transparent ${selectedComponent === 'Smooth Scroll' ? 'h-64' : 'h-32'}`}>
                                            {selectedComponent === 'Dark Veil' && (
                                                <div className="relative w-full h-full" />
                                            )}
                                            {selectedComponent === 'Glass Cube' && (
                                                <div className="flex items-center justify-center h-full bg-muted/10">
                                                    <GlassCube className="w-24 h-24" pulse={false} wobbleAngle={0}>
                                                        <div className="flex items-center justify-center h-full text-xs font-bold text-muted-foreground">
                                                            3D Cube
                                                        </div>
                                                    </GlassCube>
                                                </div>
                                            )}
                                            {selectedComponent === 'Smooth Scroll' && (
                                                <SmoothScrollPreview />
                                            )}
                                            {selectedComponent === 'Scroll Float' && (
                                                <ScrollFloatPreview key={Date.now()} />
                                            )}
                                            {selectedComponent === 'Scroll Stack' && (
                                                <ScrollStackPreview />
                                            )}
                                            {selectedComponent === 'Custom Cursor' && (
                                                <div
                                                    ref={cursorPreviewRef}
                                                    className="relative flex items-center justify-center h-full bg-muted/30"
                                                >
                                                    <div className="absolute inset-0 overflow-hidden">
                                                        <div
                                                            className="cursor-demo-dot"
                                                            style={{
                                                                left: `${cursorPos.x}%`,
                                                                top: `${cursorPos.y}%`,
                                                            }}
                                                        />
                                                        <div
                                                            className="cursor-demo-ring"
                                                            style={{
                                                                left: `${cursorPos.x}%`,
                                                                top: `${cursorPos.y}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <p className="text-xs text-muted-foreground z-10 pointer-events-none">
                                                        Move your cursor to interact
                                                    </p>
                                                    <style jsx>{`
                                                        .cursor-demo-dot {
                                                            position: absolute;
                                                            width: 8px;
                                                            height: 8px;
                                                            background: hsl(var(--primary));
                                                            border-radius: 50%;
                                                            pointer-events: none;
                                                            transform: translate(-50%, -50%);
                                                            z-index: 20;
                                                        }
                                                        .cursor-demo-ring {
                                                            position: absolute;
                                                            width: 32px;
                                                            height: 32px;
                                                            border: 2px solid hsl(var(--primary));
                                                            border-radius: 50%;
                                                            pointer-events: none;
                                                            transform: translate(-50%, -50%);
                                                            opacity: 0.6;
                                                        }
                                                    `}</style>
                                                </div>
                                            )}
                                            {selectedComponent === 'Blur Text' && (
                                                <div className="flex items-center justify-center h-full">
                                                    <BlurText
                                                        text="Blur Text Effect"
                                                        className="text-xl font-bold"
                                                        key={Date.now()}
                                                    />
                                                </div>
                                            )}
                                            {selectedComponent === 'Fall In Text' && (
                                                <div className="flex items-center justify-center h-full">
                                                    <FallInText
                                                        text="Fall In Effect"
                                                        className="text-xl font-bold"
                                                        key={Date.now()}
                                                    />
                                                </div>
                                            )}
                                            {selectedComponent === 'Text Type' && (
                                                <div className="flex items-center justify-center h-full">
                                                    <TextType
                                                        text="Typewriter Effect..."
                                                        className="text-lg font-mono"
                                                        speed={80}
                                                        key={Date.now()}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                        <Separator />
                                        <div className="space-y-2">
                                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                                Component Path
                                            </p>
                                            <code className="text-xs bg-muted/50 px-3 py-2 rounded-lg block border border-border/40">
                                                {reactBitsComponents.find(c => c.name === selectedComponent)?.file}
                                            </code>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="w-full"
                                            asChild
                                        >
                                            <a
                                                href={`https://github.com/mncoleman/mncoleman/blob/main${reactBitsComponents.find(c => c.name === selectedComponent)?.file}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                View on GitHub →
                                            </a>
                                        </Button>
                                    </>
                                ) : (
                                    <div className="h-48 flex flex-col items-center justify-center text-center space-y-3 opacity-50">
                                        <Zap className="h-12 w-12 text-primary animate-pulse" />
                                        <div>
                                            <h4 className="text-lg font-bold mb-1">Interactive Preview</h4>
                                            <p className="text-sm text-muted-foreground">
                                                Click a component to see it animate
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="prompting" className="mt-8 min-h-[80vh]">
                    <PromptingSection copyToClipboard={copyToClipboard} copiedColor={copiedColor} />
                </TabsContent>

                <TabsContent value="globe" className="mt-8 min-h-[80vh]">
                    <GlobeShowcase copyToClipboard={copyToClipboard} copiedColor={copiedColor} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
