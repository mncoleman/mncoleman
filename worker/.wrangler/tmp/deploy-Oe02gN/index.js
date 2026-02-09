var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// index.ts
var index_default = {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      // Update with your domain in production for strict security
      "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response("Admin Auth Worker Running", { status: 200, headers: corsHeaders });
    }
    if (url.pathname === "/auth/login" && request.method === "POST") {
      try {
        const body = await request.json();
        const isValid = await verifyTelegramAuth(body, env.BOT_TOKEN);
        if (!isValid) {
          return new Response("Invalid authentication", { status: 401, headers: corsHeaders });
        }
        if (String(body.id) !== String(env.ALLOWED_USER_ID)) {
          return new Response(`Unauthorized user ID: ${body.id}`, { status: 403, headers: corsHeaders });
        }
        const token = await signJwt({ id: body.id, name: body.first_name }, env.JWT_SECRET);
        return new Response(JSON.stringify({ token }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response("Server Error: " + e.message, { status: 500, headers: corsHeaders });
      }
    }
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (url.pathname.startsWith("/api/")) {
        return new Response("Missing token", { status: 401, headers: corsHeaders });
      }
    } else {
      const token = authHeader.split(" ")[1];
      const payload = await verifyJwt(token, env.JWT_SECRET);
      if (!payload) {
        if (url.pathname.startsWith("/api/")) {
          return new Response("Invalid token", { status: 401, headers: corsHeaders });
        }
      }
    }
    if (url.pathname === "/api/trigger" && request.method === "POST") {
      const body = await request.json();
      if (body.action === "github_dispatch") {
        const resp = await triggerGitHubDispatch(env, body.data?.event_type || "admin_trigger");
        if (!resp.ok) {
          return new Response(JSON.stringify(resp), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify(resp), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (body.action === "n8n_webhook") {
        if (!env.N8N_WEBHOOK_URL) return new Response("N8N URL not configured", { status: 500, headers: corsHeaders });
        const resp = await fetch(env.N8N_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body.data)
        });
        const result = await resp.text();
        return new Response(JSON.stringify({ success: resp.ok, result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response("Unknown action", { status: 400, headers: corsHeaders });
    }
    if (url.pathname === "/api/content") {
      if (request.method === "GET") {
        const path = "data/about.json";
        const localUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${path}`;
        const resp = await fetch(localUrl, {
          headers: {
            "Authorization": `token ${env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Cloudflare-Worker"
          }
        });
        if (!resp.ok) return new Response("Failed to fetch content", { status: resp.status, headers: corsHeaders });
        const data = await resp.json();
        const content = atob(data.content);
        return new Response(JSON.stringify({ content, sha: data.sha }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (request.method === "POST") {
        const body = await request.json();
        const path = "data/about.json";
        const localUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${path}`;
        const updateBody = {
          message: body.message || "Update content via Admin Dashboard",
          content: btoa(body.content),
          // Encode Base64
          sha: body.sha
        };
        const resp = await fetch(localUrl, {
          method: "PUT",
          headers: {
            "Authorization": `token ${env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "Cloudflare-Worker"
          },
          body: JSON.stringify(updateBody)
        });
        if (!resp.ok) {
          const errText = await resp.text();
          return new Response(`Failed to update content: ${errText}`, { status: resp.status, headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};
async function verifyTelegramAuth(data, botToken) {
  const { hash, ...userData } = data;
  if (!hash || !userData) return false;
  const authDate = userData.auth_date;
  const now = Math.floor(Date.now() / 1e3);
  if (now - authDate > 86400) return false;
  const checkString = Object.keys(userData).sort().map((key2) => `${key2}=${userData[key2]}`).join("\n");
  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.digest("SHA-256", encoder.encode(botToken));
  const key = await crypto.subtle.importKey(
    "raw",
    secretKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(checkString)
  );
  const signatureHex = [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return signatureHex === hash;
}
__name(verifyTelegramAuth, "verifyTelegramAuth");
async function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1e3);
  const exp = now + 60 * 60 * 24 * 7;
  const encodedHeader = btoaUrl(JSON.stringify(header));
  const encodedPayload = btoaUrl(JSON.stringify({ ...payload, exp }));
  const signature = await createSignature(encodedHeader + "." + encodedPayload, secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
__name(signJwt, "signJwt");
async function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const computedSignature = await createSignature(header + "." + payload, secret);
  if (signature !== computedSignature) return null;
  const decodedPayload = JSON.parse(atobUrl(payload));
  if (decodedPayload.exp < Math.floor(Date.now() / 1e3)) return null;
  return decodedPayload;
}
__name(verifyJwt, "verifyJwt");
async function createSignature(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoaUrl(String.fromCharCode(...new Uint8Array(signature)));
}
__name(createSignature, "createSignature");
function btoaUrl(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(btoaUrl, "btoaUrl");
function atobUrl(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}
__name(atobUrl, "atobUrl");
async function triggerGitHubDispatch(env, eventType) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO_OWNER || !env.GITHUB_REPO_NAME) {
    return { error: "GitHub vars missing", ok: false };
  }
  const url = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `token ${env.GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "Cloudflare-Worker"
    },
    body: JSON.stringify({ event_type: eventType })
  });
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, status: response.status, error: text };
  }
  return { status: response.status, ok: response.ok };
}
__name(triggerGitHubDispatch, "triggerGitHubDispatch");
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
