/**
 * Recipes: an instant artifact whose file is `recipe.json` (kind 'recipe') and whose
 * page is rendered from one editable template, so a template change reaches every
 * recipe at once.
 *
 * The chart is a "Cooking for Engineers" table: ingredients down the left, each action
 * a merged cell spanning the ingredient rows it applies to. A step is placed explicitly
 * ({col, from, to}, rows 1-based over `ingredients`), so the layout is whatever the data
 * says and nothing is inferred. Areas no step covers render as blank boxes, merged into
 * rectangles, which is how the printed charts read.
 *
 * Rendering is a single pass over the template: every field is escaped into HTML first,
 * then the placeholders are replaced in one `replace` call, so text from a recipe can
 * never introduce a placeholder of its own.
 */

export const RECIPE_KIND = 'recipe';
export const RECIPE_FILENAME = 'recipe.json';
export const MAX_RECIPE_BYTES = 200_000;
export const MAX_TEMPLATE_BYTES = 200_000;

export interface RecipeIngredient {
    /** As the source writes it: "1 cup", "4 oz", "1/2". Optional for "salt to taste". */
    amount?: string;
    /** Metric equivalent shown after the amount, e.g. "200 g". */
    metric?: string;
    name: string;
    /** Trailing detail after a comma: "diced", "or grind your own". */
    note?: string;
}

export interface RecipeStep {
    /** Short action: "melt", "fold in", "bake 350°F (170°C) 30 to 40 min". */
    label: string;
    /** Action column, 1 = the first column right of the ingredients. */
    col: number;
    /** First and last ingredient row the action spans, 1-based and inclusive. */
    from: number;
    to: number;
    /** Columns the cell spans to the right (default 1). */
    cols?: number;
}

export interface Recipe {
    title: string;
    summary?: string;
    /** The line under the title: [{label: 'Serves', value: '4'}, {label: 'Prep', value: '15 min'}]. */
    meta?: { label: string; value: string }[];
    /** Full-width rows above the chart: pan size, preheat, equipment. */
    setup?: string[];
    ingredients: RecipeIngredient[];
    steps: RecipeStep[];
    /** Tips and notes under the chart. Paragraphs separated by a blank line. */
    notes?: string;
    tags?: string[];
    /** Credit. `url` is optional: a recipe can come from a photographed book page. */
    source?: { text: string; url?: string };
    /** True when the metric amounts are conversions the source did not give. */
    metric_approx?: boolean;
    /** How many servings the amounts are for. Turns on the servings slider. When absent, a
     *  "Serves 4" style meta entry is used instead. */
    servings?: number;
}

export interface Problem {
    path: string;
    reason: string;
}

export type Checked =
    | { ok: true; recipe: Recipe; warnings: Problem[] }
    | { ok: false; errors: Problem[]; warnings: Problem[] };

export const MAX_COLS = 12;
export const MAX_INGREDIENTS = 60;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Only absolute http(s) links survive; anything else (javascript:, data:, relative) is refused. */
export function safeUrl(v: unknown): string | null {
    if (typeof v !== 'string' || !v.trim()) return null;
    try {
        const u = new URL(v.trim());
        return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
    } catch {
        return null;
    }
}

/**
 * Checks a recipe and returns it normalised (trimmed, unknown keys dropped), or every
 * problem as {path, reason} so a caller can fix the named fields and send it again.
 */
export function validateRecipe(input: unknown): Checked {
    const errors: Problem[] = [];
    const warnings: Problem[] = [];
    const err = (path: string, reason: string) => errors.push({ path, reason });

    if (!isObj(input)) return { ok: false, errors: [{ path: '', reason: 'must be an object' }], warnings };

    const text = (path: string, v: unknown, max: number, required = false): string | undefined => {
        if (v === undefined || v === null || v === '') {
            if (required) err(path, 'is required');
            return undefined;
        }
        if (typeof v !== 'string') {
            err(path, 'must be a string');
            return undefined;
        }
        const s = v.replace(/\s+/g, ' ').trim();
        if (!s) {
            if (required) err(path, 'is required');
            return undefined;
        }
        if (s.length > max) err(path, `is ${s.length} characters, max ${max}`);
        return s.slice(0, max);
    };
    // Notes keep their paragraph breaks.
    const para = (path: string, v: unknown, max: number): string | undefined => {
        if (v === undefined || v === null || v === '') return undefined;
        if (typeof v !== 'string') {
            err(path, 'must be a string');
            return undefined;
        }
        const s = v.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        if (s.length > max) err(path, `is ${s.length} characters, max ${max}`);
        return s.slice(0, max) || undefined;
    };

    const r: Recipe = { title: text('title', input.title, 140, true) || '', ingredients: [], steps: [] };
    const summary = text('summary', input.summary, 400);
    if (summary) r.summary = summary;

    if (input.meta !== undefined) {
        if (!Array.isArray(input.meta)) err('meta', 'must be an array of {label, value}');
        else {
            if (input.meta.length > 8) err('meta', 'has more than 8 entries');
            r.meta = [];
            input.meta.slice(0, 8).forEach((m, i) => {
                if (!isObj(m)) return err(`meta[${i}]`, 'must be {label, value}');
                const label = text(`meta[${i}].label`, m.label, 30, true);
                const value = text(`meta[${i}].value`, m.value, 80, true);
                if (label && value) r.meta!.push({ label, value });
            });
        }
    }

    if (input.setup !== undefined) {
        if (!Array.isArray(input.setup)) err('setup', 'must be an array of strings');
        else {
            if (input.setup.length > 6) err('setup', 'has more than 6 rows');
            r.setup = input.setup.slice(0, 6).map((s, i) => text(`setup[${i}]`, s, 200, true)).filter((s): s is string => !!s);
        }
    }

    if (!Array.isArray(input.ingredients) || input.ingredients.length === 0) err('ingredients', 'must be a non-empty array');
    else {
        if (input.ingredients.length > MAX_INGREDIENTS) err('ingredients', `has more than ${MAX_INGREDIENTS} rows`);
        input.ingredients.slice(0, MAX_INGREDIENTS).forEach((g, i) => {
            const p = `ingredients[${i}]`;
            if (!isObj(g)) return err(p, 'must be {amount?, metric?, name, note?}');
            const ing: RecipeIngredient = { name: text(`${p}.name`, g.name, 160, true) || '' };
            const amount = text(`${p}.amount`, g.amount, 60);
            const metric = text(`${p}.metric`, g.metric, 60);
            const note = text(`${p}.note`, g.note, 160);
            if (amount) ing.amount = amount;
            if (metric) ing.metric = metric;
            if (note) ing.note = note;
            r.ingredients.push(ing);
        });
    }
    const rows = r.ingredients.length;

    if (!Array.isArray(input.steps) || input.steps.length === 0) err('steps', 'must be a non-empty array');
    else {
        if (input.steps.length > 80) err('steps', 'has more than 80 cells');
        input.steps.slice(0, 80).forEach((s, i) => {
            const p = `steps[${i}]`;
            if (!isObj(s)) return err(p, 'must be {label, col, from, to, cols?}');
            const label = text(`${p}.label`, s.label, 300, true);
            const col = s.col, from = s.from, to = s.to;
            const cols = s.cols === undefined ? 1 : s.cols;
            let bad = false;
            if (!isInt(col) || col < 1 || col > MAX_COLS) (err(`${p}.col`, `must be a whole number from 1 to ${MAX_COLS}`), (bad = true));
            if (!isInt(cols) || cols < 1) (err(`${p}.cols`, 'must be a whole number of at least 1'), (bad = true));
            else if (isInt(col) && col + cols - 1 > MAX_COLS) (err(`${p}.cols`, `runs past column ${MAX_COLS}`), (bad = true));
            if (!isInt(from) || from < 1 || from > rows) (err(`${p}.from`, `must be an ingredient row from 1 to ${rows} (rows are 1-based)`), (bad = true));
            if (!isInt(to) || to < 1 || to > rows) (err(`${p}.to`, `must be an ingredient row from 1 to ${rows} (rows are 1-based)`), (bad = true));
            if (!bad && (to as number) < (from as number)) (err(`${p}.to`, `is ${to}, before from (${from})`), (bad = true));
            if (bad || !label) return;
            r.steps.push({ label, col: col as number, from: from as number, to: to as number, ...(cols !== 1 ? { cols: cols as number } : {}) });
        });
    }

    // Two cells may not claim the same box.
    if (rows && r.steps.length) {
        const owner = new Map<string, number>();
        r.steps.forEach((s, i) => {
            for (let row = s.from; row <= s.to; row++)
                for (let c = s.col; c < s.col + (s.cols || 1); c++) {
                    const k = `${row}:${c}`;
                    const prev = owner.get(k);
                    if (prev !== undefined) err(`steps[${i}]`, `overlaps steps[${prev}] ("${r.steps[prev].label}") at row ${row}, column ${c}`);
                    else owner.set(k, i);
                }
        });
        r.ingredients.forEach((g, i) => {
            if (!r.steps.some((s) => s.from <= i + 1 && i + 1 <= s.to))
                warnings.push({ path: `ingredients[${i}]`, reason: `"${g.name}" is not covered by any step` });
        });
    }

    const notes = para('notes', input.notes, 3000);
    if (notes) r.notes = notes;

    if (input.tags !== undefined) {
        if (!Array.isArray(input.tags)) err('tags', 'must be an array of strings');
        else
            r.tags = [...new Set(input.tags.slice(0, 12).map((t, i) => text(`tags[${i}]`, t, 30)?.toLowerCase()).filter((t): t is string => !!t))];
    }

    if (input.source !== undefined) {
        if (!isObj(input.source)) err('source', 'must be {text, url?}');
        else {
            const t = text('source.text', input.source.text, 300, true);
            const url = input.source.url;
            const safe = safeUrl(url);
            if (url !== undefined && url !== '' && !safe) err('source.url', 'must be an absolute http(s) URL');
            if (t) r.source = { text: t, ...(safe ? { url: safe } : {}) };
        }
    } else warnings.push({ path: 'source', reason: 'no credit given; add the author, site or book' });

    if (input.servings !== undefined && input.servings !== null) {
        if (!isInt(input.servings) || input.servings < 1 || input.servings > 100) err('servings', 'must be a whole number from 1 to 100');
        else r.servings = input.servings;
    }

    if (input.metric_approx !== undefined) {
        if (typeof input.metric_approx !== 'boolean') err('metric_approx', 'must be true or false');
        else if (input.metric_approx) r.metric_approx = true;
    }

    return errors.length ? { ok: false, errors, warnings } : { ok: true, recipe: r, warnings };
}

/* --------------------------------- render --------------------------------- */

export const esc = (s: unknown) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

interface Box {
    row: number; // 1-based ingredient row
    col: number; // 1-based action column
    rows: number;
    cols: number;
}

/**
 * Areas no step covers, as rectangles: grow right along the row while the boxes are
 * free, then down while the whole run is free. Greedy, which matches how a hand-drawn
 * chart merges its empty space.
 */
export function blankBoxes(rows: number, cols: number, steps: RecipeStep[]): Box[] {
    const used: boolean[][] = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(false));
    for (const s of steps)
        for (let r = s.from; r <= s.to; r++) for (let c = s.col; c < s.col + (s.cols || 1); c++) if (r <= rows && c <= cols) used[r][c] = true;
    const out: Box[] = [];
    for (let r = 1; r <= rows; r++)
        for (let c = 1; c <= cols; c++) {
            if (used[r][c]) continue;
            let w = 1;
            while (c + w <= cols && !used[r][c + w]) w++;
            let h = 1;
            while (r + h <= rows && Array.from({ length: w }, (_, k) => used[r + h][c + k]).every((u) => !u)) h++;
            for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) used[y][x] = true;
            out.push({ row: r, col: c, rows: h, cols: w });
        }
    return out;
}

/** The chart as a CSS grid. Grid column 1 is the ingredients; action column n is grid column n + 1. */
export function renderChart(r: Recipe): string {
    const cols = Math.max(1, ...r.steps.map((s) => s.col + (s.cols || 1) - 1));
    const setup = r.setup || [];
    const offset = setup.length; // grid rows taken by setup rows
    const lastCol = cols;
    const parts: string[] = [];

    setup.forEach((s, i) => {
        parts.push(`<div class="rc-setup" style="grid-row:${i + 1};grid-column:1 / -1">${esc(s)}</div>`);
    });
    r.ingredients.forEach((g, i) => {
        // data-q carries the original text; the servings slider rescales from it.
        const amount = g.amount ? `<span class="rc-amt" data-q="${esc(g.amount)}">${esc(g.amount)}</span> ` : '';
        const metric = g.metric ? `<span class="rc-metric">(<span data-q="${esc(g.metric)}" data-q-metric>${esc(g.metric)}</span>)</span> ` : '';
        const note = g.note ? `<span class="rc-note">, ${esc(g.note)}</span>` : '';
        parts.push(`<div class="rc-ing" style="grid-row:${offset + i + 1};grid-column:1">${amount}${metric}<span class="rc-name">${esc(g.name)}</span>${note}</div>`);
    });
    // Steps read left to right, top to bottom; that order numbers them.
    const order = [...r.steps].sort((a, b) => a.col - b.col || a.from - b.from);
    order.forEach((s, n) => {
        const span = s.cols || 1;
        const final = s.col + span - 1 === lastCol ? ' rc-final' : '';
        parts.push(
            `<div class="rc-step${final}" style="grid-row:${offset + s.from} / span ${s.to - s.from + 1};grid-column:${s.col + 1} / span ${span}">` +
                `<span class="rc-n" aria-hidden="true">${n + 1}</span><span class="rc-label">${esc(s.label)}</span></div>`
        );
    });
    for (const b of blankBoxes(r.ingredients.length, cols, r.steps)) {
        parts.push(`<div class="rc-blank" aria-hidden="true" style="grid-row:${offset + b.row} / span ${b.rows};grid-column:${b.col + 1} / span ${b.cols}"></div>`);
    }

    return (
        `<div class="rc-chart" role="group" aria-label="Recipe chart" style="--rc-cols:${cols}">` + parts.join('') + `</div>`
    );
}

const SERVES_LABEL = /^(serves|servings?|yield|yields|makes)$/i;

/** The servings the amounts are written for: the explicit field, else a "Serves 4" meta entry. */
export function baseServings(r: Recipe): number | null {
    if (r.servings) return r.servings;
    for (const m of r.meta || []) {
        if (!SERVES_LABEL.test(m.label.trim())) continue;
        const n = /^\s*(\d+)/.exec(m.value);
        if (n && +n[1] >= 1 && +n[1] <= 100) return +n[1];
    }
    return null;
}

/**
 * The servings slider and the script behind it. Every [data-q] holds an amount as written
 * ("1 1/2 cups", "2 to 4 tsp", "about 50 g"); each number in it is multiplied by
 * servings / base. Kitchen amounts come back as eighths and thirds (1½, ⅓), metric
 * amounts and anything 10 or more as rounded decimals. Printing prints what is shown.
 */
function servingsControl(base: number): string {
    const max = Math.max(12, base * 4);
    const script = `(function(){
var base=${base},root=document.currentScript.parentNode,input=root.querySelector('input'),out=root.querySelector('output'),reset=root.querySelector('button');
var U={'¼':.25,'½':.5,'¾':.75,'⅓':1/3,'⅔':2/3,'⅙':1/6,'⅚':5/6,'⅛':.125,'⅜':.375,'⅝':.625,'⅞':.875};
var F=[[0,''],[1/8,'⅛'],[1/6,'⅙'],[1/4,'¼'],[1/3,'⅓'],[3/8,'⅜'],[1/2,'½'],[5/8,'⅝'],[2/3,'⅔'],[3/4,'¾'],[5/6,'⅚'],[7/8,'⅞'],[1,'']];
var RE=/(\\d+)\\s+(\\d+)\\/(\\d+)|(\\d+)?\\s?([¼½¾⅓⅔⅙⅚⅛⅜⅝⅞])|(\\d+)\\/(\\d+)|(\\d+(?:\\.\\d+)?)/g;
function kitchen(v){if(v>=10)return String(Math.round(v));var w=Math.floor(v),f=v-w,b=F[0];F.forEach(function(c){if(Math.abs(c[0]-f)<Math.abs(b[0]-f))b=c});if(b[0]===1){w+=1;b=F[0]}if(!w&&!b[1])return String(Math.round(v*100)/100);return(w?String(w):'')+b[1]}
function metric(v){if(v>=100)return String(Math.round(v/5)*5);if(v>=10)return String(Math.round(v));return String(Math.round(v*10)/10)}
function scale(t,k,m){return t.replace(RE,function(s,a,b,c,d,e,f,g,h){var v=a?(+a+b/c):e?((d?+d:0)+U[e]):f?(f/g):+h;return(m?metric:kitchen)(v*k)})}
function apply(n){var k=n/base;out.value=n;reset.hidden=n===base;document.querySelectorAll('[data-q]').forEach(function(el){var q=el.getAttribute('data-q');el.textContent=k===1?q:scale(q,k,el.hasAttribute('data-q-metric'));el.classList.toggle('rc-scaled',k!==1)});document.querySelectorAll('[data-serves]').forEach(function(el){el.textContent=el.getAttribute('data-serves').replace(/^\\s*\\d+/,String(n))})}
input.addEventListener('input',function(){apply(+input.value)});reset.addEventListener('click',function(){input.value=base;apply(base)});
})();`;
    return (
        `<div class="rc-servings" data-rc-servings>` +
        `<label>Servings <input type="range" min="1" max="${max}" step="1" value="${base}" aria-label="Servings"><output>${base}</output></label>` +
        `<button type="button" hidden>Reset to ${base}</button>` +
        `<script>${script}</script></div>`
    );
}

const paragraphs = (s?: string) => (s ? s.split(/\n\n+/).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : '');

export interface RenderContext {
    /** Canonical page URL, for the copy-link button and og:url. */
    url: string;
    /** The artifact's description, when it differs from the recipe summary. */
    description?: string;
    /** The recipes index to link back to. */
    indexUrl?: string;
}

/** Every placeholder the template may use. Unknown `{{names}}` are left as typed. */
export function placeholders(r: Recipe, ctx: RenderContext): Record<string, string> {
    const desc = ctx.description || r.summary || '';
    // Share-card tags (og:*, twitter:*) are added by the service on the way out, like every
    // other artifact page, so the template only carries the plain description.
    const head = desc ? `<meta name="description" content="${esc(desc)}">` : '';
    const base = baseServings(r);
    const meta = (r.meta || [])
        .map((m) => {
            // The servings chip follows the slider.
            const serves = base && SERVES_LABEL.test(m.label.trim()) && /^\s*\d+/.test(m.value) ? ` data-serves="${esc(m.value)}"` : '';
            return `<span class="rc-chip"><span class="rc-chip-k">${esc(m.label)}</span><span class="rc-chip-v"${serves}>${esc(m.value)}</span></span>`;
        })
        .join('');
    const tags = (r.tags || []).map((t) => `<span class="rc-tag">${esc(t)}</span>`).join('');
    const credit = r.source
        ? `${esc(r.source.text)}${r.source.url ? ` <a href="${esc(r.source.url)}" rel="noopener noreferrer" target="_blank">${esc(r.source.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : ''}`
        : '';
    const approx = r.metric_approx ? 'Metric amounts are approximate conversions.' : '';
    const toolbar =
        `<nav class="rc-toolbar" data-rc-toolbar>` +
        (ctx.indexUrl ? `<a class="rc-btn" href="${esc(ctx.indexUrl)}">All recipes</a>` : '') +
        `<button type="button" class="rc-btn" onclick="window.print()">Print</button>` +
        `<button type="button" class="rc-btn" onclick="window.print()" title="Choose Save as PDF in the print dialog">Save PDF</button>` +
        `<button type="button" class="rc-btn" data-url="${esc(ctx.url)}" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.dataset.url).then(()=>{this.textContent='Copied';setTimeout(()=>this.textContent='Copy link',1500)})">Copy link</button>` +
        `</nav>`;
    return {
        head,
        title: esc(r.title),
        summary: esc(r.summary || ''),
        meta,
        tags,
        chart: renderChart(r),
        servings: base ? servingsControl(base) : '',
        notes: paragraphs(r.notes),
        credit,
        approx,
        toolbar,
    };
}

/**
 * Fills a template. One pass, so a substituted value is never scanned again. A section
 * wrapped in `{{#notes}}...{{/notes}}` is dropped when that placeholder is empty.
 */
export function fillTemplate(template: string, values: Record<string, string>): string {
    const sections = template.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, k: string, inner: string) => (values[k] ? inner : ''));
    return sections.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (k in values ? values[k] : m));
}

export function renderRecipe(template: string, r: Recipe, ctx: RenderContext): string {
    return fillTemplate(template, placeholders(r, ctx));
}

/** The placeholders documented to template editors, in the order they usually appear. */
export const PLACEHOLDER_DOCS: { name: string; what: string }[] = [
    { name: 'head', what: 'The description meta tag. Put it inside <head>; share-card tags are added automatically.' },
    { name: 'toolbar', what: 'Print / Save PDF / Copy link buttons (hidden when printing).' },
    { name: 'title', what: 'The recipe title.' },
    { name: 'summary', what: 'One-line description, if any.' },
    { name: 'meta', what: 'Serves / Prep / Cook chips.' },
    { name: 'servings', what: 'Servings slider that rescales every amount (only when the recipe has a servings count).' },
    { name: 'tags', what: 'Tag pills.' },
    { name: 'chart', what: 'The ingredient and step chart (markup fixed; style it with .rc-* classes).' },
    { name: 'notes', what: 'Notes, as paragraphs.' },
    { name: 'credit', what: 'Source credit with its link.' },
    { name: 'approx', what: '"Metric amounts are approximate conversions." when flagged.' },
];
