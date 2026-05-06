import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';

/**
 * Symmetric encryption helper for at-rest password storage.
 * Key is derived from JWT_SECRET via SHA-256, so anyone with read access to
 * meta.json AND the env var can decrypt — same trust boundary as the bcrypt
 * hash. The point is to keep plaintext off disk for backup leaks.
 */

function getKey(): Buffer {
    const secret = process.env.JWT_SECRET || '';
    return createHash('sha256').update(secret).digest();
}

function b64u(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(s: string): Buffer {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export function encryptPassword(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${b64u(iv)}.${b64u(Buffer.concat([ct, tag]))}`;
}

export function decryptPassword(blob: string | undefined | null): string | null {
    if (!blob) return null;
    try {
        const dot = blob.indexOf('.');
        if (dot < 0) return null;
        const iv = fromB64u(blob.slice(0, dot));
        const ctTag = fromB64u(blob.slice(dot + 1));
        if (ctTag.length < 16 || iv.length !== 12) return null;
        const tag = ctTag.subarray(ctTag.length - 16);
        const ct = ctTag.subarray(0, ctTag.length - 16);
        const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}
