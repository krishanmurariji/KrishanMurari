'use client';

import { useState, useRef, useEffect } from 'react';

type Phase = 'incoming-hidden' | 'incoming' | 'unfolding' | 'idle' | 'folding' | 'flying-out';

// ─── ContactSection ───────────────────────────────────────────────────────────
export default function ContactSection({ isLight }: { isLight?: boolean }) {
  const [phase, setPhase] = useState<Phase>('incoming-hidden');
  const isSubmittingRef = useRef(false);
  const sectionRef = useRef<HTMLElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [isSent, setIsSent] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (isSubmittingRef.current) return;

        if (timeoutRef.current) clearTimeout(timeoutRef.current);

        if (entry.isIntersecting) {
          setPhase('incoming');
          timeoutRef.current = setTimeout(() => setPhase('unfolding'), 600);
          timeoutRef.current = setTimeout(() => setPhase('idle'), 1400);
        } else {
          // Fold and fly out when scrolling up/out of view
          setPhase('folding');
          timeoutRef.current = setTimeout(() => setPhase('flying-out'), 600);
          timeoutRef.current = setTimeout(() => setPhase('incoming-hidden'), 1200);
        }
      },
      { threshold: 0.3 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => {
      observer.disconnect();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const validate = () => {
    const e: Partial<typeof form> = {};
    if (!form.name.trim())    e.name    = 'Name is required';
    if (!form.email.trim())   e.email   = 'Email is required';
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email';
    if (!form.message.trim()) e.message = 'Message is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setIsSent(true);
    isSubmittingRef.current = true;

    setTimeout(() => setPhase('folding'), 1500);
    setTimeout(() => setPhase('flying-out'), 2300);
    setTimeout(() => setPhase('incoming-hidden'), 2900);
    setTimeout(() => setPhase('incoming'), 2950);
    setTimeout(() => {
      setIsSent(false);
      setForm({ name: '', email: '', phone: '', subject: '', message: '' });
      setErrors({});
      setPhase('unfolding');
    }, 3750);
    setTimeout(() => {
      setPhase('idle');
      isSubmittingRef.current = false;
    }, 4550);
  };

  let contentOpacityClassName = "transition-opacity duration-300 ";
  let clipPathStyle = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
  let transformStyle = "translate3d(0, 0, 0) scale(1) rotate(0deg)";
  let transitionStyle = "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)";
  let planeOutlineOpacity = 0;

  switch (phase) {
      case 'folding':
          contentOpacityClassName += "opacity-0";
          clipPathStyle = "polygon(0% 25%, 100% 50%, 0% 75%, 25% 50%)";
          transformStyle = "translate3d(0, 0, 0) scale(0.35) rotate(20deg)";
          planeOutlineOpacity = 1;
          break;
      case 'flying-out':
          contentOpacityClassName += "opacity-0";
          clipPathStyle = "polygon(0% 25%, 100% 50%, 0% 75%, 25% 50%)";
          transformStyle = "translate3d(0, 0, 0) scale(0) rotate(180deg)";
          transitionStyle = "all 0.6s cubic-bezier(0.4, 0, 1, 1)";
          planeOutlineOpacity = 1;
          break;
      case 'incoming-hidden':
          contentOpacityClassName += "opacity-0";
          clipPathStyle = "polygon(0% 25%, 100% 50%, 0% 75%, 25% 50%)";
          transformStyle = "translate3d(0, 0, 0) scale(0) rotate(-180deg)";
          transitionStyle = "none";
          planeOutlineOpacity = 1;
          break;
      case 'incoming':
          contentOpacityClassName += "opacity-0";
          clipPathStyle = "polygon(0% 25%, 100% 50%, 0% 75%, 25% 50%)";
          transformStyle = "translate3d(0, 0, 0) scale(0.35) rotate(20deg)";
          transitionStyle = "all 0.8s cubic-bezier(0, 0, 0.2, 1)";
          planeOutlineOpacity = 1;
          break;
      case 'unfolding':
          contentOpacityClassName += "opacity-100 delay-300";
          clipPathStyle = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
          transformStyle = "translate3d(0, 0, 0) scale(1) rotate(0deg)";
          transitionStyle = "all 0.8s cubic-bezier(0.4, 0, 0.2, 1)";
          planeOutlineOpacity = 0;
          break;
      case 'idle':
          contentOpacityClassName += "opacity-100 delay-300";
          break;
  }

  // ── Input field style (metallic theme) ───────────────────────────────────
  const fieldBase = `w-full bg-transparent border-b outline-none text-sm font-light tracking-wide py-2 transition-colors duration-300 placeholder-current focus:border-opacity-100 ${
    isLight
      ? 'border-gray-400 text-gray-800 placeholder-gray-500 focus:border-gray-800'
      : 'border-gray-500 text-gray-100 placeholder-gray-400 focus:border-gray-200'
  }`;

  const labelBase = `block text-[10px] uppercase tracking-[0.18em] font-mono mb-1 ${
    isLight ? 'text-gray-600' : 'text-gray-400'
  }`;

  const errorBase = `text-[10px] mt-1 font-mono ${isLight ? 'text-red-600' : 'text-red-400'}`;

  // ── Metallic panel styles ────────────────────────────────────────────────
  const metallicPlateStyle = isLight
    ? 'bg-transparent border border-gray-300/40 shadow-none'
    : 'bg-transparent border border-gray-600/40 shadow-none';

  const sheenStyle = isLight
    ? 'from-transparent via-white/50 to-transparent'
    : 'from-transparent via-gray-400/10 to-transparent';

  return (
    <section
      ref={sectionRef}
      className="relative w-full flex flex-col"
      style={{ minHeight: '100svh' }}
    >
      {/* ── Top part : contact form ─────────────────────────────────────────── */}
      <div className="relative flex-1 flex items-center justify-center px-4 py-24 overflow-hidden">
        
        {/* Subtle grid to enhance the metallic tech feel */}
        <div className={`absolute inset-0 opacity-20 pointer-events-none custom-grid ${isLight ? 'bg-black/5' : 'bg-white/5'}`}
             style={{ maskImage: 'radial-gradient(circle at center, black, transparent 80%)' }} />

        {/* ── Shiny Metallic Contact Form ──────────────────────────────────────────── */}
        <div
          className={`relative w-full max-w-xl rounded-xl p-8 md:p-12 ${metallicPlateStyle} overflow-hidden backdrop-blur-3xl`}
          style={{
            clipPath: clipPathStyle,
            transform: transformStyle,
            transition: transitionStyle
          }}
        >
          {/* Inner plane folds (only visible when folded) */}
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-300 ease-in-out"
            style={{ opacity: planeOutlineOpacity, zIndex: 10 }}
            viewBox="0 0 100 100" 
            preserveAspectRatio="none"
          >
            {/* Back to Nose crease */}
            <line x1="25" y1="50" x2="100" y2="50" stroke={isLight ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)'} strokeWidth="0.8" />
            {/* Top wing fold */}
            <line x1="100" y1="50" x2="20" y2="35" stroke={isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)'} strokeWidth="0.5" strokeDasharray="3 3" />
            {/* Bottom wing fold */}
            <line x1="100" y1="50" x2="20" y2="65" stroke={isLight ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.3)'} strokeWidth="0.5" strokeDasharray="3 3" />
          </svg>

          {/* Screw heads - top left, top right, bottom left, bottom right */}
          <div className={`absolute top-4 left-4 w-2 h-2 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)] ${isLight ? 'bg-gray-300' : 'bg-gray-600'} ${contentOpacityClassName}`} />
          <div className={`absolute top-4 right-4 w-2 h-2 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)] ${isLight ? 'bg-gray-300' : 'bg-gray-600'} ${contentOpacityClassName}`} />
          <div className={`absolute bottom-4 left-4 w-2 h-2 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)] ${isLight ? 'bg-gray-300' : 'bg-gray-600'} ${contentOpacityClassName}`} />
          <div className={`absolute bottom-4 right-4 w-2 h-2 rounded-full shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)] ${isLight ? 'bg-gray-300' : 'bg-gray-600'} ${contentOpacityClassName}`} />

          <div className={`relative z-10 transition-all duration-500 ${contentOpacityClassName} ${isSent ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100'}`}>
            {/* Header */}
            <div className="mb-8 text-center pb-6 border-b border-gray-500/20">
              <p className={`text-[11px] uppercase tracking-[0.3em] font-mono mb-3 ${labelBase}`}>
                Transmission Link
              </p>
              <h2 className={`text-3xl md:text-4xl font-semibold tracking-tight uppercase ${isLight ? 'text-gray-800' : 'text-gray-100'} drop-shadow-sm`}>
                Let's Connect
              </h2>
            </div>

            {/* Form fields */}
            <div className="space-y-6">
              {/* Row: Name + Phone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={labelBase}>Name</label>
                  <input
                    className={fieldBase}
                    placeholder="Krishan"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    disabled={isSent}
                  />
                  {errors.name && <p className={errorBase}>{errors.name}</p>}
                </div>
                <div>
                  <label className={labelBase}>Phone</label>
                  <input
                    className={fieldBase}
                    placeholder="+91 00000 00000"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    disabled={isSent}
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className={labelBase}>Email</label>
                <input
                  type="email"
                  className={fieldBase}
                  placeholder="hello@example.com"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  disabled={isSent}
                />
                {errors.email && <p className={errorBase}>{errors.email}</p>}
              </div>

              {/* Subject */}
              <div>
                <label className={labelBase}>Subject</label>
                <input
                  className={fieldBase}
                  placeholder="Project inquiry, collaboration…"
                  value={form.subject}
                  onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  disabled={isSent}
                />
              </div>

              {/* Message */}
              <div>
                <label className={labelBase}>Message</label>
                <textarea
                  className={`${fieldBase} resize-none h-24 md:h-32`}
                  placeholder="Tell me what you're building…"
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  disabled={isSent}
                />
                {errors.message && <p className={errorBase}>{errors.message}</p>}
              </div>

              {/* Send button */}
              <button
                onClick={handleSubmit}
                disabled={isSent}
                className={`group relative w-full py-4 text-[12px] uppercase tracking-[0.25em] font-mono transition-all duration-300 overflow-hidden rounded-md shadow-lg
                  ${isLight
                    ? 'bg-gray-800 text-white hover:bg-black shadow-gray-400/50 hover:shadow-gray-400'
                    : 'bg-gray-100 text-gray-900 hover:bg-white shadow-black/50 hover:shadow-black'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95`}
              >
                <span className="relative z-10 flex items-center justify-center gap-3 font-semibold">
                  {isSent ? 'Message Sent' : 'Initiate Sequence'}
                  {!isSent && (
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-2" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8h12M9 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            </div>
          </div>
          
          {/* Sent overlay */}
          {isSent && (
            <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center bg-transparent backdrop-blur-sm ${contentOpacityClassName}`}>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 transform scale-0 animate-pop-in [animation-delay:150ms] ${isLight ? 'bg-black text-white' : 'bg-white text-black'}`}>
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <p className={`text-lg font-mono uppercase tracking-widest font-semibold opacity-0 animate-fade-in [animation-delay:300ms] ${isLight ? 'text-gray-800' : 'text-gray-100'}`}>Message Transmitted</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom : footer bar ────────────────────────────────────────── */}
      <div className={`shrink-0 flex flex-col justify-end border-t transition-colors duration-700 ${
        isLight ? 'border-black/8' : 'border-white/6'
      }`}>
        <FooterBar isLight={isLight} />
      </div>

    </section>
  );
}

// ─── Footer bar ──────────────────────────────────────────────────
function FooterBar({ isLight }: { isLight?: boolean }) {
  const currentYear = new Date().getFullYear();

  const socials = [
    { label: 'GH',  href: 'https://github.com/mrkrishanmurariji' },
    { label: 'LI',  href: 'https://www.linkedin.com/in/krishansinghmurari/' },
    { label: 'IG',  href: 'https://instagram.com' },
    { label: 'X',   href: 'https://twitter.com' },
  ];

  return (
    <div className="w-full px-6 md:px-12 pb-6 pt-4 flex flex-col gap-4">
      {/* Social links */}
      <div className="flex gap-4 items-center">
        {socials.map(s => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-[10px] font-mono tracking-widest transition-opacity hover:opacity-100 ${
              isLight ? 'text-black/50 hover:text-black/90' : 'text-white/40 hover:text-white/90'
            }`}
          >
             {s.label}
          </a>
        ))}
        <div className={`flex-1 h-px ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
        <a
          href="mailto:murari@krishan.is-a.dev"
          className={`text-[10px] font-mono tracking-widest transition-opacity hover:opacity-100 ${
            isLight ? 'text-black/50 hover:text-black/90' : 'text-white/40 hover:text-white/90'
          }`}
        >
          murari@krishan.is-a.dev
        </a>
      </div>

      {/* Bottom row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className={`text-[10px] font-mono tracking-tight ${isLight ? 'text-black/40' : 'text-white/35'}`}>
            krishan.is-a.dev
          </span>
          <span className={`w-1 h-1 rounded-full ${isLight ? 'bg-black/20' : 'bg-white/20'}`} />
          <span className={`text-[10px] font-mono tracking-tight ${isLight ? 'text-black/40' : 'text-white/35'}`}>
            Full Stack Developer
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className={`text-[9px] font-mono tracking-[0.15em] italic ${isLight ? 'text-black/30' : 'text-white/25'}`}>
            अहिंसा परमो धर्मः
          </span>
          <span className={`text-[10px] font-mono ${isLight ? 'text-black/30' : 'text-white/25'}`}>
            © {currentYear}
          </span>
        </div>
      </div>
    </div>
  );
}
