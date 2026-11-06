import type { Passage as PassageData } from '@/lib/bible-server';

function One({ p, label, numbered }: { p: PassageData; label: string; numbered: boolean }) {
    return (
        <>
            {p.verses.map((v, i) => (
                <span key={v.n}>
                    {i > 0 && ' '}
                    {numbered && <sup className="mr-0.5 text-[0.65em] font-semibold text-muted-foreground">{v.n}</sup>}
                    {v.t === null ? <em className="text-muted-foreground">(not in {label})</em> : v.t}
                </span>
            ))}
            {p.more && <span className="text-muted-foreground"> …</span>}
        </>
    );
}

/** Both translations, in sibling spans the page-level CSS shows one at a time. Pure, so usable from server and client. */
export function PassageText({ kjv, web }: { kjv: PassageData; web: PassageData }) {
    const numbered = kjv.verses.length > 1;
    return (
        <>
            <span className="tr-kjv">
                <One p={kjv} label="KJV" numbered={numbered} />
            </span>
            <span className="tr-web">
                <One p={web} label="WEB" numbered={numbered} />
            </span>
        </>
    );
}
