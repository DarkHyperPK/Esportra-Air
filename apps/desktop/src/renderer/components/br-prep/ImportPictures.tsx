// Pictures · optional (28 Nov, approved mock): a logo by team name or tag and a photo by the player's in-game name, from a
// folder and the folders inside it. A picture used by several players is not a photo of anyone.
import { useState } from 'react';
import type { PictureScan } from '../../../main/sheet-import.ts';
import type { ImportPreview } from '../../../shared/sheet-import.ts';

export function ImportPictures({ preview, scan, busy, error, choose, typed, useShared, setUseShared, pick }: {
  preview: ImportPreview; scan: PictureScan | null; busy: boolean; error: string; choose: () => void; typed: (folder: string) => void;
  useShared: boolean; setUseShared: (v: boolean) => void; pick: (teamKey: string, fileId: string) => void;
}) {
  const [path, setPath] = useState('');
  const team = (key: string) => preview.teams.find((t) => t.key === key);
  const player = (key: string) => { for (const t of preview.teams) { const p = t.players.find((x) => x.key === key); if (p) return { p, t }; } return null; };
  const sharedPlayers = scan ? scan.shared.reduce((n, x) => n + x.keys.length, 0) : 0;
  return (
    <section className="card body-pad stack g-3 pp-pics" aria-label="Pictures">
      <div className="between"><span className="cap">Pictures · optional</span>
        <span className="row g-2">{scan && <span className="mono faint t-xs" title={scan.folder}>{scan.folder}</span>}<button className="btn" disabled={busy} onClick={choose}>{scan ? 'Choose another folder' : 'Choose a folder'}</button></span></div>
      <p className="muted t-sm">Air looks for a logo by team name or tag, and a photo by the player’s in-game name, in the folder and the folders inside it. A file name in the list’s logo or photo column is tried first. Only PNG and JPEG.</p>
      <details className="faint t-xs"><summary>Type the folder’s path instead</summary>
        <form className="row g-2" style={{ marginTop: 6 }} onSubmit={(e) => { e.preventDefault(); if (path.trim()) typed(path.trim()); }}>
          <input className="cell mono" aria-label="Pictures folder path" value={path} onChange={(e) => setPath(e.target.value)} placeholder="D:\Spring Clash\media" style={{ flex: 1 }} /><button className="btn small" disabled={!path.trim() || busy}>Look here</button></form></details>
      {error && <div className="notice bad" role="alert">{error}</div>}
      {scan && (
        <>
          <div className="pp-stats">
            <div className={`pp-stat ${scan.logos.found === scan.logos.of ? 'ok' : 'warn'}`}><b className="mono">{scan.logos.found} / {scan.logos.of}</b><span>logos matched by team name or tag</span></div>
            <div className={`pp-stat ${scan.photos.found === scan.photos.of ? 'ok' : 'warn'}`}><b className="mono">{scan.photos.found} / {scan.photos.of}</b><span>photos matched by IGN</span></div>
            {sharedPlayers > 0 && <div className="pp-stat warn"><b className="mono">{sharedPlayers}</b><span>players share one picture</span></div>}
          </div>
          {scan.shared.map((x) => (
            <div key={x.file} className="notice" role="status"><span><b>{x.keys.length} players share one picture</b> (<span className="mono">{x.file}</span>). {useShared ? 'It is kept for each of them.' : 'Treated as no photo, so the graphics show the grey player shadow instead of one face on every player.'}</span>
              <button className="btn small" onClick={() => setUseShared(!useShared)}>{useShared ? 'Treat as no photo' : 'Use it anyway'}</button></div>
          ))}
          {scan.skipped.length > 0 && <p className="faint t-xs">Left out: {scan.skipped.slice(0, 3).join('; ')}{scan.skipped.length > 3 ? ` and ${scan.skipped.length - 3} more` : ''}.</p>}
          <div className="pp-two">
            <div><span className="cap">Logo not found · {scan.unmatchedLogos.length}</span>
              {scan.unmatchedLogos.map((u) => <div key={u.key} className="pp-miss"><span><b>{team(u.key)?.name}</b> <span className="faint">{team(u.key)?.tag}</span>{u.closest && <><br /><span className="faint t-xs">Closest file: <span className="mono">{u.closest}</span></span></>}</span>{u.closestId && <button className="btn small" onClick={() => pick(u.key, u.closestId!)}>Use that file</button>}</div>)}
              {!scan.unmatchedLogos.length && <p className="muted t-sm">Every team has a logo.</p>}</div>
            <div><span className="cap">Photo not found · {scan.unmatchedPhotos.length}</span>
              {scan.unmatchedPhotos.slice(0, 12).map((k) => <div key={k} className="pp-miss"><span>{player(k)?.p.ign} <span className="faint">· {player(k)?.t.name}</span></span></div>)}
              {scan.unmatchedPhotos.length > 12 && <p className="faint t-xs">and {scan.unmatchedPhotos.length - 12} more. Players without a photo show the grey shadow.</p>}
              {!scan.unmatchedPhotos.length && <p className="muted t-sm">Every player has a photo.</p>}</div>
          </div>
        </>
      )}
    </section>
  );
}
