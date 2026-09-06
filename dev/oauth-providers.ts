// The actual OAuth token-exchange + userinfo logic, shared between the
// local dev server (oauth-plugin.ts, a Vite middleware) and the production
// deploy (api/auth/[provider].ts, a Vercel serverless function) — this file
// itself has no dependency on either Vite or Vercel, just plain fetch, so
// it can be imported from both without either one dragging the other in.
export interface NormalizedUser {
  name: string;
  email: string;
  picture: string | null;
}

export interface ProviderAuthConfig {
  clientIdEnv: string;
  clientSecretEnv: string;
  tokenUrl: string;
  /** Most token endpoints take these as a URL-encoded POST body; GitHub
   * additionally needs `Accept: application/json` to get JSON back instead
   * of its default form-encoded response. */
  tokenHeaders?: Record<string, string>;
  fetchUser: (accessToken: string) => Promise<NormalizedUser>;
}

export async function exchangeCode(
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

export const PROVIDERS: Record<string, ProviderAuthConfig> = {
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

      // A GitHub account's primary email can be private, in which case
      // `/user`'s own `email` field comes back null — /user/emails (granted
      // by the `user:email` scope) is the fallback that still works then.
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
    // /consumers/ — must match the authorize endpoint's tenant segment in
    // src/lib/oauth.ts; see that file's comment for why.
    tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    fetchUser: async (token) => {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch('https://graph.microsoft.com/v1.0/me', { headers });
      if (!res.ok) throw new Error(`Microsoft Graph /me failed: ${await res.text()}`);
      const user = (await res.json()) as { displayName?: string; mail?: string | null; userPrincipalName?: string };

      // Unlike the other providers, Graph has no direct photo *URL* — the
      // binary itself lives at /me/photo/$value, so it's fetched and
      // inlined as a data: URI here. A 404 there is routine (plenty of
      // accounts, especially personal Microsoft accounts, just have no
      // photo set) rather than an error worth failing the whole sign-in
      // over, hence the try/catch swallowing it down to `null`.
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
