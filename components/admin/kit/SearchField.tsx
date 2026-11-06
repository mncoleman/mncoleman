'use client';

import { forwardRef } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The big list search box. `/` focuses it (wired by `useListKeyboard`, which needs the ref);
 * the `/` hint is hidden on touch screens. Esc clears the text first, then leaves the box.
 */
export const SearchField = forwardRef<HTMLInputElement, {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    className?: string;
}>(function SearchField({ value, onChange, placeholder, className }, ref) {
    return (
        <div className={cn('relative min-w-[140px] max-w-[440px] flex-[1_1_180px] max-[699px]:max-w-none max-[699px]:basis-full', className)}>
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
            <input
                ref={ref}
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        e.stopPropagation();
                        if (value) onChange('');
                        else e.currentTarget.blur();
                    }
                }}
                placeholder={placeholder}
                aria-label={placeholder.replace(/…$/, '')}
                autoComplete="off"
                spellCheck={false}
                className="h-10 w-full appearance-none rounded-lg border border-border/60 bg-transparent pl-[38px] pr-10 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:shadow-[0_0_0_3px_hsl(var(--ring)/0.14)] [&::-webkit-search-cancel-button]:hidden"
            />
            <kbd aria-hidden="true" className="pointer-events-none absolute right-2.5 top-2.5 rounded border border-border/60 bg-background px-1.5 font-mono text-[11px] leading-[18px] text-muted-foreground [@media(hover:none)]:hidden">/</kbd>
        </div>
    );
});
