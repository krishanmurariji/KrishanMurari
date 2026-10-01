import { Component, type ReactNode } from 'react';

// Nothing outside the 3D layer actually depends on it — the dock, menu bar,
// desktop widgets and every app window all treat `sceneCanvasRef` as
// optional and degrade gracefully without it (see GlassBackdrop's own
// `if (!src) return`). Without this boundary, though, any uncaught error
// thrown inside <Scene> (an r3f render-loop exception, a texture/loader
// rejection re-thrown by suspend-react, …) has nothing to stop it — React
// unmounts the *entire* tree up to the nearest boundary, which with none
// present meant the whole app (not just the background) going blank a few
// minutes in. Catching it here means a 3D-layer failure just drops the
// background and fog, rather than taking everything else down with it.
export default class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('3D scene crashed — hiding it and continuing without it.', error);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}
