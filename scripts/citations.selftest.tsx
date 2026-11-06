/**
 * Render checks for post citations (GFM footnotes), no Next build needed:
 *   npx tsx scripts/citations.selftest.tsx
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PostMarkdown } from '@/components/blog-media/PostMarkdown';

let failed = 0;
function check(name: string, ok: boolean, extra = '') {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}
const markers = (h: string) => [...h.matchAll(/class="cite-ref"[^>]*>\[(\d+)\]/g)].map((m) => m[1]);
const render = (md: string) => renderToStaticMarkup(<PostMarkdown content={md} />);

const DEF = '[^1]: Smith, Jane. “Title.” *Website*, Publisher, 20 May 2025, https://example.com. Accessed 6 Nov. 2026.';
{
    const h = render(`A claim[^1] and again[^1].\n\n${DEF}`);
    check('marker with a URL in its source links to that URL in a new tab', /<a href="https:\/\/example\.com" id="user-content-fnref-1" target="_blank" rel="noopener noreferrer" data-footnote-ref="" class="cite-ref"/.test(h));
    check('marker sits in a superscript with the card', h.includes('<sup class="cite-sup"><span class="cite-wrap">'));
    check('card has Open source and Go to citation', h.includes('>Open source</a>') && h.includes('href="#user-content-fn-1" data-cite-go=""') && h.includes('Go to citation'));
    check('marker title carries the formatted citation as plain text', h.includes('title="Smith, Jane. \u201CTitle.\u201D Website, Publisher, 20 May 2025, https://example.com. Accessed 6 Nov. 2026."'));
    check('second use of one source keeps number 1', (h.match(/class="cite-ref"/g) || []).length === 2 && !h.includes('[2]</a>'));
    check('section is a closed <details> with the count', h.includes('<details class="post-cites not-prose">') && !h.includes('<details class="post-cites not-prose" open') && h.includes('<span>Citations (1)</span>'));
    check('summary exposes aria-expanded', h.includes('<summary aria-expanded="false">'));
    check('entry text keeps MLA italics and links the URL', h.includes('<em>Website</em>') && h.includes('<a href="https://example.com"'));
    check('back link says "Back to text" with an arrow icon and no default glyph', h.includes('aria-label="Back to text"') && h.includes('title="Back to text"') && h.includes('class="cite-back"') && !h.includes('↩'));
    check('second back link is distinguished', h.includes('aria-label="Back to text (2)"'));
    check('the sr-only Footnotes heading is gone', !h.includes('footnote-label') && !h.includes('Footnotes'));
    check('no aria-describedby pointing at the removed heading', !h.includes('aria-describedby'));
    check('the card holds links, so it is a dialog and not a tooltip', h.includes('class="cite-card" role="dialog" aria-label="Source 1"') && !h.includes('role="tooltip"'));
}
{
    const h = render('See [^caret](https://example.com/x) here.');
    check('a link whose text starts with ^ stays a normal link', h.includes('<a href="https://example.com/x"') && h.includes('^caret') && !h.includes('data-footnote-ref'));
}
{
    const h = render('No address[^n] and a bad scheme[^j].\n\n[^n]: Jones, Bob. *Book*. 2020.\n[^j]: [click](javascript:alert(1)) Evil.');
    check('no URL: marker jumps to its entry, no new tab', /<a href="#user-content-fn-n" id="user-content-fnref-n" data-footnote-ref="" class="cite-ref"/.test(h) && !/id="user-content-fnref-n"[^>]*target=/.test(h));
    check('no URL: card offers only Go to citation', !h.slice(0, h.indexOf('<details')).includes('Open source'));
    check('javascript: is never a link target', !h.includes('javascript:'));
}
{
    // Hand-written: non-numeric labels, definitions out of order, numbered by first appearance.
    const h = render('Jones[^jones] then Smith[^smith].\n\n[^smith]: Smith, Jane. *Book*.\n[^jones]: Jones, Bob. *Other*.');
    check('numbering follows first appearance, not label or definition order', markers(h).join() === '1,2' && /fnref-jones"[^>]*>\[1\]/.test(h) && h.indexOf('Jones, Bob. <em>Other') < h.indexOf('Smith, Jane. <em>Book'));
    check('count is 2', h.includes('Citations (2)'));
}
{
    const plain = '# Title\n\nJust text with a [link](https://example.com) and a [verse](/bible/Matt/6#v23).';
    const h = render(plain);
    check('no footnotes: no citations section', !h.includes('<details') && !h.includes('post-cites') && !h.includes('cite-'));
    check('verse links and external links as before', h.includes('target="_blank"') && h.includes('/bible/Matt/6'));
    check('a stray [^x] without a definition stays literal text', render('Hello[^x] there').includes('[^x]') && !render('Hello[^x] there').includes('post-cites'));
}
{
    const h = render(`Fig below[^1]\n\n![Alt](/favicon.svg "Cap")\n\n\`\`\`mermaid\ngraph TD\n A-->B\n\`\`\`\n\n[Embed](/artifacts/bible-whiteboard/ "embed")\n\n#### Small heading\n\n${DEF}`);
    check('figures, mermaid, embeds and h4 still render alongside citations', h.includes('post-figure') && h.includes('post-mermaid') && h.includes('<iframe') && h.includes('<h4>Small heading</h4>') && h.includes('Citations (1)'));
}
{
    const h = render('A[^a] B[^b]\n\n## Real heading\n\n[^a]: One.\n[^b]: Two.');
    check('a real h2 is untouched', h.includes('<h2>Real heading</h2>'));
}
console.log(failed ? `\n${failed} FAILED` : '\ncitations render ok');
process.exit(failed ? 1 : 0);
