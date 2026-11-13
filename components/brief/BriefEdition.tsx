'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { briefVerses, type BriefEdition as Edition, type BriefItem, type BriefLink, type BriefSource } from '@/lib/brief';
import { dateParts, pad3, shortDate, useBrief, DAYS } from './use-brief';
import './brief.css';

/**
 * One edition of the daily brief: a full-screen horizontal pager, one page per
 * section. Rendered entirely from the stored edition (`lib/brief.ts`); nothing
 * here knows any particular day's content, so restyling this file restyles
 * every edition ever published.
 *
 * It covers the site's own header and footer on purpose (`.brief` is a fixed
 * layer): the brief is read like an app, and the bar links back to the site.
 */

const SHORT: Record<string, string> = { signal: 'Tech', local: 'Local', nation: 'Nation', world: 'World', field_notes: 'Notes' };
const slug = (key: string) => key.replace('_', '-');

function Sources({ list }: { list: BriefSource[] }) {
    return (
        <div className="b-srcs">
            {list.map((s) => <a key={s.url + s.outlet} href={s.url} target="_blank" rel="noopener noreferrer">{s.outlet}</a>)}
        </div>
    );
}

function readSeen(date: string): Record<string, true> {
    try { return JSON.parse(localStorage.getItem(`brief-read-${date}`) || '{}') || {}; } catch { return {}; }
}

function Pager({ edition, newer, older, links = [] }: { edition: Edition; newer: string | null; older: string | null; links?: BriefLink[] }) {
    const pages = useMemo(() => [
        { key: 'today', label: 'Today', title: 'Today' },
        ...edition.sectors.map((s) => ({ key: slug(s.key), label: SHORT[s.key] || s.title, title: s.title })),
        ...(edition.watchlist.length || edition.notices.length ? [{ key: 'ahead', label: 'Ahead', title: 'Coming up' }] : []),
        // The same list on every edition, kept in the admin panel. Skipped while it is empty.
        ...(links.length ? [{ key: 'sources', label: 'Sources', title: 'External sources' }] : []),
    ], [edition, links.length]);
    const items = useMemo(() => edition.sectors.flatMap((s) => s.items), [edition]);
    const pageOfItem = useCallback((id: string) => {
        const s = edition.sectors.find((sec) => sec.items.some((i) => i.id === id));
        return s ? pages.findIndex((p) => p.key === slug(s.key)) : -1;
    }, [edition, pages]);

    const [page, setPage] = useState(0);
    const [open, setOpen] = useState<string | null>(null);
    const [seen, setSeen] = useState<Record<string, true>>({});
    const [drag, setDrag] = useState<number | null>(null);
    const viewport = useRef<HTMLDivElement>(null);
    const touch = useRef<{ x: number; y: number; locked: 'x' | 'y' | null } | null>(null);

    const setHash = (name: string) => { try { history.replaceState(null, '', `#${name}`); } catch { /* not essential */ } };
    const markSeen = useCallback((id: string) => {
        setSeen((prev) => {
            if (prev[id]) return prev;
            const next = { ...prev, [id]: true as const };
            try { localStorage.setItem(`brief-read-${edition.date}`, JSON.stringify(next)); } catch { /* read state is a convenience */ }
            return next;
        });
    }, [edition.date]);

    const go = useCallback((to: number, item?: string) => {
        const next = Math.max(0, Math.min(pages.length - 1, to));
        setPage(next);
        setOpen(item || null);
        if (item) markSeen(item);
        setHash(item || pages[next].key);
    }, [pages, markSeen]);

    // Deep links: #world opens a section, #w3 opens an item inside its section.
    useEffect(() => {
        const fromHash = () => {
            let h = '';
            try { h = decodeURIComponent(location.hash.slice(1)); } catch { /* a malformed hash opens the first page */ }
            const p = pages.findIndex((x) => x.key === h);
            const ip = h ? pageOfItem(h) : -1;
            if (ip >= 0) { setPage(ip); setOpen(h); markSeen(h); requestAnimationFrame(() => document.getElementById(`item-${h}`)?.scrollIntoView({ block: 'nearest' })); }
            else if (p >= 0) { setPage(p); setOpen(null); }
        };
        setSeen(readSeen(edition.date));
        fromHash();
        window.addEventListener('hashchange', fromHash);
        return () => window.removeEventListener('hashchange', fromHash);
    }, [edition.date, pages, pageOfItem, markSeen]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target as HTMLElement | null;
            if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
            if (e.key === 'ArrowRight') go(page + 1);
            if (e.key === 'ArrowLeft') go(page - 1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [go, page]);

    // Swipe: the page follows the finger, then settles on whichever page it was thrown toward.
    const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, locked: null }; };
    const onTouchMove = (e: React.TouchEvent) => {
        const t = touch.current;
        if (!t) return;
        const dx = e.touches[0].clientX - t.x, dy = e.touches[0].clientY - t.y;
        if (!t.locked && Math.abs(dx) + Math.abs(dy) > 10) t.locked = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
        if (t.locked !== 'x') return;
        // Rubber-band at either end instead of dragging into nothing.
        const atEdge = (page === 0 && dx > 0) || (page === pages.length - 1 && dx < 0);
        setDrag(atEdge ? dx / 3 : dx);
    };
    const onTouchEnd = () => {
        const width = viewport.current?.clientWidth || 1;
        const dx = drag;
        touch.current = null;
        setDrag(null);
        if (dx !== null && Math.abs(dx) > Math.min(90, width * 0.2)) go(page + (dx < 0 ? 1 : -1));
    };

    const toggle = (id: string) => {
        const next = open === id ? null : id;
        setOpen(next);
        markSeen(id);
        setHash(next || pages[page].key);
    };

    const p = dateParts(edition.date);
    const compiled = new Date(edition.compiled_at);
    const compiledAt = Number.isNaN(compiled.getTime()) ? '' : compiled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const read = items.filter((i) => seen[i.id]).length;
    const w = edition.weather;
    const verses = briefVerses(edition);
    const short = (text?: string) => text ? <div className="b-short"><b>In short</b><span>{text}</span></div> : null;
    const head = (i: number, summary?: string) => (
        <div className="b-head">
            <div><div className="b-count">{i + 1} of {pages.length}</div><h1>{pages[i].title}</h1></div>
            {short(summary)}
        </div>
    );
    const card = (it: BriefItem) => {
        const isOpen = open === it.id;
        return (
            <article key={it.id} id={`item-${it.id}`} className={`b-card${isOpen ? ' open' : seen[it.id] ? ' seen' : ''}`}>
                <button type="button" className="b-cardbtn" onClick={() => toggle(it.id)} aria-expanded={isOpen} aria-controls={`detail-${it.id}`}>
                    <span className={`b-chip ${it.confidence}`}>{it.confidence}</span>
                    <span className="b-ctitle">{it.title}</span>
                    <span className="b-cbrief">{it.brief}</span>
                    <span className="b-more">{isOpen ? 'Close' : 'Read it'}</span>
                </button>
                <div className="b-detail" id={`detail-${it.id}`} hidden={!isOpen}>
                    {it.detail.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
                </div>
                <Sources list={it.sources} />
            </article>
        );
    };

    const today = (
        <>
            {head(0, edition.summary || edition.top_signals[0]?.headline)}
            <div className="b-grid">
                {w && (
                    <div className="b-box">
                        <p className="b-lab">Weather · {edition.location.split(',')[0]}</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}><span className="b-big">{w.high_f}°</span><span style={{ color: 'var(--b-mid)' }}>{w.summary}</span></div>
                        <div style={{ marginTop: 14 }}>
                            <div className="b-row"><span>Tonight</span><b>{w.tonight}</b></div>
                            <div className="b-row"><span>Wind</span><b>{w.wind}</b></div>
                            <div className="b-row"><span>{DAYS[(p.dowIndex + 1) % 7]}</span><b>{w.tomorrow}</b></div>
                        </div>
                        <p className="b-meta" style={{ margin: '12px 0 0' }}>Source: {w.source_url ? <a href={w.source_url} target="_blank" rel="noopener noreferrer">{w.source}</a> : w.source}</p>
                    </div>
                )}
                {verses.length > 0 && (
                    <div className="b-box">
                        <p className="b-lab">{verses.length > 1 ? 'Verses of the day' : 'Verse of the day'}</p>
                        {/* One per source, each with its own citation and link. */}
                        {verses.map((v, i) => (
                            <div key={i} className={`b-vitem${verses.length > 1 ? ' many' : ''}`}>
                                <p className="b-verse">“{v.text}”</p>
                                <p className="b-meta" style={{ margin: 0 }}>
                                    {v.url ? <a href={v.url} target="_blank" rel="noopener noreferrer">{v.reference}</a> : <span style={{ color: 'var(--b-accent)' }}>{v.reference}</span>} · {v.translation}{v.source ? ` · ${v.source}` : ''}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
                {edition.devotional && (
                    <div className="b-box">
                        <p className="b-lab">Devotional · {edition.devotional.title}</p>
                        <p style={{ fontSize: 13, lineHeight: 1.55, margin: '0 0 9px' }}><b>{edition.devotional.scripture.reference}.</b> <i>{edition.devotional.scripture.text}</i></p>
                        {edition.devotional.body.split('\n\n').map((para, i) => <p key={i} style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 9px', color: 'var(--b-mid)' }}>{para}</p>)}
                        <p className="b-meta" style={{ margin: 0 }}>{edition.devotional.url ? <a href={edition.devotional.url} target="_blank" rel="noopener noreferrer">{edition.devotional.attribution}</a> : edition.devotional.attribution}</p>
                    </div>
                )}
            </div>
            {edition.top_signals.length > 0 && (
                <div className="b-box" style={{ marginTop: 14, padding: '16px 20px 8px' }}>
                    <p className="b-lab" style={{ marginBottom: 4 }}>Top stories today</p>
                    {edition.top_signals.map((t) => (
                        <button key={t.item_id} type="button" className="b-sig" onClick={() => go(pageOfItem(t.item_id), t.item_id)}>
                            <span className="b-date">{SHORT[t.sector] || t.sector}</span><span>{t.headline}</span>
                        </button>
                    ))}
                </div>
            )}
        </>
    );

    const ahead = (i: number) => (
        <>
            {head(i, edition.watchlist.length ? `${edition.watchlist.length} dated events from today's brief, soonest first.` : undefined)}
            <div className="b-ahead">
                {edition.watchlist.length > 0 && (
                    <div className="b-box" style={{ padding: '6px 20px' }}>
                        {edition.watchlist.map((x, n) => (
                            <div className="b-wrow" key={n}><span className="b-date">{x.label}</span><span className="what">{x.what}</span><Sources list={x.sources} /></div>
                        ))}
                    </div>
                )}
                <div className="b-box">
                    <p className="b-lab">Notices</p>
                    {edition.notices.map((n, k) => <p className="b-notice" key={k}>{n}</p>)}
                    <p className="b-meta" style={{ margin: 0 }}>Compiled {shortDate(edition.date)} {p.year}{compiledAt ? `, ${compiledAt}` : ''}</p>
                    <div className="b-editions">
                        {older ? <Link className="b-meta" href={`/brief/${older}`}>‹ {shortDate(older)}</Link> : <span />}
                        {newer ? <Link className="b-meta" href={`/brief/${newer}`}>{shortDate(newer)} ›</Link> : <span />}
                    </div>
                </div>
            </div>
        </>
    );

    const external = (i: number) => (
        <>
            {head(i)}
            <div className="b-grid">
                {links.map((l) => {
                    let host = '';
                    try { host = new URL(l.url).hostname.replace(/^www\./, ''); } catch { /* shown without a host */ }
                    return (
                        <a key={l.url + l.label} className="b-link" href={l.url} target="_blank" rel="noopener noreferrer">
                            <b>{l.label}</b><span className="b-meta">{host}</span>
                        </a>
                    );
                })}
            </div>
        </>
    );

    const prev = pages[page - 1], next = pages[page + 1];
    const tabButtons = (withLabel: boolean) => pages.map((pg, i) => (
        <button key={pg.key} type="button" onClick={() => go(i)} aria-label={`${pg.title}, page ${i + 1} of ${pages.length}`} aria-current={i === page ? 'page' : undefined}>
            {withLabel && <><span className="n">{String(i + 1).padStart(2, '0')}</span><span className="t">{pg.label}</span></>}
        </button>
    ));

    return (
        <>
            <header className="b-top">
                <Link href="/" className="b-brand" aria-label="mncoleman.com home">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icon.svg" alt="" width={26} height={26} />mncoleman <span>/ daily brief</span>
                </Link>
                <div className="b-meta">Brief {pad3(edition.edition_number)} · {p.dow} {p.day} {p.mon}<span className="b-hide-s"> {p.year} · {edition.location}</span></div>
                <div className="b-right">
                    <span className="b-meta" aria-live="polite">Read {read} / {items.length}</span>
                    <Link className="b-meta" href="/brief/archive">Archive</Link>
                </div>
            </header>
            <div className="b-prog" aria-hidden="true"><div style={{ width: `${((page + 1) / pages.length) * 100}%` }} /></div>

            <div className="b-viewport" ref={viewport} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
                <div className={`b-track${drag !== null ? ' dragging' : ''}`} style={{ transform: `translate3d(calc(${-page * 100}% + ${drag || 0}px), 0, 0)` }}>
                    {pages.map((pg, i) => (
                        // `inert` keeps Tab and screen readers out of the pages that are off to the side.
                        <section key={pg.key} className="b-panel" aria-label={pg.title} inert={i !== page} data-lenis-prevent>
                            <div className="b-inner">
                                {pg.key === 'today' ? today : pg.key === 'ahead' ? ahead(i) : pg.key === 'sources' ? external(i) : (() => {
                                    const s = edition.sectors[i - 1];
                                    return <>{head(i, s.summary)}<div className="b-grid">{s.items.map(card)}</div></>;
                                })()}
                            </div>
                        </section>
                    ))}
                </div>
            </div>

            <nav className="b-pager" aria-label="Brief pages">
                <button type="button" onClick={() => go(page - 1)} disabled={!prev} aria-label="Previous page">‹ Prev</button>
                <div className="b-tabs">{tabButtons(true)}</div>
                <div className="b-dots">{tabButtons(false)}</div>
                <div className="b-meta b-hint">{prev ? `‹ ${prev.label} · ` : ''}Swipe{next ? ` · ${next.label} ›` : ''}</div>
                <button type="button" onClick={() => go(page + 1)} disabled={!next} aria-label="Next page">Next ›</button>
            </nav>
        </>
    );
}

/** `date` is YYYY-MM-DD, or 'latest'. */
export function BriefEdition({ date }: { date: string }) {
    const state = useBrief(date);
    return (
        <div className="brief" data-click-sound="off">
            {state.status === 'ready' ? <Pager key={state.data.edition.date} {...state.data} /> : (
                <div className="b-state">
                    <div>
                        {state.status === 'loading' ? <p className="b-meta">Loading the brief</p> : (
                            <>
                                <h1>{state.status === 'missing' ? (date === 'latest' ? 'No brief yet' : 'No brief for this date') : 'The brief could not be loaded'}</h1>
                                <p>{state.status === 'missing' ? 'Nothing has been published here.' : 'Check your connection and try again.'}</p>
                                <p style={{ marginTop: 16 }}><Link href="/brief/archive">See the archive</Link> · <Link href="/">mncoleman.com</Link></p>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
