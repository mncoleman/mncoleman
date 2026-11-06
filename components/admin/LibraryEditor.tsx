'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check, Clock, Copy, ExternalLink, Hash, Library, Link2, Loader2, RefreshCw, Sparkles, Trash2, AlignLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { authHeaders } from '@/lib/admin-auth';
import {
    EmptyState, PropDivider, PropNote, PropRow, PropertiesDrawer, PropertiesToggle, RowAction, SegmentedFilter, Section, StatusPill, TopBarSlot,
    copyText, notify, usePropertiesDrawer, useUnsavedGuard,
} from '@/components/admin/kit';
import { siteUrl } from '@/components/admin/kit/copy-link';
import { relativeTime } from '@/components/admin/artifacts/artifact-logic';
import { ResourceRowsEditor } from '@/components/admin/library/ResourceRowsEditor';
import {
    bodyPatch, createProblem, isValidSlug, sameBody, saveProblem, stripSkillFrontmatter, suggestSlug, type LibraryItem, type LibraryKind, type ResourceRow,
} from '@/components/admin/library/library-logic';
import { useLibrary } from '@/components/admin/library/use-library';
import '@/components/admin/page-editor.css';

/**
 * Full-page editor for one AI Library item (`/admin/library/edit?slug=`; no slug starts a new one). A prompt's text is
 * a plain monospace page (its `{{variables}}` and indentation must survive exactly); a skill's SKILL.md body is
 * Markdown in the page-variant editor, with its description and extra files. Properties live in the drawer.
 * Nothing is staged: Create and Save go straight to the service, as before, and the item is live at once.
 */

const fieldCls = '-mx-2 block w-[calc(100%+16px)] rounded-[5px] bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring';
const KINDS = [{ value: 'prompt', label: 'Prompt' }, { value: 'skill', label: 'Skill' }] as const;

export function LibraryEditor({ workerUrl, slug }: { workerUrl: string; slug?: string }) {
    const { items, setItems, loading, error, reload } = useLibrary();
    const found = slug ? items.find((i) => i.slug === slug) : undefined;

    if (slug && !found) {
        return (
            <div className="flex h-full items-center justify-center overflow-y-auto p-6" data-lenis-prevent>
                {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
                ) : error ? (
                    <EmptyState title="Could not load the library" body={<span className="text-red-600">{error}</span>} action={<Button size="sm" variant="outline" onClick={() => void reload()} className="gap-1.5"><RefreshCw size={13} /> Try again</Button>} />
                ) : (
                    <EmptyState icon={<Library size={20} />} title="We can't find that item" body="It may have been deleted." action={<Button size="sm" variant="outline" asChild><Link href="/admin/library">Back to the library</Link></Button>} />
                )}
            </div>
        );
    }
    if (!slug && loading) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>;
    }
    return (
        <Page
            key={found?.slug ?? 'new'}
            workerUrl={workerUrl.replace(/\/$/, '')}
            item={found}
            taken={items.map((i) => i.slug)}
            onSaved={(it) => setItems((prev) => [it, ...prev.filter((p) => p.slug !== it.slug)])}
            onRemoved={(s) => setItems((prev) => prev.filter((p) => p.slug !== s))}
        />
    );
}

function Page({ workerUrl, item, taken, onSaved, onRemoved }: {
    workerUrl: string; item?: LibraryItem; taken: string[]; onSaved: (i: LibraryItem) => void; onRemoved: (slug: string) => void;
}) {
    const router = useRouter();
    const isNew = !item;
    const drawer = usePropertiesDrawer({ id: 'library-props' });
    const [kind, setKind] = useState<LibraryKind>(item?.kind ?? 'prompt');
    const [name, setName] = useState(item?.name ?? '');
    const [slug, setSlug] = useState('');
    const [slugTouched, setSlugTouched] = useState(false);
    const [promptText, setPromptText] = useState(item?.promptText ?? '');
    const [description, setDescription] = useState(item?.description ?? '');
    const initialBody = useMemo(() => (item?.skillMd ? stripSkillFrontmatter(item.skillMd) : ''), [item]);
    const [skillBody, setSkillBody] = useState(initialBody);
    const [resources, setResources] = useState<ResourceRow[]>(item?.resources ?? []);
    const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const titleRef = useRef<HTMLTextAreaElement>(null);

    const effectiveSlug = isNew ? slug : item.slug;
    const publicUrl = item?.url ?? '';
    const resourcesKey = JSON.stringify(resources.filter((r) => r.filename.trim()));
    const dirty = isNew
        ? !!(name || promptText || description || skillBody || resources.length)
        : name !== item.name
            || (item.kind === 'prompt' ? !sameBody(promptText, item.promptText ?? '') : description !== (item.description ?? '') || !sameBody(skillBody, initialBody) || resourcesKey !== JSON.stringify((item.resources ?? []).filter((r) => r.filename.trim())));
    useUnsavedGuard(dirty && busy === null && !saved);
    const problem = isNew
        ? createProblem({ kind, name, slug, promptText, description, taken })
        : saveProblem(item.kind, description);

    const save = async () => {
        if (problem) { setError(problem); return; }
        if (!dirty && !isNew) return;
        setBusy('save');
        setError(null);
        try {
            let res: Response;
            if (isNew) {
                const body: Record<string, unknown> = { kind, name, slug: slug || undefined };
                if (kind === 'prompt') body.promptText = promptText;
                else { body.description = description; body.skillBodyMd = skillBody; body.resources = resources.filter((r) => r.filename.trim()); }
                res = await fetch(`${workerUrl}/api/library`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), credentials: 'include', body: JSON.stringify(body) });
            } else {
                const body: Record<string, unknown> = {};
                if (name !== item.name) body.name = name;
                if (item.kind === 'prompt') {
                    { const p = bodyPatch(item.promptText ?? '', promptText); if (p !== undefined) body.promptText = p; }
                } else {
                    if (description !== (item.description ?? '')) body.description = description;
                    { const b = bodyPatch(initialBody, skillBody); if (b !== undefined) body.skillBodyMd = b; }
                    // Resources are a full replace: always resend the current set so additions, removals and edits land together.
                    body.resources = resources.filter((r) => r.filename.trim());
                }
                res = await fetch(`${workerUrl}/api/library/${encodeURIComponent(item.slug)}`, { method: 'PATCH', headers: authHeaders({ 'Content-Type': 'application/json' }), credentials: 'include', body: JSON.stringify(body) });
            }
            if (!res.ok) {
                const text = await res.text();
                let msg = text;
                try { msg = JSON.parse(text).error || text; } catch { /* plain text */ }
                throw new Error(msg || (isNew ? 'Could not create it' : 'Could not save'));
            }
            const data = await res.json();
            onSaved(data.item as LibraryItem);
            if (isNew) {
                notify('Created. It is live now.');
                router.replace(`/admin/library/edit?slug=${encodeURIComponent((data.item as LibraryItem).slug)}`);
            } else {
                setSaved(true);
                setTimeout(() => setSaved(false), 2500);
            }
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setBusy(null);
        }
    };

    const remove = async () => {
        if (!item) return;
        setBusy('delete');
        setError(null);
        try {
            const res = await fetch(`${workerUrl}/api/library/${encodeURIComponent(item.slug)}`, { method: 'DELETE', headers: authHeaders(), credentials: 'include' });
            if (!res.ok) throw new Error((await res.text()) || 'Delete failed');
            onRemoved(item.slug);
            notify(`Deleted “${item.name}”.`);
            router.push('/admin/library');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Delete failed');
            setBusy(null);
            setConfirmDelete(false);
        }
    };

    const copyLink = async () => notify((await copyText(siteUrl(publicUrl))) ? 'Link copied' : 'Could not copy. Select the address and copy it yourself.');
    const onTitle = (v: string) => {
        setName(v);
        if (isNew && !slugTouched) setSlug(suggestSlug(v));
    };
    const shownKind = item?.kind ?? kind;

    const state = saved
        ? <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><Check size={12} /> Saved, live now</span>
        : dirty
            ? <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><i className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {isNew ? 'Not created yet' : 'Unsaved changes'}</span>
            : <span>{isNew ? 'New item' : 'Live. Changes go live when you save.'}</span>;

    return (
        <div className="flex h-full min-h-0">
            <main id="library-canvas" data-drawer-inert className="min-w-0 flex-1 overflow-y-auto" data-lenis-prevent>
                <div className="mx-auto w-full max-w-[768px] px-4 pb-[16vh] pt-6 md:px-8 md:pt-10">
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <Link href="/admin/library" className="inline-flex items-center gap-1.5 rounded px-1 py-1 hover:bg-muted hover:text-foreground"><ArrowLeft size={13} /> AI Library</Link>
                        <div className="min-w-0">{state}</div>
                    </div>
                    {(isNew || dirty) && (
                        <Button onClick={save} disabled={busy !== null} className="mb-5 h-10 w-full gap-1.5 text-sm min-[700px]:hidden">
                            {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {isNew ? 'Create' : 'Save changes'}
                        </Button>
                    )}
                    {error && <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-700 dark:text-red-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}</div>}

                    <div className="flex items-start gap-3">
                        <textarea
                            ref={titleRef}
                            rows={1}
                            autoFocus={isNew}
                            value={name}
                            onChange={(e) => onTitle(e.target.value.replace(/\n/g, ' '))}
                            placeholder={`Untitled ${shownKind}`}
                            aria-label="Title"
                            spellCheck={false}
                            className="mb-2 block w-full min-w-0 flex-1 resize-none bg-transparent p-0 text-[32px] font-bold leading-[1.15] tracking-[-0.025em] text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/55 md:text-[42px]"
                        />
                        {item && <RowAction variant="button" path={item.url} state={{ live: true }} className="mt-1.5 md:mt-2.5" />}
                    </div>
                    <div className="mb-7 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                        <StatusPill tone={shownKind === 'skill' ? 'violet' : 'info'}>{shownKind === 'skill' ? 'Skill' : 'Prompt'}</StatusPill>
                        {item && <span>Updated {relativeTime(item.updatedAt || item.createdAt)}</span>}
                        {effectiveSlug && <><span aria-hidden="true">·</span><span className="truncate">/library/{effectiveSlug}</span></>}
                    </div>

                    {shownKind === 'prompt' ? (
                        <textarea
                            value={promptText}
                            onChange={(e) => setPromptText(e.target.value)}
                            placeholder="Write the prompt here…"
                            aria-label="Prompt text"
                            spellCheck={false}
                            className="block min-h-[50vh] w-full resize-none bg-transparent p-0 font-mono text-[15px] leading-[1.7] text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/55"
                        />
                    ) : (
                        <>
                            <textarea
                                value={skillBody}
                                onChange={(e) => setSkillBody(e.target.value)}
                                placeholder="Write the skill's instructions…"
                                aria-label="Skill instructions"
                                spellCheck={false}
                                className="block min-h-[50vh] w-full resize-none bg-transparent p-0 font-mono text-[15px] leading-[1.7] text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/55"
                            />
                            <p className="mt-2 text-xs text-muted-foreground">Plain text, saved exactly as written. Headings, tables and tags are kept as you type them.</p>
                            <Section title="Extra files" padded className="mt-10">
                                <p className="mb-3 text-sm text-muted-foreground">Scripts, references and assets that travel with the skill in its download.</p>
                                <ResourceRowsEditor rows={resources} onChange={setResources} />
                            </Section>
                        </>
                    )}
                </div>
            </main>

            <TopBarSlot>
                <Button size="sm" onClick={save} disabled={busy !== null || (!isNew && !dirty)} className="mr-1 h-8 gap-1.5 text-[13px] max-[699px]:hidden" title={problem || (isNew ? 'Create it' : 'Save changes')}>
                    {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {isNew ? 'Create' : 'Save'}
                </Button>
                <PropertiesToggle drawer={drawer} />
            </TopBarSlot>
            <PropertiesDrawer drawer={drawer} label="Library item properties">
                <PropRow icon={Sparkles} label="Type">
                    {isNew
                        ? <SegmentedFilter size="sm" label="Type" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
                        : <StatusPill tone={shownKind === 'skill' ? 'violet' : 'info'}>{shownKind === 'skill' ? 'Skill' : 'Prompt'}</StatusPill>}
                </PropRow>
                <PropRow icon={Hash} label="Address" stack>
                    {isNew ? (
                        <Input
                            value={slug}
                            onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
                            placeholder="my-prompt-name"
                            aria-label="Address"
                            maxLength={60}
                            className="h-8 font-mono text-sm"
                        />
                    ) : (
                        <span className="min-w-0 break-all py-1.5 font-mono text-sm text-muted-foreground">{item.slug}</span>
                    )}
                </PropRow>
                <PropNote bad={isNew && !!slug && !isValidSlug(slug)}>
                    {isNew
                        ? <>artifacts.mncoleman.com/library/<span className="font-mono">{slug || 'your-address'}</span>. Fixed once created.{shownKind === 'skill' ? ' Also the skill’s name inside its download.' : ''}</>
                        : 'The address cannot be changed.'}
                </PropNote>
                {shownKind === 'skill' && (
                    <>
                        <PropRow icon={AlignLeft} label="Description" stack>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value.slice(0, 1024))}
                                rows={3}
                                placeholder="What this skill does and when to use it"
                                aria-label="Description"
                                className="-mx-2 block min-h-[34px] w-full resize-none rounded-[5px] bg-transparent px-2 py-1.5 text-sm leading-normal outline-none [field-sizing:content] placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </PropRow>
                        <PropNote>{description.length}/1024. Becomes the description at the top of the skill file.</PropNote>
                    </>
                )}
                {item && (
                    <>
                        <PropRow icon={Clock} label="Updated"><span className="text-sm text-muted-foreground">{relativeTime(item.updatedAt || item.createdAt)}</span></PropRow>
                        <PropDivider />
                        <PropRow icon={Link2} label="Public page" stack>
                            <div className="flex w-full min-w-0 items-center gap-1.5">
                                <input readOnly value={item.url} aria-label="Public page" onFocus={(e) => e.currentTarget.select()} className={`${fieldCls} !mx-0 !w-auto h-8 min-w-0 flex-1 border border-border/60 font-mono text-xs`} />
                                <Button size="sm" variant="outline" onClick={copyLink} className="h-8 shrink-0 gap-1.5 px-2.5 text-[13px]"><Copy size={13} /> Copy</Button>
                            </div>
                        </PropRow>
                        <Button asChild variant="outline" size="sm" className="mt-1 h-9 w-full justify-start gap-2 text-[13px]"><a href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open the public page</a></Button>
                        <PropDivider />
                    </>
                )}
                <PropNote>{isNew ? 'It goes live the moment you create it. Nothing waits for the site to rebuild.' : 'Changes are live as soon as you save. Nothing needs publishing.'}</PropNote>
                {item && (
                    <button type="button" onClick={() => setConfirmDelete(true)} className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600">
                        <Trash2 size={12} /> Delete {item.kind}
                    </button>
                )}
            </PropertiesDrawer>

            <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete “{item?.name}”?</DialogTitle>
                        <DialogDescription>
                            The text, share image{item?.kind === 'skill' ? ' and download' : ''} are removed now. Anyone holding the link gets a 404. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep it</Button>
                        <Button variant="destructive" onClick={remove} disabled={busy !== null} className="gap-1.5">
                            {busy === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
