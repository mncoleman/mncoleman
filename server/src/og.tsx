import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dirname, '..', 'assets', 'fonts');

/**
 * IMPORTANT: this card must stay visually identical to `lib/og-card.tsx` in the
 * Next.js app. Instant artifacts unfurl from here; static ones unfurl from
 * there, and a viewer seeing both in the same chat should not be able to tell
 * which pipeline produced which. The two cannot share code — the app and this
 * service are separate deploys, and the Docker image only copies `server/` — so
 * any change to one is a manual change to the other.
 */
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

/**
 * Bump on every visual change to the card. Stored cards record the version they
 * were rendered at; `/og/*` re-renders lazily when it doesn't match, so a
 * redesign reaches already-published artifacts instead of only new ones.
 *
 * 1 — original: 1200×500, centred title, grey "mncoleman Artifact:" eyebrow.
 * 2 — parity with `lib/og-card.tsx`: 1200×630, teal uppercase eyebrow,
 *     left-aligned title, description, mncoleman.com footer.
 */
export const OG_VERSION = 2;

interface FontCache {
    regular: ArrayBuffer | null;
    semibold: ArrayBuffer | null;
}
const fontCache: FontCache = { regular: null, semibold: null };

async function loadFonts() {
    if (!fontCache.regular) {
        const buf = await readFile(join(FONT_DIR, 'Inter-Regular.ttf'));
        fontCache.regular = buf.buffer.slice(
            buf.byteOffset,
            buf.byteOffset + buf.byteLength
        ) as ArrayBuffer;
    }
    if (!fontCache.semibold) {
        const buf = await readFile(join(FONT_DIR, 'Inter-SemiBold.ttf'));
        fontCache.semibold = buf.buffer.slice(
            buf.byteOffset,
            buf.byteOffset + buf.byteLength
        ) as ArrayBuffer;
    }
    return fontCache;
}

function chooseTitleSize(title: string): number {
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

export async function renderOg(
    title: string,
    eyebrowLabel: string = 'mncoleman · Artifact',
    description?: string
): Promise<Buffer> {
    const fonts = await loadFonts();
    const desc = clamp(description, 150);

    const svg = await satori(
        {
            type: 'div',
            props: {
                style: {
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#0a0a0a',
                    display: 'flex',
                    padding: 24,
                    fontFamily: 'Inter',
                },
                children: {
                    type: 'div',
                    props: {
                        style: {
                            width: '100%',
                            height: '100%',
                            border: '1.5px solid rgba(255,255,255,0.28)',
                            borderRadius: 28,
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '52px 60px',
                            color: '#e5e5e5',
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        fontSize: 26,
                                        color: '#2bb3bb',
                                        letterSpacing: '0.06em',
                                        textTransform: 'uppercase',
                                    },
                                    children: eyebrowLabel,
                                },
                            },
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        flex: 1,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                    },
                                    children: [
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    display: 'flex',
                                                    fontSize: chooseTitleSize(title),
                                                    fontWeight: 600,
                                                    letterSpacing: '-0.025em',
                                                    lineHeight: 1.08,
                                                },
                                                children: title,
                                            },
                                        },
                                        ...(desc
                                            ? [
                                                  {
                                                      type: 'div',
                                                      props: {
                                                          style: {
                                                              display: 'flex',
                                                              marginTop: 26,
                                                              fontSize: 30,
                                                              opacity: 0.7,
                                                              lineHeight: 1.4,
                                                          },
                                                          children: desc,
                                                      },
                                                  },
                                              ]
                                            : []),
                                    ],
                                },
                            },
                            {
                                type: 'div',
                                props: {
                                    style: { display: 'flex', fontSize: 24, opacity: 0.6 },
                                    children: 'mncoleman.com',
                                },
                            },
                        ],
                    },
                },
            },
        },
        {
            width: OG_WIDTH,
            height: OG_HEIGHT,
            fonts: [
                { name: 'Inter', data: fonts.regular!, weight: 400, style: 'normal' },
                { name: 'Inter', data: fonts.semibold!, weight: 600, style: 'normal' },
            ],
        }
    );

    const resvg = new Resvg(svg, { background: '#0a0a0a' });
    return resvg.render().asPng();
}
