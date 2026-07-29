'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Plug } from 'lucide-react';
import { MCP_URL } from './mcp-callout';

/**
 * Footer entry for the public MCP server. A copy button rather than a link to
 * `/#mcp`: the callout only exists on the home page, and hash navigation plus
 * site-wide Lenis does not reliably land on an anchor when arriving from another
 * route.
 */
export function FooterMcp() {
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    return (
        <button
            type="button"
            onClick={() => {
                try {
                    void navigator.clipboard?.writeText(MCP_URL);
                } catch {
                    /* clipboard unavailable — the URL is still visible in the tooltip */
                }
                setCopied(true);
                timer.current = setTimeout(() => setCopied(false), 1800);
            }}
            title={`Copy ${MCP_URL}`}
            className="inline-flex items-center gap-1 hover:text-foreground underline-offset-4 hover:underline transition-colors"
        >
            {copied ? <Check className="h-3 w-3 text-primary" /> : <Plug className="h-3 w-3" />}
            {copied ? 'MCP URL copied' : 'MCP Server'}
        </button>
    );
}
