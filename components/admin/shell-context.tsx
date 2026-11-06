'use client';

import { createContext, useContext } from 'react';

/**
 * What a full-canvas admin page (the post editor) needs from the shell around it
 * when it draws its own top bar: a way to open the phone navigation drawer.
 */
export const ShellContext = createContext<{ openMenu: () => void } | null>(null);

export function useShell(): { openMenu: () => void } | null {
    return useContext(ShellContext);
}
