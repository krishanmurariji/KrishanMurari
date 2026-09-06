// A brief "envelope" loading animation played once before the Email
// window's form reveals itself — the same "intro plays, then content fades
// in" pattern used by the Experience window (see
// ../experience/EyeIntro.tsx's own comment) and the Profile window
// (BentoProfile.tsx's `INTRO_MS`). Adapted from a plain CSS
// (styled-components) snippet the user supplied — this project doesn't use
// styled-components, so it's ported to a scoped `<style>` block the same
// way EyeIntro.tsx was, with every class/keyframe name prefixed (`email*`)
// so it can't collide with anything else in the app's global stylesheet.
export default function EnvelopeLoader() {
  return (
    <div className="email-loader-root">
      <style>{ENVELOPE_LOADER_CSS}</style>
      <div className="email-loader" />
    </div>
  );
}

const ENVELOPE_LOADER_CSS = `
.email-loader-root {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #eef1f6;
}

.email-loader-root .email-loader {
  position: relative;
  border-style: solid;
  box-sizing: border-box;
  border-width: 40px 60px 30px 60px;
  border-color: #3760C9 #96DDFC #96DDFC #36BBF7;
  animation: emailEnvFloating 1s ease-in infinite alternate;
}

.email-loader-root .email-loader:after {
  content: "";
  position: absolute;
  right: 62px;
  top: -40px;
  height: 70px;
  width: 50px;
  background-image: linear-gradient(#1c1c1e 45px, transparent 0),
            linear-gradient(#1c1c1e 45px, transparent 0),
            linear-gradient(#1c1c1e 45px, transparent 0);
  background-repeat: no-repeat;
  background-size: 30px 4px;
  background-position: 0px 11px , 8px 35px, 0px 60px;
  animation: emailEnvDropping 0.75s linear infinite;
}

@keyframes emailEnvFloating {
  0% {
    transform: translate(-2px, -5px)
  }
  100% {
    transform: translate(0, 5px)
  }
}

@keyframes emailEnvDropping {
  0% {
    background-position: 100px 11px , 115px 35px, 105px 60px;
    opacity: 1;
  }
  50% {
    background-position: 0px 11px , 20px 35px, 5px 60px;
  }
  60% {
    background-position: -30px 11px , 0px 35px, -10px 60px;
  }
  75%, 100% {
    background-position: -30px 11px , -30px 35px, -30px 60px;
    opacity: 0;
  }
}
`;
