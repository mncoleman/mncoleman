/**
 * Run: npx tsx components/admin/media/roundtrip.selftest.ts
 * Markdown -> document -> Markdown identity for the three post-media syntaxes, with the
 * editor's real extensions (headless MarkdownManager, no DOM).
 */
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { CaptionImage } from './caption-image';
import { VerseMention } from '../verse/VerseMention';
import { MediaDecorations, isEmbedParagraph } from './media-decorations';
import { cleanCaption, MERMAID_STARTER } from './insert';
import { parseEmbedTitle } from '../../../lib/post-media';

const extensions = [
    StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
    CaptionImage.configure({ inline: false, allowBase64: false }),
    VerseMention,
    MediaDecorations,
];
const md = new MarkdownManager({ extensions });
const schema = getSchema(extensions);

function roundTrip(input: string): string {
    const json = md.parse(input);
    schema.nodeFromJSON(json).check();
    return md.serialize(json);
}

const cases: Record<string, string> = {
    mermaid: '```mermaid\n' + MERMAID_STARTER + '\n```',
    'mermaid then text': '```mermaid\ngraph LR\n  A-->B\n```\n\nAfter.',
    'figure caption': '![alt text](/collections/x.png "Caption text")',
    'figure caption svg + plain': '![A diagram](/collections/flow.svg#plain "Figure 1: the flow")',
    'plain image': '![alt text](/collections/x.png)',
    embed: '[Bible whiteboard](/artifacts/bible-whiteboard.html "embed")',
    'embed variants': '[A](/artifacts/a.html "embed:480")\n\n[B](https://artifacts.mncoleman.com/a/my-page "embed:square")',
    'verse + normal link untouched': 'See [Matthew 12:13](/bible/Matt/12#v13) and [a link](/about).',
    'alt with brackets': '![see \\[fig 1\\] and a\\b](/collections/x.png "Cap")',
    'link with ordinary title': '[site](https://example.com "Example")',
};
for (const [name, c] of Object.entries(cases)) {
    const out = roundTrip(c);
    assert.equal(out, c, `${name} differs:\n in: ${JSON.stringify(c)}\nout: ${JSON.stringify(out)}`);
}

// Document shape: the caption is the image title, the embed is a link mark titled "embed".
const img = JSON.stringify(md.parse(cases['figure caption']));
assert.match(img, /"title":"Caption text"/);
const docEmbed = schema.nodeFromJSON(md.parse(cases.embed));
assert.ok(isEmbedParagraph(docEmbed.child(0)), 'embed paragraph detected');
assert.ok(!isEmbedParagraph(schema.nodeFromJSON(md.parse('[x](/a "Example")')).child(0)), 'ordinary titled link is not an embed');
assert.ok(!isEmbedParagraph(schema.nodeFromJSON(md.parse('See [x](/a "embed") here')).child(0)), 'embed link inside prose is not an embed');
assert.ok(parseEmbedTitle('embed:square')?.square);
assert.ok(JSON.stringify(md.parse(cases.mermaid)).includes('"language":"mermaid"'));

// Editor-built nodes serialize to the same syntax.
const built = {
    type: 'doc',
    content: [
        { type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: 'graph LR\n  A-->B' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Whiteboard', marks: [{ type: 'link', attrs: { href: '/artifacts/bible-whiteboard.html', title: 'embed' } }] }] },
        { type: 'image', attrs: { src: '/c/x.png', alt: 'a', title: 'Cap' } },
    ],
};
schema.nodeFromJSON(built).check();
assert.equal(md.serialize(built), '```mermaid\ngraph LR\n  A-->B\n```\n\n[Whiteboard](/artifacts/bible-whiteboard.html "embed")\n\n![a](/c/x.png "Cap")');

// Quotes in captions: the input converts them, so the title never breaks the Markdown.
assert.equal(cleanCaption('He said "hi" and "bye"'), 'He said “hi” and “bye”');
const cap = cleanCaption('A "quoted" caption');
assert.equal(roundTrip(`![a](/x.png "${cap}")`), `![a](/x.png "${cap}")`);

// Claude may hand-write an escaped quote in a title.
const esc = roundTrip('![a](/x.png "say \\"hi\\"")');
assert.equal(esc, '![a](/x.png "say \\"hi\\"")', 'escaped quotes in a title round-trip');
assert.match(JSON.stringify(md.parse('![a](/x.png "say \\"hi\\"")')), /"title":"say \\"hi\\""/);
console.log('media round-trip ok');

// Alt text with brackets: serialized with escapes, reads back as the same alt.
{
    const alt = 'a [b] c] d';
    const doc = { type: 'doc', content: [{ type: 'image', attrs: { src: '/collections/x.png', alt, title: null } }] };
    const text = md.serialize(doc);
    assert.equal(text, '![a \\[b\\] c\\] d](/collections/x.png)');
    const back = md.parse(text) as { content: { attrs: { alt: string } }[] };
    assert.equal(back.content[0].attrs.alt, alt, 'alt survives a round trip');
    assert.equal(md.serialize(back), text);
    // A trailing backslash must not swallow the closing bracket.
    const tail = md.serialize({ type: 'doc', content: [{ type: 'image', attrs: { src: '/x.png', alt: 'path\\', title: null } }] });
    assert.ok((md.parse(tail) as { content: { type: string }[] }).content[0].type === 'image', 'trailing backslash alt still parses as an image: ' + tail);
}
console.log('alt escaping ok');
