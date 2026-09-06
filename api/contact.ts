// Production version of the Email window's contact form endpoint (see
// dev/email-plugin.ts for the local-dev equivalent, and
// dev/send-contact-email.ts for the actual shared send logic both call
// into). Vercel builds every file under api/ into its own serverless
// function automatically — no framework config needed for that part.
import path from 'node:path';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendContactEmail, validateContactFields } from '../dev/send-contact-email';

// Vercel bundles a serverless function together with any local files it
// imports (nodemailer's attachment `path` option just needs a real file on
// disk at runtime) — `public/` sits at the repo root next to `api/`, one
// level up from this file.
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const LETTERHEAD_LOGO_PATH = path.join(PUBLIC_DIR, 'android-chrome-512x512.png');
const WATERMARK_LOGO_PATH = path.join(PUBLIC_DIR, 'watermark-logo.png');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    res.status(500).json({ error: 'GMAIL_USER / GMAIL_APP_PASSWORD not set' });
    return;
  }

  // Vercel already parses a JSON request body into req.body for us — no
  // manual stream reading needed here the way the Vite middleware needs.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const { fields, error } = validateContactFields(body);
  if (!fields) {
    res.status(400).json({ error });
    return;
  }

  try {
    await sendContactEmail(fields, {
      gmailUser,
      gmailPass,
      letterheadLogoPath: LETTERHEAD_LOGO_PATH,
      watermarkLogoPath: WATERMARK_LOGO_PATH,
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
