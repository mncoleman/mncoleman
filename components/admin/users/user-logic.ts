/**
 * Pure Users rules (no React) so `user-logic.selftest.ts` runs them under tsx: the real roles, how the list
 * is searched / filtered / ordered, what a person's access summary says, and whether a draft differs from the saved access.
 */
import { matchesQuery } from '../kit/list-logic';

export type Role = 'super_admin' | 'site_admin' | 'editor';
export type Feature = 'artifacts' | 'content' | 'library' | 'analytics' | 'rebuild';
export type RoleFilter = 'all' | Role;
export type StatusFilter = 'all' | 'active' | 'invited';

export interface ManagedUser {
    id: string;
    username: string;
    method: 'telegram' | 'email';
    email: string | null;
    sub: string | null;
    firstName: string | null;
    status: 'invited' | 'active';
    role: Role;
    features: Feature[];
    artifactGrants: string[];
    invitedAt: string;
    claimedAt: string | null;
    googleLinked?: boolean;
    photoUrl?: string | null;
}

export interface Access { role: 'site_admin' | 'editor'; features: Feature[]; artifactGrants: string[] }
export const EMPTY_ACCESS: Access = { role: 'editor', features: [], artifactGrants: [] };

/** Plain names for the five features (what each lets an editor do). */
export const FEATURE_INFO: Record<Feature, { label: string; hint: string }> = {
    content: { label: 'Posts, projects and resources', hint: 'Write and publish site content' },
    artifacts: { label: 'Artifacts', hint: 'Upload, edit and delete every artifact' },
    library: { label: 'AI Library', hint: 'Prompts and skills' },
    analytics: { label: 'Analytics', hint: 'See visitor numbers' },
    rebuild: { label: 'Rebuild site', hint: 'Start a fresh build of the site' },
};
export const FEATURE_ORDER: Feature[] = ['content', 'artifacts', 'library', 'analytics', 'rebuild'];

export const ROLE_LABEL: Record<Role, string> = { super_admin: 'Owner', site_admin: 'Site admin', editor: 'Editor' };
export const ROLE_OPTIONS: { value: RoleFilter; label: string }[] = [
    { value: 'all', label: 'Any role' },
    { value: 'super_admin', label: 'Owner' },
    { value: 'site_admin', label: 'Site admin' },
    { value: 'editor', label: 'Editor' },
];
export const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'invited', label: 'Invited' },
];

/** The Worker still returns the legacy role `admin` for old records; it means Site admin. */
export function normalizeRole(role: string | undefined): Role {
    return role === 'super_admin' ? 'super_admin' : role === 'editor' ? 'editor' : 'site_admin';
}

export const isOwner = (u: Pick<ManagedUser, 'role'>) => u.role === 'super_admin';

export function displayName(u: Pick<ManagedUser, 'firstName' | 'username' | 'email' | 'role'>): string {
    return u.firstName || (u.username ? `@${u.username}` : u.email || (u.role === 'super_admin' ? 'Owner' : 'Unnamed'));
}

/** The quiet line under the name: the sign-in handle or address. */
export function subLine(u: Pick<ManagedUser, 'firstName' | 'username' | 'email' | 'method'>): string {
    const handle = u.username ? `@${u.username}` : '';
    if (u.firstName) return handle || u.email || '';
    return u.method === 'telegram' ? (u.email || '') : '';
}

export function filterUsers<T extends ManagedUser>(rows: readonly T[], o: { query: string; role: RoleFilter; status: StatusFilter }): T[] {
    return rows.filter((u) =>
        (o.role === 'all' || normalizeRole(u.role) === o.role)
        && (o.status === 'all' || u.status === o.status)
        && matchesQuery([u.firstName, u.username, u.email, ROLE_LABEL[normalizeRole(u.role)]], o.query.replace(/(^|\s)@/g, '$1')));
}

/** Owner first, then active people, then pending invites; newest first inside each group. */
export function sortUsers<T extends ManagedUser>(rows: readonly T[]): T[] {
    const rank = (u: ManagedUser) => (isOwner(u) ? 0 : u.status === 'active' ? 1 : 2);
    const when = (u: ManagedUser) => Date.parse(u.claimedAt || u.invitedAt || '') || 0;
    return [...rows].sort((a, b) => rank(a) - rank(b) || when(b) - when(a));
}

export function toggleIn<T>(list: readonly T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function accessOf(u: ManagedUser): Access {
    return { role: normalizeRole(u.role) === 'editor' ? 'editor' : 'site_admin', features: u.features, artifactGrants: u.artifactGrants };
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/** True when the draft access differs from the saved one (order does not matter). */
export function accessChanged(saved: Access, draft: Access): boolean {
    if (saved.role !== draft.role) return true;
    if (draft.role === 'site_admin') return false; // a site admin has everything, whatever the lists hold
    return !same(saved.features, draft.features) || !same(saved.artifactGrants, draft.artifactGrants);
}

/** "Editor · Posts, projects and resources · Edits: Trip"; for the invite confirmation and tooltips. */
export function accessSummary(u: Pick<ManagedUser, 'role' | 'features' | 'artifactGrants'>, nameOf: (slug: string) => string = (s) => s): string {
    const role = normalizeRole(u.role);
    if (role === 'super_admin') return 'Owner';
    if (role === 'site_admin') return 'Site admin';
    const parts: string[] = u.features.map((f) => FEATURE_INFO[f]?.label ?? f);
    if (!u.features.includes('artifacts') && u.artifactGrants.length) parts.push(`Edits: ${u.artifactGrants.map(nameOf).join(', ')}`);
    return `Editor${parts.length ? ` · ${parts.join(' · ')}` : ' · no access yet'}`;
}

/** Only a site admin or editor can be edited; the owner and your own row are protected. */
export function canRemove(u: Pick<ManagedUser, 'id' | 'role'>, selfId?: string): boolean {
    return u.role !== 'super_admin' && u.id !== 'owner' && u.id !== selfId;
}

/**
 * The line under a person's name in the list: how they sign in, what they can do, and the Google address a Telegram
 * user also signs in with. The owner's access is just "Owner", which the role pill already says, so it is left out.
 */
export function rowSubtitle(u: ManagedUser, nameOf: (slug: string) => string = (s) => s): string {
    const name = displayName(u);
    const who = subLine(u) || (u.email && u.email !== name ? u.email : '');
    const access = isOwner(u) ? '' : accessSummary(u, nameOf);
    const google = u.method === 'telegram' && u.email && !isOwner(u) ? `Google: ${u.email}` : '';
    return [who, access, google].filter(Boolean).join(' · ');
}
