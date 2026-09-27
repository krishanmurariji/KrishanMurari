// The actual contact-form email logic (validate, notify the site owner,
// send the visitor an acknowledgement), shared between the production
// deploy (../contact.ts, a Vercel serverless function) and the local dev
// server (../../dev/email-plugin.ts, a Vite middleware). Lives under
// api/_lib/ rather than dev/ — see oauth-providers.ts's own comment in this
// same folder for why a file imported by a Vercel function specifically
// needs to live inside the api/ directory tree, not just anywhere in the
// repo.
import nodemailer from 'nodemailer';
import { buildAckEmailHtml, buildNotificationEmailHtml } from './ackEmailTemplate';

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
  // Zoho Mail SMTP — smtp.zoho.in on 465 (implicit TLS). This account lives
  // on Zoho's India data center (zoho.in), not the default zoho.com — a
  // regional account's SMTP host must match its own DC or auth fails.
  const transporter = nodemailer.createTransport({
    host: 'smtp.zoho.in',
    port: 465,
    secure: true,
    auth: { user: env.zohoUser, pass: env.zohoPass },
  });

  const letterAttachments = [
    { filename: 'logo.png', path: env.letterheadLogoPath, cid: 'letterhead-logo' },
    { filename: 'watermark-logo.png', path: env.watermarkLogoPath, cid: 'watermark-logo' },
  ];

  await transporter.sendMail({
    from: `"Portfolio Contact Form" <${env.zohoUser}>`,
    to: env.zohoUser,
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

  // Auto-reply to the visitor, confirming receipt — best-effort: its own
  // try/catch keeps a failure here from turning an otherwise-successful
  // submission (the notification above already landed) into an error the
  // visitor sees.
  try {
    await transporter.sendMail({
      from: `"Krishan Murari" <${env.zohoUser}>`,
      to: email,
      subject: `Re: ${subject}`,
      text: `My dear friend,\n\nThank you most kindly for taking the time to write to me. Your letter has arrived safely upon my desk, and I shall give it my full and careful attention, sending my reply to you personally before long.\n\nUntil then, I remain,\nYours most sincerely,\nKrishan\n\nThis is an automated message from krishan.is-a.dev — please don't reply directly to this email.`,
      html: buildAckEmailHtml(),
      attachments: letterAttachments,
    });
  } catch (autoReplyErr) {
    console.error('[contact] auto-reply to visitor failed:', autoReplyErr);
  }
}
