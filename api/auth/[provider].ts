// Production version of the lock screen's OAuth sign-in endpoints (see
// dev/oauth-plugin.ts for the local-dev equivalent, and
// dev/oauth-providers.ts for the actual shared provider configs + token-
// exchange logic both call into). One dynamic route handles all four
// providers (github/linkedin/google/microsoft) rather than four near-
// identical files, mirroring PROVIDERS itself being a single map.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PROVIDERS, exchangeCode } from '../../dev/oauth-providers';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).end();
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

  // Vercel already parses a JSON request body into req.body for us.
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
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
