// The actual "Chat Now" AI assistant logic (validate the incoming
// conversation, call an AI provider with the grounding system prompt) —
// shared between the local dev server (../../dev/chat-plugin.ts, a Vite
// middleware) and the production deploy (../chat.ts, a Vercel serverless
// function, which inlines this same logic — see oauth-providers.ts's own
// comment in this folder for why a file imported by a Vercel function
// specifically needs to live inside the api/ directory tree, which is
// exactly why api/chat.ts can't just import this file instead of
// duplicating it).
//
// OpenAI is the primary provider now; Gemini (the original, and still
// free-tier) is kept as an automatic fallback — not removed — so a visitor
// never sees a hard failure just because one provider is down or (Gemini's
// case) has hit its shared daily quota. generateAssistantReply tries
// OpenAI first when its key is configured, and only calls Gemini if that
// fails or the OpenAI key isn't set at all.
import OpenAI from 'openai';
import { GoogleGenAI, ApiError } from '@google/genai';
import { buildAssistantSystemPrompt } from './assistant-knowledge';
import { containsUnsafeContent } from './security';

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
// A cost cap for OpenAI (the primary provider, billed per request — unlike
// Gemini's free tier) as much as a quota cap for the Gemini fallback;
// stays comfortably under both so a burst of chat traffic degrades to
// "assistant's resting for today, please email me" rather than either
// racking up an open-ended OpenAI bill or silently 429ing on Gemini.
export const GLOBAL_DAILY_MAX = 1000;
// gemini-2.5-flash was retired for new API keys — confirmed live against
// Google's own API error ("models/gemini-2.5-flash is no longer available
// to new users... use models/gemini-3.8-flash"), not assumed from
// (possibly stale) SDK docs. Google rotates model names periodically; if
// this ever 404s again, the runtime error names the current replacement.
const GEMINI_MODEL = 'gemini-3.8-flash';
// gpt-4o-mini: OpenAI's standard small/cheap chat model — picked over a
// newer-sounding name specifically because this exact identifier is the
// one I'm actually confident is spelled right; OpenAI has historically
// kept it available for a long stretch after newer families launch, unlike
// Gemini's comparatively fast model churn above. If OpenAI ever retires it
// too, the runtime error from the API call will name the replacement, same
// as the Gemini case — check Vercel's function logs for "[chat] OpenAI
// request failed" if the assistant starts always falling back to Gemini.
const OPENAI_MODEL = 'gpt-4o-mini';

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
    if (containsUnsafeContent(trimmed)) {
      return { error: "That message contains script-like content that isn't allowed here." };
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithOpenAI(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const client = new OpenAI({ apiKey });
  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: buildAssistantSystemPrompt() },
    // Gemini's 'model' role is OpenAI's 'assistant' — everything else
    // (the text itself) carries over unchanged.
    ...messages.map((m) => ({ role: m.role === 'model' ? ('assistant' as const) : ('user' as const), content: m.text })),
  ];

  // A 429/500/503 can be OpenAI's own servers being momentarily over
  // capacity or rate-limited — genuinely transient, unlike a 400/401/404
  // (bad key/model, retrying won't help). One short retry turns "visitor
  // sees a random failure" into "visitor never notices" for exactly that
  // one recoverable case, same reasoning as the Gemini retry below.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: chatMessages,
        temperature: 0.6,
        max_tokens: 400,
      });

      const choice = response.choices[0];
      // content_filter is OpenAI's own moderation layer blocking the
      // request/response — surfacing that as the assistant's own on-brand
      // redirect reads far better than a blank reply or a raw error, same
      // as Gemini's promptFeedback.blockReason case below.
      if (choice?.finish_reason === 'content_filter') return BLOCKED_REPLY;
      return choice?.message?.content?.trim() || FALLBACK_REPLY;
    } catch (err) {
      lastErr = err;
      if (attempt === 0 && err instanceof OpenAI.APIError && err.status && [429, 500, 503].includes(err.status)) {
        await sleep(700);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function generateWithGemini(apiKey: string, messages: ChatMessage[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const contents = messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  // A 503 ("model overloaded, try again") is Google's own servers being
  // momentarily over capacity — common for a newly-launched model, and
  // genuinely transient, unlike a 400/404 (bad key/model, retrying won't
  // help). One short retry turns "visitor sees a random failure" into
  // "visitor never notices" for exactly that one recoverable case.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          systemInstruction: buildAssistantSystemPrompt(),
          temperature: 0.6,
          maxOutputTokens: 400,
        },
      });

      // A prompt/response Gemini's own safety filters blocked comes back
      // with no usable text at all rather than throwing — surfacing that as
      // the assistant's own on-brand redirect reads far better than a blank
      // reply or a raw error.
      if (response.promptFeedback?.blockReason) return BLOCKED_REPLY;
      return response.text?.trim() || FALLBACK_REPLY;
    } catch (err) {
      lastErr = err;
      if (attempt === 0 && err instanceof ApiError && err.status === 503) {
        await sleep(700);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export interface ChatProviderKeys {
  openaiKey?: string;
  geminiKey?: string;
}

// OpenAI first (now the primary provider), Gemini only as a fallback — not
// a race, not user-selectable: see this file's own top-of-file comment for
// why. A visitor never sees which provider actually answered; both are
// grounded in the exact same system prompt, so the only difference is
// reliability, not behavior.
export async function generateAssistantReply(keys: ChatProviderKeys, messages: ChatMessage[]): Promise<string> {
  if (keys.openaiKey) {
    try {
      return await generateWithOpenAI(keys.openaiKey, messages);
    } catch (err) {
      console.error('[chat] OpenAI request failed, falling back to Gemini:', err);
      if (!keys.geminiKey) throw err;
    }
  }
  if (!keys.geminiKey) {
    throw new Error('No AI provider API key configured (need OPENAI_API_KEY and/or GEMINI_API_KEY)');
  }
  return generateWithGemini(keys.geminiKey, messages);
}
