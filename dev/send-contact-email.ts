// The actual contact-form email logic (validate, notify the site owner,
// send the visitor an acknowledgement), shared between the local dev
// server (email-plugin.ts, a Vite middleware) and the production deploy
// (api/contact.ts, a Vercel serverless function) — this file has no
// dependency on either Vite or Vercel, just nodemailer, so it can be
// imported from both without either one dragging the other in.
import nodemailer from 'nodemailer';
import { buildAckEmailHtml } from './ackEmailTemplate';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactFields {
  email: string;
  subject: string;
  message: string;
}

export interface ContactEnv {
  gmailUser: string;
  gmailPass: string;
  letterheadLogoPath: string;
  watermarkLogoPath: string;
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
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: env.gmailUser, pass: env.gmailPass },
  });

  await transporter.sendMail({
    from: `"Portfolio Contact Form" <${env.gmailUser}>`,
    to: env.gmailUser,
    replyTo: email,
    subject: `[Portfolio] ${subject}`,
    text: `From: ${email}\n\n${message}`,
    html: `<p><strong>From:</strong> ${email}</p><p>${message.replace(/\n/g, '<br>')}</p>`,
  });

  // Auto-reply to the visitor, confirming receipt — best-effort: its own
  // try/catch keeps a failure here from turning an otherwise-successful
  // submission (the notification above already landed) into an error the
  // visitor sees.
  try {
    await transporter.sendMail({
      from: `"Krishan Murari" <${env.gmailUser}>`,
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
