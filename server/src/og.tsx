import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
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

const OG_WIDTH = 1200;
const OG_HEIGHT = 500;

function chooseTitleSize(title: string): number {
    const len = title.length;
    if (len <= 24) return 80;
    if (len <= 40) return 64;
    if (len <= 60) return 52;
    return 44;
}

// Match the original static OG title color exactly. The shimmer peaks at
// #ffffff which is subtly brighter than the base — visible animation but
// frames where the shine is offscreen are indistinguishable from the
// pre-shimmer OG, so non-animating platforms get the same look.
const SHINE_BASE = '#e5e5e5';
const SHINE_PEAK = '#ffffff';

/**
 * Returns a CSS gradient string with the bright shine point at `centerPct`.
 * Mirrors the nav logo's ShinyText gradient (120deg, ±15% halo) but with the
 * shine position parameterised so we can step across frames for a GIF.
 */
function shineGradient(centerPct: number): string {
    const left = centerPct - 15;
    const right = centerPct + 15;
    return `linear-gradient(120deg, ${SHINE_BASE} 0%, ${SHINE_BASE} ${left}%, ${SHINE_PEAK} ${centerPct}%, ${SHINE_BASE} ${right}%, ${SHINE_BASE} 100%)`;
}

function buildOgSvgNode(title: string, shineCenterPct: number) {
    return {
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
                        padding: '36px 48px',
                        color: '#e5e5e5',
                        position: 'relative',
                    },
                    children: [
                        {
                            type: 'div',
                            props: {
                                style: {
                                    fontSize: 28,
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
                                    lineHeight: 1.1,
                                    padding: '0 12px',
                                    backgroundImage: shineGradient(shineCenterPct),
                                    backgroundClip: 'text',
                                    WebkitBackgroundClip: 'text',
                                    color: 'transparent',
                                },
                                children: title,
                            },
                        },
                    ],
                },
            },
        },
    };
}

async function renderFrame(node: any, fonts: { regular: ArrayBuffer | null; semibold: ArrayBuffer | null }) {
    const svg = await satori(node, {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        fonts: [
            { name: 'Inter', data: fonts.regular!, weight: 400, style: 'normal' },
            { name: 'Inter', data: fonts.semibold!, weight: 600, style: 'normal' },
        ],
    });
    return new Resvg(svg, { background: '#0a0a0a' }).render();
}

// Frame 0 places the shine offscreen so the title renders uniformly in the base
// color — visually identical to the pre-shimmer static OG. Each subsequent frame
// advances the shine center by 10% across the gradient. With 16 frames the cycle
// is 160% wide, which exits offscreen-right and re-enters offscreen-left for a
// seamless loop.
const GIF_FRAMES = 16;
const GIF_FRAME_DELAY_MS = 180;
const GIF_FIRST_CENTER = -30; // offscreen left
const GIF_STEP = 10;

function shineCenterForFrame(i: number): number {
    let c = GIF_FIRST_CENTER + i * GIF_STEP;
    // Wrap so the "shine offscreen right" frames continue as "offscreen left"
    // — invisible jump, keeps the loop seamless.
    if (c > 130) c -= GIF_FRAMES * GIF_STEP;
    return c;
}

/**
 * Static PNG. Renders frame 0 of the shimmer cycle (shine offscreen) so the
 * static OG and the GIF's first frame are visually identical. Anywhere that
 * doesn't animate the GIF gets exactly the look the OG had before shimmer.
 */
export async function renderOg(title: string): Promise<Buffer> {
    const fonts = await loadFonts();
    const rendered = await renderFrame(buildOgSvgNode(title, GIF_FIRST_CENTER), fonts);
    return rendered.asPng();
}

/**
 * Animated GIF — shimmer sweeping across the title, mirroring the nav logo.
 * Platforms that animate OG GIFs (iMessage, Discord, Slack) get the effect;
 * everyone else sees frame 0, which is the same as the static PNG.
 */
export async function renderOgGif(title: string): Promise<Buffer> {
    const fonts = await loadFonts();

    const gif = GIFEncoder();
    let palette: number[][] | null = null;

    for (let i = 0; i < GIF_FRAMES; i++) {
        const center = shineCenterForFrame(i);
        const rendered = await renderFrame(buildOgSvgNode(title, center), fonts);
        const rgba = new Uint8Array(rendered.pixels);

        if (!palette) {
            // Quantize using the brightest frame so the shine highlight has good
            // representation in the 256-color palette.
            const peakRendered = await renderFrame(buildOgSvgNode(title, 50), fonts);
            const peakRgba = new Uint8Array(peakRendered.pixels);
            palette = quantize(peakRgba, 256, { format: 'rgba4444' });
        }
        const indexed = applyPalette(rgba, palette);
        gif.writeFrame(indexed, rendered.width, rendered.height, {
            palette: i === 0 ? palette : undefined,
            delay: GIF_FRAME_DELAY_MS,
        });
    }
    gif.finish();
    return Buffer.from(gif.bytes());
}
