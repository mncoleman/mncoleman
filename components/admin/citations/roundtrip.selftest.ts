/**
 * Run: npx tsx components/admin/citations/roundtrip.selftest.ts
 * Markdown -> document -> Markdown for citations (GFM footnotes), with the editor's real node
 * extensions (headless MarkdownManager), plus the normalisation and numbering rules on a real
 * ProseMirror state. The interactive parts (the @ popup, Tab, hover card) need a browser.
 */
import assert from 'node:assert/strict';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { EditorState } from '@tiptap/pm/state';
import { CaptionImage } from '../media/caption-image';
import { VerseMention } from '../verse/VerseMention';
import { citationNodes } from './Citations';
import { findSameSource, modelOf, normalizeTr, withSource } from './citation-doc';
import { sourceKey } from '../../../lib/citations';

const extensions = [
    StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
    CaptionImage.configure({ inline: false, allowBase64: false }),
    VerseMention,
    ...citationNodes,
];
const md = new MarkdownManager({ extensions });
const schema = getSchema(extensions);

function load(input: string) {
    const json = md.parse(input);
    const node = schema.nodeFromJSON(json);
    node.check();
    return { json, node };
}
function stateOf(input: string) {
    let state = EditorState.create({ doc: load(input).node });
    const tr = normalizeTr(state);
    if (tr) state = state.apply(tr);
    return state;
}
const out = (state: EditorState) => md.serialize(state.doc.toJSON());

const DEF1 = '[^1]: Smith, Jane. “Title.” *Website*, Publisher, 20 May 2025, https://example.com. Accessed 6 Nov. 2026.';

// 1. Identity for what the editor writes (in-order numeric labels, free-text and structured lines).
const identity = [
    `A claim[^1] and more.\n\n${DEF1}`,
    'One[^1] and two[^2].\n\n[^1]: First source.\n[^2]: Second *source*, https://example.org.',
    'Cited twice[^1], here[^1].\n\n[^1]: Only one definition.',
    'With [a verse](/bible/Matt/6#v23)[^1] and **bold**[^1] text.\n\n[^1]: Source.',
    'Heading\n\n## Section\n\nText[^a1]\n\n[^a1]: Alpha.',
];
for (const c of identity) {
    const s = stateOf(c);
    assert.equal(out(s), c, `round trip differs:\n in: ${JSON.stringify(c)}\nout: ${JSON.stringify(out(s))}`);
}

// 2. Hand-written: non-numeric labels survive as written.
{
    const c = 'Per Smith[^smith] and Jones[^jones-2020], and Smith again[^smith].\n\n[^smith]: Smith, Jane. *Book*. 2020.\n[^jones-2020]: Jones, Bob. Other. 2020.';
    const s = stateOf(c);
    assert.equal(out(s), c);
    const m = modelOf(s.doc);
    assert.deepEqual(m.order, ['smith', 'jones-2020'], 'numbering is by first appearance');
    assert.equal(m.uses.get('smith'), 2);
}

// 3. Definitions authored out of order, and before the text, and blank-line separated: all load,
//    and are kept exactly once, last, in the order they were written.
{
    const c = '[^b]: Second written first.\n\n[^a]: First written second.\n\nBody cites a[^a] then b[^b].';
    const s = stateOf(c);
    const m = modelOf(s.doc);
    assert.deepEqual(m.order, ['a', 'b']);
    assert.equal(out(s), 'Body cites a[^a] then b[^b].\n\n[^b]: Second written first.\n[^a]: First written second.');
    // Idempotent: a second pass changes nothing.
    assert.equal(out(stateOf(out(s))), out(s));
}

// 4. Continuation lines stay inside the definition, as written.
{
    const s = stateOf('Text[^1]\n\n[^1]: Long entry that\n    continues here.');
    assert.equal(out(s), 'Text[^1]\n\n[^1]: Long entry that\n    continues here.');
    assert.equal(modelOf(s.doc).sources.get('1')?.text, 'Long entry that continues here.');
}

// 5. A marker with no definition is plain text again; a definition no marker uses is kept as written ("Not cited yet").
{
    const s = stateOf('Dangling[^nope] and used[^1].\n\n[^1]: Real.\n[^unused]: Nobody cites me.');
    assert.equal(out(s), 'Dangling\\[^nope\\] and used[^1].\n\n[^1]: Real.\n[^unused]: Nobody cites me.');
    assert.deepEqual(modelOf(s.doc).unused, ['unused']);
}

// 6. Renumbering is live: inserting a marker earlier shifts the others.
{
    const s = stateOf('First[^x] then second[^y].\n\n[^x]: X.\n[^y]: Y.');
    assert.deepEqual(modelOf(s.doc).order, ['x', 'y']);
    const para = s.doc.firstChild!;
    const ref = schema.nodes.citationRef.create({ label: 'y' });
    // Put a y marker at the very start of the paragraph: y becomes [1], x becomes [2].
    const tr = s.tr.insert(1, ref);
    const s2 = s.apply(tr);
    assert.deepEqual(modelOf(s2.doc).order, ['y', 'x']);
    assert.ok(para.childCount > 0);
    // Removing the only marker for x drops its definition (the invariant keeper runs on every change).
    let s3 = s2;
    s3.doc.descendants((n, pos) => {
        if (n.type.name === 'citationRef' && n.attrs.label === 'x') s3 = s3.apply(s3.tr.delete(pos, pos + 1));
    });
    const fix = normalizeTr(s3);
    if (fix) s3 = s3.apply(fix);
    assert.deepEqual(modelOf(s3.doc).unused, ['x'], 'a definition whose last marker was deleted becomes "not cited yet"');
    assert.ok(out(s3).includes('[^y]: Y.'));
}

// 7. Reuse: an identical source maps to the same label; a new one gets the next free number.
{
    const s = stateOf(`Text[^1]\n\n${DEF1}`);
    const m = modelOf(s.doc);
    const entries = [{ label: '1', source: { text: DEF1.slice(6) } }];
    assert.equal(findSameSource(m, { text: DEF1.slice(6).toUpperCase() }), '1', 'text identity ignores case and spacing');
    const a = withSource(m, entries, { url: 'https://new.example/x/' });
    assert.equal(a.label, '2');
    const m2 = { ...m, sources: new Map([...m.sources, ['2', { url: 'https://new.example/x/' }]]), order: ['1', '2'] };
    assert.equal(withSource(m2, a.entries, { url: 'https://NEW.example/x#frag' }).label, '2', 'same URL (case, trailing slash, fragment) reuses');
    assert.equal(sourceKey({ url: 'https://a.com/' }), sourceKey({ url: 'https://a.com' }));
    const used = withSource({ ...m, order: ['1', '3'] }, [{ label: '1', source: {} }, { label: '3', source: { text: 'z' } }], { text: 'brand new' });
    assert.equal(used.label, '2', 'smallest free number');
}

// 8. The defs node is valid last, and the ref is an inline atom inside a paragraph.
{
    const s = stateOf('Text[^1]\n\n[^1]: Src.');
    assert.equal(s.doc.lastChild!.type.name, 'citationDefs');
    assert.equal(s.doc.firstChild!.lastChild!.type.name, 'citationRef');
}

// 9. Plain documents are untouched.
{
    const c = 'No notes here, just [a link](https://example.com) and more.';
    assert.equal(out(stateOf(c)), c);
}
console.log('citations round-trip ok');

// 10. All-numeric labels follow the numbers shown; hand-labelled ones are never touched.
{
    const s = stateOf('B[^2] then A[^1] then B again[^2].\n\n[^1]: a.\n[^2]: b.');
    assert.equal(out(s), 'B[^1] then A[^2] then B again[^1].\n\n[^1]: b.\n[^2]: a.');
    assert.equal(out(stateOf(out(s))), out(s), 'stable after relabelling');
    const named = 'B[^z] then A[^a].\n\n[^z]: b.\n[^a]: a.';
    assert.equal(out(stateOf(named)), named);
    const mixed = 'B[^2] then A[^smith].\n\n[^2]: b.\n[^smith]: a.';
    assert.equal(out(stateOf(mixed)), mixed, 'mixed numeric + named labels are left alone');
}
console.log('citations numeric relabel ok');

// 11. Unreferenced definitions are kept verbatim, in order, after the cited ones; numeric relabelling never collides with them.
{
    const c = 'Body[^2].\n\n[^1]: Unused one.\n[^2]: Cited.\n[^9]: Unused nine.';
    const s = stateOf(c);
    // [^2] is the first (only) marker, so it would be relabelled to 1: that is held by an uncited definition, so labels stay.
    assert.equal(out(s), 'Body[^2].\n\n[^2]: Cited.\n[^1]: Unused one.\n[^9]: Unused nine.');
    assert.equal(out(stateOf(out(s))), out(s), 'stable');
    const only = 'No markers at all.\n\n[^a]: Left alone.';
    assert.equal(out(stateOf(only)), only);
}

// 12. Multi-line and multi-paragraph definitions survive a load/save untouched.
{
    const c = 'Text[^1] and more[^2].\n\n[^1]: First line\n    continued here\n\n    A second paragraph.\n[^2]: Plain.';
    const s = stateOf(c);
    assert.equal(out(s), c, 'multi-paragraph definition is written back as it was');
    const m = modelOf(s.doc);
    assert.equal(m.sources.get('1')?.text, 'First line continued here A second paragraph.');
    // Editing the entry replaces the verbatim body with the form's one-line output.
    const defs = s.doc.lastChild!;
    const entries = (defs.attrs.entries as { label: string; source: object; raw?: string }[]).map((e) => (e.label === '1' ? { label: '1', source: { text: 'Rewritten.' } } : e));
    const edited = s.apply(s.tr.setNodeMarkup(s.doc.content.size - defs.nodeSize, undefined, { entries }));
    assert.equal(out(edited), 'Text[^1] and more[^2].\n\n[^1]: Rewritten.\n[^2]: Plain.');
    // Continuation inside the definitions block does not swallow a following paragraph.
    const after = 'Text[^1].\n\n[^1]: Source.\n\nNot part of it.';
    assert.equal(out(stateOf(after)), 'Text[^1].\n\nNot part of it.\n\n[^1]: Source.');
}

// 13. A link whose text starts with a caret is a normal link, not a marker.
{
    const c = 'See [^caret](https://example.com/x) now.';
    const s = stateOf(c);
    assert.equal(out(s), c);
    assert.equal(modelOf(s.doc).refs.length, 0);
    const both = 'Claim[^1] and [^caret](https://example.com).\n\n[^1]: Src.';
    assert.equal(out(stateOf(both)), both);
    assert.equal(modelOf(stateOf(both).doc).refs.length, 1);
}
console.log('citations preserve ok');

// 14. A lazy continuation (unindented line straight after the definition) stays in it; a block start does not; long single-line definitions are not cut.
{
  const lazy = 'Text[^1].\n\n[^1]: First part\nlazy second part.';
  assert.equal(out(stateOf(lazy)), lazy, 'lazy continuation is written back as it was');
  assert.equal(modelOf(stateOf(lazy).doc).sources.get('1')?.text, 'First part lazy second part.');
  const heading = 'Text[^1].\n\n[^1]: Source.\n## Next heading';
  assert.ok(out(stateOf(heading)).includes('## Next heading') && !modelOf(stateOf(heading).doc).sources.get('1')?.text?.includes('Next'), 'a heading ends the definition');
  const long = 'x'.repeat(6000);
  const c = `Text[^1].\n\n[^1]: ${long}`;
  assert.equal(out(stateOf(c)), c, 'a 6000 character definition is not truncated');
}
console.log('citations lazy ok');
