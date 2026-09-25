// Production version of the lock screen's OAuth sign-in endpoints (see
// dev/oauth-plugin.ts for the local-dev equivalent, which imports the same
// logic below from api/_lib/oauth-providers.ts). This file is deliberately
// self-contained — no relative imports to any other file in the repo, only
// npm packages and Node built-ins — because Vercel's Node function builder
// for this project does NOT bundle/trace relative imports for API routes
// at all: two earlier attempts at sharing this logic via an imported file
// (first at dev/oauth-providers.ts, then at api/_lib/oauth-providers.ts,
// i.e. even *inside* the api/ directory tree) both deployed successfully
// but crashed every request with `ERR_MODULE_NOT_FOUND` — confirmed live
// via Vercel's own runtime logs, not assumed. Whatever file this function
// itself compiles to is reliably present at runtime; anything it imports
// via a relative path is not. Inlining is the proven-working fix; the
// duplication with api/_lib/oauth-providers.ts (still the source dev/
// imports) is the accepted cost — keep both in sync if a provider config
// ever changes.
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface NormalizedUser {
  name: string;
  email: string;
  picture: string | null;
}

interface ProviderAuthConfig {
  clientIdEnv: string;
  clientSecretEnv: string;
  tokenUrl: string;
  tokenHeaders?: Record<string, string>;
  fetchUser: (accessToken: string) => Promise<NormalizedUser>;
}

async function exchangeCode(
  tokenUrl: string,
  params: Record<string, string>,
  extraHeaders?: Record<string, string>,
): Promise<string> {
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...extraHeaders },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) throw new Error(data.error_description || data.error || 'token response had no access_token');
  return data.access_token;
}

const PROVIDERS: Record<string, ProviderAuthConfig> = {
  linkedin: {
    clientIdEnv: 'VITE_LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    fetchUser: async (token) => {
      const res = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`LinkedIn userinfo failed: ${await res.text()}`);
      const user = (await res.json()) as { name?: string; given_name?: string; family_name?: string; email?: string; picture?: string };
      return {
        name: user.name ?? ([user.given_name, user.family_name].filter(Boolean).join(' ') || 'LinkedIn User'),
        email: user.email ?? '',
        picture: user.picture ?? null,
      };
    },
  },
  github: {
    clientIdEnv: 'VITE_GITHUB_CLIENT_ID',
    clientSecretEnv: 'GITHUB_CLIENT_SECRET',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    tokenHeaders: { Accept: 'application/json' },
    fetchUser: async (token) => {
      const headers = { Authorization: `Bearer ${token}`, 'User-Agent': 'portfolio-app', Accept: 'application/vnd.github+json' };
      const res = await fetch('https://api.github.com/user', { headers });
      if (!res.ok) throw new Error(`GitHub user fetch failed: ${await res.text()}`);
      const user = (await res.json()) as { name?: string | null; login: string; avatar_url?: string; email?: string | null };

      let email = user.email ?? '';
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', { headers });
        if (emailsRes.ok) {
          const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
          email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email ?? '';
        }
      }

      return { name: user.name || user.login, email, picture: user.avatar_url ?? null };
    },
  },
  google: {
    clientIdEnv: 'VITE_GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    fetchUser: async (token) => {
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Google userinfo failed: ${await res.text()}`);
      const user = (await res.json()) as { name?: string; email?: string; picture?: string };
      return { name: user.name ?? 'Google User', email: user.email ?? '', picture: user.picture ?? null };
    },
  },
  microsoft: {
    clientIdEnv: 'VITE_MICROSOFT_CLIENT_ID',
    clientSecretEnv: 'MICROSOFT_CLIENT_SECRET',
    tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    fetchUser: async (token) => {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch('https://graph.microsoft.com/v1.0/me', { headers });
      if (!res.ok) throw new Error(`Microsoft Graph /me failed: ${await res.text()}`);
      const user = (await res.json()) as { displayName?: string; mail?: string | null; userPrincipalName?: string };

      let picture: string | null = null;
      try {
        const photoRes = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', { headers });
        if (photoRes.ok) {
          const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
          const buffer = Buffer.from(await photoRes.arrayBuffer());
          picture = `data:${contentType};base64,${buffer.toString('base64')}`;
        }
      } catch {
        // no photo — picture stays null
      }

      return { name: user.displayName ?? 'Microsoft User', email: user.mail ?? user.userPrincipalName ?? '', picture };
    },
  },
};

// Best-effort in-memory rate limit, keyed by caller IP — see api/contact.ts
// for the fuller reasoning (module-level Map, survives only within one warm
// serverless instance, but still blunts a script hammering this endpoint
// with junk `code` values).
const rateLimitHits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const hits = (rateLimitHits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateLimitHits.set(key, hits);
    return false;
  }
  hits.push(now);
  rateLimitHits.set(key, hits);
  if (rateLimitHits.size > 5000) {
    for (const [k, times] of rateLimitHits) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) rateLimitHits.delete(k);
    }
  }
  return true;
}

function clientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return (first?.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  if (!checkRateLimit(clientIp(req))) {
    res.status(429).json({ error: 'Too many sign-in attempts — please try again later.' });
    return;
  }

  const provider = typeof req.query.provider === 'string' ? req.query.provider : '';
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    res.status(404).json({ error: `unknown provider: ${provider}` });
    return;
  }

  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: `${cfg.clientIdEnv} / ${cfg.clientSecretEnv} not set` });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const code = typeof body.code === 'string' ? body.code : null;
  const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : null;
  if (!code || !redirectUri) {
    res.status(400).json({ error: 'missing code or redirectUri' });
    return;
  }

  try {
    const accessToken = await exchangeCode(
      cfg.tokenUrl,
      { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret },
      cfg.tokenHeaders,
    );
    const user = await cfg.fetchUser(accessToken);
    res.status(200).json(user);
  } catch (err) {
    console.error(`[api/auth/${provider}] sign-in failed:`, err);
    res.status(502).json({ error: 'Sign-in failed — please try again.' });
  }
}
