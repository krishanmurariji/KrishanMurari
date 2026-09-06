// Content for the dock's "Profile" window (see APP_BODIES in
// AppWindow.tsx). Currently: a Ripple intro (see profile/BentoProfile.tsx)
// followed by a 2x2 bento grid — replaced the earlier forged-metal flip
// card entirely per a full redesign request, not layered alongside it.
import BentoProfile from './profile/BentoProfile';

export default function ProfileApp() {
  return <BentoProfile />;
}
