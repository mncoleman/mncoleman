'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import * as Popover from '@radix-ui/react-popover';
import type { Passage } from '@/lib/bible-server';
import { PassageText } from './Passage';
import { TranslationToggle, useTranslation } from './translation';

/**
 * A verse mention in a post. The text is baked in by the server (props), the badge is a
 * normal link (so it works with JS off), and the card is progressive enhancement:
 * mouse hover, keyboard focus, or the first tap on a touch screen opens it; Esc closes.
 */
export function VerseLink({
    href,
    reference,
    kjv,
    web,
    children,
}: {
    href: string;
    reference: string;
    kjv: Passage;
    web: Passage;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const id = useId();
    const pointer = useRef<string>('');
    const showT = useRef<ReturnType<typeof setTimeout>>(undefined);
    const hideT = useRef<ReturnType<typeof setTimeout>>(undefined);
    const anchor = useRef<HTMLAnchorElement>(null);
    useTranslation(); // restores the saved KJV/WEB choice on pages with no chapter-level script

    useEffect(() => () => { clearTimeout(showT.current); clearTimeout(hideT.current); }, []);

    const show = (delay: number) => {
        clearTimeout(hideT.current);
        clearTimeout(showT.current);
        showT.current = setTimeout(() => setOpen(true), delay);
    };
    const hide = (delay: number) => {
        clearTimeout(showT.current);
        clearTimeout(hideT.current);
        hideT.current = setTimeout(() => setOpen(false), delay);
    };
    const mouse = (e: React.PointerEvent) => e.pointerType === 'mouse';

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Anchor asChild>
                <Link
                    ref={anchor}
                    href={href}
                    prefetch={false}
                    aria-describedby={open ? id : undefined}
                    className="rounded bg-[#e7f3f8] px-1 py-0.5 font-normal text-[#0b6e99] no-underline decoration-transparent transition-colors hover:bg-[#d3eaf3] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0b6e99] dark:bg-[#1d3440] dark:text-[#7cc4e6] dark:hover:bg-[#244354] dark:focus-visible:outline-[#7cc4e6]"
                    onPointerDown={(e) => { pointer.current = e.pointerType; }}
                    onKeyDown={() => { pointer.current = 'key'; }}
                    onPointerEnter={(e) => mouse(e) && show(120)}
                    onPointerLeave={(e) => mouse(e) && hide(200)}
                    onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setOpen(true); }}
                    onClick={(e) => {
                        // First tap on a touch screen opens the card; the card's "Open passage" (or a second tap) navigates.
                        if (pointer.current === 'touch' && !open) {
                            e.preventDefault();
                            setOpen(true);
                        }
                        pointer.current = '';
                    }}
                >
                    {children}
                </Link>
            </Popover.Anchor>
            <Popover.Portal>
                <Popover.Content
                    id={id}
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    collisionPadding={8}
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                    onInteractOutside={(e) => {
                        // A tap on the badge itself must reach its click handler instead of closing the card first.
                        if (anchor.current?.contains(e.target as Node)) e.preventDefault();
                    }}
                    onPointerEnter={(e) => mouse(e) && show(0)}
                    onPointerLeave={(e) => mouse(e) && hide(200)}
                    className="z-[60] w-[min(24rem,calc(100vw-1rem))] rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg outline-none"
                >
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-semibold">{reference}</span>
                        <TranslationToggle />
                    </div>
                    <div className="max-h-56 overflow-y-auto text-[13.5px] leading-relaxed">
                        <PassageText kjv={kjv} web={web} />
                    </div>
                    <Link href={href} prefetch={false} className="mt-2 inline-block text-xs font-medium text-[#0b6e99] hover:underline dark:text-[#7cc4e6]">
                        Open passage →
                    </Link>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
