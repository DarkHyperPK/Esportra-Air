// Import teams and players (28 Nov, approved mock "Import teams and players"): drop or paste a list, check how Air read
// its columns, look at what will be imported with its checks, add pictures from a folder, and import. Nothing is saved
// until Import is pressed, and it can be run again for another group.
//
// Air reads CSV and pasted cells. A .xlsx file is not read (it is a zip of XML and a reader is not worth a new
// dependency): the screen asks for a CSV export or the cells pasted.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ImportInput, ImportResult, PictureScan } from '../../../main/sheet-import.ts';
import type { Lobby, Snapshot } from '../../../shared/api.ts';
import { FIELDS, buildImport, guessColumns, readSheet, type Field, type Mapping } from '../../../shared/sheet-import.ts';
import { air } from '../../bridge.ts';
import type { Run } from '../../App.tsx';
import { ImportPictures } from './ImportPictures.tsx';
import { ImportTable } from './ImportTable.tsx';

const SHEET_FILE = /\.(xlsx|xlsm|xls|ods|numbers)$/i;

export function SheetImport({ s, run, eventId, lobby, back }: { s: Snapshot; run: Run; eventId: string; lobby: Lobby | null; back: () => void }) {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [header, setHeader] = useState<boolean | undefined>(undefined);
  const [map, setMap] = useState<Mapping | null>(null);
  const [note, setNote] = useState('');
  const [scan, setScan] = useState<PictureScan | null>(null);
  const [scanError, setScanError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [useShared, setUseShared] = useState(false);
  const [target, setTarget] = useState<string>(lobby ? `lobby:${lobby.id}` : 'none');
  const [result, setResult] = useState<ImportResult | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const lobbies = s.lobbies.filter((l) => l.eventId === eventId);

  const sheet = useMemo(() => (text.trim() ? readSheet(text, header) : null), [text, header]);
  const columns = map ?? (sheet ? guessColumns(sheet.headers) : null);
  const preview = useMemo(() => (sheet && columns ? buildImport(sheet, columns, s.library) : null), [sheet, columns, s.library]);
  const wanted = useMemo(() => preview ? ({
    teams: preview.teams.map((t) => ({ key: t.key, name: t.name, tag: t.tag, hint: t.logoHint })),
    players: preview.teams.flatMap((t) => t.players.map((p) => ({ key: p.key, team: t.name, ign: p.ign, hint: p.photoHint }))),
  }) : null, [preview]);

  const load = (t: string, name: string) => { setText(t); setFileName(name); setMap(null); setHeader(undefined); setNote(''); setScan(null); setPicks({}); };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (SHEET_FILE.test(f.name)) { setNote(`Air reads CSV and pasted cells, not ${f.name.split('.').pop()!.toLowerCase()} files. In your spreadsheet choose File › Save as (or Download) › CSV and drop that file here, or select the cells, copy them and paste them below.`); return; }
    if (f.size > 5_000_000) { setNote('That file is larger than 5 MB. A list of teams and players is much smaller; check you chose the right file.'); return; }
    load(await f.text(), f.name);
  };
  // Looks the pictures up again whenever the list, a chosen file or "use it anyway" changes.
  const look = async (input: { folder?: string | null; token?: string | null }) => {
    if (!wanted) return;
    setBusy(true); setScanError('');
    try {
      const r = await air.sheetPictures({ ...input, wanted, picks, useShared });
      if (r) setScan(r);
    } catch (e) { setScanError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const wantedKey = JSON.stringify(wanted);
  useEffect(() => { if (scan) void look({ token: scan.token }); }, [wantedKey, JSON.stringify(picks), useShared]);

  const logos = scan && preview ? new Set(Object.keys(scan.logoFiles)) : null;
  const photos = scan ? new Set(Object.keys(scan.photoFiles)) : null;
  const go = async () => {
    if (!preview || preview.blocked) return;
    const input: ImportInput = {
      teams: preview.teams.map((t) => ({ key: t.key, name: t.name, tag: t.tag, group: t.group, logoHint: t.logoHint, players: t.players.map((p) => ({ key: p.key, ign: p.ign, uid: p.uid, role: p.role, photoHint: p.photoHint })) })),
      target: target === 'none' ? { kind: 'none' } : target === 'groups' ? { kind: 'groups', eventId } : { kind: 'lobby', id: target.slice(6) },
      pictures: scan ? { token: scan.token, picks, useShared } : null,
    };
    await run(async () => { setResult(await air.sheetImport(input)); });
  };

  if (result) {
    return (
      <div className="stack" style={{ gap: 14 }}>
        <nav className="crumb-back"><button className="btn quiet small" onClick={back}>← {lobby ? lobby.title : 'Lobbies'}</button></nav>
        <section className="card body-pad stack g-2" aria-live="polite">
          <h2 className="title-md">Imported</h2>
          <p>{result.teams.created} new and {result.teams.updated} updated teams · {result.players.created} new and {result.players.updated} updated players{result.pictures.logos + result.pictures.photos ? ` · ${result.pictures.logos} logos and ${result.pictures.photos} photos` : ''}{result.lobbies.length ? ` · in ${[...new Set(result.lobbies)].join(', ')}` : ''}.</p>
          {result.problems.length > 0 && <div className="notice" role="status"><span><b>Not done</b><br />{result.problems.slice(0, 8).map((p) => <span key={p}>{p}<br /></span>)}{result.problems.length > 8 ? `and ${result.problems.length - 8} more.` : ''}</span></div>}
          <div className="row g-2"><button className="btn primary" onClick={back}>Done</button><button className="btn" onClick={() => { setResult(null); load('', ''); }}>Import another list</button></div>
        </section>
      </div>
    );
  }
  const chosen = preview && !preview.blocked;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <nav className="crumb-back"><button className="btn quiet small" onClick={back}>← {lobby ? lobby.title : 'Lobbies'}</button></nav>
      <header><h1 className="title-lg">Import teams and players</h1><p className="muted">Nothing is saved until you press Import. You can run this again for another group.</p></header>
      <div className="pp-two">
        <section className="card body-pad stack g-2" aria-label="Your list">
          <span className="cap">Your list</span>
          <div className="pp-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void onFile(e.dataTransfer.files[0]); }}>
            <b>Drop a file here, or paste the cells</b>
            <span className="faint t-xs">.csv, or cells copied straight from your sheet</span>
            <textarea className="cell mono" aria-label="Paste the list here" rows={sheet ? 2 : 5} placeholder="Paste here (Ctrl V)…" value={text} onChange={(e) => load(e.target.value, '')} spellCheck={false} />
            <button className="btn small" onClick={() => file.current?.click()}>Choose a file</button>
            <input ref={file} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" hidden aria-label="Choose a list file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {note && <div className="notice" role="status">{note}</div>}
          {sheet && (
            <>
              <div className="scroll-x pp-sample"><table className="lb-tbl"><thead><tr>{sheet.headers.map((h, i) => <th key={i}>{h || '·'}</th>)}</tr></thead>
                <tbody>{sheet.rows.slice(0, 6).map((r, i) => <tr key={i}>{sheet.headers.map((_, j) => <td key={j}>{r[j] ?? ''}</td>)}</tr>)}</tbody></table></div>
              <div className="between t-sm"><span className="muted">{sheet.rows.length + (sheet.hasHeader ? 1 : 0)} lines · {sheet.headers.length} columns{fileName ? ` · ${fileName}` : ''}</span>
                <span className="row g-2"><label className="row g-1"><input type="checkbox" checked={sheet.hasHeader} onChange={(e) => { setHeader(e.target.checked); setMap(null); }} /> Line 1 is the header</label><button className="btn quiet small" onClick={() => load('', '')}>Replace</button></span></div>
            </>
          )}
        </section>
        <section className="card body-pad stack g-2" aria-label="Columns">
          <div className="between"><span className="cap">Columns</span>{columns && <span className={`chip ${columns.team !== null && columns.ign !== null ? 'ok' : 'warn'}`}>{Object.values(columns).filter((v) => v !== null).length} of {FIELDS.length} found</span>}</div>
          {!sheet && <p className="muted t-sm">Air matches your headers to its fields, and you can change any that look wrong. Logo and photo columns are optional; the pictures step can also use a folder.</p>}
          {sheet && columns && (
            <div className="pp-cols">
              {FIELDS.map((f) => (
                <label key={f.id} className="pp-col"><small className="cap">{f.label}</small>
                  <select className="cell" aria-label={`Column for ${f.label}`} value={columns[f.id] ?? ''} onChange={(e) => setMap({ ...columns, [f.id]: e.target.value === '' ? null : Number(e.target.value) } as Mapping)}>
                    <option value="">{f.optional ? 'Not in my list' : 'Choose…'}</option>
                    {sheet.headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                  <small className={columns[f.id] !== null ? 'ok-text' : f.optional ? 'faint' : 'warn-text'}>{columns[f.id] !== null ? '✓ Found it' : f.optional ? 'Optional' : 'Choose the column'}</small></label>
              ))}
            </div>
          )}
          <p className="faint t-xs">Roles Air knows: IGL, Player, Sub, Coach. Coaches are kept in the team but not counted as players. A UID is the game’s Character ID, digits only. A team’s name may be left blank on the lines under its first line.</p>
        </section>
      </div>
      {preview?.blocked && <div className="notice" role="status">{preview.blocked}</div>}
      {preview && preview.skipped.length > 0 && <div className="notice" role="status"><span>{preview.skipped.length} line{preview.skipped.length === 1 ? '' : 's'} left out: {preview.skipped.slice(0, 3).map((x) => `line ${x.line} (${x.reason})`).join(', ')}{preview.skipped.length > 3 ? '…' : ''}</span></div>}
      {chosen && <ImportTable preview={preview} logos={logos} photos={photos} />}
      {chosen && <ImportPictures preview={preview} scan={scan} busy={busy} error={scanError} choose={() => void look({ folder: null })} typed={(folder) => void look({ folder })} useShared={useShared} setUseShared={setUseShared} pick={(k, id) => setPicks((p) => ({ ...p, [k]: id }))} />}
      {chosen && (
        <footer className="card body-pad pp-foot">
          <span><b>{preview.counts.all} teams, {preview.players} players.</b> <span className="muted">{preview.counts.added} new, {preview.counts.updates} update the library. {preview.counts.needs ? `${preview.counts.needs} thing${preview.counts.needs === 1 ? '' : 's'} to look at will wait under Needs you on the roster.` : 'Nothing to look at.'}</span></span>
          <span className="row g-2">
            <label className="row g-1 t-sm"><span className="muted">Then</span>
              <select className="cell" aria-label="After importing" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="none">Only save to Teams/Players</option>
                {lobbies.map((l) => <option key={l.id} value={`lobby:${l.id}`}>Add to {l.title}</option>)}
                <option value="groups">A lobby for each group</option>
              </select></label>
            <button className="btn quiet" onClick={back}>Cancel</button>
            <button className="btn primary" onClick={() => void go()}>Import {preview.counts.all} teams, {preview.players} players</button>
          </span>
        </footer>
      )}
    </div>
  );
}
