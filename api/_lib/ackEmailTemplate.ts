// HTML bodies for the contact form's two outgoing emails — the visitor's
// auto-reply acknowledgement, and the notification to the site owner — both
// styled as an old-fashioned handwritten letter (parchment background, a
// gold double-border frame, a faint centered watermark of the site's own
// logo behind the text, a cursive salutation/signature) rather than a
// modern boxed "letterhead" header. Table-based layout throughout (not
// flex/grid) since this has to render inside actual email clients, several
// of which (Outlook chief among them) only support a small, old subset of
// CSS — and Outlook desktop in particular ignores `background-size`
// entirely on a table `background`, so the watermark's scale is a
// best-effort that looks right in Gmail/Apple Mail/webmail and simply falls
// back to the image's natural size there.
//
// The watermark was first tried as a `position:absolute` <img> layered over
// the content — that rendered fine in a browser preview, but Gmail's own
// HTML sanitizer strips `position` (and `z-index`) from inline styles, so
// the "absolutely positioned" image just fell back to being an ordinary
// in-flow element and rendered ABOVE the real content instead of behind it
// (confirmed from the actual delivered message, not assumed). Fixed by
// using the image as a genuine `<td>` background instead — the classic
// email-safe watermark technique, since a table cell's background reliably
// paints behind its content in every client regardless of CSS support, no
// position/z-index involved at all. That background is `watermark-logo.png`
// (public/watermark-logo.png, generated once via Pillow — see the repo's
// own generation note there) — a copy of the site's own logo with its alpha
// channel scaled to ~7%, not the crisp original, since a background-image
// has no CSS-level opacity control of its own to fade it at render time.

const CURSIVE = `'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', cursive`;
const SERIF = `Georgia, 'Times New Roman', serif`;
const INK = '#4a3420';
const GOLD = '#b8935a';
const PARCHMENT = '#fdf8ee';
const PAGE_BG = '#efe6d2';

// The shared letter frame — gold double border, small circular wax-seal
// crest, the faint watermark behind everything, and a gold-rule footer.
// `bodyHtml` is whatever sits between the crest and the footer; both
// templates below only differ in that middle section.
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
                      style="display:inline-block;border-radius:10px;"
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

// Sent back to the visitor, confirming their message arrived.
export function buildAckEmailHtml(): string {
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

// Sent to the site owner, notifying them a visitor wrote in — same letter
// dressing as the acknowledgement above, carrying the actual submission.
export function buildNotificationEmailHtml(fields: { email: string; subject: string; message: string }): string {
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
