'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

/**
 * The KJV/WEB choice lives on <html data-bible-tr="web"> so a pure CSS rule (see
 * BibleHead) shows the right text everywhere, in cards and on chapter pages alike, with
 * both texts already in the HTML. localStorage only remembers it between visits.
 */
export type Tr = 'kjv' | 'web';
const KEY = 'bible-translation';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function read(): Tr {
    return document.documentElement.dataset.bibleTr === 'web' ? 'web' : 'kjv';
}

function subscribe(fn: () => void) {
    listeners.add(fn);
    const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
            applyStored();
        }
    };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(fn);
        window.removeEventListener('storage', onStorage);
    };
}

function applyStored() {
    try {
        const s = localStorage.getItem(KEY);
        if (s === 'web' || s === 'kjv') document.documentElement.dataset.bibleTr = s;
    } catch {
        /* storage blocked: keep the default */
    }
    emit();
}

export function setTranslation(t: Tr) {
    document.documentElement.dataset.bibleTr = t;
    try {
        localStorage.setItem(KEY, t);
    } catch {
        /* storage blocked: the choice still applies for this page view */
    }
    emit();
}

export function useTranslation(): Tr {
    useEffect(() => {
        applyStored();
    }, []);
    return useSyncExternalStore(subscribe, read, () => 'kjv');
}

export function TranslationToggle({ className }: { className?: string }) {
    const tr = useTranslation();
    return (
        <div className={cn('inline-flex overflow-hidden rounded-md border border-border text-[11px]', className)} role="group" aria-label="Translation">
            {(['kjv', 'web'] as const).map((t) => (
                <button
                    key={t}
                    type="button"
                    aria-pressed={tr === t}
                    onClick={() => setTranslation(t)}
                    className="px-2.5 py-1 font-medium uppercase text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground"
                >
                    {t}
                </button>
            ))}
        </div>
    );
}
