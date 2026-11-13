'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MONTHS, dateParts, pad3, shortDate, useBriefIndex } from './use-brief';
import './brief.css';

/**
 * The public archive of the daily brief: a month calendar whose marked days
 * open that day's edition, a search over headlines and dates, and the full
 * list. Everything comes from one small index request.
 */
export function BriefArchive() {
    const state = useBriefIndex();
    const rows = useMemo(() => (state.status === 'ready' ? state.data : []), [state]);
    const months = useMemo(() => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort(), [rows]);
    const [q, setQ] = useState('');
    const [picked, setPicked] = useState<string | null>(null);
    const month = picked && months.includes(picked) ? picked : months[months.length - 1] || new Date().toISOString().slice(0, 7);

    const needle = q.trim().toLowerCase();
    const hits = rows.filter((r) => {
        if (!needle) return true;
        const p = dateParts(r.date);
        return `${r.headline} ${r.date} ${p.dow} ${p.day} ${p.mon} ${p.year} ${pad3(r.edition_number)}`.toLowerCase().includes(needle);
    });
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const [y, m] = month.split('-').map(Number);
    const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const at = months.indexOf(month);

    return (
        <div className="brief" data-click-sound="off">
            <header className="b-top">
                <Link href="/" className="b-brand" aria-label="mncoleman.com home">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icon.svg" alt="" width={26} height={26} />mncoleman <span>/ daily brief</span>
                </Link>
                <div className="b-right">
                    <a className="b-meta" href="/api/brief/rss">RSS</a>
                    <Link className="b-meta" href="/brief">Latest brief ›</Link>
                </div>
            </header>
            <div className="b-page" data-lenis-prevent>
                <div className="b-inner" style={{ maxWidth: 1040 }}>
                    <div className="b-head" style={{ marginBottom: 22 }}><h1>Archive</h1></div>
                    <div className="b-arch">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <input className="b-search" type="search" placeholder="Search headlines or a date" aria-label="Search briefs" value={q} onChange={(e) => setQ(e.target.value)} data-click-sound="off" />
                            <div className="b-cal">
                                <div className="b-calhead">
                                    <button type="button" aria-label="Previous month" disabled={at <= 0} onClick={() => setPicked(months[at - 1])}>‹</button>
                                    <b>{MONTHS[m - 1]} {y}</b>
                                    <button type="button" aria-label="Next month" disabled={at < 0 || at >= months.length - 1} onClick={() => setPicked(months[at + 1])}>›</button>
                                </div>
                                <div className="b-calgrid">
                                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="dow">{d}</span>)}
                                    {Array.from({ length: lead }, (_, i) => <span key={`lead-${i}`} className="d" />)}
                                    {Array.from({ length: days }, (_, i) => {
                                        const iso = `${month}-${String(i + 1).padStart(2, '0')}`;
                                        const r = byDate.get(iso);
                                        if (!r) return <span key={iso} className="d">{i + 1}</span>;
                                        const cls = `d${iso === rows[0]?.date ? ' latest' : ''}${needle && !hits.includes(r) ? ' dim' : ''}`;
                                        return <Link key={iso} href={`/brief/${iso}`} className={cls} aria-label={`Brief ${pad3(r.edition_number)}, ${shortDate(iso)}`}>{i + 1}</Link>;
                                    })}
                                </div>
                            </div>
                            <p className="b-meta" style={{ margin: 0, textTransform: 'none', letterSpacing: '.02em' }}>Outlined days have a brief. The filled day is the latest.</p>
                        </div>
                        <div>
                            <p className="b-lab">
                                {state.status === 'loading' ? 'Loading' : state.status === 'error' ? 'The archive could not be loaded' : needle ? `${hits.length} of ${rows.length} briefs` : `${rows.length} ${rows.length === 1 ? 'brief' : 'briefs'}, newest first`}
                            </p>
                            <div className="b-list">
                                {hits.length ? hits.map((r) => (
                                    <Link key={r.date} href={`/brief/${r.date}`}>
                                        <span className="b-date">{shortDate(r.date)}</span><span className="hl">{r.headline}</span><span className="b-meta">Brief {pad3(r.edition_number)}</span>
                                    </Link>
                                )) : (
                                    <div className="b-empty">{state.status === 'loading' ? ' ' : needle ? `No brief matches "${q}".` : 'Nothing has been published yet.'}</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
