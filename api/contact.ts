// Production version of the Email window's contact form endpoint (see
// dev/email-plugin.ts for the local-dev equivalent, and
// _lib/send-contact-email.ts for the actual shared send logic both call
// into — kept inside api/ specifically, see that file's own comment for
// why). Vercel builds every file under api/ into its own serverless
// function automatically — no framework config needed for that part.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sendContactEmail, validateContactFields } from './_lib/send-contact-email';

// The letterhead/watermark logos as live URLs on this same deployment
// rather than local file paths — a Vercel serverless function's own
// filesystem doesn't reliably include arbitrary repo files it didn't
// explicitly import as code (public/ is served by Vercel's separate static
// hosting, not bundled into this function), but these two PNGs are already
// served there regardless, so nodemailer can just fetch them over HTTP the
// same way any other visitor's browser would.
function siteOrigin(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
  const host = req.headers.host;
  return `${proto}://${host}`;
}

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

  const origin = siteOrigin(req);

  try {
    await sendContactEmail(fields, {
      gmailUser,
      gmailPass,
      letterheadLogoPath: `${origin}/android-chrome-512x512.png`,
      watermarkLogoPath: `${origin}/watermark-logo.png`,
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
