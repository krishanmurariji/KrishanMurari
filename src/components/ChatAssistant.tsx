// The "Chat Now" AI assistant — replaces the Photo widget's old "Contact
// Me" mailto link (see PhotoCard in DesktopWidgets.tsx). A Gemini-backed
// assistant named Om, grounded in Krishan's real resume/experience data
// (the system prompt lives server-side only — see
// api/_lib/assistant-knowledge.ts / api/chat.ts, never shipped to the
// client), so it can answer questions about his background on his behalf
// without inventing anything.
//
// Rendered via a portal straight onto `document.body` rather than in place
// — this is opened from deep inside DesktopWidgets/PhotoCard, and a plain
// `position: fixed` overlay nested that deep would silently break the
// moment any ancestor (a framer-motion `motion.div`, a CSS filter/opacity
// wrapper) creates a new containing block. A portal sidesteps that
// entirely, the same reason React itself recommends portals for modals.
//
// Security model (see api/chat.ts for the server-side half of this):
// Cloudflare Turnstile gates only the *first* message of a conversation —
// proving a human started it — not every message, which would make a
// multi-turn chat unusable. Per-IP and site-wide daily rate limits (the
// Gemini free tier's request quota is shared across every visitor, not
// per-visitor) are the ongoing defense after that.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Turnstile, { type TurnstileHandle } from './ui/Turnstile';
import RobotAvatar3D, { type BotExpression } from './ui/RobotAvatar3D';
import { usePrefersReducedMotion } from '../lib/useReducedMotion';
import { containsUnsafeContent } from '../lib/scriptDetection';
import { playAngrySound, playThinkingSound, playReplySound } from '../lib/chatSounds';

// How long Om's angry expression holds before easing back to normal on its
// own — long enough to register as a reaction, short enough not to still be
// scowling by the time the visitor has fixed their message.
const ANGRY_HOLD_MS = 1800;

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const MAX_MESSAGE_LENGTH = 600;
const GREETING = "Hey, I'm Om! How can I assist you?";

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// The Web Speech API has no official TypeScript lib types; this is the
// tiny slice of its shape this component actually uses.
interface SpeechRecognitionResultLike {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionResultLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function TypewriterGreeting({ text }: { text: string }) {
  const reducedMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState(reducedMotion ? text.length : 0);

  useEffect(() => {
    if (reducedMotion) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) window.clearInterval(id);
    }, 28);
    return () => window.clearInterval(id);
  }, [text, reducedMotion]);

  return (
    <p className="max-w-md text-center text-lg font-medium text-white sm:text-xl">
      {text.slice(0, shown)}
      {shown < text.length && <span className="animate-pulse">▍</span>}
    </p>
  );
}

export default function ChatAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [expression, setExpression] = useState<BotExpression>('normal');
  const turnstileRef = useRef<TurnstileHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const angryTimeoutRef = useRef<number | null>(null);
  const [botRect, setBotRect] = useState({ top: 0, left: 0, size: 192 });

  const hasStarted = messages.length > 0;
  const isFirstMessage = messages.length === 0;
  const speechSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // Drives the bot's move from centered-and-big to docked-top-left via real
  // top/left/width/height numbers rather than framer motion's `layout` prop
  // — `layout` fakes a smooth resize with a temporary CSS transform: scale(),
  // and applying that to a box containing a react-three-fiber <Canvas>
  // corrupted the WebGL render into a cropped mess (confirmed live: a plain
  // width/height style animation resizes the same canvas cleanly, so the
  // transform step specifically is what breaks it). Recomputed on open,
  // whenever the hero/docked state flips, and on window resize.
  useEffect(() => {
    if (!open) return;
    const computeRect = () => {
      const el = contentRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();
      if (hasStarted) {
        const size = width < 640 ? 64 : width < 768 ? 80 : 96;
        const left = width < 640 ? 24 : 32;
        setBotRect({ top: 32, left, size });
      } else {
        const size = width < 640 ? 144 : 192;
        setBotRect({ top: height * 0.38 - size / 2, left: width / 2 - size / 2, size });
      }
    };
    computeRect();
    window.addEventListener('resize', computeRect);
    return () => window.removeEventListener('resize', computeRect);
  }, [open, hasStarted]);

  // Stop any in-progress dictation the moment the panel closes, rather than
  // leaving the mic listening in the background after the UI it feeds is
  // gone.
  useEffect(() => {
    if (!open) {
      recognitionRef.current?.stop();
      setListening(false);
      setExpression('normal');
      if (angryTimeoutRef.current) window.clearTimeout(angryTimeoutRef.current);
    }
  }, [open]);

  // Clear a pending "ease back to normal" timer on unmount so it can't fire
  // setState after the component is gone.
  useEffect(() => () => {
    if (angryTimeoutRef.current) window.clearTimeout(angryTimeoutRef.current);
  }, []);

  // Om's reaction to a validation or security problem: a brief angry
  // expression plus a matching sound, easing back to normal on its own
  // shortly after (or as soon as the visitor starts typing again).
  const flashAngry = () => {
    setExpression('angry');
    playAngrySound();
    if (angryTimeoutRef.current) window.clearTimeout(angryTimeoutRef.current);
    angryTimeoutRef.current = window.setTimeout(() => setExpression('normal'), ANGRY_HOLD_MS);
  };

  const handleSend = async () => {
    if (sending) return;
    const text = input.trim();
    if (!text) {
      setError('Please write a message before sending.');
      flashAngry();
      return;
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      setError(`Messages must be under ${MAX_MESSAGE_LENGTH} characters.`);
      flashAngry();
      return;
    }
    // Reject an obvious script/markup injection attempt immediately, before
    // it ever reaches the network — the server re-checks the same thing in
    // api/chat.ts, since a client-only check can't stop a request sent
    // straight at the endpoint, but there's no reason to make an honest
    // mistake wait on a round trip to hear about it.
    if (containsUnsafeContent(text)) {
      setError("That message contains script-like content that isn't allowed here — please rewrite it in plain text.");
      flashAngry();
      return;
    }
    if (isFirstMessage && !turnstileToken) {
      setError('Please complete the verification check before sending.');
      flashAngry();
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setError(null);
    setExpression('thinking');
    playThinkingSound();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          ...(isFirstMessage ? { turnstileToken } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Something went wrong — try again.');
      setMessages((prev) => [...prev, { role: 'model', text: data.reply as string }]);
      setExpression('normal');
      playReplySound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again.');
      flashAngry();
      // The failed turn stays in the transcript (it really was sent), but a
      // spent single-use Turnstile token can't be reused for the retry — a
      // fresh widget solve is exactly what the user is about to see again.
      if (isFirstMessage) {
        setTurnstileToken(null);
        turnstileRef.current?.reset();
      }
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSpeak = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="chat-assistant"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100004] flex items-center justify-center p-4"
        >
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />

          {/* The glass panel itself — sized close to "modal-xl": most of a
              big screen, comfortably contained on a small one. */}
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.97, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className="relative flex h-[90vh] max-h-[880px] w-[94vw] max-w-[1180px] flex-col overflow-hidden rounded-[32px] border border-white/15 shadow-2xl"
            style={{
              background: 'linear-gradient(155deg, rgba(48,54,72,0.62), rgba(18,20,28,0.72))',
              backdropFilter: 'blur(36px) saturate(180%)',
              WebkitBackdropFilter: 'blur(36px) saturate(180%)',
            }}
          >
            {/* A soft inner highlight along the top edge — the detail that
                sells "glass" rather than just "dark translucent panel". */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-24"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0))' }}
            />

            {/* No header bar — just a floating close control. */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chat"
              className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur transition hover:bg-white/20 hover:text-white"
            >
              ✕
            </button>

            {/* Main content. The bot is a single, never-unmounted instance
                throughout — its wrapper just moves from centered-and-big to
                docked-top-left via the `layout` prop's own FLIP animation.
                It deliberately does NOT use separate mounted-in-two-places
                elements joined by a shared layoutId: that asks framer motion
                to cross-fade between two independent <Canvas> instances,
                and WebGL canvases don't survive that cross-fade cleanly —
                confirmed live (the second canvas rendered corrupted/cropped
                mid-transition), the same category of issue as
                GlassBackdrop's own "backdrop-filter can't reliably sample a
                WebGL canvas" problem elsewhere in this codebase. Keeping one
                live canvas and only moving its box sidesteps that. */}
            <div ref={contentRef} className="relative min-h-0 flex-1">
              <motion.div
                style={{ position: 'absolute' }}
                animate={{ top: botRect.top, left: botRect.left, width: botRect.size, height: botRect.size }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="z-10"
              >
                <RobotAvatar3D className="h-full w-full" expression={expression} />
              </motion.div>

              <AnimatePresence>
                {!hasStarted && (
                  <motion.div
                    key="greeting"
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-x-0 top-[38%] flex justify-center px-6 pt-28 sm:pt-36"
                  >
                    <TypewriterGreeting text={GREETING} />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {hasStarted && (
                  <motion.div
                    key="transcript"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25, delay: 0.1 }}
                    className="absolute inset-0 pl-28 sm:pl-40 md:pl-48"
                  >
                    <div ref={scrollRef} data-lenis-prevent className="no-scrollbar h-full space-y-4 overflow-y-auto px-5 py-8 sm:px-8">
                      {messages.map((m, i) => (
                        <ChatBubble key={i} role={m.role} text={m.text} />
                      ))}
                      {sending && <TypingBubble />}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Composer — a single boxed, centered pill near the bottom
                rather than a full-width bar, with the mic and send controls
                sitting inside it on the right. */}
            <div className="flex shrink-0 flex-col items-center gap-2 px-6 pb-8 pt-2">
              {error && <div className="rounded-lg bg-red-500/15 px-3 py-1.5 text-[12px] text-red-300">{error}</div>}

              {isFirstMessage && TURNSTILE_SITE_KEY && (
                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  theme="dark"
                  onVerify={setTurnstileToken}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => setTurnstileToken(null)}
                />
              )}

              <div
                className="flex w-full max-w-2xl items-end gap-2 rounded-[28px] border border-white/15 bg-white/10 p-2 pl-4 shadow-lg backdrop-blur-xl"
              >
                <textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Typing again is the visitor fixing whatever tripped
                    // the angry reaction — Om should look normal again
                    // right away rather than still scowling mid-sentence.
                    if (expression === 'angry') {
                      setExpression('normal');
                      if (angryTimeoutRef.current) window.clearTimeout(angryTimeoutRef.current);
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={1}
                  placeholder="Message Om…"
                  className="max-h-28 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[14px] text-white placeholder:text-white/40 outline-none disabled:opacity-50"
                />
                {speechSupported && (
                  <button
                    type="button"
                    onClick={handleSpeak}
                    aria-label={listening ? 'Stop dictation' : 'Speak your message'}
                    aria-pressed={listening}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                      listening ? 'bg-red-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                    }`}
                  >
                    <MicIcon className="h-[18px] w-[18px]" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition disabled:cursor-default disabled:opacity-40"
                >
                  <SendIcon className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

function ChatBubble({ role, text }: { role: 'user' | 'model'; text: string }) {
  const isUser = role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[75%] whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[14px] leading-relaxed ${
          isUser ? 'rounded-br-md bg-white text-black' : 'rounded-bl-md bg-white/10 text-white/90'
        }`}
      >
        {text}
      </div>
    </motion.div>
  );
}

function TypingBubble() {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-start">
      <div className="flex items-center gap-1 rounded-3xl rounded-bl-md bg-white/10 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function MicIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M4 12l16-8-6 8 6 8-16-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="currentColor" />
    </svg>
  );
}
