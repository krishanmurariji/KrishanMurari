// The "Chat Now" AI assistant — replaces the Photo widget's old "Contact
// Me" mailto link (see PhotoCard in DesktopWidgets.tsx). A Gemini-backed
// assistant, grounded in Krishan's real resume/experience data (the system
// prompt lives server-side only — see api/_lib/assistant-knowledge.ts /
// api/chat.ts, never shipped to the client), so it can answer questions
// about his background on his behalf without inventing anything.
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

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
const MAX_MESSAGE_LENGTH = 600;

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const GREETING = "Hi! I'm Krishan's AI assistant. Ask me about his experience, skills, or projects — or how to get in touch with him directly.";

export default function ChatAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const isFirstMessage = messages.length === 0;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      setError(`Messages must be under ${MAX_MESSAGE_LENGTH} characters.`);
      return;
    }
    if (isFirstMessage && !turnstileToken) {
      setError('Please complete the verification check before sending.');
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    setError(null);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again.');
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

  const handleClose = () => {
    onClose();
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
          <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="relative flex h-[32rem] w-[26rem] max-h-[85vh] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
            style={{
              background: 'linear-gradient(180deg, rgba(46,46,49,0.96), rgba(28,28,30,0.96))',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            }}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-[14px] font-semibold text-white">Chat with Krishan&rsquo;s AI</div>
                <div className="text-[11px] text-white/45">Usually replies instantly</div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close chat"
                className="flex h-7 w-7 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Transcript */}
            <div ref={scrollRef} data-lenis-prevent className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <ChatBubble role="model" text={GREETING} />
              {messages.map((m, i) => (
                <ChatBubble key={i} role={m.role} text={m.text} />
              ))}
              {sending && <TypingBubble />}
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-white/10 p-3">
              {error && <div className="mb-2 rounded-lg bg-red-500/15 px-3 py-1.5 text-[12px] text-red-300">{error}</div>}

              {isFirstMessage && TURNSTILE_SITE_KEY && (
                <div className="mb-2 flex justify-center">
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={TURNSTILE_SITE_KEY}
                    theme="dark"
                    onVerify={setTurnstileToken}
                    onExpire={() => setTurnstileToken(null)}
                    onError={() => setTurnstileToken(null)}
                  />
                </div>
              )}

              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  maxLength={MAX_MESSAGE_LENGTH}
                  rows={1}
                  placeholder="Ask about Krishan's experience, skills, projects…"
                  className="max-h-24 min-h-[38px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-white placeholder:text-white/35 outline-none focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="flex h-[38px] shrink-0 items-center justify-center rounded-xl bg-white px-4 text-[13px] font-semibold text-black transition disabled:cursor-default disabled:opacity-40"
                >
                  Send
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
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
          isUser ? 'rounded-br-sm bg-white text-black' : 'rounded-bl-sm bg-white/10 text-white/90'
        }`}
      >
        {text}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white/10 px-3.5 py-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/50"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
    </div>
  );
}
