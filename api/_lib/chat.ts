// The actual "Chat Now" AI assistant logic (validate the incoming
// conversation, call Gemini with the grounding system prompt) — shared
// between the local dev server (../../dev/chat-plugin.ts, a Vite
// middleware) and the production deploy (../chat.ts, a Vercel serverless
// function, which inlines this same logic — see oauth-providers.ts's own
// comment in this folder for why a file imported by a Vercel function
// specifically needs to live inside the api/ directory tree, which is
// exactly why api/chat.ts can't just import this file instead of
// duplicating it).
import { GoogleGenAI } from '@google/genai';
import { buildAssistantSystemPrompt } from './assistant-knowledge';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// A real conversation with the assistant, not the full backing model: caps
// keep both the per-request cost and the abuse surface small. 12 exchanges
// is plenty for "tell me about your experience" back-and-forth; a visitor
// who needs more than that is better served by emailing Krishan directly,
// which the assistant itself is instructed to suggest.
export const MAX_MESSAGES = 24;
export const MAX_MESSAGE_LENGTH = 600;
// Gemini's own free-tier daily request quota is a few thousand, shared
// across every visitor to the site — this stays comfortably under it so a
// burst of chat traffic degrades to "assistant's resting for today, please
// email me" well before it silently starts failing with a raw 429.
export const GLOBAL_DAILY_MAX = 1000;
// gemini-2.5-flash was retired for new API keys — confirmed live against
// Google's own API error ("models/gemini-2.5-flash is no longer available
// to new users... use models/gemini-3.8-flash"), not assumed from
// (possibly stale) SDK docs. Google rotates model names periodically; if
// this ever 404s again, the runtime error names the current replacement.
const MODEL = 'gemini-3.8-flash';

export function validateChatBody(body: Record<string, unknown>): { messages?: ChatMessage[]; turnstileToken?: string; error?: string } {
  const rawMessages = body.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return { error: 'messages must be a non-empty array' };
  }
  if (rawMessages.length > MAX_MESSAGES) {
    return { error: "This conversation has gotten long — please start a new one, or email Krishan directly at murari@krishan.is-a.dev." };
  }

  const messages: ChatMessage[] = [];
  for (const raw of rawMessages) {
    if (!raw || typeof raw !== 'object') return { error: 'invalid message' };
    const { role, text } = raw as Record<string, unknown>;
    if (role !== 'user' && role !== 'model') return { error: 'invalid message role' };
    if (typeof text !== 'string' || !text.trim()) return { error: 'invalid message text' };
    const trimmed = text.trim();
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      return { error: `Messages must be under ${MAX_MESSAGE_LENGTH} characters.` };
    }
    messages.push({ role, text: trimmed });
  }
  // The assistant only ever responds to a fresh user turn — a request
  // ending on its own ("model") reply would just be asking it to talk to
  // itself.
  if (messages[messages.length - 1].role !== 'user') {
    return { error: 'the last message must be from the user' };
  }

  const turnstileToken = typeof body.turnstileToken === 'string' ? body.turnstileToken : undefined;
  return { messages, turnstileToken };
}

const FALLBACK_REPLY = "Sorry, I couldn't come up with a reply to that — try rephrasing, or reach Krishan directly at murari@krishan.is-a.dev.";
const BLOCKED_REPLY = "I can only help with questions about Krishan's background and work — let's keep to that. You can also reach him directly at murari@krishan.is-a.dev.";

export async function generateAssistantReply(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const contents = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  const response = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: buildAssistantSystemPrompt(),
      temperature: 0.6,
      maxOutputTokens: 400,
    },
  });

  // A prompt/response Gemini's own safety filters blocked comes back with
  // no usable text at all rather than throwing — surfacing that as the
  // assistant's own on-brand redirect reads far better than a blank reply
  // or a raw error.
  if (response.promptFeedback?.blockReason) return BLOCKED_REPLY;
  return response.text?.trim() || FALLBACK_REPLY;
}
