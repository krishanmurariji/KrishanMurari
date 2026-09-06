// The HTML body for the auto-reply "acknowledgement" email sent back to a
// visitor after they submit the contact form (see email-plugin.ts) — styled
// as a proper letterhead (logo + faint logo watermark behind the body,
// "krishan.is-a.dev" as the letterhead's company line, an automated-message
// footer). Table-based layout throughout (not flex/grid) since this has to
// render inside actual email clients, several of which (Outlook chief among
// them) only support a small, old subset of CSS.
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
export function buildAckEmailHtml(): string {
  return `
<div style="background:#f4f4f6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #ececec;border-radius:10px;">
    <tr>
      <td
        background="cid:watermark-logo"
        bgcolor="#ffffff"
        style="background-color:#ffffff;background-image:url('cid:watermark-logo');background-repeat:no-repeat;background-position:center;padding:0;"
      >
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <!-- Letterhead header -->
          <tr>
            <td style="padding:24px 32px;border-bottom:2px solid #1c1c1e;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:12px;">
                    <img src="cid:letterhead-logo" width="40" height="40" alt="Krishan Murari" style="display:block;border-radius:9px;" />
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="font-size:16px;font-weight:700;color:#1c1c1e;line-height:1.3;">Krishan Murari</div>
                    <div style="font-size:12px;color:#8a8a8e;line-height:1.3;">krishan.is-a.dev</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#1c1c1e;font-size:14px;line-height:1.65;">
              <p style="margin:0 0 12px;">Hi,</p>
              <p style="margin:0;">
                Thanks for reaching out — I&rsquo;ve received your message and will get back to you soon.
              </p>
              <p style="margin:20px 0 0;">&mdash; Krishan</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;background:#f7f7f8;border-top:1px solid #ececec;border-radius:0 0 10px 10px;text-align:center;font-size:11px;color:#9a9a9e;">
              This is an automated message from krishan.is-a.dev — please don&rsquo;t reply directly to this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;
}
