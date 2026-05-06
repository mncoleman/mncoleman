import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dirname, '..', 'assets', 'fonts');

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
    if (len <= 24) return 96;
    if (len <= 40) return 80;
    if (len <= 60) return 64;
    return 52;
}

export async function renderOg(title: string): Promise<Buffer> {
    const fonts = await loadFonts();

    const svg = await satori(
        {
            type: 'div',
            props: {
                style: {
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#0a0a0a',
                    display: 'flex',
                    padding: 56,
                    fontFamily: 'Inter',
                },
                children: {
                    type: 'div',
                    props: {
                        style: {
                            width: '100%',
                            height: '100%',
                            border: '2px solid rgba(255,255,255,0.32)',
                            borderRadius: 36,
                            display: 'flex',
                            flexDirection: 'column',
                            padding: '64px 80px',
                            color: '#e5e5e5',
                            position: 'relative',
                        },
                        children: [
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        fontSize: 36,
                                        opacity: 0.75,
                                        letterSpacing: '-0.01em',
                                    },
                                    children: 'mncoleman Artifact:',
                                },
                            },
                            {
                                type: 'div',
                                props: {
                                    style: {
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        textAlign: 'center',
                                        fontSize: chooseTitleSize(title),
                                        fontWeight: 600,
                                        letterSpacing: '-0.025em',
                                        lineHeight: 1.15,
                                        padding: '0 16px',
                                    },
                                    children: title,
                                },
                            },
                        ],
                    },
                },
            },
        },
        {
            width: 1200,
            height: 630,
            fonts: [
                { name: 'Inter', data: fonts.regular!, weight: 400, style: 'normal' },
                { name: 'Inter', data: fonts.semibold!, weight: 600, style: 'normal' },
            ],
        }
    );

    const resvg = new Resvg(svg, { background: '#0a0a0a' });
    return resvg.render().asPng();
}
