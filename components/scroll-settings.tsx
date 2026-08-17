'use client';

import { useEffect, useRef, useState } from 'react';
import { useScrollPrefs, SCROLL_DEFAULTS } from '@/components/smooth-scroll';
import { cn } from '@/lib/utils';

/**
 * Motion trails: three hairlines tapering as they fall, with the dot that drew
 * them resting at the bottom. Reads as "easing", and keeps the hairline-plus-dot
 * language of the fancy-cursor icon next door. A slash means smoothing is off.
 */
function ScrollIcon({ off }: { off: boolean }) {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            aria-hidden="true"
        >
            <path d="M5 6h14" strokeWidth="1.25" opacity="0.35" />
            <path d="M7 11h10" strokeWidth="1.25" opacity="0.6" />
            <path d="M9.5 15.5h5" strokeWidth="1.25" opacity="0.85" />
            <circle cx="12" cy="19.5" r="1.75" fill="currentColor" stroke="none" />
            {off && <line x1="4.5" y1="19.5" x2="19.5" y2="4.5" strokeWidth="1.5" />}
        </svg>
    );
}

/**
 * Hairline track, ring-and-dot thumb — the slider equivalent of the custom
 * cursor. The visible track is drawn by the wrapper so it can stay 1px while
 * the input keeps a full 24px hit area (see `.hairline-slider` in globals.css).
 */
function HairlineSlider({
    label,
    hint,
    value,
    min,
    max,
    step,
    display,
    onChange,
}: {
    label: string;
    hint: string;
    value: number;
    min: number;
    max: number;
    step: number;
    display: string;
    onChange: (v: number) => void;
}) {
    const pct = ((value - min) / (max - min)) * 100;

    return (
        <label className="block group/slider" title={hint}>
            <span className="flex items-baseline justify-between text-[11px] leading-none">
                <span className="text-muted-foreground group-hover/slider:text-foreground transition-colors">
                    {label}
                </span>
                <span className="tabular-nums text-muted-foreground/60">{display}</span>
            </span>
            <span className="relative mt-2 block h-6">
                {/* Track */}
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
                {/* Filled portion */}
                <span
                    className="absolute left-0 top-1/2 h-px -translate-y-1/2 bg-foreground/70 transition-[width] duration-75"
                    style={{ width: `${pct}%` }}
                />
                <input
                    type="range"
                    className="hairline-slider absolute inset-0 w-full"
                    aria-label={`${label} — ${hint}`}
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                />
            </span>
        </label>
    );
}

/**
 * Live controls for the site-wide Lenis instance, parked beside the fancy-cursor
 * toggle in the bottom-right corner.
 *
 * Desktop-only, and absent entirely when Lenis isn't running: the settings are
 * wheel settings, touch scrolling stays native, and under `prefers-reduced-motion`
 * there is no smooth scroll to tune.
 */
export function ScrollSettings() {
    const prefs = useScrollPrefs();
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    // Click-away + Escape. Cheap enough to always be listening while open.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            // preventDefault marks the press as handled — see the note in search.tsx.
            if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    if (!prefs.active) return null;

    const dirty =
        prefs.smoothness !== SCROLL_DEFAULTS.smoothness ||
        prefs.strength !== SCROLL_DEFAULTS.strength ||
        prefs.smoothWheel !== SCROLL_DEFAULTS.smoothWheel;

    return (
        <div
            ref={rootRef}
            // Sits left of the fancy-cursor toggle (bottom-5 right-5, 40px wide),
            // with a 12px gap: at 0 the two active/focus outlines touched and read
            // as one control. Below the custom cursor's z-[9999] so it draws over both.
            data-print-hide
            className="fixed bottom-5 right-[4.5rem] z-40 hidden md:block pwa-safe-bottom"
        >
            {open && (
                <div
                    // Its own scrolling isn't a concern, but Lenis reading wheel events
                    // over the panel while you drag a slider is — keep it out.
                    data-lenis-prevent
                    className={cn(
                        'absolute bottom-12 right-0 w-56 rounded-xl border border-border/40',
                        'bg-background/70 backdrop-blur-xl p-4 shadow-lg',
                        'animate-in fade-in slide-in-from-bottom-1 duration-200'
                    )}
                >
                    <div className="flex items-baseline justify-between">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                            Scroll
                        </span>
                        {dirty && (
                            <button
                                type="button"
                                onClick={prefs.reset}
                                className="text-[10px] text-muted-foreground/70 hover:text-foreground underline-offset-2 hover:underline transition-colors"
                            >
                                reset
                            </button>
                        )}
                    </div>

                    <div className="mt-4 space-y-4">
                        <HairlineSlider
                            label="Glide"
                            hint="How long the page keeps coasting after you stop scrolling."
                            value={prefs.smoothness}
                            min={0}
                            max={100}
                            step={1}
                            display={`${prefs.smoothness}`}
                            onChange={(smoothness) => prefs.set({ smoothness })}
                        />
                        <HairlineSlider
                            label="Reach"
                            hint="How far the page travels per notch of the scroll wheel."
                            value={prefs.strength}
                            min={0.4}
                            max={2}
                            step={0.05}
                            display={`${prefs.strength.toFixed(2)}×`}
                            onChange={(strength) => prefs.set({ strength })}
                        />
                    </div>

                    <button
                        type="button"
                        role="switch"
                        aria-checked={prefs.smoothWheel}
                        onClick={() => prefs.set({ smoothWheel: !prefs.smoothWheel })}
                        className="mt-4 flex w-full items-center justify-between text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <span>Smooth wheel</span>
                        <span
                            className={cn(
                                'relative h-3.5 w-7 rounded-full border transition-colors',
                                prefs.smoothWheel
                                    ? 'border-foreground/40 bg-foreground/20'
                                    : 'border-border bg-transparent'
                            )}
                        >
                            <span
                                className={cn(
                                    'absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-foreground transition-[left] duration-200',
                                    prefs.smoothWheel ? 'left-[15px]' : 'left-[3px]'
                                )}
                            />
                        </span>
                    </button>
                </div>
            )}

            <button
                type="button"
                aria-expanded={open}
                aria-label="Scroll settings"
                title="Scroll settings"
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'inline-flex h-10 w-10 items-center justify-center',
                    'rounded-lg border backdrop-blur-xl transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    open
                        ? 'border-foreground/30 bg-foreground/10 text-foreground'
                        : 'border-border/40 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground'
                )}
            >
                <ScrollIcon off={!prefs.smoothWheel} />
            </button>
        </div>
    );
}
