import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { isSafeHref, richSegments, sourceKind, toMarkdown, type Source } from '../../../lib/citations';
import type { CitationStore } from './citation-store';

/**
 * The generated "Citations (N)" section at the end of the post body: a NodeView for the
 * citationDefs atom. Not editable text; it is painted from the document (numbering by first
 * appearance) and repainted when the numbering or any entry changes.
 */

const SVG = 'http://www.w3.org/2000/svg';
function icon(paths: string[], size = 16): SVGElement {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'i');
    for (const d of paths) {
        const p = document.createElementNS(SVG, 'path');
        p.setAttribute('d', d);
        svg.appendChild(p);
    }
    return svg;
}

/** The entry's text as DOM: italics and links from the markdown subset, never innerHTML. */
export function entryNodes(source: Source): Node[] {
    {
        return richSegments(toMarkdown(source)).map((s) => {
            let node: HTMLElement | Text = document.createTextNode(s.t);
            if (s.href && isSafeHref(s.href)) {
                const a = document.createElement('a');
                a.href = s.href;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = s.t;
                node = a;
            }
            if (s.i) {
                const em = document.createElement('em');
                em.append(node);
                node = em;
            } else if (s.b) {
                const b = document.createElement('strong');
                b.append(node);
                node = b;
            }
            return node;
        });
    }
}

export function createSectionView(editor: Editor, store: CitationStore, initial: PMNode) {
    void initial;
    const dom = document.createElement('section');
    dom.className = 'pe-cites';
    dom.setAttribute('aria-label', 'Citations');
    dom.contentEditable = 'false';

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'ch';
    head.setAttribute('aria-controls', 'pe-cites-list');
    const chev = icon(['m9 18 6-6-6-6']);
    const headText = document.createElement('span');
    head.append(chev, headText);
    const list = document.createElement('ol');
    list.id = 'pe-cites-list';
    list.className = 'cites-list';
    const spareHead = document.createElement('p');
    spareHead.className = 'cites-spare-h';
    spareHead.textContent = 'Not cited yet';
    const spare = document.createElement('ul');
    spare.className = 'cites-list cites-spare';
    dom.append(head, list, spareHead, spare);

    head.addEventListener('mousedown', (e) => e.preventDefault());
    head.addEventListener('click', () => store.toggleOpen());

    let sig = '';
    const paint = () => {
        const m = store.model();
        const open = store.isOpen();
        const next = JSON.stringify([open, m.order.map((l) => [l, m.sources.get(l)]), m.unused.map((l) => [l, m.sources.get(l)])]);
        if (next === sig) return;
        sig = next;
        headText.textContent = `Citations (${m.order.length})`;
        head.setAttribute('aria-expanded', String(open));
        list.hidden = !open;
        spareHead.hidden = spare.hidden = !open || m.unused.length === 0;
        list.replaceChildren(
            ...m.order.map((label, i) => {
                const source = m.sources.get(label) ?? {};
                const li = document.createElement('li');
                li.className = 'ce';
                li.setAttribute('data-label', label);
                const n = document.createElement('span');
                n.className = 'cn';
                n.textContent = `${i + 1}.`;
                const t = document.createElement('span');
                t.className = 'ct';
                const kind = sourceKind(source);
                t.append(...entryNodes(source));
                if (kind === 'url') {
                    const add = document.createElement('button');
                    add.type = 'button';
                    add.className = 'cadd';
                    add.textContent = 'Add details';
                    add.addEventListener('click', () => store.openEdit(label, add));
                    t.append(' ', add);
                }
                const actions = document.createElement('span');
                actions.className = 'ca';
                const edit = document.createElement('button');
                edit.type = 'button';
                edit.textContent = 'Edit';
                edit.addEventListener('click', () => store.openEdit(label, edit));
                const back = document.createElement('button');
                back.type = 'button';
                back.setAttribute('aria-label', 'Back to text');
                back.title = 'Back to text';
                back.append(icon(['M9 14 4 9l5-5', 'M20 20v-7a4 4 0 0 0-4-4H4'], 14));
                back.addEventListener('click', () => store.backToText(label));
                actions.append(edit, back);
                li.append(n, t, actions);
                return li;
            }),
        );
        // Definitions in the post that no marker points at: kept exactly as written until removed here.
        spare.replaceChildren(
            ...m.unused.map((label) => {
                const li = document.createElement('li');
                li.className = 'ce';
                li.setAttribute('data-label', label);
                const n = document.createElement('span');
                n.className = 'cn';
                n.setAttribute('aria-hidden', 'true');
                const t = document.createElement('span');
                t.className = 'ct';
                t.append(...entryNodes(m.sources.get(label) ?? {}));
                const actions = document.createElement('span');
                actions.className = 'ca';
                const rm = document.createElement('button');
                rm.type = 'button';
                rm.textContent = 'Remove';
                rm.addEventListener('click', () => store.removeUnused(label));
                actions.append(rm);
                li.append(n, t, actions);
                return li;
            }),
        );
    };
    paint();
    const off = store.subscribe(paint);
    // The view can be built before the editor is attached or has its first state, so that first paint may be empty: paint again once it is.
    const settle = setTimeout(() => { sig = ''; paint(); }, 0);

    return {
        dom,
        update: (next: PMNode) => {
            if (next.type.name !== 'citationDefs') return false;
            paint();
            return true;
        },
        stopEvent: () => true,
        ignoreMutation: () => true,
        destroy: () => { clearTimeout(settle); off(); },
    };
}
