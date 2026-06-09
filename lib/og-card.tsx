import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Shared OpenGraph card used by the per-page opengraph-image.tsx routes
 * (static artifacts, resources, projects). Generated at BUILD time into the
 * static export — the PNGs live only in `out/` (gitignored), so removed items
 * simply stop being generated; nothing to clean up. Visual style mirrors the
 * Oracle artifact OG renderer (server/src/og.tsx) for a consistent unfurl.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';

type OgFont = { name: string; data: Buffer; weight: 400 | 600; style: 'normal' };

let fontCache: { regular: Buffer; semibold: Buffer } | null = null;

export async function loadOgFonts(): Promise<OgFont[]> {
    if (!fontCache) {
        // Reuse the Inter TTFs the Oracle OG renderer already ships — no new font assets.
        const dir = join(process.cwd(), 'server', 'assets', 'fonts');
        const [regular, semibold] = await Promise.all([
            readFile(join(dir, 'Inter-Regular.ttf')),
            readFile(join(dir, 'Inter-SemiBold.ttf')),
        ]);
        fontCache = { regular, semibold };
    }
    return [
        { name: 'Inter', data: fontCache.regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: fontCache.semibold, weight: 600, style: 'normal' },
    ];
}

function titleSize(title: string): number {
    const len = title.length;
    if (len <= 24) return 84;
    if (len <= 40) return 68;
    if (len <= 60) return 54;
    return 44;
}

function clamp(text: string | undefined, max: number): string {
    if (!text) return '';
    const t = text.trim();
    return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Branded 1200×630 card. `eyebrow` is the section label (e.g. "mncoleman · Artifact"). */
export function OgCard({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
    const desc = clamp(description, 150);
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#0a0a0a',
                display: 'flex',
                padding: 24,
                fontFamily: 'Inter',
            }}
        >
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    border: '1.5px solid rgba(255,255,255,0.28)',
                    borderRadius: 28,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '52px 60px',
                    color: '#e5e5e5',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        fontSize: 26,
                        color: '#2bb3bb',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                    }}
                >
                    {eyebrow}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div
                        style={{
                            display: 'flex',
                            fontSize: titleSize(title),
                            fontWeight: 600,
                            letterSpacing: '-0.025em',
                            lineHeight: 1.08,
                        }}
                    >
                        {title}
                    </div>
                    {desc ? (
                        <div style={{ display: 'flex', marginTop: 26, fontSize: 30, opacity: 0.7, lineHeight: 1.4 }}>
                            {desc}
                        </div>
                    ) : null}
                </div>
                <div style={{ display: 'flex', fontSize: 24, opacity: 0.6 }}>mncoleman.com</div>
            </div>
        </div>
    );
}
