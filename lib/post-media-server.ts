import { closeSync, openSync, readSync, statSync, readFileSync } from 'fs';
import { join, resolve, sep } from 'path';

/**
 * Build-time intrinsic size of a local image under public/, so figures reserve their box
 * (no layout shift). Reads PNG, JPEG, GIF, WebP and SVG headers; anything else is unknown.
 */
export interface ImageSize {
    width: number;
    height: number;
}

const cache = new Map<string, ImageSize | null>();

export function readImageSize(src: string, publicDir = join(process.cwd(), 'public')): ImageSize | null {
    if (!src.startsWith('/') || src.startsWith('//')) return null;
    let rel: string;
    try {
        rel = decodeURIComponent(src.split(/[?#]/)[0]);
    } catch {
        return null;
    }
    const full = resolve(publicDir, '.' + rel);
    if (!full.startsWith(resolve(publicDir) + sep)) return null;
    if (cache.has(full)) return cache.get(full) ?? null;
    let out: ImageSize | null = null;
    try {
        if (statSync(full).isFile()) out = sizeOfBuffer(readHead(full), full);
    } catch {
        out = null;
    }
    cache.set(full, out);
    return out;
}

function readHead(file: string): Buffer {
    const lower = file.toLowerCase();
    // JPEG's size marker can sit after a large EXIF block; the others are in the first bytes.
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.svg')) return readFileSync(file);
    const fd = openSync(file, 'r');
    try {
        const buf = Buffer.alloc(64);
        const n = readSync(fd, buf, 0, 64, 0);
        return buf.subarray(0, n);
    } finally {
        closeSync(fd);
    }
}

export function sizeOfBuffer(b: Buffer, name: string): ImageSize | null {
    const ext = name.toLowerCase().split('.').pop();
    if (ext === 'png' && b.length >= 24 && b.toString('latin1', 1, 4) === 'PNG') {
        return ok(b.readUInt32BE(16), b.readUInt32BE(20));
    }
    if (ext === 'gif' && b.length >= 10 && b.toString('latin1', 0, 3) === 'GIF') {
        return ok(b.readUInt16LE(6), b.readUInt16LE(8));
    }
    if (ext === 'webp' && b.length >= 30 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
        const kind = b.toString('latin1', 12, 16);
        if (kind === 'VP8 ') return ok(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
        if (kind === 'VP8L') {
            const bits = b.readUInt32LE(21);
            return ok((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
        }
        if (kind === 'VP8X') return ok(1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3));
        return null;
    }
    if ((ext === 'jpg' || ext === 'jpeg') && b[0] === 0xff && b[1] === 0xd8) {
        let i = 2;
        while (i + 9 < b.length) {
            if (b[i] !== 0xff) {
                i++;
                continue;
            }
            const marker = b[i + 1];
            if (marker === 0xff) {
                i++;
                continue;
            }
            if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
                return ok(b.readUInt16BE(i + 7), b.readUInt16BE(i + 5));
            }
            if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
                i += 2;
                continue;
            }
            i += 2 + b.readUInt16BE(i + 2);
        }
        return null;
    }
    if (ext === 'svg') {
        const head = b.toString('utf8', 0, Math.min(b.length, 4096));
        const tag = /<svg\b[^>]*>/i.exec(head)?.[0];
        if (!tag) return null;
        const len = (name2: string) => {
            const m = new RegExp(`\\s${name2}\\s*=\\s*["']\\s*([0-9.]+)\\s*(px)?\\s*["']`, 'i').exec(tag);
            return m ? parseFloat(m[1]) : null;
        };
        const w = len('width');
        const h = len('height');
        if (w && h) return ok(w, h);
        const vb = /viewBox\s*=\s*["']\s*[-0-9.]+[\s,]+[-0-9.]+[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*["']/i.exec(tag);
        if (vb) return ok(parseFloat(vb[1]), parseFloat(vb[2]));
    }
    return null;
}

function ok(width: number, height: number): ImageSize | null {
    return width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height) ? { width: Math.round(width), height: Math.round(height) } : null;
}
