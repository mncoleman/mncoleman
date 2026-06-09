/** Server-rendered HTML pages: 404, password prompt, root landing. */

const baseStyles = `
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; }
    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif;
        background: #0a0a0a;
        color: #e5e5e5;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        overflow-x: hidden;
    }
    .card {
        max-width: 520px;
        width: 100%;
        padding: 48px 40px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.02);
        backdrop-filter: blur(8px);
        text-align: center;
    }
    .eyebrow {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: #016b72;
        margin-bottom: 18px;
    }
    h1 {
        margin: 0 0 12px;
        font-size: 32px;
        font-weight: 600;
        letter-spacing: -0.02em;
    }
    p { margin: 0 0 20px; color: #9aa0a6; line-height: 1.55; }
    a.button, button.button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 22px;
        border-radius: 999px;
        background: #e5e5e5;
        color: #0a0a0a;
        font-weight: 500;
        text-decoration: none;
        border: none;
        font-size: 14px;
        cursor: pointer;
        transition: transform 120ms ease, opacity 120ms ease;
    }
    a.button:hover, button.button:hover { transform: translateY(-1px); opacity: 0.92; }
    .secondary {
        background: transparent;
        color: #e5e5e5;
        border: 1px solid rgba(255,255,255,0.18);
    }
    input[type="password"] {
        width: 100%;
        padding: 12px 16px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.18);
        background: rgba(255,255,255,0.04);
        color: #e5e5e5;
        font-size: 15px;
        margin-bottom: 16px;
        font-family: inherit;
    }
    input[type="password"]:focus {
        outline: none;
        border-color: #016b72;
    }
    .error {
        color: #ff8a8a;
        font-size: 13px;
        margin: -8px 0 12px;
    }
`;

const baseHead = (title: string, og?: { title: string; description: string; image: string; url: string }) => `
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(title)}</title>
    <link rel="icon" type="image/svg+xml" href="https://mncoleman.com/icon.svg">
    <link rel="alternate icon" href="https://mncoleman.com/favicon.ico">${og ? `
    <meta property="og:title" content="${escape(og.title)}">
    <meta property="og:description" content="${escape(og.description)}">
    <meta property="og:image" content="${og.image}">
    <meta property="og:url" content="${og.url}">
    <meta property="og:type" content="article">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escape(og.title)}">
    <meta name="twitter:description" content="${escape(og.description)}">
    <meta name="twitter:image" content="${og.image}">` : ''}
    <style>${baseStyles}</style>
`;

function escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const shimmerKeyframes = `
    @keyframes orbit {
        0%   { transform: rotate(0deg)   translateX(120px) rotate(0deg); opacity: 0.6; }
        50%  { opacity: 1; }
        100% { transform: rotate(360deg) translateX(120px) rotate(-360deg); opacity: 0.6; }
    }
    @keyframes pulseRing {
        0%   { transform: scale(0.95); opacity: 0.55; }
        70%  { transform: scale(1.18); opacity: 0; }
        100% { transform: scale(1.18); opacity: 0; }
    }
    @keyframes glitch {
        0%, 100% { text-shadow: 0 0 0 transparent, 0 0 0 transparent; }
        45%      { text-shadow: -2px 0 #016b72, 2px 0 #ff5d8f; }
        55%      { text-shadow:  2px 0 #016b72, -2px 0 #ff5d8f; }
    }
`;

export function notFoundPage(): string {
    return `<!doctype html><html lang="en"><head>${baseHead('Not found')}<style>${shimmerKeyframes}
        .stage {
            position: relative;
            height: 220px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 12px;
        }
        .core {
            font-size: 96px;
            font-weight: 700;
            letter-spacing: -0.04em;
            background: linear-gradient(120deg, #e5e5e5 0%, #9aa0a6 60%, #016b72 100%);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            animation: glitch 4.2s infinite;
            position: relative;
            z-index: 2;
        }
        .ring {
            position: absolute;
            inset: 50% 50%;
            width: 180px;
            height: 180px;
            margin: -90px 0 0 -90px;
            border-radius: 50%;
            border: 1px solid rgba(1, 107, 114, 0.4);
            animation: pulseRing 2.8s ease-out infinite;
        }
        .ring.delay { animation-delay: 1.4s; }
        .dot {
            position: absolute;
            top: 50%; left: 50%;
            width: 8px; height: 8px;
            border-radius: 50%;
            background: #016b72;
            margin: -4px 0 0 -4px;
            box-shadow: 0 0 12px #016b72;
            animation: orbit 6s linear infinite;
        }
        .dot.b { animation-delay: -2s; background: #ff5d8f; box-shadow: 0 0 12px #ff5d8f; }
        .dot.c { animation-delay: -4s; background: #e5e5e5; box-shadow: 0 0 12px rgba(255,255,255,0.5); }
    </style></head><body>
    <div class="card">
        <div class="stage">
            <span class="ring"></span>
            <span class="ring delay"></span>
            <span class="dot"></span>
            <span class="dot b"></span>
            <span class="dot c"></span>
            <span class="core">404</span>
        </div>
        <div class="eyebrow">Artifact not found</div>
        <p>That URL doesn't point to anything I'm hosting. The artifact may have been removed, the slug mistyped, or the link expired.</p>
        <a class="button" href="https://mncoleman.com/artifacts/">Browse artifacts</a>
    </div></body></html>`;
}

export interface PasswordPromptOptions {
    slug: string;
    name: string;
    description?: string;
    publicBase: string;
    error?: string;
}

export function passwordPromptPage({ slug, name, description, publicBase, error }: PasswordPromptOptions): string {
    const og = {
        title: name,
        description: description || `mncoleman Artifact: ${name}`,
        image: `${publicBase}/og/${slug}.png`,
        url: `${publicBase}/a/${slug}`,
    };
    return `<!doctype html><html lang="en"><head>${baseHead(`${name} — locked`, og)}</head><body>
    <div class="card">
        <div class="eyebrow">Private artifact</div>
        <h1>${escape(name)}</h1>
        <p>This artifact is password-protected. Enter the password to continue.</p>
        ${error ? `<div class="error">${escape(error)}</div>` : ''}
        <form method="post" action="/unlock/${encodeURIComponent(slug)}" autocomplete="off">
            <input type="password" name="password" placeholder="Password" required autofocus>
            <button class="button" type="submit">Unlock</button>
        </form>
    </div></body></html>`;
}

const detailsStyles = `
    .card.details { text-align: left; max-width: 560px; }
    .details h1 { font-size: 28px; margin-bottom: 10px; }
    .details .desc { color: #9aa0a6; line-height: 1.6; margin: 0 0 16px; }
    .details .meta { font-size: 13px; color: #6b7177; margin-bottom: 24px; letter-spacing: 0.01em; }
    .details .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
    .details .actions .button { padding: 11px 18px; font-size: 14px; }
    .button.accent { background: rgba(1,107,114,0.14); color: #2bb3bb; border: 1px solid rgba(1,107,114,0.45); }
    .button.accent:hover { background: rgba(1,107,114,0.22); }
    .details .note { font-size: 12px; color: #c9a227; margin: 0 0 16px; }
    .details .back { display: inline-block; color: #9aa0a6; text-decoration: none; font-size: 13px; margin-top: 4px; }
    .details .back:hover { color: #e5e5e5; }
`;

function detailsSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function detailsTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        'text/html': 'HTML',
        'application/pdf': 'PDF',
        'image/png': 'PNG',
        'image/jpeg': 'JPEG',
        'image/gif': 'GIF',
        'image/svg+xml': 'SVG',
        'application/json': 'JSON',
        'text/plain': 'Text',
        'text/css': 'CSS',
        'text/javascript': 'JavaScript',
    };
    return labels[type] || type.split('/').pop()?.toUpperCase() || 'File';
}

function detailsDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
        return '';
    }
}

export interface ArtifactDetailsOptions {
    slug: string;
    name: string;
    description?: string;
    type: string; // normalized MIME type
    size: number;
    uploadedAt: string;
    publicBase: string;
    viewable: boolean;
    isPrivate?: boolean;
}

/**
 * Server-rendered "share page" for an instant artifact. Carries the correct
 * OpenGraph image (the artifact's own /og/<slug>.png) so the link unfurls like
 * the artifact itself, but lands the visitor on a details view instead of
 * opening the artifact. "Copy link" copies the artifact URL; "Share page"
 * copies this page's URL.
 */
/** Assert a URL is http(s) before it lands in an href/clipboard context (defense-in-depth vs javascript: URLs). */
function ensureHttpUrl(url: string): string {
    if (!/^https?:\/\//i.test(url)) throw new Error(`Refusing to render non-http(s) URL: ${url}`);
    return url;
}

export function artifactDetailsPage(o: ArtifactDetailsOptions): string {
    const base = o.publicBase.replace(/\/$/, '');
    const artifactUrl = ensureHttpUrl(`${base}/a/${o.slug}`);
    const downloadUrl = ensureHttpUrl(`${base}/raw/${o.slug}`);
    const detailsUrl = ensureHttpUrl(`${base}/a/${o.slug}/details`);
    const desc = o.description || `mncoleman Artifact: ${o.name}`;
    const og = {
        title: o.name,
        description: desc,
        image: `${base}/og/${o.slug}.png`,
        url: detailsUrl,
    };
    const metaLine = [
        detailsTypeLabel(o.type),
        detailsSize(o.size),
        o.uploadedAt ? `Added ${detailsDate(o.uploadedAt)}` : '',
    ].filter(Boolean).join(' · ');

    return `<!doctype html><html lang="en"><head>${baseHead(`${o.name} — details`, og)}<style>${detailsStyles}</style></head><body>
    <div class="card details">
        <div class="eyebrow">Artifact${o.isPrivate ? ' · Private' : ''}</div>
        <h1>${escape(o.name)}</h1>
        <p class="desc">${escape(desc)}</p>
        <div class="meta">${escape(metaLine)}</div>
        <div class="actions">
            <a class="button" href="${escape(artifactUrl)}">${o.viewable ? 'Open' : 'Open file'}</a>
            <a class="button secondary" href="${escape(downloadUrl)}">Download</a>
            <button class="button secondary" type="button" data-copy="${escape(artifactUrl)}">Copy link</button>
            <button class="button accent" type="button" data-copy="${escape(detailsUrl)}">Share page</button>
        </div>
        ${o.isPrivate ? `<p class="note">This artifact is password-protected — opening it will ask for the password.</p>` : ''}
        <a class="back" href="https://mncoleman.com/artifacts/">← All artifacts</a>
    </div>
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
    </script>
    </body></html>`;
}
