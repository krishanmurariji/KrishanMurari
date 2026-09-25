// Content for the dock's "Certifications" window (see APP_BODIES in
// AppWindow.tsx) — every certificate image in public/certificates/ (added
// directly to the repo, not fetched from anywhere) scrolling through
// CircularGallery, the WebGL component from reactbits.dev
// (src/components/CircularGallery.tsx, ported as-is — see that file's own
// header). Drag/scroll/arrow-keys to spin it, matching the gallery's own
// built-in controls.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CircularGallery from '../CircularGallery';
import Ferrofluid from '../Ferrofluid';
import { usePrefersReducedMotion } from '../../lib/useReducedMotion';

// One entry per file actually sitting in public/certificates/ — public/
// assets aren't reachable through Vite's import.meta.glob (that only sees
// src/), so unlike most image lists in this app, this one has to be a plain
// hand-kept array rather than derived from the filesystem at build time.
const CERTIFICATE_FILES = [
  'Coursera-aiml.jpeg',
  'Coursera-canva.jpeg',
  'Coursera-java.jpg',
  'Coursera-python.jpeg',
  'Coursera-react.jpeg',
  'linkdin-bi.png',
  'linkdin-ehc.png',
  'linkdin-excel.png',
  'linkdin-html.jpeg',
  'linkdin-java.png',
  'linkdin-photoshop.png',
  'linkdin-web.png',
];

const ACRONYMS: Record<string, string> = {
  ai: 'AI',
  aiml: 'AI & ML',
  bi: 'BI',
  html: 'HTML',
  ehc: 'EHC',
};

// Turns a filename into a readable label without inventing a course title
// that isn't actually verifiable from the file itself — "Coursera-aiml.jpeg"
// becomes "Coursera — AI & ML", "linkdin-excel.png" becomes "LinkedIn
// Learning — Excel". Rename a file (or extend ACRONYMS above) to fix any
// label that reads oddly.
function labelFor(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  const isCoursera = /^coursera-/i.test(base);
  const isLinkedIn = /^linkdin-/i.test(base);
  const slug = base.replace(/^(coursera|linkdin)-/i, '');
  const topic = slug
    .split(/[-_]/)
    .map((w) => ACRONYMS[w.toLowerCase()] ?? w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  const source = isCoursera ? 'Coursera' : isLinkedIn ? 'LinkedIn Learning' : '';
  return source ? `${source} — ${topic}` : topic;
}

const items = CERTIFICATE_FILES.map((file) => ({
  image: `/certificates/${file}`,
  text: labelFor(file),
}));

export default function CertificationsApp({ interactive }: { interactive?: boolean }) {
  // The gallery bends and rotates every plane for the 3D effect, which is
  // great for browsing but makes the image itself hard to actually read —
  // clicking whichever certificate is currently front-and-center opens it
  // here, flat and full-size, instead.
  const [preview, setPreview] = useState<{ image: string; text: string } | null>(null);
  // Same staged reveal BentoProfile.tsx uses (its Ripple background runs
  // continuously while an intro overlay fades out, then the real grid fades
  // in over it) — the background effect here runs from the very first
  // frame, and only the gallery itself waits, then cross-fades in on top of
  // it, rather than gating everything behind a loading state. Mounting the
  // gallery's WebGL canvas immediately, right as the window's own genie-open
  // animation is still resizing it, is what caused the flash-hide-reappear
  // glitch this delay avoids — its first frame landed mid-transition, then
  // the container settled into its real final size a moment later.
  const [showGallery, setShowGallery] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setShowGallery(true), 1000);
    return () => window.clearTimeout(id);
  }, []);
  const reducedMotion = usePrefersReducedMotion();

  // AppWindow renders every app body once, hidden, purely to snapshot it for
  // the dock's genie zoom (see useSharedSnapshots in AppWindow.tsx) — that
  // hidden render is what `interactive` being unset/false identifies. Left
  // to run normally, that hidden copy would start playing Ferrofluid too,
  // and THAT snapshot (captured once, up front) is what the genie actually
  // warps on every future open — which is why the background effect was
  // visibly appearing already during the zoom-in, before the window had
  // really opened. Rendering nothing but the plain backdrop for that hidden
  // copy keeps the genie a neutral zoom, with the real reveal (background,
  // then gallery) only ever happening in the real, interactive window.
  if (!interactive) {
    return <div className="h-full w-full" style={{ background: '#0c0c10' }} />;
  }

  return (
    <div className="relative h-full w-full" style={{ background: '#0c0c10' }}>
      <div className="absolute inset-0 z-0">
        <Ferrofluid
          paused={reducedMotion}
          colors={['#ffffff', '#ffffff', '#ffffff']}
          speed={0.5}
          scale={1.6}
          turbulence={1}
          fluidity={0.1}
          rimWidth={0.2}
          sharpness={2.5}
          shimmer={1.5}
          glow={2}
          flowDirection="down"
          opacity={1}
          mouseInteraction
          mouseStrength={1}
          mouseRadius={0.35}
        />
      </div>

      <AnimatePresence>
        {showGallery && (
          <motion.div
            key="gallery"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 z-10"
          >
            <CircularGallery
              bend={1}
              textColor="#ffffff"
              borderRadius={0.05}
              scrollEase={0.05}
              scrollSpeed={2}
              items={items}
              onItemClick={setPreview}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {preview && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6"
          style={{ background: 'rgba(6,6,8,0.94)' }}
          onClick={() => setPreview(null)}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setPreview(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-xl text-white/80 transition hover:bg-white/10 hover:text-white"
          >
            &times;
          </button>
          <img
            src={preview.image}
            alt={preview.text}
            className="max-h-[80%] max-w-[92%] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="text-sm text-white/70">{preview.text}</div>
        </div>
      )}
    </div>
  );
}
