'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SelectField } from '@/components/admin/fields/SelectField';
import { RESOURCE_FOLDERS, type ResourceFolder, type ResourceRow } from './library-logic';

// Gates the file picker to text/code content: uploading a binary file here
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
    // No extension + no reported MIME, e.g. "Dockerfile", "Makefile".
    return !ext && !file.type;
}

function suggestResourceFolder(filename: string): ResourceFolder {
    const ext = extOf(filename);
    if (SCRIPT_EXTENSIONS.has(ext)) return 'scripts';
    if (DOC_EXTENSIONS.has(ext)) return 'references';
    return 'assets';
}

/** Reads an uploaded file as text, rejecting anything that isn't text/code, with a binary sniff (NUL byte) as a second check. */
async function readUploadedTextFile(file: globalThis.File): Promise<string> {
    const MAX_BYTES = 5 * 1024 * 1024; // matches the server's per-resource cap
    if (file.size > MAX_BYTES) throw new Error(`"${file.name}" is too large (max 5MB per file).`);
    if (!looksLikeText(file)) throw new Error(`"${file.name}" doesn't look like a text or code file. Only text files can be added here.`);
    const text = await file.text();
    if (text.includes(String.fromCharCode(0))) throw new Error(`"${file.name}" looks like a binary file. Only text files can be added here.`);
    return text;
}

const TEXT_UPLOAD_ACCEPT = Array.from(TEXT_EXTENSIONS).map((e) => `.${e}`).concat('text/*').join(',');

/** A skill's extra files (scripts, references, assets). They are saved as a full set, so additions, removals and edits land together. */
export function ResourceRowsEditor({ rows, onChange }: { rows: ResourceRow[]; onChange: (rows: ResourceRow[]) => void }) {
    const [uploadError, setUploadError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const update = (index: number, patch: Partial<ResourceRow>) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));
    const add = () => onChange([...rows, { folder: 'references', filename: '', content: '' }]);

    const handleFilesSelected = async (fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;
        setUploadError(null);
        const newRows: ResourceRow[] = [];
        for (const file of Array.from(fileList)) {
            try {
                const content = await readUploadedTextFile(file);
                const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
                newRows.push({ folder: suggestResourceFolder(file.name), filename, content });
            } catch (e: unknown) {
                setUploadError(e instanceof Error ? e.message : 'Could not read that file.');
            }
        }
        if (newRows.length > 0) onChange([...rows, ...newRows]);
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-end gap-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={TEXT_UPLOAD_ACCEPT}
                    aria-label="Choose files to add"
                    onChange={(e) => { void handleFilesSelected(e.target.files); e.target.value = ''; }}
                    className="hidden"
                />
                <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="h-8 gap-1.5 text-[13px]"><Upload className="h-3.5 w-3.5" /> Upload file</Button>
                <Button type="button" size="sm" variant="outline" onClick={add} className="h-8 gap-1.5 text-[13px]"><Plus className="h-3.5 w-3.5" /> Add file</Button>
            </div>
            {uploadError && <p role="alert" className="text-xs text-red-600">{uploadError}</p>}
            {rows.length === 0 && <p className="text-sm text-muted-foreground">No extra files yet. They are optional.</p>}
            {rows.map((row, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border/60 p-3">
                    <div className="flex items-center gap-2">
                        <SelectField
                            aria-label={`Folder for file ${i + 1}`}
                            value={row.folder}
                            onChange={(v) => update(i, { folder: v as ResourceFolder })}
                            options={RESOURCE_FOLDERS.map((f) => ({ value: f, label: `${f}/` }))}
                            className="mx-0 h-8 border border-border/60 px-2.5 font-mono text-xs"
                        />
                        <Input value={row.filename} onChange={(e) => update(i, { filename: e.target.value })} placeholder="filename.md" aria-label={`File name ${i + 1}`} className="h-8 flex-1 font-mono text-xs" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => remove(i)} aria-label={`Remove file ${i + 1}`} className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <Textarea value={row.content} onChange={(e) => update(i, { content: e.target.value })} placeholder="File contents" aria-label={`Contents of file ${i + 1}`} className="min-h-[80px] font-mono text-xs" />
                </div>
            ))}
        </div>
    );
}
