// The "Chat Now" AI assistant — replaces the Photo widget's old "Contact
// Me" mailto link (see PhotoCard in DesktopWidgets.tsx). A Gemini-backed
// assistant named "I" (a pun — one eye — formerly "Om"), grounded in
// Krishan's real resume/experience data (the system prompt lives
// server-side only — see api/_lib/assistant-knowledge.ts / api/chat.ts,
// never shipped to the client), so it can answer questions about his
// background on his behalf without inventing anything.
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
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import Turnstile, { type TurnstileHandle } from './ui/Turnstile';
import RobotAvatar3D, { type BotExpression } from './ui/RobotAvatar3D';
import TextType from './ui/TextType';
import CursorGrid from './ui/CursorGrid';
import { containsUnsafeContent } from '../lib/scriptDetection';
import { playAngrySound, playThinkingSound, playReplySound } from '../lib/chatSounds';

// How long the angry expression holds before easing back to normal on its
// own — long enough to register as a reaction, short enough not to still be
// scowling by the time the visitor has fixed their message.
const ANGRY_HOLD_MS = 1800;

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const MAX_MESSAGE_LENGTH = 600;
const GREETING = 'Hi, I is here to assist you';

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

export default function ChatAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [angryFlash, setAngryFlash] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const angryTimeoutRef = useRef<number | null>(null);
  const [botRect, setBotRect] = useState({ top: 0, left: 0, size: 192 });
  // The bot's own drop-bounce-settle-and-open-eyes intro plays out first,
  // with nothing else on screen — no greeting, no composer — until it's
  // actually finished (RobotAvatar3D's onIntroComplete): the bot lands,
  // *then* the greeting types out, *then* the composer fades in. Gates
  // both the greeting (TextType below) and the composer off this same
  // flag rather than showing everything the instant the panel opens.
  const [introDone, setIntroDone] = useState(false);

  const hasStarted = messages.length > 0;
  const isFirstMessage = messages.length === 0;
  const speechSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // The bot's expression is derived from what's actually happening rather
  // than set ad hoc all over the component: a validation/security flash always
  // wins, then "waiting on the API", then the big welcome grin for the
  // not-yet-started conversation, and otherwise the default smile.
  const expression: BotExpression = angryFlash ? 'angry' : sending ? 'thinking' : !hasStarted ? 'happy' : 'normal';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // Drives the bot's move from centered-and-big to a docked header-row icon.
  // Earlier this animated real top/left/width/height numbers continuously
  // over ~600ms (a "jump" arc) — safer than a `transform: scale` (which
  // corrupted the react-three-fiber <Canvas> when combined with a real
  // resize, confirmed live), but continuously resizing a *live* WebGL
  // canvas frame-by-frame still glitched on some GPUs, since the browser
  // has to reallocate the framebuffer on every intermediate size. The fix
  // here sidesteps resizing the canvas while it's visible at all: the bot
  // vanishes in a puff of smoke at the hero spot, snaps instantly to its
  // docked size/position while invisible, then reappears in a second puff —
  // a "dash". The smoke itself is plain DOM/CSS (SmokePuff below), never
  // touching the canvas, so it can't glitch the same way. Once docked, the
  // bot sits in a header strip at the very top of the panel (not floating
  // over the transcript) — the close button and the transcript's own top
  // offset are both derived from this same rect so all three stay visually
  // aligned as one header row.
  const botControls = useAnimationControls();
  const isFirstBotRectRef = useRef(true);
  const wasStartedRef = useRef(hasStarted);
  const [botVisible, setBotVisible] = useState(true);
  const [smokeBurst, setSmokeBurst] = useState<{ key: number; top: number; left: number; size: number } | null>(null);
  const dashTimeoutRef = useRef<number | null>(null);

  // Every fresh open (including reopening a conversation that already has
  // messages) should just snap the bot into its correct spot, never replay
  // the dash — the dash is reserved for the one live moment a conversation
  // actually starts while the panel is already open.
  useEffect(() => {
    if (open) isFirstBotRectRef.current = true;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const applyRect = () => {
      const el = contentRef.current;
      if (!el) return;
      const { width, height } = el.getBoundingClientRect();

      const dockedSize = width < 640 ? 56 : width < 768 ? 64 : 72;
      const dockedLeft = width < 640 ? 20 : 28;
      const dockedRect = { top: 20, left: dockedLeft, size: dockedSize };

      const heroSize = width < 640 ? 144 : 192;
      const heroRect = { top: height * 0.38 - heroSize / 2, left: width / 2 - heroSize / 2, size: heroSize };

      const target = hasStarted ? dockedRect : heroRect;
      setBotRect(target);

      const justDocked = !wasStartedRef.current && hasStarted;
      wasStartedRef.current = hasStarted;

      if (isFirstBotRectRef.current) {
        // First paint (or reopening an already-started conversation) — snap
        // straight there, no animation, no dash.
        isFirstBotRectRef.current = false;
        botControls.set({ top: target.top, left: target.left, width: target.size, height: target.size });
        return;
      }

      if (justDocked) {
        const DASH_HIDE_MS = 220;
        setBotVisible(false);
        setSmokeBurst({ key: Date.now(), top: heroRect.top, left: heroRect.left, size: heroRect.size });

        if (dashTimeoutRef.current) window.clearTimeout(dashTimeoutRef.current);
        dashTimeoutRef.current = window.setTimeout(() => {
          // Resize while invisible — no glitch to see, since nothing is
          // being rendered on screen during the swap.
          botControls.set({ top: target.top, left: target.left, width: target.size, height: target.size });
          setSmokeBurst({ key: Date.now(), top: target.top, left: target.left, size: target.size });
          setBotVisible(true);
        }, DASH_HIDE_MS);
      } else {
        // Plain reflow (e.g. a window resize) — smooth, no dash.
        botControls.start({
          top: target.top,
          left: target.left,
          width: target.size,
          height: target.size,
          transition: { type: 'spring', stiffness: 300, damping: 30 },
        });
      }
    };
    applyRect();
    window.addEventListener('resize', applyRect);
    return () => window.removeEventListener('resize', applyRect);
  }, [open, hasStarted, botControls]);

  // A smoke burst clears itself once its own particle animation has
  // finished playing.
  useEffect(() => {
    if (!smokeBurst) return;
    const id = window.setTimeout(() => setSmokeBurst(null), 650);
    return () => window.clearTimeout(id);
  }, [smokeBurst]);

  // The docked bot's header row: the transcript starts below it (never
  // beside it, so messages stay flush left instead of squeezed right of a
  // floating icon), and the close button's vertical center is pinned to the
  // bot's, so it visually reads as one header rather than two unrelated
  // floating controls.
  const headerHeight = hasStarted ? botRect.top + botRect.size + 16 : 0;
  const closeTop = hasStarted ? botRect.top + botRect.size / 2 - 18 : 20;

  // Stop any in-progress dictation the moment the panel closes, rather than
  // leaving the mic listening in the background after the UI it feeds is
  // gone.
  useEffect(() => {
    if (!open) {
      recognitionRef.current?.stop();
      setListening(false);
      setAngryFlash(false);
      if (angryTimeoutRef.current) window.clearTimeout(angryTimeoutRef.current);
      setBotVisible(true);
      setSmokeBurst(null);
      if (dashTimeoutRef.current) window.clearTimeout(dashTimeoutRef.current);
      setIntroDone(false);
    }
  }, [open]);

  // Clear pending timers on unmount so they can't fire setState after the
  // component is gone.
  useEffect(() => () => {
    if (angryTimeoutRef.current) window.clearTimeout(angryTimeoutRef.current);
    if (dashTimeoutRef.current) window.clearTimeout(dashTimeoutRef.current);
  }, []);

  // The bot's reaction to a validation or security problem: a brief angry
  // expression plus a matching sound, easing back to normal on its own
  // shortly after (or as soon as the visitor starts typing again).
  const flashAngry = () => {
    setAngryFlash(true);
    playAngrySound();
    if (angryTimeoutRef.current) window.clearTimeout(angryTimeoutRef.current);
    angryTimeoutRef.current = window.setTimeout(() => setAngryFlash(false), ANGRY_HOLD_MS);
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
            {/* A faint magenta grid that only lights up right around the
                cursor — pure background ambiance, sits behind everything
                else in normal DOM order and never intercepts clicks
                (CursorGrid's own canvas is pointer-events: none). */}
            <CursorGrid
              cellSize={70}
              color="#D946EF"
              radius={140}
              falloff="smooth"
              holdTime={400}
              fadeDuration={800}
              lineWidth={1.2}
              maxOpacity={1}
              fillOpacity={0}
              gridOpacity={0}
              cellRadius={0}
              clickPulse
              pulseSpeed={600}
            />

            {/* A soft inner highlight along the top edge — the detail that
                sells "glass" rather than just "dark translucent panel". */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-24"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0))' }}
            />

            {/* No dedicated header bar in the JSX — but once the bot docks
                to the top-left, this close control tracks its vertical
                center so the two read as one header row together. */}
            <motion.button
              type="button"
              onClick={onClose}
              aria-label="Close chat"
              animate={{ top: closeTop }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{ position: 'absolute' }}
              className="right-5 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur transition hover:bg-white/20 hover:text-white"
            >
              ✕
            </motion.button>

            {/* Main content. The bot is a single, never-unmounted <Canvas>
                instance throughout — its wrapper's box only ever snaps
                between two fixed rects (see the effect above for why),
                never tweens continuously, so the canvas itself is never
                mid-resize while visible. An inner div fades its opacity for
                the vanish/reappear "dash", and SmokePuff (plain DOM/CSS,
                never touching the canvas) sells the illusion of movement in
                between. This also rules out mounting two <Canvas>
                instances joined by a shared layoutId to cross-fade between
                hero and docked: WebGL canvases don't survive that kind of
                cross-fade cleanly either (confirmed live, corrupted/cropped
                mid-transition) — the same category of issue as
                GlassBackdrop's own "backdrop-filter can't reliably sample a
                WebGL canvas" problem elsewhere in this codebase. */}
            <div ref={contentRef} className="relative min-h-0 flex-1">
              <motion.div style={{ position: 'absolute' }} animate={botControls} className="z-10">
                <motion.div
                  animate={{ opacity: botVisible ? 1 : 0 }}
                  transition={{ duration: 0.18 }}
                  className="h-full w-full"
                >
                  <RobotAvatar3D className="h-full w-full" expression={expression} onIntroComplete={() => setIntroDone(true)} />
                </motion.div>
              </motion.div>

              {smokeBurst && (
                <SmokePuff key={smokeBurst.key} top={smokeBurst.top} left={smokeBurst.left} size={smokeBurst.size} />
              )}

              <AnimatePresence>
                {/* Only mounts once the bot's own landing has finished
                    (introDone) — nothing shows here at all while it's
                    still flying in, per the "land first, then greet"
                    sequencing above. */}
                {!hasStarted && introDone && (
                  <motion.div
                    key="greeting"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-x-0 top-[38%] flex justify-center px-6 pt-28 sm:pt-36"
                  >
                    <TextType
                      text={GREETING}
                      typingSpeed={75}
                      showCursor
                      cursorCharacter="_"
                      loop={false}
                      className="max-w-md text-center text-lg font-medium text-white sm:text-xl"
                    />
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
                    className="absolute inset-x-0 bottom-0"
                    style={{ top: headerHeight, borderTop: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <div ref={scrollRef} data-lenis-prevent className="no-scrollbar h-full space-y-4 overflow-y-auto px-5 py-6 sm:px-8">
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
                sitting inside it on the right. Fades in only once the bot's
                own intro has actually finished (introDone, driven by
                RobotAvatar3D's onIntroComplete above) — same gate as the
                greeting above, so the bot lands, then the visitor gets
                somewhere to type, rather than everything appearing at once.
                Stays in the tree throughout (not conditionally mounted) so
                its own fade is simple opacity/y rather than an enter/exit
                remount; pointer-events is off until ready so it can't be
                clicked or tabbed into while still invisible. */}
            <motion.div
              initial={false}
              animate={{ opacity: introDone ? 1 : 0, y: introDone ? 0 : 10 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              style={{ pointerEvents: introDone ? 'auto' : 'none' }}
              className="flex shrink-0 flex-col items-center gap-2 px-6 pb-8 pt-2">
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
                    // the angry reaction — the bot should look normal again
                    // right away rather than still scowling mid-sentence.
                    if (angryFlash) {
                      setAngryFlash(false);
                      if (angryTimeoutRef.current) window.clearTimeout(angryTimeoutRef.current);
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={1}
                  placeholder="Message I…"
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
            </motion.div>
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

// A puff of smoke at a fixed rect — plain absolutely-positioned/blurred
// spans animated via ordinary CSS transform (top/left/scale/opacity), never
// touching the WebGL canvas, so it can't trigger the resize-glitch the dash
// above is built to avoid. Each particle drifts outward from center and
// fades; a couple are stretched into short streaks for a "wind" feel rather
// than a uniform circular poof.
const SMOKE_PARTICLE_COUNT = 6;

function SmokePuff({ top, left, size }: { top: number; left: number; size: number }) {
  return (
    <div
      style={{ position: 'absolute', top, left, width: size, height: size, pointerEvents: 'none' }}
      className="z-20"
    >
      {Array.from({ length: SMOKE_PARTICLE_COUNT }).map((_, i) => {
        const angle = (i / SMOKE_PARTICLE_COUNT) * Math.PI * 2;
        const dist = size * (0.34 + (i % 2) * 0.16);
        const isStreak = i % 3 === 0;
        const puffW = isStreak ? size * 0.46 : size * (0.28 + (i % 3) * 0.06);
        const puffH = isStreak ? size * 0.15 : puffW;
        return (
          <motion.span
            key={i}
            initial={{
              opacity: 0.65,
              scale: 0.4,
              top: size / 2 - puffH / 2,
              left: size / 2 - puffW / 2,
              rotate: (angle * 180) / Math.PI,
            }}
            animate={{
              opacity: 0,
              scale: 1.5,
              top: size / 2 - puffH / 2 + Math.sin(angle) * dist,
              left: size / 2 - puffW / 2 + Math.cos(angle) * dist,
            }}
            transition={{ duration: 0.5, delay: (i % 3) * 0.03, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              width: puffW,
              height: puffH,
              borderRadius: '9999px',
              background: 'radial-gradient(circle, rgba(255,255,255,0.9), rgba(195,201,214,0.35) 55%, transparent 72%)',
              filter: 'blur(3px)',
            }}
          />
        );
      })}
    </div>
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
