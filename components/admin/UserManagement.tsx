'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Clock, Loader2, Mail, RefreshCw, Search, Trash2, UserPlus, Users as UsersIcon, Zap, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { authHeaders } from '@/lib/admin-auth';
import { Avatar } from '@/components/admin/fields/UserSelect';
import { AccessFields, type InstantArtifact } from '@/components/admin/users/AccessFields';
import {
    AdminPage, Cell, ColumnHeader, DataList, DataRow, EmptyState, HeaderSpacer, ListFooter, ListSkeleton, NewButton, PageHeader, PropDivider, PropNote, PropRow,
    PropertiesDrawer, SearchField, SegmentedFilter, SelectMenu, StatusPill, notify, useListKeyboard, usePropertiesDrawer, type DrawerApi,
} from '@/components/admin/kit';
import { relativeTime } from '@/components/admin/artifacts/artifact-logic';
import {
    EMPTY_ACCESS, ROLE_LABEL, ROLE_OPTIONS, STATUS_FILTER_OPTIONS, accessChanged, accessOf, accessSummary, canRemove, displayName, filterUsers, isOwner, normalizeRole,
    rowSubtitle, sortUsers, subLine, type Access, type ManagedUser, type RoleFilter, type StatusFilter,
} from '@/components/admin/users/user-logic';

/**
 * Users (owner only): the same list page as the other sections. A row opens a side sheet (the Properties drawer) with the
 * person's role, the features they can use and the artifacts they may edit, plus remove access. Invite someone is a dialog
 * (Telegram username lookup or a Google email). The owner is protected: no role change, no removal. Nothing here is staged;
 * every change is saved straight to the Worker.
 */

interface LookupResult { found: boolean; username: string; firstName: string | null; lastName: string | null; photoUrl: string | null }

const COLS = 'minmax(0,1fr) 120px 110px 150px';
const ROLE_PILL = { super_admin: 'violet', site_admin: 'info', editor: 'ok' } as const;

/** "Invited 2d ago" / "Invited just now". */
const invitedLabel = (iso: string) => {
    const t = relativeTime(iso);
    return t ? `Invited ${t === 'Just now' ? 'just now' : t}` : 'Invited';
};

async function errorText(res: Response, fallback: string) {
    const text = await res.text();
    try { return JSON.parse(text).error || fallback; } catch { return text || fallback; }
}

export function UserManagement({ workerUrl, selfId }: { workerUrl: string; selfId?: string }) {
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [artifacts, setArtifacts] = useState<InstantArtifact[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [role, setRole] = useState<RoleFilter>('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [inviting, setInviting] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${workerUrl}/api/users`, { headers: authHeaders(), credentials: 'include' });
            if (!res.ok) throw new Error(await errorText(res, `Could not load users (${res.status})`));
            const data = await res.json();
            setUsers(data.users || []);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Could not load users');
        } finally {
            setLoading(false);
        }
    }, [workerUrl]);

    const fetchArtifacts = useCallback(async () => {
        try {
            const res = await fetch(`${workerUrl}/api/artifacts/instant/list`, { headers: authHeaders(), credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setArtifacts((data.artifacts || []).map((a: InstantArtifact) => ({ slug: a.slug, name: a.name, visibility: a.visibility })));
            }
        } catch { /* the grant list just shows nothing */ }
    }, [workerUrl]);

    useEffect(() => { void fetchUsers(); void fetchArtifacts(); }, [fetchUsers, fetchArtifacts]);

    const visible = useMemo(() => sortUsers(filterUsers(users, { query, role, status })), [users, query, role, status]);
    const selected = users.find((u) => u.id === selectedId) || null;

    // The side sheet: the Properties drawer, opened by a row. It never remembers its state (that would change how the editors' drawers start).
    const base = usePropertiesDrawer({ enabled: !!selected, id: 'user-props' });
    const { open: baseOpen, setOpen: baseSetOpen } = base;
    const drawer: DrawerApi = {
        ...base,
        open: !!selected && base.open,
        setOpen: (open) => { baseSetOpen(open, false); if (!open) setSelectedId(null); },
        toggle: () => { baseSetOpen(false, false); setSelectedId(null); },
    };
    useEffect(() => { if (selectedId && !baseOpen) setSelectedId(null); }, [selectedId, baseOpen]);
    const openUser = (id: string) => { setSelectedId(id); baseSetOpen(true, false); };

    useListKeyboard({ searchRef, listRef, onNew: () => setInviting(true), enabled: !loading && !selected });
    const nameOf = useCallback((slug: string) => artifacts.find((a) => a.slug === slug)?.name || slug, [artifacts]);

    return (
        <div className="flex h-full min-h-0">
            <main data-drawer-inert className="min-w-0 flex-1 overflow-y-auto" data-lenis-prevent>
                <div className="mx-auto w-full max-w-6xl p-4 md:p-8">
                    <AdminPage>
                        <PageHeader title="Users">
                            <SearchField ref={searchRef} value={query} onChange={setQuery} placeholder="Search people…" />
                            <SegmentedFilter label="Show" value={status} onChange={setStatus} options={STATUS_FILTER_OPTIONS} />
                            <SelectMenu label="Role" value={role} onChange={(v) => setRole(v as RoleFilter)} options={ROLE_OPTIONS} />
                            <HeaderSpacer />
                            <NewButton onClick={() => setInviting(true)} title="Invite someone (N)">Invite someone</NewButton>
                        </PageHeader>

                        {error && users.length === 0 ? (
                            <EmptyState title="Could not load users" body={<span className="text-red-600">{error}</span>} action={<Button size="sm" variant="outline" onClick={() => void fetchUsers()} className="gap-1.5"><RefreshCw size={13} /> Try again</Button>} />
                        ) : loading && users.length === 0 ? (
                            <ListSkeleton cols={COLS} />
                        ) : visible.length === 0 ? (
                            <EmptyState
                                icon={<UsersIcon size={20} />}
                                title={users.length === 0 ? 'No one here yet' : 'Nothing matches'}
                                body={users.length === 0 ? 'Invite someone to give them access.' : 'Try a different search or filter.'}
                                action={users.length > 0 ? <Button size="sm" variant="outline" onClick={() => { setQuery(''); setStatus('all'); setRole('all'); }}>Clear filters</Button> : undefined}
                            />
                        ) : (
                            <div ref={listRef}>
                                <DataList cols={COLS} label="People">
                                    <ColumnHeader labels={['Person', 'Role', 'Status', 'Joined']} />
                                    {visible.map((u) => {
                                        const r = normalizeRole(u.role);
                                        const name = displayName(u);
                                        return (
                                            <DataRow key={u.id} onOpen={() => openUser(u.id)} label={`Open ${name}`} active={u.id === selectedId}>
                                                <div className="flex min-w-0 items-center gap-3 max-[699px]:basis-full">
                                                    <Avatar name={name} size={36} photoUrl={u.photoUrl} />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap text-[15px] font-medium">
                                                            <span className="truncate">{name}</span>
                                                            {(u.id === selfId || isOwner(u)) && <span className="shrink-0 text-xs font-normal text-muted-foreground">(you)</span>}
                                                        </div>
                                                        <div className="mt-px truncate text-xs text-muted-foreground">{rowSubtitle(u, nameOf)}</div>
                                                    </div>
                                                </div>
                                                <Cell><StatusPill tone={ROLE_PILL[r]}>{ROLE_LABEL[r]}</StatusPill></Cell>
                                                <Cell><StatusPill tone={u.status === 'active' ? 'ok' : 'info'}>{u.status === 'active' ? 'Active' : 'Invited'}</StatusPill></Cell>
                                                <Cell className="tabular-nums">{isOwner(u) ? 'Owner' : u.claimedAt ? relativeTime(u.claimedAt) : invitedLabel(u.invitedAt)}</Cell>
                                            </DataRow>
                                        );
                                    })}
                                </DataList>
                            </div>
                        )}
                        {!loading && users.length > 0 && <ListFooter shown={visible.length} loaded={users.length} note="Last seen is not recorded yet" />}
                    </AdminPage>
                </div>
            </main>

            <PropertiesDrawer drawer={drawer} label="Person">
                {selected && (
                    <UserSheet
                        key={selected.id}
                        user={selected}
                        selfId={selfId}
                        artifacts={artifacts}
                        nameOf={nameOf}
                        workerUrl={workerUrl}
                        onSaved={(next) => setUsers((prev) => prev.map((u) => (u.id === next.id ? { ...u, ...next } : u)))}
                        onRemoved={(id) => { setUsers((prev) => prev.filter((u) => u.id !== id)); setSelectedId(null); baseSetOpen(false, false); }}
                    />
                )}
            </PropertiesDrawer>

            <InviteDialog
                open={inviting}
                onOpenChange={setInviting}
                workerUrl={workerUrl}
                artifacts={artifacts}
                onInvited={(u, text) => { setUsers((prev) => [...prev, u]); notify(text); }}
            />
        </div>
    );
}

/* ------------------------------- the side sheet ------------------------------- */

function UserSheet({ user, selfId, artifacts, nameOf, workerUrl, onSaved, onRemoved }: {
    user: ManagedUser; selfId?: string; artifacts: InstantArtifact[]; nameOf: (slug: string) => string; workerUrl: string;
    onSaved: (u: ManagedUser) => void; onRemoved: (id: string) => void;
}) {
    const owner = isOwner(user);
    const name = displayName(user);
    const savedAccess = useMemo(() => accessOf(user), [user]);
    const [access, setAccess] = useState<Access>(savedAccess);
    const [email, setEmail] = useState(user.email || '');
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const dirty = accessChanged(savedAccess, access) || (user.method === 'telegram' && email.trim() !== (user.email || ''));
    const removable = canRemove(user, selfId);

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`${workerUrl}/api/users`, {
                method: 'PATCH',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify({ id: user.id, ...access, email: email.trim() || null }),
            });
            if (!res.ok) throw new Error(await errorText(res, 'Could not save'));
            const data = await res.json();
            onSaved({ ...user, ...data.user });
            notify('Saved.');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Could not save');
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        setRemoving(true);
        setError(null);
        try {
            const res = await fetch(`${workerUrl}/api/users?id=${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: authHeaders(), credentials: 'include' });
            if (!res.ok) throw new Error(await errorText(res, 'Could not remove'));
            notify(user.status === 'invited' ? `Invite for ${name} revoked.` : `${name} no longer has access.`);
            onRemoved(user.id);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Could not remove');
            setConfirmRemove(false);
        } finally {
            setRemoving(false);
        }
    };

    return (
        <div className="pb-4">
            <div className="flex items-center gap-3.5 pb-4 pt-1">
                <Avatar name={name} size={52} photoUrl={user.photoUrl} />
                <div className="min-w-0">
                    <div className="truncate text-[17px] font-semibold">{name}</div>
                    <div className="truncate text-[13px] text-muted-foreground">{subLine(user) || (user.email && user.email !== name ? user.email : '')}</div>
                </div>
            </div>
            {error && <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}</div>}

            <PropRow icon={Shield} label="Role"><StatusPill tone={ROLE_PILL[normalizeRole(user.role)]}>{ROLE_LABEL[normalizeRole(user.role)]}</StatusPill></PropRow>
            <PropRow icon={Zap} label="Status"><StatusPill tone={user.status === 'active' ? 'ok' : 'info'}>{user.status === 'active' ? 'Active' : 'Invited'}</StatusPill></PropRow>
            <PropRow icon={Clock} label={user.claimedAt ? 'Joined' : 'Invited'}><span className="text-sm text-muted-foreground">{owner ? 'Owner' : relativeTime(user.claimedAt || user.invitedAt)}</span></PropRow>
            <PropNote>Last seen is not recorded yet.</PropNote>
            <PropDivider />

            {owner ? (
                <PropNote>The owner can use everything and cannot be changed or removed here.</PropNote>
            ) : (
                <>
                    {user.method === 'telegram' && (
                        <>
                            <PropRow icon={Mail} label="Google email" stack>
                                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Also let them sign in with Google" aria-label="Google sign-in email" className="h-8 text-sm" />
                            </PropRow>
                            <PropDivider />
                        </>
                    )}
                    <AccessFields value={access} onChange={setAccess} artifacts={artifacts} idPrefix={`u-${user.id}`} />
                    <Button onClick={save} disabled={!dirty || saving} className="mt-4 h-9 w-full gap-1.5 text-[13px]">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save changes
                    </Button>
                    {removable && (
                        <>
                            <PropDivider />
                            <Button variant="outline" onClick={() => setConfirmRemove(true)} className="h-9 w-full gap-1.5 text-[13px] text-red-600 hover:text-red-600 dark:text-red-400">
                                <Trash2 size={14} /> {user.status === 'invited' ? 'Revoke invite' : 'Remove access'}
                            </Button>
                            <PropNote>{accessSummary(user, nameOf)}</PropNote>
                        </>
                    )}
                </>
            )}

            <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{user.status === 'invited' ? `Revoke the invite for ${name}?` : `Remove ${name}?`}</DialogTitle>
                        <DialogDescription>{user.status === 'invited' ? 'They will no longer be able to sign in with this invite.' : 'They can no longer sign in to the admin. You can invite them again later.'}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmRemove(false)}>Keep them</Button>
                        <Button variant="destructive" onClick={remove} disabled={removing} className="gap-1.5">
                            {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {user.status === 'invited' ? 'Revoke invite' : 'Remove'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* -------------------------------- invite dialog ------------------------------- */

function InviteDialog({ open, onOpenChange, workerUrl, artifacts, onInvited }: {
    open: boolean; onOpenChange: (o: boolean) => void; workerUrl: string; artifacts: InstantArtifact[]; onInvited: (u: ManagedUser, text: string) => void;
}) {
    const [method, setMethod] = useState<'telegram' | 'email'>('telegram');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [searching, setSearching] = useState(false);
    const [lookup, setLookup] = useState<LookupResult | null>(null);
    const [access, setAccess] = useState<Access>(EMPTY_ACCESS);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => { setUsername(''); setEmail(''); setLookup(null); setAccess(EMPTY_ACCESS); setError(null); setMethod('telegram'); };
    const change = (o: boolean) => { if (!o) reset(); onOpenChange(o); };

    const search = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;
        setSearching(true);
        setLookup(null);
        setError(null);
        try {
            const clean = username.trim().replace(/^@/, '');
            const res = await fetch(`${workerUrl}/api/users/lookup?username=${encodeURIComponent(clean)}`, { headers: authHeaders(), credentials: 'include' });
            if (res.status === 409) { setError('This person has already been invited.'); return; }
            if (!res.ok) throw new Error(await errorText(res, 'Lookup failed'));
            setLookup(await res.json());
            setAccess(EMPTY_ACCESS);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Lookup failed');
        } finally {
            setSearching(false);
        }
    };

    const invite = async (body: Record<string, unknown>) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`${workerUrl}/api/users`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify({ ...body, ...access }),
            });
            if (!res.ok) throw new Error(await errorText(res, 'Could not add them'));
            const data = await res.json();
            const u = data.user as ManagedUser;
            onInvited(u, u.method === 'email' ? `Added ${u.email}. They sign in with Google using that address.` : `Invited @${u.username}. They sign in with Telegram.`);
            change(false);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Could not add them');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={change}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Invite someone</DialogTitle>
                    <DialogDescription>Add a person by Telegram username, or by email if they sign in with Google. Everyone else is just a visitor.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-0.5" data-lenis-prevent>
                    <SegmentedFilter label="Sign in with" value={method} onChange={(m) => { setMethod(m); setLookup(null); setError(null); }} options={[{ value: 'telegram', label: 'Telegram' }, { value: 'email', label: 'Email (Google)' }]} />

                    {method === 'email' ? (
                        <div className="space-y-3">
                            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" type="email" aria-label="Email address" />
                            <AccessFields value={access} onChange={setAccess} artifacts={artifacts} idPrefix="invite-email" />
                        </div>
                    ) : !lookup ? (
                        <form onSubmit={search} className="flex gap-2">
                            <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" aria-label="Telegram username" className="flex-1" autoFocus />
                            <Button type="submit" disabled={searching || !username.trim()} className="shrink-0 gap-2">
                                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
                            </Button>
                        </form>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
                                <Avatar name={lookup.firstName || lookup.username} size={44} photoUrl={lookup.photoUrl} />
                                <div className="min-w-0">
                                    {lookup.found ? (
                                        <>
                                            <p className="truncate font-medium">{lookup.firstName}{lookup.lastName ? ` ${lookup.lastName}` : ''}</p>
                                            <p className="truncate text-sm text-muted-foreground">@{lookup.username}</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="truncate font-medium">@{lookup.username}</p>
                                            <p className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3 w-3" /> Not verified. They may need to message the bot first.</p>
                                        </>
                                    )}
                                </div>
                            </div>
                            <AccessFields value={access} onChange={setAccess} artifacts={artifacts} idPrefix="invite-tg" />
                        </div>
                    )}
                    {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</div>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => change(false)}>Cancel</Button>
                    {method === 'email' && (
                        <Button onClick={() => invite({ method: 'email', email: email.trim() })} disabled={busy || !email.trim()} className="gap-1.5">
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Add by email
                        </Button>
                    )}
                    {method === 'telegram' && lookup && (
                        <>
                            <Button variant="ghost" onClick={() => { setLookup(null); setUsername(''); }}>Search again</Button>
                            <Button onClick={() => invite({ method: 'telegram', username: lookup.username })} disabled={busy} className="gap-1.5">
                                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Send invite
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
