// A single macOS-style notification banner — slides in from the top-right,
// same glass treatment as the rest of the chrome (MenuBar/MacDock), auto-
// dismisses after a few seconds. Deliberately just one banner, not a whole
// toast-stack system: the only thing that fires one today is a successful
// LinkedIn sign-in, so a queue/stack would be speculative infrastructure
// for a need that doesn't exist yet.
import { motion, AnimatePresence } from 'framer-motion';

export interface NotificationData {
  title: string;
  message: string;
  photoUrl?: string;
}

export default function NotificationBanner({ data, onDismiss }: { data: NotificationData | null; onDismiss: () => void }) {
  return (
    <div className="fixed top-12 right-4 z-[100002] pointer-events-none">
      <AnimatePresence>
        {data && (
          <motion.div
            key={data.title + data.message}
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.97, transition: { duration: 0.25 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="pointer-events-auto flex w-80 items-center gap-3 rounded-2xl p-3 shadow-2xl ring-1 ring-black/10"
            style={{
              background: 'linear-gradient(180deg, rgba(250,250,252,0.9), rgba(240,240,244,0.9))',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            }}
            onClick={onDismiss}
          >
            {data.photoUrl ? (
              <img src={data.photoUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover shadow ring-1 ring-black/10" />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/10 text-sm font-semibold text-black/50">
                {data.title.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-[#1c1c1e]">{data.title}</div>
              <div className="truncate text-[12px] text-black/60">{data.message}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
