/**
 * Run: npx tsx lib/citations.selftest.ts
 * MLA formatting, dates, reuse identity, definition parsing, and the Worker lookup's SSRF rules
 * (with a fake fetch: nothing here touches the network).
 */
import assert from 'node:assert/strict';
import {
    citationOrder, formatMla, isSafeHref, mlaDate, nextLabel, parseDefinitionLines, parseTypedDate, richSegments, sanitizeLookup, sourceKey, toMarkdown, toPlain,
} from './citations';
import { checkLookupUrl, extractMetadata, lookupPage, MAX_REDIRECTS } from './citation-lookup';

// ---- hrefs
assert.ok(isSafeHref('https://a.com') && isSafeHref('/about') && isSafeHref('#x') && isSafeHref('mailto:a@b.c'));
assert.ok(!isSafeHref('//evil.example/x') && !isSafeHref('javascript:alert(1)') && !isSafeHref('data:text/html,x'), 'protocol-relative and script hrefs are refused');

// ---- definitions with several paragraphs
assert.deepEqual(parseDefinitionLines('[^a]: One\n\n    second para\n[^b]: Two'), [{ label: 'a', text: 'One second para' }, { label: 'b', text: 'Two' }]);
assert.deepEqual(parseDefinitionLines('[^a]: One\n\nOutside paragraph\n  not continuation'), [{ label: 'a', text: 'One' }]);

assert.deepEqual(parseDefinitionLines('[^a]: One\nlazy two\n# Heading\n[^b]: B'), [{ label: 'a', text: 'One lazy two' }, { label: 'b', text: 'B' }], 'lazy continuation joins; a heading ends the definition');

// ---- MLA
const full = { author: 'Smith, Jane', title: 'Title', site: 'Website', publisher: 'Publisher', date: '2025-05-20', url: 'https://example.com', accessed: '2026-11-06' };
assert.equal(toPlain(full), 'Smith, Jane. “Title.” Website, Publisher, 20 May 2025, https://example.com. Accessed 6 Nov. 2026.');
assert.equal(toMarkdown(full), 'Smith, Jane. “Title.” *Website*, Publisher, 20 May 2025, https://example.com. Accessed 6 Nov. 2026.');
assert.equal(toMarkdown({ title: 'Only a title' }), '“Only a title.”');
assert.equal(toMarkdown({ title: 'Why?', site: 'Blog' }), '“Why?” *Blog*.');
assert.equal(toMarkdown({ author: 'Doe, J.', site: 'Site', date: '2024-03-02' }), 'Doe, J. *Site*, 2 March 2024.');
assert.equal(toMarkdown({ site: 'Same', publisher: 'Same' }), '*Same*.', 'publisher equal to website is not repeated');
assert.equal(toMarkdown({ url: 'https://a.com/x', accessed: '2026-11-06' }), 'https://a.com/x', 'URL-only shows the URL');
assert.equal(toMarkdown({ text: '  Jones, Bob.  *Book*.\n 2020. ' }), 'Jones, Bob. *Book*. 2020.', 'free text is kept as given');
assert.equal(toMarkdown({ title: 'A *star* and_under', site: 'S' }), '“A \\*star\\* and_under.” *S*.');
assert.equal(formatMla({ title: 'T', url: 'https://a.com/a_b' }).map((s) => s.t).join(''), '“T.” https://a.com/a_b.');
assert.ok(toMarkdown({ title: 'T', url: 'https://a.com/a_b_c' }).includes('https://a.com/a_b_c'), 'underscores in URLs are not escaped');
// months
const months = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
months.forEach((m, i) => assert.equal(mlaDate(`2025-${String(i + 1).padStart(2, '0')}-04`), `4 ${m} 2025`));
assert.equal(mlaDate('2025-11'), 'Nov. 2025');
assert.equal(mlaDate('2025'), '2025');
assert.equal(mlaDate('sometime in 2020'), 'sometime in 2020');
assert.equal(parseTypedDate('4 Nov. 2026'), '2026-11-04');
assert.equal(parseTypedDate('Sept 9, 2025'), '2025-09-09');
assert.equal(parseTypedDate('2026-1-5'), '2026-01-05');
assert.equal(parseTypedDate('spring'), null);

// ---- identity / numbering
assert.equal(sourceKey({ url: 'https://A.com/x/#top' }), sourceKey({ url: 'https://a.com/x' }));
assert.equal(sourceKey({ text: ' Smith  *Book* ' }), sourceKey({ text: 'smith *book*' }));
assert.notEqual(sourceKey({ url: 'https://a.com/x' }), sourceKey({ url: 'https://a.com/y' }));
assert.equal(nextLabel(['1', '2', '4']), '3');
assert.deepEqual(citationOrder(['b', 'a', 'b', 'c', 'a']), ['b', 'a', 'c']);
assert.deepEqual(parseDefinitionLines('[^a]: One\n  more\n[^b-2]: Two'), [{ label: 'a', text: 'One more' }, { label: 'b-2', text: 'Two' }]);
assert.deepEqual(richSegments('A *it* **b** [l](https://x.y) \\*lit\\* https://z.com.').map((s) => [s.t, s.i ? 'i' : s.b ? 'b' : s.href ? 'a' : '']).slice(0, 7),
    [['A ', ''], ['it', 'i'], [' ', ''], ['b', 'b'], [' ', ''], ['l', 'a'], [' ', '']]);
assert.deepEqual(sanitizeLookup({ title: ' T\u0000itle\n', author: 'x'.repeat(500), datePublished: '2025-05-20T10:00:00Z', junk: 1 }), { title: 'T itle', author: 'x'.repeat(200), datePublished: '2025-05-20' });

// ---- SSRF: URL checks
const refused = [
    'ftp://example.com/', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://example.com',
    'http://user:pw@example.com/', 'http://user@example.com/',
    'http://example.com:8080/', 'https://example.com:22/', 'http://example.com:6379/',
    'http://localhost/', 'http://LOCALHOST./', 'http://foo.localhost/', 'http://intranet/', 'http://printer.local/', 'http://db.internal/', 'http://metadata.google.internal/', 'http://nas.lan/',
    'http://127.0.0.1/', 'http://127.1/', 'http://0x7f.0.0.1/', 'http://2130706433/', 'http://017700000001/', 'http://0.0.0.0/',
    'http://10.1.2.3/', 'http://172.16.0.1/', 'http://172.31.255.255/', 'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/', 'http://224.0.0.1/', 'http://255.255.255.255/',
    'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[fe80::1]/', 'http://[2001:db8::1]/',
    'not a url', '',
];
for (const u of refused) assert.equal(checkLookupUrl(u).ok, false, `must refuse ${u}`);
const allowed = ['https://example.com/a?b=1#c', 'http://example.com/', 'https://en.wikipedia.org/wiki/X', 'https://example.com:443/', 'http://example.com:80/', 'http://8.8.8.8/', 'https://sub.domain.example.co.uk/p'];
for (const u of allowed) assert.equal(checkLookupUrl(u).ok, true, `must allow ${u}`);
assert.equal(checkLookupUrl('//127.0.0.1/x', 'https://example.com/').ok, false, 'relative redirect targets are validated after resolving');

// ---- metadata extraction
const html = `<html><head><title>Fallback &amp; title</title>
<meta property="og:title" content="The &quot;Real&quot; Title"><meta property="og:site_name" content="Site Name">
<meta name="author" content="Jane Smith"><meta property="article:published_time" content="2025-05-20T08:00:00+00:00">
<script type="application/ld+json">{"@graph":[{"@type":"Article","publisher":{"@type":"Organization","name":"Pub Co"},"datePublished":"2024-01-01"}]}</script></head><body>SECRET BODY</body></html>`;
assert.deepEqual(extractMetadata(html, 'https://www.example.com/x'), { title: 'The "Real" Title', author: 'Jane Smith', website: 'Site Name', publisher: 'Pub Co', datePublished: '2025-05-20' });
assert.deepEqual(extractMetadata('<title>Just a title</title>', 'https://www.example.org/p'), { title: 'Just a title', website: 'example.org' });
assert.deepEqual(extractMetadata('<meta name="author" content="https://x.com/profile"><title>T</title>', 'https://a.com/'), { title: 'T', website: 'a.com' }, 'an author that is a URL is ignored');

// ---- lookup flow with a fake fetch
const page = (body: string, type = 'text/html; charset=utf-8', status = 200, extra: Record<string, string> = {}) => new Response(body, { status, headers: { 'content-type': type, ...extra } });
const calls: { url: string; init: RequestInit }[] = [];
const fake = (routes: Record<string, () => Response>) => async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = routes[url];
    if (!r) throw new Error('unreachable');
    return r();
};
(async () => {
    let r = await lookupPage('https://example.com/a', fake({ 'https://example.com/a': () => page(html) }));
    assert.ok(r.ok && r.result.title === 'The "Real" Title');
    assert.ok(!JSON.stringify(r).includes('SECRET BODY'), 'the body is never returned');
    const sent = calls[0].init;
    assert.equal(sent.redirect, 'manual');
    assert.ok(sent.signal, 'has a timeout signal');
    const hdrs = Object.keys(sent.headers as Record<string, string>).map((h) => h.toLowerCase());
    assert.ok(!hdrs.includes('cookie') && !hdrs.includes('authorization'), 'no cookies or auth forwarded');
    assert.equal(sent.credentials, undefined);

    // Redirect chain: each hop is validated, at most 3.
    calls.length = 0;
    r = await lookupPage('https://example.com/a', fake({
        'https://example.com/a': () => page('', 'text/html', 302, { location: '/b' }),
        'https://example.com/b': () => page('', 'text/html', 301, { location: 'https://other.example.net/c' }),
        'https://other.example.net/c': () => page('<title>Landed</title>'),
    }));
    assert.ok(r.ok && r.result.title === 'Landed');
    assert.equal(calls.length, 3);
    // A redirect into a private address is refused before it is requested.
    calls.length = 0;
    r = await lookupPage('https://example.com/a', fake({ 'https://example.com/a': () => page('', 'text/html', 302, { location: 'http://169.254.169.254/latest/meta-data/' }) }));
    assert.deepEqual(r, { ok: false, error: 'lookup_failed' });
    assert.equal(calls.length, 1, 'the internal hop was never fetched');
    for (const loc of ['http://localhost/', 'http://10.0.0.5/', 'file:///etc/passwd', 'https://u:p@example.com/', 'https://example.com:8443/']) {
        calls.length = 0;
        r = await lookupPage('https://example.com/a', fake({ 'https://example.com/a': () => page('', 'text/html', 302, { location: loc }) }));
        assert.equal(r.ok, false, `redirect to ${loc}`);
        assert.equal(calls.length, 1);
    }
    // Too many redirects.
    calls.length = 0;
    const loop: Record<string, () => Response> = {};
    for (let i = 0; i < 10; i++) loop[`https://example.com/${i}`] = () => page('', 'text/html', 302, { location: `/${i + 1}` });
    r = await lookupPage('https://example.com/0', fake(loop));
    assert.equal(r.ok, false);
    assert.equal(calls.length, MAX_REDIRECTS + 1);
    // Non-HTML, error statuses, network failure, invalid input.
    assert.equal((await lookupPage('https://example.com/a', fake({ 'https://example.com/a': () => page('{}', 'application/json') }))).ok, false);
    assert.equal((await lookupPage('https://example.com/a', fake({ 'https://example.com/a': () => page('x', 'text/html', 404) }))).ok, false);
    assert.equal((await lookupPage('https://example.com/a', fake({}))).ok, false);
    assert.deepEqual(await lookupPage('http://127.0.0.1/', fake({})), { ok: false, error: 'invalid_url' });
    // Body cap: a huge page is cut, and the metadata in the first 512 KB still comes back.
    const big = '<title>Early</title>' + 'x'.repeat(2_000_000);
    r = await lookupPage('https://example.com/big', fake({ 'https://example.com/big': () => page(big) }));
    assert.ok(r.ok && r.result.title === 'Early');
    console.log('citations lib + lookup ok');
})();

// ---- URL detection (which address a citation opens)
import { firstUrl, safeHttpUrl, sourceHref } from './citations';
{
    const cases: [string, string | null][] = [
        ['Smith. *Site*, https://example.com/a. Accessed 6 Nov. 2026.', 'https://example.com/a'],
        ['See https://example.com/a?b=1&c=2#frag, then more.', 'https://example.com/a?b=1&c=2#frag'],
        ['Wiki. https://en.wikipedia.org/wiki/Function_(mathematics). Accessed 1 Jan. 2026.', 'https://en.wikipedia.org/wiki/Function_(mathematics)'],
        ['(see https://example.com/x)', 'https://example.com/x'],
        ['Title. [Site](https://example.com/page) 2020.', 'https://example.com/page'],
        ['*https://example.com/em*.', 'https://example.com/em'],
        ['x https://a.com/q?x=(1)).', 'https://a.com/q?x=(1)'],
        ['Quoted "https://example.com/q".', 'https://example.com/q'],
        ['[bad](javascript:alert(1)) and https://ok.com/z', 'https://ok.com/z'],
        ['[bad](javascript:alert(1))', null],
        ['javascript:alert(1)', null],
        ['data:text/html,<script>', null],
        ['ftp://example.com/file', null],
        ['mailto:a@b.com', null],
        ['file:///etc/passwd', null],
        ['No address here. Smith 2020.', null],
        ['https://', null],
    ];
    for (const [text, want] of cases) assert.equal(firstUrl(text), want, `firstUrl(${JSON.stringify(text)})`);
    assert.equal(safeHttpUrl('JavaScript:alert(1)'), null);
    assert.equal(safeHttpUrl(' https://a.com '), 'https://a.com');
    assert.equal(sourceHref({ url: 'https://a.com/x', title: 'T' }), 'https://a.com/x');
    assert.equal(sourceHref({ url: 'javascript:alert(1)' }), null);
    assert.equal(sourceHref({ text: 'Jones. *Book*. 2020. https://b.org/p. Accessed 3 Mar. 2026.' }), 'https://b.org/p');
    assert.equal(sourceHref({ text: 'Jones. *Book*. 2020.' }), null);
    console.log('citations url detection ok');
}

// ---- partial dates (year only, year + month, full)
{
    assert.equal(mlaDate('2025'), '2025');
    assert.equal(mlaDate('2025-05'), 'May 2025');
    assert.equal(mlaDate('2025-09'), 'Sept. 2025');
    assert.equal(mlaDate('2025-03'), 'March 2025');
    assert.equal(mlaDate('2025-05-20'), '20 May 2025');
    assert.equal(parseTypedDate('2025'), '2025');
    assert.equal(parseTypedDate('2025-5'), '2025-05');
    assert.equal(parseTypedDate('2025-13'), null);
    assert.equal(parseTypedDate('May 2025'), '2025-05');
    assert.equal(parseTypedDate('Sept. 2025'), '2025-09');
    assert.equal(parseTypedDate('november 2026'), '2026-11');
    assert.equal(parseTypedDate('20 May 2025'), '2025-05-20');
    assert.equal(parseTypedDate('Flapjack 2025'), null);
    const base = { author: 'Smith, Jane', title: 'T', site: 'S', url: 'https://a.com', accessed: '2026-11-06' };
    assert.equal(toPlain({ ...base, date: '2025' }), 'Smith, Jane. “T.” S, 2025, https://a.com. Accessed 6 Nov. 2026.');
    assert.equal(toPlain({ ...base, date: '2025-05' }), 'Smith, Jane. “T.” S, May 2025, https://a.com. Accessed 6 Nov. 2026.');
    assert.equal(toPlain({ ...base, date: '2025-05-20' }), 'Smith, Jane. “T.” S, 20 May 2025, https://a.com. Accessed 6 Nov. 2026.');
    assert.equal(toMarkdown({ ...base, date: '2025-08', accessed: '2026-09-09' }), 'Smith, Jane. “T.” *S*, Aug. 2025, https://a.com. Accessed 9 Sept. 2026.');
    assert.equal(sanitizeLookup({ datePublished: '2025-05-20T08:00:00Z' }).datePublished, '2025-05-20');
    console.log('citations partial dates ok');
}
