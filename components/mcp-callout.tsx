'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ChevronDown, Copy, Plug } from 'lucide-react';

export const MCP_URL = 'https://mncoleman.com/mcp';

const CHARS = MCP_URL.split('');

/** Clipboard write that also works outside secure contexts / older Safari. */
function writeClipboard(value: string) {
    try {
        if (navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(value);
            return;
        }
    } catch {
        /* fall through to the textarea path */
    }
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    try {
        document.execCommand('copy');
    } finally {
        document.body.removeChild(el);
    }
}

const TABS = [
    {
        id: 'claude-code',
        label: 'Claude Code',
        steps: ['Run this in any terminal:'],
        code: `claude mcp add --transport http mncoleman ${MCP_URL}`,
        after: 'Then ask Claude anything about the site — it can search posts, read the resume, and pull prompts from the "A"I library.',
    },
    {
        id: 'claude',
        label: 'Claude',
        steps: [
            'Open Settings → Connectors in Claude (web or desktop).',
            'Click "Add custom connector".',
            'Paste this URL and save — no sign-in or API key needed:',
        ],
        code: MCP_URL,
        after: 'The connector shows up in the chat toolbar as "mncoleman.com".',
    },
    {
        id: 'chatgpt',
        label: 'ChatGPT',
        steps: [
            'Settings → Connectors → Advanced → enable Developer mode.',
            'Add a connector, choose "No authentication", and paste:',
        ],
        code: MCP_URL,
        after: 'Availability depends on your ChatGPT plan — custom MCP connectors are a paid-tier feature.',
    },
    {
        id: 'other',
        label: 'Other clients',
        steps: ['Any client that speaks MCP over streamable HTTP works. Config shape:'],
        code: `{
  "mcpServers": {
    "mncoleman": {
      "type": "http",
      "url": "${MCP_URL}"
    }
  }
}`,
        after: 'Stateless (MCP 2026-07-28) with the legacy handshake still supported, so older clients connect too. Read-only, public content only.',
    },
] as const;

function SnippetCopy({ value }: { value: string }) {
    const [done, setDone] = useState(false);
    return (
        <button
            type="button"
            onClick={() => {
                writeClipboard(value);
                setDone(true);
                setTimeout(() => setDone(false), 1600);
            }}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
            aria-label={done ? 'Copied' : 'Copy to clipboard'}
        >
            {done ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
    );
}

/**
 * `anchorId` differs per layout on purpose: the home page server-renders BOTH the
 * desktop grid and the mobile stack and toggles them with CSS, so a hard-coded id
 * would appear twice in the DOM.
 */
export function McpCallout({ anchorId = 'mcp' }: { anchorId?: string }) {
    const [copied, setCopied] = useState(false);
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<(typeof TABS)[number]['id']>('claude-code');
    /** Per-character vector to the copy button. Non-null only while the URL is in flight. */
    const [flight, setFlight] = useState<{ x: number; y: number }[] | null>(null);

    const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    useEffect(() => () => timers.current.forEach(clearTimeout), []);

    const handleCopy = useCallback(() => {
        // Synchronous, inside the user gesture: deferring this behind the
        // animation loses the clipboard grant in Safari and silently no-ops.
        writeClipboard(MCP_URL);
        setCopied(true);

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const button = buttonRef.current;
        if (!reduced && button) {
            const b = button.getBoundingClientRect();
            const tx = b.left + b.width / 2;
            const ty = b.top + b.height / 2;
            setFlight(
                charRefs.current.map(el => {
                    if (!el) return { x: 0, y: 0 };
                    const r = el.getBoundingClientRect();
                    return { x: tx - (r.left + r.width / 2), y: ty - (r.top + r.height / 2) };
                }),
            );
            // Releasing `flight` animates every character back out of the button.
            timers.current.push(setTimeout(() => setFlight(null), 620));
        }

        timers.current.push(setTimeout(() => setCopied(false), 2200));
    }, []);

    // Dismiss the instructions on outside click / Escape.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
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

    const active = TABS.find(t => t.id === tab) ?? TABS[0];

    return (
        <div id={anchorId} ref={rootRef} className="relative w-full mb-5 scroll-mt-24">
            <div
                className="flex items-center gap-3 rounded-xl border border-border/40 px-3 py-2.5
                    bg-background/40 backdrop-blur-xl"
                style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}
            >
                <span className="hidden sm:flex items-center gap-1.5 shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    <Plug className="h-3 w-3" />
                    MCP
                </span>

                <span className="hidden md:inline shrink-0 text-xs text-muted-foreground">
                    Browse this site from your AI:
                </span>

                {/* The URL, one <span> per character so it can be pulled into the button. */}
                <code className="flex-1 min-w-0 overflow-hidden whitespace-nowrap font-mono text-xs sm:text-sm text-foreground/90">
                    {CHARS.map((c, i) => (
                        <motion.span
                            key={i}
                            ref={el => {
                                charRefs.current[i] = el;
                            }}
                            className="inline-block"
                            animate={
                                flight
                                    ? { x: flight[i]?.x ?? 0, y: flight[i]?.y ?? 0, scale: 0.15, opacity: 0, rotate: (i % 2 ? 1 : -1) * 25 }
                                    : { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }
                            }
                            transition={
                                flight
                                    ? { duration: 0.42, delay: i * 0.011, ease: [0.4, 0, 0.15, 1] }
                                    : { duration: 0.3, delay: (CHARS.length - i) * 0.008, ease: [0.2, 0.8, 0.3, 1] }
                            }
                        >
                            {c === ' ' ? ' ' : c}
                        </motion.span>
                    ))}
                </code>

                <button
                    ref={buttonRef}
                    type="button"
                    onClick={handleCopy}
                    aria-label={copied ? 'Copied' : 'Copy MCP URL'}
                    className="relative shrink-0 flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5
                        text-xs font-medium bg-background/60 hover:bg-foreground/5 transition-colors"
                >
                    {/* Ring that swallows the incoming characters. */}
                    <AnimatePresence>
                        {copied && (
                            <motion.span
                                aria-hidden
                                className="absolute inset-0 rounded-lg ring-2 ring-primary/60"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: [0, 1, 0], scale: [0.8, 1.35, 1.6] }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.9, times: [0, 0.35, 1], delay: 0.28 }}
                            />
                        )}
                    </AnimatePresence>
                    <AnimatePresence mode="wait" initial={false}>
                        {copied ? (
                            <motion.span
                                key="done"
                                className="flex items-center gap-1.5 text-primary"
                                initial={{ opacity: 0, scale: 0.6 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.6 }}
                                transition={{ duration: 0.2, delay: 0.24 }}
                            >
                                <Check className="h-3.5 w-3.5" />
                                Copied
                            </motion.span>
                        ) : (
                            <motion.span
                                key="copy"
                                className="flex items-center gap-1.5"
                                initial={{ opacity: 0, scale: 0.6 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.6 }}
                                transition={{ duration: 0.15 }}
                            >
                                <Copy className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Copy</span>
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>

                <button
                    type="button"
                    onClick={() => setOpen(o => !o)}
                    aria-expanded={open}
                    aria-label="How to add this MCP server"
                    className="shrink-0 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground
                        hover:text-foreground hover:bg-foreground/5 transition-colors"
                >
                    <span className="hidden lg:inline">How to add</span>
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {/* Overlays the grid instead of reflowing it — the bento layout is
                vertically centred in a 100dvh box and would otherwise shift. */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="absolute left-0 right-0 top-full mt-2 z-40 rounded-xl border border-border/40
                            bg-background/85 backdrop-blur-2xl p-4"
                        style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.28)' }}
                    >
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {TABS.map(t => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setTab(t.id)}
                                    className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                        t.id === tab
                                            ? 'bg-primary/15 text-primary border border-primary/30'
                                            : 'text-muted-foreground border border-transparent hover:text-foreground hover:bg-foreground/5'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        <motion.div key={active.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
                            <ol className="space-y-1 text-xs text-muted-foreground mb-2.5 list-decimal list-inside marker:text-muted-foreground/60">
                                {active.steps.map(s => (
                                    <li key={s}>{s}</li>
                                ))}
                            </ol>

                            <div className="flex items-start gap-2 rounded-lg border border-border/40 bg-foreground/[0.04] p-2.5">
                                {/* Lenis owns the page scroller; nested scrollers must opt out
                                    or the wheel event never reaches them. */}
                                <pre
                                    data-lenis-prevent
                                    className="flex-1 min-w-0 overflow-x-auto font-mono text-[11px] leading-relaxed text-foreground/90"
                                >
                                    {active.code}
                                </pre>
                                <SnippetCopy value={active.code} />
                            </div>

                            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/80">{active.after}</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
