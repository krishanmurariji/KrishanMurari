// Production version of the Email window's contact form endpoint (see
// dev/email-plugin.ts for the local-dev equivalent, which imports the same
// logic below from api/_lib/send-contact-email.ts + ackEmailTemplate.ts).
// This file is deliberately self-contained — no relative imports to any
// other file in the repo, only npm packages and Node built-ins — because
// Vercel's Node function builder for this project does NOT bundle/trace
// relative imports for API routes at all, confirmed live via Vercel's own
// runtime logs against api/auth/[provider].ts (see that file's own,
// longer comment on this — two earlier attempts at sharing logic via an
// imported file both deployed successfully but crashed every request with
// `ERR_MODULE_NOT_FOUND`). Inlining is the proven-working fix; the
// duplication with api/_lib/ (still the source dev/ imports) is the
// accepted cost — keep both in sync if this logic ever changes.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ContactFields {
  email: string;
  subject: string;
  message: string;
}

function validateContactFields(body: Record<string, unknown>): { fields?: ContactFields; error?: string } {
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (subject.length < 3 || subject.length > 150) return { error: 'Subject must be 3–150 characters.' };
  if (message.length < 10 || message.length > 5000) return { error: 'Message must be 10–5000 characters.' };

  return { fields: { email, subject, message } };
}

// Escapes the handful of characters that matter inside an HTML text node —
// the message body is visitor-supplied and gets interpolated straight into
// an email's HTML part, so without this a message containing e.g.
// `<img src=x onerror=...>` would render as real markup in whatever mail
// client opens it, not as plain text.
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
// checked against Cloudflare's own siteverify endpoint with the secret key.
async function verifyTurnstile(token: string, secret: string, remoteIp?: string): Promise<boolean> {
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
// Map only survives as long as the current warm serverless instance — a
// real defense against a distributed/sustained attacker needs a shared
// store (Upstash/Vercel KV), not this — but it's free, adds no new infra
// dependency, and still helps against a single script hammering a warm
// instance. Turnstile above is the real gate; this is defense-in-depth.
const rateLimitHits = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

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

// The two outgoing emails' HTML — see api/_lib/ackEmailTemplate.ts for the
// fuller explanation of the table-based layout, the watermark's
// `background`-attribute technique (Gmail/most clients strip
// `position`/`z-index` from inline styles, so a table cell's own background
// is what actually stays behind the content in every client), and why
// `background-size` on it is best-effort (Outlook desktop ignores it
// entirely and falls back to the image's natural size).
const CURSIVE = `'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive`;
const SERIF = `Georgia, 'Times New Roman', serif`;
const INK = '#4a3420';
const GOLD = '#b8935a';
const PARCHMENT = '#fdf8ee';
const PAGE_BG = '#efe6d2';

function letterFrame(bodyHtml: string): string {
  return `
<div style="background:${PAGE_BG};padding:40px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
    <tr>
      <td style="padding:5px;background:${GOLD};border-radius:8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PARCHMENT};border-radius:5px;">
          <tr>
            <td
              background="cid:watermark-logo"
              bgcolor="${PARCHMENT}"
              style="background-color:${PARCHMENT};background-image:url('cid:watermark-logo');background-repeat:no-repeat;background-position:center 60%;background-size:320px 320px;padding:0;"
            >
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:40px 48px 6px;text-align:center;">
                    <img
                      src="cid:letterhead-logo"
                      width="48"
                      height="48"
                      alt="Krishan Murari"
                      style="display:inline-block;border-radius:999px;border:2px solid ${GOLD};"
                    />
                    <div style="margin-top:14px;font-family:${SERIF};font-size:12px;letter-spacing:5px;text-transform:uppercase;color:${GOLD};">
                      Krishan&nbsp;Murari
                    </div>
                    <div style="margin:12px auto 0;width:64px;height:1px;background:${GOLD};"></div>
                  </td>
                </tr>
                ${bodyHtml}
                <tr>
                  <td style="padding:18px 32px 28px;border-top:1px solid ${GOLD};text-align:center;">
                    <div style="font-family:${SERIF};font-size:11px;letter-spacing:1px;color:${GOLD};">
                      krishan.is-a.dev &nbsp;&middot;&nbsp; an automated correspondence &mdash; please don&rsquo;t reply directly to this email
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
}

function buildAckEmailHtml(): string {
  return letterFrame(`
                <tr>
                  <td style="padding:10px 54px 6px;font-family:${SERIF};font-size:18px;line-height:1.9;color:${INK};">
                    <p style="margin:0 0 24px;font-family:${CURSIVE};font-weight:400;font-size:30px;color:${GOLD};">My Dear Friend,</p>
                    <p style="margin:0 0 20px;">
                      Thank you most kindly for taking the time to write to me. Your letter has arrived safely upon my desk,
                      and I shall give it my full and careful attention, sending my reply to you personally before long.
                    </p>
                    <p style="margin:0;">Until then, I remain</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 54px 36px;text-align:right;">
                    <div style="font-family:${SERIF};font-size:16px;color:${INK};">Yours most sincerely,</div>
                    <div style="margin-top:8px;font-family:${CURSIVE};font-size:38px;color:${GOLD};">Krishan</div>
                  </td>
                </tr>`);
}

function buildNotificationEmailHtml(fields: { email: string; subject: string; message: string }): string {
  return letterFrame(`
                <tr>
                  <td style="padding:10px 54px 6px;font-family:${SERIF};font-size:18px;line-height:1.85;color:${INK};">
                    <p style="margin:0 0 22px;font-family:${CURSIVE};font-weight:400;font-size:30px;color:${GOLD};">A Letter Has Arrived,</p>
                    <p style="margin:0 0 4px;"><strong>From:</strong>&nbsp;${fields.email}</p>
                    <p style="margin:0 0 20px;"><strong>Subject:</strong>&nbsp;${fields.subject}</p>
                    <div style="margin:0 0 22px;padding:20px 24px;background:${PAGE_BG};border-left:3px solid ${GOLD};font-style:italic;">
                      ${fields.message}
                    </div>
                    <p style="margin:0;font-size:14px;color:${GOLD};">Received via the correspondence form on krishan.is-a.dev.</p>
                  </td>
                </tr>`);
}

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

  const zohoUser = process.env.ZOHO_USER;
  const zohoPass = process.env.ZOHO_APP_PASSWORD;
  if (!zohoUser || !zohoPass) {
    res.status(500).json({ error: 'ZOHO_USER / ZOHO_APP_PASSWORD not set' });
    return;
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!turnstileSecret) {
    res.status(500).json({ error: 'TURNSTILE_SECRET_KEY not set' });
    return;
  }

  const ip = clientIp(req);
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Too many messages sent — please try again later.' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
  if (!turnstileToken || !(await verifyTurnstile(turnstileToken, turnstileSecret, ip))) {
    res.status(400).json({ error: 'CAPTCHA verification failed — please try again.' });
    return;
  }

  const { fields, error } = validateContactFields(body);
  if (!fields) {
    res.status(400).json({ error });
    return;
  }

  const origin = siteOrigin(req);
  const { email, subject, message } = fields;

  try {
    // Zoho Mail SMTP — smtp.zoho.in on 465 (implicit TLS). This account
    // lives on Zoho's India data center (zoho.in), not the default
    // zoho.com — a regional account's SMTP host must match its own DC or
    // auth fails.
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.in',
      port: 465,
      secure: true,
      auth: { user: zohoUser, pass: zohoPass },
    });

    const letterAttachments = [
      { filename: 'logo.png', path: `${origin}/android-chrome-512x512.png`, cid: 'letterhead-logo' },
      { filename: 'watermark-logo.png', path: `${origin}/watermark-logo.png`, cid: 'watermark-logo' },
    ];

    await transporter.sendMail({
      from: `"Portfolio Contact Form" <${zohoUser}>`,
      to: zohoUser,
      replyTo: email,
      subject: `[Portfolio] ${subject}`,
      text: `From: ${email}\n\n${message}`,
      html: buildNotificationEmailHtml({
        email: escapeHtml(email),
        subject: escapeHtml(subject),
        message: escapeHtml(message).replace(/\n/g, '<br>'),
      }),
      attachments: letterAttachments,
    });

    try {
      await transporter.sendMail({
        from: `"Krishan Murari" <${zohoUser}>`,
        to: email,
        subject: `Re: ${subject}`,
        text: `My dear friend,\n\nThank you most kindly for taking the time to write to me. Your letter has arrived safely upon my desk, and I shall give it my full and careful attention, sending my reply to you personally before long.\n\nUntil then, I remain,\nYours most sincerely,\nKrishan\n\nThis is an automated message from krishan.is-a.dev — please don't reply directly to this email.`,
        html: buildAckEmailHtml(),
        attachments: letterAttachments,
      });
    } catch (autoReplyErr) {
      console.error('[api/contact] auto-reply to visitor failed:', autoReplyErr);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/contact] send failed:', err);
    res.status(500).json({ error: 'Could not send your message — please try again later.' });
  }
}
