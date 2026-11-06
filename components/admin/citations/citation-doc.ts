/**
 * Document model for citations, with no DOM and no React so the self-test can drive it.
 *
 *   citationRef   inline atom, attrs { label }. Stored as `[^label]`. The number shown is NOT an
 *                 attribute: it is the label's position among the document's refs, recomputed live.
 *   citationDefs  one block atom at the very end, attrs { entries: [{ label, source }] }. Stored as
 *                 `[^label]: ...` lines. A source used twice is one entry referenced by two refs.
 *                 Rendered in the editor as the generated "Citations (N)" section.
 *
 * `normalizeTr` is the invariant keeper: exactly one defs node, last, holding every definition
 * (the ones some ref points at first, then the "not cited yet" ones exactly as written, never
 * dropped); a ref with no entry (hand-written `[^x]` with no definition, or a
 * paste from another post) becomes the literal text it was written as.
 */
import type { Node as PMNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { citationOrder, sourceKey, type Source } from '../../../lib/citations';

export interface Entry {
    label: string;
    source: Source;
    /** The body as written when it spans several lines or paragraphs; serialized verbatim until the entry is edited. */
    raw?: string;
}

export const REF = 'citationRef';
export const DEFS = 'citationDefs';

export interface CitationModel {
    /** Labels in order of first appearance: index + 1 is the number shown. */
    order: string[];
    sources: Map<string, Source>;
    /** How many markers point at each label. */
    uses: Map<string, number>;
    refs: { pos: number; label: string }[];
    /** Definitions no marker points at ("not cited yet"), in the order written. */
    unused: string[];
}

interface DefsBlock {
    pos: number;
    size: number;
    entries: Entry[];
}

export function readDoc(doc: PMNode): { refs: { pos: number; label: string }[]; defs: DefsBlock[] } {
    const refs: { pos: number; label: string }[] = [];
    const defs: DefsBlock[] = [];
    doc.descendants((node, pos) => {
        if (node.type.name === REF) refs.push({ pos, label: String(node.attrs.label) });
        else if (node.type.name === DEFS) defs.push({ pos, size: node.nodeSize, entries: (node.attrs.entries as Entry[]) || [] });
        return node.type.name !== DEFS && node.type.name !== REF;
    });
    return { refs, defs };
}

export function modelOf(doc: PMNode): CitationModel {
    const { refs, defs } = readDoc(doc);
    const sources = new Map<string, Source>();
    for (const d of defs) for (const e of d.entries) if (!sources.has(e.label)) sources.set(e.label, e.source);
    const uses = new Map<string, number>();
    for (const r of refs) uses.set(r.label, (uses.get(r.label) ?? 0) + 1);
    return { order: citationOrder(refs.map((r) => r.label)), sources, uses, refs, unused: [...sources.keys()].filter((l) => !uses.has(l)) };
}

/** The entry already holding this source (same URL, or same text), if any. */
export function findSameSource(model: CitationModel, source: Source): string | null {
    const key = sourceKey(source);
    for (const label of model.order) {
        const s = model.sources.get(label);
        if (s && sourceKey(s) === key) return label;
    }
    for (const [label, s] of model.sources) if (sourceKey(s) === key) return label;
    return null;
}

const sameEntries = (a: Entry[], b: Entry[]) => a.length === b.length && a.every((e, i) => e.label === b[i].label && e.source === b[i].source && e.raw === b[i].raw);

/** A transaction that restores the invariants, or null when the document already satisfies them. */
export function normalizeTr(state: EditorState): Transaction | null {
    const { doc, schema } = state;
    const { refs, defs } = readDoc(doc);
    const all = new Map<string, Entry>();
    for (const d of defs) for (const e of d.entries) if (!all.has(e.label)) all.set(e.label, e);
    const referenced = new Set(refs.map((r) => r.label));
    // Cited entries first, then the ones nothing cites (kept as written, shown as "Not cited yet").
    const cited = [...all.values()].filter((e) => referenced.has(e.label));
    const spare = [...all.values()].filter((e) => !referenced.has(e.label));
    let keep = [...cited, ...spare];
    const orphans = refs.filter((r) => !all.has(r.label));
    // When every label is a plain number, keep the stored labels equal to the displayed numbers
    // (`[^1]` is the first marker in the text). Anything hand-labelled (`[^smith]`) is left exactly as written.
    const used = citationOrder(refs.filter((r) => all.has(r.label)).map((r) => r.label));
    let relabel: Map<string, string> | null = null;
    // Never when an uncited definition already holds one of the new numbers: that would make two entries share a label.
    const taken = new Set(spare.map((e) => e.label));
    if (used.length && used.every((l) => /^\d+$/.test(l)) && used.some((l, i) => l !== String(i + 1)) && !used.some((_l, i) => taken.has(String(i + 1)))) {
        relabel = new Map(used.map((l, i) => [l, String(i + 1)]));
        const renamed = cited.map((e) => ({ ...e, label: relabel!.get(e.label)! })).sort((a, b) => Number(a.label) - Number(b.label));
        keep = [...renamed, ...spare];
    }
    const canonical =
        !relabel &&
        orphans.length === 0 &&
        (keep.length === 0
            ? defs.length === 0
            : defs.length === 1 && defs[0].pos + defs[0].size === doc.content.size && sameEntries(defs[0].entries, keep));
    if (canonical) return null;

    const ops: { from: number; to: number; text?: string }[] = [
        ...defs.map((d) => ({ from: d.pos, to: d.pos + d.size })),
        ...orphans.map((r) => ({ from: r.pos, to: r.pos + 1, text: `[^${r.label}]` })),
    ].sort((a, b) => b.from - a.from);
    const tr = state.tr;
    // Same-size edits first, so every position above is still valid.
    if (relabel) for (const r of refs) if (relabel.has(r.label)) tr.setNodeMarkup(r.pos, undefined, { label: relabel.get(r.label) });
    for (const op of ops) {
        if (op.text !== undefined) tr.replaceWith(op.from, op.to, schema.text(op.text));
        else tr.delete(op.from, op.to);
    }
    if (keep.length) tr.insert(tr.doc.content.size, schema.nodes[DEFS].create({ entries: keep }));
    return tr;
}

/** Entries after adding (or finding) a source; returns the label to point a marker at. */
export function withSource(model: CitationModel, entriesNow: Entry[], source: Source): { label: string; entries: Entry[] } {
    const same = findSameSource(model, source);
    if (same) return { label: same, entries: entriesNow };
    const used = new Set([...entriesNow.map((e) => e.label), ...model.order]);
    let n = 1;
    while (used.has(String(n))) n++;
    const label = String(n);
    return { label, entries: [...entriesNow, { label, source }] };
}
