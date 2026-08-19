/**
 * mncoleman-token-count — real token counts for the Skill Lens artifact.
 *
 * The artifact is a static file on Cloudflare Pages, so it cannot hold an API
 * key: anything in it is View Source. This Worker holds the key and exposes one
 * narrow capability — POST /v1/messages/count_tokens — so the page can show a
 * measured number instead of an estimate, without ever seeing the credential.
 *
 * The blast radius is deliberately small: this endpoint can only ever return a
 * token count. It cannot generate text, so an abused key costs counting calls,
 * not completions.
 */

interface Env {
  ANTHROPIC_API_KEY: string;
  RATE_LIMITER: { limit(opts: { key: string }): Promise<{ success: boolean }> };
  MAX_CHARS: string;
  ALLOWED_ORIGIN: string;
}

/** Models this endpoint will forward. An open passthrough would let a caller
 *  probe arbitrary model strings against the key; the artifact only needs these. */
const ALLOWED_MODELS = new Set([
  "claude-opus-5",
  "claude-sonnet-5",
  "claude-fable-5",
  "claude-haiku-4-5",
]);

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors(origin) },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = env.ALLOWED_ORIGIN || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, origin);
    }

    // Rate limit on client IP. This runs before we spend anything upstream.
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    try {
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return json(
          { error: "rate_limited", message: "Too many requests. Try again in a minute." },
          429,
          origin,
        );
      }
    } catch {
      // A limiter failure must not open the gate silently, but it also should
      // not take the endpoint down. Fall through — the size cap below still applies.
    }

    let payload: { text?: string; model?: string };
    try {
      payload = await request.json();
    } catch {
      return json({ error: "bad_json" }, 400, origin);
    }

    const text = typeof payload.text === "string" ? payload.text : "";
    if (!text) return json({ error: "missing_text" }, 400, origin);

    const maxChars = Number(env.MAX_CHARS) || 200_000;
    if (text.length > maxChars) {
      return json(
        { error: "too_large", limit: maxChars, got: text.length },
        413,
        origin,
      );
    }

    const model = payload.model && ALLOWED_MODELS.has(payload.model)
      ? payload.model
      : "claude-sonnet-5";

    const upstream = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, messages: [{ role: "user", content: text }] }),
    });

    if (!upstream.ok) {
      // Surface the status so the page can fall back, but never relay the
      // upstream body — it can echo request details we would rather not expose.
      const detail = upstream.status === 400
        ? "The API rejected the request (this is also what a zero credit balance looks like)."
        : "Upstream error.";
      return json({ error: "upstream", status: upstream.status, detail }, 502, origin);
    }

    const data = (await upstream.json()) as { input_tokens?: number };
    if (typeof data.input_tokens !== "number") {
      return json({ error: "unexpected_response" }, 502, origin);
    }

    return json({ input_tokens: data.input_tokens, model, chars: text.length }, 200, origin);
  },
};
