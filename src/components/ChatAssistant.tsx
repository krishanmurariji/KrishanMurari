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
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
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
// its own oversized modal. Used to convert the dock icon's real viewport
// rect into a percentage position *within* the panel's own box for the
// genie clip-path below.
function panelRect() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(vw * 0.94, 760);
  const height = Math.min(vh * 0.88, 580);
  return { left: (vw - width) / 2, top: (vh - height) / 2, width, height };
}

// A real macOS-style genie fold, reusing AppWindow.tsx's exact per-row
// timing/easing (see that file's own renderGenie/eioC/eIn2/DUR) rather than
// a plain CSS `transform: scale()` — a uniform scale reads as "zoom", not
// "poured out of the dock icon", which is what a genie actually looks like.
// AppWindow gets that fold by warping a *snapshot* of the window's content
// row-by-row into an offscreen canvas; that doesn't work here, since this
// panel's content is live (a real WebGL bot canvas, a live chat transcript)
// rather than static marketing content, and this codebase has already hit
// real, confirmed-live limits on sampling/cross-fading a WebGL canvas via a
// snapshot (see GlassBackdrop's own comment on the same problem). Instead,
// the panel's real DOM stays mounted at its actual final size the *entire*
// time — no live-resizing, no snapshot — and only a `clip-path: polygon(…)`
// animates over it, computed with the same per-row math so it reveals the
// live content in the same folding shape a warp would, without ever
// touching the content's own layout or the WebGL canvas at all.
const DUR = 480;
const GENIE_ROWS = 20;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const eioC = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eIn2 = (t: number) => t * t;

function genieClipPath(rawT: number, dir: 'open' | 'minimize', dockX: number, dockY: number): string {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= GENIE_ROWS; i++) {
    const r = i / GENIE_ROWS;
    const rowXStart = dir === 'minimize' ? (1 - r) * 0.65 : r * 0.65;
    const xE = eioC(clamp01((rawT - rowXStart) / (1 - rowXStart)));
    const rowYStart = dir === 'minimize' ? (1 - r) * 0.2 : r * 0.2;
    const yE = eIn2(clamp01((rawT - rowYStart) / (1 - rowYStart)));

    let l: number, rr: number, y: number;
    if (dir === 'open') {
      l = lerp(dockX, 0, xE);
      rr = lerp(dockX, 100, xE);
      y = lerp(dockY, r * 100, yE);
    } else {
      l = lerp(0, dockX, xE);
      rr = lerp(100, dockX, xE);
      y = lerp(r * 100, dockY, yE);
    }
    // Each edge's Y is kept non-decreasing down the traversal — the
    // per-row timing offsets above can otherwise let a later row's Y fall
    // behind an earlier one, self-intersecting the polygon into a bowtie
    // instead of a clean fold.
    const prevL = left[left.length - 1];
    const prevR = right[right.length - 1];
    left.push([l, prevL ? Math.max(y, prevL[1]) : y]);
    right.push([rr, prevR ? Math.max(y, prevR[1]) : y]);
  }
  const pts = [...left, ...right.reverse()];
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`;
}

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
interface SpeechRecognitionErrorLike {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionResultLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
  interface Navigator {
    // Brave's own self-identification API (https://github.com/brave/brave-browser/wiki/Detecting-Brave)
    // — the only reliable way to detect Brave specifically, since it
    // otherwise presents as a normal Chromium UA. Used to short-circuit
    // dictation there: Brave exposes the SpeechRecognition constructor
    // (feature detection passes) but deliberately strips the online speech
    // backend for privacy and never finished an on-device replacement, so
    // it always fails with a misleading error:'network' — see
    // github.com/brave/brave-browser/issues/2802 and /55414, confirmed
    // "not scheduled" by Brave itself.
    brave?: { isBrave: () => Promise<boolean> };
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
  // Set right before every recognitionRef.stop() (not just a cancelled
  // one) — some browsers fire onerror with error:'aborted' as a side
  // effect of a perfectly normal stop() rather than a real failure, and
  // that shouldn't surface as "voice input failed" to the user.
  const dictationStoppingRef = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const angryTimeoutRef = useRef<number | null>(null);

  // The bot's own drop-bounce-settle-and-open-eyes intro plays out first,
  // with nothing else on screen — no greeting, no composer — until it's
  // actually finished (RobotAvatar3D's onIntroComplete): the bot lands,
  // *then* the greeting types out, *then* the composer fades in. Gates
  // both the greeting (TextType below) and the composer off this same
  // flag rather than showing everything the instant the panel opens.
  const [introDone, setIntroDone] = useState(false);

  // The panel's own open/close lifecycle, driving the genie clip-path (see
  // genieClipPath's own comment) — 'closed' means genuinely unmounted, not
  // just visually hidden, so `open` flipping false doesn't remove the panel
  // until its ~480ms closing fold has actually finished playing.
  type Phase = 'closed' | 'opening' | 'open' | 'closing';
  const [phase, setPhase] = useState<Phase>('closed');
  // Mirrors `phase`, read (not `phase` itself) inside the effect below so
  // that effect's dependency array can stay just `[open]` — including
  // `phase` there would re-run this effect every time it's the one thing
  // that just set `phase`, an infinite loop.
  const phaseRef = useRef<Phase>('closed');
  const panelRef = useRef<HTMLDivElement>(null);
  // The title bar's green button — panelRect() (what the genie folds
  // toward/from) always reflects the *normal* centered size regardless of
  // this, so fullscreen is forced back off the moment a close starts (see
  // the phase effect below): folding from a full-viewport rect toward the
  // dock icon would read as a completely different, much larger genie than
  // the one it opened with.
  const [fullscreen, setFullscreen] = useState(false);
  const genieRafRef = useRef(0);
  const genieSettleRef = useRef<number | undefined>(undefined);
  const genieTokenRef = useRef(0);
  // `open` and `originRect` land in the same render (see App.tsx's
  // handleDockSelect, which sets both together), so reading the prop
  // directly at the moment a genie starts is already correct — no need for
  // AppWindow.tsx's own lastOriginRect-ref dance, which exists there to
  // survive a *later* originRect prop change mid-session that this panel's
  // simpler open/close lifecycle never has.
  const runPanelGenie = (dir: 'open' | 'minimize', onSettle: () => void) => {
    cancelAnimationFrame(genieRafRef.current);
    window.clearTimeout(genieSettleRef.current);
    const token = ++genieTokenRef.current;

    const panel = panelRect();
    const dockX = originRect ? originRect.left + originRect.width / 2 : panel.left + panel.width / 2;
    const dockY = originRect ? originRect.top + originRect.height / 2 : panel.top + panel.height / 2;
    const dockXPercent = ((dockX - panel.left) / panel.width) * 100;
    const dockYPercent = ((dockY - panel.top) / panel.height) * 100;

    const applyClip = (rawT: number) => {
      if (panelRef.current) panelRef.current.style.clipPath = genieClipPath(rawT, dir, dockXPercent, dockYPercent);
    };
    // Set synchronously (this only ever runs inside a useLayoutEffect
    // below, before the browser paints) rather than waiting for the first
    // requestAnimationFrame callback — rAF always waits for the *next*
    // paint, which would otherwise let one frame render with no clip-path
    // at all (the panel's full, unclipped box) right as a genie starts.
    applyClip(0);

    let settled = false;
    const settle = () => {
      if (settled || genieTokenRef.current !== token) return;
      settled = true;
      cancelAnimationFrame(genieRafRef.current);
      window.clearTimeout(genieSettleRef.current);
      if (panelRef.current) panelRef.current.style.clipPath = dir === 'open' ? 'none' : genieClipPath(1, dir, dockXPercent, dockYPercent);
      onSettle();
    };
    genieSettleRef.current = window.setTimeout(settle, DUR + 150);

    let start: number | null = null;
    const frame = (ts: number) => {
      if (genieTokenRef.current !== token) return;
      if (start === null) start = ts;
      const rawT = clamp01((ts - start) / DUR);
      applyClip(rawT);
      if (rawT < 1) genieRafRef.current = requestAnimationFrame(frame);
      else settle();
    };
    genieRafRef.current = requestAnimationFrame(frame);
  };

  // Reacts only to `open` itself (see phaseRef's own comment) — starts the
  // opening fold the moment `open` turns true, and the closing fold the
  // moment it turns false, from whatever phase the panel is actually in
  // (so a close requested mid-open still folds smoothly rather than
  // snapping). useLayoutEffect, not useEffect, so the very first
  // (rawT===0) clip-path is in place before the browser paints the opening
  // frame — the same "avoid a one-frame flash of the wrong state"
  // reasoning as RobotAvatar3D's own visibility gating.
  useLayoutEffect(() => {
    if (open) {
      if (phaseRef.current === 'closed') {
        phaseRef.current = 'opening';
        setPhase('opening');
        runPanelGenie('open', () => {
          phaseRef.current = 'open';
          setPhase('open');
        });
      }
    } else if (phaseRef.current !== 'closed') {
      phaseRef.current = 'closing';
      setPhase('closing');
      setFullscreen(false);
      runPanelGenie('minimize', () => {
        phaseRef.current = 'closed';
        setPhase('closed');
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => {
    cancelAnimationFrame(genieRafRef.current);
    window.clearTimeout(genieSettleRef.current);
  }, []);

  const hasStarted = messages.length > 0;
  const isFirstMessage = messages.length === 0;
  const speechSupported = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  // Checked once, up front, rather than waiting for the inevitable
  // error:'network' Brave throws on every real attempt (see the
  // Navigator.brave declaration above) — isBrave() is itself async
  // (resolves after a tick even though the answer is really static per
  // browser), so this starts false and flips true a moment after mount in
  // Brave specifically. A visitor would need to tap the mic within that
  // first instant to still hit the old error path, in practice never.
  const [isBrave, setIsBrave] = useState(false);
  useEffect(() => {
    let cancelled = false;
    navigator.brave?.isBrave().then((result) => {
      if (!cancelled) setIsBrave(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The bot's expression is derived from what's actually happening rather
  // than set ad hoc all over the component: a validation/security flash always
  // wins, then "waiting on the API", then the big welcome grin for the
  // not-yet-started conversation, and otherwise the default smile.
  const expression: BotExpression = angryFlash ? 'angry' : sending ? 'thinking' : !hasStarted ? 'happy' : 'normal';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // The bot stays put at the same centered "hero" spot for the panel's
  // whole lifetime now — it used to dash to a small docked header icon the
  // moment a conversation started (a whole separate machinery: measuring
  // contentRef's pixel rect, a vanish-resize-reappear "dash" timed around a
  // smoke puff, since live-resizing the WebGL canvas while visible could
  // glitch on some GPUs). Per request, it now just sits behind the
  // transcript instead of moving — positioned with plain CSS percentages
  // (see the JSX below) rather than a JS-measured pixel rect, so there's no
  // rect to get wrong, no resize to glitch, and nothing to keep in sync as
  // the panel's own entrance animation plays out.

  // Stop any in-progress dictation the moment the panel closes, rather than
  // leaving the mic listening in the background after the UI it feeds is
  // gone.
  useEffect(() => {
    if (!open) {
      dictationStoppingRef.current = true;
      recognitionRef.current?.stop();
      setAngryFlash(false);
      if (angryTimeoutRef.current) window.clearTimeout(angryTimeoutRef.current);
      setIntroDone(false);
    }
  }, [open]);

  // Clear pending timers on unmount so they can't fire setState after the
  // component is gone.
  useEffect(() => () => {
    if (angryTimeoutRef.current) window.clearTimeout(angryTimeoutRef.current);
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
    // Brave exposes SR (feature detection above passes) but always fails
    // with a misleading error:'network' — see the Navigator.brave
    // declaration's own comment. Telling the visitor plainly up front
    // beats letting them sit through a doomed recording attempt first.
    if (isBrave) {
      setError("Voice input isn't supported in Brave — try Chrome or Edge, or just type your message.");
      flashAngry();
      return;
    }
    dictationCancelledRef.current = false;
    dictationStoppingRef.current = false;
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
    // Previously silent — a permission block, a network hiccup reaching the
    // browser's speech backend, or no microphone at all all ended the same
    // way: VoicePill's own "recording" UI played out normally (it has no
    // idea recognition ever failed), then stopped with nothing typed, no
    // explanation. Surfacing it through the same error banner/angry-flash
    // other failures already use is what actually distinguishes "I didn't
    // hear anything" from "voice input is broken right now".
    recognition.onerror = (e) => {
      recognitionRef.current = null;
      if (dictationCancelledRef.current) return;
      // Some browsers fire this as a side effect of a perfectly normal
      // stop() (tap-to-stop, hold released) rather than a real failure —
      // dictationStoppingRef is only set right before *our own* stop()
      // calls, so an 'aborted' that arrives while it's set is that normal
      // case, not something to flash an error over.
      if (e.error === 'aborted' && dictationStoppingRef.current) return;
      const message =
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Microphone access is blocked — check your browser/site permissions and try again.'
          : e.error === 'audio-capture'
            ? "Couldn't find a microphone to record from."
            : e.error === 'no-speech'
              ? "Didn't catch that — try again."
              : e.error === 'network'
                ? 'Voice input needs a network connection to work — check your connection and try again.'
                // Includes the raw code (language-not-supported, bad-grammar,
                // or an 'aborted' that wasn't from our own stop()) — worth
                // seeing verbatim if this keeps coming up, to add a specific
                // message for whichever one it actually is.
                : `Voice input failed (${e.error}) — please type your message instead.`;
      setError(message);
      flashAngry();
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  // VoicePill's onStop — a slide-past-cancelDistance stop discards
  // whatever gets transcribed (see dictationCancelledRef above); any other
  // stop reason (tap-to-stop, hold released) keeps it.
  const stopDictation = (cancelled: boolean) => {
    dictationCancelledRef.current = cancelled;
    dictationStoppingRef.current = true;
    recognitionRef.current?.stop();
  };

  return createPortal(
    phase !== 'closed' && (
      <div className={`fixed inset-0 z-[100004] flex items-center justify-center ${fullscreen ? '' : 'p-4'}`}>
        {/* Only the backdrop fades on its own quick timer — the panel's
            own visibility is entirely the clip-path genie below (see
            genieClipPath), not opacity. An earlier version put this
            opacity animation on the *outer* wrapper (this dim, and the
            panel, together), which faded the whole thing — panel
            included — to invisible in 150ms while the panel's own
            480ms closing fold was barely a third done, making it look
            like the fold never played at all. */}
        <motion.div
          initial={false}
          animate={{ opacity: phase === 'closing' ? 0 : 1 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
        />

        {/* The glass panel itself — sized to the same WIN_W×WIN_H
            footprint (760×580, clamped to the viewport) every other app
            window uses (see AppWindow.tsx's getOpenSize()), rather than
            its own larger one-off size. Border radius (12px) and shadow
            also match the real app windows' (see WindowChrome/
            AppWindow.tsx — `borderRadius: 12`, `boxShadow: '0 6px 14px
            rgba(0,0,0,0.28)'`), so this reads as the same "window" family
            as Profile/Experience/etc. rather than a bespoke modal. Always
            rendered at its real final size — see genieClipPath's own
            comment for why the fold is a clip-path over the live content
            rather than a scale transform or a warped snapshot. */}
        <div
          ref={panelRef}
          className={
            fullscreen
              ? 'relative flex h-full w-full flex-col overflow-hidden'
              : 'relative flex h-[88vh] max-h-[580px] w-[94vw] max-w-[760px] flex-col overflow-hidden rounded-[12px] border border-white/15'
          }
          style={{
            background: 'linear-gradient(155deg, rgba(48,54,72,0.62), rgba(18,20,28,0.72))',
            backdropFilter: 'blur(36px) saturate(180%)',
            WebkitBackdropFilter: 'blur(36px) saturate(180%)',
            boxShadow: '0 6px 14px rgba(0,0,0,0.28)',
            // Matches AppWindow's own windowed-toggle transition list —
            // only properties the fullscreen toggle actually changes.
            // During the genie's own opening/closing these are already at
            // their final constant values (the fold is the clip-path
            // alone, see genieClipPath's own comment), so this never
            // fights that animation.
            transition: 'width 0.25s ease, height 0.25s ease, border-radius 0.25s ease',
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
                every other app" rather than a bespoke modal. The green
                button toggles fullscreen (see the `fullscreen` state
                above); minimize stays disabled — this panel has no
                dock/tray to minimize into — but stays visible so the
                three-dot cluster itself still reads as a normal macOS
                title bar rather than two working buttons and a gap. */}
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
                {/* Hidden below sm (640px) per earlier request — red/green
                    stay. Acts as a second close (this panel has no
                    dock/tray to minimize into, unlike a real AppWindow, so
                    there's nowhere else for "minimize" to actually go) —
                    per request, rather than staying a disabled third dot
                    that looked clickable and did nothing. */}
                <button
                  type="button"
                  aria-label="Minimize"
                  onClick={onClose}
                  className="hidden w-3.5 h-3.5 rounded-full border-none hover:brightness-90 transition sm:block"
                  style={{ background: '#febc2e', cursor: 'pointer' }}
                />
                <button
                  type="button"
                  aria-label={fullscreen ? 'Exit full screen' : 'Fill screen'}
                  onClick={() => setFullscreen((f) => !f)}
                  className="w-3.5 h-3.5 rounded-full border-none hover:brightness-90 transition"
                  style={{ background: '#28c840', cursor: 'pointer' }}
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

            {/* Main content. The bot sits at a fixed spot (CSS percentage
                position, not a JS-measured rect) for the panel's whole
                lifetime — it never docks to a header icon once a
                conversation starts; it just stays centered, behind the
                transcript once one appears (z-0 vs the transcript/greeting
                below at z-10), the same "background presence" a watermark
                would read as. pointer-events-none since it's now purely
                decorative behind real content — nothing here should ever
                intercept a click meant for a message or the composer. */}
            <div ref={contentRef} className="relative min-h-0 flex-1">
              <div className="pointer-events-none absolute left-1/2 top-[38%] z-0 h-36 w-36 -translate-x-1/2 -translate-y-1/2 sm:h-48 sm:w-48">
                <RobotAvatar3D className="h-full w-full" expression={expression} onIntroComplete={() => setIntroDone(true)} />
              </div>

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
                    className="absolute inset-x-0 top-[38%] z-10 flex justify-center px-6 pt-28 sm:pt-36"
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
                    className="absolute inset-0 z-10"
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

              {/* Only rendered while actually needed — up until the first
                  message is verified, not for the panel's whole lifetime —
                  and removed the instant onVerify fires rather than sitting
                  there showing its solved checkmark for however long the
                  visitor keeps typing before actually hitting send. */}
              <AnimatePresence initial={false}>
                {isFirstMessage && TURNSTILE_SITE_KEY && !turnstileToken && (
                  <motion.div
                    key="turnstile"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={TURNSTILE_SITE_KEY}
                      theme="dark"
                      onVerify={setTurnstileToken}
                      onExpire={() => setTurnstileToken(null)}
                      onError={() => setTurnstileToken(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

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
                    size={40}
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
          </div>
      </div>
    ),
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


function SendIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M4 12l16-8-6 8 6 8-16-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="currentColor" />
    </svg>
  );
}
