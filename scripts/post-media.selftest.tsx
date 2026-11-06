/**
 * Render checks for post media, no Next build needed:
 *   npx tsx scripts/post-media.selftest.tsx
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PostMarkdown } from '@/components/blog-media/PostMarkdown';
import { parseEmbedTitle, parseFigureSrc, resolveEmbedHref } from '@/lib/post-media';
import { sizeOfBuffer } from '@/lib/post-media-server';

let failed = 0;
function check(name: string, ok: boolean, extra = '') {
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}
const render = (md: string) => renderToStaticMarkup(<PostMarkdown content={md} />);

// Mermaid: server output is the plain code block (no-JS fallback), wrapped for the client swap.
{
    const h = render('```mermaid\ngraph TD\n  A-->B\n```\n\n```js\nconst x = 1;\n```');
    check('mermaid block keeps its source in a code block', h.includes('post-mermaid') && h.includes('language-mermaid') && h.includes('A--&gt;B'));
    check('other code blocks untouched', h.includes('<pre><code class="language-js">const x = 1;'));
}
// Figures
{
    const h = render('![Alt one](/favicon.svg "Caption **one**")');
    check('figure with caption', h.includes('<figure class="post-figure not-prose" data-paper="true">') && h.includes('<figcaption>Caption **one**</figcaption>'));
    check('svg size reserved from viewBox', h.includes('width="100"') && h.includes('height="100"'));
    check('lazy image', h.includes('loading="lazy"') && h.includes('alt="Alt one"'));
    const plain = render('![Plain](/collections/globe-1.jpeg)');
    check('plain image: figure, no caption, no paper, size known', plain.includes('post-figure') && !plain.includes('figcaption') && !plain.includes('data-paper') && /width="\d+"/.test(plain));
    check('#plain opts out of paper', !render('![x](/favicon.svg#plain "c")').includes('data-paper'));
    check('inline image stays an inline <img> in its paragraph', /<p>Hi <img src="\/a\.png" alt="i"\/> there<\/p>/.test(render('Hi ![i](/a.png) there')));
    check('image inside a link stays untouched', render('[![i](/a.png)](/x)').includes('<p><a href="/x"><img src="/a.png" alt="i"/></a></p>') && !render('[![i](/a.png)](/x)').includes('figure'));
    check('unsafe image src is not turned into a figure', !render('![x](javascript:alert(1))').includes('post-figure'));
}
// Embeds
{
    const ok = render('[Bible whiteboard](/artifacts/bible-whiteboard/ "embed")');
    check('valid static embed', ok.includes('<iframe src="/artifacts/bible-whiteboard.html"') && ok.includes('sandbox="allow-scripts') && ok.includes('loading="lazy"') && ok.includes('Open full page'));
    check('embed default height', ok.includes('height:min(560px, 85svh)'));
    check('embed:480 and embed:square', render('[x](/artifacts/tmux-guide.html "embed:480")').includes('min(480px') && render('[x](/artifacts/tmux-guide "embed:square")').includes('aspect-ratio:1 / 1'));
    const dyn = render('[Live](https://artifacts.mncoleman.com/a/my-page "embed")');
    check('dynamic embed', dyn.includes('<iframe src="https://artifacts.mncoleman.com/a/my-page"'));
    const sbx = (html: string) => /sandbox="([^"]*)"/.exec(html)?.[1] ?? '';
    check('embed frames keep clipboard-write', ok.includes('allow="clipboard-write"'));
    check('static embed has no allow-same-origin', !sbx(ok).includes('allow-same-origin') && sbx(ok).includes('allow-scripts'));
    check('dynamic embed keeps allow-same-origin (its own origin)', sbx(dyn).includes('allow-same-origin'));
    for (const [label, md] of [
        ['third-party host', '[x](https://evil.example.com/a/foo "embed")'],
        ['lookalike host', '[x](https://artifacts.mncoleman.com.evil.com/a/foo "embed")'],
        ['http scheme', '[x](http://artifacts.mncoleman.com/a/foo "embed")'],
        ['credentials', '[x](https://u:p@artifacts.mncoleman.com/a/foo "embed")'],
        ['javascript url', '[x](javascript:alert(1) "embed")'],
        ['artifact not in manifest', '[x](/artifacts/definitely-not-there "embed")'],
        ['path traversal', '[x](/artifacts/../../etc/passwd "embed")'],
        ['bad dynamic slug', '[x](https://artifacts.mncoleman.com/a/../admin "embed")'],
        ['bad title variant', '[x](/artifacts/tmux-guide "embed:evil")'],
        ['not alone in paragraph', 'See [x](/artifacts/tmux-guide "embed") here'],
    ] as const) {
        const h = render(md);
        check(`no iframe: ${label}`, !h.includes('<iframe'));
    }
    check('non-embed link to an artifact is a normal link', render('[x](/artifacts/tmux-guide)') === '<p><a href="/artifacts/tmux-guide">x</a></p>');
    check('invalid embed degrades to a normal link', render('[x](https://evil.example.com/a "embed")').includes('<a href="https://evil.example.com/a" target="_blank" rel="noopener noreferrer" title="embed">x</a>'));
}
// Verse links and ordinary links as before
{
    const h = render('See [Matthew 12:13](/bible/Matt/12#v13) and [site](/about), [ext](https://example.com).');
    check('verse badge still renders', /<a [^>]*href="\/bible\/Matt\/12\/?#v13"[^>]*>Matthew 12:13<\/a>/.test(h));
    check('ordinary links as before', h.includes('<a href="/about">site</a>') && h.includes('rel="noopener noreferrer"'));
}
// Pure helpers
check('parseEmbedTitle', parseEmbedTitle('embed')?.height === 560 && parseEmbedTitle('EMBED:900')?.height === 900 && parseEmbedTitle('embed:50') === null && parseEmbedTitle('embedded') === null && parseEmbedTitle('') === null && parseEmbedTitle('embed:9999')?.height === 1200);
check('parseFigureSrc', parseFigureSrc('/a.svg').paper && !parseFigureSrc('/a.jpg').paper && parseFigureSrc('/a.jpg#paper').paper && parseFigureSrc('/a.svg#plain').src === '/a.svg');
check('resolveEmbedHref by filename/slug', resolveEmbedHref('/artifacts/tmux-guide.html', [{ filename: 'tmux-guide.html' }])?.src === '/artifacts/tmux-guide.html');
const png = Buffer.alloc(32);
Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(png);
png.writeUInt32BE(640, 16);
png.writeUInt32BE(480, 20);
check('png size', JSON.stringify(sizeOfBuffer(png, 'a.png')) === '{"width":640,"height":480}');

console.log(failed ? `\n${failed} FAILED` : '\nall post-media render checks passed');
process.exit(failed ? 1 : 0);
