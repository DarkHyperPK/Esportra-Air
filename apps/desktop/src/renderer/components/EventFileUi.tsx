// Safe saves in the interface (27 Nov): Save event file… (event header), Open event file… (Events), the restore check,
// the backups list with Restore and the auto-backup folder (Settings), and the notice shown once when Air had to
// load a backup because its saved data could not be read.
import { useEffect, useState } from 'react';
import type { EventFileCheck, EventFileSaved } from '../../main/event-files.ts';
import type { Snapshot } from '../../shared/api.ts';
import type { Run } from '../App.tsx';
import { air } from '../bridge.ts';
import { useEscape } from './Dialogs.tsx';
import { Cap } from './ui.tsx';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const stamp = (ms: number) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const bytes = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);
const base = (path: string) => path.split(/[\\/]/).pop() ?? path;

export function countsText(c: EventFileCheck['counts']) {
  return [plural(c.matches, 'match', 'matches'), plural(c.lobbies, 'lobby', 'lobbies'), plural(c.results, 'result'), plural(c.teams, 'team'), plural(c.players, 'player'), plural(c.pictures, 'picture')].filter((x) => !x.startsWith('0 ')).join(' · ') || 'Nothing but the event itself';
}

function Modal({ label, close, children }: { label: string; close: () => void; children: React.ReactNode }) {
  const ref = useEscape(close);
  return (
    <div className="scrim center" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={label} ref={ref as never}>{children}</div>
    </div>
  );
}

/** In the event header: Save event file…, with what went into it afterwards. */
export function EventFileMenu({ eventId, run }: { eventId: string; run: Run }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<EventFileSaved | null>(null);
  const save = async () => {
    setOpen(false);
    setBusy(true);
    await run(async () => { setSaved(await air.eventExport(eventId)); });
    setBusy(false);
  };
  return (
    <span style={{ position: 'relative' }}>
      <button className="btn" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}>{busy ? 'Saving…' : 'Event file ▾'}</button>
      {open && (
        <div className="menu-pop" role="menu" aria-label="Event file" style={{ width: 300 }}>
          <button role="menuitem" onClick={() => void save()}><b>Save event file…</b><span className="muted t-xs">One file with this event, its lobbies or matches, results, teams, players and pictures. Keep it safe or open it on another PC.</span></button>
        </div>
      )}
      {saved && (
        <Modal label="Event file saved" close={() => setSaved(null)}>
          <Cap>Event file</Cap>
          <h2 className="title-md">Saved {base(saved.path)}</h2>
          <p className="muted t-sm">{countsText(saved.counts)} · {bytes(saved.bytes)}</p>
          <p className="faint t-xs" style={{ wordBreak: 'break-all' }}>{saved.path}</p>
          {saved.missingPictures > 0 && <p className="notice t-sm">{plural(saved.missingPictures, 'picture')} could not be read from the graphics engine and {saved.missingPictures === 1 ? 'is' : 'are'} not in the file.</p>}
          {saved.journalProblems.length > 0 && <p className="notice t-sm">The record of changes does not match the saved results: {saved.journalProblems[0]}{saved.journalProblems.length > 1 ? ` (and ${saved.journalProblems.length - 1} more)` : ''}. The results themselves are in the file.</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn primary" onClick={() => setSaved(null)}>Done</button></div>
        </Modal>
      )}
    </span>
  );
}

/** On Events: Open event file…, the restore check, and Replace or Add as a copy when the event is already here. */
export function OpenEventFile({ run }: { run: Run }) {
  const [check, setCheck] = useState<EventFileCheck | null>(null);
  const [mode, setMode] = useState<'copy' | 'replace'>('copy');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const choose = async () => {
    setDone(null);
    await run(async () => { const c = await air.eventImportOpen(); if (c) { setMode('copy'); setCheck(c); } });
  };
  const confirm = async () => {
    if (!check) return;
    setBusy(true);
    const ok = await run(async () => { const r = await air.eventImportConfirm(check.token, check.exists ? mode : 'copy'); setDone(r.name); });
    setBusy(false);
    if (ok) setCheck(null);
  };
  return (
    <>
      <button className="btn quiet" onClick={() => void choose()}>Open event file…</button>
      {done && <span className="notice info t-sm" role="status">{done} is on this PC. <button className="btn quiet small" onClick={() => setDone(null)}>OK</button></span>}
      {check && (
        <Modal label="Restore check" close={() => setCheck(null)}>
          <Cap>Restore check</Cap>
          <h2 className="title-md">{check.name}</h2>
          <p className="muted t-sm">Saved {check.exportedAt ? stamp(check.exportedAt) : 'at an unknown time'}. The file holds:</p>
          <div className="lst">
            {([['matches', 'Matches'], ['lobbies', 'Lobbies'], ['results', 'Results'], ['teams', 'Teams'], ['players', 'Players'], ['pictures', 'Pictures']] as const).map(([k, label]) => (
              <div key={k} className="li between"><span>{label}</span><b className="mono">{check.counts[k]}</b></div>
            ))}
          </div>
          {check.problems.length > 0 && <div className="notice t-sm" role="alert"><span>{check.problems.slice(0, 3).join(' ')}{check.problems.length > 3 ? ` (and ${check.problems.length - 3} more)` : ''}</span></div>}
          {check.exists ? (
            <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0 }}>
              <legend className="t-sm">This event is already on this PC{check.existing ? ` (${plural(check.existing.matches, 'match', 'matches')}, ${plural(check.existing.lobbies, 'lobby', 'lobbies')}, ${plural(check.existing.results, 'result')})` : ''}.</legend>
              <label className="row-gap"><input type="radio" name="mode" checked={mode === 'copy'} onChange={() => setMode('copy')} /><span><b>Add it as a copy</b><span className="muted t-xs"> Nothing here changes. The copy is named “{check.name} (copy)”.</span></span></label>
              <label className="row-gap"><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} /><span><b>Replace the event on this PC</b><span className="muted t-xs"> Its matches, lobbies and results here are swapped for the ones in the file.</span></span></label>
            </fieldset>
          ) : <p className="muted t-sm">It is not on this PC yet. Restoring adds it.</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn quiet" onClick={() => setCheck(null)}>Cancel</button>
            <button className={`btn ${check.exists && mode === 'replace' ? 'danger-solid' : 'primary'}`} disabled={busy} onClick={() => void confirm()}>{busy ? 'Restoring…' : check.exists && mode === 'replace' ? 'Replace event' : check.exists ? 'Add copy' : 'Restore'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Settings › Backups: the saved copies of Air's data with Restore, and the auto-backup folder. */
export function BackupsPanel({ s, run }: { s: Snapshot; run: Run }) {
  const [list, setList] = useState<Array<{ name: string; at: number; bytes: number }>>([]);
  const [ask, setAsk] = useState<string | null>(null);
  const [now, setNow] = useState<string | null>(null);
  const load = () => air.backupList().then(setList).catch(() => {});
  useEffect(() => { void load(); const t = setInterval(() => void load(), 20_000); return () => clearInterval(t); }, []);
  const auto = s.autoBackup;
  return (
    <section className="panel" aria-label="Backups">
      <div className="head"><Cap>Backups</Cap><span className="faint t-xs">{plural(list.length, 'saved copy', 'saved copies')}</span></div>
      <div className="body-pad stack" style={{ gap: 12 }}>
        <p className="muted t-sm">Air keeps a copy of everything it has saved at least every 30 seconds: the last 20, and one for each of the last 30 days. If Air’s data ever cannot be read, it loads the newest copy by itself.</p>
        <div className="lst" style={{ maxHeight: 280, overflow: 'auto' }}>
          {list.map((b, i) => (
            <div key={b.name} className="li between">
              <span><b>{stamp(b.at)}</b> <span className="faint t-xs">{i === 0 ? 'newest · ' : ''}{bytes(b.bytes)}</span></span>
              {ask === b.name ? (
                <span className="row-gap confirm" role="group" aria-label="Restore this copy?">
                  <span className="t-sm">Restore this copy? Air saves what it has now first.</span>
                  <button className="btn small danger-solid" onClick={async () => { setAsk(null); await run(() => air.backupRestore(b.name)); void load(); }}>Restore</button>
                  <button className="btn quiet small" onClick={() => setAsk(null)}>Keep what I have</button>
                </span>
              ) : <button className="btn quiet small" disabled={!!s.gameLocked || s.feed.state === 'live'} title={s.gameLocked ? 'Stop game data or the test first' : undefined} onClick={() => setAsk(b.name)}>Restore…</button>}
            </div>
          ))}
          {!list.length && <p className="muted ap-empty">No copies yet. The first one is made at the next change.</p>}
        </div>
        {s.gameLocked && <p className="faint t-xs">Game data or a test is running, so backups cannot be restored now.</p>}
        <div className="stack" style={{ gap: 8 }}>
          <b>Auto-backup folder</b>
          <p className="muted t-sm">After each change, Air writes the event you are working in to this folder as an event file, a few seconds later. Choose a folder on another drive or in a synced folder (OneDrive, Dropbox) to be safe if this PC fails. Nothing is sent anywhere else.</p>
          {auto.folder ? (
            <div className="between">
              <span><span className="mono t-sm" style={{ wordBreak: 'break-all' }}>{auto.folder}</span>
                <span className="faint t-xs" style={{ display: 'block' }}>{auto.error ? `Could not write: ${auto.error}` : auto.lastAt ? `Last written ${stamp(auto.lastAt)}${auto.file ? ` · ${base(auto.file)}` : ''}` : 'Nothing written yet'}</span></span>
              <span className="row-gap">
                <button className="btn small" onClick={async () => { await run(async () => { const f = await air.autoBackupNow(); setNow(f ? `Wrote ${base(f)}` : 'Open an event or lobby first.'); }); }}>Back up now</button>
                <button className="btn quiet small" onClick={() => void run(() => air.autoBackupChoose())}>Change…</button>
                <button className="btn quiet small" onClick={() => void run(() => air.autoBackupOff())}>Turn off</button>
              </span>
            </div>
          ) : <div><button className="btn" onClick={() => void run(() => air.autoBackupChoose())}>Choose folder…</button> <span className="faint t-xs">Off</span></div>}
          {now && <p className="faint t-xs" role="status">{now}</p>}
        </div>
      </div>
    </section>
  );
}

/** Shown once when Air could not read its saved data on start. */
export function RecoveredNotice({ s, run }: { s: Snapshot; run: Run }) {
  const r = s.recovered;
  if (!r) return null;
  return (
    <div className={`notice ${r.from ? '' : 'bad'}`} role="alert" style={{ margin: '12px 24px 0' }}>
      <span className="grow">
        {r.from
          ? `Air could not read its saved data, so it loaded the backup from ${stamp(r.fromAt ?? r.at)}. Changes since that copy are not in it.`
          : 'Air could not read its saved data and found no backup, so it started empty.'}
        {' '}The damaged file is kept as {base(r.brokenFile)} next to it. Settings › Backups lists the other copies.
      </span>
      <button className="btn quiet small" onClick={() => void run(() => air.recoveredDismiss())}>Dismiss</button>
    </div>
  );
}
