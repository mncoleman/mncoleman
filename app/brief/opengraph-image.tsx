import { ImageResponse } from 'next/og';
import { OG_SIZE, OG_CONTENT_TYPE, loadOgFonts } from '@/lib/og-card';

/**
 * The daily brief's unfurl card. One image for the whole section: `/brief`,
 * the archive and every dated edition inherit it, because editions live in KV
 * and the build cannot know what any particular day says.
 *
 * It is drawn as the brief itself is: near-black ground, the teal accent, the
 * bar across the top and the row of page tabs along the bottom. Like the
 * resume's card it is deliberately NOT a variant of `lib/og-card.tsx`, which
 * is twinned with `server/src/og.tsx` (gotcha #10); only the size, content
 * type and fonts are shared. The colours mirror `components/brief/brief.css`,
 * so a change to the brief's palette is a change here too.
 *
 * Non-dynamic metadata image route — static export requires an explicit directive.
 */
export const dynamic = 'force-static';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'The MNColeman Daily Brief';

const BG = '#0a0a0a', PANEL = '#111111', LINE = '#2e2e2e', FG = '#fafafa', MID = '#b8b8b8', DIM = '#909090', ACCENT = '#5fd4c4';
const PAGES = ['Today', 'Tech', 'Local', 'Nation', 'World', 'Notes', 'Ahead'];

export default async function Image() {
    const fonts = await loadOgFonts();
    return new ImageResponse(
        (
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: BG, color: FG, fontFamily: 'Inter' }}>
                {/* The brief's own top bar. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 96, padding: '0 56px', borderBottom: `2px solid ${LINE}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52, borderRadius: 12, background: '#18181b', border: `1.5px solid ${LINE}`, fontSize: 22, fontWeight: 600, marginRight: 18 }}>MC</div>
                        mncoleman
                        <span style={{ color: DIM, fontWeight: 400, marginLeft: 12 }}>/ daily brief</span>
                    </div>
                    <div style={{ display: 'flex', fontSize: 24, color: DIM }}>mncoleman.com/brief</div>
                </div>
                {/* The progress line, one page in. */}
                <div style={{ display: 'flex', height: 6, background: '#1f1f1f' }}>
                    <div style={{ display: 'flex', width: `${100 / PAGES.length}%`, background: ACCENT }} />
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 56px' }}>
                    <div style={{ display: 'flex', fontSize: 24, letterSpacing: '0.14em', color: ACCENT, textTransform: 'uppercase' }}>The morning, in one place</div>
                    <div style={{ display: 'flex', marginTop: 14, fontSize: 80, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.04, whiteSpace: 'nowrap' }}>The MNColeman Daily Brief</div>
                    <div style={{ display: 'flex', marginTop: 26, fontSize: 31, lineHeight: 1.4, color: MID, maxWidth: 980 }}>
                        Weather, a verse, and the day in tech, local, national and world news. Every story linked to its source.
                    </div>
                </div>

                {/* The pager's tabs, first one current. */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 112, padding: '0 56px', borderTop: `2px solid ${LINE}` }}>
                    <div style={{ display: 'flex' }}>
                        {PAGES.map((label, i) => (
                            <div
                                key={label}
                                style={{
                                    display: 'flex', alignItems: 'center', height: 56, padding: '0 18px', marginRight: 10, borderRadius: 9, fontSize: 22,
                                    background: i === 0 ? ACCENT : PANEL, color: i === 0 ? BG : FG, border: `1.5px solid ${i === 0 ? ACCENT : LINE}`,
                                }}
                            >
                                <span style={{ fontSize: 17, opacity: 0.7, marginRight: 9 }}>{`0${i + 1}`}</span>
                                {label}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        ),
        { ...size, fonts }
    );
}
