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

const OUT = join(process.cwd(), 'out');

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

console.log(`[og] wrote ${pngs} .png image(s); rewrote ${htmls} html file(s)`);
