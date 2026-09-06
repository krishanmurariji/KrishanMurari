// Content for the dock's "Experience" window (see APP_BODIES in
// AppWindow.tsx).
import ExperienceTimeline from './experience/ExperienceTimeline';

export default function ExperienceApp({
  interactive,
}: {
  interactive?: boolean;
  sceneCanvasRef?: React.RefObject<HTMLCanvasElement | null>;
}) {
  return <ExperienceTimeline interactive={interactive} />;
}
