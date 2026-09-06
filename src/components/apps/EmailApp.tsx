// Content for the dock's "Email" window (see APP_BODIES in AppWindow.tsx) —
// a real contact form (your email, subject, message) instead of just a
// mailto: link. Submits to /api/contact, which sends it on via Gmail SMTP
// (dev/email-plugin.ts in dev; see that file's own comment on what
// production still needs). Validated on both ends — this side is for
// immediate feedback as the visitor types, the server re-checks everything
// since a request could always be sent straight to the endpoint.
//
// Styled as a neumorphic "soft UI" card per a pasted design — see
// index.css's ".neumorphic"/".neumorphic-inset" rules and
// AnimatedSendButton.tsx for how that pasted markup (which used shadcn/ui
// tokens this project doesn't define) was ported to this codebase's own
// plain-Tailwind conventions instead. The card itself scales up (wider,
// Email/Subject side-by-side, taller message box) past `sm` so the window
// doesn't read as a small fixed-size box floating in a sea of empty space
// once it's maximized to fill the screen.
import { useEffect, useId, useState } from 'react';
import type { FormEvent, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AnimatedSendButton from '../ui/AnimatedSendButton';
import EnvelopeLoader from './email/EnvelopeLoader';

// How long the envelope-loader intro plays before the form fades in — the
// same "intro plays, then content fades in" pattern as the Experience
// window's EyeIntro and the Profile window's Ripple intro (see those
// components' own INTRO_MS comments). This one's animation is a much
// smaller/simpler loop than either of those, so it gets a shorter hold.
const INTRO_MS = 1500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBJECT_MIN = 3;
const SUBJECT_MAX = 150;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;

interface FieldErrors {
  email?: string;
  subject?: string;
  message?: string;
}

function validate(email: string, subject: string, message: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = 'Enter your email address.';
  else if (!EMAIL_RE.test(email.trim())) errors.email = 'That doesn’t look like a valid email address.';

  if (!subject.trim()) errors.subject = 'Enter a subject.';
  else if (subject.trim().length < SUBJECT_MIN) errors.subject = `Subject must be at least ${SUBJECT_MIN} characters.`;
  else if (subject.trim().length > SUBJECT_MAX) errors.subject = `Subject must be under ${SUBJECT_MAX} characters.`;

  if (!message.trim()) errors.message = 'Enter a message.';
  else if (message.trim().length < MESSAGE_MIN) errors.message = `Message must be at least ${MESSAGE_MIN} characters.`;
  else if (message.trim().length > MESSAGE_MAX) errors.message = `Message must be under ${MESSAGE_MAX} characters.`;

  return errors;
}

type Status = 'idle' | 'sending' | 'sent' | 'error';

// A plain label-above-field, matching the pasted design (no floating-label
// animation this time) — the field itself is a "neumorphic-inset" surface
// so it reads as pressed into the card rather than sitting on top of it.
function SimpleField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  touched,
  multiline,
  rows,
  maxLength,
  type = 'text',
  placeholder,
  counter,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
  error?: string;
  touched?: boolean;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  type?: string;
  placeholder?: string;
  counter?: string;
}) {
  const showError = Boolean(touched && error);
  const fieldClass = `neumorphic-inset w-full rounded-xl border-0 px-3.5 py-2.5 text-sm text-[#1c1c1e] outline-none transition-shadow duration-150 placeholder:text-black/35 focus-visible:ring-2 ${
    showError ? 'ring-2 ring-red-400' : 'focus-visible:ring-black/25'
  }${multiline ? ' resize-none' : ''}`;

  const sharedProps = {
    id,
    value,
    onChange,
    onBlur,
    placeholder,
    maxLength,
    className: fieldClass,
  };

  return (
    <div className={multiline ? 'flex h-full flex-col' : undefined}>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-[#1c1c1e]">
        {label}
      </label>
      <div className={multiline ? 'relative min-h-0 flex-1' : 'relative'}>
        {multiline ? (
          <textarea {...sharedProps} rows={rows} className={`${fieldClass} h-full`} />
        ) : (
          <input {...sharedProps} type={type} />
        )}
        {counter && <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-black/35">{counter}</span>}
      </div>
      <AnimatePresence initial={false}>
        {showError && (
          <motion.p
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden text-xs text-red-500"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

const fieldVariants = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: 0.08 + i * 0.07, duration: 0.4, ease: 'easeOut' as const } }),
};

// How long the button keeps showing its "Sent" checkmark before the form
// clears and goes back to idle, ready for another message.
const SENT_HOLD_MS = 2400;

export default function EmailApp() {
  // Prefixes every field id below — AppWindow's useSharedSnapshots mounts a
  // second, hidden copy of this whole component off-screen to rasterize the
  // dock's genie-open snapshot, so a hardcoded "email"/"subject"/"message"
  // would collide with that copy's own ids (invalid HTML, and genuinely
  // broke getElementById/focus-based interaction with the visible copy —
  // useId() keeps each mounted instance's ids unique).
  const uid = useId();
  const [showContent, setShowContent] = useState(false);
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = validate(email, subject, message);
  const hasErrors = Object.keys(errors).length > 0;

  useEffect(() => {
    const t = window.setTimeout(() => setShowContent(true), INTRO_MS);
    return () => window.clearTimeout(t);
  }, []);

  const handleBlur = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  useEffect(() => {
    if (status !== 'sent') return;
    const id = window.setTimeout(() => {
      setEmail('');
      setSubject('');
      setMessage('');
      setTouched({});
      setStatus('idle');
    }, SENT_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [status]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, subject: true, message: true });
    if (hasErrors) return;

    setStatus('sending');
    setServerError(null);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), subject: subject.trim(), message: message.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Something went wrong — try again.');
      }
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setServerError(err instanceof Error ? err.message : 'Something went wrong — try again.');
    }
  };

  const disabled = status === 'sending' || status === 'sent';

  return (
    <div className="relative h-full w-full">
      <AnimatePresence>
        {!showContent && (
          <motion.div key="intro" exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="absolute inset-0 z-10">
            <EnvelopeLoader />
          </motion.div>
        )}
      </AnimatePresence>

      {showContent && (
        <div
          data-lenis-prevent
          className="no-scrollbar flex h-full w-full flex-col items-center overflow-y-auto overflow-x-hidden bg-[#eef1f6] p-6 sm:p-8 lg:p-10"
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="flex h-full w-full max-w-lg flex-col sm:max-w-xl lg:max-w-2xl xl:max-w-4xl"
          >
            <div className="text-lg font-semibold text-[#1c1c1e] lg:text-xl">Get in touch</div>
            <p className="mt-1 text-sm text-black/60 lg:text-base">
              Send a message straight to my inbox — I&rsquo;ll reply at the email you give below.
            </p>

            {/* `flex-1` (with the outer motion.div's own `flex flex-col`) lets
                this card grow to fill whatever vertical room the window has —
                the message field below grows with it — rather than staying a
                fixed-height box with empty space below it once the window is
                maximized. No fixed `min-h` here — that floor fought this same
                growth in a compact (non-maximized) window, forcing an overflow
                scroll instead of a snug fit; `rows={6}` on the message textarea
                below is enough of a floor on its own. */}
            <form
              onSubmit={handleSubmit}
              noValidate
              className="neumorphic mt-5 flex flex-1 flex-col space-y-5 rounded-3xl p-6 lg:p-8"
            >
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <motion.div custom={0} variants={fieldVariants} initial="hidden" animate="show">
                  <fieldset disabled={disabled} className="contents">
                    <SimpleField
                      id={`${uid}-email`}
                      label="Your email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => handleBlur('email')}
                      error={errors.email}
                      touched={touched.email}
                    />
                  </fieldset>
                </motion.div>

                <motion.div custom={1} variants={fieldVariants} initial="hidden" animate="show">
                  <fieldset disabled={disabled} className="contents">
                    <SimpleField
                      id={`${uid}-subject`}
                      label="Subject"
                      placeholder="Message subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      onBlur={() => handleBlur('subject')}
                      error={errors.subject}
                      touched={touched.subject}
                      maxLength={SUBJECT_MAX}
                    />
                  </fieldset>
                </motion.div>
              </div>

              <motion.div custom={2} variants={fieldVariants} initial="hidden" animate="show" className="min-h-0 flex-1">
                <fieldset disabled={disabled} className="contents">
                  <SimpleField
                    id={`${uid}-message`}
                    label="Message"
                    placeholder="Your message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onBlur={() => handleBlur('message')}
                    error={errors.message}
                    touched={touched.message}
                    multiline
                    rows={6}
                    maxLength={MESSAGE_MAX}
                    counter={`${message.length}/${MESSAGE_MAX}`}
                  />
                </fieldset>
              </motion.div>

              <AnimatePresence initial={false}>
                {status === 'error' && serverError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-red-200">{serverError}</div>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div custom={3} variants={fieldVariants} initial="hidden" animate="show" className="flex justify-center">
                <AnimatedSendButton status={status === 'sending' || status === 'sent' ? status : 'idle'} />
              </motion.div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
