'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, Globe, Hash, KeyRound, Loader2, UploadCloud, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PasteInput } from '@/components/admin/PasteField';
import { useDeploy } from '@/components/admin/deploy-status';
import { authHeaders } from '@/lib/admin-auth';
import { saveDraft } from '@/lib/artifact-drafts';
import { PropNote, PropRow, PropertiesDrawer, PropertiesToggle, SegmentedFilter, TopBarSlot, usePropertiesDrawer } from '@/components/admin/kit';
import { isDynamic } from '@/components/admin/artifacts/artifact-logic';
import {
    BrowserBar, DropZone, FileFrame, errorText, fileToBase64, isValidSlug, saveSeed, suggestSlug, useArtifacts, type ArtifactEntry, type Visibility,
} from '@/components/admin/artifacts/shared';

/**
 * Upload artifact, as a full page (`/admin/artifacts/edit` with no key): pick a file, name it, and choose in the
 * Properties drawer whether it is Instant (live in seconds, optional password) or Static (committed to the site,
 * live after a build). A successful upload opens the new artifact's detail page.
 */

type Destination = 'instant' | 'github';

export function ArtifactUpload({ api, canUpload }: { api: string; canUpload: boolean }) {
    const router = useRouter();
    const { start } = useDeploy();
    const { artifacts } = useArtifacts(api, true);
    const taken = useMemo(() => artifacts.map((a) => a.slug).filter(Boolean) as string[], [artifacts]);
    const drawer = usePropertiesDrawer({ id: 'artifact-upload-props' });
    const [file, setFile] = useState<globalThis.File | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [destination, setDestination] = useState<Destination>('instant');
    const [visibility, setVisibility] = useState<Visibility>('public');
    const [password, setPassword] = useState('');
    const [slug, setSlug] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const localUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

    if (!canUpload) {
        return <div className="p-6 text-sm text-muted-foreground">You do not have access to upload artifacts.</div>;
    }

    const pick = (f: globalThis.File | null) => {
        setFile(f);
        setError(null);
        if (f && !name) setName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
        if (f && !slug) setSlug(suggestSlug(f.name));
    };

    const slugProblem = destination === 'instant' && slug
        ? !isValidSlug(slug) ? '3-60 characters of a-z, 0-9 and -, starting and ending with a letter or digit.'
        : taken.includes(slug) ? 'Already used by another artifact.' : null
        : null;
    const passwordProblem = destination === 'instant' && visibility === 'private' && password.length < 4 ? 'Private artifacts need a password of at least 4 characters.' : null;

    const upload = async () => {
        if (!file || slugProblem || passwordProblem) return;
        setBusy(true);
        setError(null);
        try {
            let res: Response;
            if (destination === 'instant') {
                // Streamed as multipart so the Worker can pipe it to the service without buffering it.
                const fd = new FormData();
                fd.append('file', file);
                if (name) fd.append('name', name);
                if (description) fd.append('description', description);
                if (slug) fd.append('slug', slug);
                fd.append('visibility', visibility);
                if (visibility === 'private') fd.append('password', password);
                res = await fetch(`${api}/api/artifacts`, { method: 'POST', headers: authHeaders(), credentials: 'include', body: fd });
            } else {
                res = await fetch(`${api}/api/artifacts`, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    credentials: 'include',
                    body: JSON.stringify({
                        filename: file.name,
                        name: name || undefined,
                        content: await fileToBase64(file),
                        type: file.type || 'application/octet-stream',
                        size: file.size,
                        description,
                        destination: 'github',
                    }),
                });
            }
            if (!res.ok) throw new Error(await errorText(res, 'Upload failed'));
            const data = await res.json();
            const made = { ...data.artifact, source: destination === 'instant' ? 'dynamic' : 'static' } as ArtifactEntry;
            if (destination !== 'instant') { void saveDraft(made.filename || file.name, file); start('static'); }
            saveSeed(made);
            router.replace(isDynamic(made) && made.slug
                ? `/admin/artifacts/edit?slug=${encodeURIComponent(made.slug)}`
                : `/admin/artifacts/edit?file=${encodeURIComponent(made.filename || file.name)}`);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Upload failed');
            setBusy(false);
        }
    };

    return (
        <div className="flex h-full min-h-0">
            <main data-drawer-inert className="min-w-0 flex-1 overflow-y-auto" data-lenis-prevent>
                <div className="mx-auto w-full max-w-[860px] px-4 pb-16 pt-6 md:px-8 md:pt-8">
                    <div className="mb-5 text-xs text-muted-foreground">
                        <Link href="/admin/artifacts" className="inline-flex items-center gap-1.5 rounded px-1 py-1 hover:bg-muted hover:text-foreground"><ArrowLeft size={13} /> Artifacts</Link>
                    </div>
                    {error && <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-700 dark:text-red-300">{error}</div>}
                    <h1 className="mb-4 text-2xl font-bold leading-tight tracking-[-0.02em]">Upload artifact</h1>
                    <Button onClick={upload} disabled={!file || busy || !!slugProblem || !!passwordProblem} className="mb-4 h-10 w-full gap-1.5 text-sm min-[700px]:hidden">
                        {busy ? <Loader2 size={14} className="animate-spin" /> : destination === 'instant' ? <Zap size={14} /> : <UploadCloud size={14} />}
                        {destination === 'instant' ? 'Publish instantly' : 'Upload to the site'}
                    </Button>
                    <DropZone file={file} onFile={pick} label="Drop a file here or click to browse" />
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Name (defaults to the file name)"
                        aria-label="Name"
                        className="mt-6 w-full bg-transparent p-0 text-[28px] font-bold leading-[1.15] tracking-[-0.025em] outline-none placeholder:text-muted-foreground/45"
                    />
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="A line about what this is, for the list and the share card…"
                        aria-label="Description"
                        rows={1}
                        className="mt-3 w-full resize-none bg-transparent text-base text-muted-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/45"
                    />
                    {file && localUrl && (
                        <div className="mt-6 flex h-[60vh] min-h-[320px] flex-col overflow-hidden rounded-[10px] border border-border/60">
                            <BrowserBar url={file.name} href={localUrl} badge="Not uploaded yet" />
                            <div className="min-h-0 flex-1">
                                {/* A blob: URL inherits this origin, so it gets the same opaque sandbox as static HTML. */}
                                <FileFrame src={localUrl} type={file.type} title="Upload preview" sameOrigin />
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <TopBarSlot>
                <Button size="sm" onClick={upload} disabled={!file || busy || !!slugProblem || !!passwordProblem} className="mr-1 h-8 gap-1.5 text-[13px] max-[699px]:hidden">
                    {busy ? <Loader2 size={13} className="animate-spin" /> : destination === 'instant' ? <Zap size={13} /> : <UploadCloud size={13} />}
                    {destination === 'instant' ? 'Publish instantly' : 'Upload to the site'}
                </Button>
                <PropertiesToggle drawer={drawer} />
            </TopBarSlot>
            <PropertiesDrawer drawer={drawer} label="Upload settings">
                <PropRow icon={Globe} label="Where it lives">
                    <SegmentedFilter size="sm" label="Where it lives" value={destination} onChange={setDestination} options={[{ value: 'instant', label: 'Instant' }, { value: 'github', label: 'Static' }]} />
                </PropRow>
                <PropNote>{destination === 'instant' ? 'On the artifact server, live in seconds.' : 'Added to the site, live after a rebuild (about a minute and a half).'}</PropNote>
                {destination === 'instant' && (
                    <>
                        <PropRow icon={Hash} label="Address" stack>
                            <PasteInput
                                value={slug}
                                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                placeholder="my-artifact"
                                aria-label="Address"
                                maxLength={60}
                                className="h-8 font-mono text-sm"
                            />
                        </PropRow>
                        <PropNote bad={!!slugProblem}>{slugProblem || <>artifacts.mncoleman.com/a/<span className="font-mono">{slug || 'your-address'}</span></>}</PropNote>
                        <PropRow icon={Eye} label="Visibility">
                            <SegmentedFilter size="sm" label="Visibility" value={visibility} onChange={setVisibility} options={[{ value: 'public', label: 'Public' }, { value: 'private', label: 'Private' }]} />
                        </PropRow>
                        <PropNote>{visibility === 'public' ? 'Listed on /artifacts.' : 'Hidden from the list and protected by a password.'}</PropNote>
                        {visibility === 'private' && (
                            <>
                                <PropRow icon={KeyRound} label="Password" stack>
                                    <PasteInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 4 characters" aria-label="Password" autoComplete="new-password" className="h-8 text-sm" />
                                </PropRow>
                                {passwordProblem && <PropNote bad>{passwordProblem}</PropNote>}
                            </>
                        )}
                    </>
                )}
            </PropertiesDrawer>
        </div>
    );
}
