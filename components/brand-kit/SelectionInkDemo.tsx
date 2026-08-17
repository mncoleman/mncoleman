'use client';

import { useEffect, useState } from 'react';

/**
 * Shows the selection highlight, and what it is currently set to.
 *
 * There is nothing to demo in isolation — `components/selection-ink.tsx` is mounted
 * site-wide in the root layout, so selecting the sample text here exercises the
 * real thing. What this adds is a readout: the live value of `--selection-ink`, so
 * the colour that just appeared has a name and a triplet next to it.
 */

const LIGHT_NAMES = ['Graphite', 'Brick', 'Ochre', 'Olive gold', 'Sage', 'Slate blue', 'Violet'];

const SAMPLE =
    'Select this sentence, click somewhere else, and select it again — the highlight comes up in the next colour of the pencil palette each time. Click the highlight itself and it re-rolls without letting go.';

export function SelectionInkDemo() {
    const [ink, setInk] = useState<string>('');

    // Poll rather than observe: the value is written as an inline custom property
    // on <html>, and a MutationObserver on `style` fires for every unrelated inline
    // change on that element. Twice a second is imperceptible and costs nothing.
    useEffect(() => {
        const read = () =>
            setInk(getComputedStyle(document.documentElement).getPropertyValue('--selection-ink').trim());
        read();
        const id = setInterval(read, 500);
        return () => clearInterval(id);
    }, []);

    const index = LIGHT_NAMES.length ? indexOfInk(ink) : -1;

    return (
        <div className="space-y-3">
            <p className="rounded-xl border border-border/40 bg-background/40 p-4 text-sm leading-relaxed text-muted-foreground">
                {SAMPLE}
            </p>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span
                    className="h-4 w-8 rounded border border-border/50"
                    style={{ backgroundColor: ink ? `rgba(${ink}, 0.35)` : 'transparent' }}
                    aria-hidden
                />
                <span className="font-mono">
                    --selection-ink: {ink || '—'}
                </span>
                {index >= 0 && <span className="text-muted-foreground/70">{LIGHT_NAMES[index]}</span>}
            </div>
        </div>
    );
}

/**
 * Both palettes run in the same order, so the position of a triplet is enough to
 * name it without the demo having to know which theme is active.
 */
function indexOfInk(ink: string): number {
    const ORDER = [
        ['46, 46, 44', '226, 232, 240'],
        ['150, 74, 68', '229, 152, 144'],
        ['166, 110, 56', '226, 176, 112'],
        ['132, 128, 58', '206, 200, 122'],
        ['78, 120, 88', '150, 200, 165'],
        ['66, 104, 132', '140, 180, 220'],
        ['112, 88, 132', '186, 160, 214'],
    ];
    return ORDER.findIndex((pair) => pair.includes(ink));
}
