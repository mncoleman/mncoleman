/**
 * Render checks for the site half of verse mentions (no Next build needed):
 *   npx tsx scripts/bible/render.selftest.tsx [outDir]
 * Optional outDir receives static HTML (blog sample + 3 chapter pages) for a browser check.
 */
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownLink } from '@/components/bible/MarkdownLink';
import { BibleHead } from '@/components/bible/BibleHead';
import ChapterPage, { generateStaticParams, generateMetadata } from '@/app/bible/[book]/[chapter]/page';
import { allChapterParams } from '@/lib/bible-server';
import sitemap from '@/app/sitemap';

let failed = 0;
function check(name: string, ok: boolean, extra = '') {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

const md = [
    'See [Matthew 12:13](/bible/Matt/12#v13) and [verses 23-25](/bible/Matt/6#v23-25), then [Romans 8](/bible/Rom/8).',
    'Missing in WEB: [Acts 8:37](/bible/Acts/8#v37).',
    'Bad: [nope](/bible/Fake/1#v1), [too far](/bible/Matt/12#v999), [bad shape](/bible/Matt/6/), [chap](/bible/Matt/99).',
    'Normal: [site](/about), [ext](https://example.com).',
].join('\n\n');

const html = renderToString(
    <>
        <BibleHead />
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: MarkdownLink }}>{md}</ReactMarkdown>
    </>,
);
check('badge for Matt 12:13 renders a real link', /<a [^>]*href="\/bible\/Matt\/12\/?#v13"[^>]*>Matthew 12:13<\/a>/.test(html));
check('range + chapter-only badges', html.includes('#v23-25') && /href="\/bible\/Rom\/8\/?"/.test(html));
check('invalid refs are plain links', ['/bible/Fake/1#v1', '/bible/Matt/12#v999', '/bible/Matt/6/', '/bible/Matt/99'].every((h) => html.includes(`<a href="${h}">`)));
check('ordinary links untouched', html.includes('<a href="/about">') && html.includes('rel="noopener noreferrer"'));
check('card text is NOT in SSR html until opened (card is lazy)', !html.includes('stretched forth'));
// Baked props travel in the RSC payload; verify via the data builder directly.
import { bakeVerseLink } from '@/lib/bible-server';
const m = bakeVerseLink('/bible/Matt/12#v13')!;
check('baked KJV text for Matt 12:13', m.kjv.verses[0].t?.includes('Stretch forth thine hand') === true, JSON.stringify(m.kjv.verses[0].t));
check('baked WEB text for Matt 12:13', typeof m.web.verses[0].t === 'string' && m.web.verses[0].t.length > 10);
const r = bakeVerseLink('/bible/Matt/6#v23-25')!;
check('range bakes 3 verses', r.kjv.verses.length === 3 && r.reference === 'Matthew 6:23-25');
const a37 = bakeVerseLink('/bible/Acts/8#v37')!;
check('null verse is flagged', a37.web.verses[0].t === null && a37.kjv.verses[0].t !== null);
const ch = bakeVerseLink('/bible/Rom/8')!;
check('chapter-only: first 3 verses + more', ch.kjv.verses.length === 3 && ch.kjv.more);
check('invalid hrefs -> null', ['/bible/Fake/1#v1', '/bible/Matt/12#v999', undefined, '/blog/x', '/bible/Matt/6#v25-23', '/bible/../../etc/passwd/1'].every((h) => bakeVerseLink(h as string) === null));
// Card markup (open state) rendered through PassageText: both translations present, null shown.
import { PassageText } from '@/components/bible/Passage';
const card = renderToStaticMarkup(<PassageText kjv={a37.kjv} web={a37.web} />);
check("'(not in WEB)' shown for null verse", card.includes('(not in WEB)') && card.includes('class="tr-kjv"') && card.includes('class="tr-web"'));

check('generateStaticParams = 1189', generateStaticParams().length === 1189 && allChapterParams().length === 1189);
const bigRoute = generateStaticParams();
check('params unique', new Set(bigRoute.map((p) => `${p.book}/${p.chapter}`)).size === 1189);

const out = process.argv[2];
if (out) fs.mkdirSync(out, { recursive: true });
async function page(book: string, chapter: string) {
    const params = Promise.resolve({ book, chapter });
    const el = await ChapterPage({ params });
    const md = await generateMetadata({ params });
    const h = renderToString(el);
    return { h, md };
}
(async () => {
    for (const [book, chapter, probe] of [['Matt', '12', 'Stretch forth thine hand'], ['Rev', '13', 'And I stood upon the sand'], ['3John', '1', 'The elder unto the wellbeloved Gaius']] as const) {
        const { h, md } = await page(book, chapter);
        const nverses = (h.match(/class="bible-verse/g) ?? []).length;
        const hasIds = /id="v1"/.test(h);
        check(`${book} ${chapter}: renders ${nverses} verses, ids, kjv text`, nverses > 0 && hasIds && h.includes(probe));
        check(`${book} ${chapter}: xref link + related + attribution`, h.includes(`https://dkcoleman.com/bible?ref=${book}.${chapter}.1`) && h.includes('Related passages') && h.includes('OpenBible.info') && h.includes('CC BY 4.0'));
        console.log('      title:', md.title, '| canonical:', JSON.stringify(md.alternates), '| desc:', String(md.description).slice(0, 80), '| html KB:', Math.round(h.length / 1024));
        if (out) fs.writeFileSync(path.join(out, `${book}-${chapter}.html`), h);
    }
    // Psalm 119 is the worst case for page size.
    const p119 = await page('Ps', '119');
    console.log('      Ps 119 html KB:', Math.round(p119.h.length / 1024));
    check('Ps 119 html < 300 KB', p119.h.length < 300 * 1024);
    const mt = (await page('Matt', '12')).h;
    check('related passages are links only (no baked xref text)', /href="\/bible\/Rom\/\d+\/?#v\d+/.test(mt) && !mt.includes('Rom') === false && (mt.match(/Related passages/g) ?? []).length >= 40 && mt.length < 300 * 1024);
    for (const [book, chapter] of [['Matt', '99'], ['Fake', '1'], ['Matt', 'x']]) {
        let threw = false;
        try { await ChapterPage({ params: Promise.resolve({ book, chapter }) }); } catch { threw = true; }
        check(`invalid ${book}/${chapter} -> notFound`, threw);
    }
    const sm = await sitemap();
    check('sitemap includes /bible/ and chapters', sm.some((e) => e.url === 'https://mncoleman.com/bible/') && sm.filter((e) => e.url.includes('/bible/')).length === 1190);
    if (out) {
        fs.writeFileSync(path.join(out, 'blog.html'), html);
    }
    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
