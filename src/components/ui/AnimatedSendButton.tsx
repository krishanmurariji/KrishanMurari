// The Email window's submit button (see EmailApp.tsx) — a plane icon that
// "lands" in on mount, waves its letters on hover with a spinning outline,
// and "takes off" while its letters morph into a checkmark + "Sent" once
// the message actually sends. See index.css's ".email-send-*" rules this
// relies on for why the CSS there is prefixed rather than using the pasted
// design's own generic class names (`.button`, `.icon`, `.state`, …) — and
// for how the pasted version's `:focus`-triggered "sent" demo state was
// swapped for this app's own `status` prop via an `.is-sent` class instead.
import type { CSSProperties } from 'react';

// The pasted design fakes the space between "Send" and "Message" with a
// `nth-child(4)` margin-right rather than a real space character (a literal
// space span doesn't animate/wave the same way) — kept here so that CSS
// rule keeps lining up with the actual 4th letter.
const SEND_LETTERS = [...'SendMessage'];
const SENT_LETTERS = [...'Sent'];
// The "Sent" letters continue the same --i sequence the default label left
// off at (5) rather than restarting from 0 — the pasted design's own
// staggering choice, kept as given for a smoother handoff between the two.
const SENT_START_INDEX = 5;

function Letters({ text, startIndex = 0 }: { text: string[]; startIndex?: number }) {
  return (
    <p>
      {text.map((ch, i) => (
        <span key={i} style={{ '--i': startIndex + i } as CSSProperties}>
          {ch}
        </span>
      ))}
    </p>
  );
}

function PlaneIcon() {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="currentColor"
        d="M14.2199 21.63C13.0399 21.63 11.3699 20.8 10.0499 16.83L9.32988 14.67L7.16988 13.95C3.20988 12.63 2.37988 10.96 2.37988 9.78001C2.37988 8.61001 3.20988 6.93001 7.16988 5.60001L15.6599 2.77001C17.7799 2.06001 19.5499 2.27001 20.6399 3.35001C21.7299 4.43001 21.9399 6.21001 21.2299 8.33001L18.3999 16.82C17.0699 20.8 15.3999 21.63 14.2199 21.63ZM7.63988 7.03001C4.85988 7.96001 3.86988 9.06001 3.86988 9.78001C3.86988 10.5 4.85988 11.6 7.63988 12.52L10.1599 13.36C10.3799 13.43 10.5599 13.61 10.6299 13.83L11.4699 16.35C12.3899 19.13 13.4999 20.12 14.2199 20.12C14.9399 20.12 16.0399 19.13 16.9699 16.35L19.7999 7.86001C20.3099 6.32001 20.2199 5.06001 19.5699 4.41001C18.9199 3.76001 17.6599 3.68001 16.1299 4.19001L7.63988 7.03001Z"
      />
      <path
        fill="currentColor"
        d="M10.11 14.4C9.92005 14.4 9.73005 14.33 9.58005 14.18C9.29005 13.89 9.29005 13.41 9.58005 13.12L13.16 9.53C13.45 9.24 13.93 9.24 14.22 9.53C14.51 9.82 14.51 10.3 14.22 10.59L10.64 14.18C10.5 14.33 10.3 14.4 10.11 14.4Z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg stroke="black" strokeWidth="0.5px" width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="currentColor"
        d="M12 22.75C6.07 22.75 1.25 17.93 1.25 12C1.25 6.07 6.07 1.25 12 1.25C17.93 1.25 22.75 6.07 22.75 12C22.75 17.93 17.93 22.75 12 22.75ZM12 2.75C6.9 2.75 2.75 6.9 2.75 12C2.75 17.1 6.9 21.25 12 21.25C17.1 21.25 21.25 17.1 21.25 12C21.25 6.9 17.1 2.75 12 2.75Z"
      />
      <path
        fill="currentColor"
        d="M10.5795 15.5801C10.3795 15.5801 10.1895 15.5001 10.0495 15.3601L7.21945 12.5301C6.92945 12.2401 6.92945 11.7601 7.21945 11.4701C7.50945 11.1801 7.98945 11.1801 8.27945 11.4701L10.5795 13.7701L15.7195 8.6301C16.0095 8.3401 16.4895 8.3401 16.7795 8.6301C17.0695 8.9201 17.0695 9.4001 16.7795 9.6901L11.1095 15.3601C10.9695 15.5001 10.7795 15.5801 10.5795 15.5801Z"
      />
    </svg>
  );
}

export default function AnimatedSendButton({ status }: { status: 'idle' | 'sending' | 'sent' }) {
  const sent = status === 'sent';
  return (
    <button
      type="submit"
      disabled={status === 'sending'}
      className={`email-send-btn${sent ? ' is-sent' : ''}`}
    >
      <div className="email-send-outline" />
      <div className="email-send-state email-send-state--default">
        <div className="email-send-icon">
          <PlaneIcon />
        </div>
        <Letters text={SEND_LETTERS} />
      </div>
      <div className="email-send-state email-send-state--sent">
        <div className="email-send-icon">
          <CheckIcon />
        </div>
        <Letters text={SENT_LETTERS} startIndex={SENT_START_INDEX} />
      </div>
    </button>
  );
}
