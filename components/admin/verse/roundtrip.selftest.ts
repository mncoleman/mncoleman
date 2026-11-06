/**
 * Run: npx tsx components/admin/verse/roundtrip.selftest.ts
 * Headless markdown -> document -> markdown identity for verse links, ordinary links and images,
 * using Tiptap's MarkdownManager and the editor's real extension list (no DOM needed).
 * The interactive parts (picker, composer, hover card) need a real browser.
 */
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { VerseMention } from './VerseMention';

const extensions = [
    StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
    Image.configure({ inline: false, allowBase64: false }),
    VerseMention,
];
const md = new MarkdownManager({ extensions });
const schema = getSchema(extensions);

function roundTrip(input: string): string {
    const json = md.parse(input);
    schema.nodeFromJSON(json).check(); // the document must be valid against the schema
    return md.serialize(json);
}

const cases: string[] = [
    'See [Matthew 12:13](/bible/Matt/12#v13) for this.',
    'Read [verses 23-25](/bible/Matt/6#v23-25), then [Romans 8](/bible/Rom/8).',
    'A normal [link](https://example.com/bible/Matt/6) and a [relative one](/blog/post).',
    '[Not a verse](/bible/Matt/6/) stays a link.',
    '![alt text](/uploads/pic.png)\n\nText with [Psalm 23:1](/bible/Ps/23#v1) and **bold**.',
    'Escapes: [a \\] b \\\\ c](/bible/John/3#v16) done.',
    'Amp: [Tom & Jerry \\<x> a\\*b \\_c \\`d](/bible/John/3#v16) done.',
    '> Quote text here.\n>\n> — [Matthew 6:23](/bible/Matt/6#v23) (KJV)',
    '- item with [John 1:1](/bible/John/1#v1)\n- second',
];
for (const c of cases) {
    const out = roundTrip(c);
    assert.equal(out, c, `round trip differs:\n in: ${JSON.stringify(c)}\nout: ${JSON.stringify(out)}`);
}

// Bold around a badge cannot be kept (marks do not wrap atom nodes in Tiptap's markdown): the text survives, the bold on the badge does not.
assert.equal(roundTrip('a **b [Mark 1:1](/bible/Mark/1#v1)**'), 'a **b** [Mark 1:1](/bible/Mark/1#v1)');

// Verse links become nodes; every other link stays a link mark.
const json = JSON.stringify(md.parse(cases[2] + ' [x](/bible/Matt/12#v13)'));
assert.ok(json.includes('"verseMention"'));
assert.ok(json.includes('"type":"link"'));
assert.ok(!JSON.stringify(md.parse(cases[3])).includes('verseMention'), 'non-canonical /bible/ href must stay a link');
assert.ok(!JSON.stringify(md.parse('[x](https://a.com)')).includes('verseMention'));
const node = JSON.stringify(md.parse('[verses 23-25](/bible/Matt/6#v23-25)'));
assert.match(node, /"book":"Matt","chapter":6,"start":23,"end":25|"text":"verses 23-25"/);
console.log('verse round-trip ok');
