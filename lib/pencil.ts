/**
 * The paper-and-pencil drawing engine, shared by the light-mode backdrop
 * (`components/paper-backdrop.tsx`) and the brand kit's contained demo
 * (`components/brand-kit/PencilDemo.tsx`).
 *
 * Extracted rather than duplicated for the same reason CLAUDE.md keeps warning
 * about the two OG renderers: a brand kit whose demo has drifted from the thing it
 * documents is worse than no demo. The pieces that genuinely differ between the two
 * — a fixed full-viewport canvas versus a bounded one, page-level pointer handling
 * versus element-level — stay in the components. Everything about how graphite
 * looks on paper lives here.
 */

export const PAPER = '#f7f4ec';

/**
 * The pencil's palette. Graphite first, so a fresh sheet starts where it always
 * did; a click walks the rest. Deliberately desaturated — these are laid down with
 * `multiply` on warm paper, and saturated ink reads as marker, not pencil.
 */
export const INKS = [
    '46, 46, 44', // graphite
    '150, 74, 68', // brick
    '166, 110, 56', // ochre
    '132, 128, 58', // olive gold
    '78, 120, 88', // sage
    '66, 104, 132', // slate blue
    '112, 88, 132', // muted violet
];

export type Point = [number, number];

export function polylineLength(pts: Point[]): number {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    return len;
}

/**
 * Builds the paper grain once, as a small tileable pattern.
 *
 * A paper photograph would be a few hundred kilobytes on the critical path for a
 * decorative background. A 128px noise tile costs nothing to ship and repeats
 * seamlessly at any viewport. The spread is deliberately small — visible as
 * texture, never as static.
 */
export function makeGrain(ctx: CanvasRenderingContext2D): CanvasPattern {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 128;
    const tctx = tile.getContext('2d')!;
    const img = tctx.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 18;
        img.data[i] = 247 + n;
        img.data[i + 1] = 244 + n;
        img.data[i + 2] = 236 + n;
        img.data[i + 3] = 255;
    }
    tctx.putImageData(img, 0, 0);
    return ctx.createPattern(tile, 'repeat')!;
}

/**
 * Lays a fresh sheet across the whole canvas.
 *
 * Fills at the IDENTITY transform, then restores the dpr transform. That is not
 * incidental: a canvas pattern lives in the current transform's space, so painting
 * the grain under a dpr scale would put it at a different size from anywhere else
 * that paints it — see `wipeSwath`, which has to match this exactly.
 */
export function paintPaper(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    dpr: number,
    grain: CanvasPattern
) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Clears one band of the sheet back to bare paper, along a segment.
 *
 * Not `destination-out` — that punches a hole clean through the canvas and you see
 * the page background through it, not paper. The band is stroked with the paper
 * fill and then the grain, repainting it exactly as `paintPaper` would, and at the
 * same identity transform so the grain cannot seam against the untouched sheet.
 */
export function wipeSwath(
    ctx: CanvasRenderingContext2D,
    dpr: number,
    grain: CanvasPattern,
    from: Point,
    to: Point,
    width: number
) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width * dpr;
    ctx.beginPath();
    ctx.moveTo(from[0] * dpr, from[1] * dpr);
    ctx.lineTo(to[0] * dpr, to[1] * dpr);
    ctx.strokeStyle = PAPER;
    ctx.stroke();
    ctx.strokeStyle = grain;
    ctx.stroke();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/**
 * Draws a run of samples as ONE smoothed path, in a few offset passes.
 *
 * Per-segment strokes were the first attempt and they beaded: every sample got its
 * own round-capped line, so the caps stacked at each join and a fast drag came out
 * as a string of dots. Curving through the points with the midpoints as anchors
 * gives a single continuous path instead, and offsetting the WHOLE path per pass —
 * rather than jittering each segment — keeps the pencil's tooth without
 * reintroducing lumps.
 *
 * Speed thins and lightens the line, the way a real pencil does.
 */
export function strokePath(ctx: CanvasRenderingContext2D, pts: Point[], inkIndex: number) {
    if (pts.length < 2) return;

    const speed = Math.min(polylineLength(pts) / (pts.length - 1) / 22, 1);
    const width = 3.2 - speed * 1.6;
    // Colour needs more of itself than graphite does to survive `multiply` on a
    // warm ground — at graphite's alpha the muted hues barely register.
    const alpha = (inkIndex === 0 ? 0.14 : 0.2) - speed * 0.05;
    const ink = INKS[((inkIndex % INKS.length) + INKS.length) % INKS.length];

    ctx.globalCompositeOperation = 'multiply';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let p = 0; p < 3; p++) {
        const ox = (Math.random() - 0.5) * 1.5;
        const oy = (Math.random() - 0.5) * 1.5;
        ctx.strokeStyle = `rgba(${ink}, ${alpha})`;
        ctx.lineWidth = width * (0.7 + Math.random() * 0.5);
        ctx.beginPath();
        ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
        for (let i = 1; i < pts.length - 1; i++) {
            const mx = (pts[i][0] + pts[i + 1][0]) / 2;
            const my = (pts[i][1] + pts[i + 1][1]) / 2;
            ctx.quadraticCurveTo(pts[i][0] + ox, pts[i][1] + oy, mx + ox, my + oy);
        }
        const end = pts[pts.length - 1];
        ctx.lineTo(end[0] + ox, end[1] + oy);
        ctx.stroke();
    }
}

/**
 * Splits recorded strokes across N wipers, each retracing its share so the whole
 * sheet clears inside `durationMs`.
 *
 * Longest-first into the emptiest bucket: a cheap balance that keeps every wiper
 * busy for roughly the same time. Each bucket is returned with its cumulative arc
 * length precomputed, so sampling a position mid-erase is a lookup rather than a
 * re-walk of the path.
 */
export function planErase(
    strokes: Point[][],
    { maxWipers, speed, durationMs }: { maxWipers: number; speed: number; durationMs: number }
) {
    const paths = strokes.filter((s) => s.length >= 2);
    if (!paths.length) return [];

    const total = paths.reduce((sum, p) => sum + polylineLength(p), 0);
    const count = Math.max(1, Math.min(maxWipers, Math.ceil(total / (speed * (durationMs / 1000)))));

    const buckets: Array<{ pts: Point[]; len: number }> = Array.from({ length: count }, () => ({
        pts: [],
        len: 0,
    }));
    [...paths]
        .sort((a, b) => polylineLength(b) - polylineLength(a))
        .forEach((path) => {
            const target = buckets.reduce((min, b) => (b.len < min.len ? b : min));
            target.pts.push(...path);
            target.len += polylineLength(path);
        });

    return buckets
        .filter((b) => b.pts.length >= 2)
        .map((b) => {
            const cum = [0];
            for (let i = 1; i < b.pts.length; i++) {
                cum.push(
                    cum[i - 1] + Math.hypot(b.pts[i][0] - b.pts[i - 1][0], b.pts[i][1] - b.pts[i - 1][1])
                );
            }
            return { pts: b.pts, cum, total: cum[cum.length - 1], cursor: 0 };
        });
}

export type EraseRoute = ReturnType<typeof planErase>[number];

/** Position along a route at a given arc length. The cursor only moves forward. */
export function pointAt(route: EraseRoute, dist: number): Point {
    const { pts, cum } = route;
    while (route.cursor < cum.length - 2 && cum[route.cursor + 1] < dist) route.cursor++;
    const i = route.cursor;
    const span = cum[i + 1] - cum[i];
    const t = span > 0 ? (dist - cum[i]) / span : 0;
    return [
        pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
        pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
    ];
}
