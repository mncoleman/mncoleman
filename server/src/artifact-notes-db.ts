import { Database } from 'bun:sqlite';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

/**
 * Notes and Claude links for instant artifacts, in bun:sqlite.
 *
 * Lives on the artifacts_data volume and opens lazily: nothing touches the file
 * at import, and only this one Bun process ever writes it.
 *
 * A NOTE is left in edit mode on one or more elements of an artifact.
 *   kind 'comment' is for people and is never handed to Claude.
 *   kind 'claude' is delivered to whoever holds the artifact's link.
 * Delivery is claim-once (`delivered_at`), so two polls never both get the
 * same note. A note whose session died after the claim stays `open` in the
 * panel, and "Send again" clears `delivered_at`.
 *
 * A LINK ties one artifact to one person's Claude session for two hours. The
 * token the session holds names the link's `nonce`; deleting the row (unlink,
 * or a new link replacing it) is what revokes the token, because the service
 * cannot see the Worker's KV and would otherwise honour a token until expiry.
 */

const DB_PATH = resolve(
    process.env.NOTES_DB_PATH || `${process.env.STORAGE_ROOT || '/data'}/artifact-notes.db`
);

let _db: Database | null = null;

function db(): Database {
    if (_db) return _db;
    const d = new Database(DB_PATH, { create: true });
    d.exec('PRAGMA journal_mode = WAL;');
    d.exec('PRAGMA busy_timeout = 5000;');
    d.exec(`
        CREATE TABLE IF NOT EXISTS artifact_notes (
            id           TEXT PRIMARY KEY,
            slug         TEXT NOT NULL,
            kind         TEXT NOT NULL CHECK (kind IN ('comment','claude')),
            body         TEXT NOT NULL,
            targets      TEXT NOT NULL,
            sha          TEXT NOT NULL,
            author_id    TEXT NOT NULL,
            author_name  TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
            created_at   INTEGER NOT NULL,
            delivered_at INTEGER,
            resolved_at  INTEGER,
            resolved_by  TEXT
        );
        CREATE INDEX IF NOT EXISTS artifact_notes_slug ON artifact_notes (slug, status, created_at);
        CREATE TABLE IF NOT EXISTS artifact_links (
            slug         TEXT PRIMARY KEY,
            nonce        TEXT NOT NULL,
            user_id      TEXT NOT NULL,
            user_name    TEXT NOT NULL,
            created_at   INTEGER NOT NULL,
            expires_at   INTEGER NOT NULL,
            last_seen_at INTEGER
        );
    `);
    _db = d;
    return d;
}

export type NoteKind = 'comment' | 'claude';

export interface NoteTarget {
    cssPath: string;
    tag: string;
    quote: { prefix?: string; exact: string; suffix?: string };
    start?: number;
    end?: number;
}

export interface NoteRow {
    id: string;
    slug: string;
    kind: NoteKind;
    body: string;
    targets: NoteTarget[];
    sha: string;
    authorId: string;
    authorName: string;
    status: 'open' | 'resolved';
    createdAt: number;
    deliveredAt: number | null;
    resolvedAt: number | null;
    resolvedBy: string | null;
}

function toNote(r: any): NoteRow {
    let targets: NoteTarget[] = [];
    try { targets = JSON.parse(r.targets); } catch { /* a malformed row still lists */ }
    return {
        id: r.id,
        slug: r.slug,
        kind: r.kind,
        body: r.body,
        targets,
        sha: r.sha,
        authorId: r.author_id,
        authorName: r.author_name,
        status: r.status,
        createdAt: r.created_at,
        deliveredAt: r.delivered_at ?? null,
        resolvedAt: r.resolved_at ?? null,
        resolvedBy: r.resolved_by ?? null,
    };
}

export function addNote(input: {
    slug: string; kind: NoteKind; body: string; targets: NoteTarget[]; sha: string;
    authorId: string; authorName: string;
}): NoteRow {
    const id = randomUUID();
    db().query(
        `INSERT INTO artifact_notes (id, slug, kind, body, targets, sha, author_id, author_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.slug, input.kind, input.body, JSON.stringify(input.targets), input.sha,
        input.authorId, input.authorName, Date.now());
    return getNote(id)!;
}

export function getNote(id: string): NoteRow | null {
    const r = db().query('SELECT * FROM artifact_notes WHERE id = ?').get(id);
    return r ? toNote(r) : null;
}

export function listNotes(slug: string, includeResolved = false): NoteRow[] {
    const sql = includeResolved
        ? 'SELECT * FROM artifact_notes WHERE slug = ? ORDER BY created_at DESC LIMIT 200'
        : "SELECT * FROM artifact_notes WHERE slug = ? AND status = 'open' ORDER BY created_at DESC";
    return db().query(sql).all(slug).map(toNote);
}

export function openClaudeNoteCount(slug: string): number {
    const r = db().query(
        "SELECT COUNT(*) AS n FROM artifact_notes WHERE slug = ? AND kind = 'claude' AND status = 'open' AND delivered_at IS NULL"
    ).get(slug) as { n: number };
    return r.n;
}

/** Claim the oldest undelivered Claude note. One statement, so two polls cannot both win it. */
export function takeNextNote(slug: string): NoteRow | null {
    const r = db().query(
        `UPDATE artifact_notes SET delivered_at = ?
         WHERE id = (
             SELECT id FROM artifact_notes
             WHERE slug = ? AND kind = 'claude' AND status = 'open' AND delivered_at IS NULL
             ORDER BY created_at ASC LIMIT 1
         )
         RETURNING *`
    ).get(Date.now(), slug);
    return r ? toNote(r) : null;
}

export function setNoteStatus(slug: string, id: string, status: 'open' | 'resolved', by: string): boolean {
    const res = status === 'resolved'
        ? db().query("UPDATE artifact_notes SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ? AND slug = ?")
            .run(Date.now(), by, id, slug)
        // Reopening also makes it deliverable again.
        : db().query("UPDATE artifact_notes SET status = 'open', resolved_at = NULL, resolved_by = NULL, delivered_at = NULL WHERE id = ? AND slug = ?")
            .run(id, slug);
    return res.changes > 0;
}

export function redeliverNote(slug: string, id: string): boolean {
    return db().query("UPDATE artifact_notes SET delivered_at = NULL WHERE id = ? AND slug = ? AND status = 'open'")
        .run(id, slug).changes > 0;
}

export function deleteNote(slug: string, id: string): boolean {
    return db().query('DELETE FROM artifact_notes WHERE id = ? AND slug = ?').run(id, slug).changes > 0;
}

export function deleteNotesForSlug(slug: string): void {
    db().query('DELETE FROM artifact_notes WHERE slug = ?').run(slug);
    db().query('DELETE FROM artifact_links WHERE slug = ?').run(slug);
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

export interface LinkRow {
    slug: string;
    nonce: string;
    userId: string;
    userName: string;
    createdAt: number;
    expiresAt: number;
    lastSeenAt: number | null;
}

function toLink(r: any): LinkRow {
    return {
        slug: r.slug,
        nonce: r.nonce,
        userId: r.user_id,
        userName: r.user_name,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        lastSeenAt: r.last_seen_at ?? null,
    };
}

/** The artifact's live link, or null. An expired row is dropped on read. */
export function getLink(slug: string): LinkRow | null {
    const r = db().query('SELECT * FROM artifact_links WHERE slug = ?').get(slug);
    if (!r) return null;
    const link = toLink(r);
    if (link.expiresAt <= Date.now()) {
        db().query('DELETE FROM artifact_links WHERE slug = ? AND nonce = ?').run(slug, link.nonce);
        return null;
    }
    return link;
}

/** One link per artifact: a new one replaces (and so revokes) whatever was there. */
export function createLink(slug: string, userId: string, userName: string, ttlMs: number): LinkRow {
    const nonce = randomBytes(18).toString('base64url');
    const now = Date.now();
    db().query(
        `INSERT INTO artifact_links (slug, nonce, user_id, user_name, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET nonce = excluded.nonce, user_id = excluded.user_id,
             user_name = excluded.user_name, created_at = excluded.created_at,
             expires_at = excluded.expires_at, last_seen_at = NULL`
    ).run(slug, nonce, userId, userName, now, now + ttlMs);
    return getLink(slug)!;
}

/** Drop every link `userId` holds except on `keep` slugs. Returns how many ended. */
export function removeLinksForUser(userId: string, keep: string[]): number {
    const rows = db().query('SELECT slug FROM artifact_links WHERE user_id = ?').all(userId) as { slug: string }[];
    let n = 0;
    for (const r of rows) {
        if (!keep.includes(r.slug)) n += db().query('DELETE FROM artifact_links WHERE slug = ? AND user_id = ?').run(r.slug, userId).changes;
    }
    return n;
}

export function countOpenNotes(slug: string): number {
    return (db().query("SELECT COUNT(*) AS n FROM artifact_notes WHERE slug = ? AND status = 'open'").get(slug) as { n: number }).n;
}

export function removeLink(slug: string): boolean {
    return db().query('DELETE FROM artifact_links WHERE slug = ?').run(slug).changes > 0;
}

/** Is this nonce still the artifact's live link? */
export function linkIsLive(slug: string, nonce: string): boolean {
    const link = getLink(slug);
    return !!link && link.nonce === nonce;
}

export function touchLink(slug: string, nonce: string): void {
    db().query('UPDATE artifact_links SET last_seen_at = ? WHERE slug = ? AND nonce = ?').run(Date.now(), slug, nonce);
}
