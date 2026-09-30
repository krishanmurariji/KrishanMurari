// Dev-only Vite middleware for the "Chat Now" AI assistant
// (src/components/ChatAssistant.tsx) — verifies a Cloudflare Turnstile
// token on the first message of a conversation, applies per-IP and
// site-wide daily rate limits, then calls Gemini (see
// api/_lib/chat.ts + api/_lib/assistant-knowledge.ts, the logic this
// mirrors). Lives here rather than client code for the same reason as
// email-plugin.ts: it needs the real Gemini API key and Turnstile secret,
// neither of which must ever ship to the browser. This plugin's
// `configureServer` hook only runs under `vite dev`/`vite preview`, never
// bundled into the production build.
//
// The real deploy target is Vercel — see api/chat.ts, which ports this same
// logic (shared via api/_lib/chat.ts, so there's one copy of the
// validation/Gemini-call code, not two) into a serverless function.
import type { Plugin } from 'vite';
import { validateChatBody, generateAssistantReply, GLOBAL_DAILY_MAX } from '../api/_lib/chat';
import { verifyTurnstile, checkRateLimit, checkGlobalDailyLimit } from '../api/_lib/security';

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function readJsonBody(req: import('http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export function chatDevPlugin(): Plugin {
  return {
    name: 'chat-dev-middleware',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }

        const sendJson = (status: number, payload: Record<string, unknown>) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        };

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          sendJson(500, { error: 'GEMINI_API_KEY not set in .env.local' });
          return;
        }

        const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
        if (!turnstileSecret) {
          sendJson(500, { error: 'TURNSTILE_SECRET_KEY not set in .env.local' });
          return;
        }

        const ip = (req.socket.remoteAddress || 'unknown').replace('::ffff:', '');
        if (!checkRateLimit(ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
          sendJson(429, { error: 'Too many messages — please slow down a little.' });
          return;
        }
        if (!checkGlobalDailyLimit('chat', GLOBAL_DAILY_MAX)) {
          sendJson(503, { error: "The assistant's had a lot of visitors today and is resting — please email Krishan directly at murari@krishan.is-a.dev." });
          return;
        }

        let body: Record<string, unknown>;
        try {
          body = await readJsonBody(req);
        } catch {
          sendJson(400, { error: 'invalid JSON body' });
          return;
        }

        const { messages, turnstileToken, error } = validateChatBody(body);
        if (!messages) {
          sendJson(400, { error });
          return;
        }

        // Only the message that starts a fresh conversation needs a human
        // check — requiring a new Turnstile solve on every single message
        // in an ongoing chat would be unusable. A single-message request is
        // exactly what the client sends for a conversation's first turn.
        if (messages.length === 1) {
          if (!turnstileToken || !(await verifyTurnstile(turnstileToken, turnstileSecret, ip))) {
            sendJson(400, { error: 'CAPTCHA verification failed — please try again.' });
            return;
          }
        }

        try {
          const reply = await generateAssistantReply(apiKey, messages);
          sendJson(200, { reply });
        } catch (err) {
          console.error('[chat] Gemini request failed:', err);
          sendJson(502, { error: "Sorry, I couldn't get a response together just now — please try again, or email Krishan directly." });
        }
      });
    },
  };
}
