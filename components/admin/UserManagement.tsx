'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Search, UserPlus, Trash2, Shield, Clock, AlertTriangle, Mail, Pencil, X, Check } from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';
import { FEATURE_LABELS, type AdminFeature } from '@/components/admin/admin-context';

interface UserManagementProps {
    workerUrl: string;
}

type Role = 'super_admin' | 'site_admin' | 'editor';

interface AdminUser {
    id: string;
    username: string;
    method: 'telegram' | 'email';
    email: string | null;
    sub: string | null;
    firstName: string | null;
    status: 'invited' | 'active';
    role: Role;
    features: AdminFeature[];
    artifactGrants: string[];
    invitedAt: string;
    claimedAt: string | null;
    googleLinked?: boolean;
    photoUrl?: string | null;
}

interface LookupResult {
    found: boolean;
    username: string;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
}

interface InstantArtifact {
    slug: string;
    name: string;
    visibility: 'public' | 'private';
}

interface Access {
    role: 'site_admin' | 'editor';
    features: AdminFeature[];
    artifactGrants: string[];
}

const FEATURES = Object.keys(FEATURE_LABELS) as AdminFeature[];
const EMPTY_ACCESS: Access = { role: 'editor', features: [], artifactGrants: [] };

/**
 * Avatar that renders the Telegram profile photo when available and gracefully
 * falls back to `children` (initials / role icon) when there is no URL OR when
 * the image fails to load (expired Telegram file URL, CORS, 404, etc.).
 */
function Avatar({
    src,
    alt,
    imgClassName,
    fallbackClassName,
    children,
}: {
    src?: string | null;
    alt?: string | null;
    imgClassName: string;
    fallbackClassName: string;
    children: React.ReactNode;
}) {
    // Track the specific URL that failed rather than a boolean, so a new `src`
    // is retried automatically on the next render without needing an effect.
    const [erroredSrc, setErroredSrc] = useState<string | null>(null);

    if (src && erroredSrc !== src) {
        return (
            <img
                src={src}
                alt={alt || ''}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setErroredSrc(src)}
                className={imgClassName}
            />
        );
    }
    return <div className={fallbackClassName}>{children}</div>;
}

/** Role, features and artifact grants, shared by the add form and the edit panel. */
function AccessEditor({
    value,
    onChange,
    artifacts,
}: {
    value: Access;
    onChange: (next: Access) => void;
    artifacts: InstantArtifact[];
}) {
    const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
    return (
        <div className="space-y-3 text-sm">
            <div className="flex gap-2">
                {(['site_admin', 'editor'] as const).map((r) => (
                    <button
                        key={r}
                        type="button"
                        onClick={() => onChange({ ...value, role: r })}
                        className={`px-3 py-1.5 rounded-md border text-xs font-medium ${value.role === r ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-muted'}`}
                    >
                        {r === 'site_admin' ? 'Site admin' : 'Content editor'}
                    </button>
                ))}
            </div>
            {value.role === 'site_admin' ? (
                <p className="text-xs text-muted-foreground">
                    Every feature and every artifact, including artifact visibility and passwords. Cannot manage users.
                </p>
            ) : (
                <>
                    <div>
                        <p className="text-xs font-medium mb-1.5">Site features</p>
                        <div className="grid sm:grid-cols-2 gap-1.5">
                            {FEATURES.map((f) => (
                                <label key={f} className="flex items-center gap-2 text-xs">
                                    <input
                                        type="checkbox"
                                        checked={value.features.includes(f)}
                                        onChange={() => onChange({ ...value, features: toggle(value.features, f) })}
                                    />
                                    {FEATURE_LABELS[f]}
                                </label>
                            ))}
                        </div>
                    </div>
                    {!value.features.includes('artifacts') && (
                        <div>
                            <p className="text-xs font-medium mb-1">Artifacts they can edit</p>
                            <p className="text-xs text-muted-foreground mb-1.5">
                                Edit mode and Claude linking on these only. Private ones still need their password to open, and editors never change visibility or passwords.
                            </p>
                            {artifacts.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">No instant artifacts yet.</p>
                            ) : (
                                <div className="max-h-48 overflow-y-auto rounded-md border border-border/50 p-2 grid sm:grid-cols-2 gap-1.5" data-lenis-prevent>
                                    {artifacts.map((a) => (
                                        <label key={a.slug} className="flex items-center gap-2 text-xs min-w-0">
                                            <input
                                                type="checkbox"
                                                checked={value.artifactGrants.includes(a.slug)}
                                                onChange={() => onChange({ ...value, artifactGrants: toggle(value.artifactGrants, a.slug) })}
                                            />
                                            <span className="truncate">{a.name}</span>
                                            {a.name !== a.slug && <span className="text-[10px] text-muted-foreground shrink-0">{a.slug}</span>}
                                            {a.visibility === 'private' && <span className="text-[10px] text-amber-600 shrink-0">private</span>}
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function accessSummary(u: AdminUser, artifacts: InstantArtifact[]): string {
    if (u.role === 'super_admin') return 'Owner';
    if (u.role === 'site_admin') return 'Site admin';
    const parts = u.features.map((f) => FEATURE_LABELS[f].split(' (')[0]);
    if (!u.features.includes('artifacts') && u.artifactGrants.length) {
        const names = u.artifactGrants.map((s) => artifacts.find((a) => a.slug === s)?.name || s);
        parts.push(`Edits: ${names.join(', ')}`);
    }
    return `Editor${parts.length ? ` · ${parts.join(' · ')}` : ' · no access yet'}`;
}

export function UserManagement({ workerUrl }: UserManagementProps) {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [artifacts, setArtifacts] = useState<InstantArtifact[]>([]);
    const [loading, setLoading] = useState(true);
    const [method, setMethod] = useState<'telegram' | 'email'>('telegram');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [searching, setSearching] = useState(false);
    const [lookup, setLookup] = useState<LookupResult | null>(null);
    const [newAccess, setNewAccess] = useState<Access>(EMPTY_ACCESS);
    const [inviting, setInviting] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string; access: Access; email: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchUsers();
        fetchArtifacts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${workerUrl}/api/users`, { headers: authHeaders(), credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
            }
        } catch {
            // Silently fail
        } finally {
            setLoading(false);
        }
    };

    const fetchArtifacts = async () => {
        try {
            const res = await fetch(`${workerUrl}/api/artifacts/instant/list`, { headers: authHeaders(), credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setArtifacts((data.artifacts || []).map((a: InstantArtifact) => ({ slug: a.slug, name: a.name, visibility: a.visibility })));
            }
        } catch {
            // The grant picker just shows nothing.
        }
    };

    const errorText = async (res: Response, fallback: string) => {
        const text = await res.text();
        try { return JSON.parse(text).error || fallback; } catch { return text || fallback; }
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;

        setSearching(true);
        setLookup(null);
        setMessage(null);

        try {
            const clean = username.trim().replace(/^@/, '');
            const res = await fetch(`${workerUrl}/api/users/lookup?username=${encodeURIComponent(clean)}`, {
                headers: authHeaders(),
                credentials: 'include',
            });

            if (res.status === 409) {
                setMessage({ type: 'error', text: 'This user has already been invited.' });
                return;
            }
            if (!res.ok) throw new Error(await errorText(res, 'Lookup failed'));

            setLookup(await res.json());
            setNewAccess(EMPTY_ACCESS);
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setSearching(false);
        }
    };

    const invite = async (body: Record<string, unknown>) => {
        setInviting(true);
        setMessage(null);
        try {
            const res = await fetch(`${workerUrl}/api/users`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify({ ...body, ...newAccess }),
            });
            if (!res.ok) throw new Error(await errorText(res, 'Failed to add user'));
            const data = await res.json();
            setUsers((prev) => [...prev, data.user]);
            setUsername('');
            setEmail('');
            setLookup(null);
            setNewAccess(EMPTY_ACCESS);
            setMessage({
                type: 'success',
                text: data.user.method === 'email'
                    ? `Added ${data.user.email}. They sign in with Google using that address.`
                    : `Invited @${data.user.username}. They sign in with Telegram.`,
            });
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setInviting(false);
        }
    };

    const handleRemove = async (id: string) => {
        setRemoving(id);
        setMessage(null);
        try {
            const res = await fetch(`${workerUrl}/api/users?id=${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: authHeaders(),
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Failed to remove user');
            setUsers((prev) => prev.filter((u) => u.id !== id));
            setMessage({ type: 'success', text: `Removed ${id}` });
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setRemoving(null);
        }
    };

    const saveEdit = async () => {
        if (!editing) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`${workerUrl}/api/users`, {
                method: 'PATCH',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify({ id: editing.id, ...editing.access, email: editing.email.trim() || null }),
            });
            if (!res.ok) throw new Error(await errorText(res, 'Failed to save'));
            const data = await res.json();
            setUsers((prev) => prev.map((u) => (u.id === editing.id ? { ...u, ...data.user } : u)));
            setEditing(null);
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                    Add people by Telegram username or by email (they sign in with Google). Everyone else is a viewer.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-1 text-sm">
                    {(['telegram', 'email'] as const).map((m) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => { setMethod(m); setLookup(null); setMessage(null); }}
                            className={`px-3 py-1.5 rounded-md ${method === m ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                            {m === 'telegram' ? 'Telegram' : 'Email (Google)'}
                        </button>
                    ))}
                </div>

                {method === 'email' ? (
                    <div className="p-4 rounded-lg border border-border/50 space-y-3">
                        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" type="email" />
                        <AccessEditor value={newAccess} onChange={setNewAccess} artifacts={artifacts} />
                        <Button
                            size="sm"
                            onClick={() => invite({ method: 'email', email: email.trim() })}
                            disabled={inviting || !email.trim()}
                            className="gap-1.5"
                        >
                            {inviting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                            Add by email
                        </Button>
                    </div>
                ) : !lookup ? (
                    <form onSubmit={handleSearch} className="flex gap-2">
                        <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" className="flex-1" />
                        <Button type="submit" disabled={searching || !username.trim()} className="gap-2 shrink-0">
                            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            Search
                        </Button>
                    </form>
                ) : (
                    <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3">
                        <div className="flex items-center gap-3">
                            <Avatar
                                src={lookup.photoUrl}
                                alt={lookup.username}
                                imgClassName="h-12 w-12 rounded-full object-cover bg-muted"
                                fallbackClassName="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-lg font-semibold text-muted-foreground"
                            >
                                {(lookup.firstName || lookup.username)[0]?.toUpperCase()}
                            </Avatar>
                            <div>
                                {lookup.found ? (
                                    <>
                                        <p className="font-medium">
                                            {lookup.firstName}{lookup.lastName ? ` ${lookup.lastName}` : ''}
                                        </p>
                                        <p className="text-sm text-muted-foreground">@{lookup.username}</p>
                                    </>
                                ) : (
                                    <>
                                        <p className="font-medium">@{lookup.username}</p>
                                        <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" />
                                            Not verified — user may need to message the bot first
                                        </p>
                                    </>
                                )}
                            </div>
                        </div>
                        <AccessEditor value={newAccess} onChange={setNewAccess} artifacts={artifacts} />
                        <div className="flex gap-2">
                            <Button size="sm" onClick={() => invite({ method: 'telegram', username: lookup.username })} disabled={inviting} className="gap-1.5">
                                {inviting ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                                Confirm Invite
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => { setLookup(null); setUsername(''); }}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                )}

                {message && (
                    <div className={`p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {message.text}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="animate-spin h-4 w-4" /> Loading...
                    </div>
                ) : (
                    <div className="space-y-2">
                        {users.map((user) => {
                            const isOwner = user.role === 'super_admin';
                            const label = user.username ? `@${user.username}` : user.email || user.firstName || 'Owner';
                            const isEditing = editing?.id === user.id;
                            return (
                                <div key={user.id} className="p-3 rounded-lg border border-border/50 bg-background/50 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Avatar
                                                src={user.photoUrl}
                                                alt={label}
                                                imgClassName="h-8 w-8 rounded-full object-cover shrink-0 bg-muted"
                                                fallbackClassName="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0"
                                            >
                                                {isOwner ? (
                                                    <Shield className="h-4 w-4 text-primary" />
                                                ) : user.status === 'invited' ? (
                                                    <Clock className="h-4 w-4 text-amber-500" />
                                                ) : (
                                                    <span className="text-xs font-semibold text-muted-foreground">
                                                        {(user.firstName || label.replace('@', '') || '?')[0]?.toUpperCase()}
                                                    </span>
                                                )}
                                            </Avatar>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">
                                                    {label}
                                                    {user.firstName && user.firstName !== label && (
                                                        <span className="text-muted-foreground font-normal ml-2">{user.firstName}</span>
                                                    )}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {isOwner ? 'Owner' : `${user.status === 'invited' ? 'Invited' : 'Active'} · ${accessSummary(user, artifacts)}`}
                                                    {!isOwner && user.method === 'telegram' && user.email && ` · Google: ${user.email}`}
                                                </p>
                                            </div>
                                        </div>
                                        {!isOwner && (
                                            <div className="flex shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setEditing(isEditing ? null : {
                                                        id: user.id,
                                                        email: user.email || '',
                                                        access: {
                                                            role: user.role === 'editor' ? 'editor' : 'site_admin',
                                                            features: user.features,
                                                            artifactGrants: user.artifactGrants,
                                                        },
                                                    })}
                                                    className="h-8 w-8 p-0"
                                                    aria-label={isEditing ? 'Close' : 'Edit access'}
                                                >
                                                    {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemove(user.id)}
                                                    disabled={removing === user.id}
                                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                    aria-label="Remove"
                                                >
                                                    {removing === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                    {isEditing && editing && (
                                        <div className="space-y-3 border-t border-border/40 pt-3">
                                            {user.method === 'telegram' && (
                                                <div>
                                                    <p className="text-xs font-medium mb-1">Google sign-in email (optional)</p>
                                                    <Input
                                                        value={editing.email}
                                                        onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                                                        placeholder="Also let them sign in with Google"
                                                        type="email"
                                                    />
                                                </div>
                                            )}
                                            <AccessEditor
                                                value={editing.access}
                                                onChange={(access) => setEditing({ ...editing, access })}
                                                artifacts={artifacts}
                                            />
                                            <Button size="sm" onClick={saveEdit} disabled={saving} className="gap-1.5">
                                                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                                Save
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
