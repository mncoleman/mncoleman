'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'fancy-cursor';

interface CursorPreference {
    fancy: boolean;
    setFancy: (on: boolean) => void;
}

const CursorPreferenceContext = createContext<CursorPreference>({
    fancy: true,
    setFancy: () => {},
});

export const useCursorPreference = () => useContext(CursorPreferenceContext);

/**
 * Blocking script: stamps `data-fancy-cursor` on <html> before first paint, so a
 * visitor who turned the fancy cursor off never sees it flash back on during hydration.
 * globals.css keys the `cursor: none` override off that attribute, so the two can never
 * disagree — the native cursor is hidden exactly when CustomCursor is mounted.
 */
export const cursorPreferenceScript = `(function(){try{var v=localStorage.getItem('${STORAGE_KEY}');document.documentElement.setAttribute('data-fancy-cursor',v==='off'?'off':'on');}catch(e){document.documentElement.setAttribute('data-fancy-cursor','on');}})();`;

export function CursorPreferenceProvider({ children }: { children: React.ReactNode }) {
    // Matches the blocking script's default. Corrected in the effect below if storage says otherwise.
    const [fancy, setFancyState] = useState(true);

    useEffect(() => {
        try {
            setFancyState(localStorage.getItem(STORAGE_KEY) !== 'off');
        } catch {
            /* storage unavailable (private mode) — keep the default */
        }
    }, []);

    const setFancy = useCallback((on: boolean) => {
        setFancyState(on);
        document.documentElement.setAttribute('data-fancy-cursor', on ? 'on' : 'off');
        try {
            localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
        } catch {
            /* non-fatal: the toggle still works for this session */
        }
    }, []);

    return (
        <CursorPreferenceContext.Provider value={{ fancy, setFancy }}>
            {children}
        </CursorPreferenceContext.Provider>
    );
}
