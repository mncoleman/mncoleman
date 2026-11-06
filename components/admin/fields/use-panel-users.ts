'use client';

import { useEffect, useState } from 'react';
import { authHeaders } from '@/lib/admin-auth';
import type { PanelUser } from '@/lib/post-editor-logic';

/** One fetch per page load: the list barely changes and every editor open would otherwise repeat it. */
const cache = new Map<string, Promise<PanelUser[]>>();

function load(workerUrl: string): Promise<PanelUser[]> {
    let p = cache.get(workerUrl);
    if (!p) {
        p = fetch(`${workerUrl}/api/users/names`, { headers: authHeaders(), credentials: 'include' })
            .then(async (res) => {
                if (!res.ok) throw new Error(String(res.status));
                const json = await res.json();
                const list = Array.isArray(json?.users) ? json.users : [];
                return list.filter((u: unknown): u is PanelUser => !!u && typeof (u as PanelUser).name === 'string')
                    .map((u: PanelUser) => ({ name: u.name, role: typeof u.role === 'string' ? u.role : '' }));
            })
            .catch((e) => {
                cache.delete(workerUrl); // a failure is not cached: the next open tries again
                throw e;
            });
        cache.set(workerUrl, p);
    }
    return p;
}

/** The people who can write posts. `[]` while loading or if the request fails (the current author stays selectable regardless). */
export function usePanelUsers(workerUrl: string): { users: PanelUser[]; loading: boolean } {
    const [state, setState] = useState<{ users: PanelUser[]; loading: boolean }>({ users: [], loading: true });
    useEffect(() => {
        let alive = true;
        load(workerUrl).then(
            (users) => alive && setState({ users, loading: false }),
            () => alive && setState({ users: [], loading: false }),
        );
        return () => { alive = false; };
    }, [workerUrl]);
    return state;
}
