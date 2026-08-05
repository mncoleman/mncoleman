/**
 * Retry wrapper for individual Notion API calls.
 *
 * The fetchers deliberately rethrow when credentials are configured but a fetch
 * fails, so the build dies rather than publishing sample data over the live site
 * (see CLAUDE.md → "Credential validation before connect"). That is right for a
 * real outage and wrong for a hiccup: `deploy.yml` builds unattended at 6 AM, and
 * without this a single 429 or 502 takes the whole run down.
 *
 * So transient failures retry here, and only a persistent one reaches the
 * rethrow. Deterministic failures — a bad token, a deleted database, a malformed
 * query — are NOT retried: they will fail identically three times and should
 * surface immediately.
 */

/** Notion error codes worth a second attempt. Everything else is a real answer. */
const TRANSIENT_CODES = new Set([
    'rate_limited',
    'internal_server_error',
    'service_unavailable',
    'gateway_timeout',
    'conflict_error',
]);

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 600;

function isTransient(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    if (code) return TRANSIENT_CODES.has(code);
    // No `code` means it never reached Notion's API layer — a socket hang-up,
    // DNS blip, or fetch abort. Those are exactly the ones worth retrying.
    return error instanceof Error;
}

/** Honour Notion's own back-off hint when it sends one, else exponential. */
function delayFor(error: unknown, attempt: number): number {
    const headers = (error as { headers?: Record<string, string> } | null)?.headers;
    const retryAfter = Number(headers?.['retry-after']);
    if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
    return BASE_DELAY_MS * 2 ** (attempt - 1);
}

export async function withNotionRetry<T>(label: string, call: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await call();
        } catch (error) {
            if (attempt >= MAX_ATTEMPTS || !isTransient(error)) throw error;
            const wait = delayFor(error, attempt);
            console.warn(
                `Notion ${label} failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${wait}ms:`,
                (error as { code?: string })?.code ?? error
            );
            await new Promise((resolve) => setTimeout(resolve, wait));
        }
    }
}
