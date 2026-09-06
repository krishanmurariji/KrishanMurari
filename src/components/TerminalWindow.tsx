// Opens from clicking "Terminal" in the menu bar — a genuinely interactive
// command line now (it used to just play a canned "$ whoami / Success"
// transcript), styled to match ui/terminal.tsx's look (same dark panel,
// traffic-light dots, monospace) without reusing that component itself —
// its AnimatedSpan/Terminal sequencing is built for a one-shot scripted
// intro, not a live REPL that appends lines as a real visitor types.
import { useEffect, useRef, useState } from 'react';
import type { DockApp } from './MacDock';
import { runThemeTransition } from '../lib/theme-transition';
import { loadAuthUser, PROVIDER_LABELS } from '../lib/storage';
import { NAME, ABOUT_ME, RESUME_URL, EMAIL, GITHUB_URL, LINKEDIN_URL } from './apps/profile/shared';
import { totalExperienceLabel } from './apps/experience/data';

interface Line {
  type: 'input' | 'output' | 'error';
  text: string;
}

interface TerminalWindowProps {
  isLight?: boolean;
  onSetLight: (isLight: boolean) => void;
  dockApps: DockApp[];
  onOpenApp: (id: string) => void;
  onLock: () => void;
  onClose: () => void;
  onRequestSignOut: () => void;
  isMaximized: boolean;
  onToggleMaximize: () => void;
}

const WELCOME: Line[] = [
  { type: 'output', text: `${NAME}'s portfolio — type 'help' to see what's available.` },
];

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export default function TerminalWindow({ isLight, onSetLight, dockApps, onOpenApp, onLock, onClose, onRequestSignOut, isMaximized, onToggleMaximize }: TerminalWindowProps) {
  const [lines, setLines] = useState<Line[]>(WELCOME);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  const print = (text: string, type: Line['type'] = 'output') => setLines((prev) => [...prev, { type, text }]);

  // Every entry gets a one-line summary shown by `help`, plus the handler
  // itself. Args are whatever followed the command name, lowercased.
  const COMMANDS: Record<string, { summary: string; run: (args: string[]) => void }> = {
    help: {
      summary: 'list every command',
      run: () => {
        print('Available commands:');
        for (const [name, { summary }] of Object.entries(COMMANDS)) {
          print(`  ${name.padEnd(10)} ${summary}`);
        }
      },
    },
    theme: {
      summary: "switch light/dark — 'theme', 'theme light', or 'theme dark'",
      run: (args) => {
        const target = args[0];
        const next = target === 'light' || target === 'dark' ? target === 'dark' : !isLight;
        const anchor = rootRef.current;
        if (anchor) runThemeTransition(anchor, 500, () => onSetLight(!next));
        else onSetLight(!next);
        print(`Switched to ${next ? 'dark' : 'light'} mode.`);
      },
    },
    open: {
      summary: 'open an app — e.g. "open profile", "open experience"',
      run: (args) => {
        const query = args.join(' ').toLowerCase();
        if (!query) {
          print('Usage: open <app> — try "open profile" or see "help"', 'error');
          return;
        }
        const app = dockApps.find((a) => a.id.toLowerCase() === query || a.label.toLowerCase() === query);
        if (!app) {
          print(`No app called "${query}". Try: ${dockApps.map((a) => a.id).join(', ')}`, 'error');
          return;
        }
        onOpenApp(app.id);
        print(`Opening ${app.label}…`);
        onClose();
      },
    },
    lock: {
      summary: 'lock the screen',
      run: () => {
        print('Locking…');
        onLock();
        onClose();
      },
    },
    whoami: {
      summary: 'who this browser is signed in as',
      run: () => {
        const user = loadAuthUser();
        print(user ? `${user.name} <${user.email}> via ${PROVIDER_LABELS[user.provider]}` : 'guest (not signed in — see the lock screen to sign in)');
      },
    },
    signout: {
      summary: loadAuthUser()
        ? 'sign out and remove this browser’s saved sign-in'
        : 'not signed in — see the lock screen to sign in',
      run: () => {
        if (!loadAuthUser()) {
          print('Not signed in — see the lock screen to sign in.', 'error');
          return;
        }
        onRequestSignOut();
        print('Confirm in the dialog to sign out and lock the screen.');
      },
    },
    about: {
      summary: `about ${NAME}`,
      run: () => print(ABOUT_ME),
    },
    experience: {
      summary: 'years of professional experience',
      run: () => print(`${totalExperienceLabel()} — see the Experience app for the full breakdown.`),
    },
    resume: {
      summary: 'open the résumé in a new tab',
      run: () => { openExternal(RESUME_URL); print('Opening résumé…'); },
    },
    github: {
      summary: 'open GitHub in a new tab',
      run: () => { openExternal(GITHUB_URL); print('Opening GitHub…'); },
    },
    linkedin: {
      summary: 'open LinkedIn in a new tab',
      run: () => { openExternal(LINKEDIN_URL); print('Opening LinkedIn…'); },
    },
    email: {
      summary: 'open a new email to Krishan',
      run: () => { window.location.href = `mailto:${EMAIL}`; print(`Opening a new email to ${EMAIL}…`); },
    },
    date: {
      summary: 'current date and time',
      run: () => print(new Date().toString()),
    },
    echo: {
      summary: 'print text back',
      run: (args) => print(args.join(' ')),
    },
    clear: {
      summary: 'clear the screen',
      run: () => setLines([]),
    },
    close: {
      summary: 'close the terminal',
      run: () => onClose(),
    },
    sudo: {
      summary: '...',
      run: () => print(`${loadAuthUser()?.name ?? 'guest'} is not in the sudoers file. This incident will be reported.`, 'error'),
    },
  };

  const runCommand = (raw: string) => {
    const trimmed = raw.trim();
    print(`$ ${trimmed}`, 'input');
    if (!trimmed) return;
    const [name, ...args] = trimmed.split(/\s+/);
    const command = COMMANDS[name.toLowerCase()];
    if (!command) {
      print(`Command not found: ${name} — type 'help' for a list of commands.`, 'error');
      return;
    }
    command.run(args);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (input.trim()) setHistory((prev) => [...prev, input]);
      setHistoryIndex(null);
      runCommand(input);
      setInput('');
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex]);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === null) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(null);
        setInput('');
      } else {
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex]);
      }
      return;
    }
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      ref={rootRef}
      onClick={() => inputRef.current?.focus()}
      className={`bg-[#161616] z-0 flex w-full flex-col overflow-hidden rounded-xl border border-white/10 shadow-2xl ${
        isMaximized ? 'h-full max-w-none' : isMinimized ? 'h-auto max-w-lg' : 'h-[24rem] max-w-lg'
      }`}
    >
      {/* Same glass title-bar recipe as WindowChrome (AppWindow.tsx) — same
          dot colors/sizes/aria-labels — so this reads as the same window
          chrome as Profile/Experience rather than a one-off look. */}
      <div
        className="relative flex shrink-0 items-center overflow-hidden px-4"
        style={{
          height: 42,
          background: 'linear-gradient(180deg, rgba(58,58,61,0.55), rgba(35,35,37,0.55))',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,.08)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.14), transparent 60%)', mixBlendMode: 'screen' }}
        />
        <div className="z-10 flex items-center gap-2">
          <button
            type="button"
            aria-label="Close"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="h-3.5 w-3.5 cursor-pointer rounded-full border-none transition hover:brightness-90"
            style={{ background: '#ff5f57' }}
          />
          <button
            type="button"
            aria-label={isMinimized ? 'Restore' : 'Minimize'}
            onClick={(e) => { e.stopPropagation(); setIsMinimized((m) => !m); }}
            className="h-3.5 w-3.5 cursor-pointer rounded-full border-none transition hover:brightness-90"
            style={{ background: '#febc2e' }}
          />
          <button
            type="button"
            aria-label={isMaximized ? 'Fill screen' : 'Windowed'}
            onClick={(e) => { e.stopPropagation(); onToggleMaximize(); }}
            className="h-3.5 w-3.5 cursor-pointer rounded-full border-none transition hover:brightness-90"
            style={{ background: '#28c840' }}
          />
        </div>
        <span
          className="pointer-events-none absolute inset-x-0 text-center text-xs font-medium"
          style={{ color: 'rgba(255,255,255,.55)' }}
        >
          Terminal
        </span>
      </div>
      {!isMinimized && (
        <>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4" data-lenis-prevent>
            <div className="grid gap-y-1 font-mono text-[13px]">
              {lines.map((line, i) => (
                <div
                  key={i}
                  className="whitespace-pre-wrap break-words"
                  style={{ color: line.type === 'error' ? '#f87171' : line.type === 'input' ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.9)' }}
                >
                  {line.text}
                </div>
              ))}
              <div ref={outputEndRef} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-white/10 px-4 py-2.5 font-mono text-[13px]">
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>$</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoComplete="off"
              className="flex-1 bg-transparent text-white/90 outline-none"
              placeholder="type a command, or 'help'"
            />
          </div>
        </>
      )}
    </div>
  );
}
