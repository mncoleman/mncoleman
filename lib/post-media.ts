/**
 * Pure helpers for post media (figures, artifact embeds, Mermaid). No fs, no React, so the
 * renderer, the editor and the selftests all share one definition of what the syntax means.
 *
 * Authoring syntax (plain Markdown, round-trips through the Tiptap editor):
 *   ```mermaid ... ```                          a diagram
 *   ![alt](/collections/x.svg "Caption")        a figure; the title is the caption
 *   ![alt](/collections/x.svg#plain)            opt out of the dark-mode paper surface (#paper forces it on)
 *   [Name](/artifacts/slug "embed")             a framed artifact; also "embed:480" or "embed:square"
 */
import { artifactSlug } from './utils';

// ---------------------------------------------------------------- Mermaid

export function isMermaidClass(className?: string | string[] | null): boolean {
    const c = Array.isArray(className) ? className.join(' ') : className || '';
    return /(^|\s)language-mermaid(\s|$)/.test(c);
}

// ---------------------------------------------------------------- Figures

export interface FigureImage {
    /** src with the `#plain` / `#paper` marker removed. */
    src: string;
    /** Whether the image sits on the light "paper" surface in dark mode. */
    paper: boolean;
}

const PAPER_EXT = /\.(svg|png|webp|gif|avif)$/i;

/** Decide the dark-mode surface from the URL: transparent-capable formats get paper unless `#plain`. */
export function parseFigureSrc(rawSrc: string): FigureImage {
    const hashAt = rawSrc.indexOf('#');
    const base = hashAt === -1 ? rawSrc : rawSrc.slice(0, hashAt);
    const marker = hashAt === -1 ? '' : rawSrc.slice(hashAt + 1).toLowerCase();
    let pathOnly = base;
    const q = pathOnly.indexOf('?');
    if (q !== -1) pathOnly = pathOnly.slice(0, q);
    let paper = PAPER_EXT.test(pathOnly);
    let src = rawSrc;
    if (marker === 'plain') {
        paper = false;
        src = base;
    } else if (marker === 'paper') {
        paper = true;
        src = base;
    }
    return { src, paper };
}

/** Only same-site, relative or http(s) image URLs are rendered as figures. */
export function isSafeImageSrc(src: string): boolean {
    return /^(\/(?!\/)|https?:\/\/|\.\/|\.\.\/)/i.test(src.trim());
}

// ---------------------------------------------------------------- Artifact embeds

export interface EmbedSpec {
    /** Fixed height in px; null with `square` means a 1:1 frame. */
    height: number;
    square: boolean;
}

export const DEFAULT_EMBED_HEIGHT = 560;

/** `embed`, `embed:480`, `embed:square` (case-insensitive). Anything else is not an embed. */
export function parseEmbedTitle(title: string | null | undefined): EmbedSpec | null {
    const m = /^embed(?::([a-z0-9]+))?$/i.exec((title || '').trim());
    if (!m) return null;
    const v = (m[1] || '').toLowerCase();
    if (!v) return { height: DEFAULT_EMBED_HEIGHT, square: false };
    if (v === 'square') return { height: DEFAULT_EMBED_HEIGHT, square: true };
    if (/^\d{3,4}$/.test(v)) return { height: Math.min(1200, Math.max(200, parseInt(v, 10))), square: false };
    return null;
}

export interface EmbedArtifact {
    filename: string;
    name?: string;
}

export interface ResolvedEmbed {
    /** The iframe src. */
    src: string;
    /** "Open full page" target. */
    openHref: string;
    kind: 'static' | 'dynamic';
    /** Static manifest name when known. */
    name?: string;
}

const SITE_HOSTS = new Set(['mncoleman.com', 'www.mncoleman.com']);
const DEFAULT_ARTIFACTS_HOST = 'artifacts.mncoleman.com';
const DYNAMIC_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;

/** Origins that serve dynamic artifacts: the production host plus the configured API origin (dev). */
export function artifactsOrigins(configured: string | undefined = process.env.NEXT_PUBLIC_ARTIFACTS_API_URL): string[] {
    const out = new Set<string>([`https://${DEFAULT_ARTIFACTS_HOST}`]);
    if (configured) {
        try {
            out.add(new URL(configured).origin);
        } catch {
            /* ignore a malformed env value */
        }
    }
    return Array.from(out);
}

/**
 * Turn a link href into something safe to iframe, or null. Only these are accepted:
 *  - a static artifact in the manifest, as `/artifacts/<slug>`, `/artifacts/<file>(.html)` (relative or on mncoleman.com)
 *  - a dynamic artifact, as `https://artifacts.mncoleman.com/a/<slug>`
 * Everything else (third-party hosts, other paths, credentials, odd schemes) returns null and
 * the caller renders a normal link.
 */
export function resolveEmbedHref(
    href: string | undefined | null,
    artifacts: EmbedArtifact[],
    origins: string[] = artifactsOrigins(),
): ResolvedEmbed | null {
    if (!href || /[\u0000-\u001f\\]/.test(href)) return null;
    let url: URL;
    try {
        url = new URL(href, 'https://mncoleman.com');
    } catch {
        return null;
    }
    if (url.username || url.password) return null;
    const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(href.trim()) && !href.trim().startsWith('//');

    const sameSite = isRelative || (url.protocol === 'https:' && SITE_HOSTS.has(url.hostname) && !url.port);
    if (sameSite) {
        const m = /^\/artifacts\/([^/]+?)\/?$/.exec(url.pathname);
        if (!m) return null;
        let seg: string;
        try {
            seg = decodeURIComponent(m[1]);
        } catch {
            return null;
        }
        const wanted = seg.replace(/\.html?$/i, '');
        const hit = artifacts.find(
            (a) => a.filename === seg || artifactSlug(a) === wanted || artifactSlug({ filename: seg }) === artifactSlug(a),
        );
        if (!hit) return null;
        const src = `/artifacts/${encodeURIComponent(hit.filename)}`;
        return { src, openHref: src, kind: 'static', name: hit.name };
    }

    if (origins.includes(url.origin)) {
        const m = /^\/a\/([^/]+)\/?$/.exec(url.pathname);
        if (!m || !DYNAMIC_SLUG.test(m[1])) return null;
        const src = `${url.origin}/a/${m[1]}`;
        return { src, openHref: src, kind: 'dynamic' };
    }
    return null;
}

const SANDBOX_BASE = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms';

/**
 * Sandbox flags per embed kind. A static artifact is served from mncoleman.com itself, so
 * `allow-same-origin` would let the framed page reach the parent's origin (including the admin
 * session in sessionStorage): static frames get scripts but an opaque origin. Their localStorage
 * and sessionStorage therefore throw and cross-origin fetches send `Origin: null`; static
 * artifacts must guard storage with try/catch. Dynamic frames are already cross-origin
 * (artifacts.mncoleman.com), so `allow-same-origin` only keeps them in their own origin.
 */
export function embedSandbox(kind: 'static' | 'dynamic'): string {
    return kind === 'static' ? SANDBOX_BASE : `${SANDBOX_BASE} allow-same-origin`;
}
