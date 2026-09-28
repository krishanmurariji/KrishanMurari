// Shared abuse-prevention helpers used by every visitor-facing API route
// (contact form, chat assistant): a best-effort in-memory per-key rate
// limiter and Cloudflare Turnstile verification. Lives under api/_lib/ —
// see oauth-providers.ts's own comment in this same folder for why a file
// imported by a Vercel function specifically needs to live inside the api/
// directory tree. In practice neither api/contact.ts nor api/chat.ts import
// this directly (both stay fully self-contained per that same constraint,
// duplicating these same two functions inline); this is the shared copy
// dev/*.ts's Vite middlewares use, so there's exactly one real
// implementation to keep in sync rather than three.

// "Best-effort" because a module-level Map only lives as long as the
// current process — a real defense against a distributed/sustained
// attacker needs a shared store (Upstash/Vercel KV), not this — but it's
// free, adds no new infra dependency, and still helps against a single
// script hammering a warm serverless instance or the long-lived dev server.
const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so this Map can't grow unbounded across a
  // long-lived process (the dev server) as distinct keys come and go.
  if (buckets.size > 5000) {
    for (const [k, times] of buckets) {
      if (times.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return true;
}

// A single shared counter for "how many requests today", independent of
// caller — protects a resource that's shared across every visitor (Gemini's
// free-tier daily request quota is per API key/project, not per visitor),
// as opposed to checkRateLimit's per-caller fairness. Same best-effort
// caveat as above: resets on cold start and isn't shared across concurrent
// serverless instances, so treat it as a soft speed bump, not a guarantee —
// the provider's own 429 response is the real backstop.
export function checkGlobalDailyLimit(name: string, max: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return checkRateLimit(`daily:${name}:${today}`, max, 24 * 60 * 60 * 1000);
}

// Rejects a message that's actually a script/markup injection attempt
// rather than a real question — the server-side twin of
// src/lib/scriptDetection.ts's identical check. The client-side copy is a
// UX nicety only (instant rejection + Om's angry face, no round trip); this
// one is the real gate, since a client-only check protects nothing against
// a request sent straight at the endpoint.
const SUSPICIOUS_PATTERNS = [
  /<\s*script[\s>]/i,
  /<\s*\/\s*script\s*>/i,
  /<\s*iframe[\s>]/i,
  /<\s*img[^>]*\bon\w+\s*=/i,
  /javascript\s*:/i,
  /on(?:error|load|click|mouseover|focus|blur|input|change|submit)\s*=/i,
  /document\s*\.\s*(cookie|write|location)/i,
  /window\s*\.\s*location/i,
  /eval\s*\(/i,
];

export function containsUnsafeContent(text: string): boolean {
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(text));
}

// Cloudflare Turnstile server-side verification — a client widget hands
// back an opaque token that only proves anything once it's checked against
// Cloudflare's own siteverify endpoint with the secret key; trusting the
// token itself would let anyone skip the widget entirely and just send a
// fixed string.
export async function verifyTurnstile(token: string, secret: string, remoteIp?: string): Promise<boolean> {
  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteIp) params.set('remoteip', remoteIp);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
