'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, Palette, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const ARTIFACT_DESIGN_PROMPT = `You are creating a self-contained, single-file HTML document — a personal knowledge artifact (cheatsheet, research library, guide, or resource collection). Use the design system below exactly.

## Color Palette — Warm Earthy with Teal

All colors as CSS custom properties. MUST include both light and dark mode.

Light Mode (:root, [data-theme="light"]):
- --bg: #f7f6f2 (page background)
- --surface: #faf9f7 (sidebar, cards)
- --surface-off: #eeecea (input backgrounds)
- --border: #d4d2ce (borders)
- --text: #1a1915 (primary text)
- --text-muted: #6b6966 (secondary text)
- --text-faint: #a8a7a4 (labels)
- --primary: #016b72 (TEAL — links, accents, active states)
- --primary-hov: #0c5058 (hover)
- --primary-dim: rgba(1,107,114,0.08) (tint)
- Semantic: green #2f7d34, orange #b35d00, red #c0302a, blue #0a5fa0

Dark Mode ([data-theme="dark"]):
- --bg: #161512, --surface: #1c1a17, --border: #363432
- --text: #cccac6, --text-muted: #7a7876
- --primary: #4a9da8, --primary-hov: #21808c
- Semantic: green #65af65, orange #e09840, red #d96b65, blue #5290c5

Code blocks always dark: --code-bg: #1a1915, --code-text: #d4d2ce
Syntax: .c #6b6966 (comments), .g #6dbc6d (strings), .o #e8a24a (keywords), .p #b48ef5 (functions)

## Typography

Google Fonts with preconnect. Choose pairing by content:
- Technical: Inter + JetBrains Mono
- Academic: Crimson Pro + Work Sans

Fluid scale with clamp():
--text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)
--text-sm: clamp(0.875rem, 0.8rem + 0.35vw, 1rem)
--text-base: clamp(1rem, 0.95rem + 0.25vw, 1.125rem)
--text-lg: clamp(1.125rem, 1rem + 0.75vw, 1.5rem)
--text-xl: clamp(1.5rem, 1.2rem + 1.25vw, 2.25rem)
--text-2xl: clamp(2rem, 1.2rem + 2.5vw, 3.5rem)

## Layout

Pattern A — Sidebar (cheatsheets, technical refs):
- Fixed 240px sidebar, search input, section nav with scroll-spy
- Cards with hover border highlight, code blocks, callout boxes

Pattern B — Header + Sidebar (research, collections):
- Sticky 60px header with logo/search/theme toggle
- Optional hero with stats, filter bar with pills
- 220px sidebar + 1fr content grid

## Components

Cards: var(--surface) bg, 1px var(--border), rounded 0.75rem, hover: primary border + shadow
Nav chips: pill badges, color-coded by category
Code blocks: dark bg, syntax spans, copy button with success state
Callouts: .warn (red), .tip (blue), .note (orange), .fc (green)
Search: icon input, primary focus ring, filters cards by text

## Interactive (vanilla JS, no deps)

1. Theme toggle: data-theme on <html>, sun/moon icon swap
2. Scroll-spy: IntersectionObserver, rootMargin '-20% 0px -70% 0px'
3. Mobile sidebar: hamburger toggle, overlay click-to-close
4. Search filter: input event, case-insensitive innerText match
5. Copy buttons: clipboard API, 2s success state

## Requirements

- Single self-contained HTML file (CSS in <style>, JS in <script>)
- Full light + dark mode via CSS custom properties
- Responsive at 768px breakpoint
- Accessible: smooth scroll, reduced-motion, focus-visible, semantic HTML`;

const COLOR_SWATCHES = [
    { name: 'Background', light: '#f7f6f2', dark: '#161512' },
    { name: 'Surface', light: '#faf9f7', dark: '#1c1a17' },
    { name: 'Primary (Teal)', light: '#016b72', dark: '#4a9da8' },
    { name: 'Text', light: '#1a1915', dark: '#cccac6' },
    { name: 'Green', light: '#2f7d34', dark: '#65af65' },
    { name: 'Orange', light: '#b35d00', dark: '#e09840' },
    { name: 'Red', light: '#c0302a', dark: '#d96b65' },
    { name: 'Blue', light: '#0a5fa0', dark: '#5290c5' },
];

const DESIGN_SECTIONS = [
    {
        title: 'Color Palette',
        description: 'Warm earthy base with teal accents. Full light/dark mode via CSS custom properties.',
    },
    {
        title: 'Typography',
        description: 'Google Fonts with fluid clamp() scale. Inter + JetBrains Mono for technical, Crimson Pro + Work Sans for academic.',
    },
    {
        title: 'Layout Patterns',
        description: 'Sidebar layout for technical references. Header + sidebar for research collections. Both fully responsive at 768px.',
    },
    {
        title: 'Components',
        description: 'Cards with hover borders, color-coded nav chips, syntax-highlighted code blocks, four callout types, search filtering.',
    },
    {
        title: 'Interactivity',
        description: 'Vanilla JS: theme toggle, scroll-spy navigation, mobile sidebar, search filter, clipboard copy buttons.',
    },
];

interface ArtifactDesignPopupProps {
    trigger: React.ReactNode;
}

export function ArtifactDesignPopup({ trigger }: ArtifactDesignPopupProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [expandedSection, setExpandedSection] = useState<number | null>(null);
    const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');

    const handleCopy = useCallback(async () => {
        await navigator.clipboard.writeText(ARTIFACT_DESIGN_PROMPT);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open]);

    return (
        <>
            <div onClick={() => setOpen(true)} className="cursor-pointer">
                {trigger}
            </div>

            {open && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setOpen(false)}
                    />

                    {/* Panel */}
                    <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl shadow-primary/5 animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-300">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-[#016b72]/10">
                                    <Palette className="h-5 w-5 text-[#016b72]" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Artifact Design System</h2>
                                    <p className="text-xs text-muted-foreground">Warm earthy palette with teal accents</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="p-2 rounded-lg hover:bg-accent transition-colors"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        {/* Scrollable Body */}
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
                            {/* Color Swatches */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Colors</h3>
                                    <button
                                        onClick={() => setPreviewTheme(t => t === 'light' ? 'dark' : 'light')}
                                        className="text-xs px-2.5 py-1 rounded-full border border-border/50 hover:border-primary/50 transition-colors"
                                    >
                                        {previewTheme === 'light' ? '☀ Light' : '☾ Dark'}
                                    </button>
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                    {COLOR_SWATCHES.map((swatch) => (
                                        <div key={swatch.name} className="text-center group">
                                            <div
                                                className="w-full aspect-square rounded-xl border border-border/30 mb-1.5 transition-transform group-hover:scale-105"
                                                style={{ backgroundColor: previewTheme === 'light' ? swatch.light : swatch.dark }}
                                            />
                                            <p className="text-[10px] font-medium text-muted-foreground leading-tight">{swatch.name}</p>
                                            <p className="text-[9px] font-mono text-muted-foreground/60">
                                                {previewTheme === 'light' ? swatch.light : swatch.dark}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Design Overview Sections */}
                            <div className="space-y-1">
                                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">Design System</h3>
                                {DESIGN_SECTIONS.map((section, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setExpandedSection(expandedSection === i ? null : i)}
                                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-accent/50 transition-colors group"
                                    >
                                        <div className="flex items-center gap-2">
                                            {expandedSection === i
                                                ? <ChevronDown className="h-3.5 w-3.5 text-primary shrink-0" />
                                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                                            }
                                            <span className="text-sm font-medium">{section.title}</span>
                                        </div>
                                        {expandedSection === i && (
                                            <p className="text-xs text-muted-foreground mt-1.5 ml-5.5 leading-relaxed pl-[22px]">
                                                {section.description}
                                            </p>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Mini Preview */}
                            <div className="rounded-xl overflow-hidden border border-border/30">
                                <div
                                    className="p-4 flex gap-3 transition-colors duration-300"
                                    style={{
                                        backgroundColor: previewTheme === 'light' ? '#f7f6f2' : '#161512',
                                        color: previewTheme === 'light' ? '#1a1915' : '#cccac6',
                                    }}
                                >
                                    {/* Mini sidebar */}
                                    <div
                                        className="w-16 shrink-0 rounded-lg p-2 space-y-1.5 hidden sm:block"
                                        style={{
                                            backgroundColor: previewTheme === 'light' ? '#faf9f7' : '#1c1a17',
                                            border: `1px solid ${previewTheme === 'light' ? '#d4d2ce' : '#363432'}`,
                                        }}
                                    >
                                        {[true, false, false].map((active, i) => (
                                            <div
                                                key={i}
                                                className="h-2 rounded-full"
                                                style={{
                                                    backgroundColor: active
                                                        ? (previewTheme === 'light' ? 'rgba(1,107,114,0.08)' : 'rgba(74,157,168,0.1)')
                                                        : 'transparent',
                                                    border: active ? 'none' : undefined,
                                                }}
                                            >
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${60 + i * 15}%`,
                                                        backgroundColor: active
                                                            ? (previewTheme === 'light' ? '#016b72' : '#4a9da8')
                                                            : (previewTheme === 'light' ? '#d4d2ce' : '#363432'),
                                                        height: '100%',
                                                        borderRadius: '9999px',
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    {/* Mini content */}
                                    <div className="flex-1 space-y-2">
                                        <div
                                            className="h-3 rounded-full w-2/3"
                                            style={{ backgroundColor: previewTheme === 'light' ? '#016b72' : '#4a9da8' }}
                                        />
                                        <div className="flex gap-1.5">
                                            {['#2f7d34', '#b35d00', '#c0302a'].map((c, i) => (
                                                <div
                                                    key={i}
                                                    className="h-1.5 w-8 rounded-full"
                                                    style={{
                                                        backgroundColor: previewTheme === 'light'
                                                            ? c
                                                            : ['#65af65', '#e09840', '#d96b65'][i],
                                                        opacity: 0.4,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <div
                                            className="rounded-lg p-2"
                                            style={{
                                                backgroundColor: previewTheme === 'light' ? '#faf9f7' : '#1c1a17',
                                                border: `1px solid ${previewTheme === 'light' ? '#d4d2ce' : '#363432'}`,
                                            }}
                                        >
                                            <div className="space-y-1">
                                                <div className="h-1.5 rounded-full w-4/5" style={{ backgroundColor: previewTheme === 'light' ? '#d4d2ce' : '#363432' }} />
                                                <div className="h-1.5 rounded-full w-3/5" style={{ backgroundColor: previewTheme === 'light' ? '#d4d2ce' : '#363432' }} />
                                            </div>
                                        </div>
                                        <div
                                            className="rounded-lg p-2"
                                            style={{ backgroundColor: previewTheme === 'light' ? '#1a1915' : '#0f0e0c' }}
                                        >
                                            <div className="space-y-1">
                                                <div className="h-1 rounded-full w-3/4" style={{ backgroundColor: '#6dbc6d', opacity: 0.6 }} />
                                                <div className="h-1 rounded-full w-1/2" style={{ backgroundColor: '#e8a24a', opacity: 0.6 }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Full Prompt (collapsed) */}
                            <details className="group">
                                <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1.5">
                                    <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                                    View full prompt
                                </summary>
                                <pre className="mt-3 p-4 rounded-xl bg-muted/50 border border-border/40 text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto font-mono">
                                    {ARTIFACT_DESIGN_PROMPT}
                                </pre>
                            </details>
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-6 py-4 border-t border-border/30 shrink-0">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">Self-contained HTML</Badge>
                                <Badge variant="outline" className="text-[10px]">Light + Dark</Badge>
                                <Badge variant="outline" className="text-[10px]">Responsive</Badge>
                            </div>
                            <Button
                                size="sm"
                                onClick={handleCopy}
                                className="gap-2"
                            >
                                {copied ? (
                                    <>
                                        <Check className="h-3.5 w-3.5" />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Copy className="h-3.5 w-3.5" />
                                        Copy Prompt
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
