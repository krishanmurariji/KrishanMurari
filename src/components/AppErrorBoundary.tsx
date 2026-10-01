import { Component, type ReactNode } from 'react';

// The outer backstop — SceneErrorBoundary already catches a crash in just
// the 3D layer and keeps the rest of the desktop running without it, but
// nothing protected everything else (MenuBar, MacDock, DesktopWidgets, an
// AppWindow body, ChatAssistant's own robot canvas): an uncaught error
// anywhere in there still had nothing above it to stop React from
// unmounting the whole tree, the same "blank page a few minutes in" failure
// mode the HDR-fetch bug produced before SceneErrorBoundary existed. This
// wraps the rest of the desktop (not the loader/lock screen — a crash deep
// in the desktop shouldn't also take out the lock screen's own ability to
// show *its* error state) with a real, visible fallback rather than a
// silent `null`: losing the whole desktop silently would leave a visitor
// looking at a blank page with no explanation at all, unlike losing just a
// decorative 3D background.
//
// Plain inline styles, no Tailwind classes, no icons, no other component
// imports — this is what renders when something elsewhere has already gone
// wrong, so it can't itself depend on anything that might be the thing that
// broke.
export default class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('The desktop crashed:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          textAlign: 'center',
          background: '#000000',
          color: '#e0e0e0',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 600 }}>Something went wrong.</div>
        <div style={{ fontSize: 14, color: 'rgba(224,224,224,0.7)', maxWidth: 360 }}>
          Please try refreshing the page.
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8,
            padding: '8px 20px',
            borderRadius: 999,
            border: 'none',
            background: '#ffffff',
            color: '#000000',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>
    );
  }
}
