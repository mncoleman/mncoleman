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
    /**
     * idle → absorb (characters fly into the copy button) → type (they come back
     * one keystroke at a time, left to right) → idle.
     */
    const [phase, setPhase] = useState<'idle' | 'absorb' | 'type'>('idle');
    const [typed, setTyped] = useState(CHARS.length);
    /** Per-character vector to the copy button. Only meaningful during `absorb`. */
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
            // Aim at the copy icon, not the middle of the button: with the "Copy"
            // label the box centre sits in empty space and the characters look like
            // they land beside the icon rather than in it.
            const tx = b.left + Math.min(20, b.width / 2);
            const ty = b.top + b.height / 2;
            setFlight(
                charRefs.current.map(el => {
                    if (!el) return { x: 0, y: 0 };
                    const r = el.getBoundingClientRect();
                    return { x: tx - (r.left + r.width / 2), y: ty - (r.top + r.height / 2) };
                }),
            );
            setTyped(0);
            setPhase('absorb');
            // Once the URL is inside the button, type it back out.
            timers.current.push(setTimeout(() => setPhase('type'), 620));
        }

        // Long enough to be read while the typewriter is still redrawing the URL
        // beside it (absorb + typing runs ~1.4s on its own).
        timers.current.push(setTimeout(() => setCopied(false), 3200));
    }, []);

    // Typewriter: one character per tick until the URL is whole again.
    useEffect(() => {
        if (phase !== 'type') return;
        const id = setInterval(() => {
            setTyped(n => {
                if (n >= CHARS.length) return n;
                return n + 1;
            });
        }, 26);
        return () => clearInterval(id);
    }, [phase]);

    // Hold at the end of the line for a beat so the caret is seen finishing the URL,
    // rather than vanishing on the same frame as the final character.
    useEffect(() => {
        if (phase !== 'type' || typed < CHARS.length) return;
        const id = setTimeout(() => setPhase('idle'), 260);
        return () => clearTimeout(id);
    }, [phase, typed]);

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

    const next = charRefs.current[typed];
    const last = charRefs.current[CHARS.length - 1];
    const caretLeft = next
        ? next.offsetLeft
        : last
            ? last.offsetLeft + last.offsetWidth
            : 0;

    // The root hugs its content rather than matching the bento grid's width — the row
    // is a URL and two buttons, and stretching it to 5xl left a lake of dead space
    // between the URL and the copy button.
    return (
        <div id={anchorId} ref={rootRef} className="relative mx-auto w-fit max-w-full scroll-mt-24">
            <div
                className="flex items-center gap-2 rounded-xl border border-border/40 px-3 py-2.5
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

                {/* The URL, one <span> per character so it can be pulled into the button
                    and typed back out. `relative` anchors both the overlay and the caret. */}
                <code className="relative min-w-0 overflow-hidden whitespace-nowrap font-mono text-xs sm:text-sm text-foreground/90 mr-1">
                    {/* Width ruler. The card is `w-fit`, so anything in normal flow here
                        decides how wide the card is — including, mid-animation, characters
                        that have been scaled and translated away. This copy of the URL is
                        never animated, so the card's width is fixed by it and cannot twitch
                        when the animation runs. It is also the copy that screen readers
                        announce and that the mouse selects; the animated one below is
                        decorative, hidden from AT and unselectable.
                        `text-transparent`, NOT `invisible` — visibility:hidden would drop the
                        URL out of the accessibility tree entirely, leaving the whole element
                        unreadable, since the only other copy is aria-hidden. */}
                    <span className="text-transparent">{MCP_URL}</span>

                    {/* Centred explicitly rather than relying on the abspos box happening to
                        be exactly one line tall, which is the only reason bare inline content
                        lined up with the ruler. Measured: glyph centres 0.25px apart. */}
                    {/* `select-none` so dragging over the URL selects the ruler's clean single
                        line, not these per-character flex items (which come out one per line). */}
                    <span className="absolute inset-0 flex items-center select-none" aria-hidden>
                    {CHARS.map((c, i) => (
                        <motion.span
                            key={i}
                            ref={el => {
                                charRefs.current[i] = el;
                            }}
                            className="inline-block"
                            animate={
                                phase === 'absorb' && flight
                                    ? {
                                        // Keyframes, not a single tween: a plain tween fades the
                                        // character out linearly, so it is invisible long before it
                                        // reaches the button and never reads as being swallowed.
                                        // Here it stays fully opaque until the last moment, pulls
                                        // back slightly, then rushes in and collapses at the icon.
                                        x: [0, -(flight[i]?.x ?? 0) * 0.05, (flight[i]?.x ?? 0) * 0.78, flight[i]?.x ?? 0],
                                        y: [0, -(flight[i]?.y ?? 0) * 0.05 - 2, (flight[i]?.y ?? 0) * 0.82, flight[i]?.y ?? 0],
                                        scale: [1, 1.06, 0.5, 0.04],
                                        rotate: [0, 0, (i % 2 ? 1 : -1) * 12, (i % 2 ? 1 : -1) * 28],
                                        opacity: [1, 1, 1, 0],
                                    }
                                    : phase === 'type'
                                        // Characters land already in place; the reveal IS the animation.
                                        ? { x: 0, y: 0, scale: 1, rotate: 0, opacity: i < typed ? 1 : 0 }
                                        : { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }
                            }
                            transition={
                                phase === 'absorb'
                                    ? {
                                        duration: 0.5,
                                        delay: i * 0.012,
                                        times: [0, 0.22, 0.76, 1],
                                        ease: ['easeOut', 'easeIn', 'easeIn'],
                                    }
                                    : { duration: 0 }
                            }
                        >
                            {c === ' ' ? ' ' : c}
                        </motion.span>
                    ))}

                    {/* Typing caret, parked at the left edge of the next character. */}
                    <AnimatePresence>
                        {phase === 'type' && (
                            <motion.span
                                aria-hidden
                                className="absolute top-1/2 w-[1.5px] bg-primary"
                                style={{
                                    height: '1.1em',
                                    translateY: '-50%',
                                    // Sits at the left edge of the next character, and past the
                                    // right edge of the last one once the URL is complete — so the
                                    // caret visibly finishes the line instead of stopping short.
                                    left: caretLeft,
                                }}
                                initial={{ opacity: 1 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.18 }}
                            />
                        )}
                    </AnimatePresence>
                    </span>
                </code>

                <motion.button
                    ref={buttonRef}
                    type="button"
                    onClick={handleCopy}
                    aria-label={copied ? 'Copied' : 'Copy MCP URL'}
                    className="relative shrink-0 flex items-center gap-1.5 rounded-lg border border-border/50 px-2.5 py-1.5
                        text-xs font-medium bg-background/60 hover:bg-foreground/5 transition-colors"
                    // The button gulps as the characters arrive.
                    animate={phase === 'absorb' ? { scale: [1, 1.09, 0.97, 1] } : { scale: 1 }}
                    transition={phase === 'absorb' ? { duration: 0.55, delay: 0.3, times: [0, 0.4, 0.7, 1] } : { duration: 0.2 }}
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
                                transition={{ duration: 0.9, times: [0, 0.35, 1], delay: 0.5 }}
                            />
                        )}
                    </AnimatePresence>
                    {/* Both labels stay mounted, stacked in one grid cell, and cross-fade.
                        Swapping them with AnimatePresence instead made the button resize
                        twice per press — "Copied" is wider than "Copy", and `mode="wait"`
                        leaves the button momentarily empty between the two — and in a
                        `w-fit` card every one of those changes moves the whole card. */}
                    <span className="grid place-items-center">
                        {/* `initial={false}` on both: without it the hidden "Copied" label
                            mounts at its default scale/opacity and animates down to hidden, so
                            it flashed on screen during every page load. */}
                        <motion.span
                            className="col-start-1 row-start-1 flex items-center gap-1.5"
                            initial={false}
                            // No delay on the way out. Holding "Copy" for half a second while
                            // the characters fly meant the button looked untouched at exactly
                            // the moment it needed to confirm, and "Copied" then had barely a
                            // second on screen before reverting — it read as never appearing.
                            animate={{ opacity: copied ? 0 : 1, scale: copied ? 0.6 : 1 }}
                            transition={{ duration: copied ? 0.12 : 0.2, delay: copied ? 0 : 0.15 }}
                        >
                            <Copy className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Copy</span>
                        </motion.span>
                        <motion.span
                            className="col-start-1 row-start-1 flex items-center gap-1.5 text-primary"
                            initial={false}
                            animate={{ opacity: copied ? 1 : 0, scale: copied ? 1 : 0.6 }}
                            transition={{ duration: 0.18, delay: copied ? 0.1 : 0 }}
                        >
                            <Check className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Copied</span>
                        </motion.span>
                    </span>
                </motion.button>

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
            {/* Positioning lives on this wrapper, not the motion element: motion writes
                `transform` inline, which would clobber a Tailwind -translate-x-1/2. */}
            <div className="absolute left-1/2 top-full z-40 mt-2 w-[min(92vw,34rem)] -translate-x-1/2">
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="w-full rounded-xl border border-border/40
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
        </div>
    );
}
