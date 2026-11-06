'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar } from '@/components/admin/fields/UserSelect';
import { useAdmin } from '@/components/admin/admin-context';
import { authHeaders } from '@/lib/admin-auth';
import {
    AVATAR_SIZE, MAX_AVATAR_BYTES, resolveAvatar, squareCrop,
    type AvatarPin, type AvatarState,
} from '@/lib/avatar';
import { cn } from '@/lib/utils';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

/** Centre-crop to a square and scale to 256x256. WebP where the browser can write it, else JPEG. */
async function squareBlob(file: File): Promise<Blob> {
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) throw new Error('We could not read that image. Try a different photo.');
    const { sx, sy, side } = squareCrop(bitmap.width, bitmap.height);
    const render = (type: string, quality: number, fill: boolean) => {
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Your browser cannot resize photos.');
        ctx.imageSmoothingQuality = 'high';
        if (fill) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE); }
        ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    };
    let blob = await render('image/webp', 0.85, false);
    // Some browsers cannot encode WebP and quietly hand back a PNG.
    if (!blob || blob.type !== 'image/webp') blob = await render('image/jpeg', 0.9, true);
    if (blob && blob.size > MAX_AVATAR_BYTES) blob = await render('image/jpeg', 0.7, true);
    bitmap.close();
    if (!blob || blob.size > MAX_AVATAR_BYTES) throw new Error('That photo is still too large after resizing. Try a different one.');
    return blob;
}

async function send(workerUrl: string, path: string, init: RequestInit): Promise<AvatarState> {
    const res = await fetch(`${workerUrl}${path}`, { ...init, credentials: 'include' });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.avatar) throw new Error(json?.error || 'Something went wrong. Please try again.');
    return json.avatar as AvatarState;
}

const CHOICES: { pin: AvatarPin; label: string; hint: string; missing: string }[] = [
    { pin: 'auto', label: 'Automatic', hint: 'Google first, then Telegram', missing: '' },
    { pin: 'google', label: 'Google', hint: 'Your Google profile picture', missing: 'Sign in with Google once to use this' },
    { pin: 'telegram', label: 'Telegram', hint: 'Your Telegram profile photo', missing: 'Sign in with Telegram once to use this' },
    { pin: 'upload', label: 'Uploaded', hint: 'The photo you uploaded', missing: 'Upload a photo to use this' },
];

export function ProfilePhotoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const { user, workerUrl, setAvatar } = useAdmin();
    const name = user.name || user.username || 'Admin';
    const current = user.avatar;

    const [pin, setPin] = useState<AvatarPin>('auto');
    const [staged, setStaged] = useState<{ blob: Blob; url: string } | null>(null);
    const [removeUpload, setRemoveUpload] = useState(false);
    const [busy, setBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Start from what is saved each time the dialog opens.
    useEffect(() => {
        if (!open) return;
        setPin(current?.pin ?? 'auto');
        setRemoveUpload(false);
        setError(null);
        setStaged((s) => { if (s) URL.revokeObjectURL(s.url); return null; });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    useEffect(() => () => { if (staged) URL.revokeObjectURL(staged.url); }, [staged]);

    const sources = {
        google: current?.sources.google ?? null,
        telegram: current?.sources.telegram ?? null,
        upload: staged ? staged.url : removeUpload ? null : current?.sources.upload ?? null,
    };
    const preview = resolveAvatar({ pin, ...sources });
    const automaticUrl = resolveAvatar({ pin: 'auto', ...sources }).photoUrl;
    const dirty = !!staged || removeUpload || pin !== (current?.pin ?? 'auto');

    async function take(file: File | undefined) {
        if (!file) return;
        setError(null);
        if (!ACCEPTED.includes(file.type)) {
            setError(file.type === 'image/svg+xml' ? 'SVG images are not allowed. Use a PNG, JPEG or WebP photo.' : 'Pick a PNG, JPEG or WebP photo.');
            return;
        }
        try {
            const blob = await squareBlob(file);
            setStaged({ blob, url: URL.createObjectURL(blob) });
            setRemoveUpload(false);
            setPin('upload');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'We could not use that photo.');
        }
    }

    function removeUploaded() {
        setStaged(null);
        setRemoveUpload(true);
        if (pin === 'upload') setPin('auto');
    }

    async function save() {
        setBusy(true);
        setError(null);
        try {
            // Each step updates the app as soon as it succeeds, so a later failure leaves no stale photo.
            const saved: { latest: AvatarState | null } = { latest: null };
            const step = async (path: string, init: RequestInit) => {
                saved.latest = await send(workerUrl, path, init);
                setAvatar(saved.latest);
            };
            if (removeUpload && !staged) {
                await step('/api/me/avatar', { method: 'DELETE', headers: authHeaders() });
            }
            if (staged) {
                await step('/api/me/avatar', {
                    method: 'POST', body: staged.blob, headers: authHeaders({ 'Content-Type': staged.blob.type }),
                });
                setStaged(null);
            }
            if (pin !== (saved.latest?.pin ?? current?.pin ?? 'auto')) {
                await step('/api/me/avatar-source', {
                    method: 'PUT', body: JSON.stringify({ source: pin }), headers: authHeaders({ 'Content-Type': 'application/json' }),
                });
            }
            onOpenChange(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Profile photo</DialogTitle>
                    <DialogDescription>Shown in the sidebar, the Users page and the post author list.</DialogDescription>
                </DialogHeader>

                <div className="flex items-center gap-4">
                    <Avatar name={name} size={72} photoUrl={preview.photoUrl} />
                    <div className="min-w-0 text-sm">
                        <p className="truncate font-medium">{name}</p>
                        <p className="text-muted-foreground">
                            {preview.source === 'google' ? 'Using your Google picture'
                                : preview.source === 'telegram' ? 'Using your Telegram photo'
                                : preview.source === 'upload' ? 'Using your uploaded photo'
                                : 'No photo yet, so your initials show'}
                        </p>
                    </div>
                </div>

                <div role="radiogroup" aria-label="Where your photo comes from" className="space-y-1.5">
                    {CHOICES.map((c) => {
                        const available = c.pin === 'auto' || !!sources[c.pin];
                        const selected = pin === c.pin;
                        const thumb = c.pin === 'auto' ? automaticUrl : sources[c.pin];
                        return (
                            <button
                                key={c.pin}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                disabled={!available || busy}
                                onClick={() => setPin(c.pin)}
                                className={cn(
                                    'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                                    selected ? 'border-foreground/40 bg-foreground/[0.06]' : 'border-border/60 hover:bg-muted/50',
                                    !available && 'cursor-not-allowed opacity-50 hover:bg-transparent',
                                )}
                            >
                                <Avatar name={name} size={28} photoUrl={available ? thumb : null} />
                                <span className="min-w-0 flex-1">
                                    <span className="block font-medium">{c.label}</span>
                                    <span className="block text-xs text-muted-foreground">{available ? c.hint : c.missing}</span>
                                </span>
                                <span aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0 rounded-full border', selected ? 'border-foreground bg-foreground' : 'border-border')} />
                            </button>
                        );
                    })}
                </div>

                <div
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setDragging(false); void take(e.dataTransfer.files?.[0]); }}
                    className={cn('flex flex-wrap items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm', dragging ? 'border-foreground/60 bg-foreground/[0.06]' : 'border-border/70')}
                >
                    <input
                        ref={fileRef}
                        type="file"
                        accept={ACCEPTED.join(',')}
                        className="hidden"
                        data-testid="avatar-file"
                        onChange={(e) => { void take(e.target.files?.[0]); e.target.value = ''; }}
                    />
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => fileRef.current?.click()}>
                        <ImagePlus size={14} /> Upload a photo
                    </Button>
                    {(staged || (sources.upload && !removeUpload)) && (
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" disabled={busy} onClick={removeUploaded}>
                            <Trash2 size={14} /> Remove uploaded photo
                        </Button>
                    )}
                    <span className="text-xs text-muted-foreground">or drop an image here. It is cropped to a square.</span>
                </div>

                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="button" disabled={busy || !dirty} onClick={save} className="gap-1.5">
                        {busy && <Loader2 size={14} className="animate-spin" />} Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
