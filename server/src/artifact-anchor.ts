/**
 * WHERE, IN A STORED ARTIFACT FILE, IS THE ELEMENT SOMEBODY CLICKED?
 *
 * Ported verbatim from the Dovito hub (web/src/lib/artifact-anchor.ts); the
 * "hub" and "update_artifact" below map to the admin panel and this service's
 * POST /api/link/:slug/edit.
 *
 * Artifact select mode lets an admin or editor click an
 * element inside an artifact's frame and leave a note for Claude on
 * it. The page can only tell the admin panel what the
 * BROWSER saw: a CSS path, the element's text with a little context either
 * side, and its tag. An agent acting on the note needs the opposite: where that
 * element sits in the FILE, so it can change exactly those characters with
 * update_artifact. This module turns the first into the second, server side,
 * against the stored bytes, with parse5's source locations.
 *
 * OFFSETS ARE JS STRING INDICES into the file decoded as UTF-8 (the same string
 * dovito_read_doc prints and update_artifact takes), not byte offsets.
 * `html.slice(start, end)` is the element's whole source, start tag to end tag.
 *
 * THE ORDER, and why:
 *   1. Stored offsets, when the caller has some, VERIFIED against the quote.
 *      Cheapest and exact, but only trusted when the text there still matches.
 *   2. Quote search: every element whose text is the quote (and whose tag
 *      matches). One hit wins. Several are narrowed by the prefix/suffix
 *      context, then by the CSS path; still several is a refusal, never a pick.
 *   3. The CSS path, with the tag required to agree.
 *   Nothing → a plain refusal. It never guesses.
 *
 * TEXT IS COMPARED THE WAY THE BROWSER SEES IT. parse5 decodes entities in text
 * nodes, exactly as the DOM does, and an element's text is the concatenation of
 * every descendant text node, exactly as `textContent` is — so a quote spanning
 * `<b>` or `&amp;` matches. Both sides then collapse whitespace with the same
 * `normalizeText`. The raw source is never searched for the quote.
 *
 * Pure: no fs, no auth, no DB. The caller reads the file.
 */

import { parse } from "parse5";

/** The longest `exact` stored. A longer element text is compared by prefix. */
export const QUOTE_CAP = 1000;
/** Characters of context kept either side of the element's text. */
export const CONTEXT_CHARS = 32;

export interface ElementQuote {
  prefix?: string;
  exact: string;
  suffix?: string;
}

/** The anchor stored on a comment row for a note on an artifact element. */
export interface ArtifactElementAnchor {
  type: "artifact-element";
  /** sha256 of the stored file the pick was made against (artifactFileSha). */
  sha: string;
  cssPath: string;
  quote: ElementQuote;
  tag: string;
  /** Offsets into that version of the file (see the note above). */
  start: number;
  end: number;
  /**
   * The element's tag and classes as a CSS selector ("div.section-label"),
   * and how many elements in the page at `sha` match it. A note on ONE of
   * eight matching elements may well mean all eight; this says so.
   * Absent on notes made before it was recorded.
   */
  selector?: string;
  matchCount?: number;
  /**
   * A note on SEVERAL elements (shift-click in select mode): every anchor,
   * the first one repeated from the fields above so a reader of the old
   * single-anchor shape still finds it there. Absent on single-element notes
   * made before multi-select.
   */
  anchors?: ArtifactElementTarget[];
  /**
   * "comment": left for PEOPLE in select mode, never handed to an agent (the
   * live link skips it, and MCP listings mark it forClaude: false). Absent
   * means a note for Claude, which is every row written before the choice.
   */
  kind?: "comment";
}

/** One element of a (possibly multi-element) note. */
export type ArtifactElementTarget = Omit<ArtifactElementAnchor, "type" | "anchors" | "kind">;

/** Is this stored anchor an element note FOR CLAUDE (not a comment for people)? */
export function isNoteForClaude(a: unknown): a is ArtifactElementAnchor {
  return isArtifactElementAnchor(a) && a.kind !== "comment";
}

/** Every element a stored note points at: its `anchors`, or itself. */
export function anchorTargets(a: ArtifactElementAnchor): ArtifactElementTarget[] {
  if (Array.isArray(a.anchors) && a.anchors.length > 0) return a.anchors;
  const { type: _t, anchors: _a, kind: _k, ...one } = a;
  return [one];
}

export interface AnchorTarget {
  cssPath?: string;
  quote?: ElementQuote;
  tag?: string;
  start?: number;
  end?: number;
}

export type AnchorMethod = "offsets" | "quote" | "cssPath";

export type AnchorResolution =
  | {
      ok: true;
      start: number;
      end: number;
      tag: string;
      cssPath: string;
      method: AnchorMethod;
      /** False only on a CSS-path match whose text no longer equals the quote. */
      quoteMatched: boolean;
      /**
       * Between the end of the start tag and the start of the end tag, when
       * the element has both written in the file. Null for a void element or
       * one whose end tag is implied.
       */
      inner: { start: number; end: number } | null;
      /** Every child is a text node (no elements, no comments). */
      textOnly: boolean;
      /** Tag plus classes, as a CSS selector, and how many elements match it. */
      selector: string;
      matchCount: number;
    }
  | { ok: false; message: string };

/** Collapse every whitespace run to one space and trim. Used on BOTH sides. */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Does an element's normalized text match a stored `exact`? */
export function quoteMatches(normText: string, exact: string): boolean {
  if (exact.length >= QUOTE_CAP) return normText.startsWith(exact);
  return normText === exact;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type P5Node = any;

interface IndexedElement {
  node: P5Node;
  tag: string;
  cssPath: string;
  start: number | null;
  end: number | null;
  textStart: number;
  textEnd: number;
}

interface DocIndex {
  text: string;
  elements: IndexedElement[];
  byPath: Map<string, IndexedElement>;
}

function tagOf(node: P5Node): string {
  return String(node.tagName ?? node.nodeName ?? "").toLowerCase();
}

/** Index every element: its CSS path, source offsets and text span. */
function indexDocument(html: string): DocIndex {
  const doc = parse(html, { sourceCodeLocationInfo: true });
  let text = "";
  const elements: IndexedElement[] = [];
  const byPath = new Map<string, IndexedElement>();

  const walk = (node: P5Node, parentPath: string) => {
    const counts = new Map<string, number>();
    for (const child of node.childNodes ?? []) {
      if (child.nodeName === "#text") {
        text += child.value ?? "";
        continue;
      }
      if (!child.tagName) continue; // comments, doctype
      const tag = tagOf(child);
      const n = (counts.get(tag) ?? 0) + 1;
      counts.set(tag, n);
      const step = `${tag}:nth-of-type(${n})`;
      const cssPath = parentPath ? `${parentPath} > ${step}` : step;
      const loc = child.sourceCodeLocation;
      const entry: IndexedElement = {
        node: child,
        tag,
        cssPath,
        start: loc ? loc.startOffset : null,
        end: loc ? loc.endOffset : null,
        textStart: text.length,
        textEnd: text.length,
      };
      elements.push(entry);
      byPath.set(cssPath, entry);
      // <template> content lives outside childNodes in parse5, and outside
      // textContent in the DOM, so both sides skip it the same way.
      walk(child, cssPath);
      entry.textEnd = text.length;
    }
  };
  walk(doc, "");
  return { text, elements, byPath };
}

/**
 * Canonicalise a CSS path to the index's spelling: `tag:nth-of-type(n)` at
 * every step. Accepts `tag` alone for n=1. Anything else (ids, classes,
 * attribute selectors) is not a path this feature produces → null.
 */
export function canonicalCssPath(cssPath: string): string | null {
  const steps = cssPath.split(">").map((s) => s.trim()).filter(Boolean);
  if (steps.length === 0) return null;
  const out: string[] = [];
  for (const step of steps) {
    const m = /^([a-zA-Z][a-zA-Z0-9-]*)(?::nth-of-type\((\d+)\))?$/.exec(step);
    if (!m) return null;
    out.push(`${m[1].toLowerCase()}:nth-of-type(${m[2] ?? "1"})`);
  }
  return out.join(" > ");
}

function normText(idx: DocIndex, el: IndexedElement): string {
  return normalizeText(idx.text.slice(el.textStart, el.textEnd));
}

function contextOk(idx: DocIndex, el: IndexedElement, q: ElementQuote): boolean {
  const prefix = q.prefix ? normalizeText(q.prefix) : "";
  const suffix = q.suffix ? normalizeText(q.suffix) : "";
  if (prefix && !normalizeText(idx.text.slice(0, el.textStart)).endsWith(prefix)) return false;
  if (suffix && !normalizeText(idx.text.slice(el.textEnd)).startsWith(suffix)) return false;
  return true;
}

function located(el: IndexedElement): el is IndexedElement & { start: number; end: number } {
  return el.start !== null && el.end !== null;
}

function classesOf(node: P5Node): string[] {
  const cls = (node.attrs ?? []).find((a: { name: string }) => a.name === "class")?.value ?? "";
  return String(cls).split(/\s+/).filter(Boolean);
}

/** "div.section-label": the tag and every class, as a CSS selector. */
function selectorOf(el: IndexedElement): string {
  return [el.tag, ...classesOf(el.node).map((c) => c.replace(/[^A-Za-z0-9_-]/g, (ch) => `\\${ch}`))].join(".");
}

/** Elements with the same tag carrying every one of these classes. */
function matchCountOf(idx: DocIndex, el: IndexedElement): number {
  const want = classesOf(el.node);
  return idx.elements.filter((e) => {
    if (e.tag !== el.tag) return false;
    if (want.length === 0) return true;
    const have = new Set(classesOf(e.node));
    return want.every((c) => have.has(c));
  }).length;
}

function hit(idx: DocIndex, el: IndexedElement, method: AnchorMethod, quoteMatched: boolean): AnchorResolution {
  const loc = el.node.sourceCodeLocation;
  const inner =
    loc?.startTag && loc?.endTag ? { start: loc.startTag.endOffset as number, end: loc.endTag.startOffset as number } : null;
  const children: P5Node[] = el.node.childNodes ?? [];
  return {
    ok: true,
    start: el.start as number,
    end: el.end as number,
    tag: el.tag,
    cssPath: el.cssPath,
    method,
    quoteMatched,
    inner,
    textOnly: children.every((c) => c.nodeName === "#text"),
    selector: selectorOf(el),
    matchCount: matchCountOf(idx, el),
  };
}

/**
 * Find the element in `html` that a pick (or a stored anchor) points at.
 *
 * `strict` (the add path, where the pick was made against these exact bytes)
 * refuses a CSS-path match whose text does not equal the quote: that means the
 * browser was showing text the page's own script wrote, which is not in the
 * file, so there is nothing an agent could edit there. Re-resolving a stored
 * note against a NEWER version is not strict: the text is expected to have
 * changed when an agent edited it, and the CSS path with the same tag is the
 * documented last resort.
 */
export function resolveElementAnchor(
  html: string,
  target: AnchorTarget,
  opts: { strict?: boolean } = {},
): AnchorResolution {
  let idx: DocIndex;
  try {
    idx = indexDocument(html);
  } catch {
    return { ok: false, message: "The page's file could not be read as HTML." };
  }
  const tag = target.tag ? target.tag.toLowerCase() : undefined;
  const exact = target.quote?.exact ? normalizeText(target.quote.exact) : "";
  const tagOk = (el: IndexedElement) => !tag || el.tag === tag;
  const pathKey = target.cssPath ? canonicalCssPath(target.cssPath) : null;
  const byPath = pathKey ? idx.byPath.get(pathKey) : undefined;

  // 1. Stored offsets, trusted only when the text there still matches.
  if (Number.isInteger(target.start) && Number.isInteger(target.end)) {
    const el = idx.elements.find((e) => e.start === target.start && e.end === target.end);
    if (el && tagOk(el) && (exact ? quoteMatches(normText(idx, el), exact) : true)) {
      return hit(idx, el, "offsets", true);
    }
  }

  // 2. Quote search.
  if (exact) {
    let candidates = idx.elements.filter(
      (e) => located(e) && tagOk(e) && quoteMatches(normText(idx, e), exact),
    );
    if (candidates.length > 1 && target.quote) {
      const narrowed = candidates.filter((e) => contextOk(idx, e, target.quote as ElementQuote));
      if (narrowed.length > 0) candidates = narrowed;
    }
    if (candidates.length > 1 && byPath && candidates.includes(byPath)) {
      candidates = [byPath];
    }
    if (candidates.length === 1) return hit(idx, candidates[0], "quote", true);
    if (candidates.length > 1) {
      return {
        ok: false,
        message: `That text appears in ${candidates.length} places in the page and nothing else tells them apart. Pick a larger element around it.`,
      };
    }
  }

  // 3. The CSS path, tag required to agree.
  if (byPath && located(byPath) && tagOk(byPath)) {
    const matched = exact ? quoteMatches(normText(idx, byPath), exact) : normText(idx, byPath) === "";
    if (matched || !opts.strict) return hit(idx, byPath, "cssPath", matched);
    return {
      ok: false,
      message:
        "That element's text is written by the page's own script, so it is not in the page's file. Pick the element around it instead.",
    };
  }
  if (byPath && !located(byPath)) {
    return {
      ok: false,
      message: "That element is not written in the page's file (the browser added it). Pick an element inside it.",
    };
  }

  return { ok: false, message: "Could not find that element in the page's file." };
}

export type NoteAnchorStatus = "current" | "reanchored" | "moved";

export interface AnchorNow {
  /** The sha these offsets are for: the page as stored right now. */
  sha: string;
  status: NoteAnchorStatus;
  start: number | null;
  end: number | null;
  method: AnchorMethod | null;
}

/**
 * Where a stored note points in the CURRENT file.
 *
 * Same sha → its stored offsets, unchanged. A different sha → re-resolved by
 * quote, then by CSS path (not strict: the text may have been edited), and
 * "moved" when neither finds it. Offsets from an older version are never
 * carried over as if they still applied.
 */
export function anchorNow(
  anchor: ArtifactElementTarget,
  currentHtml: string | null,
  currentSha: string | null,
): AnchorNow {
  if (!currentHtml || !currentSha) {
    return { sha: currentSha ?? "", status: "moved", start: null, end: null, method: null };
  }
  if (anchor.sha === currentSha) {
    return { sha: currentSha, status: "current", start: anchor.start, end: anchor.end, method: "offsets" };
  }
  const r = resolveElementAnchor(currentHtml, { cssPath: anchor.cssPath, quote: anchor.quote, tag: anchor.tag });
  if (!r.ok) return { sha: currentSha, status: "moved", start: null, end: null, method: null };
  return { sha: currentSha, status: "reanchored", start: r.start, end: r.end, method: r.method };
}

export function isArtifactElementAnchor(a: unknown): a is ArtifactElementAnchor {
  return !!a && typeof a === "object" && (a as { type?: unknown }).type === "artifact-element";
}

/* ---------------- step 2: edit an element's text in place ---------------- */

/**
 * Elements whose content is not ordinary markup-escaped text in the file:
 * raw text (script, style) or text the parser treats specially. Editing them
 * as text would either break the page or not mean what the person typed.
 */
const NOT_EDITABLE_TAGS = new Set([
  "script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript", "plaintext", "template",
]);

export const EDIT_HAS_CHILDREN =
  "This part contains other elements; leave a note for Claude instead.";

/** Escape text for an HTML text position. Quotes need no escaping there. */
export function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Replace ONE element's text content in the stored HTML, and nothing else.
 *
 * Text only, by rule: an element holding any child element (or a comment) is
 * refused, because replacing its content would delete markup the person never
 * saw as text. The new text is one line (line breaks become spaces, since
 * Enter is not a new block) and HTML-escaped; the whitespace the author put
 * around the old text inside the tags is kept, so the file's own indentation
 * survives.
 */
export function replaceElementText(
  html: string,
  r: Extract<AnchorResolution, { ok: true }>,
  text: string,
): { ok: true; html: string } | { ok: false; message: string } {
  if (!r.textOnly) return { ok: false, message: EDIT_HAS_CHILDREN };
  if (!r.inner || NOT_EDITABLE_TAGS.has(r.tag)) {
    return { ok: false, message: "This part has no editable text; leave a note for Claude instead." };
  }
  const clean = String(text ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!clean) {
    return { ok: false, message: "Type some text. To remove this part, leave a note for Claude instead." };
  }
  const old = html.slice(r.inner.start, r.inner.end);
  const lead = old.trim() ? /^\s*/.exec(old)![0] : "";
  const trail = old.trim() ? /\s*$/.exec(old)![0] : "";
  return {
    ok: true,
    html: html.slice(0, r.inner.start) + lead + escapeHtmlText(clean) + trail + html.slice(r.inner.end),
  };
}

/* ---------------- splice edits (update_artifact `edits`) ---------------- */

export interface SpliceEdit {
  start: number;
  end: number;
  replacement: string;
}

/** The most edits one update_artifact call may carry. */
export const MAX_SPLICE_EDITS = 200;

/**
 * Apply splice edits to a page's HTML: each replaces `html.slice(start, end)`
 * with `replacement`, where the offsets are the same string positions
 * anchorNow reports, against the page as stored at baseSha.
 *
 * The WHOLE call is refused, naming the edit, when any range is not a pair of
 * whole numbers inside the page, or when two edits overlap (two insertions at
 * the same point overlap too: their order would be a guess). Edits are applied
 * from the end backwards, so every offset refers to the original page.
 */
export function applySplices(
  html: string,
  edits: readonly SpliceEdit[],
): { ok: true; html: string } | { ok: false; message: string } {
  if (!Array.isArray(edits) || edits.length === 0) return { ok: false, message: "`edits` is empty; nothing was written." };
  if (edits.length > MAX_SPLICE_EDITS) {
    return { ok: false, message: `${edits.length} edits is more than ${MAX_SPLICE_EDITS} in one call; send the whole page as \`html\` instead.` };
  }
  const len = html.length;
  const indexed = edits.map((e, i) => ({ ...e, i }));
  for (const e of indexed) {
    if (!Number.isInteger(e.start) || !Number.isInteger(e.end) || e.start < 0 || e.end < e.start) {
      return { ok: false, message: `edits[${e.i}] needs whole-number start <= end, both 0 or more (got ${e.start}..${e.end}). Nothing was written.` };
    }
    if (e.end > len) {
      return { ok: false, message: `edits[${e.i}] ends at ${e.end}, past the end of the page (${len} characters). Nothing was written.` };
    }
    if (typeof e.replacement !== "string") {
      return { ok: false, message: `edits[${e.i}].replacement must be a string. Nothing was written.` };
    }
  }
  const sorted = [...indexed].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let k = 1; k < sorted.length; k++) {
    const a = sorted[k - 1];
    const b = sorted[k];
    const insertsAtSamePoint = a.start === a.end && b.start === b.end && a.start === b.start;
    if (b.start < a.end || insertsAtSamePoint) {
      return {
        ok: false,
        message: `edits[${b.i}] (${b.start}..${b.end}) overlaps edits[${a.i}] (${a.start}..${a.end}). Nothing was written.`,
      };
    }
  }
  let out = html;
  for (let k = sorted.length - 1; k >= 0; k--) {
    const e = sorted[k];
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return { ok: true, html: out };
}
