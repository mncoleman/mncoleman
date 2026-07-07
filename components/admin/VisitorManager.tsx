'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2, RefreshCw, MapPin } from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';

interface AdminPin {
    id: string;
    lat: number;
    lng: number;
    place_label: string;
    country: string | null;
    name: string | null;
    food: string | null;
    song: string | null;
    fact: string | null;
    quote: string | null;
    created_at: number;
    status: string;
}

export function VisitorManager({ workerUrl }: { workerUrl: string }) {
    const [pins, setPins] = useState<AdminPin[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${workerUrl}/api/admin/visitors`, {
                headers: authHeaders(),
                credentials: 'include',
            });
            if (!res.ok) throw new Error(`${res.status}`);
            const data = await res.json();
            setPins(data.pins || []);
        } catch (e: unknown) {
            setError(`Could not load visitors (${e instanceof Error ? e.message : 'error'})`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const del = async (id: string) => {
        if (!window.confirm('Delete this location entry? This cannot be undone.')) return;
        setDeleting(id);
        setError(null);
        try {
            const res = await fetch(`${workerUrl}/api/admin/visitors/${id}`, {
                method: 'DELETE',
                headers: authHeaders(),
                credentials: 'include',
            });
            if (!res.ok) throw new Error(`${res.status}`);
            setPins((p) => p.filter((x) => x.id !== id));
        } catch (e: unknown) {
            setError(`Delete failed (${e instanceof Error ? e.message : 'error'})`);
        } finally {
            setDeleting(null);
        }
    };

    return (
        <div className="mt-6 rounded-lg border border-border p-4 md:p-6">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    <h2 className="text-xl font-bold">Visitor Globe</h2>
                    <span className="text-sm text-muted-foreground">({pins.length})</span>
                </div>
                <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh
                </Button>
            </div>

            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

            {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
            ) : pins.length === 0 ? (
                <p className="text-sm text-muted-foreground">No visitor pins yet.</p>
            ) : (
                <ul className="divide-y divide-border">
                    {pins.map((p) => (
                        <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">{p.name || 'Anonymous'}</span>
                                    {p.status === 'hidden' && (
                                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                            hidden
                                        </span>
                                    )}
                                </div>
                                <div className="truncate text-sm text-muted-foreground">{p.place_label}</div>
                                {(p.food || p.song || p.fact || p.quote) && (
                                    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground/80">
                                        {p.food && <div>🍴 {p.food}</div>}
                                        {p.song && <div>🎵 {p.song}</div>}
                                        {p.fact && <div>✨ {p.fact}</div>}
                                        {p.quote && <div className="italic">&ldquo;{p.quote}&rdquo;</div>}
                                    </div>
                                )}
                                <div className="mt-1 text-[11px] text-muted-foreground/60">
                                    {new Date(p.created_at).toLocaleString()} · {p.lat.toFixed(2)}, {p.lng.toFixed(2)}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => del(p.id)}
                                disabled={deleting === p.id}
                                className="shrink-0 text-destructive hover:bg-destructive/10"
                                aria-label="Delete entry"
                            >
                                {deleting === p.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Trash2 className="h-4 w-4" />
                                )}
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
