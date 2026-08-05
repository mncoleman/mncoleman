'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Loader2, MessageSquareText, PackageOpen, Plus, Trash2, Pencil, X, Check,
    Copy, ExternalLink, AlertTriangle, Upload,
} from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';

interface LibraryManagerProps {
    workerUrl: string;
}

type LibraryKind = 'prompt' | 'skill';
type ResourceFolder = 'scripts' | 'references' | 'assets';

interface ResourceRow {
    folder: ResourceFolder;
    filename: string;
    content: string;
}

interface LibraryItem {
    slug: string;
    kind: LibraryKind;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    url: string;
    ogImage: string;
    promptText?: string;
    skillMd?: string;
    resources?: ResourceRow[];
    downloadUrls: { txt?: string; md?: string; zip?: string };
}

const ARTIFACTS_API = process.env.NEXT_PUBLIC_ARTIFACTS_API_URL || 'https://artifacts.mncoleman.com';
const RESOURCE_FOLDERS: ResourceFolder[] = ['scripts', 'references', 'assets'];

function suggestSlug(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function isValidSlug(slug: string): boolean {
    return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug);
}

function apiHeaders(extra?: Record<string, string>) {
    return authHeaders({ 'Content-Type': 'application/json', ...extra });
}

/** SKILL.md is server-assembled (frontmatter + body) — strip the frontmatter back
 *  off so the edit form only shows the part the admin actually authored. */
function stripSkillFrontmatter(skillMd: string): string {
    const match = skillMd.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/);
    return match ? match[1] : skillMd;
}

function emptyResourceRow(): ResourceRow {
    return { folder: 'references', filename: '', content: '' };
}

// Gates the file picker to text/code content — uploading a binary file here
// would silently corrupt it, since resources are stored as plain UTF-8 text.
const TEXT_EXTENSIONS = new Set([
    'md', 'txt', 'json', 'js', 'jsx', 'ts', 'tsx', 'py', 'sh', 'bash', 'zsh',
    'yml', 'yaml', 'toml', 'css', 'scss', 'html', 'xml', 'csv', 'rb', 'go',
    'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'php', 'sql', 'env', 'ini', 'conf',
    'cfg', 'lock', 'log', 'svg',
]);
const SCRIPT_EXTENSIONS = new Set(['sh', 'bash', 'zsh', 'py', 'js', 'ts', 'rb', 'go', 'rs', 'php']);
const DOC_EXTENSIONS = new Set(['md', 'txt']);

function extOf(filename: string): string {
    const m = filename.match(/\.([a-zA-Z0-9]+)$/);
    return m ? m[1].toLowerCase() : '';
}

function looksLikeText(file: globalThis.File): boolean {
    const ext = extOf(file.name);
    if (TEXT_EXTENSIONS.has(ext)) return true;
    if (file.type.startsWith('text/')) return true;
    // No extension + no reported MIME — e.g. "Dockerfile", "Makefile".
    return !ext && !file.type;
}

function suggestResourceFolder(filename: string): ResourceFolder {
    const ext = extOf(filename);
    if (SCRIPT_EXTENSIONS.has(ext)) return 'scripts';
    if (DOC_EXTENSIONS.has(ext)) return 'references';
    return 'assets';
}

/** Reads an uploaded file as text, rejecting anything that isn't text/code —
 *  including a belt-and-suspenders binary sniff (NUL byte) after reading, since
 *  extension/MIME checks alone can't catch every mislabeled binary file. */
async function readUploadedTextFile(file: globalThis.File): Promise<string> {
    const MAX_BYTES = 5 * 1024 * 1024; // matches the server's per-resource cap
    if (file.size > MAX_BYTES) {
        throw new Error(`"${file.name}" is too large (max 5MB per resource file).`);
    }
    if (!looksLikeText(file)) {
        throw new Error(`"${file.name}" doesn't look like a text/code file — only text-based resources are supported here.`);
    }
    const text = await file.text();
    if (text.includes(String.fromCharCode(0))) {
        throw new Error(`"${file.name}" appears to be a binary file — only text-based resources are supported here.`);
    }
    return text;
}

const TEXT_UPLOAD_ACCEPT = Array.from(TEXT_EXTENSIONS).map((e) => `.${e}`).concat('text/*').join(',');

function ResourceRowsEditor({
    rows,
    onChange,
}: {
    rows: ResourceRow[];
    onChange: (rows: ResourceRow[]) => void;
}) {
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const update = (index: number, patch: Partial<ResourceRow>) => {
        onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    };
    const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));
    const add = () => onChange([...rows, emptyResourceRow()]);

    const handleFilesSelected = async (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;
        setUploadError(null);
        const newRows: ResourceRow[] = [];
        for (const file of Array.from(fileList)) {
            try {
                const content = await readUploadedTextFile(file);
                const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
                newRows.push({ folder: suggestResourceFolder(file.name), filename, content });
            } catch (e: any) {
                setUploadError(e.message);
            }
        }
        if (newRows.length > 0) onChange([...rows, ...newRows]);
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Resources (scripts / references / assets)
                </Label>
                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={TEXT_UPLOAD_ACCEPT}
                        onChange={(e) => {
                            handleFilesSelected(e.target.files);
                            e.target.value = '';
                        }}
                        className="hidden"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-7 gap-1">
                        <Upload className="h-3 w-3" /> Upload file
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={add} className="h-7 gap-1">
                        <Plus className="h-3 w-3" /> Add file
                    </Button>
                </div>
            </div>
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            {rows.length === 0 && (
                <p className="text-xs text-muted-foreground">No sub-resources yet — optional.</p>
            )}
            {rows.map((row, i) => (
                <div key={i} className="rounded-lg border border-border/50 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                        <select
                            value={row.folder}
                            onChange={(e) => update(i, { folder: e.target.value as ResourceFolder })}
                            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                        >
                            {RESOURCE_FOLDERS.map((f) => (
                                <option key={f} value={f}>{f}/</option>
                            ))}
                        </select>
                        <Input
                            value={row.filename}
                            onChange={(e) => update(i, { filename: e.target.value })}
                            placeholder="filename.md"
                            className="h-8 text-xs font-mono flex-1"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(i)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <Textarea
                        value={row.content}
                        onChange={(e) => update(i, { content: e.target.value })}
                        placeholder="File contents"
                        className="text-xs font-mono min-h-[80px]"
                    />
                </div>
            ))}
        </div>
    );
}

export function LibraryManager({ workerUrl }: LibraryManagerProps) {
    const [kind, setKind] = useState<LibraryKind>('prompt');
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [promptText, setPromptText] = useState('');
    const [description, setDescription] = useState('');
    const [skillBodyMd, setSkillBodyMd] = useState('');
    const [resources, setResources] = useState<ResourceRow[]>([]);
    const [creating, setCreating] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);

    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loadingList, setLoadingList] = useState(true);

    const [editingSlug, setEditingSlug] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editPromptText, setEditPromptText] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editSkillBodyMd, setEditSkillBodyMd] = useState('');
    const [editResources, setEditResources] = useState<ResourceRow[]>([]);
    const [saving, setSaving] = useState(false);

    const [deleting, setDeleting] = useState<string | null>(null);
    const [pendingDelete, setPendingDelete] = useState<LibraryItem | null>(null);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [slugTouched, setSlugTouched] = useState(false);

    const fetchItems = useCallback(async () => {
        setLoadingList(true);
        try {
            const res = await fetch(`${ARTIFACTS_API}/api/library/list`, { cache: 'no-store' });
            const data = res.ok ? await res.json() : { items: [] };
            setItems(data.items || []);
        } catch {
            setItems([]);
        } finally {
            setLoadingList(false);
        }
    }, []);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const copyToClipboard = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
        } catch {
            window.prompt('Copy:', text);
        }
    };

    const handleNameChange = (v: string) => {
        setName(v);
        if (!slugTouched) setSlug(suggestSlug(v));
    };

    const resetForm = () => {
        setName('');
        setSlug('');
        setSlugTouched(false);
        setPromptText('');
        setDescription('');
        setSkillBodyMd('');
        setResources([]);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setMessage({ type: 'error', text: 'Title is required.' });
            return;
        }
        if (slug && !isValidSlug(slug)) {
            setMessage({ type: 'error', text: 'Slug must be 3-60 chars of [a-z0-9-], starting and ending with alphanumeric.' });
            return;
        }
        if (kind === 'prompt' && !promptText.trim()) {
            setMessage({ type: 'error', text: 'Prompt text is required.' });
            return;
        }
        if (kind === 'skill' && !description.trim()) {
            setMessage({ type: 'error', text: 'Description is required for skills.' });
            return;
        }

        setCreating(true);
        setMessage(null);
        setLastShareUrl(null);

        try {
            const body: any = { kind, name, slug: slug || undefined };
            if (kind === 'prompt') {
                body.promptText = promptText;
            } else {
                body.description = description;
                body.skillBodyMd = skillBodyMd;
                body.resources = resources.filter((r) => r.filename.trim());
            }

            const res = await fetch(`${workerUrl}/api/library`, {
                method: 'POST',
                headers: apiHeaders(),
                credentials: 'include',
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Create failed');
            }

            const data = await res.json();
            setItems((prev) => [data.item, ...prev.filter((i) => i.slug !== data.item.slug)]);
            setLastShareUrl(data.item.url);
            setMessage({ type: 'success', text: `"${name}" published. Share URL ready below.` });
            resetForm();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setCreating(false);
        }
    };

    const startEdit = (item: LibraryItem) => {
        setEditingSlug(item.slug);
        setEditName(item.name);
        setEditPromptText(item.promptText || '');
        setEditDescription(item.description || '');
        setEditSkillBodyMd(item.skillMd ? stripSkillFrontmatter(item.skillMd) : '');
        setEditResources(item.resources || []);
        setMessage(null);
    };

    const cancelEdit = () => {
        setEditingSlug(null);
        setEditName('');
        setEditPromptText('');
        setEditDescription('');
        setEditSkillBodyMd('');
        setEditResources([]);
    };

    const handleSaveEdit = async (item: LibraryItem) => {
        if (item.kind === 'skill' && !editDescription.trim()) {
            setMessage({ type: 'error', text: 'Description is required for skills.' });
            return;
        }

        setSaving(true);
        setMessage(null);

        try {
            const body: any = {};
            if (editName !== item.name) body.name = editName;
            if (item.kind === 'prompt') {
                if (editPromptText !== (item.promptText || '')) body.promptText = editPromptText;
            } else {
                if (editDescription !== (item.description || '')) body.description = editDescription;
                const currentBody = item.skillMd ? stripSkillFrontmatter(item.skillMd) : '';
                if (editSkillBodyMd !== currentBody) body.skillBodyMd = editSkillBodyMd;
                // Resources are full-replace — always resend the current edited set so
                // additions/removals/edits all land together.
                body.resources = editResources.filter((r) => r.filename.trim());
            }

            const res = await fetch(`${workerUrl}/api/library/${encodeURIComponent(item.slug)}`, {
                method: 'PATCH',
                headers: apiHeaders(),
                credentials: 'include',
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Update failed');
            }

            const data = await res.json();
            setItems((prev) => prev.map((i) => (i.slug === item.slug ? data.item : i)));
            setMessage({ type: 'success', text: `"${data.item.name}" updated.` });
            cancelEdit();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (item: LibraryItem) => {
        setDeleting(item.slug);
        setMessage(null);
        try {
            const res = await fetch(`${workerUrl}/api/library/${encodeURIComponent(item.slug)}`, {
                method: 'DELETE',
                headers: authHeaders(),
                credentials: 'include',
            });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Delete failed');
            }
            setItems((prev) => prev.filter((i) => i.slug !== item.slug));
            setMessage({ type: 'success', text: `"${item.name}" removed.` });
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setDeleting(null);
        }
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        const target = pendingDelete;
        setPendingDelete(null);
        await handleDelete(target);
    };

    return (
        <>
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>&ldquo;A&rdquo;I Library</CardTitle>
                <CardDescription>Publish prompts and skills to the public &ldquo;A&rdquo;I page, with auto OG images.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {message && (
                    <div className={`p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {message.text}
                    </div>
                )}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
                <div className="space-y-6 min-w-0">
                <form onSubmit={handleCreate} className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setKind('prompt')}
                                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                                    kind === 'prompt' ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/30'
                                }`}
                            >
                                <MessageSquareText className={`h-4 w-4 mt-0.5 shrink-0 ${kind === 'prompt' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div>
                                    <p className="text-sm font-medium">Prompt</p>
                                    <p className="text-xs text-muted-foreground">Title + prompt text.</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setKind('skill')}
                                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                                    kind === 'skill' ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/30'
                                }`}
                            >
                                <PackageOpen className={`h-4 w-4 mt-0.5 shrink-0 ${kind === 'skill' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div>
                                    <p className="text-sm font-medium">Skill</p>
                                    <p className="text-xs text-muted-foreground">SKILL.md + resources.</p>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="library-name">Title</Label>
                        <Input
                            id="library-name"
                            value={name}
                            onChange={(e) => handleNameChange(e.target.value)}
                            placeholder="Display name"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="library-slug">
                            Slug
                            <span className="ml-2 text-xs text-muted-foreground font-normal">
                                URL: artifacts.mncoleman.com/library/<span className="font-mono">{slug || 'your-slug'}</span>
                            </span>
                        </Label>
                        <Input
                            id="library-slug"
                            value={slug}
                            onChange={(e) => {
                                setSlugTouched(true);
                                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                            }}
                            placeholder="my-prompt-name"
                            className="font-mono"
                            maxLength={60}
                        />
                        {slug && !isValidSlug(slug) && (
                            <p className="text-xs text-destructive">3-60 chars, [a-z0-9-], starting and ending alphanumeric.</p>
                        )}
                        {kind === 'skill' && (
                            <p className="text-xs text-muted-foreground">Doubles as the SKILL.md <code>name</code> field — must match the zip&apos;s folder name.</p>
                        )}
                    </div>

                    {kind === 'prompt' ? (
                        <div className="space-y-2">
                            <Label htmlFor="library-prompt-text">Prompt text</Label>
                            <Textarea
                                id="library-prompt-text"
                                value={promptText}
                                onChange={(e) => setPromptText(e.target.value)}
                                placeholder="The full prompt..."
                                className="min-h-[160px] font-mono text-sm"
                            />
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="library-description">
                                    Description
                                    <span className="ml-2 text-xs text-muted-foreground font-normal">{description.length}/1024</span>
                                </Label>
                                <Textarea
                                    id="library-description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value.slice(0, 1024))}
                                    placeholder="What this skill does and when to use it — becomes the SKILL.md description."
                                    className="min-h-[80px] text-sm"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="library-skill-body">
                                    SKILL.md body
                                    <span className="ml-2 text-xs text-muted-foreground font-normal">Frontmatter is auto-generated from Title/Description above — keep this under ~500 lines.</span>
                                </Label>
                                <Textarea
                                    id="library-skill-body"
                                    value={skillBodyMd}
                                    onChange={(e) => setSkillBodyMd(e.target.value)}
                                    placeholder="## Instructions&#10;..."
                                    className="min-h-[200px] font-mono text-sm"
                                />
                            </div>
                            <ResourceRowsEditor rows={resources} onChange={setResources} />
                        </>
                    )}

                    <Button type="submit" disabled={creating} className="w-full sm:w-auto">
                        {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                        Publish
                    </Button>
                </form>

                {lastShareUrl && (
                    <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-medium">
                            Live & shareable
                        </div>
                        <div className="flex items-center gap-2">
                            <Input value={lastShareUrl} readOnly className="font-mono text-xs h-8" />
                            <Button type="button" size="sm" variant="outline" onClick={() => copyToClipboard(lastShareUrl, 'share-url')} className="h-8 gap-1">
                                {copiedKey === 'share-url'
                                    ? <><Check className="h-3 w-3 text-emerald-500" /> Copied</>
                                    : <><Copy className="h-3 w-3" /> Copy</>}
                            </Button>
                            <Button type="button" size="sm" variant="outline" asChild className="h-8 gap-1">
                                <a href={lastShareUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3 w-3" /> Open
                                </a>
                            </Button>
                        </div>
                    </div>
                )}
                </div>

                <div className="space-y-3 min-w-0 lg:border-l lg:border-border/50 lg:pl-6">
                    <p className="text-sm font-medium text-muted-foreground">
                        Library items{items.length > 0 ? ` (${items.length})` : ''}
                    </p>

                    {loadingList ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                            <Loader2 className="animate-spin h-4 w-4" /> Loading...
                        </div>
                    ) : items.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">Nothing published yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {items.map((item) => {
                                const isEditing = editingSlug === item.slug;

                                if (isEditing) {
                                    return (
                                        <div key={item.slug} className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium text-muted-foreground">Editing: {item.slug}</span>
                                                <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 w-7 p-0">
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Title</Label>
                                                <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-sm" />
                                            </div>
                                            {item.kind === 'prompt' ? (
                                                <div className="space-y-2">
                                                    <Label className="text-xs">Prompt text</Label>
                                                    <Textarea value={editPromptText} onChange={(e) => setEditPromptText(e.target.value)} className="min-h-[120px] font-mono text-xs" />
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="space-y-2">
                                                        <Label className="text-xs">
                                                            Description <span className="text-muted-foreground font-normal">{editDescription.length}/1024</span>
                                                        </Label>
                                                        <Textarea
                                                            value={editDescription}
                                                            onChange={(e) => setEditDescription(e.target.value.slice(0, 1024))}
                                                            className="min-h-[60px] text-xs"
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className="text-xs">SKILL.md body</Label>
                                                        <Textarea value={editSkillBodyMd} onChange={(e) => setEditSkillBodyMd(e.target.value)} className="min-h-[140px] font-mono text-xs" />
                                                    </div>
                                                    <ResourceRowsEditor rows={editResources} onChange={setEditResources} />
                                                </>
                                            )}
                                            <div className="flex gap-2 pt-1">
                                                <Button size="sm" onClick={() => handleSaveEdit(item)} disabled={saving} className="h-8 gap-1.5">
                                                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                                    Save
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8">
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={item.slug} className="p-3 rounded-lg border border-border/50 bg-background/50 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-start gap-3 min-w-0">
                                                {item.kind === 'prompt'
                                                    ? <MessageSquareText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                                    : <PackageOpen className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="text-sm font-medium break-words">{item.name}</p>
                                                        <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border bg-muted/50 border-border text-muted-foreground capitalize">
                                                            {item.kind}
                                                        </span>
                                                    </div>
                                                    {item.description && (
                                                        <p className="text-xs text-muted-foreground break-words">{item.description}</p>
                                                    )}
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className="text-xs text-muted-foreground break-all min-w-0">{item.url}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(item.url, `url-${item.slug}`)}
                                                            title="Copy URL"
                                                            aria-label="Copy URL"
                                                            className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                                        >
                                                            {copiedKey === `url-${item.slug}` ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                                                        </button>
                                                        <a
                                                            href={item.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title="Open URL"
                                                            aria-label="Open URL"
                                                            className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                                        >
                                                            <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button variant="ghost" size="sm" onClick={() => startEdit(item)} className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setPendingDelete(item)}
                                                    disabled={deleting === item.slug}
                                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    {deleting === item.slug ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
                </div>
            </CardContent>
        </Card>
        {pendingDelete && (
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="library-delete-modal-title"
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150"
                onClick={() => setPendingDelete(null)}
                onKeyDown={(e) => { if (e.key === 'Escape') setPendingDelete(null); }}
            >
                <div
                    role="document"
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-150"
                >
                    <div className="flex items-start gap-3 mb-4">
                        <div className="p-2 rounded-full bg-destructive/10 text-destructive shrink-0">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 id="library-delete-modal-title" className="text-lg font-semibold leading-tight">
                                Delete {pendingDelete.kind}?
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">This cannot be undone.</p>
                        </div>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 mb-4">
                        <p className="text-sm font-medium break-words">{pendingDelete.name}</p>
                        <p className="text-xs text-muted-foreground break-all mt-0.5">{pendingDelete.url}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-5">
                        The content, OG image{pendingDelete.kind === 'skill' ? ', and cached zip' : ''} will be removed immediately. Anyone holding the share link will get a 404.
                    </p>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setPendingDelete(null)} autoFocus>Cancel</Button>
                        <Button variant="destructive" onClick={confirmDelete} className="gap-2">
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </Button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
