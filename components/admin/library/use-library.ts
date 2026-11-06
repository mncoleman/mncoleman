'use client';

import { useCallback, useEffect, useState } from 'react';
import type { LibraryItem } from './library-logic';

export const LIBRARY_API = process.env.NEXT_PUBLIC_ARTIFACTS_API_URL || 'https://artifacts.mncoleman.com';

/** The published prompts and skills, newest first. The list endpoint is public and lives on the artifact service itself. */
export function useLibrary() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${LIBRARY_API}/api/library/list`, { cache: 'no-store' });
            if (!res.ok) throw new Error(`Could not load the library (${res.status})`);
            const data = await res.json();
            setItems(((data.items || []) as LibraryItem[]).slice().sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt)));
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Could not load the library');
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);
    return { items, setItems, loading, error, reload: load };
}
