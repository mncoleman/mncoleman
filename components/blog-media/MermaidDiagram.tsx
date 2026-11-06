'use client';

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

function subscribeTheme(cb: () => void) {
    const mo = new MutationObserver(cb);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
}
const isDark = () => document.documentElement.classList.contains('dark');

type State = { kind: 'idle' } | { kind: 'ok'; svg: string } | { kind: 'error'; message: string };

/**
 * A ```mermaid block. The server (and no-JS) output is the plain code block passed as
 * `fallback`; on the client the diagram replaces it, themed for light/dark and re-rendered
 * when the theme switches. A bad diagram or a missing engine keeps the source visible with
 * the error message.
 */
export function MermaidDiagram({ source, fallback }: { source: string; fallback: ReactNode }) {
    const dark = useSyncExternalStore(subscribeTheme, isDark, () => false);
    const [state, setState] = useState<State>({ kind: 'idle' });

    useEffect(() => {
        let live = true;
        import('./mermaid-engine')
            .then((m) => m.renderMermaid(source, dark))
            .then((svg) => {
                if (live) setState({ kind: 'ok', svg });
            })
            .catch((e: unknown) => {
                if (live) setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
            });
        return () => {
            live = false;
        };
    }, [source, dark]);

    if (state.kind === 'ok') {
        return (
            <figure className="post-mermaid not-prose" data-state="ok">
                <div className="post-mermaid-svg" role="img" aria-label="Diagram" dangerouslySetInnerHTML={{ __html: state.svg }} />
            </figure>
        );
    }
    return (
        <div className="post-mermaid not-prose" data-state={state.kind}>
            {state.kind === 'error' && (
                <p className="post-mermaid-error" role="alert">
                    Could not render this diagram: {state.message}
                </p>
            )}
            <div className="post-mermaid-src">{fallback}</div>
        </div>
    );
}
