/**
 * Post-build fixup for generated OpenGraph images.
 *
 * Next's `opengraph-image.tsx` convention writes the generated PNG as an
 * EXTENSIONLESS file (e.g. `.../details/opengraph-image`) and references it
 * without an extension. That works on Vercel (a route handler sets the
 * content-type at request time) but NOT on a static host like GitHub Pages,
 * which serves an extensionless file as `application/octet-stream` — and
 * strict OG consumers (Twitter/Facebook) reject a non-image content-type.
 *
 * This script gives every generated image a real `.png` sibling and rewrites
 * the `og:image` / `twitter:image` URLs in the static HTML to point at it, so
 * the unfurl image is served as `image/png`. Operates only on `out/` (the
 * gitignored static export) — nothing here is committed.
 */
import { readdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { artifactSlug } from '../lib/utils';

const OUT = join(process.cwd(), 'out');
const SITE = 'https://mncoleman.com';

/** Minimal escaping for values going into a double-quoted HTML attribute. */
function escapeAttr(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function walk(dir: string, onFile: (path: string) => void) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) walk(p, onFile);
        else onFile(p);
    }
}

if (!existsSync(OUT)) {
    console.log('[og] no out/ directory — skipping');
    process.exit(0);
}

let pngs = 0;
let htmls = 0;

// 1) Copy each extensionless `opengraph-image` to `opengraph-image.png`.
walk(OUT, (p) => {
    if (p.endsWith(`${'/'}opengraph-image`)) {
        copyFileSync(p, `${p}.png`);
        pngs++;
    }
});

// 2) Repoint og:image / twitter:image in the static HTML at the .png variant.
walk(OUT, (p) => {
    if (!p.endsWith('.html')) return;
    const src = readFileSync(p, 'utf-8');
    if (!src.includes('/opengraph-image')) return;
    // Only the metadata-image URL (followed by ? or ") — never matches opengraph-image.png itself.
    const out = src.replace(/\/opengraph-image(?=[?"])/g, '/opengraph-image.png');
    if (out !== src) {
        writeFileSync(p, out);
        htmls++;
    }
});

// 3) Give the raw static artifact HTML files their own unfurl.
//
// A static artifact is a hand-authored HTML file served straight from
// `public/artifacts/`. Next never renders it, so it carries whatever <head> its
// author wrote — and none of them set OpenGraph tags. That's why sharing
// `/artifacts/<file>.html` unfurled as a bare link while the instant-artifact
// equivalent showed a card. The details route has already generated the right
// image for each of these; this just points the raw file at it.
//
// Deliberately confined to `out/`: the sources under `public/artifacts/` are
// Matthew's own documents and stay untouched.
const artifactsManifest = join(process.cwd(), 'data', 'artifacts.json');
let injected = 0;

if (existsSync(artifactsManifest)) {
    type StaticArtifact = { name?: string; filename?: string; description?: string };
    const manifest: StaticArtifact[] = JSON.parse(readFileSync(artifactsManifest, 'utf-8'));

    for (const artifact of manifest) {
        if (!artifact.filename || !artifact.filename.toLowerCase().endsWith('.html')) continue;

        const htmlPath = join(OUT, 'artifacts', artifact.filename);
        if (!existsSync(htmlPath)) continue;

        // Same derivation the details route uses, so the two always agree.
        const slug = artifactSlug(artifact);
        const image = `${SITE}/artifacts/${slug}/details/opengraph-image.png`;
        if (!existsSync(join(OUT, 'artifacts', slug, 'details', 'opengraph-image.png'))) continue;

        const src = readFileSync(htmlPath, 'utf-8');
        // Never clobber an artifact that already declares its own card.
        if (/property=["']og:image["']/i.test(src)) continue;
        if (!/<head[^>]*>/i.test(src)) continue;

        const title = artifact.name || slug;
        const description = (artifact.description || '').trim();
        const tags = [
            `<meta property="og:type" content="article">`,
            `<meta property="og:site_name" content="mncoleman">`,
            `<meta property="og:title" content="${escapeAttr(title)}">`,
            description ? `<meta property="og:description" content="${escapeAttr(description)}">` : '',
            `<meta property="og:url" content="${SITE}/artifacts/${artifact.filename}">`,
            `<meta property="og:image" content="${image}">`,
            `<meta property="og:image:width" content="1200">`,
            `<meta property="og:image:height" content="630">`,
            `<meta name="twitter:card" content="summary_large_image">`,
            `<meta name="twitter:title" content="${escapeAttr(title)}">`,
            description ? `<meta name="twitter:description" content="${escapeAttr(description)}">` : '',
            `<meta name="twitter:image" content="${image}">`,
        ]
            .filter(Boolean)
            .join('\n');

        writeFileSync(htmlPath, src.replace(/(<head[^>]*>)/i, `$1\n${tags}`));
        injected++;
    }
}

console.log(
    `[og] wrote ${pngs} .png image(s); rewrote ${htmls} html file(s); ` +
        `injected OG tags into ${injected} static artifact(s)`
);
