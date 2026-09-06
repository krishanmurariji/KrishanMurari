export default function Footer({ isLight }: { isLight?: boolean }) {
  return (
    <footer className={`w-full h-20 px-8 md:px-12 flex justify-between items-center border-t backdrop-blur-2xl z-40 pointer-events-auto transition-colors duration-700 ${isLight ? 'bg-white/40 border-black/10' : 'bg-white/5 border-white/10'}`}>
      <div className="hidden md:flex items-center gap-6">
        <span className={`text-[10px] font-mono tracking-tight transition-colors ${isLight ? 'text-black/40' : 'text-white/30'}`}>01 / HERO_STAGE_V4</span>
        <div className={`h-4 w-[1px] transition-colors ${isLight ? 'bg-black/10' : 'bg-white/10'}`}></div>
        <span className={`text-[10px] font-mono tracking-tight transition-colors ${isLight ? 'text-black/40' : 'text-white/30'}`}>SCENE_LIT_DYNAMIC</span>
      </div>

      <div className="flex gap-4 items-center w-full justify-center md:justify-end md:w-auto">
        <div className={`px-4 py-2 text-[9px] uppercase tracking-widest font-mono rounded-full border border-dashed transition-colors ${isLight ? 'border-black/20 text-black/40' : 'border-white/20 text-white/40'}`}>
          Alt + T : Theme
        </div>
        
        <a 
          href="mailto:mrkrishanmurariji@gmail.com"
          className={`px-6 py-2 text-[11px] font-bold uppercase tracking-widest rounded-full cursor-pointer transition-colors ${isLight ? 'bg-black text-white hover:bg-zinc-800 shadow-[0_4px_12px_rgba(0,0,0,0.1)]' : 'bg-white text-black hover:bg-zinc-200'}`}
        >
          Hire Me
        </a>
      </div>
    </footer>
  );
}
