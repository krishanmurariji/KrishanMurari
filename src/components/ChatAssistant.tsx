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
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import Turnstile, { type TurnstileHandle } from './ui/Turnstile';
import RobotAvatar3D, { type BotExpression } from './ui/RobotAvatar3D';
import TextType from './ui/TextType';
import CursorGrid from './ui/CursorGrid';
import VoicePill from './ui/VoicePill';
import type { DockRect } from './MacDock';
import { containsUnsafeContent } from '../lib/scriptDetection';
import { playAngrySound, playThinkingSound, playReplySound } from '../lib/chatSounds';

// How long the angry expression holds before easing back to normal on its
// own — long enough to register as a reaction, short enough not to still be
// scowling by the time the visitor has fixed their message.
const ANGRY_HOLD_MS = 1800;

// The panel's own footprint, kept identical to its actual Tailwind classes
// below (w-[94vw] max-w-[760px], h-[88vh] max-h-[580px], centered) — the
// same WIN_W/WIN_H ceiling and viewport ratios every other app window uses
// (see AppWindow.tsx), so this reads as "one of the app windows" instead of
// its own oversized modal. Used only to compute where the genie's
// transform-origin should sit relative to the panel, not to size anything.
// Measuring the panel's own rendered bounding box instead would be wrong
// here: it's mid-transform (scaling up from the genie's start point) for
// most of the time that measurement would need to happen, so its rendered
// box doesn't reflect the final layout size the origin math actually needs.
function panelRect() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(vw * 0.94, 760);
  const height = Math.min(vh * 0.88, 580);
  return { left: (vw - width) / 2, top: (vh - height) / 2, width, height };
}

// How small the panel starts before growing to full size — small enough to
// read as "emerging from the dock icon" like every other app window's
// genie, without literally warping/distorting content the way the real
// macOS genie (and this app's own AppWindow.tsx, via a canvas snapshot)
// does; that machinery is built around the desktop-window/tray/minimize
// system this panel doesn't have. A plain scale+transform-origin animation
// gets the "grew out of that dock icon" read at a fraction of the
// complexity, while keeping this panel's own size (the point of this
// request) rather than shrinking to AppWindow's window dimensions.
const GENIE_START_SCALE = 0.04;

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

export default function ChatAssistant({ open, onClose, originRect }: { open: boolean; onClose: () => void; originRect?: DockRect | null }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [angryFlash, setAngryFlash] = useState(false);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Set right before recognitionRef.stop() when a VoicePill hold gesture is
  // slid past cancelDistance — the Web Speech API still fires one last
  // onresult with whatever it transcribed before stop() lands, and a
  // cancelled recording shouldn't have that text land in the composer.
  const dictationCancelledRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const angryTimeoutRef = useRef<number | null>(null);
  const [botRect, setBotRect] = useState({ top: 0, left: 0, size: 192 });

  // Genie open — see GENIE_START_SCALE's comment. Computed with
  // useLayoutEffect (not useEffect) so it's in place before the browser
  // ever paints the opening frame, the same "avoid a one-frame flash of the
  // wrong state" reasoning as RobotAvatar3D's own visibility gating. Only
  // recomputed while `open` is true — when it flips false, this
  // deliberately does *not* reset, so the close animation still shrinks
  // back toward the same point instead of snapping to some default origin
  // mid-exit.
  const [transformOrigin, setTransformOrigin] = useState('50% 50%');
  useLayoutEffect(() => {
    if (!open) return;
    if (!originRect) { setTransformOrigin('50% 50%'); return; }
    const panel = panelRect();
    const originX = originRect.left + originRect.width / 2;
    const originY = originRect.top + originRect.height / 2;
    const px = ((originX - panel.left) / panel.width) * 100;
    const py = ((originY - panel.top) / panel.height) * 100;
    setTransformOrigin(`${px}% ${py}%`);
  }, [open, originRect]);
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

  // Pulled out of the effect below (and into useCallback, so both that
  // effect and the panel's onAnimationComplete can share the exact same
  // function) rather than measuring on every mount unconditionally — see
  // that effect's own comment for why the *first* call has to be deferred
  // past the entrance transition.
  const applyBotRect = useCallback(() => {
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
  }, [hasStarted, botControls]);

  useEffect(() => {
    if (!open) return;
    // Skip the very first measurement here — at this point the panel is
    // still mid entrance transform (scale ramping up from
    // GENIE_START_SCALE, or 0.96 on a plain open, toward 1 over the next
    // several hundred ms), so contentRef.getBoundingClientRect() would read
    // a transiently shrunk box — on a big screen this parked the bot near
    // the viewport's top-left corner for the rest of the session, since
    // isFirstBotRectRef made it a one-time snap that nothing after this
    // ever re-triggered. The panel's own onAnimationComplete below does
    // that first, accurate measurement once the entrance has actually
    // finished; this effect only needs to handle later changes (a message
    // sent, a window resize).
    if (!isFirstBotRectRef.current) applyBotRect();
    window.addEventListener('resize', applyBotRect);
    return () => window.removeEventListener('resize', applyBotRect);
  }, [open, hasStarted, applyBotRect]);

  // A smoke burst clears itself once its own particle animation has
  // finished playing.
  useEffect(() => {
    if (!smokeBurst) return;
    const id = window.setTimeout(() => setSmokeBurst(null), 650);
    return () => window.clearTimeout(id);
  }, [smokeBurst]);

  // The docked bot's header row: the transcript starts below it (never
  // beside it, so messages stay flush left instead of squeezed right of a
  // floating icon).
  const headerHeight = hasStarted ? botRect.top + botRect.size + 16 : 0;

  // Stop any in-progress dictation the moment the panel closes, rather than
  // leaving the mic listening in the background after the UI it feeds is
  // gone.
  useEffect(() => {
    if (!open) {
      recognitionRef.current?.stop();
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
      if (!res.ok) throw new Error(data.error || "Sorry, something went wrong on my end — try again.");
      setMessages((prev) => [...prev, { role: 'model', text: data.reply as string }]);
      playReplySound();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sorry, something went wrong on my end — try again.");
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

  // VoicePill's onStart — begins Web Speech API dictation into the
  // composer. Doesn't record/send an actual audio clip (this app's backend
  // only ever takes text — see api/chat.ts's ChatMessage shape); VoicePill
  // is here purely as a nicer hold-to-record/slide-to-cancel affordance
  // wrapped around the same dictation this button always did.
  const startDictation = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    dictationCancelledRef.current = false;
    const recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (e) => {
      if (dictationCancelledRef.current) return;
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => { recognitionRef.current = null; };
    recognition.onerror = () => { recognitionRef.current = null; };
    recognitionRef.current = recognition;
    recognition.start();
  };

  // VoicePill's onStop — a slide-past-cancelDistance stop discards
  // whatever gets transcribed (see dictationCancelledRef above); any other
  // stop reason (tap-to-stop, hold released) keeps it.
  const stopDictation = (cancelled: boolean) => {
    dictationCancelledRef.current = cancelled;
    recognitionRef.current?.stop();
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

          {/* The glass panel itself — sized to the same WIN_W×WIN_H
              footprint (760×580, clamped to the viewport) every other app
              window uses (see AppWindow.tsx's getOpenSize()), rather than
              its own larger one-off size. Border radius (12px) and shadow
              also match the real app windows' (see WindowChrome/
              AppWindow.tsx — `borderRadius: 12`, `boxShadow: '0 6px 14px
              rgba(0,0,0,0.28)'`), so this reads as the same "window" family
              as Profile/Experience/etc. rather than a bespoke modal. */}
          <motion.div
            initial={{ scale: originRect ? GENIE_START_SCALE : 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: originRect ? GENIE_START_SCALE : 0.97, opacity: 0 }}
            // Drives the bot's *first* hero-position measurement (see
            // applyBotRect's effect above) — deliberately not fired until
            // this entrance animation actually finishes, since
            // contentRef's rect reads wrong while this is still mid-scale.
            onAnimationComplete={() => { if (open) applyBotRect(); }}
            transition={
              // The default spring (tuned for the old, barely-there
              // 0.96→1 fade) resolves a 0.04→1 genie range in well under
              // 100ms — way too fast to read as "growing out of the dock
              // icon". DUR below matches AppWindow's own genie timing
              // (see that file's `DUR = 480`) with an expo-out curve for
              // the same decelerate-into-place feel as its per-row warp.
              originRect
                ? { type: 'tween', duration: 0.48, ease: [0.16, 1, 0.3, 1] }
                : { type: 'spring', stiffness: 340, damping: 32 }
            }
            className="relative flex h-[88vh] max-h-[580px] w-[94vw] max-w-[760px] flex-col overflow-hidden rounded-[12px] border border-white/15"
            style={{
              background: 'linear-gradient(155deg, rgba(48,54,72,0.62), rgba(18,20,28,0.72))',
              backdropFilter: 'blur(36px) saturate(180%)',
              WebkitBackdropFilter: 'blur(36px) saturate(180%)',
              boxShadow: '0 6px 14px rgba(0,0,0,0.28)',
              transformOrigin,
            }}
          >
            {/* A faint magenta grid that only lights up right around the
                cursor — pure background ambiance, sits behind everything
                else (including the title bar below, which is translucent
                enough to show a blurred hint of it) and never intercepts
                clicks (CursorGrid's own canvas is pointer-events: none). */}
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

            {/* A real title bar, matching WindowChrome's exactly (same
                height, gradient, blur, specular sheen, traffic-light
                buttons) instead of a single floating "✕" — this is the
                piece that actually reads as "the same window design as
                every other app" rather than a bespoke modal. Minimize and
                the green "windowed" button are disabled — this panel
                doesn't have either concept — but stay visible so the
                three-dot cluster itself still reads as a normal macOS
                title bar rather than a lone close button. */}
            <div
              className="flex items-center px-4 shrink-0 relative overflow-hidden"
              style={{
                height: 42,
                background: 'linear-gradient(180deg, rgba(58,58,61,0.55), rgba(35,35,37,0.55))',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                borderBottom: '1px solid rgba(255,255,255,.08)',
              }}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.14), transparent 60%)', mixBlendMode: 'screen' }}
              />
              <div className="flex items-center gap-2 z-10">
                <button
                  type="button"
                  aria-label="Close chat"
                  onClick={onClose}
                  className="w-3.5 h-3.5 rounded-full border-none hover:brightness-90 transition"
                  style={{ background: '#ff5f57', cursor: 'pointer' }}
                />
                {/* Hidden below sm (640px) per request — red/green stay. */}
                <button
                  type="button"
                  aria-label="Minimize"
                  disabled
                  className="hidden w-3.5 h-3.5 rounded-full border-none sm:block"
                  style={{ background: '#febc2e', cursor: 'default', opacity: 0.5 }}
                />
                <button
                  type="button"
                  aria-label="Fill screen"
                  disabled
                  className="w-3.5 h-3.5 rounded-full border-none"
                  style={{ background: '#28c840', cursor: 'default', opacity: 0.5 }}
                />
              </div>
              <span
                className="absolute inset-x-0 text-center text-xs font-medium pointer-events-none"
                style={{ color: 'rgba(255,255,255,.55)' }}
              >
                I
              </span>
            </div>

            {/* A soft inner highlight along the top edge — the detail that
                sells "glass" rather than just "dark translucent panel". */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-24"
              style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0))' }}
            />

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
                  <VoicePill
                    accentColor="#f5f5f5"
                    iconColor="#a1a1aa"
                    background="#27272a"
                    size={28}
                    shape="pill"
                    reach={8}
                    showTime
                    waveform
                    slideToCancel
                    cancelDistance={64}
                    attack={40}
                    release={240}
                    sensitivity={1}
                    floor={0.1}
                    openDuration={200}
                    pressScale={0.95}
                    mode="auto"
                    holdAfter={300}
                    reactive="simulated"
                    onStart={() => startDictation()}
                    onStop={({ reason }) => stopDictation(reason === 'cancelled')}
                  />
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


function SendIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M4 12l16-8-6 8 6 8-16-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="currentColor" />
    </svg>
  );
}
