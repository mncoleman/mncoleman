/**
 * The only file that touches the `mermaid` package. Loaded on demand (dynamic import from
 * MermaidDiagram), so it is its own chunk and posts without a diagram never download it.
 *
 * `mermaid` is NOT in package.json yet. Until `npm i mermaid` is run, the require below throws
 * at runtime inside a try/catch (a bundler treats a require in a try block as optional), the
 * page shows the diagram source in a code block plus a note, and the build is unaffected.
 */

interface MermaidApi {
    initialize(config: Record<string, unknown>): void;
    parse(text: string, opts?: { suppressErrors?: boolean }): Promise<unknown>;
    render(id: string, text: string): Promise<{ svg: string }>;
}

let api: MermaidApi | null = null;
let lastTheme: string | null = null;
let seq = 0;

function load(): MermaidApi {
    if (api) return api;
    let mod: { default?: MermaidApi } & Partial<MermaidApi>;
    try {
        mod = require('mermaid');
    } catch {
        throw new Error('Diagram support is not installed on this site yet (the "mermaid" package is missing).');
    }
    api = (mod.default || mod) as MermaidApi;
    return api;
}

export async function renderMermaid(source: string, dark: boolean): Promise<string> {
    const mermaid = load();
    const theme = dark ? 'dark' : 'neutral';
    if (lastTheme !== theme) {
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme,
            fontFamily: 'inherit',
            themeVariables: { background: 'transparent' },
        });
        lastTheme = theme;
    }
    const id = `post-mermaid-${++seq}`;
    try {
        await mermaid.parse(source);
        const { svg } = await mermaid.render(id, source);
        return svg;
    } finally {
        // A failed render leaves a stray error node in <body>.
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
    }
}
