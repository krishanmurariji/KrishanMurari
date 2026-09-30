// Tiny synthesized sound effects for the chat assistant's expressions —
// generated on the fly with the Web Audio API rather than shipped as hosted
// audio files, the same "build it ourselves" approach already used for the
// 3D bot mascot itself (RobotAvatar3D.tsx): no external asset, no licensing
// question, zero extra bundle weight. Each call is fire-and-forget; the
// nodes it creates stop and get garbage-collected on their own.
let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedContext) sharedContext = new AudioCtx();
  // Browsers start an AudioContext suspended until a user gesture — every
  // call site here (typing, sending, a reply landing) only ever fires after
  // the visitor has already interacted with the page, so resuming is safe.
  if (sharedContext.state === 'suspended') sharedContext.resume().catch(() => {});
  return sharedContext;
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, type: OscillatorType, peakGain: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peakGain, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

// A short, low, buzzy double-beep — reads as a scold/error rather than a
// generic notification, for validation failures and blocked messages.
export function playAngrySound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 220, now, 0.14, 'sawtooth', 0.08);
  tone(ctx, 140, now + 0.1, 0.18, 'sawtooth', 0.08);
}

// A soft two-note rising blip that plays once when the bot starts "thinking" —
// deliberately not looped, so it never becomes background noise on a slow
// reply.
export function playThinkingSound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 480, now, 0.08, 'sine', 0.045);
  tone(ctx, 600, now + 0.08, 0.1, 'sine', 0.045);
}

// A brighter rising chime for a reply successfully landing.
export function playReplySound(): void {
  const ctx = getContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  tone(ctx, 720, now, 0.09, 'sine', 0.055);
  tone(ctx, 960, now + 0.08, 0.14, 'sine', 0.055);
}
