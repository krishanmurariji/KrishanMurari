// Dev-only Vite middleware that completes what the client half
// (src/lib/oauth.ts) can't: exchanging each provider's authorization `code`
// for an access token, then fetching the visitor's name/email/photo. Both
// steps need that provider's Client Secret, which is why they live here
// instead of in client code — this plugin's `configureServer` hook only
// runs under `vite dev`/`vite preview`, never bundled into the production
// build, so no secret ever ships to the browser.
//
// Generalized from what started as LinkedIn-only support (one middleware,
// one provider) into one middleware per registered provider, each built
// from a small per-provider config (env var names, token endpoint, and how
// to turn that provider's own userinfo response into {name, email,
// picture}) — adding a provider is now just one more entry in `PROVIDERS`.
//
// This gets local testing fully working right now. The real deploy target
// is Vercel — see api/auth/[provider].ts, which ports this same
// token-exchange logic (shared via oauth-providers.ts, so there's one copy
// of the provider configs, not two) into a serverless function, since
// Vite's dev middleware doesn't exist in the built output at all.
import type { Plugin } from 'vite';
import { PROVIDERS, exchangeCode } from './oauth-providers';

function readJsonBody(req: import('http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function oauthDevPlugin(): Plugin {
  return {
    name: 'oauth-dev-middleware',
    configureServer(server) {
      for (const [provider, cfg] of Object.entries(PROVIDERS)) {
        server.middlewares.use(`/api/auth/${provider}`, async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }

          const sendError = (status: number, message: string) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: message }));
          };

          const clientId = process.env[cfg.clientIdEnv];
          const clientSecret = process.env[cfg.clientSecretEnv];
          if (!clientId || !clientSecret) {
            sendError(500, `${cfg.clientIdEnv} / ${cfg.clientSecretEnv} not set in .env.local`);
            return;
          }

          let body: Record<string, unknown>;
          try {
            body = await readJsonBody(req);
          } catch {
            sendError(400, 'invalid JSON body');
            return;
          }

          const code = typeof body.code === 'string' ? body.code : null;
          const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : null;
          if (!code || !redirectUri) {
            sendError(400, 'missing code or redirectUri');
            return;
          }

          try {
            const accessToken = await exchangeCode(
              cfg.tokenUrl,
              { grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret },
              cfg.tokenHeaders,
            );
            const user = await cfg.fetchUser(accessToken);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(user));
          } catch (err) {
            sendError(502, err instanceof Error ? err.message : String(err));
          }
        });
      }
    },
  };
}
