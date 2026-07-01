import { baseHead, escape, detailsStyles, ensureHttpUrl, detailsDate } from './pages';
import type { LibraryKind } from './library-storage';

export interface LibraryDetailsOptions {
    slug: string;
    kind: LibraryKind;
    name: string;
    description?: string;
    /** Full raw prompt text or assembled SKILL.md — the copy button copies this verbatim. */
    content: string;
    publicBase: string;
    createdAt: string;
}

const libraryExtraStyles = `
    .content-preview {
        max-height: 320px;
        overflow-y: auto;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 13px;
        line-height: 1.5;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 16px;
        margin: 0 0 18px;
        color: #c9cdd1;
    }
`;

function truncate(s: string, max: number): string {
    return s.length > max ? `${s.slice(0, max)}\n…` : s;
}

/**
 * Server-rendered "share page" for a library item (prompt or skill) — same role as
 * artifactDetailsPage, carrying the item's own OG image. "Copy" copies the raw
 * content (prompt text / SKILL.md) via a hidden textarea, not a link; "Share page"
 * copies this page's own URL.
 */
export function libraryDetailsPage(o: LibraryDetailsOptions): string {
    const base = o.publicBase.replace(/\/$/, '');
    const detailsUrl = ensureHttpUrl(`${base}/library/${o.slug}`);
    const ogImage = `${base}/og/library/${o.slug}.png`;
    const kindLabel = o.kind === 'prompt' ? 'Prompt' : 'Skill';
    const copyLabel = o.kind === 'prompt' ? 'Copy prompt' : 'Copy SKILL.md';
    // OG description must stay single-line — the visible <pre> preview below keeps formatting.
    const desc = o.description || (o.kind === 'prompt' ? truncate(o.content.replace(/\s+/g, ' ').trim(), 200) : `mncoleman Skill: ${o.name}`);
    const og = { title: o.name, description: desc, image: ogImage, url: detailsUrl };

    const downloadLinks = o.kind === 'prompt'
        ? `<a class="button secondary" href="${escape(ensureHttpUrl(`${base}/raw/library/${o.slug}.txt`))}">Download .txt</a>
            <a class="button secondary" href="${escape(ensureHttpUrl(`${base}/raw/library/${o.slug}.md`))}">Download .md</a>`
        : `<a class="button secondary" href="${escape(ensureHttpUrl(`${base}/raw/library/${o.slug}.zip`))}">Download .zip</a>`;

    return `<!doctype html><html lang="en"><head>${baseHead(`${o.name} — ${kindLabel}`, og)}<style>${detailsStyles}${libraryExtraStyles}</style></head><body>
    <div class="card details">
        <div class="eyebrow">${kindLabel}</div>
        <h1>${escape(o.name)}</h1>
        ${o.description ? `<p class="desc">${escape(o.description)}</p>` : ''}
        <div class="meta">${o.createdAt ? escape(`Added ${detailsDate(o.createdAt)}`) : ''}</div>
        <pre class="content-preview">${escape(truncate(o.content, 4000))}</pre>
        <div class="actions">
            <button class="button accent" type="button" data-copy-content>${copyLabel}</button>
            <button class="button secondary" type="button" data-copy="${escape(detailsUrl)}">Share page</button>
            ${downloadLinks}
        </div>
        <a class="back" href="https://mncoleman.com/ai/">← All "A"I</a>
    </div>
    <textarea id="copy-source" hidden>${escape(o.content)}</textarea>
    <script>
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var url = btn.getAttribute('data-copy');
            var original = btn.textContent;
            function done() { btn.textContent = 'Copied!'; setTimeout(function () { btn.textContent = original; }, 1500); }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(url).then(done).catch(function () { window.prompt('Copy link:', url); });
            } else {
                window.prompt('Copy link:', url);
            }
        });
    });
    var copyContentBtn = document.querySelector('[data-copy-content]');
    if (copyContentBtn) {
        copyContentBtn.addEventListener('click', function () {
            var text = document.getElementById('copy-source').value;
            var original = copyContentBtn.textContent;
            function done() { copyContentBtn.textContent = 'Copied!'; setTimeout(function () { copyContentBtn.textContent = original; }, 1500); }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(function () { window.prompt('Copy:', text); });
            } else {
                window.prompt('Copy:', text);
            }
        });
    }
    </script>
    </body></html>`;
}
