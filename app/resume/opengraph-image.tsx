import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { getResume } from '@/lib/resume';
import { parseResume } from '@/lib/resume-parse';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts } from '@/lib/og-card';

/**
 * The resume's own unfurl card: the Dark Veil behind the name.
 *
 * Deliberately NOT a variant of `lib/og-card.tsx`. That renderer has a twin in
 * `server/src/og.tsx` that has to stay pixel-identical to it (gotcha #10), and a
 * change there means an `OG_VERSION` bump that re-renders every published
 * artifact. A standalone route inherits neither obligation.
 *
 * The veil itself is a captured frame, not a live render: Satori has no WebGL, so
 * the shader cannot run at build time. `assets/og-veil.jpg` is one frame of the
 * real `components/ui/dark-veil.tsx` at the site's own `hueShift={40}`, so the
 * card shows the actual backdrop rather than an approximation of it. It is read
 * off disk and inlined — no network fetch inside the build.
 *
 * Non-dynamic metadata image route — static export requires an explicit directive.
 */
export const dynamic = 'force-static';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Matthew Coleman — Resume';

export default async function Image() {
    const [fonts, veil, resume] = await Promise.all([
        loadOgFonts(),
        readFile(join(process.cwd(), 'assets', 'og-veil.jpg')),
        getResume().catch(() => null),
    ]);

    const parsed = resume ? parseResume(resume.content) : null;
    const name = parsed?.name || 'Matthew Coleman';
    const headline = parsed?.headline || 'Professional experience and qualifications.';

    return new ImageResponse(
        (
            <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative' }}>
                <img
                    src={`data:image/jpeg;base64,${veil.toString('base64')}`}
                    width={OG_SIZE.width}
                    height={OG_SIZE.height}
                    style={{ position: 'absolute', top: 0, left: 0 }}
                />
                {/* Scrim. The veil is bright enough in places to eat white text, and
                    a left-weighted wash keeps the type legible wherever the shader
                    happens to have put its highlights in this particular frame. */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background:
                            'linear-gradient(100deg, rgba(6,8,12,0.9) 0%, rgba(6,8,12,0.7) 42%, rgba(6,8,12,0.15) 100%)',
                    }}
                />

                {/* Same inset frame as the standard card, so the two read as a set. */}
                <div
                    style={{
                        position: 'absolute',
                        top: 24,
                        left: 24,
                        right: 24,
                        bottom: 24,
                        border: '1.5px solid rgba(255,255,255,0.28)',
                        borderRadius: 28,
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '52px 60px',
                        color: '#f2f2f2',
                        fontFamily: 'Inter',
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
                        mncoleman · Resume
                    </div>

                    <div
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                fontSize: name.length > 24 ? 68 : 84,
                                fontWeight: 600,
                                letterSpacing: '-0.025em',
                                lineHeight: 1.08,
                            }}
                        >
                            {name}
                        </div>
                        <div
                            style={{
                                display: 'flex',
                                marginTop: 24,
                                fontSize: 30,
                                lineHeight: 1.35,
                                color: 'rgba(242,242,242,0.78)',
                            }}
                        >
                            {headline.length > 110 ? `${headline.slice(0, 109).trimEnd()}…` : headline}
                        </div>
                    </div>

                    <div style={{ display: 'flex', fontSize: 24, color: 'rgba(242,242,242,0.6)' }}>
                        mncoleman.com/resume
                    </div>
                </div>
            </div>
        ),
        { ...size, fonts }
    );
}
