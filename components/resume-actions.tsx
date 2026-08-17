'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, Link2, Loader2, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ParsedResume } from '@/lib/resume-parse';

/**
 * Print / Save / Share for the resume.
 *
 * Print and Save are deliberately different actions rather than two doors onto
 * the same dialog: Print hands the page to the browser (which is where "choose a
 * printer, or Save as PDF" belongs), while Save writes a file straight to disk
 * with no dialog at all. They produce the same document — the `@media print`
 * block in `globals.css` and `lib/resume-pdf.ts` are written to match — but a
 * visitor who wants the file should not have to go through a print dialog to get
 * one.
 *
 * The PDF builder pulls in `jspdf` on click, so nothing here costs the route any
 * JavaScript until someone actually asks for a file.
 */

const BUTTON =
    'inline-flex items-center gap-2 rounded-xl border border-border/40 bg-background/40 ' +
    'backdrop-blur-xl px-4 py-2 text-sm font-medium text-muted-foreground ' +
    'transition-all duration-300 hover:border-border hover:text-foreground hover:-translate-y-0.5 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
    'disabled:opacity-60 disabled:hover:translate-y-0';

export function ResumeActions({ resume }: { resume: ParsedResume }) {
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
    }, []);

    const save = useCallback(async () => {
        setSaving(true);
        setError(null);
        try {
            const { downloadResumePdf } = await import('@/lib/resume-pdf');
            await downloadResumePdf(resume);
        } catch {
            // A failed chunk fetch (offline, cache miss) is the realistic failure
            // here, and silently doing nothing would read as a dead button.
            setError('Could not build the PDF — try Print instead.');
        } finally {
            setSaving(false);
        }
    }, [resume]);

    const share = useCallback(async () => {
        setError(null);
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard access needs a secure context and can be refused outright.
            setError('Clipboard blocked — copy the address bar instead.');
        }
    }, []);

    return (
        <div data-print-hide className="flex flex-col items-start gap-2">
            <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => window.print()} className={cn(BUTTON)}>
                    <Printer className="h-4 w-4" />
                    Print
                </button>

                <button type="button" onClick={save} disabled={saving} className={cn(BUTTON)}>
                    {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <Download className="h-4 w-4" />
                    )}
                    {saving ? 'Building…' : 'Save PDF'}
                </button>

                <button
                    type="button"
                    onClick={share}
                    className={cn(BUTTON, copied && 'border-border text-foreground')}
                >
                    {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                    {copied ? 'Link copied' : 'Share'}
                </button>
            </div>

            {/* Live region so the copy confirmation and any failure reach a screen
                reader — all three buttons are otherwise silent on success. */}
            <p aria-live="polite" className="min-h-[1.25rem] text-xs text-muted-foreground">
                {error ?? (copied ? 'Link copied to your clipboard.' : '')}
            </p>
        </div>
    );
}
