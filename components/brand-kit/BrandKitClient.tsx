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
    ExternalLink
} from 'lucide-react';
import { gsap } from 'gsap';
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
                                    <pre className="p-4 rounded-xl bg-muted/50 border border-border/40 text-xs leading-relaxed whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto font-mono">
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

export default function BrandKitClient() {
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
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                            <Layers className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl">The Logo</CardTitle>
                            <CardDescription>Official "MC" monogram and typography.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-2 gap-8">
                        <div className="relative aspect-video rounded-2xl bg-black flex items-center justify-center border border-white/10 group/logo">
                            <div className="w-24 h-24 rounded-2xl bg-[#18181b] flex items-center justify-center text-4xl font-bold text-white border border-white/20 shadow-2xl transition-transform group-hover/logo:scale-110">
                                MC
                            </div>
                            <div className="absolute inset-x-0 bottom-4 text-center">
                                <span className="text-xs text-white/40 font-mono tracking-widest uppercase">Dark Version</span>
                            </div>
                        </div>
                        <div className="relative aspect-video rounded-2xl bg-white flex items-center justify-center border border-black/5 group/logo">
                            <div className="w-24 h-24 rounded-2xl bg-white flex items-center justify-center text-4xl font-bold text-black border border-black/10 shadow-xl transition-transform group-hover/logo:scale-110">
                                MC
                            </div>
                            <div className="absolute inset-x-0 bottom-4 text-center">
                                <span className="text-xs text-black/40 font-mono tracking-widest uppercase">Light Version</span>
                            </div>
                        </div>
                    </div>
                    <div className="mt-8 flex flex-wrap gap-4">
                        <Button className="rounded-full px-6 transition-all hover:scale-105" variant="secondary" asChild>
                            <a href="/icon.svg" download="mncoleman-logo.svg">
                                <Download className="mr-2 h-4 w-4" />
                                Download SVG
                            </a>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Tabs defaultValue="colors" className="w-full">
                <TabsList className="grid w-full h-auto grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 bg-muted/50 p-1 rounded-2xl xl:rounded-full border border-border/40">
                    <TabsTrigger value="colors" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Palette className="h-4 w-4 mr-2" />
                        Colors
                    </TabsTrigger>
                    <TabsTrigger value="typography" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Type className="h-4 w-4 mr-2" />
                        Type
                    </TabsTrigger>
                    <TabsTrigger value="spacing" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Layout className="h-4 w-4 mr-2" />
                        System
                    </TabsTrigger>
                    <TabsTrigger value="ui-components" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Layers className="h-4 w-4 mr-2" />
                        UI Kit
                    </TabsTrigger>
                    <TabsTrigger value="react-bits" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <Zap className="h-4 w-4 mr-2" />
                        Effects
                    </TabsTrigger>
                    <TabsTrigger value="prompting" className="rounded-xl xl:rounded-full py-2 xl:py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <MessageSquareCode className="h-4 w-4 mr-2" />
                        Prompting
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="colors" className="mt-8">
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

                <TabsContent value="typography" className="mt-8">
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

                <TabsContent value="spacing" className="mt-8">
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

                <TabsContent value="ui-components" className="mt-8">
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

                <TabsContent value="react-bits" className="mt-8">
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
                                        <div className="relative h-32 rounded-xl overflow-hidden border border-border/40 bg-transparent">
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

                <TabsContent value="prompting" className="mt-8">
                    <PromptingSection copyToClipboard={copyToClipboard} copiedColor={copiedColor} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
