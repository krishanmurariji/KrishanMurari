// Client-side first line of defense against a message that's actually a
// script/markup injection attempt rather than a real question — lets the
// UI reject it immediately (and show the bot's angry face) without a round trip.
// This is a UX nicety only: the server independently re-runs the same check
// in api/chat.ts / api/_lib/chat.ts, since a client-only check protects
// nothing against a request sent straight to the endpoint (same reasoning
// already applied to the contact form's validation).
const SUSPICIOUS_PATTERNS = [
  /<\s*script[\s>]/i,
  /<\s*\/\s*script\s*>/i,
  /<\s*iframe[\s>]/i,
  /<\s*img[^>]*\bon\w+\s*=/i,
  /javascript\s*:/i,
  /on(?:error|load|click|mouseover|focus|blur|input|change|submit)\s*=/i,
  /document\s*\.\s*(cookie|write|location)/i,
  /window\s*\.\s*location/i,
  /eval\s*\(/i,
];

export function containsUnsafeContent(text: string): boolean {
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(text));
}
