#!/usr/bin/env node
// Guards against the three hand-duplicated copies of SUSPICIOUS_PATTERNS
// (the script/markup-injection regex list used by the chat assistant's
// client-side check, the dev-server check, and the real server-side gate)
// silently drifting apart. They can't just import a shared module — Vercel's
// Node function builder doesn't trace relative imports for api/ routes at
// all (confirmed live; see api/chat.ts's own comment) — so api/chat.ts
// inlines its own copy rather than importing api/_lib/security.ts's. This
// script is the next best thing: not shared code, but a check that the
// copies actually agree, run as part of `npm run lint` so drift fails the
// same way a real lint error would rather than only surfacing as a security
// gap discovered the hard way.
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const SOURCES = ['api/chat.ts', 'api/_lib/security.ts', 'src/lib/scriptDetection.ts'];

// Pulls out just the array literal's body (the lines between `[` and the
// matching `];`) rather than comparing whole files — each copy's
// surrounding comments legitimately differ (they explain that *specific*
// file's role), only the actual pattern list needs to match.
function extractPatterns(relativePath) {
  const text = readFileSync(path.join(root, relativePath), 'utf8');
  const match = text.match(/const SUSPICIOUS_PATTERNS = \[([\s\S]*?)\n\];/);
  if (!match) {
    throw new Error(`${relativePath}: could not find a "const SUSPICIOUS_PATTERNS = [...]" block`);
  }
  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

const extracted = SOURCES.map((src) => ({ src, patterns: extractPatterns(src) }));
const [first, ...rest] = extracted;

for (const other of rest) {
  assert.equal(
    other.patterns,
    first.patterns,
    `SUSPICIOUS_PATTERNS has drifted between ${first.src} and ${other.src} — ` +
      `these three copies (${SOURCES.join(', ')}) must stay identical by hand ` +
      `whenever the pattern list changes.`,
  );
}

console.log(`SUSPICIOUS_PATTERNS in sync across all ${SOURCES.length} copies.`);
