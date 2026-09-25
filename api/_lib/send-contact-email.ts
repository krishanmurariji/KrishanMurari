// The actual contact-form email logic (validate, notify the site owner,
// send the visitor an acknowledgement), shared between the production
// deploy (../contact.ts, a Vercel serverless function) and the local dev
// server (../../dev/email-plugin.ts, a Vite middleware). Lives under
// api/_lib/ rather than dev/ — see oauth-providers.ts's own comment in this
// same folder for why a file imported by a Vercel function specifically
// needs to live inside the api/ directory tree, not just anywhere in the
// repo.
import nodemailer from 'nodemailer';
import { buildAckEmailHtml } from './ackEmailTemplate';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactFields {
  email: string;
  subject: string;
  message: string;
}

export interface ContactEnv {
  zohoUser: string;
  zohoPass: string;
  letterheadLogoPath: string;
  watermarkLogoPath: string;
}

// Escapes the handful of characters that matter inside an HTML text node —
// the message body below is visitor-supplied and gets interpolated
// straight into an email's HTML part, so without this a message containing
// e.g. `<img src=x onerror=...>` would execute/render as real markup in
// whatever mail client renders it, not as plain text.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Cloudflare Turnstile server-side verification — the client widget
// (EmailApp.tsx) hands back an opaque token that only proves anything once
// it's checked against Cloudflare's own siteverify endpoint with the secret
// key; trusting the token itself would let anyone skip the widget entirely
// and just send a fixed string.
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

// Best-effort in-memory rate limit, keyed by caller IP. This module-level
// Map only lives as long as the current process — a real defense against a
// distributed/sustained attacker needs a shared store (Upstash/Vercel KV),
// not this — but it's free, adds no new infra dependency, and still helps
// against a single script hammering the endpoint against one warm
// serverless instance or the long-lived dev server. Turnstile above is the
// real gate; this is defense-in-depth on top of it.
const rateLimitHits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

export function checkRateLimit(key: string, max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS): boolean {
  const now = Date.now();
  const hits = (rateLimitHits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    rateLimitHits.set(key, hits);
    return false;
  }
  hits.push(now);
  rateLimitHits.set(key, hits);
  // Opportunistic cleanup so this Map can't grow unbounded across a
  // long-lived process (the dev server) as distinct IPs come and go.
  if (rateLimitHits.size > 5000) {
    for (const [k, times] of rateLimitHits) {
      if (times.every((t) => now - t >= windowMs)) rateLimitHits.delete(k);
    }
  }
  return true;
}

export function validateContactFields(body: Record<string, unknown>): { fields?: ContactFields; error?: string } {
  // Re-validated here even though EmailApp already checks these —
  // client-side validation only protects the honest visitor typing into
  // the form, not a request sent straight to this endpoint.
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (subject.length < 3 || subject.length > 150) return { error: 'Subject must be 3–150 characters.' };
  if (message.length < 10 || message.length > 5000) return { error: 'Message must be 10–5000 characters.' };

  return { fields: { email, subject, message } };
}

export async function sendContactEmail(fields: ContactFields, env: ContactEnv): Promise<void> {
  const { email, subject, message } = fields;
  // Zoho Mail SMTP — smtp.zoho.com on 465 (implicit TLS). Zoho's regional
  // data-center accounts (zoho.eu, zoho.in, etc.) use a region-specific host
  // instead (smtp.zoho.eu, ...); this assumes the default zoho.com account.
  const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: { user: env.zohoUser, pass: env.zohoPass },
  });

  const safeEmail = escapeHtml(email);
  await transporter.sendMail({
    from: `"Portfolio Contact Form" <${env.zohoUser}>`,
    to: env.zohoUser,
    replyTo: email,
    subject: `[Portfolio] ${subject}`,
    text: `From: ${email}\n\n${message}`,
    html: `<p><strong>From:</strong> ${safeEmail}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
  });

  // Auto-reply to the visitor, confirming receipt — best-effort: its own
  // try/catch keeps a failure here from turning an otherwise-successful
  // submission (the notification above already landed) into an error the
  // visitor sees.
  try {
    await transporter.sendMail({
      from: `"Krishan Murari" <${env.zohoUser}>`,
      to: email,
      subject: `Re: ${subject}`,
      text: `Hi,\n\nThanks for reaching out — I've received your message and will connect with you soon.\n\n— Krishan\n\nThis is an automated message from krishan.is-a.dev — please don't reply directly to this email.`,
      html: buildAckEmailHtml(),
      attachments: [
        { filename: 'logo.png', path: env.letterheadLogoPath, cid: 'letterhead-logo' },
        { filename: 'watermark-logo.png', path: env.watermarkLogoPath, cid: 'watermark-logo' },
      ],
    });
  } catch (autoReplyErr) {
    console.error('[contact] auto-reply to visitor failed:', autoReplyErr);
  }
}
