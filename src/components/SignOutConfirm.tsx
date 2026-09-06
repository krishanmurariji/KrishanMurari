// A macOS-style confirm alert for the terminal's `signout` command — unlike
// NotificationBanner (an auto-dismissing, no-action toast), this blocks on an
// explicit OK/Cancel since signing out is destructive (wipes the saved
// sign-in identity from this browser, whichever OAuth provider it came from)
// and needs real confirmation, not a glance-and-forget notice.
import { motion, AnimatePresence } from 'framer-motion';

export default function SignOutConfirm({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="signout-confirm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100003] flex items-center justify-center"
        >
          <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="relative w-[22rem] max-w-[90vw] rounded-2xl border border-white/10 p-5 shadow-2xl"
            style={{
              background: 'linear-gradient(180deg, rgba(46,46,49,0.92), rgba(28,28,30,0.92))',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            }}
          >
            <div className="text-[15px] font-semibold text-white">Sign out?</div>
            <div className="mt-1.5 text-[13px] leading-snug text-white/60">
              We&rsquo;ll remove your details from our side, and you&rsquo;ll be signed out.
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="cursor-pointer rounded-full px-4 py-1.5 text-[13px] font-medium text-white/80 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="cursor-pointer rounded-full bg-[#ff5f57] px-4 py-1.5 text-[13px] font-semibold text-white transition hover:brightness-110"
              >
                OK
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
