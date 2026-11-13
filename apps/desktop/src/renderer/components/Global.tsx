// App-wide layers: toasts, the command palette (Ctrl+K) and keyboard help (?).
import { effectiveKeys, keyLabel } from '../../shared/keymap.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Page, Snapshot } from '../../shared/api.ts';
import { air } from '../bridge.ts';
import type { Run } from '../App.tsx';
import { PAGE_NAME, PAGE_ORDER } from './Chrome.tsx';
import { Cap } from './ui.tsx';

// ── toasts ──

export interface Toast { id: number; kind: 'error' | 'ok' | 'info'; title?: string; text: string }

export function Toasts({ list, dismiss }: { list: Toast[]; dismiss: (id: number) => void }) {
  // Confirmations leave after a few seconds; errors stay long enough to read, or until dismissed.
  useEffect(() => {
    const timers = list.map((t) => setTimeout(() => dismiss(t.id), t.kind === 'error' ? 12_000 : 4500));
    return () => timers.forEach(clearTimeout);
  }, [list, dismiss]);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
          <span className="bar" aria-hidden="true" />
          <span>{t.title && <b>{t.title}</b>}{t.text}</span>
          <button className="btn quiet small" onClick={() => dismiss(t.id)} aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}

// ── keyboard help ──


export function ShortcutsDialog({ s, close, manual }: { s: Snapshot; close: () => void; manual: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === '?') && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);
  const keys = effectiveKeys(s.keymap);
  const row = (a: { id: string; label: string; key: string }) => <div key={a.id}><span>{a.label}</span><span className="kbd">{keyLabel(a.key)}</span></div>;
  return (
    <div className="scrim center" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog" style={{ maxWidth: 760 }} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div className="row between"><div><Cap>Keyboard</Cap><h2 className="title-md" style={{ marginTop: 6 }}>Shortcuts</h2></div><button className="btn quiet small" onClick={close}>Esc · Close</button></div>
        <div className="shortcuts">
          {row({ id: 'search', label: 'Search and go to anything', key: 'Ctrl+K' })}
          {row({ id: 'help', label: 'This list', key: '?' })}
          {keys.filter((a) => a.group !== 'layer').map(row)}
        </div>
        <div>
          <Cap>Graphic layers on Live</Cap>
          <div className="shortcuts" style={{ marginTop: 6 }}>{keys.filter((a) => a.group === 'layer').map(row)}</div>
        </div>
        <p className="faint t-xs">Change any key in Settings › Keyboard. Keys work while Air is focused and you are not typing in a field. <button className="btn quiet small" onClick={manual}>Open the manual</button></p>
      </div>
    </div>
  );
}

// ── command palette ──

interface Command { id: string; group: string; label: string; hint?: string; keywords?: string; run: () => void }

export interface PaletteActions {
  go: (page: Page) => void;
  command: (name: 'new-match' | 'rehearse' | 'autopilot' | 'teams' | 'talent' | 'myshow') => void;
  askCapture: () => void;
  openFix: () => void;
  openCasters: () => void;
  openSignIn: () => void;
  help: () => void;
}

function commands(s: Snapshot, run: Run, a: PaletteActions): Command[] {
  const list: Command[] = PAGE_ORDER.map((p) => ({ id: `go-${p}`, group: 'Go to', label: PAGE_NAME[p], run: () => a.go(p) }));
  list.push(
    { id: 'new-match', group: 'Match', label: 'New match', keywords: 'create wizard', run: () => a.command('new-match') },
    { id: 'rehearse', group: 'Match', label: 'Rehearse this match', keywords: 'preview sample practice', run: () => a.command('rehearse') },
    { id: 'autopilot-rules', group: 'Match', label: 'Autopilot steps and presets', keywords: 'rules rundown', run: () => a.command('autopilot') },
    { id: 'teams', group: 'Match', label: 'Teams and players', keywords: 'lineup roster riot photo', run: () => a.command('teams') },
    { id: 'my-show', group: 'Match', label: 'Rundown: the screens of this match', keywords: 'graphics screens library my show autopilot', run: () => a.command('myshow') },
    { id: 'casters', group: 'Match', label: 'People on air', keywords: 'talent casters lower third', run: () => a.command('talent') },
  );
  for (const m of s.matches.filter((m) => m.id !== s.match?.id).slice(0, 8)) {
    list.push({ id: `match-${m.id}`, group: 'Switch match', label: m.title, hint: s.events.find((e) => e.id === m.eventId)?.name || undefined, run: () => void run(() => air.selectMatch(m.id)) });
  }
  list.push(
    s.autopilot.enabled
      ? { id: 'ap-stop', group: 'Show', label: 'Run manually (autopilot off)', run: () => void run(() => air.autopilotStop()) }
      : { id: 'ap-start', group: 'Show', label: 'Start autopilot', run: () => void run(() => air.autopilotStart()) },
    s.feed.state === 'off' ? { id: 'capture-start', group: 'Show', label: 'Start game capture', run: a.askCapture } : { id: 'capture-stop', group: 'Show', label: 'Stop game capture', run: () => void run(() => air.stopCapture()) },
    { id: 'fix', group: 'Show', label: 'Fix data', hint: 'Ctrl D', keywords: 'correct score name', run: a.openFix },
    { id: 'obs', group: 'Setup', label: s.obs.state === 'connected' ? 'OBS connection' : 'Connect OBS', keywords: 'websocket', run: () => a.go('settings') },
    { id: 'install', group: 'Setup', label: s.obs.installed ? 'Rebuild Esportra scenes in OBS' : 'Add Esportra scenes to OBS', run: () => void run(() => air.installGraphics()) },
    { id: 'art', group: 'Setup', label: 'Download agent and map art', keywords: 'pictures offline', run: () => void run(() => air.artDownload()) },
    { id: 'sign-in', group: 'Setup', label: s.esportra.state === 'signed-out' ? 'Sign in to Esportra' : 'Esportra account', run: s.esportra.state === 'signed-out' ? a.openSignIn : () => a.go('settings') },
    { id: 'help', group: 'Help', label: 'Keyboard shortcuts', hint: '?', run: a.help },
  );
  return list;
}

export function CommandPalette({ s, run, actions, close }: { s: Snapshot; run: Run; actions: PaletteActions; close: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => commands(s, run, actions), [s, run, actions]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = all.filter((c) => words.every((w) => `${c.group} ${c.label} ${c.keywords ?? ''} ${c.hint ?? ''}`.toLowerCase().includes(w)));
  useEffect(() => input.current?.focus(), []);
  useEffect(() => setIndex(0), [query]);
  const pick = (c: Command | undefined) => {
    if (!c) return;
    close();
    c.run();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[index]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  let group = '';
  return (
    <div className="scrim top" style={{ zIndex: 'var(--z-palette)' as never }} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search and go to">
        <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Search pages, matches and actions…" aria-label="Search" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={shown[index] ? `cmd-${shown[index]!.id}` : undefined} />
        <ul id="palette-list" role="listbox">
          {shown.length === 0 && <li className="group faint t-sm">Nothing matches “{query}”.</li>}
          {shown.map((c, i) => {
            const head = c.group !== group ? (group = c.group) : null;
            return (
              <li key={c.id} role="presentation">
                {head && <div className="cap" style={{ padding: '10px 12px 4px' }}>{head}</div>}
                <button id={`cmd-${c.id}`} role="option" aria-selected={i === index} onMouseEnter={() => setIndex(i)} onClick={() => pick(c)}>
                  <span>{c.label}</span>{c.hint && <span className="faint">{c.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="foot"><span><span className="kbd">↑ ↓</span> move</span><span><span className="kbd">Enter</span> open</span><span><span className="kbd">Esc</span> close</span></div>
      </div>
    </div>
  );
}
