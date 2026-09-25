// Dev-only Vite middleware for the Email window's contact form
// (src/components/apps/EmailApp.tsx) — sends the message via Zoho Mail SMTP
// using nodemailer, after verifying a Cloudflare Turnstile token and a
// basic per-IP rate limit (see api/_lib/send-contact-email.ts). Lives here
// rather than client code for the same reason as oauth-plugin.ts: it needs
// real secrets (the Zoho App Password, the Turnstile secret key), which
// must never ship to the browser. This plugin's `configureServer` hook only
// runs under `vite dev`/`vite preview`, never bundled into the production
// build.
//
// The real deploy target is Vercel — see api/contact.ts, which ports this
// same send logic (shared via api/_lib/send-contact-email.ts, so there's
// one copy of the validation/nodemailer code, not two) into a serverless
// function. That shared file lives under api/_lib/ rather than here in
// dev/ — see its own comment for why a file imported by a Vercel function
// specifically needs to live inside the api/ directory tree.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Plugin } from 'vite';
import { sendContactEmail, validateContactFields, verifyTurnstile, checkRateLimit } from '../api/_lib/send-contact-email';

// Both embedded via cid, not a hosted URL — this needs to render correctly
// with no public deploy and no internet-reachable image host. The header
// uses the site's own crisp logo; the background watermark uses a
// pre-faded copy of it instead (public/watermark-logo.png, ~7% alpha via
// Pillow — see ackEmailTemplate.ts's own comment on why a background-image
// needs an already-faded source file rather than a live opacity tweak).
// Local file paths here (unlike api/contact.ts's live-URL approach) since
// this only ever runs against a local `public/` directory that's always
// right there on disk during `vite dev` — no deployed-function filesystem
// question to work around.
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const LETTERHEAD_LOGO_PATH = path.join(PUBLIC_DIR, 'android-chrome-512x512.png');
const WATERMARK_LOGO_PATH = path.join(PUBLIC_DIR, 'watermark-logo.png');

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

export function emailDevPlugin(): Plugin {
  return {
    name: 'email-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/contact', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }

        const sendJson = (status: number, payload: Record<string, unknown>) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        };

        const zohoUser = process.env.ZOHO_USER;
        const zohoPass = process.env.ZOHO_APP_PASSWORD;
        if (!zohoUser || !zohoPass) {
          sendJson(500, { error: 'ZOHO_USER / ZOHO_APP_PASSWORD not set in .env.local' });
          return;
        }

        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
        if (!turnstileSecret) {
          sendJson(500, { error: 'TURNSTILE_SECRET_KEY not set in .env.local' });
          return;
        }

        const ip = (req.socket.remoteAddress || 'unknown').replace('::ffff:', '');
        if (!checkRateLimit(ip)) {
          sendJson(429, { error: 'Too many messages sent — please try again later.' });
          return;
        }

        let body: Record<string, unknown>;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(400, { error: 'invalid JSON body' });
          return;
        }

        const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
        if (!turnstileToken || !(await verifyTurnstile(turnstileToken, turnstileSecret, ip))) {
          sendJson(400, { error: 'CAPTCHA verification failed — please try again.' });
          return;
        }

        const { fields, error } = validateContactFields(body);
        if (!fields) {
          sendJson(400, { error });
          return;
        }

        try {
          await sendContactEmail(fields, {
            zohoUser,
            zohoPass,
            letterheadLogoPath: LETTERHEAD_LOGO_PATH,
            watermarkLogoPath: WATERMARK_LOGO_PATH,
          });
          sendJson(200, { ok: true });
        } catch (err) {
          sendJson(500, { error: err instanceof Error ? err.message : String(err) });
        }
      });
    },
  };
}
