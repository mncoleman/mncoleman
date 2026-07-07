import { Database } from 'bun:sqlite';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Light "guestbook" datastore for the visitor globe, backed by bun:sqlite.
 *
 * The DB file lives inside the existing `/data` named volume (same volume the
 * artifacts use), so it survives `docker rm -f` + recreate. We open it LAZILY on
 * first query — never at import — echoing the levoair `next-sqlite-build-race`
 * lesson (no side effects at module load). Only one Bun process ever touches it,
 * so WAL + a single writer has no cross-process lock contention.
 */

const DB_PATH = resolve(
    process.env.VISITOR_DB_PATH || `${process.env.STORAGE_ROOT || '/data'}/visitors.db`
);

let _db: Database | null = null;

function db(): Database {
    if (_db) return _db;
    const d = new Database(DB_PATH, { create: true });
    d.exec('PRAGMA journal_mode = WAL;');
    d.exec('PRAGMA busy_timeout = 5000;');
    d.exec('PRAGMA synchronous = NORMAL;');
    d.exec(`
        CREATE TABLE IF NOT EXISTS visitors (
            id          TEXT PRIMARY KEY,
            lat         REAL NOT NULL,
            lng         REAL NOT NULL,
            place_label TEXT NOT NULL,
            country     TEXT,
            precision   TEXT,
            name        TEXT,
            food        TEXT,
            song        TEXT,
            fact        TEXT,
            quote       TEXT,
            ip_hash     TEXT NOT NULL,
            created_at  INTEGER NOT NULL,
            status      TEXT NOT NULL DEFAULT 'visible'
        );
    `);
    d.exec(`CREATE INDEX IF NOT EXISTS idx_visitors_created ON visitors(created_at);`);
    d.exec(`CREATE INDEX IF NOT EXISTS idx_visitors_iphash ON visitors(ip_hash);`);
    // Migrations: add columns to a pre-existing table (throws + ignored if present).
    try {
        d.exec(`ALTER TABLE visitors ADD COLUMN quote TEXT`);
    } catch {
        /* column already exists */
    }
    // Single-use submission-token nonces (burned on POST to block replay).
    d.exec(`
        CREATE TABLE IF NOT EXISTS used_nonces (
            nonce TEXT PRIMARY KEY,
            exp   INTEGER NOT NULL
        );
    `);
    _db = d;
    return d;
}

export interface VisitorInput {
    lat: number;
    lng: number;
    place_label: string;
    country?: string | null;
    precision?: string | null;
    name?: string | null;
    food?: string | null;
    song?: string | null;
    fact?: string | null;
    quote?: string | null;
    ip_hash: string;
}

export interface PublicPin {
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
}

const PIN_LIMIT = 5000;

export function listVisiblePins(): PublicPin[] {
    const rows = db()
        .query(
            `SELECT id, lat, lng, place_label, country, name, food, song, fact, quote, created_at
               FROM visitors WHERE status = 'visible'
               ORDER BY created_at DESC LIMIT ?`
        )
        .all(PIN_LIMIT) as PublicPin[];
    return rows;
}

export function insertVisitor(v: VisitorInput): PublicPin {
    const id = randomUUID();
    const created_at = Date.now();
    db()
        .query(
            `INSERT INTO visitors
                (id, lat, lng, place_label, country, precision, name, food, song, fact, quote, ip_hash, created_at, status)
             VALUES
                ($id, $lat, $lng, $place_label, $country, $precision, $name, $food, $song, $fact, $quote, $ip_hash, $created_at, 'visible')`
        )
        .run({
            $id: id,
            $lat: v.lat,
            $lng: v.lng,
            $place_label: v.place_label,
            $country: v.country ?? null,
            $precision: v.precision ?? null,
            $name: v.name ?? null,
            $food: v.food ?? null,
            $song: v.song ?? null,
            $fact: v.fact ?? null,
            $quote: v.quote ?? null,
            $ip_hash: v.ip_hash,
            $created_at: created_at,
        });
    return {
        id,
        lat: v.lat,
        lng: v.lng,
        place_label: v.place_label,
        country: v.country ?? null,
        name: v.name ?? null,
        food: v.food ?? null,
        song: v.song ?? null,
        fact: v.fact ?? null,
        quote: v.quote ?? null,
        created_at,
    };
}

/**
 * Count submissions from one IP hash since a cutoff. This is a coarse *flood
 * ceiling*, deliberately generous — NOT a per-person cap. Many distinct people
 * legitimately share one NAT/CGNAT IP (offices, campuses, phone networks), so a
 * tight per-IP cap would wrongly block real visitors (fable's top catch).
 */
export function countByIpSince(ip_hash: string, sinceMs: number): number {
    const row = db()
        .query(`SELECT COUNT(*) AS n FROM visitors WHERE ip_hash = ? AND created_at >= ?`)
        .get(ip_hash, sinceMs) as { n: number } | null;
    return row?.n ?? 0;
}

/**
 * Has this same device/IP already dropped a pin very near this spot recently?
 * Stops one person re-pinning the same city, WITHOUT blocking other people
 * behind the same IP who pin *different* places. ~0.05° ≈ 5.5 km.
 */
export function hasNearbyPinFromIp(
    ip_hash: string,
    lat: number,
    lng: number,
    sinceMs: number,
    deltaDeg = 0.05
): boolean {
    const row = db()
        .query(
            `SELECT 1 FROM visitors
              WHERE ip_hash = ? AND created_at >= ?
                AND ABS(lat - ?) < ? AND ABS(lng - ?) < ?
              LIMIT 1`
        )
        .get(ip_hash, sinceMs, lat, deltaDeg, lng, deltaDeg);
    return !!row;
}

export function setVisitorStatus(id: string, status: 'visible' | 'hidden'): boolean {
    const res = db().query(`UPDATE visitors SET status = ? WHERE id = ?`).run(status, id);
    return res.changes > 0;
}

export function deleteVisitor(id: string): boolean {
    const res = db().query(`DELETE FROM visitors WHERE id = ?`).run(id);
    return res.changes > 0;
}

export interface AdminPin extends PublicPin {
    precision: string | null;
    status: string;
}

export function listAllForAdmin(): AdminPin[] {
    return db()
        .query(
            `SELECT id, lat, lng, place_label, country, precision, name, food, song, fact, quote, created_at, status
               FROM visitors ORDER BY created_at DESC LIMIT ?`
        )
        .all(PIN_LIMIT) as AdminPin[];
}

/**
 * Burn a single-use nonce. Returns true if newly recorded (unused); false if it
 * was already present (replay attempt).
 */
export function burnNonce(nonce: string, exp: number): boolean {
    try {
        const res = db().query(`INSERT INTO used_nonces (nonce, exp) VALUES (?, ?)`).run(nonce, exp);
        return res.changes > 0;
    } catch {
        return false; // PRIMARY KEY collision → already used
    }
}

export function sweepExpiredNonces(): void {
    db().query(`DELETE FROM used_nonces WHERE exp < ?`).run(Date.now());
}
